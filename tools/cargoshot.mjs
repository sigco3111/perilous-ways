// Does a train visibly carry what its line actually hauls?
//
// Every train used to be built from a hardcoded grain/ore/brake consist, so the
// most alive thing on screen was carrying a fiction. This proves the wagons now
// follow line.stats.byGood, and photographs one so it can be judged by eye.
//
//   node tools/cargoshot.mjs [seed] [weeks]

import { launch } from './chrome.mjs';
import { growNetwork } from './_netgrow.mjs';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SEED = process.argv[2] || 'thrain';
const WEEKS = +(process.argv[3] || 26);
const OUT = resolve(ROOT, 'shots/cargo');
mkdirSync(OUT, { recursive: true });
const PORT = 8596;

const server = spawn('python', ['-m', 'http.server', String(PORT), '-d', ROOT], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 900));

const browser = await launch();
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 850 });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });

await page.goto(`http://localhost:${PORT}/index.html?seed=${encodeURIComponent(SEED)}`,
  { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForFunction(() => !document.getElementById('title').hidden, { timeout: 30000 });
await page.evaluate(() => document.getElementById('begin').click());
await page.waitForFunction(() => !!window.PW, { timeout: 90000 });

// This is a RENDERING test, so buy the network outright rather than let the harness
// starve at two links: what is under test is whether wagons follow cargo, not
// whether the economy affords track. Grant funds and every capability.
await page.evaluate(() => {
  const { sim } = window.PW;
  sim.treasury = 900000;
  for (const k of Object.keys(sim.can)) sim.can[k] = true;
  sim.stock.cars = 4;
  sim.stock.engines = 10;
});
for (const l of await growNetwork(page, 10)) console.log('  ' + l);
// split the single snake into one service per link: a destroyed link then severs
// only its own service instead of every line in the report
await page.evaluate(() => {
  const { sim } = window.PW;
  for (const l of [...sim.lines]) sim.lines.splice(sim.lines.indexOf(l), 1);
  for (const e of sim.engines) e.lineId = null;
  for (const L of sim.links) {
    if (L.destroyed) continue;
    const cr = sim.createLine([L.a, L.b], 'mixed');
    if (cr.ok && sim.enginesFree() > 0) sim.setLineTrains(cr.line.id, 1);
  }
});
await page.evaluate((w) => window.PW.fastForward(w), WEEKS);
// diagnostics: a line with no links gets no vehicle, which looks like a render bug
console.log('\n' + await page.evaluate(() => {
  const { sim } = window.PW;
  return sim.lines.map((l) => `line ${l.id}: links=${(sim.lineLinks(l) || []).length}`
    + ` stops=${l.stops.length} engines=${sim.enginesOf(l.id).length}`).join('\n');
}));
// let syncVehicles run against the new stats
for (let i = 0; i < 10; i++) await page.screenshot({ type: 'jpeg', quality: 30 });

// what each line hauled, and what its train is actually made of
const report = await page.evaluate(() => {
  const { sim, gfx } = window.PW;
  const out = [];
  for (const line of sim.lines) {
    const st = line.stats || {};
    const mix = Object.entries(st.byGood || {})
      .filter(([, v]) => v > 0.02).sort((a, b) => b[1] - a[1])
      .map(([g, v]) => `${g} ${v.toFixed(1)}`);
    const vs = (gfx.debugVehicles?.() || []).filter((v) => v.lineId === line.id);
    out.push({
      line: line.id, policy: line.policy,
      loads: Math.round(st.loads || 0), pax: Math.round(st.pax || 0),
      hauled: mix, consists: vs.map((v) => v.cars && v.cars.join('+')),
    });
  }
  return out;
});
for (const r of report) {
  console.log(`\nline ${r.line} [${r.policy}] loads=${r.loads} pax=${r.pax}`);
  console.log(`   hauled : ${r.hauled.join(', ') || '(nothing yet)'}`);
  console.log(`   consist: ${r.consists.filter(Boolean).join('   |   ') || '(no vehicle)'}`);
}

// A petition or charter card will happily sit over the top of the thing under test.
await page.evaluate(() => {
  window.PW.hud.closeModal?.();
  for (const b of document.querySelectorAll('button')) {
    if (/leave it on the table|proceed as surveyed|close/i.test(b.textContent || '')) { b.click(); break; }
  }
});
// hide the side panels too — this shot is about the train, not the chrome
await page.evaluate(() => {
  for (const id of ['orders', 'fleet', 'concord', 'register'])
    { const e = document.getElementById(id); if (e) e.style.opacity = '0'; }
});

// photograph the busiest train up close
await page.evaluate(() => {
  const { sim, gfx, controls } = window.PW;
  let best = null;
  for (const e of sim.engines) {
    if (e.lineId === null) continue;
    const l = sim.lines.find((x) => x.id === e.lineId);
    const v = (l && l.stats && l.stats.loads) || 0;
    if (!best || v > best.v) best = { id: e.id, v };
  }
  if (!best) return;
  const p = gfx.enginePos(best.id);
  if (p) controls.focusOn(p.x, p.z, 42);
});
for (let i = 0; i < 12; i++) await page.screenshot({ type: 'jpeg', quality: 30 });
await page.screenshot({ path: resolve(OUT, `${SEED}-train.png`) });
console.log(`\nwrote shots/cargo/${SEED}-train.png`);
console.log(errs.length ? `PAGE ERRORS:\n  ${[...new Set(errs)].slice(0, 5).join('\n  ')}` : 'no page errors');

await browser.close();
server.kill();
