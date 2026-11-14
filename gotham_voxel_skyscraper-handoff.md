# Gotham voxel skyscraper — city handoff

- **Asset:** `gotham_voxel_skyscraper.glb`; editable source: `gotham_voxel_skyscraper.blend`.
- **Scale:** 1 unit = 1 meter. Exact bounds are 4 × 4 × 6 m, including the roof and spires.
- **Pivot:** bottom center. In the GLB, Y is up; place the asset at plot position `(x, 0, z)` without instance scaling.
- **Footprint:** occupies X and Z from -2 to +2 around its plot center, within a 5 × 5 m account plot.
- **View:** orthographic preview uses a 45-degree plan azimuth and an elevation close to the schematic city camera. All four facades have the same seven-floor, three-window rhythm so repeated instances read consistently from any side.
- **Materials:** `stone_midnight_purple`, `stone_deep_violet`, `stone_edge_highlight`, `window_recess_black`, `window_amber_glow`, `window_amber_dim`, `window_amber_off`. Materials are embedded in the GLB; no texture files or scene lights are required.
- **Geometry:** one building mesh with 84 child pane meshes (7 floors × 4 sides × 3 columns). There is no ground, base platform, camera, or light in the GLB.
- **Window IDs:** `window_f01_front_c01` through `window_f07_right_c03`, with sides `front`, `back`, `left`, `right` and columns `c01`–`c03`. Every pane is independently addressable, including panes initially off. The source Blender object also records `window_id` and `initial_state` custom properties.
- **Runtime flicker:** In Three.js, traverse each cloned building instance, find meshes whose names start with `window_`, and clone each pane's material before changing its `emissive` color or `emissiveIntensity`. GLTFLoader may share materials across panes and building clones; without per-pane material clones, changing one window will change other windows too. Keep the shared geometry. Use a steady value for clear/unknown states and irregular, modest intensity changes for breached states; the status label should remain readable without animation.
- **Performance:** Separate pane meshes allow direct per-window control but add 84 draw calls per building. Check frame rate with the intended number of buildings before adding more window detail. If this becomes too costly, use a custom shader or instancing for the animation.
- **Preview:** `gotham_voxel_skyscraper.png` is intentionally rendered at 384 × 384 pixels to emphasize the 8-bit aesthetic.

The supplied city screenshot informed the slate-violet stone, muted amber window light, sparse dark panes, and flatter roof treatment. The exact city scene is not in this folder, so the preview lighting remains self-contained.
