// Eärdon: the continent.
//
// This is authored macro-geography with procedural detail, not pure noise. The
// realm needs to read as *designed* every seed: halflings in the fertile west,
// a mountain wall down the middle with exactly two bad passes, and the ash in
// the east behind a second range so the trunk line has a chokepoint. Noise only
// decides where the hills fall and where the villages sit.

import { makeRng, makeNoise, clamp, lerp, smoothstep, distToSeg, catmull } from '../rng.js';

export const BIOME = {
  OCEAN: 0, BEACH: 1, DOWNS: 2, FARM: 3, FOREST: 4, DARKWOOD: 5,
  MARSH: 6, MOOR: 7, ROCK: 8, SNOW: 9, ASH: 10, SLAG: 11,
};

export const REGION = {
  GREENHOLLOW: 0, FROSTMARCH: 1, MIRKHOLT: 2, PEAKS: 3, WEEPING: 4,
  ASHENREACH: 5, MARCHLANDS: 6, ELDERWOOD: 7, QUAYS: 8, BARROWDOWNS: 9,
  WODENHOLT: 10,
};

export const REGION_NAME = {
  0: 'the Greenhollow', 1: 'the Frostmarch', 2: 'Mirkholt', 3: 'the Sundering Peaks',
  4: 'the Weeping Marsh', 5: 'the Ashenreach', 6: 'the Marchlands', 7: 'Elderwood',
  8: 'the Grey Quays', 9: 'the Barrowdowns', 10: 'Wodenholt',
};

/**
 * What each land is, what it does to a railway, and what the Authority thinks of
 * it. The regions were previously distinguished only by a peril number, which is
 * why the continent read as one place with different textures.
 */
export const REGION_LORE = {
  0: { name: 'the Greenhollow', people: 'Halflings',
       gist: 'Six kinds of hill and a great deal of correspondence.',
       rule: 'Nothing dangerous has happened here in living memory, which the Authority finds unnerving.' },
  1: { name: 'the Frostmarch', people: 'nobody, gladly',
       gist: 'Snow highland. The line drifts over between the turn of the year and the thaw.',
       rule: 'Track here closes for part of every winter.' },
  2: { name: 'Mirkholt', people: 'spiders, reportedly',
       gist: 'Old wood. The trees are close and the light is wrong.',
       rule: 'Track laid through Mirkholt decays faster than track anywhere else.' },
  3: { name: 'the Sundering Peaks', people: 'Dwarves',
       gist: 'The wall down the middle of the world. Two passes, both bad.',
       rule: 'Tunnels bored deep beneath the Peaks find things that were there first.' },
  4: { name: 'the Weeping Marsh', people: 'frogs',
       gist: 'A fen that swallows what is put on it, patiently.',
       rule: 'Causeways across the Marsh sink, and want rebuilding.' },
  5: { name: 'the Ashenreach', people: 'the Eastern Party',
       gist: 'Ash plain, slag, and Mount Wrack at the middle of it.',
       rule: 'Everything here is dangerous and everything here pays four times.' },
  6: { name: 'the Marchlands', people: 'Men',
       gist: 'River plain and market towns. The easy country, and the Council knows it.',
       rule: 'Cheap to build across. The Council will ask why you have not.' },
  7: { name: 'Elderwood', people: 'Elves',
       gist: 'The Elves’ wood, and Lorindel within it.',
       rule: 'Every mile of track laid here is remembered, at length, in verse.' },
  8: { name: 'the Grey Quays', people: 'Elves',
       gist: 'The western shore. Ships leave from here and do not come back.',
       rule: 'Safe. Also the last place you want the Elves to have a reason to visit.' },
  9: { name: 'the Barrowdowns', people: 'the buried',
       gist: 'Chalk ridges full of tombs. Bare, bright, and quiet by day.',
       rule: 'Incidents here happen only after dark, and they happen more.' },
  10: { name: 'Wodenholt', people: 'the Onodrim',
        gist: 'A small wood exactly where you would like to build.',
        rule: 'The wood is not available. It will explain why, slowly.' },
};

/** Ambient danger by region. Consulted when a segment is surveyed. */
export const REGION_PERIL = {
  0: 0.02, 1: 0.30, 2: 0.46, 3: 0.34, 4: 0.38,
  5: 0.72, 6: 0.08, 7: 0.10, 8: 0.06, 9: 0.28, 10: 0.20,
};

/**
 * Local character. Two of these per settlement is the difference between "a
 * village" and Nether Wembly. Each has a small mechanical effect so the flavour
 * is not merely decorative, and each gives the register something to talk about.
 */
