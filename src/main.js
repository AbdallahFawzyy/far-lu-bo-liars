import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import * as G from './game.js';
import * as A from './audio.js';
import * as C from './characters.js';
import * as W from './world.js';
import * as T from './textures.js';
import { getRoom, openTable, randomCode, cleanName } from './net.js';
import { initHorror } from './horror.js';

const $ = (id) => document.getElementById(id);
const SPEEDS = { slow: 1.45, normal: 1, fast: 0.6 };
const CHAR_ORDER = ['bob', 'coin', 'wait', 'dog'];
const RANK_NAME = { K: 'King', Q: 'Queen', A: 'Ace', J: 'Joker' };
const TURN_LIMIT = 45;

const app = {
  mode: 'menu', // menu | lobby | game
  speed: 'normal',
  g: null, // the state being presented
  mySeat: -1,
  myPeer: 'local',
  isHost: true,
  table: null,
  myName: 'You',
  myChar: 'bob',
  seats: 3,
  autoplay: false,
  selected: new Set(),
  quality: 'high',
  scares: 'on', // off | on | intense
};
const S = () => SPEEDS[app.speed] || 1;
const sleep = (sec) => new Promise((r) => setTimeout(r, sec * 1000 * S() * pres.scale));
const pick = (arr, id) => arr[Math.abs(id * 2654435761) % arr.length];

// ------------------------------------------------------------------ renderer

const stage = $('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.45;
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.02, 40);
scene.add(camera);

