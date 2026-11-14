import * as THREE from 'three';

// One Blender-built plastic plate, repeated with rigid, stepped wave motion.
export function buildBrickSea(gltf, islands) {
  const root = gltf.scene;
  root.name = 'Blender modeled sea';
  root.updateMatrixWorld(true);
  let prototype;
  root.traverse(node => { if (node.isMesh && node.name.startsWith('Sea_Brick_Prototype')) prototype = node; });
  if (!prototype?.isMesh) throw new Error('Sea brick prototype missing from Blender export');
  const geometry = prototype.geometry.clone().applyMatrix4(prototype.matrixWorld);
  prototype.parent.remove(prototype);
  const positions = [];
  const pitch = 2.4;
  for (let row = -90; row < 90; row++) for (let col = -90; col < 90; col++) {
    const x = (col + .5) * pitch, z = (row + .5) * pitch;
    if (islands.some(i => x > i.minX - 1 && x < i.maxX + 1 && z > i.minZ - 1 && z < i.maxZ + 1)) continue;
    positions.push([x, z]);
  }
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .3, metalness: 0 });
  const plates = new THREE.InstancedMesh(geometry, material, positions.length);
  plates.name = 'Animated studded sea plates';
  // Keep the city shadows crisp without rendering thousands of tiny stud shadows.
  plates.castShadow = false; plates.receiveShadow = false;
  plates.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  root.add(plates);
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  const palette = ['#122d40', '#15364a', '#1a4055', '#204b60', '#2b596b'].map(c => new THREE.Color(c));
  const foam = new THREE.Color('#78949e');
  let previousFrame = -1;
  function update(time) {
    const frame = Math.floor(time * 12);
    if (frame === previousFrame) return;
    previousFrame = frame;
    const phase = frame / 12 * Math.PI * 2 / 90;
    positions.forEach(([x, z], index) => {
      const swell = Math.sin(x * .13 + z * .09 - phase + .75 * Math.sin(z * .045) + .45 * Math.sin(x * .035));
      const cross = Math.sin(z * .23 - x * .065 + phase + .3 * Math.sin(z * .05));
      const height = Math.round((-.92 + .16 * swell + .05 * cross) / .04) * .04;
      matrix.makeTranslation(x, height, z); plates.setMatrixAt(index, matrix);
      const band = THREE.MathUtils.clamp((swell + 1) * 2, 0, 4);
      const lower = Math.floor(band);
      color.copy(palette[lower]).lerp(palette[Math.min(4, lower + 1)], band - lower);
      // Short linked runs of pale plates cap selected crests, not sparkles.
      const crest = THREE.MathUtils.smoothstep(swell, .95, 1)
        * THREE.MathUtils.smoothstep(cross, .6, .9)
        * THREE.MathUtils.smoothstep(Math.sin(x * .075 - z * .055), .5, .9);
      color.lerp(foam, crest * .5);
      plates.setColorAt(index, color);
    });
    plates.instanceMatrix.needsUpdate = true;
    plates.instanceColor.needsUpdate = true;
    plates.userData.animationFrame = frame;
  }
  update(0);
  plates.instanceColor.setUsage(THREE.DynamicDrawUsage);
  plates.computeBoundingSphere();
  plates.boundingSphere.radius += 1;
  return { root, update };
}
