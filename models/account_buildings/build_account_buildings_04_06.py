"""Generate account landmarks 04–06 as independent Gotham-inspired 8-bit assets."""
import bpy, math, sys, random, logging
from pathlib import Path
from mathutils import Vector
import numpy as np

OUT=Path(__file__).resolve().parent
which=int(sys.argv[sys.argv.index('--')+1]) if '--' in sys.argv else 4
assert which in (4,5,6)
random.seed(which*1701)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
scene.name=f'Account Building {which:02d}'
scene.unit_settings.system='METRIC'

def mat(name,c,e=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*c,1)
 p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
 p.inputs['Base Color'].default_value=(*c,1);p.inputs['Roughness'].default_value=.86
 p.inputs['Emission Color'].default_value=(*c,1);p.inputs['Emission Strength'].default_value=e
 return m

M=[mat('MAT_Stone',(.11,.115,.18)),mat('MAT_Dark',(.044,.049,.086)),
   mat('MAT_Trim',(.27,.265,.35)),mat('MAT_WindowWarm',(.96,.42,.075),1.25),
   mat('MAT_WindowDim',(.37,.17,.048),.25),mat('MAT_Iron',(.022,.027,.049)),
   mat('MAT_Teal',(.10,.69,.60),.78),mat('MAT_Gold',(.67,.44,.18),.15),
   mat('MAT_Roof',(.064,.069,.115)),mat('MAT_Pavement',(.095,.105,.16)),
   mat('MAT_Beacon',(.95,.06,.025),2.0)]
if which==5:
 for index,rgb in [(0,(.17,.105,.115)),(2,(.35,.275,.29)),(8,(.078,.059,.074))]:
  p=next(n for n in M[index].node_tree.nodes if n.type=='BSDF_PRINCIPLED')
  p.inputs['Base Color'].default_value=(*rgb,1)
  M[index].diffuse_color=(*rgb,1)
v=[];f=[];mi=[]
def poly(points,m):
 a=len(v);v.extend(points);f.append(tuple(range(a,a+len(points))));mi.append(m)
def box(x,y,z,sx,sy,sz,m):
 a,b,c=sx/2,sy/2,sz/2
 q=[(x-a,y-b,z-c),(x+a,y-b,z-c),(x+a,y+b,z-c),(x-a,y+b,z-c),(x-a,y-b,z+c),(x+a,y-b,z+c),(x+a,y+b,z+c),(x-a,y+b,z+c)]
 for inds in ((0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)):poly([q[j] for j in inds],m)
def front_window(x,y,z,w=.47,h=.87,lit=True):
 box(x,y,z,w+.16,.105,h+.16,2);box(x,y-.07,z,w+.045,.035,h+.04,5)
 box(x,y-.098,z,w*.88,.022,h*.88,3 if lit else 4)
 box(x,y-.12,z,.037,.026,h*.90,5)
 box(x,y-.124,z+.13,w*.90,.028,.033,5)
 box(x,y-.12,z-h*.55,w+.21,.12,.07,2)
def side_window(x,y,z,w=.47,h=.87,lit=True):
 box(x,y,z,.11,w+.16,h+.16,2);box(x+.07,y,z,.035,w+.045,h+.04,5)
 box(x+.098,y,z,.022,w*.88,h*.88,3 if lit else 4)
 box(x+.12,y,z,.027,.037,h*.88,5)
def cornice(x,y,z,sx,sy):
 box(x,y-sy/2-.05,z,sx+.21,.18,.16,2)
 box(x+sx/2+.05,y,z,.18,sy+.20,.16,2)
 box(x-sx/2-.05,y,z,.18,sy+.20,.16,2)
def pier(x,y,z,h):
 box(x,y,z,.31,.31,h,0);box(x,y,z+h/2+.08,.45,.45,.17,2)
def beacon(x,y,z):
 box(x,y,z+.35,.07,.07,.7,2);box(x,y,z+.75,.18,.18,.12,10)
