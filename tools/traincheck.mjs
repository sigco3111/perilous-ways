// Drives the train interaction the way a player would: find a moving train on
// screen, click it, read its card, ride with it, whistle, and confirm it stops at
// stations and accumulates a service record.
//
//   node tools/traincheck.mjs

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './chrome.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SHOTS = join(ROOT, 'shots', 'trains');
mkdirSync(SHOTS, { recursive: true });
const PORT = 8601;
const server = spawn('python', ['-m', 'http.server', String(PORT), '-d', ROOT], { stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(1100);

let fails = 0, passes = 0;
const check = (label, ok, detail = '') => {
  if (ok) { passes++; console.log(`  ok   ${label}${detail ? '  — ' + detail : ''}`); }
  else { fails++; console.log(`  FAIL ${label}${detail ? '  — ' + detail : ''}`); }
};

const browser = await launch();
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

await page.goto(`http://localhost:${PORT}/index.html?seed=eardon`, { waitUntil: 'networkidle2' });
await page.waitForFunction(() => !document.getElementById('title').hidden, { timeout: 20000 });
await page.evaluate(() => document.getElementById('begin').click());
await page.waitForFunction(() => !!window.PW, { timeout: 60000 });
await wait(1200);
console.log('\n=== train check ===\n');

// build a line long enough that a train is visibly running on it
const setup = await page.evaluate(() => {
  const s = window.PW.sim;
  s.treasury = 9000;
  s.can = { bridge: true, span: true, causeway: true, tunnel: true };
  const a = s.sites.find((x) => x.kind === 'shire');
  let cur = a;
  const stops = [a.id];
  for (let i = 0; i < 3; i++) {
    const near = s.sites.filter((b) => b.id !== cur.id && !s.linkBetween(cur.id, b.id))
      .sort((p, q) => Math.hypot(p.x - cur.x, p.z - cur.z) - Math.hypot(q.x - cur.x, q.z - cur.z));
    let moved = false;
    for (const b of near.slice(0, 5)) {
      const sv = s.survey(cur.id, b.id);
      if (sv.ok && s.build(sv).ok) { cur = b; stops.push(b.id); moved = true; break; }
    }
    if (!moved) break;
  }
  const r = s.createLine(stops, 'mixed');
  s.setLineTrains(r.line.id, 2);
  return { stops: stops.length, engines: s.engines.map((e) => `${e.name}(${e.lineId ?? 'shed'})`) };
});
check('a line with several calls exists', setup.stops >= 3, `${setup.stops} calls`);
check('engines are named individuals', setup.engines.length > 0, setup.engines.join(', '));

await wait(2500);

// the vehicles on screen correspond to the roster
const veh = await page.evaluate(() => {
  const s = window.PW.sim;
  const assigned = s.engines.filter((e) => e.lineId !== null);
  const on = assigned.map((e) => !!window.PW.gfx.enginePos(e.id));
  return { assigned: assigned.length, placed: on.filter(Boolean).length };
});
check('one vehicle per assigned engine', veh.placed === veh.assigned && veh.assigned > 0,
  `${veh.placed}/${veh.assigned} on the map`);

// Pause before aiming: a train at 30 units a second moves between computing a
// screen coordinate and the click landing, which would test the harness rather
// than the game.
await page.evaluate(() => window.PW.setSpeed(0));
// Look at the train first. It may be anywhere on a 1120-unit map, and clicking a
// screen coordinate that is off the edge of the canvas tests nothing.
await page.evaluate(() => {
  const s = window.PW.sim;
  const eng = s.engines.find((e) => e.lineId !== null);
  const p = window.PW.gfx.enginePos(eng.id);
  if (p) window.PW.controls.focusOn(p.x, p.z, 170);
});
await wait(2200);
const clicked = await page.evaluate(() => {
  const s = window.PW.sim;
  const eng = s.engines.find((e) => e.lineId !== null);
  const p = window.PW.gfx.enginePos(eng.id);
  if (!p) return { ok: false };
  const cam = window.PW.scene.camera;
  const v = p.clone().project(cam);
  const rect = document.getElementById('view').getBoundingClientRect();
  const sx = (v.x * 0.5 + 0.5) * rect.width;
  const sy = (-v.y * 0.5 + 0.5) * rect.height;
  if (sx < 8 || sy < 8 || sx > rect.width - 8 || sy > rect.height - 8) {
    return { ok: false, why: `off screen at ${Math.round(sx)},${Math.round(sy)}` };
  }
  return {
    ok: true, name: eng.name,
    x: Math.round(sx), y: Math.round(sy),
  };
});
check('a train can be located on screen', clicked.ok, clicked.name || clicked.why || '');
if (clicked.ok) {
  await page.mouse.click(clicked.x, clicked.y);
  await wait(900);
}

const card = await page.evaluate(() => {
  const el = document.getElementById('inspector');
  return {
    open: !el.hidden,
    text: (el.textContent || '').replace(/\s+/g, ' ').slice(0, 150),
    hasRide: !!el.querySelector('[data-eng="ride"]'),
    hasWhistle: !!el.querySelector('[data-eng="whistle"]'),
    following: window.PW.controls.following,
  };
});
check('clicking a train opens its card', card.open && /engine no\./.test(card.text), card.text.slice(0, 90));
check('the card offers a ride and a whistle', card.hasRide && card.hasWhistle);
check('selecting a train starts following it', card.following === true);
await page.screenshot({ path: join(SHOTS, 't1-card-riding.png') });

// the camera actually tracks it
await page.evaluate(() => window.PW.setSpeed(2));
const tracked = await page.evaluate(async () => {
  const a = window.PW.controls.target.clone();
  await new Promise((r) => setTimeout(r, 2200));
  const b = window.PW.controls.target.clone();
  return a.distanceTo(b);
});
check('the camera moves with the train', tracked > 12, `${tracked.toFixed(0)} units in 2.2s`);
await page.screenshot({ path: join(SHOTS, 't2-riding-along.png') });

// whistle button does not throw
const whistled = await page.evaluate(() => {
  const b = document.querySelector('[data-eng="whistle"]');
  if (!b) return false;
  b.click();
  return true;
});
check('the whistle button works', whistled);

// trains stop at stations and the record grows
const record = await page.evaluate(async () => {
  const s = window.PW.sim;
  const eng = s.engines.find((e) => e.lineId !== null);
  const d0 = eng.dist;
  let sawDwell = false;
  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 100));
    const v = window.PW.gfx.vehicleFor(eng.id);
    if (v && v.dwell > 0) sawDwell = true;
  }
  return { ran: eng.dist - d0, sawDwell, trips: eng.trips };
});
check('the engine accumulates distance run', record.ran > 40, `${Math.round(record.ran)} units`);
check('trains dwell at their calls', record.sawDwell);

// riding can be turned off
const stopped = await page.evaluate(() => {
  const b = document.querySelector('[data-eng="ride"]');
  if (b) b.click();
  return window.PW.controls.following;
});
check('riding can be stopped', stopped === false);

// engines in the shed are listed and clickable
const shed = await page.evaluate(() => {
  window.PW.hud.refreshFleet();
  const chips = [...document.querySelectorAll('[data-eng-id]')];
  if (!chips.length) return { chips: 0 };
  chips[0].click();
  return { chips: chips.length, open: !document.getElementById('inspector').hidden };
});
check('idle engines are listed in the shed', shed.chips > 0, `${shed.chips} idle`);
check('clicking a shed engine opens its card', shed.open !== false);
await page.screenshot({ path: join(SHOTS, 't3-shed.png') });

check('no console errors', errs.length === 0, errs.slice(0, 2).join(' | '));
console.log(`\n=== ${passes} passed, ${fails} failed ===\n`);
await browser.close();
server.kill();
process.exit(fails ? 1 : 0);
