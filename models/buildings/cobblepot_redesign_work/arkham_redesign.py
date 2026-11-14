import bpy
import math
import random
from mathutils import Vector

random.seed(19)
scene = bpy.context.scene

# Keep the prior version in the file as a hidden, recoverable collection.
old = bpy.data.collections.get('COL_Original_8bit') or bpy.data.collections.new('COL_Original_8bit')
if old.name not in scene.collection.children:
    scene.collection.children.link(old)
for obj in list(scene.objects):
    if obj.name.startswith('SM_Arkham_Asylum_8bit'):
        for c in list(obj.users_collection): c.objects.unlink(obj)
        old.objects.link(obj)
        obj.hide_render = True
        obj.hide_set(True)
old.hide_render = True

for name in ['COL_Redesign_Architecture','COL_Redesign_Windows','COL_Redesign_Garden','COL_Redesign_Details','COL_Redesign_Lighting']:
    c = bpy.data.collections.get(name)
    if c:
        for obj in list(c.objects): bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.collections.remove(c)
collections = {}
for name in ['Architecture','Windows','Garden','Details','Lighting']:
    c = bpy.data.collections.new('COL_Redesign_'+name)
    scene.collection.children.link(c)
    collections[name] = c

def material(name, color, emission=0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    p = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value = (*color,1)
    p.inputs['Roughness'].default_value = 0.88
    p.inputs['Metallic'].default_value = 0.0
    p.inputs['Emission Color'].default_value = (*color,1)
    p.inputs['Emission Strength'].default_value = emission
    m.diffuse_color = (*color,1)
    return m

stone = material('MAT_Redesign_LavenderStone',(.105,.098,.165))
stone_light = material('MAT_Redesign_EdgeStone',(.24,.22,.32))
stone_dark = material('MAT_Redesign_DarkStone',(.07,.065,.105))
roof = material('MAT_Redesign_SlateRoof',(.032,.036,.074))
roof_light = material('MAT_Redesign_RoofRidge',(.16,.15,.23))
iron = material('MAT_Redesign_Iron',(.055,.065,.105))
gold = material('MAT_Redesign_Brass',(.46,.30,.12))
glass = material('MAT_Redesign_WarmGlass',(.80,.27,.045),1.25)
glass_bright = material('MAT_Redesign_BrightGlass',(.9,.4,.06),1.8)
glass_dark = material('MAT_Redesign_UnlitGlass',(.055,.07,.105),0.0)
leaf = material('MAT_Redesign_DarkFoliage',(.065,.13,.10))
leaf_light = material('MAT_Redesign_FoliageHighlight',(.105,.19,.13))
soil = material('MAT_Redesign_GardenSoil',(.085,.10,.095))
penguin_dark = material('MAT_Redesign_PenguinCharcoal',(.075,.085,.115))
penguin_white = material('MAT_Redesign_PenguinIvory',(.68,.67,.68))
beak = material('MAT_Redesign_PenguinGold',(.95,.49,.09))

def link(obj, collection):
    for c in list(obj.users_collection): c.objects.unlink(obj)
    collections[collection].objects.link(obj)
    return obj

def cube(name, loc, scale, mat, collection='Architecture', bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = link(bpy.context.object, collection)
    o.name = name
    o.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(mat)
    if bevel:
        mod=o.modifiers.new('Soft stone edges','BEVEL'); mod.width=bevel; mod.segments=1
        o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
    return o

def mesh(name, verts, faces, mat, collection='Architecture'):
    d=bpy.data.meshes.new(name); d.from_pydata(verts,[],faces); d.update()
    o=bpy.data.objects.new(name,d); collections[collection].objects.link(o); d.materials.append(mat)
    return o

def cylinder(name, loc, radius, depth, mat, vertices=12, collection='Details'):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc)
    o=link(bpy.context.object,collection); o.name=name; o.data.materials.append(mat); return o

def cone(name, loc, r1, r2, depth, mat, vertices=8, collection='Details'):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=r1, radius2=r2, depth=depth, location=loc)
    o=link(bpy.context.object,collection); o.name=name; o.data.materials.append(mat); return o

def sphere(name, loc, scale, mat, collection='Garden', segments=8, rings=4):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=loc)
    o=link(bpy.context.object,collection); o.name=name; o.scale=scale; o.data.materials.append(mat); return o

