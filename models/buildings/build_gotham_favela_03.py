"""Build a worn, narrow Gotham favela tenement with rooftop laundry."""

from pathlib import Path
import bpy, math, random, logging
import numpy as np
from mathutils import Vector

random.seed(303)
OUT=Path('/Users/daniellee/Desktop/somethingcity/models/buildings')
NAME='gotham_favela_03_8bit'
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
scene.name='Gotham Favela 03 8-bit'
scene.unit_settings.system='METRIC'

def material(name,c,emit=0):
    m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*c,1)
    p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value=(*c,1)
    p.inputs['Roughness'].default_value=.9
    p.inputs['Emission Color'].default_value=(*c,1)
    p.inputs['Emission Strength'].default_value=emit
    return m

M=[
 material('MAT_Favela03_SootBrick',(.13,.052,.047)),      # 0
 material('MAT_Favela03_RedBrick',(.23,.090,.066)),       # 1
 material('MAT_Favela03_DirtyPlaster',(.19,.18,.17)),     # 2
 material('MAT_Favela03_PeelingPlaster',(.32,.29,.25)),   # 3
 material('MAT_Favela03_DarkRecess',(.026,.029,.043)),    # 4
 material('MAT_Favela03_SheetSteel',(.071,.087,.110)),    # 5
 material('MAT_Favela03_SheetLight',(.22,.24,.27)),       # 6
 material('MAT_Favela03_Rust',(.29,.098,.050)),           # 7
 material('MAT_Favela03_RottenWood',(.14,.074,.051)),    # 8
 material('MAT_Favela03_WarmWindow',(.95,.43,.075),1.55), # 9
 material('MAT_Favela03_DimWindow',(.42,.18,.05),.35),    # 10
 material('MAT_Favela03_Iron',(.035,.042,.061)),          # 11
 material('MAT_Favela03_Paving',(.10,.115,.145)),         # 12
 material('MAT_Favela03_Lamp',(.98,.55,.15),1.7),         # 13
 material('MAT_Favela03_ClothCream',(.50,.42,.34)),      # 14
 material('MAT_Favela03_ClothBlue',(.19,.25,.31)),       # 15
 material('MAT_Favela03_ClothRed',(.34,.15,.12)),         # 16
]
verts=[];faces=[];mids=[]

def poly(points,mat):
    k=len(verts);verts.extend(points);faces.append(tuple(range(k,k+len(points))));mids.append(mat)
def box(x,y,z,sx,sy,sz,mat):
    a,b,c=sx/2,sy/2,sz/2
    p=[(x-a,y-b,z-c),(x+a,y-b,z-c),(x+a,y+b,z-c),(x-a,y+b,z-c),
       (x-a,y-b,z+c),(x+a,y-b,z+c),(x+a,y+b,z+c),(x-a,y+b,z+c)]
    for q in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]:poly([p[i] for i in q],mat)
def tube(a,b,r,mat,n=6):
    a,b=Vector(a),Vector(b);d=(b-a).normalized();u=d.cross(Vector((0,0,1)))
    if u.length<.01:u=d.cross(Vector((0,1,0)))
    u.normalize();v=d.cross(u).normalized()
    lo=[tuple(a+r*(u*math.cos(i*math.tau/n)+v*math.sin(i*math.tau/n))) for i in range(n)]
    hi=[tuple(b+r*(u*math.cos(i*math.tau/n)+v*math.sin(i*math.tau/n))) for i in range(n)]
    poly(tuple(reversed(lo)),mat);poly(hi,mat)
    for i in range(n):j=(i+1)%n;poly((lo[i],lo[j],hi[j],hi[i]),mat)
def roof(x0,x1,y0,y1,z0,z1,n=18):
    dx=(x1-x0)/n
    for i in range(n):
        a=x0+i*dx;b=a+dx;dz=.045 if i%2 else 0
        mat=random.choices([5,6,7],[5,2,3])[0]
        poly(((a,y0,z0+dz),(b,y0,z0+dz),(b,y1,z1+dz),(a,y1,z1+dz)),mat)
        if i%2:tube((a,y0,z0+dz),(a,y1,z1+dz),.015,11,4)
    tube((x0,y0,z0),(x1,y0,z0),.04,11,4)
