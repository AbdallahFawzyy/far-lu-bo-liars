// Procedural canvas textures: everything is drawn at load, no image files.
import * as THREE from 'three';

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, { repeat = [1, 1], srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 8;
  return t;
}

const rnd = (a, b) => a + Math.random() * (b - a);

function noise(ctx, w, h, amt, alpha = 0.08) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amt;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  void alpha;
}

function grime(ctx, w, h, count, color = 'rgba(20,12,6,', max = 0.25) {
  for (let i = 0; i < count; i++) {
    const x = rnd(0, w), y = rnd(0, h), r = rnd(10, 90);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color + rnd(0.05, max) + ')');
    g.addColorStop(1, color + '0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

export function brick() {
  const W = 512, H = 512;
  const [c, x] = canvas(W, H);
  const [bc, bx] = canvas(W, H);
  x.fillStyle = '#3a2f29'; x.fillRect(0, 0, W, H);
  bx.fillStyle = '#000'; bx.fillRect(0, 0, W, H);
  const bh = 32, bw = 96;
  for (let row = 0; row < H / bh; row++) {
    const off = row % 2 ? bw / 2 : 0;
    for (let col = -1; col < W / bw + 1; col++) {
      const px = col * bw + off + 3, py = row * bh + 3;
      const r = rnd(95, 135), gg = rnd(45, 62), b = rnd(32, 45);
      x.fillStyle = `rgb(${r},${gg},${b})`;
      x.fillRect(px, py, bw - 6, bh - 6);
      bx.fillStyle = `rgb(${rnd(170, 230)},${rnd(170, 230)},${rnd(170, 230)})`;
      bx.fillRect(px, py, bw - 6, bh - 6);
      // chipped spots
      for (let k = 0; k < 6; k++) {
        x.fillStyle = `rgba(30,20,15,${rnd(0.1, 0.4)})`;
        x.fillRect(px + rnd(0, bw - 10), py + rnd(0, bh - 10), rnd(2, 8), rnd(2, 5));
      }
    }
  }
  grime(x, W, H, 40, 'rgba(10,8,6,', 0.45);
  grime(x, W, H, 8, 'rgba(60,70,40,', 0.2); // damp moss
  noise(x, W, H, 28);
  noise(bx, W, H, 40);
  return { map: tex(c, { repeat: [4, 1.6] }), bump: tex(bc, { repeat: [4, 1.6], srgb: false }) };
}

export function concrete() {
  const W = 512;
  const [c, x] = canvas(W, W);
  x.fillStyle = '#4a4744'; x.fillRect(0, 0, W, W);
  grime(x, W, W, 70, 'rgba(15,12,10,', 0.35);
  grime(x, W, W, 20, 'rgba(90,85,80,', 0.2);
  x.strokeStyle = 'rgba(20,18,16,0.6)'; x.lineWidth = 1.5;
  for (let i = 0; i < 7; i++) { // cracks
    x.beginPath();
    let px = rnd(0, W), py = rnd(0, W);
    x.moveTo(px, py);
    for (let k = 0; k < 12; k++) { px += rnd(-25, 25); py += rnd(-25, 25); x.lineTo(px, py); }
    x.stroke();
  }
  noise(x, W, W, 30);
  return tex(c, { repeat: [5, 5] });
}

export function wood(base = '#5a3720', ring = '#3b2212', rep = [1, 1]) {
  const W = 512;
  const [c, x] = canvas(W, W);
  x.fillStyle = base; x.fillRect(0, 0, W, W);
  for (let i = 0; i < 90; i++) {
    x.strokeStyle = ring; x.globalAlpha = rnd(0.15, 0.5); x.lineWidth = rnd(0.5, 3);
    x.beginPath();
    const y0 = rnd(0, W);
    x.moveTo(0, y0);
    for (let px = 0; px <= W; px += 16) x.lineTo(px, y0 + Math.sin(px / rnd(40, 90) + i) * rnd(2, 8));
    x.stroke();
  }
  x.globalAlpha = 1;
  grime(x, W, W, 12, 'rgba(0,0,0,', 0.3);
  noise(x, W, W, 20);
  return tex(c, { repeat: rep });
}

export function felt() {
  const W = 512;
  const [c, x] = canvas(W, W);
  const g = x.createRadialGradient(W / 2, W / 2, 20, W / 2, W / 2, W / 2);
  g.addColorStop(0, '#2f5a3c'); g.addColorStop(1, '#173322');
  x.fillStyle = g; x.fillRect(0, 0, W, W);
  grime(x, W, W, 30, 'rgba(8,10,6,', 0.35); // stains, cigarette burns
  for (let i = 0; i < 8; i++) {
    x.fillStyle = 'rgba(10,6,3,0.7)';
    x.beginPath(); x.arc(rnd(60, W - 60), rnd(60, W - 60), rnd(2, 5), 0, 7); x.fill();
  }
  // a dried ring from a glass
  x.strokeStyle = 'rgba(60,30,10,0.35)'; x.lineWidth = 4;
  x.beginPath(); x.arc(W * 0.7, W * 0.32, 26, 0, 7); x.stroke();
  // faded skull emblem
  x.globalAlpha = 0.13; x.fillStyle = '#d8c79a';
  x.beginPath(); x.arc(W / 2, W / 2 - 10, 60, 0, 7); x.fill();
  x.fillRect(W / 2 - 35, W / 2 + 30, 70, 40);
  x.globalCompositeOperation = 'destination-out'; x.globalAlpha = 0.5;
  x.beginPath(); x.arc(W / 2 - 24, W / 2 - 10, 16, 0, 7); x.arc(W / 2 + 24, W / 2 - 10, 16, 0, 7); x.fill();
  x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
  noise(x, W, W, 22);
  return tex(c);
}

export function cardFace(rank) {
  const W = 256, H = 384;
  const [c, x] = canvas(W, H);
  x.fillStyle = '#efe4c8'; x.fillRect(0, 0, W, H);
  grime(x, W, H, 10, 'rgba(90,60,20,', 0.25);
  x.strokeStyle = '#2a1a10'; x.lineWidth = 6; x.strokeRect(10, 10, W - 20, H - 20);
  const col = rank === 'J' ? '#7a1414' : '#1d1410';
  x.fillStyle = col;
  x.font = 'bold 54px Georgia, serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  const label = { K: 'K', Q: 'Q', A: 'A', J: '★' }[rank];
  x.fillText(label, 42, 50);
  x.save(); x.translate(W - 42, H - 50); x.rotate(Math.PI); x.fillText(label, 0, 0); x.restore();
  // centre emblem
  x.save(); x.translate(W / 2, H / 2);
  x.lineWidth = 6; x.strokeStyle = col; x.fillStyle = col;
  if (rank === 'K') {
    x.beginPath(); x.moveTo(-60, 30); x.lineTo(-60, -30); x.lineTo(-30, 0); x.lineTo(0, -45); x.lineTo(30, 0); x.lineTo(60, -30); x.lineTo(60, 30); x.closePath(); x.fill();
    x.fillRect(-62, 38, 124, 14);
  } else if (rank === 'Q') {
    x.beginPath(); x.arc(0, -10, 44, 0, Math.PI * 2); x.stroke();
    for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.5; x.beginPath(); x.arc(Math.cos(a) * 60, -10 + Math.sin(a) * 60, 8, 0, 7); x.fill(); }
    x.beginPath(); x.arc(0, -10, 14, 0, 7); x.fill();
  } else if (rank === 'A') {
    x.beginPath(); x.moveTo(0, -60); x.bezierCurveTo(70, -10, 50, 40, 0, 20); x.bezierCurveTo(-50, 40, -70, -10, 0, -60); x.fill();
    x.fillRect(-6, 15, 12, 40); x.fillRect(-26, 50, 52, 10);
  } else {
    // Joker: grinning skull
    x.beginPath(); x.arc(0, -15, 50, 0, 7); x.fill();
    x.fillRect(-32, 20, 64, 34);
    x.fillStyle = '#efe4c8';
    x.beginPath(); x.arc(-20, -18, 13, 0, 7); x.arc(20, -18, 13, 0, 7); x.fill();
    x.beginPath(); x.moveTo(0, 0); x.lineTo(-7, 12); x.lineTo(7, 12); x.fill();
    for (let i = -24; i <= 24; i += 12) x.fillRect(i - 3, 30, 6, 20);
  }
  x.restore();
  x.font = 'bold 22px Georgia, serif'; x.fillStyle = col;
  x.fillText({ K: 'KING', Q: 'QUEEN', A: 'ACE', J: 'JOKER' }[rank], W / 2, H - 70);
  noise(x, W, H, 14);
  return tex(c);
}

export function cardBack() {
  const W = 256, H = 384;
  const [c, x] = canvas(W, H);
  x.fillStyle = '#5c1010'; x.fillRect(0, 0, W, H);
  x.strokeStyle = '#c9a45c'; x.lineWidth = 5; x.strokeRect(12, 12, W - 24, H - 24);
  x.globalAlpha = 0.35;
  for (let i = -H; i < W + H; i += 18) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + H, H); x.stroke(); x.beginPath(); x.moveTo(i, H); x.lineTo(i + H, 0); x.stroke(); }
  x.globalAlpha = 1;
  x.fillStyle = '#5c1010'; x.beginPath(); x.arc(W / 2, H / 2, 54, 0, 7); x.fill();
  x.strokeStyle = '#c9a45c'; x.lineWidth = 4; x.beginPath(); x.arc(W / 2, H / 2, 54, 0, 7); x.stroke();
  x.fillStyle = '#c9a45c'; x.font = 'bold 44px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('LD', W / 2, H / 2 + 2);
  grime(x, W, H, 10, 'rgba(0,0,0,', 0.3);
  noise(x, W, H, 16);
  return tex(c);
}

