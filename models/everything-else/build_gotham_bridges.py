"""Reusable Gotham bridge kit. Run in Blender; preserves existing scenes."""
import bpy, math, json
from pathlib import Path
from mathutils import Vector

OUT=Path(r'C:/Users/athar/Documents/somethingcity/models/everything-else')
scene=bpy.data.scenes.new('Gotham | Bridge Foundry')
bpy.context.window.scene=scene
scene.unit_settings.system='METRIC'
def mat(name,color,metal=0,glow=0):
    m=bpy.data.materials.new('Bridge_'+name);m.diffuse_color=(*color,1);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=.72
    p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=glow
    return m
mats=[mat('basalt',(.105,.13,.15)),mat('cut_stone',(.23,.26,.27)),mat('iron',(.055,.075,.085),.7),mat('asphalt',(.065,.075,.085)),mat('brass',(.38,.28,.12),.6),mat('amber',(.95,.39,.055),0,3),mat('rust',(.22,.105,.065),.5)]
roots=[]; buckets={}
def root(name):
    r=bpy.data.objects.new(name,None);scene.collection.objects.link(r);roots.append(r);return r
def mesh(r,key,verts,faces):
    v,f=buckets.setdefault((r,key),([],[]));n=len(v);v.extend(verts);f.extend(tuple(n+i for i in face) for face in faces)
def box(r,c,s,key=0):
    x,y,z=c;a,b,d=[v/2 for v in s]
    mesh(r,key,[(x-a,y-b,z-d),(x+a,y-b,z-d),(x+a,y+b,z-d),(x-a,y+b,z-d),(x-a,y-b,z+d),(x+a,y-b,z+d),(x+a,y+b,z+d),(x-a,y+b,z+d)],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)])
def beam(r,a,b,width,key=2):
    a,b=Vector(a),Vector(b);d=b-a;q=d.to_track_quat('Z','Y');v=[]
    for z in [0,d.length]:
        for x,y in [(-1,-1),(1,-1),(1,1),(-1,1)]:v.append(tuple(a+q@Vector((x*width/2,y*width/2,z))))
    mesh(r,key,v,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)])
def spike(r,x,y,z,h=.65):
    mesh(r,2,[(x-.15,y-.15,z),(x+.15,y-.15,z),(x+.15,y+.15,z),(x-.15,y+.15,z),(x,y,z+h)],[(0,3,2,1),(0,1,4),(1,2,4),(2,3,4),(3,0,4)])
def base(r):
    box(r,(0,0,-.19),(20,4.2,.38));box(r,(0,0,.015),(20,3,.05),3)
    for x in range(-9,10,2):box(r,(x,0,.05),(.8,.055,.015),4)
    for y in [-1.82,1.82]:
        box(r,(0,y,.06),(20,.48,.12),1)
        for z in [.35,.95]:box(r,(0,y,z),(20,.07,.08),2)
        for i in range(41):
            x=-10+i*.5;box(r,(x,y,.56),(.045,.045,.85),2)
            if i%2==0:spike(r,x,y,1,.22)
        for x in [-9,-3,3,9]:
            box(r,(x,y,1.2),(.11,.11,2.3),2);box(r,(x,y,2.33),(.29,.29,.44),5)
            box(r,(x,y,2.06),(.4,.4,.09),2);spike(r,x,y,2.56,.3)
    for x in [-9.1,9.1]:box(r,(x,0,-.65),(1.8,4.5,.95),1)

r=root('Bridge_Gothic_Suspension');base(r)
for x in [-6.5,6.5]:
    for y in [-2,2]:
        box(r,(x,y,1.85),(.8,.8,4.4),0)
        for z in [.2,1,3.4,4]:box(r,(x,y,z),(1,1,.18),1)
        box(r,(x,y,4.3),(.56,.56,.5),1);spike(r,x,y,4.55,1)
        for dx in [-.36,.36]:spike(r,x+dx,y,4.1,.65)
        box(r,(x,y,-1.1),(1.2,1.2,1.8),0)
    box(r,(x,0,3.95),(.55,4,.3),1)
    beam(r,(x,-1.6,3.8),(x,0,4.65),.18,1);beam(r,(x,0,4.65),(x,1.6,3.8),.18,1)
for y in [-1.96,1.96]:
    points=[]
    for i in range(41):
        x=-10+i*.5;z=1.5+2.45*(x/6.5)**2 if abs(x)<=6.5 else 3.95-(abs(x)-6.5)*.96
        points.append((x,y,z))
        if i%2==0 and abs(x)<6.4:beam(r,(x,y,.32),(x,y,z),.045)
    for a,b in zip(points,points[1:]):beam(r,a,b,.105)

