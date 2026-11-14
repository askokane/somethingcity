// Breach City live checker server. Run: node checker/server.js
// Env (all optional; see README): GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, RESEND_API_KEY, EMAIL_FROM, DATABASE_URL, FRONTEND_URL, PORT
import http from "node:http";
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { accountId, lookupDomains, maskEmail, normalizeEmail, toAccounts } from "./checker.js";
import { checkXon, getCatalog, scanInbox } from "./sources.js";
import { news, personalTimeline, serviceBreaches, timeline } from "./db.js";

const PORT = Number(process.env.PORT) || 8787;
// Deployed (see DEPLOY.md): PUBLIC_URL=https://your-domain, with Caddy serving the frontend and proxying here on the same origin.
const PUBLIC_URL = (process.env.PUBLIC_URL || "").replace(/\/$/, "");
const FRONTEND_URL = process.env.FRONTEND_URL || PUBLIC_URL || "http://localhost:5173";
const REDIRECT_URI = `${PUBLIC_URL || `http://localhost:${PORT}`}/auth/google/callback`;
const SECURE = PUBLIC_URL.startsWith("https://"); // cookies only over HTTPS once deployed
const DEV_PAGE_ON = !PUBLIC_URL || process.env.DEV_PAGE === "1"; // /dev is a local test page, off on a public server
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const MIN = 60e3;

// ponytail: in-memory state, single process, wiped on restart. Fine for a demo; use Redis/DB if it ever runs on >1 server.
const codes = new Map(); // email -> { hash, expires, tries, sentAt }
const sessions = new Map(); // token -> { email, inbox, expires }
const oauthStates = new Map(); // state -> expires

const sha = (s) => createHash("sha256").update(s).digest();
const json = (res, status, body, headers = {}) => res.writeHead(status, { "content-type": "application/json", ...headers }).end(JSON.stringify(body));
const cookie = (name, value, maxAge) => `${name}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${SECURE ? "; Secure" : ""}`;

// Per-IP rate limits for the endpoints a stranger could abuse on a public server (code emails, Gemini quota).
// Behind Caddy every request comes from loopback, so trust X-Forwarded-For only then.
// ponytail: in-memory fixed windows, single process; fine for a demo server.
const hits = new Map(); // "bucket:ip" -> { count, resetAt }
function clientIp(req) {
  const remote = req.socket.remoteAddress ?? "";
  const loopback = remote === "::1" || remote.startsWith("127.") || remote === "::ffff:127.0.0.1";
  return (loopback && req.headers["x-forwarded-for"]?.split(",")[0].trim()) || remote;
}
function limited(req, bucket, max, windowMs) {
  const key = `${bucket}:${clientIp(req)}`;
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.resetAt < now) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  return ++h.count > max;
}
const readCookie = (req, name) => req.headers.cookie?.match(new RegExp(`(?:^|; )${name}=([^;]+)`))?.[1];

function getSession(req) {
  const s = sessions.get(readCookie(req, "bc_session"));
  return s && s.expires > Date.now() ? s : null;
}

function startSession(email, inbox = null) {
  const token = randomBytes(32).toString("hex");
  sessions.set(token, { email, inbox, expires: Date.now() + 60 * MIN });
  return cookie("bc_session", token, 3600);
}

// --- Email code: proves the person owns the address before we look it up ---

async function sendCode(email, code) {
  if (!process.env.RESEND_API_KEY) {
    console.log(`[dev] verification code for ${maskEmail(email)}: ${code}`); // no email service configured
    return "console";
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || "Breach City <onboarding@resend.dev>",
      to: [email],
      subject: `Your Breach City code: ${code}`,
      text: `Your Breach City verification code is ${code}. It expires in 10 minutes. If you didn't ask for this, ignore this email.`,
    }),
    signal: AbortSignal.timeout(10000),
  });
  console.log(`resend ${res.status}`);
  if (!res.ok) throw new Error("send failed");
  return "email";
}

async function verifyStart(email) {
  const prev = codes.get(email);
  if (prev && Date.now() - prev.sentAt < MIN) return [429, { error: "Wait a minute before asking for another code." }];
  const code = String(randomInt(0, 1e6)).padStart(6, "0");
  codes.set(email, { hash: sha(code), expires: Date.now() + 10 * MIN, tries: 0, sentAt: Date.now() });
  try {
    return [200, { sent: await sendCode(email, code) }];
  } catch {
    codes.delete(email);
    return [502, { error: "Couldn't send the code. Try again shortly." }];
  }
}

