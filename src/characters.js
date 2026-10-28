// Procedural, big-headed caricature characters with a simple rig:
// poses (joint targets), facial expressions, blinking, talking and death.
import * as THREE from 'three';
import * as T from './textures.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));

function std(color, o = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...o });
}
function mesh(geo, mat, { cast = true, recv = false } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast; m.receiveShadow = recv;
  return m;
}
function at(obj, x, y, z) { obj.position.set(x, y, z); return obj; }

/** Everything that differs between characters. */
export const CHARACTERS = {
  bob: {
    name: 'Abu Bob', blurb: 'Bearded, in a black bob wig and a tiny party hat. Bluffs loudly.',
    skin: '#b97a5a', headScale: [1, 1.12, 1], headR: 0.36,
    eye: '#2b160c', brow: '#14100d', lips: '#8a4a3c',
    shirt: '#f1efe9', pants: '#26262a', sleeves: 'short', build: 0.82,
    accent: '#e9a23b',
  },
  coin: {
    name: 'Madame Fringe', blurb: 'Pink crochet cap with jangling coins, hands on hips, zero patience.',
    skin: '#d9a585', headScale: [0.96, 1.08, 0.98], headR: 0.35,
    eye: '#3a2214', brow: '#2a1a12', lips: '#b5675e',
    shirt: '#efe8d6', pants: '#5f6248', sleeves: 'puff', build: 0.74,
    accent: '#f2a9c0',
  },
  wait: {
    name: 'Estanna', blurb: 'Grey coat, black scarf and the famous "wait" hand. Trusts no one.',
    skin: '#c99272', headScale: [1, 1.05, 1], headR: 0.355,
    eye: '#1d120c', brow: '#1a120e', lips: '#a8675d',
    shirt: '#8d8a86', pants: '#2a2a2c', sleeves: 'coat', build: 0.78,
    accent: '#9fb4c8',
  },
  dog: {
    name: 'Hamo', blurb: 'The bouncer who fills the fourth chair. Sunglasses indoors, few words.',
    skin: '#8e5b40', headScale: [1.12, 1, 1.05], headR: 0.37,
    eye: '#140c08', brow: '#120c08', lips: '#6e3b2e',
    shirt: '#17171a', pants: '#1e1e22', sleeves: 'short', build: 1.0,
    accent: '#d8b14a',
  },
};

export const LINES = {
  bob: {
    play: ['Trust me, habibi.', 'Obviously real. Obviously.', 'Wallahi these are legit.', 'Look at this face. Honest face.', 'Easy money.'],
    call: ['LIAR! Your eyebrow moved!', 'Ya kazzab! Liar!', 'Nope. Liar. Flip them.', 'I smell lies. LIAR!'],
    truth: ['Read them and weep, bro.', 'Told you. Honest face.', 'Who doubts Abu Bob?!'],
    caught: ['It was a prank, bro!', 'Okay okay, who told you?', 'Technically... a joke.'],
    survive: ['HA! The wig protects me!', 'Not today, my friend!', 'I felt that in my beard.'],
    die: ['Tell my wig I loved h—', 'Worth it.', 'Oh no.'],
    win: ['Abu Bob runs this cellar!', 'Party hat stays ON.'],
    idle: ['Is it hot or is it the wig?', 'Who ordered the tomatoes?', 'Yalla, play already.'],
    fear: ['Okay okay okay...', 'Ya rab ya rab ya rab...'],
  },
  coin: {
    play: ['Darling, please.', 'As if I would lie.', 'Take it or leave it, sweetie.', 'Mm-hm. Real.'],
    call: ['Liar. Your face is a confession.', 'Babe. No. Liar.', 'Flip them. Now.', 'LIAR, and badly.'],
    truth: ['Hands on hips, cards on table.', 'Apologize.', 'Mm. As expected.'],
    caught: ['That was a test.', 'Ugh. Fine.', 'You saw nothing.'],
    survive: ['Rude.', 'My coins didn\'t even jingle.', 'Was that supposed to scare me?'],
    die: ['This top was new...', 'Unbelievable.', 'Tacky.'],
    win: ['Crown on head. Bye.', 'Obviously.'],
    idle: ['Can we hurry? My cap is itchy.', 'Who decorated this place, a rat?', 'Hmm.'],
    fear: ['Fine. Fine. Do it.', 'Not the cap. Not the cap.'],
  },
  wait: {
    play: ['Shh. Don\'t ask.', 'Wait... okay. These.', 'Estanna... yes. Real.', 'Totally normal cards.'],
    call: ['Wait wait WAIT. LIAR!', 'Estanna! Liar!', 'Hold on. That\'s a lie.', 'I knew it. LIAR.'],
    truth: ['I said wait for it.', 'See? Patience.', 'Never doubt the hand.'],
    caught: ['Wait, I can explain—', 'Okay, that one was fake.', 'Estanna... estanna...'],
    survive: ['I knew it. I KNEW it.', 'Wait... I\'m alive?', 'Hah. Not yet.'],
    die: ['I said waaaait—', 'Estann—', 'Wait...'],
    win: ['Told you. Wait for it.', 'Patience pays.'],
    idle: ['Wait. Something\'s off.', 'Why is everyone looking at me?', 'Estanna, estanna.'],
    fear: ['Wait wait wait wait...', 'Hold on hold on hold on—'],
  },
  dog: {
    play: ['Cards.', 'Real. Don\'t argue.', 'Hamo no lie.'],
    call: ['Liar. Outside. Now.', 'LIAR.', 'Flip it, smart guy.'],
    truth: ['Hamo never lie.', 'Heh.'],
    caught: ['...Hamo forgot.', 'Huh.'],
    survive: ['Heh. Tickles.', 'Again.'],
    die: ['...rude.', 'Ow.'],
    win: ['Hamo wins. Everybody out.'],
    idle: ['Hamo hungry.', 'Nice bar. Hamo break it later.'],
    fear: ['Hmm.', 'Hamo not scared.'],
  },
};

// --------------------------------------------------------------- face decal

