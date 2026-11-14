"""Build the editable, Y-up Gotham blimp and its runtime GLB.

Run in a separate Blender process: blender -b -P build_gotham_blimp.py
"""
from pathlib import Path
from math import cos, sin, pi
import bpy


OUT = Path(__file__).resolve().parent
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 768
scene.render.resolution_y = 768
scene.render.resolution_percentage = 100
if scene.world is None: scene.world = bpy.data.worlds.new("Gotham World")
scene.world.color = (.025, .035, .06)


def mat(name, rgb, alpha=1):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*rgb, alpha)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*rgb, alpha)
    bsdf.inputs["Roughness"].default_value = .92
    bsdf.inputs["Alpha"].default_value = alpha
    if alpha < 1:
        m.surface_render_method = "BLENDED"
    return m


envelope = mat("Blimp | Midnight Slate Envelope", (.13, .17, .23))
facet = mat("Blimp | Muted Plum Facet", (.19, .14, .20))
dark = mat("Blimp | Dark Iron", (.035, .045, .06))
glass = mat("Blimp | Dark Glass", (.045, .09, .13))
amber = mat("Blimp | Warm Cabin Windows", (.55, .34, .15))
search = mat("Blimp | Pale Searchlight Fixture", (.39, .49, .58))
beam = mat("Blimp | Faint Searchlight Beam", (.31, .45, .62), .11)

asset = bpy.data.collections.new("Gotham_Blimp")
scene.collection.children.link(asset)
root = bpy.data.objects.new("Gotham_Blimp", None)
asset.objects.link(root)
root.empty_display_type = "CUBE"
root.empty_display_size = .35
root["forward_axis"] = "+Z"
root["up_axis"] = "+Y"


def box(name, loc, size, material, parent=root):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.name = name
    for c in list(o.users_collection):
        c.objects.unlink(o)
    asset.objects.link(o)
    o.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(material)
    o.parent = parent
    return o


# Six angular envelope stations and eight flat facets, bow at +Z.
stations = [(-2.45, .18, .20), (-1.9, .64, .59), (-.9, .86, .76),
            (.55, .93, .80), (1.72, .65, .58), (2.45, .13, .17)]
vertices = []
for z, width, height in stations:
    for k in range(8):
        a = 2 * pi * k / 8
        vertices.append((width * cos(a), height * sin(a), z))
faces = [tuple(range(7, -1, -1)), tuple(range(40, 48))]
for i in range(len(stations)-1):
    for k in range(8):
        faces.append((i*8+k, i*8+(k+1)%8, (i+1)*8+(k+1)%8, (i+1)*8+k))
mesh = bpy.data.meshes.new("Blimp faceted envelope mesh")
mesh.from_pydata(vertices, [], faces)
mesh.materials.append(envelope)
mesh.materials.append(facet)
mesh.update()
for i, poly in enumerate(mesh.polygons):
    poly.material_index = 1 if i % 8 in (1, 5) else 0
body = bpy.data.objects.new("Faceted airship envelope", mesh)
asset.objects.link(body)
body.parent = root

box("Gondola cabin", (0, -1.04, -.23), (.92, .43, 1.30), dark)
box("Gondola roof rim", (0, -.80, -.23), (1.03, .09, 1.43), envelope)
box("Gondola forward window", (0, -1.01, .43), (.64, .25, .035), amber)
box("Gondola port window", (-.48, -1.03, -.28), (.035, .19, .49), glass)
box("Gondola starboard window", (.48, -1.03, -.28), (.035, .19, .49), glass)
box("Gondola undersill", (0, -1.30, -.23), (.74, .10, 1.12), facet)
box("Port suspension", (-.33, -.80, -.23), (.08, .39, .08), dark)
box("Starboard suspension", (.33, -.80, -.23), (.08, .39, .08), dark)
box("Upper tail fin", (0, .80, -1.94), (.14, .68, .58), dark)
box("Port tail fin", (-.78, 0, -1.94), (.77, .13, .58), dark)
box("Starboard tail fin", (.78, 0, -1.94), (.77, .13, .58), dark)
box("Propeller axle", (0, -.93, -1.13), (.12, .12, .56), dark)
box("Propeller horizontal blade", (0, -.93, -1.46), (.67, .09, .09), search)
box("Propeller vertical blade", (0, -.93, -1.46), (.09, .67, .09), search)

# Turn this named pivot around its local Z axis to sweep the pale beam.
pivot = bpy.data.objects.new("Blimp_Searchlight_Pivot", None)
asset.objects.link(pivot)
pivot.parent = root
pivot.location = (0, -1.32, .05)
pivot.empty_display_size = .15
box("Searchlight fixture", (0, -.10, 0), (.28, .22, .33), search, pivot)
box("Searchlight dark back", (0, .035, 0), (.22, .06, .27), dark, pivot)

spot_data = bpy.data.lights.new("Blimp faint searchlight", "SPOT")
spot_data.color = (.48, .64, .82)
spot_data.energy = 90
spot_data.spot_size = .36
spot_data.spot_blend = .4
spot_data.shadow_soft_size = .08
spot = bpy.data.objects.new("Blimp faint searchlight", spot_data)
asset.objects.link(spot)
spot.parent = pivot
spot.location = (0, -.22, 0)
spot.rotation_euler = (-pi/2, 0, 0)

# A translucent faceted cone keeps the searchlight readable in the game camera.
cone_verts = []
for y, radius in [(-.23, .08), (-4.4, .64)]:
    for k in range(8):
        a = 2*pi*k/8
        cone_verts.append((radius*cos(a), y, radius*sin(a)))
cone_faces = [(k, (k+1)%8, (k+1)%8+8, k+8) for k in range(8)]
cone_mesh = bpy.data.meshes.new("Searchlight eight-sided beam mesh")
cone_mesh.from_pydata(cone_verts, [], cone_faces)
cone_mesh.materials.append(beam)
cone_mesh.update()
cone = bpy.data.objects.new("Faint searchlight cone", cone_mesh)
asset.objects.link(cone)
cone.parent = pivot

# Put the placement origin at the gondola center while preserving its assembly.
for part in root.children:
    part.location.y += 1.04
    part.location.z += .23

# Preview-only camera and key light; runtime export selects only the asset root.
camera_data = bpy.data.cameras.new("Preview three-quarter camera")
camera = bpy.data.objects.new("Preview three-quarter camera", camera_data)
scene.collection.objects.link(camera)
camera.location = (6, 3, 6)
camera.rotation_euler = (-camera.location).to_track_quat("-Z", "Y").to_euler()
camera_data.type = "ORTHO"
camera_data.ortho_scale = 7.6
scene.camera = camera
key_data = bpy.data.lights.new("Preview soft key", "AREA")
key_data.energy = 650
key_data.size = 6
key = bpy.data.objects.new("Preview soft key", key_data)
scene.collection.objects.link(key)
key.location = (2, 4, 2)
key.rotation_euler = (-key.location).to_track_quat("-Z", "Y").to_euler()

OUT.mkdir(parents=True, exist_ok=True)
stem = OUT / "gotham_blimp"
bpy.ops.object.select_all(action="DESELECT")
root.select_set(True)
for child in root.children_recursive:
    child.select_set(True)
bpy.context.view_layer.objects.active = root
bpy.ops.export_scene.gltf(filepath=str(stem.with_suffix(".glb")), use_selection=True, export_yup=False, export_lights=True)
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(stem.with_suffix(".blend")))
print("SAVED", stem.with_suffix(".blend"), stem.with_suffix(".glb"))
