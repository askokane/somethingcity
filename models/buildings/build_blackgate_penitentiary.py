"""Build a stylized 8-bit Blackgate Penitentiary island diorama."""

from math import cos, pi, sin
from pathlib import Path

import bpy
from mathutils import Vector

OUT = Path(__file__).resolve().parent
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = "Blackgate Penitentiary 8-bit"
scene.unit_settings.system = "METRIC"


def material(name, color, emission=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = .91
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*color, 1)
        bsdf.inputs["Emission Strength"].default_value = emission
    return m


M = [
    material("MAT_Blackgate_Stone", (.102, .116, .177)),       # 0
    material("MAT_Blackgate_DarkStone", (.050, .061, .104)),   # 1
    material("MAT_Blackgate_Edge", (.202, .210, .294)),       # 2
    material("MAT_Blackgate_Recess", (.017, .025, .048)),     # 3
    material("MAT_Blackgate_Amber", (.98, .47, .095), 1.15),  # 4
    material("MAT_Blackgate_DimAmber", (.44, .20, .050), .4), # 5
    material("MAT_Blackgate_Iron", (.022, .032, .054)),       # 6
    material("MAT_Blackgate_Red", (.94, .035, .022), 2),      # 7
    material("MAT_Blackgate_Water", (.025, .084, .121)),      # 8
    material("MAT_Blackgate_Foam", (.30, .54, .59)),          # 9
    material("MAT_Blackgate_Rock", (.060, .071, .105)),       # 10
    material("MAT_Blackgate_Paving", (.112, .127, .174)),     # 11
    material("MAT_Blackgate_BlueLight", (.40, .72, 1), 1.6),  # 12
    material("MAT_Blackgate_Gold", (.77, .56, .32), .12),     # 13
]

verts, faces, mids = [], [], []


def polygon(points, mat):
    i = len(verts)
    verts.extend(points)
    faces.append(tuple(range(i, i + len(points))))
    mids.append(mat)


def box(x, y, z, sx, sy, sz, mat):
    a, b, c = sx / 2, sy / 2, sz / 2
    p = [(x-a,y-b,z-c),(x+a,y-b,z-c),(x+a,y+b,z-c),(x-a,y+b,z-c),
         (x-a,y-b,z+c),(x+a,y-b,z+c),(x+a,y+b,z+c),(x-a,y+b,z+c)]
    for ids in ((0,3,2,1),(4,5,6,7),(0,1,5,4),
                (1,2,6,5),(2,3,7,6),(3,0,4,7)):
        polygon([p[i] for i in ids], mat)


def octagon(cx, cy, z0, z1, r, mat):
    lo = [(cx+r*cos(pi/8+i*pi/4),cy+r*sin(pi/8+i*pi/4),z0) for i in range(8)]
    hi = [(x,y,z1) for x,y,_ in lo]
    polygon(tuple(reversed(lo)),mat)
    polygon(hi,mat)
    for i in range(8):
        j=(i+1)%8
        polygon((lo[i],lo[j],hi[j],hi[i]),mat)


def window(x, y, z, w=.25, h=.90, bright=True):
    box(x,y,z,w+.14,.08,h+.14,2)
    box(x,y-.052,z,w+.025,.03,h+.025,3)
    box(x,y-.075,z,w*.82,.025,h*.88,4 if bright else 5)
    box(x,y-.105,z,w*.12,.024,h*.95,6)


def beacon(x,y,z):
    box(x,y,z+.28,.055,.055,.56,2)
    box(x,y,z+.61,.16,.16,.14,7)


GLYPHS={
    "A":("01110","10001","10001","11111","10001","10001","10001"),
    "B":("11110","10001","10001","11110","10001","10001","11110"),
    "C":("01111","10000","10000","10000","10000","10000","01111"),
    "E":("11111","10000","10000","11110","10000","10000","11111"),
    "G":("01111","10000","10000","10111","10001","10001","01111"),
    "K":("10001","10010","10100","11000","10100","10010","10001"),
    "L":("10000","10000","10000","10000","10000","10000","11111"),
    "T":("11111","00100","00100","00100","00100","00100","00100"),
}


