// PERILOUS WAYS — procedural audio.
//
// Everything here is synthesised at runtime: oscillators, noise buffers built in
// JS, biquads, and one convolution reverb whose impulse response is generated
// from decaying filtered noise. There are no audio files and nothing is fetched.
//
// Public surface (see INTERFACES.md):
//   Audio.init()
//   Audio.setScene({ age, region, unrest, night, speed })
//   Audio.play(name, opts)
//   Audio.setMuted(bool)  /  Audio.muted
// Extras used by test/audio.html (safe for the host to ignore):
//   Audio.stats(), Audio.oneShots, Audio.regions, Audio.setVolume(v), Audio.scene()
//
// House rules that keep a 40-minute session healthy:
//   * every transient node is registered on a Voice, and every Voice is killed
//     exactly once — stopped AND disconnected — by onended or by the sweeper.
//   * the persistent graph is built once; scene changes only ramp AudioParams
//     and (for region beds) build/tear down a small, bounded set of nodes.
//   * one-shots are pooled per name with oldest-stolen, so `chuff` at 20/s can
//     never grow the graph.

// ---------------------------------------------------------------------------
// Tiny local helpers (kept self-contained: audio must work with no imports).
// ---------------------------------------------------------------------------

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;

/** mulberry32, same generator family as src/rng.js. */
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

// Modes, as semitone offsets from the root.
const MODES = {
  dorian: [0, 2, 3, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
};

const REGIONS = [
  'GREENHOLLOW', 'FROSTMARCH', 'MIRKHOLT', 'PEAKS', 'WEEPING', 'ASHENREACH',
  'MARCHLANDS', 'ELDERWOOD', 'QUAYS', 'BARROWDOWNS', 'WODENHOLT',
];

const ONE_SHOTS = [
  'whistle', 'bell', 'build_track', 'build_works', 'chuff', 'brake', 'coin',
  'charter', 'petition', 'incident', 'dragon', 'collapse', 'depart', 'doom',
  'ent', 'ui_click', 'ui_hover', 'error',
];

// Concurrency caps per one-shot name. Oldest voice is stolen past the cap.
const CAPS = {
  chuff: 6, ui_hover: 3, ui_click: 4, coin: 4, build_track: 4, build_works: 3,
  brake: 3, bell: 3, whistle: 2, petition: 2, charter: 2, incident: 2,
  collapse: 2, error: 2, dragon: 1, depart: 1, doom: 1, ent: 1,
};
const DEFAULT_CAP = 4;

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let ctx = null;
let ready = false;          // graph exists and is usable
let unavailable = false;    // no AudioContext in this browser: no-op everything
let masterVol = 0.5;        // modest by default — people play this while thinking
let isMuted = false;
let timer = null;           // scheduler interval id

const nodes = {};           // persistent graph nodes, by name
const bufs = {};            // generated AudioBuffers
let irBuffer = null;

const stats = {
  persistent: 0,   // nodes in the always-on graph (incl. region beds)
  live: 0,         // transient voice nodes currently connected
  voices: 0,       // transient voices currently alive
  created: 0,      // lifetime counters
  disposed: 0,
  stolen: 0,
  notes: 0,
  peakLive: 0,
};

// Scene, as last requested, plus the smoothed values we actually play.
const scene = {
  age: 1,
  region: 'GREENHOLLOW',
  unrest: 0,
  night: 0,
  speed: 1,
};

// Music clock.
const music = {
  nextStep: 0,      // ctx time of the next melodic grid step
  step: 0,          // seconds per grid step
  stepIndex: 0,
  bpm: 56,
  rootMidi: 38,     // D2
  mode: MODES.dorian,
  rng: makeRng(0x9e3779b9),
  walk: 4,          // current scale degree of the random walk
  restRun: 0,
  nextRing: 0,      // Age III metallic ring
  nextThump: 0,     // Age III irregular low pulse
  lastNoteMidi: 0,
};

const LOOK_AHEAD = 1.6;     // seconds scheduled in advance (survives a throttled
const TICK_MS = 120;        // background tab, where setInterval floors at ~1s)

// ---------------------------------------------------------------------------
// Voice bookkeeping — the anti-leak machinery
// ---------------------------------------------------------------------------

const voices = [];          // all live transient voices
const pools = {};           // name -> [voice], for one-shot caps

const MAX_VOICES = 96;      // hard ceiling; oldest is sacrificed past it

/** A voice owns every node it creates and disconnects all of them exactly once. */
function beginVoice(name, endAt) {
  // Safety net: if anything ever schedules faster than it decays, the graph
  // still cannot grow without bound.
  let guard = 0;
  while (voices.length >= MAX_VOICES && guard++ < MAX_VOICES) {
    stats.stolen++;
    killVoice(voices[0]);
  }
  const v = { name, list: [], endAt, dead: false, gain: null };
  voices.push(v);
  stats.voices++;
  return v;
}

/** Register a node on a voice. Returns the node for chaining. */
function own(v, node) {
  v.list.push(node);
  stats.live++;
  stats.created++;
  if (stats.live > stats.peakLive) stats.peakLive = stats.live;
  return node;
}

function killVoice(v) {
  if (v.dead) return;
  v.dead = true;
  for (let i = 0; i < v.list.length; i++) {
    const n = v.list[i];
    try { if (n.stop) n.stop(); } catch (e) { /* already stopped */ }
    try { n.onended = null; } catch (e) { /* not a source */ }
    try { n.disconnect(); } catch (e) { /* already gone */ }
    stats.live--;
    stats.disposed++;
  }
  v.list.length = 0;
  stats.voices--;
  if (stats.live < 0) stats.live = 0;
  if (stats.voices < 0) stats.voices = 0;
  const i = voices.indexOf(v);
  if (i >= 0) voices.splice(i, 1);
  if (v.name) {
    const p = pools[v.name];
    if (p) {
      const j = p.indexOf(v);
      if (j >= 0) p.splice(j, 1);
    }
  }
}

/**
 * Attach the primary source so cleanup happens the instant it ends. Every
 * voice must call this exactly once: `onended` is the main teardown path and
 * it is driven by the audio clock, not by a JS timer.
 */
function finish(v, src, stopTime) {
  v.endAt = stopTime;
  v.src = src;
  try { src.stop(stopTime); } catch (e) { /* ignore */ }
  src.onended = () => killVoice(v);
}

/** Sweeper: catches voices whose onended never fired (suspended ctx, etc). */
function sweepVoices() {
  const now = ctx.currentTime;
  for (let i = voices.length - 1; i >= 0; i--) {
    const v = voices[i];
    if (v.endAt && now > v.endAt + 0.4) killVoice(v);
  }
}

/**
 * Enforce the per-name cap by stealing the oldest voice: a 15 ms fade so it
 * never clicks, then the primary source is stopped early, which fires
 * `onended` and tears the whole voice down. No JS timer is involved, so this
 * works identically in a throttled background tab.
 */
function enforceCap(name) {
  const cap = CAPS[name] || DEFAULT_CAP;
  const p = pools[name] || (pools[name] = []);
  let guard = 0;
  while (p.length >= cap && guard++ < cap + 4) {
    const old = p.shift();
    if (!old || old.dead) continue;
    stats.stolen++;
    const t = ctx.currentTime;
    if (old.gain) {
      try {
        old.gain.gain.cancelScheduledValues(t);
        old.gain.gain.setTargetAtTime(0, t, 0.005);
      } catch (e) { /* ignore */ }
    }
    old.endAt = t + 0.02;
    if (old.src) { try { old.src.stop(t + 0.02); } catch (e) { killVoice(old); } }
    else killVoice(old);
  }
  return p;
}

// ---------------------------------------------------------------------------
// Buffer generation: noise beds and the reverb impulse response
// ---------------------------------------------------------------------------

function makeNoiseBuffer(seconds, kind, seed) {
  const sr = ctx.sampleRate;
  const len = Math.max(1, Math.floor(sr * seconds));
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    const rnd = makeRng(seed + ch * 7919);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    let brown = 0;
    for (let i = 0; i < len; i++) {
      const w = rnd() * 2 - 1;
      let s;
      if (kind === 'white') {
        s = w;
      } else if (kind === 'pink') {
        // Paul Kellet's economy pink filter.
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.96900 * b2 + w * 0.1538520;
        b3 = 0.86650 * b3 + w * 0.3104856;
        b4 = 0.55000 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.0168980;
        s = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      } else { // brown
        brown = (brown + 0.02 * w) / 1.02;
        s = brown * 3.5;
      }
      d[i] = clamp(s, -1, 1);
    }
    // Cross-fade the tail into the head so the loop has no seam.
    const xf = Math.min(Math.floor(sr * 0.25), Math.floor(len / 4));
    for (let i = 0; i < xf; i++) {
      const t = i / xf;
      d[i] = d[i] * t + d[len - xf + i] * (1 - t);
    }
  }
  return buf;
}

/**
 * Impulse response: exponentially decaying noise, progressively darkened by a
 * one-pole lowpass whose coefficient falls over the tail, plus a handful of
 * discrete early reflections offset per channel for width. This is the single
 * cheapest thing that makes synthesised audio sound like it is in a place.
 */
function makeImpulseResponse(seconds, decayPow, damp) {
  const sr = ctx.sampleRate;
  const len = Math.max(1, Math.floor(sr * seconds));
  const buf = ctx.createBuffer(2, len, sr);
  let peak = 1e-6;
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    const rnd = makeRng(0x51ed270b + ch * 104729);
    let lp = 0, lp2 = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const env = Math.pow(1 - t, decayPow) * Math.exp(-t * 2.2);
      const k = damp * (1 - 0.72 * t);          // tail gets darker
      const w = rnd() * 2 - 1;
      lp += (w - lp) * k;
      lp2 += (lp - lp2) * 0.4;
      d[i] = lp2 * env;
    }
    // Early reflections: sparse taps in the first 90 ms.
    const taps = [0.011, 0.019, 0.027, 0.038, 0.051, 0.067, 0.083];
    for (let k = 0; k < taps.length; k++) {
      const i = Math.floor((taps[k] + ch * 0.0031) * sr);
      if (i < len) d[i] += (k % 2 ? -1 : 1) * 0.5 * Math.pow(0.72, k) * (0.6 + 0.4 * rnd());
    }
    for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
  }
  const g = 0.6 / peak;
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] *= g;
  }
  return buf;
}

// ---------------------------------------------------------------------------
// Persistent graph construction
// ---------------------------------------------------------------------------

function pnode(name, node) {
  nodes[name] = node;
  stats.persistent++;
  stats.created++;
  return node;
}

function gain(v) {
  const g = ctx.createGain();
  g.gain.value = v;
  return g;
}

/** A looping noise source that beds tap. Persistent for the whole session. */
function startLoop(bufName, outName) {
  const src = ctx.createBufferSource();
  src.buffer = bufs[bufName];
  src.loop = true;
  const out = gain(1);
  src.connect(out);
  src.start(ctx.currentTime + 0.02);
  pnode(outName + 'Src', src);
  return pnode(outName, out);
}