const pmrem = new THREE.PMREMGenerator(renderer);
const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const world = W.buildWorld(scene);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.5, 0.45, 0.82);
composer.addPass(bloom);
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, vig: { value: 1.0 }, red: { value: 0 }, desat: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float time; uniform float vig; uniform float red; uniform float desat; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + time) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float g = dot(c.rgb, vec3(0.299,0.587,0.114));
      c.rgb = mix(c.rgb, vec3(g), desat);
      float d = distance(vUv, vec2(0.5));
      c.rgb *= mix(1.0, smoothstep(0.85, 0.25, d), 0.75 * vig);
      c.rgb = mix(c.rgb, c.rgb * vec3(1.4,0.35,0.3), red * smoothstep(0.2, 0.75, d));
      c.rgb += (h(vUv * 800.0) - 0.5) * 0.045;
      gl_FragColor = c;
    }`,
});
composer.addPass(grade);
composer.addPass(new OutputPass());

function resize() {
  const w = stage.clientWidth || window.innerWidth, h = stage.clientHeight || window.innerHeight;
  renderer.setSize(w, h);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.fov = w / h < 0.8 ? 72 : 55;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ------------------------------------------------------------------ cast

const faceTex = { K: T.cardFace('K'), Q: T.cardFace('Q'), A: T.cardFace('A'), J: T.cardFace('J') };
const backTex = T.cardBack();
const backMat = new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.6, side: THREE.DoubleSide });

const chars = {};
for (const id of CHAR_ORDER) {
  const ch = C.buildCharacter(id);
  C.attachFan(ch, backMat);
  ch.root.visible = false;
  scene.add(ch.root);
  chars[id] = ch;
}
const chairs = [0, 1, 2, 3].map(() => { const c = W.buildChair(); c.visible = false; scene.add(c); return c; });
const guns = [0, 1, 2, 3].map(() => {
  const g = W.buildRevolver();
  g.traverse((o) => { if (o.isMesh && o.material.metalness > 0.5) { o.material = o.material.clone(); o.material.envMap = envMap; o.material.envMapIntensity = 0.9; } });
  g.visible = false;
  scene.add(g);
  return { obj: g, mode: 'rest', rest: new THREE.Object3D(), t: 0, owner: -1 };
});
const fpGun = W.buildRevolver();
fpGun.traverse((o) => { if (o.isMesh && o.material.metalness > 0.5) { o.material = o.material.clone(); o.material.envMap = envMap; } });
fpGun.visible = false;
camera.add(fpGun);

// my hand: 3D cards attached to the camera
const handG = new THREE.Group();
camera.add(handG);
const handCards = [];
for (let i = 0; i < 5; i++) {
  const c = W.cardMesh(faceTex.K, backTex);
  c.userData.idx = i;
  c.visible = false;
  c.userData.face.material.emissive = new THREE.Color('#ffffff');
  c.userData.face.material.emissiveIntensity = 0.55;
  handG.add(c);
  handCards.push(c);
}
const pileG = new THREE.Group();
pileG.position.set(0, W.TABLE_Y + 0.003, 0);
scene.add(pileG);
const flying = [];

// blood left on the felt where someone fell
const bloodMat = new THREE.MeshStandardMaterial({ color: '#4a0303', roughness: 0.2, transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
const stains = [];
function bloodAt(pos, dir) {
  for (let i = 0; i < 26; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.01 + Math.random() * 0.012, 6, 5), bloodMat);
    m.position.copy(pos);
    scene.add(m);
    const v = dir.clone().multiplyScalar(1.2 + Math.random() * 1.6).add(new THREE.Vector3((Math.random() - 0.5) * 0.8, Math.random() * 0.9, (Math.random() - 0.5) * 0.8));
    puffs.push({ m, v, life: 1.2, blood: true });
  }
  const stain = new THREE.Mesh(new THREE.CircleGeometry(0.16 + Math.random() * 0.06, 24), bloodMat);
  stain.rotation.x = -Math.PI / 2;
  const onTable = pos.clone().setY(0); onTable.multiplyScalar(Math.min(1, 0.55 / Math.max(0.01, onTable.length())));
  stain.position.set(onTable.x, W.TABLE_Y + 0.004, onTable.z);
  stain.scale.setScalar(0.01);
  scene.add(stain);
  stains.push(stain);
}
function clearStains() { stains.forEach((s) => scene.remove(s)); stains.length = 0; }

// ------------------------------------------------------------------ layout

const layout = { n: 3, phys: [], seatChar: [] };

function physIndex(seat) {
  const me = app.mySeat >= 0 ? app.mySeat : 0;
  return (seat - me + layout.n) % layout.n;
}
function seatWorld(seat) { return W.seatPos(physIndex(seat), layout.n); }
function charOf(seat) { const s = app.g?.seats[seat]; return s ? chars[s.char] : null; }
function headPos(seat, out = new THREE.Vector3()) {
  const ch = charOf(seat);
  if (!ch) return out.set(0, 1.4, 0);
  ch.head.getWorldPosition(out);
  return out;
}
function panOf(seat) {
  const p = seatWorld(seat).clone();
  camera.updateMatrixWorld();
  p.applyMatrix4(camera.matrixWorldInverse);
  return Math.max(-1, Math.min(1, p.x / 1.5));
}

function applyLayout(g) {
  layout.n = g.seats.length;
  for (const id of CHAR_ORDER) { chars[id].root.visible = false; C.revive(chars[id]); }
  chairs.forEach((c) => (c.visible = false));
  guns.forEach((gn) => (gn.obj.visible = false));
  g.seats.forEach((s, i) => {
    const ch = chars[s.char];
    const p = seatWorld(i);
    ch.root.position.copy(p);
    ch.root.lookAt(0, 0, 0);
    ch.root.visible = !(i === app.mySeat && s.alive);
    ch.idlePose = 'hold';
    C.setPose(ch, 'hold');
    if (!s.alive) C.kill(ch, null);
    const chair = chairs[i];
    chair.visible = true;
    chair.position.copy(p.clone().multiplyScalar(1.04));
    chair.lookAt(0, 0, 0);
    // revolver lies on the felt in front of each player
    const gn = guns[i];
    gn.obj.visible = true;
    gn.mode = 'rest';
    const dir = p.clone().normalize();
    gn.rest.position.copy(dir.clone().multiplyScalar(0.62)).add(new THREE.Vector3(0, W.TABLE_Y + 0.012, 0));
    gn.rest.position.add(new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(0.18));
    gn.rest.rotation.set(-Math.PI / 2, 0, Math.atan2(dir.x, dir.z) + 0.6);
    gn.obj.position.copy(gn.rest.position);
    gn.obj.rotation.copy(gn.rest.rotation);
  });
  buildPlates(g);
}

// ------------------------------------------------------------------ camera

const cam = {
  yaw: 0, pitch: -0.32, dragYaw: 0, dragPitch: 0,
  focus: new THREE.Vector3(0, W.TABLE_Y, 0), focusTarget: new THREE.Vector3(0, W.TABLE_Y, 0),
  shake: 0, roll: 0, spectate: false, menuT: 0,
};
function setFocus(v) { cam.focusTarget.copy(v); }
function focusSeat(seat) { setFocus(headPos(seat, new THREE.Vector3()).add(new THREE.Vector3(0, -0.15, 0))); }
function focusTable() { setFocus(new THREE.Vector3(0, 1.02, 0)); }

let dragging = null;
renderer.domElement.addEventListener('pointerdown', (e) => { dragging = { x: e.clientX, y: e.clientY, moved: 0 }; });
window.addEventListener('pointermove', (e) => {
  if (!dragging) { hoverCard(e); return; }
  const dx = e.clientX - dragging.x, dy = e.clientY - dragging.y;
  dragging.moved += Math.abs(dx) + Math.abs(dy);
  dragging.x = e.clientX; dragging.y = e.clientY;
  cam.dragYaw = Math.max(-1.2, Math.min(1.2, cam.dragYaw - dx * 0.004));
  cam.dragPitch = Math.max(-0.5, Math.min(0.5, cam.dragPitch - dy * 0.003));
});
window.addEventListener('pointerup', (e) => {
  if (dragging && dragging.moved < 8) clickCard(e);
  dragging = null;
});

function updateCamera(dt, t) {
  if (app.debugCam) { camera.position.copy(app.debugCam.pos); camera.lookAt(app.debugCam.look); return; }
  const target = cam.glance ? cam.focusTarget.clone().lerp(cam.glance, 0.5) : cam.focusTarget;
  cam.focus.lerp(target, 1 - Math.exp(-(cam.glance ? 1.5 : 3) * dt));
  if (app.mode !== 'game') {
    cam.menuT += dt * 0.08;
    const r = 2.6;
    camera.position.set(Math.sin(cam.menuT) * r, 1.75, Math.cos(cam.menuT) * r);
    camera.lookAt(0, 1.0, 0);
    return;
  }
  const eye = new THREE.Vector3();
  if (cam.spectate || app.mySeat < 0) {
    const a = t * 0.05;
    eye.set(Math.sin(a) * 2.2, 2.3, Math.cos(a) * 2.2);
  } else {
    eye.copy(W.seatPos(0, layout.n)).multiplyScalar(1.12);
    eye.y = 1.58 + Math.sin(t * 1.3) * 0.006;
  }
  camera.position.copy(eye);
  camera.lookAt(cam.focus);
  camera.rotateY(cam.dragYaw * 0.6);
  camera.rotateX(cam.dragPitch * 0.6);
  cam.dragYaw *= dragging ? 1 : 1 - Math.min(1, dt * 0.6);
  cam.dragPitch *= dragging ? 1 : 1 - Math.min(1, dt * 0.6);
  if (cam.shake > 0) {
    camera.rotateX((Math.random() - 0.5) * cam.shake * 0.04);
    camera.rotateY((Math.random() - 0.5) * cam.shake * 0.04);
    cam.shake = Math.max(0, cam.shake - dt * 2.5);
  }
  camera.rotateZ(cam.roll);
}

// ------------------------------------------------------------------ my hand

const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let hovered = -1;

function layoutHand(dt = 1) {
  const g = app.g;
  const hand = g && app.mySeat >= 0 ? g.seats[app.mySeat].hand : '';
  const show = app.mode === 'game' && app.mySeat >= 0 && g.seats[app.mySeat].alive && !cam.spectate && !pres.hideHand;
  const n = hand.length;
  const narrow = camera.aspect < 0.8;
  handCards.forEach((c, i) => {
    const vis = show && i < n;
    c.visible = vis;
    if (!vis) return;
    if (!c.userData.cursed) {
      c.userData.face.material.map = faceTex[hand[i]];
      c.userData.face.material.emissiveMap = faceTex[hand[i]];
    }
    const spread = narrow ? 0.07 : 0.095;
    const x = (i - (n - 1) / 2) * spread;
    const sel = app.selected.has(i);
    const lift = (sel ? 0.045 : 0) + (hovered === i ? 0.015 : 0);
    const tx = x, ty = (narrow ? -0.25 : -0.2) + lift - Math.abs(i - (n - 1) / 2) * 0.008, tz = -0.48 + i * 0.002;
    c.position.x += (tx - c.position.x) * Math.min(1, dt * 12);
    c.position.y += (ty - c.position.y) * Math.min(1, dt * 12);
    c.position.z = tz;
    c.rotation.set(-0.15, 0, -(i - (n - 1) / 2) * 0.07);
    c.userData.face.material.emissive.set(sel ? '#ffd890' : '#ffffff');
    c.userData.face.material.emissiveIntensity = sel ? 0.8 : 0.55;
  });
}

function cardAt(e) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(handCards.filter((c) => c.visible), true);
  if (!hits.length) return -1;
  let o = hits[0].object;
  while (o && o.userData.idx === undefined) o = o.parent;
  return o ? o.userData.idx : -1;
}
function hoverCard(e) { hovered = app.mode === 'game' ? cardAt(e) : -1; renderer.domElement.style.cursor = hovered >= 0 ? 'pointer' : 'grab'; }
function clickCard(e) {
  if (app.mode !== 'game') return;
  const i = cardAt(e);
  if (i < 0) return;
  toggleCard(i);
}
function toggleCard(i) {
  const g = app.g;
  if (!g || app.mySeat < 0 || i >= g.seats[app.mySeat].hand.length) return;
  if (app.selected.has(i)) { app.selected.delete(i); A.sfx.select(false); } else if (app.selected.size < 3) { app.selected.add(i); A.sfx.select(true); }
  updateControls();
}

// ------------------------------------------------------------------ HUD

const plates = $('plates');
let plateEls = [];
function buildPlates(g) {
  plates.textContent = '';
  plateEls = g.seats.map((s, i) => {
    const el = document.createElement('div');
    el.className = 'plate';
    const nm = document.createElement('div'); nm.className = 'pname';
    nm.textContent = i === app.mySeat && s.name !== 'You' ? `${s.name} (you)` : s.name;
    const meta = document.createElement('div'); meta.className = 'pmeta';
    const cards = document.createElement('span'); cards.className = 'pcards';
    const ch = document.createElement('span'); ch.className = 'chambers';
    for (let k = 0; k < 6; k++) { const d = document.createElement('i'); ch.appendChild(d); }
    meta.append(cards, ch);
    const status = document.createElement('div'); status.className = 'pstatus';
    const bubble = document.createElement('div'); bubble.className = 'bubble'; bubble.hidden = true;
    el.append(bubble, nm, meta, status);
    plates.appendChild(el);
    return { el, nm, cards, ch, status, bubble, bubbleT: 0 };
  });
  refreshPlates();
}

function refreshPlates() {
  const g = app.g;
  if (!g) return;
  g.seats.forEach((s, i) => {
    const p = plateEls[i];
    if (!p) return;
    const shown = pres.counts[i] ?? s.hand.length;
    p.cards.textContent = s.alive ? `${shown} card${shown === 1 ? '' : 's'}` : 'out';
    [...p.ch.children].forEach((d, k) => { d.className = k < (pres.shots[i] ?? s.shots) ? 'fired' : ''; });
    p.el.classList.toggle('dead', !(pres.alive[i] ?? s.alive));
    p.el.classList.toggle('active', g.phase === 'turn' && g.turn === i && pres.idle);
    p.el.classList.toggle('me', i === app.mySeat);
  });
}

const tmpV = new THREE.Vector3();
function positionPlates() {
  const g = app.g;
  if (!g || app.mode !== 'game') return;
  const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
  g.seats.forEach((s, i) => {
    const p = plateEls[i];
    if (!p) return;
    if (i === app.mySeat && !cam.spectate) {
      p.el.style.transform = '';
      p.el.classList.add('docked');
      return;
    }
    p.el.classList.remove('docked');
    headPos(i, tmpV);
    tmpV.y += 0.62;
    tmpV.project(camera);
    const behind = tmpV.z > 1;
    const x = (tmpV.x * 0.5 + 0.5) * w, y = (-tmpV.y * 0.5 + 0.5) * h;
    const cx = Math.max(70, Math.min(w - 70, x)), cy = Math.max(110, Math.min(h - 40, y));
    p.el.style.transform = `translate(${Math.round(cx)}px, ${Math.round(cy)}px) translate(-50%, -100%)`;
    p.el.style.opacity = behind ? 0 : 1;
  });
}

function say(seat, kind, id = Math.floor(Math.random() * 1000), { excited = false, hold = 0 } = {}) {
  const s = app.g?.seats[seat];
  if (!s) return 0;
  const lines = C.LINES[s.char][kind];
  if (!lines) return 0;
  const text = pick(lines, id + seat * 7);
  const dur = A.speak(s.char, text, panOf(seat), { excited });
  const ch = chars[s.char];
  C.talk(ch, dur);
  const p = plateEls[seat];
  if (p) {
    p.bubble.textContent = text;
    p.bubble.hidden = false;
    p.bubbleT = performance.now() + (dur + 1.4 + hold) * 1000;
  }
  if (seat === app.mySeat) toast(`You: “${text}”`);
  return dur;
}

let toastT = 0;
function toast(text, ms = 2600) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  toastT = performance.now() + ms;
}
function log(text) {
  const el = $('ticker');
  const row = document.createElement('div');
  row.textContent = text;
  el.prepend(row);
  while (el.children.length > 5) el.lastChild.remove();
}

function banner(big, small = '', ms = 2200) {
  const el = $('banner');
  $('bannerBig').textContent = big;
  $('bannerSmall').textContent = small;
  el.hidden = false;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(banner.t);
  banner.t = setTimeout(() => { el.hidden = true; }, ms * S());
}

function updateControls() {
  const g = app.g;
  const ctl = $('controls');
  if (!g || app.mode !== 'game' || app.mySeat < 0) { ctl.hidden = true; return; }
  const myTurn = g.phase === 'turn' && g.turn === app.mySeat && pres.idle && g.seats[app.mySeat].alive;
  ctl.hidden = !myTurn;
  if (!myTurn) { app.selected.clear(); return; }
  const o = G.options(g);
  const n = app.selected.size;
  const playBtn = $('btnPlay'), liarBtn = $('btnLiar');
  playBtn.disabled = !o.play || n === 0;
  playBtn.textContent = n ? `Play ${n} as ${RANK_NAME[g.table]}${n > 1 ? 's' : ''}` : 'Pick 1–3 cards';
  liarBtn.hidden = !o.call;
  liarBtn.textContent = o.forced ? 'Call LIAR (forced)' : 'LIAR!';
  const last = g.last;
  $('ctlHint').textContent = o.forced
    ? 'Everyone else is out of cards. You have to call.'
    : last && last.s !== app.mySeat
      ? `${g.seats[last.s].name} claims ${last.cards.length} ${RANK_NAME[g.table]}${last.cards.length > 1 ? 's' : ''}. Believe it and play, or call.`
      : `Your lead. Play 1–3 cards claimed as ${RANK_NAME[g.table]}s.`;
}

$('btnPlay').addEventListener('click', () => {
  if (!app.selected.size) return;
  sendAction({ type: 'play', idx: [...app.selected].sort((a, b) => a - b) });
});
$('btnLiar').addEventListener('click', () => sendAction({ type: 'call' }));
window.addEventListener('keydown', (e) => {
  if (app.mode !== 'game' || e.target.tagName === 'INPUT') return;
  if (e.key >= '1' && e.key <= '5') toggleCard(Number(e.key) - 1);
  if (e.key === 'Enter' && !$('btnPlay').disabled && !$('controls').hidden) $('btnPlay').click();
  if ((e.key === 'l' || e.key === 'L') && !$('btnLiar').hidden && !$('controls').hidden) $('btnLiar').click();
});

// ------------------------------------------------------------------ presenter

const pres = {
  queue: [], running: false, lastId: 0, scale: 1, idle: true,
  counts: {}, shots: {}, alive: {}, hideHand: false, round: 0,
};

/** Receive a state snapshot (host: local copy; guest: from the network). */
function present(g) {
  const first = !app.g || app.g.seed === undefined || app.g.__gid !== g.__gid;
  app.g = g;
  app.speed = g.speed || app.speed;
  if (first) {
    app.mySeat = g.seats.findIndex((s) => s.peer === app.myPeer);
    pres.lastId = g.evId; pres.queue = []; pres.counts = {}; pres.shots = {}; pres.alive = {};
    cam.spectate = app.mySeat < 0 || !g.seats[app.mySeat].alive;
    applyLayout(g);
    clearStains();
    horror.reset();
    $('tableCard').hidden = false;
    setTableCard(g.table);
    pileG.clear();
    // a fresh game starts with events we have not played yet
    if (g.evId <= 2) pres.lastId = 0;
  }
  for (const ev of g.events) if (ev.id > pres.lastId) { pres.queue.push(ev); pres.lastId = ev.id; }
  pump();
  if (pres.idle) { refreshPlates(); updateControls(); }
}

async function pump() {
  if (pres.running) return;
  pres.running = true;
  pres.idle = false;
  updateControls();
  while (pres.queue.length) {
    pres.scale = pres.queue.length > 3 ? 0.25 : 1;
    const ev = pres.queue.shift();
    try { await handle(ev); } catch (err) { console.error('event', ev, err); }
  }
  pres.scale = 1;
  pres.running = false;
  pres.idle = true;
  syncStatic();
  refreshPlates();
  updateControls();
  idleLooks();
}

function syncStatic() {
  const g = app.g;
  if (!g) return;
  pres.counts = {}; pres.shots = {}; pres.alive = {};
  g.seats.forEach((s, i) => {
    const ch = chars[s.char];
    ch.fanCount = s.hand.length;
    if (!s.alive && !ch.dead) C.kill(ch, null);
  });
  setTableCard(g.table);
  if (g.phase === 'over') showOver(g);
}

function setTableCard(r) {
  $('tableRank').textContent = RANK_NAME[r] + 's';
  $('tableIcon').textContent = r;
}

function idleLooks() {
  const g = app.g;
  if (!g) return;
  g.seats.forEach((s, i) => {
    const ch = chars[s.char];
    if (ch.dead) return;
    if (g.phase === 'turn' && g.turn !== i) C.lookAt(ch, headPos(g.turn, new THREE.Vector3()));
    else C.lookAt(ch, new THREE.Vector3(0, W.TABLE_Y, 0));
    if (g.phase === 'turn' && g.turn === i) {
      const think = { bob: 'beard', coin: 'akimbo', wait: 'waitHand', dog: 'hold' }[s.char];
      C.setPose(ch, think);
      C.express(ch, s.char === 'wait' ? 'suspicious' : 'neutral');
    } else {
      C.setPose(ch, 'hold');
    }
  });
  if (g.phase === 'turn') { if (g.turn === app.mySeat && !cam.spectate) focusTable(); else focusSeat(g.turn); }
}

function flyCard(from, to, { delay = 0, dur = 0.55, face = null, flip = false, keep = true, rotY = 0 } = {}) {
  return new Promise((res) => {
    const c = W.cardMesh(face ? faceTex[face] : faceTex.K, backTex);
    c.position.copy(from);
    c.visible = false;
    scene.add(c);
    flying.push({ c, from: from.clone(), to: to.clone(), t: -delay, dur: dur * S() * pres.scale, flip, keep, rotY, res });
  });
}
function updateFlying(dt) {
  for (let i = flying.length - 1; i >= 0; i--) {
    const f = flying[i];
    f.t += dt;
    if (f.t < 0) continue;
    f.c.visible = true;
    const k = Math.min(1, f.t / f.dur);
    const e = k * k * (3 - 2 * k);
    f.c.position.lerpVectors(f.from, f.to, e);
    f.c.position.y += Math.sin(k * Math.PI) * 0.25;
    f.c.rotation.set(-Math.PI / 2 + (f.flip ? 0 : Math.PI), 0, f.rotY + (1 - e) * 2);
    if (k >= 1) {
      flying.splice(i, 1);
      if (f.keep) { pileG.attach(f.c); } else { scene.remove(f.c); }
      f.res(f.c);
    }
  }
}

function fanWorld(seat) {
  if (seat === app.mySeat && !cam.spectate) {
    const v = new THREE.Vector3(0, -0.18, -0.45);
    return camera.localToWorld(v);
  }
  const ch = charOf(seat);
  const v = new THREE.Vector3();
  (ch?.handFan || ch?.root)?.getWorldPosition(v);
  return v;
}

async function handle(ev) {
  const g = app.g;
  const name = (i) => g.seats[i]?.name ?? '?';
  switch (ev.t) {
    case 'deal': {
      pres.round = ev.round;
      pres.hideHand = true;
      pileG.clear();
      app.selected.clear();
      g.seats.forEach((s, i) => { if (s.alive) { chars[s.char].fanCount = 0; pres.counts[i] = 0; } });
      refreshPlates();
      A.sfx.shuffle();
      focusTable();
      log(`Round ${ev.round}: ${RANK_NAME[ev.table]}s' table`);
      setTableCard(ev.table);
      banner(`${RANK_NAME[ev.table]}s' Table`, `Round ${ev.round}`, 2400);
      await sleep(0.5);
      const center = new THREE.Vector3(0, W.TABLE_Y + 0.05, 0);
      const jobs = [];
      let k = 0;
      for (let r = 0; r < G.HAND_SIZE; r++) {
        g.seats.forEach((s, i) => {
          if (!s.alive) return;
          const target = fanWorld(i);
          jobs.push(flyCard(center, target, { delay: k * 0.05 * S(), dur: 0.35, keep: false }).then(() => {
            chars[s.char].fanCount = Math.min(G.HAND_SIZE, (chars[s.char].fanCount || 0) + 1);
            pres.counts[i] = chars[s.char].fanCount;
            refreshPlates();
          }));
          if (k % 3 === 0) A.sfx.cardSlide(panOf(i), k * 0.05 * S());
          k++;
        });
      }
      await Promise.all(jobs);
      pres.hideHand = false;
      await sleep(0.6);
      break;
    }
    case 'turn': {
      const s = g.seats[ev.s];
      if (ev.s === app.mySeat && s.alive) { toast('Your turn', 1400); A.sfx.ui(); }
      if (s && ev.s !== app.mySeat) focusSeat(ev.s);
      g.seats.forEach((o, i) => { if (i !== ev.s && !chars[o.char].dead) C.lookAt(chars[o.char], headPos(ev.s, new THREE.Vector3())); });
      await sleep(0.2);
      break;
    }
    case 'play': {
      const s = g.seats[ev.s];
      const ch = chars[s.char];
      if (ev.s !== app.mySeat) focusSeat(ev.s);
      C.setPose(ch, 'playCards');
      C.express(ch, Math.random() < 0.5 ? 'smug' : 'neutral');
      C.lookAt(ch, new THREE.Vector3(0, W.TABLE_Y, 0));
      if (ev.id % 3 !== 0 || ev.n === 3) say(ev.s, 'play', ev.id);
      log(`${name(ev.s)} plays ${ev.n} ${RANK_NAME[g.table]}${ev.n > 1 ? 's' : ''}`);
      await sleep(0.35);
      const from = fanWorld(ev.s);
      const jobs = [];
      for (let j = 0; j < ev.n; j++) {
        const a = Math.random() * 0.4 - 0.2;
        const to = new THREE.Vector3(Math.sin(pres.round + pileG.children.length) * 0.12 + (Math.random() - 0.5) * 0.06, W.TABLE_Y + 0.004 + pileG.children.length * 0.0012 + j * 0.0012, Math.cos(pileG.children.length) * 0.1);
        jobs.push(flyCard(from, to, { delay: j * 0.12, dur: 0.5, rotY: a + physIndex(ev.s) }));
        A.sfx.cardSlide(panOf(ev.s), j * 0.12 * S());
      }
      ch.fanCount = Math.max(0, ch.fanCount - ev.n);
      pres.counts[ev.s] = ev.left;
      refreshPlates();
      await Promise.all(jobs);
      A.sfx.thud(panOf(ev.s), 0, 0.15);
      await sleep(0.4);
      C.setPose(ch, 'hold');
      break;
    }
    case 'call': {
      const s = g.seats[ev.s];
      const ch = chars[s.char];
      A.sfx.liar();
      A.duckMusic(0.06);
      focusSeat(ev.s);
      C.setPose(ch, s.char === 'wait' ? 'waitHand' : 'point');
      C.express(ch, 'angry');
      C.lookAt(ch, headPos(ev.target, new THREE.Vector3()));
      say(ev.s, 'call', ev.id, { excited: true });
      banner('LIAR!', `${name(ev.s)} calls out ${name(ev.target)}${ev.forced ? ' (forced)' : ''}`, 2000);
      log(`${name(ev.s)} calls LIAR on ${name(ev.target)}`);
      g.seats.forEach((o, i) => { if (i !== ev.s && !chars[o.char].dead) { C.lookAt(chars[o.char], headPos(ev.s, new THREE.Vector3())); C.express(chars[o.char], 'shocked'); } });
      cam.shake = 0.5;
      await sleep(1.5);
      C.setPose(ch, 'hold');
      break;
    }
    case 'reveal': {
      const n = ev.cards.length;
      focusTable();
      const last = pileG.children.slice(-n);
      // lift the claimed cards and flip them face up for everyone
      for (let j = 0; j < n; j++) {
        const c = last[j];
        if (!c) continue;
        c.userData.face.material = c.userData.face.material.clone();
        c.userData.face.material.map = faceTex[ev.cards[j]];
        const truthy = G.isTruth(ev.cards[j], g.table);
        c.userData.face.material.emissive = new THREE.Color(truthy ? '#0d2a0d' : '#3a0505');
        A.sfx.cardFlip(0, j * 0.25 * S());
        const startY = c.position.y;
        const tx = (j - (n - 1) / 2) * 0.12;
        const anim = { t: 0 };
        await new Promise((res) => {
          const step = () => {
            anim.t += 0.016 / (0.35 * S() * pres.scale);
            const k = Math.min(1, anim.t);
            c.position.set(c.position.x + (tx - c.position.x) * 0.2, startY + Math.sin(k * Math.PI) * 0.12 + k * 0.02, c.position.z * (1 - k * 0.2));
            c.rotation.set(-Math.PI / 2 + Math.PI * (1 - k), 0, 0);
            if (k < 1) requestAnimationFrame(step); else res();
          };
          step();
        });
      }
      A.sfx.reveal(ev.lie);
      const loser = g.seats[ev.loser];
      const liarSeat = ev.s;
      const caller = g.seats.findIndex((_, i) => i !== liarSeat && i === ev.loser) >= 0 ? ev.loser : -1;
      void caller;
      const shown = ev.cards.split('').map((c) => RANK_NAME[c]).join(', ');
      if (ev.lie) {
        banner('Caught lying', `${g.seats[liarSeat].name} played ${shown}`, 2400);
        log(`${g.seats[liarSeat].name} was lying (${shown})`);
        say(liarSeat, 'caught', ev.id, { hold: 0.5 });
        C.setPose(chars[g.seats[liarSeat].char], 'facepalm');
        C.express(chars[g.seats[liarSeat].char], 'sad');
      } else {
        banner('It was true', `${g.seats[liarSeat].name} played ${shown}`, 2400);
        log(`${g.seats[liarSeat].name} told the truth (${shown})`);
        say(liarSeat, 'truth', ev.id, { hold: 0.5 });
        C.setPose(chars[g.seats[liarSeat].char], g.seats[liarSeat].char === 'coin' ? 'akimbo' : 'shrug');
        C.express(chars[g.seats[liarSeat].char], 'smug');
      }
      g.seats.forEach((o, i) => { if (i === ev.loser && !chars[o.char].dead) C.express(chars[o.char], 'scared'); });
      void loser;
      await sleep(2.6);
      break;
    }
    case 'shot':
      await roulette(ev);
      break;
    case 'win': {
      const s = g.seats[ev.s];
      if (!s) break;
      const ch = chars[s.char];
      C.setPose(ch, 'celebrate');
      C.express(ch, 'happy');
      focusSeat(ev.s);
      A.sfx.win();
      say(ev.s, 'win', ev.id, { excited: true });
      log(`${s.name} is the last one standing`);
      await sleep(1.5);
      break;
    }
    default:
      break;
  }
}

