// -----------------------------------------------------------------------------
// PERILOUS WAYS — terrain
//
//   createTerrain(world, THREE, opts) -> { group, shared, update, setForestDamage, dispose }
//
// Owns: ground mesh (vertex-painted, merged, cloud-shadowed), sea/lake/river
// shader surface with shore foam, instanced wind-swayed trees, instanced
// rocks + outcrops, drifting cloud-shadow DataTexture, ash haze.
//
// No textures from disk, no build step, no addons. Deterministic in world.seed.
//
// Shared uniforms (plain {value} objects — wire these into rail/prop/train
// materials so the whole scene moves and shades together):
//
//   shared.uTime    {value: Number}         seconds, monotonic
//   shared.uWind    {value: Vector3}        (dirX, dirZ, strength)  dir is unit
//   shared.uCloud   {value: DataTexture}    tiling cloud cover, .r/.g two layers
//   shared.uCloudXf {value: Vector4}        (offsetU, offsetV, worldScale, strength)
//   shared.uSun     {value: Vector3}        unit vector *towards* the sun
//   shared.uAsh     {value: Number}         0..1 ashfall level
//   shared.uFog     {value: Vector4}        (fogR, fogG, fogB, density) linear
//
// Cloud lookup, for other modules (paste into your shader):
//   uv = worldPos.xz * uCloudXf.z + uCloudXf.xy
//   c  = texture2D(uCloud, uv).r * texture2D(uCloud, uv*0.53 - uCloudXf.xy*0.7).g
//   light *= mix(1.0, c, uCloudXf.w)
// -----------------------------------------------------------------------------

import * as THREE_NS from 'three';
import { makeRng, makeNoise, clamp, lerp, smoothstep } from '../rng.js';

// --- BIOME / REGION enums (mirrored from worldgen.js; do not import, keeps
// --- this module standalone for the test harness).
const B_OCEAN = 0, B_BEACH = 1, B_DOWNS = 2, B_FARM = 3, B_FOREST = 4,
  B_DARKWOOD = 5, B_MARSH = 6, B_MOOR = 7, B_ROCK = 8, B_SNOW = 9,
  B_ASH = 10, B_SLAG = 11;

const R_GREENHOLLOW = 0, R_FROSTMARCH = 1, R_MIRKHOLT = 2, R_PEAKS = 3,
  R_WEEPING = 4, R_ASHENREACH = 5, R_MARCHLANDS = 6, R_ELDERWOOD = 7,
  R_QUAYS = 8, R_BARROWDOWNS = 9, R_WODENHOLT = 10;

// --- ART.md palette. Kept as hex; all mixing happens in sRGB (gamma) space,
// --- which is where the palette was chosen, and is converted to the renderer's
// --- working space exactly once, on write.
const PAL = {
  downs: 0x7d9a4e, downsHi: 0xa9ba69, dry: 0xb2a35e,
  farm: 0xc2a758, plough: 0x8a6f47,
  forestFloor: 0x4a5f3c, canopy: 0x3f6340, darkCanopy: 0x223a2c,
  moor: 0x7b7a4e, heather: 0x8a6f84,
  marsh: 0x6b7145, marshWater: 0x4a5a52,
  rock: 0x7d7468, cliff: 0x544e46, scree: 0x948a7c,
  snow: 0xeef2f5, snowShadow: 0xc3d0dc,
  ash: 0x4a4348, slag: 0x2a2428, ember: 0xff6a2a,
  beach: 0xd8c9a0,
  deep: 0x2c5f70, shallow: 0x5f9a9c, foam: 0xe9f4ef,
  timber: 0x7a5c3c, darkTimber: 0x4a3626,
  skyHorizon: 0xf2c98a, skyZenith: 0x3f74c4, fog: 0xe6c8a2, sun: 0xffd7a3,
};

// ---------------------------------------------------------------------------
// colour helpers — sRGB space triples, linearised on write
// ---------------------------------------------------------------------------

function hexRgb(hex) {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}
function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
/** mix two sRGB triples into `out` */
function mix3(out, a, b, t) {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
  return out;
}
function copy3(out, a) { out[0] = a[0]; out[1] = a[1]; out[2] = a[2]; return out; }

// ---------------------------------------------------------------------------

export function createTerrain(world, THREE = THREE_NS, opts = {}) {
  if (!THREE) THREE = THREE_NS;

  const O = Object.assign({
    trees: 13500,          // instance budget across all species
    rocks: 2600,
    cloudTex: 256,         // cloud DataTexture edge
    cloudWorld: 900,       // world units per cloud tile
    cloudStrength: 0.55,   // 0 = no shadow, 1 = full
    hazeCount: 1800,
    shadows: true,
    seaSkirt: 2600,        // how far the outer ocean reaches past the map
  }, opts);

  const W = world.W, H = world.H, CELL = world.CELL;
  const worldW = world.worldW != null ? world.worldW : W * CELL;
  const worldH = world.worldH != null ? world.worldH : H * CELL;
  const X0 = -worldW / 2, Z0 = -worldH / 2;   // world coord of cell 0,0 corner

  const seed = String(world.seed == null ? 'eardon' : world.seed);
  const nz = makeNoise(seed + ':tint');
  const nz2 = makeNoise(seed + ':field');

  const linearOut = !(THREE.ColorManagement && THREE.ColorManagement.enabled === false);
  const toOut = linearOut ? srgbToLinear : (c) => c;

  const group = new THREE.Group();
  group.name = 'terrain';

  const disposables = [];
  const track = (x) => { disposables.push(x); return x; };

  // ---------------------------------------------------------------------
  // shared uniforms
  // ---------------------------------------------------------------------
  const fogRgb = hexRgb(PAL.fog);
  const shared = {
    uTime: { value: 0 },
    uWind: { value: new THREE.Vector3(0.82, 0.57, 1.0) },
    uCloud: { value: null },
    uCloudXf: { value: new THREE.Vector4(0, 0, 1 / O.cloudWorld, O.cloudStrength) },
    uSun: { value: new THREE.Vector3(-0.45, 0.41, 0.79).normalize() },
    uAsh: { value: 0 },
    // density 0.0012 puts a far peak (~1000 units) at ~76% washed out, which is
    // the ART.md target; the host should give scene.fog the same numbers so the
    // water (which fogs itself) matches the rest
    uFog: {
      value: new THREE.Vector4(
        toOut(fogRgb[0]), toOut(fogRgb[1]), toOut(fogRgb[2]), 0.0012),
    },
  };

  // =====================================================================
  // 1. CLOUD SHADOW MAP  — perfectly tiling periodic value noise
  // =====================================================================
  const cloudTex = buildCloudTexture(THREE, O.cloudTex, seed);
  cloudTex.wrapS = cloudTex.wrapT = THREE.RepeatWrapping;
  shared.uCloud.value = cloudTex;
  // INTERFACES.md: "uCloud is a DataTexture of drifting cloud cover plus its
  // offset/scale" — the texture's own offset/repeat are kept authoritative and
  // mirrored into uCloudXf for shader use.
  cloudTex.repeat.set(1 / O.cloudWorld, 1 / O.cloudWorld);
  cloudTex.offset.set(0, 0);
  track(cloudTex);

  // =====================================================================
  // 2. SHADER PATCH — one code path for every lit surface we own
  // =====================================================================
  const patchStandard = makeStandardPatcher(THREE, shared);

  // -------- placeholders filled in by the builders below ---------------
  const api = {
    group, shared,
    update: null, setForestDamage: null, dispose: null,
    stats: { drawCalls: 0, triangles: 0, instances: 0 },
    palette: PAL,
  };

  // =====================================================================
  // 3. CELL-LEVEL PAINT PASS  (per-cell colour + masks, then blurred)
  // =====================================================================
  const paint = paintCells(world, { W, H, CELL, X0, Z0, nz, nz2 });

  // =====================================================================
  // 4. GROUND MESH
  // =====================================================================
  const ground = buildGround(THREE, world, paint, {
    W, H, CELL, X0, Z0, nz, toOut, skirtDepth: 42,
  });
  const groundMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.94,
    metalness: 0.0,
    flatShading: false,
    dithering: true,
  });
  patchStandard(groundMat, { cloud: true, ash: true, ember: true, key: 'ground' });
  const groundMesh = new THREE.Mesh(ground.geometry, groundMat);
  groundMesh.name = 'ground';
  groundMesh.castShadow = O.shadows;
  groundMesh.receiveShadow = O.shadows;
  groundMesh.matrixAutoUpdate = false;
  groundMesh.updateMatrix();
  group.add(groundMesh);
  track(ground.geometry); track(groundMat);

  // =====================================================================
  // 5. WATER
  // =====================================================================
  const water = buildWater(THREE, world, shared, {
    W, H, CELL, X0, Z0, skirt: O.seaSkirt, toOut, nz,
  });
  group.add(water.mesh);
  track(water.mesh.geometry); track(water.mesh.material);

  // =====================================================================
  // 6. TREES
  // =====================================================================
  const forest = buildForest(THREE, world, shared, patchStandard, {
    W, H, CELL, X0, Z0, seed, budget: O.trees, shadows: O.shadows, toOut,
  });
  for (const m of forest.meshes) group.add(m);
  forest.disposables.forEach(track);

  // =====================================================================
  // 7. ROCKS + OUTCROPS
  // =====================================================================
  const stone = buildStone(THREE, world, patchStandard, {
    W, H, CELL, X0, Z0, seed, budget: O.rocks, shadows: O.shadows, toOut,
  });
  for (const m of stone.meshes) group.add(m);
  stone.disposables.forEach(track);

  // =====================================================================
  // 8. ASH HAZE
  // =====================================================================
  const haze = buildHaze(THREE, world, shared, {
    W, H, CELL, X0, Z0, seed, count: O.hazeCount, toOut,
  });
  if (haze) { group.add(haze.points); track(haze.points.geometry); track(haze.points.material); }

  // =====================================================================
  // update / damage / dispose
  // =====================================================================
  const _cloudDrift = new THREE.Vector2(0, 0);
  const gustN = makeNoise(seed + ':gust');
  let elapsed = 0;

  api.update = function update(dt, env) {
    if (!(dt >= 0)) dt = 0;
    if (dt > 0.25) dt = 0.25;             // never let a stall blow the sway up
    elapsed = (env && typeof env.time === 'number') ? env.time : elapsed + dt;
    shared.uTime.value = elapsed;

    // wind, with a shared gust so trees/smoke/banners breathe together
    let wx = 0.82, wz = 0.57, ws = 1;
    if (env && env.windDir) { wx = env.windDir[0]; wz = env.windDir[1]; }
    if (env && typeof env.windStrength === 'number') ws = env.windStrength;
    const wl = Math.hypot(wx, wz) || 1;
    const gust = 1 + 0.35 * gustN.fbm(elapsed * 0.07, 0.5, 2);
    shared.uWind.value.set(wx / wl, wz / wl, Math.max(0, ws) * gust);

    // cloud drift: clouds run with the wind, a little faster than the trees feel
    _cloudDrift.x -= (wx / wl) * ws * dt * 0.0085;
    _cloudDrift.y -= (wz / wl) * ws * dt * 0.0085;
    if (_cloudDrift.x > 1 || _cloudDrift.x < -1) _cloudDrift.x %= 1;
    if (_cloudDrift.y > 1 || _cloudDrift.y < -1) _cloudDrift.y %= 1;
    cloudTex.offset.set(_cloudDrift.x, _cloudDrift.y);
    shared.uCloudXf.value.set(_cloudDrift.x, _cloudDrift.y,
      cloudTex.repeat.x, O.cloudStrength);

    if (env && env.sunDir) {
      shared.uSun.value.copy(env.sunDir).normalize();
    }
    const ash = env && typeof env.ashLevel === 'number' ? clamp(env.ashLevel, 0, 1) : 0;
    shared.uAsh.value = ash;

    water.update(dt, env);
    if (haze) haze.update(dt, env, ash);
  };

  api.setForestDamage = forest.setForestDamage;

  api.dispose = function dispose() {
    group.parent && group.parent.remove(group);
    group.clear();
    for (const d of disposables) { if (d && d.dispose) d.dispose(); }
    disposables.length = 0;
  };

  // reported for the budget check
  api.stats = countStats(group);
  api.stats.instances = forest.total + stone.total;
  api.forestCount = () => forest.liveCount();

  return api;
}

