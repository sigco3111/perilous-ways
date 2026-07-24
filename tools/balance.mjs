// Plays the game with a plausible-but-not-clever strategy and reports what
// happens week by week. The point is to find out whether the *loop* works:
// whether money is a real constraint, whether settlements grow, whether the
// Shadow arrives at a dramatic moment rather than a random one.
//
//   node tools/balance.mjs [seed] [weeks] [--quiet]

import { generateWorld } from '../src/world/worldgen.js';
import { createSim } from '../src/sim/sim.js';
import { createEvents, ENDINGS } from '../src/sim/events.js';
import { KINDS, GOOD_KEYS, TIER_NAME, WEEK } from '../src/sim/model.js';

const seed = process.argv[2] || 'eardon';
const WEEKS = +(process.argv[3] || 30);
const quiet = process.argv.includes('--quiet');

const world = generateWorld(seed);
const sim = createSim(world);
sim.events = createEvents();

// ---------------------------------------------------------------------------
// The player
// ---------------------------------------------------------------------------

/** How much would connecting these two help? Complementary trade scores high. */
function pairValue(a, b) {
  const ka = KINDS[a.kind], kb = KINDS[b.kind];
  let v = 0;
  for (const g of GOOD_KEYS) {
    const aProd = (ka.produce?.[g] ?? 0) + (ka.make?.out === g ? ka.make.rate : 0);
    const bNeed = (kb.need?.[g] ?? 0) + (kb.luxury?.[g] ?? 0);
    const bProd = (kb.produce?.[g] ?? 0) + (kb.make?.out === g ? kb.make.rate : 0);
    const aNeed = (ka.need?.[g] ?? 0) + (ka.luxury?.[g] ?? 0);
    v += Math.min(aProd, bNeed) + Math.min(bProd, aNeed);
  }
  // connecting into the existing network beats a stranded pair
  if (a.connected || b.connected) v *= 1.9;
  // ELFCARE: a player who notices that wine and lore lift prosperity everywhere,
  // and that the Elves are counting, values a haven far above its tonnage.
  if (process.argv.includes('--elfcare') && (a.culture === 'elf' || b.culture === 'elf')) v *= 6;
  const errGoal = sim.errand && sim.errand.state !== 'done' && sim.errand.state !== 'lost'
    ? sim.errand.to : null;
  // Mount Wrack IS an orc hold, so the usual "don't build to orcs" rule would veto the
  // one link the errand requires. Under orders, that rule does not apply to the
  // destination itself.
  const isGoalLink = errGoal !== null && (a.id === errGoal || b.id === errGoal);
  if ((a.culture === 'orc' || b.culture === 'orc') && !isGoalLink) {
    v *= sim.concession ? 1.4 : 0.02;
  }
  // THE ERRAND: a player handed the most important consignment in the world, plus a
  // draft that covers the road, builds towards Mount Wrack — and until this was here
  // the harness could not tell whether the errand was completable at all, because its
  // strategy scored purely on trade and would never lay a 1,100-crown link to an orc
  // hold. Without modelling it, "the errand never discharges" was ambiguous between a
  // broken mechanic and an incurious robot.
  const err = sim.errand;
  if (err && err.state !== 'done' && err.state !== 'lost') {
    const goal = sim.byId.get(err.to);
    if (goal) {
      const near = (p) => Math.hypot(p.x - goal.x, p.z - goal.z);
      const closer = Math.min(near(a), near(b));
      // strongest pull for links that actually approach the destination
      // Moderate: a player pursues the errand AND keeps the railway solvent. Pulling
      // too hard here models a monomaniac who bankrupts the realm chasing one parcel,
      // and then the balance flags describe the harness rather than the game.
      // --errandfirst models a player who has decided the consignment is the point
      // and builds toward Mount Wrack in preference to profit. Needed to answer
      // "is the good ending achievable at all", separately from "does an
      // economically-minded player stumble into it".
      const pull = process.argv.includes('--errandfirst') ? 4 : 1;
      v += pull * (isGoalLink ? 2600 : 700) / (closer + 120);
      // And the thing that actually blocked it: a link that JOINS the piece of network
      // holding the consignment to the piece holding the destination. Measured, both
      // ends were connected and there was still no route — the railway was in two
      // components. A real player reads "no run of rail joining the two" and closes it.
      const fromSide = (p) => !!sim.hopsTo(err.at, p.id) || p.id === err.at;
      const toSide = (p) => !!sim.hopsTo(err.to, p.id) || p.id === err.to;
      if ((fromSide(a) && toSide(b)) || (fromSide(b) && toSide(a))) v += 900;
    }
  }
  return v;
}

