// Does Age III actually happen, and does every answer to it terminate?
//
// DESIGN.md promised raids, refugee waves, an army moving at the speed of your best
// trunk line on your own track, and a choice between fortifying it, requisitioning it
// and tearing it up. None of it existed — a grep for raid|refugee|requisition found
// two unrelated hits — and `ENDINGS.survived` was unreachable because `s.over` was
// only ever set to errand/lost_errand/dismissed/shadow/concord.
//
// This plays the whole arc once per answer and asserts each one ends the game.
//
//   node tools/age3check.mjs [seed]

import { generateWorld } from '../src/world/worldgen.js';
import { createSim } from '../src/sim/sim.js';
import { createEvents, ENDINGS } from '../src/sim/events.js';
import { WEEK } from '../src/sim/model.js';

const SEED = process.argv[2] || 'eardon';
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ok    ${name}${extra ? '  ' + extra : ''}`); }
  else { fail++; console.log(`  FAIL  ${name}${extra ? '  ' + extra : ''}`); }
};

/** A realm with a real railway in it, ready for Age III. */
function realm() {
  const sim = createSim(generateWorld(SEED));
  sim.events = createEvents();
  sim.treasury = 99999;
  for (const k of Object.keys(sim.can)) sim.can[k] = true;
  sim.stock.engines = 16;
  for (let pass2 = 0; pass2 < 2; pass2++) {
    for (const d of sim.sites.filter((x) => !x.abandoned)) {
      let best = null;
      for (const o of sim.sites) {
        if (o === d || o.abandoned || sim.linkBetween(o.id, d.id)) continue;
        const dist = Math.hypot(o.x - d.x, o.z - d.z);
        if (dist < 20 || dist > 420) continue;
        const sv = sim.survey(o.id, d.id);
        if (sv.ok && (!best || sv.price < best.price)) best = { sv, price: sv.price };
      }
      if (!best) continue;
      const r = sim.build(best.sv);
      if (!r.ok) continue;
      const A = r.link.a, B = r.link.b;
      const on = sim.lines.find((l) => l.stops.includes(A) || l.stops.includes(B));
      if (on) sim.addStop(on.id, on.stops.includes(A) ? B : A);
      else {
        const cr = sim.createLine([A, B], 'mixed');
        if (cr.ok && sim.enginesFree() > 0) sim.setLineTrains(cr.line.id, 1);
      }
    }
  }
  return sim;
}

/** Run to the end, answering the host's petition with `answer`. */
function play(answer) {
  const sim = realm();
  const marks = { raid: 0, refugees: false, march: false, asked: false };
  // Scan by CONTENT each week, not by a monotonic index: s.log is capped at 220 and
  // shifts older entries off the front (sim.js s.note), so an index-based reader
  // silently skips whatever fell off. That is why an earlier version of this check
  // reported the host's arrival note missing when it had in fact been filed.
  const seenTexts = new Set();
  const scan = () => {
    for (const e of sim.log) {
      const t = String(e.text);
      const key = e.week + '|' + t.slice(0, 40);
      if (seenTexts.has(key)) continue;
      seenTexts.add(key);
      if (/is gone|was attacked/i.test(t)) marks.raid++;
      if (/coming west along the line/i.test(t)) marks.refugees = true;
      if (/host has come out of the east/i.test(t)) marks.march = true;
    }
  };
  for (let wk = 0; wk < 90 && !sim.over; wk++) {
    for (let i = 0; i < 28 && !sim.over; i++) sim.step(WEEK / 28);
    sim.treasury = Math.max(sim.treasury, 6000);   // solvency is not what is under test
    scan();
    if (sim.pendingPetition && sim.pendingPetition.id === 'the_host') {
      marks.asked = true;
      const p = sim.pendingPetition;
      const opt = p.options.find((o) => new RegExp(answer, 'i').test(o.label)) || p.options[0];
      opt.apply(sim);
      sim.pendingPetition = null;
      marks.chose = opt.label;
    }
  }
  return { sim, marks };
}

console.log(`Age III — seed ${SEED}\n`);

console.log('the arc happens at all:');
const base = play('fortify');
ok('raids hit remote sections', base.marks.raid > 0, `${base.marks.raid} raids`);
ok('a refugee wave arrives', base.marks.refugees);
ok('a host marches on the player\'s own road', base.marks.march);
ok('the Director is asked to choose', base.marks.asked, base.marks.chose || '');
ok('sections are taken as the host passes',
  base.sim.links.filter((L) => L.taken).length > 0,
  `${base.sim.links.filter((L) => L.taken).length} taken`);

console.log('\nevery answer terminates:');
for (const answer of ['fortify', 'requisition', 'tear up']) {
  const { sim, marks } = play(answer);
  const end = sim.over;
  ok(`"${answer}" ends the game`, !!end, end ? `-> ${end}` : 'STILL RUNNING at week ' + sim.week);
  if (end) {
    ok(`  its ending renders`, !!ENDINGS[end], ENDINGS[end] ? ENDINGS[end].title : 'NO SUCH ENDING');
    if (ENDINGS[end]) {
      let body = null;
      try { body = ENDINGS[end].body(sim); } catch (e) { body = null; }
      ok(`  its body does not throw`, typeof body === 'string' && body.length > 40,
        body ? `${body.split('\n')[0].slice(0, 60)}…` : 'THREW');
    }
  }
}

// Every ending must survive a bare simulation too — a crash here is the worst
// possible bug, because it lands the moment the player finishes the game.
console.log('\nevery ending renders against a bare realm:');
const bare = createSim(generateWorld(SEED));
bare.events = createEvents();
let bad = [];
for (const [id, e] of Object.entries(ENDINGS)) {
  try {
    const b = e.body(bare);
    if (typeof b !== 'string' || !b.length) bad.push(id + ' (empty)');
  } catch (err) { bad.push(`${id} (${err.message})`); }
}
ok('all endings render', bad.length === 0, bad.join(', '));

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
