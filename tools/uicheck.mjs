// Shoots the interface, panel by panel, so the styling can be judged by looking
// at it rather than by reading the stylesheet. Drives the real HUD: builds a
// line, opens the dossier and the ledger, and puts up each modal in turn.
//
//   node tools/uicheck.mjs [seed]

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './chrome.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = join(ROOT, 'shots', 'ui');
mkdirSync(OUT, { recursive: true });
const PORT = 8595;
const SEED = process.argv[2] || 'eardon';

const server = spawn('python', ['-m', 'http.server', String(PORT), '-d', ROOT], { stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(1200);

const browser = await launch();
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 160)); });

const shot = async (name, clip) => {
  await page.screenshot({ path: join(OUT, `${name}.png`), ...(clip ? { clip } : {}) });
  console.log('  ' + name);
};
const shotEl = async (name, sel, pad = 8) => {
  const box = await page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el || el.hidden) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, sel);
  if (!box) { console.log(`  (no ${sel})`); return; }
  const vp = page.viewport();
  const clip = { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad) };
  clip.width = Math.min(box.width + pad * 2, vp.width - clip.x);
  clip.height = Math.min(box.height + pad * 2, vp.height - clip.y);
  await shot(name, clip);
};

await page.goto(`http://localhost:${PORT}/index.html?seed=${SEED}`, { waitUntil: 'networkidle2' });
await page.waitForFunction(() => !document.getElementById('title').hidden, { timeout: 20000 });
await wait(400);

// ── 1. the title card ──────────────────────────────────────────────────────
await shot('01-title');
await shotEl('01b-title-card', '.title-card', 4);

await page.evaluate(() => document.getElementById('begin').click());
await page.waitForFunction(() => !!window.PW, { timeout: 60000 });
await wait(1200);

// the standing orders as they first appear, before anything is built
await shot('02-opening');
await shotEl('02b-guide', '#guide', 8);
// step two carries <b> for the thing to press, which step one does not
await page.evaluate(() => {
  document.getElementById('guideBody').innerHTML =
    '<p class="guideStep">2 of 4</p><p class="guideText">Open the service in '
    + '<b>The Fleet</b> below. Choose what it <b>carries</b> — Freight shifts half '
    + 'again as much tonnage — and how much it <b>charges</b>.</p>';
});
await wait(200);
await shotEl('02c-guide-step2', '#guide', 8);

// ── 2. build a line, open the dossier and the ledger ───────────────────────
const built = await page.evaluate(() => {
  const s = window.PW.sim; s.treasury = 4000;
  const a = s.sites.find((x) => x.kind === 'shire');
  const near = s.sites.filter((b) => b.id !== a.id)
    .sort((p, q) => Math.hypot(p.x - a.x, p.z - a.z) - Math.hypot(q.x - a.x, q.z - a.z));
  let ok = false;
  for (const b of near.slice(0, 6)) {
    const sv = s.survey(a.id, b.id);
    if (sv.ok && s.build(sv).ok) { ok = true; break; }
  }
  if (!ok) return 'no link';
  const L = s.links[0];
  const r = s.createLine([L.a, L.b], 'freight');
  s.setLineTrains(r.line.id, 2);
  // a third call, so the stops list has something to reorder
  const third = near.find((b) => b.id !== L.a && b.id !== L.b);
  if (third) {
    const sv2 = s.survey(L.b, third.id);
    if (sv2.ok && s.build(sv2).ok) s.addStop(r.line.id, third.id);
  }
  window.PW.hud.setSelectedLine(r.line.id);
  window.PW.fastForward(3);
  document.getElementById('ledgerBtn').click();
  return 'ok';
});
console.log('  build:', built);
await wait(1200);
// The Council may have offered a charter in the meantime. Closing the modal is
// not enough — the host re-opens it until the offer is deferred.
await page.evaluate(() => {
  window.PW.sim.charterOffer = null;
  window.PW.hud.closeModal();
  window.PW.hud.refreshTop();
});
await wait(400);

await shot('03-all-panels');
await shotEl('04-topbar', '#topbar', 0);
await shotEl('05-leftpanel', '#leftpanel', 6);
await shotEl('06-linepanel', '#linePanel', 8);
await shotEl('07-ledger', '#ledger', 8);

// the register, with the ledger shut again and one entry of every tone in it
await page.evaluate(() => {
  document.getElementById('ledgerBtn').click();
  window.PW.sim.log.push(
    { week: 5, tone: 'good', text: 'Beacon Hardy has ale for the first time in an age. The Council minutes its satisfaction and claims the credit.' },
    { week: 5, tone: 'bad', text: 'A wagon left the rails short of Brackenford. Nobody was hurt and everybody has an opinion.' },
    { week: 5, tone: 'grave', big: true, text: 'The Elves have taken ship from the Grey Quays. The havens are dark, and Lore has left the ledger for good.' },
  );
  window.PW.hud.refreshLog();
});
await wait(500);
await shotEl('08-register', '#register', 6);
await shot('09-no-ledger');

