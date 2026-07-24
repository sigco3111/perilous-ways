// Plays the real game through the real UI and reports the PLAYER'S EXPERIENCE.
//
// Everything else in tools/ tests the simulation or the corpus in isolation.
// This drives the actual page and, after every week, writes down what a player
// would see and WHAT THEY COULD DO. The question is not "does it work" but "is
// there a decision here, and did anything happen because of it".
//
//   node tools/playtest.mjs [seed] [weeks] [--shots]
//
// Read the `do` column. A long run of weeks where nothing new is available and
// nothing new is said is a long run of weeks that is not a game.

import { launch } from './chrome.mjs';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SEED = process.argv[2] || 'eardon';
const WEEKS = +(process.argv[3] || 30);
const SHOTS = process.argv.includes('--shots');
const PORT = 8593;
const SHOTDIR = resolve(ROOT, 'shots/play');
if (SHOTS) mkdirSync(SHOTDIR, { recursive: true });

const server = spawn('python', ['-m', 'http.server', String(PORT), '-d', ROOT], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 900));

const browser = await launch();
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });

const problems = [];
page.on('pageerror', (e) => problems.push('PAGE ERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') problems.push('CONSOLE: ' + m.text().slice(0, 160)); });

await page.goto(`http://localhost:${PORT}/index.html?seed=${encodeURIComponent(SEED)}`,
  { waitUntil: 'networkidle2', timeout: 60000 });
// The title screen gates boot behind #begin.
await page.waitForFunction(() => !document.getElementById('title').hidden, { timeout: 30000 });
await page.evaluate(() => document.getElementById('begin').click());
await page.waitForFunction(() => !!window.PW, { timeout: 90000 });
console.log('booted');

const clickText = (re) => page.evaluate((src) => {
  const rx = new RegExp(src, 'i');
  const b = [...document.querySelectorAll('button')].find((x) => rx.test(x.textContent) && !x.disabled);
  if (b) { b.click(); return b.textContent.replace(/\s+/g, ' ').trim(); }
  return null;
}, re.source);

// ---------------------------------------------------------------------------
// What can the player see and do right now?
// ---------------------------------------------------------------------------
const snapshot = () => page.evaluate(() => {
  const s = window.PW.sim;
  const acts = [];
  for (const b of document.querySelectorAll('button')) {
    if (b.disabled) continue;
    const r = b.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    let n = b, hid = false;
    while (n && n !== document.body) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden' || n.hidden) { hid = true; break; }
      n = n.parentElement;
    }
    if (hid) continue;
    const t = (b.textContent || '').replace(/\s+/g, ' ').trim();
    // ignore the permanent chrome: speed, audio, close, panel toggles
    if (!t || /^(❙❙|1×|2×|4×|♪|✕|▾|Ledger|Commissions)$/.test(t)) continue;
    acts.push(t.slice(0, 40));
  }
  const last = s.log[s.log.length - 1];
  return {
    week: s.week, age: s.age, treasury: Math.round(s.treasury),
    net: s.lastNet ?? 0,
    pros: Math.round(s.prosperityAvg?.(true) ?? 0),
    shadow: Math.round(s.shadow),
    conn: s.sites.filter((x) => x.connected && !x.abandoned).length,
    links: s.links.length, lines: s.lines.length,
    engines: s.fleet?.engines?.length ?? 0,
    loads: Math.round(s.lastLoads ?? 0),
    acts: [...new Set(acts)],
    modal: !!window.PW.hud.modalOpen,
    logText: last ? String(last.text).replace(/\s+/g, ' ').slice(0, 120) : '',
    logLen: s.log.length,
    over: s.over ? String(s.over) : null,
  };
});

// ── open ───────────────────────────────────────────────────────────────────
console.log(`seed=${SEED}`);
const took = await clickText(/take up the post|begin|accept/);
console.log(`opening: clicked "${took}"`);
await page.screenshot({ type: 'jpeg', quality: 40 });

// take the charter if one is on offer
const ch = await clickText(/charter|accept|take/);
if (ch) console.log(`charter: clicked "${ch}"`);
await page.screenshot({ type: 'jpeg', quality: 40 });

