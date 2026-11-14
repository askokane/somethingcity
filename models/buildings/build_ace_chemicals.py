"""Build an 8-bit Ace Chemicals factory from the supplied isometric reference."""

from math import cos, sin, pi
from pathlib import Path

import bpy
from mathutils import Vector


OUT = Path(__file__).resolve().parent
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = "Ace Chemicals 8-bit"
scene.unit_settings.system = "METRIC"


def material(name, color, emission=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = .82
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*color, 1)
        bsdf.inputs["Emission Strength"].default_value = emission
    return m


M = [
    material("MAT_Ace_Stone", (.096,.100,.165)),       # 0
    material("MAT_Ace_Shadow", (.036,.044,.085)),      # 1
    material("MAT_Ace_Edge", (.195,.194,.280)),        # 2
    material("MAT_Ace_Iron", (.025,.029,.058)),        # 3
    material("MAT_Ace_GreenWindow", (.65,.86,.13), 1.2),  # 4
    material("MAT_Ace_GreenDim", (.25,.45,.075), .45), # 5
    material("MAT_Ace_RailYellow", (.74,.46,.075)),    # 6
    material("MAT_Ace_SignGold", (.85,.61,.27), .22),  # 7
    material("MAT_Ace_TankGlass", (.34,.57,.07), .46), # 8
    material("MAT_Ace_Smoke", (.16,.18,.18)),           # 9
    material("MAT_Ace_SmokeGlow", (.55,.69,.14), .45), # 10
    material("MAT_Ace_Ground", (.07,.075,.11)),        # 11
]

verts, faces, mats = [], [], []


def polygon(points, mat):
    i = len(verts)
    verts.extend(points)
    faces.append(tuple(range(i, i + len(points))))
    mats.append(mat)


def box(x, y, z, sx, sy, sz, mat):
    a, b, c = sx/2, sy/2, sz/2
    p = [(x-a,y-b,z-c),(x+a,y-b,z-c),(x+a,y+b,z-c),(x-a,y+b,z-c),
         (x-a,y-b,z+c),(x+a,y-b,z+c),(x+a,y+b,z+c),(x-a,y+b,z+c)]
    for ids in ((0,3,2,1),(4,5,6,7),(0,1,5,4),
                (1,2,6,5),(2,3,7,6),(3,0,4,7)):
        polygon([p[j] for j in ids], mat)


def prism(cx, cy, z0, z1, radius, mat, sides=12):
    lo = [(cx+radius*cos(2*pi*i/sides),cy+radius*sin(2*pi*i/sides),z0)
          for i in range(sides)]
    hi = [(x,y,z1) for x,y,_ in lo]
    polygon(list(reversed(lo)), mat)
    polygon(hi, mat)
    for i in range(sides):
        j = (i+1)%sides
        polygon((lo[i],lo[j],hi[j],hi[i]),mat)


def chimney(cx, cy, base, top, radius):
    prism(cx,cy,base,top,radius,0)
    prism(cx,cy,base+.05,base+.22,radius+.10,2)
    for z in (base+.9,base+2.15,top-.16):
        if z < top-.10:
            prism(cx,cy,z,z+.11,radius+.09,2)
    # Open mouth: a raised rim and dark interior lie above the solid shaft.
    prism(cx,cy,top-.04,top+.08,radius+.12,2)
    prism(cx,cy,top+.08,top+.091,radius*.78,3)
    for k in range(7):
        angle = 2*pi*k/7
        box(cx+(radius+.055)*cos(angle),cy+(radius+.055)*sin(angle),
            top+.03,.11,.11,.18,2)
    # Pixel smoke curls up and then drifts towards the far right.
    for i in range(11):
        t = i/10
        x = cx + .13 + 2.10*t + .20*sin(3*pi*t)
        y = cy + .03 + .42*t
        z = top + .16 + 2.45*t + .09*sin(4*pi*t)
        size = .27 + .22*t
        box(x,y,z,size,size*.85,size*.9,10 if i < 4 else 9)
        if i >= 5:
            box(x-.22,y+.06,z-.05,size*.90,size*.70,size*.6,9)
        if 2 <= i <= 8:
            box(x+.12,y-.16,z+.12,size*.65,size*.70,size*.63,
                10 if i < 5 else 9)
        if i >= 6:
            box(x-.08,y+.20,z+.16,size*.86,size*.65,size*.60,9)


