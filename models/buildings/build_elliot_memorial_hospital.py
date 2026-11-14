"""Build Elliot Memorial Hospital as a low-poly, pixel-rendered diorama."""

import bpy
import math
import random
from mathutils import Vector
from pathlib import Path

random.seed(23)
OUT = Path('/Users/daniellee/Desktop/somethingcity/models/buildings')

# Build in a fresh scene while leaving the previously saved building files intact.
previous = bpy.context.scene
scene = bpy.data.scenes.new('Elliot Memorial Hospital 8-bit')
bpy.context.window.scene = scene
bpy.data.scenes.remove(previous)
scene.unit_settings.system = 'METRIC'

def material(name, rgb, emission=0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value = (*rgb,1)
    p.inputs['Roughness'].default_value = .84
    p.inputs['Emission Color'].default_value = (*rgb,1)
    p.inputs['Emission Strength'].default_value = emission
    m.diffuse_color = (*rgb,1)
    return m

M = [
    material('MAT_Elliot_BlueStone',(.12,.125,.19)),       # 0
    material('MAT_Elliot_DeepStone',(.055,.060,.10)),      # 1
    material('MAT_Elliot_LimestoneTrim',(.29,.28,.37)),   # 2
    material('MAT_Elliot_Recess',(.024,.03,.053)),         # 3
    material('MAT_Elliot_AmberWindow',(.90,.40,.065),1.35),# 4
    material('MAT_Elliot_DimWindow',(.34,.16,.045),.34),   # 5
    material('MAT_Elliot_TealGlow',(.13,.96,.77),1.45),    # 6
    material('MAT_Elliot_TealDark',(.025,.19,.19)),        # 7
    material('MAT_Elliot_Iron',(.025,.035,.055)),          # 8
    material('MAT_Elliot_RedBeacon',(.98,.05,.025),2.8),   # 9
    material('MAT_Elliot_Paving',(.12,.13,.18)),           # 10
    material('MAT_Elliot_Roof',(.060,.069,.115)),          # 11
    material('MAT_Elliot_WarmLamp',(.96,.57,.13),1.65),    # 12
    material('MAT_Elliot_PaleStone',(.47,.45,.50)),        # 13
    material('MAT_Elliot_GreenUplight',(.57,.82,.45),.60), # 14
    material('MAT_Elliot_Gold',(.76,.56,.23)),             # 15
]

verts, faces, mids = [], [], []

def polygon(points, mat):
    i=len(verts); verts.extend(points)
    faces.append(tuple(range(i,i+len(points))))
    mids.append(mat)

def box(x,y,z,sx,sy,sz,mat):
    a,b,c=sx/2,sy/2,sz/2
    p=[(x-a,y-b,z-c),(x+a,y-b,z-c),(x+a,y+b,z-c),(x-a,y+b,z-c),
       (x-a,y-b,z+c),(x+a,y-b,z+c),(x+a,y+b,z+c),(x-a,y+b,z+c)]
    for q in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]:
        polygon([p[j] for j in q],mat)

def cylinder(cx,cy,z0,z1,r,mat,n=12):
    low=[(cx+r*math.cos(2*math.pi*i/n),cy+r*math.sin(2*math.pi*i/n),z0) for i in range(n)]
    hi=[(x,y,z1) for x,y,_ in low]
    polygon(tuple(reversed(low)),mat); polygon(hi,mat)
    for i in range(n):
        j=(i+1)%n; polygon((low[i],low[j],hi[j],hi[i]),mat)

def face_ring(cx,y,cz,r,thick,outer_mat,inner_mat,n=24):
    outer=[(cx+r*math.cos(2*math.pi*i/n),y,cz+r*math.sin(2*math.pi*i/n)) for i in range(n)]
    inner=[(cx+(r-thick)*math.cos(2*math.pi*i/n),y-.013,cz+(r-thick)*math.sin(2*math.pi*i/n)) for i in range(n)]
    for i in range(n):
        j=(i+1)%n; polygon((outer[i],outer[j],inner[j],inner[i]),outer_mat)
    polygon(inner,inner_mat)