def frustum(name, x,y,z0,z1, bottom, top, mat):
    bx,by=bottom; tx,ty=top
    verts=[(x+sx*bx/2,y+sy*by/2,z0) for sx,sy in [(-1,-1),(1,-1),(1,1),(-1,1)]]
    verts += [(x+sx*tx/2,y+sy*ty/2,z1) for sx,sy in [(-1,-1),(1,-1),(1,1),(-1,1)]]
    faces=[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)]
    return mesh(name,verts,faces,mat)

def rod(name,a,b,r,mat,collection='Details',sides=6):
    a,b=Vector(a),Vector(b); d=b-a
    o=cylinder(name,(a+b)/2,r,d.length,mat,sides,collection)
    o.rotation_euler=d.to_track_quat('Z','Y').to_euler()
    return o

def arched_window(name, x,y,z,w,h, side='front', lit=True):
    # Faceted Gothic lancet in a dark recess with a narrow stone surround.
    depth = -0.015 if side=='front' else 0.015
    def pt(u,v,offset):
        return (x+u,offset,z+v) if side=='front' else (offset,y+u,z+v)
    def shape(s,off,mat,suffix):
        q=[(-w*s/2,0),(w*s/2,0),(w*s/2,h*s*.77),(0,h*s),(-w*s/2,h*s*.77)]
        return mesh(name+suffix,[pt(u,v,off) for u,v in q],[(0,1,2,3,4)],mat,'Windows')
    face=y if side=='front' else x
    off0=face+(-.095 if side=='front' else .095)
    off1=face+(-.105 if side=='front' else .105)
    shape(1.22,off0,stone_light,'_ArchTrim')
    shape(1.07,off1,stone_dark,'_Recess')
    shape(0.90,off1+depth,glass if lit else glass_dark,'_Glass')
    for u in [-w*.25,0,w*.25]:
        rod(name+'_Mullion',pt(u,0,off1+depth*1.5),pt(u,h*.76,off1+depth*1.5),.025,iron,'Windows',4)
    rod(name+'_Transom',pt(-w*.43,h*.48,off1+depth*1.5),pt(w*.43,h*.48,off1+depth*1.5),.024,iron,'Windows',4)
    cube(name+'_Sill',pt(0,-.06,off0), (w*1.34,.15,.14) if side=='front' else (.15,w*1.34,.14), stone_light,'Windows')

def trim_band(name,x,y,z,sx,sy):
    cube(name+'_Front',(x,y-sy/2-.06,z),(sx+.22,.18,.16),stone_light)
    cube(name+'_Right',(x+sx/2+.06,y,z),(.18,sy+.22,.16),stone_light)
    cube(name+'_Left',(x-sx/2-.06,y,z),(.18,sy+.22,.16),stone_light)

# Camera and scene frame, set before detail.
target=bpy.data.objects.get('EMPTY_CamTarget_Arkham_Redesign') or bpy.data.objects.new('EMPTY_CamTarget_Arkham_Redesign',None)
if target.name not in collections['Lighting'].objects: collections['Lighting'].objects.link(target)
target.location=(0,0,3.5)
cam=bpy.data.objects.get('CAM_Arkham_Hero') or bpy.data.objects.get('CAM_Arkham_Redesign')
cam.name='CAM_Arkham_Redesign'
cam.location=(20,-27,21)
cam.data.type='ORTHO'; cam.data.ortho_scale=23.8
cam.rotation_euler=(target.location-cam.location).to_track_quat('-Z','Y').to_euler()
scene.camera=cam

# Plinth and grounds. One tile is one metre; pivot at plot centre.
cube('SM_Plot_LowerPlinth',(0,0,-.22),(16,14,.44),stone_dark)
cube('SM_Plot_Coping',(0,0,.035),(15.7,13.7,.13),stone_light)
cube('SM_Garden_Soil',(0,0,.14),(14.9,12.9,.12),soil,'Garden')
cube('SM_Manor_Foundation',(0,1.05,.36),(11.4,7.1,.56),stone_dark)

