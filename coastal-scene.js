import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { beaches, beachPoint } from './coastal-plan.js';
import { blocks, isOnLand } from './city-plan.js';
import { BEACH_SET_OUT as QUAY_OUT } from './coastal-plan.js'; // the widened shore street: the quay is this far out

export async function createCoastalScene() {
  const loader = new GLTFLoader();
  const [gltf, waterfrontGltf] = await Promise.all([
    loader.loadAsync('./models/everything-else/gotham_coastal_kit.glb'),
    loader.loadAsync('./models/waterfront/gotham_waterfront_kit.glb'),
  ]);
  const group = new THREE.Group(); group.name = 'Blender coastal districts';
  function prototype(name) {
    let found;
    gltf.scene.traverse(node => { if (node.name.replace(/[._]?\d+$/, '') === name) found = node; });
    if (!found) throw new Error(`Coastal asset missing: ${name}`);
    return found;
  }
  function place(name, x, y, z, rotation = 0, scale = 1) {
    const root = prototype(name).clone(true);
    root.position.set(x,y,z); root.rotation.y = rotation; root.scale.setScalar(scale);
    root.traverse(node => { if (node.isMesh) { node.castShadow = name !== 'Beach_Sand_Patch'; node.receiveShadow = true; } });
    group.add(root); return root;
  }
  const waterfrontGroup = new THREE.Group(); waterfrontGroup.name = 'Gotham waterfront infrastructure'; group.add(waterfrontGroup);
  function waterfrontPrototype(name) {
    const found = waterfrontGltf.scene.getObjectByName(name);
    if (!found) throw new Error(`Waterfront asset missing: ${name}`);
    return found;
  }
  function placeWaterfront(name,x,y,z,rotation=0,scale=1) {
    const model=waterfrontPrototype(name).clone(true);
    model.name=name; model.position.set(x,y,z); model.rotation.y=rotation; model.scale.setScalar(scale);
    model.traverse(node=>{if(node.isMesh){node.castShadow=true;node.receiveShadow=true;}});
    waterfrontGroup.add(model); return model;
  }
  for (const beach of beaches) {
    const origin = beachPoint(beach, 0, 0);
    const patch = place('Beach_Sand_Patch', origin.x, 0, origin.z, beach.rotation);
    patch.name = beach.name;
    const local = (name, x, y, z, angle = 0, scale = 1) => {
      const p = beachPoint(beach, x, z); return place(name, p.x, y, p.z, beach.rotation + angle, scale);
    };
    const waterfrontLocal=(name,x,y,z,angle=0,scale=1)=>{
      const p=beachPoint(beach,x,z); return placeWaterfront(name,p.x,y,p.z,beach.rotation+angle,scale);
    };
    local('Beach_Steps', 0, 0, 0);
    // A short boardwalk (the kit's segment is 12 units long, so it's scaled down); Reatton has the fishing pier instead.
    if (beach.name !== 'Reatton Beach') waterfrontLocal('Beach_Boardwalk_Segment',0,.12,.12,0,.45);
    for (const x of [-10.5,-8.7,8.8,10.4]) {
      local('Coast_Rock', x, -.05, 1.3 + Math.abs(x) % 2, x, beach.style === 'rocky' ? 1.7 : .9);
      local('Dune_Grass', x + .5, .1, .7, x);
    }
    for (const x of [-7,-3,3,7]) local('Dune_Grass', x, .08, .6, x, .8);
    if (beach.style !== 'rocky') {
      for (const [x,z] of [[-6,2.3],[5,3.1]]) {
        local('Beach_Umbrella', x, .02, z);
        local('Beach_Lounger', x + 1.3, -.02, z + .2, .15);
      }
      local('Lifeguard_Hut', beach.name === 'Reatton Beach' ? 1.5 : 8, .02, 1.5, -.2); // Reatton's fishing pier stands at x 7.5
    } else {
      local('Coast_Bench', -4, .08, .8, Math.PI);
      local('Coast_Rock', 6, -.18, 5.5, .7, 1.9);
    }
  }

  // Atharva's waterfront kit, anchored to the Gotham map's blocks rather than fixed coordinates.
  // The lighthouse stands offshore off Uptown's north-east tip (North Point Park), clear of the coast road and sand, on a
  // base of the beaches' coast rocks piled up big. Its beacon sweep stays a live pivot.
  const point = blocks.find((b) => b.district === 'North Point Park');
  let lighthouse = null;
  if (point) {
    const [lx, lz] = [point.x + 15, point.z - 15];
    [[0, 0, 4.6, 0], [2.6, 1.2, 3.4, 1.1], [-2.4, 1.6, 3.2, 2.3], [1.4, -2.6, 3.6, 3.7], [-2.2, -2.0, 3.0, 5.0], [3.4, -1.0, 2.6, 0.4]]
      .forEach(([dx, dz, scale, turn]) => place('Coast_Rock', lx + dx, -1.4, lz + dz, turn, scale));
    lighthouse = placeWaterfront('Lighthouse_North_Head', lx, 3.0, lz); // on top of the central rock
  }
  const sweep = lighthouse?.getObjectByName('Lighthouse_Beam_Sweep');

  // Stevensburgh Strand (Downtown's south beach) gets the beach activity and the kiosk.
  const south = beaches.find((b) => b.name === 'Stevensburgh Strand');
  if (south) {
    const local = (name, x, y, z, angle = 0) => { const p = beachPoint(south, x, z); return placeWaterfront(name, p.x, y, p.z, south.rotation + angle); };
    local('Beach_Volleyball_Net', -4, .12, 2.2);
    local('Boardwalk_IceCream_Stand', 2.7, .14, 1.5);
  }

  // The fishing pier and its figures reach out from Reatton Beach.
  const west = beaches.find((b) => b.name === 'Reatton Beach');
  if (west) { const p = beachPoint(west, 7.5, 0); placeWaterfront('Fishing_Pier_People', p.x, .08, p.z, west.rotation); }

  // Ports: marina, crane, warehouse, containers, bollards and a breakwater on each dock block's sea face. The kit is
  // modelled big (the crane alone is 23 units), so it is scaled to fit a 9-unit block. Kit pieces face +Z offshore;
  // a port on a west shore is the same layout mirrored.
  const PORT_SCALE = 0.38;
  for (const dock of blocks.filter((b) => b.format === 'dockyard')) {
    const side = isOnLand(dock.x + 12, dock.z) ? -1 : 1; // which side is the sea
    const face = dock.x + side * (6 + QUAY_OUT); // the quay edge, past the widened shore street
    const out = (d) => face + side * d; // d > 0: further offshore
    const offshore = side > 0 ? Math.PI / 2 : -Math.PI / 2; // turns the kit's +Z toward the sea
    const k = PORT_SCALE;
    // No marina: the water under the crane, between the rock pile and the breakwater, is the cargo barge's berth.
    placeWaterfront('Gantry_Crane_Haysville', out(-1.6 - QUAY_OUT), .23, dock.z + 2.6, side > 0 ? 0 : Math.PI, k);
    placeWaterfront('Warehouse_Haysville_Docks', dock.x - side * 2.4, .23, dock.z - 1, Math.PI / 2, k);
    placeWaterfront('Container_Rust', dock.x + side * .4, .23, dock.z - 2.6, 0, k);
    placeWaterfront('Container_Teal', dock.x + side * .4, .23 + 2.6 * k, dock.z - 2.6, 0, k);
    placeWaterfront('Container_Slate', dock.x + side * .4, .23, dock.z + 3.2, 0, k);
    for (const dz of [-3.5, -1.2, 1.2, 3.5]) placeWaterfront('Harbor_Bollard', out(-.35), .23, dock.z + dz, 0, .9);
    placeWaterfront('Breakwater_Harbor_Light', out(.2), -.28, dock.z + 9.5, offshore, k);
    placeWaterfront('Riprap_Rock_Pile', out(.4), -.25, dock.z - 7.5, 0, .6);
  }
  // Container yards: stacks of the kit's containers (1-3 high) in two banks either side of a centre aisle.
  for (const yard of blocks.filter((b) => b.format === 'containeryard')) {
    const kinds = ['Container_Rust', 'Container_Teal', 'Container_Slate'];
    let n = 0;
    for (const dx of [-2.9, 0, 2.9]) for (const dz of [-3.6, -2.4, -1.2, 1.2, 2.4, 3.6]) {
      const height = 1 + ((n * 7 + 3) % 5) % 3; // a fixed, varied skyline
      for (let level = 0; level < height; level++) placeWaterfront(kinds[(n + level) % 3], yard.x + dx, .23 + level * .98, yard.z + dz, 0, PORT_SCALE);
      n++;
    }
  }
  // Ace Chemicals' shore: a line of bollards (the landmark fills its block, so no containers).
  const ace = blocks.find((b) => b.format === 'landmark' && b.district === 'Haysville');
  if (ace) for (const dz of [-4, 0, 4]) placeWaterfront('Harbor_Bollard', ace.x + 5.6 + QUAY_OUT, .23, ace.z + dz, 0, 1.05);

  // Consolidate the static waterfront set by material while retaining the
  // lighthouse beam and all named scene roots for animation and inspection.
  waterfrontGroup.updateMatrixWorld(true);
  const staticBatches=new Map(), staticMeshes=[];
  waterfrontGroup.traverse(node=>{
    if(!node.isMesh||node.name==='Lighthouse_rotating_light_beam') return;
    const key=node.material.uuid;
    if(!staticBatches.has(key)) staticBatches.set(key,{material:node.material,geometries:[]});
    const geometry=node.geometry.index?node.geometry.toNonIndexed():node.geometry.clone();
    for(const attr of Object.keys(geometry.attributes)) if(!['position','normal'].includes(attr)) geometry.deleteAttribute(attr);
    geometry.applyMatrix4(node.matrixWorld); staticBatches.get(key).geometries.push(geometry); staticMeshes.push(node);
  });
  for(const batch of staticBatches.values()){
    const geometry=mergeGeometries(batch.geometries,false);
    if(!geometry) throw new Error('Waterfront geometry batching failed');
    const mesh=new THREE.Mesh(geometry,batch.material); mesh.name='Waterfront render batch'; mesh.castShadow=true; mesh.receiveShadow=true;
    waterfrontGroup.add(mesh); batch.geometries.forEach(g=>g.dispose());
  }
  staticMeshes.forEach(mesh=>mesh.parent.remove(mesh));
  waterfrontGroup.userData.renderBatches=staticBatches.size;
  waterfrontGroup.userData.update=time=>{if(sweep) sweep.rotation.y=time*.36;};
  waterfrontGroup.userData.namedAssets=['Lighthouse_North_Head','Fishing_Pier_People','Breakwater_Harbor_Light','Gantry_Crane_Haysville'];
  group.userData.update=time=>waterfrontGroup.userData.update(time);
  for (const b of blocks) {
    if (b.format === 'market') for (const dx of [-8,-4,0,4,8]) for (const dz of [-3.1,3.1]) place('Market_Stall', b.x + dx, .23, b.z + dz, dz < 0 ? Math.PI : 0);
    if (b.format === 'garden') for (const dx of [-6,6]) place('Coast_Bench', b.x + dx, .23, b.z + 1.1, Math.PI);
    if (b.format === 'plaza') {
      place('Plaza_Fountain', b.x, .23, b.z);
      for (const dx of [-3.5,3.5]) place('Coast_Bench', b.x + dx, .23, b.z + (dx < 0 ? 1.9 : -1.9), dx < 0 ? Math.PI / 2 : -Math.PI / 2); // beside the paths, facing the fountain
    }
    if (b.format === 'dockyard') {
      place('Lifeguard_Hut', b.x - 2, .23, b.z - 2);
      const sea = isOnLand(b.x + 12, b.z) ? -1 : 1;
      // The jetty stands beyond the breakwater, outside the port (north of the rock pile where the shore ends first).
      const jz = isOnLand(b.x + sea * 5, b.z + 13) ? b.z + 13 : b.z - 11;
      place('Harbor_Jetty', b.x + sea * (6 + QUAY_OUT), 0, jz, sea > 0 ? Math.PI / 2 : -Math.PI / 2, .6);
      place('Coast_Bench', b.x - 2, .23, b.z + 2, Math.PI / 2);
    }
  }
  group.userData.beaches = beaches.length;
  // Static props share a handful of render batches rather than one draw per slat.
  group.updateMatrixWorld(true);
  const batches = new Map(), sourceMeshes = [];
  group.traverse(node => {
    if (!node.isMesh) return;
    if (node.name.startsWith('Lighthouse_rotating_light_beam')) return;
    let root = node.parent;
    while (root && root.parent !== group && root !== group) root = root.parent;
    if (root === waterfrontGroup) return;
    const key = node.material.uuid + ':' + node.castShadow;
    if (!batches.has(key)) batches.set(key, { material: node.material, shadow: node.castShadow, geometry: [] });
    const geometry = node.geometry.index ? node.geometry.toNonIndexed() : node.geometry.clone();
    for (const name of Object.keys(geometry.attributes)) if (!['position','normal'].includes(name)) geometry.deleteAttribute(name);
    geometry.applyMatrix4(node.matrixWorld);
    batches.get(key).geometry.push(geometry); sourceMeshes.push(node);
  });
  for (const batch of batches.values()) {
    const geometry = mergeGeometries(batch.geometry, false);
    if (!geometry) throw new Error('Coastal geometry batching failed');
    const mesh = new THREE.Mesh(geometry, batch.material);
    mesh.name = 'Coastal render batch'; mesh.castShadow = batch.shadow; mesh.receiveShadow = true;
    group.add(mesh); batch.geometry.forEach(g => g.dispose());
  }
  sourceMeshes.forEach(mesh => mesh.parent.remove(mesh));
  group.userData.renderBatches = batches.size;
  return group;
}
