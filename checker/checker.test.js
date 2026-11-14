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
assert.deepEqual(b.accounts.map((a) => [a.name, a.breached]), [["PixelMart", true], ["TrailNote", true], ["BookNook", false], ["Streamly", false]]);
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

// Inbox sender parsing: one account per service, earliest date, people skipped
assert.deepEqual(sendersToAccounts([
  { from: "Netflix <info@mailer.netflix.com>", date: "2021-05-01" },
  { from: '"Netflix" <hello@netflix.com>', date: "2019-02-03" },
  { from: "Mom <mom@gmail.com>", date: "2020-01-01" },
  { from: "noreply@github.com", date: null },
]), [
  { name: "Netflix", domain: "netflix.com", firstSeen: "2019-02-03" },
  { name: "github", domain: "github.com", firstSeen: null },
]);

// Server: verification gate, codes, sessions
await new Promise((r) => server.listen(0, "localhost", r));
const base = `http://localhost:${server.address().port}`;
const post = (path, body, headers = {}) => fetch(base + path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

const gated = await checkAccount("someone@example.com", { endpoint: `${base}/api/check` });
assert.equal(gated.status, "unknown");
assert.equal(gated.error, "Verify this email first.");
assert.equal((await fetch(`${base}/api/check`, { method: "POST", body: "{}" })).status, 415);
assert.equal((await fetch(`${base}/auth/google`)).status, 503); // not configured
const tl = await fetch(`${base}/api/timeline`);
if (!process.env.DATABASE_URL) assert.equal(tl.status, 503); // not configured
else {
  const years = await tl.json(); // Tiger Data, loaded with `npm run load-timeline`
  assert.ok(years.length > 5 && years.every((y) => y.year > 1990 && y.breaches > 0));
  console.log(`timeline: ${years.length} years, ${years.reduce((n, y) => n + y.breaches, 0)} breaches`);
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
  console.log(`live: ${r.breaches.length} breaches -> ${r.accounts.length} accounts, e.g. ${r.accounts.slice(0, 3).map((a) => a.name).join(", ")}`);

  const { checkXon } = await import("./sources.js");
  assert.equal((await checkXon("zq7x9k2m4breachcity@example.com")).status, "clear");
}

assert.equal((await post("/api/logout", {}, { cookie: session })).status, 200);
assert.equal((await post("/api/check", {}, { cookie: session })).status, 401);
server.close();
console.log("checker ok");
