// Tiny synthesized sound engine — zero assets, initialized on first gesture.
let ctx = null;
let master = null;
let noiseBuf = null;
const loops = {};   // named looping ambience nodes

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.55;
  master.connect(ctx.destination);
  const len = ctx.sampleRate * 0.5;
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
}

function env(gainNode, t0, peak, dur) {
  const g = gainNode.gain;
  g.setValueAtTime(0.0001, t0);
  g.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + 0.004);
  g.exponentialRampToValueAtTime(0.0001, t0 + dur);
}

function blip(freq0, freq1, dur, peak, type = 'square') {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(freq1, 1), t + dur);
  env(g, t, peak, dur);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur, peak, freq, q = 1) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  env(g, t, peak, dur);
  src.connect(f).connect(g).connect(master);
  src.start(t); src.stop(t + dur + 0.02);
}

export const sfx = {
  paddleHit(power = 0.5) {
    blip(300 + power * 260, 110, 0.09, 0.45 + power * 0.3, 'square');
    noise(0.05, 0.3 + power * 0.35, 2400 + power * 1800, 0.8);
  },
  botHit(power = 0.5) {
    blip(240 + power * 180, 95, 0.09, 0.35, 'square');
    noise(0.05, 0.25, 1900, 0.8);
  },
  bounce() { blip(190, 90, 0.06, 0.28, 'sine'); noise(0.03, 0.12, 1200, 1); },
  net() { noise(0.12, 0.3, 420, 0.6); blip(130, 60, 0.1, 0.15, 'sine'); },
  block() { blip(520, 240, 0.07, 0.3, 'triangle'); noise(0.04, 0.2, 3200, 1); },
  swish() { noise(0.16, 0.10, 900, 0.4); },
  charge() { /* handled as loop-lite: quick tick */ },
  pointWin() { blip(523, 523, 0.09, 0.3, 'triangle'); setTimeout(() => blip(784, 784, 0.14, 0.3, 'triangle'), 90); },
  pointLose() { blip(392, 392, 0.09, 0.25, 'triangle'); setTimeout(() => blip(262, 262, 0.16, 0.25, 'triangle'), 90); },
  gameWin() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => blip(f, f, 0.22, 0.3, 'triangle'), i * 130)); },
  gameLose() { [392, 330, 262, 196].forEach((f, i) => setTimeout(() => blip(f, f, 0.24, 0.25, 'triangle'), i * 150)); },
  swallowed() { blip(600, 40, 0.7, 0.35, 'sawtooth'); },
};

export function startLoop(name, kind) {
  if (!ctx || loops[name]) return;
  const g = ctx.createGain();
  g.gain.value = 0;
  g.connect(master);
  let src;
  if (kind === 'hum') {                     // black hole
    src = ctx.createOscillator();
    src.type = 'sine'; src.frequency.value = 46;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.6;
    const lg = ctx.createGain(); lg.gain.value = 8;
    lfo.connect(lg).connect(src.frequency); lfo.start();
    src.connect(g); src.start();
    g.gain.linearRampToValueAtTime(0.07, ctx.currentTime + 1.2);
    loops[name] = { nodes: [src, lfo], g };
  } else if (kind === 'wind') {             // fan
    src = ctx.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 520;
    src.connect(f).connect(g); src.start();
    g.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 1.2);
    loops[name] = { nodes: [src], g };
  }
}

export function stopLoop(name) {
  const l = loops[name];
  if (!l || !ctx) return;
  l.g.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
  const nodes = l.nodes;
  setTimeout(() => nodes.forEach(n => { try { n.stop(); } catch (e) {} }), 600);
  delete loops[name];
}

export function stopAllLoops() { Object.keys(loops).forEach(stopLoop); }

// ================= MUSIC =================
// Synthwave-ish backing loop, fully synthesized. ~112 BPM, Am–F–C–G.
let music = null;

const BPM = 112;
const STEP = 60 / BPM / 4;                 // 16th note
// One chord per bar, 8-bar loop (root midi notes)
const PROG = [57, 57, 53, 53, 48, 48, 55, 55];   // A  A  F  F  C  C  G  G
const ARP_OFFSETS = [0, 3, 7, 12, 7, 3, 0, 3];   // minor-flavored arp
const midi = n => 440 * Math.pow(2, (n - 69) / 12);