def pixel_text(text,cx,y,cz,pitch,mat):
    advance=pitch*6
    start=cx-(len(text)*advance-pitch)/2+pitch*2
    for i,letter in enumerate(text):
        for row,bits in enumerate(GLYPHS[letter]):
            for col,bit in enumerate(bits):
                if bit=="1":
                    box(start+i*advance+col*pitch,y,cz+(3-row)*pitch,
                        pitch*.85,.055,pitch*.85,mat)


# Diorama tile, segmented dark water, blocky surf and rock perimeter.
box(0,0,.17,18.0,17.5,.34,1)
box(0,0,.36,17.70,17.20,.055,8)
for i in range(-12,13):
    for j in (-1,1):
        if i%3!=0:
            box(i*.62,j*(6.18+(i%4)*.12),.41,.36,.13,.035,9)
for i in range(-9,10):
    if i%2:
        box(i*.72,-7.23,.41,.36,.13,.035,9)
        box(i*.72,7.23,.41,.32,.11,.035,9)
box(0,.42,.70,15.15,11.85,.80,10)
box(0,.40,1.10,14.75,11.35,.34,1)
for s in (-1,1):
    for i in range(12):
        y=-5.04+i*.94
        x=s*(7.60+(i%3)*.22)
        box(x,y,.74+(i%3)*.10,.74,.70,.75+(i%3)*.17,10)
        box(x+s*.30,y+.14,.49,.57,.58,.43,1)
for x in (-7.5,-6.5,-5.5,5.5,6.5,7.5):
    box(x,-5.55,.64,.65,.65,.65,10)

# High rear prison block and stepped administrative wing.
box(-3.26,2.12,6.22,6.00,5.00,9.55,0)
box(-3.26,2.12,11.05,6.33,5.34,.25,2)
for x in (-5.97,-.55):
    box(x,2.05,6.95,.88,5.53,9.00,1)
    box(x,2.05,11.58,1.19,5.85,.31,2)
    box(x,2.05,11.85,.88,5.52,.23,1)
    beacon(x,1.40,11.99)
for x in (-4.53,-3.68,-2.83):
    window(x,-.45,10.16,.26,.83)
for z in (4.5,7.1,9.7):
    box(-3.26,-.45,z,5.78,.12,.13,2)
for x in (-4.93,-4.03,-3.13,-2.23,-1.33):
    box(x,-.48,6.31,.11,.17,8.95,2)

box(2.70,1.58,6.70,6.73,5.72,8.80,0)
box(2.70,1.58,11.14,7.02,6.04,.25,2)
box(2.70,1.58,11.39,6.58,5.61,.24,1)
for x in (-.24,.91,2.06,3.21,4.36,5.51):
    window(x,-1.32,8.69,.33,2.15,bright=True)
    box(x,-1.29,6.40,.11,.17,3.10,2)
for z in (4.8,7.3):
    box(2.70,-1.34,z,6.90,.17,.17,2)
for x in (-.47,5.87):
    box(x,1.6,6.82,.38,5.92,8.70,1)
    box(x,1.6,11.22,.54,6.08,.20,2)
# The visible right elevation has cell slots, stone courses and projecting piers.
for y in (-.55,.42,1.39,2.36,3.33):
    box(6.11,y,8.38,.13,.47,1.78,2)
    box(6.20,y,8.38,.045,.35,1.61,3)
    box(6.23,y,8.38,.023,.25,1.49,4 if y<2.5 else 5)
    for dz in (-.48,0,.48):
        box(6.26,y,8.38+dz,.05,.36,.065,6)
for y in (-1.03,-.06,.91,1.88,2.85,3.82):
    box(6.13,y,6.85,.20,.16,7.95,2)
for z in (5.04,7.13,9.88):
    box(6.17,1.60,z,.24,5.72,.16,2)
