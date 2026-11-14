"""Build editable voxel pedestrian/bat poses and a transparent 4x4 sprite atlas.

Run inside Blender. Atlas rows, top to bottom: Commuter, Hooded, Porter, Bat.
Columns, left to right: walk/flap frames 0..3. Each cell is 128x128 pixels.
"""

import math
from pathlib import Path

import bpy
from mathutils import Vector, Matrix


OUT = Path(__file__).resolve().parent
BLEND = OUT / "gotham_ambient_sprites.blend"
PNG = OUT / "gotham_ambient_sprites.png"
CELL = 128

for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)
for col in list(bpy.data.collections):
    if col.name != bpy.context.scene.collection.name:
        bpy.data.collections.remove(col)

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE" if "BLENDER_EEVEE" in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items else "BLENDER_EEVEE"
scene.render.film_transparent = True
scene.render.resolution_x = CELL
scene.render.resolution_y = CELL
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.view_settings.view_transform = "Standard"

if scene.world is None: scene.world = bpy.data.worlds.new("Gotham World")
scene.world.color = (0.35, 0.35, 0.35)


def material(name, color):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = 1
    return mat


M = {
    "charcoal": material("Charcoal Coat", (0.075, 0.08, 0.11)),
    "plum": material("Muted Plum", (0.23, 0.13, 0.20)),
    "slate": material("Slate Blue", (0.17, 0.25, 0.32)),
    "cream": material("Faded Cream", (0.55, 0.49, 0.41)),
    "skin": material("Warm Skin", (0.54, 0.34, 0.25)),
    "skin2": material("Cool Skin", (0.38, 0.26, 0.24)),
    "amber": material("Amber Accent", (0.72, 0.44, 0.17)),
    "iron": material("Dark Iron", (0.035, 0.045, 0.065)),
    "bat": material("Bat Midnight", (0.075, 0.085, 0.16)),
    "bat_edge": material("Bat Slate Edge", (0.17, 0.20, 0.30)),
}


