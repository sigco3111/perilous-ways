// src/gfx/props.js
// Settlements, stations, tunnel portals and viaduct piers.
//
// Everything here is built by hand into flat typed arrays and emitted as a
// handful of merged BufferGeometries grouped by material, so a whole town is
// 3-6 draw calls. Vertex colours only, no textures. Deterministic in `seed`.
//
// Local conventions
//   buildSettlement : origin = settlement centre, ground at y = 0.
//   buildStation    : track centreline is local z = 0 running along X,
//                     platform on the +Z side (the Dwarf terminus spans it).
//   buildTunnelPortal: bore axis is Z, the mouth faces -Z, sill at y = 0.
//   buildBridgePier : deck bearing surface is exactly y = height, centred on X/Z.

import { makeRng, clamp } from '../rng.js';

const TAU = Math.PI * 2;
const D2R = Math.PI / 180;

// --------------------------------------------------------------------------
// Palette. Every value here comes from ART.md; the four marked (*) are
// darkenings/brightenings of ART entries for glass, voids and light spill.
// --------------------------------------------------------------------------

export const PAL = {
  iron: 0x4a4a52, brass: 0xb08d57, copper: 0x7fae9d, coal: 0x1c1a1c,
  railhead: 0xa89e90, timber: 0x7a5c3c, darkTimber: 0x4a3626,
  rock: 0x7d7468, cliff: 0x544e46, scree: 0x948a7c,
  grass: 0x7d9a4e, grassHi: 0xa9ba69, dry: 0xb2a35e,
  farm: 0xc2a758, plough: 0x8a6f47,
  canopy: 0x3f6340, canopyDark: 0x223a2c, floor: 0x4a5f3c,
  ash: 0x4a4348, slag: 0x2a2428, ember: 0xff6a2a,
  snow: 0xeef2f5, beach: 0xd8c9a0,

  whitewash: 0xefe7d3, thatch: 0xc9a86a,
  doorGreen: 0x4f7a4a, doorRed: 0xa8543f,
  granite: 0x6e6a66,
  birch: 0xded6c4, silver: 0xc8d4d8, verdigris: 0x7fae9d,
  sandstone: 0xc9b393, slate: 0x5a6068, banner: 0x9e3b3b,
  greystone: 0x77716a, brazier: 0xff8a3a,
  basalt: 0x25222a, rust: 0x7a3a28, emberOrc: 0xff5a1e,

  hearth: 0xffc987,   // (*) lit window, warm — thatch pushed to lamplight
  cold: 0xcfe0dc,     // (*) elf window, silver #c8d4d8 lifted
  voidDark: 0x151317, // (*) gate mouths and tunnel bores
  tile: 0x8a4a3a,     // (*) roof tile, banner red knocked back
};

export const SETTLEMENT_KINDS = ['shire', 'delve', 'haven', 'burg', 'watch', 'hold'];
const TIER_R = [7, 10.5, 15, 20.5, 27.5];

// sRGB hex -> linear working space, via THREE so we honour ColorManagement.
const _lin = new Map();
function lin(THREE, hex) {
  let c = _lin.get(hex);
  if (c === undefined) {
    const k = new THREE.Color(hex);
    c = [k.r, k.g, k.b];
    _lin.set(hex, c);
  }
  return c;
}

// --------------------------------------------------------------------------
// Shared transform stack. One per settlement, shared by every material
// bucket, so a wall in `matte` and its lit window in `glow` share a frame.
// Row-major 3x4 affine: rows are [m0 m1 m2 | m3].
// --------------------------------------------------------------------------

class Xf {
  constructor() { this.m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]; this.st = []; }
  push() { this.st.push(this.m.slice()); return this; }
  pop() { const p = this.st.pop(); if (p) this.m = p; return this; }
  reset() { this.m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]; this.st.length = 0; return this; }
  translate(x, y, z) {
    const m = this.m;
    m[3] += m[0] * x + m[1] * y + m[2] * z;
    m[7] += m[4] * x + m[5] * y + m[6] * z;
    m[11] += m[8] * x + m[9] * y + m[10] * z;
    return this;
  }
  rotateY(a) {
    const c = Math.cos(a), s = Math.sin(a), m = this.m;
    for (let i = 0; i < 3; i++) {
      const o = i * 4, x = m[o], z = m[o + 2];
      m[o] = x * c - z * s; m[o + 2] = x * s + z * c;
    }
    return this;
  }
  rotateX(a) {
    const c = Math.cos(a), s = Math.sin(a), m = this.m;
    for (let i = 0; i < 3; i++) {
      const o = i * 4, y = m[o + 1], z = m[o + 2];
      m[o + 1] = y * c + z * s; m[o + 2] = -y * s + z * c;
    }
    return this;
  }
  rotateZ(a) {
    const c = Math.cos(a), s = Math.sin(a), m = this.m;
    for (let i = 0; i < 3; i++) {
      const o = i * 4, x = m[o], y = m[o + 1];
      m[o] = x * c + y * s; m[o + 1] = -x * s + y * c;
    }
    return this;
  }
  /** local point -> settlement space, into out[0..2] */
  ap(x, y, z, out) {
    const m = this.m;
    out[0] = m[0] * x + m[1] * y + m[2] * z + m[3];
    out[1] = m[4] * x + m[5] * y + m[6] * z + m[7];
    out[2] = m[8] * x + m[9] * y + m[10] * z + m[11];
    return out;
  }
}

// Face bitmask for frustum/box.
const FX = 1, FNX = 2, FZ = 4, FNZ = 8, FY = 16, FNY = 32;
const F_ALL = 63, F_NOBASE = 31, F_SIDES = 15, F_BAND = 15 | FY | FNY;

// --------------------------------------------------------------------------
// Mesher — one per material bucket.
// --------------------------------------------------------------------------

class Mesher {
  constructor(xf, THREE, opts) {
    this.xf = xf; this.T = THREE;
    this.p = []; this.n = []; this.c = []; this.w = [];
    this.aoK = (opts && opts.ao !== undefined) ? opts.ao : 0.16;
    this.aoH = 3.0;
    this.wantSway = !!(opts && opts.sway);
    this.sway = 0;
    this.cr = 1; this.cg = 1; this.cb = 1;
    this._t = [0, 0, 0];
  }
  get tris() { return this.p.length / 9; }
  get empty() { return this.p.length === 0; }

  col(hex, mul) {
    const c = lin(this.T, hex), k = mul === undefined ? 1 : mul;
    this.cr = c[0] * k; this.cg = c[1] * k; this.cb = c[2] * k;
    return this;
  }
  /** colour with deterministic jitter — kills the plastic look on masonry */
  colj(hex, rng, amt) {
    return this.col(hex, 1 + (rng() - 0.5) * (amt === undefined ? 0.14 : amt));
  }
  mix(hexA, hexB, t, mul) {
    const a = lin(this.T, hexA), b = lin(this.T, hexB), k = mul === undefined ? 1 : mul;
    this.cr = (a[0] + (b[0] - a[0]) * t) * k;
    this.cg = (a[1] + (b[1] - a[1]) * t) * k;
    this.cb = (a[2] + (b[2] - a[2]) * t) * k;
    return this;
  }

  v(x, y, z, nx, ny, nz) {
    const m = this.xf.m;
    const wx = m[0] * x + m[1] * y + m[2] * z + m[3];
    const wy = m[4] * x + m[5] * y + m[6] * z + m[7];
    const wz = m[8] * x + m[9] * y + m[10] * z + m[11];
    let ax = m[0] * nx + m[1] * ny + m[2] * nz;
    let ay = m[4] * nx + m[5] * ny + m[6] * nz;
    let az = m[8] * nx + m[9] * ny + m[10] * nz;
    const l = Math.sqrt(ax * ax + ay * ay + az * az) || 1;
    this.p.push(wx, wy, wz);
    this.n.push(ax / l, ay / l, az / l);
    let k = 1;
    if (this.aoK > 0) {
      const t = wy <= 0 ? 0 : wy >= this.aoH ? 1 : wy / this.aoH;
      k = 1 - this.aoK * (1 - t) * (1 - t);
    }
    this.c.push(this.cr * k, this.cg * k, this.cb * k);
    if (this.wantSway) this.w.push(this.sway);
    return this;
  }
  /** flat-shaded triangle, CCW from outside */
  tri(ax, ay, az, bx, by, bz, cx, cy, cz) {
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    nx /= l; ny /= l; nz /= l;
    this.v(ax, ay, az, nx, ny, nz); this.v(bx, by, bz, nx, ny, nz); this.v(cx, cy, cz, nx, ny, nz);
    return this;
  }
  quad(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz) {
    this.tri(ax, ay, az, bx, by, bz, cx, cy, cz);
    this.tri(ax, ay, az, cx, cy, cz, dx, dy, dz);
    return this;
  }

  // ---- boxes ------------------------------------------------------------

  /** tapered box, base centred on the origin at y=0, top scaled and offset */
  frustum(w, h, d, tw, td, ox, oz, faces) {
    const f = faces === undefined ? F_NOBASE : faces;
    const w2 = w * 0.5, d2 = d * 0.5, t2 = tw * 0.5, u2 = td * 0.5;
    const b0x = -w2, b0z = -d2, b1x = w2, b1z = -d2, b2x = w2, b2z = d2, b3x = -w2, b3z = d2;
    const t0x = ox - t2, t0z = oz - u2, t1x = ox + t2, t1z = oz - u2;
    const t2x = ox + t2, t2z = oz + u2, t3x = ox - t2, t3z = oz + u2;
    if (f & FNZ) this.quad(b1x, 0, b1z, b0x, 0, b0z, t0x, h, t0z, t1x, h, t1z);
    if (f & FX) this.quad(b2x, 0, b2z, b1x, 0, b1z, t1x, h, t1z, t2x, h, t2z);
    if (f & FZ) this.quad(b3x, 0, b3z, b2x, 0, b2z, t2x, h, t2z, t3x, h, t3z);
    if (f & FNX) this.quad(b0x, 0, b0z, b3x, 0, b3z, t3x, h, t3z, t0x, h, t0z);
    if (f & FY) this.quad(t3x, h, t3z, t2x, h, t2z, t1x, h, t1z, t0x, h, t0z);
    if (f & FNY) this.quad(b0x, 0, b0z, b1x, 0, b1z, b2x, 0, b2z, b3x, 0, b3z);
    return this;
  }
  box(w, h, d, faces) { return this.frustum(w, h, d, w, d, 0, 0, faces); }
  /** box centred on y too — for lintels, rails, floating slabs */
  slab(w, h, d, faces) {
    this.xf.push().translate(0, -h * 0.5, 0);
    this.frustum(w, h, d, w, d, 0, 0, faces === undefined ? F_ALL : faces);
    this.xf.pop();
    return this;
  }
  /** wedge: bottom rectangle, top edge heights h0 at -Z and h1 at +Z (shed roof) */
  wedge(w, h0, h1, d) {
    const w2 = w * 0.5, d2 = d * 0.5;
    this.quad(w2, 0, -d2, -w2, 0, -d2, -w2, h0, -d2, w2, h0, -d2);           // -Z
    this.quad(-w2, 0, d2, w2, 0, d2, w2, h1, d2, -w2, h1, d2);               // +Z
    this.quad(w2, 0, d2, w2, 0, -d2, w2, h0, -d2, w2, h1, d2);               // +X
    this.quad(-w2, 0, -d2, -w2, 0, d2, -w2, h1, d2, -w2, h0, -d2);           // -X
    this.quad(-w2, h1, d2, w2, h1, d2, w2, h0, -d2, -w2, h0, -d2);           // slope
    return this;
  }
  plate(w, d) {
    const w2 = w * 0.5, d2 = d * 0.5;
    return this.quad(-w2, 0, d2, w2, 0, d2, w2, 0, -d2, -w2, 0, -d2);
  }
  /** upright panel centred on X, y = 0..h, at z = 0, facing dir (+1/-1) */
  panelZ(w, h, dir, y0) {
    const w2 = w * 0.5, a = y0 || 0, b = a + h;
    if (dir < 0) return this.quad(w2, a, 0, -w2, a, 0, -w2, b, 0, w2, b, 0);
    return this.quad(-w2, a, 0, w2, a, 0, w2, b, 0, -w2, b, 0);
  }
  /** upright panel in the YZ plane at x = 0, facing dir (+1/-1) */
  panelX(d, h, dir, y0) {
    const d2 = d * 0.5, a = y0 || 0, b = a + h;
    if (dir < 0) return this.quad(0, a, -d2, 0, a, d2, 0, b, d2, 0, b, -d2);
    return this.quad(0, a, d2, 0, a, -d2, 0, b, -d2, 0, b, d2);
  }

  // ---- roofs ------------------------------------------------------------

  /** gable roof, ridge along X. Eaves at y=0, ridge at y=h, z=rs. */
  gable(w, h, d, ov, rs) {
    const o = ov || 0, W2 = (w + o * 2) * 0.5, D2 = (d + o * 2) * 0.5, r = rs || 0;
    this.quad(W2, 0, -D2, -W2, 0, -D2, -W2, h, r, W2, h, r);
    this.quad(-W2, 0, D2, W2, 0, D2, W2, h, r, -W2, h, r);
    this.tri(W2, 0, D2, W2, 0, -D2, W2, h, r);
    this.tri(-W2, 0, -D2, -W2, 0, D2, -W2, h, r);
    return this;
  }
  /** hip roof, ridge along X with length w*rf (rf=0 -> pyramid) */
  hip(w, h, d, rf, ov) {
    const o = ov || 0, W2 = (w + o * 2) * 0.5, D2 = (d + o * 2) * 0.5;
    const rx = (rf || 0) * W2;
    if (rx < 0.02) {
      this.tri(W2, 0, -D2, -W2, 0, -D2, 0, h, 0);
      this.tri(-W2, 0, D2, W2, 0, D2, 0, h, 0);
      this.tri(W2, 0, D2, W2, 0, -D2, 0, h, 0);
      this.tri(-W2, 0, -D2, -W2, 0, D2, 0, h, 0);
      return this;
    }
    this.quad(W2, 0, -D2, -W2, 0, -D2, -rx, h, 0, rx, h, 0);
    this.quad(-W2, 0, D2, W2, 0, D2, rx, h, 0, -rx, h, 0);
    this.tri(W2, 0, D2, W2, 0, -D2, rx, h, 0);
    this.tri(-W2, 0, -D2, -W2, 0, D2, -rx, h, 0);
    return this;
  }

  // ---- revolves ---------------------------------------------------------

  cyl(rb, rt, h, seg, opts) {
    const o = opts || {}, sm = o.smooth !== false;
    const dA = TAU / seg, a0 = o.phase || 0, dr = rb - rt;
    for (let i = 0; i < seg; i++) {
      const p = a0 + i * dA, q = a0 + (i + 1) * dA;
      const cp = Math.cos(p), sp = Math.sin(p), cq = Math.cos(q), sq = Math.sin(q);
      if (sm) {
        const nl = Math.sqrt(h * h + dr * dr) || 1, nh = h / nl, nd = dr / nl;
        this.v(rb * cq, 0, rb * sq, cq * nh, nd, sq * nh);
        this.v(rb * cp, 0, rb * sp, cp * nh, nd, sp * nh);
        this.v(rt * cp, h, rt * sp, cp * nh, nd, sp * nh);
        this.v(rb * cq, 0, rb * sq, cq * nh, nd, sq * nh);
        this.v(rt * cp, h, rt * sp, cp * nh, nd, sp * nh);
        this.v(rt * cq, h, rt * sq, cq * nh, nd, sq * nh);
      } else {
        this.quad(rb * cq, 0, rb * sq, rb * cp, 0, rb * sp, rt * cp, h, rt * sp, rt * cq, h, rt * sq);
      }
      if (o.capTop) this.tri(0, h, 0, rt * cq, h, rt * sq, rt * cp, h, rt * sp);
      if (o.capBot) this.tri(0, 0, 0, rb * cp, 0, rb * sp, rb * cq, 0, rb * sq);
    }
    return this;
  }
  /** cone / spire. flare>0 gives concave elvish eaves. rings>=1 */
  cone(r, h, seg, flare, rings) {
    const k = 1 + (flare || 0), R = Math.max(1, rings | 0), dA = TAU / seg;
    let r0 = r, y0 = 0;
    for (let j = 1; j <= R; j++) {
      const t = j / R, r1 = j === R ? 0 : r * Math.pow(1 - t, k), y1 = h * t;
      const dr = r1 - r0, dy = y1 - y0;
      const nl = Math.sqrt(dy * dy + dr * dr) || 1, nh = dy / nl, nd = -dr / nl;
      for (let i = 0; i < seg; i++) {
        const p = i * dA, q = (i + 1) * dA;
        const cp = Math.cos(p), sp = Math.sin(p), cq = Math.cos(q), sq = Math.sin(q);
        if (r1 < 1e-4) {
          this.v(r0 * cq, y0, r0 * sq, cq * nh, nd, sq * nh);
          this.v(r0 * cp, y0, r0 * sp, cp * nh, nd, sp * nh);
          this.v(0, y1, 0, (cp + cq) * 0.5 * nh, nd, (sp + sq) * 0.5 * nh);
        } else {
          this.v(r0 * cq, y0, r0 * sq, cq * nh, nd, sq * nh);
          this.v(r0 * cp, y0, r0 * sp, cp * nh, nd, sp * nh);
          this.v(r1 * cp, y1, r1 * sp, cp * nh, nd, sp * nh);
          this.v(r0 * cq, y0, r0 * sq, cq * nh, nd, sq * nh);
          this.v(r1 * cp, y1, r1 * sp, cp * nh, nd, sp * nh);
          this.v(r1 * cq, y1, r1 * sq, cq * nh, nd, sq * nh);
        }
      }
      r0 = r1; y0 = y1;
    }
    return this;
  }
  /** half ellipsoid, smooth — halfling mounds, orc slag, tree clumps */
  dome(rx, ry, rz, seg, rings) {
    const dA = TAU / seg, R = Math.max(1, rings | 0);
    const nrm = (x, y, z) => {
      const ax = x / (rx * rx), ay = y / (ry * ry), az = z / (rz * rz);
      const l = Math.sqrt(ax * ax + ay * ay + az * az) || 1;
      return [ax / l, ay / l, az / l];
    };
    for (let j = 0; j < R; j++) {
      const t0 = (j / R) * Math.PI * 0.5, t1 = ((j + 1) / R) * Math.PI * 0.5;
      const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
      for (let i = 0; i < seg; i++) {
        const p = i * dA, q = (i + 1) * dA;
        const cp = Math.cos(p), sp = Math.sin(p), cq = Math.cos(q), sq = Math.sin(q);
        const A = [rx * c0 * cq, ry * s0, rz * c0 * sq];
        const B = [rx * c0 * cp, ry * s0, rz * c0 * sp];
        const C = [rx * c1 * cp, ry * s1, rz * c1 * sp];
        const D = [rx * c1 * cq, ry * s1, rz * c1 * sq];
        const nA = nrm(A[0], A[1], A[2]), nB = nrm(B[0], B[1], B[2]);
        const nC = nrm(C[0], C[1], C[2]), nD = nrm(D[0], D[1], D[2]);
        this.v(A[0], A[1], A[2], nA[0], nA[1], nA[2]);
        this.v(B[0], B[1], B[2], nB[0], nB[1], nB[2]);
        this.v(C[0], C[1], C[2], nC[0], nC[1], nC[2]);
        if (j < R - 1) {
          this.v(A[0], A[1], A[2], nA[0], nA[1], nA[2]);
          this.v(C[0], C[1], C[2], nC[0], nC[1], nC[2]);
          this.v(D[0], D[1], D[2], nD[0], nD[1], nD[2]);
        }
      }
    }
    return this;
  }
  /** half cylinder along +Z, flat side on the ground — hobbit holes, vaults */
  barrel(r, len, seg, capBack) {
    const dA = Math.PI / seg;
    for (let i = 0; i < seg; i++) {
      const p = i * dA, q = (i + 1) * dA;
      const cp = Math.cos(p), sp = Math.sin(p), cq = Math.cos(q), sq = Math.sin(q);
      this.v(r * cp, r * sp, 0, cp, sp, 0);
      this.v(r * cq, r * sq, 0, cq, sq, 0);
      this.v(r * cq, r * sq, len, cq, sq, 0);
      this.v(r * cp, r * sp, 0, cp, sp, 0);
      this.v(r * cq, r * sq, len, cq, sq, 0);
      this.v(r * cp, r * sp, len, cp, sp, 0);
      if (capBack) this.tri(0, 0, len, r * cp, r * sp, len, r * cq, r * sq, len);
    }
    return this;
  }
  /** half disc in XY at z=0, flat bottom — the white face of a hobbit hole */
  halfDiscZ(r, seg, dir) {
    const dA = Math.PI / seg;
    for (let i = 0; i < seg; i++) {
      const p = i * dA, q = (i + 1) * dA;
      const A = [r * Math.cos(p), r * Math.sin(p), 0], B = [r * Math.cos(q), r * Math.sin(q), 0];
      if (dir < 0) this.tri(0, 0, 0, B[0], B[1], 0, A[0], A[1], 0);
      else this.tri(0, 0, 0, A[0], A[1], 0, B[0], B[1], 0);
    }
    return this;
  }
  discZ(r, seg, dir) {
    const dA = TAU / seg;
    for (let i = 0; i < seg; i++) {
      const p = i * dA, q = (i + 1) * dA;
      const A = [r * Math.cos(p), r * Math.sin(p)], B = [r * Math.cos(q), r * Math.sin(q)];
      if (dir < 0) this.tri(0, 0, 0, B[0], B[1], 0, A[0], A[1], 0);
      else this.tri(0, 0, 0, A[0], A[1], 0, B[0], B[1], 0);
    }
    return this;
  }
  discY(r, seg, phase) {
    const dA = TAU / seg, a0 = phase || 0;
    for (let i = 0; i < seg; i++) {
      const p = a0 + i * dA, q = a0 + (i + 1) * dA;
      this.tri(0, 0, 0, r * Math.cos(q), 0, r * Math.sin(q), r * Math.cos(p), 0, r * Math.sin(p));
    }
    return this;
  }

  // ---- assorted ---------------------------------------------------------

