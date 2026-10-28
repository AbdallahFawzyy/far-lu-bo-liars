// All sound is synthesized with WebAudio: no audio files to load.

let ctx = null;
let master, sfxBus, musicBus, ambBus, verb, verbSend;
let enabled = true;
const MUSIC_LEVEL = 0.34;
const listeners = [];

function impulse(seconds, decay) {
  const len = ctx.sampleRate * seconds;
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

let noiseBuf;
function noise() {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  return s;
}

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = enabled ? 0.9 : 0;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 4;
  master.connect(comp).connect(ctx.destination);
  verb = ctx.createConvolver(); verb.buffer = impulse(2.6, 3);
  const verbOut = ctx.createGain(); verbOut.gain.value = 0.55;
  verb.connect(verbOut).connect(master);
  verbSend = ctx.createGain(); verbSend.gain.value = 1; verbSend.connect(verb);
  sfxBus = ctx.createGain(); sfxBus.gain.value = 1; sfxBus.connect(master);
  const sfxVerb = ctx.createGain(); sfxVerb.gain.value = 0.35; sfxBus.connect(sfxVerb).connect(verbSend);
  musicBus = ctx.createGain(); musicBus.gain.value = MUSIC_LEVEL;
  const warm = ctx.createBiquadFilter(); warm.type = 'lowpass'; warm.frequency.value = 3800;
  musicBus.connect(warm).connect(master);
  const musicVerb = ctx.createGain(); musicVerb.gain.value = 0.9;
  warm.connect(musicVerb).connect(verbSend);
  ambBus = ctx.createGain(); ambBus.gain.value = 0.5; ambBus.connect(master);
  const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = nb.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  noiseBuf = nb;
  startAmbience();
  startMusic();
  listeners.forEach((f) => f());
}

export function setSound(on) {
  enabled = on;
  if (master) master.gain.setTargetAtTime(on ? 0.9 : 0, ctx.currentTime, 0.05);
}
export const soundOn = () => enabled;
export const audioTime = () => (ctx ? ctx.currentTime : 0);

/** Stereo pan + distance for a sound at a world-ish position: pan -1..1, dist 0..1 */
function spatial(out, pan = 0, gain = 1) {
  const g = ctx.createGain(); g.gain.value = gain;
  if (ctx.createStereoPanner) {
    const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(p).connect(out);
  } else g.connect(out);
  return g;
}

function env(g, t, a, peak, dec) {
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
}

function burst({ t = 0, type = 'bandpass', freq = 2000, q = 1, dur = 0.05, gain = 0.5, pan = 0, attack = 0.002, sweep = null }) {
  if (!ctx) return;
  const now = ctx.currentTime + t;
  const s = noise();
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, now + dur);
  const g = ctx.createGain();
  s.connect(f).connect(g).connect(spatial(sfxBus, pan));
  env(g, now, attack, gain, dur);
  s.start(now, Math.random()); s.stop(now + attack + dur + 0.05);
}

function tone({ t = 0, type = 'sine', freq = 440, to = null, dur = 0.2, gain = 0.3, pan = 0, attack = 0.005, bus = null }) {
  if (!ctx) return;
  const now = ctx.currentTime + t;
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, now);
  if (to) o.frequency.exponentialRampToValueAtTime(to, now + dur);
  const g = ctx.createGain();
  o.connect(g).connect(spatial(bus || sfxBus, pan));
  env(g, now, attack, gain, dur);
  o.start(now); o.stop(now + attack + dur + 0.05);
}

// ------------------------------------------------------------- effects

