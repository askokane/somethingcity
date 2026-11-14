import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { beaches, beachPoint } from './coastal-plan.js';
import { blocks } from './city-plan.js';

export async function createCoastalScene() {
  const gltf = await new GLTFLoader().loadAsync('./models/everything-else/gotham_coastal_kit.glb');
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
  for (const beach of beaches) {
    const patch = place('Beach_Sand_Patch', beach.x, 0, beach.z, beach.rotation);
    patch.name = beach.name;
    const local = (name, x, y, z, angle = 0, scale = 1) => {
      const p = beachPoint(beach, x, z); return place(name, p.x, y, p.z, beach.rotation + angle, scale);
    };
    local('Beach_Steps', 0, 0, 0);
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
      local('Lifeguard_Hut', 8, .02, 1.5, -.2);
    } else {
      local('Coast_Bench', -4, .08, .8, Math.PI);
      local('Coast_Rock', 6, -.18, 5.5, .7, 1.9);
    }
  }
  for (const b of blocks) {
    if (b.format === 'market') for (const dx of [-8,-4,0,4,8]) for (const dz of [-3.1,3.1]) place('Market_Stall', b.x + dx, .23, b.z + dz, dz < 0 ? Math.PI : 0);
    if (b.format === 'garden') for (const dx of [-6,6]) place('Coast_Bench', b.x + dx, .23, b.z + 1.1, Math.PI);
    if (b.format === 'plaza') {
      place('Plaza_Fountain', b.x, .23, b.z);
      for (const dx of [-3.5,3.5]) place('Coast_Bench', b.x + dx, .23, b.z + (dx < 0 ? 1.9 : -1.9), dx < 0 ? Math.PI / 2 : -Math.PI / 2); // beside the paths, facing the fountain
    }
    if (b.format === 'dockyard') {
      place('Lifeguard_Hut', b.x - 2, .23, b.z - 2);
      place('Harbor_Jetty', b.x + 9, 0, b.z, Math.PI / 2); // off the block's east (sea) edge
      place('Coast_Bench', b.x - 2, .23, b.z + 2, Math.PI / 2);
    }
  }
  group.userData.beaches = beaches.length;
  // Static props share a handful of render batches rather than one draw per slat.
  group.updateMatrixWorld(true);
  const batches = new Map(), sourceMeshes = [];
  group.traverse(node => {
    if (!node.isMesh) return;
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