def h_logo(cx,y,cz,r):
    face_ring(cx,y,cz,r,.11,6,7)
    w=r*.18; h=r*1.18
    for dx in [-r*.32,r*.32]: box(cx+dx,y-.045,cz,w,.06,h,6)
    box(cx,y-.05,cz,r*.72,.065,w,6)

def plus_logo(cx,y,cz,r):
    face_ring(cx,y,cz,r,.08,6,7)
    box(cx,y-.05,cz,r*.86,.065,r*.22,6)
    box(cx,y-.05,cz,r*.22,.065,r*.86,6)

def front_window(x,y,z,w=.54,h=1.05,bright=True):
    box(x,y,z,w+.17,.11,h+.19,2)
    box(x,y-.073,z,w+.05,.045,h+.06,3)
    box(x,y-.104,z,w*.88,.025,h*.88,4 if bright else 5)
    box(x,y-.13,z,w*.05,.035,h*.9,8)
    box(x,y-.135,z+.10,w*.92,.033,.045,8)
    box(x,y-.145,z-h*.55,w+.21,.13,.075,2)

def side_window(x,y,z,w=.55,h=1.05,bright=True):
    sign=1 if x>0 else -1
    box(x,y,z,.11,w+.17,h+.19,2)
    box(x+sign*.07,y,z,.04,w+.05,h+.06,3)
    box(x+sign*.10,y,z,.025,w*.88,h*.88,4 if bright else 5)
    box(x+sign*.13,y,z,.035,w*.05,h*.90,8)
    box(x+sign*.14,y,z+.10,.035,w*.92,.045,8)

def beacon(x,y,z):
    box(x,y,z+.26,.085,.085,.52,2)
    box(x,y,z+.58,.18,.18,.13,9)
    box(x,y,z+.68,.10,.10,.07,9)

def lamp(x,y,z=1.95):
    box(x,y,z-.36,.31,.31,.13,8)
    box(x,y,z,.27,.27,.55,12)
    for d in [-.14,.14]:
        box(x+d,y,z,.037,.32,.56,8)
        box(x,y+d,z,.32,.037,.56,8)
    box(x,y,z+.36,.43,.43,.12,8)
    box(x,y,z+.51,.20,.20,.20,2)

def arch_panel(x,y,z,w,h,mat):
    # Faceted arch silhouette, suitable for the retro facade.
    pts=[(x-w/2,y,z-h/2),(x+w/2,y,z-h/2),
         (x+w/2,y,z+h*.16),(x+w*.38,y,z+h*.36),
         (x+w*.18,y,z+h*.50),(x-w*.18,y,z+h*.50),
         (x-w*.38,y,z+h*.36),(x-w/2,y,z+h*.16)]
    polygon(pts,mat)

# Plot, tiled pavement, building foundation.
box(0,0,-.16,15.2,13.2,.32,1)
box(0,0,.035,14.9,12.9,.08,10)
for i in range(-15,16):
    box(i*.48,-5.30,.082,.019,1.70,.012,2)
for y in [-6.15,-5.64,-5.13,-4.62]:
    box(0,y,.082,14.5,.022,.013,1)
box(0,.55,.45,12.35,8.70,.55,1)

# Stepped three-part Art Deco hospital silhouette.
box(0,.63,3.49,12.20,8.45,6.15,0)
box(0,.63,6.64,12.45,8.67,.24,2)
box(0,.63,6.82,12.07,8.33,.14,11)
for s in [-1,1]:
    box(s*4.61,-1.55,4.00,3.40,5.10,7.17,0)
    box(s*4.61,-1.55,7.62,3.68,5.35,.20,2)
    box(s*4.61,-1.55,7.79,3.43,5.10,.13,11)
    box(s*4.61,-1.55,7.98,2.12,2.15,.58,0)
    box(s*4.61,-1.55,8.33,2.36,2.39,.12,2)
    for x in [s*3.00,s*6.15]:
        box(x,-4.14,4.28,.27,.26,6.55,2)
        box(x,-4.14,7.85,.45,.43,.39,2)
    for z in [3.30,5.42,7.27]:
        box(s*4.61,-4.12,z,3.60,.20,.14,2)