export const sfx = {
  cardSlide(pan = 0, t = 0) { burst({ t, type: 'bandpass', freq: 3000, sweep: 900, q: 0.8, dur: 0.18, gain: 0.25, pan, attack: 0.02 }); },
  cardFlip(pan = 0, t = 0) { burst({ t, type: 'highpass', freq: 2500, q: 0.7, dur: 0.06, gain: 0.35, pan }); burst({ t: t + 0.05, type: 'bandpass', freq: 1200, dur: 0.05, gain: 0.2, pan }); },
  shuffle() { for (let i = 0; i < 14; i++) burst({ t: i * 0.045 + Math.random() * 0.02, type: 'bandpass', freq: 2500 + Math.random() * 1500, q: 1, dur: 0.04, gain: 0.18 }); },
  deal(n = 5, pan = 0) { for (let i = 0; i < n; i++) this.cardSlide(pan, i * 0.11); },
  thud(pan = 0, t = 0, gain = 0.6) { tone({ t, freq: 110, to: 45, dur: 0.25, gain, pan }); burst({ t, type: 'lowpass', freq: 400, dur: 0.12, gain: gain * 0.6, pan }); },
  clink(pan = 0, t = 0) { [2600, 3900, 5200].forEach((f, i) => tone({ t, freq: f * (1 + Math.random() * 0.02), dur: 0.5 - i * 0.12, gain: 0.06, pan })); },
  /** Revolver hammer being thumbed back: two metal clicks. */
  cock(pan = 0, t = 0) {
    burst({ t, type: 'bandpass', freq: 4200, q: 6, dur: 0.03, gain: 0.7, pan });
    tone({ t, type: 'square', freq: 1800, to: 1200, dur: 0.02, gain: 0.08, pan });
    burst({ t: t + 0.11, type: 'bandpass', freq: 3000, q: 8, dur: 0.04, gain: 0.9, pan });
    tone({ t: t + 0.11, type: 'triangle', freq: 2400, to: 1900, dur: 0.06, gain: 0.12, pan });
  },
  /** Cylinder spin: ratchet clicks slowing down. */
  spin(pan = 0, t = 0) {
    let at = t, gap = 0.028;
    for (let i = 0; i < 26; i++) {
      burst({ t: at, type: 'bandpass', freq: 5200 + Math.random() * 600, q: 9, dur: 0.012, gain: 0.35, pan });
      at += gap; gap *= 1.09;
    }
    burst({ t: at, type: 'bandpass', freq: 2600, q: 5, dur: 0.05, gain: 0.7, pan });
  },
  dryFire(pan = 0, t = 0) {
    burst({ t, type: 'bandpass', freq: 3600, q: 10, dur: 0.035, gain: 1.0, pan });
    tone({ t, type: 'triangle', freq: 900, to: 600, dur: 0.08, gain: 0.15, pan });
  },
  gunshot(pan = 0, t = 0) {
    if (!ctx) return;
    burst({ t, type: 'lowpass', freq: 9000, sweep: 300, q: 0.3, dur: 0.55, gain: 1.6, pan, attack: 0.001 });
    burst({ t, type: 'highpass', freq: 3000, q: 0.5, dur: 0.07, gain: 1.2, pan, attack: 0.001 });
    tone({ t, freq: 150, to: 32, dur: 0.6, gain: 1.4, pan, attack: 0.001 });
    // big room tail
    const now = ctx.currentTime + t;
    const s = noise(); const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1500;
    const g = ctx.createGain(); s.connect(f).connect(g).connect(verbSend);
    env(g, now, 0.002, 2.2, 0.4); s.start(now); s.stop(now + 0.5);
    // ear ringing
    tone({ t: t + 0.05, freq: 3950, dur: 3.2, gain: 0.05, attack: 0.3 });
    // shell casing on concrete
    [0.7, 0.86, 0.97].forEach((d, i) => tone({ t: t + d, type: 'triangle', freq: 5200 - i * 300, dur: 0.12, gain: 0.05, pan }));
  },
  heartbeat(t = 0, gain = 0.5) { tone({ t, freq: 60, to: 40, dur: 0.12, gain }); tone({ t: t + 0.22, freq: 55, to: 38, dur: 0.14, gain: gain * 0.8 }); },
  /** Dissonant sting when someone calls LIAR. */
  liar() {
    [196, 207.65, 293.66, 415.3].forEach((f) => tone({ type: 'sawtooth', freq: f, to: f * 0.97, dur: 1.1, gain: 0.07, attack: 0.01 }));
    burst({ type: 'lowpass', freq: 200, dur: 0.6, gain: 0.8 });
  },
  reveal(lie) {
    if (lie) [110, 116.5, 155.6].forEach((f) => tone({ type: 'sawtooth', freq: f, dur: 1.4, gain: 0.08 }));
    else [261.6, 329.6, 392].forEach((f, i) => tone({ t: i * 0.06, type: 'triangle', freq: f, dur: 0.9, gain: 0.08 }));
  },
  win() { [261.6, 329.6, 392, 523.3, 659.3].forEach((f, i) => tone({ t: i * 0.12, type: 'triangle', freq: f, dur: 0.6, gain: 0.12 })); },
  tick() { burst({ type: 'bandpass', freq: 6000, q: 4, dur: 0.01, gain: 0.25 }); },
  ui() { tone({ type: 'triangle', freq: 880, to: 660, dur: 0.06, gain: 0.08 }); },
  select(up = true) { tone({ type: 'triangle', freq: up ? 700 : 500, to: up ? 900 : 400, dur: 0.05, gain: 0.08 }); burst({ type: 'highpass', freq: 3000, dur: 0.03, gain: 0.08 }); },
  squeak(pan = 0) { tone({ type: 'sine', freq: 2800, to: 3600, dur: 0.08, gain: 0.04, pan }); tone({ t: 0.1, type: 'sine', freq: 3200, to: 2600, dur: 0.06, gain: 0.03, pan }); },
  /** Breathy whisper: formant-filtered noise that drifts. */
  whisper(pan = 0, dur = 2.2, t = 0) {
    if (!ctx) return;
    const now = ctx.currentTime + t;
    const src = noise();
    const g = ctx.createGain(); g.gain.value = 0;
    const out = spatial(sfxBus, pan, 0.9);
    [[700, 9], [1300, 8], [2600, 7]].forEach(([f, q]) => {
      const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f; b.Q.value = q;
      for (let k = 0; k < 8; k++) b.frequency.setValueAtTime(f * (0.7 + Math.random() * 0.7), now + (k * dur) / 8);
      src.connect(b).connect(g);
    });
    g.connect(out);
    for (let k = 0; k < Math.ceil(dur * 4); k++) {
      const at = now + k * 0.25;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(0.5 + Math.random() * 0.6, at + 0.06);
      g.gain.linearRampToValueAtTime(0.0001, at + 0.22);
    }
    src.start(now); src.stop(now + dur + 0.3);
  },
  breath(pan = 0, t = 0, n = 3) {
    for (let i = 0; i < n; i++) {
      burst({ t: t + i * 1.4, type: 'bandpass', freq: 900, sweep: 500, q: 1.5, dur: 0.7, gain: 0.35, pan, attack: 0.4 });
      burst({ t: t + i * 1.4 + 0.8, type: 'bandpass', freq: 600, sweep: 400, q: 1.5, dur: 0.5, gain: 0.25, pan, attack: 0.2 });
    }
  },
  creak(pan = 0, t = 0, dur = 2.5) {
    if (!ctx) return;
    const now = ctx.currentTime + t;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(90, now);
    o.frequency.linearRampToValueAtTime(140, now + dur * 0.4);
    o.frequency.linearRampToValueAtTime(70, now + dur);
    const trem = ctx.createOscillator(); trem.frequency.value = 23;
    const tg = ctx.createGain(); tg.gain.value = 0.5;
    const g = ctx.createGain(); g.gain.value = 0.5;
    trem.connect(tg).connect(g.gain);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 6;
    const env2 = ctx.createGain();
    o.connect(f).connect(g).connect(env2).connect(spatial(sfxBus, pan, 0.5));
    env2.gain.setValueAtTime(0.0001, now);
    env2.gain.linearRampToValueAtTime(1, now + 0.3);
    env2.gain.linearRampToValueAtTime(0.0001, now + dur);
    o.start(now); trem.start(now); o.stop(now + dur + 0.1); trem.stop(now + dur + 0.1);
  },
  slam(pan = 0, t = 0) { tone({ t, freq: 90, to: 30, dur: 0.6, gain: 1.4, pan, attack: 0.001 }); burst({ t, type: 'lowpass', freq: 1800, sweep: 200, dur: 0.5, gain: 1.2, pan, attack: 0.001 }); },
  footsteps(pan = 0, t = 0, n = 5, gap = 0.7) { for (let i = 0; i < n; i++) { this.thud(pan, t + i * gap, 0.25); burst({ t: t + i * gap, type: 'bandpass', freq: 300, dur: 0.08, gain: 0.3, pan }); } },
  /** Low brass-like hit for a scare. */
  stinger(t = 0) {
    [36.7, 38.9, 55, 73.4].forEach((f) => tone({ t, type: 'sawtooth', freq: f, to: f * 0.94, dur: 2.4, gain: 0.16, attack: 0.01 }));
    burst({ t, type: 'lowpass', freq: 500, sweep: 60, dur: 1.5, gain: 1.0, attack: 0.002 });
  },
  /** Jump-scare screech: dissonant shrieking cluster plus noise. */
  screech(t = 0) {
    [1180, 1250, 1663, 2210, 2350].forEach((f) => tone({ t, type: 'sawtooth', freq: f, to: f * 1.15, dur: 1.1, gain: 0.07, attack: 0.005 }));
    burst({ t, type: 'highpass', freq: 1500, dur: 1.0, gain: 0.9, attack: 0.002 });
    this.stinger(t);
  },
  boom(t = 0) { tone({ t, freq: 48, to: 22, dur: 2.2, gain: 1.2, attack: 0.005 }); },
  glitch(t = 0) { for (let i = 0; i < 10; i++) burst({ t: t + i * 0.035, type: 'bandpass', freq: 400 + Math.random() * 5000, q: 3, dur: 0.03, gain: 0.5 }); },
  staticNoise(dur = 2, t = 0) { burst({ t, type: 'bandpass', freq: 2500, q: 0.4, dur, gain: 0.4, attack: 0.05 }); },
  bloodDrip(pan = 0, t = 0) { tone({ t, freq: 320, to: 180, dur: 0.12, gain: 0.12, pan }); burst({ t, type: 'lowpass', freq: 700, dur: 0.06, gain: 0.2, pan }); },
  /** Slow, deep, wrong voice from somewhere in the room. */
  demonVoice(pan = 0, t = 0, syll = 6) {
    if (!ctx) return;
    const now = ctx.currentTime + t;
    for (let i = 0; i < syll; i++) {
      const at = now + i * 0.32;
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(52 + Math.random() * 10, at);
      o.frequency.linearRampToValueAtTime(40, at + 0.3);
      const [f1, f2] = VOWELS[Math.floor(Math.random() * VOWELS.length)];
      const a = ctx.createBiquadFilter(); a.type = 'bandpass'; a.frequency.value = f1 * 0.7; a.Q.value = 5;
      const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f2 * 0.6; b.Q.value = 6;
      const g = ctx.createGain();
      o.connect(a).connect(g); o.connect(b).connect(g);
      g.connect(spatial(sfxBus, pan, 1.6));
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(1, at + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.31);
      o.start(at); o.stop(at + 0.33);
    }
  },
  wigFlap(pan = 0, t = 0) { burst({ t, type: 'bandpass', freq: 700, sweep: 2500, q: 0.6, dur: 0.3, gain: 0.25, pan }); },
};

