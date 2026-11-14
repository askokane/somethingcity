# Breach City checker: frontend guide

The backend for Breach City (Justin's workstream). It turns an email the user **proves they own** into a city: **one skyscraper per website** linked to that email, colored by breach status. Alongside it come the stats, news and advice for the **8 Gotham landmark buildings** that hold the HUD panels.

**For the frontend, in short:**
1. Get a result: a demo account works offline; real emails need an email code or Google sign-in.
2. `cityLayout(result)` gives the skyscrapers, ready to draw.
3. `summarize(result)` gives every number for the landmarks.
4. `GET /api/news` and `POST /api/timeline/mine` feed the Cobblepot Manor news panel.
5. When a skyscraper is clicked, show its breaches plus `POST /api/explain` (or `nextSteps()` offline).

Import everything from `checker/checker.js`. It's a plain ES module: no build step, and it works in the browser. The server runs at `http://localhost:8787`.

**Build without running anything:**
- **[samples/](samples/)** has real output of every call: `check-city.json`, `city-layout.json` (also `-crowded`, with a district), `summary.json`, `news.json`, `timeline-mine.json`, `explain-fallback.json` and `check-unknown.json`. Regenerate them with `npm run samples`.
- **[checker.d.ts](checker.d.ts)** gives every function and shape types, so editors autocomplete `building.state`, `stats.fixFirst` and so on, even in plain JavaScript.

> **Heads up:** the untracked prototype in `web/` (from another chat) predates most of this. It has no amber state, no `cityLayout`, no stats, news or explanations, so treat it as a reference for wiring sign-in, not as the current contract.

---

## 1. Start the backend

```bash
cd checker
npm install
npm start          # http://localhost:8787, prints which features are on
```

It runs with an empty `.env`; features switch on as keys are added (get the shared `checker/.env` from Justin privately). **Demo accounts don't need the server at all.**

| Feature | Needs | Without it |
|---|---|---|
| Demo accounts, `cityLayout`, `summarize`, `nextSteps` | nothing | (always works, offline) |
| Live breach check (XposedOrNot) | network | result is `unknown` |
| Email codes | optional `RESEND_API_KEY` | code prints in the server console |
| Google sign-in + Gmail inbox scan | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `/auth/google` returns 503 |
| Timeline, news, service breaches (Tiger Data) | `DATABASE_URL` | news and service breaches fall back to the in-memory catalog; timelines return 503 |
| Gemini explanations | `GEMINI_API_KEY` | `/api/explain` returns 503 → use `nextSteps()` |

Open the frontend at **`http://localhost:<port>`**, not `127.0.0.1`, or the session cookie won't be sent. Set `FRONTEND_URL` in `checker/.env` to the frontend's address so Google sign-in returns there.

---

## 2. The whole flow in one snippet

```js
import { checkAccount, checkSignedIn, cityLayout, summarize, nextSteps, DEMO_ACCOUNTS } from "../checker/checker.js";
const API = "http://localhost:8787";
const post = (path, body) => fetch(API + path, {
  method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});

// 1. Get a result (pick one; see section 4)
const result = await checkAccount("city@demo.test");                  // demo: offline
// const result = await checkAccount(email, { endpoint: `${API}/api/check` });   // after an email code
// const result = await checkSignedIn(`${API}/api/check`);                       // after Google sign-in

if (result.status === "unknown") showUnavailable(result.error);       // never draw an unknown result as clear

// 2. Skyscrapers
const { buildings, district } = cityLayout(result, { max: 48 });

// 3. Landmark stats
const stats = summarize(result);

// 4. Cobblepot Manor: news + your breaches on the world timeline (both optional: check r.ok)
const news = await fetch(`${API}/api/news?limit=10`).then((r) => (r.ok ? r.json() : null));
const timeline = await post("/api/timeline/mine", { domains: result.accounts.map((a) => a.domain) }).then((r) => (r.ok ? r.json() : null));

// 5. On skyscraper click: the account, its breaches, and advice
async function advice(account) {
  const b = account.serviceBreaches[0];          // or the user's own breach, see section 3
  if (!b) return null;
  const r = await post("/api/explain", { name: b.name, date: b.date, exposedData: b.exposedData, mine: account.breached });
  return r.ok ? await r.json() : { summary: null, steps: nextSteps(account.name, b.exposedData, account.breached) };
}
```

---

## 3. Screen map: what goes where

### The skyscrapers (one per linked website): `cityLayout(result)`

```js
{ buildings: [
    { key: "linkedin.com", label: "LinkedIn", name: "LinkedIn", domain: "linkedin.com",
      state: "breached", height: 5, logo: "/api/logo?breach=LinkedInScrape-2021", signInWithGoogle: false },
    ... ],                                   // sorted: red, then amber, then calm; taller (older) first
  district: null }                           // or { count: 89, service: 3 } when there are more than `max`
```

| Field | Draw it as |
|---|---|
| `key` | Stable building id (the domain) |
| `label` | The **sign on the building**, at most 14 characters ("Penn State Undergraduate Admissions" → "Penn State"). Use `name` in the detail panel. |
| `state` | `breached` → **red**: your data leaked. `service` → **amber**: the service was breached, your email wasn't found in the leak. `clear` → **calm**: no known breach. |
| `height` | Tier 1–5 by account age: 0–2 years → 1, 12+ years → 5, unknown → 2 |
| `logo` | `${API}${logo}` (served through our server), or `null`: draw initials |
| `signInWithGoogle` | Optional badge: joined with Google, so no separate password to leak |
| `district` | When not `null`, draw one extra "+`count` more" building. Only calm accounts fold into it; red and amber always get their own buildings. |

**Detail panel (click a skyscraper):** look up the full account with `result.accounts.find((a) => a.domain === building.key)`.

- `name`, `domain`, `firstSeen` (first sign-up email) and `foundIn` (`"inbox"` and/or `"breach"`).
- **Red:** `account.breaches` (names) and `result.breaches.filter((b) => b.domain === account.domain)` (dates and data types).
- **Amber:** `account.serviceBreaches`: `name`, `date`, `exposedData`, `records`, `industry`. Say "your email wasn't found in this leak".
- **Advice:** `POST /api/explain`, falling back to `nextSteps()` (snippet above).

### The 8 landmarks (HUD panels): `summarize(result)` and the news endpoints

| Landmark | Show | Data (`stats` = `summarize(result)`) | `city@demo.test` example |
|---|---|---|---|
| **Wayne Tower** | Player card: who, when, city health (the frontend knows which sign-in flow it used) | `result.label`, `result.checkedAt`, `result.source`, `stats.accounts`, `stats.yourDataBreached`, `stats.serviceBreached`, `stats.noKnownBreach`, `stats.exposureScore` | `c***@demo.test`, 20 accounts: 2 / 9 / 9, score 72 |
| **Arkham Asylum** | Breached accounts | Red and amber `buildings`, plus `stats.breachedWhileMember` (amber services hit *after* the user's first sign-up email: the sharpest warning) | Adobe 2013, Canva 2019… |
| **Ace Chemicals** | What leaked | `stats.exposedData` (`[{ type, breaches }]`), `stats.largestBreach`, `stats.oldestLeak`, `stats.newestLeak` | Passwords ×1, Email ×2; Wattpad, 268M records |
| **Gotham Bank** | All accounts | `stats.accounts`, `stats.footprintByYear` (`[{ year, accounts }]`), `stats.signInWithGoogle`, `stats.dormant` | 20; 2011: 1, 2012: 2…; 7 Google; 7 dormant |
| **GCPD HQ** | To-do list | `stats.fixFirst` (`[{ name, domain, why, steps }]`, most urgent first) | MyFitnessPal (password leaked) first |
| **Blackgate Penitentiary** | Resolved | Frontend-only: GCPD to-dos the user ticked off (keep in local state) | |
| **Cobblepot Manor** | Breach news + timeline | `GET /api/news`, `POST /api/timeline/mine`, `stats.industries` | CyrusOne (published today), 88 breaches in 2026 |
| **Elliot Memorial** | Couldn't check | `result.status === "unknown"` with `result.error`, plus a re-check button | `unknown@demo.test` |

`GET /api/news?limit=10` returns:

```js
{ recent:   [...],   // newest breaches to become public (by addedDate)
  biggest:  [...],   // largest breaches of named services ever (anonymous combo lists filtered out)
  thisYear: { year: 2026, breaches: 88, records: 293558300 },
  source:   "Tiger Data" }   // or "XposedOrNot catalog" if the database is down
// each item: { name, domain, date, addedDate, industry, records, exposedData, description }
// description: a plain-text paragraph, ready to use as the headline blurb
```

`POST /api/timeline/mine` with `{ domains }` returns `[{ year, breaches, records, yours: ["Adobe"] }]`: the world timeline with this user's breaches marked. It's a POST so the account list stays out of URLs.

---

## 4. Getting a result: demo, email code, Google

**Demo (offline, instant):** `await checkAccount(email)` with any of `DEMO_ACCOUNTS`:

| Email | Status | Use for |
|---|---|---|
| **`city@demo.test`** | `breached` | **The judged demo.** 20 real services with **real** breach names, dates and data types: 2 red (LinkedIn 2021, MyFitnessPal 2018), 9 amber (Adobe 2013, Dropbox 2012, Canva 2019…), 9 calm. Which breaches include "your" email is made up. |
| `breached@demo.test` | `breached` | Small city: 2 red, 1 amber, 1 calm |
| `clear@demo.test` | `clear` | 1 amber, 1 calm |
| `unknown@demo.test` | `unknown` | The Elliot Memorial state, with `error` set |

**Real email, option A: 6-digit code**

```js
await post("/api/verify/start", { email });          // 200 { sent: "email" | "console" }; 429 if asked again within a minute
await post("/api/verify/confirm", { email, code });   // 200 sets the session cookie; 400 wrong or expired; 429 too many tries
const result = await checkAccount(email, { endpoint: `${API}/api/check` });
```

On errors, show the response's `error` text as is. Without an email service, the code appears in the server console.

**Real email, option B: Sign in with Google** (proves ownership *and* scans the Gmail inbox for linked accounts)

```js
location.href = `${API}/auth/google`;
// Google sends the user back to FRONTEND_URL/?signin=ok | no-inbox | failed
const result = await checkSignedIn(`${API}/api/check`);   // no email needed: uses the session
```

| `?signin=` | Meaning | Show |
|---|---|---|
| `ok` | Signed in and inbox scanned | The full city |
| `no-inbox` | Signed in, but Gmail access wasn't granted | Breached services only, plus a hint: "Tick the Gmail box to find all your accounts" |
| `failed` | Sign-in failed or was cancelled | An error, with retry |

Every Google account must be on the app's test-user list (see Google setup below), or Google shows "Access blocked".

**Sign out:** `await post("/api/logout", {})`. It clears the server session, including the inbox scan.

---

## 5. Endpoint reference

| Method + path | Body / query | Returns | Notes |
|---|---|---|---|
| `POST /api/verify/start` | `{ email }` | `{ sent }` | 1 per minute per email |
| `POST /api/verify/confirm` | `{ email, code }` | `{ ok }` + session cookie | 10-minute codes, 5 tries, single use |
| `GET /auth/google` | | redirect to Google | then back to `FRONTEND_URL/?signin=…` |
| `POST /api/check` | `{ email }` or `{}` | `AccountCheck` | only for the session's own email; 401 `"Verify this email first."` otherwise |
| `POST /api/logout` | `{}` | `{ ok }` | |
| `POST /api/explain` | `{ name, date, exposedData, mine }` | `{ summary, steps, source }` | 503 without Gemini → `nextSteps()` |
| `GET /api/news` | `?limit=1..50` | `{ recent, biggest, thisYear, source }` | Tiger Data, falls back to the catalog |
| `GET /api/timeline` | | `[{ year, breaches, records }]` | Tiger Data only |
| `POST /api/timeline/mine` | `{ domains: [...] }` (≤ 500) | `[{ year, breaches, records, yours }]` | Tiger Data only |
| `GET /api/logo` | `?breach=<name>` | image | from `building.logo`; 404 if none |
| `GET /dev` | | test page | backend testing without the frontend |

All `POST`s need `content-type: application/json` and `credentials: "include"`. The server only accepts browser requests from `localhost` pages.

---

## 6. Data shapes

```ts
type AccountCheck = {              // from planning.md, plus `accounts`
  id: string;                      // hash of the email: safe as a key
  label: string;                   // masked email, e.g. "t***@example.com": the only form to display
  checkedAt: string | null;
  status: "clear" | "breached" | "unknown";
  breaches: Array<{ name: string; date: string | null; exposedData: string[]; domain?: string | null }>;  // breaches containing THIS email
  accounts: Account[];             // one per linked website, sorted red, amber, calm
  source: string;                  // "XposedOrNot" or "Demo fixtures (sample data, not a live lookup)": show it
  error?: string;                  // safe, user-readable
};

type Account = {
  name: string;                    // "Adobe"
  domain: string;                  // "adobe.com"
  breached: boolean;               // red: this email was in a breach of this service
  breaches: string[];              // names of those breaches
  serviceBreaches: Array<{         // amber when !breached && length: every known breach OF THE SERVICE, newest first
    name: string; date: string; exposedData: string[]; records: number | null; industry: string | null;
  }>;
  foundIn: Array<"inbox" | "breach">;
  firstSeen: string | null;        // first sign-up email (YYYY-MM-DD)
  lastSeen: string | null;         // latest sign-up-style email
  signInWithGoogle: boolean;
};
```

Without Google inbox access, `accounts` only contains services from breaches.

---

## 7. UI rules (from planning.md, and how the data supports them)

- **Unknown is not clear.** A `status: "unknown"` result must never look like a clean city: use the Elliot Memorial treatment.
- **Calm ≠ safe.** Say "No known breach in this source", never "safe". Show `result.source` and `result.checkedAt`.
- **Amber wording:** "{Service} was breached in {year}. Your email wasn't found in the leak." If the breach is in `stats.breachedWhileMember`, add: "It happened after you joined."
- **Status not by color alone:** pair red, amber and calm with an icon or label as well.
- **Only show `label`** (the masked email). Never put the raw email in URLs, logs or analytics.
- **`exposureScore`** is our own heuristic, so show a "how it's calculated" note: breaches with your data weigh most (more for passwords and identity data, more if recent), then breaches after you joined, then other service breaches. It's capped at 100.
- **`dormant`** is a hint: "no sign-up-style email in 2+ years", not proof the account is unused.
- **No remediation claims.** The app suggests steps; it doesn't perform them.

---

# Backend details

## Test page: `/dev`

To try Google sign-in without the frontend, set `FRONTEND_URL=http://localhost:8787/dev` in `.env` and open `http://localhost:8787/dev`. It has a **Sign in with Google** link and, after sign-in, lists every linked account with its state, domain, how it was found, the first date seen, and service breaches. **Sign out** clears the session. Switch `FRONTEND_URL` back to the frontend's address once it exists.

The server console logs each scan without the full email, e.g. `google sign-in a***@gmail.com: inbox scan found 137 services`. If nothing was scanned, it says why: `skipped: Gmail access not granted` or `failed: gmail 403`.

## Google setup (sign-in + inbox scan)

Each step happens in your own Google account:

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project.
2. Under **APIs & Services → Library**, enable the **Gmail API**.
3. Under **Google Auth Platform**, set up the consent screen: audience **External**, publishing status **Testing**. Under **Test users**, add every Gmail address that will sign in (teammates and the demo account; up to 100).
4. Under **Clients → Create client**, choose **Web application**, with authorized redirect URI `http://localhost:8787/auth/google/callback`.
5. Put the client ID and secret in `.env`. Google shows the secret only once, when the client is created, so `.env` may be the only copy. Share it with teammates privately, never in the repo.

`gmail.readonly` is a restricted scope. Testing mode is fine for a hackathon. Publishing to the public would need Google's security review.

**Signing in, step by step** (what every tester will see):

1. **"Google hasn't verified this app"**: normal for Testing mode. Click **Continue**.
2. **"Sign in to Breach City"**: this shares only the email address. Click **Continue**.
3. **"Breach City wants access to your Google Account"**: **tick** "View your email messages and settings", then click **Continue**. The box starts **unticked**. If it's left unticked, sign-in still works, but nothing is scanned (`?signin=no-inbox`, and the console says `Gmail access not granted`).

**"Access blocked: Breach City has not completed the Google verification process" (Error 403: access_denied)** means that Google account isn't on the test-user list. Add it under **Google Auth Platform → Audience → Test users** and try again; it can take a minute to apply.

## Email codes

Without `RESEND_API_KEY`, codes print in the server console, which is fine for the demo. With a free [Resend](https://resend.com) key, real emails go out. Until you verify a domain with Resend, its default sender (`onboarding@resend.dev`) only delivers to the address you signed up to Resend with.

## Tiger Data

1. Create a free service at [Tiger Data](https://www.tigerdata.com/) and copy its connection string into `DATABASE_URL`.
2. Run `npm run load-timeline`. It creates a `breaches` hypertable and loads XposedOrNot's public catalog of about 800 breaches, with indexed `base_domain`, publication date (`added_at`) and description. It's safe to re-run.
3. It powers:
   - **every live check:** the user's accounts are joined against the hypertable by domain to fill in `serviceBreaches`,
   - `GET /api/news`: recent breaches, the biggest breaches and this year's totals,
   - `GET /api/timeline` and `POST /api/timeline/mine`: breaches per year with `time_bucket`, optionally marking the user's own.

   If Tiger Data is down or unset, service breaches and news fall back to the in-memory catalog, so checks never fail because of it.

Only the public breach catalog goes in the database. No emails, sessions or check results are stored.

## Gemini (breach explanations)

1. Get a free API key at [Google AI Studio](https://aistudio.google.com/) and set `GEMINI_API_KEY`. `GEMINI_MODEL` defaults to `gemini-2.5-flash`.
2. `POST /api/explain` returns `{ summary, steps, source: "Gemini" }`. Results are cached per breach.
3. Gemini only ever receives **public breach metadata**: the service name, breach date, data types, and whether this user's email was in it. Never an email, account list or inbox content.

## Privacy: what goes where

- **Ownership first.** A live lookup only runs for the email in your session, proven either by a 6-digit code or by Google sign-in. You can't look up someone else's email.
- **XposedOrNot** receives the email in its URL (`/v1/check-email/{email}`), which is how their API works. It's free and open source (MIT), and there's no key.
- **Gmail scan:**
  - It reads only the `From:` and `Subject:` headers of up to 300 sign-up-style emails ("welcome", "verify your email", and so on). It never reads message bodies.
  - The Google access token is used once and then revoked. Nothing is written to disk.
  - The list of found services lives in server memory for the 1-hour session.
- **Logos** are fetched by our server (`/api/logo`), so the browser never tells xposedornot.com which services a user has.
- **Codes** are stored only as hashes. Each expires after 10 minutes, allows at most 5 tries, and works once.
- **Server logs** contain status codes, masked emails and scan counts only. No service names or subjects are logged.
- **Lookup cache:** XposedOrNot answers are kept in memory for 30 minutes, keyed by a hash of the email, so a rate limit or network blip mid-demo reuses the last good answer instead of showing unknown. It's gone when the server restarts.
- **CORS:** the server only accepts browser requests from `localhost` pages and only takes JSON, so other sites can't use it.

## How the inbox scan finds accounts

1. **Search:** Gmail search on subjects with sign-up words: welcome, verify, confirm, activate, "signed up", registration, "account created". This works across all inbox tabs.
2. **"Sign in with Google" apps:** these often send no welcome email. Instead, Google sends "You shared some Google Account data with Canva", and that becomes a **Canva** account (with `signInWithGoogle: true`) rather than a Google one. If the app name is already a domain (`chegg.com`), it's used as-is. Otherwise the domain is guessed as `<name>.com`.
3. **One service, one account:** mail from several domains of the same service merges, keeping the plain `.com` domain, the earliest `firstSeen` and the latest `lastSeen`. For example `facebookmail.com` + `facebook.com` → Facebook, and `hinge.co` + `hinge.com` → Hinge. Breach matching uses the same rule.
4. **Names:** the sender's name is kept ("American Airlines" at aa.com, "TurboTax" at intuit.com). When a **person** sent the email, such as "Greene-Havas, Maia" at vt.edu, or the name is a code like a course number, the service's domain name is shown instead (**VT**, **Instructure**).
5. **Skipped:** senders on personal mail domains (gmail.com, outlook.com and so on), since those are people.

Tested on a real, years-old inbox: **137 accounts** found.

## Limits

- **"All accounts" is best effort.** The inbox scan finds services that sent a sign-up-style email, and breach data finds services that were breached. Accounts that did neither won't show up.
- **It shows evidence of an account, not that it still exists.** A deleted account still has its old welcome email. Breaches matter even then, since the data was taken while the account existed.
- **Labels are heuristics:**
  - The `.com` guess can be wrong for "Sign in with Google" apps on other domains.
  - A person's name written as one word or in all caps isn't detected.
  - Different apps hosted on one platform domain (Firebase, Lovable) can merge into one entry.
  - A service on two unrelated domains can still appear twice (e.g. two Samsung entries).
- Admissions offices, newsletters and course notifications count as accounts if they sent a "welcome" or "confirm" email.
- `clear` means only "no known match in XposedOrNot". It doesn't mean the account is safe.
- Sessions, codes and scan results are in memory, so restarting the server signs everyone out.
- `exposedData` lists categories only. No leaked values are fetched or shown, and no passwords are collected.

## Files

| File | What |
|---|---|
| `checker.js` | Browser + Node module: `checkAccount`, `checkSignedIn`, `cityLayout`, `summarize`, `nextSteps`, `shortName`, fixtures |
| `demo-city.js` | The `city@demo.test` data, generated from the real breach catalog |
| `server.js` | HTTP server: verification, Google sign-in, checks, explain, news, timelines, logos, `/dev` |
| `sources.js` | XposedOrNot lookups and the Gmail inbox scan |
| `db.js` | Tiger Data: catalog loader, news, timelines, service-breach join |
| `checker.d.ts` | Types for everything above |
| `samples/`, `make-samples.js` | Real example responses, and the script that regenerates them (`npm run samples`) |
| `checker.test.js` | Tests |

## Tests

```bash
npm test           # offline: fixtures, layout, stats, inbox parsing, verification, sessions
npm run test:live  # also XposedOrNot, Tiger Data, news, logos, Gemini, if .env has them
```
