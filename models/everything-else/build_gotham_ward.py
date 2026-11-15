"""Build and export the low-poly 3D Gotham ward environment for BreachLink."""

import math
from pathlib import Path

import bpy


OUT = Path(__file__).resolve().parent
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = "BreachLink | Gotham Ward"
scene.unit_settings.system = "METRIC"
scene.unit_settings.scale_length = 1.0
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1440
scene.render.resolution_y = 1000
scene.render.resolution_percentage = 100


def make_material(name, color, roughness=0.9, metallic=0.0, emission=None, strength=0.0):
    material = bpy.data.materials.new(name)
    material.diffuse_color = (*color, 1.0)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1.0)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    if emission is not None:
        shader.inputs["Emission Color"].default_value = (*emission, 1.0)
        shader.inputs["Emission Strength"].default_value = strength
    return material


materials = {
    "foundation": make_material("ward_foundation", (0.075, 0.09, 0.11)),
    "terrain": make_material("ward_slate_ground", (0.18, 0.21, 0.22)),
    "block": make_material("block_ironstone", (0.30, 0.30, 0.29)),
    "block_alt": make_material("block_wet_asphalt", (0.22, 0.25, 0.26)),
    "street": make_material("street_charcoal", (0.10, 0.12, 0.14)),
    "lane": make_material("lane_muted_brass", (0.55, 0.47, 0.29), emission=(0.18, 0.13, 0.045), strength=0.22),
    "water": make_material("gotham_river_deep_teal", (0.025, 0.14, 0.17), 0.34, 0.08, (0.018, 0.07, 0.09), 0.42),
    "water_line": make_material("river_current_sheen", (0.12, 0.28, 0.29), 0.42, 0.08, (0.05, 0.12, 0.13), 0.3),
    "bridge": make_material("bridge_old_limestone", (0.47, 0.41, 0.31)),
    "rail": make_material("bridge_rail_weathered_brass", (0.57, 0.49, 0.33), 0.62, 0.2),
    "park": make_material("park_moss", (0.16, 0.25, 0.19)),
    "path": make_material("park_gravel", (0.43, 0.39, 0.30)),
    "trunk": make_material("tree_bark", (0.17, 0.17, 0.15)),
    "canopy": make_material("tree_night_pine", (0.24, 0.32, 0.23)),
    "lamp": make_material("streetlamp_iron", (0.22, 0.24, 0.23), 0.7, 0.25),
    "lamp_glow": make_material("streetlamp_amber", (0.8, 0.57, 0.25), 0.5, 0.0, (0.95, 0.53, 0.18), 2.1),
    "buildings": [
        make_material("neighborhood_slate_01", (0.24, 0.25, 0.28)),
        make_material("neighborhood_slate_02", (0.31, 0.28, 0.27)),
        make_material("neighborhood_slate_03", (0.20, 0.25, 0.27)),
        make_material("neighborhood_slate_04", (0.28, 0.27, 0.30)),
        make_material("neighborhood_slate_05", (0.21, 0.23, 0.23)),
    ],
    "windows": make_material("neighborhood_windows_amber", (0.54, 0.31, 0.13), 0.55, 0.0, (0.8, 0.34, 0.08), 0.65),
    "windows_off": make_material("neighborhood_windows_unlit", (0.07, 0.08, 0.09)),
}


boxes = {}


def add_box(group, center, size):
    boxes.setdefault(group, []).append((center, size))


