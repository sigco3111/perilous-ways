// The fleet, as individuals.
//
// Engines were previously a number — `stock.engines: 3` — and the things moving on
// the map were anonymous props regenerated whenever a line changed. That is why
// running trains was not fun: nothing on screen was a thing you owned, and
// nothing that happened to it was remembered.
//
// Every engine is now a record with a name, a class, a shed, and a history.

import { makeRng } from '../rng.js';

/**
 * Locomotive names, by builder. Real railways named engines, and the naming
 * conventions are half the character: the Dwarves name theirs after tools and
 * oaths, Men after virtues and battles, the Elves after things that are not
 * objects at all, and the Ashen host does not name things so much as label them.
 */
const NAMES = {
  dwarf: [
    '그림해머', '앤빌하트', '딥델버', '스톤라이트', '엠버포지',
    '아이언오스', '카자드보르', '매턱', '락바이터', '콜브랜드',
    '트라인의 말씀', '언더게이트', '해머폴', '스파크메이든', '벨로스브레스',
    '아다만트', '드워로델프', '파이어비어드', '스톤하트', '앤빌게이트',
  ],
  men: [
    '인내', '변경지기', '아몬할', '노력', '불굴',
    '왕의 심부름', '릴브리지', '경계', '근면', '웨스터마크',
    '보답', '섭리', '손워치', '씩씩한 친구', '신뢰',
    '진취', '용기', '킹스브리지', '선드리', '시간엄수',
  ],
  elf: [
    '님로델', '마지막 빛', '은빛잎', '바람맞이', '엘렌마르',
    '고요한 물', '미스라벨', '저녁별', '긴기억', '작별',
    '탈라노르', '바다는, 나중에', '로리엔의 슬픔', '별에 닿은', '버드나무',
  ],
  orc: [
    '나셔', '슬래그마우스', '4번', '볼그두르', '렌드팽',
    '신더웨이크', '우즈그라스', '쇠이빨', '그림투스', '11번',
    '스포일힙', '가마솥', '애시모', '바른', '2번',
  ],
};

/**
 * LOCOMOTIVE CLASSES.
 *
 * Until now an engine was a name, a style and a counter: every use of it in the
 * simulation was `enginesOf(line).length`, so all engines were interchangeable units
 * and naming them was cosmetics on an integer. That is the whole of "the trains
 * aren't interesting or customizable" — there was nothing to choose.
 *
 * Each class is a real operating tradeoff AND a statement about its builders, so the
 * train-game decision and the fantasy are the same decision. You cannot buy an
 * Elvish engine if the Havens have stopped speaking to you; a Dwarven engine will
 * outlive you and cost you for the privilege; an orc engine hauls more than anything
 * on the continent and no one will ride behind it.
 *
 *   power    multiplies the tonnage it can shift
 *   speed    multiplies how often it gets round its line
 *   grace    passenger appeal
 *   stamina  resistance to incidents (1 = ordinary)
 *   upkeep   crowns per week
 *   price    crowns to buy
 *   wear     condition lost per 1000 units run
 */
