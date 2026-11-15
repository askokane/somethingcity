import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createStylizedSea } from './stylized-sea.js';
import { createCoastalScene } from './coastal-scene.js';
import { isBeachEdge } from './coastal-plan.js';
import { seededRandom } from './city-scatter.js';


import { blocks, slots, islands, bridges, landCells, edges, landmarks, FLOOR, isOnLand, SHORE_SET_OUT } from './city-plan.js';
export * from './city-plan.js';

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
// Working waterfronts keep their seawall: the docks, the container yard and Ace Chemicals.
const keepsSeawall = (block) => ['dockyard', 'containeryard'].includes(block?.format) || landmarks.some((l) => l.name === 'Ace Chemicals' && blocks[l.block] === block);
// Shoreline streets were half a street (the land-side lane, sand beyond). Away from beaches and working waterfronts the
// coast is pushed out one lane so they are full two-lane streets; keyed by the edge's midpoint "x,z".
// The widened shore's sidewalk bands, laid with Tai's sidewalk kit in app.js: { x, z, length, vertical, outward }.
export const shoreSidewalks = [];
// On the docks' and container yard's port face (the sea side the cranes work, east or west) there is no shore street:
// their deck runs from the block out to the quay. Their other shores keep the street. Keyed by edge midpoint "x,z".
const isDeckBlock = (block) => ['dockyard', 'containeryard'].includes(block?.format);
export const deckEdges = new Set(edges.filter((edge) => {
  if (!edge.shore || !edge.vertical) return false;
  const side = shoreSide(edge);
  return isDeckBlock(side.block) && side.outward === (isOnLand(side.block.x + 12, side.block.z) ? -1 : 1);
}).map((edge) => `${edge.x},${edge.z}`));
export const widenedShore = new Set(edges.filter((edge) => edge.shore && !deckEdges.has(`${edge.x},${edge.z}`)).map((edge) => `${edge.x},${edge.z}`));
const LANE_WIDTH = 1.5;

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
    const color = b.format === 'suburb' ? '#3c5040' : b.format === 'garden' ? '#496455' : b.format === 'market' ? '#666258' : b.format === 'plaza' ? '#496455' : b.format === 'dockyard' || b.format === 'containeryard' ? '#64665d' : '#555c62';
    // Inside the 0.6 sidewalk ring (Tai's kit, laid in app.js). An avenue is two strips either side of its road.
    if (b.format === 'avenue') {
      const alongX = b.avenue === 'x';
      for (const side of [-1, 1]) cube(b.x + (alongX ? 0 : side * 3), 0.12, b.z + (alongX ? side * 3 : 0), alongX ? b.width - 1.2 : 1.8, 0.22, alongX ? 1.8 : b.depth - 1.2, color);
    } else {
      cube(b.x, 0.12, b.z, b.width - 1.2, 0.22, b.depth - 1.2, color);
    }
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
      for (const t of [-4.5, -1.5, 1.5, 4.5]) cube(b.x + (alongX ? t : 0), 0.085, b.z + (alongX ? 0 : t), alongX ? 1.2 : .06, .01, alongX ? .06 : 1.2, '#b1a383');
    }
  }
  // A thin sand border on the water side: a dry upper strip and a wet lower lip, overlapping at the corners.
  // The widened shore: one more lane of asphalt, a raised sidewalk, then the sand (a dry upper strip and a wet lower lip).
  // Each layer is a band [from, to] units out from the old shoreline, mitred at the coast's corners so neighbouring
  // edges' bands meet without overlapping: at an outside corner vertical edges reach round the corner and horizontal
  // ones stop short of it; at an inside corner the reverse.
  const SIDEWALK = 0.8;
  const layers = [
    [0, LANE_WIDTH + SIDEWALK, -0.89, 1.82, '#46515a'], // the island's rock base
    [0, LANE_WIDTH, 0.03, 0.08, '#252d35'], // asphalt
    [LANE_WIDTH, LANE_WIDTH + SIDEWALK, 0.12, 0.22, '#555c62'], // sidewalk, level with the blocks' pavements
  ];
  const sandFrom = LANE_WIDTH + SIDEWALK;
  for (const [from, width, top, color] of [[0, 1.2, 0.0, '#c9b48a'], [0.9, 0.8, -0.32, '#a8916a']]) {
    layers.push([sandFrom + from, sandFrom + from + width, (top - (top + 0.9) / 2), top + 0.9, color]);
  }
  const cornerKind = (edge, outward, end) => {
    const inner = edge.vertical ? [edge.x - outward * 6, edge.z] : [edge.x, edge.z - outward * 6];
    const step = (p, along, out) => edge.vertical ? [p[0] + out, p[1] + along] : [p[0] + along, p[1] + out];
    if (!landAt.has(step(inner, end * 12, 0).join(','))) return 'outside';
    return landAt.has(step(inner, end * 12, outward * 12).join(',')) ? 'inside' : 'straight';
  };
  const sandStrip = (edge, outward, sand = true) => {
    const along = edge.vertical ? edge.z : edge.x;
    const ends = [-1, 1].map((end) => cornerKind(edge, outward, end));
    for (const [from, to, y, height, color] of sand ? layers : layers.slice(0, 3)) {
      const reach = edge.vertical ? to : from; // how far past the corner this band runs (or stops short of it)
      const [start, stop] = [-1, 1].map((end, i) => along + end * (6 + (ends[i] === 'outside' ? reach : ends[i] === 'inside' ? -reach : 0)));
      const mid = (start + stop) / 2, length = stop - start;
      const across = (edge.vertical ? edge.x : edge.z) + outward * (from + to) / 2;
      if (color === '#555c62') { // the sidewalk band: kit pieces, not a box
        shoreSidewalks.push({ x: edge.vertical ? across : mid, z: edge.vertical ? mid : across, length, vertical: edge.vertical, outward });
        continue;
      }
      cube(edge.vertical ? across : mid, y, edge.vertical ? mid : across, edge.vertical ? to - from : length, height, edge.vertical ? length : to - from, color);
    }
    for (const offset of [-4.5, -1.5, 1.5, 4.5]) cube(edge.x + (edge.vertical ? 0 : offset), .085, edge.z + (edge.vertical ? offset : 0), edge.vertical ? .06 : 1.2, .015, edge.vertical ? 1.2 : .06, '#b1a383');
  };
  for (const edge of edges) {
    const side = edge.shore ? shoreSide(edge) : null;
    if (side && !keepsSeawall(side.block)) {
      sandStrip(edge, side.outward, !isBeachEdge(edge)); // a beach brings its own sand
    } else if (side) {
      // Working waterfronts reach the same line: the docks' deck covers what was the shore street out to the quay; Ace
      // Chemicals keeps a widened street. Either way the seawall stands at the new quay edge.
      if (deckEdges.has(`${edge.x},${edge.z}`)) {
        const across = (edge.vertical ? edge.x : edge.z) + side.outward * (SHORE_SET_OUT - 1.5) / 2;
        const length = 12 + 2 * SHORE_SET_OUT; // closes the corners; a hair above the street layers it may overlap there
        cube(edge.vertical ? across : edge.x, 0.125, edge.vertical ? edge.z : across, edge.vertical ? SHORE_SET_OUT + 1.5 : length, 0.23, edge.vertical ? length : SHORE_SET_OUT + 1.5, '#64665d');
        cube(edge.vertical ? across : edge.x, -0.89, edge.vertical ? edge.z : across, edge.vertical ? SHORE_SET_OUT + 1.5 : length, 1.82, edge.vertical ? length : SHORE_SET_OUT + 1.5, '#46515a');
      } else {
        sandStrip(edge, side.outward, false);
      }
      const quay = (edge.vertical ? edge.x : edge.z) + side.outward * SHORE_SET_OUT;
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
        cube(edge.vertical ? quay : mid, -.15, edge.vertical ? mid : quay, edge.vertical ? .25 : length, .45, edge.vertical ? length : .25, '#778c91');
        cube(edge.vertical ? quay : mid, -.47, edge.vertical ? mid : quay, edge.vertical ? .6 : length, .025, edge.vertical ? length : .6, '#67969d');
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
  const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 112;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#1b252dee'; ctx.fillRect(0, 0, 768, 112);
  ctx.fillStyle = '#fff4d8'; ctx.font = 'bold 40px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(name, 384, 56, 736);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
  sprite.scale.set(9, 1.3, 1); return sprite;
}