def arch(x,y,z,w,h,m):
 poly([(x-w/2,y,z-h/2),(x+w/2,y,z-h/2),(x+w/2,y,z+h*.16),(x+w*.33,y,z+h*.39),(x,y,z+h*.52),(x-w*.33,y,z+h*.39),(x-w/2,y,z+h*.16)],m)

if which==4:
 # Broad vault hall: low wings, a crenellated tower, a tall roof lantern.
 H=21.0;W=10.6;D=8.2;base=12.0
 box(0,0,6.0,W,D,12,0);cornice(0,0,12.05,W,D)
 for s in (-1,1):
  box(s*4.12,-.4,7.15,2.9,6.0,14.3,0);cornice(s*4.12,-.4,14.32,2.9,6.0)
  box(s*4.12,-.4,14.43,2.57,5.7,.18,8)
 box(0,.60,15.2,4.7,5.55,6.25,0);cornice(0,.60,18.36,4.7,5.55)
 box(0,.60,18.51,4.0,4.9,.18,8)
 for s in (-1,1):
  pier(s*2.24,-2.17,18.66,.70)
  for y in (-1.8,0,1.8):pier(s*5.20,y,14.63,.65)
 box(0,.5,19.20,1.35,1.8,1.25,0);cornice(0,.5,19.86,1.35,1.8)
 box(0,.5,20.23,.46,.48,.76,2)
 for x in (-4.15,-3.26,3.26,4.15):
  for z in (2.0,3.95,5.9,7.85,9.8,11.7):front_window(x,-4.16,z,.48,1.13,random.random()>.23)
 for x in (-1.75,-.88,0,.88,1.75):
  for z in (4.35,6.15,7.95,9.75,11.55,13.50,15.30,17.10):front_window(x,-2.23 if z>12 else -4.16,z,.47,1.08,random.random()>.20)
 for y in (-3,-1.8,-.6,.6,1.8,3):
  for z in (2,3.95,5.9,7.85,9.8,11.7):side_window(5.64 if y<2.6 else 5.34,y,z,.45,1.10,random.random()>.25)
 for x in (-5.14,-3.1,-2.4,2.4,3.1,5.14):box(x,-4.17,6.60,.18,.20,11.75,2)
 for z in (2.9,5.0,7.15,9.3,11.65):box(0,-4.17,z,W+.2,.18,.10,2)
 # A shallow gable and two corner guardian blocks, unique to 04.
 arch(0,-4.20,11.10,3.5,2.5,1)
 box(0,-4.31,11.0,2.45,.12,1.75,1)
 for x,h in ((-1.02,.63),(-.68,1.15),(-.34,1.48),(0,1.64),(.34,1.48),(.68,1.15),(1.02,.63)):
  box(x,-4.39,11.0,.11,.05,h,6 if x==0 else 7)
 beacon(0,.5,20.25)
elif which==5:
 # Twin crown: central saddle with two offset roof towers.
 H=25.0;W=8.8;D=8.0;base=15.2
 box(0,0,7.6,W,D,15.2,0);cornice(0,0,15.25,W,D)
 box(0,0,15.42,8.5,7.6,.18,8)
 for s in (-1,1):
  box(s*2.05,.25,18.1,3.55,5.2,5.65,0);cornice(s*2.05,.25,20.95,3.55,5.2)
  box(s*2.05,.25,21.13,3.15,4.75,.18,8)
  box(s*2.05,.25,22.47,2.07,2.8,2.57,0);cornice(s*2.05,.25,23.80,2.07,2.8)
  for x in (s*1.55,s*2.55):
   for z in (16.5,18.2,19.9,21.65,23.05):front_window(x,-2.45 if z>=21 else -2.45,z,.45,.88,random.random()>.20)
  pier(s*3.74,-2.36,21.30,.85)
  beacon(s*2.05,.25,24.18)
 box(0,-2.00,17.35,2.10,.5,.45,2)
 for x in (-3.55,-2.66,-1.77,-.88,0,.88,1.77,2.66,3.55):
  for z in (2.1,4.2,6.3,8.4,10.5,12.6,14.4):front_window(x,-4.06,z,.45,1.16,random.random()>.24)
 for y in (-3,-1.8,-.6,.6,1.8,3):
  for z in (2.1,4.2,6.3,8.4,10.5,12.6,14.4):side_window(4.46,y,z,.44,1.08,random.random()>.24)
 for x in (-4.30,-3.15,-2.00,-.95,.95,2.00,3.15,4.30):box(x,-4.09,8.1,.14,.17,14.35,2)
 for z in (3.0,5.2,7.4,9.6,11.8,14.95):box(0,-4.09,z,W+.22,.17,.11,2)
 box(0,-4.16,15.25,3.0,.16,.28,7)