function buildGraph() {
  // --- master chain: everything lands here, nothing clips -----------------
  const limiter = pnode('limiter', ctx.createDynamicsCompressor());
  limiter.threshold.value = -10;
  limiter.knee.value = 8;
  limiter.ratio.value = 6;
  limiter.attack.value = 0.004;
  limiter.release.value = 0.22;
  limiter.connect(ctx.destination);

  const master = pnode('master', gain(isMuted ? 0 : masterVol));
  master.connect(limiter);

  // --- reverb -------------------------------------------------------------
  irBuffer = makeImpulseResponse(3.4, 2.1, 0.42);
  const conv = pnode('conv', ctx.createConvolver());
  conv.normalize = false;
  conv.buffer = irBuffer;
  const preDelay = pnode('preDelay', ctx.createDelay(0.5));
  preDelay.delayTime.value = 0.028;
  const revIn = pnode('revIn', gain(1));
  const revTone = pnode('revTone', ctx.createBiquadFilter());
  revTone.type = 'lowpass';
  revTone.frequency.value = 4200;
  revTone.Q.value = 0.4;
  const revWet = pnode('revWet', gain(0.9));
  revIn.connect(preDelay);
  preDelay.connect(conv);
  conv.connect(revTone);
  revTone.connect(revWet);
  revWet.connect(master);

  // --- buses --------------------------------------------------------------
  const musicBus = pnode('musicBus', gain(0.85));
  const ambBus = pnode('ambBus', gain(0.7));
  const sfxBus = pnode('sfxBus', gain(0.9));
  musicBus.connect(master);
  ambBus.connect(master);
  sfxBus.connect(master);

  const musicSend = pnode('musicSend', gain(0.34));
  const ambSend = pnode('ambSend', gain(0.12));
  const sfxSend = pnode('sfxSend', gain(0.26));
  musicBus.connect(musicSend); musicSend.connect(revIn);
  ambBus.connect(ambSend); ambSend.connect(revIn);
  sfxBus.connect(sfxSend); sfxSend.connect(revIn);

  // --- shared noise loops -------------------------------------------------
  bufs.white = makeNoiseBuffer(3.1, 'white', 0x1234567);
  bufs.pink = makeNoiseBuffer(5.3, 'pink', 0x2ba3f10d);
  bufs.brown = makeNoiseBuffer(6.7, 'brown', 0x5f3a91c7);
  startLoop('white', 'tapWhite');
  startLoop('pink', 'tapPink');
  startLoop('brown', 'tapBrown');

  // --- music sub-buses ----------------------------------------------------
  const droneBus = pnode('droneBus', gain(0.0));
  const padBus = pnode('padBus', gain(0.0));
  const pluckBus = pnode('pluckBus', gain(0.0));
  const machBus = pnode('machBus', gain(0.0));
  droneBus.connect(musicBus);
  padBus.connect(musicBus);
  pluckBus.connect(musicBus);
  machBus.connect(musicBus);

  // --- ambience sub-buses -------------------------------------------------
  const bedBus = pnode('bedBus', gain(1));
  const evtBus = pnode('evtBus', gain(1));
  bedBus.connect(ambBus);
  evtBus.connect(ambBus);

  buildDrone();
  buildPad();
}

// ---------------------------------------------------------------------------
// Drone — two detuned saws plus a sub, through a lowpass with a slow LFO.
// Persistent: built once, only ever retuned.
// ---------------------------------------------------------------------------

function buildDrone() {
  const lp = pnode('droneLP', ctx.createBiquadFilter());
  lp.type = 'lowpass';
  lp.frequency.value = 320;
  // Enough Q to give the drone a formant, not enough to boom when the LFO
  // sweeps the cutoff across a harmonic of the root.
  lp.Q.value = 1.8;
  lp.connect(nodes.droneBus);

  // Slow cutoff LFO: breathing, never rhythmic.
  const lfo = pnode('droneLFO', ctx.createOscillator());
  lfo.type = 'sine';
  lfo.frequency.value = 0.045;
  const lfoAmt = pnode('droneLFOAmt', gain(120));
  lfo.connect(lfoAmt);
  lfoAmt.connect(lp.frequency);
  lfo.start();

  // A second, slower LFO on detune so the beating never settles.
  const dlfo = pnode('droneDetuneLFO', ctx.createOscillator());
  dlfo.type = 'sine';
  dlfo.frequency.value = 0.017;
  const dAmt = pnode('droneDetuneAmt', gain(4));
  dlfo.connect(dAmt);
  dlfo.start();

  const mk = (name, type, det, g) => {
    const o = pnode(name, ctx.createOscillator());
    o.type = type;
    o.detune.value = det;
    const og = pnode(name + 'G', gain(g));
    o.connect(og);
    og.connect(lp);
    dAmt.connect(o.detune);
    o.start();
    return o;
  };
  mk('droneA', 'sawtooth', -7, 0.14);
  mk('droneB', 'sawtooth', 7, 0.14);
  mk('droneSub', 'triangle', 0, 0.23);
  tuneDrone(0);
}

function tuneDrone(glide) {
  const t = ctx.currentTime;
  const root = hz(music.rootMidi);
  const set = (o, f) => {
    o.frequency.cancelScheduledValues(t);
    if (glide > 0) {
      o.frequency.setValueAtTime(o.frequency.value, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(8, f), t + glide);
    } else {
      o.frequency.setValueAtTime(Math.max(8, f), t);
    }
  };
  set(nodes.droneA, root);
  set(nodes.droneB, root);
  set(nodes.droneSub, root * 0.5);
}

// ---------------------------------------------------------------------------
// Pad — three voices holding chord tones, each swelling on its own slow LFO.
// ---------------------------------------------------------------------------

function buildPad() {
  const lp = pnode('padLP', ctx.createBiquadFilter());
  lp.type = 'lowpass';
  lp.frequency.value = 1500;
  lp.Q.value = 0.7;
  lp.connect(nodes.padBus);

  for (let i = 0; i < 3; i++) {
    const o = pnode('pad' + i, ctx.createOscillator());
    o.type = i === 2 ? 'sine' : 'triangle';
    o.detune.value = (i - 1) * 5;
    const vca = pnode('pad' + i + 'G', gain(0.0));
    o.connect(vca);
    vca.connect(lp);
    // Very slow amplitude LFO, phase-offset by using different rates.
    const lfo = pnode('pad' + i + 'LFO', ctx.createOscillator());
    lfo.type = 'sine';
    lfo.frequency.value = 0.021 + i * 0.0132;
    const amt = pnode('pad' + i + 'LFOAmt', gain(0.05));
    lfo.connect(amt);
    amt.connect(vca.gain);
    lfo.start(ctx.currentTime + i * 0.7);
    o.start();
  }
  tunePad(0);
}

/** Chord tones follow mode + unrest. Unrest bends voice 2 to a 2nd or tritone. */
function tunePad(glide) {
  const t = ctx.currentTime;
  const m = music.mode;
  const u = scene.unrest;
  const third = m[2];        // minor third in all three modes
  const fifth = m[4];
  const seventh = m[6];
  // Voice 2 is the troublemaker: sweet 5th -> minor 2nd -> tritone.
  let tense;
  if (u < 0.22) tense = fifth;
  else if (u < 0.6) tense = 1;
  else tense = 6;
  const degrees = [
    music.rootMidi + 12 + third,
    music.rootMidi + 12 + seventh,
    music.rootMidi + 24 + tense,
  ];
  for (let i = 0; i < 3; i++) {
    const o = nodes['pad' + i];
    const f = hz(degrees[i]);
    o.frequency.cancelScheduledValues(t);
    if (glide > 0) {
      o.frequency.setValueAtTime(o.frequency.value, t);
      o.frequency.exponentialRampToValueAtTime(f, t + glide);
    } else {
      o.frequency.setValueAtTime(f, t);
    }
    // Base level per voice: the dissonant one only leans in with unrest.
    const base = i === 2 ? 0.012 + 0.05 * u : 0.05 - i * 0.008;
    const g = nodes['pad' + i + 'G'];
    g.gain.cancelScheduledValues(t);
    g.gain.setTargetAtTime(base, t, 2.2);
  }
}

// ---------------------------------------------------------------------------
// Pluck — the wandering melody. Transient voices, seeded random walk.
// ---------------------------------------------------------------------------

function pluck(when, midi, level, dur, bright) {
  const v = beginVoice(null, when + dur + 0.2);
  const o = own(v, ctx.createOscillator());
  o.type = music.rng() < 0.35 ? 'sine' : 'triangle';
  const f = hz(midi);
  o.frequency.setValueAtTime(f, when);
  // A whisper of pitch droop, like a real plucked string settling.
  o.frequency.setTargetAtTime(f * 0.998, when, dur * 0.6);

  const bp = own(v, ctx.createBiquadFilter());
  bp.type = 'lowpass';
  bp.Q.value = 5.5;
  const top = clamp(f * (5 + 9 * bright), 400, 7000);
  bp.frequency.setValueAtTime(top, when);
  bp.frequency.exponentialRampToValueAtTime(Math.max(180, f * 1.6), when + Math.min(0.5, dur * 0.7));

  const g = own(v, ctx.createGain());
  v.gain = g;
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(level, when + 0.006);
  g.gain.exponentialRampToValueAtTime(level * 0.28, when + dur * 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);

  const pan = own(v, ctx.createStereoPanner());
  pan.pan.value = (music.rng() * 2 - 1) * 0.35;

  o.connect(bp); bp.connect(g); g.connect(pan); pan.connect(nodes.pluckBus);
  o.start(when);
  finish(v, o, when + dur + 0.05);
  stats.notes++;
}

/** One grid step of melody: pick a note, a rest, or a doubling. */
function scheduleMelody(when) {
  const rng = music.rng;
  const age = scene.age;
  const night = scene.night;

  // Rest probability: Age I breathes, Age II is busier, Age III is thinned out.
  let pRest = age === 1 ? 0.52 : age === 2 ? 0.34 : 0.58;
  pRest += night * 0.14;
  if (music.restRun > 5) pRest -= 0.35;   // never silent forever
  if (scene.speed === 0) pRest = 1;

  if (rng() < pRest) { music.restRun++; return; }
  music.restRun = 0;

  // Seeded random walk over the mode, with a gentle pull back to the centre.
  let stepSize = rng() < 0.72 ? (rng() < 0.5 ? 1 : -1) : (rng() < 0.5 ? 2 : -3);
  if (rng() < 0.1) stepSize = rng() < 0.5 ? 4 : -4;    // occasional leap
  music.walk += stepSize;
  if (music.walk > 13) music.walk -= 7;
  if (music.walk < 0) music.walk += 7;
  if (rng() < 0.14) music.walk = 0;                    // touch the tonic

  const mode = music.mode;
  const deg = music.walk;
  const oct = Math.floor(deg / 7);
  const midi = music.rootMidi + 24 + oct * 12 + mode[((deg % 7) + 7) % 7];

  const beats = rng() < 0.3 ? 3 : rng() < 0.6 ? 2 : 1;
  const dur = clamp(music.step * beats * (1.4 + rng() * 1.2), 0.35, 3.2);
  // Notes can last up to 3.2 s over a 0.54 s grid, so half a dozen may overlap;
  // keep each one low enough that the limiter never has to work hard.
  const level = (0.095 + rng() * 0.055) * (age === 3 ? 0.85 : 1) * (1 - 0.25 * night);
  const bright = clamp(0.55 - 0.35 * night + (age === 2 ? 0.2 : 0) - (age === 3 ? 0.15 : 0), 0.08, 1);

  pluck(when, midi, level, dur, bright);

  // Occasional doubling at the fifth or the octave, slightly late and quieter.
  if (rng() < (age === 2 ? 0.2 : 0.13)) {
    const up = rng() < 0.5 ? 7 : 12;
    pluck(when + 0.02 + rng() * 0.05, midi + up, level * 0.5, dur * 0.8, bright * 0.9);
  }
  music.lastNoteMidi = midi;
}

// ---------------------------------------------------------------------------
// Age II machinery chuff and Age III unease
// ---------------------------------------------------------------------------

/** Soft filtered-noise chuff at tempo: machinery implied, never literal. */
function machineChuff(when, level) {
  const v = beginVoice(null, when + 0.4);
  const src = own(v, ctx.createBufferSource());
  src.buffer = bufs.pink;
  src.playbackRate.value = 0.8 + music.rng() * 0.4;
  const off = music.rng() * (bufs.pink.duration - 0.5);

  const bp = own(v, ctx.createBiquadFilter());
  bp.type = 'bandpass';
  bp.frequency.value = 420 + music.rng() * 260;
  bp.Q.value = 1.1;

  const g = own(v, ctx.createGain());
  v.gain = g;
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(level, when + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.26);

  const pan = own(v, ctx.createStereoPanner());
  pan.pan.value = (music.rng() * 2 - 1) * 0.2;

  src.connect(bp); bp.connect(g); g.connect(pan); pan.connect(nodes.machBus);
  src.start(when, off, 0.4);
  finish(v, src, when + 0.32);
}