export const TRAITS = {
  famous_ale:   { label: 'famous for its ale', kinds: ['shire', 'burg'], produce: { ale: 1.4 } },
  great_market: { label: 'a great market', kinds: ['burg', 'shire'], pax: 1.3, luxury: 1.4 },
  deep_shaft:   { label: 'a very deep shaft', kinds: ['delve'], produce: { ore: 1.6 }, perilNear: 0.10 },
  smithy:       { label: 'a smithy of repute', kinds: ['delve', 'burg'], produce: { steel: 0.8 } },
  on_a_barrow:  { label: 'built on a barrow', kinds: ['shire', 'burg', 'watch'], regions: [9], perilNear: 0.14 },
  sacred_grove: { label: 'a grove nobody cuts', kinds: ['haven', 'shire'], elfCare: 1 },
  old_road:     { label: 'on the old road', kinds: null, buildFrom: 0.85 },
  // Eight of these carried a label and NOTHING ELSE — they were pure decoration, and
  // that is a large part of why settlements never felt like particular places. Every
  // trait now does something the player can notice.
  silent_bell:  { label: 'a bell that never rings', kinds: ['shire', 'burg', 'watch'],
                  pax: 0.82, omen: 0.05 },
  long_memory:  { label: 'a long memory', kinds: ['delve', 'haven'], regardWeight: 2.0 },
  gate_of_kings:{ label: 'a gate cut for kings', kinds: ['delve'], pax: 1.5, luxury: 1.25 },
  hedge_maze:   { label: 'a hedge nobody has mapped', kinds: ['shire'], buildFrom: 1.22 },
  drowned_wing: { label: 'a drowned lower hall', kinds: ['delve'], regions: [4],
                  produce: { ore: 0.7 }, plagueProne: 1.4 },
  watchfire:    { label: 'a watchfire kept lit', kinds: ['watch'], wardsNear: 0.35 },
  slave_pens:   { label: 'pens the Authority does not inspect', kinds: ['hold'],
                  produce: { coal: 1.5, ore: 1.4 }, shameful: 1 },
  bad_water:    { label: 'bad water', kinds: ['shire', 'burg', 'watch', 'hold'], plagueProne: 1.8 },
  fine_masons:  { label: 'fine masons', kinds: ['delve', 'burg'], produce: { stone: 1.4 } },
  hard_winter:  { label: 'a hard winter every year', kinds: null, regions: [1, 3], freezes: true },
  ferry_rights: { label: 'ancient ferry rights', kinds: ['shire', 'burg', 'haven'], nearWater: true, toll: 3.5 },
  smoke_works:  { label: 'works that smoke', kinds: ['burg', 'hold'], smoke: 1.5 },
  ill_omened:   { label: 'ill-omened', kinds: null, regions: [2, 4, 5, 9], perilNear: 0.08 },
};
export const TRAIT_KEYS = Object.keys(TRAITS);

export const CULTURE_OF_KIND = {
  shire: 'halfling', delve: 'dwarf', haven: 'elf',
  burg: 'men', watch: 'men', hold: 'orc',
};

// ---------------------------------------------------------------------------
// Names. Curated, not generated — procedural fantasy names are uniformly bad,
// and half the game is the writing.
// ---------------------------------------------------------------------------

export const NAMES = {
  shire: [
    'Nether Wembly', 'Great Nubbin', 'Puddifoot', 'Combe-under-Hill',
    'Sixpenny Handley', 'Marrowmead', 'Nobbottle', "Hobb's Bottom",
    'Mossy Bottom', 'Widdershin', 'Tuckham', 'Pipwick', 'Little Snoring',
    'Buckleberry Ford', 'Cheddington Parva', 'Nether Slumbering', 'Wistleton',
    'Old Croaking', 'Bagbottom', 'Sowerby Grange', 'Muckle Diddling',
  ],
  delve: [
    'Anvilgate', 'Thrumhold', 'Baraz Deep', 'Kalgarûn', 'the Ironmoot',
    "Grimbeard's Delve", 'Zhaddun', 'Karag-Vor', 'the Underforge', 'Dolvenhal',
    'Hammerreach', 'Khaz Vindral', 'Stonemoot', 'the Long Adit',
  ],
  haven: [
    'Nimrothel', 'Aelinquë', 'Celedhil', 'Mithravel', 'Silverhithe',
    'the Last Quay', 'Elenmar', 'Thalanor', 'Lathrieth', 'Vaenwood',
    'Eryn Sûl', 'Miriel', 'the Willowlands',
  ],
  burg: [
    'Stonemarch', 'Highholt', 'Westermark', 'Dunhollow', 'Kingsbridge',
    'Eryndale', 'Rillbridge', 'Amonwell', 'Harrowgate', 'Farthingale',
    'Coldharbour', 'Saltbridge', 'Ostenmoor', 'Wainford', 'Threpwell',
  ],
  watch: [
    'Windwatch', 'the Grey Tower', 'Thornwatch', 'Beacon Hardy', 'Northkeep',
    'Stormcrown', 'the Sentinel', 'Ravensperch', 'Coldfell Watch',
  ],
  hold: [
    'Gorgobal', 'Uzgrath', 'Nardûk', 'Cinderhold', 'the Slagworks',
    'Grimtooth', 'Ushnak', 'Bolg-Durr', 'the Cauldron', 'Vharn',
  ],
};

/** Places that are always present, always here, always called this. */
const ANCHORS = [
  { u: 0.335, v: 0.505, kind: 'burg',  name: 'Brackenford', tier: 2, anchor: 'brackenford' },
  { u: 0.455, v: 0.585, kind: 'burg',  name: 'Amonhal',     tier: 3, anchor: 'capital' },
  { u: 0.185, v: 0.415, kind: 'shire', name: 'Bywater Byrill', tier: 1, anchor: 'shire' },
  { u: 0.315, v: 0.300, kind: 'haven', name: 'Lorindel',    tier: 2, anchor: 'elfhome' },
  { u: 0.085, v: 0.735, kind: 'haven', name: 'the Grey Quays', tier: 1, anchor: 'quays' },
  { u: 0.645, v: 0.365, kind: 'delve', name: 'Dhurunzol',   tier: 2, anchor: 'greatdelve' },
  { u: 0.880, v: 0.520, kind: 'hold',  name: 'Mount Wrack', tier: 3, anchor: 'wrack' },
];

// ---------------------------------------------------------------------------
// Macro layout helpers
// ---------------------------------------------------------------------------

