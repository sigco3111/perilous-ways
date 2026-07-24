// Does the policy lever actually do anything?
//
// The player says they do not feel in control. A lever whose result cannot be
// measured is not control, and POLICIES used to touch only line CAPACITY — which is
// almost never the binding constraint — so setting a line to Freight changed
// nothing. This holds the network fixed and varies ONLY the policy, so the effect
// is isolated.
//
//   node tools/policycheck.mjs [seed] [weeks]

import { generateWorld } from '../src/world/worldgen.js';
import { createSim } from '../src/sim/sim.js';
import { createEvents } from '../src/sim/events.js';
import { WEEK, POLICY_KEYS } from '../src/sim/model.js';

const SEED = process.argv[2] || 'thrain';
const WEEKS = +(process.argv[3] || 20);

function run(policy) {
  const sim = createSim(generateWorld(SEED));
  sim.events = createEvents();
  sim.treasury = 900000;
  for (const k of Object.keys(sim.can)) sim.can[k] = true;
  sim.stock.engines = 12;
  sim.stock.cars = 3;

  // a star of short services off the biggest place — the shape a player converges on
  const hub = sim.sites.reduce((a, b) => ((b.pop || 0) > (a.pop || 0) ? b : a));
  let built = 0;
  for (const sp of sim.sites) {
    if (sp === hub || sp.abandoned || built >= 6) continue;
    const d = Math.hypot(hub.x - sp.x, hub.z - sp.z);
    if (d < 20 || d > 300) continue;
    const sv = sim.survey(hub.id, sp.id);
    if (!sv.ok) continue;
    const r = sim.build(sv);
    if (!r.ok) continue;
    const cr = sim.createLine([r.link.a, r.link.b], policy);
    if (cr.ok && sim.enginesFree() > 0) sim.setLineTrains(cr.line.id, 2);
    built++;
  }

  const t0 = sim.treasury;
  for (let w = 0; w < WEEKS; w++) for (let i = 0; i < 28; i++) sim.step(WEEK / 28);

  const loads = sim.lines.reduce((n, l) => n + (l.stats?.loads ?? 0), 0);
  const pax = sim.lines.reduce((n, l) => n + (l.stats?.pax ?? 0), 0);
  const rev = sim.lines.reduce((n, l) => n + (l.stats?.revenue ?? 0), 0);
  const served = sim.sites.filter((x) => x.connected && !x.abandoned);
  const pros = served.length ? served.reduce((n, x) => n + x.prosperity, 0) / served.length : 0;
  return {
    policy,
    lines: sim.lines.length,
    loads: +loads.toFixed(1),
    pax: +pax.toFixed(1),
    rev: +rev.toFixed(1),
    pros: +pros.toFixed(1),
    treasury: Math.round(sim.treasury - t0),
  };
}

console.log(`seed=${SEED}  weeks=${WEEKS}  (identical network, only the policy differs)\n`);
const pad = (s, n) => String(s).padEnd(n);
console.log(pad('policy', 12) + pad('lines', 6) + pad('loads/wk', 10)
  + pad('pax/wk', 9) + pad('rev/wk', 10) + pad('prosperity', 12) + 'treasury');
const rows = POLICY_KEYS.map(run);
for (const r of rows) {
  console.log(pad(r.policy, 12) + pad(r.lines, 6) + pad(r.loads, 10)
    + pad(r.pax, 9) + pad(r.rev, 10) + pad(r.pros, 12) + r.treasury);
}

// A lever must produce a spread wider than noise to be felt as a choice.
const spread = (k) => {
  const v = rows.map((r) => r[k]);
  const lo = Math.min(...v), hi = Math.max(...v);
  return lo === 0 ? (hi === 0 ? 0 : Infinity) : (hi - lo) / lo;
};
console.log('\nspread across policies (max-min)/min — a lever the player can feel:');
for (const k of ['loads', 'pax', 'rev', 'pros']) {
  const s = spread(k);
  const verdict = s === Infinity ? 'from zero' : `${(s * 100).toFixed(0)}%`;
  console.log(`  ${pad(k, 6)} ${pad(verdict, 12)}${s < 0.1 ? '  <-- too small to notice' : ''}`);
}
