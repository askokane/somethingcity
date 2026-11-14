"""Build independent, burning ruin variants of account buildings 07–10.

Run: Blender --background --python build_destroyed_07_10.py
The original .blend, .glb, and .png files are only read, never written.
"""

import math
import random
import sys
from pathlib import Path

import bpy
from mathutils import Vector


OUT = Path(__file__).resolve().parent
HEIGHTS = {7: 33.32, 8: 37.32, 9: 41.32, 10: 45.32}
WIDTHS = {7: 8.0, 8: 9.4, 9: 9.5, 10: 5.5}
DEPTHS = {7: 7.6, 8: 7.7, 9: 8.0, 10: 5.7}
BASES = {7: (12.6, 11.8), 8: (13.0, 11.5), 9: (14.0, 12.0), 10: (9.2, 9.4)}


def mat(name, color, emission=0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = .95
    p.inputs['Emission Color'].default_value = (*color, 1)
    p.inputs['Emission Strength'].default_value = emission
    return m


def mesh_obj(name, verts, faces, materials, mids, col):
    mesh = bpy.data.meshes.new(name + '_Mesh')
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    for m in materials:
        mesh.materials.append(m)
    for poly, mid in zip(mesh.polygons, mids):
        poly.material_index = mid
    obj = bpy.data.objects.new(name, mesh)
    col.objects.link(obj)
    return obj


def box(name, loc, size, material, col, tilt=0):
    a, b, c = (v / 2 for v in size)
    verts = [(dx*a, dy*b, dz*c) for dz in (-1,1)
             for dy in (-1,1) for dx in (-1,1)]
    faces = [(0,2,3,1), (4,5,7,6), (0,1,5,4),
             (1,3,7,5), (3,2,6,7), (2,0,4,6)]
    ob = mesh_obj(name, verts, faces, [material], [0]*6, col)
    ob.location = loc
    ob.rotation_euler[1] = tilt
    return ob


def flame(name, cx, cy, z0, height, radius, colors, col, seed):
    """Faceted, leaning tongues with a bright inner core, all real GLB geometry."""
    rng = random.Random(seed)
    verts = []
    faces = []
    mids = []
    n = 7
    levels = [(0, 1.0), (.18, .9), (.53, .63), (.78, .34), (1, 0)]
    lean_x = rng.uniform(-.20, .20) * height
    lean_y = rng.uniform(-.12, .12) * height
    phase = rng.uniform(0, math.tau)
    for t, width in levels:
        z = height*t
        for i in range(n):
            ang = math.tau*i/n + phase
            r = radius*width*(.83 + .17*math.sin(i*4 + seed))
            verts.append((r*math.cos(ang) + lean_x*t*t,
                          r*math.sin(ang) + lean_y*t*t,
                          z))
    for j in range(len(levels)-1):
        for i in range(n):
            faces.append((j*n+i, j*n+(i+1)%n,
                          (j+1)*n+(i+1)%n, (j+1)*n+i))
            mids.append(0 if j < 2 else (1 if j == 2 else 2))
    obj = mesh_obj(name, verts, faces, colors, mids, col)
    obj.location = (cx,cy,z0)
    return obj


def smoke_puff(name, loc, radius, material, col):
    verts, faces = [], []
    n = 8
    for z, width in ((-.55,.48),(-.2,.95),(.25,1.0),(.58,.42)):
        for i in range(n):
            a = math.tau*i/n
            verts.append((radius*width*math.cos(a),
                          radius*width*math.sin(a),radius*z))
    for j in range(3):
        for i in range(n):
            faces.append((j*n+i,j*n+(i+1)%n,
                          (j+1)*n+(i+1)%n,(j+1)*n+i))
    faces.extend((tuple(reversed(range(n))), tuple(range(3*n,4*n))))
    obj = mesh_obj(name,verts,faces,[material],[0]*len(faces),col)
    obj.location = loc
    return obj


def animated_action(obj, name):
    action = obj.animation_data.action
    action.name = name
    track = obj.animation_data.nla_tracks.new()
    track.name = name.split('_Part')[0]
    strip = track.strips.new(action.name,1,action)
    strip.action_frame_start = 1
    strip.action_frame_end = 61
    obj.animation_data.action = None


def animate_flicker(obj, code, j):
    base = obj.location.copy()
    phase = j*.91
    for frame in (1,6,11,16,21,26,31,36,41,46,51,56,61):
        t = (frame-1)/60
        wave = math.cos(math.tau*t+phase)
        wave2 = math.cos(math.tau*3*t+phase*.63)
        obj.scale = (1+.11*wave,1-.07*wave2,1+.15*wave2)
        obj.location = (base.x+.055*wave,base.y,base.z+.16*wave)
        obj.rotation_euler[2] = .06*wave2
        for prop in ('scale','location','rotation_euler'):
            obj.keyframe_insert(data_path=prop,frame=frame)
    animated_action(obj,f'AN_Account_{code}_FireLoop_Part{j:02d}')


def animate_rise(obj, code, j, start, duration, travel, size):
    base = obj.location.copy()
    end = min(61,start+duration)
    middle = (start+end)//2
    for frame, u in ((1,0),(start,0),(middle,.5),(end,1),(61,0)):
        obj.location = (base.x+u*.25,base.y+u*.12,base.z+travel*u if frame!=61 else base.z)
        s = size*math.sin(math.pi*u)
        obj.scale = (s,s,s)
        obj.keyframe_insert(data_path='location',frame=frame)
        obj.keyframe_insert(data_path='scale',frame=frame)
    animated_action(obj,f'AN_Account_{code}_FireLoop_Part{j:02d}')


def wound(name, cx, cy, z, width, height, mat, col, seed):
    """Jagged soot/cracked opening on the visible front wall."""
    rng = random.Random(seed)
    verts = []
    for i in range(11):
        a = math.tau*i/11
        r = .8 + rng.random()*.35
        verts.append((cx + math.cos(a)*width*.5*r,
                      cy, z + math.sin(a)*height*.5*r))
    return mesh_obj(name, verts, [tuple(range(11))], [mat], [0], col)


def deform_main_mesh(obj, idx, soot, char):
    """Crush the roof/crown and tear away selected facade and roof faces."""
    old = obj.data
    h = HEIGHTS[idx]
    rng = random.Random(8100+idx)
    verts = []
    for v in old.vertices:
        x, y, z = v.co
        if z > h*.77:
            t = min(1, (z-h*.77)/(h*.23))
            # Highest stonework slumps toward the burning front-right corner.
            drop = (.13 + .23*max(0, x/WIDTHS[idx]+.45)) * h * t
            if idx == 8 and x < 0:  # One of the twin spires is shattered.
                drop += h*.22*t
            elif idx == 9 and x > 0:
                drop += h*.10*t
            elif idx == 10:
                drop += h*.10*t
            x += t*t*(.42 + .10*idx)
            y -= t*t*.29
            z -= drop
        verts.append((x,y,z))
    faces, mids = [], []
    for p in old.polygons:
        coords = [old.vertices[k].co for k in p.vertices]
        center = sum(coords, Vector())/len(coords)
        # Knock off roof projections and irregular upper facade pieces.
        in_blast = (center.z > h*.74 and
                    (center.x > -WIDTHS[idx]*.10 or (idx == 8 and center.x < 0)))
        if idx == 10 and h*.60 < center.z < h*.86:
            # The narrow tower loses its upper front and right wall bays.
            # The open void is a much stronger silhouette read than soot alone.
            if center.y < -DEPTHS[idx]*.18 and center.x > -WIDTHS[idx]*.35:
                continue
            if center.x > WIDTHS[idx]*.28 and center.y < DEPTHS[idx]*.28:
                continue
        if in_blast and rng.random() < (.36 if center.z < h*.87 else .57):
            continue
        mid = p.material_index
        if center.z > h*.58 and center.y < DEPTHS[idx]*.30:
            chance = .55 if center.z > h*.76 else .20
            if rng.random() < chance:
                mid = len(old.materials) + (0 if rng.random() < .75 else 1)
        faces.append(tuple(p.vertices))
        mids.append(mid)
    new = bpy.data.meshes.new(old.name + '_Destroyed')
    new.from_pydata(verts, [], faces)
    new.update()
    for m in old.materials: new.materials.append(m)
    new.materials.append(soot)
    new.materials.append(char)
    for p, mid in zip(new.polygons, mids): p.material_index = mid
    obj.data = new
    obj.name = f'SM_Account_Building_{idx:02d}_Destroyed'
    obj['condition'] = 'destroyed_on_fire'
    obj['source_asset'] = f'account_building_{idx:02d}.blend'
    return len(faces)


def build(idx):
    code = f'{idx:02d}'
    bpy.ops.wm.open_mainfile(filepath=str(OUT/f'account_building_{code}.blend'))
    scene = bpy.context.scene
    scene.name = f'Account Building {code} Destroyed'
    h, w, d = HEIGHTS[idx], WIDTHS[idx], DEPTHS[idx]
    basew, based = BASES[idx]
    root = bpy.data.objects[f'SM_Account_Building_{code}']
    col = root.users_collection[0]
    col.name = f'COL_Account_{code}_Destroyed'
    soot = mat('MAT_Destroyed_Soot', (.012,.013,.017))
    char = mat('MAT_Destroyed_Charcoal', (.039,.034,.036))
    ember = mat('MAT_Destroyed_Ember', (.65,.055,.008), 1.5)
    orange = mat('MAT_Fire_Orange', (1,.16,.006), 4.5)
    yellow = mat('MAT_Fire_Yellow', (1,.64,.035), 5.5)
    white = mat('MAT_Fire_Core', (1,.94,.35), 6.2)
    rubble = mat('MAT_Destroyed_Rubble', (.12,.11,.13))
    smoke_dark = mat('MAT_Smoke_Slate', (.13,.14,.16),.08)
    smoke_light = mat('MAT_Smoke_Ash', (.23,.24,.25),.12)
    deform_main_mesh(root, idx, soot, char)

    rng = random.Random(370+idx)
    # Three ragged holes/crawl spaces expose a red glow in the damaged facade.
    for j, zz in enumerate((h*.34, h*.56, h*.73)):
        x = (-.25, .95, -.75)[j] * w*.48
        y = -d/2-.39 if j == 0 else -d*.39-.42
        wound(f'SM_Breach_{code}_{j}', x,y,zz,
              w*(.31 if j == 2 else .23), h*.105,
              soot, col, 810+idx*10+j)
        wound(f'SM_Ember_{code}_{j}', x,y-.02,zz,
              w*.09,h*.045,ember,col,910+idx*10+j)
    # Entirely broken side and front corner, with tilted floor slabs/beams.
    for j in range(5):
        x = w*.27 + rng.uniform(-.5,.5)
        y = -d*.29 + rng.uniform(-.45,.45)
        z = h*(.67 + j*.048)
        box(f'SM_Collapsed_Beam_{code}_{j}', (x,y,z),
            (w*.40,.30,.28), char if j%2 else rubble,
            col, tilt=.18 + j*.13)
    # Large, interlocking flame tongues at rooftop and broken facade.
    locations = [(.22*w,-d*.21,h*.67,h*.20,w*.17),
                 (-.18*w,-d*.14,h*.73,h*.16,w*.14),
                 (.05*w,-d*.30,h*.79,h*.19,w*.17),
                 (.29*w,-d*.45,h*.46,h*.14,w*.105),
                 (-.30*w,-d*.47,h*.38,h*.11,w*.09)]
    if idx == 8:
        locations.append((-.28*w,0,h*.69,h*.23,w*.14))
    if idx == 10:
        locations.append((.16*w,-d*.43,h*.62,h*.18,w*.20))
    moving = []
    for j, (x,y,z,fh,rad) in enumerate(locations):
        moving.append(flame(f'SM_Fire_{code}_{j}_Outer',x,y,z,fh,rad,
                            [ember,orange,yellow],col,idx*100+j))
        moving.append(flame(f'SM_Fire_{code}_{j}_Core',x,y-.04,z+.08,fh*.71,rad*.46,
                            [orange,yellow,white],col,idx*200+j))
    # Layered charcoal and ash puffs keep smoke visible against the dark sky.
    for j in range(2):
        ob = smoke_puff(f'SM_Smoke_{code}_Base_{j}',
                        ((j-.5)*w*.26,d*.10,h*.81+j*.35),
                        w*.24,smoke_dark if j else smoke_light,col)
        moving.append(ob)
    rising = []
    for j in range(8):
        ob = smoke_puff(f'SM_Smoke_{code}_Rising_{j}',
                        (((j%2)-.5)*w*.22,d*.08,h*.83),
                        w*(.22 if j%2 else .27),
                        smoke_light if j%3==0 else smoke_dark,col)
        rising.append((ob,1+j*7,19,h*.19,1.0))
    for j in range(10):
        x = rng.uniform(-w*.30,w*.35)
        y = rng.uniform(-d*.34,-d*.03)
        ob = box(f'SM_Ember_{code}_{j}',(x,y,h*.75),
                 (.15,.15,.20),white if j%3==0 else orange,col,
                 tilt=rng.uniform(-.3,.3))
        rising.append((ob,1+j*5,13,h*.16,1.0))
    # Debris is on the original plinth; the world origin and plot size remain stable.
    for j in range(22):
        x = rng.uniform(-basew*.43,basew*.43)
        y = rng.uniform(-based*.44,-d*.48) if j < 16 else rng.uniform(-based*.40,based*.38)
        sx = rng.uniform(.24,.68)
        sy = rng.uniform(.22,.62)
        sz = rng.uniform(.17,.66)
        box(f'SM_Rubble_{code}_{j}',(x,y,.17+sz*.5),(sx,sy,sz),
            char if j%3 else rubble,col, tilt=rng.uniform(-.4,.4))
    # Ember and soot shafts tie the fire to the collapsed crown.
    for j in range(5):
        x = rng.uniform(-w*.27,w*.34)
        y = rng.uniform(-d*.28,d*.12)
        z = h*(.81+j*.035)
        box(f'SM_Crown_Ruin_{code}_{j}',(x,y,z),
            (rng.uniform(.35,.75),rng.uniform(.3,.8),rng.uniform(.55,1.2)),
            char,col,tilt=rng.uniform(-.65,.65))
    scene.render.fps = 30
    scene.frame_start = 1
    scene.frame_end = 61
    for j, ob in enumerate(moving):
        animate_flicker(ob,code,j)
    for j, (ob,start,duration,travel,size) in enumerate(rising,len(moving)):
        animate_rise(ob,code,j,start,duration,travel,size)
    scene.frame_set(1)
    bpy.context.view_layer.update()
    # Original hero camera is retained for exact framing comparison.
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 24
    scene.render.resolution_x = 768
    scene.render.resolution_y = 768
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = str(OUT/f'account_building_{code}_destroyed.png')
    scene.view_settings.exposure = -.05
    blend = OUT/f'account_building_{code}_destroyed.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    bpy.ops.object.select_all(action='DESELECT')
    assets = [o for o in col.objects if o.type == 'MESH']
    for o in assets: o.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(filepath=str(OUT/f'account_building_{code}_destroyed.glb'),
                              export_format='GLB', use_selection=True,
                              use_active_scene=True, export_yup=True,
                              export_animations=True,
                              export_animation_mode='NLA_TRACKS',
                              export_frame_range=True,
                              export_anim_slide_to_zero=True,
                              export_force_sampling=True)
    bpy.ops.render.render(write_still=True)
    print('BUILT',code,'objects',len(assets),'tris',sum(len(p.vertices)-2 for o in assets for p in o.data.polygons))


requested = [int(a) for a in sys.argv[sys.argv.index('--')+1:]] if '--' in sys.argv else []
for number in (requested or (7,8,9,10)):
    build(number)