# A central block and two stepped wings produce the reference's tiered silhouette.
cube('SM_Manor_CentralBlock',(0,1.08,3.02),(4.8,6.05,5.05),stone)
cube('SM_Manor_LeftWing',(-3.75,1.17,2.46),(3.5,5.8,3.98),stone)
cube('SM_Manor_RightWing',(3.75,1.17,2.46),(3.5,5.8,3.98),stone)
cube('SM_Manor_UpperTower',(0,1.28,6.08),(4.3,4.6,1.5),stone)
for x,y,z,sx,sy in [(0,1.08,5.58,4.9,6.1),(-3.75,1.17,4.49,3.6,5.9),(3.75,1.17,4.49,3.6,5.9),(0,1.28,6.82,4.35,4.7)]:
    trim_band('SM_Cornice_'+str(x)+'_'+str(z),x,y,z,sx,sy)

# Mansard roofs and roof caps. The broad central pitch is the hero shape.
frustum('SM_Roof_CentralMansard',0,1.08,5.70,8.65,(5.40,6.48),(2.58,2.78),roof)
frustum('SM_Roof_LeftMansard',-3.75,1.17,4.58,6.27,(3.95,6.22),(2.48,3.03),roof)
frustum('SM_Roof_RightMansard',3.75,1.17,4.58,6.27,(3.95,6.22),(2.48,3.03),roof)
cube('SM_Roof_CentralCap',(0,1.08,8.72),(2.83,3.02,.22),stone_light)
for x in [-3.75,3.75]: cube('SM_Roof_WingRidge',(x,1.17,6.31),(2.7,3.2,.16),roof_light)
for x,y,sx,sy,z in [(0,1.08,5.4,6.48,5.71),(-3.75,1.17,3.95,6.22,4.59),(3.75,1.17,3.95,6.22,4.59)]:
    trim_band('SM_Roof_Eave_'+str(x),x,y,z,sx,sy)

# Stone parapets and pointed finials crown the roof.
for x in [-1.2,1.2]:
    for y in [-.13,2.28]:
        cube('SM_Roof_ParapetPost',(x,y,8.99),(.24,.24,.53),stone_light)
        cone('SM_Roof_Finial',(x,y,9.39),.18,0,.39,stone_light)
for yy in [-.17,2.31]: cube('SM_Roof_ParapetRail',(0,yy,8.97),(2.55,.13,.16),stone_light)
for xx in [-1.2,1.2]: cube('SM_Roof_SideParapet',(xx,1.08,8.97),(.13,2.54,.16),stone_light)
for x in [-5.15,-2.35,2.35,5.15]:
    cone('SM_Wing_Finial',(x,-1.45,6.28),.16,0,.47,stone_light)

# Two tall chimneys, with dark stepped caps and smoke-like roof silhouette.
for x,y in [(-3.55,2.67),(4.45,2.75)]:
    cube('SM_Chimney_Shaft',(x,y,7.08),(.71,.65,2.55),stone)
    cube('SM_Chimney_Collar',(x,y,8.43),(.94,.85,.23),stone_light)
    cube('SM_Chimney_Top',(x,y,8.66),(.76,.69,.20),stone_dark)
    cube('SM_Chimney_DarkOpening',(x,y,8.78),(.43,.42,.05),iron)

# Front door, projecting arched porch and balcony.
cube('SM_Porch_Base',(0,-2.55,1.05),(3.8,2.25,.31),stone_light)
for x in [-1.55,-.52,.52,1.55]:
    cylinder('SM_Porch_Column',(x,-3.49,2.13),.17,2.0,stone_light,8,'Architecture')
    cube('SM_Porch_Capital',(x,-3.49,3.19),(.46,.44,.22),stone_light)
cube('SM_Porch_Entablature',(0,-3.49,3.37),(4.06,.54,.26),stone_light)
cube('SM_Porch_Roof',(0,-2.55,3.65),(4.2,2.42,.23),stone_dark)
cube('SM_Entry_Recess',(0,-2.46,1.79),(1.34,.14,2.23),stone_dark)
cube('SM_Entry_Door',(0,-2.58,1.62),(1.07,.08,1.89),iron)
for x in [-.32,.32]: cube('SM_Door_LeafPanel',(x,-2.64,1.58),(.31,.04,1.46),stone_dark)
for x in [-.22,.22]: sphere('SM_Door_Handle',(x,-2.70,1.58),(.045,.045,.045),gold,'Details')
for x in [-1.62,1.62]:
    cube('SM_Balcony_Post',(x,-3.46,4.15),(.16,.18,.76),stone_light)
