"""Build a voxel Gothic Arkham Asylum inspired by the supplied concept image."""

from pathlib import Path
from math import cos, sin, pi

import bpy
from mathutils import Vector


OUT = Path(__file__).resolve().parent
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = "Arkham Asylum 8-bit"
scene.unit_settings.system = "METRIC"


def material(name, color, emission=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = 1
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*color, 1)
        bsdf.inputs["Emission Strength"].default_value = emission
    return m


materials = [
    material("MAT_Arkham_Stone", (.105, .115, .205)),
    material("MAT_Arkham_Shadow", (.041, .049, .100)),
    material("MAT_Arkham_Edge", (.205, .215, .315)),
    material("MAT_Arkham_Roof", (.073, .083, .155)),
    material("MAT_Arkham_WindowRecess", (.015, .023, .039)),
    material("MAT_Arkham_LimeGlass", (.58, .82, .12), 1.35),
    material("MAT_Arkham_WindowMuted", (.28, .46, .08), .55),
    material("MAT_Arkham_Ground", (.040, .075, .078)),
    material("MAT_Arkham_Iron", (.025, .035, .060)),
    material("MAT_Arkham_Clock", (.67, .88, .19), 1.10),
]

verts, faces, face_mats = [], [], []


def polygon(points, mat):
    a = len(verts)
    verts.extend(points)
    faces.append(tuple(range(a, a + len(points))))
    face_mats.append(mat)


def box(x, y, z, sx, sy, sz, mat):
    a, b, c = sx / 2, sy / 2, sz / 2
    p = [(x-a,y-b,z-c), (x+a,y-b,z-c), (x+a,y+b,z-c), (x-a,y+b,z-c),
         (x-a,y-b,z+c), (x+a,y-b,z+c), (x+a,y+b,z+c), (x-a,y+b,z+c)]
    for ids in ((0,3,2,1),(4,5,6,7),(0,1,5,4),
                (1,2,6,5),(2,3,7,6),(3,0,4,7)):
        polygon([p[i] for i in ids], mat)


def roof(cx, cy, eave, width, depth, rise, mat=3):
    """Gable with pixel stair steps; ridge runs along Y."""
    steps = round(rise / .125)
    for i in range(steps):
        w = max(.25, width - i * .25)
        box(cx, cy, eave + .0625 + i * .125, w, depth, .125, mat)
        if i % 2 == 0:
            box(cx, cy-depth/2-.015, eave+.125+i*.125, w+.10, .07, .065, 2)
            for side in (-1, 1):
                y = cy-depth/2+.30
                tile = 0
                while y < cy+depth/2-.15:
                    box(cx+side*(w/2-.11), y, eave+.133+i*.125,
                        .15, .25, .025, 1 if tile % 3 else 2)
                    y += .55
                    tile += 1
    box(cx, cy, eave+.0625+steps*.125, .20, depth+.10, .125, 2)


def spire(cx, cy, eave, width, rise):
    steps = round(rise/.125)
    for i in range(steps):
        size = max(.20, width * (1-i/steps))
        box(cx, cy, eave+.0625+i*.125, size, size, .125, 3)
        if i % 3 == 0:
            box(cx, cy, eave+.12+i*.125, size+.08, size+.08, .045, 2)
    box(cx, cy, eave+rise+.20, .10, .10, .40, 2)
    box(cx, cy, eave+rise+.43, .17, .17, .08, 1)


def trim(cx, cy, z, sx, sy):
    box(cx, cy, z, sx+.16, sy+.16, .13, 2)
    box(cx, cy, z+.10, sx+.07, sy+.07, .07, 1)


