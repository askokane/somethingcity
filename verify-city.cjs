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
    const checker = await import('./checker/checker.js');
    const result = await checker.checkAccount('city@demo.test'); app.installCheck(result);
    return { blocks: layout.blocks.length, plots: layout.slots.length, landmarks: app.landmarkRoots.length, accounts: app.accounts.length, rendered: app.renderedBuildings.size, offMap: app.accounts.filter(a => a.slot < 0).length, drawCalls: app.renderer.info.render.calls };
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
      if (size.x > 3.3 || size.z > 3.3) result.push(root.name);
    }
    app.resetDemo();
    return { oversizedTowers: result, resetAccounts: app.accounts.length, resetRendered: app.renderedBuildings.size };
  })()`));
  ws.close();
})().catch(error => { console.error(error); process.exit(1); });
