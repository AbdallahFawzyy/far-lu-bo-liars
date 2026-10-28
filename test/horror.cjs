// Holds each scare at its key frame and screenshots it; also the gun-to-temple pose.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 800, height: 500 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.addInitScript(() => { window.__LD_TEST = 'low'; });
  await p.goto('file://' + process.cwd() + '/dist/standalone.html', { timeout: 120000 });
  await p.waitForFunction(() => window.__ld, null, { timeout: 120000 });
  await p.click('label:has(input[value="off"])');
  if (process.argv[2] === '4') await p.click('label:has(input[name="seats"][value="4"])');
  await p.click('#btnSolo');
  await p.waitForTimeout(12000);
  await p.evaluate(() => {
    const L = window.__ld, T = L.THREE, ch = L.chars[L.app.g.seats[1].char];
    const out = ch.root.position.clone().normalize();
    L.app.debugCam = { pos: ch.root.position.clone().addScaledVector(out, -1.9).add(new T.Vector3(0, 1.7, 0)), look: ch.root.position.clone().add(new T.Vector3(0, 1.35, 0)) };
    L.guns[1].mode = 'head'; L.C.setPose(ch, 'gunHead'); L.C.express(ch, 'scared');
  });
  await p.waitForTimeout(6000);
  await p.screenshot({ path: 'test/shots/h_gun.png', timeout: 120000 });
  await p.evaluate(() => { const L = window.__ld; L.app.debugCam = null; L.guns[1].mode = 'return'; L.guns[1].t = 0; });
  await p.waitForTimeout(3000);
  const only = process.argv[3] ? process.argv[3].split(',') : null;
  for (const [name, step] of [['doorway', 1], ['behindPlayer', 1], ['hanging', 0], ['bar', 0], ['headTurn', 1], ['hand', 1], ['jumpscare', 1], ['cards', 0]]) {
    if (only && !only.includes(name)) continue;
    await p.evaluate(([n, s]) => { window.__ld.horror.freeze(n, s); }, [name, step]);
    await p.waitForTimeout(['doorway', 'behindPlayer', 'hanging', 'bar'].includes(name) ? 16000 : 5000);
    await p.screenshot({ path: `test/shots/h_${name}.png`, timeout: 120000 });
    await p.evaluate(() => window.__ld.horror.release());
    await p.waitForFunction(() => !window.__ld.horror.isRunning(), null, { timeout: 60000 }).catch(() => console.log('stuck', name));
  }
  console.log(errs.join('\n') || 'no errors');
  await b.close();
})();
