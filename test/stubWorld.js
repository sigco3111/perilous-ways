// -----------------------------------------------------------------------------
// Stub world for testing src/gfx/terrain.js standalone.
//
//   makeStubWorld(seed) -> world   (exactly the INTERFACES.md contract)
//
// Not worldgen. It fakes the *shape* of Eardon well enough to exercise every
// branch of the renderer: ocean on the west and south, snow in the north, the
// Sundering Peaks running north-south at x = +120 with two passes, rivers that
// actually descend to the sea, a lake, the Weeping Marsh in the south centre,
// and the Ashenreach over the eastern third with slag and Mount Wrack.
// -----------------------------------------------------------------------------

import { makeRng, makeNoise, clamp, lerp, smoothstep } from '../src/rng.js';

export const BIOME = {
  OCEAN: 0, BEACH: 1, DOWNS: 2, FARM: 3, FOREST: 4, DARKWOOD: 5,
  MARSH: 6, MOOR: 7, ROCK: 8, SNOW: 9, ASH: 10, SLAG: 11,
};
export const REGION = {
  GREENHOLLOW: 0, FROSTMARCH: 1, MIRKHOLT: 2, PEAKS: 3, WEEPING: 4,
  ASHENREACH: 5, MARCHLANDS: 6, ELDERWOOD: 7, QUAYS: 8, BARROWDOWNS: 9,
  WODENHOLT: 10,
};

const B = BIOME, R = REGION;

