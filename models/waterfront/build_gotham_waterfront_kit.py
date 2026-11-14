"""Build the Gotham waterfront kit without altering the active Blender scene.

Local model coordinates use X across the shore, Y up and positive Z offshore.
The gallery is editable in Blender; the GLB contains named origin-root
prototypes for placement in the Breach City Three.js scene.
"""
import bpy, math
from pathlib import Path
from mathutils import Vector

OUT=Path(__file__).resolve().parent
old_scene=bpy.context.window.scene
previous=bpy.data.scenes.get('Gotham | Waterfront Kit')
if previous:
    for ob in list(previous.objects): bpy.data.objects.remove(ob,do_unlink=True)
    old_collection=bpy.data.collections.get('Waterfront Prototypes')
    if old_collection: bpy.data.collections.remove(old_collection,do_unlink=True)
    bpy.data.scenes.remove(previous,do_unlink=True)
scene=bpy.data.scenes.new('Gotham | Waterfront Kit')
bpy.context.window.scene=scene
scene.unit_settings.system='METRIC'
collection=bpy.data.collections.new('Waterfront Prototypes')
scene.collection.children.link(collection)

def mat(name,hex_color,emission=0,alpha=1):
    h=hex_color.lstrip('#'); rgb=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    rgb=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb]
    m=bpy.data.materials.new(name); m.diffuse_color=(*rgb,alpha); m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value=(*rgb,alpha); bs.inputs['Roughness'].default_value=.82
    bs.inputs['Alpha'].default_value=alpha
    if emission:
        bs.inputs['Emission Color'].default_value=(*rgb,1); bs.inputs['Emission Strength'].default_value=emission
    return m
M={
 'slate':mat('Gotham | sea wall slate','#59636a'),'dark':mat('Gotham | deep graphite','#303a42'),
 'shadow':mat('Gotham | shadow metal','#20282e'),'concrete':mat('Gotham | fog concrete','#888a82'),
 'pale':mat('Gotham | fog ivory','#c1b89c'),'wood':mat('Gotham | wet timber','#665b4c'),
 'wood2':mat('Gotham | worn timber edges','#89765f'),'teal':mat('Gotham | oxidized teal','#426a70'),
 'water':mat('Gotham | harbor glass','#719298'),'rust':mat('Gotham | foundry oxblood','#8a5149'),
 'red':mat('Gotham | old signal red','#a15349'),'amber':mat('Gotham | sodium lantern','#f1b957',2.2),
 'beam':mat('Gotham | rotating lantern beam','#f3d98f',1.2,.28),'blue':mat('Gotham | quay blue','#516c74'),
 'green':mat('Gotham | warehouse green','#52635b'),'yellow':mat('Gotham | safety ochre','#c6a25e'),
 'skin':mat('Gotham | figure warm stone','#b78e6b'),'coat':mat('Gotham | figure dark coat','#39454d'),
 'scarf':mat('Gotham | figure muted red','#985951'),'net':mat('Gotham | net cord','#c2b99e'),
 'label':mat('Gotham | gallery lettering','#e0d2af',.4),
}

def conv(x,y,z): return (x,-z,y)
def mesh(parent,name,verts,faces,material):
    me=bpy.data.meshes.new(name+'_mesh'); me.from_pydata([conv(*v) for v in verts],[],faces)
    me.materials.append(M[material]); me.update()
    ob=bpy.data.objects.new(name,me); collection.objects.link(ob); ob.parent=parent; return ob
def box(parent,name,x,y,z,w,h,d,material):
    v=[(x+sx*w/2,y+sy*h/2,z+sz*d/2) for sx,sy,sz in [(-1,-1,-1),(1,-1,-1),(1,-1,1),(-1,-1,1),(-1,1,-1),(1,1,-1),(1,1,1),(-1,1,1)]]
    return mesh(parent,name,v,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],material)