/** 1 at the centre of the ellipse, 0 outside, smooth between. */
function ellipse(u, v, cu, cv, ru, rv, falloff = 1) {
  const d = Math.hypot((u - cu) / ru, (v - cv) / rv);
  return 1 - smoothstep(1 - falloff, 1, d);
}

/** Distance in uv from a point to a polyline. */
function distToPath(u, v, pts) {
  let best = Infinity, bestT = 0, bestI = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const r = distToSeg(u, v, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
    if (r.d < best) { best = r.d; bestT = r.t; bestI = i; }
  }
  return { d: best, i: bestI, t: bestT, along: (bestI + bestT) / (pts.length - 1) };
}

export function generateWorld(seedStr = 'eardon') {
  const seed = String(seedStr);
  const rng = makeRng(seed);
  const n = makeNoise(seed + ':height');
  const n2 = makeNoise(seed + ':detail');
  const nm = makeNoise(seed + ':moist');

  const W = 280, H = 190, CELL = 4;
  const worldW = W * CELL, worldH = H * CELL;
  const N = W * H;

  const height = new Float32Array(N);
  const water = new Uint8Array(N);
  const biome = new Uint8Array(N);
  const region = new Uint8Array(N);
  const peril = new Float32Array(N);
  const moist = new Float32Array(N);
  const slope = new Float32Array(N);

  // -- the mountain spines -------------------------------------------------
  // Sundering Peaks: sinuous north-south wall. Two passes, jittered by seed so
  // the player has to actually look at the map each run.
  const peakJitter = rng.range(-0.02, 0.02);
  const sunderingPath = catmull([
    { x: 0.615 + peakJitter, y: -0.05 },
    { x: 0.640 + peakJitter, y: 0.18 },
    { x: 0.622 + peakJitter, y: 0.40 },
    { x: 0.665 + peakJitter, y: 0.62 },
    { x: 0.648 + peakJitter, y: 0.84 },
    { x: 0.672 + peakJitter, y: 1.05 },
  ], 10);
  const passA = rng.range(0.30, 0.40);   // northern pass
  const passB = rng.range(0.66, 0.76);   // southern pass

  // Wracklands: the eastern arm that walls off the Ashenreach.
  const wrackPath = catmull([
    { x: 0.745, y: 0.10 },
    { x: 0.775, y: 0.28 },
    { x: 0.752, y: 0.46 },
    { x: 0.782, y: 0.64 },
    { x: 0.760, y: 0.86 },
  ], 10);
  const wrackGate = rng.range(0.42, 0.56); // the one way in

  const passes = [];

  // -- base height ---------------------------------------------------------
  // Heights are a *weighted blend* of per-region target elevations, never a sum.
  // Summing influence functions is how you accidentally build a 170-unit
  // mega-massif where two ranges happen to overlap; blending keeps every cell
  // inside the range of the targets that actually claim it.
  for (let cy = 0; cy < H; cy++) {
    for (let cx = 0; cx < W; cx++) {
      const i = cy * W + cx;
      const u = cx / (W - 1), v = cy / (H - 1);

      const fine = n2.fbm(u * 26, v * 26, 4) * 0.5 + n2.fbm(u * 60, v * 60, 3) * 0.2;
      const broad = n.fbm(u * 4.5, v * 4.5, 4);

      let wsum = 0.30, hsum = 0.30 * (7 + broad * 4);   // the default: open country
      const add = (w, target) => { if (w > 0.001) { wsum += w; hsum += w * target; } };

      // A rolling-hill field reused by the lowland regions. Without this the
      // whole west blends to a featureless table and there is nothing for a
      // surveyor to route around.
      const roll = n.fbm(u * 9.5, v * 9.5, 4) * 11 + n2.fbm(u * 21, v * 21, 3) * 5;

      // --- the Greenhollow: gentle, busy little hills. Six kinds of hill.
      const green = ellipse(u, v, 0.195, 0.430, 0.135, 0.185, 0.8);
      add(green * 1.3, 20 + roll * 1.25);

      // --- the Barrowdowns: bare chalk ridges, combed north-south
      const barrow = ellipse(u, v, 0.225, 0.700, 0.100, 0.105, 0.7);
      const comb = Math.abs(Math.sin(v * 22 + n.fbm(u * 6, v * 6, 2) * 2.2));
      add(barrow * 1.6, 28 + comb * 18 + roll * 0.4);

      // --- Elderwood: raised wooded shelf
      const elder = ellipse(u, v, 0.310, 0.295, 0.090, 0.120, 0.8);
      add(elder * 1.2, 26 + roll * 0.9);

      // --- the Marchlands: broad river plain. Deliberately the easy country —
      //     the player needs somewhere cheap to learn on.
      const march = ellipse(u, v, 0.470, 0.560, 0.160, 0.185, 1.0);
      add(march * 0.9, 12 + broad * 4 + roll * 0.35);

      // --- Mirkholt: old rumpled forest in the north
      const mirk = ellipse(u, v, 0.435, 0.150, 0.115, 0.110, 0.8);
      add(mirk * 1.4, 32 + n.fbm(u * 12, v * 12, 5) * 15 + roll * 0.5);

      // --- Wodenholt: a small wood sitting exactly where you want to build
      const woden = ellipse(u, v, 0.552, 0.345, 0.052, 0.058, 0.7);
      add(woden * 1.4, 24 + roll * 0.6);

      // --- the Frostmarch: northern highland
      const frost = smoothstep(0.185, 0.045, v) * smoothstep(0.13, 0.24, u) * smoothstep(0.60, 0.50, u);
      add(frost * 2.2, 48 + n.ridge(u * 7, v * 7, 4) * 24);

      // --- the Sundering Peaks: the wall down the middle, two bad passes.
      //     Built as foothills PLUS a crest rather than one steep band. A single
      //     smoothstep gives a mountain with vertical sides — slope 2 to 5 —
      //     which no surveyor can drive a portal into and no pass can be walked
      //     through. The broad foot is what makes the range playable.
      const sp = distToPath(u, v, sunderingPath);
      const spFoot = smoothstep(0.125, 0.040, sp.d);
      const spCrest = smoothstep(0.062, 0.002, sp.d);
      const pw = 0.055;
      const cut = Math.max(
        smoothstep(pw, 0.0, Math.abs(v - passA)),
        smoothstep(pw, 0.0, Math.abs(v - passB)),
      );
      const ridged = n.ridge(u * 9, v * 9, 5, 2.1, 0.52);
      add(spFoot * 1.5, 25 + roll * 0.8);
      add(spCrest * 6.0, (82 + ridged * 22) * (1 - cut * 0.66) + 6);

      // --- the Wracklands: the eastern arm, with exactly one gate through it
      const wp = distToPath(u, v, wrackPath);
      const wpFoot = smoothstep(0.092, 0.030, wp.d);
      const wpCrest = smoothstep(0.048, 0.002, wp.d);
      const wpCut = smoothstep(0.044, 0.0, Math.abs(v - wrackGate));
      add(wpFoot * 1.4, 24 + roll * 0.5);
      add(wpCrest * 5.0, (68 + n.ridge(u * 11 + 3, v * 11, 4) * 18) * (1 - wpCut * 0.74) + 6);

      // --- the Ashenreach: flat, wrong-coloured plain behind the arm
      const ash = smoothstep(0.775, 0.845, u);
      add(ash * 2.0, 16 + fine * 5 + n.fbm(u * 8, v * 8, 3) * 7);

      // --- Mount Wrack. Weighted hard so the surrounding ash plain cannot
      //     average the mountain down into a pleasant hill, with a broad skirt
      //     so a line can actually be brought to its foot.
      const coneFoot = ellipse(u, v, 0.880, 0.520, 0.115, 0.145, 0.85);
      const cone = ellipse(u, v, 0.880, 0.520, 0.058, 0.074, 1.0);
      add(coneFoot * 1.3, 26 + fine * 4);
      add(Math.pow(cone, 1.4) * 14.0, 100);

      // --- the Weeping Marsh: pressed down almost to sea level
      const weep = ellipse(u, v, 0.510, 0.800, 0.085, 0.075, 0.85);
      add(weep * 3.0, 2.0 + fine * 1.2);

      // --- a narrow frame at the north and east edges, so the playable area is
      //     bounded by something rather than stopping
      const edge = Math.max(smoothstep(0.058, 0.0, v), smoothstep(0.972, 1.0, u));
      add(edge * 2.4, 56 + fine * 10);

      let h = hsum / wsum + fine * 2.0;

      // --- western sea and the Grey Quays estuary. Applied last, so it wins.
      const westSea = smoothstep(0.075, 0.020, u);
      const bay = ellipse(u, v, 0.085, 0.760, 0.115, 0.150, 0.9);
      const southSea = smoothstep(0.945, 0.995, v) * smoothstep(0.62, 0.40, u);
      const seaMask = clamp(westSea + bay * 0.95 + southSea, 0, 1);
      h = lerp(h, -9 - 8 * seaMask, smoothstep(0.10, 0.62, seaMask));

      // Drown the outermost cells on every side. Without this the continent is a
      // rectangular slab, and zooming out shows its cliff edges and its underside
      // floating in the fog. Ringed by ocean it reads as a coastline instead, and
      // the water plane hides the bottom of the world.
      const dEdge = Math.min(cx, cy, W - 1 - cx, H - 1 - cy);
      h = lerp(h, -17, smoothstep(15, 3, dEdge));

      height[i] = h;

      // record region ownership, most specific wins
      let reg = REGION.MARCHLANDS;
      let bestW = 0.12;
      const claim = (w, r) => { if (w > bestW) { bestW = w; reg = r; } };
      claim(green, REGION.GREENHOLLOW);
      claim(barrow, REGION.BARROWDOWNS);
      claim(elder, REGION.ELDERWOOD);
      claim(mirk, REGION.MIRKHOLT);
      claim(woden * 1.4, REGION.WODENHOLT);
      claim(frost, REGION.FROSTMARCH);
      claim(Math.max(spCrest * 1.3, spFoot * 0.55), REGION.PEAKS);
      claim(Math.max(wpCrest * 1.3, wpFoot * 0.55), REGION.PEAKS);
      claim(weep * 1.2, REGION.WEEPING);
      claim(ash * 1.1, REGION.ASHENREACH);
      claim(march * 0.5, REGION.MARCHLANDS);
      claim(seaMask * 0.9, REGION.QUAYS);
      region[i] = reg;

      moist[i] = clamp(0.5 + nm.fbm(u * 7, v * 7, 4) * 0.45 - ash * 0.75
        + weep * 0.5 + mirk * 0.25 + elder * 0.3 - frost * 0.25, 0, 1);
    }
  }

  // Find the passes properly. For each row, the *barrier* is the highest ground
  // you must cross to get through the band — a local dip is worthless if there
  // is an 80-unit wall either side of it. The passes are the rows where the
  // barrier is lowest, and the saddle is the highest point on that crossing.
  const findGaps = (u0, u1, count, minSep, v0 = 0.08, v1 = 0.92) => {
    const cx0 = Math.round(u0 * (W - 1)), cx1 = Math.round(u1 * (W - 1));
    const cy0 = Math.round(v0 * (H - 1)), cy1 = Math.round(v1 * (H - 1));
    const rows = [];
    for (let cy = cy0; cy <= cy1; cy++) {
      let barrier = -Infinity, bcx = cx0;
      for (let cx = cx0; cx <= cx1; cx++) {
        const h = height[cy * W + cx];
        if (h > barrier) { barrier = h; bcx = cx; }
      }
      rows.push({ cy, barrier, cx: bcx });
    }
    rows.sort((a, b) => a.barrier - b.barrier);
    const out = [];
    for (const r of rows) {
      if (out.length >= count) break;
      if (out.every((o) => Math.abs(o.cy - r.cy) >= minSep)) out.push(r);
    }
    return out.sort((a, b) => a.cy - b.cy);
  };

  passes.push(...findGaps(0.555, 0.735, 2, 28, 0.10, 0.90).map((p) => ({ ...p, h: p.barrier })));
  // The gate search must stay inside the rows where the eastern arm actually
  // exists, or it happily reports the empty ash plain north of it as a gap.
  const gates = findGaps(0.720, 0.815, 1, 20, 0.18, 0.80).map((p) => ({ ...p, h: p.barrier }));

  // -- rivers --------------------------------------------------------------
  // Carved after the base field so they cut real valleys through it.
  const jr = () => rng.range(-0.012, 0.012);
  const rivers = [
    { // the Silverflood — the great river, and the first real bridging problem
      name: 'the Silverflood',
      w0: 0.9, w1: 3.4, depth: 7,
      pts: catmull([
        { x: 0.345 + jr(), y: 0.115 }, { x: 0.360 + jr(), y: 0.215 },
        { x: 0.325 + jr(), y: 0.330 }, { x: 0.345 + jr(), y: 0.440 },
        { x: 0.332 + jr(), y: 0.520 }, { x: 0.290 + jr(), y: 0.625 },
        { x: 0.235 + jr(), y: 0.720 }, { x: 0.170 + jr(), y: 0.800 },
        { x: 0.120, y: 0.865 },
      ], 14),
    },
    { // the Winterbourne — comes down out of the northern pass
      name: 'the Winterbourne',
      w0: 0.7, w1: 1.7, depth: 5,
      pts: catmull([
        { x: 0.600 + jr(), y: 0.395 }, { x: 0.540 + jr(), y: 0.430 },
        { x: 0.470 + jr(), y: 0.470 }, { x: 0.400 + jr(), y: 0.495 },
        { x: 0.336, y: 0.512 },
      ], 12),
    },
    { // the Mirefall — feeds the Weeping Marsh, which is why it is weeping
      name: 'the Mirefall',
      w0: 0.6, w1: 1.5, depth: 4,
      pts: catmull([
        { x: 0.620 + jr(), y: 0.700 }, { x: 0.585 + jr(), y: 0.750 },
        { x: 0.545 + jr(), y: 0.788 }, { x: 0.505, y: 0.805 },
      ], 12),
    },
  ];

  for (const r of rivers) {
    // Build a strictly descending surface profile from source to mouth. Doing
    // this by subtracting a fixed drop per sample overshoots badly once the
    // path is densely resampled, so interpolate between the source elevation
    // and a mouth elevation just above sea level and take the lower of that and
    // the terrain. Water then always runs downhill and never digs to the ocean.
    const nSeg = r.pts.length;
    const at = (s) => {
      const p = r.pts[s];
      return {
        cx: clamp(Math.round(p.x * (W - 1)), 0, W - 1),
        cy: clamp(Math.round(p.y * (H - 1)), 0, H - 1),
      };
    };
    const src = at(0), mouth = at(nSeg - 1);
    const hSrc = height[src.cy * W + src.cx];
    const hMouth = Math.max(0.8, Math.min(height[mouth.cy * W + mouth.cx], 2.5));

    const prof = [];
    let last = Infinity;
    for (let s = 0; s < nSeg; s++) {
      const t = s / (nSeg - 1);
      const c = at(s);
      // ease the descent so the river loses height fast near the mountains and
      // then loafs across the plain, which is what real rivers do
      const glide = lerp(hSrc, hMouth, Math.pow(t, 0.62));
      let h = Math.min(height[c.cy * W + c.cx], glide);
      h = Math.min(h, last - 0.01);
      h = Math.max(h, hMouth * 0.75);
      last = h;
      prof.push({ cx: c.cx, cy: c.cy, h, t });
    }

    // Valleys must be WIDE. A narrow trench leaves banks at slope ~1.0, which
    // is unbuildable — the surveyor could never reach the water to bridge it,
    // and the river would wall off half the map by accident.
    for (const seg of prof) {
      const w = lerp(r.w0, r.w1, seg.t);
      const bank = w + 14.0;
      const rad = Math.ceil(bank);
      // Cut a real channel: the renderer floats the water surface ~1.85 above
      // the bed, so the bed must sit well below the banks or the river spills
      // over them. A shallow scrape also renders as pale grey rather than water.
      const bed = Math.max(0.35, seg.h - r.depth * 0.62);
      for (let dy = -rad; dy <= rad; dy++) {
        for (let dx = -rad; dx <= rad; dx++) {
          const cx = seg.cx + dx, cy = seg.cy + dy;
          if (cx < 0 || cy < 0 || cx >= W || cy >= H) continue;
          const d = Math.hypot(dx, dy);
          if (d > bank) continue;
          const i = cy * W + cx;
          if (d <= w) {
            height[i] = Math.min(height[i], bed);
            water[i] = 1;
          } else {
            // concave profile: steep-ish at the water, easing out to the plain
            const t = smoothstep(bank, w, d);
            height[i] = Math.min(height[i], lerp(height[i], bed + r.depth * 0.62 + 1.9, t * t * 0.92));
          }
        }
      }
    }
  }

  // marsh pools: scattered standing water in the Weeping Marsh
  for (let i = 0; i < N; i++) {
    if (region[i] !== REGION.WEEPING) continue;
    const cx = i % W, cy = (i / W) | 0;
    const u = cx / (W - 1), v = cy / (H - 1);
    if (nm.fbm(u * 42, v * 42, 3) > 0.28) { water[i] = 1; height[i] = Math.min(height[i], 1.1); }
  }

  // ocean
  for (let i = 0; i < N; i++) if (height[i] < 0) water[i] = 3;

  // -- slope ---------------------------------------------------------------
  for (let cy = 0; cy < H; cy++) {
    for (let cx = 0; cx < W; cx++) {
      const i = cy * W + cx;
      const l = height[cy * W + Math.max(0, cx - 1)];
      const r = height[cy * W + Math.min(W - 1, cx + 1)];
      const u2 = height[Math.max(0, cy - 1) * W + cx];
      const d = height[Math.min(H - 1, cy + 1) * W + cx];
      slope[i] = Math.hypot((r - l) / (2 * CELL), (d - u2) / (2 * CELL));
    }
  }

  // -- biome + peril -------------------------------------------------------
  for (let i = 0; i < N; i++) {
    const h = height[i], s = slope[i], m = moist[i], reg = region[i];
    const cx = i % W, cy = (i / W) | 0;
    const u = cx / (W - 1), v = cy / (H - 1);
    let b;

    if (water[i] === 3) b = BIOME.OCEAN;
    else if (h < 2.2 && water[i] !== 1 && reg === REGION.QUAYS) b = BIOME.BEACH;
    else if (reg === REGION.ASHENREACH) {
      b = (h > 46 || n2.fbm(u * 30, v * 30, 3) > 0.42) ? BIOME.SLAG : BIOME.ASH;
    } else if (h > 82 || (h > 52 && v < 0.22)) b = BIOME.SNOW;
    else if (s > 0.66 || h > 56) b = BIOME.ROCK;
    else if (reg === REGION.WEEPING) b = BIOME.MARSH;
    else if (reg === REGION.MIRKHOLT || reg === REGION.WODENHOLT) b = BIOME.DARKWOOD;
    else if (reg === REGION.BARROWDOWNS) b = BIOME.MOOR;
    else if (reg === REGION.ELDERWOOD) b = BIOME.FOREST;
    else if (m > 0.62 && h < 52) b = BIOME.FOREST;
    // Farmland has to stay patchy. Assigning it to every gentle, moist cell
    // turns two whole regions into one flat tan sheet; interleaving it with
    // downs on a coarse noise gives the field-and-pasture look instead.
    else if (reg === REGION.GREENHOLLOW && s < 0.16 && m > 0.40
             && nm.fbm(u * 11, v * 11, 2) > -0.06) b = BIOME.FARM;
    else if (reg === REGION.MARCHLANDS && s < 0.13 && m > 0.52
             && nm.fbm(u * 9 + 4, v * 9, 2) > 0.10) b = BIOME.FARM;
    else if (h > 44) b = BIOME.MOOR;
    else b = BIOME.DOWNS;

    biome[i] = b;

    let p = REGION_PERIL[reg] ?? 0.15;
    if (b === BIOME.DARKWOOD) p += 0.14;
    if (b === BIOME.SLAG) p += 0.10;
    if (b === BIOME.SNOW) p += 0.08;
    if (s > 0.7) p += 0.07;
    peril[i] = clamp(p, 0, 1);
  }

  // -- the world object ----------------------------------------------------
  const world = {
    seed, W, H, CELL, worldW, worldH,
    height, water, biome, region, peril, moist, slope,
    passes, gates, rivers: rivers.map((r) => r.name),
    seaLevel: 0,

    idx: (cx, cy) => cy * W + cx,
    inb: (cx, cy) => cx >= 0 && cy >= 0 && cx < W && cy < H,
    toWorld: (cx, cy) => ({ x: (cx - (W - 1) / 2) * CELL, z: (cy - (H - 1) / 2) * CELL }),
    toCell: (x, z) => ({
      cx: clamp(Math.round(x / CELL + (W - 1) / 2), 0, W - 1),
      cy: clamp(Math.round(z / CELL + (H - 1) / 2), 0, H - 1),
    }),
    toCellF: (x, z) => ({ fx: x / CELL + (W - 1) / 2, fy: z / CELL + (H - 1) / 2 }),
  };

  const sampleBilinear = (arr, x, z) => {
    const fx = clamp(x / CELL + (W - 1) / 2, 0, W - 1.001);
    const fy = clamp(z / CELL + (H - 1) / 2, 0, H - 1.001);
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const a = arr[y0 * W + x0], b = arr[y0 * W + x0 + 1];
    const c = arr[(y0 + 1) * W + x0], d = arr[(y0 + 1) * W + x0 + 1];
    return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
  };
  const nearest = (arr, x, z) => {
    const { cx, cy } = world.toCell(x, z);
    return arr[cy * W + cx];
  };

  world.heightAt = (x, z) => sampleBilinear(height, x, z);
  world.slopeAt = (x, z) => sampleBilinear(slope, x, z);
  world.moistAt = (x, z) => sampleBilinear(moist, x, z);
  world.perilAt = (x, z) => sampleBilinear(peril, x, z);
  world.biomeAt = (x, z) => nearest(biome, x, z);
  world.waterAt = (x, z) => nearest(water, x, z);
  world.regionAt = (x, z) => nearest(region, x, z);
  world.regionName = (r) => REGION_NAME[r] ?? 'the wilds';

  // -- settlement sites ----------------------------------------------------
  world.sites = placeSites(world, rng);

  return world;
}