export function makeStubWorld(seed = 'eardon-1') {
  const W = 280, H = 190, CELL = 4;
  const worldW = W * CELL, worldH = H * CELL;      // 1120 x 760
  const X0 = -worldW / 2, Z0 = -worldH / 2;        // x in [-560,560], z in [-380,380]
  const N = W * H;

  const rng = makeRng(seed + ':stub');
  const n1 = makeNoise(seed + ':a');
  const n2 = makeNoise(seed + ':b');
  const n3 = makeNoise(seed + ':c');

  const height = new Float32Array(N);
  const water = new Uint8Array(N);
  const biome = new Uint8Array(N);
  const region = new Uint8Array(N);
  const peril = new Float32Array(N);
  const moist = new Float32Array(N);
  const slope = new Float32Array(N);

  const wx = (cx) => X0 + (cx + 0.5) * CELL;
  const wz = (cy) => Z0 + (cy + 0.5) * CELL;
  const ci = (cx, cy) => cy * W + cx;
  const cl = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  // the spine of the Sundering Peaks, wandering about x = +120
  const spineAt = (z) => 120 + 46 * Math.sin(z * 0.0065) + 30 * n2.fbm(z * 0.0016, 7.3, 2);
  const PASSES = [-150, 132];

  // -------------------------------------------------------------------------
  // 1. height
  // -------------------------------------------------------------------------
  for (let cy = 0; cy < H; cy++) {
    const z = wz(cy);
    const spine = spineAt(z);
    for (let cx = 0; cx < W; cx++) {
      const x = wx(cx);

      // --- coastline: sea to the west and to the south, wobbled
      const wob = n1.fbm(x * 0.0034, z * 0.0034, 3);
      const westL = (x - (-455 + 62 * wob)) / 78;
      const southL = ((296 + 52 * wob) - z) / 66;
      // a bite out of the south-west so the Grey Quays get an estuary
      const bay = 1.35 - Math.hypot((x + 470) / 150, (z - 210) / 130);
      const L = Math.min(westL, southL, bay > 0 ? -bay * 0.9 + 0.55 : 9);

      // --- rolling interior
      let h = 9
        + 20 * (0.5 + 0.5 * n1.fbm(x * 0.0021, z * 0.0021, 4))
        + 7 * n1.fbm(x * 0.011, z * 0.011, 3)
        + 2.2 * n3.fbm(x * 0.05, z * 0.05, 2);

      // --- the Peaks
      const dS = Math.abs(x - spine) / 96;
      let ridgeAmt = Math.exp(-dS * dS * 1.6);
      let pass = 1;
      for (const pz of PASSES) pass *= 1 - 0.66 * smoothstep(96, 0, Math.abs(z - pz));
      const rdg = n2.ridge(x * 0.0052, z * 0.0052, 4);
      h += ridgeAmt * pass * (46 + 52 * rdg * rdg);

      // --- the Frostmarch highlands in the far north
      const north = smoothstep(-244, -372, z);
      h += north * (30 + 22 * n2.fbm(x * 0.004, z * 0.004, 3));

      // --- the Ashenreach: a low, flat, blasted plain in the east
      const east = smoothstep(190, 275, x);
      h = lerp(h, 13 + 9 * n3.fbm(x * 0.006, z * 0.006, 3), east * 0.85);
      // Mount Wrack
      const dW = Math.hypot((x - 425) / 118, (z - 55) / 118);
      h += Math.max(0, 1 - dW) * 82 * (0.72 + 0.28 * n2.ridge(x * 0.02, z * 0.02, 2));
      // slag pits
      const pit = n3.fbm(x * 0.013 + 40, z * 0.013 - 12, 2);
      h -= east * Math.max(0, pit - 0.25) * 22;

      // --- the Weeping Marsh, south centre: flatten hard to a wet plain
      const dM = Math.hypot((x + 40) / 145, (z - 215) / 92);
      const marshT = smoothstep(1.05, 0.35, dM);
      h = lerp(h, 2.6 + 1.5 * n3.fbm(x * 0.03, z * 0.03, 2), marshT * 0.92);

      // --- sea floor: a shelf that falls away, floored so the water shader
      // --- keeps a usable depth range and the ground skirt stays below it
      if (L < 1) {
        const shelf = -3.5 - 18 * (1 - cl(L, -0.9, 1)) - 5 * (0.5 + 0.5 * n1.fbm(x * 0.006, z * 0.006, 2));
        h = lerp(shelf, h, smoothstep(0, 1, cl(L, 0, 1)));
      }
      if (L < 0) h = Math.min(h, -0.3 + L * 7);

      height[ci(cx, cy)] = clamp(h, -32, 96);
    }
  }

  // gentle smoothing pass so the surface is plausible to walk a railway over
  {
    const tmp = new Float32Array(height);
    for (let cy = 1; cy < H - 1; cy++) {
      for (let cx = 1; cx < W - 1; cx++) {
        const i = ci(cx, cy);
        height[i] = (tmp[i] * 4 + tmp[i - 1] + tmp[i + 1] + tmp[i - W] + tmp[i + W]) / 8;
      }
    }
  }

  // -------------------------------------------------------------------------
  // 2. rivers — steepest descent from a source, carving as they go
  // -------------------------------------------------------------------------
  // routing and the descent both read the pristine surface, so a river never
  // chases the channel it has just dug
  const h0 = new Float32Array(height);

  function carve(sx, sy, width, depth, tx, tz) {
    let cx = sx, cy = sy, dirx = 0, diry = 0;
    let lvl = h0[ci(cx, cy)];
    for (let step = 0; step < 1200; step++) {
      const i = ci(cx, cy);
      lvl = Math.min(lvl, h0[i]) - 0.014;    // a gentle mandatory gradient
      if (lvl < 0.2 || water[i] === 3) break;   // reached the sea
      // carve a channel: bed sits `depth` below the water surface at the
      // thalweg and rises to the surface at the banks
      const w = Math.ceil(width);
      for (let dy = -w; dy <= w; dy++) {
        for (let dx = -w; dx <= w; dx++) {
          const x = cx + dx, y = cy + dy;
          if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
          const d = Math.hypot(dx, dy);
          if (d > width) continue;
          const j = ci(x, y);
          const bed = lvl - depth * (1 - d / (width + 0.7));
          if (height[j] > bed) height[j] = bed;
          if (d <= width * 0.62) water[j] = 1;
        }
      }
      // Step downhill, with momentum so it does not zigzag and a standing bias
      // toward the sea it is heading for. Because `lvl` only ever falls, the
      // channel stays monotonic even where it has to cut a saddle — a river in
      // a small gorge, which is what these look like anyway.
      let best = -1, bestScore = 1e9, bx = 0, by = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const x = cx + dx, y = cy + dy;
          if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) continue;
          const j = ci(x, y);
          const inv = 1 / Math.hypot(dx, dy);
          const score = h0[j]
            - (dx * dirx + dy * diry) * 1.2
            - (dx * inv * tx + dy * inv * tz) * 2.2
            + rng() * 0.3;
          if (score < bestScore) { bestScore = score; best = j; bx = dx; by = dy; }
        }
      }
      if (best < 0) break;
      dirx = bx; diry = by;
      cx += bx; cy += by;
      if (cx < 2 || cy < 2 || cx > W - 3 || cy > H - 3) break;
    }
  }

  // watercourses off the western flank of the Peaks, one off the north
  carve(158, 92, 2.1, 3.0, -1, 0.06);    // the trunk river, peaks -> west sea
  carve(150, 44, 1.4, 2.4, -0.86, 0.5);  // northern tributary, joins it
  carve(166, 136, 1.5, 2.6, -0.5, 0.87); // south-west into the Weeping Marsh
  carve(100, 22, 1.2, 2.2, -0.6, 0.8);   // out of the Frostmarch to the Quays

  // a proper lake: flood the low 45% of a disc, so the shore follows the
  // contour it finds instead of stamping a circle
  function lake(lcx, lcy, lr) {
    const hs = [];
    for (let dy = -lr; dy <= lr; dy++) for (let dx = -lr; dx <= lr; dx++) {
      if (Math.hypot(dx, dy) > lr) continue;
      hs.push(height[ci(lcx + dx, lcy + dy)]);
    }
    hs.sort((a, b) => a - b);
    const lvl = hs[Math.floor(hs.length * 0.45)];
    if (!(lvl > 1)) return;
    for (let dy = -lr; dy <= lr; dy++) for (let dx = -lr; dx <= lr; dx++) {
      const d = Math.hypot(dx, dy);
      if (d > lr) continue;
      const j = ci(lcx + dx, lcy + dy);
      if (height[j] >= lvl) continue;
      height[j] = Math.min(height[j], lvl - 0.6 - 2.6 * (1 - d / lr));
      water[j] = 2;
    }
  }
  lake(72, 58, 10);
  lake(198, 150, 7);

  // -------------------------------------------------------------------------
  // 3. sea, slope
  // -------------------------------------------------------------------------
  // one light pass so carving leaves no single-cell cliffs (a railway has to be
  // able to be surveyed over this)
  {
    const tmp = new Float32Array(height);
    for (let cy = 1; cy < H - 1; cy++) {
      for (let cx = 1; cx < W - 1; cx++) {
        const i = ci(cx, cy);
        height[i] = (tmp[i] * 8 + tmp[i - 1] + tmp[i + 1] + tmp[i - W] + tmp[i + W]) / 12;
      }
    }
  }
  for (let i = 0; i < N; i++) if (height[i] < 0) water[i] = 3;

  const hAt = (cx, cy) => height[cl(cy, 0, H - 1) * W + cl(cx, 0, W - 1)];
  for (let cy = 0; cy < H; cy++) {
    for (let cx = 0; cx < W; cx++) {
      const dx = (hAt(cx + 1, cy) - hAt(cx - 1, cy)) / (2 * CELL);
      const dz = (hAt(cx, cy + 1) - hAt(cx, cy - 1)) / (2 * CELL);
      slope[ci(cx, cy)] = Math.min(2.4, Math.hypot(dx, dz));
    }
  }

  // -------------------------------------------------------------------------
  // 4. regions
  // -------------------------------------------------------------------------
  for (let cy = 0; cy < H; cy++) {
    const z = wz(cy);
    const spine = spineAt(z);
    for (let cx = 0; cx < W; cx++) {
      const x = wx(cx), i = ci(cx, cy), h = height[i];
      const jag = 26 * n2.fbm(x * 0.005, z * 0.005, 2);
      let rg;
      if (x > 236 + jag) rg = R.ASHENREACH;
      else if (Math.abs(x - spine) < 84 + jag * 0.6 && h > 26) rg = R.PEAKS;
      else if (z < -238 + jag) rg = R.FROSTMARCH;
      else if (x > -150 + jag && x < 74 + jag && z < -130 && z > -300) rg = R.MIRKHOLT;
      else if (Math.hypot((x + 40) / 150, (z - 215) / 96) < 1.0) rg = R.WEEPING;
      else if (x < -404 + jag * 1.4) rg = R.QUAYS;
      else if (x > -372 && x < -176 + jag && z > -74 && z < 148) rg = R.ELDERWOOD;
      else if (x > -152 + jag * 0.5 && x < -36 && z > -126 && z < -18) rg = R.WODENHOLT;
      else if (x < -186 && z > 132 + jag) rg = R.BARROWDOWNS;
      else if (x > -104 + jag) rg = R.MARCHLANDS;
      else rg = R.GREENHOLLOW;
      region[i] = rg;
    }
  }

  // -------------------------------------------------------------------------
  // 5. moisture — rain from the west, rain shadow east of the Peaks
  // -------------------------------------------------------------------------
  {
    // distance to fresh water, cheap two-pass chamfer
    const dist = new Float32Array(N).fill(1e6);
    for (let i = 0; i < N; i++) if (water[i] > 0) dist[i] = 0;
    for (let cy = 0; cy < H; cy++) for (let cx = 0; cx < W; cx++) {
      const i = ci(cx, cy);
      if (cx > 0) dist[i] = Math.min(dist[i], dist[i - 1] + 1);
      if (cy > 0) dist[i] = Math.min(dist[i], dist[i - W] + 1);
      if (cx > 0 && cy > 0) dist[i] = Math.min(dist[i], dist[i - W - 1] + 1.41);
    }
    for (let cy = H - 1; cy >= 0; cy--) for (let cx = W - 1; cx >= 0; cx--) {
      const i = ci(cx, cy);
      if (cx < W - 1) dist[i] = Math.min(dist[i], dist[i + 1] + 1);
      if (cy < H - 1) dist[i] = Math.min(dist[i], dist[i + W] + 1);
      if (cx < W - 1 && cy < H - 1) dist[i] = Math.min(dist[i], dist[i + W + 1] + 1.41);
    }
    for (let cy = 0; cy < H; cy++) {
      const z = wz(cy);
      const spine = spineAt(z);
      for (let cx = 0; cx < W; cx++) {
        const x = wx(cx), i = ci(cx, cy);
        let m = 0.5 + 0.4 * n3.fbm(x * 0.0035, z * 0.0035, 3);
        m += 0.34 * (1 - smoothstep(0, 26, dist[i]));          // riparian
        m -= 0.42 * smoothstep(spine, spine + 190, x);          // rain shadow
        m -= 0.30 * smoothstep(40, 88, height[i]);              // bare tops
        if (region[i] === R.WEEPING) m = Math.max(m, 0.9);
        if (region[i] === R.ELDERWOOD || region[i] === R.MIRKHOLT ||
          region[i] === R.WODENHOLT) m += 0.24;
        if (region[i] === R.ASHENREACH) m = Math.min(m, 0.16);
        moist[i] = clamp(m, 0, 1);
      }
    }
  }

  // -------------------------------------------------------------------------
  // 6. biome
  // -------------------------------------------------------------------------
  const nearSea = new Uint8Array(N);
  for (let cy = 0; cy < H; cy++) for (let cx = 0; cx < W; cx++) {
    if (water[ci(cx, cy)] !== 3) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      nearSea[ci(x, y)] = 1;
    }
  }

  for (let cy = 0; cy < H; cy++) {
    const z = wz(cy);
    for (let cx = 0; cx < W; cx++) {
      const i = ci(cx, cy), h = height[i], sl = slope[i], mo = moist[i], rg = region[i];
      const x = wx(cx);
      let b;
      if (h < 0) b = B.OCEAN;
      else if (h < 2.0 && nearSea[i]) b = B.BEACH;
      else if (rg === R.ASHENREACH) {
        const dW = Math.hypot((x - 425) / 118, (z - 55) / 118);
        b = (dW < 0.62 || h < 6.5 || n3.fbm(x * 0.02, z * 0.02, 2) > 0.42) ? B.SLAG : B.ASH;
        if (h > 72) b = B.ROCK;
      } else if (h > 63 + 14 * n2.fbm(x * 0.01, z * 0.01, 2)) b = B.SNOW;
      else if (rg === R.FROSTMARCH && h > 34) b = B.SNOW;
      else if (sl > 0.92 || h > 46) b = B.ROCK;
      else if (rg === R.WEEPING) b = B.MARSH;
      else if (rg === R.MIRKHOLT) b = B.DARKWOOD;
      else if (rg === R.ELDERWOOD || rg === R.WODENHOLT) b = B.FOREST;
      else if (mo > 0.66 && h < 40) b = B.FOREST;
      else if (rg === R.BARROWDOWNS) b = mo > 0.5 ? B.MOOR : B.DOWNS;
      else if ((rg === R.GREENHOLLOW || rg === R.MARCHLANDS) && mo > 0.36 && sl < 0.28 && h < 28) b = B.FARM;
      else if (mo < 0.3 || h > 38) b = B.MOOR;
      else b = B.DOWNS;
      biome[i] = b;

      // peril
      let p = 0.04;
      if (rg === R.ASHENREACH) p = 0.78;
      else if (rg === R.MIRKHOLT) p = 0.62;
      else if (rg === R.PEAKS) p = 0.45;
      else if (rg === R.BARROWDOWNS) p = 0.38;
      else if (rg === R.WEEPING) p = 0.34;
      else if (rg === R.WODENHOLT) p = 0.3;
      else if (rg === R.FROSTMARCH) p = 0.26;
      else if (rg === R.GREENHOLLOW) p = 0.02;
      p += 0.14 * sl + 0.1 * n1.noise2(x * 0.01, z * 0.01);
      if (b === B.SLAG) p += 0.15;
      peril[i] = clamp(p, 0, 1);
    }
  }

  // -------------------------------------------------------------------------
  // 7. queries
  // -------------------------------------------------------------------------
  const world = {
    seed: String(seed),
    W, H, CELL, worldW, worldH,
    height, water, biome, region, peril, moist, slope,

    idx(cx, cy) { return cy * W + cx; },
    inb(cx, cy) { return cx >= 0 && cy >= 0 && cx < W && cy < H; },
    toWorld(cx, cy) { return { x: X0 + (cx + 0.5) * CELL, z: Z0 + (cy + 0.5) * CELL }; },
    toCell(x, z) {
      return {
        cx: cl(Math.round((x - X0) / CELL - 0.5), 0, W - 1),
        cy: cl(Math.round((z - Z0) / CELL - 0.5), 0, H - 1),
      };
    },
    heightAt(x, z) {
      const fx = (x - X0) / CELL - 0.5, fz = (z - Z0) / CELL - 0.5;
      const ax = Math.floor(fx), ay = Math.floor(fz);
      const tx = fx - ax, tz = fz - ay;
      const g = (a, b) => height[cl(b, 0, H - 1) * W + cl(a, 0, W - 1)];
      return lerp(
        lerp(g(ax, ay), g(ax + 1, ay), tx),
        lerp(g(ax, ay + 1), g(ax + 1, ay + 1), tx), tz);
    },
    slopeAt(x, z) { const c = world.toCell(x, z); return slope[c.cy * W + c.cx]; },
    biomeAt(x, z) { const c = world.toCell(x, z); return biome[c.cy * W + c.cx]; },
    waterAt(x, z) { const c = world.toCell(x, z); return water[c.cy * W + c.cx]; },
    regionAt(x, z) { const c = world.toCell(x, z); return region[c.cy * W + c.cx]; },
    perilAt(x, z) { const c = world.toCell(x, z); return peril[c.cy * W + c.cx]; },
    moistAt(x, z) { const c = world.toCell(x, z); return moist[c.cy * W + c.cx]; },
    sites: [],
  };

  // -------------------------------------------------------------------------
  // 8. sites
  // -------------------------------------------------------------------------
  const NAMES = {
    halfling: ['Nether Wembly', 'Great Nubbin', 'Puddifoot', 'Combe-under-Hill',
      'Sixpenny Handley', 'Marrowmead', 'Nobbottle', 'Hobb’s Bottom',
      'Widdershin', 'Tuckham', 'Pipwick', 'Little Snoring'],
    dwarf: ['Dhurunzol', 'Anvilgate', 'Thrumhold', 'Baraz Deep', 'Kalgarûn',
      'the Ironmoot', 'Zhaddun', 'Karag-Vor'],
    elf: ['Lorindel', 'Nimrothel', 'Aelinquë', 'Celedhil', 'Mithravel',
      'Silverhithe', 'the Last Quay', 'Elenmar'],
    men: ['Amonhal', 'Brackenford', 'Stonemarch', 'Highholt', 'Westermark',
      'Dunhollow', 'Kingsbridge', 'Eryndale', 'Rillbridge'],
    watch: ['Windwatch', 'the Grey Tower', 'Thornwatch', 'Beacon Hardy',
      'Northkeep', 'Stormcrown'],
    orc: ['Gorgobal', 'Uzgrath', 'Nardûk', 'Cinderhold', 'the Slagworks',
      'Mount Wrack', 'Grimtooth', 'Ushnak'],
  };
  const used = { halfling: 0, dwarf: 0, elf: 0, men: 0, watch: 0, orc: 0 };

  function cultureFor(rg, b) {
    if (rg === R.ASHENREACH) return ['orc', 'hold'];
    if (rg === R.PEAKS || b === B.ROCK || b === B.SNOW) return ['dwarf', 'delve'];
    if (rg === R.ELDERWOOD || rg === R.QUAYS) return ['elf', 'haven'];
    if (rg === R.GREENHOLLOW) return ['halfling', 'shire'];
    if (rg === R.FROSTMARCH || rg === R.MIRKHOLT || rg === R.BARROWDOWNS) return ['watch', 'watch'];
    return ['men', 'burg'];
  }

  const spots = [];
  for (let cy = 4; cy < H - 4; cy += 2) {
    for (let cx = 4; cx < W - 4; cx += 2) {
      const i = ci(cx, cy);
      if (water[i] > 0 || height[i] < 2.5 || height[i] > 62 || slope[i] > 0.45) continue;
      if (biome[i] === B.OCEAN || biome[i] === B.BEACH || biome[i] === B.MARSH) continue;
      spots.push(i);
    }
  }
  const shuffled = rng.shuffled(spots);
  let id = 0;
  for (const i of shuffled) {
    if (world.sites.length >= 26) break;
    const cx = i % W, cy = (i - cx) / W;
    const p = world.toWorld(cx, cy);
    let ok = true;
    for (const s of world.sites) {
      if (Math.hypot(s.x - p.x, s.z - p.z) < 92) { ok = false; break; }
    }
    if (!ok) continue;
    const rg = region[i];
    const [culture, kind0] = cultureFor(rg, biome[i]);
    const pool = NAMES[culture];
    const name = pool[used[culture] % pool.length];
    used[culture]++;
    const kind = culture === 'watch' ? 'watch' : kind0;
    world.sites.push({
      id: 'site' + (id++), name, kind, culture,
      cx, cy, x: p.x, z: p.z, y: height[i],
      region: rg,
      tier: clamp(Math.floor(rng() * 3) + (culture === 'men' ? 1 : 0), 0, 4),
    });
  }

  return world;
}

export default makeStubWorld;