/** Greedy trail decomposition: cover every link with as few lines as possible. */
function rebuildLines() {
  const deg = new Map();
  const inc = new Map();
  for (const L of sim.links) {
    for (const id of [L.a, L.b]) {
      deg.set(id, (deg.get(id) || 0) + 1);
      if (!inc.has(id)) inc.set(id, []);
      inc.get(id).push(L);
    }
  }
  const used = new Set();
  const trails = [];
  const odd = [...deg.keys()].filter((k) => deg.get(k) % 2 === 1);
  const starts = odd.length ? odd : [...deg.keys()];
  for (const start of starts) {
    let cur = start;
    let trail = [cur];
    let moved = true;
    while (moved) {
      moved = false;
      for (const L of inc.get(cur) || []) {
        if (used.has(L.id)) continue;
        used.add(L.id);
        cur = L.a === cur ? L.b : L.a;
        trail.push(cur);
        moved = true;
        break;
      }
    }
    if (trail.length >= 2) trails.push(trail);
  }
  for (const L of sim.links) if (!used.has(L.id)) trails.push([L.a, L.b]);

  // Split long trails: one enormous snake through the whole network gives every
  // train a colossal circuit and therefore almost no useful frequency.
  const MAX_STOPS = 6;
  const chopped = [];
  for (const t of trails) {
    if (t.length <= MAX_STOPS) { chopped.push(t); continue; }
    for (let i = 0; i < t.length - 1; i += MAX_STOPS - 1) {
      const piece = t.slice(i, Math.min(t.length, i + MAX_STOPS));
      if (piece.length >= 2) chopped.push(piece);
    }
  }
  sim.lines.length = 0;
  for (const t of chopped) sim.createLine(t, 'mixed');

  // spread the engines over the lines, longest first
  const order = sim.lines.slice().sort((p, q) => q.stops.length - p.stops.length);
  for (const l of order) sim.setLineTrains(l.id, 0);
  const want = new Map(order.map((l) => [l.id, 0]));
  let left = sim.enginesFree();
  let pass = 0;
  while (left > 0 && pass < 40) {
    for (const l of order) {
      if (left <= 0) break;
      want.set(l.id, want.get(l.id) + 1);
      left--;
    }
    pass++;
  }
  // allocate through the proper channel, so line.trains and the roster agree
  for (const l of order) sim.setLineTrains(l.id, want.get(l.id));
}

const CHARTER_PREF = ['delvers', 'bridgewrights', 'stock', 'carriages', 'grant',
  'survey', 'swift', 'interchange', 'causeway', 'greatspan', 'wardens',
  'foresters', 'beacons', 'concession'];

