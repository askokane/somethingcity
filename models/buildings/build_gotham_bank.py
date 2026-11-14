"""Build a pixel-styled neoclassical Gotham Bank from the supplied reference."""

from math import cos, sin, pi
from pathlib import Path

import bpy
from mathutils import Vector


OUT = Path(__file__).resolve().parent
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = "Gotham Bank 8-bit"
scene.unit_settings.system = "METRIC"


def material(name, color, emission=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = .9
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*color, 1)
        bsdf.inputs["Emission Strength"].default_value = emission
    return mat


M = [
    material("MAT_Bank_Stone", (.33,.33,.42)),          # 0
    material("MAT_Bank_Shadow", (.12,.13,.20)),         # 1
    material("MAT_Bank_StoneLight", (.64,.61,.65)),     # 2
    material("MAT_Bank_StoneEdge", (.46,.44,.52)),      # 3
    material("MAT_Bank_AmberGlass", (.86,.47,.10), .95), # 4
    material("MAT_Bank_GoldGlass", (.98,.70,.22), 1.25), # 5
    material("MAT_Bank_WindowRecess", (.035,.033,.055)), # 6
    material("MAT_Bank_Roof", (.095,.105,.17)),         # 7
    material("MAT_Bank_OrnamentGold", (.78,.42,.065), .10), # 8
    material("MAT_Bank_Ink", (.042,.048,.075)),         # 9
    material("MAT_Bank_LionStone", (.69,.66,.66)),      # 10
    material("MAT_Bank_Pavement", (.19,.20,.27)),       # 11
    material("MAT_Bank_Lantern", (.98,.66,.18), 1.35),  # 12
    material("MAT_Bank_DoorWood", (.18,.095,.055)),     # 13
]

verts, faces, mids = [], [], []


def polygon(points, mat):
    start = len(verts)
    verts.extend(points)
    faces.append(tuple(range(start, start+len(points))))
    mids.append(mat)


def box(x,y,z,sx,sy,sz,mat):
    a,b,c = sx/2,sy/2,sz/2
    p = [(x-a,y-b,z-c),(x+a,y-b,z-c),(x+a,y+b,z-c),(x-a,y+b,z-c),
         (x-a,y-b,z+c),(x+a,y-b,z+c),(x+a,y+b,z+c),(x-a,y+b,z+c)]
    for ids in ((0,3,2,1),(4,5,6,7),(0,1,5,4),
                (1,2,6,5),(2,3,7,6),(3,0,4,7)):
        polygon([p[i] for i in ids],mat)


def prism(cx,cy,z0,z1,r,mat,sides=12):
    low = [(cx+r*cos(2*pi*i/sides),cy+r*sin(2*pi*i/sides),z0)
           for i in range(sides)]
    high = [(x,y,z1) for x,y,_ in low]
    polygon(tuple(reversed(low)),mat)
    polygon(high,mat)
    for i in range(sides):
        j = (i+1)%sides
        polygon((low[i],low[j],high[j],high[i]),mat)


def column(x,y,z0,z1):
    """Fluted faceted shaft with a tiered plinth and Ionic-like block capital."""
    box(x,y,z0+.20,.84,.84,.40,2)
    box(x,y,z0+.45,.67,.67,.12,3)
    prism(x,y,z0+.51,z1-.40,.34,0,12)
    for dx in (-.23,-.14,-.05,.05,.14,.23):
        box(x+dx,y-.335,(z0+z1)/2+.035,.035,.048,z1-z0-.98,3)
    box(x,y,z1-.31,.70,.70,.18,2)
    box(x,y,z1-.15,.88,.86,.15,3)
    box(x,y,z1-.035,1.04,.92,.09,2)
    for side in (-1,1):
        box(x+side*.37,y-.45,z1-.21,.20,.17,.20,2)


def front_window(x,z,width=.84,height=3.14):
    y = -4.125
    box(x,y,z,width+.23,.15,height+.26,3)
    box(x,y-.10,z,width+.11,.065,height+.10,6)
    box(x,y-.15,z,width*.91,.035,height*.94,4)
    # Larger panes at the bottom, a brighter multi-pane transom above.
    box(x,y-.18,z-height*.18,width*.83,.03,height*.50,5)
    for dx in (-width*.24,width*.24):
        box(x+dx,y-.21,z,.045,.045,height*.95,9)
    for dz in (-height*.12,height*.15,height*.37):
        box(x,y-.21,z+dz,width*.96,.045,.046,9)
    box(x,y-.22,z-height*.55,width+.32,.20,.10,2)
    box(x,y-.19,z+height*.54,width+.28,.15,.13,2)


