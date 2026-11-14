import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { blocks, slots, landmarks, createCity, landmarkLabel, FLOOR, UNITS_PER_METER, CITY_SIZE, CITY_CENTER_Z, CITY_CENTER_X, cellZ } from './city-layout.js';
import { scatterSlotOrder, freshPlacementSeed, seededRandom as placementRandomGenerator } from './city-scatter.js';
import { checkAccount, checkSignedIn } from './checker/checker.js';
import { buildMissions, readProgress, saveProgress, serviceUrl } from './mission-board.js';

const CHECKER_API = 'http://localhost:8787';
let currentCheck = null;
let verifiedEmail = '';
let signedIn = false;

const accounts = [
  { id: 'bc-001', name: 'Northpoint Exchange', label: 'a***@northpoint.test', district: 'Northpoint', status: 'clear', slot: 0, checkedAt: '10:42 AM', source: 'Demo fixture', breaches: [] },
  { id: 'bc-002', name: 'Old Gotham Mail', label: 'm***@oldgotham.test', district: 'Old Gotham', status: 'breached', slot: 1, checkedAt: '10:42 AM', source: 'Demo fixture', breaches: [{ name: 'Old Gotham Forum', date: '2023', exposedData: ['Email addresses', 'Usernames'] }] },
  { id: 'bc-003', name: 'Crown Point Social', label: 'r***@crownpoint.test', district: 'Crown Point', status: 'unknown', slot: 2, checkedAt: '10:42 AM', source: 'Demo fixture', breaches: [], error: 'The sample check is unavailable.' },
  { id: 'bc-004', name: 'Foundry Market', label: 'j***@foundry.test', district: 'The Foundry', status: 'clear', slot: 3, checkedAt: '10:42 AM', source: 'Demo fixture', breaches: [] },
  { id: 'bc-005', name: 'Civic Records', label: 's***@civic.test', district: 'Civic Center', status: 'breached', slot: 4, checkedAt: '10:42 AM', source: 'Demo fixture', breaches: [{ name: 'Civic Records Sample', date: '2021', exposedData: ['Email addresses', 'Phone numbers'] }] },
  { id: 'bc-006', name: 'Narrows Cloud', label: 'l***@narrows.test', district: 'The Narrows', status: 'unknown', slot: 5, checkedAt: '10:42 AM', source: 'Demo fixture', breaches: [], error: 'The sample check is unavailable.' },
];

const meters = value => value * UNITS_PER_METER;
const ACCOUNT_FOOTPRINT = 3.4; // plots are 4.5 wide; the rest is sidewalk for lamps, hedges and benches
const statusText = { clear: 'No known match in this source', breached: 'Known breach match', unknown: 'Check unavailable' };
const statusColors = { clear: 0x83bc9b, breached: 0xe58268, unknown: 0xd2b56b };
const sceneHost = document.querySelector('#city-scene');
// A site is only "breached" (red, villain on the roof) for a year after its newest breach. Older breaches move to the
// History section and the site goes calm. Undated breaches stay recent: nothing proves they are old.
const RECENT_BREACH_MONTHS = 12;
function isRecentBreach(breach, now = new Date()) {
  const happened = Date.parse(breach.date);
  if (Number.isNaN(happened)) return true;
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - RECENT_BREACH_MONTHS);
  return happened >= cutoff.getTime();
}
function ageBreaches(account) {
  const all = [...(account.breaches || []), ...(account.historical || [])];
  account.breaches = all.filter((breach) => isRecentBreach(breach));
  account.historical = all.filter((breach) => !isRecentBreach(breach));
  if (account.status === 'breached' && !account.breaches.length) account.status = 'clear';
  return account;
}
// The badge for a site: a calm site with only old breaches reads HISTORICAL, not NO MATCH.
const accountBadge = (account) => (account.status === 'clear' && account.historical?.length ? 'HISTORICAL' : { clear: 'NO MATCH', breached: 'BREACH', unknown: 'UNAVAILABLE' }[account.status]);
accounts.forEach(ageBreaches);
let placementOrder = scatterSlotOrder(freshPlacementSeed());
const initialPlacementOrder = [...placementOrder];
accounts.forEach((account, index) => { account.slot = placementOrder[index]; account.district = slots[account.slot].district; });
const initialAccounts = structuredClone(accounts); // what Reset demo restores
const accountsById = new Map(accounts.map((account) => [account.id, account]));
const renderedBuildings = new Map();
const slotOccupants = new Map();
accounts.forEach((account) => slotOccupants.set(account.slot, account.id));
let selectedId = accounts[0].id;
let nextId = 7;
let toastTimer;
const landmarkSlots = new Set(); // landmarks have their own blocks now, so no account plot is reserved

const scene = new THREE.Scene();
scene.background = new THREE.Color('#182129');
scene.fog = new THREE.Fog('#182129', CITY_SIZE * 2, CITY_SIZE * 4);
const city = createCity(scene);
const camera = new THREE.OrthographicCamera(-23, 23, 15, -15, 0.1, 600);
const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
// Render at device resolution so the full-screen city stays sharp at every viewport size.
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.domElement.setAttribute('aria-label', 'Interactive isometric 3D view of Gotham Central Ward');
sceneHost.append(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.09;
controls.enablePan = true;
controls.enableRotate = false;
controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
controls.touches.ONE = THREE.TOUCH.PAN;
controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
controls.minZoom = 0.65;
controls.maxZoom = 6;
const FOCUS_ZOOM = 4.8; // how close picking a website flies in
controls.minPolarAngle = 0.36;
controls.maxPolarAngle = Math.PI / 2.15;
controls.target.set(CITY_CENTER_X, 0, CITY_CENTER_Z); // aim above the ground so the road-scale towers fit
controls.update();

scene.add(new THREE.HemisphereLight(0x9babb4, 0x20232a, 2.2));
const moon = new THREE.DirectionalLight(0xc7d5e6, 3.0);
moon.position.set(-72, 112, 48);
moon.castShadow = true;
moon.shadow.mapSize.set(1536, 1536);
moon.shadow.camera.left = -CITY_SIZE; moon.shadow.camera.right = CITY_SIZE; moon.shadow.camera.top = CITY_SIZE; moon.shadow.camera.bottom = -CITY_SIZE;
moon.shadow.bias = -0.00025;
scene.add(moon);
const warmRim = new THREE.DirectionalLight(0xd7a77a, 1.2);
warmRim.position.set(20, 14, -18);
scene.add(warmRim);

const loader = new GLTFLoader();
const environmentLoader = new GLTFLoader();
function loadModel(path) {
  return new Promise((resolve, reject) => loader.load(path, (gltf) => resolve(gltf.scene), undefined, reject));
}

const propAxisCorrection = new Map([
  ['Gotham_Crosswalk', -Math.PI / 2],
  // These GLBs store their height along -Z (e.g. tree z from -4.07 to 0), so +90° about X stands them up.
  // -90° turned them upside down (canopy at the bottom).
  ['Gotham_Fire_Hydrant', Math.PI / 2],
  ['Gotham_Large_Tree', Math.PI / 2],
  ['Gotham_Stoplight', Math.PI / 2],
  ['Gotham_Street_Tree', Math.PI / 2],
  ['Gotham_Bush_Compact', Math.PI / 2],
  ['Gotham_Bush_Hedge', Math.PI / 2],
  ['Gotham_Bush_Tall', Math.PI / 2],
  // The lamp GLB has a baked -90° node rotation that tips its Y-up shaft onto its side.
  // GLTFLoader turns spaces in node names into underscores, so 'Lamp square shaft' never matched.
  ['Lamp_square_shaft', Math.PI / 2],
]);


function addPlacedModel(source, position, scale = 1, rotationY = 0) {
  const root = source.clone(true);
  if (Array.isArray(scale)) root.scale.set(...scale);
  else root.scale.setScalar(scale);
  // Several Blender prop GLBs were exported with Blender's Z-up axis still vertical.
  // Convert those to the app's Y-up world, then rotate around the now-vertical axis.
  const axisCorrection = [...propAxisCorrection].find(([name]) => source.name === name || source.getObjectByName(name))?.[1];
  if (axisCorrection !== undefined) {
    root.rotation.order = 'YXZ';
    root.rotation.set(axisCorrection, rotationY, 0);
  } else {
    root.rotation.y = rotationY;
  }
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  const center = bounds.getCenter(new THREE.Vector3());
  root.position.set(position[0] - center.x, position[1] - bounds.min.y, position[2] - center.z);
  root.traverse((node) => { if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; } });
  scene.add(root);
  return root;
}

// Many copies of one model for a few draw calls: one InstancedMesh per piece of the model, one instance per placement
// [x, y, z, rotationY]. The model is prepared once like addPlacedModel (stood up, scaled, bottom-centered at the origin).
function instanceModel(source, scale, placements, group) {
  if (!source || !placements.length) return [];
  const template = addPlacedModel(source, [0, 0, 0], scale, 0);
  scene.remove(template);
  template.updateMatrixWorld(true);
  const place = new THREE.Matrix4();
  const made = [];
  template.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const instanced = new THREE.InstancedMesh(mesh.geometry, mesh.material, placements.length);
    placements.forEach(([x, y, z, rotation = 0], i) => {
      place.makeRotationY(rotation).setPosition(x, y, z);
      instanced.setMatrixAt(i, place.clone().multiply(mesh.matrixWorld));
    });
    instanced.castShadow = true;
    instanced.receiveShadow = true;
    instanced.computeBoundingSphere();
    group.add(instanced);
    made.push(instanced);
  });
  return made;
}

function removeProceduralParkTrees(environment) {
  const trees = [];
  environment.traverse((node) => {
    if (node.isMesh && (node.name.toLowerCase().includes('park_tree_canopy') || node.name.toLowerCase() === 'trunk')) trees.push(node);
  });
  trees.forEach((tree) => tree.parent?.remove(tree));
}

// (x, z) => is this point on the river? Built from the river mesh's triangles.
function riverTest(environment) {
  const triangles = [];
  const point = new THREE.Vector3();
  environment.updateMatrixWorld(true);
  environment.traverse((node) => {
    if (!node.isMesh || !node.name.startsWith('Gotham_River')) return;
    const position = node.geometry.attributes.position;
    const index = node.geometry.index.array;
    for (let t = 0; t < index.length; t += 3) triangles.push([0, 1, 2].map((k) => { point.fromBufferAttribute(position, index[t + k]).applyMatrix4(node.matrixWorld); return [point.x, point.z]; }));
  });
  return (x, z) => triangles.some(([[ax, az], [bx, bz], [cx, cz]]) => {
    const d1 = (x - bx) * (az - bz) - (ax - bx) * (z - bz);
    const d2 = (x - cx) * (bz - cz) - (bx - cx) * (z - cz);
    const d3 = (x - ax) * (cz - az) - (cx - ax) * (z - az);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  });
}

// Scale that makes `source` stand `height` meters tall (raw heights cached per model).
const rawHeights = new Map();
function scaleForHeight(source, height) {
  if (!rawHeights.has(source)) {
    const probe = addPlacedModel(source, [0, -50, 0]);
    rawHeights.set(source, new THREE.Box3().setFromObject(probe).getSize(new THREE.Vector3()).y);
    scene.remove(probe);
  }
  return meters(height) / rawHeights.get(source);
}

// Tai's park kits, split into pieces: wall (straight, pillar), bushes (compact, hedge, tall), plus the two trees.
let parkKit = null;
const piece = (kit, name) => {
  const part = kit?.getObjectByName(name)?.clone(true);
  if (!part) return null;
  part.position.set(0, 0, 0);
  return part;
};

