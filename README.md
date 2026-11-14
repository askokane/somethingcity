# Breach City

**See your digital exposure as a city.** Prove you own an email, and every website linked to it becomes a skyscraper with its name on it. Red means your data leaked in that service's breach, amber means the service was breached without your email in the leak, and calm means no known breach. Special Gotham landmarks hold the dashboard: your score, what leaked, what to fix first, and breach news.

Hackathon project (Emory Hacks). The plan, privacy rules and demo script are in [planning.md](planning.md).

## Who owns what

| Area | Owner | Where | Start here |
|---|---|---|---|
| Backend: accounts, breach checks, stats, news | Justin | [`checker/`](checker/) | [checker/README.md](checker/README.md): the **frontend guide** |
| Account buildings + Gotham landmarks (Blender) | Daniel | [`models/buildings/`](models/buildings/) | the `*-handoff.md` files next to each model |
| City world, streets, NPCs, UI visuals | Tai | [`models/everything-else/`](models/everything-else/), [`models/npcs/`](models/npcs/) | [city-schematic-metrics.md](city-schematic-metrics.md) |
| Frontend + integration + demo | Atharva | (not in the repo yet) | [Atharva-instructions.md](Atharva-instructions.md) |

Each person's brief: [Justin](Justin-instructions.md) · [Daniel](Daniel-instructions.md) · [Tai](Tai-instructions.md) · [Atharva](Atharva-instructions.md)

## Run it

**Backend** (Node 22.18+ or 24):

```bash
cd checker
npm install
npm start
```

It serves `http://localhost:8787`. Get the shared `checker/.env` (Google, Tiger Data and other keys) from Justin privately; it's gitignored. Without it, the server still runs, and the demo accounts work offline anyway.

**Frontend:** serve the repo root over HTTP on `localhost`, e.g. `python -m http.server 5173 --bind localhost`, and open it at `http://localhost:5173/…`. Import the backend helpers from `checker/checker.js`.

**For the demo, use `city@demo.test`:** 20 real services with real breach history, fully offline, no server needed.

## Building the frontend: the 30-second version

```js
import { checkAccount, cityLayout, summarize } from "./checker/checker.js";
const result = await checkAccount("city@demo.test");      // or a live check, see the guide
const { buildings, district } = cityLayout(result);         // skyscrapers: label, state (red/amber/calm), height, logo
const stats = summarize(result);                            // landmark numbers: score, fix-first list, what leaked…
```

- **Guide and screen map** (which building shows what): [checker/README.md](checker/README.md)
- **Types**, for editor autocomplete: [checker/checker.d.ts](checker/checker.d.ts)
- **Real example responses**, to build without running anything: [checker/samples/](checker/samples/)

## Open questions for the team

- **Plot grid size:** [city-schematic-metrics.md](city-schematic-metrics.md) plans a 3×3 grid of 9 plots, from when each *email* was one building. The city is now one skyscraper per *website*: up to 48, plus a "+N more" district and the 8 landmarks. Tai and Atharva should agree on a larger grid, or streets of plots.
- **Landmark models:** Wayne Tower, Arkham Asylum and Ace Chemicals exist in `models/buildings/`. The other five landmarks (Gotham Bank, GCPD HQ, Blackgate, Cobblepot Manor, Elliot Memorial) need a model or a placeholder.
