// The cellar bar: room, table, props, lights, dust and the revolver.
import * as THREE from 'three';
import * as T from './textures.js';

function dot() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...o });
function mesh(geo, mat, cast = true, recv = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast; m.receiveShadow = recv;
  return m;
}
const rnd = (a, b) => a + Math.random() * (b - a);

export const TABLE_Y = 0.78;
export const TABLE_R = 0.95;
export const SEAT_R = 1.32;

export function seatPos(i, n = 4) {
  const a = (i / n) * Math.PI * 2;
  return new THREE.Vector3(Math.sin(a) * SEAT_R, 0, Math.cos(a) * SEAT_R);
}

export function buildWorld(scene) {
  const W = { flicker: [], dust: null, fan: null, smoke: null, rat: null, lamp: null, lights: {} };
  scene.background = new THREE.Color('#07060a');
  scene.fog = new THREE.FogExp2('#0b0908', 0.09);

  // ---------------- room shell
  const roomW = 9, roomD = 8, roomH = 3.1;
  const br = T.brick();
  const wallMat = std('#ffffff', { map: br.map, bumpMap: br.bump, bumpScale: 2.5, roughness: 0.95 });
  const walls = [
    [roomW, 0, -roomD / 2, 0], [roomW, 0, roomD / 2, Math.PI], [roomD, -roomW / 2, 0, Math.PI / 2], [roomD, roomW / 2, 0, -Math.PI / 2],
  ];
  for (const [w, x, z, ry] of walls) {
    const m = mesh(new THREE.PlaneGeometry(w, roomH), wallMat, false, true);
    m.position.set(x, roomH / 2, z); m.rotation.y = ry;
    scene.add(m);
  }
  const floor = mesh(new THREE.PlaneGeometry(roomW, roomD), std('#ffffff', { map: T.concrete(), roughness: 0.85 }), false, true);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const ceil = mesh(new THREE.PlaneGeometry(roomW, roomD), std('#1a1512', { roughness: 1 }), false, false);
  ceil.rotation.x = Math.PI / 2; ceil.position.y = roomH;
  scene.add(ceil);
  // beams + pipes
  const beamMat = std('#ffffff', { map: T.wood('#3d2614', '#1d1009', [1, 4]) });
  for (let i = -3; i <= 3; i++) {
    const b = mesh(new THREE.BoxGeometry(0.22, 0.25, roomD), beamMat, true, true);
    b.position.set(i * 1.35, roomH - 0.12, 0); scene.add(b);
  }
  const pipeMat = std('#5a4a3a', { metalness: 0.8, roughness: 0.45 });
  for (const [z, r] of [[-1.2, 0.07], [1.6, 0.05], [2.0, 0.09]]) {
    const p = mesh(new THREE.CylinderGeometry(r, r, roomW, 12), pipeMat);
    p.rotation.z = Math.PI / 2; p.position.set(0, roomH - 0.38, z); scene.add(p);
  }

  // ---------------- table
  const tableG = new THREE.Group();
  const top = mesh(new THREE.CylinderGeometry(TABLE_R, TABLE_R, 0.05, 64), [
    std('#ffffff', { map: T.wood('#4a2c18', '#24140a') }), std('#ffffff', { map: T.felt(), roughness: 0.95 }), std('#2b1a0d'),
  ]);
  top.position.y = TABLE_Y - 0.025;
  const rim = mesh(new THREE.TorusGeometry(TABLE_R, 0.05, 12, 64), std('#ffffff', { map: T.wood('#5a3720', '#2a170a', [6, 1]), roughness: 0.45 }));
  rim.rotation.x = Math.PI / 2; rim.position.y = TABLE_Y;
  const leg = mesh(new THREE.CylinderGeometry(0.08, 0.12, TABLE_Y, 16), std('#21140b'));
  leg.position.y = TABLE_Y / 2;
  const foot = mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.06, 24), std('#1a0f08', { metalness: 0.3 }));
  foot.position.y = 0.03;
  tableG.add(top, rim, leg, foot);
  scene.add(tableG);

  // table clutter: bottle, glasses, ashtray, chips
  const glass = new THREE.MeshPhysicalMaterial({ color: '#3a5a2a', roughness: 0.1, transmission: 0.6, thickness: 0.02, transparent: true, opacity: 0.85 });
  const bottle = new THREE.Group();
  const bb = mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.22, 16), glass); bb.position.y = 0.11;
  const bn = mesh(new THREE.CylinderGeometry(0.015, 0.04, 0.12, 12), glass); bn.position.y = 0.28;
  const lbl = mesh(new THREE.CylinderGeometry(0.0505, 0.0505, 0.08, 16, 1, true), std('#ffffff', { map: T.label('#7a1f1a') })); lbl.position.y = 0.1;
  bottle.add(bb, bn, lbl);
  bottle.position.set(0.42, TABLE_Y, -0.38);
  scene.add(bottle);
  for (const [x, z] of [[0.55, -0.15], [-0.5, 0.42]]) {
    const g = mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.08, 14, 1, true), new THREE.MeshPhysicalMaterial({ color: '#c8b080', roughness: 0.05, transmission: 0.8, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
    g.position.set(x, TABLE_Y + 0.04, z); scene.add(g);
    const liq = mesh(new THREE.CylinderGeometry(0.03, 0.028, 0.03, 14), std('#7a4a12', { roughness: 0.1, transparent: true, opacity: 0.8 }));
    liq.position.set(x, TABLE_Y + 0.02, z); scene.add(liq);
  }
  const ash = mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.03, 20), std('#2b2b2e', { metalness: 0.6, roughness: 0.4 }));
  ash.position.set(-0.45, TABLE_Y + 0.015, -0.42); scene.add(ash);
  const cig = mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.08, 6), std('#e6e0d0'));
  cig.rotation.z = Math.PI / 2 - 0.2; cig.position.set(-0.41, TABLE_Y + 0.04, -0.42); scene.add(cig);
  const ember = mesh(new THREE.SphereGeometry(0.006, 6, 6), new THREE.MeshBasicMaterial({ color: '#ff5a1a' }), false, false);
  ember.position.set(-0.37, TABLE_Y + 0.047, -0.42); scene.add(ember);
  W.emberPos = ember.position.clone();
  const chipCols = ['#8a1a1a', '#1a3a8a', '#d8d0b8', '#1a6a2a'];
  for (let i = 0; i < 26; i++) {
    const chip = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.008, 16), std(chipCols[i % 4], { roughness: 0.4 }));
    const a = rnd(0, 7), r = rnd(0.55, 0.82);
    chip.position.set(Math.cos(a) * r, TABLE_Y + 0.004 + (i % 3) * 0.008, Math.sin(a) * r);
    scene.add(chip);
  }

  // ---------------- back wall: bar counter and bottle shelves
  const bar = new THREE.Group();
  const counter = mesh(new THREE.BoxGeometry(4.2, 1.05, 0.6), std('#ffffff', { map: T.wood('#3b2212', '#1a0c05', [4, 1]) }));
  counter.position.set(0, 0.525, -3.3);
  const ctop = mesh(new THREE.BoxGeometry(4.3, 0.06, 0.7), std('#2a1408', { roughness: 0.25 }));
  ctop.position.set(0, 1.08, -3.3);
  bar.add(counter, ctop);
  const shelfMat = std('#2a180c');
  const bottleCols = ['#3a5a2a', '#5a2a1a', '#8a6a2a', '#2a3a5a', '#6a6a6a', '#4a1a3a'];
  for (let s = 0; s < 3; s++) {
    const sh = mesh(new THREE.BoxGeometry(4, 0.04, 0.3), shelfMat);
    sh.position.set(0, 1.5 + s * 0.45, -3.85); bar.add(sh);
    for (let i = 0; i < 18; i++) {
      if (Math.random() < 0.2) continue;
      const h = rnd(0.2, 0.34), col = bottleCols[Math.floor(rnd(0, 6))];
      const m = new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.15, metalness: 0.1, emissive: col, emissiveIntensity: 0.15 });
      const b = mesh(new THREE.CylinderGeometry(0.04, 0.045, h, 10), m);
      b.position.set(-1.9 + i * 0.22 + rnd(-0.03, 0.03), 1.52 + s * 0.45 + h / 2, -3.85);
      const n = mesh(new THREE.CylinderGeometry(0.013, 0.03, 0.1, 8), m);
      n.position.set(b.position.x, b.position.y + h / 2 + 0.05, -3.85);
      bar.add(b, n);
    }
  }
  for (let i = -1; i <= 1; i++) { // stools
    const st = new THREE.Group();
    const seat = mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.06, 16), std('#5a1414', { roughness: 0.5 })); seat.position.y = 0.75;
    const pole = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.75, 8), std('#777', { metalness: 1, roughness: 0.4 })); pole.position.y = 0.37;
    st.add(seat, pole); st.position.set(i * 1.2, 0, -2.75); st.rotation.z = i === 1 ? 0.06 : 0;
    bar.add(st);
  }
  scene.add(bar);

  // neon sign
  const neon = mesh(new THREE.PlaneGeometry(2.2, 0.55), new THREE.MeshBasicMaterial({ map: T.neon("Liar's Den", '#ff2a4a'), transparent: true, depthWrite: false, toneMapped: false }), false, false);
  neon.position.set(0, 2.6, -3.96);
  scene.add(neon);
  const neonLight = new THREE.PointLight('#ff2040', 4, 6, 1.6);
  neonLight.position.set(0, 2.4, -3.5);
  scene.add(neonLight);
  W.flicker.push({ light: neonLight, mat: neon.material, base: 4, kind: 'neon' });

  // ---------------- side walls: crates, barrels, caged contraband, signs
  const crateMats = [0, 1, 2, 3].map(() => std('#ffffff', { map: T.crate() }));
  const stacks = [[-3.9, -2.8], [-3.9, -2.0], [-3.2, -3.3], [3.8, 2.6], [3.8, 1.8], [3.0, 3.4], [-3.8, 2.8]];
  stacks.forEach(([x, z], si) => {
    const h = 1 + Math.floor(rnd(0, 3));
    for (let k = 0; k < h; k++) {
      const s = rnd(0.5, 0.7);
      const c = mesh(new THREE.BoxGeometry(s, s, s), crateMats[(si + k) % 4]);
      c.position.set(x + rnd(-0.08, 0.08), s / 2 + k * 0.6, z + rnd(-0.08, 0.08)); c.rotation.y = rnd(-0.3, 0.3);
      scene.add(c);
    }
  });
  const barrelMat = std('#3a2a1a', { roughness: 0.6, metalness: 0.2 });
  for (const [x, z] of [[3.9, -1.6], [3.5, -2.2], [-3.9, 0.9]]) {
    const b = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 20), barrelMat);
    b.position.set(x, 0.45, z); scene.add(b);
    for (const y of [0.15, 0.75]) {
      const r = mesh(new THREE.TorusGeometry(0.305, 0.015, 6, 24), std('#222', { metalness: 1, roughness: 0.5 }));
      r.rotation.x = Math.PI / 2; r.position.set(x, y, z); scene.add(r);
    }
  }
  // cash bricks on a pallet
  const cash = std('#5f7a4a', { roughness: 0.8 });
  for (let i = 0; i < 14; i++) {
    const c = mesh(new THREE.BoxGeometry(0.2, 0.06, 0.1), cash);
    c.position.set(3.6 + (i % 3) * 0.22, 0.03 + Math.floor(i / 6) * 0.06, -0.3 + (Math.floor(i / 3) % 2) * 0.12);
    scene.add(c);
  }
  // signs
  const s1 = mesh(new THREE.PlaneGeometry(1.2, 0.6), std('#ffffff', { map: T.sign(['NO SNITCHES', 'NO REFUNDS']) }));
  s1.position.set(-4.48, 1.9, -0.5); s1.rotation.y = Math.PI / 2; scene.add(s1);
  const s2 = mesh(new THREE.PlaneGeometry(1, 0.5), std('#ffffff', { map: T.sign(['LAST CALL', '2 AM'], { bg: '#3a0a0a', fg: '#e8d0a0' }) }));
  s2.position.set(4.48, 1.8, 0.4); s2.rotation.y = -Math.PI / 2; scene.add(s2);
  // dartboard with a knife
  const dart = mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.04, 24), std('#2a1a10'));
  dart.rotation.x = Math.PI / 2; dart.position.set(-1.6, 1.7, 3.97); scene.add(dart);
  // door with light leaking under it
  const door = mesh(new THREE.BoxGeometry(1, 2.1, 0.08), std('#ffffff', { map: T.wood('#2a1a10', '#120a05', [1, 2]) }));
  door.position.set(2.6, 1.05, -3.96); scene.add(door);
  const leak = mesh(new THREE.PlaneGeometry(1, 0.02), new THREE.MeshBasicMaterial({ color: '#ffd8a0' }), false, false);
  leak.position.set(2.6, 0.01, -3.9); leak.rotation.x = -Math.PI / 2; scene.add(leak);
  const doorLight = new THREE.PointLight('#5a7aa8', 1.2, 4, 2);
  doorLight.position.set(2.6, 0.3, -3.6); scene.add(doorLight);

  // vent fan
  const fan = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const blade = mesh(new THREE.BoxGeometry(0.06, 0.32, 0.01), std('#444', { metalness: 0.8 }));
    blade.position.y = 0.16; const p = new THREE.Group(); p.add(blade); p.rotation.z = (i * Math.PI) / 2; fan.add(p);
  }
  fan.position.set(-2.5, 2.5, 3.97); fan.rotation.y = Math.PI;
  scene.add(fan);
  W.fan = fan;

  // ---------------- lighting
  scene.add(new THREE.HemisphereLight('#6a5040', '#1a1008', 1.1));
  const bounce = new THREE.PointLight('#ffb878', 2.2, 3.2, 1.5);
  bounce.position.set(0, 1.05, 0);
  scene.add(bounce);
  const lampG = new THREE.Group();
  const cord = mesh(new THREE.CylinderGeometry(0.006, 0.006, 1.0), std('#111'), false, false);
  cord.position.y = 0.5;
  const shade = mesh(new THREE.ConeGeometry(0.32, 0.22, 24, 1, true), std('#1f3a2a', { side: THREE.DoubleSide, metalness: 0.5, roughness: 0.4 }), true, false);
  const bulb = mesh(new THREE.SphereGeometry(0.05, 12, 12), new THREE.MeshBasicMaterial({ color: '#ffe0a0', toneMapped: false }), false, false);
  bulb.position.y = -0.08;
  lampG.add(cord, shade, bulb);
  lampG.position.set(0, 2.15, 0);
  scene.add(lampG);
  W.lamp = lampG;
  const spot = new THREE.SpotLight('#ffcf8a', 55, 6, 0.85, 0.55, 1.6);
  spot.position.set(0, 2.05, 0);
  spot.target.position.set(0, 0, 0);
  spot.castShadow = true;
  spot.shadow.mapSize.set(2048, 2048);
  spot.shadow.bias = -0.0004;
  spot.shadow.normalBias = 0.02;
  spot.shadow.camera.near = 0.3; spot.shadow.camera.far = 6;
  scene.add(spot, spot.target);
  W.lights.spot = spot;
  W.flicker.push({ light: spot, mat: bulb.material, base: 55, kind: 'lamp' });
  // fake light cone through the haze
  const coneMat = new THREE.MeshBasicMaterial({ color: '#ffcf8a', transparent: true, opacity: 0.045, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(1.25, 1.95, 32, 1, true), coneMat);
  cone.position.set(0, 1.1, 0);
  scene.add(cone);
  W.cone = cone;
  const fill = new THREE.PointLight('#4a6a9a', 1.5, 9, 2);
  fill.position.set(-3, 2.4, 2.5); scene.add(fill);
  const barGlow = new THREE.PointLight('#ffb060', 3, 4, 2);
  barGlow.position.set(-1.2, 2.2, -3.4); scene.add(barGlow);
  W.flicker.push({ light: barGlow, base: 3, kind: 'bulb' });
  W.lights.flash = new THREE.PointLight('#ffd8a0', 0, 5, 2);
  scene.add(W.lights.flash);

  // dust motes in the lamp light
  const N = 600;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const a = rnd(0, 7), r = Math.sqrt(Math.random()) * 1.4;
    pos.set([Math.cos(a) * r, rnd(0.8, 2.1), Math.sin(a) * r], i * 3);
  }
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  W.dust = new THREE.Points(dg, new THREE.PointsMaterial({ map: dot(), color: '#ffe2b0', size: 0.008, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(W.dust);

  // cigarette smoke
  const SN = 40;
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SN * 3), 3));
  W.smoke = new THREE.Points(sg, new THREE.PointsMaterial({ map: dot(), color: '#9a9a9a', size: 0.09, transparent: true, opacity: 0.12, depthWrite: false }));
  W.smoke.userData.life = Array.from({ length: SN }, () => Math.random());
  scene.add(W.smoke);

  // a rat that scurries along the wall now and then
  const rat = new THREE.Group();
  const rb = mesh(new THREE.SphereGeometry(0.06, 10, 8), std('#3a3230', { roughness: 1 })); rb.scale.set(1, 0.7, 1.8);
  const rt = mesh(new THREE.CylinderGeometry(0.004, 0.008, 0.2), std('#8a6a6a')); rt.rotation.x = Math.PI / 2.4; rt.position.z = -0.17;
  const rh = mesh(new THREE.SphereGeometry(0.035, 8, 8), std('#3a3230')); rh.position.z = 0.1;
  rat.add(rb, rt, rh); rat.position.set(-10, 0.04, 3.7); rat.visible = false;
  scene.add(rat);
  W.rat = { obj: rat, t: -8 };

  return W;
}

