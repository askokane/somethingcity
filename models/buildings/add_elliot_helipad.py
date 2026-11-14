"""Add a lit rooftop helipad to the existing Elliot Memorial Hospital scene."""

import bpy
import math

scene=bpy.context.scene
assert scene.name.startswith('Elliot Memorial Hospital'), 'Open Elliot Memorial Hospital first'

col=bpy.data.collections.get('COL_Elliot_Helipad')
if col:
    for obj in list(col.objects): bpy.data.objects.remove(obj,do_unlink=True)
    bpy.data.collections.remove(col)
col=bpy.data.collections.new('COL_Elliot_Helipad')
scene.collection.children.link(col)

def material(name, rgb, emission=0):
    m=bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes=True
    p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value=(*rgb,1)
    p.inputs['Roughness'].default_value=.8
    p.inputs['Emission Color'].default_value=(*rgb,1)
    p.inputs['Emission Strength'].default_value=emission
    m.diffuse_color=(*rgb,1)
    return m

deck=material('MAT_Elliot_HelipadDeck',(.047,.075,.092))
edge=material('MAT_Elliot_HelipadEdge',(.31,.35,.39))
mint=material('MAT_Elliot_HelipadMark',(.40,1.0,.82),1.25)
lamp=material('MAT_Elliot_HelipadEdgeLight',(.96,.75,.24),1.7)
dark=bpy.data.materials.get('MAT_Elliot_DeepStone') or deck

def link(obj):
    for c in list(obj.users_collection): c.objects.unlink(obj)
    col.objects.link(obj)
    return obj

def cube(name, loc, dims, mat):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc)
    obj=link(bpy.context.object);obj.name=name;obj.dimensions=dims
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    obj.data.materials.append(mat)
    return obj

def cyl(name, loc, radius, depth, mat, sides=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=sides,radius=radius,depth=depth,location=loc)
    obj=link(bpy.context.object);obj.name=name;obj.data.materials.append(mat)
    return obj

def ring(name,cx,cy,z,outer,inner,mat,n=32):
    verts=[];faces=[]
    for i in range(n):
        a=2*math.pi*i/n
        verts.append((cx+outer*math.cos(a),cy+outer*math.sin(a),z))
        verts.append((cx+inner*math.cos(a),cy+inner*math.sin(a),z))
    for i in range(n):
        j=(i+1)%n
        faces.append((2*i,2*j,2*j+1,2*i+1))
    me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();me.materials.append(mat)
    obj=bpy.data.objects.new(name,me);col.objects.link(obj)
    return obj

cx,cy=0,.88
# The support hides the join with the original roof cap; the octagonal deck
# overhangs it slightly so the landing surface is readable from the hero view.
cube('SM_Helipad_Support',(cx,cy,12.00),(2.50,2.63,.22),dark)
cyl('SM_Helipad_StoneApron',(cx,cy,12.12),1.62,.18,edge,16)
cyl('SM_Helipad_DarkSurface',(cx,cy,12.23),1.48,.055,deck,16)
ring('SM_Helipad_OuterGlowRing',cx,cy,12.266,1.32,1.24,mint)
ring('SM_Helipad_InnerCircle',cx,cy,12.268,.98,.95,edge)

# Large H is raised just enough to avoid z fighting with the deck.
for x in [-.37,.37]:
    cube('SM_Helipad_H_Stem',(x,cy,12.282),(.22,1.12,.025),mint)
cube('SM_Helipad_H_Crossbar',(0,cy,12.282),(.86,.22,.025),mint)

# Segmented landing ticks and eight guarded edge lamps.
for i in range(12):
    a=2*math.pi*i/12
    r=1.11
    x,y=cx+r*math.cos(a),cy+r*math.sin(a)
    mark=cube('SM_Helipad_LandingTick',(x,y,12.276),(.07,.15,.017),edge)
    mark.rotation_euler.z=a-math.pi/2
for i in range(8):
    a=2*math.pi*i/8
    x,y=cx+1.50*math.cos(a),cy+1.50*math.sin(a)
    cyl('SM_Helipad_EdgeLampSocket',(x,y,12.28),.085,.11,dark,8)
    cyl('SM_Helipad_EdgeLamp',(x,y,12.35),.067,.062,lamp,8)

# Two under-deck brackets echo the tower's chunky Art Deco trim.
for x in [-1.10,1.10]:
    cube('SM_Helipad_Corbel',(x,-.21,11.94),(.35,.32,.30),edge)

print('Helipad added:',len(col.objects),'objects')
