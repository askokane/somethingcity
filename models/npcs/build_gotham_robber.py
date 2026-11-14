"""Build a pixel-styled robber NPC with idle, walk, and money-bag throw clips.

Run: Blender --background --python build_gotham_robber.py
The GLB contains no preview floor or camera. Front is -Y; origin is at the feet.
"""

import math
from pathlib import Path

import bpy
from mathutils import Vector

OUT=Path(__file__).resolve().parent
STEM="gotham_robber_8bit"
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
scene.name="Gotham Robber 8-bit"
scene.unit_settings.system="METRIC"
scene.render.fps=30


def material(name,color,emission=0):
    m=bpy.data.materials.new(name)
    m.diffuse_color=(*color,1)
    m.use_nodes=True
    shader=next(n for n in m.node_tree.nodes if n.type=="BSDF_PRINCIPLED")
    shader.inputs["Base Color"].default_value=(*color,1)
    shader.inputs["Roughness"].default_value=.9
    if emission:
        shader.inputs["Emission Color"].default_value=(*color,1)
        shader.inputs["Emission Strength"].default_value=emission
    return m


M=[
    material("MAT_Robber_Outline",(.013,.018,.025)),       # 0
    material("MAT_Robber_Charcoal",(.075,.084,.092)),      # 1
    material("MAT_Robber_CapGray",(.16,.17,.18)),          # 2
    material("MAT_Robber_Skin",(.82,.68,.52)),             # 3
    material("MAT_Robber_SkinLight",(.95,.83,.65)),        # 4
    material("MAT_Robber_ShirtStripe",(.82,.83,.75)),      # 5
    material("MAT_Robber_BagYellow",(1,.76,.025),.20),    # 6
    material("MAT_Robber_BagHighlight",(1,.91,.14),.15),  # 7
    material("MAT_Robber_BagShadow",(.70,.46,.015)),       # 8
    material("MAT_Robber_Boots",(.10,.13,.15)),            # 9
    material("MAT_Robber_Eyes",(.99,.97,.85)),             # 10
]


class Part:
    def __init__(self,name,bone):
        self.name,self.bone=name,bone
        self.verts=[]
        self.faces=[]
        self.mids=[]

    def face(self,points,mid):
        k=len(self.verts)
        self.verts.extend(points)
        self.faces.append(tuple(range(k,len(self.verts))))
        self.mids.append(mid)

    def box(self,x,y,z,w,d,h,mid):
        a,b,c=w/2,d/2,h/2
        v=[(x-a,y-b,z-c),(x+a,y-b,z-c),(x+a,y+b,z-c),(x-a,y+b,z-c),
           (x-a,y-b,z+c),(x+a,y-b,z+c),(x+a,y+b,z+c),(x-a,y+b,z+c)]
        for q in ((0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)):
            self.face([v[i] for i in q],mid)

    def extruded_profile(self,points,y_front,depth,mid):
        front=[(x,y_front,z) for x,z in points]
        back=[(x,y_front+depth,z) for x,z in points]
        self.face(front,mid)
        self.face(list(reversed(back)),mid)
        for i in range(len(points)):
            j=(i+1)%len(points)
            self.face((front[i],front[j],back[j],back[i]),mid)

    def finish(self,col,arm):
        mesh=bpy.data.meshes.new(self.name)
        mesh.from_pydata(self.verts,[],self.faces)
        mesh.update()
        for mat in M:mesh.materials.append(mat)
        for poly,mid in zip(mesh.polygons,self.mids):poly.material_index=mid
        obj=bpy.data.objects.new("SM_Robber_"+self.name,mesh)
        col.objects.link(obj)
        group=obj.vertex_groups.new(name=self.bone)
        group.add(list(range(len(mesh.vertices))),1.0,"REPLACE")
        mod=obj.modifiers.new("ARM_Robber_RigidSkin","ARMATURE")
        mod.object=arm
        obj.parent=arm
        return obj


def collection(name):
    col=bpy.data.collections.new("COL_"+name)
    scene.collection.children.link(col)
    return col


