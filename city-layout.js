import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createStylizedSea } from './stylized-sea.js';
import { createCoastalScene } from './coastal-scene.js';
import { isBeachEdge } from './coastal-plan.js';
import { seededRandom } from './city-scatter.js';


import { blocks, slots, islands, bridges, landCells, edges, landmarks, FLOOR } from './city-plan.js';
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
  let coastalRoot = null;
  const coastReady = createCoastalScene().then(coast => { coastalRoot = coast; group.add(coast); return coast; });
  // Atharva's bridge models (20 units long along X, 3-unit road, pivot at the road centre): one per bridge in
  // city-plan.js, stretched to its span and turned for north-south crossings.
  const bridgeFiles = { gothic: 'bridge_gothic_suspension.glb', narrows: 'bridge_narrows_ironworks.glb', blackgate: 'bridge_blackgate_viaduct.glb' };
  const loader = new GLTFLoader();
  const bridgeReady = Promise.all(Object.entries(bridgeFiles).map(([style, file]) => loader.loadAsync(`./models/everything-else/${file}`).then((gltf) => [style, gltf.scene])))
    .then((loaded) => {
      const models = Object.fromEntries(loaded);
      const bridgeGroup = new THREE.Group();
      bridgeGroup.name = 'Gotham bridges';
      for (const bridge of bridges) {
        const root = (models[bridge.style] ?? models.gothic).clone(true);
        root.position.set(bridge.x, 0.06, bridge.z);
        root.scale.set(bridge.length / 20, 1, bridge.width / 3);
        if (bridge.vertical) root.rotation.y = Math.PI / 2;
        root.traverse((node) => { if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; } });
        bridgeGroup.add(root);
      }
      group.add(bridgeGroup);
      return bridgeGroup;
    });
  const ready = Promise.allSettled([coastReady, bridgeReady]).then(results => ({
    failures: results.flatMap((result, i) => result.status === 'rejected' ? [{ asset: ['coastal scenery', 'bridge'][i], error: result.reason }] : []),
  }));
  for (const c of landCells) {
    cube(c.x, -0.89, c.z, 12, 1.82, 12, '#46515a');
    cube(c.x, 0.03, c.z, 12, 0.08, 12, '#252d35');
  }
  for (const b of blocks) {
    const color = b.format === 'suburb' ? '#3c5040' : b.format === 'garden' ? '#496455' : b.format === 'market' ? '#666258' : b.format === 'plaza' ? '#496455' : b.format === 'dockyard' ? '#64665d' : '#555c62';
    cube(b.x, 0.12, b.z, b.width, 0.22, b.depth, color);
    if (b.format === 'terrace' || b.format === 'courtyard') for (const side of [-1, 1]) {
      const turned = b.format === 'terrace';
      cube(b.x + (turned ? side * 4.2 : 0), .12, b.z + (turned ? 0 : side * 4.2), turned ? .65 : 8, .22, turned ? 8 : .65, '#555c62');
    }
    if (b.format === 'plaza') cube(b.x, 0.245, b.z, b.width - 1, 0.05, b.depth - 1.2, '#3f5a49');
    if (b.format === 'garden') {
      cube(b.x, 0.245, b.z, b.width - 1, 0.05, b.depth - 1.2, '#3f5a49');

    }
    if (b.format === 'courtyard') cube(b.x, .25, b.z, .6, .04, 7.5, '#9c9581');
    if (b.format === 'avenue') {
      // The bridge's road carries straight on through the block, across both ring streets, with lane dashes.
      const alongX = b.avenue === 'x';
      cube(b.x, 0.235, b.z, alongX ? 12 : 3, 0.03, alongX ? 3 : 12, '#252d35');
      for (const t of [-4.5, -1.5, 1.5, 4.5]) cube(b.x + (alongX ? t : 0), 0.255, b.z + (alongX ? 0 : t), alongX ? 1.2 : .06, .01, alongX ? .06 : 1.2, '#b1a383');
    }
  }
  // Which side of a shore edge is land, and which block owns that land.
  const landAt = new Map(landCells.map((c) => [`${c.x},${c.z}`, c]));
  const blockOf = new Map();
  blocks.forEach((b) => b.cells.forEach((c) => blockOf.set(`${c.x},${c.z}`, b)));
  const shoreSide = (edge) => {
    const [a, b] = edge.vertical ? [[edge.x - 6, edge.z], [edge.x + 6, edge.z]] : [[edge.x, edge.z - 6], [edge.x, edge.z + 6]];
    const inner = landAt.has(`${a[0]},${a[1]}`) ? a : b;
    const outward = edge.vertical ? Math.sign(edge.x - inner[0]) : Math.sign(edge.z - inner[1]);
    return { block: blockOf.get(`${inner[0]},${inner[1]}`), outward };
  };
  // Working waterfronts keep their seawall: the docks and Ace Chemicals.
  const keepsSeawall = (block) => block?.format === 'dockyard' || landmarks.some((l) => l.name === 'Ace Chemicals' && blocks[l.block] === block);
  // A thin sand border on the water side: a dry upper strip and a wet lower lip, overlapping at the corners.
  const sandStrip = (edge, outward) => {
    for (const [offset, width, top, color] of [[0.6, 1.2, 0.0, '#c9b48a'], [1.5, 0.8, -0.32, '#a8916a']]) {
      const across = edge.vertical ? edge.x + outward * offset : edge.z + outward * offset;
      const length = 12 + 2.6;
      const height = top + 0.9;
      cube(edge.vertical ? across : edge.x, top - height / 2, edge.vertical ? edge.z : across, edge.vertical ? width : length, height, edge.vertical ? length : width, color);
    }
  };
  for (const edge of edges) {
    const side = edge.shore && !isBeachEdge(edge) ? shoreSide(edge) : null;
    if (side && !keepsSeawall(side.block)) {
      sandStrip(edge, side.outward);
    } else if (edge.shore && !isBeachEdge(edge)) {
      // Open the seawall across every bridge approach (with its sidewalks): an east-west bridge crosses vertical edges,
      // a north-south one crosses horizontal edges.
      const along = edge.vertical ? edge.z : edge.x;
      const crossing = bridges.find((b) => b.vertical !== edge.vertical
        && Math.abs(edge.vertical ? edge.x - b.x : edge.z - b.z) <= b.length / 2 + 0.01
        && Math.abs(along - (edge.vertical ? b.z : b.x)) < 6 + b.width * .75);
      const centre = crossing ? (edge.vertical ? crossing.z : crossing.x) : 0;
      const halfGap = crossing ? crossing.width * .75 : 0;
      const intervals = crossing
        ? [[along - 6, Math.min(along + 6, centre - halfGap)], [Math.max(along - 6, centre + halfGap), along + 6]]
        : [[along - 6, along + 6]];
      for (const [start, end] of intervals) {
        if (end <= start) continue;
        const mid = (start + end) / 2;
        const length = end - start;
        cube(edge.vertical ? edge.x : mid, -.15, edge.vertical ? mid : edge.z, edge.vertical ? .25 : length, .45, edge.vertical ? length : .25, '#778c91');
        cube(edge.vertical ? edge.x : mid, -.47, edge.vertical ? mid : edge.z, edge.vertical ? .6 : length, .025, edge.vertical ? length : .6, '#67969d');
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
  return { sync, group, ready, update(time) { sea.update(time); coastalRoot?.userData.update?.(time); } };
}

export function landmarkLabel(name) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 64;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#1b252dee'; ctx.fillRect(0, 0, 512, 64);
  ctx.fillStyle = '#eee6ce'; ctx.font = '24px monospace'; ctx.textAlign = 'center'; ctx.fillText(name, 256, 41);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
  sprite.scale.set(6, 0.75, 1); return sprite;
}
