"""Three original Gotham-inspired account landmarks, with shared 8-bit camera scale."""
from pathlib import Path
from math import sin, cos, pi
import json, logging, random
import bpy
from mathutils import Vector
import numpy as np

OUT=Path(__file__).resolve().parent
OUT.mkdir(parents=True,exist_ok=True)

def build(number):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    random.seed(920+number)
    scene=bpy.context.scene
    scene.name=f'Account Building {number:02d}'
    scene.unit_settings.system='METRIC'
    def mat(name,rgb,emission=0):
        m=bpy.data.materials.new(name)
        m.use_nodes=True
        p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
        p.inputs['Base Color'].default_value=(*rgb,1)
        p.inputs['Roughness'].default_value=.87
        p.inputs['Emission Color'].default_value=(*rgb,1)
        p.inputs['Emission Strength'].default_value=emission
        m.diffuse_color=(*rgb,1)
        return m
    M=[mat('MAT_Stone',(.105,.106,.167)),mat('MAT_DeepStone',(.045,.052,.086)),
       mat('MAT_LimestoneTrim',(.28,.27,.36)),mat('MAT_Slate',(.050,.059,.108)),
       mat('MAT_AmberWindows',(.92,.44,.09),1.15),mat('MAT_AmberDim',(.34,.17,.05),.3),
       mat('MAT_Iron',(.025,.032,.055)),mat('MAT_Copper',(.23,.38,.37)),
       mat('MAT_TealGlow',(.13,.83,.72),1.1),mat('MAT_GoldGlow',(.91,.63,.27),.8),
       mat('MAT_Paving',(.085,.094,.14))]
    verts=[];faces=[];mids=[]
    def poly(points,m):
        q=len(verts);verts.extend(points);faces.append(tuple(range(q,q+len(points))));mids.append(m)
    def box(x,y,z,w,d,h,m):
        a,b,c=w/2,d/2,h/2
        p=[(x-a,y-b,z-c),(x+a,y-b,z-c),(x+a,y+b,z-c),(x-a,y+b,z-c),
           (x-a,y-b,z+c),(x+a,y-b,z+c),(x+a,y+b,z+c),(x-a,y+b,z+c)]
        for q in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]:poly([p[i] for i in q],m)
    def frustum(x,y,z0,z1,bw,bd,tw,td,m):
        lo=[(x+sx*bw/2,y+sy*bd/2,z0) for sx,sy in [(-1,-1),(1,-1),(1,1),(-1,1)]]
        hi=[(x+sx*tw/2,y+sy*td/2,z1) for sx,sy in [(-1,-1),(1,-1),(1,1),(-1,1)]]
        points=lo+hi
        for q in [(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)]:poly([points[i] for i in q],m)
    def prism(x,y,z0,z1,r,m,n=8):
        lo=[(x+r*cos(2*pi*i/n),y+r*sin(2*pi*i/n),z0) for i in range(n)]
        hi=[(x,y,z1)]
        poly(tuple(reversed(lo)),m)
        for i in range(n):poly((lo[i],lo[(i+1)%n],hi[0]),m)
    def window(x,y,z,w=.48,h=.82,lit=True):
        box(x,y,z,w+.15,.12,h+.17,2)
        box(x,y-.08,z,w+.05,.045,h+.05,1)
        box(x,y-.11,z,w*.87,.024,h*.87,4 if lit else 5)
        box(x,y-.14,z,w*.055,.03,h*.9,6)
        box(x,y-.14,z+.08,w*.88,.03,.035,6)
        box(x,y-.14,z-h*.54,w+.19,.12,.06,2)
    def side_window(x,y,z,w=.48,h=.82,lit=True):
        box(x,y,z,.12,w+.15,h+.17,2)
        box(x+.08,y,z,.045,w+.05,h+.05,1)
        box(x+.11,y,z,.025,w*.87,h*.87,4 if lit else 5)
        box(x+.14,y,z,.03,w*.055,h*.9,6)
    def cornice(x,y,z,w,d):
        box(x,y-d/2-.06,z,w+.28,.18,.17,2)
        box(x+w/2+.06,y,z,.18,d+.28,.17,2)
        box(x-w/2-.06,y,z,.18,d+.28,.17,2)
    def beacon(x,y,z):
        box(x,y,z+.20,.08,.08,.42,2)
        box(x,y,z+.45,.16,.16,.13,8)
    def lamp(x,y):
        box(x,y,.58,.27,.27,.45,2);box(x,y,1.17,.09,.09,.77,6)
        box(x,y,1.60,.24,.24,.39,9);box(x,y,1.83,.33,.33,.09,6)

    # Shared metre grid and dark paving ensure the ten buildings can form a set.
    box(0,0,-.19,10.1,9.2,.38,1)
    box(0,0,.04,9.78,8.88,.08,10)
    for i in range(-10,11):box(i*.47,-3.95,.087,.018,.84,.012,2)
    for y in [-4.31,-3.87,-3.43]:box(0,y,.087,9.5,.02,.012,1)

    if number==1:
        title='The Night Ledger'
        # Low, wide bank-like mansion with a steep mansard and corner lanterns.
        box(0,.35,3.04,7.35,5.50,5.70,0);cornice(0,.35,5.89,7.50,5.67)
        frustum(0,.35,6.02,8.54,7.70,5.85,3.77,2.58,3)
        box(0,.35,8.58,3.95,2.75,.18,2)
        for x in [-3.12,-2.08,-1.04,0,1.04,2.08,3.12]:
            for z in [1.28,2.67,4.13]:window(x,-2.46,z,.45,1.02,random.random()>.16)
        for y in [-1.65,-.50,.65,1.80,2.88]:
            for z in [1.30,2.77,4.14]:side_window(3.72,y,z,.43,.96,random.random()>.19)
        for x in [-2.52,-1.27,0,1.27,2.52]:
            box(x,-2.20,6.34,.76,.48,.72,0)
            window(x,-2.53,6.36,.30,.54,True)
            frustum(x,-2.20,6.71,7.16,.98,.72,.18,.18,3)
        for x in [-3.35,3.35]:
            box(x,2.18,7.53,.56,.56,2.34,0);box(x,2.18,8.77,.73,.73,.18,2)
            beacon(x,2.18,8.88)
        # Heavy stone portal and small teal account token.
        box(0,-2.57,1.37,1.85,.20,2.26,1)
        for x in [-.78,.78]:box(x,-2.67,1.48,.20,.25,2.40,2)
        box(0,-2.69,2.65,2.12,.28,.21,2)
        for x in [-.42,.42]:box(x,-2.72,1.27,.72,.065,1.86,6)
        box(0,-2.80,2.83,.48,.05,.34,8)
        for i in range(4):box(0,-3.00-i*.25,.42-i*.09,2.5+i*.12,.27,.15,2)
        for x in [-4.12,4.12]:lamp(x,-3.32)
    elif number==2:
        title='The Ash Exchange'
        # Medium Art Deco exchange: square terraces and a tall setback core.
        box(0,.10,3.38,7.07,5.78,6.40,0);cornice(0,.10,6.58,7.26,5.96)
        box(0,.43,8.68,5.08,5.00,4.20,0);cornice(0,.43,10.79,5.27,5.18)
        box(0,.75,11.74,3.10,3.22,1.70,0);cornice(0,.75,12.60,3.28,3.40)
        for x in [-2.90,-1.94,-.97,0,.97,1.94,2.90]:
            for z in [1.30,2.63,3.96,5.27]:window(x,-2.85,z,.43,.92,random.random()>.16)
        for x in [-1.92,-.96,0,.96,1.92]:
            for z in [7.31,8.72,10.04]:window(x,-2.10,z,.44,1.00,random.random()>.19)
        for x in [-.88,0,.88]:window(x,-.94,11.84,.42,.76,True)
        for y in [-2.13,-.97,.19,1.35,2.51]:
            for z in [1.38,2.76,4.14,5.48]:side_window(3.58,y,z,.43,.95,random.random()>.2)
        for y in [-1.55,-.38,.79,1.96,2.65]:
            for z in [7.49,8.94,10.12]:side_window(2.58,y,z,.40,.91,random.random()>.27)
        for x in [-3.48,-2.50,2.50,3.48]:box(x,-2.88,3.40,.18,.23,6.25,2)
        for x in [-1.20,1.20]:box(x,-2.12,8.71,.17,.23,3.88,2)
        # Copper clock panel and a roof crown flanked by antenna lights.
        box(0,-1.01,11.98,1.00,.12,.92,7)
        box(0,-1.09,11.98,.66,.04,.66,8)
        box(0,-1.14,12.02,.08,.04,.42,2)
        for x in [-1.42,1.42]:beacon(x,.77,12.70)
        box(0,-2.96,1.42,2.07,.20,2.35,1)
        for x in [-.43,.43]:box(x,-3.06,1.31,.79,.08,1.98,6)
        box(0,-3.10,2.73,2.30,.24,.20,2)
        for i in range(4):box(0,-3.25-i*.23,.40-i*.08,2.70+i*.12,.25,.14,2)
        for x in [-4.05,4.05]:lamp(x,-3.54)
    else:
        title='The Warden Spire'
        # Tallest of this group: gothic setbacks, ribs and a needle-like crown.
        box(0,.22,3.24,7.52,6.12,6.15,0);cornice(0,.22,6.31,7.72,6.30)
        box(0,.48,9.16,5.65,5.12,5.70,0);cornice(0,.48,12.01,5.82,5.30)
        box(0,.80,13.66,3.76,3.60,3.15,0);cornice(0,.80,15.24,3.98,3.80)
        frustum(0,.80,15.36,16.37,3.88,3.70,1.18,1.04,3)
        box(0,.80,16.43,1.32,1.18,.18,2)
        prism(0,.80,16.52,17.30,.16,2)
        for x in [-3.26,-2.16,-1.08,0,1.08,2.16,3.26]:
            for z in [1.31,2.65,4.00,5.38]:window(x,-2.86,z,.45,.94,random.random()>.16)
        for x in [-2.36,-1.18,0,1.18,2.36]:
            for z in [7.08,8.49,9.90,11.18]:window(x,-2.11,z,.49,1.02,random.random()>.21)
        for x in [-1.20,0,1.20]:
            for z in [12.85,14.19]:window(x,-1.04,z,.49,.98,True)
        for y in [-2.15,-.96,.23,1.42,2.61]:
            for z in [1.45,2.86,4.27,5.68]:side_window(3.81,y,z,.44,.99,random.random()>.17)
        for y in [-1.60,-.40,.80,2.0,2.80]:
            for z in [7.20,8.75,10.27,11.33]:side_window(2.87,y,z,.43,.99,random.random()>.22)
        for x in [-3.65,-2.87,2.87,3.65]:box(x,-2.87,3.52,.18,.24,6.0,2)
        for x in [-2.64,2.64]:box(x,-2.12,9.16,.22,.24,5.60,2)
        for x in [-1.68,1.68]:box(x,-1.07,13.69,.18,.21,3.05,2)
        for x in [-1.75,1.75]:
            box(x,.82,15.70,.25,.25,.65,2);prism(x,.82,16.03,16.52,.15,2)
        box(0,-2.98,1.41,2.02,.25,2.36,1)
        for x in [-.43,.43]:box(x,-3.12,1.33,.79,.06,1.98,6)
        box(0,-3.10,2.72,2.27,.30,.20,2)
        for i in range(4):box(0,-3.25-i*.25,.40-i*.09,2.62+i*.12,.27,.15,2)
        for x in [-4.17,4.17]:lamp(x,-3.55)

    # Low fence establishes each as a single account tile without masking the facade.
    for x in [-4.70,4.70]:
        for y in [-3.51,-2.33,-1.15,.03,1.21,2.39,3.57]:
            box(x,y,.76,.23,.23,1.00,2);box(x,y,1.28,.34,.34,.12,1)
        for i in range(23):
            y=-3.36+i*.30;box(x,y,.88,.045,.045,.70,6)
            box(x,y,1.27,.08,.08,.13,2)
        for z in [.74,1.11]:box(x,0,z,.06,7.0,.07,6)
    for i in range(-15,16):
        x=i*.30
        if abs(x)<1.44:continue
        box(x,-3.52,.87,.045,.045,.70,6)
        box(x,-3.52,1.26,.08,.08,.13,2)

    mesh=bpy.data.meshes.new(f'SM_Account_Building_{number:02d}_Mesh')
    mesh.from_pydata(verts,[],faces);mesh.update()
    for m in M:mesh.materials.append(m)
    for f,mid in zip(mesh.polygons,mids):f.material_index=mid
    building=bpy.data.objects.new(f'SM_Account_Building_{number:02d}',mesh)
    scene.collection.objects.link(building)
    building['role']='account landmark';building['design_name']=title
    building['tile_m']='10.1 x 9.2'
    cam_data=bpy.data.cameras.new('CAM_Account_Hero')
    cam=bpy.data.objects.new('CAM_Account_Hero',cam_data);scene.collection.objects.link(cam)
    cam.location=(15,-19,17)
    cam.rotation_euler=(Vector((0,0,7.3))-cam.location).to_track_quat('-Z','Y').to_euler()
    cam_data.type='ORTHO';cam_data.ortho_scale=21.8;scene.camera=cam
    def light(name,loc,target,power,color,size):
        d=bpy.data.lights.new(name,'AREA');o=bpy.data.objects.new(name,d);scene.collection.objects.link(o)
        o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
        d.energy=power;d.color=color;d.shape='DISK';d.size=size
    light('LGT_CoolKey',(-8,-9,16),(0,0,7),1200,(.60,.65,1),10)
    light('LGT_Rim',(8,6,17),(0,0,7),900,(.43,.55,.94),10)
    light('LGT_Warm',(0,-8,8),(0,-2,4),280,(1,.68,.38),7)
    world=bpy.data.worlds.new('World_Gotham_Night');world.use_nodes=True
    bg=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND')
    bg.inputs['Color'].default_value=(.009,.011,.029,1);bg.inputs['Strength'].default_value=.33
    scene.world=world
    try:scene.render.engine='CYCLES'
    except TypeError:pass
    scene.cycles.samples=24
    scene.render.resolution_x=1024;scene.render.resolution_y=1024
    scene.render.image_settings.file_format='PNG'
    scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
    scene.view_settings.exposure=.40
    stem=f'account_building_{number:02d}'
    bpy.ops.object.select_all(action='DESELECT');building.select_set(True)
    bpy.context.view_layer.objects.active=building
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/(stem+'.blend')))
    logging.disable(logging.INFO)
    bpy.ops.export_scene.gltf(filepath=str(OUT/(stem+'.glb')),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True)
    logging.disable(logging.NOTSET)
    scene.render.resolution_x=512;scene.render.resolution_y=512
    scene.render.filepath=str(OUT/(stem+'_small.png'))
    bpy.ops.render.render(write_still=True)
    src=bpy.data.images.load(str(OUT/(stem+'_small.png')),check_existing=False)
    arr=np.empty(512*512*4,dtype=np.float32);src.pixels.foreach_get(arr)
    px=np.repeat(np.repeat(arr.reshape(512,512,4),2,axis=0),2,axis=1)
    img=bpy.data.images.new(stem,width=1024,height=1024,alpha=True)
    img.pixels.foreach_set(px.ravel());img.filepath_raw=str(OUT/(stem+'.png'))
    img.file_format='PNG';img.save()
    bpy.data.images.remove(src)
    height=round(max(v[2] for v in verts)-min(v[2] for v in verts),2)
    (OUT/(stem+'.json')).write_text(json.dumps({'id':number,'name':title,'height_m':height,'tile_m':[10.1,9.2],'style':'Gotham-inspired 8-bit'},indent=2))
    print(stem,title,'height',height,'faces',len(mesh.polygons))

for n in [1,2,3]:build(n)
