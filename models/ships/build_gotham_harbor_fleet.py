"""Build a low-poly, pixel-styled harbor fleet for Breach City / Gotham.

Local coordinates use X length, Y up, Z beam. Mesh coordinates are converted
to Blender's Z-up convention; glTF exports with the intended Y-up orientation.
Run inside Blender. The active scene is preserved.
"""
import bpy
import math
from pathlib import Path
from mathutils import Vector

OUT = Path(__file__).resolve().parent
previous_fleet = bpy.data.scenes.get('Gotham | Harbor Fleet')
old_scene = bpy.context.window.scene
if previous_fleet and old_scene == previous_fleet:
    old_scene = bpy.data.scenes.get('Gotham | Bridge Foundry') or next((s for s in bpy.data.scenes if s != previous_fleet), None)
    if old_scene: bpy.context.window.scene = old_scene
if previous_fleet:
    for ob in list(previous_fleet.objects): bpy.data.objects.remove(ob, do_unlink=True)
    old_collection = bpy.data.collections.get('Harbor Fleet | 12 original vessels')
    if old_collection: bpy.data.collections.remove(old_collection, do_unlink=True)
    bpy.data.scenes.remove(previous_fleet, do_unlink=True)
scene = bpy.data.scenes.new('Gotham | Harbor Fleet')
bpy.context.window.scene = scene
scene.unit_settings.system = 'METRIC'
collection = bpy.data.collections.new('Harbor Fleet | 12 original vessels')
scene.collection.children.link(collection)

def mat(name, hex_color, emission=0.0):
    h = hex_color.lstrip('#')
    rgb = [int(h[i:i+2], 16)/255 for i in (0,2,4)]
    rgb = [v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in rgb]
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*rgb, 1)
    m.use_nodes = True
    bs = m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = (*rgb, 1)
    bs.inputs['Roughness'].default_value = .78
    if emission:
        bs.inputs['Emission Color'].default_value = (*rgb, 1)
        bs.inputs['Emission Strength'].default_value = emission
    return m

M = {
 'hull':mat('Gotham | graphite hull', '#303b44'), 'shadow':mat('Gotham | deep hull shadow', '#202a31'),
 'slate':mat('Gotham | harbor slate', '#56616a'), 'teal':mat('Gotham | oxidized teal', '#426a70'),
 'pale':mat('Gotham | fog ivory', '#c1b89c'), 'wood':mat('Gotham | wet timber', '#665b4c'),
 'wood2':mat('Gotham | timber edge', '#887761'), 'rust':mat('Gotham | foundry oxblood', '#8a5149'),
 'yellow':mat('Gotham | sodium lamp', '#f1b957',1.7), 'red':mat('Gotham | patrol red', '#ed4c4c',1.2),
 'blue':mat('Gotham | patrol blue', '#45b9df',1.2), 'sail':mat('Gotham | storm canvas', '#b7b19c'),
 'black':mat('Gotham | tire rubber', '#1e2428'), 'water':mat('Gotham | waterline teal', '#6f9695'),
 'label':mat('Gotham | gallery lettering', '#e0d2af',.35),
}

def pos(x,y,z): return (x,-z,y)
def mesh(parent,name,verts,faces,material):
    me=bpy.data.meshes.new(name+'_mesh'); me.from_pydata([pos(*v) for v in verts],[],faces); me.materials.append(M[material]); me.update()
    ob=bpy.data.objects.new(name,me); collection.objects.link(ob); ob.parent=parent; return ob
def box(parent,name,x,y,z,w,h,d,material):
    v=[(x+sx*w/2,y+sy*h/2,z+sz*d/2) for sx,sy,sz in [(-1,-1,-1),(1,-1,-1),(1,-1,1),(-1,-1,1),(-1,1,-1),(1,1,-1),(1,1,1),(-1,1,1)]]
    return mesh(parent,name,v,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],material)
def hull(parent,name,L,B,H,material='hull'):
    # Faceted pointed bow, flat transom, and a narrow keel; sits on Y=0.
    x=L/2; z=B/2; shoulder=L*.24
    v=[(-x,0,0),(x*.72,0,-z),(x,0,-z*.52),(x,0,z*.52),(x*.72,0,z),(-x,0,0),
       (-x*.84,H,-z*.70),(x*.60,H,-z),(x*.83,H,-z*.48),(x*.83,H,z*.48),(x*.60,H,z),(-x*.84,H,z*.70),
       (-x*.70,H*.12,0),(x*.65,H*.12,0)]
    faces=[(0,6,7,1),(1,7,8,2),(2,8,9,3),(3,9,10,4),(4,10,11,5),
           (6,11,10,9,8,7),(0,5,11,6),(0,1,2,3,4,5),(12,13,8,7),(12,11,10,9,13)]
    return mesh(parent,name,v,faces,material)
