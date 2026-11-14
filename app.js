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

const slots = [
  { x: -12, z: -12, district: 'Northpoint' }, { x: 0, z: -12, district: 'Old Gotham' }, { x: 12, z: -12, district: 'Crown Point' },
  { x: -12, z: 0, district: 'The Foundry' }, { x: 0, z: 0, district: 'Civic Center' }, { x: 12, z: 0, district: 'The Narrows' },
  { x: -12, z: 12, district: 'Harbor Ward' }, { x: 0, z: 12, district: 'Market Square' }, { x: 12, z: 12, district: 'East Channel' },
];
const statusText = { clear: 'No known match in this source', breached: 'Known breach match', unknown: 'Check unavailable' };
const statusColors = { clear: 0x83bc9b, breached: 0xe58268, unknown: 0xd2b56b };
const sceneHost = document.querySelector('#city-scene');
const accountsById = new Map(accounts.map((account) => [account.id, account]));
const renderedBuildings = new Map();
const slotOccupants = new Map();
accounts.forEach((account) => slotOccupants.set(account.slot, account.id));
let selectedId = accounts[0].id;
let nextId = 7;
let toastTimer;
const landmarkSlots = new Set([7]);

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
controls.maxZoom = 1.55;
controls.minPolarAngle = 0.36;
controls.maxPolarAngle = Math.PI / 2.15;
controls.target.set(0, 0, 0);
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
  ['Gotham_Fire_Hydrant', -Math.PI / 2],
  ['Gotham_Large_Tree', -Math.PI / 2],
  ['Gotham_Stoplight', -Math.PI / 2],
  ['Gotham_Street_Tree', -Math.PI / 2],
  // The lamp GLB has a baked -90° node rotation that tips its Y-up shaft onto its side.
  ['Lamp square shaft', Math.PI / 2],
]);

