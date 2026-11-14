"""Four distinct Gotham-inspired account landmarks; run with -- 07, 08, 09, or 10."""

import bpy
import math
import random
import sys
from pathlib import Path
from mathutils import Vector
import numpy as np

arg = sys.argv[-1]
assert arg in {'07','08','09','10'}
idx = int(arg)
random.seed(103 + idx)
OUT = Path(__file__).resolve().parent
WORK = OUT / '.work'
WORK.mkdir(exist_ok=True)
name = f'account_building_{arg}'
height = {7:33.0,8:37.0,9:41.0,10:45.0}[idx]

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = f'Account Building {arg}'
scene.unit_settings.system = 'METRIC'

def material(name,rgb,emit=0,metal=0):
    m=bpy.data.materials.new(name); m.use_nodes=True; m.diffuse_color=(*rgb,1)
    p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value=(*rgb,1)
    p.inputs['Roughness'].default_value=.82
    p.inputs['Metallic'].default_value=metal
    p.inputs['Emission Color'].default_value=(*rgb,1)
    p.inputs['Emission Strength'].default_value=emit
    return m

M=[
    material('MAT_Account_SlateStone',(.096,.103,.163)), #0
    material('MAT_Account_DeepShadow',(.034,.040,.070)), #1
    material('MAT_Account_StoneTrim',(.265,.255,.345)), #2
    material('MAT_Account_Roof',(.053,.063,.115)), #3
    material('MAT_Account_Amber',(.92,.39,.072),1.45), #4
    material('MAT_Account_AmberDim',(.36,.15,.049),.3), #5
    material('MAT_Account_Iron',(.021,.028,.05),0,.4), #6
    material('MAT_Account_Mint',(.19,.83,.70),1.1), #7
    material('MAT_Account_Brass',(.60,.45,.23),.05,.35), #8
    material('MAT_Account_Paving',(.108,.115,.16)), #9
    material('MAT_Account_Red',(.90,.035,.02),2.2), #10
    material('MAT_Account_PaleLight',(.85,.73,.43),1.0), #11
]
verts=[];faces=[];mids=[]

def face(points,mat):
    j=len(verts);verts.extend(points);faces.append(tuple(range(j,j+len(points))));mids.append(mat)

def box(x,y,z,sx,sy,sz,mat):
    a,b,c=sx/2,sy/2,sz/2
    p=[(x-a,y-b,z-c),(x+a,y-b,z-c),(x+a,y+b,z-c),(x-a,y+b,z-c),
       (x-a,y-b,z+c),(x+a,y-b,z+c),(x+a,y+b,z+c),(x-a,y+b,z+c)]
    for ids in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]:
        face([p[k] for k in ids],mat)

def prism(cx,cy,z0,z1,r0,r1,mat,n=8):
    lo=[(cx+r0*math.cos(2*math.pi*i/n),cy+r0*math.sin(2*math.pi*i/n),z0) for i in range(n)]
    hi=[(cx+r1*math.cos(2*math.pi*i/n),cy+r1*math.sin(2*math.pi*i/n),z1) for i in range(n)]
    face(tuple(reversed(lo)),mat);face(hi,mat)
    for i in range(n):
        k=(i+1)%n;face((lo[i],lo[k],hi[k],hi[i]),mat)

def front_window(x,front,z,w=.43,h=.79,bright=True):
    box(x,front-.045,z,w+.14,.12,h+.15,2)
    box(x,front-.12,z,w+.035,.05,h+.05,1)
    box(x,front-.155,z,w*.90,.025,h*.88,4 if bright else 5)
    box(x,front-.18,z,.035,.035,h*.92,6)
    box(x,front-.19,z+.09,w*.93,.035,.03,6)
    box(x,front-.17,z-h*.54,w+.21,.12,.07,2)

def right_window(x,y,z,w=.43,h=.79,bright=True):
    box(x+.04,y,z,.11,w+.14,h+.15,2)
    box(x+.11,y,z,.045,w+.035,h+.05,1)
    box(x+.15,y,z,.02,w*.9,h*.88,4 if bright else 5)
    box(x+.18,y,z,.035,.035,h*.92,6)
    box(x+.19,y,z+.09,.035,w*.93,.03,6)

def front_bay_windows(width,front,z0,z1,pitch,cols,margin=.66):
    n=max(1,int((z1-z0)/pitch))
    xs=[-width/2+margin+(width-2*margin)*i/(cols-1) for i in range(cols)] if cols>1 else [0]
    for j in range(n):
        z=z0+j*pitch
        for x in xs:
            front_window(x,front,z,bright=random.random()>.23)

