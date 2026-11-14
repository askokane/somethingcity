"""Build 8-bit ruined variants of account buildings 04–06, with small fire loops.

Run: Blender --background --python build_destroyed_04_06.py -- 4
Repeat with 5 or 6. Intact files are never opened or changed.
"""
import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

OUT=Path(__file__).resolve().parent
slot=int(sys.argv[sys.argv.index('--')+1]) if '--' in sys.argv else 4
assert slot in (4,5,6)
stem=f'account_building_{slot:02d}_destroyed'
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
scene.name=f'Account Building {slot:02d} Destroyed 8-bit'
scene.unit_settings.system='METRIC'
scene.render.fps=30

def material(name,rgb,emission=0):
    m=bpy.data.materials.new(name)
    m.diffuse_color=(*rgb,1)
    m.use_nodes=True
    s=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    s.inputs['Base Color'].default_value=(*rgb,1)
    s.inputs['Roughness'].default_value=1
    if emission:
        s.inputs['Emission Color'].default_value=(*rgb,1)
        s.inputs['Emission Strength'].default_value=emission
    return m

# The same limited palette as building 10. Fire is the only saturated accent.
M=[material(f'MAT_{slot:02d}_Stone',(.145,.151,.215)),
   material(f'MAT_{slot:02d}_Shadow',(.025,.032,.055)),
   material(f'MAT_{slot:02d}_Trim',(.31,.30,.37)),
   material(f'MAT_{slot:02d}_Char',(.07,.065,.08)),
   material(f'MAT_{slot:02d}_Rubble',(.23,.21,.25)),
   material(f'MAT_{slot:02d}_WindowDark',(.018,.025,.042)),
   material(f'MAT_{slot:02d}_WindowAmber',(.78,.33,.055),.6),
   material(f'MAT_{slot:02d}_InnerGlow',(.42,.105,.025),1.0),
   material(f'MAT_{slot:02d}_Iron',(.028,.034,.052)),
   material(f'MAT_{slot:02d}_FireOrange',(.95,.22,.025),2.2),
   material(f'MAT_{slot:02d}_FireYellow',(1,.67,.06),2.6),
   material(f'MAT_{slot:02d}_FireCore',(1,.91,.33),2.8)]

class MeshBuilder:
    def __init__(self):self.v=[];self.f=[];self.mi=[]
    def face(self,p,mid):
        n=len(self.v);self.v.extend(p)
        self.f.append(tuple(range(n,len(self.v))))
        self.mi.append(mid)
    def box(self,x,y,z,w,d,h,mid):
        a,b,c=w/2,d/2,h/2
        v=[(x-a,y-b,z-c),(x+a,y-b,z-c),(x+a,y+b,z-c),(x-a,y+b,z-c),
           (x-a,y-b,z+c),(x+a,y-b,z+c),(x+a,y+b,z+c),(x-a,y+b,z+c)]
        for q in ((0,3,2,1),(4,5,6,7),(0,1,5,4),
                  (1,2,6,5),(2,3,7,6),(3,0,4,7)):
            self.face([v[i] for i in q],mid)
    def object(self,name,col):
        mesh=bpy.data.meshes.new(name+'_Mesh')
        mesh.from_pydata(self.v,[],self.f);mesh.update()
        for mat in M:mesh.materials.append(mat)
        for poly,mid in zip(mesh.polygons,self.mi):poly.material_index=mid
        obj=bpy.data.objects.new(name,mesh);col.objects.link(obj)
        return obj

geo=bpy.data.collections.new(f'COL_Account_{slot:02d}_Destroyed_Geometry')
scene.collection.children.link(geo)
static=MeshBuilder()
plot,W,D,H={4:(13.2,10.6,8.2,21.06),
            5:(11.4,8.8,8.0,24.99),
            6:(10.8,7.4,7.4,28.96)}[slot]

# Unchanged tile footprint and front-facing entrance language.
static.box(0,0,-.18,plot,plot,.36,1)
static.box(0,0,.04,plot-.20,plot-.20,.08,2)
front=-D/2
static.box(0,front-.14,1.43,2.16,.23,2.7,1)
static.box(0,front-.30,1.43,1.47,.07,2.18,8)
static.box(0,front-.35,1.47,1.20,.04,1.92,6)
static.box(0,front-.38,1.45,.08,.06,1.94,1)
static.box(0,front-.42,2.93,2.50,.24,.20,2)
for i in range(4):
    static.box(0,front-.48-i*.26,.15+i*.10,3.10-i*.17,.27,.15,2)
