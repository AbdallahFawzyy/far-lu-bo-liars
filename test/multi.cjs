// Two browser pages in one context: host + guest, play a full game over the mock room.
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--proxy-bypass-list=<-loopback>;127.0.0.1;localhost'] });
  const ctx = await b.newContext({ viewport: { width: 480, height: 300 } });
  await ctx.addInitScript({ content: "window.__LD_TEST='low';" + fs.readFileSync('test/mockroom.js', 'utf8') });
  const url = 'http://127.0.0.1:8123/standalone.html';
  const errs = [];
  const mk = async (tag) => { const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(tag + ' PAGEERR ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(tag + ' ' + m.text()); }); await p.goto(url, { waitUntil: 'commit', timeout: 60000 }); await p.waitForFunction(() => window.__ld && document.getElementById('loading')?.hidden, null, { timeout: 240000 }); await p.waitForTimeout(1500); return p; };
  const h = await mk('host');
  const gst = await mk('guest');
  await h.fill('#nameInput', 'Abdallah');
  await h.click('label:has(input[value="fast"])');
  await h.click('#btnHost');
  await h.waitForTimeout(1500);
  const code = (await h.textContent('#lobbyCode')).trim();
  console.log('code', code);
  await gst.fill('#nameInput', 'Friend');
  await gst.click('.charCard[data-id="wait"]');
  await gst.fill('#codeInput', code);
  await gst.click('#btnJoin');
  await h.waitForTimeout(2500);
  console.log('host roster:', (await h.$$eval('#roster li strong', (els) => els.map((e) => e.textContent))).join(' | '));
  console.log('guest roster:', (await gst.$$eval('#roster li strong', (els) => els.map((e) => e.textContent))).join(' | '));
  await h.click('#btnStart');
  await h.evaluate(() => window.__ld.setAutoplay(true));
  const t0 = Date.now();
  let guestActs = 0;
  while (Date.now() - t0 < 900000) {
    await gst.waitForTimeout(3000);
    // the guest plays by clicking the real buttons
    const vis = await gst.evaluate(() => !document.getElementById('controls').hidden);
    if (vis) {
      const canLiar = await gst.evaluate(() => !document.getElementById('btnLiar').hidden);
      if (canLiar && Math.random() < 0.4) await gst.click('#btnLiar');
      else { await gst.keyboard.press('1'); await gst.click('#btnPlay').catch(() => {}); }
      guestActs++;
    }
    const st = await h.evaluate(() => { const g = window.__ld.host.g; return g && { phase: g.phase, round: g.round, ev: g.evId, alive: g.seats.map((s) => s.alive) }; });
    const gs = await gst.evaluate(() => { const g = window.__ld.app.g; return g && { seat: window.__ld.app.mySeat, ev: g.evId, q: window.__ld.pres.queue.length }; });
    if ((Date.now() - t0) % 15000 < 3500) console.log(Math.round((Date.now() - t0) / 1000) + 's host', JSON.stringify(st), 'guest', JSON.stringify(gs), 'acts', guestActs);
    if (st && st.phase === 'over') break;
  }
  await gst.screenshot({ path: 'test/shots/guest.png', timeout: 120000 }).catch(() => {});
  console.log('guest acts:', guestActs);
  console.log(errs.slice(0, 20).join('\n'));
  await b.close();
})();