// ===========================================================================
// stats
// ===========================================================================
function countStats(group) {
  let drawCalls = 0, triangles = 0;
  group.traverse((o) => {
    if (!o.isMesh && !o.isPoints) return;
    drawCalls++;
    const g = o.geometry;
    if (!g) return;
    const n = g.index ? g.index.count : (g.attributes.position ? g.attributes.position.count : 0);
    if (o.isPoints) return;
    const per = n / 3;
    triangles += Math.round(per * (o.isInstancedMesh ? o.count : 1));
  });
  return { drawCalls, triangles, instances: 0 };
}

// ===========================================================================
// CLOUD SHADOW TEXTURE
// Periodic value-noise (lattice hashed modulo N) so the map tiles seamlessly at
// any octave. .r = broad cover, .g = a second, finer layer scrolled separately.
// ===========================================================================
function buildCloudTexture(THREE, N, seed) {
  const rng = makeRng(seed + ':cloud');
  const lattices = [];
  const periods = [4, 8, 16, 32, 64];
  for (const p of periods) {
    const g = new Float32Array(p * p);
    for (let i = 0; i < g.length; i++) g[i] = rng();
    lattices.push({ p, g });
  }
  const fade = (t) => t * t * (3 - 2 * t);
  function periodic(u, v, li) {
    const { p, g } = lattices[li];
    const x = u * p, y = v * p;
    const xi = Math.floor(x), yi = Math.floor(y);
    const tx = fade(x - xi), ty = fade(y - yi);
    const x0 = ((xi % p) + p) % p, x1 = (x0 + 1) % p;
    const y0 = ((yi % p) + p) % p, y1 = (y0 + 1) % p;
    const a = g[y0 * p + x0], b = g[y0 * p + x1];
    const c = g[y1 * p + x0], d = g[y1 * p + x1];
    return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
  }
  function cover(u, v, base) {
    let s = 0, amp = 1, norm = 0;
    for (let o = 0; o < 4; o++) {
      s += amp * periodic(u, v, base + o);
      norm += amp;
      amp *= 0.52;
    }
    return s / norm;
  }

  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = x / N, v = y / N;
      // broad cover: shaped so there is plenty of open sun and a few big shadows
      const c1 = cover(u, v, 0);
      const shade1 = 1 - 0.85 * smoothstep(0.50, 0.78, c1);
      // finer, higher-contrast wisps
      const c2 = cover(u * 2.0, v * 2.0, 1);
      const shade2 = 1 - 0.42 * smoothstep(0.46, 0.80, c2);
      const i = (y * N + x) * 4;
      data[i] = Math.round(clamp(shade1, 0, 1) * 255);
      data[i + 1] = Math.round(clamp(shade2, 0, 1) * 255);
      data[i + 2] = Math.round(clamp(c1, 0, 1) * 255);
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  tex.name = 'pw-cloud';
  return tex;
}

// ===========================================================================
// GLSL INJECTION
// Every lit surface we own is a MeshStandardMaterial patched here, so three
// keeps ownership of lighting, shadows and fog. No #ifdef of our own: the flag
// combinations are resolved in JS, which keeps the preprocessor out of it.
// ===========================================================================

function inject(src, marker, code, before) {
  const at = src.indexOf(marker);
  if (at < 0) {
    console.warn('[terrain] shader marker missing, effect skipped:', marker);
    return src;
  }
  return before
    ? src.slice(0, at) + code + '\n' + src.slice(at)
    : src.slice(0, at + marker.length) + '\n' + code + src.slice(at + marker.length);
}

const GLSL_CLOUD_FN = `
float pwCloud(vec2 wxz) {
  vec2 uv = wxz * uCloudXf.z + uCloudXf.xy;
  float a = texture2D(uCloud, uv).r;
  float b = texture2D(uCloud, uv * 0.53 - uCloudXf.xy * 0.7).g;
  return mix(1.0, a * b, uCloudXf.w);
}`;

// sway shared by the standard material and the shadow depth material, so a
// tree and its shadow lean the same way
const GLSL_SWAY = `
  float pwCa = cos(aPwRot), pwSa = sin(aPwRot);
  transformed.xz = vec2(pwCa * transformed.x + pwSa * transformed.z,
                       -pwSa * transformed.x + pwCa * transformed.z);
  float pwF = aPwFlex * aPwFlex;
  float pwT = uTime * 1.15 + aPwPhase;
  float pwS = sin(pwT) * 0.55 + sin(pwT * 2.17 + 1.7) * 0.25 + sin(pwT * 0.43 + 0.6) * 0.4;
  float pwAmp = pwF * uWind.z * 0.9;
  transformed.x += uWind.x * (0.6 + 0.4 * pwS) * pwAmp;
  transformed.z += uWind.y * (0.6 + 0.4 * pwS) * pwAmp;
  transformed.y -= pwF * abs(pwAmp) * 0.16;`;

const GLSL_SWAY_DECL = `
uniform float uTime;
uniform vec3 uWind;
attribute float aPwFlex;
attribute float aPwPhase;
attribute float aPwRot;`;

function makeStandardPatcher(THREE, shared) {
  return function patchStandard(mat, flags) {
    const F = Object.assign({
      cloud: false, wind: false, ash: false, ember: false, key: 'std',
    }, flags);
    const needMask = F.ash || F.ember;
    const needWorld = F.cloud || F.ember;   // ember flicker reads world xz

    // MUST override: the default cache key is onBeforeCompile.toString(), which
    // is identical for every material patched by this closure, so three would
    // hand them all the same program.
    mat.customProgramCacheKey = () => 'pw|' + F.key;

    mat.onBeforeCompile = function (shader) {
      if (F.cloud) {
        shader.uniforms.uCloud = shared.uCloud;
        shader.uniforms.uCloudXf = shared.uCloudXf;
      }
      if (F.wind) {
        shader.uniforms.uTime = shared.uTime;
        shader.uniforms.uWind = shared.uWind;
      }
      if (F.ash || F.ember) shader.uniforms.uAsh = shared.uAsh;
      if (F.ember) {
        shader.uniforms.uTime = shared.uTime;
        shader.uniforms.uPwEmber = { value: new THREE.Color(0xff6a2a) };
      }

      // ---- vertex ----
      let vd = '';
      if (F.wind) vd += GLSL_SWAY_DECL;
      if (needWorld) vd += '\nvarying vec3 vPwWorld;';
      if (needMask) vd += '\nattribute vec2 aPwMask;\nvarying vec2 vPwMask;';
      if (vd) shader.vertexShader = inject(shader.vertexShader, '#include <common>', vd);

      let vb = '';
      if (F.wind) vb += GLSL_SWAY;
      if (needMask) vb += '\n  vPwMask = aPwMask;';
      if (needWorld) {
        vb += `
  vec4 pwWp = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    pwWp = instanceMatrix * pwWp;
  #endif
  vPwWorld = (modelMatrix * pwWp).xyz;`;
      }
      if (vb) shader.vertexShader = inject(shader.vertexShader, '#include <begin_vertex>', vb);

      // ---- fragment ----
      let fd = '';
      if (needWorld) fd += '\nvarying vec3 vPwWorld;';
      if (needMask) fd += '\nvarying vec2 vPwMask;\nuniform float uAsh;';
      if (F.ember) fd += '\nuniform vec3 uPwEmber;\nuniform float uTime;';
      if (F.cloud) {
        fd += '\nuniform sampler2D uCloud;\nuniform vec4 uCloudXf;' + GLSL_CLOUD_FN;
      }
      if (fd) shader.fragmentShader = inject(shader.fragmentShader, '#include <common>', fd);

      if (F.ash) {
        shader.fragmentShader = inject(shader.fragmentShader, '#include <color_fragment>', `
  diffuseColor.rgb *= mix(vec3(1.0), vec3(0.38, 0.40, 0.50), vPwMask.x * uAsh);`);
      }
      if (F.ember) {
        shader.fragmentShader = inject(shader.fragmentShader, '#include <emissivemap_fragment>', `
  float pwEm = vPwMask.y * (0.45 + 0.55 * uAsh);
  pwEm *= 0.72 + 0.28 * sin(uTime * 2.3 + vPwWorld.x * 0.13 + vPwWorld.z * 0.09);
  totalEmissiveRadiance += uPwEmber * pwEm;`);
      }
      if (F.cloud) {
        shader.fragmentShader = inject(shader.fragmentShader, '#include <lights_fragment_end>', `
  float pwCl = pwCloud(vPwWorld.xz);
  reflectedLight.directDiffuse *= pwCl;
  reflectedLight.directSpecular *= pwCl;
  reflectedLight.indirectDiffuse *= mix(1.0, pwCl, 0.30);`);
      }
    };
    return mat;
  };
}

