// Perilous Ways — entry point.

import * as THREE from 'three';
import { generateWorld, REGION_NAME } from './world/worldgen.js';
import { createSim } from './sim/sim.js';
import { createEvents } from './sim/events.js';
import { LENDERS } from './sim/model.js';
import { createScene } from './gfx/scene.js';
import { createWorld3D } from './gfx/world3d.js';
import { createHud } from './ui/hud.js';
import { createControls } from './ui/input.js';
import { Audio } from './audio/audio.js';
import { clamp } from './rng.js';

const $ = (id) => document.getElementById(id);
const REALM_NAMES = ['eardon', 'westmarch', 'mithril', 'thrain', 'lorien', 'grimhold',
  'silverflood', 'brackenford', 'wrack', 'oldcroaking'];

// ---------------------------------------------------------------------------
// Failure should be legible. A game that dies to a shader compile error or a
// bad field access must say so on screen rather than presenting a black canvas
// and a shrug.
// ---------------------------------------------------------------------------

let fatalShown = false;
function fatal(kind, detail) {
  console.error(`[${kind}]`, detail);
  if (fatalShown) return;
  fatalShown = true;
  const box = document.createElement('div');
  box.style.cssText = `position:fixed;inset:auto 0 0 0;z-index:999;max-height:52vh;overflow:auto;
    background:#1b1410;color:#f0d9b8;font:12px/1.5 ui-monospace,monospace;padding:14px 18px;
    border-top:2px solid #9d3a2c;white-space:pre-wrap`;
  box.textContent = `The Authority regrets to report an operational irregularity.\n\n${kind}\n${detail}\n\n`
    + `Reload to try again. If this persists the realm seed may be at fault — try another.`;
  document.body.appendChild(box);
  const bs = $('boot');
  if (bs && !bs.hidden) bs.querySelector('.boot-status').textContent = 'failed — see below';
}

addEventListener('error', (e) => fatal('script error', `${e.message}\n${e.filename}:${e.lineno}`));
addEventListener('unhandledrejection', (e) => fatal('unhandled rejection', String(e.reason?.stack || e.reason)));

const boot = {
  set(pct, msg) {
    $('boot').querySelector('.boot-bar i').style.width = `${pct}%`;
    if (msg) $('boot').querySelector('.boot-status').textContent = msg;
  },
};

let G = null;   // the live game

// ---------------------------------------------------------------------------

