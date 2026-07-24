// Locomotive side elevations, and the rolling stock, drawn as engraver's diagrams.
//
// The player could read a locomotive's statistics but never SEE one: the engine
// works was a table of numbers in a collapsed panel. A railway game in which you
// cannot look at your engines is missing the reason anyone likes railways.
//
// Same hand as plates.js — two inks on cream, tone by hairline rather than flat
// grey, vermilion spent exactly once per drawing on the fire. But these are
// DIAGRAMS rather than pictures: a maker's side elevation, square-on, with the
// wheels on a rule and the dimensions implied. That is the right register for
// something you are being asked to buy.
//
//   locoElevation('hammerhead')      -> '<svg…>'  a side elevation
//   consistStrip(['grain','barrel'])  -> '<svg…>'  the train, engine and wagons
//
// No imports and no assets, so this file is optional exactly like plates.js.

const INK = '#1d1710';
const SOFT = '#6b5c45';
const RED = '#ab2c17';
const PAPER = 'none';

/** Hairline hatch, laid at an angle. Ids are per-drawing so two can share a page. */
function hatch(id, angle, gap = 3) {
  return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${gap}" height="${gap}"
      patternTransform="rotate(${angle})">
    <line x1="0" y1="0" x2="0" y2="${gap}" stroke="${SOFT}" stroke-width="0.5"/>
  </pattern>`;
}

/**
 * The classes as drawings. Every number is in the same 100x44 elevation space, so
 * the six of them are directly comparable when stacked in a list — which is the
 * whole point of a maker's diagram.
 *
 *   len      how far along the frame the engine reaches
 *   boiler   {x, y, r, l} the barrel
 *   stack    {x, h, flare} chimney; h 0 means none at all
 *   cab      {x, w, h, roof} 'flat' | 'arch' | 'open'
 *   drivers  [{x, r}] coupled wheels, drawn with spokes
 *   pony     [{x, r}] small carrying wheels
 *   prow     a faired nose instead of a smokebox door
 */
const LOCOS = {
  pony: {
    len: 62, boiler: { x: 22, y: 16, r: 6.5, l: 30 }, stack: { x: 24, h: 12, flare: 2.6 },
    cab: { x: 54, w: 15, h: 17, roof: 'flat' },
    drivers: [{ x: 36, r: 6.5 }, { x: 48, r: 6.5 }], pony: [{ x: 22, r: 3.6 }],
    note: 'one pair coupled · 2 wagons',
  },
  drover: {
    len: 72, boiler: { x: 22, y: 15, r: 7, l: 36 }, stack: { x: 25, h: 11, flare: 3.0 },
    cab: { x: 62, w: 16, h: 19, roof: 'flat' },
    drivers: [{ x: 38, r: 7.5 }, { x: 52, r: 7.5 }], pony: [{ x: 22, r: 4 }],
    note: 'two pairs coupled · 3 wagons',
  },
  delver: {
    len: 78, boiler: { x: 20, y: 14, r: 8.5, l: 42 }, stack: { x: 24, h: 9, flare: 4.2 },
    cab: { x: 66, w: 18, h: 21, roof: 'arch' },
    drivers: [{ x: 34, r: 8 }, { x: 48, r: 8 }, { x: 62, r: 8 }], pony: [],
    note: 'three pairs coupled · heavy frames',
  },
  hammerhead: {
    len: 90, boiler: { x: 20, y: 13, r: 9.5, l: 50 }, stack: { x: 23, h: 8, flare: 5.0 },
    cab: { x: 76, w: 20, h: 23, roof: 'arch' },
    drivers: [{ x: 36, r: 9 }, { x: 52, r: 9 }, { x: 68, r: 9 }],
    pony: [{ x: 21, r: 4.2 }],
    note: 'three pairs · mountain gearing',
  },
  windward: {
    len: 80, boiler: { x: 26, y: 15, r: 6, l: 38 }, stack: { x: 0, h: 0, flare: 0 },
    cab: { x: 66, w: 16, h: 15, roof: 'open' },
    drivers: [{ x: 42, r: 10 }, { x: 60, r: 10 }], pony: [{ x: 26, r: 4.6 }],
    prow: true,
    note: 'no chimney · tall single drivers',
  },
  slagmaw: {
    len: 84, boiler: { x: 20, y: 14, r: 9, l: 46 }, stack: { x: 22, h: 14, flare: 6.0 },
    cab: { x: 72, w: 18, h: 20, roof: 'flat' },
    drivers: [{ x: 34, r: 7.8 }, { x: 48, r: 7.8 }, { x: 62, r: 7.8 }], pony: [],
    slab: true,
    note: 'slab framed · unlagged boiler',
  },
};

/** A spoked wheel on the rail line. */
function wheel(cx, cy, r, spokes = 8) {
  let s = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${INK}" stroke-width="1.4"/>`
    + `<circle cx="${cx}" cy="${cy}" r="${r * 0.22}" fill="${INK}"/>`;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2 + 0.2;
    s += `<line x1="${(cx + Math.cos(a) * r * 0.24).toFixed(1)}" y1="${(cy + Math.sin(a) * r * 0.24).toFixed(1)}"
      x2="${(cx + Math.cos(a) * r * 0.9).toFixed(1)}" y2="${(cy + Math.sin(a) * r * 0.9).toFixed(1)}"
      stroke="${SOFT}" stroke-width="0.5"/>`;
  }
  return s;
}