// ------------------------------------------------------------- voices

// Gibberish formant voice: each character has its own pitch, speed and vowel colour.
const VOWELS = [[800, 1150], [400, 2000], [300, 2300], [450, 800], [350, 600]];
export const VOICES = {
  bob: { pitch: 115, spread: 30, rate: 0.085, wave: 'sawtooth', gain: 0.22 },
  coin: { pitch: 235, spread: 45, rate: 0.075, wave: 'sawtooth', gain: 0.18 },
  wait: { pitch: 205, spread: 70, rate: 0.065, wave: 'sawtooth', gain: 0.18 },
  dog: { pitch: 80, spread: 15, rate: 0.11, wave: 'sawtooth', gain: 0.26 },
};

/** Babble roughly matching the length of `text`; returns duration in seconds. */
export function speak(char, text, pan = 0, { excited = false } = {}) {
  const v = VOICES[char] || VOICES.dog;
  const syll = Math.max(2, Math.min(22, Math.round(text.replace(/[^a-z]/gi, '').length / 2.6)));
  const dur = syll * v.rate * (excited ? 0.8 : 1);
  if (!ctx || !enabled) return dur + 0.3;
  const out = spatial(sfxBus, pan, v.gain);
  const now = ctx.currentTime + 0.02;
  for (let i = 0; i < syll; i++) {
    const t = now + i * v.rate * (excited ? 0.8 : 1);
    const len = v.rate * (0.65 + Math.random() * 0.3);
    const [f1, f2] = VOWELS[Math.floor(Math.random() * VOWELS.length)];
    const o = ctx.createOscillator(); o.type = v.wave;
    const p = v.pitch + (Math.random() - 0.5) * v.spread * (excited ? 2 : 1) + (i === syll - 1 && text.endsWith('?') ? 60 : 0);
    o.frequency.setValueAtTime(p, t);
    o.frequency.linearRampToValueAtTime(p * (0.92 + Math.random() * 0.16), t + len);
    const a = ctx.createBiquadFilter(); a.type = 'bandpass'; a.frequency.value = f1; a.Q.value = 6;
    const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f2; b.Q.value = 8;
    const g = ctx.createGain();
    o.connect(a).connect(g); o.connect(b).connect(g);
    g.connect(out);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(excited ? 1.4 : 1, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.start(t); o.stop(t + len + 0.02);
  }
  return dur + 0.3;
}

// ------------------------------------------------------------- ambience

function startAmbience() {
  // ventilation rumble
  const s = noise(); const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 140;
  const g = ctx.createGain(); g.gain.value = 0.5;
  s.connect(f).connect(g).connect(ambBus); s.start();
  // electrical hum from the lamp
  const o = ctx.createOscillator(); o.frequency.value = 50; o.type = 'sawtooth';
  const hf = ctx.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 180;
  const hg = ctx.createGain(); hg.gain.value = 0.025; o.connect(hf).connect(hg).connect(ambBus); o.start();
  // muffled crowd upstairs: bandpassed noise with slow wobble
  const c = noise(); const cf = ctx.createBiquadFilter(); cf.type = 'bandpass'; cf.frequency.value = 500; cf.Q.value = 1.2;
  const cg = ctx.createGain(); cg.gain.value = 0.12;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.13; const lg = ctx.createGain(); lg.gain.value = 0.06;
  lfo.connect(lg).connect(cg.gain); lfo.start();
  c.connect(cf).connect(cg).connect(ambBus); c.start();
}

// "Black market tragedy": a slow D-minor waltz on a detuned piano over a bowed
// string pad and a low drone, with a funeral bell every few bars.
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

function piano(t, m, gain = 0.16, detune = 0) {
  const f = midi(m) * Math.pow(2, detune / 1200);
  const now = ctx.currentTime + t;
  const out = ctx.createGain(); out.connect(musicBus);
  out.gain.setValueAtTime(0.0001, now);
  out.gain.exponentialRampToValueAtTime(gain, now + 0.008);
  out.gain.exponentialRampToValueAtTime(gain * 0.35, now + 0.4);
  out.gain.exponentialRampToValueAtTime(0.0001, now + 3.6);
  [[1, 1], [2, 0.35], [3, 0.12], [4.02, 0.05]].forEach(([h, a]) => {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * h;
    const g = ctx.createGain(); g.gain.value = a;
    o.connect(g).connect(out); o.start(now); o.stop(now + 3.7);
  });
}

function strings(t, notes, dur, gain = 0.035) {
  const now = ctx.currentTime + t;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700; f.Q.value = 0.7;
  const g = ctx.createGain(); g.connect(musicBus);
  f.connect(g);
  g.gain.setValueAtTime(0.0001, now);
  g.gain.linearRampToValueAtTime(gain, now + dur * 0.35);
  g.gain.linearRampToValueAtTime(gain * 0.8, now + dur * 0.8);
  g.gain.linearRampToValueAtTime(0.0001, now + dur + 1.2);
  for (const m of notes) for (const d of [-7, 6]) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midi(m); o.detune.value = d;
    const vib = ctx.createOscillator(); vib.frequency.value = 4.6 + Math.random();
    const vg = ctx.createGain(); vg.gain.value = 3; vib.connect(vg).connect(o.detune);
    o.connect(f); o.start(now); vib.start(now); o.stop(now + dur + 1.3); vib.stop(now + dur + 1.3);
  }
}