if slot in (5,6):
    # The intact 05/06 stair noses project 0.38 m beyond their square tiles.
    static.box(0,-plot/2-.23,.16,2.40,.30,.16,2)
for side in (-1,1):
    static.box(side*(plot/2-.52),-plot/2+.54,.70,.32,.32,1.23,2)
    static.box(side*(plot/2-.52),-plot/2+.54,1.40,.38,.38,.14,8)
    static.box(side*(plot/2-.52),-plot/2+.54,1.64,.30,.30,.38,6)
    for yy in (-plot/2+.35,0,plot/2-.35):
        static.box(side*(plot/2-.23),yy,.74,.14,.14,1.38,8)
        static.box(side*(plot/2-.23),yy,1.49,.29,.29,.12,2)
    static.box(side*(plot/2-.23),0,1.05,.07,plot-.9,.08,8)

def tier(z0,pitch,floors,w,d,cols,sidecols,ox,oy,missing,side_missing,broken_roof):
    """Hollow modular shell with absent wall bays and broken floor edges."""
    left=ox-w/2;right=ox+w/2;front=oy-d/2
    cell=w/cols;sidecell=d/sidecols
    static.box(ox,oy+d/2-.16,z0+pitch*floors/2,w,.32,pitch*floors,1)
    static.box(left+.16,oy,z0+pitch*floors/2,.32,d,pitch*floors,1)
    for f in range(floors):
        base=z0+f*pitch;middle=base+pitch*.52
        for c in range(cols):
            x=left+cell*(c+.5);gone=missing(f,c)
            if not (gone and (f+c)%3==0):
                static.box(x,oy,base+.08,cell,d,.16,3 if gone else 2)
            if gone:
                static.box(x,oy+.45,middle,cell*.88,.12,pitch*.72,
                           7 if (f+c)%3==0 else 1)
                if c==0 or not missing(f,c-1):
                    static.box(x-cell*.43,front+.04,middle,.16,.36,pitch*.82,3)
                static.box(x,front+.03,base+.16,cell*.76,.43,.16,3)
                continue
            edge=(c>0 and missing(f,c-1)) or \
                 (c<cols-1 and missing(f,c+1)) or \
                 (f>0 and missing(f-1,c))
            static.box(x,front+.16,middle,cell,.32,pitch*.83,3 if edge else 0)
            if f%2==0 or c%2==0:
                lit=(f*7+c*3+slot)%6==0
                static.box(x,front-.015,middle+.04,cell*.34,.06,pitch*.31,
                           6 if lit else 5)
                static.box(x,front-.06,middle+.04,.04,.08,pitch*.33,8)
                static.box(x,front-.06,middle-pitch*.17,cell*.43,.12,.08,2)
            if c in (0,cols-1):
                static.box(x+(-1 if c==0 else 1)*cell*.42,
                           front-.025,middle,.12,.20,pitch*.83,2)
        for b in range(sidecols):
            y=front+sidecell*(b+.5);gone=side_missing(f,b)
            if gone:
                static.box(right-.52,y,middle,.10,sidecell*.83,pitch*.70,1)
                static.box(right-.18,y,base+.18,.50,sidecell*.80,.15,3)
                continue
            static.box(right-.16,y,middle,.32,sidecell,pitch*.83,
                       3 if side_missing(f,max(0,b-1)) else 0)
            if f%2==0 or b%2==0:
                lit=(f*3+b*7+slot)%6==0
                static.box(right+.025,y,middle+.04,.06,sidecell*.30,pitch*.29,
                           6 if lit else 5)
                static.box(right+.065,y,middle-pitch*.17,.09,sidecell*.40,.08,2)
    roof_z=z0+pitch*floors+.10
    if broken_roof:
        static.box(ox-w*.25,oy,roof_z,w*.50+.13,d+.25,.20,2)
        static.box(ox+w*.25,oy+d*.25,roof_z,w*.50+.13,d*.50+.12,.20,3)
    else:static.box(ox,oy,roof_z,w+.25,d+.25,.20,2)
    for c in range(cols):
        if not missing(floors-1,c):
            x=left+cell*(c+.5)
            static.box(x,front-.08,roof_z,cell*.94,.16,.18,2)

