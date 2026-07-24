// The simulation.
//
// Runs on an explicit step() so it can be driven at any rate, including flat out
// with no renderer attached — which is how the balance tests work.
//
// Order of business each simulated day:
//   1. rebuild the graph if the network changed
//   2. solve goods flow over it (greedy, nearest-first, capacity-limited)
//   3. manufacture, consume, and settle satisfaction
//   4. move prosperity and population, promote and demote tiers
//   5. money in, money out
//   6. concord, and the Shadow
//   7. offer the event engine a turn

import { GOODS, GOOD_KEYS, VALUE, KINDS, CULTURES, CHARTERS, TIER_MULT, TIER_POP, TIER_UP, TIER_DOWN, GREAT_CITY_LUXURY, TIER_NAME, WEEK, DAY, BASE_SPEED, CAR_LOADS,
  POLICIES, FARES, WARDEN_COST, LENDERS } from './model.js';
import { surveyLink, WORKS, UPKEEP } from './route.js';
import { makeRng, clamp, lerp } from '../rng.js';
import { ENGINE_CLASSES, createFleet, STYLE_FOR_POLICY } from './fleet.js';
import { createCommissions, priceOf } from './commissions.js';
import { REGION, REGION_LORE, TRAITS, TRAIT_KEYS, NAMES, FOUNDABLE,
  CULTURE_OF_KIND } from '../world/worldgen.js';

const LINE_COLOURS = [
  { hex: '#c94f3d', name: 'Vermilion' },
  { hex: '#3f7fc4', name: 'Indigo' },
  { hex: '#4f9a52', name: 'Verdant' },
  { hex: '#d9a13a', name: 'Ochre' },
  { hex: '#8d5aa8', name: 'Murrey' },
  { hex: '#3fa8a0', name: 'Celadon' },
  { hex: '#c4708f', name: 'Damask' },
  { hex: '#7a6a54', name: 'Drab' },
];

export function createSim(world, opts = {}) {
  const rng = makeRng(world.seed + ':sim');

  const s = {
    world,
    seed: world.seed,
    t: 0,              // seconds of simulated time
    week: 1,
    dayCount: 0,
    age: 1,
    over: null,        // null while playing; otherwise an ending id

    treasury: opts.treasury ?? 420,
    debtWeeks: 0,

    // capabilities and modifiers, all mutated by charters
    can: { bridge: true, span: false, causeway: false, tunnel: false },
    stock: { engines: 3, cars: 2, speed: 1.0 },
    buildDiscount: 1.0,
    grantBonus: 0,
    perilGuard: 0,
    clearRate: 1.0,
    woodCare: 0,
    transferLoss: 0.12,
    concession: false,
    buildSpendWeek: 0,
    elfDespair: 0,

    shadow: 0,         // 0..100
    treesFelled: 0,
    smokeIndex: 0,     // industry pressure, drives elvish displeasure
    orcTradeTotal: 0,

    regard: { halfling: 62, dwarf: 55, elf: 66, men: 58, orc: 8 },
    elvesGone: false,

    sites: [],
    byId: new Map(),
    links: [],         // built track between two sites
    linkKey: new Map(),
    lines: [],         // named services over the track
    trains: [],

    // rolling records for the UI and the chronicle
    log: [],
    chronicle: [],
    annals: [],              // one snapshot per year, for the annual report
    stats: {
      loadsMoved: 0, fares: 0, grants: 0, upkeepPaid: 0, built: 0,
      incidents: 0, peakProsperity: 0, abandoned: 0, longestLine: 0,
    },
    engines: [],             // the fleet, as individuals with names and histories
    commissions: [],         // what the realm is asking the Authority to move
    firsts: {},              // milestone id -> the week it happened
    charterOffer: null,
    debts: [],
    nextDebtId: 1,
    havenBond: false,
    crownFavours: 0,
    pendingPetition: null,
    flowLast: [],      // per-good movement records, for the trade panel
    congestion: new Map(),

    events: null,      // installed by events.js
    rng,
  };

  /** Wrap a bare worldgen site in the fields the simulation needs. */
  /**
   * Fold a settlement's traits into numbers the simulation reads.
   *
   * This loop existed twice, character for character, and eight of the twenty traits
   * carried a label and no field at all — so a third of the gazetteer was decoration.
   * One implementation now, and every field below is consumed somewhere.
   */
  function applyTraits(st) {
    st.traitMods = {
      produce: {}, pax: 1, luxury: 1, smoke: 1, plague: 1, perilNear: 0,
      buildFrom: 1,      // cost multiplier for track touching this place
      wardsNear: 0,      // peril this place takes OFF nearby track
      regardWeight: 1,   // how hard its people feel what happens here
      toll: 0,           // crowns a week, once it is connected
      omen: 0,           // what it adds to the Shadow, weekly
      shameful: 0,       // what serving it costs in the regard of everyone else
      freezes: false,    // shut for part of every winter
      elfCare: 0,        // the Elves count this place a kindness
    };
    for (const key of st.traits || []) {
      const t = TRAITS[key];
      if (!t) continue;
      for (const [g, m] of Object.entries(t.produce || {})) {
        st.traitMods.produce[g] = (st.traitMods.produce[g] || 1) * m;
      }
      if (t.pax) st.traitMods.pax *= t.pax;
      if (t.luxury) st.traitMods.luxury *= t.luxury;
      if (t.smoke) st.traitMods.smoke *= t.smoke;
      if (t.plagueProne) st.traitMods.plague *= t.plagueProne;
      if (t.perilNear) st.traitMods.perilNear += t.perilNear;
      if (t.buildFrom) st.traitMods.buildFrom *= t.buildFrom;
      if (t.wardsNear) st.traitMods.wardsNear += t.wardsNear;
      if (t.regardWeight) st.traitMods.regardWeight *= t.regardWeight;
      if (t.toll) st.traitMods.toll += t.toll;
      if (t.omen) st.traitMods.omen += t.omen;
      if (t.shameful) st.traitMods.shameful += t.shameful;
      if (t.elfCare) st.traitMods.elfCare += t.elfCare;
      if (t.freezes) st.traitMods.freezes = true;
    }
  }

  function dressSite(site, rngLocal) {
    const k = KINDS[site.kind];
    const st = {
      ...site,
      pop: TIER_POP[site.tier] * rngLocal.range(0.85, 1.15),
      prosperity: site.kind === 'hold' ? 34 : 40,
      satisfaction: 0.35,
      stock: {}, supply: {}, demand: {}, got: {},
      connected: false, unrest: 0, abandoned: false, quarantined: false,
      plague: 0, lastGrew: 0, luxury: 0, exports: 0, imports: 0,
      culture: k.culture,
    };
    for (const g of GOOD_KEYS) { st.stock[g] = 0; st.supply[g] = 0; st.demand[g] = 0; st.got[g] = 0; }
    st.metOf = {};
    st.fled = 0;      // how much of this place has gone west
    st.refuge = 0;    // how many other people's it is now feeding
    applyTraits(st);
    return st;
  }
  s.dressSite = dressSite;


  // ---- settlements ------------------------------------------------------
  for (const site of world.sites) {
    const st = dressSite(site, rng);
    s.sites.push(st);
    s.byId.set(st.id, st);
  }
  if (false) for (const site of world.sites) {
    const k = KINDS[site.kind];
    const st = {
      ...site,
      pop: TIER_POP[site.tier] * rng.range(0.85, 1.15),
      prosperity: site.kind === 'hold' ? 34 : 40,
      satisfaction: 0.35,
      stock: {},          // goods on hand
      supply: {},         // produced this week
      demand: {},         // wanted this week
      got: {},            // received this week
      connected: false,
      unrest: 0,
      abandoned: false,
      quarantined: false,
      plague: 0,
      lastGrew: 0,
      luxury: 0,
      exports: 0,
      imports: 0,
      culture: k.culture,
    };
    for (const g of GOOD_KEYS) { st.stock[g] = 0; st.supply[g] = 0; st.demand[g] = 0; st.got[g] = 0; }
    // fold the local character into the numbers
    st.metOf = {};          // good -> rolling fraction of daily need met
    st.fled = 0;
    st.refuge = 0;
    applyTraits(st);
    s.sites.push(st);
    s.byId.set(st.id, st);
  }

  // the starting shed
  s.comm = createCommissions();
  s.fleet = createFleet(world.seed);
  /**
   * Who will sell the Authority a locomotive.
   *
   * Both build sites passed the literal 'dwarf', so every engine in the game was the
   * same locomotive — while three complete, finished classes (Men's plain painted
   * boxy thing, the Elves' verdigris-over-birch with no chimney at all, and whatever
   * the orcs call a machine) sat in trains.js as dead code. That is the whole of
   * "the trains don't feel like different trains": there was only ever one train.
   *
   * Which builders will deal with you depends on their regard, so the shed fills up
   * with the fleet your diplomacy has earned — and `fleet.nameFor` already names
   * each builder's engines in its own register. Deliberately arithmetic rather than
   * random: adding an rng draw here would shift every seeded run downstream.
   */
  const builderFor = (i) => {
    const open = [
      { style: 'dwarf', score: (s.regard.dwarf ?? 50) + 25 },
      { style: 'men', score: (s.regard.men ?? 50) + 15 },
      { style: 'elf', score: (s.regard.elf ?? 50) - 10 },
      { style: 'orc', score: (s.regard.orc ?? 0) - 45 },
    ].filter((b) => b.score > 20 && !(b.style === 'elf' && s.elvesGone));
    if (!open.length) return 'dwarf';
    open.sort((a, b) => b.score - a.score);
    // the best-regarded builder supplies most of the fleet, but not all of it
    const pool = [];
    open.forEach((b, k) => { for (let n = open.length - k; n > 0; n--) pool.push(b.style); });
    return pool[i % pool.length];
  };
  s.builderFor = builderFor;

  for (let i = 0; i < s.stock.engines; i++) s.engines.push(s.fleet.build(builderFor(i), 1));


  installMethods(s);
  return s;
}

// ---------------------------------------------------------------------------