def window_front(x,y,z,width=.65,height=.75,lit=True):
    box(x,y-.018,z,width+.16,.10,height+.18,2)
    box(x,y-.092,z,width+.025,.035,height+.035,3)
    box(x,y-.12,z,width*.91,.02,height*.89,4 if lit else 5)
    for dx in (-width*.19,width*.19):
        box(x+dx,y-.15,z,.035,.035,height*.90,1)
    box(x,y-.15,z+height*.07,width*.94,.035,.035,1)
    box(x,y-.16,z-height*.55,width+.23,.16,.09,2)


def window_side(x,y,z,width=.60,height=.70,lit=True):
    s = -1 if x < 0 else 1
    box(x+s*.025,y,z,.10,width+.15,height+.15,2)
    box(x+s*.092,y,z,.035,width+.035,height+.035,3)
    box(x+s*.12,y,z,.02,width*.90,height*.87,4 if lit else 5)
    for dy in (-width*.19,width*.19):
        box(x+s*.15,y+dy,z,.035,.035,height*.90,1)
    box(x+s*.15,y,z+height*.07,.035,width*.94,.035,1)
    box(x+s*.16,y,z-height*.55,.16,width+.23,.09,2)


GLYPHS = {
    "A": ("01110","10001","10001","11111","10001","10001","10001"),
    "C": ("01111","10000","10000","10000","10000","10000","01111"),
    "E": ("11111","10000","10000","11110","10000","10000","11111"),
    "H": ("10001","10001","10001","11111","10001","10001","10001"),
    "M": ("10001","11011","10101","10101","10001","10001","10001"),
    "I": ("11111","00100","00100","00100","00100","00100","11111"),
    "L": ("10000","10000","10000","10000","10000","10000","11111"),
    "S": ("01111","10000","10000","01110","00001","00001","11110"),
}


def pixel_text(text,cx,y,cz,pitch,depth=.075,mat=7):
    advance = pitch*6
    width = len(text)*advance-pitch
    start = cx-width/2+pitch*2.5
    for index, letter in enumerate(text):
        for row,bits in enumerate(GLYPHS[letter]):
            for col,bit in enumerate(bits):
                if bit == "1":
                    box(start+index*advance+(col-2)*pitch,
                        y, cz+(3-row)*pitch,
                        pitch*.83,depth,pitch*.83,mat)


def rail_x(x0,x1,y,z):
    box((x0+x1)/2,y,z+.74,x1-x0,.075,.07,6)
    box((x0+x1)/2,y,z+.37,x1-x0,.055,.055,6)
    x = x0
    while x <= x1+.001:
        box(x,y,z+.39,.075,.075,.79,6)
        x += .56


def rail_y(x,y0,y1,z):
    box(x,(y0+y1)/2,z+.74,.075,y1-y0,.07,6)
    box(x,(y0+y1)/2,z+.37,.055,y1-y0,.055,6)
    y = y0
    while y <= y1+.001:
        box(x,y,z+.39,.075,.075,.79,6)
        y += .56


def pipe(points,width=.19):
    for (x0,y0,z0),(x1,y1,z1) in zip(points,points[1:]):
        box((x0+x1)/2,(y0+y1)/2,(z0+z1)/2,
            abs(x1-x0)+width,abs(y1-y0)+width,abs(z1-z0)+width,0)
        box(x1,y1,z1,width+.09,width+.09,width+.09,2)
    for x,y,z in points[1:-1]:
        box(x,y,z,width+.12,width+.12,width+.12,1)


# Raised square plot and a small paved service yard.
box(0,0,.13,14,13,.26,1)
box(0,0,.285,13.6,12.6,.045,11)
for ix in range(-12,13):
    box(ix*.52,-6.02,.313,.025,.72,.018,2)
for iy in range(-11,12):
    box(0,iy*.52-5.95,.315,13.3,.023,.018,1)

# Main three-storey block, stepped parapet, left pump house and right loading annex.
box(0,.12,3.17,8.65,8.20,5.65,0)
box(0,.12,5.97,8.90,8.42,.21,2)
box(0,.12,6.13,8.68,8.18,.12,1)
box(0,-3.99,4.57,8.88,.28,.16,2)
box(0,-3.99,2.05,8.88,.30,.18,2)
for x in (-4.27,-2.58,-.85,.85,2.58,4.27):
    box(x,-4.09,3.1,.25,.32,5.55,2)
    box(x,-4.19,5.93,.42,.43,.24,1)
box(-5.15,-.82,2.30,2.95,6.25,4.18,0)
box(-5.15,-.82,4.39,3.12,6.42,.19,2)
box(5.04,-1.05,1.78,3.24,5.80,3.17,0)
box(5.04,-1.05,3.44,3.46,6.02,.19,2)
for z in (.56,1.77,3.18):
    box(-5.15,-3.98,z,3.16,.16,.12,2)
