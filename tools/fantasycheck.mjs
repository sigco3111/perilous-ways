// How much fantasy actually happens in a playthrough?
//
// The player said "the fantasy elements seem to be lost". A read of the code says
// the opposite — there are wizards, a dragon, a thing under the mountains, five
// peoples and eleven lands. Both are true: the content exists and almost none of it
// FIRES. This counts what a player would actually witness, so the fix can be
// measured rather than asserted.
//
//   node tools/fantasycheck.mjs [weeks] [seed...]
//
// Reports, per seed: how many register entries carry any fantasy at all, which
// set-piece threads fired, which lands were entered, and how many decisions were
// about the world rather than about money.

import { generateWorld, REGION_NAME } from '../src/world/worldgen.js';
import { createSim } from '../src/sim/sim.js';
import { createEvents } from '../src/sim/events.js';
import { KINDS, WEEK } from '../src/sim/model.js';

const WEEKS = +(process.argv[2] || 30);
// --rich funds the player and grants every capability. That separates two very
// different questions: "can a normal player AFFORD the fantasy" (no — a wall
// crossing is ten weeks of net income) and "do the gates fire AT ALL when money is
// no object". The second isolates gate bugs from balance, and is the one to fix first.
const RICH = process.argv.includes('--rich');
// --borrow lets the player raise money for a capital project it cannot fund from
// income, which is the whole reason LENDERS was added. The east costs ~1100cr
// against ~111cr/week of net income, so without credit the entire eastern half of
// the map — and with it the errand, the dragon, the orc trade and five of eleven
// lands — is unreachable in a game that ends around week 33.
const BORROW = process.argv.includes('--borrow');
const SEEDS = process.argv.slice(3).filter((a) => !a.startsWith('--'));
if (!SEEDS.length) SEEDS.push('eardon', 'thrain', 'marrow', 'wold', 'vurm');

// Words that only occur when something of the world is happening. Deliberately not
// "train", "line", "crowns" — the question is whether anything but paperwork occurs.
const FANTASY = new RegExp([
  'balrog', 'dragon', 'wyrm', 'warg', 'wight', 'barrow', 'goblin', 'orc', 'troll',
  'wizard', 'vurmath', 'elberic', 'grey', 'shadow', 'the east', 'omen', 'doom',
  'spell', 'rune', 'elvish', 'elves', 'haven', 'mithril', 'athelas', 'lore',
  'older power', 'deep', 'bore', 'gallery', 'door', 'sundering', 'peaks',
  'mirkholt', 'ashenreach', 'wrack', 'quays', 'onodrim', 'ent', 'star', 'moon',
  'sorcer', 'curse', 'blessing', 'prophec', 'ancient', 'ruin', 'tomb',
].join('|'), 'i');

