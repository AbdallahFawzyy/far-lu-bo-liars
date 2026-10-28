const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 400, height: 250 } });
  p.on('pageerror', (e) => console.log('PAGEERR ' + e.message));
  await p.addInitScript(() => { window.__LD_TEST = 'low'; });
  await p.goto('file://' + process.cwd() + '/dist/standalone.html', { timeout: 120000 });
  await p.waitForFunction(() => window.__ld, null, { timeout: 120000 });
  await p.click('label:has(input[value="off"])');
  await p.click('#btnSolo');
  await p.waitForTimeout(8000);
  await p.evaluate(() => { const L = window.__ld, ch = L.chars[L.app.g.seats[1].char]; L.guns[1].mode = 'head'; L.C.setPose(ch, 'gunHead'); });
  await p.waitForTimeout(4000);
  console.log(await p.evaluate(() => {
    const L = window.__ld, T = L.THREE, ch = L.chars[L.app.g.seats[1].char], g = L.guns[1].obj;
    const f = (v) => v.toArray().map((x) => +x.toFixed(2));
    const head = ch.head.getWorldPosition(new T.Vector3());
    const muzzle = g.localToWorld(g.userData.muzzle.clone());
    const origin = g.getWorldPosition(new T.Vector3());
    const barrel = new T.Vector3(1, 0, 0).applyQuaternion(g.getWorldQuaternion(new T.Quaternion()));
    const hand = ch.arms.R.hand.getWorldPosition(new T.Vector3());
    return JSON.stringify({ head: f(head), muzzle: f(muzzle), origin: f(origin), barrelDir: f(barrel), hand: f(hand), muzzleToHead: +muzzle.distanceTo(head).toFixed(2), scale: g.scale.x });
  }));
  await b.close();
})();