function verifyConfirm(email, code) {
  const entry = codes.get(email);
  if (!entry || entry.expires < Date.now()) return [400, { error: "Code expired. Ask for a new one." }];
  if (++entry.tries > 5) {
    codes.delete(email);
    return [429, { error: "Too many tries. Ask for a new code." }];
  }
  if (!timingSafeEqual(entry.hash, sha(String(code ?? "").trim()))) return [400, { error: "That code doesn't match." }];
  codes.delete(email);
  return [200, { ok: true }, { "set-cookie": startSession(email) }];
}

// --- Google sign-in: proves ownership of a Gmail address and lets us scan its inbox (read-only, once) ---

function googleStart(res) {
  if (!process.env.GOOGLE_CLIENT_ID) return json(res, 503, { error: "Google sign-in isn't configured." });
  const state = randomBytes(16).toString("hex");
  oauthStates.set(state, Date.now() + 10 * MIN);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "openid email https://www.googleapis.com/auth/gmail.readonly",
    access_type: "online",
    prompt: "consent",
    state,
  });
  res.writeHead(302, { location: url.href, "set-cookie": cookie("bc_oauth", state, 600) }).end();
}

async function googleCallback(req, res) {
  const back = (result, headers = {}) => res.writeHead(302, { location: `${FRONTEND_URL}/?signin=${result}`, ...headers });
  const params = new URL(req.url, "http://localhost").searchParams;
  const state = params.get("state");
  const valid = state && state === readCookie(req, "bc_oauth") && oauthStates.get(state) > Date.now();
  oauthStates.delete(state);
  if (!valid || !params.get("code")) return back("failed").end();

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      code: params.get("code"),
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(10000),
  }).catch(() => null);
  const tokens = tokenRes?.ok ? await tokenRes.json() : null;
  if (!tokens?.id_token) return back("failed").end();

  // Straight from Google's token endpoint over TLS, so the signature check can be skipped (OIDC Core 3.1.3.7).
  const claims = JSON.parse(Buffer.from(tokens.id_token.split(".")[1], "base64url").toString());
  const email = normalizeEmail(claims.email);
  if (claims.aud !== process.env.GOOGLE_CLIENT_ID || !claims.email_verified || !email) return back("failed").end();

  // The user can untick Gmail access on the consent screen; then we only have the verified email.
  let inbox = null;
  let why = "skipped: Gmail access not granted";
  if (tokens.scope?.includes("gmail.readonly")) inbox = await scanInbox(tokens.access_token).catch((e) => ((why = `failed: ${e.message}`), null));
  console.log(`google sign-in ${maskEmail(email)}: inbox scan ${inbox ? `found ${inbox.length} services` : why}`);
  fetch(`https://oauth2.googleapis.com/revoke?token=${tokens.access_token}`, { method: "POST" }).catch(() => {}); // one scan, then let go

  back(inbox ? "ok" : "no-inbox", { "set-cookie": [startSession(email, inbox), cookie("bc_oauth", "", 0)] }).end();
}

// --- Dev test page: sign in with Google and list linked accounts, no frontend needed ---
// Set FRONTEND_URL=http://localhost:8787/dev to land here after Google sign-in.
const DEV_PAGE = `<!doctype html><meta charset="utf-8"><title>Breach City checker</title>
<body style="font:14px ui-monospace,monospace;max-width:900px;margin:2rem auto;padding:0 1rem">
<h1 style="font-size:18px">Breach City checker (dev)</h1>
<p><a href="/auth/google">Sign in with Google</a> · <a href="#" id="logout">Sign out</a></p>
<pre id="out">Checking…</pre>
<script type="module">
const post = (p) => fetch(p, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
document.getElementById("logout").onclick = async (e) => { e.preventDefault(); await post("/api/logout"); location.href = "/dev"; };
const r = await post("/api/check").then((x) => x.json());
document.getElementById("out").textContent = r.status
  ? \`\${r.label}: \${r.status} (\${r.source})\${r.error ? " - " + r.error : ""}\\n\${r.accounts.length} linked accounts, \${r.accounts.filter((a) => a.breached).length} with your data breached, \${r.accounts.filter((a) => !a.breached && a.serviceBreaches?.length).length} more on breached services\\n\\n\` +
    r.accounts.map((a) => \`\${a.breached ? "BREACHED" : a.serviceBreaches?.length ? "SERVICE " : "ok      "}  \${a.name.slice(0, 28).padEnd(28)} \${a.domain.padEnd(26)} \${a.foundIn.join("+").padEnd(13)} \${(a.firstSeen ?? "").padEnd(11)} \${(a.serviceBreaches ?? []).map((b) => b.name + " " + b.date.slice(0, 4)).join(", ")}\`).join("\\n")
  : (r.error ?? "Not signed in.");
</script>`;