for x in [-1.07,-.53,0,.53,1.07]: cube('SM_Balcony_Baluster',(x,-3.48,4.05),(.12,.12,.56),stone_light)
cube('SM_Balcony_Rail',(0,-3.48,4.52),(3.46,.22,.17),stone_light)

# Tall hero window and rows of warm lancet windows.
arched_window('SM_Window_CentralHero',0,-2.08,4.55,1.48,3.18,lit=True)
for x in [-1.72,1.72]: arched_window('SM_Window_TowerNarrow',x,-2.08,4.79,.55,1.7,lit=True)
for x in [-4.88,-3.76,-2.66,2.66,3.76,4.88]:
    for z in [1.04,2.78]: arched_window('SM_Window_Front',x,-1.81,z,.60,1.23,lit=True)
for y in [-.93,.48,1.91,3.28]:
    for z in [1.05,2.8]: arched_window('SM_Window_RightSide',5.53,y,z,.56,1.25,'right',lit=True)

# Faceted dormers break up all three roof planes.
for x,y,z in [(-4.48,-1.43,5.10),(-2.91,-1.43,5.10),(2.91,-1.43,5.10),(4.48,-1.43,5.10),(-1.05,-1.05,6.48),(1.05,-1.05,6.48)]:
    cube('SM_Dormer_Base',(x,y,z+.36),(.82,.68,.83),stone)
    arched_window('SM_Dormer_Window',x,y-.37,z,.39,.67,lit=True)
    frustum('SM_Dormer_Roof',x,y,z+.77,z+1.38,(1.09,.92),(.20,.25),roof)
    cone('SM_Dormer_Finial',(x,y,z+1.47),.12,0,.28,stone_light)

# Left open veranda, right glowing polygonal conservatory.
cube('SM_LeftVeranda_Platform',(-5.67,-2.25,1.02),(2.72,2.3,.27),stone_light)
for xx in [-6.76,-4.58]:
    for yy in [-3.28,-1.26]:
        cylinder('SM_Veranda_Column',(xx,yy,2.07),.13,1.9,stone_light,8,'Architecture')
cube('SM_Veranda_Canopy',(-5.67,-2.26,3.10),(2.95,2.53,.23),roof)
frustum('SM_Veranda_Roof',-5.67,-2.26,3.23,4.03,(3.03,2.57),(1.42,1.2),roof)
for yy in [-3.25,-1.25]:
    cube('SM_Veranda_Rail',(-5.67,yy,1.39),(2.52,.11,.11),stone_light)

cx,cy=5.9,-2.18
cylinder('SM_Conservatory_Base',(cx,cy,1.16),1.75,.52,stone,12,'Architecture')
for i in range(12):
    a=2*math.pi*i/12
    b=2*math.pi*(i+1)/12
    x1,y1=cx+1.56*math.cos(a),cy+1.56*math.sin(a)
    x2,y2=cx+1.56*math.cos(b),cy+1.56*math.sin(b)
    mesh('SM_Conservatory_GlassPane',[(x1,y1,1.43),(x2,y2,1.43),(x2,y2,3.25),(x1,y1,3.25)],[(0,1,2,3)],glass,'Windows')
    rod('SM_Conservatory_Mullion',(x1,y1,1.43),(x1,y1,3.25),.055,stone_light)
    rod('SM_Conservatory_Cornice',(x1,y1,3.28),(x2,y2,3.28),.07,stone_light)
    rod('SM_Conservatory_DomeRib',(x1,y1,3.28),(cx,cy,4.17),.065,roof_light)
cylinder('SM_Conservatory_DomeFinial',(cx,cy,4.21),.11,.27,stone_light,8)
cone('SM_Conservatory_DomePoint',(cx,cy,4.46),.17,0,.35,stone_light)

# Grand steps, landing and paired penguin sentinels.
for i in range(7):
    cube('SM_Entry_Step_'+str(i),(0,-3.72-.36*i,.85-.115*i),(3.5+.22*i,.38,.18),stone_light)
