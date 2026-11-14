"""Rebuild account building 10 as a compact 8-bit ruin with a small fire loop.

Run with Blender --background --python build_account_10_destroyed_8bit.py.
The intact account_building_10 files are never opened or changed.
"""

import math
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector


OUT = Path(__file__).resolve().parent
STEM = "account_building_10_destroyed"
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = "Account Building 10 Destroyed 8-bit"
scene.unit_settings.system = "METRIC"
scene.render.fps = 30


def material(name, rgb, emission=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*rgb, 1)
    mat.use_nodes = True
    shader = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    shader.inputs["Base Color"].default_value = (*rgb, 1)
    shader.inputs["Roughness"].default_value = 1
    if emission:
        shader.inputs["Emission Color"].default_value = (*rgb, 1)
        shader.inputs["Emission Strength"].default_value = emission
    return mat


# Deliberately small, flat palette. Fire is the only saturated accent.
M = [
    material("MAT_10_Stone", (.145, .151, .215)),      # 0
    material("MAT_10_Shadow", (.025, .032, .055)),     # 1
    material("MAT_10_Trim", (.31, .30, .37)),          # 2
    material("MAT_10_Char", (.07, .065, .08)),         # 3
    material("MAT_10_Rubble", (.23, .21, .25)),        # 4
    material("MAT_10_WindowDark", (.018, .025, .042)), # 5
    material("MAT_10_WindowAmber", (.78, .33, .055), .6), # 6
    material("MAT_10_InnerGlow", (.42, .105, .025), 1.0), # 7
    material("MAT_10_Iron", (.028, .034, .052)),       # 8
    material("MAT_10_FireOrange", (.95, .22, .025), 2.2), # 9
    material("MAT_10_FireYellow", (1, .67, .06), 2.6),    # 10
    material("MAT_10_FireCore", (1, .91, .33), 2.8),      # 11
]


class MeshBuilder:
    def __init__(self):
        self.verts = []
        self.faces = []
        self.mids = []

    def face(self, points, mid):
        start = len(self.verts)
        self.verts.extend(points)
        self.faces.append(tuple(range(start, len(self.verts))))
        self.mids.append(mid)

    def box(self, x, y, z, w, d, h, mid):
        a, b, c = w / 2, d / 2, h / 2
        v = [(x-a,y-b,z-c),(x+a,y-b,z-c),(x+a,y+b,z-c),(x-a,y+b,z-c),
             (x-a,y-b,z+c),(x+a,y-b,z+c),(x+a,y+b,z+c),(x-a,y+b,z+c)]
        for q in ((0,3,2,1),(4,5,6,7),(0,1,5,4),
                  (1,2,6,5),(2,3,7,6),(3,0,4,7)):
            self.face([v[i] for i in q], mid)

    def object(self, name, col):
        mesh = bpy.data.meshes.new(name + "_Mesh")
        mesh.from_pydata(self.verts, [], self.faces)
        mesh.update()
        for mat in M:
            mesh.materials.append(mat)
        for poly, mid in zip(mesh.polygons, self.mids):
            poly.material_index = mid
        obj = bpy.data.objects.new(name, mesh)
        col.objects.link(obj)
        return obj


geo = bpy.data.collections.new("COL_Account_10_Destroyed_Geometry")
scene.collection.children.link(geo)
static = MeshBuilder()

# Base, doorway and fenced footprint. Every piece sits on the plinth.
static.box(0, 0, -.16, 9.2, 9.4, .32, 1)
static.box(0, 0, .04, 9.0, 9.2, .08, 2)
static.box(0, -4.77, .045, 9.0, .22, .08, 2)
static.box(0, 0, 1.90, 5.5, 5.7, 3.8, 0)
static.box(0, -2.90, 1.55, 1.65, .16, 2.65, 1)
static.box(0, -3.02, 1.55, 1.17, .08, 2.15, 8)
static.box(0, -3.075, 1.58, .95, .04, 1.86, 6)
static.box(0, -3.12, 1.58, .08, .06, 1.86, 1)
static.box(0, -3.18, 3.15, 2.10, .18, .20, 2)
for step in range(3):
    static.box(0, -3.31-step*.29, .26+step*.13,
               2.60-step*.16, .29, .16, 2)
