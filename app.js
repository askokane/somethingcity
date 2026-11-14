import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { checkAccount, checkSignedIn } from './checker/checker.js';

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

const blocks = [
  { x: -12, z: -12, district: 'Northpoint' }, { x: 0, z: -12, district: 'Old Gotham' }, { x: 12, z: -12, district: 'Crown Point' },
  { x: -12, z: 0, district: 'The Foundry' }, { x: 0, z: 0, district: 'Civic Center' }, { x: 12, z: 0, district: 'The Narrows' },
  { x: -12, z: 12, district: 'Harbor Ward' }, { x: 0, z: 12, district: 'Market Square' }, { x: 12, z: 12, district: 'East Channel' },
];
// Landmarks are fixed: the same building on the same block for every email. Only website skyscrapers change.
// Wayne Tower is the tallest, so it takes the back corner on the camera's diagonal, where it hides nothing behind it
// (in the center it hid a whole block of accounts). 'park' keeps the trees block free (no model).
const landmarkBlocks = { 0: 'wayne', 2: 'ace', 7: 'arkham', 8: 'park' };
// Wayne Tower's GLB is 4 x 12 x 4: 1.2 gives a 4.8 m footprint and ~14 m height, about 4x a website skyscraper.
// City scale comes from the roads: a street is 3 units wide and is a two-lane road (one lane each way, ~3.5 m per lane),
// so 3 units = 7 m. Props are sized by their real-world height through this.
const UNITS_PER_METER = 3 / 7;
const meters = (value) => value * UNITS_PER_METER;
// Buildings keep the footprint their plot allows and are stretched upward until each floor is a real 3 m storey.
const FLOOR = meters(3);
const SKYSCRAPER_FLOOR_RAW = 4 / 6; // gotham_voxel_skyscraper.glb: 7 window rows, 0.67 apart
const WAYNE_FLOOR_RAW = 0.7; // wayne_tower.glb: ~16 floors in 12 units
const landmarkScale = { wayne: [1.2, FLOOR / WAYNE_FLOOR_RAW, 1.2], ace: 0.44, arkham: 0.54 }; // Ace and Arkham are already 13-17 m tall
// Every other block holds a 2x2 grid of account plots: 5 blocks give 20 website skyscrapers.
// Accounts beyond that stay in the directory as "Beyond city plots"; the checker sorts red ones first, so they always get a building.
const PLOT_OFFSETS = [[-1.35, -1.35], [1.35, -1.35], [-1.35, 1.35], [1.35, 1.35]];
const ACCOUNT_FOOTPRINT = 2.2; // skyscraper width on its plot, in meters
const slots = blocks.flatMap((block, index) => (index in landmarkBlocks ? [] : PLOT_OFFSETS.map(([dx, dz]) => ({ x: block.x + dx, z: block.z + dz, district: block.district }))));
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
scene.fog = new THREE.Fog('#182129', 43, 82);
const camera = new THREE.OrthographicCamera(-23, 23, 15, -15, 0.1, 180);
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
controls.maxZoom = 2.6;
const FOCUS_ZOOM = 2.4; // how close picking a website flies in
controls.minPolarAngle = 0.36;
controls.maxPolarAngle = Math.PI / 2.15;
controls.target.set(0, 9, 0); // aim above the ground so the road-scale towers fit
controls.update();