r=root('Bridge_Blackgate_Viaduct');base(r)
# True open arch spandrels, each made from a ring of wedge blocks.
for center in [-6.6,0,6.6]:
    for y in [-1.65,1.65]:
        for i in range(16):
            a=i*math.pi/16;b=(i+1)*math.pi/16
            verts=[]
            for yy in [y-.36,y+.36]:
                for t,rad in [(a,2.65),(b,2.65),(b,3.12),(a,3.12)]:verts.append((center+math.cos(t)*rad,yy,-3.25+math.sin(t)*rad))
            mesh(r,1 if i%3 else 0,verts,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)])
for x in [-9.9,-3.3,3.3,9.9]:
    for y in [-1.65,1.65]:
        box(r,(x,y,-1.9),(.95,1.1,3.5));box(r,(x,y,-3.5),(1.35,1.4,.35),1)
        box(r,(x,y,.75),(.7,.7,1.5),1);spike(r,x,y,1.5,.8)

r=root('Bridge_Narrows_Ironworks');base(r)
for y in [-1.95,1.95]:
    for z in [.25,2.9]:box(r,(0,y,z),(20,.17,.2),2)
    for i in range(9):
        x=-10+i*2.5;beam(r,(x,y,.2),(x,y,2.9),.18)
        box(r,(x,y,1.55),(.28,.24,.36),6)
        if i<8:
            beam(r,(x,y,.25),(x+2.5,y,2.9),.14);beam(r,(x,y,2.9),(x+2.5,y,.25),.1,6)
    for x in [-10,-5,0,5,10]:
        beam(r,(x,-1.95,2.9),(x,1.95,2.9),.15)
        if x<10:beam(r,(x,-1.95,2.9),(x+5,1.95,2.9),.10)

for (r,key),(verts,faces) in buckets.items():
    me=bpy.data.meshes.new(r.name+'_'+str(key));me.from_pydata(verts,[],faces);me.materials.append(mats[key]);me.update()
    ob=bpy.data.objects.new(me.name,me);scene.collection.objects.link(ob);ob.parent=r
bpy.context.view_layer.update()
manifest={}
for r in roots:
    bpy.ops.object.select_all(action='DESELECT')
    for ob in [r]+list(r.children):ob.select_set(True)
    filename=r.name.lower()+'.glb'
    bpy.ops.export_scene.gltf(filepath=str(OUT/filename),export_format='GLB',use_selection=True,use_active_scene=True,export_animations=False)
    points=[o.matrix_world @ Vector(c) for o in r.children for c in o.bound_box]
    width=round(max(p.y for p in points)-min(p.y for p in points),3)
    manifest[r.name]={'file':filename,'length':20,'road_width':3,'overall_width':width,'pivot':'road center at elevation zero','axis':'glTF X length, Y up','triangles':sum(len(o.data.polygons)*2 for o in r.children)}
for i,r in enumerate(roots):r.location.y=(i-1)*10
camdata=bpy.data.cameras.new('Bridge_Gallery_Camera');cam=bpy.data.objects.new(camdata.name,camdata);scene.collection.objects.link(cam)
cam.location=(30,-39,32);cam.rotation_euler=(Vector((0,0,.1))-cam.location).to_track_quat('-Z','Y').to_euler();camdata.type='ORTHO';camdata.ortho_scale=44;scene.camera=cam
scene.world=bpy.data.worlds.new('Bridge_Night');scene.world.color=(.08,.08,.08)
for name,pos,power,size,col in [('Moon',(0,-5,20),5500,15,(.52,.7,1)),('Warm',(-12,-8,10),3300,12,(1,.64,.35)),('Rim',(4,15,16),6500,13,(.4,.65,1))]:
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;d.color=col;o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=pos;o.rotation_euler=(-o.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.samples=24
scene.render.resolution_x=1400;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(OUT/'gotham_bridges.png')
scene['usage']='Three origin-centered GLB bridge prototypes, exported before gallery offsets. X span 20; roadway width 3. Place at city bridge x/z at road elevation.'
bpy.data.libraries.write(str(OUT/'gotham_bridges.blend'),{scene})
(OUT/'gotham_bridges_manifest.json').write_text(json.dumps(manifest,indent=2))
bpy.ops.render.render(write_still=True)
result=manifest

