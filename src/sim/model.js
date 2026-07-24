// The economy, as tables. Everything here is per week at tier 1.
//
// The load-bearing design fact: a Delve produces iron and cannot grow food. A
// Grange grows food and has no tools. Neither can do anything about this without
// a railway. Every other system in the game hangs off that one asymmetry.

// Real seconds per week at 1x, and how fast a train moves in world units per
// second. These two numbers together decide whether the railway can physically
// serve the continent: the map is ~1120 units across, so a train must cover
// several times that in a week or nothing ever arrives anywhere.
export const WEEK = 90;
export const DAY = WEEK / 7;
export const BASE_SPEED = 30;      // world units per second
export const CAR_LOADS = 8;        // loads carried per wagon per traversal

export const GOODS = {
  grain:    { name: 'Grain',    colour: '#c9a94e', bulk: 1.0, wagon: 'grain' },
  ale:      { name: 'Ale',      colour: '#a5713a', bulk: 0.9, wagon: 'barrel' },
  pipeweed:     { name: 'Pipeweed',     colour: '#8a7a4e', bulk: 0.6, wagon: 'grain' },
  timber:   { name: 'Timber',   colour: '#7a5c3c', bulk: 1.2, wagon: 'timber' },
  stone:    { name: 'Stone',    colour: '#8b857c', bulk: 1.5, wagon: 'ore' },
  ore:      { name: 'Iron Ore', colour: '#6d5546', bulk: 1.4, wagon: 'ore' },
  coal:     { name: 'Coal',     colour: '#2a262a', bulk: 1.3, wagon: 'ore' },
  steel:    { name: 'Steel',    colour: '#8f98a3', bulk: 1.1, wagon: 'flat' },
  wine:     { name: 'Wine',     colour: '#7d2f42', bulk: 0.7, wagon: 'barrel' },
  lore:     { name: 'Lore',     colour: '#c8d4d8', bulk: 0.2, wagon: 'van' },
  arms:     { name: 'Arms',     colour: '#9e3b3b', bulk: 1.0, wagon: 'arms' },
  ashglass: { name: 'Ashglass', colour: '#ff6a2a', bulk: 0.6, wagon: 'arms' },
  // Only a delve with a very deep shaft yields any, and only a little. Everyone
  // wants it, nobody needs it, and it pays more per load than anything else.
  mithril:  { name: 'Mithril',  colour: '#cfd8de', bulk: 0.1, wagon: 'arms' },
  // The one cure for the sweating sickness. The Elves grow it; nobody else can.
  athelas:  { name: 'Athelas',  colour: '#7fae9d', bulk: 0.2, wagon: 'van' },
};

export const GOOD_KEYS = Object.keys(GOODS);

/** Value per load, used for fares and for export income. */
export const VALUE = {
  grain: 2.0, ale: 2.6, pipeweed: 4.2, timber: 2.2, stone: 1.8, ore: 2.8,
  coal: 2.6, steel: 6.0, wine: 5.5, lore: 9.0, arms: 8.5, ashglass: 13.0, mithril: 48.0, athelas: 11.0,
};

/** tier 0..4 output and consumption multiplier */
export const TIER_MULT = [0.80, 1.25, 2.0, 2.9, 3.9];
export const TIER_NAME = ['hamlet', 'village', 'town', 'city', 'great city'];
export const TIER_POP = [60, 170, 480, 1250, 2800];
// Population needed to climb to the next tier. Kept at 1.75x the tier's nominal
// population so that the growth curve in sim.js can actually reach it — set any
// higher and a hamlet can never become a village however well it is served.
export const TIER_UP = [105, 300, 850, 2500, Infinity];
export const TIER_DOWN = 0.66;    // fraction of nominal population that demotes
// A great city needs more than bread. Without this gate every well-served town
// on a well-run network became one, which flattened the whole late game.
export const GREAT_CITY_LUXURY = 0.45;

