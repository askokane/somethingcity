"""Build a clean, 8-bit Batcave exterior based on the moonlit gate reference.

Coordinate system: 1 unit = 1 metre; X is symmetrical, front is -Y.
Run: Blender --background --python build_batcave_exterior.py
"""

import math
from pathlib import Path

import bpy
from mathutils import Vector

OUT = Path(__file__).resolve().parent
STEM = "batcave_exterior_8bit"
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = "Batcave Exterior 8-bit"
scene.unit_settings.system = "METRIC"


def material(name, color, emission=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    shader = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Roughness"].default_value = .83
    if emission:
        shader.inputs["Emission Color"].default_value = (*color, 1)
        shader.inputs["Emission Strength"].default_value = emission
    return m


M = [
    material("MAT_Batcave_Stone", (.28, .285, .34)),       # 0
    material("MAT_Batcave_Trim", (.49, .46, .48)),         # 1
    material("MAT_Batcave_ShadowStone", (.15, .16, .21)),  # 2
    material("MAT_Batcave_Slate", (.055, .068, .115)),     # 3
    material("MAT_Batcave_SlateEdge", (.12, .14, .20)),    # 4
    material("MAT_Batcave_Recess", (.016, .02, .035)),     # 5
    material("MAT_Batcave_Window", (.96, .43, .08), 1.3), # 6
    material("MAT_Batcave_WindowCore", (1, .72, .22), 1.6), # 7
    material("MAT_Batcave_Iron", (.052, .061, .083)),      # 8
    material("MAT_Batcave_Cliff", (.16, .16, .21)),        # 9
    material("MAT_Batcave_CliffEdge", (.25, .24, .29)),    # 10
    material("MAT_Batcave_CaveDark", (.009, .018, .031)), # 11
    material("MAT_Batcave_CaveBlue", (.035, .20, .27), .35), # 12
    material("MAT_Batcave_Garden", (.038, .091, .061)),    # 13
    material("MAT_Batcave_Leaf", (.095, .17, .085)),       # 14
    material("MAT_Batcave_Water", (.075, .44, .56), .38), # 15
    material("MAT_Batcave_WaterBright", (.34, .82, .9), .65), # 16
    material("MAT_Batcave_Lantern", (1, .58, .13), 2.1),  # 17
    material("MAT_Batcave_Path", (.115, .115, .14)),      # 18
    material("MAT_Batcave_Door", (.11, .065, .042)),      # 19
    material("MAT_Batcave_BatGold", (.61, .37, .11), .25), # 20
]


class MeshBuilder:
    def __init__(self, name):
        self.name, self.vertices, self.faces, self.materials = name, [], [], []

    def face(self, points, mat):
        start = len(self.vertices)
        self.vertices.extend(points)
        self.faces.append(tuple(range(start, len(self.vertices))))
        self.materials.append(mat)

    def box(self, x, y, z, sx, sy, sz, mat):
        a,b,c = sx/2,sy/2,sz/2
        v=[(x-a,y-b,z-c),(x+a,y-b,z-c),(x+a,y+b,z-c),(x-a,y+b,z-c),
           (x-a,y-b,z+c),(x+a,y-b,z+c),(x+a,y+b,z+c),(x-a,y+b,z+c)]
        for ids in ((0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)):
            self.face([v[i] for i in ids],mat)

    def taper(self, x, y, z0, z1, w0, d0, w1, d1, mat):
        a=[(x-w0/2,y-d0/2,z0),(x+w0/2,y-d0/2,z0),
           (x+w0/2,y+d0/2,z0),(x-w0/2,y+d0/2,z0)]
        b=[(x-w1/2,y-d1/2,z1),(x+w1/2,y-d1/2,z1),
           (x+w1/2,y+d1/2,z1),(x-w1/2,y+d1/2,z1)]
        self.face(list(reversed(a)),mat)
        self.face(b,mat)
        for i in range(4):
            j=(i+1)%4
            self.face((a[i],a[j],b[j],b[i]),mat)

    def arch(self, x, y, z0, rx, rz, thick, depth, mat, segments=12):
        """Faceted open half-ellipse, with zero geometry in the opening."""
        for i in range(segments):
            a0=math.pi*i/segments
            a1=math.pi*(i+1)/segments
            def p(a, outer, yy):
                return (x+(rx+outer*thick)*math.cos(a),yy,
                        z0+(rz+outer*thick)*math.sin(a))
            front=[p(a0,0,y),p(a1,0,y),p(a1,1,y),p(a0,1,y)]
            back=[(vx,y+depth,vz) for vx,_,vz in front]
            self.face(front,mat)
            self.face(list(reversed(back)),mat)
            for k in range(4):
                j=(k+1)%4
                self.face((front[k],front[j],back[j],back[k]),mat)

    def disk(self, x, y, z, radius, height, mat, sides=12):
        low=[(x+radius*math.cos(2*math.pi*i/sides),
              y+radius*math.sin(2*math.pi*i/sides),z) for i in range(sides)]
        high=[(px,py,z+height) for px,py,_ in low]
        self.face(list(reversed(low)),mat)
        self.face(high,mat)
        for i in range(sides):
            j=(i+1)%sides
            self.face((low[i],low[j],high[j],high[i]),mat)

    def finish(self, col):
        mesh=bpy.data.meshes.new(self.name)
        mesh.from_pydata(self.vertices,[],self.faces)
        mesh.update()
        for m in M: mesh.materials.append(m)
        for poly,mid in zip(mesh.polygons,self.materials):
            poly.material_index=mid
        obj=bpy.data.objects.new("SM_"+self.name,mesh)
        col.objects.link(obj)
        return obj


def collection(name):
    col=bpy.data.collections.new("COL_"+name)
    scene.collection.children.link(col)
    return col


cliff=MeshBuilder("Batcave_CaveAndCliff")
manor=MeshBuilder("Batcave_Manor")
garden=MeshBuilder("Batcave_TerraceGarden")
gate=MeshBuilder("Batcave_ForegroundGate")
detail=MeshBuilder("Batcave_Props")


def roof(cx,cy,eave,w,d,rise,steps=13):
    for i in range(steps):
        f=i/steps
        manor.box(cx,cy,eave+rise*(i+.5)/steps,
                  w*(1-.86*f),d*(1-.75*f),rise/steps+.008,3)
        if i%4==0:
            manor.box(cx,cy,eave+rise*i/steps,w*(1-.86*f)+.08,
                      d*(1-.75*f)+.08,.055,4)
    manor.box(cx,cy,eave+rise+.11,.38,.38,.25,1)
    manor.taper(cx,cy,eave+rise+.24,eave+rise+.68,.20,.20,.04,.04,1)


def window(x,y,z,w=.62,h=1.46,bright=True):
    """A window only on an unobstructed facade bay."""
    manor.box(x,y,z,w+.28,.11,h+.31,1)
    manor.box(x,y-.07,z,w+.09,.025,h+.12,5)
    manor.box(x,y-.094,z,w,.020,h,6 if bright else 5)
    manor.box(x,y-.113,z,.045,.027,h,2)
    manor.box(x,y-.115,z+.13,w,.031,.05,2)
    manor.box(x,y-.09,z-h*.53,w+.37,.16,.11,1)
    manor.taper(x,y-.07,z+h*.56,z+h*.78,w+.48,.24,.12,.11,1)


def side_window(x,y,z,w=.62,h=1.4):
    manor.box(x,y,z,.12,w+.23,h+.28,1)
    manor.box(x+.075,y,z,.022,w+.06,h+.09,5)
    manor.box(x+.098,y,z,.019,w,h,6)
    manor.box(x+.116,y,z,.021,.045,h,2)


def lantern(builder,x,y,z,size=.55):
    builder.box(x,y,z+.17*size,.34*size,.34*size,.34*size,2)
    builder.box(x,y,z+.50*size,.30*size,.30*size,.38*size,17)
    for s in (-1,1):
        builder.box(x+s*.16*size,y,z+.50*size,.045*size,.36*size,.43*size,8)
    builder.box(x,y,z+.76*size,.45*size,.45*size,.10*size,8)
    builder.taper(x,y,z+.81*size,z+1.02*size,.32*size,.32*size,.04*size,.04*size,4)


def cypress(x,y,z,height=2.2):
    garden.box(x,y,z+.32,.35,.35,.65,13)
    garden.taper(x,y,z+.60,z+height,.95,.95,.10,.10,14)


# Cave wall, hollow opening, deep blue passage, and deliberate rock courses.
cliff.box(0,4.8,-.20,43,23,.40,11)
cliff.box(0,4.8,.08,14,21,.16,18)
cliff.box(0,10.8,4.4,14,.16,8.4,11)
for s in (-1,1):
    cliff.box(s*14.15,1.2,5.02,13.7,18.0,10.04,9)
    cliff.box(s*14.15,-7.95,5.0,13.7,.48,10.0,10)
    for row in range(5):
        z=.95+row*1.66
        for col in range(5):
            x=s*(8.0+col*2.72)
            cliff.box(x,-8.31,z,2.55,.18,1.47,9 if (row+col)%3 else 10)
    for x0 in (9.9,15.4):
        x=s*x0
        cliff.box(x,-8.48,4.25,2.1,.16,5.8,5)
        cliff.arch(x,-8.63,6.42,.91,.93,.22,.16,10,7)
        for edge in (-1,1):
            cliff.box(x+edge*1.04,-8.58,4.26,.25,.31,5.75,10)
    for z in (1.10,3.50,6.05,8.60):
        cliff.box(s*14.15,-8.58,z,13.9,.24,.16,10)

cliff.arch(0,-8.4,.75,7.05,7.45,1.32,2.15,10,16)
cliff.arch(0,-4.25,.75,6.75,7.15,.60,.35,12,14)
cliff.arch(0,1.2,.75,5.6,6.3,.38,.25,12,14)
for s in (-1,1):
    cliff.box(s*8.18,-8.46,5.15,2.4,1.15,10.3,9)
    cliff.box(s*8.18,-8.78,9.77,2.7,1.35,.42,10)
    lantern(detail,s*9.4,-9.2,4.0,.95)
for x,y,z,h in ((-5.5,-1.0,6.1,2.7),(-3.2,2.2,5.6,2.5),
                (4.2,-.7,5.75,3.1),(1.0,4.3,5.9,2.1)):
    cliff.taper(x,y,z,z+h,.07,.08,.65,.62,12)
for y,width in ((-7,11.8),(-3,10.2),(1,8.7),(5,7.0)):
    cliff.box(0,y,.16,width,2.25,.09,18)
    for s in (-1,1):
        lantern(detail,s*(width/2-.45),y,.22,.60)

# Supported terrace and a broad, open central overlook.
manor.box(0,1.0,10.31,40.8,18.4,.64,2)
manor.box(0,1.0,10.71,40.2,17.9,.16,1)
manor.box(0,1.0,10.83,39.7,17.3,.10,0)
manor.box(0,-8.13,10.12,40.8,.36,.48,1)
for s in (-1,1):
    manor.box(s*20.15,1.0,10.50,.37,18.1,.40,1)
    for i in range(15):
        x=s*(9.5+i*.70)
        manor.box(x,-8.2,11.34,.20,.23,.82,1)
    manor.box(s*14.45,-8.2,11.83,10.8,.22,.17,1)
    for x0 in (9.2,13.7,18.3):
        x=s*x0
        manor.box(x,-8.25,11.29,.65,.65,1.07,1)
        lantern(detail,x,-8.28,11.86,.70)
    for j in range(13):
        y=-7.9+j*1.36
        manor.box(s*20.2,y,11.31,.22,.21,.78,1)
    manor.box(s*20.2,.3,11.78,.20,17.0,.17,1)

# Mansion shell with only clear, intentionally spaced window bays.
manor.box(0,3.4,16.34,8.6,8.9,11.0,0)
manor.box(0,-1.15,16.34,8.9,.24,11.0,1)
for s in (-1,1):
    manor.box(s*8.5,3.4,15.46,8.4,8.9,9.25,0)
    manor.box(s*8.5,-1.15,15.46,8.55,.24,9.25,1)
    manor.box(s*16.1,3.4,14.23,6.7,8.9,6.80,0)
    manor.box(s*16.1,-1.15,14.23,6.8,.24,6.8,1)
    for z in (13.26,16.28):
        manor.box(s*16.1,-1.3,z,6.95,.34,.21,1)
    for z in (13.18,16.15,19.0):
        manor.box(s*8.5,-1.31,z,8.7,.34,.18,1)
    for x0 in (6.45,9.25):
        for z in (15.0,18.06):
            window(s*x0,-1.31,z,.68,1.52)
    for x0 in (14.8,17.4):
        window(s*x0,-1.31,15.22,.58,1.38)
    for y in (.2,2.7,5.2):
        side_window(19.52,y,15.4,.55,1.39) if s>0 else None
    for x0 in (4.45,12.55,19.2):
        manor.box(s*x0,-1.35,16.1,.28,.38,9.0 if x0<13 else 6.8,1)
    roof(s*8.5,3.4,20.10,8.8,9.15,3.85,13)
    roof(s*16.1,3.4,17.72,6.95,9.15,3.15,11)
    # One roof dormer per main wing, clear of the lower windows.
    manor.box(s*8.5,-.95,21.86,1.48,1.25,1.38,0)
    manor.box(s*8.5,-1.60,21.88,.79,.09,.95,6)
    roof(s*8.5,-.95,22.58,1.66,1.46,.86,5)

for z in (13.20,16.17,19.15,22.0):
    manor.box(0,-1.31,z,9.1,.33,.20,1)
for x in (-2.6,0,2.6):
    window(x,-1.31,20.34,.70,1.72)
for x in (-4.17,4.17):
    manor.box(x,-1.34,16.7,.31,.40,10.35,1)
roof(0,3.4,21.95,9.25,9.35,4.70,15)
manor.box(0,3.4,26.96,2.12,2.05,1.30,1)
manor.box(0,-.05,26.96,.64,.08,.66,6)
roof(0,3.4,27.60,2.35,2.27,1.17,6)

# Arched front door, sheltered entrance, and unobstructed stairs.
manor.box(0,-1.78,13.70,5.20,1.28,5.30,0)
manor.box(0,-2.50,13.63,2.83,.14,3.97,5)
for s in (-1,1):
    manor.box(s*.75,-2.60,13.48,1.37,.10,3.67,19)
    manor.box(s*1.72,-2.55,13.76,.34,.45,5.30,1)
    detail.box(s*.17,-2.69,13.38,.12,.08,.13,20)
    lantern(detail,s*2.37,-2.70,13.1,.62)
manor.arch(0,-2.71,15.11,1.33,1.13,.28,.25,1,8)
manor.box(0,-2.50,16.48,5.8,1.87,.33,1)
manor.taper(0,-2.50,16.61,17.68,5.86,1.86,.10,.20,1)
for i in range(6):
    manor.box(0,-3.45-i*.45,11.18+i*.22,5.70-i*.21,.48,.20,1)

# Fountain is forward of the entrance; planting stays clear of all windows.
garden.disk(0,-5.7,10.90,2.5,.22,2,12)
garden.disk(0,-5.7,11.10,2.18,.07,15,12)
garden.disk(0,-5.7,11.20,1.18,.06,16,12)
garden.box(0,-5.7,11.50,.72,.72,.65,1)
garden.disk(0,-5.7,11.86,.76,.11,15,8)
garden.box(0,-5.7,12.13,.24,.24,.53,1)
garden.disk(0,-5.7,12.45,.30,.06,16,8)
for s in (-1,1):
    garden.box(s*13.6,-5.55,10.91,9.9,2.6,.20,13)
    for j in range(9):
        x=s*(9.8+j*.85)
        garden.box(x,-7.03,11.29,.75,.48,.68,14 if j%2 else 13)
    for x0 in (11.7,18.2):
        cypress(s*x0,-3.55,10.95,2.45)
    for x0 in (10.0,13.5,17.0):
        cypress(s*x0,7.0,10.95,2.0)

# Foreground road and fence. Gate bars remain thin enough to see the cave.
gate.box(0,-16.7,-.12,46,6.5,.24,18)
for i in range(13):
    y=-19.0+i*.45
    gate.box(0,y,.018,45.5,.032,.02,2)
for s in (-1,1):
    for x0 in (7.8,21.4):
        x=s*x0
        gate.box(x,-16.55,1.65,1.24,1.26,3.30,1)
        gate.box(x,-16.55,3.38,1.46,1.45,.22,2)
        gate.box(x,-16.55,3.62,1.54,1.50,.18,1)
        if x0<10:
            lantern(detail,x,-16.55,3.75,1.38)
        else:
            gate.taper(x,-16.55,3.72,4.34,.86,.86,.10,.10,1)
    for j in range(18):
        x=s*(8.45+j*.69)
        gate.box(x,-16.55,1.78,.065,.10,3.14,8)
        gate.taper(x,-16.55,3.35,3.70,.16,.16,.025,.025,20)
    for z in (.75,1.85,3.20):
        gate.box(s*14.55,-16.55,z,13.25,.10,.13,8)
    gate.box(s*14.55,-16.55,.24,13.25,.26,.24,2)
    for x0 in (10.4,14.0,17.6):
        x=s*x0
        gate.box(x,-16.52,2.1,.22,.22,3.9,1)
        gate.box(x,-16.52,4.06,.50,.50,.18,1)
    # Two gate leaves with an arched top profile.
    for j in range(11):
        x=s*(.37+j*.67)
        h=4.45-.10*j
        gate.box(x,-16.60,1.05+h*.37,.075,.14,h*.74,8)
        gate.taper(x,-16.60,1.05+h*.74,1.05+h*.74+.31,.15,.15,.025,.025,20)
    for z in (.78,1.88,3.18):
        gate.box(s*3.78,-16.61,z,7.28,.12,.14,8)
    gate.box(s*3.78,-16.61,.25,7.28,.25,.22,2)
    gate.box(s*.10,-16.70,1.67,.15,.26,3.20,8)
    gate.box(s*.29,-16.77,2.08,.22,.20,.10,20)

# The iron arch joins the two leaves to the inner stone gateposts.
gate.arch(0,-16.82,3.32,6.88,1.08,.12,.15,8,14)

# A single front-facing bat mark, joined to the gate instead of floating.
gate.face([(-2.20,-16.79,2.62),(-1.40,-16.79,3.08),(-.76,-16.79,2.91),
           (-.30,-16.79,3.36),(0,-16.79,3.19),(.30,-16.79,3.36),
           (.76,-16.79,2.91),(1.40,-16.79,3.08),(2.20,-16.79,2.62),
           (1.45,-16.79,2.43),(.80,-16.79,2.24),(0,-16.79,2.41),
           (-.80,-16.79,2.24),(-1.45,-16.79,2.43)],20)
for s in (-1,1):
    garden.box(s*13.7,-18.8,.25,10.2,.63,.43,13)
    for j in range(8):
        x=s*(9.3+j*1.19)
        garden.box(x,-18.8,.58,.80,.73,.47,14)

# Taller foreground ironwork gives the gate the same visual weight as the reference.
for i,(x,y,z) in enumerate(gate.vertices):
    gate.vertices[i]=(x,y,z*1.30 if z>0 else z)
for i,(x,y,z) in enumerate(detail.vertices):
    if y < -12:
        detail.vertices[i]=(x,y,z*1.30 if z>0 else z)

for name,builder in (("Cave",cliff),("Manor",manor),("Garden",garden),
                     ("Gate",gate),("Details",detail)):
    builder.finish(collection(name))

# Reference-matched frontal camera and moonlit palette.
cam_data=bpy.data.cameras.new("CAM_Batcave_Hero")
camera=bpy.data.objects.new("CAM_Batcave_Hero",cam_data)
scene.collection.objects.link(camera)
camera.location=(2.5,-61,26.0)
look=Vector((0,0,14.25))
camera.rotation_euler=(look-Vector(camera.location)).to_track_quat("-Z","Y").to_euler()
cam_data.type="ORTHO"
cam_data.ortho_scale=57.5
scene.camera=camera

def area(name,position,energy,size,color,target=(0,0,13)):
    data=bpy.data.lights.new(name,"AREA")
    obj=bpy.data.objects.new(name,data)
    scene.collection.objects.link(obj)
    obj.location=position
    obj.rotation_euler=(Vector(target)-obj.location).to_track_quat("-Z","Y").to_euler()
    data.energy=energy
    data.shape="DISK"
    data.size=size
    data.color=color

area("LGT_Moon",(-24,-15,37),2600,26,(.63,.73,1.0))
area("LGT_Front",(12,-24,22),1900,26,(.48,.58,.92))
area("LGT_Rim",(2,17,31),1800,19,(.49,.62,.96))
area("LGT_Cave_Blue",(0,-1,7),800,15,(.12,.55,1.0),target=(0,-4,4))
area("LGT_Gate_Warm",(0,-22,8),420,13,(1.0,.54,.24),target=(0,-16,3))
area("LGT_Gate_Fill",(4,-27,11),750,22,(.51,.63,.92),target=(0,-16,2.5))
world=bpy.data.worlds.new("World_Batcave_Night")
scene.world=world
world.use_nodes=True
background=next(n for n in world.node_tree.nodes if n.type=="BACKGROUND")
background.inputs["Color"].default_value=(.008,.015,.032,1)
background.inputs["Strength"].default_value=.27

scene.render.engine="CYCLES"
scene.cycles.samples=32
scene.cycles.use_denoising=True
scene.render.resolution_x=1200
scene.render.resolution_y=800
scene.render.resolution_percentage=100
scene.render.image_settings.file_format="PNG"
scene.render.filepath=str(OUT/(STEM+".png"))
scene.view_settings.view_transform="AgX"
scene.view_settings.look="AgX - Medium High Contrast"
scene.view_settings.exposure=.18
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/(STEM+".blend")))
bpy.ops.object.select_all(action="DESELECT")
assets=[o for o in scene.objects if o.type=="MESH"]
for obj in assets: obj.select_set(True)
bpy.context.view_layer.objects.active=assets[0]
bpy.ops.export_scene.gltf(filepath=str(OUT/(STEM+".glb")),export_format="GLB",
                          use_selection=True,use_active_scene=True,export_yup=True)
bpy.ops.render.render(write_still=True)
print("BUILT",STEM,"meshes",len(assets),
      "triangles",sum(len(poly.vertices)-2 for obj in assets for poly in obj.data.polygons))
