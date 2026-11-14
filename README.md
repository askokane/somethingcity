# Breach City

**See your digital exposure as a city.** Breach City turns a verified account check into an interactive isometric Gotham city. Each linked service is represented in the dashboard, while Blender-built blocks, account towers, landmarks, and street details give the city its shape.

Hackathon project for Emory Hacks. The plan and privacy rules are in [planning.md](docs/planning.md).

## Run locally

Requires Node.js 22 or newer for the optional checker service. From PowerShell in this folder, start the static app:

```powershell
powershell -ExecutionPolicy Bypass -File .\serve.ps1
```

Open <http://localhost:8000/> in a WebGL-capable browser. The dashboard and offline demo fixtures run without a build step or network access.

To enable email verification, Google sign-in, Gmail account discovery, or the public breach timeline, start the checker in another terminal:

```powershell
cd checker
npm install
npm start
```

The checker listens on port 8787. Configure optional credentials in the gitignored `checker/.env`: Google OAuth for Google sign-in and Gmail scans, `RESEND_API_KEY` to deliver email codes, and `DATABASE_URL` for the Tiger Data features. Without a mail provider, verification codes are printed in the checker console. See [checker/README.md](checker/README.md) for details.

## Explore the city

- Drag to pan and scroll to zoom. Use **Reset view** to return to the city overview.
- Select a directory entry or a building to open its account report and focus the camera.
- Select **GCPD Headquarters** to open the mission board. Review prioritized fixes, open the affected service website, and mark completed actions. Open, Completed, and All filters show progress saved in this browser, separately for each checked identity. Completion is self-reported and does not alter breach records. New breach incidents create fresh tasks.
- Open the account directory, inbox scan, or breach timeline from the navigation.
- Use **Check** to verify an email address. The demo addresses `city@demo.test`, `breached@demo.test`, `clear@demo.test`, and `unknown@demo.test` use offline fixtures. **`city@demo.test` is the judged demo:** 20 real services with real breach history, fully offline.
- Use **Google sign in** to verify ownership and optionally scan Gmail headers when OAuth is configured.
- Select **Reset** to restore the sample accounts.

The dashboard does not collect passwords. A clear result means that the selected source returned no known match.

## Checker helpers for the frontend

`checker/checker.js` also turns any result into ready-to-draw data: `cityLayout(result)` gives one skyscraper per linked website (label, red/amber/calm state, height, logo), and `summarize(result)` gives the landmark stats (exposure score, fix-first list, what leaked). The checker adds `GET /api/news` (recent and biggest breaches) and `POST /api/timeline/mine`. Real example responses are in [checker/samples/](checker/samples/), and types in [checker/checker.d.ts](checker/checker.d.ts); the full guide and screen map are in [checker/README.md](checker/README.md).

## Deploy on a real domain

[deploy/DEPLOY.md](deploy/DEPLOY.md) puts the frontend and checker on one Vultr server with HTTPS (Caddy), in about 15 copy-paste commands. On one domain, the frontend calls the checker at the same origin, so `CHECKER_API` becomes `""`.

## Blender city and account buildings

The environment in `models/everything-else/gotham_ward_environment.blend` is authored in Blender and exported to `gotham_ward_environment.glb`. It contains the 3×3 block layout, evenly spaced streets, surrounding buildings, river, bridges, park, and lamps. The source generator is `models/everything-else/build_gotham_ward.py`.

The runtime loads Blender GLB models for the environment, crosswalks, stoplights, lamps, trees, bushes, hydrants, and account buildings. It does not generate a procedural city or substitute procedural buildings if an asset fails to load. Some prop exports need an axis correction when placed into the app's Y-up world.

Account building style is selected deterministically from the account ID, so the same login keeps its style between loads. The available styles use the generic Gotham tower, Wayne Tower, and Ace Chemicals assets. Arkham Asylum occupies a reserved landmark block. Account buildings and the Arkham landmark use the updated in-map scales.

## Project areas

| Area | Owner | Files |
|---|---|---|
| Checker service and browser helpers | Justin | `checker/` |
| Account buildings and landmarks | Daniel | `models/buildings/` |
| City environment and street props | Tai | `models/everything-else/`, `docs/city-schematic-metrics.md` |
| Frontend and integration | Atharva | `app.js`, `index.html`, `styles.css`, `city-stats.css` |

See [checker/README.md](checker/README.md) for the checker frontend guide and [integration-handoff.md](docs/integration-handoff.md) for the current integration contract. The app uses Three.js 0.171.0 modules in `vendor/three/`; see `vendor/three/LICENSE`.

This prototype is not affiliated with DC or Warner Bros.
