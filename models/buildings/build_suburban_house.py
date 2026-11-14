"""Build a compact 8-bit suburban house matching the account-building palette.

One Blender unit equals one metre. The lot is 9.7 x 8.9 m; front is -Y.
Run: Blender --background --python build_suburban_house.py
"""

import math
from pathlib import Path

import bpy
from mathutils import Vector

OUT=Path(__file__).resolve().parent
STEM="suburban_house_8bit"
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
scene.name="Suburban House 8-bit"
scene.unit_settings.system="METRIC"


def material(name,color,emission=0):
    m=bpy.data.materials.new(name)
    m.diffuse_color=(*color,1)
    m.use_nodes=True
    shader=next(n for n in m.node_tree.nodes if n.type=="BSDF_PRINCIPLED")
    shader.inputs["Base Color"].default_value=(*color,1)
    shader.inputs["Roughness"].default_value=.86
    if emission:
        shader.inputs["Emission Color"].default_value=(*color,1)
        shader.inputs["Emission Strength"].default_value=emission
    return m


M=[
    material("MAT_Suburb_NavySiding",(.055,.068,.101)),     # 0
    material("MAT_Suburb_SidingEdge",(.094,.107,.139)),     # 1
    material("MAT_Suburb_Trim",(.31,.32,.36)),              # 2
    material("MAT_Suburb_SlateRoof",(.046,.054,.078)),      # 3
    material("MAT_Suburb_RoofHighlight",(.12,.14,.18)),     # 4
    material("MAT_Suburb_Recess",(.018,.023,.037)),         # 5
    material("MAT_Suburb_WindowAmber",(.90,.29,.045),.95), # 6
    material("MAT_Suburb_WindowGold",(1,.71,.24),1.6),    # 7
    material("MAT_Suburb_Iron",(.027,.033,.051)),           # 8
    material("MAT_Suburb_StoneFoundation",(.16,.17,.21)),  # 9
    material("MAT_Suburb_StoneJoint",(.075,.084,.11)),     # 10
    material("MAT_Suburb_Grass",(.052,.097,.062)),          # 11
    material("MAT_Suburb_Leaves",(.095,.095,.12)),          # 12
    material("MAT_Suburb_RustLeaves",(.27,.105,.082)),      # 13
    material("MAT_Suburb_Paving",(.103,.108,.133)),         # 14
    material("MAT_Suburb_Asphalt",(.031,.036,.051)),        # 15
    material("MAT_Suburb_Door",(.10,.069,.049)),            # 16
    material("MAT_Suburb_Lantern",(.99,.57,.17),1.8),       # 17
    material("MAT_Suburb_Greenery",(.045,.112,.066)),       # 18
    material("MAT_Suburb_Flowers",(.46,.145,.09)),          # 19
]


class Builder:
    def __init__(self,name):
        self.name=name
        self.vertices=[]
        self.faces=[]
        self.ids=[]

    def face(self,points,mat):
        start=len(self.vertices)
        self.vertices.extend(points)
        self.faces.append(tuple(range(start,len(self.vertices))))
        self.ids.append(mat)

    def box(self,x,y,z,w,d,h,mat):
        a,b,c=w/2,d/2,h/2
        v=[(x-a,y-b,z-c),(x+a,y-b,z-c),(x+a,y+b,z-c),(x-a,y+b,z-c),
           (x-a,y-b,z+c),(x+a,y-b,z+c),(x+a,y+b,z+c),(x-a,y+b,z+c)]
        for q in ((0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)):
            self.face([v[i] for i in q],mat)

    def taper(self,x,y,z0,z1,w0,d0,w1,d1,mat):
        lo=[(x-w0/2,y-d0/2,z0),(x+w0/2,y-d0/2,z0),
            (x+w0/2,y+d0/2,z0),(x-w0/2,y+d0/2,z0)]
        hi=[(x-w1/2,y-d1/2,z1),(x+w1/2,y-d1/2,z1),
            (x+w1/2,y+d1/2,z1),(x-w1/2,y+d1/2,z1)]
        self.face(list(reversed(lo)),mat)
        self.face(hi,mat)
        for i in range(4):
            j=(i+1)%4
            self.face((lo[i],lo[j],hi[j],hi[i]),mat)

    def finish(self,col):
        mesh=bpy.data.meshes.new(self.name)
        mesh.from_pydata(self.vertices,[],self.faces)
        mesh.update()
        for m in M:mesh.materials.append(m)
        for poly,mid in zip(mesh.polygons,self.ids):poly.material_index=mid
        obj=bpy.data.objects.new("SM_"+self.name,mesh)
        col.objects.link(obj)
        return obj


