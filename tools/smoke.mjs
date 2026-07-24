// Headless smoke test. three.js only needs WebGL when you create a renderer, so
// every piece of geometry construction in the game can be exercised in Node.
// This catches the whole class of integration bug that matters most — missing
// exports, wrong call signatures, undefined field access — without a browser.
//
//   node tools/smoke.mjs

// --- minimal DOM so modules that touch it during construction survive
globalThis.window = globalThis;
globalThis.devicePixelRatio = 1;
globalThis.performance = globalThis.performance || { now: () => Date.now() };
const fakeEl = () => ({
  style: {}, clientWidth: 1600, clientHeight: 900, children: [],
  appendChild(c) { this.children.push(c); return c; },
  prepend(c) { this.children.unshift(c); return c; },
  remove() {}, removeChild() {}, setAttribute() {}, getAttribute: () => null,
  addEventListener() {}, removeEventListener() {},
  classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  querySelector: () => fakeEl(), querySelectorAll: () => [],
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 1600, height: 900 }),
  getContext: () => null, firstChild: { textContent: '' }, lastChild: { textContent: '' },
  set innerHTML(v) { this._h = v; }, get innerHTML() { return this._h || ''; },
  set textContent(v) { this._t = v; }, get textContent() { return this._t || ''; },
  set hidden(v) { this._hid = v; }, get hidden() { return this._hid; },
});
globalThis.document = {
  createElement: fakeEl, createElementNS: fakeEl,
  getElementById: fakeEl, querySelector: () => fakeEl(), querySelectorAll: () => [],
  addEventListener() {}, body: fakeEl(), documentElement: fakeEl(), readyState: 'complete',
};
globalThis.requestAnimationFrame = (f) => setTimeout(() => f(performance.now()), 0);
globalThis.addEventListener = () => {};

import * as THREE from 'three';
import { generateWorld } from '../src/world/worldgen.js';
import { createSim } from '../src/sim/sim.js';
import { createEvents } from '../src/sim/events.js';
import { KINDS } from '../src/sim/model.js';

let fails = 0, passes = 0;
const t = (label, fn) => {
  const t0 = performance.now();
  try {
    const info = fn();
    passes++;
    console.log(`  ok   ${label}${info ? '  — ' + info : ''}  [${(performance.now() - t0).toFixed(0)}ms]`);
  } catch (e) {
    fails++;
    console.log(`  FAIL ${label}: ${e.message}`);
    if (process.env.VERBOSE) console.log(e.stack.split('\n').slice(1, 5).join('\n'));
  }
};

const stats = (obj) => {
  let tris = 0, calls = 0;
  obj.traverse((o) => {
    if (!o.isMesh && !o.isPoints && !o.isLine) return;
    calls++;
    const g = o.geometry;
    if (!g) return;
    const n = g.index ? g.index.count : (g.attributes.position?.count ?? 0);
    tris += (o.isMesh ? n / 3 : n) * (o.isInstancedMesh ? o.count : 1);
  });
  return { tris: Math.round(tris), calls };
};

console.log('\n=== Perilous Ways smoke test ===\n');

const world = generateWorld('eardon');
console.log(`world: ${world.W}x${world.H} cells, ${world.sites.length} sites, ${world.passes.length} passes\n`);

// ── terrain ────────────────────────────────────────────────────────────────
let terrain = null;
// dynamic import so a failure in one module does not abort the whole file
const imp = async (p) => import(p);

const gfx = {};
for (const [k, p] of Object.entries({
  terrain: '../src/gfx/terrain.js',
  props: '../src/gfx/props.js',
  trains: '../src/gfx/trains.js',
  rails: '../src/gfx/rails.js',
})) {
  try { gfx[k] = await imp(p); }
  catch (e) { fails++; console.log(`  FAIL import ${k}: ${e.message}`); }
}

