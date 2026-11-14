"""Tall, poor Gotham favela stack with external fire escape; standalone Blender build."""
import bpy, math, random, logging
import numpy as np
from pathlib import Path
from mathutils import Vector

random.seed(404)
OUT=Path(__file__).resolve().parent
NAME='gotham_favela_04_8bit'
bpy.ops.wm.read_factory_settings(use_empty=True)
s=bpy.context.scene;s.name='Gotham Favela 04 8-bit';s.unit_settings.system='METRIC'

def mat(name,c,e=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*c,1)
 p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
 p.inputs['Base Color'].default_value=(*c,1);p.inputs['Roughness'].default_value=.9
 p.inputs['Emission Color'].default_value=(*c,1);p.inputs['Emission Strength'].default_value=e
 return m
M=[mat('M04_soot_concrete',(.087,.084,.105)),mat('M04_dirty_plaster',(.23,.20,.20)),
   mat('M04_broken_stone',(.34,.30,.30)),mat('M04_brick',(.19,.075,.065)),
   mat('M04_old_brick',(.25,.11,.08)),mat('M04_rust',(.24,.095,.045)),
   mat('M04_corrugated',(.065,.078,.10)),mat('M04_sheet_silver',(.20,.20,.22)),
   mat('M04_recess',(.021,.024,.037)),mat('M04_window',(.92,.38,.055),1.4),
   mat('M04_dead_window',(.12,.066,.045)),mat('M04_timber',(.105,.059,.039)),
   mat('M04_iron',(.031,.037,.052)),mat('M04_lamp',(.95,.51,.10),1.7),
   mat('M04_pavement',(.085,.095,.125)),mat('M04_smoke',(.07,.07,.08))]
V=[];F=[];I=[]
def poly(p,m):
 q=len(V);V.extend(tuple(x) for x in p);F.append(tuple(range(q,q+len(p))));I.append(m)
def box(x,y,z,a,b,c,m):
 a/=2;b/=2;c/=2
 p=[(x-a,y-b,z-c),(x+a,y-b,z-c),(x+a,y+b,z-c),(x-a,y+b,z-c),
    (x-a,y-b,z+c),(x+a,y-b,z+c),(x+a,y+b,z+c),(x-a,y+b,z+c)]
 for f in ((0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)):poly([p[j] for j in f],m)
def tube(a,b,r,m,n=6):
 a,b=Vector(a),Vector(b);d=(b-a).normalized();u=d.cross(Vector((0,0,1)))
 if u.length<.01:u=d.cross(Vector((0,1,0)))
 u.normalize();v=d.cross(u).normalized()
 lo=[tuple(a+r*(u*math.cos(2*math.pi*i/n)+v*math.sin(2*math.pi*i/n))) for i in range(n)]
 hi=[tuple(b+r*(u*math.cos(2*math.pi*i/n)+v*math.sin(2*math.pi*i/n))) for i in range(n)]
 poly(tuple(reversed(lo)),m);poly(hi,m)
 for i in range(n):j=(i+1)%n;poly((lo[i],lo[j],hi[j],hi[i]),m)
def sheet(x0,x1,y0,y1,z0,z1,n):
 for j in range(n):
  a=x0+(x1-x0)*j/n;b=x0+(x1-x0)*(j+1)/n
  h=.04 if j%2 else 0
  m=random.choices([6,7,5,11],[.50,.18,.27,.05])[0]
  poly(((a,y0,z0+h),(b,y0,z0+h),(b,y1,z1+h),(a,y1,z1+h)),m)
  if j%2:tube((a,y0,z0+h),(a,y1,z1+h),.016,7,4)
 tube((x0,y0,z0),(x1,y0,z0),.04,12,4)
def window_front(x,y,z,w,h,lit=True):
 box(x,y,z,w+.18,.12,h+.18,8);box(x,y-.07,z,w+.04,.04,h+.04,2)
 box(x,y-.11,z,w*.85,.025,h*.88,9 if lit else 10)
 box(x,y-.14,z,.045,.035,h*.91,12);box(x,y-.14,z+.04,w*.88,.035,.045,12)
 box(x,y-.15,z-h*.54,w+.21,.14,.08,2)
def window_side(x,y,z,w,h,lit=True):
 box(x,y,z,.12,w+.18,h+.18,8);box(x+.08,y,z,.04,w+.04,h+.04,2)
 box(x+.11,y,z,.025,w*.86,h*.88,9 if lit else 10)
 box(x+.14,y,z,.035,.04,h*.90,12);box(x+.14,y,z+.04,.035,w*.88,.045,12)
