"""Build a studded plastic sea kit and animated sample in a dedicated Blender scene."""
import bpy
import math
from pathlib import Path
OUT = Path(r'C:/Users/athar/Documents/somethingcity/models/everything-else')
previous_scene = bpy.context.window.scene
scene = bpy.data.scenes.new('Gotham Brick Sea')
bpy.context.window.scene = scene
scene.unit_settings.system = 'METRIC'

def material(name, color, roughness):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = 0
    return mat

blue = material('sea_molded_blue_plastic', (.018, .085, .17), .28)
deep = material('sea_deep_blue', (.012, .041, .078), .38)
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, -.16))
plate = bpy.context.object
plate.name = 'Sea_Brick_Prototype'
plate.dimensions = (2.36, 2.36, .32)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
bevel = plate.modifiers.new('Molded edges', 'BEVEL')
bevel.width = .035
bevel.segments = 1
bpy.ops.object.modifier_apply(modifier=bevel.name)
bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=.53, depth=.16, location=(0, 0, .08))
stud = bpy.context.object
bevel = stud.modifiers.new('Stud rim', 'BEVEL')
bevel.width = .02
bevel.segments = 1
bpy.ops.object.modifier_apply(modifier=bevel.name)
bpy.ops.object.select_all(action='DESELECT')
plate.select_set(True)
stud.select_set(True)
bpy.context.view_layer.objects.active = plate
bpy.ops.object.join()
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
plate.data.materials.append(blue)

mesh = bpy.data.meshes.new('Sea_Horizon_Mesh')
mesh.from_pydata([(-1500,-1500,-1.7),(1500,-1500,-1.7),(1500,1500,-1.7),(-1500,1500,-1.7)], [], [(0,1,2,3)])
base = bpy.data.objects.new('Gotham_Sea_Horizon', mesh)
scene.collection.objects.link(base)
mesh.materials.append(deep)
bpy.ops.object.select_all(action='DESELECT')
plate.select_set(True)
base.select_set(True)
bpy.context.view_layer.objects.active = plate
bpy.ops.export_scene.gltf(filepath=str(OUT / 'gotham_sea.glb'), export_format='GLB', use_selection=True, use_active_scene=True, export_animations=False)

# Editable animated sample, with rigid pieces moving on twos (12fps).
scene.render.fps = 24
scene.frame_start = 1
scene.frame_end = 2161
for row in range(15):
    for col in range(15):
        x, y = (col-7)*2.4, (row-7)*2.4
        obj = bpy.data.objects.new(f'Sea_preview_{row}_{col}', plate.data)
        scene.collection.objects.link(obj)
        for frame in range(1, 2162, 10):
            t = (frame-1) / 24
            phase = t*math.tau/90
            height = -.92 + .16*math.sin(x*.13+y*.09-phase+.75*math.sin(y*.045)+.45*math.sin(x*.035)) + .05*math.sin(y*.23-x*.065+phase+.3*math.sin(y*.05))
            obj.location = (x,y,round(height/.04)*.04)
            obj.keyframe_insert(data_path='location', frame=frame)
        for layer in obj.animation_data.action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for curve in bag.fcurves:
                        for key in curve.keyframe_points:
                            key.interpolation = 'CONSTANT'
plate.hide_render = True
plate.hide_set(True)
scene.frame_set(1)
scene['asset_notes'] = 'Studded plastic plate kit. Runtime instancing and rigid 12fps wave motion. Source includes an animated 15x15 plate patch.'
bpy.data.libraries.write(str(OUT / 'gotham_sea.blend'), {scene})
bpy.context.window.scene = previous_scene
result = {'glb': str(OUT/'gotham_sea.glb'), 'blend': str(OUT/'gotham_sea.blend'), 'prototype_vertices': len(plate.data.vertices), 'preview_plates': 225, 'animation_fps':12}
