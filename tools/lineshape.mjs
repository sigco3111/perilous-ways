// Is one long line better or worse than several short ones over the SAME track?
//
// The player asked this and could not answer it. Neither could I, which means
// either the tradeoff does not exist or it is invisible. This builds one identical
// network per arm of the experiment, then differs ONLY in how services are drawn
// over it, and reports what the realm actually moved.
//
//   node tools/lineshape.mjs [seed] [weeks]

import { generateWorld } from '../src/world/worldgen.js';
import { createSim } from '../src/sim/sim.js';
import { createEvents } from '../src/sim/events.js';
import { WEEK } from '../src/sim/model.js';

const SEED = process.argv[2] || 'thrain';
const WEEKS = +(process.argv[3] || 30);

/** Build the same spine of track every time: a chain, so both shapes are possible. */
function build(seed, engines) {
  const sim = createSim(generateWorld(seed));
  sim.events = createEvents();
  sim.treasury = 900000;
  for (const k of Object.keys(sim.can)) sim.can[k] = true;
  sim.stock.engines = engines;
  sim.stock.cars = 3;

  // a CHAIN of eight settlements, each joined to the previous one
  const chain = [];
  let cur = sim.sites.reduce((a, b) => ((b.pop || 0) > (a.pop || 0) ? b : a));
  chain.push(cur);
  const used = new Set([cur.id]);
  for (let i = 0; i < 7; i++) {
    let best = null;
    for (const b of sim.sites) {
      if (used.has(b.id) || b.abandoned) continue;
      const d = Math.hypot(cur.x - b.x, cur.z - b.z);
      if (d < 20) continue;
      if (!best || d < best.d) best = { b, d };
    }
    if (!best) break;
    const sv = sim.survey(cur.id, best.b.id);
    if (!sv.ok) { used.add(best.b.id); i--; continue; }
    if (!sim.build(sv).ok) break;
    used.add(best.b.id);
    chain.push(best.b);
    cur = best.b;
  }
  return { sim, chain };
}

function run(label, shape, engines) {
  const { sim, chain } = build(SEED, engines);
  const ids = chain.map((s) => s.id);
  if (ids.length < 6) return { label, note: `only ${ids.length} in the chain` };

  if (shape === 'one') {
    // one service over the whole chain, all engines on it
    const cr = sim.createLine([ids[0], ids[1]], 'mixed');
    for (let i = 2; i < ids.length; i++) sim.addStop(cr.line.id, ids[i]);
    sim.setLineTrains(cr.line.id, engines);
  } else if (shape === 'three') {
    // three services covering the same chain, engines split between them
    const cuts = [[0, 1, 2], [2, 3, 4], [4, 5, 6, 7]].map((g) => g.map((i) => ids[i]).filter(Boolean));
    const per = Math.max(1, Math.floor(engines / 3));
    for (const g of cuts) {
      if (g.length < 2) continue;
      const cr = sim.createLine([g[0], g[1]], 'mixed');
      for (let i = 2; i < g.length; i++) sim.addStop(cr.line.id, g[i]);
      sim.setLineTrains(cr.line.id, per);
    }
  } else if (shape === 'three-specialised') {
    // same three services, but each run for a different traffic
    const cuts = [[0, 1, 2], [2, 3, 4], [4, 5, 6, 7]].map((g) => g.map((i) => ids[i]).filter(Boolean));
    const pols = ['passenger', 'freight', 'mixed'];
    const per = Math.max(1, Math.floor(engines / 3));
    cuts.forEach((g, k) => {
      if (g.length < 2) return;
      const cr = sim.createLine([g[0], g[1]], pols[k]);
      for (let i = 2; i < g.length; i++) sim.addStop(cr.line.id, g[i]);
      sim.setLineTrains(cr.line.id, per);
    });
  }

  const startT = sim.treasury;
  for (let w = 0; w < WEEKS; w++) for (let i = 0; i < 28; i++) sim.step(WEEK / 28);

  const loads = sim.lines.reduce((n, l) => n + (l.stats?.loads ?? 0), 0);
  const rev = sim.lines.reduce((n, l) => n + (l.stats?.revenue ?? 0), 0);
  const up = sim.lines.reduce((n, l) => n + (l.stats?.upkeep ?? 0), 0);
  const served = sim.sites.filter((x) => x.connected && !x.abandoned);
  const pros = served.length
    ? served.reduce((n, x) => n + x.prosperity, 0) / served.length : 0;
  // how much was lost to changing trains — the cost of splitting a route up
  const shortfalls = {};
  for (const st of sim.sites) {
    for (const [g, why] of Object.entries(st.why || {})) {
      if (why) shortfalls[why] = (shortfalls[why] || 0) + 1;
    }
  }
  const severed = sim.lines.filter((l) => l.severed).length;
  const destroyed = sim.links.filter((L) => L.destroyed || L.closed).length;
  return {
    label,
    severed, destroyed,
    lines: sim.lines.length,
    loadsWk: +loads.toFixed(1),
    revWk: +rev.toFixed(1),
    upkeepWk: +up.toFixed(1),
    netWk: +(rev - up).toFixed(1),
    prosperity: +pros.toFixed(1),
    treasuryDelta: Math.round(sim.treasury - startT),
    shortfalls,
  };
}

const ENGINES = 6;
console.log(`seed=${SEED}  weeks=${WEEKS}  engines=${ENGINES}  (same track in every arm)\n`);
const rows = [
  run('one long line', 'one', ENGINES),
  run('three short lines', 'three', ENGINES),
  run('three, specialised', 'three-specialised', ENGINES),
];

const pad = (s, n) => String(s).padEnd(n);
console.log(pad('shape', 22) + pad('lines', 6) + pad('loads/wk', 10)
  + pad('rev/wk', 9) + pad('upkeep', 8) + pad('net/wk', 9) + pad('prosp', 7) + 'treasury');
for (const r of rows) {
  if (r.note) { console.log(pad(r.label, 22) + r.note); continue; }
  console.log(pad(r.label, 22) + pad(r.lines, 6) + pad(r.loadsWk, 10)
    + pad(r.revWk, 9) + pad(r.upkeepWk, 8) + pad(r.netWk, 9)
    + pad(r.prosperity, 7) + pad(r.treasuryDelta, 10)
    + `severed ${r.severed}/${r.lines}, broken links ${r.destroyed}`);
}
console.log('\nwhy goods failed to arrive (count of site/good shortfall reasons):');
for (const r of rows) {
  if (r.note) continue;
  const s = Object.entries(r.shortfalls).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} x${v}`).join(', ');
  console.log(`  ${pad(r.label, 22)}${s || 'none'}`);
}
