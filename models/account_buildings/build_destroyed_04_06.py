"""Create independent fire-damaged versions of account buildings 04–06.

Run once per slot:
  Blender -b --python build_destroyed_04_06.py -- 4

The source .blend is only read. Meshes are exported without the preview camera
or lights, and retain the source tile origin and scale.
"""
import math
import random
import sys
from pathlib import Path

import bpy
from mathutils import Vector

OUT = Path(__file__).resolve().parent
slot = int(sys.argv[sys.argv.index("--") + 1]) if "--" in sys.argv else 4
assert slot in (4, 5, 6)
rng = random.Random(9417 + slot)
stem = f"account_building_{slot:02d}"
bpy.ops.wm.open_mainfile(filepath=str(OUT / f"{stem}.blend"))
scene = bpy.context.scene
source = bpy.data.objects[f"SM_Account_Building_{slot:02d}"]

def material(name, rgb, emission=0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.diffuse_color = (*rgb, 1)
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (*rgb, 1)
    bsdf.inputs['Roughness'].default_value = 1.0
    bsdf.inputs['Emission Color'].default_value = (*rgb, 1)
    bsdf.inputs['Emission Strength'].default_value = emission
    return m

char = material('MAT_Destroyed_Charcoal', (.012, .015, .022))
soot = material('MAT_Destroyed_Soot', (.038, .039, .049))
ash = material('MAT_Destroyed_Ash', (.16, .145, .145))
brick = material('MAT_Destroyed_BrokenStone', (.19, .125, .125))
ember = material('MAT_Destroyed_Ember', (.72, .055, .008), 1.0)
red = material('MAT_Destroyed_FlameRed', (.82, .045, .008), .8)
orange = material('MAT_Destroyed_FlameOrange', (1.0, .19, .008), 1.2)
gold = material('MAT_Destroyed_FlameGold', (1.0, .55, .025), 1.4)
smoke = material('MAT_Destroyed_Smoke', (.052, .054, .066))

# Each building has a different damaged corner/crown. Delete original faces in
# these regions from a new mesh, so the opening belongs to the variant itself.
damage = {
    4: dict(top_x=1.05, top_z=17.3, front_x=1.7, front_z=9.8,
            upper=(2.0, .6, 18.2), lower=(3.0, -4.45, 9.8),
            front=-4.27, roof=18.55, w=10.6, d=8.2, h=21.0),
    5: dict(top_x=.35, top_z=19.8, front_x=1.65, front_z=11.2,
            upper=(2.2, .2, 22.4), lower=(2.65, -4.32, 12.0),
            front=-4.18, roof=21.15, w=8.8, d=8.0, h=25.0),
    6: dict(top_x=-1.35, top_z=22.2, front_x=-1.55, front_z=13.0,
            upper=(.9, -1.45, 24.5), lower=(-2.05, -4.00, 14.2),
            front=-3.91, roof=24.45, w=7.4, d=7.4, h=29.0),
}[slot]

original = source.data
new_faces, indices = [], []
for face in original.polygons:
    verts = [original.vertices[i].co for i in face.vertices]
    c = sum(verts, Vector()) / len(verts)
    is_top_break = ((c.x > damage['top_x']) if slot != 6 else (c.x < damage['top_x'])) and c.z > damage['top_z']
    is_front_gash = ((c.x > damage['front_x']) if slot != 6 else (c.x < damage['front_x'])) and c.z > damage['front_z'] and c.y < -3.7 and c.z < damage['top_z']
    if is_top_break or is_front_gash:
        continue
    new_faces.append(tuple(face.vertices))
    indices.append(face.material_index)
mesh = bpy.data.meshes.new(f'SM_Account_{slot:02d}_Destroyed_Mesh')
mesh.from_pydata([tuple(v.co) for v in original.vertices], [], new_faces)
mesh.update()
for m in original.materials:
    mesh.materials.append(m.copy())
for face, index in zip(mesh.polygons, indices):
    face.material_index = index
source.data = mesh
source.name = f'SM_Account_Building_{slot:02d}_Destroyed'
source['variant'] = 'destroyed_on_fire'
source['source_asset'] = f'{stem}.blend'

col = bpy.data.collections.new(f'COL_Account_{slot:02d}_Destroyed')
scene.collection.children.link(col)
def link_mesh(name, verts, faces, mat):
    me = bpy.data.meshes.new(name + '_Mesh')
    me.from_pydata(verts, [], faces)
    me.update()
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    col.objects.link(ob)
    return ob

def box(name, loc, dims, mat, rotation=0):
    x, y, z = loc
    sx, sy, sz = dims
    a, b, c = sx/2, sy/2, sz/2
    verts = [(-a,-b,-c),(a,-b,-c),(a,b,-c),(-a,b,-c),
             (-a,-b,c),(a,-b,c),(a,b,c),(-a,b,c)]
    faces = [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
    ob = link_mesh(name, verts, faces, mat)
    ob.location = loc
    ob.rotation_euler[1] = rotation
    return ob

def jagged_patch(name, x, y, z, width, height, mat):
    # Irregular silhouetted patch on the front facade; not a flat rectangle.
    points = [(-.51,-.42),(-.20,-.59),(.01,-.45),(.34,-.57),(.52,-.23),
              (.36,.03),(.56,.35),(.17,.60),(-.07,.39),(-.36,.57),(-.55,.12)]
    v = [(x+a*width,y,z+b*height) for a,b in points]
    return link_mesh(name, v, [tuple(range(len(v)))], mat)

def fire_tongue(name, x, y, base_z, width, height, mat, bend):
    # Faceted 3D blade with a changing cross-section and a tilted sharp tip.
    ring = [(math.cos(i*math.tau/5), math.sin(i*math.tau/5)) for i in range(5)]
    bottom = [(a*width*.52, b*width*.52, 0) for a,b in ring]
    middle = [(a*width*.33+bend*.42, b*width*.33, height*.51) for a,b in ring]
    tip = (bend, width*.12, height)
    v = bottom + middle + [tip]
    f = [(i,(i+1)%5,(i+1)%5+5,i+5) for i in range(5)]
    f += [(i+5,(i+1)%5+5,10) for i in range(5)]
    f.append(tuple(reversed(range(5))))
    ob=link_mesh(name, v, f, mat)
    ob.location=(x,y,base_z)
    return ob

def flame_cluster(tag, x, y, z, scale):
    # Black fire bed plus layered bright tongues, readable from the hero camera.
    box(f'SM_{tag}_BurnBed', (x,y,z+.09*scale), (2.3*scale,1.8*scale,.25*scale), char)
    for i in range(8):
        ang = i*2.399 + slot*.32
        rr = (.14 + .48*rng.random())*scale
        fx = x + math.cos(ang)*rr
        fy = y + math.sin(ang)*rr
        fh = (1.45 + rng.random()*1.18)*scale
        fw = (.35 + rng.random()*.28)*scale
        fire_tongue(f'SM_{tag}_Flame_{i:02d}', fx,fy,z,fw,fh,
                    [red,orange,gold][i%3], (.12 if i%2 else -.14)*scale)
    for i in range(3):
        fx=x+(.28-i*.26)*scale
        fy=y+.18*scale
        fire_tongue(f'SM_{tag}_Inner_{i}',fx,fy,z+.20*scale,.25*scale,
                    (1.22+i*.29)*scale,gold,.08*scale)
    # Sparse dark, blocky smoke; mesh only, so it survives GLB export.
    for i in range(3):
        zz=z+(2.0+i*.55)*scale
        xx=x+(.18+i*.23)*scale
        box(f'SM_{tag}_Smoke_{i}',(xx,y+.1*scale,zz),
            ((.66+i*.21)*scale,.48*scale,.48*scale),smoke,rotation=.17*i)
    for i in range(6):
        ex=x+(rng.random()-.5)*1.15*scale
        ey=y+(rng.random()-.5)*.85*scale
        box(f'SM_{tag}_Ember_{i}',(ex,ey,z+.55*scale),
            (.10*scale,.10*scale,.15*scale),gold)

# Main burn points differ by tower. The secondary fire at the facade reads
# clearly when the roof is seen from above in the project's isometric camera.
ux, uy, uz = damage['upper']
lx, ly, lz = damage['lower']
flame_cluster('Roof',ux,uy,uz,1.25 if slot==4 else 1.30)
flame_cluster('Facade',lx,ly,lz,.68)

# Ragged black scorch fields and glowing slashes identify the collapsed side.
jagged_patch('SM_Front_Scorch',lx,damage['front'],lz+.35,3.45,5.1,char)
jagged_patch('SM_Front_HotCore',lx+.18,damage['front']-.013,lz+.65,1.30,2.45,ember)
upper_front={4:-2.28,5:-2.54,6:-2.47}[slot]
jagged_patch('SM_Crown_Scorch',ux,upper_front,uz-.65,2.55,3.85,char)
box('SM_Collapsed_CrownSlab',(ux+.35,uy-.6,damage['roof']+.25),
    (2.5,1.4,.30),brick,rotation=-.42 if slot!=6 else .47)
for i in range(4):
    box(f'SM_Jagged_Crown_{i}',
        (ux-1.0+i*.56,upper_front-.25,uz+.20+(i%2)*.27),
        (.28,.52,1.1+(i%3)*.52),[soot,brick,ash][i%3],
        rotation=(-.45+i*.25))
for i in range(5):
    dx=(i-2)*.34
    box(f'SM_Exposed_Beam_{i}', (lx+dx,damage['front']-.24,lz+.7+i*.42),
        (.16,.29,2.6), ash, rotation=(-.35+i*.14))

# Scattered masonry around the damaged corner; source plinth remains intact.
for i in range(17):
    side = 1 if slot != 6 else -1
    x = side*(damage['w']*.30 + rng.random()*damage['w']*.25)
    y = -damage['d']*.35 + rng.random()*damage['d']*.72
    z = .35 + rng.random()*.24
    size = (.28+rng.random()*.58, .24+rng.random()*.48, .18+rng.random()*.50)
    box(f'SM_Rubble_{i:02d}',(x,y,z),size,[ash,brick,soot][i%3],
        rotation=(rng.random()-.5)*.80)

# A few clearly fallen crown blocks around the foot of the building.
for i in range(3):
    side = 1 if slot != 6 else -1
    box(f'SM_CrownDebris_{i}',
        (side*(damage['w']*.34+i*.33),-damage['d']*.16+i*.41,.45),
        (.90,.60,.62),[brick,ash,soot][i],rotation=.24+i*.23)

# Transform-only animation is portable in GLB. All animated parts return to
# exactly their frame 1 transform at frame 61, giving a 2 s / 30 fps loop.
scene.frame_start=1
scene.frame_end=61
scene.render.fps=30
scene.render.fps_base=1.0
for ob in col.objects:
    name=ob.name
    if 'Flame_' in name or 'Inner_' in name:
        phase=rng.random()*math.tau
        base_scale=ob.scale.copy()
        base_rot=ob.rotation_euler.copy()
        for fr in range(1,62,5):
            t=(fr-1)/60
            pulse=math.sin(2*math.tau*t+phase)
            sway=math.sin(math.tau*t+phase*.73)
            ob.scale=(base_scale.x*(1+.13*pulse),
                      base_scale.y*(1-.09*pulse),
                      base_scale.z*(1+.21*sway))
            ob.rotation_euler.z=base_rot.z+.10*sway
            ob.keyframe_insert(data_path='scale',frame=fr)
            ob.keyframe_insert(data_path='rotation_euler',frame=fr)
    elif 'Smoke_' in name or 'Ember_' in name:
        is_smoke='Smoke_' in name
        index=int(name.rsplit('_',1)[-1])
        offset=(index*(20 if is_smoke else 10)+ (0 if 'Roof' in name else 7))%60
        base=ob.location.copy()
        scale=ob.scale.copy()
        rise=(1.8 if is_smoke else 2.6)*(1.0 if 'Roof' in name else .68)
        for fr in range(1,62,5):
            phase=((fr-1+offset)%60)/60
            fade=max(.025,min(1.0,phase*5,(1-phase)*5))
            ob.location=(base.x+(.30 if is_smoke else .48)*math.sin(phase*math.tau),
                         base.y+(.12 if is_smoke else .24)*math.sin(phase*math.tau),
                         base.z+rise*phase)
            ob.scale=scale*fade
            ob.keyframe_insert(data_path='location',frame=fr)
            ob.keyframe_insert(data_path='scale',frame=fr)
    if ob.animation_data and ob.animation_data.action:
        action=ob.animation_data.action
        action.name=f'AN_{slot:02d}_{name[3:]}'
        track=ob.animation_data.nla_tracks.new()
        track.name='AN_Burning_Loop'
        strip=track.strips.new('AN_Burning_Loop',1,action)
        strip.frame_end=61
        ob.animation_data.action=None
scene.frame_set(1)

# Keep the original scene lights/camera for a comparable review render.
scene.name=f'Account Building {slot:02d} Destroyed'
scene.render.engine='CYCLES'
scene.cycles.samples=20
scene.render.resolution_x=768
scene.render.resolution_y=768
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.filepath=str(OUT / f'{stem}_destroyed.png')
scene.view_settings.exposure=.30

# Save the editable variant, then export *only* the actual asset meshes.
bpy.context.preferences.filepaths.save_version=0
bpy.ops.object.select_all(action='DESELECT')
asset_objects=[source]+list(col.objects)
for ob in asset_objects:
    ob.select_set(True)
bpy.context.view_layer.objects.active=source
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / f'{stem}_destroyed.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT / f'{stem}_destroyed.glb'),
                          export_format='GLB',use_selection=True,
                          use_active_scene=True,export_yup=True,
                          export_animations=True,export_animation_mode='NLA_TRACKS',
                          export_merge_animation='NLA_TRACK',
                          export_frame_range=True,export_anim_slide_to_zero=True)
bpy.ops.render.render(write_still=True)
print(f'{stem}_destroyed: {len(asset_objects)} meshes, '
      f'{sum(len(o.data.polygons) for o in asset_objects)} faces')