// Every good must have more than one producer and at least one consumer, or the
// economy quietly seizes: an earlier draft had timber produced only by Elves,
// against demand from four other kinds, and needed by everybody — so nothing was
// ever satisfied anywhere and no settlement in the realm could grow. Check both
// columns before adding a good.
//
// Note that Men are the heavy loggers. That is deliberate: their timber is what
// pays for their walls, and it is also the single largest reason the Elves stop
// speaking to you.
export const KINDS = {
  shire: {
    label: 'Shire', culture: 'halfling',
    produce: { grain: 5.2, ale: 2.4, pipeweed: 1.6, timber: 1.2 },
    need:    { stone: 0.9, ale: 0.6 },
    luxury:  { wine: 1.0, lore: 0.6, ashglass: 0.3, mithril: 0.10 },
  },
  delve: {
    label: 'Delve', culture: 'dwarf',
    produce: { ore: 4.0, coal: 3.2, stone: 3.0 },
    need:    { grain: 3.6, ale: 1.6, timber: 2.0, pipeweed: 1.2 },
    luxury:  { wine: 0.8, mithril: 0.12 },
    // the whole point of a delve: it turns what it digs into something valuable,
    // but only if somebody else feeds it
    make: { out: 'steel', rate: 2.0, from: { ore: 2.0, coal: 2.0 }, minTier: 1 },
  },
  haven: {
    label: 'Haven', culture: 'elf',
    produce: { lore: 1.5, wine: 2.0, timber: 1.4, athelas: 0.9 },
    need:    { grain: 2.0, stone: 0.8, pipeweed: 0.8 },
    luxury:  {},
  },
  burg: {
    label: 'Burg', culture: 'men',
    produce: { timber: 2.4, pipeweed: 1.8, stone: 1.6, grain: 2.2 },
    need:    { grain: 3.2, coal: 1.8, ale: 1.4 },
    luxury:  { wine: 1.2, lore: 0.8, ashglass: 0.4, mithril: 0.18 },
    make: { out: 'arms', rate: 1.5, from: { steel: 2.0 }, minTier: 2 },
  },
  watch: {
    label: 'Watch', culture: 'men',
    produce: {},
    need:    { grain: 1.4, ale: 0.9, pipeweed: 0.8, arms: 0.5, stone: 0.6 },
    luxury:  {},
    maxTier: 2,
  },
  hold: {
    label: 'Hold', culture: 'orc',
    produce: { ashglass: 2.6, coal: 4.0, ore: 3.0 },
    need:    { grain: 2.8, timber: 2.0, arms: 1.2 },
    luxury:  {},
  },
};

/**
 * What a service is run for.
 *
 * `goods` multiplies the line's CAPACITY and `pax` its passenger pull. That was the
 * whole of it, and it made the Freight setting inert: capacity is almost never the
 * binding constraint (shortfall reasons are overwhelmingly "no connected source",
 * not "capacity short"), so raising it 1.45x changed nothing measurable — a
 * measured A/B over identical track moved 681.2 vs 682.0 crowns a week. The
 * tutorial meanwhile promises "Freight shifts half again as much tonnage".
 *
 * So policy now also bids for traffic and prices it: `goodsPull` is how hard the
 * service attracts freight onto itself, `goodsFare` what it charges to carry it.
 * A Freight line genuinely hauls and earns more; a Passenger line genuinely trades
 * tonnage away for people.
 */
export const POLICIES = {
  passenger: { label: 'Passengers', goods: 0.40, pax: 1.75, peril: 0, goodsPull: 0.55, goodsFare: 0.85 },
  mixed:     { label: 'Mixed',      goods: 1.00, pax: 1.00, peril: 0, goodsPull: 1.00, goodsFare: 1.00 },
  freight:   { label: 'Freight',    goods: 1.45, pax: 0.25, peril: 0, goodsPull: 1.35, goodsFare: 1.20 },
  troop:     { label: 'Troop',      goods: 0.70, pax: 0.30, peril: -0.45, armsBonus: 2.0, goodsPull: 0.80, goodsFare: 0.90 },
};
export const POLICY_KEYS = Object.keys(POLICIES);

/** Fare tiers. Dear fares earn more per load and move less of it. */
export const FARES = [
  { label: 'Cheap',    mul: 0.72, demand: 1.20 },
  { label: 'Standard', mul: 1.00, demand: 1.00 },
  { label: 'Dear',     mul: 1.42, demand: 0.76 },
];

export const WARDEN_COST = 8;      // crowns per week per patrolled service