// Small seeded random, so every park looks the same on every load.
function seededRandom(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A walled park on the square (cx, cz) ± half: optional lawn, a 1 m wall with gaps, trees of mixed sizes and bushes.
// paths: keep a cross of paths clear through the middle and open the wall where they meet it (the main park's layout).
// A walled park on the rectangle (cx, cz) ± [halfX, halfZ] (a number means a square): optional lawn, Tai's 1 m park wall
// all the way round with gaps for the entrances, trees of mixed sizes and bushes.
// paths: keep a cross of paths clear through the middle and open the wall where they meet it.
function addPark(cx, cz, half, { seed = 1, lawn = true, paths = false, trees = 2, bushes = 4, bigTrees = 0, patches = 0, clearing = null } = {}) {
  const roots = [];
  if (!parkKit) return roots;
  const [halfX, halfZ] = Array.isArray(half) ? half : [half, half];
  const random = seededRandom(seed);
  const between = (low, high) => low + random() * (high - low);
  if (lawn) {
    const grass = new THREE.Mesh(new THREE.BoxGeometry(halfX * 2, 0.04, halfZ * 2), new THREE.MeshStandardMaterial({ color: '#3d5a3e', roughness: 0.95 }));
    grass.position.set(cx, 0.25, cz);
    grass.receiveShadow = true;
    scene.add(grass);
    roots.push(grass);
  }
  const [insetX, insetZ] = [halfX - 0.12, halfZ - 0.12];
  const gap = paths ? 1.1 : 0.55;
  if (parkKit.wall) {
    const wallScale = scaleForHeight(parkKit.wall, 1);
    const run = (x1, z1, x2, z2) => {
      const length = Math.hypot(x2 - x1, z2 - z1);
      if (length < 0.15) return;
      roots.push(addPlacedModel(parkKit.wall, [(x1 + x2) / 2, 0.27, (z1 + z2) / 2], [length / 2, wallScale, wallScale], x1 === x2 ? Math.PI / 2 : 0));
    };
    // One side of the wall; `open` leaves a gap in the middle for an entrance.
    const side = (fixed, alongX, open) => {
      const reach = alongX ? insetX : insetZ;
      const point = (t) => (alongX ? [cx + t, cz + fixed] : [cx + fixed, cz + t]);
      if (open) { run(...point(-reach), ...point(-gap / 2)); run(...point(gap / 2), ...point(reach)); }
      else run(...point(-reach), ...point(reach));
    };
    side(insetZ, true, true); // the camera side always has an entrance
    side(-insetZ, true, paths);
    side(insetX, false, paths);
    side(-insetX, false, paths);
    if (parkKit.pillar) {
      const pillarScale = scaleForHeight(parkKit.pillar, 1.2);
      const posts = [[-insetX, -insetZ], [insetX, -insetZ], [-insetX, insetZ], [insetX, insetZ], [-gap / 2, insetZ], [gap / 2, insetZ]];
      if (paths) posts.push([-gap / 2, -insetZ], [gap / 2, -insetZ], [insetX, -gap / 2], [insetX, gap / 2], [-insetX, -gap / 2], [-insetX, gap / 2]);
      posts.forEach(([dx, dz]) => roots.push(addPlacedModel(parkKit.pillar, [cx + dx, 0.27, cz + dz], pillarScale)));
    }
  }
  // Winding gravel paths instead of a straight strip: from each wall entrance (the middle of every side when `paths`),
  // meandering through a couple of random bends to the middle, or to a loop around the clearing when there is one.
  // Drawn as one instanced mesh of short gravel segments with round joints.
  const pathPoints = [];
  if (paths) {
    const curves = [];
    // The loop hugs the clearing but always stays well inside the wall.
    const loopRadius = clearing ? [Math.min(clearing[0] / 2 + 0.9, insetX - 1.3), Math.min(clearing[1] / 2 + 0.9, insetZ - 1.3)] : null;
    const hub = (angle) => (loopRadius ? new THREE.Vector3(Math.cos(angle) * loopRadius[0], 0, Math.sin(angle) * loopRadius[1]) : new THREE.Vector3(0, 0, 0));
    const entrances = [[-insetX, 0, Math.PI], [insetX, 0, 0], [0, -insetZ, -Math.PI / 2], [0, insetZ, Math.PI / 2]];
    for (const [ex, ez, angle] of entrances) {
      const start = new THREE.Vector3(ex, 0, ez);
      const end = hub(angle);
      const bends = [0.35, 0.7].map((t) => {
        const p = start.clone().lerp(end, t);
        const sway = (random() - 0.5) * Math.min(insetX, insetZ) * 0.35; // sideways wiggle, scaled to the park
        return ez === 0 ? p.add(new THREE.Vector3(0, 0, sway)) : p.add(new THREE.Vector3(sway, 0, 0));
      });
      curves.push(new THREE.CatmullRomCurve3([start, ...bends, end]));
    }
    if (loopRadius) {
      const loop = Array.from({ length: 12 }, (_, i) => hub((i / 12) * Math.PI * 2));
      curves.push(new THREE.CatmullRomCurve3(loop, true));
    }
    const segments = [];
    for (const curve of curves) {
      const points = curve.getSpacedPoints(Math.max(12, Math.ceil(curve.getLength() / 0.5)));
      pathPoints.push(...points);
      for (let i = 0; i < points.length - 1; i++) segments.push([points[i], points[i + 1]]);
    }
    const gravel = new THREE.MeshStandardMaterial({ color: '#9c9581', roughness: 1 });
    const pieces = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), gravel, segments.length + pathPoints.length);
    const matrix = new THREE.Matrix4();
    const turn = new THREE.Quaternion();
    let n = 0;
    for (const [p, q] of segments) {
      const length = p.distanceTo(q) + 0.05;
      turn.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.atan2(q.z - p.z, q.x - p.x));
      matrix.compose(new THREE.Vector3(cx + (p.x + q.x) / 2, 0.29, cz + (p.z + q.z) / 2), turn, new THREE.Vector3(length, 0.03, 0.9));
      pieces.setMatrixAt(n++, matrix);
    }
    for (const p of pathPoints) { // round-ish joints: a turned square at each point
      turn.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4);
      matrix.compose(new THREE.Vector3(cx + p.x, 0.289, cz + p.z), turn, new THREE.Vector3(0.64, 0.03, 0.64));
      pieces.setMatrixAt(n++, matrix);
    }
    pieces.receiveShadow = true;
    pieces.computeBoundingSphere();
    scene.add(pieces);
    roots.push(pieces);
  }
  const onPath = (x, z, clearance) => pathPoints.some((p) => Math.hypot(p.x - x, p.z - z) < clearance);

  // Patches of different greens and a few flower beds break up the lawn, off the paths.
  const greens = ['#355c3b', '#3f6a45', '#4d7a4f', '#5a8a52', '#2f5236'];
  const flowers = ['#7a4a6a', '#8a7a3c'];
  for (let i = 0; i < patches; i++) {
    const w = between(0.8, 2.8);
    const d = between(0.8, 2.4);
    const px = between(-insetX + w / 2 + 0.3, insetX - w / 2 - 0.3);
    const pz = between(-insetZ + d / 2 + 0.3, insetZ - d / 2 - 0.3);
    if (onPath(px, pz, Math.max(w, d) / 2 + 0.5)) continue;
    if (clearing && Math.abs(px) < (clearing[0] + w) / 2 && Math.abs(pz) < (clearing[1] + d) / 2) continue;
    const color = i % 5 === 4 ? flowers[i % 2] : greens[Math.floor(random() * greens.length)];
    const patch = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, d), new THREE.MeshStandardMaterial({ color, roughness: 1 }));
    patch.position.set(cx + px, 0.285 + random() * 0.01, cz + pz);
    patch.receiveShadow = true;
    scene.add(patch);
    roots.push(patch);
  }
  // Trees and bushes go on free spots inside the wall, off the paths, not on top of each other.
  const taken = [];
  const spot = (margin, spacing) => {
    for (let attempt = 0; attempt < 40; attempt++) {
      const dx = between(-insetX + margin, insetX - margin);
      const dz = between(-insetZ + margin, insetZ - margin);
      if (onPath(dx, dz, 0.7 + spacing * 0.5)) continue;
      if (Math.abs(dx) < gap / 2 + 0.2 && dz > insetZ - 0.6) continue; // keep the entrance clear
      if (clearing && Math.abs(dx) < clearing[0] / 2 && Math.abs(dz) < clearing[1] / 2) continue; // kept open (e.g. a future building)
      if (taken.some(([x, z, r]) => Math.hypot(x - dx, z - dz) < r + spacing)) continue;
      taken.push([dx, dz, spacing]);
      return [cx + dx, cz + dz];
    }
    return null;
  };
  const place = (source, height, margin, spacing) => {
    if (!source) return;
    const at = spot(margin, spacing);
    if (at) roots.push(addPlacedModel(source, [at[0], 0.27, at[1]], scaleForHeight(source, height), between(0, Math.PI * 2)));
  };
  // Mixed sizes: saplings to old oaks, low shrubs to tall bushes.
  for (let i = 0; i < bigTrees; i++) place(parkKit.largeTree, between(6, 11.5), 0.9, 0.8);
  for (let i = 0; i < trees; i++) place(parkKit.streetTree, between(2.2, 7.5), 0.35, 0.45);
  for (let i = 0; i < bushes; i++) {
    const [model, height] = [[parkKit.compact, between(0.45, 1.3)], [parkKit.hedge, between(0.6, 1.3)], [parkKit.tall, between(1.1, 2.4)]][Math.floor(random() * 3)];
    place(model, height, 0.2, 0.22);
  }
  return roots;
}

// Every account plot without a website building is a park: a block with all four plots free becomes one bigger park
// with paths, otherwise each free plot gets its own small walled park. Re-run whenever the accounts change.
const plotParkRoots = [];
// Empty plots get non-clickable filler: favelas (Daniel's four variants) in Bristol Township, the islands and the slum
// districts along the river inlets, and Daniel's level-1/level-2 account buildings everywhere else. Instanced, with a
// random variant and quarter-turn fixed per plot and random window lights. Garden blocks are walled parks.
// Re-run whenever accounts change.
const SLUMS = new Set(['West Harlow', 'Chinatown', 'Reatton']);
const ESTATE_CLEARING = [12, 12]; // open lawn at the centre of Wayne Estate, kept for the Wayne Manor model
const FAVELA_ISLANDS = new Set(['Bristol Township', 'South Channel Island', 'South Hinkley']);
const isFavelaPlot = (slot) => FAVELA_ISLANDS.has(blocks[slot.block].island) || SLUMS.has(blocks[slot.block].district);
let favelaModels = [];
let favelaGroup = null;
function syncPlotParks() {
  // Atharva's createCity draws a lawn square on every empty plot; filler buildings take those plots now.
  city.sync(new Map(slots.map((_, i) => [i, true])));
  plotParkRoots.splice(0).forEach((root) => root.parent?.remove(root));
  if (favelaGroup) { favelaGroup.traverse((node) => node.isInstancedMesh && node.dispose()); scene.remove(favelaGroup); }
  favelaGroup = new THREE.Group();
  favelaGroup.name = 'Filler buildings';
  scene.add(favelaGroup);
  const lowRise = (loadedBuildingModels?.towers ?? []).slice(0, 2).filter(Boolean);
  const kinds = [...favelaModels.map((model) => ({ model, favela: true, plots: [] })), ...lowRise.map((model) => ({ model, favela: false, plots: [] }))];
  slots.forEach((slot, i) => {
    if (slotOccupants.has(i)) return;
    const random = seededRandom(i * 7919 + 13);
    const choices = kinds.filter((kind) => kind.favela === isFavelaPlot(slot));
    const pool = choices.length ? choices : kinds; // until Daniel's towers load, favelas stand in everywhere
    if (!pool.length) return;
    pool[Math.floor(random() * pool.length)].plots.push([slot.x, 0.23, slot.z, Math.floor(random() * 4) * Math.PI / 2]);
  });
  kinds.forEach(({ model, plots }) => {
    const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    instanceModel(model, ACCOUNT_FOOTPRINT / Math.max(size.x, size.z), plots, favelaGroup); // fits the plot, keeps its shape
  });
  flickerWindows(favelaGroup);
  if (!parkKit) return;
  // Plazas (Founders Square): a walled green with the fountain and its benches left in a clearing.
  blocks.filter((b) => b.format === 'plaza').forEach((b, i) => {
    plotParkRoots.push(...addPark(b.x, b.z, [b.width / 2 - 0.1, b.depth / 2 - 0.1], { seed: 800 + i * 5, lawn: false, paths: true, trees: 7, bigTrees: 1, bushes: 18, patches: 6, clearing: [3.4, 3.4] }));
  });
  blocks.filter((b) => b.format === 'garden').forEach((b, i) => {
    const area = Math.min(3.5, (b.width * b.depth) / (21 * 9)); // planting scales with size (a 2-cell park is 1), capped to stay fast
    const estate = b.district === 'Wayne Estate';
    plotParkRoots.push(...addPark(b.x, b.z, [b.width / 2 - 0.1, b.depth / 2 - 0.1], {
      seed: 500 + i * 7, lawn: false, paths: true,
      trees: Math.round(16 * area), bigTrees: Math.round(5 * area), bushes: Math.round(40 * area), patches: Math.round(14 * area),
      clearing: estate ? ESTATE_CLEARING : null,
    }));
  });
}

