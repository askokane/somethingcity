# Wayne Tower — Breach City asset handoff

- **Files:** `wayne_tower.glb` for the product, `wayne_tower.blend` for editing, and `wayne_tower.png` for preview. `build_wayne_tower.py` creates the original 6 m version; the current 12 m asset was extended in Blender.
- **Design:** Compact 8-bit-inspired interpretation of the supplied Wayne Tower reference: tiered slate Art Deco massing, amber windows, a pixel-letter `W` and `WAYNE` sign, stepped entrance, crown lights, and red roof beacons.
- **Scale and pivot:** 4 × 4 × 12 m, bottom center at `(0, 0, 0)`. The GLB uses Y-up and fits the existing 5 × 5 m account plot. Place at `(x, 0, z)` without instance scaling.
- **Window control:** Each lit, dim, or off window is a child mesh with a stable name beginning `window_`; there are 149 panes. Names encode floor, facade, and column. The source objects also record `window_id` and `initial_state`.
- **Materials:** `wayne_window_glow`, `wayne_window_dim`, and `wayne_window_off` are separate initial states. To flicker any pane independently in Three.js, clone that pane's material on each building instance before changing its emissive color or intensity. Geometry can remain shared.
- **Export:** The GLB includes the building and window meshes only. Preview camera and lights are saved in the BLEND but excluded from the GLB. No texture files are needed.
- **Performance:** Separate pane meshes make per-window animation simple but increase draw calls. Test the intended number of building instances in the browser scene.