def gothic_window(axis, u, wall, z, width=.48, height=1.08, lit=True):
    """Stepped pointed opening with a deep recess, luminous glass and mullion."""
    front = axis == "Y"
    # Every Y-facing call here addresses a facade facing the entrance (-Y),
    # including rear towers whose front wall has a positive Y coordinate.
    s = -1 if front else (-1 if wall < 0 else 1)
    plane = wall+s*.055
    face = wall+s*.085
    glass = 5 if lit else 6
    def panel(h, w, center_z, mat, depth):
        if front:
            box(u, depth, center_z, w, .055, h, mat)
        else:
            box(depth, u, center_z, .055, w, h, mat)
    panel(height+.12, width+.16, z, 2, plane)
    panel(height+.04, width+.07, z, 4, face+s*.025)
    panel(height*.68, width*.69, z-height*.11, glass, face+s*.060)
    panel(height*.22, width*.48, z+height*.32, glass, face+s*.060)
    panel(height*.10, width*.23, z+height*.47, glass, face+s*.060)
    if front:
        box(u, face+s*.097, z-height*.11, .045, .035, height*.65, 1)
        box(u, face+s*.098, z-height*.02, width*.74, .035, .035, 2)
    else:
        box(face+s*.097, u, z-height*.11, .035, .045, height*.65, 1)
        box(face+s*.098, u, z-height*.02, .035, width*.74, .035, 2)
    # Voxel jambs, a projecting sill and a pointed three-step stone hood.
    panel(.09, width+.28, z-height*.57, 2, face+s*.11)
    for edge in (-1, 1):
        if front:
            box(u+edge*(width/2+.065), face+s*.11, z,
                .075, .06, height+.16, 2)
        else:
            box(face+s*.11, u+edge*(width/2+.065), z,
                .06, .075, height+.16, 2)
    for level, span in enumerate((width+.22, width*.78, width*.38)):
        panel(.065, span, z+height*.55+level*.075, 2, face+s*.13)


def crenels(x0, x1, y, z):
    box((x0+x1)/2, y, z, x1-x0, .18, .20, 2)
    x = x0
    while x <= x1+.001:
        box(x, y, z+.17, .20, .22, .24, 2)
        x += .40


# Plinth, grounds and courtyard. The gate faces -Y.
box(0, 0, .12, 16, 14, .24, 1)
box(0, 0, .255, 15.5, 13.5, .05, 2)
box(0, -4.7, .30, 13.7, 3.0, .06, 7)
for side in (-1, 1):
    for y in (-5.0, -4.25, -3.5):
        box(side*4.9, y, .41, 1.05, .48, .28, 7)

# Connected main mass and its lower side wings.
box(0, 1.05, 2.85, 10.7, 7.25, 5.1, 0)
trim(0, 1.05, 5.38, 10.7, 7.25)
for side in (-1, 1):
    box(side*4.85, -1.95, 2.5, 4.35, 4.55, 4.4, 0)
    trim(side*4.85, -1.95, 4.68, 4.35, 4.55)
    roof(side*4.85, -1.95, 4.78, 4.25, 4.42, 1.13)
    box(side*4.85, -1.95, 3.70, 4.55, 4.75, .10, 1)
    for x in (side*3.4, side*6.35):
        box(x, -4.22, 2.58, .16, .18, 4.45, 2)
        box(x, .30, 2.58, .16, .18, 4.45, 2)

# Central upper clock hall and its dominant pitched roof.
box(0, 2.15, 7.05, 4.30, 4.65, 4.10, 0)
trim(0, 2.15, 9.08, 4.30, 4.65)
roof(0, 2.15, 9.18, 4.25, 4.80, 1.38)
for x in (-2.06, 2.06):
    box(x, -.16, 7.04, .18, .18, 4.05, 2)
for x in (-1.62, 1.62):
    box(x, -.21, 7.02, .10, .14, 4.03, 1)

# Tall left tower and slimmer right watchtower.
box(-5.12, 2.2, 5.85, 2.72, 2.74, 5.05, 0)
trim(-5.12, 2.2, 8.34, 2.72, 2.74)
spire(-5.12, 2.2, 8.43, 2.60, 1.55)
box(5.35, 2.55, 5.56, 1.56, 1.56, 5.06, 0)
trim(5.35, 2.55, 8.08, 1.56, 1.56)
spire(5.35, 2.55, 8.17, 1.46, 1.28)