  /** flat strip following a polyline of [x,z] pairs — lanes, quays, walkways */
  ribbon(pts, w, y) {
    const h = y || 0, hw = w * 0.5;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      let dx = b[0] - a[0], dz = b[1] - a[1];
      const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const px = -dz * hw, pz = dx * hw;
      this.quad(a[0] - px, h, a[1] - pz, b[0] - px, h, b[1] - pz,
        b[0] + px, h, b[1] + pz, a[0] + px, h, a[1] + pz);
    }
    return this;
  }
  /** crenellated band along X, centred, sitting at y=0 */
  merlons(len, t, h, n, cheap) {
    const step = len / n, mw = step * 0.56, f = cheap ? (FZ | FNZ | FY) : F_NOBASE;
    for (let i = 0; i < n; i++) {
      this.xf.push().translate(-len * 0.5 + step * (i + 0.5), 0, 0);
      this.box(mw, h, t, f);
      this.xf.pop();
    }
    return this;
  }
  /** pointed post — palisade stakes, mooring posts, orc spikes on poles */
  stake(r, h, sides, tipFrac) {
    const tf = tipFrac === undefined ? 0.22 : tipFrac, sh = h * (1 - tf);
    this.cyl(r, r * 0.92, sh, sides, { smooth: false });
    this.xf.push().translate(0, sh, 0);
    this.cone(r * 0.92, h - sh, sides, 0, 1);
    this.xf.pop();
    return this;
  }
  spike(r, h, sides) { return this.cone(r, h, sides || 4, 0, 1); }
  /** flight of steps climbing toward -Z */
  steps(w, n, rise, run) {
    for (let i = 0; i < n; i++) {
      this.xf.push().translate(0, i * rise, -i * run);
      this.box(w, rise, run, FNZ | FY | FX | FNX);
      this.xf.pop();
    }
    return this;
  }
  /** jittered octahedron — foliage clumps, slag lumps, hedges */
  blob(rx, ry, rz, rng, jit) {
    const j = jit === undefined ? 0.3 : jit;
    const J = () => 1 + (rng() - 0.5) * j;
    const px = rx * J(), nx = -rx * J(), pz = rz * J(), nz = -rz * J();
    const top = ry * J(), bot = 0;
    const eq = [[px, ry * 0.42, 0], [0, ry * 0.42 * J(), pz], [nx, ry * 0.42, 0], [0, ry * 0.42 * J(), nz]];
    for (let i = 0; i < 4; i++) {
      const a = eq[i], b = eq[(i + 1) % 4];
      this.tri(b[0], b[1], b[2], a[0], a[1], a[2], 0, top, 0);
      this.tri(a[0], a[1], a[2], b[0], b[1], b[2], 0, bot, 0);
    }
    return this;
  }

  geometry() {
    const T = this.T, g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(this.c, 3));
    if (this.wantSway) g.setAttribute('sway', new T.Float32BufferAttribute(this.w, 1));
    g.computeBoundingSphere();
    return g;
  }
}

// --------------------------------------------------------------------------
// Materials. Five shared instances: matte, metal, glow, foliage, cloth.
// Shared across every settlement so the whole map costs five programs.
// --------------------------------------------------------------------------

const EM_TOK = 'vec3 totalEmissiveRadiance = emissive;';
const BV_TOK = '#include <begin_vertex>';

const SWAY_VERT = [
  'vec3 transformed = vec3( position );',
  '{',
  '  vec3 pwWp = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;',
  '  float pwPh = pwWp.x * 0.11 + pwWp.z * 0.13;',
  '  float pwA = sin( uTime * 1.9 + pwPh ) * 0.62 + sin( uTime * 0.83 + pwPh * 2.1 ) * 0.38;',
  '  transformed.xz += uWind * ( pwA * sway );',
  '  transformed.y -= abs( pwA ) * sway * 0.10;',
  '}',
].join('\n');

const GLOW_VERT = [
  'vec3 transformed = vec3( position );',
  'vFlk = 0.87 + 0.13 * sin( uTime * 5.3 + ( modelMatrix * vec4( transformed, 1.0 ) ).x * 1.7 + transformed.y * 2.1 );',
].join('\n');

const _matCache = [];

/** Shared prop materials. `shared.uTime` (a {value} object) is adopted if given. */
export function propMaterials(THREE, shared) {
  for (const e of _matCache) if (e.T === THREE && e.sh === (shared || null)) return e.m;

  const lib = THREE.ShaderLib && THREE.ShaderLib.physical;
  const canVert = !!(lib && lib.vertexShader.indexOf(BV_TOK) >= 0);
  const canEmit = !!(lib && lib.fragmentShader.indexOf(EM_TOK) >= 0);

  const uni = {
    uTime: (shared && shared.uTime) ? shared.uTime : { value: 0 },
    uWind: { value: new THREE.Vector2(0.55, 0.3) },
  };

  const patchSway = (mat, key) => {
    if (!canVert) return mat;
    mat.customProgramCacheKey = () => key;
    mat.onBeforeCompile = (s) => {
      s.uniforms.uTime = uni.uTime;
      s.uniforms.uWind = uni.uWind;
      s.vertexShader = 'uniform float uTime;\nuniform vec2 uWind;\nattribute float sway;\n' +
        s.vertexShader.replace(BV_TOK, SWAY_VERT);
    };
    return mat;
  };

  const matte = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.87, metalness: 0.0, dithering: true,
  });
  matte.name = 'pw-matte';

  const metal = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.44, metalness: 0.7, dithering: true,
  });
  metal.name = 'pw-metal';

  // Windows, braziers, embers. Emissive is tinted by the vertex colour with a
  // one-line patch; if that chunk ever moves we fall back to a flat warm glow.
  const glow = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.55, metalness: 0.0,
    emissive: new THREE.Color(canEmit ? 0xffffff : 0xffb070),
    emissiveIntensity: canEmit ? 1.0 : 0.85,
  });
  glow.color.setHex(0x2b2724);
  glow.name = 'pw-glow';
  if (canEmit) {
    glow.customProgramCacheKey = () => 'pw-glow';
    glow.onBeforeCompile = (s) => {
      s.uniforms.uTime = uni.uTime;
      s.vertexShader = 'uniform float uTime;\nvarying float vFlk;\n' +
        s.vertexShader.replace(BV_TOK, GLOW_VERT);
      s.fragmentShader = 'varying float vFlk;\n' + s.fragmentShader.replace(
        EM_TOK, 'vec3 totalEmissiveRadiance = emissive * vColor.rgb * vFlk;');
    };
  }

  const foliage = patchSway(new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.93, metalness: 0.0, dithering: true,
  }), 'pw-fol');
  foliage.name = 'pw-foliage';

  const cloth = patchSway(new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide,
  }), 'pw-cloth');
  cloth.name = 'pw-cloth';

  const m = { matte, metal, glow, foliage, cloth, uniforms: uni, tinted: canEmit };
  _matCache.push({ T: THREE, sh: shared || null, m });
  return m;
}

// --------------------------------------------------------------------------
// Kit: the five buckets plus the shared transform, lanterns, animated bits.
// --------------------------------------------------------------------------

function newKit(THREE, shared) {
  const xf = new Xf();
  const mats = propMaterials(THREE, shared);
  const kit = {
    T: THREE, xf, mats,
    matte: new Mesher(xf, THREE, { ao: 0.17 }),
    metal: new Mesher(xf, THREE, { ao: 0.13 }),
    glow: new Mesher(xf, THREE, { ao: 0 }),
    fol: new Mesher(xf, THREE, { ao: 0.20, sway: true }),
    cloth: new Mesher(xf, THREE, { ao: 0.08, sway: true }),
    lp: [], lc: [], extra: [], spin: [],
  };
  const tmp = [0, 0, 0];
  kit.lantern = (x, y, z, hex) => {
    xf.ap(x, y, z, tmp);
    kit.lp.push(new THREE.Vector3(tmp[0], tmp[1], tmp[2]));
    kit.lc.push(hex === undefined ? PAL.hearth : hex);
    return kit;
  };
  // Transform sugar, so builders read like a description of the place.
  kit.p = () => { xf.push(); return kit; };
  kit.o = () => { xf.pop(); return kit; };
  kit.t = (x, y, z) => { xf.translate(x, y, z); return kit; };
  kit.ry = (a) => { xf.rotateY(a); return kit; };
  kit.rx = (a) => { xf.rotateX(a); return kit; };
  kit.rz = (a) => { xf.rotateZ(a); return kit; };
  return kit;
}

function finish(kit, name) {
  const T = kit.T, g = new T.Group();
  g.name = name;
  const add = (mesher, mat, nm, cast) => {
    if (mesher.empty) return;
    const m = new T.Mesh(mesher.geometry(), mat);
    m.name = name + ':' + nm;
    m.castShadow = cast !== false;
    m.receiveShadow = cast !== false;
    g.add(m);
  };
  add(kit.matte, kit.mats.matte, 'matte');
  add(kit.metal, kit.mats.metal, 'metal');
  add(kit.fol, kit.mats.foliage, 'foliage');
  add(kit.cloth, kit.mats.cloth, 'cloth');
  add(kit.glow, kit.mats.glow, 'glow', false);
  for (const e of kit.extra) g.add(e);
  return g;
}

/** triangle / draw-call census, handy for the test page and for budgets */
export function tally(object3d) {
  let tris = 0, calls = 0;
  object3d.traverse((o) => {
    if (!o.isMesh) return;
    calls++;
    const p = o.geometry.getAttribute('position');
    tris += (o.geometry.index ? o.geometry.index.count : p.count) / 3;
  });
  return { tris, calls };
}

function disposer(group) {
  return () => group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
}

// --------------------------------------------------------------------------
// Placement: rejection sampling in a ring, so nothing intersects anything and
// the footprint is measured rather than guessed.
// --------------------------------------------------------------------------

class Placer {
  constructor() { this.a = []; this.max = 0; }
  add(x, z, r) {
    this.a.push(x, z, r);
    const d = Math.hypot(x, z) + r;
    if (d > this.max) this.max = d;
    return { x, z, r };
  }
  free(x, z, r) {
    const a = this.a;
    for (let i = 0; i < a.length; i += 3) {
      const dx = x - a[i], dz = z - a[i + 1], rr = r + a[i + 2];
      if (dx * dx + dz * dz < rr * rr) return false;
    }
    return true;
  }
  place(rng, r, r0, r1, tries, gap) {
    const n = tries || 30, g = gap === undefined ? 0.5 : gap;
    for (let i = 0; i < n; i++) {
      const a = rng() * TAU, d = r0 + (r1 - r0) * Math.sqrt(rng());
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (this.free(x, z, r + g)) { this.add(x, z, r); return { x, z, a, d }; }
    }
    return null;
  }
}

/** yaw that turns a builder's -Z face toward the settlement centre */
const faceIn = (x, z) => Math.atan2(-x, z);
const faceOut = (x, z) => Math.atan2(x, -z);
/** yaw that aligns a builder's +X axis with the direction (dx, dz) */
const along = (dx, dz) => Math.atan2(dz, dx);

// --------------------------------------------------------------------------
// Shared small props
// --------------------------------------------------------------------------

/** lit window panels on the current frame's -Z face */
function windows(kit, n, w, h, y, spread, hex, lanternEvery) {
  const g = kit.glow;
  g.col(hex === undefined ? PAL.hearth : hex);
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? 0 : -spread * 0.5 + (spread / (n - 1)) * i;
    kit.p().t(x, y, -0.03);
    g.panelZ(w, h, -1);
    kit.o();
    if (lanternEvery && i % lanternEvery === 0) kit.lantern(x, y + h * 0.5, -0.5, hex);
  }
}

/** broadleaf or conifer tree. Trunk into matte, canopy into the sway bucket. */
function tree(kit, rng, h, opts) {
  const o = opts || {}, conifer = !!o.conifer;
  const tr = h * (o.trunk === undefined ? 0.055 : o.trunk);
  kit.matte.colj(o.bark === undefined ? PAL.darkTimber : o.bark, rng, 0.16);
  kit.matte.cyl(tr * 1.35, tr * 0.8, h * (conifer ? 0.30 : 0.52), 5, { smooth: false });
  const f = kit.fol;
  const dark = o.dark === undefined ? PAL.canopyDark : o.dark;
  const lit = o.canopy === undefined ? PAL.canopy : o.canopy;
  if (conifer) {
    const n = h > 12 ? 4 : 3;
    for (let i = 0; i < n; i++) {
      const t = i / n, y = h * (0.25 + t * 0.6), r = h * 0.21 * (1 - t * 0.62);
      f.sway = 0.05 + t * 0.16;
      f.mix(dark, lit, 0.35 + t * 0.5, 1 + (rng() - 0.5) * 0.12);
      kit.p().t((rng() - 0.5) * 0.3, y, (rng() - 0.5) * 0.3);
      f.cone(r, h * 0.32, 6, 0.5, 1);
      kit.o();
    }
  } else {
    const n = o.clumps || 3;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rng() * 1.2;
      const rad = h * 0.13 * (i === 0 ? 0.4 : 1);
      const y = h * (0.46 + (i === 0 ? 0.16 : 0.05) + rng() * 0.26);
      f.sway = 0.3 + (y / h) * 0.55;
      f.mix(dark, lit, 0.3 + rng() * 0.6, 1 + (rng() - 0.5) * 0.14);
      kit.p().t(Math.cos(a) * rad, y, Math.sin(a) * rad);
      f.blob(h * (0.15 + rng() * 0.07), h * (0.23 + rng() * 0.1), h * (0.15 + rng() * 0.07), rng, 0.34);
      kit.o();
    }
  }
  f.sway = 0;
}

/** lumpy hedge along a polyline of [x,z] pairs */
function hedge(kit, rng, pts, h, w) {
  const f = kit.fol;
  f.sway = 0.13;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
    const n = Math.max(1, Math.round(len / 3.6));
    const ang = Math.atan2(dx, dz);
    for (let j = 0; j < n; j++) {
      const m = (j + 0.5) / n;
      f.mix(PAL.canopyDark, PAL.canopy, 0.45 + rng() * 0.5, 1 + (rng() - 0.5) * 0.16);
      kit.p().t(a[0] + dx * m, 0, a[1] + dz * m).ry(ang);
      f.frustum(w * (0.9 + rng() * 0.3), h * (0.82 + rng() * 0.36), len / n + 0.2,
        w * 0.6, (len / n) * 0.8, 0, 0);
      kit.o();
    }
  }
  f.sway = 0;
}

/** cloth hanging from the current origin downward, with a sway gradient */
function hangCloth(kit, w, h, hex, mul, bands) {
  const c = kit.cloth, nb = bands || 3;
  c.col(hex, mul);
  for (let i = 0; i < nb; i++) {
    const y0 = -h * (i / nb), y1 = -h * ((i + 1) / nb);
    c.sway = 0.25 + 0.75 * ((i + 1) / nb);
    const w0 = w * (1 - 0.06 * i), w1 = w * (1 - 0.06 * (i + 1));
    c.quad(-w0 * 0.5, y0, 0, w0 * 0.5, y0, 0, w1 * 0.5, y1, 0, -w1 * 0.5, y1, 0);
  }
  c.sway = 0;
}

/** pennant streaming along +X from a pole at the origin */
function pennant(kit, len, h, hex) {
  const c = kit.cloth, nb = 3;
  c.col(hex);
  for (let i = 0; i < nb; i++) {
    const x0 = len * (i / nb), x1 = len * ((i + 1) / nb);
    const h0 = h * (1 - 0.45 * (i / nb)), h1 = h * (1 - 0.45 * ((i + 1) / nb));
    c.sway = 0.2 + 0.8 * ((i + 1) / nb);
    c.quad(x0, -h0 * 0.5, 0, x1, -h1 * 0.5, 0, x1, h1 * 0.5, 0, x0, h0 * 0.5, 0);
  }
  c.sway = 0;
}

/** irregular rock outcrop */
function crag(kit, rng, r, h, seg) {
  const m = kit.matte, n = seg || 6, dA = TAU / n;
  const rr = [], hh = [];
  for (let i = 0; i < n; i++) { rr.push(r * (0.7 + rng() * 0.6)); hh.push(h * (0.72 + rng() * 0.45)); }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, a = i * dA, b = j * dA;
    const ax = Math.cos(a) * rr[i], az = Math.sin(a) * rr[i];
    const bx = Math.cos(b) * rr[j], bz = Math.sin(b) * rr[j];
    m.colj(rng() < 0.35 ? PAL.cliff : PAL.rock, rng, 0.2);
    m.quad(bx, 0, bz, ax, 0, az, ax * 0.62, hh[i], az * 0.62, bx * 0.62, hh[j], bz * 0.62);
    m.colj(PAL.rock, rng, 0.16);
    m.tri(0, h * 1.02, 0, bx * 0.62, hh[j], bz * 0.62, ax * 0.62, hh[i], az * 0.62);
  }
}

/** brazier: iron tripod, bowl, coals. Adds a lantern point. */
function brazier(kit, rng, r, h, bowlHex, coalHex) {
  const m = kit.matte, mt = kit.metal;
  const coal = coalHex === undefined ? PAL.brazier : coalHex;
  m.col(PAL.iron, 0.95);
  for (let i = 0; i < 3; i++) {
    kit.p().ry((i / 3) * TAU).t(r * 0.5, 0, 0);
    m.frustum(r * 0.17, h, r * 0.17, r * 0.14, r * 0.14, -r * 0.42, 0);
    kit.o();
  }
  mt.colj(bowlHex === undefined ? PAL.brass : bowlHex, rng, 0.1);
  kit.p().t(0, h, 0);
  mt.cyl(r * 0.5, r, h * 0.42, 9, { smooth: false });
  kit.o();
  kit.glow.col(coal);
  kit.p().t(0, h + h * 0.36, 0);
  kit.glow.discY(r * 0.99, 9);
  kit.o();
  kit.lantern(0, h + h * 0.5, 0, coal);
}

/** warm light spilling on the ground in front of a lit door */
function spill(kit, w, d, hex, mul) {
  kit.p().t(0, 0.04, -d * 0.5);
  kit.glow.col(hex === undefined ? PAL.ember : hex, mul === undefined ? 0.3 : mul);
  kit.glow.plate(w, d);
  kit.o();
}

/** annulus arc on the -Z plane — door and window rims, gate arches */
function archRim(ms, r0, r1, seg, z, half) {
  const span = half ? Math.PI : TAU, dA = span / seg;
  for (let i = 0; i < seg; i++) {
    const p = i * dA, q = (i + 1) * dA;
    const ax = Math.cos(p), ay = Math.sin(p), bx = Math.cos(q), by = Math.sin(q);
    ms.quad(r0 * bx, r0 * by, z, r1 * bx, r1 * by, z, r1 * ax, r1 * ay, z, r0 * ax, r0 * ay, z);
  }
}

/** a spinning sub-mesh (mill sails, winding wheels) */
function extraMesh(kit, name, matKey, fn) {
  const xf = new Xf(), ms = new Mesher(xf, kit.T, { ao: 0 });
  fn(ms, xf);
  const mesh = new kit.T.Mesh(ms.geometry(), kit.mats[matKey || 'matte']);
  mesh.name = name;
  mesh.castShadow = true; mesh.receiveShadow = true;
  kit.extra.push(mesh);
  return mesh;
}

// ==========================================================================
// SHIRE — Halflings. Low, round-shouldered, horizontal, slightly untidy.
// Never a wall. Cottages dug into turf mounds, thatch, hedges, kitchen
// gardens in neat rectangles, a mill, washing lines, beehives, an inn.
// ==========================================================================

/** one hobbit-hole: white half-round facade, barrel driven back into the mound */
function hobbitHole(kit, rng, r, len) {
  const m = kit.matte;
  m.colj(PAL.thatch, rng, 0.12);
  kit.p().t(0, 0, 0.04);
  m.barrel(r * 0.99, len, 9, false);
  kit.o();
  m.colj(PAL.whitewash, rng, 0.06);
  m.halfDiscZ(r, 9, -1);
  m.colj(PAL.rock, rng, 0.14);
  archRim(m, r, r * 1.1, 9, -0.05, true);
  // round door, off-centre because nothing here is quite square
  const dr = r * 0.44, dx = (rng() - 0.5) * r * 0.12;
  m.colj(rng() < 0.55 ? PAL.doorGreen : PAL.doorRed, rng, 0.14);
  kit.p().t(dx, r * 0.44, -0.08);
  m.discZ(dr, 11, -1);
  m.col(PAL.brass, 0.85);
  kit.p().t(dr * 0.5, 0, -0.05); m.discZ(0.075, 5, -1); kit.o();
  kit.o();
  // two round windows, lit
  const wy = r * 0.62, wx = r * 0.66;
  for (let s = -1; s <= 1; s += 2) {
    m.colj(PAL.whitewash, rng, 0.05);
    kit.p().t(s * wx, wy, -0.07);
    m.discZ(r * 0.21, 8, -1);
    kit.glow.col(PAL.hearth);
    kit.p().t(0, 0, -0.05); kit.glow.discZ(r * 0.16, 8, -1); kit.o();
    kit.o();
  }
  kit.lantern(dx, r * 0.7, -r * 0.5, PAL.hearth);
  // three steps and a scrubbed doorstep
  m.colj(PAL.scree, rng, 0.1);
  kit.p().t(dx, 0, -0.55);
  m.box(dr * 1.9, 0.12, 1.0, F_NOBASE);
  kit.o();
}

/** turf mound with `n` holes cut into its -Z face, plus chimneys on top */
function hobbitMound(kit, rng, rx, ry, rz, n) {
  const m = kit.matte;
  m.mix(PAL.grass, PAL.grassHi, 0.25 + rng() * 0.4, 1);
  kit.p().t(0, 0, rz * 0.42);
  m.dome(rx, ry, rz, 11, 3);
  kit.o();
  const spread = 0.64, spacing = n > 1 ? (spread * 2 * rx) / (n - 1) : rx;
  for (let i = 0; i < n; i++) {
    const fx = n === 1 ? 0 : -spread + ((spread * 2) / (n - 1)) * i;
    const x = fx * rx;
    const u = clamp(1 - fx * fx, 0.05, 1);
    const zs = rz * 0.42 - rz * Math.sqrt(u);
    const r = clamp(Math.min(ry * 0.62, spacing * 0.44), 1.05, 1.95);
    kit.p().t(x, 0, zs + 0.1);
    hobbitHole(kit, rng, r, rz * 0.9 + 0.6);
    kit.o();
    // chimney, leaning, on the turf above
    const cz = rz * 0.14;
    const yy = ry * Math.sqrt(clamp(1 - fx * fx - 0.09, 0.1, 1));
    const ch = 1.5 + rng() * 0.5;
    kit.p().t(x + (rng() - 0.5) * 0.5, yy - 0.4, cz);
    m.colj(PAL.whitewash, rng, 0.07);
    m.frustum(0.52, ch, 0.52, 0.44, 0.44, (rng() - 0.5) * 0.3, 0.1);
    m.colj(PAL.rock, rng, 0.12);
    kit.p().t(0, ch, 0);
    m.box(0.74, 0.16, 0.74, F_ALL);
    kit.o();
    kit.o();
  }
}