def side_window(x,y,z,width=.72,height=1.8):
    side = -1 if x < 0 else 1
    box(x+side*.02,y,z,.16,width+.22,height+.21,3)
    box(x+side*.13,y,z,.04,width+.08,height+.08,6)
    box(x+side*.17,y,z,.025,width*.90,height*.91,4)
    for dy in (-width*.20,width*.20):
        box(x+side*.20,y+dy,z,.035,.037,height*.93,9)
    box(x+side*.20,y,z+height*.12,.035,width*.96,.045,9)
    box(x+side*.22,y,z-height*.55,.19,width+.29,.10,2)


GLYPHS = {
    "G": ("01111","10000","10000","10111","10001","10001","01111"),
    "O": ("01110","10001","10001","10001","10001","10001","01110"),
    "T": ("11111","00100","00100","00100","00100","00100","00100"),
    "H": ("10001","10001","10001","11111","10001","10001","10001"),
    "A": ("01110","10001","10001","11111","10001","10001","10001"),
    "M": ("10001","11011","10101","10101","10001","10001","10001"),
    "B": ("11110","10001","10001","11110","10001","10001","11110"),
    "N": ("10001","11001","10101","10101","10011","10001","10001"),
    "K": ("10001","10010","10100","11000","10100","10010","10001"),
}


def pixel_text(text,cx,y,cz,pitch,mat):
    advance = pitch*6
    width = len(text)*advance-pitch
    start = cx-width/2+pitch*2.5
    for index,letter in enumerate(text):
        if letter == " ":
            continue
        for row,bits in enumerate(GLYPHS[letter]):
            for col,bit in enumerate(bits):
                if bit == "1":
                    box(start+index*advance+(col-2)*pitch,y,
                        cz+(3-row)*pitch,pitch*.84,.055,pitch*.84,mat)


def lamp(x,y):
    box(x,y,.51,.48,.48,.52,9)
    box(x,y,1.75,.18,.18,2.18,9)
    box(x,y,2.89,.39,.39,.12,3)
    for side in (-1,1):
        xx=x+side*.41
        box(x+side*.22,y,3.35,.44,.10,.10,9)
        box(xx,y,3.32,.12,.12,.28,9)
        box(xx,y,3.61,.40,.39,.42,12)
        for edge in (-1,1):
            box(xx+edge*.20,y,3.61,.065,.47,.52,9)
        box(xx,y,3.34,.50,.52,.10,9)
        box(xx,y,3.89,.52,.54,.12,9)
        box(xx,y,4.00,.25,.28,.11,3)
    box(x,y,3.98,.14,.14,.48,9)


def lion(cx,cy,flip=1):
    """A seated voxel lion facing the street, with mane, paws and curled tail."""
    z=1.55
    box(cx,cy,z,.61,.83,.52,10)
    box(cx,cy-.25,z+.39,.64,.52,.57,10)
    box(cx,cy-.51,z+.48,.42,.31,.38,10)
    box(cx,cy-.67,z+.39,.30,.19,.15,2)
    for dx in (-.20,.20):
        box(cx+dx,cy-.44,z-.28,.22,.33,.56,10)
        box(cx+dx,cy-.61,z-.52,.26,.30,.13,2)
        box(cx+dx,cy-.38,z+.69,.13,.16,.19,10)
        box(cx+dx*.57,cy-.69,z+.50,.055,.07,.055,9)
    box(cx+flip*.35,cy+.25,z+.01,.18,.20,.47,10)
    box(cx+flip*.44,cy+.34,z+.25,.22,.18,.13,10)
    for i in range(5):
        box(cx-.29+i*.145,cy-.02,z+.56,.09,.14,.17,2)


# Tiled pavement and broad bank foundation.
box(0,0,.15,14.2,12.6,.30,7)
box(0,0,.32,13.85,12.25,.045,11)
for ix in range(-13,14):
    box(ix*.52,-5.42,.35,.025,1.35,.015,3)
for iy in (-6.08,-5.56,-5.04,-4.52):
    box(0,iy,.35,13.6,.025,.015,3)
for side in (-1,1):
    for x in (side*4.40,side*5.00):
        box(x,-5.28,.37,.40,.06,.025,2)
    for y in (-5.58,-5.04):
        box(side*4.70,y,.37,.06,.39,.025,2)

# Main volume and dark recessed roof field.
box(0,.05,3.32,11.15,8.22,6.02,0)
box(0,.05,6.35,11.43,8.47,.20,2)
box(0,.05,6.51,11.20,8.22,.14,1)
box(0,.05,6.63,10.85,7.88,.09,7)
box(0,.52,6.78,4.20,3.05,.22,3)
box(0,.52,6.95,3.35,2.34,.14,7)