/** Age III: a low irregular pulse. Wrong-footed on purpose. */
function lowThump(when, level) {
  const v = beginVoice(null, when + 1.3);
  const o = own(v, ctx.createOscillator());
  o.type = 'sine';
  o.frequency.setValueAtTime(58, when);
  o.frequency.exponentialRampToValueAtTime(31, when + 0.5);
  const g = own(v, ctx.createGain());
  v.gain = g;
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(level, when + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 1.1);
  o.connect(g); g.connect(nodes.machBus);
  o.start(when);
  finish(v, o, when + 1.15);
}

/** Age III: a distant metallic ring — inharmonic partials, long, quiet. */
function metallicRing(when, level) {
  const v = beginVoice(null, when + 4.6);
  const out = own(v, ctx.createGain());
  v.gain = out;
  out.gain.value = level;
  const pan = own(v, ctx.createStereoPanner());
  pan.pan.value = music.rng() < 0.5 ? -0.6 : 0.6;
  const hp = own(v, ctx.createBiquadFilter());
  hp.type = 'highpass';
  hp.frequency.value = 700;
  out.connect(hp); hp.connect(pan); pan.connect(nodes.machBus);

  const base = 1180 + music.rng() * 340;
  const ratios = [1, 1.732, 2.41, 3.19, 4.77];
  let primary = null;
  for (let i = 0; i < ratios.length; i++) {
    const o = own(v, ctx.createOscillator());
    o.type = 'sine';
    o.frequency.value = base * ratios[i] * (1 + (music.rng() - 0.5) * 0.01);
    const g = own(v, ctx.createGain());
    const amp = 0.5 / (1 + i * 1.4);
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(amp, when + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 1.2 + (4 - i) * 0.7);
    o.connect(g); g.connect(out);
    o.start(when);
    if (i === 0) primary = o;
    else { try { o.stop(when + 4.4); } catch (e) { /* ignore */ } }
  }
  finish(v, primary, when + 4.5);
}

// ---------------------------------------------------------------------------
// The scheduler — one look-ahead loop drives music and ambient events.
// ---------------------------------------------------------------------------

function tempo() {
  const sp = scene.speed;
  // 56bpm at normal; higher speeds nudge, they do not race.
  const mult = sp === 0 ? 1 : sp === 1 ? 1 : sp === 2 ? 1.06 : 1.12;
  return 56 * mult;
}

function tick() {
  if (!ready) return;
  const now = ctx.currentTime;
  sweepVoices();
  if (isMuted) {                     // stay silent and cheap, but keep the clock sane
    music.nextStep = Math.max(music.nextStep, now);
    music.nextRing = Math.max(music.nextRing, now);
    music.nextThump = Math.max(music.nextThump, now);
    return;
  }

  music.bpm = tempo();
  music.step = (60 / music.bpm) / 2;         // grid: quavers at 56bpm ≈ 0.54 s
  if (music.nextStep < now) music.nextStep = now + 0.05;

  const horizon = now + LOOK_AHEAD;
  let guard = 0;
  while (music.nextStep < horizon && guard++ < 64) {
    const when = music.nextStep;
    scheduleMelody(when);
    // Age II machinery: a soft chuff on the beat (every other grid step).
    if (scene.age === 2 && scene.speed !== 0 && (music.stepIndex & 1) === 0) {
      machineChuff(when, 0.05 * (1 - 0.3 * scene.night));
    }
    music.stepIndex++;
    music.nextStep += music.step;
  }

  if (scene.speed !== 0) {
    if (scene.age === 3) {
      if (music.nextThump < now) music.nextThump = now + 1 + music.rng() * 2;
      while (music.nextThump < horizon) {
        lowThump(music.nextThump, 0.16);
        music.nextThump += 2.2 + music.rng() * 4.5;   // irregular on purpose
      }
      if (music.nextRing < now) music.nextRing = now + 4 + music.rng() * 10;
      while (music.nextRing < horizon) {
        metallicRing(music.nextRing, 0.05 + music.rng() * 0.03);
        music.nextRing += 14 + music.rng() * 26;
      }
    } else {
      music.nextThump = now;
      music.nextRing = now;
    }
  }

  ambientTick(now, horizon);
}

// ---------------------------------------------------------------------------
// Ambience: one bed per region, crossfaded. Beds are noise/filter chains that
// tap the shared loops, plus a sparse event list synthesised as one-shots.
// rate is expected events per second.
// ---------------------------------------------------------------------------

const BEDS = {
  GREENHOLLOW: {
    wet: 0.10,
    layers: [
      { tap: 'pink', type: 'lowpass', freq: 620, q: 0.6, g: 0.20, lfo: { rate: 0.06, depth: 0.11, target: 'gain' } },
      { tap: 'white', type: 'bandpass', freq: 2600, q: 0.9, g: 0.035, lfo: { rate: 0.09, depth: 0.022, target: 'gain' } },
    ],
    events: [
      { kind: 'bird', rate: 0.42, night: 0.05 },
      { kind: 'insect', rate: 0.10, night: 1.3 },
    ],
  },
  ELDERWOOD: {
    wet: 0.34,
    layers: [
      { tap: 'pink', type: 'lowpass', freq: 300, q: 0.5, g: 0.10, lfo: { rate: 0.024, depth: 0.05, target: 'gain' } },
      { tap: 'white', type: 'bandpass', freq: 5200, q: 0.7, g: 0.020, lfo: { rate: 0.031, depth: 0.012, target: 'gain' } },
    ],
    events: [
      { kind: 'voice', rate: 0.035, night: 1.2 },
      { kind: 'bird', rate: 0.07, night: 0.2 },
      { kind: 'creak', rate: 0.05, night: 1.0 },
    ],
  },
  MIRKHOLT: {
    wet: 0.30,
    layers: [
      { tap: 'brown', type: 'lowpass', freq: 240, q: 0.8, g: 0.30, lfo: { rate: 0.037, depth: 0.10, target: 'gain' } },
      { tap: 'pink', type: 'bandpass', freq: 900, q: 1.6, g: 0.045, lfo: { rate: 0.052, depth: 320, target: 'freq' } },
    ],
    events: [
      { kind: 'creak', rate: 0.34, night: 1.15 },
      { kind: 'wrongcall', rate: 0.055, night: 1.6 },
      { kind: 'tick', rate: 0.10, night: 1.0 },
    ],
  },
  PEAKS: {
    wet: 0.42,
    layers: [
      { tap: 'white', type: 'bandpass', freq: 1500, q: 0.55, g: 0.085, lfo: { rate: 0.045, depth: 700, target: 'freq' } },
      { tap: 'pink', type: 'highpass', freq: 900, q: 0.5, g: 0.075, lfo: { rate: 0.028, depth: 0.05, target: 'gain' } },
    ],
    events: [
      { kind: 'tick', rate: 0.55, night: 1.0 },
      { kind: 'rockfall', rate: 0.035, night: 1.0 },
    ],
  },
  WEEPING: {
    wet: 0.22,
    layers: [
      { tap: 'brown', type: 'lowpass', freq: 420, q: 0.7, g: 0.22, lfo: { rate: 0.05, depth: 0.08, target: 'gain' } },
      { tap: 'white', type: 'bandpass', freq: 3400, q: 1.1, g: 0.04, lfo: { rate: 0.14, depth: 0.03, target: 'gain' } },
      { tap: 'pink', type: 'bandpass', freq: 700, q: 2.4, g: 0.05, lfo: { rate: 0.19, depth: 260, target: 'freq' } },
    ],
    events: [
      { kind: 'frog', rate: 0.55, night: 1.5 },
      { kind: 'insect', rate: 0.7, night: 1.25 },
      { kind: 'drip', rate: 0.28, night: 1.0 },
    ],
  },
  ASHENREACH: {
    wet: 0.26,
    layers: [
      { tap: 'brown', type: 'lowpass', freq: 180, q: 1.1, g: 0.44, lfo: { rate: 0.033, depth: 0.14, target: 'gain' } },
      { tap: 'pink', type: 'bandpass', freq: 340, q: 0.8, g: 0.10, lfo: { rate: 0.021, depth: 120, target: 'freq' } },
    ],
    events: [
      { kind: 'deepthud', rate: 0.10, night: 1.1 },
      { kind: 'ember', rate: 1.5, night: 1.2 },
    ],
  },
  QUAYS: {
    wet: 0.20,
    layers: [
      { tap: 'brown', type: 'lowpass', freq: 700, q: 0.6, g: 0.22, lfo: { rate: 0.085, depth: 0.20, target: 'gain' } },
      { tap: 'white', type: 'bandpass', freq: 2200, q: 0.5, g: 0.05, lfo: { rate: 0.11, depth: 0.045, target: 'gain' } },
    ],
    events: [
      { kind: 'gull', rate: 0.30, night: 0.15 },
      { kind: 'creak', rate: 0.06, night: 1.0 },
    ],
  },
  FROSTMARCH: {
    wet: 0.30,
    layers: [
      { tap: 'pink', type: 'bandpass', freq: 780, q: 0.45, g: 0.20, lfo: { rate: 0.039, depth: 380, target: 'freq' } },
      { tap: 'white', type: 'highpass', freq: 2600, q: 0.5, g: 0.035, lfo: { rate: 0.062, depth: 0.025, target: 'gain' } },
    ],
    events: [
      { kind: 'tick', rate: 0.05, night: 1.0 },
    ],
  },
  BARROWDOWNS: {
    wet: 0.46,
    layers: [
      { tap: 'pink', type: 'lowpass', freq: 260, q: 0.6, g: 0.075, lfo: { rate: 0.019, depth: 0.04, target: 'gain' } },
    ],
    events: [
      { kind: 'lowtone', rate: 0.028, night: 2.2 },
      { kind: 'bird', rate: 0.02, night: 0.0 },
    ],
  },
  MARCHLANDS: {
    wet: 0.24,
    layers: [
      { tap: 'pink', type: 'lowpass', freq: 540, q: 0.55, g: 0.22, lfo: { rate: 0.055, depth: 0.13, target: 'gain' } },
      { tap: 'white', type: 'bandpass', freq: 1800, q: 0.7, g: 0.03, lfo: { rate: 0.08, depth: 0.02, target: 'gain' } },
    ],
    events: [
      { kind: 'distantbell', rate: 0.022, night: 0.7 },
      { kind: 'bird', rate: 0.12, night: 0.1 },
    ],
  },
  WODENHOLT: {
    wet: 0.38,
    layers: [
      { tap: 'brown', type: 'lowpass', freq: 150, q: 1.0, g: 0.34, lfo: { rate: 0.017, depth: 0.12, target: 'gain' } },
      { tap: 'pink', type: 'bandpass', freq: 420, q: 2.0, g: 0.05, lfo: { rate: 0.026, depth: 160, target: 'freq' } },
    ],
    events: [
      { kind: 'groan', rate: 0.05, night: 1.0 },
      { kind: 'creak', rate: 0.22, night: 1.0 },
    ],
  },
};

const beds = new Map();     // region -> bed

function bedNode(bed, node) {
  bed.list.push(node);
  stats.persistent++;
  stats.created++;
  return node;
}

function buildBed(region) {
  const spec = BEDS[region] || BEDS.GREENHOLLOW;
  const bed = { region, spec, list: [], taps: [], out: null, next: {}, dying: false, killAt: 0, destroyed: false };
  const out = bedNode(bed, gain(0));
  bed.out = out;
  out.connect(nodes.bedBus);

  for (let i = 0; i < spec.layers.length; i++) {
    const L = spec.layers[i];
    const f = bedNode(bed, ctx.createBiquadFilter());
    f.type = L.type;
    f.frequency.value = L.freq;
    f.Q.value = L.q;
    const g = bedNode(bed, gain(L.g));
    const tap = nodes['tap' + L.tap.charAt(0).toUpperCase() + L.tap.slice(1)];
    tap.connect(f);
    f.connect(g);
    g.connect(out);
    if (L.lfo) {
      const lfo = bedNode(bed, ctx.createOscillator());
      lfo.type = 'sine';
      lfo.frequency.value = L.lfo.rate;
      const amt = bedNode(bed, gain(L.lfo.depth));
      lfo.connect(amt);
      amt.connect(L.lfo.target === 'freq' ? f.frequency : g.gain);
      lfo.start(ctx.currentTime + i * 0.31);
    }
    // Remember the tap so teardown can detach this one edge, and only this one.
    bed.taps.push([tap, f]);
  }
  // Event clocks start staggered so a region change is not a volley.
  for (let i = 0; i < spec.events.length; i++) {
    bed.next[spec.events[i].kind] = ctx.currentTime + 0.5 + music.rng() * 6;
  }
  beds.set(region, bed);
  return bed;
}