/** Shadow-pass twin of the wind sway, so shadows lean with their trees. */
function makeSwayDepthMaterial(THREE, shared, key) {
  const dm = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  dm.customProgramCacheKey = () => 'pwdepth|' + key;
  dm.onBeforeCompile = function (shader) {
    shader.uniforms.uTime = shared.uTime;
    shader.uniforms.uWind = shared.uWind;
    shader.vertexShader = inject(shader.vertexShader, '#include <common>', GLSL_SWAY_DECL);
    shader.vertexShader = inject(shader.vertexShader, '#include <begin_vertex>', GLSL_SWAY);
  };
  return dm;
}

// ===========================================================================
// CELL PAINT PASS
// Per-cell sRGB colour + (ash, ember) masks, then a separable blur so biome
// boundaries wash into each other over ~2 cells instead of snapping like a
// boardgame. Snow/scree/beach are painted before the blur so their edges get
// softened too; the noise jitter on the snowline keeps it off a contour.
// ===========================================================================
function paintCells(world, ctx) {
  const { W, H, CELL, X0, Z0, nz, nz2 } = ctx;
  const N = W * H;
  const height = world.height, water = world.water, biome = world.biome;
  const region = world.region, moist = world.moist, slope = world.slope;

  const C = {
    downs: hexRgb(PAL.downs), downsHi: hexRgb(PAL.downsHi), dry: hexRgb(PAL.dry),
    farm: hexRgb(PAL.farm), plough: hexRgb(PAL.plough),
    ffloor: hexRgb(PAL.forestFloor), dcan: hexRgb(PAL.darkCanopy),
    moor: hexRgb(PAL.moor), heather: hexRgb(PAL.heather),
    marsh: hexRgb(PAL.marsh), mwater: hexRgb(PAL.marshWater),
    rock: hexRgb(PAL.rock), cliff: hexRgb(PAL.cliff), scree: hexRgb(PAL.scree),
    snow: hexRgb(PAL.snow), snowSh: hexRgb(PAL.snowShadow),
    ash: hexRgb(PAL.ash), slag: hexRgb(PAL.slag),
    beach: hexRgb(PAL.beach),
    silt: [0.16, 0.19, 0.19],
    wetsand: [0.55, 0.50, 0.39],
  };

  const col = new Float32Array(N * 3);
  const mask = new Float32Array(N * 2);
  const tmp = [0, 0, 0], out = [0, 0, 0];

  // land cells within 2 cells of open water get a beach ramp
  const nearSea = new Uint8Array(N);
  for (let cy = 0; cy < H; cy++) {
    for (let cx = 0; cx < W; cx++) {
      const w = water[cy * W + cx];
      if (w !== 2 && w !== 3) continue;
      for (let dy = -2; dy <= 2; dy++) {
        const y = cy + dy; if (y < 0 || y >= H) continue;
        for (let dx = -2; dx <= 2; dx++) {
          const x = cx + dx; if (x < 0 || x >= W) continue;
          nearSea[y * W + x] = 1;
        }
      }
    }
  }

  for (let cy = 0; cy < H; cy++) {
    for (let cx = 0; cx < W; cx++) {
      const i = cy * W + cx;
      const wx = X0 + (cx + 0.5) * CELL, wz = Z0 + (cy + 0.5) * CELL;
      const h = height[i], b = biome[i], rg = region[i], w = water[i];
      const mo = moist ? moist[i] : 0.5;
      const sl = slope ? slope[i] : 0;

      const n1 = nz.fbm(wx * 0.013, wz * 0.013, 3);        // broad blotch
      const n2 = nz.noise2(wx * 0.09, wz * 0.09);           // fine grain
      const patch = nz2.fbm(wx * 0.021, wz * 0.021, 2);     // field / heather patches

      if (b === B_OCEAN || w === 3) {
        // sea floor: wet sand near the surface, silt as it drops away
        mix3(out, C.wetsand, C.silt, smoothstep(-1.5, -16, h));
      } else if (b === B_BEACH) {
        mix3(out, C.beach, C.wetsand, smoothstep(1.6, 0.0, h));
      } else if (b === B_FARM) {
        // quantised parcels so farmland reads as fields, not a lawn
        const parcel = Math.abs((patch * 7.3) % 1);
        mix3(out, C.farm, C.plough, smoothstep(0.28, 0.62, parcel));
        mix3(out, out, C.downs, 0.22 + 0.18 * n1);
      } else if (b === B_DOWNS) {
        mix3(out, C.downs, C.downsHi, clamp(0.35 + 0.55 * n1, 0, 1));
        mix3(out, out, C.dry, clamp(0.62 - mo * 0.9, 0, 0.7));
      } else if (b === B_FOREST) {
        mix3(out, C.ffloor, C.downs, clamp(0.22 + 0.2 * n1, 0, 1));
      } else if (b === B_DARKWOOD) {
        mix3(out, C.ffloor, C.dcan, clamp(0.55 + 0.3 * n1, 0, 1));
      } else if (b === B_MARSH) {
        mix3(out, C.marsh, C.mwater, clamp(0.3 + 0.6 * patch + 0.25 * mo, 0, 1));
      } else if (b === B_MOOR) {
        mix3(out, C.moor, C.heather, clamp(smoothstep(0.15, 0.65, patch) * 0.75, 0, 1));
      } else if (b === B_ROCK) {
        mix3(out, C.rock, C.scree, clamp(0.35 + 0.45 * n1, 0, 1));
        mix3(out, out, C.cliff, 0.2);   // the palette greys read tan under a warm sun
      } else if (b === B_SNOW) {
        mix3(out, C.snow, C.snowSh, clamp(0.25 + 0.35 * n1, 0, 1));
      } else if (b === B_ASH) {
        mix3(out, C.ash, C.slag, clamp(0.25 + 0.45 * patch, 0, 1));
      } else if (b === B_SLAG) {
        mix3(out, C.slag, C.ash, clamp(0.15 + 0.3 * n1, 0, 1));
      } else {
        copy3(out, C.downs);
      }

      // --- steep ground: cliff face, then scree where it eases off
      if (b !== B_OCEAN && w !== 3) {
        const cliffT = smoothstep(0.62, 1.35, sl);
        if (cliffT > 0) mix3(out, out, C.cliff, cliffT * 0.85);
        const screeT = smoothstep(0.34, 0.72, sl) * (1 - cliffT) * smoothstep(6, 26, h);
        if (screeT > 0) mix3(out, out, C.scree, screeT * 0.6);
      }

      // --- snowline, jittered and shed from steep faces
      if (b !== B_OCEAN && w === 0) {
        const frost = rg === R_FROSTMARCH ? 26 : 0;
        const jitter = 11 * n1 + 3 * n2;
        let snowT = smoothstep(60 - frost, 78 - frost, h + jitter);
        snowT *= 1 - 0.75 * smoothstep(0.85, 1.7, sl);
        if (rg === R_ASHENREACH) snowT *= 0.15;
        if (snowT > 0) {
          mix3(tmp, C.snow, C.snowSh, clamp(0.2 + 0.4 * n2 + 0.3 * sl, 0, 1));
          mix3(out, out, tmp, clamp(snowT, 0, 1));
        }
      }

      // --- beach at the waterline
      if (w === 0 && nearSea[i] && h < 4.5) {
        const t = smoothstep(4.2, 0.1, h) * 0.85;
        mix3(out, out, C.beach, t);
      }

      // --- ash overlay in the east, ragged at its edge
      let ashM = 0;
      if (b === B_ASH || b === B_SLAG) ashM = 1;
      else if (rg === R_ASHENREACH) ashM = clamp(0.55 + 0.6 * n1, 0, 1);
      if (ashM > 0 && b !== B_ASH && b !== B_SLAG) {
        mix3(out, out, C.ash, ashM * 0.45);
      }

      // --- ember cracks: thin ridged veins in slag, hottest in low ground
      let emb = 0;
      if (b === B_SLAG || (b === B_ASH && rg === R_ASHENREACH)) {
        const v = nz2.ridge(wx * 0.045, wz * 0.045, 2);
        emb = smoothstep(0.86, 0.995, v) * (b === B_SLAG ? 1 : 0.35);
        emb *= 1 - smoothstep(20, 55, h);
      }

      // --- final grain so nothing reads as a flat gouraud gradient
      const g = 1 + 0.075 * n1 + 0.035 * n2;
      col[i * 3] = clamp(out[0] * g, 0, 1);
      col[i * 3 + 1] = clamp(out[1] * g, 0, 1);
      col[i * 3 + 2] = clamp(out[2] * g, 0, 1);
      mask[i * 2] = ashM;
      mask[i * 2 + 1] = emb;
    }
  }

  blurRGB(col, W, H, 3);
  blurRGB(col, W, H, 3);
  blurRGB(mask, W, H, 2);

  return { col, mask };
}

/** separable 1-2-1 blur over a strided cell array, clamped at the edges */
function blurRGB(a, W, H, stride) {
  const tmpA = new Float32Array(a.length);
  for (let cy = 0; cy < H; cy++) {
    for (let cx = 0; cx < W; cx++) {
      const l = cx > 0 ? cx - 1 : 0, r = cx < W - 1 ? cx + 1 : W - 1;
      const i = (cy * W + cx) * stride, il = (cy * W + l) * stride, ir = (cy * W + r) * stride;
      for (let k = 0; k < stride; k++) tmpA[i + k] = (a[il + k] + 2 * a[i + k] + a[ir + k]) * 0.25;
    }
  }
  for (let cy = 0; cy < H; cy++) {
    const u = cy > 0 ? cy - 1 : 0, d = cy < H - 1 ? cy + 1 : H - 1;
    for (let cx = 0; cx < W; cx++) {
      const i = (cy * W + cx) * stride, iu = (u * W + cx) * stride, id = (d * W + cx) * stride;
      for (let k = 0; k < stride; k++) a[i + k] = (tmpA[iu + k] + 2 * tmpA[i + k] + tmpA[id + k]) * 0.25;
    }
  }
}