// ── 3. the settlement dossier and the survey card ──────────────────────────
await page.evaluate(() => {
  const s = window.PW.sim;
  window.PW.hud.setSelectedLine(null);
  // prefer somewhere with traits and unmet needs, so every block is exercised
  const score = (x) => ((x.traits || []).length ? 2 : 0) + (x.connected ? 1 : 0);
  const site = [...s.sites].sort((a, b) => score(b) - score(a) || b.pop - a.pop)[0];
  window.PW.hud.showSite(site);
});
await wait(400);
await shotEl('10-inspector', '#inspector', 8);

await page.evaluate(() => {
  const s = window.PW.sim;
  const a = s.sites.find((x) => x.connected) || s.sites[0];
  const b = s.sites.filter((x) => x.id !== a.id)
    .sort((p, q) => Math.hypot(p.x - a.x, p.z - a.z) - Math.hypot(q.x - a.x, q.z - a.z))
    .find((x) => !s.links.some((L) => (L.a === a.id && L.b === x.id) || (L.b === a.id && L.a === x.id)));
  const sv = s.survey(a.id, b.id);
  window.PW.hud.showSurvey(a, b, sv);
});
await wait(400);
await shotEl('11-survey', '#inspector', 8);

// ── 4. lettering over the 3D ───────────────────────────────────────────────
await page.evaluate(() => {
  document.getElementById('inspector').hidden = true;
  const s = window.PW.sim.sites.filter((x) => x.pop > 300)[0] || window.PW.sim.sites[0];
  window.PW.controls.focusOn(s.x, s.z, 200);
});
await wait(1600);
// mark two labels that are actually on screen, to see .sel and .warn
await page.evaluate(() => {
  const vis = [...document.querySelectorAll('.plabel')].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.x > 250 && r.right < 930 && r.y > 90 && r.bottom < 660;
  });
  vis[0]?.classList.add('sel');
  vis[1]?.classList.add('warn');
});
await wait(200);
await shot('12-labels');

// ── 5. modals ──────────────────────────────────────────────────────────────
await page.evaluate(() => {
  window.PW.hud.showCharters([
    { id: 'a', kind: 'works', name: 'The Deepening of Brackenford', blurb: 'Double the platforms at the crossroads. Nothing else you build will matter until this is done.', note: 'The Dwarves will want paying.' },
    { id: 'b', kind: 'engines', name: 'The Ironmoot Pattern', blurb: 'Heavier engines, four wagons apiece, and a smell the Elves will write about.', note: 'Elves −6' },
    { id: 'c', kind: 'concession', name: 'The Eastern Concession', blurb: 'A licence to carry freight beyond the Sundering Peaks, and to be paid in Ashglass for it.', note: 'The Shadow will rise.' },
  ]);
});
await wait(400);
await shot('13-charters');

await page.evaluate(() => {
  window.PW.hud.showPetition({
    title: 'Concerning the Whistle',
    from: 'Mistress Amaranth Puddifoot of Nether Wembly',
    body: 'Sir,\n\nThis is the eleventh time I have written to you about the whistle. My hens have not laid since Thursday. My husband has taken to standing in the garden at the hour of the down train, shaking his fist, and he is not a fist-shaking man.\n\nI am told the whistle is required by the regulations. I would ask you to consider whether the regulations have ever met a hen.',
    options: [
      { label: 'Order the whistle silenced through the Greenhollow', note: 'Halflings +4. An incident becomes likelier on that stretch.' },
      { label: 'Reply that the regulations are the regulations', note: 'Halflings −3. She will write again.' },
      { label: 'Grant a concession and proceed as before', note: 'Costs 40 crowns. She will be satisfied for a season.' },
    ],
  });
});
await wait(400);
await shot('14-petition');

await page.evaluate(() => window.PW.hud.showEnding('survived'));
await wait(400);
await shot('15-ending');
await page.evaluate(() => window.PW.hud.closeModal());

// ── 6. narrow, and wide ────────────────────────────────────────────────────
await page.evaluate(() => {
  const s = window.PW.sim;
  window.PW.hud.setSelectedLine(s.lines[0]?.id ?? null);
  document.getElementById('ledgerBtn').click();
});
await wait(600);
await page.setViewport({ width: 900, height: 720 });
await wait(900);
await shot('16-narrow-900');
await page.setViewport({ width: 760, height: 680 });
await wait(700);
await shot('17-narrow-760');

await page.setViewport({ width: 2560, height: 1440 });
await wait(1100);
await shot('18-wide-2560');

// ── 7. the loading screen, put back up on purpose ──────────────────────────
await page.setViewport({ width: 1280, height: 720 });
await wait(500);
await page.evaluate(() => {
  const b = document.getElementById('boot');
  b.hidden = false;
  b.querySelector('.boot-bar i').style.width = '62%';
  b.querySelector('.boot-status').textContent = 'raising the mountains…';
});
await wait(300);
await shot('19-boot');

await browser.close();
server.kill();
console.log(`\nshots in ${OUT}`);