function destroyBed(bed) {
  if (bed.destroyed) return;
  bed.destroyed = true;
  if (bed.taps) {
    for (let i = 0; i < bed.taps.length; i++) {
      try { bed.taps[i][0].disconnect(bed.taps[i][1]); } catch (e) { /* ignore */ }
    }
    bed.taps.length = 0;
  }
  for (let i = 0; i < bed.list.length; i++) {
    const n = bed.list[i];
    if (!n) continue;
    try { if (n.stop) n.stop(); } catch (e) { /* ignore */ }
    try { n.disconnect(); } catch (e) { /* ignore */ }
    stats.persistent--;
    stats.disposed++;
  }
  bed.list.length = 0;
  if (beds.get(bed.region) === bed) beds.delete(bed.region);
}

/** Crossfade to `region`; beds that reach silence are torn down. */
function setBed(region, fade) {
  const t = ctx.currentTime;
  if (!BEDS[region]) region = 'GREENHOLLOW';
  let bed = beds.get(region);
  if (!bed) bed = buildBed(region);
  bed.dying = false;
  bed.killAt = 0;

  const dayLevel = bedLevel();
  bed.out.gain.cancelScheduledValues(t);
  bed.out.gain.setTargetAtTime(dayLevel, t, Math.max(0.2, fade * 0.4));

  beds.forEach((other) => {
    if (other === bed) return;
    other.dying = true;
    other.killAt = t + fade + 1.2;
    other.out.gain.cancelScheduledValues(t);
    other.out.gain.setTargetAtTime(0, t, Math.max(0.2, fade * 0.35));
  });
  // Reverb amount follows the space we are in.
  const wet = BEDS[region].wet;
  nodes.ambSend.gain.cancelScheduledValues(t);
  nodes.ambSend.gain.setTargetAtTime(wet, t, 1.5);
}

/** Bed loudness: night thins ambience slightly, pause ducks it hard. */
function bedLevel() {
  if (scene.speed === 0) return 0.28;
  return 1 - 0.15 * scene.night;
}

function reapBeds(now) {
  beds.forEach((bed) => {
    if (bed.dying && bed.killAt && now > bed.killAt) destroyBed(bed);
  });
}

// ---------------------------------------------------------------------------
// Ambient event scheduling
// ---------------------------------------------------------------------------

function ambientTick(now, horizon) {
  reapBeds(now);
  const bed = beds.get(scene.region);
  if (!bed || bed.dying) return;
  const evs = bed.spec.events;
  const speedMul = scene.speed === 0 ? 0 : 1;
  for (let i = 0; i < evs.length; i++) {
    const e = evs[i];
    const nightMul = lerp(1, e.night, scene.night);
    const rate = e.rate * nightMul * speedMul;
    let t = bed.next[e.kind] || now;
    if (t < now) t = now + music.rng() * 0.5;
    if (rate <= 0.0001) { bed.next[e.kind] = horizon + 3; continue; }
    let guard = 0;
    while (t < horizon && guard++ < 12) {
      fireAmbient(e.kind, t);
      t += -Math.log(Math.max(1e-6, music.rng())) / rate;
    }
    bed.next[e.kind] = t;
  }
}

/** Event voices land on evtBus; a few also get an extra shove of reverb. */
function evtOut(v, level, pan, extraWet) {
  const g = own(v, ctx.createGain());
  v.gain = g;
  g.gain.value = level;
  const p = own(v, ctx.createStereoPanner());
  p.pan.value = pan;
  g.connect(p);
  p.connect(nodes.evtBus);
  if (extraWet > 0) {
    const w = own(v, ctx.createGain());
    w.gain.value = extraWet;
    p.connect(w);
    w.connect(nodes.revIn);
  }
  return g;
}

function fireAmbient(kind, when) {
  const rng = music.rng;
  const pan = (rng() * 2 - 1) * 0.7;
  const dark = 1 - 0.4 * scene.night;
  switch (kind) {
    case 'bird': return evtBird(when, pan, 0.055 * dark);
    case 'gull': return evtGull(when, pan, 0.07 * dark);
    case 'frog': return evtFrog(when, pan, 0.075);
    case 'insect': return evtInsect(when, pan, 0.03);
    case 'creak': return evtCreak(when, pan, 0.075);
    case 'wrongcall': return evtWrongCall(when, pan, 0.06);
    case 'tick': return evtTick(when, pan, 0.05);
    case 'rockfall': return oneShot('collapse', { gain: 0.18, pan: pan, when: when, bus: nodes.evtBus });
    case 'deepthud': return evtDeepThud(when, pan, 0.30);
    case 'ember': return evtEmber(when, pan, 0.05);
    case 'drip': return evtDrip(when, pan, 0.05);
    case 'lowtone': return evtLowTone(when, pan, 0.11);
    case 'distantbell': return evtDistantBell(when, pan, 0.055);
    case 'voice': return evtVoice(when, pan, 0.055);
    case 'groan': return evtGroan(when, pan, 0.16);
    default: return null;
  }
}

/** A few quick rising chirps. Evocative, not ornithological. */
function evtBird(when, pan, level) {
  const rng = music.rng;
  const n = 2 + Math.floor(rng() * 4);
  const v = beginVoice(null, when + n * 0.1 + 0.6);
  const out = evtOut(v, level, pan, 0.22);
  const base = 2100 + rng() * 1500;
  let primary = null;
  for (let i = 0; i < n; i++) {
    const t0 = when + i * (0.055 + rng() * 0.07);
    const o = own(v, ctx.createOscillator());
    o.type = 'sine';
    const f0 = base * (0.9 + rng() * 0.3);
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(f0 * (1.25 + rng() * 0.5), t0 + 0.035);
    o.frequency.exponentialRampToValueAtTime(f0 * 1.05, t0 + 0.07);
    const g = own(v, ctx.createGain());
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.9, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.075);
    o.connect(g); g.connect(out);
    o.start(t0);
    if (i === n - 1) primary = o;
    else { try { o.stop(t0 + 0.1); } catch (e) { /* ignore */ } }
  }
  finish(v, primary, when + n * 0.13 + 0.15);
}

/** Gull: a descending cry with a rasp of noise. */
function evtGull(when, pan, level) {
  const rng = music.rng;
  const dur = 0.34 + rng() * 0.2;
  const v = beginVoice(null, when + dur + 0.6);
  const out = evtOut(v, level, pan, 0.3);
  const o = own(v, ctx.createOscillator());
  o.type = 'sawtooth';
  const f0 = 1250 + rng() * 400;
  o.frequency.setValueAtTime(f0 * 0.8, when);
  o.frequency.exponentialRampToValueAtTime(f0, when + 0.06);
  o.frequency.exponentialRampToValueAtTime(f0 * 0.55, when + dur);
  const bp = own(v, ctx.createBiquadFilter());
  bp.type = 'bandpass';
  bp.frequency.value = 1800;
  bp.Q.value = 1.4;
  const g = own(v, ctx.createGain());
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(0.5, when + 0.03);
  g.gain.setValueAtTime(0.5, when + dur * 0.5);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  // Vibrato gives it the gull wobble.
  const vib = own(v, ctx.createOscillator());
  vib.frequency.value = 13 + rng() * 6;
  const vibAmt = own(v, ctx.createGain());
  vibAmt.gain.value = 55;
  vib.connect(vibAmt); vibAmt.connect(o.frequency);
  vib.start(when);
  try { vib.stop(when + dur + 0.05); } catch (e) { /* ignore */ }
  o.connect(bp); bp.connect(g); g.connect(out);
  o.start(when);
  finish(v, o, when + dur + 0.05);
}

