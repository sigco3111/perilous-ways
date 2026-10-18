// Plates — the tipped-in illustrations.
//
// A printed Authority report of this period would carry engraved plates on
// heavier stock, bound in facing the relevant paragraph. These are those plates,
// drawn in SVG. Two inks only, black and vermilion on cream, as everywhere else.
//
// The whole trick of making SVG read as an engraving rather than as clip art is
// TONE BY LINE: nothing is filled with flat grey. Every grey in these drawings is
// a pattern of hairlines — laid horizontally for water and sky, at 26° for a
// hillside, crossed for the dark of a tunnel, stippled for mist and ash. The
// patterns are `userSpaceOnUse`, so the laid lines run continuously across every
// shape on a plate the way a real engraver's would, instead of restarting inside
// each object.
//
// Line weight is never uniform: 1.6–2 for the near silhouette, 1 for the middle
// distance, 0.5 for the far hills. Vermilion is spent once per plate, on the one
// thing the eye should go to — a crater, a lamp, an eye, a wax seal — and never
// on scenery.
//
//   plate('first_wrack', { place: 'Gorgobal', week: 214, rng })  →  '<svg…>'
//
// No imports, no assets, no fonts. Styles for the frame live at the foot of
// styles.css under "plates".

/* ── the two inks ─────────────────────────────────────────────────── */

const INK = '#1d1710';
const INK2 = '#3b3125';
const SOFT = '#5b4e3a';
const RED = '#ab2c17';
const RED_D = '#7d1d0e';
const PAPER = '#f1e7d2';
const EDGE = '#a4906c';

const SERIF = "'Iowan Old Style','Palatino Linotype',Palatino,Georgia,'Times New Roman',serif";

/* The plate: a picture box, a broken rule, a number and a legend. */
const VW = 640;
const VH = 300;
const BX = 15;          // picture box
const BY = 12;
const BW = 610;
const BH = 226;
const BB = BY + BH;     // 238, the foot of the picture

/* Not exported: ornament.js already publishes an `esc`, and two of them in one
   barrel would collide. */
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* Coordinates are rounded to a tenth: the difference is invisible and the
   generated strings are a third shorter. */
const n2 = (v) => {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? 0 : r;
};

/* ── hatching ─────────────────────────────────────────────────────── */
// key: [spacing, stroke width, rotation]. Spacing is the whole tile, so one line
// per tile and the rotation turns the entire lattice.
const HATCH = {
  h: [8.0, 0.5, 0],      // the lightest tone there is
  a: [4.6, 0.55, 0],     // laid horizontal — water, sky
  b: [3.1, 0.6, 0],      // horizontal, mid
  n: [2.2, 0.85, 0],     // horizontal, dark
  c: [4.2, 0.55, 45],
  d: [4.2, 0.55, -45],
  k: [3.4, 0.55, 26],    // a hillside falling to the right
  m: [3.4, 0.55, -26],   // and to the left
  v: [3.6, 0.55, 90],    // vertical — masonry, planking, rain
  l: [3.0, 0.55, 74],
  o: [5.6, 0.5, 62],
  // and the same falls again, laid close and cut deeper, for a shadowed flank
  x: [2.1, 0.95, 26],
  y: [2.1, 0.95, -26],
};
// cross-hatch: the darkest tone short of solid
const CROSS = { f: [4.2, 0.5, 45], g: [2.6, 0.7, 20], w: [3.4, 0.6, 70] };
// stipple: sky, mist, ash, distance. Four dots to the tile at deliberately
// awkward intervals — an even grid of dots reads as a printed halftone, which is
// the one thing an engraving never looks like.
const DOT = { i: [12, 0.5], j: [6.6, 0.52], s: [17, 0.46] };
const DOT_AT = [[0.11, 0.29, 1], [0.44, 0.07, 0.78], [0.66, 0.58, 0.95], [0.89, 0.81, 0.66]];

/**
 * The defs for one plate. `keys` names the patterns wanted, e.g. 'abfij'; 'q'
 * adds the paper tooth, 'T' adds the one permitted turbulence filter.
 */
function defs(u, keys = 'a', extra = '') {
  let s = `<defs><clipPath id="${u}z"><rect x="${BX}" y="${BY}" width="${BW}" height="${BH}"/></clipPath>`;
  for (const k of keys) {
    if (HATCH[k]) {
      const [sp, sw, rot] = HATCH[k];
      s += `<pattern id="${u}${k}" width="${sp}" height="${sp}" patternUnits="userSpaceOnUse"`
        + (rot ? ` patternTransform="rotate(${rot})"` : '') + '>'
        + `<path d="M0 ${sp / 2}H${sp}" stroke="${INK}" stroke-width="${sw}"/></pattern>`;
    } else if (CROSS[k]) {
      const [sp, sw, rot] = CROSS[k];
      s += `<pattern id="${u}${k}" width="${sp}" height="${sp}" patternUnits="userSpaceOnUse"`
        + ` patternTransform="rotate(${rot})">`
        + `<path d="M0 ${sp / 2}H${sp}M${sp / 2} 0V${sp}" stroke="${INK}" stroke-width="${sw}"/></pattern>`;
    } else if (DOT[k]) {
      const [c, r] = DOT[k];
      s += `<pattern id="${u}${k}" width="${c}" height="${c}" patternUnits="userSpaceOnUse">`
        + `<g fill="${INK}">`
        + DOT_AT.map(([fx, fy, fr]) => `<circle cx="${n2(c * fx)}" cy="${n2(c * fy)}" r="${n2(r * fr)}"/>`).join('')
        + `</g></pattern>`;
    } else if (k === 'q') {
      // the tooth of the paper: foxing, in the colour of the hairlines
      s += `<pattern id="${u}q" width="17" height="17" patternUnits="userSpaceOnUse">`
        + `<circle cx="3" cy="5" r="0.5" fill="${EDGE}"/><circle cx="11.5" cy="2.5" r="0.4" fill="${EDGE}"/>`
        + `<circle cx="8" cy="12" r="0.55" fill="${EDGE}"/><circle cx="15" cy="9.5" r="0.35" fill="${EDGE}"/></pattern>`;
    } else if (k === 'T') {
      s += `<filter id="${u}T" x="-6%" y="-6%" width="112%" height="112%">`
        + `<feTurbulence type="fractalNoise" baseFrequency="0.035 0.06" numOctaves="3" seed="7" result="t"/>`
        + `<feDisplacementMap in="SourceGraphic" in2="t" scale="7" xChannelSelector="R" yChannelSelector="G"/></filter>`;
    } else if (k === 'B') {
      s += `<filter id="${u}B" x="-20%" y="-40%" width="140%" height="180%">`
        + `<feGaussianBlur stdDeviation="3.2"/></filter>`;
    }
  }
  return s + extra + '</defs>';
}

/* ── the drawing hand ─────────────────────────────────────────────── */

const p = (d, sw = 1, o = '') => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${sw}"${o ? ' ' + o : ''}/>`;
const rp = (d, sw = 1, o = '') => `<path d="${d}" fill="none" stroke="${RED}" stroke-width="${sw}"${o ? ' ' + o : ''}/>`;
const fp = (d, fill = INK, o = '') => `<path d="${d}" fill="${fill}"${o ? ' ' + o : ''}/>`;
/** A shape filled with hatching. */
const hp = (d, u, k, op) => `<path d="${d}" fill="url(#${u}${k})"${op != null ? ` opacity="${op}"` : ''}/>`;
/** A band of hatching. */
const hr = (u, k, x, y, w, h, op) => `<rect x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${n2(h)}"`
  + ` fill="url(#${u}${k})"${op != null ? ` opacity="${op}"` : ''}/>`;
const box = (x, y, w, h, fill) => `<rect x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${n2(h)}" fill="${fill}"/>`;

/** A tiny figure, for scale. `y` is the ground under its feet. */
function figure(x, y, h, arms = 0) {
  const sw = n2(Math.max(0.8, h / 13));
  let d = `M${n2(x)} ${n2(y - h * 0.6)}V${n2(y - h * 0.28)}`
    + `M${n2(x)} ${n2(y - h * 0.28)}l${n2(-h * 0.13)} ${n2(h * 0.28)}`
    + `M${n2(x)} ${n2(y - h * 0.28)}l${n2(h * 0.12)} ${n2(h * 0.28)}`;
  if (arms === 1) d += `M${n2(x - h * 0.17)} ${n2(y - h * 0.44)}L${n2(x)} ${n2(y - h * 0.52)}l${n2(h * 0.2)} ${n2(-h * 0.12)}`;
  else d += `M${n2(x - h * 0.15)} ${n2(y - h * 0.47)}h${n2(h * 0.3)}`;
  return `<g stroke-linecap="round">${p(d, sw)}</g>`
    + `<circle cx="${n2(x)}" cy="${n2(y - h * 0.71)}" r="${n2(h * 0.105)}" fill="${INK}"/>`;
}

/**
 * Smoke: one torn mass, stippled, with a broken contour on the lit side and a
 * couple of curls turning inside it. Drawn as a single closed shape, because a
 * stack of ellipses reads as a stack of ellipses.
 */
function plume(u, x, y, h, lean, w0, dense) {
  const K = 7;
  const ax = (t) => x + lean * t * t;
  const rad = (t) => w0 * (0.5 + t * 2.1) * (1 + 0.14 * Math.sin(t * 11 + w0));
  let L = '';
  let R = '';
  for (let i = 0; i <= K; i++) {
    const t = i / K;
    const wob = 0.82 + 0.3 * Math.sin(t * 8.2 + x * 0.11);
    L += `${i ? 'L' : 'M'}${n2(ax(t) - rad(t) * wob)} ${n2(y - h * t)}`;
    R = `L${n2(ax(t) + rad(t) * (1.7 - wob))} ${n2(y - h * t)}` + R;
  }
  const d = `${L}${R}Z`;
  return `<path d="${d}" fill="url(#${u}${dense ? 'j' : 'i'})" opacity="${dense ? 0.9 : 0.66}"/>`
    + p(d.replace(/Z$/, ''), 0.55, 'opacity="0.45"')
    // curls, turning over inside the mass
    + p(`M${n2(ax(0.34) - w0)} ${n2(y - h * 0.34)}q${n2(w0 * 1.6)} ${n2(-h * 0.1)} ${n2(w0 * 1.2)} ${n2(h * 0.08)}`
      + `M${n2(ax(0.66) - w0 * 1.4)} ${n2(y - h * 0.66)}q${n2(w0 * 2.2)} ${n2(-h * 0.12)} ${n2(w0 * 1.6)} ${n2(h * 0.1)}`,
      0.6, 'opacity="0.5"');
}

/**
 * Rails, sleepers and ballast running away from the eye. The sleepers are spaced
 * projectively — evenly in the world, so crowding correctly on the sheet — and
 * both the bar width and the ink weight fall off with distance.
 */
function track(x0, y0, w0, x1, y1, w1, nSleepers = 13) {
  const q = Math.max(0.04, w1 / w0);
  let out = '';
  let prev = -99;
  for (let i = 0; i <= nSleepers; i++) {
    const f = i / nSleepers;
    const t = f / (f + q * (1 - f));            // the projective mapping
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    const w = w0 + (w1 - w0) * t;
    if (y0 - y !== 0 && Math.abs(y - prev) < 2.2 && i) continue;
    prev = y;
    out += p(`M${n2(x - w * 0.66)} ${n2(y)}h${n2(w * 1.32)}`, n2(Math.max(0.5, 1.9 * (w / w0))),
      'stroke-linecap="butt"');
  }
  // ballast shoulders, then the two rails over the top of everything
  out += p(`M${n2(x0 - w0 * 0.95)} ${n2(y0)}L${n2(x1 - w1 * 0.95)} ${n2(y1)}`, 0.7, 'opacity="0.6"')
    + p(`M${n2(x0 + w0 * 0.95)} ${n2(y0)}L${n2(x1 + w1 * 0.95)} ${n2(y1)}`, 0.7, 'opacity="0.6"')
    + p(`M${n2(x0 - w0 * 0.34)} ${n2(y0)}L${n2(x1 - w1 * 0.34)} ${n2(y1)}`, n2(Math.max(1, w0 * 0.02 + 1.1)))
    + p(`M${n2(x0 + w0 * 0.34)} ${n2(y0)}L${n2(x1 + w1 * 0.34)} ${n2(y1)}`, n2(Math.max(1, w0 * 0.02 + 1.1)));
  return out;
}

/**
 * An elvish ship in profile, bows to the right: a long low hull, one high prow
 * carved and curled over, a lower stern, and a single square sail. `sail` 0 puts
 * it furled on the yard.
 */
function elfShip(u, x, y, sc, sail, pennant) {
  const HULL = 'M-72 -4C-52 6 52 6 72 -4C50 2-48 2-72 -4Z';
  let a = fp('M-72 -4C-52 6 52 6 72 -4L58 -12C20-6-40-6-58-12Z')
    + p('M-58 -12C-40 -6 20 -6 58 -12', 1.2, `stroke="${PAPER}"`)
    + fp(HULL)
    // the prow, sweeping up and curling forward over the water
    + p('M70 -6C92-18 98-42 88-60C84-68 92-72 97-66', 3.4)
    + p('M88 -60C86-66 90-68 94-65', 1.6)
    // the stern, lower, and the steering board
    + p('M-70 -8C-86-18-88-36-80-46', 3)
    + p('M-80 -46C-82-50-78-52-74-49', 1.4)
    + p('M-64 -2l-12 14', 2.2)
    + p('M-1 -6V-78', 2.4);
  if (sail) {
    // one square sail on a yard, bellied out and away: two mirrored halves make
    // a balloon, and a balloon is not a sail
    const SAIL = 'M-40 -68C-44-52-38-38-32-32C-6-24 22-26 42-34C44-48 40-60 34-68Z';
    a += fp(SAIL, `url(#${u}a)`) + p(SAIL, 1.5)
      + p('M-18 -67C-20-50-16-38-14-31M2 -67C0-50 2-38 2-30M20 -68C20-52 22-40 22-31',
        0.6, 'opacity="0.5"')
      + p('M-44 -70H40', 2.4);
  } else {
    a += p('M-30 -70H34', 2.4) + fp('M-28 -74h60v7h-60z') + p('M-20 -74v7M-4 -74v7M14 -74v7', 0.6, `stroke="${PAPER}"`);
  }
  if (pennant) a += rp('M2 -80C16-77 24-73 28-70C20-68 10-70 2-72Z', 0.9, `fill="${RED}"`);
  return `<g transform="translate(${n2(x)},${n2(y)}) scale(${n2(sc)})">${a}</g>`;
}