async function addCityProps(environment) {
  const names = ['gotham_bushes', 'gotham_crosswalk', 'gotham_fire_hydrant', 'gotham_lamppost', 'gotham_large_tree', 'gotham_park_wall', 'gotham_stoplight', 'gotham_street_tree'];
  const loaded = await Promise.all(names.map(async (name) => {
    try { return [name, await loadModel(`./models/everything-else/${name}.glb`)]; }
    catch (error) { console.warn(`Could not load ${name}:`, error); return [name, null]; }
  }));
  const props = Object.fromEntries(loaded);
  const onRiver = riverTest(environment);
  // Place copies of a prop at [x, z, rotation], scaled so the prop stands `height` meters tall; nothing goes in the river.
  const placeMany = (name, height, placements, groundY = 0.23) => {
    const source = props[name];
    if (!source) return;
    placements.filter(([x, z]) => !onRiver(x, z)).forEach(([x, z, rotation = 0]) => addPlacedModel(source, [x, groundY, z], scaleForHeight(source, height), rotation));
  };
  const furniture = new THREE.Group();
  furniture.name = 'Sidewalk benches and trash cans';
  scene.add(furniture);
  const metal = new THREE.MeshStandardMaterial({ color: '#303f42', roughness: .75 });
  const wood = new THREE.MeshStandardMaterial({ color: '#745640', roughness: .9 });
  function part(x, y, z, w, h, d, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; furniture.add(mesh);
  }
  // Street furniture stands on each block's sidewalk strip (the 0.55 units between the plots and the curb), never in the
  // road: a lamp per side with its arm over the road, hedges, a bench and bin, hydrants and corner stoplights.
  // Garden blocks get their park wall instead. Everything repeated is instanced.
  const hedge = piece(props.gotham_bushes, 'Gotham_Bush_Hedge');
  const compact = piece(props.gotham_bushes, 'Gotham_Bush_Compact');
  const lamps = [], hedges = [], bushes = [], hydrants = [], signals = [];
  blocks.forEach((b, i) => {
    if (b.format === 'garden' || b.format === 'plaza') return;
    if (b.format === 'avenue') {
      const alongX = b.avenue === 'x';
      for (const t of [-3, 3]) for (const side of [-1, 1]) {
        // Lamps on both kerbs of the avenue, arms over the road.
        lamps.push(alongX ? [b.x + t, .23, b.z + side * 2.0, side > 0 ? Math.PI / 2 : -Math.PI / 2] : [b.x + side * 2.0, .23, b.z + t, side > 0 ? Math.PI : 0]);
      }
      return;
    }
    const x = b.x, z = b.z;
    const hw = b.width / 2, hd = b.depth / 2;
    const ex = hw - 0.24, ez = hd - 0.24; // sidewalk centerline
    // Lamp arms point at the road: +x side 0, -x side π, +z side -π/2, -z side π/2.
    lamps.push([x + ex, .23, z - hd * 0.45, 0], [x - ex, .23, z + hd * 0.45, Math.PI], [x + hw * 0.45, .23, z + ez, -Math.PI / 2], [x - hw * 0.45, .23, z - ez, Math.PI / 2]);
    hedges.push([x - hw * 0.2, .23, z + ez, 0], [x + hw * 0.2, .23, z - ez, 0], [x + ex, .23, z + hd * 0.2, Math.PI / 2], [x - ex, .23, z - hd * 0.2, Math.PI / 2]);
    bushes.push([x + hw * 0.75, .23, z + ez, 0], [x - hw * 0.75, .23, z - ez, 0]);
    if (i % 3 === 0) hydrants.push([x + ex, .23, z + hd * 0.75, 0]);
    if (i % 4 === 0) signals.push([x - ex, .23, z + ez, 0]);
    if (i % 2 !== 0) return;
    // Bench and bin on the +z sidewalk.
    const sz = z + ez;
    part(x + hw * 0.55, .36 + .23, sz, .3, .45, .3, metal);
    part(x - hw * 0.55, .32 + .23, sz, 1.1, .1, .34, wood);
    part(x - hw * 0.55, .52 + .23, sz + .13, 1.1, .34, .07, wood);
    for (const dx of [-.4, .4]) part(x - hw * 0.55 + dx, .18 + .23, sz, .08, .24, .3, metal);
  });
  if (props.gotham_lamppost) instanceModel(props.gotham_lamppost, scaleForHeight(props.gotham_lamppost, 4.5), lamps, furniture);
  if (hedge) instanceModel(hedge, scaleForHeight(hedge, 0.9), hedges, furniture);
  if (compact) instanceModel(compact, scaleForHeight(compact, 0.8), bushes, furniture);
  if (props.gotham_fire_hydrant) instanceModel(props.gotham_fire_hydrant, scaleForHeight(props.gotham_fire_hydrant, 0.8), hydrants, furniture);
  if (props.gotham_stoplight) instanceModel(props.gotham_stoplight, scaleForHeight(props.gotham_stoplight, 4), signals, furniture);
  // Daniel's four favela variants fill empty plots (syncPlotParks).
  favelaModels = (await Promise.all(['gotham_favela_8bit', 'gotham_favela_02_8bit', 'gotham_favela_03_8bit', 'gotham_favela_04_8bit']
    .map((name) => loadModel(`./models/buildings/${name}.glb`).catch(() => null)))).filter(Boolean);
  parkKit = {
    wall: piece(props.gotham_park_wall, 'Gotham_Park_Wall_Straight'),
    pillar: piece(props.gotham_park_wall, 'Gotham_Park_Wall_Pillar'),
    compact: piece(props.gotham_bushes, 'Gotham_Bush_Compact'),
    hedge: piece(props.gotham_bushes, 'Gotham_Bush_Hedge'),
    tall: piece(props.gotham_bushes, 'Gotham_Bush_Tall'),
    streetTree: props.gotham_street_tree,
    largeTree: props.gotham_large_tree,
  };
  // The main park keeps its lawn and path cross from the environment; it gets the wall, mixed trees and more bushes.
  removeProceduralParkTrees(environment);
  syncPlotParks();

}

let environmentReady = false;
let accountModelsReady = false;
let loadedBuildingModels = null;
const landmarkRoots = [];

// Bristol Heights: a suburb of Daniel's account_building_01 houses on cul-de-sacs. A spine road runs north-south down the
// block; cul-de-sacs branch east and west and end in turning circles, each fanned by three houses facing in; more houses
// line the spine between them; a connector road meets the river bridge. Lawns, yard trees. Not clickable.
function buildSuburbs() {
  const house = loadedBuildingModels?.towers?.[0];
  const group = new THREE.Group();
  group.name = 'Bristol Heights suburb';
  scene.add(group);
  const asphalt = new THREE.MeshStandardMaterial({ color: '#2a2f35', roughness: 0.95 });
  const kerb = new THREE.MeshStandardMaterial({ color: '#8f8a7a', roughness: 0.9 });
  const road = (x, z, w, d) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), asphalt);
    mesh.position.set(x, 0.255, z);
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  const circle = (x, z, radius) => {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(radius + 0.2, radius + 0.2, 0.04, 24), kerb);
    ring.position.set(x, 0.25, z);
    const bulb = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.05, 24), asphalt);
    bulb.position.set(x, 0.26, z);
    const island = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.35, radius * 0.35, 0.08, 16), new THREE.MeshStandardMaterial({ color: '#3f6a45' }));
    island.position.set(x, 0.29, z);
    [ring, bulb, island].forEach((mesh) => { mesh.receiveShadow = true; group.add(mesh); });
  };
  const homes = [];
  const yards = [];
  for (const b of blocks.filter((block) => block.format === 'suburb')) {
    const random = seededRandom(9001 + Math.round(b.x * 7 + b.z));
    const top = b.z - b.depth / 2;
    road(b.x, b.z, 2, b.depth - 0.4); // spine
    road(b.x + b.width / 4 + 0.5, cellZ(7), b.width / 2 - 1, 2); // connector to the river bridge (row 7)
    const rows = [];
    for (let z = top + 11; z < top + b.depth - 6; z += 11) rows.push(z);
    for (const z of rows) {
      for (const side of [-1, 1]) {
        const reach = b.width / 2 - 7; // cul-de-sac stub length from the spine (fan of houses stays on the block)
        road(b.x + side * (1 + reach / 2), z, reach, 1.6);
        const bx = b.x + side * (1 + reach);
        circle(bx, z, 2.2);
        // Three houses fanned around the turning circle, fronts facing it.
        for (const angle of [-1, 0, 1].map((k) => k * Math.PI / 3)) {
          const dx = side * Math.cos(angle) * 4.4;
          const dz = Math.sin(angle) * 4.4;
          homes.push([bx + dx, 0.23, z + dz, Math.atan2(-dx, -dz)]);
        }
        // Yard trees behind the stub houses.
        if (random() > 0.35) yards.push([b.x + side * (2.8 + random() * 2), z + (random() > 0.5 ? 3.4 : -3.4)]);
      }
    }
    // Houses along the spine between cul-de-sacs, facing the spine.
    for (let i = 0; i < rows.length - 1; i++) {
      const z = (rows[i] + rows[i + 1]) / 2;
      homes.push([b.x - 3.4, 0.23, z, Math.PI / 2], [b.x + 3.4, 0.23, z, -Math.PI / 2]);
    }
    for (let i = 0; i < 6; i++) yards.push([b.x + (random() - 0.5) * (b.width - 3), top + 2 + random() * 4]);
  }
  if (house) {
    const size = new THREE.Box3().setFromObject(house).getSize(new THREE.Vector3());
    instanceModel(house, 3.2 / Math.max(size.x, size.z), homes, group); // 3.2 units wide, ~7 m tall: a two-storey house
    flickerWindows(group);
  }
  const tree = parkKit?.streetTree;
  if (tree) yards.forEach(([x, z], i) => group.add(addPlacedModel(tree, [x, 0.23, z], scaleForHeight(tree, 3 + (i % 5) * 0.8), i)));
}

function finishInitialLoad() {
  if (!environmentReady || !accountModelsReady) return;
  buildSuburbs();
  syncPlotParks();
  syncPlotParks();
  document.querySelector('#loading-overlay').classList.add('is-hidden');
  document.querySelector('#loading-overlay small').textContent = 'Buildings and street models ready';
}

city.ready.then(async ({ failures }) => {
  try { await addCityProps(city.group); }
  catch (error) { failures.push({ asset: 'street props', error }); }
  for (const failure of failures) console.error(`Failed to load ${failure.asset}`, failure.error);
  if (failures.length) showToast(`Could not load ${failures.map(f => f.asset).join(', ')}. Reload to retry.`);
}).finally(() => { environmentReady = true; finishInitialLoad(); });

loader.load('./models/buildings/gotham_voxel_skyscraper.glb', async (gltf) => {
  const variants = await Promise.all([
    ['wayne', './models/buildings/wayne_tower.glb?v=12m'],
    ['ace', './models/buildings/ace_chemicals_8bit.glb'],
    ['arkham', './models/buildings/arkham_asylum_8bit.glb'],
  ].map(async ([name, path]) => {
    try { return [name, await loadModel(path)]; }
    catch (error) { console.warn(`Could not load ${name} building:`, error); return [name, null]; }
  }));
  const models = { generic: gltf.scene, ...Object.fromEntries(variants) };
  // Daniel's ten website towers, 01 (9.8 m) to 10 (45.3 m); one that fails to load falls back to Atharva's styles.
  models.towers = await Promise.all(Array.from({ length: 10 }, (_, i) => loadModel(`./models/account_buildings/account_building_${String(i + 1).padStart(2, '0')}.glb`).catch(() => null)));
  models.villains = (await Promise.all(VILLAINS.map((name) => loadModel(`./models/npcs/${name}.glb`).catch((error) => { console.warn(`Could not load ${name}:`, error); return null; })))).filter(Boolean);
  loadedBuildingModels = models;
  accounts.forEach((account) => {
    if (account.slot < 0) return;
    if (renderedBuildings.has(account.id)) return;
    const model = chooseBuildingModel(account, models);
    addAccountBuilding(account, model, buildingScale(model, models));
  });
    for (const landmark of landmarks) {
    const block = blocks[landmark.block];
    let source;
    try { source = await loadModel(`./models/buildings/${landmark.file}${landmark.file === 'wayne_tower.glb' ? '?v=12m' : ''}`); }
    catch {
      source = new THREE.Group();
      const placeholder = new THREE.Mesh(new THREE.BoxGeometry(5, landmark.height, 4), new THREE.MeshStandardMaterial({ color: '#777c87' }));
      placeholder.position.y = landmark.height / 2; source.add(placeholder);
    }
    const bounds = new THREE.Box3().setFromObject(source);
    const size = bounds.getSize(new THREE.Vector3());
    // Daniel's *_8bit landmarks are modeled in meters: true road scale, shrunk only to fit the block, never stretched.
    const scale = landmark.file.endsWith('_8bit.glb')
      ? Math.min(UNITS_PER_METER, (block.width - 1.2) / size.x, (block.depth - 1.2) / size.z)
      : [(block.width - 1.2) / size.x, landmark.height / size.y, (block.depth - 1.2) / size.z];
    const root = addPlacedModel(source, [block.x, 0.23, block.z], scale);
    flickerWindows(root);
    root.userData.landmark = landmark.name;
    const label = landmarkLabel(landmark.name); label.position.set(block.x, 0.23 + landmark.height + 0.8, block.z); scene.add(label);
    landmarkRoots.push(root);
  }
  city.sync(slotOccupants);
  accountModelsReady = true;
  finishInitialLoad();
}, undefined, (error) => {
  console.error('Could not load Blender account building:', error);
  accounts.forEach((account) => { if (account.slot >= 0) showToast('A Blender building model could not be loaded.'); });
  accountModelsReady = true;
  finishInitialLoad();
});

