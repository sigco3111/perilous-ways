// Exercises the new operational controls the way a player would: build a line,
// open its dossier, change what it carries, change the fares, reorder its calls,
// add a call, post a warden, split it, and read the ledger. Asserts each one
// actually changed the simulation.
//
//   node tools/agencycheck.mjs

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './chrome.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SHOTS = join(ROOT, 'shots', 'agency');
mkdirSync(SHOTS, { recursive: true });
const PORT = 8596;
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
console.log('\n=== agency check ===\n');

const shot = async (n) => { await page.screenshot({ path: join(SHOTS, `${n}.png`) }); };

// ── build two links through the UI-facing API, choosing the service each time
const built = await page.evaluate(() => {
  const s = window.PW.sim;
  s.treasury = 4000;
  const out = [];
  const a = s.sites.filter((x) => x.kind === 'shire')[0];
  const near = s.sites.filter((b) => b.id !== a.id)
    .sort((p, q) => Math.hypot(p.x - a.x, p.z - a.z) - Math.hypot(q.x - a.x, q.z - a.z));
  for (const b of near.slice(0, 4)) {
    const sv = s.survey(a.id, b.id);
    if (sv.ok && s.build(sv).ok) { out.push([a.id, b.id]); break; }
  }
  return out;
});
check('a link can be built', built.length === 1);

// create a service explicitly, as the build flow now does
const lineId = await page.evaluate(() => {
  const s = window.PW.sim;
  const L = s.links[0];
  const r = s.createLine([L.a, L.b], 'mixed');
  s.setLineTrains(r.line.id, 2);
  window.PW.hud.setSelectedLine(r.line.id);
  return r.line.id;
});
await wait(600);
check('the line dossier opens', await page.evaluate(() => !document.getElementById('linePanel').hidden));
await shot('a1-dossier');

// ── policy
const pol = await page.evaluate(() => {
  const s = window.PW.sim;
  const l = s.lines[0];
  const before = { policy: l.policy, cap: s.lineCapacity(l) };
  document.querySelector('#linePanel [data-policy="freight"]').click();
  return { before, after: { policy: s.lines[0].policy, cap: s.lineCapacity(s.lines[0]) } };
});
check('clicking Freight changes the policy', pol.after.policy === 'freight',
  `${pol.before.policy} -> ${pol.after.policy}`);
check('...and that changes goods capacity', pol.after.cap > pol.before.cap * 1.3,
  `${pol.before.cap.toFixed(0)} -> ${pol.after.cap.toFixed(0)} loads/wk`);

// ── fares
const fare = await page.evaluate(() => {
  document.querySelector('#linePanel [data-fare="2"]').click();
  return window.PW.sim.lines[0].fare;
});
check('clicking Dear changes the fare tier', fare === 2);

// ── engines
const eng = await page.evaluate(() => {
  const before = window.PW.sim.lines[0].trains;
  document.querySelector('#linePanel [data-tr="1"]')?.click();
  return { before, after: window.PW.sim.lines[0].trains };
});
check('the engine stepper works', eng.after === eng.before + 1, `${eng.before} -> ${eng.after}`);

// ── warden
const warden = await page.evaluate(() => {
  const cb = document.querySelector('#linePanel [data-act="warden"]');
  cb.checked = true;
  cb.dispatchEvent(new Event('change', { bubbles: true }));
  return window.PW.sim.lines[0].warden;
});
check('a warden can be posted to the line', warden === true);

// ── add a call by clicking the map (simulated via the same code path)
const added = await page.evaluate(() => {
  const s = window.PW.sim;
  const l = s.lines[0];
  const before = l.stops.length;
  // build a second link off the end, then add it as a call
  const end = l.stops[l.stops.length - 1];
  const cand = s.sites.filter((x) => x.id !== end && !s.linkBetween(end, x.id))
    .sort((p, q) => {
      const e = s.byId.get(end);
      return Math.hypot(p.x - e.x, p.z - e.z) - Math.hypot(q.x - e.x, q.z - e.z);
    });
  for (const c of cand.slice(0, 5)) {
    const sv = s.survey(end, c.id);
    if (sv.ok && s.build(sv).ok) {
      const r = s.addStop(l.id, c.id);
      return { before, after: l.stops.length, ok: r.ok, reason: r.reason, name: c.name };
    }
  }
  return { before, after: l.stops.length, ok: false, reason: 'no link buildable' };
});
check('a settlement can be added as a call', added.ok && added.after === added.before + 1,
  `${added.before} -> ${added.after} calls (${added.name || added.reason})`);