/** freestanding cottage: cob walls, deep thatch, rounded ridge, fat chimney */
function cottage(kit, rng, w, h, d, storeys) {
  const m = kit.matte, ov = 0.5, rh = h * (storeys > 1 ? 0.62 : 0.8);
  m.colj(PAL.rock, rng, 0.12);
  m.frustum(w * 1.05, 0.26, d * 1.05, w * 1.03, d * 1.03, 0, 0);
  m.colj(PAL.whitewash, rng, 0.08);
  m.frustum(w, h, d, w * 0.965, d * 0.965, 0, 0);
  if (storeys > 1) {
    m.colj(PAL.darkTimber, rng, 0.1);
    kit.p().t(0, h * 0.52, 0);
    m.frustum(w * 1.01, 0.16, d * 1.01, w * 1.01, d * 1.01, 0, 0);
    kit.o();
  }
  kit.p().t(0, h, 0);
  m.colj(PAL.thatch, rng, 0.11);
  m.gable(w, rh, d, ov, 0);
  m.colj(PAL.thatch, rng, 0.2);
  kit.p().t(-(w * 0.5 + ov), rh, 0).rz(-Math.PI / 2);
  m.cyl(0.23, 0.23, w + ov * 2, 5, { smooth: true, capTop: true, capBot: true });
  kit.o();
  kit.o();
  // door and windows on the -Z face
  kit.p().t(0, 0, -d * 0.5);
  m.colj(rng() < 0.5 ? PAL.doorGreen : PAL.doorRed, rng, 0.14);
  kit.p().t((rng() - 0.5) * w * 0.3, 0, -0.03);
  m.panelZ(0.8, 1.45, -1);
  kit.o();
  windows(kit, 2, 0.6, 0.52, h * 0.5, w * 0.56, PAL.hearth, 2);
  if (storeys > 1) windows(kit, 3, 0.5, 0.45, h * 0.78, w * 0.62, PAL.hearth, 3);
  kit.o();
  // chimney
  const ch = 0.9 + h * 0.55;
  kit.p().t(w * 0.36, h, d * 0.18);
  m.colj(PAL.whitewash, rng, 0.06);
  m.frustum(0.62, ch, 0.58, 0.5, 0.48, (rng() - 0.5) * 0.26, 0);
  m.colj(PAL.rock, rng, 0.12);
  kit.p().t(0, ch, 0); m.box(0.82, 0.16, 0.78, F_ALL); kit.o();
  kit.o();
}

/** kitchen garden: ploughed rectangle, ridged rows, a low fence on two sides */
function garden(kit, rng, w, d) {
  const m = kit.matte, f = kit.fol;
  m.colj(PAL.plough, rng, 0.12);
  kit.p().t(0, 0.05, 0); m.plate(w, d); kit.o();
  const rows = Math.max(3, Math.round(d / 0.85));
  f.sway = 0.1;
  for (let i = 0; i < rows; i++) {
    const z = -d * 0.5 + (d / rows) * (i + 0.5);
    f.mix(PAL.canopy, PAL.grassHi, 0.3 + rng() * 0.5, 1 + (rng() - 0.5) * 0.14);
    kit.p().t(0, 0.06, z);
    f.frustum(w * 0.9, 0.3 + rng() * 0.18, 0.34, w * 0.86, 0.16, 0, 0);
    kit.o();
  }
  f.sway = 0;
  if (w >= 3.4) {
    m.colj(PAL.timber, rng, 0.14);
    const nf = Math.max(2, Math.round(w / 2.4));
    for (let i = 0; i <= nf; i++) {
      kit.p().t(-w * 0.5 + (w / nf) * i, 0, d * 0.5);
      m.box(0.09, 0.5 + rng() * 0.12, 0.09, F_NOBASE);
      kit.o();
    }
  }
}

function beehive(kit, rng) {
  const m = kit.matte;
  m.colj(PAL.timber, rng, 0.12);
  m.box(0.9, 0.22, 0.9, F_NOBASE);
  m.colj(PAL.thatch, rng, 0.14);
  kit.p().t(0, 0.22, 0);
  m.cone(0.42, 0.72, 7, 1.7, 2);
  kit.o();
}

function washingLine(kit, rng, len) {
  const m = kit.matte;
  m.colj(PAL.timber, rng, 0.14);
  for (let s = -1; s <= 1; s += 2) {
    kit.p().t(s * len * 0.5, 0, 0);
    m.box(0.13, 1.95, 0.13, F_NOBASE);
    kit.p().t(0, 1.95, 0); m.box(0.5, 0.1, 0.1, F_ALL); kit.o();
    kit.o();
  }
  m.col(PAL.darkTimber, 0.9);
  kit.p().t(0, 1.86, 0); m.box(len, 0.05, 0.05, F_ALL); kit.o();
  const n = 3 + Math.floor(rng() * 3);
  const hues = [PAL.whitewash, PAL.silver, PAL.doorGreen, PAL.thatch, PAL.doorRed];
  for (let i = 0; i < n; i++) {
    const x = -len * 0.36 + (len * 0.72 / (n - 1)) * i;
    kit.p().t(x, 1.84, 0);
    hangCloth(kit, 0.5 + rng() * 0.3, 0.6 + rng() * 0.4, hues[Math.floor(rng() * hues.length)], 0.95, 2);
    kit.o();
  }
}

function haystack(kit, rng) {
  const m = kit.matte;
  m.colj(PAL.thatch, rng, 0.14);
  m.cone(1.15, 1.5, 7, 0.9, 2);
  m.colj(PAL.dry, rng, 0.14);
  kit.p().t(0, 1.5, 0); m.cone(0.3, 0.4, 6, 0, 1); kit.o();
}

function signpost(kit, rng, arms) {
  const m = kit.matte;
  m.colj(PAL.timber, rng, 0.12);
  m.box(0.16, 2.3, 0.16, F_NOBASE);
  for (let i = 0; i < arms; i++) {
    kit.p().t(0, 2.05 - i * 0.42, 0).ry(rng() * TAU);
    m.colj(PAL.whitewash, rng, 0.08);
    kit.p().t(0.55, 0, 0); m.box(1.0, 0.24, 0.07, F_ALL); kit.o();
    kit.o();
  }
}

function bShire(kit, rng, T, R, pl) {
  const m = kit.matte;
  const nMound = [1, 2, 2, 3, 3][T];
  const nCot = [1, 2, 4, 6, 9][T];
  const holesPer = [3, 2, 3, 3, 3][T];

  // village green at the middle from tier 2, otherwise just a worn patch
  m.col(PAL.grassHi, 1.02);
  kit.p().t(0, 0.03, 0);
  m.discY(T >= 2 ? R * 0.24 : R * 0.16, 9, 0.3);
  kit.o();

  // a lane, wandering, because no halfling ever built a straight road
  const lanePts = [];
  for (let i = 0; i <= 7; i++) {
    const t = i / 7, a = -1.1 + t * 2.9 + Math.sin(t * 5.1) * 0.22;
    const d = R * (0.28 + 0.62 * t) * (0.9 + rng() * 0.2);
    lanePts.push([Math.cos(a) * d, Math.sin(a) * d]);
  }
  m.colj(PAL.plough, rng, 0.08);
  kit.p().t(0, 0.04, 0); m.ribbon(lanePts, 1.7, 0); kit.o();
  const lane2 = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6, a = 2.3 + t * 2.6 + Math.cos(t * 4.2) * 0.25;
    const d = R * (0.24 + 0.66 * t);
    lane2.push([Math.cos(a) * d, Math.sin(a) * d]);
  }
  m.colj(PAL.plough, rng, 0.08);
  kit.p().t(0, 0.04, 0); m.ribbon(lane2, 1.35, 0); kit.o();

  // mounds
  for (let i = 0; i < nMound; i++) {
    const rx = 4.8 + rng() * 1.6, rz = 3.2 + rng() * 1.0, ry = 2.7 + rng() * 0.6;
    const rad = Math.max(rx, rz) * 0.92;
    const p = i === 0
      ? pl.add((rng() - 0.5) * R * 0.2, (rng() - 0.5) * R * 0.2, rad)
      : pl.place(rng, rad, R * 0.42, R * 0.9, 44, 1.0);
    if (!p) continue;
    kit.p().t(p.x, 0, p.z).ry(faceIn(p.x, p.z) + (rng() - 0.5) * 0.5);
    hobbitMound(kit, rng, rx, ry, rz, holesPer);
    kit.o();
  }

  // cottages, facing roughly inward, none quite aligned
  for (let i = 0; i < nCot; i++) {
    const w = 3.2 + rng() * 1.5, d = 2.7 + rng() * 1.1, h = 2.0 + rng() * 0.5;
    const p = pl.place(rng, Math.max(w, d) * 0.78, R * 0.2, R * 0.95, 36, 0.9);
    if (!p) continue;
    kit.p().t(p.x, 0, p.z).ry(faceIn(p.x, p.z) + (rng() - 0.5) * 0.9);
    cottage(kit, rng, w, h, d, 1);
    kit.o();
  }

  // the inn — two storeys, a swinging sign, benches, barrels
  if (T >= 3) {
    const p = pl.place(rng, 4.2, R * 0.22, R * 0.5, 40, 1.0);
    if (p) {
      const yaw = faceIn(p.x, p.z) + (rng() - 0.5) * 0.4;
      kit.p().t(p.x, 0, p.z).ry(yaw);
      cottage(kit, rng, 5.6, 4.0, 4.4, 2);
      // sign
      m.colj(PAL.timber, rng, 0.1);
      kit.p().t(-3.6, 0, -2.4);
      m.box(0.18, 3.1, 0.18, F_NOBASE);
      kit.p().t(0.55, 2.95, 0); m.box(1.2, 0.14, 0.14, F_ALL); kit.o();
      kit.p().t(1.0, 2.86, 0);
      m.colj(PAL.doorGreen, rng, 0.1); m.box(0.9, 0.7, 0.06, F_ALL);
      m.col(PAL.brass, 0.9); kit.p().t(0, 0, -0.05); m.box(0.7, 0.5, 0.02, F_ALL); kit.o();
      kit.o();
      kit.lantern(0.4, 3.0, -0.3, PAL.hearth);
      kit.o();
      // benches and barrels outside
      for (let i = 0; i < 3; i++) {
        kit.p().t(-1.6 + i * 1.7, 0.44, -3.3).ry(rng() * 0.5);
        m.colj(PAL.timber, rng, 0.14);
        m.box(1.5, 0.1, 0.42, F_ALL);
        for (let s = -1; s <= 1; s += 2) { kit.p().t(s * 0.6, -0.44, 0); m.box(0.12, 0.44, 0.34, FZ | FNZ | FX | FNX); kit.o(); }
        kit.o();
      }
      for (let i = 0; i < 2; i++) {
        kit.p().t(2.5 + i * 0.95, 0, -2.7 + rng() * 0.6).ry(rng());
        m.colj(PAL.darkTimber, rng, 0.14);
        m.cyl(0.42, 0.42, 0.95, 8, { smooth: false, capTop: true });
        kit.o();
      }
      kit.o();
    }
  }

  // the mill — tower, cap, turning sails
  if (T >= 2) {
    const p = pl.place(rng, 3.4, R * 0.55, R * 0.95, 44, 1.4);
    if (p) {
      const yaw = faceOut(p.x, p.z);
      kit.p().t(p.x, 0, p.z).ry(yaw);
      m.colj(PAL.rock, rng, 0.1);
      m.frustum(4.4, 0.4, 4.4, 4.2, 4.2, 0, 0);
      m.colj(PAL.whitewash, rng, 0.06);
      m.cyl(2.0, 1.5, 7.2, 10, { smooth: true });
      m.colj(PAL.rock, rng, 0.12);
      kit.p().t(0, 2.6, 0); m.cyl(1.82, 1.78, 0.3, 10, { smooth: false }); kit.o();
      kit.p().t(0, 7.2, 0);
      m.colj(PAL.thatch, rng, 0.1);
      m.cone(1.85, 2.0, 10, 1.5, 2);
      kit.o();
      const millR = (y) => 2.0 - (y / 7.2) * 0.5;
      m.colj(rng() < 0.5 ? PAL.doorGreen : PAL.doorRed, rng, 0.1);
      kit.p().t(0, 0, -millR(0.8) - 0.03); m.panelZ(0.9, 1.7, -1); kit.o();
      kit.p().t(0, 0, -millR(3.6)); windows(kit, 1, 0.62, 0.62, 3.4, 0, PAL.hearth, 1); kit.o();
      kit.p().t(0, 0, -millR(5.6)); windows(kit, 1, 0.5, 0.5, 5.4, 0, PAL.hearth, 0); kit.o();
      // sails on the -Z face, spinning about Z
      const sails = extraMesh(kit, 'mill-sails', 'matte', (ms, xf) => {
        ms.col(PAL.iron, 0.9);
        xf.push().rotateX(Math.PI / 2);
        ms.cyl(0.26, 0.2, 0.7, 7, { smooth: false, capTop: true });
        xf.pop();
        for (let k = 0; k < 4; k++) {
          xf.push().rotateZ((k / 4) * TAU);
          ms.colj(PAL.timber, rng, 0.12);
          xf.push().translate(0, 0.55, 0);
          ms.box(0.17, 3.9, 0.14, F_ALL);
          xf.pop();
          for (let j = 0; j < 3; j++) {
            xf.push().translate(0.52, 1.15 + j * 1.05, 0);
            ms.colj(PAL.whitewash, rng, 0.1);
            ms.box(0.95, 0.13, 0.09, FZ | FNZ | FY | FNY);
            xf.pop();
          }
          xf.pop();
        }
      });
      const sx = Math.sin(yaw), sz = Math.cos(yaw);
      sails.position.set(p.x + sx * 1.85, 6.5, p.z - sz * 1.85);
      sails.rotation.y = yaw;
      kit.spin.push({ o: sails, rate: 0.55 });
      kit.o();
    }
  }

  // hedges along the lanes, gardens behind the houses, and the small stuff
  const nGarden = [1, 2, 3, 4, 5][T];
  for (let i = 0; i < nGarden; i++) {
    const w = 2.6 + rng() * 2.2, d = 2.2 + rng() * 1.8;
    const p = pl.place(rng, Math.max(w, d) * 0.7, R * 0.3, R, 30, 0.5);
    if (!p) continue;
    kit.p().t(p.x, 0, p.z).ry(rng() * TAU);
    garden(kit, rng, w, d);
    kit.o();
  }
  const hedgeRuns = [1, 2, 3, 4, 5][T];
  for (let i = 0; i < hedgeRuns; i++) {
    const a = rng() * TAU, d0 = R * (0.42 + rng() * 0.5), len = R * (0.4 + rng() * 0.5);
    const b = a + (rng() - 0.5) * 0.9;
    const pts = [
      [Math.cos(a) * d0, Math.sin(a) * d0],
      [Math.cos(a) * d0 + Math.cos(b + 1.57) * len * 0.6, Math.sin(a) * d0 + Math.sin(b + 1.57) * len * 0.6],
      [Math.cos(a) * d0 + Math.cos(b + 1.9) * len, Math.sin(a) * d0 + Math.sin(b + 1.9) * len],
    ];
    hedge(kit, rng, pts, 1.15, 0.85);
    pl.add(pts[1][0], pts[1][1], 0.7);
  }
  const nHive = [0, 2, 3, 3, 4][T];
  for (let i = 0; i < nHive; i++) {
    const p = pl.place(rng, 0.7, R * 0.4, R * 0.95, 20, 0.4);
    if (p) { kit.p().t(p.x, 0, p.z).ry(rng() * TAU); beehive(kit, rng); kit.o(); }
  }
  const nWash = [0, 1, 1, 2, 2][T];
  for (let i = 0; i < nWash; i++) {
    const p = pl.place(rng, 2.2, R * 0.35, R * 0.9, 24, 0.6);
    if (p) { kit.p().t(p.x, 0, p.z).ry(rng() * TAU); washingLine(kit, rng, 4.0); kit.o(); }
  }
  const nHay = [1, 1, 2, 2, 3][T];
  for (let i = 0; i < nHay; i++) {
    const p = pl.place(rng, 1.3, R * 0.45, R, 20, 0.5);
    if (p) { kit.p().t(p.x, 0, p.z); haystack(kit, rng); kit.o(); }
  }
  const nTree = [1, 2, 4, 5, 6][T];
  for (let i = 0; i < nTree; i++) {
    const p = pl.place(rng, 1.6, R * 0.3, R, 24, 0.4);
    if (p) {
      kit.p().t(p.x, 0, p.z);
      tree(kit, rng, 4.5 + rng() * 3, { clumps: 3, canopy: PAL.canopy, dark: PAL.floor });
      kit.o();
    }
  }
  if (T >= 1) {
    const p = pl.place(rng, 0.6, R * 0.14, R * 0.3, 20, 0.4);
    if (p) { kit.p().t(p.x, 0, p.z); signpost(kit, rng, T >= 3 ? 3 : 2); kit.o(); }
  }
  // the well
  if (T >= 1) {
    const p = pl.place(rng, 1.3, R * 0.16, R * 0.4, 24, 0.5);
    if (p) {
      kit.p().t(p.x, 0, p.z).ry(rng() * TAU);
      m.colj(PAL.rock, rng, 0.14);
      m.cyl(0.85, 0.8, 0.75, 9, { smooth: false });
      m.col(PAL.voidDark);
      kit.p().t(0, 0.75, 0); m.discY(0.79, 9); kit.o();
      m.colj(PAL.timber, rng, 0.12);
      for (let s = -1; s <= 1; s += 2) { kit.p().t(s * 0.75, 0.7, 0); m.box(0.13, 1.5, 0.13, F_NOBASE); kit.o(); }
      kit.p().t(0, 2.2, 0);
      m.colj(PAL.thatch, rng, 0.1);
      m.gable(1.9, 0.55, 1.3, 0.15, 0);
      kit.o();
      kit.o();
    }
  }
  // market stalls at the great-city tier: halflings do not build walls, they
  // build more market
  if (T >= 4) {
    for (let i = 0; i < 3; i++) {
      const p = pl.place(rng, 1.5, R * 0.26, R * 0.5, 30, 0.5);
      if (!p) continue;
      kit.p().t(p.x, 0, p.z).ry(rng() * TAU);
      m.colj(PAL.timber, rng, 0.12);
      for (let s = 0; s < 4; s++) {
        kit.p().t((s < 2 ? -1 : 1) * 1.1, 0, (s % 2 ? -1 : 1) * 0.75);
        m.box(0.11, 2.0, 0.11, F_NOBASE);
        kit.o();
      }
      kit.p().t(0, 1.98, 0);
      m.box(2.4, 0.09, 0.09, F_ALL);
      kit.cloth.col(i % 2 ? PAL.doorRed : PAL.whitewash, 1);
      kit.cloth.sway = 0.22;
      kit.cloth.quad(-1.2, 0.0, -0.85, 1.2, 0.0, -0.85, 1.2, -0.28, 0.95, -1.2, -0.28, 0.95);
      kit.cloth.sway = 0;
      kit.o();
      kit.p().t(0, 0.85, 0.1);
      m.colj(PAL.darkTimber, rng, 0.12); m.box(2.2, 0.12, 1.0, F_ALL);
      kit.o();
      kit.o();
    }
  }
}

// ==========================================================================
// DELVE — Dwarves. The gate IS the building. Axial, formal, granite and
// brass, ore tips, a smelter with a glowing door, geometric terraces.
// ==========================================================================

function chevronBand(kit, rng, len, n, r) {
  const m = kit.matte;
  m.colj(PAL.granite, rng, 0.1);
  for (let i = 0; i < n; i++) {
    kit.p().t(-len * 0.5 + (len / n) * (i + 0.5), 0, 0).rx(-Math.PI / 2).ry(Math.PI * 0.25);
    m.spike(r, r * 1.15, 4);
    kit.o();
  }
}

/** monumental carved gate. Faces -Z. Returns its height. */
function dwarfGate(kit, rng, w, h, hero) {
  const m = kit.matte, mt = kit.metal, g = kit.glow;
  const deep = w * 0.55;
  // battered facade cut back into the rock
  m.colj(PAL.granite, rng, 0.1);
  m.frustum(w * 1.62, h, deep, w * 1.42, deep * 0.82, 0, deep * 0.09);
  // course lines: three string bands
  for (let i = 1; i <= 3; i++) {
    m.colj(PAL.granite, rng, 0.22);
    kit.p().t(0, h * (i / 4), -0.02);
    m.frustum(w * (1.62 - 0.05 * i), 0.22, deep, w * (1.62 - 0.05 * i), deep, 0, 0, FNZ | FX | FNX | FY);
    kit.o();
  }
  const ow = w * 0.44, oh = h * 0.56;
  // the mouth: recessed void with a pointed head
  kit.p().t(0, 0, -deep * 0.5 + 0.85);
  m.col(PAL.voidDark);
  m.panelZ(ow, oh, -1);
  m.tri(ow * 0.5, oh, 0, -ow * 0.5, oh, 0, 0, oh + ow * 0.44, 0);
  kit.o();
  // jambs
  const jw = w * 0.19;
  for (let s = -1; s <= 1; s += 2) {
    kit.p().t(s * (ow * 0.5 + jw * 0.5), 0, -deep * 0.5 + 0.2);
    m.colj(PAL.granite, rng, 0.08);
    m.frustum(jw, oh * 1.06, jw * 0.9, jw * 0.88, jw * 0.9, 0, 0);
    mt.colj(PAL.brass, rng, 0.1);
    kit.p().t(0, oh * 1.06, 0);
    mt.frustum(jw * 1.15, jw * 0.3, jw * 1.05, jw * 0.95, jw * 0.9, 0, 0, F_ALL);
    kit.o();
    kit.o();
  }
  // stepped lintel over the head, each slab wider than the last
  for (let i = 0; i < 3; i++) {
    kit.p().t(0, oh * 1.06 + jw * 0.3 + i * (h * 0.075), -deep * 0.5 + 0.2 - i * 0.16);
    m.colj(PAL.granite, rng, 0.12);
    m.box(ow + jw * 2 + i * w * 0.13, h * 0.075, jw * (0.9 + i * 0.25), F_ALL);
    kit.o();
  }
  // dwarf-runes, lit from within the stone
  g.col(PAL.ember, 0.85);
  const runeY = oh * 1.06 + jw * 0.3 + h * 0.115;
  for (let i = 0; i < 5; i++) {
    kit.p().t(-ow * 0.5 + (ow / 4) * i, runeY, -deep * 0.5 - 0.1);
    g.panelZ(0.16, 0.34, -1);
    kit.o();
  }
  kit.lantern(0, runeY + 0.2, -deep * 0.5 - 0.4, PAL.ember);
  chevronBand(kit, rng, ow + jw * 1.6, hero ? 9 : 6, w * 0.035);
  kit.p().t(0, oh + ow * 0.5 + h * 0.02, -deep * 0.5 + 0.05);
  chevronBand(kit, rng, ow + jw * 1.5, hero ? 9 : 6, w * 0.035);
  kit.o();
  // brass gates, ajar, light in the crack
  mt.colj(PAL.brass, rng, 0.12);
  for (let s = -1; s <= 1; s += 2) {
    kit.p().t(s * ow * 0.25, 0, -deep * 0.5 + 1.0).ry(s * 0.16);
    mt.box(ow * 0.47, oh * 0.92, 0.16, F_ALL);
    kit.o();
  }
  g.col(PAL.ember, 0.75);
  kit.p().t(0, 0, -deep * 0.5 + 0.98); g.panelZ(0.22, oh * 0.9, -1); kit.o();
  kit.lantern(0, oh * 0.4, -deep * 0.5 - 0.6, PAL.ember);
  // steps down to the level of the delve
  kit.p().t(0, 0, -deep * 0.5 - 0.1);
  m.colj(PAL.granite, rng, 0.14);
  m.steps(w * 1.05, 5, 0.3, 0.62);
  kit.o();
  return h;
}