console.log('\nmodule exports');
const need = {
  terrain: ['createTerrain'],
  props: ['buildSettlement', 'propMaterials'],
  trains: ['buildEngine', 'buildWagon', 'buildTrain', 'createSteam', 'createSparks'],
  rails: ['buildTrack', 'buildLineOverlay', 'buildSurveyPreview', 'trackMaterial'],
};
for (const [mod, names] of Object.entries(need)) {
  for (const n of names) {
    t(`${mod}.${n}`, () => {
      if (!gfx[mod]) throw new Error('module missing');
      if (typeof gfx[mod][n] !== 'function') throw new Error('not exported');
      return '';
    });
  }
}

console.log('\nterrain construction');
t('createTerrain(world)', () => {
  terrain = gfx.terrain.createTerrain(world, THREE, {});
  if (!terrain.group) throw new Error('no group returned');
  const s = stats(terrain.group);
  return `${s.calls} draw calls, ${s.tris.toLocaleString()} triangles`;
});
t('terrain.update', () => {
  terrain.update(0.016, {
    time: 1, windDir: [0.6, 0.4], windStrength: 1,
    sunDir: new THREE.Vector3(0.4, 0.6, 0.3), ashLevel: 0.3, night: 0,
  });
  return '';
});
t('terrain.shared uniforms', () => {
  const sh = terrain.shared || {};
  return Object.keys(sh).join(', ') || '(none exposed)';
});
t('setForestDamage', () => {
  if (!terrain.setForestDamage) throw new Error('not present');
  terrain.setForestDamage(120, 90, 30);
  return '';
});

console.log('\nsettlements (all kinds x all tiers)');
let mats = null;
t('propMaterials', () => { mats = gfx.props.propMaterials(THREE, terrain?.shared); return Object.keys(mats).join(', '); });
for (const kind of Object.keys(KINDS)) {
  t(`buildSettlement ${kind}`, () => {
    const out = [];
    for (let tier = 0; tier <= 4; tier++) {
      const r = gfx.props.buildSettlement({ kind, tier, seed: `s${tier}`, shared: terrain?.shared }, THREE);
      if (!r.group) throw new Error(`tier ${tier}: no group`);
      const s = stats(r.group);
      out.push(`t${tier}:${s.tris}/${s.calls}`);
    }
    return out.join(' ');
  });
}
t('determinism (same seed -> same vertex count)', () => {
  const a = gfx.props.buildSettlement({ kind: 'delve', tier: 3, seed: 'fixed' }, THREE);
  const b = gfx.props.buildSettlement({ kind: 'delve', tier: 3, seed: 'fixed' }, THREE);
  const sa = stats(a.group), sb = stats(b.group);
  if (sa.tris !== sb.tris) throw new Error(`${sa.tris} vs ${sb.tris}`);
  return `${sa.tris} triangles both times`;
});

console.log('\nrolling stock');
for (const style of ['dwarf', 'men', 'elf', 'orc']) {
  t(`buildTrain ${style}`, () => {
    const tr = gfx.trains.buildTrain({ style, cars: ['grain', 'ore', 'passenger', 'brake'], seed: 'x' }, THREE);
    if (!tr.group) throw new Error('no group');
    const s = stats(tr.group);
    if (!tr.stackTop) throw new Error('no stackTop');
    return `${s.tris} tris, ${s.calls} calls, len ${tr.length?.toFixed?.(1)}, ${tr.wheels?.length ?? 0} wheels`;
  });
}
t('createSteam + emit + update', () => {
  const st = gfx.trains.createSteam(THREE, 800);
  for (let i = 0; i < 40; i++) {
    st.emit(new THREE.Vector3(0, 10, 0), { x: 0, y: 8, z: 0 }, 1, 'dwarf');
    st.update(0.05, { wind: [0.5, 0.2], windDir: [0.5, 0.2] });
  }
  return `${st.count ?? '?'} live particles`;
});
t('createSparks + burst', () => {
  const sp = gfx.trains.createSparks(THREE, 200);
  sp.burst(new THREE.Vector3(0, 4, 0), 24, '#ff8a3a');
  sp.update(0.05);
  return '';
});