let flickT = 0;
export function updateWorld(W, dt, time) {
  flickT += dt;
  for (const f of W.flicker) {
    let k = 1;
    if (f.kind === 'neon') k = Math.random() < 0.01 ? 0.2 : 0.9 + Math.sin(time * 40) * 0.05;
    if (f.kind === 'lamp') k = Math.random() < 0.004 ? 0.4 : 1 + Math.sin(time * 7) * 0.02;
    if (f.kind === 'bulb') k = Math.random() < 0.02 ? 0.3 : 1;
    f.light.intensity = f.base * k * (f.dim ?? 1);
    if (f.mat && f.mat.color) f.mat.opacity = 0.7 + k * 0.3;
  }
  if (W.lamp) { W.lamp.rotation.z = Math.sin(time * 0.6) * 0.03; W.lamp.rotation.x = Math.sin(time * 0.43) * 0.02; }
  if (W.fan) W.fan.rotation.z += dt * 6;
  const p = W.dust.geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let y = p.getY(i) + Math.sin(time * 0.3 + i) * 0.0008 - 0.0004;
    if (y < 0.8) y = 2.1;
    p.setY(i, y);
    p.setX(i, p.getX(i) + Math.sin(time * 0.2 + i * 1.7) * 0.0006);
  }
  p.needsUpdate = true;
  const sp = W.smoke.geometry.attributes.position;
  const life = W.smoke.userData.life;
  for (let i = 0; i < sp.count; i++) {
    life[i] += dt * 0.25;
    if (life[i] > 1) life[i] = 0;
    const l = life[i];
    sp.setXYZ(i, W.emberPos.x + Math.sin(l * 9 + i) * 0.05 * l, W.emberPos.y + l * 0.9, W.emberPos.z + Math.cos(l * 7 + i) * 0.05 * l);
  }
  sp.needsUpdate = true;
  const r = W.rat;
  r.t += dt;
  if (r.t > 0 && r.t < 4) {
    r.obj.visible = true;
    r.obj.position.x = -4.5 + r.t * 2.3;
    r.obj.rotation.y = Math.PI / 2;
    r.obj.position.y = 0.04 + Math.abs(Math.sin(r.t * 30)) * 0.01;
  } else if (r.t >= 4) { r.obj.visible = false; r.t = -20 - Math.random() * 30; }
  const fl = W.lights.flash;
  fl.intensity = Math.max(0, fl.intensity - dt * 120);
}