// ---------------------------------------------------------------------------
// Settlement placement
// ---------------------------------------------------------------------------

/**
 * Which kinds of place will plausibly spring up in each land once a railway runs
 * near it. This is the table that makes the map grow.
 */
export const FOUNDABLE = {
  0: ['shire', 'shire', 'burg'],          // GREENHOLLOW
  1: ['delve', 'watch'],                  // FROSTMARCH
  2: ['watch'],                           // MIRKHOLT
  3: ['delve', 'delve', 'watch'],         // PEAKS
  4: ['watch'],                           // WEEPING
  5: ['hold', 'hold', 'watch'],           // ASHENREACH
  6: ['burg', 'burg', 'shire'],           // MARCHLANDS
  7: ['haven'],                           // ELDERWOOD
  8: ['haven', 'burg'],                   // QUAYS
  9: ['burg', 'watch'],                   // BARROWDOWNS
  10: [],                                 // WODENHOLT — nothing is built here
};

/** Where each kind is willing to live. */
export const KIND_RULES = {
  shire: { regions: [REGION.GREENHOLLOW, REGION.MARCHLANDS], maxSlope: 0.20, biomes: [BIOME.DOWNS, BIOME.FARM], count: [7, 9] },
  delve: { regions: [REGION.PEAKS, REGION.FROSTMARCH], maxSlope: 1.1, biomes: [BIOME.ROCK, BIOME.SNOW, BIOME.MOOR], count: [4, 5], wantSlope: 0.35 },
  haven: { regions: [REGION.ELDERWOOD, REGION.QUAYS, REGION.MIRKHOLT], maxSlope: 0.34, biomes: [BIOME.FOREST, BIOME.DARKWOOD, BIOME.DOWNS, BIOME.BEACH], count: [3, 4] },
  burg:  { regions: [REGION.MARCHLANDS, REGION.GREENHOLLOW, REGION.BARROWDOWNS], maxSlope: 0.22, biomes: [BIOME.DOWNS, BIOME.FARM, BIOME.MOOR], count: [6, 8] },
  watch: { regions: [REGION.BARROWDOWNS, REGION.PEAKS, REGION.MARCHLANDS, REGION.FROSTMARCH, REGION.WEEPING], maxSlope: 0.9, biomes: [BIOME.MOOR, BIOME.ROCK, BIOME.DOWNS, BIOME.SNOW, BIOME.MARSH], count: [4, 5], wantSlope: 0.3 },
  hold:  { regions: [REGION.ASHENREACH], maxSlope: 0.55, biomes: [BIOME.ASH, BIOME.SLAG], count: [5, 6] },
};