function playWeek() {
  // answer any petition, picking the first option (a stand-in for a player)
  if (sim.pendingPetition) {
    const p = sim.pendingPetition;
    // The sim's own seeded rng, NOT Math.random. With Math.random here the harness
    // answered petitions differently every run, so two identical invocations could
    // disagree about whether the game was balanced — one reported "served prosperity
    // only 46.2" and the next reported no problems at all. A verdict that flips is
    // worse than no verdict, because it gets believed half the time.
    const choice = p.options[Math.floor(sim.rng() * p.options.length)];
    choice.apply(sim);
    sim.pendingPetition = null;
  }

  // Make good what has been broken. A player whose railway is cut repairs it —
  // especially the section the errand needs — and without this the Age III raids
  // permanently severed the eastern road, the consignment never went, and the game's
  // one good ending stayed unreachable for a reason that had nothing to do with the
  // player's judgement. Also the only exercise `s.repair` gets.
  {
    const broken = sim.links.filter((L) => L.destroyed || L.closed);
    if (broken.length) {
      // the errand's road first, then whatever is cheapest
      const goalId = sim.errand && sim.errand.state !== 'done' ? sim.errand.to : null;
      broken.sort((a, b) => {
        const ga = goalId !== null && (a.a === goalId || a.b === goalId) ? 0 : 1;
        const gb = goalId !== null && (b.a === goalId || b.b === goalId) ? 0 : 1;
        return ga - gb || sim.worksPrice.repair(a) - sim.worksPrice.repair(b);
      });
      for (const L of broken) {
        if (sim.worksPrice.repair(L) > sim.treasury * 0.5) continue;
        if (sim.repair(L.id).ok) break;       // one a week, as a gang would
      }
    }
  }

  // take a charter if one is on the table
  if (sim.charterOffer) {
    const offer = sim.charterOffer;
    let best = offer[0];
    let bestRank = 99;
    for (const c of offer) {
      const r = CHARTER_PREF.indexOf(c.id);
      if (r >= 0 && r < bestRank) { bestRank = r; best = c; }
    }
    sim.takeCharter(best.id);
  }

  // spend on improvements once there is money spare: double whatever is at
  // capacity, then ease and arm the busiest services
  if (sim.treasury > 1200) {
    for (const b of sim.bottlenecks(3)) {
      const L = sim.links.find((x) => x.id === b.id);
      if (L && !L.doubled && sim.worksPrice.double(L) < sim.treasury * 0.4) sim.doubleTrack(L.id);
    }
  }
  if (sim.treasury > 2600) {
    const busiest = sim.lines.slice().sort((a, b) => (b.stats?.loads || 0) - (a.stats?.loads || 0))[0];
    if (busiest) {
      for (const id of new Set(sim.lineLinks(busiest) || [])) {
        if (sim.treasury > 1800) sim.regrade(id);
        if (sim.treasury > 2400) sim.fortify(id);
      }
    }
  }
  if (sim.treasury > 1800) {
    const big = sim.sites.filter((x) => x.connected && !x.abandoned && (x.works || 0) < 3)
      .sort((a, b) => b.pop - a.pop)[0];
    if (big && sim.worksPrice.station(big) < sim.treasury * 0.25) sim.stationWorks(big.id);
  }

  // build up to three links a week, best value per crown, if affordable
  for (let attempt = 0; attempt < 3; attempt++) {
    const live = sim.sites.filter((x) => !x.abandoned);
    let best = null;
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i], b = live[j];
        if (sim.linkBetween(a.id, b.id)) continue;
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        if (d > 340) continue;                       // don't survey the absurd
        const v = pairValue(a, b);
        if (v <= 0.2) continue;
        if (best && v / d < best.score) continue;
        const sv = sim.survey(a.id, b.id);
        if (!sv.ok || sv.price > sim.treasury * 0.85) continue;
        const score = v / Math.max(40, sv.price);
        if (!best || score > best.score) best = { sv, score, a, b };
      }
    }
    if (!best) break;
    const r = sim.build(best.sv);
    if (!r.ok) break;
    rebuildLines();
  }
  rebuildLines();
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const hist = [];
const DAY = WEEK / 7;
let lastWeek = 0;

if (!quiet) {
  console.log(`seed=${seed}  sites=${sim.sites.length}  start treasury=${Math.round(sim.treasury)}`);
  console.log('wk  treas  pros srvd  conc  shad  age  conn  links  eng   loads  inc  tiers            can');
}

playWeek();
for (let step = 0; step < WEEKS * 7 * 4 + 40; step++) {
  sim.step(DAY / 4);
  if (sim.week !== lastWeek) {
    lastWeek = sim.week;
    playWeek();
    const tiers = [0, 0, 0, 0, 0];
    for (const st of sim.sites) if (!st.abandoned) tiers[st.tier]++;
    const snap = sim.snapshot();
    hist.push({ ...snap, tiers: tiers.slice() });
    if (!quiet) {
      const can = Object.entries(sim.can).filter(([, v]) => v).map(([k]) => k[0]).join('');
      console.log(
        String(snap.week).padStart(2) +
        String(snap.treasury).padStart(8) +
        String(snap.prosperity.toFixed(0)).padStart(5) +
        String(snap.prosperityServed.toFixed(0)).padStart(5) +
        String(snap.concord.toFixed(0)).padStart(6) +
        String(snap.shadow.toFixed(0)).padStart(6) +
        String(snap.age).padStart(5) +
        String(snap.connected).padStart(6) +
        String(snap.links).padStart(7) +
        String(snap.engines).padStart(6) +
        String(snap.loads).padStart(8) +
        String(snap.incidents).padStart(5) +
        '  ' + tiers.join('/').padEnd(16) +
        ' ' + can,
      );
    }
    if (sim.week > WEEKS) break;
  }
}

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------

const last = hist[hist.length - 1] || {};
const mid = hist[Math.floor(hist.length / 2)] || {};
const problems = [];

