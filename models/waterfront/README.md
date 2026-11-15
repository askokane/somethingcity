# Gotham Waterfront Kit

Low-poly waterfront models built for BreachLink's unit-scale city and its muted Gotham palette: graphite, slate, oxidized teal, fog ivory, wet timber, foundry red, and warm harbor lights.

## Models

`gotham_waterfront_kit.blend` is the editable gallery. `gotham_waterfront_kit.glb` contains the named prototypes used by the browser scene. The gallery preview is `gotham_waterfront_kit.png`, and `build_gotham_waterfront_kit.py` rebuilds the files in Blender while preserving the active scene.

- North Head lighthouse with a separate `Lighthouse_Beam_Sweep` pivot and translucent light beam.
- Modular beach boardwalk and a fishing pier with three low-poly figures.
- Floating marina with six slips, plus a rock breakwater with a terminal harbor light.
- Rip-rap module, straight seawall module, and corner module.
- Beach volleyball net and dedicated boardwalk ice-cream stand.
- Three stackable shipping container colors, Haysville gantry crane, warehouse, and mooring bollard.

The existing coastal kit already supplies `Lifeguard_Hut`, `Beach_Umbrella`, `Beach_Lounger`, `Harbor_Jetty`, and `Market_Stall`; this kit does not duplicate them. The city scene continues to instance those original prototypes.

All prototypes use local X across shore, Y up, and positive Z offshore. The lighthouse's sweep pivot stays separate for runtime animation. Static waterfront meshes are batched by material in the browser scene; marina boats and the lighthouse beam remain separate scene objects.