def cylinder(parent,name,x,y,z,radius,depth,material,n=10,top_radius=None):
    tr=radius if top_radius is None else top_radius
    v=[]
    for yy,rr in [(y-depth/2,radius),(y+depth/2,tr)]:
        v += [(x+rr*math.cos(i*math.tau/n),yy,z+rr*math.sin(i*math.tau/n)) for i in range(n)]
    f=[tuple(reversed(range(n))),tuple(range(n,n*2))]
    f += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return mesh(parent,name,v,f,material)
def root(name,kind='waterfront prop',length=1,width=1,height=1):
    for ob in list(bpy.data.objects):
        if ob.name==name or ob.name.startswith(name+'.') or ob.name.startswith(name+'_'):
            bpy.data.objects.remove(ob,do_unlink=True)
    o=bpy.data.objects.new(name,None); collection.objects.link(o)
    o['asset_type']=kind; o['length_units']=length; o['width_units']=width; o['height_units']=height
    return o
def ridge_roof(parent,name,x,y,z,w,h,d,material='rust'):
    v=[(x-w/2,y,z-d/2),(x+w/2,y,z-d/2),(x,y+h,z-d/2),(x-w/2,y,z+d/2),(x+w/2,y,z+d/2),(x,y+h,z+d/2)]
    return mesh(parent,name,v,[(0,2,1),(3,4,5),(0,1,4,3),(1,2,5,4),(2,0,3,5)],material)

roots=[]
# North Head hero lighthouse. A transparent wedge is kept under its own pivot
# so the runtime can sweep it around the beacon without rotating the masonry.
r=root('Lighthouse_North_Head','hero lighthouse',7,7,15); roots.append(r)
cylinder(r,'Lighthouse_base_plinth',0,.24,0,3.2,.48,'slate',12)
cylinder(r,'Lighthouse_lower_shaft',0,4.1,0,2.45,7.35,'pale',12,1.82)
for yy,rr in [(1.2,2.27),(7.5,1.86),(8.0,1.82)]: cylinder(r,'Lighthouse_oxblood_band',0,yy,0,rr,.38,'rust',12)
cylinder(r,'Lighthouse_gallery',0,8.0,0,2.25,.32,'dark',12)
for i in range(12):
    a=i*math.tau/12; cylinder(r,'Lighthouse_gallery_post',2.0*math.cos(a),8.42,2*math.sin(a),.075,.68,'pale',6)
cylinder(r,'Lighthouse_lantern_room',0,9.13,0,1.72,1.72,'teal',12,1.52)
for i in range(8):
    a=i*math.tau/8; box(r,'Lighthouse_lantern_window',1.53*math.cos(a),9.16,1.53*math.sin(a),.58,.86,.08,'amber')
cylinder(r,'Lighthouse_lantern_cap',0,10.18,0,1.85,.3,'dark',12)
ridge_roof(r,'Lighthouse_roof',0,10.34,0,3.3,1.35,3.3,'rust')
cylinder(r,'Lighthouse_roof_finial',0,11.18,0,.25,.4,'yellow',8)
for yy in [2.5,4.2,6.0]:
    for side in [-1,1]: box(r,'Lighthouse_window',side*(2.2-yy*.035),yy,0,.08,.52,.4,'water')
box(r,'Lighthouse_entry',0,.95,2.36,.92,1.62,.1,'dark')
pivot=bpy.data.objects.new('Lighthouse_Beam_Sweep',None); collection.objects.link(pivot); pivot.parent=r; pivot.location=conv(0,10.0,0)
beam_verts=[(.7,-.24,0),(17,-.48,-2.2),(17,-.48,2.2),(.7,.24,0),(17,.48,-2.2),(17,.48,2.2)]
beam=mesh(pivot,'Lighthouse_rotating_light_beam',beam_verts,[(0,1,2),(3,5,4),(0,3,4,1),(0,2,5,3),(1,4,5,2)],'beam')
beam['dynamic_sweep']=True