function drawFace(ctx, char, f) {
  const W = 256, H = 256;
  ctx.clearRect(0, 0, W, H);
  const c = CHARACTERS[char];
  // the decal spans the front of the head; mouth sits around (128, 170)
  if (char === 'bob') {
    // full dark beard and moustache around the mouth
    ctx.fillStyle = 'rgba(20,14,12,0.92)';
    ctx.beginPath();
    ctx.moveTo(30, 120); ctx.quadraticCurveTo(40, 245, 128, 256); ctx.quadraticCurveTo(216, 245, 226, 120);
    ctx.quadraticCurveTo(200, 170, 128, 150); ctx.quadraticCurveTo(56, 170, 30, 120); ctx.fill();
    for (let i = 0; i < 500; i++) {
      const a = Math.random() * Math.PI, r = 60 + Math.random() * 50;
      ctx.fillStyle = `rgba(${10 + Math.random() * 30},${8 + Math.random() * 15},${6 + Math.random() * 10},0.7)`;
      ctx.fillRect(128 + Math.cos(a) * r * 0.95, 150 + Math.sin(a) * r * 0.85, 1.5, 4);
    }
  }
  if (char === 'dog') {
    ctx.fillStyle = 'rgba(25,15,10,0.25)';
    ctx.beginPath(); ctx.ellipse(128, 190, 98, 70, 0, 0, Math.PI * 2); ctx.fill();
  }
  if (char === 'wait') { // dark circles
    ctx.fillStyle = 'rgba(70,40,40,0.35)';
    ctx.beginPath(); ctx.ellipse(84, 108, 26, 12, 0.1, 0, 7); ctx.ellipse(172, 108, 26, 12, -0.1, 0, 7); ctx.fill();
    ctx.fillStyle = '#2a160e'; // the mole
    ctx.beginPath(); ctx.arc(62, 172, 5, 0, 7); ctx.fill();
  }
  if (char === 'coin') { // freckles + blush
    ctx.fillStyle = 'rgba(200,90,90,0.18)';
    ctx.beginPath(); ctx.ellipse(70, 145, 26, 14, 0, 0, 7); ctx.ellipse(186, 145, 26, 14, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(110,60,40,0.4)';
    for (let i = 0; i < 18; i++) { ctx.beginPath(); ctx.arc(88 + (i * 37) % 80, 125 + (i * 13) % 22, 1.4, 0, 7); ctx.fill(); }
  }
  if (f.sweat > 0.01) { // flushed with fear
    ctx.fillStyle = `rgba(170,40,30,${0.15 * f.sweat})`;
    ctx.beginPath(); ctx.ellipse(128, 130, 120, 60, 0, 0, 7); ctx.fill();
  }
  // mouth
  const mw = 34 * f.width, open = f.open, smile = f.smile;
  const cx = 128, cy = 178;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (open > 0.06) {
    ctx.fillStyle = '#2a0c0a';
    ctx.beginPath();
    ctx.moveTo(cx - mw, cy - smile * 10);
    ctx.quadraticCurveTo(cx, cy - 6 - open * 10 + smile * 6, cx + mw, cy - smile * 10);
    ctx.quadraticCurveTo(cx, cy + open * 46 + smile * 8, cx - mw, cy - smile * 10);
    ctx.fill();
    // teeth
    ctx.save(); ctx.clip();
    ctx.fillStyle = '#efe9dc';
    ctx.fillRect(cx - mw, cy - 14 + smile * 2, mw * 2, 10 + open * 4);
    ctx.fillStyle = '#b4554c';
    ctx.beginPath(); ctx.ellipse(cx, cy + open * 40, mw * 0.6, 12, 0, 0, 7); ctx.fill();
    ctx.restore();
  }
  ctx.strokeStyle = c.lips; ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(cx - mw, cy - smile * 10);
  ctx.quadraticCurveTo(cx, cy - 6 - open * 10 + smile * 6, cx + mw, cy - smile * 10);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - mw, cy - smile * 10);
  ctx.quadraticCurveTo(cx, cy + Math.max(open * 46, 4) + smile * 8, cx + mw, cy - smile * 10);
  ctx.stroke();
  ctx.restore();
}

const EXPRESSIONS = {
  neutral: { brow: 0, browAng: 0, lid: 0.15, pupil: 1, open: 0, smile: 0, width: 1 },
  smug: { brow: 0.1, browAng: -0.25, lid: 0.45, pupil: 1, open: 0, smile: 0.7, width: 1.1 },
  happy: { brow: 0.3, browAng: 0.1, lid: 0.25, pupil: 1.1, open: 0.5, smile: 1, width: 1.25 },
  angry: { brow: -0.35, browAng: -0.55, lid: 0.2, pupil: 0.8, open: 0.45, smile: -0.6, width: 1.1 },
  suspicious: { brow: -0.1, browAng: -0.35, lid: 0.55, pupil: 0.8, open: 0, smile: -0.3, width: 0.8 },
  scared: { brow: 0.5, browAng: 0.55, lid: -0.15, pupil: 0.55, open: 0.35, smile: -0.7, width: 0.85 },
  shocked: { brow: 0.7, browAng: 0.25, lid: -0.3, pupil: 0.5, open: 0.95, smile: -0.2, width: 0.75 },
  sad: { brow: 0.2, browAng: 0.6, lid: 0.45, pupil: 0.9, open: 0.05, smile: -0.8, width: 0.9 },
  dead: { brow: 0, browAng: 0, lid: 1, pupil: 1, open: 0.15, smile: -0.1, width: 0.9 },
};

// --------------------------------------------------------------- hands

function buildHand(side, skin, nails) {
  const sgn = side === 'R' ? -1 : 1;
  const hand = new THREE.Group();
  const palm = mesh(new THREE.BoxGeometry(0.075, 0.085, 0.032), skin);
  palm.position.y = -0.04;
  hand.add(palm);
  const fingers = [];
  for (let i = 0; i < 4; i++) {
    const piv = new THREE.Group();
    piv.position.set((i - 1.5) * 0.019, -0.082, 0);
    const f = mesh(new THREE.CapsuleGeometry(0.0085, 0.04, 3, 6), skin);
    f.position.y = -0.026;
    piv.add(f);
    if (nails) {
      const n = mesh(new THREE.ConeGeometry(0.007, 0.025, 6), nails);
      n.position.set(0, -0.06, 0.004);
      n.rotation.x = Math.PI;
      piv.add(n);
    }
    hand.add(piv);
    fingers.push(piv);
  }
  const thumb = new THREE.Group();
  thumb.position.set(sgn * -0.035, -0.035, 0.012);
  const t = mesh(new THREE.CapsuleGeometry(0.01, 0.035, 3, 6), skin);
  t.position.y = -0.022;
  thumb.add(t);
  thumb.rotation.z = sgn * 0.6;
  hand.add(thumb);
  return { hand, fingers, thumb, sgn };
}

