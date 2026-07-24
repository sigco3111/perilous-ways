// Prints the Register as a player actually reads it: in order, one entry after
// another, for a real playthrough.
//
// Every previous voice check I wrote measured entries in ISOLATION — is this one
// good, does that one end on a joke. That is not the reading experience. The
// user's complaints have all been about the corpus in AGGREGATE: "stuff repeats
// a lot", "the language can get very llm-y", and the tic that only shows up when
// you see fifteen entries in a row and they all move the same way.
//
//   node tools/register.mjs [seed] [weeks]
//
// Read the output top to bottom. If you can hear the machinery, it is not fixed.

import { generateWorld } from '../src/world/worldgen.js';
import { createSim } from '../src/sim/sim.js';
import { createEvents } from '../src/sim/events.js';
import { WEEK } from '../src/sim/model.js';

const seed = process.argv[2] || 'eardon';
const WEEKS = +(process.argv[3] || 40);

const world = generateWorld(seed);
const sim = createSim(world);
sim.events = createEvents();

// Build outward from the start, cheapest useful link each time, so the sim
// generates a real spread of regions/cultures and therefore a real spread of
// voices. Deliberately not clever — this is a prose harness, not a balance one.
function grow() {
  // Bootstrap from ANY pair when nothing is connected yet — no settlement starts
  // connected, so a grower that only extends the network never lays the first rail,
  // and this harness spent a whole run reporting an empty railway's prose. (Also:
  // survey() returns `price`, not `cost`; the old check compared undefined.)
  const conn = sim.sites.filter((s) => s.connected && !s.abandoned);
  const from = conn.length ? conn : sim.sites.filter((s) => !s.abandoned);
  let best = null;
  for (const a of from) {
    for (const b of sim.sites) {
      if (b === a || b.abandoned || (conn.length && b.connected)) continue;
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d < 20 || d > 320) continue;
      const score = (b.pop || 20) / (d + 40);
      if (!best || score > best.score) best = { a, b, score };
    }
  }
  if (!best) return false;
  const route = sim.survey(best.a.id, best.b.id);
  if (!route || !route.ok) return false;
  if (route.price > sim.treasury) return false;
  const r = sim.build(route);
  if (!r || !r.ok) return false;
  // a line and an engine, or the track carries nothing and the prose never fires
  const A = r.link.a, B = r.link.b;
  const on = sim.lines.find((l) => l.stops.includes(A) || l.stops.includes(B));
  if (on) sim.addStop(on.id, on.stops.includes(A) ? B : A);
  else {
    const cr = sim.createLine([A, B], 'mixed');
    if (cr.ok && sim.enginesFree() > 0) sim.setLineTrains(cr.line.id, 1);
  }
  return true;
}

let seen = 0;
const forms = {}, voices = {};

let lastWeek = sim.week;
for (let st = 0; st < WEEKS * 28 + 40; st++) {
  sim.step(WEEK / 28);
  if (sim.week !== lastWeek) { lastWeek = sim.week; grow(); grow(); }
  while (seen < sim.log.length) {
    const e = sim.log[seen++];
    const text = typeof e === 'string' ? e : (e.text ?? e.body ?? JSON.stringify(e));
    const form = (e && e.form) || '—';
    const tone = (e && e.tone) || '';
    forms[form] = (forms[form] || 0) + 1;
    const id = (e && (e.entryId || e.id)) || '';
    console.log(`\n┄┄┄ wk${String(sim.week).padStart(3)}  ${form}${tone ? '/' + tone : ''}  ${id}`);
    console.log(String(text).split('\n').map((l) => '   ' + l).join('\n'));
  }
}

console.log('\n\n════════ forms drawn ════════');
for (const [f, n] of Object.entries(forms).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${f.padEnd(12)} ${n}`);
}
console.log(`  ${'TOTAL'.padEnd(12)} ${seen}`);
