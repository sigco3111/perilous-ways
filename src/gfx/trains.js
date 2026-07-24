// ---------------------------------------------------------------------------
// trains.js — rolling stock, steam and sparks.
//
// Everything here is built from merged vertex-coloured geometry: one draw call
// per material per train, whatever the car count.
//
//   metal  — iron, brass, painted plate            (semi-metallic, tight spec)
//   matte  — timber, canvas, coal, ore, cloth      (rough, non-metallic)
//   glow   — windows, lamp lenses, ember mouths    (emissive, night-driven)
//   wheel  — every wheel and coupling rod on the train, spun in the vertex
//            shader so 22 wheels still cost one draw call
//
// Conventions
//   * local +Z is FORWARD (matches Object3D.lookAt, which aims local +Z at the
//     target), +Y up, origin at the centre of the car / train, y = 0 at the
//     railhead. `length` is measured along Z.
//   * wheels roll by rotating about their own local X: `w.rotation.x += d / r`.
//   * deterministic in `seed`; no textures beyond a procedural DataTexture.
//
// About `wheels`
//   Every wheel on a train is merged into ONE mesh and spun in the vertex
//   shader, because 22 separate wheel meshes per train times 25 trains would
//   eat half the scene's draw-call budget on its own. So `wheels[i]` is an
//   Object3D *spin proxy*, parented at that wheel's axle centre: set or add to
//   `.rotation.x` exactly as if it were the wheel mesh, and the batch picks the
//   angle up in onBeforeRender. Proxies are also correctly placed for reading
//   `getWorldPosition()` (spark emitters). They carry no geometry, so do not
//   look for `.material` on them; `train.materials.wheel` is the real one.
//
// THREE is passed in, never imported, so the host owns the three instance.
// ---------------------------------------------------------------------------

import { makeRng, clamp, lerp } from '../rng.js';

/**
 * Track gauge, i.e. distance between wheel centres — matches `GAUGE` in
 * src/gfx/rails.js. Stock is authored at BASE_GAUGE and scaled up uniformly, so
 * passing `{ gauge }` to any builder rescales the whole vehicle to fit whatever
 * track it is put on.
 */
export const TRAIN_GAUGE = 2.4;
const BASE_GAUGE = 1.5;

/** Styles, in the two vocabularies the design docs use. */
const STYLE_ALIAS = {
  dwarf: 'dwarf', delver: 'dwarf',
  men: 'men', march: 'men', man: 'men',
  elf: 'elf', aelin: 'elf', elven: 'elf',
  orc: 'orc', wrack: 'orc',
};
const normStyle = (s) => STYLE_ALIAS[String(s || 'dwarf').toLowerCase()] || 'dwarf';

// --- palette (ART.md; do not invent) ---------------------------------------
const P = {
  iron: 0x4a4a52,
  ironDark: 0x33333a,
  brass: 0xb08d57,
  brassDim: 0x8a6d42,
  copper: 0x7fae9d,
  coal: 0x1c1a1c,
  railhead: 0xa89e90,
  timber: 0x7a5c3c,
  timberDark: 0x4a3626,
  birch: 0xded6c4,
  silver: 0xc8d4d8,
  rust: 0x7a3a28,
  basalt: 0x25222a,
  ember: 0xff5a1e,
  emberHot: 0xff6a2a,
  slate: 0x5a6068,
  sandstone: 0xc9b393,
  banner: 0x9e3b3b,
  canvas: 0xcbbb96,
  granite: 0x6e6a66,
  grass: 0x7d9a4e,
  lamp: 0xffd7a3,
  window: 0xffc98a,
  ore: 0x3a3540,
  oreGlint: 0x6d6478,
  paintMen: 0x4a5f5c,
  paintMenTrim: 0x8a6f47,
};

// ---------------------------------------------------------------------------
// Geometry accumulation
// ---------------------------------------------------------------------------

function newBucket(colorSize, isWheel) {
  return { p: [], n: [], c: [], i: [], v: 0, cs: colorSize, wheel: !!isWheel, wc: [], wp: [] };
}

function makeCtx(THREE, rng, opts = {}) {
  const S = (opts.gauge || TRAIN_GAUGE) / BASE_GAUGE;
  return {
    THREE, rng,
    S,                     // authoring units -> world units, baked into every push
    gauge: BASE_GAUGE,     // wheelsets are laid out in authoring units
    zoff: 0,               // z of the car currently being built, within a train
    metal: newBucket(3), matte: newBucket(3), glow: newBucket(4),
    wheelB: newBucket(3, true),
    wheels: [],            // { x, y, z, r, slot } — already in world units
    _m: new THREE.Matrix4(), _ms: new THREE.Matrix4().makeScale(S, S, S),
    _q: new THREE.Quaternion(), _e: new THREE.Euler(), _v: new THREE.Vector3(),
    _colCache: new Map(),
  };
}

/** Linear-space rgb triple for an sRGB hex, cached. Optional brightness mul. */
function col(ctx, hex, mul) {
  let c = ctx._colCache.get(hex);
  if (!c) { const t = new ctx.THREE.Color(hex); c = [t.r, t.g, t.b]; ctx._colCache.set(hex, c); }
  return (mul === undefined || mul === 1) ? c : [c[0] * mul, c[1] * mul, c[2] * mul];
}

/**
 * Compose a transform in authoring units, then premultiply the uniform gauge
 * scale so everything lands in world units. r* are radians (XYZ order).
 * NB the local scale is applied before the rotation, so a rotated part must be
 * built round-then-rotated, never scaled-then-rotated (that shears).
 */
function xf(ctx, x, y, z, rx, ry, rz, sx, sy, sz) {
  ctx._e.set(rx || 0, ry || 0, rz || 0, 'XYZ');
  ctx._q.setFromEuler(ctx._e);
  ctx._m.compose(
    ctx._v.set(x || 0, y || 0, (z || 0) + ctx.zoff), ctx._q,
    new ctx.THREE.Vector3(sx === undefined ? 1 : sx, sy === undefined ? 1 : sy, sz === undefined ? 1 : sz),
  );
  return ctx._m.premultiply(ctx._ms);
}

// Painterly vertical shading: undersides sit in their own shadow. Applied to
// every opaque vertex so merged stock never reads as flat plastic.
const AO_LO = 0.70, AO_HI = 2.9;
function aoAt(y, strength) {
  const t = clamp((y - 0.05) / AO_HI, 0, 1);
  const f = AO_LO + (1 - AO_LO) * (0.35 + 0.65 * t) / 1.0;
  return 1 - (1 - f) * (strength === undefined ? 1 : strength);
}

/**
 * Transform `geo` by `m` and append it to bucket `bk`.
 * colour: [r,g,b] linear, or fn(x, y, z, nx, ny, nz) -> [r,g,b].
 * opt: { ao, alpha, flip, mottle, wheel:{ cx,cy,cz, rate, mode, index } }
 */
function push(ctx, bk, geo, m, colour, opt) {
  const o = opt || {};
  geo.applyMatrix4(m);
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const n = pos.count, base = bk.v;
  const fn = typeof colour === 'function';
  const mott = o.mottle || 0;
  const aoS = o.ao === undefined ? 1 : o.ao;
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let nx = 0, ny = 1, nz = 0;
    if (nor) { nx = nor.getX(i); ny = nor.getY(i); nz = nor.getZ(i); }
    bk.p.push(x, y, z);
    bk.n.push(nx, ny, nz);
    const c = fn ? colour(x, y, z, nx, ny, nz) : colour;
    let k = aoS > 0 ? aoAt(y / ctx.S, aoS) : 1;   // AO curve is in authoring units
    if (mott) k *= 1 - mott * ctx.rng();
    bk.c.push(c[0] * k, c[1] * k, c[2] * k);
    if (bk.cs === 4) bk.c.push(o.alpha === undefined ? 0 : o.alpha);
    if (bk.wheel) {
      const w = o.wheel;
      bk.wc.push(w.cx, w.cy, w.cz);
      bk.wp.push(w.rate, w.mode || 0, w.index || 0);
    }
  }
  const idx = geo.index;
  if (idx) {
    if (o.flip) for (let i = idx.count - 3; i >= 0; i -= 3) bk.i.push(base + idx.getX(i + 2), base + idx.getX(i + 1), base + idx.getX(i));
    else for (let i = 0; i < idx.count; i++) bk.i.push(base + idx.getX(i));
  } else {
    if (o.flip) for (let i = n - 3; i >= 0; i -= 3) bk.i.push(base + i + 2, base + i + 1, base + i);
    else for (let i = 0; i < n; i++) bk.i.push(base + i);
  }
  if (o.flip && nor) {
    const s = base * 3;
    for (let i = s; i < bk.n.length; i++) bk.n[i] = -bk.n[i];
  }
  bk.v += n;
  geo.dispose();
}

// --- primitives -------------------------------------------------------------

/** Axis-aligned box, centre at (x,y,z), optional euler. */
function box(ctx, bk, c, w, h, d, x, y, z, rx, ry, rz, opt) {
  push(ctx, bk, new ctx.THREE.BoxGeometry(1, 1, 1), xf(ctx, x, y, z, rx, ry, rz, w, h, d), c, opt);
}

/**
 * Cylinder / cone / tapered prism. Axis along Y unless rotated.
 * seg 4 + ry=PI/4 + non-uniform scale gives a cheap tapered rectangular prism.
 */
function cyl(ctx, bk, c, rt, rb, h, seg, x, y, z, rx, ry, rz, open, opt, thetaStart, thetaLen) {
  const g = new ctx.THREE.CylinderGeometry(rt, rb, h, seg, 1, !!open, thetaStart, thetaLen);
  const o = opt || {};
  push(ctx, bk, g, xf(ctx, x, y, z, rx, ry, rz, o.sx, o.sy, o.sz), c, opt);
}

/** Flat disc facing +Z by default. */
function disc(ctx, bk, c, r, seg, x, y, z, rx, ry, rz, opt) {
  push(ctx, bk, new ctx.THREE.CircleGeometry(r, seg), xf(ctx, x, y, z, rx, ry, rz), c, opt);
}

/** Quad facing +Z by default (windows, plates). */
function quad(ctx, bk, c, w, h, x, y, z, rx, ry, rz, opt) {
  push(ctx, bk, new ctx.THREE.PlaneGeometry(w, h), xf(ctx, x, y, z, rx, ry, rz), c, opt);
}

/** Flat annulus facing +Z — wheel faces, boiler bands seen end-on. */
function ring(ctx, bk, c, ri, ro, seg, x, y, z, rx, ry, rz, opt) {
  push(ctx, bk, new ctx.THREE.RingGeometry(ri, ro, seg, 1), xf(ctx, x, y, z, rx, ry, rz), c, opt);
}

/** Curved roof shell: an arc of cylinder wall, arching across X, spanning d in Z. */
function arch(ctx, bk, c, r, d, span, seg, x, y, z, opt) {
  cyl(ctx, bk, c, r, r, d, seg, x, y, z, Math.PI / 2, 0, 0, true, opt, Math.PI - span / 2, span);
}