// Older account = taller tower: one of Daniel's ten towers per 1.5 years since the site's first email
// (under 1.5 years: 01, 13.5+ years: 10). No first-seen date: 02.
function towerVariant(account, now = Date.now()) {
  const seen = Date.parse(account.firstSeen);
  if (Number.isNaN(seen)) return 1;
  return Math.max(0, Math.min(9, Math.floor((now - seen) / (365.25 * 864e5) / 1.5)));
}

function chooseBuildingModel(account, models) {
  const tower = models.towers?.[towerVariant(account)];
  if (tower) return tower;
  // Fallback: keep each account's architecture stable across reloads and shuffled placements.
  const styles = ['generic', 'wayne', 'ace', 'arkham'].filter(key => models[key]);
  if (!styles.length) return null;
  const hash = [...account.id].reduce((value, char) => Math.imul(value ^ char.charCodeAt(0), 16777619), 2166136261) >>> 0;
  return models[styles[hash % styles.length]];
}

function buildingScale(model) {
  const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
  return ACCOUNT_FOOTPRINT / Math.max(size.x, size.z);
}

function addAccountBuilding(account, source, scale = 2) {
  if (!source) return;
  // The model is scaled inside an unscaled root, so the beacon and the rooftop villain added to the root stay undistorted.
  const model = source.clone(true);
  const placementSeed = [...account.id].reduce((hash, c) => Math.imul(hash, 31) + c.charCodeAt(0), account.slot + 1);
  const placementRandom = placementRandomGenerator(placementSeed);
  model.rotation.y = Math.floor(placementRandom() * 4) * Math.PI / 2;

  const raw = new THREE.Box3().setFromObject(source).getSize(new THREE.Vector3());
  const age = account.firstSeen ? Math.max(0, (Date.now() - Date.parse(account.firstSeen)) / 31557600000) : 3;
  const isWayne = source === loadedBuildingModels?.wayne;
  // The updated Wayne asset is twice the original tower's height.
  // Daniel's towers are modeled in meters, so they keep their real height at road scale.
  const isDanielTower = loadedBuildingModels?.towers?.includes(source);
  const targetHeight = isDanielTower ? raw.y * UNITS_PER_METER : FLOOR * (2 + Math.min(5, Math.floor(age / 3))) * (isWayne ? 2 : 1);
  const footprint = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
  const footprintScale = ACCOUNT_FOOTPRINT / Math.max(footprint.x, footprint.z);
  model.scale.set(footprintScale, targetHeight / raw.y, footprintScale);
  const root = new THREE.Group();
  root.name = `account-${account.id}`;
  root.add(model);
  cloneInstanceMaterials(root);
  flickerWindows(root);
  const slot = slots[account.slot];
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  const center = bounds.getCenter(new THREE.Vector3());
  model.position.set(-center.x, 0.23 - bounds.min.y, -center.z);
  root.position.set(slot.x, 0, slot.z);
  root.userData.accountId = account.id;
  root.userData.buildingStyle = Object.entries(loadedBuildingModels ?? {}).find(([, model]) => model === source)?.[0] ?? 'generic';
  root.traverse((node) => { node.userData.accountId = account.id; if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; } });
  scene.add(root);
  addStatusBeacon(root, account.status, 0.23 + bounds.max.y - bounds.min.y);
  renderedBuildings.set(account.id, root);
  slotOccupants.set(account.slot, account.id);
  syncPlotParks();
  applyBuildingState(account);
}

// Random window lights, fixed once drawn: each pane is lit or dark at random, with a different pattern per building.
// Daniel's panes are merged into one mesh per material, so each pane is found as a connected piece of the mesh
// (triangles sharing corners) and gets its own random seed; a small shader patch turns ~35% of panes off. Off panes keep
// a faint glow.
const WINDOW_MATERIAL = /window/i;
function windowSeeds(geometry) {
  if (geometry.attributes.windowSeed) return;
  const position = geometry.attributes.position;
  const parent = Int32Array.from({ length: position.count }, (_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
  const index = geometry.index?.array;
  const corners = index ? index.length : position.count;
  for (let t = 0; t < corners; t += 3) {
    const [a, b, c] = index ? [index[t], index[t + 1], index[t + 2]] : [t, t + 1, t + 2];
    union(a, b);
    union(a, c);
  }
  const welded = new Map(); // flat-shaded boxes repeat corners per face: weld them so a whole pane is one piece
  for (let i = 0; i < position.count; i++) {
    const key = `${Math.round(position.getX(i) * 1000)},${Math.round(position.getY(i) * 1000)},${Math.round(position.getZ(i) * 1000)}`;
    if (welded.has(key)) union(i, welded.get(key)); else welded.set(key, i);
  }
  const seedOf = new Map();
  const seeds = new Float32Array(position.count);
  for (let i = 0; i < position.count; i++) {
    const piece = find(i);
    if (!seedOf.has(piece)) {
      const h = Math.sin(position.getX(piece) * 12.9898 + position.getY(piece) * 78.233 + position.getZ(piece) * 37.719) * 43758.5453;
      seedOf.set(piece, h - Math.floor(h));
    }
    seeds[i] = seedOf.get(piece);
  }
  geometry.setAttribute('windowSeed', new THREE.BufferAttribute(seeds, 1));
}
function flickerWindows(root) {
  const buildingSeed = Math.random();
  root.traverse((node) => {
    if (!node.isMesh) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    if (!materials.some((material) => WINDOW_MATERIAL.test(material.name) || node.name.startsWith('window_'))) return;
    windowSeeds(node.geometry);
    materials.forEach((material) => {
      if (material.userData.flicker) return;
      material.userData.flicker = true;
      material.customProgramCacheKey = () => 'window-flicker';
      material.onBeforeCompile = (shader) => {
        shader.uniforms.buildingSeed = { value: buildingSeed };
        shader.vertexShader = shader.vertexShader
          .replace('void main() {', 'attribute float windowSeed;\nvarying float vWindowSeed;\nvoid main() {\n  vWindowSeed = windowSeed;\n#ifdef USE_INSTANCING\n  vWindowSeed = fract(windowSeed + dot(instanceMatrix[3].xz, vec2(0.0731, 0.1197)));\n#endif');
        shader.fragmentShader = shader.fragmentShader
          .replace('void main() {', `uniform float buildingSeed;
varying float vWindowSeed;
void main() {
  float roll = fract(sin((vWindowSeed * 91.7 + buildingSeed * 13.1) * 12.9898) * 43758.5453);
  float windowLit = roll > 0.35 ? 1.0 : 0.0; // about two thirds of panes lit`)
          .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= mix(0.28, 1.0, windowLit);')
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance *= mix(0.06, 1.0, windowLit);');
      };
      material.needsUpdate = true;
    });
  });
}

function cloneInstanceMaterials(root) {
  root.traverse((node) => {
    if (!node.isMesh || !node.material) return;
    node.material = Array.isArray(node.material) ? node.material.map((material) => material.clone()) : node.material.clone();
  });
}

function addStatusBeacon(root, status, buildingHeight = 6.5) {
  const marker = new THREE.Group();
  marker.name = 'status-beacon';
  marker.position.set(0, buildingHeight + 0.5, 0);
  const color = statusColors[status];
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.045, 6, 20), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.0, roughness: 0.35 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -0.17;
  ring.castShadow = false;
  marker.add(ring);
  const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(0.17, 0), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.8, roughness: 0.3 }));
  beacon.castShadow = false;
  marker.add(beacon);
  root.add(marker);
  root.userData.statusBeacon = marker;
}

// Tai's villain figures (models/npcs). Riddler, Batman and Robin have no GLB export yet.
const VILLAINS = ['gotham_joker', 'gotham_harley_quinn', 'gotham_penguin', 'gotham_poison_ivy'];
const VILLAIN_HEIGHT = meters(1.8); // a person on the roof, at road scale

function syncRooftopVillain(account, root) {
  if (root.userData.villain) { root.remove(root.userData.villain); root.userData.villain = null; }
  const villains = loadedBuildingModels?.villains;
  if (account.status !== 'breached' || !villains?.length) return;
  const villain = villains[[...(account.name || account.id)].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % villains.length].clone(true);
  const beacon = root.userData.statusBeacon;
  if (beacon) root.remove(beacon); // measure the roof, not the beacon floating over it
  root.updateMatrixWorld(true);
  const roof = new THREE.Box3().setFromObject(root);
  if (beacon) root.add(beacon);
  // Joker is Y-up; Harley, Penguin and Ivy were exported with height along -Z like the props, so stand them up.
  const raw = new THREE.Box3().setFromObject(villain).getSize(new THREE.Vector3());
  villain.rotation.order = 'YXZ';
  villain.rotation.set(raw.z > raw.y ? Math.PI / 2 : 0, Math.PI / 4, 0); // face the isometric camera
  villain.scale.setScalar(VILLAIN_HEIGHT / Math.max(raw.y, raw.z));
  villain.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(villain);
  const center = bounds.getCenter(new THREE.Vector3());
  const roofCenter = roof.getCenter(new THREE.Vector3());
  villain.position.set(roofCenter.x - center.x, roof.max.y - bounds.min.y, roofCenter.z - center.z);
  villain.traverse((node) => { node.userData.accountId = account.id; if (node.isMesh) node.castShadow = true; });
  root.attach(villain); // keep world placement under the scaled building
  root.userData.villain = villain;
}

function applyBuildingState(account) {
  const root = renderedBuildings.get(account.id);
  if (!root) return;
  syncRooftopVillain(account, root);
  const color = new THREE.Color(statusColors[account.status]);
  const beacon = root.userData.statusBeacon;
  if (beacon) beacon.traverse((node) => { if (node.isMesh && node.material) { node.material.color.copy(color); if (node.material.emissive) node.material.emissive.copy(color); } });
  root.traverse((node) => {
    if (!node.isMesh || !node.material) return;
    const materials = (Array.isArray(node.material) ? node.material : [node.material]).filter((material) => node.name.startsWith('window_') || material.name.startsWith('MAT_Window'));
    materials.forEach((windowMaterial) => {
      if (account.status === 'clear') {
        windowMaterial.emissive?.set('#9a7651');
        windowMaterial.emissiveIntensity = 0.32;
      } else if (account.status === 'breached') {
        windowMaterial.emissive?.set('#f08752');
        windowMaterial.emissiveIntensity = 1.35;
      } else {
        windowMaterial.emissive?.set('#897a57');
        windowMaterial.emissiveIntensity = 0.12;
      }
    });
  });
}

function renderDirectory() {
  const list = document.querySelector('#account-list');
  list.replaceChildren();
  accounts.forEach((account) => {
    const row = document.createElement('li');
    row.innerHTML = `<button type="button" class="account-row${account.id === selectedId ? ' is-selected' : ''}" data-id="${account.id}" aria-pressed="${account.id === selectedId}"><span class="row-glyph" aria-hidden="true">⌂</span><span class="row-copy"><strong>${escapeHtml(account.name)}</strong><small>${escapeHtml(account.district)} · ${escapeHtml(account.label)}</small></span><i class="row-status status-${account.status}" aria-label="${account.status}"></i></button>`;
    row.querySelector('button').addEventListener('click', () => selectAccount(account.id));
    list.append(row);
  });
  document.querySelector('#account-total').textContent = String(accounts.length).padStart(2, '0');
  document.querySelector('#total-count').textContent = String(accounts.length).padStart(2, '0');
}

function renderOverview() {
  if (document.querySelector('#city-stats').hidden) showCityMood();
  document.querySelector('#clear-count').textContent = String(accounts.filter((account) => account.status === 'clear').length).padStart(2, '0');
  document.querySelector('#breached-count').textContent = String(accounts.filter((account) => account.status === 'breached').length).padStart(2, '0');
  document.querySelector('#unknown-count').textContent = String(accounts.filter((account) => account.status === 'unknown').length).padStart(2, '0');
  document.querySelector('#last-check').textContent = `TODAY · ${accounts.find((account) => account.checkedAt)?.checkedAt ?? 'NOT CHECKED'}`;
}

