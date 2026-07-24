// Seeded randomness and noise. Everything in worldgen goes through here so a
// seed reproduces a map exactly.

export function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, good enough for a map. */
export function makeRng(seed) {
  let a = (typeof seed === 'string' ? hashStr(seed) : seed | 0) >>> 0;
  const rng = function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.range = (lo, hi) => lo + rng() * (hi - lo);
  rng.int = (lo, hi) => Math.floor(lo + rng() * (hi - lo + 1));
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
  rng.chance = (p) => rng() < p;
  rng.shuffled = (arr) => {
    const a2 = arr.slice();
    for (let i = a2.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a2[i], a2[j]] = [a2[j], a2[i]];
    }
    return a2;
  };
  /** Gaussian-ish, mean 0 stdev ~1 */
  rng.gauss = () => (rng() + rng() + rng() + rng() - 2) * 1.1;
  return rng;
}

// ---------------------------------------------------------------------------
// Simplex noise (2D), seeded permutation.
// ---------------------------------------------------------------------------

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const GRAD = [
  1, 1, -1, 1, 1, -1, -1, -1,
  1, 0, -1, 0, 1, 0, -1, 0,
  0, 1, 0, -1, 0, 1, 0, -1,
];

export function makeNoise(seed) {
  const rng = makeRng(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  const perm = new Uint8Array(512);
  const permMod12 = new Uint8Array(512);
  for (let i = 0; i < 512; i++) {
    perm[i] = p[i & 255];
    permMod12[i] = perm[i] % 12;
  }

  function noise2(xin, yin) {
    let n0 = 0, n1 = 0, n2 = 0;
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const X0 = i - t, Y0 = j - t;
    const x0 = xin - X0, y0 = yin - Y0;
    let i1, j1;
    if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;

    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) {
      const gi0 = permMod12[ii + perm[jj]] * 2;
      t0 *= t0;
      n0 = t0 * t0 * (GRAD[gi0] * x0 + GRAD[gi0 + 1] * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) {
      const gi1 = permMod12[ii + i1 + perm[jj + j1]] * 2;
      t1 *= t1;
      n1 = t1 * t1 * (GRAD[gi1] * x1 + GRAD[gi1 + 1] * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) {
      const gi2 = permMod12[ii + 1 + perm[jj + 1]] * 2;
      t2 *= t2;
      n2 = t2 * t2 * (GRAD[gi2] * x2 + GRAD[gi2 + 1] * y2);
    }
    return 70 * (n0 + n1 + n2);
  }

  /** Fractal sum. Returns roughly -1..1. */
  function fbm(x, y, octaves = 4, lac = 2.0, gain = 0.5) {
    let sum = 0, amp = 1, freq = 1, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * noise2(x * freq, y * freq);
      norm += amp;
      amp *= gain;
      freq *= lac;
    }
    return sum / norm;
  }

  /** Ridged multifractal — for mountain spines. 0..1 */
  function ridge(x, y, octaves = 4, lac = 2.0, gain = 0.5) {
    let sum = 0, amp = 1, freq = 1, norm = 0;
    for (let o = 0; o < octaves; o++) {
      const n = 1 - Math.abs(noise2(x * freq, y * freq));
      sum += amp * n * n;
      norm += amp;
      amp *= gain;
      freq *= lac;
    }
    return sum / norm;
  }

  return { noise2, fbm, ridge };
}

// ---------------------------------------------------------------------------
// Small math helpers used all over.
// ---------------------------------------------------------------------------

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));

/** Distance from point p to segment ab, plus the parametric position. */
export function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = clamp(t, 0, 1);
  const cx = ax + t * dx, cy = ay + t * dy;
  return { d: Math.hypot(px - cx, py - cy), t };
}

/** Catmull-Rom through pts (array of {x,y} or {x,y,z}), sampled n per span. */
export function catmull(pts, samplesPerSpan = 6, closed = false) {
  const out = [];
  const n = pts.length;
  if (n < 2) return pts.slice();
  const at = (i) => {
    if (closed) return pts[((i % n) + n) % n];
    return pts[clamp(i, 0, n - 1)];
  };
  const spans = closed ? n : n - 1;
  for (let i = 0; i < spans; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    for (let s = 0; s < samplesPerSpan; s++) {
      const t = s / samplesPerSpan;
      const t2 = t * t, t3 = t2 * t;
      const q = (a, b, c, d) =>
        0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      const p = { x: q(p0.x, p1.x, p2.x, p3.x), y: q(p0.y, p1.y, p2.y, p3.y) };
      if (p1.z !== undefined) p.z = q(p0.z ?? 0, p1.z, p2.z ?? p1.z, p3.z ?? p1.z);
      out.push(p);
    }
  }
  if (!closed) out.push({ ...pts[n - 1] });
  return out;
}