export function startMusic() {
  if (!ctx || music) return;
  const bus = ctx.createGain();
  bus.gain.value = 0.0;
  bus.connect(master);
  bus.gain.linearRampToValueAtTime(0.32, ctx.currentTime + 1.5);

  // gentle echo for the arp
  const delay = ctx.createDelay(1);
  delay.delayTime.value = STEP * 3;
  const fb = ctx.createGain(); fb.gain.value = 0.3;
  const wet = ctx.createGain(); wet.gain.value = 0.35;
  delay.connect(fb).connect(delay);
  delay.connect(wet).connect(bus);

  music = { bus, delay, wet, step: 0, nextT: ctx.currentTime + 0.1, timer: null, muted: false };

  const scheduleStep = (i, t) => {
    const bar = Math.floor(i / 16) % 8;
    const s16 = i % 16;
    const root = PROG[bar];

    // KICK: four on the floor
    if (s16 % 4 === 0) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.1);
      g.gain.setValueAtTime(0.9, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      o.connect(g).connect(bus); o.start(t); o.stop(t + 0.2);
    }
    // SNARE: 2 & 4
    if (s16 === 4 || s16 === 12) {
      const src = ctx.createBufferSource(); src.buffer = noiseBuf;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.8;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.4, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      src.connect(f).connect(g).connect(bus); src.start(t); src.stop(t + 0.16);
    }
    // HAT: offbeat 8ths + light 16ths
    if (s16 % 2 === 0) {
      const src = ctx.createBufferSource(); src.buffer = noiseBuf;
      const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 8000;
      const g = ctx.createGain();
      const loud = s16 % 4 === 2 ? 0.18 : 0.07;
      g.gain.setValueAtTime(loud, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
      src.connect(f).connect(g).connect(bus); src.start(t); src.stop(t + 0.05);
    }
    // BASS: driving 8ths, root with octave bounce
    if (s16 % 2 === 0) {
      const note = root - 24 + (s16 % 8 === 6 ? 12 : 0);
      const o = ctx.createOscillator(), g = ctx.createGain();
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 480; f.Q.value = 6;
      o.type = 'sawtooth';
      o.frequency.value = midi(note);
      g.gain.setValueAtTime(0.24, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + STEP * 1.9);
      o.connect(f).connect(g).connect(bus);
      o.start(t); o.stop(t + STEP * 2);
    }
    // ARP: 16ths, echoes into the delay
    {
      const note = root + ARP_OFFSETS[s16 % 8] + (s16 >= 8 ? 12 : 0);
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square';
      o.frequency.value = midi(note);
      g.gain.setValueAtTime(0.055, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + STEP * 0.9);
      o.connect(g); g.connect(bus); g.connect(delay);
      o.start(t); o.stop(t + STEP);
    }
    // PAD: one soft fifth held each bar
    if (s16 === 0) {
      for (const off of [0, 7]) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.value = midi(root - 12 + off);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.05, t + 0.4);
        g.gain.linearRampToValueAtTime(0.0001, t + STEP * 16);
        o.connect(g).connect(bus);
        o.start(t); o.stop(t + STEP * 16 + 0.1);
      }
    }
  };

  music.timer = setInterval(() => {
    if (!ctx || !music) return;
    while (music.nextT < ctx.currentTime + 0.25) {
      scheduleStep(music.step, music.nextT);
      music.step++;
      music.nextT += STEP;
    }
  }, 90);
}

export function stopMusic() {
  if (!music) return;
  clearInterval(music.timer);
  const bus = music.bus;
  if (ctx) {
    bus.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.8);
    setTimeout(() => bus.disconnect(), 1000);
  }
  music = null;
}

export function toggleMusic() {
  if (music) { stopMusic(); return false; }
  if (!ctx) initAudio();
  startMusic();
  return true;
}

export function musicOn() { return !!music; }

// --- chaos sfx ---
Object.assign(sfx, {
  boom(vol = 1) {
    blip(90, 30, 0.4, 0.5 * vol, 'sine');
    noise(0.35, 0.45 * vol, 350, 0.4);
  },
  meteorWhistle() { blip(2200, 600, 0.8, 0.06, 'sine'); },
  rumble() {
    blip(60, 28, 1.4, 0.35, 'sine');
    noise(1.2, 0.2, 160, 0.3);
  },
  chomp() {
    noise(0.09, 0.5, 900, 0.7);
    setTimeout(() => { blip(160, 60, 0.18, 0.45, 'square'); noise(0.15, 0.4, 500, 0.5); }, 110);
  },
  eruption() { noise(0.9, 0.3, 300, 0.35); blip(70, 40, 0.7, 0.2, 'sine'); },
  sunk() { blip(700, 60, 0.5, 0.35, 'sine'); setTimeout(() => noise(0.12, 0.25, 800, 0.6), 380); },
});