def brick_face(x0,x1,y,z0,z1,p=.78):
    for row in range(int((z1-z0)/.18)):
        z=z0+.13+row*.18
        for i in range(int((x1-x0)/.36)):
            if random.random()>p:continue
            x=x0+.15+i*.36+(row%2)*.12
            poly(((x-.14,y,z-.058),(x+.14,y,z-.058),(x+.14,y,z+.058),(x-.14,y,z+.058)),1 if random.random()<.38 else 0)
def brick_side(x,y0,y1,z0,z1,p=.72):
    for row in range(int((z1-z0)/.18)):
        z=z0+.13+row*.18
        for i in range(int((y1-y0)/.37)):
            if random.random()>p:continue
            y=y0+.14+i*.37+(row%2)*.10
            poly(((x,y-.14,z-.058),(x,y+.14,z-.058),(x,y+.14,z+.058),(x,y-.14,z+.058)),1 if random.random()<.35 else 0)
def front_window(x,y,z,w=.55,h=.78,lit=True,boards=False):
    box(x,y,z,w+.16,.10,h+.15,4)
    box(x,y-.07,z,w+.03,.035,h+.02,6)
    box(x,y-.095,z,w*.88,.02,h*.88,9 if lit else 10)
    box(x,y-.115,z,w*.055,.025,h*.9,11)
    box(x,y-.12,z+.05,w*.92,.025,.045,11)
    box(x,y-.13,z-h*.56,w+.20,.12,.07,2)
    if boards:
        for k in [-.2,.15]:
            strip=box(x,y-.16,z+k,w*1.06,.065,.13,8)
def side_window(x,y,z,w=.55,h=.78,lit=True,boards=False):
    box(x,y,z,.10,w+.16,h+.15,4)
    box(x+.07,y,z,.035,w+.03,h+.02,6)
    box(x+.095,y,z,.02,w*.88,h*.88,9 if lit else 10)
    box(x+.12,y,z,.025,w*.055,h*.90,11)
    if boards:
        for k in [-.16,.16]:box(x+.16,y,z+k,.065,w*1.05,.12,8)
def sheet_front(x0,x1,y,z0,z1):
    for i in range(int((x1-x0)/.24)):
        x=x0+.12+i*.24
        box(x,y,z0+(z1-z0)/2,.235,.055,z1-z0,random.choices([5,6,7],[6,2,2])[0])
        if i%2:box(x+.09,y-.033,z0+(z1-z0)/2,.022,.025,z1-z0,11)

# Uneven paving, chipped curb and scattered slabs.
box(0,0,-.18,7.8,7.5,.36,4)
box(0,0,.045,7.55,7.26,.09,12)
for i in range(-7,8):box(i*.47,-3.10,.095,.016,.84,.012,3)
for y in [-3.48,-2.98,-2.48]:box(0,y,.095,7.34,.017,.012,4)
for x in [-3.18,-1.88,.32,2.52]:box(x,-3.53,.11,.48,.38,.035,2)

# Ground floor, repaired brick over a concrete skeleton.
box(-.18,.20,1.85,5.10,5.00,3.50,0)
box(1.68,-.77,1.83,1.84,3.52,3.47,2)
box(-2.63,.42,1.76,.72,3.25,3.28,2)
brick_face(-2.50,2.35,-2.39,.20,3.54,.84)
brick_side(2.42,-2.24,2.50,.20,3.54,.80)
for x in [-2.40,-.92,1.00,2.36]:box(x,-2.41,1.86,.17,.18,3.54,2)
sheet_front(-2.23,-.57,-2.51,.42,2.92)
box(.85,-2.53,1.60,1.07,.11,2.30,4)
box(.85,-2.61,1.60,.85,.045,2.05,8)
for x in [.56,.85,1.14]:box(x,-2.65,1.55,.045,.025,1.98,11)
box(1.10,-2.68,1.46,.055,.04,.12,3)
box(.85,-2.60,.35,1.38,.56,.18,2)
front_window(1.86,-2.50,2.24,.50,.70,True,True)
side_window(2.45,-.68,2.19,.55,.77,True)
side_window(2.45,1.10,1.25,.49,.70,False,True)

# Jutting second-floor shell and exposed load-bearing braces.
for x in [-2.72,-.65,2.48]:
    box(x,-2.72,2.15,.15,.20,3.65,8)
    box(x,-2.72,.26,.35,.33,.40,2)
    tube((x,-2.72,1.30),(x+.94,-2.72,3.72),.066,8,4)