// ── reorder and drop
await page.evaluate(() => window.PW.hud.refreshLinePanel());
await wait(300);
const reorder = await page.evaluate(() => {
  const s = window.PW.sim;
  const l = s.lines[0];
  const before = l.stops.slice();
  const li = document.querySelectorAll('#linePanel .lpStops li')[1];
  li?.querySelector('[data-act="up"]')?.click();
  return { before, after: s.lines[0].stops.slice() };
});
check('calls can be reordered', JSON.stringify(reorder.before) !== JSON.stringify(reorder.after),
  `${reorder.before.join(',')} -> ${reorder.after.join(',')}`);

// ── run the sim so the books close, then read the ledger
await page.evaluate(() => window.PW.fastForward(3));
await page.evaluate(() => document.getElementById('ledgerBtn').click());
await wait(700);
const led = await page.evaluate(() => {
  const el = document.getElementById('ledger');
  return {
    open: !el.hidden,
    hasRows: el.querySelectorAll('.ledTable tr').length,
    hasFlows: el.querySelectorAll('.flowRow').length,
    text: (el.textContent || '').slice(0, 260),
  };
});
check('the ledger opens', led.open);
check('the ledger shows per-service receipts', led.hasRows >= 3, `${led.hasRows} rows`);
await shot('a2-ledger');

// ── per-line accounting is real
const books = await page.evaluate(() => {
  const l = window.PW.sim.lines[0];
  return l.stats;
});
check('a service has measured receipts and upkeep',
  Number.isFinite(books.revenue) && Number.isFinite(books.upkeep) && books.upkeep > 0,
  `receipts ${books.revenue.toFixed(1)}, upkeep ${books.upkeep.toFixed(1)}, busiest ${Math.round((books.worstLoad || 0) * 100)}%`);

// ── shortfall reasons exist and are human.
// Create the condition deliberately rather than hoping for it: a Delve joined
// only to another Delve cannot be fed by anything on its own network, so its
// grain must come back as `no connected source`.
const why = await page.evaluate(() => {
  const s = window.PW.sim;
  s.treasury = 20000;
  s.can = { bridge: true, span: true, causeway: true, tunnel: true };
  const delves = s.sites.filter((x) => x.kind === 'delve');
  let joined = false;
  for (const a of delves) {
    for (const b of delves) {
      if (a.id === b.id || s.linkBetween(a.id, b.id)) continue;
      const sv = s.survey(a.id, b.id);
      if (!sv.ok) continue;
      if (!s.build(sv).ok) continue;
      const r = s.createLine([a.id, b.id], 'freight');
      if (r.ok) s.setLineTrains(r.line.id, 1);
      joined = true;
      break;
    }
    if (joined) break;
  }
  const seen = new Map();
  for (let d = 0; d < 21; d++) {
    s.step(90 / 7);
    for (const st of s.sites) {
      if (!st.connected) continue;
      for (const n of s.needsOf(st)) {
        if (n.why) seen.set(st.name + n.good, `${st.name}: ${n.good} — ${n.why}`);
      }
    }
  }
  return [...seen.values()].slice(0, 6);
});
check('shortfalls carry a stated reason', why.length > 0, why[0] || 'none found');
for (const w of why.slice(0, 4)) console.log(`         ${w}`);

// ── split
const split = await page.evaluate(() => {
  const s = window.PW.sim;
  const l = s.lines[0];
  const before = s.lines.length;
  if (l.stops.length < 3) return { skipped: true };
  const r = s.splitLine(l.id, l.stops[1]);
  return { before, after: s.lines.length, ok: r.ok };
});
check('a service can be split in two', split.skipped || (split.ok && split.after === split.before + 1),
  split.skipped ? 'too few calls to split' : `${split.before} -> ${split.after} services`);

// ── the settlement dossier states reasons
await page.evaluate(() => {
  const s = window.PW.sim;
  const st = s.sites.find((x) => x.connected && s.needsOf(x).some((n) => n.why)) || s.sites[0];
  window.PW.hud.showSite(st);
});
await wait(400);
const insp = await page.evaluate(() => {
  const el = document.getElementById('inspector');
  return { open: !el.hidden, whys: el.querySelectorAll('.nwhy').length, needs: el.querySelectorAll('.need').length };
});
check('the settlement dossier lists needs', insp.open && insp.needs > 0, `${insp.needs} needs, ${insp.whys} with reasons`);
await shot('a3-settlement');

check('no console errors', errs.length === 0, errs.slice(0, 2).join(' | '));

console.log(`\n=== ${passes} passed, ${fails} failed ===\n`);
await browser.close();
server.kill();
process.exit(fails ? 1 : 0);
