// Plays a full solo game on Fast with the human seat on autopilot; reports events and errors.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 480, height: 300 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.addInitScript(() => { window.__LD_TEST = 'low'; });
  await p.goto('file://' + process.cwd() + '/dist/standalone.html');
  await p.waitForTimeout(2000);
  await p.click('label:has(input[value="fast"])');
  await p.click('#btnSolo');
  await p.evaluate(() => window.__ld.setAutoplay(true));
  const t0 = Date.now();
  let shot = 0;
  while (Date.now() - t0 < 600000) {
    await p.waitForTimeout(5000);
    const st = await p.evaluate(() => { const g = window.__ld.host.g; return g && { phase: g.phase, round: g.round, ev: g.evId, alive: g.seats.map((s) => s.alive), q: window.__ld.pres.queue.length }; });
    console.log(Math.round((Date.now() - t0) / 1000) + 's', JSON.stringify(st));
    if (shot < 3 && st && st.round >= 1) { await p.screenshot({ path: `test/shots/auto${shot++}.png`, timeout: 120000 }).catch(() => {}); }
    if (st && st.phase === 'over') break;
  }
  await p.waitForTimeout(4000);
  await p.screenshot({ path: 'test/shots/over.png', timeout: 120000 }).catch(() => {});
  console.log('over visible:', await p.evaluate(() => !document.getElementById('over').hidden));
  console.log(errs.join('\n'));
  await b.close();
})();