rig_col=collection("Robber_Rig")
mesh_col=collection("Robber_Geo")
preview_col=collection("Robber_Preview")
arm_data=bpy.data.armatures.new("ARM_Robber")
arm=bpy.data.objects.new("ARM_Robber",arm_data)
rig_col.objects.link(arm)
bpy.context.view_layer.objects.active=arm
arm.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
bone_specs=[
    ("Root",None,(0,0,.08),(0,0,.30)),
    ("Torso","Root",(0,0,.93),(0,0,1.26)),
    ("Head","Torso",(0,0,1.54),(0,0,1.84)),
    ("Arm_L","Torso",(-.45,0,1.37),(-.45,0,1.05)),
    ("Arm_R","Torso",(.45,0,1.37),(.45,0,1.05)),
    ("Leg_L","Root",(-.22,0,.72),(-.22,0,.39)),
    ("Leg_R","Root",(.22,0,.72),(.22,0,.39)),
    ("Bag","Root",(.77,-.05,.48),(.79,-.05,.72)),
]
for name,parent,head,tail in bone_specs:
    bone=arm_data.edit_bones.new(name)
    bone.head=head
    bone.tail=tail
    bone.use_connect=False
    if parent:bone.parent=arm_data.edit_bones[parent]
bpy.ops.object.mode_set(mode="OBJECT")
arm.select_set(False)
for pb in arm.pose.bones:pb.rotation_mode="XYZ"

# Rigid parts use separate bones so the blocky silhouette stays crisp.
torso=Part("Torso","Torso")
torso.box(0,0,1.12,.84,.42,.73,0)
torso.box(0,-.225,1.11,.74,.035,.64,1)
for height in (.98,1.16,1.34):
    torso.box(0,-.262,height,.69,.04,.09,5)
torso.box(0,-.248,.82,.75,.03,.09,0)
torso.box(0,-.02,1.52,.24,.28,.13,3)

head=Part("Head","Head")
head.box(0,0,1.75,.68,.39,.58,0)
head.box(0,-.217,1.68,.60,.055,.39,3)
head.box(0,-.247,1.78,.62,.045,.18,0)
for x in (-.165,.165):
    head.box(x,-.278,1.80,.115,.035,.065,10)
head.box(0,-.272,1.59,.23,.044,.06,0)
head.box(0,-.263,1.54,.17,.04,.05,4)
# Knitted dark cap with a stepped 8-bit crown and forward brim.
head.box(0,0,2.055,.76,.43,.19,2)
head.box(0,0,2.175,.60,.41,.08,1)
head.box(0,-.263,1.989,.83,.19,.10,0)
head.box(0,-.269,2.022,.75,.11,.035,2)
for x in (-.28,-.12,.12,.28):
    head.box(x,-.223,2.10,.035,.04,.10,0)

arm_l=Part("Arm_L","Arm_L")
arm_l.box(-.49,0,1.10,.24,.34,.55,0)
arm_l.box(-.49,-.190,1.12,.19,.035,.48,1)
arm_l.box(-.49,-.217,1.18,.20,.04,.09,5)
arm_l.box(-.49,-.015,.79,.21,.28,.16,3)

arm_r=Part("Arm_R","Arm_R")
# Straight sleeve at his side; the low hand wraps over the bag's tied neck.
arm_r.box(.49,0,1.10,.24,.34,.55,0)
arm_r.box(.49,-.190,1.12,.19,.035,.48,1)
arm_r.box(.49,-.217,1.18,.20,.04,.09,5)
arm_r.box(.63,-.22,.78,.20,.26,.17,3)

leg_l=Part("Leg_L","Leg_L")
leg_l.box(-.22,0,.49,.27,.32,.56,0)
leg_l.box(-.22,-.10,.14,.31,.43,.19,9)
leg_l.box(-.22,-.20,.075,.33,.30,.08,0)

leg_r=Part("Leg_R","Leg_R")
leg_r.box(.22,0,.49,.27,.32,.56,0)
leg_r.box(.22,-.10,.14,.31,.43,.19,9)
leg_r.box(.22,-.20,.075,.33,.30,.08,0)

bag=Part("MoneyBag","Bag")
outline=[(.77,.87),(1.07,.87),(1.25,.98),(1.30,1.20),
         (1.21,1.39),(1.08,1.47),(.84,1.47),(.69,1.35),
         (.63,1.14),(.66,.98)]
yellow=[(.79,.93),(1.05,.93),(1.19,1.02),(1.23,1.20),
        (1.15,1.35),(1.04,1.41),(.86,1.41),(.76,1.32),
        (.70,1.14),(.72,1.02)]
bag.extruded_profile(outline,-.27,.33,0)
bag.face([(x,-.276,z) for x,z in yellow],6)
bag.box(.93,-.10,1.46,.34,.30,.12,8)
bag.box(.93,-.10,1.53,.20,.26,.09,7)
bag.box(.82,-.283,1.24,.15,.018,.28,7)
# Keep the bag hanging beside the leg while its neck sits inside the hand.
bag.verts=[(x-.16,y,z-.67) for x,y,z in bag.verts]

