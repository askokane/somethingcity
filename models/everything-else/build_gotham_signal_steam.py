"""Build editable Gotham Bat-Signal and four-frame steam assets.

Run with Blender: blender -b --python models/everything-else/build_gotham_signal_steam.py
The meshes use the game's Y-up convention; export_yup=False preserves that in GLB.
"""

from pathlib import Path
import bpy
from mathutils import Vector, Matrix


OUT = Path(__file__).resolve().parent


def material(name, color, alpha=1.0, emission=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, alpha)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, alpha)
    shader.inputs["Roughness"].default_value = 1.0
    shader.inputs["Emission Color"].default_value = (*color, 1.0)
    shader.inputs["Emission Strength"].default_value = emission
    shader.inputs["Alpha"].default_value = alpha
    if alpha < 1 and hasattr(mat, "blend_method"):
        mat.blend_method = "BLEND"
    return mat


def box(name, center, size, mat, parent):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    obj.parent = parent
    return obj


def root(name):
    obj = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(obj)
    obj.empty_display_type = "CUBE"
    obj.empty_display_size = 0.25
    return obj


def save(name):
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / f"{name}.blend"))
    asset = bpy.data.objects["Gotham_Bat_Signal" if name == "gotham_bat_signal" else "Gotham_Steam_Loop"]
    for obj in bpy.context.selected_objects:
        obj.select_set(False)
    for obj in (asset, *asset.children_recursive):
        obj.select_set(True)
    bpy.context.view_layer.objects.active = asset
    bpy.ops.export_scene.gltf(
        filepath=str(OUT / f"{name}.glb"),
        export_format="GLB",
        export_yup=False,
        export_lights=True,
        use_selection=True,
    )


