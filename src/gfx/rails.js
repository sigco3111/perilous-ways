// Track. Rails, sleepers, ballast, piers, portals — built from the deck profile
// the router produced, so a viaduct appears exactly where the deck left the
// ground and a tunnel portal exactly where it went under.
//
// One merged mesh per link, vertex-coloured. Per-part meshes would be tidier to
// read and would also put four hundred draw calls on screen.

import * as THREE from 'three';
import { WORKS } from '../sim/route.js';
import { clamp, lerp } from '../rng.js';

const COL = {
  rail:     new THREE.Color('#a89e90'),
  railDark: new THREE.Color('#6f675d'),
  sleeper:  new THREE.Color('#6b5138'),
  ballast:  new THREE.Color('#8b857c'),
  deck:     new THREE.Color('#8a8278'),
  pier:     new THREE.Color('#7d7468'),
  portal:   new THREE.Color('#6e6a66'),
  brass:    new THREE.Color('#b08d57'),
  causeway: new THREE.Color('#7a6a52'),
};

const GAUGE = 2.4;          // world units between rail centres
const RAIL_W = 0.34;
const SLEEPER_STEP = 2.6;

/**
 * Accumulates a single indexed geometry with vertex colours.
 *
 * Every face gets its own four vertices and its own authored normal. Sharing
 * vertices between the faces of a sleeper and then calling computeVertexNormals
 * averages the normals across the corner and turns every sleeper, pier and rail
 * into a soft blob — correct for a hillside, ruinous for joinery.
 */
class Builder {
  constructor() {
    this.pos = []; this.nrm = []; this.col = []; this.idx = [];
  }
  get count() { return this.pos.length / 3; }

