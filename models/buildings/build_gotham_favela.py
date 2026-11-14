"""Build a Gotham-toned, improvised favela building in an 8-bit diorama style."""

import bpy
import math
import random
from mathutils import Vector
from pathlib import Path

random.seed(31)
OUT=Path('/Users/daniellee/Desktop/somethingcity/models/buildings')

# The previous asset is already saved; create a separate Blender scene and file.
previous=bpy.context.scene
scene=bpy.data.scenes.new('Gotham Favela 8-bit')
bpy.context.window.scene=scene
bpy.data.scenes.remove(previous)
scene.unit_settings.system='METRIC'

def material(name,rgb,emission=0):
    m=bpy.data.materials.new(name);m.use_nodes=True
    p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value=(*rgb,1)
    p.inputs['Roughness'].default_value=.9
    p.inputs['Emission Color'].default_value=(*rgb,1)
    p.inputs['Emission Strength'].default_value=emission
    m.diffuse_color=(*rgb,1)
    return m

M=[
    material('MAT_Favela_AgedConcrete',(.18,.17,.18)),     # 0
    material('MAT_Favela_DeepRecess',(.032,.039,.056)),     # 1
    material('MAT_Favela_StoneEdges',(.34,.32,.32)),       # 2
    material('MAT_Favela_RedBrick',(.19,.090,.077)),       # 3
    material('MAT_Favela_LightBrick',(.29,.13,.095)),      # 4
    material('MAT_Favela_CorrugatedSteel',(.085,.105,.135)),# 5
    material('MAT_Favela_SteelHighlights',(.24,.26,.29)),  # 6
    material('MAT_Favela_Rust',(.31,.13,.070)),             # 7
    material('MAT_Favela_DarkRoof',(.062,.071,.099)),      # 8
    material('MAT_Favela_AmberWindow',(.96,.42,.075),1.4), # 9
    material('MAT_Favela_DimWindow',(.38,.16,.042),.32),   # 10
    material('MAT_Favela_WeatheredWood',(.15,.083,.062)), # 11
    material('MAT_Favela_WarmLamp',(.98,.58,.16),1.8),     # 12
    material('MAT_Favela_Pavement',(.105,.115,.145)),      # 13
    material('MAT_Favela_Smoke',(.077,.081,.105)),         # 14
    material('MAT_Favela_FadedPlaster',(.28,.26,.25)),    # 15
]

verts,faces,mids=[],[],[]

def polygon(points,mat):
    i=len(verts);verts.extend(points)
    faces.append(tuple(range(i,i+len(points))));mids.append(mat)

def box(x,y,z,sx,sy,sz,mat):
    a,b,c=sx/2,sy/2,sz/2
    p=[(x-a,y-b,z-c),(x+a,y-b,z-c),(x+a,y+b,z-c),(x-a,y+b,z-c),
       (x-a,y-b,z+c),(x+a,y-b,z+c),(x+a,y+b,z+c),(x-a,y+b,z+c)]
    for q in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]:
        polygon([p[j] for j in q],mat)

def cylinder(cx,cy,z0,z1,r,mat,n=10):
    lo=[(cx+r*math.cos(2*math.pi*i/n),cy+r*math.sin(2*math.pi*i/n),z0) for i in range(n)]
    hi=[(x,y,z1) for x,y,_ in lo]
    polygon(tuple(reversed(lo)),mat);polygon(hi,mat)
    for i in range(n):
        j=(i+1)%n;polygon((lo[i],lo[j],hi[j],hi[i]),mat)

def cone(cx,cy,z0,z1,r0,r1,mat,n=10):
    lo=[(cx+r0*math.cos(2*math.pi*i/n),cy+r0*math.sin(2*math.pi*i/n),z0) for i in range(n)]
    hi=[(cx+r1*math.cos(2*math.pi*i/n),cy+r1*math.sin(2*math.pi*i/n),z1) for i in range(n)]
    polygon(tuple(reversed(lo)),mat);polygon(hi,mat)
    for i in range(n):
        j=(i+1)%n;polygon((lo[i],lo[j],hi[j],hi[i]),mat)

