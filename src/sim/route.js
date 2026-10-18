// Surveying. Given two settlements and the charters you hold, find the line the
// Authority would actually build, and price it.
//
// The approach is two-phase, which matters:
//
//   1. A* in plan view over the terrain grid, with an edge cost that punishes
//      height change. This makes routes follow contours and find passes on
//      their own, which is why the finished network looks like a railway
//      instead of a spiderweb.
//   2. Fit a *deck* profile along the chosen corridor by diffusion, then clamp
//      it to a maximum grade. Wherever the deck ends up above the ground you
//      get a viaduct; wherever it ends up below, a tunnel. The works are not
//      chosen by the router — they fall out of the geometry, which is how you
//      get a tunnel exactly where a tunnel belongs.

import { BIOME, REGION, REGION_PERIL } from '../world/worldgen.js';
import { clamp, lerp } from '../rng.js';

export const WORKS = {
  GRADE: 'grade',
  BRIDGE: 'bridge',
  SPAN: 'span',
  CAUSEWAY: 'causeway',
  TUNNEL: 'tunnel',
  VIADUCT: 'viaduct',
};

/** Human names, for the survey panel and the reports. */
export const WORKS_NAME = {
  grade: '평지 선로', bridge: '교량', span: '대교',
  causeway: '둑길', tunnel: '터널', viaduct: '고가교',
};

export const MAX_GRADE = 0.085;      // 8.5%; generous for rail, tight for a mountain
const DECK_TOL = 2.6;                // deck within this of ground counts as at-grade
const SPAN_THRESHOLD = 46;           // a water crossing longer than this is a great span

/** Cost in crowns per world unit of line, by works type. */
export const COST = {
  grade: 1.0,
  bridge: 4.2,
  span: 7.6,
  causeway: 3.1,
  tunnel: 8.8,
  viaduct: 3.4,
  portal: 52,      // each end of each tunnel
  pier: 7,         // each viaduct pier
  earthworks: 0.16, // per unit per unit of cut/fill depth
};

/** Weekly upkeep per world unit. Tunnels are what bankrupt transit authorities. */
export const UPKEEP = {
  grade: 0.010, bridge: 0.055, span: 0.085, causeway: 0.048,
  tunnel: 0.105, viaduct: 0.040,
};

/** Extra peril contributed by the works themselves, on top of the region's. */
const WORKS_PERIL = {
  grade: 0, bridge: 0.04, span: 0.07, causeway: 0.05, tunnel: 0.20, viaduct: 0.09,
};

// ---------------------------------------------------------------------------
// A binary heap, because a linear scan over an open set of 50 000 cells is the
// difference between a route appearing instantly and the game hitching.
// ---------------------------------------------------------------------------

class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(node, pri) {
    const a = this.a;
    a.push({ node, pri });
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].pri <= a[i].pri) break;
      const t = a[p]; a[p] = a[i]; a[i] = t;
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l].pri < a[m].pri) m = l;
        if (r < a.length && a[r].pri < a[m].pri) m = r;
        if (m === i) break;
        const t = a[m]; a[m] = a[i]; a[i] = t;
        i = m;
      }
    }
    return top;
  }
}

const NEIGH = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

/**
 * Plan-view A*.
 * @param can capabilities: { bridge, span, causeway, tunnel }
 * @param opts.avoidWood  penalty multiplier for felling trees (Elvish pressure)
 * @param opts.riskAversion  0..2, how hard to steer around perilous ground
 * @param opts.existing  Set of "cx,cy" cells already carrying track — reusing an
 *        alignment is cheap, which encourages trunk routes to share corridors
 */
