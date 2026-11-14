"""Build a poorer Gotham favela shack with crooked timber and rusted sheet roofs."""

from pathlib import Path
from math import sin, cos, pi
import random
import bpy
import numpy as np
from mathutils import Vector

random.seed(202)
OUT=Path(__file__).resolve().parent
WORK=OUT/'.favela_work'
WORK.mkdir(exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
scene.name='Gotham Favela 02 8-bit'
scene.unit_settings.system='METRIC'

def material(name,color,emit=0):
    m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*color,1)
    p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Roughness'].default_value=.93
    p.inputs['Emission Color'].default_value=(*color,1)
    p.inputs['Emission Strength'].default_value=emit
    return m

M=[
    material('MAT_F02_Concrete',(.145,.145,.17)),       #0
    material('MAT_F02_Soot',(.037,.04,.058)),            #1
    material('MAT_F02_ChippedPlaster',(.28,.265,.255)), #2
    material('MAT_F02_Brick',(.19,.085,.070)),           #3
    material('MAT_F02_BrickPale',(.285,.126,.088)),      #4
    material('MAT_F02_SheetMetal',(.075,.09,.12)),       #5
    material('MAT_F02_FadedGalvanized',(.20,.22,.245)),  #6
    material('MAT_F02_Rust',(.31,.115,.055)),            #7
    material('MAT_F02_Wood',(.105,.067,.050)),           #8
    material('MAT_F02_Amber',(.95,.38,.065),1.25),       #9
    material('MAT_F02_DimAmber',(.32,.14,.04),.26),      #10
    material('MAT_F02_Paving',(.095,.11,.14)),           #11
    material('MAT_F02_Lamp',(.98,.53,.12),1.65),         #12
    material('MAT_F02_Cable',(.023,.029,.045)),          #13
]
verts=[];faces=[];mids=[]
def poly(points,mat):
    i=len(verts);verts.extend(points);faces.append(tuple(range(i,i+len(points))));mids.append(mat)
def box(x,y,z,sx,sy,sz,mat):
    a,b,c=sx/2,sy/2,sz/2
    v=[(x-a,y-b,z-c),(x+a,y-b,z-c),(x+a,y+b,z-c),(x-a,y+b,z-c),(x-a,y-b,z+c),(x+a,y-b,z+c),(x+a,y+b,z+c),(x-a,y+b,z+c)]
    for f in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]:poly([v[j] for j in f],mat)
def tube(a,b,r,mat,n=6):
    a,b=Vector(a),Vector(b);d=(b-a).normalized();u=d.cross(Vector((0,0,1)))
    if u.length<.01:u=d.cross(Vector((0,1,0)))
    u.normalize();v=d.cross(u).normalized()
    lo=[tuple(a+r*(u*cos(2*pi*i/n)+v*sin(2*pi*i/n))) for i in range(n)]
    hi=[tuple(b+r*(u*cos(2*pi*i/n)+v*sin(2*pi*i/n))) for i in range(n)]
    poly(tuple(reversed(lo)),mat);poly(hi,mat)
    for i in range(n):j=(i+1)%n;poly((lo[i],lo[j],hi[j],hi[i]),mat)
def roof(x0,x1,y0,y1,zf,zb,panels=18):
    dx=(x1-x0)/panels
    for i in range(panels):
        xa=x0+i*dx;xb=xa+dx;rib=.04*(i%2)
        m=random.choices([5,6,7,1],[3,2,3,1])[0]
        poly(((xa,y0,zf+rib),(xb,y0,zf+rib),(xb,y1,zb+rib),(xa,y1,zb+rib)),m)
        if i%2:tube((xa,y0,zf+rib),(xa,y1,zb+rib),.014,1,4)
    tube((x0,y0,zf),(x1,y0,zf),.052,5,4)
def front_window(x,y,z,w,h,lit=True):
    box(x,y,z,w+.16,.09,h+.14,1)
    box(x,y-.06,z,w+.03,.03,h+.03,6)
    box(x,y-.09,z,w*.85,.026,h*.87,9 if lit else 10)
    box(x,y-.12,z,w*.06,.03,h*.90,1)
    box(x,y-.13,z+.07,w*.92,.03,.048,1)
    box(x,y-.14,z-h*.54,w+.20,.14,.08,2)
def side_window(x,y,z,w,h,lit=True):
    box(x,y,z,.09,w+.16,h+.14,1)
    box(x+.06,y,z,.03,w+.03,h+.03,6)
    box(x+.09,y,z,.026,w*.85,h*.87,9 if lit else 10)
    box(x+.12,y,z,.03,w*.06,h*.90,1)
def front_brick_patch(x0,x1,y,z0,z1,prob=.62):
    for row in range(int((z1-z0)/.20)):
        z=z0+row*.20+.09
        for i in range(int((x1-x0)/.36)):
            if random.random()>prob:continue
            x=x0+i*.36+.17+(row%2)*.15
            poly(((x-.14,y,z-.065),(x+.14,y,z-.065),(x+.14,y,z+.065),(x-.14,y,z+.065)),4 if random.random()<.24 else 3)