for z in (1.76,3.22):
    box(5.04,-4.0,z,3.48,.17,.12,2)

# The large lettered sign is a separate front panel with a strong dark border.
box(0,-4.28,5.34,6.48,.28,2.50,2)
box(0,-4.45,5.34,6.24,.07,2.30,3)
pixel_text("ACE",0,-4.52,5.79,.235,.085,7)
pixel_text("CHEMICALS",0,-4.52,4.75,.091,.070,7)
for x in (-2.18,0,2.18):
    box(x,-4.65,6.70,.19,.38,.22,2)
    box(x,-4.83,6.53,.27,.25,.14,6)

# Window runs make the front read as an occupied chemical plant.
for z in (1.10,2.82):
    for col,x in enumerate((-3.48,-2.14,-.80,.80,2.14,3.48)):
        window_front(x,-4.13,z,.78,.92,lit=(col+int(z*2))%7 != 0)
for z in (1.22,2.63):
    for x in (-5.93,-4.47):
        window_front(x,-4.05,z,.73,.78)
for z in (1.08,2.43):
    window_front(3.96,-4.03,z,.55,.70)
for y in (-2.9,-1.35,.2,1.75,3.3):
    for z in (1.32,2.94,4.58):
        window_side(4.36,y,z,.69,.78,lit=(int(y*10)+int(z*10))%8 != 0)
for y in (-2.5,-.9,.7,2.3):
    for z in (1.42,2.95):
        window_side(-6.64,y,z,.56,.76)

# Front door, service roller shutter, warning chevrons and wall lamps.
box(-.02,-4.33,.91,1.13,.19,1.46,3)
for x in (-.35,.35):
    box(x,-4.45,.90,.46,.06,1.27,1)
box(-.02,-4.51,1.67,1.34,.24,.14,2)
box(5.14,-4.05,1.25,1.73,.14,1.78,3)
for i in range(12):
    box(5.14,-4.15,.48+i*.134,1.66,.035,.035,2)
for i in range(6):
    box(4.43+i*.27,-4.20,.48,.17,.06,.15,6 if i%2 else 3)
for x,y,z in ((-5.83,-4.31,2.12),(5.86,-4.31,2.55),(3.26,-4.30,1.95)):
    box(x,y,z+.18,.18,.22,.28,2)
    box(x,y-.15,z,.35,.22,.20,7)

# Roof machinery: square vent house, fan grille, transformer boxes and ducts.
box(-1.45,.85,6.59,2.70,2.18,.87,0)
box(-1.45,.85,7.06,2.91,2.37,.13,2)
for x in (-2.25,-1.45,-.65):
    box(x,-.29,6.61,.40,.08,.45,4)
for x in (-2.0,-1.45,-.9):
    box(x,.85,7.15,.13,1.50,.045,3)
    box(-1.45,.85+(x+1.45),7.16,1.50,.13,.045,3)
for x,y,sx,sy in ((2.10,1.40,1.12,.82),(3.27,1.51,.72,.68),
                  (4.80,-.05,.98,.84)):
    box(x,y,6.54,sx,sy,.69,0)
    box(x,y,6.91,sx+.11,sy+.11,.10,2)
    for j in range(3):
        box(x-sx*.24+j*sx*.24,y-sy/2-.06,6.60,.09,.08,.31,1)

# Three stacks, each with metal hoops, an open rim, and curling voxel smoke.
chimney(-3.73,2.22,6.15,10.35,.56)
chimney(.25,2.50,6.15,13.22,.78)
chimney(4.65,2.55,5.42,9.95,.60)
for x,y,z0,z1 in ((-3.73,2.22,6.35,10.24),(.25,2.5,6.38,13.09),
                  (4.65,2.55,5.72,9.82)):
    # Parallel ladder rails and square rungs on the visible side.
    box(x+.62,y-.48,(z0+z1)/2,.055,.065,z1-z0,2)
    box(x+.88,y-.48,(z0+z1)/2,.055,.065,z1-z0,2)
    z = z0
    while z < z1:
        box(x+.75,y-.48,z,.29,.065,.045,2)
        z += .36

# Raised steel trestle supports the right-hand stack.
for x in (3.80,5.50):
    for y in (1.62,3.37):
        box(x,y,4.64,.14,.14,3.35,2)
for z in (3.17,5.95):
    box(4.65,1.62,z,2.05,.14,.15,2)
    box(4.65,3.37,z,2.05,.14,.15,2)
for side in (-1,1):
    for i in range(5):
        y = 1.68+i*.34
        x = 4.65+side*.86
        box(x,y,3.35+i*.48,.085,.55,.10,2)
        box(x,y,5.62-i*.48,.085,.55,.10,2)
