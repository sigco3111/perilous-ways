// Binds the simulation to the scene: settlements, track, trains, labels.
//
// The sim knows nothing about three.js and the renderer knows nothing about
// grain. This file is the only place that knows both.

import * as THREE from 'three';
import { createTerrain } from './terrain.js';
import { buildSettlement, buildStation, propMaterials } from './props.js';
import { buildTrain, createSteam, createSparks } from './trains.js';
import { buildTrack, buildLineOverlay, buildSurveyPreview, trackMaterial } from './rails.js';
import { clamp, lerp, makeRng } from '../rng.js';
import { TIER_NAME, TIER_POP, GOODS } from '../sim/model.js';
import { STYLE_FOR_POLICY } from '../sim/fleet.js';

const STYLE_FOR = { halfling: 'men', dwarf: 'dwarf', elf: 'elf', men: 'men', orc: 'orc' };

/**
 * The consist a line's traffic actually warrants.
 *
 * Every train used to be built from a hardcoded `grain, ore, grain, ore, brake`,
 * which is the whole reason the economy was invisible: the most alive thing on
 * screen was carrying a fiction. Now the wagons are marshalled from what the line
 * really moved last week (`line.stats.byGood`) and how many people rode it
 * (`line.stats.pax`), weighted by what the service is run for. A line hauling ore
 * out of a delve looks like an ore train; a passenger trunk shows carriages; a
 * mixed branch shows a bit of everything and a brake van at the back.
 *
 * Returns an array of cargo kind names for buildTrain({ cars }).
 */
function consistFor(line, nCars) {
  const st = line.stats || {};
  const pol = String(line.policy || 'mixed');
  const claims = [];
  for (const [g, v] of Object.entries(st.byGood || {})) {
    if (v > 0.02) claims.push({ kind: GOODS[g]?.wagon || 'flat', w: v });
  }
  // Passengers are a claim on the train too, and how loud that claim is depends on
  // what the line is run for — this is what finally makes `policy` visible.
  // 'passenger', singular — the POLICIES key. This compared against 'passengers'
  // and never matched, so passenger trunks drew carriages at the mixed-line weight.
  const paxW = (st.pax || 0) * (pol === 'passenger' ? 0.10 : pol === 'freight' ? 0.02 : 0.05);
  if (paxW > 0.02) claims.push({ kind: 'passenger', w: paxW });
  if (pol === 'troop') claims.push({ kind: 'arms', w: Math.max(0.4, paxW) });

  const withBrake = nCars >= 3;
  const slots = Math.max(1, nCars - (withBrake ? 1 : 0));
  // A line that has carried nothing yet runs empties. That is honest, and it makes
  // the first loaded week visibly different from the week before it.
  if (!claims.length) {
    const empty = new Array(slots).fill('flat');
    if (withBrake) empty.push('brake');
    return empty;
  }
  // Largest-remainder allocation, so a small but genuine flow still earns a wagon
  // instead of being rounded out of existence.
  const total = claims.reduce((n, c) => n + c.w, 0);
  const alloc = claims.map((c) => {
    const exact = (slots * c.w) / total;
    return { kind: c.kind, exact, n: Math.floor(exact) };
  });
  const cars = [];
  for (const a of alloc) for (let i = 0; i < a.n; i++) cars.push(a.kind);
  alloc.sort((x, y) => (y.exact - y.n) - (x.exact - x.n));
  for (let i = 0; cars.length < slots; i++) cars.push(alloc[i % alloc.length].kind);
  // Marshal like with like, heaviest traffic nearest the engine, as a yard would.
  const rank = new Map(alloc.map((a, i) => [a.kind, i]));
  cars.sort((a, b) => (rank.get(a) ?? 99) - (rank.get(b) ?? 99));
  if (withBrake) cars.push('brake');
  return cars;
}