# Rusticated base, continuous entablature and deep front facade.
box(0,-4.11,.75,11.52,.30,.83,3)
box(0,-4.18,1.14,11.58,.36,.18,2)
box(0,-4.16,5.80,11.54,.33,.23,2)
box(0,-4.17,6.06,11.75,.45,.20,3)
box(0,-4.19,6.81,11.82,.51,.17,2)
for z in (1.35,2.18,3.01,3.84,4.67,5.50):
    box(-5.60,-.02,z,.13,8.20,.075,3)
    box(5.60,-.02,z,.13,8.20,.075,3)
for side in (-1,1):
    for z in (1.52,2.55,3.58,4.61,5.64):
        box(side*5.50,-4.17,z,.43,.23,.18,2)
    for y in (-3.6,-2.20,-.80,.60,2.00,3.40):
        box(side*5.59,y,3.36,.16,.11,5.65,3)

# Four heavy fluted columns and five glowing facade bays.
for x in (-3.56,-1.20,1.20,3.56):
    column(x,-4.54,1.10,5.89)
for x in (-4.63,-2.36,2.36,4.63):
    front_window(x,3.56,.77,3.37)
front_window(0,4.65,.67,1.26)
for side in (-1,1):
    for y in (-2.80,-.95,.90,2.75):
        side_window(side*5.61,y,3.35,.70,2.03)

# Center double doors with glowing panes and dark bronze frames.
box(0,-4.13,1.62,1.80,.18,2.38,6)
for side in (-1,1):
    box(side*.43,-4.24,1.60,.78,.12,2.17,13)
    box(side*.43,-4.32,1.86,.57,.035,1.38,4)
    box(side*.43,-4.35,2.27,.60,.042,.06,9)
    box(side*.43,-4.36,1.30,.60,.042,.06,9)
    box(side*.18,-4.36,1.51,.07,.08,.17,8)
box(0,-4.38,2.89,2.12,.24,.19,2)

# Sign panel: dark pixel letters recessed into pale stone.
box(0,-4.58,6.40,10.28,.20,.87,3)
box(0,-4.70,6.40,9.87,.045,.67,2)
pixel_text("GOTHAM BANK",0,-4.75,6.41,.119,9)
for side in (-1,1):
    box(side*5.33,-4.63,6.42,.18,.22,.92,3)

# Tiered triangular pediment and clock flanked by pixel gold scrolls.
for i in range(13):
    w=11.10-i*.77
    if w <= .40:
        break
    box(0,-3.98,6.93+i*.119,w,1.55,.119,3 if i%3 else 2)
    box(0,-4.77,6.96+i*.119,w+.04,.10,.07,2)
box(0,-3.90,8.43,.52,1.77,.15,2)
clock_y=-4.86
for iz in range(-7,8):
    for ix in range(-7,8):
        rr=ix*ix+iz*iz
        if rr <= 49:
            mat=9 if rr>=40 else 2 if rr>=32 else 10
            box(ix*.070,clock_y,7.61+iz*.070,.073,.055,.073,mat)
for angle in range(0,360,30):
    a=angle*pi/180
    box(.37*cos(a),clock_y-.054,7.61+.37*sin(a),.055,.035,.055,9)
box(0,clock_y-.06,7.72,.045,.035,.25,9)
box(.08,clock_y-.065,7.61,.20,.035,.044,9)
for side in (-1,1):
    for i in range(8):
        a=i*pi/4
        x=side*(1.62+.32*cos(a))
        z=7.47+.21*sin(a)
        box(x,-4.84,z,.13,.08,.13,8)
    box(side*2.09,-4.84,7.41,.44,.09,.13,8)
    box(side*2.29,-4.84,7.53,.13,.09,.30,8)

# Parapet corner piers, rooftop balustrades and simple paved roof panels.
for side in (-1,1):
    for y in (-3.88,-1.96,0,1.96,3.88):
        box(side*5.52,y,6.99,.43,.42,.74,2)
        box(side*5.52,y,7.40,.58,.56,.12,2)
    for y in (-3.33,-2.84,-2.35,-1.43,-.94,-.45,.45,.94,1.43,2.35,2.84,3.33):
        box(side*5.52,y,6.96,.10,.17,.58,1)
    box(side*5.52,0,7.24,.13,7.56,.10,2)
for x in (-5.52,-3.68,-1.84,0,1.84,3.68,5.52):
    box(x,4.10,7.00,.40,.43,.74,2)
    box(x,4.10,7.40,.55,.55,.12,2)