def collection(name):
    c=bpy.data.collections.new("COL_"+name)
    scene.collection.children.link(c)
    return c


house=Builder("SuburbanHouse_Structure")
roofmesh=Builder("SuburbanHouse_Roofs")
site=Builder("SuburbanHouse_Lot")
porch=Builder("SuburbanHouse_Porch")
foliage=Builder("SuburbanHouse_Foliage")
details=Builder("SuburbanHouse_Details")


def stepped_gable(cx,cy,eave,w,d,rise,steps=11):
    """A pitched roof with a ridge running front to back."""
    for i in range(steps):
        width=w*(1-i/steps*.91)
        z=eave+rise*(i+.5)/steps
        roofmesh.box(cx,cy,z,width,d, rise/steps+.012,3)
        if i%3==0:
            roofmesh.box(cx,cy,z-rise/(2*steps),width+.055,d+.055,.055,4)
        for s in (-1,1):
            roofmesh.box(cx+s*(width/2-.035),cy-d/2-.045,z,
                         .11,.14,rise/steps+.015,2)
    roofmesh.box(cx,cy,eave+rise+.04,.19,d+.09,.12,2)


def front_window(x,y,z,w=.70,h=1.05,shutters=True):
    house.box(x,y,z,w+.18,.12,h+.18,2)
    house.box(x,y-.07,z,w+.06,.025,h+.07,5)
    house.box(x,y-.093,z,w,.020,h,6)
    house.box(x,y-.112,z,.045,.030,h,8)
    house.box(x,y-.113,z+.08,w,.032,.045,8)
    house.box(x,y-.085,z-h*.54,w+.24,.17,.07,2)
    if shutters:
        for s in (-1,1):
            house.box(x+s*(w/2+.13),y-.10,z,.18,.09,h+.08,1)
            for offset in (-.28,-.10,.08,.26):
                house.box(x+s*(w/2+.13),y-.154,z+offset*h,.15,.018,.022,2)


def side_window(x,y,z,w=.65,h=1.0):
    house.box(x,y,z,.11,w+.18,h+.17,2)
    house.box(x+.07,y,z,.022,w+.05,h+.07,5)
    house.box(x+.094,y,z,.018,w,h,6)
    house.box(x+.112,y,z,.020,.045,h,8)


def wall_courses(cx,y,z0,z1,w,rows=7):
    for i in range(1,rows):
        z=z0+(z1-z0)*i/rows
        house.box(cx,y,z,w,.025,.035,1)


def lantern(x,y,z,scale=1):
    details.box(x,y,z,.34*scale,.25*scale,.53*scale,17)
    details.box(x,y-.016,z+.32*scale,.47*scale,.34*scale,.08*scale,8)
    for s in (-1,1):
        details.box(x+s*.18*scale,y-.05,z,.035*scale,.32*scale,.54*scale,8)
    details.box(x,y-.02,z-.34*scale,.45*scale,.32*scale,.08*scale,8)


# Stone edged account-sized tile, with an uncluttered front lawn and driveway.
site.box(0,0,-.20,9.7,8.9,.40,9)
site.box(0,0,.025,9.48,8.68,.06,11)
site.box(2.22,-3.27,.071,4.45,2.22,.045,15)
site.box(-1.47,-3.44,.071,1.47,2.05,.045,14)
for i in range(4):
    y=-4.18+i*.43
    site.box(-1.47,y,.10,1.44,.03,.014,2)
for x in (-4.65,4.65):
    site.box(x,0,.11,.23,8.9,.22,2)
for y in (-4.34,4.34):
    site.box(0,y,.11,9.45,.21,.22,2)
site.box(.0,-2.28,.10,9.30,.07,.15,2)

# Garage and main house shell. Surface courses remain behind the openings.
house.box(1.67,.30,2.28,5.45,5.53,4.18,0)
house.box(1.67,-2.50,2.28,5.53,.16,4.18,1)
house.box(1.65,.98,5.37,5.44,4.45,2.13,0)
house.box(1.65,-1.29,5.37,5.53,.14,2.13,1)
house.box(-3.03,.33,2.18,3.58,5.57,3.98,0)
house.box(-3.03,-2.51,2.18,3.68,.15,3.98,1)
house.box(1.66,.27,.46,5.64,5.76,.45,9)
house.box(-3.03,.32,.44,3.78,5.80,.42,9)
wall_courses(1.67,-2.596,.53,4.30,5.53,9)
wall_courses(1.65,-1.38,4.29,6.44,5.53,5)
wall_courses(-3.03,-2.60,.50,4.13,3.68,7)
for z in (.68,4.17):
    house.box(1.67,-2.64,z,5.63,.22,.12,2)