else:
 # Narrow needle: vertical buttresses, terrace setbacks and a beacon spire.
 H=29.0;W=7.4;D=7.4;base=18.0
 box(0,0,9.0,W,D,18.0,0);cornice(0,0,18.05,W,D)
 box(0,0,18.24,7.1,7.1,.18,8)
 for s in (-1,1):
  box(s*2.64,-.25,12.0,1.8,6.3,20.5,0);cornice(s*2.64,-.25,22.32,1.8,6.3)
  for y in (-2,0,2):pier(s*3.52,y,22.53,.65)
 box(0,.40,21.14,4.5,5.4,6.18,0);cornice(0,.40,24.28,4.5,5.4)
 box(0,.40,24.46,3.95,4.8,.16,8)
 box(0,.55,25.42,2.65,3.25,1.85,0);cornice(0,.55,26.40,2.65,3.25)
 box(0,.55,27.15,.76,.80,1.45,0)
 box(0,.55,27.95,.92,.96,.14,2)
 box(0,.55,28.15,.24,.24,.42,2)
 beacon(0,.55,28.15)
 for x in (-3.1,-2.34,-1.56,-.78,0,.78,1.56,2.34,3.1):
  for z in (2,4,6,8,10,12,14,16,17.8):front_window(x,-3.77,z,.39,1.05,random.random()>.22)
 for x in (-1.70,-.85,0,.85,1.70):
  for z in (19.1,20.7,22.3,23.8):front_window(x,-2.37,z,.39,.90,random.random()>.19)
 for y in (-2.6,-1.45,-.3,.85,2,3.15):
  for z in (2,4,6,8,10,12,14,16,17.8):side_window(3.76,y,z,.40,1.05,random.random()>.22)
 for x in (-3.63,-2.65,-1.85,-.95,.95,1.85,2.65,3.63):box(x,-3.82,9.2,.13,.16,17.2,2)
 for z in (3,6,9,12,15,17.85):box(0,-3.83,z,W+.20,.16,.11,2)
 for x in (-2.03,2.03):pier(x,-2.3,24.56,.66)
 for x in (-1.18,1.18):
  for y in (-.63,1.73):pier(x,y,26.53,.42)
 arch(0,-2.50,23.05,2.30,1.85,2)
 arch(0,-2.54,23.00,1.95,1.53,1)
 box(0,-2.59,22.90,.22,.07,1.05,7)

# Shared entrance vocabulary and square account tile.
plot=max(W+2.6,10.8)
box(0,0,-.18,plot,plot,.36,1);box(0,0,.04,plot-.20,plot-.20,.08,9)
front=-D/2-.09
for i in range(-int(plot*2.1),int(plot*2.1)+1):
 x=i*.25
 if abs(x)<plot/2-.18:box(x,-plot/2+.53,.095,.017,1.0,.013,2)
for z in (1.05,1.55,2.05):
 for x in (-1.45,1.45):box(x,front,z,.16,.24,.93,2)
arch(0,front-.045,1.65,2.65,3.2,5)
box(0,front-.13,1.40,1.75,.07,2.13,1)
for s in (-1,1):
 box(s*.43,front-.19,1.35,.75,.04,1.82,3)
 box(s*.43,front-.23,1.62,.75,.05,.07,5)
 box(s*.24,front-.25,1.34,.06,.05,.13,7)