for side in (-1, 1):
    static.box(side*1.68, -2.91, 1.45, .22, .20, 2.80, 2)
    static.box(side*3.45, -3.45, 1.54, .14, .14, 2.85, 8)
    static.box(side*3.45, -3.45, 3.12, .36, .35, .39, 6)
    static.box(side*3.45, -3.45, 3.38, .40, .39, .13, 8)
    for y in (-4.05, -.5, 3.85):
        static.box(side*4.25, y, .78, .26, .26, 1.44, 2)
        static.box(side*4.25, y, 1.54, .38, .38, .13, 1)
    static.box(side*4.25, -.1, 1.03, .07, 7.7, .08, 8)


def missing_low(floor, column):
    return ((floor == 4 and column in (0, 1)) or
            (floor in (5, 6) and column in (0, 1, 2)) or
            (floor == 7 and column in (1, 2)) or
            (floor == 8 and column == 1))


def wall_tier(z0, pitch, floors, width, depth, columns, side_columns,
              damage, side_damage, tier_name):
    front = -depth / 2
    right = width / 2
    cell = width / columns
    side_cell = depth / side_columns
    # Continuous rear wall anchors the visible damaged shell.
    static.box(0, depth/2-.16, z0+pitch*floors/2,
               width, .32, pitch*floors, 1)
    static.box(-right+.16, 0, z0+pitch*floors/2,
               .32, depth, pitch*floors, 1)
    for floor in range(floors):
        base = z0 + floor*pitch
        middle = base + pitch*.52
        for column in range(columns):
            x = -right + cell*(column+.5)
            absent = damage(floor, column)
            # Exposed floor lips break into stepped pieces at the blast edge.
            if not (absent and (floor+column)%3 == 0):
                static.box(x, 0, base+.08, cell, depth, .16,
                           3 if absent else 2)
            if absent:
                # Warm recess remains behind the real opening, never on its face.
                static.box(x, .48, middle, cell*.88, .12, pitch*.72,
                           7 if floor in (5,6) else 1)
                if column == 0 or not damage(floor, column-1):
                    static.box(x-cell*.44, front+.05, middle,
                               .16, .36, pitch*.84, 3)
                static.box(x, front+.03, base+.16, cell*.78, .45, .16, 3)
                continue
            scorched = (column > 0 and damage(floor, column-1)) or \
                       (column < columns-1 and damage(floor, column+1)) or \
                       (floor > 0 and damage(floor-1, column))
            static.box(x, front+.16, middle, cell, .32, pitch*.83,
                       3 if scorched else 0)
            if floor % 2 == 0 or column % 2 == 0:
                lit = ((floor*7+column*3+len(tier_name)) % 5 == 0)
                static.box(x, front-.015, middle+.04,
                           cell*.34, .06, pitch*.32, 6 if lit else 5)
                static.box(x, front-.06, middle+.04,
                           .045, .08, pitch*.33, 8)
                static.box(x, front-.06, middle-pitch*.17,
                           cell*.43, .12, .08, 2)
            if column in (0, columns-1):
                static.box(x+(-1 if column == 0 else 1)*cell*.42,
                           front-.025, middle, .12, .20, pitch*.83, 2)
        for bay in range(side_columns):
            y = front+side_cell*(bay+.5)
            absent = side_damage(floor, bay)
            if absent:
                static.box(right-.55, y, middle,
                           .10, side_cell*.85, pitch*.73, 1)
                static.box(right-.18, y, base+.18,
                           .50, side_cell*.8, .15, 3)
                continue
            static.box(right-.16, y, middle,
                       .32, side_cell, pitch*.83,
                       3 if side_damage(floor, max(0,bay-1)) else 0)
            if floor % 2 == 0 or bay % 2 == 0:
                lit = ((floor*3+bay*7+1) % 6 == 0)
                static.box(right+.025, y, middle+.04,
                           .06, side_cell*.30, pitch*.29, 6 if lit else 5)
                static.box(right+.065, y, middle-pitch*.17,
                           .09, side_cell*.40, .08, 2)
    if tier_name == "upper":
        # Two connected cap pieces leave the shattered front-right corner open.
        static.box(-width*.25, 0, z0+pitch*floors+.10,
                   width*.5+.14, depth+.28, .20, 2)
        static.box(width*.25, depth*.25, z0+pitch*floors+.10,
                   width*.5+.14, depth*.5+.14, .20, 3)
    else:
        static.box(0, 0, z0+pitch*floors+.10,
                   width+.28, depth+.28, .20, 2)