async function startGame(seed) {
  const canvas = $('view');
  boot.set(8, 'surveying the realm…');
  await frame();

  const world = generateWorld(seed);
  boot.set(28, 'raising the Sundering Peaks…');
  await frame();

  const sim = createSim(world);
  sim.events = createEvents();
  sim.audio = (name, o) => Audio.play(name, o);

  const sceneApi = createScene(canvas, world);
  sceneApi.renderer.debug.onShaderError = (gl, prog, vs, fs) => {
    const log = (o) => gl.getShaderInfoLog(o) || '';
    fatal('shader would not compile', `${log(vs)}
${log(fs)}`.trim().slice(0, 1400));
  };
  boot.set(46, 'planting Mirkholt…');
  await frame();

  const w3 = createWorld3D(world, sim, sceneApi.scene, sceneApi);
  boot.set(84, 'printing the timetable…');
  await frame();

  // ── interaction state
  let selected = null;      // first settlement of a survey
  let hovered = null;
  let survey = null;        // live survey between selected and hovered/second
  let speed = 1;
  let selectedLine = null;
  let selectedEngine = null;

  const controls = createControls(canvas, sceneApi.camera, world, {
    onHover(x, y, rect) {
      // a train under the cursor gets the pointer, so the player learns it is
      // something you can touch
      const veh = w3.pickTrain(sceneApi.camera, x, y, rect);
      const site = veh ? null : w3.pickSite(sceneApi.camera, x, y, rect);
      if (site !== hovered) {
        hovered = site;
        w3.setHover(site && site !== selected ? site : null);
      }
      canvas.style.cursor = (veh || site) ? 'pointer' : 'default';
    },
    onClick(x, y, rect) {
      if (hud.modalOpen) return;
      // Trains take priority: they are small, they move, and they are the thing
      // the player is most likely to be aiming at.
      const veh = w3.pickTrain(sceneApi.camera, x, y, rect);
      if (veh) {
        const eng = sim.engineById(veh.engineId);
        if (eng) { Audio.play('ui_click'); selectEngine(eng.id); return; }
      }
      const site = w3.pickSite(sceneApi.camera, x, y, rect);
      if (!site) { clearSelection(); return; }
      Audio.play('ui_click');
      // With a service dossier open, a click on the map is an instruction about
      // that service rather than the start of a new survey.
      if (hud.openLine !== null && !selected) {
        const r = sim.addStop(hud.openLine, site.id);
        if (r.ok) {
          hud.hint(`${site.name} added to the service.`);
          w3.showOverlay(sim.lines.find((l) => l.id === hud.openLine) || null);
          hud.refresh();
          return;
        }
        hud.hint(r.reason || 'that cannot be a call on this service');
      }
      if (!selected) {
        selected = site;
        w3.setSelected(site);
        hud.showSite(site);
        return;
      }
      if (site === selected) { clearSelection(); return; }
      // second pick: survey
      const sv = sim.survey(selected.id, site.id);
      survey = sv.ok ? { ...sv, from: selected, to: site } : null;
      w3.showPreview(sv.ok ? sv : null, sv.ok && sv.price <= sim.treasury);
      hud.showSurvey(selected, site, sv);
      if (!sv.ok) Audio.play('error');
    },
  });
  controls.focusOn(-120, 30, 430);

  // Trains announce themselves. A whistle on the approach and a squeal at the
  // platform is most of what makes watching one enjoyable.
  w3.onTrain({
    whistle(v, site) {
      if (speed === 0) return;
      Audio.play('whistle', { gain: 0.26 });
    },
    arrive(v, site, eng) {
      if (speed === 0) return;
      Audio.play('brake', { gain: 0.2 });
      const p = w3.enginePos(v.engineId);
      if (p) w3.sparkAt(p.x, p.y - 0.6, p.z, '#ffb066');
      Audio.play('bell', { gain: 0.16, delay: 0.4 });
      // credit the engine with what the line is shifting
      if (eng && v.line?.stats) eng.loads += (v.line.stats.loads || 0) / 40;
    },
    depart(v, site) {
      if (speed === 0) return;
      Audio.play('chuff', { gain: 0.3 });
      Audio.play('chuff', { gain: 0.26, delay: 0.32, rate: 0.94 });
    },
  });

  // ── hud
  const hud = createHud(sim, {
    build(choice) {
      if (!survey) return;
      const r = sim.build(survey);
      if (!r.ok) { hud.hint(r.reason); Audio.play('error'); return; }
      Audio.play('build_track');
      if (survey.tunnels > 0) Audio.play('build_works', { delay: 0.35 });
      // The player chose on the survey card whether this is a new service or an
      // extension of an existing one. Doing it for them was the single biggest
      // reason the network never felt like theirs.
      let lineId = null;
      if (choice && choice !== 'new') {
        const line = sim.lines.find((l) => l.id === +choice);
        if (line) {
          const other = line.stops.includes(r.link.a) ? r.link.b : r.link.a;
          const add = sim.addStop(line.id, other);
          if (add.ok) lineId = line.id;
        }
      }
      if (lineId === null) {
        const cr = sim.createLine([r.link.a, r.link.b], 'mixed');
        if (cr.ok) {
          lineId = cr.line.id;
          if (sim.enginesFree() > 0) sim.setLineTrains(lineId, 1);
        }
      }
      clearSelection();
      selectedLine = lineId;
      hud.setSelectedLine(lineId);
      w3.showOverlay(sim.lines.find((l) => l.id === lineId) || null);
      hud.refresh();
    },
    reshowSurvey() {
      if (survey) hud.showSurvey(survey.from, survey.to, survey);
    },
    addStopToLine(lineId) {
      if (!selected) return;
      const r = sim.addStop(lineId, selected.id);
      if (!r.ok) { hud.hint(r.reason || 'cannot add that call'); Audio.play('error'); return; }
      Audio.play('ui_click');
      selectedLine = lineId;
      hud.setSelectedLine(lineId);
      w3.showOverlay(sim.lines.find((l) => l.id === lineId) || null);
      clearSelection();
      hud.refresh();
    },
    networkChanged() {
      w3.showOverlay(sim.lines.find((l) => l.id === selectedLine) || null);
    },
    clearSelection() { clearSelection(); },
    adjustTrains(lineId, delta) {
      const line = sim.lines.find((l) => l.id === lineId);
      if (!line) return;
      const r = sim.setLineTrains(lineId, line.trains + delta);
      if (!r.ok) { hud.hint(r.reason || 'no engines to spare'); Audio.play('error'); return; }
      Audio.play('ui_click');
      hud.refreshFleet();
      if (selectedEngine !== null) {
        const e = sim.engineById(selectedEngine);
        const v = w3.vehicleFor(selectedEngine);
        if (e) hud.showEngine(e, { at: v?.atStop?.id });
      }
    },
    selectLine(id) {
      selectedLine = (id === null || selectedLine === id) ? null : id;
      hud.setSelectedLine(selectedLine);
      w3.showOverlay(sim.lines.find((l) => l.id === selectedLine) || null);
    },
    takeCharter(id) {
      const r = sim.takeCharter(id);
      if (r.ok) { Audio.play('charter'); hud.refresh(); }
    },
    answerPetition(i) {
      const p = sim.pendingPetition;
      if (!p) return;
      p.options[i].apply(sim);
      sim.pendingPetition = null;
      hud.refresh();
    },
    isFollowing: () => controls.following,
    stopRiding() { stopRiding(); },
    /**
     * What a given engine is actually pulling, for the engine card's drawing.
     *
     * An engine that has only just been put to a service has no VEHICLE yet — those
     * are formed in the render loop — so asking world3d directly returns nothing and
     * the card showed no train at all for a train that was about to exist. Fall back
     * to whatever the rest of the service is running, which is what this engine will
     * be marshalled with.
     */
    consistOf(engineId) {
      const mine = w3.consistOf(engineId);
      if (mine && mine.length) return mine;
      const eng = sim.engineById(engineId);
      if (!eng || eng.lineId === null) return null;
      for (const other of sim.enginesOf(eng.lineId)) {
        const c = w3.consistOf(other.id);
        if (c && c.length) return c;
      }
      return null;
    },
    /** What a service's train looks like, for the line dossier's drawing. */
    consistFor(lineId) {
      const engs = sim.enginesOf(lineId);
      if (engs.length) {
        const c = w3.consistOf(engs[0].id);
        if (c && c.length) return c;
      }
      return null;
    },
    setLineCars(lineId, n) {
      const r = sim.setLineCars(lineId, n);
      if (!r.ok) return;
      Audio.play('ui_click');
      hud.refresh();
    },
    buyEngine(clsKey) {
      const r = sim.buyEngine(clsKey);
      if (!r.ok) { hud.hint(r.reason || 'they will not build it'); Audio.play('error'); return; }
      Audio.play('build_works');
      const c = sim.engineClass(r.engine);
      hud.hint(`${r.engine.name}, a ${c.name}, has been delivered to the shed.`, 5000);
      hud.refresh();
    },
    overhaul(engineId) {
      const r = sim.overhaul(engineId);
      if (!r.ok) { hud.hint(r.reason || 'nothing to put right'); Audio.play('error'); return; }
      Audio.play('build_track');
      hud.hint(`Overhauled for ${r.paid} crowns. She is as she was.`, 4000);
      const e = sim.engineById(engineId);
      if (e) hud.showEngine(e);
      hud.refresh();
    },
    borrow(lender) {
      const cap = sim.borrowingPower(lender);
      const r = sim.borrow(lender, cap);
      if (!r.ok) { hud.hint(r.reason || 'they will not lend'); Audio.play('error'); return; }
      Audio.play('build_works');
      hud.hint(`${sim.debts.length === 1 ? 'A debt' : 'Another debt'}: `
        + `${r.debt.principal} crowns from ${LENDERS[lender].name}.`, 5000);
      hud.refresh();
    },
    repay(debtId) {
      // pay down as much as can be spared without going under
      const spare = Math.max(0, sim.treasury - 40);
      const r = sim.repay(debtId, spare);
      if (!r.ok) { hud.hint(r.reason || 'nothing to pay it with'); Audio.play('error'); return; }
      Audio.play('build_track');
      hud.hint(`${r.paid} crowns paid off the debt.`, 4000);
      hud.refresh();
    },
    toggleRide() {
      if (controls.following) { controls.follow(null); }
      else if (selectedEngine !== null) controls.follow(() => w3.enginePos(selectedEngine));
      const e = sim.engineById(selectedEngine);
      if (e) hud.showEngine(e);
    },
    whistle() { Audio.play('whistle'); },
    openEngineLine() {
      const e = sim.engineById(selectedEngine);
      if (!e || e.lineId === null) return;
      selectedLine = e.lineId;
      hud.setSelectedLine(e.lineId);
      w3.showOverlay(sim.lines.find((l) => l.id === e.lineId) || null);
    },
    selectEngine(id) { selectEngine(id); },
    takeCommission(id) {
      const r = sim.comm.accept(sim, id);
      if (r.ok) { Audio.play('charter'); hud.refreshCommissions(); hud.refreshTop(); }
    },
    dropCommission(id) {
      sim.comm.decline(sim, id);
      Audio.play('ui_click');
      hud.refreshCommissions();
      hud.refreshTop();
    },
    doubleTrack(linkId) {
      const r = sim.doubleTrack(linkId);
      if (!r.ok) { hud.hint(r.reason || 'cannot double that section'); Audio.play('error'); return; }
      Audio.play('build_works');
      hud.refresh();
    },
    stationWorks(siteId) {
      const r = sim.stationWorks(siteId);
      if (!r.ok) { hud.hint(r.reason || 'cannot enlarge that station'); Audio.play('error'); return; }
      Audio.play('build_works');
      const st = sim.byId.get(siteId);
      if (st) hud.showSite(st);
      hud.refresh();
    },
    regradeLine(lineId) {
      const line = sim.lines.find((l) => l.id === lineId);
      if (!line) return;
      const ids = [...new Set(sim.lineLinks(line) || [])];
      let any = false, last = null;
      for (const id of ids) { const r = sim.regrade(id); if (r.ok) any = true; else last = r; }
      if (!any) { hud.hint(last?.reason || 'nothing left to ease'); Audio.play('error'); return; }
      Audio.play('build_track');
      hud.refresh();
    },
    fortifyLine(lineId) {
      const line = sim.lines.find((l) => l.id === lineId);
      if (!line) return;
      const ids = [...new Set(sim.lineLinks(line) || [])];
      let any = false, last = null;
      for (const id of ids) { const r = sim.fortify(id); if (r.ok) any = true; else last = r; }
      if (!any) { hud.hint(last?.reason || 'already fortified'); Audio.play('error'); return; }
      Audio.play('build_works');
      hud.refresh();
    },
    setSpeed(v) { setSpeed(v); },
    toggleMute() { Audio.setMuted(!Audio.muted); hud.setMuted(Audio.muted); },
    restart() { location.reload(); },
  });

  /** Select an engine: show its card, ring it, and follow it. */
  function selectEngine(id) {
    const eng = sim.engineById(id);
    if (!eng) return;
    // Drop any settlement/survey selection, then take up the engine. This used to
    // have clearSelection() inlined into the middle of it, which set selectedEngine
    // to the id and then immediately back to null — so the camera rode a train that
    // the rest of the code believed was not selected, and neither Escape nor the
    // ride toggle could get off it.
    selected = null; survey = null;
    w3.setSelected(null);
    w3.showPreview(null);
    selectedEngine = id;
    w3.setSelectedEngine(id);
    controls.follow(() => w3.enginePos(id));
    Audio.play('whistle', { gain: 0.55 });
    hud.showEngine(eng);
  }

  /** End a ride and let go of the engine. */
  function stopRiding() {
    if (selectedEngine === null && !controls.following) return;
    selectedEngine = null;
    w3.setSelectedEngine(null);
    controls.follow(null);
  }


  function clearSelection() {
    selected = null; survey = null;
    w3.setSelected(null);
    w3.showPreview(null);
    hud.hideInspector();
    // A ride has to end when the player's attention moves on. Without this, clicking
    // a settlement or hitting Escape left the camera welded to a train whose card was
    // no longer even on screen.
    stopRiding();
  }

  function setSpeed(v) {
    speed = v;
    hud.setSpeedButtons(v);
    Audio.setScene({ speed: v });
  }

  // ── the loop
  let last = performance.now();
  let acc = 0, netAcc = 0, lastTreasury = sim.treasury, lastWeek = sim.week;

  function tick(now) {
    const dtReal = clamp((now - last) / 1000, 0, 0.12);
    last = now;

    controls.update(dtReal);
    sceneApi.env.focus.copy(controls.target);
    sceneApi.env.focusRadius = controls.shadowRadius();
    sceneApi.env.camDist = controls.dist;
    sceneApi.env.ashLevel = clamp(sim.shadow / 100, 0, 1) * 0.8;
    sceneApi.update(dtReal);

    // simulation runs on its own clock, paused when a modal is up
    const paused = speed === 0 || hud.modalOpen || sim.over;
    const dtSim = paused ? 0 : dtReal * speed;
    if (dtSim > 0) sim.step(dtSim);

    w3.update(dtReal, sceneApi.env, paused ? 0 : speed, sceneApi.camera);
    sceneApi.render();

    // ── ui at a lower rate
    acc += dtReal;
    if (acc > 0.28) {
      acc = 0;
      if (sim.week !== lastWeek) {
        sim.lastNet = Math.round((sim.treasury - lastTreasury) / Math.max(1, sim.week - lastWeek));
        lastTreasury = sim.treasury;
        lastWeek = sim.week;
      }
      hud.refreshTop();
      hud.refreshLog();
      hud.refreshFleet();
      if (Math.random() < 0.34) hud.refresh();

      const regId = world.regionAt(controls.target.x, controls.target.z);
      hud.showRegion(regId);
      const reg = REGION_NAME[regId] || '';
      Audio.setScene({
        age: sim.age,
        region: regionKey(reg),
        unrest: clamp(1 - sim.concordAvg() / 100, 0, 1),
        night: sceneApi.env.night,
      });

      if (sim.charterOffer && !hud.modalOpen && !hud.charterDeferred) hud.showCharters(sim.charterOffer);
      else if (sim.pendingPetition && !hud.modalOpen) hud.showPetition(sim.pendingPetition);
      else if (sim.over && !hud.modalOpen) hud.showEnding(sim.over);
    }
    requestAnimationFrame(tick);
  }

  const REGION_KEY = {
    'the Greenhollow': 'GREENHOLLOW', 'the Frostmarch': 'FROSTMARCH', 'Mirkholt': 'MIRKHOLT',
    'the Sundering Peaks': 'PEAKS', 'the Weeping Marsh': 'WEEPING', 'the Ashenreach': 'ASHENREACH',
    'the Marchlands': 'MARCHLANDS', 'Elderwood': 'ELDERWOOD', 'the Grey Quays': 'QUAYS',
    'the Barrowdowns': 'BARROWDOWNS', 'Wodenholt': 'WODENHOLT',
  };
  const regionKey = (n) => REGION_KEY[n] || 'MARCHLANDS';

  // keyboard
  addEventListener('keydown', (e) => {
    // Typing is typing. Without this, renaming a service fired every hotkey the
    // name contained — Space paused the game, L opened the Ledger — and the space
    // bar could not be typed into the field at all.
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.code === 'Space') { setSpeed(speed === 0 ? 1 : 0); }
    else if (e.code === 'Digit1') setSpeed(1);
    else if (e.code === 'Digit2') setSpeed(2);
    else if (e.code === 'Digit3') setSpeed(4);
    else if (e.code === 'Escape') { clearSelection(); hud.dismissModal(); }
    else if (e.code === 'KeyL') $('ledgerBtn').click();
    else if (e.code === 'KeyC') $('commBtn').click();
    else if (e.code === 'KeyF' && selectedEngine !== null) hud && G && controls.follow(
      controls.following ? null : () => w3.enginePos(selectedEngine));
  });

  // debug / test surface
  window.PW = {
    world, sim, gfx: w3, scene: sceneApi, controls, hud, THREE,
    step: (s) => sim.step(s),
    fastForward(weeks) {
      const target = sim.t + weeks * 90;
      while (sim.t < target && !sim.over) sim.step(2);
      hud.refresh();
      return sim.snapshot();
    },
    snapshot: () => sim.snapshot(),
    setSpeed,
    survey: (a, b) => sim.survey(a, b),
    seedNew: (s) => { location.search = `?seed=${encodeURIComponent(s)}`; },
  };

  G = { world, sim, sceneApi, w3, hud, controls };

  boot.set(100, 'ready');
  await frame();
  $('boot').hidden = true;
  hud.refresh();
  hud.setSpeedButtons(1);
  requestAnimationFrame(tick);

  hud.hint('Click a settlement, then another, to survey a line between them.', 7000);
  return G;
}

