// Drives the real game in real Chrome, captures console output and WebGL shader
// errors, plays a few moves, and writes screenshots. This is the only check that
// proves the thing actually renders.
//
//   node tools/visual.mjs [seed]

import puppeteer from 'puppeteer';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SHOTS = join(ROOT, 'shots');
mkdirSync(SHOTS, { recursive: true });
const PORT = 8590;
const SEED = process.argv[2] || 'eardon';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const server = spawn('python', ['-m', 'http.server', String(PORT), '-d', ROOT], { stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(1200);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: [
    '--no-sandbox', '--disable-setuid-sandbox',
    // software GL so this works on a machine with no usable GPU for headless
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--window-size=1600,900', '--hide-scrollbars', '--mute-audio',
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });

const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => logs.push(`[404] ${r.url()}`));

const shot = async (name) => {
  // Dismiss any modal first: a charter offer dims and blurs the whole view, so
  // shooting through one tells you nothing about how the game looks.
  await page.evaluate(() => {
    const m = document.getElementById('modal');
    if (m && !m.hidden) {
      const d = m.querySelector('[data-act="defer"]');
      if (d) d.click(); else m.hidden = true;
    }
  }).catch(() => {});
  await wait(260);
  const p = join(SHOTS, `${name}.png`);
  await page.screenshot({ path: p });
  return p;
};

console.log(`\n=== visual check: seed "${SEED}" ===\n`);

await page.goto(`http://localhost:${PORT}/index.html?seed=${encodeURIComponent(SEED)}`, {
  waitUntil: 'networkidle2', timeout: 45000,
});
// Wait for the title card to actually be on screen. Screenshotting and clicking
// too early catches the loading overlay instead, which looks exactly like a boot
// failure and is not one.
await page.waitForFunction(() => !document.getElementById('title').hidden, { timeout: 20000 });
await wait(500);
await shot('01-title');
console.log('title screen captured');

await page.evaluate(() => document.getElementById('begin').click());

// wait for the game to finish booting
let booted = false;
for (let i = 0; i < 70; i++) {
  await wait(700);
  booted = await page.evaluate(() => !!window.PW);
  if (booted) break;
  const failed = await page.evaluate(() => document.querySelector('.boot-status')?.textContent || '');
  if (/failed/i.test(failed)) { console.log(`BOOT FAILED: ${failed}`); break; }
}
console.log(booted ? 'game booted' : 'game did NOT boot');
if (!booted) {
  console.log('\n--- console ---');
  for (const l of logs) console.log('  ' + l.slice(0, 400));
  const overlay = await page.evaluate(() => {
    const d = [...document.body.children].find((e) => /operational irregularity/.test(e.textContent || ''));
    return d ? d.textContent.slice(0, 900) : null;
  });
  if (overlay) console.log('\n--- on-screen fatal ---\n' + overlay);
  await shot('02-failed');
  writeFileSync(join(SHOTS, 'console.log'), logs.join('\n'));
  await browser.close(); server.kill(); process.exit(1);
}
await wait(2500);
await shot('02-opening-view');