function addPlacedModel(source, position, scale = 1, rotationY = 0) {
  const root = source.clone(true);
  root.scale.setScalar(scale);
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

async function addCityProps(environment) {
  const names = ['gotham_bushes', 'gotham_crosswalk', 'gotham_fire_hydrant', 'gotham_lamppost', 'gotham_large_tree', 'gotham_stoplight', 'gotham_street_tree'];
  const loaded = await Promise.all(names.map(async (name) => {
    try { return [name, await loadModel(`./models/everything-else/${name}.glb`)]; }
    catch (error) { console.warn(`Could not load ${name}:`, error); return [name, null]; }
  }));
  const props = Object.fromEntries(loaded);
  const placeMany = (name, placements, groundY = 0.23) => {
    const source = props[name];
    if (!source) return false;
    placements.forEach(([x, z, scale = 1, rotation = 0]) => addPlacedModel(source, [x, groundY, z], scale, rotation));
    return true;
  };
  const crossings = [];
  const signals = [];
  for (const x of [-6, 6]) for (const z of [-6, 6]) {
    for (const side of [-1, 1]) crossings.push([x, z + side * 1.55, 0.72, 0], [x + side * 1.55, z, 0.72, Math.PI / 2]);
    signals.push([x - 2.15, z - 2.15, 0.62, 0], [x + 2.15, z + 2.15, 0.62, Math.PI]);
  }
  placeMany('gotham_crosswalk', crossings, 0.06);
  placeMany('gotham_stoplight', signals);
  placeMany('gotham_lamppost', [[-7.25,-17],[-7.25,-1],[-7.25,15],[7.25,-15],[7.25,1],[7.25,17]].map(([x,z]) => [x,z,0.72,x > 0 ? Math.PI : 0]));
  placeMany('gotham_fire_hydrant', [[-8.1,-8],[-3.9,8],[3.9,-8],[8.1,8],[-8.1,16],[8.1,-16]].map(([x,z]) => [x,z,0.5,0]));
  if (props.gotham_street_tree) {
    removeProceduralParkTrees(environment);
    placeMany('gotham_street_tree', [[10.25,10.35,0.7],[13.75,10.35,0.7],[10.25,13.65,0.7],[13.75,13.65,0.7]]);
  }
  placeMany('gotham_bushes', [[12,9.55,0.68],[12,14.45,0.68,Math.PI]]);
  placeMany('gotham_large_tree', [[19,-18,0.42,0],[19,18,0.42,Math.PI / 2]]);
}

let environmentReady = false;
let accountModelsReady = false;
let loadedBuildingModels = null;
function finishInitialLoad() {
  if (!environmentReady || !accountModelsReady) return;
  document.querySelector('#loading-overlay').classList.add('is-hidden');
  document.querySelector('#loading-overlay small').textContent = 'Buildings and street models ready';
}

environmentLoader.load('./models/everything-else/gotham_ward_environment.glb', async (gltf) => {
  gltf.scene.name = 'Gotham Ward Blender environment';
  gltf.scene.traverse((node) => { if (node.isMesh) { node.receiveShadow = true; node.castShadow = true; } });
  scene.add(gltf.scene);
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
  loadedBuildingModels = models;
  accounts.forEach((account) => {
    if (account.slot < 0) return;
    if (renderedBuildings.has(account.id)) return;
    const model = chooseBuildingModel(account, models);
    addAccountBuilding(account, model, buildingScale(model, models));
  });
  if (models.arkham) addPlacedModel(models.arkham, [0, 0.23, 12], 0.54, 0);
  accountModelsReady = true;
  finishInitialLoad();
}, undefined, (error) => {
  console.error('Could not load Blender account building:', error);
  accounts.forEach((account) => { if (account.slot >= 0) showToast('A Blender building model could not be loaded.'); });
  accountModelsReady = true;
  finishInitialLoad();
});

function chooseBuildingModel(account, models) {
  // The account ID is stable for a login, so its Blender building style stays consistent.
  const styles = [models.generic, models.wayne, models.ace].filter(Boolean);
  if (!styles.length) return null;
  let hash = 2166136261;
  for (const character of account.id) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return styles[(hash >>> 0) % styles.length];
}

function buildingScale(model, models) {
  // Preserve the factory's smaller footprint while doubling its original in-map scale.
  return model === models.ace ? 0.44 : 2;
}

function addAccountBuilding(account, source, scale = 2) {
  if (!source) return;
  const root = source.clone(true);
  root.name = `account-${account.id}`;
  // Blender assets face the ward's common street frontage; keep that axis aligned to the grid.
  root.rotation.y = 0;
  root.scale.setScalar(scale);
  cloneInstanceMaterials(root);
  const slot = slots[account.slot];
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  const center = bounds.getCenter(new THREE.Vector3());
  const height = bounds.max.y - bounds.min.y;
  root.position.set(slot.x - center.x, 0.23 - bounds.min.y, slot.z - center.z);
  root.userData.accountId = account.id;
  root.traverse((node) => { node.userData.accountId = account.id; if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; } });
  scene.add(root);
  addStatusBeacon(root, account.status, height);
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

function applyBuildingState(account) {
  const root = renderedBuildings.get(account.id);
  if (!root) return;
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
    row.innerHTML = `<button type="button" class="account-row${account.id === selectedId ? ' is-selected' : ''}" data-id="${account.id}" aria-pressed="${account.id === selectedId}"><span class="row-glyph" aria-hidden="true">Ã¢Å’â€š</span><span class="row-copy"><strong>${escapeHtml(account.name)}</strong><small>${escapeHtml(account.district)} Ã‚Â· ${escapeHtml(account.label)}</small></span><i class="row-status status-${account.status}" aria-label="${account.status}"></i></button>`;
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
  document.querySelector('#last-check').textContent = `TODAY Ã‚Â· ${accounts.find((account) => account.checkedAt)?.checkedAt ?? 'NOT CHECKED'}`;
}

function showCityStats(accountId) {
  const slot = slots[accountsById.get(accountId)?.slot ?? 0];
  const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  cameraRight.y = 0;
  cameraRight.normalize();
  const leftComposition = window.innerWidth <= 560 ? 0.38 : window.innerWidth <= 760 ? 0.36 : 0.13;
  const panOffset = (camera.right - camera.left) / camera.zoom * leftComposition;
  focusCamera(slot.x + cameraRight.x * panOffset, 1, slot.z + cameraRight.z * panOffset);

  const counts = {
    clear: accounts.filter((account) => account.status === 'clear').length,
    breached: accounts.filter((account) => account.status === 'breached').length,
    unknown: accounts.filter((account) => account.status === 'unknown').length,
  };
  const account = accountsById.get(accountId);
  const total = accounts.length;
  const cards = document.querySelector('#city-stats-cards');
  cards.replaceChildren();
  [
    ['ACCOUNTS MONITORED', total, 'total'],
    ['NO MATCH', counts.clear, 'clear'],
    ['BREACH', counts.breached, 'breached'],
    ['UNAVAILABLE', counts.unknown, 'unknown'],
  ].forEach(([label, count, kind]) => {
    const card = document.createElement('div');
    card.className = `city-stats-card city-stats-${kind}`;
    const caption = document.createElement('span');
    caption.textContent = label;
    const value = document.createElement('strong');
    value.textContent = String(count).padStart(2, '0');
    card.append(caption, value);
    cards.append(card);
  });

  const bar = document.querySelector('#city-stats-bar');
  bar.replaceChildren();
  bar.setAttribute('aria-label', `${counts.clear} clear, ${counts.breached} breached, ${counts.unknown} unavailable`);
  ['clear', 'breached', 'unknown'].forEach((status) => {
    const segment = document.createElement('span');
    segment.className = `city-stats-segment status-${status}`;
    segment.style.width = `${total ? counts[status] / total * 100 : 0}%`;
    bar.append(segment);
  });

  const list = document.querySelector('#city-stats-list');
  list.replaceChildren();
  accounts.forEach((entry) => {
    const row = document.createElement('li');
    row.className = `city-stats-row status-${entry.status}`;
    const identity = document.createElement('span');
    identity.className = 'city-stats-identity';
    const name = document.createElement('strong');
    name.textContent = entry.name;
    const district = document.createElement('small');
    district.textContent = entry.district;
    identity.append(name, district);
    const status = document.createElement('span');
    status.className = 'city-stats-status';
    status.textContent = entry.status === 'clear' ? 'NO MATCH' : entry.status === 'breached' ? 'BREACH' : 'UNAVAILABLE';
    row.append(identity, status);
    list.append(row);
  });

  document.querySelector('#city-stats-title').textContent = 'Account overview';
  document.querySelector('#city-stats-subtitle').textContent = account ? `Ward-wide overview Ã‚Â· opened from ${account.name}` : 'All monitored accounts';
  document.querySelector('#city-stats-list-total').textContent = `${total} TOTAL`;
  document.querySelector('#city-stats').hidden = false;
  document.querySelector('#city-stats-close').focus();
}

function closeCityStats() {
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
  document.querySelector('#report-id').textContent = account.id.toUpperCase().replace('-', 'Ã¢â‚¬â€');
  document.querySelector('#detail-name').textContent = account.name;
  document.querySelector('#detail-label').textContent = account.label;
  document.querySelector('#detail-source').textContent = account.source;
  document.querySelector('#detail-checked').textContent = account.checkedAt ?? 'Not checked';
  const statusNode = document.querySelector('#detail-status');
  statusNode.className = `report-status status-${account.status}`;
  statusNode.innerHTML = `<span class="status-symbol">${account.status === 'clear' ? 'Ã¢Å“â€œ' : account.status === 'breached' ? '!' : '?'}</span><span>${statusText[account.status]}</span>`;
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
    focusCamera(slot.x, 1, slot.z);
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
    applyBuildingState(account);
  });
  renderOverview();
  renderDetails();
  showToast('Demo checks complete Ã‚Â· fixture data');
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
  accounts.splice(0, accounts.length, ...next);
  accountsById.clear(); renderedBuildings.forEach((root) => scene.remove(root)); renderedBuildings.clear(); slotOccupants.clear();
  accounts.forEach((account) => { accountsById.set(account.id, account); if (account.slot >= 0) slotOccupants.set(account.slot, account.id); });
  selectedId = accounts[0].id;
  if (loadedBuildingModels) accounts.filter((account) => account.slot >= 0).forEach((account) => {
    const model = chooseBuildingModel(account, loadedBuildingModels);
    addAccountBuilding(account, model, buildingScale(model, loadedBuildingModels));
  });
  renderOverview(); renderDetails();
  document.querySelector('#service-status').textContent = result.source.startsWith('Demo') ? 'OFFLINE DEMO' : result.status === 'unknown' ? 'CHECK UNAVAILABLE' : 'ACCOUNT VERIFIED';
  showToast(result.status === 'unknown' ? (result.error || 'Check unavailable') : `Check complete Ã‚Â· ${accounts.length} accounts`);
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
  const account = { id: `bc-${String(nextId++).padStart(3, '0')}`, name: domain.split('.')[0].replace(/[-_]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()), label: `${local.slice(0, 1)}***@${domain}`, district: slots[slot].district, status: 'unknown', slot, checkedAt: null, source: 'Not checked', breaches: [], error: 'Run checks to see the demo result.' };
  accounts.push(account);
  accountsById.set(account.id, account);
  if (loadedBuildingModels) {
    const model = chooseBuildingModel(account, loadedBuildingModels);
    addAccountBuilding(account, model, buildingScale(model, loadedBuildingModels));
  }
  selectAccount(account.id);
  renderOverview();
  showToast('Account added to the local demo.');
}