export function neon(text, color) {
  const W = 1024, H = 256;
  const [c, x] = canvas(W, H);
  x.clearRect(0, 0, W, H);
  x.font = 'italic bold 150px "Brush Script MT", "Segoe Script", cursive';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.shadowColor = color; x.shadowBlur = 40;
  x.strokeStyle = color; x.lineWidth = 10;
  x.strokeText(text, W / 2, H / 2);
  x.shadowBlur = 10; x.strokeStyle = '#fff'; x.lineWidth = 3;
  x.strokeText(text, W / 2, H / 2);
  const t = tex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function sign(lines, { bg = '#1b1712', fg = '#d8c8a0', w = 512, h = 256, font = 'bold 54px Impact, sans-serif' } = {}) {
  const [c, x] = canvas(w, h);
  x.fillStyle = bg; x.fillRect(0, 0, w, h);
  x.fillStyle = fg; x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle';
  lines.forEach((l, i) => x.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * 64));
  grime(x, w, h, 25, 'rgba(0,0,0,', 0.4);
  noise(x, w, h, 30);
  const t = tex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function crate() {
  const W = 256;
  const [c, x] = canvas(W, W);
  x.fillStyle = '#6b5233'; x.fillRect(0, 0, W, W);
  for (let i = 0; i < 6; i++) { x.fillStyle = `rgba(0,0,0,${rnd(0.05, 0.2)})`; x.fillRect(0, i * 43, W, 41); x.fillStyle = 'rgba(0,0,0,0.5)'; x.fillRect(0, i * 43 + 41, W, 2); }
  x.strokeStyle = '#3b2a17'; x.lineWidth = 16; x.strokeRect(8, 8, W - 16, W - 16);
  x.beginPath(); x.moveTo(8, 8); x.lineTo(W - 8, W - 8); x.stroke();
  x.fillStyle = 'rgba(20,10,5,0.75)'; x.font = 'bold 30px "Courier New", monospace'; x.textAlign = 'center';
  x.save(); x.translate(W / 2, W / 2); x.rotate(-0.08); x.fillText(['CONTRABAND', 'FRAGILE', 'NOT GUNS', 'DO NOT OPEN', 'TOMATOES'][Math.floor(rnd(0, 5))], 0, 10); x.restore();
  noise(x, W, W, 30);
  return tex(c);
}

export function label(color) {
  const [c, x] = canvas(64, 64);
  x.fillStyle = color; x.fillRect(0, 0, 64, 64);
  x.fillStyle = '#e8dcc0'; x.fillRect(8, 22, 48, 22);
  x.fillStyle = '#3a2210'; x.fillRect(14, 28, 36, 3); x.fillRect(14, 35, 24, 3);
  const t = tex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Crochet mesh with real holes (alpha map). */
export function crochet() {
  const W = 256;
  const [c, x] = canvas(W, W);
  x.fillStyle = '#fff'; x.fillRect(0, 0, W, W);
  x.fillStyle = '#000';
  const n = 8, s = W / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    x.beginPath();
    x.ellipse(i * s + s / 2, j * s + s / 2, s * 0.32, s * 0.28, 0, 0, 7);
    x.fill();
  }
  const alpha = tex(c, { repeat: [5, 3], srgb: false });
  const [c2, y] = canvas(W, W);
  y.fillStyle = '#f2a9c0'; y.fillRect(0, 0, W, W);
  for (let i = 0; i < 1600; i++) { y.fillStyle = `rgba(${rnd(200, 255)},${rnd(120, 170)},${rnd(150, 190)},0.5)`; y.fillRect(rnd(0, W), rnd(0, W), 3, 2); }
  return { map: tex(c2, { repeat: [5, 3] }), alpha };
}

export function fabric(base, line, rep = [4, 4]) {
  const W = 128;
  const [c, x] = canvas(W, W);
  x.fillStyle = base; x.fillRect(0, 0, W, W);
  x.globalAlpha = 0.12; x.fillStyle = line;
  for (let i = 0; i < W; i += 4) { x.fillRect(i, 0, 2, W); x.fillRect(0, i + 1, W, 1); }
  x.globalAlpha = 1;
  noise(x, W, W, 18);
  return tex(c, { repeat: rep });
}

export function hair(base, streak) {
  const W = 256;
  const [c, x] = canvas(W, W);
  x.fillStyle = base; x.fillRect(0, 0, W, W);
  for (let i = 0; i < 700; i++) {
    x.strokeStyle = Math.random() < 0.18 && streak ? streak : `rgba(${Math.random() < 0.5 ? 0 : 60},${Math.random() < 0.5 ? 0 : 45},${Math.random() < 0.5 ? 0 : 35},${rnd(0.1, 0.5)})`;
    x.lineWidth = rnd(0.5, 2);
    const px = rnd(0, W);
    x.beginPath(); x.moveTo(px, 0); x.bezierCurveTo(px + rnd(-8, 8), W / 3, px + rnd(-8, 8), W * 0.66, px + rnd(-10, 10), W); x.stroke();
  }
  return tex(c, { repeat: [3, 1] });
}

/** Blood-red / grime splatter for the walls behind the table. */
export function splat() {
  const W = 256;
  const [c, x] = canvas(W, W);
  for (let i = 0; i < 40; i++) {
    x.fillStyle = `rgba(${rnd(60, 110)},5,5,${rnd(0.3, 0.8)})`;
    x.beginPath(); x.arc(W / 2 + rnd(-60, 60) * Math.random(), W / 2 + rnd(-60, 60) * Math.random(), rnd(2, 22) * Math.random() + 2, 0, 7); x.fill();
  }
  const t = tex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