export function createWorld3D(world, sim, scene, sceneApi) {
  const root = new THREE.Group();
  scene.add(root);

  // ── terrain ────────────────────────────────────────────────────────────
  const terrain = createTerrain(world, THREE, {});
  root.add(terrain.group);
  const shared = terrain.shared || {};

  if (shared.uFog && sceneApi?.onFog) {
    sceneApi.onFog((colour, density) => {
      shared.uFog.value.set(colour.r, colour.g, colour.b, density);
    });
  }

  const propMats = propMaterials(THREE, shared);
  const trackMat = trackMaterial(shared);

  // ── settlements ────────────────────────────────────────────────────────
  const settleGroup = new THREE.Group();
  root.add(settleGroup);
  const builtSettlements = new Map();   // siteId -> { holder, tier, api }

  /**
   * How full a settlement is within its tier, in quarters. Rebuilding only on
   * tier change means a place looks identical for the ten weeks it spends filling
   * up, and the world reads as static. Four steps per tier is twenty visible
   * stages instead of five.
   */
  const growthStep = (site) => Math.round(
    clamp(site.pop / (TIER_POP[site.tier] || 1), 0.4, 2.0) * 4,
  );

  function placeSettlement(site) {
    const prev = builtSettlements.get(site.id);
    const step = growthStep(site);
    if (prev && prev.tier === site.tier && prev.step === step
        && prev.abandoned === site.abandoned) return;
    if (prev) { settleGroup.remove(prev.holder); prev.api.dispose?.(); }

    const api = buildSettlement({
      kind: site.kind, tier: site.tier, seed: `${world.seed}:${site.id}`, shared,
      // drives the footprint: props clamps this to 0.62-1.35x its natural radius,
      // so a place visibly spreads as it fills up
      radiusHint: [11, 16, 23, 33, 44][site.tier] * (0.62 + 0.22 * step),
    }, THREE);
    const holder = new THREE.Group();
    holder.add(api.group);
    holder.position.set(site.x, world.heightAt(site.x, site.z) - 0.4, site.z);
    // a light random spin so no two places sit square to the same axis
    holder.rotation.y = makeRng(`rot${site.id}`)() * Math.PI * 2;
    if (site.abandoned) {
      holder.traverse((o) => { if (o.isMesh) { o.material = o.material; } });
      holder.scale.setScalar(0.94);
    }
    settleGroup.add(holder);
    builtSettlements.set(site.id, {
      holder, tier: site.tier, step, api, abandoned: site.abandoned, site,
    });
  }

  for (const site of sim.sites) placeSettlement(site);

  // ── stations ───────────────────────────────────────────────────────────
  // props.js has 355 lines of finished, per-culture station art — platform, canopy,
  // name board, lamps, cranes, ore chutes, and milk churns waiting for the 8:40 —
  // and until now it was reachable only from test/props.html. A station is where a
  // railway touches the people who use it, so leaving it out of the game is most of
  // the reason the economy felt bloodless: there was nowhere for goods or passengers
  // to BE. One is placed at every served settlement, squared up to its own track.
  const stationGroup = new THREE.Group();
  root.add(stationGroup);
  const builtStations = new Map();   // siteId -> { holder, api, tier, sig }

  /** Bearing of the track where it meets this settlement, so the platform is parallel. */
  function trackBearingAt(site) {
    for (const L of sim.links) {
      if (L.destroyed) continue;
      const other = L.a === site.id ? sim.byId.get(L.b)
        : L.b === site.id ? sim.byId.get(L.a) : null;
      if (other) return Math.atan2(other.x - site.x, other.z - site.z);
    }
    return null;
  }

  function placeStation(site) {
    const bearing = trackBearingAt(site);
    const wanted = site.connected && !site.abandoned && bearing !== null;
    const prev = builtStations.get(site.id);
    const sig = wanted ? `${site.kind}:${site.tier}:${bearing.toFixed(2)}` : '';
    if (prev && prev.sig === sig) return;
    if (prev) { stationGroup.remove(prev.holder); prev.api.dispose?.(); builtStations.delete(site.id); }
    if (!wanted) return;

    const api = buildStation({
      kind: site.kind, tier: site.tier, seed: `${world.seed}:st${site.id}`, shared,
    }, THREE);
    const holder = new THREE.Group();
    holder.add(api.group);
    // stand it off the settlement centre, on the side the track arrives from, so it
    // does not grow out of the middle of somebody's roof
    const off = [13, 17, 22, 29, 36][site.tier] || 16;
    const px = site.x + Math.sin(bearing) * off * 0.55;
    const pz = site.z + Math.cos(bearing) * off * 0.55;
    holder.position.set(px, world.heightAt(px, pz) - 0.3, pz);
    holder.rotation.y = bearing;
    stationGroup.add(holder);
    builtStations.set(site.id, { holder, api, tier: site.tier, sig });
  }

  // ── selection ring ─────────────────────────────────────────────────────
  const ringGeo = new THREE.RingGeometry(9, 11.4, 48);
  ringGeo.rotateX(-Math.PI / 2);
  const mkRing = (hex, op) => {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: hex, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide,
    }));
    m.renderOrder = 8; m.visible = false;
    root.add(m);
    return m;
  };
  const ringA = mkRing('#ffe6a8', 0.95);
  const ringHover = mkRing('#fdf4e0', 0.5);
  const ringTrain = mkRing('#c94f3d', 0.9);
  ringTrain.scale.setScalar(0.42);

  // ── track ──────────────────────────────────────────────────────────────
  const trackGroup = new THREE.Group();
  root.add(trackGroup);
  const trackByLink = new Map();
  const portalGroup = new THREE.Group();
  root.add(portalGroup);

  // A tunnel portal: a plain arched stone face. Built here rather than in props
  // so it always matches the deck geometry exactly.
  const portalProto = (() => {
    const g = new THREE.Group();
    const stone = new THREE.MeshStandardMaterial({ color: '#6e6a66', roughness: 0.92, vertexColors: false });
    const wall = new THREE.Mesh(new THREE.BoxGeometry(13, 11, 2.4), stone);
    wall.position.y = 4.2;
    g.add(wall);
    const arch = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.85, 8, 18, Math.PI), stone);
    arch.position.set(0, 4.0, 1.3);
    g.add(arch);
    const key = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.7, 2.9), new THREE.MeshStandardMaterial({ color: '#b08d57', roughness: 0.55, metalness: 0.5 }));
    key.position.set(0, 8.0, 1.1);
    g.add(key);
    // the dark of the bore itself
    const hole = new THREE.Mesh(new THREE.CircleGeometry(3.4, 20), new THREE.MeshBasicMaterial({ color: '#0d0b0a' }));
    hole.position.set(0, 4.0, 1.5);
    g.add(hole);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return g;
  })();

  function addTrack(link) {
    if (trackByLink.has(link.id)) return;
    // Clear the trees the works displaced. Nothing else tells the map that a
    // wood was cut, and it is the most visible consequence in the whole game.
    for (let i = 0; i < link.pts.length; i += 2) {
      const p = link.pts[i];
      const bio = world.biomeAt(p.x, p.z);
      if (bio === 4 || bio === 5) {
        const c = world.toCell(p.x, p.z);
        terrain.setForestDamage?.(c.cx, c.cy, 9);
      }
    }
    const t = buildTrack(link, world, trackMat);
    trackGroup.add(t.mesh);
    const portals = [];
    for (const p of t.portals) {
      const inst = portalProto.clone(true);
      inst.position.set(p.x, p.y - 4.4, p.z);
      inst.rotation.y = p.angle + Math.PI / 2;
      portalGroup.add(inst);
      portals.push(inst);
    }
    trackByLink.set(link.id, { ...t, portals });
  }

  function dropTrack(linkId) {
    const t = trackByLink.get(linkId);
    if (!t) return;
    trackGroup.remove(t.mesh);
    for (const p of t.portals) portalGroup.remove(p);
    t.dispose();
    trackByLink.delete(linkId);
  }

  // ── line overlays ──────────────────────────────────────────────────────
  // Drawn for every service, all the time. At the default camera distance the
  // rails themselves are under a pixel wide, so without a coloured ribbon over
  // the top the player cannot see their own network — which is the one thing the
  // whole game is about.
  const overlayGroup = new THREE.Group();
  root.add(overlayGroup);
  let overlays = [];
  let highlighted = null;

  function clearOverlays() {
    for (const o of overlays) { overlayGroup.remove(o.mesh); o.dispose(); }
    overlays = [];
  }

  function refreshOverlays() {
    clearOverlays();
    for (const line of sim.lines) {
      const ids = sim.lineLinks(line);
      if (!ids || !ids.length) continue;
      const seen = new Set(), links = [];
      for (const id of ids) {
        if (seen.has(id)) continue;
        seen.add(id);
        const L = sim.links.find((x) => x.id === id);
        if (L) links.push(L);
      }
      if (!links.length) continue;
      // stack the ribbons slightly so two services sharing a corridor both show
      const lift = 3.4 + (overlays.length % 3) * 0.9;
      const o = buildLineOverlay(links, line.colour, lift);
      o.lineId = line.id;
      overlayGroup.add(o.mesh);
      overlays.push(o);
    }
    applyHighlight();
  }

  // The ribbon is a map layer, not scenery. Close in, the real rails are legible
  // and a 5-unit-wide slab of colour over a 2.4-unit gauge looks ridiculous, so
  // fade it out as the camera comes down and bring it back as the camera lifts.
  let overlayFade = 1;
  function applyHighlight() {
    for (const o of overlays) {
      const on = highlighted === null || o.lineId === highlighted;
      o.mesh.material.opacity = (on ? 0.86 : 0.22) * overlayFade;
      o.mesh.visible = overlayFade > 0.02;
    }
  }
  function setOverlayFade(camDist) {
    const f = clamp((camDist - 190) / (400 - 190), 0, 1);
    if (Math.abs(f - overlayFade) < 0.01) return;
    overlayFade = f;
    applyHighlight();
  }

  function showOverlay(line) {
    highlighted = line ? line.id : null;
    applyHighlight();
  }

  let preview = null;
  function showPreview(survey, ok = true) {
    if (preview) { root.remove(preview.mesh); preview.dispose(); preview = null; }
    if (!survey || !survey.ok) return;
    preview = buildSurveyPreview(survey, ok);
    root.add(preview.mesh);
  }

  // ── trains ─────────────────────────────────────────────────────────────
  const trainGroup = new THREE.Group();
  root.add(trainGroup);
  const steam = createSteam(THREE, 1400);
  root.add(steam.points);
  const sparks = createSparks(THREE, 300);
  root.add(sparks.points);

  /** One visual train per engine assigned to a line. */
  const vehicles = [];

  /** Callbacks the host installs: whistle, brake, arrival at a stop. */
  const trainHooks = {};

  function syncVehicles() {
    // One vehicle per *engine*, so the thing on screen is the thing in the roster
    // and everything that happens to it can be remembered.
    const want = [];
    for (const line of sim.lines) {
      const ids = sim.lineLinks(line);
      if (!ids || !ids.length) continue;
      const crew = sim.enginesOf(line.id);
      crew.forEach((eng, k) => want.push({ line, k, eng, of: crew.length }));
    }
    // drop vehicles whose engine has gone back to the shed
    for (let i = vehicles.length - 1; i >= 0; i--) {
      if (!want.some((w) => w.eng.id === vehicles[i].engineId)) {
        const v = vehicles.splice(i, 1)[0];
        trainGroup.remove(v.built.group);
        v.built.dispose?.();
      }
    }
    for (const w of want) {
      let v = vehicles.find((x) => x.engineId === w.eng.id);
      const cars = consistFor(w.line, clamp(sim.lineCars(w.line), 1, 6));
      const sig = cars.join(',');
      // Rebuilding a train is not free, so only do it when the marshalling actually
      // changes. A line's dominant traffic is stable for weeks at a time, so in
      // practice this fires when the economy genuinely shifts — which is exactly
      // when the player should see the train change.
      if (v && v.consistSig !== sig) {
        trainGroup.remove(v.built.group);
        v.built.dispose?.();
        v.built = buildTrain({ style: w.eng.style, cars, seed: `eng${w.eng.id}` }, THREE);
        v.built.group.userData.engineId = w.eng.id;
        trainGroup.add(v.built.group);
        v.consistSig = sig;
        v.cars = cars;
      }
      if (!v) {
        const built = buildTrain({ style: w.eng.style, cars, seed: `eng${w.eng.id}` }, THREE);
        built.group.userData.engineId = w.eng.id;
        trainGroup.add(built.group);
        v = {
          id: w.eng.id, engineId: w.eng.id, built, line: w.line, slot: w.k, of: w.of,
          u: 0, dir: 1, path: null, dwell: 0, lastStopAt: -1, whistle: 0,
          consistSig: sig, cars,
        };
        vehicles.push(v);
      }
      v.line = w.line; v.slot = w.k; v.of = w.of;
      if (v.lineWas !== w.line.id) { v.lineWas = w.line.id; v.path = null; }
    }
  }

  /** Flatten a line into a polyline of deck points, both directions. */
  function buildPath(line) {
    const ids = sim.lineLinks(line);
    if (!ids || !ids.length) return null;
    const pts = [];
    let prevEnd = null;
    for (let i = 0; i < line.stops.length - 1; i++) {
      const h = sim.hopsTo(line.stops[i], line.stops[i + 1]);
      if (!h) return null;
      // hops come back goal-first
      const seq = h.hops.slice().reverse();
      let node = line.stops[i];
      for (const id of seq) {
        const L = sim.links.find((x) => x.id === id);
        if (!L) return null;
        const forward = L.a === node;
        const n = L.pts.length;
        for (let k = 0; k < n; k++) {
          const j = forward ? k : n - 1 - k;
          const p = new THREE.Vector3(L.pts[j].x, L.deck[j] + 1.25, L.pts[j].z);
          if (prevEnd && p.distanceToSquared(prevEnd) < 0.01) continue;
          pts.push(p);
          prevEnd = p;
        }
        node = forward ? L.b : L.a;
      }
    }
    if (pts.length < 2) return null;
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    return { pts, cum, len: cum[cum.length - 1] };
  }

  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
  const upV = new THREE.Vector3(0, 1, 0);

  function sampleAt(path, d) {
    const { pts, cum } = path;
    const dd = clamp(d, 0, path.len);
    let lo = 0, hi = cum.length - 1;
    while (lo < hi - 1) { const m = (lo + hi) >> 1; if (cum[m] <= dd) lo = m; else hi = m; }
    const seg = cum[hi] - cum[lo] || 1;
    const t = (dd - cum[lo]) / seg;
    tmpA.lerpVectors(pts[lo], pts[hi], t);
    tmpB.subVectors(pts[hi], pts[lo]).normalize();
    return { pos: tmpA, dir: tmpB };
  }

  /** Arc-length positions of this line's own stops, for dwell and whistles. */
  function stopMarks(line, path) {
    const marks = [];
    for (const id of line.stops) {
      const st = sim.byId.get(id);
      if (!st) continue;
      let best = 0, bestD = Infinity;
      for (let i = 0; i < path.pts.length; i++) {
        const d = (path.pts[i].x - st.x) ** 2 + (path.pts[i].z - st.z) ** 2;
        if (d < bestD) { bestD = d; best = i; }
      }
      marks.push({ u: path.cum[best], site: st });
    }
    return marks.sort((a, b) => a.u - b.u);
  }


  let vehicleClock = 0;
  function updateTrains(dt, env, speedMult) {
    vehicleClock += dt;
    for (const v of vehicles) {
      if (!v.path) {
        v.path = buildPath(v.line);
        if (!v.path) { v.built.group.visible = false; continue; }
        // stagger the trains on a line so they don't run in a clump
        const n = Math.max(1, v.line.trains);
        v.u = (v.path.len * (v.slot / n)) || 0;
        v.dir = v.slot % 2 === 0 ? 1 : -1;
      }
      v.built.group.visible = true;
      const eng = sim.engineById(v.engineId);
      const marks = v.marks || (v.marks = stopMarks(v.line, v.path));

      // ── dwell. A train that never stops is scenery; a train that pulls in,
      // waits, whistles and pulls out is the thing the player watches.
      if (v.dwell > 0) {
        v.dwell -= dt;
        if (v.dwell <= 0 && v.atStop) {
          trainHooks.depart?.(v, v.atStop, eng);
          v.atStop = null;
        }
        if (v.built.advance) v.built.advance(0);
        const s0 = sampleAt(v.path, v.u);
        v.built.group.position.copy(s0.pos);
        continue;
      }

      const speed = 30 * sim.stock.speed * speedMult;
      const prevU = v.u;
      v.u += v.dir * speed * dt;
      if (eng) eng.dist += Math.abs(v.u - prevU);

      // whistle a little before a stop, then stop at it
      for (let mi = 0; mi < marks.length; mi++) {
        const m = marks[mi];
        const crossed = (prevU < m.u && v.u >= m.u) || (prevU > m.u && v.u <= m.u);
        const nearing = Math.abs(m.u - v.u) < 34 && Math.sign(m.u - v.u) === v.dir;
        if (nearing && v.whistle <= 0 && speedMult > 0) {
          v.whistle = 6;
          trainHooks.whistle?.(v, m.site, eng);
        }
        if (crossed && mi !== v.lastStopAt && speedMult > 0) {
          v.lastStopAt = mi;
          v.u = m.u;
          v.dwell = 1.1 + 0.5 / Math.max(0.4, speedMult);
          v.atStop = m.site;
          if (eng) eng.trips += 0.5 / Math.max(1, marks.length - 1);
          trainHooks.arrive?.(v, m.site, eng);
          break;
        }
      }
      v.whistle -= dt;
      if (v.u > v.path.len) { v.u = v.path.len; v.dir = -1; v.lastStopAt = -1; }
      if (v.u < 0) { v.u = 0; v.dir = 1; v.lastStopAt = -1; }

      const s = sampleAt(v.path, v.u);
      v.built.group.position.copy(s.pos);
      tmpQ.setFromUnitVectors(new THREE.Vector3(0, 0, 1), s.dir.clone().multiplyScalar(v.dir));
      v.built.group.quaternion.slerp(tmpQ, 0.35);

      // wheels
      if (v.built.advance) v.built.advance(speed * dt * v.dir);

      // steam from the stack
      v.chuff -= dt;
      const st = v.built.stackTop;
      if (st) {
        tmpB.copy(st).applyQuaternion(v.built.group.quaternion).add(v.built.group.position);
        // pass the vehicle index as the emitter id: without it every train shares
        // one fractional accumulator and the puff rate goes wrong at scale
        steam.emit(tmpB, { x: 0, y: 7 + speed * 0.06, z: 0 }, 1, v.built.style, v.id);
      }
      if (v.built.setNight) v.built.setNight(env.night);
    }
  }

  // ── labels ─────────────────────────────────────────────────────────────
  const labelLayer = document.createElement('div');
  labelLayer.id = 'labels';
  document.getElementById('hud').appendChild(labelLayer);
  const labels = new Map();

  // Rectangles of the HUD chrome, refreshed occasionally. A label that lands on a
  // panel is unreadable and makes the panel unreadable too, so the label yields.
  let chromeRects = [];
  let chromeAge = 999;
  function refreshChrome() {
    const ids = ['topbar', 'leftpanel', 'register', 'ledger', 'linePanel', 'inspector'];
    chromeRects = [];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (!el || el.hidden || el.offsetParent === null) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        chromeRects.push({ l: r.left - 6, t: r.top - 6, r: r.right + 6, b: r.bottom + 6 });
      }
    }
  }
  const overChrome = (x, y) => {
    for (const c of chromeRects) if (x > c.l && x < c.r && y > c.t && y < c.b) return true;
    return false;
  };

  function updateLabels(camera) {
    const v = new THREE.Vector3();
    const w = labelLayer.clientWidth, h = labelLayer.clientHeight;
    if (++chromeAge > 20) { chromeAge = 0; refreshChrome(); }
    for (const site of sim.sites) {
      let el = labels.get(site.id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'plabel';
        el.innerHTML = `<span></span><s></s>`;
        labelLayer.appendChild(el);
        labels.set(site.id, el);
      }
      if (site.abandoned) { el.style.display = 'none'; continue; }
      v.set(site.x, world.heightAt(site.x, site.z) + 14 + site.tier * 3.5, site.z);
      v.project(camera);
      const behind = v.z > 1;
      const dist = camera.position.distanceTo(new THREE.Vector3(site.x, site.y, site.z));
      const sx = (v.x * 0.5 + 0.5) * w;
      const sy = (-v.y * 0.5 + 0.5) * h;
      // Keep labels out of the chrome. Without this they draw straight through
      // the top bar and read as garbled statistics.
      const clear = sy > 4 && sy < h - 8 && sx > 4 && sx < w - 4 && !overChrome(sx, sy);
      const show = !behind && clear && dist < 900 && (site.tier >= 2 || dist < 480);
      if (!show) { el.style.display = 'none'; continue; }
      el.style.display = '';
      el.style.left = `${sx}px`;
      el.style.top = `${sy}px`;
      el.classList.toggle('big', site.tier >= 3);
      const nameEl = el.firstChild, subEl = el.lastChild;
      if (nameEl.textContent !== site.name) nameEl.textContent = site.name;
      const rising = site.pop > (TIER_POP[site.tier] || 1) * 1.25;
      const falling = site.pop < (TIER_POP[site.tier] || 1) * 0.75 && site.tier > 0;
      const sub = site.quarantined ? '격리됨'
        : !site.connected ? '미연결'
        : site.satisfaction < 0.45 ? '부족'
        : site.tier >= 2 ? `${TIER_NAME[site.tier]}${rising ? ' ↑' : ''}`
        : rising ? '성장 중 ↑' : falling ? '쇠퇴 ↓' : '';
      if (subEl.textContent !== sub) subEl.textContent = sub;
      el.classList.toggle('warn', sub === '부족' || sub === '격리됨');
    }
  }

  // ── picking ────────────────────────────────────────────────────────────
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  /** Nearest settlement to the cursor, in screen space. */
  function pickSite(camera, px, py, rect) {
    let best = null, bestD = 46;
    const v = new THREE.Vector3();
    for (const site of sim.sites) {
      if (site.abandoned) continue;
      v.set(site.x, world.heightAt(site.x, site.z) + 4, site.z);
      v.project(camera);
      if (v.z > 1) continue;
      const sx = (v.x * 0.5 + 0.5) * rect.width;
      const sy = (-v.y * 0.5 + 0.5) * rect.height;
      const d = Math.hypot(sx - px, sy - py);
      if (d < bestD) { bestD = d; best = site; }
    }
    return best;
  }

  /** Nearest train to the cursor in screen space, or null. */
  function pickTrain(camera, px, py, rect) {
    // Generous, on purpose. A train crosses tens of pixels between the moment the
    // player aims and the moment the click lands, so a tight radius makes the most
    // interesting object on screen the hardest one to touch.
    let best = null, bestD = 48;
    const v3 = new THREE.Vector3();
    const probe = new THREE.Vector3();
    for (const v of vehicles) {
      if (!v.built.group.visible) continue;
      // sample the head, middle and tail so clicking any wagon counts
      for (const along of [-0.45, 0, 0.45]) {
        probe.set(0, 0, (v.built.length || 24) * along).applyQuaternion(v.built.group.quaternion);
        v3.copy(v.built.group.position).add(probe);
        v3.project(camera);
        if (v3.z > 1) continue;
        const sx = (v3.x * 0.5 + 0.5) * rect.width;
        const sy = (-v3.y * 0.5 + 0.5) * rect.height;
        const d = Math.hypot(sx - px, sy - py);
        if (d < bestD) { bestD = d; best = v; }
      }
    }
    return best;
  }

  /** World position of an engine, for the follow camera. */
  function enginePos(engineId) {
    const v = vehicles.find((x) => x.engineId === engineId);
    return v ? v.built.group.position : null;
  }


  /** Where on the ground the cursor is, for camera panning. */
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  function pickGround(camera, px, py, rect) {
    ndc.set((px / rect.width) * 2 - 1, -(py / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const out = new THREE.Vector3();
    return ray.ray.intersectPlane(groundPlane, out) ? out : null;
  }

  // ── frame ──────────────────────────────────────────────────────────────
  let selectedEngine = null;
  let lastLinkCount = 0, lastLineSig = '', lastTrafficWeek = -1;
  let lastStationLinks = -1, lastStationWeek = -1;

  function update(dt, env, speedMult, camera) {
    setOverlayFade(env.camDist ?? 430);
    // new or removed track
    if (sim.links.length !== lastLinkCount) {
      for (const L of sim.links) addTrack(L);
      for (const id of [...trackByLink.keys()]) {
        if (!sim.links.some((L) => L.id === id)) dropTrack(id);
      }
      lastLinkCount = sim.links.length;
      for (const v of vehicles) v.path = null;
      refreshOverlays();
    }
    // grown or lost settlements
    for (const site of sim.sites) {
      const b = builtSettlements.get(site.id);
      if (!b || b.tier !== site.tier || b.step !== growthStep(site)
          || b.abandoned !== site.abandoned) placeSettlement(site);
    }
    // A station appears the week a place is first served, which is the most
    // satisfying moment in the game and previously had no visual consequence at all.
    if (sim.links.length !== lastStationLinks || sim.week !== lastStationWeek) {
      lastStationLinks = sim.links.length; lastStationWeek = sim.week;
      for (const site of sim.sites) placeStation(site);
    }
    // fleet changes
    const sig = sim.lines.map((l) => `${l.id}:${l.trains}:${l.cars ?? '-'}:${l.stops.join(',')}`).join('|') + `#${sim.stock.cars}`;
    if (sig !== lastLineSig) { lastLineSig = sig; syncVehicles(); refreshOverlays(); }
    // Traffic changes too. The signature above covers only the shape of the network,
    // so a train built in week one kept its original wagons for the rest of the game
    // no matter what the line went on to carry. Line stats are recomputed weekly, and
    // syncVehicles only rebuilds a train whose marshalling actually differs, so it is
    // cheap to re-check once a week.
    if (sim.week !== lastTrafficWeek) { lastTrafficWeek = sim.week; syncVehicles(); }

    terrain.update(dt, env);
    updateTrains(dt, env, speedMult);
    steam.update(dt, { ...env, fov: camera.fov });
    sparks.update(dt);
    for (const b of builtSettlements.values()) b.api.update?.(dt, env);
    for (const b of builtStations.values()) b.api.update?.(dt, env);
    // keep the selection ring under the followed train
    if (selectedEngine !== null) {
      const p = enginePos(selectedEngine);
      ringTrain.visible = !!p;
      if (p) ringTrain.position.set(p.x, world.heightAt(p.x, p.z) + 0.7, p.z);
    } else ringTrain.visible = false;

    updateLabels(camera);
  }

  return {
    root, terrain, shared,
    update, pickSite, pickGround, pickTrain, enginePos,
    setSelectedEngine(id) { selectedEngine = id; },
    onTrain(hooks) { Object.assign(trainHooks, hooks); },
    vehicleFor: (engineId) => vehicles.find((v) => v.engineId === engineId) || null,
    /** How many stations are placed — a leak here would be invisible otherwise. */
    debugStations: () => builtStations.size,
    /** What each train is actually made of — for tests and the engine card. */
    debugVehicles: () => vehicles.map((v) => ({
      engineId: v.engineId, lineId: v.line?.id ?? null, cars: v.cars || null,
    })),
    /** The marshalling a given engine is running, so the UI can name the load. */
    consistOf: (engineId) => vehicles.find((v) => v.engineId === engineId)?.cars || null,
    showOverlay, showPreview,
    setSelected(site) {
      ringA.visible = !!site;
      if (site) ringA.position.set(site.x, world.heightAt(site.x, site.z) + 0.6, site.z);
    },
    setHover(site) {
      ringHover.visible = !!site;
      if (site) ringHover.position.set(site.x, world.heightAt(site.x, site.z) + 0.5, site.z);
    },
    sparkAt(x, y, z, colour) { sparks.burst(new THREE.Vector3(x, y, z), 26, colour); },
    settlementAt: (id) => builtSettlements.get(id),
  };
}