for j in range(5):box(0,front-.75-j*.27,.19+j*.11,3.40-j*.13,.32,.16,2)
# Gold number panel so assets can be mapped to accounts without locking a name.
box(0,front-.19,3.34,2.62,.12,.49,1)
box(0,front-.28,3.34,2.48,.025,.36,6)
for k in (-1,1):
 x=k*(plot/2-.34);box(x,-plot/2+.32,.68,.38,.38,1.15,2)
 box(x,-plot/2+.32,1.43,.46,.46,.13,5)
 box(x,-plot/2+.32,1.69,.29,.29,.40,3)
 box(x,-plot/2+.32,1.96,.40,.40,.10,5)
for x in (-plot/2+.44,plot/2-.44):
 for yy in [n*.40 for n in range(-int(plot*1.1),int(plot*1.1)+1)]:
  if abs(yy)<plot/2-.23:box(x,yy,.84,.048,.048,.88,5)
for yy in (-plot/2+.35,plot/2-.35):
 for n in range(-int(plot*1.2),int(plot*1.2)+1):
  x=n*.38
  if abs(x)>1.88 or yy>0:
   if abs(x)<plot/2-.25:box(x,yy,.84,.048,.048,.88,5)

mesh=bpy.data.meshes.new(f'SM_Account_{which:02d}_Mesh');mesh.from_pydata(v,[],f);mesh.update()
for x in M:mesh.materials.append(x)
for face,index in zip(mesh.polygons,mi):face.material_index=index
obj=bpy.data.objects.new(f'SM_Account_Building_{which:02d}',mesh);scene.collection.objects.link(obj)
obj['account_slot']=which
obj['design_height_m']=H

camd=bpy.data.cameras.new(f'CAM_Account_{which:02d}_Hero');cam=bpy.data.objects.new(camd.name,camd);scene.collection.objects.link(cam)
cam.location=(19,-23,H*.75+8)
cam.rotation_euler=(Vector((0,0,H*.49))-cam.location).to_track_quat('-Z','Y').to_euler()
camd.type='ORTHO';camd.ortho_scale=max(plot*1.55,H*1.27)
scene.camera=cam
def area(name,loc,energy,color,size):
 d=bpy.data.lights.new(name,'AREA');d.energy=energy;d.color=color;d.shape='DISK';d.size=size
 o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=loc
 o.rotation_euler=(Vector((0,0,H*.46))-o.location).to_track_quat('-Z','Y').to_euler()
area('LGT_CoolKey',(-10,-12,H*.85),1700,(.57,.63,1),12)
area('LGT_Rim',(9,8,H*.75),1000,(.38,.52,.90),11)
area('LGT_Warm',(0,-9,7),360,(1,.68,.35),8)
world=bpy.data.worlds.new('World_Night');world.use_nodes=True
bg=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND')
bg.inputs['Color'].default_value=(.008,.010,.026,1);bg.inputs['Strength'].default_value=.32
scene.world=world
scene.render.engine='CYCLES';scene.cycles.samples=32
scene.render.resolution_x=1024;scene.render.resolution_y=1024;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(OUT/f'account_building_{which:02d}_clean.png')
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=.35
bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/f'account_building_{which:02d}.blend'))
logging.disable(logging.INFO)
bpy.ops.export_scene.gltf(filepath=str(OUT/f'account_building_{which:02d}.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True)
logging.disable(logging.NOTSET)
bpy.ops.render.render(write_still=True)
im=bpy.data.images.load(str(OUT/f'account_building_{which:02d}_clean.png'),check_existing=False)
arr=np.empty(1024*1024*4,dtype=np.float32);im.pixels.foreach_get(arr)
small=arr.reshape(512,2,512,2,4).mean(axis=(1,3));pixel=np.repeat(np.repeat(small,2,axis=0),2,axis=1)
out=bpy.data.images.new('PixelRender',width=1024,height=1024,alpha=True);out.pixels.foreach_set(pixel.ravel())
out.filepath_raw=str(OUT/f'account_building_{which:02d}.png');out.file_format='PNG';out.save()
print(f'Account {which:02d}: height {H}, faces {len(mesh.polygons)}, objects {len(scene.objects)}')