# Modular boardwalk; the source coastal kit's shorter Harbor_Jetty remains in use.
r=root('Beach_Boardwalk_Segment','modular beach boardwalk',8,12,.7); roots.append(r)
box(r,'Boardwalk_underbeam_left',-3.55,-.05,6,.22,.38,12,'dark'); box(r,'Boardwalk_underbeam_right',3.55,-.05,6,.22,.38,12,'dark')
for i in range(24): box(r,'Boardwalk_plank',0,.18,(i+.5)*.5,7.6,.16,.43,'wood' if i%4 else 'wood2')
for side in [-1,1]:
    for z in [1,5,9,12]:
        cylinder(r,'Boardwalk_pile',side*3.38,-.52,z,.18,1.55,'dark',8)
        if z<12:
            box(r,'Boardwalk_rail_post',side*3.55,.86,z,.14,1.35,.14,'wood2')
    box(r,'Boardwalk_top_rail',side*3.55,1.48,6,.18,.16,12,'wood2')

# Fishing pier with three simple Gotham dockworkers/anglers for scale.
r=root('Fishing_Pier_People','fishing pier with figures',5,5,2.2); roots.append(r)
for x in [-2.05,2.05]:
    box(r,'Fishing_Pier_stringer',x,-.02,9,.17,.28,18,'dark')
    for z in [1,5,9,13,17]: cylinder(r,'Fishing_Pier_pile',x,-.58,z,.19,1.65,'wood2',8)
for i in range(36): box(r,'Fishing_Pier_deck_plank',0,.19,(i+.5)*.5,4.2,.14,.43,'wood' if i%5 else 'wood2')
for side in [-1,1]:
    for z in [1,5,9,13,17]: box(r,'Fishing_Pier_rail_post',side*2.02,.72,z,.12,1.05,.12,'wood2')
    box(r,'Fishing_Pier_rail',side*2.02,1.26,9,.13,.14,18,'wood2')
def person(parent,name,x,z,coat='coat',hat=False):
    box(parent,name+'_legs',x,.65,z,.42,.62,.34,'dark')
    box(parent,name+'_coat',x,1.18,z,.58,.66,.44,coat)
    cylinder(parent,name+'_head',x,1.73,z,.19,.32,'skin',8)
    box(parent,name+'_cap',x,1.92,z,.4,.12,.36,'dark')
    box(parent,name+'_arm_left',x-.39,1.20,z,.18,.58,.18,coat)
    box(parent,name+'_arm_right',x+.38,1.20,z,.18,.58,.18,coat)
person(r,'Angler_West',-.8,5,'scarf'); person(r,'Dockworker_Center',.72,9,'coat'); person(r,'Angler_East',-.55,13,'teal')
for z in [5,13]: box(r,'Fishing_Rod',-1.15,2.05,z+.5,.045,1.65,.045,'wood2')

# Floating dock with six boat slips and mooring bollards.
r=root('Marina_Floating_Slips','floating marina with six slips',16,15,1.2); roots.append(r)
box(r,'Marina_main_walkway',0,.28,8,2.6,.42,16,'wood2')
for x in [-.86,.86]:
    for z in [1,4,7,10,13,15]: box(r,'Marina_float',x,-.12,z,1.05,.46,1.45,'teal')
for side in [-1,1]:
    for z in [2.4,5.0,7.6,10.2,12.8]:
        box(r,'Marina_finger_pier',side*4.15,.23,z,5.7,.38,1.0,'wood')
        for x in [side*1.8,side*6.3]:
            cylinder(r,'Marina_finger_pile',x,-.45,z,.14,1.1,'dark',8)
        for x in [side*1.35,side*6.55]: cylinder(r,'Marina_bollard',x,.59,z,.13,.42,'dark',8,.09)
for z in [0,16]:
    for x in [-.9,.9]: cylinder(r,'Marina_corner_pile',x,-.38,z,.16,1.1,'dark',8)

