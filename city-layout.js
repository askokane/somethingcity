import * as THREE from 'three';

export const UNITS_PER_METER = 3 / 7;
export const FLOOR = 3 * UNITS_PER_METER;
export const GRID_SIZE = 4;
export const BLOCK_SPACING = 12;
export const blocks = Array.from({ length: GRID_SIZE ** 2 }, (_, i) => ({
  x: (i % GRID_SIZE - 1.5) * BLOCK_SPACING,
  z: (Math.floor(i / GRID_SIZE) - 1.5) * BLOCK_SPACING,
  district: ['Northpoint', 'Old Gotham', 'Crown Point', 'The Foundry'][i % 4],
}));
export const landmarks = [
  ['Wayne Tower', 'wayne_tower.glb', 0, 12],
  ['Ace Chemicals', 'ace_chemicals_8bit.glb', 3, 6],
  ['Arkham Asylum', 'arkham_asylum_8bit.glb', 1, 7],
  ['Gotham Bank', 'gotham_bank.glb', 2, 6],
  ['GCPD Headquarters', 'gcpd_hq.glb', 4, 5],
  ['Cobblepot Manor', 'cobblepot_manor.glb', 7, 5],
  ['Blackgate Penitentiary', 'blackgate_penitentiary.glb', 12, 4],
  ['Elliot Memorial', 'elliot_memorial.glb', 15, 5],
].map(([name, file, block, height]) => ({ name, file, block, height }));
const reserved = new Set(landmarks.map(l => l.block));
export const slots = blocks.flatMap((block, blockIndex) => reserved.has(blockIndex) ? [] :
  [[-2.25, -2.25], [2.25, -2.25], [-2.25, 2.25], [2.25, 2.25]].map(([dx, dz]) => ({
    x: block.x + dx, z: block.z + dz, district: block.district, block: blockIndex,
  })));
// Fill the downtown first; the outskirts remain residential when account counts are low.
slots.sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));

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
  cube(0, -0.9, 0, 1000, 0.4, 1000, '#233d49');
  cube(0, -0.38, 0, 50, 0.8, 50, '#46515a');
  cube(0, 0.03, 0, 48, 0.08, 48, '#252d35');
  for (const b of blocks) cube(b.x, 0.12, b.z, 9, 0.22, 9, '#555c62');
  for (const road of [-24, -12, 0, 12, 24]) {
    for (let p = -23; p < 24; p += 3) {
      cube(road, 0.085, p, 0.06, 0.015, 1.2, '#b1a383');
      cube(p, 0.085, road, 1.2, 0.015, 0.06, '#b1a383');
    }
  }
  // Two bridge decks and their parapets connect the island to the water's edge.
  for (const side of [-1, 1]) {
    cube(side * 32, 0.04, 0, 16, 0.3, 3, '#3f4851');
    for (const z of [-1.6, 1.6]) cube(side * 32, 0.55, z, 16, 0.7, 0.18, '#7c8386');
    for (const x of [28, 36]) cube(side * x, -0.6, 0, 0.7, 2, 3, '#525b61');
  }
  // Repeated row houses share one draw call per material, rather than cloned GLBs.
  const positions = [];
  for (const b of blocks) for (const side of [-1, 1]) for (let i = -1; i <= 1; i++) {
    positions.push([b.x + i * 2.3, b.z + side * 4.2]);
  }
  const matrix = new THREE.Matrix4();
  for (const [roof, color] of [[false, '#73747b'], [true, '#303b45']]) {
    const mesh = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ color }), positions.length);
    positions.forEach(([x, z], i) => {
      const h = FLOOR * (1 + (i % 3) * 0.35);
      matrix.compose(new THREE.Vector3(x, roof ? 0.23 + h : 0.23 + h / 2, z), new THREE.Quaternion(), new THREE.Vector3(1.8, roof ? 0.15 : h, 0.4));
      mesh.setMatrixAt(i, matrix);
    });
    mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
  }
  const parks = slots.map(slot => {
    const park = new THREE.Group(); group.add(park);
    const lawn = cube(slot.x, 0.245, slot.z, 3.5, 0.05, 3.5, '#465e50'); park.attach(lawn);
    for (const dx of [-0.9, 0.9]) {
      park.attach(cube(slot.x + dx, 0.7, slot.z, 0.17, 0.9, 0.17, '#645342'));
      park.attach(cube(slot.x + dx, 1.5, slot.z, 1.05, 1.2, 1.05, '#526e56'));
    }
    return park;
  });
  return { sync(occupants) { parks.forEach((park, i) => { park.visible = !occupants.has(i); }); }, group };
}

export function landmarkLabel(name) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 64;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#1b252dee'; ctx.fillRect(0, 0, 512, 64);
  ctx.fillStyle = '#eee6ce'; ctx.font = '24px monospace'; ctx.textAlign = 'center'; ctx.fillText(name, 256, 41);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
  sprite.scale.set(6, 0.75, 1); return sprite;
}