/**
 * A locomotive side elevation.
 * @param {string} key class id
 * @param {object} opts {w, condition, fire}
 */
export function locoElevation(key, opts = {}) {
  const L = LOCOS[key];
  if (!L) return '';
  const w = opts.w || 200;
  const uid = `lx${key}`;
  const RAIL = 36;                       // the rail line in elevation space
  const cond = opts.condition === undefined ? 1 : Math.max(0, Math.min(1, opts.condition));
  const b = L.boiler;
  const bTop = b.y - b.r;

  let g = '';
  // the frame and footplate
  g += `<line x1="10" y1="${RAIL - 2}" x2="${L.len + 6}" y2="${RAIL - 2}" stroke="${INK}" stroke-width="1.2"/>`;
  // buffer beam, drawbar and the frame they belong to
  const FRAME = RAIL - 7;
  g += `<line x1="10" y1="${FRAME}" x2="${L.cab.x + L.cab.w}" y2="${FRAME}" stroke="${INK}" stroke-width="1.5"/>`;
  g += `<line x1="10" y1="${FRAME - 4}" x2="10" y2="${RAIL - 2}" stroke="${INK}" stroke-width="1.7"/>`;
  g += `<line x1="5" y1="${FRAME}" x2="10" y2="${FRAME}" stroke="${INK}" stroke-width="1.1"/>`;
  g += `<circle cx="5" cy="${FRAME}" r="1.4" fill="none" stroke="${INK}" stroke-width="0.9"/>`;

  // the boiler barrel, hatched along its length so it reads as a cylinder
  if (L.prow) {
    // a faired nose: the Elvish engine has no smokebox door to speak of
    g += `<path d="M${b.x - 8},${b.y} Q${b.x - 6},${bTop} ${b.x + 6},${bTop}
      L${b.x + b.l},${bTop} L${b.x + b.l},${b.y + b.r} L${b.x + 6},${b.y + b.r}
      Q${b.x - 6},${b.y + b.r} ${b.x - 8},${b.y} Z"
      fill="url(#${uid}h)" stroke="${INK}" stroke-width="1.5"/>`;
  } else if (L.slab) {
    // slab-sided and unlagged: straight plate, no cladding bands
    g += `<rect x="${b.x - 6}" y="${bTop}" width="${b.l + 6}" height="${b.r * 2}"
      fill="url(#${uid}h)" stroke="${INK}" stroke-width="1.6"/>`;
    for (const dx of [8, 20, 32]) {
      g += `<line x1="${b.x + dx}" y1="${bTop}" x2="${b.x + dx}" y2="${b.y + b.r}"
        stroke="${INK}" stroke-width="0.8"/>`;
    }
  } else {
    g += `<rect x="${b.x - 6}" y="${bTop}" width="${b.l + 6}" height="${b.r * 2}" rx="${b.r * 0.5}"
      fill="url(#${uid}h)" stroke="${INK}" stroke-width="1.5"/>`;
    // cladding bands
    for (const f of [0.34, 0.62]) {
      const x = b.x - 6 + (b.l + 6) * f;
      g += `<line x1="${x.toFixed(1)}" y1="${bTop}" x2="${x.toFixed(1)}" y2="${b.y + b.r}"
        stroke="${INK}" stroke-width="0.9"/>`;
    }
    // smokebox door
    g += `<circle cx="${b.x - 2}" cy="${b.y}" r="${b.r * 0.62}" fill="none" stroke="${INK}" stroke-width="0.9"/>`;
  }

  // chimney
  if (L.stack.h > 0) {
    const sx = L.stack.x, sh = L.stack.h, fl = L.stack.flare;
    g += `<path d="M${sx - 2.4},${bTop} L${sx - 2.4},${bTop - sh + 3}
      L${sx - 2.4 - fl / 2},${bTop - sh} L${sx + 2.4 + fl / 2},${bTop - sh}
      L${sx + 2.4},${bTop - sh + 3} L${sx + 2.4},${bTop} Z"
      fill="url(#${uid}h)" stroke="${INK}" stroke-width="1.4"/>`;
    // a dome behind it, on everything but the orcs' engine
    if (!L.slab) {
      g += `<path d="M${sx + 14},${bTop} q4,-7 8,0 z" fill="url(#${uid}h)" stroke="${INK}" stroke-width="1.1"/>`;
    }
  }

  // cab
  const c = L.cab, cTop = RAIL - 2 - c.h;
  if (c.roof === 'open') {
    // a canopy on posts: the Elves do not enclose their drivers
    g += `<line x1="${c.x}" y1="${cTop}" x2="${c.x + c.w}" y2="${cTop}" stroke="${INK}" stroke-width="1.5"/>`;
    g += `<line x1="${c.x + 1}" y1="${cTop}" x2="${c.x + 1}" y2="${RAIL - 2}" stroke="${INK}" stroke-width="1.1"/>`;
    g += `<line x1="${c.x + c.w - 1}" y1="${cTop}" x2="${c.x + c.w - 1}" y2="${RAIL - 2}" stroke="${INK}" stroke-width="1.1"/>`;
  } else {
    const roof = c.roof === 'arch'
      ? `<path d="M${c.x - 1},${cTop + 3} q${c.w / 2 + 1},-6 ${c.w + 2},0" fill="none" stroke="${INK}" stroke-width="1.5"/>`
      : `<line x1="${c.x - 1}" y1="${cTop}" x2="${c.x + c.w + 1}" y2="${cTop}" stroke="${INK}" stroke-width="1.5"/>`;
    g += `<rect x="${c.x}" y="${cTop + (c.roof === 'arch' ? 3 : 0)}" width="${c.w}"
      height="${c.h - (c.roof === 'arch' ? 3 : 0)}" fill="url(#${uid}h)" stroke="${INK}" stroke-width="1.5"/>`
      + roof
      // the spectacle window
      + `<rect x="${c.x + 3}" y="${cTop + 6}" width="${c.w * 0.4}" height="${c.h * 0.34}"
         fill="${PAPER}" stroke="${INK}" stroke-width="0.9"/>`;
  }

  // wheels, on the rule
  for (const d of L.drivers) g += wheel(d.x, RAIL - d.r, d.r, 10);
  for (const p of L.pony || []) g += wheel(p.x, RAIL - p.r, p.r, 6);
  // coupling rod across the drivers
  if (L.drivers.length > 1) {
    const a = L.drivers[0], z = L.drivers[L.drivers.length - 1];
    g += `<line x1="${a.x}" y1="${RAIL - a.r + a.r * 0.45}" x2="${z.x}" y2="${RAIL - z.r + z.r * 0.45}"
      stroke="${INK}" stroke-width="1.2"/>`;
  }
  // the rail
  g += `<line x1="2" y1="${RAIL + 1}" x2="${L.len + 10}" y2="${RAIL + 1}" stroke="${INK}" stroke-width="1"/>`;

  // The one spend of vermilion: the fire. Dim it as the engine wears, which makes
  // condition legible at a glance in a list.
  if (L.stack.h > 0 && opts.fire !== false) {
    const fx = L.cab.x - 5, fy = RAIL - 9;
    g += `<path d="M${fx},${fy} q2.5,-4.5 5,0 q-2.5,3.5 -5,0 z" fill="${RED}"
      opacity="${(0.3 + 0.7 * cond).toFixed(2)}"/>`;
  }
  // a worn engine is drawn with its motion stopped and a wisp instead of a plume
  if (cond < 0.4) {
    g += `<text x="${L.len - 6}" y="12" font-size="7" fill="${RED}"
      font-style="italic" text-anchor="end">stopped</text>`;
  }

  return `<svg class="loco" viewBox="0 0 104 44" width="${w}" role="img"
    aria-label="side elevation of the ${key} class">
    <defs>${hatch(uid + 'h', 26)}</defs>${g}</svg>`;
}