function placeSites(world, rng) {
  const { W, H } = world;
  const sites = [];
  let nextId = 1;
  const MIN_SEP = 46;          // world units between settlements
  const used = { shire: new Set(), delve: new Set(), haven: new Set(), burg: new Set(), watch: new Set(), hold: new Set() };

  const takeName = (kind) => {
    const pool = NAMES[kind];
    for (let tries = 0; tries < 200; tries++) {
      const i = rng.int(0, pool.length - 1);
      if (!used[kind].has(i)) { used[kind].add(i); return pool[i]; }
    }
    return pool[0] + ' the Lesser';
  };

  const farEnough = (x, z, sep = MIN_SEP) =>
    sites.every((s) => Math.hypot(s.x - x, s.z - z) >= sep);

  const push = (cx, cy, kind, name, tier, anchor) => {
    const { x, z } = world.toWorld(cx, cy);
    const s = {
      id: nextId++, name, kind, culture: CULTURE_OF_KIND[kind],
      cx, cy, x, z, y: world.height[cy * W + cx],
      region: world.region[cy * W + cx], tier: tier ?? 0,
    };
    if (anchor) s.anchor = anchor;

    // one or two traits, drawn from those that suit this kind and this land
    let nearWater = false;
    for (let dy = -6; dy <= 6 && !nearWater; dy++) {
      for (let dx = -6; dx <= 6; dx++) {
        if (!world.inb(cx + dx, cy + dy)) continue;
        if (world.water[(cy + dy) * W + (cx + dx)]) { nearWater = true; break; }
      }
    }
    const eligible = TRAIT_KEYS.filter((k) => {
      const t = TRAITS[k];
      if (t.kinds && !t.kinds.includes(kind)) return false;
      if (t.regions && !t.regions.includes(s.region)) return false;
      if (t.nearWater && !nearWater) return false;
      return true;
    });
    s.traits = [];
    const nTraits = rng.chance(0.42) ? 2 : 1;
    for (let i = 0; i < nTraits && eligible.length; i++) {
      const pick = eligible.splice(rng.int(0, eligible.length - 1), 1)[0];
      s.traits.push(pick);
    }
    // Mount Wrack is not a town with features. It is the thing at the end.
    if (anchor === 'wrack') s.traits = ['smoke_works', 'ill_omened'];

    sites.push(s);
    return s;
  };

  // Anchors first — nudged to the best nearby buildable cell so they never end
  // up in a river or on a cliff. The search radius has to be generous: the Grey
  // Quays are aimed at an estuary, and every cell for some way around the aiming
  // point is under water.
  const isCoastal = (tx, ty) => {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      if (world.inb(tx + dx, ty + dy) && world.water[(ty + dy) * W + (tx + dx)] === 3) return true;
    }
    return false;
  };

  for (const a of ANCHORS) {
    const cx = Math.round(a.u * (W - 1));
    const cy = Math.round(a.v * (H - 1));
    const R = a.anchor === 'quays' ? 18 : 9;
    let best = null, bestScore = -Infinity;
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const tx = cx + dx, ty = cy + dy;
        if (!world.inb(tx, ty)) continue;
        const i = ty * W + tx;
        if (world.water[i] || world.height[i] < 2 || world.height[i] > 70) continue;
        let sc = -world.slope[i] * 5 - Math.hypot(dx, dy) * 0.10;
        if (a.kind === 'delve') sc += world.slope[i] * 9;      // delves want a cliff
        if (a.anchor === 'quays') {
          // a haven you can sail from: low, flat, and on salt water
          sc += isCoastal(tx, ty) ? 26 : -22;
          sc -= Math.abs(world.height[i] - 5) * 0.9;
        }
        if (sc > bestScore) { bestScore = sc; best = { tx, ty }; }
      }
    }
    if (best) push(best.tx, best.ty, a.kind, a.name, a.tier, a.anchor);
  }

  // Then fill by kind, sampling candidate cells and scoring them.
  for (const kind of ['delve', 'shire', 'burg', 'haven', 'hold', 'watch']) {
    const rule = KIND_RULES[kind];
    const want = rng.int(rule.count[0], rule.count[1]);
    let placed = 0, guard = 0;
    while (placed < want && guard++ < 4000) {
      const cx = rng.int(18, W - 19), cy = rng.int(18, H - 19);
      const i = cy * W + cx;
      if (world.water[i]) continue;
      if (world.height[i] < 2.5) continue;
      // nobody lives on the impassable rim that frames the map
      if (world.height[i] > 66) continue;
      if (!rule.regions.includes(world.region[i])) continue;
      if (!rule.biomes.includes(world.biome[i])) continue;
      if (world.slope[i] > rule.maxSlope) continue;
      if (rule.wantSlope && world.slope[i] < rule.wantSlope * 0.5) continue;
      const { x, z } = world.toWorld(cx, cy);
      if (!farEnough(x, z)) continue;
      // Prefer near-ish to fresh water for everyone except orcs
      if (kind !== 'hold' && kind !== 'delve' && rng.chance(0.45)) {
        let nearWater = false;
        for (let dy = -5; dy <= 5 && !nearWater; dy++)
          for (let dx = -5; dx <= 5; dx++) {
            const j = (cy + dy) * W + (cx + dx);
            if (world.inb(cx + dx, cy + dy) && world.water[j] === 1) { nearWater = true; break; }
          }
        if (!nearWater) continue;
      }
      const tier = kind === 'watch' ? 0
        : rng.chance(0.16) ? 2 : rng.chance(0.48) ? 1 : 0;
      push(cx, cy, kind, takeName(kind), tier);
      placed++;
    }
  }

  // A delve at each pass — the Dwarves got there first, obviously.
  for (const p of world.passes) {
    const { x, z } = world.toWorld(p.cx, p.cy);
    if (farEnough(x, z, 40)) {
      let best = null, bestS = -Infinity;
      for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
        const tx = p.cx + dx, ty = p.cy + dy;
        if (!world.inb(tx, ty)) continue;
        const i = ty * W + tx;
        if (world.water[i]) continue;
        const s = world.slope[i] * 4 - Math.hypot(dx, dy) * 0.2;
        if (s > bestS) { bestS = s; best = { tx, ty }; }
      }
      if (best) push(best.tx, best.ty, 'delve', takeName('delve'), 0);
    }
  }

  return sites;
}