function installMethods(s) {
  const { world } = s;

  // ---- the rail graph ---------------------------------------------------
  let graphDirty = true;
  let adj = new Map();            // siteId -> [{to, linkId, time, length}]
  let pathCache = new Map();      // "a>b" -> { hops:[linkId], time, length, transfers }

  s.markDirty = () => { graphDirty = true; pathCache.clear(); };

  const keyOf = (a, b) => (a < b ? `${a}>${b}` : `${b}>${a}`);

  s.linkBetween = (a, b) => s.linkKey.get(keyOf(a, b)) ?? null;

  function rebuildGraph() {
    adj = new Map();
    for (const st of s.sites) adj.set(st.id, []);
    for (const L of s.links) {
      if (L.closed || L.destroyed) continue;
      const a = s.byId.get(L.a), b = s.byId.get(L.b);
      if (!a || !b || a.abandoned || b.abandoned) continue;
      // travel time in seconds at the current fleet speed
      const time = (L.length * (L.regrade || 1)) / (BASE_SPEED * s.stock.speed);
      adj.get(L.a).push({ to: L.b, linkId: L.id, time, length: L.length });
      adj.get(L.b).push({ to: L.a, linkId: L.id, time, length: L.length });
    }
    for (const st of s.sites) st.connected = (adj.get(st.id) || []).length > 0;
    graphDirty = false;
  }

  /** Dijkstra from one site over the current graph. Cached per day. */
  function pathsFrom(originId) {
    if (graphDirty) rebuildGraph();
    const cacheKey = `#${originId}`;
    if (pathCache.has(cacheKey)) return pathCache.get(cacheKey);

    const dist = new Map(), prev = new Map(), prevLink = new Map();
    dist.set(originId, 0);
    // small graphs (<60 nodes); a sorted-insert frontier is plenty
    const frontier = [{ id: originId, d: 0 }];
    const done = new Set();
    while (frontier.length) {
      frontier.sort((p, q) => p.d - q.d);
      const cur = frontier.shift();
      if (done.has(cur.id)) continue;
      done.add(cur.id);
      for (const e of adj.get(cur.id) || []) {
        const nd = cur.d + e.time;
        if (nd < (dist.get(e.to) ?? Infinity)) {
          dist.set(e.to, nd);
          prev.set(e.to, cur.id);
          prevLink.set(e.to, e.linkId);
          frontier.push({ id: e.to, d: nd });
        }
      }
    }
    const out = { dist, prev, prevLink };
    pathCache.set(cacheKey, out);
    return out;
  }

  /** The hop list from origin to target, or null. */
  function hopsTo(originId, targetId) {
    const { dist, prev, prevLink } = pathsFrom(originId);
    if (!dist.has(targetId)) return null;
    const hops = [];
    let cur = targetId, guard = 0;
    while (cur !== originId && guard++ < 200) {
      hops.push(prevLink.get(cur));
      cur = prev.get(cur);
      if (cur === undefined) return null;
    }
    return { hops, time: dist.get(targetId), transfers: Math.max(0, hops.length - 1) };
  }
  s.hopsTo = hopsTo;
  s.pathsFrom = pathsFrom;

  // ---- building ---------------------------------------------------------

  /** Price a link without committing to it. */
  s.survey = (aId, bId, opts = {}) => {
    const a = s.byId.get(aId), b = s.byId.get(bId);
    if (!a || !b || a.id === b.id) return { ok: false, reason: 'pick two different places' };
    if (s.linkBetween(aId, bId)) return { ok: false, reason: 'already built' };
    const existing = new Set();
    for (const L of s.links) for (const c of L.cells) existing.add(c);
    const r = surveyLink(world, a, b, s.can, {
      existing,
      avoidWood: s.woodCare * 14,
      riskAversion: opts.riskAversion ?? 0.7,
    });
    if (!r.ok) return r;
    // The ends of a route price it too: an old road is half-made already, and a hedge
    // nobody has mapped costs the surveyors a fortnight. `old_road`'s discount and
    // `hedge_maze` were both dead fields until now.
    const endMul = ((a.traitMods?.buildFrom ?? 1) + (b.traitMods?.buildFrom ?? 1)) / 2;
    r.price = Math.round(r.cost * s.buildDiscount * endMul);
    r.affordable = r.price <= s.treasury;
    return r;
  };

  /** Commit a surveyed link. */
  s.build = (survey) => {
    if (!survey || !survey.ok) return { ok: false, reason: 'nothing surveyed' };
    if (survey.price > s.treasury) return { ok: false, reason: 'the Authority cannot pay for it' };
    const a = s.byId.get(survey.a), b = s.byId.get(survey.b);
    if (s.linkBetween(survey.a, survey.b)) return { ok: false, reason: 'already built' };

    const L = {
      id: s.links.length + 1,
      a: survey.a, b: survey.b,
      pts: survey.pts, deck: survey.deck, ground: survey.ground, step: survey.step,
      spans: survey.spans, kinds: survey.kinds, cells: survey.cells,
      length: survey.length, peril: survey.peril,
      upkeep: survey.upkeep, tunnels: survey.tunnels, piers: survey.piers,
      closed: 0, destroyed: false, hp: 1,
      builtWeek: s.week,
    };
    // Which lands this line passes through, and what those lands do to it.
    const regionsOn = new Set();
    for (let i = 0; i < survey.pts.length; i += 2) {
      regionsOn.add(world.regionAt(survey.pts[i].x, survey.pts[i].z));
    }
    L.regions = [...regionsOn];
    L.nocturnal = regionsOn.has(REGION.BARROWDOWNS);      // incidents only after dark
    L.decays = regionsOn.has(REGION.MIRKHOLT) ? 0.011 : 0; // upkeep creeps up
    L.sinks = survey.spans.some((sp) => sp.kind === 'causeway')
      && regionsOn.has(REGION.WEEPING) ? 0.020 : 0;        // the Marsh takes it back
    // A place with a hard winter shuts its own road, wherever it stands.
    L.freezes = regionsOn.has(REGION.FROSTMARCH)
      || !!a.traitMods?.freezes || !!b.traitMods?.freezes;
    // What the ends of this link do to how dangerous it is: a barrow raises it, a
    // watchfire kept lit takes it away. `wardsNear` was invented for the watch and
    // never read, so a watchtower did nothing but stand there.
    const perilFromEnds = (a.traitMods?.perilNear ?? 0) + (b.traitMods?.perilNear ?? 0)
      - (a.traitMods?.wardsNear ?? 0) - (b.traitMods?.wardsNear ?? 0);
    L.peril = clamp(L.peril + perilFromEnds, 0.01, 3);
    L.baseUpkeep = L.upkeep;
    // the deepest point of any bore on this alignment, for the thread below
    let deepest = 0;
    for (let i = 0; i < survey.pts.length; i++) {
      if (survey.kinds[i] !== 'tunnel') continue;
      const g = world.heightAt(survey.pts[i].x, survey.pts[i].z);
      deepest = Math.max(deepest, g - survey.deck[i]);
    }
    // Only bores under the Peaks count towards the deep thread: a tunnel through
    // a hill in the Marchlands is a tunnel through a hill.
    L.boreDepth = regionsOn.has(REGION.PEAKS) ? deepest : 0;

    s.links.push(L);
    s.linkKey.set(keyOf(survey.a, survey.b), L);
    s.treasury -= survey.price;
    s.stats.built += survey.price;
    s.buildSpendWeek = (s.buildSpendWeek || 0) + survey.price;
    s.markDirty();

    // felling. The Elves keep a very long list.
    let felled = 0;
    for (let i = 0; i < survey.pts.length; i++) {
      const bio = world.biomeAt(survey.pts[i].x, survey.pts[i].z);
      if (bio === 4 || bio === 5) felled += survey.step * (1 - s.woodCare);
    }
    if (felled > 0) {
      s.treesFelled += felled;
      // gentle per-line: the Elves' real objection accumulates through the
      // smoke index over time rather than arriving all at once with the survey
      s.regard.elf -= felled * 0.005;
    }
    // The Dwarves get the contract for every tunnel and every pier.
    if (survey.tunnels > 0) s.regard.dwarf += 1.4 * survey.tunnels;
    if (survey.piers > 0) s.regard.dwarf += 0.25 * survey.piers;
    s.smokeIndex += survey.length * 0.002;

    // eastward reach feeds the Shadow: it notices roads pointed at it
    const eastness = Math.max(
      (a.x / (world.worldW / 2)), (b.x / (world.worldW / 2)),
    );
    if (eastness > 0.35) s.shadow += (eastness - 0.35) * 3.4;

    // ---- Firsts. Crossing a thing for the first time is the reward for the
    // effort of crossing it, and it has to land as an occasion rather than as a
    // line in a list.
    const hasWorks = (kind) => survey.spans.some((sp) => sp.kind === kind);
    const touches = (r) => regionsOn.has(r);
    const fire = (id, extra = {}) => {
      if (s.firsts[id]) return;
      s.firsts[id] = s.week;
      s.emit('crossing', { id, link: L, a, b, survey, ...extra });
    };
    if (hasWorks('span') || hasWorks('bridge')) fire('first_bridge');
    if (touches(REGION.PEAKS)) fire(hasWorks('tunnel') ? 'first_bore' : 'first_pass');
    if (hasWorks('causeway') && touches(REGION.WEEPING)) fire('first_marsh');
    if (touches(REGION.MIRKHOLT)) fire('first_wood');
    if (touches(REGION.ASHENREACH)) fire('first_east');
    if (a.anchor === 'wrack' || b.anchor === 'wrack') fire('first_wrack');
    if (a.anchor === 'quays' || b.anchor === 'quays') fire('first_quays');

    s.emit('built', { link: L, a, b, survey });
    return { ok: true, link: L };
  };

  /** Tear up track. Refunds a little and upsets the Dwarves. */
  s.demolish = (linkId) => {
    const i = s.links.findIndex((L) => L.id === linkId);
    if (i < 0) return { ok: false };
    const L = s.links[i];
    s.links.splice(i, 1);
    s.linkKey.delete(keyOf(L.a, L.b));
    for (const line of s.lines) line.stops = line.stops.filter((id) => reachableAfter(line, id));
    s.treasury += Math.round(L.length * 0.22);
    s.regard.dwarf -= 2;
    s.markDirty();
    s.emit('demolished', { link: L });
    return { ok: true };
  };
  const reachableAfter = () => true;   // lines are re-validated lazily each day

  // ---- improvements ----------------------------------------------------
  //
  // Each of these is the action that answers a diagnosis in the Ledger. Doubling
  // a section that is at capacity is the reason a mature Authority has a use for
  // money at all.

  // ---- borrowing ---------------------------------------------------------
  //
  // The player asked whether they could take out loans. Money had been a trickle
  // they waited for rather than a resource they commanded, which is a large part of
  // not feeling in control: you could not decide to do something ambitious NOW and
  // pay for it later. Borrowing is also the cheapest way to put the world back into
  // a financial decision — the three lenders charge in interest, obligation and
  // restraint respectively, so taking money is choosing whose regard to spend.

  /** What the Authority could raise: scales with the railway it has to show for it. */
  s.borrowingPower = (lender) => {
    const L = LENDERS[lender];
    if (!L) return 0;
    const built = s.links.reduce((n, x) => n + (x.destroyed ? 0 : x.length), 0);
    const worth = 120 + built * 0.9 + s.connectedCount() * 55;
    const regard = clamp((s.regard[L.people] ?? 50) / 100, 0.15, 1.15);
    const already = s.debts.reduce((n, d) => n + d.owed, 0);
    return Math.max(0, Math.round(worth * L.maxMul * regard - already));
  };

  s.lenderOffer = (lender) => {
    const L = LENDERS[lender];
    if (!L) return null;
    const cap = s.borrowingPower(lender);
    let refuse = null;
    if ((s.regard[L.people] ?? 50) < 12) refuse = `${L.name} will not see you.`;
    else if (L.people === 'elf' && s.elvesGone) refuse = 'The Havens are empty.';
    else if (cap < 60) refuse = 'They do not think you good for any more.';
    return { ...L, cap, refuse };
  };

  s.borrow = (lender, amount) => {
    const offer = s.lenderOffer(lender);
    if (!offer) return { ok: false, reason: 'no such lender' };
    if (offer.refuse) return { ok: false, reason: offer.refuse };
    const sum = Math.round(clamp(amount, 60, offer.cap));
    if (sum < 60) return { ok: false, reason: 'not worth the paperwork' };
    const debt = {
      id: s.nextDebtId++, lender, principal: sum, owed: sum,
      rate: offer.rate, took: s.week, term: offer.term, missed: 0,
    };
    s.debts.push(debt);
    s.treasury += sum;
    offer.onTake?.(s);
    s.emit('borrowed', { debt, lender: offer });
    return { ok: true, debt };
  };

  s.repay = (debtId, amount) => {
    const d = s.debts.find((x) => x.id === debtId);
    if (!d) return { ok: false };
    const pay = Math.min(Math.max(0, amount), d.owed, Math.max(0, s.treasury));
    if (pay <= 0) return { ok: false, reason: 'nothing to pay it with' };
    d.owed -= pay;
    s.treasury -= pay;
    if (d.owed <= 0.5) {
      s.debts = s.debts.filter((x) => x.id !== d.id);
      if (d.lender === 'havens') s.havenBond = s.debts.some((x) => x.lender === 'havens');
      s.emit('debtCleared', { debt: d });
    }
    return { ok: true, paid: Math.round(pay) };
  };

  s.worksPrice = {
    double: (L) => Math.round(L.length * 4.2 * s.buildDiscount),
    regrade: (L) => Math.round(L.length * 2.6 * s.buildDiscount),
    fortify: (L) => Math.round(L.length * 2.0 * s.buildDiscount),
    repair: (L) => Math.round(L.length * (L.destroyed ? 1.15 : 0.45) * s.buildDiscount),
    station: (st) => Math.round((240 + 190 * (st.works || 0)) * s.buildDiscount),
  };

  /** Lay a second road over an existing section. Capacity nearly doubles. */
  s.doubleTrack = (linkId) => {
    const L = s.links.find((x) => x.id === linkId);
    if (!L) return { ok: false };
    if (L.doubled) return { ok: false, reason: 'already double track' };
    const price = s.worksPrice.double(L);
    if (price > s.treasury) return { ok: false, reason: 'the Authority cannot pay for it' };
    s.treasury -= price;
    s.stats.built += price;
    s.buildSpendWeek = (s.buildSpendWeek || 0) + price;
    L.doubled = true;
    L.upkeep *= 1.75;
    L.baseUpkeep = (L.baseUpkeep ?? L.upkeep) * 1.75;
    s.regard.dwarf = Math.min(100, s.regard.dwarf + 2);
    s.emit('works', { kind: 'double', link: L, price });
    return { ok: true, price };
  };

  /** Ease the gradients and the curves. Everything runs faster over it. */
  s.regrade = (linkId) => {
    const L = s.links.find((x) => x.id === linkId);
    if (!L) return { ok: false };
    if ((L.regrade || 1) <= 0.8) return { ok: false, reason: 'already eased as far as it will go' };
    const price = s.worksPrice.regrade(L);
    if (price > s.treasury) return { ok: false, reason: 'the Authority cannot pay for it' };
    s.treasury -= price;
    s.stats.built += price;
    s.buildSpendWeek = (s.buildSpendWeek || 0) + price;
    L.regrade = (L.regrade || 1) * 0.86;
    L.upkeep *= 1.12;
    s.markDirty();
    s.emit('works', { kind: 'regrade', link: L, price });
    return { ok: true, price };
  };

  /** Blockhouses, cuttings walled, a garrison on the section. */
  s.fortify = (linkId) => {
    const L = s.links.find((x) => x.id === linkId);
    if (!L) return { ok: false };
    if (L.fortified) return { ok: false, reason: 'already fortified' };
    const price = s.worksPrice.fortify(L);
    if (price > s.treasury) return { ok: false, reason: 'the Authority cannot pay for it' };
    s.treasury -= price;
    s.stats.built += price;
    L.fortified = true;
    L.peril *= 0.45;
    L.upkeep *= 1.2;
    s.emit('works', { kind: 'fortify', link: L, price });
    return { ok: true, price };
  };

  /**
   * Make a broken section good again.
   *
   * NOTHING in the game has ever cleared `L.destroyed` — the Ents and the wrath
   * incident killed track permanently, and the rails stayed drawn on the map for
   * the rest of the run. So a raid that destroyed a section would have read as
   * nothing happening at all, and the player would have had no answer to it.
   */
  /**
   * AGE III — THE MUSTER.
   *
   * DESIGN.md has promised this since the beginning and none of it existed: "Raids
   * on remote segments. Refugee waves. Then an army moving at the speed of your best
   * trunk line, on your track. You choose: fortify it, requisition it for evacuation,
   * or tear up the greatest thing you ever built." A grep for raid|refugee|requisition
   * found two unrelated hits. Age III was a 1.9x incident multiplier and nothing else.
   *
   * It escalates in stages, one step a week, and it is deliberately DETERMINISTIC —
   * targets are chosen by measuring the network, not by rolling dice, so a player can
   * see it coming and act. Everything it writes to is state that already existed
   * (closed, destroyed, peril, fortified) plus `taken`, so the renderer needs nothing.
   */
  function hostWeekly() {
    if (!s.host) {
      s.host = {
        stage: 1, since: s.week, road: [], dist: 0, total: 0,
        answer: null, stalled: 0, raids: 0,
      };
    }
    const H = s.host;
    const age = s.week - H.since;

    // How exposed a section is: how far east it lies, less what guards it.
    const exposure = (L) => {
      if (L.destroyed) return -1;
      const a = s.byId.get(L.a), b = s.byId.get(L.b);
      const east = Math.max(a ? a.x : -1e9, b ? b.x : -1e9);
      const reach = clamp(east / (world.worldW / 2) + 0.15, 0, 1);
      const guarded = (L.fortified ? 0.4 : 1) * (L.guarded ? 0.6 : 1);
      return reach * guarded * (1 + 0.4 * (L.peril || 0));
    };

    // ── stage 1: the muster is heard of ──────────────────────────────────
    if (H.stage === 1) {
      if (age >= 2) { H.stage = 2; s.emit('host', { stage: 2 }); }
      return;
    }

    // ── stage 2: raids on the remote segments ────────────────────────────
    if (H.stage === 2) {
      const live = s.links.filter((L) => !L.destroyed);
      if (live.length) {
        let worst = null, worstE = -1;
        for (const L of live) { const e = exposure(L); if (e > worstE) { worstE = e; worst = L; } }
        if (worst && worstE > 0) {
          H.raids++;
          // A fortified road is cut for a week. An unfortified one is destroyed.
          // `closed` is a QUANTITY melted by clearRate, not a boolean — winter uses
          // 26. A raid on a held road closes it for a real stretch; 1 evaporated in
          // about a second and read as nothing having happened.
          if (worst.fortified) { worst.closed = Math.max(worst.closed || 0, 8); s.markDirty(); }
          else { worst.destroyed = true; s.markDirty(); }
          worst.peril = clamp((worst.peril || 0) + 0.25, 0, 3);
          s.emit('host', {
            stage: 2, link: worst, held: !!worst.fortified,
            where: `${s.byId.get(worst.a)?.name ?? '?'}–${s.byId.get(worst.b)?.name ?? '?'}`,
          });
        }
      }
      if (age >= 6) { H.stage = 3; s.emit('host', { stage: 3 }); }
      return;
    }

    // ── stage 3: the refugee wave ────────────────────────────────────────
    if (H.stage === 3) {
      const live = s.sites.filter((x) => x.connected && !x.abandoned);
      const east = live.slice().sort((a, b) => b.x - a.x).slice(0, 3);
      for (const st of east) {
        st.fled = Math.min(1, (st.fled || 0) + 0.22);
        // the nearest connected place meaningfully further west takes them in
        let dst = null, best = Infinity;
        for (const o of live) {
          if (o === st || o.x > st.x - 60) continue;
          const d = Math.hypot(o.x - st.x, o.z - st.z);
          if (d < best) { best = d; dst = o; }
        }
        if (dst) dst.refuge = (dst.refuge || 0) + st.fled * 0.5 * (st.pop / 400);
      }
      if (age >= 10) { H.stage = 4; chooseRoad(); }
      return;
    }

    // ── stage 4: the march, on the player's own track ────────────────────
    if (H.stage === 4) {
      if (!H.road.length) { chooseRoad(); if (!H.road.length) return; }
      // Announce it the week the road is actually known. Announcing at the stage
      // change named nowhere, because the raids had usually cut the frontier off
      // and chooseRoad had to walk inland before it found a route that resolved.
      if (!H.announced) {
        H.announced = true;
        s.emit('host', { stage: 4, from: H.fromName, to: H.toName });
      }
      // THE POINT OF THE WHOLE THING: it moves at the speed of the railway the
      // player built. Every regrade they ever bought carries the host faster.
      let ahead = 0, wsum = 0;
      for (let i = H.frontIndex || 0; i < H.road.length; i++) {
        const L = s.links.find((x) => x.id === H.road[i]);
        if (!L) continue;
        ahead += L.length;
        wsum += L.length * (L.regrade || 1);
      }
      const meanRegrade = ahead > 0 ? wsum / ahead : 1;
      // a regraded road is FASTER for them too: regrade < 1 means less time
      const stride = BASE_SPEED * s.stock.speed * DAY * 0.42 / Math.max(0.5, meanRegrade);
      H.dist += stride;
      // advance the front over the road, and take each section as it is reached
      let run = 0;
      H.frontIndex = 0;
      for (let i = 0; i < H.road.length; i++) {
        const L = s.links.find((x) => x.id === H.road[i]);
        if (!L) continue;
        run += L.length;
        if (run <= H.dist) {
          if (!L.taken) { L.taken = true; L.closed = 1; s.markDirty(); }
          H.frontIndex = i + 1;
        } else break;
      }
      const frac = H.total > 0 ? clamp(H.dist / H.total, 0, 1) : 0;
      H.frac = frac;
      // the decision, once they are properly on the road
      if (!H.answer && !H.asked && frac > 0.18) {
        H.asked = true;
        // Assigned directly, not through maybePetition: weekly() runs before
        // events.tick, so the host wins the single modal slot in its own week.
        if (s.events?.hostPetition) s.pendingPetition = s.events.hostPetition(s);
      }
      if (frac >= 1 && H.stage !== 5) {
        H.stage = 5;
        // The road ran out. What that means depends on what the Director signed for.
        if (H.answer === 'tearup') s.over = 'sundered';
        else if (H.answer === 'fortify' || H.answer === 'requisition') {
          // They arrive, and the realm is standing behind whatever was done.
          const heart = s.byId.get(H.heartId);
          if (heart && !heart.abandoned && s.concordAvg() > 14) s.over = 'held';
          else s.over = 'overrun';
        } else s.over = 'overrun';
      }
      return;
    }
  }
  s.hostWeekly = hostWeekly;

  /** The road the host will march: from the far east to the richest place behind it. */
  function chooseRoad() {
    const H = s.host;
    const live = s.sites.filter((x) => x.connected && !x.abandoned);
    if (live.length < 2) return;
    // The heart of the realm: the richest place that is not itself on the frontier.
    const eastmost = live.reduce((m, x) => (x.x > m.x ? x : m));
    const inland = live.filter((x) => x.x < eastmost.x - 40);
    if (!inland.length) return;
    const heart = inland.reduce((m, x) =>
      (!m || x.prosperity * (1 + x.tier) > m.prosperity * (1 + m.tier) ? x : m), null);
    if (!heart) return;
    // Walk inward from the frontier until a road actually resolves. Stage 2 spends
    // several weeks destroying the most exposed sections, so the easternmost place
    // is usually cut off by the time the host marches — taking it unconditionally
    // gave a road of length zero and the host never moved at all.
    let east = null, h = null;
    for (const cand of live.slice().sort((a, b) => b.x - a.x)) {
      if (cand === heart || cand.x <= heart.x) continue;
      const path = s.hopsTo(cand.id, heart.id);
      if (path && path.hops.length) { east = cand; h = path; break; }
    }
    if (!east || !h) return;
    // hopsTo walks back from the target, so reverse it into marching order
    H.road = h.hops.slice().reverse();
    H.total = H.road.reduce((n, id) => {
      const L = s.links.find((x) => x.id === id);
      return n + (L ? L.length : 0);
    }, 0);
    H.dist = 0;
    H.frontIndex = 0;
    H.fromName = east.name;
    H.toName = heart.name;
    H.heartId = heart.id;
  }

  s.repair = (linkId) => {
    const L = s.links.find((x) => x.id === linkId);
    if (!L) return { ok: false };
    if (!L.destroyed && !L.closed) return { ok: false, reason: 'nothing to make good' };
    const price = s.worksPrice.repair(L);
    if (price > s.treasury) return { ok: false, reason: 'the Authority cannot pay for it' };
    s.treasury -= price;
    s.stats.built += price;
    s.buildSpendWeek = (s.buildSpendWeek || 0) + price;
    L.destroyed = false;
    L.closed = 0;
    s.markDirty();
    s.emit('works', { kind: 'repair', link: L, price });
    return { ok: true, price };
  };

  /** A larger station: more passengers, and a taste for finer things. */
  s.stationWorks = (siteId) => {
    const st = s.byId.get(siteId);
    if (!st || st.abandoned) return { ok: false };
    if ((st.works || 0) >= 3) return { ok: false, reason: 'as large a station as the place can bear' };
    const price = s.worksPrice.station(st);
    if (price > s.treasury) return { ok: false, reason: 'the Authority cannot pay for it' };
    s.treasury -= price;
    s.stats.built += price;
    st.works = (st.works || 0) + 1;
    st.traitMods.pax *= 1.22;
    st.traitMods.luxury *= 1.15;
    st.prosperity = Math.min(100, st.prosperity + 3);
    s.emit('works', { kind: 'station', site: st, price });
    return { ok: true, price };
  };

  // ---- lines and rolling stock -----------------------------------------
  // ---- lines and rolling stock -----------------------------------------

  /** Keep the roster in step with the number of engines the Authority owns. */
  s.syncFleet = () => {
    while (s.engines.length < s.stock.engines) {
      // via `s` — syncFleet lives in installMethods(), a different function from
      // createSim() where builderFor is declared, so the bare name is not in scope.
      s.engines.push(s.fleet.build(s.builderFor(s.engines.length), s.week));
    }
    // engines are never scrapped, so the roster only ever grows
    for (const e of s.engines) {
      if (e.lineId !== null && !s.lines.some((l) => l.id === e.lineId)) e.lineId = null;
    }
  };

  /** What one engine contributes to a line's tonnage, worn condition included. */
  s.engineHaul = (e) => {
    const c = ENGINE_CLASSES[e.cls] || ENGINE_CLASSES.drover;
    // a tired engine still runs, but not well; never below a third of nominal
    const fit = 0.34 + 0.66 * clamp(e.condition ?? 1, 0, 1);
    return c.power * c.speed * fit;
  };
  /** What one engine contributes to a line's appeal to passengers. */
  s.engineGrace = (e) => {
    const c = ENGINE_CLASSES[e.cls] || ENGINE_CLASSES.drover;
    return c.grace * (0.5 + 0.5 * clamp(e.condition ?? 1, 0, 1));
  };
  /** Chance multiplier for something happening to this engine. */
  s.engineFrailty = (e) => {
    const c = ENGINE_CLASSES[e.cls] || ENGINE_CLASSES.drover;
    return (1 / Math.max(0.2, c.stamina)) * (1.6 - 0.6 * clamp(e.condition ?? 1, 0, 1));
  };
  s.engineClass = (e) => ENGINE_CLASSES[e?.cls] || ENGINE_CLASSES.drover;

  /** What it would cost to buy one, and whether that builder will deal with you. */
  s.enginePrice = (clsKey) => {
    const c = ENGINE_CLASSES[clsKey];
    if (!c) return null;
    const regard = s.regard[c.style === 'men' ? 'men' : c.style] ?? 50;
    // hard bargainers when they think little of you; a discount when they like you
    const mul = lerp(1.35, 0.85, clamp(regard / 100, 0, 1));
    return Math.round(c.price * mul);
  };
  s.engineOffer = (clsKey) => {
    const c = ENGINE_CLASSES[clsKey];
    if (!c) return null;
    const people = c.style;
    const regard = s.regard[people] ?? 50;
    let refuse = null;
    if (people === 'elf' && s.elvesGone) refuse = 'The Havens are empty.';
    else if (people === 'orc' && !s.concession) refuse = 'No concession has been granted.';
    else if (regard < 18) refuse = `${c.builder} will not build for the Authority.`;
    return { ...c, price: s.enginePrice(clsKey), refuse };
  };
  s.buyEngine = (clsKey) => {
    const offer = s.engineOffer(clsKey);
    if (!offer) return { ok: false, reason: 'no such class' };
    if (offer.refuse) return { ok: false, reason: offer.refuse };
    if (offer.price > s.treasury) return { ok: false, reason: 'the Authority cannot pay for it' };
    s.treasury -= offer.price;
    s.stats.built += offer.price;
    const eng = s.fleet.build(clsKey, s.week);
    s.engines.push(eng);
    s.stock.engines = s.engines.length;
    s.emit('engineBought', { engine: eng, cls: offer });
    return { ok: true, engine: eng };
  };
  /** Put a worn engine back to rights. A money sink with a story attached. */
  s.overhaulPrice = (e) => {
    const c = s.engineClass(e);
    return Math.round(c.price * 0.32 * (1.2 - clamp(e.condition ?? 1, 0, 1)));
  };
  s.overhaul = (engineId) => {
    const e = s.engineById(engineId);
    if (!e) return { ok: false };
    if ((e.condition ?? 1) > 0.92) return { ok: false, reason: 'it is in good order already' };
    const price = s.overhaulPrice(e);
    if (price > s.treasury) return { ok: false, reason: 'the Authority cannot pay for it' };
    s.treasury -= price;
    e.condition = 1;
    e.overhauls = (e.overhauls || 0) + 1;
    return { ok: true, paid: price };
  };

  /**
   * How many wagons a service runs behind each engine.
   *
   * `stock.cars` was a single global number set by charters, so rolling stock was
   * not a decision at all — every train on the continent ran the same rake. It is
   * now the CEILING, and each service may run fewer: a short rake gets round the
   * line more usefully on a light branch, a full one earns more on a trunk.
   */
  s.lineCars = (line) => clamp(line?.cars ?? s.stock.cars, 1, s.stock.cars);
  s.setLineCars = (lineId, n) => {
    const line = s.lines.find((l) => l.id === lineId);
    if (!line) return { ok: false };
    line.cars = clamp(Math.round(n), 1, s.stock.cars);
    return { ok: true, cars: line.cars };
  };

  s.enginesOf = (lineId) => s.engines.filter((e) => e.lineId === lineId);
  s.engineById = (id) => s.engines.find((e) => e.id === id) || null;
  s.enginesInUse = () => { s.syncFleet(); return s.engines.filter((e) => e.lineId !== null).length; };
  s.enginesFree = () => { s.syncFleet(); return s.engines.filter((e) => e.lineId === null).length; };

  s.createLine = (stops, policy = 'mixed') => {
    if (stops.length < 2) return { ok: false, reason: 'a line wants at least two stops' };
    const c = LINE_COLOURS[s.lines.length % LINE_COLOURS.length];
    const line = {
      id: s.lines.length + 1,
      name: `the ${c.name} Way`,
      colour: c.hex,
      stops: stops.slice(),
      policy,
      fare: 1,            // index into FARES
      warden: false,
      trains: 0,
      // measured each week, so the player can see whether a service pays
      stats: { loads: 0, revenue: 0, upkeep: 0, worstLink: null, worstLoad: 0 },
      wk: { loads: 0, revenue: 0, byGood: {} },
    };
    s.lines.push(line);
    s.emit('line', { line });
    return { ok: true, line };
  };

  s.setLineTrains = (lineId, n) => {
    s.syncFleet();
    const line = s.lines.find((l) => l.id === lineId);
    if (!line) return { ok: false };
    const want = Math.max(0, Math.round(n));
    const on = s.enginesOf(lineId);
    if (want > on.length) {
      const idle = s.engines.filter((e) => e.lineId === null);
      if (idle.length < want - on.length) return { ok: false, reason: 'no engines to spare' };
      // send the engine whose class suits what the line is for
      const wantStyle = STYLE_FOR_POLICY[line.policy] || 'dwarf';
      idle.sort((a, b) => (b.style === wantStyle) - (a.style === wantStyle));
      for (let i = 0; i < want - on.length; i++) idle[i].lineId = lineId;
    } else if (want < on.length) {
      // the newest engines go back to the shed first
      on.sort((a, b) => b.id - a.id);
      for (let i = 0; i < on.length - want; i++) on[i].lineId = null;
    }
    line.trains = want;
    return { ok: true };
  };
  s.setPolicy = (lineId, policy) => {
    const line = s.lines.find((l) => l.id === lineId);
    if (!line || !POLICIES[policy]) return { ok: false };
    line.policy = policy;
    return { ok: true };
  };

  s.setFare = (lineId, tier) => {
    const line = s.lines.find((l) => l.id === lineId);
    if (!line) return { ok: false };
    line.fare = clamp(Math.round(tier), 0, FARES.length - 1);
    return { ok: true };
  };

  s.setWarden = (lineId, on) => {
    const line = s.lines.find((l) => l.id === lineId);
    if (!line) return { ok: false };
    line.warden = !!on;
    return { ok: true };
  };

  s.renameLine = (lineId, name) => {
    const line = s.lines.find((l) => l.id === lineId);
    if (!line) return { ok: false };
    const clean = String(name).trim().slice(0, 34);
    if (clean) line.name = clean;
    return { ok: true, name: line.name };
  };

  /**
   * Add a stop. Only legal if the new stop is reachable from one of the ends,
   * which keeps a service a walkable route rather than a set of disconnected
   * fragments the trains would have to teleport between.
   */
  s.addStop = (lineId, siteId) => {
    const line = s.lines.find((l) => l.id === lineId);
    if (!line) return { ok: false, reason: 'no such service' };
    if (line.stops.includes(siteId)) return { ok: false, reason: 'already a stop on this service' };
    if (line.stops.length >= 9) return { ok: false, reason: 'nine calls is enough for one service' };
    // Join at whichever END is actually nearer by rail. End-first meant a call
    // adjacent to the FIRST stop was still appended at the tail whenever the
    // network happened to connect it there too, and the service ran the whole line,
    // doubled back, and hairpinned — a route no railway would timetable.
    const first = line.stops[0], last = line.stops[line.stops.length - 1];
    const toLast = hopsTo(last, siteId);
    const toFirst = hopsTo(first, siteId);
    if (toLast && (!toFirst || toLast.time <= toFirst.time)) {
      line.stops.push(siteId);
      return { ok: true, at: 'end' };
    }
    if (toFirst) { line.stops.unshift(siteId); return { ok: true, at: 'start' }; }
    return { ok: false, reason: 'no track joins it to either end of this service' };
  };

  s.removeStop = (lineId, siteId) => {
    const line = s.lines.find((l) => l.id === lineId);
    if (!line) return { ok: false };
    if (line.stops.length <= 2) return { ok: false, reason: 'a service wants at least two calls' };
    line.stops = line.stops.filter((id) => id !== siteId);
    return { ok: true };
  };

  s.moveStop = (lineId, siteId, dir) => {
    const line = s.lines.find((l) => l.id === lineId);
    if (!line) return { ok: false };
    const i = line.stops.indexOf(siteId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= line.stops.length) return { ok: false };
    [line.stops[i], line.stops[j]] = [line.stops[j], line.stops[i]];
    return { ok: true };
  };

  s.deleteLine = (lineId) => {
    const i = s.lines.findIndex((l) => l.id === lineId);
    if (i < 0) return { ok: false };
    const [line] = s.lines.splice(i, 1);
    for (const e of s.engines) if (e.lineId === line.id) e.lineId = null;
    s.note(`The ${line.name} is withdrawn. The engines are returned to the shed and the timetable reprinted, again.`, 'plain');
    return { ok: true };
  };

  /** Break a service in two at a stop, so a long snake can become a trunk and a branch. */
  s.splitLine = (lineId, siteId) => {
    const line = s.lines.find((l) => l.id === lineId);
    if (!line) return { ok: false };
    const i = line.stops.indexOf(siteId);
    if (i <= 0 || i >= line.stops.length - 1) return { ok: false, reason: 'split at a middle call' };
    const tail = line.stops.slice(i);
    line.stops = line.stops.slice(0, i + 1);
    const r = s.createLine(tail, line.policy);
    if (r.ok) {
      r.line.fare = line.fare;
      const move = Math.floor(line.trains / 2);
      line.trains -= move;
      r.line.trains = move;
      // Move the ENGINES, not just the counter. Splitting used to leave every
      // engine's lineId on the old service, so the new half had a trains count and
      // zero capacity — a service that existed on paper and carried nothing.
      const crews = s.enginesOf(line.id);
      for (const e of crews.slice(0, move)) e.lineId = r.line.id;
    }
    return r;
  };

  /** Which links a line actually runs over, in order. */
  s.lineLinks = (line) => {
    const out = [];
    for (let i = 0; i < line.stops.length - 1; i++) {
      const h = hopsTo(line.stops[i], line.stops[i + 1]);
      if (!h) return null;
      out.push(...h.hops);
    }
    return out;
  };

  /**
   * Weekly carrying capacity a line contributes to each link it runs over.
   *
   * Counted in one-way traversals, not round trips: a train works its way along
   * picking up and setting down, so what matters at any point on the line is how
   * often a train passes it, and every passing train can carry a full load past
   * that point. Costing this as round trips instead makes long trunk lines
   * mathematically useless, which is both wrong and no fun.
   */
  s.lineCapacity = (line) => {
    const links = s.lineLinks(line);
    if (!links || !links.length) return 0;
    let len = 0;
    const seen = new Set();
    for (const id of links) {
      if (seen.has(id)) continue;
      seen.add(id);
      const L = s.links.find((x) => x.id === id);
      if (L) len += L.length;
    }
    if (len <= 0) return 0;
    const traversals = (BASE_SPEED * s.stock.speed * WEEK) / len;
    const pol = POLICIES[line.policy] || POLICIES.mixed;
    // Engines used to be counted, never read: `crew = enginesOf(line).length`, so a
    // Hammerhead and a Pony were the same engine and there was nothing to choose.
    // Each one now contributes its own power and speed, degraded by its condition.
    const crew = s.enginesOf(line.id).reduce((n, e) => n + s.engineHaul(e), 0);
    return traversals * s.lineCars(line) * CAR_LOADS * crew * pol.goods;
  };

  /** Passenger appeal a line lends to the links it runs over. */
  s.linePax = (line) => (POLICIES[line.policy] || POLICIES.mixed).pax;

  // ---- the daily solve --------------------------------------------------

  function dailySolve() {
    if (graphDirty) rebuildGraph();
    const frac = 1 / 7;      // one day's worth of the weekly rates

    // Capacity available on each link today, plus which services provide it.
    // Keeping the serving lines per link is what lets fares, passenger appeal,
    // wardens and per-service accounting all work off one pass.
    const cap = new Map();
    const servedBy = new Map();       // linkId -> [{ line, share }]
    for (const L of s.links) { cap.set(L.id, 0); servedBy.set(L.id, []); L.guarded = false; }
    for (const line of s.lines) {
      const links = s.lineLinks(line);
      if (!links) continue;
      const weekly = s.lineCapacity(line);
      const daily = weekly * frac;
      const seen = new Set();
      for (const id of links) {
        if (seen.has(id)) continue;
        seen.add(id);
        if (!cap.has(id)) continue;
        const L2 = s.links.find((x) => x.id === id);
        cap.set(id, (cap.get(id) || 0) + daily * (L2?.doubled ? 1.9 : 1));
        servedBy.get(id).push({ line, daily });
        if (line.warden) {
          const L = s.links.find((x) => x.id === id);
          if (L) L.guarded = true;
        }
      }
    }
    const capLeft = new Map(cap);

    /** Weighted fare and demand multipliers along a path, and the lines on it. */
    const pathTerms = (hops) => {
      // `demandMul` used to start at 1 and only ever take a Math.min, so NO value
      // above 1 could ever apply. That made two things dead: Cheap fares (demand
      // 1.20) and the Freight policy's goodsPull (1.35). Measured, an all-Cheap
      // network moved exactly the same 709 loads as Standard for 28% less money —
      // Cheap was a strictly dominated button, and the pull half of my own policy
      // fix was inert on arrival.
      //
      // Averaged across hops now, exactly like fareMul. The min was presumably meant
      // to model "the tightest segment wins", but the solver already does that
      // properly through `room`/`capLeft`, so demand does not need to as well.
      let fareMul = 0, demandSum = 0, wt = 0;
      const lines = new Set();
      for (const id of hops) {
        const svs = servedBy.get(id) || [];
        let best = 0, bestFare = 1, bestDemand = 1;
        for (const sv of svs) {
          lines.add(sv.line);
          if (sv.daily > best) {
            best = sv.daily;
            // Fold in what the service is RUN for, not just what it charges. Without
            // this, POLICIES only ever touched capacity, which is not the binding
            // constraint, so the Freight setting was a lever that did nothing.
            const P = POLICIES[sv.line.policy] || POLICIES.mixed;
            bestFare = FARES[sv.line.fare].mul * (P.goodsFare ?? 1);
            bestDemand = FARES[sv.line.fare].demand * (P.goodsPull ?? 1);
          }
        }
        fareMul += bestFare; wt++;
        demandSum += bestDemand;
      }
      return {
        fareMul: wt ? fareMul / wt : 1,
        demandMul: wt ? demandSum / wt : 1,
        lines: [...lines],
      };
    };

    // --- produce
    for (const st of s.sites) {
      if (st.abandoned) continue;
      const k = KINDS[st.kind];
      const m = TIER_MULT[st.tier] * frac * (0.55 + 0.45 * (st.prosperity / 70));
      // A delve with a very deep shaft finds mithril. Nothing else on the
      // continent does, which is what makes one wagon of it worth a whole train.
      if (st.kind === 'delve' && (st.traits || []).includes('deep_shaft')) {
        const mith = 0.16 * TIER_MULT[st.tier] * frac;
        st.stock.mithril += mith;
        st.supply.mithril += mith;
      }
      for (const [g, r] of Object.entries(k.produce || {})) {
        const amt = r * m * (st.plague > 0.3 ? 0.45 : 1) * (st.traitMods?.produce[g] ?? 1);
        st.stock[g] += amt;
        st.supply[g] += amt;
        // Men's timber comes out of standing wood, and the Elves are counting
        if (g === 'timber' && st.kind === 'burg') s.smokeIndex += amt * 0.06 * (1 - s.woodCare);
      }
      for (const [g, r] of Object.entries(k.need || {})) st.demand[g] += r * TIER_MULT[st.tier] * frac;
      for (const [g, r] of Object.entries(k.luxury || {})) st.demand[g] += r * TIER_MULT[st.tier] * frac * 0.6 * (st.traitMods?.luxury ?? 1);
      // Refugees eat, and they eat grain. An unfed wave drags satisfaction and so
      // prosperity, which is what gives the requisition decision a real cost.
      if ((st.refuge ?? 0) > 0.02) {
        st.demand.grain += st.refuge * 1.6 * TIER_MULT[st.tier] * frac;
      }
    }

    // Commissions create real demand at their destination. Without this the
    // network has no reason to carry what was commissioned, and an accepted
    // commission is a wish rather than an instruction.
    for (const c of s.commissions) {
      if (c.state !== 'taken' || c.class !== 'freight' || !c.good) continue;
      const dest = s.byId.get(c.to);
      if (!dest || dest.abandoned) continue;
      const left = Math.max(0, c.need - c.done);
      if (left <= 0) continue;
      const weeksLeft = Math.max(0.6, Math.min(2.5, c.due - s.week));
      // ask for what is still outstanding, spread over the time remaining, with a
      // margin so an urgent commission outbids ordinary consumption
      dest.demand[c.good] += (left / weeksLeft) * frac * (c.urgent ? 2.2 : 1.5);
    }

    // --- move goods: nearest willing supplier first, capacity permitting
    const moves = [];
    // Why each shortfall happened. The single biggest cause of the game feeling
    // arbitrary was that the player could see a settlement was short and had no
    // way at all to find out what to do about it.
    for (const st of s.sites) st.why = {};
    const noteWhy = (st, g, reason) => { if (!st.why[g]) st.why[g] = reason; };
    for (const g of GOOD_KEYS) {
      const suppliers = [];
      const consumers = [];
      for (const st of s.sites) {
        if (st.abandoned || !st.connected || st.quarantined) continue;
        const own = (KINDS[st.kind].need?.[g] ?? 0) * TIER_MULT[st.tier] * frac;
        const keep = own * 1.4;
        if (st.stock[g] > keep + 0.05) suppliers.push({ st, avail: st.stock[g] - keep });
        // what they still want after what has already arrived and what is on hand
        const shortfall = st.demand[g] - st.got[g] - st.stock[g];
        if (shortfall > 0.02) consumers.push({ st, remain: shortfall });
      }
      if (!suppliers.length || !consumers.length) continue;

      // orc trade is gated on the concession
      const pairs = [];
      for (const c of consumers) {
        for (const p of suppliers) {
          if (p.st.id === c.st.id) continue;
          const orcInvolved = p.st.culture === 'orc' || c.st.culture === 'orc';
          if (orcInvolved && !s.concession) continue;
          const h = hopsTo(p.st.id, c.st.id);
          if (!h) continue;
          pairs.push({ p, c, h });
        }
      }
      pairs.sort((a, b) => a.h.time - b.h.time);

      // anyone with demand and no reachable supplier at all
      for (const c of consumers) {
        if (c.st.quarantined) { noteWhy(c.st, g, 'station closed'); continue; }
        if (!pairs.some((pp) => pp.c === c)) noteWhy(c.st, g, 'no connected source');
      }

      for (const { p, c, h } of pairs) {
        if (p.avail <= 0.02) { noteWhy(c.st, g, 'source has none to spare'); continue; }
        const want = c.remain;
        if (want <= 0.02) continue;
        let room = Infinity, tightest = null;
        for (const id of h.hops) {
          const r = capLeft.get(id) ?? 0;
          if (r < room) { room = r; tightest = id; }
        }
        if (room <= 0.02) {
          s.congestion.set(tightest, (s.congestion.get(tightest) || 0) + 1);
          const L = s.links.find((x) => x.id === tightest);
          const at = L ? (s.byId.get(L.a)?.name || '') : '';
          noteWhy(c.st, g, cap.get(tightest) > 0 ? `capacity short at ${at}` : 'no service on the line');
          continue;
        }
        // transfers lose a little unless the Interchange Act has passed
        const loss = Math.pow(1 - s.transferLoss, h.transfers);
        if (loss < 0.34) noteWhy(c.st, g, 'too many changes');
        const terms = pathTerms(h.hops);
        const raw = Math.min(p.avail, (want / Math.max(0.15, loss)) * terms.demandMul, room);
        if (raw <= 0.02) continue;
        const delivered = raw * loss;

        p.avail -= raw;
        p.st.stock[g] -= raw;
        p.st.exports += raw * VALUE[g];
        c.st.stock[g] += delivered;
        c.st.got[g] += delivered;
        c.remain = Math.max(0, c.remain - delivered);
        c.st.imports += delivered * VALUE[g];
        for (const id of h.hops) capLeft.set(id, (capLeft.get(id) || 0) - raw);

        // the Authority's cut
        let fareLen = 0;
        for (const id of h.hops) { const L = s.links.find((x) => x.id === id); if (L) fareLen += L.length; }
        // Cap the value multiplier. Mithril is worth 48 a load, and uncapped that made
        // routine haulage of a trickle of it more profitable than the entire grain
        // trade. Its real payoff is the Council's commission fee, not the freight rate.
        const valueMul = Math.min(3.2, (VALUE[g] || 3) / 3.4);
        let fare = raw * (1.1 + 0.024 * fareLen) * valueMul * terms.fareMul;
        // The Greenhollow's rebate. The petition wrote s.fareRebate and nothing read
        // it, so "Grant the rebate" was an option that did nothing — a lie in the
        // one place the game asks the player to weigh a cost. The rebate is charged
        // here and remembered below, in halfling regard, which is what they promised.
        if (s.fareRebate && p.st.culture === 'halfling') {
          const rebate = fare * s.fareRebate;
          fare -= rebate;
          s.rebatePaid = (s.rebatePaid || 0) + rebate;
        }
        s.treasury += fare;
        s.stats.fares += fare;
        s.stats.loadsMoved += raw;
        // Credit the services that actually carried it, so the ledger can show
        // the player which of their lines pays for itself and which does not.
        if (terms.lines.length) {
          const cut = fare / terms.lines.length;
          const share = raw / terms.lines.length;
          for (const ln of terms.lines) {
            ln.wk.revenue += cut;
            ln.wk.loads += share;
            // WHICH good was discarded here, so a line knew how much it earned but
            // never what it carried. That single omission is why the economy could
            // not be shown: the wagons on screen had to be chosen at random and the
            // dossier could only quote totals. Keep the mix.
            ln.wk.byGood[g] = (ln.wk.byGood[g] || 0) + share;
          }
        }

        if (p.st.culture === 'orc' || c.st.culture === 'orc') {
          s.orcTradeTotal += raw;
          s.shadow += raw * 0.30;
          s.regard.orc += raw * 0.16;
          s.regard.elf -= raw * 0.05;
          s.regard.men -= raw * 0.02;
        }
        if (g === 'lore') { /* lore lifts everyone it reaches */ c.st.prosperity += delivered * 0.8; }
        // Athelas is the only cure. A wagon of it beats any quarantine.
        if (g === 'athelas' && c.st.plague > 0) {
          c.st.plague = Math.max(0, c.st.plague - delivered * 1.6);
          if (c.st.plague <= 0.02 && c.st.quarantined) { c.st.quarantined = false; s.markDirty(); }
        }

        // a delivery may be exactly what somebody commissioned
        s.comm.credit(s, g, c.st.id, delivered);
        moves.push({ good: g, from: p.st.id, to: c.st.id, amount: raw, fare, hops: h.hops.length });
        // plague rides the trains
        if (p.st.plague > 0.25 && c.st.plague < 0.05 && s.rng.chance(0.10 * p.st.plague)) {
          c.st.plague = 0.12;
          s.emit('plague_spread', { from: p.st, to: c.st });
        }
      }
    }
    s.flowLast = moves;

    // How hard each link was worked today. Smoothed, because a single day's
    // figure jitters too much to read off a bar.
    for (const L of s.links) {
      const total = cap.get(L.id) || 0;
      const left = capLeft.get(L.id) || 0;
      const used = total > 0 ? clamp(1 - left / total, 0, 1) : 0;
      L.load = lerp(L.load ?? 0, used, 0.35);
      L.hasService = total > 0;
    }

    // Clients take delivery of what has reached them — before local consumption,
    // manufacture or spoilage. A commission that has to outbid a settlement's own
    // dinner for the same sack of grain can never be discharged at all.
    s.comm.collect(s, 1);

    // --- manufacture
    for (const st of s.sites) {
      if (st.abandoned) continue;
      const mk = KINDS[st.kind].make;
      if (!mk || st.tier < mk.minTier) continue;
      const m = TIER_MULT[st.tier] * frac;
      // `out` is how much product we can finish. Each input g is consumed at
      // (r / mk.rate) per unit of output, so the stock of g caps output at
      // stock * mk.rate / r.
      let out = mk.rate * m;
      for (const [g, r] of Object.entries(mk.from)) {
        out = Math.min(out, (st.stock[g] * mk.rate) / r);
      }
      if (out > 0.01) {
        for (const [g, r] of Object.entries(mk.from)) {
          st.stock[g] = Math.max(0, st.stock[g] - out * (r / mk.rate));
        }
        st.stock[mk.out] += out;
        st.supply[mk.out] += out;
        s.smokeIndex += out * 0.05;
      }
    }

    // --- consume, and work out how content everybody is
    for (const st of s.sites) {
      if (st.abandoned) continue;
      const k = KINDS[st.kind];
      let wantTotal = 0, metTotal = 0;
      for (const [g, r] of Object.entries(k.need || {})) {
        const want = r * TIER_MULT[st.tier] * frac;
        const take = Math.min(st.stock[g], want);
        st.stock[g] -= take;
        wantTotal += want; metTotal += take;
        // Rolling, on the same daily basis as the shortfall reasons. Comparing a
        // weekly counter against weekly demand made every need look unmet for the
        // first day of every week, with no reason attached to explain it.
        const frac1 = want > 0 ? take / want : 1;
        st.metOf[g] = st.metOf[g] === undefined ? frac1 : st.metOf[g] * 0.72 + frac1 * 0.28;
      }
      let lux = 0;
      for (const [g, r] of Object.entries(k.luxury || {})) {
        const want = r * TIER_MULT[st.tier] * frac * 0.6;
        const take = Math.min(st.stock[g], want);
        st.stock[g] -= take;
        if (want > 0) lux += take / want;
      }
      const luxCount = Object.keys(k.luxury || {}).length || 1;
      const sat = wantTotal > 0 ? metTotal / wantTotal : 1;
      st.satisfaction = lerp(st.satisfaction, sat, 0.34);
      st.luxury = lerp(st.luxury ?? 0, lux / luxCount, 0.2);

      // decay the pile so a disconnected place doesn't hoard for ever
      for (const g of GOOD_KEYS) st.stock[g] *= 0.985;
    }

  }

  // ---- weekly ----------------------------------------------------------

  function weekly() {
    // The lands work on the line. Mirkholt rots it, the Marsh swallows it, the
    // Frostmarch shuts it. This is what makes the regions different places rather
    // than different textures.
    const winter = (s.week % 26) < 5;
    for (const L of s.links) {
      const creep = (L.decays || 0) + (L.sinks || 0);
      if (creep) L.upkeep = Math.min((L.baseUpkeep ?? L.upkeep) * 2.6, L.upkeep * (1 + creep));
      if (L.freezes) {
        if (winter && !L.wintered) { L.wintered = true; L.closed = Math.max(L.closed, 26); s.markDirty(); }
        if (!winter) L.wintered = false;
      }
    }
    if (winter && !s._winterNoted) {
      s._winterNoted = true;
      if (s.links.some((L) => L.freezes)) {
        s.note('The Frostmarch sections are drifted over. They will open when they open. The Authority has published a revised timetable with the northern services omitted rather than delayed, which the Council considers optimistic bookkeeping.', 'plain');
      }
    }
    if (!winter) s._winterNoted = false;

    // The deep bore. Driving a tunnel far beneath the Peaks is not free, and it
    // is not free in a way that no amount of money fixes.
    const deepest = s.links.reduce((m, L) => Math.max(m, L.boreDepth || 0), 0);
    s.deepestBore = deepest;
    // Thresholds measured against real alignments: a grade-limited bore under the
    // crest of the Peaks comes out around 28-34 units below ground, so the thread
    // must start there or it never starts at all.
    if (deepest > 24 && !s.bore1) { s.bore1 = true; s.emit('deep_bore', { stage: 1, depth: deepest }); }
    else if (s.bore1 && !s.bore2 && (deepest > 31 || s.week - (s.bore1Week || 0) > 5)) {
      s.bore2 = true; s.emit('deep_bore', { stage: 2, depth: deepest });
    } else if (s.bore2 && !s.bore3 && (deepest > 38 || s.week - (s.bore2Week || 0) > 6)) {
      s.bore3 = true; s.emit('deep_bore', { stage: 3, depth: deepest });
    }

    // Upkeep. Track gets dearer to hold as it ages — ballast settles, timbers
    // rot, tunnels want relining — which keeps a large mature network a real
    // ongoing cost rather than a solved problem.
    let up = 0;
    for (const L of s.links) {
      const age = Math.max(0, s.week - (L.builtWeek ?? s.week));
      up += L.upkeep * clamp(1 + age * 0.016, 1, 2.4);
    }
    up += s.engines.filter((e) => e.lineId !== null).length * 2.4;
    up += s.lines.filter((l) => l.warden).length * WARDEN_COST;
    // Administration. A realm of sixty stations cannot be run from the same small
    // building as a realm of twelve, and this is where a mature Authority's money
    // actually goes.
    up += s.sites.filter((x) => x.connected && !x.abandoned).length * 3.4;
    s.treasury -= up;
    s.stats.upkeepPaid += up;
    s.lastUpkeep = up;


    // The Council's grant.
    //
    // This used to be `34 + 3.2 * week`, which scaled with TENURE rather than
    // achievement: a player who built nothing was paid more every week, forever,
    // while the self-sufficiency taper only bit once you started earning. A
    // playtest sat idle for twenty-five weeks and went from 420 crowns to 1741.
    // The incentives were exactly inverted and there was no pressure anywhere.
    //
    // The Council funds an Authority that is *connecting the realm*. So the grant
    // scales with settlements actually served, and the Council loses patience if
    // the network stops growing. Tapered still by own receipts, because a body
    // that funds itself does not get funded twice.
    const earned = s.lines.reduce((n, l) => n + (l.stats?.revenue ?? 0), 0);
    // Was /300 with a 0.10 floor. Once the grant scales with settlements served,
    // that taper punishes the same success twice and the engaged player never
    // banks a reserve — balance runs sat at 15–90 crowns for twenty weeks and dipped
    // negative, which puts every improvement out of reach. Ease it.
    const selfSufficiency = 1 / (1 + earned / 900);
    const served = s.connectedCount();
    if (served > (s.grantPeak ?? 0)) { s.grantPeak = served; s.lastProgressWeek = s.week; }
    const stalled = Math.max(0, s.week - (s.lastProgressWeek ?? 0));
    // six weeks' grace, then they start asking what the money is for
    s.grantPatience = clamp(1 - Math.max(0, stalled - 6) / 15, 0.2, 1);
    // 3.4/settlement starved expansion: balance tripped "only 21/58 settlements
    // ever connected". The grant has to fund the next line as the realm widens, or
    // the anti-idling fix just becomes an anti-playing fix.
    const grant = (26 + 5.2 * Math.min(served, 26) + s.grantBonus)
      * lerp(0.55, 1.25, s.regard.men / 100)
      * clamp(selfSufficiency, 0.25, 1)
      * s.grantPatience;
    s.treasury += grant;
    s.stats.grants += grant;
    s.lastGrant = grant;

    // Passenger receipts: a gravity model over connected pairs, weighted by what
    // the services along the route are actually run for. A trunk line set to
    // Passengers earns nearly twice what the same track set to Freight does.
    const linkPax = new Map();
    const linkFare = new Map();
    for (const line of s.lines) {
      const ids = s.lineLinks(line);
      if (!ids) continue;
      // grace, not headcount: people will change trains to ride behind a Windward
      // and will walk rather than ride behind a Slagmaw.
      const pull = s.linePax(line)
        * s.enginesOf(line.id).reduce((n, e) => n + s.engineGrace(e), 0);
      for (const id of new Set(ids)) {
        linkPax.set(id, (linkPax.get(id) || 0) + pull);
        linkFare.set(id, Math.max(linkFare.get(id) || 0, FARES[line.fare].mul));
      }
    }
    let pax = 0;
    const paxByLine = new Map();
    for (const a of s.sites) {
      if (!a.connected || a.abandoned) continue;
      const { dist } = pathsFrom(a.id);
      for (const b of s.sites) {
        if (b.id <= a.id || !b.connected || b.abandoned) continue;
        const t = dist.get(b.id);
        if (t === undefined) continue;
        const h = hopsTo(a.id, b.id);
        if (!h || !h.hops.length) continue;
        let appeal = 0, fareM = 0;
        for (const id of h.hops) {
          appeal += clamp(linkPax.get(id) || 0, 0, 6) / 6;
          fareM += linkFare.get(id) || 1;
        }
        appeal /= h.hops.length;
        fareM /= h.hops.length;
        if (appeal <= 0.001) continue;
        const pull = Math.sqrt(a.pop * b.pop) / (26 + t * 1.5);
        const mix = a.culture === b.culture ? 1.0 : 1.35;   // people travel to see difference
        const take = pull * mix * appeal * fareM;
        pax += take;
        // attribute to the busiest service on the route
        for (const id of h.hops) {
          for (const line of s.lines) {
            if (s.enginesOf(line.id).length > 0 && (s.lineLinks(line) || []).includes(id)) {
              paxByLine.set(line.id, (paxByLine.get(line.id) || 0) + take / h.hops.length / 2);
              break;
            }
          }
        }
      }
    }
    pax *= 0.030;
    s.treasury += pax;
    s.stats.fares += pax;
    s.paxLast = pax;
    // Close each service's books for the week. This is what the Ledger reads.
    for (const line of s.lines) {
      const resolved = s.lineLinks(line);
      // A service whose route cannot be resolved is SEVERED — a link on it has been
      // destroyed or closed, so `lineLinks` returns null for the whole line. That
      // used to happen in total silence: the trains vanished from the map, capacity
      // and revenue went to zero, the engines stayed assigned, and the only hint was
      // an unrelated-looking margin note. A railway being cut is the most dramatic
      // thing that can happen to it and the player was not told.
      const severed = resolved === null;
      if (severed && !line.severed) {
        line.severed = true;
        const broke = s.links.filter((L) => (L.destroyed || L.closed)
          && (line.stops.includes(L.a) || line.stops.includes(L.b)));
        const where = broke.map((L) => `${s.byId.get(L.a)?.name ?? '?'}–${s.byId.get(L.b)?.name ?? '?'}`);
        const first = s.byId.get(line.stops[0])?.name ?? 'the line';
        const last = s.byId.get(line.stops[line.stops.length - 1])?.name ?? 'the far end';
        s.note(where.length
          ? `THE ROAD IS CUT AT ${String(where[0]).toUpperCase()}. NO SERVICE CAN BE WORKED `
            + `BETWEEN ${first.toUpperCase()} AND ${last.toUpperCase()} UNTIL IT IS MADE GOOD. `
            + `THE ENGINES ARE STANDING.`
          : `Service between ${first} and ${last} is suspended. The road will not resolve end to end `
            + `and Traffic cannot say why, which is itself a thing to report.`, 'bad', { chronicle: true });
      } else if (!severed && line.severed) {
        line.severed = false;
        s.note(`The road is open again. Working resumed over the whole length of the `
          + `${s.byId.get(line.stops[0])?.name ?? 'line'} service.`, 'good');
      }
      const ids = resolved || [];
      const uniq = [...new Set(ids)];
      let lineUp = s.enginesOf(line.id).reduce((n, e) =>
        n + (ENGINE_CLASSES[e.cls]?.upkeep ?? 2.4), 0) + (line.warden ? WARDEN_COST : 0);

      // WHAT A FARE TIER IS FOR.
      //
      // Cheap fares were a strictly dominated button: measured, they moved the same
      // tonnage as Standard for 28% less money, because tonnage is supply-limited and
      // no demand multiplier can conjure goods that nobody has spare. Raising the
      // multiplier (which I tried) changed 709 loads into 709 loads.
      //
      // So a fare tier buys something tonnage cannot: goodwill. A railway that carries
      // the realm cheaply makes it richer and better disposed to the Authority; one
      // that charges what the traffic will bear makes the Authority rich instead. That
      // is the argument every real railway had with its parish, and it makes the
      // control a decision rather than a slider with one correct setting.
      const fareTier = FARES[line.fare] ?? FARES[1];
      const goodwill = (1 - fareTier.mul) * 0.9;   // +0.25 at Cheap, -0.38 at Dear
      if (Math.abs(goodwill) > 0.01) {
        for (const id of line.stops) {
          const st = s.byId.get(id);
          if (!st || st.abandoned) continue;
          st.prosperity = clamp(st.prosperity + goodwill, 0, 100);
          const people = st.culture;
          if (people && s.regard[people] !== undefined) {
            s.regard[people] = clamp(s.regard[people] + goodwill * 0.30, 0, 100);
          }
        }
      }

      // Engines wear with the work they do. Driven from the SIMULATION's own measure
      // of that work, not from `eng.dist`, which is only ever incremented by the
      // renderer (world3d.js) — so a headless run or a hidden tab would age nothing
      // and condition would be decoration. Same trap as `nightness`.
      const runLen = uniq.reduce((n, id) => {
        const L = s.links.find((x) => x.id === id);
        return n + (L ? L.length : 0);
      }, 0);
      for (const e of s.enginesOf(line.id)) {
        const c = ENGINE_CLASSES[e.cls] || ENGINE_CLASSES.drover;
        const worked = runLen * c.speed;                 // units covered this week
        e.dist += worked;
        e.condition = clamp((e.condition ?? 1) - (worked / 1000) * 0.055 * c.wear, 0, 1);
        if (e.condition < 0.34 && !e.warned) {
          e.warned = true;
          s.note(`${e.name} has been stopped by the shed foreman, who declines to sign for her. `
            + `${Math.round(e.dist).toLocaleString('en-GB')} units run since new`
            + `${e.overhauls ? `, ${e.overhauls} overhaul${e.overhauls > 1 ? 's' : ''}` : ''}. `
            + `She will work if she is made to, and less of the train will arrive.`, 'bad');
        } else if (e.condition > 0.6) e.warned = false;
      }
      let worst = null, worstLoad = 0;
      for (const id of uniq) {
        const L = s.links.find((x) => x.id === id);
        if (!L) continue;
        // share a link's maintenance between the services that use it
        const sharers = s.lines.filter((l2) => (s.lineLinks(l2) || []).includes(id)).length || 1;
        lineUp += L.upkeep / sharers;
        if ((L.load ?? 0) > worstLoad) { worstLoad = L.load ?? 0; worst = L; }
      }
      line.stats = {
        loads: line.wk.loads,
        byGood: { ...line.wk.byGood },
        pax: paxByLine.get(line.id) || 0,
        revenue: line.wk.revenue + (paxByLine.get(line.id) || 0) * 0.030,
        upkeep: lineUp,
        worstLink: worst ? `${s.byId.get(worst.a)?.name ?? ''}–${s.byId.get(worst.b)?.name ?? ''}` : null,
        worstLoad,
      };
      line.wk = { loads: 0, revenue: 0, byGood: {} };
    }
    s.lastPax = pax;

    // ---- servicing the debt ------------------------------------------
    // Interest accrues and the lender takes what it can. Missing a payment costs
    // regard with that people, which is the point: a debt is a relationship.
    for (const d of [...s.debts]) {
      const interest = d.owed * d.rate;
      d.owed += interest;
      s.stats.interestPaid = (s.stats.interestPaid || 0) + interest;
      // a level repayment across the remaining term, floor of 6 crowns
      const weeksLeft = Math.max(1, d.term - (s.week - d.took));
      const due = Math.max(6, d.owed / weeksLeft);
      const L = LENDERS[d.lender];
      if (s.treasury >= due) {
        s.treasury -= due;
        d.owed = Math.max(0, d.owed - due);
        d.missed = Math.max(0, d.missed - 1);
      } else {
        d.missed++;
        s.regard[L.people] = clamp((s.regard[L.people] ?? 50) - 3.5, 0, 100);
        if (d.missed === 2 || d.missed === 5) {
          s.note(d.lender === 'delvers'
            ? `Ironmoot & Sons write to say that the payment is late. The letter is one line long and encloses a copy of the terms, with the relevant clause underlined twice.`
            : d.lender === 'crown'
              ? `The Crown has not been paid and has not mentioned it, which the Secretary finds considerably worse than a demand.`
              : `Nothing has come from the Havens about the missed payment. The Authority would prefer a letter.`,
            'bad');
        }
      }
      if (d.owed <= 0.5) {
        s.debts = s.debts.filter((x) => x.id !== d.id);
        if (d.lender === 'havens') s.havenBond = s.debts.some((x) => x.lender === 'havens');
        s.note(`The debt to ${L.name} is discharged. ${Math.round(d.principal)} crowns borrowed, `
          + `${Math.round(d.principal * (1 + d.rate * Math.max(1, s.week - d.took)))} repaid, and the paper returned.`, 'good');
      }
    }
    // The Havens lend on a condition, and they are watching.
    if (s.havenBond && s.orcTradeTotal > (s.havenBondOrcMark ?? s.orcTradeTotal) + 4) {
      s.havenBondOrcMark = s.orcTradeTotal;
      s.regard.elf = clamp(s.regard.elf - 12, 0, 100);
      s.note('The Havens have written once about the bond, and once only. They lent on a '
        + 'condition, the condition has not been kept, and they do not intend to discuss it.', 'bad',
        { chronicle: true });
    }
    s.debtOwed = s.debts.reduce((n, d) => n + d.owed, 0);

    // insolvency
    if (s.treasury < 0) {
      s.debtWeeks++;
      s.regard.men -= 4;
      s.emit('insolvent', { weeks: s.debtWeeks });
    } else s.debtWeeks = Math.max(0, s.debtWeeks - 1);

    // growth and decline
    for (const st of s.sites) {
      if (st.abandoned) continue;
      const conn = st.connected ? 1 : 0;
      // A place emptying westward, and a place taking those people in, are both
      // poorer for it. Carried in `fled`/`refuge` rather than in `pop`, because pop
      // is recomputed from tier and prosperity every week and would wash the wave
      // out inside a month.
      const target = 24 + 46 * st.satisfaction + 14 * (st.luxury ?? 0) + 12 * conn
        - 14 * st.unrest - 16 * st.plague
        - 22 * (st.fled ?? 0) - 9 * clamp(st.refuge ?? 0, 0, 2);
      st.prosperity = clamp(lerp(st.prosperity, target, 0.30), 0, 100);
      // Prosperity above roughly 70 grows a place; below roughly 40 it shrinks.
      // That band is the reason to serve a settlement well rather than merely
      // connect it.
      const targetPop = TIER_POP[st.tier] * (0.40 + 2.2 * Math.pow(st.prosperity / 100, 1.1));
      st.pop = lerp(st.pop, targetPop, 0.16);
      s.stats.peakProsperity = Math.max(s.stats.peakProsperity, st.prosperity);

      const maxTier = KINDS[st.kind].maxTier ?? 4;
      // the last step up also wants luxuries arriving, not merely food
      const luxOk = st.tier < 3 || (st.luxury ?? 0) > GREAT_CITY_LUXURY;
      if (st.tier < maxTier && st.pop > TIER_UP[st.tier] && luxOk && s.week - st.lastGrew > 2) {
        st.tier++; st.lastGrew = s.week;
        s.emit('grew', { site: st });
      } else if (st.tier > 0 && st.pop < TIER_POP[st.tier] * TIER_DOWN && s.week - st.lastGrew > 3) {
        st.tier--; st.lastGrew = s.week;
        s.emit('shrank', { site: st });
      }
      if (st.tier === 0 && st.pop < 22 && !st.connected) {
        st.abandoned = true;
        s.stats.abandoned++;
        s.markDirty();
        s.emit('abandoned', { site: st });
      }
      st.plague = Math.max(0, st.plague - 0.06);
      st.unrest = clamp(st.unrest - 0.05 + (st.satisfaction < 0.4 ? 0.09 : 0), 0, 1);
      st.exports = 0; st.imports = 0;
      for (const g of GOOD_KEYS) { st.supply[g] = 0; st.demand[g] = 0; st.got[g] = 0; }
    }

    // concord drifts toward how well their own places are doing
    for (const cKey of Object.keys(CULTURES)) {
      const own = s.sites.filter((x) => x.culture === cKey && !x.abandoned);
      if (!own.length) continue;
      const avgSat = own.reduce((n, x) => n + x.satisfaction, 0) / own.length;
      const connFrac = own.filter((x) => x.connected).length / own.length;
      let drift = (avgSat - 0.5) * 3.2 + (connFrac - 0.5) * 2.4;
      if (cKey === 'elf') {
        drift -= s.smokeIndex * 0.035;
        // they can be won round: a haven that prospers, and a realm that buys
        // what the Elves actually make, both count for a great deal
        const ownPros = own.reduce((n, x) => n + x.prosperity, 0) / own.length;
        drift += (ownPros - 50) * 0.045;
      }
      if (cKey === 'orc') drift -= 1.2;
      // "The Halflings will remember it." They do: the standing rebate is worth a
      // steady warmth for as long as it is actually being paid.
      if (cKey === 'halfling' && s.fareRebate && (s.rebatePaid || 0) > 0) drift += 0.9;
      // The Crown remembers its advances too. Each outstanding favour tilts Men's
      // regard toward the Authority needing to stay useful — warmth while solvent,
      // and a colder ledger than anyone else's if the Authority is not.
      if (cKey === 'men' && (s.crownFavours || 0) > 0) {
        drift += s.treasury >= 0 ? 0.3 * Math.min(3, s.crownFavours)
          : -0.8 * Math.min(3, s.crownFavours);
      }
      // The Dwarves are contractors before they are a people. Every crown spent
      // on works is a crown spent on them, and they are content accordingly.
      if (cKey === 'dwarf') drift += clamp(s.buildSpendWeek / 260, 0, 2.2);
      // A people with a long memory feels everything harder, for good and ill. This
      // is what `long_memory` was always meant to mean and never did.
      const memory = own.reduce((n, x) => Math.max(n, x.traitMods?.regardWeight ?? 1), 1);
      if (memory > 1) drift *= 1 + (memory - 1) * 0.5;
      s.regard[cKey] = clamp(s.regard[cKey] + drift, 0, 100);
    }
    s.smokeIndex *= 0.86;
    s.buildSpendWeek = 0;
    s.rebatePaid = 0;   // "being paid" means this week, not once ever
    // Congestion decays, because the register reads it as CURRENT state. It was a
    // lifetime counter: once three links had ever been tight, the "carrying
    // everything it can" report stayed armed for the rest of the run, naming
    // whichever link had been busiest in some forgotten week.
    for (const [id, n] of s.congestion) {
      if (n <= 1) s.congestion.delete(id);
      else s.congestion.set(id, Math.floor(n / 2));
    }

    // The Elves take ship. Requires sustained despair, not one bad week — losing
    // them is the heaviest thing that can happen and it should never feel like a
    // coin landing badly.
    if (!s.elvesGone) {
      s.elfDespair = s.regard.elf <= 4 ? (s.elfDespair || 0) + 1 : 0;
      if (s.elfDespair >= 3) {
        s.elvesGone = true;
        for (const st of s.sites) if (st.culture === 'elf') st.abandoned = true;
        s.markDirty();
        s.emit('elves_depart', {});
      } else if (s.elfDespair === 1) {
        s.emit('elves_warn', {});
      }
      // An EARLIER word, while there is still time to act on it. The notice above only
      // fires once elf regard is already at 4 or below — the bottom of the cliff, two
      // weeks from the ships sailing, and regard climbs far too slowly to recover from
      // there. Losing the Elves is the heaviest thing in the game and it was arriving
      // without a warning the player could do anything about.
      if (!s.elfUnease && s.regard.elf < 26 && s.week > 6) {
        s.elfUnease = true;
        const felling = s.smokeIndex > 8;
        s.emit('elves_unease', {
          smoke: Math.round(s.smokeIndex),
          why: felling ? 'smoke' : 'neglect',
        });
      }
      if (s.regard.elf > 40) s.elfUnease = false;
    }

    // ── what the particular places do to the realm ────────────────────────
    // toll, omen and shameful were fields invented for ferry_rights, silent_bell and
    // slave_pens and then never read, so three of the most characterful things a
    // settlement could be did precisely nothing.
    let tolls = 0, omens = 0, shame = 0, groves = 0;
    for (const st of s.sites) {
      if (st.abandoned || !st.connected) continue;
      const m = st.traitMods;
      if (!m) continue;
      tolls += m.toll || 0;                       // ancient ferry rights still pay
      omens += m.omen || 0;                       // a bell that never rings
      shame += m.shameful || 0;                   // pens nobody inspects
      groves += m.elfCare || 0;                   // a grove nobody cuts
    }
    if (tolls > 0) {
      s.treasury += tolls;
      s.stats.fares += tolls;
      s.lastTolls = tolls;
    }
    if (shame > 0) {
      // Serving a place like that is worth money and costs you everyone else.
      for (const k of ['halfling', 'elf', 'men', 'dwarf']) {
        s.regard[k] = clamp(s.regard[k] - shame * 0.55, 0, 100);
      }
      if (!s.shameNoted && s.week > 4) {
        s.shameNoted = true;
        s.note('A question has been asked in Council about what the Authority carries out '
          + 'of the eastern holds, and who loads it. The Authority has answered that it '
          + 'carries what is presented at the platform. The question has been asked again.', 'bad');
      }
    }
    if (groves > 0) s.regard.elf = clamp(s.regard.elf + groves * 0.45, 0, 100);

    // the Shadow
    const eastReach = s.links.reduce((m, L) => {
      const a = s.byId.get(L.a), b = s.byId.get(L.b);
      return Math.max(m, a ? a.x : -1e9, b ? b.x : -1e9);
    }, -1e9);
    const eastFrac = clamp((eastReach / (world.worldW / 2) + 0.1) / 1.0, 0, 1);
    // The Shadow was `0.80 + week * 0.100 + eastFrac * 1.7`, which is a CLOCK, not a
    // mechanic: the time terms alone sum to 70 by week 30, so Age III arrived around
    // week 27 and the world ended at shadow 100 around week 35 no matter what the
    // player did. Measured over five seeds, every run ended on 'shadow' — "The East
    // Came West" was simply the default outcome of not going bankrupt first, and
    // `ENDINGS.survived` was unreachable. A doom you cannot affect is not a threat,
    // it is a timer, and it made every decision in the game feel weightless.
    //
    // It now answers to what the Authority actually DOES. Time still presses — this
    // is a story about an age ending — but it is now the smallest term rather than
    // the whole of it.
    const stirred =
        eastFrac * 1.75                                 // how far east the rails run
      + clamp(s.orcTradeTotal * 0.008, 0, 1.6)          // what you carry for the orcs
      + clamp((s.smokeIndex ?? 0) * 0.040, 0, 0.9)      // the smoke of the works
      + (s.concession ? 0.45 : 0)                       // the bargain you struck
      + clamp((s.deepestBore ?? 0) * 0.018, 0, 0.8)     // how deep you dug
      + clamp(omens, 0, 0.6);                           // bells that will not ring
    // Peace and good standing hold it back — the realm in concord is a bulwark.
    const held = clamp((s.concordAvg() - 45) / 100, -0.25, 0.45)
      + clamp((s.prosperityAvg(true) - 50) / 220, -0.2, 0.3);
    // Capped, and this cap is load-bearing. Uncapped, driving east put the rate near
    // 3.4 a week and the world ended at week 30 — which meant that PURSUING the errand
    // reliably killed you before you could discharge it, and the game's only good
    // ending stayed unreachable for a second, subtler reason than the first. The
    // ceiling keeps the race tight (a hard eastern push still ends an age) while
    // leaving enough weeks to actually finish the job.
    s.shadowRate = clamp(0.30 + s.week * 0.014 + stirred - held, 0, 2.35);
    s.shadow = clamp(s.shadow + s.shadowRate, 0, 100);

    const wasAge = s.age;
    // Age III was gated purely on the Shadow curve, so a careful western player who
    // kept the Shadow low never reached it at all — and the whole of Age III would
    // then never fire for exactly the player most likely to survive it. DESIGN.md
    // says "week 25+"; the Shadow can bring it sooner, but it comes regardless.
    if (s.shadow > 60 || s.week >= 30) s.age = 3;
    else if (s.shadow > 26 || s.week > 9) s.age = 2;
    if (s.age !== wasAge) s.emit('age', { age: s.age });
    if (s.age >= 3) hostWeekly();

    // The year's account, every twelfth week. This is the register's throughline.
    if (s.week > 0 && s.week % 12 === 0) annualReport();

    // A new place every two or three weeks once the network is worth settling
    // beside, rising with how much railway there is to settle beside.
    if (s.week > 3 && s.links.length > 0) {
      const p = clamp(0.16 + s.links.length * 0.022, 0, 0.52);
      if (s.rng.chance(p)) s.foundSettlement();
    }


    s.comm.week(s);
    s.comm.tickPassage(s, 1);


    // The Council sits quarterly, and the item lapses if it is not reached.
    //
    // This used to be `if (!s.charterOffer) s.charterOffer = rollCharters()` every
    // single week, so a charter was permanently on the table from week one and the
    // top bar pulsed "A charter awaits" for the whole game. A standing menu that
    // never expires is not an occasion and creates no decision: there is never a
    // reason to take this one rather than wait. Now it convenes, it sits for a
    // month, and if you dither the clerk minutes that the item was not reached.
    if (s.charterOffer && s.week >= (s.charterLapses ?? Infinity)) {
      const lapsed = s.charterOffer;
      s.charterOffer = null;
      s.charterLapses = null;
      const lapseLines = [
        `The Council rose without reaching the item. ${lapsed[0].name} stands adjourned to no date.`,
        `Minute: the charter was not moved, no member being willing to move it. The papers have gone back to the shelf they came from.`,
        `The item lapsed. The Secretary has entered it as “not reached”, which is the form used when a thing has been avoided on purpose.`,
      ];
      s.note(lapseLines[Math.floor(s.rng() * lapseLines.length)] ?? lapseLines[0], 'wry');
    }
    if (!s.charterOffer && s.week >= (s.nextCouncil ?? 3)) {
      const roll = rollCharters();
      if (roll) {
        s.charterOffer = roll;
        s.charterSat = s.week;
        s.charterLapses = s.week + 4;
      }
      s.nextCouncil = s.week + 9;
    }

    s.week++;
    s.stats.longestLine = s.lines.reduce((m, l) => Math.max(m, l.stops.length), 0);
  }

  function rollCharters() {
    const pool = CHARTERS.filter((c) => c.avail(s) && (c.weight(s) ?? 0) > 0);
    if (!pool.length) return null;
    const pick = [];
    const bag = pool.slice();

    // Guarantee the capability the map is currently demanding. A run where the
    // Delvers' Charter simply never came up cannot cross the Peaks at all, and
    // that is a soft-lock rather than a difficulty.
    //
    // THIS GUARANTEE DID NOT WORK, and the way it failed is worth keeping in mind.
    // It searched `bag`, which is built from `pool`, which is
    // `CHARTERS.filter(c => c.avail(s))` — and `delvers.avail` is
    // `!s.can.tunnel && s.regard.dwarf > 26`. Dwarf regard falls to 0 in essentially
    // every run, so the charter was filtered out of the pool by the exact condition
    // the guarantee existed to work around, `findIndex` returned -1, and nothing
    // happened. Measured: dwarf regard 0 in 3 of 3 seeds; `charters: bridge` only.
    //
    // The consequence was a closed loop. No charter means no tunnels; no tunnels
    // means `s.regard.dwarf += 1.4 * survey.tunnels` (the largest single source of
    // dwarf regard) can never fire; and low dwarf regard means no charter. The whole
    // deep-bore and balrog thread sat behind it, unreachable — which I previously,
    // and wrongly, blamed on the router preferring passes. The router bores happily:
    // 135 of 470 routable pairs contain a tunnel once `can.tunnel` is true.
    //
    // So the guarantee now draws from CHARTERS itself, bypassing the regard gate.
    // The Delvers are contractors before they are friends; they will take the work
    // whatever they think of the Authority.
    const needed = [];
    if (!s.can.tunnel && s.week > 5) needed.push('delvers');
    if (!s.can.bridge) needed.push('bridgewrights');
    for (const id of needed) {
      const i = bag.findIndex((c) => c.id === id);
      if (i >= 0) { pick.push(bag.splice(i, 1)[0]); break; }
      // not in the eligible pool — force it in anyway, that is the point
      const forced = CHARTERS.find((c) => c.id === id);
      if (forced) { pick.push(forced); break; }
    }
    while (pick.length < Math.min(3, pool.length) && bag.length) {
      let total = 0;
      for (const c of bag) total += c.weight(s);
      let r = s.rng() * total;
      let idx = 0;
      for (let i = 0; i < bag.length; i++) { r -= bag[i].weight(s); if (r <= 0) { idx = i; break; } }
      pick.push(bag.splice(idx, 1)[0]);
    }
    return pick;
  }

  s.takeCharter = (id) => {
    if (!s.charterOffer) return { ok: false };
    const c = s.charterOffer.find((x) => x.id === id);
    if (!c) return { ok: false };
    c.apply(s);
    s.charterOffer = null;
    s.charterLapses = null;
    s.emit('charter', { charter: c });
    return { ok: true, charter: c };
  };

  // ---- the map grows ---------------------------------------------------
  //
  // A railway's historical effect is that places appear along it. Without this
  // the map has exactly the settlements it started with for the whole game, and
  // no amount of tier growth makes the world feel alive.

  let nextSiteId = 1000;

  /** A name from the pool that is not already on the map. */
  function freeName(kind) {
    const pool = NAMES[kind] || [];
    const taken = new Set(s.sites.map((x) => x.name));
    const free = pool.filter((n) => !taken.has(n));
    if (free.length) return free[s.rng.int(0, free.length - 1)];
    // pools run dry on a long game; suffix in the English manner
    const base = pool[s.rng.int(0, Math.max(0, pool.length - 1))] || 'Newmarch';
    for (const suffix of [' Parva', ' Magna', ' New', ' Bridge', ' Halt', ' Sidings']) {
      if (!taken.has(base + suffix)) return base + suffix;
    }
    return `${base} ${s.sites.length}`;
  }

  /**
   * Found a settlement near existing track. Deliberately *near* and not *on* it:
   * the player then has a cheap, obvious, satisfying thing to connect.
   */
  s.foundSettlement = () => {
    const live = s.links.filter((L) => !L.destroyed);
    if (!live.length) return null;
    // The west is crowded; 44 units of clearance rejected most candidates and the
    // map grew about half as fast as intended.
    const MIN_SEP = 37, MAX_SEP = 150;

    for (let attempt = 0; attempt < 160; attempt++) {
      const L = live[s.rng.int(0, live.length - 1)];
      const p = L.pts[s.rng.int(0, L.pts.length - 1)];
      const ang = s.rng() * Math.PI * 2;
      const dist = s.rng.range(MIN_SEP + 6, MAX_SEP);
      const x = p.x + Math.cos(ang) * dist;
      const z = p.z + Math.sin(ang) * dist;

      const half = { w: world.worldW * 0.46, h: world.worldH * 0.46 };
      if (Math.abs(x) > half.w || Math.abs(z) > half.h) continue;
      if (world.waterAt(x, z)) continue;
      const h = world.heightAt(x, z);
      if (h < 3 || h > 64) continue;
      if (world.slopeAt(x, z) > 0.5) continue;

      // far enough from everything that already exists
      let clear = true;
      for (const st of s.sites) {
        if (st.abandoned) continue;
        if (Math.hypot(st.x - x, st.z - z) < MIN_SEP) { clear = false; break; }
      }
      if (!clear) continue;

      const region = world.regionAt(x, z);
      const kinds = FOUNDABLE[region] || [];
      if (!kinds.length) continue;
      const kind = kinds[s.rng.int(0, kinds.length - 1)];
      // the Elves are not founding anything once they have gone
      if (kind === 'haven' && s.elvesGone) continue;

      const cell = world.toCell(x, z);
      const base = {
        id: nextSiteId++, name: freeName(kind), kind,
        culture: CULTURE_OF_KIND[kind],
        cx: cell.cx, cy: cell.cy, x, z, y: h, region, tier: 0,
        traits: [], founded: s.week,
      };
      // one trait, so a new place is a place and not a placeholder
      const eligible = TRAIT_KEYS.filter((k) => {
        const t = TRAITS[k];
        if (t.kinds && !t.kinds.includes(kind)) return false;
        if (t.regions && !t.regions.includes(region)) return false;
        if (t.nearWater) return false;
        return true;
      });
      if (eligible.length) base.traits = [eligible[s.rng.int(0, eligible.length - 1)]];

      const st = s.dressSite(base, s.rng);
      st.pop = TIER_POP[0] * s.rng.range(0.45, 0.75);
      st.prosperity = 34;
      s.sites.push(st);
      s.byId.set(st.id, st);
      s.markDirty();
      s.stats.founded = (s.stats.founded || 0) + 1;
      s.emit('founded', { site: st, near: L });
      return st;
    }
    return null;
  };

  // ---- peril -----------------------------------------------------------
  // ---- peril -----------------------------------------------------------

  let perilClock = 0;
  function perilTick(dt) {
    perilClock += dt;
    if (perilClock < 4) return;
    perilClock = 0;
    // a length-and-peril weighted lottery over open track
    let total = 0;
    const open = s.links.filter((L) => !L.closed && !L.destroyed);
    // `s.nightness` was read here and assigned NOWHERE, so this was permanently 0 and
    // nocturnal track got the x0.12 daylight weight for ever — the exact inverse of
    // the gazetteer's "incidents here happen only after dark, and they happen more".
    //
    // Derived from the simulation's own clock rather than the renderer's: incident
    // rolls are seeded, and sourcing the time of day from the render loop would make
    // them depend on frame rate and break reproducibility. The renderer's day cycle
    // is cosmetic and runs to its own period.
    const phase = ((s.t % DAY) + DAY) % DAY / DAY;      // 0 = midnight
    const night = (phase < 0.22 || phase > 0.80) ? 1 : 0;
    s.nightness = night;
    const weightOf = (L) => {
      let w = L.length * L.peril * (L.guarded ? 0.5 : 1);
      // the Barrowdowns are quiet and bright by day, and are not either at night
      if (L.nocturnal) w *= night > 0.5 ? 2.6 : 0.12;
      return w;
    };
    for (const L of open) total += weightOf(L);
    const guard = 1 - s.perilGuard;
    // Sub-linear in network size. Scaling the rate linearly with total perilous
    // mileage means a mature network is permanently on fire — 99 incidents in 35
    // weeks in testing — because every new mile raises the odds on every check.
    // What the player should feel is a rising drumbeat, not a hailstorm.
    const perWeek = 0.9 * Math.sqrt(total / 1000)
      * guard * (s.age === 3 ? 1.9 : s.age === 2 ? 1.25 : 1);
    const checksPerWeek = WEEK / 4;
    if (!s.rng.chance(clamp(perWeek / checksPerWeek, 0, 0.30))) return;
    let r = s.rng() * total;
    let hit = open[0];
    for (const L of open) { r -= weightOf(L); if (r <= 0) { hit = L; break; } }
    if (!hit) return;
    s.stats.incidents++;
    for (const e of s.engines) {
      if (e.lineId === null) continue;
      const ids = s.lineLinks(s.lines.find((l) => l.id === e.lineId) || { stops: [] });
      if (ids && ids.includes(hit.id)) e.incidents++;
    }
    s.emit('incident', { link: hit });
  }

  // ---- the clock -------------------------------------------------------

  s.step = (dt) => {
    if (s.over) return;
    s.t += dt;
    perilTick(dt);

    // reopen closed track — except what the host holds. This loop melts `closed`
    // by clearRate per second, which is right for a rockfall and wrong for an
    // occupying army: the Muster's captures were reopening themselves about one
    // simulated second after being taken, so the march never actually cost the
    // player their road.
    for (const L of s.links) {
      if (L.closed > 0 && !L.taken) {
        L.closed = Math.max(0, L.closed - dt * s.clearRate);
        if (L.closed === 0) s.markDirty();
      }
    }

    const wantDays = Math.floor(s.t / DAY);
    while (s.dayCount < wantDays) {
      s.dayCount++;
      pathCache.clear();
      dailySolve();
      if (s.dayCount % 7 === 0) weekly();
      if (s.events) s.events.tick(s);
      if (s.over) return;
    }
  };

  // ---- reporting -------------------------------------------------------

  s.emit = (kind, data) => {
    if (s.events) s.events.on(s, kind, data);
  };

  /**
   * THE ANNUAL REPORT.
   *
   * The register was a series of vignettes with no throughline: individually decent,
   * but nothing accumulated, nothing referred back, and after thirty weeks a player
   * had no sense of having built a history — only of having read some paragraphs.
   *
   * This is the throughline. Once a year the Authority reports on itself, in its own
   * flat voice, entirely in facts drawn from THIS run and set against LAST year's
   * figures, so the story that emerges is the player's own. No commentary, no
   * closing wink: the numbers are the narrative.
   */
  function annualReport() {
    const year = Math.floor(s.week / 12);
    const prev = s.annals[s.annals.length - 1] || null;
    const road = s.links.reduce((n, L) => n + (L.destroyed ? 0 : L.length), 0);
    const served = s.connectedCount();
    const carried = Math.round(s.stats.loadsMoved);
    const live = s.sites.filter((x) => !x.abandoned);
    const biggest = live.slice().sort((a, b) => b.pop - a.pop)[0];
    const now = {
      year, week: s.week, road: Math.round(road), served, carried,
      regard: { ...s.regard },
      biggest: biggest ? biggest.name : null,
      biggestPop: biggest ? Math.round(biggest.pop) : 0,
      places: live.length,
    };

    const was = (v, p) => (p === null || p === undefined ? '' : `, against ${p} last year`);
    const L = [];
    L.push(`THE AUTHORITY’S ANNUAL REPORT. Year ${year}, to the quarter day.`);
    L.push('');
    L.push(`Road open at the year’s end: ${now.road} miles${was(now.road, prev && prev.road)}.`);
    L.push(`Places served: ${served}${was(served, prev && prev.served)}.`);
    L.push(`Loads carried since the Authority was founded: ${carried.toLocaleString('en-GB')}`
      + `${prev ? `, of which ${(carried - prev.carried).toLocaleString('en-GB')} this year` : ''}.`);

    // ONE THING THAT CHANGED THIS YEAR, and never the same thing twice. The first
    // draft printed the same sentence about the largest place in year one and year
    // two, which turns a report into a template — and a template is exactly what
    // reads as machine-written. Candidates are tried in order and the first one not
    // already used is taken.
    const said = new Set(s.annals.map((x) => x.toldKey).filter(Boolean));
    const cands = [];
    if (prev && prev.biggest && biggest && prev.biggest !== biggest.name) {
      cands.push(['overtook',
        `${biggest.name} has passed ${prev.biggest} and is now the largest place on the system.`]);
    }
    // a place founded since the last report, which is the railway making the map
    const born = live.filter((x) => (x.founded ?? 0) > (prev ? prev.week : 0));
    if (born.length) {
      const b0 = born.sort((x, y) => y.pop - x.pop)[0];
      cands.push(['born',
        born.length === 1
          ? `${b0.name} did not exist last year. It has ${Math.round(b0.pop)} people in it and has asked for a siding.`
          : `${born.length} places have been entered on the map that were not on it last year. `
            + `The largest, ${b0.name}, has ${Math.round(b0.pop)} people and no church.`]);
    }
    // a milestone crossed this year
    for (const [id, wk] of Object.entries(s.firsts || {})) {
      if (prev && wk <= prev.week) continue;
      const what = {
        first_bridge: 'the first bridge', first_pass: 'the first pass',
        first_bore: 'the first bore', first_marsh: 'the first causeway',
        first_wood: 'the first road through the wood', first_east: 'the eastern road',
        first_wrack: 'the road to Mount Wrack', first_quays: 'the road to the Grey Quays',
      }[id];
      if (what) cands.push(['first:' + id, `${what[0].toUpperCase()}${what.slice(1)} was opened in week ${wk}.`]);
    }
    if (biggest) {
      const firstReached = s.links
        .filter((x) => x.a === biggest.id || x.b === biggest.id)
        .reduce((m, x) => Math.min(m, x.builtWeek ?? s.week), Infinity);
      cands.push(['big', Number.isFinite(firstReached)
        ? `${biggest.name} had ${TIER_NAME[Math.max(0, biggest.tier - 1)]} written against it when the `
          + `Authority first reached it in week ${firstReached}. It is a ${TIER_NAME[biggest.tier]} of `
          + `${now.biggestPop} now.`
        : `${biggest.name} is the largest place ${served > 0 ? 'on the system' : 'in the realm, which the Authority does not yet reach'}, at ${now.biggestPop}.`]);
    }
    // Whose opinion of the Authority moved most, named without editorial.
    if (prev && prev.regard) {
      let worstKey = null, worstDelta = 0;
      for (const k of ['halfling', 'dwarf', 'elf', 'men', 'orc']) {
        const d = (s.regard[k] ?? 50) - (prev.regard[k] ?? 50);
        if (Math.abs(d) > Math.abs(worstDelta)) { worstDelta = d; worstKey = k; }
      }
      if (worstKey && Math.abs(worstDelta) > 12) {
        const who = CULTURES[worstKey]?.theName ?? worstKey;
        cands.push(['regard', worstDelta < 0
          ? `${who} think less of the Authority than they did a year ago, by a margin the `
            + 'Secretary has declined to put a number to in the printed version.'
          : `${who} think better of the Authority than they did a year ago. No minute records why.`]);
      }
    }
    // What the Authority owes, which is a fact about its future.
    if ((s.debtOwed ?? 0) > 40) {
      cands.push(['debt', `Outstanding against the Authority at the quarter day: `
        + `${Math.round(s.debtOwed)} crowns. The lenders have been written to and have not replied, `
        + 'which is customary and is not reassuring.']);
    }
    // The fleet, as a fact about wear rather than a count.
    const worn = s.engines.filter((e) => (e.condition ?? 1) < 0.5).length;
    if (worn > 0) {
      cands.push(['worn', `${worn} engine${worn > 1 ? 's are' : ' is'} out of the road and `
        + `awaiting the shops. ${worn > 1 ? 'They have' : 'She has'} run what ${worn > 1 ? 'they were' : 'she was'} asked to run.`]);
    }
    const chosen = cands.find(([k]) => !said.has(k)) || null;
    if (chosen) { now.toldKey = chosen[0]; L.push(''); L.push(chosen[1]); }

    // What is gone. Named, because a list of names is the plainest kind of grief.
    // Only what was lost SINCE the last report — otherwise every year re-reads the
    // same list of the dead and the account stops being a record of the year.
    const goneAll = s.sites.filter((x) => x.abandoned).map((x) => x.name);
    const seenGone = new Set(s.annals.flatMap((a) => a.gone || []));
    const gone = goneAll.filter((n) => !seenGone.has(n));
    now.gone = goneAll;
    if (gone.length) {
      L.push('');
      L.push(gone.length === 1
        ? `${gone[0]} is empty and has been struck from the timetable.`
        : `Struck from the timetable this year: ${gone.slice(0, 4).join(', ')}`
          + `${gone.length > 4 ? `, and ${gone.length - 4} other${gone.length - 4 > 1 ? 's' : ''}` : ''}.`);
    }
    // Said twice and then let alone: a standing absence repeated every year is a tic,
    // and the silence speaks better once the register stops mentioning it.
    if (s.elvesGone && s.annals.filter((a) => a.saidElves).length < 2) {
      now.saidElves = true;
      L.push('Nothing has been heard from the Grey Quays.');
    }

    // The thing the Authority is proudest of, stated without pride.
    const deepest = Math.round(s.deepestBore || 0);
    if (deepest > 6) {
      L.push('');
      L.push(`The deepest working under the Peaks stands at ${deepest} fathoms. `
        + 'It is ventilated, timbered and signed for.');
    }
    // End on a fact, per VOICE.md, not on a remark about the report.
    const worst = s.links.filter((x) => !x.destroyed)
      .sort((a, b) => (b.load ?? 0) - (a.load ?? 0))[0];
    if (worst) {
      const wa = s.byId.get(worst.a), wb = s.byId.get(worst.b);
      L.push('');
      L.push(`The busiest section is ${wa?.name ?? '?'} to ${wb?.name ?? '?'}, `
        + `running at ${Math.round((worst.load ?? 0) * 100)} per cent of what it can carry.`);
    }

    s.annals.push(now);
    s.note(L.join('\n'), 'plain', { chronicle: true, big: true, form: 'return' });
  }
  s.annualReport = annualReport;

  s.note = (text, tone = 'plain', opts = {}) => {
    const entry = { week: s.week, text, tone, ...opts };
    // A monotonic sequence number, because the log CAPS at 220 and shifts old
    // entries off the front. Anything tracking "what have I already shown" by array
    // length stops dead the moment the cap is reached — which is how the on-screen
    // Register silently froze for the rest of every long game.
    entry.seq = s.noteSeq = (s.noteSeq || 0) + 1;
    s.log.push(entry);
    if (s.log.length > 220) s.log.shift();
    if (opts.chronicle) s.chronicle.push(entry);
    return entry;
  };

  s.connectedCount = () => s.sites.filter((x) => x.connected && !x.abandoned).length;
  s.prosperityAvg = (connectedOnly = false) => {
    const live = s.sites.filter((x) => !x.abandoned && x.culture !== 'orc'
      && (!connectedOnly || x.connected));
    return live.length ? live.reduce((n, x) => n + x.prosperity, 0) / live.length : 0;
  };
  s.concordAvg = () => (s.regard.halfling + s.regard.dwarf + s.regard.elf + s.regard.men) / 4;

  /** What a settlement wants, what it is getting, and why not more. */
  /**
   * What is standing on a settlement's platform waiting to be taken away, and how
   * many people want to travel.
   *
   * The solver already knows both — it computes a supplier's spare stock above a
   * 1.4x own-need reserve every single day (see the suppliers pass) and a passenger
   * pull per connected pair — but neither was ever exposed, so a player could not
   * see a heap of ore sitting at a delve for want of a wagon. That is the most
   * legible economic fact a railway has, and it was the one thing missing.
   */
  s.waitingAt = (st) => {
    if (!st || st.abandoned) return { goods: [], people: 0, total: 0 };
    const k = KINDS[st.kind] || {};
    const goods = [];
    for (const g of GOOD_KEYS) {
      const held = st.stock?.[g] ?? 0;
      if (held <= 0.05) continue;
      // mirror the solver's own reserve: a place keeps 1.4x what it needs itself
      const ownNeed = (k.need?.[g] ?? 0) * TIER_MULT[st.tier] * 1.4;
      const spare = held - ownNeed;
      if (spare > 0.05) goods.push({ good: g, amount: spare, held });
    }
    goods.sort((a, b) => b.amount - a.amount);
    // people wanting to travel: scales with the place's size and how well it is
    // connected, and is suppressed when it is shut or sick
    const reach = s.linesReaching ? (s.linesReaching(st.id)?.length ?? 0) : 0;
    const people = (st.connected && !st.quarantined)
      ? Math.max(0, st.pop * 0.012 * (0.5 + 0.5 * Math.min(reach, 4) / 4)) : 0;
    return { goods, people, total: goods.reduce((n, x) => n + x.amount, 0) };
  };

  s.needsOf = (st) => {
    const k = KINDS[st.kind];
    const out = [];
    for (const [g, r] of Object.entries(k.need || {})) {
      const want = r * TIER_MULT[st.tier];          // per week, for display
      const met = clamp(st.metOf?.[g] ?? 0, 0, 1);  // rolling, daily basis
      out.push({
        good: g, want, met,
        got: want * met,                            // the weekly-rate equivalent
        why: met < 0.6 ? (st.why?.[g] || null) : null,
      });
    }
    return out.sort((a, b) => a.met - b.met);
  };

  /** Links at or near capacity, worst first. */
  s.bottlenecks = (n = 4) => s.links
    .filter((L) => L.hasService && (L.load ?? 0) > 0.55)
    .sort((a, b) => (b.load ?? 0) - (a.load ?? 0))
    .slice(0, n)
    .map((L) => ({
      id: L.id, load: L.load ?? 0,
      name: `${s.byId.get(L.a)?.name ?? '?'} – ${s.byId.get(L.b)?.name ?? '?'}`,
    }));

  /** Settlements going without, worst first. */
  s.wanting = (n = 6) => {
    const out = [];
    for (const st of s.sites) {
      if (st.abandoned || !st.connected) continue;
      for (const nd of s.needsOf(st)) {
        if (nd.met < 0.6 && nd.why) out.push({ site: st, ...nd });
      }
    }
    return out.sort((a, b) => a.met - b.met).slice(0, n);
  };

  /** Which services could take on this settlement as a further call. */
  s.linesReaching = (siteId) => s.lines.filter((l) => {
    if (l.stops.includes(siteId)) return false;
    const first = l.stops[0], last = l.stops[l.stops.length - 1];
    return !!(hopsTo(last, siteId) || hopsTo(first, siteId));
  });

  s.snapshot = () => ({
    week: s.week, age: s.age, treasury: Math.round(s.treasury),
    shadow: +s.shadow.toFixed(1),
    prosperity: +s.prosperityAvg().toFixed(1),
    prosperityServed: +s.prosperityAvg(true).toFixed(1),
    concord: +s.concordAvg().toFixed(1),
    regard: { ...s.regard },
    connected: s.connectedCount(), sites: s.sites.filter((x) => !x.abandoned).length,
    links: s.links.length, lines: s.lines.length,
    engines: `${s.enginesInUse()}/${s.stock.engines}`,
    loads: Math.round(s.stats.loadsMoved), incidents: s.stats.incidents,
    can: { ...s.can }, over: s.over,
  });

  return s;
}
