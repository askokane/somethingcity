"""Rebuild account landmarks 01-03 as compact 8-bit ruins with small fire loops.

Run with Blender --background --python build_destroyed_01_03.py.
This script only writes the *_destroyed files; intact buildings are untouched.
"""

import math
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector


OUT = Path(__file__).resolve().parent


def make(number):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = f"Account Building {number:02d} Destroyed 8-bit"
    scene.unit_settings.system = "METRIC"
    scene.render.fps = 30
    scene.render.fps_base = 1
    scene.frame_start = 1
    scene.frame_end = 61
    stem = f"account_building_{number:02d}_destroyed"

    def material(name, rgb, emission=0):
        mat = bpy.data.materials.new(f"MAT_{number:02d}_{name}")
        mat.diffuse_color = (*rgb, 1)
        mat.use_nodes = True
        shader = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        shader.inputs["Base Color"].default_value = (*rgb, 1)
        shader.inputs["Roughness"].default_value = 1
        if emission:
            shader.inputs["Emission Color"].default_value = (*rgb, 1)
            shader.inputs["Emission Strength"].default_value = emission
        return mat

    # The same flat twelve-swatch palette as the new account 10 ruin.
    M = [
        material("Stone", (.145, .151, .215)),
        material("Shadow", (.025, .032, .055)),
        material("Trim", (.31, .30, .37)),
        material("Char", (.07, .065, .08)),
        material("Rubble", (.23, .21, .25)),
        material("WindowDark", (.018, .025, .042)),
        material("WindowAmber", (.78, .33, .055), .6),
        material("InnerGlow", (.42, .105, .025), 1.0),
        material("Iron", (.028, .034, .052)),
        material("FireOrange", (.95, .22, .025), 2.2),
        material("FireYellow", (1, .67, .06), 2.6),
        material("FireCore", (1, .91, .33), 2.8),
    ]

    class MeshBuilder:
        def __init__(self):
            self.verts, self.faces, self.mids = [], [], []

        def face(self, points, mid):
            start = len(self.verts)
            self.verts.extend(points)
            self.faces.append(tuple(range(start, len(self.verts))))
            self.mids.append(mid)

        def box(self, x, y, z, w, d, h, mid):
            a, b, c = w/2, d/2, h/2
            v = [(x-a,y-b,z-c),(x+a,y-b,z-c),(x+a,y+b,z-c),(x-a,y+b,z-c),
                 (x-a,y-b,z+c),(x+a,y-b,z+c),(x+a,y+b,z+c),(x-a,y+b,z+c)]
            for q in ((0,3,2,1),(4,5,6,7),(0,1,5,4),
                      (1,2,6,5),(2,3,7,6),(3,0,4,7)):
                self.face([v[i] for i in q], mid)

        def tapered_roof_piece(self, bx0, bx1, tx0, tx1, cy, z0, z1,
                               bottom_depth, top_depth, mid):
            by0, by1 = cy-bottom_depth/2, cy+bottom_depth/2
            ty0, ty1 = cy-top_depth/2, cy+top_depth/2
            v = [(bx0,by0,z0),(bx1,by0,z0),(bx1,by1,z0),(bx0,by1,z0),
                 (tx0,ty0,z1),(tx1,ty0,z1),(tx1,ty1,z1),(tx0,ty1,z1)]
            for q in ((0,3,2,1),(4,5,6,7),(0,1,5,4),
                      (1,2,6,5),(2,3,7,6),(3,0,4,7)):
                self.face([v[i] for i in q], mid)

        def object(self, name, collection):
            mesh = bpy.data.meshes.new(name + "_Mesh")
            mesh.from_pydata(self.verts, [], self.faces)
            mesh.update()
            for mat in M:
                mesh.materials.append(mat)
            for face, mid in zip(mesh.polygons, self.mids):
                face.material_index = mid
            obj = bpy.data.objects.new(name, mesh)
            collection.objects.link(obj)
            return obj

    col = bpy.data.collections.new(f"COL_Account_{number:02d}_Destroyed_Geometry")
    scene.collection.children.link(col)
    static = MeshBuilder()

    # Keep the original shared 10.1 x 9.2 m tile, front toward negative Y.
    static.box(0, 0, -.19, 10.1, 9.2, .38, 1)
    static.box(0, 0, .04, 9.78, 8.88, .08, 2)
    for step in range(3):
        static.box(0, -3.12-step*.28, .20+step*.105,
                   2.55+step*.14, .28, .16, 2)
    for side in (-1, 1):
        for y in (-3.55, -1.8, .0, 1.8, 3.55):
            static.box(side*4.70, y, .64, .25, .25, 1.08, 2)
            static.box(side*4.70, y, 1.22, .34, .34, .12, 1)
        static.box(side*4.70, 0, .88, .06, 7.15, .07, 8)
    for x in (-3.95, 3.95):
        static.box(x, -3.50, .68, .19, .19, 1.10, 2)
        static.box(x, -3.50, 1.29, .28, .28, .18, 6)

    def wall_tier(z0, pitch, floors, width, depth, cx, cy, columns,
                  side_columns, missing_front, missing_side, cap=True):
        left, right, front, back = cx-width/2, cx+width/2, cy-depth/2, cy+depth/2
        cell, side_cell = width/columns, depth/side_columns
        # Rear and left walls preserve structural mass behind actual missing bays.
        static.box(cx, back-.15, z0+pitch*floors/2, width, .30,
                   pitch*floors, 1)
        static.box(left+.15, cy, z0+pitch*floors/2, .30, depth,
                   pitch*floors, 1)
        for floor in range(floors):
            base = z0+pitch*floor
            middle = base+pitch*.52
            for column in range(columns):
                x = left+cell*(column+.5)
                absent = (floor,column) in missing_front
                # Missing slab lips produce a stepped, genuinely broken edge.
                if not (absent and (floor+column)%2 == 0):
                    static.box(x, cy, base+.08, cell, depth, .16,
                               3 if absent else 2)
                if absent:
                    static.box(x, cy+.46, middle, cell*.88, .12,
                               pitch*.70, 7 if (floor+column)%3 == 0 else 1)
                    static.box(x, front+.035, base+.16, cell*.78,
                               .42, .16, 3)
                    if column == 0 or (floor,column-1) not in missing_front:
                        static.box(x-cell*.44, front+.035, middle,
                                   .15,.35,pitch*.76,3)
                    continue
                scorched = ((floor,column-1) in missing_front or
                            (floor,column+1) in missing_front or
                            (floor-1,column) in missing_front)
                static.box(x, front+.15, middle, cell, .30,
                           pitch*.83, 3 if scorched else 0)
                if (floor+column)%4 != 0:
                    lit = (floor*7+column*3+number)%7 == 0
                    static.box(x, front-.025, middle+.04,
                               cell*.38,.06,pitch*.34,6 if lit else 5)
                    static.box(x, front-.07, middle-pitch*.18,
                               cell*.48,.12,.08,2)
                    static.box(x, front-.07, middle+.04,
                               .045,.07,pitch*.34,8)
            for bay in range(side_columns):
                y = front+side_cell*(bay+.5)
                absent = (floor,bay) in missing_side
                if absent:
                    static.box(right-.48,y,middle,.10,side_cell*.84,
                               pitch*.70,1)
                    static.box(right-.18,y,base+.16,.42,side_cell*.82,
                               .16,3)
                    continue
                static.box(right-.15,y,middle,.30,side_cell,
                           pitch*.83,3 if (floor,bay-1) in missing_side else 0)
                if (floor+bay)%4 != 0:
                    lit=(floor*3+bay*7+number)%8==0
                    static.box(right+.025,y,middle+.04,.06,
                               side_cell*.35,pitch*.33,6 if lit else 5)
                    static.box(right+.07,y,middle-pitch*.18,.09,
                               side_cell*.44,.08,2)
        if cap:
            top=z0+pitch*floors+.09
            static.box(cx-width*.25,cy,top,width*.5+.10,depth+.18,.18,2)
            static.box(cx+width*.25,cy+depth*.25,top,
                       width*.5+.10,depth*.5+.12,.18,3)

    if number == 1:
        # Low mansard townhouse; the front-right roof segment fell away.
        wall_tier(.17,1.91,3,7.35,5.50,0,.35,7,5,
                  {(1,1),(1,2),(2,1),(2,2),(2,5)},
                  {(1,0),(2,0)})
        bottom_w, top_w = 7.70,3.77
        for i in range(5):
            if i == 3: continue
            b0=-bottom_w/2+bottom_w*i/5
            b1=-bottom_w/2+bottom_w*(i+1)/5
            t0=b0*top_w/bottom_w
            t1=b1*top_w/bottom_w
            static.tapered_roof_piece(b0,b1,t0,t1,.35,6.02,8.54,
                                     5.85,2.58,3 if i in (2,4) else 1)
        static.box(-1.05,.35,8.58,1.95,2.72,.16,2)
        for x in (-3.35,3.35):
            static.box(x,2.18,7.48,.55,.55,2.15,0 if x<0 else 3)
            if x<0: static.box(x,2.18,8.61,.72,.72,.18,2)
        static.box(-3.35,2.18,9.02,.08,.08,.62,2)
        static.box(-3.35,2.18,9.37,.15,.15,.09,6)
        static.box(0,-2.56,1.47,1.72,.18,2.54,1)
        static.box(0,-2.69,1.42,1.19,.07,2.12,8)
        fire_sites=[(-1.80,-2.47,3.64,.68),(.97,-1.65,6.85,.72)]
        rubble=[(-2.1,-3.08,.42,.64),(-1.55,-3.10,.34,.48),
                (2.38,-2.95,.38,.53),(.92,-1.79,6.16,.38)]
        height=9.78
    elif number == 2:
        # Three square Art Deco setbacks retain the Ash Exchange silhouette.
        wall_tier(.17,2.12,3,7.07,5.78,0,.10,7,5,
                  {(1,0),(1,1),(2,0),(2,1),(2,5)},
                  {(1,0),(2,0)})
        wall_tier(6.53,2.10,2,5.08,5.00,0,.43,5,4,
                  {(0,3),(1,2),(1,3)}, {(1,0)})
        wall_tier(10.73,1.82,1,3.10,3.22,0,.75,3,3,
                  {(0,2)}, {(0,0)})
        static.box(-.80,.75,12.66,1.52,3.27,.18,2)
        for x in (-1.42,1.42):
            static.box(x,.77,12.82,.08,.08,.37,2)
            static.box(x,.77,13.04,.14,.14,.13,6 if x<0 else 3)
        static.box(0,-2.89,1.48,1.85,.20,2.58,1)
        static.box(0,-3.02,1.45,1.23,.07,2.16,8)
        fire_sites=[(-2.66,-2.81,4.65,.80),(1.26,-2.05,8.48,.85)]
        rubble=[(-2.35,-3.18,.39,.65),(-1.62,-3.19,.34,.44),
                (2.30,-3.04,.40,.51),(1.68,-2.20,6.88,.42)]
        height=13.60
    else:
        # Warden Spire keeps its needle while the upper right corner is open.
        wall_tier(.17,2.04,3,7.52,6.12,0,.22,7,5,
                  {(1,4),(2,3),(2,4),(2,5)}, {(1,0),(2,0)})
        wall_tier(6.29,1.91,3,5.65,5.12,0,.48,5,4,
                  {(1,0),(1,1),(2,0),(2,1)}, {(2,0)})
        wall_tier(12.02,1.58,2,3.76,3.60,0,.80,3,3,
                  {(0,2),(1,1),(1,2)}, {(1,0)})
        for i in (0,1):
            b0=-1.94+3.88*i/3
            b1=-1.94+3.88*(i+1)/3
            static.tapered_roof_piece(b0,b1,b0*.31,b1*.31,.80,
                                     15.18,16.35,3.70,1.04,
                                     3 if i==1 else 1)
        static.box(-.41,.80,16.42,.82,1.08,.17,2)
        static.box(-.38,.80,16.86,.16,.16,.75,2)
        static.box(0,-2.91,1.47,1.85,.18,2.55,1)
        static.box(0,-3.04,1.45,1.21,.07,2.15,8)
        fire_sites=[(1.87,-2.82,4.68,.90),(-1.21,-2.05,9.62,.92)]
        rubble=[(2.48,-3.10,.44,.68),(1.62,-3.16,.34,.51),
                (-2.30,-3.12,.33,.46),(-1.75,-2.15,7.48,.38)]
        height=17.68

    # A few chunky masonry fragments and charred ribs; no particles or smoke.
    for x,y,z,size in rubble:
        static.box(x,y,z,size,size*.82,size*.57,4)
        static.box(x+size*.22,y-.02,z+size*.35,size*.48,size*.4,
                   size*.24,3)
    building=static.object(f"SM_Account_Building_{number:02d}_Destroyed",col)
    building["account_slot"]=number
    building["height_m"]=height
    building["condition"]="8bit_ruin_small_fire"
    building["source_asset"]=f"account_building_{number:02d}.blend"

    def fire(index, center, flame_height):
        fx=MeshBuilder()
        cx,cy,cz=center
        # Attached square tongues matching the account 10 small-fire style.
        for dx,dy,scale in ((-.27,.03,.82),(0,-.07,1),(.27,.04,.68)):
            h=flame_height*scale
            fx.box(dx,dy,h*.23,.38,.34,h*.46,9)
            fx.box(dx,dy,h*.56,.27,.25,h*.35,10)
            fx.box(dx,dy,h*.83,.13,.14,h*.22,11)
        obj=fx.object(f"FX_Account_{number:02d}_Fire_{index}",col)
        obj.location=(cx,cy,cz)
        for frame in (1,11,21,31,41,51,61):
            phase=math.tau*(frame-1)/60
            flicker=math.sin(phase+index*1.4)
            obj.scale=(1+.10*flicker,1-.05*flicker,1+.12*flicker)
            obj.location=(cx+.05*flicker,cy,cz+.10*flicker)
            obj.keyframe_insert(data_path="scale",frame=frame)
            obj.keyframe_insert(data_path="location",frame=frame)
        action=obj.animation_data.action
        action.name=f"AN_Account_{number:02d}_SmallFireLoop_Part{index}"
        action.use_fake_user=True
        slot=getattr(obj.animation_data,"action_slot",None)
        track=obj.animation_data.nla_tracks.new()
        track.name=f"AN_Account_{number:02d}_SmallFireLoop"
        strip=track.strips.new(action.name,1,action)
        strip.action_frame_start=1
        strip.action_frame_end=61
        if slot is not None and hasattr(strip,"action_slot"):
            strip.action_slot=slot
        obj.animation_data.action=None
        return obj

    fires=[fire(i+1,(x,y,z),h) for i,(x,y,z,h) in enumerate(fire_sites)]

    cam_data=bpy.data.cameras.new(f"CAM_Account_{number:02d}_Destroyed_8bit")
    cam=bpy.data.objects.new(cam_data.name,cam_data)
    scene.collection.objects.link(cam)
    cam.location=(height*.88,-height*1.13,height*.93)
    target=Vector((0,0,height*.51))
    cam.rotation_euler=(target-Vector(cam.location)).to_track_quat("-Z","Y").to_euler()
    cam_data.type="ORTHO"
    cam_data.ortho_scale=max(height+3.2,13.0)
    scene.camera=cam

    def area(name,location,energy,color,size):
        data=bpy.data.lights.new(name,"AREA")
        obj=bpy.data.objects.new(name,data)
        scene.collection.objects.link(obj)
        obj.location=location
        obj.rotation_euler=(Vector((0,0,height*.48))-obj.location).to_track_quat("-Z","Y").to_euler()
        data.energy=energy
        data.color=color
        data.shape="DISK"
        data.size=size

    moon_energy=height*height*2.6
    area(f"LGT_{number:02d}_Moon",(-height*.55,-height*.70,height*.90),
         moon_energy,(.64,.75,1),height*.55)
    area(f"LGT_{number:02d}_Rim",(height*.55,height*.40,height*.83),
         moon_energy*.75,(.47,.55,.90),height*.48)
    area(f"LGT_{number:02d}_Fire",(0,-height*.38,height*.45),
         moon_energy*.26,(1,.46,.19),height*.33)
    world=bpy.data.worlds.new(f"World_Account_{number:02d}_8bit")
    scene.world=world
    world.use_nodes=True
    bg=next(n for n in world.node_tree.nodes if n.type=="BACKGROUND")
    bg.inputs["Color"].default_value=(.008,.011,.024,1)
    bg.inputs["Strength"].default_value=.5
    scene.render.engine="CYCLES"
    scene.cycles.samples=40
    scene.cycles.use_denoising=False
    scene.render.image_settings.file_format="PNG"
    scene.render.resolution_x=256
    scene.render.resolution_y=256
    scene.render.resolution_percentage=100
    scene.view_settings.view_transform="Standard"
    scene.view_settings.look="Medium High Contrast"
    scene.view_settings.exposure=.85
    scene.frame_set(1)

    bpy.ops.object.select_all(action="DESELECT")
    building.select_set(True)
    for obj in fires: obj.select_set(True)
    bpy.context.view_layer.objects.active=building
    bpy.ops.export_scene.gltf(filepath=str(OUT/(stem+".glb")),
                              export_format="GLB",use_selection=True,
                              use_active_scene=True,export_animations=True,
                              export_animation_mode="NLA_TRACKS",
                              export_anim_slide_to_zero=True,
                              export_force_sampling=True)
    scene.render.filepath=str(OUT/(stem+".png"))
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/(stem+".blend")))

    # Deliberately pixelated output: 256-square render, 4x nearest enlargement.
    work=OUT/".work"
    work.mkdir(exist_ok=True)
    scene.render.filepath=str(work/(stem+"_256.png"))
    bpy.ops.render.render(write_still=True)
    src=bpy.data.images.load(scene.render.filepath,check_existing=False)
    pixels=np.empty(256*256*4,dtype=np.float32)
    src.pixels.foreach_get(pixels)
    large=np.repeat(np.repeat(pixels.reshape(256,256,4),4,axis=0),4,axis=1)
    image=bpy.data.images.new(stem+"_pixel",width=1024,height=1024,alpha=True)
    image.pixels.foreach_set(large.ravel())
    image.filepath_raw=str(OUT/(stem+".png"))
    image.file_format="PNG"
    image.save()
    Path(scene.render.filepath).unlink()
    print("BUILT",stem,"faces",len(static.faces),"small fire loops",len(fires))


for number in (1,2,3):
    make(number)
