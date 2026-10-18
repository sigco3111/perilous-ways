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
  grain:    { name: '곡물',    colour: '#c9a94e', bulk: 1.0, wagon: 'grain' },
  ale:      { name: '맥주',      colour: '#a5713a', bulk: 0.9, wagon: 'barrel' },
  pipeweed:     { name: '파이프잎',     colour: '#8a7a4e', bulk: 0.6, wagon: 'grain' },
  timber:   { name: '목재',   colour: '#7a5c3c', bulk: 1.2, wagon: 'timber' },
  stone:    { name: '석재',    colour: '#8b857c', bulk: 1.5, wagon: 'ore' },
  ore:      { name: '철광석', colour: '#6d5546', bulk: 1.4, wagon: 'ore' },
  coal:     { name: '석탄',     colour: '#2a262a', bulk: 1.3, wagon: 'ore' },
  steel:    { name: '강철',    colour: '#8f98a3', bulk: 1.1, wagon: 'flat' },
  wine:     { name: '와인',     colour: '#7d2f42', bulk: 0.7, wagon: 'barrel' },
  lore:     { name: '학문',     colour: '#c8d4d8', bulk: 0.2, wagon: 'van' },
  arms:     { name: '무기',     colour: '#9e3b3b', bulk: 1.0, wagon: 'arms' },
  ashglass: { name: '재유리', colour: '#ff6a2a', bulk: 0.6, wagon: 'arms' },
  // Only a delve with a very deep shaft yields any, and only a little. Everyone
  // wants it, nobody needs it, and it pays more per load than anything else.
  mithril:  { name: '미스릴',  colour: '#cfd8de', bulk: 0.1, wagon: 'arms' },
  // The one cure for the sweating sickness. The Elves grow it; nobody else can.
  athelas:  { name: '아셀라스',  colour: '#7fae9d', bulk: 0.2, wagon: 'van' },
};

export const GOOD_KEYS = Object.keys(GOODS);

/** Value per load, used for fares and for export income. */
export const VALUE = {
  grain: 2.0, ale: 2.6, pipeweed: 4.2, timber: 2.2, stone: 1.8, ore: 2.8,
  coal: 2.6, steel: 6.0, wine: 5.5, lore: 9.0, arms: 8.5, ashglass: 13.0, mithril: 48.0, athelas: 11.0,
};

/** tier 0..4 output and consumption multiplier */
export const TIER_MULT = [0.80, 1.25, 2.0, 2.9, 3.9];
export const TIER_NAME = ['촌락', '마을', '읍내', '도시', '대도시'];
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
    label: '샤이어', culture: 'halfling',
    produce: { grain: 5.2, ale: 2.4, pipeweed: 1.6, timber: 1.2 },
    need:    { stone: 0.9, ale: 0.6 },
    luxury:  { wine: 1.0, lore: 0.6, ashglass: 0.3, mithril: 0.10 },
  },
  delve: {
    label: '델브', culture: 'dwarf',
    produce: { ore: 4.0, coal: 3.2, stone: 3.0 },
    need:    { grain: 3.6, ale: 1.6, timber: 2.0, pipeweed: 1.2 },
    luxury:  { wine: 0.8, mithril: 0.12 },
    // the whole point of a delve: it turns what it digs into something valuable,
    // but only if somebody else feeds it
    make: { out: 'steel', rate: 2.0, from: { ore: 2.0, coal: 2.0 }, minTier: 1 },
  },
  haven: {
    label: '헤이븐', culture: 'elf',
    produce: { lore: 1.5, wine: 2.0, timber: 1.4, athelas: 0.9 },
    need:    { grain: 2.0, stone: 0.8, pipeweed: 0.8 },
    luxury:  {},
  },
  burg: {
    label: '버그', culture: 'men',
    produce: { timber: 2.4, pipeweed: 1.8, stone: 1.6, grain: 2.2 },
    need:    { grain: 3.2, coal: 1.8, ale: 1.4 },
    luxury:  { wine: 1.2, lore: 0.8, ashglass: 0.4, mithril: 0.18 },
    make: { out: 'arms', rate: 1.5, from: { steel: 2.0 }, minTier: 2 },
  },
  watch: {
    label: '초소', culture: 'men',
    produce: {},
    need:    { grain: 1.4, ale: 0.9, pipeweed: 0.8, arms: 0.5, stone: 0.6 },
    luxury:  {},
    maxTier: 2,
  },
  hold: {
    label: '홀드', culture: 'orc',
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
  passenger: { label: '여객', goods: 0.40, pax: 1.75, peril: 0, goodsPull: 0.55, goodsFare: 0.85 },
  mixed:     { label: '혼합',      goods: 1.00, pax: 1.00, peril: 0, goodsPull: 1.00, goodsFare: 1.00 },
  freight:   { label: '화물',    goods: 1.45, pax: 0.25, peril: 0, goodsPull: 1.35, goodsFare: 1.20 },
  troop:     { label: '군용',      goods: 0.70, pax: 0.30, peril: -0.45, armsBonus: 2.0, goodsPull: 0.80, goodsFare: 0.90 },
};
export const POLICY_KEYS = Object.keys(POLICIES);

