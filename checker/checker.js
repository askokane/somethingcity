// BreachLink account checker. Plain ES module: works in the browser and in Node 20+, no build step.
import { CITY } from "./demo-city.js";

/**
 * @typedef {{ name: string, date: string | null, exposedData: string[], domain?: string | null }} Breach
 * @typedef {{
 *   name: string,             // service name, e.g. "Adobe"
 *   domain: string,           // e.g. "adobe.com" (safe to use as a building key)
 *   breached: boolean,        // highlight these
 *   breaches: string[],       // names of breaches that hit this service
 *   foundIn: Array<"inbox" | "breach">,
 *   firstSeen: string | null, // earliest inbox email date (YYYY-MM-DD), if found in the inbox
 *   lastSeen: string | null,  // latest sign-up-style email from it (YYYY-MM-DD)
 *   signInWithGoogle: boolean, // joined with "Sign in with Google" (no separate password to leak)
 *   serviceBreaches: ServiceBreach[], // every known breach OF THIS SERVICE, even if your email wasn't in it (newest first)
 * }} Account
 * @typedef {{ name: string, date: string, exposedData: string[], records: number | null, industry?: string | null }} ServiceBreach
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

// ponytail: one service per name, ignoring TLD and mail-only suffixes, so facebookmail.com = facebook.com and
// hinge.co = hinge.com. Two unrelated companies sharing a name on different TLDs would merge; rare enough here.
/** "facebookmail.com" -> "facebook", "samsung-mail.com" -> "samsung", "ucas.ac.uk" -> "ucas" */
export function serviceKey(domain) {
  const label = String(domain).split(".")[0];
  const stripped = label.replace(/-?(mail|email|notice|notify)$/, "");
  return stripped.length >= 3 ? stripped : label;
}

/** Domains to look up service breaches for: each account's own domain, plus "<key>.com" (lyftmail.com -> lyft.com). */
export function lookupDomains(domains) {
  return [...new Set(domains.flatMap((d) => [d, `${serviceKey(d)}.com`]))];
}

/**
 * Merge inbox-found services with breached services into one list:
 * your email breached first, then services that were breached (without your email), then the rest.
 * serviceMap: Map(base domain -> ServiceBreach[]) from db.js serviceBreaches().
 */
export function toAccounts(breaches, inbox = [], serviceMap = new Map()) {
  const byDomain = new Map(inbox.map((a) => [serviceKey(a.domain), { lastSeen: a.firstSeen, signInWithGoogle: false, ...a, breached: false, breaches: [], foundIn: ["inbox"] }]));
  for (const b of breaches) {
    if (!b.domain) continue; // e.g. stealer-log dumps aren't a service account
    let a = byDomain.get(serviceKey(b.domain));
    if (!a) byDomain.set(serviceKey(b.domain), (a = { name: b.name, domain: b.domain, firstSeen: null, lastSeen: null, signInWithGoogle: false, breached: false, breaches: [], foundIn: ["breach"] }));
    if (!a.foundIn.includes("breach")) a.foundIn.push("breach");
    a.breached = true;
    a.breaches.push(b.name);
  }
  const accounts = [...byDomain.values()];
  for (const a of accounts) a.serviceBreaches = serviceMap.get(a.domain) ?? serviceMap.get(`${serviceKey(a.domain)}.com`) ?? [];
  const rank = (a) => (a.breached ? 2 : a.serviceBreaches.length ? 1 : 0);
  return accounts.sort((x, y) => rank(y) - rank(x) || x.name.localeCompare(y.name));
}

/**
 * A short, calm to-do list for one breach, from what leaked. Works offline; this is the advice shown in the detail panel.
 * mine: true if the user's email was in this breach, false if only the service was breached.
 */
export function nextSteps(service, exposedData = [], mine = true) {
  const has = (re) => exposedData.some((d) => re.test(d));
  const steps = [];
  if (!mine) steps.push(`Your email wasn't found in this leak, but if you had ${/^[aeiou]/i.test(service) ? "an" : "a"} ${service} account back then, change that password to be safe.`);
  else if (has(/password/i)) steps.push(`Change your ${service} password, and the password on any other site where you reused it.`);
  else steps.push(`Review your ${service} account for activity you don't recognize.`);
  steps.push(`Turn on two-step verification (2FA) for ${service}.`);
  if (has(/password/i)) steps.push("Use a password manager so every site gets its own unique password.");
  if (has(/phone/i)) steps.push("Be wary of scam texts and calls, and ask your carrier for a SIM-swap PIN.");
  if (has(/email/i)) steps.push(`Expect phishing emails that mention ${service}; sign in by typing the address, not by clicking links.`);
  if (has(/date of birth|dates of birth|physical address|social security|government/i)) steps.push("Watch for identity-theft attempts; consider freezing your credit.");
  if (has(/credit card|bank|payment/i)) steps.push("Check your card and bank statements, and ask your bank about a replacement card.");
  if (has(/security question/i)) steps.push("Change any security questions that used the same answers elsewhere.");
  return steps;
}

