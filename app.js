import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { blocks, slots, landmarks, createCity, landmarkLabel, FLOOR, UNITS_PER_METER, CITY_SIZE, CITY_CENTER_Z, CITY_CENTER_X, cellX, cellZ, cellPos, cornerPos, isOnLand, landCells, islands, bridges, bridgeSpans, widenedShore, deckEdges, shoreSidewalks, sandShore, onSandShore } from './city-layout.js';
import { scatterSlotOrder, freshPlacementSeed, seededRandom as placementRandomGenerator } from './city-scatter.js';
import { checkAccount, checkSignedIn } from './checker/checker.js';
import { buildMissions, readProgress, saveProgress, serviceUrl } from './mission-board.js';

// Frontend and checker share an origin in production (Caddy proxies /api and /auth), so the base is empty there. Locally
// the static server (serve.ps1, :8000) has no proxy, so the page talks to the checker on :8787 directly (it allows
// localhost origins with credentials, and the two ports count as the same site for its cookie).
const CHECKER_API = ['localhost', '127.0.0.1'].includes(location.hostname) && location.port !== '8787' ? 'http://localhost:8787' : '';
// A reply that isn't JSON (a proxy's "Not found", the checker not running) becomes a plain message, not a parse error.
const checkerJson = (response) => response.json().catch(() => ({ error: 'The checker service is not reachable right now. Try a demo address, or try again shortly.' }));
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
// The moon never moves and moving things (cars, ships, Batman, villains) cast no shadow, so the shadow map is redrawn
// every SHADOW_REFRESH frames instead of every frame; new or swapped buildings pick up their shadows within ~2 s.
renderer.shadowMap.autoUpdate = false;
const SHADOW_REFRESH = 120;
let shadowFrame = 0;
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
  return new Promise((resolve, reject) => loader.load(path, (gltf) => { gltf.scene.userData.clips = gltf.animations; resolve(gltf.scene); }, undefined, reject));
}