/** Bare paper left in broken bands: the glint of light on water. */
function glints(x, y, w, h, nn, rnd, sw = 2.6) {
  let d = '';
  for (let i = 0; i < nn; i++) {
    const gx = x + rnd() * w;
    const gy = y + (i / nn) * h + rnd() * (h / nn);
    d += `M${n2(gx)} ${n2(gy)}h${n2(7 + rnd() * 26)}`;
  }
  return p(d, sw, `stroke="${PAPER}" stroke-linecap="butt"`);
}

/** Graduated tone: bands of hatching, thinning as they go up. */
function grad(u, x, y, w, h, keys, from = 0.7, to = 0.18) {
  const N = keys.length;
  let s = '';
  for (let i = 0; i < N; i++) {
    const t = N === 1 ? 0 : i / (N - 1);
    s += hr(u, keys[i], x, y + (h * i) / N, w, h / N + 0.6, n2(from + (to - from) * t));
  }
  return s;
}

/** A short train in silhouette, running left to right on the given rail line. */
function train(x, y, s = 1, cars = 3, smoke = 0) {
  const g = (a) => `<g transform="translate(${n2(x)},${n2(y)}) scale(${n2(s)})">${a}</g>`;
  const wheel = (wx, r) => `<circle cx="${wx}" cy="${n2(-r)}" r="${r}" fill="${INK}"/>`;
  let a = ''
    // the engine: boiler, cab, chimney, dome
    + fp(`M-30 -7h20v-9h9v9h5l1-3h6v3h3v7h-44z`)
    + fp(`M-30 -16h11v9h-11z`) + box(-27.5, -14, 5.5, 4.5, PAPER)
    + fp(`M-6 -22h5.5v6h-5.5z`) + fp(`M-7.5 -24h8.5v2.5h-8.5z`)
    + fp(`M-14 -18h4v2h-4z`)
    + wheel(-25, 2.6) + wheel(-17, 2.6) + wheel(-8, 3.4) + wheel(-1, 3.4)
    + fp(`M-44 -12h13v12h-13z`) + box(-42, -10, 9, 5, PAPER)   // tender
    + wheel(-40, 2.4) + wheel(-34, 2.4);
  for (let i = 0; i < cars; i++) {
    const cx = -60 - i * 17;
    a += fp(`M${cx} -13h15v13h-15z`)
      + p(`M${cx + 3} -13v13M${cx + 8} -13v13M${cx + 12} -13v13`, 0.6, `stroke="${PAPER}"`)
      + wheel(cx + 3.5, 2.4) + wheel(cx + 11.5, 2.4);
  }
  return g(a) + (smoke ? '' : '');
}

/** Gulls, or something like them, as the two strokes everyone draws. */
function birds(x, y, w, h, nb, rnd, sw = 0.7) {
  let d = '';
  for (let i = 0; i < nb; i++) {
    const bx = x + rnd() * w;
    const by = y + rnd() * h;
    const sc = 2.2 + rnd() * 2.6;
    d += `M${n2(bx - sc)} ${n2(by)}q${n2(sc * 0.6)} ${n2(-sc * 0.75)} ${n2(sc)} 0`
      + `q${n2(sc * 0.45)} ${n2(-sc * 0.75)} ${n2(sc)} 0`;
  }
  return p(d, sw, 'opacity="0.8"');
}

/* ── the sheet ────────────────────────────────────────────────────── */

const NUMERAL = {
  first_bridge: 'I', first_bore: 'II', first_marsh: 'III', first_wood: 'IV',
  first_east: 'V', first_wrack: 'VI', first_quays: 'VII', deep_bore: 'VIII',
  elves_depart: 'IX', dragon: 'X', balrog: 'XI', ent: 'XII',
  errand: 'XIII', age3: 'XIV', charter: 'XV', dismissed: 'XVI',
};

/* Legend type has to fit the sheet without a measuring pass, so the widths of
   the caps are averaged once here. */
const capWidth = (s, fs, ls) => s.length * (fs * 0.575 + ls);

function legend(num, cap) {
  const t = String(cap || '').toUpperCase().replace(/&/g, 'and');
  let fs = 12.5;
  let ls = 1.5;
  while (capWidth(t, fs, ls) > 596 && fs > 8.4) { fs -= 0.4; ls -= 0.06; }
  const mid = VW / 2;
  return `<g text-anchor="middle" font-family="${SERIF}" fill="${INK}">`
    // the broken rule: black hairline, gap, vermilion hairline, lozenge between
    + p(`M${BX} 247h256M${VW - BX - 256} 247h256`, 1.2)
    + rp(`M${BX} 250.5h256M${VW - BX - 256} 250.5h256`, 0.7)
    + rp('M320 244l5 4.5-5 4.5-5-4.5z', 0.9)
    + `<text x="${mid}" y="270" font-size="10.5" letter-spacing="2.6" fill="${SOFT}">도판 ${num}.</text>`
    + `<text x="${mid}" y="288" font-size="${n2(fs)}" letter-spacing="${n2(ls)}">${esc(t)}</text>`
    + '</g>';
}

/** Wraps a drawing in the sheet: paper, clip, paired frame rules, legend.
 *  `body` carries its own <defs> at the head; defs draw nothing, so they are
 *  harmless inside the clip. */
function sheet(id, u, body, cap, tooth = true) {
  const inner = body + (tooth ? hr(u, 'q', BX, BY, BW, BH, 0.5) : '');
  // Only the hatchings this plate actually referred to are defined. Reading them
  // back off the drawing keeps the plate from carrying patterns it never used.
  const seen = inner.match(new RegExp(`url\\(#${u}([a-zA-Z])\\)`, 'g')) || [];
  const keys = [...new Set(seen.map((m) => m.slice(-2, -1)))].join('');
  return `<svg viewBox="0 0 ${VW} ${VH}" xmlns="http://www.w3.org/2000/svg" class="plateFig"`
    + ` role="img" aria-label="${esc(cap)}" preserveAspectRatio="xMidYMid meet">`
    + defs(u, keys)
    + box(0, 0, VW, VH, PAPER)
    + `<g clip-path="url(#${u}z)">${inner}</g>`
    // paired frame: a firm rule outside, a hairline within
    + `<rect x="${BX - 4.5}" y="${BY - 4.5}" width="${BW + 9}" height="${BH + 9}" fill="none" stroke="${INK}" stroke-width="1.6"/>`
    + `<rect x="${BX}" y="${BY}" width="${BW}" height="${BH}" fill="none" stroke="${INK}" stroke-width="0.6"/>`
    + legend(NUMERAL[id] || '', cap)
    + '</svg>';
}

/* Context, guarded. Anything may be missing; nothing may throw. */
function ctxOf(id, c) {
  const o = c && typeof c === 'object' ? c : {};
  let rng = typeof o.rng === 'function' ? o.rng : null;
  if (!rng) {
    // A stable fallback, seeded off the plate's name, so the same plate draws
    // the same way twice and the screenshots can be compared.
    let x = 2166136261;
    for (let i = 0; i < id.length; i++) { x ^= id.charCodeAt(i); x = Math.imul(x, 16777619); }
    rng = () => { x = Math.imul(x ^ (x >>> 15), 2246822507); x ^= x >>> 13; return ((x >>> 0) % 100000) / 100000; };
  }
  const nm = (v) => (v == null ? '' : String(v).trim());
  return {
    place: nm(o.place), placeB: nm(o.placeB),
    region: nm(o.region) || nm(o.regionName), regionName: nm(o.regionName),
    week: Number.isFinite(+o.week) ? Math.max(1, Math.round(+o.week)) : 0,
    culture: nm(o.culture).toLowerCase(),
    n: Number.isFinite(+o.n) ? +o.n : 0,
    rng,
  };
}
const wk = (c) => (c.week ? ` · ${c.week}주차` : '');
const at = (c, fallback) => (c.place ? c.place : fallback);

let seq = 0;
const uid = () => `pl${(++seq).toString(36)}`;

/* ═══ I. THE FIRST CROSSING ══════════════════════════════════════════
   A girder bridge from the near bank: plate girders under the deck, the train
   on top of it, and two figures on the shingle to say how big it is. */
function first_bridge(c) {
  const u = uid();
  const HZ = 130;
  let s = '';

  // sky, palest at the horizon
  s += hr(u, 'i', BX, BY, BW, 108, 0.5) + hr(u, 'h', BX, 84, BW, 46, 0.75);
  s += birds(455, 42, 120, 26, 4, c.rng, 0.6);

  // the far shore: one hairline and a shallow wash of tone
  const far = `M${BX} ${HZ}L96 118 152 123 236 110 318 117 402 106 486 116 560 108 ${BX + BW} 119`;
  s += hp(far + `L${BX + BW} ${HZ + 4}L${BX} ${HZ + 4}Z`, u, 'h', 0.85) + p(far, 0.55);
  s += p('M120 128q14-9 30-1M300 126q18-11 34-2', 0.5, 'opacity="0.6"');   // trees, barely

  // the river: laid lines, closer together as the water comes towards us
  s += grad(u, BX, HZ + 3, BW, 84, ['a', 'b', 'n'], 0.5, 0.75);
  // the piers, standing in their own reflections
  s += p('M190 176v34M202 176v30M324 168v36M336 168v30M456 160v34M468 160v28M62 194v26M92 194v22',
    1.5, 'opacity="0.4"');
  // glints: the paper left bare in broken bands
  s += glints(30, HZ + 6, 570, 80, 15, c.rng, 2.4);

  // the bridge. Deck at 100; girders 104–120; four piers into the water.
  const pier = (px, w, base) => fp(`M${px - w} 120h${w * 2}l${-w * 0.22} ${base - 120}h${-w * 1.56}z`, `url(#${u}f)`)
    + p(`M${px - w} 120h${w * 2}l${-w * 0.22} ${base - 120}h${-w * 1.56}z`, 1.2)
    + p(`M${px - w * 0.45} 122V${base - 2}`, 0.5, 'opacity="0.7"');
  s += pier(196, 13, 176) + pier(330, 12, 168) + pier(462, 11, 160);
  // abutments, one of masonry on each bank
  s += hp('M56 120h34l6 74H50z', u, 'g', 0.9) + p('M56 120h34l6 74H50z', 1.6)
    + hp('M566 120h40l8 58h-52z', u, 'f', 0.9) + p('M566 120h40l8 58h-52z', 1.2);

  // the girders: a lattice web between two chords, which is the whole reason a
  // bridge of this date looks like a bridge of this date
  let web = '';
  for (let x = 62; x <= 596; x += 17) {
    web += `M${n2(x)} 105L${n2(x + 17)} 119M${n2(x + 17)} 105L${n2(x)} 119`;
  }
  let post = '';
  for (let x = 62; x <= 613; x += 34) post += `M${n2(x)} 104V120`;
  s += hr(u, 'v', 62, 104, 552, 16, 0.3) + p(web, 0.65, 'opacity="0.85"') + p(post, 1.1)
    + p('M60 104h554M60 119.5h554', 1.8) + p('M60 100h556', 2.2);
  // the deck, and a hairline parapet
  s += fp('M58 96h556v4.5H58z') + p('M64 96V90M120 96V90M180 96V90M240 96V90M300 96V90M360 96V90M420 96V90M480 96V90M540 96V90M596 96V90', 0.6)
    + p('M60 90h552', 0.7);

  // the train, mid-span, going away to the east
  s += train(392, 96, 0.92, 3);
  s += plume(u, 386, 70, 56, 40, 4.4, true);

  // the near bank: the darkest thing in the plate, and the reason it reads deep
  const bank = `M${BX} ${BB}V208C60 194 110 196 152 206C196 217 240 226 300 232L${BX + BW} ${BB}Z`;
  s += fp(bank, `url(#${u}g)`) + hp(bank, u, 'c', 0.45)
    + p('M15 208C60 194 110 196 152 206C196 217 240 226 300 232', 2.2)
    + p('M40 214q8-11 14 -1M74 208q6-11 13-1M120 218q7-11 14-1M180 226q8-10 15 0M244 232q8-11 15-1', 1.2);
  // a boat pulled up on the shingle, and two figures who came down to look
  s += `<g transform="translate(214,222) rotate(-4)">${fp('M-22 0C-14 7 14 7 22 0C10 3 -12 3 -22 0Z')}`
    + p('M-22 0C-14 7 14 7 22 0', 1.6) + p('M-18 -4C-8 1 10 1 18 -4', 1.1) + p('M0 -3v-9', 1.2) + '</g>';
  s += figure(150, 206, 19) + figure(163, 208, 17.5, 1);
  return { u, s, cap: `최초의 트러스교 · ${at(c, '브래큰포드')}${wk(c)}` };
}