  /** One flat quad, wound p0->p1->p2->p3. */
  face(p0, p1, p2, p3, c) {
    const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2];
    const bx = p3[0] - p0[0], by = p3[1] - p0[1], bz = p3[2] - p0[2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    const base = this.count;
    for (const p of [p0, p1, p2, p3]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nrm.push(nx, ny, nz);
      this.col.push(c.r, c.g, c.b);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /** A box from a centre, a horizontal right-vector, and half-extents. */
  box(cx, cy, cz, rx, rz, hw, hh, hl, colour) {
    const rl = Math.hypot(rx, rz) || 1;
    const ux = rx / rl, uz = rz / rl;      // across the track
    const fx = -uz, fz = ux;               // along the track
    const P = (su, sy, sf) => [
      cx + ux * hw * su + fx * hl * sf,
      cy + hh * sy,
      cz + uz * hw * su + fz * hl * sf,
    ];
    const c = colour;
    this.face(P(-1, 1, -1), P(1, 1, -1), P(1, 1, 1), P(-1, 1, 1), c);      // top
    this.face(P(-1, -1, 1), P(1, -1, 1), P(1, -1, -1), P(-1, -1, -1), c);  // bottom
    this.face(P(-1, -1, -1), P(1, -1, -1), P(1, 1, -1), P(-1, 1, -1), c);  // back
    this.face(P(1, -1, 1), P(-1, -1, 1), P(-1, 1, 1), P(1, 1, 1), c);      // front
    this.face(P(-1, -1, 1), P(-1, -1, -1), P(-1, 1, -1), P(-1, 1, 1), c);  // left
    this.face(P(1, -1, -1), P(1, -1, 1), P(1, 1, 1), P(1, 1, -1), c);      // right
  }

  /**
   * A ribbon along a centreline. `rows` is [{x,y,z,ux,uz}]; the strip runs from
   * offset o0 to o1 across, sitting at `dy` above the deck, `thickness` deep.
   */
  ribbon(rows, o0, o1, dy, thickness, colour) {
    if (rows.length < 2) return;
    const at = (r, o, up) => [
      r.x + r.ux * o, r.y + dy + (up ? thickness : 0), r.z + r.uz * o,
    ];
    for (let i = 0; i < rows.length - 1; i++) {
      const r = rows[i], s = rows[i + 1];
      this.face(at(r, o0, 1), at(r, o1, 1), at(s, o1, 1), at(s, o0, 1), colour);   // top
      this.face(at(s, o0, 0), at(s, o1, 0), at(r, o1, 0), at(r, o0, 0), colour);   // underside
      this.face(at(r, o0, 0), at(r, o0, 1), at(s, o0, 1), at(s, o0, 0), colour);   // o0 flank
      this.face(at(s, o1, 0), at(s, o1, 1), at(r, o1, 1), at(r, o1, 0), colour);   // o1 flank
    }
  }

  toGeometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

/** Rows of frame data along the deck: position plus a horizontal right-vector. */
function frames(link) {
  const n = link.pts.length;
  const rows = [];
  for (let i = 0; i < n; i++) {
    const p = link.pts[i];
    const a = link.pts[Math.max(0, i - 1)];
    const b = link.pts[Math.min(n - 1, i + 1)];
    let tx = b.x - a.x, tz = b.z - a.z;
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl; tz /= tl;
    rows.push({ x: p.x, y: link.deck[i], z: p.z, ux: -tz, uz: tx, i });
  }
  return rows;
}

/**
 * Build one mesh for a link.
 * @returns { mesh, portals:[{pos,rot}], dispose() }
 */
export function buildTrack(link, world, material) {
  const rows = frames(link);
  const B = new Builder();
  const kinds = link.kinds;
  const step = link.step;
  const portals = [];

  // group the samples into runs of the same works so we can treat each properly
  const runs = [];
  let i = 0;
  while (i < rows.length) {
    let j = i;
    while (j < rows.length && kinds[j] === kinds[i]) j++;
    runs.push({ kind: kinds[i], i0: i, i1: j - 1 });
    i = j;
  }

  for (const run of runs) {
    const seg = rows.slice(run.i0, run.i1 + 1);
    if (seg.length < 2) continue;

    if (run.kind === WORKS.TUNNEL) {
      // nothing visible underground; the portals tell the story
      const mouth = (r, sign) => {
        const nx = sign * -r.uz, nz = sign * r.ux;
        portals.push({
          x: r.x, y: r.y, z: r.z,
          angle: Math.atan2(nz, nx),
        });
      };
      mouth(seg[0], -1);
      mouth(seg[seg.length - 1], 1);
      continue;
    }

    const onStructure = run.kind === WORKS.VIADUCT || run.kind === WORKS.BRIDGE || run.kind === WORKS.SPAN;

    if (onStructure) {
      // deck slab, wider than the track, with piers down to the ground
      B.ribbon(seg, -3.5, 3.5, -1.5, 1.1, COL.deck);
      // parapet
      B.ribbon(seg, -3.7, -3.1, -0.4, 1.5, COL.deck);
      B.ribbon(seg, 3.1, 3.7, -0.4, 1.5, COL.deck);

      const spacing = 22;
      let acc = spacing * 0.6;
      for (let k = 1; k < seg.length; k++) {
        const r = seg[k];
        acc += Math.hypot(r.x - seg[k - 1].x, r.z - seg[k - 1].z);
        if (acc < spacing) continue;
        acc = 0;
        const ground = world.heightAt(r.x, r.z);
        const h = r.y - 1.5 - ground;
        if (h < 2.2) continue;
        const hh = h / 2;
        // taper: wider at the base
        B.box(r.x, ground + hh, r.z, r.ux, r.uz, 1.5, hh, 1.15, COL.pier);
        if (h > 14) {
          // a cross-brace on tall piers, which is what makes a viaduct read
          B.box(r.x, ground + h * 0.42, r.z, r.ux, r.uz, 2.4, 0.42, 0.5, COL.pier);
        }
      }
    } else if (run.kind === WORKS.CAUSEWAY) {
      B.ribbon(seg, -4.2, 4.2, -1.9, 1.0, COL.causeway);
      B.ribbon(seg, -3.0, 3.0, -0.9, 0.7, COL.ballast);
    } else {
      // at grade: ballast shoulder following the deck
      B.ribbon(seg, -3.0, 3.0, -1.05, 0.55, COL.ballast);
      B.ribbon(seg, -2.2, 2.2, -0.55, 0.45, COL.ballast);
    }

    // sleepers
    let sacc = 0;
    for (let k = 1; k < seg.length; k++) {
      const r = seg[k];
      sacc += Math.hypot(r.x - seg[k - 1].x, r.z - seg[k - 1].z);
      if (sacc < SLEEPER_STEP) continue;
      sacc = 0;
      B.box(r.x, r.y - 0.05, r.z, r.ux, r.uz, 2.0, 0.2, 0.42, COL.sleeper);
    }

    // the rails themselves
    for (const side of [-1, 1]) {
      const o = side * GAUGE * 0.5;
      B.ribbon(seg, o - RAIL_W / 2, o + RAIL_W / 2, 0.1, 0.34, COL.rail);
    }
  }

  const geo = B.toGeometry();
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.linkId = link.id;
  return { mesh, portals, dispose: () => geo.dispose() };
}

/**
 * A floating coloured ribbon over the track, so the player can read which
 * service runs where. Drawn only for a selected or hovered line.
 */
export function buildLineOverlay(links, colour, lift = 3.6) {
  const B = new Builder();
  const c = new THREE.Color(colour);
  for (const link of links) {
    const rows = frames(link);
    // 2.4 units half-width: wide enough to survive a 500-unit camera pull-back
    B.ribbon(rows, -2.4, 2.4, lift, 0.3, c);
  }
  const geo = B.toGeometry();
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.82,
    depthWrite: false, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 6;
  return { mesh, dispose: () => { geo.dispose(); mat.dispose(); } };
}

/**
 * The dashed preview of a route being surveyed but not yet bought. Red where the
 * works are expensive, so the player can see the tunnel before paying for it.
 */
export function buildSurveyPreview(survey, ok = true) {
  const link = { pts: survey.pts, deck: survey.deck, kinds: survey.kinds, step: survey.step };
  const rows = frames(link);
  const B = new Builder();
  const good = new THREE.Color(ok ? '#f2e2b8' : '#c94f3d');
  const costly = new THREE.Color(ok ? '#e08a3c' : '#c94f3d');
  // dashes, so it reads as provisional
  for (let i = 0; i < rows.length - 1; i += 2) {
    const seg = rows.slice(i, Math.min(rows.length, i + 2));
    if (seg.length < 2) break;
    const k = survey.kinds[i];
    const c = (k === WORKS.TUNNEL || k === WORKS.VIADUCT || k === WORKS.SPAN) ? costly : good;
    B.ribbon(seg, -1.5, 1.5, 3.0, 0.3, c);
  }
  const geo = B.toGeometry();
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 7;
  return { mesh, dispose: () => { geo.dispose(); mat.dispose(); } };
}

export function trackMaterial(shared) {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.78, metalness: 0.18,
  });
  // Share the cloud shadow so track darkens under cloud along with the ground.
  // The convention is terrain.js's: uCloudXf = (offsetU, offsetV, worldScale,
  // strength), two layers multiplied out of the .r and .g channels.
  if (shared?.uCloud && shared?.uCloudXf) {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uCloud = shared.uCloud;
      sh.uniforms.uCloudXf = shared.uCloudXf;
      sh.vertexShader = sh.vertexShader.replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vRailWP;',
      ).replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\n\tvRailWP = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      );
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <common>',
        `#include <common>
varying vec3 vRailWP;
uniform sampler2D uCloud;
uniform vec4 uCloudXf;`,
      ).replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
{
  vec2 cuv = vRailWP.xz * uCloudXf.z + uCloudXf.xy;
  float ca = texture2D(uCloud, cuv).r;
  float cb = texture2D(uCloud, cuv * 0.53 - uCloudXf.xy * 0.7).g;
  float shade = mix(1.0, ca * cb, uCloudXf.w);
  reflectedLight.directDiffuse *= shade;
  reflectedLight.directSpecular *= shade;
}`,
      );
    };
    mat.customProgramCacheKey = () => 'pw-track-cloud';
  }
  return mat;
}
