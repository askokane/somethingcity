// City planner: a blueprint of BreachLink for planning buildings, sizes and variables. Not the live app.
// Website towers get their height from account age (older account = taller); landmarks get a spec for Daniel's models.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { cityLayout, summarize } from '../checker/checker.js';

// Road scale, same as app.js: a street is 3 units wide and is a 7 m two-lane road (one lane each way).
const UNITS_PER_METER = 3 / 7;
const meters = (value) => value * UNITS_PER_METER;
const BLOCK_PITCH = 12; // block centers are 12 units apart: a 9-unit block plus a 3-unit street
const BLOCK_SIZE = 8.2; // the raised sidewalk slab
const PLOT_OFFSETS = [[-1.35, -1.35], [1.35, -1.35], [-1.35, 1.35], [1.35, 1.35]];
const TOWER_FOOTPRINT = 2.2; // units: one 2x2 plot

// One row per building type: the spec Daniel builds to. Footprint and height are real-world meters.
const LANDMARKS = [
  { key: 'wayne', name: 'Wayne Tower', file: 'wayne_tower.glb', footprint: 11, height: 51, shows: 'Player card: account counts, exposure score (summarize: accounts, yourDataBreached, serviceBreached, exposureScore)' },
  { key: 'arkham', name: 'Arkham Asylum', file: 'arkham_asylum_8bit.glb', footprint: 19, height: 13.5, shows: 'Breached accounts (red + amber buildings, breachedWhileMember)' },
  { key: 'ace', name: 'Ace Chemicals', file: 'ace_chemicals_8bit.glb', footprint: 15, height: 16.5, shows: 'What leaked (exposedData, largestBreach, oldestLeak, newestLeak)' },
  { key: 'bank', name: 'Gotham Bank', file: 'gotham_bank_8bit.glb', footprint: 15, height: 18, shows: 'All accounts (footprintByYear, signInWithGoogle, dormant)' },
  { key: 'gcpd', name: 'GCPD HQ', file: 'gcpd_headquarters_8bit.glb', footprint: 15, height: 15, shows: 'To-do list (fixFirst, most urgent first)' },
  { key: 'cobblepot', name: 'Cobblepot Manor', file: 'cobblepot_manor_8bit.glb', footprint: 16, height: 12, shows: 'Breach news + timeline (GET /api/news, industries)' },
  { key: 'blackgate', name: 'Blackgate Penitentiary', file: 'blackgate_penitentiary_8bit.glb', footprint: 18, height: 12, shows: 'Resolved: GCPD to-dos the user ticked off (local state)' },
  { key: 'elliot', name: 'Elliot Memorial', file: 'elliot_memorial_hospital_8bit.glb', footprint: 12, height: 10, shows: 'Couldn’t check (status unknown + re-check button)' },
];
// Daniel's ten towers live in models/account_buildings/; the planner previews them by tier.
const TOWER_FILES = Array.from({ length: 10 }, (_, i) => `../account_buildings/account_building_${String(i + 1).padStart(2, '0')}.glb`);
const TOWER_MODEL = { name: 'Website towers (10)', file: 'gotham_voxel_skyscraper.glb', footprint: TOWER_FOOTPRINT / UNITS_PER_METER, shows: 'One per website; height from account age, color from breach state' };
const STATE_COLORS = { breached: 0xff7185, service: 0xffc857, clear: 0x67e6aa };

// Scene: isometric orthographic camera like the app.
const stage = document.querySelector('#stage');
const labelsNode = document.querySelector('#labels');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
stage.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#0f1720');
const camera = new THREE.OrthographicCamera(-30, 30, 30, -30, 0.1, 400);
camera.position.set(40, 44, 40);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 6, 0);
controls.enableDamping = true;
scene.add(new THREE.HemisphereLight('#cfe3ff', '#1a2430', 1.4));
const sun = new THREE.DirectionalLight('#ffffff', 1.6);
sun.position.set(20, 40, 10);
scene.add(sun);
const city = new THREE.Group();
scene.add(city);

// Models: load what exists; a missing file just means a grey placeholder box.
const loader = new GLTFLoader();
const models = new Map();
const loadModel = (file) => new Promise((resolve) => loader.load(`../models/buildings/${file}`, (gltf) => resolve(gltf.scene), undefined, () => resolve(null)));

// Fit a model (or a box) to footprint x height in units, standing on y = 0 at (x, z).
function fitted(source, footprint, height, color) {
  const object = source ? source.clone(true) : new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
  const holder = new THREE.Group();
  holder.add(object);
  const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
  object.scale.set(footprint / Math.max(size.x, size.z), height / size.y, footprint / Math.max(size.x, size.z));
  const box = new THREE.Box3().setFromObject(object);
  object.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  return holder;
}