// ===========================================================================
// GROUND MESH
// Vertices sit on cell centres so the surface passes exactly through
// world.heightAt() — rails and props laid with that function will not float.
// A flared skirt drops the map edge into the sea.
// ===========================================================================
function buildGround(THREE, world, paint, ctx) {
  const { W, H, CELL, X0, Z0, nz, toOut, skirtDepth } = ctx;
  const height = world.height;
  const NV = W * H;
  const perim = 2 * W + 2 * H - 4;
  const total = NV + perim;

  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const cols = new Float32Array(total * 3);
  const msk = new Float32Array(total * 2);

  const h = (cx, cy) => height[
    (cy < 0 ? 0 : cy > H - 1 ? H - 1 : cy) * W + (cx < 0 ? 0 : cx > W - 1 ? W - 1 : cx)];

  for (let cy = 0; cy < H; cy++) {
    for (let cx = 0; cx < W; cx++) {
      const i = cy * W + cx;
      const x = X0 + (cx + 0.5) * CELL, z = Z0 + (cy + 0.5) * CELL;
      pos[i * 3] = x; pos[i * 3 + 1] = height[i]; pos[i * 3 + 2] = z;

      const dx = (h(cx + 1, cy) - h(cx - 1, cy)) / (2 * CELL);
      const dz = (h(cx, cy + 1) - h(cx, cy - 1)) / (2 * CELL);
      const inv = 1 / Math.sqrt(dx * dx + dz * dz + 1);
      nor[i * 3] = -dx * inv; nor[i * 3 + 1] = inv; nor[i * 3 + 2] = -dz * inv;

      cols[i * 3] = toOut(paint.col[i * 3]);
      cols[i * 3 + 1] = toOut(paint.col[i * 3 + 1]);
      cols[i * 3 + 2] = toOut(paint.col[i * 3 + 2]);
      msk[i * 2] = paint.mask[i * 2];
      msk[i * 2 + 1] = paint.mask[i * 2 + 1];
    }
  }

  // ---- boundary ring, interior kept on the right so the winding is uniform
  const ring = new Int32Array(perim);
  let k = 0;
  for (let cx = 0; cx < W; cx++) ring[k++] = 0 * W + cx;
  for (let cy = 1; cy < H; cy++) ring[k++] = cy * W + (W - 1);
  for (let cx = W - 2; cx >= 0; cx--) ring[k++] = (H - 1) * W + cx;
  for (let cy = H - 2; cy >= 1; cy--) ring[k++] = cy * W + 0;

  const cliff = hexRgb(PAL.cliff);
  const cr = toOut(cliff[0] * 0.8), cg = toOut(cliff[1] * 0.8), cb = toOut(cliff[2] * 0.8);
  const cxM = X0 + W * CELL * 0.5, czM = Z0 + H * CELL * 0.5;
  for (let j = 0; j < perim; j++) {
    const src = ring[j], dst = NV + j;
    let ox = pos[src * 3] - cxM, oz = pos[src * 3 + 2] - czM;
    const ol = Math.hypot(ox, oz) || 1;
    ox /= ol; oz /= ol;
    pos[dst * 3] = pos[src * 3] + ox * 14;
    pos[dst * 3 + 1] = -skirtDepth;
    pos[dst * 3 + 2] = pos[src * 3 + 2] + oz * 14;
    nor[dst * 3] = ox; nor[dst * 3 + 1] = 0.15; nor[dst * 3 + 2] = oz;
    cols[dst * 3] = cr; cols[dst * 3 + 1] = cg; cols[dst * 3 + 2] = cb;
    msk[dst * 2] = 0; msk[dst * 2 + 1] = 0;
  }

  const idx = new Uint32Array((W - 1) * (H - 1) * 6 + perim * 6);
  let t = 0;
  for (let cy = 0; cy < H - 1; cy++) {
    for (let cx = 0; cx < W - 1; cx++) {
      const i00 = cy * W + cx, i10 = i00 + 1, i01 = i00 + W, i11 = i01 + 1;
      idx[t++] = i00; idx[t++] = i01; idx[t++] = i10;
      idx[t++] = i10; idx[t++] = i01; idx[t++] = i11;
    }
  }
  for (let j = 0; j < perim; j++) {
    const j1 = (j + 1) % perim;
    const tk = ring[j], tk1 = ring[j1], bk = NV + j, bk1 = NV + j1;
    idx[t++] = tk; idx[t++] = bk1; idx[t++] = bk;
    idx[t++] = tk; idx[t++] = tk1; idx[t++] = bk1;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.setAttribute('aPwMask', new THREE.BufferAttribute(msk, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  geo.name = 'pw-ground';
  return { geometry: geo, vertexCount: total, triangles: t / 3 };
}

// ===========================================================================
// WATER
// One mesh: sea/lake/river cells (dilated a cell so it always tucks under the
// shoreline) plus a coarse frame running out to the horizon. Raw ShaderMaterial
// because it needs no lighting — depth colour, fresnel sky, sun glint, two
// analytic ripple layers and depth-driven shore foam.
// ===========================================================================
function buildWater(THREE, world, shared, ctx) {
  const { W, H, CELL, X0, Z0, skirt, toOut } = ctx;
  const height = world.height, water = world.water;
  const N = W * H;

  // ---- water surface height per cell (0 for sea; local for river/lake)
  const surf = new Float32Array(N);
  const isW = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const w = water[i];
    isW[i] = w > 0 ? 1 : 0;
    // Rivers need real depth under the surface or the depth-driven colour ramp
    // never leaves its palest end and every river renders as a grey road.
    // worldgen carves river channels ~3 units below their banks to allow this.
    surf[i] = (w === 1 || w === 2) ? Math.max(0.2, height[i] + 1.85) : 0;
  }
  // smooth along the watercourse only, so lakes flatten and rivers run clean
  const sTmp = new Float32Array(N);
  for (let pass = 0; pass < 4; pass++) {
    sTmp.set(surf);
    for (let cy = 0; cy < H; cy++) {
      for (let cx = 0; cx < W; cx++) {
        const i = cy * W + cx;
        if (!isW[i] || water[i] === 3) continue;
        let acc = sTmp[i] * 2, wt = 2;
        for (let d = 0; d < 4; d++) {
          const nx = cx + (d === 0 ? 1 : d === 1 ? -1 : 0);
          const ny = cy + (d === 2 ? 1 : d === 3 ? -1 : 0);
          if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
          const j = ny * W + nx;
          if (!isW[j] || water[j] === 3) continue;
          acc += sTmp[j]; wt++;
        }
        surf[i] = acc / wt;
      }
    }
  }

  // ---- which cells get a quad: any water cell, dilated by one
  const emit = new Uint8Array(N);
  for (let cy = 0; cy < H; cy++) {
    for (let cx = 0; cx < W; cx++) {
      if (!isW[cy * W + cx]) continue;
      for (let dy = -1; dy <= 1; dy++) {
        const y = cy + dy; if (y < 0 || y >= H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const x = cx + dx; if (x < 0 || x >= W) continue;
          emit[y * W + x] = 1;
        }
      }
    }
  }

  const CW = W + 1, CH = H + 1;
  const cmap = new Int32Array(CW * CH).fill(-1);
  const pos = [], dep = [], kind = [], flow = [];

  const cellAt = (cx, cy) => (cx < 0 ? 0 : cx > W - 1 ? W - 1 : cx) +
    (cy < 0 ? 0 : cy > H - 1 ? H - 1 : cy) * W;

  function corner(gx, gy) {
    const key = gy * CW + gx;
    let id = cmap[key];
    if (id >= 0) return id;
    // the four cells touching this corner
    let hSum = 0, sMax = -1e9, kBest = 0, fx = 0, fz = 0, nw = 0;
    for (let dy = -1; dy <= 0; dy++) {
      for (let dx = -1; dx <= 0; dx++) {
        const j = cellAt(gx + dx, gy + dy);
        hSum += height[j];
        if (isW[j]) {
          nw++;
          if (surf[j] > sMax) { sMax = surf[j]; kBest = water[j]; }
          // downhill direction of the water surface, for river drift
          const cx2 = j % W, cy2 = (j - cx2) / W;
          fx += surf[cellAt(cx2 - 1, cy2)] - surf[cellAt(cx2 + 1, cy2)];
          fz += surf[cellAt(cx2, cy2 - 1)] - surf[cellAt(cx2, cy2 + 1)];
        }
      }
    }
    const hAvg = hSum * 0.25;
    // A corner with no water cell of its own is tucked *under* the ground, so
    // the sheet never hangs a flap off a river ribbon and never films over
    // dry land.
    const y = nw > 0 ? sMax : hAvg - 0.6;
    const fl = Math.hypot(fx, fz);
    id = pos.length / 3;
    pos.push(X0 + gx * CELL, y, Z0 + gy * CELL);
    dep.push(nw > 0 ? y - hAvg : -0.6);
    kind.push(nw > 0 ? kBest : 0);
    flow.push(fl > 1e-5 ? fx / fl : 0, fl > 1e-5 ? fz / fl : 0);
    cmap[key] = id;
    return id;
  }

  const idx = [];
  for (let cy = 0; cy < H; cy++) {
    for (let cx = 0; cx < W; cx++) {
      if (!emit[cy * W + cx]) continue;
      const a = corner(cx, cy), b = corner(cx + 1, cy);
      const c = corner(cx, cy + 1), d = corner(cx + 1, cy + 1);
      idx.push(a, c, b, b, c, d);
    }
  }

  // ---- horizon frame: inner edge on the map bound, outer edge far out
  const iW = W * CELL * 0.5, iH = H * CELL * 0.5;
  const oW = iW + skirt, oH = iH + skirt;
  const ringPt = (x, z, depth) => {
    const id = pos.length / 3;
    pos.push(x, 0, z); dep.push(depth); kind.push(4); flow.push(0, 0);
    return id;
  };
  {
    const inn = [
      ringPt(-iW, -iH, 22), ringPt(iW, -iH, 22), ringPt(iW, iH, 22), ringPt(-iW, iH, 22),
    ];
    const out = [
      ringPt(-oW, -oH, 60), ringPt(oW, -oH, 60), ringPt(oW, oH, 60), ringPt(-oW, oH, 60),
    ];
    for (let s = 0; s < 4; s++) {
      const s1 = (s + 1) % 4;
      idx.push(inn[s], out[s], out[s1]);
      idx.push(inn[s], out[s1], inn[s1]);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aDepth', new THREE.Float32BufferAttribute(dep, 1));
  geo.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
  geo.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 2));
  geo.setIndex(idx.length > 65000
    ? new THREE.BufferAttribute(new Uint32Array(idx), 1)
    : new THREE.BufferAttribute(new Uint16Array(idx), 1));
  geo.computeBoundingSphere();
  geo.name = 'pw-water';

  const lin = (hex) => { const c = hexRgb(hex); return new THREE.Vector3(toOut(c[0]), toOut(c[1]), toOut(c[2])); };

  const uniforms = {
    uTime: shared.uTime,
    uWind: shared.uWind,
    uSun: shared.uSun,
    uCloud: shared.uCloud,
    uCloudXf: shared.uCloudXf,
    uFog: shared.uFog,
    uDeep: { value: lin(PAL.deep) },
    uShallow: { value: lin(PAL.shallow) },
    uFoam: { value: lin(PAL.foam) },
    uMurk: { value: lin(PAL.marshWater) },
    uSkyLo: { value: lin(PAL.skyHorizon) },
    uSkyHi: { value: lin(PAL.skyZenith) },
    uSunCol: { value: lin(PAL.sun) },
  };

  const vert = `
attribute float aDepth;
attribute float aKind;
attribute vec2 aFlow;
uniform float uTime;
uniform vec3 uWind;
varying vec3 vPwW;
varying float vPwDepth;
varying float vPwKind;
varying vec2 vPwFlow;
varying float vPwFog;
void main() {
  vec3 p = position;
  // kind 4 is the coarse horizon frame: four quads, so any swell on it would
  // tilt the whole outer ocean and crease the seam with the detailed sheet
  float open = clamp((aDepth - 0.5) * 0.3, 0.0, 1.0) * step(aKind, 3.5);
  float t = uTime;
  float sw = sin(p.x * 0.031 + t * 0.55) * 0.5
           + sin(p.z * 0.043 - t * 0.41) * 0.5
           + sin((p.x + p.z) * 0.017 + t * 0.29) * 0.6;
  p.y += sw * 0.3 * open * (0.45 + 0.55 * clamp(uWind.z, 0.0, 2.0));
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vec4 mv = viewMatrix * wp;
  vPwW = wp.xyz;
  vPwDepth = aDepth;
  vPwKind = aKind;
  vPwFlow = aFlow;
  vPwFog = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

  const frag = `
uniform float uTime;
uniform vec3 uWind;
uniform vec3 uSun;
uniform sampler2D uCloud;
uniform vec4 uCloudXf;
uniform vec4 uFog;
uniform vec3 uDeep, uShallow, uFoam, uMurk, uSkyLo, uSkyHi, uSunCol;
varying vec3 vPwW;
varying float vPwDepth;
varying float vPwKind;
varying vec2 vPwFlow;
varying float vPwFog;

// gradient of a small stack of directional waves — analytic, no textures
vec2 pwGrad(vec2 p, float t, float k0, float amp) {
  vec2 d1 = vec2(0.860, 0.510);
  vec2 d2 = vec2(-0.420, 0.907);
  vec2 d3 = vec2(0.310, -0.951);
  vec2 d4 = vec2(-0.930, -0.368);
  float k1 = k0, k2 = k0 * 1.71, k3 = k0 * 3.11, k4 = k0 * 5.37;
  vec2 g = vec2(0.0);
  g += d1 * (k1 * 1.00 * cos(dot(d1, p) * k1 + t * 1.70));
  g += d2 * (k2 * 0.58 * cos(dot(d2, p) * k2 - t * 2.30));
  g += d3 * (k3 * 0.26 * cos(dot(d3, p) * k3 + t * 3.40));
  g += d4 * (k4 * 0.11 * cos(dot(d4, p) * k4 - t * 4.60));
  return g * amp;
}

float pwCloud(vec2 wxz) {
  vec2 uv = wxz * uCloudXf.z + uCloudXf.xy;
  float a = texture2D(uCloud, uv).r;
  float b = texture2D(uCloud, uv * 0.53 - uCloudXf.xy * 0.7).g;
  return mix(1.0, a * b, uCloudXf.w);
}

void main() {
  vec2 p = vPwW.xz;
  float t = uTime;
  float depth = vPwDepth;
  float river = 1.0 - min(abs(vPwKind - 1.0), 1.0);
  float lake  = 1.0 - min(abs(vPwKind - 2.0), 1.0);

  vec3 toEye = cameraPosition - vPwW;
  float vdist = length(toEye);
  vec3 V = toEye / max(vdist, 0.001);

  // Two ripple layers, plus a flow-aligned set on rivers. Each layer's
  // amplitude decays with view distance: analytic waves a few units long are
  // sub-pixel at 600 units and would otherwise moire into corduroy and throw
  // specular fireflies. Distant water ends up a smooth fresnel mirror with a
  // broad swell, which is how distant water actually reads.
  float lodFine = exp(-vdist * 0.0032);
  float lodWide = exp(-vdist * 0.00075);
  vec2 g = pwGrad(p, t, 0.44, 0.058 * lodFine);
  g += pwGrad(p * 0.29 + vec2(41.0, 13.0), t * 0.55, 0.5, 0.078 * lodWide);
  vec2 fd = normalize(vPwFlow + vec2(0.0001, 0.0));
  float fk = 1.15;
  float rl = river * lodFine;
  g += rl * fd * (fk * 0.09 * cos(dot(fd, p) * fk - t * 3.1))
     + rl * fd.yx * (2.2 * 0.03 * cos(dot(fd.yx, p) * 2.2 + t * 1.9));
  vec3 nrm = normalize(vec3(-g.x, 1.0, -g.y));

  vec3 R = reflect(-V, nrm);

  // body colour by depth, murkier on inland water
  float dz = clamp(depth / 22.0, 0.0, 1.0);
  vec3 body = mix(uShallow, uDeep, dz * dz * 0.62 + dz * 0.38);
  body = mix(body, uMurk, clamp(river * 0.55 + lake * 0.3, 0.0, 1.0));

  // fresnel sky reflection, deliberately capped: physically the grazing angles
  // go to a pure mirror, which washes the sea to flat sky-grey
  float fres = pow(1.0 - clamp(dot(nrm, V), 0.0, 1.0), 5.0);
  fres = 0.03 + 0.97 * fres;
  vec3 sky = mix(uSkyLo, uSkyHi, pow(clamp(R.y, 0.0, 1.0), 0.6));
  vec3 col = mix(body, sky, clamp(fres, 0.0, 1.0) * 0.66);

  // sun glint: a tight specular and a broad sheen
  vec3 Hv = normalize(uSun + V);
  float nh = max(dot(nrm, Hv), 0.0);
  float glint = pow(nh, 170.0) * 1.7 + pow(nh, 22.0) * 0.15;
  col += uSunCol * glint;

  // Shore foam, depth driven: a soft rim plus a swash band that breathes.
  // The ramp is deliberately tight (about a metre of depth) — a wider one turns
  // any shallow lake into a solid sheet of white.
  float shore = 1.0 - clamp(depth / 1.15, 0.0, 1.0);
  float wob = 0.5 + 0.5 * sin(p.x * 0.21 + p.y * 0.17 + t * 1.25 + g.x * 26.0);
  float foam = smoothstep(0.46, 1.0, shore * (0.70 + 0.44 * wob));
  foam += 0.40 * smoothstep(0.80, 1.0, shore);
  float swash = 0.5 + 0.5 * sin(t * 0.55 + p.x * 0.008 + p.y * 0.011);
  foam += 0.45 * smoothstep(0.26, 0.0, abs(depth - (0.16 + 0.5 * swash)));
  foam = clamp(foam, 0.0, 1.0) * (1.0 - 0.62 * river - 0.3 * lake);
  col = mix(col, uFoam, foam * 0.92);

  // the sea and the land agree about where the clouds are
  col *= mix(1.0, pwCloud(p), 0.55);

  float alpha = mix(0.62, 0.97, clamp(depth / 3.2, 0.0, 1.0));
  alpha = max(alpha, foam * 0.95);
  alpha *= smoothstep(-0.55, 0.05, depth);

  // exponential fog, matched to three's FogExp2
  float fogF = 1.0 - exp(-uFog.w * uFog.w * vPwFog * vPwFog);
  col = mix(col, uFog.rgb, clamp(fogF, 0.0, 1.0));

  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: vert, fragmentShader: frag,
    transparent: true, depthWrite: true, depthTest: true,
    side: THREE.FrontSide, fog: false,
  });
  mat.name = 'pw-water';

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'water';
  mesh.renderOrder = 1;
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();

  return {
    mesh,
    update(dt, env) {
      if (env && env.fogDensity) shared.uFog.value.w = env.fogDensity;
    },
  };
}

// ===========================================================================
// geometry merge / weld — small, local, so this module needs no addons
// ===========================================================================

/**
 * Index and dedupe. three's polyhedra are non-indexed (60 verts for 20 tris),
 * which is 5x the vertex shading work for an instanced boulder. Everything that
 * uses these is flat-shaded, so welding costs nothing visually — but normals are
 * averaged anyway in case a caller turns flat shading off.
 */
function weld(THREE, geo) {
  const pa = geo.attributes.position;
  const na = geo.attributes.normal;
  const ca = geo.attributes.color;
  const fa = geo.attributes.aPwFlex;
  const src = geo.index;
  const nSrc = src ? src.count : pa.count;
  const map = new Map();
  const pos = [], nor = [], col = [], flx = [];
  const idx = new Uint32Array(nSrc);
  const Q = 1e4;
  for (let k = 0; k < nSrc; k++) {
    const i = src ? src.getX(k) : k;
    const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
    let key = Math.round(x * Q) + '|' + Math.round(y * Q) + '|' + Math.round(z * Q);
    if (ca) key += '|' + Math.round(ca.getX(i) * 255) + ',' + Math.round(ca.getY(i) * 255) + ',' + Math.round(ca.getZ(i) * 255);
    if (fa) key += '|' + Math.round(fa.getX(i) * 255);
    let at = map.get(key);
    if (at === undefined) {
      at = pos.length / 3;
      map.set(key, at);
      pos.push(x, y, z);
      if (na) nor.push(na.getX(i), na.getY(i), na.getZ(i));
      if (ca) col.push(ca.getX(i), ca.getY(i), ca.getZ(i));
      if (fa) flx.push(fa.getX(i));
    } else if (na) {
      nor[at * 3] += na.getX(i); nor[at * 3 + 1] += na.getY(i); nor[at * 3 + 2] += na.getZ(i);
    }
    idx[k] = at;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (na) {
    for (let i = 0; i < nor.length; i += 3) {
      const l = Math.hypot(nor[i], nor[i + 1], nor[i + 2]) || 1;
      nor[i] /= l; nor[i + 1] /= l; nor[i + 2] /= l;
    }
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  }
  if (ca) out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  if (fa) out.setAttribute('aPwFlex', new THREE.Float32BufferAttribute(flx, 1));
  out.setIndex(pos.length / 3 > 65535
    ? new THREE.BufferAttribute(idx, 1)
    : new THREE.BufferAttribute(new Uint16Array(idx), 1));
  out.computeBoundingSphere();
  out.name = geo.name;
  geo.dispose();
  return out;
}

function mergeParts(THREE, parts, treeH, toOut) {
  let vc = 0, ic = 0;
  for (const p of parts) {
    const g = p.geo;
    vc += g.attributes.position.count;
    ic += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(vc * 3);
  const nor = new Float32Array(vc * 3);
  const col = new Float32Array(vc * 3);
  const flex = new Float32Array(vc);
  const idx = vc > 65535 ? new Uint32Array(ic) : new Uint16Array(ic);
  const v = new THREE.Vector3();
  const nm = new THREE.Matrix3();
  let vo = 0, io = 0;

  for (const p of parts) {
    const g = p.geo;
    const m = p.matrix || new THREE.Matrix4();
    nm.getNormalMatrix(m);
    const pa = g.attributes.position, na = g.attributes.normal;
    const n = pa.count;
    const c = p.color;
    const lr = toOut(c[0]), lg = toOut(c[1]), lb = toOut(c[2]);
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pa, i).applyMatrix4(m);
      pos[(vo + i) * 3] = v.x; pos[(vo + i) * 3 + 1] = v.y; pos[(vo + i) * 3 + 2] = v.z;
      const fy = (v.y - (p.flexFrom || 0)) / Math.max(0.001, treeH - (p.flexFrom || 0));
      flex[vo + i] = clamp(fy, 0, 1) * (p.flexMul == null ? 1 : p.flexMul);
      if (na) {
        v.fromBufferAttribute(na, i).applyMatrix3(nm).normalize();
        nor[(vo + i) * 3] = v.x; nor[(vo + i) * 3 + 1] = v.y; nor[(vo + i) * 3 + 2] = v.z;
      } else {
        nor[(vo + i) * 3 + 1] = 1;
      }
      col[(vo + i) * 3] = lr; col[(vo + i) * 3 + 1] = lg; col[(vo + i) * 3 + 2] = lb;
    }
    if (g.index) {
      const ia = g.index;
      for (let i = 0; i < ia.count; i++) idx[io + i] = ia.getX(i) + vo;
      io += ia.count;
    } else {
      for (let i = 0; i < n; i++) idx[io + i] = vo + i;
      io += n;
    }
    vo += n;
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setAttribute('aPwFlex', new THREE.BufferAttribute(flex, 1));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  for (const p of parts) p.geo.dispose();
  return weld(THREE, out);
}

const M4 = (THREE, x, y, z, sx, sy, sz) => new THREE.Matrix4().compose(
  new THREE.Vector3(x, y, z), new THREE.Quaternion(),
  new THREE.Vector3(sx == null ? 1 : sx, sy == null ? 1 : sy, sz == null ? 1 : sz));

function coniferGeo(THREE, toOut) {
  const bark = hexRgb(PAL.darkTimber);
  const can = hexRgb(PAL.canopy);
  const canDk = mix3([0, 0, 0], hexRgb(PAL.canopy), hexRgb(PAL.darkCanopy), 0.55);
  const parts = [
    { geo: new THREE.CylinderGeometry(0.26, 0.44, 3.4, 5, 1, true), matrix: M4(THREE, 0, 1.7, 0), color: bark, flexMul: 0.5 },
    { geo: new THREE.ConeGeometry(2.45, 5.4, 6, 1, true), matrix: M4(THREE, 0, 4.7, 0), color: canDk },
    { geo: new THREE.ConeGeometry(1.90, 4.6, 6, 1, true), matrix: M4(THREE, 0, 7.5, 0), color: can },
    { geo: new THREE.ConeGeometry(1.28, 4.3, 6, 1, true), matrix: M4(THREE, 0, 10.3, 0), color: can },
  ];
  return mergeParts(THREE, parts, 12.4, toOut);
}

function broadleafGeo(THREE, toOut) {
  const bark = hexRgb(PAL.timber);
  const can = hexRgb(PAL.canopy);
  const canHi = mix3([0, 0, 0], hexRgb(PAL.canopy), hexRgb(PAL.downsHi), 0.3);
  const parts = [
    { geo: new THREE.CylinderGeometry(0.30, 0.52, 4.2, 5, 1, true), matrix: M4(THREE, 0, 2.1, 0), color: bark, flexMul: 0.45 },
    { geo: new THREE.IcosahedronGeometry(2.9, 0), matrix: M4(THREE, 0, 6.7, 0, 1.06, 0.84, 1.06), color: can },
    { geo: new THREE.OctahedronGeometry(1.85, 0), matrix: M4(THREE, 1.5, 5.1, 0.7, 1.05, 0.9, 1.05), color: canHi },
  ];
  return mergeParts(THREE, parts, 10.4, toOut);
}

function sparGeo(THREE, toOut) {
  const dead = mix3([0, 0, 0], hexRgb(PAL.darkTimber), hexRgb(PAL.ash), 0.55);
  const b1 = new THREE.CylinderGeometry(0.05, 0.13, 2.7, 3, 1, true);
  b1.rotateZ(0.85); b1.translate(0.95, 5.6, 0.2);
  const b2 = new THREE.CylinderGeometry(0.05, 0.12, 2.3, 3, 1, true);
  b2.rotateX(-0.95); b2.translate(-0.25, 4.4, 0.9);
  const parts = [
    { geo: new THREE.CylinderGeometry(0.10, 0.40, 7.8, 4, 1, true), matrix: M4(THREE, 0, 3.9, 0), color: dead, flexMul: 0.8 },
    { geo: b1, color: dead },
    { geo: b2, color: dead },
  ];
  return mergeParts(THREE, parts, 7.8, toOut);
}

// ===========================================================================
// FOREST
// Density from moist + biome + region. Instances are held in a coarse bucket
// grid so setForestDamage() only touches the trees near the point; felling
// swaps the instance to the tail of the buffer and drops mesh.count, so a
// felled wood really does stop being drawn.
// ===========================================================================
function buildForest(THREE, world, shared, patchStandard, ctx) {
  const { W, H, CELL, X0, Z0, seed, budget, shadows, toOut } = ctx;
  const rng = makeRng(seed + ':forest');
  const jit = makeNoise(seed + ':clump');
  const height = world.height, water = world.water, biome = world.biome;
  const region = world.region, moist = world.moist, slope = world.slope;
  const N = W * H;

  // ---- per-cell density and species
  const dens = new Float32Array(N);
  const spec = new Uint8Array(N);   // 0 conifer, 1 broadleaf, 2 spar
  let total = 0;
  for (let cy = 0; cy < H; cy++) {
    for (let cx = 0; cx < W; cx++) {
      const i = cy * W + cx;
      const b = biome[i], rg = region[i], h = height[i];
      const sl = slope ? slope[i] : 0, mo = moist ? moist[i] : 0.5;
      if (water[i] > 1 || h < 1.1 || sl > 1.35) continue;
      if (b === B_OCEAN || b === B_BEACH) continue;

      let p = 0, sp = 0;
      // A closed canopy reads as a wood from the default camera but as a heap of
      // green crystals up close, so the wood biomes are deliberately kept below
      // full coverage and some of the budget is spent on hedgerow scatter.
      if (b === B_FOREST) p = 0.34 + 0.34 * mo;
      else if (b === B_DARKWOOD) p = 0.62;
      else if (b === B_DOWNS) p = 0.055 + 0.17 * mo;
      else if (b === B_FARM) p = 0.03;
      else if (b === B_MOOR) p = 0.05;
      else if (b === B_MARSH) p = 0.12;
      else if (b === B_ROCK) p = 0.085 * (1 - smoothstep(46, 66, h));
      else if (b === B_SNOW) p = 0.02 * (1 - smoothstep(60, 80, h));
      else if (b === B_ASH) p = 0.16;
      else if (b === B_SLAG) p = 0.05;

      // clumping: woods have glades, downs have copses
      const cl = jit.fbm((X0 + cx * CELL) * 0.021, (Z0 + cy * CELL) * 0.021, 3);
      p *= clamp(0.55 + 1.15 * (0.5 + 0.5 * cl), 0, 1.6);

      // species
      if (b === B_ASH || b === B_SLAG || rg === R_ASHENREACH) sp = 2;
      else if (rg === R_MIRKHOLT || rg === R_FROSTMARCH || rg === R_PEAKS) sp = 0;
      else if (rg === R_ELDERWOOD || rg === R_GREENHOLLOW || rg === R_MARCHLANDS) sp = 1;
      else sp = h > 30 || cy < H * 0.34 ? 0 : 1;
      if (h > 42 && sp === 1) sp = 0;
      if (b === B_MARSH && sp === 0) sp = 1;

      dens[i] = p;
      spec[i] = sp;
      total += p;
    }
  }

  // ---- distribute the instance budget
  const scale = total > 0 ? budget / total : 0;
  const S = [[], [], []];     // per species: flat [x,y,z,s,hMul,rot,tr,tg,tb]
  for (let cy = 0; cy < H; cy++) {
    for (let cx = 0; cx < W; cx++) {
      const i = cy * W + cx;
      if (dens[i] <= 0) continue;
      const expect = dens[i] * scale;
      let n = Math.floor(expect);
      if (rng() < expect - n) n++;
      if (n > 3) n = 3;
      const rg = region[i], b = biome[i], sp = spec[i];
      for (let k = 0; k < n; k++) {
        const x = X0 + (cx + rng()) * CELL;
        const z = Z0 + (cy + rng()) * CELL;
        const y = world.heightAt ? world.heightAt(x, z) : height[i];
        if (y < 1.0) continue;
        let s = 0.60 + rng() * rng() * 1.05;      // skewed: many small, few big
        let hMul = 0.82 + rng() * 0.5;
        // Mirkholt: taller, thinner, darker. Frostmarch: stunted.
        if (rg === R_MIRKHOLT) { s *= 0.9; hMul *= 1.45; }
        if (rg === R_FROSTMARCH || b === B_SNOW) { s *= 0.78; hMul *= 0.8; }
        if (b === B_ROCK) { s *= 0.82; hMul *= 0.9; }
        if (b === B_MARSH) { s *= 0.8; hMul *= 0.85; }

        // tint is a multiplier around 1, so it stays in the material's space
        const warm = rng() - 0.5, dark = rng() - 0.5;
        let tr = 1 + warm * 0.34 + dark * 0.22;
        let tg = 1 + dark * 0.22 + warm * 0.09;
        let tb = 1 - warm * 0.26 + dark * 0.2;
        if (rg === R_MIRKHOLT) { tr *= 0.52; tg *= 0.62; tb *= 0.66; }
        if (rg === R_ELDERWOOD) { tr *= 0.98; tg *= 1.1; tb *= 1.0; }
        if (b === B_DARKWOOD) { tr *= 0.7; tg *= 0.8; tb *= 0.78; }
        if (rg === R_ASHENREACH) { tr *= 0.8; tg *= 0.78; tb *= 0.82; }

        S[sp].push(x, y - 0.2, z, s, hMul, rng() * Math.PI * 2,
          clamp(tr, 0.1, 1.6), clamp(tg, 0.1, 1.6), clamp(tb, 0.1, 1.6));
      }
    }
  }

  const geos = [
    coniferGeo(THREE, toOut),
    broadleafGeo(THREE, toOut),
    sparGeo(THREE, toOut),
  ];
  const names = ['conifer', 'broadleaf', 'spar'];

  const meshes = [];
  const disposables = [];
  const species = [];
  const BUCKET = 40;
  const bw = Math.ceil((W * CELL + 4) / BUCKET), bh = Math.ceil((H * CELL + 4) / BUCKET);

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, flatShading: true, roughness: 0.82, metalness: 0.0,
    side: THREE.FrontSide,
  });
  patchStandard(mat, { wind: true, cloud: true, key: 'tree' });
  disposables.push(mat);
  const depthMat = makeSwayDepthMaterial(THREE, shared, 'tree');
  disposables.push(depthMat);

  const mtx = new THREE.Matrix4();
  const col = new THREE.Color();
  let totalInst = 0;

  for (let s = 0; s < 3; s++) {
    const arr = S[s];
    const n = arr.length / 9;
    disposables.push(geos[s]);
    if (n === 0) { species.push(null); continue; }

    const mesh = new THREE.InstancedMesh(geos[s], mat, n);
    mesh.name = 'trees-' + names[s];
    mesh.castShadow = shadows;
    mesh.receiveShadow = shadows;
    mesh.frustumCulled = false;         // one bound over the whole map anyway
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    if (shadows) mesh.customDepthMaterial = depthMat;

    const phase = new Float32Array(n);
    const rot = new Float32Array(n);
    const px = new Float32Array(n), pz = new Float32Array(n), psc = new Float32Array(n);
    const phm = new Float32Array(n);
    const buckets = new Array(bw * bh);

    for (let i = 0; i < n; i++) {
      const o = i * 9;
      const x = arr[o], y = arr[o + 1], z = arr[o + 2];
      const sc = arr[o + 3], hM = arr[o + 4], rt = arr[o + 5];
      mtx.makeScale(sc, sc * hM, sc);
      mtx.setPosition(x, y, z);
      mesh.setMatrixAt(i, mtx);
      col.setRGB(arr[o + 6], arr[o + 7], arr[o + 8]);
      mesh.setColorAt(i, col);
      // phase from position so a gust travels across the wood, not per-tree noise
      phase[i] = (x * 0.05 + z * 0.037) % 6.283;
      rot[i] = rt;
      px[i] = x; pz[i] = z; psc[i] = sc; phm[i] = hM;
      const bx = Math.min(bw - 1, Math.max(0, Math.floor((x - X0) / BUCKET)));
      const bz = Math.min(bh - 1, Math.max(0, Math.floor((z - Z0) / BUCKET)));
      const bi = bz * bw + bx;
      (buckets[bi] || (buckets[bi] = [])).push(i);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    // Per-instance attributes are indexed by *slot*, not by instance id, so
    // felling has to swap these alongside the matrix or surviving trees pop to
    // a new orientation.
    const aPhase = new THREE.InstancedBufferAttribute(phase, 1);
    const aRot = new THREE.InstancedBufferAttribute(rot, 1);
    geos[s].setAttribute('aPwPhase', aPhase);
    geos[s].setAttribute('aPwRot', aRot);

    const slotOf = new Int32Array(n), idAt = new Int32Array(n);
    for (let i = 0; i < n; i++) { slotOf[i] = i; idAt[i] = i; }

    species.push({
      mesh, n, count: n, slotOf, idAt, px, pz, psc, phm, buckets, bw, bh,
      aPhase, aRot, shrunk: new Uint8Array(n),
    });
    meshes.push(mesh);
    totalInst += n;
  }

  // ---- felling ------------------------------------------------------------
  const dmgMtx = new THREE.Matrix4();

  function setForestDamage(cx, cy, radius) {
    let wx, wz;
    if (world.toWorld) { const p = world.toWorld(cx, cy); wx = p.x; wz = p.z; }
    else { wx = X0 + (cx + 0.5) * CELL; wz = Z0 + (cy + 0.5) * CELL; }
    const r = Math.max(1, radius || 0);
    const r2 = r * r, rIn2 = (r * 0.72) * (r * 0.72);
    let felled = 0;

    for (const sp of species) {
      if (!sp) continue;
      const b0x = Math.max(0, Math.floor((wx - r - X0) / BUCKET));
      const b1x = Math.min(sp.bw - 1, Math.floor((wx + r - X0) / BUCKET));
      const b0z = Math.max(0, Math.floor((wz - r - Z0) / BUCKET));
      const b1z = Math.min(sp.bh - 1, Math.floor((wz + r - Z0) / BUCKET));
      let lo = 1e9, hi = -1e9, touched = false;

      for (let bz = b0z; bz <= b1z; bz++) {
        for (let bx = b0x; bx <= b1x; bx++) {
          const list = sp.buckets[bz * sp.bw + bx];
          if (!list) continue;
          for (let q = 0; q < list.length; q++) {
            const id = list[q];
            if (sp.slotOf[id] < 0) continue;
            const dx = sp.px[id] - wx, dz = sp.pz[id] - wz;
            const d2 = dx * dx + dz * dz;
            if (d2 > r2) continue;
            if (d2 <= rIn2) {
              // remove: swap the tail instance into this slot, shrink count
              const slot = sp.slotOf[id];
              const last = sp.count - 1;
              const im = sp.mesh.instanceMatrix.array;
              if (slot !== last) {
                for (let k = 0; k < 16; k++) im[slot * 16 + k] = im[last * 16 + k];
                const ic = sp.mesh.instanceColor;
                if (ic) for (let k = 0; k < 3; k++) ic.array[slot * 3 + k] = ic.array[last * 3 + k];
                sp.aPhase.array[slot] = sp.aPhase.array[last];
                sp.aRot.array[slot] = sp.aRot.array[last];
                sp.aPhase.needsUpdate = true;
                sp.aRot.needsUpdate = true;
                const moved = sp.idAt[last];
                sp.idAt[slot] = moved;
                sp.slotOf[moved] = slot;
              }
              sp.idAt[last] = -1;
              sp.slotOf[id] = -1;
              sp.count = last;
              sp.mesh.count = last;
              lo = Math.min(lo, slot); hi = Math.max(hi, slot);
              touched = true;
              felled++;
            } else if (!sp.shrunk[id]) {
              // edge of the cut: leave it standing but thinned
              const slot = sp.slotOf[id];
              const s2 = sp.psc[id] * 0.55;
              dmgMtx.makeScale(s2, s2 * sp.phm[id], s2);
              dmgMtx.setPosition(sp.px[id], 0, sp.pz[id]);
              const im = sp.mesh.instanceMatrix.array;
              // keep the original y from the buffer
              dmgMtx.elements[13] = im[slot * 16 + 13];
              dmgMtx.toArray(im, slot * 16);
              sp.shrunk[id] = 1;
              lo = Math.min(lo, slot); hi = Math.max(hi, slot);
              touched = true;
            }
          }
        }
      }
      if (touched) {
        const im = sp.mesh.instanceMatrix;
        if (im.addUpdateRange && im.updateRanges) {
          im.addUpdateRange(lo * 16, (hi - lo + 1) * 16);
        }
        im.needsUpdate = true;
        if (sp.mesh.instanceColor) sp.mesh.instanceColor.needsUpdate = true;
      }
    }
    return felled;
  }

  return {
    meshes, disposables, setForestDamage, total: totalInst,
    liveCount: () => species.reduce((a, s) => a + (s ? s.count : 0), 0),
  };
}

// ===========================================================================
// ROCKS + OUTCROPS
// ===========================================================================
function boulderGeo(THREE, seed, toOut, tint) {
  const n = makeNoise(seed);
  const g = new THREE.IcosahedronGeometry(1, 0);
  const pa = g.attributes.position;
  const rock = hexRgb(PAL.rock), scree = hexRgb(PAL.scree), cliff = hexRgb(PAL.cliff);
  const cols = new Float32Array(pa.count * 3);
  const c = [0, 0, 0];
  for (let i = 0; i < pa.count; i++) {
    let x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
    // displacement is a pure function of position, so the shared corners of a
    // non-indexed icosahedron stay welded
    const d = 1 + 0.30 * n.fbm(x * 1.7, z * 1.7, 2) + 0.18 * n.noise2(y * 2.3, x * 2.3);
    x *= d; y *= d * 0.82; z *= d;
    pa.setXYZ(i, x, y, z);
    const up = clamp(y * 0.5 + 0.5, 0, 1);
    mix3(c, cliff, rock, up);
    mix3(c, c, scree, 0.35 * (0.5 + 0.5 * n.noise2(x * 3.1, z * 3.1)));
    const g2 = 1 + 0.06 * n.noise2(x * 6.0, z * 6.0);
    cols[i * 3] = toOut(clamp(c[0] * g2 * tint, 0, 1));
    cols[i * 3 + 1] = toOut(clamp(c[1] * g2 * tint, 0, 1));
    cols[i * 3 + 2] = toOut(clamp(c[2] * g2 * tint, 0, 1));
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.deleteAttribute('uv');
  const w = weld(THREE, g);
  w.computeVertexNormals();
  return w;
}

function buildStone(THREE, world, patchStandard, ctx) {
  const { W, H, CELL, X0, Z0, seed, budget, shadows, toOut } = ctx;
  const rng = makeRng(seed + ':stone');
  const height = world.height, water = world.water, biome = world.biome;
  const slope = world.slope, region = world.region;
  const meshes = [], disposables = [];

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, flatShading: true, roughness: 0.9, metalness: 0.0,
  });
  patchStandard(mat, { cloud: true, key: 'stone' });
  disposables.push(mat);

  // ---- weighted candidate cells
  const cand = [];
  let wsum = 0;
  for (let cy = 0; cy < H; cy++) {
    for (let cx = 0; cx < W; cx++) {
      const i = cy * W + cx;
      if (water[i] > 0) continue;
      const h = height[i], b = biome[i];
      const sl = slope ? slope[i] : 0;
      if (h < 0.5) continue;
      let w = 0;
      w += smoothstep(0.42, 1.2, sl) * 1.0;
      w += smoothstep(38, 78, h) * 0.75;
      if (b === B_ROCK) w += 0.5;
      if (b === B_SNOW) w += 0.15;
      if (b === B_SLAG) w += 0.35;
      if (b === B_ASH) w += 0.15;
      if (b === B_MOOR) w += 0.08;
      if (b === B_BEACH) w += 0.05;
      if (w <= 0.001) continue;
      cand.push(i, w);
      wsum += w;
    }
  }

  const nRock = Math.min(budget, Math.floor(cand.length / 2));
  const geoR = boulderGeo(THREE, seed + ':rock', toOut, 1.0);
  disposables.push(geoR);
  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const eul = new THREE.Euler();
  const vS = new THREE.Vector3(), vP = new THREE.Vector3();
  const col = new THREE.Color();

  let placed = 0;
  if (nRock > 0 && wsum > 0) {
    const mesh = new THREE.InstancedMesh(geoR, mat, nRock);
    mesh.name = 'rocks';
    mesh.castShadow = shadows;
    mesh.receiveShadow = shadows;
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    // stride the candidate list so placement is spread, not front-loaded
    const step = wsum / nRock;
    let acc = rng() * step;
    for (let ci = 0; ci < cand.length && placed < nRock; ci += 2) {
      acc += cand[ci + 1];
      while (acc >= step && placed < nRock) {
        acc -= step;
        const i = cand[ci];
        const cx = i % W, cy = (i - cx) / W;
        const x = X0 + (cx + rng()) * CELL, z = Z0 + (cy + rng()) * CELL;
        const y = world.heightAt ? world.heightAt(x, z) : height[i];
        const s = 0.55 + rng() * rng() * 2.6;
        eul.set(rng() * 0.7 - 0.35, rng() * 6.283, rng() * 0.7 - 0.35);
        q.setFromEuler(eul);
        vS.set(s * (0.8 + rng() * 0.5), s * (0.45 + rng() * 0.55), s * (0.8 + rng() * 0.5));
        vP.set(x, y - s * 0.22, z);
        mtx.compose(vP, q, vS);
        mesh.setMatrixAt(placed, mtx);
        const t = 0.86 + rng() * 0.3;
        // pale granite boulders on a black ash hill read as litter, so stone in
        // the Ashenreach is knocked well down and cooled
        const ashy = biome[i] === B_SLAG || biome[i] === B_ASH;
        const k = ashy ? 0.5 : 1.0;
        col.setRGB(t * k, t * k * (ashy ? 1.02 : 0.99), t * k * (ashy ? 1.18 : 1.04));
        mesh.setColorAt(placed, col);
        placed++;
      }
    }
    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    meshes.push(mesh);
  }

  // ---- a few dramatic outcrops on the high ridges, merged into one mesh
  const parts = [];
  const ridges = [];
  for (let cy = 2; cy < H - 2; cy += 3) {
    for (let cx = 2; cx < W - 2; cx += 3) {
      const i = cy * W + cx;
      if (water[i] > 0) continue;
      const h = height[i];
      const sl = slope ? slope[i] : 0;
      if (h > 30 && sl > 0.35 && sl < 1.1) ridges.push(i);
      else if (biome[i] === B_ROCK && sl > 0.3) ridges.push(i);
    }
  }
  const nOut = Math.min(46, ridges.length);
  for (let k = 0; k < nOut && ridges.length; k++) {
    const pick = ridges[Math.floor(rng() * ridges.length)];
    const cx = pick % W, cy = (pick - cx) / W;
    const bx = X0 + (cx + 0.5) * CELL, bz = Z0 + (cy + 0.5) * CELL;
    const by = world.heightAt ? world.heightAt(bx, bz) : height[pick];
    const lumps = 3 + Math.floor(rng() * 4);
    const ashy = biome[pick] === B_ASH || biome[pick] === B_SLAG;
    for (let j = 0; j < lumps; j++) {
      const r = 2.6 + rng() * 6.4;
      const ox = (rng() - 0.5) * 9, oz = (rng() - 0.5) * 9;
      const oy = by + r * (0.10 + rng() * 0.22) - 2.2 - Math.hypot(ox, oz) * 0.16;
      eul.set(rng() * 0.9 - 0.45, rng() * 6.283, rng() * 0.9 - 0.45);
      q.setFromEuler(eul);
      vS.set(r * (0.8 + rng() * 0.6), r * (0.7 + rng() * 0.9), r * (0.8 + rng() * 0.6));
      vP.set(bx + ox, oy, bz + oz);
      const oc = mix3([0, 0, 0], hexRgb(PAL.rock), hexRgb(PAL.cliff), 0.45 + rng() * 0.45);
      if (ashy) mix3(oc, oc, hexRgb(PAL.slag), 0.62);
      parts.push({
        geo: new THREE.IcosahedronGeometry(1, 0),
        matrix: new THREE.Matrix4().compose(vP, q, vS),
        color: oc,
      });
    }
  }
  if (parts.length) {
    const geoO = mergeParts(THREE, parts, 1, toOut);
    geoO.computeVertexNormals();
    geoO.name = 'pw-outcrops';
    const meshO = new THREE.Mesh(geoO, mat);
    meshO.name = 'outcrops';
    meshO.castShadow = shadows;
    meshO.receiveShadow = shadows;
    meshO.matrixAutoUpdate = false;
    meshO.updateMatrix();
    meshes.push(meshO);
    disposables.push(geoO);
  }

  return { meshes, disposables, total: placed };
}

