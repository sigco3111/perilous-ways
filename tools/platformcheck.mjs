// Proves the two things a player asked to SEE actually appear:
//   1. "On the platform" in a settlement dossier — goods waiting, people waiting
//   2. A station standing at every served settlement (props.js art, previously
//      reachable only from test/props.html)
//
//   node tools/platformcheck.mjs [seed]

import { launch } from './chrome.mjs';
import { growNetwork } from './_netgrow.mjs';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SEED = process.argv[2] || 'eardon';
const OUT = resolve(ROOT, 'shots/platform');
mkdirSync(OUT, { recursive: true });
const PORT = 8597;

const server = spawn('python', ['-m', 'http.server', String(PORT), '-d', ROOT], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 900));
const browser = await launch();
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 860 });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });

await page.goto(`http://localhost:${PORT}/index.html?seed=${SEED}`, { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForFunction(() => !document.getElementById('title').hidden, { timeout: 30000 });
await page.evaluate(() => document.getElementById('begin').click());
await page.waitForFunction(() => !!window.PW, { timeout: 90000 });

await page.evaluate(() => {
  const { sim } = window.PW;
  sim.treasury = 900000;
  for (const k of Object.keys(sim.can)) sim.can[k] = true;
  sim.stock.engines = 10; sim.stock.cars = 4;
});
for (const l of await growNetwork(page, 8)) console.log('  ' + l);
await page.evaluate(() => {
  const { sim } = window.PW;
  for (const L of sim.links) {
    if (L.destroyed || sim.lines.some((l) => l.stops.includes(L.a) && l.stops.includes(L.b))) continue;
    const cr = sim.createLine([L.a, L.b], 'mixed');
    if (cr.ok && sim.enginesFree() > 0) sim.setLineTrains(cr.line.id, 1);
  }
});
await page.evaluate(() => window.PW.fastForward(16));
for (let i = 0; i < 10; i++) await page.screenshot({ type: 'jpeg', quality: 30 });

// how many stations got built?
const stations = await page.evaluate(() => {
  const { sim, gfx } = window.PW;
  // count holders, not every named descendant: a station group contains many
  // named parts, so traversing by name overcounts and could hide a real leak
  let named = 0;
  gfx.root.traverse((o) => { if (o.name && /^pw-station/.test(o.name)) named++; });
  const holders = gfx.debugStations ? gfx.debugStations() : null;
  return { named, holders, served: sim.connectedCount() };
});
console.log(`\nstation holders: ${stations.holders}  named nodes: ${stations.named}`
  + `  settlements served: ${stations.served}`);

// open the dossier of the fullest platform and read it back
const dossier = await page.evaluate(() => {
  const { sim, hud, controls } = window.PW;
  let best = null;
  for (const st of sim.sites) {
    if (!st.connected || st.abandoned) continue;
    const w = sim.waitingAt(st);
    if (!best || w.total > best.total) best = { st, total: w.total, w };
  }
  if (!best) return null;
  controls.focusOn(best.st.x, best.st.z, 120);
  hud.showSite(best.st);
  const el = document.getElementById('inspector');
  const pf = el.querySelector('.platform');
  return {
    place: best.st.name,
    waiting: best.w.goods.slice(0, 5).map((g) => `${g.good} ${g.amount.toFixed(1)}`),
    people: Math.round(best.w.people),
    rendered: pf ? pf.textContent.replace(/\s+/g, ' ').trim() : null,
  };
});
console.log('\ndossier for the fullest platform:');
console.log('  place  :', dossier?.place);
console.log('  sim says:', dossier?.waiting.join(', '), '| people', dossier?.people);
console.log('  DOM says:', dossier?.rendered ? dossier.rendered.slice(0, 220) : 'NOT RENDERED');

for (let i = 0; i < 10; i++) await page.screenshot({ type: 'jpeg', quality: 30 });
await page.screenshot({ path: resolve(OUT, `${SEED}-dossier.png`) });

// and a clean look at a station, chrome hidden
await page.evaluate(() => {
  for (const id of ['orders', 'fleet', 'concord', 'register', 'inspector'])
    { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
  const { sim, controls } = window.PW;
  const st = sim.sites.find((x) => x.connected && !x.abandoned && x.tier >= 2)
    || sim.sites.find((x) => x.connected && !x.abandoned);
  if (st) controls.focusOn(st.x, st.z, 78);
});
for (let i = 0; i < 12; i++) await page.screenshot({ type: 'jpeg', quality: 30 });
await page.screenshot({ path: resolve(OUT, `${SEED}-station.png`) });
console.log(`\nwrote shots/platform/${SEED}-dossier.png and -station.png`);
console.log(errs.length ? `PAGE ERRORS:\n  ${[...new Set(errs)].slice(0, 6).join('\n  ')}` : 'no page errors');

await browser.close();
server.kill();
