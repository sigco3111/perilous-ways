// Assembles dist/ with only what the browser needs. node_modules holds a full
// copy of three for the headless tests and must never reach the deploy.
import { cpSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const R = resolve(fileURLToPath(new URL('..', import.meta.url)));
const D = join(R, 'dist');
// Dropbox keeps a handle on files in this tree, so a hard delete intermittently
// fails with EPERM. Overwriting in place is good enough: every file the deploy
// needs is rewritten, and a stale leftover would still be a valid module.
if (existsSync(D)) {
  try { rmSync(D, { recursive: true, maxRetries: 6, retryDelay: 250 }); }
  catch { console.log('note: could not clear dist (file lock); overwriting in place'); }
}
mkdirSync(D, { recursive: true });
for (const f of ['index.html', 'styles.css']) cpSync(join(R, f), join(D, f));
cpSync(join(R, 'src'), join(D, 'src'), { recursive: true });
mkdirSync(join(D, 'vendor', 'three'), { recursive: true });
for (const f of ['three.module.min.js', 'three.core.min.js', 'LICENSE']) {
  if (existsSync(join(R, 'vendor/three', f))) cpSync(join(R, 'vendor/three', f), join(D, 'vendor/three', f));
}
cpSync(join(R, 'vendor/three/addons'), join(D, 'vendor/three/addons'), { recursive: true });
writeFileSync(join(D, '_headers'), `/*\n  Cache-Control: public, max-age=300\n/vendor/*\n  Cache-Control: public, max-age=31536000, immutable\n`);
writeFileSync(join(D, 'robots.txt'), 'User-agent: *\nAllow: /\n');
// size report
import { readdirSync } from 'node:fs';
let total = 0; const walk = (p) => { for (const e of readdirSync(p, { withFileTypes: true })) { const q = join(p, e.name); if (e.isDirectory()) walk(q); else total += statSync(q).size; } };
walk(D);
console.log(`dist assembled: ${(total / 1024 / 1024).toFixed(2)} MB`);