function survey(world, a, b, can, opts = {}) {
  const { W, H, CELL, height, water, biome, slope, region } = world;
  const N = W * H;
  const start = a.cy * W + a.cx;
  const goal = b.cy * W + b.cx;
  if (start === goal) return null;

  const avoidWood = opts.avoidWood ?? 0;
  const risk = opts.riskAversion ?? 0.7;
  const existing = opts.existing;

  // reference elevation: the straight-line profile between the two ends. Used
  // only to discourage wandering up a mountain that is not on the way.
  const hA = height[start], hB = height[goal];
  const ax = a.cx, ay = a.cy, bx = b.cx, by = b.cy;
  const totalD = Math.hypot(bx - ax, by - ay) || 1;
  const refAt = (cx, cy) => {
    const t = clamp(((cx - ax) * (bx - ax) + (cy - ay) * (by - ay)) / (totalD * totalD), 0, 1);
    return lerp(hA, hB, t);
  };

  // Without a tunnelling charter the line cannot get over sustained high
  // ground. Note this is a *height* ceiling, not a per-cell gradient test: a
  // gradient test at 4-unit cell resolution rejects any 34-centimetre bump and
  // makes most of a rolling landscape impassable, which is nonsense — real
  // alignments are graded, and the deck fit below is what actually enforces the
  // ruling gradient.
  const climbBase = Math.max(hA, hB, 24);
  const climbCeiling = can.tunnel ? Infinity : climbBase + 28;
  // Height above this is what a bore would have to get through, and is the
  // signal that steers A* towards a pass when one exists.
  const boreDatum = Math.min(hA, hB) + 18;

  const g = new Float64Array(N).fill(Infinity);
  const from = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const open = new Heap();
  g[start] = 0;
  open.push(start, 0);

  const hEuclid = (i) => {
    const cx = i % W, cy = (i / W) | 0;
    return Math.hypot(cx - bx, cy - by) * CELL * 0.92;
  };

  let expanded = 0;
  while (open.size) {
    const { node: cur } = open.pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    if (cur === goal) break;
    if (++expanded > 260000) break;   // safety valve; the grid is 53k cells

    const cx = cur % W, cy = (cur / W) | 0;
    const hc = height[cur];

    for (const [dx, dy, dl] of NEIGH) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = ny * W + nx;
      if (closed[ni]) continue;

      const len = dl * CELL;
      const hn = height[ni];
      const w = water[ni];
      const bio = biome[ni];

      // --- hard gates
      if (w === 3 && !can.span) continue;             // open sea needs a great span
      if (w === 1 && !can.bridge) continue;           // rivers need bridges
      if (bio === BIOME.MARSH && !can.causeway) continue;
      if (hn > 92) continue;                           // the framing rim
      if (hn > climbCeiling) continue;                 // no charter, no mountain

      const dh = Math.abs(hn - hc);

      // --- cost
      let c = len * 1.0;
      c += slope[ni] * len * 0.55;                     // sidelong cutting
      c += dh * 1.15;                                  // strongly prefer contours

      // Everything above the bore datum will come out of the deck fit as
      // tunnel, so price it like tunnel here. This is what makes A* take the
      // long way round to a pass rather than boring through the crest — and
      // what makes boring through the crest a real, purchasable alternative.
      c += Math.max(0, hn - boreDatum) * len * 0.22;

      if (w === 1) c += len * (COST.bridge - 1);
      else if (w === 3) c += len * (COST.span - 1);
      else if (bio === BIOME.MARSH) c += len * (COST.causeway - 1);

      // stay near the line's own elevation band rather than sightseeing
      c += Math.max(0, hn - refAt(nx, ny) - 8) * len * 0.045;

      // peril, weighted by how careful the player has asked us to be
      c += (REGION_PERIL[region[ni]] ?? 0.1) * len * 5.5 * risk;

      // trees. The Elves keep a list.
      if (avoidWood > 0 && (bio === BIOME.FOREST || bio === BIOME.DARKWOOD)) {
        c += len * avoidWood;
      }
      // Wodenholt is not negotiable
      if (region[ni] === REGION.WODENHOLT) c += len * 26;

      // reusing an existing alignment is much cheaper than a new one
      if (existing && existing.has(ni)) c *= 0.42;

      const ng = g[cur] + c;
      if (ng < g[ni]) {
        g[ni] = ng;
        from[ni] = cur;
        open.push(ni, ng + hEuclid(ni));
      }
    }
  }

  if (from[goal] === -1 && start !== goal) return null;

  const cells = [];
  for (let i = goal; i !== -1; i = from[i]) cells.push(i);
  cells.reverse();
  if (cells[0] !== start) return null;
  return cells;
}

// ---------------------------------------------------------------------------
// Corridor -> geometry
// ---------------------------------------------------------------------------