# Central taller tower, narrow crown, roof equipment.
box(0,.65,5.50,5.76,7.55,10.17,0)
box(0,.65,10.66,6.06,7.85,.23,2)
box(0,.65,10.84,5.70,7.51,.14,11)
box(0,.88,11.23,3.42,3.88,.65,0)
box(0,.88,11.64,3.72,4.15,.16,2)
box(0,.88,11.81,2.44,2.70,.28,11)
for x in [-2.72,-1.9,1.9,2.72]:
    box(x,-3.26,5.68,.20,.22,9.25,2)
for x in [-2.35,2.35]:
    box(x,-3.30,10.95,.36,.34,.54,2)
    box(x,-3.30,11.27,.48,.45,.10,1)
for z in [4.69,6.73,8.73,10.56]:
    box(0,-3.26,z,5.92,.18,.17,2)
for x in [-1.45,-.73,.73,1.45]:
    box(x,-3.28,6.97,.12,.17,7.15,2)

# Roofline posts and red warning lights.
for x,y,z in [(-6.08,-3.84,7.89),(6.08,-3.84,7.89),
              (-2.70,-3.26,10.78),(2.70,-3.26,10.78),
              (0,-.78,12.05)]:
    box(x,y,z,.32,.32,.46,2)
    box(x,y,z+.27,.44,.44,.12,1)
    beacon(x,y,z+.32)
for x,y,z,sx,sy in [(-4.45,-1.50,8.15,1.95,1.84),(4.45,-1.50,8.15,1.95,1.84),
                    (-1.18,.25,11.17,1.25,1.15),(1.18,.25,11.17,1.25,1.15)]:
    box(x,y,z,sx,sy,.54,0)
    box(x,y,z+.31,sx+.18,sy+.18,.11,2)
    for i in [-1,0,1]:
        box(x+i*sx*.27,y-sy/2-.06,z,.13,.065,.35,6 if abs(x)<2 else 3)
for x in [-1.7,1.7]:
    for y in [1.35,2.55]:
        box(x,y,11.11,.30,.31,.50,0)
        box(x,y,11.42,.43,.42,.11,2)

# Repeated amber window bays and stone pilasters.
for x in [-5.54,-4.65,-3.76,3.76,4.65,5.54]:
    for z in [1.48,2.82,4.38,5.78]:
        front_window(x,-4.17,z,.49,1.07,bright=(random.random()>.15))
for x in [-2.23,-1.45,-.67,.67,1.45,2.23]:
    for z in [5.37,6.57,7.77,9.02,10.06]:
        if abs(x)<1 and z>8.5: continue
        front_window(x,-3.25,z,.46,.94,bright=(random.random()>.18))
    for z in [4.78,5.84]:
        front_window(x,-3.68,z,.47,.82,bright=(random.random()>.16))
for s in [-1,1]:
    for y in [-3.23,-1.97,-.71,.55,1.81,3.07]:
        x=s*(6.34 if y<.10 else 6.13)
        for z in [1.48,2.82,4.38,5.78]:
            side_window(x,y,z,.48,1.02,bright=(random.random()>.2))
    for y in [-2.20,-.91,.38,1.67,2.96]:
        for z in [8.01,9.22]:
            side_window(s*2.95,y,z,.40,.82,bright=(random.random()>.28))
    for y in [-3.38,-2.20,-.91,.38,1.67,2.96,4.10]:
        box(s*6.31,y,3.54,.13,.12,6.11,2)
    for y in [-2.35,-.90,.55,2.0,3.45]:
        box(s*2.91,y,8.35,.10,.11,3.70,2)

