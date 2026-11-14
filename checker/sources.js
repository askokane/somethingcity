// Server-side data sources: XposedOrNot breaches and the Gmail inbox scan.
import { createHash } from "node:crypto";
import { baseDomain, serviceKey } from "./checker.js";

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

// Demo-proofing: reuse a good answer for 30 minutes, so a rate limit or Wi-Fi blip mid-demo doesn't flip buildings to unknown.
// Keyed by a hash of the email; in memory only, gone on restart. ponytail: unbounded Map, fine for a demo's handful of users.
const xonCache = new Map(); // sha256(email) -> { result, at }
const XON_TTL = 30 * 60e3;

/** Breaches for one normalized email. Only an explicit "Not found" is "clear"; anything odd is "unknown". */
export async function checkXon(email) {
  const key = createHash("sha256").update(email).digest("hex");
  const hit = xonCache.get(key);
  if (hit && Date.now() - hit.at < XON_TTL) return hit.result;
  const result = await fetchXon(email);
  if (result.status !== "unknown") xonCache.set(key, { result, at: Date.now() }); // never cache a failure
  else if (hit) return { ...hit.result, stale: true }; // service down now, but we had an answer: use it
  return result;
}

async function fetchXon(email) {
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

// Subjects services send when you sign up, plus Google's "You shared some Google Account data with X" for Sign in with Google.
// ponytail: single keywords on purpose ("Verify Email Address for Discord" missed the old exact phrases); still misses
// accounts that never emailed you.
const SIGNUP_QUERY = 'subject:(welcome OR verify OR confirm OR activate OR "signing up" OR "signed up" OR registration OR "account created" OR "shared some Google Account")';
const GOOGLE_SHARED = /shared some google account (?:data|info) with (.+?)\.?\s*$/i; // real subject: "You shared some Google Account data with Canva"
const PERSONAL = new Set(["gmail.com", "googlemail.com", "yahoo.com", "outlook.com", "hotmail.com", "live.com", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "gmx.com"]);

/** Services that sent sign-up style emails to this Gmail inbox. Reads only From and Subject headers; no bodies, nothing stored. */
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
    const msgs = await Promise.all(ids.slice(i, i + 25).map((id) => get(`${gm}/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`).catch(() => null)));
    for (const m of msgs) {
      const header = (name) => m?.payload?.headers?.find((h) => h.name.toLowerCase() === name)?.value;
      if (header("from")) senders.push({ from: header("from"), subject: header("subject") ?? "", date: m.internalDate ? new Date(Number(m.internalDate)).toISOString().slice(0, 10) : null });
    }
  }
  return sendersToAccounts(senders);
}

const prettyLabel = (domain) => {
  const label = domain.split(".")[0];
  return label.length <= 3 ? label.toUpperCase() : label[0].toUpperCase() + label.slice(1);
};

// Words that make a "First Last"-shaped sender a business, not a person ("American Airlines", "Michigan State University").
const BUSINESS = /\b(airlines?|airways|team|support|university|college|schools?|academy|company|club|bank|office|studios?|games|group|labs|news|education|admissions)\b/i;

// ponytail: shape heuristic. "Last, First" or 2-3 plain Capitalized words = a person; misses one-word or all-caps personal names.
function looksLikePerson(name) {
  if (name.includes(",")) return true;
  const words = name.trim().split(/\s+/);
  return words.length >= 2 && words.length <= 3 && words.every((w) => /^[A-Z][a-z]+(-[A-Z][a-z]+)?$/.test(w)) && !BUSINESS.test(name);
}

// Keep the sender's name ("TurboTax", "American Airlines") unless it's a person ("Greene-Havas, Maia" at vt.edu) or a
// code-like label ("26/WN-SOC-121 Introduction" at instructure.com) that has nothing to do with the domain; then use the domain.
function serviceName(display, domain) {
  const label = serviceKey(domain);
  const words = display.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
  if (words.some((w) => label.includes(w))) return display;
  return looksLikePerson(display) || /\d/.test(display) ? prettyLabel(domain) : display;
}

/** [{from: 'Netflix <info@mailer.netflix.com>', subject, date}] -> one account per service, earliest date kept. */
export function sendersToAccounts(senders) {
  const found = new Map(); // serviceKey -> account
  for (const { from, subject = "", date } of senders) {
    const addr = (from.match(/<([^>]+)>/)?.[1] ?? from).trim();
    const host = addr.split("@")[1];
    if (!host) continue;
    let domain = baseDomain(host);
    if (PERSONAL.has(domain)) continue; // a person, not a service
    const display = from.includes("<") ? from.slice(0, from.indexOf("<")).replace(/["']/g, "").trim() : "";
    let name = display ? serviceName(display, domain) : prettyLabel(domain);
    const shared = domain === "google.com" && subject.match(GOOGLE_SHARED);
    if (shared) {
      // Sign in with Google: the account is the app named in the subject, not Google.
      name = shared[1].trim();
      // "chegg.com" is already a domain; otherwise guess "<name>.com" (right for Canva, GitHub, Spotify...).
      // ponytail: the .com guess is wrong for apps on other TLDs; use a name->domain list if a demo app needs it.
      domain = /^[\w-]+(\.[\w-]+)+$/.test(name) ? baseDomain(name) : `${name.toLowerCase().replace(/[^a-z0-9]/g, "")}.com`;
    }
    const key = serviceKey(domain);
    const a = found.get(key);
    if (!a) found.set(key, { name, domain, firstSeen: date });
    else {
      if (date && (!a.firstSeen || date < a.firstSeen)) a.firstSeen = date;
      // Same service from another domain (facebookmail.com + facebook.com, hinge.co + hinge.com): keep the plain one, .com first.
      const plain = (d) => d.startsWith(`${key}.`);
      if (plain(domain) && (!plain(a.domain) || (domain.endsWith(".com") && !a.domain.endsWith(".com")))) Object.assign(a, { name, domain });
    }
  }
  return [...found.values()];
}
