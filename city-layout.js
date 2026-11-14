import * as THREE from 'three';
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
  const ready = createCoastalScene().then(coast => { group.add(coast); return coast; });
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
      cube(edge.x, -.15, edge.z, edge.vertical ? .25 : 12, .45, edge.vertical ? 12 : .25, '#778c91');
      cube(edge.x, -.47, edge.z, edge.vertical ? .6 : 12, .025, edge.vertical ? 12 : .6, '#67969d');
    } else if (!edge.shore) {
      for (const offset of [-4.5, -1.5, 1.5, 4.5]) cube(edge.x + (edge.vertical ? 0 : offset), .085, edge.z + (edge.vertical ? offset : 0), edge.vertical ? .06 : 1.2, .015, edge.vertical ? 1.2 : .06, '#b1a383');
    }
  }
  // Deliberately simple placeholder; replace this named group with the final bridge GLB.
  const bridgeRoot = new THREE.Group(); bridgeRoot.name = 'Inter-island bridge placeholder'; group.add(bridgeRoot);
  bridgeRoot.attach(cube(bridge.x, 0.04, bridge.z, bridge.length, 0.3, bridge.width, '#68727d'));
  for (const side of [-1, 1]) bridgeRoot.attach(cube(bridge.x, 0.48, bridge.z + side * 1.6, bridge.length, 0.6, 0.18, '#c4b58d'));
  for (let x = islands[0].maxX; x < islands[1].minX; x += 3) bridgeRoot.attach(cube(x + 1, 0.2, bridge.z, 1.2, 0.02, 0.06, '#d4c9aa'));
  const matrix = new THREE.Matrix4();
  // Batch static streets, slabs and bridge pieces by material as the map grows.
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
