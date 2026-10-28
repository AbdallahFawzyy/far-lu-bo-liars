// The thing in the cellar. A gaunt, too-tall figure and a set of scare scenarios that
// fire now and then. Scares run locally, on each player's own screen, at random, so
// everyone at the table gets scared differently and at different times.
import * as THREE from 'three';
import * as T from './textures.js';
import { sfx, duckMusic, restoreMusic } from './audio.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rnd = (a, b) => a + Math.random() * (b - a);
let freezeAt = -1, freezeHit = null, stepNo = 0;
/** Waits used by the scenarios. The freeze hook lets tests hold a scenario at one step. */
const wait = (s) => {
  stepNo += 1;
  if (freezeAt >= 0) {
    if (stepNo - 1 === freezeAt) return new Promise((r) => { freezeHit = r; });
    return Promise.resolve();
  }
  return new Promise((r) => setTimeout(r, s * 1000));
};

// ------------------------------------------------------------------ the figure

function skinTexture() {
  const [c, x] = T.canvas(256, 256);
  x.fillStyle = '#a9a496'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 60; i++) { // blotches
    const g = x.createRadialGradient(Math.random() * 256, Math.random() * 256, 0, Math.random() * 256, Math.random() * 256, rnd(10, 50));
    g.addColorStop(0, `rgba(${rnd(60, 110)},${rnd(70, 100)},${rnd(60, 90)},0.35)`); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  }
  x.strokeStyle = 'rgba(60,40,70,0.45)'; // veins
  for (let i = 0; i < 26; i++) {
    x.lineWidth = rnd(0.5, 2);
    x.beginPath();
    let px = Math.random() * 256, py = Math.random() * 256;
    x.moveTo(px, py);
    for (let k = 0; k < 8; k++) { px += rnd(-18, 18); py += rnd(-6, 22); x.lineTo(px, py); }
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function buildEntity() {
  const skin = new THREE.MeshStandardMaterial({ map: skinTexture(), roughness: 0.85, color: '#c9c4b4' });
  const dark = new THREE.MeshStandardMaterial({ color: '#050404', roughness: 1 });
  const g = new THREE.Group();
  const m = (geo, mat = skin) => { const o = new THREE.Mesh(geo, mat); o.castShadow = true; return o; };

  // legs, long and thin
  for (const s of [-1, 1]) {
    const thigh = m(new THREE.CapsuleGeometry(0.055, 0.52, 4, 8)); thigh.position.set(s * 0.1, 0.98, 0);
    const shin = m(new THREE.CapsuleGeometry(0.045, 0.56, 4, 8)); shin.position.set(s * 0.1, 0.38, 0.02);
    const knee = m(new THREE.SphereGeometry(0.065, 10, 8)); knee.position.set(s * 0.1, 0.68, 0.02);
    const foot = m(new THREE.BoxGeometry(0.08, 0.04, 0.24)); foot.position.set(s * 0.1, 0.02, 0.06);
    g.add(thigh, shin, knee, foot);
  }
  const spine = new THREE.Group(); spine.position.y = 1.28; g.add(spine);
  // emaciated torso with ribs
  const prof = [];
  for (let i = 0; i <= 14; i++) { const t = i / 14; prof.push(new THREE.Vector2(0.1 + Math.sin(t * Math.PI) * 0.06 - (t > 0.35 && t < 0.55 ? 0.025 : 0), t * 0.72)); }
  const torso = m(new THREE.LatheGeometry(prof, 18)); torso.scale.set(1.15, 1, 0.7); spine.add(torso);
  for (let i = 0; i < 6; i++) {
    const rib = m(new THREE.TorusGeometry(0.15 - Math.abs(i - 2) * 0.008, 0.008, 5, 18, Math.PI * 0.9));
    rib.rotation.set(Math.PI / 2 - 0.25, 0, Math.PI * 0.05 + Math.PI);
    rib.scale.set(1.1, 0.75, 1);
    rib.position.set(0, 0.4 + i * 0.045, 0.01);
    spine.add(rib);
  }
  // long arms ending in long fingers
  const arms = {};
  for (const [side, s] of [['R', -1], ['L', 1]]) {
    const sh = new THREE.Group(); sh.position.set(s * 0.2, 0.66, 0); spine.add(sh);
    const up = m(new THREE.CapsuleGeometry(0.038, 0.46, 4, 8)); up.position.y = -0.26; sh.add(up);
    const el = new THREE.Group(); el.position.y = -0.52; sh.add(el);
    const fo = m(new THREE.CapsuleGeometry(0.032, 0.46, 4, 8)); fo.position.y = -0.25; el.add(fo);
    const hand = new THREE.Group(); hand.position.y = -0.52; el.add(hand);
    const palm = m(new THREE.BoxGeometry(0.07, 0.09, 0.025)); palm.position.y = -0.04; hand.add(palm);
    const fingers = [];
    for (let i = 0; i < 4; i++) {
      const piv = new THREE.Group(); piv.position.set((i - 1.5) * 0.017, -0.085, 0);
      const f = m(new THREE.CapsuleGeometry(0.007, 0.15, 3, 6)); f.position.y = -0.08; piv.add(f);
      const nail = m(new THREE.ConeGeometry(0.006, 0.03, 5), dark); nail.position.y = -0.17; nail.rotation.x = Math.PI; piv.add(nail);
      hand.add(piv); fingers.push(piv);
    }
    sh.rotation.z = s * 0.12;
    arms[side] = { sh, el, hand, fingers };
  }
  // neck and the head
  const neck = m(new THREE.CylinderGeometry(0.035, 0.05, 0.26, 10)); neck.position.y = 0.82; spine.add(neck);
  const headPiv = new THREE.Group(); headPiv.position.y = 0.94; spine.add(headPiv);
  const head = new THREE.Group(); head.position.y = 0.13; headPiv.add(head);
  const skull = m(new THREE.SphereGeometry(0.13, 28, 22)); skull.scale.set(0.82, 1.3, 0.92); head.add(skull);
  const jaw = m(new THREE.SphereGeometry(0.1, 20, 16)); jaw.scale.set(0.75, 1.1, 0.8); jaw.position.set(0, -0.1, 0.02); head.add(jaw);
  // sunken black sockets with a pinpoint of light
  const eyes = [];
  for (const s of [-1, 1]) {
    const sock = m(new THREE.SphereGeometry(0.034, 14, 10), dark); sock.scale.set(1.1, 0.8, 0.6); sock.position.set(s * 0.045, 0.02, 0.1); head.add(sock);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffd9b0', transparent: true, opacity: 0.9 }));
    glint.position.set(s * 0.045, 0.02, 0.118); head.add(glint); eyes.push(glint);
  }
  // nose slits
  for (const s of [-1, 1]) { const n = m(new THREE.SphereGeometry(0.008, 6, 6), dark); n.scale.set(0.6, 1.6, 0.6); n.position.set(s * 0.012, -0.03, 0.118); head.add(n); }
  // a gaping, too-long mouth with thin teeth
  const mouth = m(new THREE.SphereGeometry(0.03, 14, 12), dark); mouth.scale.set(0.9, 2.6, 0.5); mouth.userData.base = mouth.scale.clone(); mouth.position.set(0, -0.13, 0.085); head.add(mouth);
  const toothMat = new THREE.MeshStandardMaterial({ color: '#d8cfb4', roughness: 0.4 });
  for (let i = 0; i < 7; i++) {
    for (const row of [1, -1]) {
      const tooth = m(new THREE.ConeGeometry(0.004, 0.022, 4), toothMat);
      tooth.position.set((i - 3) * 0.008, -0.13 + row * 0.055, 0.1); tooth.rotation.x = row > 0 ? Math.PI : 0;
      head.add(tooth);
    }
  }
  // lank black hair hanging over the face
  const hairMat = new THREE.MeshStandardMaterial({ color: '#070606', roughness: 0.6, side: THREE.DoubleSide });
  for (let i = 0; i < 26; i++) {
    const a = rnd(-2.6, 2.6);
    const len = rnd(0.35, 0.85);
    const strand = new THREE.Mesh(new THREE.PlaneGeometry(rnd(0.012, 0.03), len), hairMat);
    strand.position.set(Math.sin(a) * 0.105, 0.1 - len / 2, Math.cos(a) * 0.1 - 0.01);
    strand.rotation.y = a;
    strand.rotation.z = rnd(-0.08, 0.08);
    head.add(strand);
  }
  g.traverse((o) => { if (o.isMesh) o.material = o.material; });
  g.userData = { spine, headPiv, head, arms, eyes, mouth };
  g.scale.setScalar(0.9);
  g.visible = false;
  return g;
}

/** A detached pale hand and forearm for over-the-shoulder scares. */
function buildHand() {
  const skin = new THREE.MeshStandardMaterial({ map: skinTexture(), roughness: 0.85, color: '#c9c4b4', emissive: '#3a3a40', emissiveIntensity: 0.6 });
  const g = new THREE.Group();
  const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.4, 4, 8), skin); fore.rotation.z = Math.PI / 2; fore.position.x = 0.25; g.add(fore);
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.025, 0.07), skin); g.add(palm);
  const fingers = [];
  for (let i = 0; i < 4; i++) {
    const piv = new THREE.Group(); piv.position.set(-0.04, 0, (i - 1.5) * 0.018);
    const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.0075, 0.13, 3, 6), skin); f.rotation.z = Math.PI / 2; f.position.x = -0.07;
    piv.add(f); g.add(piv); fingers.push(piv);
  }
  g.userData.fingers = fingers;
  g.scale.setScalar(0.62);
  g.visible = false;
  return g;
}