const treas = hist.map((h) => h.treasury);
const minT = Math.min(...treas), maxT = Math.max(...treas);
if (minT > 600) problems.push(`money never tight (min treasury ${minT}) — building is too cheap or income too high`);
if (maxT > 12000) problems.push(`treasury runaway (max ${maxT}) — income outpaces anything to spend it on`);
const netPerWeek = (sim.stats.fares + sim.stats.grants - sim.stats.upkeepPaid) / hist.length;
if (netPerWeek < 90) problems.push(`net income only ${netPerWeek.toFixed(0)}/week — saving for the Peaks (~1400cr) would take forever`);
// Gross income is the wrong test for "money stopped mattering": a strong player
// earns a lot and spends nearly all of it on expansion. What actually indicates
// an unconstrained late game is a treasury that just sits there and climbs.
const lateThird = hist.slice(Math.floor(hist.length * 0.66)).map((h) => h.treasury);
const lateMin = lateThird.length ? Math.min(...lateThird) : 0;
if (lateMin > 4000) problems.push(`treasury never dipped below ${lateMin} in the last third — nothing left worth buying`);
// Judge the ECONOMY at its height, not at the end of an apocalypse. Age III now
// genuinely degrades the realm — raids destroy sections, refugees drag prosperity at
// both ends of the wave — so reading the last week of a 40-week run and calling a
// decline "the trade loop is not paying off" measures the drama, not the economy.
// The peak says whether trade works; the decline is reported separately, because a
// realm that does NOT decline in Age III would mean the Muster has no teeth.
const peakServed = hist.reduce((m, h) => Math.max(m, h.prosperityServed ?? 0), 0);
if (peakServed < 55) {
  problems.push(`served prosperity peaked at only ${peakServed} — the trade loop is not paying off`);
}
const age3 = hist.find((h) => h.age >= 3);
if (age3) {
  const decline = Math.round(peakServed - last.prosperityServed);
  console.log(`\nAge III: entered week ${age3.week}, served prosperity `
    + `${peakServed} -> ${last.prosperityServed} (${decline >= 0 ? '-' : '+'}${Math.abs(decline)})`);
  if (decline <= 0) problems.push('Age III cost the realm nothing — the Muster has no teeth');
}
if (last.tiers && last.tiers[2] + last.tiers[3] + last.tiers[4] < 2) problems.push('almost nothing grew past village — growth curve too slow');
if (last.tiers && last.tiers[4] > 8) problems.push('everything became a great city — growth curve too fast');
if (!sim.can.tunnel) problems.push('never got the Delvers’ Charter — the Peaks were never crossed');
if (last.shadow > 99 && last.week < WEEKS * 0.7) problems.push('Shadow maxed far too early');
if (last.shadow < 30) problems.push(`Shadow only reached ${last.shadow} in ${WEEKS} weeks — Age III never arrives`);
if (last.age < 2) problems.push('never reached Age II');
if (last.age < 3 && WEEKS >= 28) problems.push(`never reached Age III (shadow ${last.shadow})`);
if (sim.elvesGone) problems.push('the Elves left — check whether that was avoidable or automatic');
if (sim.stats.incidents === 0) problems.push('no incidents at all in the whole run');
if (sim.stats.incidents > WEEKS * 3) problems.push(`incident spam (${sim.stats.incidents} in ${WEEKS} weeks)`);
if (last.connected < sim.sites.length * 0.4) problems.push(`only ${last.connected}/${sim.sites.length} settlements ever connected`);

console.log('\n--- verdict -------------------------------------------------');
console.log(`weeks ${hist.length}  treasury ${minT}..${maxT}  loads ${Math.round(sim.stats.loadsMoved)}`);
console.log(`net/week ${netPerWeek.toFixed(0)}  fares ${Math.round(sim.stats.fares)}  grants ${Math.round(sim.stats.grants)}  upkeep ${Math.round(sim.stats.upkeepPaid)}  built ${Math.round(sim.stats.built)}`);
console.log(`regard ${Object.entries(sim.regard).map(([k, v]) => k.slice(0, 2) + ':' + v.toFixed(0)).join(' ')}  elvesGone=${sim.elvesGone}`);
console.log(`charters: ${Object.entries(sim.can).filter(([, v]) => v).map(([k]) => k).join(', ')} | engines ${sim.stock.engines} cars ${sim.stock.cars} speed ${sim.stock.speed.toFixed(2)}`);
const top = sim.sites.filter((x) => !x.abandoned).sort((a, b) => b.pop - a.pop).slice(0, 6);
console.log('largest: ' + top.map((x) => `${x.name} ${TIER_NAME[x.tier]} ${Math.round(x.pop)}`).join(' | '));
if (problems.length) { console.log('\nPROBLEMS:'); for (const p of problems) console.log('  * ' + p); }
else console.log('\nno structural problems detected');