/**
 * A building-sign name, at most `max` characters, cut at a word boundary:
 * "The Higgsfield Team" -> "Higgsfield", "Microsoft  Careers" -> "Microsoft", "♟Chess.com" -> "Chess.com".
 */
export function shortName(name, max = 14) {
  let s = String(name).replace(/^[^\p{L}\p{N}]+/u, "").replace(/\s+/g, " ").trim(); // leading emoji/symbols
  s = s.replace(/^the\s+/i, "").replace(/\s+(team|support|careers|security|account|admissions|inc\.?|llc|ltd\.?)$/i, "") || s;
  if (s.length <= max) return s;
  let out = "";
  for (const w of s.split(" ")) {
    if ((out ? out.length + 1 : 0) + w.length > max) break;
    out = out ? `${out} ${w}` : w;
  }
  return out || s.slice(0, max - 1) + "…"; // one very long word
}

/**
 * Everything the 3D city needs, ready to draw: one skyscraper per account, already sorted and labeled.
 * Each building: { key, label, name, domain, state: "breached" | "service" | "clear", height: 1-5, logo, signInWithGoogle }.
 * height grows with account age (years since the first sign-up email); unknown age = 2.
 * logo is a path on the checker server (prefix your API base) for services with a breach on record, else null: draw initials.
 * Above `max` buildings, the calmest ones fold into one "district": { count, service } (service = amber ones in it).
 */
export function cityLayout(check, { max = 48, now = Date.now() } = {}) {
  const rank = { breached: 2, service: 1, clear: 0 };
  const all = (check.accounts ?? []).map((a) => {
    const state = a.breached ? "breached" : a.serviceBreaches?.length ? "service" : "clear";
    const age = a.firstSeen ? (now - Date.parse(a.firstSeen)) / (365.25 * 864e5) : null;
    const logoBreach = a.serviceBreaches?.[0]?.name ?? (a.breached ? a.breaches[0] : null);
    return {
      key: a.domain,
      label: shortName(a.name),
      name: a.name,
      domain: a.domain,
      state,
      height: age === null ? 2 : Math.min(5, 1 + Math.floor(age / 3)), // 0-2y: 1 ... 12y+: 5
      logo: logoBreach ? `/api/logo?breach=${encodeURIComponent(logoBreach)}` : null,
      signInWithGoogle: Boolean(a.signInWithGoogle),
    };
  }).sort((x, y) => rank[y.state] - rank[x.state] || y.height - x.height || x.label.localeCompare(y.label));
  if (all.length <= max) return { buildings: all, district: null };
  const rest = all.slice(max - 1); // keep a plot free for the district itself
  return { buildings: all.slice(0, max - 1), district: { count: rest.length, service: rest.filter((b) => b.state === "service").length } };
}

const SENSITIVE = /password|phone|date of birth|dates of birth|physical address|social security|government|credit card|bank|security question/i;
const yearsAgo = (date, now) => (now - Date.parse(date)) / (365.25 * 864e5);

/**
 * Every dashboard stat from one AccountCheck, so the frontend never re-derives them. Works offline on fixtures.
 * Building map: Wayne Tower = counts + exposureScore, Arkham = breachedWhileMember, Ace Chemicals = exposedData + largestBreach,
 * Gotham Bank = footprintByYear / signInWithGoogle / dormant, GCPD = fixFirst, Cobblepot = industries (+ /api/news).
 */
