// Look test for a "breached" website tower: blown-out floors with fire inside, smoke, embers, scorching, dead windows
// and rubble, next to the untouched tower. Everything is code on top of Daniel's GLB; nothing here is used by the app yet.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const renderer = new THREE.WebGLRenderer({ antialias: false });
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#07080c');
scene.fog = new THREE.Fog('#07080c', 120, 260);
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 600);
camera.position.set(70, 52, 92);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 22, 0);
controls.enableDamping = true;

scene.add(new THREE.HemisphereLight('#7d8cb8', '#120c10', 0.9));
const moon = new THREE.DirectionalLight('#b8c6ff', 1.1);
moon.position.set(-30, 60, 40);
scene.add(moon);
const ground = new THREE.Mesh(new THREE.BoxGeometry(160, 1, 80), new THREE.MeshStandardMaterial({ color: '#15171d', roughness: 1 }));
ground.position.y = -0.5;
scene.add(ground);

// Soft round sprite textures for flame and smoke.
function blob(inner, outer) {
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
  return texture;
}
const flameTexture = blob('rgba(255,236,170,1)', 'rgba(255,90,20,0)');
const smokeTexture = blob('rgba(46,42,50,0.95)', 'rgba(26,24,30,0)');

const loader = new GLTFLoader();
const files = Array.from({ length: 10 }, (_, i) => `account_building_${String(i + 1).padStart(2, '0')}.glb`);
const select = document.querySelector('#tower');
files.forEach((file, i) => select.append(new Option(`${String(i + 1).padStart(2, '0')}${i === 7 ? ' · paired spires' : i === 9 ? ' · pinnacle' : ''}`, file)));
select.value = files[7];

let towers = new THREE.Group();
scene.add(towers);
let effects = []; // per-frame updaters

async function show(file) {
  scene.remove(towers);
  towers = new THREE.Group();
  scene.add(towers);
  effects = [];
  const gltf = await loader.loadAsync(`../models/account_buildings/${file}`);
  const source = gltf.scene;
  const size = new THREE.Box3().setFromObject(source).getSize(new THREE.Vector3());
  const place = (x) => {
    const copy = source.clone(true);
    copy.traverse((node) => { if (node.isMesh) node.material = node.material.clone(); });
    const bounds = new THREE.Box3().setFromObject(copy);
    copy.position.set(x - (bounds.min.x + bounds.max.x) / 2, -bounds.min.y, -(bounds.min.z + bounds.max.z) / 2);
    towers.add(copy);
    return copy;
  };
  place(-size.x * 1.4);
  breach(place(size.x * 1.4), size);
}

