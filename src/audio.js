// All sound is synthesized with WebAudio: no audio files to load.

let ctx = null;
let master, sfxBus, musicBus, ambBus, verb, verbSend;
let enabled = true;
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
  musicBus = ctx.createGain(); musicBus.gain.value = 0.22;
  const radio = ctx.createBiquadFilter(); radio.type = 'bandpass'; radio.frequency.value = 1200; radio.Q.value = 0.5;
  musicBus.connect(radio).connect(master);
  radio.connect(verbSend);
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
  // dripping pipe
  const drip = () => {
    if (!ctx) return;
    tone({ freq: 1400 + Math.random() * 600, to: 2400, dur: 0.06, gain: 0.025, pan: -0.6, bus: ambBus });
    setTimeout(drip, 2500 + Math.random() * 6000);
  };
  setTimeout(drip, 3000);
}

// A slow, smoky minor blues from a radio behind the bar.
function startMusic() {
  const bpm = 72, beat = 60 / bpm;
  const prog = [[110, 130.8, 164.8], [146.8, 174.6, 220], [110, 130.8, 164.8], [164.8, 207.7, 246.9]];
  const bass = [55, 65.4, 73.4, 82.4, 73.4, 65.4, 61.7, 58.3];
  let bar = 0;
  let next = ctx.currentTime + 0.5;
  const schedule = () => {
    if (!ctx) return;
    while (next < ctx.currentTime + 2) {
      const chord = prog[bar % 4];
      for (let b = 0; b < 4; b++) {
        const t = next + b * beat - ctx.currentTime;
        tone({ t, type: 'triangle', freq: bass[(bar * 4 + b) % 8] * (bar % 4 === 1 ? 1.335 : 1), dur: beat * 0.9, gain: 0.5, bus: musicBus });
        burst({ t: t + beat / 2, type: 'highpass', freq: 7000, dur: 0.05, gain: 0.08 * 2.5 });
        if (b === 0 || b === 2) chord.forEach((f) => tone({ t: t + 0.02, type: 'sine', freq: f * 2, dur: beat * 1.6, gain: 0.13, attack: 0.04, bus: musicBus }));
      }
      next += beat * 4; bar += 1;
    }
    setTimeout(schedule, 500);
  };
  schedule();
}

export function duckMusic(amount = 0.05, time = 0.4) {
  if (!ctx) return;
  musicBus.gain.setTargetAtTime(amount, ctx.currentTime, time);
}
export function restoreMusic() {
  if (!ctx) return;
  musicBus.gain.setTargetAtTime(0.22, ctx.currentTime, 0.8);
}
export function onAudioReady(f) { listeners.push(f); if (ctx) f(); }
