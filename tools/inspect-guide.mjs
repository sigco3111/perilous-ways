import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './chrome.mjs';
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = 8597;
const server = spawn('python', ['-m', 'http.server', String(PORT), '-d', ROOT], { stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(1000);
const browser = await launch();
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
await page.goto(`http://localhost:${PORT}/index.html?seed=eardon`, { waitUntil: 'networkidle2' });
await page.waitForFunction(() => !document.getElementById('title').hidden, { timeout: 20000 });
await page.evaluate(() => document.getElementById('begin').click());
await page.waitForFunction(() => !!window.PW, { timeout: 60000 });
await wait(1500);
console.log(await page.evaluate(() => {
  const out = {};
  for (const id of ['leftpanel', 'guide', 'guideBody', 'concordCard', 'linePanel']) {
    const el = document.getElementById(id);
    if (!el) { out[id] = 'missing'; continue; }
    const r = el.getBoundingClientRect();
    const c = getComputedStyle(el);
    out[id] = {
      rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
      position: c.position, left: c.left, right: c.right, width: c.width,
      margin: c.margin, padding: c.padding, transform: c.transform,
      overflow: c.overflow, hidden: el.hidden,
    };
  }
  const gt = document.querySelector('#guideBody .guideText');
  if (gt) { const r = gt.getBoundingClientRect(); out.guideText = [Math.round(r.left), Math.round(r.width)]; }
  return JSON.stringify(out, null, 1);
}));
await browser.close(); server.kill();