for side in [-1,1]:
    x=side*2.18
    cube('SM_Stair_Balustrade',(x,-4.71,.66),(.36,3.0,.30),stone_light)
    cube('SM_Penguin_Pedestal',(side*2.39,-3.79,1.24),(.9,.9,1.25),stone)
    cube('SM_Penguin_PedestalCap',(side*2.39,-3.79,1.92),(1.06,1.06,.18),stone_light)
    px,py=side*2.39,-3.79
    sphere('SM_Penguin_Body',(px,py,2.38),(.32,.28,.52),penguin_dark,'Details')
    sphere('SM_Penguin_Belly',(px,py-.235,2.33),(.225,.085,.34),penguin_white,'Details')
    sphere('SM_Penguin_Head',(px,py-.02,2.86),(.24,.24,.25),penguin_dark,'Details')
    cone('SM_Penguin_Beak',(px,py-.31,2.83),.11,0,.24,beak,6)
    for dx in [-.16,.16]:
        sphere('SM_Penguin_Eye',(px+dx,py-.222,2.91),(.035,.032,.04),penguin_white,'Details')
        sphere('SM_Penguin_Foot',(px+dx,py-.14,1.99),(.15,.18,.06),beak,'Details')
        sphere('SM_Penguin_Flipper',(px+dx*1.8,py,2.36),(.09,.16,.33),penguin_dark,'Details')

# Garden clusters, pointed hedges and wrought iron perimeter.
for x,y,r in [(-6.2,-4.5,.57),(-5.5,-4.7,.47),(-4.0,-4.5,.43),(-2.8,-4.4,.44),(3.35,-4.7,.43),(4.55,-4.85,.53),(6.55,-4.38,.63),(-6.37,.05,.47),(6.5,.48,.51),(-5.78,4.65,.48),(5.52,4.65,.54)]:
    sphere('SM_Hedge_Base',(x,y,.62),(r,r,.49),leaf,'Garden')
    sphere('SM_Hedge_Crown',(x,y,.83),(r*.72,r*.72,.40),leaf_light,'Garden')
for x,y in [(-5.32,-.8),(-3.0,-.75),(3.0,-.7),(5.07,.15),(-5.7,2.56),(5.65,2.64)]:
    cone('SM_Cypress',(x,y,1.57),.39,.06,2.72,leaf,8,'Garden')

for x in [-7.4,7.4]:
    cube('SM_Fence_LowWall',(x,0,.64),(.25,12.5,.66),stone)
for y in [-6.28,6.28]:
    cube('SM_Fence_LowWall',(0,y,.64),(14.8,.25,.66),stone)
for x in [-7.28,7.28]:
    for y in [i*.38 for i in range(-16,17)]:
        cube('SM_Fence_Picket',(x,y,1.29),(.055,.055,.83),iron,'Garden')
        cone('SM_Fence_Spear',(x,y,1.77),.08,0,.18,iron,4,'Garden')
for y in [-6.21,6.21]:
    for i in range(-19,20):
        x=i*.38
        if y<0 and abs(x)<1.38: continue
        cube('SM_Fence_Picket',(x,y,1.29),(.055,.055,.83),iron,'Garden')
        cone('SM_Fence_Spear',(x,y,1.77),.08,0,.18,iron,4,'Garden')
for x in [-7.28,7.28]:
    for z in [1.12,1.54]: cube('SM_Fence_Rail',(x,0,z),(.10,12.6,.08),iron,'Garden')
for y in [-6.21,6.21]:
    for z in [1.12,1.54]:
        for x,sx in [(-4.4,5.75),(4.4,5.75)]:
            cube('SM_Fence_Rail',(x,y,z),(sx,.1,.08),iron,'Garden')
for x in [-7.25,-4.1,-1.46,1.46,4.1,7.25]:
    for y in [-6.2,6.2]:
        cube('SM_Fence_Pier',(x,y,.92),(.43,.43,1.65),stone)
        cube('SM_Fence_PierCap',(x,y,1.83),(.57,.57,.17),stone_light)
for y in [-3.0,0,3.0]:
    for x in [-7.25,7.25]:
        cube('SM_Fence_Pier',(x,y,.92),(.43,.43,1.65),stone)
        cube('SM_Fence_PierCap',(x,y,1.83),(.57,.57,.17),stone_light)

