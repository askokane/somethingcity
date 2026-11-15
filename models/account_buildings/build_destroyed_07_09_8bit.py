"""Build 8-bit burning ruins for account buildings 07, 08 and 09.

Run: Blender --background --python build_destroyed_07_09_8bit.py [-- 07 08 09]
Only the *_destroyed outputs are written. Intact assets are untouched.
"""

import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector


OUT = Path(__file__).resolve().parent
SPECS = {
    7: dict(height=33.0, base=(12.6,11.8), width=8.0, depth=7.6,
            tiers=((4.0,2.10,7,8.0,7.6,6,4),
                   (18.7,2.35,3,6.24,5.93,5,3),
                   (25.75,2.03,2,4.16,4.03,4,2)),
            fires=((-1.10,-3.70,11.9,1.70),(.82,-2.55,23.2,1.95))),
    8: dict(height=37.0, base=(13.0,11.5), width=9.4, depth=7.7,
            tiers=((4.0,2.06,8,9.4,7.7,6,4),
                   (20.48,2.42,3,7.33,6.00,5,3),
                   (27.74,1.79,2,4.89,4.08,4,2)),
            fires=((1.30,-3.65,14.5,1.80),(.95,-2.75,26.2,1.90))),
    9: dict(height=41.0, base=(14.0,12.0), width=9.5, depth=8.0,
            tiers=((4.0,2.02,9,9.5,8.0,6,4),
                   (22.18,2.05,4,7.41,6.24,5,3),
                   (30.38,2.30,2,4.94,4.24,4,2)),
            fires=((-1.20,-3.78,13.4,1.70),(1.12,-2.75,28.7,2.00))),
}


def material(name, rgb, emission=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*rgb, 1)
    mat.use_nodes = True
    shader = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    shader.inputs['Base Color'].default_value = (*rgb, 1)
    shader.inputs['Roughness'].default_value = 1
    if emission:
        shader.inputs['Emission Color'].default_value = (*rgb, 1)
        shader.inputs['Emission Strength'].default_value = emission
    return mat


class MeshBuilder:
    def __init__(self, mats):
        self.mats = mats
        self.verts, self.faces, self.mids = [], [], []

    def face(self, points, mid):
        start = len(self.verts)
        self.verts.extend(points)
        self.faces.append(tuple(range(start,len(self.verts))))
        self.mids.append(mid)

    def box(self, x,y,z,w,d,h,mid):
        a,b,c=w/2,d/2,h/2
        v=[(x-a,y-b,z-c),(x+a,y-b,z-c),(x+a,y+b,z-c),(x-a,y+b,z-c),
           (x-a,y-b,z+c),(x+a,y-b,z+c),(x+a,y+b,z+c),(x-a,y+b,z+c)]
        for q in ((0,3,2,1),(4,5,6,7),(0,1,5,4),
                  (1,2,6,5),(2,3,7,6),(3,0,4,7)):
            self.face([v[i] for i in q],mid)

    def prism(self, x,y,z0,z1,r0,r1,mid,sides=8):
        low=[(x+r0*math.cos(math.tau*i/sides),
              y+r0*math.sin(math.tau*i/sides),z0) for i in range(sides)]
        high=[(x+r1*math.cos(math.tau*i/sides),
               y+r1*math.sin(math.tau*i/sides),z1) for i in range(sides)]
        self.face(tuple(reversed(low)),mid)
        self.face(high,mid)
        for i in range(sides):
            j=(i+1)%sides
            self.face((low[i],low[j],high[j],high[i]),mid)

    def object(self,name,col):
        mesh=bpy.data.meshes.new(name+'_Mesh')
        mesh.from_pydata(self.verts,[],self.faces)
        mesh.update()
        for mat in self.mats: mesh.materials.append(mat)
        for poly,mid in zip(mesh.polygons,self.mids): poly.material_index=mid
        obj=bpy.data.objects.new(name,mesh)
        col.objects.link(obj)
        return obj


def missing(idx,tier,f,c):
    if idx==7:
        return ((tier==0 and ((f in (3,4) and c in (1,2)) or
                              (f in (5,6) and c in (1,2,3)))) or
                (tier==1 and f in (1,2) and c in (2,3)) or
                (tier==2 and c in (2,3)))
    if idx==8:
        return ((tier==0 and ((f in (3,4) and c in (3,4)) or
                              (f in (5,6) and c in (2,3,4)))) or
                (tier==1 and f in (1,2) and c in (2,3,4)) or
                (tier==2 and c in (2,3)))
    return ((tier==0 and ((f in (3,4,5) and c in (1,2,3)) or
                            (f in (6,7) and c in (2,3)))) or
            (tier==1 and f in (1,2,3) and c in (2,3,4)) or
            (tier==2 and c in (2,3)))