/** Compact debug view — used by the node-side map test. */
export function asciiMap(world, cols = 112, rows = 46) {
  const glyph = {
    [BIOME.OCEAN]: '~', [BIOME.BEACH]: '.', [BIOME.DOWNS]: '"', [BIOME.FARM]: ',',
    [BIOME.FOREST]: 'f', [BIOME.DARKWOOD]: 'F', [BIOME.MARSH]: 'm', [BIOME.MOOR]: ':',
    [BIOME.ROCK]: '^', [BIOME.SNOW]: 'A', [BIOME.ASH]: 'x', [BIOME.SLAG]: 'X',
  };
  const grid = [];
  for (let r = 0; r < rows; r++) {
    let line = '';
    for (let c = 0; c < cols; c++) {
      const cx = Math.round((c / (cols - 1)) * (world.W - 1));
      const cy = Math.round((r / (rows - 1)) * (world.H - 1));
      const i = cy * world.W + cx;
      line += world.water[i] === 1 ? '=' : (glyph[world.biome[i]] ?? '?');
    }
    grid.push(line.split(''));
  }
  const mark = { shire: 'h', delve: 'D', haven: 'E', burg: 'B', watch: 't', hold: 'O' };
  for (const s of world.sites) {
    const c = Math.round((s.cx / (world.W - 1)) * (cols - 1));
    const r = Math.round((s.cy / (world.H - 1)) * (rows - 1));
    if (grid[r]) grid[r][c] = mark[s.kind];
  }
  return grid.map((r) => r.join('')).join('\n');
}