# Gate with pointed crown, brass umbrella emblem, and lanterns.
for x in [-1.4,1.4]:
    cube('SM_Gate_Post',(x,-6.27,1.34),(.35,.38,2.48),stone_dark)
    cone('SM_Gate_PostFinial',(x,-6.27,2.75),.22,0,.38,stone_light)
for x in [-.71,.71]:
    cube('SM_Gate_Leaf',(x,-6.28,1.34),(1.31,.10,1.43),iron,'Details')
    for u in [-.49,-.25,0,.25,.49]:
        rod('SM_Gate_Bar',(x+u,-6.38,.72),(x+u,-6.38,2.25-abs(u)*.5),.037,roof_light)
rod('SM_Gate_Arch',(-1.41,-6.27,2.2),(0,-6.27,2.91),.085,stone_light)
rod('SM_Gate_Arch',(0,-6.27,2.91),(1.41,-6.27,2.2),.085,stone_light)
for x in [-.5,0,.5]:
    rod('SM_Umbrella_Canopy',(0,-6.47,1.52),(x,-6.47,1.31),.038,gold)
rod('SM_Umbrella_Handle',(0,-6.48,1.51),(0,-6.48,.91),.035,gold)

def lantern(x,y,z,scale=1):
    cube('SM_Lantern_Base',(x,y,z-.43*scale),(.21*scale,.21*scale,.15*scale),iron,'Details')
    cube('SM_Lantern_Glow',(x,y,z),(.29*scale,.29*scale,.52*scale),glass_bright,'Details')
    cube('SM_Lantern_Top',(x,y,z+.35*scale),(.42*scale,.42*scale,.13*scale),iron,'Details')
    cone('SM_Lantern_Spire',(x,y,z+.53*scale),.15*scale,0,.28*scale,iron,6,'Details')
for x,y in [(-7.25,-6.2),(-4.1,-6.2),(4.1,-6.2),(7.25,-6.2),(-1.4,-6.27),(1.4,-6.27)]: lantern(x,y,2.23,.8)
for x in [-1.3,1.3]: lantern(x,-3.78,2.54,.7)

# Lighting and final render setup.
for obj in list(scene.objects):
    if obj.type=='LIGHT' and obj.name.startswith('LGT_Arkham_'): bpy.data.objects.remove(obj,do_unlink=True)
def area(name,loc,power,color,size):
    data=bpy.data.lights.new(name,'AREA'); data.energy=power; data.color=color; data.shape='DISK'; data.size=size
    o=bpy.data.objects.new(name,data); collections['Lighting'].objects.link(o); o.location=loc
    o.rotation_euler=(Vector((0,0,3.1))-o.location).to_track_quat('-Z','Y').to_euler()
area('LGT_Redesign_MoonKey',(-8,-11,16),1100,(.55,.62,1.0),11)
area('LGT_Redesign_CoolFill',(10,-3,10),430,(.36,.49,1.0),9)
area('LGT_Redesign_Rim',(0,9,13),950,(.65,.55,1.0),9)
area('LGT_Redesign_WarmBounce',(0,-7,4),180,(1.0,.52,.22),6)
world=bpy.data.worlds.get('WORLD_Redesign_Night') or bpy.data.worlds.new('WORLD_Redesign_Night')
world.use_nodes=True; bg=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND')
bg.inputs['Color'].default_value=(.018,.022,.055,1); bg.inputs['Strength'].default_value=.35
scene.world=world
try: scene.render.engine='CYCLES'
except TypeError: pass
scene.cycles.samples=48
scene.render.resolution_x=1536; scene.render.resolution_y=1024; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.film_transparent=False
scene.view_settings.view_transform='AgX'
scene.view_settings.look='AgX - Medium High Contrast'
scene.view_settings.exposure=.25
scene.view_settings.gamma=1.0
scene.render.filepath='/Users/daniellee/Desktop/somethingcity/models/buildings/arkham_asylum_redesign.png'
bpy.ops.wm.save_as_mainfile(filepath='/Users/daniellee/Desktop/somethingcity/models/buildings/arkham_asylum_redesign.blend')
print('Redesign saved:',len(collections['Architecture'].objects),'architecture,',len(collections['Windows'].objects),'window,',len(collections['Garden'].objects),'garden objects')
