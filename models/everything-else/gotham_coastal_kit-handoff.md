# Gotham coastal kit

Created in Blender with `build_gotham_coastal_kit.py`. The generator preserves the previously active scene and exports only its dedicated asset scene.

- `gotham_coastal_kit.blend`: editable gallery of the models, with a camera.
- `gotham_coastal_kit.glb`: runtime prototypes at unit scale and origin; glTF Y-up; approximately 155 KB.
- `gotham_coastal_kit.png`: Blender-rendered gallery preview.

The eleven prototype groups are Beach_Sand_Patch, Coast_Rock, Dune_Grass, Beach_Umbrella, Beach_Lounger, Beach_Steps, Lifeguard_Hut, Harbor_Jetty, Market_Stall, Plaza_Fountain and Coast_Bench. Blender may append numeric suffixes; the loader accepts these.

The sand patch has a 24-unit back edge at local Z=0, a tapered curved front reaching Z=10.25, and a surface sloping from Y=0.10 to Y=-1.30 over a submerged foundation. Local positive Z points offshore. Beach locations and rotations live in coastal-plan.js; only the matching seawall segments are omitted.

coastal-scene.js places the three beaches, their props, the market, the fountain plaza, and a timber jetty. All static coastal geometry is baked by material into 14 render batches; named beach groups remain as semantic markers after batching. Rebuild the coastal scene to move individual source props.

Browser evidence in artifacts/beach-detail.png shows West Bay Beach in the running city. The verifier checks three attached beach back edges, asset loading, batching budget, city topology and interactions.