const propAxisCorrection = new Map([
  ['Gotham_Crosswalk', -Math.PI / 2],
  ['Gotham_Barbed_Wire_1', Math.PI / 2], // Tai's barbed wire module: height along -Z
  // Tai's sidewalk kit stores its height along -Z (top face at z -0.23), so +90 degrees about X stands it on the street.
  ['Gotham_Sidewalk_Straight', Math.PI / 2],
  ['Gotham_Sidewalk_Corner', Math.PI / 2],
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

// Already placed copies (any scale or rotation) collapsed into one InstancedMesh per shared geometry and material, so a
// park's dozens of walls, posts, bushes and trees cost a few draw calls. One-off meshes are kept as they are.
function batchPlaced(roots) {
  const groups = new Map(), kept = [];
  roots.forEach((root) => {
    root.updateMatrixWorld(true);
    const meshes = [];
    root.traverse((node) => { if (node.isMesh && !node.isInstancedMesh) meshes.push(node); });
    if (!meshes.length) { kept.push(root); return; }
    meshes.forEach((mesh) => {
      const key = `${mesh.geometry.uuid}/${mesh.material.uuid}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(mesh);
    });
  });
  const made = [];
  groups.forEach((meshes) => {
    const instanced = new THREE.InstancedMesh(meshes[0].geometry, meshes[0].material, meshes.length);
    meshes.forEach((mesh, i) => instanced.setMatrixAt(i, mesh.matrixWorld));
    instanced.castShadow = meshes[0].castShadow;
    instanced.receiveShadow = meshes[0].receiveShadow;
    instanced.computeBoundingSphere();
    scene.add(instanced);
    made.push(instanced);
  });
  roots.forEach((root) => { if (!kept.includes(root)) root.parent?.remove(root); });
  return [...kept, ...made];
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
    const [model, height] = [[parkKit.compact, between(0.4, 1.0)], [parkKit.hedge, between(0.5, 1.1)], [parkKit.tall, between(0.9, 1.3)]][Math.floor(random() * 3)];
    place(model, height, 0.2, 0.22);
  }
  return batchPlaced(roots);
}

// Every account plot without a website building is a park: a block with all four plots free becomes one bigger park
// with paths, otherwise each free plot gets its own small walled park. Re-run whenever the accounts change.
const plotParkRoots = [];
// Empty plots get non-clickable filler: favelas (Daniel's four variants) in Bristol Township, the islands and the slum
// districts along the river inlets, and Daniel's account buildings 01-10 everywhere else (short ones more often than
// tall ones, so the skyline still steps up to the website towers). Instanced, with a
// random variant and quarter-turn fixed per plot and random window lights. Garden blocks are walled parks.
// Re-run whenever accounts change.
const SLUMS = new Set(['West Harlow', 'Chinatown', 'Reatton']);
const ESTATE_CLEARING = [20, 16]; // open lawn at the centre of Wayne Estate, where Wayne Manor stands
const FAVELA_ISLANDS = new Set(['Bristol Township', 'South Channel Island', 'South Hinkley']);
const isFavelaPlot = (slot) => FAVELA_ISLANDS.has(blocks[slot.block].island) || SLUMS.has(blocks[slot.block].district);
let favelaModels = [];
let favelaGroup = null;
function syncPlotParks() {
  // Atharva's createCity draws a lawn square on every empty plot; filler buildings take those plots now.
  city.sync(new Map(slots.map((_, i) => [i, true])));
  plotParkRoots.splice(0).forEach((root) => { root.parent?.remove(root); if (root.isInstancedMesh) root.dispose(); });
  if (favelaGroup) { favelaGroup.traverse((node) => node.isInstancedMesh && node.dispose()); scene.remove(favelaGroup); }
  favelaGroup = new THREE.Group();
  favelaGroup.name = 'Filler buildings';
  scene.add(favelaGroup);
  const towers = (loadedBuildingModels?.towers ?? []).filter(Boolean);
  const kinds = [...favelaModels.map((model) => ({ model, favela: true, plots: [] })), ...towers.map((model) => ({ model, favela: false, plots: [] }))];
  slots.forEach((slot, i) => {
    if (slotOccupants.has(i)) return;
    const random = seededRandom(i * 7919 + 13);
    const choices = kinds.filter((kind) => kind.favela === isFavelaPlot(slot));
    const pool = choices.length ? choices : kinds; // until Daniel's towers load, favelas stand in everywhere
    if (!pool.length) return;
    // Towers: skewed toward the low ones (random squared); favelas: even odds.
    const kind = pool[Math.floor((pool[0].favela ? random() : random() ** 2) * pool.length)];
    kind.plots.push([slot.x, 0.23, slot.z, faceToward(kind.model, eastOrSouth(random))]); // front toward the camera
  });
  kinds.forEach(({ model, plots }) => {
    const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    instanceModel(model, ACCOUNT_FOOTPRINT / Math.max(size.x, size.z), plots, favelaGroup); // fits the plot, keeps its shape
  });
  flickerWindows(favelaGroup);
  placeBillboards();
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
  const names = ['gotham_barbed_wire', 'gotham_bushes', 'gotham_crosswalk', 'gotham_sidewalks', 'gotham_fire_hydrant', 'gotham_lamppost', 'gotham_large_tree', 'gotham_park_wall', 'gotham_stoplight', 'gotham_street_tree'];
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
  furniture.name = 'Street furniture';
  scene.add(furniture);
  // Street furniture stands on each block's sidewalk strip (the 0.55 units between the plots and the curb), never in the
  // road: a lamp per side with its arm over the road, hydrants and corner stoplights. Sidewalks are otherwise kept clear
  // (no hedges or benches). Garden blocks get their park wall instead. Everything repeated is instanced.
  const lamps = [], hydrants = [], signals = [];
  const offBeach = (list) => list.filter(([x, , z]) => !onSandShore(x, z)); // no street furniture facing a sand beach
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
    if (i % 3 === 0) hydrants.push([x + ex, .23, z + hd * 0.75, 0]);
    if (i % 4 === 0) signals.push([x - ex, .23, z + ez, 0]);
  });
  // Tai's sidewalk kit: a 0.6-wide ring round every block (corners, then straights stretched to fill each side), curbs
  // facing the road. The kit is 1.5 wide at true scale, wider than the blocks' kerb strip, so it is scaled to 0.4.
  const kitStraight = piece(props.gotham_sidewalks, 'Gotham_Sidewalk_Straight'); // piece() drops the kit's layout offsets
  const kitCorner = piece(props.gotham_sidewalks, 'Gotham_Sidewalk_Corner');
  if (kitStraight && kitCorner) {
    const RING = 0.6, S = RING / 1.5, LENGTH = 3 * S; // a straight is 1.2 long once scaled
    const corners = [];
    const straights = new Map(); // stretch -> placements
    // At yaw 0 a straight runs along z with its curb on -x, and a corner's curbs are on -x and -z.
    const straightYaw = (nx, nz) => Math.atan2(nz, -nx);
    const cornerYaw = { '-1,-1': 0, '1,-1': -Math.PI / 2, '1,1': Math.PI, '-1,1': Math.PI / 2 };
    const ringed = blocks.flatMap((b) => {
      if (b.format !== 'avenue') return [b];
      const alongX = b.avenue === 'x';
      return [-1, 1].map((side) => ({ x: b.x + (alongX ? 0 : side * 3), z: b.z + (alongX ? side * 3 : 0), width: alongX ? b.width : 3, depth: alongX ? 3 : b.depth }));
    });
    for (const b of ringed) {
      const hw = b.width / 2, hd = b.depth / 2;
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) corners.push([b.x + sx * (hw - RING), 0.07, b.z + sz * (hd - RING), cornerYaw[`${sx},${sz}`]]);
      for (const [alongX, half, run] of [[true, hd, b.width - 4 * RING], [false, hw, b.depth - 4 * RING]]) {
        if (run <= 0.05) continue;
        const n = Math.max(1, Math.round(run / LENGTH));
        const key = (run / (n * LENGTH)).toFixed(3);
        if (!straights.has(key)) straights.set(key, []);
        for (const side of [-1, 1]) for (let i = 0; i < n; i++) {
          const t = -run / 2 + (i + 0.5) * run / n;
          straights.get(key).push(alongX
            ? [b.x + t, 0.07, b.z + side * (half - RING / 2), straightYaw(0, side)]
            : [b.x + side * (half - RING / 2), 0.07, b.z + t, straightYaw(side, 0)]);
        }
      }
    }
    instanceModel(kitCorner, [S, S, 1], corners, furniture);
    for (const [stretch, list] of straights) instanceModel(kitStraight, [S, S * Number(stretch), 1], list, furniture);
    // The widened shore streets' outer sidewalks (0.8 wide, curb toward the road, i.e. inland). They stand on the shore
    // extension's rock base, so they are stretched a little taller to meet the pavement level.
    const SHORE_S = 0.8 / 1.5, SHORE_LENGTH = 3 * SHORE_S, TALL = (0.23 - 0.02) / 0.16;
    const shoreStraights = new Map();
    // Bridge roads cross the shore street onto the deck: each band is split around them (the road's width and no more,
    // so the sidewalk runs right up to the bridge end) and each part filled with pieces stretched to fit it.
    const bridgeRoads = [...roadGraph.values()].flatMap((n) => (n.key.startsWith('b') ? [...n.links.keys()].map((key) => [n, roadGraph.get(key)]) : []));
    const onBridgeRoad = (x, z, reach) => bridgeRoads.some(([a, b]) => {
      const dx = b.x - a.x, dz = b.z - a.z, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
      return Math.hypot(a.x + dx * t - x, a.z + dz * t - z) < reach;
    });
    const ROAD_HALF = 1.6, STEP = 0.05;
    for (const band of shoreSidewalks) {
      const at = (t) => (band.vertical ? [band.x, band.z + t] : [band.x + t, band.z]);
      const half = band.length / 2, parts = [];
      let start = null;
      for (let t = -half; t <= half + 1e-6; t += STEP) {
        const open = !onBridgeRoad(...at(t), ROAD_HALF);
        if (open && start === null) start = t;
        if (!open && start !== null) { parts.push([start, t]); start = null; }
      }
      if (start !== null) parts.push([start, half]);
      for (const [from, to] of parts) {
        const length = to - from;
        if (length < 0.2) continue;
        const n = Math.max(1, Math.round(length / SHORE_LENGTH));
        const key = (length / (n * SHORE_LENGTH)).toFixed(3);
        if (!shoreStraights.has(key)) shoreStraights.set(key, []);
        for (let i = 0; i < n; i++) {
          const [x, z] = at(from + (i + 0.5) * length / n);
          shoreStraights.get(key).push([x, 0.02, z, band.vertical ? straightYaw(-band.outward, 0) : straightYaw(0, -band.outward)]);
        }
      }
    }
    for (const [stretch, list] of shoreStraights) instanceModel(kitStraight, [SHORE_S, SHORE_S * Number(stretch), TALL], list, furniture);
  }
  // Crosswalks across every street just outside each intersection, where the walking network crosses. The paint's bars
  // run along its local x (the traffic direction for a street along x) and repeat across the street.
  if (props.gotham_crosswalk) instanceModel(props.gotham_crosswalk, [1 / 2.9, 2.9 / 2.52, 1], crossings.map(([x, z, yaw]) => [x, 0.075, z, yaw]), furniture);
  if (props.gotham_lamppost) instanceModel(props.gotham_lamppost, scaleForHeight(props.gotham_lamppost, 3.5), offBeach(lamps), furniture);
  if (props.gotham_fire_hydrant) instanceModel(props.gotham_fire_hydrant, scaleForHeight(props.gotham_fire_hydrant, 0.35), offBeach(hydrants), furniture);
  if (props.gotham_stoplight) instanceModel(props.gotham_stoplight, scaleForHeight(props.gotham_stoplight, 2.6), offBeach(signals), furniture);
  // Barbed wire (Tai's 1.8 m module): all the way round Arkham Asylum's block, and along two or three sides of about a
  // third of the favela blocks. It runs just inside each block's sidewalk ring, so the sidewalks stay walkable.
  if (props.gotham_barbed_wire) {
    const wire = props.gotham_barbed_wire;
    const WIRE_SCALE = 0.9, module = 1.8 * WIRE_SCALE; // ~0.9 tall (2 m), 1.6 long
    const runs = [];
    const fence = (b, sides, inset = 0.65) => {
      const hw = b.width / 2 - inset, hd = b.depth / 2 - inset;
      const lines = { n: [b.x - hw, b.z - hd, b.x + hw, b.z - hd], s: [b.x - hw, b.z + hd, b.x + hw, b.z + hd], w: [b.x - hw, b.z - hd, b.x - hw, b.z + hd], e: [b.x + hw, b.z - hd, b.x + hw, b.z + hd] };
      for (const side of sides) {
        const [x1, z1, x2, z2] = lines[side];
        const n = Math.ceil(Math.hypot(x2 - x1, z2 - z1) / module); // modules overlap a touch rather than leave a gap
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n;
          runs.push([x1 + (x2 - x1) * t, 0.23, z1 + (z2 - z1) * t, x1 === x2 ? Math.PI / 2 : 0]);
        }
      }
    };
    const arkham = landmarks.find((l) => l.name === 'Arkham Asylum');
    if (arkham) fence(blocks[arkham.block], ['n', 's', 'e', 'w'], 0.3); // on the sidewalk: the asylum fills its plot, and the island is closed
    const random = seededRandom(6661);
    blocks.filter((b) => ['standard', 'terrace', 'courtyard'].includes(b.format) && (FAVELA_ISLANDS.has(b.island) || SLUMS.has(b.district))).forEach((b) => {
      if (random() > 0.35) return;
      const sides = ['n', 's', 'e', 'w'].sort(() => random() - 0.5).slice(0, random() < 0.5 ? 2 : 3);
      fence(b, sides);
    });
    instanceModel(wire, WIRE_SCALE, runs, furniture);
  }
  // Daniel's four favela variants fill empty plots (syncPlotParks).
  favelaModels = (await Promise.all(['gotham_favela_8bit', 'gotham_favela_02_8bit', 'gotham_favela_03_8bit', 'gotham_favela_04_8bit']
    .map((name) => loadModel(`./models/buildings/${name}.glb`).catch(() => null)))).filter(Boolean);
  parkKit = {
    sidewalk: kitStraight,
    crosswalk: props.gotham_crosswalk,
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

// Bristol Heights: a suburb of Daniel's 8-bit suburban houses on a straight grid. A spine road (city asphalt, lane
// dashes) runs north-south down the block; four straight streets cross it from edge to edge (the top one carries on to
// the river bridge). Tai's sidewalk kit lines both sides of every street, with kit crosswalks at the junctions. Houses
// line both sides of each street, facing it, and a row faces the street along the south end. The middle of the
// neighbourhood is a walled park either side of the spine (the city parks' builder: winding paths, mixed trees,
// bushes, lawn patches); gravel footpaths run between the back gardens and wind through the south green. Not clickable.
const HOUSE_SCALE = 0.3; // 2.97 x 2.67 units, ~2.6 tall (about 6 m)
const HOUSE_HALF = [1.48, 1.34]; // half width (along the road), half depth
async function buildSuburbs() {
  const house = await loadModel('./models/buildings/suburban_house_8bit.glb').catch(() => loadedBuildingModels?.towers?.[0]);
  const group = new THREE.Group();
  group.name = 'Bristol Heights suburb';
  scene.add(group);
  const asphalt = new THREE.MeshStandardMaterial({ color: '#252d35', roughness: 0.88 });
  const paint = new THREE.MeshStandardMaterial({ color: '#b1a383', roughness: 0.88 });
  const gravel = new THREE.MeshStandardMaterial({ color: '#9c9581', roughness: 1 });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const flat = (material, x, y, z, w, h, d) => {
    const mesh = new THREE.Mesh(box, material);
    mesh.position.set(x, y, z); mesh.scale.set(w, h, d);
    mesh.receiveShadow = true; group.add(mesh); return mesh;
  };
  const ROAD_TOP = 0.28, SIDEWALK = 0.6;
  const road = (x, z, w, d) => flat(asphalt, x, ROAD_TOP - 0.025, z, w, 0.05, d);
  // Sidewalk kit runs, grouped by stretch so each length is one instanced mesh. (nx, nz) points at the road (the curb).
  const runs = new Map();
  const straightYaw = (nx, nz) => Math.atan2(nz, -nx);
  const sidewalk = (x1, z1, x2, z2, nx, nz) => {
    const length = Math.hypot(x2 - x1, z2 - z1);
    if (length < 0.3) return;
    const n = Math.max(1, Math.round(length / 1.2));
    const key = (length / n / 1.2).toFixed(3);
    if (!runs.has(key)) runs.set(key, []);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      runs.get(key).push([x1 + (x2 - x1) * t, 0.24, z1 + (z2 - z1) * t, straightYaw(nx, nz)]);
    }
  };
  const crossings = []; // [x, z, yaw, street width]
  const homes = [], fronts = [];
  const home = (x, z, fx, fz) => { homes.push([x, 0.23, z, Math.atan2(fx, fz)]); fronts.push([x, z, fx, fz]); };
  const paths = []; // gravel footpath polylines [[x, z], ...]
  const greens = []; // [x1, z1, x2, z2] strips for trees and shrubs
  const parkRoots = []; // the neighbourhood park's pieces
  for (const b of blocks.filter((block) => block.format === 'suburb')) {
    const top = b.z - b.depth / 2, bottom = b.z + b.depth / 2, half = b.width / 2;
    const inner = half - SIDEWALK; // inside the block's own sidewalk ring
    const SPINE = 1.5, STUB = 1, ROW = 10;
    const across = STUB + SIDEWALK + 0.6 + HOUSE_HALF[1]; // house centre from its cul-de-sac's centreline
    const rows = [0, 1, 3, 4].map((k) => top + 4.5 + k * ROW); // row 0 lines up with the river bridge (cellZ(7)); row 2 is the park
    // Spine: full depth, meeting the streets at both ends, with lane dashes; sidewalks both sides, open at each mouth.
    road(b.x, b.z, SPINE * 2, b.depth);
    for (let z = top + 1.5; z < bottom - 1; z += 3) flat(paint, b.x, ROAD_TOP + 0.004, z, 0.06, 0.01, 1.2);
    for (const side of [-1, 1]) {
      let from = top + SIDEWALK;
      for (const [a, c] of [...rows.map((z) => [z - STUB, z + STUB]), [bottom - SIDEWALK, bottom]]) {
        sidewalk(b.x + side * (SPINE + SIDEWALK / 2), from, b.x + side * (SPINE + SIDEWALK / 2), a, -side, 0);
        from = c;
      }
    }
    rows.forEach((z, k) => {
      // A straight street from edge to edge across the spine, lane dashes down the middle, sidewalks both sides.
      road(b.x, z, b.width, STUB * 2);
      for (const side of [-1, 1]) {
        for (let x = SPINE + 1.5; x < half - 1; x += 3) flat(paint, b.x + side * x, ROAD_TOP + 0.004, z, 1.2, 0.01, 0.06);
        crossings.push([b.x + side * (SPINE + SIDEWALK / 2), z, 0, STUB * 2]);
        for (const s of k === 0 ? [1] : [-1, 1]) {
          sidewalk(b.x + side * (SPINE + SIDEWALK), z + s * (STUB + SIDEWALK / 2), b.x + side * inner, z + s * (STUB + SIDEWALK / 2), 0, -s);
          // Five houses a side, facing the street (row 0 only on its south side: the block's edge is too close).
          for (const along of [3.8, 6.9, 10, 13.1]) home(b.x + side * along, z + s * across, 0, -s);
        }
        if (k === 0) sidewalk(b.x + side * (SPINE + SIDEWALK), z - STUB - SIDEWALK / 2, b.x + side * inner, z - STUB - SIDEWALK / 2, 0, 1);
      }
      // A footpath between back gardens, where the next row isn't across the park.
      const next = rows[k + 1];
      if (next && next - z < ROW * 1.5) {
        for (const side of [-1, 1]) paths.push([[b.x + side * (SPINE + SIDEWALK), (z + next) / 2], [b.x + side * inner, (z + next) / 2]]);
        crossings.push([b.x, (z + next) / 2, Math.PI / 2, SPINE * 2]);
      }
    });
    // The neighbourhood park: between row 1's and row 3's back gardens, either side of the spine.
    const parkTop = rows[1] + across + HOUSE_HALF[1] + 0.3, parkBottom = rows[2] - across - HOUSE_HALF[1] - 0.3;
    for (const side of [-1, 1]) {
      const x1 = SPINE + SIDEWALK + 0.2, x2 = inner;
      parkRoots.push(...addPark(b.x + side * (x1 + x2) / 2, (parkTop + parkBottom) / 2, [(x2 - x1) / 2, (parkBottom - parkTop) / 2], {
        seed: 9100 + (side > 0 ? 1 : 0), lawn: true, paths: true, trees: 9, bigTrees: 2, bushes: 22, patches: 7,
      }));
    }
    // The south end: a row of houses facing the street, behind a green with a winding footpath.
    const southZ = bottom - SIDEWALK - 0.5 - HOUSE_HALF[1];
    for (const side of [-1, 1]) for (const along of [3.8, 6.9, 10, 13.1]) home(b.x + side * along, southZ, 0, 1);
    const greenTop = rows.at(-1) + across + HOUSE_HALF[1] + 0.2, greenBottom = southZ - HOUSE_HALF[1] - 0.2;
    const mid = (greenTop + greenBottom) / 2, sway = (greenBottom - greenTop) * 0.28;
    for (const side of [-1, 1]) {
      const xs = [SPINE + SIDEWALK, 5.5, 9.5, 13, inner];
      paths.push(xs.map((x, i) => [b.x + side * x, mid + (i > 0 && i < xs.length - 1 ? (i % 2 ? sway : -sway) : 0)]));
      greens.push([b.x + side * (SPINE + SIDEWALK + 0.6), greenTop, b.x + side * (inner - 0.4), greenBottom]);
    }
    crossings.push([b.x, mid, Math.PI / 2, SPINE * 2]);
    // North of row 0, between the block's edge and the first cul-de-sacs' sidewalks: a planted verge.
    for (const side of [-1, 1]) greens.push([b.x + side * (SPINE + SIDEWALK + 0.4), top + SIDEWALK + 0.2, b.x + side * (inner - 0.4), rows[0] - STUB - SIDEWALK - 0.2]);
  }
  if (parkKit?.sidewalk) for (const [stretch, list] of runs) instanceModel(parkKit.sidewalk, [0.4, 0.4 * Number(stretch), 1], list, group);
  if (parkKit?.crosswalk) for (const [x, z, yaw, width] of crossings) instanceModel(parkKit.crosswalk, [1 / 2.9, (width - 0.1) / 2.52, 1], [[x, ROAD_TOP + 0.005, z, yaw]], group);
  if (house) {
    instanceModel(house, HOUSE_SCALE, homes, group);
    flickerWindows(group);
  }
  // Gravel footpaths like the parks': short segments with turned-square joints, the bends smoothed.
  const segments = [], joints = [];
  for (const line of paths) {
    const curve = new THREE.CatmullRomCurve3(line.map(([x, z]) => new THREE.Vector3(x, 0, z)));
    const points = curve.getSpacedPoints(Math.max(4, Math.ceil(curve.getLength() / 0.5)));
    joints.push(...points);
    for (let i = 0; i < points.length - 1; i++) segments.push([points[i], points[i + 1]]);
  }
  const gravelPieces = new THREE.InstancedMesh(box, gravel, segments.length + joints.length);
  const matrix = new THREE.Matrix4(), turn = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  let n = 0;
  for (const [p, q] of segments) {
    turn.setFromAxisAngle(up, -Math.atan2(q.z - p.z, q.x - p.x));
    gravelPieces.setMatrixAt(n++, matrix.compose(new THREE.Vector3((p.x + q.x) / 2, 0.255, (p.z + q.z) / 2), turn, new THREE.Vector3(p.distanceTo(q) + 0.05, 0.03, 0.5)));
  }
  turn.setFromAxisAngle(up, Math.PI / 4);
  for (const p of joints) gravelPieces.setMatrixAt(n++, matrix.compose(new THREE.Vector3(p.x, 0.254, p.z), turn, new THREE.Vector3(0.36, 0.03, 0.36)));
  gravelPieces.receiveShadow = true;
  gravelPieces.computeBoundingSphere();
  group.add(gravelPieces);
  // Planting: bushes either side of each front door, a tree on each turning-circle island, trees and shrubs along the
  // greens (off the footpaths). Seeded, so it looks the same on every load.
  if (!parkKit) return;
  const random = seededRandom(9001);
  const between = (low, high) => low + random() * (high - low);
  const planted = [];
  const plant = (model, x, z, height) => { if (model) planted.push(addPlacedModel(model, [x, 0.23, z], scaleForHeight(model, height), between(0, Math.PI * 2))); };
  for (const [x, z, fx, fz] of fronts) {
    const doorstep = HOUSE_HALF[1] + 0.3;
    for (const s of [-1, 1]) plant(parkKit.compact, x + fx * doorstep + fz * s * 0.85, z + fz * doorstep + fx * s * 0.85, between(0.45, 0.65));
  }
  const onPath = (x, z) => joints.some((p) => Math.hypot(p.x - x, p.z - z) < 0.7);
  for (const [x1, z1, x2, z2] of greens) {
    const depth = Math.abs(z2 - z1);
    for (let x = Math.min(x1, x2) + 0.6; x < Math.max(x1, x2) - 0.3; x += depth > 2.5 ? 0.55 : 1.1) { // denser on the wide greens
      const z = Math.min(z1, z2) + 0.3 + random() * Math.max(0, depth - 0.6);
      if (onPath(x, z)) continue;
      const pick = random();
      if (pick < 0.12 && depth > 4) plant(parkKit.largeTree, x, z, between(4, 5.5));
      else if (pick < 0.4 && depth > 2.5) plant(parkKit.streetTree, x, z, between(2.4, 3.6));
      else plant([parkKit.compact, parkKit.hedge, parkKit.tall][Math.floor(random() * 3)], x, z, between(0.5, 1.2));
    }
  }
  batchPlaced(planted);
}

// Atharva's harbor fleet (models/ships: keel at y 0, bow along +X, city units). Each vessel rides the actual wave under
// it (the sea shader's height formula, copied below) and moves the way its motion hint describes: fishing boats drift,
// beach boats sit moored, the tug and the GCPD patrol run circuits, the ferry and the barge shuttle, and the container
// ship passes slowly on the horizon.
// A rectangle round every island, `margin` out from the outermost land, for a ship to lap (corners rounded by the route).
function coastLoop(margin) {
  const [x1, x2] = [Math.min(...islands.map((i) => i.minX)) - margin, Math.max(...islands.map((i) => i.maxX)) + margin];
  const [z1, z2] = [Math.min(...islands.map((i) => i.minZ)) - margin, Math.max(...islands.map((i) => i.maxZ)) + margin];
  return [[x1, z1], [x2, z1], [x2, z2], [x1, z2]];
}
const SHIPS = [
  { file: 'horizon_container_ship_narrows', mode: 'pass', from: [150, -230], to: [150, 230], speed: 1.6, scale: 1.4 }, // the biggest vessel (~90 m) without dwarfing the city's squeezed blocks
  // A tug on the run: racing round the island on its own lane (inside the ferry's), weaving hard like it's dodging the
  // GCPD. Five harbor patrol boats chase it in a staggered pack along its wake.
  { file: 'tugboat_east_quay', id: 'fugitive', mode: 'route', closed: true, points: coastLoop(24), speed: 15, weave: 5.5, jumps: true, scale: 1.3 },
  // Each chaser: how far back (lag) and to which side it runs, how hard and how fast it weaves, how much it surges and
  // drops back, and how it drifts across lanes, so the pack never moves in lockstep.
  ...[
    { lag: 20, side: 0, weave: 1.6, rate: 1.9, surge: 5, drift: 1.5 },
    { lag: 30, side: -4, weave: 2.4, rate: 1.1, surge: 7, drift: 2 },
    { lag: 38, side: 3.5, weave: 1.2, rate: 2.6, surge: 4, drift: 2.5 },
    { lag: 48, side: -2, weave: 2.2, rate: 1.4, surge: 8, drift: 1.8 },
    { lag: 58, side: 4.5, weave: 1.8, rate: 0.9, surge: 6, drift: 2.2 },
  ].map((chase) => ({ file: 'gcpd_harbor_patrol', mode: 'chase', target: 'fugitive', scale: 0.65, ...chase })), // ~12 m patrol launches
  // Cargo barge between the two ports: Haysville Docks' berth (east shore), out to sea, south of South Hinkley (no
  // bridges to pass under), up the channel east of Bristol to West Harlow Docks' berth (west shore). Each berth is off
  // the crane block's quay, bow-in under the crane's boom, with the breakwater to the south. Corners are rounded into arcs.
  { file: 'cargo_barge_gotham_river', mode: 'route', points: [[100.5, 50], [104, 50], [104, 117], [-85, 117], [-85, 60], [-76.5, 60]], speed: 2.4 },
  // The ferry laps the whole island's outer coast (every bridge is inside the loop, so it never passes under one), wide
  // of the moored and drifting boats, the tug's circuit and the barge's lane.
  { file: 'bristol_midtown_ferry', mode: 'route', closed: true, points: coastLoop(40), speed: 3.5 },
  { file: 'cargo_barge_gotham_river', mode: 'shuttle', from: [-76, -104], to: [-76, -40], speed: 1.4 }, // Gotham River, north of the bridges
  { file: 'fishing_trawler_narrows', mode: 'drift', at: [-192, -40], heading: 2.2 }, // out past the chase and ferry lanes, clear of the container ship
  { file: 'fishing_longliner_crown_point', mode: 'drift', at: [102, -104], heading: 0.6 },
  { file: 'fishing_skiff_blackgate', mode: 'drift', at: [-66, 164], heading: -0.9, scale: 0.55 }, // out past the chase and ferry lanes
  { file: 'sailboat_west_bay', mode: 'moored', at: [-60, -38], heading: Math.PI / 2, scale: 0.7 }, // off Reatton Beach
  { file: 'schooner_west_bay', mode: 'moored', at: [-64, -60], heading: 0.3 },
  { file: 'rowboat_beach_cove', mode: 'moored', at: [4, 80], heading: 1.2, scale: 0.45 }, // off Stevensburgh Strand
  { file: 'rowboat_blackgate_cove', mode: 'moored', at: [-10, 92], heading: -0.4, scale: 0.45 }, // South Hinkley
];
const SHIP_DRAFT = 0.3; // how far each hull sits below the surface
// Height of the sea surface at (x, z): the same formula as stylized-sea.js's vertex shader.
function seaHeight(x, z, time) {
  const phase = time * 0.06981317;
  const warp = x * 0.027 - z * 0.031;
  const a = x * 0.115 + z * 0.078 + 1.1 * Math.sin(warp) - phase;
  const b = x * -0.055 + z * 0.16 + 0.6 * Math.sin(x * 0.035) + phase;
  const s = Math.sin(a);
  return -1.1 + 0.44 * s + 0.1 * s * s + 0.13 * Math.sin(b);
}
const fleet = [];
let fleetLaunched = false;
const WAKE_PARTICLES_PER_SHIP = 10;
let wakePositions = null;
let wakeColors = null;
let wakePositionAttribute = null;
let wakeColorAttribute = null;
let wakePoints = null;
const wakeColor = new THREE.Color();
const wakeFoamColor = new THREE.Color('#d7edf2');
const wakeWaterColor = new THREE.Color('#103e4c');

function createWakeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, 'rgba(255,255,255,0.82)');
  gradient.addColorStop(0.42, 'rgba(255,255,255,0.5)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(canvas);
}

function initializeBoatWakes() {
  const movingShips = fleet.filter((ship) => ship.mode !== 'moored' && ship.mode !== 'drift');
  if (!movingShips.length) return;
  const count = movingShips.length * WAKE_PARTICLES_PER_SHIP;
  wakePositions = new Float32Array(count * 3);
  wakeColors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    wakePositions[i * 3 + 1] = -10000;
    wakeColors[i * 3] = wakeWaterColor.r;
    wakeColors[i * 3 + 1] = wakeWaterColor.g;
    wakeColors[i * 3 + 2] = wakeWaterColor.b;
  }
  const geometry = new THREE.BufferGeometry();
  wakePositionAttribute = new THREE.BufferAttribute(wakePositions, 3).setUsage(THREE.DynamicDrawUsage);
  wakeColorAttribute = new THREE.BufferAttribute(wakeColors, 3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', wakePositionAttribute);
  geometry.setAttribute('color', wakeColorAttribute);
  const material = new THREE.PointsMaterial({
    map: createWakeTexture(),
    color: 0xffffff,
    size: 4,
    transparent: true,
    opacity: 0.48,
    vertexColors: true,
    depthWrite: false,
    toneMapped: false,
  });
  wakePoints = new THREE.Points(geometry, material);
  wakePoints.name = 'Boat wakes';
  wakePoints.frustumCulled = false;
  scene.add(wakePoints);
  movingShips.forEach((ship, shipIndex) => {
    ship.wakeParticles = Array.from({ length: WAKE_PARTICLES_PER_SHIP }, (_, particleIndex) => ({
      index: shipIndex * WAKE_PARTICLES_PER_SHIP + particleIndex,
      active: false,
      born: 0,
      life: 0,
      x: 0,
      z: 0,
    }));
    ship.wakeCursor = 0;
    ship.nextWakeAt = 0;
  });
}

function updateBoatWake(ship, time, x, z, fx, fz) {
  if (!ship.wakeParticles || !wakePositionAttribute || !wakeColorAttribute) return;
  if (time >= ship.nextWakeAt) {
    const particle = ship.wakeParticles[ship.wakeCursor];
    const lateral = (Math.random() - 0.5) * 0.9;
    particle.active = true;
    particle.born = time;
    particle.life = 1.55 + Math.random() * 0.3;
    particle.x = x - fx * (ship.length / 2 + 0.35) - fz * lateral;
    particle.z = z - fz * (ship.length / 2 + 0.35) + fx * lateral;
    ship.wakeCursor = (ship.wakeCursor + 1) % WAKE_PARTICLES_PER_SHIP;
    ship.nextWakeAt = time + 0.2;
  }
  for (const particle of ship.wakeParticles) {
    const offset = particle.index * 3;
    const age = time - particle.born;
    if (!particle.active || age >= particle.life) {
      particle.active = false;
      wakePositions[offset + 1] = -10000;
      continue;
    }
    wakePositions[offset] = particle.x;
    wakePositions[offset + 1] = seaHeight(particle.x, particle.z, time) + 0.035;
    wakePositions[offset + 2] = particle.z;
    wakeColor.copy(wakeFoamColor).lerp(wakeWaterColor, Math.min(1, age / particle.life));
    wakeColors[offset] = wakeColor.r;
    wakeColors[offset + 1] = wakeColor.g;
    wakeColors[offset + 2] = wakeColor.b;
  }
}

async function launchShips() {
  if (fleetLaunched) return;
  fleetLaunched = true;
  const group = new THREE.Group();
  group.name = 'Gotham harbor fleet';
  scene.add(group);
  await Promise.all(SHIPS.map(async (spec, i) => {
    const model = await loadModel(`./models/ships/${spec.file}.glb`).catch(() => null);
    if (!model) return;
    const anchor = spec.at ?? spec.from ?? spec.centre ?? spec.points?.[0] ?? [0, 0];
    if (spec.at && isOnLand(spec.at[0], spec.at[1], -2.5)) { console.warn(`${spec.file} would sit on land; skipped`); return; }
    model.rotation.order = 'YXZ';
    model.scale.setScalar(spec.scale ?? 1);
    model.traverse((node) => { if (node.isMesh) { node.castShadow = false; node.receiveShadow = true; } }); // moving: no shadow (static shadow map)
    group.add(model);
    let beacons = null;
    if (spec.mode === 'chase') {
      beacons = { red: [], blue: [], glows: [], flash: i * 0.61 };
      model.updateMatrixWorld(true);
      model.traverse((node) => {
        const colour = /red_beacon/i.test(node.name) ? 'red' : /blue_beacon/i.test(node.name) ? 'blue' : null;
        if (!colour || !node.isMesh) return;
        node.material = new THREE.MeshBasicMaterial();
        beacons[colour].push(node.material);
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: beaconGlowTexture, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
        glow.position.copy(model.worldToLocal(new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3())));
        glow.scale.setScalar(2.2);
        glow.userData.colour = colour;
        model.add(glow);
        beacons.glows.push(glow);
      });
    }
    const length = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).x;
    let curve = null;
    if (spec.points) { // straight legs joined by quadratic arcs (radius up to 10)
      let pts = spec.points.map(([x, z]) => new THREE.Vector3(x, 0, z));
      if (spec.closed) { const mid = pts[0].clone().lerp(pts[1], 0.5); pts = [mid, ...pts.slice(1), pts[0], mid]; }
      curve = new THREE.CurvePath();
      let from = pts[0];
      for (let j = 1; j < pts.length - 1; j++) {
        const [prev, corner, next] = [pts[j - 1], pts[j], pts[j + 1]];
        const r = Math.min(10, corner.distanceTo(prev) / 2, corner.distanceTo(next) / 2);
        const a = corner.clone().addScaledVector(prev.clone().sub(corner).normalize(), r);
        const b = corner.clone().addScaledVector(next.clone().sub(corner).normalize(), r);
        curve.add(new THREE.LineCurve3(from, a));
        curve.add(new THREE.QuadraticBezierCurve3(a, corner, b));
        from = b;
      }
      curve.add(new THREE.LineCurve3(from, pts[pts.length - 1]));
    }
    fleet.push({ ...spec, model, length, phase: i * 1.7, anchor, curve, beacons });
  }));
  initializeBoatWakes();
}
// Where a ship on a closed route is at `time`: along the route at its speed, pushed across it by an erratic weave
// (three sines at odd rates, so it never settles into a rhythm).
const beaconGlowTexture = softBlob('rgba(255,255,255,0.9)', 'rgba(255,255,255,0)');
function lapPosition(ship, time) {
  const u = (((time * ship.speed) / ship.curve.getLength() + ship.phase * 0.1) % 1 + 1) % 1;
  const p = ship.curve.getPointAt(u);
  if (!ship.weave) return [p.x, p.z];
  const dir = ship.curve.getTangentAt(u);
  const sway = ship.weave * (0.55 * Math.sin(time * 0.9 + ship.phase) + 0.3 * Math.sin(time * 2.3 + 1.7) + 0.15 * Math.sin(time * 4.1));
  return [p.x - dir.z * sway, p.z + dir.x * sway];
}
function updateShips(time) {
  for (const ship of fleet) {
    let x, z, hx, hz;
    if (ship.mode === 'loop') {
      const [cx, cz] = ship.centre;
      const [rx, rz] = ship.radius;
      const angle = time * ship.speed / ((rx + rz) / 2) + ship.phase;
      [x, z] = [cx + Math.cos(angle) * rx, cz + Math.sin(angle) * rz];
      [hx, hz] = [-Math.sin(angle) * rx, Math.cos(angle) * rz];
    } else if (ship.mode === 'shuttle' || ship.mode === 'pass') {
      const [[x1, z1], [x2, z2]] = [ship.from, ship.to];
      const length = Math.hypot(x2 - x1, z2 - z1);
      const run = (time * ship.speed + ship.phase * 10) / length;
      let t = run % 2;
      const back = ship.mode === 'shuttle' && t > 1;
      if (ship.mode === 'pass') t = run % 1; else if (back) t = 2 - t;
      const eased = ship.mode === 'shuttle' ? t * t * (3 - 2 * t) : t; // the ferry and barge slow down at each end
      [x, z] = [x1 + (x2 - x1) * eased, z1 + (z2 - z1) * eased];
      [hx, hz] = back ? [x1 - x2, z1 - z2] : [x2 - x1, z2 - z1];
    } else if (ship.mode === 'route' && ship.closed) {
      // Round and round a closed route at an even speed (weaving across it when the ship has a `weave`).
      [x, z] = lapPosition(ship, time);
      const [nx, nz] = lapPosition(ship, time + 0.08);
      [hx, hz] = [nx - x, nz - z];
    } else if (ship.mode === 'chase') {
      // On the target's own track a little behind it (its position `lag` units ago), off to one side, weaving a bit.
      ship.quarry ??= fleet.find((other) => other.id === ship.target);
      if (!ship.quarry) continue;
      const at = (t) => {
        const back = (ship.lag + Math.sin(t * 0.37 + ship.phase) * ship.surge) / ship.quarry.speed; // surging and dropping back
        const [qx, qz] = lapPosition(ship.quarry, t - back);
        const [ax, az] = lapPosition(ship.quarry, t - back + 0.08);
        const len = Math.hypot(ax - qx, az - qz) || 1;
        const sway = ship.side + Math.sin(t * 0.13 + ship.phase * 2) * ship.drift + Math.sin(t * ship.rate + ship.phase) * ship.weave;
        return [qx - ((az - qz) / len) * sway, qz + ((ax - qx) / len) * sway];
      };
      [x, z] = at(time);
      const [nx, nz] = at(time + 0.08);
      [hx, hz] = [nx - x, nz - z];
    } else if (ship.mode === 'route') {
      // Out and back along the curve, easing in and out of each berth.
      let t = ((time * ship.speed) / ship.curve.getLength()) % 2;
      const back = t > 1;
      if (back) t = 2 - t;
      const u = t * t * (3 - 2 * t);
      const p = ship.curve.getPointAt(u), dir = ship.curve.getTangentAt(u);
      [x, z] = [p.x, p.z];
      [hx, hz] = back ? [-dir.x, -dir.z] : [dir.x, dir.z];
    } else {
      const [ax, az] = ship.anchor;
      const sway = ship.mode === 'drift' ? 2.5 : 0.4; // fishing boats wander on their lines; moored boats barely move
      const t = time * 0.05 + ship.phase;
      [x, z] = [ax + Math.sin(t) * sway, az + Math.cos(t * 0.7) * sway];
      const yaw = ship.heading + Math.sin(time * 0.2 + ship.phase) * (ship.mode === 'drift' ? 0.35 : 0.12);
      [hx, hz] = [Math.cos(yaw), -Math.sin(yaw)];
    }
    const yaw = Math.atan2(-hz, hx);
    const fx = Math.cos(yaw), fz = -Math.sin(yaw);
    const half = ship.length / 2;
    const bow = seaHeight(x + fx * half, z + fz * half, time);
    const stern = seaHeight(x - fx * half, z - fz * half, time);
    const port = seaHeight(x - fz, z + fx, time);
    const starboard = seaHeight(x + fz, z - fx, time);
    // The runaway tug bounces over the swell and every few seconds launches clear of the water, nose up, then slaps down.
    let lift = 0, pitch = 0;
    if (ship.jumps) {
      lift = Math.abs(Math.sin(time * 4.2)) * 0.35;
      const CYCLE = 4.6, AIR = 1.1, cycle = Math.floor(time / CYCLE);
      const into = time - cycle * CYCLE;
      if (cycle % 4 !== 3 && into < AIR) { // skips every fourth so the rhythm isn't regular
        const s = into / AIR, height = 1.4 + ((cycle * 7) % 5) * 0.3;
        lift += 4 * height * s * (1 - s);
        pitch = (0.5 - s) * 0.7;
      }
    }
    ship.model.position.set(x, (bow + stern) / 2 - SHIP_DRAFT + lift, z);
    // Pitch with the bow and stern heights, roll with the sides, kept gentle.
    ship.model.rotation.set(Math.atan2(port - starboard, 2) * 0.6, yaw, Math.atan2(bow - stern, ship.length) * 0.8 + pitch);
    if (ship.beacons) {
      const redOn = (time * 3 + ship.beacons.flash) % 2 < 1;
      ship.beacons.red.forEach((m) => m.color.set(redOn ? '#ff2626' : '#3a0808'));
      ship.beacons.blue.forEach((m) => m.color.set(redOn ? '#081040' : '#2f6bff'));
      ship.beacons.glows.forEach((glow) => {
        const on = (glow.userData.colour === 'red') === redOn;
        glow.material.color.set(glow.userData.colour === 'red' ? '#ff2a2a' : '#2f6bff');
        glow.material.opacity = on ? 1 : 0;
      });
    }
    updateBoatWake(ship, time, x, z, fx, fz);
  }
  if (wakePositionAttribute) wakePositionAttribute.needsUpdate = true;
  if (wakeColorAttribute) wakeColorAttribute.needsUpdate = true;
}

// Wayne Manor: Daniel's Batcave exterior is the manor standing on a cliff with the cave inside. Scaled to Wayne Estate's
// clearing and sunk so the manor stands at ground level and the cliff and cave sit underground, out of sight.
const MANOR_SCALE = 0.4;
let manorPlaced = false;
async function placeWayneManor() {
  if (manorPlaced) return;
  manorPlaced = true;
  const estate = blocks.find((b) => b.district === 'Wayne Estate');
  const model = await loadModel('./models/buildings/batcave_exterior_8bit.glb').catch(() => null);
  if (!estate || !model) return;
  const manor = model.getObjectByName('SM_Batcave_Manor');
  const manorBase = manor ? new THREE.Box3().setFromObject(manor).min.y : 9.9;
  const bounds = new THREE.Box3().setFromObject(model);
  const centre = bounds.getCenter(new THREE.Vector3());
  model.scale.setScalar(MANOR_SCALE);
  model.position.set(estate.x - centre.x * MANOR_SCALE, 0.23 - manorBase * MANOR_SCALE, estate.z - centre.z * MANOR_SCALE);
  model.traverse((node) => { node.userData.landmark = 'Wayne Manor'; if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; } });
  flickerWindows(model);
  scene.add(model);
  landmarkRoots.push(model);
}

// The Bat-Signal: Tai's searchlight on GCPD Headquarters' roof, throwing a pale beam into the sky with the bat at its end.
let signalPlaced = false;
async function placeBatSignal() {
  if (signalPlaced) return;
  const gcpd = landmarkRoots.find((root) => root.userData.landmark === 'GCPD Headquarters');
  const lamp = await loadModel('./models/everything-else/gotham_bat_signal.glb').catch(() => null);
  if (!gcpd || !lamp) return;
  signalPlaced = true;
  const roof = new THREE.Box3().setFromObject(gcpd);
  const top = new THREE.Vector3((roof.min.x + roof.max.x) / 2, roof.max.y, (roof.min.z + roof.max.z) / 2);
  lamp.scale.setScalar(0.7);
  lamp.position.copy(top);
  lamp.rotation.y = Math.PI * 0.75; // aim the lamp toward the camera side of the sky
  scene.add(lamp);
  // Beam: an open cone tipped back toward the sky, additive and faint; the bat sits where it ends.
  const length = 46;
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(4.2, 0.35, length, 24, 1, true),
    new THREE.MeshBasicMaterial({ color: '#fff1b8', transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  const tilt = new THREE.Group();
  tilt.position.copy(top).add(new THREE.Vector3(0, 2.6, 0));
  tilt.rotation.set(0.35, 0, -0.25);
  beam.position.y = length / 2;
  tilt.add(beam);
  const canvas = document.createElement('canvas');
  canvas.width = 26; canvas.height = 12;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(255, 236, 160, 0.95)';
  ctx.beginPath(); ctx.ellipse(13, 6, 12.5, 5.6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#0b0d12';
  ['YY...Y.Y...YY', 'YYYY.YYY.YYYY', 'YYYYYYYYYYYYY', '.YYYYYYYYYYY.', '..YY.YYY.YY..', '......Y......'].forEach((row, y) => [...row].forEach((c, x) => { if (c === 'Y') ctx.fillRect(6.5 + x, 3 + y, 1, 1); }));
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  const bat = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, opacity: 0.85 }));
  bat.scale.set(9, 4.2, 1);
  bat.position.y = length;
  tilt.add(bat);
  scene.add(tilt);
  batSignalBeam = tilt;
  syncBatSignal();
}

// Lit while any recently breached site still has its 'replace exposed passwords' or 'enable multi-factor' mission open on
// GCPD's board (progress is the mission board's, saved in this browser). Dark once those are done, or with no breach.
let batSignalBeam = null;
function syncBatSignal() {
  if (!batSignalBeam) return;
  const scope = currentCheck?.id || 'sample-city';
  let storage;
  try { storage = window.localStorage; } catch { /* private mode: session progress only */ }
  const progress = missionSession.get(scope) || readProgress(storage, scope);
  const open = buildMissions(accounts.filter((account) => account.status === 'breached'))
    .some((task) => ['password', 'mfa'].includes(JSON.parse(task.key)[2]) && !progress[task.key]);
  batSignalBeam.visible = open;
}

// ---- Batman's run -------------------------------------------------------------------------------------------------
// Select a website or landmark and Batman leaves the Batcave under Wayne Manor: a trap door opens in the street on Wayne
// Estate's south side, he rises out of it, the doors close, and he drives the streets and bridges to the building,
// parking beside it. Select another and he drives on from where he is.
// Placeholder: until the Batmobile model is uploaded (models/vehicles/batmobile.glb) or Tai exports Batman
// (models/npcs/gotham_batman.glb), a blocky Batman built from boxes, matching Tai's render, stands in.

// Street graph: nodes at block corners; a street runs along every cell edge that touches land, except inside a merged
// block (parks, the suburb); bridges join their two shores at the bridged edge's midpoint.
const roadGraph = (() => {
  const cellAt = new Map(landCells.map((c) => [`${c.row},${c.col}`, c]));
  const blockOf = new Map();
  blocks.forEach((b, i) => b.cells.forEach((c) => blockOf.set(`${c.row},${c.col}`, i)));
  const nodes = new Map(); // key -> { x, z, links: Map(key -> length) }
  const node = (key, x, z) => { if (!nodes.has(key)) nodes.set(key, { key, x, z, links: new Map() }); return nodes.get(key); };
  const corner = (i, j) => { const p = cornerPos(i, j); return node(`c${i},${j}`, p.x, p.z); };
  const link = (a, b) => { const d = Math.hypot(a.x - b.x, a.z - b.z); a.links.set(b.key, d); b.links.set(a.key, d); };
  const street = (cellA, cellB) => {
    const a = cellAt.has(cellA), b = cellAt.has(cellB);
    if (!a && !b) return false;
    return !(a && b && blockOf.get(cellA) === blockOf.get(cellB)); // no street through a merged block
  };
  const rows = Math.max(...landCells.map((c) => c.row)) + 2;
  const cols = Math.max(...landCells.map((c) => c.col)) + 2;
  for (let i = 0; i <= rows; i++) for (let j = 0; j <= cols; j++) {
    if (j < cols && street(`${i - 1},${j}`, `${i},${j}`) && !sandShore.has(`${cornerPos(i, j).x + 6},${cornerPos(i, j).z}`)) link(corner(i, j), corner(i, j + 1)); // along a row boundary (none on a sand beach)
    // Along a column boundary (a port's deck is a street too: the quay road).
    if (i < rows && street(`${i},${j - 1}`, `${i},${j}`) && !sandShore.has(`${cornerPos(i, j).x},${cornerPos(i, j).z + 6}`)) link(corner(i, j), corner(i + 1, j));
  }
  for (const [[r1, c1], [r2, c2]] of bridgeSpans) {
    const [ra, ca, rb, cb] = r1 + c1 <= r2 + c2 ? [r1, c1, r2, c2] : [r2, c2, r1, c1];
    let a, b;
    if (ca === cb) { // north-south: from the bottom edge of the north cell to the top edge of the south cell
      a = node(`b${ra},${ca}s`, cellPos(ra, ca).x, cellPos(ra, ca).z + 6); link(a, corner(ra + 1, ca)); link(a, corner(ra + 1, ca + 1));
      b = node(`b${rb},${cb}n`, cellPos(rb, cb).x, cellPos(rb, cb).z - 6); link(b, corner(rb, cb)); link(b, corner(rb, cb + 1));
    } else { // east-west
      a = node(`b${ra},${ca}e`, cellPos(ra, ca).x + 6, cellPos(ra, ca).z); link(a, corner(ra, ca + 1)); link(a, corner(ra + 1, ca + 1));
      b = node(`b${rb},${cb}w`, cellPos(rb, cb).x - 6, cellPos(rb, cb).z); link(b, corner(rb, cb)); link(b, corner(rb + 1, cb));
    }
    link(a, b);
    // Avenues: the bridge's road carries on through its landing block to a T on the far ring street.
    const unlink = (p, q) => { p.links.delete(q.key); q.links.delete(p.key); };
    for (const [end, row, col, out] of [[a, ra, ca, ca === cb ? 's' : 'e'], [b, rb, cb, ca === cb ? 'n' : 'w']]) {
      if (!blocks.some((blk) => blk.format === 'avenue' && blk.cells.some((c) => c.row === row && c.col === col))) continue;
      // The near street (the shore edge) is split at the bridge end; the far edge gets a junction node.
      const near = { s: [corner(row + 1, col), corner(row + 1, col + 1)], n: [corner(row, col), corner(row, col + 1)], e: [corner(row, col + 1), corner(row + 1, col + 1)], w: [corner(row, col), corner(row + 1, col)] }[out];
      const farSide = { s: 'n', n: 's', e: 'w', w: 'e' }[out];
      const far = { s: [corner(row + 1, col), corner(row + 1, col + 1)], n: [corner(row, col), corner(row, col + 1)], e: [corner(row, col + 1), corner(row + 1, col + 1)], w: [corner(row, col), corner(row + 1, col)] }[farSide];
      const t = node(`v${row},${col}`, (far[0].x + far[1].x) / 2, (far[0].z + far[1].z) / 2);
      unlink(near[0], near[1]);
      unlink(far[0], far[1]);
      link(t, far[0]); link(t, far[1]); link(end, t);
    }
  }
  return nodes;
})();
const nearestNode = (x, z) => [...roadGraph.values()].filter((n) => n.links.size).reduce((best, n) => (Math.hypot(n.x - x, n.z - z) < Math.hypot(best.x - x, best.z - z) ? n : best));
function routeBetween(from, to) {
  const dist = new Map([[from.key, 0]]), prev = new Map(), open = new Set([from.key]);
  while (open.size) {
    let key = null;
    for (const k of open) if (key === null || dist.get(k) < dist.get(key)) key = k;
    open.delete(key);
    if (key === to.key) break;
    for (const [next, d] of roadGraph.get(key).links) {
      const alt = dist.get(key) + d;
      if (alt < (dist.get(next) ?? Infinity)) { dist.set(next, alt); prev.set(next, key); open.add(next); }
    }
  }
  const path = [];
  for (let k = to.key; k; k = prev.get(k)) path.unshift(roadGraph.get(k));
  return path[0] === from ? path : [from, to];
}

// The stand-in rider: blocky Batman (grey suit, dark cowl with ears and cape, yellow belt and emblem), facing +X.
function blockyBatman() {
  const group = new THREE.Group();
  const add = (w, h, d, x, y, z, color) => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.7 }));
    box.position.set(x, y, z);
    group.add(box);
  };
  const suit = '#8d98ab', dark = '#262b38', gold = '#e0b13c', skin = '#e2b98f';
  add(0.32, 0.8, 0.28, 0, 0.4, -0.2, dark); add(0.32, 0.8, 0.28, 0, 0.4, 0.2, dark); // legs and boots
  add(0.5, 0.75, 0.75, 0, 1.15, 0, suit); // torso
  add(0.52, 0.14, 0.77, 0, 0.82, 0, gold); // utility belt
  add(0.06, 0.16, 0.42, 0.26, 1.3, 0, gold); // chest emblem
  add(0.26, 0.7, 0.24, 0, 1.1, -0.5, suit); add(0.26, 0.7, 0.24, 0, 1.1, 0.5, suit); // arms
  add(0.5, 0.5, 0.5, 0, 1.8, 0, dark); // cowl
  add(0.06, 0.22, 0.34, 0.24, 1.7, 0, skin); // jaw
  add(0.12, 0.22, 0.1, 0, 2.15, -0.16, dark); add(0.12, 0.22, 0.1, 0, 2.15, 0.16, dark); // ears
  add(0.08, 1.4, 0.8, -0.3, 1.0, 0, '#1b1f29'); // cape
  return group;
}

const batRun = { rider: null, door: null, path: [], leg: 0, travelled: 0, phase: 'home', clock: 0, target: null };
const TRAP_DOOR = { x: cellPos(5, 1).x, z: cellPos(5, 1).z - 6 }; // the street on Wayne Estate's south side
async function prepareBatRun() {
  let rider = null;
  for (const path of ['./models/vehicles/batmobile.glb', './models/npcs/gotham_batman.glb']) {
    rider = await loadModel(path).catch(() => null);
    if (rider) break;
  }
  if (!rider) { rider = blockyBatman(); rider.scale.setScalar(2.2); } // larger than life so he reads from the city view
  rider.visible = false;
  scene.add(rider);
  batRun.rider = rider;
  // Trap door: a dark shaft with two street-coloured leaves that slide apart.
  const door = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.04, 2.6), new THREE.MeshBasicMaterial({ color: '#050608' }));
  shaft.position.y = 0.075;
  const glow = new THREE.PointLight('#ffd45e', 0, 8, 1.5);
  glow.position.y = -0.5;
  const leaves = [-1, 1].map((side) => {
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.06, 2.6), new THREE.MeshStandardMaterial({ color: '#2b313a', roughness: 0.6 }));
    leaf.position.set(side * 0.65, 0.1, 0);
    leaf.userData.side = side;
    door.add(leaf);
    return leaf;
  });
  door.add(shaft, glow);
  door.position.set(TRAP_DOOR.x, 0, TRAP_DOOR.z);
  scene.add(door);
  batRun.door = { group: door, leaves, glow };
}
// Called when Wayne Manor is clicked: drive back to the trap door and go down into the Batcave.
function batmanHome() {
  if (!batRun.rider || batRun.phase === 'home' || batRun.phase === 'sink') return;
  const here = batRun.rider.position;
  batRun.path = [{ x: here.x, z: here.z }, ...routeBetween(nearestNode(here.x, here.z), nearestNode(TRAP_DOOR.x, TRAP_DOOR.z)), { x: TRAP_DOOR.x, z: TRAP_DOOR.z }];
  batRun.leg = 0;
  batRun.travelled = 0;
  batRun.target = null;
  batRun.homeward = true;
  batRun.phase = 'drive';
}
// Called when a website or landmark is selected.
function sendBatman(x, z) {
  batRun.homeward = false;
  if (!batRun.rider) return;
  const target = nearestNode(x, z);
  if (batRun.phase === 'home') {
    batRun.path = routeBetween(nearestNode(TRAP_DOOR.x, TRAP_DOOR.z), target);
    batRun.path.unshift({ x: TRAP_DOOR.x, z: TRAP_DOOR.z });
    batRun.phase = 'rise';
    batRun.clock = 0;
  } else {
    const here = batRun.rider.position;
    batRun.path = [{ x: here.x, z: here.z }, ...routeBetween(nearestNode(here.x, here.z), target)];
    batRun.phase = 'drive';
  }
  batRun.leg = 0;
  batRun.travelled = 0;
  batRun.target = { x, z };
}
const BAT_SPEED = 24; // units per second: about 200 km/h at road scale
const ROAD_Y = 0.08;
let lastBatTime = performance.now() / 1000;
function updateBatRun(time) {
  const dt = Math.min(0.5, time - lastBatTime); // generous cap: keeps real-time pace even when frames are slow
  lastBatTime = time;
  const { rider, door } = batRun;
  if (!rider || batRun.phase === 'home') return;
  batRun.clock += dt;
  if (batRun.phase === 'sink') {
    const t = batRun.clock;
    const open = t < 0.5 ? t / 0.5 : t < 1.6 ? 1 : Math.max(0, 1 - (t - 1.6) / 0.5);
    door.leaves.forEach((leaf) => { leaf.position.x = leaf.userData.side * (0.65 + open * 1.3); });
    door.glow.intensity = open * 6;
    const drop = Math.min(1, Math.max(0, (t - 0.5) / 1.0));
    rider.position.set(TRAP_DOOR.x, ROAD_Y - drop * 2.6, TRAP_DOOR.z);
    rider.visible = drop < 1;
    if (t >= 2.1) batRun.phase = 'home';
    return;
  }
  if (batRun.phase === 'rise') {
    // 0-0.6 s doors slide open, 0.6-1.8 s he rises out of the shaft, 1.8-2.4 s doors close behind him.
    const t = batRun.clock;
    const open = t < 0.6 ? t / 0.6 : t < 1.8 ? 1 : Math.max(0, 1 - (t - 1.8) / 0.6);
    door.leaves.forEach((leaf) => { leaf.position.x = leaf.userData.side * (0.65 + open * 1.3); });
    door.glow.intensity = open * 6;
    rider.visible = t > 0.5;
    const lift = Math.min(1, Math.max(0, (t - 0.6) / 1.2));
    rider.position.set(TRAP_DOOR.x, ROAD_Y - 2.6 + lift * 2.6, TRAP_DOOR.z);
    const next = batRun.path[1] ?? batRun.path[0];
    rider.rotation.y = Math.atan2(-(next.z - TRAP_DOOR.z), next.x - TRAP_DOOR.x);
    if (t >= 1.8) batRun.phase = 'drive';
    return;
  }
  if (door && batRun.clock < 3) {
    const open = Math.max(0, 1 - (batRun.clock - 1.8) / 0.6);
    door.leaves.forEach((leaf) => { leaf.position.x = leaf.userData.side * (0.65 + open * 1.3); });
    door.glow.intensity = open * 6;
  }
  if (batRun.phase !== 'drive') return;
  // Drive along the route: advance the distance travelled, find the current leg, face along it.
  batRun.travelled += BAT_SPEED * dt;
  const path = batRun.path;
  while (batRun.leg < path.length - 1) {
    const a = path[batRun.leg], b = path[batRun.leg + 1];
    const legLength = Math.hypot(b.x - a.x, b.z - a.z);
    if (batRun.travelled < legLength) {
      const f = batRun.travelled / legLength;
      rider.position.set(a.x + (b.x - a.x) * f, ROAD_Y + Math.abs(Math.sin(time * 18)) * 0.05, a.z + (b.z - a.z) * f);
      const heading = Math.atan2(-(b.z - a.z), b.x - a.x);
      let turn = heading - rider.rotation.y;
      turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      rider.rotation.y += turn * Math.min(1, dt * 12); // smooth into corners
      return;
    }
    batRun.travelled -= legLength;
    batRun.leg++;
  }
  // Home: sink back through the trap door (doors open, he drops into the shaft, doors close).
  if (batRun.homeward) {
    batRun.phase = 'sink';
    batRun.clock = 0;
    return;
  }
  // Arrived: park on the kerb, facing the building.
  const end = path[path.length - 1];
  rider.position.set(end.x, ROAD_Y, end.z);
  if (batRun.target) rider.rotation.y = Math.atan2(-(batRun.target.z - end.z), batRun.target.x - end.x);
  batRun.phase = 'parked';
}

// ---- Pedestrians --------------------------------------------------------------------------------------------------
// Tai's ambient sprite sheet (models/everything-else/gotham_ambient_sprites.png: rows Commuter, Hooded, Porter, Bat;
// four 128 px walk frames each) brings ~70 people to the city. They walk only the sidewalks (the kit ring round each block)
// and cross streets only on the crosswalks, turn at random at corners and steer away from breached skyscrapers. Anyone
// who gets within DANGER of one breaks into a run away from it until they are SAFE. Bridges are left to traffic.
const NPC_COUNT = 70;
const NPC_HEIGHT = 1.7;
const NPC_WALK = 1.3; // units per second
const NPC_RUN = 4.8;
const DANGER = 8; // a breached tower's reach
const SAFE = 11; // running stops beyond this
const KERB = 1.8; // a sidewalk's centreline from the street's centreline (half the 3-unit street, plus half the 0.6 ring)
const npcs = [];
let breachedTowerSpots = [];
function syncBreachedTowers() {
  breachedTowerSpots = accounts.filter((account) => account.status === 'breached' && account.slot >= 0).map((account) => slots[account.slot]);
}
const nearestDanger = (x, z) => breachedTowerSpots.reduce((best, spot) => Math.min(best, Math.hypot(spot.x - x, spot.z - z)), Infinity);
// The walking network: a node at each block corner's sidewalk (KERB off both streets), linked along each block side
// (sidewalk) and across each street just outside the intersection (crosswalk). `crossings` are where the crosswalks go.
const crossings = [];
const walkGraph = (() => {
  const nodes = new Map();
  const node = (x, z) => {
    if (!isOnLand(x, z)) return null;
    const key = `${x.toFixed(1)},${z.toFixed(1)}`;
    if (!nodes.has(key)) nodes.set(key, { key, x, z, links: new Map() });
    return nodes.get(key);
  };
  const link = (a, b, cross) => {
    if (!a || !b) return false;
    const len = Math.hypot(a.x - b.x, a.z - b.z);
    a.links.set(b.key, { len, cross });
    b.links.set(a.key, { len, cross });
    return true;
  };
  for (const n of roadGraph.values()) for (const key of n.links.keys()) {
    const m = roadGraph.get(key);
    if (n.key.startsWith('b') && key.startsWith('b')) continue; // bridge decks
    const len = Math.hypot(m.x - n.x, m.z - n.z);
    const dx = (m.x - n.x) / len, dz = (m.z - n.z) / len, px = -dz, pz = dx;
    // Along the block side between this corner and the next, on both sides of the street.
    for (const side of [-1, 1]) {
      link(node(n.x + (dx + px * side) * KERB, n.z + (dz + pz * side) * KERB), node(m.x + (-dx + px * side) * KERB, m.z + (-dz + pz * side) * KERB), false);
    }
    // Across this street at n's end.
    if (link(node(n.x + (dx + px) * KERB, n.z + (dz + pz) * KERB), node(n.x + (dx - px) * KERB, n.z + (dz - pz) * KERB), true)) {
      crossings.push([n.x + dx * KERB, n.z + dz * KERB, Math.abs(dx) > 0.5 ? 0 : Math.PI / 2]);
    }
  }
  for (const t of roadGraph.values()) {
    if (!t.key.startsWith('v')) continue;
    const keys = [...t.links.keys()];
    const avenue = roadGraph.get(keys.find((k) => k.startsWith('b')));
    const street = roadGraph.get(keys.find((k) => k.startsWith('c')));
    const al = Math.hypot(avenue.x - t.x, avenue.z - t.z), sl = Math.hypot(street.x - t.x, street.z - t.z);
    const ax = -(avenue.x - t.x) / al, az = -(avenue.z - t.z) / al, sx = (street.x - t.x) / sl, sz = (street.z - t.z) / sl;
    link(node(t.x + (sx + ax) * KERB, t.z + (sz + az) * KERB), node(t.x + (-sx + ax) * KERB, t.z + (-sz + az) * KERB), false);
  }
  return nodes;
})();
async function spawnPedestrians() {
  const atlas = await new THREE.TextureLoader().loadAsync('./models/everything-else/gotham_ambient_sprites.png').catch(() => null);
  if (!atlas) return;
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.magFilter = THREE.NearestFilter;
  // frames[kind][frame][mirrored]: the art faces screen-right; mirrored copies face left.
  const frames = [0, 1, 2].map((row) => [0, 1, 2, 3].map((col) => [false, true].map((mirror) => {
    const texture = atlas.clone();
    texture.repeat.set(mirror ? -0.25 : 0.25, 0.25);
    texture.offset.set((mirror ? col + 1 : col) * 0.25, 1 - (row + 1) * 0.25);
    texture.needsUpdate = true;
    return texture;
  })));
  const walkable = [...walkGraph.values()].filter((n) => n.links.size);
  for (let i = 0; i < NPC_COUNT; i++) {
    const from = walkable[Math.floor(Math.random() * walkable.length)];
    const to = walkGraph.get([...from.links.keys()][Math.floor(Math.random() * from.links.size)]);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: frames[i % 3][0][0], transparent: true, alphaTest: 0.35 }));
    sprite.scale.set(NPC_HEIGHT, NPC_HEIGHT, 1);
    sprite.center.set(0.5, 0.1); // feet on the pavement
    scene.add(sprite);
    npcs.push({ sprite, frames: frames[i % 3], from, to, t: Math.random(), running: false, step: Math.random() * 4 });
  }
}
// Next leg at a corner: away from the nearest breached tower when running; otherwise a random one that doesn't lead
// toward one (never straight back unless it's a dead end).
function nextStreet(npc) {
  let options = [...npc.to.links.keys()].map((key) => walkGraph.get(key)).filter((n) => n !== npc.from && !inCordon(n.x, n.z));
  if (!options.length) options = [npc.from];
  if (npc.running) return options.reduce((best, n) => (nearestDanger(n.x, n.z) > nearestDanger(best.x, best.z) ? n : best));
  const safe = options.filter((n) => nearestDanger(n.x, n.z) > DANGER);
  const pool = safe.length ? safe : options;
  return pool[Math.floor(Math.random() * pool.length)];
}
const cameraRight = new THREE.Vector3();
let lastNpcTime = performance.now() / 1000;
function updatePedestrians(time) {
  const dt = Math.min(0.5, time - lastNpcTime);
  lastNpcTime = time;
  if (!npcs.length) return;
  cameraRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
  for (const npc of npcs) {
    let { from: a, to: b } = npc;
    // Heading onto a cordoned sidewalk: turn back (anyone already inside walks on out).
    if (inCordon(b.x, b.z) && !inCordon(a.x, a.z)) { [npc.from, npc.to] = [b, a]; npc.t = 1 - npc.t; [a, b] = [npc.from, npc.to]; }
    const danger = nearestDanger(a.x + (b.x - a.x) * npc.t, a.z + (b.z - a.z) * npc.t);
    if (!npc.running && danger < DANGER) {
      npc.running = true;
      if (nearestDanger(b.x, b.z) < nearestDanger(a.x, a.z)) { [npc.from, npc.to] = [b, a]; npc.t = 1 - npc.t; } // turn round
    } else if (npc.running && danger > SAFE) {
      npc.running = false;
    }
    npc.t += ((npc.running ? NPC_RUN : NPC_WALK) * dt) / npc.from.links.get(npc.to.key).len;
    while (npc.t >= 1) {
      const leftover = (npc.t - 1) * npc.from.links.get(npc.to.key).len;
      const next = nextStreet(npc);
      [npc.from, npc.to] = [npc.to, next];
      npc.t = leftover / npc.from.links.get(npc.to.key).len;
    }
    [a, b] = [npc.from, npc.to];
    const { len, cross } = a.links.get(b.key);
    // On a crosswalk, step down to the road between the kerbs.
    const y = cross && Math.abs(npc.t - 0.5) * len < KERB - 0.3 ? 0.08 : 0.23;
    npc.sprite.position.set(a.x + (b.x - a.x) * npc.t, y, a.z + (b.z - a.z) * npc.t);
    npc.step += dt * (npc.running ? 14 : 6);
    const mirrored = (b.x - a.x) * cameraRight.x + (b.z - a.z) * cameraRight.z < 0; // heading screen-left
    npc.sprite.material.map = npc.frames[Math.floor(npc.step) % 4][mirrored ? 1 : 0];
  }
}

// ---- Traffic --------------------------------------------------------------------------------------------------------
// Tai's civilian cars (hatchback, two sedans) and a few GCPD cruisers drive the street network in the right-hand lane,
// turning at random at corners (no U-turns unless it's a dead end) and easing their heading round each turn. A car stops
// for a pedestrian or a car just ahead; after waiting STUCK seconds behind cars (a jam at a crossing) it turns round.
const CAR_COUNT = 14;
const COP_COUNT = 4;
const CAR_SPEED = 3.6;
const LANE = 0.7; // off the centreline
const STUCK = 4;
const cars = [];
async function spawnTraffic() {
  const load = (file) => loadModel(`./models/everything-else/${file}.glb`).catch(() => null);
  const [civilian, police] = await Promise.all([load('gotham_civilian_cars'), load('gotham_police_cruiser')]);
  const models = [...(civilian?.children ?? []).map((car) => [car, 1]), ...(police?.children ?? []).map((car) => [car, 0.55])];
  if (!models.length) return;
  if (police?.children.length) policeModel = models[models.length - 1];
  for (let i = 0; i < CAR_COUNT + COP_COUNT; i++) addCar(...(i < CAR_COUNT ? models[i % Math.max(1, models.length - 1)] : models[models.length - 1]), i >= CAR_COUNT);
  syncIncidents();
}
let policeModel = null; // [cruiser, scale], kept so incidents can call in more cops
// Arkham Asylum's island (The Narrows) is off limits to traffic: its ring streets and the bridge over to it. Any street
// with an end on the island (the bridge's landing included) is closed for good.
const arkhamIsland = islands.find((island) => island.name === 'The Narrows');
const onArkhamIsland = (n) => !!arkhamIsland && n.x > arkhamIsland.minX - 2.5 && n.x < arkhamIsland.maxX + 2.5 && n.z > arkhamIsland.minZ - 2.5 && n.z < arkhamIsland.maxZ + 2.5;
const offLimits = (a, b) => onArkhamIsland(a) || onArkhamIsland(b);
const randomEdge = () => {
  const walkable = [...roadGraph.values()].filter((n) => n.links.size && !onArkhamIsland(n));
  const from = walkable[Math.floor(Math.random() * walkable.length)];
  const open = [...from.links.keys()].map((key) => roadGraph.get(key)).filter((n) => !offLimits(from, n));
  return { from, to: open.length ? open[Math.floor(Math.random() * open.length)] : roadGraph.get([...from.links.keys()][0]) };
};
function addCar(source, scale, isCop) {
  // The kit's cars stand side by side; centre each copy on itself (measuring the source picked up the kit's layout and
  // put the sedans 1.25 to one side: the burgundy one on the sidewalk, the cream one in the oncoming lane).
  const body = source.clone(true);
  body.position.set(0, 0, 0);
  body.updateMatrixWorld(true);
  const centre = new THREE.Box3().setFromObject(body).getCenter(new THREE.Vector3());
  body.position.set(-centre.x, 0, -centre.z);
  const car = new THREE.Group();
  car.add(body);
  car.scale.setScalar(scale);
  // The kit's own beacon lights are wide point lights that tint whole streets purple; the flashing below replaces them.
  car.traverse((node) => { if (node.isLight) node.visible = false; }); // no shadow: it moves (static shadow map)
  // GCPD light bars: unlit red and blue lenses that flash in turn, and a small light washing the street below.
  let beacons = null;
  if (isCop) {
    beacons = { red: [], blue: [], light: new THREE.PointLight('#ff2a2a', 0, 9, 1.4) };
    body.traverse((node) => {
      const colour = /red_lens/i.test(node.name) ? 'red' : /blue_lens/i.test(node.name) ? 'blue' : null;
      if (colour) node.traverse((mesh) => { if (mesh.isMesh) { mesh.material = new THREE.MeshBasicMaterial(); beacons[colour].push(mesh.material); } });
    });
    beacons.light.position.y = 5; // well above the roof (car frame, before the 0.55 scale) so it lights the street, not the paint
    car.add(beacons.light);
  }
  scene.add(car);
  const entry = { car, ...randomEdge(), t: Math.random(), yaw: null, speed: CAR_SPEED * (0.8 + Math.random() * 0.4), wait: 0, beacons, flash: Math.random() * 2, parked: null };
  cars.push(entry);
  return entry;
}

// ---- Incidents ------------------------------------------------------------------------------------------------------
// Every breached tower's block is ringed with police sawhorses, and two GCPD cruisers park on its east and south streets
// (the sides the camera sees). Parked cruisers are taken off patrol; when there are more incidents than cruisers, more
// are called in. When the breach clears they go back to patrolling.
const BARRIER_GAP = 1.4;
// One merged, vertex-coloured sawhorse drawn as a single InstancedMesh for every barrier in the city.
const barrierGeometry = (() => {
  const parts = [];
  const box = (w, h, d, color, x, y, z) => {
    const g = new THREE.BoxGeometry(w, h, d).translate(x, y, z);
    const c = new THREE.Color(color);
    g.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: g.attributes.position.count }, () => [c.r, c.g, c.b]).flat(), 3));
    parts.push(g);
  };
  for (const x of [-0.42, 0.42]) box(0.07, 0.42, 0.22, '#d8d2c4', x, 0.21, 0);
  for (let i = 0; i < 5; i++) box(0.2, 0.12, 0.05, i % 2 ? '#f2efe6' : '#f26a1b', -0.4 + i * 0.2, 0.36, 0); // striped rail
  box(0.2, 0.06, 0.06, '#ffcf3a', 0, 0.48, 0); // amber lamp
  return mergeGeometries(parts);
})();
const barrierMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
const incidentGroup = new THREE.Group();
scene.add(incidentGroup);
// A round soft-edged texture shared by the siren pools, the breach smoke and its flames.
function softBlob(inner, outer) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(1, outer);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace; // keep the soot dark and the flames orange, not washed out
  return texture;
}
const sirenPoolTexture = softBlob('rgba(255,255,255,0.55)', 'rgba(255,255,255,0)');
const sirenPoolGeometry = new THREE.PlaneGeometry(3.4, 3.4);
// Can the fixed isometric camera see a person standing at (x, z), or is a building in the way?
const seeRay = new THREE.Raycaster();
const towardCamera = new THREE.Vector3(CITY_SIZE, CITY_SIZE, CITY_SIZE * 1.04).normalize();
function cameraSees(x, z) {
  seeRay.set(new THREE.Vector3(x, 0.9, z), towardCamera);
  const blockers = [...renderedBuildings.values(), ...landmarkRoots, ...(favelaGroup ? [favelaGroup] : [])];
  return !seeRay.intersectObjects(blockers, true).length;
}
// Flash the cordons' lights and road glow red, then blue (incidentGroup is rebuilt by syncIncidents).
// Tai's two officers chatting on their radios (models/everything-else/gotham_police_radio_chat.glb), one pair at each
// cordon's camera-side corner, playing the chat on a loop. Loaded once; syncIncidents places them.
let policeChatModel = null;
const POLICE_HEIGHT = 1.5; // larger than road scale so they read beside the giant rooftop villains
loadModel('./models/everything-else/gotham_police_radio_chat.glb')
  .then((model) => { policeChatModel = model; syncIncidents(); })
  .catch((error) => console.warn('Could not load the police radio chat:', error));
let lastSirenTime = null;
function updateSirens(time) {
  const dt = lastSirenTime === null ? 0 : Math.min(0.1, time - lastSirenTime);
  lastSirenTime = time;
  for (const node of incidentGroup.children) {
    node.userData.mixer?.update(dt);
    if (node.userData.siren === undefined) continue;
    const red = (time * 3 + node.userData.siren) % 2 < 1;
    const colour = red ? '#ff2a2a' : '#2f6bff';
    if (node.isLight) { node.color.set(colour); node.intensity = 6; }
    else node.material.color.set(colour);
  }
}
// The cordoned blocks ({ minX, maxX, minZ, maxZ }: the block's edge). Their four streets are closed to traffic and their
// sidewalks to pedestrians while the breach lasts.
let cordons = [];
const inCordon = (x, z, pad = 0) => cordons.some((c) => x > c.minX - pad && x < c.maxX + pad && z > c.minZ - pad && z < c.maxZ + pad);
// A street is closed when its middle lies on a cordoned block's ring of streets (1.5 out from the block's edge).
const closedRoad = (a, b) => inCordon((a.x + b.x) / 2, (a.z + b.z) / 2, 1.6);
function syncIncidents() {
  incidentGroup.children.forEach((mesh) => { mesh.dispose?.(); if (mesh.material && mesh.geometry === sirenPoolGeometry) mesh.material.dispose(); });
  incidentGroup.clear();
  const barriers = [];
  const breached = accounts.filter((account) => account.status === 'breached' && account.slot >= 0);
  const spots = [];
  const sirens = []; // [x, z]: one flashing light per cordoned block
  const posts = []; // [x, z, towerX, towerZ]: where each cordon's officers stand, and the tower they watch
  cordons = [];
  for (const blockIndex of new Set(breached.map((account) => slots[account.slot].block))) {
    const cells = blocks[blockIndex].cells;
    const minX = Math.min(...cells.map((c) => c.x)) - 4.5, maxX = Math.max(...cells.map((c) => c.x)) + 4.5;
    const minZ = Math.min(...cells.map((c) => c.z)) - 4.5, maxZ = Math.max(...cells.map((c) => c.z)) + 4.5;
    const side = (x1, z1, x2, z2, yaw) => {
      const n = Math.max(1, Math.round(Math.hypot(x2 - x1, z2 - z1) / BARRIER_GAP));
      for (let i = 0; i <= n; i++) barriers.push(new THREE.Matrix4().makeRotationY(yaw).setPosition(x1 + (x2 - x1) * i / n, ROAD_Y, z1 + (z2 - z1) * i / n));
    };
    cordons.push({ minX, maxX, minZ, maxZ });
    side(minX, minZ, maxX, minZ, 0); side(minX, maxZ, maxX, maxZ, 0);
    side(minX, minZ, minX, maxZ, Math.PI / 2); side(maxX, minZ, maxX, maxZ, Math.PI / 2);
    for (const account of breached.filter((a) => slots[a.slot].block === blockIndex)) {
      const slot = slots[account.slot];
      spots.push({ x: maxX + 0.8, z: slot.z, yaw: 0.35 }, { x: slot.x, z: maxZ + 0.8, yaw: Math.PI / 2 + 0.35 });
    }
    sirens.push([maxX + 0.8, maxZ + 0.8]); // the block's camera-side corner, between its parked cruisers
    // Officers: the first spot along the cordon's two camera-facing streets that the camera can see (towers across the
    // street hide most of them), else the corner.
    const along = [];
    for (let t = 0.15; t < 1; t += 0.14) along.push([maxX + 0.5, minZ + (maxZ - minZ) * t], [minX + (maxX - minX) * t, maxZ + 0.5]);
    const tower = slots[breached.find((a) => slots[a.slot].block === blockIndex).slot];
    posts.push([...(along.find(([x, z]) => cameraSees(x, z)) ?? [maxX + 0.6, maxZ + 0.6]), tower.x, tower.z]);
  }
  // Red/blue light washing each cordon: one point light per block (each light costs every pixel, so not one per car).
  sirens.forEach(([x, z], i) => {
    const light = new THREE.PointLight('#ff2a2a', 0, 14, 1.4);
    light.position.set(x, 3.5, z);
    light.userData.siren = i * 0.37;
    incidentGroup.add(light);
  });
  if (policeChatModel) posts.forEach(([x, z, towerX, towerZ], i) => {
    const officers = cloneSkinned(policeChatModel);
    const raw = new THREE.Box3().setFromObject(policeChatModel).getSize(new THREE.Vector3());
    officers.scale.setScalar(POLICE_HEIGHT / raw.y);
    officers.rotation.y = Math.atan2(towerX - x, towerZ - z) + Math.PI; // facing the burning tower (the export faces -Z)
    officers.position.set(x, ROAD_Y, z); // just outside the barriers
    const mixer = new THREE.AnimationMixer(officers);
    (policeChatModel.userData.clips ?? []).forEach((clip) => { const action = mixer.clipAction(clip).play(); action.time = (i * 1.7) % clip.duration; });
    officers.userData.mixer = mixer;
    officers.traverse((node) => { if (node.isMesh) node.raycast = () => {}; });
    incidentGroup.add(officers);
  });
  // A soft red/blue pool on the road under every parked cruiser: additive, unlit, nearly free.
  spots.forEach((spot, i) => {
    const pool = new THREE.Mesh(sirenPoolGeometry, new THREE.MeshBasicMaterial({ map: sirenPoolTexture, color: '#ff2a2a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(spot.x, ROAD_Y + 0.02, spot.z);
    pool.userData.siren = i * 0.53;
    pool.raycast = () => {};
    incidentGroup.add(pool);
  });
  for (const node of roadGraph.values()) {
    const keys = [...node.links.keys()];
    if (!keys.some((key) => !closedRoad(node, roadGraph.get(key)))) continue; // only where open streets meet closed ones
    for (const key of keys) {
      const other = roadGraph.get(key);
      if (!closedRoad(node, other)) continue;
      const len = Math.hypot(other.x - node.x, other.z - node.z) || 1, dx = (other.x - node.x) / len, dz = (other.z - node.z) / len;
      for (const across of [-1, 0, 1]) barriers.push(new THREE.Matrix4().makeRotationY(Math.atan2(-dx, -dz)).setPosition(node.x + dx * 2.4 - dz * across, ROAD_Y, node.z + dz * 2.4 + dx * across));
    }
  }
  if (barriers.length) {
    const mesh = new THREE.InstancedMesh(barrierGeometry, barrierMaterial, barriers.length);
    barriers.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.castShadow = true;
    incidentGroup.add(mesh);
  }
  if (!cars.length) return; // traffic not spawned yet; spawnTraffic calls back in
  let cops = cars.filter((c) => c.beacons);
  while (policeModel && cops.length < spots.length) cops.push(addCar(...policeModel, true));
  cops.forEach((cop, i) => {
    const spot = spots[i] ?? null;
    if (!spot && cop.parked) Object.assign(cop, randomEdge(), { t: 0, yaw: null }); // back on patrol
    cop.parked = spot;
  });
}
let lastCarTime = performance.now() / 1000;
function updateTraffic(time) {
  const dt = Math.min(0.5, time - lastCarTime);
  lastCarTime = time;
  for (const c of cars) {
    if (c.beacons) {
      const redOn = (time * 3 + c.flash) % 2 < 1;
      c.beacons.red.forEach((m) => m.color.set(redOn ? '#ff2626' : '#3a0808'));
      c.beacons.blue.forEach((m) => m.color.set(redOn ? '#081040' : '#2f6bff'));
      c.beacons.light.color.set(redOn ? '#ff2a2a' : '#2f6bff');
      c.beacons.light.intensity = 5;
      c.beacons.light.visible = !c.parked; // each point light costs every pixel; parked ones flash their lenses only
    }
    if (c.parked) { c.car.position.set(c.parked.x, ROAD_Y, c.parked.z); c.car.rotation.y = c.yaw = c.parked.yaw; continue; }
    let len = Math.hypot(c.to.x - c.from.x, c.to.z - c.from.z) || 1;
    // Anything within reach ahead of the car and close to its line?
    const here = c.car.position, hx = (c.to.x - c.from.x) / len, hz = (c.to.z - c.from.z) / len;
    const ahead = (p, reach, width) => {
      const rx = p.x - here.x, rz = p.z - here.z;
      const along = rx * hx + rz * hz;
      return along > 0.2 && along < reach && Math.abs(rx * hz - rz * hx) < width;
    };
    const carAhead = cars.some((o) => o !== c && ahead(o.car.position, 2.6, 0.9));
    const personAhead = npcs.some((npc) => ahead(npc.sprite.position, 2.2, 0.8));
    c.wait = carAhead ? c.wait + dt : 0;
    if (c.wait > STUCK) { [c.from, c.to] = [c.to, c.from]; c.t = 1 - c.t; c.wait = 0; continue; } // U-turn out of the jam
    if (carAhead || personAhead) continue;
    c.t += (c.speed * dt) / len;
    while (c.t >= 1) {
      let options = [...c.to.links.keys()].map((key) => roadGraph.get(key)).filter((n) => n !== c.from && !closedRoad(c.to, n) && !offLimits(c.to, n));
      if (!options.length) options = [c.from];
      const next = options[Math.floor(Math.random() * options.length)];
      c.t = ((c.t - 1) * len) / (Math.hypot(next.x - c.to.x, next.z - c.to.z) || 1);
      [c.from, c.to] = [c.to, next];
      len = Math.hypot(c.to.x - c.from.x, c.to.z - c.from.z) || 1;
    }
    const dx = (c.to.x - c.from.x) / len, dz = (c.to.z - c.from.z) / len;
    const bridge = c.from.key.startsWith('b') && c.to.key.startsWith('b');
    // Right-hand lane. Shoreline streets are widened to two lanes, except by beaches and working waterfronts, where the
    // street is only its land-side half and both directions share it.
    const mx = (c.from.x + c.to.x) / 2, mz = (c.from.z + c.to.z) / 2;
    const rightLand = isOnLand(mx - dz, mz + dx), leftLand = isOnLand(mx + dz, mz - dx);
    const edgeKey = Math.abs(dx) > 0.5 ? `${Math.round(mx / 12) * 12},${mz}` : `${mx},${Math.round(mz / 12) * 12}`;
    const lane = bridge || (rightLand && leftLand) || widenedShore.has(edgeKey) || deckEdges.has(edgeKey) ? LANE : rightLand ? 0.75 : -0.75;
    c.car.position.set(c.from.x + dx * len * c.t - dz * lane, bridge ? 0.12 : ROAD_Y, c.from.z + dz * len * c.t + dx * lane);
    const target = Math.atan2(-dx, -dz); // the cars' noses point -Z
    if (c.yaw === null) c.yaw = target;
    const turn = Math.atan2(Math.sin(target - c.yaw), Math.cos(target - c.yaw));
    c.yaw += turn * Math.min(1, dt * 6);
    c.car.rotation.y = c.yaw;
  }
}


// ---- Blimp and rooftop billboards -----------------------------------------------------------------------------------
// Tai's blimp (models/everything-else/gotham_blimp.glb, searchlight beam included) drifts slowly round the city on a
// wide loop, nosing along its path with a gentle bob.
const BLIMP = { scale: 2.5, height: 30, radius: [125, 95], speed: 0.012 };
let blimp = null;
async function launchBlimp() {
  const model = await loadModel('./models/everything-else/gotham_blimp.glb').catch(() => null);
  if (!model) return;
  blimp = new THREE.Group();
  model.scale.setScalar(BLIMP.scale);
  model.traverse((node) => { if (node.isMesh) node.raycast = () => {}; });
  blimp.add(model);
  scene.add(blimp);
}
function updateBlimp(time) {
  if (!blimp) return;
  const a = time * BLIMP.speed;
  const x = CITY_CENTER_X + Math.cos(a) * BLIMP.radius[0], z = CITY_CENTER_Z + Math.sin(a) * BLIMP.radius[1];
  blimp.position.set(x, BLIMP.height + Math.sin(time * 0.6) * 0.6, z);
  // Heading along the loop (its tangent); the model's nose is +Z.
  blimp.rotation.y = Math.atan2(-Math.sin(a) * BLIMP.radius[0], Math.cos(a) * BLIMP.radius[1]);
}

// Tai's billboard frame (models/everything-else/gotham_billboard.glb) on the roofs of a few of the taller filler buildings,
// spread across the city and turned to the camera, each display lit with its own sign: Gotham ads and breach-safety tips.
const BILLBOARD_SIGNS = [
  ['CHANGE YOUR', 'PASSWORDS', '#e0b13c', '#1b1f2a'],
  ['TURN ON', '2FA', '#7fd1ff', '#10202c'],
  ['BREACHLINK', 'CHECK YOUR EMAIL', '#ff6a3d', '#170f14'],
  ['GOTHAM', 'GAZETTE', '#f2efe6', '#3a1418'],
  ['ACE', 'CHEMICALS', '#9bff6a', '#14210f'],
  ['DON\'T REUSE', 'PASSWORDS', '#ff4f6d', '#1c0f16'],
  ['GCPD', 'SEE IT · SAY IT', '#6fa8ff', '#0f1526'],
  ['WAYNE', 'ENTERPRISES', '#e8d8a8', '#141414'],
];
function signTexture([top, bottom, ink, paper]) {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = paper; ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = ink; ctx.lineWidth = 4; ctx.strokeRect(6, 6, 116, 116);
  ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 30px monospace'; ctx.fillText(top, 64, 44, 112);
  ctx.font = 'bold 21px monospace'; ctx.fillText(bottom, 64, 86, 114);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter; // keeps the pixel look
  return texture;
}
const BILLBOARD_COUNT = 8, BILLBOARD_SCALE = 1.9;
let billboardModel = null, billboardGroup = null, billboardTimer = null;
loadModel('./models/everything-else/gotham_billboard.glb').then((model) => { billboardModel = model; placeBillboards(); }).catch(() => {});
// Re-placed whenever the filler buildings change (debounced: syncPlotParks runs in bursts while the city loads).
function placeBillboards() {
  clearTimeout(billboardTimer);
  billboardTimer = setTimeout(() => {
    if (!billboardModel || !favelaGroup) return;
    billboardGroup?.removeFromParent();
    billboardGroup = new THREE.Group();
    billboardGroup.name = 'Rooftop billboards';
    scene.add(billboardGroup);
    // Roof heights of a seeded sample of the free plots (a ray dropped on the filler there), tallest first, spread out.
    favelaGroup.updateMatrixWorld(true);
    const random = seededRandom(31337), ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
    const free = slots.map((slot, i) => ({ slot, i })).filter(({ i }) => !slotOccupants.has(i) && !landmarkSlots.has(i));
    // Only flat roofs: five rays across the board's footprint must land within a hand's height of each other (a spire or
    // a stepped top would leave the board floating).
    const roofAt = (x, z) => { ray.set(new THREE.Vector3(x, 80, z), down); return ray.intersectObject(favelaGroup, true)[0]?.point.y ?? -1; };
    const sample = free.filter(() => random() < 0.5).map(({ slot }) => {
      const heights = [[0, 0], [1.1, 1.1], [-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1]].map(([dx, dz]) => roofAt(slot.x + dx, slot.z + dz));
      const low = Math.min(...heights), high = Math.max(...heights);
      return low > 1 && high - low < 0.3 ? { x: slot.x, z: slot.z, y: high } : null;
    }).filter(Boolean).sort((a, b) => b.y - a.y);
    const picked = [];
    for (const spot of sample) {
      if (picked.length >= BILLBOARD_COUNT) break;
      if (picked.some((p) => Math.hypot(p.x - spot.x, p.z - spot.z) < 30)) continue;
      picked.push(spot);
    }
    // The display panel, measured once, gets a lit sign on both faces.
    const display = [];
    billboardModel.traverse((node) => { if (node.isMesh && /display/i.test(node.material.name)) display.push(node); });
    billboardModel.updateMatrixWorld(true);
    const panel = new THREE.Box3();
    display.forEach((node) => panel.expandByObject(node));
    const size = panel.getSize(new THREE.Vector3()), centre = panel.getCenter(new THREE.Vector3());
    picked.forEach((spot, i) => {
      const board = billboardModel.clone(true);
      const material = new THREE.MeshBasicMaterial({ map: signTexture(BILLBOARD_SIGNS[i % BILLBOARD_SIGNS.length]) });
      for (const face of [1, -1]) {
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(size.x * 0.96, size.y * 0.94), material);
        sign.position.set(centre.x, centre.y, face > 0 ? panel.max.z + 0.01 : panel.min.z - 0.01);
        if (face < 0) sign.rotation.y = Math.PI;
        board.add(sign);
      }
      board.scale.setScalar(BILLBOARD_SCALE);
      board.rotation.y = Math.PI / 4; // to the camera
      board.position.set(spot.x, spot.y, spot.z);
      board.traverse((node) => { if (node.isMesh) { node.castShadow = true; node.raycast = () => {}; } });
      billboardGroup.add(board);
    });
  }, 300);
}

function finishInitialLoad() {
  if (!environmentReady || !accountModelsReady) return;
  if (!npcs.length) spawnPedestrians();
  if (!cars.length) spawnTraffic();
  if (!batRun.rider) prepareBatRun();
  if (!blimp) launchBlimp();
  placeWayneManor();
  placeBatSignal();
  launchShips();
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
  // Each tower's burning ruin (same slot number), swapped in while its site is breached.
  models.destroyedTowers = await Promise.all(Array.from({ length: 10 }, (_, i) => loadModel(`./models/account_buildings/account_building_${String(i + 1).padStart(2, '0')}_destroyed.glb`).catch(() => null)));
  models.villains = (await Promise.all(VILLAINS.map((name) => loadModel(`./models/${name === GANG ? 'everything-else' : 'npcs'}/${name}.glb`).then((model) => { model.userData.villainName = name; return model; }).catch((error) => { console.warn(`Could not load ${name}:`, error); return null; })))).filter(Boolean);
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
      ? (Math.min(block.width, block.depth) - 1.2) / Math.max(size.x, size.z) // fills its plot to the sidewalk, either way round
      : landmark.name === 'Wayne Tower'
        ? Math.min(landmark.height / size.y, (Math.min(block.width, block.depth) - 1.2) / Math.max(size.x, size.z)) // even scale, fits one block
        : [(block.width - 1.2) / size.x, landmark.height / size.y, (block.depth - 1.2) / size.z];
    const root = addPlacedModel(source, [block.x, 0.23, block.z], scale, faceToward(source, YAW_SOUTH)); // landmarks face south
    flickerWindows(root);
    root.userData.landmark = landmark.name;
    const label = landmarkLabel(landmark.name); label.position.set(block.x, new THREE.Box3().setFromObject(root).max.y + 0.8, block.z); scene.add(label);
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

// The camera is fixed and looks from the south-east, so only a building's east (+x) and south (+z) sides are ever
// seen. A model's front is the side with the most doors and windows (doors count for more); it is turned to face east or
// south. frontYaw is the front's heading as a yaw angle (east 0, south -90 degrees), cached on the model.
const YAW_EAST = 0, YAW_SOUTH = -Math.PI / 2;
function frontYaw(model) {
  if (model.userData.frontYaw !== undefined) return model.userData.frontYaw;
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const middle = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
  const sides = [[1, 0], [-1, 0], [0, 1], [0, -1]]; // +x, -x, +z, -z as [x, z]
  const yaws = [0, Math.PI, -Math.PI / 2, Math.PI / 2]; // +x, -x, +z, -z
  const weight = [0, 0, 0, 0];
  const v = new THREE.Vector3();
  model.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const name = `${mesh.material?.name || ''} ${mesh.name}`;
    const w = /door|entr|portico|stair/i.test(name) ? 20 : /window|amber|glass|glow/i.test(name) ? 1 : 0;
    if (!w) return;
    const position = mesh.geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).sub(middle);
      // The side this vertex is furthest toward, if it is in that side's outer part.
      let side = -1, best = 0.25;
      sides.forEach(([x, z], k) => { const reach = (v.x * x + v.z * z) / (x ? size.x / 2 : size.z / 2); if (reach > best) { best = reach; side = k; } });
      if (side >= 0) weight[side] += w;
    }
  });
  const most = Math.max(...weight);
  // Daniel's landmarks are modelled facing +z; keep that unless another side clearly wins.
  const front = !most || weight[2] >= most * 0.8 ? 2 : weight.indexOf(most);
  return (model.userData.frontYaw = yaws[front]);
}
// Yaw that turns a model's front to face `want` (YAW_EAST or YAW_SOUTH).
const faceToward = (model, want) => want - frontYaw(model);
const eastOrSouth = (random) => (random() < 0.5 ? YAW_EAST : YAW_SOUTH);

function chooseBuildingModel(account, models) {
  const variant = towerVariant(account);
  const tower = (account.status === 'breached' && models.destroyedTowers?.[variant]) || models.towers?.[variant];
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
  model.rotation.y = faceToward(source, eastOrSouth(placementRandom)); // front toward the camera, never the back

  const raw = new THREE.Box3().setFromObject(source).getSize(new THREE.Vector3());
  const age = account.firstSeen ? Math.max(0, (Date.now() - Date.parse(account.firstSeen)) / 31557600000) : 3;
  const isWayne = source === loadedBuildingModels?.wayne;
  // The updated Wayne asset is twice the original tower's height.
  // Daniel's towers are modeled in meters, so they keep their real height at road scale.
  const isDanielTower = loadedBuildingModels?.towers?.includes(source) || loadedBuildingModels?.destroyedTowers?.includes(source);
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
  root.userData.source = source;
  if (source.userData.clips?.length) { // the ruins' looping flames
    const mixer = new THREE.AnimationMixer(model);
    source.userData.clips.forEach((clip) => mixer.clipAction(clip).play());
    root.userData.mixer = mixer;
  }
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
// Window panes across the kits: 'window' materials, plus amber and glass panes (MAT_Account_Amber, MAT_F02_Amber,
// MAT_Bank_AmberGlass, MAT_Redesign_WarmGlass...). Not recesses, frames or the chemical tanks' glass.
const WINDOW_MATERIAL = { test: (name) => /window|amber|glass/i.test(name) && !/recess|frame|sill|tank/i.test(name) };
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
// gotham_robber_8bit stands on the roof as a gang of three.
// gotham_robber_relay (models/everything-else) is a gang of four passing the money bag along the line.
const VILLAINS = ['gotham_joker', 'gotham_harley_quinn', 'gotham_penguin', 'gotham_poison_ivy', 'gotham_robber_relay'];
const GANG = 'gotham_robber_relay';
const VILLAIN_HEIGHT = meters(7.5); // well over life size, so they read from the zoomed-out city view

function syncRooftopVillain(account, root) {
  if (root.userData.villain && account.status === 'breached') return; // keep the one already up there
  if (root.userData.villain) { root.remove(root.userData.villain); root.userData.villain = null; }
  const villains = loadedBuildingModels?.villains;
  if (account.status !== 'breached' || !villains?.length) return;
  // Random, and no figure on two roofs at once. Once all are taken, extra roofs get another robber gang.
  const taken = new Set([...renderedBuildings.values()].map((other) => other.userData.villain?.userData.villainName));
  const free = villains.filter((model) => !taken.has(model.userData.villainName));
  const pick = free.length ? free[Math.floor(Math.random() * free.length)] : villains.find((model) => model.userData.villainName === GANG) ?? villains[0];
  const villain = villainFigure(pick);
  villain.userData.mixers = villain.userData.mixers ?? [];
  villain.userData.villainName = pick.userData.villainName;
  const roofSpot = findRoofSpot(root);
  // Joker is Y-up; Harley, Penguin and Ivy were exported with height along -Z like the props, so stand them up.
  const raw = new THREE.Box3().setFromObject(villain).getSize(new THREE.Vector3());
  villain.rotation.order = 'YXZ';
  // Face the isometric camera. Harley's and Ivy's exports face the other way, so they are turned round.
  const turn = ['gotham_harley_quinn', 'gotham_poison_ivy'].includes(villain.userData.villainName) ? Math.PI : 0;
  villain.rotation.set(raw.z > raw.y ? Math.PI / 2 : 0, Math.PI / 4 + turn, 0);
  // Villain height, but never wider than the roof (with a little overhang): the relay gang is a long line.
  villain.scale.setScalar(Math.min(VILLAIN_HEIGHT / Math.max(raw.y, raw.z), ACCOUNT_FOOTPRINT * 1.15 / raw.x));
  villain.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(villain);
  const center = bounds.getCenter(new THREE.Vector3());
  villain.position.set(roofSpot.x - center.x, roofSpot.y - bounds.min.y, roofSpot.z - center.z);
  villain.traverse((node) => { node.userData.accountId = account.id; });
  root.attach(villain); // keep world placement under the scaled building
  root.userData.villain = villain;
}

// A clone of a figure playing its idle loop (all its clips, minus the robber's walk and bag throw), from a random point
// so neighbours don't move in step. SkeletonUtils keeps the robber's skin bound to its own bones.
function villainFigure(source, mixers) {
  const figure = cloneSkinned(source);
  // A skinned mesh is culled by bounds taken once, in its rest pose; once the animation carries the body away from that
  // pose (the relay gang runs along its line) it was culled while still on screen, leaving only the money bag.
  figure.traverse((node) => { if (node.isSkinnedMesh) node.frustumCulled = false; });
  const mixer = new THREE.AnimationMixer(figure);
  (source.userData.clips ?? []).filter((clip) => !/walk|throw/i.test(clip.name)).forEach((clip) => {
    const action = mixer.clipAction(clip).play();
    action.time = Math.random() * clip.duration;
  });
  (mixers ?? (figure.userData.mixers = [])).push(mixer);
  return figure;
}

// Where a figure can stand: rays dropped on a grid over the middle of the building; the highest flat hit with flat
// neighbours at the same height (a real roof deck, not a spire tip, a flame or a hole into a ruin), nearest the middle.
// ponytail: 9x9 grid, fine at voxel scale; refine if a roof's only flat patch is narrower than a grid step.
const roofRay = new THREE.Raycaster();
function findRoofSpot(root) {
  const meshes = [];
  root.traverse((node) => { if (node.isMesh && node !== root.userData.villain && !node.parent?.name?.includes('status-beacon') && !/fire|flame|ember|smoke/i.test(`${node.name} ${node.material?.name}`)) meshes.push(node); });
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  meshes.forEach((mesh) => box.expandByObject(mesh));
  const center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  const N = 9, grid = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const x = center.x + (i / (N - 1) - 0.5) * size.x * 0.7, z = center.z + (j / (N - 1) - 0.5) * size.z * 0.7;
    roofRay.set(new THREE.Vector3(x, box.max.y + 1, z), new THREE.Vector3(0, -1, 0));
    const hit = roofRay.intersectObjects(meshes, false)[0];
    const flat = hit?.face && hit.face.normal.clone().transformDirection(hit.object.matrixWorld).y > 0.9;
    grid.push(flat ? { x, y: hit.point.y, z, i, j } : null);
  }
  const at = (i, j) => (i >= 0 && j >= 0 && i < N && j < N ? grid[i * N + j] : null);
  const deck = grid.filter((p) => p && [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([di, dj]) => Math.abs((at(p.i + di, p.j + dj)?.y ?? -1e9) - p.y) < 0.15).length >= 2);
  const dist = (p) => Math.hypot(p.x - center.x, p.z - center.z);
  const best = (deck.length ? deck : grid.filter(Boolean)).sort((a, b) => b.y - a.y || dist(a) - dist(b))[0];
  return best ?? { x: center.x, y: box.max.y, z: center.z };
}

// Smoke and sparks from a breached tower's fires, from the breached-tower look test (reference/breached-tower.js) scaled
// from meters to city units: dark puffs that rise, lean downwind, swell and fade, then respawn; bright embers spiralling
// up; a little flicker over each modelled fire. Lives on the tower's root, so it goes when the tower is rebuilt or cleared.
const breachSmokeTexture = softBlob('rgba(46,42,50,0.95)', 'rgba(26,24,30,0)');
const breachFlameTexture = softBlob('rgba(255,236,170,1)', 'rgba(255,90,20,0)');
function addBreachFire(root) {
  const k = UNITS_PER_METER;
  const building = root.children[0]; // the tower only, not its villain or beacon
  building.updateMatrixWorld(true);
  // Sources: the ruin's own modelled fires (FX_Account_NN_Fire_N meshes, one cluster per blown-out floor), in the root's
  // unscaled frame. A tower without them burns from the middle of its camera-facing corner.
  const clusters = new Map();
  building.traverse((node) => {
    const id = node.isMesh && /Fire_(\d+)/i.exec(node.name)?.[1];
    if (!id) return;
    if (!clusters.has(id)) clusters.set(id, new THREE.Box3());
    clusters.get(id).expandByObject(node);
  });
  const whole = new THREE.Box3().setFromObject(building), size = whole.getSize(new THREE.Vector3());
  const sources = clusters.size
    ? [...clusters.values()].map((box) => box.getCenter(new THREE.Vector3()).sub(root.position))
    : [new THREE.Vector3(whole.max.x - size.x * 0.3, whole.min.y + size.y * 0.55, whole.max.z - size.z * 0.3).sub(root.position)];
  const fire = new THREE.Group();
  fire.name = 'breach-fire';
  const random = seededRandom(Math.round(root.position.x * 13 + root.position.z * 7));
  const ignore = () => {};
  const flames = sources.flatMap((at) => Array.from({ length: 3 }, () => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: breachFlameTexture, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    sprite.userData.base = at.clone().add(new THREE.Vector3((random() - 0.5) * 0.8, (random() - 0.4) * 0.4, (random() - 0.5) * 0.8));
    sprite.userData.phase = random() * 10;
    sprite.raycast = ignore;
    fire.add(sprite);
    return sprite;
  }));
  const PUFFS = 14; // per source
  const smoke = sources.flatMap((at) => Array.from({ length: PUFFS }, (_, i) => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: breachSmokeTexture, depthWrite: false, transparent: true }));
    sprite.userData.at = at;
    sprite.userData.life = i / PUFFS;
    sprite.userData.drift = [(random() - 0.5) * 6, (random() - 0.5) * 6, 0.7 + random() * 0.6];
    sprite.raycast = ignore;
    fire.add(sprite);
    return sprite;
  }));
  const EMBERS = 24; // per source
  const emberCount = EMBERS * sources.length;
  const emberGeometry = new THREE.BufferGeometry();
  emberGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(emberCount * 3), 3));
  const embers = new THREE.Points(emberGeometry, new THREE.PointsMaterial({ color: '#ffb347', size: 3, sizeAttenuation: false, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  embers.raycast = ignore;
  embers.frustumCulled = false;
  fire.add(embers);
  const emberLife = Float32Array.from({ length: emberCount }, () => random());
  fire.userData.update = (t, dt) => {
    for (const sprite of flames) {
      const f = 0.75 + 0.35 * Math.sin(t * 11 + sprite.userData.phase) + 0.2 * Math.sin(t * 23 + sprite.userData.phase);
      sprite.scale.setScalar(1.1 * f);
      sprite.position.copy(sprite.userData.base).y += f * 0.35;
      sprite.material.opacity = 0.65 + 0.35 * f;
    }
    for (const sprite of smoke) {
      sprite.userData.life = (sprite.userData.life + dt * 0.07) % 1;
      const life = sprite.userData.life, at = sprite.userData.at;
      const [dx, dz, grow] = sprite.userData.drift;
      sprite.position.set(at.x + (life * 16 + dx * life + Math.sin(life * 9 + dx) * 1.5) * k, at.y + (1 + life * 30) * k, at.z + (-life * 6 + dz * life) * k);
      sprite.scale.setScalar((2.5 + life * 13) * grow * k);
      sprite.material.opacity = Math.min(1, life * 8) * (1 - life) * 0.85;
    }
    const positions = emberGeometry.attributes.position;
    for (let i = 0; i < emberCount; i++) {
      emberLife[i] = (emberLife[i] + dt * 0.25) % 1;
      const life = emberLife[i], at = sources[Math.floor(i / EMBERS)];
      positions.setXYZ(i, at.x + (Math.sin(i * 3.1 + life * 9) * 2 + life * 9) * k, at.y + life * 20 * k, at.z + Math.cos(i * 1.7 + life * 7) * 2 * k);
    }
    positions.needsUpdate = true;
  };
  root.add(fire);
  root.userData.fire = fire;
}

function applyBuildingState(account) {
  let root = renderedBuildings.get(account.id);
  if (!root) return;
  // Breached sites burn: swap between the intact tower and its destroyed variant when the status changes.
  const wanted = loadedBuildingModels && chooseBuildingModel(account, loadedBuildingModels);
  if (wanted && root.userData.source && wanted !== root.userData.source) {
    scene.remove(root);
    renderedBuildings.delete(account.id);
    addAccountBuilding(account, wanted); // calls back into applyBuildingState with the new root
    return;
  }
  syncRooftopVillain(account, root);
  if (account.status === 'breached' && !root.userData.fire) addBreachFire(root);
  if (account.status !== 'breached' && root.userData.fire) { root.remove(root.userData.fire); root.userData.fire = null; }
  const color = new THREE.Color(statusColors[account.status]);
  const beacon = root.userData.statusBeacon;
  if (beacon) beacon.visible = account.status !== 'breached'; // the rooftop villain marks a breach instead
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
  syncBatSignal();
  syncBreachedTowers();
  syncIncidents();
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

let activeDeckSlide = 0;
function deckSlideMarkup(index) {
  if (index === 0) {
    return `<p class="eyebrow">01 / THE LANDSCAPE</p><h1 id="deck-title">Breaches at <em>measured scale.</em></h1><p id="deck-description" class="deck-lede">Verizon's 2026 Data Breach Investigations Report analyzes real-world security incidents and confirmed breaches across 145 countries.</p><div class="deck-benefit-stats deck-evidence-stats"><div><span>SECURITY INCIDENTS ANALYZED</span><strong>31,000+</strong></div><div><span>CONFIRMED DATA BREACHES</span><strong>22,000+</strong></div><div><span>COUNTRIES REPRESENTED</span><strong>145</strong></div></div><p class="deck-source">Source: <a href="https://www.verizon.com/business/resources/executivebriefs/2026-dbir-executive-summary.pdf" target="_blank" rel="noopener noreferrer">Verizon 2026 DBIR Executive Summary</a> · reporting period Nov 1, 2024–Oct 31, 2025. Counts are reported as “more than”; the report dataset is not a census of all breaches.</p><div class="deck-callout"><b>WHY IT MATTERS</b><span>A headline tells us an organization was breached. People still need a clear way to find which of their own accounts appear in reported incidents—and what information was exposed.</span></div>`;
  }
  if (index === 1) return `<p class="eyebrow">02 / WHAT THE DATA SHOWS</p><h1 id="deck-title">Three risks. <em>Clear numbers.</em></h1><p id="deck-description" class="deck-lede">The latest Verizon report tracks how attackers get in, third-party exposure and patching delays.</p><div class="deck-reason-grid deck-stat-grid"><article><b>31%</b><h2>Vulnerability exploitation</h2><p>Now the leading known initial access vector for breaches; credential abuse fell to 13%.</p></article><article><b>48%</b><h2>Third-party involvement</h2><p>Share of breaches involving a third party, up 60% from the previous report.</p></article><article><b>26%</b><h2>Critical vulnerabilities fixed</h2><p>Only this share of CISA Known Exploited Vulnerabilities were fully remediated in 2025; the median time was 43 days.</p></article></div><p class="deck-source">Source: <a href="https://www.verizon.com/business/resources/executivebriefs/2026-dbir-executive-summary.pdf" target="_blank" rel="noopener noreferrer">Verizon 2026 DBIR Executive Summary</a>. The 31% is the share of known initial access vectors; 48% describes breach involvement; 26% refers to CISA KEV vulnerabilities.</p><div class="deck-quote">“A breach exists” is not enough context. People need to know which services, which exposed data, and what to do next.</div>`;
  if (index === 1) return `<p class="eyebrow">02 / WHAT THE DATA SHOWS</p><h1 id="deck-title">Three risks. <em>Clear numbers.</em></h1><p id="deck-description" class="deck-lede">The latest Verizon report tracks how attackers get in, third-party exposure and patching delays.</p><div class="deck-reason-grid deck-stat-grid"><article><b>31%</b><h2>Vulnerability exploitation</h2><p>Now the leading known initial access vector for breaches; credential abuse fell to 13%.</p></article><article><b>48%</b><h2>Third-party involvement</h2><p>Share of breaches involving a third party, up 60% from the previous report.</p></article><article><b>26%</b><h2>Critical vulnerabilities fixed</h2><p>Only this share of CISA Known Exploited Vulnerabilities were fully remediated in 2025; the median time was 43 days.</p></article></div><p class="deck-source">Source: <a href="https://www.verizon.com/business/resources/executivebriefs/2026-dbir-executive-summary.pdf" target="_blank" rel="noopener noreferrer">Verizon 2026 DBIR Executive Summary</a>. The 31% is the share of known initial access vectors; 48% describes breach involvement; 26% refers to CISA KEV vulnerabilities.</p><div class="deck-quote">“A breach exists” is not enough context. People need to know which services, which exposed data, and what to do next.</div>`;
  if (index === 2) return `<p class="eyebrow">03 / MAKING EXPOSURE LEGIBLE</p><h1 id="deck-title">A breach count is <em>not a headcount.</em></h1><p id="deck-description" class="deck-lede">Have I Been Pwned's public catalog shows the scale of published breach data—and why totals need context.</p><div class="deck-benefit-stats deck-evidence-stats"><div><span>BREACHES IN CATALOG</span><strong>1,047</strong></div><div><span>EXPOSED EMAIL ADDRESSES</span><strong>17.8B</strong></div><div><span>WHAT THE TOTAL COUNTS</span><strong>Records</strong></div></div><p class="deck-source">Source: <a href="https://haveibeenpwned.com/Pwnedwebsites/" target="_blank" rel="noopener noreferrer">Have I Been Pwned · Who's Been Pwned</a> catalog snapshot accessed Nov 14, 2026. Catalog totals change as breaches are added.</p><div class="deck-data-note"><span>READ THE MATCH CAREFULLY</span><p>Address counts are cumulative catalog counts, not unique people. A match identifies an address in a published incident; it does not prove current account access or that every listed data type is still at risk. No match is not a guarantee.</p></div>`;
  return `<p class="eyebrow">04 / WHY WE BUILT THIS</p><h1 id="deck-title">Breach news is everywhere. <em>Personal answers are not.</em></h1><p id="deck-description" class="deck-lede">A headline may name a company and a number of records. It rarely answers the questions a person has about their own accounts.</p><div class="deck-reason-grid"><article><b>01 / FIND THE SIGNAL</b><h2>Too much is scattered</h2><p>Exposure details live across breach notices, news stories and account alerts. People have to piece together what applies to them.</p></article><article><b>02 / MAKE IT PERSONAL</b><h2>A count is not a next step</h2><p>Knowing a breach happened does not show which of your accounts matched or what information appeared in the incident.</p></article><article><b>03 / ACT WITH CONTEXT</b><h2>Clarity should lead to action</h2><p>People need a readable account history, an honest explanation of uncertainty, and practical steps they can choose to take.</p></article></div><div class="deck-quote">We built BreachLink to turn scattered exposure records into a clear, personal view—so people can understand what happened and decide where to start.</div>`;
}
function renderDeck() {
  document.querySelector('#deck-content').innerHTML = deckSlideMarkup(activeDeckSlide);
  document.querySelector('#deck-counter').textContent = `${String(activeDeckSlide + 1).padStart(2, '0')} / 04`;
  document.querySelector('#deck-prev').disabled = activeDeckSlide === 0;
  document.querySelector('#deck-next').textContent = activeDeckSlide === 3 ? 'RESTART ↺' : 'NEXT →';
  const dots = document.querySelector('#deck-dots');
  dots.replaceChildren(...Array.from({ length: 4 }, (_, index) => {
    const dot = document.createElement('button'); dot.type = 'button'; dot.className = 'deck-dot';
    dot.setAttribute('aria-label', `Go to slide ${index + 1}`); dot.setAttribute('aria-current', index === activeDeckSlide ? 'step' : 'false');
    dot.addEventListener('click', () => { activeDeckSlide = index; renderDeck(); }); return dot;
  }));
}
function openDeck() {
  activeDeckSlide = 0; renderDeck();
  const deck = document.querySelector('#bat-deck'); deck.hidden = false; deck.setAttribute('aria-hidden', 'false');
  document.querySelector('#deck-close').focus();
}
function closeDeck() {
  const deck = document.querySelector('#bat-deck'); deck.hidden = true; deck.setAttribute('aria-hidden', 'true');
  document.querySelector('#bat-status').focus();
}
document.querySelector('#bat-status').addEventListener('click', openDeck);
document.querySelector('#nav-deck').addEventListener('click', openDeck);
document.querySelector('#deck-close').addEventListener('click', closeDeck);
document.querySelector('#deck-prev').addEventListener('click', () => { activeDeckSlide = Math.max(0, activeDeckSlide - 1); renderDeck(); });
document.querySelector('#deck-next').addEventListener('click', () => { activeDeckSlide = activeDeckSlide === 3 ? 0 : activeDeckSlide + 1; renderDeck(); });
document.querySelector('#bat-deck').addEventListener('click', event => { if (event.target.id === 'bat-deck') closeDeck(); });
document.addEventListener('keydown', event => {
  const deck = document.querySelector('#bat-deck');
  if (deck.hidden) return;
  if (event.key === 'Escape') { closeDeck(); return; }
  if (event.key === 'ArrowRight') { activeDeckSlide = activeDeckSlide === 3 ? 0 : activeDeckSlide + 1; renderDeck(); }
  if (event.key === 'ArrowLeft') { activeDeckSlide = Math.max(0, activeDeckSlide - 1); renderDeck(); }
  if (event.key === 'Tab') {
    const items = [...deck.querySelectorAll('button')].filter(item => item.getClientRects().length && !item.disabled);
    const first = items[0], last = items.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
});

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
    note: 'Completion is self-reported. BreachLink does not change your accounts or erase breach history. Progress is saved in this browser.',
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
      syncBatSignal();
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
  // Blackgate Penitentiary: its actual road and water approaches on South Hinkley.
  blackgate: () => {
    const cellAt = new Map(landCells.map((cell) => [`${cell.row},${cell.col}`, cell]));
    const access = bridgeSpans.flatMap(([[r1, c1], [r2, c2], style]) => {
      const a = cellAt.get(`${r1},${c1}`), b = cellAt.get(`${r2},${c2}`);
      const island = [a, b].find((cell) => cell?.island === 'South Hinkley');
      if (!island) return [];
      const mainland = island === a ? b : a;
      return [[`${mainland.district} bridge`, `${mainland.island} ↔ South Hinkley · ${style} span`, 'ROAD ACCESS', 'clear']];
    });
    const localCraft = SHIPS.filter((ship) => ship.file.includes('blackgate'));
    const craftRows = localCraft.map((ship) => [
      ship.file.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
      `Blackgate cove · ${ship.mode === 'moored' ? 'moored' : 'drifting'}`,
      'WATERCRAFT', 'unknown',
    ]);
    openPhone({
      eyebrow: 'BLACKGATE · ISLAND ACCESS',
      title: 'South Hinkley approaches',
      subtitle: 'Road and cove access shown in the authored city map',
      cards: [['ROAD APPROACHES', access.length, 'clear'], ['LOCAL CRAFT', localCraft.length, 'total']],
      listTitle: 'ACCESS POINTS',
      rows: [...access, ...craftRows],
      note: 'The map has one bridge approach to South Hinkley. The listed skiff and rowboat are scene placements, not live port tracking.',
      focus: landmarkBlock('Blackgate Penitentiary'),
      mood: 'normal',
    });
  },
  wayne: () => {
    const districtCount = new Map(islands.map((region) => [region.name, new Set(blocks.filter((block) => block.island === region.name).map((block) => block.district)).size]));
    openPhone({
      eyebrow: 'WAYNE TOWER · CITY PLANNING',
      title: 'Gotham city atlas',
      subtitle: 'A census of the map layout, independent of account checks',
      cards: [['NEIGHBORHOODS', new Set(blocks.map((block) => block.district)).size, 'total'], ['LAND CELLS', landCells.length, 'clear'], ['BRIDGES', bridges.length, 'unknown']],
      listTitle: 'REGIONS',
      rows: islands.map((region) => [region.name, `${region.cells.length} map cells · ${districtCount.get(region.name) || 0} named districts`, 'MAP', 'clear']),
      note: 'Counts are computed from Gotham’s authored map plan. A map cell is a layout unit, not a resident or population estimate.',
      focus: landmarkBlock('Wayne Tower'),
      mood: 'normal',
    });
  },
  arkham: () => {
    openPhone({
      eyebrow: 'ARKHAM ASYLUM · BREACH READING ROOM',
      title: 'What a breach match means',
      subtitle: 'How to interpret a result before deciding what to do',
      cards: [['PASSWORDS STORED', 'NONE', 'clear'], ['INTERPRETATION NOTES', 3, 'total']],
      listTitle: 'READ THE RESULT',
      rows: [
        ['A match links an email to a source', 'It does not prove the account is still active or currently accessible.', 'MEANING', 'breached'],
        ['A match does not reveal your current password', 'This app does not collect, test, or store account passwords.', 'PRIVACY', 'clear'],
        ['No match is limited to the source checked', 'It cannot guarantee an address or service has never been exposed.', 'LIMIT', 'unknown'],
      ],
      note: 'These notes explain the limits of breach lookups; they are not a second account or breach list.',
      focus: blocks[landmarks.find(l => l.name === 'Arkham Asylum').block],
      mood: 'normal',
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
  if (!account) { renderDirectory(); return; } // e.g. a check that found no websites: still clear the list
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
    sendBatman(slot.x, slot.z);
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
    const data = await checkerJson(response);
    if (!response.ok) throw new Error(data.error || 'Could not send a code.');
    verifiedEmail = email;
    setVerificationStep(true);
    error.textContent = data.sent === 'email' ? 'Code sent. Check your email.' : 'Code generated. Check the checker service console.';
  } catch (problem) { error.textContent = problem instanceof TypeError ? 'The checker service is not reachable right now. Try a demo address, or try again shortly.' : problem.message || 'Checker service is unavailable.'; }
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
      const data = await checkerJson(response);
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
  // Websites come from the breach lookup and, after Google sign-in, the inbox scan. With neither there are no websites to
  // build, so no placeholder posing as one; an unavailable check keeps its masked identity as one unknown city entry.
  const entries = result.accounts.length ? result.accounts : result.status === 'unknown' ? [{ name: result.label, domain: '', breached: false, breaches: [], foundIn: [], firstSeen: null }] : [];
  placementOrder = landmarkSlotOrder();
  // Taller towers go behind shorter ones: take the plots the scatter picked, then give the oldest (tallest) sites the plots
  // furthest from the camera (smallest x + z) and the newest the ones in front.
  const picked = placementOrder.slice(0, entries.length).sort((a, b) => slots[a].x + slots[a].z - (slots[b].x + slots[b].z));
  const byAge = entries.map((entry, index) => ({ index, seen: Date.parse(entry.firstSeen) || Infinity })).sort((a, b) => a.seen - b.seen);
  const plotFor = new Map(byAge.map(({ index }, rank) => [index, picked[rank]]));
  const next = entries.map((entry, index) => {
    const citySlot = plotFor.get(index) ?? -1;
    const related = (result.breaches || []).filter((breach) => entry.breaches?.includes(breach.name));
    return { id: `${result.id}-${index}`, name: entry.name, domain: entry.domain, label: result.label, district: citySlot >= 0 ? slots[citySlot].district : 'Beyond city plots', status: result.status === 'unknown' && !entry.domain ? 'unknown' : entry.breached ? 'breached' : 'clear', slot: citySlot, checkedAt: stamp, source: result.source, breaches: related.length ? related : (entry.breaches || []).map((name) => ({ name, date: 'Date unavailable', exposedData: [] })), foundIn: entry.foundIn || [], firstSeen: entry.firstSeen, error: result.error, serviceBreaches: entry.serviceBreaches || [] };
  });
  accounts.splice(0, accounts.length, ...next.map(ageBreaches));
  accountsById.clear(); renderedBuildings.forEach((root) => scene.remove(root)); renderedBuildings.clear(); slotOccupants.clear();
  accounts.forEach((account) => { accountsById.set(account.id, account); if (account.slot >= 0) slotOccupants.set(account.slot, account.id); });
  selectedId = accounts[0]?.id ?? null;
  if (loadedBuildingModels) accounts.filter((account) => account.slot >= 0).forEach((account) => {
    const model = chooseBuildingModel(account, loadedBuildingModels);
    addAccountBuilding(account, model, buildingScale(model, loadedBuildingModels));
  });
  syncPlotParks();
  renderOverview(); renderDetails();
  const serviceStatus = document.querySelector('#service-status');
  if (serviceStatus) serviceStatus.textContent = result.source.startsWith('Demo') ? 'OFFLINE DEMO' : result.status === 'unknown' ? 'CHECK UNAVAILABLE' : 'ACCOUNT VERIFIED';
  showToast(result.status === 'unknown' ? (result.error || 'Check unavailable')
    : accounts.length ? `Check complete · ${accounts.length} accounts`
    : 'No breaches for this email. Sign in with Google to scan your inbox for the websites you use.');
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
  const titles = { accounts: 'Account directory', inbox: 'Inbox scan', timeline: 'Breach timeline', history: 'Your breach history' };
  const site = accountsById.get(selectedId);
  document.querySelectorAll('.nav-link[data-view]').forEach((node) => node.classList.toggle('is-active', node.dataset.view === view));
  if (view === 'overview') { drawer.hidden = true; return; }
  drawer.hidden = false;
  content.innerHTML = `<p class="eyebrow">BREACHLINK / DATA DESK</p><h2>${titles[view]}</h2><p class="drawer-summary">${view === 'accounts' ? `${accounts.length} services in this account check.` : view === 'history' ? `Every breach that included your email, across all your websites, newest first. Breaches from the last ${RECENT_BREACH_MONTHS} months still mark a site as breached in the city.` : view === 'inbox' ? 'Services found in welcome and account notification headers.' : site ? `Every known breach of ${escapeHtml(site.name)}, newest first, from the Tiger Data breach catalog. Breaches that included your email are marked.` : 'Select a website in the city or the account directory to see its breach timeline.'}</p><div id="feature-results" class="feature-results"><p class="drawer-empty">Loading account data…</p></div>`;
  const results = document.querySelector('#feature-results');
  if (view === 'accounts') {
    results.innerHTML = accounts.length ? `<div class="feature-table"><div class="feature-table-head"><span>SERVICE</span><span>STATUS</span><span>SOURCE</span></div>${accounts.map((a) => `<button class="feature-table-row" type="button" data-account="${escapeHtml(a.id)}"><span><strong>${escapeHtml(a.name)}</strong><small>${escapeHtml(a.domain || a.label)}</small></span><b class="status-${a.status}">${accountBadge(a)}</b><small>${escapeHtml((a.foundIn || []).join(' + ') || a.source)}</small></button>`).join('')}</div>` : '<p class="drawer-empty">Run a check to populate the account directory.</p>';
    results.querySelectorAll('[data-account]').forEach((row) => row.addEventListener('click', () => { selectAccount(row.dataset.account); drawer.hidden = true; }));
  } else if (view === 'history') {
    const old = accounts.flatMap((a) => [...(a.breaches || []).map((breach) => ({ a, breach, current: true })), ...(a.historical || []).map((breach) => ({ a, breach, current: false }))])
      .sort((x, y) => String(y.breach.date).localeCompare(String(x.breach.date)));
    results.innerHTML = old.length ? `<div class="feature-table"><div class="feature-table-head"><span>SERVICE</span><span>BREACH</span><span>DATE</span></div>${old.map(({ a, breach, current }) => `<button class="feature-table-row" type="button" data-account="${escapeHtml(a.id)}"><span><strong>${escapeHtml(a.name)}</strong><small>${escapeHtml((breach.exposedData || []).join(', ') || a.domain || a.label)}</small></span><b>${escapeHtml(breach.name)}</b><small>${escapeHtml(breach.date || 'Date unavailable')}<br><span class="${current ? 'status-breached' : 'status-clear'}">${current ? 'CURRENT' : 'PAST'}</span></small></button>`).join('')}</div>` : '<p class="drawer-empty">No known breach included your email in this source. That only covers publicly reported breaches.</p>';
    results.querySelectorAll('[data-account]').forEach((row) => row.addEventListener('click', () => { selectAccount(row.dataset.account); showAccountReport(row.dataset.account); drawer.hidden = true; }));
  } else if (view === 'inbox') {
    const inboxAccounts = accounts.filter((a) => a.foundIn?.includes('inbox'));
    results.innerHTML = inboxAccounts.length ? `<div class="feature-table"><div class="feature-table-head"><span>SERVICE</span><span>FOUND</span><span>FIRST SEEN</span></div>${inboxAccounts.map((a) => `<div class="feature-table-row"><span><strong>${escapeHtml(a.name)}</strong><small>${escapeHtml(a.domain)}</small></span><b>${a.status === 'breached' ? 'INBOX + BREACH' : 'INBOX'}</b><small>${escapeHtml(a.firstSeen || 'Date unavailable')}</small></div>`).join('')}</div>` : `<p class="drawer-empty">${currentCheck ? 'No inbox data in this check. Sign in with Google and grant inbox access to scan your account.' : 'Run a check or sign in with Google to see services found in your inbox.'}</p>`;
  } else if (view === 'timeline') {
    // The selected website's breach history: every known breach of the service (the check's serviceBreaches, from Tiger
    // Data or the checker's catalog) merged with the breaches that included this user's email, newest first.
    if (!site) { results.innerHTML = '<p class="drawer-empty">No website selected. Click a building in the city or a row in Accounts.</p>'; return; }
    const mine = [...(site.breaches || []), ...(site.historical || [])];
    const mineNames = new Set(mine.map((breach) => breach.name));
    const rows = [...mine];
    for (const breach of site.serviceBreaches || []) if (!mineNames.has(breach.name)) rows.push(breach);
    rows.sort((x, y) => String(y.date).localeCompare(String(x.date)));
    results.innerHTML = rows.length ? `<div class="timeline-list">${rows.map((breach) => {
      const yours = mineNames.has(breach.name);
      const year = /^\d{4}/.test(String(breach.date)) ? String(breach.date).slice(0, 4) : '—';
      const records = Number(breach.records) > 0 ? `${Number(breach.records).toLocaleString()} records` : '';
      return `<article class="timeline-row"><strong>${escapeHtml(year)}</strong><span><b>${escapeHtml(breach.name)}</b><br>${escapeHtml(breach.date || '')}${records ? ` · ${records}` : ''}<br>${escapeHtml((breach.exposedData || []).join(', '))}</span><span class="${yours ? 'status-breached' : 'status-unknown'}">${yours ? 'INCLUDED YOUR EMAIL' : 'SERVICE BREACH'}</span></article>`;
    }).join('')}</div>` : `<p class="drawer-empty">No known breaches of ${escapeHtml(site.name)} in this source. That isn't a guarantee: it only covers publicly reported breaches.</p>`;
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
    if (name === 'Elliot Memorial') return;
    if (name === 'Wayne Manor') { batmanHome(); return; }
    const key = { 'Wayne Tower': 'wayne', 'Ace Chemicals': 'ace', 'Arkham Asylum': 'arkham', 'Gotham Bank': 'bank', 'GCPD Headquarters': 'gcpd', 'Cobblepot Manor': 'cobblepot', 'Blackgate Penitentiary': 'blackgate' }[name];
    if (!key) return;
    const box = new THREE.Box3().setFromObject(node);
    sendBatman((box.min.x + box.max.x) / 2, (box.min.z + box.max.z) / 2);
    landmarkReports[key]();
  }
});

// The Landmarks menu (nav): every landmark that opens something, with a one-line TL;DR. Choosing one does exactly what
// clicking the building does: Batman heads over and its report opens.
const LANDMARK_MENU = [
  ['GCPD Headquarters', 'gcpd', 'Mission board: prioritized fixes for your breached sites, with links and progress.'],
  ['Ace Chemicals', 'ace', 'Spill report: what data leaked across all your breached sites.'],
  ['Gotham Bank', 'bank', 'Account vault: every site linked to your email, by when you joined.'],
  ['Cobblepot Manor', 'cobblepot', 'Breach news: the latest publicly reported breaches.'],
  ['Arkham Asylum', 'arkham', 'Reading room: what a breach match does and doesn\'t mean.'],
  ['Wayne Tower', 'wayne', 'City atlas: a census of the map, independent of your check.'],
];
const landmarkButton = document.querySelector('#nav-landmarks');
const landmarkMenu = document.createElement('div');
landmarkMenu.id = 'landmark-menu';
landmarkMenu.className = 'landmark-menu';
landmarkMenu.setAttribute('role', 'menu');
landmarkMenu.setAttribute('aria-label', 'Landmarks');
landmarkMenu.hidden = true;
landmarkMenu.innerHTML = LANDMARK_MENU.map(([name, key, tldr]) => `<button type="button" role="menuitem" data-landmark="${key}"><strong>${escapeHtml(name)}</strong><span>${escapeHtml(tldr)}</span></button>`).join('');
document.body.append(landmarkMenu);
function toggleLandmarkMenu(open = landmarkMenu.hidden) {
  landmarkMenu.hidden = !open;
  landmarkButton?.setAttribute('aria-expanded', String(open));
  if (!open) return;
  // Below the button, or above it when the nav sits at the bottom of the screen (phones); kept on screen.
  const r = landmarkButton.getBoundingClientRect(), width = landmarkMenu.offsetWidth, height = landmarkMenu.offsetHeight;
  landmarkMenu.style.left = `${Math.max(10, Math.min(r.left, innerWidth - width - 10))}px`;
  landmarkMenu.style.top = `${r.bottom + height + 8 > innerHeight ? Math.max(10, r.top - height - 8) : r.bottom + 8}px`;
  landmarkMenu.querySelector('button')?.focus();
}
landmarkButton?.addEventListener('click', (event) => { event.stopPropagation(); toggleLandmarkMenu(); });
landmarkMenu.addEventListener('click', (event) => {
  const item = event.target.closest('[data-landmark]');
  if (!item) return;
  const [name, key] = LANDMARK_MENU.find(([, k]) => k === item.dataset.landmark);
  toggleLandmarkMenu(false);
  const root = landmarkRoots.find((r) => r.userData.landmark === name);
  if (root) { const box = new THREE.Box3().setFromObject(root); sendBatman((box.min.x + box.max.x) / 2, (box.min.z + box.max.z) / 2); }
  landmarkReports[key]();
});
document.addEventListener('click', (event) => { if (!landmarkMenu.hidden && !landmarkMenu.contains(event.target)) toggleLandmarkMenu(false); });
document.addEventListener('keydown', (event) => {
  if (landmarkMenu.hidden) return;
  if (event.key === 'Escape') { toggleLandmarkMenu(false); landmarkButton.focus(); return; }
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  event.preventDefault(); // arrow keys move between items
  const items = [...landmarkMenu.querySelectorAll('button')], at = items.indexOf(document.activeElement);
  items[(at + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
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

const buildingClock = new THREE.Clock();
function animate() {
  if (shadowFrame++ % SHADOW_REFRESH === 0) renderer.shadowMap.needsUpdate = true;
  const delta = buildingClock.getDelta();
  const now = performance.now() / 1000;
  renderedBuildings.forEach((root) => { root.userData.mixer?.update(delta); root.userData.villain?.userData.mixers.forEach((mixer) => mixer.update(delta)); root.userData.fire?.userData.update(now, Math.min(delta, 0.05)); });
  updateSirens(now);
  city.update(performance.now() / 1000);
  updateShips(performance.now() / 1000);
  updateBatRun(performance.now() / 1000);
  updatePedestrians(performance.now() / 1000);
  updateTraffic(performance.now() / 1000);
  updateBlimp(performance.now() / 1000);
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
renderOverview();
renderDetails();
animate();

export { scene, camera, controls, renderer, accounts, renderedBuildings, landmarkRoots, installCheck, resetDemo, showMissionBoard };