const FINGERS = {
  open: { curl: [0.1, 0.1, 0.1, 0.1], spread: 0.08, thumb: [0.2, 0, 0.6] },
  rest: { curl: [0.5, 0.6, 0.7, 0.8], spread: 0.03, thumb: [0.4, 0, 0.4] },
  fist: { curl: [1.6, 1.6, 1.6, 1.6], spread: 0, thumb: [1.0, 0, 0.1] },
  point: { curl: [0, 1.6, 1.6, 1.6], spread: 0, thumb: [1.0, 0, 0.1] },
  hold: { curl: [1.0, 1.1, 1.2, 1.3], spread: 0.02, thumb: [0.9, 0, 0.3] },
  pinch: { curl: [-0.9, -0.9, -0.9, -0.9], spread: -0.18, thumb: [-1.0, 0, -0.2] },
};

// --------------------------------------------------------------- poses
// Joint targets: spine [x,y,z], and per arm sh/el/wr in "right arm" terms;
// left arm mirrors y and z. Positive sh.z moves an arm inward (toward the body's midline).

const P = (o) => o;
export const POSES = {
  rest: P({ spine: [0.12, 0, 0], shR: [-0.75, 0, 0.18], elR: [-0.8, 0, 0], wrR: [0.3, 0, 0], shL: [-0.75, 0, 0.18], elL: [-0.8, 0, 0], wrL: [0.3, 0, 0], fR: 'rest', fL: 'rest' }),
  hold: P({ spine: [0.08, 0, 0], shR: [-0.75, 0, 0.2], elR: [-0.8, 0, 0], wrR: [0.3, 0, 0], shL: [-0.55, 0, 0.35], elL: [-1.65, 0, 0], wrL: [-0.2, 0, 0.4], fR: 'rest', fL: 'hold' }),
  playCards: P({ spine: [0.32, 0, 0], shR: [-1.15, 0, 0.12], elR: [-0.25, 0, 0], wrR: [0.4, 0, 0], shL: [-0.55, 0, 0.35], elL: [-1.65, 0, 0], wrL: [-0.2, 0, 0.4], fR: 'hold', fL: 'hold' }),
  point: P({ spine: [0.22, 0, 0], shR: [-1.45, 0, 0.05], elR: [-0.1, 0, 0], wrR: [0, 0, 0], shL: [-0.7, 0, 0.18], elL: [-0.8, 0, 0], wrL: [0.3, 0, 0], fR: 'point', fL: 'fist' }),
  slam: P({ spine: [0.35, 0, 0], shR: [-1.1, 0, 0.1], elR: [-0.5, 0, 0], wrR: [0.2, 0, 0], shL: [-1.1, 0, 0.1], elL: [-0.5, 0, 0], wrL: [0.2, 0, 0], fR: 'fist', fL: 'fist' }),
  gunHead: P({ spine: [0.02, 0, 0.06], shR: [0.1, 0, -2.0], elR: [0, 0, -1.9], wrR: [0, 0, 0.3], shL: [-0.7, 0, 0.25], elL: [-1.0, 0, 0], wrL: [0.2, 0, 0], fR: 'hold', fL: 'fist' }),
  celebrate: P({ spine: [-0.12, 0, 0], shR: [-0.1, 0, -2.6], elR: [0, 0, -0.4], wrR: [0, 0, 0], shL: [-0.1, 0, -2.6], elL: [0, 0, -0.4], wrL: [0, 0, 0], fR: 'fist', fL: 'fist' }),
  akimbo: P({ spine: [-0.05, 0, 0], shR: [0.25, 0, -0.75], elR: [0, 0, 2.1], wrR: [0, 0, 0.5], shL: [0.25, 0, -0.75], elL: [0, 0, 2.1], wrL: [0, 0, 0.5], fR: 'fist', fL: 'fist' }),
  waitHand: P({ spine: [0.1, 0, 0], shR: [-0.75, 0, 0.35], elR: [-1.55, 0, 0], wrR: [-1.0, 0, 0], shL: [-0.55, 0, 0.35], elL: [-1.65, 0, 0], wrL: [-0.2, 0, 0.4], fR: 'pinch', fL: 'hold' }),
  beard: P({ spine: [0.05, 0, 0], shR: [-0.75, 0, 0.55], elR: [-2.1, 0, 0], wrR: [-0.4, 0, 0], shL: [-0.55, 0, 0.35], elL: [-1.65, 0, 0], wrL: [-0.2, 0, 0.4], fR: 'rest', fL: 'hold' }),
  facepalm: P({ spine: [0.3, 0, 0], shR: [-0.95, 0, 0.5], elR: [-2.25, 0, 0], wrR: [-0.6, 0, 0], shL: [-0.75, 0, 0.18], elL: [-0.8, 0, 0], wrL: [0.3, 0, 0], fR: 'open', fL: 'rest' }),
  shrug: P({ spine: [-0.05, 0, 0], shR: [-0.2, 0, -0.55], elR: [-1.5, 0, 0], wrR: [0, 0, -0.6], shL: [-0.2, 0, -0.55], elL: [-1.5, 0, 0], wrL: [0, 0, -0.6], fR: 'open', fL: 'open' }),
  flinch: P({ spine: [-0.2, 0, 0], shR: [-0.9, 0, 0.6], elR: [-2.0, 0, 0], wrR: [0, 0, 0], shL: [-0.9, 0, 0.6], elL: [-2.0, 0, 0], wrL: [0, 0, 0], fR: 'open', fL: 'open' }),
  dead: P({ spine: [0.95, 0, 0.12], shR: [-0.95, 0, -0.1], elR: [-0.2, 0, 0], wrR: [0.5, 0, 0], shL: [-0.5, 0, 0.25], elL: [-0.6, 0, 0], wrL: [0.4, 0, 0], fR: 'open', fL: 'open' }),
};

// --------------------------------------------------------------- builder

