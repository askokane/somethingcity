# Account checker (Justin → Atharva handoff)

Given an email the user has **proven they own**, the checker returns every service account it can find for that email: services from the user's Gmail inbox, plus every service with a known breach. Breached ones come first so the city can highlight them.

| Piece | File | Needs |
|---|---|---|
| Fixtures, helpers, browser API | `checker.js` | nothing (works offline) |
| Breach lookup (XposedOrNot) | `sources.js` | network, no key |
| Email-code verification | `server.js` | optional `RESEND_API_KEY` (otherwise codes print in the console) |
| Google sign-in + Gmail inbox scan | `server.js`, `sources.js` | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` |
| Breach timeline (Tiger Data) | `db.js` | `DATABASE_URL`, `npm install` |

## Contract change (heads up, Atharva)

`AccountCheck` from `planning.md` is unchanged, with two additions:

- **`accounts: Account[]`**, one building per entry. Use `domain` as the building key. Breached accounts are listed first.

  ```ts
  type Account = {
    name: string;                         // "Adobe"
    domain: string;                       // "adobe.com"
    breached: boolean;                    // highlight these
    breaches: string[];                   // breach names that hit this service
    foundIn: Array<"inbox" | "breach">;   // how we know the account exists
    firstSeen: string | null;             // earliest sign-up email, YYYY-MM-DD
    serviceBreaches: Array<{              // every known breach OF THIS SERVICE, newest first,
      name: string; date: string;         //   even if this user's email wasn't in it
      exposedData: string[]; records: number | null;
    }>;
  };
  ```
- **`Breach.domain?: string | null`**, which links a breach to its account.

**Three building states.** Accounts come sorted in this order:

| State | Test | Meaning | Suggested look |
|---|---|---|---|
| Your data breached | `breached` | This email was in the leak | Alert: red, damaged |
| Service breached | `!breached && serviceBreaches.length` | The service was breached; this email wasn't found in the leak | Warning: amber |
| No known breach | otherwise | Nothing known for this service | Calm |

The overall `status: "unknown"` (check unavailable) still applies to the whole result, as before.

`accounts` comes from the inbox scan only if the user signed in with Google and allowed Gmail access. Otherwise it lists only the breached services.

## Using it from the frontend

```js
import { checkAccount, checkSignedIn, DEMO_ACCOUNTS } from "./checker/checker.js";
const API = "http://localhost:8787";

// Demo addresses: offline, instant, no server needed
const demo = await checkAccount("breached@demo.test");

// Real email, option A: prove ownership with a 6-digit code
await fetch(`${API}/api/verify/start`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
await fetch(`${API}/api/verify/confirm`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, code }) });
const result = await checkAccount(email, { endpoint: `${API}/api/check` });

// Real email, option B: "Sign in with Google" (proves ownership AND scans the inbox)
location.href = `${API}/auth/google`;
// ...Google sends the user back to FRONTEND_URL/?signin=ok (or no-inbox / failed). Then:
const mine = await checkSignedIn(`${API}/api/check`);

// Detail panel: what this breach means + what to do. Gemini when configured, else the offline list.
import { nextSteps } from "./checker/checker.js";
const r = await fetch(`${API}/api/explain`, { method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: b.name, date: b.date, exposedData: b.exposedData, mine: account.breached }) });
const help = r.ok ? await r.json() : { summary: null, steps: nextSteps(account.name, b.exposedData, account.breached) };

// Breach timeline for the Tiger Data view: [{ year, breaches, records }]
const years = await fetch(`${API}/api/timeline`).then((r) => r.ok ? r.json() : null);

// Sign out
await fetch(`${API}/api/logout`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: "{}" });
```

- Open the frontend at **`http://localhost:...`**, not `127.0.0.1`, so the session cookie is sent.
- `checkAccount` throws `Error("Enter a valid email address.")` on bad input. A live check for an email you haven't verified returns `unknown` with `error: "Verify this email first."`
- The verify endpoints answer `{ error }` with status 400 (wrong or expired code) or 429 (too many tries, or more than one code per minute). Show `error` as is.
- `id` is a hash of the email and `label` is masked (`t***@example.com`). Display only `label`, and never put the raw email in a URL or log.

## Demo accounts (offline)

| Email | Status | Accounts |
|---|---|---|
| **`city@demo.test`** | `breached` | **The judged demo.** 20 real services with **real** breach names, dates and data types: 2 with "your" data (LinkedIn 2021, MyFitnessPal 2018), 9 on breached services (Adobe 2013, Dropbox 2012, Canva 2019…), 9 clean. Which breaches include "your" email is made up. |
| `breached@demo.test` | `breached` | PixelMart and TrailNote breached; Streamly on a breached service; BookNook clean |
| `clear@demo.test` | `clear` | Streamly (breached service) and FitLoop (clean) |
| `unknown@demo.test` | `unknown` | none, with `error` set |

## Running the server

```bash
cd checker
npm install
cp .env.example .env    # fill in what you have; everything is optional
npm start               # http://localhost:8787, prints which features are on
```

