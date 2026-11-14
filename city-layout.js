import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createStylizedSea } from './stylized-sea.js';
import { createCoastalScene } from './coastal-scene.js';
import { isBeachEdge } from './coastal-plan.js';
import { seededRandom } from './city-scatter.js';


import { blocks, slots, islands, bridge, landCells, edges, FLOOR } from './city-plan.js';
export * from './city-plan.js';

export function createCity(scene) {
  const group = new THREE.Group();
  group.name = 'Density city';
  scene.add(group);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const materials = new Map();
  function cube(x, y, z, w, h, d, color) {
    if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.88 }));
    const mesh = new THREE.Mesh(box, materials.get(color));
    mesh.position.set(x, y, z); mesh.scale.set(w, h, d);
    mesh.receiveShadow = true; mesh.castShadow = true; group.add(mesh); return mesh;
  }
  const sea = createStylizedSea(islands);
  group.add(sea.root);
  const coastReady = createCoastalScene().then(coast => { group.add(coast); return coast; });
  const bridgeReady = new GLTFLoader().loadAsync('./models/everything-else/bridge_gothic_suspension.glb').then(gltf => {
    const root = gltf.scene;
    root.name = 'Inter-island gothic bridge';
    root.position.set(bridge.x, 0.06, bridge.z);
    root.scale.set(bridge.length / 20, 1, bridge.width / 3);
    root.traverse(node => {
      if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; }
    });
    group.add(root);
    return root;
  });
  const ready = Promise.allSettled([coastReady, bridgeReady]).then(results => ({
    failures: results.flatMap((result, i) => result.status === 'rejected' ? [{ asset: ['coastal scenery', 'bridge'][i], error: result.reason }] : []),
  }));
  for (const c of landCells) {
    cube(c.x, -0.89, c.z, 12, 1.82, 12, '#46515a');
    cube(c.x, 0.03, c.z, 12, 0.08, 12, '#252d35');
  }
  for (const b of blocks) {
    const color = b.format === 'garden' ? '#496455' : b.format === 'market' ? '#666258' : b.format === 'plaza' ? '#8a8475' : b.format === 'dockyard' ? '#64665d' : '#555c62';
    cube(b.x, 0.12, b.z, b.width, 0.22, b.depth, color);
    if (b.format === 'terrace' || b.format === 'courtyard') for (const side of [-1, 1]) {
      const turned = b.format === 'terrace';
      cube(b.x + (turned ? side * 4.2 : 0), .12, b.z + (turned ? 0 : side * 4.2), turned ? .65 : 8, .22, turned ? 8 : .65, '#555c62');
    }
    if (b.format === 'garden') {
      cube(b.x, 0.245, b.z, b.width - 1, 0.05, 7.8, '#3f5a49');
      cube(b.x, 0.28, b.z, b.width, 0.05, 1, '#9c9581');

    }
    if (b.format === 'courtyard') cube(b.x, .25, b.z, .6, .04, 7.5, '#9c9581');
  }
  for (const edge of edges) {
    if (edge.shore && !isBeachEdge(edge)) {
      // Open both seawalls across the full bridge approach, including its sidewalks.
      const approach = edge.vertical && Math.abs(edge.x - bridge.x) <= bridge.length / 2 && Math.abs(edge.z - bridge.z) < 6 + bridge.width * .75;
      const intervals = approach
        ? [[edge.z - 6, Math.min(edge.z + 6, bridge.z - bridge.width * .75)], [Math.max(edge.z - 6, bridge.z + bridge.width * .75), edge.z + 6]]
        : [[edge.z - 6, edge.z + 6]];
      for (const [start, end] of intervals) {
        if (end <= start) continue;
        const z = edge.vertical ? (start + end) / 2 : edge.z;
        const length = end - start;
        cube(edge.x, -.15, z, edge.vertical ? .25 : 12, .45, edge.vertical ? length : .25, '#778c91');
        cube(edge.x, -.47, z, edge.vertical ? .6 : 12, .025, edge.vertical ? length : .6, '#67969d');
      }
    } else if (!edge.shore) {
      for (const offset of [-4.5, -1.5, 1.5, 4.5]) cube(edge.x + (edge.vertical ? 0 : offset), .085, edge.z + (edge.vertical ? offset : 0), edge.vertical ? .06 : 1.2, .015, edge.vertical ? 1.2 : .06, '#b1a383');
    }
  }
  const matrix = new THREE.Matrix4();
  // Batch static streets and slabs by material as the map grows.
  for (const material of materials.values()) {
    const pieces = group.children.filter(child => child.isMesh && !child.isInstancedMesh && child.material === material);
    if (!pieces.length) continue;
    const batch = new THREE.InstancedMesh(box, material, pieces.length);
    pieces.forEach((piece, i) => { piece.updateMatrix(); batch.setMatrixAt(i, piece.matrix); group.remove(piece); });
    batch.receiveShadow = true; batch.castShadow = true; group.add(batch);
  }
  const parkParts = [
    { color: '#465e50', offsets: [0], y: 0.245, size: [3.5, 0.05, 3.5] },
  ].map(part => {
    part.mesh = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ color: part.color }), slots.length * part.offsets.length);
    part.mesh.castShadow = true; part.mesh.receiveShadow = true; group.add(part.mesh); return part;
  });
  function sync(occupants) {
    for (const part of parkParts) {
      let index = 0;
      slots.forEach((slot, i) => {
        if (occupants.has(i)) return;
        for (const dx of part.offsets) {
          matrix.compose(new THREE.Vector3(slot.x + dx, part.y, slot.z), new THREE.Quaternion(), new THREE.Vector3(...part.size));
          part.mesh.setMatrixAt(index++, matrix);
        }
      });
      part.mesh.count = index; part.mesh.instanceMatrix.needsUpdate = true;
      part.mesh.computeBoundingSphere();
    }
  }
  sync(new Map());
  return { sync, group, ready, update(time) { sea.update(time); } };
}

export function landmarkLabel(name) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 64;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#1b252dee'; ctx.fillRect(0, 0, 512, 64);
  ctx.fillStyle = '#eee6ce'; ctx.font = '24px monospace'; ctx.textAlign = 'center'; ctx.fillText(name, 256, 41);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
  sprite.scale.set(6, 0.75, 1); return sprite;
}
