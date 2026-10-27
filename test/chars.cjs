const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 900, height: 560 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.addInitScript(() => { window.__LD_TEST = 'low'; });
  await p.goto('file://' + process.cwd() + '/dist/standalone.html');
  await p.waitForTimeout(2500);
  const urls = await p.evaluate(() => window.__ld.portraits);
  const fs = require('fs');
  for (const [k, v] of Object.entries(urls)) fs.writeFileSync(`test/shots/p_${k}.png`, Buffer.from(v.split(',')[1], 'base64'));
  // close-up of the menu table from a front angle
  const which = process.argv[2] || 'wide';
  await p.evaluate((w) => {
    const L = window.__ld; const T = L.THREE;
    L.app.debugCam = w === 'wide' ? { pos: new T.Vector3(0, 2.0, 2.9), look: new T.Vector3(0, 1.0, 0) } : { pos: new T.Vector3(0.0, 1.55, 0.2), look: new T.Vector3(0, 1.3, -1.3) };
    document.getElementById('menu').hidden = true;
  }, which);
  await p.waitForTimeout(3000);
  await p.screenshot({ path: `test/shots/scene_${which}.png`, timeout: 120000 });
  console.log(errs.join('\n'));
  await b.close();
})();