function delveBlock(kit, rng, w, h, d, lit) {
  const m = kit.matte;
  m.colj(PAL.granite, rng, 0.14);
  m.frustum(w, h, d, w * 0.9, d * 0.9, 0, 0);
  m.colj(PAL.granite, rng, 0.2);
  kit.p().t(0, h, 0);
  m.frustum(w * 0.97, 0.3, d * 0.97, w, d, 0, 0, F_ALL);
  kit.o();
  if (lit) {
    kit.p().t(0, 0, -d * 0.45);
    m.col(PAL.voidDark);
    kit.p().t(0, h * 0.34, -0.02); m.panelZ(w * 0.3, h * 0.3, -1); kit.o();
    windows(kit, 2, w * 0.1, h * 0.2, h * 0.4, w * 0.42, PAL.ember, 2);
    kit.o();
  }
}

function oreTip(kit, rng, r, h) {
  const m = kit.matte;
  m.colj(PAL.coal, rng, 0.3);
  m.cone(r, h, 7, 0.6, 2);
  m.colj(PAL.slag, rng, 0.3);
  kit.p().t(r * 0.3, 0, -r * 0.4); m.dome(r * 0.5, h * 0.22, r * 0.45, 6, 1); kit.o();
}

function smelter(kit, rng, s) {
  const m = kit.matte, mt = kit.metal;
  m.colj(PAL.granite, rng, 0.12);
  m.frustum(4.6 * s, 3.2 * s, 3.8 * s, 3.4 * s, 2.8 * s, 0, 0);
  // chimney
  kit.p().t(1.1 * s, 3.2 * s, 0.6 * s);
  m.colj(PAL.granite, rng, 0.16);
  m.frustum(1.35 * s, 5.4 * s, 1.35 * s, 1.05 * s, 1.05 * s, 0, 0);
  mt.colj(PAL.brass, rng, 0.1);
  for (let i = 0; i < 3; i++) {
    kit.p().t(0, 5.4 * s * (0.3 + i * 0.28), 0);
    mt.frustum(1.4 * s, 0.18 * s, 1.4 * s, 1.32 * s, 1.32 * s, 0, 0, F_ALL);
    kit.o();
  }
  kit.glow.col(PAL.ember, 0.7);
  kit.p().t(0, 5.42 * s, 0); kit.glow.discY(0.9 * s, 7); kit.o();
  kit.lantern(0, 5.6 * s, 0, PAL.ember);
  kit.o();
  // the glowing door and the light it throws on the ground
  kit.p().t(-0.8 * s, 0, -1.9 * s);
  m.col(PAL.voidDark);
  kit.p().t(0, 0, -0.03); m.panelZ(1.5 * s, 1.7 * s, -1); kit.o();
  kit.glow.col(PAL.ember);
  kit.p().t(0, 0.1 * s, -0.06); kit.glow.panelZ(1.15 * s, 1.4 * s, -1); kit.o();
  spill(kit, 3.2 * s, 3.6 * s, PAL.ember, 0.28);
  kit.lantern(0, 1.0 * s, -0.7 * s, PAL.ember);
  kit.o();
  // brass pipework
  mt.colj(PAL.brass, rng, 0.12);
  kit.p().t(-2.3 * s, 1.4 * s, 1.3 * s).rz(-Math.PI / 2);
  mt.cyl(0.22 * s, 0.22 * s, 3.6 * s, 6, { smooth: true });
  kit.o();
}

function bDelve(kit, rng, T, R, pl) {
  const m = kit.matte, mt = kit.metal;
  const gw = 6.6 + T * 2.3, gh = 7.4 + T * 2.7;
  const gz = R * 0.42;

  // the mountainside the gate is cut into
  m.colj(PAL.cliff, rng, 0.14);
  kit.p().t(0, 0, gz + gw * 0.36);
  m.frustum(gw * 2.5, gh * 1.24, gw * 0.9, gw * 1.7, gw * 0.5, 0, gw * 0.16);
  kit.o();
  for (let i = 0; i < 3; i++) {
    const sx = (i - 1) * gw * 0.95;
    m.colj(i === 1 ? PAL.rock : PAL.cliff, rng, 0.2);
    kit.p().t(sx, 0, gz + gw * (0.7 + rng() * 0.35)).ry((rng() - 0.5) * 0.5);
    m.frustum(gw * (0.8 + rng() * 0.5), gh * (0.75 + rng() * 0.6), gw * 0.8,
      gw * 0.45, gw * 0.4, (rng() - 0.5) * gw * 0.2, 0);
    kit.o();
  }
  pl.add(0, gz, gw * 0.95);

  // the great gate
  kit.p().t(0, 0, gz);
  dwarfGate(kit, rng, gw, gh, true);
  kit.o();
  // lesser gates flanking, added as the delve prospers
  if (T >= 3) {
    for (let s = -1; s <= 1; s += 2) {
      if (T === 3 && s < 0) continue;
      kit.p().t(s * gw * 1.15, 0, gz + gw * 0.12).ry(s * 0.22);
      dwarfGate(kit, rng, gw * 0.5, gh * 0.55, false);
      kit.o();
      pl.add(s * gw * 1.15, gz, gw * 0.5);
    }
  }

  // the processional way, and pillars along it
  m.colj(PAL.scree, rng, 0.1);
  kit.p().t(0, 0.05, 0);
  m.ribbon([[0, gz - gw * 0.6], [0, -R * 0.9]], gw * 0.62, 0);
  kit.o();
  const nPil = [2, 3, 4, 5, 6][T];
  for (let i = 0; i < nPil; i++) {
    const z = gz - gw * 0.9 - i * (R * 1.05 / (nPil + 1));
    for (let s = -1; s <= 1; s += 2) {
      const x = s * (gw * 0.52 + 1.1);
      kit.p().t(x, 0, z);
      m.colj(PAL.granite, rng, 0.12);
      m.frustum(1.5, 0.4, 1.5, 1.35, 1.35, 0, 0);
      kit.p().t(0, 0.4, 0);
      m.frustum(1.1, 2.6 + (i % 2) * 0.4, 1.1, 0.95, 0.95, 0, 0);
      mt.colj(PAL.brass, rng, 0.1);
      kit.p().t(0, 2.6 + (i % 2) * 0.4, 0);
      mt.frustum(1.25, 0.32, 1.25, 1.0, 1.0, 0, 0, F_ALL);
      kit.o();
      kit.o();
      kit.o();
      pl.add(x, z, 1.0);
    }
  }

  // terraces, and squat blocks on them in symmetric pairs
  const nT = [1, 2, 2, 3, 3][T];
  for (let i = 0; i < nT; i++) {
    const z = gz - gw * 1.1 - i * (R * 0.42);
    const w = R * (1.5 - i * 0.12), hh = 0.9 - i * 0.22;
    m.colj(PAL.granite, rng, 0.1);
    kit.p().t(0, 0, z);
    m.frustum(w, Math.max(0.3, hh), R * 0.34, w * 0.98, R * 0.32, 0, 0);
    kit.o();
  }
  const nBlock = [2, 4, 6, 8, 10][T];
  const nRow = Math.max(1, Math.ceil(nBlock / 2));
  for (let i = 0; i < nBlock; i++) {
    const s = i % 2 ? 1 : -1, row = Math.floor(i / 2);
    const x = s * (gw * 0.55 + 3.4 + (row % 2) * 1.2);
    const z0 = gz - gw * 1.15, z1 = -R * 0.82;
    const z = nRow > 1 ? z0 + (z1 - z0) * (row / (nRow - 1)) : z0;
    const w = 3.4 + (row % 2) * 0.8, d = 3.0 + ((row + 1) % 2) * 0.7;
    if (!pl.free(x, z, Math.max(w, d) * 0.6)) continue;
    pl.add(x, z, Math.max(w, d) * 0.6);
    kit.p().t(x, 0, z).ry(s > 0 ? -Math.PI / 2 : Math.PI / 2);
    delveBlock(kit, rng, w, 2.6 + (row % 3) * 0.9, d, true);
    kit.o();
  }

  // industry
  const sm = pl.place(rng, 3.6, R * 0.42, R * 0.8, 40, 1.0);
  if (sm) {
    kit.p().t(sm.x, 0, sm.z).ry(faceIn(sm.x, sm.z));
    smelter(kit, rng, T >= 3 ? 1.15 : 0.9);
    kit.o();
  }
  const nTip = [1, 1, 2, 2, 3][T];
  for (let i = 0; i < nTip; i++) {
    const p = pl.place(rng, 2.8, R * 0.5, R, 30, 0.6);
    if (!p) continue;
    kit.p().t(p.x, 0, p.z);
    oreTip(kit, rng, 2.5 + rng() * 0.9, 2.2 + rng() * 1.0);
    kit.o();
  }
  // winding gear over a shaft
  if (T >= 2) {
    const p = pl.place(rng, 2.6, R * 0.45, R * 0.85, 34, 0.8);
    if (p) {
      kit.p().t(p.x, 0, p.z).ry(rng() * TAU);
      m.colj(PAL.granite, rng, 0.1);
      m.frustum(3.4, 0.5, 3.4, 3.2, 3.2, 0, 0);
      m.colj(PAL.darkTimber, rng, 0.14);
      for (let k = 0; k < 4; k++) {
        const sx = k < 2 ? -1 : 1, sz = k % 2 ? -1 : 1;
        kit.p().t(sx * 1.25, 0.5, sz * 1.25);
        m.frustum(0.3, 5.2, 0.3, 0.26, 0.26, -sx * 0.7, -sz * 0.7);
        kit.o();
      }
      kit.p().t(0, 4.4, 0);
      m.box(2.0, 0.28, 2.0, F_ALL);
      mt.colj(PAL.brass, rng, 0.1);
      kit.p().t(0, 0.9, 0).rx(Math.PI / 2);
      mt.cyl(1.15, 1.15, 0.3, 10, { smooth: false, capTop: true, capBot: true });
      kit.o();
      kit.o();
      kit.o();
    }
  }
  // the great brazier on the gate steps, and a statue of somebody important
  if (T >= 3) {
    kit.p().t(-gw * 0.45, 0, gz - gw * 0.95);
    brazier(kit, rng, 1.25, 1.9, PAL.brass, PAL.ember);
    kit.o();
    kit.p().t(gw * 0.45, 0, gz - gw * 0.95);
    brazier(kit, rng, 1.25, 1.9, PAL.brass, PAL.ember);
    kit.o();
  }
  if (T >= 4) {
    const p = pl.place(rng, 1.8, R * 0.28, R * 0.5, 30, 0.8);
    if (p) {
      kit.p().t(p.x, 0, p.z).ry(faceOut(p.x, p.z));
      m.colj(PAL.granite, rng, 0.1);
      m.frustum(2.6, 1.1, 2.6, 2.2, 2.2, 0, 0);
      kit.p().t(0, 1.1, 0);
      m.colj(PAL.rock, rng, 0.1);
      m.box(1.6, 1.3, 1.0, F_NOBASE);          // legs and kilt
      kit.p().t(0, 1.3, 0);
      m.frustum(2.0, 1.7, 1.3, 1.7, 1.1, 0, 0); // torso
      m.colj(PAL.scree, rng, 0.1);
      kit.p().t(0, 0.35, -0.62); m.frustum(1.3, 1.25, 0.5, 0.7, 0.3, 0, -0.2); kit.o(); // beard
      kit.p().t(0, 1.7, 0);
      m.colj(PAL.rock, rng, 0.08); m.box(0.85, 0.6, 0.85, F_NOBASE);
      mt.colj(PAL.brass, rng, 0.1);
      kit.p().t(0, 0.6, 0); mt.cone(0.62, 0.5, 6, 0, 1); kit.o();
      kit.o();
      kit.o();
      mt.colj(PAL.brass, rng, 0.12);
      kit.p().t(1.15, 0.2, -0.2); mt.box(0.16, 2.6, 0.16, F_ALL);
      kit.p().t(0, 2.3, 0); mt.frustum(0.9, 0.7, 0.22, 0.45, 0.22, -0.3, 0, F_ALL); kit.o();
      kit.o();
      kit.o();
      kit.o();
    }
  }
}

// ==========================================================================
// HAVEN — Elves. Tall, thin, vertical. Slender towers with narrow flared
// roofs, walkways between them, built around the trees rather than clearing
// them. Nothing in rows, nothing symmetrical, nothing repeated.
// ==========================================================================

/** slender tower. Returns the eaves height, for hanging walkways off. */
function elfTower(kit, rng, r, h, seg) {
  const m = kit.matte, mt = kit.metal, s = seg || 7;
  m.colj(PAL.silver, rng, 0.07);
  m.cyl(r * 1.22, r * 1.12, 0.6, s, { smooth: false, capTop: true });
  m.colj(PAL.birch, rng, 0.05);
  kit.p().t(0, 0.6, 0);
  m.cyl(r, r * 0.76, h, s, { smooth: true });
  // string courses, at heights that are not multiples of each other
  for (let i = 0; i < 2; i++) {
    const y = h * (0.34 + i * 0.33);
    m.colj(PAL.silver, rng, 0.08);
    kit.p().t(0, y, 0);
    m.cyl(r * 1.06 - i * r * 0.06, r * 1.04 - i * r * 0.06, 0.18, s, { smooth: false });
    kit.o();
  }
  // one balcony, never at the same height twice
  if (h > 8) {
    const by = h * (0.52 + rng() * 0.16);
    const br = r * 1.55;
    m.colj(PAL.birch, rng, 0.06);
    kit.p().t(0, by, 0);
    m.cyl(br, br, 0.16, s, { smooth: false, capTop: true });
    m.colj(PAL.silver, rng, 0.08);
    kit.p().t(0, 0.62, 0); m.cyl(br * 0.97, br * 0.97, 0.09, s, { smooth: false }); kit.o();
    kit.o();
  }
  // lancet windows, scattered up the shaft on different faces
  const nw = 2 + Math.floor(h / 9);
  for (let i = 0; i < nw; i++) {
    const y = h * (0.2 + 0.62 * (i / Math.max(1, nw - 1))) + rng() * 0.6;
    const rr = r - (r * 0.24) * (y / h);
    kit.p().ry(rng() * TAU).t(0, 0, -rr - 0.02);
    windows(kit, 1, r * 0.42, r * 1.3, y, 0, PAL.cold, i === 0 ? 1 : 0);
    kit.o();
  }
  // narrow flared roof and a long finial
  kit.p().t(0, h, 0);
  mt.colj(PAL.verdigris, rng, 0.09);
  mt.cone(r * 1.36, r * 2.5, s, 2.3, 3);
  m.col(PAL.silver, 1.04);
  kit.p().t(0, r * 2.5, 0);
  m.cyl(r * 0.09, r * 0.01, r * 1.5, 4, { smooth: false });
  kit.o();
  kit.o();
  kit.o();
  return h * 0.55 + 0.6;
}

/** a flet: platform and a small house high in a tree */
function flet(kit, rng, th) {
  const m = kit.matte, mt = kit.metal;
  tree(kit, rng, th, { clumps: 4, canopy: PAL.canopy, dark: PAL.floor, trunk: 0.07 });
  const py = th * 0.5;
  m.colj(PAL.birch, rng, 0.07);
  kit.p().t(0, py, 0);
  m.cyl(th * 0.17, th * 0.17, 0.18, 9, { smooth: false, capTop: true });
  m.colj(PAL.silver, rng, 0.08);
  kit.p().t(0, 0.6, 0); m.cyl(th * 0.166, th * 0.166, 0.08, 9, { smooth: false }); kit.o();
  // the little house, off to one side of the trunk
  kit.p().t(th * 0.07, 0.18, -th * 0.05).ry(rng() * TAU);
  m.colj(PAL.birch, rng, 0.05);
  m.cyl(th * 0.085, th * 0.075, th * 0.14, 6, { smooth: true });
  kit.p().t(0, th * 0.14, 0);
  mt.colj(PAL.verdigris, rng, 0.08);
  mt.cone(th * 0.115, th * 0.14, 6, 2.2, 2);
  kit.o();
  kit.p().t(0, 0, -th * 0.078);
  windows(kit, 1, th * 0.035, th * 0.06, th * 0.05, 0, PAL.cold, 1);
  kit.o();
  kit.o();
  kit.o();
  // a hanging lantern under the platform
  m.col(PAL.silver, 0.9);
  kit.p().t(th * 0.13, py - 0.5, th * 0.05);
  m.box(0.05, 0.5, 0.05, F_ALL);
  kit.glow.col(PAL.hearth, 0.95);
  kit.p().t(0, -0.28, 0); kit.glow.blob(0.17, 0.34, 0.17, rng, 0.05); kit.o();
  kit.lantern(0, -0.28, 0, PAL.hearth);
  kit.o();
  // a stair spiralling the trunk
  m.colj(PAL.birch, rng, 0.1);
  for (let i = 0; i < 7; i++) {
    kit.p().ry((i / 7) * TAU * 1.5).t(th * 0.09, py * (0.18 + 0.8 * (i / 7)), 0);
    m.box(th * 0.09, 0.09, th * 0.05, F_ALL);
    kit.o();
  }
  return py;
}

/** slender walkway with a sag, hung between two towers */
function walkway(kit, rng, ax, az, ay, bx, bz, by, w) {
  const m = kit.matte;
  const n = 4, sag = Math.hypot(bx - ax, bz - az) * 0.055;
  const pt = (t) => [ax + (bx - ax) * t, ay + (by - ay) * t - Math.sin(t * Math.PI) * sag, az + (bz - az) * t];
  m.colj(PAL.birch, rng, 0.07);
  for (let i = 0; i < n; i++) {
    const A = pt(i / n), B = pt((i + 1) / n);
    let dx = B[0] - A[0], dy = B[1] - A[1], dz = B[2] - A[2];
    const len = Math.hypot(dx, dy, dz), yaw = along(dx, dz);
    kit.p().t(A[0], A[1], A[2]).ry(yaw).rz(Math.atan2(dy, Math.hypot(dx, dz)));
    kit.p().t(len * 0.5, 0, 0);
    m.box(len + 0.04, 0.11, w, FY | FNY | FZ | FNZ);
    for (let s = -1; s <= 1; s += 2) {
      kit.p().t(0, 0.52, s * w * 0.5);
      m.col(PAL.silver, 0.95 + rng() * 0.06);
      m.box(len + 0.04, 0.07, 0.07, F_ALL);
      kit.o();
    }
    kit.o();
    kit.o();
  }
}

function elfBoat(kit, rng, len) {
  const m = kit.matte, mt = kit.metal, w = len * 0.26;
  m.colj(PAL.birch, rng, 0.06);
  // hull: deck lens plus sloping sides down to a keel line
  const pts = [[len * 0.5, 0], [len * 0.16, w], [-len * 0.24, w * 0.9], [-len * 0.5, 0],
    [-len * 0.24, -w * 0.9], [len * 0.16, -w]];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    m.tri(0, 0.34, 0, b[0], 0.34, b[1], a[0], 0.34, a[1]);
    m.colj(PAL.silver, rng, 0.08);
    m.quad(a[0], 0.34, a[1], b[0], 0.34, b[1], b[0] * 0.55, -0.1, b[1] * 0.2, a[0] * 0.55, -0.1, a[1] * 0.2);
    m.colj(PAL.birch, rng, 0.06);
  }
  // a raised prow and a mast
  m.colj(PAL.silver, rng, 0.07);
  kit.p().t(len * 0.5, 0.3, 0).rz(0.5);
  m.cyl(w * 0.2, 0.02, len * 0.24, 5, { smooth: false });
  kit.o();
  mt.colj(PAL.verdigris, rng, 0.1);
  kit.p().t(-len * 0.05, 0.34, 0);
  mt.cyl(0.09, 0.05, len * 0.75, 5, { smooth: false });
  kit.o();
}