// ===========================================================================
// ASH HAZE — falling particulate over the ASH/SLAG region only
// ===========================================================================
function buildHaze(THREE, world, shared, ctx) {
  const { W, H, CELL, X0, Z0, seed, count, toOut } = ctx;
  const rng = makeRng(seed + ':haze');
  const biome = world.biome, region = world.region, height = world.height;

  const cells = [];
  for (let i = 0; i < W * H; i++) {
    if (biome[i] === B_ASH || biome[i] === B_SLAG ||
      (region && region[i] === R_ASHENREACH)) cells.push(i);
  }
  if (cells.length < 8) return null;

  const n = Math.min(count, cells.length * 2);
  const pos = new Float32Array(n * 3);
  const siz = new Float32Array(n);
  const sd = new Float32Array(n);
  const hot = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const i = cells[Math.floor(rng() * cells.length)];
    const cx = i % W, cy = (i - cx) / W;
    const x = X0 + (cx + rng()) * CELL, z = Z0 + (cy + rng()) * CELL;
    const y = (world.heightAt ? world.heightAt(x, z) : height[i]);
    pos[k * 3] = x; pos[k * 3 + 1] = Math.max(0, y); pos[k * 3 + 2] = z;
    siz[k] = 1.4 + rng() * 3.4;
    sd[k] = rng();
    hot[k] = biome[i] === B_SLAG ? rng() * 0.8 : rng() * 0.2;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(siz, 1));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
  geo.setAttribute('aHot', new THREE.BufferAttribute(hot, 1));
  geo.computeBoundingSphere();
  if (geo.boundingSphere) geo.boundingSphere.radius += 40;
  geo.name = 'pw-haze';

  const lin = (hex) => { const c = hexRgb(hex); return new THREE.Vector3(toOut(c[0]), toOut(c[1]), toOut(c[2])); };

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: shared.uTime,
      uWind: shared.uWind,
      uAsh: shared.uAsh,
      uFog: shared.uFog,
      uAshCol: { value: lin(0x8a8894) },
      uEmber: { value: lin(PAL.ember) },
    },
    vertexShader: `
attribute float aSize;
attribute float aSeed;
attribute float aHot;
uniform float uTime;
uniform vec3 uWind;
uniform float uAsh;
varying float vPwFade;
varying float vPwHot;
varying float vPwFog;
void main() {
  vec3 p = position;
  float span = 26.0 + aSeed * 14.0;
  float fall = mod(uTime * (1.6 + aSeed * 1.9) + aSeed * 97.0, span);
  p.y += span - fall + 1.5;
  float sway = sin(uTime * 0.7 + aSeed * 31.0) * (3.0 + 5.0 * uWind.z);
  p.x += uWind.x * sway + sin(uTime * 0.43 + aSeed * 12.0) * 2.5;
  p.z += uWind.y * sway + cos(uTime * 0.39 + aSeed * 19.0) * 2.5;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vPwFog = -mv.z;
  vPwHot = aHot;
  // fade in at the top of the fall and out at the bottom
  float f = smoothstep(0.0, 0.22, fall / span) * (1.0 - smoothstep(0.7, 1.0, fall / span));
  vPwFade = f * uAsh;
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSize * (1.0 + 0.7 * uAsh) * 260.0 / max(1.0, -mv.z), 1.0, 30.0);
}`,
    fragmentShader: `
uniform vec3 uAshCol;
uniform vec3 uEmber;
uniform vec4 uFog;
varying float vPwFade;
varying float vPwHot;
varying float vPwFog;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = dot(d, d) * 4.0;
  float a = (1.0 - clamp(r, 0.0, 1.0));
  a *= a * 0.19 * vPwFade;
  if (a < 0.004) discard;
  vec3 col = mix(uAshCol, uEmber, vPwHot * 0.55);
  float fogF = 1.0 - exp(-uFog.w * uFog.w * vPwFog * vPwFog);
  col = mix(col, uFog.rgb, clamp(fogF, 0.0, 1.0));
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
    fog: false,
  });
  mat.name = 'pw-haze';

  const points = new THREE.Points(geo, mat);
  points.name = 'ash-haze';
  points.renderOrder = 3;
  points.visible = false;
  points.matrixAutoUpdate = false;
  points.updateMatrix();

  return {
    points,
    update(dt, env, ash) { points.visible = ash > 0.01; },
  };
}