parts=[torso,head,arm_l,arm_r,leg_l,leg_r,bag]
meshes=[part.finish(mesh_col,arm) for part in parts]
arm["front"]="-Y"
arm["root_motion"]="in_place"
arm["reference_style"]="8-bit robber with yellow money bag"


def reset_pose():
    for pb in arm.pose.bones:
        pb.rotation_euler=(0,0,0)
        pb.location=(0,0,0)
        pb.scale=(1,1,1)


def key(frame,changes):
    reset_pose()
    for name,props in changes.items():
        pb=arm.pose.bones[name]
        if "loc" in props:pb.location=props["loc"]
        if "rot" in props:pb.rotation_euler=props["rot"]
    for pb in arm.pose.bones:
        pb.keyframe_insert(data_path="location",frame=frame,group=pb.name)
        pb.keyframe_insert(data_path="rotation_euler",frame=frame,group=pb.name)


clips={}
def make_clip(name,end,poses):
    arm.animation_data_create()
    arm.animation_data.action=None
    for frame,changes in poses:key(frame,changes)
    action=arm.animation_data.action
    action.name=name
    action.use_fake_user=True
    track=arm.animation_data.nla_tracks.new()
    track.name=name
    strip=track.strips.new(name,1,action)
    strip.action_frame_start=1
    strip.action_frame_end=end
    arm.animation_data.action=None
    clips[name]=(track,action,end)


# 2-second idle: a small weight shift, bag sway, and head bob.
idle="AN_Robber_Idle"
make_clip(idle,61,[
    (1,{}),
    (16,{"Root":{"loc":(0,.022,0)},"Head":{"rot":(0,0,.035)},
         "Arm_L":{"rot":(.08,0,0)},"Bag":{"loc":(.025,.025,0),"rot":(0,0,.065)}}),
    (31,{"Root":{"loc":(0,.037,0)},"Torso":{"rot":(0,.025,0)},
         "Head":{"rot":(0,0,-.025)},"Arm_R":{"rot":(-.05,0,0)},
         "Bag":{"loc":(.04,.04,0),"rot":(0,0,-.04)}}),
    (46,{"Root":{"loc":(0,.014,0)},"Torso":{"rot":(0,-.02,0)},
         "Arm_L":{"rot":(-.05,0,0)},"Bag":{"loc":(-.015,.012,0),"rot":(0,0,.04)}}),
    (61,{}),
])

# 1-second in-place walk: opposite leg/arm swings and two vertical contacts.
walk="AN_Robber_Walk"
make_clip(walk,31,[
    (1,{"Root":{"loc":(0,-.10,0)},"Leg_L":{"rot":(.38,0,0)},"Leg_R":{"rot":(-.38,0,0)},
        "Arm_L":{"rot":(-.25,0,0)},"Arm_R":{"rot":(.02,0,0)},
        "Bag":{"loc":(.015,-.02,0),"rot":(.05,0,0)}}),
    (8,{"Root":{"loc":(0,.035,0)},"Leg_L":{"rot":(0,0,0)},
        "Leg_R":{"rot":(0,0,0)},"Bag":{"loc":(.03,.045,0)}}),
    (16,{"Root":{"loc":(0,-.10,0)},"Leg_L":{"rot":(-.38,0,0)},"Leg_R":{"rot":(.38,0,0)},
         "Arm_L":{"rot":(.25,0,0)},"Arm_R":{"rot":(-.02,0,0)},
         "Bag":{"loc":(-.02,-.02,0),"rot":(-.05,0,0)}}),
    (23,{"Root":{"loc":(0,.035,0)},"Leg_L":{"rot":(0,0,0)},
         "Leg_R":{"rot":(0,0,0)},"Bag":{"loc":(.02,.045,0)}}),
    (31,{"Root":{"loc":(0,-.10,0)},"Leg_L":{"rot":(.38,0,0)},"Leg_R":{"rot":(-.38,0,0)},
         "Arm_L":{"rot":(-.25,0,0)},"Arm_R":{"rot":(.02,0,0)},
         "Bag":{"loc":(.015,-.02,0),"rot":(.05,0,0)}}),
])