/** Fare tiers. Dear fares earn more per load and move less of it. */
export const FARES = [
  { label: '저렴',    mul: 0.72, demand: 1.20 },
  { label: '표준', mul: 1.00, demand: 1.00 },
  { label: '고가',     mul: 1.42, demand: 0.76 },
];

export const WARDEN_COST = 8;      // crowns per week per patrolled service

export const CULTURES = {
  halfling: {
    name: '하플링', theName: '하플링족', adj: '하플링',
    colour: '#7d9a4e', kinds: ['shire'],
  },
  dwarf: {
    name: '드워프', theName: '드워프족', adj: '드워프',
    colour: '#b08d57', kinds: ['delve'],
  },
  elf: {
    name: '엘프', theName: '엘프족', adj: '엘프',
    colour: '#7fae9d', kinds: ['haven'],
  },
  men: {
    name: '인간', theName: '변경의 백성', adj: '변경의',
    colour: '#c9b393', kinds: ['burg', 'watch'],
  },
  orc: {
    name: '오크', theName: '동쪽 세력', adj: '오크',
    colour: '#7a3a28', kinds: ['hold'],
  },
};

// ---------------------------------------------------------------------------
// Charters. The unlock tree, and the only thing you strictly *need* to progress.
// ---------------------------------------------------------------------------

