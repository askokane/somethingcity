import bpy
import math
import random
from mathutils import Vector

random.seed(41)
scene = bpy.context.scene
name = 'COL_Cobblepot_RoofDetails'
col = bpy.data.collections.get(name)
if col:
    for obj in list(col.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.collections.remove(col)
col = bpy.data.collections.new(name)
scene.collection.children.link(col)

slate = bpy.data.materials['MAT_Redesign_SlateRoof']
ridge = bpy.data.materials['MAT_Redesign_RoofRidge']
stone = bpy.data.materials['MAT_Redesign_EdgeStone']
iron = bpy.data.materials['MAT_Redesign_Iron']

def mat(name, rgb):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    p = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value = (*rgb, 1)
    p.inputs['Roughness'].default_value = .9
    m.diffuse_color = (*rgb, 1)
    return m

slate_mid = mat('MAT_Cobblepot_SlateTileMid', (.057,.059,.103))
slate_glint = mat('MAT_Cobblepot_SlateTileGlint', (.083,.079,.125))

def mesh(name, verts, faces, material):
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    col.objects.link(obj)
    data.materials.append(material)
    return obj

def cube(name, loc, dims, material):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.object
    for c in list(obj.users_collection): c.objects.unlink(obj)
    col.objects.link(obj)
    obj.name = name
    obj.dimensions = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    return obj

def rod(name, a, b, radius, material, sides=6):
    a, b = Vector(a), Vector(b)
    d = b-a
    bpy.ops.mesh.primitive_cylinder_add(vertices=sides, radius=radius, depth=d.length, location=(a+b)/2)
    obj = bpy.context.object
    for c in list(obj.users_collection): c.objects.unlink(obj)
    col.objects.link(obj)
    obj.name = name
    obj.rotation_euler = d.to_track_quat('Z','Y').to_euler()
    obj.data.materials.append(material)
    return obj

def cone(name, loc, radius, depth, material):
    bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=radius, radius2=0, depth=depth, location=loc)
    obj = bpy.context.object
    for c in list(obj.users_collection): c.objects.unlink(obj)
    col.objects.link(obj)
    obj.name = name
    obj.data.materials.append(material)
    return obj

def hip_cap(label, x, y, width, depth, eave, peak):
    # Four sloped planes replace the conspicuous flat roof deck.
    a, b = width/2, depth/2
    verts = [(x-a,y-b,eave),(x+a,y-b,eave),(x+a,y+b,eave),(x-a,y+b,eave),
             (x,y-b*.53,peak),(x,y+b*.53,peak)]
    faces = [(0,1,4),(3,5,2),(0,4,5,3),(1,2,5,4)]
    mesh(label+'_HipSlate',verts,faces,slate)
    rod(label+'_Ridge',verts[4],verts[5],.065,ridge)
    for p,q in [(0,4),(1,4),(2,5),(3,5)]:
        rod(label+'_HipSeam',verts[p],verts[q],.037,ridge)
    for xx in [x-a,x+a]:
        rod(label+'_EaveFront',(xx,y-b,eave),(x,y-b,eave),.045,stone)
    for yy in [y-b*.53,y+b*.53]:
        cube(label+'_RidgeBoss',(x,yy,peak+.07),(.24,.24,.17),stone)
        cone(label+'_Finial',(x,yy,peak+.36),.12,.43,stone)

hip_cap('SM_Cobblepot_LeftWing',-3.75,1.17,2.61,3.1,6.42,6.93)
hip_cap('SM_Cobblepot_RightWing',3.75,1.17,2.61,3.1,6.42,6.93)