function showFeature(view) {
  const drawer = document.querySelector('#feature-drawer');
  const content = document.querySelector('#feature-content');
  const titles = { accounts: 'Account directory', inbox: 'Inbox scan', timeline: 'Breach timeline' };
  document.querySelectorAll('.nav-link[data-view]').forEach((node) => node.classList.toggle('is-active', node.dataset.view === view));
  if (view === 'overview') { drawer.hidden = true; return; }
  drawer.hidden = false;
  content.innerHTML = `<p class="eyebrow">BREACH CITY / DATA DESK</p><h2>${titles[view]}</h2><p class="drawer-summary">${view === 'accounts' ? `${accounts.length} services in this account check.` : view === 'inbox' ? 'Services found in welcome and account notification headers.' : 'Public breach activity by year from the Tiger Data catalog.'}</p><div id="feature-results" class="feature-results"><p class="drawer-empty">${view === 'timeline' ? 'Loading public timelineÃ¢â‚¬Â¦' : 'Loading account dataÃ¢â‚¬Â¦'}</p></div>`;
  const results = document.querySelector('#feature-results');
  if (view === 'accounts') {
    results.innerHTML = accounts.length ? `<div class="feature-table"><div class="feature-table-head"><span>SERVICE</span><span>STATUS</span><span>SOURCE</span></div>${accounts.map((a) => `<button class="feature-table-row" type="button" data-account="${escapeHtml(a.id)}"><span><strong>${escapeHtml(a.name)}</strong><small>${escapeHtml(a.domain || a.label)}</small></span><b class="status-${a.status}">${a.status === 'clear' ? 'NO MATCH' : a.status.toUpperCase()}</b><small>${escapeHtml((a.foundIn || []).join(' + ') || a.source)}</small></button>`).join('')}</div>` : '<p class="drawer-empty">Run a check to populate the account directory.</p>';
    results.querySelectorAll('[data-account]').forEach((row) => row.addEventListener('click', () => { selectAccount(row.dataset.account); drawer.hidden = true; }));
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
  focusCamera(0, 0, 0, 850, new THREE.Vector3(25, 24, 25), 1);
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
  const hits = raycaster.intersectObjects([...renderedBuildings.values()], true);
  const id = hits.map((hit) => {
    let node = hit.object;
    while (node && !node.userData.accountId) node = node.parent;
    return node?.userData.accountId;
  }).find(Boolean);
  if (id) {
    selectAccount(id);
    showCityStats(id);
  }
});

function resizeScene() {
  const width = sceneHost.clientWidth;
  const height = sceneHost.clientHeight;
  if (!width || !height) return;
  const aspect = width / height;
  const viewHeight = 34;
  camera.left = -viewHeight * aspect / 2;
  camera.right = viewHeight * aspect / 2;
  camera.top = viewHeight / 2;
  camera.bottom = -viewHeight / 2;
  camera.position.set(24, 24, 25);
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