function bHaven(kit, rng, T, R, pl) {
  const m = kit.matte, mt = kit.metal;
  const nTower = [2, 3, 5, 7, 9][T];
  const nTree = [3, 4, 6, 8, 10][T];
  const nFlet = [1, 1, 2, 3, 4][T];
  const towers = [];

  // glades of pale grass, not cleared ground
  for (let i = 0; i < 2 + T; i++) {
    const a = rng() * TAU, d = R * (0.2 + rng() * 0.6);
    m.mix(PAL.grass, PAL.grassHi, 0.5 + rng() * 0.5, 1.02);
    kit.p().t(Math.cos(a) * d, 0.03, Math.sin(a) * d).ry(rng() * TAU);
    m.discY(R * (0.16 + rng() * 0.16), 8, rng());
    kit.o();
  }

  // the spire first, so the towers arrange themselves around it
  if (T >= 3) {
    const sh = 25 + T * 3.5;
    pl.add(0, 0, 3.4);
    kit.p().t(0, 0, 0);
    const r = 2.5;
    m.colj(PAL.silver, rng, 0.07);
    m.cyl(r * 1.5, r * 1.3, 1.1, 9, { smooth: false });
    kit.p().t(0, 1.1, 0);
    m.colj(PAL.birch, rng, 0.04);
    m.cyl(r, r * 0.52, sh, 9, { smooth: true });
    for (let i = 0; i < 3; i++) {
      const y = sh * (0.3 + i * 0.24), rr = r - (r * 0.48) * (y / sh);
      m.colj(PAL.silver, rng, 0.07);
      kit.p().t(0, y, 0);
      m.cyl(rr * 1.5, rr * 1.42, 0.2, 9, { smooth: false, capTop: true });
      mt.colj(PAL.verdigris, rng, 0.08);
      kit.p().t(0, 0.2, 0); mt.cone(rr * 1.62, rr * 1.5, 9, 2.4, 2); kit.o();
      kit.o();
      kit.p().ry(i * 2.1).t(0, 0, -rr - 0.02);
      windows(kit, 1, rr * 0.34, rr * 1.6, y + 1.2, 0, PAL.cold, 1);
      kit.o();
    }
    kit.p().t(0, sh, 0);
    mt.colj(PAL.verdigris, rng, 0.07);
    mt.cone(r * 0.78, r * 3.4, 9, 2.5, 3);
    m.col(PAL.silver, 1.05);
    kit.p().t(0, r * 3.4, 0);
    m.cyl(0.16, 0.02, r * 2.6, 4, { smooth: false });
    kit.glow.col(PAL.cold, 1.0);
    kit.p().t(0, r * 2.6, 0); kit.glow.blob(0.28, 0.5, 0.28, rng, 0.02); kit.o();
    kit.lantern(0, r * 2.6, 0, PAL.cold);
    kit.o();
    kit.o();
    kit.o();
    kit.o();
    towers.push({ x: 0, z: 0, y: sh * 0.72 });
  }

  // towers: irregular radii, irregular heights, never a pair alike
  for (let i = 0; i < nTower; i++) {
    const tall = rng() < 0.45;
    const h = tall ? 15 + rng() * 9 : 8 + rng() * 5;
    const r = 1.15 + rng() * 0.6 + (tall ? 0.35 : 0);
    const p = pl.place(rng, r * 1.7, R * (T >= 3 ? 0.28 : 0.12), R * 0.93, 44, 1.1);
    if (!p) continue;
    kit.p().t(p.x, 0, p.z).ry(rng() * TAU);
    const eaves = elfTower(kit, rng, r, h, rng() < 0.4 ? 6 : 7);
    kit.o();
    towers.push({ x: p.x, z: p.z, y: h * (0.5 + rng() * 0.22) + 0.6, r, eaves });
  }

  // walkways between towers that happen to stand near each other
  let links = 0;
  const maxLinks = [1, 2, 3, 4, 5][T];
  for (let i = 0; i < towers.length && links < maxLinks; i++) {
    for (let j = i + 1; j < towers.length && links < maxLinks; j++) {
      const a = towers[i], b = towers[j];
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d < 7 || d > 17) continue;
      walkway(kit, rng, a.x, a.z, a.y, b.x, b.z, b.y, 1.25);
      links++;
    }
  }

  // trees, some of them with a house in them
  for (let i = 0; i < nFlet; i++) {
    const th = 15 + rng() * 7;
    const p = pl.place(rng, 2.4, R * 0.25, R * 0.9, 40, 0.9);
    if (!p) continue;
    kit.p().t(p.x, 0, p.z).ry(rng() * TAU);
    flet(kit, rng, th);
    kit.o();
  }
  for (let i = 0; i < nTree; i++) {
    const p = pl.place(rng, 1.9, R * 0.16, R, 30, 0.2);
    if (!p) continue;
    kit.p().t(p.x, 0, p.z).ry(rng() * TAU);
    tree(kit, rng, 9 + rng() * 8, {
      clumps: 3 + (rng() < 0.4 ? 1 : 0), canopy: PAL.canopy, dark: PAL.floor, trunk: 0.05,
    });
    kit.o();
  }

  // pale paths, wandering between the towers
  m.colj(PAL.birch, rng, 0.05);
  kit.p().t(0, 0.04, 0);
  for (let i = 0; i < Math.min(towers.length, 4); i++) {
    const a = towers[i], b = towers[(i + 1) % towers.length];
    const mx = (a.x + b.x) * 0.5 + (rng() - 0.5) * 3, mz = (a.z + b.z) * 0.5 + (rng() - 0.5) * 3;
    m.ribbon([[a.x, a.z], [mx, mz], [b.x, b.z]], 1.15, 0);
  }
  kit.o();

  // the quay they built and resent building
  if (T >= 3) {
    const a0 = rng() * TAU, rq = R * 0.88, span = 1.1;
    const arc = [];
    for (let i = 0; i <= 7; i++) {
      const a = a0 - span * 0.5 + span * (i / 7);
      arc.push([Math.cos(a) * rq, Math.sin(a) * rq]);
    }
    m.colj(PAL.silver, rng, 0.07);
    kit.p().t(0, 0.16, 0); m.ribbon(arc, 3.4, 0); kit.o();
    m.colj(PAL.birch, rng, 0.06);
    kit.p().t(0, 0, 0); m.ribbon(arc, 3.6, 0); kit.o();
    for (let i = 1; i < 7; i += 2) {
      const p = arc[i];
      kit.p().t(p[0], 0.16, p[1]);
      m.colj(PAL.birch, rng, 0.06);
      m.stake(0.17, 1.5, 6, 0.12);
      mt.col(PAL.verdigris, 1);
      kit.p().t(0, 1.05, 0); mt.cyl(0.21, 0.21, 0.13, 6, { smooth: false }); kit.o();
      kit.o();
      pl.add(p[0], p[1], 0.6);
    }
    for (let i = 0; i < 2; i++) {
      const t = 1.5 + i * 3.5, p = arc[Math.min(6, Math.round(t))];
      const nx = p[0] / rq, nz = p[1] / rq;
      kit.p().t(p[0] + nx * 3.1, 0.05, p[1] + nz * 3.1).ry(along(-nz, nx));
      elfBoat(kit, rng, 6.5 + rng() * 2);
      kit.o();
    }
  }
}

// ==========================================================================
// BURG — Men. A square keep, a curtain wall with round corner towers, tiled
// roofs at varied angles inside, a gatehouse, banners. Grows by adding wall
// rings. Deliberately, restfully mundane next to the others.
// ==========================================================================

function burgTower(kit, rng, r, h, roof) {
  const m = kit.matte;
  m.colj(PAL.sandstone, rng, 0.1);
  m.cyl(r * 1.16, r * 1.04, h * 0.22, 8, { smooth: false });
  kit.p().t(0, h * 0.22, 0);
  m.colj(PAL.sandstone, rng, 0.09);
  m.cyl(r, r * 0.97, h * 0.78, 8, { smooth: false });
  kit.p().t(0, h * 0.78, 0);
  m.colj(PAL.sandstone, rng, 0.14);
  m.cyl(r * 1.14, r * 1.14, 0.34, 8, { smooth: false, capTop: !roof });
  if (roof) {
    kit.p().t(0, 0.34, 0);
    m.colj(PAL.slate, rng, 0.1);
    m.cone(r * 1.2, r * 2.1, 8, 0.35, 2);
    kit.o();
  }
  kit.o();
  kit.o();
}

/** one ring of curtain wall. Returns the gate midpoint for the road. */
function wallRing(kit, rng, R, h, thick, n, opts) {
  const m = kit.matte, o = opts || {};
  const verts = [];
  const a0 = o.phase === undefined ? 0.3 : o.phase;
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * TAU;
    const d = R * (0.95 + rng() * 0.1);
    verts.push([Math.cos(a) * d, Math.sin(a) * d]);
  }
  // the gate goes on whichever side faces most nearly south (-Z is north)
  let gi = 0, best = -1e9;
  for (let i = 0; i < n; i++) {
    const b = verts[(i + 1) % n];
    const mz = (verts[i][1] + b[1]) * 0.5;
    if (mz > best) { best = mz; gi = i; }
  }
  let gate = null;
  for (let i = 0; i < n; i++) {
    const a = verts[i], b = verts[(i + 1) % n];
    const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
    const cx = (a[0] + b[0]) * 0.5, cz = (a[1] + b[1]) * 0.5;
    const isGate = i === gi && o.gate;
    kit.p().t(cx, 0, cz).ry(along(dx, dz));
    if (isGate) {
      // wall either side of a gatehouse
      const gw = 4.2;
      for (let s = -1; s <= 1; s += 2) {
        const seg = (len - gw) * 0.5;
        kit.p().t(s * (gw + seg) * 0.5, 0, 0);
        m.colj(PAL.sandstone, rng, 0.1);
        m.frustum(seg, h, thick, seg, thick * 0.82, 0, 0);
        kit.p().t(0, h, 0);
        m.colj(PAL.sandstone, rng, 0.16);
        m.merlons(seg, thick * 0.9, h * 0.28, Math.max(2, Math.round(seg / 2.1)), true);
        kit.o();
        kit.o();
      }
      // gatehouse: two square towers, an arch, a portcullis, a banner
      m.colj(PAL.sandstone, rng, 0.08);
      m.frustum(gw, h * 1.42, thick * 1.5, gw, thick * 1.35, 0, 0, FX | FNX | FY | FZ | FNZ);
      m.col(PAL.voidDark);
      kit.p().t(0, 0, -thick * 0.76 - 0.02); m.panelZ(gw * 0.5, h * 0.62, -1);
      m.tri(gw * 0.25, h * 0.62, 0, -gw * 0.25, h * 0.62, 0, 0, h * 0.62 + gw * 0.25, 0);
      kit.o();
      m.col(PAL.iron, 0.95);
      for (let k = 0; k < 4; k++) {
        kit.p().t(-gw * 0.19 + k * (gw * 0.127), h * 0.2, -thick * 0.76 - 0.06);
        m.box(0.09, h * 0.42, 0.09, F_ALL);
        kit.o();
      }
      kit.lantern(0, h * 0.5, -thick * 0.9, PAL.hearth);
      kit.p().t(0, h * 1.42, 0);
      m.colj(PAL.sandstone, rng, 0.16);
      m.merlons(gw, thick * 1.4, h * 0.3, 3, false);
      kit.o();
      for (let s = -1; s <= 1; s += 2) {
        kit.p().t(s * (gw * 0.5 + 1.5), 0, 0);
        burgTower(kit, rng, 1.75, h * 1.2, true);
        kit.o();
      }
      // the King's colours over the gate
      kit.p().t(0, h * 1.3, -thick * 0.8);
      hangCloth(kit, 1.5, 2.6, PAL.banner, 1, 3);
      kit.o();
      gate = { x: cx, z: cz };
    } else {
      m.colj(PAL.sandstone, rng, 0.1);
      m.frustum(len, h, thick, len, thick * 0.82, 0, 0);
      kit.p().t(0, h, 0);
      m.colj(PAL.sandstone, rng, 0.16);
      m.merlons(len, thick * 0.9, h * 0.28, Math.max(2, Math.round(len / (o.coarse ? 3.2 : 2.1))), true);
      kit.o();
    }
    kit.o();
    if (!o.noTowers && (!o.alternate || i % 2 === 0)) {
      kit.p().t(a[0], 0, a[1]);
      burgTower(kit, rng, o.towerR || 1.7, h * 1.35, true);
      kit.o();
    }
  }
  return { gate, verts };
}

function burgHouse(kit, rng, w, h, d) {
  const m = kit.matte;
  m.colj(PAL.sandstone, rng, 0.12);
  m.frustum(w, h, d, w * 0.99, d * 0.99, 0, 0);
  if (rng() < 0.5) {
    m.colj(PAL.darkTimber, rng, 0.12);
    kit.p().t(0, h * 0.55, 0);
    m.frustum(w * 1.02, 0.14, d * 1.02, w * 1.02, d * 1.02, 0, 0);
    kit.o();
  }
  kit.p().t(0, h, 0);
  const tiled = rng() < 0.4;
  m.colj(tiled ? PAL.tile : PAL.slate, rng, 0.14);
  if (rng() < 0.75) m.gable(w, h * (0.55 + rng() * 0.3), d, 0.22, 0);
  else m.hip(w, h * (0.5 + rng() * 0.25), d, 0.4, 0.22);
  kit.o();
  kit.p().t(0, 0, -d * 0.5);
  m.colj(PAL.darkTimber, rng, 0.12);
  kit.p().t((rng() - 0.5) * w * 0.4, 0, -0.03); m.panelZ(0.75, 1.5, -1); kit.o();
  windows(kit, 2, 0.45, 0.55, h * 0.55, w * 0.5, PAL.hearth, rng() < 0.7 ? 2 : 0);
  kit.o();
  if (rng() < 0.6) {
    kit.p().t(w * 0.34, h, 0);
    m.colj(PAL.sandstone, rng, 0.1);
    m.frustum(0.5, h * 0.55 + 0.5, 0.5, 0.42, 0.42, 0, 0);
    kit.o();
  }
}

function bBurg(kit, rng, T, R, pl) {
  const m = kit.matte;
  const RINGS = [[], [0.84], [0.88], [0.54, 0.92], [0.42, 0.7, 0.96]][T];
  const rings = RINGS.length;
  const nHouse = [3, 5, 9, 15, 22][T];
  const hs = T === 0 ? 0.74 : 1;           // a hamlet's houses are cottages

  // wall rings, outermost first. The gate is on the outer circuit.
  let gate = null;
  const ringR = [];
  for (let i = rings - 1; i >= 0; i--) {
    const rr = R * RINGS[i];
    const h = 4.1 - i * 0.45;
    const res = wallRing(kit, rng, rr, h, 1.3 - i * 0.14, 6 + i, {
      gate: i === rings - 1, phase: 0.25 + i * 0.4, alternate: i > 0, coarse: i > 0,
      towerR: 1.75 - i * 0.22,
    });
    ringR.push(rr);
    if (res.gate) gate = res.gate;
    for (let k = 0; k < res.verts.length; k++) {
      const v = res.verts[k], u = res.verts[(k + 1) % res.verts.length];
      pl.add(v[0], v[1], 1.9);
      pl.add((v[0] + u[0]) * 0.5, (v[1] + u[1]) * 0.5, 1.3);
    }
  }
  // road in from the gate
  if (gate) {
    m.colj(PAL.plough, rng, 0.08);
    kit.p().t(0, 0.04, 0);
    m.ribbon([[gate.x * 1.35, gate.z * 1.35], [gate.x * 0.5, gate.z * 0.5], [0, 0]], 2.2, 0);
    kit.o();
  }

  // the keep
  if (T >= 1) {
    const kw = 5.6 + T * 0.55, kh = 5.4 + T * 1.5;
    pl.add(0, 0, kw * 0.95);
    kit.p().t(0, 0, 0).ry(0.12);
    m.colj(PAL.sandstone, rng, 0.08);
    m.frustum(kw * 1.14, 0.7, kw * 1.14, kw * 1.06, kw * 1.06, 0, 0);
    kit.p().t(0, 0.7, 0);
    m.colj(PAL.sandstone, rng, 0.07);
    m.frustum(kw, kh, kw * 0.92, kw * 0.94, kw * 0.87, 0, 0);
    // string course
    m.colj(PAL.sandstone, rng, 0.16);
    kit.p().t(0, kh * 0.56, 0);
    m.frustum(kw * 0.99, 0.22, kw * 0.91, kw * 1.0, kw * 0.92, 0, 0);
    kit.o();
    // windows, mostly arrow slits, a few real ones
    kit.p().t(0, 0, -kw * 0.46);
    windows(kit, 3, 0.22, 1.1, kh * 0.3, kw * 0.5, PAL.hearth, 3);
    windows(kit, 2, 0.4, 0.9, kh * 0.72, kw * 0.42, PAL.hearth, 2);
    kit.o();
    // parapet, crenellated, with corner turrets and a slate roof behind
    kit.p().t(0, kh, 0);
    m.colj(PAL.sandstone, rng, 0.12);
    m.frustum(kw * 1.12, 0.42, kw * 1.04, kw * 1.12, kw * 1.04, 0, 0);
    kit.p().t(0, 0.42, 0);
    for (let s = 0; s < 2; s++) {
      kit.p().ry(s * Math.PI * 0.5);
      m.colj(PAL.sandstone, rng, 0.16);
      for (let k = -1; k <= 1; k += 2) {
        kit.p().t(0, 0, k * (s ? kw * 0.52 : kw * 0.56));
        m.merlons(s ? kw * 0.94 : kw * 1.02, 0.4, 0.85, 4, true);
        kit.o();
      }
      kit.o();
    }
    kit.p().t(0, -0.1, 0);
    m.colj(PAL.slate, rng, 0.1);
    m.hip(kw * 0.86, kh * 0.34, kw * 0.78, 0.35, 0);
    kit.o();
    for (let k = 0; k < 4; k++) {
      const sx = k < 2 ? -1 : 1, sz = k % 2 ? -1 : 1;
      kit.p().t(sx * kw * 0.5, 0, sz * kw * 0.46);
      burgTower(kit, rng, 0.92, kh * 0.42, true);
      kit.o();
    }
    // the banner pole
    kit.p().t(kw * 0.2, kh * 0.34, 0);
    m.col(PAL.darkTimber, 1);
    m.box(0.16, 4.4, 0.16, F_ALL);
    kit.p().t(0.08, 4.1, 0);
    pennant(kit, 2.9, 1.5, PAL.banner);
    kit.o();
    kit.o();
    kit.o();
    kit.o();
    kit.o();
    kit.o();
  } else {
    // tier 0 is a hall and a paling, no keep at all
    kit.p().t(0, 0, 1.3).ry(0.2);
    m.colj(PAL.sandstone, rng, 0.09);
    m.frustum(5.9, 3.0, 3.9, 5.75, 3.8, 0, 0);
    kit.p().t(0, 3.0, 0);
    m.colj(PAL.slate, rng, 0.1);
    m.gable(5.9, 2.3, 3.9, 0.3, 0);
    kit.o();
    kit.p().t(0, 0, -1.95);
    m.colj(PAL.darkTimber, rng, 0.1);
    kit.p().t(0, 0, -0.03); m.panelZ(1.2, 2.0, -1); kit.o();
    windows(kit, 2, 0.4, 0.6, 1.8, 3.6, PAL.hearth, 2);
    kit.o();
    kit.p().t(2.2, 3.0, 0);
    m.colj(PAL.sandstone, rng, 0.1);
    m.frustum(0.7, 2.3, 0.7, 0.6, 0.6, 0, 0);
    kit.o();
    kit.o();
    pl.add(0, 1.3, 3.5);
    const pal = [];
    for (let i = 0; i <= 16; i++) {
      const a = (i / 16) * TAU;
      pal.push([Math.cos(a) * R * 0.85, Math.sin(a) * R * 0.85]);
    }
    m.colj(PAL.timber, rng, 0.14);
    for (let i = 0; i < pal.length - 1; i += 1) {
      if (i > 5 && i < 8) continue;
      kit.p().t(pal[i][0], 0, pal[i][1]);
      m.stake(0.19, 1.7 + rng() * 0.2, 4, 0.2);
      kit.o();
    }
  }

  // the church, and then houses jammed in wherever they will fit
  if (T >= 3) {
    const p = pl.place(rng, 5.2, R * 0.3, R * 0.6, 40, 0.8);
    if (p) {
      kit.p().t(p.x, 0, p.z).ry(faceIn(p.x, p.z) + Math.PI * 0.5);
      m.colj(PAL.sandstone, rng, 0.08);
      m.frustum(3.6, 4.2, 9.5, 3.5, 9.4, 0, 0);
      kit.p().t(0, 4.2, 0);
      m.colj(PAL.slate, rng, 0.09);
      m.gable(3.6, 3.4, 9.5, 0.3, 0);
      kit.o();
      kit.p().t(0, 0, -4.75);
      windows(kit, 3, 0.35, 1.7, 1.4, 2.4, PAL.hearth, 2);
      kit.o();
      kit.p().t(0, 0, 5.4);
      m.colj(PAL.sandstone, rng, 0.07);
      m.frustum(3.0, 9.0, 3.0, 2.7, 2.7, 0, 0);
      kit.p().t(0, 9.0, 0);
      m.colj(PAL.sandstone, rng, 0.14);
      m.frustum(3.3, 0.3, 3.3, 3.3, 3.3, 0, 0);
      kit.p().t(0, 0.3, 0);
      m.colj(PAL.slate, rng, 0.1);
      m.hip(3.0, 4.6, 3.0, 0, 0);
      kit.o();
      kit.o();
      kit.p().t(0, 0, -1.55);
      windows(kit, 1, 0.4, 1.0, 6.2, 0, PAL.hearth, 1);
      kit.o();
      kit.o();
      kit.o();
    }
  }
  // the ground the town can actually build on: the gaps between the rings
  const bands = [];
  {
    const asc = ringR.slice().sort((a, b) => a - b);
    let prev = (T >= 1 ? (5.6 + T * 0.55) * 0.8 + 1.7 : 5.4);
    for (const rr of asc) {
      if (rr - 1.7 > prev + 1.6) bands.push([prev, rr - 1.7]);
      prev = rr + 1.7;
    }
    bands.push([prev, R * 0.97]);
  }
  for (let i = 0; i < nHouse; i++) {
    const w = (2.6 + rng() * 1.8) * hs, d = (2.4 + rng() * 1.6) * hs, h = (2.4 + rng() * 2.2) * hs;
    const band = bands[i % bands.length];
    const p = pl.place(rng, Math.max(w, d) * 0.7, band[0], band[1], 36, 0.5);
    if (!p) continue;
    kit.p().t(p.x, 0, p.z).ry(faceIn(p.x, p.z) + (rng() - 0.5) * 1.0);
    burgHouse(kit, rng, w, h, d);
    kit.o();
  }
  // market square with a cross, and a few carts
  if (T >= 4) {
    const p = pl.place(rng, 3.6, R * 0.22, R * 0.45, 40, 0.6);
    if (p) {
      m.colj(PAL.scree, rng, 0.08);
      kit.p().t(p.x, 0.04, p.z); m.plate(7.0, 6.0);
      m.colj(PAL.sandstone, rng, 0.1);
      for (let s = 0; s < 3; s++) {
        kit.p().t(0, 0.02 + s * 0.22, 0);
        m.frustum(2.4 - s * 0.5, 0.22, 2.4 - s * 0.5, 2.3 - s * 0.5, 2.3 - s * 0.5, 0, 0);
        kit.o();
      }
      kit.p().t(0, 0.68, 0);
      m.frustum(0.6, 3.2, 0.6, 0.45, 0.45, 0, 0);
      kit.p().t(0, 3.2, 0); m.hip(1.0, 0.9, 1.0, 0, 0); kit.o();
      kit.o();
      kit.o();
      for (let i = 0; i < 3; i++) {
        kit.p().t(p.x + (rng() - 0.5) * 6, 0, p.z + (rng() - 0.5) * 5).ry(rng() * TAU);
        m.colj(PAL.timber, rng, 0.14);
        kit.p().t(0, 0.62, 0);
        m.box(2.1, 0.22, 1.1, F_ALL);
        kit.o();
        for (let s = -1; s <= 1; s += 2) {
          kit.p().t(s * 0.75, 0.42, 0).rz(Math.PI / 2);
          m.colj(PAL.darkTimber, rng, 0.1);
          m.cyl(0.42, 0.42, 0.14, 8, { smooth: false, capTop: true, capBot: true });
          kit.o();
        }
        kit.o();
      }
    }
  }
}