// ── build an opening network the way a player would ────────────────────────
// No settlement starts connected, so the first line must join two unconnected
// places; only afterwards does extending an existing network make sense.
const built = await page.evaluate(() => {
  const { sim } = window.PW;
  const out = [];
  const near = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  for (let k = 0; k < 5; k++) {
    const conn = sim.sites.filter((x) => x.connected && !x.abandoned);
    let best = null;
    const from = conn.length ? conn : sim.sites.filter((x) => !x.abandoned);
    for (const a of from) {
      for (const b of sim.sites) {
        if (b === a || b.abandoned || (conn.length && b.connected)) continue;
        const d = near(a, b);
        if (d < 20) continue;
        const score = ((a.pop || 20) + (b.pop || 20)) / (d + 60);
        if (!best || score > best.score) best = { a, b, score };
      }
    }
    if (!best) { out.push('no candidate pair'); break; }
    const r = sim.survey(best.a.id, best.b.id);
    if (!r || !r.ok) { out.push('survey failed ' + best.a.name + '->' + best.b.name + ': ' + (r && r.reason)); break; }
    if (r.cost > sim.treasury) { out.push('cannot afford ' + best.b.name + ' (' + r.cost + 'cr vs ' + Math.round(sim.treasury) + ')'); break; }
    const res = sim.build(r);
    if (!res || !res.ok) { out.push('build failed: ' + (res && res.reason)); break; }
    // Track alone carries nothing. main.js's build hook also opens a line over the
    // new link and puts an engine on it; do the same or the network sits UNSERVED.
    const onLine = sim.lines.find((l) => l.stops.includes(r.link.a) || l.stops.includes(r.link.b));
    if (onLine) {
      const other = onLine.stops.includes(r.link.a) ? r.link.b : r.link.a;
      sim.addStop(onLine.id, other);
    } else {
      const cr = sim.createLine([r.link.a, r.link.b], 'mixed');
      if (cr.ok && sim.enginesFree() > 0) sim.setLineTrains(cr.line.id, 1);
    }
    out.push(best.a.name + ' -> ' + best.b.name + ' (' + r.cost + 'cr)');
  }
  for (const line of sim.lines) {
    if (sim.enginesFree() > 0) sim.setLineTrains(line.id, Math.min(2, sim.enginesOf(line.id).length + 1));
  }
  out.push('lines: ' + sim.lines.length + ', engines working: ' + sim.enginesInUse()
    + ' of ' + sim.engines.length);
  return out;
});
console.log('opening network:'); for (const b of built) console.log('   ' + b);

console.log('\nwk  age  treas   net  pros  shd  conn lnk eng  new-register  do');
let lastActs = '', lastLogLen = 0, silent = 0, sameActs = 0;
const quiet = [];

for (let w = 1; w <= WEEKS; w++) {
  await page.evaluate(() => window.PW.fastForward(1));
  // drive a frame so the HUD repaints as it would for a player
  await page.screenshot({ type: 'jpeg', quality: 40 });
  await page.evaluate(() => window.PW.hud.refresh());

  const s = await snapshot();
  const acts = s.acts.join(' | ');
  const newLogs = s.logLen - lastLogLen;
  lastLogLen = s.logLen;
  if (newLogs === 0) silent++;
  if (acts === lastActs) sameActs++; else sameActs = 0;
  if (newLogs === 0 && acts === lastActs) quiet.push(s.week);
  lastActs = acts;

  console.log(`${String(s.week).padStart(2)}  ${'I'.repeat(s.age).padEnd(3)}`
    + `${String(s.treasury).padStart(6)} ${String(s.net).padStart(5)} `
    + `${String(s.pros).padStart(5)} ${String(s.shadow).padStart(4)} `
    + `${String(s.conn).padStart(4)} ${String(s.links).padStart(3)} ${String(s.engines).padStart(3)}  `
    + `${String(newLogs).padStart(2)}  ${s.acts.length ? s.acts.slice(0, 4).join(' · ').slice(0, 74) : '— nothing to do —'}`);
  if (s.logText && newLogs) console.log(`        “${s.logText}”`);

  if (s.modal) {
    const dismissed = await clickText(/accept|decline|close|continue|very well|so be it|noted/);
    if (dismissed) console.log(`        [modal] clicked "${dismissed}"`);
  }
  if (SHOTS && (w === 1 || w % 10 === 0)) {
    await page.screenshot({ path: resolve(SHOTDIR, `${SEED}-wk${String(w).padStart(2, '0')}.png`) });
  }
  if (s.over) { console.log(`\n>>> ENDING at week ${s.week}: ${s.over}`); break; }
}

console.log('\n════════ playtest ════════');
console.log(`weeks with no new register entry AND no new action: ${quiet.length}`
  + (quiet.length ? `  (${quiet.slice(0, 14).join(', ')})` : ''));
console.log(problems.length ? `PROBLEMS:\n  ${[...new Set(problems)].slice(0, 8).join('\n  ')}` : 'no page errors');

await browser.close();
server.kill();