def add_cube_mesh(group, entries):
    vertices = []
    faces = []
    for center, size in entries:
        cx, cy, cz = center
        sx, sy, sz = (component / 2 for component in size)
        base = len(vertices)
        vertices.extend([
            (cx - sx, cy - sy, cz - sz), (cx + sx, cy - sy, cz - sz),
            (cx + sx, cy + sy, cz - sz), (cx - sx, cy + sy, cz - sz),
            (cx - sx, cy - sy, cz + sz), (cx + sx, cy - sy, cz + sz),
            (cx + sx, cy + sy, cz + sz), (cx - sx, cy + sy, cz + sz),
        ])
        faces.extend(tuple(base + index for index in face) for face in (
            (0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
            (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7),
        ))
    mesh = bpy.data.meshes.new(f"{group}_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(group_material(group))
    mesh.update()
    obj = bpy.data.objects.new(group, mesh)
    scene.collection.objects.link(obj)
    obj["asset_role"] = group
    return obj


def group_material(group):
    if group.startswith("neighborhood_slate"):
        index = int(group.rsplit("_", 1)[1]) - 1
        return materials["buildings"][index]
    return materials[group]


add_box("foundation", (0, -0.42, 0), (48, 0.6, 48))
add_box("terrain", (0, -0.08, 0), (44.5, 0.08, 44.5))

# Three-by-three block pads leave two-meter cross streets and one clear central tower lot each.
centers = (-12, 0, 12)
for row, z in enumerate(centers):
    for column, x in enumerate(centers):
        add_box("block", (x, 0.02, z), (8.2, 0.25, 8.2))
        add_box("block_alt" if (row + column) % 2 else "terrain", (x, 0.19, z), (7.85, 0.08, 7.85))

for x in (-6, 6):
    add_box("street", (x, 0.005, 0), (2.0, 0.06, 40))
    for offset in (-0.77, 0.77):
        add_box("lane", (x + offset, 0.045, 0), (0.08, 0.012, 40))
for z in (-6, 6):
    add_box("street", (0, 0.005, z), (40, 0.06, 2.0))
    for offset in (-0.77, 0.77):
        add_box("lane", (0, 0.045, z + offset), (40, 0.012, 0.08))

# Build one smooth, narrow S-curve river ribbon through the street grid.
river_vertices = []
river_faces = []
river_width = 1.55
steps = 88
for step in range(steps + 1):
    z = -24 + step * 48 / steps
    x = -6.0 + 0.75 * math.sin(z * 0.34) + 0.25 * math.sin(z * 0.72)
    dz = 0.001
    next_x = -6.0 + 0.75 * math.sin((z + dz) * 0.34) + 0.25 * math.sin((z + dz) * 0.72)
    tangent_x = next_x - x
    tangent_z = dz
    magnitude = math.hypot(tangent_x, tangent_z)
    normal_x = -tangent_z / magnitude
    normal_z = tangent_x / magnitude
    river_vertices.extend([
        (x + normal_x * river_width, 0.071, z + normal_z * river_width),
        (x - normal_x * river_width, 0.071, z - normal_z * river_width),
    ])
    if step < steps:
        base = step * 2
        river_faces.append((base, base + 1, base + 3, base + 2))

river_mesh = bpy.data.meshes.new("gotham_river_mesh")
river_mesh.from_pydata(river_vertices, [], river_faces)
river_mesh.materials.append(materials["water"])
river_mesh.update()
river = bpy.data.objects.new("Gotham River | S-curve waterway", river_mesh)
scene.collection.objects.link(river)
river["asset_role"] = "river"

# Pale current marks on the water surface.
for index in range(14):
    z = -21 + index * 3.1
    x = -6.0 + 0.75 * math.sin(z * 0.34) + 0.25 * math.sin(z * 0.72)
    add_box("water_line", (x + (0.35 if index % 2 else -0.35), 0.091, z), (0.95 + (index % 3) * 0.22, 0.018, 0.035))

# Two bridge decks align to the east-west cross streets.
for z in (-6, 6):
    add_box("bridge", (-6, 0.12, z), (4.7, 0.38, 2.05))
    for side in (-1, 1):
        add_box("rail", (-6, 0.40, z + side * 0.91), (4.7, 0.13, 0.12))
        for x_offset in (-2.0, -0.7, 0.7, 2.0):
            add_box("bridge", (-6 + x_offset, 0.32, z + side * 0.91), (0.13, 0.45, 0.13))
    for x_offset in (-1.65, 1.65):
        add_box("bridge", (-6 + x_offset, -0.13, z), (0.45, 1.25, 0.45))

# Seven low-rise procedural city silhouettes around each reserved account tower plot.
offsets = [(-2.85, -2.7), (-0.4, -3.0), (2.8, -2.7), (-3.0, 1.1), (3.0, 1.2), (-2.7, 3.0), (2.7, 3.0)]
for seed, (cx, cz) in enumerate(( (x, z) for z in centers for x in centers )):
    for index, (dx, dz) in enumerate(offsets):
        width = 1.65 if index % 3 == 0 else 1.25
        depth = 1.45 if index % 2 == 0 else 1.7
        floors = 1 + ((seed * 3 + index * 5) % 4)
        height = floors * 0.72 + 0.5
        x, z = cx + dx, cz + dz
        group = f"neighborhood_slate_{(seed + index) % len(materials['buildings']) + 1}"
        add_box(group, (x, 0.34 + height / 2, z), (width, height, depth))
        add_box(group, (x, 0.34 + height + 0.06, z), (width + 0.1, 0.12, depth + 0.1))
        for floor in range(min(floors, 3)):
            for pane_index, pane_x in enumerate((-0.38, 0.38)):
                pane_group = "windows_off" if (floor + index + seed + pane_index) % 3 == 0 else "windows"
                face_z = z - depth / 2 - 0.012
                add_box(pane_group, (x + pane_x, 0.6 + floor * 0.72, face_z), (0.2, 0.23, 0.025))

# A small planted square distinguishes the southeastern neighborhood.
add_box("park", (12, 0.26, 12), (5.8, 0.12, 5.7))
add_box("path", (12, 0.335, 12), (0.42, 0.035, 5.7))
add_box("path", (12, 0.335, 12), (5.8, 0.035, 0.42))
for x, z in ((10.2, 10.3), (13.8, 10.3), (10.2, 13.7), (13.8, 13.7)):
    add_box("trunk", (x, 0.83, z), (0.32, 1.1, 0.32))

# Harbor lamps on the western edge.
for index in range(6):
    z = -20 + index * 8
    x = -20 + (index % 2) * 2
    add_box("lamp", (x, 1.0, z), (0.11, 2.0, 0.11))
    add_box("lamp_glow", (x, 2.12, z), (0.22, 0.22, 0.22))

for group, entries in boxes.items():
    add_cube_mesh(group, entries)

# Tree canopies use a shared low-poly ico-sphere mesh and material.
for x, z in ((10.2, 10.3), (13.8, 10.3), (10.2, 13.7), (13.8, 13.7)):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.78, location=(x, 1.7, z))
    canopy = bpy.context.object
    canopy.name = "park_tree_canopy"
    canopy.scale = (1.0, 0.78, 1.0)
    canopy.data.materials.append(materials["canopy"])
    canopy["asset_role"] = "park_tree"

# Store a useful isometric camera and lights in the editable Blender source scene.
world = bpy.data.worlds.new("Gotham night world")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.025, 0.035, 0.05, 1.0)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.35
scene.world = world