def side_brick_patch(x,y0,y1,z0,z1,prob=.63):
    for row in range(int((z1-z0)/.2)):
        z=z0+row*.2+.09
        for i in range(int((y1-y0)/.36)):
            if random.random()>prob:continue
            y=y0+i*.36+.17+(row%2)*.15
            poly(((x,y-.14,z-.065),(x,y+.14,z-.065),(x,y+.14,z+.065),(x,y-.14,z+.065)),4 if random.random()<.26 else 3)

# Cracked square foundation and rough sidewalk.
box(0,0,-.18,9.5,8.7,.36,1)
box(0,0,.025,9.25,8.45,.06,11)
for i in range(-9,10):box(i*.47,-3.85,.065,.018,.63,.01,2)
for y in [-4.12,-3.64,-3.16]:box(0,y,.065,9.0,.018,.01,1)
for x in [-3.42,-2.66,-1.70,1.25,2.36,3.18]:
    box(x,-3.40,.08,.36,.26,.025,2)

# A brick base and cramped corrugated front extension.
box(-.75,.40,1.47,5.30,5.18,2.73,3)
box(2.50,-.40,1.35,2.32,4.14,2.50,0)
box(-3.50,1.20,1.39,1.24,3.06,2.55,0)
front_brick_patch(-3.15,1.58,-2.23,.18,2.75,.70)
side_brick_patch(1.98,-2.05,2.70,.18,2.75,.78)
for x in [-3.05,-1.61,.21,1.98,3.53]:
    box(x,-2.32,1.46,.15,.17,2.72,8)
    box(x,-2.32,.21,.28,.28,.36,2)
box(-1.43,-2.29,1.36,2.50,.10,2.37,5)
for i in range(13):box(-2.58+i*.19,-2.37,1.35,.04,.04,2.34,6 if i%4==0 else 1)
box(2.48,-2.57,1.27,.87,.10,2.30,8)
box(2.48,-2.64,1.30,.64,.04,2.14,1)
for z in [.52,.90,1.28,1.66,2.04]:box(2.49,-2.68,z,.69,.04,.085,8)
front_window(.90,-2.34,1.70,.56,.83)
side_window(3.71,-.74,1.40,.55,.89,False)
box(3.74,-.74,1.40,.06,.08,1.14,8) # boarded side opening
for y in [-1.02,-.62]:box(3.77,y,1.41,.07,.06,1.08,8)

# Cantilevered upper shack and its improvised bracing.
for x in [-3.29,-.84,1.52,3.31]:
    tube((x,-2.59,.38),(x,-2.59,3.15),.085,8,4)
for x in [-3.28,-.84,1.52]:
    tube((x,-2.58,.62),(x+1.03,-2.58,3.08),.074,8,4)
box(0,-2.43,3.17,7.25,.30,.23,8)
box(-.20,.35,4.35,7.22,5.12,2.26,0)
box(-1.90,-2.31,4.25,3.86,.13,2.06,5)
box(1.62,-2.32,4.34,3.10,.13,2.12,2)
for i in range(17):
    x=-3.71+i*.22
    box(x,-2.40,4.25,.026,.034,1.98,6 if random.random()<.33 else 1)
for x in [-3.66,-1.72,.48,3.21]:box(x,-2.35,4.28,.17,.20,2.32,8)
front_window(-2.72,-2.42,4.45,.70,1.03)
front_window(-.83,-2.44,4.46,.94,1.02,random.random()>.2)
front_window(1.29,-2.45,4.45,.62,.86)
side_window(3.53,-1.33,4.50,.60,.93)
side_window(3.53,1.27,4.43,.54,.86,False)

# Rust streaks, plaster scars and a mismatched fascia.
for x in [-2.92,-2.37,-1.57,-.37,1.12,1.76,2.80]:
    box(x,-2.48,3.50,.16,.045,.18,7)
for x,z,w,h in [(-.12,4.10,.46,.50),(2.15,4.72,.42,.73),(2.71,3.86,.50,.34)]:
    box(x,-2.49,z,w,.015,h,15 if random.random()<.5 else 1)
for i in range(10):
    x=random.uniform(-3.20,3.11);z=random.uniform(3.35,5.23)
    box(x,-2.51,z,random.uniform(.035,.09),.014,random.uniform(.15,.60),7)
roof(-3.98,3.54,-2.72,2.88,5.61,6.12,28)

# Small crooked rooftop room with a boarded side and sheet canopy.
box(-1.44,.82,6.29,3.18,3.42,1.72,3)
box(-1.44,-.94,6.29,3.20,.11,1.68,5)
front_brick_patch(-2.92,.02,-1.00,5.50,7.06,.62)
front_window(-1.97,-1.03,6.31,.57,.71)
front_window(-.75,-1.03,6.37,.46,.65,False)
for z in [6.11,6.35,6.58]:box(-.75,-1.09,z,.58,.04,.06,8)
for x,y in [(-2.83,-.87),(-.10,-.87),(-2.83,2.46),(-.10,2.46)]:
    tube((x,y,7.13),(x,y,7.77),.072,8,4)