export function buildCharacter(char) {
  const c = CHARACTERS[char];
  const root = new THREE.Group();
  root.name = char;
  const skin = std(c.skin, { roughness: 0.55 });
  const shirtMap = c.sleeves === 'coat' ? T.fabric('#8d8a86', '#3a3a3a', [6, 6]) : c.sleeves === 'puff' ? T.fabric('#efe8d6', '#b8ad94', [8, 8]) : T.fabric(c.shirt, '#000', [6, 6]);
  const shirt = std('#ffffff', { map: shirtMap, roughness: 0.9 });
  const pants = std(c.pants, { roughness: 0.85 });
  const b = c.build;

  // legs (seated)
  const legs = new THREE.Group();
  for (const s of [-1, 1]) {
    const thigh = mesh(new THREE.CapsuleGeometry(0.075 * b, 0.36, 4, 8), pants);
    thigh.rotation.x = Math.PI / 2; thigh.position.set(s * 0.11, 0.52, 0.2);
    const shin = mesh(new THREE.CapsuleGeometry(0.065 * b, 0.36, 4, 8), pants);
    shin.position.set(s * 0.11, 0.28, 0.42);
    const shoe = mesh(new THREE.BoxGeometry(0.1, 0.07, 0.2), std('#151210', { roughness: 0.4 }));
    shoe.position.set(s * 0.11, 0.04, 0.47);
    legs.add(thigh, shin, shoe);
  }
  root.add(legs);

  // spine pivot at the hips
  const spine = at(new THREE.Group(), 0, 0.52, 0);
  root.add(spine);

  // torso
  const torsoProfile = [];
  const ruffle = c.sleeves === 'puff';
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    let r = (0.2 + Math.sin(t * Math.PI * 0.85) * 0.06) * b;
    if (ruffle && t > 0.15 && t < 0.55) r += Math.sin(t * 60) * 0.008;
    if (t > 0.9) r *= 1 - (t - 0.9) * 4;
    torsoProfile.push(new THREE.Vector2(Math.max(r, 0.04), t * 0.6));
  }
  const torso = mesh(new THREE.LatheGeometry(torsoProfile, 24), shirt);
  torso.scale.set(1.05, 1, 0.72);
  spine.add(torso);
  if (c.sleeves === 'coat') {
    // lapels + scarf
    for (const s of [-1, 1]) {
      const lap = mesh(new THREE.BoxGeometry(0.09, 0.3, 0.02), std('#7a7672', { roughness: 0.95 }));
      lap.position.set(s * 0.08, 0.38, 0.17); lap.rotation.set(0.25, 0, s * 0.35);
      spine.add(lap);
    }
    const scarf = mesh(new THREE.TorusGeometry(0.12, 0.05, 10, 20), std('#1c1a1b', { roughness: 1 }));
    scarf.rotation.x = Math.PI / 2; scarf.position.y = 0.6; scarf.scale.set(1.1, 1, 1);
    spine.add(scarf);
    const tail = mesh(new THREE.BoxGeometry(0.1, 0.32, 0.04), std('#1c1a1b', { roughness: 1 }));
    tail.position.set(0.05, 0.42, 0.16); tail.rotation.set(0.25, 0, 0.1);
    spine.add(tail);
  }
  if (char === 'coin') {
    const gold = std('#d8b14a', { metalness: 1, roughness: 0.3 });
    for (let i = 0; i < 2; i++) {
      const n = mesh(new THREE.TorusGeometry(0.1 + i * 0.03, 0.004, 6, 30), gold);
      n.rotation.x = Math.PI / 2 + 0.6; n.position.set(0, 0.55 - i * 0.03, 0.05);
      spine.add(n);
    }
  }
  if (char === 'dog') {
    const chain = mesh(new THREE.TorusGeometry(0.13, 0.014, 8, 24), std('#e0b84a', { metalness: 1, roughness: 0.25 }));
    chain.rotation.x = Math.PI / 2 + 0.7; chain.position.set(0, 0.53, 0.06);
    spine.add(chain);
  }

  // neck + head
  const neck = mesh(new THREE.CylinderGeometry(0.06 * b, 0.07 * b, 0.12, 12), skin);
  neck.position.y = 0.64;
  spine.add(neck);
  const headPivot = at(new THREE.Group(), 0, 0.68, 0);
  spine.add(headPivot);
  const head = new THREE.Group();
  const R = c.headR;
  head.position.y = R * 0.85;
  head.scale.set(...c.headScale);
  headPivot.add(head);
  const skull = mesh(new THREE.SphereGeometry(R, 40, 32), skin);
  head.add(skull);
  // jaw/cheeks for a heavier, caricatured lower face
  const jaw = mesh(new THREE.SphereGeometry(R * 0.82, 32, 24), skin);
  jaw.position.set(0, -R * 0.38, R * 0.1);
  jaw.scale.set(char === 'dog' ? 1.15 : 1, 0.75, 0.95);
  head.add(jaw);

  // face decal
  const [fc, fctx] = T.canvas(256, 256);
  const faceTex = new THREE.CanvasTexture(fc);
  faceTex.colorSpace = THREE.SRGBColorSpace;
  const face = mesh(new THREE.SphereGeometry(R * 1.004, 32, 24, Math.PI / 2 - 1.15, 2.3, 0.75, 1.65),
    new THREE.MeshStandardMaterial({ map: faceTex, transparent: true, roughness: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), { cast: false });
  head.add(face);
  // jaw needs the lower mouth area to also sit over the jaw bulge: push decal out a bit at the bottom
  face.scale.set(1.0, 1.0, 1.06);

  // ears
  for (const s of [-1, 1]) {
    const ear = mesh(new THREE.SphereGeometry(R * 0.22, 12, 10), skin);
    ear.scale.set(0.45, 1, 0.8);
    ear.position.set(s * R * 0.98, -R * 0.05, -R * 0.05);
    head.add(ear);
  }

  // nose
  const noseGeo = {
    bob: () => { const g = new THREE.SphereGeometry(R * 0.2, 20, 16); g.scale(1, 0.9, 1.3); return g; },
    coin: () => { const g = new THREE.ConeGeometry(R * 0.11, R * 0.38, 12); g.rotateX(Math.PI / 2 + 0.5); return g; },
    wait: () => { const g = new THREE.SphereGeometry(R * 0.14, 16, 12); g.scale(1.1, 0.9, 1.1); return g; },
    dog: () => { const g = new THREE.SphereGeometry(R * 0.2, 16, 12); g.scale(1.5, 0.7, 0.8); return g; },
  }[char]();
  const nose = mesh(noseGeo, skin);
  nose.position.set(0, -R * 0.12, R * 0.97);
  head.add(nose);
  for (const s of [-1, 1]) { // nostrils
    const n = mesh(new THREE.SphereGeometry(R * 0.035, 8, 6), std('#2a120c'), { cast: false });
    n.position.set(s * R * 0.07, -R * 0.24, R * (char === 'bob' ? 1.12 : 1.02));
    head.add(n);
  }

  // eyes
  const eyes = [];
  const lidMat = skin;
  const eyeR = R * (char === 'wait' ? 0.24 : char === 'dog' ? 0.18 : 0.22);
  for (const s of [-1, 1]) {
    const socket = new THREE.Group();
    socket.position.set(s * R * 0.36, R * 0.12, R * 0.82);
    head.add(socket);
    const ball = new THREE.Group();
    socket.add(ball);
    const white = mesh(new THREE.SphereGeometry(eyeR, 24, 18), std('#f4efe6', { roughness: 0.15 }), { cast: false });
    ball.add(white);
    const iris = mesh(new THREE.CircleGeometry(eyeR * 0.55, 24), std(c.eye, { roughness: 0.1 }), { cast: false });
    iris.position.z = eyeR * 0.995;
    ball.add(iris);
    const pupil = mesh(new THREE.CircleGeometry(eyeR * 0.28, 20), std('#050302', { roughness: 0.05 }), { cast: false });
    pupil.position.z = eyeR * 1.0 + 0.0005;
    ball.add(pupil);
    const glint = mesh(new THREE.CircleGeometry(eyeR * 0.1, 10), new THREE.MeshBasicMaterial({ color: '#ffffff' }), { cast: false });
    glint.position.set(eyeR * 0.18, eyeR * 0.2, eyeR * 1.0 + 0.001);
    ball.add(glint);
    // upper lid: a hemisphere shell that rotates down over the eye
    const lidPiv = new THREE.Group();
    socket.add(lidPiv);
    const lid = mesh(new THREE.SphereGeometry(eyeR * 1.08, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), lidMat, { cast: false });
    lid.rotation.x = Math.PI / 2; // dome faces forward
    lidPiv.add(lid);
    const lower = mesh(new THREE.SphereGeometry(eyeR * 1.06, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), lidMat, { cast: false });
    lower.rotation.x = Math.PI / 2 + Math.PI * 0.62;
    socket.add(lower);
    // X marks for when the character dies
    const xg = new THREE.Group();
    for (const r of [0.8, -0.8]) {
      const bar = mesh(new THREE.BoxGeometry(eyeR * 1.8, eyeR * 0.28, eyeR * 0.2), std('#1a0808'), { cast: false });
      bar.rotation.z = r; xg.add(bar);
    }
    xg.position.z = eyeR * 1.15; xg.visible = false;
    socket.add(xg);
    // brow
    const brow = mesh(new THREE.CapsuleGeometry(R * 0.06, R * 0.32, 4, 8), std(c.brow, { roughness: 1 }));
    brow.rotation.z = Math.PI / 2;
    const browPiv = at(new THREE.Group(), s * R * 0.36, R * 0.42, R * 0.86);
    browPiv.add(brow);
    head.add(browPiv);
    eyes.push({ socket, ball, pupil, iris, lidPiv, xg, browPiv, s });
  }
  if (char === 'dog') {
    // sunglasses over the eyes
    const glassMat = std('#050505', { roughness: 0.05, metalness: 0.6 });
    for (const s of [-1, 1]) {
      const lens = mesh(new THREE.BoxGeometry(R * 0.6, R * 0.32, 0.02), glassMat);
      lens.position.set(s * R * 0.36, R * 0.12, R * 1.02);
      head.add(lens);
    }
    const bridge = mesh(new THREE.BoxGeometry(R * 1.5, 0.015, 0.015), glassMat);
    bridge.position.set(0, R * 0.22, R * 1.02); head.add(bridge);
    // earpiece
    const ep = mesh(new THREE.SphereGeometry(0.018, 8, 8), glassMat); ep.position.set(R * 1.03, -R * 0.05, 0); head.add(ep);
    // shiny bald head
    skull.material = std(c.skin, { roughness: 0.25 });
  }

  // hair & headwear
  const props = buildHair(char, head, R);

  // arms
  const arms = {};
  const sleeveMat = c.sleeves === 'coat' ? shirt : c.sleeves === 'puff' ? shirt : shirt;
  const nails = char === 'wait' ? std('#d9b3a6', { roughness: 0.3 }) : char === 'coin' ? std('#c86f6f', { roughness: 0.3 }) : null;
  for (const side of ['R', 'L']) {
    const s = side === 'R' ? -1 : 1;
    const sh = at(new THREE.Group(), s * 0.25 * b, 0.5, 0);
    spine.add(sh);
    const upperMat = c.sleeves === 'short' ? sleeveMat : sleeveMat;
    const upper = mesh(new THREE.CapsuleGeometry(0.055 * b, 0.22, 4, 8), upperMat);
    upper.position.y = -0.14;
    sh.add(upper);
    if (c.sleeves === 'puff') {
      const puff = mesh(new THREE.SphereGeometry(0.1, 16, 12), shirt);
      puff.scale.set(1, 0.9, 1); puff.position.y = -0.04; sh.add(puff);
    } else if (c.sleeves === 'short') {
      const cuff = mesh(new THREE.CylinderGeometry(0.068 * b, 0.072 * b, 0.12, 12), shirt);
      cuff.position.y = -0.06; sh.add(cuff);
      upper.material = skin;
    }
    const el = at(new THREE.Group(), 0, -0.29, 0);
    sh.add(el);
    const fore = mesh(new THREE.CapsuleGeometry(0.045 * b, 0.2, 4, 8), c.sleeves === 'coat' ? shirt : skin);
    fore.position.y = -0.13;
    el.add(fore);
    if (c.sleeves === 'coat') {
      const cuff = mesh(new THREE.CylinderGeometry(0.058, 0.06, 0.05, 12), std('#6f6c69', { roughness: 1 }));
      cuff.position.y = -0.25; el.add(cuff);
    }
    const wr = at(new THREE.Group(), 0, -0.27, 0);
    el.add(wr);
    const h = buildHand(side, skin, nails);
    h.hand.scale.setScalar(1.15 * b);
    wr.add(h.hand);
    arms[side] = { sh, el, wr, ...h };
  }

  // per-character state
  const ch = {
    char, root, spine, headPivot, head, eyes, arms, face, faceCtx: fctx, faceTex, props,
    pose: { ...POSES.rest }, from: null, target: POSES.rest,
    joints: {}, fingerState: { R: { ...FINGERS.rest }, L: { ...FINGERS.rest } },
    expr: { ...EXPRESSIONS.neutral }, exprTarget: EXPRESSIONS.neutral,
    look: V3(0, 1.2, 0), lookCur: V3(0, 1.2, 1), blink: 0, nextBlink: 2,
    talk: 0, talkAmp: 0, sweat: 0, dead: false, faceKey: '', t: Math.random() * 10,
    idlePose: char === 'coin' ? 'akimbo' : 'rest', handFan: null, fanCount: 0,
    shake: 0, jolt: 0, recoil: 0,
  };
  for (const k of ['spine', 'shR', 'elR', 'wrR', 'shL', 'elL', 'wrL']) ch.joints[k] = [...POSES.rest[k]];
  setFace(ch, true);
  return ch;
}