/** Douglas–Peucker on the plan-view corridor, so the spline has few control points. */
function simplify(pts, tol) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [i0, i1] = stack.pop();
    let worst = -1, wd = tol;
    const ax = pts[i0].x, ay = pts[i0].z, bx = pts[i1].x, by = pts[i1].z;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    for (let i = i0 + 1; i < i1; i++) {
      const t = clamp(((pts[i].x - ax) * dx + (pts[i].z - ay) * dy) / len2, 0, 1);
      const d = Math.hypot(pts[i].x - (ax + t * dx), pts[i].z - (ay + t * dy));
      if (d > wd) { wd = d; worst = i; }
    }
    if (worst >= 0) {
      keep[worst] = 1;
      stack.push([i0, worst], [worst, i1]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Uniform-arclength resample of a Catmull-Rom through the control points. */
function resample(ctrl, step) {
  if (ctrl.length < 2) return ctrl.slice();
  const dense = [];
  const at = (i) => ctrl[clamp(i, 0, ctrl.length - 1)];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const seg = Math.max(2, Math.ceil(Math.hypot(p2.x - p1.x, p2.z - p1.z) / (step * 0.5)));
    for (let s = 0; s < seg; s++) {
      const t = s / seg, t2 = t * t, t3 = t2 * t;
      const q = (A, B, C, D) => 0.5 * (2 * B + (-A + C) * t + (2 * A - 5 * B + 4 * C - D) * t2 + (-A + 3 * B - 3 * C + D) * t3);
      dense.push({ x: q(p0.x, p1.x, p2.x, p3.x), z: q(p0.z, p1.z, p2.z, p3.z) });
    }
  }
  dense.push({ x: ctrl[ctrl.length - 1].x, z: ctrl[ctrl.length - 1].z });

  // walk it at constant spacing
  const out = [dense[0]];
  let carry = 0;
  for (let i = 1; i < dense.length; i++) {
    let ax = dense[i - 1].x, az = dense[i - 1].z;
    const bxx = dense[i].x, bzz = dense[i].z;
    let d = Math.hypot(bxx - ax, bzz - az);
    while (carry + d >= step) {
      const need = step - carry;
      const t = need / d;
      ax = ax + (bxx - ax) * t;
      az = az + (bzz - az) * t;
      out.push({ x: ax, z: az });
      d = Math.hypot(bxx - ax, bzz - az);
      carry = 0;
    }
    carry += d;
  }
  const last = dense[dense.length - 1];
  const tail = out[out.length - 1];
  if (Math.hypot(tail.x - last.x, tail.z - last.z) > step * 0.3) {
    out.push({ x: last.x, z: last.z });
  } else {
    out[out.length - 1] = { x: last.x, z: last.z };
  }
  return out;
}

/**
 * Fit the deck. Diffuse the ground profile to smooth out ridges and hollows,
 * pin the ends to the station platforms, then clamp to the maximum grade.
 */
function fitDeck(ground, endA, endB, step) {
  const n = ground.length;
  const deck = ground.slice();
  deck[0] = endA; deck[n - 1] = endB;

  // Diffusion. More passes = a flatter, more expensive, more railway-looking
  // alignment. This number is the single biggest lever on how the network reads.
  // It must scale with the length of the link: running 24 passes over a
  // twelve-sample profile flattens it completely, which turns every gentle
  // hillock on a short branch line into a preposterous little tunnel.
  const passes = clamp(Math.round(n * 0.6), 4, 220);
  for (let p = 0; p < passes; p++) {
    let prev = deck[0];
    for (let i = 1; i < n - 1; i++) {
      const cur = deck[i];
      deck[i] = cur * 0.42 + (prev + deck[i + 1]) * 0.29;
      prev = cur;
    }
    deck[0] = endA; deck[n - 1] = endB;
  }

  // Grade clamp, forward then backward, so no span exceeds the ruling gradient.
  const maxStep = MAX_GRADE * step;
  for (let i = 1; i < n; i++) deck[i] = clamp(deck[i], deck[i - 1] - maxStep, deck[i - 1] + maxStep);
  for (let i = n - 2; i >= 0; i--) deck[i] = clamp(deck[i], deck[i + 1] - maxStep, deck[i + 1] + maxStep);
  // the clamp may have walked the ends off their platforms; nudge back
  deck[0] = endA; deck[n - 1] = endB;
  for (let i = 1; i < n; i++) deck[i] = clamp(deck[i], deck[i - 1] - maxStep, deck[i - 1] + maxStep);

  return deck;
}

/**
 * Classify each sample and total up the bill.
 * Returns { spans, cost, upkeep, peril, length, tunnels, piers }
 */
function classify(world, pts, deck, step) {
  const n = pts.length;
  const kinds = new Array(n);
  for (let i = 0; i < n; i++) {
    const gh = world.heightAt(pts[i].x, pts[i].z);
    const w = world.waterAt(pts[i].x, pts[i].z);
    const bio = world.biomeAt(pts[i].x, pts[i].z);
    const d = deck[i] - gh;
    if (d < -DECK_TOL) kinds[i] = WORKS.TUNNEL;
    else if (w === 3) kinds[i] = WORKS.SPAN;
    else if (w === 1) kinds[i] = WORKS.BRIDGE;
    else if (bio === BIOME.MARSH) kinds[i] = WORKS.CAUSEWAY;
    else if (d > DECK_TOL) kinds[i] = WORKS.VIADUCT;
    else kinds[i] = WORKS.GRADE;
  }

  // Smooth out single-sample flickers, which otherwise produce a comic strip of
  // eleven separate two-metre tunnels.
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < n - 1; i++) {
      if (kinds[i] !== kinds[i - 1] && kinds[i - 1] === kinds[i + 1]) kinds[i] = kinds[i - 1];
    }
  }

  // Nobody bores a twenty-metre tunnel or throws up a viaduct for one pier.
  // Below these lengths it is a cutting or an embankment: plain track, and the
  // earthworks charge below covers it.
  const MIN_TUNNEL = 34, MIN_VIADUCT = 16;
  let k0 = 0;
  while (k0 < n) {
    let k1 = k0;
    while (k1 < n && kinds[k1] === kinds[k0]) k1++;
    const runLen = (k1 - k0 + 1) * step;
    if ((kinds[k0] === WORKS.TUNNEL && runLen < MIN_TUNNEL) ||
        (kinds[k0] === WORKS.VIADUCT && runLen < MIN_VIADUCT)) {
      for (let k = k0; k < k1; k++) kinds[k] = WORKS.GRADE;
    }
    k0 = k1;
  }

  // Promote long water crossings to great spans.
  let i = 0;
  while (i < n) {
    if (kinds[i] === WORKS.BRIDGE) {
      let j = i;
      while (j < n && kinds[j] === WORKS.BRIDGE) j++;
      if ((j - i) * step > SPAN_THRESHOLD) for (let k = i; k < j; k++) kinds[k] = WORKS.SPAN;
      i = j;
    } else i++;
  }

  // Measure from the actual geometry. Deriving span lengths from sample index
  // arithmetic drops one step at every works boundary, which is how a route can
  // end up reported as shorter than the straight line between its own ends.
  const segLen = new Float64Array(Math.max(0, n - 1));
  for (let k = 0; k < n - 1; k++) {
    segLen[k] = Math.hypot(pts[k + 1].x - pts[k].x, pts[k + 1].z - pts[k].z, deck[k + 1] - deck[k]);
  }
  /** A segment belongs to the works of the sample it leaves. */
  const segKind = (k) => (kinds[k] === kinds[k + 1] ? kinds[k]
    : (COST[kinds[k]] >= COST[kinds[k + 1]] ? kinds[k] : kinds[k + 1]));

  const spans = [];
  i = 0;
  while (i < n) {
    let j = i;
    while (j < n && kinds[j] === kinds[i]) j++;
    let L = 0;
    for (let k = i; k < Math.min(j, n - 1); k++) L += segLen[k];
    spans.push({ kind: kinds[i], i0: i, i1: j - 1, length: L });
    i = j;
  }

  let cost = 0, upkeep = 0, perilSum = 0, length = 0, tunnels = 0, piers = 0;
  for (let k = 0; k < n - 1; k++) {
    const L = segLen[k];
    const kind = segKind(k);
    length += L;
    cost += COST[kind] * L;
    upkeep += UPKEEP[kind] * L;

    // Cut and fill. Charged on ground-borne works at any depth — a deep cutting
    // is cheaper than a tunnel but it is emphatically not free.
    if (kind === WORKS.GRADE || kind === WORKS.CAUSEWAY) {
      const d = Math.abs(deck[k] - world.heightAt(pts[k].x, pts[k].z));
      cost += COST.earthworks * L * d;
    }

    const rp = REGION_PERIL[world.regionAt(pts[k].x, pts[k].z)] ?? 0.1;
    perilSum += (rp + WORKS_PERIL[kind]) * L;
  }

  for (const s of spans) {
    if (s.kind === WORKS.TUNNEL) { cost += COST.portal * 2; tunnels++; }
    if (s.kind === WORKS.VIADUCT || s.kind === WORKS.SPAN || s.kind === WORKS.BRIDGE) {
      const p = Math.max(1, Math.round(s.length / 22));
      piers += p;
      cost += COST.pier * p;
    }
  }

  return {
    spans, kinds,
    cost: Math.round(cost),
    upkeep: Math.round(upkeep * 100) / 100,
    peril: length > 0 ? perilSum / length : 0,
    length, tunnels, piers,
  };
}