const statusLabel = { clear: 'NO MATCH', breached: 'BREACH', unknown: 'UNAVAILABLE' };
const countStatuses = (list) => ({
  clear: list.filter((account) => account.status === 'clear').length,
  breached: list.filter((account) => account.status === 'breached').length,
  unknown: list.filter((account) => account.status === 'unknown').length,
});

// The phone dialog is one template; each building fills it with its own report.
// 8-bit bat-hero mascot on the bat-phone's corner: an original 16x16 pixel drawing, one character per pixel.
// K cowl, B cowl highlight, W eyes, S face. Each mood swaps the eyes and mouth.
const MASCOT_COLORS = { K: '#1a2233', B: '#33456a', W: '#e9f7ff', S: '#f1c79c', M: '#2a1414', T: '#fffdf2', R: '#d6404a' };
const MASCOT_HEAD = [
  '..KK........KK..',
  '..KK........KK..',
  '..KKK......KKK..',
  '.KKKKKKKKKKKKKK.',
  '.KKBBKKKKKKBBKK.',
  '.KKKKKKKKKKKKKK.',
  '.KKKKKKKKKKKKKK.',
  '.KKKKKKKKKKKKKK.',
  '.KKKKKKKKKKKKKK.',
  '.KKSSSSSSSSSSKK.',
  '.KSSSSSSSSSSSSK.',
  '.KSSSSSSSSSSSSK.',
  '.KSSSSSSSSSSSSK.',
  '..SSSSSSSSSSSS..',
  '...SSSSSSSSSS...',
];
// [color, x, y] pixels drawn over the head for each mood.
const px = (color, cells) => cells.map(([x, y]) => [color, x, y]);
const OPEN_EYES = px('W', [[3, 6], [4, 6], [5, 6], [10, 6], [11, 6], [12, 6]]);
const MASCOT_MOODS = {
  happy: [...OPEN_EYES, ...px('M', [[4, 10], [11, 10], [5, 11], [10, 11], [6, 12], [7, 12], [8, 12], [9, 12]]), ...px('T', [[6, 11], [7, 11], [8, 11], [9, 11]])],
  angry: [
    // Eyes slant down toward the nose; teeth clenched in a box.
    ...px('W', [[3, 6], [4, 6], [4, 7], [5, 7], [12, 6], [11, 6], [11, 7], [10, 7]]),
    ...px('M', [[4, 10], [5, 10], [6, 10], [7, 10], [8, 10], [9, 10], [10, 10], [11, 10], [4, 11], [11, 11], [4, 12], [5, 12], [6, 12], [7, 12], [8, 12], [9, 12], [10, 12], [11, 12], [7, 11]]),
    ...px('T', [[5, 11], [6, 11], [8, 11], [9, 11], [10, 11]]),
  ],
  normal: [...OPEN_EYES, ...px('M', [[6, 11], [7, 11], [8, 11], [9, 11]])],
  wary: [...px('W', [[3, 7], [4, 7], [5, 7], [10, 7], [11, 7], [12, 7]]), ...px('M', [[5, 11], [6, 11], [7, 11], [8, 11], [9, 11], [10, 11]])],
  unsure: [...OPEN_EYES, ...px('W', [[12, 5]]), ...px('M', [[5, 11], [6, 12], [7, 11], [8, 12], [9, 11], [10, 12]])],
};
const MASCOT_LABELS = { normal: 'Batman is calm, watching over Gotham', happy: 'Batman is smiling: no known breach', angry: 'Batman is gritting his teeth: breached', wary: 'Batman looks wary: only old breaches', unsure: 'Batman looks unsure: could not check' };
const BAT_EMBLEM = ['YY...Y.Y...YY', 'YYYY.YYY.YYYY', 'YYYYYYYYYYYYY', '.YYYYYYYYYYY.', '..YY.YYY.YY..', '......Y......'];
function pixelRects(rows, colors) {
  return rows.flatMap((row, y) => [...row].map((key, x) => (colors[key] ? `<rect x="${x}" y="${y}" width="1" height="1" fill="${colors[key]}"/>` : ''))).join('');
}
document.querySelector('#bat-emblem').innerHTML = pixelRects(BAT_EMBLEM, { Y: '#0b0d12' });
// Cowl ears on the bat-phone: outer edge straight up, inner edge sloping in, yellow outline around black.
const EAR_ROWS = Array.from({ length: 7 }, (_, row) => {
  const cells = Array(34).fill('.');
  const width = row + 2;
  for (let i = 0; i < width; i++) {
    const edge = i === 0 || i === width - 1 || row === 0;
    cells[2 + i] = edge ? 'Y' : 'K';
    cells[31 - i] = edge ? 'Y' : 'K';
  }
  return cells.join('');
});
document.querySelector('#bat-phone-ears').innerHTML = pixelRects(EAR_ROWS, { Y: '#ffd45e', K: '#07090d' });
const MOOD_TEXT = { normal: 'Watching over Gotham', happy: 'No known breach', angry: 'Breached: act now', wary: 'Only old breaches', unsure: "Couldn't check" };
// The bottom-left status card: a title and the mascot's mood (with its line of text).
function setMascotMood(mood, title = 'Gotham', detail = MOOD_TEXT[mood]) {
  document.querySelector('#bat-status').dataset.mood = mood;
  document.querySelector('#bat-status-title').textContent = title;
  document.querySelector('#bat-status-detail').textContent = detail;
  const mascot = document.querySelector('#bat-mascot');
  const face = MASCOT_MOODS[mood].map(([key, x, y]) => `<rect x="${x}" y="${y}" width="1" height="1" fill="${MASCOT_COLORS[key]}"/>`).join('');
  mascot.innerHTML = pixelRects(MASCOT_HEAD, MASCOT_COLORS) + face;
  mascot.setAttribute('aria-label', MASCOT_LABELS[mood]);
  mascot.dataset.mood = mood;
  mascot.classList.remove('is-reacting');
  void mascot.getBoundingClientRect(); // restart the hop
  mascot.classList.add('is-reacting');
}
// With no report open, the card shows the whole city: any breach beats old breaches beats unchecked beats clear.
function showCityMood() {
  const breached = accounts.filter((account) => account.status === 'breached').length;
  const historical = accounts.filter((account) => account.status === 'clear' && account.historical?.length).length;
  const unknown = accounts.filter((account) => account.status === 'unknown').length;
  if (breached) setMascotMood('angry', 'Gotham', `${breached} breached site${breached === 1 ? '' : 's'}: act now`);
  else if (historical) setMascotMood('wary', 'Gotham', `${historical} site${historical === 1 ? '' : 's'} with old breaches`);
  else if (unknown) setMascotMood('unsure', 'Gotham', `${unknown} site${unknown === 1 ? '' : 's'} couldn't be checked`);
  else setMascotMood('happy', 'Gotham', `${accounts.length} sites, no known breach`);
}

function openPhone({ eyebrow, title, subtitle, cards, counts = null, listTitle, rows, note, focus, zoom = camera.zoom, mood = 'happy' }) {
  document.querySelector('.mission-board')?.remove();
  document.querySelector('.city-stats-dialog').classList.remove('is-mission-board');
  document.querySelector('#city-stats-list').hidden = false;
  document.querySelector('#city-stats-list-name').parentElement.hidden = false;
  setMascotMood(mood, title);
  closeCardDetails();
  if (focus) {
    const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    cameraRight.y = 0;
    cameraRight.normalize();
    const leftComposition = window.innerWidth <= 560 ? 0.38 : window.innerWidth <= 760 ? 0.36 : 0.13;
    const panOffset = (camera.right - camera.left) / zoom * leftComposition;
    focusCamera(focus.x + cameraRight.x * panOffset, 5, focus.z + cameraRight.z * panOffset, 850, null, zoom);
  }
  document.querySelector('#city-stats-cards').replaceChildren(...cards.map(([label, value, kind, details]) => {
    const card = document.createElement(details ? 'button' : 'div');
    card.className = `city-stats-card city-stats-${kind}${details ? ' has-details' : ''}`;
    if (details) {
      card.type = 'button';
      card.setAttribute('aria-haspopup', 'dialog');
      card.addEventListener('click', () => openCardDetails(label, details));
    }
    const caption = document.createElement('span');
    caption.textContent = label;
    const strong = document.createElement('strong');
    strong.textContent = typeof value === 'number' ? String(value).padStart(2, '0') : value;
    card.append(caption, strong);
    return card;
  }));
  const bar = document.querySelector('#city-stats-bar');
  bar.hidden = !counts;
  bar.replaceChildren();
  if (counts) {
    const total = counts.clear + counts.breached + counts.unknown;
    bar.setAttribute('aria-label', `${counts.clear} clear, ${counts.breached} breached, ${counts.unknown} unavailable`);
    ['clear', 'breached', 'unknown'].forEach((status) => {
      const segment = document.createElement('span');
      segment.className = `city-stats-segment status-${status}`;
      segment.style.width = `${total ? counts[status] / total * 100 : 0}%`;
      bar.append(segment);
    });
  }
  const list = document.querySelector('#city-stats-list');
  list.replaceChildren(...rows.map(([name, detail, badge, kind, href]) => {
    const row = document.createElement('li');
    row.className = `city-stats-row status-${kind}`;
    const identity = document.createElement('span');
    identity.className = 'city-stats-identity';
    const strong = document.createElement('strong');
    if (href) {
      const link = document.createElement('a');
      link.href = href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = `${name} \u2197`;
      strong.append(link);
    } else strong.textContent = name;
    const small = document.createElement('small');
    small.textContent = detail;
    identity.append(strong, small);
    const status = document.createElement('span');
    status.className = 'city-stats-status';
    status.textContent = badge;
    row.append(identity, status);
    return row;
  }));
  if (!rows.length) {
    const empty = document.createElement('li');
    empty.className = 'city-stats-row';
    empty.textContent = 'Nothing to show yet.';
    list.append(empty);
  }
  document.querySelector('#city-stats-eyebrow').textContent = eyebrow;
  document.querySelector('#city-stats-title').textContent = title;
  document.querySelector('#city-stats-subtitle').textContent = subtitle;
  document.querySelector('#city-stats-list-name').textContent = listTitle;
  document.querySelector('#city-stats-list-total').textContent = `${rows.length} TOTAL`;
  document.querySelector('#city-stats-note').textContent = note;
  document.querySelector('#city-stats').hidden = false;
  document.querySelector('#city-stats-close').focus();
}

// A card's sublist: { intro, items: [[name, detail]] } shown over the phone screen.
function openCardDetails(label, { intro, items }) {
  closeCardDetails();
  const sheet = document.createElement('section');
  sheet.className = 'city-stats-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', label);
  const head = document.createElement('div');
  head.className = 'city-stats-sheet-head';
  const title = document.createElement('strong');
  title.textContent = label;
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'BACK';
  close.addEventListener('click', closeCardDetails);
  head.append(title, close);
  const text = document.createElement('p');
  text.textContent = intro;
  const list = document.createElement('ul');
  list.replaceChildren(...(items.length ? items : [['None for this site', '']]).map(([name, detail]) => {
    const item = document.createElement('li');
    const strong = document.createElement('strong');
    strong.textContent = name;
    const small = document.createElement('small');
    small.textContent = detail;
    item.append(strong, small);
    return item;
  }));
  sheet.append(head, text, list);
  document.querySelector('.city-stats-screen').append(sheet);
  close.focus();
}
function closeCardDetails() {
  document.querySelector('.city-stats-sheet')?.remove();
}

const breachItems = (breaches) => breaches.map((breach) => [breach.name, `${breach.date || 'Date unavailable'} · ${(breach.exposedData || []).join(', ') || 'Exposed data not provided'}`]);

