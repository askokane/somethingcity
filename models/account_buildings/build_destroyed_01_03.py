"""Build animated burning ruins for landmarks 01-03 without changing sources.

Run: Blender -b --python build_destroyed_01_03.py
The GLB contains a 2-second, 30-fps AN_Account_XX_BurningLoop clip.
"""

from pathlib import Path
from math import cos, pi, sin
import random
import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parent


def material(name, color, emission=0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = 0.94
    bsdf.inputs["Emission Color"].default_value = (*color, 1)
    bsdf.inputs["Emission Strength"].default_value = emission
    mat.diffuse_color = (*color, 1)
    return mat


def mesh_object(name, vertices, faces, mat, collection):
    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    mesh.materials.append(mat)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return obj


def set_origin(obj, point):
    """Keep animation transforms local to the flame, puff or spark."""
    point = Vector(point)
    for vertex in obj.data.vertices:
        vertex.co -= point
    obj.location = point
    return obj


def add_nla_loop(obj, action_name, track_name):
    action = obj.animation_data.action
    action.name = action_name
    slot = getattr(obj.animation_data, "action_slot", None)
    track = obj.animation_data.nla_tracks.new()
    track.name = track_name
    strip = track.strips.new(action.name, 1, action)
    if slot is not None and hasattr(strip, "action_slot"):
        strip.action_slot = slot
    obj.animation_data.action = None
    strip.repeat = 1
    return action


def animate_flame(obj, number, index, phase, track_name):
    for frame in range(1, 62, 10):
        t = 2*pi*((frame-1)/60 + phase)
        obj.scale = (1 + .14*sin(t), 1 + .10*sin(t+.9), 1 + .22*sin(t+1.7))
        obj.rotation_euler = (.07*sin(t+1.2), .08*sin(t+.5), .11*sin(t))
        obj.keyframe_insert(data_path="scale", frame=frame)
        obj.keyframe_insert(data_path="rotation_euler", frame=frame)
    add_nla_loop(obj, f"AN_Account_{number:02d}_Flame_{index}", track_name)


def animate_rising(obj, number, index, rise, phase, track_name, kind):
    origin = obj.location.copy()
    for frame in range(1, 62, 5):
        cycle = ((frame-1)/60 + phase) % 1
        envelope = max(0, sin(pi*cycle))
        obj.location = (origin.x + .22*sin(2*pi*cycle+index),
                        origin.y + .11*sin(2*pi*cycle+.4*index),
                        origin.z + rise*cycle)
        size = max(.001, envelope)
        obj.scale = (size*(1+.13*cycle), size*(1+.13*cycle), size*(1+.20*cycle))
        obj.keyframe_insert(data_path="location", frame=frame)
        obj.keyframe_insert(data_path="scale", frame=frame)
    # Last key repeats the exact first pose for a seamless 60-frame interval.
    obj.location = origin + Vector((.22*sin(2*pi*phase+index),
                                    .11*sin(2*pi*phase+.4*index),rise*phase))
    size = max(.001, sin(pi*phase))
    obj.scale = (size*(1+.13*phase),)*2 + (size*(1+.20*phase),)
    obj.keyframe_insert(data_path="location", frame=61)
    obj.keyframe_insert(data_path="scale", frame=61)
    add_nla_loop(obj, f"AN_Account_{number:02d}_{kind}_{index}", track_name)


def block(name, location, scale, mat, collection, rotation=(0, 0, 0)):
    x, y, z = location
    a, b, c = (v / 2 for v in scale)
    verts = [(x + sx * a, y + sy * b, z + sz * c)
             for sz in (-1, 1) for sy in (-1, 1) for sx in (-1, 1)]
    faces = [(0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4),
             (1, 3, 7, 5), (3, 2, 6, 7), (2, 0, 4, 6)]
    obj = mesh_object(name, verts, faces, mat, collection)
    if rotation:
        obj.rotation_euler = rotation
        # Rotate around the intended local center, not the world origin.
        pivot = Vector(location)
        verts_local = [Vector(v) - pivot for v in verts]
        for vertex, local in zip(obj.data.vertices, verts_local):
            vertex.co = local
        obj.location = pivot
    return obj


def flame(name, x, y, base, height, width, mat, collection, seed):
    """Crossed jagged cards form a solid readable fire silhouette in GLB."""
    rng = random.Random(seed)
    for axis in (0, 1):
        lean = rng.uniform(-0.26, 0.26) * width
        coords = [(-.52, 0), (-.31, .34), (-.18, .16),
                  (lean, 1.0), (.18, .34), (.33, .57), (.52, 0)]
        verts = []
        for u, v in coords:
            if axis == 0:
                verts.append((x + u * width, y, base + v * height))
            else:
                verts.append((x, y + u * width, base + v * height))
        # A single planar outline exports cleanly; glTF materials are double sided.
        faces = [tuple(range(len(coords)))]
        obj = mesh_object(name + ("_X" if axis == 0 else "_Y"), verts, faces, mat, collection)
        set_origin(obj, (x, y, base))


def plume(name, x, y, base, height, width, mat, collection, seed):
    rng = random.Random(seed)
    for i in range(2):
        cx=x+(.2+i*.22)+rng.uniform(-.12,.12)
        cy=y+.18+rng.uniform(-.12,.12)
        cz=base+i*height*.38
        radius=width*(1.12-i*.22)
        verts=[(cx,cy,cz+radius*.82), (cx,cy,cz-radius*.78),
               (cx-radius,cy,cz), (cx+radius,cy,cz),
               (cx,cy-radius,cz), (cx,cy+radius,cz)]
        faces=[(0,2,4),(0,4,3),(0,3,5),(0,5,2),
               (1,4,2),(1,3,4),(1,5,3),(1,2,5)]
        obj=mesh_object(name+f"_Puff_{i}",verts,faces,mat,collection)
        set_origin(obj,(cx,cy,cz))


def char_scar(name, x, y, z, width, height, mat, collection, seed):
    rng = random.Random(seed)
    verts = [(x-width*.51, y, z-height*.52),
             (x-width*.27, y, z-height*.48),
             (x+width*.06, y, z-height*.43),
             (x+width*.54, y, z-height*.51),
             (x+width*.40, y, z+height*.13),
             (x+width*.20, y, z+height*.46),
             (x-width*.08, y, z+height*.31),
             (x-width*.39, y, z+height*.52)]
    obj = mesh_object(name, verts, [tuple(range(8))], mat, collection)
    return obj


def make(number):
    src = ROOT / f"account_building_{number:02d}.blend"
    stem = f"account_building_{number:02d}_destroyed"
    bpy.ops.wm.open_mainfile(filepath=str(src))
    scene = bpy.context.scene
    scene.name = f"Account Building {number:02d} Destroyed"
    scene.render.fps = 30
    scene.render.fps_base = 1
    scene.frame_start = 1
    scene.frame_end = 61
    rng = random.Random(2710 + number)
    base = bpy.data.objects.get(f"SM_Account_Building_{number:02d}")
    if base is None:
        raise RuntimeError(f"Missing source building in {src}")

    original = bpy.data.collections.new("COL_Original_Ruin_Base")
    scene.collection.children.link(original)
    for coll in tuple(base.users_collection):
        coll.objects.unlink(base)
    original.objects.link(base)
    effects = bpy.data.collections.new("COL_Fire_Damage_Debris")
    scene.collection.children.link(effects)
    base.name = f"SM_Account_Building_{number:02d}_BurnedBase"
    base["variant"] = "destroyed_and_burning"
    base["source_asset"] = src.name

    # The independent copy of the source scene can safely alter its materials.
    stone = bpy.data.materials.get("MAT_Stone")
    if stone:
        bsdf = next(n for n in stone.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        bsdf.inputs["Base Color"].default_value = (.052, .050, .066, 1)
    windows = bpy.data.materials.get("MAT_AmberWindows")
    if windows:
        bsdf = next(n for n in windows.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        bsdf.inputs["Base Color"].default_value = (.23, .055, .018, 1)
        bsdf.inputs["Emission Strength"].default_value = .12

    soot = material("MAT_Ruin_BlackenedStone", (.012, .013, .019))
    ash = material("MAT_Ruin_Ash", (.075, .072, .077))
    broken = material("MAT_Ruin_BrokenMasonry", (.17, .16, .19))
    ember = material("MAT_Ruin_Ember", (.95, .14, .009), 1.5)
    orange = material("MAT_Fire_Orange", (.96, .15, .008), 1.6)
    yellow = material("MAT_Fire_YellowCore", (1.0, .55, .035), 2.2)
    smoke = material("MAT_Smoke_Dark", (.049, .051, .064))

    design = {
        1: {"height": 8.9, "front": -2.48, "roof_y": -.9,
            "fires": [(-2.25, -2.68, 4.45, 2.2), (1.85, -2.68, 2.95, 2.6),
                      (.82, -1.35, 7.0, 2.45), (2.15, 1.0, 7.65, 2.15)],
            "scars": [(-2.12, -2.53, 4.55, 2.05, 2.8), (1.82, -2.53, 3.25, 2.25, 3.45)],
            "roof": (1.3, -.65, 8.62, 2.75, 2.0)},
        2: {"height": 12.9, "front": -2.9, "roof_y": -1.15,
            "fires": [(-2.0, -3.05, 5.1, 2.45), (2.1, -2.19, 8.75, 2.55),
                      (0.75, -1.2, 11.72, 2.3), (-1.3, .15, 12.5, 2.1)],
            "scars": [(-1.9, -2.94, 5.1, 2.2, 3.2), (1.7, -2.2, 8.95, 2.0, 3.1)],
            "roof": (1.25, -.35, 12.85, 2.1, 1.7)},
        3: {"height": 16.8, "front": -2.9, "roof_y": -.9,
            "fires": [(2.2, -3.02, 5.1, 2.5), (-1.3, -2.23, 10.05, 2.45),
                      (1.1, -1.25, 13.85, 2.45), (.2, .80, 16.0, 2.5)],
            "scars": [(2.17, -2.98, 5.0, 2.3, 3.2), (-1.3, -2.25, 10.1, 2.1, 3.3)],
            "roof": (1.12, .6, 16.45, 1.8, 1.45)},
    }[number]

    # Remove loose upper ornaments on one side of the joined mesh, creating
    # recognizable missing detail instead of leaving a pristine roofline.
    mesh = base.data
    remove = []
    for poly in mesh.polygons:
        center = poly.center
        if center.z > design["height"] * .91 and center.x > .45:
            remove.append(poly.index)
        elif center.y < design["front"] + .22:
            for sx, _, sz, sw, sh in design["scars"]:
                if abs(center.x-sx) < sw*.52 and abs(center.z-sz) < sh*.43:
                    remove.append(poly.index)
                    break
    if remove:
        import bmesh
        bm = bmesh.new(); bm.from_mesh(mesh)
        bm.faces.ensure_lookup_table()
        bmesh.ops.delete(bm, geom=[bm.faces[i] for i in remove], context="FACES")
        bm.to_mesh(mesh); bm.free(); mesh.update()

    # Broken roof silhouette, darkened burn scars and large jagged debris.
    rx, ry, rz, rw, rd = design["roof"]
    block(f"SM_Roof_Collapse_{number:02d}", (rx, ry, rz), (rw, rd, .38), soot,
          effects, rotation=(.25, -.23, .14))
    for i in range(4):
        x = rx + rng.uniform(-rw*.48, rw*.48)
        y = ry + rng.uniform(-rd*.48, rd*.48)
        block(f"SM_Roof_Fragment_{number:02d}_{i}",
              (x, y, rz + rng.uniform(.12, .53)),
              (rng.uniform(.38,.75), rng.uniform(.4,.85), rng.uniform(.21,.46)),
              broken, effects, rotation=(rng.uniform(-.55,.55), rng.uniform(-.65,.65), .2))
    for i, (x,y,z,w,h) in enumerate(design["scars"]):
        char_scar(f"SM_Burn_Scar_{number:02d}_{i}", x,y,z,w,h,soot,effects,i+number)
        # A broken, crooked lintel in front of the blackened aperture.
        block(f"SM_Fallen_Lintel_{number:02d}_{i}", (x, y-.16, z+h*.36),
              (w*1.13, .20, .20), broken, effects,
              rotation=(0,0,rng.uniform(-.25,.2)))

    loop_name=f"AN_Account_{number:02d}_BurningLoop"
    for i, (x,y,z,h) in enumerate(design["fires"]):
        flame(f"SM_Flame_{number:02d}_{i}_Outer", x,y,z,h,.90,
              orange,effects,300+number*30+i)
        flame(f"SM_Flame_{number:02d}_{i}_Core", x,y-.08,z+.08,h*.68,.47,
              yellow,effects,400+number*30+i)
        plume(f"SM_Smoke_{number:02d}_{i}", x,y+.28,z+h*.82,h*.72,.33,
              smoke,effects,number*20+i)
        for obj in effects.objects:
            if obj.name.startswith(f"SM_Flame_{number:02d}_{i}_"):
                phase=(i*.13 + (.25 if "Core" in obj.name else 0)) % 1
                animate_flame(obj,number,i*10+len(obj.name),phase,loop_name)
            elif obj.name.startswith(f"SM_Smoke_{number:02d}_{i}_"):
                phase=(i*.13 + (.5 if obj.name.endswith("_1") else 0)) % 1
                animate_rising(obj,number,i*10+(1 if obj.name.endswith("_1") else 0),
                               h*.9,phase,loop_name,"Smoke")
        for j in range(3):
            spark=block(f"SM_Fire_Ember_{number:02d}_{i}_{j}",
                        (x+rng.uniform(-.35,.35),y-.2+rng.uniform(-.18,.18),z+.12),
                        (.11,.11,.14),ember,effects)
            animate_rising(spark,number,i*10+j,1.4+h*.28,
                           (j/3+i*.11)%1,loop_name,"Ember")
    for i in range(24):
        x = rng.choice([-1,1])*rng.uniform(.35,4.35)
        y = rng.choice([-1,1])*rng.uniform(2.35,3.55)
        z = .22 + rng.uniform(.01,.19)
        mat = (soot, ash, broken)[i%3]
        block(f"SM_Rubble_{number:02d}_{i:02d}", (x,y,z),
              (rng.uniform(.22,.63),rng.uniform(.24,.62),rng.uniform(.18,.43)),
              mat,effects,rotation=(rng.uniform(-.45,.45),rng.uniform(-.40,.40),rng.uniform(0,6.28)))
    for i in range(8):
        x=rng.choice((-1,1))*rng.uniform(1.55,3.75)
        y=-3.58+rng.uniform(-.28,.25)
        block(f"SM_Facade_Collapse_{number:02d}_{i}",
              (x,y,.32+rng.uniform(.05,.20)),
              (rng.uniform(.65,1.15),rng.uniform(.35,.7),rng.uniform(.28,.62)),
              broken if i%3 else soot,effects,
              rotation=(rng.uniform(-.35,.35),rng.uniform(-.3,.3),rng.uniform(-.45,.45)))
    for i in range(10):
        x=rng.uniform(-3.65,3.65)
        y=rng.uniform(-3.6,3.3)
        block(f"SM_Ground_Ember_{number:02d}_{i}",
              (x,y,.18),(.10,.13,.035),ember,effects)

    # Fire should read at the existing hero camera distance in the preview.
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 20
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 1024
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = str(ROOT / (stem + '.png'))
    scene.view_settings.exposure = .35
    scene.frame_set(1)
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / (stem + '.blend')))

    bpy.ops.object.select_all(action='DESELECT')
    mesh_objects = [o for o in scene.objects if o.type == 'MESH']
    for obj in mesh_objects: obj.select_set(True)
    bpy.context.view_layer.objects.active = base
    bpy.ops.export_scene.gltf(filepath=str(ROOT / (stem + '.glb')),
                              export_format='GLB', use_selection=True,
                              export_cameras=False, export_lights=False,
                              export_animations=True,
                              export_animation_mode='NLA_TRACKS',
                              export_merge_animation='NLA_TRACK',
                              export_anim_slide_to_zero=True,
                              export_yup=True)
    scene.frame_set(30)
    bpy.ops.render.render(write_still=True)
    print(f"BUILT {stem}: {len(mesh_objects)} mesh objects, {len(remove)} missing roof faces")


if __name__ == '__main__':
    for n in (1, 2, 3):
        make(n)