// Tower height: either the checker's tier (cityLayout: 1 + years/3, capped at 5) or a continuous floors-per-year rule.
function floorsFor(building, years, vars) {
  const floors = vars.mode === 'tier' ? building.height * vars.floorsPerTier : vars.minFloors + years * vars.floorsPerYear;
  return Math.round(Math.min(vars.maxFloors, Math.max(vars.minFloors, floors)));
}

const inputs = ['mode', 'floorsPerTier', 'floorsPerYear', 'minFloors', 'maxFloors', 'floorMeters', 'now', 'grid'];
const readVars = () => Object.fromEntries(inputs.map((id) => {
  const node = document.querySelector(`#${id}`);
  return [id, node.type === 'number' ? Number(node.value) : node.value];
}));

let check = null;
const labels = []; // [element, world position]

function addLabel(text, position, className = '') {
  const element = document.createElement('div');
  element.className = `label ${className}`;
  element.innerHTML = text;
  labelsNode.append(element);
  labels.push([element, position]);
}

function render() {
  const vars = readVars();
  const now = Date.parse(vars.now) || Date.now();
  city.clear();
  labels.splice(0).forEach(([element]) => element.remove());

  // Data from the checker itself, so the planner and the app agree.
  const layout = cityLayout(check, { max: 40, now });
  const firstSeen = new Map(check.accounts.map((account) => [account.domain, account.firstSeen]));
  const towers = layout.buildings.map((building) => {
    const seen = firstSeen.get(building.domain);
    const years = seen ? (now - Date.parse(seen)) / (365.25 * 864e5) : 0;
    const floors = floorsFor(building, years, vars);
    return { ...building, seen, years, floors, meters: floors * vars.floorMeters };
  });

  // Blocks, back to front (the camera looks from +x +z). Tallest things go at the back so they hide the least:
  // Wayne first, then the account blocks, then the other landmarks, then parks.
  const n = Number(vars.grid);
  const blocks = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) blocks.push({ x: (i - (n - 1) / 2) * BLOCK_PITCH, z: (j - (n - 1) / 2) * BLOCK_PITCH });
  blocks.sort((a, b) => a.x + a.z - (b.x + b.z) || a.x - b.x);
  const accountBlocks = Math.ceil(towers.length / 4);
  const plan = [];
  plan.push({ kind: 'landmark', spec: LANDMARKS[0] });
  for (let i = 0; i < accountBlocks; i++) plan.push({ kind: 'towers', towers: towers.slice(i * 4, i * 4 + 4) });
  LANDMARKS.slice(1).forEach((spec) => plan.push({ kind: 'landmark', spec }));
  const placed = blocks.map((block, index) => ({ ...block, ...(plan[index] ?? { kind: 'park' }) }));
  const dropped = plan.slice(blocks.length);

  // Ground, streets, block slabs.
  const span = n * BLOCK_PITCH + 6;
  const ground = new THREE.Mesh(new THREE.BoxGeometry(span, 0.2, span), new THREE.MeshStandardMaterial({ color: '#2a3138' }));
  ground.position.y = -0.1;
  city.add(ground);
  for (const block of placed) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(BLOCK_SIZE, 0.2, BLOCK_SIZE), new THREE.MeshStandardMaterial({ color: block.kind === 'park' ? '#3d5a3e' : '#56636e' }));
    slab.position.set(block.x, 0.1, block.z);
    city.add(slab);
    if (block.kind === 'towers') {
      block.towers.forEach((tower, k) => {
        const [dx, dz] = PLOT_OFFSETS[k];
        const height = meters(tower.meters);
        const variant = Math.max(0, Math.min(9, Math.round((tower.floors - vars.minFloors) / Math.max(1, vars.maxFloors - vars.minFloors) * 9)));
        const body = fitted(models.get(TOWER_FILES[variant]) ?? models.get(TOWER_MODEL.file), TOWER_FOOTPRINT, height, STATE_COLORS[tower.state]);
        // Tint the real model by state so the blueprint stays readable.
        body.traverse((node) => { if (node.isMesh) { node.material = node.material.clone(); node.material.color = new THREE.Color(STATE_COLORS[tower.state]).lerp(new THREE.Color('#ffffff'), 0.35); } });
        body.position.set(block.x + dx, 0.2, block.z + dz);
        city.add(body);
        addLabel(`${tower.label} <b>${tower.seen ? `'${tower.seen.slice(2, 4)}` : '?'}</b> ${tower.floors}F`, new THREE.Vector3(block.x + dx, 0.2 + height + 0.3, block.z + dz), `state-${tower.state}`);
      });
    } else if (block.kind === 'landmark') {
      const { spec } = block;
      const model = models.get(spec.file);
      const height = meters(spec.height);
      const footprint = Math.min(BLOCK_SIZE - 0.4, meters(spec.footprint));
      const body = fitted(model, footprint, height, model ? 0xffd45e : 0x8a99a6);
      body.position.set(block.x, 0.2, block.z);
      city.add(body);
      addLabel(`${spec.name}${model ? '' : ' (no model)'}`, new THREE.Vector3(block.x, 0.2 + height + 0.3, block.z), 'landmark');
    }
  }

  // Frame the whole city.
  const aspect = stage.clientWidth / Math.max(1, stage.clientHeight);
  // Fit both ways: the isometric city is about span x 1.45 wide on screen and needs room above for the towers.
  const viewHeight = Math.max(n * BLOCK_PITCH * 1.25, (span * 1.45) / aspect);
  Object.assign(camera, { left: -viewHeight * aspect / 2, right: viewHeight * aspect / 2, top: viewHeight / 2, bottom: -viewHeight / 2 });
  camera.updateProjectionMatrix();

  // Side panel.
  document.querySelector('#scale').textContent = `1 unit = ${(1 / UNITS_PER_METER).toFixed(2)} m · street 7 m`;
  document.querySelector('#towerCount').textContent = `(${towers.length}${dropped.length ? `, ${dropped.length} block(s) don't fit` : ''})`;
  document.querySelector('#towers').innerHTML = [...towers].sort((a, b) => b.years - a.years).map((t) => `<tr><td>${t.label}</td><td>${t.seen ?? '—'}</td><td class="num">${t.years.toFixed(1)}</td><td class="num">${t.height}</td><td class="num">${t.floors}</td><td class="num">${Math.round(t.meters)}</td><td><span class="tag state-${t.state}">${t.state.toUpperCase()}</span></td></tr>`).join('');
  document.querySelector('#models').innerHTML = [TOWER_MODEL, ...LANDMARKS].map((spec) => {
    const have = models.get(spec.file);
    return `<tr><td>${spec.name}</td><td class="${have ? 'ok' : 'missing'}">${have ? '✓' : '✗'} ${spec.file}</td><td>${Math.round(spec.footprint)} m${spec.height ? ` × ${spec.height} m` : ' × by age'}</td><td>${spec.shows}</td></tr>`;
  }).join('');
  const settings = {
    scale: { unitsPerMeter: UNITS_PER_METER, streetMeters: 7, floorMeters: vars.floorMeters },
    towerHeight: { mode: vars.mode, floorsPerTier: vars.floorsPerTier, floorsPerYear: vars.floorsPerYear, minFloors: vars.minFloors, maxFloors: vars.maxFloors },
    grid: n,
    blocks: placed.map((b) => ({ x: b.x, z: b.z, kind: b.kind, landmark: b.spec?.key, sites: b.towers?.map((t) => t.domain) })),
    landmarks: LANDMARKS.map(({ key, file, footprint, height }) => ({ key, file, footprintMeters: footprint, heightMeters: height })),
  };
  document.querySelector('#json').textContent = JSON.stringify(settings, null, 2);
}