def board_front(x,y,z,w,h):
 window_front(x,y,z,w,h,False)
 for k in range(3):
  obx=x+(k-1)*w*.28
  box(obx,y-.17,z,.15,.05,h*.95,11)
 tube((x-w*.4,y-.22,z-h*.34),(x+w*.4,y-.22,z+h*.25),.045,11,4)
def bricks_front(x0,x1,y,z0,z1,density=.48):
 for row in range(int((z1-z0)/.20)):
  z=z0+.12+row*.20
  for j in range(int((x1-x0)/.39)):
   if random.random()>density:continue
   x=x0+.20+j*.39+(row%2)*.15
   poly(((x-.16,y,z-.055),(x+.16,y,z-.055),(x+.16,y,z+.055),(x-.16,y,z+.055)),4 if random.random()<.3 else 3)
def bricks_side(x,y0,y1,z0,z1,density=.46):
 for row in range(int((z1-z0)/.20)):
  z=z0+.12+row*.20
  for j in range(int((y1-y0)/.39)):
   if random.random()>density:continue
   y=y0+.20+j*.39+(row%2)*.15
   poly(((x,y-.16,z-.055),(x,y+.16,z-.055),(x,y+.16,z+.055),(x,y-.16,z+.055)),4 if random.random()<.3 else 3)

# Narrow tile with cracked pavement, less polished than the earlier favela.
box(0,0,-.22,9.75,9.15,.44,8);box(0,0,.03,9.55,8.95,.075,14)
for x in [-4.0,-3.1,-2.0,-1.0,.35,1.43,2.66,3.65]:
 box(x,-4.13,.085,.015,.83,.015,2)
for y in [-4.52,-4.02,-3.52]:box(0,y,.084,9.20,.018,.014,8)

# Irregular ground structure: grimy concrete center and patched brick wing.
box(-.55,.35,2.20,5.85,6.25,4.17,0)
box(2.85,-.37,2.0,2.36,5.25,3.77,3)
box(-3.35,1.15,1.90,1.48,3.62,3.58,11)
bricks_front(1.62,4.04,-3.07,.28,3.85,.58)
bricks_side(4.08,-2.83,2.14,.30,3.80,.66)
box(-.70,-2.82,2.35,5.90,.16,3.88,1)
for x in [-3.46,-.86,1.42,4.00]:
 box(x,-2.90,2.15,.19,.23,4.04,11)
 box(x,-2.90,.31,.37,.36,.45,2)
board_front(-1.57,-2.94,2.27,.73,1.15)
window_front(.37,-2.94,2.40,.59,1.16)
window_side(4.15,-1.14,2.29,.60,1.20,True)
window_side(4.15,1.06,2.30,.57,1.18,False)
box(-1.27,-3.04,1.17,1.38,.13,2.16,8)
box(-1.27,-3.12,1.16,1.15,.045,1.98,5)
for k in range(8):box(-1.79+k*.15,-3.16,1.17,.025,.04,1.94,7)
box(1.35,-3.08,1.16,1.00,.13,2.24,8);box(1.35,-3.17,1.13,.79,.04,2.09,11)
box(1.53,-3.22,1.17,.055,.06,.13,2)
sheet(.62,4.12,-3.55,-1.66,4.04,4.47,17)
for x,y,z in [(-3.16,-2.98,1.0),(2.96,-3.15,2.56)]:
 box(x,y,z,.57,.06,.61,6)
 for q in range(5):box(x,y-.04,z-.22+q*.11,.50,.035,.035,8)

# Cantilevered second storey with corrugated front and exposed diagonal braces.
for x in [-3.42,-1.40,1.16,3.57]:
 tube((x,-3.03,2.0),(x+.78,-3.03,4.44),.085,11,4)
box(0,-2.90,4.39,7.90,.31,.27,11)
box(-.35,.34,6.28,7.44,6.07,3.71,1)
box(-2.12,-2.75,6.24,3.55,.16,3.48,5)
box(1.43,-2.77,6.24,3.10,.16,3.48,0)
box(3.45,.35,6.28,.16,6.00,3.69,6)
for x in [i*.23-3.73 for i in range(16)]:box(x,-2.85,6.26,.028,.04,3.48,7 if random.random()<.31 else 6)
for y in [i*.30-2.52 for i in range(17)]:box(3.54,y,6.26,.035,.035,3.50,7 if random.random()<.28 else 6)
for x in [-3.46,-1.66,.08,2.88]:box(x,-2.81,6.27,.16,.23,3.67,11)
window_front(-2.63,-2.90,6.43,.70,1.15)
board_front(-1.37,-2.90,6.30,.68,1.19)
window_front(.54,-2.90,6.46,.62,1.12)
window_front(2.25,-2.90,6.45,.54,1.03)
window_side(3.61,-1.57,6.40,.57,1.08)
window_side(3.61,1.04,6.35,.58,1.12)
sheet(-3.94,3.62,-3.24,.14,8.30,8.75,27)
box(-2.13,-3.15,4.65,3.72,.17,.82,5)
for x in [i*.24-3.75 for i in range(14)]:box(x,-3.25,4.65,.032,.04,.75,7 if random.random()<.24 else 6)