// --- Gemini: plain-English "what this means for you" for one breach (Gemini prize) ---
// Sends only public breach metadata (service, date, data types). Never an email, account list or inbox content.
const explainCache = new Map(); // ponytail: unbounded, but keyed by public breach metadata (a few hundred at most)

async function explain(body) {
  const { name, date = null, exposedData = [], mine = true } = body;
  const okText = (s, max) => typeof s === "string" && s.length > 0 && s.length <= max;
  if (!okText(name, 100) || (date !== null && !okText(date, 20)) || !Array.isArray(exposedData) || exposedData.length > 30 ||
      !exposedData.every((d) => okText(d, 60)) || typeof mine !== "boolean") return [400, { error: "Bad breach details." }];
  if (!process.env.GEMINI_API_KEY) return [503, { error: "Explanations aren't configured." }];

  const key = JSON.stringify([name, date, exposedData, mine]);
  if (explainCache.has(key)) return [200, explainCache.get(key)];
  const prompt = `Explain this data breach to a non-technical person, calmly and without hype.
Service: ${name}
Breach date: ${date ?? "unknown"}
Data types exposed: ${exposedData.join(", ") || "unknown"}
${mine ? "Their email address was found in this breach." : "The service was breached, but their email address was NOT found in the leaked data. Do not say their data leaked."}
Return JSON: "summary" (2-3 sentences: what happened and what it means for them) and "steps" (3-5 short, concrete actions, most important first). No markdown.`;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL || "gemini-2.5-flash"}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: { type: "OBJECT", properties: { summary: { type: "STRING" }, steps: { type: "ARRAY", items: { type: "STRING" } } }, required: ["summary", "steps"] },
      },
    }),
    signal: AbortSignal.timeout(20000),
  }).catch(() => null);
  console.log(`gemini ${res?.status ?? "no response"}`);
  try {
    const out = JSON.parse((await res.json()).candidates[0].content.parts[0].text);
    if (typeof out.summary !== "string" || !Array.isArray(out.steps)) throw new Error();
    const result = { summary: out.summary, steps: out.steps.map(String).slice(0, 6), source: "Gemini" };
    explainCache.set(key, result);
    return [200, result];
  } catch {
    return [502, { error: "Explanation unavailable right now." }]; // frontend falls back to nextSteps()
  }
}

// --- Service logos for building signs ---
// Proxied so the browser never asks xposedornot.com for "the logos of this user's accounts" (that list is personal).
// Only catalog logo URLs on xposedornot.com are fetched, looked up by breach id, so this can't fetch arbitrary URLs.
const logoCache = new Map(); // breach id -> { type, body }; ponytail: ~800 logos max at ~2 KB each
async function logo(req, res) {
  const id = new URL(req.url, "http://localhost").searchParams.get("breach");
  let hit = logoCache.get(id);
  if (!hit) {
    const url = (await getCatalog().catch(() => [])).find((b) => b.breachID === id)?.logo;
    if (!url || new URL(url).host !== "xposedornot.com") return res.writeHead(404).end();
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) }).catch(() => null);
    const type = r?.headers.get("content-type") ?? "";
    if (!r?.ok || !type.startsWith("image/")) return res.writeHead(404).end();
    hit = { type, body: Buffer.from(await r.arrayBuffer()) };
    logoCache.set(id, hit);
  }
  res.writeHead(200, { "content-type": hit.type, "cache-control": "public, max-age=86400" }).end(hit.body);
}

// --- Live check for the signed-in email ---

async function check(req, body) {
  const session = getSession(req);
  const email = body.email === undefined ? session?.email : normalizeEmail(body.email);
  if (!session || email !== session.email) return [401, { error: "Verify this email first." }];
  const result = await checkXon(email);
  const inbox = session.inbox ?? [];
  const domains = lookupDomains([...inbox.map((a) => a.domain), ...result.breaches.map((b) => b.domain).filter(Boolean)]);
  const serviceMap = await serviceBreaches(domains).catch(() => new Map()); // Tiger Data join; never blocks the check
  return [200, { id: await accountId(email), label: maskEmail(email), ...result, accounts: toAccounts(result.breaches, inbox, serviceMap) }];
}