/**
 * Yield to the browser so the loading bar can paint between build phases.
 *
 * Races requestAnimationFrame against a timer on purpose: rAF does not fire in a
 * background tab, and it does not fire at all in some headless environments, so
 * awaiting it alone means the game hangs forever on a blank loading screen
 * instead of simply booting without animating the bar.
 */
const frame = () => new Promise((resolve) => {
  let done = false;
  const fin = () => { if (!done) { done = true; resolve(); } };
  requestAnimationFrame(() => setTimeout(fin, 0));
  setTimeout(fin, 60);
});

// ---------------------------------------------------------------------------
// title screen
// ---------------------------------------------------------------------------

function init() {
  const params = new URLSearchParams(location.search);
  const urlSeed = params.get('seed');
  const seedInput = $('seedInput');
  seedInput.value = urlSeed || REALM_NAMES[Math.floor(Math.random() * REALM_NAMES.length)];

  $('boot').hidden = true;
  $('title').hidden = false;

  $('reroll').addEventListener('click', () => {
    seedInput.value = REALM_NAMES[Math.floor(Math.random() * REALM_NAMES.length)]
      + (Math.random() < 0.5 ? '' : String(Math.floor(Math.random() * 90) + 10));
  });

  const go = () => {
    $('title').hidden = true;
    $('boot').hidden = false;
    $('hud').hidden = false;
    Audio.init();
    Audio.setScene({ age: 1, region: 'GREENHOLLOW', unrest: 0.2, night: 0, speed: 1 });
    startGame(seedInput.value.trim() || 'eardon').catch((err) => {
      console.error(err);
      $('boot').querySelector('.boot-status').textContent = `failed: ${err.message}`;
      $('boot').querySelector('.boot-status').style.color = '#e08a6a';
    });
  };
  $('begin').addEventListener('click', go);
  seedInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });

  // skip the title if a seed was given in the URL
  if (params.get('play') === '1') go();
}

if (document.readyState === 'loading') addEventListener('DOMContentLoaded', init);
else init();