if slot==4:
    # Broad hall, paired raised wings, central lantern.
    low=lambda f,c:(f in (3,4) and c in (5,6)) or \
        (f==5 and c in (5,6,7))
    tier(.30,1.97,6,10.6,8.2,8,6,0,0,low,
         lambda f,b:f>=4 and b in (0,1),True)
    for side in (-1,1):
        x=side*4.05
        static.box(x,0,13.23,2.28,5.30,2.25,0 if side<0 else 3)
        static.box(x,0,14.43,2.53,5.56,.18,2 if side<0 else 3)
        if side>0:static.box(x+.70,-2.62,14.00,.30,.35,.90,4)
    high=lambda f,c:(f==1 and c==3) or (f==2 and c in (2,3))
    tier(12.15,1.99,3,4.70,5.55,4,3,0,.60,high,
         lambda f,b:f==2 and b==0,True)
    static.box(-.48,.52,19.05,1.20,1.48,1.38,0)
    static.box(-.48,.52,19.82,1.38,1.64,.18,2)
    static.box(-.48,.52,20.38,.44,.46,.93,1)
    static.box(-.48,.52,20.93,.14,.14,.16,2)
    fire_points=[(2.65,-4.10,8.70,1.34),(1.12,-1.40,16.05,1.36)]
    debris=[(2.55,-4.0,.36),(3.28,-3.35,.42),(4.65,-2.60,.30)]
elif slot==5:
    # Twin crown; right tower has a ruptured upper wall.
    low=lambda f,c:(f==3 and c in (5,6)) or \
        (f in (4,5) and c in (5,6,7)) or (f==6 and c in (6,7))
    tier(.30,2.12,7,8.8,8.0,8,6,0,0,low,
         lambda f,b:f>=5 and b in (0,1),True)
    tier(15.17,2.10,4,3.5,5.2,3,3,-2.05,.25,
         lambda f,c:f==3 and c==2,lambda f,b:False,False)
    high=lambda f,c:(f==1 and c==2) or (f in (2,3) and c in (1,2))
    tier(15.17,2.10,4,3.5,5.2,3,3,2.05,.25,high,
         lambda f,b:f>=2 and b==0,True)
    static.box(-2.05,.25,24.20,1.15,1.30,.34,0)
    static.box(-2.05,.25,24.50,.58,.68,.26,2)
    fire_points=[(2.30,-3.30,11.00,1.40),(2.50,-1.45,20.85,1.48)]
    debris=[(2.65,-3.85,.37),(3.25,-3.10,.44),(3.80,-2.40,.32)]
else:
    # Narrow needle; lower left facade and upper shoulder are breached.
    low=lambda f,c:(f in (4,5) and c in (0,1)) or \
        (f in (6,7) and c in (0,1,2)) or (f==8 and c in (1,2))
    tier(.30,1.98,9,7.4,7.4,7,5,0,0,low,
         lambda f,b:f in (6,7,8) and b==0,True)
    high=lambda f,c:(f==1 and c==0) or (f==2 and c in (0,1))
    tier(18.17,2.02,3,4.5,5.4,4,3,0,.40,high,
         lambda f,b:False,True)
    tier(24.23,1.01,2,2.65,3.25,3,2,0,.55,
         lambda f,c:f==1 and c==0,lambda f,b:False,True)
    for z,w in ((26.55,.74),(27.09,.56),(27.60,.38),
                (28.08,.22),(28.62,.11)):
        static.box(.20,.55,z,w,w, .55,1)
    fire_points=[(-1.60,-2.65,12.45,1.34),(-.48,-1.95,22.18,1.30)]
    debris=[(-2.55,-3.55,.36),(-1.95,-3.10,.43),(-3.05,-2.20,.31)]

# Fragmented stone stays within the tile.
for i,(x,y,z) in enumerate(debris):
    static.box(x,y,z,.44+i*.12,.42,.29+i*.07,4)
    static.box(x-.20,y,z+.46,.14,.22,.65,3)
building=static.object(f'SM_Account_Building_{slot:02d}_Destroyed',geo)
building['account_slot']=slot
building['height_m']=H
building['condition']='8bit_ruin_small_fire'
building['source_asset']=f'account_building_{slot:02d}.blend'

def fire(name,center,height):
    flame=MeshBuilder()
    for x,y,scale in ((-.30,.03,.83),(0,-.08,1),(.30,.04,.69)):
        cx,cy,cz=center;h=height*scale
        flame.box(cx+x,cy+y,cz+h*.23,.44,.38,h*.46,9)
        flame.box(cx+x,cy+y,cz+h*.56,.31,.28,h*.35,10)
        flame.box(cx+x,cy+y,cz+h*.83,.15,.16,h*.22,11)
    return flame.object(name,geo)

