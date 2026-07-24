// One screenshot of one local page. For looking at static UI (the loco diagrams)
// without the preview pane, whose screenshots time out on this machine.
//   node tools/shot1.mjs <path-under-root> <out.png> [width] [height]
import { launch } from './chrome.mjs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PAGE = process.argv[2] || 'index.html';
const OUT = process.argv[3] || 'shots/page.png';
const W = +(process.argv[4] || 900), H = +(process.argv[5] || 700);
const PORT = 8599;
const server = spawn('python', ['-m', 'http.server', String(PORT), '-d', ROOT], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 900));
const browser = await launch();
const page = await browser.newPage();
await page.setViewport({ width: W, height: H });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(`http://localhost:${PORT}/${PAGE}`, { waitUntil: 'networkidle2', timeout: 45000 });
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: resolve(ROOT, OUT), fullPage: true });
console.log(`wrote ${OUT}${errs.length ? `\nPAGE ERRORS: ${errs.join(' | ')}` : ''}`);
await browser.close();
server.kill();