def tube(a,b,r,mat,n=6):
    a,b=Vector(a),Vector(b);d=(b-a).normalized()
    side=d.cross(Vector((0,0,1)))
    if side.length<.01: side=d.cross(Vector((0,1,0)))
    side.normalize();up=d.cross(side).normalized()
    lo=[tuple(a+r*(side*math.cos(2*math.pi*i/n)+up*math.sin(2*math.pi*i/n))) for i in range(n)]
    hi=[tuple(b+r*(side*math.cos(2*math.pi*i/n)+up*math.sin(2*math.pi*i/n))) for i in range(n)]
    polygon(tuple(reversed(lo)),mat);polygon(hi,mat)
    for i in range(n):
        j=(i+1)%n;polygon((lo[i],lo[j],hi[j],hi[i]),mat)

def roof(x0,x1,y0,y1,zfront,zback,n=20):
    """Patchwork corrugated sheets, with every other rib visibly raised."""
    step=(x1-x0)/n
    choices=[5,5,5,6,7,8]
    for i in range(n):
        xa=x0+i*step;xb=xa+step
        rib=.045 if i%2 else 0
        mat=random.choice(choices)
        polygon(((xa,y0,zfront+rib),(xb,y0,zfront+rib),
                 (xb,y1,zback+rib),(xa,y1,zback+rib)),mat)
        if i%2:
            tube((xa,y0,zfront+rib),(xa,y1,zback+rib),.018,6,4)
    tube((x0,y0,zfront),(x1,y0,zfront),.055,5,4)
    for x in [x0,x1]: tube((x,y0,zfront),(x,y1,zback),.035,8,4)

def front_window(x,y,z,w,h,bright=True):
    box(x,y,z,w+.18,.12,h+.15,1)
    box(x,y-.075,z,w+.04,.045,h+.04,6)
    box(x,y-.109,z,w*.88,.027,h*.88,9 if bright else 10)
    box(x,y-.137,z,w*.05,.035,h*.89,1)
    box(x,y-.14,z+.08,w*.90,.035,.05,1)
    box(x,y-.15,z-h*.54,w+.20,.16,.09,2)

def side_window(x,y,z,w,h,bright=True):
    box(x,y,z,.12,w+.18,h+.15,1)
    box(x+.075,y,z,.045,w+.04,h+.04,6)
    box(x+.109,y,z,.027,w*.88,h*.88,9 if bright else 10)
    box(x+.137,y,z,.035,w*.05,h*.89,1)
    box(x+.14,y,z+.08,.035,w*.90,.05,1)

def vent_front(x,y,z,w=.52,h=.66):
    box(x,y,z,w+.14,.11,h+.14,1)
    box(x,y-.07,z,w,.04,h,5)
    for i in range(5): box(x,y-.11,z-h*.38+i*h*.19,w*.82,.045,.045,1)

def wall_bricks_front(x0,x1,y,z0,z1,rows,prob=.72):
    dz=(z1-z0)/rows
    for row in range(rows):
        count=int((x1-x0)/.33)
        for i in range(count):
            if random.random()>prob:continue
            x=x0+(i+.5+(row%2)*.45)*(x1-x0)/count
            z=z0+(row+.52)*dz
            polygon(((x-.14,y,z-.07),(x+.14,y,z-.07),
                     (x+.14,y,z+.07),(x-.14,y,z+.07)),4 if random.random()<.27 else 3)

def wall_bricks_side(x,y0,y1,z0,z1,rows,prob=.64):
    dz=(z1-z0)/rows
    for row in range(rows):
        count=int((y1-y0)/.35)
        for i in range(count):
            if random.random()>prob:continue
            y=y0+(i+.5+(row%2)*.4)*(y1-y0)/count
            z=z0+(row+.52)*dz
            polygon(((x,y-.14,z-.07),(x,y+.14,z-.07),
                     (x,y+.14,z+.07),(x,y-.14,z+.07)),4 if random.random()<.27 else 3)

