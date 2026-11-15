"""Build a compact, pixel-styled Wayne Tower for the BreachLink plots."""

from pathlib import Path
import bpy
from mathutils import Vector

OUT = Path(__file__).resolve().parent
SCENE_NAME = "Wayne Tower"

# A fresh scene keeps the exported asset independent of the preview setup.
scene = bpy.data.scenes.new(SCENE_NAME)
bpy.context.window.scene = scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1.0


def material(name, color, emission=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    bsdf = next(node for node in mat.node_tree.nodes if node.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (*color, 1.0)
    bsdf.inputs['Metallic'].default_value = 0.0
    bsdf.inputs['Roughness'].default_value = 1.0
    if emission:
        bsdf.inputs['Emission Color'].default_value = (*color, 1.0)
        bsdf.inputs['Emission Strength'].default_value = emission
    return mat


materials = [
    material('wayne_stone_slate', (0.075, 0.092, 0.135)),
    material('wayne_stone_shadow', (0.035, 0.047, 0.082)),
    material('wayne_stone_edge', (0.17, 0.19, 0.25)),
    material('wayne_window_recess', (0.012, 0.016, 0.028)),
    material('wayne_window_glow', (0.93, 0.45, 0.11), 1.15),
    material('wayne_window_dim', (0.34, 0.15, 0.035), 0.35),
    material('wayne_window_off', (0.014, 0.017, 0.025)),
    material('wayne_sign_gold', (1.0, 0.72, 0.30), 0.7),
    material('wayne_beacon_red', (0.95, 0.025, 0.015), 1.0),
]

verts, faces, face_materials = [], [], []
panes = []


def polygon(points, mat):
    start = len(verts)
    verts.extend(points)
    faces.append(tuple(range(start, start + len(points))))
    face_materials.append(mat)


def box(center, size, mat):
    x, y, z = center
    a, b, c = (dimension / 2 for dimension in size)
    p = [(x-a,y-b,z-c),(x+a,y-b,z-c),(x+a,y+b,z-c),(x-a,y+b,z-c),
         (x-a,y-b,z+c),(x+a,y-b,z+c),(x+a,y+b,z+c),(x-a,y+b,z+c)]
    for ids in ((0,3,2,1),(4,5,6,7),(0,1,5,4),
                (1,2,6,5),(2,3,7,6),(3,0,4,7)):
        polygon([p[i] for i in ids], mat)


def pane(side, x_or_y, z, wall, width, height, name, state='glow'):
    """A dark recess plus a separately addressable luminous plane."""
    if side in ('front', 'back'):
        face_axis = -1 if side == 'front' else 1
        box((x_or_y, wall + face_axis * .018, z), (width+.09, .04, height+.09), 1)
        plane = [(x_or_y-width/2, wall + face_axis*.044, z-height/2),
                 (x_or_y+width/2, wall + face_axis*.044, z-height/2),
                 (x_or_y+width/2, wall + face_axis*.044, z+height/2),
                 (x_or_y-width/2, wall + face_axis*.044, z+height/2)]
    else:
        face_axis = -1 if side == 'left' else 1
        box((wall + face_axis*.018, x_or_y, z), (.04, width+.09, height+.09), 1)
        plane = [(wall + face_axis*.044, x_or_y-width/2, z-height/2),
                 (wall + face_axis*.044, x_or_y+width/2, z-height/2),
                 (wall + face_axis*.044, x_or_y+width/2, z+height/2),
                 (wall + face_axis*.044, x_or_y-width/2, z+height/2)]
    mesh = bpy.data.meshes.new(name + '_mesh')
    mesh.from_pydata(plane, [], [(0,1,2,3)])
    mesh.materials.append(materials[{'glow':4, 'dim':5, 'off':6}[state]])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj['window_id'] = name
    obj['initial_state'] = state
    scene.collection.objects.link(obj)
    panes.append(obj)


def window_state(index):
    return 'off' if index % 9 == 0 else 'dim' if index % 5 == 0 else 'glow'


# The plinth and facade stay inside the agreed 4 x 4 m plot.
box((0,0,.10), (4.0,4.0,.20), 1)
box((0,0,.23), (3.90,3.90,.08), 2)
box((0,.12,.75), (3.54,3.22,1.02), 0)
box((0,.12,1.30), (3.63,3.31,.10), 2)

# A tall centre shaft and two lower stepped wings make the reference silhouette.
box((0,.23,2.55), (1.62,2.58,4.65), 0)
for sign in (-1,1):
    x = sign*1.22
    box((x,.23,1.73), (.98,2.72,2.93), 0)
    box((x,.23,3.22), (1.05,2.78,.12), 2)
    box((x,.35,3.57), (.70,2.18,.60), 1)
    box((x,.35,3.90), (.78,2.25,.10), 2)
    box((sign*.77,.23,2.55), (.10,2.72,4.65), 2)
    for y in (-1.09,1.55):
        box((sign*1.73,y,1.76), (.09,.09,2.85), 1)
    box((sign*1.43,-1.19,2.10), (.10,.10,3.62), 2)

box((0,.23,4.94), (1.77,2.68,.18), 2)
box((0,.28,5.13), (1.30,2.12,.27), 1)
box((0,.28,5.31), (1.38,2.20,.10), 2)
box((0,.29,5.43), (.84,1.25,.18), 0)
box((0,.29,5.56), (.93,1.34,.09), 2)
box((0,.29,5.76), (.18,.18,.40), 1)
box((0,.29,5.975), (.18,.18,.05), 8)

# Three short side beacons echo the red tips in the reference.
for x, y, height in ((-1.55,-.90,4.34),(1.55,-.90,4.34),(-1.72,.72,3.47),(1.72,.72,3.47)):
    box((x,y,height-.19), (.07,.07,.38), 1)
    box((x,y,height+.018), (.09,.09,.045), 8)

# Repeated windows stay large enough to read from the schematic city camera.
counter = 0
for floor, z in enumerate((1.53,1.99,2.45,2.91,3.37,3.83), start=1):
    for column, x in enumerate((-.31,.31), start=1):
        counter += 1
        pane('front',x,z,-1.06,.19,.31,
             f'window_f{floor:02d}_front_core_c{column:02d}',window_state(counter))
    if floor <= 4:
        for wing, x in (('left',-1.22),('right',1.22)):
            counter += 1
            pane('front',x,z,-1.13,.21,.29,
                 f'window_f{floor:02d}_front_{wing}_c01',window_state(counter))

for side, wall in (('left',-1.72),('right',1.72)):
    for floor,z in enumerate((.76,1.22,1.68,2.14,2.60,3.06), start=1):
        for column,y in enumerate((-.38,.54), start=1):
            counter += 1
            pane(side,y,z,wall,.22,.30,
                 f'window_f{floor:02d}_{side}_c{column:02d}',window_state(counter))

for side, wall in (('left',-1.72),('right',1.72)):
    for column,y in enumerate((-.38,.54), start=1):
        counter += 1
        pane(side,y,3.57,wall,.18,.27,
             f'window_f07_{side}_wing_c{column:02d}',window_state(counter))

for side, wall in (('left',-.81),('right',.81)):
    for floor,z in enumerate((3.60,4.02,4.44), start=7):
        counter += 1
        pane(side,.20,z,wall,.20,.26,
             f'window_f{floor:02d}_{side}_upper_c01',window_state(counter))

for column,x in enumerate((-.30,0,.30),start=1):
    pane('front',x,5.16,-.78,.13,.21,
         f'window_f10_front_crown_c{column:02d}','glow')

# A warm entrance with blocky stepped arch and two individually lit door panes.
box((0,-1.72,.73), (.92,.10,1.16), 1)
box((0,-1.79,1.26), (.85,.08,.12), 2)
box((0,-1.80,1.34), (.61,.08,.09), 2)
box((0,-1.81,1.40), (.36,.08,.07), 2)
for x,z,w in ((0,1.37,1.18),(0,1.47,.92),(-.48,.84,.11),(.48,.84,.11)):
    box((x,-1.80,z), (w,.10,.10 if x == 0 else 1.12), 2)
for column,x in enumerate((-.18,.18), start=1):
    pane('front',x,.72,-1.78,.27,.72,
         f'window_f00_front_entrance_c{column:02d}','glow')
box((0,-1.88,.74), (.045,.04,.72), 1)
for column,x in enumerate((-1.17,1.17),start=1):
    pane('front',x,.72,-1.50,.23,.33,
         f'window_f00_front_wing_c{column:02d}','glow')
for side,wall in (('left',-1.77),('right',1.77)):
    for column,y in enumerate((-.58,.58),start=1):
        pane(side,y,.72,wall,.25,.34,
             f'window_f00_{side}_podium_c{column:02d}','glow')

# A dark inset carries a pixel-letter W above WAYNE. All lettering is geometry.
box((0,-1.16,4.41), (1.45,.10,.79), 1)
box((0,-1.222,4.41), (1.31,.035,.66), 3)
PIXELS = {
    'W': ('10001','10001','10101','10101','01010'),
    'A': ('010','101','111','101','101'),
    'Y': ('101','101','010','010','010'),
    'N': ('101','111','111','111','101'),
    'E': ('111','100','110','100','111'),
}


def pixel_letter(letter, cx, cz, pitch):
    rows = PIXELS[letter]
    width = len(rows[0])
    for row, bits in enumerate(rows):
        for column, bit in enumerate(bits):
            if bit == '1':
                box((cx+(column-(width-1)/2)*pitch,-1.249,
                     cz+(2-row)*pitch), (pitch*.78,.025,pitch*.78), 7)


pixel_letter('W',0,4.61,.083)
for index,letter in enumerate('WAYNE'):
    pixel_letter(letter,(index-2)*.235,4.27,.055)

# Pale vertical strips and thin ledges finish the blocky Art Deco treatment.
for sign in (-1,1):
    box((sign*.59,-1.10,2.46), (.085,.09,2.18), 2)
    box((sign*.72,-1.08,4.42), (.09,.11,.82), 2)
for z in (1.31,3.18,4.95):
    box((0,-1.10,z), (1.73,.12,.075), 2)

mesh = bpy.data.meshes.new('WayneTowerBodyMesh')
mesh.from_pydata(verts,[],faces)
for mat in materials:
    mesh.materials.append(mat)
mesh.update()
for poly, mat_index in zip(mesh.polygons,face_materials):
    poly.material_index = mat_index
building = bpy.data.objects.new('Wayne Tower | 4x4x6m',mesh)
building['dimensions_m'] = '4 x 4 x 6'
building['pivot'] = 'bottom center at (0, 0, 0)'
scene.collection.objects.link(building)
for obj in panes:
    obj.parent = building

# Preview camera and lights are saved in the BLEND but excluded from the GLB.
camera_data = bpy.data.cameras.new('Wayne Preview Camera')
camera = bpy.data.objects.new('Wayne Preview Camera',camera_data)
scene.collection.objects.link(camera)
camera.location = (8,-10,8.3)
camera.rotation_euler = (Vector((0,0,3.0))-camera.location).to_track_quat('-Z','Y').to_euler()
camera_data.type = 'ORTHO'
camera_data.ortho_scale = 7.8
scene.camera = camera


def area(name, location, energy, color, size):
    data = bpy.data.lights.new(name,'AREA')
    obj = bpy.data.objects.new(name,data)
    scene.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (Vector((0,0,3.0))-obj.location).to_track_quat('-Z','Y').to_euler()
    data.energy = energy
    data.color = color
    data.shape = 'DISK'
    data.size = size


area('Cool key',(3,-5,9),650,(.70,.79,1.0),6)
area('Dim fill',(-5,2,6),350,(.76,.75,.93),5)
world = bpy.data.worlds.new('Wayne dark navy')
world.use_nodes = True
background = next(node for node in world.node_tree.nodes if node.type == 'BACKGROUND')
background.inputs['Color'].default_value = (.008,.012,.026,1)
background.inputs['Strength'].default_value = .45
scene.world = world
scene.render.engine = 'CYCLES'
scene.cycles.samples = 64
scene.render.resolution_x = 512
scene.render.resolution_y = 512
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = str(OUT / 'wayne_tower.png')
scene.view_settings.view_transform = 'Standard'

bpy.ops.object.select_all(action='DESELECT')
building.select_set(True)
for obj in panes:
    obj.select_set(True)
bpy.context.view_layer.objects.active = building
bpy.ops.export_scene.gltf(
    filepath=str(OUT / 'wayne_tower.glb'), export_format='GLB',
    use_selection=True, use_active_scene=True, export_yup=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'wayne_tower.blend'))
bpy.ops.render.render(write_still=True)
print('Wayne Tower:',len(panes),'individual windows;',len(faces),'body faces')