def side_bay_windows(right,depth,z0,z1,pitch,cols):
    n=max(1,int((z1-z0)/pitch))
    ys=[-depth/2+.72+(depth-1.44)*i/(cols-1) for i in range(cols)] if cols>1 else [0]
    for j in range(n):
        z=z0+j*pitch
        for y in ys:
            right_window(right,y,z,bright=random.random()>.25)

def bands(w,d,levels):
    for z in levels:
        box(0,0,z,w+.30,d+.30,.17,2)
        box(0,-d/2-.19,z+.12,w+.38,.13,.055,1)

def pilasters(w,front,z0,z1,xs):
    for x in xs:
        box(x,front-.065,(z0+z1)/2,.17,.19,z1-z0,2)
        box(x,front-.16,z1-.03,.32,.24,.17,2)

def entrance(front,style):
    box(0,front-.13,1.55,1.83,.24,2.35,1)
    for x in [-.49,.49]:
        box(x,front-.27,1.37,.73,.12,1.78,6)
        box(x,front-.34,1.55,.56,.026,1.42,4)
        box(x,front-.37,1.35,.04,.05,.15,8)
    box(0,front-.20,2.79,2.15,.34,.17,2)
    for j in range(5):
        box(0,front-.85-j*.26,.41+j*.12,2.70-j*.12,.28,.14,2)
    # A small identity plaque can map to an account later.
    box(0,front-.25,3.27,1.28,.14,.45,1)
    if style%2:
        for x in [-.33,.33]: box(x,front-.34,3.27,.12,.04,.27,7)
        box(0,front-.35,3.27,.77,.04,.075,7)
    else:
        prism(0,front-.35,3.10,3.43,.16,.16,8,6)

def lamp(x,y):
    box(x,y,1.66,.16,.16,2.8,6)
    box(x,y,3.18,.35,.34,.45,11)
    box(x,y,3.44,.43,.42,.13,6)
    box(x,y,3.54,.22,.21,.12,2)

def rooftop_beacon(x,y,z):
    box(x,y,z+.27,.08,.08,.54,2)
    box(x,y,z+.60,.17,.17,.12,10)

# One shared stone plinth and sidewalk make the assets read as a family.
base_width={7:12.6,8:13.0,9:14.0,10:9.2}[idx]
base_depth={7:11.8,8:11.5,9:12.0,10:9.4}[idx]
box(0,0,-.16,base_width,base_depth,.32,1)
box(0,0,.04,base_width-.2,base_depth-.2,.08,9)
for i in range(-14,15):
    x=i*(base_width-.5)/28
    box(x,-base_depth/2+.62,.09,.019,1.05,.01,2)
for y in [-base_depth/2+.34,-base_depth/2+.72,-base_depth/2+1.10]:
    box(0,y,.09,base_width-.35,.021,.012,1)

# Progressive tiers set the exact height. The top silhouette is design-specific.
w={7:8.0,8:9.4,9:9.5,10:5.5}[idx]
d={7:7.6,8:7.7,9:8.0,10:5.7}[idx]
front=-d/2
low_top=height*({7:.57,8:.55,9:.55,10:.58}[idx])
mid_top=height*({7:.79,8:.72,9:.73,10:.73}[idx])
top_body=height*({7:.90,8:.80,9:.82,10:.82}[idx])
box(0,0,(low_top+.34)/2,w,d,low_top-.34,0)
box(0,0,(low_top+mid_top)/2,w*.78,d*.78,mid_top-low_top,0)
box(0,0,(mid_top+top_body)/2,w*.52,d*.53,top_body-mid_top,0)
bands(w,d,[.61,low_top,low_top+.21])
bands(w*.78,d*.78,[mid_top,mid_top+.20])
bands(w*.52,d*.53,[top_body])
box(0,-d/2,low_top*.44,w+.22,.30,.17,2)

# The stepped and tapered silhouette receives a distinct roof treatment.
if idx==7:
    # Broad stepped ledger crown with multiple corner pinnacles.
    box(0,0,top_body+.30,w*.57,d*.58,.56,3)
    for x in [-w*.30,w*.30]:
        for y in [-d*.30,d*.30]:
            box(x,y,top_body+.72,.35,.35,1.0,2)
            prism(x,y,top_body+1.20,height,.18,0,2)
    for j in range(3):
        box(0,0,top_body+.89+j*.32,w*.36-j*.34,d*.36-j*.34,.22,2 if j%2==0 else 3)
    prism(0,0,top_body+1.60,height,.45,0,8,8)
