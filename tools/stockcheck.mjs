// Can the player SEE and MODIFY the engines and rolling stock?
//
// The last round added locomotive classes with real statistics, and the player
// replied that they thought they could modify and see the engines and rolling stock.
// They were right that they could not: the stats were a table of numbers in a
// collapsed panel, there was no picture of anything, and the wagon count was one
// global number. This drives the real UI and asserts the drawings and the controls
// are actually there.
//
//   node tools/stockcheck.mjs [seed]

import { launch } from './chrome.mjs';
import { growNetwork } from './_netgrow.mjs';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SEED = process.argv[2] || 'thrain';
const OUT = resolve(ROOT, 'shots/stock');
mkdirSync(OUT, { recursive: true });
const PORT = 8598;

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ok    ${name}${extra ? '  ' + extra : ''}`); }
  else { fail++; console.log(`  FAIL  ${name}${extra ? '  ' + extra : ''}`); }
};

const server = spawn('python', ['-m', 'http.server', String(PORT), '-d', ROOT], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 900));
const browser = await launch();
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 900 });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });

await page.goto(`http://localhost:${PORT}/index.html?seed=${SEED}`, { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForFunction(() => !document.getElementById('title').hidden, { timeout: 30000 });
await page.evaluate(() => document.getElementById('begin').click());
await page.waitForFunction(() => !!window.PW, { timeout: 90000 });

await page.evaluate(() => {
  const { sim } = window.PW;
  sim.treasury = 40000;
  for (const k of Object.keys(sim.can)) sim.can[k] = true;
  sim.stock.cars = 5;
});
for (const l of await growNetwork(page, 4)) console.log('  · ' + l);
await page.evaluate(() => window.PW.fastForward(6));
await page.screenshot({ type: 'jpeg', quality: 30 });
await page.evaluate(() => window.PW.hud.refresh());

console.log('\nSEEING the engines:');
// open the engine works
const works = await page.evaluate(() => {
  const d = document.querySelector('details.works');
  if (!d) return null;
  d.open = true;
  return {
    classes: d.querySelectorAll('.engBuy').length,
    drawings: d.querySelectorAll('.engBuy .drawing svg.loco').length,
    buyable: [...d.querySelectorAll('[data-buy-eng]')].filter((b) => !b.disabled).length,
    names: [...d.querySelectorAll('.engBuy .nm')].map((n) => n.textContent.trim()),
  };
});
ok('the engine works panel exists', !!works);
ok('every class is listed', works && works.classes >= 6, works ? `${works.classes} classes` : '');
ok('every class has a side elevation drawn', works && works.drawings === works.classes,
  works ? `${works.drawings} drawings` : '');
ok('classes are buyable', works && works.buyable >= 3, works ? `${works.buyable} affordable` : '');
if (works) console.log('        ' + works.names.join(' · '));
await page.screenshot({ path: resolve(OUT, `${SEED}-works.png`) });

console.log('\nMODIFYING the fleet:');
const bought = await page.evaluate(() => {
  const before = window.PW.sim.engines.length;
  const btn = document.querySelector('[data-buy-eng="hammerhead"]');
  if (!btn || btn.disabled) return { err: 'hammerhead not offered' };
  btn.click();
  const after = window.PW.sim.engines.length;
  const last = window.PW.sim.engines[after - 1];
  return { before, after, name: last?.name, cls: last?.cls };
});
ok('buying an engine adds it to the roster', bought.after === bought.before + 1,
  bought.err || `${bought.before} -> ${bought.after}: ${bought.name} (${bought.cls})`);
ok('the bought engine is the class asked for', bought.cls === 'hammerhead');

// Put it to work, then look at its card. The consist comes from world3d, which only
// forms a train inside the render loop, so a frame must pass first or this reports
// "no consist yet" for a train that is about to exist.
await page.evaluate(() => {
  const { sim } = window.PW;
  const line = sim.lines[0];
  if (line) sim.setLineTrains(line.id, sim.enginesOf(line.id).length + 1);
});
for (let i = 0; i < 8; i++) await page.screenshot({ type: 'jpeg', quality: 25 });
const card = await page.evaluate(() => {
  const { sim, hud } = window.PW;
  const e = sim.engines[sim.engines.length - 1];
  const line = sim.lines[0];
  if (line) sim.setLineTrains(line.id, sim.enginesOf(line.id).length + 1);
  hud.showEngine(sim.engineById(e.id) || e);
  const el = document.getElementById('inspector');
  return {
    portrait: !!el.querySelector('.engPortrait svg.loco'),
    stock: !!el.querySelector('.stockStrip svg.consist'),
    stockText: el.querySelector('.stockList')?.textContent.trim() || '',
    className: el.querySelector('.engClass .nm')?.textContent.trim() || '',
    condBar: !!el.querySelector('.condBar'),
    overhaul: !!el.querySelector('[data-overhaul]'),
  };
});
console.log('\nSEEING one engine and its train:');
ok('the engine card draws the locomotive', card.portrait);
ok('the card names its class', !!card.className, card.className);
ok('the card shows a condition bar', card.condBar);
ok('the card draws the rolling stock it is pulling', card.stock,
  card.stockText ? `"${card.stockText}"` : '(no consist yet)');
await page.screenshot({ path: resolve(OUT, `${SEED}-engine.png`) });

console.log('\nMODIFYING the rolling stock:');
const rake = await page.evaluate(() => {
  const { sim, hud } = window.PW;
  const line = sim.lines[0];
  // Start BELOW the ceiling, or there is correctly nothing to add: a line defaults
  // to the full rake `stock.cars` allows, so the + is rightly disabled. The first
  // version of this check set stock.cars = 5, left the line at 5, and then reported
  // the feature missing when the button it wanted was legitimately unavailable.
  sim.setLineCars(line.id, 2);
  // setSelectedLine is the only thing that opens the dossier: it sets openLine and
  // re-renders the panel.
  hud.setSelectedLine(line.id);
  const before = sim.lineCars(line);
  const capBefore = sim.lineCapacity(line);
  const btns = [...document.querySelectorAll('[data-cars]')];
  const plus = btns.find((b) => +b.dataset.cars > before && !b.disabled);
  if (!plus) {
    return { err: `no enabled + control (rake ${before} of ${sim.stock.cars})`, before, btns: btns.length };
  }
  plus.click();
  const after = sim.lineCars(line);
  return {
    before, after, capBefore: Math.round(capBefore),
    capAfter: Math.round(sim.lineCapacity(line)),
    art: !!document.querySelector('.rakeArt svg.consist'),
  };
});
ok('the line dossier has a rake control', !rake.err, rake.err || '');
ok('adding a wagon changes the rake', rake.after === rake.before + 1,
  `${rake.before} -> ${rake.after} wagons`);
ok('more wagons means more capacity', rake.capAfter > rake.capBefore,
  `${rake.capBefore} -> ${rake.capAfter} loads/wk`);
ok('the rake is drawn on the dossier', rake.art);
await page.screenshot({ path: resolve(OUT, `${SEED}-rake.png`) });

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
if (errs.length) console.log(`PAGE ERRORS:\n  ${[...new Set(errs)].slice(0, 6).join('\n  ')}`);
await browser.close();
server.kill();
process.exit(fail ? 1 : 0);