# Narrow courses and scattered square slate patches give the broad slopes a
# pixel-scaled texture without overpowering the Gothic window silhouettes.
def roof_front_tiles(label, x, y, z0, z1, bw, tw, bdepth, tdepth, rows):
    verts_by_mat = [[], []]
    faces_by_mat = [[], []]
    for row in range(rows):
        t = (row+.37)/rows
        z = z0+(z1-z0)*t
        width = bw+(tw-bw)*t
        front = y-(bdepth+(tdepth-bdepth)*t)/2-.024
        count = max(4, int(width/.36))
        for i in range(count):
            if random.random()<.36: continue
            u = (i+.5)/count-.5
            xx=x+u*width
            ww=min(.21,width/count*.72)
            dz=.105
            t2=min(.99,t+dz/(z1-z0))
            front2=y-(bdepth+(tdepth-bdepth)*t2)/2-.024
            k = 1 if random.random()<.24 else 0
            v=verts_by_mat[k]; f=faces_by_mat[k]; j=len(v)
            v.extend([(xx-ww/2,front,z),(xx+ww/2,front,z),
                      (xx+ww/2,front2,z+dz),(xx-ww/2,front2,z+dz)])
            f.append((j,j+1,j+2,j+3))
    for k,m in enumerate([slate_mid,slate_glint]):
        mesh(label+('_Mid' if k==0 else '_Glint'),verts_by_mat[k],faces_by_mat[k],m)

roof_front_tiles('SM_Cobblepot_CentralSlates',0,1.08,5.7,8.65,5.4,2.58,6.48,2.78,10)
roof_front_tiles('SM_Cobblepot_LeftSlates',-3.75,1.17,4.58,6.27,3.95,2.48,6.22,3.03,6)
roof_front_tiles('SM_Cobblepot_RightSlates',3.75,1.17,4.58,6.27,3.95,2.48,6.22,3.03,6)

def roof_side_tiles(label,x,y,z0,z1,bw,tw,bd,td,rows):
    verts=[]; faces=[]
    for row in range(rows):
        t=(row+.4)/rows; z=z0+(z1-z0)*t
        xx=x+(bw+(tw-bw)*t)/2+.025
        dep=bd+(td-bd)*t
        n=max(3,int(dep/.38))
        for i in range(n):
            if random.random()<.42: continue
            yy=y+((i+.5)/n-.5)*dep
            dz=.10; t2=min(.99,t+dz/(z1-z0))
            x2=x+(bw+(tw-bw)*t2)/2+.025
            j=len(verts)
            verts.extend([(xx,yy-.10,z),(xx,yy+.10,z),(x2,yy+.10,z+dz),(x2,yy-.10,z+dz)])
            faces.append((j,j+1,j+2,j+3))
    mesh(label,verts,faces,slate_mid)

roof_side_tiles('SM_Cobblepot_CentralSideSlates',0,1.08,5.7,8.65,5.4,2.58,6.48,2.78,10)
roof_side_tiles('SM_Cobblepot_RightSideSlates',3.75,1.17,4.58,6.27,3.95,2.48,6.22,3.03,6)

# Top platform: a filled-in stone balustrade, a raised crest and corner urns.
for yy in [-.15,2.31]:
    for xx in [-.82,-.42,0,.42,.82]:
        cube('SM_Cobblepot_CrownBaluster',(xx,yy,9.19),(.10,.11,.40),stone)
    rod('SM_Cobblepot_CrownHandrail',(-1.16,yy,9.43),(1.16,yy,9.43),.067,stone)
for xx in [-1.17,1.17]:
    for yy in [.39,.79,1.19,1.59,1.99]:
        cube('SM_Cobblepot_CrownSideBaluster',(xx,yy,9.17),(.11,.10,.35),stone)
    rod('SM_Cobblepot_CrownSideRail',(xx,-.1,9.42),(xx,2.28,9.42),.062,stone)
cube('SM_Cobblepot_Crown_CentreBlock',(0,1.07,9.02),(.93,.86,.24),stone)
mesh('SM_Cobblepot_CrownMiniHip',
     [(-.51,.59,9.14),(.51,.59,9.14),(.51,1.55,9.14),(-.51,1.55,9.14),(0,1.07,9.56)],
     [(0,1,4),(1,2,4),(2,3,4),(3,0,4)],slate)
cone('SM_Cobblepot_CrownSpire',(0,1.07,9.69),.10,.32,stone)

# Twin flues and ornamental bands on both chimney caps.
for x,y in [(-3.55,2.67),(4.45,2.75)]:
    for dx in [-.14,.14]:
        cube('SM_Cobblepot_ChimneyFlue',(x+dx,y,8.89),(.18,.18,.32),iron)
        cube('SM_Cobblepot_ChimneyLip',(x+dx,y,9.08),(.23,.23,.08),stone)
    cube('SM_Cobblepot_ChimneyBand',(x,y,7.94),(.77,.72,.10),stone)

print('Roof detail added:',len(col.objects),'objects')