function buildHair(char, head, R) {
  const props = { flyaway: null, coins: [] };
  if (char === 'bob') {
    const wigMat = std('#0b0a0b', { roughness: 0.32, map: T.hair('#121012', null) });
    const wig = new THREE.Group();
    const cap = mesh(new THREE.SphereGeometry(R * 1.09, 32, 20, 0, Math.PI * 2, 0, 1.2), wigMat);
    cap.rotation.x = -0.12;
    wig.add(cap);
    // straight sides down to the jaw, open at the face
    const sides = mesh(new THREE.CylinderGeometry(R * 1.06, R * 1.12, R * 1.3, 32, 1, true, Math.PI * 0.4, Math.PI * 1.2), wigMat);
    sides.position.y = -R * 0.3;
    sides.material = wigMat.clone(); sides.material.side = THREE.DoubleSide;
    wig.add(sides);
    // blunt bangs
    const bangs = mesh(new THREE.SphereGeometry(R * 1.11, 28, 8, Math.PI / 2 - 0.85, 1.7, 0.45, 0.62), wigMat.clone());
    bangs.material.side = THREE.DoubleSide;
    wig.add(bangs);
    head.add(wig);
    props.flyaway = wig;
    // little black party hat with orange squiggles, perched to the side
    const [hc, hx] = T.canvas(128, 128);
    hx.fillStyle = '#111'; hx.fillRect(0, 0, 128, 128);
    hx.strokeStyle = '#e98a2b'; hx.lineWidth = 4;
    for (let i = 0; i < 6; i++) { hx.beginPath(); hx.arc(20 + i * 20, 64 + Math.sin(i) * 30, 8, 0, 5); hx.stroke(); }
    const ht = new THREE.CanvasTexture(hc); ht.colorSpace = THREE.SRGBColorSpace;
    const hat = mesh(new THREE.ConeGeometry(R * 0.28, R * 0.6, 16), std('#ffffff', { map: ht, roughness: 0.5 }));
    hat.position.set(R * 0.62, R * 0.8, R * 0.1); hat.rotation.z = -0.7;
    wig.add(hat);
    // the beard: a shaggy shell around the jaw
    const beardGeo = new THREE.SphereGeometry(R * 0.84, 32, 20, Math.PI / 2 - 1.3, 2.6, 1.9, 0.9);
    const pos = beardGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const v = V3(pos.getX(i), pos.getY(i), pos.getZ(i));
      v.multiplyScalar(1 + Math.random() * 0.06);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    beardGeo.computeVertexNormals();
    const beard = mesh(beardGeo, std('#141010', { roughness: 1, map: T.hair('#1a1412', null) }));
    beard.position.set(0, -R * 0.38, R * 0.12);
    beard.scale.set(1.04, 0.85, 1.05);
    head.add(beard);
    const stache = mesh(new THREE.TorusGeometry(R * 0.2, R * 0.06, 8, 16, Math.PI), std('#141010', { roughness: 1 }));
    stache.position.set(0, -R * 0.32, R * 0.96); stache.rotation.x = -0.2;
    head.add(stache);
  }
  if (char === 'coin') {
    const hairMat = std('#ffffff', { roughness: 0.55, map: T.hair('#3a2418', '#a77b4f') });
    const cap = mesh(new THREE.SphereGeometry(R * 1.05, 32, 20, 0, Math.PI * 2, 0, 1.25), hairMat);
    cap.rotation.x = -0.32;
    head.add(cap);
    const backMat = hairMat.clone(); backMat.side = THREE.DoubleSide;
    const back = mesh(new THREE.CylinderGeometry(R * 1.04, R * 0.62, R * 2.4, 24, 6, true, Math.PI * 0.32, Math.PI * 1.36), backMat);
    back.position.set(0, -R * 1.05, -R * 0.12);
    head.add(back);
    // one long front strand over the shoulder, like in the photo
    const strand = mesh(new THREE.CapsuleGeometry(R * 0.14, R * 1.6, 4, 8), hairMat);
    strand.scale.set(1.4, 1, 0.5);
    strand.position.set(R * 0.82, -R * 1.25, R * 0.3); strand.rotation.z = 0.12;
    head.add(strand);
    // pink crochet cap with real holes + coin fringe
    const cro = T.crochet();
    const crochet = new THREE.Group();
    const cm = mesh(new THREE.SphereGeometry(R * 1.12, 32, 16, 0, Math.PI * 2, 0, 1.12),
      std('#ffffff', { map: cro.map, alphaMap: cro.alpha, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1 }));
    cm.rotation.x = -0.35;
    crochet.add(cm);
    const silver = std('#d6d6d6', { metalness: 1, roughness: 0.25 });
    for (let i = 0; i < 9; i++) {
      const a = Math.PI / 2 + (i - 4) * 0.2;
      const piv = new THREE.Group();
      const yy = R * 0.62, rr = R * 0.98;
      piv.position.set(-Math.cos(a) * rr, yy, Math.sin(a) * rr);
      const thread = mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.03), silver, { cast: false });
      thread.position.y = -0.015;
      const coin = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.004, 16), silver);
      coin.rotation.x = Math.PI / 2; coin.position.y = -0.045;
      piv.add(thread, coin);
      piv.rotation.y = a - Math.PI / 2;
      crochet.add(piv);
      props.coins.push({ piv, v: 0, a: 0 });
    }
    head.add(crochet);
    props.flyaway = crochet;
    // gold hoops
    const gold = std('#d8b14a', { metalness: 1, roughness: 0.25 });
    for (const s of [-1, 1]) {
      const hoop = mesh(new THREE.TorusGeometry(0.035, 0.004, 6, 20), gold);
      hoop.position.set(s * R * 1.0, -R * 0.4, 0); hoop.rotation.y = Math.PI / 2;
      head.add(hoop);
    }
  }
  if (char === 'wait') {
    const hairMat = std('#ffffff', { roughness: 0.5, map: T.hair('#120c0a', '#2a1c16') });
    // two halves for the middle part
    for (const s of [-1, 1]) {
      const half = mesh(new THREE.SphereGeometry(R * 1.06, 24, 18, s > 0 ? 0 : Math.PI, Math.PI, 0, 1.2), hairMat);
      half.rotation.y = Math.PI / 2 * (s > 0 ? -1 : -1);
      half.rotation.z = s * 0.04;
      head.add(half);
    }
    const sideMat = hairMat.clone(); sideMat.side = THREE.DoubleSide;
    const g = new THREE.CylinderGeometry(R * 1.07, R * 1.35, R * 2.2, 32, 8, true, Math.PI * 0.2, Math.PI * 1.6);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) { // waves
      const y = pos.getY(i), x = pos.getX(i), z = pos.getZ(i);
      const k = 1 + Math.sin(y * 40 + Math.atan2(z, x) * 6) * 0.04;
      pos.setXYZ(i, x * k, y, z * k);
    }
    g.computeVertexNormals();
    const sides = mesh(g, sideMat);
    sides.position.y = -R * 0.72;
    head.add(sides);
    props.flyaway = null;
  }
  if (char === 'dog') {
    // toothpick
    const tp = mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.12), std('#d9c08a'));
    tp.rotation.z = 1.2; tp.position.set(R * 0.35, -R * 0.55, R * 0.95);
    head.add(tp);
    props.toothpick = tp;
  }
  return props;
}