// ---------------------------------------------------------------------------
// Materials
//
// metal + matte are shared by every train (no per-train state, so sharing them
// keeps renderer state changes down). glow and wheel carry per-train uniforms so
// each train gets its own instance — they still share one compiled program
// thanks to customProgramCacheKey.
//
// Hosts wiring the shared uTime/uWind/uCloud uniforms in: CHAIN onBeforeCompile,
// do not overwrite it — glow and wheel already use theirs.
// ---------------------------------------------------------------------------

const WHEEL_SLOTS = 32;
const _shared = new WeakMap();

function sharedMats(THREE) {
  let s = _shared.get(THREE);
  if (s) return s;
  s = {
    metal: new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.48, metalness: 0.42, flatShading: false, name: 'pw-stock-metal',
    }),
    matte: new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.88, metalness: 0.03, flatShading: false, name: 'pw-stock-matte',
    }),
  };
  _shared.set(THREE, s);
  return s;
}

function glowMaterial(THREE) {
  const uNight = { value: 0.08 };
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.35, metalness: 0.0, name: 'pw-stock-glow',
    // dark base colour so panes read as glass by day; the emissive term (below)
    // is what lights them, and it is driven by uNight.
    color: new THREE.Color(0x34363d),
    emissive: new THREE.Color(0xffffff), emissiveIntensity: 0.92,
  });
  m.userData.uNight = uNight;
  m.customProgramCacheKey = () => 'pw-glow';
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = uNight;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight;')
      // vColor is vec4 here (the glow bucket always writes 4 components).
      // alpha 1 = always lit (embers, tail lamps), 0 = night-only (windows).
      .replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vColor.rgb * mix( uNight, 1.0, vColor.a );');
  };
  return m;
}

function wheelMaterial(THREE) {
  const uWA = { value: new Float32Array(WHEEL_SLOTS) };
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.55, metalness: 0.5, flatShading: false, name: 'pw-stock-wheel',
  });
  m.userData.uWA = uWA;
  m.customProgramCacheKey = () => 'pw-wheel';
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uWA = uWA;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', [
        '#include <common>',
        'attribute vec3 aWheelC;',   // rotation centre, or crank offset when mode = 1
        'attribute vec3 aWheelP;',   // (rate, mode, slot)
        'uniform float uWA[' + WHEEL_SLOTS + '];',
        'mat3 pwSpinX( float a ) {',
        '  float c = cos( a ), s = sin( a );',
        '  return mat3( 1.0, 0.0, 0.0,  0.0, c, s,  0.0, -s, c );',
        '}',
      ].join('\n'))
      .replace('#include <beginnormal_vertex>', [
        '#include <beginnormal_vertex>',
        'mat3 pwR = pwSpinX( uWA[ int( aWheelP.z + 0.5 ) ] * aWheelP.x );',
        'objectNormal = mix( pwR * objectNormal, objectNormal, aWheelP.y );',
      ].join('\n'))
      .replace('#include <begin_vertex>', [
        '#include <begin_vertex>',
        'transformed = mix( pwR * ( transformed - aWheelC ) + aWheelC,',
        '                   transformed + ( pwR * aWheelC - aWheelC ), aWheelP.y );',
      ].join('\n'));
  };
  return m;
}

// --- procedural sprite ------------------------------------------------------

/** Soft round puff, 64x64 RGBA. Slightly lobed so puffs are not perfect discs. */
function puffTexture(THREE) {
  const N = 64, d = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const fx = (x + 0.5) / N * 2 - 1, fy = (y + 0.5) / N * 2 - 1;
      const th = Math.atan2(fy, fx);
      const wob = 1 + 0.11 * Math.sin(th * 3 + 0.7) + 0.07 * Math.sin(th * 5 - 1.9);
      const r = Math.hypot(fx, fy) / wob;
      let a = 1 - clamp(r, 0, 1);
      a = a * a * (3 - 2 * a);                       // smoothstep
      a = Math.pow(a, 1.35) * (0.86 + 0.14 * (1 - r * r));
      const i = (y * N + x) * 4;
      d[i] = 255; d[i + 1] = 255; d[i + 2] = 255;
      d[i + 3] = Math.max(0, Math.min(255, Math.round(a * 255)));
    }
  }
  const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat);
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------------------
// Wheels
// ---------------------------------------------------------------------------

/**
 * One wheelset (two wheels on a common axle). Both wheels share a spin slot;
 * each gets its own proxy so the host can read a wheel's world position (for
 * sparks) as well as turn it.
 * a = { z, r, width, spokes, half, tyre, face, hub, crank, seg, rate }
 */
function wheelset(ctx, a) {
  const slot = ctx.wheels.length ? ctx.wheels[ctx.wheels.length - 1].slot + 1 : 0;
  const r = a.r, w = a.width, y = r, half = a.half === undefined ? ctx.gauge / 2 : a.half;
  const seg = a.seg || 8;
  const rate = a.rate === undefined ? 1 : a.rate;
  const tyre = col(ctx, a.tyre || P.ironDark);
  const face = col(ctx, a.face || P.iron);
  const S = ctx.S;
  for (let s = -1; s <= 1; s += 2) {
    const cx = s * half;
    // aWheelC and the proxies live in world units, next to the merged vertices
    const wh = { cx: cx * S, cy: y * S, cz: (a.z + ctx.zoff) * S, rate, mode: 0, index: slot % WHEEL_SLOTS };
    const o = { wheel: wh, ao: 0.5 };
    const xo = cx + s * w * 0.5;                        // outer face plane
    const fr = s * Math.PI / 2;                         // face normal outward along X
    cyl(ctx, ctx.wheelB, tyre, r, r, w, seg, cx, y, a.z, 0, 0, Math.PI / 2, true, o);
    // polished tread band: only worth the triangles on the big wheels
    if (r >= 0.42) {
      cyl(ctx, ctx.wheelB, col(ctx, P.railhead, 0.72), r * 1.008, r * 1.008, w * 0.34, seg, cx, y, a.z, 0, 0, Math.PI / 2, true, o);
    }
    if (a.spokes) {
      ring(ctx, ctx.wheelB, face, r * 0.56, r * 0.97, seg, xo, y, a.z, 0, fr, 0, o);
      disc(ctx, ctx.wheelB, col(ctx, a.hub || P.iron, 1.14), r * 0.23, 6, xo + s * 0.012, y, a.z, 0, fr, 0, o);
      const nsp = a.spokes;
      for (let k = 0; k < nsp; k++) {
        const th = (k / nsp) * Math.PI * 2 + 0.25, len = r * 0.76;
        // euler (0, s*90, s*th) turns the quad's +Y into (0, cos th, sin th),
        // so the centre must be offset along the same direction to be radial
        quad(ctx, ctx.wheelB, col(ctx, a.face || P.iron, 0.92), r * 0.14, len,
          xo, y + Math.cos(th) * len * 0.5, a.z + Math.sin(th) * len * 0.5, 0, fr, s * th, o);
      }
    } else {
      disc(ctx, ctx.wheelB, face, r * 0.97, seg, xo, y, a.z, 0, fr, 0, o);
      if (r >= 0.42) disc(ctx, ctx.wheelB, col(ctx, a.hub || P.iron, 1.1), r * 0.2, 6, xo + s * 0.01, y, a.z, 0, fr, 0, o);
    }
    if (a.crank) {   // counterweight, opposite the crank pin
      box(ctx, ctx.wheelB, col(ctx, P.iron, 0.88), 0.05, r * 0.32, r * 0.52, xo + s * 0.02, y + r * 0.4, a.z, 0, 0, 0, o);
    }
    ctx.wheels.push({ x: cx * S, y: y * S, z: (a.z + ctx.zoff) * S, r: r * S, slot, side: s });
  }
  return slot;
}

/** Coupling rod joining two driver axles: orbits with the crank, never rotates. */
function couplingRod(ctx, z0, z1, r, crank, slot, width, half) {
  const zc = (z0 + z1) / 2, span = Math.abs(z1 - z0);
  const hx = (half === undefined ? ctx.gauge / 2 : half) + width * 0.5 + 0.05;
  for (let s = -1; s <= 1; s += 2) {
    // mode 1: aWheelC is the crank-pin offset (a displacement, so also scaled)
    const o = { wheel: { cx: 0, cy: -crank * ctx.S, cz: 0, rate: 1, mode: 1, index: slot % WHEEL_SLOTS }, ao: 0.45 };
    box(ctx, ctx.wheelB, col(ctx, P.railhead, 0.6), 0.05, 0.1, span + 0.2, s * hx, r - crank, zc, 0, 0, 0, o);
    disc(ctx, ctx.wheelB, col(ctx, P.brass, 0.95), 0.07, 6, s * (hx + 0.03), r - crank, z0, 0, s * Math.PI / 2, 0, o);
    disc(ctx, ctx.wheelB, col(ctx, P.brass, 0.95), 0.07, 6, s * (hx + 0.03), r - crank, z1, 0, s * Math.PI / 2, 0, o);
  }
}

// ---------------------------------------------------------------------------
// Finalise: buckets -> meshes
// ---------------------------------------------------------------------------

