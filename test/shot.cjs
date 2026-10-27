const { chromium } = require('playwright');
const mode = process.argv[2] || 'low';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1000, height: 600 } });
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  await p.addInitScript((m) => { window.__LD_TEST = m; }, mode);
  await p.goto('file://' + process.cwd() + '/dist/standalone.html');
  await p.waitForTimeout(3000);
  const fps = await p.evaluate(() => new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(n / 2); }; requestAnimationFrame(f); }));
  console.log('fps', fps);
  await p.screenshot({ path: 'test/shots/menu.png', timeout: 120000 });
  await p.click('#btnSolo');
  for (const [i, w] of [[1, 6000], [2, 6000], [3, 8000]]) {
    await p.waitForTimeout(w);
    await p.screenshot({ path: `test/shots/game${i}.png`, timeout: 120000 });
  }
  console.log(errs.slice(0, 20).join('\n'));
  await b.close();
})();