async function roulette(ev) {
  pres.inRoulette = true;
  try { await rouletteInner(ev); } finally { pres.inRoulette = false; }
}

async function rouletteInner(ev) {
  const g = app.g;
  const s = g.seats[ev.s];
  const ch = chars[s.char];
  const gn = guns[ev.s];
  const pan = panOf(ev.s);
  const me = ev.s === app.mySeat && !cam.spectate;
  A.duckMusic(0.02, 0.6);
  g.seats.forEach((o, i) => {
    if (i === ev.s || chars[o.char].dead) return;
    C.lookAt(chars[o.char], headPos(ev.s, new THREE.Vector3()));
    C.express(chars[o.char], 'scared');
    C.setPose(chars[o.char], 'hold');
  });
  log(`${s.name} spins the cylinder…`);
  banner('Russian roulette', `${s.name}: pull ${ev.shots} of 6`, 2600);
  // heartbeat under everything
  let beat = true;
  (async () => { let k = 0; while (beat) { A.sfx.heartbeat(0, 0.25 + Math.min(0.4, k * 0.05)); k++; await new Promise((r) => setTimeout(r, Math.max(420, 800 - k * 50))); } })();

  if (me) {
    pres.hideHand = true;
    fpGun.visible = true;
    fpGun.position.copy(FP_START);
    fpGun.quaternion.copy(FP_Q);
    gn.obj.visible = false;
    await tween(0.9, (k) => {
      fpGun.position.lerpVectors(FP_START, FP_POS, k);
      cam.roll = -0.08 * k;
    });
    grade.uniforms.red.value = 0.5;
  } else {
    focusSeat(ev.s);
    gn.mode = 'lift'; gn.t = 0; gn.owner = ev.s;
    C.setPose(ch, 'gunHead');
    C.express(ch, 'scared');
    ch.shake = 0.6;
    await sleep(0.9);
    gn.mode = 'head';
  }
  say(ev.s, 'fear', ev.id);
  ch.sweat = 1;
  await sleep(0.7);
  A.sfx.spin(pan);
  spinCylinder(me ? fpGun : gn.obj, 1.3);
  await sleep(1.3);
  A.sfx.cock(pan);
  cockHammer(me ? fpGun : gn.obj);
  await sleep(1.4 + Math.random() * 0.6);
  beat = false;
  const gunObj = me ? fpGun : gn.obj;
  if (ev.dies) {
    A.sfx.gunshot(pan);
    const muzzle = gunObj.localToWorld(gunObj.userData.muzzle.clone());
    world.lights.flash.position.copy(muzzle);
    world.lights.flash.intensity = 60;
    puff(muzzle);
    cam.shake = me ? 2.5 : 1.2;
    if (me) {
      $('flash').className = 'white';
      fpGun.visible = false;
      cam.roll = 0;
      grade.uniforms.red.value = 0;
      await sleep(0.25);
      $('flash').className = 'black';
      banner("You're out", 'The house always wins', 2600);
      ch.root.visible = true;
      C.kill(ch, scene);
      await sleep(1.8);
      cam.spectate = true;
      grade.uniforms.desat.value = 0.55;
      $('flash').className = '';
    } else {
      const hp = headPos(ev.s, new THREE.Vector3());
      const away = new THREE.Vector3(1, 0, 0).applyQuaternion(ch.root.quaternion);
      bloodAt(hp.addScaledVector(away, C.CHARACTERS[s.char].headR), away);
      C.kill(ch, scene);
      A.sfx.wigFlap(pan, 0.1);
      A.sfx.thud(pan, 0.5, 0.8);
      gn.mode = 'drop'; gn.t = 0;
      g.seats.forEach((o, i) => { if (i !== ev.s && !chars[o.char].dead) C.express(chars[o.char], 'shocked'); });
      banner(`${s.name} is out`, '', 2200);
      say(ev.s, 'die', ev.id);
    }
    log(`BANG. ${s.name} is out`);
    pres.alive[ev.s] = false;
    await sleep(1.6);
  } else {
    A.sfx.dryFire(pan);
    cam.shake = me ? 0.5 : 0.2;
    log(`*click* ${s.name} survives`);
    pres.shots[ev.s] = ev.shots;
    refreshPlates();
    await sleep(0.6);
    ch.shake = 0; ch.sweat = 0.3;
    if (me) {
      grade.uniforms.red.value = 0;
      await tween(0.6, (k) => { fpGun.position.lerpVectors(FP_POS, FP_START, k); cam.roll = -0.08 * (1 - k); });
      fpGun.visible = false;
      gn.obj.visible = true;
      say(ev.s, 'survive', ev.id);
    } else {
      C.express(ch, 'happy');
      C.setPose(ch, s.char === 'coin' ? 'akimbo' : 'celebrate');
      say(ev.s, 'survive', ev.id);
      gn.mode = 'return'; gn.t = 0;
    }
    g.seats.forEach((o, i) => { if (i !== ev.s && !chars[o.char].dead) C.express(chars[o.char], Math.random() < 0.5 ? 'suspicious' : 'neutral'); });
    await sleep(1.6);
    C.setPose(ch, 'hold');
    C.express(ch, 'neutral');
  }
  pres.shots[ev.s] = ev.shots;
  pres.hideHand = false;
  A.restoreMusic();
  refreshPlates();
}