def root(name,kind,length,beam):
    for previous in list(bpy.data.objects):
        if previous.name == name or previous.name.startswith(name+'.') or previous.name.startswith(name+'_'):
            bpy.data.objects.remove(previous,do_unlink=True)
    o=bpy.data.objects.new(name,None); collection.objects.link(o)
    o['vessel_type']=kind; o['length_units']=length; o['beam_units']=beam
    o['motion_hint']={
        'Fishing boat':'gentle bob and slow drift', 'Harbor tug':'slow harbor circuit',
        'Cargo barge':'towed alongside harbor tug', 'Police and harbor patrol':'slow patrol circuit',
        'Passenger ferry':'shuttle between Bristol and Midtown', 'Sailboat':'moored near beach',
        'Rowboat':'moored near beach', 'Horizon hero ship':'slow distant passage',
    }.get(kind,'slow harbor drift')
    return o
def cabin(r,name,x,y,z,w,h,d,roof='slate'):
    box(r,name+'_cabin',x,y,z,w,h,d,'pale')
    box(r,name+'_roof',x,y+h*.55,z,w*1.13,.18,d*1.14,roof)
    for wx in [-.28,0,.28]: box(r,name+'_window',x+wx*w,y+.04,z-d*.51,.13,.2,.035,'water')
def lamp(r,name,x,y,z,color='yellow'):
    box(r,name,x,y,z,.13,.17,.13,color)
def rail(r,name,L,B,y,material='pale'):
    for s in [-1,1]:
        box(r,name+'_side',0,y,s*B*.43,L*.76,.07,.08,material)
        for i in range(5): box(r,name+'_post',-L*.36+i*L*.18,y-.16,s*B*.43,.065,.34,.065,material)

fleet=[]
# Three distinct fishing boats: trawler, longliner, and compact skiff.
for i,(name,L,B,paint) in enumerate([
 ('Fishing_Trawler_Narrows',7.4,2.65,'teal'),('Fishing_Longliner_Crown_Point',6.4,2.3,'rust'),('Fishing_Skiff_Blackgate',4.8,1.9,'slate')]):
    r=root(name,'Fishing boat',L,B); fleet.append(r); hull(r,name+'_faceted_hull',L,B,.72,paint)
    cabin(r,'Wheelhouse',-L*.17,.86,0,L*.27,.8,B*.57,'slate')
    box(r,name+'_deck',L*.15,.75,0,L*.48,.15,B*.8,'wood')
    if i<2:
        box(r,name+'_fish_crate',L*.28,1.0,-.35,.75,.42,.55,'wood2'); box(r,name+'_fish_crate',L*.28,1.0,.35,.75,.42,.55,'wood')
        box(r,name+'_mast',-L*.34,1.85,0,.1,1.2,.1,'wood2'); box(r,name+'_boom',-L*.23,2.25,0,.95,.09,.09,'wood2')
    rail(r,name+'_rail',L,B,.91,'pale'); lamp(r,name+'_bow_lamp',L*.34,1.22,0)

# Working harbor tug and low, broad cargo lighter.
r=root('Tugboat_East_Quay','Harbor tug',9.0,3.8); fleet.append(r); hull(r,'Tugboat_heavy_hull',9,3.8,.9,'hull')
box(r,'Tugboat_bow_bumper',3.35,.66,0,1.05,.42,4,'black'); cabin(r,'Tugboat_bridge',-1.25,1.04,0,2.2,1.15,2.45,'rust')
box(r,'Tugboat_funnel',-2.25,2.28,0,.72,1.15,.86,'rust'); box(r,'Tugboat_funnel_cap',-2.25,2.88,0,.9,.16,1.04,'hull')
for x in [-3.3,-2.8,-2.3,-1.8,-1.3]: lamp(r,'Tug_cabin_glow',x,1.22,-1.26)
rail(r,'Tugboat_rail',8.6,3.6,1.0)
r=root('Cargo_Barge_Gotham_River','Cargo barge',15.5,5.4); fleet.append(r); hull(r,'Cargo_Barge_box_hull',15.5,5.4,.8,'hull')
box(r,'Barge_deck',0,.86,0,13.4,.16,4.6,'wood')
for row,z in enumerate([-1.25,0,1.25]):
    for col,x in enumerate([-4.8,-2.4,0,2.4,4.8]):
        color=['rust','teal','slate'][(row+col)%3]
        box(r,'Barge_cargo_container',x,1.65+(.15 if col%2 else 0),z,2.15,1.25,1.1,color)
        box(r,'Container_roof_rib',x,2.30+(.15 if col%2 else 0),z,2.1,.08,1.14,'pale')

