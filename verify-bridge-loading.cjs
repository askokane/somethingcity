const assert = require('node:assert/strict');
(async () => {
  const tabs = await fetch('http://localhost:9222/json').then(r => r.json());
  const tab = tabs.find(t => t.type === 'page' && t.url.includes(':8000'));
  assert.ok(tab, 'Open localhost:8000 in the preview browser');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  let id = 0; const pending = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id) { pending.get(m.id)?.(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise((resolve,reject) => {
    const key = ++id; pending.set(key, m => m.error ? reject(new Error(m.error.message)) : resolve(m.result));
    ws.send(JSON.stringify({ id:key, method, params }));
  });
  const evaluate = async expression => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise:true, returnByValue:true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  async function waitReady() {
    for (let i=0;i<60;i++) {
      if (await evaluate(`document.querySelector('#loading-overlay').classList.contains('is-hidden')`)) return;
      await new Promise(r=>setTimeout(r,500));
    }
    throw new Error('Loading overlay did not finish');
  }
  try {
    await send('Network.enable');
    await send('Network.setBlockedURLs',{urls:['*bridge_gothic_suspension.glb*']});
    await send('Page.reload',{ignoreCache:true});
    await waitReady();
    const failure = await evaluate(`(async()=>{
      const app=await import('./app.js');
      return { bridge:!!app.scene.getObjectByName('Inter-island gothic bridge'), coast:!!app.scene.getObjectByName('Blender coastal districts'), props:!!app.scene.getObjectByName('Sidewalk benches and trash cans'), message:document.querySelector('#toast').textContent };
    })()`);
    assert.equal(failure.bridge,false);
    assert.equal(failure.coast,true,'Bridge failure must preserve coastal assets');
    assert.equal(failure.props,true,'Bridge failure must preserve street props');
    assert.match(failure.message,/Could not load bridge/);
    console.log('PASS: bridge download failure preserves scenery and reports the missing asset.');
  } finally {
    await send('Network.setBlockedURLs',{urls:[]});
    await send('Network.disable');
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await send('Page.reload',{ignoreCache:true});
    await waitReady();
    assert.equal(await evaluate(`import('./app.js').then(a=>!!a.scene.getObjectByName('Inter-island gothic bridge'))`),true,'Bridge must recover after reload');
    await evaluate(`(async()=>{
      const app=await import('./app.js'),layout=await import('./city-layout.js');
      const offset=app.camera.position.clone().sub(app.controls.target);
      app.controls.target.set(layout.bridge.x,0,layout.bridge.z);
      app.camera.position.copy(app.controls.target).add(offset);app.camera.zoom=4.5;app.camera.updateProjectionMatrix();app.controls.update();
    })()`);
    console.log('PASS: bridge recovers on reload; localhost is ready at the crossing.');
    ws.close();
  }
})().catch(e=>{console.error(e);process.exit(1)});