house.box(-3.03,-2.61,4.13,3.84,.23,.16,2)
for x in (-4.85,-1.22,4.44):
    house.box(x,-2.59,2.20,.12,.25,4.08,2)

# Two clear upper gables, lower left roof, and tidy stepped slate courses.
stepped_gable(.31,.95,6.47,2.72,4.9,1.76,12)
stepped_gable(2.95,.95,6.47,2.91,4.9,1.76,12)
stepped_gable(-3.02,.32,4.22,3.88,5.78,1.67,11)
roofmesh.box(1.65,-1.62,4.33,5.85,1.36,.20,3)
roofmesh.box(1.65,-2.26,4.43,5.97,.18,.11,2)
for cx,w in ((.31,2.72),(2.95,2.91),(-3.02,3.88)):
    y=-1.51 if cx> -1 else -2.62
    roofmesh.box(cx,y,6.49 if cx> -1 else 4.23,w+.17,.13,.17,2)

# Upper windows sit fully in the front gables, away from porch and roof edge.
front_window(.27,-1.405,5.47,.70,1.04)
front_window(2.95,-1.405,5.47,1.22,.99)
front_window(-3.53,-2.608,2.42,.80,1.10)
front_window(-2.56,-2.608,2.42,.41,1.10,False)
for y in (-.70,1.18):
    side_window(4.47,y,5.37,.62,1.0)

# Paneled garage door: one closed panel assembly rather than overlapping windows.
house.box(2.00,-2.70,2.04,3.65,.12,2.99,2)
house.box(2.00,-2.782,2.04,3.37,.05,2.72,5)
house.box(2.00,-2.814,2.04,3.25,.025,2.62,1)
for row in range(3):
    for col in range(3):
        x=.99+col*1.01
        z=1.20+row*.82
        house.box(x,-2.845,z,.87,.028,.61,2)
        house.box(x,-2.865,z,.73,.018,.49,1)
house.box(2.00,-2.89,.60,3.63,.12,.10,8)

# Covered porch on the left, with a readable door and low railing.
porch.box(-2.75,-2.92,.54,4.12,1.30,.19,14)
porch.box(-2.75,-3.53,.40,4.12,.22,.23,2)
for x in (-4.45,-.85):
    details.box(x,-3.45,2.21,.16,.16,3.28,2)
    details.box(x,-3.45,3.91,.26,.26,.15,2)
details.box(-2.75,-3.47,4.09,4.18,.22,.17,2)
roofmesh.box(-2.75,-3.02,4.07,4.25,1.39,.18,3)
roofmesh.box(-2.75,-3.69,4.14,4.28,.15,.10,2)
for x in (-4.25,-3.98,-3.71):
    details.box(x,-3.52,1.22,.06,.07,1.10,2)
details.box(-3.97,-3.52,1.77,.75,.10,.09,2)
details.box(-3.97,-3.52,.72,.75,.10,.08,2)
house.box(-1.70,-2.67,1.90,.95,.06,2.18,16)
house.box(-1.70,-2.713,2.27,.63,.022,.85,5)
house.box(-1.70,-2.738,2.27,.52,.016,.75,6)
details.box(-1.35,-2.773,1.85,.09,.06,.08,7)
for i in range(3):
    porch.box(-1.68,-3.58-i*.24,.43-i*.10,1.16+i*.12,.25,.13,2)
# Blocky wreath is attached to the porch door, not floating in front of it.
for i in range(8):
    a=math.tau*i/8
    details.box(-1.70+.19*math.cos(a),-2.765,2.33+.19*math.sin(a),
                .12,.055,.12,18)
lantern(-.61,-2.70,3.06,.70)
lantern(4.13,-2.70,3.06,.70)

# Compact shrubs and a tree behind the left facade; no windows are covered.
for x,y,w in ((-4.20,-3.04,.55),(-3.82,-3.08,.51),
              (-.53,-2.65,.47),(.13,-2.73,.38),(4.20,2.90,.48)):
    foliage.box(x,y,.44,w,.50,.77,18)
    foliage.box(x,y,.99,w*.80,.43,.40,11)