console.log('\nsimulation + track');
const sim = createSim(world);
sim.events = createEvents();
let link = null;
t('survey a link', () => {
  // Try several candidates: the nearest neighbour may be the far side of a
  // mountain, which is a legitimate refusal rather than a failure.
  const a = sim.sites.find((x) => x.kind === 'shire');
  const near = sim.sites.filter((x) => x.id !== a.id)
    .sort((p, q) => Math.hypot(p.x - a.x, p.z - a.z) - Math.hypot(q.x - a.x, q.z - a.z));
  const reasons = [];
  for (const b of near.slice(0, 8)) {
    const sv = sim.survey(a.id, b.id);
    if (!sv.ok) { reasons.push(`${b.name}: ${sv.reason}`); continue; }
    sim.treasury += sv.price;
    const r = sim.build(sv);
    if (!r.ok) { reasons.push(`${b.name}: ${r.reason}`); continue; }
    link = r.link;
    return `${a.name}->${b.name} ${Math.round(sv.length)}u ${sv.price}cr`;
  }
  throw new Error(`no buildable neighbour; tried ${reasons.length}: ${reasons[0]}`);
});
t('buildTrack', () => {
  const mat = gfx.rails.trackMaterial(terrain?.shared);
  const tr = gfx.rails.buildTrack(link, world, mat);
  const s = stats(tr.mesh);
  return `${s.tris} triangles, ${tr.portals.length} portals`;
});
t('a tunnelled link builds portals', () => {
  sim.can.tunnel = true;
  const cap = sim.sites.find((x) => x.anchor === 'capital');
  const delve = sim.sites.find((x) => x.anchor === 'greatdelve');
  const sv = sim.survey(cap.id, delve.id);
  if (!sv.ok) throw new Error(sv.reason);
  sim.treasury += sv.price;
  const r = sim.build(sv);
  const tr = gfx.rails.buildTrack(r.link, world, gfx.rails.trackMaterial(terrain?.shared));
  if (sv.tunnels > 0 && tr.portals.length === 0) throw new Error('tunnel but no portals');
  return `${sv.tunnels} tunnels -> ${tr.portals.length} portals, ${sv.piers} piers`;
});
t('buildLineOverlay + buildSurveyPreview', () => {
  const ov = gfx.rails.buildLineOverlay(sim.links, '#c94f3d');
  const a = sim.sites[0], b = sim.sites[5];
  const sv = sim.survey(a.id, b.id);
  const pv = sv.ok ? gfx.rails.buildSurveyPreview(sv, true) : null;
  return `overlay ${stats(ov.mesh).tris} tris${pv ? `, preview ${stats(pv.mesh).tris} tris` : ' (no preview: survey blocked)'}`;
});

console.log('\nsim runs forward');
t('30 weeks of simulation', () => {
  const t0 = performance.now();
  for (let i = 0; i < 30 * 7 * 2 && !sim.over; i++) sim.step(90 / 7 / 2);
  const s = sim.snapshot();
  return `week ${s.week}, ${sim.log.length} log entries, ${Math.round(performance.now() - t0)}ms`;
});
t('every log entry is a non-empty string', () => {
  for (const e of sim.log) {
    if (typeof e.text !== 'string' || !e.text.trim()) throw new Error(`bad entry at week ${e.week}`);
    if (e.text.includes('undefined') || e.text.includes('NaN')) throw new Error(`leaked value: ${e.text.slice(0, 90)}`);
  }
  return `${sim.log.length} entries clean`;
});
t('no NaN in the snapshot', () => {
  const s = sim.snapshot();
  for (const [k, v] of Object.entries(s)) {
    if (typeof v === 'number' && !Number.isFinite(v)) throw new Error(`${k} is ${v}`);
  }
  return '';
});

console.log(`\n=== ${passes} passed, ${fails} failed ===\n`);
process.exit(fails ? 1 : 0);
