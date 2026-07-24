// The improvements are only a money sink if the player can actually reach them.
// Checks each action is present where the diagnosis is, and that clicking it
// changes the simulation.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './chrome.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SHOTS = join(ROOT, 'shots', 'works');
mkdirSync(SHOTS, { recursive: true });
const PORT = 8604;
const server = spawn('python', ['-m', 'http.server', String(PORT), '-d', ROOT], { stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(1100);

let fails = 0, passes = 0;
const check = (l, ok, d = '') => { if (ok) { passes++; console.log(`  ok   ${l}${d ? '  — ' + d : ''}`); } else { fails++; console.log(`  FAIL ${l}${d ? '  — ' + d : ''}`); } };

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
console.log('\n=== works check ===\n');

// a busy network with money to spend
await page.evaluate(() => {
  const s = window.PW.sim;
  s.treasury = 60000;
  s.can = { bridge: true, span: true, causeway: true, tunnel: true };
  s.stock.engines = 10; s.syncFleet();
  const shire = s.sites.find((x) => x.kind === 'shire');
  const chain = [shire];
  let cur = shire;
  for (const b of s.sites.filter((x) => x !== shire).slice(0, 10)) {
    const sv = s.survey(cur.id, b.id);
    if (sv.ok && s.build(sv).ok) { chain.push(b); cur = b; }
    if (chain.length >= 5) break;
  }
  const r = s.createLine(chain.map((c) => c.id), 'freight');
  if (r.ok) s.setLineTrains(r.line.id, 1);
  // force a section to look congested so the ledger offers to double it
  for (const L of s.links) L.load = 0.95, L.hasService = true;
});
await wait(600);

const line = await page.evaluate(() => {
  const s = window.PW.sim;
  window.PW.hud.setSelectedLine(s.lines[0].id);
  return { regrade: !!document.querySelector('[data-regrade]'), fortify: !!document.querySelector('[data-fortify]') };
});
check('the line dossier offers Regrade and Fortify', line.regrade && line.fortify);

const regraded = await page.evaluate(() => {
  const s = window.PW.sim;
  const L = s.links[0];
  const before = L.regrade || 1;
  document.querySelector('[data-regrade]').click();
  return { before, after: s.links[0].regrade || 1 };
});
check('Regrade eases the sections', regraded.after < regraded.before,
  `${regraded.before.toFixed(2)} -> ${regraded.after.toFixed(2)}`);

const fortified = await page.evaluate(() => {
  const s = window.PW.sim;
  const before = s.links[0].peril;
  const btn = document.querySelector('[data-fortify]');
  if (btn) btn.click();
  return { before, after: s.links[0].peril, flag: !!s.links[0].fortified };
});
check('Fortify reduces peril', fortified.flag && fortified.after < fortified.before,
  `${fortified.before.toFixed(2)} -> ${fortified.after.toFixed(2)}`);

const led = await page.evaluate(() => {
  document.getElementById('ledgerBtn').click();
  window.PW.hud.refreshLedger();
  return { btns: document.querySelectorAll('[data-double]').length };
});
check('the Ledger offers to double a section at capacity', led.btns > 0, `${led.btns} offered`);

const doubled = await page.evaluate(() => {
  const s = window.PW.sim;
  const before = s.links.filter((L) => L.doubled).length;
  const b = document.querySelector('[data-double]');
  if (b) b.click();
  return { before, after: s.links.filter((L) => L.doubled).length };
});
check('doubling a section works', doubled.after > doubled.before,
  `${doubled.before} -> ${doubled.after} double-tracked`);
await page.screenshot({ path: join(SHOTS, 'w1-ledger.png') });

const station = await page.evaluate(() => {
  const s = window.PW.sim;
  const st = s.sites.find((x) => x.connected && !x.abandoned);
  window.PW.hud.showSite(st);
  const btn = document.querySelector('[data-station]');
  const before = st.works || 0;
  if (btn) btn.click();
  return { had: !!btn, before, after: st.works || 0, name: st.name };
});
check('the settlement dossier offers station works', station.had, station.name);
check('station works are built', station.after > station.before,
  `works ${station.before} -> ${station.after}`);
await page.screenshot({ path: join(SHOTS, 'w2-station.png') });

check('no console errors', errs.length === 0, errs.slice(0, 2).join(' | '));
console.log(`\n=== ${passes} passed, ${fails} failed ===\n`);
await browser.close(); server.kill();
process.exit(fails ? 1 : 0);