export const CHARTERS = [
  {
    id: 'bridgewrights', name: '교량공단 칙허', kind: 'capability',
    blurb: '왕국 내 어떤 강에든 통상 요금으로 다리를 놓을 수 있는 허가.',
    note: '교량공단 측에서 더 이상 자기들을 다리 길드라 부르지 말아 달라는 요청이 와 있다.',
    apply: (s) => { s.can.bridge = true; },
    avail: (s) => !s.can.bridge,
    weight: () => 10,
  },
  {
    id: 'delvers', name: '굴착단 칙허', kind: 'capability',
    blurb: '드워프들은 가리키는 것은 무엇이든 뚫어 낸다. 터널 공사가 가능해진다.',
    note: '트라인 아이언무트는 모든 문제가 터널이라 믿는다. 가끔은 그가 맞다.',
    apply: (s) => { s.can.tunnel = true; },
    avail: (s) => !s.can.tunnel && s.regard.dwarf > 26,
    weight: (s) => (s.week > 3 ? 12 : 4),
  },
  {
    id: 'causeway', name: '늪지 둑길 칙허', kind: 'capability',
    blurb: '우는 습지를 가로질러 선로를 띄울 만큼의 목재와 잔석.',
    note: '습지는 제 방식대로, 제 때에 반항할 것으로 예상된다.',
    apply: (s) => { s.can.causeway = true; },
    avail: (s) => !s.can.causeway,
    weight: () => 6,
  },
  {
    id: 'greatspan', name: '대교 칙허', kind: 'capability',
    blurb: '개방 수면, 즉 하구와 해협, 실버플러드 하류를 건널 권한.',
    note: '하구에 큰 것이 살지 않는다는 전제로 산정된 비용이다.',
    apply: (s) => { s.can.span = true; },
    avail: (s) => !s.can.span && s.can.bridge,
    weight: () => 5,
  },
  {
    id: 'stock', name: '차량 하사', kind: 'stock',
    blurb: '기관차 세 대를 가장 가까운 차고로 보내 준다.',
    note: '두 대는 도착했다. 세 번째는 경치 좋은 길로 오고 있다고 한다.',
    apply: (s) => { s.stock.engines += 3; },
    avail: () => true,
    weight: () => 10,
  },
  {
    id: 'carriages', name: '객차 공장', kind: 'stock',
    blurb: '더 긴 열차: 모든 기관차가 차량을 한 량 더 끌 수 있다.',
    note: null,
    apply: (s) => { s.stock.cars = Math.min(5, s.stock.cars + 1); },
    avail: (s) => s.stock.cars < 5,
    weight: () => 9,
  },
  {
    id: 'swift', name: '쾌속 기관차', kind: 'stock',
    blurb: '전 차량의 보일러를 개량한다. 모든 것이 5분의 1 더 빨라진다.',
    note: '드워프들은 이전 보일러에 어떤 결함도 없었다고 부인하고 있다.',
    apply: (s) => { s.stock.speed *= 1.2; },
    avail: (s) => s.stock.speed < 2.1,
    weight: () => 8,
  },
  {
    id: 'survey', name: '지도제작단의 측량', kind: 'money',
    blurb: '드디어 정확한 지도다. 모든 건설 비용이 5분의 1 줄어든다.',
    note: '이전 지도들은 장식용이었다.',
    apply: (s) => { s.buildDiscount *= 0.8; },
    avail: (s) => s.buildDiscount > 0.55,
    weight: () => 8,
  },
  {
    id: 'grant', name: '증액된 보조금', kind: 'money',
    blurb: '평의회가 교통청의 주간 보조금을 40크라운 올려 준다.',
    note: null,
    apply: (s) => { s.grantBonus += 40; },
    avail: () => true,
    weight: () => 9,
  },
  {
    id: 'wardens', name: '길의 감시병', kind: 'peril',
    blurb: '선로에 무장 순찰대를 둔다. 사건이 눈에 띄게 줄어든다.',
    note: '감시병의 품삯은 유지비 예산에서 나가는데, 그들도 그 사실을 알아챘다.',
    apply: (s) => { s.perilGuard = Math.min(0.75, s.perilGuard + 0.28); },
    avail: (s) => s.perilGuard < 0.7,
    weight: (s) => (s.age >= 2 ? 12 : 6),
  },
  {
    id: 'beacons', name: '봉화대 연망', kind: 'peril',
    blurb: '간선을 따라 신호탑을 세운다. 통행 장애가 절반의 시간에 해소된다.',
    note: null,
    apply: (s) => { s.clearRate *= 2.0; },
    avail: (s) => s.clearRate < 3,
    weight: (s) => (s.age >= 2 ? 9 : 4),
  },
  {
    id: 'foresters', name: '임업자 협약', kind: 'concord',
    blurb: '삼림을 지나는 선로가 베어 내는 목재가 절반이 된다. 엘프들은 여전히 감동하지 않았다.',
    note: '서면으로 감동하지 않기로 합의했으니, 진전이라 할 만하다.',
    apply: (s) => { s.woodCare = Math.min(0.85, s.woodCare + 0.4); },
    avail: (s) => s.woodCare < 0.8,
    weight: (s) => (s.regard.elf < 55 ? 13 : 5),
  },
  {
    id: 'interchange', name: '환승법', kind: 'flow',
    blurb: '표준 궤간과 공통 시각표. 화물이 손실 없이 열차를 갈아탄다.',
    note: '궤간이 네 종류나 쓰이고 있었다. 네 번째를 누가 허가했는지는 아무도 말하지 않는다.',
    apply: (s) => { s.transferLoss *= 0.35; },
    avail: (s) => s.transferLoss > 0.1,
    weight: () => 9,
  },
  {
    id: 'concession', name: '잿빛벌판 특허권', kind: 'concord',
    blurb: '랙랜드 동쪽과 거래할 공식 허가. 관세가 엄청나다.',
    note: '동쪽 세력이 서명했다. 조건을 읽은 것이 아니라, 쓴 쪽이다.',
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
    id: 'crown', name: '왕실', people: 'men',
    // cheap, because it is not really money — it is a favour, and favours are called
    rate: 0.012, maxMul: 1.15, term: 26,
    blurb: '분기마다 백분의 이, 그리고 왕의 총애.',
    note: '왕실은 빌려 주지 않는다. 선지급할 뿐이며, 선지급했다는 사실을 기억한다.',
    onTake: (s) => { s.crownFavours = (s.crownFavours || 0) + 1; },
  },
  delvers: {
    id: 'delvers', name: '아이언무트 & 선스', people: 'dwarf',
    // dear, and utterly indifferent to your circumstances
    rate: 0.030, maxMul: 1.6, term: 20,
    blurb: '백분의 삼. 문서로 남긴다. 협상의 여지는 없다.',
    note: '조건은 조건일 뿐이다. 나아지지도, 잊히지도 않는다.',
    onTake: () => {},
  },
  havens: {
    id: 'havens', name: '회색 항구', people: 'elf',
    // free, and conditional: they will not fund what they will not countenance
    rate: 0.0, maxMul: 0.8, term: 40,
    blurb: '이자는 요구하지 않는다. 대신 조건이 하나 붙는다.',
    note: '빚이 남아 있는 동안, 오크를 위한 화물은 실어서도, 산맥 아래를 뚫어서도 안 된다.',
    // The baseline must be stamped WHEN THE BOND IS TAKEN. Without it, the weekly
    // check compared orc tonnage against itself (`?? s.orcTradeTotal`) and the
    // condition could never fire — an interest-free loan with an unenforceable
    // condition is just free money, and the Havens deserve better than that.
    onTake: (s) => { s.havenBond = true; s.havenBondOrcMark = s.orcTradeTotal ?? 0; },
  },
};
export const LENDER_KEYS = Object.keys(LENDERS);