# A compact service monitor breaks up the right roof and gives its edge a purpose.
box(5.19,3.25,11.78,1.32,1.45,.62,1)
box(5.19,3.25,12.14,1.52,1.65,.13,2)
box(5.19,3.25,12.33,.80,.86,.25,0)
box(5.19,3.25,12.49,.96,1.02,.08,2)
for y in (2.85,3.25,3.65):
    box(5.98,y,11.77,.08,.16,.35,6)

# Raised octagonal roof cap with lit clerestory.
octagon(2.65,2.08,11.51,12.08,2.68,1)
octagon(2.65,2.08,12.08,12.24,2.78,2)
octagon(2.65,2.08,12.24,12.91,2.23,0)
for i in range(8):
    a=pi/8+i*pi/4
    box(2.65+2.13*cos(a),2.08+2.13*sin(a),12.57,.43,.36,.25,4)
octagon(2.65,2.08,12.91,13.10,2.38,2)
octagon(2.65,2.08,13.10,13.32,1.90,1)
octagon(2.65,2.08,13.32,13.47,1.47,2)
beacon(5.26,3.91,11.50)

# The island's high defensive walls: front and return walls with regular buttresses.
for s in (-1,1):
    box(s*5.35,-2.66,4.17,4.54,1.23,5.86,0)
    box(s*5.35,-2.66,7.16,4.80,1.42,.24,2)
    for i in range(6):
        x=s*(3.33+i*.82)
        box(x,-2.68,7.44,.65,1.51,.42,2)
    for x in (s*3.60,s*4.72,s*5.84,s*6.96):
        box(x,-3.39,4.03,.44,.36,5.54,1)
        box(x,-3.59,4.25,.26,.08,3.75,2)
        box(x,-3.65,6.49,.30,.17,.40,12)
    box(s*7.35,.58,4.20,.90,6.45,5.90,0)
    box(s*7.35,.58,7.23,1.10,6.65,.22,2)
    for y in (-2.13,-1.10,-.07,.96,1.99,3.02):
        box(s*7.38,y,7.52,.78,.72,.40,2)
        box(s*7.67,y,4.00,.25,.35,5.22,1)

# Right retaining wall: inset barred cell bays, lit slit windows and maintenance route.
for y in (-1.60,-.57,.46,1.49,2.52):
    box(7.85,y,4.34,.13,.53,2.60,2)
    box(7.94,y,4.34,.055,.43,2.38,3)
    box(7.97,y,4.34,.023,.30,2.22,1)
    for dy in (-.105,0,.105):
        box(8.00,y+dy,4.34,.055,.045,2.22,6)
    box(8.02,y,5.57,.09,.58,.10,2)
    box(8.00,y,3.10,.08,.57,.11,2)
    box(7.98,y,6.71,.06,.28,.38,12)
for z in (2.22,6.18):
    box(7.87,.42,z,.13,6.10,.13,2)
box(7.89,.43,7.79,.29,6.18,.15,1)
for y in (-2.45,-1.20,.05,1.30,2.55,3.80):
    box(8.02,y,7.81,.15,.14,.57,2)
    box(8.02,y,8.12,.27,.28,.10,1)
box(8.08,.44,1.59,.65,6.26,.21,10)
for y in (-2.21,-1.26,-.31,.64,1.59,2.54,3.49):
    box(8.22,y,1.75,.15,.15,.22,2)
    box(8.22,y,2.01,.075,.075,.39,6)
for z in (1.78,2.19):
    box(8.22,.50,z,.075,6.10,.075,6)

# Central gatehouse, heavy lintel, recessed barred gate and readable sign.
box(0,-3.38,4.40,4.12,1.60,5.54,0)
box(0,-4.24,4.00,2.55,.12,4.15,3)
box(0,-4.35,4.03,2.08,.10,3.75,1)
for x in [i*.25 for i in range(-4,5)]:
    box(x,-4.48,4.03,.075,.09,3.45,6)
for z in (2.45,3.35,4.25,5.15):
    box(0,-4.50,z,2.13,.08,.12,2)