function animate() {
  controls.update();
  renderer.render(scene, camera);
  const rect = stage.getBoundingClientRect();
  const projected = new THREE.Vector3();
  for (const [element, position] of labels) {
    projected.copy(position).project(camera);
    element.style.left = `${(projected.x + 1) / 2 * rect.width}px`;
    element.style.top = `${(1 - projected.y) / 2 * rect.height}px`;
  }
  requestAnimationFrame(animate);
}

function resize() {
  renderer.setSize(stage.clientWidth, stage.clientHeight, false);
  if (check) render();
}

document.querySelector('#now').value = new Date().toISOString().slice(0, 10);
inputs.forEach((id) => document.querySelector(`#${id}`).addEventListener('input', render));
document.querySelector('#copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(document.querySelector('#json').textContent); document.querySelector('#copy').textContent = 'Copied'; }
  catch { document.querySelector('#copy').textContent = 'Copy failed: select the text below'; }
});
new ResizeObserver(resize).observe(stage);

const [sample] = await Promise.all([
  fetch('../checker/samples/check-city.json').then((response) => response.json()),
  ...[TOWER_MODEL, ...LANDMARKS].map(async (spec) => models.set(spec.file, await loadModel(spec.file))),
  ...TOWER_FILES.map(async (file) => models.set(file, await loadModel(file))),
]);
check = sample;
document.querySelector('#source').textContent = `${check.label} · ${check.accounts.length} sites (demo fixture)`;
resize();
render();
animate();
