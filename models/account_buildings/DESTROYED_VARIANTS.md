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

All ten variants use a limited 8-bit palette and have missing wall or roof sections with exposed floors. Their previews are rendered at 256 pixels and enlarged to 1024 pixels with nearest-neighbor scaling. Fire is modeled geometry with emissive materials, so it remains visible in the GLB without particles. Each GLB contains one two-second, 30 fps loop of small flames, with no smoke, sparks, or embers. Configure the GLB animation to repeat in the app; GLB stores the motion but does not set the app's playback mode. The damaged building stays in place for model swapping. Source scripts: `build_destroyed_01_03.py`, `build_destroyed_04_06.py`, `build_destroyed_07_09_8bit.py`, and `build_account_10_destroyed_8bit.py`. The `build_destroyed_07_10.py` entry point routes to the 8-bit builders for 07–10.