# One-shot throw: wind up, arm release, then a clear airborne bag arc.
throw="AN_Robber_ThrowBag"
make_clip(throw,46,[
    (1,{}),
    (9,{"Torso":{"rot":(0,-.12,-.08)},"Arm_R":{"rot":(-.18,-.25,.08)},
        "Bag":{"loc":(-.08,-.05,-.14),"rot":(0,.0,-.18)}}),
    (16,{"Torso":{"rot":(0,.08,.07)},"Arm_R":{"rot":(-.58,.46,-.24)},
         "Head":{"rot":(0,0,.08)},"Bag":{"loc":(.08,.50,.12),"rot":(0,.0,.28)}}),
    (23,{"Torso":{"rot":(0,.12,.12)},"Arm_R":{"rot":(-.90,.72,-.36)},
         "Arm_L":{"rot":(.22,0,0)},"Bag":{"loc":(.68,1.25,.56),
         "rot":(.42,.32,.86)}}),
    (31,{"Torso":{"rot":(0,.04,.04)},"Arm_R":{"rot":(-.60,.45,-.25)},
         "Bag":{"loc":(1.55,1.65,1.22),"rot":(.94,.55,1.62)}}),
    (46,{"Arm_R":{"rot":(-.10,.08,0)},"Bag":{"loc":(2.55,-.15,2.00),
         "rot":(1.45,.85,2.50)}}),
])

# Simple display floor is excluded from GLB.
floor_mat=material("MAT_Robber_PreviewFloor",(.075,.081,.094))
bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,-.085))
floor=bpy.context.object
floor.name="PREVIEW_Floor"
floor.dimensions=(3.2,2.7,.12)
bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
floor.data.materials.append(floor_mat)
for c in list(floor.users_collection):c.objects.unlink(floor)
preview_col.objects.link(floor)

cam_data=bpy.data.cameras.new("CAM_Robber_Hero")
cam=bpy.data.objects.new("CAM_Robber_Hero",cam_data)
scene.collection.objects.link(cam)
cam.location=(3.1,-6.0,3.25)
target=Vector((.22,0,1.10))
cam.rotation_euler=(target-cam.location).to_track_quat("-Z","Y").to_euler()
cam_data.type="ORTHO"
cam_data.ortho_scale=3.55
scene.camera=cam

def area(name,location,energy,size,color):
    data=bpy.data.lights.new(name,"AREA")
    obj=bpy.data.objects.new(name,data)
    scene.collection.objects.link(obj)
    obj.location=location
    obj.rotation_euler=(Vector((0,0,1.1))-obj.location).to_track_quat("-Z","Y").to_euler()
    data.energy=energy
    data.shape="DISK"
    data.size=size
    data.color=color

area("LGT_Robber_Key",(-3,-4,6),400,5,(.85,.90,1))
area("LGT_Robber_Fill",(3,-2,4),210,4,(.72,.78,1))
area("LGT_Robber_Rim",(0,3,4),270,4,(1,.80,.49))
world=bpy.data.worlds.new("World_Robber_Preview")
scene.world=world
world.use_nodes=True
background=next(n for n in world.node_tree.nodes if n.type=="BACKGROUND")
background.inputs["Color"].default_value=(.055,.060,.074,1)
background.inputs["Strength"].default_value=.38
scene.render.engine="CYCLES"
scene.cycles.samples=28
scene.cycles.use_denoising=True
scene.render.resolution_x=768
scene.render.resolution_y=768
scene.render.resolution_percentage=100
scene.render.image_settings.file_format="PNG"
scene.view_settings.view_transform="AgX"
scene.view_settings.look="AgX - Medium High Contrast"
scene.view_settings.exposure=.10
scene.frame_start=1
scene.frame_end=61

# Export all three NLA tracks and only the rigged character meshes.
bpy.ops.object.select_all(action="DESELECT")
arm.select_set(True)
for obj in meshes:obj.select_set(True)
bpy.context.view_layer.objects.active=arm
bpy.ops.export_scene.gltf(filepath=str(OUT/(STEM+".glb")),
                          export_format="GLB",use_selection=True,
                          use_active_scene=True,export_yup=True,
                          export_animations=True,
                          export_animation_mode="NLA_TRACKS",
                          export_anim_slide_to_zero=True,
                          export_force_sampling=True)

def show_clip(name,frame,path):
    for track,_,_ in clips.values():track.mute=True
    clips[name][0].mute=False
    scene.frame_set(frame)
    scene.render.filepath=str(path)
    bpy.ops.render.render(write_still=True)

show_clip(idle,1,OUT/(STEM+".png"))
show_clip(walk,1,OUT/(STEM+"_walk.png"))
show_clip(throw,23,OUT/(STEM+"_throw.png"))
for track,_,_ in clips.values():track.mute=True
clips[idle][0].mute=False
scene.frame_set(1)
scene.render.filepath=str(OUT/(STEM+".png"))
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/(STEM+".blend")))
print("BUILT",STEM,"mesh parts",len(meshes),
      "triangles",sum(len(p.vertices)-2 for obj in meshes for p in obj.data.polygons),
      "clips",list(clips))
