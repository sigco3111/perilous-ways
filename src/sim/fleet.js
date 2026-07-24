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
    'Grimhammer', 'Anvilheart', 'Deepdelver', 'Stonewright', 'Emberforge',
    'Ironoath', 'Khazad-Vor', 'Mattock', 'Rockbiter', 'Coalbrand',
    'Thrain’s Word', 'Undergate', 'Hammerfall', 'Sparkmaiden', 'Bellowsbreath',
    'Adamant', 'Dwarrowdelf', 'Firebeard', 'Stoneheart', 'Anvilgate',
  ],
  men: [
    'Perseverance', 'Marchwarden', 'Amonhal', 'Endeavour', 'Steadfast',
    'The King’s Errand', 'Rillbridge', 'Vigilant', 'Diligence', 'Westermark',
    'Recompense', 'Providence', 'Thornwatch', 'Stout Fellow', 'Reliance',
    'Enterprise', 'Fortitude', 'Kingsbridge', 'Sundry', 'Punctual',
  ],
  elf: [
    'Nimrothel', 'Last Light', 'Silverleaf', 'Windward', 'Elenmar',
    'Quiet Water', 'Mithravel', 'Evenstar', 'Longmemory', 'Farewell',
    'Thalanor', 'The Sea, Later', 'Lorien’s Grief', 'Starflung', 'Willow',
  ],
  orc: [
    'Gnasher', 'Slagmouth', 'Number Four', 'Bolg-Durr', 'Rendfang',
    'Cinderwake', 'Uzgrath', 'Iron Tooth', 'Grimtooth', 'Number Eleven',
    'Spoilheap', 'Cauldron', 'Ashmaw', 'Vharn', 'Number Two',
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
    id: 'pony', style: 'men', name: 'Pony', builder: 'The Amonhal Works',
    power: 0.75, speed: 1.10, grace: 0.95, stamina: 1.0, upkeep: 1.7, price: 210, wear: 1.0,
    blurb: 'Small, willing, and made in numbers. Nothing about it is remarkable and nothing about it fails.',
  },
  drover: {
    id: 'drover', style: 'men', name: 'Drover', builder: 'The Amonhal Works',
    power: 1.15, speed: 0.95, grace: 0.90, stamina: 0.9, upkeep: 2.6, price: 340, wear: 1.15,
    blurb: 'The general-purpose engine of the realm. Hauls anything, adequately, and is always slightly late.',
  },
  delver: {
    id: 'delver', style: 'dwarf', name: 'Delver', builder: 'Ironmoot & Sons',
    power: 1.55, speed: 0.78, grace: 0.70, stamina: 1.9, upkeep: 3.4, price: 520, wear: 0.45,
    blurb: 'Slow, immensely strong, and built to a standard rather than a price. Signed for.',
  },
  hammerhead: {
    id: 'hammerhead', style: 'dwarf', name: 'Hammerhead', builder: 'Ironmoot & Sons',
    power: 1.95, speed: 0.66, grace: 0.55, stamina: 2.2, upkeep: 5.2, price: 880, wear: 0.35,
    blurb: 'Mountain freight. It will take a train over the Peaks and it does not care how long that takes.',
  },
  windward: {
    id: 'windward', style: 'elf', name: 'Windward', builder: 'The Grey Havens',
    power: 0.60, speed: 1.65, grace: 1.85, stamina: 1.6, upkeep: 4.1, price: 760, wear: 0.20,
    // the refusal is the point: it is not a freight engine and will not pretend to be
    refuses: ['coal', 'ore', 'stone'],
    blurb: 'Very fast, very quiet, and will not be put to coal. People will change trains to ride behind it.',
  },
  slagmaw: {
    id: 'slagmaw', style: 'orc', name: 'Slagmaw', builder: 'the Slagworks',
    power: 2.20, speed: 0.90, grace: 0.15, stamina: 0.55, upkeep: 2.2, price: 300, wear: 2.4,
    shadow: 0.06,
    blurb: 'It hauls more than anything else on the continent. Nobody will ride behind it and it breaks constantly.',
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
      if (k > 40) return `No. ${nextId}`;
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
  bits.push(`${Math.round(e.dist).toLocaleString('en-GB')} units run`);
  if (e.loads > 0) bits.push(`${Math.round(e.loads).toLocaleString('en-GB')} loads`);
  bits.push(`in service since week ${e.since}`);
  if (e.incidents === 1) bits.push('one incident');
  else if (e.incidents > 1) bits.push(`${e.incidents} incidents`);
  return bits.join(' · ');
}