/** The same plausible-not-clever player balance.mjs uses, trimmed to essentials. */
function play(seed) {
  const world = generateWorld(seed);
  const sim = createSim(world);
  sim.events = createEvents();
  if (RICH) {
    sim.treasury = 400000;
    for (const k of Object.keys(sim.can)) sim.can[k] = true;
    sim.stock.engines = 14;
  }

  const seen = { entries: 0, fantasy: 0, threads: new Set(), petitions: 0, charters: 0 };
  let read = 0;

  // count what the player is shown
  const drain = () => {
    while (read < sim.log.length) {
      const e = sim.log[read++];
      seen.entries++;
      if (FANTASY.test(String(e.text))) seen.fantasy++;
    }
  };
  // and which set pieces fired
  const firsts = new Set();

  for (let w = 0; w < WEEKS; w++) {
    // build the best-value affordable link each week
    let best = null;
    for (const a of sim.sites) {
      if (a.abandoned) continue;
      for (const b of sim.sites) {
        if (b === a || b.abandoned) continue;
        if (sim.linkBetween(a.id, b.id)) continue;
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        if (d < 20 || d > (RICH ? 900 : 340)) continue;
        // complementary trade scores high, as in balance.mjs
        const ka = KINDS[a.kind], kb = KINDS[b.kind];
        let v = 0;
        for (const g of Object.keys(ka.produce || {})) if (kb.need?.[g]) v += 2;
        for (const g of Object.keys(kb.produce || {})) if (ka.need?.[g]) v += 2;
        if (a.connected || b.connected) v *= 1.9;
        const score = (v + 1) / (d + 60);
        if (!best || score > best.score) best = { a, b, score };
      }
    }
    if (RICH) { sim.treasury = Math.max(sim.treasury, 40000); }
    if (best) {
      const sv = sim.survey(best.a.id, best.b.id);
      // cannot afford the thing worth building? raise the money, as a railway would
      if (BORROW && sv.ok && sv.price > sim.treasury) {
        for (const k of ['delvers', 'crown', 'havens']) {
          if (sim.treasury >= sv.price) break;
          const cap = sim.borrowingPower(k);
          if (cap >= 60) sim.borrow(k, Math.min(cap, sv.price - sim.treasury + 120));
        }
      }
      if (sv.ok && sv.price <= sim.treasury) {
        const r = sim.build(sv);
        if (r.ok) {
          const A = r.link.a, B = r.link.b;
          const on = sim.lines.find((l) => l.stops.includes(A) || l.stops.includes(B));
          if (on) sim.addStop(on.id, on.stops.includes(A) ? B : A);
          else {
            const cr = sim.createLine([A, B], 'mixed');
            if (cr.ok && sim.enginesFree() > 0) sim.setLineTrains(cr.line.id, 1);
          }
        }
      }
    }
    // take whatever is offered, so gated content gets its chance
    if (sim.charterOffer) { sim.takeCharter(sim.charterOffer[0].id); seen.charters++; }
    if (sim.pendingPetition) {
      const p = sim.pendingPetition;
      seen.petitions++;
      try { sim.answerPetition?.(p.id, (p.options?.[0]?.id) ?? 'accept'); } catch { /* shape varies */ }
      sim.pendingPetition = null;
    }
    for (let i = 0; i < 28; i++) sim.step(WEEK / 28);
    drain();
    for (const k of Object.keys(sim.firsts || {})) if (sim.firsts[k]) firsts.add(k);
  }
  drain();

  const lands = new Set();
  for (const L of sim.links) for (const r of L.regions || []) lands.add(REGION_NAME[r] || r);

  return {
    seed,
    week: sim.week,
    entries: seen.entries,
    fantasy: seen.fantasy,
    pct: seen.entries ? Math.round((100 * seen.fantasy) / seen.entries) : 0,
    firsts: [...firsts],
    lands: [...lands],
    deepestBore: +(sim.deepestBore ?? 0).toFixed(1),
    tunnels: sim.links.filter((L) => (L.tunnels ?? 0) > 0).length,
    shadow: Math.round(sim.shadow),
    age: sim.age,
    elvesGone: !!sim.elvesGone,
    dragon: !!sim._dragon,
    orcTrade: Math.round(sim.orcTradeTotal ?? 0),
    errand: sim.errand ? (sim.errand.state ?? 'issued') : 'none',
    over: sim.over || null,
    debtOwed: Math.round(sim.debtOwed ?? 0),
    debts: (sim.debts || []).length,
    petitions: seen.petitions,
    charters: seen.charters,
  };
}

const rows = SEEDS.map(play);
const pad = (s, n) => String(s).padEnd(n);

console.log(`fantasy audit — ${WEEKS} weeks, ${SEEDS.length} seeds\n`);
console.log(pad('seed', 9) + pad('entries', 8) + pad('fantasy', 9) + pad('%', 5)
  + pad('lands', 7) + pad('bore', 6) + pad('tun', 5) + pad('shd', 5) + pad('age', 5)
  + pad('errand', 9) + pad('debt', 7) + 'ending');
for (const r of rows) {
  console.log(pad(r.seed, 9) + pad(r.entries, 8) + pad(r.fantasy, 9) + pad(r.pct + '%', 5)
    + pad(r.lands.length, 7) + pad(r.deepestBore, 6) + pad(r.tunnels, 5)
    + pad(r.shadow, 5) + pad(r.age, 5) + pad(r.errand, 9) + pad(r.debtOwed, 7) + (r.over || '—'));
}

const any = (k) => rows.filter((r) => r[k]).length;
console.log('\nset pieces that fired at least once, across all seeds:');
const allFirsts = new Set(rows.flatMap((r) => r.firsts));
console.log('  ' + ([...allFirsts].join(', ') || '(none)'));
console.log('\nthreads:');
console.log(`  dragon woke        ${any('dragon')}/${rows.length}`);
console.log(`  elves left         ${any('elvesGone')}/${rows.length}`);
console.log(`  any tunnel built   ${rows.filter((r) => r.tunnels > 0).length}/${rows.length}`);
console.log(`  traded with orcs   ${rows.filter((r) => r.orcTrade > 0).length}/${rows.length}`);
console.log(`  errand dischargeable ${rows.filter((r) => r.errand === 'done').length}/${rows.length}`
  + `  (issued in ${rows.filter((r) => r.errand !== 'none').length})`);
const meanPct = Math.round(rows.reduce((n, r) => n + r.pct, 0) / rows.length);
const meanLands = (rows.reduce((n, r) => n + r.lands.length, 0) / rows.length).toFixed(1);
console.log(`\nmean fantasy share of the register: ${meanPct}%`);
console.log(`mean lands the railway ever entered: ${meanLands} of 11`);
console.log(`decisions about the world (petitions) per run: `
  + (rows.reduce((n, r) => n + r.petitions, 0) / rows.length).toFixed(1));
