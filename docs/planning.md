# BreachLink — Hackathon Planning Doc

## Product idea

Build a browser-based cybersecurity awareness experience inspired by city-building games. A user adds accounts they want to monitor, the app checks whether the account identifier appears in a permitted breach dataset/API, and results become visible in a small 3D city. The city is a memorable dashboard: each website linked to the user's email (found from breach data and, with consent, their inbox) is a skyscraper with its name on it, and a breach changes that building's state (red: your data leaked; amber: the service was breached) and opens a readable incident panel with the service, breach date, exposed data categories (when available), and practical next steps. A few special landmark buildings hold the dashboard panels.

**Working name:** BreachLink (placeholder)

**One-line pitch:** See your digital exposure at a glance: every account is a building, and breach history changes the neighborhood.

## Step-by-step prompting guide

Use this sequence to turn the plan into manageable prompts. Start each prompt with the relevant workstream instructions and current project files, then review the result before moving on.

1. **Kickoff and decisions:** “Read this planning doc and the assigned workstream instructions. Summarize the MVP, privacy boundaries, shared `AccountCheck` contract, asset conventions, owners, and unresolved decisions. Draft a short kickoff checklist; do not assume values that the team has not agreed on.”
2. **Independent first drafts:** “Work only on your assigned workstream. Produce the smallest usable first version: gray-box environment/building, fixture checker, or app shell, as applicable. Follow the agreed interfaces and report assumptions and handoffs.”
3. **First integration:** “Connect the first available deliverables through the shared contract and agreed scene conventions. Use fixtures and placeholders where needed. Report import or interface mismatches with the exact change required and owner.”
4. **Complete the user loop:** “Implement and verify the full demo flow: add/select a demo account, run/check results, show clear/breached/unknown in the city and text UI, inspect details, and reset to demo data. Keep the no-network path functional.”
5. **Polish within scope:** “Improve readability and presentation without changing shared interfaces or adding deferred features. Ensure uncertainty, source, timestamp, and privacy copy are clear.”
6. **Freeze and rehearse:** “Prepare the final 90-second demo sequence, confirm all three states and the fixture fallback, document limitations, and list only remaining release blockers.”

Treat each step as a separate prompt and use its output to inform the next. If a dependency is missing, continue with the documented placeholder/fixture path and request the specific handoff.

## Hackathon MVP

The demo should complete one clear loop:

1. Add a small set of accounts (email addresses or demo fixtures).
2. Check them against a breach-check provider or a seeded local demo dataset.
3. Show per-account status: `No known breach found`, `Known breach`, or `Check unavailable`.
4. Render one building per linked account (website); use distinct, accessible states for clean, affected, and unknown.
5. Select a building to inspect the result and suggested actions.
6. Include a reset/demo-data path so judges can see both clean and breached examples quickly.

Keep the visual scene and breach-check logic separate. If the live provider is unavailable, the demo remains usable with clearly labeled sample data.

## Trust, privacy, and safety boundaries

- Only check accounts the user owns or is authorized to assess; no password collection, login attempts, or account takeover functionality.
- Prefer an email-only breach lookup through an approved provider. Never send passwords or store credentials.
- Minimize retained data. For the hackathon, use ephemeral/in-memory or local demo data where practical, and explain what is sent to any external provider.
- Do not imply that “no known breach found” means an account is safe; it only means the selected source returned no match.
- Treat provider errors, rate limits, and partial results as `Check unavailable`, never as a clean result.
- Avoid exposing full email addresses in the city view; mask identifiers in labels and detail panels where feasible.
- Do not display leaked passwords or sensitive breach records. Show only breach metadata and broad exposed-data categories from the provider.

## User experience

### Main screen

- Isometric or compact 3D city with one building per monitored account.
- Small account list / status legend alongside the city.
- Add account and “Run checks” actions.
- Clear timestamp and source for the latest check.

### Building states

- **No known match:** calm/neutral lighting and intact appearance.
- **Known breach:** visible alert treatment, such as warning lights or a damaged facade.
- **Unavailable:** muted/uncertain state, visually distinct from both clean and breached.

Use color plus icons/labels so status is not communicated by color alone. Keep animation decorative; status and details must remain readable without it.

### Detail panel

- Masked account identifier and service name.
- Breach name/date and exposed data categories, if returned by the source.
- Short, non-alarmist action checklist: change the affected service password, use a unique password, enable MFA, and review account activity. Do not claim the app performed remediation.

## Four-person parallel work plan

Each stream owns its files and exposes a small agreed interface early. Tai owns the supporting city world and UI visual design/assets; Daniel owns account-building models; Atharva owns frontend behavior and end-to-end integration.