def build_signal():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    iron = material("Signal | charcoal iron", (0.055, 0.065, 0.09))
    slate = material("Signal | worn slate", (0.19, 0.23, 0.29))
    glass = material("Signal | ivory lens", (0.72, 0.69, 0.55), emission=0.45)
    beam_mat = material("Signal | pale beam", (0.54, 0.61, 0.69), alpha=0.045, emission=0.15)
    dark = material("Signal | bat stencil", (0.025, 0.03, 0.045))
    asset = root("Gotham_Bat_Signal")

    # Rooftop mount and a short angled support keep the fixture readable in 3/4 view.
    box("mount lower step", (0, 0.07, 0), (0.94, 0.14, 0.88), iron, asset)
    box("mount upper step", (0, 0.19, 0), (0.70, 0.10, 0.66), slate, asset)
    box("support column", (0, 0.42, 0), (0.22, 0.39, 0.22), iron, asset)
    box("tilt hinge", (0, 0.64, 0), (0.42, 0.19, 0.28), slate, asset)
    box("lamp housing", (0, 0.88, -0.10), (0.84, 0.56, 0.72), iron, asset)
    box("housing rear cap", (0, 0.88, 0.31), (0.67, 0.43, 0.13), slate, asset)
    box("housing front rim", (0, 0.88, -0.49), (0.96, 0.64, 0.12), slate, asset)
    box("lit lens", (0, 0.88, -0.564), (0.72, 0.43, 0.035), glass, asset)
    # One chunky bat glyph on the lens; no fine geometry that disappears at sprite size.
    box("bat center", (0, 0.88, -0.588), (0.16, 0.14, 0.017), dark, asset)
    box("bat left wing", (-0.21, 0.91, -0.588), (0.30, 0.07, 0.017), dark, asset)
    box("bat right wing", (0.21, 0.91, -0.588), (0.30, 0.07, 0.017), dark, asset)
    box("bat left tip", (-0.32, 0.855, -0.588), (0.09, 0.10, 0.017), dark, asset)
    box("bat right tip", (0.32, 0.855, -0.588), (0.09, 0.10, 0.017), dark, asset)

    # A low-poly translucent beam projects up and away from the roof.
    near = [(-0.35, 0.68, -0.59), (0.35, 0.68, -0.59),
            (0.35, 1.09, -0.59), (-0.35, 1.09, -0.59)]
    far = [(-1.24, 3.52, -4.75), (1.24, 3.52, -4.75),
           (1.24, 4.78, -4.75), (-1.24, 4.78, -4.75)]
    verts = near + far
    faces = [(0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    mesh = bpy.data.meshes.new("beam cone mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.materials.append(beam_mat)
    beam = bpy.data.objects.new("translucent beam cone", mesh)
    bpy.context.scene.collection.objects.link(beam)
    beam.parent = asset
    for face in mesh.polygons:
        face.use_smooth = False

    data = bpy.data.lights.new("Bat-Signal spotlight data", "SPOT")
    data.energy = 115
    data.color = (0.55, 0.66, 0.82)
    data.spot_size = 0.62
    data.spot_blend = 0.15
    light = bpy.data.objects.new("Bat-Signal spotlight", data)
    bpy.context.scene.collection.objects.link(light)
    light.parent = asset
    light.location = (0, 0.88, -0.60)
    light.rotation_euler = Vector((0, 3.95, -4.75)).to_track_quat("-Z", "Y").to_euler()
    # Rotate the housing, cone, spotlight, and distant bat projection as one searchlight.
    pivot = root("Signal_Sweep_Pivot")
    pivot.parent = asset
    pivot.location = (0, .64, 0)
    bpy.context.view_layer.update()
    for name in ("lamp housing", "housing rear cap", "housing front rim", "lit lens",
                 "bat center", "bat left wing", "bat right wing", "bat left tip",
                 "bat right tip", "translucent beam cone", "Bat-Signal spotlight"):
        part = bpy.data.objects[name]
        world = part.matrix_world.copy()
        part.parent = pivot
        part.matrix_world = world

    cloud_mat = material("Signal | projected cloud", (.72, .76, .78), alpha=.24, emission=.42)
    def polygon(name, points, depth, mat):
        mesh = bpy.data.meshes.new(name + " mesh")
        mesh.from_pydata([(x, y, depth) for x, y in points], [], [tuple(range(len(points)))])
        mesh.materials.append(mat)
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        obj.parent = pivot
        obj.matrix_parent_inverse = pivot.matrix_world.inverted()
        return obj
    polygon("Signal projected cloud", [
        (-1.3,4.12),(-1.12,4.68),(-.78,4.92),(.72,4.92),(1.14,4.70),
        (1.34,4.12),(1.07,3.58),(.65,3.41),(-.72,3.41),(-1.12,3.62)
    ], -4.76, cloud_mat)
    polygon("Signal projected bat", [
        (-1.08,4.34),(-.79,4.48),(-.58,4.43),(-.35,4.55),(-.21,4.64),
        (-.11,4.57),(-.10,4.79),(0,4.68),(.10,4.79),(.11,4.57),
        (.21,4.64),(.35,4.55),(.58,4.43),(.79,4.48),(1.08,4.34),
        (.78,4.00),(.58,4.16),(.42,3.93),(.22,4.09),(0,3.81),
        (-.22,4.09),(-.42,3.93),(-.58,4.16),(-.78,4.00)
    ], -4.78, dark)

    scene = bpy.context.scene
    scene.frame_start, scene.frame_end, scene.render.fps = 1, 96, 24
    for frame, angle in ((1,0),(25,.20),(49,0),(73,-.20),(97,0)):
        pivot.rotation_euler.y = angle
        pivot.keyframe_insert(data_path="rotation_euler", index=1, frame=frame)
    scene.frame_set(1)
    camera_data = bpy.data.cameras.new("Bat-Signal Preview Camera")
    camera = bpy.data.objects.new("Bat-Signal Preview Camera", camera_data)
    scene.collection.objects.link(camera)
    eye, target = Vector((3.8,3.75,-7)), Vector((0,2.05,-1.45))
    forward = (target-eye).normalized()
    right = forward.cross(Vector((0,1,0))).normalized()
    up = right.cross(forward).normalized()
    camera.matrix_world = Matrix((right, up, -forward)).transposed().to_4x4()
    camera.location = eye
    camera_data.type, camera_data.ortho_scale = "ORTHO", 7.8
    scene.camera = camera
    scene.render.resolution_x, scene.render.resolution_y = 768, 576
    key_data = bpy.data.lights.new("Preview soft key", "AREA")
    key = bpy.data.objects.new("Preview soft key", key_data)
    scene.collection.objects.link(key)
    key.location = (2,4,-3)
    key.rotation_euler = (Vector((0,.7,0))-key.location).to_track_quat("-Z","Y").to_euler()
    key_data.energy, key_data.size = 600, 4
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == "VIEW_3D":
                area.spaces.active.region_3d.view_perspective = "CAMERA"
    assert asset.location.length == 0 and len(pivot.children) == 13
    save("gotham_bat_signal")


def build_steam():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    haze = material("Steam | cool mist", (0.53, 0.59, 0.64), alpha=0.52, emission=0.12)
    edge = material("Steam | pale edge", (0.68, 0.72, 0.69), alpha=0.42, emission=0.10)
    asset = root("Gotham_Steam_Loop")
    # Runtime shows exactly one named frame root at a time, 0->3 at ~6 fps.
    frames = [
        [(-0.13, 0.16, 0, 0.22), (0.09, 0.31, 0, 0.16)],
        [(-0.19, 0.34, 0, 0.22), (0.10, 0.47, 0, 0.21), (0.25, 0.16, 0, 0.13)],
        [(-0.25, 0.52, 0, 0.21), (0.13, 0.66, 0, 0.23), (0.27, 0.29, 0, 0.14)],
        [(-0.30, 0.73, 0, 0.18), (0.13, 0.83, 0, 0.20), (0.31, 0.45, 0, 0.13)],
    ]
    for index, puffs in enumerate(frames):
        frame = bpy.data.objects.new(f"Steam_Frame_{index}", None)
        bpy.context.scene.collection.objects.link(frame)
        frame.parent = asset
        for puff_index, (x, y, z, size) in enumerate(puffs):
            box(f"frame {index} puff {puff_index}", (x, y, z),
                (size, size * 0.8, size * 0.7),
                edge if puff_index == 1 else haze, frame)
    assert len(asset.children) == 4
    save("gotham_steam_loop")


build_signal()
build_steam()