def side_missing(idx,tier,f,b):
    return (tier==1 and f>=1 and b==0) or (tier==2 and b==0)


def add_tier(mesh,idx,tier,config):
    z0,pitch,floors,w,d,columns,side_columns=config
    front=-d/2
    right=w/2
    cell=w/columns
    side_cell=d/side_columns
    # Rear and left are continuous; front and right are modular ruined shells.
    mesh.box(0,d/2-.16,z0+pitch*floors/2,w,.32,pitch*floors,1)
    mesh.box(-right+.16,0,z0+pitch*floors/2,.32,d,pitch*floors,1)
    for f in range(floors):
        base=z0+f*pitch
        center=base+pitch*.52
        for c in range(columns):
            x=-right+cell*(c+.5)
            gone=missing(idx,tier,f,c)
            if not (gone and (f+c)%3==0):
                mesh.box(x,0,base+.08,cell,d,.16,3 if gone else 2)
            if gone:
                mesh.box(x,.48,center,cell*.88,.12,pitch*.72,
                         7 if (f+c)%3==0 else 1)
                if c==0 or not missing(idx,tier,f,c-1):
                    mesh.box(x-cell*.44,front+.05,center,
                             .16,.36,pitch*.84,3)
                mesh.box(x,front+.03,base+.16,cell*.78,.45,.16,3)
                continue
            burned=((c>0 and missing(idx,tier,f,c-1)) or
                    (c<columns-1 and missing(idx,tier,f,c+1)) or
                    (f>0 and missing(idx,tier,f-1,c)))
            mesh.box(x,front+.16,center,cell,.32,pitch*.83,
                     3 if burned else 0)
            lit=(f*7+c*3+idx)%6==0
            mesh.box(x,front-.015,center+.04,cell*.34,.06,pitch*.32,
                     6 if lit else 5)
            mesh.box(x,front-.06,center+.04,.045,.08,pitch*.33,8)
            mesh.box(x,front-.06,center-pitch*.17,cell*.43,.12,.08,2)
            if c in (0,columns-1):
                mesh.box(x+(-1 if c==0 else 1)*cell*.42,
                         front-.025,center,.12,.20,pitch*.83,2)
        for b in range(side_columns):
            y=front+side_cell*(b+.5)
            if side_missing(idx,tier,f,b):
                mesh.box(right-.55,y,center,.10,side_cell*.85,pitch*.73,1)
                mesh.box(right-.18,y,base+.18,.50,side_cell*.8,.15,3)
                continue
            mesh.box(right-.16,y,center,.32,side_cell,pitch*.83,
                     3 if side_missing(idx,tier,f,max(0,b-1)) else 0)
            lit=(f*3+b*7+idx)%7==0
            mesh.box(right+.025,y,center+.04,.06,side_cell*.30,pitch*.29,
                     6 if lit else 5)
            mesh.box(right+.065,y,center-pitch*.17,.09,side_cell*.40,.08,2)
    top=z0+pitch*floors
    # Cap is incomplete at the fractured corner; tier steps stay identifiable.
    mesh.box(-w*.25,0,top+.10,w*.5+.14,d+.28,.20,2)
    mesh.box(w*.25,d*.25,top+.10,w*.5+.14,d*.5+.14,.20,3)


def add_crown(mesh,idx,spec):
    h=spec['height']
    if idx==7:
        # Broad stepped ledger crown, with a missing right-hand stair.
        for z,w,d in ((30.35,2.80,2.65),(30.85,2.25,2.15),
                      (31.35,1.62,1.60),(31.85,1.10,1.10)):
            mesh.box(-.38,0,z,w,d,.32,2 if z<31.5 else 3)
        mesh.prism(-.38,0,32.0,33.0,.39,.04,2,4)
        for x,y,z in ((-2.2,-1.65,31.0),(2.0,1.55,30.6)):
            mesh.box(x,y,z,.26,.27,.95,3)
    elif idx==8:
        # Twin Gothic spires: one intact, one visibly snapped and jagged.
        mesh.box(-1.48,.12,32.35,1.10,1.15,2.15,0)
        mesh.box(-1.48,.12,33.50,1.38,1.42,.20,2)
        mesh.prism(-1.48,.12,33.60,37.0,.65,.04,1,8)
        mesh.box(1.55,0,32.02,1.10,1.14,1.50,3)
        mesh.box(1.55,0,32.78,1.32,1.36,.18,4)
        mesh.prism(1.55,0,32.90,34.05,.61,.30,3,5)
        mesh.box(0,.62,31.35,1.10,1.05,.52,1)
    else:
        # Faceted copper-like crown, right front quadrant smashed away.
        mesh.box(-1.0,.50,35.40,2.95,2.70,.40,2)
        mesh.box(.90,1.02,35.40,1.10,1.50,.40,3)
        mesh.prism(-.32,.35,35.60,39.52,1.72,.48,3,10)
        mesh.prism(-.32,.35,39.52,41.0,.48,.02,2,8)
        mesh.box(2.30,-1.55,35.82,.47,.47,.70,4)
        mesh.prism(2.30,-1.55,36.17,37.10,.23,.02,3,6)


