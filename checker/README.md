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
  };
  ```
- **`Breach.domain?: string | null`**, which links a breach to its account.

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
| `breached@demo.test` | `breached` | PixelMart and TrailNote breached; BookNook and Streamly clean |
| `clear@demo.test` | `clear` | Streamly and FitLoop, both clean |
| `unknown@demo.test` | `unknown` | none, with `error` set |

## Running the server

```bash
cd checker
npm install
cp .env.example .env    # fill in what you have; everything is optional
npm start               # http://localhost:8787, prints which features are on
```

With an empty `.env`, the server still runs. Codes print in its console, Google sign-in returns 503, and the timeline returns 503.

### Google setup (sign-in + inbox scan)

Each step happens in your own Google account:

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project.
2. Under **APIs & Services → Library**, enable the **Gmail API**.
3. Under **Google Auth Platform**, set up the consent screen: audience **External**, publishing status **Testing**. Under **Test users**, add every Gmail address that will sign in (teammates and the demo account; up to 100).
4. Under **Clients → Create client**, choose **Web application**, with authorized redirect URI `http://localhost:8787/auth/google/callback`.
5. Put the client ID and secret in `.env`.

`gmail.readonly` is a restricted scope. Testing mode is fine for a hackathon. Publishing to the public would need Google's security review.

### Email codes

Without `RESEND_API_KEY`, codes print in the server console, which is fine for the demo. With a free [Resend](https://resend.com) key, real emails go out. Until you verify a domain with Resend, its default sender (`onboarding@resend.dev`) only delivers to the address you signed up to Resend with.

### Tiger Data (breach timeline)

1. Create a free service at [Tiger Data](https://www.tigerdata.com/) and copy its connection string into `DATABASE_URL`.
2. Run `npm run load-timeline`. It creates a `breaches` hypertable and loads XposedOrNot's public catalog of about 800 breaches. It's safe to re-run.
3. `GET /api/timeline` returns breaches and exposed records per year, using `time_bucket`.

Only the public breach catalog goes in the database. No emails, sessions or check results are stored.

## Privacy: what goes where

- **Ownership first.** A live lookup only runs for the email in your session, proven either by a 6-digit code or by Google sign-in. You can't look up someone else's email.
- **XposedOrNot** receives the email in its URL (`/v1/check-email/{email}`), which is how their API works. It's free and open source (MIT), and there's no key.
- **Gmail scan:**
  - It reads only the `From:` header of up to 300 sign-up-style emails ("welcome", "verify your email", and so on). It never reads message bodies.
  - The Google access token is used once and then revoked. Nothing is written to disk.
  - The list of found services lives in server memory for the 1-hour session.
- **Codes** are stored only as hashes. Each expires after 10 minutes, allows at most 5 tries, and works once.
- **Server logs** contain status codes and masked emails only.
- **CORS:** the server only accepts browser requests from `localhost` pages and only takes JSON, so other sites can't use it.

## Limits

- **"All accounts" is best effort.** The inbox scan finds services that sent a sign-up-style email, and breach data finds services that were breached. Accounts that did neither won't show up.
- `clear` means only "no known match in XposedOrNot". It doesn't mean the account is safe.
- Sessions, codes and scan results are in memory, so restarting the server signs everyone out.
- `exposedData` lists categories only. No leaked values are fetched or shown, and no passwords are collected.

## Tests

```bash
npm test           # offline: fixtures, parsing, verification, sessions
npm run test:live  # also checks XposedOrNot for real
```