box(0,4.10,7.24,11.15,.13,.10,2)
for x in (-3.50,3.50):
    for y in (-2.5,-1.5,-.5,.5,1.5,2.5):
        box(x,y,6.68,.03,.87,.022,1)

# Four broad stairs lead from the pavement up to the central portal.
for i in range(5):
    box(0,-5.46+i*.31,.43+i*.15,6.05-i*.18,.37,.17,2)
    box(0,-5.48+i*.31,.50+i*.15,6.12-i*.18,.055,.035,3)
for x in (-3.39,3.39):
    box(x,-5.15,.63,.67,1.02,.58,3)
    box(x,-5.15,.96,.82,1.12,.14,2)
    box(x,-5.15,1.04,.70,.96,.08,10)
    lion(x,-5.10,flip=-1 if x<0 else 1)

# Twin cast-iron street lamps, paired golden lanterns and paving accents.
for x in (-5.42,5.42):
    lamp(x,-5.43)
for side in (-1,1):
    for y in (-4.25,-3.55,-2.85):
        box(side*6.42,y,.40,.16,.52,.12,3)
    for z in (1.30,2.18,3.06,3.94,4.82):
        box(side*5.56,4.00,z,.25,.21,.12,3)

mesh=bpy.data.meshes.new("SM_Gotham_Bank_8bit_Mesh")
mesh.from_pydata(verts,[],faces)
mesh.update()
for mat in M:
    mesh.materials.append(mat)
for face,mid in zip(mesh.polygons,mids):
    face.material_index=mid
building=bpy.data.objects.new("SM_Gotham_Bank_8bit",mesh)
scene.collection.objects.link(building)
building["voxel_step_m"] = .125
building["reference"] = "Neoclassical bank with clock pediment, GOTHAM BANK sign, columns, amber windows, lions and paired lamps"

# Camera and lights remain in the scene but outside the GLB selection.
cam_data=bpy.data.cameras.new("CAM_Gotham_Bank_Hero")
cam=bpy.data.objects.new("CAM_Gotham_Bank_Hero",cam_data)
scene.collection.objects.link(cam)
cam.location=(18,-22,15)
cam.rotation_euler=(Vector((0,0,4.3))-cam.location).to_track_quat("-Z","Y").to_euler()
cam_data.type="ORTHO"
cam_data.ortho_scale=17.8
scene.camera=cam

def area(name,loc,target,energy,color,size):
    data=bpy.data.lights.new(name,"AREA")
    obj=bpy.data.objects.new(name,data)
    scene.collection.objects.link(obj)
    obj.location=loc
    obj.rotation_euler=(Vector(target)-obj.location).to_track_quat("-Z","Y").to_euler()
    data.energy=energy
    data.color=color
    data.shape="DISK"
    data.size=size

area("LGT_Bank_CoolKey",(-9,-9,14),(0,0,4),1900,(.67,.74,1),10)
area("LGT_Bank_Rim",(8,7,11),(0,0,4),1100,(.50,.55,.81),8)
area("LGT_Bank_WarmFront",(2,-8,8),(0,-4,3),560,(1,.68,.35),7)
world=bpy.data.worlds.new("World_Gotham_Bank_Night")
world.use_nodes=True
bg=next(n for n in world.node_tree.nodes if n.type=="BACKGROUND")
bg.inputs["Color"].default_value=(.008,.012,.027,1)
bg.inputs["Strength"].default_value=.40
scene.world=world
scene.render.engine="CYCLES"
scene.cycles.samples=32
scene.render.resolution_x=1024
scene.render.resolution_y=1024
scene.render.resolution_percentage=100
scene.render.image_settings.file_format="PNG"
scene.render.filepath=str(OUT / "gotham_bank_8bit.png")
scene.view_settings.view_transform="Standard"

bpy.ops.object.select_all(action="DESELECT")
building.select_set(True)
bpy.context.view_layer.objects.active=building
for screen in bpy.data.screens:
    if screen.name=="Layout":
        for area in screen.areas:
            if area.type=="VIEW_3D":
                space=area.spaces.active
                space.region_3d.view_location=(0,0,4.3)
                space.region_3d.view_distance=25
                space.region_3d.view_rotation=cam.rotation_euler.to_quaternion()
                space.overlay.show_extras=False

bpy.ops.wm.save_as_mainfile(filepath=str(OUT / "gotham_bank_8bit.blend"))
bpy.ops.export_scene.gltf(filepath=str(OUT / "gotham_bank_8bit.glb"),
                          export_format="GLB",use_selection=True,
                          use_active_scene=True,export_yup=True)
bpy.ops.render.render(write_still=True)
print("Gotham Bank:",len(mesh.polygons),"faces,",
      tuple(round(d,2) for d in building.dimensions))