# GCPD harbor patrol: Gotham navy hull, ivory cabin, red/blue roof beacon.
r=root('GCPD_Harbor_Patrol','Police and harbor patrol',8.2,2.85); fleet.append(r); hull(r,'GCPD_patrol_hull',8.2,2.85,.72,'hull')
box(r,'GCPD_white_deck_stripe',0,.76,0,5.7,.18,2.72,'pale'); cabin(r,'GCPD_cabin',-.55,.98,0,2.55,1.0,2.1,'slate')
box(r,'GCPD_roof_lightbar',-.48,1.63,0,.86,.16,.32,'black'); lamp(r,'GCPD_red_beacon',-.7,1.78,0,'red'); lamp(r,'GCPD_blue_beacon',-.25,1.78,0,'blue')
box(r,'GCPD_searchlight',2.45,1.05,0,.36,.24,.4,'yellow'); rail(r,'GCPD_rail',7.7,2.65,.96)
box(r,'GCPD_hull_marking',-.55,.84,-1.43,1.8,.13,.035,'pale')

# Passenger ferry, built to bridge the Bristol–Midtown crossing.
r=root('Bristol_Midtown_Ferry','Passenger ferry',12.8,4.8); fleet.append(r); hull(r,'Ferry_double_ended_hull',12.8,4.8,.86,'teal')
box(r,'Ferry_lower_saloon',-.1,1.18,0,7.8,.8,3.65,'pale'); box(r,'Ferry_glazing_band',-.1,1.28,0,7.5,.43,3.78,'water')
box(r,'Ferry_upper_deck',-.1,1.72,0,7.8,.17,3.8,'slate'); box(r,'Ferry_upper_cabin',-.85,2.18,0,4.8,.8,2.75,'pale')
for x in [-2.65,-1.85,-1.05,-.25,.55,1.35,2.15]: box(r,'Ferry_window',x,2.18,-1.39,.48,.34,.06,'water')
box(r,'Ferry_stack',-2.45,2.86,0,.72,.63,.76,'rust'); box(r,'Ferry_stack_cap',-2.45,3.2,0,.9,.12,.94,'hull')
for x in [-4.8,-3.8,3.8,4.8]: lamp(r,'Ferry_deck_lamp',x,1.48,-1.8)

# Two leisure craft for the sheltered beaches.
r=root('Sailboat_West_Bay','Sailboat',6.8,2.5); fleet.append(r); hull(r,'Sailboat_hull',6.8,2.5,.58,'wood')
box(r,'Sailboat_deck',0,.65,0,5.7,.13,1.85,'pale'); box(r,'Sailboat_mast',-.35,2.25,0,.12,3.3,.12,'wood2')
mesh(r,'Sailboat_main_sail',[(-.25,.88,-.05),(2.25,.9,-.05),(-.25,3.65,-.05)],[(0,1,2)],'sail')
mesh(r,'Sailboat_jib',[(-.18,.9,.08),(-2.6,.95,.08),(-.18,2.9,.08)],[(0,1,2)],'pale')
box(r,'Sailboat_cabin',.4,.91,0,1.15,.45,1.35,'slate')
r=root('Rowboat_Beach_Cove','Rowboat',3.8,1.45); fleet.append(r); hull(r,'Rowboat_carved_hull',3.8,1.45,.45,'wood2')
for x in [-.8,.35,1.25]: box(r,'Rowboat_seat',x,.55,0,.12,.13,1.05,'wood')
for s in [-1,1]:
    box(r,'Rowboat_oar',-.2,.72,s*.64,1.25,.07,.08,'pale')
r=root('Schooner_West_Bay','Sailboat',8.4,3.0); fleet.append(r); hull(r,'Schooner_hull',8.4,3,.68,'teal')
box(r,'Schooner_deck',0,.75,0,7.1,.14,2.25,'wood')
for x,h in [(-1.3,3.5),(1.4,2.8)]:
    box(r,'Schooner_mast',x,.75+h/2,0,.12,h,.12,'wood2')
    mesh(r,'Schooner_canvas',[(x-.03,.9,-.06),(x+1.6,.94,-.06),(x-.03,.72+h,-.06)],[(0,1,2)],'sail')
box(r,'Schooner_cabin',-.1,.98,0,1.6,.48,1.6,'slate')
r=root('Rowboat_Blackgate_Cove','Rowboat',3.4,1.35); fleet.append(r); hull(r,'Rowboat_shallow_hull',3.4,1.35,.40,'wood')
for x in [-.65,.45]: box(r,'Rowboat_cross_seat',x,.51,0,.13,.12,1.0,'wood2')
box(r,'Rowboat_center_thwart',-.05,.51,0,.13,.12,.86,'pale')