// The breach treatment.
function breach(tower, size) {
  tower.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(tower);
  const height = box.max.y - box.min.y;
  const center = box.getCenter(new THREE.Vector3());
  const random = (() => { let seed = 7; return () => ((seed = (seed * 16807) % 2147483647) / 2147483647); })();

  // Scorch everything a little, and kill most window light: soot-black panes, a few still lit.
  tower.traverse((node) => {
    if (!node.isMesh) return;
    const material = node.material;
    material.color?.lerp(new THREE.Color('#1a1416'), 0.35);
    if (/window/i.test(material.name)) {
      material.emissiveIntensity = (material.emissiveIntensity ?? 1) * 0.35;
      material.color?.lerp(new THREE.Color('#0b0709'), 0.5);
    }
  });

  // Two blown-out floors on the camera-facing corner: a charred cavity with fire inside, broken beams, glow light.
  const holes = [
    { y: box.min.y + height * 0.72, w: size.x * 0.34, h: height * 0.075 },
    { y: box.min.y + height * 0.4, w: size.x * 0.28, h: height * 0.065 },
  ];
  // The tower steps in as it rises, so find the facade's actual corner at a given height from the mesh vertices there.
  const point = new THREE.Vector3();
  const cornerAt = (y, band) => {
    const corner = new THREE.Vector3(-Infinity, y, -Infinity);
    tower.traverse((node) => {
      if (!node.isMesh || /beacon|pavement/i.test(node.material.name)) return;
      const position = node.geometry.attributes.position;
      for (let i = 0; i < position.count; i++) {
        point.fromBufferAttribute(position, i).applyMatrix4(node.matrixWorld);
        if (Math.abs(point.y - y) > band) continue;
        corner.x = Math.max(corner.x, point.x);
        corner.z = Math.max(corner.z, point.z);
      }
    });
    return corner;
  };
  for (const hole of holes) {
    // Cavity: a near-black box sunk into the corner (its outer faces sit just proud of the facade, hiding the panes
    // there), lit from inside by the fire rather than glowing itself.
    const corner = cornerAt(hole.y, hole.h / 2);
    const at = new THREE.Vector3(corner.x - hole.w / 2 + 0.08, hole.y, corner.z - hole.w / 2 + 0.08);
    const cavity = new THREE.Mesh(new THREE.BoxGeometry(hole.w, hole.h, hole.w), new THREE.MeshStandardMaterial({ color: '#0d0605', emissive: '#ff3c10', emissiveIntensity: 0.25, roughness: 1 }));
    cavity.position.copy(at);
    tower.parent.add(cavity);
    for (let i = 0; i < 5; i++) { // broken floor beams sticking out
      const beam = new THREE.Mesh(new THREE.BoxGeometry(hole.w * (0.4 + random() * 0.5), 0.35, 0.35), new THREE.MeshStandardMaterial({ color: '#2b1d17' }));
      beam.position.set(at.x + (random() - 0.3) * hole.w * 0.6, at.y + (random() - 0.5) * hole.h, at.z + (random() - 0.3) * hole.w * 0.6);
      beam.rotation.set(random() * 0.6, random() * Math.PI, random() * 0.8);
      tower.parent.add(beam);
    }
    const glow = new THREE.PointLight('#ff6a24', 60, 40, 1.6);
    glow.position.set(at.x + hole.w * 0.5, at.y, at.z + hole.w * 0.5);
    tower.parent.add(glow);
    // Flames: flickering sprites licking out of the cavity.
    const flames = Array.from({ length: 9 }, () => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTexture, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      sprite.userData.base = new THREE.Vector3(at.x + (random() - 0.2) * hole.w * 0.7, at.y + (random() - 0.4) * hole.h, at.z + (random() - 0.2) * hole.w * 0.7);
      sprite.userData.phase = random() * 10;
      tower.parent.add(sprite);
      return sprite;
    });
    // Smoke: puffs that rise, drift downwind, grow and fade, then respawn at the hole.
    const smoke = Array.from({ length: 26 }, (_, i) => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTexture, depthWrite: false, transparent: true }));
      sprite.userData.life = i / 26;
      sprite.userData.drift = [(random() - 0.5) * 6, (random() - 0.5) * 6, 0.7 + random() * 0.6];
      tower.parent.add(sprite);
      return sprite;
    });
    // Embers: tiny bright points spiralling up.
    const emberGeometry = new THREE.BufferGeometry();
    const emberCount = 40;
    emberGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(emberCount * 3), 3));
    const embers = new THREE.Points(emberGeometry, new THREE.PointsMaterial({ color: '#ffb347', size: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    tower.parent.add(embers);
    const emberLife = Float32Array.from({ length: emberCount }, () => random());
    effects.push((t, dt) => {
      glow.intensity = 45 + Math.sin(t * 13) * 10 + Math.sin(t * 7.3) * 8;
      cavity.material.emissiveIntensity = 0.25 + Math.sin(t * 9) * 0.08;
      for (const sprite of flames) {
        const f = 0.75 + 0.35 * Math.sin(t * 11 + sprite.userData.phase) + 0.2 * Math.sin(t * 23 + sprite.userData.phase);
        sprite.scale.setScalar(hole.h * 0.9 * f);
        sprite.position.copy(sprite.userData.base).add(new THREE.Vector3(0.6, f * 0.8, 0.6));
        sprite.material.opacity = 0.65 + 0.35 * f;
      }
      for (const sprite of smoke) {
        sprite.userData.life = (sprite.userData.life + dt * 0.07) % 1;
        const life = sprite.userData.life;
        const [dx, dz, grow] = sprite.userData.drift;
        // Billows: rises, leans downwind, wobbles and swells as it thins out.
        sprite.position.set(at.x + hole.w * 0.45 + life * 16 + dx * life + Math.sin(life * 9 + dx) * 1.5, at.y + 1 + life * 30, at.z + hole.w * 0.45 - life * 6 + dz * life);
        sprite.scale.setScalar((2.5 + life * 13) * grow);
        sprite.material.opacity = Math.min(1, life * 8) * (1 - life) * 0.85;
      }
      const positions = emberGeometry.attributes.position;
      for (let i = 0; i < emberCount; i++) {
        emberLife[i] = (emberLife[i] + dt * 0.25) % 1;
        const life = emberLife[i];
        positions.setXYZ(i, at.x + hole.w * 0.5 + Math.sin(i * 3.1 + life * 9) * 2 + life * 9, at.y + life * 20, at.z + hole.w * 0.5 + Math.cos(i * 1.7 + life * 7) * 2);
      }
      positions.needsUpdate = true;
    });
  }

  // A soot streak and a crack down the facade below the upper hole.
  const streak = new THREE.Mesh(new THREE.BoxGeometry(size.x * 0.32, height * 0.3, 0.12), new THREE.MeshStandardMaterial({ color: '#0d0a0b', transparent: true, opacity: 0.75 }));
  streak.position.set(center.x + size.x * 0.12, box.min.y + height * 0.52, box.max.z + 0.07);
  tower.parent.add(streak);
  const crack = new THREE.Mesh(new THREE.BoxGeometry(0.22, height * 0.22, 0.14), new THREE.MeshStandardMaterial({ color: '#050405' }));
  crack.position.set(box.max.x + 0.08, box.min.y + height * 0.2, center.z + size.z * 0.1);
  crack.rotation.z = 0.12;
  tower.parent.add(crack);

  // Rubble at the base.
  for (let i = 0; i < 14; i++) {
    const rock = new THREE.Mesh(new THREE.BoxGeometry(0.6 + random() * 1.4, 0.4 + random() * 0.9, 0.6 + random() * 1.4), new THREE.MeshStandardMaterial({ color: random() > 0.5 ? '#2a2a33' : '#3a3540' }));
    const angle = random() * Math.PI * 0.6;
    rock.position.set(box.max.x + Math.cos(angle) * (1 + random() * 3), 0.3, box.max.z + Math.sin(angle) * (1 + random() * 3) - 2);
    rock.rotation.set(random(), random() * Math.PI, random());
    tower.parent.add(rock);
  }

  // Blinking red roof lights.
  const lights = [];
  tower.traverse((node) => { if (node.isMesh && /beacon/i.test(node.material.name)) lights.push(node.material); });
  effects.push((t) => lights.forEach((material) => { material.emissiveIntensity = Math.sin(t * 4) > 0 ? 3 : 0.2; }));
}

function resize() {
  const pixel = Number(document.querySelector('#pixels').value);
  renderer.setPixelRatio(1 / pixel); // render small, scale up crisp: the 8-bit look
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
document.querySelector('#pixels').addEventListener('input', resize);
select.addEventListener('change', () => show(select.value));
resize();
await show(select.value);

const clock = new THREE.Clock();
function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  effects.forEach((update) => update(t, dt));
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();