function tween(sec, f) {
  return new Promise((res) => {
    const t0 = performance.now();
    const dur = sec * 1000 * S() * pres.scale;
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / dur);
      f(k * k * (3 - 2 * k));
      if (k < 1) requestAnimationFrame(step); else res();
    };
    step();
  });
}
function spinCylinder(gun, sec) {
  const cyl = gun.userData.cyl;
  const t0 = performance.now();
  const step = () => {
    const k = (performance.now() - t0) / (sec * 1000 * S());
    if (k > 1) return;
    cyl.rotation.x += (1 - k) * 0.6;
    requestAnimationFrame(step);
  };
  step();
}
function cockHammer(gun) {
  const h = gun.userData.hammer;
  h.rotation.z = 0.6;
  gun.userData.cyl.rotation.x += Math.PI / 3;
}

const puffs = [];
function puff(at) {
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: '#cfc8bd', transparent: true, opacity: 0.5, depthWrite: false }));
    m.position.copy(at);
    scene.add(m);
    puffs.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 0.6, Math.random() * 0.5 + 0.1, (Math.random() - 0.5) * 0.6), life: 1.6 });
  }
}

const _tp = new THREE.Vector3(), _m4 = new THREE.Matrix4();
const MUZZLE = 0.23 * W.GUN_SCALE, MUZZLE_UP = 0.04 * W.GUN_SCALE;
const GRIP = new THREE.Vector3(-0.085, -0.05, 0).multiplyScalar(W.GUN_SCALE);

