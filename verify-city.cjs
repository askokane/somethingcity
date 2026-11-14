const fs = require('node:fs');
(async () => {
  const tabs = await fetch('http://localhost:9222/json').then(r => r.json());
  const tab = tabs.find(t => t.type === 'page' && t.url.includes(':8000'));
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  let id = 0; const pending = new Map();
  ws.onmessage = event => { const message = JSON.parse(event.data); if (message.id) { pending.get(message.id)?.(message); pending.delete(message.id); } };
  const send = (method, params = {}) => new Promise(resolve => { const key = ++id; pending.set(key, resolve); ws.send(JSON.stringify({ id: key, method, params })); });
  const evaluate = async expression => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
    return r.result.result.value;
  };
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.reload', { ignoreCache: true });
  let ready = false;
  for (let i = 0; i < 60; i++) {
    ready = await evaluate(`document.querySelector('#loading-overlay')?.classList.contains('is-hidden')`);
    if (ready) break;
    await new Promise(r => setTimeout(r, 1000));
  }
  if (!ready) throw new Error('City failed to finish loading');
  console.log(await evaluate(`(async () => {
    const app = await import('./app.js'); const layout = await import('./city-layout.js');
    const coastalPlan = await import('./coastal-plan.js');
    const coast = app.scene.getObjectByName('Blender coastal districts');
    if (!coast || coast.userData.beaches !== 3) throw new Error('Blender beach assets did not load');
    if (coast.userData.renderBatches > 30) throw new Error('Coastal props exceed batching budget');
    for (const beach of coastalPlan.beaches) {
      if (!coast.getObjectByName(beach.name)) throw new Error('Missing beach: ' + beach.name);
      for (const x of [-10,0,10]) {
        const point = coastalPlan.beachPoint(beach,x,-.2);
        if (!layout.isOnLand(point.x,point.z)) throw new Error('Beach back edge is detached from mainland');
      }
    }
    const scatter = await import('./city-scatter.js');
    const order = scatter.scatterSlotOrder(71), alternate = scatter.scatterSlotOrder(72);
    if (new Set(order).size !== layout.slots.length || order.length !== layout.slots.length) throw new Error('Scatter must cover every plot once');
    if (order.every((value,i) => value === alternate[i])) throw new Error('Scatter seed does not change placement');
    const invalid = layout.blocks.filter(b => !layout.islands.some(i => b.x - 4.5 >= i.minX && b.x + 4.5 <= i.maxX && b.z - 4.5 >= i.minZ && b.z + 4.5 <= i.maxZ));
    if (invalid.length) throw new Error('Blocks extend into the sea');
    for (const island of layout.islands) {
      const todo = [island.cells[0]], visited = new Set();
      const lookup = new Map(island.cells.map(c => [c.x + ',' + c.z, c]));
      while (todo.length) {
        const c = todo.pop(), key = c.x + ',' + c.z;
        if (visited.has(key)) continue;
        visited.add(key);
        for (const [dx,dz] of [[12,0],[-12,0],[0,12],[0,-12]]) {
          const next = lookup.get((c.x+dx) + ',' + (c.z+dz)); if (next) todo.push(next);
        }
      }
      if (visited.size !== island.cells.length) throw new Error(island.name + ' has detached land');
    }
    for (const slot of layout.slots) for (const dx of [-2.25, 2.25]) for (const dz of [-2.25, 2.25]) {
      if (!layout.isOnLand(slot.x + dx, slot.z + dz)) throw new Error('Account plot extends past jagged coastline');
    }
    for (const side of [-1, 1]) for (const dz of [-1.5, 1.5]) {
      if (!layout.isOnLand(layout.bridge.x + side * layout.bridge.length / 2, layout.bridge.z + dz)) throw new Error('Bridge does not meet land');
    }
    if (layout.islands[1].minX - layout.islands[0].maxX !== layout.CHANNEL_WIDTH) throw new Error('Sea channel width mismatch');
    if (layout.bridge.x - layout.bridge.length / 2 > layout.islands[0].maxX || layout.bridge.x + layout.bridge.length / 2 < layout.islands[1].minX) throw new Error('Bridge does not reach both islands');
    if (!layout.islands.every(i => layout.bridge.z - layout.bridge.width / 2 >= i.minZ && layout.bridge.z + layout.bridge.width / 2 <= i.maxZ)) throw new Error('Bridge misses an island after offset');
    const sea = app.scene.getObjectByName('Lightweight stylized sea');
    if (!sea) throw new Error('Lightweight sea did not load');
    const triangles = sea.geometry.index.count / 3;
    if (triangles > 40000) throw new Error('Sea exceeds its lightweight geometry budget');
    const before = sea.material.uniforms.time.value;
    await new Promise(resolve => setTimeout(resolve, 300));
    if (before === sea.material.uniforms.time.value) throw new Error('Sea wave animation is not advancing');
    const checker = await import('./checker/checker.js');
    const result = await checker.checkAccount('city@demo.test'); app.installCheck(result);
    const buildingStyles = [...new Set([...app.renderedBuildings.values()].map(root => root.userData.buildingStyle))];
    if (buildingStyles.length !== 4) throw new Error('Demo must use all four Blender building styles: ' + buildingStyles.join(', '));
    console.log('Blender building styles:', buildingStyles.join(', '));
    const occupiedBlocks = new Set(app.accounts.filter(a => a.slot >= 0).map(a => layout.slots[a.slot].block));
    if (occupiedBlocks.size < Math.min(20, app.accounts.length)) throw new Error('Demo buildings did not scatter across distinct blocks');
    return { islands: layout.islands.length, beaches: coast.userData.beaches, coastalBatches: coast.userData.renderBatches, occupiedBlocks: occupiedBlocks.size, blockFormats: [...new Set(layout.blocks.map(b => b.format))], shoreEdges: layout.edges.filter(e => e.shore).length, eastIslandOffset: layout.ISLAND_OFFSET, lightweightSeaAnimated: true, seaTriangles: triangles, channelWidth: layout.CHANNEL_WIDTH, bridgePlaceholder: !!app.scene.getObjectByName('Inter-island bridge placeholder'), blocks: layout.blocks.length, plots: layout.slots.length, landmarks: app.landmarkRoots.length, accounts: app.accounts.length, rendered: app.renderedBuildings.size, offMap: app.accounts.filter(a => a.slot < 0).length, drawCalls: app.renderer.info.render.calls };
  })()`));
  await new Promise(r => setTimeout(r, 1500));
  // Click the first tower through the actual canvas pointer handler.
  const point = await evaluate(`(async () => {
    const app = await import('./app.js'); const THREE = await import('three');
    const root = [...app.renderedBuildings.values()][0];
    const box = new THREE.Box3().setFromObject(root); const p = box.getCenter(new THREE.Vector3()); p.project(app.camera);
    const rect = app.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + (p.x + 1) * rect.width / 2, y: rect.top + (1 - p.y) * rect.height / 2 };
  })()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
  console.log('Tower report opened:', await evaluate(`!document.querySelector('#city-stats').hidden`));
  await evaluate(`document.querySelector('#city-stats-close').click(); document.querySelector('#camera-button').click()`);
  await new Promise(r => setTimeout(r, 1200));
  fs.mkdirSync('artifacts', { recursive: true });
  const screenshot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('artifacts/city-density.png', Buffer.from(screenshot.result.data, 'base64'));
  await evaluate(`(async () => {
    const app = await import('./app.js');
    window.coastPreviewPose = { target: app.controls.target.clone(), position: app.camera.position.clone(), zoom: app.camera.zoom };
    const offset = app.camera.position.clone().sub(app.controls.target);
    app.controls.target.set(-56,0,30); app.camera.position.copy(app.controls.target).add(offset);
    app.camera.zoom = 4.8; app.camera.updateProjectionMatrix(); app.controls.update();
  })()`);
  await new Promise(r => setTimeout(r, 400));
  const beachShot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('artifacts/beach-detail.png', Buffer.from(beachShot.result.data, 'base64'));
  await evaluate(`(async () => {
    const app = await import('./app.js'), pose = window.coastPreviewPose;
    app.controls.target.copy(pose.target); app.camera.position.copy(pose.position); app.camera.zoom = pose.zoom;
    app.camera.updateProjectionMatrix(); app.controls.update(); delete window.coastPreviewPose;
  })()`);
  await evaluate(`(async () => { const app = await import('./app.js'); app.camera.zoom = 3; app.camera.updateProjectionMatrix(); })()`);
  await new Promise(r => setTimeout(r, 400));
  const seaDetail = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('artifacts/sea-detail.png', Buffer.from(seaDetail.result.data, 'base64'));
  await evaluate(`(async () => { const app = await import('./app.js'); app.camera.zoom = 1; app.camera.updateProjectionMatrix(); })()`);
  const landmarkPoint = await evaluate(`(async () => {
    const app = await import('./app.js'); const THREE = await import('three');
    const box = new THREE.Box3().setFromObject(app.landmarkRoots[0]);
    const p = box.getCenter(new THREE.Vector3()).project(app.camera); const r = app.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (p.x + 1) * r.width / 2, y: r.top + (1 - p.y) * r.height / 2 };
  })()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...landmarkPoint, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...landmarkPoint, button: 'left', clickCount: 1 });
  console.log('Landmark report:', await evaluate(`document.querySelector('#city-stats-title').textContent`));
  await evaluate(`document.querySelector('#city-stats-close').click(); document.querySelector('[data-view="accounts"]').click(); document.querySelector('.feature-table-row').click()`);
  console.log('Directory navigation:', await evaluate(`document.querySelector('#feature-drawer').hidden`));
  await evaluate(`document.querySelector('#camera-button').click()`);
  await new Promise(r => setTimeout(r, 1000));
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await new Promise(r => setTimeout(r, 1000));
  const mobile = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('artifacts/city-density-mobile.png', Buffer.from(mobile.result.data, 'base64'));
  console.log(await evaluate(`(async () => {
    const app = await import('./app.js');
    const result = [];
    for (const root of app.renderedBuildings.values()) {
      const THREE = await import('three'); const box = new THREE.Box3().setFromObject(root); const size = box.getSize(new THREE.Vector3());
      if (size.x > 4.6 || size.z > 4.6) result.push(root.name);
    }
    if (result.length) throw new Error('Tower footprint exceeds current 4.5-unit layout: ' + result.join(', '));
    app.resetDemo();
    return { oversizedTowers: result, resetAccounts: app.accounts.length, resetRendered: app.renderedBuildings.size };
  })()`));
  ws.close();
})().catch(error => { console.error(error); process.exit(1); });