# Vertical illuminated bays at the shoulders.
for s in [-1,1]:
    for x in [s*3.76,s*5.45]:
        box(x,-4.29,5.05,.28,.07,2.64,3)
        box(x,-4.34,5.05,.15,.035,2.30,14)
        box(x,-4.40,3.81,.33,.22,.16,2)
        box(x,-4.40,6.30,.32,.21,.16,2)

# Faceted arch arcade on the lower frontage.
for x in [-4.62,-3.13,0,3.13,4.62]:
    arch_panel(x,-4.30,1.69,1.30,2.35,3)
    arch_panel(x,-4.35,1.58,1.00,1.93,1)
    front_window(x,-4.39,1.39,.54,1.06,True)
for x in [-5.43,-3.90,-2.36,2.36,3.90,5.43]:
    box(x,-4.38,1.73,.19,.27,2.54,2)
for x in [-5.30,5.30]:
    box(x,-4.45,2.13,.16,.22,3.0,2)

# Long glowing sign and central hospital emblems.
box(0,-4.48,3.61,10.86,.34,.86,1)
box(0,-4.67,3.61,10.45,.055,.64,7)
box(0,-4.72,4.05,10.95,.09,.07,6)
box(0,-4.72,3.18,10.95,.09,.07,6)
plus_logo(-5.00,-4.74,3.61,.34)
plus_logo(5.00,-4.74,3.61,.34)
h_logo(0,-3.47,8.90,.81)
h_logo(0,-4.68,2.77,.60)

# Main entrance portals and steps.
box(0,-4.45,1.38,2.43,.23,2.34,3)
for s in [-1,1]:
    box(s*.56,-4.60,1.35,1.02,.11,2.04,8)
    box(s*.56,-4.68,1.42,.81,.025,1.76,4)
    box(s*.56,-4.71,2.03,.85,.045,.07,8)
    box(s*.56,-4.71,.79,.85,.045,.07,8)
    box(s*.22,-4.73,1.36,.055,.05,.19,15)
box(0,-4.52,2.54,2.66,.32,.18,2)
box(0,-4.62,2.38,2.13,.12,.07,6)
for i in range(6):
    box(0,-5.51+i*.27,.34+i*.115,3.96-i*.16,.32,.15,2)
for s in [-1,1]:
    x=s*2.04
    box(x,-4.81,.81,.76,.85,1.32,2)
    box(x,-5.27,1.23,.50,.08,.49,1)
    plus_logo(x,-5.34,1.23,.20)
    lamp(s*2.55,-4.57,2.12)

# Caduceus reliefs on the two recessed stone plaques.
for s in [-1,1]:
    x=s*5.32
    arch_panel(x,-4.43,2.77,.79,1.27,1)
    box(x,-4.48,2.75,.07,.05,.91,13)
    box(x,-4.50,3.14,.42,.05,.055,13)
    for z,dx in [(2.43,-.12),(2.55,.12),(2.67,-.11),(2.79,.11),(2.91,-.10),(3.03,.10)]:
        box(x+dx,-4.51,z,.23,.04,.065,13)

# Fence, lanterns, and paved foreground.
def post(x,y):
    box(x,y,.64,.31,.31,1.07,2)
    box(x,y,1.23,.44,.44,.12,1)
    box(x,y,1.36,.16,.16,.19,2)

for x in [-6.94,6.94]:
    for y in [-5.10,-3.72,-2.34,-.96,.42,1.80,3.18,4.56,5.94]: post(x,y)
    for i in range(37):
        y=-5.05+i*.30
        box(x,y,.88,.05,.05,.72,8)
        box(x,y,1.28,.09,.09,.14,13)
    for z in [.78,1.13]: box(x,.40,z,.07,11.1,.07,8)
for x in [-6.94,-5.30,-3.66,-2.02,2.02,3.66,5.30,6.94]: post(x,-5.10)
for i in range(-23,24):
    x=i*.30
    if abs(x)<1.70: continue
    box(x,-5.10,.88,.05,.05,.72,8)
    box(x,-5.10,1.28,.09,.09,.14,13)