box(-.23,-2.71,3.73,5.65,.28,.25,8)
box(-.25,.18,5.08,5.70,5.42,2.58,2)
box(-.90,-2.58,5.08,3.90,.15,2.52,5)
sheet_front(-2.86,.98,-2.68,3.90,6.23)
box(1.77,-2.57,5.09,1.65,.16,2.49,0)
brick_face(1.02,2.58,-2.67,3.86,6.28,.68)
brick_side(2.67,-2.45,2.81,3.85,6.32,.76)
front_window(-1.79,-2.76,5.20,.64,.85,True,True)
front_window(-.41,-2.77,5.18,.68,.85,True)
front_window(1.78,-2.75,5.16,.51,.72,False,True)
for y in [-1.58,-.29,1.01,2.30]:side_window(2.73,y,5.06,.44,.69,random.random()>.35,boards=(y==1.01))
box(-1.00,-2.84,4.02,3.92,.13,.60,6)
for i in range(17):box(-2.83+i*.23,-2.92,4.02,.026,.022,.58,11)
roof(-3.35,2.95,-3.08,2.90,6.52,6.94,26)

# Narrow third floor shifted right. Broken stucco around brick edges.
box(.55,.52,7.43,3.95,4.44,2.25,0)
box(.58,-1.74,7.40,4.02,.14,2.13,2)
brick_face(-1.31,2.54,-1.84,6.40,8.55,.72)
brick_side(2.61,-1.65,2.72,6.40,8.55,.73)
for x,z in [(-1.33,7.08),(-.84,8.28),(.03,7.47),(1.73,6.72),(2.35,7.94)]:
    box(x,-1.87,z,.40,.035,.21,3)
front_window(-.53,-1.92,7.52,.60,.90,True)
front_window(1.12,-1.92,7.53,.56,.83,False,True)
for y in [-.80,1.15]:side_window(2.70,y,7.47,.54,.77,True,boards=(y<0))
sheet_front(-1.51,-.92,-1.91,6.48,8.38)
roof(-1.75,2.80,-2.20,2.95,8.73,9.19,20)

# Rooftop laundry/watch platform: rickety posts, patched awning, hanging cloth.
box(.51,.70,9.14,4.32,3.72,.18,8)
for x in [-1.40,2.30]:
    for y in [-.93,2.31]:
        tube((x,y,9.21),(x,y,11.23),.055,8,4)
for x in [-1.40,2.30]:tube((x,-.93,11.14),(x,2.31,11.14),.040,11,4)
for y in [-.93,2.31]:tube((-1.40,y,11.14),(2.30,y,11.14),.040,11,4)
roof(-1.63,2.55,-1.11,2.48,11.26,11.60,17)
for x in [-1.05,.18,1.48]:
    tube((x,-.57,9.92),(x,2.15,9.92),.014,11,4)
for x,y,w,h,mat in [(-1.05,-.25,.43,.65,14),(.18,.64,.48,.52,15),(1.48,1.07,.39,.72,16)]:
    poly(((x-w/2,y,9.89),(x+w/2,y,9.89),(x+w*.41,y,9.89-h),(x-w*.55,y,9.89-h)),mat)
for x,y in [(-.83,-.35),(.39,.55),(1.60,.99)]:box(x,y,9.91,.07,.06,.09,8)
box(1.45,2.31,9.65,1.27,.11,.73,5)
for i in range(6):box(.88+i*.22,2.39,9.65,.027,.025,.69,7 if i%2 else 6)

# Rooftop antenna, drain pipe, cable and small discarded rooftop units.
tube((-1.27,1.95,11.42),(-1.37,1.95,12.18),.025,11,5)
tube((-1.80,1.95,11.88),(-.89,1.95,11.88),.020,11,5)
tube((-1.37,1.95,12.18),(-1.55,1.95,12.39),.020,11,5)
for a,b in [((2.63,-2.40,.43),(2.63,-2.40,4.43)),
            ((2.63,-2.40,4.43),(2.92,-2.40,4.43)),
            ((2.92,-2.40,4.43),(2.92,-2.40,7.60)),
            ((2.92,-2.40,7.60),(2.44,-2.40,7.60))]:tube(a,b,.075,6,7)
