// Renders the same viewpoint under several lighting configurations and writes
// one PNG per variant, so the look can be chosen by comparing pictures instead
// of by guessing at numbers.
//
//   node tools/tune.mjs [seed]

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './chrome.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = join(ROOT, 'shots', 'tune');
mkdirSync(OUT, { recursive: true });
const PORT = 8592;
const SEED = process.argv[2] || 'eardon';

const server = spawn('python', ['-m', 'http.server', String(PORT), '-d', ROOT], { stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(1100);

const browser = await launch();
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 200)));

await page.goto(`http://localhost:${PORT}/index.html?seed=${SEED}`, { waitUntil: 'networkidle2' });
await page.waitForFunction(() => !document.getElementById('title').hidden, { timeout: 20000 });
await page.evaluate(() => document.getElementById('begin').click());
await page.waitForFunction(() => !!window.PW, { timeout: 60000 });
await wait(1500);

// hide the HUD so the picture is only the render
await page.evaluate(() => { document.getElementById('hud').style.opacity = '0'; });

const VIEWS = {
  z1_close: { x: -60, z: 40, d: 150, t: 0.40 },
  z2_mid: { x: -60, z: 40, d: 430, t: 0.40 },
  z3_wide: { x: 40, z: 0, d: 780, t: 0.40 },
  z4_continent: { x: 0, z: 0, d: 1180, t: 0.40 },
  dusk: { x: -60, z: 40, d: 430, t: 0.76 },
};

// current rig only; the point now is to check it holds across zoom levels
const VARIANTS = [{ name: 'current', sun: null, exp: null, hemi: null, fog: 1.0, nb: null, bias: null }];

for (const [vn, v] of Object.entries(VIEWS)) {
  await page.evaluate((vv) => {
    window.PW.controls.focusOn(vv.x, vv.z, vv.d);
    window.PW.scene.env.time = vv.t;
  }, v);
  await wait(1400);

  for (const k of VARIANTS) {
    await page.evaluate((kk) => {
      const s = window.PW.scene;
      if (kk.sun !== null) s.sun.intensity = kk.sun;
      if (kk.exp !== null) s.renderer.toneMappingExposure = kk.exp;
      if (kk.hemi !== null) s.hemi.intensity = kk.hemi;
      if (kk.nb !== null) s.sun.shadow.normalBias = kk.nb;
      if (kk.bias !== null) s.sun.shadow.bias = kk.bias;
      s.__fogMul = kk.fog === 1.0 ? 0 : kk.fog;
    }, k);
    // hold the fog multiplier across the day-curve overwrite in scene.update
    await page.evaluate(() => {
      if (!window.__patched) {
        window.__patched = true;
        const s = window.PW.scene;
        const orig = s.update;
        s.update = (dt) => { orig(dt); if (s.__fogMul) s.scene.fog.density *= s.__fogMul; };
      }
    });
    await wait(900);
    await page.screenshot({ path: join(OUT, `${vn}-${k.name}.png`) });
    console.log(`  ${vn}-${k.name}`);
  }
}

await browser.close();
server.kill();
console.log(`\nvariants in ${OUT}`);