roof(-3.17,.26,-1.22,2.81,7.83,8.04,15)

# Leaning antenna and taut roof cables distinguish this silhouette.
tube((-.08,1.78,7.91),(.32,1.84,8.81),.038,6,6)
box(.32,1.84,8.83,.13,.13,.13,12)
tube((-.22,1.77,8.31),(.72,1.90,8.42),.026,8,4)
for a,b in [((.03,1.78,8.06),(-2.95,2.15,7.56)),((.06,1.78,8.12),(3.31,1.35,5.45))]:
    tube(a,b,.025,13,5)

# Side lean-to and a tiny rain collector, built from salvaged sheets.
box(3.61,.56,2.61,1.32,2.88,.23,8)
roof(2.83,4.22,-1.36,1.93,2.76,3.06,9)
box(3.82,-1.74,2.75,.46,.42,.63,5)
box(3.82,-1.74,3.10,.53,.48,.11,6)
for a,b in [((4.00,1.82,2.52),(4.00,1.82,4.90)),((4.00,1.82,4.90),(3.38,1.82,5.15))]:tube(a,b,.055,6,6)

# Porch lamp, pipework, vents and ragged hanging cloths.
box(2.49,-2.75,2.52,.12,.17,.18,1)
box(2.49,-2.79,2.33,.31,.25,.24,12)
box(2.49,-2.81,2.16,.45,.30,.07,1)
for a,b in [((-3.55,-2.38,.35),(-3.55,-2.38,2.40)),((-3.55,-2.38,2.40),(-3.81,-2.38,2.40)),((-3.81,-2.38,2.40),(-3.81,-2.38,5.44))]:
    tube(a,b,.075,6,7)
for x,y,z in [(-3.17,-2.43,1.19),(3.07,-2.67,1.62),(2.37,-2.47,3.88)]:
    box(x,y,z,.51,.08,.57,1)
    for i in range(4):box(x,y-.05,z-.21+i*.14,.43,.035,.038,6)
for x,z,w,h in [(-3.37,3.48,.38,.70),(-2.79,3.43,.31,.66),(-2.23,3.47,.35,.72)]:
    box(x,-2.64,z,w,.03,h,15 if x<-3 else 5)

# Final mesh and low-poly night presentation.
me=bpy.data.meshes.new('SM_Gotham_Favela_02_Mesh');me.from_pydata(verts,[],faces);me.update()
for m in M:me.materials.append(m)
for p,mid in zip(me.polygons,mids):p.material_index=mid
obj=bpy.data.objects.new('SM_Gotham_Favela_02_8bit',me);scene.collection.objects.link(obj)
obj['theme']='poorer Gotham favela; rust, patched concrete, crooked timber, boarded opening'
camdata=bpy.data.cameras.new('CAM_Favela_02_Hero');cam=bpy.data.objects.new(camdata.name,camdata);scene.collection.objects.link(cam)
cam.location=(13,-18,13);cam.rotation_euler=(Vector((0,0,4.10))-cam.location).to_track_quat('-Z','Y').to_euler()
camdata.type='ORTHO';camdata.ortho_scale=13.8;scene.camera=cam
def area(name,loc,target,power,color,size):
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.color=color;d.shape='DISK';d.size=size
    o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=loc
    o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
area('LGT_F02_Moon',(-7,-9,13),(0,0,4),1100,(.55,.65,1),9)
area('LGT_F02_Rim',(7,5,10),(0,0,4),650,(.38,.50,.82),7)
area('LGT_F02_Warm',(0,-5,4),(0,-2,2),260,(1,.55,.26),5)
world=bpy.data.worlds.new('World_F02_Night');world.use_nodes=True
bg=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND');bg.inputs['Color'].default_value=(.008,.011,.026,1);bg.inputs['Strength'].default_value=.30;scene.world=world
scene.render.engine='CYCLES';scene.cycles.samples=32
scene.render.resolution_x=1024;scene.render.resolution_y=1024;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(WORK/'gotham_favela_02_clean.png')
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=.30
bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'gotham_favela_02_8bit.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'gotham_favela_02_8bit.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True)
bpy.ops.render.render(write_still=True)
source=bpy.data.images.load(str(WORK/'gotham_favela_02_clean.png'),check_existing=False)
w,h=source.size;arr=np.empty(w*h*4,dtype=np.float32);source.pixels.foreach_get(arr)
small=arr.reshape(h//2,2,w//2,2,4).mean(axis=(1,3))
pix=np.repeat(np.repeat(small,2,axis=0),2,axis=1)
out=bpy.data.images.new('Gotham Favela 02 Pixel Render',width=w,height=h,alpha=True)
out.pixels.foreach_set(pix.ravel());out.filepath_raw=str(OUT/'gotham_favela_02_8bit.png');out.file_format='PNG';out.save()
print('DONE',round(max(v[2] for v in verts)-min(v[2] for v in verts),2),'m,',len(faces),'faces')
