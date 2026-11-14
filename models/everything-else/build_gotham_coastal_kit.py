"""Build a reusable, low-poly Gotham coastal kit without altering existing scenes.

Coordinates in helpers are runtime (X, Y-up, Z-offshore). Blender receives
(X, -Z, Y), so glTF exports the intended coordinates at unit scale.
"""
import bpy
import bmesh
import math
from pathlib import Path
from mathutils import Vector

OUT = Path(__file__).resolve().parent if '__file__' in globals() else Path(r'C:/Users/athar/Documents/somethingcity/models/everything-else')
previous_scene = bpy.context.window.scene
scene = bpy.data.scenes.new('Gotham Coastal Kit')
bpy.context.window.scene = scene
scene.unit_settings.system = 'METRIC'
roots = []

def material(name, color, roughness=.8):
    value = color.lstrip('#')
    c = [int(value[i:i+2], 16) / 255 for i in (0, 2, 4)]
    c = [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in c]
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*c, 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*c, 1)
    shader.inputs['Roughness'].default_value = roughness
    return mat

mats = {
    'sand': material('coast_dry_sand', '#baa784'),
    'sand_light': material('coast_dune_sand', '#c6b38d'),
    'wet': material('coast_wet_sand', '#938970'),
    'rock': material('coast_slate', '#505962'),
    'rock_dark': material('coast_slate_shadow', '#3d4851'),
    'wood': material('coast_weathered_timber', '#807363'),
    'darkwood': material('coast_timber_endgrain', '#514b43'),
    'grass': material('coast_dune_grass', '#7b8260'),
    'teal': material('coast_canvas_teal', '#597f7b'),
    'cream': material('coast_canvas_cream', '#c1b89c'),
    'red': material('coast_hut_oxblood', '#8c6255'),
    'roof': material('coast_patinated_roof', '#3f6266'),
    'water': material('coast_fountain_water', '#4d7883', .32),
    'stone': material('coast_cut_stone', '#858b88'),
}

def root(name):
    obj = bpy.data.objects.new(name, None)
    scene.collection.objects.link(obj)
    roots.append(obj)
    return obj

def mesh(parent, name, verts, faces, mat):
    data = bpy.data.meshes.new(name + '_mesh')
    data.from_pydata([(x, -z, y) for x, y, z in verts], [], faces)
    data.materials.append(mats[mat])
    data.update()
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.parent = parent
    return obj

def box(parent, name, x, y, z, w, h, d, mat='wood'):
    verts = [(x+sx*w/2, y+sy*h/2, z+sz*d/2) for sx,sy,sz in
             [(-1,-1,-1),(1,-1,-1),(1,-1,1),(-1,-1,1),(-1,1,-1),(1,1,-1),(1,1,1),(-1,1,1)]]
    return mesh(parent, name, verts, [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)], mat)

