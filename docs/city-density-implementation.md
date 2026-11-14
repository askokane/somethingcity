# City density implementation

Adapted Justin's `19c79ef` map-density handoff to the older frontend on main.

1. `city-layout.js` generates 16 blocks at a 12-unit pitch and reserves eight complete landmark blocks. The remaining blocks provide 32 account plots, ordered from downtown outward.
2. Ninety-six low houses use two instanced meshes. Their footprints stay outside tower plots. Empty plots hold parks; adding accounts replaces those parks.
3. Account towers fit a 3.2-unit footprint and use 3-metre floors with height increasing by account age. Status beacons compensate for model scaling.
4. A new island, roads, waterfront and two bridges replace the old nine-block environment, whose baked filler geometry does not match the larger grid.
5. Landmark filenames are data-driven. Wayne Tower, Ace Chemicals and Arkham load existing models. The other five use labeled grey placeholders until their GLBs are added to `models/buildings/`.

Justin's fixed-landmarks branch is now integrated: Wayne Tower, Ace Chemicals and Arkham open their specialized bat-phone reports. The remaining five open city-wide account summaries while their models are pending. Per-site reports, 12-month breach history, rooftop villains, the bat-status mascot and the city planner are retained.

## Verification

`verify-city.cjs` connects to a local Chrome debugging session on port 9222 with the preview running on port 8000. It installs the offline 20-account city, captures desktop and mobile screenshots, clicks a tower and Wayne Tower, checks directory navigation, measures tower footprints and resets the demo. Run with Node. Screenshots are written to `artifacts/`.

Observed: 16 blocks, 32 plots, eight landmark roots, all 20 demo towers rendered, no off-map demo accounts, no oversized tower footprints, tower report opens, Wayne Tower report opens, directory navigation succeeds, reset restores six towers. JavaScript module syntax checks pass. Models still produce approximately 1,024 draw calls in the desktop demo; houses are instanced, but broader model optimization has not been performed.

Additional accounts beyond the 32 available plots remain in the directory, matching the existing frontend overflow behavior. Dynamic grid growth beyond 4×4 is not implemented.