/* ═══ II. THE FIRST BORE ═════════════════════════════════════════════ */
function first_bore(c) {
  const u = uid();
  let s = '';
  // the mountain wall. Its west faces take the light; every east face is put
  // into shadow with the close hatch, which is what makes it rock and not a cone.
  const mt = `M${BX} ${BB}L${BX} 150 76 118 118 96 152 126 196 118 232 78 268 40 300 74 336 60`
    + ` 350 92 386 70 424 56 470 96 512 116 546 88 560 92 596 124 ${BX + BW} 140V${BB}z`;
  s += grad(u, BX, BY, BW, 118, ['j', 'i', 's'], 0.42, 0.12);
  s += fp(mt, PAPER) + hp(mt, u, 'm', 0.55) + p(mt, 1.6);
  // One light, from the west. Everything east of each summit crease goes into the
  // close hatch — a shadow that follows the ridges instead of sitting on them.
  s += `<defs><clipPath id="${u}c3"><path d="${mt}"/></clipPath></defs>`
    + `<g clip-path="url(#${u}c3)">`
    + fp('M268 40 300 74 336 60 350 92 386 70 424 56 470 96 512 116 546 88 560 92 596 124 640 140V240H268Z',
      `url(#${u}x)`, 'opacity="0.65"')
    + hp('M268 40 300 74 336 60 350 92 386 70 424 56 470 96 512 116 546 88 560 92 596 124 640 140V240H268Z',
      u, 'g', 0.28)
    // and the creases themselves, falling towards the reader
    + p('M268 40 254 172M424 56 412 168M118 96 108 166M512 116 502 170M350 92 342 158', 0.8, 'opacity="0.6"')
    + '</g>';
  // crags: short strokes down the fall line, and bare paper where snow lies
  s += p('M268 48l9 20 7-13 9 24M424 64l7 18 8-12 6 20M118 104l8 16 6-11 7 18M512 124l6 14 7-10'
    + 'M196 124l7 14 6-10 6 16M336 68l6 16 7-11 5 15', 0.7, 'opacity="0.75"');
  s += fp('M262 52q10 6 18 2-8 10-22 8zM418 68q9 5 15 1-6 9-18 7zM506 126q8 4 13 1-5 8-15 6z', PAPER);
  // and the lower slopes, in shadow, holding the portal
  s += hp(`M${BX} 150 76 118 160 138 96 200 ${BX} 214z`, u, 'g', 0.3);

  // the portal: dwarf work, so it is angular and it is not modest
  const px = 320;
  const base = 214;
  s += hp(`M${px - 96} ${base}v-34l16-14h20l10-10h100l10 10h20l16 14v34z`, u, 'g', 0.8);
  s += fp(`M${px - 62} ${base}v-46l10-12h24l8-9h40l8 9h24l10 12v46z`, INK);
  // the mouth, cut square out of that mass, and the dark inside it
  s += fp(`M${px - 44} ${base}v-40l8-9h20l6-7h20l6 7h20l8 9v40z`, PAPER)
    + fp(`M${px - 38} ${base}v-36l7-8h17l5-6h17l5 6h17l7 8v36z`, INK)
    + hr(u, 'g', px - 38, base - 58, 76, 58, 0.4);
  // stepped mouldings, the dwarvish habit
  s += p(`M${px - 62} ${base - 46}h124M${px - 56} ${base - 52}h112M${px - 50} ${base - 58}h100`, 1.1, `stroke="${PAPER}"`);
  s += p(`M${px - 96} ${base - 34}h192`, 1.2) + p(`M${px - 96} ${base}h192`, 2);
  // the keystone rune, in the only red on the plate
  s += `<g transform="translate(${px},${base - 64})">${rp('M-7 9V-9l7-4 7 4v18', 1.9)}${rp('M-7 0h14', 1.9)}</g>`;
  // a door-warden, small, so the arch is enormous
  s += figure(px + 58, base, 22);

  // spoil, tipped either side: a tip has a straight batter and a flat crest,
  // because it was made by men walking barrows up a plank
  const tip = (tx, w, h, k) => {
    const d = `M${n2(tx - w)} ${base}L${n2(tx - w * 0.28)} ${n2(base - h)}H${n2(tx + w * 0.22)}L${n2(tx + w)} ${base}Z`;
    return hp(d, u, k, 0.85) + hp(d, u, 'g', 0.3) + p(d, 1.3)
      + p(`M${n2(tx - w * 0.6)} ${base}L${n2(tx - w * 0.16)} ${n2(base - h * 0.86)}`
        + `M${n2(tx + w * 0.5)} ${base}L${n2(tx + w * 0.1)} ${n2(base - h * 0.9)}`, 0.5, 'opacity="0.55"');
  };
  s += tip(178, 54, 42, 'y') + tip(476, 46, 32, 'x') + tip(120, 36, 22, 'g');

  // the track out of the portal, coming down to the reader
  s += track(px + 6, BB + 6, 96, px - 2, base - 2, 26, 13);
  // the ground, dark and worked over
  s += hp(`M${BX} ${BB}V232q120-22 300-20t${BX + BW - 300} 16V${BB}z`, u, 'w', 0.75)
    + p(`M${BX} 232q120-22 300-20t${BX + BW - 300} 16`, 1.6);
  return { u, s, cap: `최초의 굴착 · ${at(c, '선더링 산맥')} · 시공, 카자드림` };
}

/* ═══ III. THE CAUSEWAY ══════════════════════════════════════════════
   Mist is the subject; the timber is only there to be swallowed by it. */
function first_marsh(c) {
  const u = uid();
  let s = '';
  const HZ = 122;
  s += grad(u, BX, BY, BW, 110, ['i', 's', 's'], 0.4, 0.12);
  // fen water: flat, dark, going nowhere
  s += grad(u, BX, HZ, BW, 116, ['a', 'b', 'n', 'n'], 0.45, 0.8);
  s += glints(30, HZ + 6, 560, 100, 16, c.rng, 2.2);

  // dead trees, the far ones barely there
  const snag = (x, y, h, sw, op) => p(
    `M${x} ${y}c-1 ${-h * 0.4} 2 ${-h * 0.6} 1 ${-h}`
    + `M${x + 0.6} ${n2(y - h * 0.62)}l${-h * 0.2} ${-h * 0.2}M${x + 0.8} ${n2(y - h * 0.5)}l${h * 0.24} ${-h * 0.16}`
    + `M${x + 1} ${n2(y - h * 0.8)}l${h * 0.16} ${-h * 0.12}`, sw, op ? `opacity="${op}"` : '');
  s += snag(96, HZ + 2, 46, 0.6, 0.55) + snag(126, HZ + 3, 34, 0.5, 0.45)
    + snag(300, HZ + 4, 58, 0.7, 0.6) + snag(468, HZ + 2, 40, 0.55, 0.5)
    + snag(556, 132, 68, 0.9, 0.8) + snag(212, 128, 52, 0.6, 0.5);

  // the causeway: piles into the fen, a timber deck, rails on top, going away
  // to the left so the far end can be taken by the mist
  const deckY = (x) => 200 - (x - 60) * 0.24;
  let piles = '';
  let braces = '';
  for (let x = 68; x <= 500; x += 26) {
    const dy = deckY(x);
    const dep = 34 - (x - 60) * 0.05;
    piles += `M${n2(x)} ${n2(dy)}v${n2(dep)}M${n2(x + 9)} ${n2(dy)}v${n2(dep * 0.86)}`;
    braces += `M${n2(x)} ${n2(dy + dep * 0.5)}l${n2(9)} ${n2(-dep * 0.34)}`;
  }
  s += p(piles, 1.15) + p(braces, 0.7, 'opacity="0.8"');
  s += fp(`M60 ${n2(deckY(60))}L512 ${n2(deckY(512))}v7L60 ${n2(deckY(60) + 9)}z`)
    + p(`M62 ${n2(deckY(62) - 4)}L512 ${n2(deckY(512) - 3)}`, 1.4)
    + p(`M62 ${n2(deckY(62) - 8)}L512 ${n2(deckY(512) - 6)}`, 0.8);
  // reflections of the piles, in a broken hand
  s += p('M68 236v10M94 232v9M120 228v8M146 224v7M172 220v6M198 216v6M224 213v5',
    0.6, 'opacity="0.45"');

  // the mist: blurred paper, banked across the fen, taking the far end of the
  // causeway with it
  s += `<g filter="url(#${u}B)">`
    + `<path d="M${BX} 148q120-18 220 2t${BW - 220} -8v30H${BX}z" fill="${PAPER}" opacity="0.85"/>`
    + `<path d="M${BX} 112q160 14 300-6t${BW - 300} 10v22H${BX}z" fill="${PAPER}" opacity="0.8"/>`
    + `<ellipse cx="430" cy="152" rx="190" ry="22" fill="${PAPER}" opacity="0.8"/>`
    + `<ellipse cx="120" cy="196" rx="130" ry="16" fill="${PAPER}" opacity="0.5"/></g>`;
  s += hr(u, 's', BX, 104, BW, 104, 0.45);

  // The heron that is not a heron. Too tall for a heron, jointed the wrong way,
  // and it has turned to look at the reader, which herons do not do.
  const hx = 470;
  const hy = 232;
  s += p(`M${hx} ${hy}L${hx - 5} ${hy - 44}M${hx + 17} ${hy + 2}L${hx + 20} ${hy - 46}`, 2.2)
    + p(`M${hx - 5} ${hy - 44}l7 -10M${hx + 20} ${hy - 46}l-6 -9`, 1.9)
    + p(`M${hx - 4} ${hy}l-9 3M${hx + 21} ${hy + 2}l9 3`, 1.6)
    // the body, narrow and upright
    + fp(`M${hx + 2} ${hy - 52}c-16 -8 -18 -34 -2 -46c10 -8 22 -4 26 8c5 16 -2 34 -10 40z`)
    + hp(`M${hx + 2} ${hy - 52}c-16 -8 -18 -34 -2 -46c10 -8 22 -4 26 8c5 16 -2 34 -10 40z`, u, 'v', 0.3)
    // the neck: an S with one bend too many
    + p(`M${hx + 14} ${hy - 96}c-10 -10 4 -18 -2 -28c-4 -8 -12 -10 -12 -20`, 3.2)
    // the head, facing us, with both eyes showing
    + fp(`M${hx + 6} ${hy - 112}c0 -8 8 -12 16 -10c8 2 10 10 6 16c-4 6 -18 6 -22 -6z`)
    + fp(`M${hx + 12} ${hy - 100}l4 16 4 -16z`)
    + `<circle cx="${hx + 11}" cy="${hy - 108}" r="1.7" fill="${PAPER}"/>`
    + `<circle cx="${hx + 21}" cy="${hy - 108}" r="1.7" fill="${PAPER}"/>`
    // and the wings, half open, with a joint nobody can account for
    + p(`M${hx - 2} ${hy - 76}c-16 4 -24 16 -22 34c8 -12 14 -18 22 -20`
      + `M${hx + 26} ${hy - 74}c16 6 22 18 20 36c-8 -13 -13 -19 -21 -21`, 1.6);
  // its reflection, broken, and longer than it should be
  s += p(`M${hx + 4} ${hy + 4}v14M${hx + 12} ${hy + 8}v10M${hx + 20} ${hy + 5}v13`, 1.1, 'opacity="0.4"');
  // reeds, in front of it, so it is standing in the water and not on the plate
  s += p('M424 238q4-24 0-36M436 240q1-26 6-34M448 236q-2-22 2-30M512 238q5-22 2-32M526 240q-1-24 5-32M540 236q3-20 0-28',
    1.2);
  s += hp(`M${BX} ${BB}V230q90-10 180-2t${BW - 180} -8V${BB}z`, u, 'n', 0.5);
  return { u, s, cap: '우는 습지 위의 둑길 · 끝이 닿지 않는 말뚝' };
}

/* ═══ IV. THE WOODLAND SECTION ═══════════════════════════════════════
   A tunnel of trees. The tone is heaviest at the frame and opens to a single
   bright point, which is where the lamp is. */
function first_wood(c) {
  const u = uid();
  let s = '';
  const VPX = 336;
  const VPY = 138;
  // the far end of the cutting: pale, and the only pale thing here
  s += box(BX, BY, BW, BH, PAPER) + hr(u, 'i', BX, BY, BW, BH, 0.35);
  s += `<ellipse cx="${VPX}" cy="${VPY}" rx="86" ry="60" fill="${PAPER}"/>`;

  // canopy, closing over the line
  const can = `M${BX} ${BY}h${BW}v58q-70 26-150 4t-140 22-152-16-118 12z`;
  s += fp(can, `url(#${u}g)`) + hp(can, u, 'd', 0.55)
    + p(`M${BX} ${BY + 58}q60 12 118-12t152 16 140-22 150-4`, 1.6, 'opacity="0.9"');

  // the great trunks. Leaning in, and bigger than the plate.
  const trunk = (x0, top, botW, topW, lean, k, sw) => {
    const H = BB + 6 - top;
    const d = `M${n2(x0 - botW)} ${BB + 6}`
      + `C${n2(x0 - botW + lean * 0.3)} ${n2(top + H * 0.6)} ${n2(x0 + lean - topW)} ${n2(top + H * 0.36)} ${n2(x0 + lean - topW)} ${n2(top)}`
      + `H${n2(x0 + lean + topW)}`
      + `C${n2(x0 + lean + topW)} ${n2(top + H * 0.36)} ${n2(x0 + botW + lean * 0.3)} ${n2(top + H * 0.6)} ${n2(x0 + botW)} ${BB + 6}z`;
    // a trunk this close to the eye is nearly a silhouette: the bark is the
    // paper left between the strokes, not a tone laid over it
    return hp(d, u, k, 0.95) + hp(d, u, 'v', 0.55) + p(d, sw);
  };
  s += trunk(96, BY - 4, 52, 30, 34, 'g', 2.4);
  s += trunk(560, BY - 4, 58, 34, -40, 'g', 2.4);
  s += trunk(196, BY + 10, 22, 15, 16, 'w', 1.4);
  s += trunk(486, BY + 16, 19, 13, -14, 'w', 1.3);
  // bark: long broken strokes down the near trunks
  s += p('M70 240q10-90 26-166M120 244q8-96 20-172M582 238q-10-92-24-166M534 244q-6-98-16-174',
    0.7, 'opacity="0.65"');
  // roots over the ballast
  s += p('M60 232q26 10 40 22M124 236q-16 10-24 22M576 230q-24 12-36 24M540 238q18 10 26 20', 1.4);

  // boughs reaching across, hairline so they do not fight the trunks
  s += p('M132 78q86 22 150-6M540 92q-90 26-160-4M150 120q70 18 128 2M520 130q-80 16-130 0',
    0.85, 'opacity="0.75"');
  // the middle distance: a crowd of thin trees, lighter as they go back
  let far = '';
  for (let i = 0; i < 16; i++) {
    const x = 230 + ((i * 61) % 210) + (c.rng() * 8 - 4);
    const h = 60 + c.rng() * 50;
    far += `M${n2(x)} ${n2(VPY + 46)}v${n2(-h)}`;
  }
  s += p(far, 0.6, 'opacity="0.55"');

  // the line itself, out of the dark and towards the reader
  s += hp(`M${BX} ${BB}L${BX} 226q120-18 320-16t${BW - 320} 12V${BB}z`, u, 'b', 0.5);
  s += track(330, BB + 12, 210, VPX, VPY + 28, 15, 16);
  // a lamp at the far end. The one red mark on the plate.
  s += `<circle cx="${VPX + 3}" cy="${VPY + 12}" r="3.4" fill="${RED}"/>`
    + `<circle cx="${VPX + 3}" cy="${VPY + 12}" r="6" fill="none" stroke="${INK}" stroke-width="0.9"/>`;
  // and the dark of the wood pressing in at the frame
  s += `<g opacity="0.5">${hr(u, 'g', BX, BY, 62, BH)}${hr(u, 'g', BX + BW - 62, BY, 62, BH)}</g>`;
  return { u, s, cap: `삼림 구간 · ${c.region || '엘더우드'} · 벌채 허가는 여전히 분쟁 중` };
}