/** The maker's note under an elevation. */
export function locoNote(key) {
  return LOCOS[key] ? LOCOS[key].note : '';
}

/* ── rolling stock ──────────────────────────────────────────────────────── */

/** Each wagon as a small elevation, so a consist can be read left to right. */
const WAGON_ART = {
  passenger: (x) => `<rect x="${x}" y="12" width="22" height="13" fill="none" stroke="${INK}" stroke-width="1.3"/>`
    + [4, 9, 14].map((o) => `<rect x="${x + o}" y="15" width="4" height="5" fill="none" stroke="${SOFT}" stroke-width="0.7"/>`).join('')
    + `<line x1="${x}" y1="14" x2="${x + 22}" y2="14" stroke="${INK}" stroke-width="0.7"/>`,
  grain: (x) => `<path d="M${x},25 L${x + 22},25 L${x + 19},15 L${x + 3},15 Z" fill="none" stroke="${INK}" stroke-width="1.3"/>`
    + `<path d="M${x + 3},15 q8,-5 16,0" fill="none" stroke="${SOFT}" stroke-width="0.8"/>`,
  ore: (x) => `<rect x="${x}" y="16" width="22" height="9" fill="none" stroke="${INK}" stroke-width="1.3"/>`
    + `<path d="M${x + 2},16 l3,-3 l4,3 l3,-4 l4,4 l3,-2 l3,2" fill="none" stroke="${INK}" stroke-width="1"/>`,
  timber: (x) => `<rect x="${x}" y="21" width="22" height="4" fill="none" stroke="${INK}" stroke-width="1.3"/>`
    + [0, 1, 2].map((i) => `<circle cx="${x + 5 + i * 6}" cy="${18}" r="3" fill="none" stroke="${SOFT}" stroke-width="0.8"/>`).join(''),
  barrel: (x) => `<rect x="${x}" y="21" width="22" height="4" fill="none" stroke="${INK}" stroke-width="1.3"/>`
    + [0, 1, 2].map((i) => `<ellipse cx="${x + 5 + i * 6}" cy="${17.5}" rx="2.6" ry="3.4" fill="none" stroke="${INK}" stroke-width="0.9"/>`).join(''),
  van: (x) => `<rect x="${x}" y="13" width="22" height="12" fill="none" stroke="${INK}" stroke-width="1.3"/>`
    + `<path d="M${x - 1},13 q11,-4 24,0" fill="none" stroke="${INK}" stroke-width="1.2"/>`
    + `<line x1="${x + 11}" y1="15" x2="${x + 11}" y2="25" stroke="${SOFT}" stroke-width="0.8"/>`,
  arms: (x) => `<rect x="${x}" y="15" width="22" height="10" fill="none" stroke="${INK}" stroke-width="1.4"/>`
    + `<line x1="${x + 3}" y1="15" x2="${x + 3}" y2="25" stroke="${INK}" stroke-width="0.9"/>`
    + `<line x1="${x + 19}" y1="15" x2="${x + 19}" y2="25" stroke="${INK}" stroke-width="0.9"/>`
    + `<path d="M${x + 8},20 l3,-3 l3,3 l-3,3 z" fill="${RED}"/>`,
  flat: (x) => `<rect x="${x}" y="21" width="22" height="4" fill="none" stroke="${INK}" stroke-width="1.3"/>`
    + [2, 20].map((o) => `<line x1="${x + o}" y1="18" x2="${x + o}" y2="21" stroke="${SOFT}" stroke-width="0.8"/>`).join(''),
  brake: (x) => `<rect x="${x + 3}" y="14" width="16" height="11" fill="none" stroke="${INK}" stroke-width="1.3"/>`
    + `<rect x="${x + 8}" y="10" width="6" height="4" fill="none" stroke="${INK}" stroke-width="1"/>`
    + `<circle cx="${x + 18}" cy="17" r="1.6" fill="${RED}"/>`,
};