box(0,-4.39,6.26,3.52,.24,.83,1)
box(0,-4.55,6.26,3.34,.075,.62,3)
pixel_text("BLACKGATE",0,-4.62,6.27,.092,13)
box(0,-4.34,7.27,4.38,1.89,.29,2)
for x in (-1.86,1.86):
    box(x,-4.31,7.61,.43,.57,.55,2)
for x in (-1.42,1.42):
    window(x,-4.25,5.60,.22,.57)
box(0,-4.41,7.92,.17,.16,.47,13)
box(0,-4.41,8.18,.26,.22,.16,4)
for x in (-1.16,1.16):
    box(x,-4.47,6.34,.12,.05,.70,2)

# Watchtowers: four octagonal lit rooms with stepped dark roofs.
def tower(x,y,z,outer=False):
    octagon(x,y,1.44,z-1.83,.72 if outer else .79,1)
    octagon(x,y,z-1.83,z-1.72,.92 if outer else 1.01,2)
    octagon(x,y,z-1.72,z-.89,1.13 if outer else 1.21,0)
    for i in range(8):
        a=pi/8+i*pi/4
        box(x+(.96 if outer else 1.02)*cos(a),
            y+(.96 if outer else 1.02)*sin(a),z-1.35,
            .31,.30,.34,4)
    octagon(x,y,z-.89,z-.67,1.23 if outer else 1.33,2)
    octagon(x,y,z-.67,z-.35,1.06 if outer else 1.13,1)
    octagon(x,y,z-.35,z-.16,.86 if outer else .93,2)
    octagon(x,y,z-.16,z,.54 if outer else .60,1)
    beacon(x,y,z)
    for i in range(3):
        box(x,y-.79,z-3.2-i*.55,.11,.07,.25,2)


for x,y,z,outer in ((-7.38,-2.75,9.67,True),(7.38,-2.75,9.67,True),
                    (-2.24,-3.13,9.96,False),(2.24,-3.13,9.96,False)):
    tower(x,y,z,outer)

# Front forecourt, check booths, guard camera, boom barrier and iron fence.
box(0,-5.63,1.23,10.55,3.44,.36,11)
for x in (-4.58,4.58):
    box(x,-5.05,1.91,1.65,1.37,1.16,0)
    box(x,-5.79,2.15,1.23,.08,.49,4)
    box(x,-5.05,2.57,1.92,1.67,.23,2)
    box(x,-5.05,2.78,1.48,1.28,.22,1)
for x in (-4.0,4.0):
    box(x,-4.30,1.45,.65,.65,.75,1)
    box(x,-4.30,1.88,.83,.83,.11,2)
    box(x,-4.30,2.11,.31,.31,.35,4)
for s in (-1,1):
    box(s*5.56,-5.95,1.83,.13,.13,1.65,6)
    for i in range(14):
        xx=s*(5.61+i*.20)
        if abs(xx)<7.58:
            box(xx,-5.95,1.50,.075,.08,1.10,6)
            box(xx,-5.95,2.08,.15,.13,.15,2)
    for z in (1.23,1.82):
        box(s*6.61,-5.95,z,2.15,.07,.09,6)
for x in (-7.65,-5.45,-2.06,2.06,5.45,7.65):
    box(x,-5.95,1.70,.36,.36,1.45,2)
    box(x,-5.95,2.46,.48,.48,.13,1)
    box(x,-5.95,2.70,.25,.25,.37,4)
box(0,-6.00,1.49,3.82,.10,1.06,6)
for x in [i*.25 for i in range(-7,8)]:
    box(x,-6.06,1.55,.07,.08,.90,2)
box(0,-6.10,1.96,3.84,.10,.11,2)
for x in (-1.60,1.60):
    box(x,-6.49,1.24,.42,1.64,.29,13)
for i in range(-4,5):
    box(i*.38,-6.45,1.45,.20,.17,.08,13 if i%2 else 6)