elif idx==8:
    # A paired-spire silhouette with a low pitched middle nave.
    for x in [-w*.29,w*.29]:
        box(x,0,(top_body+height*.90)/2,1.12,1.16,height*.90-top_body,0)
        box(x,0,height*.90,1.38,1.42,.20,2)
        prism(x,0,height*.90,height,.70,0,3,8)
    prism(0,0,top_body+.14,height*.945,w*.22,.05,3,4)
elif idx==9:
    # Copper-toned faceted crown dome, bounded by two lantern towers.
    box(0,0,top_body+.24,w*.56,d*.56,.44,2)
    prism(0,0,top_body+.46,height*.963,w*.32,w*.085,3,12)
    prism(0,0,height*.963,height,.37,0,8,8)
    for x in [-w*.28,w*.28]:
        box(x,-d*.23,top_body+.58,.44,.44,1.1,2)
        prism(x,-d*.23,top_body+1.12,height*.94,.23,0,8,8)
else:
    # Slender vertical pinnacle with chevron fins.
    box(0,0,(top_body+height*.89)/2,w*.30,d*.32,height*.89-top_body,0)
    for z in [top_body+.33,height*.875]: box(0,0,z,w*.34,d*.35,.18,2)
    prism(0,0,height*.89,height,.88,0,3,8)
    for s in [-1,1]:
        box(s*w*.19,0,top_body+.74,.17,d*.38,1.42,2)
        prism(s*w*.19,0,top_body+1.48,height*.95,.13,0,8,8)
    rooftop_beacon(0,0,height*.91)

# Continuous vertical frontage rhythm, floor plates, and lit windows.
floor_pitch={7:2.1,8:2.05,9:2.0,10:1.95}[idx]
front_bay_windows(w,front,4.35,low_top-1.0,floor_pitch,{7:6,8:5,9:6,10:5}[idx])
side_bay_windows(w/2,d,4.35,low_top-1.0,floor_pitch,4)
mid_w=w*.78;mid_d=d*.78;mid_front=-mid_d/2
front_bay_windows(mid_w,mid_front,low_top+1.2,mid_top-.7,floor_pitch,4,.54)
side_bay_windows(mid_w/2,mid_d,low_top+1.2,mid_top-.7,floor_pitch,3)
top_w=w*.52;top_d=d*.53;top_front=-top_d/2
front_bay_windows(top_w,top_front,mid_top+.9,top_body-.5,1.75,3,.42)
side_bay_windows(top_w/2,top_d,mid_top+.9,top_body-.5,1.75,2)
pilasters(w,front,2.95,low_top,[(-w/2+.36)+i*(w-.72)/({7:6,8:5,9:6,10:5}[idx]-1) for i in range({7:6,8:5,9:6,10:5}[idx])])
pilasters(mid_w,mid_front,low_top+.2,mid_top,[-mid_w/2+.23,0,mid_w/2-.23])

# Design-specific lower massing and decorative stonework.
if idx==7:
    for s in [-1,1]:
        x=s*(w*.54)
        box(x,-.36,low_top*.25,1.20,d*.65,low_top*.48,0)
        box(x,-.36,low_top*.50,1.39,d*.68,.22,2)
        for z in [5.7,8.3,11.0,13.7]:
            front_window(x,-.36-d*.325,z,.45,.85,True)
elif idx==8:
    for s in [-1,1]:
        x=s*(w*.51)
        box(x,.55,low_top*.40,.72,d*.70,low_top*.78,0)
        for z in [low_top*.27,low_top*.53,low_top*.75]:
            box(x,-d*.27,z,.81,.12,.18,2)
        prism(x,-d*.26,low_top*.78,low_top*.86,.24,0,2,4)
elif idx==9:
    for s in [-1,1]:
        x=s*(w*.56)
        box(x,-.5,low_top*.31,1.65,d*.62,low_top*.60,0)
        box(x,-.5,low_top*.62,1.88,d*.65,.23,2)
        for z in [5.3,8.0,10.7,13.4]:
            front_window(x,-.5-d*.31,z,.55,.95,True)
else:
    for s in [-1,1]:
        x=s*(w*.51)
        box(x,0,low_top*.25,.58,d*.78,low_top*.48,0)
        box(x,0,low_top*.49,.76,d*.80,.16,2)
        for j in range(5):
            z=5.1+j*3.2
            box(x,-d*.39,z,.20,.16,1.8,7 if j%2 else 2)