for x in [-4.48,4.48]:
    box(x,-5.10,.78,4.6,.07,.07,8)
    box(x,-5.10,1.13,4.6,.07,.07,8)
for x in [-6.94,6.94]: lamp(x,-5.10,2.04)
for x in [-4.52,4.52]: lamp(x,-5.10,1.95)

# Assemble one compact architectural mesh with material slots.
mesh=bpy.data.meshes.new('SM_Elliot_Hospital_Mesh')
mesh.from_pydata(verts,[],faces)
mesh.update()
for m in M: mesh.materials.append(m)
for face,mid in zip(mesh.polygons,mids): face.material_index=mid
building=bpy.data.objects.new('SM_Elliot_Memorial_Hospital_8bit',mesh)
scene.collection.objects.link(building)
building['voxel_step_m']=.125
building['reference']='Art Deco Elliot Memorial Hospital: stepped tower, H logos, teal sign, warm windows and red rooftop beacons'

# Separate real letter geometry makes the long hospital sign legible.
font=bpy.data.curves.new('TXT_Elliot_Hospital_Sign','FONT')
font.body='ELLIOT MEMORIAL HOSPITAL'
font.align_x='CENTER'; font.align_y='CENTER'
font.size=.56; font.extrude=.003; font.bevel_depth=0
label=bpy.data.objects.new('SM_Elliot_Hospital_SignLetters',font)
scene.collection.objects.link(label)
label.location=(0,-4.755,3.60)
label.rotation_euler=(math.pi/2,0,0)
bpy.context.view_layer.update()
if label.dimensions.x>9.1:
    f=9.1/label.dimensions.x; label.scale=(f,f,f)
font.materials.append(M[6])
bpy.ops.object.select_all(action='DESELECT')
label.select_set(True); bpy.context.view_layer.objects.active=label
bpy.ops.object.convert(target='MESH')
label=bpy.context.object

# Fixed isometric hero camera and night lighting.
camdata=bpy.data.cameras.new('CAM_Elliot_Hero')
cam=bpy.data.objects.new('CAM_Elliot_Hero',camdata)
scene.collection.objects.link(cam)
cam.location=(19,-24,19)
cam.rotation_euler=(Vector((0,0,6.15))-cam.location).to_track_quat('-Z','Y').to_euler()
camdata.type='ORTHO'; camdata.ortho_scale=21.5
scene.camera=cam

def area(name,loc,target,power,color,size):
    data=bpy.data.lights.new(name,'AREA')
    obj=bpy.data.objects.new(name,data); scene.collection.objects.link(obj)
    obj.location=loc
    obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
    data.energy=power; data.color=color; data.shape='DISK'; data.size=size

area('LGT_Elliot_MoonKey',(-9,-12,18),(0,0,6),1800,(.62,.69,1),11)
area('LGT_Elliot_CoolRim',(9,8,15),(0,0,6),950,(.40,.62,.89),9)
area('LGT_Elliot_FrontWarm',(0,-9,8),(0,-4,4),430,(1,.63,.33),8)
world=bpy.data.worlds.new('World_Elliot_Night'); world.use_nodes=True
bg=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND')
bg.inputs['Color'].default_value=(.009,.012,.029,1)
bg.inputs['Strength'].default_value=.30
scene.world=world
try: scene.render.engine='CYCLES'
except TypeError: pass
scene.cycles.samples=48
scene.render.resolution_x=1024; scene.render.resolution_y=1024
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.filepath=str(OUT/'elliot_memorial_hospital_8bit_clean.png')
scene.view_settings.view_transform='AgX'
scene.view_settings.look='AgX - Medium High Contrast'
scene.view_settings.exposure=.38

bpy.ops.object.select_all(action='DESELECT')
building.select_set(True); label.select_set(True)
bpy.context.view_layer.objects.active=building
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'elliot_memorial_hospital_8bit.blend'))
print('Hospital scene built:',len(mesh.polygons),'faces;',len(scene.objects),'objects')
