// Run: node checker/checker.test.js          (offline)
//      LIVE=1 node checker/checker.test.js   (also calls XposedOrNot)
import assert from "node:assert/strict";
import { baseDomain, checkAccount, maskEmail, normalizeEmail } from "./checker.js";
import { sendersToAccounts } from "./sources.js";
import { server } from "./server.js";

// Helpers
assert.equal(normalizeEmail("  Alice@Example.COM "), "alice@example.com");
assert.equal(normalizeEmail("nope"), null);
assert.equal(maskEmail("alice@example.com"), "a***@example.com");
assert.equal(baseDomain("mailer.netflix.com"), "netflix.com");
assert.equal(baseDomain("news.bbc.co.uk"), "bbc.co.uk");

// Fixtures: all three states, breached accounts first
const b = await checkAccount("Breached@demo.test");
assert.equal(b.status, "breached");
assert.equal(b.breaches.length, 2);
// Order: your data breached, then breached services (Streamly), then the rest
assert.deepEqual(b.accounts.map((a) => [a.name, a.breached, a.serviceBreaches.length]), [["PixelMart", true, 1], ["TrailNote", true, 1], ["Streamly", false, 1], ["BookNook", false, 0]]);
assert.deepEqual(b.accounts[0].foundIn, ["inbox", "breach"]);
const c = await checkAccount("clear@demo.test");
assert.equal(c.status, "clear");
assert.ok(c.accounts.length && c.accounts.every((a) => !a.breached));
for (const email of ["unknown@demo.test", "someone@real.com"]) {
  const u = await checkAccount(email);
  assert.equal(u.status, "unknown"); // missing data never reads as clear
  assert.equal(u.checkedAt, null);
  assert.ok(u.error);
}
assert.ok(!JSON.stringify(b).includes("breached@demo.test")); // raw email never in the result
await assert.rejects(checkAccount("secret-bad-input"), (e) => !e.message.includes("secret"));

// Demo city: offline, real breach history, all three building states
const city = await checkAccount("city@demo.test");
assert.equal(city.status, "breached");
assert.equal(city.accounts.length, 20);
const states = city.accounts.map((a) => (a.breached ? "mine" : a.serviceBreaches.length ? "service" : "ok"));
assert.ok(states.includes("mine") && states.includes("service") && states.includes("ok"));
assert.equal(city.accounts.find((a) => a.domain === "adobe.com").serviceBreaches[0].date, "2013-10-01");

