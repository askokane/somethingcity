# Current sea

The live app uses stylized-sea.js: a 128×128 wave grid (32,768 triangles), GPU wave displacement and analytic normals, subtle shoreline shading, plus a two-triangle horizon. Only one time uniform changes per frame. The slow wave cycle is 90 seconds. The Blender brick kit below is archived and is not loaded at runtime.

# Gotham brick sea

The current sea takes inspiration from the brick-built ocean described in Animal Logic's LEGO Movie production notes: https://animallogic.com/technology/publications/the-lego-movie-bricks-bricks-and-more-bricks/

- Source: gotham_sea.blend; generator: build_gotham_sea.py, run in Blender.
- Runtime kit: gotham_sea.glb, about 13 KB. Includes one 80-vertex bevelled plastic plate with a cylindrical stud, plus the deep-water horizon.
- brick-sea.js repeats the model with InstancedMesh, excluding island interiors. Blue bands and sparse pale crest plates travel across the surface.
- Rigid pieces move at 12 steps per second over an ninety-second loop. Heights are quantized to 0.04 units. Source Blender file includes a matching animated 15x15 plate preview.
- This replaces the triangulated morph sea and its procedural crest shader. No morph targets or animation clips are required in the runtime kit.
- Sea plate crest tops remain below island and bridge surfaces; foundations cover the lowest troughs. Both islands and the placeholder bridge retain their existing layout.

Browser verification checks instance matrices actually change over time, the sea kit loads, and report clicks, directory navigation and reset continue to work. Desktop, mobile and close-up screenshots are captured. The instanced kit minimizes asset transfer but still submits many triangles; mobile frame rate has not been profiled.
Calmer revision: wave speed is one-third of the original brick sea, swell amplitudes are 0.16 and 0.05 (down from 0.36 and 0.12), and palette/foam transitions blend gradually to avoid flashing. The updated Blender sample uses the same height and timing settings.

Wave travel is slowed a further fivefold to a 90-second cycle. Heights and color blending are unchanged. The Blender source preview samples this slower cycle at ten-frame intervals.
