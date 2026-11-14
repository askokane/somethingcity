# Burning, destroyed account buildings

Each of the ten account buildings has a separate animated ruin variant. The original `.blend`, `.glb`, and `.png` files are unchanged. The variants retain their original ground placement and footprint so an app can swap models at the same transform.

| Slot | Editable scene | Game model | Preview |
| --- | --- | --- | --- |
| 01 | [BLEND](account_building_01_destroyed.blend) | [GLB](account_building_01_destroyed.glb) | [PNG](account_building_01_destroyed.png) |
| 02 | [BLEND](account_building_02_destroyed.blend) | [GLB](account_building_02_destroyed.glb) | [PNG](account_building_02_destroyed.png) |
| 03 | [BLEND](account_building_03_destroyed.blend) | [GLB](account_building_03_destroyed.glb) | [PNG](account_building_03_destroyed.png) |
| 04 | [BLEND](account_building_04_destroyed.blend) | [GLB](account_building_04_destroyed.glb) | [PNG](account_building_04_destroyed.png) |
| 05 | [BLEND](account_building_05_destroyed.blend) | [GLB](account_building_05_destroyed.glb) | [PNG](account_building_05_destroyed.png) |
| 06 | [BLEND](account_building_06_destroyed.blend) | [GLB](account_building_06_destroyed.glb) | [PNG](account_building_06_destroyed.png) |
| 07 | [BLEND](account_building_07_destroyed.blend) | [GLB](account_building_07_destroyed.glb) | [PNG](account_building_07_destroyed.png) |
| 08 | [BLEND](account_building_08_destroyed.blend) | [GLB](account_building_08_destroyed.glb) | [PNG](account_building_08_destroyed.png) |
| 09 | [BLEND](account_building_09_destroyed.blend) | [GLB](account_building_09_destroyed.glb) | [PNG](account_building_09_destroyed.png) |
| 10 | [BLEND](account_building_10_destroyed.blend) | [GLB](account_building_10_destroyed.glb) | [PNG](account_building_10_destroyed.png) |

Fire is modeled geometry with emissive materials, so it remains visible in the GLB without a particle system. Each GLB contains a two-second, 30 fps loop of flickering flames and rising smoke or embers. Configure the GLB animation to repeat in the app; GLB stores the motion but does not set the app's playback mode. The damaged building itself stays in place. Source scripts: `build_destroyed_01_03.py`, `build_destroyed_04_06.py`, and `build_destroyed_07_10.py`.