export const ENGINE_CLASSES = {
  pony: {
    id: 'pony', style: 'men', name: '포니', builder: '아몬할 공작소',
    power: 0.75, speed: 1.10, grace: 0.95, stamina: 1.0, upkeep: 1.7, price: 210, wear: 1.0,
    blurb: '작고 순하며 많이 찍어 냈다. 특별할 것도, 고장 날 것도 없다.',
  },
  drover: {
    id: 'drover', style: 'men', name: '드로버', builder: '아몬할 공작소',
    power: 1.15, speed: 0.95, grace: 0.90, stamina: 0.9, upkeep: 2.6, price: 340, wear: 1.15,
    blurb: '왕국의 표준 범용 기관차. 무엇이든 그럭저럭 끌고, 언제나 조금씩 늦는다.',
  },
  delver: {
    id: 'delver', style: 'dwarf', name: '델버', builder: '아이언무트 & 선스',
    power: 1.55, speed: 0.78, grace: 0.70, stamina: 1.9, upkeep: 3.4, price: 520, wear: 0.45,
    blurb: '느리고, 엄청나게 강하며, 가격이 아니라 기준에 맞춰 만들었다. 검수 서명 완료.',
  },
  hammerhead: {
    id: 'hammerhead', style: 'dwarf', name: '해머헤드', builder: '아이언무트 & 선스',
    power: 1.95, speed: 0.66, grace: 0.55, stamina: 2.2, upkeep: 5.2, price: 880, wear: 0.35,
    blurb: '산악 화물용. 산맥 너머로 열차를 끌고 넘어가며, 시간이 얼마나 걸리든 개의치 않는다.',
  },
  windward: {
    id: 'windward', style: 'elf', name: '윈드워드', builder: '회색 항구',
    power: 0.60, speed: 1.65, grace: 1.85, stamina: 1.6, upkeep: 4.1, price: 760, wear: 0.20,
    // the refusal is the point: it is not a freight engine and will not pretend to be
    refuses: ['coal', 'ore', 'stone'],
    blurb: '매우 빠르고, 매우 조용하며, 석탄 운반에는 쓸 수 없다. 사람들은 이 기관차 뒤에 타려고 열차를 갈아탄다.',
  },
  slagmaw: {
    id: 'slagmaw', style: 'orc', name: '슬래그모', builder: '슬래그 공장',
    power: 2.20, speed: 0.90, grace: 0.15, stamina: 0.55, upkeep: 2.2, price: 300, wear: 2.4,
    shadow: 0.06,
    blurb: '대륙에서 가장 많이 끌어 낸다. 아무도 그 뒤에 타려 하지 않고, 끊임없이 고장 난다.',
  },
};
export const CLASS_KEYS = Object.keys(ENGINE_CLASSES);

/** Which classes a builder will sell you, given how they feel about the Authority. */
export function classesFor(style) {
  return CLASS_KEYS.filter((k) => ENGINE_CLASSES[k].style === style);
}

/** Which builder supplies engines to a service running under this policy. */
export const STYLE_FOR_POLICY = {
  passenger: 'men',
  mixed: 'dwarf',
  freight: 'dwarf',
  troop: 'orc',
};

export function createFleet(seed) {
  const rng = makeRng(`${seed}:fleet`);
  const used = new Set();
  let nextId = 1;

  function nameFor(style) {
    const pool = NAMES[style] || NAMES.dwarf;
    const free = pool.filter((n) => !used.has(n));
    if (free.length) {
      const n = free[rng.int(0, free.length - 1)];
      used.add(n);
      return n;
    }
    // A railway that outlives its name-book numbers the rest, as they all did.
    let k = 2;
    for (;;) {
      const n = `${pool[rng.int(0, pool.length - 1)]} II`.replace(' II', ` ${romans(k)}`);
      if (!used.has(n)) { used.add(n); return n; }
      k++;
      if (k > 40) return `${nextId}호`;
    }
  }

  const romans = (n) => ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n] || String(n);

  /** A new engine, in the shed, unassigned. */
  /**
   * Build an engine. `what` is a class key, or a bare style for the old callers —
   * in which case the cheapest class that builder offers is used.
   */
  function build(what, week) {
    const cls = ENGINE_CLASSES[what]
      || ENGINE_CLASSES[classesFor(what)[0]]
      || ENGINE_CLASSES.drover;
    return {
      id: nextId++,
      name: nameFor(cls.style),
      style: cls.style,
      cls: cls.id,
      lineId: null,
      dist: 0,          // world units run
      loads: 0,         // loads carried
      incidents: 0,     // times something happened to it
      trips: 0,         // times it has run the length of its line
      since: week,      // week it entered service
      whistledAt: 0,
      // Engines wear out. This is what turns a fleet from a number into a set of
      // things with histories that you have to make decisions about.
      condition: 1,     // 1 = new, 0 = fit for the scrap road
      overhauls: 0,
    };
  }

  return { build, nameFor };
}

/** A short, dry service record, for the engine card. */
export function engineRecord(e, week) {
  const bits = [];
  bits.push(`주행 ${Math.round(e.dist).toLocaleString('en-GB')}`);
  if (e.loads > 0) bits.push(`적재 ${Math.round(e.loads).toLocaleString('en-GB')}`);
  bits.push(`${e.since}주차부터 운용`);
  if (e.incidents === 1) bits.push('사고 1회');
  else if (e.incidents > 1) bits.push(`사고 ${e.incidents}회`);
  return bits.join(' · ');
}