bpy.ops.object.camera_add(location=(24, 29, 25))
camera = bpy.context.object
camera.name = "BreachLink Isometric Camera"
camera.data.type = "ORTHO"
camera.data.ortho_scale = 48
camera.rotation_euler = (math.radians(32), 0, math.radians(42))
direction = -camera.location
camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
scene.camera = camera

bpy.ops.object.light_add(type="AREA", location=(-18, 28, 12))
key = bpy.context.object
key.name = "Moonlight key"
key.data.energy = 2500
key.data.shape = "DISK"
key.data.size = 22
bpy.ops.object.light_add(type="AREA", location=(20, 14, -18))
rim = bpy.context.object
rim.name = "Warm city rim"
rim.data.energy = 850
rim.data.color = (1.0, 0.69, 0.42)
rim.data.size = 18

scene.view_settings.view_transform = "AgX"
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = str(OUT / "gotham_ward_environment_preview.png")

# The shared app convention is Y-up. Author the clean modeling coordinates in that
# convention, then rotate the asset parent so the editable Blender scene uses Blender's
# standard Z-up view. glTF export converts Z-up back to Y-up, leaving the runtime aligned.
basis = bpy.data.objects.new("Environment coordinate basis | app Y-up", None)
scene.collection.objects.link(basis)
basis.rotation_euler.x = math.radians(90)
for obj in list(scene.objects):
    if obj.type == "MESH":
        obj.parent = basis

bpy.ops.wm.save_as_mainfile(filepath=str(OUT / "gotham_ward_environment.blend"))

# Export the environment meshes only; account towers are instanced separately by the dashboard.
bpy.ops.object.select_all(action="DESELECT")
for obj in scene.objects:
    if obj.type == "MESH":
        obj.select_set(True)
bpy.context.view_layer.objects.active = next(obj for obj in scene.objects if obj.type == "MESH")
bpy.ops.export_scene.gltf(filepath=str(OUT / "gotham_ward_environment.glb"), export_format="GLB", use_selection=True, export_apply=True, export_yup=True)
print(f"Exported Gotham ward environment to {OUT}")