wall_tier(4.0, 1.95, 11, 5.5, 5.7, 5, 4,
          missing_low, lambda f,b: False, "low")
wall_tier(25.45, 2.20, 3, 4.29, 4.45, 4, 3,
          lambda f,c: (f == 0 and c == 3) or (f in (1,2) and c in (2,3)),
          lambda f,b: f in (1,2) and b == 0, "middle")
wall_tier(32.05, 2.00, 2, 2.86, 3.02, 3, 2,
          lambda f,c: c == 2,
          lambda f,b: b == 0, "upper")

# Charred structural ribs and floor fragments remain connected to the shell.
for z, x, y, w in ((13.9,-1.10,-2.56,1.55),
                   (17.8,-.58,-2.58,1.90),
                   (29.95,.95,-1.90,1.15),
                   (32.05,1.25,-1.84,.75)):
    static.box(x, y, z, w, .36, .21, 4)
    static.box(x-w*.40, y, z+.55, .17, .22, 1.05, 3)
for x, y, z, size in ((-2.35,-3.05,.42,.56),(-1.80,-3.08,.32,.36),
                      (1.75,-3.0,.35,.42),(-.95,-2.9,12.1,.42),
                      (.72,-2.25,26.1,.36)):
    static.box(x,y,z,size,size,size*.56,4)

# The stepped pinnacle survives, with a short broken edge on its right.
static.box(-.75, 0, 36.35, 1.49, 3.10, .25, 2)
static.box(.75, .78, 36.35, 1.49, 1.55, .25, 3)
static.box(0, 0, 37.67, 1.55, 1.72, 2.50, 0)
static.box(0, 0, 39.00, 1.78, 1.92, .20, 2)
static.box(0, 0, 39.62, 1.05, 1.18, 1.05, 0)
static.box(0, 0, 40.20, 1.22, 1.30, .16, 2)
for level, width in ((40.75,.82),(41.35,.68),(41.95,.54),
                     (42.55,.40),(43.15,.28),(43.75,.18),
                     (44.35,.12),(44.95,.08)):
    static.box(0,0,level,width,width, .60, 1)
for side in (-1,1):
    static.box(side*.83,0,37.25,.14,1.50,1.90,2)
    static.box(side*.83,0,38.30,.18,.20,.18,3)

building = static.object("SM_Account_Building_10_Destroyed", geo)
building["account_slot"] = 10
building["height_m"] = 45.32
building["condition"] = "8bit_ruin_small_fire"
building["source_asset"] = "account_building_10.blend"


def fire(name, center, height):
    flame = MeshBuilder()
    # A few attached square tongues: no smoke, particles, or sparks.
    for x, y, scale in ((-.30,.03,.83),(0,-.08,1),(.30,.04,.69)):
        cx, cy, cz = center
        h = height*scale
        flame.box(cx+x,cy+y,cz+h*.23,.44,.38,h*.46,9)
        flame.box(cx+x,cy+y,cz+h*.56,.31,.28,h*.35,10)
        flame.box(cx+x,cy+y,cz+h*.83,.15,.16,h*.22,11)
    return flame.object(name, geo)