# Front gable, clock face, bay windows and corner pepperpot roofs.
box(0, -3.36, 3.20, 3.78, 2.22, 5.75, 0)
trim(0, -3.36, 5.94, 3.78, 2.22)
roof(0, -3.36, 6.03, 3.80, 2.30, 1.46)
for x in (-2.12, 2.12):
    box(x, -3.50, 3.04, 1.06, 1.16, 4.7, 0)
    trim(x, -3.50, 5.38, 1.06, 1.16)
    spire(x, -3.50, 5.48, 1.04, .76)
box(0, -4.58, 2.17, 2.24, .47, 3.55, 0)
trim(0, -4.58, 3.89, 2.24, .47)
roof(0, -4.58, 3.98, 2.25, .68, .70)
for x in (-.73, 0, .73):
    gothic_window("Y", x, -4.88, 2.2, .43, 1.65)

# Clock: pixel-circle rings, bright face, hour marks and hands on the front gable.
clock_y = -4.63
for iz in range(-8, 9):
    for ix in range(-8, 9):
        rr = ix*ix + iz*iz
        if rr <= 64:
            color = 2 if rr >= 48 else 9 if rr <= 43 else 4
            box(ix*.09, clock_y, 5.47+iz*.09, .091, .045, .091, color)
for dx,dz in ((0,.44),(.44,0),(0,-.44),(-.44,0)):
    box(dx, clock_y-.052, 5.47+dz, .065, .028, .065, 1)
box(0, clock_y-.064, 5.58, .055, .03, .27, 1)
box(.12, clock_y-.066, 5.47, .28, .03, .045, 1)

# Lime windows in regular voxel bays.
for side in (-1, 1):
    for x in (side*3.85, side*4.85, side*5.85):
        for z in (1.15, 2.58, 3.94):
            gothic_window("Y", x, -4.24, z, .52, 1.02, lit=(int(abs(x)*10+z*10)%7 != 0))
    for y in (-3.1, -1.65, -.2, 1.25, 2.7, 4.15):
        for z in (1.36, 2.95, 4.34):
            gothic_window("X", y, side*7.03 if y < .40 else side*5.37, z, .42, 1.03)
for x in (-1.52, -1.02, 1.02, 1.52):
    gothic_window("Y", x, -4.51, 4.70, .31, .84)
for x in (-1.32, -.44, .44, 1.32):
    for z in (6.30, 7.95):
        gothic_window("Y", x, -.22, z, .47, 1.32)
for y in (.8, 2.15, 3.5):
    for z in (6.35, 8.0):
        gothic_window("X", y, 2.19, z, .47, 1.33)
for x in (-5.70, -4.55):
    for z in (4.83, 6.35, 7.55):
        gothic_window("Y", x, .80, z, .45, 1.13)
for z in (4.32, 5.72, 7.1):
    gothic_window("Y", 5.35, 1.73, z, .41, .95)
for x in (-4.6, -3.75, -2.9, 2.9, 3.75, 4.6):
    gothic_window("Y", x, -2.61, 4.64, .34, .82)

# A pair of roof dormers breaks up the broad upper slope.
for x in (-1.05, 1.05):
    box(x, -.26, 9.67, .66, .58, .80, 0)
    trim(x, -.26, 10.02, .66, .58)
    roof(x, -.26, 10.10, .68, .64, .25)
    gothic_window("Y", x, -.57, 9.64, .29, .49)

# Stone ribs and small crenellated links reinforce the Gothic silhouette.
for x in (-6.58, -3.18, 3.18, 6.58):
    box(x, -4.25, 3.3, .15, .16, 2.80, 2)
for x in (-2.1, 2.1):
    box(x, -.26, 6.95, .18, .19, 4.2, 2)
