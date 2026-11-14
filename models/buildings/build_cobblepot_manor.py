"""Build an 8-bit Cobblepot Manor diorama from the supplied reference."""

from math import cos, pi, sin
from pathlib import Path

import bpy
from mathutils import Vector

OUT=Path(__file__).resolve().parent
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
scene.name="Cobblepot Manor 8-bit"
scene.unit_settings.system="METRIC"

def material(name,color,emission=0):
    m=bpy.data.materials.new(name)
    m.diffuse_color=(*color,1)
    m.use_nodes=True
    bsdf=next(n for n in m.node_tree.nodes if n.type=="BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value=(*color,1)
    bsdf.inputs["Roughness"].default_value=.92
    if emission:
        bsdf.inputs["Emission Color"].default_value=(*color,1)
        bsdf.inputs["Emission Strength"].default_value=emission
    return m

M=[
    material("MAT_Cobblepot_Stone",(.135,.140,.213)),       # 0
    material("MAT_Cobblepot_Shadow",(.048,.053,.096)),     # 1
    material("MAT_Cobblepot_Trim",(.285,.278,.365)),       # 2
    material("MAT_Cobblepot_Roof",(.078,.083,.145)),       # 3
    material("MAT_Cobblepot_Recess",(.020,.026,.047)),     # 4
    material("MAT_Cobblepot_Amber",(.99,.53,.14),1.2),     # 5
    material("MAT_Cobblepot_AmberDim",(.51,.26,.065),.5), # 6
    material("MAT_Cobblepot_Iron",(.025,.031,.050)),       # 7
    material("MAT_Cobblepot_Garden",(.046,.083,.065)),     # 8
    material("MAT_Cobblepot_Hedge",(.095,.153,.105)),      # 9
    material("MAT_Cobblepot_Paving",(.103,.109,.157)),     # 10
    material("MAT_Cobblepot_Lantern",(.99,.63,.21),1.3),   # 11
    material("MAT_Cobblepot_Penguin",(.78,.77,.75)),       # 12
    material("MAT_Cobblepot_PenguinDark",(.075,.084,.116)),# 13
    material("MAT_Cobblepot_Gold",(.73,.45,.19),.1),       # 14
]

verts,faces,mids=[],[],[]
def polygon(points,mat):
    i=len(verts)
    verts.extend(points)
    faces.append(tuple(range(i,i+len(points))))
    mids.append(mat)

def box(x,y,z,sx,sy,sz,mat):
    a,b,c=sx/2,sy/2,sz/2
    p=[(x-a,y-b,z-c),(x+a,y-b,z-c),(x+a,y+b,z-c),(x-a,y+b,z-c),
       (x-a,y-b,z+c),(x+a,y-b,z+c),(x+a,y+b,z+c),(x-a,y+b,z+c)]
    for ids in ((0,3,2,1),(4,5,6,7),(0,1,5,4),
                (1,2,6,5),(2,3,7,6),(3,0,4,7)):
        polygon([p[j] for j in ids],mat)

def roof(cx,cy,eave,width,depth,rise,mat=3):
    """Stepped voxel gable with a ridge running toward the rear."""
    count=round(rise/.125)
    for i in range(count):
        w=max(.25,width-i*width/count)
        z=eave+.0625+i*.125
        box(cx,cy,z,w,depth,.125,mat)
        if i%4==0:
            box(cx,cy-depth/2-.015,z,w+.10,.07,.045,2)
    box(cx,cy,eave+rise+.05,.18,depth+.14,.13,2)

def hipped(cx,cy,eave,width,depth,rise):
    count=round(rise/.125)
    for i in range(count):
        f=i/count
        box(cx,cy,eave+.0625+i*.125,width*(1-.64*f),depth*(1-.64*f),.125,3)
        if i%5==0:
            box(cx,cy,eave+.10+i*.125,width*(1-.64*f)+.06,depth*(1-.64*f)+.06,.04,2)
    box(cx,cy,eave+rise+.07,width*.30,depth*.30,.15,2)

def window(x,y,z,w=.44,h=1.13,bright=True):
    box(x,y,z,w+.16,.10,h+.17,2)
    box(x,y-.071,z,w+.04,.035,h+.04,4)
    box(x,y-.098,z-h*.09,w*.82,.02,h*.72,5 if bright else 6)
    box(x,y-.101,z+h*.33,w*.56,.02,h*.20,5 if bright else 6)
    box(x,y-.13,z,.045,.03,h*.90,1)
    box(x,y-.13,z+h*.06,w*.90,.035,.045,1)
    box(x,y-.13,z-h*.55,w+.23,.12,.08,2)
    for s in (-1,1):
        box(x+s*(w*.44),y-.06,z+h*.36,.14,.13,.13,2)
    box(x,y-.07,z+h*.55,w*.49,.13,.11,2)

def side_window(x,y,z,w=.43,h=1.13):
    box(x,y,z,.11,w+.16,h+.17,2)
    box(x+.073,y,z,.035,w+.04,h+.04,4)
    box(x+.10,y,z,.023,w*.83,h*.82,5)
    box(x+.13,y,z,.025,.044,h*.85,1)
    box(x+.13,y,z+h*.08,.025,w*.92,.045,1)

def octagon(cx,cy,z0,z1,r,mat):
    low=[(cx+r*cos(pi/8+i*pi/4),cy+r*sin(pi/8+i*pi/4),z0) for i in range(8)]
    high=[(x,y,z1) for x,y,_ in low]
    polygon(tuple(reversed(low)),mat)
    polygon(high,mat)
    for i in range(8):
        j=(i+1)%8
        polygon((low[i],low[j],high[j],high[i]),mat)

def lantern(x,y,z):
    box(x,y,z-.15,.31,.31,.75,2)
    box(x,y,z+.24,.48,.48,.12,1)
    box(x,y,z+.49,.32,.32,.41,11)
    for s in (-1,1):
        box(x+s*.16,y,z+.49,.04,.38,.43,7)
    box(x,y,z+.74,.48,.48,.10,7)
    box(x,y,z+.85,.19,.19,.18,2)

def penguin(x,y):
    box(x,y,2.19,1.08,1.02,.91,2)
    box(x,y,2.69,.87,.82,.14,1)
    box(x,y,3.25,.65,.58,1.02,13)
    box(x,y-.33,3.19,.39,.065,.74,12)
    box(x,y,3.89,.51,.50,.42,12)
    box(x,y-.29,3.93,.28,.16,.22,12)
    box(x,y-.43,3.88,.27,.25,.12,14)
    for s in (-1,1):
        box(x+s*.39,y+.01,3.24,.18,.42,.70,13)
        box(x+s*.21,y-.28,2.78,.23,.39,.11,14)
        box(x+s*.15,y-.33,4.01,.06,.06,.06,4)

# Stone display plinth, clipped garden and tiled entrance path.
box(0,0,.15,20.2,14.7,.30,1)
box(0,0,.34,19.85,14.35,.08,10)
box(0,.02,.43,19.25,13.52,.12,8)
box(0,-5.35,.49,3.60,3.40,.08,10)
for i in range(-3,4):
    box(i*.53,-5.40,.54,.025,3.38,.022,2)
for j in range(7):
    box(0,-6.96+j*.52,.54,3.56,.024,.025,2)

# Main lower house and two strongly articulated wings.
box(0,.82,3.11,10.10,7.34,5.22,0)
box(0,.82,5.75,10.42,7.67,.16,2)
box(0,.82,5.88,10.15,7.39,.12,1)
for s in (-1,1):
    box(s*5.07,.74,3.29,4.50,6.60,5.58,0)
    box(s*5.07,.74,6.12,4.71,6.82,.17,2)
    box(s*5.07,.74,6.28,4.49,6.60,.13,1)
    hipped(s*5.07,.74,6.35,4.85,6.93,2.32)
    for z in (2.42,4.38):
        box(s*5.07,-2.57,z,4.64,.20,.16,2)
    for x in (s*3.73,s*5.01,s*6.29):
        for z in (2.78,4.80):
            window(x,-2.64,z,.40,1.12,bright=(z>4))
    for y in (-1.88,-.66,.56,1.78,3.00):
        side_window(s*7.39 if s>0 else s*7.39,y,3.24,.38,1.02) if s>0 else None
    for x in (s*3.30,s*6.82):
        box(x,-2.66,3.48,.25,.25,5.05,2)
    # A lit gable dormer steps out of each wing roof.
    box(s*5.07,-1.39,8.14,1.20,1.10,1.25,0)
    roof(s*5.07,-1.39,8.76,1.53,1.32,.91)
    window(s*5.07,-1.98,8.15,.35,.85)

# The central entrance hall projects forward; taller mansard makes the focal silhouette.
box(0,-.45,6.73,4.62,5.67,4.08,0)
box(0,-.45,8.82,4.86,5.92,.16,2)
hipped(0,-.45,8.95,5.21,6.22,3.52)
box(0,-.45,12.54,1.97,3.70,.16,2)
for x in (-1.98,1.98):
    box(x,-3.34,6.47,.34,.34,4.57,2)
    box(x,-3.34,8.84,.55,.55,.16,2)
for x in (-1.44,1.44):
    window(x,-3.38,7.45,.37,1.28)
window(0,-3.39,9.82,.80,2.30)
for x in (-.78,.78):
    window(x,-3.39,6.92,.42,1.30)
for x in (-1.24,1.24):
    box(x,-3.36,10.69,.14,.22,.85,2)
box(0,-3.60,8.41,2.48,.65,.17,2)
for x in (-1.16,-.66,-.16,.34,.84,1.16):
    box(x,-3.86,8.71,.13,.15,.53,2)
box(0,-3.86,9.00,2.54,.14,.10,2)
for s in (-1,1):
    box(s*2.35,-1.25,7.62,.76,4.38,3.65,3)
    box(s*2.35,-1.25,9.49,.89,4.57,.11,2)

# Balustraded crown and corner finials make the upper roof read in voxels.
for z,w,d in ((12.65,2.06,3.80),(12.82,1.76,3.50)):
    box(0,-.45,z,w,d,.11,2)
for x in (-.87,.87):
    for y in (-2.10,1.20):
        box(x,y,13.04,.15,.15,.42,2)
        box(x,y,13.30,.26,.26,.10,1)
        box(x,y,13.55,.07,.07,.43,2)
for y in (-2.10,1.20):
    box(0,y,13.04,1.89,.09,.11,2)
for s in (-1,1):
    for y in (-1.84,2.20):
        box(s*6.90,y,8.86,.19,.19,.40,2)
        box(s*6.90,y,9.10,.30,.30,.10,1)
        box(s*6.90,y,9.35,.075,.075,.45,2)

# Chimneys and their clipped stepped caps.
for x,y in ((-4.60,2.68),(4.90,2.77)):
    box(x,y,9.78,.60,.62,2.44,1)
    box(x,y,11.08,.90,.91,.20,2)
    box(x,y,11.23,.49,.51,.17,1)
    box(x,y,11.43,.30,.32,.35,3)
    box(x+.30,y+.16,9.14,.39,.40,1.30,1)
    box(x+.30,y+.16,9.87,.62,.63,.14,2)

# Front porch: arch rhythm, dark door and broad staircase.
box(0,-3.17,3.73,3.39,1.82,3.45,0)
box(0,-4.11,3.24,1.28,.18,2.45,4)
box(0,-4.22,3.16,1.03,.09,2.10,13)
box(0,-4.28,3.15,.045,.07,2.03,2)
for x in (-1.41,-.68,.68,1.41):
    box(x,-4.02,3.69,.25,.28,3.08,2)
    box(x,-4.08,5.31,.42,.39,.18,2)
for x in (-1.07,1.07):
    box(x,-4.10,3.77,.46,.06,1.81,4)
    box(x,-4.15,3.66,.30,.03,1.57,1)
    box(x,-4.14,4.72,.31,.07,.16,2)
for x in (-1.02,0,1.02):
    box(x,-4.08,5.12,.84,.31,.18,2)
box(0,-4.08,5.48,3.76,2.06,.19,2)
for s in (-1,1):
    lantern(s*1.10,-4.28,3.91)
for i in range(6):
    box(0,-5.03-i*.31,1.58-i*.17,4.52+i*.24,.36,.17,2)
for s in (-1,1):
    box(s*2.36,-4.97,2.07,.22,2.73,1.35,2)
    for i in range(5):
        box(s*2.34,-4.03-i*.52,2.77-i*.17,.35,.36,.12,2)
    penguin(s*3.18,-5.55)

# Conservatory on the right: octagonal stone drum and amber paneled dome.
octagon(7.65,1.02,1.21,4.73,1.85,0)
octagon(7.65,1.02,4.73,4.94,2.01,2)
for i in range(8):
    a=pi/8+i*pi/4
    x,y=7.65+1.70*cos(a),1.02+1.70*sin(a)
    box(x,y,3.42,.43,.38,1.67,5)
    box(x,y,3.42,.13,.14,2.40,2)
octagon(7.65,1.02,4.95,5.55,1.79,3)
for i in range(8):
    a=pi/8+i*pi/4
    box(7.65+1.38*cos(a),1.02+1.38*sin(a),5.54,.52,.50,.55,5)
octagon(7.65,1.02,5.55,5.79,1.48,5)
octagon(7.65,1.02,5.79,5.90,1.49,1)
octagon(7.65,1.02,5.90,6.13,1.19,5)
octagon(7.65,1.02,6.13,6.22,1.28,3)
octagon(7.65,1.02,6.22,6.40,.87,2)
octagon(7.65,1.02,6.40,6.52,.42,3)
box(7.65,1.02,6.76,.11,.11,.50,2)
box(7.65,1.02,7.05,.21,.21,.10,1)

# Left loggia with open bays and stone balustrade.
box(-6.65,.60,4.29,2.48,3.34,.20,2)
for x in (-7.61,-5.69):
    for y in (-.65,1.85):
        box(x,y,3.34,.24,.25,1.89,2)
for y in (-.65,1.85):
    box(-6.65,y,4.34,2.58,.26,.17,2)
box(-6.65,.60,4.53,2.81,3.62,.17,2)
hipped(-6.65,.60,4.64,3.06,3.82,1.46)
for x in (-7.40,-6.90,-6.40,-5.90):
    box(x,-.70,2.67,.12,.14,.66,2)
box(-6.65,-.70,3.04,2.38,.14,.11,2)

# Garden hedge blocks and slim cypress silhouettes.
for s in (-1,1):
    for x,y in ((3.20,-1.96),(4.43,-2.04),(5.78,-2.20),(6.86,-1.94)):
        box(s*x,y,1.11,.63,.73,.87,9)
        box(s*x,y,1.55,.42,.47,.40,8)
    for x,y in ((4.34,2.55),(5.42,3.02),(7.52,3.83)):
        box(s*x,y,1.68,.52,.58,1.55,8)
        box(s*x,y,2.54,.38,.43,.61,9)
        box(s*x,y,3.03,.22,.27,.42,8)

# Perimeter iron fence with capped stone piers and a monogrammed front gate.
def pier(x,y):
    box(x,y,1.02,.38,.38,1.33,2)
    box(x,y,1.74,.53,.53,.13,1)
    lantern(x,y,1.69)
for x in (-9.55,-7.55,-5.66,-3.68,3.68,5.66,7.55,9.55):
    pier(x,-6.41)
for s in (-1,1):
    for y in (-4.54,-2.66,-.78,1.10,2.98,4.86):
        pier(s*9.55,y)
    for i in range(18):
        y=-6.12+i*.61
        box(s*9.55,y,1.09,.055,.055,1.01,7)
        box(s*9.55,y,1.62,.09,.10,.18,2)
    for z in (1.0,1.48):
        box(s*9.55,-.74,z,.07,11.10,.07,7)
    for i in range(26):
        x=s*(3.80+i*.22)
        if abs(x)<9.45:
            box(x,-6.41,1.12,.055,.055,1.10,7)
            box(x,-6.41,1.69,.095,.10,.18,2)
    for z in (1.02,1.49):
        box(s*6.61,-6.41,z,5.88,.07,.07,7)
box(0,-6.40,1.13,3.78,.13,1.24,7)
for x in [i*.23 for i in range(-7,8)]:
    box(x,-6.51,1.10,.06,.06,1.10,2)
box(0,-6.51,1.72,3.78,.11,.11,2)
for z,w in ((1.94,3.50),(2.13,3.15),(2.30,2.65)):
    box(0,-6.50,z,w,.13,.10,2)
box(0,-6.61,1.39,.055,.055,1.06,14)
box(0,-6.62,1.30,.55,.06,.08,14)
box(0,-6.62,1.12,.35,.06,.08,14)

mesh=bpy.data.meshes.new("SM_Cobblepot_Manor_8bit_Mesh")
mesh.from_pydata(verts,[],faces)
mesh.update()
for m in M:
    mesh.materials.append(m)
for poly,idx in zip(mesh.polygons,mids):
    poly.material_index=idx
obj=bpy.data.objects.new("SM_Cobblepot_Manor_8bit",mesh)
scene.collection.objects.link(obj)
obj["voxel_step_m"]=.125
obj["reference"]="Gothic manor with mansard roofs, conservatory, penguins and iron gate"

cam_data=bpy.data.cameras.new("CAM_Cobblepot_Hero")
cam=bpy.data.objects.new("CAM_Cobblepot_Hero",cam_data)
scene.collection.objects.link(cam)
cam.location=(21,-29,20)
cam.rotation_euler=(Vector((0,0,6.3))-cam.location).to_track_quat("-Z","Y").to_euler()
cam_data.type="ORTHO"
cam_data.ortho_scale=26.0
scene.camera=cam

def area(name,loc,target,energy,color,size):
    data=bpy.data.lights.new(name,"AREA")
    light=bpy.data.objects.new(name,data)
    scene.collection.objects.link(light)
    light.location=loc
    light.rotation_euler=(Vector(target)-light.location).to_track_quat("-Z","Y").to_euler()
    data.energy=energy
    data.color=color
    data.shape="DISK"
    data.size=size

area("LGT_Cobblepot_Key",(-11,-12,17),(0,0,5),1950,(.60,.69,1),11)
area("LGT_Cobblepot_Rim",(10,9,17),(0,0,6),1200,(.43,.50,.79),10)
area("LGT_Cobblepot_Porch",(1,-9,8),(0,-4,3),450,(1,.69,.39),7)
world=bpy.data.worlds.new("World_Cobblepot_Night")
world.use_nodes=True
bg=next(n for n in world.node_tree.nodes if n.type=="BACKGROUND")
bg.inputs["Color"].default_value=(.007,.009,.022,1)
bg.inputs["Strength"].default_value=.34
scene.world=world
scene.render.engine="CYCLES"
scene.cycles.samples=32
scene.render.resolution_x=1024
scene.render.resolution_y=1024
scene.render.resolution_percentage=100
scene.render.image_settings.file_format="PNG"
scene.render.filepath=str(OUT/"cobblepot_manor_8bit.png")
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
                space.region_3d.view_distance=30
                space.region_3d.view_rotation=cam.rotation_euler.to_quaternion()
                space.overlay.show_extras=False

bpy.ops.wm.save_as_mainfile(filepath=str(OUT/"cobblepot_manor_8bit.blend"))
bpy.ops.export_scene.gltf(filepath=str(OUT/"cobblepot_manor_8bit.glb"),
                          export_format="GLB",use_selection=True,
                          use_active_scene=True,export_yup=True)
bpy.ops.render.render(write_still=True)
print("Cobblepot Manor:",len(mesh.polygons),"faces,",
      tuple(round(d,2) for d in obj.dimensions))