// ==========================================================================
// WATCH — a tower on rock, a palisade, a brazier, a beacon-pile. Small at
// every tier: tiers make it taller and add outworks, never sprawl.
// ==========================================================================

function palisade(kit, rng, r, n, h, gapAt) {
  const m = kit.matte;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    if (gapAt !== undefined) {
      const d = Math.abs(((a - gapAt + Math.PI * 3) % TAU) - Math.PI);
      if (d < 0.36) continue;
    }
    const rr = r * (0.97 + rng() * 0.06);
    m.colj(PAL.timber, rng, 0.18);
    kit.p().t(Math.cos(a) * rr, 0, Math.sin(a) * rr).ry(rng()).rz((rng() - 0.5) * 0.1);
    m.stake(0.2, h * (0.9 + rng() * 0.2), 4, 0.22);
    kit.o();
  }
}

function bWatch(kit, rng, T, R, pl) {
  const m = kit.matte;
  const th = 7.5 + T * 3.3;          // the tower is the whole point
  const cr = 3.0 + T * 0.16, ch = 1.6 + T * 0.22;

  // the rock it stands on, plus a couple of lesser crags
  kit.p().t(0, 0, 0);
  crag(kit, rng, cr, ch, 7);
  kit.o();
  pl.add(0, 0, cr);
  for (let i = 0; i < 2; i++) {
    const p = pl.place(rng, 1.5, cr + 1.0, R * 0.8, 24, 0.4);
    if (p) { kit.p().t(p.x, 0, p.z).ry(rng() * TAU); crag(kit, rng, 1.4 + rng() * 0.7, 0.8 + rng() * 0.6, 5); kit.o(); }
  }

  // the tower
  kit.p().t(0, ch * 0.86, 0).ry(0.18);
  m.colj(PAL.greystone, rng, 0.12);
  m.frustum(4.3, 1.9, 4.3, 3.6, 3.6, 0, 0);       // battered plinth
  kit.p().t(0, 1.9, 0);
  m.colj(PAL.greystone, rng, 0.09);
  m.frustum(3.5, th, 3.5, 3.1, 3.1, 0, 0);
  // string courses at each floor
  const floors = 2 + Math.floor(T * 0.75);
  for (let i = 1; i < floors; i++) {
    const y = (th / floors) * i;
    m.colj(PAL.greystone, rng, 0.2);
    kit.p().t(0, y, 0);
    m.frustum(3.56 - (y / th) * 0.4, 0.22, 3.56 - (y / th) * 0.4, 3.5 - (y / th) * 0.4, 3.5 - (y / th) * 0.4, 0, 0);
    kit.o();
  }
  // slits, and one lit window near the top
  kit.p().t(0, 0, -1.72);
  windows(kit, 2, 0.2, 1.0, th * 0.32, 1.5, PAL.hearth, 0);
  windows(kit, 1, 0.36, 0.7, th * 0.72, 0, PAL.hearth, 1);
  kit.o();
  kit.p().ry(Math.PI * 0.5).t(0, 0, -1.72);
  windows(kit, 1, 0.2, 1.0, th * 0.5, 0, PAL.hearth, 0);
  kit.o();
  // door at the foot, reached by a timber stair
  m.colj(PAL.darkTimber, rng, 0.1);
  kit.p().t(0, 0, -1.76); m.panelZ(1.0, 1.8, -1); kit.o();
  // fighting top: corbel band, crenellations, hoarding at the top tiers
  kit.p().t(0, th, 0);
  m.colj(PAL.greystone, rng, 0.14);
  m.frustum(3.1, 0.34, 3.1, 4.1, 4.1, 0, 0);
  kit.p().t(0, 0.34, 0);
  m.frustum(4.1, 0.5, 4.1, 4.1, 4.1, 0, 0);
  kit.p().t(0, 0.5, 0);
  for (let s = 0; s < 2; s++) {
    kit.p().ry(s * Math.PI * 0.5);
    for (let k = -1; k <= 1; k += 2) {
      m.colj(PAL.greystone, rng, 0.18);
      kit.p().t(0, 0, k * 1.87);
      m.merlons(4.1, 0.36, 0.8, 4, true);
      kit.o();
    }
    kit.o();
  }
  if (T >= 3) {
    m.colj(PAL.darkTimber, rng, 0.12);
    for (let s = -1; s <= 1; s += 2) {
      kit.p().t(s * 2.1, 0, 0);
      m.frustum(0.5, 1.5, 4.4, 0.5, 4.4, 0, 0, FX | FNX | FY);
      kit.o();
    }
  }
  // the brazier, and the beacon-pile that is the whole reason for the tower
  kit.p().t(-1.1, 0, 1.1);
  brazier(kit, rng, 0.85, 1.2, PAL.iron, PAL.brazier);
  kit.o();
  kit.p().t(0.75, 0, -0.6);
  m.colj(PAL.darkTimber, rng, 0.16);
  for (let i = 0; i < 7; i++) {
    kit.p().ry((i / 7) * TAU).t(0.5, 0, 0).rz(0.42);
    m.box(0.22, 2.1, 0.22, F_ALL);
    kit.o();
  }
  m.colj(PAL.timber, rng, 0.16);
  kit.p().t(0, 0.15, 0).ry(0.5);
  m.box(1.5, 0.2, 0.2, F_ALL);
  kit.o();
  kit.o();
  kit.o(); kit.o(); kit.o();   // parapet frames
  kit.o();                     // shaft
  kit.o();                     // tower base
  pl.add(0, 0, 2.4);

  // palisade, gate to the south, and outworks as the garrison grows
  const gateA = Math.PI * 0.5;
  palisade(kit, rng, R * 0.78, Math.round(R * 2.6), 1.9, gateA);
  m.colj(PAL.darkTimber, rng, 0.12);
  for (let s = -1; s <= 1; s += 2) {
    kit.p().t(Math.cos(gateA + s * 0.32) * R * 0.78, 0, Math.sin(gateA + s * 0.32) * R * 0.78);
    m.box(0.42, 2.9, 0.42, F_NOBASE);
    kit.o();
  }
  kit.p().t(Math.cos(gateA) * R * 0.78, 2.65, Math.sin(gateA) * R * 0.78).ry(gateA + Math.PI * 0.5);
  m.box(R * 0.55, 0.3, 0.3, F_ALL);
  kit.o();
  if (T >= 2) {
    palisade(kit, rng, R * 0.99, Math.round(R * 3.0), 1.4, gateA);
    // earth bank between the rings
    m.mix(PAL.dry, PAL.plough, 0.55, 1);
    kit.p().t(0, 0.02, 0);
    m.cyl(R * 0.9, R * 0.86, 0.25, 13, { smooth: false, capTop: true });
    kit.o();
    // a lean-to barrack against the palisade
    const p = pl.place(rng, 2.2, cr + 1.2, R * 0.62, 30, 0.5);
    if (p) {
      kit.p().t(p.x, 0, p.z).ry(faceIn(p.x, p.z));
      m.colj(PAL.timber, rng, 0.12);
      m.wedge(4.4, 2.4, 1.5, 2.6);
      kit.p().t(0, 0, -1.3);
      windows(kit, 1, 0.5, 0.5, 1.2, 0, PAL.hearth, 1);
      kit.o();
      kit.o();
    }
  }
  if (T >= 3) {
    // a stone outwork with two squat turrets flanking the gate
    for (let s = -1; s <= 1; s += 2) {
      const a = gateA + s * 0.72;
      kit.p().t(Math.cos(a) * R * 0.88, 0, Math.sin(a) * R * 0.88);
      m.colj(PAL.greystone, rng, 0.12);
      m.cyl(1.35, 1.2, 3.4, 7, { smooth: false });
      kit.p().t(0, 3.4, 0);
      m.colj(PAL.greystone, rng, 0.18);
      m.cyl(1.5, 1.5, 0.3, 7, { smooth: false, capTop: true });
      kit.o();
      kit.o();
      pl.add(Math.cos(a) * R * 0.88, Math.sin(a) * R * 0.88, 1.5);
    }
    // woodpile and a flag
    const p = pl.place(rng, 1.3, cr + 1.0, R * 0.6, 24, 0.4);
    if (p) {
      kit.p().t(p.x, 0, p.z).ry(rng() * TAU);
      m.colj(PAL.timber, rng, 0.18);
      for (let i = 0; i < 6; i++) {
        kit.p().t(0, 0.2 + Math.floor(i / 3) * 0.42, (i % 3) * 0.44 - 0.44).rz(Math.PI / 2);
        m.cyl(0.2, 0.2, 1.6, 5, { smooth: false, capTop: true, capBot: true });
        kit.o();
      }
      kit.o();
    }
  }
  if (T >= 1) {
    const p = pl.place(rng, 0.6, cr + 0.9, R * 0.7, 24, 0.4);
    if (p) {
      kit.p().t(p.x, 0, p.z);
      m.col(PAL.darkTimber, 1);
      m.box(0.16, 5.2, 0.16, F_NOBASE);
      kit.p().t(0.08, 4.9, 0);
      pennant(kit, 2.2, 1.1, PAL.banner);
      kit.o();
      kit.o();
    }
  }
}

// ==========================================================================
// HOLD — Orcs. Black basalt, wrong angles, spikes, rust-red iron, chimneys
// with ember glow, slag heaps. Built to be seen from a long way off and
// disliked from at least that far.
// ==========================================================================

/** a mass that is wider at the top than the bottom and leans. Never square. */
function orcMass(kit, rng, w, h, d, lean) {
  const m = kit.matte;
  m.colj(PAL.basalt, rng, 0.3);
  const lx = (rng() - 0.5) * lean * w, lz = (rng() - 0.5) * lean * d;
  m.frustum(w, h, d, w * (1.0 + rng() * 0.12), d * (0.82 + rng() * 0.16), lx, lz);
  return { lx, lz };
}

function orcSpikes(kit, rng, n, r, r0, h) {
  const m = kit.matte;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rng() * 0.5;
    m.colj(PAL.rust, rng, 0.3);
    kit.p().t(Math.cos(a) * r0, 0, Math.sin(a) * r0).rz((rng() - 0.5) * 0.5).rx((rng() - 0.5) * 0.5);
    m.spike(r, h * (0.7 + rng() * 0.7), 4);
    kit.o();
  }
}

function orcChimneys(kit, rng, n, s) {
  const m = kit.matte, g = kit.glow;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rng(), rr = s * (0.6 + rng() * 0.9);
    const h = s * (2.6 + rng() * 2.6);
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    kit.p().t(x, 0, z);
    m.colj(PAL.basalt, rng, 0.26);
    m.frustum(s * 0.62, h, s * 0.62, s * 0.5, s * 0.5, (rng() - 0.5) * s * 0.5, (rng() - 0.5) * s * 0.4);
    kit.p().t(0, h, 0);
    m.colj(PAL.rust, rng, 0.3);
    m.frustum(s * 0.66, s * 0.22, s * 0.66, s * 0.6, s * 0.6, 0, 0, F_ALL);
    g.col(PAL.emberOrc, 0.9);
    kit.p().t(0, s * 0.22, 0); g.discY(s * 0.26, 6); kit.o();
    kit.lantern(0, s * 0.3, 0, PAL.emberOrc);
    kit.o();
    kit.o();
  }
}

function slagHeap(kit, rng, r, h) {
  const m = kit.matte, g = kit.glow;
  m.colj(PAL.slag, rng, 0.34);
  m.cone(r, h, 6, 0.65, 2);
  m.colj(PAL.ash, rng, 0.3);
  kit.p().t(r * 0.35, 0, -r * 0.3); m.dome(r * 0.55, h * 0.3, r * 0.5, 6, 1); kit.o();
  // runnels of hot slag down one flank
  g.col(PAL.emberOrc, 0.55);
  for (let k = 0; k < 3; k++) {
    const a = rng() * TAU, w2 = r * (0.05 + rng() * 0.05);
    kit.p().ry(a);
    g.tri(-w2, 0.06, r * 0.99, w2, 0.06, r * 0.99, 0, h * 0.7, r * 0.22);
    kit.o();
  }
  kit.p().t(0, 0.04, 0);
  g.col(PAL.emberOrc, 0.18);
  g.discY(r * 1.25, 7);
  kit.o();
}

function bHold(kit, rng, T, R, pl) {
  const m = kit.matte, mt = kit.metal, g = kit.glow;

  // ash and cinder underfoot
  m.colj(PAL.ash, rng, 0.16);
  kit.p().t(0, 0.03, 0); m.discY(R * 0.92, 9, rng()); kit.o();
  m.colj(PAL.slag, rng, 0.2);
  kit.p().t(0, 0.04, 0); m.discY(R * 0.5, 7, rng()); kit.o();
  // cracks in the crust, lit from underneath
  g.col(PAL.emberOrc, 0.42);
  for (let i = 0; i < 4 + T; i++) {
    const a = (i / (4 + T)) * TAU + rng() * 0.6;
    const r0 = R * (0.16 + rng() * 0.12), r1 = r0 + R * (0.3 + rng() * 0.4);
    const w0 = 0.34 + rng() * 0.3, wf = 0.06;
    kit.p().t(0, 0.055, 0).ry(a);
    g.quad(-wf, 0, r1, wf, 0, r1, w0, 0, r0, -w0, 0, r0);
    kit.o();
  }

  // the central mass: one crooked keep at low tiers, a stepped ziggurat later
  const zh = 7 + T * 2.9;
  pl.add(0, 0, 4.6 + T * 0.7);
  kit.p().t(0, 0, 0).ry(0.24);
  if (T >= 3) {
    const steps = 4;
    let w = 12.5 + T * 1.4, d = 10.5 + T * 1.2, y = 0;
    for (let i = 0; i < steps; i++) {
      const hh = zh / steps * (1.15 - i * 0.1);
      kit.p().t((rng() - 0.5) * 0.7, y, (rng() - 0.5) * 0.7).ry((i % 2 ? 1 : -1) * 0.09 * (i + 1));
      m.colj(PAL.basalt, rng, 0.3);
      m.frustum(w, hh, d, w * 0.9, d * 0.88, (rng() - 0.5) * 0.6, 0);
      m.colj(PAL.rust, rng, 0.26);
      kit.p().t(0, hh, 0);
      m.frustum(w * 0.92, 0.32, d * 0.9, w * 0.88, d * 0.86, 0, 0, F_ALL);
      kit.o();
      if (i === 1) {
        // ember-lit mouth, cut into the second stage
        kit.p().t(0, 0, -d * 0.5 - 0.06);
        m.col(PAL.voidDark);
        m.panelZ(w * 0.3, hh * 0.72, -1);
        g.col(PAL.emberOrc);
        kit.p().t(0, 0, -0.05); g.panelZ(w * 0.24, hh * 0.62, -1); kit.o();
        spill(kit, w * 0.5, 3.0, PAL.emberOrc, 0.24);
        kit.lantern(0, hh * 0.4, -0.8, PAL.emberOrc);
        kit.o();
      }
      kit.o();
      y += hh;
      w *= 0.76; d *= 0.76;
    }
    // the crown: an altar mouth and a ring of spikes
    kit.p().t(0, y, 0);
    m.colj(PAL.basalt, rng, 0.2);
    m.frustum(w * 0.7, 1.5, d * 0.7, w * 0.8, d * 0.8, 0, 0);
    g.col(PAL.emberOrc, 1.0);
    kit.p().t(0, 1.5, 0); g.discY(w * 0.3, 6); kit.o();
    kit.lantern(0, 2.1, 0, PAL.emberOrc);
    kit.p().t(0, 1.5, 0);
    orcSpikes(kit, rng, 7, 0.3, w * 0.42, 2.4);
    kit.o();
    kit.o();
  } else {
    const w = 6.4 + T * 1.5, h = zh, d = 5.6 + T * 1.3;
    orcMass(kit, rng, w, h, d, 0.16);
    m.colj(PAL.rust, rng, 0.28);
    kit.p().t(0, h, 0);
    m.frustum(w * 1.08, 0.4, d * 1.06, w * 0.9, d * 0.9, 0, 0, F_ALL);
    kit.p().t(0, 0.4, 0);
    orcSpikes(kit, rng, 5, 0.26, w * 0.42, 2.0);
    kit.o();
    kit.o();
    kit.p().t(0, 0, -d * 0.52);
    m.col(PAL.voidDark);
    m.panelZ(w * 0.26, h * 0.34, -1);
    g.col(PAL.emberOrc);
    kit.p().t(0, 0.1, -0.05); g.panelZ(w * 0.2, h * 0.3, -1); kit.o();
    spill(kit, w * 0.6, 2.6, PAL.emberOrc, 0.3);
    kit.lantern(0, h * 0.2, -0.7, PAL.emberOrc);
    kit.o();
  }
  kit.o();

  // chimneys crowding the keep
  kit.p().t(0, 0, 0);
  orcChimneys(kit, rng, [2, 3, 4, 5, 6][T], 1.5 + T * 0.22);
  kit.o();

  // the gate: two leaning slabs, a lintel, iron bars, and light behind
  const ga = Math.PI * 0.5, gr = R * 0.82;
  const gx = Math.cos(ga) * gr, gz = Math.sin(ga) * gr;
  kit.p().t(gx, 0, gz).ry(faceOut(gx, gz));
  m.colj(PAL.basalt, rng, 0.24);
  for (let s = -1; s <= 1; s += 2) {
    kit.p().t(s * 2.5, 0, 0);
    m.frustum(1.7, 5.4 + T * 0.3, 1.9, 1.5, 1.7, -s * 0.45, 0);
    kit.o();
  }
  kit.p().t(0, 5.0 + T * 0.3, 0).rz(0.035);
  m.colj(PAL.basalt, rng, 0.2);
  m.box(7.2, 1.1, 2.1, F_ALL);
  orcSpikes(kit, rng, 5, 0.2, 2.4, 1.5);
  kit.o();
  mt.colj(PAL.rust, rng, 0.28);
  for (let k = 0; k < 5; k++) {
    kit.p().t(-1.8 + k * 0.9, 0, -0.2).rz((rng() - 0.5) * 0.06);
    mt.box(0.17, 4.9 + T * 0.3, 0.17, F_ALL);
    kit.o();
  }
  g.col(PAL.emberOrc, 0.6);
  kit.p().t(0, 0.2, 0.35); g.panelZ(4.2, 4.2, -1); kit.o();
  spill(kit, 5.0, 4.0, PAL.emberOrc, 0.22);
  kit.lantern(0, 2.4, -1.0, PAL.emberOrc);
  kit.o();
  pl.add(gx, gz, 3.4);

  // forge sheds with rust roofs, ember spilling out of the doorways
  const nShed = [1, 2, 3, 4, 5][T];
  for (let i = 0; i < nShed; i++) {
    const w = 4.2 + rng() * 2.4, d = 3.2 + rng() * 1.8;
    const p = pl.place(rng, Math.max(w, d) * 0.72, R * 0.3, R * 0.9, 34, 0.7);
    if (!p) continue;
    kit.p().t(p.x, 0, p.z).ry(faceIn(p.x, p.z) + (rng() - 0.5) * 0.7);
    m.colj(PAL.basalt, rng, 0.26);
    m.frustum(w, 2.4 + rng(), d, w * 1.04, d * 0.94, (rng() - 0.5) * 0.5, 0);
    kit.p().t(0, 2.4 + rng() * 0.2, 0);
    m.colj(PAL.rust, rng, 0.3);
    m.wedge(w * 1.12, 1.5, 0.5, d * 1.12);
    // corrugation
    m.colj(PAL.rust, rng, 0.36);
    for (let k = 0; k < 4; k++) {
      kit.p().t(-w * 0.42 + k * (w * 0.28), 0.9, 0);
      m.box(0.16, 0.5, d * 1.1, FX | FNX | FY);
      kit.o();
    }
    kit.o();
    kit.p().t((rng() - 0.5) * w * 0.3, 0, -d * 0.52);
    m.col(PAL.voidDark);
    m.panelZ(1.5, 2.0, -1);
    g.col(PAL.emberOrc, 0.85);
    kit.p().t(0, 0.05, -0.05); g.panelZ(1.15, 1.7, -1); kit.o();
    spill(kit, 2.6, 3.0, PAL.emberOrc, 0.26);
    kit.lantern(0, 1.1, -0.8, PAL.emberOrc);
    kit.o();
    kit.o();
  }

  // slag heaps and ore chutes
  const nSlag = [1, 2, 2, 3, 4][T];
  for (let i = 0; i < nSlag; i++) {
    const p = pl.place(rng, 3.0, R * 0.45, R, 30, 0.5);
    if (!p) continue;
    kit.p().t(p.x, 0, p.z).ry(rng() * TAU);
    slagHeap(kit, rng, 2.4 + rng() * 1.3, 1.9 + rng() * 1.2);
    kit.o();
  }

  // low walls at wrong angles, spiked, and trophy poles
  const nWall = [2, 3, 4, 5, 6][T];
  for (let i = 0; i < nWall; i++) {
    const a = rng() * TAU, d = R * (0.62 + rng() * 0.3), len = R * (0.24 + rng() * 0.3);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    kit.p().t(x, 0, z).ry(rng() * TAU);
    m.colj(PAL.basalt, rng, 0.3);
    const wh = 1.9 + rng() * 0.8;
    m.frustum(len, wh, 1.1, len * 0.96, 0.8, (rng() - 0.5) * 0.4, 0);
    const ns = Math.max(2, Math.round(len / 1.6));
    for (let k = 0; k < ns; k++) {
      m.colj(PAL.rust, rng, 0.3);
      kit.p().t(-len * 0.5 + (len / ns) * (k + 0.5), wh - 0.1, 0).rz((rng() - 0.5) * 0.4);
      m.spike(0.2, 1.0 + rng() * 0.5, 4);
      kit.o();
    }
    kit.o();
    pl.add(x, z, len * 0.4);
  }
  const nPole = [1, 1, 2, 2, 3][T];
  for (let i = 0; i < nPole; i++) {
    const p = pl.place(rng, 1.0, R * 0.35, R * 0.9, 24, 0.4);
    if (!p) continue;
    kit.p().t(p.x, 0, p.z).ry(rng() * TAU).rz((rng() - 0.5) * 0.12);
    m.colj(PAL.darkTimber, rng, 0.2);
    m.box(0.26, 4.6 + rng(), 0.26, F_NOBASE);
    kit.p().t(0, 4.2, 0);
    m.box(2.6, 0.2, 0.2, F_ALL);
    for (let k = -1; k <= 1; k += 2) {
      kit.p().t(k * 1.05, -0.1, 0);
      hangCloth(kit, 0.6, 1.5 + rng() * 0.6, PAL.rust, 0.9, 3);
      kit.o();
    }
    kit.o();
    kit.o();
  }
  // iron spikes scattered outside the walls, at no particular angle
  for (let i = 0; i < 4 + T * 3; i++) {
    const a = rng() * TAU, d = R * (0.86 + rng() * 0.16);
    m.colj(PAL.rust, rng, 0.3);
    kit.p().t(Math.cos(a) * d, 0, Math.sin(a) * d).rz((rng() - 0.5) * 0.7).rx((rng() - 0.5) * 0.5);
    m.stake(0.16, 1.6 + rng() * 1.2, 4, 0.4);
    kit.o();
  }
  if (T >= 2) {
    const p = pl.place(rng, 1.6, R * 0.3, R * 0.6, 24, 0.5);
    if (p) {
      kit.p().t(p.x, 0, p.z);
      brazier(kit, rng, 1.3, 2.0, PAL.rust, PAL.emberOrc);
      kit.o();
    }
  }
}