// ── did anything render? sample the canvas for non-background pixels
const pixels = await page.evaluate(() => {
  const c = document.getElementById('view');
  const gl = c.getContext('webgl2') || c.getContext('webgl');
  if (!gl) return { error: 'no webgl context' };
  const w = 160, h = 90;
  const buf = new Uint8Array(w * h * 4);
  // read a downsampled block from the middle of the frame
  gl.readPixels(c.width / 2 - w / 2, c.height / 2 - h / 2, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  let sum = 0, uniq = new Set(), dark = 0;
  for (let i = 0; i < buf.length; i += 4) {
    const k = `${buf[i] >> 4},${buf[i + 1] >> 4},${buf[i + 2] >> 4}`;
    uniq.add(k);
    sum += buf[i] + buf[i + 1] + buf[i + 2];
    if (buf[i] + buf[i + 1] + buf[i + 2] < 24) dark++;
  }
  return {
    meanLuma: Math.round(sum / (buf.length / 4) / 3),
    distinctColours: uniq.size,
    darkFraction: +(dark / (buf.length / 4)).toFixed(3),
    canvas: `${c.width}x${c.height}`,
  };
});
console.log('canvas sample:', JSON.stringify(pixels));

// ── state after boot
const info = await page.evaluate(() => {
  const s = window.PW.sim;
  const r = window.PW.scene.renderer.info;
  return {
    snapshot: window.PW.snapshot(),
    render: { calls: r.render.calls, triangles: r.render.triangles, points: r.render.points },
    memory: { geometries: r.memory.geometries, textures: r.memory.textures },
    programs: window.PW.scene.renderer.info.programs?.length ?? 0,
    labels: document.querySelectorAll('.plabel').length,
    sites: s.sites.length,
  };
});
console.log('render:', JSON.stringify(info.render), 'programs:', info.programs);
console.log('memory:', JSON.stringify(info.memory), 'labels:', info.labels);

// ── play: build a chain of links the way a player would
const played = await page.evaluate(() => {
  const s = window.PW.sim;
  const out = [];
  const shires = s.sites.filter((x) => x.kind === 'shire');
  const near = (a, list) => list.filter((b) => b.id !== a.id)
    .sort((p, q) => Math.hypot(p.x - a.x, p.z - a.z) - Math.hypot(q.x - a.x, q.z - a.z));
  let cur = shires[0];
  s.treasury = 3000;
  for (let i = 0; i < 5 && cur; i++) {
    const cand = near(cur, s.sites).slice(0, 6);
    let done = false;
    for (const b of cand) {
      if (s.linkBetween(cur.id, b.id)) continue;
      const sv = s.survey(cur.id, b.id);
      if (!sv.ok) { out.push(`blocked ${cur.name}->${b.name}: ${sv.reason}`); continue; }
      const r = s.build(sv);
      if (r.ok) {
        out.push(`built ${cur.name}->${b.name} ${Math.round(sv.length)}u ${sv.price}cr tun=${sv.tunnels}`);
        cur = b; done = true; break;
      }
    }
    if (!done) break;
  }
  // one line over everything, with engines
  const stops = [];
  for (const L of s.links) { if (!stops.includes(L.a)) stops.push(L.a); if (!stops.includes(L.b)) stops.push(L.b); }
  s.lines.length = 0;
  const lr = s.createLine(stops.slice(0, 6), 'mixed');
  if (lr.ok) s.setLineTrains(lr.line.id, 3);
  return out;
});
console.log('\nplayed:');
for (const l of played) console.log('  ' + l);

await wait(3000);
await shot('03-track-built');

// focus in on a settlement to check the architecture reads
await page.evaluate(() => {
  const s = window.PW.sim;
  const t = s.sites.find((x) => x.tier >= 2) || s.sites[0];
  window.PW.controls.focusOn(t.x, t.z, 110);
});
await wait(2600);
await shot('04-close-settlement');

// run the sim forward and shoot the mature network
const ff = await page.evaluate(() => window.PW.fastForward(14));
console.log('\nafter 14 weeks fast-forward:', JSON.stringify(ff));
await page.evaluate(() => window.PW.controls.focusOn(-60, 40, 520));
await wait(2600);
await shot('05-after-14-weeks');

// dusk, to check the day cycle and lamps
await page.evaluate(() => { window.PW.scene.env.time = 0.78; });
await wait(1800);
await shot('06-dusk');

// zoom right out — back to daylight first, or this "continent" check is really a
// second dusk check and says nothing about whether the map reads by day
await page.evaluate(() => { window.PW.scene.env.time = 0.42; });
await page.evaluate(() => window.PW.controls.focusOn(0, 0, 1150));
await wait(2200);
await shot('07-continent');

// ── frame timing
const fps = await page.evaluate(() => new Promise((res) => {
  let n = 0; const t0 = performance.now();
  const step = () => { if (++n < 90) requestAnimationFrame(step); else res(Math.round(n / ((performance.now() - t0) / 1000))); };
  requestAnimationFrame(step);
}));
console.log(`\nframe rate (software rasteriser, so a floor not a ceiling): ${fps} fps`);

const final = await page.evaluate(() => ({
  render: { ...window.PW.scene.renderer.info.render },
  snapshot: window.PW.snapshot(),
  logEntries: window.PW.sim.log.length,
  fatal: !!document.body.textContent.includes('operational irregularity'),
}));
console.log('final render:', JSON.stringify(final.render));
console.log('final state:', JSON.stringify(final.snapshot));

// ── verdict
const errors = logs.filter((l) => /\[error\]|\[pageerror\]|\[404\]|THREE.WebGLProgram|shader/i.test(l));
console.log(`\nconsole: ${logs.length} messages, ${errors.length} concerning`);
for (const e of errors.slice(0, 25)) console.log('  ' + e.slice(0, 260));
writeFileSync(join(SHOTS, 'console.log'), logs.join('\n'));

console.log(`\nshots written to ${SHOTS}`);
await browser.close();
server.kill();
process.exit(errors.length || final.fatal || !booted ? 1 : 0);
