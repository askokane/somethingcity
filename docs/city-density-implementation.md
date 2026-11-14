# City density implementation

Adapted Justin's `19c79ef` map-density handoff to the older frontend on main.

1. `city-layout.js` generates a 9×9 grid of 81 blocks at a 12-unit pitch (5.06 times the previous land area) and reserves eight complete landmark blocks. The remaining blocks provide 292 account plots, ordered from downtown outward.
2. The 486 low houses use two instanced meshes. Their footprints stay outside tower plots. Empty plots hold parks; adding accounts replaces those parks.
3. Account towers fit a 3.2-unit footprint and use 3-metre floors with height increasing by account age. Status beacons compensate for model scaling.
4. Two separate islands retain all 81 blocks and 292 plots, with an 18-unit sea channel and Blender-modeled animated sea around their outer edges. One simple placeholder bridge connects roads across the channel; its named scene group can be replaced by the final bridge GLB.
5. Landmark filenames are data-driven. Wayne Tower, Ace Chemicals and Arkham load existing models. The other five use labeled grey placeholders until their GLBs are added to `models/buildings/`.

Justin's fixed-landmarks branch is now integrated: Wayne Tower, Ace Chemicals and Arkham open their specialized bat-phone reports. The remaining five open city-wide account summaries while their models are pending. Per-site reports, 12-month breach history, rooftop villains, the bat-status mascot and the city planner are retained.

## Verification

`verify-city.cjs` connects to a local Chrome debugging session on port 9222 with the preview running on port 8000. It installs the offline 20-account city, captures desktop and mobile screenshots, clicks a tower and Wayne Tower, checks directory navigation, measures tower footprints and resets the demo. Run with Node. Screenshots are written to `artifacts/`.

Observed: two islands, an 18-unit channel, one bridge placeholder, 81 blocks, 292 plots, eight landmark roots, all 20 demo towers rendered, no off-map demo accounts, no oversized tower footprints, tower report opens, Wayne Tower report opens, directory navigation succeeds, reset restores six towers. JavaScript module syntax checks pass. Models still produce approximately 752 draw calls in the desktop demo; houses, parks, roads, slabs and bridge pieces are instanced.

Additional accounts beyond the 292 available plots remain in the directory, matching the existing frontend overflow behavior. Grid size is configured by GRID_SIZE; roads, island dimensions, bridge placement and camera framing derive from it. Landmark placement assumes at least five blocks per side.

East Island is offset 24 units south. Sea source and export details are in models/everything-else/gotham_sea-handoff.md. Browser checks also verify that the Blender sea loads and its animation advances.

The sea now uses a Blender-built studded plastic plate kit with rigid 12fps wave motion (brick-sea.js), replacing the rough triangulated morph surface. The runtime GLB is about 13 KB; the Blender source includes an animated sample patch. Tests check moving instance matrices instead of morph weights.

Current lightweight sea: stylized-sea.js replaces the studded instances with one two-triangle plane. Color and normal wave textures are baked once into 512px canvases, then only their UV offsets change per frame. No sea GLB is requested at runtime. Browser verification checks two triangles and changing texture offsets, alongside the city interaction regressions.

Current sea revision replaces the flat texture with a 32,768-triangle wave mesh animated in the vertex shader. The single time uniform preserves the 90-second drift; analytic normals provide surface depth and highlights. The horizon is below all wave troughs. UI regression tests and the geometry-budget/time-uniform checks pass. GPU frame rate has not been profiled.

## Irregular islands and varied blocks

The current plan lives in city-plan.js. West Island extends four rows north into North Head and its lookout park. Coastline cutouts and stepped headlands replace rectangular foundations. All shoreline walls are emitted from exposed land-cell edges, so inlets contain water rather than hidden slabs.

The plan has 84 land cells forming exactly two connected islands, 81 building blocks, 260 account plots and all eight landmarks. Blocks include standard four-plot layouts, narrower terraces, two-plot courtyards, two long garden blocks, and a long market block. Internal roads are removed inside merged blocks. The placeholder bridge now joins aligned roads at z=6. Camera framing derives from the new overall bounds.

Browser checks verify island connectivity, plot corners remain on land, both bridge approaches reach land, all 20 demo accounts render, reports and directory navigation open, and reset restores six accounts. Desktop/mobile and detail screenshots are in artifacts/.
## Blender coastal districts and sporadic building placement

The Blender coastal kit adds three attached sandy areas: West Bay Beach, South Strand and North Head Cove. The kit also supplies rocks, dune grass, umbrellas, loungers, timber steps, a lifeguard hut, jetty, market stalls, benches and a fountain. A new plaza and dockyard reserve their blocks for these props. The 155 KB runtime kit is batched into 14 material/shadow groups.

city-scatter.js creates a seeded shuffled plot order, placing one account building per distinct block before using second plots. Every new city check chooses a fresh order; ordinary selection and checking within the city keep positions stable. Reset restores the initial arrangement. The browser demo places 20 account towers on 20 distinct blocks. All 252 available account plots occur exactly once in each allocation order.

The source and Blender render are models/everything-else/gotham_coastal_kit.blend and gotham_coastal_kit.png. Browser screenshots include artifacts/beach-detail.png. Building and scenery details may also reflect concurrent workspace edits made while this change was in progress.
The user confirmed keeping the concurrent newer layout: account towers use a 4.5-unit footprint, with the reduced filler scenery and newer street props preserved. Market plot centers are spaced five units apart to accommodate those larger towers. Final verification found zero oversized towers against the current footprint budget, with all 20 demo towers on distinct blocks.