// ------------------------------------------------------------------ revolver

export function buildRevolver() {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: '#2a2c30', metalness: 1, roughness: 0.32 });
  const worn = new THREE.MeshStandardMaterial({ color: '#6d6a66', metalness: 1, roughness: 0.25 });
  const woodM = new THREE.MeshStandardMaterial({ map: T.wood('#5a2e16', '#2a1206', [1, 2]), roughness: 0.5 });
  const S = 1; // ~30 cm long in metres
  // frame: extruded profile (barrel points +x)
  const sh = new THREE.Shape();
  sh.moveTo(-0.05, 0.0); sh.lineTo(0.05, 0.0); sh.lineTo(0.06, 0.018); sh.lineTo(0.06, 0.05);
  sh.lineTo(-0.04, 0.05); sh.lineTo(-0.065, 0.035); sh.lineTo(-0.07, 0.0); sh.closePath();
  const frame = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.022, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 2 }), steel);
  frame.position.z = -0.011;
  g.add(frame);
  // barrel + rib + sight
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.0095, 0.16, 18), steel);
  barrel.rotation.z = Math.PI / 2; barrel.position.set(0.14, 0.04, 0);
  const rib = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.008, 0.008), steel);
  rib.position.set(0.14, 0.051, 0);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.01, 0.004), worn);
  sight.position.set(0.215, 0.057, 0);
  const ejector = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.1, 10), worn);
  ejector.rotation.z = Math.PI / 2; ejector.position.set(0.11, 0.025, 0);
  const muzzle = new THREE.Mesh(new THREE.CircleGeometry(0.0055, 12), new THREE.MeshBasicMaterial({ color: '#000' }));
  muzzle.rotation.y = Math.PI / 2; muzzle.position.set(0.2205, 0.04, 0);
  g.add(barrel, rib, sight, ejector, muzzle);
  // cylinder with flutes + 6 chambers
  const cyl = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.023, 0.045, 24), worn);
  body.rotation.z = Math.PI / 2;
  cyl.add(body);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.0055, 10), new THREE.MeshBasicMaterial({ color: '#050505' }));
    hole.rotation.y = Math.PI / 2; hole.position.set(0.0226, Math.cos(a) * 0.014, Math.sin(a) * 0.014);
    const flute = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.004, 0.006), steel);
    flute.position.set(0, Math.cos(a + 0.52) * 0.022, Math.sin(a + 0.52) * 0.022); flute.rotation.x = a + 0.52;
    cyl.add(hole, flute);
  }
  cyl.position.set(0.035, 0.03, 0);
  g.add(cyl);
  // hammer
  const hammer = new THREE.Group();
  const hm = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.03, 0.008), steel);
  hm.position.y = 0.015;
  const spur = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.006, 0.01), worn);
  spur.position.set(-0.008, 0.03, 0);
  hammer.add(hm, spur);
  hammer.position.set(-0.045, 0.045, 0);
  g.add(hammer);
  // trigger + guard
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.0028, 8, 20, Math.PI * 1.15), steel);
  guard.position.set(-0.005, -0.004, 0); guard.rotation.z = Math.PI + 0.1;
  const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.02, 0.005), worn);
  trigger.position.set(-0.008, -0.008, 0); trigger.rotation.z = 0.3;
  g.add(guard, trigger);
  // grip
  const gs = new THREE.Shape();
  gs.moveTo(-0.07, 0.01); gs.lineTo(-0.04, 0.0); gs.quadraticCurveTo(-0.045, -0.06, -0.075, -0.1);
  gs.lineTo(-0.11, -0.095); gs.quadraticCurveTo(-0.1, -0.04, -0.07, 0.01);
  const grip = new THREE.Mesh(new THREE.ExtrudeGeometry(gs, { depth: 0.026, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 3 }), woodM);
  grip.position.z = -0.013;
  g.add(grip);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  g.scale.setScalar(S * 1.35);
  g.userData = { cyl, hammer, trigger, muzzle: new THREE.Vector3(0.23, 0.04, 0) };
  return g;
}

export function cardMesh(faceTex, backTex) {
  const geo = new THREE.PlaneGeometry(0.09, 0.135);
  const g = new THREE.Group();
  const f = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.6 }));
  const b = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.6 }));
  b.rotation.y = Math.PI;
  f.castShadow = b.castShadow = true;
  f.receiveShadow = true;
  g.add(f, b);
  g.userData.face = f;
  return g;
}

export function buildChair() {
  const chairMat = std('#ffffff', { map: T.wood('#3b2416', '#1a0d06') });
  const c = new THREE.Group();
  const seat = mesh(new THREE.BoxGeometry(0.5, 0.05, 0.48), chairMat); seat.position.y = 0.46;
  const back = mesh(new THREE.BoxGeometry(0.5, 0.65, 0.05), chairMat); back.position.set(0, 0.8, -0.24); back.rotation.x = -0.08;
  c.add(seat, back);
  for (const [x, z] of [[-0.22, -0.2], [0.22, -0.2], [-0.22, 0.2], [0.22, 0.2]]) {
    const l = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.46, 8), chairMat); l.position.set(x, 0.23, z); c.add(l);
  }
  return c;
}