# Third staggered brick floor and lean-to. Roof height is deliberately uneven.
box(-.38,1.07,10.05,5.52,4.65,3.35,3)
box(-2.98,.43,9.57,1.48,3.84,2.35,0)
bricks_front(-3.05,2.40,-1.33,8.49,11.63,.53)
bricks_side(2.42,-1.14,3.20,8.49,11.64,.55)
box(-.28,-1.29,10.04,5.42,.12,3.34,3)
window_front(-2.12,-1.39,10.18,.68,1.08)
window_front(.09,-1.39,10.13,.53,1.13)
board_front(1.46,-1.39,10.02,.51,.96)
window_side(2.51,.58,10.12,.55,1.08)
for x in [-2.90,-.46,2.32]:box(x,-1.35,10.04,.21,.20,3.37,2)
sheet(-3.42,2.63,-1.64,3.59,11.91,12.24,23)
sheet(-3.75,-2.02,-1.05,2.56,10.89,11.21,8)

# Tiny high shack, mismatched boards, a broken parapet and bent antenna.
box(.82,1.18,13.08,2.30,2.18,1.98,0)
box(.82,.02,13.06,2.28,.12,1.90,11)
for x in [-.19,.83,1.84]:box(x,-.07,13.05,.10,.06,1.88,7 if x>.5 else 11)
window_front(.82,-.11,13.30,.64,.68)
sheet(-.58,2.23,-.36,2.55,14.35,14.64,12)
for x in [-.48,1.98]:box(x,-.28,14.47,.17,.21,.36,2)
box(-.15,-.28,14.70,.26,.24,.16,2)
box(1.92,-.28,14.70,.25,.24,.16,2)
# Missing center crenel makes the parapet look broken.
box(-.11,-.30,14.66,.56,.16,.09,2)
tube((1.91,1.78,14.45),(2.23,1.95,15.49),.035,12,5)
tube((2.23,1.95,15.49),(2.49,1.86,15.77),.025,12,5)

# External fire escape on visible right side: staggered landings, steps, guards.
for z,y in [(4.39,-1.45),(8.31,.55),(11.91,2.30)]:
 box(4.07,y,z,1.36,1.10,.18,12)
 for xx in [3.50,4.60]:
  for yy in [y-.45,y+.45]:tube((xx,yy,z+.12),(xx,yy,z+.98),.035,12,4)
 for yy in [y-.45,y+.45]:tube((3.50,yy,z+.95),(4.60,yy,z+.95),.035,12,4)
for (z0,y0),(z1,y1) in [((4.39,-1.45),(8.31,.55)),((8.31,.55),(11.91,2.30))]:
 for xx in [3.68,4.39]:tube((xx,y0,z0),(xx,y1,z1),.060,12,4)
 for k in range(12):
  t=(k+.5)/12;y=y0+(y1-y0)*t;z=z0+(z1-z0)*t
  box(4.04,y,z,.72,.19,.075,6)
for yy in [-1.0,.65,2.20]:box(4.68,yy,9.0,.13,.12,6.8,12)

# Utility pipes, stained streaks and discarded panels.
for a,b in [((-3.67,-2.98,.38),(-3.67,-2.98,4.25)),
            ((-3.67,-2.98,4.25),(-3.98,-2.98,4.25)),
            ((-3.98,-2.98,4.25),(-3.98,-2.98,8.25)),
            ((2.41,-1.34,8.4),(2.64,-1.34,8.4)),
            ((2.64,-1.34,8.4),(2.64,-1.34,11.8))]:tube(a,b,.075,7,6)
for x,z in [(-2.90,3.28),(-.08,3.30),(1.96,3.29),(-1.64,7.90),(1.26,7.90)]:
 box(x,-2.99,z,.13,.055,.74,5)
for x,y,z in [(-3.57,-2.38,.24),(2.81,-3.42,.20),(-2.80,2.96,.32)]:
 box(x,y,z,.63,.35,.12,7)
