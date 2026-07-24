// Renders the opening view at several fog densities so the value is chosen by
// looking rather than by taste.
//
// The close-up shot (shots/04) shows vivid green downs. The opening shot
// (shots/02) shows the same ground as olive-tan. The difference is entirely
// FogExp2(0xe6c8a2, 0.0016) — a warm tan fog dense enough to tint the whole
// frame at the default camera distance instead of just softening the horizon.
//
//   node tools/fogtest.mjs

import { launch } from './chrome.mjs';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = resolve(ROOT, 'shots/fog');
mkdirSync(OUT, { recursive: true });
const PORT = 8594;

const server = spawn('python', ['-m', 'http.server', String(PORT), '-d', ROOT], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 900));

const browser = await launch();
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 800 });
await page.goto(`http://localhost:${PORT}/index.html?seed=eardon`, { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForFunction(() => !document.getElementById('title').hidden, { timeout: 30000 });
await page.evaluate(() => document.getElementById('begin').click());
await page.waitForFunction(() => !!window.PW, { timeout: 90000 });

// hide the chrome so the comparison is only about the world
await page.evaluate(() => {
  for (const id of ['orders', 'fleet', 'concord', 'register', 'topbar', 'hint'])
    { const e = document.getElementById(id); if (e) e.style.opacity = '0'; }
});

const CASES = [
  { name: 'a-current-0016-tan', d: 0.0016, c: 0xe6c8a2 },
  { name: 'b-half-0008-tan', d: 0.0008, c: 0xe6c8a2 },
  { name: 'c-quarter-0004-tan', d: 0.0004, c: 0xe6c8a2 },
  { name: 'd-quarter-0004-pale', d: 0.0004, c: 0xdcd9c8 },
  { name: 'e-eighth-0002-pale', d: 0.0002, c: 0xdcd9c8 },
  { name: 'f-none', d: 0.00001, c: 0xdcd9c8 },
];

for (const cs of CASES) {
  await page.evaluate(({ d, c }) => {
    const sc = window.PW.scene;
    // the scene keeps its own fog target and re-derives density per frame, so set
    // both the object and the base the day-curve interpolates from
    sc.scene.fog.density = d;
    sc.scene.fog.color.setHex(c);
    if (sc.env) { sc.env.fogDensity = d; sc.env.fogBase = d; }
    window.__fogLock = { d, c };
  }, cs);
  // the render loop may recompute fog; pin it right before the shot
  await page.evaluate(() => {
    const sc = window.PW.scene;
    const f = window.__fogLock;
    sc.scene.fog.density = f.d; sc.scene.fog.color.setHex(f.c);
    sc.render();
  });
  await page.screenshot({ path: resolve(OUT, cs.name + '.png') });
  console.log('wrote ' + cs.name + '  density=' + cs.d);
}

await browser.close();
server.kill();