With an empty `.env`, the server still runs. Codes print in its console, Google sign-in returns 503, and the timeline returns 503.

### Test page: `/dev`

To try Google sign-in without the frontend, set `FRONTEND_URL=http://localhost:8787/dev` in `.env` and open `http://localhost:8787/dev`. It has a **Sign in with Google** link and, after sign-in, lists every linked account with its domain, how it was found, and the first date seen. **Sign out** clears the session. Switch `FRONTEND_URL` back to the frontend's address once it exists.

The server console logs each scan without the full email, e.g. `google sign-in a***@gmail.com: inbox scan found 137 services`. If nothing was scanned, it says why: `skipped: Gmail access not granted` or `failed: gmail 403`.

### Google setup (sign-in + inbox scan)

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
3. **"Breach City wants access to your Google Account"**: **tick** "View your email messages and settings", then click **Continue**. The box starts **unticked**. If it's left unticked, sign-in still works, but nothing is scanned (`/dev/?signin=no-inbox`, and the console says `Gmail access not granted`).

**"Access blocked: Breach City has not completed the Google verification process" (Error 403: access_denied)** means that Google account isn't on the test-user list. Add it under **Google Auth Platform → Audience → Test users** and try again; it can take a minute to apply.

### Email codes

Without `RESEND_API_KEY`, codes print in the server console, which is fine for the demo. With a free [Resend](https://resend.com) key, real emails go out. Until you verify a domain with Resend, its default sender (`onboarding@resend.dev`) only delivers to the address you signed up to Resend with.

### Tiger Data (breach timeline + service breaches)

1. Create a free service at [Tiger Data](https://www.tigerdata.com/) and copy its connection string into `DATABASE_URL`.
2. Run `npm run load-timeline`. It creates a `breaches` hypertable and loads XposedOrNot's public catalog of about 800 breaches, with an indexed `base_domain` column. It's safe to re-run.
3. It powers two things:
   - `GET /api/timeline` returns breaches and exposed records per year, using `time_bucket`.
   - **Every live check** joins the user's accounts against the hypertable by domain to fill in `serviceBreaches`. If Tiger Data is down or unset, it falls back to the in-memory catalog, so checks never fail because of it.

### Gemini (breach explanations)

1. Get a free API key at [Google AI Studio](https://aistudio.google.com/) and set `GEMINI_API_KEY`. `GEMINI_MODEL` defaults to `gemini-2.5-flash`.
2. `POST /api/explain` with `{ name, date, exposedData, mine }` returns `{ summary, steps, source: "Gemini" }`. Results are cached per breach. Without a key it returns 503, and the frontend uses `nextSteps()` instead.
3. Gemini only ever receives **public breach metadata**: the service name, breach date, data types, and whether this user's email was in it. Never an email, account list or inbox content.

Only the public breach catalog goes in the database. No emails, sessions or check results are stored.

## Privacy: what goes where

- **Ownership first.** A live lookup only runs for the email in your session, proven either by a 6-digit code or by Google sign-in. You can't look up someone else's email.
- **XposedOrNot** receives the email in its URL (`/v1/check-email/{email}`), which is how their API works. It's free and open source (MIT), and there's no key.
- **Gmail scan:**
  - It reads only the `From:` and `Subject:` headers of up to 300 sign-up-style emails ("welcome", "verify your email", and so on). It never reads message bodies.
  - The Google access token is used once and then revoked. Nothing is written to disk.
  - The list of found services lives in server memory for the 1-hour session.
- **Codes** are stored only as hashes. Each expires after 10 minutes, allows at most 5 tries, and works once.
- **Server logs** contain status codes, masked emails and scan counts only. No service names or subjects are logged.
- **Lookup cache:** XposedOrNot answers are kept in memory for 30 minutes, keyed by a hash of the email, so a rate limit or network blip mid-demo reuses the last good answer instead of showing unknown. It's gone when the server restarts.
- **CORS:** the server only accepts browser requests from `localhost` pages and only takes JSON, so other sites can't use it.

## How the inbox scan finds accounts

1. **Search:** Gmail search on subjects with sign-up words: welcome, verify, confirm, activate, "signed up", registration, "account created". This works across all inbox tabs.
2. **"Sign in with Google" apps:** these often send no welcome email. Instead, Google sends "You shared some Google Account data with Canva", and that becomes a **Canva** account rather than a Google one. If the app name is already a domain (`chegg.com`), it's used as-is. Otherwise the domain is guessed as `<name>.com`.
3. **One service, one account:** mail from several domains of the same service merges, keeping the plain `.com` domain and the earliest date. For example `facebookmail.com` + `facebook.com` → Facebook, and `hinge.co` + `hinge.com` → Hinge. Breach matching uses the same rule.
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

## Tests

```bash
npm test           # offline: fixtures, inbox parsing, verification, sessions
npm run test:live  # also checks XposedOrNot for real, plus Tiger Data and Google sign-in if .env has them
```