function bell(t, m, gain = 0.09) {
  const now = ctx.currentTime + t;
  const f = midi(m);
  [[1, 1, 7], [2.76, 0.5, 4], [5.4, 0.25, 2.5], [8.93, 0.12, 1.5]].forEach(([h, a, d]) => {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * h;
    const g = ctx.createGain(); g.connect(musicBus);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gain * a, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + d);
    o.connect(g); o.start(now); o.stop(now + d + 0.1);
  });
}

function startMusic() {
  // drone: low D, two detuned saws through a slowly breathing filter
  const df = ctx.createBiquadFilter(); df.type = 'lowpass'; df.frequency.value = 160; df.Q.value = 2;
  const dg = ctx.createGain(); dg.gain.value = 0.09; df.connect(dg).connect(musicBus);
  for (const [fr, det] of [[36.71, -8], [36.71, 9], [55, 0]]) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr; o.detune.value = det;
    o.connect(df); o.start();
  }
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05;
  const lg = ctx.createGain(); lg.gain.value = 90; lfo.connect(lg).connect(df.frequency); lfo.start();

  const beat = 60 / 54; // slow waltz, 3 beats a bar
  const chords = [[50, 53, 57], [46, 50, 53], [43, 50, 55], [45, 49, 52], [50, 53, 57], [48, 53, 57], [43, 46, 50], [45, 49, 55]];
  const melody = [
    [69, 65, 62], [70, 69, 67], [67, 70, 74], [73, null, 69],
    [74, 72, 70], [69, 65, 69], [67, 70, 69], [69, null, null],
  ];
  const answer = [
    [null, 62, 65], [67, null, 65], [62, 58, 62], [61, null, null],
    [null, 69, 70], [72, 70, 69], [67, 65, 64], [62, null, null],
  ];
  let bar = 0;
  let next = ctx.currentTime + 0.8;
  const schedule = () => {
    if (!ctx) return;
    while (next < ctx.currentTime + 3) {
      const i = bar % 8;
      const cycle = Math.floor(bar / 8) % 4;
      const t0 = next - ctx.currentTime;
      strings(t0, chords[i], beat * 3, 0.03);
      piano(t0, chords[i][0] - 12, 0.12); // left hand bass
      piano(t0 + beat, chords[i][1], 0.05);
      piano(t0 + beat * 2, chords[i][2], 0.05);
      const line = cycle === 1 ? answer : melody;
      if (cycle !== 3) line[i].forEach((m, k) => { if (m) piano(t0 + k * beat, m, 0.14, cycle === 2 ? -18 : 0); });
      else if (i % 2 === 0) piano(t0, melody[i][0] + 12, 0.06, -25); // sparse, out-of-tune music box
      if (i === 0) bell(t0, 38, 0.1);
      if (i === 4 && Math.random() < 0.5) bell(t0 + beat, 37, 0.06); // a flat, wrong second toll
      next += beat * 3; bar += 1;
    }
    setTimeout(schedule, 700);
  };
  schedule();
}

export function duckMusic(amount = 0.05, time = 0.4) {
  if (!ctx) return;
  musicBus.gain.setTargetAtTime(amount, ctx.currentTime, time);
}
export function restoreMusic() {
  if (!ctx) return;
  musicBus.gain.setTargetAtTime(MUSIC_LEVEL, ctx.currentTime, 0.8);
}
export function onAudioReady(f) { listeners.push(f); if (ctx) f(); }