# Pixellated rocks and pale water breaks around the island's coast.
for s in (-1,1):
    for i in range(11):
        y=-4.95+i*.93
        x=s*(7.78+(i%3)*.12)
        box(x,y,.82,.54,.50,.73,10)
        box(x+s*.30,y-.16,.49,.30,.28,.19,9)
        if i%2==0:
            box(s*7.91,y,1.36,.72,.68,1.09,10)
            box(s*8.12,y+.25,.75,.58,.48,.53,1)
for i in range(-7,8):
    x=i*.88
    if abs(x)>3.5:
        box(x,-6.66,.57,.68,.48,.37,10)
        box(x,-6.97,.42,.39,.12,.035,9)

mesh=bpy.data.meshes.new("SM_Blackgate_Penitentiary_8bit_Mesh")
mesh.from_pydata(verts,[],faces)
mesh.update()
for m in M:
    mesh.materials.append(m)
for poly,idx in zip(mesh.polygons,mids):
    poly.material_index=idx
obj=bpy.data.objects.new("SM_Blackgate_Penitentiary_8bit",mesh)
scene.collection.objects.link(obj)
obj["voxel_step_m"]=.125
obj["reference"]="Fortified island prison with watchtowers, amber windows and BLACKGATE gate"

cam_data=bpy.data.cameras.new("CAM_Blackgate_Hero")
cam=bpy.data.objects.new("CAM_Blackgate_Hero",cam_data)
scene.collection.objects.link(cam)
cam.location=(15,-30,20)
cam.rotation_euler=(Vector((0,0,6.5))-cam.location).to_track_quat("-Z","Y").to_euler()
cam_data.type="ORTHO"
cam_data.ortho_scale=25.8
scene.camera=cam


def area(name, loc, target, energy, color, size):
    data=bpy.data.lights.new(name,"AREA")
    light=bpy.data.objects.new(name,data)
    scene.collection.objects.link(light)
    light.location=loc
    light.rotation_euler=(Vector(target)-light.location).to_track_quat("-Z","Y").to_euler()
    data.energy=energy
    data.color=color
    data.shape="DISK"
    data.size=size


area("LGT_Blackgate_CoolKey",(-12,-14,19),(0,0,5),2400,(.59,.75,1),12)
area("LGT_Blackgate_Rim",(11,10,18),(0,0,7),1550,(.39,.55,.84),10)
area("LGT_Blackgate_Gate",(0,-11,8),(0,-4,4),550,(1,.62,.28),7)
world=bpy.data.worlds.new("World_Blackgate_Night")
world.use_nodes=True
bg=next(n for n in world.node_tree.nodes if n.type=="BACKGROUND")
bg.inputs["Color"].default_value=(.006,.009,.020,1)
bg.inputs["Strength"].default_value=.33
scene.world=world
scene.render.engine="CYCLES"
scene.cycles.samples=32
scene.render.resolution_x=1024
scene.render.resolution_y=1024
scene.render.resolution_percentage=100
scene.render.image_settings.file_format="PNG"
scene.render.filepath=str(OUT / "blackgate_penitentiary_8bit.png")
scene.view_settings.view_transform="Standard"

bpy.ops.object.select_all(action="DESELECT")
obj.select_set(True)
bpy.context.view_layer.objects.active=obj
for screen in bpy.data.screens:
    if screen.name=="Layout":
        for region in screen.areas:
            if region.type=="VIEW_3D":
                space=region.spaces.active
                space.region_3d.view_location=(0,0,6)
                space.region_3d.view_distance=32
                space.region_3d.view_rotation=cam.rotation_euler.to_quaternion()
                space.overlay.show_extras=False

bpy.ops.wm.save_as_mainfile(filepath=str(OUT / "blackgate_penitentiary_8bit.blend"))
bpy.ops.export_scene.gltf(filepath=str(OUT / "blackgate_penitentiary_8bit.glb"),
                          export_format="GLB",use_selection=True,
                          use_active_scene=True,export_yup=True)
bpy.ops.render.render(write_still=True)
print("Blackgate:",len(mesh.polygons),"faces,",
      tuple(round(d,2) for d in obj.dimensions))