/** Frog: low buzzy croak, amplitude-modulated. */
function evtFrog(when, pan, level) {
  const rng = music.rng;
  const dur = 0.13 + rng() * 0.12;
  const v = beginVoice(null, when + dur + 0.5);
  const out = evtOut(v, level, pan, 0.12);
  const o = own(v, ctx.createOscillator());
  o.type = 'sawtooth';
  const f = 150 + rng() * 130;
  o.frequency.setValueAtTime(f, when);
  o.frequency.linearRampToValueAtTime(f * 0.92, when + dur);
  const bp = own(v, ctx.createBiquadFilter());
  bp.type = 'bandpass';
  bp.frequency.value = f * 3.2;
  bp.Q.value = 2.6;
  const g = own(v, ctx.createGain());
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(0.8, when + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  // Rattle: fast AM.
  const am = own(v, ctx.createOscillator());
  am.frequency.value = 26 + rng() * 18;
  const amAmt = own(v, ctx.createGain());
  amAmt.gain.value = 0.45;
  am.connect(amAmt); amAmt.connect(g.gain);
  am.start(when);
  try { am.stop(when + dur + 0.05); } catch (e) { /* ignore */ }
  o.connect(bp); bp.connect(g); g.connect(out);
  o.start(when);
  finish(v, o, when + dur + 0.05);
}

/** Insect: a thin high stridulation. */
function evtInsect(when, pan, level) {
  const rng = music.rng;
  const dur = 0.3 + rng() * 0.7;
  const v = beginVoice(null, when + dur + 0.4);
  const out = evtOut(v, level, pan, 0.05);
  const src = own(v, ctx.createBufferSource());
  src.buffer = bufs.white;
  src.playbackRate.value = 0.9 + rng() * 0.3;
  const bp = own(v, ctx.createBiquadFilter());
  bp.type = 'bandpass';
  bp.frequency.value = 5200 + rng() * 2600;
  bp.Q.value = 12;
  const g = own(v, ctx.createGain());
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(0.6, when + 0.06);
  g.gain.setValueAtTime(0.6, when + dur * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  const am = own(v, ctx.createOscillator());
  am.frequency.value = 38 + rng() * 30;
  const amAmt = own(v, ctx.createGain());
  amAmt.gain.value = 0.4;
  am.connect(amAmt); amAmt.connect(g.gain);
  am.start(when);
  try { am.stop(when + dur + 0.05); } catch (e) { /* ignore */ }
  src.connect(bp); bp.connect(g); g.connect(out);
  src.start(when, rng() * 2, dur + 0.05);
  finish(v, src, when + dur + 0.05);
}

/** Wood creak: resonant filtered noise with a sliding peak. */
function evtCreak(when, pan, level) {
  const rng = music.rng;
  const dur = 0.5 + rng() * 1.5;
  const v = beginVoice(null, when + dur + 0.8);
  const out = evtOut(v, level, pan, 0.35);
  const src = own(v, ctx.createBufferSource());
  src.buffer = bufs.brown;
  src.playbackRate.value = 0.5 + rng() * 0.5;
  const bp = own(v, ctx.createBiquadFilter());
  bp.type = 'bandpass';
  const f0 = 180 + rng() * 320;
  bp.frequency.setValueAtTime(f0, when);
  bp.frequency.linearRampToValueAtTime(f0 * (0.6 + rng() * 0.9), when + dur);
  bp.Q.value = 9 + rng() * 10;
  const g = own(v, ctx.createGain());
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(0.9, when + 0.08 + rng() * 0.2);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  src.connect(bp); bp.connect(g); g.connect(out);
  src.start(when, rng() * 4, dur + 0.1);
  finish(v, src, when + dur + 0.1);
}

/** Mirkholt's wrong-sounding call: a bird that is not a bird. */
function evtWrongCall(when, pan, level) {
  const rng = music.rng;
  const dur = 0.5 + rng() * 0.5;
  const v = beginVoice(null, when + dur + 1.4);
  const out = evtOut(v, level, pan, 0.6);
  const f0 = 380 + rng() * 260;
  let primary = null;
  for (let i = 0; i < 2; i++) {
    const o = own(v, ctx.createOscillator());
    o.type = i ? 'triangle' : 'sine';
    // Two voices a semitone-ish apart, sliding the wrong way.
    const det = i ? 1.06 : 1.0;
    o.frequency.setValueAtTime(f0 * det, when);
    o.frequency.exponentialRampToValueAtTime(f0 * det * (i ? 0.62 : 1.34), when + dur);
    const g = own(v, ctx.createGain());
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(i ? 0.35 : 0.5, when + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g); g.connect(out);
    o.start(when);
    if (i === 1) primary = o;
    else { try { o.stop(when + dur + 0.05); } catch (e) { /* ignore */ } }
  }
  finish(v, primary, when + dur + 0.05);
}

/** Rockfall tick: a single small stone. */
function evtTick(when, pan, level) {
  const rng = music.rng;
  const v = beginVoice(null, when + 0.3);
  const out = evtOut(v, level, pan, 0.4);
  const src = own(v, ctx.createBufferSource());
  src.buffer = bufs.white;
  const bp = own(v, ctx.createBiquadFilter());
  bp.type = 'bandpass';
  bp.frequency.value = 1400 + rng() * 2400;
  bp.Q.value = 6;
  const g = own(v, ctx.createGain());
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(0.9, when + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05 + rng() * 0.05);
  src.connect(bp); bp.connect(g); g.connect(out);
  src.start(when, rng() * 2, 0.14);
  finish(v, src, when + 0.14);
}

/** Ashenreach: an irregular deep thud, felt more than heard. */
function evtDeepThud(when, pan, level) {
  const rng = music.rng;
  const v = beginVoice(null, when + 1.6);
  const out = evtOut(v, level, pan * 0.3, 0.25);
  const o = own(v, ctx.createOscillator());
  o.type = 'sine';
  const f = 44 + rng() * 22;
  o.frequency.setValueAtTime(f, when);
  o.frequency.exponentialRampToValueAtTime(f * 0.6, when + 0.7);
  const g = own(v, ctx.createGain());
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(0.9, when + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 1.2);
  const src = own(v, ctx.createBufferSource());
  src.buffer = bufs.brown;
  const lp = own(v, ctx.createBiquadFilter());
  lp.type = 'lowpass';
  lp.frequency.value = 240;
  const ng = own(v, ctx.createGain());
  ng.gain.setValueAtTime(0.5, when);
  ng.gain.exponentialRampToValueAtTime(0.0001, when + 0.5);
  src.connect(lp); lp.connect(ng); ng.connect(out);
  src.start(when, rng() * 4, 0.6);
  o.connect(g); g.connect(out);
  o.start(when);
  finish(v, o, when + 1.25);
}

/** Ember crackle: a tiny bright click. */
function evtEmber(when, pan, level) {
  const rng = music.rng;
  const v = beginVoice(null, when + 0.2);
  const out = evtOut(v, level * (0.4 + rng() * 0.6), pan, 0.1);
  const src = own(v, ctx.createBufferSource());
  src.buffer = bufs.white;
  const hp = own(v, ctx.createBiquadFilter());
  hp.type = 'highpass';
  hp.frequency.value = 2600 + rng() * 3000;
  const g = own(v, ctx.createGain());
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(0.8, when + 0.001);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.02 + rng() * 0.03);
  src.connect(hp); hp.connect(g); g.connect(out);
  src.start(when, rng() * 2, 0.09);
  finish(v, src, when + 0.09);
}

/** Marsh drip. */
function evtDrip(when, pan, level) {
  const rng = music.rng;
  const v = beginVoice(null, when + 0.4);
  const out = evtOut(v, level, pan, 0.45);
  const o = own(v, ctx.createOscillator());
  o.type = 'sine';
  const f = 700 + rng() * 900;
  o.frequency.setValueAtTime(f * 0.55, when);
  o.frequency.exponentialRampToValueAtTime(f, when + 0.045);
  const g = own(v, ctx.createGain());
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(0.7, when + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.1);
  o.connect(g); g.connect(out);
  o.start(when);
  finish(v, o, when + 0.12);
}

/** Barrowdowns: one very low tone, a long way off, in no hurry. */
function evtLowTone(when, pan, level) {
  const rng = music.rng;
  const dur = 3.5 + rng() * 3;
  const v = beginVoice(null, when + dur + 1.5);
  const out = evtOut(v, level, pan * 0.5, 0.8);
  const o = own(v, ctx.createOscillator());
  o.type = 'triangle';
  const f = hz(music.rootMidi - 12 + (rng() < 0.5 ? 0 : 1));
  o.frequency.setValueAtTime(f, when);
  o.frequency.linearRampToValueAtTime(f * 0.985, when + dur);
  const lp = own(v, ctx.createBiquadFilter());
  lp.type = 'lowpass';
  lp.frequency.value = 220;
  const g = own(v, ctx.createGain());
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(0.9, when + dur * 0.4);
  g.gain.linearRampToValueAtTime(0.0001, when + dur);
  o.connect(lp); lp.connect(g); g.connect(out);
  o.start(when);
  finish(v, o, when + dur + 0.1);
}

/** A bell heard across the Marchlands. */
function evtDistantBell(when, pan, level) {
  oneShot('bell', { gain: level * 3.2, pan: pan, when: when, bus: nodes.evtBus, wet: 1.1, tone: 0.45 });
}

/** Elderwood: a single clear voice, far off, singing one held note. */
function evtVoice(when, pan, level) {
  const rng = music.rng;
  const dur = 2.2 + rng() * 2.5;
  const v = beginVoice(null, when + dur + 2);
  const out = evtOut(v, level, pan * 0.6, 1.1);
  const mode = music.mode;
  const deg = [0, 4, 6, 9][Math.floor(rng() * 4)];
  const f = hz(music.rootMidi + 24 + (mode[deg % 7] || 0));
  let primary = null;
  // Two formant-ish bands over a sine give a wordless human colour.
  for (let i = 0; i < 2; i++) {
    const o = own(v, ctx.createOscillator());
    o.type = i ? 'triangle' : 'sine';
    o.frequency.value = f * (i ? 2 : 1);
    const bp = own(v, ctx.createBiquadFilter());
    bp.type = 'bandpass';
    bp.frequency.value = i ? 2400 : 800;
    bp.Q.value = 3;
    const g = own(v, ctx.createGain());
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(i ? 0.22 : 0.7, when + dur * 0.35);
    g.gain.linearRampToValueAtTime(0.0001, when + dur);
    const vib = own(v, ctx.createOscillator());
    vib.frequency.value = 4.4 + rng() * 1.2;
    const vibAmt = own(v, ctx.createGain());
    vibAmt.gain.value = f * 0.008 * (i ? 2 : 1);
    vib.connect(vibAmt); vibAmt.connect(o.frequency);
    vib.start(when);
    try { vib.stop(when + dur + 0.1); } catch (e) { /* ignore */ }
    o.connect(bp); bp.connect(g); g.connect(out);
    o.start(when);
    if (i === 1) primary = o;
    else { try { o.stop(when + dur + 0.1); } catch (e) { /* ignore */ } }
  }
  finish(v, primary, when + dur + 0.15);
}

/** Wodenholt: a long slow groan. Shorter cousin of the `ent` one-shot. */
function evtGroan(when, pan, level) {
  oneShot('ent', { gain: level * 2.2, pan: pan, when: when, bus: nodes.evtBus, scale: 0.7 });
}

// ---------------------------------------------------------------------------
// One-shots
// ---------------------------------------------------------------------------

// Per-sound base levels, so callers can pass gain 1 and get a sane mix.
const SFX_LEVEL = {
  whistle: 0.30, bell: 0.30, build_track: 0.34, build_works: 0.38, chuff: 0.16,
  brake: 0.22, coin: 0.22, charter: 0.26, petition: 0.30, incident: 0.36,
  dragon: 0.42, collapse: 0.40, depart: 0.34, doom: 0.50, ent: 0.36,
  ui_click: 0.16, ui_hover: 0.07, error: 0.22,
};

// Extra reverb send per sound — distance and grandeur.
const SFX_WET = {
  whistle: 0.55, bell: 0.7, build_track: 0.2, build_works: 0.28, chuff: 0.1,
  brake: 0.3, coin: 0.25, charter: 0.35, petition: 0.2, incident: 0.5,
  dragon: 0.9, collapse: 0.6, depart: 1.2, doom: 0.8, ent: 0.8,
  ui_click: 0.05, ui_hover: 0.0, error: 0.1,
};

/** Short noise burst helper used by many one-shots. */
function noiseBurst(v, out, when, dur, filterType, freq, q, level, bufName, sweepTo) {
  const src = own(v, ctx.createBufferSource());
  src.buffer = bufs[bufName || 'white'];
  src.playbackRate.value = 0.9 + music.rng() * 0.2;
  const f = own(v, ctx.createBiquadFilter());
  f.type = filterType;
  f.frequency.setValueAtTime(freq, when);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(30, sweepTo), when + dur);
  f.Q.value = q;
  const g = own(v, ctx.createGain());
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(level, when + Math.min(0.01, dur * 0.2));
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  src.connect(f); f.connect(g); g.connect(out);
  src.start(when, music.rng() * Math.max(0.01, bufs[bufName || 'white'].duration - dur - 0.05), dur + 0.05);
  return src;
}

/** Simple decaying oscillator partial. */
function partial(v, out, when, type, f0, f1, level, attack, dur) {
  const o = own(v, ctx.createOscillator());
  o.type = type;
  o.frequency.setValueAtTime(f0, when);
  if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(8, f1), when + dur);
  const g = own(v, ctx.createGain());
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(level, when + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  o.connect(g); g.connect(out);
  o.start(when);
  return o;
}

/**
 * Fire a one-shot. Options:
 *   gain   0..~2 multiplier on the sound's base level
 *   pan   -1..1
 *   delay  seconds from now
 *   when   absolute ctx time (overrides delay)
 *   rate   pitch multiplier (chuff, build_track, coin, tick-ish sounds)
 *   long   truthy: sustained variant (whistle, doom, depart)
 *   scale  duration multiplier for the long sounds (ent, doom, depart)
 *   bus    internal: route to the ambience event bus instead of sfx
 *   wet    internal: override reverb send
 */
function oneShot(name, opts) {
  if (!ready) return;
  opts = opts || {};
  const base = SFX_LEVEL[name];
  if (base === undefined) return;               // unknown name: silently ignore
  const now = ctx.currentTime;
  let when = opts.when !== undefined ? opts.when : now + 0.012 + (opts.delay || 0);
  if (when < now + 0.005) when = now + 0.005;

  const pool = enforceCap(name);
  const v = beginVoice(name, when + 1);
  pool.push(v);

  const level = base * (opts.gain !== undefined ? opts.gain : 1);
  const out = own(v, ctx.createGain());
  v.gain = out;
  out.gain.value = clamp(level, 0, 4);
  const pan = own(v, ctx.createStereoPanner());
  pan.pan.value = clamp(opts.pan || 0, -1, 1);
  out.connect(pan);
  pan.connect(opts.bus || nodes.sfxBus);
  const wet = opts.wet !== undefined ? opts.wet : SFX_WET[name];
  if (wet > 0) {
    const w = own(v, ctx.createGain());
    w.gain.value = wet;
    pan.connect(w);
    w.connect(nodes.revIn);
  }
  buildSfx(name, v, out, when, opts);
  return v;
}