| Person | Workstream | Owns | Deliverable / handoff |
|---|---|---|---|
| Tai | City world, NPCs, streets, and UI visuals | Streets, NPCs, props, supporting environment, status/UI visual design and assets; shared scene conventions | Early city blockout, final supporting world assets, UI design/assets/specs, and account plot/scale notes |
| Daniel | Account-building models | Reusable account-building model plus clean/alert/unknown visual variants or material states | Early placeholder and final building asset, origin/pivot conventions, and status-state mapping |
| Justin | Account onboarding + breach checks | Account entry flow, validation/masking, provider or seeded fixture adapter, status/error handling | A typed function/interface returning account status and breach metadata; document provider limits and demo fallback |
| Atharva | Frontend integration + experience | App shell, city rendering/integration, account list, detail panel, status legend, demo flow, final integration | Working end-to-end browser demo connected to mock data first, then real checker where feasible |

### Parallelization rules

- Agree on the data contract and coordinate system at kickoff; do not wait for polished assets.
- Atharva starts with gray-box geometry and mock breach responses.
- Tai and Daniel export early low-detail assets, then refine without changing agreed scale/origin. Tai keeps Daniel’s account plots clear and hands UI visual design/assets to Atharva; Daniel keeps building materials/state names compatible with Tai’s scene and UI conventions.
- Justin makes the checker callable behind a stable interface so Atharva can integrate a mock implementation immediately.
- Integrate at least once early, then freeze interfaces; late visual polish must not block the demo path.

## Shared data contract

```ts
type AccountCheck = {
  id: string;
  label: string;            // masked display label, e.g. a***@example.com
  checkedAt: string | null;
  status: "clear" | "breached" | "unknown";
  breaches: Array<{
    name: string;
    date: string | null;
    exposedData: string[];
  }>;
  source: string;
  error?: string;           // safe, user-readable explanation
  accounts: Array<{         // added during build: one skyscraper per website linked to the email
    name: string;           // "Adobe"
    domain: string;         // "adobe.com", the building key
    breached: boolean;      // red: this email was in a breach of this service
    serviceBreaches: Array<{ name: string; date: string; exposedData: string[]; records: number | null }>; // amber
    // ...plus foundIn, firstSeen, lastSeen, signInWithGoogle
  }>;
};
```

The checker should return `unknown` on timeout, rate limit, missing API configuration, or provider errors. Keep raw identifiers out of logs and analytics.

**The current, complete contract lives with the checker:** [checker/README.md](checker/README.md) (frontend guide and screen map), [checker/checker.d.ts](checker/checker.d.ts) (types) and [checker/samples/](checker/samples/) (real example responses). `cityLayout()` and `summarize()` in `checker.js` turn a result into ready-to-draw buildings and dashboard stats.

## Suggested hackathon schedule

Adapt the timeboxes to the event length; these are relative phases.

- **First 10% — kickoff:** agree on MVP, data contract, scene scale, provider/fallback plan, and file ownership. Start mock data and placeholder assets immediately.
- **Next 25% — independent build:** produce the first city/building exports, account form/checker stub, and app shell.
- **Middle 25% — integration checkpoint:** connect mock account results to buildings and detail panel. Resolve import/format/coordinate issues.
- **Next 25% — feature completion:** connect live lookup if reliable, add unavailable/error states, improve labels and demo fixtures.
- **Final 15% — freeze and demo:** stop adding features; verify the full loop, prepare a short scripted demo, capture screenshots/video, and document limitations.

## Demo script (about 90 seconds)

1. Open the preloaded city and explain that each building represents an account.
2. Run a check and show one known-breach fixture changing to alert state.
3. Select it to show breach metadata and next steps.
4. Show a clean result and an unavailable result to explain uncertainty handling.
5. Close with the privacy boundary: no passwords are collected, and results reflect the selected data source only.

## Definition of done

- A new or demo account can be checked and represented as a building.
- Clean, breached, and unavailable states are distinguishable in both city and text UI.
- Selecting a building shows account-specific result details and practical next steps.
- Demo works without network/API credentials using clearly labeled fixtures.
- No password collection; identifiers are masked in the city; no leaked secret values are shown.
- All four workstreams have integrated at least one deliverable into the same running demo.

## Risks and scope cuts

- **Provider access / API key / rate limits:** use seeded fixtures for the judged flow; make live lookup optional behind the adapter.
- **3D integration takes too long:** use a simple low-poly scene or static isometric layout; prioritize interaction and the complete story.
- **False sense of safety:** use precise “no known match in this source” copy and show check time/source.
- **Too much scope:** defer accounts beyond email identifiers, historical monitoring, notifications, remediation automation, user accounts/auth, and production data retention.

## Reference


