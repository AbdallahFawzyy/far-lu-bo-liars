const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 800, height: 500 } });
  p.on('pageerror', (e) => console.log('PAGEERR ' + e.message));
  await p.addInitScript(() => { window.__LD_TEST = 'low'; });
  await p.goto('file://' + process.cwd() + '/dist/standalone.html', { timeout: 120000 });
  await p.waitForFunction(() => window.__ld, null, { timeout: 120000 });
  await p.click('label:has(input[value="off"])');
  await p.click('#btnSolo');
  await p.waitForTimeout(10000);
  for (const [name, step] of [['doorway', 1], ['behindPlayer', 1], ['jumpscare', 1], ['cards', 0]]) {
    await p.evaluate(([n, s]) => { window.__ld.horror.freeze(n, s); }, [name, step]);
    await p.waitForTimeout(1500);
    console.log(name, await p.evaluate(() => {
      const L = window.__ld, e = L.horror.entity, T = L.THREE;
      const hp = e.userData.head.getWorldPosition(new T.Vector3());
      const nd = hp.clone().project(L.camera);
      const heads = L.app.g.seats.map((s) => L.chars[s.char].head.getWorldPosition(new T.Vector3()).project(L.camera)).map((v) => v.x.toFixed(2) + ',' + v.y.toFixed(2));
      return JSON.stringify({ running: L.horror.isRunning(), vis: e.visible, pos: e.position.toArray().map((v) => +v.toFixed(2)), headNdc: [nd.x, nd.y, nd.z].map((v) => +v.toFixed(2)), heads, cam: L.camera.position.toArray().map((v) => +v.toFixed(2)) });
    }));
    await p.evaluate(() => window.__ld.horror.release());
    await p.waitForTimeout(2500);
  }
  await b.close();
})();