for i in range(9):
    t = i/8
    box(3.81+1.68*t,1.58,3.30+2.35*t,.26,.10,.29,2)
    box(3.81+1.68*t,1.58,5.65-2.35*t,.26,.10,.29,2)
rail_x(3.62,5.68,1.50,6.05)
rail_y(5.71,1.50,3.52,6.05)
rail_x(-6.60,-3.93,3.90,4.51)
rail_x(1.55,4.20,4.08,6.09)

# Three vats show glowing chemistry behind dark segmented metal hoops.
def vat(cx,cy,z0,z1,r):
    prism(cx,cy,z0,z1,r,8)
    prism(cx,cy,z0,z0+.20,r+.11,1)
    prism(cx,cy,z1-.16,z1+.03,r+.12,2)
    prism(cx,cy,z1+.02,z1+.30,r*.77,0)
    for z in (z0+.52,z0+1.15,z1-.50):
        if z < z1-.20:
            prism(cx,cy,z,z+.08,r+.045,2)
    for ang in (0,pi/2,pi,3*pi/2):
        x = cx+(r+.025)*cos(ang)
        y = cy+(r+.025)*sin(ang)
        box(x,y,(z0+z1)/2,.13,.13,z1-z0-.35,3)

box(-5.28,-4.77,.40,2.25,1.85,.23,2)
box(5.45,-2.29,3.58,2.50,2.30,.23,2)
vat(-5.28,-4.77,.55,4.32,.86)
vat(5.13,-2.62,3.70,6.14,.62)
vat(6.04,-1.89,3.70,5.91,.45)
for x,y,r,z in ((-5.28,-4.77,.86,4.33),(5.13,-2.62,.62,6.15),
                (6.04,-1.89,.45,5.92)):
    for i in range(9):
        a = 2*pi*i/9
        box(x+r*cos(a),y+r*sin(a),z+.07,.13,.13,.13,2)

# Coiled conduits and chemical transfer lines stay on right-angle routes.
pipe([(-5.28,-4.77,4.55),(-5.28,-4.77,5.12),(-4.72,-4.77,5.12),
      (-4.72,-3.55,5.12),(-4.72,-3.55,6.17)],.15)
pipe([(5.13,-2.62,6.22),(5.13,-2.62,6.55),(4.40,-2.62,6.55),
      (4.40,-1.62,6.55),(3.69,-1.62,6.55)],.17)
pipe([(6.04,-1.89,5.99),(6.04,-1.89,6.36),(6.73,-1.89,6.36),
      (6.73,.15,6.36)],.16)
rail_x(4.18,6.66,-3.48,3.68)
rail_y(6.67,-3.42,-.78,3.68)
pipe([(2.92,3.83,6.43),(2.92,4.53,6.43),(4.65,4.53,6.43),
      (4.65,3.85,6.43)],.14)
pipe([(-6.02,.15,4.51),(-6.02,.15,5.28),(-5.12,.15,5.28),
      (-5.12,.15,6.15)],.16)
pipe([(-3.21,2.18,6.19),(-3.21,2.18,6.69),(-2.56,2.18,6.69),
      (-2.56,3.31,6.69)],.14)

# Safety catwalks, stair stripes, ground conduits and trim panels.
for x in (-4.32,4.32):
    for y in (-3.69,-2.35,-1.01,.33,1.67,3.01):
        box(x,y,3.16,.14,.18,5.42,1)
        box(x,y,5.84,.30,.34,.19,2)
for y in (-3.58,-2.31,-1.04,.23,1.5,2.77):
    box(6.71,y,3.25,.14,.15,1.12,2)
for x in (-3.55,-2.65,2.65,3.55):
    box(x,-3.99,.35,.20,.16,.25,1)

# Iron fence, pointed pickets, paved gate and two yellow lanterns.
def fencepost(x,y):
    box(x,y,.84,.29,.29,1.17,2)
    box(x,y,1.47,.39,.39,.12,1)
    box(x,y,1.63,.18,.18,.22,2)
    box(x,y,1.77,.08,.08,.10,3)

for x in (-6.50,-5.20,-3.90,-2.60,2.60,3.90,5.20,6.50):
    fencepost(x,-5.92)
for side in (-1,1):
    for y in (-5.92,-4.65,-3.38,-2.11,-.84,.43,1.70,2.97,4.24,5.51):
        fencepost(side*6.50,y)
    for y in [i*.34-5.55 for i in range(33)]:
        box(side*6.50,y,1.02,.05,.05,.93,3)
        box(side*6.50,y,1.54,.085,.085,.16,2)
    box(side*6.50,-.03,.97,.07,11.7,.08,3)
    box(side*6.50,-.03,1.37,.07,11.7,.08,3)