# Rock breakwater terminating in a compact warning light.
r=root('Breakwater_Harbor_Light','rock breakwater with harbor light',30,7,3.2); roots.append(r)
for i in range(25):
    z=i*1.12+.2; x=math.sin(i*2.31)*.7
    cylinder(r,'Breakwater_core_rock',x,-.52,z,1.9,.95,'dark' if i%4==0 else 'slate',7,1.45)
    for side in [-1,1]:
        xx=x+side*(1.25+.17*(i%3)); cylinder(r,'Breakwater_face_rock',xx,.02+(.12 if i%2 else 0),z+.18,.88,.62,'slate' if i%3 else 'concrete',7,.66)
cylinder(r,'Breakwater_beacon_pedestal',0,.7,27.8,.9,1.35,'dark',8)
cylinder(r,'Breakwater_light_post',0,2.05,27.8,.16,1.55,'pale',8)
box(r,'Breakwater_lantern',0,2.86,27.8,.8,.7,.8,'amber')
ridge_roof(r,'Breakwater_lantern_roof',0,3.26,27.8,1.15,.4,1.15,'rust')

# Shoreline modules to interrupt the long repeated seawall runs.
r=root('Riprap_Rock_Pile','modular rip-rap rock pile',6,5,1.7); roots.append(r)
for i in range(18):
    a=i*2.399; rad=.35+(i%4)*.32; x=rad*math.cos(a); z=rad*math.sin(a)
    size=.55+(i%5)*.14; y=.03+(i%3)*.22
    cylinder(r,'Riprap_faceted_boulder',x,y,z,size,.55+(i%2)*.16,'slate' if i%4 else 'concrete',6,size*.82)
r=root('Seawall_Straight_Module','modular seawall straight',12,1.1,1.35); roots.append(r)
box(r,'Seawall_slab',0,.5,0,12,.95,.72,'slate'); box(r,'Seawall_cap',0,1.02,-.02,12.12,.18,.92,'concrete')
for x in [-5.7,-2.85,0,2.85,5.7]: box(r,'Seawall_face_stone',x,.43,.38,2.72,.72,.08,'concrete')
for x in [-5.9,5.9]: cylinder(r,'Seawall_end_pier',x,.70,0,.34,1.4,'dark',8)
r=root('Seawall_Corner_Module','modular seawall corner',12,12,1.35); roots.append(r)
box(r,'Seawall_corner_x',0,.5,0,12,.95,.72,'slate'); box(r,'Seawall_corner_z',-5.64,.5,5.64,.72,.95,12,'slate')
box(r,'Seawall_corner_cap_x',0,1.02,-.02,12.12,.18,.92,'concrete'); box(r,'Seawall_corner_cap_z',-5.64,1.02,5.64,.92,.18,12.12,'concrete')

# Beach volleyball court and dedicated ice-cream kiosk; kit umbrella/hut reused.
r=root('Beach_Volleyball_Net','beach volleyball net',10,.6,2.5); roots.append(r)
for x in [-4.6,4.6]: cylinder(r,'Volleyball_net_post',x,1.2,0,.12,2.4,'wood2',8)
box(r,'Volleyball_top_cord',0,2.35,0,9.4,.08,.08,'net'); box(r,'Volleyball_bottom_cord',0,.15,0,9.4,.07,.07,'net')
for i in range(19): box(r,'Volleyball_net_vertical',-4.5+i*.5,1.25,0,.025,2.1,.03,'net')
for y in [.25,.65,1.05,1.45,1.85,2.25]: box(r,'Volleyball_net_horizontal',0,y,0,9.1,.025,.03,'net')
r=root('Boardwalk_IceCream_Stand','boardwalk ice cream stand',3.4,2.7,3.1); roots.append(r)
for x in [-1.35,1.35]:
    for z in [-.95,.95]: box(r,'IceCream_stall_post',x,1.1,z,.12,2.2,.12,'wood2')
