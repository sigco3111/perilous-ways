// Drives the commission loop end to end: a commission is offered, the panel shows
// it, accepting it puts it in hand, ordinary working discharges it, and the fee
// arrives. Also checks a siege fails destructively and athelas cures a plague.
//
//   node tools/commcheck.mjs

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './chrome.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SHOTS = join(ROOT, 'shots', 'comm');
mkdirSync(SHOTS, { recursive: true });
const PORT = 8603;
const server = spawn('python', ['-m', 'http.server', String(PORT), '-d', ROOT], { stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(1100);

let fails = 0, passes = 0;
const check = (label, ok, detail = '') => {
  if (ok) { passes++; console.log(`  ok   ${label}${detail ? '  — ' + detail : ''}`); }
  else { fails++; console.log(`  FAIL ${label}${detail ? '  — ' + detail : ''}`); }
};

const browser = await launch();
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

await page.goto(`http://localhost:${PORT}/index.html?seed=eardon`, { waitUntil: 'networkidle2' });
await page.waitForFunction(() => !document.getElementById('title').hidden, { timeout: 20000 });
await page.evaluate(() => document.getElementById('begin').click());
await page.waitForFunction(() => !!window.PW, { timeout: 60000 });
await wait(1200);
console.log('\n=== commission check ===\n');

// A network that guarantees the thing under test exists: a grain producer joined
// to a grain consumer. Connecting the first N sites in creation order happened to
// join no delve at all, so the freight case was measuring the setup.
await page.evaluate(() => {
  const s = window.PW.sim;
  s.treasury = 200000;
  s.can = { bridge: true, span: true, causeway: true, tunnel: true };
  s.stock.engines = 12; s.syncFleet();
  const shire = s.sites.find((x) => x.kind === 'shire');
  const delves = s.sites.filter((x) => x.kind === 'delve')
    .sort((a, b) => Math.hypot(a.x - shire.x, a.z - shire.z) - Math.hypot(b.x - shire.x, b.z - shire.z));
  const chain = [shire];
  for (const d of delves) {
    const sv = s.survey(shire.id, d.id);
    if (sv.ok && s.build(sv).ok) { chain.push(d); break; }
  }
  // and a few more places, for passage and for sieges to threaten
  const rest = s.sites.filter((x) => !chain.includes(x)).slice(0, 8);
  let cur = chain[chain.length - 1];
  for (const b of rest) {
    const sv = s.survey(cur.id, b.id);
    if (sv.ok && s.build(sv).ok) { chain.push(b); cur = b; }
    if (chain.length >= 6) break;
  }
  const r = s.createLine(chain.map((c) => c.id), 'mixed');
  if (r.ok) s.setLineTrains(r.line.id, 3);
  window.__target = chain[1]?.id ?? null;
});
await wait(1500);

// the panel opens and the button counts what is pending
const opened = await page.evaluate(() => {
  document.getElementById('commBtn').click();
  return { open: !document.getElementById('commissions').hidden };
});
check('the commissions panel opens', opened.open);

// force a commission of each shape and confirm the panel renders it
const shapes = await page.evaluate(() => {
  const s = window.PW.sim;
  const out = [];
  // Pick a good that some connected place actually produces, and a connected
  // destination that is not the producer. Assuming a particular settlement kind is
  // on the network is how this test kept measuring its own setup.
  const conn = s.sites.filter((x) => x.connected && !x.abandoned);
  const dest = s.byId.get(window.__target) || conn.find((x) => x.kind === 'delve');
  const cargo = 'grain';
  if (dest) {
    s.comm.offer(s, {
      kind: 'forge', class: 'freight', client: 'the Khazadrim', good: cargo,
      need: 3, to: dest.id, weeks: 8, fee: 300,
      title: `${dest.name} wants ${cargo}`, body: 'Test freight commission.',
    });
    out.push(`freight:${cargo}->${dest.name}`);
  }
  if (conn.length >= 2) {
    const a = conn[0], b = conn.find((x) => x !== a && s.hopsTo(a.id, x.id));
    if (b) {
      s.comm.offer(s, {
        kind: 'delegation', class: 'people', client: 'the Khazadrim',
        from: a.id, to: b.id, weeks: 8, need: 10, fee: 250, label: 'a delegation',
        title: 'A delegation, travelling in state', body: 'Test passage commission.',
      });
      out.push('passage');
    }
  }
  window.PW.hud.refreshCommissions();
  return out;
});
check('commissions of both classes can be offered', shapes.length === 2, shapes.join(' + '));

const rendered = await page.evaluate(() => {
  const el = document.getElementById('commissions');
  return {
    cards: el.querySelectorAll('.comm').length,
    accepts: el.querySelectorAll('[data-comm-take]').length,
    btn: document.getElementById('commBtn').textContent.trim(),
  };
});
check('the panel renders a card per commission', rendered.cards >= 2, `${rendered.cards} cards`);
check('each offer can be accepted or declined', rendered.accepts >= 2);
check('the top bar counts pending offers', /\(\d+\)/.test(rendered.btn), rendered.btn);
await page.screenshot({ path: join(SHOTS, 'c1-offers.png') });

// accept them through the UI
let accepted = 0;
for (let i = 0; i < 6; i++) {
  // Accepting re-renders the panel, so the button list must be re-queried between
  // clicks rather than iterated from one stale snapshot.
  const more = await page.evaluate(() => {
    const b = document.querySelector('[data-comm-take]');
    if (!b) return false;
    b.click();
    return true;
  });
  if (!more) break;
  await wait(150);
}
accepted = await page.evaluate(() => window.PW.sim.commissions.filter((c) => c.state === 'taken').length);
check('accepting moves them into hand', accepted >= 2, `${accepted} in hand`);
await wait(500);
await page.screenshot({ path: join(SHOTS, 'c2-in-hand.png') });

// ordinary working discharges them
const progressed = await page.evaluate(async () => {
  const s = window.PW.sim;
  const before = s.treasury;
  const freight = s.commissions.find((c) => c.state === 'taken' && c.class === 'freight');
  const passage = s.commissions.find((c) => c.state === 'taken' && c.class === 'people');
  for (let i = 0; i < 60 && (freight?.state === 'taken' || passage?.state === 'taken'); i++) {
    s.step(90 / 7);
  }
  return {
    freightState: freight?.state, freightDone: freight?.done ?? 0, freightNeed: freight?.need,
    passageState: passage?.state, passagePc: passage ? passage.done / passage.need : 0,
    gained: s.treasury - before,
    doneCount: s.stats.commissionsDone || 0,
  };
});
check('freight commissions make progress from ordinary working',
  progressed.freightDone > 0 || progressed.freightState === 'done',
  `${progressed.freightDone.toFixed(1)}/${progressed.freightNeed} (${progressed.freightState})`);
check('passage commissions make progress from having a service',
  progressed.passagePc > 0.05 || progressed.passageState === 'done',
  `${Math.round(progressed.passagePc * 100)}% (${progressed.passageState})`);
check('discharging pays the fee', progressed.doneCount > 0 && progressed.gained > 0,
  `${progressed.doneCount} discharged, +${Math.round(progressed.gained)} cr net`);

// a siege that is not relieved takes the settlement
const siege = await page.evaluate(() => {
  const s = window.PW.sim;
  const victim = s.sites.find((x) => x.connected && !x.abandoned
    && (x.kind === 'watch' || x.kind === 'burg'));
  const c = s.comm.offer(s, {
    kind: 'siege', class: 'freight', client: 'the Crown', good: 'arms',
    need: 99, to: victim.id, weeks: 1, fee: 800, urgent: true,
    title: `${victim.name} is invested`, body: 'Test siege.',
    onFail: (s2, cc) => {
      const site = s2.byId.get(cc.to);
      if (site) { site.abandoned = true; s2.markDirty(); }
      s2.regard.men = Math.max(0, s2.regard.men - 20);
    },
  });
  s.comm.accept(s, c.id);
  const menBefore = s.regard.men;
  for (let i = 0; i < 30; i++) s.step(90 / 7);
  return {
    name: victim.name, state: c.state,
    lost: !!s.byId.get(victim.id)?.abandoned,
    menDropped: s.regard.men < menBefore,
  };
});
check('an unrelieved siege fails', siege.state === 'failed', `${siege.name}: ${siege.state}`);
check('...and the settlement is lost', siege.lost);
check('...and the Crown remembers', siege.menDropped);

// athelas cures a plague
const cure = await page.evaluate(() => {
  const s = window.PW.sim;
  const haven = s.sites.find((x) => x.kind === 'haven' && !x.abandoned);
  const sick = s.sites.find((x) => x.connected && !x.abandoned && x.kind !== 'haven');
  if (!haven || !sick) return { skipped: true };
  sick.plague = 0.6;
  haven.stock.athelas = 40;
  const before = sick.plague;
  // put them on one service so the physic can actually reach it
  const r = s.createLine([haven.id, sick.id], 'mixed');
  if (r.ok) s.setLineTrains(r.line.id, 1);
  for (let i = 0; i < 40; i++) s.step(90 / 7);
  return { before, after: sick.plague, at: sick.name, routed: !!s.hopsTo(haven.id, sick.id) };
});
check('athelas reduces a plague where it arrives',
  cure.skipped || !cure.routed || cure.after < cure.before,
  cure.skipped ? 'no candidates' : `${cure.at} ${cure.before.toFixed(2)} -> ${cure.after.toFixed(2)}`);

// mithril only comes from a deep shaft
const mith = await page.evaluate(async () => {
  const s = window.PW.sim;
  const deep = s.sites.filter((x) => x.kind === 'delve' && (x.traits || []).includes('deep_shaft'));
  for (let i = 0; i < 40; i++) s.step(90 / 7);
  const shallow = s.sites.filter((x) => x.kind === 'delve' && !(x.traits || []).includes('deep_shaft'));
  return {
    deepCount: deep.length,
    deepHas: deep.reduce((n, x) => n + (x.supply.mithril || 0), 0),
    shallowHas: shallow.reduce((n, x) => n + (x.supply.mithril || 0), 0),
  };
});
check('only a deep shaft yields mithril',
  mith.deepCount === 0 || (mith.deepHas > 0 && mith.shallowHas === 0),
  `${mith.deepCount} deep shafts, ${mith.deepHas.toFixed(2)} vs ${mith.shallowHas.toFixed(2)}`);

await page.evaluate(() => window.PW.hud.refreshCommissions());
await wait(400);
await page.screenshot({ path: join(SHOTS, 'c3-closed.png') });

check('no console errors', errs.length === 0, errs.slice(0, 2).join(' | '));
console.log(`\n=== ${passes} passed, ${fails} failed ===\n`);
await browser.close();
server.kill();
process.exit(fails ? 1 : 0);