export const CULTURES = {
  halfling: {
    name: 'Halflings', theName: 'the Halflings', adj: 'halfling',
    colour: '#7d9a4e', kinds: ['shire'],
  },
  dwarf: {
    name: 'Dwarves', theName: 'the Dwarves', adj: 'dwarven',
    colour: '#b08d57', kinds: ['delve'],
  },
  elf: {
    name: 'Elves', theName: 'the Elves', adj: 'elvish',
    colour: '#7fae9d', kinds: ['haven'],
  },
  men: {
    name: 'Men', theName: 'the Marchfolk', adj: 'of the Marches',
    colour: '#c9b393', kinds: ['burg', 'watch'],
  },
  orc: {
    name: 'Orcs', theName: 'the Eastern Party', adj: 'orkish',
    colour: '#7a3a28', kinds: ['hold'],
  },
};

// ---------------------------------------------------------------------------
// Charters. The unlock tree, and the only thing you strictly *need* to progress.
// ---------------------------------------------------------------------------

export const CHARTERS = [
  {
    id: 'bridgewrights', name: 'The Bridgewrights’ Charter', kind: 'capability',
    blurb: 'Leave to throw a bridge over any river in the realm, at the usual rates.',
    note: 'The Bridgewrights have asked that we stop calling them the Bridgeguild.',
    apply: (s) => { s.can.bridge = true; },
    avail: (s) => !s.can.bridge,
    weight: () => 10,
  },
  {
    id: 'delvers', name: 'The Delvers’ Charter', kind: 'capability',
    blurb: 'The Dwarves will bore through anything you can point at. Tunnels become possible.',
    note: 'Thrain Ironmoot believes every problem is a tunnel. He is occasionally right.',
    apply: (s) => { s.can.tunnel = true; },
    avail: (s) => !s.can.tunnel && s.regard.dwarf > 26,
    weight: (s) => (s.week > 3 ? 12 : 4),
  },
  {
    id: 'causeway', name: 'The Fen Causeway Charter', kind: 'capability',
    blurb: 'Timber and rubble enough to float a line across the Weeping Marsh.',
    note: 'The marsh is expected to object in its own way and its own time.',
    apply: (s) => { s.can.causeway = true; },
    avail: (s) => !s.can.causeway,
    weight: () => 6,
  },
  {
    id: 'greatspan', name: 'The Great Span Charter', kind: 'capability',
    blurb: 'Authority to bridge open water — estuaries, straits, and the lower Silverflood.',
    note: 'Costed on the assumption that nothing large lives in the estuary.',
    apply: (s) => { s.can.span = true; },
    avail: (s) => !s.can.span && s.can.bridge,
    weight: () => 5,
  },
  {
    id: 'stock', name: 'A Grant of Rolling Stock', kind: 'stock',
    blurb: 'Three further engines, delivered to the nearest shed.',
    note: 'Two arrived. The third is understood to be taking the scenic route.',
    apply: (s) => { s.stock.engines += 3; },
    avail: () => true,
    weight: () => 10,
  },
  {
    id: 'carriages', name: 'The Carriage Works', kind: 'stock',
    blurb: 'Longer trains: every engine may draw one more wagon.',
    note: null,
    apply: (s) => { s.stock.cars = Math.min(5, s.stock.cars + 1); },
    avail: (s) => s.stock.cars < 5,
    weight: () => 9,
  },
  {
    id: 'swift', name: 'Swift Engines', kind: 'stock',
    blurb: 'Better boilers throughout. Everything runs a fifth faster.',
    note: 'The Dwarves deny that the previous boilers were in any way deficient.',
    apply: (s) => { s.stock.speed *= 1.2; },
    avail: (s) => s.stock.speed < 2.1,
    weight: () => 8,
  },
  {
    id: 'survey', name: 'The Cartographers’ Survey', kind: 'money',
    blurb: 'Accurate maps at last. All construction costs a fifth less.',
    note: 'The previous maps were decorative.',
    apply: (s) => { s.buildDiscount *= 0.8; },
    avail: (s) => s.buildDiscount > 0.55,
    weight: () => 8,
  },
  {
    id: 'grant', name: 'An Enlarged Grant', kind: 'money',
    blurb: 'The Council increases the Authority’s weekly grant by forty crowns.',
    note: null,
    apply: (s) => { s.grantBonus += 40; },
    avail: () => true,
    weight: () => 9,
  },
  {
    id: 'wardens', name: 'Wardens of the Ways', kind: 'peril',
    blurb: 'Armed patrols on the line. Incidents become markedly less frequent.',
    note: 'The Wardens are paid from the maintenance budget, which they have noticed.',
    apply: (s) => { s.perilGuard = Math.min(0.75, s.perilGuard + 0.28); },
    avail: (s) => s.perilGuard < 0.7,
    weight: (s) => (s.age >= 2 ? 12 : 6),
  },
  {
    id: 'beacons', name: 'The Beacon Chain', kind: 'peril',
    blurb: 'Signal towers along the trunk. Blockages are cleared in half the time.',
    note: null,
    apply: (s) => { s.clearRate *= 2.0; },
    avail: (s) => s.clearRate < 3,
    weight: (s) => (s.age >= 2 ? 9 : 4),
  },
  {
    id: 'foresters', name: 'The Foresters’ Concord', kind: 'concord',
    blurb: 'Track through woodland fells half as much timber. The Elves remain unimpressed.',
    note: 'They have agreed to be unimpressed in writing, which is progress.',
    apply: (s) => { s.woodCare = Math.min(0.85, s.woodCare + 0.4); },
    avail: (s) => s.woodCare < 0.8,
    weight: (s) => (s.regard.elf < 55 ? 13 : 5),
  },
  {
    id: 'interchange', name: 'The Interchange Act', kind: 'flow',
    blurb: 'Standard gauge and a common timetable. Goods change trains without loss.',
    note: 'Four gauges were in use. Nobody will say who authorised the fourth.',
    apply: (s) => { s.transferLoss *= 0.35; },
    avail: (s) => s.transferLoss > 0.1,
    weight: () => 9,
  },
  {
    id: 'concession', name: 'The Ashenreach Concession', kind: 'concord',
    blurb: 'Formal leave to trade east of the Wracklands. The tariffs are extraordinary.',
    note: 'The Eastern Party has signed. It did not read the terms; it wrote them.',
    apply: (s) => { s.concession = true; },
    avail: (s) => !s.concession && s.age >= 2,
    weight: (s) => (s.age >= 2 ? 7 : 0),
    ominous: true,
  },
];

