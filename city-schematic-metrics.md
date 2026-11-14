# Breach City — Baseline Schematic Metrics

## Purpose

Shared gray-box dimensions for the Blender assets, 3D environment, and browser dashboard. The values below now match Atharva's first isometric scene; Tai and Daniel can confirm or revise them before the environment is refined.

## Scene metrics

| Item | Gray-box baseline | Convention |
|---|---:|---|
| Scene units | 1 unit = 1 meter | Blender GLB and Three.js use the same scale |
| Ground footprint | 48 × 48 units | Centered at world `(0, 0, 0)`; ground plane uses `Y` up |
| City surface | 44.5 × 44.5 units | Centered at origin on the ground |
| City layout | 3 × 3 blocks (9 account plots) | Block centers at `X,Z ∈ {-12, 0, 12}` |
| Block pads | 8.2 × 8.2 units | Account tower centered on its block; reserve a clear 5 × 5 unit tower plot |
| Streets | 2 units wide | Cross streets at `X,Z = -6, 6`; 3.8 units between block-pad edges |
| Account tower | 4 × 4 × 6 units (W × D × H) | Existing Blender asset; bottom-center pivot; place base at block top `Y = 0.23` |
| Gotham River | About 3.5 units wide | Winding north-to-south channel between west and central block columns |
| Bridges | 4.7 × 2.05 units | Two crossings aligned with cross streets at `Z = -6` and `Z = 6` |
| Camera | Orthographic, position `(24, 29, 25)` | Target `(0, 0, 0)`; responsive framing; drag to orbit and scroll to zoom |
| Building states | `clear`, `breached`, `unknown` | Same names in checker data, UI, and status beacons |

## Coordinate convention

Use `Y` as up and `X/Z` as the ground plane. Each account tower pivot sits at `(x, 0.23, z)` on its block. Keep the GLB at unit scale; do not resize instances to compensate for an export mismatch. The city currently preloads six fixture accounts across the nine plots so the **Add account** action can fill the remaining plots.

## Asset handoff

The reusable account tower is `models/buildings/gotham_voxel_skyscraper.blend`, exported as `models/buildings/gotham_voxel_skyscraper.glb`. Its documented bounds are 4 × 4 × 6 meters, with `Y` up and a bottom-center pivot. The browser scene instances the GLB and adds a status beacon plus per-instance window lighting.

Record agreed changes here before detailed environment modeling so the Blender scene and browser stay aligned.