scene.add(new THREE.HemisphereLight(0x9babb4, 0x20232a, 2.2));
const moon = new THREE.DirectionalLight(0xc7d5e6, 3.0);
moon.position.set(-18, 28, 12);
moon.castShadow = true;
moon.shadow.mapSize.set(1536, 1536);
moon.shadow.camera.left = -30; moon.shadow.camera.right = 30; moon.shadow.camera.top = 30; moon.shadow.camera.bottom = -30;
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
function addPark(cx, cz, half, { seed = 1, lawn = true, paths = false, trees = 2, bushes = 4, bigTrees = 0 } = {}) {
  const roots = [];
  if (!parkKit) return roots;
  const random = seededRandom(seed);
  const between = (low, high) => low + random() * (high - low);
  if (lawn) {
    const grass = new THREE.Mesh(new THREE.BoxGeometry(half * 2, 0.04, half * 2), new THREE.MeshStandardMaterial({ color: '#3d5a3e', roughness: 0.95 }));
    grass.position.set(cx, 0.25, cz);
    grass.receiveShadow = true;
    scene.add(grass);
    roots.push(grass);
  }
  // Wall: the straight piece (2 units long) stretched to each run, pillars at the corners and gap ends.
  const inset = half - 0.12;
  const gap = paths ? 1.1 : 0.55;
  if (parkKit.wall) {
    const wallScale = scaleForHeight(parkKit.wall, 1);
    const run = (x1, z1, x2, z2) => {
      const length = Math.hypot(x2 - x1, z2 - z1);
      if (length < 0.15) return;
      roots.push(addPlacedModel(parkKit.wall, [(x1 + x2) / 2, 0.23, (z1 + z2) / 2], [length / 2, wallScale, wallScale], x1 === x2 ? Math.PI / 2 : 0));
    };
    const side = (fixed, alongX, open) => {
      const a = -inset;
      const b = inset;
      const point = (t) => (alongX ? [cx + t, cz + fixed] : [cx + fixed, cz + t]);
      if (open) { run(...point(a), ...point(-gap / 2)); run(...point(gap / 2), ...point(b)); }
      else run(...point(a), ...point(b));
    };
    // Plot parks open toward the camera (+z); the main park opens on all four sides where its paths meet the wall.
    side(inset, true, true);
    side(-inset, true, paths);
    side(inset, false, paths);
    side(-inset, false, paths);
    if (parkKit.pillar) {
      const pillarScale = scaleForHeight(parkKit.pillar, 1.2);
      const posts = [[-inset, -inset], [inset, -inset], [-inset, inset], [inset, inset], [-gap / 2, inset], [gap / 2, inset]];
      if (paths) posts.push([-gap / 2, -inset], [gap / 2, -inset], [inset, -gap / 2], [inset, gap / 2], [-inset, -gap / 2], [-inset, gap / 2]);
      posts.forEach(([dx, dz]) => roots.push(addPlacedModel(parkKit.pillar, [cx + dx, 0.23, cz + dz], pillarScale)));
    }
  }
  // Trees and bushes go on free spots inside the wall, off the paths, not on top of each other.
  const taken = [];
  const spot = (margin, spacing) => {
    for (let attempt = 0; attempt < 40; attempt++) {
      const dx = between(-inset + margin, inset - margin);
      const dz = between(-inset + margin, inset - margin);
      if (paths && (Math.abs(dx) < 0.55 || Math.abs(dz) < 0.55)) continue;
      if (Math.abs(dx) < gap / 2 + 0.2 && dz > inset - 0.6) continue; // keep the entrance clear
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
  for (let i = 0; i < bigTrees; i++) place(parkKit.largeTree, between(7, 9.5), 0.9, 0.9);
  for (let i = 0; i < trees; i++) place(parkKit.streetTree, between(3, 6.5), 0.35, 0.55);
  for (let i = 0; i < bushes; i++) {
    const [model, height] = [[parkKit.compact, between(0.7, 1.1)], [parkKit.hedge, between(0.8, 1.1)], [parkKit.tall, between(1.3, 1.9)]][Math.floor(random() * 3)];
    place(model, height, 0.25, 0.3);
  }
  return roots;
}

// Every account plot without a website building is a park: a block with all four plots free becomes one bigger park
// with paths, otherwise each free plot gets its own small walled park. Re-run whenever the accounts change.
const plotParkRoots = [];
function syncPlotParks() {
  plotParkRoots.splice(0).forEach((root) => scene.remove(root));
  if (!parkKit) return;
  const accountBlocks = blocks.filter((_, index) => !(index in landmarkBlocks));
  accountBlocks.forEach((block, blockIndex) => {
    const plots = [0, 1, 2, 3].map((k) => blockIndex * 4 + k);
    const free = plots.filter((index) => !slotOccupants.has(index));
    if (free.length === 4) plotParkRoots.push(...addPark(block.x, block.z, 1.35 + ACCOUNT_FOOTPRINT / 2 + 0.15, { seed: 101 + blockIndex, paths: true, trees: 4, bigTrees: 1, bushes: 9 }));
    else free.forEach((index) => plotParkRoots.push(...addPark(slots[index].x, slots[index].z, 1.25, { seed: 7 + index, trees: 2, bushes: 4 })));
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
  // The crosswalk GLB's six stripes are 2.9-unit bars along its X axis, stacked 2.5 units deep along its Y. A zebra's bars
  // run with the traffic, so a pedestrian steps over all of them: on a north-south street (crossing north/south of the
  // intersection) the bars run along Z (rotate 90°), on an east-west street along X (no rotation). Real crossings are
  // ~3.3 m wide and span the whole road, so the bars shrink to 1.4 units long and the stack stretches to 2.8 units across
  // the 3-unit street; centered 2.35 units out, they sit just outside the ±1.5 intersection box.
  const CROSSWALK_SCALE = [meters(3.3) / 2.9, 2.8 / 2.52, 1];
  const CROSSWALK_OFFSET = 1.5 + meters(3.3) / 2 + 0.15;
  const crossings = [];
  const signals = [];
  for (const x of [-6, 6]) for (const z of [-6, 6]) {
    for (const side of [-1, 1]) crossings.push([x, z + side * CROSSWALK_OFFSET, Math.PI / 2], [x + side * CROSSWALK_OFFSET, z, 0]);
    signals.push([x - 2.15, z - 2.15, 0], [x + 2.15, z + 2.15, Math.PI]);
  }
  // A crossing whose footprint touches the river would paint stripes on the water (where streets meet the bridge).
  const crossingOnRiver = ([x, z, rotation]) => {
    const [hx, hz] = rotation ? [1.4, 0.7] : [0.7, 1.4];
    return [[0, 0], [-hx, -hz], [hx, -hz], [-hx, hz], [hx, hz]].some(([dx, dz]) => onRiver(x + dx, z + dz));
  };
  if (props.gotham_crosswalk) crossings.filter((crossing) => !crossingOnRiver(crossing)).forEach(([x, z, rotation]) => addPlacedModel(props.gotham_crosswalk, [x, 0.06, z], CROSSWALK_SCALE, rotation));
  // Real-world heights: signal mast 4 m, street lamp 4.5 m, hydrant 0.8 m, park-edge oak 9 m.
  placeMany('gotham_stoplight', 4, signals);
  placeMany('gotham_lamppost', 4.5, [[-7.25,-17],[-7.25,-1],[-7.25,15],[7.25,-15],[7.25,1],[7.25,17]].map(([x, z]) => [x, z, x > 0 ? Math.PI : 0]));
  placeMany('gotham_fire_hydrant', 0.8, [[-8.1,-8],[-3.9,8],[3.9,-8],[8.1,8],[-8.1,16],[8.1,-16]]);
  placeMany('gotham_large_tree', 9, [[19,-18,0],[19,18,Math.PI / 2]]);
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
  addPark(blocks[8].x, blocks[8].z, 3.95, { seed: 42, lawn: false, paths: true, trees: 7, bigTrees: 2, bushes: 16 });
}

let environmentReady = false;
let accountModelsReady = false;
let loadedBuildingModels = null;
const landmarkRoots = [];

function finishInitialLoad() {
  if (!environmentReady || !accountModelsReady) return;
  syncPlotParks();
  document.querySelector('#loading-overlay').classList.add('is-hidden');
  document.querySelector('#loading-overlay small').textContent = 'Buildings and street models ready';
}

environmentLoader.load('./models/everything-else/gotham_ward_environment.glb', async (gltf) => {
  gltf.scene.name = 'Gotham Ward Blender environment';
  gltf.scene.traverse((node) => { if (node.isMesh) { node.receiveShadow = true; node.castShadow = true; } });
  scene.add(gltf.scene);
  // The GLB's grey filler buildings (neighborhood_slate_*) and their window panes were placed for an older layout and
  // clipped the plots and landmarks; they are removed, and empty plots become parks instead (syncPlotParks).
  const filler = [];
  gltf.scene.traverse((node) => { if (node.isMesh && (node.name.startsWith('neighborhood_slate') || node.name.startsWith('windows'))) filler.push(node); });
  filler.forEach((node) => node.parent.remove(node));
  // The river (y 0.07) sits below the raised sidewalk slabs (the 'block' mesh, tops at y 0.14), which are one solid box
  // per block, so the slabs drew grey sidewalk strips across the water. Lift the water just above them instead.
  gltf.scene.traverse((node) => { if (node.isMesh && (node.name.startsWith('Gotham_River') || node.name === 'water_line')) node.position.y += 0.09; });
  await addCityProps(gltf.scene);
  environmentReady = true;
  finishInitialLoad();
}, undefined, async (error) => {
  console.error('Could not load Blender environment:', error);
  environmentReady = true;
  showToast('Blender city environment could not be loaded.');
  finishInitialLoad();
});

loader.load('./models/buildings/gotham_voxel_skyscraper.glb', async (gltf) => {
  const variants = await Promise.all([
    ['wayne', './models/buildings/wayne_tower.glb'],
    ['ace', './models/buildings/ace_chemicals_8bit.glb'],
    ['arkham', './models/buildings/arkham_asylum_8bit.glb'],
  ].map(async ([name, path]) => {
    try { return [name, await loadModel(path)]; }
    catch (error) { console.warn(`Could not load ${name} building:`, error); return [name, null]; }
  }));
  const models = { generic: gltf.scene, ...Object.fromEntries(variants) };
  models.villains = (await Promise.all(VILLAINS.map((name) => loadModel(`./models/npcs/${name}.glb`).catch((error) => { console.warn(`Could not load ${name}:`, error); return null; })))).filter(Boolean);
  loadedBuildingModels = models;
  accounts.forEach((account) => {
    if (account.slot < 0) return;
    if (renderedBuildings.has(account.id)) return;
    const model = chooseBuildingModel(account, models);
    addAccountBuilding(account, model, buildingScale(model, models));
  });
  for (const [index, name] of Object.entries(landmarkBlocks)) {
    if (!models[name]) continue;
    const root = addPlacedModel(models[name], [blocks[index].x, 0.23, blocks[index].z], landmarkScale[name], 0);
    root.traverse((node) => { node.userData.landmark = name; });
    landmarkRoots.push(root);
  }
  accountModelsReady = true;
  finishInitialLoad();
}, undefined, (error) => {
  console.error('Could not load Blender account building:', error);
  accounts.forEach((account) => { if (account.slot >= 0) showToast('A Blender building model could not be loaded.'); });
  accountModelsReady = true;
  finishInitialLoad();
});

function chooseBuildingModel(account, models) {
  // Every website is a Gotham skyscraper; Wayne Tower, Ace Chemicals and Arkham are fixed landmarks, never accounts.
  return models.generic ?? null;
}

let accountScale = null;
function buildingScale(model) {
  // Fit the skyscraper's footprint to one 2x2 plot, whatever scale the Blender export uses.
  if (accountScale === null) {
    const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    accountScale = ACCOUNT_FOOTPRINT / Math.max(size.x, size.z);
  }
  return accountScale;
}

function addAccountBuilding(account, source, scale = 2) {
  if (!source) return;
  // The model is scaled inside an unscaled root, so the beacon and the rooftop villain added to the root stay undistorted.
  const model = source.clone(true);
  model.rotation.y = 0; // Blender assets face the ward's common street frontage; keep that axis aligned to the grid.
  model.scale.set(scale, FLOOR / SKYSCRAPER_FLOOR_RAW, scale);
  const root = new THREE.Group();
  root.name = `account-${account.id}`;
  root.add(model);
  cloneInstanceMaterials(root);
  const slot = slots[account.slot];
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  const center = bounds.getCenter(new THREE.Vector3());
  model.position.set(-center.x, 0.23 - bounds.min.y, -center.z);
  root.position.set(slot.x, 0, slot.z);
  root.userData.accountId = account.id;
  root.traverse((node) => { node.userData.accountId = account.id; if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; } });
  scene.add(root);
  addStatusBeacon(root, account.status, 0.23 + bounds.max.y - bounds.min.y);
  renderedBuildings.set(account.id, root);
  slotOccupants.set(account.slot, account.id);
  applyBuildingState(account);
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
    if (!node.isMesh || !node.name.startsWith('window_') || !node.material) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
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
function openPhone({ eyebrow, title, subtitle, cards, counts = null, listTitle, rows, note, focus, zoom = camera.zoom }) {
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
  list.replaceChildren(...rows.map(([name, detail, badge, kind]) => {
    const row = document.createElement('li');
    row.className = `city-stats-row status-${kind}`;
    const identity = document.createElement('span');
    identity.className = 'city-stats-identity';
    const strong = document.createElement('strong');
    strong.textContent = name;
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
  });
}

// Fixed landmarks report on the whole ward.
const landmarkReports = {
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
      focus: blocks[7],
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
      focus: blocks[2],
    });
  },
};

function closeCityStats() {
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

function installCheck(result) {
  currentCheck = result;
  const stamp = result.checkedAt ? new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(result.checkedAt)) : null;
  const entries = result.accounts.length ? result.accounts : [{ name: result.label, domain: '', breached: false, breaches: [], foundIn: [], firstSeen: null }];
  const citySlots = slots.map((slot, index) => index).filter((index) => !landmarkSlots.has(index));
  const next = entries.map((entry, index) => {
    const citySlot = citySlots[index] ?? -1;
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
  const slot = slots.findIndex((_, index) => !slotOccupants.has(index) && !landmarkSlots.has(index));
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
  focusCamera(0, 9, 0, 850, new THREE.Vector3(25, 33, 25), 1);
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
  if (!hit) return;
  let node = hit.object;
  while (node && !node.userData.accountId && !node.userData.landmark) node = node.parent;
  if (node?.userData.accountId) {
    selectAccount(node.userData.accountId);
    showAccountReport(node.userData.accountId);
  } else if (node?.userData.landmark) {
    landmarkReports[node.userData.landmark]?.();
  }
});

function resizeScene() {
  const width = sceneHost.clientWidth;
  const height = sceneHost.clientHeight;
  if (!width || !height) return;
  const aspect = width / height;
  const viewHeight = 46; // road-scale towers (Wayne ~22 units) need a taller frame
  camera.left = -viewHeight * aspect / 2;
  camera.right = viewHeight * aspect / 2;
  camera.top = viewHeight / 2;
  camera.bottom = -viewHeight / 2;
  camera.position.set(24, 33, 25);
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}
new ResizeObserver(resizeScene).observe(sceneHost);
resizeScene();

function animate() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
renderOverview();
renderDetails();
animate();