// One website skyscraper: that site's own breaches and exposed data.
function showAccountReport(accountId) {
  const account = accountsById.get(accountId);
  if (!account) return;
  const exposed = [...new Set([...account.breaches, ...account.historical].flatMap((breach) => breach.exposedData || []))];
  openPhone({
    eyebrow: 'WEBSITE REPORT',
    title: account.name,
    subtitle: [account.domain, account.label, account.district].filter(Boolean).join(' · '),
    cards: [
      ['STATUS', accountBadge(account), account.status],
      ['RECENT', account.breaches.length, account.breaches.length ? 'breached' : 'clear', { intro: `Breaches from the last ${RECENT_BREACH_MONTHS} months. These make the site count as breached.`, items: breachItems(account.breaches) }],
      ['HISTORICAL', account.historical.length, 'total', { intro: `Breaches older than ${RECENT_BREACH_MONTHS} months. The site no longer counts as breached, but the data is still out there.`, items: breachItems(account.historical) }],
      ['DATA TYPES', exposed.length, exposed.length ? 'breached' : 'total', {
        intro: 'The kinds of personal information about you that leaked from this site, and which breach leaked each one.',
        items: exposed.map((type) => [type, [...account.breaches, ...account.historical].filter((breach) => (breach.exposedData || []).includes(type)).map((breach) => `${breach.name} (${breach.date || 'date unknown'})`).join(', ')]),
      }],
      ['FIRST SEEN', account.firstSeen || '—', 'total'],
    ],
    listTitle: account.status === 'unknown' ? 'CHECK STATUS' : 'BREACHES',
    rows: account.status === 'unknown'
      ? [['Check unavailable', account.error || 'The source did not return a complete result.', 'UNAVAILABLE', 'unknown']]
      : [...account.breaches.map((breach) => [breach, 'RECENT', 'breached']), ...account.historical.map((breach) => [breach, 'HISTORICAL', 'historical'])]
        .map(([breach, badge, kind]) => [breach.name, `${breach.date || 'Date unavailable'} · ${(breach.exposedData || []).join(', ') || 'Exposed data not provided'}`, badge, kind]),
    note: account.status === 'clear' && account.historical.length ? `Breaches older than ${RECENT_BREACH_MONTHS} months are historical: still change that password if you never did.`
      : account.status === 'clear' ? 'No match means no known match in this source, not a guarantee.' : `Source: ${account.source || 'breach check'} · checked ${account.checkedAt || 'recently'}`,
    focus: slots[account.slot],
    zoom: FOCUS_ZOOM,
    mood: account.status === 'breached' ? 'angry' : account.status === 'unknown' ? 'unsure' : account.historical.length ? 'wary' : 'happy',
  });
}

let missionFilter = 'open';
const missionSession = new Map();
function showMissionBoard({ focus = true } = {}) {
  const scope = currentCheck?.id || 'sample-city';
  let storage;
  try { storage = window.localStorage; } catch { /* Private mode: keep progress for this session. */ }
  const progress = missionSession.get(scope) || readProgress(storage, scope);
  missionSession.set(scope, progress);
  const tasks = buildMissions(accounts);
  const completed = tasks.filter(task => progress[task.key]).length;
  const urgent = tasks.filter(task => task.priority === 0 && !progress[task.key]).length;
  const boardScroll = document.querySelector('.mission-list')?.scrollTop || 0;
  const landmark = landmarks.find(item => item.name === 'GCPD Headquarters');
  openPhone({ eyebrow: 'GCPD HEADQUARTERS · OPERATIONS', title: 'Mission board',
    subtitle: 'Your next steps toward a better protected city.',
    cards: [['OPEN', tasks.length - completed, 'total'], ['URGENT', urgent, 'breached'], ['DONE', completed, 'clear']],
    listTitle: 'MISSIONS', rows: [],
    note: 'Completion is self-reported. Breach City does not change your accounts or erase breach history. Progress is saved in this browser.',
    focus: focus && landmark ? blocks[landmark.block] : null, mood: urgent ? 'wary' : 'normal' });
  document.querySelector('.city-stats-dialog').classList.add('is-mission-board');
  document.querySelector('#city-stats-list').hidden = true;
  document.querySelector('#city-stats-list-name').parentElement.hidden = true;
  const board = document.createElement('section');
  board.className = 'mission-board';
  const pct = tasks.length ? Math.round(completed / tasks.length * 100) : 0;
  board.innerHTML = `<div class="mission-progress"><span>${completed} of ${tasks.length} missions complete</span><strong>${pct}%</strong><progress max="${tasks.length || 1}" value="${completed}" aria-label="Mission completion"></progress></div><div class="mission-filters" role="group" aria-label="Filter missions">${[['open', 'Open'], ['done', 'Completed'], ['all', 'All']].map(([key, label]) => `<button type="button" data-filter="${key}" aria-pressed="${missionFilter === key}">${label}</button>`).join('')}</div><p class="mission-announcement" role="status" aria-live="polite"></p><div class="mission-list"></div>`;
  const list = board.querySelector('.mission-list');
  const visible = tasks.filter(task => missionFilter === 'all' || (missionFilter === 'done' ? !!progress[task.key] : !progress[task.key]));
  visible.forEach(task => {
    const done = !!progress[task.key];
    const card = document.createElement('article');
    card.className = `mission-card${done ? ' is-complete' : ''}`;
    const url = serviceUrl(task.domain);
    card.innerHTML = `<div class="mission-meta"><span class="mission-priority priority-${task.priority}">${done ? 'COMPLETED' : ['URGENT', 'HIGH PRIORITY', 'FOLLOW UP'][task.priority]}</span><button class="mission-report" type="button">${escapeHtml(task.account)} ↗</button></div><h3>${escapeHtml(task.title)}</h3><p class="mission-reason">${escapeHtml(task.reason)}</p><p>${escapeHtml(task.detail)}</p><div class="mission-actions">${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${escapeHtml(task.account)} website in a new tab">Open ${escapeHtml(task.account)} ↗</a>` : '<span class="mission-no-link">No verified service domain available</span>'}<button type="button" class="mission-complete">${done ? 'Undo completion' : 'Mark complete'}</button></div>${url ? '<small class="mission-link-note">Opens the service website. Find password and MFA options in account security settings.</small>' : ''}`;
    card.querySelector('.mission-report').addEventListener('click', () => showAccountReport(task.accountId));
    card.querySelector('.mission-complete').addEventListener('click', () => {
      if (done) delete progress[task.key]; else progress[task.key] = new Date().toISOString();
      const saved = saveProgress(storage, scope, progress);
      showMissionBoard({ focus: false });
      document.querySelector('.mission-announcement').textContent = `${task.account}: ${done ? 'mission reopened' : 'marked complete'}.${saved ? '' : ' Browser storage is unavailable; progress lasts for this session.'}`;
      document.querySelector(`.mission-filters [data-filter="${missionFilter}"]`).focus();
    });
    list.append(card);
  });
  if (!visible.length) list.innerHTML = `<div class="mission-empty"><strong>${!tasks.length ? 'No missions to assign' : missionFilter === 'done' ? 'No completed missions yet' : 'All caught up'}</strong><p>${!tasks.length ? 'No known exposure tasks in the current results. Unavailable checks will still need follow-up.' : missionFilter === 'done' ? 'Complete a task after taking action on the service website.' : 'Completed actions stay in the Completed tab. Recorded breaches remain in your reports.'}</p></div>`;
  board.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
    missionFilter = button.dataset.filter; showMissionBoard({ focus: false });
    document.querySelector(`.mission-filters [data-filter="${missionFilter}"]`).focus();
  }));
  document.querySelector('#city-stats-note').before(board);
  list.scrollTop = boardScroll;
}

// Fixed landmarks report on the whole ward.
const landmarkBlock = (name) => blocks[landmarks.find((landmark) => landmark.name === name)?.block ?? 0];
const landmarkReports = {
  gcpd: () => showMissionBoard(),
  // Gotham Bank: every account, by when it was opened.
  bank: () => {
    const dated = accounts.filter((account) => account.firstSeen).sort((a, b) => a.firstSeen.localeCompare(b.firstSeen));
    const years = (account) => ((Date.now() - Date.parse(account.firstSeen)) / (365.25 * 864e5)).toFixed(0);
    openPhone({
      eyebrow: 'GOTHAM BANK · ACCOUNT VAULT',
      title: 'All accounts',
      subtitle: 'When each account was opened (first email from the site)',
      cards: [['SITES', accounts.length, 'total'], ['OLDEST', dated[0]?.firstSeen.slice(0, 4) ?? '—', 'total']],
      listTitle: 'OLDEST FIRST',
      rows: [...dated, ...accounts.filter((account) => !account.firstSeen)].map((account) => [account.name, account.firstSeen ? `since ${account.firstSeen}` : 'opening date unknown', account.firstSeen ? `${years(account)} YRS` : '—', account.status]),
      note: 'Older accounts are taller towers. Close the ones you no longer use.',
      focus: landmarkBlock('Gotham Bank'),
      mood: 'normal',
    });
  },
  // Cobblepot Manor: breach news from the checker, or its offline sample. The news is Have I Been Pwned's breach
  // catalog, so each headline opens that breach's HIBP page.
  cobblepot: async () => {
    let news = null;
    try { news = await (await fetch(`${CHECKER_API}/api/news?limit=8`)).json(); }
    catch { news = await (await fetch('./checker/samples/news.json')).json().catch(() => null); }
    const recent = news?.recent ?? [];
    openPhone({
      eyebrow: 'COBBLEPOT MANOR · BREACH NEWS',
      title: 'Latest breaches',
      subtitle: news?.source ?? 'Breach news unavailable',
      cards: [['NEW BREACHES', recent.length, recent.length ? 'breached' : 'total'], ['THIS YEAR', news?.thisYear?.breaches ?? '—', 'total']],
      listTitle: 'RECENT',
      rows: recent.map((item) => [item.name, `${item.date} · ${Number(item.records || 0).toLocaleString()} records · ${item.industry || 'industry unknown'}`, 'NEWS', 'unknown', `https://haveibeenpwned.com/Breach/${encodeURIComponent(item.name)}`]),
      note: 'News about any service, not only yours. Tap a headline for the full story.',
      focus: landmarkBlock('Cobblepot Manor'),
      mood: 'normal',
    });
  },
  // Blackgate Penitentiary: old breaches, locked away after the 12-month window.
  blackgate: () => {
    const locked = accounts.flatMap((account) => (account.historical ?? []).map((breach) => [account.name, `${breach.name} · ${breach.date || 'date unknown'}`, 'HISTORICAL', 'historical']));
    openPhone({
      eyebrow: 'BLACKGATE · LOCKED AWAY',
      title: 'Historical breaches',
      subtitle: `Breaches older than ${RECENT_BREACH_MONTHS} months`,
      cards: [['LOCKED UP', locked.length, 'total']],
      listTitle: 'SERVED THEIR TIME',
      rows: locked,
      note: 'Old breaches still count: change those passwords if you never did.',
      focus: landmarkBlock('Blackgate Penitentiary'),
      mood: locked.length ? 'wary' : 'happy',
    });
  },
  // Elliot Memorial: sites the check couldn't reach.
  elliot: () => {
    const unknown = accounts.filter((account) => account.status === 'unknown');
    openPhone({
      eyebrow: 'ELLIOT MEMORIAL · NEEDS A RECHECK',
      title: "Couldn't check",
      subtitle: 'Unknown is not clear',
      cards: [['UNCHECKED', unknown.length, unknown.length ? 'unknown' : 'clear']],
      listTitle: 'IN RECOVERY',
      rows: unknown.map((account) => [account.name, account.error || 'The source did not answer.', 'UNKNOWN', 'unknown']),
      note: 'Run the check again later.',
      focus: landmarkBlock('Elliot Memorial'),
      mood: unknown.length ? 'unsure' : 'happy',
    });
  },
  wayne: () => openPhone({
    eyebrow: 'WAYNE TOWER · ACCOUNT MONITOR',
    title: 'Account overview',
    subtitle: 'Every website checked for this email',
    cards: [['ACCOUNTS MONITORED', accounts.length, 'total'], ...['clear', 'breached', 'unknown'].map((status) => [statusLabel[status], countStatuses(accounts)[status], status])],
    counts: countStatuses(accounts),
    listTitle: 'ACCOUNT STATUS',
    rows: accounts.map((account) => [account.name, account.district, accountBadge(account), account.status]),
    note: 'No match means no known match in this sample source.',
    focus: blocks[0],
    mood: 'normal', // Wayne Tower is home base: calm whatever the city's state
  }),
  arkham: () => {
    const breached = accounts.filter((account) => account.status === 'breached');
    openPhone({
      eyebrow: 'ARKHAM ASYLUM · BREACH WARD',
      title: 'Breached websites',
      subtitle: 'Sites where your email turned up in a known breach',
      cards: [['BREACHED SITES', breached.length, 'breached'], ['BREACHES', breached.reduce((sum, account) => sum + account.breaches.length, 0), 'breached']],
      listTitle: 'LOCKED UP',
      rows: breached.map((account) => [account.name, account.breaches.map((breach) => `${breach.name} (${breach.date || 'date unknown'})`).join(', ') || 'Breach details unavailable', 'BREACH', 'breached']),
      note: 'Change the password on each of these sites, and anywhere you reused it.',
      focus: blocks[landmarks.find(l => l.name === 'Arkham Asylum').block],
      mood: breached.length ? 'angry' : 'happy',
    });
  },
  ace: () => {
    const tally = new Map();
    accounts.forEach((account) => [...account.breaches, ...account.historical].forEach((breach) => (breach.exposedData || []).forEach((type) => {
      if (!tally.has(type)) tally.set(type, new Set());
      tally.get(type).add(account.name);
    })));
    const rows = [...tally].sort((a, b) => b[1].size - a[1].size).map(([type, sites]) => [type, [...sites].join(', '), `${sites.size} SITE${sites.size === 1 ? '' : 'S'}`, 'breached']);
    openPhone({
      eyebrow: 'ACE CHEMICALS · SPILL REPORT',
      title: 'Exposed data',
      subtitle: 'What leaked across all your breached sites',
      cards: [['DATA TYPES', rows.length, rows.length ? 'breached' : 'clear'], ['SITES', accounts.filter((account) => account.breaches.length || account.historical.length).length, 'breached']],
      listTitle: 'LEAKED DATA',
      rows,
      note: 'Includes historical breaches: leaked data stays leaked. Passwords and phone numbers are the most urgent to change.',
      focus: blocks[landmarks.find(l => l.name === 'Ace Chemicals').block],
      mood: rows.length ? 'angry' : 'happy',
    });
  },
};

