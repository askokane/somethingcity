// Server-side data sources: XposedOrNot breaches and the Gmail inbox scan.
import { baseDomain } from "./checker.js";

const XON = "https://api.xposedornot.com/v1";
export const XON_SOURCE = "XposedOrNot";

// Full breach catalog (~800 entries): dates, domains and exposed-data categories.
let catalog = null;
let catalogAt = 0;
export async function getCatalog() {
  if (catalog && Date.now() - catalogAt < 6 * 3600e3) return catalog;
  const res = await fetch(`${XON}/breaches`, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`catalog ${res.status}`);
  catalog = (await res.json()).exposedBreaches;
  catalogAt = Date.now();
  return catalog;
}

/** Breaches for one normalized email. Only an explicit "Not found" is "clear"; anything odd is "unknown". */
export async function checkXon(email) {
  const unknown = (error) => ({ status: "unknown", breaches: [], checkedAt: null, source: XON_SOURCE, error });
  let data;
  try {
    // XposedOrNot takes the email in the URL path; that's their API, documented in the README.
    const res = await fetch(`${XON}/check-email/${encodeURIComponent(email)}`, { signal: AbortSignal.timeout(10000) });
    console.log(`xon ${res.status}`); // status only, never the email
    if (res.status === 429) return unknown("Check unavailable: rate limited, try again shortly.");
    data = await res.json();
  } catch {
    return unknown("Check unavailable: the breach-check service did not respond.");
  }
  const checkedAt = new Date().toISOString();
  if (data?.Error === "Not found") return { status: "clear", breaches: [], checkedAt, source: XON_SOURCE };
  const names = data?.breaches?.[0];
  if (!Array.isArray(names) || !names.length) return unknown("Check unavailable: the breach-check service returned an error.");

  const byId = new Map((await getCatalog().catch(() => [])).map((b) => [b.breachID, b]));
  const breaches = names.map((name) => {
    const b = byId.get(name);
    return { name, date: b?.breachedDate?.slice(0, 10) ?? null, exposedData: b?.exposedData ?? [], domain: b?.domain ? baseDomain(b.domain) : null };
  });
  return { status: "breached", breaches, checkedAt, source: XON_SOURCE };
}

// Subjects services send when you sign up. ponytail: keyword heuristic; misses accounts that never sent one.
const SIGNUP_QUERY = 'subject:(welcome OR "verify your email" OR "confirm your email" OR "verify your account" OR "activate your account" OR "thanks for signing up" OR "thank you for signing up" OR "account created" OR "complete your registration")';
const PERSONAL = new Set(["gmail.com", "googlemail.com", "yahoo.com", "outlook.com", "hotmail.com", "live.com", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "gmx.com"]);

/** Services that sent sign-up style emails to this Gmail inbox. Reads only the From header; no bodies, nothing stored. */
export async function scanInbox(accessToken, max = 300) {
  const gm = "https://gmail.googleapis.com/gmail/v1/users/me/messages";
  const get = async (url) => {
    const res = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`gmail ${res.status}`);
    return res.json();
  };
  const ids = [];
  let pageToken = "";
  do {
    const page = await get(`${gm}?maxResults=500&q=${encodeURIComponent(SIGNUP_QUERY)}${pageToken && `&pageToken=${pageToken}`}`);
    ids.push(...(page.messages ?? []).map((m) => m.id));
    pageToken = page.nextPageToken ?? "";
  } while (pageToken && ids.length < max);

  const senders = [];
  // ponytail: 25 at a time stays under Gmail's per-user quota; use the batch endpoint if scans get slow.
  for (let i = 0; i < Math.min(ids.length, max); i += 25) {
    const msgs = await Promise.all(ids.slice(i, i + 25).map((id) => get(`${gm}/${id}?format=metadata&metadataHeaders=From`).catch(() => null)));
    for (const m of msgs) {
      const from = m?.payload?.headers?.find((h) => h.name.toLowerCase() === "from")?.value;
      if (from) senders.push({ from, date: m.internalDate ? new Date(Number(m.internalDate)).toISOString().slice(0, 10) : null });
    }
  }
  return sendersToAccounts(senders);
}

/** [{from: 'Netflix <info@mailer.netflix.com>', date}] -> one account per service domain, earliest date kept. */
export function sendersToAccounts(senders) {
  const found = new Map();
  for (const { from, date } of senders) {
    const addr = (from.match(/<([^>]+)>/)?.[1] ?? from).trim();
    const host = addr.split("@")[1];
    if (!host) continue;
    const domain = baseDomain(host);
    if (PERSONAL.has(domain)) continue; // a person, not a service
    const display = from.includes("<") ? from.slice(0, from.indexOf("<")).replace(/["']/g, "").trim() : "";
    const a = found.get(domain);
    if (!a) found.set(domain, { name: display || domain.split(".")[0], domain, firstSeen: date });
    else if (date && (!a.firstSeen || date < a.firstSeen)) a.firstSeen = date;
  }
  return [...found.values()];
}