/**
 * The public entry point. Survey a link between two sites.
 * Returns null if no legal route exists with the charters held.
 */
export function surveyLink(world, siteA, siteB, can, opts = {}) {
  const cells = survey(world, siteA, siteB, can, opts);
  if (!cells || cells.length < 2) {
    return { ok: false, reason: whyNot(world, siteA, siteB, can) };
  }

  const { W, CELL } = world;
  const raw = cells.map((i) => {
    const cx = i % W, cy = (i / W) | 0;
    const { x, z } = world.toWorld(cx, cy);
    return { x, z, cx, cy };
  });

  const ctrl = simplify(raw, CELL * 1.25);
  const STEP = 6;
  const pts = resample(ctrl, STEP);
  if (pts.length < 2) return { ok: false, reason: '측량 결과가 백지로 돌아왔다.' };

  // pin the ends exactly on the settlements
  pts[0] = { x: siteA.x, z: siteA.z };
  pts[pts.length - 1] = { x: siteB.x, z: siteB.z };

  const ground = pts.map((p) => world.heightAt(p.x, p.z));
  const platA = world.heightAt(siteA.x, siteA.z);
  const platB = world.heightAt(siteB.x, siteB.z);
  const deck = fitDeck(ground, platA, platB, STEP);
  const info = classify(world, pts, deck, STEP);

  // charter check on the classified result, which catches cases the plan-view
  // gates cannot see (a long bridge that turned out to need a great span)
  const need = new Set(info.spans.map((s) => s.kind));
  if (need.has(WORKS.TUNNEL) && !can.tunnel) return { ok: false, reason: '굴착단 칙허가 필요하다' };
  if (need.has(WORKS.SPAN) && !can.span) return { ok: false, reason: '대교 칙허가 필요하다' };
  if (need.has(WORKS.BRIDGE) && !can.bridge) return { ok: false, reason: '교량공단 칙허가 필요하다' };
  if (need.has(WORKS.CAUSEWAY) && !can.causeway) return { ok: false, reason: '늪지 둑길 칙허가 필요하다' };

  return {
    ok: true,
    a: siteA.id, b: siteB.id,
    pts, deck, ground, step: STEP,
    cells,
    ...info,
  };
}

