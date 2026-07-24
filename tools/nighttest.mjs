// Renders the same view at several times of day so night legibility is judged by
// looking. Night is ~42% of a 320-second cycle, so a player spends over two
// minutes in five unable to read the map — worth measuring rather than guessing.
//
//   node tools/nighttest.mjs [tag]
//
// Writes shots/night/<tag>-t<time>.png for each sampled time.

import { launch } from './chrome.mjs';
import { growNetwork } from './_netgrow.mjs';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const TAG = process.argv[2] || 'before';
const OUT = resolve(ROOT, 'shots/night');
mkdirSync(OUT, { recursive: true });
const PORT = 8595;

const server = spawn('python', ['-m', 'http.server', String(PORT), '-d', ROOT], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 900));

const browser = await launch();
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
await page.goto(`http://localhost:${PORT}/index.html?seed=eardon`, { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForFunction(() => !document.getElementById('title').hidden, { timeout: 30000 });
await page.evaluate(() => document.getElementById('begin').click());
await page.waitForFunction(() => !!window.PW, { timeout: 90000 });

// build a little network so there are lamps, stations and trains to see by
const built = await growNetwork(page, 4);
for (const l of built) console.log('  ' + l);
await page.evaluate(() => window.PW.fastForward(8));

// mid zoom, over the network — the range the game is actually played at
await page.evaluate(() => {
  const { sim, controls } = window.PW;
  const c = sim.sites.filter((x) => x.connected && !x.abandoned);
  if (c.length) {
    const x = c.reduce((n, s) => n + s.x, 0) / c.length;
    const z = c.reduce((n, s) => n + s.y, 0) / c.length;
    controls.focusOn(x, z, 230);
  }
});

const shots = [];
const TIMES = [0.00, 0.10, 0.18, 0.42, 0.86, 0.94];
for (const t of TIMES) {
  await page.evaluate((tt) => { window.PW.scene.env.time = tt; }, t);
  // several frames so the day curve and any lamp fades settle
  for (let i = 0; i < 8; i++) { await page.screenshot({ type: 'jpeg', quality: 30 }); }
  const name = `${TAG}-t${String(Math.round(t * 100)).padStart(2, '0')}.png`;
  await page.screenshot({ path: resolve(OUT, name) });
  shots.push(resolve(OUT, name));
  console.log(`t=${t.toFixed(2)}  ${name}`);
}

// Mean luminance, measured from the written PNGs. Reading it in-page via
// drawImage(webglCanvas) returns all-zero without preserveDrawingBuffer, which
// reported midday as pitch black — a lying number is worse than none.
console.log('\nmean luminance (0-255), measured from the PNGs:');
for (const p of shots) {
  const png = await sharpless(p);
  console.log('  ' + p.split(/[\\/]/).pop().padEnd(20) + ' ' + png);
}

await browser.close();
server.kill();

/** Mean luminance of a PNG, decoded with zlib only (no image libraries here). */
async function sharpless(file) {
  const { readFileSync } = await import('node:fs');
  const { inflateSync } = await import('node:zlib');
  const buf = readFileSync(file);
  let off = 8, w = 0, h = 0, bd = 0, ct = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bd = data[8]; ct = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (bd !== 8 || (ct !== 6 && ct !== 2)) return 'unsupported png (bd=' + bd + ' ct=' + ct + ')';
  const bpp = ct === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const prev = Buffer.alloc(stride);
  const cur = Buffer.alloc(stride);
  let sum = 0, n = 0, p = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[p++];
    raw.copy(cur, 0, p, p + stride); p += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = cur[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[i] = v & 255;
    }
    // sample every 4th pixel; this is a brightness check, not a measurement rig
    for (let x = 0; x < w; x += 4) {
      const i = x * bpp;
      sum += 0.2126 * cur[i] + 0.7152 * cur[i + 1] + 0.0722 * cur[i + 2];
      n++;
    }
    cur.copy(prev);
  }
  return (sum / Math.max(1, n)).toFixed(1);
}