export function summarize(check, now = Date.now()) {
  const accounts = check.accounts ?? [];
  const mine = accounts.filter((a) => a.breached);
  const service = accounts.filter((a) => !a.breached && a.serviceBreaches?.length);

  // "Breached while you were a member": the service was hit after your first sign-up email from it.
  const breachedWhileMember = service.flatMap((a) =>
    a.serviceBreaches.filter((b) => a.firstSeen && b.date >= a.firstSeen).slice(0, 1).map((b) => ({ name: a.name, domain: a.domain, breach: b.name, date: b.date, exposedData: b.exposedData })));

  // ponytail: transparent heuristic, not a standard. Your-data breaches weigh most (more if passwords or identity data,
  // more if recent), then service breaches while you were a member, then other service breaches. Capped at 100.
  let score = 0;
  for (const b of check.breaches ?? []) {
    const age = b.date ? yearsAgo(b.date, now) : 10;
    score += (15 + (b.exposedData.some((d) => /password/i.test(d)) ? 15 : 0) + (b.exposedData.some((d) => SENSITIVE.test(d) && !/password/i.test(d)) ? 10 : 0)) * (age <= 2 ? 1 : age <= 5 ? 0.7 : 0.4);
  }
  score += breachedWhileMember.length * 6 + (service.length - breachedWhileMember.length) * 2;

  const exposed = new Map();
  for (const b of check.breaches ?? []) for (const d of b.exposedData) exposed.set(d, (exposed.get(d) ?? 0) + 1);

  const dated = (check.breaches ?? []).filter((b) => b.date).sort((x, y) => x.date.localeCompare(y.date));
  const allBreaches = accounts.flatMap((a) => (a.serviceBreaches ?? []).map((b) => ({ ...b, account: a.name })));
  const largest = allBreaches.filter((b) => b.records).sort((x, y) => y.records - x.records)[0];

  const priority = (b) => (b.exposedData.some((d) => /password/i.test(d)) ? 2 : 0) + (b.exposedData.some((d) => SENSITIVE.test(d)) ? 1 : 0);
  const fixFirst = [
    ...(check.breaches ?? []).filter((b) => b.domain).sort((x, y) => priority(y) - priority(x) || (y.date ?? "").localeCompare(x.date ?? ""))
      .map((b) => ({ name: accounts.find((a) => a.domain === b.domain)?.name ?? b.name, domain: b.domain, why: `Your data was in the ${b.name} breach${b.date ? ` (${b.date.slice(0, 4)})` : ""}`, steps: nextSteps(b.name, b.exposedData, true) })),
    ...breachedWhileMember.map((w) => ({ name: w.name, domain: w.domain, why: `${w.name} was breached in ${w.date.slice(0, 4)}, after you joined`, steps: nextSteps(w.name, w.exposedData, false) })),
  ];

  const byYear = new Map();
  for (const a of accounts) if (a.firstSeen) byYear.set(a.firstSeen.slice(0, 4), (byYear.get(a.firstSeen.slice(0, 4)) ?? 0) + 1);
  const industries = new Map();
  for (const a of [...mine, ...service]) {
    const ind = a.serviceBreaches?.[0]?.industry;
    if (ind) industries.set(ind, (industries.get(ind) ?? 0) + 1);
  }

  return {
    accounts: accounts.length,
    yourDataBreached: mine.length,
    serviceBreached: service.length,
    noKnownBreach: accounts.length - mine.length - service.length,
    exposureScore: Math.min(100, Math.round(score)),
    exposedData: [...exposed].map(([type, breaches]) => ({ type, breaches })).sort((x, y) => y.breaches - x.breaches),
    oldestLeak: dated[0] ? { name: dated[0].name, date: dated[0].date } : null,
    newestLeak: dated.at(-1) ? { name: dated.at(-1).name, date: dated.at(-1).date } : null,
    largestBreach: largest ? { name: largest.name, account: largest.account, records: largest.records, date: largest.date } : null,
    breachedWhileMember,
    fixFirst,
    footprintByYear: [...byYear].map(([year, n]) => ({ year: Number(year), accounts: n })).sort((x, y) => x.year - y.year),
    signInWithGoogle: accounts.filter((a) => a.signInWithGoogle).length,
    // Approximate: only sign-up-style emails are scanned, so "no such email in 2+ years" is a hint, not proof of disuse.
    dormant: accounts.filter((a) => a.lastSeen && yearsAgo(a.lastSeen, now) > 2).length,
    industries: [...industries].map(([industry, n]) => ({ industry, accounts: n })).sort((x, y) => y.accounts - x.accounts),
  };
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
  // The judged demo: 20 real services with real breach history, fully offline (see demo-city.js).
  "city@demo.test": { breaches: CITY.breaches, inbox: CITY.inbox, services: new Map(CITY.services) },
  // "unknown@demo.test" (and any other address) has no entry, so the check is unavailable.
};

// Fictional service-level breaches: Streamly was breached, but these demo emails weren't in it.
const FIXTURE_SERVICE_BREACHES = new Map([
  ["streamly.example", [{ name: "Streamly", date: "2022-09-30", exposedData: ["Email addresses", "Names", "Passwords"], records: 4200000 }]],
  ["pixelmart.example", [{ name: "PixelMart", date: "2021-06-14", exposedData: ["Email addresses", "Passwords", "Usernames"], records: 1300000 }]],
  ["trailnote.example", [{ name: "TrailNote", date: "2023-02-03", exposedData: ["Email addresses", "IP addresses"], records: 870000 }]],
]);

export const DEMO_ACCOUNTS = ["city@demo.test", "breached@demo.test", "clear@demo.test", "unknown@demo.test"];

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
  return { ...base, checkedAt: new Date().toISOString(), status: f.breaches.length ? "breached" : "clear", breaches: f.breaches, accounts: toAccounts(f.breaches, f.inbox, f.services ?? FIXTURE_SERVICE_BREACHES) };
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