/** Orientation whose +x is `dir` and whose +y leans toward `upHint`. */
function gunQuat(dir, upHint) {
  const x = dir.clone().normalize();
  const y = upHint.clone().addScaledVector(x, -upHint.dot(x)).normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  _m4.makeBasis(x, y, z);
  return new THREE.Quaternion().setFromRotationMatrix(_m4);
}

/** Where the gun sits when pressed to this character's right temple, angled up into it. */
function templePose(ch) {
  const c = C.CHARACTERS[ch.char];
  const hq = new THREE.Quaternion(); ch.head.getWorldQuaternion(hq);
  ch.head.getWorldPosition(_tp);
  const right = new THREE.Vector3(-1, 0, 0).applyQuaternion(hq);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(hq);
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(hq);
  const Rw = c.headR * c.headScale[0];
  // just outside the hair at the temple
  const temple = _tp.clone().addScaledVector(right, Rw * 1.14).addScaledVector(up, Rw * 0.12).addScaledVector(fwd, Rw * 0.05);
  const dir = right.clone().multiplyScalar(-0.93).addScaledVector(up, 0.26).addScaledVector(fwd, 0.1).normalize();
  const q = gunQuat(dir, up.clone().addScaledVector(right, 0.4));
  const y = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  const pos = temple.clone().addScaledVector(dir, -MUZZLE).addScaledVector(y, -MUZZLE_UP);
  return { pos, q, right };
}

/** Two-bone IK: put the right hand on the gun's grip. */
const _S = new THREE.Vector3(), _pq = new THREE.Quaternion();
function aimBone(bone, from, to) {
  const d = to.clone().sub(from).normalize();
  const wq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), d);
  bone.parent.getWorldQuaternion(_pq);
  bone.quaternion.copy(_pq.invert().multiply(wq));
  bone.updateMatrixWorld(true);
}
function reachGrip(ch, gunObj, right) {
  const arm = ch.arms.R;
  const target = gunObj.localToWorld(GRIP.clone().divideScalar(W.GUN_SCALE));
  arm.sh.getWorldPosition(_S);
  const a = 0.29, b = 0.33;
  const toT = target.clone().sub(_S);
  const d = Math.min(Math.max(toT.length(), 0.08), a + b - 0.002);
  const dirT = toT.normalize();
  const along = (a * a - b * b + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, a * a - along * along));
  const pole = right.clone().multiplyScalar(0.5).add(new THREE.Vector3(0, -1, 0));
  pole.addScaledVector(dirT, -pole.dot(dirT)).normalize();
  const elbow = _S.clone().addScaledVector(dirT, along).addScaledVector(pole, h);
  const wrist = _S.clone().addScaledVector(dirT, d);
  aimBone(arm.sh, _S, elbow);
  aimBone(arm.el, elbow, wrist);
  const gq = new THREE.Quaternion(); gunObj.getWorldQuaternion(gq);
  arm.wr.parent.getWorldQuaternion(_pq);
  arm.wr.quaternion.copy(_pq.invert().multiply(gq));
}

function updateGuns(dt) {
  guns.forEach((gn, i) => {
    if (!gn.obj.visible || gn.mode === 'rest') return;
    const ch = charOf(i);
    if (!ch) return;
    gn.t += dt / S();
    const { pos, q, right } = templePose(ch);
    const restQ = new THREE.Quaternion().setFromEuler(gn.rest.rotation);
    let hold = true;
    if (gn.mode === 'lift') {
      const k = Math.min(1, gn.t / 0.9);
      const e = k * k * (3 - 2 * k);
      gn.obj.position.lerpVectors(gn.rest.position, pos, e);
      gn.obj.quaternion.slerpQuaternions(restQ, q, e);
    } else if (gn.mode === 'head') {
      gn.obj.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.004 * ch.shake, (Math.random() - 0.5) * 0.004 * ch.shake, 0));
      gn.obj.quaternion.copy(q);
    } else if (gn.mode === 'return') {
      const k = Math.min(1, gn.t / 0.8);
      gn.obj.position.lerp(gn.rest.position, k);
      gn.obj.quaternion.slerp(restQ, k);
      hold = k < 0.85;
      if (k >= 1) { gn.mode = 'rest'; gn.obj.userData.hammer.rotation.z = 0; }
    } else if (gn.mode === 'drop') {
      hold = false;
      const k = Math.min(1, gn.t / 0.6);
      const tgt = gn.rest.position.clone().add(new THREE.Vector3(0.05, 0, 0.05));
      gn.obj.position.lerp(tgt, k);
      gn.obj.quaternion.slerp(new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, gn.rest.rotation.z + 2)), k);
      if (k >= 1) gn.mode = 'rest';
    }
    if (hold && !ch.dead) { gn.obj.updateMatrixWorld(true); reachGrip(ch, gn.obj, right); }
  });
}