// --------------------------------------------------------------- runtime

function setFace(ch, force = false) {
  const e = ch.expr;
  const open = Math.min(1, e.open + ch.talkAmp);
  const key = [open, e.smile, e.width, ch.sweat].map((v) => Math.round(v * 12)).join(',');
  if (!force && key === ch.faceKey) return;
  ch.faceKey = key;
  drawFace(ch.faceCtx, ch.char, { open, smile: e.smile, width: e.width, sweat: ch.sweat });
  ch.faceTex.needsUpdate = true;
}

export function setPose(ch, name) {
  if (ch.dead && name !== 'dead') return;
  const p = POSES[name] || POSES.rest;
  ch.target = p;
}
export function express(ch, name) {
  if (ch.dead && name !== 'dead') return;
  ch.exprTarget = EXPRESSIONS[name] || EXPRESSIONS.neutral;
}
export function lookAt(ch, v) { ch.look.copy(v); }
export function talk(ch, seconds) { ch.talk = Math.max(ch.talk, seconds); }

export function kill(ch, scene) {
  ch.dead = true;
  ch.target = POSES.dead;
  ch.exprTarget = EXPRESSIONS.dead;
  ch.jolt = 1;
  // the wig / cap flies off
  const f = ch.props.flyaway;
  if (f && scene) {
    const wp = new THREE.Vector3(); f.getWorldPosition(wp);
    const wq = new THREE.Quaternion(); f.getWorldQuaternion(wq);
    const ws = new THREE.Vector3(); f.getWorldScale(ws);
    scene.add(f);
    f.position.copy(wp); f.quaternion.copy(wq); f.scale.copy(ws);
    const out = new THREE.Vector3(0, 0, -1).applyQuaternion(ch.root.quaternion);
    ch.fly = { obj: f, v: out.multiplyScalar(1.6).add(V3(Math.random() - 0.5, 3.2, 0)), spin: V3(Math.random() * 8, Math.random() * 8, 4), t: 0 };
  }
}