for z in [1.18,2.34,3.69,5.21,6.49]:box(2.64,-2.40,z,.18,.20,.08,4)
box(-2.41,1.90,6.57,.59,.75,.55,5)
box(-2.41,1.90,6.86,.70,.86,.08,7)
for i in range(4):box(-2.68+i*.18,1.48,6.58,.07,.04,.31,4)

# Grime streaks and missing plaster along the visible faces.
for i in range(45):
    x=random.uniform(-2.16,2.21);z=random.uniform(.45,3.43)
    if random.random()<.54:box(x,-2.49,z,.07,.014,random.uniform(.08,.38),4)
for i in range(26):
    y=random.uniform(-2.13,2.23);z=random.uniform(.43,3.36)
    if random.random()<.48:box(2.48,y,z,.017,.08,random.uniform(.09,.32),4)

# Warm front door lantern and dim corner light.
box(.84,-2.79,2.66,.14,.20,.16,11)
box(.84,-2.84,2.48,.29,.29,.25,13)
box(.84,-2.87,2.33,.40,.37,.06,11)
box(-2.72,-2.78,3.20,.26,.28,.18,13)

me=bpy.data.meshes.new('SM_Favela03_Mesh');me.from_pydata(verts,[],faces);me.update()
for mat in M:me.materials.append(mat)
for p,mid in zip(me.polygons,mids):p.material_index=mid
obj=bpy.data.objects.new('SM_Gotham_Favela_03_8bit',me);scene.collection.objects.link(obj)
obj['height_m']=round(max(v[2] for v in verts)-min(v[2] for v in verts),2)
obj['style']='poor Gotham favela tenement with rooftop laundry'

camera_data=bpy.data.cameras.new('CAM_Favela03_Hero')
cam=bpy.data.objects.new('CAM_Favela03_Hero',camera_data);scene.collection.objects.link(cam)
cam.location=(12,-15,13)
cam.rotation_euler=(Vector((0,0,5.5))-cam.location).to_track_quat('-Z','Y').to_euler()
camera_data.type='ORTHO';camera_data.ortho_scale=15.2;scene.camera=cam

def area(name,loc,target,energy,color,size):
    data=bpy.data.lights.new(name,'AREA');data.energy=energy;data.color=color;data.shape='DISK';data.size=size
    light=bpy.data.objects.new(name,data);scene.collection.objects.link(light)
    light.location=loc;light.rotation_euler=(Vector(target)-light.location).to_track_quat('-Z','Y').to_euler()
area('LGT_Favela03_Key',(-7,-8,14),(0,0,5),980,(.58,.69,1),9)
area('LGT_Favela03_Rim',(7,6,11),(0,0,6),650,(.39,.50,.79),8)
area('LGT_Favela03_Warm',(0,-6,4),(0,-2.5,2),280,(1,.57,.29),6)
world=bpy.data.worlds.new('World_Favela03_Night');world.use_nodes=True
bg=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND')
bg.inputs['Color'].default_value=(.008,.011,.025,1);bg.inputs['Strength'].default_value=.28;scene.world=world
scene.render.engine='CYCLES';scene.cycles.samples=40
scene.render.resolution_x=1024;scene.render.resolution_y=1024
scene.render.image_settings.file_format='PNG'
scene.render.filepath=str(OUT/(NAME+'_clean.png'))
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=.30
bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/(NAME+'.blend')))
logging.disable(logging.INFO)
bpy.ops.export_scene.gltf(filepath=str(OUT/(NAME+'.glb')),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True)
logging.disable(logging.NOTSET)
bpy.ops.render.render(write_still=True)
src=bpy.data.images.load(str(OUT/(NAME+'_clean.png')),check_existing=False)
arr=np.empty(1024*1024*4,dtype=np.float32);src.pixels.foreach_get(arr)
small=arr.reshape(512,2,512,2,4).mean(axis=(1,3))
pix=np.repeat(np.repeat(small,2,axis=0),2,axis=1)
out=bpy.data.images.new(NAME+'_pixel',width=1024,height=1024,alpha=True)
out.pixels.foreach_set(pix.ravel());out.filepath_raw=str(OUT/(NAME+'.png'));out.file_format='PNG';out.save()
print('BUILT',NAME,'height',obj['height_m'],'faces',len(faces))