for x in (-2.55,-2.25,-.32,.03):
    foliage.box(x,-3.17,.18,.20,.22,.22,19)
foliage.box(-4.10,-3.85,2.10,.30,.32,4.10,16)
foliage.box(-4.34,-3.85,3.73,.57,.22,.20,16)
foliage.box(-3.89,-3.84,4.16,.46,.22,.18,16)
foliage.box(-3.62,-3.84,4.35,.77,.22,.18,16)
for dx,dy,z,w,d,h,mid in (
    (-.68,-.03,4.31,.82,.75,.62,13),
    (-.14,.08,4.53,1.04,.87,.72,12),
    (.43,.13,4.41,.78,.74,.57,13),
    (-.72,.16,5.02,.91,.82,.68,13),
    (0,-.12,5.20,1.16,.91,.74,13),
    (.57,.05,5.12,.76,.72,.63,12),
    (-.43,.02,5.79,.98,.84,.65,13),
    (.21,.13,5.91,.83,.73,.57,13),
    (-.08,.06,6.37,.61,.61,.48,12),
):
    foliage.box(-4.10+dx*.65,-3.85+dy,z,w*.65,d,h,mid)
foliage.box(-3.44,-3.83,5.03,.88,.78,.62,13)
foliage.box(-3.27,-3.85,5.61,.70,.67,.54,12)
for x,y in ((-3.20,-4.0),(-2.57,-3.92),(-.45,-3.74),(.25,-3.86)):
    foliage.box(x,y,.18,.30,.27,.20,18)

# The house sits a little farther back than the first pass, leaving front lawn.
for builder in (house,roofmesh,details,porch):
    builder.vertices=[(x,y+.56,z) for x,y,z in builder.vertices]

for name,b in (("House",house),("Roofs",roofmesh),("Lot",site),
               ("Porch",porch),("Foliage",foliage),("Details",details)):
    b.finish(collection(name))

cam_data=bpy.data.cameras.new("CAM_Suburban_Hero")
cam=bpy.data.objects.new("CAM_Suburban_Hero",cam_data)
scene.collection.objects.link(cam)
cam.location=(15,-20,15)
target=Vector((0,0,4.05))
cam.rotation_euler=(target-cam.location).to_track_quat("-Z","Y").to_euler()
cam_data.type="ORTHO"
cam_data.ortho_scale=15.8
scene.camera=cam

def light(name,location,energy,size,color):
    data=bpy.data.lights.new(name,"AREA")
    obj=bpy.data.objects.new(name,data)
    scene.collection.objects.link(obj)
    obj.location=location
    obj.rotation_euler=(Vector((0,0,3.5))-obj.location).to_track_quat("-Z","Y").to_euler()
    data.energy=energy
    data.shape="DISK"
    data.size=size
    data.color=color

light("LGT_Suburb_Moon",(-8,-9,15),1150,11,(.59,.71,1))
light("LGT_Suburb_Fill",(8,-4,9),540,9,(.48,.60,.95))
light("LGT_Suburb_Rim",(3,9,12),900,9,(.55,.63,.92))
world=bpy.data.worlds.new("World_Suburban_Night")
scene.world=world
world.use_nodes=True
bg=next(n for n in world.node_tree.nodes if n.type=="BACKGROUND")
bg.inputs["Color"].default_value=(.007,.012,.025,1)
bg.inputs["Strength"].default_value=.28

scene.render.engine="CYCLES"
scene.cycles.samples=32
scene.cycles.use_denoising=True
scene.render.resolution_x=1024
scene.render.resolution_y=1024
scene.render.resolution_percentage=100
scene.render.image_settings.file_format="PNG"
scene.render.filepath=str(OUT/(STEM+".png"))
scene.view_settings.view_transform="AgX"
scene.view_settings.look="AgX - Medium High Contrast"
scene.view_settings.exposure=.16
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/(STEM+".blend")))
bpy.ops.object.select_all(action="DESELECT")
assets=[o for o in scene.objects if o.type=="MESH"]
for obj in assets:obj.select_set(True)
bpy.context.view_layer.objects.active=assets[0]
bpy.ops.export_scene.gltf(filepath=str(OUT/(STEM+".glb")),export_format="GLB",
                          use_selection=True,use_active_scene=True,export_yup=True)
bpy.ops.render.render(write_still=True)
print("BUILT",STEM,"meshes",len(assets),
      "triangles",sum(len(p.vertices)-2 for o in assets for p in o.data.polygons))