// Offline next steps: driven by what leaked, and honest when only the service was breached
const { nextSteps } = await import("./checker.js");
const pw = nextSteps("Adobe", ["Email addresses", "Passwords", "Phone numbers"]);
assert.match(pw[0], /Change your Adobe password/);
assert.ok(pw.some((s) => /SIM-swap/.test(s)) && pw.some((s) => /password manager/.test(s)));
assert.match(nextSteps("Canva", ["Email addresses"], false)[0], /wasn't found in this leak/);

// Inbox sender parsing: one account per service, earliest date, people skipped
assert.deepEqual(sendersToAccounts([
  { from: "Netflix <info@mailer.netflix.com>", date: "2021-05-01" },
  { from: '"Netflix" <hello@netflix.com>', date: "2019-02-03" },
  { from: "Mom <mom@gmail.com>", date: "2020-01-01" },
  { from: "noreply@github.com", date: null },
  // Sign in with Google: Google emails you, the account is the named app
  { from: "Google <no-reply@accounts.google.com>", subject: "You shared some Google Account data with Canva", date: "2026-11-14" },
  { from: "Google <no-reply@accounts.google.com>", subject: "You shared some Google Account info with Spotify.", date: "2026-11-14" },
  { from: "Google <no-reply@accounts.google.com>", subject: "Welcome to Google on your new phone", date: "2026-11-13" },
]), [
  { name: "Netflix", domain: "netflix.com", firstSeen: "2019-02-03", lastSeen: "2021-05-01", signInWithGoogle: false },
  { name: "Github", domain: "github.com", firstSeen: null, lastSeen: null, signInWithGoogle: false },
  { name: "Canva", domain: "canva.com", firstSeen: "2026-11-14", lastSeen: "2026-11-14", signInWithGoogle: true },
  { name: "Spotify", domain: "spotify.com", firstSeen: "2026-11-14", lastSeen: "2026-11-14", signInWithGoogle: true },
  { name: "Google", domain: "google.com", firstSeen: "2026-11-13", lastSeen: "2026-11-13", signInWithGoogle: false },
]);

// Dashboard stats from one check (fixed "now" so ages are stable)
const { summarize } = await import("./checker.js");
const s = summarize(city, Date.parse("2026-11-14"));
assert.deepEqual([s.accounts, s.yourDataBreached, s.serviceBreached, s.noKnownBreach], [20, 2, 9, 9]);
assert.ok(s.exposureScore > 0 && s.exposureScore <= 100);
assert.equal(s.fixFirst[0].name, "MyFitnessPal"); // password leak ranks first
assert.ok(s.breachedWhileMember.some((w) => w.name === "Adobe" && w.date.startsWith("2013")));
assert.equal(s.exposedData.find((d) => d.type === "Passwords").breaches, 1);
assert.equal(s.signInWithGoogle, 7);
assert.ok(s.dormant > 0 && s.industries.length > 0 && s.largestBreach.records > 1e8 && s.footprintByYear.length > 5);
// Building signs and the ready-to-draw city
const { shortName, cityLayout } = await import("./checker.js");
assert.equal(shortName("The Higgsfield Team"), "Higgsfield");
assert.equal(shortName("Microsoft  Careers"), "Microsoft");
assert.equal(shortName("♟Chess.com"), "Chess.com");
assert.equal(shortName("Penn State Undergraduate Admissions"), "Penn State");
assert.equal(shortName("Supercalifragilisticexpialidocious"), "Supercalifrag…");
const layout = cityLayout(city, { now: Date.parse("2026-11-14") });
assert.equal(layout.buildings.length, 20);
assert.equal(layout.district, null);
assert.deepEqual(layout.buildings.slice(0, 2).map((b) => b.state), ["breached", "breached"]); // red first
assert.equal(layout.buildings.find((b) => b.domain === "amazon.com").height, 5); // since 2011
assert.equal(layout.buildings.find((b) => b.domain === "adobe.com").logo, "/api/logo?breach=Adobe");
assert.equal(layout.buildings.find((b) => b.domain === "github.com").logo, null); // no breach on record: initials
const crowded = cityLayout(city, { max: 10 });
assert.equal(crowded.buildings.length + crowded.district.count, 20);
assert.ok(crowded.buildings.filter((b) => b.state !== "clear").length === 9 && crowded.district.count === 11); // calm ones fold first

const empty = summarize(await checkAccount("unknown@demo.test"));
assert.deepEqual([empty.accounts, empty.exposureScore, empty.fixFirst.length, empty.oldestLeak], [0, 0, 0, null]);

// Cleanup cases from a real 145-account inbox
const real = sendersToAccounts([
  { from: "Google <no-reply@accounts.google.com>", subject: "You shared some Google Account data with chegg.com", date: "2026-11-13" },
  { from: "Facebook <security@facebookmail.com>", date: "2026-06-27" },
  { from: "Facebook <notification@facebook.com>", date: "2026-06-20" },
  { from: "SHEIN <noreply@sheinnotice.com>", date: "2025-03-03" },
  { from: "SHEIN <hello@shein.com>", date: "2025-03-05" },
  { from: "Hinge Team <hello@hinge.co>", date: "2026-02-06" },
  { from: "Hinge <hello@hinge.com>", date: "2026-08-29" },
  { from: "Greene-Havas, Maia <mgh@vt.edu>", date: "2025-03-05" },
  { from: "Amazon Prime <prime@amazon.com>", date: "2025-08-19" },
  { from: "26/WN-SOC-121-IN3 Introduction <notifications@instructure.com>", date: "2025-12-15" },
  { from: "Zeno Rocha <zeno@resend.com>", date: "2026-06-19" },
  // Brands on unrelated domains keep their own names
  { from: "American Airlines <aa@aa.com>", date: "2025-11-17" },
  { from: "TurboTax <turbotax@intuit.com>", date: "2026-02-12" },
  { from: "Linktree <hello@linktr.ee>", date: "2024-08-19" },
  { from: "Michigan State University <admissions@msu.edu>", date: "2024-12-02" },
  { from: "Canon ID <noreply@myid.canon>", date: "2025-05-02" },
  { from: "The Browser Company <hello@arc.net>", date: "2026-08-05" },
]);
const byName = Object.fromEntries(real.map((a) => [a.domain, a.name]));
assert.deepEqual(byName, {
  "chegg.com": "chegg.com", // a domain-looking app name stays itself, not "cheggcom.com"
  "facebook.com": "Facebook", // facebookmail.com merged in
  "shein.com": "SHEIN", // sheinnotice.com merged in
  "hinge.com": "Hinge", // hinge.co merged in
  "vt.edu": "VT", // a person's name becomes the service
  "amazon.com": "Amazon Prime", // brand names that match the domain are kept
  "instructure.com": "Instructure", // a course code, not a service name
  "resend.com": "Resend", // a person's name
  "aa.com": "American Airlines",
  "intuit.com": "TurboTax",
  "linktr.ee": "Linktree",
  "msu.edu": "Michigan State University",
  "myid.canon": "Canon ID",
  "arc.net": "The Browser Company",
});
assert.equal(real.find((a) => a.domain === "facebook.com").firstSeen, "2026-06-20"); // earliest date across both domains
// Breach on facebook.com still matches an account found via facebookmail.com
const { toAccounts } = await import("./checker.js");
assert.equal(toAccounts([{ name: "Facebook", domain: "facebook.com" }], [{ name: "Facebook", domain: "facebookmail.com", firstSeen: null }]).length, 1);

// Service breaches: matched by the account's domain or "<key>.com", never marking YOUR data as breached
const { lookupDomains } = await import("./checker.js");
assert.deepEqual(lookupDomains(["lyftmail.com", "adobe.com"]), ["lyftmail.com", "lyft.com", "adobe.com"]);
const svc = new Map([["lyft.com", [{ name: "Lyft", date: "2020-01-01", exposedData: [], records: null }]]]);
const [lyft] = toAccounts([], [{ name: "Lyft", domain: "lyftmail.com", firstSeen: null }], svc);
assert.equal(lyft.breached, false);
assert.equal(lyft.serviceBreaches[0].name, "Lyft");

// Server: verification gate, codes, sessions
await new Promise((r) => server.listen(0, "localhost", r));
const base = `http://localhost:${server.address().port}`;
const post = (path, body, headers = {}) => fetch(base + path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

const gated = await checkAccount("someone@example.com", { endpoint: `${base}/api/check` });
assert.equal(gated.status, "unknown");
assert.equal(gated.error, "Verify this email first.");
assert.equal((await fetch(`${base}/api/check`, { method: "POST", body: "{}" })).status, 415);
const g = await fetch(`${base}/auth/google`, { redirect: "manual" });
if (!process.env.GOOGLE_CLIENT_ID) assert.equal(g.status, 503); // not configured
else assert.ok(g.status === 302 && g.headers.get("location").startsWith("https://accounts.google.com/"));
// Failed Google callbacks say why (no cookie = started on the wrong address or another browser)
const cbLogs = [];
const cbWarn = console.warn;
console.warn = (...a) => cbLogs.push(a.join(" "));
const cb = await fetch(`${base}/auth/google/callback?state=abc&code=xyz`, { redirect: "manual" });
const cancelled = await fetch(`${base}/auth/google/callback?error=access_denied`, { redirect: "manual" });
console.warn = cbWarn;
assert.match(cb.headers.get("location"), /signin=failed&reason=state$/);
assert.match(cancelled.headers.get("location"), /reason=cancelled$/);
assert.match(cb.headers.get("set-cookie"), /bc_oauth=;.*Max-Age=0/); // used sign-in cookie cleared
assert.ok(cbLogs.some((l) => /^\[oauth\].*cookie missing.*not 127\.0\.0\.1/.test(l)));
assert.equal((await post("/api/explain", { name: "Adobe" })).status, 404); // removed: advice comes from nextSteps()
assert.equal((await post("/api/timeline/mine", { domains: ["not a domain!"] })).status, 400);
const tl = await fetch(`${base}/api/timeline`);
if (!process.env.DATABASE_URL) assert.equal(tl.status, 503); // not configured
else {
  const years = await tl.json(); // Tiger Data, loaded with `npm run load-timeline`
  assert.ok(years.length > 5 && years.every((y) => y.year > 1990 && y.breaches > 0));
  console.log(`timeline: ${years.length} years, ${years.reduce((n, y) => n + y.breaches, 0)} breaches`);
  const mineTl = await (await post("/api/timeline/mine", { domains: ["adobe.com", "canva.com"] })).json();
  assert.deepEqual(mineTl.filter((y) => y.yours.length).map((y) => [y.year, y.yours]), [[2013, ["Adobe"]], [2019, ["Canva"]]]);
}

// Breach news: Tiger Data when configured, else the catalog (needs network, so live only)
if (process.env.LIVE || process.argv.includes("--live")) {
  const nw = await (await fetch(`${base}/api/news?limit=3`)).json();
  assert.ok(nw.recent.length === 3 && nw.biggest.length === 3 && nw.thisYear.breaches > 0);
  assert.ok(nw.recent[0].addedDate >= nw.recent[2].addedDate && nw.biggest[0].records >= nw.biggest[2].records);
  assert.ok(nw.biggest.every((b) => b.domain)); // named services, no anonymous combo lists
  assert.ok(!/<[a-z]/i.test(nw.recent[0].description ?? "")); // HTML stripped
  console.log(`news (${nw.source}): latest ${nw.recent[0].name} ${nw.recent[0].addedDate}, biggest ${nw.biggest[0].name}`);
  const lg = await fetch(`${base}/api/logo?breach=Adobe`);
  assert.ok(lg.ok && lg.headers.get("content-type").startsWith("image/") && (await lg.arrayBuffer()).byteLength > 100);
  assert.equal((await fetch(`${base}/api/logo?breach=NoSuchBreach`)).status, 404);
}

const printed = [];
const log = console.log;
console.log = (...a) => printed.push(a.join(" "));
assert.equal((await post("/api/verify/start", { email: "Test@Example.com" })).status, 200);
console.log = log;
const code = printed.join("\n").match(/t\*\*\*@example\.com: (\d{6})/)?.[1];
assert.ok(code, "dev mode prints the code with a masked email");
assert.ok(!printed.join().includes("test@example.com"));
assert.equal((await post("/api/verify/start", { email: "test@example.com" })).status, 429); // 1 per minute
assert.equal((await post("/api/verify/confirm", { email: "test@example.com", code: "000000" === code ? "111111" : "000000" })).status, 400);
const ok = await post("/api/verify/confirm", { email: "test@example.com", code });
assert.equal(ok.status, 200);
const session = ok.headers.get("set-cookie").split(";")[0];
assert.match(session, /^bc_session=[0-9a-f]{64}$/);
assert.equal((await post("/api/verify/confirm", { email: "test@example.com", code })).status, 400); // single use
assert.equal((await post("/api/check", { email: "other@example.com" }, { cookie: session })).status, 401); // only your own email

if (process.env.LIVE || process.argv.includes("--live")) {
  const r = await (await post("/api/check", {}, { cookie: session })).json(); // test@example.com is in many public breaches
  assert.equal(r.status, "breached");
  assert.equal(r.label, "t***@example.com");
  assert.ok(r.breaches.length > 10 && r.breaches.some((x) => x.domain === "adobe.com" && x.date));
  assert.ok(r.accounts.length > 5 && r.accounts.every((a) => a.breached && a.foundIn[0] === "breach"));
  assert.ok(r.accounts.find((a) => a.domain === "adobe.com").serviceBreaches.some((x) => x.name === "Adobe" && x.date.startsWith("2013")));
  console.log(`live: ${r.breaches.length} breaches -> ${r.accounts.length} accounts, e.g. ${r.accounts.slice(0, 3).map((a) => a.name).join(", ")}`);

  const { checkXon } = await import("./sources.js");
  assert.equal((await checkXon("zq7x9k2m4breachlink@example.com")).status, "clear");
  // Cached: the repeat check makes no request (no "xon" log line) and returns the same answer
  const logged = [];
  const realLog = console.log;
  console.log = (...a) => logged.push(a.join(" "));
  const again = await checkXon("zq7x9k2m4breachlink@example.com");
  console.log = realLog;
  assert.equal(again.status, "clear");
  assert.ok(!logged.some((l) => l.startsWith("xon")));
}

assert.equal((await post("/api/logout", {}, { cookie: session })).status, 200);
assert.equal((await post("/api/check", {}, { cookie: session })).status, 401);

// Per-IP rate limit: at most 10 code requests an hour (different emails, so the per-email minute rule doesn't apply).
// Runs last because it uses up this IP's budget.
const quiet = console.log;
console.log = () => {};
const codeStatuses = [];
for (let i = 0; i < 11; i++) codeStatuses.push((await post("/api/verify/start", { email: `ratelimit${i}@example.com` })).status);
console.log = quiet;
assert.equal(codeStatuses.at(-1), 429);
server.close();
console.log("checker ok");