/* ═══ V. THE EASTERN GAP ═════════════════════════════════════════════
   Seen from the west, which is the only way anyone has seen it. */
function first_east(c) {
  const u = uid();
  let s = '';
  s += hr(u, 's', BX, BY, BW, 120, 0.8) + hr(u, 'h', BX, 74, BW, 62, 0.6);

  // what can be seen through the gap: farther peaks, in the faintest tone there is
  const beyond = 'M300 168 344 118 372 140 404 104 436 136 470 112 500 168z';
  s += hp(beyond, u, 'h', 0.7) + p(beyond, 0.45, 'opacity="0.6"');
  // and the plume beyond it, which is not weather
  s += plume(u, 424, 150, 118, 46, 5.4, true);

  // the ridge: black, and unhelpfully continuous
  const ridge = `M${BX} ${BB}V162L74 140 128 148 186 116 244 130 300 108 354 126`
    + `L378 170 400 174 420 132 470 118 520 136 566 112 ${BX + BW} 134V${BB}z`;
  s += fp(ridge, INK) + p(ridge, 2);
  // facets caught by the last of the light, cut back out of the black
  s += p('M128 150l24-30 10 18M244 132l30-22 8 14M420 134l26-14 8 12M520 138l24-24 8 12',
    0.7, `stroke="${PAPER}" opacity="0.5"`);
  // the gap itself, and the one red mark: what is burning on the far side
  s += fp('M362 170 380 176 400 178 416 138 424 148 410 178 372 176z', PAPER)
    + rp('M378 176q10-18 22-30q-4 18 -8 30z', 1.1, `fill="${RED}" fill-opacity="0.9"`)
    + hr(u, 'i', 366, 150, 52, 28, 0.5);

  // the moor between us and it, and a nearer ridge to stand the party on
  s += hp(`M${BX} ${BB}V196q140-14 300-10t${BW - 300} 8V${BB}z`, u, 'h', 0.9)
    + p(`M${BX} 196q140-14 300-10t${BW - 300} 8`, 1.1);
  const NEAR = `M${BX} ${BB}V222C70 212 130 216 186 228C240 239 280 238 330 238H${BX} Z`;
  s += fp(NEAR, `url(#${u}g)`) + hp(NEAR, u, 'c', 0.4)
    + p('M15 222C70 212 130 216 186 228C240 239 280 238 330 238', 2.2);
  s += p('M60 216q10-12 18-2M140 224q8-12 16-1M240 232q10-11 18-1M480 220q9-12 17-2M560 230q9-11 17-1', 1.2);
  s += track(300, BB + 8, 130, 388, 178, 9, 15);

  // the survey party, packing up. A theodolite reads as engineering at any size.
  const tx = 122;
  const ty = 220;
  s += p(`M${tx} ${ty}l-9 -22M${tx} ${ty}l9 -22M${tx - 4} ${ty - 10}h8`, 1.3)
    + fp(`M${tx - 7} ${ty - 30}h14v8h-14z`) + p(`M${tx + 6} ${ty - 27}h11`, 1.6)
    + p(`M${tx} ${ty - 30}v-5`, 1.1);
  s += figure(tx + 26, ty + 2, 22, 1);
  return { u, s, cap: `서쪽에서 바라본 동쪽 틈새 · ${at(c, '선더링 산맥')}` };
}

/* ═══ VI. MOUNT WRACK ════════════════════════════════════════════════
   The plate the whole line is built towards. The cone is drawn with contour
   hatching that follows its own form — arcs sagging across it, crowding as they
   near the base — and the works at its foot are kept deliberately tiny and
   repetitive, because the horror of the thing is entirely a ratio. */
