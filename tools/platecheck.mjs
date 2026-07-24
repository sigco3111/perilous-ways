// Proofs the plates. An engraving lives or dies on whether the hatching reads at
// the size it is actually printed, so every plate is shot twice: at report width
// and at the width of the Register column.
//
//   node tools/platecheck.mjs            all sixteen, both widths
//   node tools/platecheck.mjs dragon     one plate only, larger

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './chrome.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = join(ROOT, 'shots', 'plates');
mkdirSync(OUT, { recursive: true });
const PORT = 8598;
const ONLY = process.argv[2] || '';

const server = spawn('python', ['-m', 'http.server', String(PORT), '-d', ROOT], { stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(1200);

const browser = await launch();
const page = await browser.newPage();
await page.setViewport({ width: 1360, height: 1000, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 240)));
page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 200)); });

await page.goto(`http://localhost:${PORT}/test/plates.html`, { waitUntil: 'networkidle2' });
await page.waitForFunction(() => window.PLATES_READY === true, { timeout: 20000 });
await wait(500);

const ids = await page.evaluate(() => window.PLATE_IDS);
const count = await page.evaluate(() => window.PLATE_COUNT);
const bytes = await page.evaluate(() => window.PLATE_BYTES);
console.log(`${count} plates, ${bytes} bytes of SVG (${(bytes / count).toFixed(0)} avg)`);

// every plate must have produced an <svg> with something in it
const empty = await page.evaluate(() => window.PLATE_IDS.filter((id) => {
  const f = document.getElementById(id);
  const svg = f && f.querySelector('svg');
  return !svg || svg.querySelectorAll('path,rect,circle,ellipse,text,g').length < 6;
}));
console.log(empty.length ? `EMPTY: ${empty.join(', ')}` : 'all sixteen drew something');

const shotEl = async (name, sel, pad = 2) => {
  const box = await page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + window.scrollX, y: r.y + window.scrollY, width: r.width, height: r.height };
  }, sel);
  if (!box) { console.log(`  (no ${sel})`); return; }
  await page.screenshot({
    path: join(OUT, `${name}.png`),
    captureBeyondViewport: true,
    clip: { x: box.x - pad, y: box.y - pad, width: box.width + pad * 2, height: box.height + pad * 2 },
  });
  console.log('  ' + name);
};

const list = ONLY ? ids.filter((i) => i === ONLY) : ids;
if (!list.length) { console.log(`no such plate: ${ONLY}`); }

// contact sheets first, at 1:1: everything at once, which is how the set will be
// judged, and the register column, which is the hardest test of the hatching
if (!ONLY) {
  for (let i = 0; i < 4; i++) {
    const sel = `#${ids[i * 4]}`;
    const box = await page.evaluate((s, last) => {
      const a = document.querySelector(s).getBoundingClientRect();
      const b = document.querySelector(last).getBoundingClientRect();
      return { x: a.x + window.scrollX - 4, y: a.y + window.scrollY - 4, w: a.width + 8, h: b.bottom - a.top + 8 };
    }, sel, `#${ids[i * 4 + 3]}`);
    await page.screenshot({
      path: join(OUT, `sheet-wide-${i + 1}.png`),
      captureBeyondViewport: true,
      clip: { x: box.x, y: box.y, width: box.w, height: box.h },
    });
    console.log(`  sheet-wide-${i + 1}`);
  }
  await shotEl('sheet-register', '#reg', 4);
  await shotEl('sheet-narrow', '#small', 4);
}

// then one file per plate, at twice the resolution, for looking closely
await page.setViewport({ width: 1360, height: 1000, deviceScaleFactor: 2 });
await wait(300);
for (const id of list) {
  await shotEl(`w-${id}`, `#${id}`, 3);
  await shotEl(`i-${id}`, `#i-${id}`, 3);
}

await browser.close();
server.kill();
console.log(`\nshots in ${OUT}`);
