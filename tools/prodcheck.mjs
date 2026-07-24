// Loads the deployed site in real Chrome, boots a game, plays a few moves, and
// screenshots it. Catches anything that only breaks once the files are served
// from Netlify rather than from a local http.server.
//
//   node tools/prodcheck.mjs [url]

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './chrome.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SHOTS = join(ROOT, 'shots', 'prod');
mkdirSync(SHOTS, { recursive: true });
const URL_BASE = process.argv[2] || 'https://perilous-ways.netlify.app';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await launch();
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });

const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => logs.push(`[reqfail] ${r.url()} :: ${r.failure()?.errorText}`));
page.on('response', (r) => { if (r.status() >= 400) logs.push(`[HTTP ${r.status()}] ${r.url()}`); });

console.log(`\n=== production check: ${URL_BASE} ===\n`);
await page.goto(`${URL_BASE}/?seed=eardon`, { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForFunction(() => !document.getElementById('title').hidden, { timeout: 30000 });
console.log('title screen up');
await page.screenshot({ path: join(SHOTS, 'p1-title.png') });

await page.evaluate(() => document.getElementById('begin').click());
await page.waitForFunction(() => !!window.PW, { timeout: 90000 });
console.log('game booted from production');
await wait(3000);

// play a short game the way a person would: build a chain, put engines on it
const played = await page.evaluate(() => {
  const s = window.PW.sim;
  const out = [];
  s.treasury = 2600;
  let cur = s.sites.filter((x) => x.kind === 'shire')[0];
  for (let i = 0; i < 6 && cur; i++) {
    const near = s.sites.filter((b) => b.id !== cur.id && !s.linkBetween(cur.id, b.id))
      .sort((p, q) => Math.hypot(p.x - cur.x, p.z - cur.z) - Math.hypot(q.x - cur.x, q.z - cur.z));
    let moved = false;
    for (const b of near.slice(0, 5)) {
      const sv = s.survey(cur.id, b.id);
      if (!sv.ok) continue;
      const r = s.build(sv);
      if (r.ok) { out.push(`${cur.name} -> ${b.name} (${Math.round(sv.length)}u, ${sv.price}cr)`); cur = b; moved = true; break; }
    }
    if (!moved) break;
  }
  const stops = [];
  for (const L of s.links) { if (!stops.includes(L.a)) stops.push(L.a); if (!stops.includes(L.b)) stops.push(L.b); }
  s.lines.length = 0;
  const lr = s.createLine(stops.slice(0, 6));
  if (lr.ok) s.setLineTrains(lr.line.id, 3);
  return out;
});
console.log('built:');
for (const l of played) console.log('  ' + l);

const dismiss = async () => page.evaluate(() => {
  const m = document.getElementById('modal');
  if (m && !m.hidden) { const d = m.querySelector('[data-act="defer"]'); if (d) d.click(); else m.hidden = true; }
}).catch(() => {});

await wait(2500);
await dismiss();
await page.screenshot({ path: join(SHOTS, 'p2-network.png') });

// follow a train closely
await page.evaluate(() => {
  const v = window.PW.gfx;
  const s = window.PW.sim;
  const L = s.links[Math.floor(s.links.length / 2)];
  const mid = L.pts[Math.floor(L.pts.length / 2)];
  window.PW.controls.focusOn(mid.x, mid.z, 90);
});
await wait(3200);
await dismiss();
await page.screenshot({ path: join(SHOTS, 'p3-trackside.png') });

// run the realm forward and look at the mature network
const ff = await page.evaluate(() => window.PW.fastForward(20));
console.log('\nafter 20 weeks:', JSON.stringify(ff));
await page.evaluate(() => window.PW.controls.focusOn(-20, 20, 700));
await wait(3200);
await dismiss();
await page.screenshot({ path: join(SHOTS, 'p4-mature.png') });

await page.evaluate(() => { window.PW.scene.env.time = 0.80; });
await wait(2200);
await dismiss();
await page.screenshot({ path: join(SHOTS, 'p5-dusk.png') });

const bad = logs.filter((l) => /pageerror|reqfail|HTTP [45]|\[error\]/.test(l));
console.log(`\nconsole: ${logs.length} messages, ${bad.length} concerning`);
for (const b of bad.slice(0, 20)) console.log('  ' + b.slice(0, 250));
writeFileSync(join(SHOTS, 'console.log'), logs.join('\n'));
console.log(`\nshots in ${SHOTS}`);

await browser.close();
process.exit(bad.length ? 1 : 0);