// ==========================================================================
// buildSettlement
// ==========================================================================

const BUILDERS = { shire: bShire, delve: bDelve, haven: bHaven, burg: bBurg, watch: bWatch, hold: bHold };

/**
 * Build one settlement.
 * @param {{kind:string, tier:number, seed:*, radiusHint:number, shared:object}} params
 * @returns {{group, footprint, lanternPoints, lanternColors, update, dispose, stats}}
 */
export function buildSettlement(params, THREE) {
  const p = params || {};
  const kind = BUILDERS[p.kind] ? p.kind : 'shire';
  const T = clamp(Math.round(p.tier || 0), 0, 4);
  const seed = String(p.seed === undefined ? 'eardon' : p.seed);
  const rng = makeRng('pw-settle|' + kind + '|' + T + '|' + seed);
  // A watch never sprawls; everything else grows into its tier.
  const natural = kind === 'watch' ? 6 + T * 1.1 : TIER_R[T];
  const R = (typeof p.radiusHint === 'number' && p.radiusHint > 0)
    ? clamp(p.radiusHint, natural * 0.62, natural * 1.35) : natural;

  const kit = newKit(THREE, p.shared);
  const pl = new Placer();
  BUILDERS[kind](kit, rng, T, R, pl);

  if (kit.xf.st.length !== 0) console.warn('[props] unbalanced transform stack in ' + kind, kit.xf.st.length);
  const group = finish(kit, 'pw-' + kind + '-t' + T);
  group.userData.pw = { kind, tier: T, seed, radius: R };

  const uni = kit.mats.uniforms;
  const ownsTime = !(p.shared && p.shared.uTime);
  const spin = kit.spin;
  let acc = 0;
  const update = (dt, env) => {
    acc += dt || 0;
    const time = (env && typeof env.time === 'number') ? env.time : acc;
    if (ownsTime) uni.uTime.value = time;
    let ws = 1;
    if (env && env.windDir) {
      ws = typeof env.windStrength === 'number' ? env.windStrength : 1;
      uni.uWind.value.set(env.windDir[0] * ws * 0.6, env.windDir[1] * ws * 0.6);
    }
    for (let i = 0; i < spin.length; i++) {
      spin[i].o.rotation.z = -time * spin[i].rate * (0.35 + ws * 0.85);
    }
  };

  return {
    group,
    footprint: Math.max(pl.max, R * 0.75),
    lanternPoints: kit.lp,
    lanternColors: kit.lc,
    kind, tier: T,
    update,
    dispose: disposer(group),
    stats: tally(group),
  };
}

// --------------------------------------------------------------------------
// Shared wrapper for the smaller structures.
// --------------------------------------------------------------------------

function wrapThing(kit, name, extra) {
  if (kit.xf.st.length !== 0) console.warn('[props] unbalanced transform stack in ' + name, kit.xf.st.length);
  const group = finish(kit, name);
  const uni = kit.mats.uniforms;
  const ownsTime = kit._ownTime;
  let acc = 0;
  const out = {
    group,
    lanternPoints: kit.lp,
    lanternColors: kit.lc,
    update(dt, env) {
      acc += dt || 0;
      const time = (env && typeof env.time === 'number') ? env.time : acc;
      if (ownsTime) uni.uTime.value = time;
      if (env && env.windDir) {
        const ws = typeof env.windStrength === 'number' ? env.windStrength : 1;
        uni.uWind.value.set(env.windDir[0] * ws * 0.6, env.windDir[1] * ws * 0.6);
      }
    },
    dispose: disposer(group),
    stats: tally(group),
  };
  if (extra) for (const k in extra) out[k] = extra[k];
  return out;
}

/** a lamp on a post — every station has at least one */
function lampPost(kit, rng, h, hex, metalHex) {
  const m = kit.matte;
  m.colj(metalHex === undefined ? PAL.iron : metalHex, rng, 0.12);
  m.frustum(0.24, h, 0.24, 0.15, 0.15, 0, 0);
  kit.p().t(0, h, 0);
  m.box(0.44, 0.1, 0.44, F_ALL);
  kit.glow.col(hex === undefined ? PAL.hearth : hex);
  kit.p().t(0, 0.1, 0);
  kit.glow.cyl(0.19, 0.15, 0.36, 6, { smooth: false, capTop: true });
  kit.o();
  m.colj(metalHex === undefined ? PAL.iron : metalHex, rng, 0.12);
  kit.p().t(0, 0.46, 0); m.cone(0.28, 0.26, 6, 0, 1); kit.o();
  kit.lantern(0, 0.3, 0, hex === undefined ? PAL.hearth : hex);
  kit.o();
}

/** name board on two posts, the one thing every railway everywhere agrees on */
function nameBoard(kit, rng, w, h, faceHex, postHex) {
  const m = kit.matte;
  m.colj(postHex === undefined ? PAL.timber : postHex, rng, 0.14);
  for (let s = -1; s <= 1; s += 2) {
    kit.p().t(s * w * 0.36, 0, 0);
    m.box(0.13, 1.5, 0.13, F_NOBASE);
    kit.o();
  }
  kit.p().t(0, 1.5, 0);
  m.colj(faceHex === undefined ? PAL.whitewash : faceHex, rng, 0.06);
  m.box(w, h, 0.09, F_ALL);
  m.col(PAL.darkTimber, 1);
  kit.p().t(0, 0, -0.06); m.box(w * 0.86, h * 0.42, 0.02, F_ALL); kit.o();
  kit.o();
}

function bench(kit, rng, len, hex) {
  const m = kit.matte;
  m.colj(hex === undefined ? PAL.timber : hex, rng, 0.14);
  kit.p().t(0, 0.46, 0);
  m.box(len, 0.09, 0.42, F_ALL);
  kit.p().t(0, 0.28, 0.2); m.box(len, 0.46, 0.08, F_ALL); kit.o();
  for (let s = -1; s <= 1; s += 2) {
    kit.p().t(s * len * 0.38, -0.46, 0);
    m.box(0.1, 0.46, 0.36, FX | FNX | FZ | FNZ);
    kit.o();
  }
  kit.o();
}

function crate(kit, rng, s, hex) {
  const m = kit.matte;
  m.colj(hex === undefined ? PAL.timber : hex, rng, 0.16);
  m.box(s, s * 0.85, s * 0.9, F_NOBASE);
  m.colj(PAL.darkTimber, rng, 0.14);
  kit.p().t(0, s * 0.42, 0);
  m.box(s * 1.02, s * 0.08, s * 0.92, FX | FNX | FZ | FNZ);
  kit.o();
}

// ==========================================================================
// buildStation — the same railway, argued about by six peoples.
// Track centreline is local z = 0 along X. Platform on the +Z side.
// ==========================================================================

const PLAT_LEN = {
  shire: (t) => 9 + t * 3.5,
  delve: (t) => 14 + t * 4,
  haven: (t) => 8 + t * 2,
  burg: (t) => 12 + t * 3.5,
  watch: (t) => 10 + t * 2,
  hold: (t) => 12 + t * 3,
};

/** the platform slab itself: edge at z = 0.85, top at y = ph */
function platform(kit, rng, len, depth, ph, faceHex, topHex, edgeHex) {
  const m = kit.matte;
  kit.p().t(0, 0, 0.85 + depth * 0.5);
  m.colj(faceHex, rng, 0.12);
  m.frustum(len, ph, depth, len, depth, 0, 0, FX | FNX | FNZ | FZ);
  kit.o();
  // deck, in a different tone so it reads as a surface from above
  kit.p().t(0, ph, 0.85 + depth * 0.5);
  m.colj(topHex, rng, 0.1);
  m.plate(len, depth);
  kit.o();
  // the white edge line, because someone has to stand behind something
  kit.p().t(0, ph + 0.01, 1.05);
  m.colj(edgeHex === undefined ? PAL.whitewash : edgeHex, rng, 0.05);
  m.plate(len, 0.34);
  kit.o();
}

export function buildStation(params, THREE) {
  const p = params || {};
  const kind = PLAT_LEN[p.kind] ? p.kind : 'burg';
  const T = clamp(Math.round(p.tier || 0), 0, 4);
  const seed = String(p.seed === undefined ? 'eardon' : p.seed);
  const rng = makeRng('pw-station|' + kind + '|' + T + '|' + seed);
  const kit = newKit(THREE, p.shared);
  kit._ownTime = !(p.shared && p.shared.uTime);
  const m = kit.matte, mt = kit.metal, g = kit.glow;
  const L = PLAT_LEN[kind](T);
  const half = L * 0.5;

  if (kind === 'shire') {
    // A halt. A bench, a board, and a great deal of correspondence about it.
    platform(kit, rng, L, 3.2, 0.55, PAL.rock, PAL.plough, PAL.whitewash);
    kit.p().t(-half * 0.45, 0.55, 2.0); bench(kit, rng, 2.2, PAL.timber); kit.o();
    kit.p().t(half * 0.3, 0.55, 3.4).ry(Math.PI); nameBoard(kit, rng, 2.6, 0.66); kit.o();
    kit.p().t(half * 0.72, 0.55, 1.7); lampPost(kit, rng, 2.5, PAL.hearth, PAL.darkTimber); kit.o();
    // milk churns and a barrow, waiting for the 8:40
    for (let i = 0; i < 3; i++) {
      kit.p().t(-half * 0.78 + i * 0.6, 0.55, 3.1 + (rng() - 0.5) * 0.4).ry(rng() * TAU);
      m.colj(PAL.silver, rng, 0.12);
      m.cyl(0.3, 0.24, 0.72, 7, { smooth: false, capTop: true });
      kit.o();
    }
    if (T >= 2) {
      // a thatched shelter with flower baskets
      kit.p().t(0, 0.55, 3.0);
      m.colj(PAL.timber, rng, 0.12);
      for (let k = 0; k < 4; k++) {
        kit.p().t((k < 2 ? -1 : 1) * 2.1, 0, (k % 2 ? -1 : 1) * 1.15);
        m.box(0.19, 2.5, 0.19, F_NOBASE);
        kit.o();
      }
      m.colj(PAL.whitewash, rng, 0.07);
      kit.p().t(0, 0, 1.2); m.panelZ(4.6, 2.5, 1); kit.o();
      kit.p().t(0, 2.5, 0);
      m.colj(PAL.thatch, rng, 0.11);
      m.hip(4.6, 1.5, 2.6, 0.4, 0.45);
      kit.o();
      kit.p().t(0, 1.9, -1.15);
      kit.fol.sway = 0.2;
      for (let k = -1; k <= 1; k += 2) {
        kit.p().t(k * 1.3, 0, 0);
        m.colj(PAL.darkTimber, rng, 0.1); m.box(0.42, 0.26, 0.3, F_ALL);
        kit.fol.mix(PAL.canopy, PAL.doorRed, 0.45, 1.05);
        kit.p().t(0, 0.2, 0); kit.fol.blob(0.34, 0.3, 0.28, rng, 0.3); kit.o();
        kit.o();
      }
      kit.fol.sway = 0;
      kit.o();
      kit.p().t(-1.6, 0, 0.9); bench(kit, rng, 1.8, PAL.timber); kit.o();
      kit.lantern(0, 2.3, 3.0, PAL.hearth);
      kit.o();
    }
    if (T >= 4) {
      // a parcels office, and a hedge, and a picket fence
      kit.p().t(half * 0.62, 0.55, 3.2).ry(0.1);
      m.colj(PAL.whitewash, rng, 0.07);
      m.frustum(3.4, 2.4, 2.8, 3.3, 2.7, 0, 0);
      kit.p().t(0, 2.4, 0);
      m.colj(PAL.thatch, rng, 0.1); m.gable(3.4, 1.5, 2.8, 0.4, 0);
      kit.o();
      kit.p().t(0, 0, -1.4); windows(kit, 2, 0.6, 0.6, 1.2, 1.8, PAL.hearth, 2); kit.o();
      kit.p().t(1.1, 2.4, 0.5);
      m.colj(PAL.rock, rng, 0.1); m.frustum(0.5, 1.6, 0.5, 0.42, 0.42, 0.1, 0);
      kit.o();
      kit.o();
      hedge(kit, rng, [[-half, 4.9], [half * 0.2, 5.1]], 1.1, 0.8);
    }
  } else if (kind === 'delve') {
    // A vaulted terminus. The train arrives inside the building.
    const pd = 3.6, ph = 0.95, vy = 5.6, vr = 4.6;
    for (let s = -1; s <= 1; s += 2) {
      kit.p().ry(s > 0 ? 0 : Math.PI);
      platform(kit, rng, L, pd, ph, PAL.granite, PAL.scree, PAL.brass);
      kit.o();
    }
    // arcade of squat piers carrying the vault
    const nP = Math.max(3, Math.round(L / 4.4));
    for (let i = 0; i <= nP; i++) {
      const x = -half + (L / nP) * i;
      for (let s = -1; s <= 1; s += 2) {
        kit.p().t(x, 0, s * (0.85 + pd));
        m.colj(PAL.granite, rng, 0.13);
        m.frustum(1.9, vy, 1.7, 1.6, 1.5, 0, 0);
        kit.p().t(0, vy, 0);
        m.colj(PAL.granite, rng, 0.2);
        m.frustum(2.2, 0.4, 2.0, 2.0, 1.8, 0, 0, F_ALL);
        kit.o();
        kit.o();
      }
      if (i < nP && i % 2 === 0) {
        // brass lamp hung under the vault
        kit.p().t(x + (L / nP) * 0.5, vy + 0.9, 0);
        mt.colj(PAL.brass, rng, 0.1);
        m.col(PAL.iron, 1); m.box(0.09, 0.9, 0.09, F_ALL);
        kit.p().t(0, -0.9, 0);
        mt.cyl(0.34, 0.26, 0.44, 6, { smooth: false, capTop: true });
        g.col(PAL.hearth); kit.p().t(0, -0.16, 0); g.discY(0.28, 6); kit.o();
        kit.lantern(0, -0.1, 0, PAL.hearth);
        kit.o();
        kit.o();
      }
    }
    // the vault, and a screen wall at each end with an arched mouth
    kit.p().t(-half - 0.6, vy + 0.4, 0).ry(-Math.PI / 2);
    m.colj(PAL.granite, rng, 0.09);
    m.barrel(vr, L + 1.2, 9, false);
    kit.o();
    for (let s = -1; s <= 1; s += 2) {
      kit.p().t(s * (half + 0.6), 0, 0).ry(s > 0 ? Math.PI * 0.5 : -Math.PI * 0.5);
      m.colj(PAL.granite, rng, 0.11);
      m.frustum(vr * 2.3, vy + vr * 0.5, 1.3, vr * 2.15, 1.2, 0, 0);
      m.col(PAL.voidDark);
      kit.p().t(0, 0, -0.68);
      m.panelZ(4.4, 4.2, -1);
      kit.p().t(0, 4.2, 0); m.halfDiscZ(2.2, 9, -1); kit.o();
      kit.o();
      // the mouth is ringed and chevroned, like everything else they build
      kit.p().t(0, 4.2, -0.7);
      m.colj(PAL.granite, rng, 0.16);
      archRim(m, 2.2, 2.8, 9, 0, true);
      kit.o();
      kit.p().t(0, vy + vr * 0.5, 0);
      chevronBand(kit, rng, vr * 2.0, 9, 0.2);
      kit.o();
      kit.o();
    }
    if (T >= 2) {
      for (let i = 0; i < 3; i++) {
        kit.p().t(-half * 0.7 + i * 2.0, ph, 0.85 + pd * 0.6).ry(rng());
        crate(kit, rng, 0.9, PAL.darkTimber);
        kit.o();
      }
      kit.p().t(half * 0.5, ph, 0.85 + pd * 0.5).ry(Math.PI);
      nameBoard(kit, rng, 3.0, 0.7, PAL.brass, PAL.granite);
      kit.o();
    }
  } else if (kind === 'haven') {
    // The minimum the Aelin could be persuaded to build. Note the tree.
    const pd = 2.4, ph = 0.4;
    platform(kit, rng, L, pd, ph, PAL.silver, PAL.birch, PAL.silver);
    kit.p().t(0, ph, 1.9);
    m.colj(PAL.birch, rng, 0.05);
    m.cyl(0.2, 0.14, 3.6, 6, { smooth: true });
    kit.p().t(0, 3.6, 0);
    mt.colj(PAL.verdigris, rng, 0.08);
    mt.cone(1.5, 1.3, 8, 2.2, 2);
    kit.o();
    kit.p().t(0, 3.3, 0);
    g.col(PAL.cold, 0.95);
    g.blob(0.18, 0.34, 0.18, rng, 0.04);
    kit.lantern(0, 0, 0, PAL.cold);
    kit.o();
    kit.o();
    // one small board, reluctantly
    if (T >= 1) {
      kit.p().t(half * 0.5, ph, 2.6).ry(Math.PI);
      m.colj(PAL.birch, rng, 0.05);
      m.box(0.1, 1.3, 0.1, F_NOBASE);
      kit.p().t(0, 1.3, 0); m.box(1.3, 0.34, 0.06, F_ALL); kit.o();
      kit.o();
    }
    // the tree the surveyors were told, twice, to route around
    kit.p().t(-half * 0.35, 0, 2.6);
    m.colj(PAL.birch, rng, 0.06);
    kit.p().t(0, ph, 0); m.cyl(0.85, 0.8, 0.06, 9, { smooth: false, capTop: true }); kit.o();
    tree(kit, rng, 12 + T, { clumps: 4, canopy: PAL.canopy, dark: PAL.floor, trunk: 0.055 });
    kit.o();
    if (T >= 3) {
      kit.p().t(half * 0.75, 0, 2.2);
      tree(kit, rng, 9 + rng() * 3, { clumps: 3, canopy: PAL.canopy, dark: PAL.floor });
      kit.o();
    }
  } else if (kind === 'burg') {
    // A station. Slate, brick, a clock, a canopy. Entirely unremarkable.
    const pd = 4.2, ph = 0.85;
    platform(kit, rng, L, pd, ph, PAL.sandstone, PAL.scree, PAL.whitewash);
    const bw = 6.0 + T * 0.8, bd = 3.6;
    kit.p().t(-L * 0.05, ph, 0.85 + pd - bd * 0.5 + 0.2);
    m.colj(PAL.sandstone, rng, 0.09);
    m.frustum(bw, 3.4, bd, bw * 0.99, bd * 0.99, 0, 0);
    kit.p().t(0, 3.4, 0);
    m.colj(PAL.slate, rng, 0.09);
    m.hip(bw, 1.9, bd, 0.45, 0.34);
    kit.o();
    kit.p().t(0, 0, -bd * 0.5);
    m.colj(PAL.darkTimber, rng, 0.1);
    kit.p().t(-bw * 0.28, 0, -0.03); m.panelZ(1.1, 2.1, -1); kit.o();
    windows(kit, 3, 0.7, 1.1, 1.0, bw * 0.5, PAL.hearth, 2);
    // the clock, which is right twice a day and disputed the rest of it
    m.col(PAL.whitewash, 1);
    kit.p().t(bw * 0.3, 2.5, -0.06); m.discZ(0.52, 10, -1);
    m.col(PAL.iron, 1);
    kit.p().t(0, 0, -0.04); m.box(0.06, 0.42, 0.02, F_ALL); m.box(0.3, 0.05, 0.02, F_ALL);
    kit.o();
    kit.o();
    kit.o();
    kit.p().t(bw * 0.34, 3.4, 0.6);
    m.colj(PAL.sandstone, rng, 0.1); m.frustum(0.66, 1.9, 0.66, 0.58, 0.58, 0, 0);
    m.colj(PAL.slate, rng, 0.12);
    kit.p().t(0, 1.9, 0); m.box(0.82, 0.16, 0.82, F_ALL); kit.o();
    kit.o();
    kit.o();
    // canopy over the platform on iron brackets
    const cy = 3.1;
    kit.p().t(-L * 0.05, ph, 0);
    m.colj(PAL.iron, rng, 0.1);
    const nb = Math.max(2, Math.round(L / 5));
    for (let i = 0; i <= nb; i++) {
      kit.p().t(-L * 0.42 + (L * 0.84 / nb) * i, 0, 1.5);
      m.frustum(0.22, cy, 0.22, 0.16, 0.16, 0, 0);
      kit.o();
    }
    kit.p().t(0, cy, 1.4);
    m.colj(PAL.slate, rng, 0.1);
    m.wedge(L * 0.9, 0.9, 0.2, 3.4);
    m.colj(PAL.darkTimber, rng, 0.12);
    kit.p().t(0, 0, -1.7); m.box(L * 0.9, 0.34, 0.12, F_ALL); kit.o();
    kit.o();
    kit.o();
    kit.p().t(half * 0.66, ph, 1.5); lampPost(kit, rng, 3.0, PAL.hearth, PAL.iron); kit.o();
    kit.p().t(-half * 0.66, ph, 1.5); lampPost(kit, rng, 3.0, PAL.hearth, PAL.iron); kit.o();
    kit.p().t(half * 0.36, ph, 2.4).ry(Math.PI); nameBoard(kit, rng, 3.0, 0.68); kit.o();
    kit.p().t(-half * 0.42, ph, 2.6); bench(kit, rng, 2.4, PAL.darkTimber); kit.o();
    if (T >= 2) {
      // a signal, and a water tower, because it is that sort of railway
      kit.p().t(-half - 1.6, 0, -1.9);
      m.colj(PAL.iron, rng, 0.1);
      m.frustum(0.3, 5.4, 0.3, 0.22, 0.22, 0, 0);
      kit.p().t(0, 4.6, 0);
      m.colj(PAL.banner, rng, 0.12); m.box(1.5, 0.34, 0.09, F_ALL);
      g.col(PAL.hearth, 0.9);
      kit.p().t(-0.5, -0.5, -0.07); g.panelZ(0.3, 0.3, -1); kit.o();
      kit.o();
      kit.o();
    }
    if (T >= 3) {
      kit.p().t(half + 2.6, 0, 4.2);
      m.colj(PAL.sandstone, rng, 0.1);
      for (let k = 0; k < 4; k++) {
        const sx = k < 2 ? -1 : 1, sz = k % 2 ? -1 : 1;
        kit.p().t(sx * 1.3, 0, sz * 1.3);
        m.frustum(0.5, 4.4, 0.5, 0.44, 0.44, 0, 0);
        kit.o();
      }
      kit.p().t(0, 4.4, 0);
      m.colj(PAL.iron, rng, 0.1);
      m.cyl(2.0, 2.0, 2.6, 9, { smooth: false, capTop: true });
      m.colj(PAL.slate, rng, 0.1);
      kit.p().t(0, 2.6, 0); m.cone(2.15, 1.0, 9, 0.4, 1); kit.o();
      kit.o();
      kit.o();
    }
  } else if (kind === 'watch') {
    // A siding, not a station. Crane, guard post, brazier, crates.
    const pd = 3.0, ph = 0.7;
    platform(kit, rng, L, pd, ph, PAL.greystone, PAL.scree, PAL.greystone);
    kit.p().t(-half * 0.5, ph, 2.3);
    m.colj(PAL.darkTimber, rng, 0.14);
    m.frustum(0.5, 4.4, 0.5, 0.42, 0.42, 0, 0);
    kit.p().t(0, 4.4, 0).rz(-0.52);
    m.box(0.36, 3.5, 0.36, F_ALL);
    kit.o();
    const jx = Math.sin(0.52) * 3.5, jy = 4.4 + Math.cos(0.52) * 3.5;
    m.col(PAL.iron, 1);
    kit.p().t(jx, jy - 1.7, 0);
    m.box(0.1, 1.7, 0.1, F_ALL);
    kit.p().t(0, -0.34, 0).rz(Math.PI); m.spike(0.22, 0.55, 4); kit.o();
    kit.o();
    kit.p().t(0, 1.5, 0).rz(0.95);
    m.colj(PAL.darkTimber, rng, 0.12); m.box(0.28, 2.5, 0.28, F_ALL);
    kit.o();
    kit.o();
    // guard post
    kit.p().t(half * 0.6, ph, 3.0).ry(0.1);
    m.colj(PAL.greystone, rng, 0.12);
    m.frustum(2.4, 2.8, 2.2, 2.2, 2.0, 0, 0);
    kit.p().t(0, 2.8, 0);
    m.colj(PAL.greystone, rng, 0.18);
    m.frustum(2.6, 0.3, 2.4, 2.6, 2.4, 0, 0, F_ALL);
    kit.p().t(0, 0.3, 0); m.merlons(2.6, 2.4, 0.5, 3, true); kit.o();
    kit.o();
    kit.p().t(0, 0, -1.1); windows(kit, 1, 0.2, 0.9, 1.3, 0, PAL.hearth, 1); kit.o();
    kit.o();
    kit.p().t(-half * 0.8, ph, 1.9); brazier(kit, rng, 0.8, 1.1, PAL.iron, PAL.brazier); kit.o();
    for (let i = 0; i < 2 + T; i++) {
      kit.p().t(-half * 0.2 + i * 1.5, ph, 2.2 + (rng() - 0.5) * 0.8).ry(rng() * TAU);
      crate(kit, rng, 0.8 + rng() * 0.3, PAL.timber);
      kit.o();
    }
    kit.p().t(half * 0.1, ph, 1.4); lampPost(kit, rng, 2.6, PAL.brazier, PAL.iron); kit.o();
  } else {
    // hold: a loading dock. High, iron, and unpleasant to be on.
    const pd = 4.6, ph = 1.6;
    platform(kit, rng, L, pd, ph, PAL.basalt, PAL.slag, PAL.rust);
    // gantry straddling the track
    const gn = Math.max(2, Math.round(L / 5.5));
    for (let i = 0; i <= gn; i++) {
      const x = -half + (L / gn) * i;
      kit.p().t(x, 0, 0);
      mt.colj(PAL.rust, rng, 0.24);
      for (let s = -1; s <= 1; s += 2) {
        kit.p().t(0, 0, s * 3.4);
        mt.frustum(0.5, 6.2, 0.5, 0.36, 0.36, -s * 0.5, 0);
        kit.o();
      }
      kit.p().t(0, 6.2, 0);
      mt.box(0.5, 0.6, 6.4, F_ALL);
      m.colj(PAL.rust, rng, 0.3);
      kit.p().t(0, 0.6, 0).rz(0.1); m.spike(0.22, 1.3, 4); kit.o();
      kit.o();
      // a hook and chain over the track
      if (i % 2 === 1) {
        m.colj(PAL.iron, rng, 0.16);
        kit.p().t(0, 3.7, 0);
        m.box(0.13, 2.3, 0.13, F_ALL);
        kit.p().t(0, -0.35, 0).rz(Math.PI); m.spike(0.24, 0.7, 4); kit.o();
        kit.o();
      }
      kit.o();
    }
    // ore chutes feeding down onto the dock
    for (let i = 0; i < 2 + T; i++) {
      const x = -half * 0.8 + (L * 0.8 / (2 + T)) * i;
      kit.p().t(x, ph, 0.85 + pd * 0.8).ry(0.1 * (i % 2 ? 1 : -1));
      m.colj(PAL.basalt, rng, 0.26);
      m.frustum(1.9, 3.4, 1.7, 1.5, 1.4, 0, 0);
      kit.p().t(0, 3.4, 0);
      m.colj(PAL.rust, rng, 0.3);
      m.frustum(2.1, 0.4, 1.9, 1.9, 1.7, 0, 0, F_ALL);
      g.col(PAL.emberOrc, 0.8);
      kit.p().t(0, 0.4, 0); g.discY(0.7, 6); kit.o();
      kit.lantern(0, 0.6, 0, PAL.emberOrc);
      kit.o();
      kit.p().t(0, 1.2, -1.0).rx(0.5);
      m.colj(PAL.rust, rng, 0.24);
      m.box(1.3, 0.14, 1.9, F_ALL);
      kit.o();
      kit.o();
    }
    kit.p().t(-half * 0.85, ph, 2.4); brazier(kit, rng, 1.1, 1.5, PAL.rust, PAL.emberOrc); kit.o();
    for (let i = 0; i < 3; i++) {
      kit.p().t(half * (0.3 + i * 0.2), ph, 3.4 + (rng() - 0.5) * 0.6).ry(rng() * TAU).rz((rng() - 0.5) * 0.2);
      m.colj(PAL.rust, rng, 0.3);
      m.stake(0.16, 1.6 + rng() * 0.8, 4, 0.4);
      kit.o();
    }
    g.col(PAL.emberOrc, 0.14);
    kit.p().t(0, ph + 0.02, 0.85 + pd * 0.5); g.plate(L * 0.8, pd * 0.7); kit.o();
  }

  return wrapThing(kit, 'pw-station-' + kind, {
    platformLength: L,
    platformSide: 1,
    kind, tier: T,
  });
}