def cylinder(parent, name, x, y, z, radius, depth, mat='wood', n=8):
    verts = [(x+radius*math.cos(i*math.tau/n), y+side*depth/2, z+radius*math.sin(i*math.tau/n)) for side in [-1,1] for i in range(n)]
    faces = [tuple(reversed(range(n))), tuple(range(n,n*2))] + [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return mesh(parent,name,verts,faces,mat)

def gable(parent,name,x,y,z,w,h,d,mat='roof'):
    verts=[(x-w/2,y,z-d/2),(x+w/2,y,z-d/2),(x,y+h,z-d/2),(x-w/2,y,z+d/2),(x+w/2,y,z+d/2),(x,y+h,z+d/2)]
    return mesh(parent,name,verts,[(0,2,1),(3,4,5),(0,1,4,3),(1,2,5,4),(2,0,3,5)],mat)

# Broad sand sheet with a gently curved foreshore and a closed submerged body.
sand = root('Beach_Sand_Patch')
nx,nz=16,10
verts=[]
for j in range(nz+1):
    v=j/nz
    for i in range(nx+1):
        u=i/nx*2-1
        x=u*12*(1-.13*v*v)
        z=v*(9.6+.65*math.cos(u*math.pi/2))
        y=.10-1.40*v**1.7+.035*math.sin(u*math.pi*3)*math.sin(v*math.pi)
        verts.append((x,y,z))
faces=[]
for j in range(nz):
    for i in range(nx):
        a=j*(nx+1)+i
        faces.extend([(a,a+1,a+nx+2),(a,a+nx+2,a+nx+1)])
surface=mesh(sand,'Sand_curved_foreshore',verts,faces,'sand')
surface.data.materials.append(mats['sand_light'])
surface.data.materials.append(mats['wet'])
for poly in surface.data.polygons:
    row=poly.index//(nx*2)
    poly.material_index=2 if row>=7 else 1 if row<2 and poly.index%5==0 else 0
boundary=list(range(nx+1))+[j*(nx+1)+nx for j in range(1,nz+1)]+[nz*(nx+1)+i for i in range(nx-1,-1,-1)]+[j*(nx+1) for j in range(nz-1,0,-1)]
rim=[verts[i] for i in boundary]
bodyverts=rim+[(x,-1.8,z) for x,_,z in rim]
n=len(rim)
bodyfaces=[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]+[tuple(range(n,n*2))]
mesh(sand,'Sand_submerged_foundation',bodyverts,bodyfaces,'wet')

rock=root('Coast_Rock')
verts=[(-.70,.03,-.48),(.48,0,-.65),(.79,.06,.12),(.35,.02,.62),(-.58,.02,.47),(-.44,.74,-.22),(.19,1,-.18),(.48,.65,.27),(-.15,.79,.39)]
obj=mesh(rock,'Rock_facets',verts,[(0,1,6,5),(1,2,7,6),(2,3,8,7),(3,4,5,8),(4,0,5),(5,6,7,8),(0,4,3,2,1)],'rock')
obj.data.materials.append(mats['rock_dark'])
for face in obj.data.polygons: face.material_index=face.index%3==0

grass=root('Dune_Grass')
for i in range(7):
    angle=i*2.399
    x,z=.18*math.cos(angle),.18*math.sin(angle)
    h=.48+.20*(i%3)/2
    mesh(grass,f'Grass_blade_{i}',[(x-.045,0,z),(x+.045,0,z),(x+.17*math.cos(angle),h,z+.16*math.sin(angle))],[(0,1,2)],'grass')
for mat in [mats['grass']]: mat.use_backface_culling=False

umbrella=root('Beach_Umbrella')
cylinder(umbrella,'Umbrella_pole',0,.8,0,.035,1.6,'wood')
verts=[(0,1.8,0)]+[(.85*math.cos(i*math.tau/8),1.5,.85*math.sin(i*math.tau/8)) for i in range(8)]
canopy=mesh(umbrella,'Umbrella_canvas',verts,[(0,i+1,(i+1)%8+1) for i in range(8)],'teal')
canopy.data.materials.append(mats['cream'])
for f in canopy.data.polygons:f.material_index=f.index%2

lounger=root('Beach_Lounger')
for z in [-.5,.48]:
    for x in [-.27,.27]:box(lounger,'Lounger_foot',x,.13,z,.06,.26,.08)
for z in [-.55,-.28,0,.28,.53]:box(lounger,'Lounger_seat_slat',0,.28,z,.7,.065,.20,'cream')
# Inclined canvas back with side rails.
mesh(lounger,'Lounger_reclined_back',[(-.35,.28,-.72),(.35,.28,-.72),(.35,.52,-.25),(-.35,.52,-.25)],[(0,1,2,3)],'teal')

steps=root('Beach_Steps')
for i in range(7):
    box(steps,f'Step_{i}',0,.08-i*.05-.05,(i+.5)*3/7,2,.10,3/7+.015)
    if i in [0,3,6]:
        for x in [-.9,.9]:box(steps,'Step_stringer_post',x,-.30,(i+.5)*3/7,.10,.80,.10,'darkwood')

hut=root('Lifeguard_Hut')
for x in [-.72,.72]:
    for z in [-.55,.55]:box(hut,'Hut_stilt',x,.43,z,.12,.86,.12,'darkwood')
box(hut,'Hut_floor',0,.85,0,1.9,.16,1.6)
box(hut,'Hut_body',0,1.53,0,1.7,1.22,1.4,'red')
box(hut,'Hut_front_window',0,1.70,.711,1.25,.44,.025,'roof')
box(hut,'Hut_window_cross',0,1.70,.735,.06,.44,.035,'cream')
box(hut,'Hut_window_sill',0,1.46,.755,1.4,.08,.12,'cream')
gable(hut,'Hut_roof',0,2.17,0,2.05,.58,1.75)
for i in range(4):box(hut,'Hut_entry_step',0,.13+i*.18,.95-i*.14,.85,.13,.3)

jetty=root('Harbor_Jetty')
for i in range(20):box(jetty,f'Jetty_plank_{i}',0,.14,(i+.5)*7/20,2,.08,7/20-.025)
for z in [.5,2.5,4.5,6.5]:
    for x in [-.83,.83]:box(jetty,'Jetty_pile',x,-.65,z,.15,2.3,.15,'darkwood')
for x in [-.83,.83]:box(jetty,'Jetty_stringer',x,-.02,3.5,.13,.17,7,'darkwood')

stall=root('Market_Stall')
for x in [-.78,.78]:
    for z in [-.29,.29]:box(stall,'Stall_post',x,.65,z,.06,1.3,.06)
box(stall,'Stall_counter',0,.60,0,1.8,.1,.8)
box(stall,'Stall_skirt',0,.30,.32,1.75,.5,.05,'red')
gable(stall,'Stall_canopy',0,1.30,0,1.95,.2,.95,'teal')
for x in [-.55,0,.55]:box(stall,'Stall_crate',x,.76,.02,.4,.2,.45,'cream')

fountain=root('Plaza_Fountain')
cylinder(fountain,'Fountain_plinth',0,.09,0,1.4,.18,'stone',12)
cylinder(fountain,'Fountain_basin',0,.25,0,1.18,.20,'stone',12)
cylinder(fountain,'Fountain_water',0,.36,0,1.04,.025,'water',12)
cylinder(fountain,'Fountain_column',0,.70,0,.16,.68,'stone',8)
cylinder(fountain,'Fountain_upper_bowl',0,1.06,0,.5,.14,'stone',10)
cylinder(fountain,'Fountain_upper_water',0,1.14,0,.41,.025,'water',10)

bench=root('Coast_Bench')
for x in [-.58,.58]:
    box(bench,'Bench_leg',x,.20,0,.10,.40,.42,'darkwood')
    box(bench,'Bench_back_rail',x,.55,-.20,.08,.50,.08,'darkwood')
for z in [-.16,0,.16]:box(bench,'Bench_seat',0,.42,z,1.6,.065,.12)
for y in [.60,.77]:box(bench,'Bench_back_slat',0,y,-.22,1.6,.12,.055)

# Recalculate closed-model normals and update bounds before export.
for obj in scene.objects:
    if obj.type!='MESH':continue
    bm=bmesh.new();bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(obj.data);bm.free();obj.data.update()
bpy.context.view_layer.update()
scene['asset_notes']='Origin-root coastal prototypes; glTF Y-up; local Z points offshore; sand width24 with curved slope; all roots unit transforms.'
bpy.ops.export_scene.gltf(filepath=str(OUT/'gotham_coastal_kit.glb'),export_format='GLB',use_active_scene=True,use_selection=False,export_animations=False)
bounds={}
for r in roots:
    points=[]
    for obj in r.children_recursive:
        if obj.type=='MESH':
            points.extend(obj.matrix_world@Vector(corner) for corner in obj.bound_box)
    bounds[r.name]={'min':[round(min((p.x,p.z,-p.y)[axis] for p in points),3) for axis in range(3)],'max':[round(max((p.x,p.z,-p.y)[axis] for p in points),3) for axis in range(3)]}
for index, r in enumerate(roots[1:]):
    r.location = ((index % 5 - 2) * 6, -(16 + (index // 5) * 10), 0)
camera_data = bpy.data.cameras.new('Coastal_kit_camera')
camera = bpy.data.objects.new('Coastal_kit_camera',camera_data)
scene.collection.objects.link(camera)
camera.location=(35,-48,45)
camera.rotation_euler=(Vector((0,-15,0))-camera.location).to_track_quat('-Z','Y').to_euler()
camera_data.type='ORTHO';camera_data.ortho_scale=49;scene.camera=camera
scene.render.engine='BLENDER_WORKBENCH'
scene.display.shading.light='STUDIO';scene.display.shading.color_type='MATERIAL'
scene.display.shading.show_shadows=True
scene.render.resolution_x=800;scene.render.resolution_y=650;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.filepath=str(OUT/'gotham_coastal_kit.png')
bpy.data.libraries.write(str(OUT/'gotham_coastal_kit.blend'),{scene})
bpy.ops.render.render(write_still=True)
bpy.context.window.scene=previous_scene
result={'roots':bounds,'glb':str(OUT/'gotham_coastal_kit.glb'),'blend':str(OUT/'gotham_coastal_kit.blend'),'restored_scene':previous_scene.name,'mesh_objects':sum(o.type=='MESH' for o in scene.objects)}
