// Minimal diagnostic: load the page, report every console message and network
// failure, and dump the DOM state so a silent boot failure has somewhere to hide.

import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './chrome.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = 8591;
const server = spawn('python', ['-m', 'http.server', String(PORT), '-d', ROOT], { stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(1000);

const browser = await launch();
const page = await browser.newPage();
page.on('console', (m) => console.log(`[${m.type()}] ${m.text()}`.slice(0, 500)));
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`.slice(0, 700)));
page.on('requestfailed', (r) => console.log(`[reqfail] ${r.url()} :: ${r.failure()?.errorText}`));
page.on('response', (r) => { if (r.status() >= 400) console.log(`[HTTP ${r.status()}] ${r.url()}`); });

await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load', timeout: 30000 });
await wait(2500);

console.log('\n--- dom state after load ---');
console.log(await page.evaluate(() => JSON.stringify({
  bootHidden: document.getElementById('boot').hidden,
  titleHidden: document.getElementById('title').hidden,
  hasPW: !!window.PW,
  seedVal: document.getElementById('seedInput')?.value,
  bootStatus: document.querySelector('.boot-status')?.textContent,
}, null, 2)));

console.log('\n--- clicking begin ---');
await page.evaluate(() => document.getElementById('begin').click());
for (let i = 0; i < 40; i++) {
  await wait(500);
  const st = await page.evaluate(() => ({
    pw: !!window.PW,
    status: document.querySelector('.boot-status')?.textContent,
    bar: document.querySelector('.boot-bar i')?.style.width,
  }));
  if (i % 4 === 0 || st.pw) console.log(`  t+${((i + 1) * 0.5).toFixed(1)}s  bar=${st.bar}  ${st.status}  PW=${st.pw}`);
  if (st.pw) break;
}

await browser.close();
server.kill();
