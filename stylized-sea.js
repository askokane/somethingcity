import * as THREE from 'three';

// A modest wave mesh gives actual depth, with analytic normals and one time uniform.
export function createStylizedSea(islands) {
  const uniforms = {
    time: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      uniform float time;
      varying vec3 surface;
      varying vec3 waveNormal;
      varying float crest;
      void main() {
        vec3 p = position;
        float phase = time * 0.06981317; // 90-second wave cycle
        float warp = p.x * .027 - p.z * .031;
        float a = p.x * .115 + p.z * .078 + 1.1 * sin(warp) - phase;
        float b = p.x * -.055 + p.z * .16 + .6 * sin(p.x * .035) + phase;
        float s = sin(a), c = cos(a);
        float h = .44 * s + .10 * s * s + .13 * sin(b);
        p.y = -1.1 + h;
        float dx = (.44 + .20 * s) * c * (.115 + 1.1 * cos(warp) * .027) + .13 * cos(b) * (-.055 + .021 * cos(p.x * .035));
        float dz = (.44 + .20 * s) * c * (.078 - 1.1 * cos(warp) * .031) + .13 * cos(b) * .16;
        waveNormal = normalize(vec3(-dx, 1., -dz));
        surface = p;
        crest = h;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
      }`,
    fragmentShader: `
      varying vec3 surface;
      varying vec3 waveNormal;
      varying float crest;
      void main() {
        vec3 n = normalize(waveNormal);
        vec3 view = normalize(vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]));
        float fresnel = pow(1. - max(dot(n, view), 0.), 3.);
        float band = smoothstep(-.4, .65, crest);
        vec3 deep = vec3(.009, .027, .043);
        vec3 lifted = vec3(.015, .055, .075);
        vec3 color = mix(deep, lifted, band * .7 + fresnel * .25);
        vec3 light = normalize(vec3(-.5, .9, -.6));
        float sheen = pow(max(dot(n, normalize(light + view)), 0.), 90.);
        color += vec3(.012, .025, .029) * sheen;
        gl_FragColor = vec4(color, 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const geometry = new THREE.PlaneGeometry(700, 700, 128, 128);
  geometry.rotateX(-Math.PI / 2);
  const root = new THREE.Mesh(geometry, material);
  root.name = 'Lightweight stylized sea';
  // A matching horizon avoids exposing the finite wave mesh while panning.
  const horizon = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshBasicMaterial({ color: '#173543' }));
  horizon.rotation.x = -Math.PI / 2; horizon.position.y = -2; root.add(horizon);
  function update(time) { uniforms.time.value = time; root.userData.animationTime = time; }
  return { root, update };
}