box(r,'IceCream_counter',0,1.0,0,3.1,.2,2.4,'pale'); box(r,'IceCream_front',0,.53,1.0,2.8,.78,.12,'rust')
box(r,'IceCream_awning',0,2.25,0,3.35,.2,2.65,'teal'); ridge_roof(r,'IceCream_canopy',0,2.38,0,3.65,.42,2.9,'rust')
for x in [-1.2,-.4,.4,1.2]: box(r,'IceCream_awning_stripe',x,2.22,1.32,.32,.18,.08,'pale')
box(r,'IceCream_sign',0,2.75,-1.02,1.65,.55,.09,'dark')
for x in [-.45,.45]: box(r,'IceCream_service_window',x,1.8,-1.02,.58,.48,.08,'water')

# Three standardized, stackable 20-foot shipping-container color variants.
def container(name,color):
    r=root(name,'stackable shipping container',6.05,2.5,2.58); roots.append(r)
    box(r,name+'_body',0,1.29,0,6.05,2.58,2.5,color)
    for x in [-2.82,-2.38,-1.94,-1.50,-1.06,-.62,-.18,.26,.70,1.14,1.58,2.02,2.46,2.90]:
        box(r,name+'_corrugation',x,1.29,-1.263,.045,2.34,.035,'shadow')
    for x in [-2.86,2.86]:
        box(r,name+'_door',x,1.29,1.263,.12,2.42,.04,'slate')
        for y in [.4,.8,1.2,1.6,2.0,2.38]: box(r,name+'_door_rib',x, y,1.29,.15,.045,.06,'dark')
container('Container_Rust','rust'); container('Container_Teal','teal'); container('Container_Slate','slate')

# Haysville gantry crane: simple, readable rail-mounted portal silhouette.
r=root('Gantry_Crane_Haysville','harbor gantry crane',24,10,17); roots.append(r)
for x in [-10,10]:
    box(r,'Crane_runway_foot',x,.45,0,3.4,.9,8,'dark')
    box(r,'Crane_leg',x,7.2,0,1.1,13.8,1.2,'slate')
    box(r,'Crane_knee_brace',x*.78,11.5,0,2.9,.65,1.0,'rust')
box(r,'Crane_gantry_beam',0,14.4,0,22,1.5,2.3,'rust')
box(r,'Crane_rail',0,13.5,0,20,.22,1.1,'dark')
box(r,'Crane_trolley',-2,13.9,0,3.3,.8,2.2,'slate')
for x in [-2.8,-1.2]: box(r,'Crane_lift_cable',x,10.7,0,.08,5.2,.08,'dark')
box(r,'Crane_spreader',-2,8.0,0,5.5,.35,1.1,'yellow')
for x in [-8,8]:
    box(r,'Crane_ladder',x,4.3,.66,.35,7.2,.08,'dark')
    for y in [1.2,2.2,3.2,4.2,5.2,6.2,7.2]: box(r,'Crane_ladder_rung',x,y,.72,.65,.08,.08,'yellow')

# Pair of low industrial warehouses and a reusable single mooring bollard.
r=root('Warehouse_Haysville_Docks','industrial warehouse',16,10,7.2); roots.append(r)
box(r,'Warehouse_foundation',0,.28,0,16,.55,10,'dark')
box(r,'Warehouse_body',0,3.5,0,15.4,6.1,9.4,'green')
ridge_roof(r,'Warehouse_shed_roof',0,6.55,0,16.6,1.25,10.4,'slate')
for x in [-5.5,-1.8,1.8,5.5]:
    box(r,'Warehouse_loading_door',x,2.0,4.74,2.5,3.3,.15,'rust')
    for y in [.8,1.4,2.0,2.6,3.2]: box(r,'Warehouse_door_rib',x,y,4.84,2.25,.045,.06,'pale')