fires = [
    fire("FX_Account_10_Fire_Lower", (-1.18,-1.82,11.96), 1.75),
    fire("FX_Account_10_Fire_Upper", (.78,-1.18,27.70), 2.05),
]
for i, obj in enumerate(fires):
    for frame in (1, 11, 21, 31, 41, 51, 61):
        phase = math.tau*(frame-1)/60
        flicker = math.sin(phase+i*1.4)
        obj.scale = (1+.10*flicker,1-.05*flicker,1+.12*flicker)
        obj.location = (.05*flicker,0,.12*flicker)
        obj.keyframe_insert(data_path="scale", frame=frame)
        obj.keyframe_insert(data_path="location", frame=frame)
    action = obj.animation_data.action
    action.name = f"AN_Account_10_SmallFireLoop_Part{i+1}"
    action.use_fake_user = True
    track = obj.animation_data.nla_tracks.new()
    track.name = "AN_Account_10_SmallFireLoop"
    strip = track.strips.new(action.name,1,action)
    strip.action_frame_start = 1
    strip.action_frame_end = 61
    obj.animation_data.action = None


# Preview lighting and camera do not leave the Blender scene during GLB export.
cam_data = bpy.data.cameras.new("CAM_Account_10_Destroyed_8bit")
cam = bpy.data.objects.new(cam_data.name, cam_data)
scene.collection.objects.link(cam)
cam.location = (28,-36,31)
target = Vector((0,0,22))
cam.rotation_euler = (target-Vector(cam.location)).to_track_quat("-Z","Y").to_euler()
cam_data.type = "ORTHO"
cam_data.ortho_scale = 48
scene.camera = cam


def area(name, location, energy, color, size):
    data = bpy.data.lights.new(name,"AREA")
    obj = bpy.data.objects.new(name,data)
    scene.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (Vector((0,0,21))-obj.location).to_track_quat("-Z","Y").to_euler()
    data.energy = energy
    data.color = color
    data.shape = "DISK"
    data.size = size


area("LGT_10_Moon",(-24,-28,37),4200,(.64,.75,1),24)
area("LGT_10_Rim",(20,15,34),3100,(.47,.55,.90),20)
area("LGT_10_Fire",(-4,-12,16),920,(1,.46,.19),10)
world = bpy.data.worlds.new("World_Account_10_8bit")
scene.world = world
world.use_nodes = True
bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
bg.inputs["Color"].default_value = (.008,.011,.024,1)
bg.inputs["Strength"].default_value = .5
scene.render.engine = "CYCLES"
scene.cycles.samples = 48
scene.cycles.use_denoising = False
scene.render.image_settings.file_format = "PNG"
scene.render.resolution_x = 256
scene.render.resolution_y = 256
scene.render.resolution_percentage = 100
scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "Medium High Contrast"
scene.view_settings.exposure = .85
scene.frame_start = 1
scene.frame_end = 61
scene.frame_set(1)

# Export exactly the ruin and two animated fire groups.
bpy.ops.object.select_all(action="DESELECT")
building.select_set(True)
for obj in fires:
    obj.select_set(True)
bpy.context.view_layer.objects.active = building
bpy.ops.export_scene.gltf(
    filepath=str(OUT/(STEM+".glb")),
    export_format="GLB", use_selection=True, use_active_scene=True,
    export_animations=True, export_animation_mode="NLA_TRACKS",
    export_anim_slide_to_zero=True, export_force_sampling=True)

scene.render.filepath = str(OUT/(STEM+".png"))
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/(STEM+".blend")))

# Render at sprite resolution, then enlarge with nearest-neighbor pixels.
work = OUT/".work"
work.mkdir(exist_ok=True)
scene.render.filepath = str(work/(STEM+"_256.png"))
bpy.ops.render.render(write_still=True)
src = bpy.data.images.load(scene.render.filepath,check_existing=False)
pixels = np.empty(256*256*4,dtype=np.float32)
src.pixels.foreach_get(pixels)
large = np.repeat(np.repeat(pixels.reshape(256,256,4),4,axis=0),4,axis=1)
image = bpy.data.images.new(STEM+"_pixel",width=1024,height=1024,alpha=True)
image.pixels.foreach_set(large.ravel())
image.filepath_raw = str(OUT/(STEM+".png"))
image.file_format = "PNG"
image.save()
Path(scene.render.filepath).unlink()
print("BUILT",STEM,"faces",len(static.faces),"small fire loops",len(fires))