def box(name, root, xyz, size, mat, tilt=0):
    sx, sy, sz = [v / 2 for v in size]
    verts = [(x, y, z) for z in (-sz, sz) for y in (-sy, sy) for x in (-sx, sx)]
    faces = [(0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4),
             (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.materials.append(mat)
    ob = bpy.data.objects.new(name, mesh)
    root.users_collection[0].objects.link(ob)
    ob.parent = root
    ob.location = xyz
    ob.rotation_euler.x = tilt
    return ob


def root_for(name, x, z):
    col = bpy.data.collections.new(name)
    scene.collection.children.link(col)
    root = bpy.data.objects.new(name, None)
    col.objects.link(root)
    root.location = (x, 0, z)
    return root, col


def pedestrian(kind, frame, x, z):
    root, col = root_for(f"{kind}_Walk_{frame}", x, z)
    stride = (0, 0.13, 0, -0.13)[frame]
    bob = (0, 0.025, 0, 0.025)[frame]
    if kind == "Commuter":
        coat, trim, face, h = M["plum"], M["cream"], M["skin"], 1.52
        box("long coat", root, (0, .84+bob, 0), (.48, .72, .32), coat)
        box("coat hem", root, (0, .48+bob, .01), (.55, .16, .36), coat)
        box("scarf", root, (0, 1.18+bob, -.19), (.28, .12, .05), trim)
        box("hair", root, (0, 1.46+bob, 0), (.36, .12, .30), M["iron"])
    elif kind == "Hooded":
        coat, trim, face, h = M["slate"], M["amber"], M["skin2"], 1.41
        box("hoodie", root, (0, .85+bob, 0), (.50, .52, .37), coat)
        box("hood", root, (0, 1.29+bob, .07), (.40, .33, .35), coat)
        box("hood rim", root, (0, 1.30+bob, -.14), (.32, .24, .05), M["iron"])
        box("waist band", root, (0, .56+bob, -.02), (.48, .08, .38), trim)
    else:
        coat, trim, face, h = M["charcoal"], M["slate"], M["skin"], 1.48
        box("work jacket", root, (0, .86+bob, 0), (.56, .53, .38), coat)
        box("jacket lapel", root, (-.13, 1.06+bob, -.20), (.12, .28, .04), trim)
        box("jacket lapel", root, (.13, 1.06+bob, -.20), (.12, .28, .04), trim)
        box("flat cap", root, (0, 1.44+bob, -.015), (.44, .10, .35), M["iron"])
        box("cap brim", root, (0, 1.40+bob, -.22), (.43, .045, .20), M["iron"])
    box("face", root, (0, 1.31+bob, -.055), (.30, .30, .27), face)
    box("neck", root, (0, 1.15+bob, 0), (.15, .10, .15), face)
    for side in (-1, 1):
        legz = stride * side
        box("trouser", root, (side*.13, .31+bob, legz*.60), (.19, .49, .22), M["iron"], side*stride*.5)
        box("shoe", root, (side*.13, .075+bob, -.08+legz), (.23, .15, .32), M["charcoal"])
        box("sleeve", root, (side*.34, .87+bob, -side*stride*.55), (.17, .47, .20), coat, -side*stride*.55)
        box("hand", root, (side*.35, .60+bob, -side*stride), (.13, .12, .15), face)
    if kind == "Porter":
        box("small messenger bag", root, (.39, .72+bob, .02), (.19, .27, .26), M["cream"])
    return root, col


def bat(frame, x, z):
    root, col = root_for(f"Bat_Flap_{frame}", x, z)
    wing_height = (0.22, .04, -.13, .04)[frame]
    box("bat torso", root, (0, .91, 0), (.19, .29, .14), M["bat"])
    box("bat head", root, (0, 1.11, -.015), (.23, .18, .18), M["bat"])
    for side in (-1, 1):
        box("ear", root, (side*.075, 1.25, -.015), (.06, .16, .07), M["bat"])
        box("eye", root, (side*.07, 1.10, -.12), (.035, .035, .015), M["amber"])
        box("inner wing", root, (side*.27, .97+wing_height*.45, .025), (.39, .11, .14), M["bat"])
        box("outer wing", root, (side*.60, .98+wing_height, .03), (.34, .10, .13), M["bat"])
        box("wing tip", root, (side*.78, .92+wing_height*1.25, .03), (.12, .16, .12), M["bat_edge"])
    return root, col


poses = []
for row, name in enumerate(("Commuter", "Hooded", "Porter", "Bat")):
    for frame in range(4):
        x, z = frame * 2.2, row * 2.2
        poses.append(bat(frame, x, z) if name == "Bat" else pedestrian(name, frame, x, z))

camera_data = bpy.data.cameras.new("Sprite Three-Quarter Camera")
camera = bpy.data.objects.new("Sprite Three-Quarter Camera", camera_data)
scene.collection.objects.link(camera)
camera_data.type = "ORTHO"
camera_data.ortho_scale = 2.0
scene.camera = camera
light_data = bpy.data.lights.new("Soft Amber Key", "AREA")
light = bpy.data.objects.new("Soft Amber Key", light_data)
scene.collection.objects.link(light)
light_data.energy = 280
light_data.shape = "DISK"
light_data.size = 4
light.location = (2, 5, -3)
light.rotation_euler = (Vector((0, 1, 0)) - light.location).to_track_quat("-Z", "Y").to_euler()

def y_up_rotation(position, target):
    forward = (target-position).normalized()
    right = forward.cross(Vector((0, 1, 0))).normalized()
    up = right.cross(forward).normalized()
    return Matrix((right, up, -forward)).transposed().to_quaternion().to_euler()

atlas_pixels = [0.0] * (CELL * 4 * CELL * 4 * 4)
for index, (root, col) in enumerate(poses):
    for _, other_col in poses:
        other_col.hide_render = other_col != col
    target = root.location + Vector((0, .80, 0))
    camera.location = target + Vector((2.7, 1.9, -5.2))
    camera.rotation_euler = y_up_rotation(camera.location, target)
    light.location = target + Vector((2, 4, -3))
    light.rotation_euler = (target-light.location).to_track_quat("-Z", "Y").to_euler()
    bpy.ops.render.render()
    frame_path = OUT / "_ambient_frame.png"
    bpy.data.images["Render Result"].save_render(filepath=str(frame_path), scene=scene)
    frame_image = bpy.data.images.load(str(frame_path), check_existing=False)
    pixels = list(frame_image.pixels)
    bpy.data.images.remove(frame_image)
    assert len(pixels) == CELL * CELL * 4, len(pixels)
    row, column = divmod(index, 4)
    for y in range(CELL):
        src = y * CELL * 4
        dst = ((3-row)*CELL+y) * (CELL*4) * 4 + column*CELL*4
        atlas_pixels[dst:dst+CELL*4] = pixels[src:src+CELL*4]

atlas = bpy.data.images.new("Gotham Ambient Sprite Atlas", width=CELL*4, height=CELL*4, alpha=True)
assert len(atlas_pixels) == CELL*4*CELL*4*4, len(atlas_pixels)
atlas.pixels.foreach_set(atlas_pixels)
atlas.filepath_raw = str(PNG)
atlas.file_format = "PNG"
atlas.save()
atlas.pack()
frame_path.unlink(missing_ok=True)
# Keep the exported atlas unchanged, then give the editable Blender source
# a four-frame timeline so the three civilian walk cycles play in Blender.
for _, col in poses:
    col.hide_render = False
for i in range(4):
    col = bpy.data.collections[f"Bat_Flap_{i}"]
    col.hide_render = True
    col.hide_viewport = True
for kind, x in (("Commuter", -1.65), ("Hooded", 0.0), ("Porter", 1.65)):
    for pose in range(4):
        obj = bpy.data.objects[f"{kind}_Walk_{pose}"]
        obj.location = (x, 0, 0)
        for frame in range(1, 5):
            obj.scale = (1, 1, 1) if pose == frame - 1 else (0, 0, 0)
            obj.keyframe_insert(data_path="scale", frame=frame)
        for layer in obj.animation_data.action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for curve in bag.fcurves:
                        for key in curve.keyframe_points:
                            key.interpolation = "CONSTANT"
scene.frame_start = 1
scene.frame_end = 4
scene.render.fps = 6
scene.frame_set(1)
scene.render.resolution_x = 768
scene.render.resolution_y = 512
scene.render.film_transparent = False
camera.location = (3, 3.4, -9)
camera.rotation_euler = y_up_rotation(camera.location, Vector((0, .7, 0)))
camera_data.ortho_scale = 6.3
light.location = (2, 5, -3)
light.rotation_euler = y_up_rotation(light.location, Vector((0, .8, 0)))
light_data.energy = 700
light_data.size = 5
background = next((n for n in scene.world.node_tree.nodes if n.type == "BACKGROUND"), None)
if background:
    background.inputs["Color"].default_value = (.055, .065, .09, 1)
    background.inputs["Strength"].default_value = .45
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == "VIEW_3D":
            area.spaces.active.region_3d.view_perspective = "CAMERA"
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
assert PNG.exists() and BLEND.exists()
print("Wrote", BLEND, PNG)