for x in [i*.36 for i in range(-18,19) if abs(i) >= 6]:
    box(x,-5.92,1.02,.05,.05,.93,3)
    box(x,-5.92,1.54,.085,.085,.16,2)
for x0,x1 in ((-6.5,-2.0),(2.0,6.5)):
    box((x0+x1)/2,-5.92,.97,x1-x0,.07,.08,3)
    box((x0+x1)/2,-5.92,1.37,x1-x0,.07,.08,3)
for x in (-1.57,1.57):
    fencepost(x,-5.96)
    prism(x,-5.96,1.79,2.02,.19,7,8)
for x in [i*.27 for i in range(-5,6)]:
    box(x,-5.96,1.05,.06,.07,1.1,3)
for i in range(13):
    angle = pi*i/12
    box(1.54*cos(angle),-5.96,1.35+.75*sin(angle),.17,.16,.17,6)
box(0,-5.97,1.25,3.1,.09,.07,6)
for x in (-1.0,1.0):
    box(x,-5.95,.42,.18,.36,.22,11)
for z in (.36,.44,.52):
    box(0,-5.23,z,2.68+(z-.36)*1.1,.62,.08,2)

mesh = bpy.data.meshes.new("SM_Ace_Chemicals_8bit_Mesh")
mesh.from_pydata(verts,[],faces)
mesh.update()
for m in M:
    mesh.materials.append(m)
for f,mid in zip(mesh.polygons,mats):
    f.material_index = mid
building = bpy.data.objects.new("SM_Ace_Chemicals_8bit",mesh)
scene.collection.objects.link(building)
building["voxel_step_m"] = .125
building["reference"] = "ACE CHEMICALS sign, three smokestacks, green vats, pipes, yellow catwalks and fenced yard"

# Hero camera, dark world and contrasting cool/warm lights.
cam_data = bpy.data.cameras.new("CAM_Ace_Chemicals_Hero")
cam = bpy.data.objects.new("CAM_Ace_Chemicals_Hero",cam_data)
scene.collection.objects.link(cam)
cam.location = (20,-23,18)
cam.rotation_euler = (Vector((0,0,6.0))-cam.location).to_track_quat("-Z","Y").to_euler()
cam_data.type = "ORTHO"
cam_data.ortho_scale = 21.6
scene.camera = cam

def area(name,loc,target,energy,color,size):
    data = bpy.data.lights.new(name,"AREA")
    obj = bpy.data.objects.new(name,data)
    scene.collection.objects.link(obj)
    obj.location = loc
    obj.rotation_euler = (Vector(target)-obj.location).to_track_quat("-Z","Y").to_euler()
    data.energy = energy
    data.color = color
    data.shape = "DISK"
    data.size = size

area("LGT_Ace_CoolKey",(-9,-11,16),(0,0,5),2000,(.53,.62,1),10)
area("LGT_Ace_Rim",(8,7,16),(0,0,6),1450,(.38,.46,.80),9)
area("LGT_Ace_WarmFront",(1,-8,9),(0,-4,4),670,(1,.71,.32),7)
world = bpy.data.worlds.new("World_Ace_Midnight")
world.use_nodes = True
bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
bg.inputs["Color"].default_value = (.008,.012,.027,1)
bg.inputs["Strength"].default_value = .38
scene.world = world
scene.render.engine = "CYCLES"
scene.cycles.samples = 32
scene.render.resolution_x = 1024
scene.render.resolution_y = 1024
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = str(OUT / "ace_chemicals_8bit.png")
scene.view_settings.view_transform = "Standard"

bpy.ops.object.select_all(action="DESELECT")
building.select_set(True)
bpy.context.view_layer.objects.active = building
for screen in bpy.data.screens:
    if screen.name == "Layout":
        for region in screen.areas:
            if region.type == "VIEW_3D":
                space = region.spaces.active
                space.region_3d.view_location = (0,0,6)
                space.region_3d.view_distance = 30
                space.region_3d.view_rotation = cam.rotation_euler.to_quaternion()
                space.overlay.show_extras = False

bpy.ops.wm.save_as_mainfile(filepath=str(OUT / "ace_chemicals_8bit.blend"))
bpy.ops.export_scene.gltf(filepath=str(OUT / "ace_chemicals_8bit.glb"),
                          export_format="GLB",use_selection=True,
                          use_active_scene=True,export_yup=True)
bpy.ops.render.render(write_still=True)
print("Ace Chemicals:",len(mesh.polygons),"faces,",
      tuple(round(d,2) for d in building.dimensions))