box(1.35,-3.31,3.18,.21,.22,.12,12)

# Uneven soot and water stains break the clean planes around old repairs.
for x,z,w,h in [(-3.08,3.28,.31,.90),(-.12,3.65,.18,.53),(.76,3.73,.20,.44),
                (-3.01,7.61,.29,.70),(-.19,7.94,.15,.32),(1.75,5.12,.19,.54),
                (-2.75,10.71,.22,.55),(-1.09,11.35,.16,.38),(1.89,9.13,.20,.46)]:
 y=-3.03 if z<4.4 else (-2.96 if z<8.4 else -1.44)
 poly(((x-w/2,y,z-h/2),(x+w*.45,y,z-h*.48),
       (x+w/2,y,z+h*.34),(x-w*.36,y,z+h/2)),8 if random.random()<.55 else 0)
for y,z,w,h in [(-2.10,1.23,.22,.80),(.29,3.26,.17,.49),(1.62,2.98,.26,.62),
                (-1.54,5.17,.18,.63),(.85,6.52,.20,.48),(1.58,9.12,.22,.55)]:
 x=4.19 if z<4.3 else (3.65 if z<8.4 else 2.54)
 poly(((x,y-w/2,z-h/2),(x,y+w*.45,z-h*.44),
       (x,y+w/2,z+h*.36),(x,y-w*.31,z+h/2)),8)

mesh=bpy.data.meshes.new('SM_Gotham_Favela_04_Mesh');mesh.from_pydata(V,[],F);mesh.update()
for m in M:mesh.materials.append(m)
for f,i in zip(mesh.polygons,I):f.material_index=i
o=bpy.data.objects.new('SM_Gotham_Favela_04_8bit',mesh);s.collection.objects.link(o)
o['theme']='poor Gotham favela; patched brick, dirty concrete, rusty sheets, external fire escape'
o['height_m']=max(p[2] for p in V)-min(p[2] for p in V)

camd=bpy.data.cameras.new('CAM_Favela_04_Hero');cam=bpy.data.objects.new(camd.name,camd);s.collection.objects.link(cam)
cam.location=(19,-24,19);cam.rotation_euler=(Vector((0,0,7.6))-cam.location).to_track_quat('-Z','Y').to_euler()
camd.type='ORTHO';camd.ortho_scale=20.0;s.camera=cam
def area(name,loc,power,color,size):
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.color=color;d.shape='DISK';d.size=size
 ob=bpy.data.objects.new(name,d);s.collection.objects.link(ob);ob.location=loc
 ob.rotation_euler=(Vector((0,0,7))-ob.location).to_track_quat('-Z','Y').to_euler()
area('LGT_Favela04_Moon',(-8,-11,19),1850,(.55,.63,1),11)
area('LGT_Favela04_Rim',(9,8,17),1000,(.38,.49,.81),10)
area('LGT_Favela04_Door',(2,-8,6),470,(1,.51,.25),7)
w=bpy.data.worlds.new('World_Favela04_Night');w.use_nodes=True
bg=next(n for n in w.node_tree.nodes if n.type=='BACKGROUND');bg.inputs['Color'].default_value=(.007,.010,.024,1);bg.inputs['Strength'].default_value=.3;s.world=w
s.render.engine='CYCLES';s.cycles.samples=48;s.render.resolution_x=s.render.resolution_y=1024;s.render.resolution_percentage=100
s.render.image_settings.file_format='PNG';s.render.filepath=str(OUT/f'{NAME}_clean.png')
s.view_settings.view_transform='AgX';s.view_settings.look='AgX - Medium High Contrast';s.view_settings.exposure=.30
bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/f'{NAME}.blend'))
logging.disable(logging.INFO)
bpy.ops.export_scene.gltf(filepath=str(OUT/f'{NAME}.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True)
logging.disable(logging.NOTSET)
bpy.ops.render.render(write_still=True)
src=bpy.data.images.load(str(OUT/f'{NAME}_clean.png'),check_existing=False)
arr=np.empty(1024*1024*4,dtype=np.float32);src.pixels.foreach_get(arr)
small=arr.reshape(512,2,512,2,4).mean(axis=(1,3));pix=np.repeat(np.repeat(small,2,axis=0),2,axis=1)
dest=bpy.data.images.new(NAME+'_pixel',width=1024,height=1024,alpha=True)
dest.pixels.foreach_set(pix.ravel());dest.filepath_raw=str(OUT/f'{NAME}.png');dest.file_format='PNG';dest.save()
print('BUILT',NAME,'height',round(o['height_m'],2),'faces',len(F))