for side in (-1, 1):
    # Alternating corner stones give the flat walls a masonry scale.
    for x, y, z0, z1 in ((side*7.01,-4.23,.70,4.43),
                         (side*3.23,-4.23,1.35,4.43),
                         (side*2.10,-.24,5.30,8.98)):
        step = 0
        z = z0
        while z < z1:
            box(x, y, z, .24 if step % 2 else .32, .13, .17, 2)
            z += .38
            step += 1
    # Projecting buttresses taper in blocky tiers below the wing eaves.
    for x in (side*3.24, side*6.62):
        box(x,-4.43,1.82,.29,.35,2.55,1)
        box(x,-4.44,3.16,.38,.42,.18,2)
        box(x,-4.43,3.40,.25,.30,.31,2)
    for y in (-3.70, -1.80, .10):
        box(side*7.04,y,2.42,.32,.24,3.31,1)
        box(side*7.05,y,4.15,.40,.35,.16,2)
crenels(-3.69, -2.24, .08, 5.56)
crenels(2.24, 3.69, .08, 5.56)
crenels(-6.17, -4.07, 4.82, 5.48)
crenels(4.07, 6.17, 4.82, 5.48)

# Central Gothic doorway, steps, iron gate and fence perimeter.
box(0, -4.93, .94, 1.35, .11, 1.72, 4)
for x in (-.45, .45):
    box(x, -5.02, .92, .52, .045, 1.55, 8)
box(0, -5.08, 1.71, 1.55, .16, .16, 2)
# Stepped hood above the portal, under the clock bay.
for i in range(5):
    box(0, -5.04-i*.055, 3.80+i*.11,
        2.65-i*.28, .66-i*.04, .11, 3 if i % 2 else 2)
for x in (-1.05, 1.05):
    box(x,-5.13,3.61,.13,.21,.44,2)
for i in range(4):
    box(0, -5.31-i*.28, .34-i*.055, 2.2+i*.35, .34, .11, 2)
for side in (-1, 1):
    for x in (side*1.78, side*2.18):
        box(x, -4.62, 1.30, .18, .18, 2.16, 2)
    for y in (-5.8, -5.1, -4.4):
        box(side*6.70, y, .47, .34, .34, .50, 7)

def fencepost(x,y):
    box(x,y,.78,.29,.29,1.15,2)
    box(x,y,1.41,.39,.39,.11,1)
    box(x,y,1.57,.19,.19,.22,2)
    box(x,y,1.72,.09,.09,.10,2)
    box(x,y,1.82,.05,.05,.10,8)

for x in [i*.80 for i in range(-9,10) if abs(i) >= 2]:
    if abs(x) <= 7.25:
        box(x,-6.40,.82,.045,.055,.91,8)
        box(x,-6.40,1.33,.10,.10,.14,2)
for x in (-7.20,-5.60,-4.0,-2.4,2.4,4.0,5.60,7.20):
    fencepost(x,-6.40)
for side in (-1,1):
    for y in (-5.6,-4.8,-4.0,-3.2,-2.4,-1.6,-.8,0,.8,1.6,2.4,3.2,4,4.8,5.6):
        box(side*7.20,y,.82,.055,.045,.91,8)
        box(side*7.20,y,1.33,.10,.10,.14,2)
    for y in (-6.4,-4.8,-3.2,-1.6,0,1.6,3.2,4.8,6.0):
        fencepost(side*7.20,y)
    box(side*7.2,0,.92,.08,12.4,.09,8)
    box(side*7.2,0,1.26,.08,12.4,.09,8)
box(-4.80,-6.40,.92,4.8,.08,.09,8)
box(4.80,-6.40,.92,4.8,.08,.09,8)
box(-4.80,-6.40,1.26,4.8,.08,.09,8)
box(4.80,-6.40,1.26,4.8,.08,.09,8)
for x in (-1.15,1.15):
    fencepost(x,-6.45)
    box(x,-6.48,1.68,.30,.32,.28,9)
for x in (-.90,-.60,-.30,0,.30,.60,.90):
    box(x,-6.47,.95,.065,.06,1.02,8)
