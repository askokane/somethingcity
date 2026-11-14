"""Build an 8-bit Art Deco GCPD headquarters from the supplied reference."""

from math import cos, sin, pi
from pathlib import Path

import bpy
from mathutils import Vector


OUT = Path(__file__).resolve().parent
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = "GCPD Headquarters 8-bit"
scene.unit_settings.system = "METRIC"


def material(name, color, emission=0):
    m=bpy.data.materials.new(name)
    m.diffuse_color=(*color,1)
    m.use_nodes=True
    bsdf=next(n for n in m.node_tree.nodes if n.type=="BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value=(*color,1)
    bsdf.inputs["Roughness"].default_value=.88
    if emission:
        bsdf.inputs["Emission Color"].default_value=(*color,1)
        bsdf.inputs["Emission Strength"].default_value=emission
    return m


M=[
    material("MAT_GCPD_Stone",(.115,.125,.205)),          # 0
    material("MAT_GCPD_Shadow",(.040,.052,.095)),         # 1
    material("MAT_GCPD_Edge",(.24,.24,.335)),             # 2
    material("MAT_GCPD_Recess",(.018,.024,.046)),         # 3
    material("MAT_GCPD_AmberWindow",(.94,.49,.09),1.05),  # 4
    material("MAT_GCPD_AmberDim",(.46,.22,.05),.42),      # 5
    material("MAT_GCPD_SignGold",(.72,.46,.18),.08),      # 6
    material("MAT_GCPD_EagleStone",(.59,.54,.48)),        # 7
    material("MAT_GCPD_Iron",(.025,.030,.052)),           # 8
    material("MAT_GCPD_RedBeacon",(.90,.035,.016),1.55), # 9
    material("MAT_GCPD_SignalFace",(.96,.71,.34),1.4),    # 10
    material("MAT_GCPD_SignalBat",(.020,.026,.043)),     # 11
    material("MAT_GCPD_Pavement",(.095,.105,.16)),        # 12
    material("MAT_GCPD_Lantern",(.98,.62,.16),1.2),       # 13
    material("MAT_GCPD_Roof",(.070,.078,.140)),          # 14
]

verts,faces,mids=[],[],[]


def polygon(points,mat):
    a=len(verts)
    verts.extend(points)
    faces.append(tuple(range(a,a+len(points))))
    mids.append(mat)


def box(x,y,z,sx,sy,sz,mat):
    a,b,c=sx/2,sy/2,sz/2
    p=[(x-a,y-b,z-c),(x+a,y-b,z-c),(x+a,y+b,z-c),(x-a,y+b,z-c),
       (x-a,y-b,z+c),(x+a,y-b,z+c),(x+a,y+b,z+c),(x-a,y+b,z+c)]
    for ids in ((0,3,2,1),(4,5,6,7),(0,1,5,4),
                (1,2,6,5),(2,3,7,6),(3,0,4,7)):
        polygon([p[i] for i in ids],mat)


def prism(cx,cy,z0,z1,r,mat,sides=12):
    low=[(cx+r*cos(2*pi*i/sides),cy+r*sin(2*pi*i/sides),z0)
         for i in range(sides)]
    high=[(x,y,z1) for x,y,_ in low]
    polygon(tuple(reversed(low)),mat)
    polygon(high,mat)
    for i in range(sides):
        j=(i+1)%sides
        polygon((low[i],low[j],high[j],high[i]),mat)


def front_window(x,y,z,width=.60,height=1.45,bright=True):
    box(x,y,z,width+.18,.10,height+.16,2)
    box(x,y-.074,z,width+.055,.04,height+.045,3)
    box(x,y-.104,z,width*.89,.025,height*.90,4 if bright else 5)
    for dx in (-width*.22,width*.22):
        box(x+dx,y-.14,z,.042,.035,height*.94,1)
    box(x,y-.14,z+height*.15,width*.95,.038,.045,1)
    box(x,y-.15,z-height*.55,width+.24,.14,.075,2)


def side_window(x,y,z,width=.65,height=1.35,bright=True):
    s=-1 if x<0 else 1
    box(x+s*.025,y,z,.11,width+.17,height+.15,2)
    box(x+s*.088,y,z,.035,width+.05,height+.045,3)
    box(x+s*.12,y,z,.022,width*.89,height*.90,4 if bright else 5)
    for dy in (-width*.20,width*.20):
        box(x+s*.15,y+dy,z,.035,.040,height*.94,1)
    box(x+s*.15,y,z+height*.15,.035,width*.95,.045,1)


GLYPHS={
    "G":("01111","10000","10000","10111","10001","10001","01111"),
    "C":("01111","10000","10000","10000","10000","10000","01111"),
    "P":("11110","10001","10001","11110","10000","10000","10000"),
    "D":("11110","10001","10001","10001","10001","10001","11110"),
}


def pixel_text(text,cx,y,cz,pitch,mat):
    advance=pitch*6
    start=cx-(len(text)*advance-pitch)/2+pitch*2.5
    for i,letter in enumerate(text):
        for row,bits in enumerate(GLYPHS[letter]):
            for col,bit in enumerate(bits):
                if bit=="1":
                    box(start+i*advance+(col-2)*pitch,y,
                        cz+(3-row)*pitch,pitch*.83,.07,pitch*.83,mat)


def eagle(cx,y,cz):
    """Raised block eagle: head, tapering body, stepped wings and talons."""
    box(cx,y,cz+.53,.26,.20,.27,7)
    box(cx+.13,y-.05,cz+.55,.20,.13,.09,7)
    box(cx,y,cz,.31,.21,.92,7)
    box(cx,y,cz-.49,.25,.20,.25,7)
    for s in (-1,1):
        for i in range(7):
            box(cx+s*(.25+i*.18),y,cz+.27-i*.082,
                .28,.20,.20,7)
            if i>=2:
                box(cx+s*(.25+i*.18),y,cz+.05-i*.10,
                    .13,.15,.22,2)
        box(cx+s*.20,y,cz-.60,.13,.17,.27,7)
        box(cx+s*.31,y-.03,cz-.73,.26,.18,.10,7)


def beacon(x,y,z):
    box(x,y,z+.32,.065,.065,.64,2)
    box(x,y,z+.68,.16,.16,.12,9)
    box(x,y,z+.76,.09,.09,.05,9)


def lamp(x,y):
    box(x,y,.54,.38,.38,.47,2)
    box(x,y,1.55,.15,.15,1.65,8)
    box(x,y,2.42,.32,.32,.13,2)
    box(x,y,2.75,.31,.31,.55,13)
    for s in (-1,1):
        box(x+s*.155,y,2.75,.05,.38,.58,8)
    box(x,y,3.08,.46,.46,.12,8)
    box(x,y,3.21,.23,.23,.15,2)


# Square sidewalk plinth and pixel paving.
box(0,0,.13,14.5,13.0,.26,1)
box(0,0,.29,14.12,12.62,.06,12)
for ix in range(-14,15):
    box(ix*.50,-5.77,.33,.022,1.30,.018,2)
for y in (-6.15,-5.65,-5.15,-4.65):
    box(0,y,.33,13.9,.025,.018,1)

# Low police wings surround an inset, taller entrance block.
box(0,.15,2.80,11.55,8.55,5.10,0)
box(0,.15,5.39,11.78,8.78,.20,2)
box(0,.15,5.56,11.52,8.52,.14,14)
for s in (-1,1):
    box(s*4.55,-1.45,3.18,3.28,5.58,5.45,0)
    box(s*4.55,-1.45,5.93,3.52,5.82,.18,2)
    box(s*4.55,-1.45,6.10,3.28,5.58,.12,14)
    box(s*5.71,-4.22,3.10,.24,.27,5.20,2)
    box(s*3.16,-4.22,3.10,.26,.27,5.20,2)
    for z in (1.16,3.05,4.87):
        box(s*4.55,-4.31,z,3.49,.21,.14,2)
    for y in (-3.35,-2.0,-.65,.70,2.05,3.40):
        box(s*5.77,y,3.08,.20,.17,4.98,2)

# Broad central entrance and tiered Art Deco tower.
box(0,-2.32,3.81,4.70,4.14,6.95,0)
box(0,-2.32,7.30,5.00,4.40,.21,2)
box(0,-2.32,7.48,4.66,4.12,.12,14)
box(0,.54,7.53,3.86,4.46,6.02,0)
box(0,.54,10.55,4.12,4.72,.20,2)
box(0,.54,10.74,3.79,4.38,.15,14)
box(0,.54,10.88,3.55,4.15,.13,2)
box(0,.80,11.15,2.46,2.52,.80,0)
box(0,.80,11.62,2.74,2.80,.14,2)
box(0,.80,11.88,1.84,1.95,.38,0)
box(0,.80,12.10,2.03,2.12,.11,2)
box(0,.80,12.30,1.04,1.12,.30,1)
box(0,.80,12.50,1.17,1.25,.10,2)
box(0,.80,12.78,.32,.32,.48,2)
beacon(0,.80,12.97)
for x in (-1.68,1.68):
    for y in (-1.43,2.43):
        box(x,y,11.15,.29,.30,.55,0)
        box(x,y,11.49,.43,.44,.13,2)
        box(x,y,11.65,.19,.20,.19,1)
    box(x,2.46,11.02,.14,.16,.32,2)
box(0,2.73,11.03,3.56,.13,.24,2)
for x in (-1.89,1.89):
    box(x,.54,11.01,.12,3.65,.19,2)
for s in (-1,1):
    box(s*2.34,-4.36,7.71,.40,.43,.57,0)
    box(s*2.34,-4.36,8.05,.55,.56,.13,2)
    box(s*2.34,-4.36,8.20,.25,.26,.18,1)
for x in (-1.45,-.48,.48,1.45):
    box(x,-4.43,7.67,.21,.24,.37,2)
    box(x,-4.43,7.87,.30,.30,.07,1)
for s in (-1,1):
    box(s*1.86,-1.63,8.97,.27,.24,3.22,2)
    box(s*1.57,-1.62,9.43,.15,.18,2.24,1)
    box(s*2.08,-4.36,4.38,.31,.31,6.78,2)
    box(s*2.34,-4.37,7.13,.45,.45,.53,2)

# Strong continuous cornices and repeated vertical ribs.
for z,sx,sy in ((.86,11.84,8.82),(3.93,11.82,8.80),(5.65,11.98,9.02)):
    box(0,.15,z,sx,sy,.16,2)
for x in (-5.67,-3.12,-2.12,2.12,3.12,5.67):
    box(x,-4.29,2.92,.18,.23,5.22,2)
for x in (-1.48,-.76,.76,1.48):
    box(x,-4.40,4.16,.13,.18,5.70,2)

# Amber windows: tall tower slots above broad gridded station windows.
for s in (-1,1):
    for x in (s*3.82,s*4.75):
        front_window(x,-4.32,2.30,.58,2.20)
        front_window(x,-4.32,4.84,.55,.90,bright=(x<0))
    for y in (-3.22,-1.93,-.64,.65,1.94,3.23):
        side_window(s*5.79,y,2.53,.52,1.64)
    for x in (s*1.03,s*1.70):
        front_window(x,-1.61,8.87,.52,2.56)
        front_window(x,-1.61,6.57,.47,1.32)
    for y in (-.90,.50,1.90):
        side_window(s*1.95,y,8.67,.47,1.95)
for x in (-1.48,-.56,.56,1.48):
    front_window(x,-4.42,5.00,.52,2.60)
for x in (-.62,.62):
    front_window(x,-.48,11.13,.46,.69)

# Main portal, stair landing and a large gold-lettered GCPD plaque.
box(0,-4.44,1.56,2.16,.22,2.50,3)
for s in (-1,1):
    box(s*.51,-4.57,1.54,.91,.12,2.25,8)
    box(s*.51,-4.65,1.88,.72,.025,1.51,4)
    box(s*.51,-4.69,2.28,.75,.04,.06,8)
    box(s*.51,-4.68,1.30,.75,.04,.06,8)
    box(s*.22,-4.69,1.42,.06,.07,.17,6)
box(0,-4.53,2.82,2.56,.27,.18,2)
box(0,-4.50,5.78,3.86,.26,1.06,1)
box(0,-4.65,5.78,3.66,.05,.85,3)
pixel_text("GCPD",0,-4.71,5.80,.155,6)
for i in range(6):
    box(0,-5.76+i*.29,.41+i*.145,4.20-i*.17,.34,.16,2)
    box(0,-5.78+i*.29,.48+i*.145,4.26-i*.17,.045,.03,1)

# Eagle crest and two smaller shield plaques flanking the stairs.
eagle(0,-4.57,7.05)
for s in (-1,1):
    x=s*2.46
    box(x,-4.62,1.12,.82,.58,1.55,2)
    box(x,-4.95,1.30,.57,.075,.68,1)
    box(x,-5.00,1.48,.40,.047,.33,6)
    box(x,-5.01,1.18,.30,.05,.26,6)
    box(x,-5.01,1.04,.16,.05,.12,6)
    box(x,-5.03,1.29,.085,.05,.45,8)

# Bat-Signal on the right roof: angled faceted barrel and a pixel bat mask.
signal_base=Vector((4.14,1.05,6.51))
box(signal_base.x,signal_base.y,6.28,1.45,1.45,.24,2)
box(signal_base.x,signal_base.y,6.50,.68,.72,.38,1)
axis=Vector((.68,-.52,.51)).normalized()
u=Vector((axis.y,-axis.x,0)).normalized()
v=u.cross(axis).normalized()
center=signal_base+Vector((0,0,.58))+axis*.35
rear=center-axis*.87

def ring_points(c,r,n=16):
    return [tuple(c+u*(r*cos(2*pi*i/n))+v*(r*sin(2*pi*i/n)))
            for i in range(n)]

back=ring_points(rear,.82)
front=ring_points(center,1.01)
polygon(tuple(reversed(back)),1)
for i in range(16):
    j=(i+1)%16
    polygon((back[i],back[j],front[j],front[i]),0)
for r,mat in ((1.07,2),(.95,8),(.84,10)):
    c=center+axis*(.015 if r>.84 else .05)
    polygon(ring_points(c,r),mat)
bat_rows=(
    "0000100010000",
    "0000111110000",
    "0111111111110",
    "1111111111111",
    "1110111110111",
    "1100011100011",
    "1000001000001",
)
face_center=center+axis*.072
for row,bits in enumerate(bat_rows):
    for col,bit in enumerate(bits):
        if bit=="1":
            p=face_center+u*((col-6)*.107)+v*((3-row)*.107)
            a=.055
            polygon((tuple(p-u*a-v*a),tuple(p+u*a-v*a),
                     tuple(p+u*a+v*a),tuple(p-u*a+v*a)),11)
# Roof vents, grilles and red aircraft warning beacons.
box(-4.45,-1.58,6.35,2.23,2.12,.42,0)
box(-4.45,-1.58,6.60,2.43,2.32,.13,2)
box(-4.45,-1.58,6.84,1.64,1.57,.36,0)
box(-4.45,-1.58,7.07,1.82,1.74,.11,2)
box(-4.45,-1.58,7.26,.93,.88,.31,1)
box(-4.45,-1.58,7.44,1.08,1.02,.09,2)
for x in (-5.34,-3.56):
    for y in (-2.44,-.72):
        box(x,y,6.79,.19,.19,.38,2)
        box(x,y,7.02,.28,.28,.10,1)
for x in (-4.94,-4.45,-3.96):
    box(x,-2.65,6.85,.23,.055,.36,8)
    box(x,-2.69,6.85,.12,.018,.22,1)
box(4.17,1.05,6.27,2.66,2.49,.22,0)
for y in (-.20,2.30):
    box(4.17,y,6.42,2.92,.16,.18,2)
for x in (2.81,5.53):
    box(x,1.05,6.42,.16,2.66,.18,2)
for x,y in ((2.80,-.20),(5.54,-.20),(2.80,2.30),(5.54,2.30)):
    box(x,y,6.64,.26,.26,.38,0)
    box(x,y,6.88,.36,.36,.12,2)
for x,y,sx,sy in ((-4.20,1.96,1.08,.74),(-3.40,2.40,.72,.62),
                  (4.82,-2.11,.91,.69)):
    box(x,y,5.91,sx,sy,.66,0)
    box(x,y,6.28,sx+.10,sy+.10,.08,2)
    for i in range(3):
        box(x-sx*.30+i*sx*.30,y-sy/2-.04,5.93,.08,.06,.33,1)
for x,y,z in ((-5.14,-3.48,6.10),(5.12,-3.44,6.10),
              (-2.28,.17,7.52),(2.25,.16,7.52),
              (-1.68,-1.43,11.77),(1.68,-1.43,11.77)):
    box(x,y,z,.33,.34,.22,2)
    beacon(x,y,z+.08)

# Perimeter fence, capped piers and four warm lanterns.
def fencepost(x,y):
    box(x,y,.82,.32,.32,1.03,2)
    box(x,y,1.39,.43,.43,.12,1)
    box(x,y,1.55,.19,.19,.22,2)
    box(x,y,1.68,.08,.08,.09,8)

for side in (-1,1):
    for x in (side*6.60,side*5.28,side*3.96):
        fencepost(x,-5.86)
    for y in (-5.86,-4.56,-3.26,-1.96,-.66,.64,1.94,3.24,4.54,5.84):
        fencepost(side*6.60,y)
    for y in [i*.32-5.54 for i in range(36)]:
        box(side*6.60,y,.93,.05,.05,.88,8)
        box(side*6.60,y,1.42,.09,.09,.15,2)
    box(side*6.60,0,.96,.07,11.70,.07,8)
    box(side*6.60,0,1.30,.07,11.70,.07,8)
for x in [i*.34 for i in range(-19,20) if abs(i)>=8]:
    box(x,-5.86,.93,.05,.05,.88,8)
    box(x,-5.86,1.42,.09,.09,.15,2)
for x0,x1 in ((-6.6,-2.7),(2.7,6.6)):
    box((x0+x1)/2,-5.86,.96,x1-x0,.07,.07,8)
    box((x0+x1)/2,-5.86,1.30,x1-x0,.07,.07,8)
for x,y in ((-6.60,-5.86),(6.60,-5.86),(-6.60,5.84),(6.60,5.84)):
    lamp(x,y)

mesh=bpy.data.meshes.new("SM_GCPD_Headquarters_8bit_Mesh")
mesh.from_pydata(verts,[],faces)
mesh.update()
for mat in M:
    mesh.materials.append(mat)
for face,mid in zip(mesh.polygons,mids):
    face.material_index=mid
building=bpy.data.objects.new("SM_GCPD_Headquarters_8bit",mesh)
scene.collection.objects.link(building)
building["voxel_step_m"]=.125
building["reference"]="Art Deco police headquarters with eagle, GCPD sign, amber windows, red beacons and Bat-Signal"

# Hero camera and cool night lighting, with a warm face on the entrance.
cam_data=bpy.data.cameras.new("CAM_GCPD_Hero")
cam=bpy.data.objects.new("CAM_GCPD_Hero",cam_data)
scene.collection.objects.link(cam)
cam.location=(19,-23,18)
cam.rotation_euler=(Vector((0,0,6))-cam.location).to_track_quat("-Z","Y").to_euler()
cam_data.type="ORTHO"
cam_data.ortho_scale=21.8
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

area("LGT_GCPD_CoolKey",(-9,-10,17),(0,0,6),1900,(.60,.68,1),10)
area("LGT_GCPD_Rim",(9,8,14),(0,0,6),1250,(.42,.50,.82),9)
area("LGT_GCPD_WarmEntrance",(1,-9,8),(0,-4,3),540,(1,.71,.37),7)
world=bpy.data.worlds.new("World_GCPD_Night")
world.use_nodes=True
bg=next(n for n in world.node_tree.nodes if n.type=="BACKGROUND")
bg.inputs["Color"].default_value=(.007,.010,.023,1)
bg.inputs["Strength"].default_value=.35
scene.world=world
scene.render.engine="CYCLES"
scene.cycles.samples=32
scene.render.resolution_x=1024
scene.render.resolution_y=1024
scene.render.resolution_percentage=100
scene.render.image_settings.file_format="PNG"
scene.render.filepath=str(OUT / "gcpd_headquarters_8bit.png")
scene.view_settings.view_transform="Standard"

bpy.ops.object.select_all(action="DESELECT")
building.select_set(True)
bpy.context.view_layer.objects.active=building
for screen in bpy.data.screens:
    if screen.name=="Layout":
        for area in screen.areas:
            if area.type=="VIEW_3D":
                space=area.spaces.active
                space.region_3d.view_location=(0,0,6)
                space.region_3d.view_distance=30
                space.region_3d.view_rotation=cam.rotation_euler.to_quaternion()
                space.overlay.show_extras=False

bpy.ops.wm.save_as_mainfile(filepath=str(OUT / "gcpd_headquarters_8bit.blend"))
bpy.ops.export_scene.gltf(filepath=str(OUT / "gcpd_headquarters_8bit.glb"),
                          export_format="GLB",use_selection=True,
                          use_active_scene=True,export_yup=True)
bpy.ops.render.render(write_still=True)
print("GCPD Headquarters:",len(mesh.polygons),"faces,",
      tuple(round(d,2) for d in building.dimensions))