flames=[fire(f'FX_Account_{slot:02d}_Fire_{i+1}',p[:3],p[3])
        for i,p in enumerate(fire_points)]
for i,obj in enumerate(flames):
    for frame in (1,11,21,31,41,51,61):
        phase=math.tau*(frame-1)/60
        flicker=math.sin(phase+i*1.4)
        obj.scale=(1+.10*flicker,1-.05*flicker,1+.12*flicker)
        obj.location=(.05*flicker,0,.12*flicker)
        obj.keyframe_insert(data_path='scale',frame=frame)
        obj.keyframe_insert(data_path='location',frame=frame)
    action=obj.animation_data.action
    action.name=f'AN_Account_{slot:02d}_SmallFireLoop_Part{i+1}'
    action.use_fake_user=True
    track=obj.animation_data.nla_tracks.new()
    track.name=f'AN_Account_{slot:02d}_SmallFireLoop'
    strip=track.strips.new(action.name,1,action)
    strip.action_frame_start=1;strip.action_frame_end=61
    obj.animation_data.action=None

cam_data=bpy.data.cameras.new(f'CAM_Account_{slot:02d}_Destroyed_8bit')
cam=bpy.data.objects.new(cam_data.name,cam_data)
scene.collection.objects.link(cam)
cam.location=(W*2.65,-D*4.30,H*.69)
target=Vector((0,0,H*.49))
cam.rotation_euler=(target-Vector(cam.location)).to_track_quat('-Z','Y').to_euler()
cam_data.type='ORTHO';cam_data.ortho_scale=max(plot*1.83,H*1.06)*(1.15 if slot==5 else 1)
scene.camera=cam

def area(name,location,energy,color,size):
    data=bpy.data.lights.new(name,'AREA')
    obj=bpy.data.objects.new(name,data)
    scene.collection.objects.link(obj)
    obj.location=location
    obj.rotation_euler=(Vector((0,0,H*.48))-obj.location).to_track_quat('-Z','Y').to_euler()
    data.energy=energy;data.color=color;data.shape='DISK';data.size=size

area('LGT_Moon',(-W*2,-D*3,H*.82),2600,(.64,.75,1),17)
area('LGT_Rim',(W*2,D*2,H*.75),1800,(.47,.55,.90),15)
area('LGT_Fire',(-3,-D*1.3,H*.45),610,(1,.46,.19),7)
world=bpy.data.worlds.new(f'World_Account_{slot:02d}_8bit')
scene.world=world;world.use_nodes=True
bg=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND')
bg.inputs['Color'].default_value=(.008,.011,.024,1)
bg.inputs['Strength'].default_value=.5
scene.render.engine='CYCLES';scene.cycles.samples=48
scene.cycles.use_denoising=False
scene.render.image_settings.file_format='PNG'
scene.render.resolution_x=256;scene.render.resolution_y=256
scene.render.resolution_percentage=100
scene.view_settings.view_transform='Standard'
scene.view_settings.look='Medium High Contrast'
scene.view_settings.exposure=.85
scene.frame_start=1;scene.frame_end=61;scene.frame_set(1)

bpy.ops.object.select_all(action='DESELECT')
building.select_set(True)
for obj in flames:obj.select_set(True)
bpy.context.view_layer.objects.active=building
bpy.ops.export_scene.gltf(
    filepath=str(OUT/(stem+'.glb')),export_format='GLB',
    use_selection=True,use_active_scene=True,export_animations=True,
    export_animation_mode='NLA_TRACKS',export_anim_slide_to_zero=True,
    export_force_sampling=True)
scene.render.filepath=str(OUT/(stem+'.png'))
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/(stem+'.blend')))

work=OUT/'.work';work.mkdir(exist_ok=True)
scene.render.filepath=str(work/(stem+'_256.png'))
bpy.ops.render.render(write_still=True)
src=bpy.data.images.load(scene.render.filepath,check_existing=False)
pixels=np.empty(256*256*4,dtype=np.float32)
src.pixels.foreach_get(pixels)
large=np.repeat(np.repeat(pixels.reshape(256,256,4),4,axis=0),4,axis=1)
image=bpy.data.images.new(stem+'_pixel',width=1024,height=1024,alpha=True)
image.pixels.foreach_set(large.ravel())
image.filepath_raw=str(OUT/(stem+'.png'))
image.file_format='PNG';image.save()
Path(scene.render.filepath).unlink()
print('BUILT',stem,'static faces',len(static.f),'small fire loops',len(flames))
