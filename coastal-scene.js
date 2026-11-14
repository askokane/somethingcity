import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { beaches, beachPoint } from './coastal-plan.js';
import { blocks } from './city-plan.js';

export async function createCoastalScene() {
  const loader = new GLTFLoader();
  const [gltf, waterfrontGltf, boats] = await Promise.all([
    loader.loadAsync('./models/everything-else/gotham_coastal_kit.glb'),
    loader.loadAsync('./models/waterfront/gotham_waterfront_kit.glb'),
    Promise.all([
      ['sailboat', './models/ships/sailboat_west_bay.glb'],
      ['rowboat', './models/ships/rowboat_beach_cove.glb'],
      ['fishing', './models/ships/fishing_skiff_blackgate.glb'],
    ].map(async ([name, path]) => [name, await loader.loadAsync(path)])),
  ]);
  const group = new THREE.Group(); group.name = 'Blender coastal districts';
  function prototype(name) {
    let found;
    gltf.scene.traverse(node => { if (node.name.replace(/[._]?\d+$/, '') === name) found = node; });
    if (!found) throw new Error(`Coastal asset missing: ${name}`);
    return found;
  }
  function place(name, x, y, z, rotation = 0, scale = 1) {
    const root = prototype(name).clone(true);
    root.position.set(x,y,z); root.rotation.y = rotation; root.scale.setScalar(scale);
    root.traverse(node => { if (node.isMesh) { node.castShadow = name !== 'Beach_Sand_Patch'; node.receiveShadow = true; } });
    group.add(root); return root;
  }
  const waterfrontGroup = new THREE.Group(); waterfrontGroup.name = 'Gotham waterfront infrastructure'; group.add(waterfrontGroup);
  const fleetGroup = new THREE.Group(); fleetGroup.name = 'Moored beach and marina craft'; group.add(fleetGroup);
  function waterfrontPrototype(name) {
    const found = waterfrontGltf.scene.getObjectByName(name);
    if (!found) throw new Error(`Waterfront asset missing: ${name}`);
    return found;
  }
  function placeWaterfront(name,x,y,z,rotation=0,scale=1) {
    const model=waterfrontPrototype(name).clone(true);
    model.name=name; model.position.set(x,y,z); model.rotation.y=rotation; model.scale.setScalar(scale);
    model.traverse(node=>{if(node.isMesh){node.castShadow=true;node.receiveShadow=true;}});
    waterfrontGroup.add(model); return model;
  }
  function placeBoat(name,x,y,z,rotation=0,scale=1) {
    const gltf=Object.fromEntries(boats)[name];
    const model=gltf.scene.clone(true); model.name=`Marina_${name}`;
    model.position.set(x,y,z); model.rotation.y=rotation; model.scale.setScalar(scale);
    model.traverse(node=>{if(node.isMesh){node.castShadow=true;node.receiveShadow=true;}});
    fleetGroup.add(model); return model;
  }
  for (const beach of beaches) {
    const patch = place('Beach_Sand_Patch', beach.x, 0, beach.z, beach.rotation);
    patch.name = beach.name;
    const local = (name, x, y, z, angle = 0, scale = 1) => {
      const p = beachPoint(beach, x, z); return place(name, p.x, y, p.z, beach.rotation + angle, scale);
    };
    const waterfrontLocal=(name,x,y,z,angle=0,scale=1)=>{
      const p=beachPoint(beach,x,z); return placeWaterfront(name,p.x,y,p.z,beach.rotation+angle,scale);
    };
    local('Beach_Steps', 0, 0, 0);
    waterfrontLocal('Beach_Boardwalk_Segment',0,.12,.12);
    for (const x of [-10.5,-8.7,8.8,10.4]) {
      local('Coast_Rock', x, -.05, 1.3 + Math.abs(x) % 2, x, beach.style === 'rocky' ? 1.7 : .9);
      local('Dune_Grass', x + .5, .1, .7, x);
    }
    for (const x of [-7,-3,3,7]) local('Dune_Grass', x, .08, .6, x, .8);
    if (beach.style !== 'rocky') {
      for (const [x,z] of [[-6,2.3],[5,3.1]]) {
        local('Beach_Umbrella', x, .02, z);
        local('Beach_Lounger', x + 1.3, -.02, z + .2, .15);
      }
      local('Lifeguard_Hut', 8, .02, 1.5, -.2);
    } else {
      local('Coast_Bench', -4, .08, .8, Math.PI);
      local('Coast_Rock', 6, -.18, 5.5, .7, 1.9);
    }
  }

  // North Head has the city's lighthouse; its beacon sweep remains a live pivot.
  const lighthouse=placeWaterfront('Lighthouse_North_Head',-69,.05,-97);
  const sweep=lighthouse.getObjectByName('Lighthouse_Beam_Sweep');

  // South Strand's boardwalk gets the beach activity and the dedicated kiosk.
  const south=beaches.find(b=>b.name==='South Strand');
  if(south){
    const local=(name,x,y,z,angle=0)=>{const p=beachPoint(south,x,z);return placeWaterfront(name,p.x,y,p.z,south.rotation+angle);};
    local('Beach_Volleyball_Net',-4,.12,2.2);
    local('Boardwalk_IceCream_Stand',2.7,.14,1.5);
  }

  // Fishing pier and its figures extend from West Bay; the short kit jetty is
  // still used at East Quay as a separate small landing.
  const west=beaches.find(b=>b.name==='West Bay Beach');
  if(west){const p=beachPoint(west,7.5,0);placeWaterfront('Fishing_Pier_People',p.x,.08,p.z,west.rotation);}

  // East Quay / Haysville dock face. The standard waterfront models repeat
  // on a clean 12-unit module, matching the city's shoreline grid.
  placeWaterfront('Marina_Floating_Slips',63,-.12,22,Math.PI/2);
  placeBoat('sailboat',68.6,-.05,18.0,0,.78);
  placeBoat('fishing',72.0,-.08,26.0,0,.82);
  placeBoat('rowboat',75.1,-.02,18.2,0,.78);
  placeWaterfront('Gantry_Crane_Haysville',62,.05,28,0,.92);
  placeWaterfront('Warehouse_Haysville_Docks',49,.08,24,Math.PI/2,.9);
  placeWaterfront('Container_Rust',54,.05,18,0);
  placeWaterfront('Container_Teal',54,2.63,18,0);
  placeWaterfront('Container_Slate',60,.05,19,0);
  placeWaterfront('Container_Rust',54,.05,27,0);
  for(const z of [17,21,25,29,33]) placeWaterfront('Harbor_Bollard',63,.08,z,0,1.15);

  // A second, quieter industrial frontage anchors the Ace Chemicals shore.
  placeWaterfront('Warehouse_Haysville_Docks',49,.08,0,Math.PI/2,.82);
  placeWaterfront('Container_Teal',56,.05,-5,0);
  placeWaterfront('Container_Slate',56,2.63,-5,0);
  placeWaterfront('Container_Rust',60,.05,2,0);
  for(const z of [-8,-4,0,4,8]) placeWaterfront('Harbor_Bollard',63,.08,z,0,1.05);

  // Breakwater reaches into the harbor; rip-rap and masonry break up the
  // straight seawall rhythm on either side of the dock approaches.
  placeWaterfront('Breakwater_Harbor_Light',63,-.28,39,Math.PI/2,1.0);
  placeWaterfront('Riprap_Rock_Pile',62.6,-.25,11,0,1.15);
  placeWaterfront('Riprap_Rock_Pile',62.6,-.25,-12,0,1.15);
  placeWaterfront('Seawall_Straight_Module',63.08,-.18,12,Math.PI/2);
  placeWaterfront('Seawall_Straight_Module',63.08,-.18,36,Math.PI/2);
  placeWaterfront('Seawall_Corner_Module',63.08,-.18,0,Math.PI/2);

  // Consolidate the static waterfront set by material while retaining the
  // lighthouse beam and all named scene roots for animation and inspection.
  waterfrontGroup.updateMatrixWorld(true);
  const staticBatches=new Map(), staticMeshes=[];
  waterfrontGroup.traverse(node=>{
    if(!node.isMesh||node.name==='Lighthouse_rotating_light_beam') return;
    const key=node.material.uuid;
    if(!staticBatches.has(key)) staticBatches.set(key,{material:node.material,geometries:[]});
    const geometry=node.geometry.index?node.geometry.toNonIndexed():node.geometry.clone();
    for(const attr of Object.keys(geometry.attributes)) if(!['position','normal'].includes(attr)) geometry.deleteAttribute(attr);
    geometry.applyMatrix4(node.matrixWorld); staticBatches.get(key).geometries.push(geometry); staticMeshes.push(node);
  });
  for(const batch of staticBatches.values()){
    const geometry=mergeGeometries(batch.geometries,false);
    if(!geometry) throw new Error('Waterfront geometry batching failed');
    const mesh=new THREE.Mesh(geometry,batch.material); mesh.name='Waterfront render batch'; mesh.castShadow=true; mesh.receiveShadow=true;
    waterfrontGroup.add(mesh); batch.geometries.forEach(g=>g.dispose());
  }
  staticMeshes.forEach(mesh=>mesh.parent.remove(mesh));
  waterfrontGroup.userData.renderBatches=staticBatches.size;
  waterfrontGroup.userData.update=time=>{if(sweep) sweep.rotation.y=time*.36;};
  waterfrontGroup.userData.namedAssets=['Lighthouse_North_Head','Fishing_Pier_People','Marina_Floating_Slips','Breakwater_Harbor_Light','Gantry_Crane_Haysville'];
  group.userData.update=time=>waterfrontGroup.userData.update(time);
  for (const b of blocks) {
    if (b.format === 'market') for (const dx of [-8,-4,0,4,8]) for (const dz of [-3.1,3.1]) place('Market_Stall', b.x + dx, .23, b.z + dz, dz < 0 ? Math.PI : 0);
    if (b.format === 'garden') for (const dx of [-6,6]) place('Coast_Bench', b.x + dx, .23, b.z + 1.1, Math.PI);
    if (b.format === 'plaza') {
      place('Plaza_Fountain', b.x, .23, b.z);
      for (const dx of [-3,3]) place('Coast_Bench', b.x + dx, .23, b.z, dx < 0 ? Math.PI / 2 : -Math.PI / 2);
    }
    if (b.format === 'dockyard') {
      place('Lifeguard_Hut', b.x - 2, .23, b.z - 2);
      place('Harbor_Jetty', 63, 0, b.z, Math.PI / 2);
      place('Coast_Bench', b.x - 2, .23, b.z + 2, Math.PI / 2);
    }
  }
  group.userData.beaches = beaches.length;
  // Static props share a handful of render batches rather than one draw per slat.
  group.updateMatrixWorld(true);
  const batches = new Map(), sourceMeshes = [];
  group.traverse(node => {
    if (!node.isMesh) return;
    if (node.name.startsWith('Lighthouse_rotating_light_beam')) return;
    let root = node.parent;
    while (root && root.parent !== group && root !== group) root = root.parent;
    if (root === waterfrontGroup || root === fleetGroup) return;
    const key = node.material.uuid + ':' + node.castShadow;
    if (!batches.has(key)) batches.set(key, { material: node.material, shadow: node.castShadow, geometry: [] });
    const geometry = node.geometry.index ? node.geometry.toNonIndexed() : node.geometry.clone();
    for (const name of Object.keys(geometry.attributes)) if (!['position','normal'].includes(name)) geometry.deleteAttribute(name);
    geometry.applyMatrix4(node.matrixWorld);
    batches.get(key).geometry.push(geometry); sourceMeshes.push(node);
  });
  for (const batch of batches.values()) {
    const geometry = mergeGeometries(batch.geometry, false);
    if (!geometry) throw new Error('Coastal geometry batching failed');
    const mesh = new THREE.Mesh(geometry, batch.material);
    mesh.name = 'Coastal render batch'; mesh.castShadow = batch.shadow; mesh.receiveShadow = true;
    group.add(mesh); batch.geometry.forEach(g => g.dispose());
  }
  sourceMeshes.forEach(mesh => mesh.parent.remove(mesh));
  group.userData.renderBatches = batches.size;
  return group;
}