/** First person: the gun sits low-right in view, muzzle against your right temple. */
const FP_TEMPLE = new THREE.Vector3(0.1, 0.02, 0.03);
const FP_DIR = new THREE.Vector3(-0.42, 0.45, 0.52).normalize();
const FP_Q = gunQuat(FP_DIR, new THREE.Vector3(0.6, 1, 0));
const FP_POS = FP_TEMPLE.clone().addScaledVector(FP_DIR, -MUZZLE).addScaledVector(new THREE.Vector3(0, 1, 0).applyQuaternion(FP_Q), -MUZZLE_UP);
const FP_START = new THREE.Vector3(0.35, -0.5, -0.55);

// ------------------------------------------------------------------ host director

const host = { g: null, busy: 0, think: 0, mems: {}, pending: {}, lastQ: {}, turnKey: -1, turnStart: 0, gid: 0 };

function startGame(seatSpecs) {
  const g = G.newGame(seatSpecs);
  host.gid = Math.floor(Math.random() * 1e9);
  g.__gid = host.gid;
  g.speed = app.speed;
  host.g = g;
  host.mems = {};
  g.seats.forEach((_, i) => (host.mems[i] = { played: '', claims: {} }));
  host.busy = performance.now() + 600;
  host.think = 0; host.pending = {};
  app.mode = 'game';
  showScreen('game');
  publish();
}

function publish() {
  const g = host.g;
  if (!g) return;
  const snap = JSON.parse(JSON.stringify(g));
  present(snap);
  if (app.table && app.isHost) {
    const s = { kind: 'game', g: snap };
    let txt = JSON.stringify(s);
    while (txt.length > 3800 && snap.events.length > 2) { snap.events.shift(); txt = JSON.stringify(s); }
    app.table.set({ role: 'host', s });
  }
}

function seatIsHuman(i) {
  const s = host.g.seats[i];
  if (s.bot) return false;
  if (app.autoplay && s.peer === app.myPeer) return false;
  if (s.peer === app.myPeer) return true;
  if (!app.table) return false;
  return app.table.guests().some((p) => p.peer === s.peer);
}

function observeEvents(g, fromId) {
  for (const ev of g.events) if (ev.id > fromId) G.botObserve(host.mems, g, ev);
}

function hostApply(seat, a) {
  const g = host.g;
  const before = g.evId;
  const cards = a.type === 'play' ? (a.idx || []).map((i) => g.seats[seat].hand[i]).join('') : '';
  if (!G.act(g, seat, a)) return false;
  observeEvents(g, before);
  if (cards) host.mems[seat].played += cards;
  host.busy = performance.now() + (a.type === 'play' ? 0.6 : 0.8) * 1000 * S();
  host.think = 0;
  publish();
  return true;
}

function hostStep(now) {
  const g = host.g;
  if (!g || app.mode !== 'game' || !app.isHost) return;
  // the host never runs ahead of its own animations
  if (!pres.idle) { host.busy = Math.max(host.busy, now + 250 * S()); return; }
  if (now < host.busy) return;
  if (g.phase === 'deal') {
    const before = g.evId;
    G.dealRound(g, g.turn);
    observeEvents(g, before);
    host.busy = now + 0.6 * 1000 * S();
    publish();
    return;
  }
  if (g.phase === 'roulette') {
    G.pullTrigger(g);
    host.busy = now + 0.8 * 1000 * S();
    publish();
    return;
  }
  if (g.phase !== 'turn') return;
  const seat = g.turn;
  if (host.turnKey !== g.evId) { host.turnKey = g.evId; host.turnStart = now; }
  if (seatIsHuman(seat)) {
    const s = g.seats[seat];
    const p = host.pending[s.peer];
    if (p) { delete host.pending[s.peer]; if (hostApply(seat, p)) return; }
    if (now - host.turnStart > TURN_LIMIT * 1000 * S()) hostApply(seat, G.botDecide(g, seat, host.mems[seat]));
    return;
  }
  if (!host.think) { host.think = now + (0.9 + Math.random() * 1.6) * 1000 * S(); return; }
  if (now >= host.think) hostApply(seat, G.botDecide(g, seat, host.mems[seat]));
}

let actQ = 0;
function sendAction(a) {
  A.sfx.ui();
  app.selected.clear();
  $('controls').hidden = true;
  if (app.isHost) {
    if (!hostApply(app.mySeat, a)) updateControls();
  } else if (app.table) {
    actQ += 1;
    app.table.set({ act: { q: actQ, a } });
  }
}

// ------------------------------------------------------------------ multiplayer lobby

const lobby = { code: '', players: [], seats: 3 };

async function hostTable() {
  app.isHost = true;
  toast('Opening a table…', 8000);
  let t = null, code = '';
  for (let attempt = 0; attempt < 3 && !t; attempt++) {
    code = randomCode();
    try { t = await openTable(code, 'host'); } catch (e) { if (e.code !== 'unavailable-id') break; }
  }
  if (!t) return toast('Could not open a table. Check your connection and try again.');
  $('toast').hidden = true;
  app.table = t;
  lobby.code = code;
  app.myPeer = t.me || 'host';
  t.onChange = () => {
    if (t.me) app.myPeer = t.me;
    if (app.mode === 'lobby') renderLobbyHost();
    if (app.mode === 'game') hostNetInput();
  };
  t.set({ role: 'host', name: app.myName, char: app.myChar });
  app.mode = 'lobby';
  showScreen('lobby');
  renderLobbyHost();
}

function hostNetInput() {
  for (const p of app.table.guests()) {
    const act = p.presence.act;
    if (!act || typeof act.q !== 'number') continue;
    if (act.q <= (host.lastQ[p.peer] || 0)) continue;
    host.lastQ[p.peer] = act.q;
    const a = act.a || {};
    if (a.type === 'play' && Array.isArray(a.idx)) host.pending[p.peer] = { type: 'play', idx: a.idx.slice(0, 3).map(Number) };
    else if (a.type === 'call') host.pending[p.peer] = { type: 'call' };
  }
}

function lobbyRoster() {
  const t = app.table;
  const roster = [{ peer: app.myPeer, name: app.myName, char: app.myChar, host: true }];
  const used = new Set([app.myChar]);
  for (const p of t.guests().slice(0, 3)) {
    let ch = CHAR_ORDER.includes(p.presence.char) ? p.presence.char : 'bob';
    if (used.has(ch)) ch = CHAR_ORDER.find((c) => !used.has(c));
    used.add(ch);
    roster.push({ peer: p.peer, name: cleanName(p.presence.name, 'Guest'), char: ch });
  }
  return roster;
}

function renderLobbyHost() {
  const roster = lobbyRoster();
  lobby.players = roster;
  const seats = Math.max(roster.length, lobby.seats);
  $('lobbyCode').textContent = lobby.code.toUpperCase();
  renderRoster(roster, seats);
  $('btnStart').hidden = false;
  $('lobbyWait').hidden = true;
  $('seatsRow').hidden = false;
  app.table.set({ role: 'host', s: { kind: 'lobby', code: lobby.code, players: roster, seats, speed: app.speed } });
}

function renderRoster(roster, seats) {
  const list = $('roster');
  list.textContent = '';
  for (let i = 0; i < seats; i++) {
    const p = roster[i];
    const li = document.createElement('li');
    const img = document.createElement('img');
    const label = document.createElement('div');
    const nm = document.createElement('strong');
    const sub = document.createElement('span');
    if (p) {
      img.src = portraits[p.char] || '';
      nm.textContent = p.name + (p.peer === app.myPeer ? ' (you)' : '');
      sub.textContent = C.CHARACTERS[p.char].name + (p.host ? ' · host' : '');
    } else {
      img.src = '';
      li.classList.add('empty');
      nm.textContent = 'Bot';
      sub.textContent = 'An empty chair gets a bot';
    }
    label.append(nm, sub);
    li.append(img, label);
    list.appendChild(li);
  }
}

