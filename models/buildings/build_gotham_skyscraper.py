"""Build the 4 x 4 x 6 m Breach City voxel skyscraper in Blender."""

import bpy
import math
from pathlib import Path
from mathutils import Vector

OUT = Path(__file__).resolve().parent

# Work in a dedicated scene so the user's other Blender scenes stay intact.
existing = bpy.data.scenes.get("Gotham Voxel Skyscraper")
if existing:
    old_objects = list(existing.objects)
    bpy.context.window.scene = next(s for s in bpy.data.scenes if s != existing)
    bpy.data.scenes.remove(existing)
    for old in old_objects:
        if old.users == 0:
            bpy.data.objects.remove(old)
    old_mesh = bpy.data.meshes.get('GothamVoxelSkyscraperMesh')
    if old_mesh and old_mesh.users == 0:
        bpy.data.meshes.remove(old_mesh)
    for name in ('stone_midnight_purple','stone_deep_violet','stone_edge_highlight',
                 'window_recess_black','window_amber_glow','window_amber_dim',
                 'window_amber_off'):
        old_mat = bpy.data.materials.get(name)
        if old_mat and old_mat.users == 0:
            bpy.data.materials.remove(old_mat)
scene = bpy.data.scenes.new("Gotham Voxel Skyscraper")
bpy.context.window.scene = scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1.0

def material(name, color, emission=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Metallic'].default_value = 0.0
    bsdf.inputs['Roughness'].default_value = 1.0
    if emission:
        bsdf.inputs['Emission Color'].default_value = (*color, 1)
        bsdf.inputs['Emission Strength'].default_value = emission
    return mat

mats = [
    material('stone_midnight_purple', (0.075, 0.080, 0.115)),
    material('stone_deep_violet', (0.039, 0.043, 0.070)),
    material('stone_edge_highlight', (0.145, 0.155, 0.190)),
    material('window_recess_black', (0.011, 0.009, 0.023)),
    material('window_amber_glow', (0.82, 0.36, 0.12), 0.9),
    material('window_amber_dim', (0.34, 0.14, 0.045), 0.35),
    material('window_amber_off', (0.011, 0.009, 0.023)),
]

verts, faces, face_mats = [], [], []
window_panes = []

def polygon(points, mat):
    start = len(verts)
    verts.extend(points)
    faces.append(tuple(range(start, start + len(points))))
    face_mats.append(mat)

def box(name, center, size, mat):
    x,y,z = center
    a,b,c = [v/2 for v in size]
    p = [(x-a,y-b,z-c),(x+a,y-b,z-c),(x+a,y+b,z-c),(x-a,y+b,z-c),
         (x-a,y-b,z+c),(x+a,y-b,z+c),(x+a,y+b,z+c),(x-a,y+b,z+c)]
    for ids in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]:
        polygon([p[i] for i in ids], mat)

def point_prism(face, u, z, width, height, offset, mat):
    # Five-sided pointed Gothic opening: a square lower pane and low pixel-like peak.
    h = height
    local = [(-width/2,-h/2),(width/2,-h/2),(width/2,h*0.24),
             (0,h/2),(-width/2,h*0.24)]
    points=[]
    for du,dz in local:
        if face == 'front': points.append((u+du,-offset,z+dz))
        elif face == 'back': points.append((u+du,offset,z+dz))
        elif face == 'right': points.append((offset,u+du,z+dz))
        else: points.append((-offset,u+du,z+dz))
    polygon(points, mat)

def window_pane(side, column, floor, u, z, mat):
    """Keep each inset pane as a named mesh for independent runtime control."""
    h, width, offset = .35, .52, 1.844
    outline = [(-width/2,-h/2),(width/2,-h/2),(width/2,h*.24),
               (0,h/2),(-width/2,h*.24)]
    points = []
    for du, dz in outline:
        if side == 'front': points.append((u+du,-offset,z+dz))
        elif side == 'back': points.append((u+du,offset,z+dz))
        elif side == 'right': points.append((offset,u+du,z+dz))
        else: points.append((-offset,u+du,z+dz))
    name = f'window_f{floor:02d}_{side}_c{column:02d}'
    pane_mesh = bpy.data.meshes.new(name + '_mesh')
    pane_mesh.from_pydata(points, [], [tuple(range(5))])
    pane_mesh.materials.append(mats[mat])
    pane_mesh.update()
    pane = bpy.data.objects.new(name, pane_mesh)
    scene.collection.objects.link(pane)
    pane['window_id'] = name
    pane['initial_state'] = ('glow' if mat == 4 else 'dim' if mat == 5 else 'off')
    window_panes.append(pane)

def pyramid(cx, cy, zbase, half, height, mat):
    a=[(cx-half,cy-half,zbase),(cx+half,cy-half,zbase),
       (cx+half,cy+half,zbase),(cx-half,cy+half,zbase)]
    tip=(cx,cy,zbase+height)
    for i in range(4): polygon([a[i],a[(i+1)%4],tip],mat)

# Main shape. The plinth is only 0.18 m wider per side than the tower.
box('plinth', (0,0,0.115), (4.0,4.0,0.23), 1)
box('plinth_lip', (0,0,0.245), (3.94,3.94,0.065), 2)
box('tower', (0,0,2.70), (3.64,3.64,4.88), 0)