// ==========================================================================
// buildTunnelPortal — a mouth in a hillside. Dwarf-carved unless told
// otherwise. Bore axis is Z, the mouth faces -Z, sill at y = 0.
// ==========================================================================

export function buildTunnelPortal(params, THREE) {
  const p = params || {};
  const culture = ['dwarf', 'men', 'elf', 'orc', 'halfling'].indexOf(p.culture) >= 0 ? p.culture : 'dwarf';
  const seed = String(p.seed === undefined ? 'eardon' : p.seed);
  const rng = makeRng('pw-portal|' + culture + '|' + seed);
  const kit = newKit(THREE, p.shared);
  kit._ownTime = !(p.shared && p.shared.uTime);
  const m = kit.matte, mt = kit.metal, g = kit.glow;

  const ow = 6.2, oh = 6.6;               // clearance for a train and its steam
  const faceW = ow * 2.5, faceH = oh * 1.5;
  const stone = { dwarf: PAL.granite, men: PAL.sandstone, elf: PAL.birch, orc: PAL.basalt, halfling: PAL.whitewash }[culture];
  const trim = { dwarf: PAL.brass, men: PAL.slate, elf: PAL.verdigris, orc: PAL.rust, halfling: PAL.rock }[culture];
  const pointed = culture === 'dwarf' || culture === 'elf';

  // the hillside it goes into: a rough mass either side, so the portal reads
  // as cut rather than built. The host's terrain does the rest.
  const hillHex = culture === 'halfling' ? PAL.grass : culture === 'orc' ? PAL.slag : PAL.cliff;
  for (let s = -1; s <= 1; s += 2) {
    m.colj(hillHex, rng, 0.2);
    kit.p().t(s * faceW * 0.42, 0, 2.6).ry(s * 0.3);
    if (culture === 'halfling') m.dome(faceW * 0.5, faceH * 0.62, 5.5, 8, 2);
    else m.frustum(faceW * 0.6, faceH * (0.8 + rng() * 0.3), 6.5, faceW * 0.3, 3.0, s * 1.2, 1.4);
    kit.o();
  }
  m.colj(hillHex, rng, 0.16);
  kit.p().t(0, 0, 4.2);
  if (culture === 'halfling') m.dome(faceW * 0.62, faceH * 0.7, 7.0, 10, 3);
  else m.frustum(faceW * 1.05, faceH * 0.95, 8.0, faceW * 0.5, 4.0, 0, 1.8);
  kit.o();

  // the face
  m.colj(stone, rng, 0.1);
  m.frustum(faceW, faceH, 1.8, faceW * 0.9, 1.6, 0, 0.1);
  // wing walls, splayed
  for (let s = -1; s <= 1; s += 2) {
    kit.p().t(s * faceW * 0.5, 0, -0.2).ry(s * 0.62);
    m.colj(stone, rng, 0.12);
    m.frustum(5.2, faceH * 0.46, 1.5, 5.0, 1.2, s * 0.6, 0, FX | FNX | FZ | FNZ | FY);
    m.colj(trim, rng, 0.14);
    kit.p().t(0, faceH * 0.46, 0);
    m.frustum(5.3, 0.3, 1.7, 5.1, 1.5, s * 0.6, 0, F_ALL);
    kit.o();
    kit.o();
  }
  // the bore: a dark void, arched to taste
  kit.p().t(0, 0, -0.92);
  m.col(PAL.voidDark);
  m.panelZ(ow, pointed ? oh * 0.66 : oh * 0.62, -1);
  kit.p().t(0, pointed ? oh * 0.66 : oh * 0.62, 0);
  if (pointed) {
    m.tri(ow * 0.5, 0, 0, -ow * 0.5, 0, 0, 0, oh * 0.34, 0);
    m.tri(ow * 0.5, 0, 0, 0, oh * 0.34, 0, ow * 0.26, oh * 0.2, 0);
  } else {
    m.halfDiscZ(ow * 0.5, 9, -1);
  }
  kit.o();
  kit.o();
  // arch ring and voussoirs
  kit.p().t(0, pointed ? oh * 0.66 : oh * 0.62, -0.96);
  m.colj(stone, rng, 0.18);
  if (!pointed) archRim(m, ow * 0.5, ow * 0.62, 9, 0, true);
  kit.o();
  for (let s = -1; s <= 1; s += 2) {
    kit.p().t(s * (ow * 0.5 + ow * 0.06), 0, -0.96);
    m.colj(stone, rng, 0.18);
    m.box(ow * 0.12, oh * (pointed ? 0.66 : 0.62), 0.1, F_ALL);
    kit.o();
  }

  if (culture === 'dwarf') {
    // chevrons, brass caps, a rune plate, and spoil at the foot
    kit.p().t(0, oh * 1.06, -1.0);
    chevronBand(kit, rng, ow * 1.5, 9, 0.24);
    kit.o();
    for (let s = -1; s <= 1; s += 2) {
      kit.p().t(s * ow * 0.86, 0, -1.1);
      m.colj(PAL.granite, rng, 0.1);
      m.frustum(1.5, oh * 0.92, 1.3, 1.3, 1.15, 0, 0);
      mt.colj(PAL.brass, rng, 0.1);
      kit.p().t(0, oh * 0.92, 0);
      mt.frustum(1.7, 0.4, 1.5, 1.35, 1.2, 0, 0, F_ALL);
      kit.o();
      kit.o();
    }
    m.colj(PAL.granite, rng, 0.14);
    kit.p().t(0, oh * 1.2, -1.05);
    m.box(ow * 0.9, 1.1, 0.24, F_ALL);
    g.col(PAL.ember, 0.9);
    for (let i = 0; i < 5; i++) {
      kit.p().t(-ow * 0.28 + (ow * 0.14) * i, 0, -0.14);
      g.panelZ(0.16, 0.44, -1);
      kit.o();
    }
    kit.lantern(0, 0.3, -0.9, PAL.ember);
    kit.o();
    for (let i = 0; i < 4; i++) {
      const x = (rng() - 0.5) * faceW * 1.1;
      m.colj(PAL.scree, rng, 0.2);
      kit.p().t(x, 0, -1.5 - rng() * 1.6);
      m.dome(1.1 + rng() * 0.8, 0.5 + rng() * 0.4, 1.0 + rng() * 0.7, 6, 1);
      kit.o();
    }
  } else if (culture === 'men') {
    // a keystone, a date stone nobody can read, slate coping
    m.colj(PAL.sandstone, rng, 0.2);
    kit.p().t(0, oh * 0.62 + ow * 0.5 - 0.3, -1.05);
    m.box(0.9, 1.2, 0.22, F_ALL);
    kit.o();
    m.colj(PAL.slate, rng, 0.1);
    kit.p().t(0, faceH, 0);
    m.frustum(faceW * 0.92, 0.4, 2.1, faceW * 0.88, 1.9, 0, 0, F_ALL);
    kit.o();
    m.colj(PAL.whitewash, rng, 0.08);
    kit.p().t(ow * 0.9, oh * 0.9, -0.94);
    m.box(1.3, 0.9, 0.06, F_ALL);
    kit.o();
    kit.p().t(-ow * 0.95, 0, -1.3); lampPost(kit, rng, 3.0, PAL.hearth, PAL.iron); kit.o();
  } else if (culture === 'elf') {
    // they would rather it were not here, so it is at least thin
    mt.colj(PAL.verdigris, rng, 0.09);
    kit.p().t(0, 0, -1.0);
    for (let s = -1; s <= 1; s += 2) {
      kit.p().t(s * ow * 0.56, 0, 0);
      mt.frustum(0.34, oh * 1.02, 0.3, 0.22, 0.24, 0, 0);
      kit.p().t(0, oh * 1.02, 0);
      mt.cone(0.42, 1.5, 5, 1.8, 2);
      kit.o();
      kit.o();
    }
    kit.o();
    g.col(PAL.cold, 0.9);
    kit.p().t(0, oh * 1.16, -1.1); g.blob(0.22, 0.4, 0.22, rng, 0.04); kit.o();
    kit.lantern(0, oh * 1.16, -1.3, PAL.cold);
    kit.p().t(-faceW * 0.42, 0, -2.2);
    tree(kit, rng, 13, { clumps: 4, canopy: PAL.canopy, dark: PAL.floor });
    kit.o();
    // ivy, which arrived on its own and was permitted to stay
    kit.fol.sway = 0.12;
    for (let i = 0; i < 5; i++) {
      kit.fol.mix(PAL.canopyDark, PAL.canopy, rng(), 1);
      kit.p().t((rng() - 0.5) * faceW * 0.9, faceH * (0.3 + rng() * 0.6), -1.0);
      kit.fol.blob(0.8 + rng() * 0.5, 0.7, 0.3, rng, 0.4);
      kit.o();
    }
    kit.fol.sway = 0;
  } else if (culture === 'orc') {
    // spikes, half-raised bars, and something burning inside
    m.colj(PAL.basalt, rng, 0.24);
    kit.p().t(0, oh * 0.66, -1.1).rz(0.03);
    m.box(ow * 1.5, 1.4, 0.5, F_ALL);
    kit.p().t(0, 1.4, 0);
    orcSpikes(kit, rng, 7, 0.26, ow * 0.6, 1.8);
    kit.o();
    kit.o();
    mt.colj(PAL.rust, rng, 0.26);
    for (let k = 0; k < 5; k++) {
      kit.p().t(-ow * 0.34 + k * (ow * 0.17), oh * 0.42, -1.05).rz((rng() - 0.5) * 0.05);
      mt.stake(0.16, oh * 0.3, 4, 0.35);
      kit.o();
    }
    g.col(PAL.emberOrc, 0.5);
    kit.p().t(0, 0.1, -0.85); g.panelZ(ow * 0.9, oh * 0.5, -1); kit.o();
    spill(kit, ow * 1.1, 4.0, PAL.emberOrc, 0.2);
    kit.lantern(0, oh * 0.3, -1.6, PAL.emberOrc);
  } else {
    // halfling: a round mouth in a green hill, whitewashed, with a bench
    m.colj(PAL.whitewash, rng, 0.06);
    kit.p().t(0, oh * 0.62, -0.98);
    archRim(m, ow * 0.5, ow * 0.66, 9, 0, true);
    kit.o();
    kit.p().t(-ow * 0.9, 0, -1.6).ry(0.2); bench(kit, rng, 2.2, PAL.timber); kit.o();
    hedge(kit, rng, [[-faceW * 0.5, -2.4], [faceW * 0.5, -2.2]], 1.1, 0.8);
    kit.p().t(ow * 0.9, 0, -1.6); lampPost(kit, rng, 2.4, PAL.hearth, PAL.darkTimber); kit.o();
  }

  return wrapThing(kit, 'pw-portal-' + culture, {
    openingWidth: ow, openingHeight: oh, culture,
  });
}

// ==========================================================================
// buildBridgePier — one viaduct pier. The profile is a function of `height`
// alone so that a row of them reads as a row; only the stone varies by seed.
// The deck bears on exactly y = height.
// ==========================================================================

export function buildBridgePier(params, THREE) {
  const p = params || {};
  const H = clamp(typeof p.height === 'number' ? p.height : 12, 2.5, 90);
  const seed = String(p.seed === undefined ? 'eardon' : p.seed);
  const rng = makeRng('pw-pier|' + seed);
  const kit = newKit(THREE, p.shared);
  kit._ownTime = !(p.shared && p.shared.uTime);
  const m = kit.matte;

  const capW = 4.6, capD = 2.8;                 // deck bearing size
  const capH = 0.75;
  const shaftH = H - capH;
  const batter = clamp(1 + H * 0.028, 1.05, 1.55); // taller piers splay more
  const baseW = capW * batter, baseD = capD * batter;
  const plinthH = Math.min(0.9, H * 0.09);

  // stepped plinth
  m.colj(PAL.granite, rng, 0.1);
  m.frustum(baseW * 1.22, plinthH, baseD * 1.24, baseW * 1.14, baseD * 1.16, 0, 0);
  kit.p().t(0, plinthH, 0);
  m.colj(PAL.granite, rng, 0.12);
  m.frustum(baseW * 1.1, plinthH * 0.8, baseD * 1.12, baseW * 1.03, baseD * 1.04, 0, 0);
  kit.o();
  const y0 = plinthH + plinthH * 0.8;

  // the shaft, built in courses so the masonry reads from close up and the
  // silhouette stays clean from far away
  const nC = clamp(Math.round((shaftH - y0) / 4.2), 1, 9);
  const ch = (shaftH - y0) / nC;
  const wAt = (t) => capW * 0.98 + (baseW - capW * 0.98) * (1 - t);
  const dAt = (t) => capD * 0.98 + (baseD - capD * 0.98) * (1 - t);
  for (let i = 0; i < nC; i++) {
    const t0 = i / nC, t1 = (i + 1) / nC;
    kit.p().t(0, y0 + ch * i, 0);
    m.colj(PAL.granite, rng, 0.16);
    m.frustum(wAt(t0), ch, dAt(t0), wAt(t1), dAt(t1), 0, 0, F_SIDES);
    // string course at the top of every course but the last
    if (i < nC - 1) {
      kit.p().t(0, ch, 0);
      m.colj(PAL.granite, rng, 0.22);
      m.frustum(wAt(t1) + 0.24, 0.26, dAt(t1) + 0.24, wAt(t1) + 0.18, dAt(t1) + 0.18, 0, 0, F_ALL);
      kit.o();
    }
    kit.o();
  }

  // buttresses on the long faces of tall piers
  if (H > 16) {
    for (let s = -1; s <= 1; s += 2) {
      const bh = shaftH * 0.42;
      kit.p().t(0, y0, s * dAt(0) * 0.5);
      m.colj(PAL.granite, rng, 0.12);
      m.frustum(wAt(0) * 0.5, bh, 1.5, wAt(0) * 0.42, 0.5, 0, s * -0.5, FZ | FNZ | FX | FNX | FY);
      kit.o();
    }
  }

  // moulded cap: the deck sits on this
  kit.p().t(0, shaftH, 0);
  m.colj(PAL.granite, rng, 0.1);
  m.frustum(capW * 1.16, capH * 0.42, capD * 1.16, capW * 1.1, capD * 1.1, 0, 0);
  kit.p().t(0, capH * 0.42, 0);
  m.colj(PAL.granite, rng, 0.14);
  m.frustum(capW * 1.08, capH * 0.58, capD * 1.08, capW, capD, 0, 0);
  kit.o();
  kit.o();
  // bearing pads, so the deck has something to land on
  m.col(PAL.iron, 0.95);
  for (let s = -1; s <= 1; s += 2) {
    kit.p().t(0, H, s * capD * 0.3);
    m.box(capW * 0.8, 0.14, capD * 0.22, F_ALL);
    kit.o();
  }

  return wrapThing(kit, 'pw-pier', {
    height: H, capWidth: capW, capDepth: capD, bearingY: H,
  });
}