async function joinTable(code) {
  code = (code || '').trim().toLowerCase();
  if (!/^[a-z0-9]{4}$/.test(code)) return toast('Table codes are 4 letters or numbers.');
  app.isHost = false;
  toast('Finding the table…', 15000);
  let t;
  try { t = await openTable(code, 'guest'); } catch (e) {
    return toast(e.code === 'peer-unavailable' ? 'No table with that code. Check it with the host.' : 'Could not reach that table. Check your connection and try again.', 4000);
  }
  $('toast').hidden = true;
  app.table = t;
  lobby.code = code;
  app.myPeer = t.me;
  let lastHostSeen = performance.now();
  t.onChange = () => {
    if (t.me) app.myPeer = t.me;
    const h = t.host();
    if (!h) return;
    lastHostSeen = performance.now();
    const s = h.presence.s;
    if (!s) return;
    if (s.kind === 'lobby') {
      if (app.mode === 'game') { app.mode = 'lobby'; showScreen('lobby'); }
      $('lobbyCode').textContent = String(s.code || code).toUpperCase();
      const roster = (Array.isArray(s.players) ? s.players : []).slice(0, 4).map((p) => ({
        peer: String(p.peer || ''), name: cleanName(p.name), char: CHAR_ORDER.includes(p.char) ? p.char : 'bob', host: !!p.host,
      }));
      renderRoster(roster, Math.min(4, Math.max(roster.length, Number(s.seats) || 3)));
      $('btnStart').hidden = true;
      $('seatsRow').hidden = true;
      $('lobbyWait').hidden = false;
    } else if (s.kind === 'game' && s.g && Array.isArray(s.g.seats)) {
      const g = sanitizeGame(s.g);
      if (!g) return;
      if (app.mode !== 'game') { app.mode = 'game'; showScreen('game'); }
      present(g);
    }
  };
  t.set({ role: 'guest', name: app.myName, char: app.myChar });
  app.mode = 'lobby';
  showScreen('lobby');
  $('lobbyCode').textContent = code.toUpperCase();
  $('btnStart').hidden = true;
  $('lobbyWait').hidden = false;
  $('roster').textContent = '';
  clearInterval(joinTable.watch);
  joinTable.watch = setInterval(() => {
    if (!app.table || app.isHost) return clearInterval(joinTable.watch);
    if (performance.now() - lastHostSeen > 9000) {
      toast(app.mode === 'lobby' && !t.host() ? 'No host at that table yet. Check the code.' : 'The host left the table.', 4000);
      lastHostSeen = performance.now();
    }
  }, 3000);
}

function sanitizeGame(g) {
  try {
    const seats = g.seats.slice(0, 4).map((s) => ({
      name: cleanName(s.name), char: CHAR_ORDER.includes(s.char) ? s.char : 'bob', bot: !!s.bot, peer: s.peer ? String(s.peer) : null,
      alive: !!s.alive, hand: String(s.hand || '').replace(/[^KQAJ]/g, '').slice(0, 5), shots: Math.max(0, Math.min(6, Number(s.shots) || 0)), bullet: 0,
    }));
    const events = (Array.isArray(g.events) ? g.events : []).filter((e) => e && typeof e.t === 'string' && Number.isFinite(e.id)).slice(-12).map((e) => ({
      ...e, s: Number(e.s) | 0, target: Number(e.target) | 0, loser: Number(e.loser) | 0, n: Math.max(0, Math.min(3, Number(e.n) | 0)),
      cards: String(e.cards || '').replace(/[^KQAJ]/g, '').slice(0, 3), table: G.RANKS.includes(e.table) ? e.table : 'K',
    }));
    return {
      __gid: Number(g.__gid) || 0, seed: 0, phase: String(g.phase), round: Number(g.round) || 0, table: G.RANKS.includes(g.table) ? g.table : 'K',
      turn: Number(g.turn) | 0, last: g.last && Number.isInteger(g.last.s) ? { s: g.last.s, cards: String(g.last.cards || '').replace(/[^KQAJ]/g, '').slice(0, 3) } : null,
      pile: Number(g.pile) || 0, winner: Number(g.winner) | 0, evId: Number(g.evId) || 0, events, seats,
      speed: SPEEDS[g.speed] ? g.speed : 'normal',
    };
  } catch { return null; }
}

function startFromLobby() {
  const roster = lobbyRoster();
  const n = Math.max(roster.length, lobby.seats);
  const used = new Set(roster.map((p) => p.char));
  const specs = roster.map((p) => ({ name: p.name, char: p.char, peer: p.peer, bot: false }));
  for (const c of CHAR_ORDER) { if (specs.length >= n) break; if (!used.has(c)) specs.push({ name: C.CHARACTERS[c].name, char: c, bot: true }); }
  startGame(specs);
}

// ------------------------------------------------------------------ menus

const portraits = {};
function renderPortraits() {
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setSize(256, 256);
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  for (const id of CHAR_ORDER) {
    const sc = new THREE.Scene();
    const ch = C.buildCharacter(id);
    C.setPose(ch, 'rest');
    for (let i = 0; i < 30; i++) C.updateCharacter(ch, 0.05);
    sc.add(ch.root);
    sc.add(new THREE.HemisphereLight('#ffe8d0', '#201010', 1.4));
    const key = new THREE.DirectionalLight('#ffd8a8', 2.4); key.position.set(1, 2, 2); sc.add(key);
    const rim = new THREE.DirectionalLight('#6a8aff', 1.2); rim.position.set(-2, 1, -1); sc.add(rim);
    const cm = new THREE.PerspectiveCamera(30, 1, 0.1, 10);
    const hp = new THREE.Vector3(); ch.head.getWorldPosition(hp);
    cm.position.set(0.3, hp.y + 0.1, 2.3); cm.lookAt(0, hp.y - 0.08, 0);
    C.lookAt(ch, cm.position.clone());
    for (let i = 0; i < 30; i++) C.updateCharacter(ch, 0.05);
    r.render(sc, cm);
    portraits[id] = r.domElement.toDataURL();
  }
  r.dispose();
  r.forceContextLoss();
}

function buildCharPicker() {
  const wrap = $('charPick');
  wrap.textContent = '';
  for (const id of CHAR_ORDER) {
    const b = document.createElement('button');
    b.className = 'charCard';
    b.type = 'button';
    b.dataset.id = id;
    b.setAttribute('aria-pressed', String(id === app.myChar));
    const img = document.createElement('img'); img.src = portraits[id]; img.alt = '';
    const nm = document.createElement('strong'); nm.textContent = C.CHARACTERS[id].name;
    const bl = document.createElement('span'); bl.textContent = C.CHARACTERS[id].blurb;
    b.append(img, nm, bl);
    b.addEventListener('click', () => {
      app.myChar = id;
      A.initAudio();
      A.sfx.select(true);
      [...wrap.children].forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.id === id)));
      try { localStorage.setItem('ld-char', id); } catch { /* storage blocked */ }
      if (app.table && !app.isHost) app.table.set({ char: id });
      if (app.table && app.isHost && app.mode === 'lobby') renderLobbyHost();
    });
    wrap.appendChild(b);
  }
}

function showScreen(name) {
  $('menu').hidden = name !== 'menu';
  $('lobby').hidden = name !== 'lobby';
  $('hud').hidden = name !== 'game';
  $('over').hidden = true;
  if (name !== 'game') { $('controls').hidden = true; $('tableCard').hidden = true; plates.textContent = ''; }
  if (name === 'lobby') $('lobby').append($('charPick'));
  if (name === 'menu') $('menuChars').append($('charPick'));
}

function readName() {
  app.myName = cleanName($('nameInput').value, 'You');
  try { localStorage.setItem('ld-name', app.myName); } catch { /* storage blocked */ }
}

function showOver(g) {
  const el = $('over');
  if (!el.hidden) return;
  const w = g.seats[g.winner];
  $('overTitle').textContent = w ? (g.winner === app.mySeat ? 'You walk out alive' : `${w.name} walks out alive`) : 'Nobody wins';
  $('overSub').textContent = w ? `Last one standing after ${g.round} round${g.round === 1 ? '' : 's'}.` : '';
  $('btnAgain').hidden = !app.isHost;
  $('overWait').hidden = app.isHost;
  setTimeout(() => { el.hidden = false; }, 1800 * S());
}