entrance(front,idx)
for s in [-1,1]:
    box(s*1.45,front-.22,2.04,.29,.33,3.23,2)
    box(s*1.45,front-.30,3.70,.45,.43,.14,2)
    lamp(s*(w/2+.69),front-.64)
    # Distinct base arches make the silhouette readable at sprite size.
    box(s*(w*.31),front-.17,1.60,1.23,.21,2.05,1)
    front_window(s*(w*.31),front-.20,1.60,.64,1.23,True)

# Roof corner lamps and a restrained wrought iron plot boundary.
for s in [-1,1]:
    rooftop_beacon(s*(w/2-.18),front+.24,low_top+.20)
for x in [-base_width/2+.42,base_width/2-.42]:
    for y in [-base_depth/2+.75,0,base_depth/2-.44]:
        box(x,y,.72,.28,.28,1.25,2)
        box(x,y,1.41,.39,.39,.14,1)
    for j in range(24):
        y=-base_depth/2+.96+j*(base_depth-1.5)/23
        box(x,y,.94,.045,.045,.88,6)
    for z in [.74,1.19]: box(x,0,z,.05,base_depth-1.5,.06,6)
fy=-base_depth/2+.75
for j in range(34):
    x=-base_width/2+.68+j*(base_width-1.36)/33
    if abs(x)<1.65: continue
    box(x,fy,.94,.045,.045,.88,6)
for x in [-(base_width/4+1.0),(base_width/4+1.0)]: lamp(x,fy)

mesh=bpy.data.meshes.new(f'SM_Account_{arg}_Mesh')
mesh.from_pydata(verts,[],faces);mesh.update()
for mat in M:mesh.materials.append(mat)
for f,m in zip(mesh.polygons,mids):f.material_index=m
obj=bpy.data.objects.new(f'SM_Account_Building_{arg}',mesh)
geo_col=bpy.data.collections.new(f'COL_Account_{arg}_Geometry')
scene.collection.children.link(geo_col)
geo_col.objects.link(obj)
obj['height_m']=height
obj['account_slot']=idx
obj['style']='Gotham-inspired Art Deco Gothic, pixel-rendered'

camdata=bpy.data.cameras.new(f'CAM_Account_{arg}_Hero')
cam=bpy.data.objects.new(camdata.name,camdata);scene.collection.objects.link(cam)
cam.location=(height*.70,-height*.83,height*.62)
target=Vector((0,0,height*.46))
cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
camdata.type='ORTHO';camdata.ortho_scale=height*1.25
scene.camera=cam

def area(name,loc,power,color,size):
    light=bpy.data.lights.new(name,'AREA');light.energy=power;light.color=color;light.shape='DISK';light.size=size
    ob=bpy.data.objects.new(name,light);scene.collection.objects.link(ob)
    ob.location=loc;ob.rotation_euler=(Vector((0,0,height*.45))-ob.location).to_track_quat('-Z','Y').to_euler()
area(f'LGT_Account_{arg}_Moon',(-height*.42,-height*.52,height*.78),height*110,(.60,.68,1.0),height*.45)
area(f'LGT_Account_{arg}_Rim',(height*.50,height*.43,height*.69),height*70,(.38,.50,.85),height*.40)
area(f'LGT_Account_{arg}_Warm',(0,-height*.43,height*.32),height*17,(1.0,.57,.29),height*.30)
world=bpy.data.worlds.new(f'World_Account_{arg}_Night');world.use_nodes=True
bg=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND')
bg.inputs['Color'].default_value=(.008,.011,.028,1);bg.inputs['Strength'].default_value=.35
scene.world=world
scene.render.engine='CYCLES';scene.cycles.samples=24
scene.render.resolution_x=1024;scene.render.resolution_y=1024;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.filepath=str(OUT/f'{name}.png')
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
scene.view_settings.exposure=.38

bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/f'{name}.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/f'{name}.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True)
scene.render.resolution_x=512;scene.render.resolution_y=512
scene.render.filepath=str(WORK/f'{name}_clean.png')
bpy.ops.render.render(write_still=True)
src=bpy.data.images.load(str(WORK/f'{name}_clean.png'),check_existing=False)
arr=np.empty(512*512*4,dtype=np.float32);src.pixels.foreach_get(arr)
pix=np.repeat(np.repeat(arr.reshape(512,512,4),2,axis=0),2,axis=1)
out=bpy.data.images.new(f'{name}_pixel',width=1024,height=1024,alpha=True)
out.pixels.foreach_set(pix.ravel());out.filepath_raw=str(OUT/f'{name}.png');out.file_format='PNG';out.save()
print('BUILT',name,'height',round(max(v[2] for v in verts)-min(v[2] for v in verts),2),'faces',len(faces))