/**
 * Who will lend the Authority money, and what it costs to owe them.
 *
 * The player asked "can i take out loans?" — and the answer is a chance to make
 * finance a decision about the WORLD rather than a slider. Each lender charges in a
 * different currency: the Crown in obligation, the Delvers in plain hard interest,
 * the Havens in restraint. Borrowing from someone is choosing whose good opinion you
 * are prepared to spend.
 */
export const LENDERS = {
  crown: {
    id: 'crown', name: 'The Crown', people: 'men',
    // cheap, because it is not really money — it is a favour, and favours are called
    rate: 0.012, maxMul: 1.15, term: 26,
    blurb: 'Two parts in a hundred each quarter, and the King’s good will.',
    note: 'The Crown does not lend. It advances, and it remembers having advanced.',
    onTake: (s) => { s.crownFavours = (s.crownFavours || 0) + 1; },
  },
  delvers: {
    id: 'delvers', name: 'Ironmoot & Sons', people: 'dwarf',
    // dear, and utterly indifferent to your circumstances
    rate: 0.030, maxMul: 1.6, term: 20,
    blurb: 'Three parts in a hundred. Written down. Not open to discussion.',
    note: 'The terms are the terms. They will not be improved and they will not be forgotten.',
    onTake: () => {},
  },
  havens: {
    id: 'havens', name: 'The Grey Havens', people: 'elf',
    // free, and conditional: they will not fund what they will not countenance
    rate: 0.0, maxMul: 0.8, term: 40,
    blurb: 'No interest is asked. A condition is attached instead.',
    note: 'While the debt stands, nothing is to be carried for the orcs, and nothing bored beneath the Peaks.',
    // The baseline must be stamped WHEN THE BOND IS TAKEN. Without it, the weekly
    // check compared orc tonnage against itself (`?? s.orcTradeTotal`) and the
    // condition could never fire — an interest-free loan with an unenforceable
    // condition is just free money, and the Havens deserve better than that.
    onTake: (s) => { s.havenBond = true; s.havenBondOrcMark = s.orcTradeTotal ?? 0; },
  },
};
export const LENDER_KEYS = Object.keys(LENDERS);