$('btnSolo').addEventListener('click', () => {
  A.initAudio(); readName();
  app.isHost = true; app.table = null; app.myPeer = 'local';
  const others = CHAR_ORDER.filter((c) => c !== app.myChar).slice(0, app.seats - 1);
  const specs = [{ name: app.myName, char: app.myChar, peer: 'local', bot: false }, ...others.map((c) => ({ name: C.CHARACTERS[c].name, char: c, bot: true }))];
  startGame(specs);
});
$('btnHost').addEventListener('click', () => { A.initAudio(); readName(); hostTable(); });
$('btnJoin').addEventListener('click', () => { A.initAudio(); readName(); joinTable($('codeInput').value); });
$('codeInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btnJoin').click(); });
$('btnStart').addEventListener('click', () => { A.initAudio(); startFromLobby(); });
$('btnLeaveLobby').addEventListener('click', leaveToMenu);
$('btnAgain').addEventListener('click', () => {
  if (app.table) { app.mode = 'lobby'; showScreen('lobby'); renderLobbyHost(); host.g = null; return; }
  $('btnSolo').click();
});
$('btnMenu').addEventListener('click', leaveToMenu);
$('btnQuit').addEventListener('click', leaveToMenu);
document.querySelectorAll('[name="seats"]').forEach((r) => r.addEventListener('change', (e) => {
  app.seats = Number(e.target.value); lobby.seats = app.seats;
  if (app.mode === 'lobby' && app.isHost) renderLobbyHost();
}));
document.querySelectorAll('[name="speed"]').forEach((r) => r.addEventListener('change', (e) => {
  app.speed = e.target.value;
  if (host.g) host.g.speed = app.speed;
  if (app.mode === 'lobby' && app.isHost && app.table) renderLobbyHost();
}));
document.querySelectorAll('[name="scares"]').forEach((r) => r.addEventListener('change', (e) => {
  app.scares = e.target.value;
  try { localStorage.setItem('ld-scares', app.scares); } catch { /* storage blocked */ }
}));
$('btnSound').addEventListener('click', () => {
  A.initAudio();
  A.setSound(!A.soundOn());
  $('btnSound').setAttribute('aria-pressed', String(A.soundOn()));
  $('btnSound').textContent = A.soundOn() ? 'Sound on' : 'Sound off';
});
$('btnRules').addEventListener('click', () => { $('rules').hidden = !$('rules').hidden; });
$('btnRulesClose').addEventListener('click', () => { $('rules').hidden = true; });

async function leaveToMenu() {
  host.g = null;
  app.g = null;
  app.mode = 'menu';
  cam.spectate = false;
  grade.uniforms.desat.value = 0; grade.uniforms.red.value = 0;
  pileG.clear();
  fpGun.visible = false;
  for (const id of CHAR_ORDER) { C.revive(chars[id]); chars[id].root.visible = false; }
  if (app.table) { await app.table.leave(); app.table = null; }
  menuScene();
  showScreen('menu');
}

/** Behind the menu, everyone sits at the table waiting. */
function menuScene() {
  const g = { seats: CHAR_ORDER.slice(0, 4).map((c) => ({ name: C.CHARACTERS[c].name, char: c, alive: true, hand: 'KKKKK', shots: 0 })) };
  app.mySeat = -1;
  layout.n = 4;
  const prev = app.g;
  app.g = g;
  g.seats.forEach((s, i) => {
    const ch = chars[s.char];
    ch.root.position.copy(W.seatPos(i, 4));
    ch.root.lookAt(0, 0, 0);
    ch.root.visible = true;
    ch.fanCount = 5;
    C.setPose(ch, s.char === 'coin' ? 'akimbo' : s.char === 'wait' ? 'waitHand' : s.char === 'bob' ? 'beard' : 'hold');
    const c = chairs[i]; c.visible = true; c.position.copy(W.seatPos(i, 4).multiplyScalar(1.04)); c.lookAt(0, 0, 0);
    const gn = guns[i]; gn.obj.visible = true; gn.mode = 'rest';
    const dir = W.seatPos(i, 4).normalize();
    gn.obj.position.copy(dir.clone().multiplyScalar(0.62)).add(new THREE.Vector3(-dir.z * 0.18, W.TABLE_Y + 0.012, dir.x * 0.18));
    gn.obj.rotation.set(-Math.PI / 2, 0, Math.atan2(dir.x, dir.z) + 0.6);
  });
  g.seats.forEach((s, i) => C.lookAt(chars[s.char], headPos((i + 1) % 4, new THREE.Vector3())));
  app.g = prev === undefined ? null : null;
}

// ------------------------------------------------------------------ horror

const horror = initHorror({
  scene, camera, world, handCards, grade,
  others: () => (app.g ? app.g.seats.map((s, i) => i).filter((i) => i !== app.mySeat && app.g.seats[i].alive && physIndex(i) !== 0) : []),
  seatHead: (i) => headPos(i, new THREE.Vector3()),
  charOf,
  panOf,
  panAt: (v) => { const p = v.clone().applyMatrix4(camera.matrixWorldInverse); return Math.max(-1, Math.min(1, p.x / 2)); },
  heads: () => (app.g ? app.g.seats.map((s, i) => i).filter((i) => i !== app.mySeat || cam.spectate).map((i) => headPos(i, new THREE.Vector3())) : []),
  talk: (ch, sec) => C.talk(ch, sec),
  shake: (v) => { cam.shake = Math.max(cam.shake, v); },
  glance: (v) => { cam.glance = v ? v.clone() : null; },
  spectating: () => cam.spectate || app.mySeat < 0,
  busy: () => pres.inRoulette || fpGun.visible,
  mode: () => app.mode,
  level: () => app.scares,
});

// ------------------------------------------------------------------ loop

const clock = new THREE.Clock();
let idleChat = 12;
function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;
  const now = performance.now();
  hostStep(now);
  for (const id of CHAR_ORDER) if (chars[id].root.visible || chars[id].dead) C.updateCharacter(chars[id], dt);
  W.updateWorld(world, dt, t);
  horror.update(dt);
  for (const id of CHAR_ORDER) if (chars[id].possessed) C.lookAt(chars[id], camera.getWorldPosition(new THREE.Vector3()));
  for (const st of stains) if (st.scale.x < 1) st.scale.setScalar(Math.min(1, st.scale.x + dt * 0.5));
  updateGuns(dt);
  updateFlying(dt);
  for (let i = puffs.length - 1; i >= 0; i--) {
    const p = puffs[i];
    p.life -= dt;
    p.m.position.addScaledVector(p.v, dt);
    if (p.blood) { p.v.y -= 9.8 * dt; if (p.m.position.y < W.TABLE_Y) { p.m.position.y = W.TABLE_Y; p.v.set(0, 0, 0); } p.life -= dt * 0.2; if (p.life <= 0) { scene.remove(p.m); puffs.splice(i, 1); } continue; }
    p.v.multiplyScalar(0.96);
    p.m.scale.setScalar(1 + (1.6 - p.life) * 2);
    p.m.material.opacity = Math.max(0, p.life / 1.6) * 0.4;
    if (p.life <= 0) { scene.remove(p.m); puffs.splice(i, 1); }
  }
  updateCamera(dt, t);
  layoutHand(dt);
  positionPlates();
  for (const p of plateEls) if (!p.bubble.hidden && now > p.bubbleT) p.bubble.hidden = true;
  if (!$('toast').hidden && now > toastT) $('toast').hidden = true;
  // a bot occasionally mutters while waiting on a human
  if (app.mode === 'game' && pres.idle && app.g?.phase === 'turn') {
    idleChat -= dt;
    if (idleChat < 0) {
      idleChat = 14 + Math.random() * 14;
      const cands = app.g.seats.map((s, i) => i).filter((i) => i !== app.mySeat && app.g.seats[i].alive && app.g.seats[i].bot);
      if (cands.length) say(cands[Math.floor(Math.random() * cands.length)], 'idle');
    }
  }
  // turn timer
  if (app.mode === 'game' && app.g?.phase === 'turn' && app.g.turn === app.mySeat && pres.idle) {
    const left = app.isHost ? Math.max(0, TURN_LIMIT * S() - (now - host.turnStart) / 1000) : null;
    $('timer').hidden = left === null;
    if (left !== null) $('timer').textContent = `${Math.ceil(left)}s`;
  } else $('timer').hidden = true;
  grade.uniforms.time.value = t;
  if (app.quality === 'high') composer.render(); else renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------------ boot

function boot() {
  try {
    const n = localStorage.getItem('ld-name'); if (n) $('nameInput').value = n;
    const c = localStorage.getItem('ld-char'); if (CHAR_ORDER.includes(c)) app.myChar = c;
    const sc = localStorage.getItem('ld-scares');
    if (['off', 'on', 'intense'].includes(sc)) { app.scares = sc; document.querySelectorAll('[name="scares"]').forEach((r) => { r.checked = r.value === sc; }); }
  } catch { /* storage blocked */ }
  renderPortraits();
  buildCharPicker();
  menuScene();
  showScreen('menu');
  $('btnHost').disabled = false;
  $('btnJoin').disabled = false;
  $('mpNote').textContent = 'Host a table and send friends the 4-letter code. Friends open this same page and join.';
  if (window.__LD_TEST) { app.quality = window.__LD_TEST === 'hq' ? 'high' : 'low'; renderer.setPixelRatio(1); }
  if (/Mobi|Android/i.test(navigator.userAgent)) { app.quality = 'low'; renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); world.lights.spot.shadow.mapSize.set(1024, 1024); }
  requestAnimationFrame(frame);
  $('loading').hidden = true;
}

window.__ld = { guns, C, horror, portraits, THREE, app, host, pres, chars, scene, camera, setAutoplay: (v) => { app.autoplay = v; }, G };
boot();