# Large, distant container ship silhouette with readable stacked cargo.
r=root('Horizon_Container_Ship_Narrows','Horizon hero ship',28,8.2); fleet.append(r); hull(r,'Container_ship_hull',28,8.2,1.65,'hull')
box(r,'Container_ship_deck',-1.4,1.78,0,22,.2,7.5,'wood')
for row,z in enumerate([-2.25,0,2.25]):
    for col,x in enumerate([-8.7,-6.0,-3.3,-.6,2.1,4.8,7.5]):
        color=['rust','teal','slate','pale'][(row*3+col)%4]
        box(r,'Hero_container',x,2.85+row*1.5,z,2.5,1.35,1.95,color)
        for rib in [-.9,-.3,.3,.9]: box(r,'Container_corrugation',x+rib,2.86+row*1.5,z-.99,.045,1.12,.035,'shadow')
box(r,'Ship_bridge',-10.2,3.0,0,3.1,2.6,3.5,'pale'); box(r,'Ship_bridge_roof',-10.2,4.38,0,3.45,.16,3.8,'slate')
for x in [-11.15,-10.45,-9.75]: box(r,'Bridge_window',x,3.25,-1.78,.42,.48,.07,'water')
box(r,'Ship_funnel',-11.3,5.2,0,.85,1.45,.95,'rust'); box(r,'Ship_funnel_cap',-11.3,5.98,0,1.05,.14,1.14,'hull')

# Gallery display plinths, section labels, lights, and camera live in the .blend.
def text_obj(body,loc,size):
    cu=bpy.data.curves.new('label_'+body,'FONT'); cu.body=body; cu.size=size; cu.extrude=0
    ob=bpy.data.objects.new('Label_'+body,cu); collection.objects.link(ob); ob.location=pos(*loc); cu.materials.append(M['label']); return ob
for i,r in enumerate(fleet):
    col=i%4; row=i//4; gx=(col-1.5)*34; gz=(row-1)*28
    r.location=pos(gx,0,gz)
    length=r['length_units']; beam=r['beam_units']
    box_obj=box(r,r.name+'_display_marker',0,-.18,0,length+1,.2,beam+1,'shadow')
    text_obj(r.name.split('.')[0].replace('_',' '),(gx-length*.48,.04,gz-beam*.65-1.0),1.45)

def aim(obj, target): obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
cam_data=bpy.data.cameras.new('Harbor_Fleet_Camera'); cam=bpy.data.objects.new('Harbor_Fleet_Camera',cam_data); collection.objects.link(cam)
cam.location=pos(0,100,-84); aim(cam,pos(0,0,0)); cam_data.type='ORTHO'; cam_data.ortho_scale=138; scene.camera=cam
for ob in collection.objects:
    if ob.name.startswith('Label_'):
        ob.rotation_euler=(cam.location-ob.location).to_track_quat('Z','Y').to_euler()
for name,loc,power,size,color in [('Moon',(-34,62,-30),12500,35,(.62,.76,.86)),('Warm',(32,52,26),9800,28,(1,.78,.52)),('Rim',(0,42,48),10800,25,(.48,.74,.78))]:
    d=bpy.data.lights.new(name,'AREA'); d.energy=power; d.shape='DISK'; d.size=size; d.color=color
    ob=bpy.data.objects.new(name,d); collection.objects.link(ob); ob.location=pos(*loc); aim(ob,pos(0,0,0))
scene.render.engine='BLENDER_EEVEE'; scene.render.resolution_x=1800; scene.render.resolution_y=1100; scene.render.resolution_percentage=65
scene.render.image_settings.file_format='PNG'; scene.render.film_transparent=False
scene.world=bpy.data.worlds.new('Gotham Harbor Night')
scene.world.color=(.025,.045,.06); scene.view_settings.view_transform='AgX'

# Export each craft as its own clean-origin glTF. Gallery markers stay in the blend.
for r in fleet:
    bpy.ops.object.select_all(action='DESELECT')
    gallery_location=r.location.copy()
    r.location=(0,0,0)
    members=[r]+[o for o in collection.objects if o.parent==r and not o.name.endswith('_display_marker')]
    for o in members: o.select_set(True)
    bpy.context.view_layer.objects.active=r
    clean_name=r.name.split('.')[0]
    bpy.ops.export_scene.gltf(filepath=str(OUT/(clean_name.lower()+'.glb')),use_selection=True,export_apply=True,export_yup=True)
    r.location=gallery_location

# Save only this scene and its dependencies into a standalone editable .blend.
bpy.data.libraries.write(str(OUT/'gotham_harbor_fleet.blend'), {scene}, fake_user=True)
scene.render.filepath=str(OUT/'gotham_harbor_fleet.png')
if old_scene:
    bpy.context.window.scene=scene
    bpy.ops.render.render(write_still=True)
    bpy.context.window.scene=old_scene
result={'scene':'Gotham | Harbor Fleet','vessels':[r.name for r in fleet],'asset_directory':str(OUT),'blend':str(OUT/'gotham_harbor_fleet.blend'),'preview':str(OUT/'gotham_harbor_fleet.png')}