// ── the fantasy audit ──────────────────────────────────────────────────────
// The player's most serious complaint was "the fantasy elements seem to be lost",
// and the content is all present — it simply does not fire. This reports what a
// playthrough actually WITNESSED, so the gates can be tuned against a number. Run
// with --fantasy. It reuses the validated player above rather than a second, worse
// one: my first attempt wrote its own greedy builder, which collapsed concord by
// week 19 in four seeds out of five and could not measure anything.
if (process.argv.includes('--fantasy')) {
  const lands = new Set();
  for (const L of sim.links) for (const r of L.regions || []) lands.add(r);
  const fired = Object.entries(sim.firsts || {}).filter(([, v]) => v).map(([k]) => k);
  const east = sim.links.filter((L) => {
    const a = sim.byId.get(L.a), b = sim.byId.get(L.b);
    return a && b && (a.culture === 'orc' || b.culture === 'orc');
  }).length;
  console.log('\n--- fantasy audit -------------------------------------------');
  console.log(`lands entered      ${lands.size} of 11`);
  console.log(`set pieces fired   ${fired.length ? fired.join(', ') : '(none)'}`);
  console.log(`tunnels built      ${sim.links.filter((L) => (L.tunnels ?? 0) > 0).length}`
    + `   deepest bore under the Peaks ${(sim.deepestBore ?? 0).toFixed(1)} (balrog needs >24)`);
  console.log(`links to the orcs  ${east}   orc tonnage ${Math.round(sim.orcTradeTotal ?? 0)}`);
  console.log(`dragon woke        ${!!sim._dragon}`);
  if (sim.errand) {
    const A = sim.byId.get(sim.errand.at), B = sim.byId.get(sim.errand.to);
    const h = sim.hopsTo(sim.errand.at, sim.errand.to);
    console.log(`the errand         ${sim.errand.state} progress ${(sim.errand.progress ?? 0).toFixed(2)}`);
    console.log(`  at ${A ? A.name : '?'} (connected ${A ? A.connected : '?'})`
      + ` -> ${B ? B.name : '?'} (connected ${B ? B.connected : '?'})`
      + `  route: ${h ? h.hops.length + ' hops' : 'NONE'}`);
  } else console.log('the errand         never issued');
  console.log(`shadow             ${Math.round(sim.shadow)} at week ${sim.week}, age ${sim.age}`);
  console.log(`debts raised       ${(sim.debts || []).length} outstanding, ${Math.round(sim.debtOwed ?? 0)} owed`);
  console.log(`ending             ${sim.over || '(still running)'}`);
}

// ── the annual reports ─────────────────────────────────────────────────────
// The register's throughline: once a year the Authority accounts for itself in
// facts from this run, set against last year's. Read these top to bottom — if they
// do not read as the history of a particular railway, the feature has failed.
// Uses the validated player above rather than a hand-rolled builder: five separate
// times now, a bespoke probe has failed to build anything and made a working
// feature look broken.
if (process.argv.includes('--annals')) {
  const reports = sim.log.filter((e) => /ANNUAL REPORT/.test(String(e.text)));
  console.log(`\n--- annual reports (${reports.length} filed) ---`);
  for (const e of reports) {
    console.log(`\n════ week ${e.week} ════`);
    console.log(String(e.text));
  }
}

// ── the chronicle ──────────────────────────────────────────────────────────
// Every entry the sim marked `chronicle: true` — the milestones, the losses, the
// annual reports, the errand. Read top to bottom this is the STORY of the run, and
// it is the thing to judge when asking whether the register reveals a story or just
// files paragraphs. If it reads as a sequence of unrelated vignettes, it has failed.
if (process.argv.includes('--story')) {
  console.log(`\n--- the chronicle (${sim.chronicle.length} entries) ---`);
  for (const e of sim.chronicle) {
    console.log(`\n════ week ${e.week} ${e.tone ? '· ' + e.tone : ''}`);
    console.log(String(e.text));
  }
}
