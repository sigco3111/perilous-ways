// Catches a symbol that a module USES but never imports.
//
// `imports.mjs` validates that each named import exists in its target — it cannot
// see a symbol that was never imported at all. That is exactly how `LENDERS` came to
// be referenced in main.js with no import: every existing check passed, and the
// borrow button would have thrown the first time a player pressed it.
//
// The trick to making this precise: only consider names that are genuinely exported
// somewhere in src/. Guessing at identifiers from shape (SCREAMING_CASE, PascalCase)
// produces dozens of false positives from prose — "Grimbeard's Delve" and "Karag-Vor"
// both look like identifiers once an apostrophe has defeated your string stripping.
//
//   node tools/freevars.mjs

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = resolve(fileURLToPath(new URL('..', import.meta.url)), 'src');

const files = [];
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (e.endsWith('.js')) files.push(p);
  }
})(SRC);

const read = new Map(files.map((f) => [f, readFileSync(f, 'utf8')]));

// every name exported anywhere in src/, and where from
const exported = new Map();
for (const [f, src] of read) {
  for (const m of src.matchAll(/^export\s+(?:const|let|function|class)\s+(\w+)/gm)) {
    exported.set(m[1], f);
  }
}

const strip = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1 ')
  // Backticks and double quotes are safe to strip because their delimiter cannot
  // appear unescaped inside prose. SINGLE quotes are not: "Grimbeard's Delve" ends
  // the string early and turns the rest of the line into apparent code, which is
  // what produced dozens of phantom identifiers on the first attempt.
  // Drop the PROSE inside a template literal but keep its ${...} expressions —
  // those are real code. Stripping templates wholesale is what made the first
  // version of this check miss the very bug it was written for: the only reference
  // to LENDERS in main.js lives inside an interpolation.
  .replace(/`[^`]*`/g, (m) => {
    const code = [...m.matchAll(/\$\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g)].map((x) => x[1]);
    return '``' + code.join(';');
  })
  .replace(/"[^"\n]*"/g, '""');

// Known-benign hits: these names appear inside SINGLE-quoted strings and CSS class
// names, and single quotes cannot be stripped safely (an apostrophe in "Grimbeard's
// Delve" ends the string early). Each was checked by hand. The point of listing them
// rather than loosening the rule is that anything NEW still fails the build.
const BENIGN = new Set([
  'src/ui/hud.js|plate', 'src/ui/hud.js|bar', 'src/ui/hud.js|signed',
  'src/ui/hud.js|smoothstep',
  'src/ui/plates.js|WEEK', 'src/ui/plates.js|DAY', 'src/ui/plates.js|WORKS',
  'src/ui/plates.js|CROSSING', 'src/ui/plates.js|plate', 'src/ui/plates.js|bar',
  'src/ui/ornament.js|bar', 'src/ui/ornament.js|plate',
  'src/gfx/props.js|DAY', 'src/gfx/terrain.js|DAY',
  'src/gfx/props.js|plate', 'src/gfx/trains.js|smoothstep',
  'src/main.js|bar', 'src/sim/model.js|signed',
  'src/text/reports.js|WEEK', 'src/text/reports.js|DAY', 'src/text/reports.js|plate',
  // 'signed for' inside a comment; the // stripper leaves comment bodies that
  // follow a sentence-ending period, and 'signed' is a real export in ornament.js.
  'src/sim/sim.js|signed',
  // "was signed on the Thursday" in petition prose, same single-quote limitation
  'src/sim/events.js|signed',
]);
const key = (f, name) => `${f.slice(f.indexOf('src')).replace(/\\/g, '/')}|${name}`;

let problems = 0;
for (const [f, src] of read) {
  const code = strip(src);
  // what this module imports, plus anything it declares itself
  const inScope = new Set();
  for (const m of code.matchAll(/import\s+(?:\*\s+as\s+(\w+)|(\w+))?\s*,?\s*(?:\{([^}]*)\})?\s*from/g)) {
    if (m[1]) inScope.add(m[1]);
    if (m[2]) inScope.add(m[2]);
    if (m[3]) for (const part of m[3].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (name) inScope.add(name);
    }
  }
  for (const m of code.matchAll(/\b(?:const|let|var|class|function)\s+(\w+)/g)) inScope.add(m[1]);

  const missing = new Map();
  for (const [name, from] of exported) {
    if (from === f || inScope.has(name) || BENIGN.has(key(f, name))) continue;
    // a real reference: the bare name not preceded by a dot, and not a property key
    const re = new RegExp(`(^|[^.\\w$'"\`])${name}\\b(?!\\s*:)`, 'g');
    let n = 0;
    for (const _ of code.matchAll(re)) n++;
    if (n) missing.set(name, { n, from: from.slice(from.indexOf('src')) });
  }
  if (missing.size) {
    problems += missing.size;
    console.log(`\n${f.slice(f.indexOf('src'))}`);
    for (const [name, d] of missing) {
      console.log(`   ${name} — used ${d.n}x, exported by ${d.from}, NOT imported here`);
    }
  }
}
console.log(`\n${read.size} modules checked, ${exported.size} exported names`
  + ` — ${problems} missing import(s)`);
process.exit(problems ? 1 : 0);