function cursedCard(text) {
  const [c, x] = T.canvas(256, 384);
  x.fillStyle = '#d9cfb6'; x.fillRect(0, 0, 256, 384);
  for (let i = 0; i < 30; i++) { x.fillStyle = `rgba(${rnd(80, 130)},0,0,${rnd(0.2, 0.7)})`; x.beginPath(); x.arc(rnd(0, 256), rnd(0, 384), rnd(2, 18), 0, 7); x.fill(); }
  x.fillStyle = '#6a0000';
  x.font = 'bold 52px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  text.split('\n').forEach((l, i, a) => x.fillText(l, 128, 192 + (i - (a.length - 1) / 2) * 60));
  for (let i = 0; i < 18; i++) { x.fillRect(rnd(30, 226), 220 + rnd(0, 20), 4, rnd(20, 120)); } // drips
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------------ director

export function initHorror(ctx) {
  // ctx: { scene, camera, world, handCards, faceTex, others(), seatHead(i), charOf(i), busy(), mode(), level(), grade }
  const { scene, camera, world } = ctx;
  const entity = buildEntity();
  scene.add(entity);
  const hand = buildHand();
  camera.add(hand);
  const eyeLight = new THREE.PointLight('#ff9a6a', 0, 2.5, 2);
  scene.add(eyeLight);
  const backLight = new THREE.PointLight('#7a9ad8', 0, 4, 1.5);
  backLight.position.set(2.6, 1.6, -4.4);
  scene.add(backLight);
  const front = new THREE.PointLight('#b8c8ff', 0, 3, 1.6);
  scene.add(front);
  const handLight = new THREE.PointLight('#d8d0c0', 0, 0.8, 2);
  handLight.position.set(0.25, -0.1, -0.15);
  camera.add(handLight);
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.2, 6), new THREE.MeshStandardMaterial({ color: '#4a3a24', roughness: 1 }));
  rope.visible = false;
  scene.add(rope);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshStandardMaterial({ color: '#3a0202', roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.92 }));
  pool.rotation.x = -Math.PI / 2; pool.visible = false; scene.add(pool);
  const drops = [];
  const curses = ['LIAR', 'BEHIND\nYOU', 'IT SEES\nYOU', 'YOU\nNEXT', 'DON\'T\nLOOK'].map(cursedCard);

  let lightLevel = 1, lightTarget = 1, flickerUntil = 0;
  let running = false, next = 0, count = 0, jumped = false, lastName = '';
  let entityFx = null; // per-frame animation for the figure
  const timeNow = () => performance.now() / 1000;

  function lights(level, seconds = 0.15) { lightTarget = level; lightLevel = seconds <= 0 ? level : lightLevel; }
  function flicker(seconds) { flickerUntil = timeNow() + seconds; }

  function place(pos, lookAt) {
    entity.position.copy(pos);
    entity.lookAt(lookAt.x, entity.position.y, lookAt.z);
    entity.visible = true;
    const cp = camera.getWorldPosition(V3());
    if (pos.y > -0.5 && pos.distanceTo(cp) > 1.2) {
      ctx.glance(V3(pos.x, 1.6, pos.z));
      const toCam = V3(cp.x - pos.x, 0, cp.z - pos.z).normalize();
      front.position.set(pos.x + toCam.x * 0.9, 1.9, pos.z + toCam.z * 0.9);
      front.intensity = 2.2;
    }
  }
  function hide() { front.intensity = 0; entity.userData.mouth.scale.copy(entity.userData.mouth.userData.base); entity.userData.noHunch = false; ctx.glance(null); entity.visible = false; eyeLight.intensity = 0; entityFx = null; rope.visible = false; entity.rotation.z = 0; }
  function camFacing(pos) {
    const d = pos.clone().sub(camera.getWorldPosition(V3())).normalize();
    const f = V3(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
    return d.dot(f);
  }
  /** Of the candidate floor spots, which can this player actually see, clear of everyone's heads? */
  function visibleSpot(cands, { chestY = 2.0, nearPlayers = false } = {}) {
    const heads = ctx.heads().map((h) => h.clone().project(camera));
    let best = null, bestScore = -Infinity;
    for (const c of cands) {
      const p = V3(c.x, chestY, c.z).project(camera);
      // the camera glances up toward the figure, so spots a little above the frame still work
      if (p.z > 1 || Math.abs(p.x) > 0.82 || p.y > 1.45 || p.y < -0.9) continue;
      const d = heads.reduce((m, h) => Math.min(m, Math.hypot(h.x - p.x, h.y - p.y)), 9);
      if (d < (nearPlayers ? 0.16 : 0.24)) continue;
      const score = nearPlayers ? -Math.abs(d - 0.45) - Math.abs(p.x) * 0.2 : d - Math.abs(p.x) * 0.3;
      if (score > bestScore) { bestScore = score; best = c; }
    }
    return best;
  }
  function behindOthers(dist) {
    const out = [];
    for (const i of ctx.others()) {
      const b = behindSeat(i, dist);
      const side = V3(-b.z, 0, b.x).normalize();
      for (const k of [-0.6, -0.3, 0, 0.3, 0.6]) out.push(b.clone().addScaledVector(side, k));
    }
    return out;
  }
  function behindSeat(i, dist = 0.75) {
    const head = ctx.seatHead(i);
    const out = V3(head.x, 0, head.z).normalize();
    return V3(head.x, 0, head.z).addScaledVector(out, dist);
  }

  // -------------------------------------------------------------- scenarios
  const S = {
    async doorway() {
      const cands = [V3(2.6, 0, -3.75)];
      for (let x = -3.6; x <= 3.6; x += 0.6) cands.push(V3(x, 0, -3.55));
      for (let z = -3; z <= 3; z += 0.75) { cands.push(V3(-4.1, 0, z)); cands.push(V3(4.1, 0, z)); }
      const spot = visibleSpot(cands, { chestY: 2.05 });
      if (!spot) return false;
      const atDoor = Math.abs(spot.x - 2.6) < 0.3 && spot.z < -3.6;
      flicker(1.2); sfx.creak(atDoor ? 0.6 : ctx.panAt(spot), 0.3, 3.2);
      await wait(0.6);
      backLight.position.set(spot.x * 1.05, 1.7, spot.z * 1.05 - 0.2);
      backLight.intensity = 2.5;
      place(spot, camera.getWorldPosition(V3()));
      entity.userData.headPiv.rotation.z = 0.35;
      const t0 = timeNow();
      entityFx = atDoor ? () => { const k = Math.min(1, (timeNow() - t0) / 2.6); world.door.rotation.y = -k * 1.5; } : null;
      await wait(3.4);
      sfx.footsteps(0.6, 0, 2, 0.9);
      await wait(1.6);
      lights(0.02, 0); sfx.stinger();
      await wait(0.5);
      hide(); backLight.intensity = 0; world.door.rotation.y = 0; sfx.slam(0.6);
      lights(1); flicker(0.8);
    },

    async behindPlayer() {
      const p = visibleSpot(behindOthers(0.95), { nearPlayers: true, chestY: 2.05 });
      if (!p) return false;
      duckMusic(0.02, 0.3);
      lights(0, 0); sfx.whisper(ctx.panAt(p), 2.4);
      await wait(1.6);
      place(p, V3(0, 0, 0));
      entity.userData.headPiv.rotation.set(0.25, 0, -0.45);
      const ua = entity.userData.arms;
      ua.R.sh.rotation.set(-0.9, 0, -0.15); ua.L.sh.rotation.set(-0.9, 0, 0.15);
      ua.R.el.rotation.set(-0.5, 0, 0); ua.L.el.rotation.set(-0.5, 0, 0);
      eyeLight.position.copy(p).add(V3(0, 2.2, 0)); eyeLight.intensity = 1.2;
      lights(0.55, 0); flicker(1.6); sfx.stinger();
      await wait(2.4);
      lights(0, 0);
      await wait(0.35);
      hide(); ua.R.sh.rotation.set(0, 0, -0.12); ua.L.sh.rotation.set(0, 0, 0.12); ua.R.el.rotation.set(0, 0, 0); ua.L.el.rotation.set(0, 0, 0);
      lights(1); restoreMusic();
    },

    async hand() {
      if (ctx.spectating()) return false;
      sfx.breath(0.9, 0, 2);
      await wait(1.6);
      hand.visible = true; handLight.intensity = 0.8;
      const from = V3(0.45, -0.3, -0.3), to = V3(0.15, -0.09, -0.3);
      hand.rotation.set(0.3, 0.6, 0.2);
      const t0 = timeNow();
      await new Promise((r) => { const step = () => { const k = Math.min(1, (timeNow() - t0) / 1.4); hand.position.lerpVectors(from, to, k * k * (3 - 2 * k)); hand.userData.fingers.forEach((f) => { f.rotation.z = k * 0.9; }); if (k < 1) requestAnimationFrame(step); else r(); }; step(); });
      sfx.whisper(1, 1.8);
      ctx.shake(0.35);
      await wait(2.0);
      const t1 = timeNow();
      await new Promise((r) => { const step = () => { const k = Math.min(1, (timeNow() - t1) / 0.25); hand.position.lerpVectors(to, from, k); if (k < 1) requestAnimationFrame(step); else r(); }; step(); });
      hand.visible = false; handLight.intensity = 0;
    },

    async bar() {
      const cands = []; for (let cx = -1.8; cx <= 1.8; cx += 0.3) cands.push(V3(cx, 0, -3.65));
      const sp = visibleSpot(cands, { chestY: 1.3 });
      if (!sp) return false;
      const x = sp.x;
      place(V3(x, -1.05, -3.65), camera.getWorldPosition(V3()));
      front.position.set(x, 1.4, -2.9); front.intensity = 1.2;
      entity.userData.headPiv.rotation.set(0, 0, 0.5);
      eyeLight.position.set(x, 1.3, -3.3); eyeLight.intensity = 0.6;
      const t0 = timeNow();
      sfx.whisper(-0.1, 1.5, 0.5);
      while (timeNow() - t0 < 7) {
        await wait(0.2);
        if (timeNow() - t0 > 2.5 && camFacing(entity.userData.head.getWorldPosition(V3())) > 0.985) break;
      }
      entity.position.y = -2;
      sfx.thud(0, 0, 0.5);
      hide();
    },

    async hanging() {
      const p = visibleSpot(behindOthers(1.0), { chestY: 2.2 });
      if (!p) return false;
      place(V3(p.x, 0.9, p.z), camera.getWorldPosition(V3()));
      entity.visible = false;
      entity.userData.headPiv.rotation.set(0.7, 0, 0.6);
      rope.position.set(p.x, 2.6, p.z);
      const t0 = timeNow();
      entityFx = () => { const t = timeNow() - t0; entity.rotation.z = Math.sin(t * 1.4) * 0.12; entity.visible = lightLevel < 0.5; rope.visible = entity.visible; };
      sfx.creak(0, 0, 3.5);
      for (let k = 0; k < 7; k++) { lights(k % 2 ? 1 : 0.15, 0); await wait(rnd(0.12, 0.45)); }
      lights(0.2, 0);
      await wait(1.2);
      lights(1, 0);
      hide();
    },

    async headTurn() {
      const others = ctx.others(); if (!others.length) return false;
      const i = others[Math.floor(Math.random() * others.length)];
      const ch = ctx.charOf(i); if (!ch || ch.dead) return false;
      lights(0.3);
      duckMusic(0.0, 0.5);
      await wait(0.8);
      ch.possessed = true;
      ch.eyes.forEach((e) => { e.pupil.scale.setScalar(3.4); });
      sfx.demonVoice(ctx.panOf(i), 0, 7);
      ctx.talk(ch, 2.4);
      await wait(3.0);
      flicker(0.7);
      await wait(0.7);
      ch.possessed = false;
      lights(1); restoreMusic();
    },

    async cards() {
      const shown = ctx.handCards.filter((c) => c.visible);
      if (!shown.length) return false;
      const saved = shown.map((c) => c.userData.face.material.map);
      sfx.glitch();
      shown.forEach((c, k) => { const t = curses[(k + count) % curses.length]; c.userData.face.material.map = t; c.userData.face.material.emissiveMap = t; c.userData.cursed = true; });
      await wait(1.5);
      sfx.glitch();
      shown.forEach((c, k) => { c.userData.face.material.map = saved[k]; c.userData.face.material.emissiveMap = saved[k]; c.userData.cursed = false; });
    },

    async blood() {
      const at = V3(rnd(-0.3, 0.3), 0, rnd(-0.3, 0.1));
      pool.position.set(at.x, 0.785, at.z); pool.scale.setScalar(0.001); pool.visible = true; pool.material.opacity = 0.92;
      for (let k = 0; k < 26; k++) {
        const d = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 6), pool.material);
        d.position.set(at.x, 2.9, at.z); d.userData.v = 0; scene.add(d); drops.push(d);
        sfx.bloodDrip(0, 0.5);
        await wait(rnd(0.25, 0.6));
      }
      await wait(8);
      for (let k = 0; k <= 20; k++) { pool.material.opacity = 0.92 * (1 - k / 20); await wait(0.15); }
      pool.visible = false;
    },

    async radio() {
      duckMusic(0, 0.1);
      sfx.staticNoise(1.2);
      lights(0.4);
      await wait(1.0);
      sfx.demonVoice(-0.7, 0, 9);
      await wait(3.2);
      sfx.staticNoise(0.6);
      await wait(0.6);
      lights(1); restoreMusic();
    },

    async footsteps() {
      for (let k = 0; k < 6; k++) { sfx.footsteps(-1 + k * 0.4, 0, 1); await wait(0.85); }
      sfx.creak(0.8, 0, 1.2);
      await wait(1.5);
    },

    async jumpscare() {
      if (ctx.spectating()) return false;
      duckMusic(0, 0.05);
      lights(0, 0);
      await wait(rnd(1.4, 2.2));
      const camPos = camera.getWorldPosition(V3());
      const f = V3(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
      place(camPos.clone().addScaledVector(f, 0.6).setY(0), camPos);
      entity.userData.noHunch = true;
      entity.userData.spine.rotation.x = 0;
      entity.userData.headPiv.rotation.set(0.1, 0, 0.25);
      entity.updateMatrixWorld(true);
      const want = camPos.clone().addScaledVector(f, 0.5).add(V3(0, -0.03, 0));
      entity.position.add(want.clone().sub(entity.userData.head.getWorldPosition(V3())));
      eyeLight.color.set('#ff3a1a'); eyeLight.position.copy(want.clone().add(V3(0, -0.35, 0)).addScaledVector(f, -0.15)); eyeLight.intensity = 2.4;
      entity.userData.mouth.scale.set(1.5, 4.2, 0.6);
      lights(0.05, 0);
      sfx.screech();
      ctx.shake(2.5);
      await wait(0.6);
      hide(); eyeLight.color.set('#ff9a6a');
      lights(0, 0);
      await wait(0.5);
      lights(1); restoreMusic();
    },
  };

  const WEIGHTS = { doorway: 3, behindPlayer: 3, hand: 2, bar: 2, hanging: 2, headTurn: 2, cards: 2, blood: 2, radio: 1, footsteps: 2, jumpscare: 1 };

  function pickScenario() {
    const names = Object.keys(WEIGHTS).filter((n) => n !== lastName && (n !== 'jumpscare' || (!jumped && count >= 3)));
    const total = names.reduce((t, n) => t + WEIGHTS[n], 0);
    let r = Math.random() * total;
    for (const n of names) { r -= WEIGHTS[n]; if (r <= 0) return n; }
    return names[0];
  }

  async function run(name) {
    running = true;
    try {
      const ok = await S[name]();
      if (ok !== false) { count += 1; lastName = name; if (name === 'jumpscare') jumped = true; }
    } catch (e) { console.error('scare', name, e); }
    hide(); hand.visible = false; lights(1); backLight.intensity = 0;
    running = false;
  }

  function schedule(first = false) {
    const lvl = ctx.level();
    const [a, b] = lvl === 'intense' ? (first ? [20, 40] : [28, 55]) : first ? [45, 75] : [55, 110];
    next = timeNow() + rnd(a, b);
  }

  return {
    entity,
    reset() { count = 0; jumped = false; lastName = ''; schedule(true); },
    trigger(name) { if (!running && S[name]) run(name); },
    /** Test hook: run a scenario with its waits shortened to nothing, stopping at its scariest frame. */
    async freeze(name, atStep) { stepNo = 0; freezeAt = atStep; freezeHit = null; running = true; const p = S[name]().catch(() => {}).finally(() => { running = false; hide(); hand.visible = false; lights(1); backLight.intensity = 0; }); await new Promise((r) => { const chk = () => (freezeHit !== null ? r() : setTimeout(chk, 20)); chk(); }); return p; },
    release() { freezeAt = -1; if (freezeHit) freezeHit(); },
    isRunning: () => running,
    update(dt) {
      const now = timeNow();
      // light level: smooth fade plus random flicker
      lightLevel += (lightTarget - lightLevel) * Math.min(1, dt * 8);
      let lv = lightLevel;
      if (now < flickerUntil) lv *= Math.random() < 0.45 ? 0.08 : 1;
      for (const f of world.flicker) {
        f.light.intensity *= lv;
        if (f.mat) { f.mat.transparent = true; f.mat.opacity *= Math.max(0.05, lv); }
      }
      for (const s of world.lights.steady) s.light.intensity = s.base * Math.max(0.04, lv);
      if (ctx.grade) ctx.grade.uniforms.vig.value = 1 + (1 - lv) * 0.6;
      if (entityFx) entityFx();
      if (entity.visible) {
        entity.userData.eyes.forEach((e) => { e.material.opacity = 0.6 + Math.random() * 0.4; });
        if (!entity.userData.noHunch) entity.userData.spine.rotation.x = 0.25 + Math.sin(now * 0.9) * 0.02;
      }
      for (let k = drops.length - 1; k >= 0; k--) {
        const d = drops[k];
        d.userData.v += 9.8 * dt;
        d.position.y -= d.userData.v * dt;
        if (d.position.y <= 0.79) {
          scene.remove(d); drops.splice(k, 1);
          pool.scale.setScalar(Math.min(0.22, pool.scale.x + 0.009));
        }
      }
      // the scheduler
      if (ctx.mode() !== 'game' || ctx.level() === 'off') { next = Math.max(next, now + 10); return; }
      if (!next) schedule(true);
      if (!running && now > next && !ctx.busy()) { run(pickScenario()); schedule(); }
    },
  };
}