# Stone tile plinth and patched walk around the improvised structure.
box(0,0,-.20,11.25,10.25,.40,1)
box(0,0,.035,11.0,10.0,.08,13)
for x in [i*.55 for i in range(-9,10)]:
    box(x,-4.54,.082,.018,.70,.012,2)
for y in [-4.90,-4.36,-3.82]:
    box(0,y,.082,10.8,.018,.012,1)
for x,y in [(-4.35,-4.2),(-3.75,-4.2),(-3.05,-4.2),(-.45,-4.25),(2.4,-4.25)]:
    box(x,y,.095,.61,.47,.018,2)

# Ground floor: concrete service bay and brick corner annex.
box(-1.25,.27,1.82,5.18,5.80,3.38,0)
box(2.55,-.78,1.82,3.05,4.62,3.38,3)
box(-3.58,1.45,1.83,1.38,3.68,3.34,3)
box(-1.18,-2.79,2.05,5.42,.17,2.55,5)
box(2.55,-3.16,2.10,3.10,.18,2.52,3)
wall_bricks_side(4.12,-3.02,1.37,.32,3.43,15,.80)
wall_bricks_front(1.13,3.95,-3.26,.38,3.33,14,.72)
wall_bricks_front(-4.2,-2.95,-.48,.35,3.33,14,.61)
for x in [-2.48,.14,1.08,3.93]:
    box(x,-2.95,1.79,.20,.20,3.35,11)
    box(x,-2.95,.28,.32,.33,.42,2)

# Ground-level shutters, wooden entry and patched canopies.
box(-1.40,-3.04,1.58,2.22,.14,2.44,1)
box(-1.40,-3.15,1.58,1.88,.055,2.21,5)
for i in range(12):
    x=-2.26+i*.16
    box(x,-3.19,1.58,.035,.035,2.20,6 if i%3==0 else 8)
box(1.58,-3.28,1.51,1.06,.14,2.38,1)
box(1.58,-3.38,1.51,.84,.06,2.16,11)
for x in [1.29,1.87]: box(x,-3.43,1.49,.065,.055,2.05,6)
box(1.70,-3.46,1.37,.07,.065,.13,2)
box(1.58,-3.33,.34,1.52,.66,.20,2)
roof(.40,3.88,-3.82,-1.75,3.32,3.82,17)
vent_front(-3.16,-2.98,1.34,.45,.60)
vent_front(3.43,-3.27,2.55,.45,.58)

# Exposed timber/concrete frame under the cantilevered second floor.
for x in [-3.75,-1.00,2.12,3.98]:
    box(x,-2.66,2.06,.23,.26,3.70,11)
    box(x,-2.66,.32,.40,.40,.50,2)
for x in [-3.52,-.80,2.12]:
    tube((x,-2.72,1.05),(x+1.28,-2.72,3.50),.095,11,4)
box(0,-2.63,3.77,8.48,.34,.30,11)
for x in [i*.36-3.82 for i in range(22)]:
    box(x,-2.66,3.54,.15,.40,.20,11)

# Cantilevered upper floor: a broad patchwork concrete-and-metal frontage.
box(-.30,.34,4.99,8.25,6.15,2.73,0)
box(-2.13,-2.81,4.91,4.88,.15,2.52,5)
box(2.03,-2.82,5.00,3.45,.15,2.50,15)
box(4.02,.35,4.99,.16,6.12,2.73,5)
for x in [i*.28-4.14 for i in range(17)]:
    box(x,-2.91,4.90,.032,.040,2.42,6 if random.random()<.32 else 8)
for x in [3.99]:
    for y in [i*.34-2.51 for i in range(17)]:
        box(x+.09,y,4.92,.04,.045,2.54,6 if random.random()<.30 else 8)
for x in [-4.15,-2.75,.13,3.76]:
    box(x,-2.83,5.10,.17,.24,2.70,11)