export function revive(ch) {
  ch.dead = false;
  ch.eyes.forEach((e) => { e.xg.visible = false; });
  ch.target = POSES[ch.idlePose] || POSES.rest;
  ch.exprTarget = EXPRESSIONS.neutral;
  ch.sweat = 0;
  if (ch.fly) {
    const f = ch.fly.obj;
    ch.head.add(f);
    f.position.set(0, 0, 0); f.rotation.set(0, 0, 0); f.scale.set(1, 1, 1);
    ch.fly = null;
  }
}

const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();

export function updateCharacter(ch, dt) {
  ch.t += dt;
  const k = ch.dead ? 6 : 7;
  // joints
  for (const j of ['spine', 'shR', 'elR', 'wrR', 'shL', 'elL', 'wrL']) {
    const tgt = ch.target[j];
    const cur = ch.joints[j];
    for (let i = 0; i < 3; i++) cur[i] = damp(cur[i], tgt[i], k, dt);
  }
  const J = ch.joints;
  const breath = ch.dead ? 0 : Math.sin(ch.t * 1.6) * 0.02;
  ch.spine.rotation.set(J.spine[0] + breath - ch.jolt * 0.5 - ch.recoil * 0.3, J.spine[1], J.spine[2] + Math.sin(ch.t * 2.3) * ch.shake * 0.05);
  for (const side of ['R', 'L']) {
    const a = ch.arms[side];
    const m = side === 'R' ? 1 : -1; // left mirrors y/z; right arm sits at -x so inward is +z rotation
    const sh = J['sh' + side], el = J['el' + side], wr = J['wr' + side];
    a.sh.rotation.set(sh[0], sh[1] * m, sh[2] * m);
    a.el.rotation.set(el[0], side === 'R' ? el[1] : -el[1], side === 'R' ? el[2] : -el[2]);
    a.wr.rotation.set(wr[0], side === 'R' ? wr[1] : -wr[1], side === 'R' ? wr[2] : -wr[2]);
    // fingers
    const fn = FINGERS[ch.target['f' + side]] || FINGERS.rest;
    const fs = ch.fingerState[side];
    a.fingers.forEach((f, i) => {
      fs.curl[i] = damp(fs.curl[i] ?? 0, fn.curl[i], 10, dt);
      f.rotation.x = fs.curl[i];
      f.rotation.z = (i - 1.5) * fn.spread;
    });
    a.thumb.rotation.x = damp(a.thumb.rotation.x, fn.thumb[0], 10, dt);
    a.thumb.rotation.z = damp(a.thumb.rotation.z, a.sgn * fn.thumb[2], 10, dt);
  }
  ch.jolt = damp(ch.jolt, 0, 3, dt);
  ch.recoil = damp(ch.recoil, 0, 5, dt);

  // head look (in spine space)
  ch.lookCur.lerp(ch.look, 1 - Math.exp(-5 * dt));
  if (!ch.dead) {
    const hp = ch.headPivot;
    hp.updateWorldMatrix(true, false);
    _v.copy(ch.lookCur);
    hp.parent.worldToLocal(_v);
    _v.sub(hp.position);
    const yaw = Math.atan2(_v.x, _v.z);
    const pitch = -Math.atan2(_v.y - 0.1, Math.hypot(_v.x, _v.z));
    hp.rotation.y = damp(hp.rotation.y, Math.max(-1.1, Math.min(1.1, yaw)), 6, dt) + Math.sin(ch.t * 0.7) * 0.004;
    hp.rotation.x = damp(hp.rotation.x, Math.max(-0.5, Math.min(0.6, pitch)), 6, dt);
    hp.rotation.z = Math.sin(ch.t * 0.5) * 0.03 + Math.sin(ch.t * 31) * ch.shake * 0.02;
  } else {
    ch.headPivot.rotation.x = damp(ch.headPivot.rotation.x, 0.5, 4, dt);
    ch.headPivot.rotation.z = damp(ch.headPivot.rotation.z, 0.5, 4, dt);
    ch.headPivot.rotation.y = damp(ch.headPivot.rotation.y, 0, 4, dt);
  }

  // expression
  const e = ch.expr, et = ch.exprTarget;
  for (const key of Object.keys(et)) e[key] = damp(e[key], et[key], 8, dt);
  // blinking
  ch.nextBlink -= dt;
  if (ch.nextBlink < 0) { ch.blink = 1; ch.nextBlink = 1.5 + Math.random() * 4; }
  ch.blink = ch.possessed ? 0 : damp(ch.blink, 0, 18, dt);
  const lid = Math.min(1, Math.max(-0.3, e.lid + (ch.dead ? 0 : ch.blink)));
  for (const eye of ch.eyes) {
    eye.lidPiv.rotation.x = -2.5 * (1 - Math.pow(Math.max(0, Math.min(1, (lid + 0.3) / 1.3)), 2.2));
    eye.pupil.scale.setScalar(ch.possessed ? 3.6 : e.pupil);
    eye.iris.scale.setScalar(ch.possessed ? 1.7 : 1);
    eye.browPiv.position.y = ch.head.children[0].geometry.parameters.radius * (0.42 + e.brow * 0.18);
    eye.browPiv.rotation.z = eye.s * -e.browAng * -1;
    // eyes track the look target (with nervous darting while shaking)
    if (!ch.dead) {
      eye.socket.updateWorldMatrix(true, false);
      _v.copy(ch.lookCur);
      if (ch.shake > 0.3) _v.x += Math.sin(ch.t * 13) * 0.3;
      eye.socket.worldToLocal(_v);
      _m.lookAt(_v, V3(0, 0, 0), V3(0, 1, 0));
      _q.setFromRotationMatrix(_m);
      // clamp
      eye.ball.quaternion.slerp(_q, 1 - Math.exp(-12 * dt));
    }
  }
  // talking mouth flap
  if (ch.talk > 0) {
    ch.talk -= dt;
    ch.talkAmp = Math.max(0, Math.sin(ch.t * 22) * 0.35 + Math.sin(ch.t * 13) * 0.15 + 0.15);
  } else ch.talkAmp = damp(ch.talkAmp, 0, 12, dt);
  setFace(ch);

  // coins swing with head motion
  for (const c of ch.props.coins) {
    const target = -ch.headPivot.rotation.x * 0.8 - ch.spine.rotation.x * 0.6;
    c.v += (target - c.a) * 60 * dt - c.v * 3 * dt + (ch.shake * (Math.random() - 0.5) * 2);
    c.a += c.v * dt;
    c.piv.rotation.x = c.a;
  }
  // flying wig physics
  if (ch.fly) {
    const f = ch.fly;
    f.t += dt;
    if (f.obj.position.y > 0.05) {
      f.v.y -= 9.8 * dt;
      f.obj.position.addScaledVector(f.v, dt);
      f.obj.rotation.x += f.spin.x * dt; f.obj.rotation.y += f.spin.y * dt; f.obj.rotation.z += f.spin.z * dt;
    } else {
      f.obj.position.y = 0.05;
    }
  }
  // hand-held fan of card backs
  if (ch.handFan) {
    ch.handFan.children.forEach((card, i) => { card.visible = i < ch.fanCount && !ch.dead; });
  }
}

/** Fan of up to five card backs held in the left hand. */
export function attachFan(ch, backMat) {
  const fan = new THREE.Group();
  const geo = new THREE.PlaneGeometry(0.07, 0.105);
  const front = std('#d8ccb0', { roughness: 0.8 });
  for (let i = 0; i < 5; i++) {
    const card = new THREE.Group();
    const back = mesh(geo, backMat, { cast: true });
    const face = mesh(geo, front, { cast: false });
    face.rotation.y = Math.PI;
    card.add(back, face);
    card.position.set((i - 2) * 0.012, 0.04, i * 0.002);
    card.rotation.z = (2 - i) * 0.18;
    fan.add(card);
  }
  fan.position.set(0, -0.11, 0.03);
  fan.rotation.set(-0.2, Math.PI, 0);
  ch.arms.L.hand.add(fan);
  ch.handFan = fan;
}

export { EXPRESSIONS };
