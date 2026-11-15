# Atharva — Overall Integration Instructions

## Mission
Own the end-to-end BreachLink experience and frontend implementation. Integrate Tai’s city world, NPCs, streets, and UI visual assets with Daniel’s account buildings and Justin’s account checker into a reliable hackathon demo.

## Step-by-step prompting workflow
Use these prompts in order, keeping the shared contract and conventions visible to every contributor:
1. **Set the shared interfaces:** “Turn the planning doc into a concise kickoff checklist. Confirm the `AccountCheck` type, asset format, scene scale/origin/orientation, state names, file ownership, and earliest handoffs with the team.”
2. **Build the gray-box loop:** “Create the app shell with mock accounts and simple placeholder buildings. Implement add/select, run checks, status list/legend, and a detail panel using the shared contract.”
3. **Integrate the checker:** “Connect the checker behind the same interface as the fixtures. Preserve the no-credentials demo path; show source and timestamp, and map errors or incomplete results to unknown.”
4. **Integrate art and UI assets:** “Import Tai’s streets, NPCs, supporting city assets, and UI visual specifications, plus Daniel’s building asset, using their documented transforms and material names. Implement the UI behavior in the frontend, verify multiple building instances and all three states, and retain the gray-box fallback.”
5. **Complete and rehearse:** “Walk through the full user flow. Fix blockers, confirm privacy and uncertainty copy, reset/demo-data behavior, and prepare a 90-second demo script. List any remaining limitations clearly.”

After each prompt, summarize what works, what is blocked, and the exact next handoff needed; freeze shared interfaces before final polish.

## Start immediately
- Establish the app shell and a gray-box city with mock data before Blender assets are ready.
- Publish the shared `AccountCheck` interface from `planning.md` and confirm it with Justin.
- Agree with Tai and Daniel on asset format, scene scale, origin, orientation, and status material names.
- Keep a known-good demo path using seeded fixtures throughout development.

## Scope
- Build the main screen: city, account/status list or legend, add/check controls, and selected-building details.
- Map each account result to a building and show clear, breached, and unknown states in both the city and text UI.
- Implement the frontend from Tai’s UI visual design/assets; integrate Tai’s city world and Daniel’s reusable account buildings when available; preserve the gray-box fallback.
- Display source and check time. Use precise language such as “No known match in this source.”
- Make the demo resettable and ensure the fixture flow works without credentials or network access.
- Prepare the short demo story and coordinate a final feature freeze.

## Parallel handoffs
- Give everyone the interface and asset conventions early; avoid private assumptions about file names or transforms.
- Ask for rough exports early and integrate them before visual polish is complete.
- Keep mock data behind the same interface Justin implements, so swapping fixture/live data does not require rewriting the UI.
- Send concise integration feedback: what imports, what is missing, and the exact expected change.

## Privacy and UX requirements
- Never request passwords. Mask account identifiers in the city and avoid logging raw identifiers.
- Unknown/unavailable must not look like clear.
- Do not show leaked values or claim remediation has happened.
- Ensure status is conveyed with labels/icons as well as color.

## Done means
- A user can add or select a demo account, run/check results, and see the corresponding building state.
- Selecting a building opens the right metadata and practical next steps.
- Clear, breached, and unknown states all work through the same data contract.
- Fixture demo survives missing provider credentials and network failures.
- The app starts cleanly and the demo can be completed in about 90 seconds.

## Next: map density (final project)

Goal: a denser, livelier Gotham that reads like a real city map: a dense downtown of website towers, low housing and parks around it, water and bridges at the edges. Daniel's new landmark models aren't pushed yet; build the layout so they drop in by file name.

### Where things are (Justin's branch `justin/fixed-landmarks`)
Run `serve.ps1`, then open **http://localhost:8000/** (not `127.0.0.1`).

- **City planner:** `http://localhost:8000/planner/index.html` is a blueprint of the city. It covers the grid size, landmark placement, tower height by account age, and the model file names and road-scale sizes Daniel is building to. Missing models draw as grey boxes. Use it to try layouts before touching `app.js`; **Copy settings JSON** exports the result.
- **Layout, in `app.js`:**
  - `blocks` lays out the 3×3 grid of block centers, 12 units apart.
  - `landmarkBlocks` says which block holds which landmark.
  - `PLOT_OFFSETS`, `slots` and `ACCOUNT_FOOTPRINT` give the 2×2 website plots per block.
- **Scale, in `app.js`:**
  - `UNITS_PER_METER` and `meters()`: a street is 3 units, a 7 m two-lane road.
  - `FLOOR`: a 3 m storey. Size everything new with these, never by eye.
- **Towers:**
  - `addAccountBuilding()` builds the website towers.
  - The plan is height by account age (older account = taller). The checker already gives a 1–5 tier from `firstSeen` (`cityLayout()` in `checker/checker.js`), and the planner shows both a tier rule and a floors-per-year rule.
- **Landmarks:** `landmarkScale` and the model list in `loader.load('./models/buildings/…')`.
- **Props and parks:**
  - `addCityProps()` places the stoplights, lamps, hydrants and crosswalks.
  - `addPark()` builds a walled park with trees in mixed sizes and bushes.
  - `syncPlotParks()` turns every empty website plot into a park and re-runs when accounts change.
  - `scaleForHeight()` sizes any model by its real height in meters.
  - `riverTest()` tells you whether a point is in the river, so nothing gets placed on the water.
- **Camera:** `viewHeight` in `resizeScene()`, plus `controls.target` and `FOCUS_ZOOM`. Re-frame these if the map grows.

### Suggested order
1. **Grow the grid.** The planner shows 4×4 is the first size that fits 20 towers plus all 8 landmarks (3×3 can't). Make `blocks` and `landmarkBlocks` data-driven (grid size → blocks; landmarks placed back to front so tall ones hide the least), and keep `slots` derived from them.
2. **Fill the space between.** Low housing and shops on non-landmark, non-account blocks and block edges. Use `THREE.InstancedMesh` for repeated houses: hundreds of separate clones will drop the frame rate. The grey filler buildings from the old environment GLB were removed because they clipped the plots, so don't bring them back.
3. **Density by account count.** More accounts means a denser downtown; fewer means more parks and housing (`syncPlotParks()` already handles empty plots).
4. **Edges.** Water around the island, bridges, maybe a beach. The river and bridge come from `models/everything-else/gotham_ward_environment.glb`.
5. **Drop in Daniel's models** when he pushes them: `gotham_bank.glb`, `gcpd_hq.glb`, `cobblepot_manor.glb`, `blackgate_penitentiary.glb` and `elliot_memorial.glb` in `models/buildings/`. Target sizes are in the planner's model table. What each landmark shows is in `checker/README.md` ("The 8 landmarks").

### Keep working
- **Status card:** the bottom-left bat-status card follows the city's or the open report's mood.
- **Bat-phone reports:** each building opens its own report.
- **Breach history:** breaches older than 12 months move to History and the site goes calm.
- **Rooftop villains:** they stand on breached towers.
- After any layout change, check that clicking a tower, a landmark and a directory row still opens the right report and flies the camera to it.