front_window(-2.66,-2.94,5.28,1.01,1.21)
front_window(-.63,-2.95,5.28,1.27,1.18)
front_window(1.62,-2.96,5.15,.84,1.04)
front_window(3.04,-2.95,5.10,.60,.98)
side_window(4.13,-1.74,5.15,.63,1.08)
side_window(4.13,.17,5.13,.61,1.05)
side_window(4.13,2.02,5.10,.58,1.05)
side_window(4.15,-.67,2.15,.68,1.10)
vent_front(2.80,-2.95,4.05,.41,.51)
roof(-4.49,.48,-3.45,.25,6.58,7.18,22)
roof(.23,4.24,-3.25,.26,6.42,6.93,18)
roof(-4.25,-.55,-.15,3.54,6.48,6.92,18)

# Metal balcony fascia, rails and thin side catwalk.
box(-2.13,-3.27,4.03,4.48,.17,.69,5)
for x in [i*.27-4.18 for i in range(16)]:
    box(x,-3.38,4.02,.045,.035,.61,6 if random.random()<.26 else 8)
box(3.93,-.24,4.02,.18,5.51,.72,5)
for y in [i*.31-2.65 for i in range(16)]:
    box(4.04,y,4.02,.04,.043,.62,6 if random.random()<.26 else 8)

# Off-centre third level and the taller brick lookout room.
box(-1.18,1.15,7.80,4.82,4.80,2.30,5)
box(-2.84,.15,7.80,2.00,3.46,2.30,0)
box(1.58,1.63,8.07,2.72,3.68,2.86,3)
box(-1.25,-1.34,7.79,4.92,.15,2.15,5)
for x in [i*.29-3.57 for i in range(16)]:
    box(x,-1.44,7.78,.04,.04,2.08,6 if random.random()<.28 else 8)
wall_bricks_front(.27,2.88,-.29,6.81,9.40,12,.72)
wall_bricks_side(2.98,-.18,3.44,6.77,9.41,12,.68)
front_window(-2.84,-1.70,7.87,.56,1.12)
front_window(1.49,-.41,8.37,.54,1.07)
side_window(3.08,1.54,8.40,.58,1.13)
roof(-3.91,-1.73,-1.90,1.83,9.07,9.34,11)
roof(-1.15,3.08,-.52,3.40,9.71,10.11,20)

# Open top shack with corrugated canopy, weathered half walls and lit window.
box(1.03,1.53,10.57,2.38,2.61,1.58,11)
box(1.03,-.02,10.55,2.38,.10,1.34,1)
box(1.03,-.09,10.85,.73,.05,.55,9)
side_window(2.28,1.67,10.70,.55,.72)
for x in [-.11,2.16]:
    box(x,-.03,11.54,.12,.16,2.10,11)
box(1.03,2.89,11.45,2.33,.14,2.03,11)
roof(-.36,2.40,-.34,3.05,12.60,12.95,16)
for x in [-.25,2.30]: tube((x,-.18,11.43),(x,2.88,11.43),.045,11,4)

# Left chimney, offset service piping and chimney smoke pixels.
box(-3.16,1.72,8.24,1.42,1.55,2.55,0)
front_window(-3.13,.88,8.32,.50,.67)
box(-3.16,1.72,9.60,1.66,1.75,.18,2)
cylinder(-3.18,1.72,9.63,10.10,.33,8,8)
cone(-3.18,1.72,10.10,10.34,.43,.20,6,8)
for i in range(9):
    x=-3.17-.30*i+.10*math.sin(i*1.7)
    y=1.72+.11*i
    z=10.48+.27*i
    box(x,y,z,.43+.07*(i%3),.35+.05*(i%2),.28,14)
for a,b in [((-4.10,-2.90,.60),(-4.10,-2.90,3.50)),
            ((-4.10,-2.90,3.50),(-4.42,-2.90,3.50)),
            ((-4.42,-2.90,3.50),(-4.42,-2.90,6.26)),
            ((-4.42,-2.90,6.26),(-3.76,-2.90,6.26))]:
    tube(a,b,.105,6,8)
for z in [1.13,2.65,4.42,5.62]:
    box(-4.40,-2.90,z,.22,.27,.10,1)

# Elevated right water tank and its braced steel stand.
for x in [3.06,4.22]:
    for y in [1.22,2.38]:
        tube((x,y,6.74),(x,y,8.48),.07,6,4)