/**
 * The whole train, engine and wagons, as one strip. This is the rolling stock made
 * visible: what the service is actually running, in the order it runs it.
 */
export function consistStrip(cars, opts = {}) {
  const list = Array.isArray(cars) ? cars.slice(0, 8) : [];
  const gap = 26;
  const w = 30 + list.length * gap;
  let g = `<line x1="0" y1="26" x2="${w}" y2="26" stroke="${INK}" stroke-width="1"/>`;
  // a token engine at the head, so the direction of travel is obvious
  g += `<path d="M4,25 L4,14 q0,-3 3,-3 L16,11 L16,25 Z" fill="none" stroke="${INK}" stroke-width="1.4"/>`
    + `<line x1="8" y1="11" x2="8" y2="6" stroke="${INK}" stroke-width="1.6"/>`
    + `<circle cx="8" cy="24" r="2.4" fill="none" stroke="${INK}" stroke-width="1"/>`
    + `<circle cx="14" cy="24" r="2.4" fill="none" stroke="${INK}" stroke-width="1"/>`;
  list.forEach((c, i) => {
    const x = 22 + i * gap;
    g += (WAGON_ART[c] || WAGON_ART.flat)(x);
    g += `<circle cx="${x + 5}" cy="26" r="1.8" fill="none" stroke="${INK}" stroke-width="0.8"/>`
      + `<circle cx="${x + 17}" cy="26" r="1.8" fill="none" stroke="${INK}" stroke-width="0.8"/>`;
  });
  return `<svg class="consist" viewBox="0 0 ${w} 30" width="${opts.w || Math.min(300, w * 2.4)}"
    role="img" aria-label="the train: ${list.join(', ') || 'no wagons'}">${g}</svg>`;
}

export const WAGON_ART_KEYS = Object.keys(WAGON_ART);
