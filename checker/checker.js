// Breach City account checker. Plain ES module: works in the browser and in Node 20+, no build step.

/**
 * @typedef {{ name: string, date: string | null, exposedData: string[], domain?: string | null }} Breach
 * @typedef {{
 *   name: string,             // service name, e.g. "Adobe"
 *   domain: string,           // e.g. "adobe.com" (safe to use as a building key)
 *   breached: boolean,        // highlight these
 *   breaches: string[],       // names of breaches that hit this service
 *   foundIn: Array<"inbox" | "breach">,
 *   firstSeen: string | null, // earliest inbox email date (YYYY-MM-DD), if found in the inbox
 * }} Account
 * @typedef {{
 *   id: string,
 *   label: string,
 *   checkedAt: string | null,
 *   status: "clear" | "breached" | "unknown",
 *   breaches: Breach[],
 *   accounts: Account[],      // one building per account; breached first
 *   source: string,
 *   error?: string,
 * }} AccountCheck
 */

export const SOURCE = "Demo fixtures (sample data, not a live lookup)";
const STATUSES = ["clear", "breached", "unknown"];

// ponytail: pragmatic shape check, not full RFC 5322; the provider is the real arbiter.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Trimmed, lowercased email, or null if it doesn't look like one. Use this for form validation. */
export function normalizeEmail(input) {
  const email = String(input ?? "").trim().toLowerCase();
  return email.length <= 254 && EMAIL_RE.test(email) ? email : null;
}

/** "alice@example.com" -> "a***@example.com". Expects a normalized email. */
export function maskEmail(email) {
  const at = email.lastIndexOf("@");
  return `${email[0]}***${email.slice(at)}`;
}

// ponytail: last two labels, or three for "co.uk"-style suffixes. Use the Public Suffix List if odd TLDs matter.
/** "mailer.netflix.com" -> "netflix.com", "news.bbc.co.uk" -> "bbc.co.uk" */
export function baseDomain(host) {
  const parts = String(host).toLowerCase().replace(/\.$/, "").split(".");
  const n = parts.length > 2 && parts.at(-1).length === 2 && /^(co|com|org|net|ac|gov|edu)$/.test(parts.at(-2)) ? 3 : 2;
  return parts.slice(-n).join(".");
}

/** Merge inbox-found services with breached services into one list, breached first. */
export function toAccounts(breaches, inbox = []) {
  const byDomain = new Map(inbox.map((a) => [a.domain, { ...a, breached: false, breaches: [], foundIn: ["inbox"] }]));
  for (const b of breaches) {
    if (!b.domain) continue; // e.g. stealer-log dumps aren't a service account
    let a = byDomain.get(b.domain);
    if (!a) byDomain.set(b.domain, (a = { name: b.name, domain: b.domain, firstSeen: null, breached: false, breaches: [], foundIn: ["breach"] }));
    if (!a.foundIn.includes("breach")) a.foundIn.push("breach");
    a.breached = true;
    a.breaches.push(b.name);
  }
  return [...byDomain.values()].sort((x, y) => y.breached - x.breached || x.name.localeCompare(y.name));
}

// Fictional services. Categories only: never leaked values.
const FIXTURES = {
  "breached@demo.test": {
    breaches: [
      { name: "PixelMart", date: "2021-06-14", exposedData: ["Email addresses", "Passwords", "Usernames"], domain: "pixelmart.example" },
      { name: "TrailNote", date: "2023-02-03", exposedData: ["Email addresses", "IP addresses"], domain: "trailnote.example" },
    ],
    inbox: [
      { name: "PixelMart", domain: "pixelmart.example", firstSeen: "2019-03-02" },
      { name: "Streamly", domain: "streamly.example", firstSeen: "2020-11-20" },
      { name: "BookNook", domain: "booknook.example", firstSeen: "2022-07-08" },
    ],
  },
  "clear@demo.test": {
    breaches: [],
    inbox: [
      { name: "Streamly", domain: "streamly.example", firstSeen: "2020-11-20" },
      { name: "FitLoop", domain: "fitloop.example", firstSeen: "2024-01-15" },
    ],
  },
  // "unknown@demo.test" (and any other address) has no entry, so the check is unavailable.
};

export const DEMO_ACCOUNTS = ["breached@demo.test", "clear@demo.test", "unknown@demo.test"];

/**
 * Check one account. Throws Error("Enter a valid email address.") on bad input (raw value is never echoed).
 * Never returns "clear" unless the source actually answered with no match.
 * Pass { endpoint: "http://localhost:8787/api/check" } for a live check; the email must be verified first (see README).
 * @demo.test addresses always use fixtures.
 * @param {string} input
 * @param {{ endpoint?: string }} [options]
 * @returns {Promise<AccountCheck>}
 */
export async function checkAccount(input, { endpoint } = {}) {
  const email = normalizeEmail(input);
  if (!email) throw new Error("Enter a valid email address.");
  if (endpoint && !email.endsWith("@demo.test")) return checkLive({ email }, endpoint, email);

  const base = { id: await accountId(email), label: maskEmail(email), source: SOURCE };
  const f = FIXTURES[email];
  if (!f) {
    return { ...base, checkedAt: null, status: "unknown", breaches: [], accounts: [], error: "Check unavailable: this source has no data for this account." };
  }
  return { ...base, checkedAt: new Date().toISOString(), status: f.breaches.length ? "breached" : "clear", breaches: f.breaches, accounts: toAccounts(f.breaches, f.inbox) };
}

/** Live check for whoever is signed in (Google or email code). Use after the Google redirect, when the page has no email. */
export function checkSignedIn(endpoint) {
  return checkLive({}, endpoint, null);
}

// POST so the email stays out of URLs and server logs. Any failure or odd response is "unknown", never "clear".
async function checkLive(body, endpoint, email) {
  const fallback = email ? { id: await accountId(email), label: maskEmail(email) } : { id: "acct_unknown", label: "Signed-in account" };
  let r = {};
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000), // inbox scans take a while
    });
    r = await res.json();
    if (!res.ok || !STATUSES.includes(r.status) || !Array.isArray(r.breaches) || !Array.isArray(r.accounts)) throw new Error();
    return { id: r.id, label: r.label, checkedAt: r.checkedAt ?? null, status: r.status, breaches: r.breaches, accounts: r.accounts, source: String(r.source), ...(r.error && { error: String(r.error) }) };
  } catch {
    const error = r.error === "Verify this email first." ? r.error : "Check unavailable: could not reach the breach-check service.";
    return { ...fallback, status: "unknown", breaches: [], accounts: [], checkedAt: null, source: "Live breach check", error };
  }
}

// Stable id so the raw email never has to travel as a key (DOM ids, URLs, analytics).
export async function accountId(email) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(email));
  return "acct_" + [...new Uint8Array(hash)].slice(0, 6).map((b) => b.toString(16).padStart(2, "0")).join("");
}