box(0,-6.47,1.45,2.2,.08,.10,2)
for z in (1.56,1.68,1.80):
    box(0,-6.47,z,2.2-abs(z-1.68)*3,.08,.10,2)
for i in range(13):
    angle = pi * i / 12
    box(1.11*cos(angle), -6.47, 1.59+.70*sin(angle), .19, .16, .19, 2)

# Pixel shrubs add courtyard texture without softening the silhouette.
for side in (-1,1):
    for y in (-5.70,-5.05,-4.42):
        for i,(dx,dz) in enumerate(((0,0),(.24,.12),(-.23,.08))):
            box(side*3.1+dx,y,.52+dz,.54,.52,.42,7 if i else 1)

mesh = bpy.data.meshes.new("SM_Arkham_Asylum_8bit_Mesh")
mesh.from_pydata(verts, [], faces)
mesh.update()
for m in materials:
    mesh.materials.append(m)
for face, mid in zip(mesh.polygons, face_mats):
    face.material_index = mid
building = bpy.data.objects.new("SM_Arkham_Asylum_8bit", mesh)
scene.collection.objects.link(building)
building["voxel_step_m"] = .125
building["reference"] = "Gothic isometric asylum concept with lime windows, central clock and iron fence"

# Camera and lighting are part of the preview scene, separate from export geometry.
cam_data = bpy.data.cameras.new("CAM_Arkham_Hero")
cam = bpy.data.objects.new("CAM_Arkham_Hero", cam_data)
scene.collection.objects.link(cam)
cam.location = (22, -25, 20)
cam.rotation_euler = (Vector((0,0,5.0))-cam.location).to_track_quat("-Z","Y").to_euler()
cam_data.type = "ORTHO"
cam_data.ortho_scale = 21.2
scene.camera = cam

def area(name, loc, target, energy, color, size):
    data = bpy.data.lights.new(name, "AREA")
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.location = loc
    obj.rotation_euler = (Vector(target)-obj.location).to_track_quat("-Z","Y").to_euler()
    data.energy = energy
    data.color = color
    data.shape = "DISK"
    data.size = size

area("LGT_Arkham_CoolKey", (-10,-12,18), (0,0,4), 2200, (.55,.64,1), 11)
area("LGT_Arkham_Fill", (10,-6,9), (0,0,4), 900, (.45,.54,.78), 10)
area("LGT_Arkham_Rim", (4,9,15), (0,0,5), 1500, (.35,.45,.80), 9)
world = bpy.data.worlds.new("World_Arkham_Midnight")
world.use_nodes = True
bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
bg.inputs["Color"].default_value = (.008,.012,.027,1)
bg.inputs["Strength"].default_value = .35
scene.world = world
scene.render.engine = "CYCLES"
scene.cycles.samples = 32
scene.render.resolution_x = 1024
scene.render.resolution_y = 1024
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = str(OUT / "arkham_asylum_8bit.png")
scene.view_settings.view_transform = "Standard"

bpy.ops.object.select_all(action="DESELECT")
building.select_set(True)
bpy.context.view_layer.objects.active = building
for screen in bpy.data.screens:
    if screen.name == "Layout":
        for region in screen.areas:
            if region.type == "VIEW_3D":
                space = region.spaces.active
                space.region_3d.view_location = (0,0,5)
                space.region_3d.view_distance = 30
                space.region_3d.view_rotation = cam.rotation_euler.to_quaternion()
                space.overlay.show_extras = False

bpy.ops.wm.save_as_mainfile(filepath=str(OUT / "arkham_asylum_8bit.blend"))
bpy.ops.export_scene.gltf(filepath=str(OUT / "arkham_asylum_8bit.glb"),
                          export_format="GLB", use_selection=True,
                          use_active_scene=True, export_yup=True)
bpy.ops.render.render(write_still=True)
print("Arkham Asylum:", len(mesh.polygons), "faces,", len(mesh.vertices), "verts,",
      tuple(round(d,2) for d in building.dimensions))