for x in [-6.4,-3.2,0,3.2,6.4]: box(r,'Warehouse_clerestory',x,5.1,-4.76,1.3,.54,.08,'water')
r=root('Harbor_Bollard','single mooring bollard',.62,.62,.9); roots.append(r)
cylinder(r,'Bollard_base',0,.16,0,.31,.32,'dark',10)
cylinder(r,'Bollard_stem',0,.48,0,.15,.52,'yellow',10)
cylinder(r,'Bollard_cap',0,.78,0,.24,.16,'dark',10)
box(r,'Bollard_crossbar',0,.75,0,.66,.15,.18,'dark')

# Gallery layout, labels and a Gotham night lighting setup.
for i,r in enumerate(roots):
    col=i%4; row=i//4; gx=(col-1.5)*35; gz=(row-1.5)*34
    r.location=conv(gx,0,gz)
    if r.name.startswith('Lighthouse_'):
        # Gallery sweep preview is kept static; runtime rotates the named pivot.
        pass
    cu=bpy.data.curves.new('Label_'+r.name,'FONT'); cu.body=r.name.replace('_',' '); cu.size=1.25
    label=bpy.data.objects.new('Label_'+r.name,cu); collection.objects.link(label)
    label.location=conv(gx-8.0,.05,gz-12.0); cu.materials.append(M['label'])
camd=bpy.data.cameras.new('Waterfront_Gallery_Camera'); cam=bpy.data.objects.new('Waterfront_Gallery_Camera',camd); collection.objects.link(cam)
cam.location=conv(0,115,-105); cam.rotation_euler=(Vector(conv(0,0,0))-cam.location).to_track_quat('-Z','Y').to_euler()
camd.type='ORTHO'; camd.ortho_scale=155; scene.camera=cam
for ob in collection.objects:
    if ob.name.startswith('Label_'):
        ob.rotation_euler=(cam.location-ob.location).to_track_quat('Z','Y').to_euler()
for name,loc,power,size,color in [('Moon',(-38,70,-25),16000,48,(.63,.76,.85)),('Warm',(37,55,36),10500,34,(1,.77,.5)),('Rim',(0,45,70),13000,30,(.45,.7,.76))]:
    d=bpy.data.lights.new(name,'AREA'); d.energy=power; d.shape='DISK'; d.size=size; d.color=color
    ob=bpy.data.objects.new(name,d); collection.objects.link(ob); ob.location=conv(*loc); ob.rotation_euler=(Vector(conv(0,0,0))-ob.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='BLENDER_EEVEE'; scene.render.resolution_x=1800; scene.render.resolution_y=1150; scene.render.resolution_percentage=70
scene.render.image_settings.file_format='PNG'; scene.world=bpy.data.worlds.new('Gotham Waterfront Night'); scene.world.color=(.035,.055,.068)
scene.view_settings.view_transform='AgX'

# The combined GLB holds one named prototype per model; gallery-only labels,
# camera and lights are excluded from the runtime export.
bpy.ops.object.select_all(action='DESELECT')
for r in roots:
    r.select_set(True)
    for ob in collection.objects:
        if ob.parent==r: ob.select_set(True)
bpy.context.view_layer.objects.active=roots[0]
bpy.ops.export_scene.gltf(filepath=str(OUT/'gotham_waterfront_kit.glb'),use_selection=True,use_active_scene=True,export_apply=True,export_yup=True)
bpy.data.libraries.write(str(OUT/'gotham_waterfront_kit.blend'),{scene},fake_user=True)
scene.render.filepath=str(OUT/'gotham_waterfront_kit.png')
bpy.context.window.scene=scene
bpy.ops.render.render(write_still=True)
if old_scene: bpy.context.window.scene=old_scene
result={'scene':'Gotham | Waterfront Kit','models':[r.name for r in roots],'blend':str(OUT/'gotham_waterfront_kit.blend'),'glb':str(OUT/'gotham_waterfront_kit.glb'),'preview':str(OUT/'gotham_waterfront_kit.png')}