for a,b in [((3.06,1.22,6.84),(4.22,1.22,8.43)),
            ((4.22,1.22,6.84),(3.06,1.22,8.43)),
            ((3.06,2.38,6.84),(4.22,2.38,8.43)),
            ((4.22,2.38,6.84),(3.06,2.38,8.43))]: tube(a,b,.055,5,4)
box(3.64,1.80,8.55,1.53,1.53,.17,1)
cylinder(3.64,1.80,8.65,10.15,.72,5,12)
for z in [8.91,9.39,9.86]:
    cylinder(3.64,1.80,z,z+.08,.75,6,12)
cone(3.64,1.80,10.15,10.47,.82,.12,5,12)
for a,b in [((3.64,1.80,8.65),(4.45,1.80,8.65)),
            ((4.45,1.80,8.65),(4.45,.17,8.65)),
            ((4.45,.17,8.65),(4.45,.17,6.84))]:tube(a,b,.06,6,6)

# Small utility vents, lamps, door light and floor patches.
vent_front(-.10,-3.03,1.27,.52,.61)
vent_front(3.60,-3.27,1.42,.42,.55)
box(1.58,-3.58,2.77,.15,.25,.23,1)
box(1.58,-3.63,2.56,.32,.33,.26,12)
box(1.58,-3.64,2.40,.49,.40,.08,1)
for x in [-3.83,-2.64,-.11,2.18,3.71]:
    for z in [.35,3.76,6.43]:
        if random.random()<.45: box(x,-3.03,z,.42,.08,.16,15)

mesh=bpy.data.meshes.new('SM_Gotham_Favela_Mesh')
mesh.from_pydata(verts,[],faces);mesh.update()
for m in M:mesh.materials.append(m)
for face,mid in zip(mesh.polygons,mids):face.material_index=mid
building=bpy.data.objects.new('SM_Gotham_Favela_8bit',mesh)
scene.collection.objects.link(building)
building['style']='Gotham-toned 8-bit improvised favela building'
building['reference_features']='stacked rooms, corrugated roofs, rust, brick, exposed supports, water tank, chimney smoke, warm windows'

camdata=bpy.data.cameras.new('CAM_Gotham_Favela_Hero')
cam=bpy.data.objects.new('CAM_Gotham_Favela_Hero',camdata)
scene.collection.objects.link(cam)
cam.location=(17,-22,17)
cam.rotation_euler=(Vector((0,0,6.0))-cam.location).to_track_quat('-Z','Y').to_euler()
camdata.type='ORTHO';camdata.ortho_scale=18.2
scene.camera=cam

def area(name,loc,target,power,color,size):
    data=bpy.data.lights.new(name,'AREA')
    obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj)
    obj.location=loc
    obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
    data.energy=power;data.color=color;data.shape='DISK';data.size=size

area('LGT_Favela_CoolKey',(-9,-11,16),(0,0,6),1500,(.57,.67,1),10)
area('LGT_Favela_CoolRim',(8,7,13),(0,0,6),850,(.42,.49,.78),9)
area('LGT_Favela_WarmDoor',(1,-7,5),(0,-3,2),430,(1,.58,.28),7)
world=bpy.data.worlds.new('World_Favela_Night');world.use_nodes=True
bg=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND')
bg.inputs['Color'].default_value=(.009,.012,.026,1);bg.inputs['Strength'].default_value=.31
scene.world=world
try:scene.render.engine='CYCLES'
except TypeError:pass
scene.cycles.samples=48
scene.render.resolution_x=1024;scene.render.resolution_y=1024
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.filepath=str(OUT/'gotham_favela_8bit_clean.png')
scene.view_settings.view_transform='AgX'
scene.view_settings.look='AgX - Medium High Contrast'
scene.view_settings.exposure=.30

bpy.ops.object.select_all(action='DESELECT')
building.select_set(True);bpy.context.view_layer.objects.active=building
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'gotham_favela_8bit.blend'))
print('Favela scene built:',len(mesh.polygons),'faces;',len(scene.objects),'objects')
