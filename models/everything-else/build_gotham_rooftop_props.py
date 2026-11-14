"""Build editable, Y-up rooftop props for the Gotham city game.

Run with: blender --background --python build_gotham_rooftop_props.py
"""
from pathlib import Path
import bpy
from mathutils import Vector


OUT = Path(__file__).resolve().parent
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
for collection in list(bpy.data.collections):
    if collection.name != "Collection":
        bpy.data.collections.remove(collection)
asset_collection = bpy.data.collections.get("Collection")
asset_collection.name = "Gotham Rooftop Props"


def material(name, color):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = 1
    return mat


iron = material("Roof | Charcoal Iron", (.075, .086, .115))
slate = material("Roof | Cool Slate", (.19, .23, .29))
light_slate = material("Roof | Light Slate", (.30, .36, .42))
plum = material("Roof | Muted Plum", (.21, .15, .22))
wood = material("Roof | Dark Timber", (.18, .15, .16))
amber = material("Roof | Dim Amber", (.52, .34, .16))
display = material("Roof | Billboard Neutral Display", (.10, .13, .17))


def root(name, x):
    o = bpy.data.objects.new(name, None)
    asset_collection.objects.link(o)
    o.location.x = x
    o.empty_display_type = "CUBE"
    o.empty_display_size = .24
    return o


def box(parent, name, center, size, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(parent.location.x + center[0], center[1], center[2]))
    o = bpy.context.object
    o.name = name
    o.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.parent = parent
    o.matrix_parent_inverse.identity()
    o.location = center
    o.data.materials.append(mat)
    # The game style depends on crisp voxel edges and flat face normals.
    for polygon in o.data.polygons:
        polygon.use_smooth = False
    return o


water = root("Gotham_Water_Tower", -6)
for x in (-.47, .47):
    for z in (-.47, .47):
        box(water, "Water tower timber leg", (x, .69, z), (.12, 1.38, .12), wood)
box(water, "Tank bottom", (0, 1.39, 0), (1.37, .15, 1.37), iron)
box(water, "Tank body", (0, 1.79, 0), (1.23, .71, 1.23), plum)
for y in (1.48, 1.8, 2.1):
    box(water, "Tank iron band", (0, y, 0), (1.29, .075, 1.29), iron)
box(water, "Tank lid", (0, 2.20, 0), (1.41, .13, 1.41), slate)
box(water, "Tank lid crown", (0, 2.29, 0), (.93, .08, .93), light_slate)
box(water, "Tank drain", (.63, 1.51, .32), (.13, .23, .13), iron)

ac = root("Gotham_AC_Unit", -3)
box(ac, "AC plinth", (0, .07, 0), (1.08, .14, .82), iron)
box(ac, "AC housing", (0, .36, 0), (1.00, .46, .75), slate)
box(ac, "AC top", (0, .62, 0), (1.10, .08, .85), light_slate)
for x in (-.27, 0, .27):
    box(ac, "AC front grille", (x, .36, .384), (.15, .29, .035), iron)
box(ac, "AC service box", (.34, .73, -.19), (.24, .17, .26), iron)

antenna = root("Gotham_Antenna", -.5)
box(antenna, "Antenna foot", (0, .11, 0), (.48, .22, .48), iron)
box(antenna, "Antenna lower mast", (0, .92, 0), (.14, 1.46, .14), slate)
box(antenna, "Antenna upper mast", (0, 1.78, 0), (.08, .27, .08), light_slate)
for y, width in ((1.14, .66), (1.55, .90)):
    box(antenna, "Antenna crossbar", (0, y, 0), (width, .08, .09), iron)
for x in (-.37, .37):
    box(antenna, "Antenna aerial tip", (x, 1.64, 0), (.07, .27, .07), slate)

dish = root("Gotham_Satellite_Dish", 2)
box(dish, "Dish base", (0, .09, 0), (.52, .18, .52), iron)
box(dish, "Dish pedestal", (0, .42, 0), (.12, .50, .12), slate)
# Square, stepped receiver facing +Z. Four relief blocks make the faceted silhouette.
box(dish, "Dish dark rim", (0, .89, .04), (.94, .76, .13), iron)
box(dish, "Dish reflector", (0, .89, .13), (.76, .58, .06), light_slate)
box(dish, "Dish inset", (0, .89, .17), (.49, .36, .035), slate)
box(dish, "Dish receiver arm", (0, .81, .42), (.07, .07, .49), iron)
box(dish, "Dish receiver", (0, .81, .68), (.16, .15, .16), amber)

billboard = root("Gotham_Billboard_Frame", 5.6)
for x in (-.83, .83):
    box(billboard, "Billboard foot", (x, .07, 0), (.35, .14, .39), iron)
    box(billboard, "Billboard support", (x, .65, 0), (.11, 1.05, .11), slate)
box(billboard, "Billboard back", (0, 1.56, 0), (2.30, 1.03, .12), iron)
# The runtime logo replaces this neutral front surface. The +Z face is the front.
box(billboard, "Billboard_Display", (0, 1.56, .075), (2.03, .76, .025), display)
for x in (-1.13, 1.13):
    box(billboard, "Billboard vertical frame", (x, 1.56, .085), (.09, 1.13, .16), slate)
for y in (1.02, 2.10):
    box(billboard, "Billboard horizontal frame", (0, y, .085), (2.35, .09, .16), slate)
box(billboard, "Billboard top light", (0, 2.23, .12), (.40, .11, .19), amber)

# Run with --billboard for the standalone billboard; the default exports the other props.
import sys
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.world.color = (.06, .07, .11)
if "--billboard" in sys.argv:
    keep = {billboard, *billboard.children_recursive}
    for o in list(bpy.data.objects):
        if o not in keep:
            bpy.data.objects.remove(o, do_unlink=True)
    billboard.location.x = 0
    stem = "gotham_billboard"
    active = billboard
else:
    for o in list((billboard, *billboard.children_recursive)):
        bpy.data.objects.remove(o, do_unlink=True)
    stem = "gotham_rooftop_props"
    active = water
for o in bpy.context.selected_objects:
    o.select_set(False)
for o in asset_collection.objects:
    o.select_set(True)
bpy.context.view_layer.objects.active = active
blend = OUT / (stem + ".blend")
glb = OUT / (stem + ".glb")
bpy.ops.wm.save_as_mainfile(filepath=str(blend))
bpy.ops.export_scene.gltf(filepath=str(glb), use_selection=True, export_yup=False)
print("ROOFTOP_EXPORT", blend, blend.stat().st_size, glb, glb.stat().st_size)