function bucketMesh(ctx, bk, mat, name) {
  if (!bk.v) return null;
  const THREE = ctx.THREE;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(bk.p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(bk.n, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(bk.c, bk.cs));
  if (bk.wheel) {
    g.setAttribute('aWheelC', new THREE.Float32BufferAttribute(bk.wc, 3));
    g.setAttribute('aWheelP', new THREE.Float32BufferAttribute(bk.wp, 3));
  }
  g.setIndex(bk.i);
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, mat);
  m.name = name;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Assemble group, spin proxies, setNight, dispose from a filled ctx. */
function finish(ctx, meta) {
  const THREE = ctx.THREE;
  const sh = sharedMats(THREE);
  const group = new THREE.Group();
  group.name = (meta && meta.name) || 'pw-stock';
  const meshes = [];
  const add = (bk, mat, nm) => {
    const m = bucketMesh(ctx, bk, mat, nm);
    if (m) { group.add(m); meshes.push(m); }
    return m;
  };
  add(ctx.metal, sh.metal, 'metal');
  add(ctx.matte, sh.matte, 'matte');
  const glowMat = ctx.glow.v ? glowMaterial(THREE) : null;
  if (glowMat) add(ctx.glow, glowMat, 'glow');
  const wheelMat = ctx.wheelB.v ? wheelMaterial(THREE) : null;
  const wheelMesh = wheelMat ? add(ctx.wheelB, wheelMat, 'wheels') : null;

  // Spin proxies: empty Object3Ds, so no draw cost but correct world transforms.
  const src = ctx.wheels;
  const wheels = src.map((w, i) => {
    const o = new THREE.Object3D();
    o.name = 'wheel-' + i;
    o.position.set(w.x, w.y, w.z);
    o.userData.isWheelProxy = true;
    o.userData.wheelRadius = w.r;
    o.userData.slot = w.slot;
    group.add(o);
    return o;
  });

  if (wheelMesh) {
    const uWA = wheelMat.userData.uWA.value;
    wheelMesh.onBeforeRender = () => {
      for (let i = 0; i < src.length; i++) {
        const rot = wheels[i].rotation;
        uWA[src[i].slot % WHEEL_SLOTS] = rot.x !== 0 ? rot.x : rot.z;
      }
    };
  }

  const setNight = (t) => {
    const k = clamp(t === undefined ? 0 : t, 0, 1);
    if (glowMat) glowMat.userData.uNight.value = 0.05 + 0.9 * (k * k * (3 - 2 * k));
  };
  setNight(0);

  const setWheelAngle = (a) => { for (let i = 0; i < wheels.length; i++) wheels[i].rotation.x = a; };
  const advance = (d) => { for (let i = 0; i < wheels.length; i++) wheels[i].rotation.x += d / (src[i].r || 1); };

  const dispose = () => {
    for (const m of meshes) m.geometry.dispose();
    if (glowMat) glowMat.dispose();
    if (wheelMat) wheelMat.dispose();
  };

  return {
    group, meshes, wheels, setNight, setWheelAngle, advance, dispose,
    materials: { metal: sh.metal, matte: sh.matte, glow: glowMat, wheel: wheelMat },
    forward: new THREE.Vector3(0, 0, 1), wheelAxis: 'x',
  };
}

// ---------------------------------------------------------------------------
// Shared car furniture
// ---------------------------------------------------------------------------

/** Underframe, buffer beams, buffers, coupling hooks. Returns nothing. */
function underframe(ctx, o) {
  const M = ctx.metal, L = o.length, hz = L / 2;
  const fw = o.frameWidth === undefined ? 1.24 : o.frameWidth;
  const beam = col(ctx, o.beam || P.ironDark);
  const frame = col(ctx, o.frame || P.ironDark);
  box(ctx, M, frame, fw, 0.3, L - 0.6, 0, o.frameY || 0.62, 0);
  for (let s = -1; s <= 1; s += 2) {
    box(ctx, M, beam, o.beamWidth || 2.2, 0.4, 0.18, 0, (o.frameY || 0.62) + 0.08, s * (hz - 0.09));
    if (o.buffers !== false) {
      for (let t = -1; t <= 1; t += 2) {
        box(ctx, M, col(ctx, P.railhead, 0.7), 0.17, 0.17, 0.22,
          t * 0.62, (o.frameY || 0.62) + 0.1, s * (hz + 0.04));
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Engines
// ---------------------------------------------------------------------------

/**
 * dwarf — the realm's standard engine. Fat riveted brass-banded boiler, tall
 * flared stack, squat curved-roof cab, big spoked drivers with a coupling rod,
 * cowcatcher, bell, smokebox lamp. Stubby and over-engineered.
 */
function engineDwarf(ctx, rng) {
  const M = ctx.metal, T = ctx.matte, G = ctx.glow;
  const L = 6.4, hz = L / 2;
  const iron = col(ctx, P.iron), dark = col(ctx, P.ironDark), brass = col(ctx, P.brass);
  const brassDim = col(ctx, P.brassDim);
  underframe(ctx, { length: L, beamWidth: 2.2, frameWidth: 1.24 });

  // running boards
  for (let s = -1; s <= 1; s += 2) box(ctx, M, iron, 0.44, 0.08, 4.3, s * 0.9, 1.12, 0.5);

  // cowcatcher: sloped plate plus ribs
  box(ctx, M, dark, 1.9, 0.9, 0.07, 0, 0.46, hz + 0.14, -0.82, 0, 0);
  for (let k = -1; k <= 1; k += 2) {
    box(ctx, M, col(ctx, P.iron, 0.85), 0.07, 0.94, 0.1, k * 0.52, 0.47, hz + 0.16, -0.82, 0, 0);
  }

  // boiler: front radius smaller, firebox end fatter
  cyl(ctx, M, iron, 0.70, 0.78, 3.4, 12, 0, 1.60, 0.6, Math.PI / 2, 0, 0, true, { mottle: 0.05 });
  // riveted brass bands
  const bandR = (z) => lerp(0.78, 0.70, clamp((z + 1.1) / 3.4, 0, 1)) + 0.018;
  for (const z of [-0.55, 0.4, 1.35]) {
    cyl(ctx, M, brass, bandR(z), bandR(z), 0.11, 10, 0, 1.60, z, Math.PI / 2, 0, 0, true);
  }
  // smokebox and door
  cyl(ctx, M, dark, 0.80, 0.80, 0.66, 12, 0, 1.60, 2.61, Math.PI / 2, 0, 0, true);
  disc(ctx, M, col(ctx, P.ironDark, 1.1), 0.80, 12, 0, 1.60, 2.94);
  disc(ctx, M, brass, 0.5, 10, 0, 1.60, 2.96);

  // stack: tall, flared cap
  cyl(ctx, M, dark, 0.23, 0.27, 0.78, 10, 0, 2.70, 2.55, 0, 0, 0, true);
  cyl(ctx, M, brass, 0.42, 0.26, 0.3, 10, 0, 3.19, 2.55, 0, 0, 0, true);
  ring(ctx, M, brass, 0.27, 0.42, 8, 0, 3.34, 2.55, -Math.PI / 2, 0, 0);
  disc(ctx, T, col(ctx, P.coal, 1.4), 0.26, 8, 0, 3.31, 2.55, -Math.PI / 2, 0, 0, { ao: 0 });

  // steam dome + sand dome + valves + whistle
  cyl(ctx, M, brass, 0.32, 0.36, 0.36, 8, 0, 2.44, 0.9, 0, 0, 0, true);
  cyl(ctx, M, brass, 0.11, 0.33, 0.24, 8, 0, 2.70, 0.9, 0, 0, 0, true);
  disc(ctx, M, brass, 0.11, 6, 0, 2.82, 0.9, -Math.PI / 2, 0, 0);
  cyl(ctx, M, brassDim, 0.22, 0.26, 0.3, 6, 0, 2.44, 1.8, 0, 0, 0, true);
  cyl(ctx, M, brassDim, 0.07, 0.24, 0.16, 6, 0, 2.64, 1.8, 0, 0, 0, true);
  cyl(ctx, M, brass, 0.06, 0.06, 0.22, 5, 0.1, 2.42, -0.15, 0, 0, 0, true);
  cyl(ctx, M, brass, 0.055, 0.055, 0.26, 5, 0, 2.5, -0.5, 0, 0, 0, true);

  // bell in a brass cradle
  box(ctx, M, brassDim, 0.32, 0.2, 0.05, 0, 2.5, 1.32);
  cyl(ctx, M, brass, 0.07, 0.17, 0.2, 7, 0, 2.36, 1.32, 0, 0, 0, true);

  // lamp on the smokebox: iron case, brass rim, warm lens
  box(ctx, M, dark, 0.28, 0.32, 0.24, 0, 2.14, 3.02);
  ring(ctx, M, brass, 0.09, 0.13, 6, 0, 2.14, 3.15);
  quad(ctx, G, col(ctx, P.lamp), 0.19, 0.2, 0, 2.14, 3.145, 0, 0, 0, { ao: 0, alpha: 0.35 });

  // handrails
  for (let s = -1; s <= 1; s += 2) {
    cyl(ctx, M, col(ctx, P.brass, 0.9), 0.035, 0.035, 3.5, 5, s * 0.78, 2.05, 0.85, Math.PI / 2, 0, 0, true);
  }

  // cab: panelled sides with an open window, curved roof, bunker behind
  box(ctx, M, iron, 1.9, 1.34, 0.12, 0, 1.9, -1.22, 0, 0, 0, { mottle: 0.04 });
  for (let s = -1; s <= 1; s += 2) {
    box(ctx, M, iron, 0.12, 0.86, 1.3, s * 0.9, 1.55, -1.95, 0, 0, 0, { mottle: 0.04 });
    box(ctx, M, iron, 0.12, 0.36, 1.36, s * 0.9, 2.14, -1.98);
    // firebox glow, seen through the cab window
    quad(ctx, G, col(ctx, P.ember, 0.55), 1.0, 0.5, s * 0.8, 2.0, -1.9, 0, s * Math.PI / 2, 0, { ao: 0, alpha: 0 });
  }
  box(ctx, M, iron, 1.9, 0.7, 0.1, 0, 1.72, -2.62, 0, 0, 0, { mottle: 0.05 });
  arch(ctx, M, dark, 1.125, 1.72, 1.854, 8, 0, 1.625, -1.9, { mottle: 0.03 });
  // bunker and coal
  box(ctx, M, iron, 1.78, 0.62, 0.52, 0, 1.45, -2.88);
  cyl(ctx, T, col(ctx, P.coal, 1.35), 0.06, 0.62, 0.3, 6, 0, 1.85, -2.88, 0, 0, 0, true,
    { mottle: 0.45, sz: 0.7, ao: 0.6 });

  // wheels: two spoked drivers, coupled, plus a leading pony
  const R = 0.52;
  const s0 = wheelset(ctx, { z: -0.55, r: R, width: 0.18, spokes: 5, crank: true, seg: 9, face: P.iron, tyre: P.ironDark });
  wheelset(ctx, { z: 0.75, r: R, width: 0.18, spokes: 5, crank: true, seg: 9, face: P.iron, tyre: P.ironDark });
  wheelset(ctx, { z: 2.35, r: 0.30, width: 0.15, rate: R / 0.30, seg: 8, face: P.iron, tyre: P.ironDark });
  couplingRod(ctx, -0.55, 0.75, R, 0.3, s0, 0.18);
  // cylinder blocks ahead of the drivers
  for (let s = -1; s <= 1; s += 2) box(ctx, M, dark, 0.3, 0.34, 0.7, s * 0.84, 0.72, 1.62);

  return { length: L, stackTop: [0, 3.42, 2.55], wheelRadius: R };
}

/**
 * men — longer, plainer, cheaper. Painted iron, boxy cab, straight stack,
 * one brass band, mottled paint. Built under budget pressure and it shows.
 */
function engineMen(ctx, rng) {
  const M = ctx.metal, T = ctx.matte, G = ctx.glow;
  const L = 7.4, hz = L / 2;
  const paint = col(ctx, P.paintMen), dark = col(ctx, P.ironDark), iron = col(ctx, P.iron);
  const trim = col(ctx, P.banner, 0.9), brass = col(ctx, P.brass, 0.85);
  underframe(ctx, { length: L, beamWidth: 2.1, frameWidth: 1.2, beam: P.banner });

  for (let s = -1; s <= 1; s += 2) {
    box(ctx, M, iron, 0.38, 0.07, 5.0, s * 0.88, 1.06, 0.3);
  }
  // plain plate pilot
  box(ctx, M, dark, 1.8, 0.7, 0.07, 0, 0.5, hz + 0.1, -0.7, 0, 0);
  box(ctx, M, dark, 0.09, 0.72, 0.1, 0, 0.5, hz + 0.12, -0.7, 0, 0);

  // long parallel boiler, one brass band, shabby paint
  cyl(ctx, M, paint, 0.66, 0.7, 4.0, 12, 0, 1.56, 0.55, Math.PI / 2, 0, 0, true, { mottle: 0.14 });
  cyl(ctx, M, brass, 0.72, 0.72, 0.1, 12, 0, 1.56, 1.0, Math.PI / 2, 0, 0, true);
  cyl(ctx, M, dark, 0.73, 0.73, 0.6, 12, 0, 1.56, 2.82, Math.PI / 2, 0, 0, true, { mottle: 0.08 });
  disc(ctx, M, col(ctx, P.ironDark, 1.15), 0.73, 12, 0, 1.56, 3.12);
  disc(ctx, M, col(ctx, P.iron, 0.8), 0.42, 8, 0, 1.56, 3.14);

  // straight stack, very slightly out of true
  cyl(ctx, M, dark, 0.2, 0.23, 1.2, 8, 0, 2.86, 2.75, 0.03, 0, 0, true, { mottle: 0.1 });
  cyl(ctx, M, col(ctx, P.iron, 0.95), 0.24, 0.21, 0.14, 8, 0, 3.46, 2.79, 0.03, 0, 0, true);
  disc(ctx, T, col(ctx, P.coal, 1.3), 0.2, 8, 0, 3.5, 2.79, -Math.PI / 2, 0, 0, { ao: 0 });

  // one dome, a safety valve, no bell
  cyl(ctx, M, paint, 0.28, 0.32, 0.3, 8, 0, 2.3, 0.2, 0, 0, 0, true, { mottle: 0.12 });
  cyl(ctx, M, paint, 0.1, 0.3, 0.2, 8, 0, 2.52, 0.2, 0, 0, 0, true);
  cyl(ctx, M, brass, 0.055, 0.055, 0.22, 6, 0, 2.36, -0.75, 0, 0, 0, true);

  // lamp: plain iron, no rim
  box(ctx, M, dark, 0.26, 0.3, 0.22, 0, 2.06, 3.2);
  quad(ctx, G, col(ctx, P.lamp, 0.9), 0.17, 0.18, 0, 2.06, 3.315, 0, 0, 0, { ao: 0, alpha: 0.3 });

  // boxy cab, flat roof with a shallow lip
  box(ctx, M, paint, 1.86, 1.4, 0.12, 0, 1.95, -1.5, 0, 0, 0, { mottle: 0.1 });
  for (let s = -1; s <= 1; s += 2) {
    box(ctx, M, paint, 0.12, 0.9, 1.5, s * 0.88, 1.6, -2.3, 0, 0, 0, { mottle: 0.12 });
    box(ctx, M, paint, 0.12, 0.3, 1.5, s * 0.88, 2.5, -2.3, 0, 0, 0, { mottle: 0.12 });
    box(ctx, M, paint, 0.12, 0.5, 0.18, s * 0.88, 2.2, -2.98);
    quad(ctx, G, col(ctx, P.ember, 0.5), 1.1, 0.5, s * 0.78, 2.12, -2.25, 0, s * Math.PI / 2, 0, { ao: 0, alpha: 0 });
  }
  box(ctx, M, paint, 1.86, 1.0, 0.1, 0, 1.9, -3.06, 0, 0, 0, { mottle: 0.12 });
  box(ctx, M, dark, 2.02, 0.1, 1.86, 0, 2.7, -2.3);
  box(ctx, M, trim, 2.06, 0.05, 0.06, 0, 2.62, -3.2);
  // bunker
  box(ctx, M, paint, 1.7, 0.5, 0.5, 0, 1.4, -3.2, 0, 0, 0, { mottle: 0.12 });
  cyl(ctx, T, col(ctx, P.coal, 1.3), 0.05, 0.55, 0.26, 6, 0, 1.74, -3.2, 0, 0, 0, false,
    { mottle: 0.45, sz: 0.7, ao: 0.6 });

  const R = 0.46;
  const s0 = wheelset(ctx, { z: -0.9, r: R, width: 0.17, spokes: 4, seg: 8, face: P.iron, tyre: P.ironDark });
  wheelset(ctx, { z: 0.35, r: R, width: 0.17, spokes: 4, seg: 8, face: P.iron, tyre: P.ironDark });
  wheelset(ctx, { z: 2.5, r: 0.27, width: 0.14, rate: R / 0.27, seg: 8 });
  wheelset(ctx, { z: -2.4, r: 0.27, width: 0.14, rate: R / 0.27, seg: 8 });
  couplingRod(ctx, -0.9, 0.35, R, 0.27, s0, 0.17);
  for (let s = -1; s <= 1; s += 2) box(ctx, M, dark, 0.28, 0.3, 0.66, s * 0.82, 0.66, 1.35);

  return { length: L, stackTop: [0, 3.58, 2.79], wheelRadius: R };
}

/**
 * elf — sleek, low, no visible stack. Verdigris over pale birch, curved prow,
 * thin spoked wheels. Looks like it makes no noise.
 */
function engineElf(ctx, rng) {
  const M = ctx.metal, T = ctx.matte, G = ctx.glow;
  const L = 7.0, hz = L / 2;
  const verd = col(ctx, P.copper), birch = col(ctx, P.birch), silver = col(ctx, P.silver);
  underframe(ctx, { length: L, beamWidth: 1.7, frameWidth: 1.1, frame: P.copper, beam: P.copper, buffers: false });

  // faired hull, tapering forward
  cyl(ctx, M, verd, 0.44, 0.64, 4.5, 10, 0, 1.02, 0.35, Math.PI / 2, 0, 0, true);
  // curved prow: cone plus a rising fin
  cyl(ctx, M, verd, 0.06, 0.44, 0.95, 10, 0, 1.02, 3.08, Math.PI / 2, 0, 0, true);
  box(ctx, M, silver, 0.06, 0.34, 0.9, 0, 1.3, 2.95, 0.32, 0, 0);
  box(ctx, M, silver, 0.06, 0.26, 0.5, 0, 1.55, 2.45, 0.7, 0, 0);
  // birch side panels, verdigris skirts over the wheels
  for (let s = -1; s <= 1; s += 2) {
    box(ctx, M, birch, 0.09, 0.46, 3.6, s * 0.63, 1.16, 0.2);
    box(ctx, M, verd, 0.07, 0.42, 4.6, s * 0.72, 0.7, 0.2);
    box(ctx, M, silver, 0.05, 0.05, 4.6, s * 0.74, 0.92, 0.2);
  }
  // low canopy with a long window band
  arch(ctx, M, birch, 0.62, 2.5, 2.0, 8, 0, 1.12, -0.75);
  for (let s = -1; s <= 1; s += 2) {
    quad(ctx, G, col(ctx, P.silver, 0.75), 2.3, 0.3, s * 0.55, 1.44, -0.75, 0, s * Math.PI / 2, 0, { ao: 0, alpha: 0 });
  }
  quad(ctx, G, col(ctx, P.silver, 0.75), 0.9, 0.26, 0, 1.4, 0.52, 0, 0, 0, { ao: 0, alpha: 0 });
  // spine and lamps
  for (let k = 0; k < 3; k++) box(ctx, M, silver, 0.07, 0.1, 0.8, 0, 1.76, -1.9 + k * 1.0);
  for (let s = -1; s <= 1; s += 2) {
    cyl(ctx, M, silver, 0.05, 0.05, 0.16, 6, s * 0.3, 1.66, 2.2, 0, 0, 0, true);
    disc(ctx, G, col(ctx, P.birch), 0.05, 6, s * 0.3, 1.75, 2.2, -Math.PI / 2, 0, 0, { ao: 0, alpha: 0.25 });
  }
  // rear vents — the little steam it makes leaves here
  for (let s = -1; s <= 1; s += 2) {
    cyl(ctx, M, verd, 0.11, 0.13, 0.42, 8, s * 0.26, 1.5, -2.5, 0, 0, 0, true);
    ring(ctx, M, silver, 0.07, 0.12, 8, s * 0.26, 1.71, -2.5, -Math.PI / 2, 0, 0);
  }
  box(ctx, M, verd, 1.3, 0.5, 0.9, 0, 1.15, -2.65);

  const R = 0.40;
  wheelset(ctx, { z: -1.75, r: R, width: 0.09, spokes: 6, seg: 9, face: P.birch, tyre: P.iron, hub: P.silver });
  wheelset(ctx, { z: 0.2, r: R, width: 0.09, spokes: 6, seg: 9, face: P.birch, tyre: P.iron, hub: P.silver });
  wheelset(ctx, { z: 2.05, r: R, width: 0.09, spokes: 6, seg: 9, face: P.birch, tyre: P.iron, hub: P.silver });

  return { length: L, stackTop: [0, 1.78, -2.5], wheelRadius: R };
}

/**
 * orc — armoured slab sides, iron plate, spikes, a squat wide chimney with an
 * ember glow at the mouth. Built to ram something, and has.
 */
function engineOrc(ctx, rng) {
  const M = ctx.metal, T = ctx.matte, G = ctx.glow;
  const L = 6.8, hz = L / 2;
  const rust = col(ctx, P.rust), basalt = col(ctx, P.basalt), iron = col(ctx, P.iron);
  underframe(ctx, { length: L, beamWidth: 2.5, frameWidth: 1.3, frame: P.basalt, beam: P.basalt });

  // hull slab
  box(ctx, M, rust, 2.34, 1.5, 4.7, 0, 1.5, -0.2, 0, 0, 0, { mottle: 0.16 });
  // armour plates, deliberately out of true
  for (let s = -1; s <= 1; s += 2) {
    for (let k = 0; k < 3; k++) {
      box(ctx, M, basalt, 0.11, 0.86, 1.36, s * 1.2, 1.62 + (k % 2) * 0.1, -1.9 + k * 1.5,
        0, 0, s * (0.03 + 0.03 * (k % 2)), { mottle: 0.2 });
    }
    box(ctx, M, iron, 0.1, 0.3, 4.4, s * 1.21, 0.95, -0.2, 0, 0, 0, { mottle: 0.2 });
  }
  // boiler humping out of the slab
  cyl(ctx, M, basalt, 0.6, 0.6, 3.0, 8, 0, 1.9, 0.3, Math.PI / 2, 0, 0, true, { mottle: 0.12 });
  disc(ctx, M, col(ctx, P.basalt, 1.3), 0.6, 8, 0, 1.9, 1.81);

  // squat wide chimney with an ember mouth and a spiked crown
  cyl(ctx, M, basalt, 0.62, 0.5, 0.62, 8, 0, 2.62, 1.15, 0, 0, 0, true, { mottle: 0.15 });
  ring(ctx, M, col(ctx, P.rust, 0.8), 0.44, 0.62, 8, 0, 2.93, 1.15, -Math.PI / 2, 0, 0);
  disc(ctx, G, col(ctx, P.ember, 0.85), 0.44, 8, 0, 2.88, 1.15, -Math.PI / 2, 0, 0, { ao: 0, alpha: 1 });
  for (let k = 0; k < 4; k++) {
    const a = k / 4 * Math.PI * 2 + 0.4;
    cyl(ctx, M, basalt, 0.0, 0.09, 0.34, 4, Math.sin(a) * 0.54, 3.06, 1.15 + Math.cos(a) * 0.54);
  }

  // ram: angled prow plus forward spikes
  box(ctx, M, basalt, 2.3, 0.86, 0.14, 0, 1.0, hz + 0.1, -0.5, 0, 0, { mottle: 0.15 });
  for (let k = -1; k <= 1; k++) {
    cyl(ctx, M, iron, 0.0, 0.13, 0.8, 5, k * 0.7, 1.05 + Math.abs(k) * 0.1, hz + 0.5, Math.PI / 2, 0, 0, false, { mottle: 0.1 });
  }
  // armoured cab with a furnace slit
  box(ctx, M, basalt, 2.1, 1.0, 1.5, 0, 2.35, -2.1, 0, 0, 0, { mottle: 0.14 });
  box(ctx, M, rust, 2.16, 0.12, 1.56, 0, 2.9, -2.1, 0, 0, 0, { mottle: 0.2 });
  quad(ctx, G, col(ctx, P.ember, 0.7), 1.3, 0.13, 0, 2.45, -1.33, 0, 0, 0, { ao: 0, alpha: 1 });
  for (let s = -1; s <= 1; s += 2) {
    quad(ctx, G, col(ctx, P.ember, 0.5), 0.9, 0.1, s * 1.06, 2.45, -2.1, 0, s * Math.PI / 2, 0, { ao: 0, alpha: 1 });
  }
  // roof spikes
  for (let k = 0; k < 4; k++) {
    cyl(ctx, M, iron, 0.0, 0.085, 0.34, 4, -0.75 + k * 0.5, 3.12, -2.1, 0, 0, (k - 1.5) * 0.05, false, { mottle: 0.2 });
  }
  // firebox glare spilling out under the belly, onto the track
  quad(ctx, G, col(ctx, P.ember, 0.35), 1.2, 0.9, 0, 0.5, -1.4, Math.PI / 2, 0, 0, { ao: 0, alpha: 1 });

  const R = 0.46;
  for (const z of [-1.5, 0.1, 1.7]) {
    wheelset(ctx, { z, r: R, width: 0.24, seg: 8, face: P.rust, tyre: P.basalt, hub: P.iron });
    // orcish X-brace on each wheel face
    for (let s = -1; s <= 1; s += 2) {
      const lw = ctx.wheels[ctx.wheels.length - 1];    // already in world units
      const o = { wheel: { cx: s * Math.abs(lw.x), cy: lw.y, cz: lw.z, rate: 1, mode: 0, index: lw.slot % WHEEL_SLOTS }, ao: 0.5 };
      for (let k = 0; k < 2; k++) {
        quad(ctx, ctx.wheelB, col(ctx, P.iron, 0.9), 0.1, R * 1.7, s * (ctx.gauge / 2 + 0.13), R, z,
          0, s * Math.PI / 2, k ? 0.79 : -0.79, o);
      }
    }
  }
  return { length: L, stackTop: [0, 3.0, 1.15], wheelRadius: R };
}

const ENGINES = { dwarf: engineDwarf, men: engineMen, elf: engineElf, orc: engineOrc };

// ---------------------------------------------------------------------------
// Wagons
// ---------------------------------------------------------------------------

const WAGON_R = 0.34;      // wagon wheel radius
const WAGON_W = 0.15;

function wagonRunning(ctx, L, opt) {
  const o = opt || {};
  const az = o.axle === undefined ? Math.min(1.55, L / 2 - 0.9) : o.axle;
  wheelset(ctx, { z: -az, r: WAGON_R, width: WAGON_W, seg: 8, face: o.face || P.iron, tyre: P.ironDark });
  wheelset(ctx, { z: az, r: WAGON_R, width: WAGON_W, seg: 8, face: o.face || P.iron, tyre: P.ironDark });
  // solebar plus a single spring hanger per side: reads as running gear from
  // outside the wheels, where axleboxes would be hidden anyway
  for (let s = -1; s <= 1; s += 2) {
    box(ctx, ctx.metal, col(ctx, P.ironDark, 1.1), 0.09, 0.16, L - 1.0, s * 0.6, 0.52, 0);
  }
}

/** passenger — clerestory roof, five windows a side, warm at night. */
function wagonPassenger(ctx) {
  const M = ctx.metal, T = ctx.matte, G = ctx.glow, L = 5.2;
  const cream = col(ctx, 0xefe7d3), lower = col(ctx, P.timberDark), brass = col(ctx, P.brassDim);
  underframe(ctx, { length: L, beamWidth: 2.05, frameWidth: 1.2 });
  box(ctx, T, lower, 2.0, 0.6, 4.6, 0, 1.12, 0, 0, 0, 0, { mottle: 0.05 });
  box(ctx, T, cream, 1.96, 0.82, 4.6, 0, 1.82, 0, 0, 0, 0, { mottle: 0.04 });
  box(ctx, M, brass, 2.04, 0.06, 4.62, 0, 1.44, 0);
  // roof: shallow arch springing from the body top (y 2.23 at x +-0.95), then a
  // clerestory. r and centre chosen so the arch meets the body, not cuts it.
  arch(ctx, T, cream, 1.62, 4.7, 1.26, 8, 0, 0.94, 0);
  box(ctx, T, cream, 1.0, 0.26, 3.5, 0, 2.48, 0, 0, 0, 0, { mottle: 0.04 });
  arch(ctx, T, cream, 0.66, 3.6, 1.7, 6, 0, 2.16, 0);
  for (let s = -1; s <= 1; s += 2) {
    for (let k = -2; k <= 2; k++) {
      quad(ctx, G, col(ctx, P.window), 0.44, 0.46, s * 0.99, 1.9, k * 0.86, 0, s * Math.PI / 2, 0, { ao: 0, alpha: 0 });
    }
    for (let k = -1; k <= 1; k++) {
      quad(ctx, G, col(ctx, P.window, 0.85), 0.7, 0.14, s * 0.51, 2.48, k * 1.1, 0, s * Math.PI / 2, 0, { ao: 0, alpha: 0 });
    }
    box(ctx, M, col(ctx, P.timberDark, 1.1), 0.04, 1.3, 0.06, s * 1.01, 1.5, 1.72);
    box(ctx, T, col(ctx, P.timber, 0.8), 0.3, 0.07, 1.1, s * 1.02, 0.84, 0);
  }
  wagonRunning(ctx, L, {});
  return { length: L, height: 2.72 };
}

/** grain — covered hopper under a canvas tilt. */
function wagonGrain(ctx) {
  const M = ctx.metal, T = ctx.matte, L = 4.8;
  const body = col(ctx, P.timber), canvas = col(ctx, P.canvas);
  underframe(ctx, { length: L, beamWidth: 2.0, frameWidth: 1.2 });
  // tapered hopper: a 4-gon cylinder is a cheap trapezoidal prism. thetaStart
  // PI/4 puts the corners on the diagonals so the non-uniform scale below stays
  // axis-aligned (scale is applied before rotation, so rotating instead shears).
  cyl(ctx, T, body, 1.0, 0.56, 1.15, 4, 0, 1.42, 0, 0, 0, 0, false,
    { sx: 1.414, sz: 3.05, mottle: 0.06 }, Math.PI / 4, Math.PI * 2);
  for (let s = -1; s <= 1; s += 2) {
    box(ctx, M, col(ctx, P.ironDark, 1.1), 0.05, 1.1, 0.1, s * 0.86, 1.42, 1.3, 0, 0, s * 0.1);
    box(ctx, M, col(ctx, P.ironDark, 1.1), 0.05, 1.1, 0.1, s * 0.86, 1.42, -1.3, 0, 0, s * 0.1);
  }
  // canvas tilt springing off the hopper rim (top y 2.0 at x +-1.0), roped down
  arch(ctx, T, canvas, 1.18, 4.3, 1.8, 8, 0, 1.37, 0, { mottle: 0.07 });
  for (let k = -1; k <= 1; k++) {
    box(ctx, T, col(ctx, P.timberDark, 1.2), 1.3, 0.05, 0.05, 0, 2.5, k * 1.4);
  }
  box(ctx, T, canvas, 0.9, 0.5, 0.06, 0, 2.15, 2.14, 0, 0, 0, { mottle: 0.08 });
  box(ctx, T, canvas, 0.9, 0.5, 0.06, 0, 2.15, -2.14, 0, 0, 0, { mottle: 0.08 });
  wagonRunning(ctx, L, {});
  return { length: L, height: 2.7 };
}

/** ore — open tub, dark ore heaped above the sides. */
function wagonOre(ctx) {
  const M = ctx.metal, T = ctx.matte, L = 4.8;
  const plate = col(ctx, P.iron);
  underframe(ctx, { length: L, beamWidth: 2.0, frameWidth: 1.2 });
  // tub: outer shell and a flipped inner shell so the rim has thickness
  cyl(ctx, M, plate, 1.0, 0.82, 1.2, 4, 0, 1.4, 0, 0, 0, 0, true,
    { sx: 1.414, sz: 3.0, mottle: 0.07 }, Math.PI / 4, Math.PI * 2);
  cyl(ctx, M, col(ctx, P.ironDark, 0.9), 0.95, 0.79, 1.18, 4, 0, 1.4, 0, 0, 0, 0, true,
    { sx: 1.414, sz: 3.0, flip: true, ao: 0.4 }, Math.PI / 4, Math.PI * 2);
  box(ctx, M, col(ctx, P.iron, 0.8), 0.1, 0.1, 4.3, 0.99, 2.0, 0);
  box(ctx, M, col(ctx, P.iron, 0.8), 0.1, 0.1, 4.3, -0.99, 2.0, 0);
  for (let s = -1; s <= 1; s += 2) {
    box(ctx, M, col(ctx, P.ironDark, 1.15), 0.05, 1.2, 0.12, s * 0.95, 1.4, 1.2, 0, 0, s * 0.06);
    box(ctx, M, col(ctx, P.ironDark, 1.15), 0.05, 1.2, 0.12, s * 0.95, 1.4, -1.2, 0, 0, s * 0.06);
  }
  // heaped ore: two irregular cones, speckled
  const oreCol = (x, y, z) => {
    const g = ctx.rng();
    return g > 0.86 ? col(ctx, P.oreGlint, 1.0) : col(ctx, P.ore, 0.7 + 0.5 * g);
  };
  cyl(ctx, T, oreCol, 0.12, 0.98, 0.62, 6, 0.05, 2.02, -0.4, 0, 0.3, 0, true, { sz: 2.1, ao: 0.7 });
  cyl(ctx, T, oreCol, 0.05, 0.72, 0.5, 6, -0.1, 2.05, 1.15, 0, 0.9, 0, true, { sz: 1.3, ao: 0.7 });
  wagonRunning(ctx, L, {});
  return { length: L, height: 2.4 };
}

/** timber — flat with stanchions and a stack of logs. */
function wagonTimber(ctx) {
  const M = ctx.metal, T = ctx.matte, L = 4.8;
  underframe(ctx, { length: L, beamWidth: 2.0, frameWidth: 1.2 });
  box(ctx, T, col(ctx, P.timberDark), 2.0, 0.14, 4.5, 0, 0.86, 0, 0, 0, 0, { mottle: 0.08 });
  for (const z of [-1.5, 1.5]) {
    for (let s = -1; s <= 1; s += 2) {
      box(ctx, M, col(ctx, P.ironDark, 1.1), 0.09, 0.72, 0.1, s * 0.97, 1.28, z);
    }
  }
  // logs: pale sawn ends, dark bark
  const bark = col(ctx, P.timber, 0.62), sap = col(ctx, 0xd9c39a);
  const logCol = (x, y, z, nx, ny, nz) => (Math.abs(nz) > 0.7 ? sap : bark);
  const logs = [[-0.5, 1.06, 0.29], [0.02, 1.1, 0.32], [0.55, 1.06, 0.28],
    [-0.26, 1.62, 0.28], [0.32, 1.64, 0.3]];
  for (const [x, y, r] of logs) {
    cyl(ctx, T, logCol, r, r * 0.94, 4.3, 5, x, y, 0.06, Math.PI / 2, 0, 0, false, { mottle: 0.1 });
  }
  // binding chains over the load
  for (const z of [-1.3, 1.3]) {
    box(ctx, M, col(ctx, P.railhead, 0.5), 2.24, 0.05, 0.05, 0.02, 1.99, z, 0, 0, 0.12);
  }
  wagonRunning(ctx, L, {});
  return { length: L, height: 2.4 };
}

/** arms — sealed van, iron straps, a wax seal on the door. */
function wagonArms(ctx) {
  const M = ctx.metal, T = ctx.matte, G = ctx.glow, L = 4.8;
  const body = col(ctx, P.timberDark), iron = col(ctx, P.iron);
  underframe(ctx, { length: L, beamWidth: 2.0, frameWidth: 1.2 });
  box(ctx, T, body, 2.0, 1.5, 4.5, 0, 1.6, 0, 0, 0, 0, { mottle: 0.07 });
  box(ctx, M, iron, 2.1, 0.12, 4.6, 0, 2.4, 0, 0, 0, 0, { mottle: 0.05 });
  for (let s = -1; s <= 1; s += 2) {
    box(ctx, M, iron, 0.05, 1.5, 0.14, s * 1.01, 1.6, 1.6);
    // braced door
    box(ctx, T, col(ctx, P.timberDark, 1.2), 0.05, 1.3, 1.5, s * 1.01, 1.6, 0);
    box(ctx, M, iron, 0.05, 0.1, 1.95, s * 1.04, 1.6, 0, 0, 0, s * 0.71);
    box(ctx, M, col(ctx, P.brass), 0.07, 0.16, 0.12, s * 1.06, 1.55, 0.76);
    disc(ctx, T, col(ctx, P.banner), 0.09, 6, s * 1.07, 1.55, 0.62, 0, s * Math.PI / 2, 0, { ao: 0.3 });
  }
  // a single barred vent, faintly lit from inside
  quad(ctx, G, col(ctx, P.lamp, 0.4), 0.4, 0.1, 0, 2.15, 2.26, 0, 0, 0, { ao: 0, alpha: 0 });
  wagonRunning(ctx, L, {});
  return { length: L, height: 2.46 };
}

/** flat — bare deck, stake pockets, chains draped along it. */
function wagonFlat(ctx) {
  const M = ctx.metal, T = ctx.matte, L = 4.8;
  underframe(ctx, { length: L, beamWidth: 2.0, frameWidth: 1.2 });
  box(ctx, T, col(ctx, P.timber, 0.85), 2.0, 0.16, 4.5, 0, 0.87, 0, 0, 0, 0, { mottle: 0.1 });
  for (const z of [-1.7, 0, 1.7]) {
    for (let s = -1; s <= 1; s += 2) {
      box(ctx, M, col(ctx, P.ironDark, 1.1), 0.08, 0.26, 0.12, s * 0.97, 1.06, z);
    }
  }
  // chains: short links sagging along the deck
  const link = col(ctx, P.railhead, 0.45);
  for (let s = -1; s <= 1; s += 2) {
    for (let k = 0; k < 3; k++) {
      const z = -1.4 + k * 1.35, sag = 0.055 * (k % 2 ? 1 : -1);
      cyl(ctx, M, link, 0.045, 0.045, 1.4, 4, s * 0.72, 0.97 + sag, z + 0.5, Math.PI / 2, 0, 0.1 * (k % 2 ? 1 : -1), true);
    }
  }
  box(ctx, M, link, 0.5, 0.09, 0.4, 0.1, 1.0, -0.1, 0, 0.4, 0);
  wagonRunning(ctx, L, {});
  return { length: L, height: 1.1 };
}

/** brake — short van with a raised lookout cupola and tail lamps. */
function wagonBrake(ctx) {
  const M = ctx.metal, T = ctx.matte, G = ctx.glow, L = 3.8;
  const body = col(ctx, P.timber, 0.9), roof = col(ctx, P.slate);
  underframe(ctx, { length: L, beamWidth: 2.0, frameWidth: 1.2, buffers: true });
  box(ctx, T, body, 1.94, 1.24, 2.5, 0, 1.44, 0.35, 0, 0, 0, { mottle: 0.06 });
  arch(ctx, T, roof, 1.72, 2.62, 1.2, 8, 0, 0.64, 0.35);
  // lookout cupola, sitting on the roof (top y 2.36)
  box(ctx, T, body, 0.9, 0.52, 1.0, 0, 2.5, 0.3, 0, 0, 0, { mottle: 0.05 });
  arch(ctx, T, roof, 0.56, 1.1, 1.9, 6, 0, 2.32, 0.3);
  for (let s = -1; s <= 1; s += 2) {
    quad(ctx, G, col(ctx, P.window), 0.7, 0.3, s * 0.46, 2.5, 0.3, 0, s * Math.PI / 2, 0, { ao: 0, alpha: 0 });
    quad(ctx, G, col(ctx, P.window, 0.9), 0.4, 0.34, s * 0.5, 1.72, 0.9, 0, s * Math.PI / 2, 0, { ao: 0, alpha: 0 });
    quad(ctx, G, col(ctx, P.window, 0.8), 0.62, 0.3, s * 0.98, 1.7, 0.4, 0, s * Math.PI / 2, 0, { ao: 0, alpha: 0 });
  }
  // veranda with railings, guard's end
  box(ctx, T, col(ctx, P.timberDark), 1.9, 0.1, 0.9, 0, 0.84, -1.35, 0, 0, 0, { mottle: 0.08 });
  for (let s = -1; s <= 1; s += 2) {
    cyl(ctx, M, col(ctx, P.ironDark, 1.1), 0.04, 0.04, 0.7, 5, s * 0.9, 1.2, -1.75, 0, 0, 0, true);
  }
  cyl(ctx, M, col(ctx, P.ironDark, 1.1), 0.04, 0.04, 1.8, 5, 0, 1.5, -1.76, 0, 0, Math.PI / 2, true);
  // tail lamps: lit at all hours
  for (let s = -1; s <= 1; s += 2) {
    box(ctx, M, col(ctx, P.ironDark), 0.16, 0.18, 0.12, s * 0.66, 1.32, -1.86);
    quad(ctx, G, col(ctx, P.banner, 1.0), 0.1, 0.11, s * 0.66, 1.32, -1.93, 0, Math.PI, 0, { ao: 0, alpha: 1 });
  }
  wagonRunning(ctx, L, { axle: 1.1 });
  return { length: L, height: 2.6 };
}

/** barrel — casks roped to a low deck. Ale, wine: the drink trade, visibly. */
function wagonBarrel(ctx) {
  const M = ctx.metal, T = ctx.matte, L = 4.8;
  underframe(ctx, { length: L, beamWidth: 2.0, frameWidth: 1.2 });
  box(ctx, T, col(ctx, P.timber, 0.85), 2.0, 0.16, 4.5, 0, 0.87, 0, 0, 0, 0, { mottle: 0.1 });
  // low side stanchions so the load reads as held in
  for (const z of [-1.9, 1.9]) {
    for (let s = -1; s <= 1; s += 2) {
      box(ctx, M, col(ctx, P.ironDark, 1.1), 0.08, 0.34, 0.12, s * 0.97, 1.1, z);
    }
  }
  // two rows of casks lying athwart, bellied by a wider mid-band
  const stave = col(ctx, P.timberDark, 1.15), hoop = col(ctx, P.brassDim, 1.0);
  for (let r = 0; r < 2; r++) {
    for (let k = 0; k < 3; k++) {
      const z = -1.45 + k * 1.45, x = r ? 0.46 : -0.46;
      cyl(ctx, T, stave, 0.42, 0.42, 0.92, 8, x, 1.36, z, 0, 0, Math.PI / 2, false, { mottle: 0.07 });
      cyl(ctx, T, stave, 0.47, 0.47, 0.30, 8, x, 1.36, z, 0, 0, Math.PI / 2, false, { mottle: 0.07 });
      for (const o of [-0.3, 0.3]) {
        cyl(ctx, M, hoop, 0.44, 0.44, 0.06, 8, x + o, 1.36, z, 0, 0, Math.PI / 2, true);
      }
    }
  }
  wagonRunning(ctx, L, {});
  return { length: L, height: 1.85 };
}

/** van — a closed box with a roof. Anything under cover: lore, physic, mithril. */
function wagonVan(ctx) {
  const M = ctx.metal, T = ctx.matte, L = 4.8;
  const body = col(ctx, P.timber, 0.92);
  underframe(ctx, { length: L, beamWidth: 2.0, frameWidth: 1.2 });
  box(ctx, T, body, 2.02, 1.72, 4.5, 0, 1.76, 0, 0, 0, 0, { mottle: 0.07 });
  // planking and door furniture, so it is not a bare cuboid
  for (const z of [-1.5, 0, 1.5]) {
    box(ctx, T, col(ctx, P.timberDark, 1.1), 2.06, 0.07, 0.1, 0, 1.76, z, 0, 0, 0);
  }
  for (let s = -1; s <= 1; s += 2) {
    box(ctx, M, col(ctx, P.ironDark, 1.05), 0.06, 1.5, 0.14, s * 1.02, 1.76, 0.55);
    box(ctx, M, col(ctx, P.brassDim, 1.0), 0.07, 0.16, 0.4, s * 1.03, 1.72, 0.1);
  }
  // shallow arched roof, overhanging a little at the eaves
  arch(ctx, T, col(ctx, P.slate, 1.0), 1.12, 4.62, 0.34, 8, 0, 2.54, 0, { mottle: 0.05 });
  wagonRunning(ctx, L, {});
  return { length: L, height: 2.88 };
}

const WAGONS = {
  passenger: wagonPassenger, grain: wagonGrain, ore: wagonOre, timber: wagonTimber,
  arms: wagonArms, flat: wagonFlat, brake: wagonBrake,
  barrel: wagonBarrel, van: wagonVan,
};

export const CARGO_KINDS = Object.keys(WAGONS);
export const ENGINE_STYLES = ['dwarf', 'men', 'elf', 'orc'];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const normCargo = (c) => (WAGONS[String(c || 'flat').toLowerCase()] ? String(c).toLowerCase() : 'flat');

/**
 * buildEngine({ style, seed }, THREE)
 *   -> { group, length, stackTop, wheels, wheelRadius, setNight, ... }
 * Origin at the centre of the engine, y = 0 at the railhead, +Z forward.
 */
export function buildEngine(opts, THREE) {
  const o = opts || {};
  const style = normStyle(o.style);
  const rng = makeRng('pw-eng:' + style + ':' + (o.seed === undefined ? 0 : o.seed));
  const ctx = makeCtx(THREE, rng, o);
  const info = ENGINES[style](ctx, rng);
  const out = finish(ctx, { name: 'engine-' + style });
  const S = ctx.S;
  out.style = style;
  out.length = info.length * S;
  out.wheelRadius = info.wheelRadius * S;
  out.stackTop = new THREE.Vector3(info.stackTop[0] * S, info.stackTop[1] * S, info.stackTop[2] * S);
  out.gauge = ctx.gauge * S;
  return out;
}

/**
 * buildWagon({ cargo, seed }, THREE) -> { group, length, wheels, wheelRadius, ... }
 */
export function buildWagon(opts, THREE) {
  const o = opts || {};
  const cargo = normCargo(o.cargo);
  const rng = makeRng('pw-wag:' + cargo + ':' + (o.seed === undefined ? 0 : o.seed));
  const ctx = makeCtx(THREE, rng, o);
  const info = WAGONS[cargo](ctx, rng);
  const out = finish(ctx, { name: 'wagon-' + cargo });
  const S = ctx.S;
  out.cargo = cargo;
  out.length = info.length * S;
  out.height = info.height * S;
  out.wheelRadius = WAGON_R * S;
  out.gauge = ctx.gauge * S;
  return out;
}

// What a line of a given culture tends to be hauling, if the host does not say.
const CONSISTS = {
  dwarf: ['ore', 'ore', 'timber', 'grain', 'flat', 'passenger', 'arms'],
  men: ['grain', 'passenger', 'timber', 'flat', 'ore', 'arms', 'grain'],
  elf: ['passenger', 'passenger', 'grain', 'timber', 'flat', 'passenger'],
  orc: ['ore', 'arms', 'arms', 'ore', 'flat', 'timber'],
};

/**
 * buildTrain({ style, cars, seed }, THREE)
 *   -> { group, length, engine, wagons, wheels, wheelRadius, stackTop, setNight }
 *
 * `cars` is a wagon count, or an array of cargo names. Everything merges into
 * one group of at most four meshes, engine at the front (+Z), origin at the
 * centre of the whole train.
 */
export function buildTrain(opts, THREE) {
  const o = opts || {};
  const style = normStyle(o.style);
  const seed = o.seed === undefined ? 0 : o.seed;
  const rng = makeRng('pw-train:' + style + ':' + seed);
  const S = (o.gauge || TRAIN_GAUGE) / BASE_GAUGE;
  const gap = (o.gap === undefined ? 0.34 * S : o.gap) / S;   // o.gap is world units

  let list;
  if (Array.isArray(o.cars)) list = o.cars.map(normCargo);
  else {
    const n = Math.max(0, Math.round(o.cars === undefined ? 3 : o.cars));
    const pool = CONSISTS[style];
    list = [];
    for (let i = 0; i < n; i++) list.push(pool[(rng.int(0, pool.length - 1) + i) % pool.length]);
    if (n >= 3) list[n - 1] = 'brake';
  }

  // measure first so the finished train can be centred on its own origin
  const eLen = { dwarf: 6.4, men: 7.4, elf: 7.0, orc: 6.8 }[style];
  const wLen = list.map((c) => ({ passenger: 5.2, brake: 3.8 }[c] || 4.8));
  let total = eLen;
  for (const l of wLen) total += l + gap;

  const ctx = makeCtx(THREE, rng, o);
  let edge = total / 2;                        // running z of the back of the last car
  const eOff = edge - eLen / 2;
  ctx.zoff = eOff;
  edge -= eLen;
  const info = ENGINES[style](ctx, rng);
  const engine = {
    style, length: eLen * S, offset: eOff * S,
    stackTop: new THREE.Vector3(info.stackTop[0] * S, info.stackTop[1] * S, (info.stackTop[2] + eOff) * S),
    wheelFirst: 0, wheelCount: ctx.wheels.length,
  };
  const wagons = [];
  for (let i = 0; i < list.length; i++) {
    const off = edge - gap - wLen[i] / 2;
    edge -= gap + wLen[i];
    ctx.zoff = off;
    const first = ctx.wheels.length;
    const wi = WAGONS[list[i]](ctx, rng);
    wagons.push({
      cargo: list[i], length: wi.length * S, offset: off * S,
      wheelFirst: first, wheelCount: ctx.wheels.length - first,
    });
  }
  ctx.zoff = 0;

  const out = finish(ctx, { name: 'train-' + style });
  out.style = style;
  out.cars = list.slice();
  out.length = total * S;
  out.engine = engine;
  out.wagons = wagons;
  out.stackTop = engine.stackTop.clone();
  out.wheelRadius = info.wheelRadius * S;
  out.gauge = ctx.gauge * S;
  return out;
}

// ---------------------------------------------------------------------------
// Steam
// ---------------------------------------------------------------------------

// Per style: colour, sizes, rate (puffs/second at strength 1), life, buoyancy,
// drag against the air, and the chance a puff is a hot ember instead.
const STEAM = {
  dwarf: { c: [0.62, 0.60, 0.575], s0: 0.55, s1: 2.7, rate: 20, life: 2.7, rise: 3.4, buoy: 0.5, drag: 1.05, turb: 0.5, ember: 0.02 },
  men: { c: [0.50, 0.485, 0.455], s0: 0.5, s1: 2.5, rate: 18, life: 2.9, rise: 3.0, buoy: 0.42, drag: 1.1, turb: 0.55, ember: 0.05 },
  elf: { c: [0.115, 0.135, 0.125], s0: 0.3, s1: 1.05, rate: 6, life: 1.25, rise: 1.5, buoy: 0.2, drag: 1.6, turb: 0.35, ember: 0 },
  orc: { c: [0.30, 0.215, 0.165], s0: 0.72, s1: 3.3, rate: 21, life: 3.4, rise: 2.6, buoy: 0.62, drag: 0.9, turb: 0.6, ember: 0.2 },
};
const EMBER_C = [2.0, 0.62, 0.12];

function readWind(env, out) {
  out.set(0, 0, 0);
  if (!env) return out;
  const w = env.wind;
  if (w) {
    if (w.isVector3) out.set(w.x, w.y, w.z);
    else if (Array.isArray(w)) out.set(w[0] || 0, w.length > 2 ? (w[1] || 0) : 0, w.length > 2 ? (w[2] || 0) : (w[1] || 0));
    return out;
  }
  if (env.windDir) {
    const s = env.windStrength === undefined ? 1 : env.windStrength;
    out.set((env.windDir[0] || 0) * s, 0, (env.windDir[1] || 0) * s);
  }
  return out;
}

/**
 * createSteam(THREE, capacity) -> { points, emit, update, dispose }
 *
 * One system serves every train in the scene: `capacity` is the total puff
 * pool. emit() is rate-limited internally, so the host may call it every frame
 * with the world-space stack position.
 *   emit(pos, vel, strength, style, id)
 * `id` (any stable key per emitter, e.g. a train index) gives that emitter its
 * own smooth emission accumulator; without it emission is stochastic.
 */
export function createSteam(THREE, capacity, opts) {
  const o = opts || {};
  const N = Math.max(16, Math.floor(capacity || 600));
  // puff sizes and speeds are authored at BASE_GAUGE, like the stock
  const WS = o.scale === undefined ? TRAIN_GAUGE / BASE_GAUGE : o.scale;
  const pos = new Float32Array(N * 3);
  const colA = new Float32Array(N * 3);
  const sizeA = new Float32Array(N);
  const vel = new Float32Array(N * 3);
  const base = new Float32Array(N * 3);
  const life = new Float32Array(N);
  const invL = new Float32Array(N);
  const sA = new Float32Array(N);
  const sB = new Float32Array(N);
  const buoy = new Float32Array(N);
  const drag = new Float32Array(N);
  const turb = new Float32Array(N);
  for (let i = 0; i < N; i++) pos[i * 3 + 1] = -100000;

  const g = new THREE.BufferGeometry();
  const pAttr = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const cAttr = new THREE.BufferAttribute(colA, 3).setUsage(THREE.DynamicDrawUsage);
  const sAttr = new THREE.BufferAttribute(sizeA, 1).setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('position', pAttr);
  g.setAttribute('color', cAttr);
  g.setAttribute('aSize', sAttr);
  g.setDrawRange(0, 0);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

  // three's point size is `size * (height/2) / distance`, which ignores fov, so
  // this factor makes aSize read as world units. 1/tan(fov/2), fov 34 by default.
  const fovScale = (f) => 1 / Math.tan((f * Math.PI) / 360);
  const tex = puffTexture(THREE);
  const mat = new THREE.PointsMaterial({
    size: o.sizeScale === undefined ? fovScale(o.fov || 34) : o.sizeScale,
    sizeAttenuation: true, map: tex, transparent: true,
    depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
    vertexColors: true, fog: true, name: 'pw-steam',
  });
  mat.customProgramCacheKey = () => 'pw-steam';
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aSize;')
      .replace('gl_PointSize = size;', 'gl_PointSize = size * aSize;');
    // additive fog: distant puffs must fade to nothing, not toward fog colour
    shader.fragmentShader = shader.fragmentShader.replace('#include <fog_fragment>', [
      '#ifdef USE_FOG',
      '  #ifdef FOG_EXP2',
      '    float pwFog = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );',
      '  #else',
      '    float pwFog = smoothstep( fogNear, fogFar, vFogDepth );',
      '  #endif',
      '  gl_FragColor.rgb *= 1.0 - pwFog;',
      '#endif',
    ].join('\n'));
  };

  const points = new THREE.Points(g, mat);
  points.name = 'pw-steam';
  points.frustumCulled = false;
  points.renderOrder = 8;

  const rng = makeRng('pw-steam');
  const wind = new THREE.Vector3();
  const accs = new Map();
  let head = 0, hw = 0, drawn = 0, dtLast = 1 / 60, clock = 0, alive = 0;

  function spawn(p, v, strength, st) {
    const i = head; head = (head + 1) % N;
    if (life[i] <= 0) alive++;
    if (i >= hw) hw = i + 1;
    const j = i * 3;
    const isEmber = st.ember > 0 && rng() < st.ember;
    const jit = (isEmber ? 0.06 : 0.16) * WS;
    pos[j] = p.x + (rng() - 0.5) * jit;
    pos[j + 1] = p.y + (rng() - 0.5) * jit * 0.5;
    pos[j + 2] = p.z + (rng() - 0.5) * jit;
    const vx = v ? (v.x || 0) : 0, vy = v ? (v.y || 0) : 0, vz = v ? (v.z || 0) : 0;
    const carry = isEmber ? 0.9 : 0.55;
    const rise = st.rise * WS * (isEmber ? 1.5 : 1) * (0.75 + 0.5 * rng()) * (0.55 + 0.55 * strength);
    vel[j] = vx * carry + (rng() - 0.5) * 0.7 * WS;
    vel[j + 1] = vy * carry * 0.4 + rise;
    vel[j + 2] = vz * carry + (rng() - 0.5) * 0.7 * WS;
    const lf = st.life * (isEmber ? 0.35 : 1) * (0.78 + 0.44 * rng()) * (0.7 + 0.3 * clamp(strength, 0, 1.4));
    life[i] = lf; invL[i] = 1 / lf;
    const gscale = (0.8 + 0.45 * rng()) * WS;
    sA[i] = (isEmber ? 0.14 * WS : st.s0 * gscale) * (0.7 + 0.4 * clamp(strength, 0, 1.6));
    sB[i] = isEmber ? 0.03 * WS : st.s1 * gscale;
    buoy[i] = st.buoy * WS * (isEmber ? 1.4 : 1) * (0.8 + 0.4 * rng());
    drag[i] = st.drag * (isEmber ? 0.4 : 1);
    turb[i] = st.turb * (isEmber ? 0.4 : 1);
    const c = isEmber ? EMBER_C : st.c;
    const tint = isEmber ? 1 : 0.85 + 0.3 * rng();
    base[j] = c[0] * tint; base[j + 1] = c[1] * tint; base[j + 2] = c[2] * tint;
    sizeA[i] = sA[i];
    colA[j] = 0; colA[j + 1] = 0; colA[j + 2] = 0;
    // in case the host emits after update(): keep the draw range and the
    // uploads honest for this frame
    if (hw > drawn) { g.setDrawRange(0, hw); drawn = hw; }
    pAttr.needsUpdate = true; cAttr.needsUpdate = true; sAttr.needsUpdate = true;
  }

  const _p = { x: 0, y: 0, z: 0 };
  function emit(p, v, strength, style, id) {
    const st = STEAM[normStyle(style)];
    const s = clamp(strength === undefined ? 1 : strength, 0, 4);
    if (s <= 0.002 || !p) return;
    _p.x = p.x; _p.y = p.y; _p.z = p.z;
    let want = dtLast * st.rate * s;
    let n;
    if (id !== undefined && id !== null) {
      const acc = (accs.get(id) || 0) + want;
      n = Math.floor(acc);
      accs.set(id, acc - n);
    } else {
      n = Math.floor(want);
      if (rng() < want - n) n++;
    }
    if (n > 12) n = 12;
    for (let k = 0; k < n; k++) spawn(_p, v, s, st);
  }

  function update(dt, env) {
    const d = clamp(dt || 0, 0, 0.1);
    dtLast = d > 0 ? d : dtLast;
    clock += d;
    const t = env && env.time !== undefined ? env.time : clock;
    readWind(env, wind);
    let live = 0, top = 0;
    for (let i = 0; i < hw; i++) {
      if (life[i] <= 0) { sizeA[i] = 0; continue; }
      life[i] -= d;
      const j = i * 3;
      if (life[i] <= 0) {
        life[i] = 0; sizeA[i] = 0;
        pos[j + 1] = -100000;
        colA[j] = colA[j + 1] = colA[j + 2] = 0;
        continue;
      }
      live++; top = i + 1;
      const age = 1 - life[i] * invL[i];
      const dr = drag[i] * d;
      const k = dr > 0.9 ? 0.9 : dr;
      vel[j] += (wind.x - vel[j]) * k;
      vel[j + 2] += (wind.z - vel[j + 2]) * k;
      vel[j + 1] += buoy[i] * d - vel[j + 1] * k * 0.85 + wind.y * k;
      const tb = turb[i] * d;
      vel[j] += Math.sin(pos[j + 2] * 0.7 + t * 1.7 + i) * tb * WS;
      vel[j + 2] += Math.cos(pos[j] * 0.7 + t * 1.3 + i) * tb * WS;
      pos[j] += vel[j] * d;
      pos[j + 1] += vel[j + 1] * d;
      pos[j + 2] += vel[j + 2] * d;
      // expand fast then settle
      const e = 1 - (1 - age) * (1 - age);
      sizeA[i] = sA[i] + (sB[i] - sA[i]) * e;
      // fade in quickly, out slowly (additive, so fade lives in the colour)
      let f = age < 0.1 ? age / 0.1 : 1;
      const o2 = age < 0.28 ? 1 : 1 - (age - 0.28) / 0.72;
      f *= o2 * o2;
      colA[j] = base[j] * f; colA[j + 1] = base[j + 1] * f; colA[j + 2] = base[j + 2] * f;
    }
    alive = live;
    hw = top;
    drawn = hw;
    g.setDrawRange(0, hw);
    pAttr.needsUpdate = true; cAttr.needsUpdate = true; sAttr.needsUpdate = true;
    if (env && env.fov && o.sizeScale === undefined) mat.size = fovScale(env.fov);
  }

  function dispose() { g.dispose(); mat.dispose(); tex.dispose(); accs.clear(); }

  return {
    points, emit, update, dispose, material: mat, texture: tex,
    get count() { return alive; }, capacity: N,
  };
}

// ---------------------------------------------------------------------------
// Sparks — wheel slip, brakes, orc chimneys, incidents
// ---------------------------------------------------------------------------

/** createSparks(THREE, capacity) -> { points, burst(pos, count, colour), update(dt), dispose() } */
export function createSparks(THREE, capacity, opts) {
  const N = Math.max(16, Math.floor(capacity || 240));
  const WS = (opts && opts.scale !== undefined) ? opts.scale : TRAIN_GAUGE / BASE_GAUGE;
  const pos = new Float32Array(N * 3);
  const colA = new Float32Array(N * 3);
  const sizeA = new Float32Array(N);
  const vel = new Float32Array(N * 3);
  const base = new Float32Array(N * 3);
  const life = new Float32Array(N);
  const invL = new Float32Array(N);
  const sz = new Float32Array(N);
  for (let i = 0; i < N; i++) pos[i * 3 + 1] = -100000;

  const g = new THREE.BufferGeometry();
  const pAttr = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const cAttr = new THREE.BufferAttribute(colA, 3).setUsage(THREE.DynamicDrawUsage);
  const sAttr = new THREE.BufferAttribute(sizeA, 1).setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('position', pAttr);
  g.setAttribute('color', cAttr);
  g.setAttribute('aSize', sAttr);
  g.setDrawRange(0, 0);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

  const tex = puffTexture(THREE);
  const mat = new THREE.PointsMaterial({
    size: 1 / Math.tan((34 * Math.PI) / 360), sizeAttenuation: true, map: tex,
    transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, vertexColors: true, fog: true, name: 'pw-sparks',
  });
  mat.customProgramCacheKey = () => 'pw-steam';
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aSize;')
      .replace('gl_PointSize = size;', 'gl_PointSize = size * aSize;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <fog_fragment>', [
      '#ifdef USE_FOG',
      '  #ifdef FOG_EXP2',
      '    float pwFog = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );',
      '  #else',
      '    float pwFog = smoothstep( fogNear, fogFar, vFogDepth );',
      '  #endif',
      '  gl_FragColor.rgb *= 1.0 - pwFog;',
      '#endif',
    ].join('\n'));
  };

  const points = new THREE.Points(g, mat);
  points.name = 'pw-sparks';
  points.frustumCulled = false;
  points.renderOrder = 9;

  const rng = makeRng('pw-sparks');
  const c3 = new THREE.Color();
  let head = 0, hw = 0, alive = 0;

  function burst(p, count, colour) {
    if (!p) return;
    const n = Math.max(1, Math.min(N, Math.round(count === undefined ? 8 : count)));
    if (colour === undefined || colour === null) c3.set(P.emberHot);
    else if (colour.isColor) c3.copy(colour);
    else c3.set(colour);
    for (let k = 0; k < n; k++) {
      const i = head; head = (head + 1) % N;
      if (life[i] <= 0) alive++;
      if (i >= hw) hw = i + 1;
      const j = i * 3;
      pos[j] = p.x + (rng() - 0.5) * 0.1 * WS;
      pos[j + 1] = p.y + (rng() - 0.5) * 0.1 * WS;
      pos[j + 2] = p.z + (rng() - 0.5) * 0.1 * WS;
      const a = rng() * Math.PI * 2, up = (0.35 + rng() * 1.6) * WS, sp = (0.9 + rng() * 3.4) * WS;
      vel[j] = Math.cos(a) * sp * 0.5;
      vel[j + 1] = up * 1.8;
      vel[j + 2] = Math.sin(a) * sp * 0.5;
      const lf = 0.28 + rng() * 0.55;
      life[i] = lf; invL[i] = 1 / lf;
      sz[i] = (0.075 + rng() * 0.08) * WS;
      sizeA[i] = sz[i];
      const b = 1.25 + rng() * 0.9;
      base[j] = c3.r * b; base[j + 1] = c3.g * b; base[j + 2] = c3.b * b;
      colA[j] = base[j]; colA[j + 1] = base[j + 1]; colA[j + 2] = base[j + 2];
    }
    g.setDrawRange(0, hw);
    pAttr.needsUpdate = true; cAttr.needsUpdate = true; sAttr.needsUpdate = true;
  }

  function update(dt) {
    const d = clamp(dt || 0, 0, 0.1);
    let live = 0, top = 0;
    for (let i = 0; i < hw; i++) {
      if (life[i] <= 0) { sizeA[i] = 0; continue; }
      life[i] -= d;
      const j = i * 3;
      if (life[i] <= 0) {
        life[i] = 0; sizeA[i] = 0; pos[j + 1] = -100000;
        colA[j] = colA[j + 1] = colA[j + 2] = 0;
        continue;
      }
      live++; top = i + 1;
      const age = 1 - life[i] * invL[i];
      vel[j + 1] -= 9.4 * d;
      const k = 1 - 1.6 * d;
      vel[j] *= k; vel[j + 2] *= k;
      pos[j] += vel[j] * d;
      pos[j + 1] += vel[j + 1] * d;
      pos[j + 2] += vel[j + 2] * d;
      const f = (1 - age) * (1 - age);
      sizeA[i] = sz[i] * (0.35 + 0.65 * (1 - age));
      colA[j] = base[j] * f;
      colA[j + 1] = base[j + 1] * f * (0.55 + 0.45 * f);
      colA[j + 2] = base[j + 2] * f * f;
    }
    alive = live;
    hw = top;
    g.setDrawRange(0, hw);
    pAttr.needsUpdate = true; cAttr.needsUpdate = true; sAttr.needsUpdate = true;
  }

  function dispose() { g.dispose(); mat.dispose(); tex.dispose(); }

  return { points, burst, update, dispose, material: mat, texture: tex, get count() { return alive; }, capacity: N };
}