function buildSfx(name, v, out, when, opts) {
  const rng = music.rng;
  const rate = opts.rate || 1;
  const scale = opts.scale || 1;

  switch (name) {

    // -- the game's signature sound ---------------------------------------
    case 'whistle': {
      // A steam whistle is a chord, not a note: two mouths a fourth apart,
      // slightly out of tune with themselves, over a bed of escaping steam.
      const hold = (opts.long ? 1.5 : 0.65) * scale;
      const dur = 0.09 + hold + 0.42;
      const f0 = 596 * rate * (0.98 + rng() * 0.04);
      const chord = [1, 1.335, 2.004];          // root, fourth, octave
      let primary = null;
      const wob = own(v, ctx.createOscillator());
      wob.type = 'sine';
      wob.frequency.value = 5.6 + rng() * 1.4;   // the pressure warble
      const wobAmt = own(v, ctx.createGain());
      wobAmt.gain.value = 6.5;                   // cents
      wob.connect(wobAmt);
      wob.start(when);
      try { wob.stop(when + dur + 0.1); } catch (e) { /* ignore */ }

      for (let i = 0; i < chord.length; i++) {
        const o = own(v, ctx.createOscillator());
        o.type = i === 2 ? 'triangle' : 'sawtooth';
        const f = f0 * chord[i];
        // Pressure builds: the pitch rises into the note and falls off the end.
        o.frequency.setValueAtTime(f * 0.945, when);
        o.frequency.exponentialRampToValueAtTime(f, when + 0.085);
        o.frequency.setValueAtTime(f, when + 0.085 + hold);
        o.frequency.exponentialRampToValueAtTime(f * 0.9, when + dur);
        o.detune.value = (i - 1) * 9;
        wobAmt.connect(o.detune);

        const bp = own(v, ctx.createBiquadFilter());
        bp.type = 'bandpass';
        bp.frequency.value = f * 1.02;
        bp.Q.value = 4.5;
        const g = own(v, ctx.createGain());
        const amp = [0.30, 0.22, 0.10][i];
        g.gain.setValueAtTime(0, when);
        g.gain.linearRampToValueAtTime(amp * 1.25, when + 0.05);
        g.gain.linearRampToValueAtTime(amp, when + 0.16);
        g.gain.setValueAtTime(amp, when + 0.09 + hold);
        g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
        o.connect(bp); bp.connect(g); g.connect(out);
        o.start(when);
        if (i === 0) primary = o;
        else { try { o.stop(when + dur + 0.05); } catch (e) { /* ignore */ } }
      }
      // The chiff: a hard shove of steam on the attack...
      noiseBurst(v, out, when, 0.16, 'bandpass', 2200, 0.9, 0.30, 'white', 900);
      // ...and breath under the whole note.
      const air = own(v, ctx.createBufferSource());
      air.buffer = bufs.pink;
      air.loop = true;
      const ahp = own(v, ctx.createBiquadFilter());
      ahp.type = 'highpass';
      ahp.frequency.value = 1300;
      const ag = own(v, ctx.createGain());
      ag.gain.setValueAtTime(0, when);
      ag.gain.linearRampToValueAtTime(0.075, when + 0.06);
      ag.gain.setValueAtTime(0.06, when + 0.09 + hold);
      ag.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      air.connect(ahp); ahp.connect(ag); ag.connect(out);
      air.start(when, rng() * 3);
      try { air.stop(when + dur + 0.05); } catch (e) { /* ignore */ }
      finish(v, primary, when + dur + 0.06);
      break;
    }

    case 'bell': {
      const dur = 2.6 * scale;
      const f0 = 494 * rate * (opts.tone ? opts.tone * 2 : 1);
      // Inharmonic partials with independent decays: hum, prime, tierce, quint.
      const ratios = [0.5, 1, 1.19, 1.5, 2.0, 2.5, 3.01];
      const amps = [0.16, 0.30, 0.14, 0.10, 0.09, 0.05, 0.035];
      const decays = [1.0, 0.9, 0.7, 0.55, 0.45, 0.3, 0.22];
      let primary = null;
      for (let i = 0; i < ratios.length; i++) {
        const o = partial(v, out, when, 'sine', f0 * ratios[i] * (1 + (rng() - 0.5) * 0.004),
          0, amps[i], 0.004, dur * decays[i]);
        if (i === 1) primary = o;
        else { try { o.stop(when + dur * decays[i] + 0.05); } catch (e) { /* ignore */ } }
      }
      noiseBurst(v, out, when, 0.05, 'bandpass', f0 * 4, 3, 0.12, 'white');
      finish(v, primary, when + dur * 0.9 + 0.05);
      break;
    }

    // -- construction ------------------------------------------------------
    case 'build_track': {
      // Ratchet: clicks tightening up, then the rail drops and rings.
      let t = when;
      const n = 5 + Math.floor(rng() * 3);
      for (let i = 0; i < n; i++) {
        noiseBurst(v, out, t, 0.035, 'bandpass', (1500 + rng() * 900) * rate, 7, 0.5, 'white');
        t += (0.075 - i * 0.007) * (0.9 + rng() * 0.2);
      }
      const clankAt = t + 0.05;
      // Metal-on-metal: two inharmonic partials plus a bright transient.
      noiseBurst(v, out, clankAt, 0.09, 'bandpass', 2600 * rate, 2.2, 0.55, 'white', 900);
      partial(v, out, clankAt, 'triangle', 372 * rate, 356 * rate, 0.30, 0.002, 0.34);
      const p2 = partial(v, out, clankAt, 'sine', 891 * rate, 880 * rate, 0.16, 0.002, 0.5);
      // Sleeper thud underneath: this is what makes it satisfying.
      const thud = partial(v, out, clankAt, 'sine', 96, 62, 0.34, 0.004, 0.22);
      try { thud.stop(clankAt + 0.3); } catch (e) { /* ignore */ }
      finish(v, p2, clankAt + 0.55);
      break;
    }

    case 'build_works': {
      // Stone: a big dull impact, grit, and a rumble that outlives it.
      const t = when;
      partial(v, out, t, 'sine', 74, 44, 0.5, 0.006, 0.55);
      noiseBurst(v, out, t, 0.6, 'lowpass', 620, 0.8, 0.42, 'brown', 160);
      noiseBurst(v, out, t + 0.02, 0.16, 'bandpass', 780, 4.5, 0.24, 'white', 420);
      // Scatter of chips.
      for (let i = 0; i < 4; i++) {
        noiseBurst(v, out, t + 0.1 + rng() * 0.5, 0.05, 'bandpass', 1400 + rng() * 2200, 6, 0.14, 'white');
      }
      const rumble = own(v, ctx.createBufferSource());
      rumble.buffer = bufs.brown;
      const rlp = own(v, ctx.createBiquadFilter());
      rlp.type = 'lowpass';
      rlp.frequency.setValueAtTime(220, t);
      rlp.frequency.exponentialRampToValueAtTime(70, t + 1.5);
      const rg = own(v, ctx.createGain());
      rg.gain.setValueAtTime(0.3, t);
      rg.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
      rumble.connect(rlp); rlp.connect(rg); rg.connect(out);
      rumble.start(t, rng() * 4, 1.6);
      finish(v, rumble, t + 1.6);
      break;
    }

    // -- engines -----------------------------------------------------------
    case 'chuff': {
      // One exhaust beat. Host calls this in rhythm, so it must be short,
      // pitch-varied, and cheap.
      const r = rate * (0.88 + rng() * 0.24);
      const dur = 0.2 / Math.max(0.4, r);
      const src = own(v, ctx.createBufferSource());
      src.buffer = bufs.pink;
      src.playbackRate.value = 0.8 + rng() * 0.5;
      const bp = own(v, ctx.createBiquadFilter());
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(560 * r, when);
      bp.frequency.exponentialRampToValueAtTime(180 * r, when + dur);
      bp.Q.value = 1.05;
      const g = own(v, ctx.createGain());
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(0.7, when + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      src.connect(bp); bp.connect(g); g.connect(out);
      src.start(when, rng() * 4, dur + 0.05);
      const th = partial(v, out, when, 'sine', 118 * r, 74 * r, 0.16, 0.004, dur * 0.8);
      try { th.stop(when + dur); } catch (e) { /* ignore */ }
      finish(v, src, when + dur + 0.04);
      break;
    }

    case 'brake': {
      // Squeal: resonant highs that wander, plus wheel rumble, cut off short.
      const dur = 0.85 * scale;
      const f0 = 2350 * rate * (0.9 + rng() * 0.2);
      let primary = null;
      const drift = own(v, ctx.createOscillator());
      drift.type = 'sine';
      drift.frequency.value = 3.1 + rng() * 2.5;
      const driftAmt = own(v, ctx.createGain());
      driftAmt.gain.value = 90;
      drift.connect(driftAmt);
      drift.start(when);
      try { drift.stop(when + dur + 0.05); } catch (e) { /* ignore */ }
      for (let i = 0; i < 2; i++) {
        const o = own(v, ctx.createOscillator());
        o.type = 'sawtooth';
        const f = f0 * (i ? 1.006 : 1);
        o.frequency.setValueAtTime(f, when);
        o.frequency.exponentialRampToValueAtTime(f * 0.72, when + dur);
        driftAmt.connect(o.detune);
        const bp = own(v, ctx.createBiquadFilter());
        bp.type = 'bandpass';
        bp.frequency.value = f0 * 1.1;
        bp.Q.value = 12;
        const g = own(v, ctx.createGain());
        g.gain.setValueAtTime(0, when);
        g.gain.linearRampToValueAtTime(0.16, when + 0.12);
        g.gain.linearRampToValueAtTime(0.11, when + dur * 0.75);
        g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
        o.connect(bp); bp.connect(g); g.connect(out);
        o.start(when);
        if (i === 0) primary = o;
        else { try { o.stop(when + dur + 0.05); } catch (e) { /* ignore */ } }
      }
      noiseBurst(v, out, when, dur, 'bandpass', 3400, 1.6, 0.10, 'white', 1200);
      noiseBurst(v, out, when, dur * 0.9, 'lowpass', 300, 0.7, 0.22, 'brown', 120);
      finish(v, primary, when + dur + 0.05);
      break;
    }

    // -- ledger ------------------------------------------------------------
    case 'coin': {
      // Fare income. Two small bright metals, the second a fifth up and late.
      const f0 = 2050 * rate * (0.95 + rng() * 0.12);
      const a = partial(v, out, when, 'triangle', f0, f0 * 0.99, 0.22, 0.002, 0.16);
      const b = partial(v, out, when + 0.045, 'triangle', f0 * 1.5, f0 * 1.48, 0.16, 0.002, 0.26);
      partial(v, out, when + 0.045, 'sine', f0 * 3.02, 0, 0.06, 0.002, 0.18);
      noiseBurst(v, out, when, 0.03, 'highpass', 4200, 0.7, 0.10, 'white');
      try { a.stop(when + 0.22); } catch (e) { /* ignore */ }
      finish(v, b, when + 0.33);
      break;
    }

    case 'charter': {
      // Page turned, then the seal of approval.
      noiseBurst(v, out, when, 0.16, 'bandpass', 1500, 1.1, 0.26, 'white', 3600);
      noiseBurst(v, out, when + 0.13, 0.2, 'bandpass', 3200, 0.9, 0.2, 'white', 1100);
      const chAt = when + 0.26;
      const f = hz(music.rootMidi + 24 + 7);
      partial(v, out, chAt, 'sine', f, 0, 0.16, 0.06, 1.4);
      const top = partial(v, out, chAt + 0.03, 'sine', f * 1.5, 0, 0.10, 0.08, 1.6);
      partial(v, out, chAt + 0.06, 'sine', f * 2, 0, 0.05, 0.1, 1.2);
      finish(v, top, chAt + 1.7);
      break;
    }

    case 'petition': {
      // Two knuckles on a counter, then a wax seal pressed home.
      for (let i = 0; i < 2; i++) {
        const t = when + i * 0.19;
        noiseBurst(v, out, t, 0.08, 'lowpass', 900, 1.4, 0.42, 'brown', 260);
        const k = partial(v, out, t, 'sine', 168, 118, 0.30, 0.003, 0.12);
        try { k.stop(t + 0.2); } catch (e) { /* ignore */ }
        const k2 = partial(v, out, t, 'triangle', 330, 300, 0.10, 0.002, 0.07);
        try { k2.stop(t + 0.12); } catch (e) { /* ignore */ }
      }
      const sealAt = when + 0.5;
      noiseBurst(v, out, sealAt, 0.14, 'lowpass', 420, 0.9, 0.3, 'brown', 150);
      const press = partial(v, out, sealAt, 'sine', 92, 70, 0.22, 0.02, 0.2);
      noiseBurst(v, out, sealAt + 0.02, 0.09, 'bandpass', 1900, 5, 0.06, 'white', 1200);
      finish(v, press, sealAt + 0.3);
      break;
    }

    // -- trouble -----------------------------------------------------------
    case 'incident': {
      // A low hit and two notes that do not agree with each other.
      const dur = 2.2 * scale;
      const root = hz(music.rootMidi - 12);
      partial(v, out, when, 'sine', root * 2, root * 1.5, 0.42, 0.006, 1.1);
      noiseBurst(v, out, when, 0.5, 'lowpass', 700, 0.9, 0.3, 'brown', 120);
      const a = partial(v, out, when + 0.02, 'triangle', root * 2, 0, 0.14, 0.25, dur);
      const b = partial(v, out, when + 0.05, 'triangle', root * 2 * Math.pow(2, 6 / 12), 0, 0.10, 0.35, dur);
      try { a.stop(when + dur + 0.05); } catch (e) { /* ignore */ }
      finish(v, b, when + dur + 0.08);
      break;
    }

    case 'dragon': {
      // Distant roar: filtered noise body, a pitch-swept saw underneath, and
      // a slow growl on the amplitude. Never bright.
      const dur = 3.6 * scale;
      const body = own(v, ctx.createBufferSource());
      body.buffer = bufs.brown;
      body.loop = true;
      const lp = own(v, ctx.createBiquadFilter());
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(260, when);
      lp.frequency.exponentialRampToValueAtTime(900, when + dur * 0.35);
      lp.frequency.exponentialRampToValueAtTime(180, when + dur);
      lp.Q.value = 1.6;
      const bg = own(v, ctx.createGain());
      bg.gain.setValueAtTime(0, when);
      bg.gain.linearRampToValueAtTime(0.55, when + dur * 0.3);
      bg.gain.setValueAtTime(0.5, when + dur * 0.62);
      bg.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      body.connect(lp); lp.connect(bg); bg.connect(out);
      body.start(when, rng() * 4);
      // Growl: amplitude modulation just below pitch.
      const growl = own(v, ctx.createOscillator());
      growl.type = 'sine';
      growl.frequency.setValueAtTime(17 + rng() * 6, when);
      growl.frequency.linearRampToValueAtTime(11, when + dur);
      const gAmt = own(v, ctx.createGain());
      gAmt.gain.value = 0.3;
      growl.connect(gAmt); gAmt.connect(bg.gain);
      growl.start(when);
      try { growl.stop(when + dur + 0.05); } catch (e) { /* ignore */ }
      // The voice itself.
      const o = own(v, ctx.createOscillator());
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(84, when);
      o.frequency.exponentialRampToValueAtTime(132, when + dur * 0.28);
      o.frequency.exponentialRampToValueAtTime(58, when + dur);
      const olp = own(v, ctx.createBiquadFilter());
      olp.type = 'lowpass';
      olp.frequency.setValueAtTime(420, when);
      olp.frequency.exponentialRampToValueAtTime(220, when + dur);
      olp.Q.value = 3;
      const og = own(v, ctx.createGain());
      og.gain.setValueAtTime(0, when);
      og.gain.linearRampToValueAtTime(0.3, when + dur * 0.25);
      og.gain.exponentialRampToValueAtTime(0.0001, when + dur * 0.96);
      o.connect(olp); olp.connect(og); og.connect(out);
      o.start(when);
      try { body.stop(when + dur + 0.05); } catch (e) { /* ignore */ }
      finish(v, o, when + dur + 0.06);
      break;
    }

    case 'collapse': {
      // Rockslide: a swelling body of dark noise with debris scattered through.
      const dur = 2.4 * scale;
      const src = own(v, ctx.createBufferSource());
      src.buffer = bufs.brown;
      src.loop = true;
      const lp = own(v, ctx.createBiquadFilter());
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(1400, when);
      lp.frequency.exponentialRampToValueAtTime(140, when + dur);
      const g = own(v, ctx.createGain());
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(0.5, when + 0.18);
      g.gain.linearRampToValueAtTime(0.34, when + dur * 0.5);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      src.connect(lp); lp.connect(g); g.connect(out);
      src.start(when, rng() * 4);
      partial(v, out, when + 0.05, 'sine', 58, 34, 0.32, 0.05, dur * 0.7);
      const n = 10 + Math.floor(rng() * 8);
      for (let i = 0; i < n; i++) {
        const t = when + 0.05 + Math.pow(rng(), 0.7) * dur * 0.8;
        noiseBurst(v, out, t, 0.04 + rng() * 0.05, 'bandpass', 700 + rng() * 2600, 5, 0.12 + rng() * 0.14, 'white');
      }
      finish(v, src, when + dur + 0.05);
      break;
    }

    // -- the big ones ------------------------------------------------------
    case 'depart': {
      // The Elves take ship. A rising line that thins as it goes, and one
      // suspended fourth that resolves down to the minor third near the top.
      // It is supposed to hurt.
      const dur = 10.5 * scale;
      const root = hz(music.rootMidi + 12);
      const rise = Math.pow(2, 3.2 / 12);          // it lifts about a minor third
      const voices3 = [
        { f: root, amp: 0.20, type: 'sine' },
        { f: root * Math.pow(2, 5 / 12), amp: 0.15, type: 'sine', sus: true },
        { f: root * 2, amp: 0.11, type: 'sine' },
        { f: root * 3, amp: 0.045, type: 'sine' },
      ];
      let primary = null;
      for (let i = 0; i < voices3.length; i++) {
        const V = voices3[i];
        const o = own(v, ctx.createOscillator());
        o.type = V.type;
        o.frequency.setValueAtTime(V.f, when);
        if (V.sus) {
          // 4th rises with the rest, then falls a whole tone to the minor 3rd.
          o.frequency.exponentialRampToValueAtTime(V.f * Math.pow(2, 2.4 / 12), when + dur * 0.62);
          o.frequency.exponentialRampToValueAtTime(V.f * rise * Math.pow(2, -2 / 12), when + dur * 0.78);
          o.frequency.exponentialRampToValueAtTime(V.f * rise * Math.pow(2, -2 / 12), when + dur);
        } else {
          o.frequency.exponentialRampToValueAtTime(V.f * rise, when + dur);
        }
        const g = own(v, ctx.createGain());
        g.gain.setValueAtTime(0.0001, when);
        g.gain.linearRampToValueAtTime(V.amp, when + dur * 0.34);
        g.gain.linearRampToValueAtTime(V.amp * 0.8, when + dur * 0.66);
        g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
        // A slow tremble, so it is not a synthesiser holding a note.
        const vib = own(v, ctx.createOscillator());
        vib.frequency.value = 0.7 + i * 0.23;
        const vibAmt = own(v, ctx.createGain());
        vibAmt.gain.value = 3.5;
        vib.connect(vibAmt); vibAmt.connect(o.detune);
        vib.start(when);
        try { vib.stop(when + dur + 0.1); } catch (e) { /* ignore */ }
        o.connect(g); g.connect(out);
        o.start(when);
        if (i === 0) primary = o;
        else { try { o.stop(when + dur + 0.1); } catch (e) { /* ignore */ } }
      }
      // Sea air, very quiet, fading as they go.
      const air = own(v, ctx.createBufferSource());
      air.buffer = bufs.pink;
      air.loop = true;
      const ahp = own(v, ctx.createBiquadFilter());
      ahp.type = 'highpass';
      ahp.frequency.value = 900;
      const ag = own(v, ctx.createGain());
      ag.gain.setValueAtTime(0.0001, when);
      ag.gain.linearRampToValueAtTime(0.05, when + dur * 0.3);
      ag.gain.exponentialRampToValueAtTime(0.0001, when + dur * 0.95);
      air.connect(ahp); ahp.connect(ag); ag.connect(out);
      air.start(when, rng() * 3);
      try { air.stop(when + dur + 0.1); } catch (e) { /* ignore */ }
      finish(v, primary, when + dur + 0.15);
      break;
    }

    case 'doom': {
      // Age III arrives. Very low, very long, and it makes the room heavier
      // rather than louder.
      const dur = 13 * scale;
      const root = hz(music.rootMidi) * 0.5;
      let primary = null;
      const specs = [
        { f: root, type: 'sine', amp: 0.5, slide: 0.94 },
        { f: root * 1.5, type: 'sine', amp: 0.18, slide: 0.96 },
        { f: root * 2 * Math.pow(2, 1 / 12), type: 'triangle', amp: 0.055, slide: 1.0 },
      ];
      for (let i = 0; i < specs.length; i++) {
        const S = specs[i];
        const o = own(v, ctx.createOscillator());
        o.type = S.type;
        o.frequency.setValueAtTime(S.f, when);
        o.frequency.linearRampToValueAtTime(S.f * S.slide, when + dur);
        const g = own(v, ctx.createGain());
        g.gain.setValueAtTime(0.0001, when);
        g.gain.linearRampToValueAtTime(S.amp, when + dur * 0.45);
        g.gain.linearRampToValueAtTime(S.amp * 0.85, when + dur * 0.62);
        g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
        o.connect(g); g.connect(out);
        o.start(when);
        if (i === 0) primary = o;
        else { try { o.stop(when + dur + 0.1); } catch (e) { /* ignore */ } }
      }
      // A rising floor of dark noise, and a slow heartbeat inside it.
      const src = own(v, ctx.createBufferSource());
      src.buffer = bufs.brown;
      src.loop = true;
      const lp = own(v, ctx.createBiquadFilter());
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(90, when);
      lp.frequency.exponentialRampToValueAtTime(320, when + dur * 0.55);
      lp.frequency.exponentialRampToValueAtTime(70, when + dur);
      const ng = own(v, ctx.createGain());
      ng.gain.setValueAtTime(0.0001, when);
      ng.gain.linearRampToValueAtTime(0.4, when + dur * 0.5);
      ng.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      const trem = own(v, ctx.createOscillator());
      trem.frequency.value = 0.42;
      const tAmt = own(v, ctx.createGain());
      tAmt.gain.value = 0.16;
      trem.connect(tAmt); tAmt.connect(ng.gain);
      trem.start(when);
      try { trem.stop(when + dur + 0.1); } catch (e) { /* ignore */ }
      src.connect(lp); lp.connect(ng); ng.connect(out);
      src.start(when, rng() * 4);
      try { src.stop(when + dur + 0.1); } catch (e) { /* ignore */ }
      finish(v, primary, when + dur + 0.15);
      break;
    }

    case 'ent': {
      // A vast slow wooden groan: resonant fibres sliding, a subsonic body,
      // and a few smaller creaks inside the big one.
      const dur = 4.6 * scale;
      const src = own(v, ctx.createBufferSource());
      src.buffer = bufs.brown;
      src.loop = true;
      src.playbackRate.value = 0.45 + rng() * 0.2;
      const bp = own(v, ctx.createBiquadFilter());
      bp.type = 'bandpass';
      const f0 = 105 + rng() * 60;
      bp.frequency.setValueAtTime(f0, when);
      bp.frequency.linearRampToValueAtTime(f0 * 1.9, when + dur * 0.55);
      bp.frequency.linearRampToValueAtTime(f0 * 0.8, when + dur);
      bp.Q.value = 11;
      const g = own(v, ctx.createGain());
      g.gain.setValueAtTime(0.0001, when);
      g.gain.linearRampToValueAtTime(0.6, when + dur * 0.3);
      g.gain.linearRampToValueAtTime(0.45, when + dur * 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      src.connect(bp); bp.connect(g); g.connect(out);
      src.start(when, rng() * 4);
      try { src.stop(when + dur + 0.1); } catch (e) { /* ignore */ }
      // Body: a very low saw with a slow wobble.
      const o = own(v, ctx.createOscillator());
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(41, when);
      o.frequency.linearRampToValueAtTime(48, when + dur * 0.5);
      o.frequency.linearRampToValueAtTime(38, when + dur);
      const olp = own(v, ctx.createBiquadFilter());
      olp.type = 'lowpass';
      olp.frequency.value = 190;
      olp.Q.value = 2;
      const og = own(v, ctx.createGain());
      og.gain.setValueAtTime(0.0001, when);
      og.gain.linearRampToValueAtTime(0.28, when + dur * 0.35);
      og.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      const wob = own(v, ctx.createOscillator());
      wob.frequency.value = 0.55;
      const wAmt = own(v, ctx.createGain());
      wAmt.gain.value = 22;
      wob.connect(wAmt); wAmt.connect(o.detune);
      wob.start(when);
      try { wob.stop(when + dur + 0.1); } catch (e) { /* ignore */ }
      o.connect(olp); olp.connect(og); og.connect(out);
      o.start(when);
      for (let i = 0; i < 3; i++) {
        const t = when + dur * (0.15 + rng() * 0.6);
        noiseBurst(v, out, t, 0.35 + rng() * 0.5, 'bandpass', 260 + rng() * 500, 14, 0.12, 'brown', 200);
      }
      finish(v, o, when + dur + 0.15);
      break;
    }

    // -- interface ---------------------------------------------------------
    case 'ui_click': {
      const o = partial(v, out, when, 'sine', 1180, 900, 0.5, 0.001, 0.035);
      noiseBurst(v, out, when, 0.012, 'bandpass', 2600, 3, 0.2, 'white');
      finish(v, o, when + 0.06);
      break;
    }

    case 'ui_hover': {
      const o = partial(v, out, when, 'sine', 1720, 1650, 0.4, 0.001, 0.022);
      finish(v, o, when + 0.04);
      break;
    }

    case 'error': {
      // Not a beep: a dull thunk, like a stamp refused.
      const o = own(v, ctx.createOscillator());
      o.type = 'sine';
      o.frequency.setValueAtTime(164, when);
      o.frequency.exponentialRampToValueAtTime(104, when + 0.16);
      const lp = own(v, ctx.createBiquadFilter());
      lp.type = 'lowpass';
      lp.frequency.value = 400;
      const g = own(v, ctx.createGain());
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(0.5, when + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.22);
      o.connect(lp); lp.connect(g); g.connect(out);
      o.start(when);
      noiseBurst(v, out, when, 0.08, 'lowpass', 520, 1.2, 0.22, 'brown', 200);
      finish(v, o, when + 0.26);
      break;
    }

    default:
      // Should be unreachable: SFX_LEVEL gates the name.
      killVoice(v);
  }
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

// Age I is pastoral Dorian; Age II lifts the key and brightens; Age III drops
// to a darker root and goes Aeolian, or Phrygian once things are bad.
const AGE_KEY = {
  1: { root: 38, mode: 'dorian' },     // D2
  2: { root: 43, mode: 'dorian' },     // G2
  3: { root: 37, mode: 'aeolian' },    // C#2
};

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function ramp(param, value, tc) {
  const t = ctx.currentTime;
  try {
    param.cancelScheduledValues(t);
    param.setTargetAtTime(value, t, Math.max(0.01, tc));
  } catch (e) { /* ignore */ }
}

function refreshBedLevel(tc) {
  const bed = beds.get(scene.region);
  if (bed && !bed.dying) ramp(bed.out.gain, bedLevel(), tc || 1.2);
}

function applyScene(fade) {
  if (!ready) return;
  const age = scene.age;
  const night = scene.night;
  const unrest = scene.unrest;
  const paused = scene.speed === 0;
  const tc = Math.max(0.08, fade * 0.32);

  const key = AGE_KEY[age] || AGE_KEY[1];
  music.rootMidi = key.root;
  music.mode = MODES[age === 3 && unrest > 0.5 ? 'phrygian' : key.mode];
  const glide = fade > 0 ? Math.max(1.5, fade * 0.7) : 0;
  tuneDrone(glide);
  tunePad(glide);

  // --- arrangement --------------------------------------------------------
  let drone = age === 3 ? 1.0 : age === 2 ? 0.82 : 0.86;
  let pad = age === 3 ? 0.62 : age === 2 ? 0.88 : 0.5;
  let pluck = age === 3 ? 0.6 : age === 2 ? 1.0 : 0.92;
  let mach = age === 3 ? 0.55 : age === 2 ? 0.62 : 0.0;
  pluck *= 1 - 0.3 * night;          // night thins the arrangement
  pad *= (1 - 0.12 * night) * (1 + 0.18 * unrest);
  drone *= 1 + 0.1 * unrest;
  if (paused) { drone *= 0.42; pad *= 0.1; pluck = 0; mach = 0; }
  ramp(nodes.droneBus.gain, drone, paused ? 0.6 : tc);
  ramp(nodes.padBus.gain, pad, paused ? 0.6 : tc);
  ramp(nodes.pluckBus.gain, pluck, paused ? 0.4 : tc);
  ramp(nodes.machBus.gain, mach, paused ? 0.4 : tc);

  // --- tone ---------------------------------------------------------------
  const droneCut = (300 * (age === 2 ? 1.55 : 1) * (age === 3 ? 0.85 : 1)) * (1 - 0.5 * night) + 60 * unrest;
  ramp(nodes.droneLP.frequency, clamp(droneCut, 90, 3000), tc);
  ramp(nodes.droneLFOAmt.gain, age === 3 ? 190 : 120, tc);
  // Age III detunes the drone wider; unrest widens it further.
  const width = 6 + (age === 3 ? 24 : 0) + 16 * unrest;
  ramp(nodes.droneA.detune, -width, tc);
  ramp(nodes.droneB.detune, width, tc);
  ramp(nodes.droneDetuneAmt.gain, 4 + (age === 3 ? 7 : 0), tc);

  const padCut = 1600 * (age === 2 ? 1.35 : 1) * (age === 3 ? 0.75 : 1) * (1 - 0.45 * night);
  ramp(nodes.padLP.frequency, clamp(padCut, 200, 6000), tc);
  ramp(nodes.revTone.frequency, clamp(4200 * (1 - 0.42 * night), 700, 9000), tc);
  ramp(nodes.musicSend.gain, 0.3 + (age === 3 ? 0.12 : 0) + 0.06 * night, tc);
  ramp(nodes.ambBus.gain, paused ? 0.35 : 0.7, tc);

  refreshBedLevel(tc);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const ALLOWED_SPEEDS = [0, 1, 2, 4];

function nearestSpeed(v) {
  let best = 1, bd = Infinity;
  for (let i = 0; i < ALLOWED_SPEEDS.length; i++) {
    const d = Math.abs(ALLOWED_SPEEDS[i] - v);
    if (d < bd) { bd = d; best = ALLOWED_SPEEDS[i]; }
  }
  return best;
}

function teardown() {
  // Kill transient voices, then beds, then the persistent graph.
  for (let i = voices.length - 1; i >= 0; i--) killVoice(voices[i]);
  const list = [];
  beds.forEach((b) => list.push(b));
  for (let i = 0; i < list.length; i++) destroyBed(list[i]);
  const keys = Object.keys(nodes);
  for (let i = 0; i < keys.length; i++) {
    const n = nodes[keys[i]];
    try { if (n.stop) n.stop(); } catch (e) { /* ignore */ }
    try { n.disconnect(); } catch (e) { /* ignore */ }
    delete nodes[keys[i]];
    stats.persistent--;
    stats.disposed++;
  }
}

export const Audio = {
  /** Create the context and start the bed. Call from a user gesture. Idempotent. */
  init() {
    if (unavailable) return;
    if (ready) {                                   // safe to call twice
      if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
      return;
    }
    const g = typeof globalThis !== 'undefined' ? globalThis : null;
    const AC = g && (g.AudioContext || g.webkitAudioContext);
    if (!AC) { unavailable = true; return; }        // no WebAudio: no-op forever
    try {
      ctx = new AC({ latencyHint: 'interactive' });
      buildGraph();
      ready = true;
      applyScene(0);
      setBed(scene.region, 0.8);
      if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
      music.nextStep = ctx.currentTime + 0.35;
      if (timer === null) timer = setInterval(tick, TICK_MS);
      tick();
    } catch (e) {
      unavailable = true;
      ready = false;
      try { if (ctx && ctx.close) ctx.close(); } catch (e2) { /* ignore */ }
      ctx = null;
    }
  },

  /** Crossfade music and ambience to a new world state. All fields optional. */
  setScene(s) {
    if (!s || typeof s !== 'object') return;
    const prevAge = scene.age;
    const prevRegion = scene.region;
    const prevSpeed = scene.speed;

    if (typeof s.age === 'number' && isFinite(s.age)) scene.age = clamp(Math.round(s.age), 1, 3);
    if (typeof s.region === 'string') {
      const r = s.region.toUpperCase();
      if (BEDS[r]) scene.region = r;
    } else if (typeof s.region === 'number' && REGIONS[s.region]) {
      scene.region = REGIONS[s.region];            // tolerate the REGION enum
    }
    if (typeof s.unrest === 'number' && isFinite(s.unrest)) scene.unrest = clamp(s.unrest, 0, 1);
    if (typeof s.night === 'number' && isFinite(s.night)) scene.night = clamp(s.night, 0, 1);
    if (typeof s.speed === 'number' && isFinite(s.speed)) scene.speed = nearestSpeed(clamp(s.speed, 0, 4));
    if (!ready) return;                            // init() will apply it

    const ageChanged = scene.age !== prevAge;
    const speedChanged = scene.speed !== prevSpeed;
    applyScene(ageChanged ? 7 : speedChanged ? 1.2 : 2.5);
    if (scene.region !== prevRegion) setBed(scene.region, 3.5);
  },

  /** Fire a one-shot. Unknown names are ignored. See ONE_SHOTS. */
  play(name, opts) {
    if (!ready || isMuted) return;
    if (typeof name !== 'string') return;
    oneShot(name, opts);
  },

  setMuted(m) {
    isMuted = !!m;
    if (!ready) return;
    ramp(nodes.master.gain, isMuted ? 0 : masterVol, 0.06);
    if (isMuted) {
      // Silence in-flight voices too, so unmuting is clean.
      for (let i = voices.length - 1; i >= 0; i--) {
        const v = voices[i];
        if (v.gain) ramp(v.gain.gain, 0, 0.04);
      }
    }
  },

  get muted() { return isMuted; },
  set muted(m) { this.setMuted(m); },

  /** Master volume, 0..1. Default 0.5 — deliberately modest. */
  setVolume(v) {
    masterVol = clamp(typeof v === 'number' && isFinite(v) ? v : 0.5, 0, 1);
    if (ready && !isMuted) ramp(nodes.master.gain, masterVol, 0.08);
  },
  get volume() { return masterVol; },

  /** Live diagnostics. `nodes` is what the test page watches for leaks. */
  stats() {
    return {
      available: !unavailable,
      running: ready,
      state: ctx ? ctx.state : 'none',
      time: ctx ? ctx.currentTime : 0,
      sampleRate: ctx ? ctx.sampleRate : 0,
      nodes: stats.persistent + stats.live,
      persistent: stats.persistent,
      live: stats.live,
      voices: stats.voices,
      beds: beds.size,
      created: stats.created,
      disposed: stats.disposed,
      // Must always be 0: every node ever created is either still connected
      // (persistent + live) or has been disconnected.
      balance: stats.created - stats.disposed - (stats.persistent + stats.live),
      stolen: stats.stolen,
      notes: stats.notes,
      peakLive: stats.peakLive,
    };
  },

  /** Current scene plus what the music is actually doing. */
  scene() {
    const modeName = music.mode === MODES.dorian ? 'dorian'
      : music.mode === MODES.phrygian ? 'phrygian' : 'aeolian';
    return {
      age: scene.age,
      region: scene.region,
      unrest: scene.unrest,
      night: scene.night,
      speed: scene.speed,
      bpm: Math.round(music.bpm * 10) / 10,
      key: NOTE_NAMES[((music.rootMidi % 12) + 12) % 12] + ' ' + modeName,
      muted: isMuted,
      volume: masterVol,
    };
  },

  /** Tear everything down. Not needed by the game; used to prove cleanup. */
  dispose() {
    if (timer !== null) { clearInterval(timer); timer = null; }
    if (!ctx) { ready = false; return; }
    try { teardown(); } catch (e) { /* ignore */ }
    ready = false;
    const dead = ctx;
    ctx = null;
    try { if (dead.close) dead.close(); } catch (e) { /* ignore */ }
    stats.persistent = 0;
    stats.live = 0;
    stats.voices = 0;
  },

  oneShots: ONE_SHOTS.slice(),
  regions: REGIONS.slice(),
};

export default Audio;
