"""Build the editable, Y-up Gotham river patrol boat and its runtime GLB.

Run in a separate Blender process: blender -b -P build_gotham_police_boat.py
"""
from pathlib import Path
import math
import bpy


OUT = Path(__file__).resolve().parent
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 768
scene.render.resolution_y = 768
scene.render.resolution_percentage = 100
if scene.world is None: scene.world = bpy.data.worlds.new("Gotham World")
scene.world.color = (0.035, 0.045, 0.08)


def mat(name, color, metallic=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = .9
    return m


navy = mat("Boat | Midnight Navy", (.025, .045, .095))
plum = mat("Boat | Muted Plum", (.13, .075, .11))
slate = mat("Boat | Slate Metal", (.18, .23, .29), .15)
iron = mat("Boat | Dark Iron", (.035, .045, .055), .25)
glass = mat("Boat | Dark Glass", (.055, .10, .15))
cream = mat("Boat | Faded Cream", (.55, .53, .45))
red = mat("Boat | Beacon Red", (.48, .045, .055))
blue = mat("Boat | Beacon Blue", (.055, .16, .43))
amber = mat("Boat | Warm Lamp", (.7, .4, .14))

asset = bpy.data.collections.new("Gotham_Police_Boat")
scene.collection.children.link(asset)
root = bpy.data.objects.new("Gotham_Police_Boat", None)
asset.objects.link(root)
root.empty_display_type = "CUBE"
root.empty_display_size = .25
root["forward_axis"] = "+Z"
root["up_axis"] = "+Y"
root["river_width_m"] = 3.1


def box(name, loc, size, material, bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.name = name
    for c in list(o.users_collection):
        c.objects.unlink(o)
    asset.objects.link(o)
    o.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(material)
    o.parent = root
    if bevel:
        mod = o.modifiers.new("Minimal edge treatment", "BEVEL")
        mod.width = bevel
        mod.segments = 1
        o.modifiers.new("Weighted normals", "WEIGHTED_NORMAL")
    return o


# Bow is +Z. The hull is 1.76 m across, leaving clearance in a 3.1 m river.
rings = [(-1.35, .60), (-1.06, .82), (.82, .82), (1.35, .45)]
verts = []
for z, half_width in rings:
    verts.extend([(-half_width, -.18, z), (half_width, -.18, z),
                  (half_width, .24, z), (-half_width, .24, z)])
faces = [(3, 2, 1, 0), (12, 13, 14, 15)]
for i in range(len(rings) - 1):
    a, b = i * 4, (i + 1) * 4
    for j in range(4):
        faces.append((a + j, a + (j + 1) % 4, b + (j + 1) % 4, b + j))
mesh = bpy.data.meshes.new("Boat angular hull mesh")
mesh.from_pydata(verts, [], faces)
mesh.materials.append(navy)
mesh.update()
hull = bpy.data.objects.new("Angular patrol hull", mesh)
asset.objects.link(hull)
hull.parent = root

box("Deck inset", (0, .27, -.03), (1.47, .08, 2.23), slate)
box("Port rub rail", (-.83, .14, -.08), (.1, .13, 1.99), iron)
box("Starboard rub rail", (.83, .14, -.08), (.1, .13, 1.99), iron)
box("Bow bumper", (0, .15, 1.31), (.94, .17, .12), iron)
box("Stern bumper", (0, .15, -1.32), (1.24, .17, .12), iron)
box("Cabin lower", (0, .56, -.35), (1.0, .55, .90), cream)
box("Cabin roof", (0, .92, -.36), (1.22, .17, 1.06), navy)
box("Windshield front", (0, .73, .12), (.79, .32, .035), glass)
box("Cabin window port", (-.515, .71, -.38), (.035, .27, .48), glass)
box("Cabin window starboard", (.515, .71, -.38), (.035, .27, .48), glass)
box("Forward gunwale", (0, .34, .94), (1.18, .11, .15), plum)
box("Stern gunwale", (0, .34, -1.04), (1.26, .11, .15), plum)
box("Port side stripe", (-.83, .22, -.12), (.035, .06, 1.65), cream)
box("Starboard side stripe", (.83, .22, -.12), (.035, .06, 1.65), cream)
box("Roof police beacon red", (-.16, 1.04, -.36), (.25, .11, .20), red)
box("Roof police beacon blue", (.16, 1.04, -.36), (.25, .11, .20), blue)
box("Bow navigation lamp", (0, .40, 1.18), (.22, .13, .13), amber)
box("Aft bollard port", (-.48, .43, -1.04), (.14, .20, .13), iron)
box("Aft bollard starboard", (.48, .43, -1.04), (.14, .20, .13), iron)

# Preview-only camera and lighting are excluded from the selected-root GLB.
camera_data = bpy.data.cameras.new("Preview three-quarter camera")
camera = bpy.data.objects.new("Preview three-quarter camera", camera_data)
scene.collection.objects.link(camera)
camera.location = (4.5, 3.4, 5.5)
direction = -camera.location
camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
camera_data.type = "ORTHO"
camera_data.ortho_scale = 4.3
scene.camera = camera
key_data = bpy.data.lights.new("Preview soft key", "AREA")
key = bpy.data.objects.new("Preview soft key", key_data)
scene.collection.objects.link(key)
key.location = (1, 5, 2)
key.rotation_euler = (-key.location).to_track_quat("-Z", "Y").to_euler()
key_data.energy = 450
key_data.shape = "DISK"
key_data.size = 5

OUT.mkdir(parents=True, exist_ok=True)
stem = OUT / "gotham_police_boat"
bpy.ops.object.select_all(action="DESELECT")
root.select_set(True)
for child in root.children_recursive:
    child.select_set(True)
bpy.context.view_layer.objects.active = root
bpy.ops.export_scene.gltf(filepath=str(stem.with_suffix(".glb")), use_selection=True, export_yup=False)
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(stem.with_suffix(".blend")))
print("SAVED", stem.with_suffix(".blend"), stem.with_suffix(".glb"))