def add_fire(mesh,center,height):
    cx,cy,cz=center
    for x,y,scale in ((-.30,.03,.83),(0,-.08,1),(.30,.04,.69)):
        hh=height*scale
        mesh.box(cx+x,cy+y,cz+hh*.23,.44,.38,hh*.46,9)
        mesh.box(cx+x,cy+y,cz+hh*.56,.31,.28,hh*.35,10)
        mesh.box(cx+x,cy+y,cz+hh*.83,.15,.16,hh*.22,11)


def add_area(scene,name,location,energy,color,size,target):
    data=bpy.data.lights.new(name,'AREA')
    ob=bpy.data.objects.new(name,data)
    scene.collection.objects.link(ob)
    ob.location=location
    ob.rotation_euler=(Vector(target)-ob.location).to_track_quat('-Z','Y').to_euler()
    data.energy=energy
    data.color=color
    data.shape='DISK'
    data.size=size


def build(idx):
    spec=SPECS[idx]
    code=f'{idx:02d}'
    stem=f'account_building_{code}_destroyed'
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene=bpy.context.scene
    scene.name=f'Account Building {code} Destroyed 8-bit'
    scene.unit_settings.system='METRIC'
    scene.render.fps=30
    colors=[(.145,.151,.215),(.025,.032,.055),(.31,.30,.37),
            (.07,.065,.08),(.23,.21,.25),(.018,.025,.042),
            (.78,.33,.055),(.42,.105,.025),(.028,.034,.052),
            (.95,.22,.025),(1,.67,.06),(1,.91,.33)]
    mats=[material(f'MAT_{code}_{name}',rgb,
                   {6:.6,7:1.0,9:2.2,10:2.6,11:2.8}.get(i,0))
          for i,(name,rgb) in enumerate(zip(
              ('Stone','Shadow','Trim','Char','Rubble','WindowDark',
               'WindowAmber','InnerGlow','Iron','FireOrange','FireYellow','FireCore'),
              colors))]
    col=bpy.data.collections.new(f'COL_Account_{code}_Destroyed_Geometry')
    scene.collection.children.link(col)
    mesh=MeshBuilder(mats)
    bw,bd=spec['base']
    w,d=spec['width'],spec['depth']
    mesh.box(0,0,-.16,bw,bd,.32,1)
    # Preserve the small front overhang of the intact 08/09 plot exactly.
    front_lip={7:0,8:.13,9:.03}[idx]
    if front_lip:
        mesh.box(0,-bd/2-front_lip/2,-.16,bw,front_lip,.32,1)
    mesh.box(0,0,.04,bw-.2,bd-.2,.08,2)
    mesh.box(0,0,1.90,w,d,3.8,0)
    mesh.box(0,-d/2-.05,1.55,1.65,.16,2.65,1)
    mesh.box(0,-d/2-.18,1.55,1.17,.08,2.15,8)
    mesh.box(0,-d/2-.235,1.58,.95,.04,1.86,6)
    mesh.box(0,-d/2-.28,1.58,.08,.06,1.86,1)
    mesh.box(0,-d/2-.34,3.15,2.10,.18,.20,2)
    for step in range(3):
        mesh.box(0,-d/2-.47-step*.29,.26+step*.13,
                 2.60-step*.16,.29,.16,2)
    for side in (-1,1):
        mesh.box(side*1.68,-d/2-.06,1.45,.22,.20,2.80,2)
        for y in (-bd*.43,-.5,bd*.40):
            mesh.box(side*(bw/2-.35),y,.78,.26,.26,1.44,2)
            mesh.box(side*(bw/2-.35),y,1.54,.38,.38,.13,1)
        mesh.box(side*(bw/2-.35),-.1,1.03,.07,bd-.9,.08,8)
    for tier,config in enumerate(spec['tiers']):
        add_tier(mesh,idx,tier,config)
    add_crown(mesh,idx,spec)
    # Low-count fragments are confined to the original plot and open floors.
    for x,y,z,size in ((-w*.25,-d*.52,.40,.55),
                       (w*.31,-d*.54,.32,.42),
                       (-w*.10,-d*.50,4.2,.38),
                       (w*.28,-d*.34,spec['tiers'][1][0]+.20,.48)):
        mesh.box(x,y,z,size,size,size*.58,4)
    building=mesh.object(f'SM_Account_Building_{code}_Destroyed',col)
    building['account_slot']=idx
    building['height_m']=spec['height']+.32
    building['condition']='8bit_ruin_small_fire'
    building['source_asset']=f'account_building_{code}.blend'
    fires=[]
    for j,(x,y,z,fh) in enumerate(spec['fires']):
        flame=MeshBuilder(mats)
        add_fire(flame,(x,y,z),fh)
        ob=flame.object(f'FX_Account_{code}_Fire_{j+1}',col)
        fires.append(ob)
        for frame in (1,11,21,31,41,51,61):
            phase=math.tau*(frame-1)/60
            flicker=math.sin(phase+j*1.4)
            ob.scale=(1+.10*flicker,1-.05*flicker,1+.12*flicker)
            ob.location=(.05*flicker,0,.12*flicker)
            ob.keyframe_insert(data_path='scale',frame=frame)
            ob.keyframe_insert(data_path='location',frame=frame)
        action=ob.animation_data.action
        action.name=f'AN_Account_{code}_SmallFireLoop_Part{j+1}'
        action.use_fake_user=True
        track=ob.animation_data.nla_tracks.new()
        track.name=f'AN_Account_{code}_SmallFireLoop'
        strip=track.strips.new(action.name,1,action)
        strip.action_frame_start=1
        strip.action_frame_end=61
        ob.animation_data.action=None
    h=spec['height']
    camdata=bpy.data.cameras.new(f'CAM_Account_{code}_Destroyed_8bit')
    cam=bpy.data.objects.new(camdata.name,camdata)
    scene.collection.objects.link(cam)
    cam.location=(h*.62,-h*.80,h*.69)
    target=Vector((0,0,h*.48))
    cam.rotation_euler=(target-Vector(cam.location)).to_track_quat('-Z','Y').to_euler()
    camdata.type='ORTHO'
    camdata.ortho_scale=h*(1.22 if idx in (7,8) else 1.16)
    scene.camera=cam
    add_area(scene,f'LGT_{code}_Moon',(-h*.53,-h*.62,h*.82),h*93,
             (.64,.75,1),h*.53,(0,0,h*.46))
    add_area(scene,f'LGT_{code}_Rim',(h*.44,h*.33,h*.76),h*69,
             (.47,.55,.90),h*.44,(0,0,h*.46))
    add_area(scene,f'LGT_{code}_Fire',(-4,-h*.27,h*.36),h*20,
             (1,.46,.19),h*.22,(0,0,h*.46))
    world=bpy.data.worlds.new(f'World_Account_{code}_8bit')
    scene.world=world
    world.use_nodes=True
    bg=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND')
    bg.inputs['Color'].default_value=(.008,.011,.024,1)
    bg.inputs['Strength'].default_value=.5
    scene.render.engine='CYCLES'
    scene.cycles.samples=48
    scene.cycles.use_denoising=False
    scene.render.image_settings.file_format='PNG'
    scene.render.resolution_x=256
    scene.render.resolution_y=256
    scene.render.resolution_percentage=100
    scene.view_settings.view_transform='Standard'
    scene.view_settings.look='Medium High Contrast'
    scene.view_settings.exposure=.85
    scene.frame_start=1
    scene.frame_end=61
    scene.frame_set(1)
    bpy.ops.object.select_all(action='DESELECT')
    building.select_set(True)
    for ob in fires: ob.select_set(True)
    bpy.context.view_layer.objects.active=building
    bpy.ops.export_scene.gltf(filepath=str(OUT/(stem+'.glb')),
                              export_format='GLB',use_selection=True,
                              use_active_scene=True,export_animations=True,
                              export_animation_mode='NLA_TRACKS',
                              export_anim_slide_to_zero=True,
                              export_force_sampling=True)
    scene.render.filepath=str(OUT/(stem+'.png'))
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/(stem+'.blend')))
    work=OUT/'.work'
    work.mkdir(exist_ok=True)
    scene.render.filepath=str(work/(stem+'_256.png'))
    bpy.ops.render.render(write_still=True)
    src=bpy.data.images.load(scene.render.filepath,check_existing=False)
    pixels=np.empty(256*256*4,dtype=np.float32)
    src.pixels.foreach_get(pixels)
    large=np.repeat(np.repeat(pixels.reshape(256,256,4),4,axis=0),4,axis=1)
    image=bpy.data.images.new(stem+'_pixel',width=1024,height=1024,alpha=True)
    image.pixels.foreach_set(large.ravel())
    image.filepath_raw=str(OUT/(stem+'.png'))
    image.file_format='PNG'
    image.save()
    Path(scene.render.filepath).unlink()
    print('BUILT',stem,'faces',len(mesh.faces),'fire_loops',len(fires))


requested=[int(a) for a in sys.argv[sys.argv.index('--')+1:]] if '--' in sys.argv else []
for number in (requested or (7,8,9)):
    if number in SPECS:
        build(number)