function closeCityStats() {
  showCityMood();
  closeCardDetails();
  document.querySelector('#city-stats').hidden = true;
  const selected = document.querySelector(`#account-list [data-id="${selectedId}"]`);
  (selected ?? document.querySelector('#camera-button')).focus();
}

document.querySelector('#city-stats-close').addEventListener('click', closeCityStats);
document.querySelector('#city-stats').addEventListener('click', (event) => {
  if (event.target.id === 'city-stats') closeCityStats();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !document.querySelector('#city-stats').hidden) closeCityStats();
  if (event.key === 'Tab' && !document.querySelector('#city-stats').hidden) {
    const items = [...document.querySelectorAll('.city-stats-dialog button, .city-stats-dialog a[href]')].filter(item => item.getClientRects().length);
    const first = items[0], last = items.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
});

function renderDetails() {
  const account = accountsById.get(selectedId);
  if (!account) return;
  document.querySelector('#report-id').textContent = account.id.toUpperCase().replace('-', '—');
  document.querySelector('#detail-name').textContent = account.name;
  document.querySelector('#detail-label').textContent = account.label;
  document.querySelector('#detail-source').textContent = account.source;
  document.querySelector('#detail-checked').textContent = account.checkedAt ?? 'Not checked';
  const statusNode = document.querySelector('#detail-status');
  statusNode.className = `report-status status-${account.status}`;
  statusNode.innerHTML = `<span class="status-symbol">${account.status === 'clear' ? '✓' : account.status === 'breached' ? '!' : '?'}</span><span>${account.status === 'clear' && account.historical?.length ? `Only breaches older than ${RECENT_BREACH_MONTHS} months` : statusText[account.status]}</span>`;
  const incident = document.querySelector('#incident-block');
  const content = document.querySelector('#incident-content');
  if (account.status === 'breached' && account.breaches.length) {
    const breach = account.breaches[0];
    incident.hidden = false;
    content.innerHTML = `<div class="incident-row"><strong>${escapeHtml(breach.name)}</strong><span>${escapeHtml(breach.date || 'Date unavailable')}</span></div><p class="incident-categories">Exposed categories: ${escapeHtml(breach.exposedData.join(', ') || 'Not provided')}</p>`;
  } else if (account.status === 'unknown') {
    incident.hidden = false;
    content.innerHTML = `<p class="incident-categories">${escapeHtml(account.error || 'The source did not return a complete result. This is not a clear result.')}</p>`;
  } else {
    incident.hidden = true;
    content.replaceChildren();
  }
  renderDirectory();
}

function selectAccount(id) {
  if (!accountsById.has(id)) return;
  selectedId = id;
  renderDetails();
  const root = renderedBuildings.get(id);
  if (root) {
    const slot = slots[accountsById.get(id).slot];
    focusCamera(slot.x, 5, slot.z, 850, null, FOCUS_ZOOM); // mid-height of a road-scale tower
  }
}

let cameraFocusFrame = 0;
controls.addEventListener('start', () => {
  if (cameraFocusFrame) cancelAnimationFrame(cameraFocusFrame);
  cameraFocusFrame = 0;
});

function focusCamera(x, y, z, duration = 850, destinationPosition = null, destinationZoom = camera.zoom) {
  cancelAnimationFrame(cameraFocusFrame);

  const startPosition = camera.position.clone();
  const startTarget = controls.target.clone();
  const endTarget = new THREE.Vector3(x, y, z);
  const targetOffset = endTarget.clone().sub(startTarget);
  const endPosition = destinationPosition?.clone() ?? startPosition.clone().add(targetOffset);
  const startZoom = camera.zoom;
  const startTime = performance.now();

  const animate = (now) => {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = progress * progress * (3 - 2 * progress);
    camera.position.lerpVectors(startPosition, endPosition, eased);
    controls.target.lerpVectors(startTarget, endTarget, eased);
    camera.zoom = THREE.MathUtils.lerp(startZoom, destinationZoom, eased);
    camera.updateProjectionMatrix();
    controls.update();

    if (progress < 1) cameraFocusFrame = requestAnimationFrame(animate);
  };

  cameraFocusFrame = requestAnimationFrame(animate);
}

function runChecksLegacy() {
  const outcomes = ['clear', 'breached', 'unknown'];
  const breachSamples = [
    { name: 'Gotham Market Sample', date: '2024', exposedData: ['Email addresses', 'Usernames'] },
    { name: 'Riverward Forum Sample', date: '2022', exposedData: ['Email addresses', 'Phone numbers'] },
  ];
  const stamp = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date());
  accounts.forEach((account, index) => {
    account.status = outcomes[(index + 1) % outcomes.length];
    account.checkedAt = stamp;
    account.source = 'Demo fixture';
    account.breaches = account.status === 'breached' ? [breachSamples[index % breachSamples.length]] : [];
    account.error = account.status === 'unknown' ? 'The sample check is unavailable. Try again later.' : undefined;
    ageBreaches(account);
    applyBuildingState(account);
  });
  renderOverview();
  renderDetails();
  showToast('Demo checks complete · fixture data');
}

function openCheckForm() {
  document.querySelector('#verify-modal').hidden = false;
  document.querySelector('#verify-error').textContent = '';
  document.querySelector('#verify-email').focus();
}

function setVerificationStep(active) {
  document.querySelector('#verify-code').hidden = !active;
  document.querySelector('#code-label').hidden = !active;
  document.querySelector('#send-code').hidden = active;
  document.querySelector('#submit-check').textContent = active ? 'Verify & check' : 'Run check';
}

async function requestCode() {
  const email = document.querySelector('#verify-email').value.trim();
  const error = document.querySelector('#verify-error'); error.textContent = '';
  if (email.toLowerCase().endsWith('@demo.test')) { error.textContent = 'Demo addresses need no code. Choose Run check instead.'; return; }
  try {
    const response = await fetch(`${CHECKER_API}/api/verify/start`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not send a code.');
    verifiedEmail = email;
    setVerificationStep(true);
    error.textContent = data.sent === 'email' ? 'Code sent. Check your email.' : 'Code generated. Check the checker service console in local demo mode.';
  } catch (problem) { error.textContent = problem.message || 'Checker service is unavailable.'; }
}

async function submitCheck(event) {
  event.preventDefault();
  const email = document.querySelector('#verify-email').value.trim();
  const error = document.querySelector('#verify-error'); error.textContent = '';
  try {
    let result;
    if (email.toLowerCase().endsWith('@demo.test')) result = await checkAccount(email);
    else {
      const code = document.querySelector('#verify-code').value.trim();
      if (!code || email !== verifiedEmail) throw new Error('Send and enter a verification code first.');
      const response = await fetch(`${CHECKER_API}/api/verify/confirm`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, code }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not verify this email.');
      result = await checkAccount(email, { endpoint: `${CHECKER_API}/api/check` });
    }
    installCheck(result);
    document.querySelector('#verify-modal').hidden = true;
    setVerificationStep(false);
  } catch (problem) { error.textContent = problem.message || 'Check unavailable.'; }
}

// Website towers cluster around the landmarks, like districts around a centrepiece: plots are dealt round-robin from each
// city landmark's nearest plots, Wayne Tower first. Bristol and South Hinkley landmarks don't draw towers out of town.
function landmarkSlotOrder() {
  const queues = landmarks
    .filter((landmark) => !['Bristol Township', 'South Hinkley'].includes(blocks[landmark.block].island))
    .map((landmark) => {
      const centre = blocks[landmark.block];
      return slots.map((slot, i) => [i, Math.hypot(slot.x - centre.x, slot.z - centre.z)]).sort((a, b) => a[1] - b[1]).map(([i]) => i);
    });
  const taken = new Set();
  const order = [];
  for (let added = true; added;) {
    added = false;
    for (const queue of queues) {
      while (queue.length && taken.has(queue[0])) queue.shift();
      if (!queue.length) continue;
      const slot = queue.shift();
      taken.add(slot);
      order.push(slot);
      added = true;
    }
  }
  const outOfTown = (i) => blocks[slots[i].block].island === 'Bristol Township'; // Bristol stays all favelas
  return [...order, ...slots.map((_, i) => i).filter((i) => !taken.has(i))].filter((i) => !outOfTown(i));
}

function installCheck(result) {
  if (!document.querySelector('#city-stats').hidden) closeCityStats();
  currentCheck = result;
  const stamp = result.checkedAt ? new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(result.checkedAt)) : null;
  const entries = result.accounts.length ? result.accounts : [{ name: result.label, domain: '', breached: false, breaches: [], foundIn: [], firstSeen: null }];
  placementOrder = landmarkSlotOrder();
  // Taller towers go behind shorter ones: take the plots the scatter picked, then give the oldest (tallest) sites the plots
  // furthest from the camera (smallest x + z) and the newest the ones in front.
  const picked = placementOrder.slice(0, entries.length).sort((a, b) => slots[a].x + slots[a].z - (slots[b].x + slots[b].z));
  const byAge = entries.map((entry, index) => ({ index, seen: Date.parse(entry.firstSeen) || Infinity })).sort((a, b) => a.seen - b.seen);
  const plotFor = new Map(byAge.map(({ index }, rank) => [index, picked[rank]]));
  const next = entries.map((entry, index) => {
    const citySlot = plotFor.get(index) ?? -1;
    const related = (result.breaches || []).filter((breach) => entry.breaches?.includes(breach.name));
    return { id: `${result.id}-${index}`, name: entry.name, domain: entry.domain, label: result.label, district: citySlot >= 0 ? slots[citySlot].district : 'Beyond city plots', status: result.status === 'unknown' && !entry.domain ? 'unknown' : entry.breached ? 'breached' : 'clear', slot: citySlot, checkedAt: stamp, source: result.source, breaches: related.length ? related : (entry.breaches || []).map((name) => ({ name, date: 'Date unavailable', exposedData: [] })), foundIn: entry.foundIn || [], firstSeen: entry.firstSeen, error: result.error };
  });
  accounts.splice(0, accounts.length, ...next.map(ageBreaches));
  accountsById.clear(); renderedBuildings.forEach((root) => scene.remove(root)); renderedBuildings.clear(); slotOccupants.clear();
  accounts.forEach((account) => { accountsById.set(account.id, account); if (account.slot >= 0) slotOccupants.set(account.slot, account.id); });
  selectedId = accounts[0].id;
  if (loadedBuildingModels) accounts.filter((account) => account.slot >= 0).forEach((account) => {
    const model = chooseBuildingModel(account, loadedBuildingModels);
    addAccountBuilding(account, model, buildingScale(model, loadedBuildingModels));
  });
  syncPlotParks();
  renderOverview(); renderDetails();
  document.querySelector('#service-status').textContent = result.source.startsWith('Demo') ? 'OFFLINE DEMO' : result.status === 'unknown' ? 'CHECK UNAVAILABLE' : 'ACCOUNT VERIFIED';
  showToast(result.status === 'unknown' ? (result.error || 'Check unavailable') : `Check complete · ${accounts.length} accounts`);
}

// Navbar check action opens the ownership-first check flow.
async function runChecks() { openCheckForm(); }

function addAccount() {
  const availableSlots = slots.filter((_, index) => !slotOccupants.has(index) && !landmarkSlots.has(index));
  if (!availableSlots.length) { showToast('All available city plots are occupied.'); return; }
  const input = window.prompt('Enter an email address for this local demo.');
  if (!input) return;
  const email = input.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showToast('Enter a valid email address.'); return; }
  const slot = placementOrder.find(index => !slotOccupants.has(index));
  const [local, domain] = email.toLowerCase().split('@');
  const account = { id: `bc-${String(nextId++).padStart(3, '0')}`, name: domain.split('.')[0].replace(/[-_]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()), label: `${local.slice(0, 1)}***@${domain}`, district: slots[slot].district, status: 'unknown', slot, checkedAt: null, source: 'Not checked', breaches: [], historical: [], error: 'Run checks to see the demo result.' };
  accounts.push(account);
  accountsById.set(account.id, account);
  if (loadedBuildingModels) {
    const model = chooseBuildingModel(account, loadedBuildingModels);
    addAccountBuilding(account, model, buildingScale(model, loadedBuildingModels));
  }
  selectAccount(account.id);
  syncPlotParks();
  renderOverview();
  showToast('Account added to the local demo.');
}