function first_wrack(c) {
  const u = uid();
  // The cone is described once, then used as outline, as clip and as horizon.
  // Its flanks are concave — steep off the rim, flaring into a skirt of its own
  // waste — which is the difference between a volcano and a triangle.
  // The summit is a rim, not a peak: the far lip carries the silhouette and the
  // near lip is drawn inside it, so the plate looks into the crater.
  const LIP = 'C412 42 436 40 452 48';
  const CONE = `M150 202C300 154 356 100 396 50${LIP}C494 96 556 152 660 208Z`;
  const NEAR_LIP = 'C440 62 412 64 396 50';
  // and the line down the spur that divides what the light reaches
  const SPUR = 'C414 112 374 162 336 204';
  const LIT = `M150 202C300 154 356 100 396 50C408 60 420 63 428 63${SPUR}Z`;
  const DARK = `M428 63${SPUR}L660 208C556 152 494 96 452 48C446 58 438 62 428 63Z`;
  let s = `<defs><clipPath id="${u}c1"><path d="${CONE}"/></clipPath>`
    + `<clipPath id="${u}c2"><path d="${DARK}"/></clipPath></defs>`;

  // ── the sky, and then what has been done to it
  s += grad(u, BX, BY, BW, 150, ['j', 'j', 'i', 's'], 0.8, 0.12);
  // the pall: one torn mass out of the summit, spread west over everything, with
  // its underside the heaviest tone on the plate bar the works
  const PBOT = 'C40 116 62 78 96 96C130 114 138 66 176 86C214 106 218 60 258 84'
    + 'C298 108 300 62 342 88C384 114 392 70 424 96';
  const PALL = `M446 18C384 4 300 26 232 15C160 4 68 28 8 15L8 96${PBOT}C446 76 456 42 436 26Z`;
  s += `<g filter="url(#${u}T)">${fp(PALL, `url(#${u}j)`)}${hp(PALL, u, 'g', 0.32)}</g>`;
  s += p(`M8 96${PBOT}`, 1.6, 'opacity="0.85"');
  // and two rags of it come away below
  s += `<g filter="url(#${u}T)" opacity="0.7">`
    + fp('M60 112C96 100 140 118 172 108C150 126 96 130 60 112Z', `url(#${u}i)`)
    + fp('M250 118C286 106 320 122 350 112C324 132 280 134 250 118Z', `url(#${u}i)`) + '</g>';
  // and the column feeding it, straight out of the crater
  const COL = 'M410 58C396 40 392 20 400 4L470 4C474 26 462 44 444 56Z';
  s += fp(COL, `url(#${u}j)`) + hp(COL, u, 'g', 0.35) + p(COL, 0.7, 'opacity="0.5"');
  s += plume(u, 428, 52, 44, -14, 8, true);

  // ── the cone: lit from the left, and hatched along its own fall
  s += fp(CONE, PAPER);
  s += fp(LIT, `url(#${u}m)`, 'opacity="0.45"');
  s += fp(DARK, `url(#${u}x)`, 'opacity="0.8"') + hp(DARK, u, 'g', 0.55);
  // contour hatching, sagging across the form and crowding towards the foot
  const bez3 = (P, t) => {
    const m = 1 - t;
    const w = [m * m * m, 3 * m * m * t, 3 * m * t * t, t * t * t];
    return [0, 1].map((j) => w[0] * P[0][j] + w[1] * P[1][j] + w[2] * P[2][j] + w[3] * P[3][j]);
  };
  const LP = [[150, 202], [300, 154], [356, 100], [392, 52]];
  const RP = [[448, 44], [494, 96], [556, 152], [660, 208]];
  let cont = '';
  const NC = 13;
  for (let i = 1; i <= NC; i++) {
    const t = Math.pow(i / (NC + 1), 1.6);
    const L = bez3(LP, 1 - t);
    const R = bez3(RP, t);
    const mx = (L[0] + R[0]) / 2;
    cont += `M${n2(L[0])} ${n2(L[1])}Q${n2(mx)} ${n2((L[1] + R[1]) / 2 + (R[0] - L[0]) * 0.1)} ${n2(R[0])} ${n2(R[1])}`;
  }
  // the contours belong to the shadow: an engraver leaves a lit slope bare
  s += `<g clip-path="url(#${u}c2)">${p(cont, 0.6, 'opacity="0.5"')}`
    + p('M436 60C458 114 480 158 508 206M446 50C494 104 540 154 590 206'
      + 'M428 66C444 120 456 158 472 204M456 62C500 110 530 150 566 202', 1.15, 'opacity="0.6"')
    + '</g>';
  // on the lit flank, two gullies and nothing else
  s += `<g clip-path="url(#${u}c1)">`
    + p('M404 62C382 116 352 158 322 204M394 66C352 114 300 158 250 202', 0.9, 'opacity="0.5"')
    + p('M300 168q22-6 40 2M266 182q26-6 44 2M232 194q24-5 40 3', 0.55, 'opacity="0.45"')
    + '</g>';
  s += p(CONE, 2.2);
  // the crater. The one red thing on the plate is at the bottom of it.
  const BOWL = `M396 50${LIP}${NEAR_LIP}Z`;
  s += fp(BOWL, `url(#${u}g)`) + hp(BOWL, u, 'v', 0.5) + p(BOWL, 1.4)
    + p(`M396 50${NEAR_LIP.replace('C', 'C')}`, 2.2);
  s += rp('M404 56q10 6 22 2t18-8q-4 10-16 14t-24 -8z', 0.7, `fill="${RED}" fill-opacity="0.9"`)
    + rp('M446 54C464 80 476 112 482 148', 1.2, 'opacity="0.8"');

  // ── the works at the foot: terraces cut into the skirt, and a silhouette of
  // small industry along each. Kept small on purpose: the ratio is the horror.
  for (let i = 0; i < 3; i++) {
    const y = 176 + i * 9;
    const x0 = 252 - i * 26;
    s += hr(u, 'g', x0, y, 640 - x0, 9.4, 0.55)
      + p(`M${n2(x0)} ${n2(y)}H640`, 1.6) + p(`M${n2(x0 + 8)} ${n2(y + 8.6)}H640`, 0.6, 'opacity="0.6"');
  }
  let sil = '';
  for (let i = 0; i < 26; i++) {
    const x = 208 + i * 16.4 + (c.rng() * 4 - 2);
    const row = i % 3;
    const y = 176 + row * 9;
    const h = 5 + c.rng() * 8;
    const kind = i % 5;
    if (kind === 1) sil += `M${n2(x)} ${n2(y)}v${n2(-h - 11)}h3v${n2(h + 11)}z`;               // a stack
    else if (kind === 3) sil += `M${n2(x - 5)} ${n2(y)}l${n2(2)} ${n2(-h - 3)}h${6}l2 ${n2(h + 3)}z`;  // a kiln
    else if (kind === 4) sil += `M${n2(x - 6)} ${n2(y)}v${n2(-h)}l6 -3 6 3v${n2(h)}z`;         // a shed
    else sil += `M${n2(x - 7)} ${n2(y)}v${n2(-h)}h14v${n2(h)}z`;
  }
  s += fp(sil, INK);
  // two of them are working today
  s += plume(u, 262, 164, 34, 15, 2.8, true) + plume(u, 466, 158, 28, 12, 2.4, true);
  // an inclined tramway, crawling up the flank to a stage on the shadow line
  s += p('M330 176L378 132M334 177L382 133', 1)
    + p('M336 172l-3 4M344 164l-3 4M352 156l-3 4M360 148l-3 4M368 140l-3 4M376 132l-3 4', 0.7, 'opacity="0.9"')
    + fp('M370 134h16v-8h-16z') + fp('M374 126h4v-6h-4z');

  // ── the ash plain: nearly bare paper, so the works read black against it
  s += hr(u, 's', BX, 196, BW, 42, 0.5);
  s += p('M60 212q40-5 74 1M330 220q44-5 78 1M150 230q52-5 92 3', 0.6, 'opacity="0.45"');
  // ash, banked up where the wind puts it, and a wagon that came off
  const bank = 'M418 238C452 224 500 216 552 220C596 223 620 230 640 238Z';
  s += hp(bank, u, 'k', 0.7) + hp(bank, u, 'g', 0.3) + p('M418 238C452 224 500 216 552 220C596 223 620 230 640 238', 1.5);
  s += `<g transform="translate(516,220) rotate(-14)">${fp('M-13 -9h26v9h-26z', `url(#${u}g)`)}`
    + p('M-13 -9h26v9h-26z', 1.4) + `<circle cx="-7" cy="-13" r="3" fill="none" stroke="${INK}" stroke-width="1.2"/>`
    + `<circle cx="7" cy="-13" r="3" fill="none" stroke="${INK}" stroke-width="1.2"/></g>`;
  // the line, run right up to it, with a rake standing at the head of steel
  s += track(214, BB + 12, 86, 306, 198, 10, 13);
  s += `<g transform="translate(268,206) scale(0.62)">`
    + fp('M0 -14h16v14H0zM20 -14h16v14H20zM40 -14h16v14H40z', INK)
    + `<g fill="${INK}"><circle cx="4" cy="2" r="2.6"/><circle cx="13" cy="2" r="2.6"/>`
    + `<circle cx="24" cy="2" r="2.6"/><circle cx="33" cy="2" r="2.6"/>`
    + `<circle cx="44" cy="2" r="2.6"/><circle cx="53" cy="2" r="2.6"/></g></g>`;
  s += p('M300 194v9M296 203h9', 1.6);

  // ── the near ground, dark, and the two men who brought the line here
  const near = `M${BX} ${BB}V222C60 208 110 210 158 222C196 231 220 234 252 238Z`;
  s += hp(near, u, 'w', 0.85) + hp(near, u, 'd', 0.45)
    + p('M15 222C60 208 110 210 158 222C196 231 220 234 252 238', 2.2);
  s += p('M40 230q9-9 16 0M92 226q8-9 15 0M140 234q9-9 16 1', 1);
  s += figure(196, 224, 21) + figure(210, 227, 19, 1);
  return { u, s, cap: `선로 끝에서 바라본 랙 산 · ${at(c, '잿빛벌판')}${wk(c)}` };
}

/* Lettering inside a plate, for the one plate that is a measured drawing. */
const txt = (x, y, t, fs = 9, ls = 1.5, fill = INK, anchor = 'start') =>
  `<text x="${n2(x)}" y="${n2(y)}" font-family="${SERIF}" font-size="${fs}" letter-spacing="${ls}"`
  + ` fill="${fill}" text-anchor="${anchor}">${esc(String(t).toUpperCase())}</text>`;

/* ═══ VII. THE GREY QUAYS ════════════════════════════════════════════ */
function first_quays(c) {
  const u = uid();
  let s = '';
  const HZ = 128;
  // a grey morning: the tone is in the sky and the water, and the quay is the
  // one plane the light is not doing anything for
  s += grad(u, BX, BY, BW, 116, ['j', 'i', 's'], 0.5, 0.14);
  s += p(`M${BX} 96q120-10 240 2t${BW - 240} -6`, 0.6, 'opacity="0.4"');
  s += birds(150, 30, 420, 66, 12, c.rng, 0.8) + birds(60, 92, 200, 30, 5, c.rng, 0.55);

  // the estuary. Far shore a hairline, then the water darkening as it comes in.
  s += p(`M${BX} ${HZ}H${BX + BW}`, 0.6);
  s += hp(`M${BX} ${HZ - 4}q90-7 190 1t${BW - 190} -4v7H${BX}z`, u, 'h', 0.8);
  s += grad(u, BX, HZ, BW, 62, ['h', 'a', 'b'], 0.3, 0.6);
  s += glints(240, HZ + 8, 380, 52, 14, c.rng, 2.2);

  // the far arm of the quay, with the sheds and the crane standing on it
  s += hp('M18 152H236l-10-10H18z', u, 'v', 0.6) + p('M18 142h208l10 10H18z', 1.6);
  s += hp('M22 142H190v-30l-14-10H22z', u, 'k', 0.6)
    + p('M22 102h154l14 10v30M22 112h168', 1.5)
    + fp('M40 142h18v-22H40z', `url(#${u}g)`) + p('M40 120h18v22H40z', 1)
    + fp('M96 142h14v-16H96z', `url(#${u}g)`);
  s += p('M148 142V70M148 70l58 22M148 82l42 14M206 92v14', 1.9)
    + fp('M202 106h9v7h-9z') + p('M206 113q6 4 1 9q-5 4-6-2', 1.1) + p('M140 142h16', 2.2);
  // the ships. The nearest is alongside; the others are standing off.
  s += elfShip(u, 520, 146, 0.34, 0, 0) + elfShip(u, 396, 154, 0.46, 1, 0);
  s += elfShip(u, 300, 181, 0.8, 1, 1);
  s += p('M236 186q58 6 116 0', 0.6, 'opacity="0.5"');

  // the deck we are standing on, and the edge of it
  const EDGE = `M${BX} 192L${BX + BW} 180`;
  s += fp(`${EDGE}V${BB}H${BX}Z`, PAPER) + hr(u, 'h', BX, 178, BW, 62, 0.55);
  s += p(EDGE, 2.6) + p(`M${BX} 197L${BX + BW} 185`, 0.6, 'opacity="0.6"');
  s += p('M90 194l-24 44M210 190l-16 48M330 186l-8 52M450 183l2 55M560 181l10 57', 0.6, 'opacity="0.5"')
    + p(`M${BX} 214h${BW}`, 0.5, 'opacity="0.4"');
  // bollards along the edge, and the ship made fast to two of them
  s += fp('M244 190h11v-12h-11zM368 186h11v-12h-11zM492 182h11v-12h-11z')
    + p('M250 178q-2-14 8-18M374 174q-2-14 8-17', 1.2)
    + p('M248 178C262 168 276 176 292 178M256 180C272 172 286 180 300 184', 0.9, 'opacity="0.85"');
  // the line, ending. A buffer stop is the most final thing an engineer draws.
  s += track(400, BB + 16, 108, 176, 206, 30, 11);
  s += `<g transform="translate(176,206)">`
    + fp('M-20 -4h40v6h-40z') + fp('M-19 -22h38v16h-38z', `url(#${u}g)`)
    + p('M-19 -22h38v16h-38z', 2.2) + p('M-19 -22l38 16M19 -22l-38 16', 1)
    + fp('M-15 -26h9v5h-9zM6 -26h9v5H6z') + '</g>';
  s += figure(468, 179, 21) + figure(70, 142, 13);
  return { u, s, cap: `${at(c, '실버하이드')}의 회색 부두 · 선로는 차단기에서 끝난다` };
}

/* ═══ VIII. SECTION ON A—B ═══════════════════════════════════════════
   A measured drawing, not a view: rock in stipple, strata in hairline, our own
   bore set out properly and dimensioned. The other gallery is drawn as found. */
function deep_bore(c) {
  const u = uid();
  let s = '';
  const GL = 54;
  // above ground, thinly: this plate's interest is all underneath
  s += p(`M${BX} ${GL}q60-5 120 1t140-4 148 3 ${BW - 408} -2`, 1.5);
  s += p('M40 54q4-7 8 0M64 55q4-7 8 0M300 51q4-7 8 0M330 52q4-7 8 0M470 53q5-7 9 0M560 52q4-7 8 0', 0.7);
  s += fp('M92 54q-4-12 2-20 4-6 10 0 5 8 1 20z') + p('M100 54V36', 0.8);
  s += fp('M420 54v-14h26l6-6 6 6h4v14z') + p('M420 40h26', 0.9) + p('M446 30v-6', 0.8);

  // the rock: stipple, then bedding planes drawn as they were found
  s += hr(u, 's', BX, GL, BW, BB - GL, 0.85) + hr(u, 'h', BX, GL, BW, BB - GL, 0.25);
  s += hr(u, 'g', BX, 214, BW, 24, 0.3);
  s += p(`M${BX} 74q90 10 180 2t190 6 ${BW - 370} -6M${BX} 96q120-8 230 4t${BW - 230} -8`
    + `M${BX} 196q140 10 260-2t${BW - 260} 6M${BX} 118q100 12 210 2`, 0.55, 'opacity="0.6"');
  // the broken-out edges, so it reads as a section and not as a box
  s += p(`M${BX + 8} ${GL}q6 20-2 40t4 44-3 40 2 40-1 ${BB - GL - 164}`
    + `M${BX + BW - 8} ${GL}q-7 24 1 44t-4 40 2 44-1 ${BB - GL - 168}`, 0.7, `stroke="${SOFT}" opacity="0.7"`);

  // ── OUR WORKS: crown 138, invert 168, lined, tracked, level, and drawn with
  // the confidence of a works that has a drawing
  s += box(BX, 138, BW, 30, PAPER);
  s += p(`M${BX} 138H${BX + BW}M${BX} 168H${BX + BW}`, 2.4);
  let lin = '';
  for (let x = 20; x < 626; x += 15) lin += `M${x} 138v6M${x} 168v-5`;
  s += p(lin, 0.6, 'opacity="0.85"');
  s += p(`M${BX} 142H${BX + BW}M${BX} 164H${BX + BW}`, 0.6, 'opacity="0.75"');
  let sl = '';
  for (let x = 24; x < 626; x += 12) sl += `M${x} 162.5h8`;
  s += p(sl, 1.3, 'opacity="0.9"') + p(`M${BX} 159.5H${BX + BW}M${BX} 165.5H${BX + BW}`, 1.1);
  s += txt(452, 154, 'our works', 12.5, 3) + p('M448 149h130', 0.7);

  // ── the shaft, with its headgear
  s += box(126, GL, 26, 84, PAPER) + p('M126 54v84M152 54v84', 1.3);
  let rung = '';
  for (let y = 62; y < 136; y += 7) rung += `M129 ${y}h7`;
  s += p(rung, 0.6, 'opacity="0.8"') + hr(u, 'i', 126, GL, 26, 84, 0.4);
  s += p('M126 54l13-22 13 22M132 42h14M139 32v-6', 1.3) + `<circle cx="139" cy="28" r="3.4" fill="none" stroke="${INK}" stroke-width="1.2"/>`;

  // ── the other gallery. Older, and nobody's drawing exists for it.
  const OLD = 'M44 244q30-16 52-38t56-34 44-40 60-30 48-36 58-24 44-16';
  s += `<g><path d="${OLD}" fill="none" stroke="${INK}" stroke-width="21" opacity="0.12"/>`
    + `<path d="${OLD}" fill="none" stroke="url(#${u}g)" stroke-width="21"/>`
    + `<path d="${OLD}" fill="none" stroke="${INK}" stroke-width="21" stroke-opacity="0.35"/></g>`;
  // its walls, drawn twice because they are not parallel
  s += p('M34 240q32-16 54-38t56-34 44-40 60-30 48-36 58-24 46-16', 1.4)
    + p('M54 248q30-14 50-36t56-34 44-40 60-30 48-36 58-24 42-16', 1.4);
  s += p('M120 196q10 6 18 2M210 150q12 5 18 0M320 108q10 7 18 3M430 74q11 5 18 1', 0.7, 'opacity="0.7"');
  // where it passes in front, our own bore is dashed behind it, as convention asks
  s += p('M262 138h44M262 168h40', 1.7, `stroke="${PAPER}"`)
    + p('M262 138h44M262 168h40', 1.1, 'stroke-dasharray="5 5" opacity="0.8"');
  // the leader, in red, to a label that was never filled in
  s += rp('M330 96L400 68h56', 1.2) + rp('M325 99l12-2-5-7z', 0.7, `fill="${RED}"`)
    + rp('M400 68h84M400 64v8M484 64v8', 1.6);

  // ── the dimension, and the drawing-office furniture
  s += p('M176 56v76M176 56l-3 8h6zM176 132l-3-8h6z', 0.9)
    + p('M168 54h16M168 138h16', 0.6)
    + box(140, 88, 32, 13, PAPER) + txt(170, 98, '312 ft', 9, 1.6, SOFT, 'end');
  s += box(22, 68, 116, 13, PAPER) + txt(24, 78, 'section on a—b', 9.5, 2, SOFT);
  s += p(`M${BX} 224h60v5h-60zM${BX + 60} 224h60v5h-60z`, 0.9)
    + fp(`M${BX} 224h30v5h-30zM${BX + 60} 224h30v5h-30z`)
    + txt(15, 221, '0', 7.5, 1, SOFT) + txt(135, 229, '100 ft', 7.5, 1.2, SOFT);
  s += txt(22, GL - 6, 'a', 9, 1, SOFT) + txt(618, GL - 6, 'b', 9, 1, SOFT, 'end');
  return { u, s, cap: `A—B 단면 · ${at(c, '대굴착')} · 우리의 갱도, 그리고 다른 쪽 갱도` };
}

/* ═══ IX. TAKING SHIP ════════════════════════════════════════════════
   No red on this plate. Nothing here is worth pointing at. */
function elves_depart(c) {
  const u = uid();
  let s = '';
  const HZ = 126;
  s += grad(u, BX, BY, BW, 114, ['j', 'i', 'i', 's'], 0.62, 0.1);
  // the last of the light, low down and going
  s += `<ellipse cx="150" cy="126" rx="78" ry="26" fill="${PAPER}"/>`
    + hr(u, 's', 72, 100, 156, 26, 0.4)
    + p('M96 108q54-14 108 0M104 98q46-11 92 1', 0.5, 'opacity="0.45"');
  s += p(`M${BX} ${HZ}H${BX + BW}`, 0.8);

  // the sea: heavier as it comes in, and the light broken across it
  s += grad(u, BX, HZ, BW, 96, ['h', 'a', 'b', 'n'], 0.3, 0.65);
  s += glints(60, HZ + 8, 200, 84, 9, c.rng, 2.2) + glints(280, HZ + 10, 330, 80, 8, c.rng, 2.4);

  // the ship, standing out, already small
  s += elfShip(u, 158, 130, 0.6, 1, 0);
  // the wake, closing behind it
  s += p('M196 134q46 5 94 1M204 140q56 6 108 0', 0.7, 'opacity="0.55"');

  // the quay, running out of the plate towards us, and the lamps along it
  s += fp('M330 152L625 214v24L330 162z', PAPER);
  s += hp('M330 152L625 214v24L330 162z', u, 'v', 0.45)
    + p('M330 152L625 214M330 162L625 238', 1.7);
  let plank = '';
  for (let i = 0; i < 15; i++) {
    const t = Math.pow(i / 14, 1.5);
    const x = 336 + t * 286;
    plank += `M${n2(x)} ${n2(153 + t * 61)}l${n2(-1)} ${n2(10 + t * 14)}`;
  }
  s += p(plank, 0.6, 'opacity="0.7"');
  let pile = '';
  for (let i = 0; i < 6; i++) {
    const t = Math.pow(i / 5, 1.4);
    const x = 352 + t * 268;
    pile += `M${n2(x)} ${n2(158 + t * 66)}v${n2(16 + t * 22)}`;
  }
  s += p(pile, 1.3);
  // the lamps. Standing, glazed, cleaned, and empty.
  const lamp = (x, y, sc) => {
    const h = 44 * sc;
    return p(`M${n2(x)} ${n2(y)}v${n2(-h)}`, n2(1.2 + sc))
      + p(`M${n2(x)} ${n2(y - h)}q0 ${n2(-5 * sc)} ${n2(7 * sc)} ${n2(-5 * sc)}`, n2(0.9 + sc * 0.4))
      + `<g transform="translate(${n2(x + 7 * sc)},${n2(y - h - 5 * sc)}) scale(${n2(sc)})">`
      + fp('M-7 0h14l-2-4h-10z') + fp('M-6 -22h12l1 4h-14z')
      + p('M-5 -18h10v18h-10z', 1.2) + p('M0 -18v18M-5 -9h10', 0.5, 'opacity="0.6"') + '</g>';
  };
  s += lamp(600, 218, 1) + lamp(500, 196, 0.78) + lamp(430, 180, 0.62) + lamp(382, 168, 0.5) + lamp(350, 160, 0.4);
  // the near shore, dark, with the shingle the boats were drawn up on
  const shore = `M${BX} ${BB}V218q40-10 84-4t92 14 96 4V${BB}z`;
  s += hp(shore, u, 'g', 0.85) + hp(shore, u, 'c', 0.4) + p(`M${BX} 218q40-10 84-4t92 14 96 4`, 1.9);
  s += p('M40 228q9-9 16 0M100 226q8-10 15-1M170 236q9-10 16 0M240 234q9-10 16 0', 1);
  return { u, s, cap: '회색 부두에서의 출항 · 등불은 깨끗이 비운 채 남겨 두었다' };
}

/* ═══ X. THE DEEP CHAMBER ════════════════════════════════════════════
   Seen from the tunnel mouth, because nobody went in. */
function dragon(c) {
  const u = uid();
  let s = '';
  // the chamber beyond: pillars, and a floor nobody has swept
  s += box(BX, BY, BW, BH, PAPER) + hr(u, 'j', BX, BY, BW, BH, 0.3);
  s += hr(u, 'g', BX, BY, BW, 70, 0.5);
  s += hp('M170 60h26v130h-26zM440 52h30v140h-30z', u, 'v', 0.7)
    + p('M170 60h26v130h-26zM440 52h30v140h-30z', 1.2)
    + p('M164 60h38M434 52h42M168 190h30M438 192h34', 1.4);
  s += hr(u, 'b', BX, 186, BW, 52, 0.45);

  // the heap of ore wagons, tipped and left
  let heap = '';
  for (let i = 0; i < 9; i++) {
    const x = 190 + (i % 5) * 62 + (i > 4 ? 30 : 0);
    const y = 190 - Math.floor(i / 5) * 26 - (c.rng() * 6);
    const r = (c.rng() * 36 - 18);
    heap += `<g transform="translate(${n2(x)},${n2(y)}) rotate(${n2(r)})">`
      + fp('M-16 -14h32v14h-32z', `url(#${u}g)`) + p('M-16 -14h32v14h-32z', 1.4)
      + `<circle cx="-9" cy="2" r="3.6" fill="none" stroke="${INK}" stroke-width="1.2"/>`
      + `<circle cx="9" cy="2" r="3.6" fill="none" stroke="${INK}" stroke-width="1.2"/>`
      + p('M-11 -14v14M0 -14v14M11 -14v14', 0.5, 'opacity="0.6"') + '</g>';
  }
  s += heap;
  // spilled ore, in front of the heap
  s += hp('M176 196q90-16 190-8t180 12v18H176z', u, 'w', 0.7)
    + p('M200 198q12-8 22 0M280 194q12-7 22 1M380 198q12-8 22 0M470 202q12-8 22 0', 0.8);
  s += p('M220 190h10M330 184h12M430 188h10', 1.6, `stroke="${PAPER}"`);

  // The long shape lying on it. A silhouette in three crossing coils, ribbed
  // with reverse hatching, and a head laid flat on the topmost coil.
  const B1 = 'M466 134C420 126 384 148 344 146C306 144 282 162 296 178C316 196 352 190 386 176';
  const B2 = 'M386 176C420 162 448 172 470 164';
  s += p(B1, 21, 'stroke-linecap="round"') + p(B1, 25, 'stroke-linecap="round" opacity="0.3"')
    + p(B2, 18, 'stroke-linecap="round"');
  s += p('M470 164C494 156 508 138 498 122', 12, 'stroke-linecap="round"')   // the tail, going off
    + p('M498 122C504 112 500 104 492 102', 6, 'stroke-linecap="round"');
  // the ribs of it, cut back out of the black
  s += p('M306 184q4-12 -2-18M330 186q6-12 1-19M356 184q7-11 2-18M382 178q8-11 3-18'
    + 'M356 150q4-12 0-18M386 148q5-12 1-18M416 142q6-11 2-17M446 136q7-11 3-16M470 158q7-10 3-16',
    1, `stroke="${PAPER}" opacity="0.65"`);
  // and the spines, along the top of the coils only
  s += fp('M330 132l5-12 5 11zM362 132l6-12 5 11zM394 130l6-12 5 11zM426 126l6-12 5 12z'
    + 'M458 122l6-12 4 12zM296 164l5-12 5 12z');
  // the head, and the one thing on this plate in red
  s += `<g transform="translate(272,178) rotate(6)">`
    + fp('M0 0C-18 4-38 0-48-8C-54-14-48-20-36-22C-20-25 0-20 8-12C12-7 8-2 0 0Z')
    + fp('M-42 -4C-52-2-60-6-62-10C-56-14-46-14-40-11Z')                     // the jaw
    + p('M-40 -16C-30-20-16-20-6-16', 0.9, `stroke="${PAPER}" opacity="0.55"`)
    + `<circle cx="-14" cy="-14" r="2.6" fill="${RED}"/>`
    + `<circle cx="-14" cy="-14" r="4.6" fill="none" stroke="${PAPER}" stroke-width="1"/>`
    + p('M2 -18C10-30 22-32 30-28', 2.4) + p('M-2 -22C4-34 14-38 24-36', 1.8) + '</g>';
  // two wagons standing in front of it, to say how big it is
  s += `<g transform="translate(330,196) rotate(6)">${fp('M-15 -13h30v13h-30z', `url(#${u}g)`)}`
    + p('M-15 -13h30v13h-30z', 1.5) + `<circle cx="-8" cy="2" r="3.4" fill="none" stroke="${INK}" stroke-width="1.2"/>`
    + `<circle cx="8" cy="2" r="3.4" fill="none" stroke="${INK}" stroke-width="1.2"/></g>`;

  // the tunnel mouth we are looking through: solid, and most of the plate.
  // Two subpaths and an even-odd rule, or the hole fills in and the plate is
  // simply a black rectangle.
  // One subpath that walks round the arch rather than a hole punched in a
  // rectangle: a second subpath depends on the fill rule, and this does not.
  s += fp(`M${BX - 2} ${BY - 2}H${BX + BW + 2}V${BB + 2}H520V148C520 92 448 58 288 58`
    + `C128 58 58 92 58 148V${BB + 2}H${BX - 2}Z`, INK);
  s += p(`M58 ${BB}V148C58 92 128 58 288 58C448 58 520 92 520 148V${BB}`, 2.6);
  // the rough of the rock at the mouth, picked out of the black
  s += p('M120 128q14-10 8-26M140 96q16-12 10-24M420 100q-16-12-8-26M448 136q-16-10-10-28'
    + 'M180 70q18-8 16-20M370 66q-18-8-14-20', 1, `stroke="${PAPER}" opacity="0.45"`);
  // the rails going in, and stopping being anybody's business
  s += track(300, BB + 6, 120, 292, 200, 40, 10);
  return { u, s, cap: `${at(c, '두룬졸')}의 깊은 방 · 측량은 이 지점에서 끝난다` };
}

/* ═══ XI. THE SHAFT ══════════════════════════════════════════════════
   No creature is drawn. The composition is the whole of the horror: rings of
   masonry falling away, a stair that stops, and the light arriving upwards. */
function balrog(c) {
  const u = uid();
  let s = '';
  // the shaft, as a stack of rings diminishing towards a point below and right.
  // Painted largest first, so each ring lays a band inside the last.
  // Masonry courses in one-point perspective, falling away to a vanishing point
  // low on the sheet. Rectangles read as built work where rings read as a bowl,
  // and the four corner lines running to the point are what make it deep.
  const VX = 344;
  const VY = 186;
  const N = 11;
  const frame = (t) => {
    const e = Math.pow(t, 2.0);            // crowd the courses towards the point
    return {
      l: BX + (VX - 8 - BX) * e, r: BX + BW - (BX + BW - VX - 8) * e,
      t: BY + (VY - 5 - BY) * e, b: BB - (BB - VY - 5) * e,
    };
  };
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const f = frame(t);
    const w = f.r - f.l;
    const h = f.b - f.t;
    // deep is dark, and then at the very bottom it is not
    let k = 'g';
    let op = 0.42 + t * 0.7;
    if (t > 0.72) { k = 'b'; op = 1.05 - t; }
    if (t > 0.88) { k = 'h'; op = 0.3; }
    s += box(f.l, f.t, w, h, PAPER) + hr(u, k, f.l, f.t, w, h, n2(Math.min(1, op)))
      + `<rect x="${n2(f.l)}" y="${n2(f.t)}" width="${n2(w)}" height="${n2(h)}" fill="none"`
      + ` stroke="${INK}" stroke-width="${n2(1.9 - t * 1.3)}"/>`;
  }
  // the corner lines, and the courses' own joints running down with them
  s += p(`M${BX} ${BY}L${VX - 8} ${VY - 5}M${BX + BW} ${BY}L${VX + 8} ${VY - 5}`
    + `M${BX} ${BB}L${VX - 8} ${VY + 5}M${BX + BW} ${BB}L${VX + 8} ${VY + 5}`, 1.1, 'opacity="0.75"');
  let joint = '';
  for (let j = 1; j < 8; j++) {
    const fx = BX + (BW * j) / 8;
    joint += `M${n2(fx)} ${BY}L${n2(VX - 8 + (16 * j) / 8)} ${VY - 5}`
      + `M${n2(fx)} ${BB}L${n2(VX - 8 + (16 * j) / 8)} ${VY + 5}`;
  }
  for (let j = 1; j < 4; j++) {
    const fy = BY + (BH * j) / 4;
    joint += `M${BX} ${n2(fy)}L${VX - 8} ${n2(VY - 5 + (10 * j) / 4)}`
      + `M${BX + BW} ${n2(fy)}L${VX + 8} ${n2(VY - 5 + (10 * j) / 4)}`;
  }
  s += p(joint, 0.45, 'opacity="0.3"');

  // the light coming up: bare paper at the bottom of the shaft, one red core,
  // and the glancing light thrown up the walls
  const fz = frame(1);
  s += box(fz.l - 3, fz.t - 2, fz.r - fz.l + 6, fz.b - fz.t + 4, PAPER)
    + rp(`M${n2(fz.l)} ${n2(fz.b)}q3-7 1-11 5 4 8 0 1 5 5 7 4-1 6-3 -1 5 -3 7z`, 0.8,
      `fill="${RED}" fill-opacity="0.9"`);
  s += p(`M${VX - 6} ${VY - 4}L200 96M${VX - 4} ${VY - 5}L300 80M${VX + 6} ${VY - 4}L470 92`
    + `M${VX + 7} ${VY}L520 150M${VX - 7} ${VY + 2}L180 214M${VX + 6} ${VY + 4}L500 226`,
    1.6, `stroke="${PAPER}" opacity="0.55"`);
  s += hr(u, 'i', 240, 150, 210, 76, 0.2);

  // The stair, coming down the left wall in flights. Then four treads that are
  // not there any more, and one that is on its way down.
  let stair = '';
  for (let i = 0; i < 14; i++) {
    const t = i / 15;
    const f = frame(t);
    const g2 = frame(t + 1 / 15);
    if (i >= 8 && i <= 11) continue;              // four treads that are not there
    const y0 = f.b - (f.b - f.t) * 0.22;
    const y1 = g2.b - (g2.b - g2.t) * 0.22;
    stair += `M${n2(f.l)} ${n2(y0)}L${n2(g2.l)} ${n2(y1)}L${n2(g2.l + (g2.l - f.l) * 0.9)} ${n2(y1)}`
      + `L${n2(f.l + (g2.l - f.l) * 1.5)} ${n2(y0)}Z`;
  }
  s += fp(stair, `url(#${u}g)`) + p(stair, 1.2);
  // and one of them on its way down
  s += `<g transform="translate(262,196) rotate(24)">${fp('M0 0h18v5H0z')}${p('M0 0h18v5H0z', 0.9)}</g>`;
  // a chain, left hanging over the side, going down further than the plate does
  s += p('M196 12C202 60 214 104 236 140C252 164 274 178 330 184', 1.6, 'opacity="0.9"')
    + p('M199 12C205 60 217 104 239 140C255 164 277 180 330 186', 0.8, 'opacity="0.6"')
    + fp('M328 182h9v5h-9z');
  // the head of the stair, and the one man still standing on it
  s += fp(`M${BX} 150h44v6h-44z`) + p(`M${BX} 150h44v6h-44z`, 1.4);
  s += figure(38, 150, 22, 1);
  s += p('M60 152q26 3 46 10', 1.1, 'stroke-dasharray="4 5" opacity="0.6"');
  return { u, s, cap: '가장 아래 갱도 밑의 수직갱 · 빛이 올라오고 있다' };
}

/* ═══ XII. THREE TREES ═══════════════════════════════════════════════ */
function ent(c) {
  const u = uid();
  let s = '';
  s += box(BX, BY, BW, BH, PAPER) + hr(u, 'i', BX, BY, BW, 96, 0.35);
  // the wood, either side of the cut, and the canopy closing over the top
  s += hr(u, 'w', BX, BY, 104, BH, 0.75) + hr(u, 'w', BX + BW - 112, BY, 112, BH, 0.75);
  s += hr(u, 'g', BX, BY, 58, BH, 0.5) + hr(u, 'g', BX + BW - 64, BY, 64, BH, 0.5);
  const CAN = `M${BX} ${BY}h${BW}v46C560 74 520 44 470 58C420 72 400 40 340 52`
    + `C280 64 250 38 196 54C150 68 110 42 ${BX} 58Z`;
  s += fp(CAN, `url(#${u}g)`) + hp(CAN, u, 'd', 0.4)
    + p(`M${BX} 58C110 42 150 68 196 54C250 38 280 64 340 52C400 40 420 72 470 58C520 44 560 74 ${BX + BW} 46`, 1.6);
  // boughs reaching down into the cut
  s += p('M120 62C150 84 170 96 156 120M470 66C446 88 430 100 442 124M262 60C290 78 300 88 292 104',
    1.1, 'opacity="0.7"');
  // the middle distance, where the wood goes on for a fortnight
  s += hr(u, 'l', 120, 96, 400, 46, 0.4);
  s += p('M150 142V104M180 142V96M212 142V108M480 142V100M448 142V94M418 142V106', 0.6, 'opacity="0.5"');

  // the right-of-way: cleared, levelled, paid for, and no longer available
  s += hp(`M${BX + 92} ${BB}L288 138h56L${BX + BW - 100} ${BB}z`, u, 'h', 0.9);
  s += p(`M${BX + 92} ${BB}L288 138M${BX + BW - 100} ${BB}L344 138`, 1.2, 'opacity="0.75"');
  s += track(318, BB + 8, 150, 316, 182, 22, 11);
  // the rails run into the roots and do not come out the other side
  s += p('M302 182h30', 1.4, `stroke="${PAPER}"`);

  // three trees, standing where the line was. They were not here on Tuesday.
  const tree = (x, w, top, lean, sw) => {
    const H = BB + 8 - top;
    // barely tapered, and cut off by the top of the sheet: these are not trees
    // that fit inside a plate
    const d = `M${n2(x - w)} ${BB + 8}`
      + `C${n2(x - w * 0.94 + lean * 0.25)} ${n2(top + H * 0.55)} ${n2(x + lean - w * 0.84)} ${n2(top + H * 0.3)} ${n2(x + lean - w * 0.8)} ${n2(top)}`
      + `H${n2(x + lean + w * 0.8)}`
      + `C${n2(x + lean + w * 0.84)} ${n2(top + H * 0.3)} ${n2(x + w * 0.94 + lean * 0.25)} ${n2(top + H * 0.55)} ${n2(x + w)} ${BB + 8}Z`;
    let bark = '';
    for (let i = 1; i < 7; i++) {
      const o = -w + (2 * w * i) / 7;
      bark += `M${n2(x + o)} ${BB}Q${n2(x + o * 0.8 + lean * 0.3)} ${n2(top + H * 0.5)} ${n2(x + o * 0.55 + lean)} ${n2(top + 4)}`;
    }
    return hp(d, u, 'g', 0.92) + hp(d, u, 'v', 0.45) + p(d, sw)
      + p(bark, 1.1, `stroke="${PAPER}" opacity="0.85"`)
      + p(bark, 0.5, 'opacity="0.5"');
  };
  // roots first, so the trunks stand on top of them. Two or three great limbs
  // apiece, closed over the ballast.
  const roots = (x, w) => {
    let d = '';
    for (const [dx, sp, dy] of [[-1.9, 1.1, 0], [-0.9, 0.8, 5], [0.9, 0.85, 4], [1.9, 1.05, 1]]) {
      d += `M${n2(x + w * dx)} ${BB + 8}C${n2(x + w * dx * 0.8)} ${n2(BB - 8 + dy)} `
        + `${n2(x + w * dx * 0.5)} ${n2(BB - 18 + dy)} ${n2(x + w * dx * 0.3)} ${n2(BB - 26)}`
        + `L${n2(x + w * (dx + sp * 0.34) * 0.34)} ${n2(BB - 24)}`
        + `C${n2(x + w * dx * 0.72)} ${n2(BB - 14 + dy)} ${n2(x + w * (dx + sp * 0.2))} ${n2(BB - 4 + dy)} `
        + `${n2(x + w * (dx + sp * 0.3))} ${BB + 8}Z`;
    }
    return fp(d, `url(#${u}g)`) + p(d, 1.5);
  };
  s += roots(232, 26) + roots(330, 21) + roots(432, 28);
  s += tree(232, 26, BY - 6, 9, 2.4) + tree(330, 20, BY + 6, -6, 2) + tree(432, 28, BY - 6, -11, 2.4);
  // and one of them has a rail end in its grip
  s += p('M268 212q14 4 20 10', 2.4) + p('M396 216q-16 4-22 10', 2.4);

  // The pegs, pulled up and stacked. Someone took trouble over this, which is
  // the part that ought to worry the reader.
  const px = 122;
  const py = 228;
  s += fp(`M${px - 56} ${py - 30}h112v34h-112z`, PAPER, 'opacity="0.75"');
  let pegs = '';
  for (let i = 0; i < 8; i++) {
    const o = py - i * 3.4;
    const j = (i % 2) * 3;
    pegs += `M${n2(px - 44 + j)} ${n2(o)}h52l9 -3.4 -9 -3.4h-52z`;
  }
  s += fp(pegs, `url(#${u}v)`) + p(pegs, 0.85);
  s += rp(`M${px - 10} ${py - 26}v28M${px - 1} ${py - 27}v28`, 2.4)
    + rp(`M${px - 12} ${py - 28}q11-9 15 2`, 1.5);
  // a coil of line, wound properly, and the tape folded square
  s += p(`M${px + 76} ${py - 2}a14 6 0 1 0 28 0a14 6 0 1 0 -28 0`, 1.4)
    + p(`M${px + 81} ${py - 2}a9 4 0 1 0 18 0a9 4 0 1 0 -18 0`, 0.8)
    + p(`M${px + 44} ${py + 8}h26v7h-26z`, 1.2);
  s += hp(`M${BX} ${BB}V230q60-8 120-4t150 8 ${BW - 270} -6V${BB}z`, u, 'b', 0.4);
  return { u, s, cap: `노선 안에 서 있는 세 그루의 나무 · ${c.region || '워든홀트'} · 측량 말뚝은 돌려주었다` };
}

/* ═══ XIII. THE LOCKED DRAWER ════════════════════════════════════════ */
function errand(c) {
  const u = uid();
  let s = '';
  // the van's boarding, and the light coming in from somewhere behind us
  s += box(BX, BY, BW, BH, PAPER) + hr(u, 'v', BX, BY, BW, 196, 0.6) + hr(u, 'b', BX, BY, 150, 196, 0.35);
  let plank = '';
  for (let x = 30; x < 626; x += 26) plank += `M${x} ${BY}v184`;
  s += p(plank, 0.8, 'opacity="0.7"');
  s += p(`M${BX} 74h${BW}M${BX} 150h${BW}`, 0.6, 'opacity="0.5"');
  // the floor, and the boards running away
  s += hp(`M${BX} 196h${BW}v${BB - 196}H${BX}z`, u, 'h', 0.7);
  s += p(`M${BX} 196h${BW}`, 1.6)
    + p('M60 196l-40 42M180 196l-52 42M320 196l-64 42M460 196l-70 42M600 196l-74 42', 0.7, 'opacity="0.6"');
  // a strap, and a lamp on its hook: this is a working van
  s += p('M120 20v54q0 16 12 18t12-16V38', 2.2) + `<circle cx="126" cy="18" r="4" fill="none" stroke="${INK}" stroke-width="1.6"/>`;
  s += `<g transform="translate(556,52)">` + p('M0 -30v10', 1.6) + fp('M-13 -20h26l-4 6h-18z')
    + fp('M-11 30h22l3 6h-28z') + p('M-11 -14h22v44h-22z', 1.6)
    + hr(u, 'h', -10, -13, 20, 42, 0.5) + p('M0 -14v44M-11 8h22', 0.5, 'opacity="0.5"') + '</g>';

  // the chest. Iron-bound, and the drawer is out.
  s += fp('M140 118h330v92H140z', PAPER) + hr(u, 'v', 140, 118, 330, 92, 0.5)
    + hr(u, 'g', 140, 118, 330, 92, 0.25) + p('M140 118h330v92H140z', 2.2);
  s += p('M150 118v92M462 118v92', 1.2, 'opacity="0.7"')
    + fp('M140 118h330v6H140zM140 204h330v6H140z') + p('M186 118v92M424 118v92', 3, 'opacity="0.9"');
  // the drawer, pulled out four inches, and the cavity of it in cross-hatch
  s += fp('M164 132h282v14H164z', PAPER) + p('M164 132h282v14H164z', 1.6);
  // the cavity: solid, because the thing inside it has to be the pale mark on a
  // dark ground or the reader will not find it
  s += fp('M170 146h270v40H170z', INK) + p('M170 146h270v40H170z', 2);
  s += p('M176 150h258v32H176z', 0.6, `stroke="${PAPER}" opacity="0.3"`);
  // a folded cloth, and on it one small object, which the docket does not name
  s += fp('M266 180C288 166 328 166 350 180Z', `url(#${u}v)`)
    + p('M266 180C288 166 328 166 350 180', 1.2, `stroke="${PAPER}" opacity="0.6"`);
  s += `<circle cx="308" cy="167" r="11" fill="none" stroke="${PAPER}" stroke-width="4.6"/>`
    + `<circle cx="308" cy="167" r="11" fill="none" stroke="${INK}" stroke-width="0.8"/>`
    + `<circle cx="308" cy="167" r="15.4" fill="none" stroke="${INK}" stroke-width="0.7"/>`
    + p('M301 160q5-4 10-2', 1.3, `stroke="${PAPER}"`);
  // the lock: plate, keyhole, and a chain that has been through the staple twice
  s += fp('M286 190h44v22h-44z', `url(#${u}v)`) + p('M286 190h44v22h-44z', 1.8)
    + `<circle cx="308" cy="198" r="4" fill="${INK}"/>` + fp('M305 199h6l2 9h-10z');
  // a chain, through the staple twice, and the padlock left hanging open
  s += p('M256 212q10 10 22 11M368 212q-10 10-22 11', 1.4)
    + `<circle cx="278" cy="226" r="4" fill="none" stroke="${INK}" stroke-width="1.4"/>`;

  // the docket, laid on the chest top with the Authority's seal on it
  s += `<g transform="translate(390,96) rotate(-6)">`
    + fp('M-70 -30h140v56H-70z', PAPER) + p('M-70 -30h140v56H-70z', 1.5)
    + p('M-60 -18h96M-60 -10h116M-60 -2h104M-60 6h116M-60 14h72', 0.7, 'opacity="0.8"')
    + fp('M56 12l14 14H56z', PAPER) + p('M56 26l14-14', 0.9)
    + `<circle cx="-48" cy="14" r="11" fill="${RED}" fill-opacity="0.9"/>`
    + `<circle cx="-48" cy="14" r="11" fill="none" stroke="${RED_D}" stroke-width="1"/>`
    + p('M-53 9l10 10M-53 19l10-10', 1, `stroke="${PAPER}" opacity="0.7"`) + '</g>';
  s += txt(190, 108, `docket no. ${c.n > 0 ? Math.round(c.n) : 4}`, 8.5, 1.6, SOFT);
  return { u, s, cap: `차장차의 잠긴 서랍 · 내용물: 물품 하나, 기재 없음` };
}

/* ═══ XIV. THE BEACONS ═══════════════════════════════════════════════ */
function age3(c) {
  const u = uid();
  let s = '';
  // night: the sky carries the weight, so the fires can be small
  s += hr(u, 'j', BX, BY, BW, 150, 0.5) + hr(u, 'i', BX, 120, BW, 60, 0.4)
    + hr(u, 'a', BX, BY, BW, 60, 0.3);
  s += p(`M${BX} 92q120-14 240 4t${BW - 240} -8`, 0.5, `stroke="${SOFT}" opacity="0.5"`);

  // the ridges, each with its own answer, going back to the edge of the sheet
  const ridge = (y, x0, amp, k, op, sw) => {
    const d = `M${x0} ${y}q60 ${-amp} 130 ${n2(-amp * 0.4)}t150 ${n2(-amp * 0.2)}`
      + `t120 ${n2(amp * 0.5)}T${BX + BW + 10} ${n2(y + amp * 0.3)}V${BB}H${x0}z`;
    return hp(d, u, k, op) + p(d.replace(/V\d+H-?\d+z/, ''), sw);
  };
  s += ridge(158, BX - 10, 16, 'h', 0.5, 0.5);
  s += ridge(176, BX - 10, 20, 'b', 0.5, 0.8);
  s += ridge(198, BX - 10, 26, 'v', 0.6, 1.2);
  // the answering fires: small, red, and each with its own smoke
  const far = [[110, 156, 0.5], [232, 152, 0.42], [352, 158, 0.56], [452, 172, 0.66], [548, 168, 0.6], [604, 154, 0.4]];
  for (const [fx, fy, sc] of far) {
    s += plume(u, fx, fy - 12 * sc, 44 * sc, 16 * sc, 2.2 * sc, false);
    // a pyre, which at this distance is a dark triangle and a red tongue
    s += fp(`M${n2(fx - 8 * sc)} ${n2(fy)}L${n2(fx)} ${n2(fy - 11 * sc)}L${n2(fx + 8 * sc)} ${n2(fy)}Z`,
      `url(#${u}g)`)
      + p(`M${n2(fx - 8 * sc)} ${n2(fy)}L${n2(fx)} ${n2(fy - 11 * sc)}L${n2(fx + 8 * sc)} ${n2(fy)}Z`,
        n2(0.9 * sc + 0.4));
    s += rp(`M${n2(fx)} ${n2(fy - 9 * sc)}C${n2(fx - 5 * sc)} ${n2(fy - 15 * sc)} ${n2(fx - 3 * sc)} ${n2(fy - 22 * sc)} `
      + `${n2(fx + 1 * sc)} ${n2(fy - 28 * sc)}C${n2(fx + 6 * sc)} ${n2(fy - 20 * sc)} ${n2(fx + 6 * sc)} ${n2(fy - 14 * sc)} `
      + `${n2(fx)} ${n2(fy - 9 * sc)}Z`, 0.7, `fill="${RED}" fill-opacity="0.9"`);
  }

  // the near hill, and the beacon that started it
  const hill = `M${BX} ${BB}V214q60-30 150-32t${BW - 150} 26V${BB}z`;
  s += hp(hill, u, 'g', 0.85) + hp(hill, u, 'c', 0.35) + p(`M${BX} 214q60-30 150-32t${BW - 150} 26`, 2);
  const bx = 176;
  const by = 190;
  // the frame: three legs and a basket of billets
  s += p(`M${bx - 26} ${by + 26}L${bx + 4} ${by - 8}M${bx + 26} ${by + 28}L${bx - 2} ${by - 8}M${bx} ${by + 30}v-34`, 2.4);
  s += p(`M${bx - 18} ${by + 14}h36M${bx - 12} ${by + 2}h26`, 1.4);
  s += fp(`M${bx - 22} ${by - 6}h44l-6 -12h-32z`, `url(#${u}g)`) + p(`M${bx - 22} ${by - 6}h44l-6 -12h-32z`, 1.8);
  s += p(`M${bx - 14} ${by - 8}l4 -10M${bx - 4} ${by - 8}l2 -10M${bx + 8} ${by - 8}l-2 -10M${bx + 16} ${by - 8}l-4 -10`, 1.1);
  // the flame. The largest red on any plate, and it has earned it.
  const fl = `M${bx} ${by - 20}q-16-18-8-40 2 18 12 22 -8-26 6-46 0 22 12 30 -2-16 4-26 4 26 12 34 6 8 2 20`
    + `q-4 12-16 16 -12 4-24-10z`;
  s += rp(fl, 1.2, `fill="${RED}" fill-opacity="0.92"`);
  s += fp(`M${bx - 2} ${by - 24}q-6-10-2-22 4 12 8 14 -4-14 2-24 2 14 8 20 4 8 0 14z`, PAPER, 'opacity="0.45"');
  s += plume(u, bx + 6, by - 84, 74, 40, 5, true);
  // and the man who lit it, keeping back from it
  s += figure(238, 214, 24, 1);
  s += p('M232 214q-6-16 4-24', 1.2);
  return { u, s, cap: `응답하는 봉화들 · ${at(c, '하디 봉화대')}에서 지평선까지${wk(c)}` };
}

/* Runes drawn as strokes, so no font is needed and nothing can arrive as tofu. */
const RUNE_D = {
  dwarf: 'M-5-13V13M-5-8L7-3-5 2',
  halfling: 'M-7-13V13M7-13V13M-7-3L7 3',
  elf: 'M7-13L-4-5 5 3-6 13',
  men: 'M-8 13V-13M8 13V-13M-8-13L0-4 8-13M-8-2L8-2',
  orc: 'M0 13V-5M0-5L-8-13M0-5L8-13',
  watch: 'M0 13V-13M-8-5L0-13 8-5',
  seal: 'M-8-13V13M8-13V13M-8-13L8 13M-8 13L8-13',
};

/* ═══ XV. THE SEAL ═══════════════════════════════════════════════════
   Not a view: a printer's device, for the head of a charter. */
function charter(c) {
  const u = uid();
  let s = '';
  const CX = 320;
  const CY = 116;
  // the ground rules, run the width of the sheet and stopped either side of it
  s += p(`M${BX + 24} 116h180M${BX + BW - 204} 116h180`, 1.4)
    + rp(`M${BX + 24} 120h180M${BX + BW - 204} 120h180`, 0.7);
  s += p(`M${BX + 24} 60h${BW - 48}M${BX + 24} 200h${BW - 48}`, 0.6, 'opacity="0.55"');
  s += rp(`M${BX + 24} 63h${BW - 48}M${BX + 24} 197h${BW - 48}`, 0.5, 'opacity="0.8"');
  // end ornaments: a lozenge and two ticks, the same figure as the register uses
  for (const ex of [BX + 24, BX + BW - 24]) {
    const d = ex < 320 ? 1 : -1;
    s += rp(`M${ex} 111l5 5-5 5-5-5z`, 0.9)
      + p(`M${ex + d * 14} 110v12M${ex + d * 22} 112v8`, 0.8, 'opacity="0.7"');
  }

  // the ribbon: two narrow tails from behind the seal, each folded once and cut
  // with a swallowtail. Kept well apart, or they read as a pair of trousers.
  const tail = (dx) => {
    const d = `M${CX + dx * 8} 128C${CX + dx * 13} 150 ${CX + dx * 17} 166 ${CX + dx * 20} 186`
      + `L${CX + dx * 27} 182C${CX + dx * 30} 194 ${CX + dx * 31} 200 ${CX + dx * 33} 206`
      + `L${CX + dx * 24} 208L${CX + dx * 26} 216L${CX + dx * 17} 210`
      + `C${CX + dx * 14} 196 ${CX + dx * 9} 178 ${CX + dx * 2} 152Z`;
    return fp(d, `url(#${u}v)`) + hp(d, u, 'f', 0.35) + p(d, 1.5)
      + p(`M${CX + dx * 20} 186L${CX + dx * 27} 182`, 1.1, 'opacity="0.75"');
  };
  s += tail(-1) + tail(1);
  // the cords, twisted, going up under the seal
  s += p(`M${CX - 8} 132C${CX - 12} 142 ${CX - 16} 146 ${CX - 22} 150`
    + `M${CX + 8} 132C${CX + 12} 142 ${CX + 16} 146 ${CX + 22} 150`, 1.2, 'opacity="0.8"');

  // the seal itself: milled edge, a ring of impressions, and the rune struck in
  let mill = '';
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    mill += `M${n2(CX + 42 * Math.cos(a))} ${n2(CY + 42 * Math.sin(a))}L${n2(CX + 47 * Math.cos(a))} ${n2(CY + 47 * Math.sin(a))}`;
  }
  s += `<circle cx="${CX}" cy="${CY}" r="46" fill="${RED}" fill-opacity="0.14"/>`
    + rp(mill, 1) + `<circle cx="${CX}" cy="${CY}" r="42" fill="none" stroke="${RED}" stroke-width="2.2"/>`
    + `<circle cx="${CX}" cy="${CY}" r="37" fill="none" stroke="${RED}" stroke-width="0.8"/>`
    + `<circle cx="${CX}" cy="${CY}" r="26" fill="none" stroke="${RED}" stroke-width="1.2"/>`;
  let ring = '';
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2 - 1.57;
    const r1 = 29;
    const r2 = 35;
    ring += `M${n2(CX + r1 * Math.cos(a))} ${n2(CY + r1 * Math.sin(a))}L${n2(CX + r2 * Math.cos(a))} ${n2(CY + r2 * Math.sin(a))}`;
  }
  s += rp(ring, 1.1, 'opacity="0.8"');
  s += `<g transform="translate(${CX},${CY}) scale(1.35)">`
    + `<path d="${RUNE_D[c.culture] || RUNE_D.seal}" fill="none" stroke="${RED}" stroke-width="2.8" stroke-linecap="square"/></g>`;
  // and the wax that ran when it was struck
  s += rp(`M${CX - 30} ${CY + 34}q10 10 30 10t30-10`, 1, 'opacity="0.6"');
  return { u, s, cap: '페릴러스 웨이즈 교통청의 인장 · 이 날에 찍다' };
}

