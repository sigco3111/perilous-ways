// Walks every module in src/ and checks that each named import actually exists
// as an export of the file it comes from, resolving bare "three" and
// "three/addons/" the same way the page's import map does.
//
// Without a browser this is the cheapest way to catch the integration bugs that
// produce a blank canvas: a renamed export, a typo'd path, a helper that was
// planned and never written.
//
//   node tools/imports.mjs

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath, not .pathname — the latter leaves %20 in place for the spaces
// in this project's path and every subsequent readdir fails.
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const MAP = [
  ['three/addons/', 'vendor/three/addons/'],
  ['three/tsl', 'vendor/three/three.module.min.js'],
  ['three/webgpu', 'vendor/three/three.module.min.js'],
  ['three', 'vendor/three/three.module.min.js'],
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'node_modules') walk(p, out); }
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

/** Named + default + star exports of a module file. */
function exportsOf(file) {
  const src = readFileSync(file, 'utf8');
  const names = new Set();
  // export function foo / export class Foo / export const a, b
  for (const m of src.matchAll(/^\s*export\s+(?:async\s+)?(?:function\*?|class)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^\s*export\s+(?:const|let|var)\s+([^=;\n]+)/gm)) {
    for (const part of m[1].split(',')) {
      const id = part.trim().replace(/[[{].*/, '').trim();
      if (/^[A-Za-z_$][\w$]*$/.test(id)) names.add(id);
    }
  }
  // export { a, b as c }
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const bits = part.trim().split(/\s+as\s+/);
      const id = (bits[1] || bits[0] || '').trim();
      if (/^[A-Za-z_$][\w$]*$/.test(id)) names.add(id);
    }
  }
  if (/export\s+default/.test(src)) names.add('default');
  const star = /export\s*\*\s*from/.test(src);
  return { names, star };
}

function resolveSpec(fromFile, spec) {
  if (spec.startsWith('.')) {
    const p = resolve(dirname(fromFile), spec);
    return existsSync(p) ? p : null;
  }
  for (const [prefix, target] of MAP) {
    if (spec === prefix || spec.startsWith(prefix)) {
      const rest = spec.slice(prefix.length);
      const p = resolve(ROOT, target + (prefix.endsWith('/') ? rest : ''));
      return existsSync(p) ? p : null;
    }
  }
  return null;
}

const files = [
  ...walk(join(ROOT, 'src')),
  ...walk(join(ROOT, 'vendor', 'three', 'addons')),
];
const cache = new Map();
const exportsCached = (f) => {
  if (!cache.has(f)) cache.set(f, exportsOf(f));
  return cache.get(f);
};

let problems = 0, checked = 0;
const rel = (f) => relative(ROOT, f).replace(/\\/g, '/');

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  // import ... from 'spec'   (single or multiline)
  const re = /import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
  for (const m of src.matchAll(re)) {
    const clause = m[1].trim();
    const spec = m[2];
    const target = resolveSpec(file, spec);
    if (!target) {
      console.log(`  MISSING FILE  ${rel(file)}  ->  ${spec}`);
      problems++;
      continue;
    }
    if (/\bas\s+[A-Za-z_$][\w$]*\s*$/.test(clause) && clause.startsWith('*')) continue; // namespace
    const braced = clause.match(/\{([\s\S]*)\}/);
    if (!braced) continue;   // default import only
    const { names, star } = exportsCached(target);
    if (star) continue;      // re-export barrel; give it the benefit of the doubt
    for (const part of braced[1].split(',')) {
      const id = part.trim().split(/\s+as\s+/)[0].trim();
      if (!id) continue;
      checked++;
      if (!names.has(id)) {
        console.log(`  NOT EXPORTED  ${rel(file)}  imports  { ${id} }  from  ${spec}`);
        problems++;
      }
    }
  }
}

// index.html script + importmap sanity
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  const u = m[1];
  if (u.startsWith('http') || u.startsWith('data:')) continue;
  if (!existsSync(resolve(ROOT, u))) { console.log(`  MISSING ASSET index.html -> ${u}`); problems++; }
}
for (const m of html.matchAll(/"(three[^"]*)":\s*"([^"]+)"/g)) {
  const t = m[2].replace(/^\.\//, '');
  const p = resolve(ROOT, t);
  if (!t.endsWith('/') && !existsSync(p)) { console.log(`  IMPORTMAP TARGET MISSING ${m[1]} -> ${m[2]}`); problems++; }
  if (t.endsWith('/') && !existsSync(p)) { console.log(`  IMPORTMAP DIR MISSING ${m[1]} -> ${m[2]}`); problems++; }
}

console.log(`\n${checked} named imports checked across ${files.length} modules — ${problems} problem(s)`);
process.exit(problems ? 1 : 0);
