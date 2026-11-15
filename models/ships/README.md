# Gotham Harbor Fleet

An original, low-poly fleet for BreachLink. The vessels use the coastal kit's weathered wood, oxidized teal, slate, fog ivory, and restrained lamp glow. Chunky silhouettes and faceted hulls match the project's pixel-styled Gotham environment.

## Files

- `gotham_harbor_fleet.blend`: editable gallery scene with all twelve models, labels, camera, and lights.
- `gotham_harbor_fleet.png`: gallery preview.
- One clean-origin GLB per vessel, with X as the bow direction and unit-scale city dimensions.
- `build_gotham_harbor_fleet.py`: reproducible Blender generator; it preserves the active scene and writes the fleet as a separate scene/file.

| Vessel | GLB | Approx. length |
| --- | --- | ---: |
| Fishing trawler | `fishing_trawler_narrows.glb` | 7.4 units |
| Fishing longliner | `fishing_longliner_crown_point.glb` | 6.4 units |
| Fishing skiff | `fishing_skiff_blackgate.glb` | 4.8 units |
| Tugboat | `tugboat_east_quay.glb` | 9 units |
| Cargo barge | `cargo_barge_gotham_river.glb` | 15.5 units |
| GCPD harbor patrol | `gcpd_harbor_patrol.glb` | 8.2 units |
| Bristol–Midtown ferry | `bristol_midtown_ferry.glb` | 12.8 units |
| Beach sailboat | `sailboat_west_bay.glb` | 6.8 units |
| Beach schooner | `schooner_west_bay.glb` | 8.4 units |
| Beach rowboat | `rowboat_beach_cove.glb` | 3.8 units |
| Shallow rowboat | `rowboat_blackgate_cove.glb` | 3.4 units |
| Horizon container ship | `horizon_container_ship_narrows.glb` | 28 units |

The Blender roots carry `vessel_type`, `length_units`, `beam_units`, and `motion_hint` custom properties for integration. The hints describe intended runtime behavior: bobbing/drifting fishing craft, harbor circuits for tug and patrol, a Bristol–Midtown shuttle, moored beach craft, and a slow horizon passage. The GLBs are static models; movement should be driven by the runtime scene.