/* ═══ XVI. THE OFFICE ════════════════════════════════════════════════ */
function dismissed(c) {
  const u = uid();
  let s = '';
  s += box(BX, BY, BW, BH, PAPER);
  // the wall, and the light from the window falling across it
  s += hr(u, 'v', BX, BY, BW, 176, 0.45) + hr(u, 'b', 330, BY, 295, 176, 0.3);
  s += p(`M${BX} 176h${BW}`, 1.4) + p(`M${BX} 60h${BW}`, 0.6, 'opacity="0.5"');
  // the window: bare paper, glazing bars, and a morning nobody is looking at
  s += fp('M60 34h150v104H60z', PAPER) + p('M60 34h150v104H60z', 2.2)
    + p('M135 34v104M60 86h150', 1.6) + p('M97 34v104M172 34v104M60 60h150M60 112h150', 0.7);
  s += hr(u, 'h', 60, 34, 150, 104, 0.3) + hp('M60 138h150l-30 40H90z', u, 'h', 0.5);
  s += p('M54 30h162v6H54z', 1.4);
  // the map, hanging as it was left
  s += `<g transform="translate(470,88) rotate(-2.5)">`
    + fp('M-74 -46h148v92h-148z', PAPER) + p('M-74 -46h148v92h-148z', 2)
    + p('M-66 -38h132v76h-132z', 0.7)
    + p('M-58 6q28-24 56-12t62-4', 1, 'opacity="0.8"')
    + p('M-58 22q30-14 60-4t64-6', 0.7, 'opacity="0.6"')
    + hr(u, 'i', -66, -38, 132, 76, 0.35)
    + rp('M-20 -8h34', 1.4) + `<circle cx="-20" cy="-8" r="2.4" fill="${RED}"/></g>`;
  s += p('M470 42v-8', 1) + `<circle cx="470" cy="32" r="3" fill="none" stroke="${INK}" stroke-width="1.2"/>`;
  // the floor, and the one thing in the room that is doing anything: the light
  // out of the window, lying across the boards
  s += hr(u, 'h', BX, 176, BW, BB - 176, 0.6);
  s += fp('M74 176h150l84 62H30Z', PAPER) + hr(u, 'q', 30, 176, 280, 62, 0.5);
  s += p('M90 176l-70 62M200 176l-64 62M310 176l-56 62M420 176l-48 62M530 176l-40 62M620 176l-30 62',
    0.7, 'opacity="0.6"');
  s += p('M74 176l-44 62M224 176l84 62', 0.9, 'opacity="0.5"');

  // the desk, three-quarters on
  s += fp('M210 200h300v10H210z', PAPER) + p('M196 200h318v11H196z', 2.2) + hr(u, 'v', 198, 202, 314, 8, 0.4);
  s += p('M212 211v27M496 211v27M240 211v22M470 211v22', 2) + p('M212 226h284', 1.1);
  s += hp('M240 211h230v18H240z', u, 'g', 0.35);
  // a timetable, ruled and correct, with a mark on it in the other ink
  s += `<g transform="translate(392,178) rotate(-4)">`
    + fp('M-56 -22h112v34h-112z', PAPER) + p('M-56 -22h112v34h-112z', 1.5)
    + p('M-48 -14h96M-48 -8h96M-48 -2h96M-48 4h96', 0.6, 'opacity="0.85"')
    + p('M-20 -22v34M14 -22v34', 0.5, 'opacity="0.6"')
    + rp('M-40 6L34 -18', 1.6, 'opacity="0.9"')
    + rp('M-14 -16h44v14h-44z', 1.2, 'opacity="0.75"') + '</g>';
  // inkwell, and the pen put down across it
  s += fp('M240 200h20v-10h-20z', `url(#${u}g)`) + p('M240 190h20v10h-20zM238 188h24v3h-24z', 1.4)
    + p('M236 186l30-14', 1.4) + fp('M264 174l8-4-4 7z');
  // the chair, pushed back from the desk and left turned away from it
  s += `<g transform="translate(146,204) rotate(-7)">`
    + p('M-26 30V0M22 32V2M-16 40V10M30 40V10', 2.2)
    + fp('M-30 -6h58v10h-58z', `url(#${u}v)`) + p('M-30 -6h58v10h-58z', 2)
    + p('M24 -6v-40M-26 -4v-34', 2.2) + p('M-26 -38h50M-24 -24h48M-24 -31h48', 1.8) + '</g>';
  // the stand, and the hat that was not worth sending on
  s += p('M566 176V72M552 176h28M556 176l10-16M576 176l-10-16', 2)
    + p('M566 84l-16-8M566 84l16-8M566 96l-13-6M566 96l13-6', 1.4);
  s += `<g transform="translate(566,66)">`
    + fp('M-24 0q10-6 24-6t24 6q-10 6-24 6T-24 0z', `url(#${u}g)`)
    + p('M-24 0q10-6 24-6t24 6q-10 6-24 6T-24 0z', 1.8)
    + fp('M-15 -3q0-18 15-18t15 18q-8 5-15 5t-15-5z', `url(#${u}w)`)
    + p('M-15 -3q0-18 15-18t15 18', 1.8) + p('M-14 -8q10-5 28 0', 1.2, 'opacity="0.8"') + '</g>';
  // and a hook with nothing on it
  s += p('M120 148q0 10 8 10t6-8', 1.6);
  return { u, s, cap: `비워진 청장의 집무실 · 시각표는 본래 그대로 두고 떠나다` };
}

/* ── the register of plates ───────────────────────────────────────── */

/** id → builder. A builder takes a guarded context and returns the drawing. */
export const PLATES = {
  first_bridge, first_bore, first_marsh, first_wood, first_east, first_wrack,
  first_quays, deep_bore, elves_depart, dragon, balrog, ent,
  errand, age3, charter, dismissed,
};

/** The order they would be bound in. */
export const PLATE_IDS = Object.keys(PLATES);

export function hasPlate(id) {
  return typeof PLATES[id] === 'function';
}

/**
 * One plate as an `<svg>…</svg>` string, ready to drop into `.plate`.
 * Unknown id, or a plate that throws, gives '' — a missing illustration must
 * never take the report down with it.
 */
export function plate(id, ctx) {
  const key = String(id || '');
  const build = PLATES[key];
  if (typeof build !== 'function') return '';
  try {
    const c = ctxOf(key, ctx);
    const r = build(c);
    if (!r || !r.u || !r.s) return '';
    return sheet(key, r.u, r.s, r.cap || '');
  } catch (e) {
    return '';
  }
             }