export const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (origin && LOCAL_ORIGIN.test(origin)) {
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("access-control-allow-credentials", "true");
    res.setHeader("access-control-allow-headers", "content-type");
  }
  if (req.method === "OPTIONS") return res.writeHead(204).end();
  const path = req.url.split("?")[0];

  try {
    if (req.method === "GET" && path.startsWith("/dev") && DEV_PAGE_ON) return res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(DEV_PAGE);
    if (req.method === "GET" && path === "/auth/google") return googleStart(res);
    if (req.method === "GET" && path === "/auth/google/callback") return await googleCallback(req, res);
    if (req.method === "GET" && path === "/api/timeline") {
      const rows = await timeline().catch(() => null);
      return rows ? json(res, 200, rows) : json(res, 503, { error: "Timeline unavailable." });
    }
    if (req.method === "GET" && path === "/api/logo") return await logo(req, res);
    if (req.method === "GET" && path === "/api/news") {
      const limit = new URL(req.url, "http://localhost").searchParams.get("limit");
      const n = await news(limit ?? 10).catch(() => null);
      return n ? json(res, 200, n) : json(res, 503, { error: "Breach news unavailable." });
    }
    if (req.method !== "POST") return res.writeHead(404).end();
    // JSON only: forces a CORS preflight, so other sites can't post here from a plain form.
    if (!req.headers["content-type"]?.startsWith("application/json")) return res.writeHead(415).end();

    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 32 * 1024) return res.writeHead(413).end(); // fits ~500 domains for /api/timeline/mine
    }
    let body = {};
    try { body = JSON.parse(raw || "{}"); } catch {}

    if (path === "/api/logout") {
      sessions.delete(readCookie(req, "bc_session"));
      return json(res, 200, { ok: true }, { "set-cookie": cookie("bc_session", "", 0) });
    }
    if (path === "/api/check") return json(res, ...(await check(req, body)));
    if (path === "/api/explain") {
      if (limited(req, "explain", 30, 60 * 60e3)) return json(res, 429, { error: "Too many requests. Try again later." });
      return json(res, ...(await explain(body)));
    }
    if (path === "/api/timeline/mine") {
      // POST, not GET: a list of someone's account domains shouldn't sit in URLs or access logs.
      const domains = body.domains;
      if (!Array.isArray(domains) || domains.length > 500 || !domains.every((d) => typeof d === "string" && /^[a-z0-9.-]{3,100}$/.test(d))) {
        return json(res, 400, { error: "Send { domains: [\"adobe.com\", ...] }." });
      }
      const rows = await personalTimeline(domains).catch(() => null);
      return rows ? json(res, 200, rows) : json(res, 503, { error: "Timeline unavailable." });
    }

    const email = normalizeEmail(body.email);
    if (!email) return json(res, 400, { error: "Enter a valid email address." });
    if (path === "/api/verify/start") {
      // Per email is already 1/minute; per IP stops one visitor from mailing codes to many addresses.
      if (limited(req, "codes", 10, 60 * 60e3)) return json(res, 429, { error: "Too many codes requested. Try again later." });
      return json(res, ...(await verifyStart(email)));
    }
    if (path === "/api/verify/confirm") return json(res, ...verifyConfirm(email, body.code));
    res.writeHead(404).end();
  } catch {
    if (!res.headersSent) json(res, 500, { error: "Something went wrong." }); // no details: they could contain user data
  }
});

if (import.meta.main) {
  server.listen(PORT, "localhost", () => {
    console.log(`Breach City checker on http://localhost:${PORT}${PUBLIC_URL ? ` (public: ${PUBLIC_URL}, /dev ${DEV_PAGE_ON ? "on" : "off"})` : ""}`);
    console.log(`  email codes: ${process.env.RESEND_API_KEY ? "sent with Resend" : "printed here (no RESEND_API_KEY)"}`);
    console.log(`  Google sign-in + inbox scan: ${process.env.GOOGLE_CLIENT_ID ? "on" : "off (no GOOGLE_CLIENT_ID)"}`);
    console.log(`  Tiger Data timeline + service breaches: ${process.env.DATABASE_URL ? "on" : "off (no DATABASE_URL; using in-memory catalog)"}`);
    console.log(`  Gemini explanations: ${process.env.GEMINI_API_KEY ? "on" : "off (no GEMINI_API_KEY; frontend uses nextSteps())"}`);
  });
}