# Chunky vertical corner blocks and quiet stone pilasters.
for x in (-1.78,1.78):
    for y in (-1.78,1.78):
        box('corner', (x,y,2.70), (.18,.18,4.88), 1)
for u in (-.59,.59):
    for sign in (-1,1):
        box('front_back_pilaster', (u,sign*1.835,2.68), (.085,.09,4.84), 2)
        box('side_pilaster', (sign*1.835,u,2.68), (.09,.085,4.84), 2)

# Seven even floors; all four sides share the same three-window rhythm.
floor_centers=[.59 + i*.67 for i in range(7)]
for i, z in enumerate(floor_centers):
    for side in ('front','back','left','right'):
        for column, u in enumerate((-1.16,0,1.16), start=1):
            point_prism(side,u,z,.73,.51,1.831,3)
            # A few unlit panes echo the neighboring city blocks without
            # breaking the regular, symmetrical Gothic window grid.
            if (i+round(abs(u)))%4 == 0:
                pane_material = 6
            else:
                pane_material = 4 if (i+round(abs(u)))%3 else 5
            window_pane(side, column, i + 1, u, z, pane_material)
    if i < 6:
        # A narrow floor course makes the seven-storey count legible at game scale.
        box('floor_course', (0,0,z+.335), (3.78,3.78,.055), 1)

# A modest Art Deco crown, still inside the 4 x 4 m plot.
box('crown_lower', (0,0,5.185), (3.88,3.88,.17), 1)
box('crown_recess', (0,0,5.31), (3.42,3.42,.15), 0)
box('crown_upper', (0,0,5.435), (3.06,3.06,.13), 2)
box('roof_cap', (0,0,5.515), (2.75,2.75,.06), 1)
box('roof_center_step', (0,0,5.595), (1.38,1.38,.10), 0)

# Short matching pointed spires on the visible front roof corners.
for x in (-1.14,1.14):
    box('spire_foot', (x,-1.14,5.59), (.29,.29,.13), 1)
    box('spire_shaft', (x,-1.14,5.75), (.20,.20,.23), 2)
    pyramid(x,-1.14,5.865,.13,.135,1)

mesh=bpy.data.meshes.new('GothamVoxelSkyscraperMesh')
mesh.from_pydata(verts,[],faces)
mesh.materials.clear()
for mat in mats: mesh.materials.append(mat)
mesh.update()
for poly,mat_index in zip(mesh.polygons,face_mats): poly.material_index=mat_index
building=bpy.data.objects.new('Gotham Voxel Skyscraper | 4x4x6m',mesh)
scene.collection.objects.link(building)
building['floor_count']=7
building['dimensions_m']='4 x 4 x 6'
building['pivot']='bottom center at (0, 0, 0)'
for pane in window_panes:
    pane.parent = building

# Orthographic, 45-degree plan view. Only the asset and a dark world are visible.
cam_data=bpy.data.cameras.new('Isometric Camera')
camera=bpy.data.objects.new('Isometric Camera',cam_data)
scene.collection.objects.link(camera)
camera.location=(10,-10,14.3)
target=Vector((0,0,3.0))
camera.rotation_euler=(target-Vector(camera.location)).to_track_quat('-Z','Y').to_euler()
cam_data.type='ORTHO'
cam_data.ortho_scale=9.8
scene.camera=camera

def area(name, location, energy, color, size):
    data=bpy.data.lights.new(name,'AREA')
    ob=bpy.data.objects.new(name,data)
    scene.collection.objects.link(ob)
    ob.location=location
    ob.rotation_euler=(Vector((0,0,3))-ob.location).to_track_quat('-Z','Y').to_euler()
    data.energy=energy
    data.color=color
    data.shape='DISK'
    data.size=size

area('Cool slate key', (3,-5,10), 680, (0.70,0.76,1.0), 7)
area('Soft neutral fill', (-5,2,7), 420, (0.78,0.75,0.90), 6)

world=bpy.data.worlds.new('Plain near-black background')
world.use_nodes=True
bg=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND')
bg.inputs['Color'].default_value=(0.010,0.015,0.027,1)
bg.inputs['Strength'].default_value=.45
scene.world=world

scene.render.engine='CYCLES'
scene.cycles.samples=64
scene.render.resolution_x=384
scene.render.resolution_y=384
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.filepath=str(OUT / 'gotham_voxel_skyscraper.png')
scene.view_settings.view_transform='Standard'

# Export only the building and its individually addressable window meshes.
bpy.ops.object.select_all(action='DESELECT')
for obj in bpy.data.objects:
    obj.select_set(False)
building.select_set(True)
for pane in window_panes: pane.select_set(True)
bpy.context.view_layer.objects.active=building
bpy.ops.export_scene.gltf(filepath=str(OUT / 'gotham_voxel_skyscraper.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'gotham_voxel_skyscraper.blend'))
bpy.ops.render.render(write_still=True)
print('Created',len(verts),'vertices and',len(faces),'faces; render, GLB, and BLEND saved to',OUT)