function showFeature(view) {
  const drawer = document.querySelector('#feature-drawer');
  const content = document.querySelector('#feature-content');
  const titles = { accounts: 'Account directory', inbox: 'Inbox scan', timeline: 'Breach timeline', history: 'Historical breaches' };
  document.querySelectorAll('.nav-link[data-view]').forEach((node) => node.classList.toggle('is-active', node.dataset.view === view));
  if (view === 'overview') { drawer.hidden = true; return; }
  drawer.hidden = false;
  content.innerHTML = `<p class="eyebrow">BREACH CITY / DATA DESK</p><h2>${titles[view]}</h2><p class="drawer-summary">${view === 'accounts' ? `${accounts.length} services in this account check.` : view === 'history' ? `Breaches older than ${RECENT_BREACH_MONTHS} months. These sites no longer count as breached in the city.` : view === 'inbox' ? 'Services found in welcome and account notification headers.' : 'Public breach activity by year from the Tiger Data catalog.'}</p><div id="feature-results" class="feature-results"><p class="drawer-empty">${view === 'timeline' ? 'Loading public timeline…' : 'Loading account data…'}</p></div>`;
  const results = document.querySelector('#feature-results');
  if (view === 'accounts') {
    results.innerHTML = accounts.length ? `<div class="feature-table"><div class="feature-table-head"><span>SERVICE</span><span>STATUS</span><span>SOURCE</span></div>${accounts.map((a) => `<button class="feature-table-row" type="button" data-account="${escapeHtml(a.id)}"><span><strong>${escapeHtml(a.name)}</strong><small>${escapeHtml(a.domain || a.label)}</small></span><b class="status-${a.status}">${accountBadge(a)}</b><small>${escapeHtml((a.foundIn || []).join(' + ') || a.source)}</small></button>`).join('')}</div>` : '<p class="drawer-empty">Run a check to populate the account directory.</p>';
    results.querySelectorAll('[data-account]').forEach((row) => row.addEventListener('click', () => { selectAccount(row.dataset.account); drawer.hidden = true; }));
  } else if (view === 'history') {
    const old = accounts.flatMap((a) => a.historical.map((breach) => ({ a, breach }))).sort((x, y) => String(y.breach.date).localeCompare(String(x.breach.date)));
    results.innerHTML = old.length ? `<div class="feature-table"><div class="feature-table-head"><span>SERVICE</span><span>BREACH</span><span>DATE</span></div>${old.map(({ a, breach }) => `<button class="feature-table-row" type="button" data-account="${escapeHtml(a.id)}"><span><strong>${escapeHtml(a.name)}</strong><small>${escapeHtml((breach.exposedData || []).join(', ') || a.domain || a.label)}</small></span><b>${escapeHtml(breach.name)}</b><small>${escapeHtml(breach.date || 'Date unavailable')}</small></button>`).join('')}</div>` : '<p class="drawer-empty">No historical breaches in this check.</p>';
    results.querySelectorAll('[data-account]').forEach((row) => row.addEventListener('click', () => { selectAccount(row.dataset.account); showAccountReport(row.dataset.account); drawer.hidden = true; }));
  } else if (view === 'inbox') {
    const inboxAccounts = accounts.filter((a) => a.foundIn?.includes('inbox'));
    results.innerHTML = inboxAccounts.length ? `<div class="feature-table"><div class="feature-table-head"><span>SERVICE</span><span>FOUND</span><span>FIRST SEEN</span></div>${inboxAccounts.map((a) => `<div class="feature-table-row"><span><strong>${escapeHtml(a.name)}</strong><small>${escapeHtml(a.domain)}</small></span><b>${a.status === 'breached' ? 'INBOX + BREACH' : 'INBOX'}</b><small>${escapeHtml(a.firstSeen || 'Date unavailable')}</small></div>`).join('')}</div>` : `<p class="drawer-empty">${currentCheck ? 'No inbox data in this check. Sign in with Google and grant inbox access to scan your account.' : 'Run a check or sign in with Google to see services found in your inbox.'}</p>`;
  } else if (view === 'timeline') {
    fetch(`${CHECKER_API}/api/timeline`).then((response) => response.ok ? response.json() : null).then((rows) => {
      if (!rows || !Array.isArray(rows) || !rows.length) { results.innerHTML = '<p class="drawer-empty">Timeline unavailable. Connect the Tiger Data catalog to enable yearly breach totals.</p>'; return; }
      results.innerHTML = `<div class="timeline-list">${rows.map((row) => `<article class="timeline-row"><strong>${escapeHtml(row.year)}</strong><span><b>${Number(row.breaches).toLocaleString()}</b> breaches</span><span>${Number(row.records).toLocaleString()} records exposed</span></article>`).join('')}</div>`;
    }).catch(() => { results.innerHTML = '<p class="drawer-empty">Timeline service is offline. Start the checker service to load Tiger Data.</p>'; });
  }
}

async function handleGoogleReturn() {
  const params = new URLSearchParams(location.search);
  const signin = params.get('signin');
  if (!signin) return;
  history.replaceState({}, '', location.pathname);
  if (signin !== 'ok' && signin !== 'no-inbox') { showToast('Google sign in did not complete.'); return; }
  const result = await checkSignedIn(`${CHECKER_API}/api/check`);
  if (result.id !== 'acct_unknown') { signedIn = true; installCheck(result); document.querySelector('#google-button').textContent = 'Sign out'; if (signin === 'no-inbox') showToast('Google connected, but inbox access was not granted.'); }
  else showToast(result.error || 'Could not restore Google session.');
}

async function restoreGoogleSession() {
  if (new URLSearchParams(location.search).has('signin')) return;
  const result = await checkSignedIn(`${CHECKER_API}/api/check`);
  if (result.id !== 'acct_unknown') { signedIn = true; installCheck(result); document.querySelector('#google-button').textContent = 'Sign out'; }
}

async function toggleGoogleSession() {
  if (!signedIn) {
    try {
      const response = await fetch(`${CHECKER_API}/api/status`);
      if (!response.ok) throw new Error();
      const status = await response.json();
      if (!status.googleConfigured) { showToast('Google sign-in needs OAuth credentials in checker/.env.'); return; }
      location.href = `${CHECKER_API}/auth/google`;
    }
    catch { showToast('Checker service is offline. Start it on port 8787 first.'); }
    return;
  }
  try { await fetch(`${CHECKER_API}/api/logout`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: '{}' }); } catch {}
  signedIn = false;
  document.querySelector('#google-button').textContent = 'Google sign in';
  showToast('Google session ended.');
}

function resetDemo() {
  placementOrder = [...initialPlacementOrder];
  accounts.splice(0, accounts.length, ...structuredClone(initialAccounts));
  accountsById.clear();
  accounts.forEach((account) => accountsById.set(account.id, account));
  selectedId = accounts[0].id;
  nextId = 7;
  renderedBuildings.forEach((root) => scene.remove(root));
  renderedBuildings.clear();
  slotOccupants.clear();
  accounts.forEach((account) => slotOccupants.set(account.slot, account.id));
  const rebuildBuildings = (models) => accounts.forEach((account) => {
    const model = chooseBuildingModel(account, models);
    if (model) addAccountBuilding(account, model, buildingScale(model, models));
  });
  if (loadedBuildingModels) rebuildBuildings(loadedBuildingModels);
  else loader.load('./models/buildings/gotham_voxel_skyscraper.glb', (gltf) => rebuildBuildings({ generic: gltf.scene }), undefined, () => showToast('Blender building models could not be loaded.'));
  syncPlotParks();
  renderOverview();
  renderDetails();
  showToast('Demo city reset.');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function showToast(message) {
  const toast = document.querySelector('#toast');
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2300);
}

document.querySelector('#check-button').addEventListener('click', runChecks);
document.querySelector('#nav-check').addEventListener('click', runChecks);
document.querySelector('#reset-button').addEventListener('click', resetDemo);
document.querySelector('#add-button').addEventListener('click', addAccount);
document.querySelector('#verify-form').addEventListener('submit', submitCheck);
document.querySelectorAll('[data-demo]').forEach((button) => button.addEventListener('click', () => { document.querySelector('#verify-email').value = button.dataset.demo; verifiedEmail = ''; setVerificationStep(false); document.querySelector('#verify-code').value = ''; }));
document.querySelector('#send-code').addEventListener('click', requestCode);
document.querySelector('#verify-close').addEventListener('click', () => { document.querySelector('#verify-modal').hidden = true; setVerificationStep(false); });
document.querySelector('#verify-modal').addEventListener('click', (event) => { if (event.target.id === 'verify-modal') document.querySelector('#verify-modal').hidden = true; });
document.querySelector('#drawer-close').addEventListener('click', () => { document.querySelector('#feature-drawer').hidden = true; document.querySelector('[data-view="overview"]').classList.add('is-active'); document.querySelectorAll('.nav-link[data-view]').forEach((node) => { if (node.dataset.view !== 'overview') node.classList.remove('is-active'); }); });
document.querySelectorAll('.nav-link[data-view]').forEach((button) => button.addEventListener('click', () => showFeature(button.dataset.view)));
document.querySelector('#google-button').addEventListener('click', toggleGoogleSession);
handleGoogleReturn();
restoreGoogleSession();
document.querySelector('#camera-button').addEventListener('click', () => {
  focusCamera(CITY_CENTER_X, 0, CITY_CENTER_Z, 850, new THREE.Vector3(CITY_SIZE + CITY_CENTER_X, CITY_SIZE, CITY_SIZE * 1.04 + CITY_CENTER_Z), 1);
});

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerStart = null;
renderer.domElement.addEventListener('pointerdown', (event) => { pointerStart = { x: event.clientX, y: event.clientY }; });
renderer.domElement.addEventListener('pointerup', (event) => {
  if (!pointerStart || Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 4) { pointerStart = null; return; }
  pointerStart = null;
  const bounds = renderer.domElement.getBoundingClientRect();
  pointer.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects([...renderedBuildings.values(), ...landmarkRoots], true)[0];
  let node = hit?.object;
  while (node && !node.userData.accountId && !node.userData.landmark) node = node.parent;
  // With the phone open, a building switches the report; anything else (street, park, sea) closes it.
  if (!node && !document.querySelector('#city-stats').hidden) closeCityStats();
  if (node?.userData.accountId) {
    selectAccount(node.userData.accountId);
    showAccountReport(node.userData.accountId);
  } else if (node?.userData.landmark) {
    const name = node.userData.landmark;
    const key = { 'Wayne Tower': 'wayne', 'Ace Chemicals': 'ace', 'Arkham Asylum': 'arkham', 'Gotham Bank': 'bank', 'GCPD Headquarters': 'gcpd', 'Cobblepot Manor': 'cobblepot', 'Blackgate Penitentiary': 'blackgate', 'Elliot Memorial': 'elliot' }[name];
    if (key) landmarkReports[key]();
    else openPhone({ eyebrow: name.toUpperCase(), title: name, subtitle: 'City-wide account overview', cards: [['ACCOUNTS MONITORED', accounts.length, 'total']], counts: countStatuses(accounts), listTitle: 'ACCOUNT STATUS', rows: accounts.map(a => [a.name, a.district, accountBadge(a), a.status]), note: 'Landmark model pending. No match means no known match in this source.', focus: landmarks.find(l => l.name === name) ? blocks[landmarks.find(l => l.name === name).block] : blocks[0] });
  }
});

function resizeScene() {
  const width = sceneHost.clientWidth;
  const height = sceneHost.clientHeight;
  if (!width || !height) return;
  const aspect = width / height;
  const viewHeight = Math.max(CITY_SIZE, CITY_SIZE * 1.2 / aspect); // road-scale towers (Wayne ~22 units) need a taller frame
  camera.left = -viewHeight * aspect / 2;
  camera.right = viewHeight * aspect / 2;
  camera.top = viewHeight / 2;
  camera.bottom = -viewHeight / 2;
  camera.position.copy(controls.target).add(new THREE.Vector3(CITY_SIZE, CITY_SIZE, CITY_SIZE * 1.04));
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}
new ResizeObserver(resizeScene).observe(sceneHost);
resizeScene();

function animate() {
  city.update(performance.now() / 1000);
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
renderOverview();
renderDetails();
animate();

export { scene, camera, controls, renderer, accounts, renderedBuildings, landmarkRoots, installCheck, resetDemo, showMissionBoard };