/**
 * A useful sentence for the player when nothing can be built. Sample the
 * straight line between the two places and report the first thing genuinely in
 * the way, rather than guessing from the charter list.
 */
function whyNot(world, a, b, can) {
  const steps = 48;
  let sawWater = false, sawSea = false, sawMarsh = false, maxH = -Infinity, sawWoden = false;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const x = lerp(a.x, b.x, t), z = lerp(a.z, b.z, t);
    const w = world.waterAt(x, z);
    if (w === 1) sawWater = true;
    if (w === 3) sawSea = true;
    if (world.biomeAt(x, z) === BIOME.MARSH) sawMarsh = true;
    if (world.regionAt(x, z) === REGION.WODENHOLT) sawWoden = true;
    maxH = Math.max(maxH, world.heightAt(x, z));
  }
  const climbBase = Math.max(world.heightAt(a.x, a.z), world.heightAt(b.x, b.z), 24);
  if (!can.tunnel && maxH > climbBase + 28) return '고지대가 길을 막는다. 굴착단은 아직 칙허를 받지 못했다';
  if (sawSea && !can.span) return '개방 수면이다. 대교 칙허가 없다';
  if (sawWater && !can.bridge) return '강이 길을 막는다. 교량공단은 아직 칙허를 받지 못했다';
  if (sawMarsh && !can.causeway) return '둑길 칙허 없이는 늪이 선로를 견디지 못한다';
  if (sawWoden) return '노선이 워든홀트를 지나는데, 나무들에게도 의견이 있다';
  return '측량사들이 서명할 만한 경로가 없다';
}

/** Sample the finished alignment for the renderer: world-space points on the deck. */
export function deckPoints(link) {
  return link.pts.map((p, i) => ({ x: p.x, y: link.deck[i], z: p.z }));
}
