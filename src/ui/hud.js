// The paperwork. Top bar, panels, the register, the line dossier, the ledger,
// the survey card, and the modals.
//
// The organising principle after playtesting: every number the simulation
// computes must be reachable in at most two clicks, and every number the player
// can see must have an explanation attached. The version before this one hid all
// of it, which made a game with five interacting systems feel like weather.

import { CULTURES, GOODS, KINDS, TIER_NAME, TIER_MULT, VALUE, POLICIES, POLICY_KEYS, FARES, WARDEN_COST, LENDERS, LENDER_KEYS } from '../sim/model.js';
import { WORKS_NAME } from '../sim/route.js';
import { ENDINGS } from '../sim/events.js';
import { REGION_NAME, REGION_LORE, TRAITS } from '../world/worldgen.js';
import { CULTURE_RUNE, sigil, illuminate } from './ornament.js';
import { engineRecord, ENGINE_CLASSES, CLASS_KEYS } from '../sim/fleet.js';
import { goodName } from '../sim/commissions.js';
// The engraved plates are optional: the game must run whether or not the file is
// present, so they are loaded dynamically and every use is guarded.
let PLATES = null;
try { PLATES = await import('./plates.js'); } catch { PLATES = null; }
// The locomotive elevations are optional in the same way: the game must run whether
// or not the drawings are present.
let LOCOS = null;
try { LOCOS = await import('./locos.js'); } catch { LOCOS = null; }
const drawLoco = (key, opts) => {
  try { return LOCOS?.locoElevation?.(key, opts) || ''; } catch { return ''; }
};
const drawConsist = (cars, opts) => {
  try { return LOCOS?.consistStrip?.(cars, opts) || ''; } catch { return ''; }
};
const plateFor = (id) => {
  if (!id || !PLATES?.hasPlate?.(id) ) return '';
  try {
    const svg = PLATES.plate(id, {});
    return svg ? `<figure class="plate inline">${svg}</figure>` : '';
  } catch { return ''; }
};
import { clamp } from '../rng.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const crowns = (n) => Math.round(n).toLocaleString('en-GB');
const paras = (t) => String(t).split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');

export function createHud(sim, hooks) {
  let logShown = 0;
  let openLine = null;      // id of the service whose dossier is open
  let modalOpen = false;
  let deferred = false;
  let deferredAt = -1;   // which council sitting was deferred (sim.charterSat)
  let ledgerOpen = false;
  let commOpen = false;
  let fleetShopOpen = false;

  // ── top bar ────────────────────────────────────────────────────────────
  function refreshTop() {
    const s = sim;
    $('stWeek').firstChild.textContent = `${s.week}`;
    $('stWeek').lastChild.textContent = `week · age ${['', 'I', 'II', 'III'][s.age]}`;

    const m = $('stMoney');
    m.firstChild.textContent = crowns(s.treasury);
    m.classList.toggle('broke', s.treasury < 0);

    const net = (s.lastNet ?? 0);
    const f = $('stFlow');
    f.firstChild.textContent = (net >= 0 ? '+' : '') + crowns(net);
    f.classList.toggle('neg', net < 0);

    $('stPros').firstChild.textContent = Math.round(s.prosperityAvg(true));
    $('stConcord').firstChild.textContent = Math.round(s.concordAvg());
    $('stShadow').firstChild.textContent = `${Math.round(s.shadow)}%`;

    const cb = $('charterBtn');
    if (cb) {
      cb.hidden = !s.charterOffer;
      // The Council now sits for a fixed number of weeks. Show the clock: a nag
      // that says "awaits" forever is noise, but one that says "rises in 2" is a
      // decision with a cost for dithering.
      const left = s.charterOffer ? Math.max(0, (s.charterLapses ?? 0) - s.week) : 0;
      if (s.charterOffer) {
        cb.textContent = left <= 1 ? 'The Council rises this week'
          : left <= 2 ? `The Council rises in ${left} weeks`
          : 'A charter awaits';
      }
      // only urgent when it is actually urgent
      cb.classList.toggle('pulse', !!s.charterOffer && left <= 2);
    }
  }

  // ── concord ────────────────────────────────────────────────────────────
  function refreshConcord() {
    const rows = [];
    for (const key of ['halfling', 'dwarf', 'elf', 'men', 'orc']) {
      const c = CULTURES[key];
      const v = sim.regard[key];
      const gone = key === 'elf' && sim.elvesGone;
      const mood = gone ? 'departed'
        : v > 80 ? 'devoted' : v > 62 ? 'warm' : v > 44 ? 'civil'
        : v > 26 ? 'cool' : v > 10 ? 'aggrieved' : 'done with you';
      rows.push(
        `<div class="regard${gone ? ' gone' : ''}">
           <div class="rl">${sigil(key)}<span>${esc(c.name)}</span><i>${mood}</i></div>
           <div class="meter"><i style="width:${clamp(v, 0, 100)}%;background:${c.colour}"></i></div>
         </div>`,
      );
    }
    $('regardList').innerHTML = rows.join('');
  }

  // ── fleet list ─────────────────────────────────────────────────────────
  function refreshFleet() {
    // This panel is re-rendered from scratch every 0.28s, which destroyed the
    // engine-works <details> drawer's open state: it snapped shut a quarter-second
    // after being opened, every time, and buying an engine was effectively
    // impossible unless you had just clicked Buy (the only path that set the flag).
    // Read the player's actual choice from the DOM before wiping it.
    const worksEl = $('lineList').querySelector('details.engWorks');
    if (worksEl) fleetShopOpen = worksEl.open;
    $('fEngines').textContent = `${sim.enginesInUse()} of ${sim.stock.engines}`;
    $('fCars').textContent = sim.stock.cars;
    const got = Object.entries(sim.can).filter(([, v]) => v).map(([k]) => k);
    $('fCharters').textContent = got.length ? got.join(', ') : 'none';

    const rows = sim.lines.map((l) => {
      const st = l.stats || {};
      const net = (st.revenue ?? 0) - (st.upkeep ?? 0);
      return `<div class="svc${openLine === l.id ? ' sel' : ''}" data-line="${l.id}">
        <div class="svcHead">
          <s class="swatch" style="background:${l.colour}"></s>
          <span class="nm" title="${esc(l.name)} · ${l.stops.length} calls">${esc(l.name)}</span>
          <span class="svcBadge ${l.policy}">${POLICIES[l.policy]?.label ?? l.policy}</span>
          <span class="tn" title="engines">${l.trains}</span>
          <span class="svcNet ${net >= 0 ? 'good' : 'bad'}">${net >= 0 ? '+' : ''}${Math.round(net)}</span>
        </div>
      </div>`;
    });
    // the shed: engines with nothing to do are a resource the player forgets about
    const idle = sim.engines.filter((e) => e.lineId === null);
    if (idle.length) {
      rows.push(`<div class="shed"><i>In the shed</i>${idle.slice(0, 6).map((e) => {
        const cond = clamp(e.condition ?? 1, 0, 1);
        const wear = cond < 0.35 ? ' worn' : cond < 0.7 ? ' tired' : '';
        return `<button class="engChip${wear}" data-eng-id="${e.id}"
          title="${esc(sim.engineClass(e).name)} · ${esc(engineRecord(e, sim.week))}">${esc(e.name)}</button>`;
      }).join('')}${idle.length > 6 ? `<span class="more">+${idle.length - 6}</span>` : ''}</div>`);
    }

    // ── the works: buying an engine is the game's one real purchase decision ──
    // Until now every engine was identical, so the fleet was a number and the only
    // control was "how many". These are genuine operating tradeoffs — and which of
    // them you may buy at all depends on who is still speaking to the Authority.
    const buyable = CLASS_KEYS.map((k) => {
      const o = sim.engineOffer(k);
      if (!o) return '';
      const stat = (label, v, hi) =>
        `<s class="bar ${v >= hi ? 'hi' : ''}" style="--w:${Math.round(clamp(v / 2.3, 0, 1) * 100)}%"
           title="${label} ${v.toFixed(2)}"></s>`;
      return `<div class="engBuy${o.refuse ? ' shut' : ''}">
        <span class="drawing">${drawLoco(k, { w: 168 })}</span>
        <span class="nm">${sigil(o.style)}${esc(o.name)}</span>
        <span class="stats">
          ${stat('haul', o.power, 1.9)}${stat('speed', o.speed, 1.5)}${stat('appeal', o.grace, 1.5)}${stat('endurance', o.stamina, 1.8)}
        </span>
        <span class="bl">${esc(o.blurb)}</span>
        ${o.refuse
          ? `<span class="wr">${esc(o.refuse)}</span>`
          : `<button data-buy-eng="${k}" ${o.price > sim.treasury ? 'disabled' : ''}
               title="${esc(o.builder)} · ${o.upkeep} cr/week upkeep">Buy · ${o.price} cr</button>`}
      </div>`;
    }).join('');
    rows.push(`<details class="engWorks"${fleetShopOpen ? ' open' : ''}>
      <summary>The engine works</summary>${buyable}
      <p class="ledNote">Haul · speed · appeal · endurance. An engine wears with the work
      it does; a worn one hauls less and can be put right in the shed.</p>
    </details>`);

    if (!rows.length) {
      rows.push('<div class="empty">No services yet. Build a line and one will be founded.</div>');
    }
    $('lineList').innerHTML = rows.join('');
  }

  // ── the line dossier ───────────────────────────────────────────────────
  function refreshLinePanel() {
    const el = $('linePanel');
    const line = sim.lines.find((l) => l.id === openLine);
    if (!line) { el.hidden = true; return; }
    // Never re-render while the player is typing in this panel: the rebuild
    // destroys the rename input mid-word about once a second, which made naming a
    // service nearly impossible. The panel catches up on the next tick after focus
    // leaves.
    if (el.contains(document.activeElement)
        && document.activeElement.tagName === 'INPUT') return;
    el.hidden = false;
    const st = line.stats || {};
    const idle = sim.enginesFree();
    const fare = FARES[line.fare];

    const stops = line.stops.map((id, i) => {
      const site = sim.byId.get(id);
      if (!site) return '';
      const worst = sim.needsOf(site).find((n) => n.met < 0.6 && n.why);
      return `<li data-stop="${id}">
        ${sigil(site.culture)}<span class="nm">${esc(site.name)}</span>
        ${worst ? `<span class="flag short" title="${esc(worst.why)}">short of ${esc(GOODS[worst.good].name.toLowerCase())}</span>` : ''}
        <span class="ops">
          <button data-act="up" ${i === 0 ? 'disabled' : ''} title="Earlier">↑</button>
          <button data-act="down" ${i === line.stops.length - 1 ? 'disabled' : ''} title="Later">↓</button>
          <button data-act="split" ${i === 0 || i === line.stops.length - 1 ? 'disabled' : ''} title="Split the service here">⋔</button>
          <button data-act="drop" ${line.stops.length <= 2 ? 'disabled' : ''} title="Stop calling here">✕</button>
        </span>
      </li>`;
    }).join('');

    const seg = (attr, items, cur) => `<div class="seg">${items.map((it) =>
      `<button data-${attr}="${it.v}" class="${it.v === cur ? 'on' : ''}" title="${esc(it.t || '')}">${esc(it.l)}</button>`).join('')}</div>`;

    el.innerHTML = `
      <div class="lpHead">
        <s class="swatch" style="background:${line.colour}"></s>
        <input class="lpName" value="${esc(line.name)}" maxlength="34" spellcheck="false">
        <button class="ghost sm" data-act="closeLine" title="Close">✕</button>
      </div>

      <div class="lpRow">
        <span class="lpLabel">Carries</span>
        ${seg('policy', POLICY_KEYS.map((k) => ({
          v: k, l: POLICIES[k].label,
          t: `goods ×${POLICIES[k].goods.toFixed(2)}, passengers ×${POLICIES[k].pax.toFixed(2)}`,
        })), line.policy)}
      </div>

      <div class="lpRow">
        <span class="lpLabel">Fares</span>
        ${seg('fare', FARES.map((f, i) => ({
          v: i, l: f.label,
          t: `receipts ×${f.mul.toFixed(2)}, tonnage ×${f.demand.toFixed(2)}`,
        })), line.fare)}
      </div>

      <div class="lpRow">
        <span class="lpLabel">Engines</span>
        <div class="stepper">
          <button data-tr="-1" ${line.trains <= 0 ? 'disabled' : ''}>−</button>
          <b>${line.trains}</b>
          <button data-tr="1" ${idle <= 0 ? 'disabled' : ''}>+</button>
          <i>${idle} idle in shed</i>
        </div>
      </div>

      <div class="lpRow">
        <span class="lpLabel">Wardens</span>
        <label class="chk"><input type="checkbox" data-act="warden" ${line.warden ? 'checked' : ''}>
          patrol this line (${WARDEN_COST}/wk, halves incidents)</label>
      </div>

      <div class="lpStops">
        <span class="lpLabel">Calls at</span>
        <ol>${stops}</ol>
        <p class="lpAdd">Click a settlement on the map to add it to this service.</p>
      </div>

      <div class="lpStats">
        <div><i>carried</i><b>${Math.round(st.loads ?? 0)}</b><s>loads/wk</s></div>
        <div><i>receipts</i><b>${Math.round(st.revenue ?? 0)}</b><s>cr/wk</s></div>
        <div><i>upkeep</i><b>${Math.round(st.upkeep ?? 0)}</b><s>cr/wk</s></div>
        <div><i>busiest</i><b>${Math.round((st.worstLoad ?? 0) * 100)}%</b>
          <s class="${(st.worstLoad ?? 0) > 0.9 ? 'warn' : ''}">${esc(st.worstLink || '—')}</s></div>
      </div>

      ${(() => {
        // THE ROLLING STOCK. `stock.cars` was one global number, so every train in
        // the realm ran the same rake and there was nothing to modify. Each service
        // now sets its own, up to whatever the Authority's stock allows — and the
        // train it makes is drawn underneath, so the choice is visible.
        const cars = sim.lineCars(line);
        const shown = hooks.consistFor ? hooks.consistFor(line.id) : null;
        return `<div class="stockRow">
          <span class="lpLabel">Rolling stock</span>
          <span class="rake">
            <button data-cars="${Math.max(1, cars - 1)}" ${cars <= 1 ? 'disabled' : ''}
              title="One wagon fewer: lighter train, round the line more often">−</button>
            <b>${cars}</b><i>of ${sim.stock.cars}</i>
            <button data-cars="${Math.min(sim.stock.cars, cars + 1)}"
              ${cars >= sim.stock.cars ? 'disabled' : ''}
              title="One wagon more: heavier train, more tonnage per trip">+</button>
          </span>
          ${shown && shown.length ? `<span class="rakeArt">${drawConsist(shown, { w: 210 })}</span>` : ''}
        </div>`;
      })()}
      ${(() => {
        const ids = [...new Set(sim.lineLinks(line) || [])];
        const links = ids.map((id) => sim.links.find((x) => x.id === id)).filter(Boolean);
        if (!links.length) return '';
        const toEase = links.filter((L) => (L.regrade || 1) > 0.8);
        const toArm = links.filter((L) => !L.fortified);
        const easePrice = toEase.reduce((n, L) => n + sim.worksPrice.regrade(L), 0);
        const armPrice = toArm.reduce((n, L) => n + sim.worksPrice.fortify(L), 0);
        return `<div class="worksRow">
          <span class="lpLabel">Works</span>
          ${toEase.length ? `<button data-regrade="${line.id}" ${easePrice > sim.treasury ? 'disabled' : ''}
            title="Ease the gradients and curves on every section: everything runs faster"
            >Regrade · ${easePrice} cr</button>` : '<i>eased</i>'}
          ${toArm.length ? `<button data-fortify="${line.id}" ${armPrice > sim.treasury ? 'disabled' : ''}
            title="Blockhouses and walled cuttings: incidents on this line more than halve"
            >Fortify · ${armPrice} cr</button>` : '<i>fortified</i>'}
        </div>`;
      })()}
      <div class="lpActions">
        <button class="alt" data-act="deleteLine">Withdraw the service</button>
      </div>`;
  }

  // ── the ledger ─────────────────────────────────────────────────────────
  function refreshLedger() {
    const el = $('ledger');
    el.hidden = !ledgerOpen;
    if (!ledgerOpen) return;

    const lines = sim.lines.map((l) => {
      const st = l.stats || {};
      const net = (st.revenue ?? 0) - (st.upkeep ?? 0);
      return `<tr>
        <td><s class="swatch" style="background:${l.colour}"></s>${esc(l.name)}</td>
        <td class="num">${Math.round(st.revenue ?? 0)}</td>
        <td class="num dim">−${Math.round(st.upkeep ?? 0)}</td>
        <td class="num ${net >= 0 ? 'good' : 'bad'}">${net >= 0 ? '+' : ''}${Math.round(net)}</td>
      </tr>`;
    }).join('');

    const flows = (sim.flowLast || []).slice(0, 9).map((m) => {
      const a = sim.byId.get(m.from), b = sim.byId.get(m.to);
      if (!a || !b) return '';
      return `<div class="flowRow">
        <s class="goodDot" style="background:${GOODS[m.good].colour}"></s>
        <span class="fq">${m.amount.toFixed(1)}</span>
        <span class="fg">${esc(GOODS[m.good].name)}</span>
        <span class="fp">${esc(a.name)} → ${esc(b.name)}</span>
        <span class="fx">${m.hops > 1 ? `${m.hops - 1} change${m.hops > 2 ? 's' : ''}` : 'direct'}</span>
      </div>`;
    }).join('');

    const bots = sim.bottlenecks(4).map((b) => {
      const L = sim.links.find((x) => x.id === b.id);
      const price = L ? sim.worksPrice.double(L) : 0;
      const can = L && !L.doubled;
      return `<div class="botRow">
      <span class="nm">${esc(b.name)}</span>
      <div class="bar"><i style="width:${Math.round(b.load * 100)}%"></i></div>
      <span class="pc">${Math.round(b.load * 100)}%</span>
      ${can ? `<button class="botFix" data-double="${b.id}"
          ${price > sim.treasury ? 'disabled' : ''}
          title="Lay a second road: capacity up nine tenths, upkeep up three quarters"
        >Double it · ${price} cr</button>` : '<span class="botDone">double track</span>'}
    </div>`;
    }).join('');

    const wants = sim.wanting(6).map((w) => `<div class="wantRow">
      ${sigil(w.site.culture)}<span class="nm">${esc(w.site.name)}</span>
      <span class="wg">${esc(GOODS[w.good].name)}</span>
      <span class="wr">${esc(w.why)}</span>
    </div>`).join('');

    // which lands the network has actually reached, and what each does to track
    const entered = new Set();
    for (const L of sim.links) for (const r of L.regions || []) entered.add(r);
    const lands = [...entered].sort((a, b) => a - b).map((r) => {
      const lore = REGION_LORE[r];
      if (!lore) return '';
      return `<div class="landRow">
        <span class="nm">${esc(lore.name)}</span>
        <span class="lp">${esc(lore.people)}</span>
        <span class="lr">${esc(lore.rule)}</span>
      </div>`;
    }).join('');

    // ── raising money ──────────────────────────────────────────────────
    // Three lenders who charge in three different currencies: interest, obligation
    // and restraint. Which one you owe is a decision about the world, not a slider.
    const debts = (sim.debts || []).map((d) => {
      const L = LENDERS[d.lender];
      return `<div class="debtRow${d.missed ? ' late' : ''}">
        <span class="nm">${esc(L.name)}</span>
        <span class="num">${Math.round(d.owed)} owed</span>
        <span class="dr">${(d.rate * 100).toFixed(1)}%/wk</span>
        ${d.missed ? `<span class="lateTag">${d.missed} missed</span>` : ''}
        <button data-repay="${d.id}" ${sim.treasury < 20 ? 'disabled' : ''}
          title="Pay down what you can afford now">Repay</button>
      </div>`;
    }).join('');

    const lenders = LENDER_KEYS.map((k) => {
      const o = sim.lenderOffer(k);
      if (!o) return '';
      return `<div class="lenderRow${o.refuse ? ' shut' : ''}">
        <span class="nm">${sigil(o.people)}${esc(o.name)}</span>
        <span class="lb">${esc(o.blurb)}</span>
        <span class="ln">${esc(o.note)}</span>
        ${o.refuse
          ? `<span class="wr">${esc(o.refuse)}</span>`
          : `<button data-borrow="${k}" title="Take the largest advance they will make">
               Borrow ${o.cap} cr</button>`}
      </div>`;
    }).join('');

    const fares = sim.lines.reduce((n, l) => n + (l.stats?.revenue ?? 0), 0);
    // Net of the rows actually shown, so the column adds up. The treasury also
    // moves by whatever was spent on works, which is a decision, not an income.
    const ledgerNet = fares + (sim.lastGrant ?? 0) - (sim.lastUpkeep ?? 0);
    el.innerHTML = `
      <h3>The Ledger <button id="ledgerClose" class="ghost sm">✕</button></h3>

      <div class="ledSection">
        <h4>Receipts, week ${Math.max(1, sim.week - 1)}</h4>
        <table class="ledTable">
          ${lines || '<tr><td colspan="4" class="dim">No services running.</td></tr>'}
          <tr class="ledTotal"><td>Fares and freight</td><td colspan="2"></td>
            <td class="num good">+${Math.round(fares)}</td></tr>
          <tr><td>Council grant</td><td colspan="2"></td>
            <td class="num good">+${Math.round(sim.lastGrant ?? 0)}</td></tr>
          <tr><td>Maintenance and wages</td><td colspan="2"></td>
            <td class="num bad">−${Math.round(sim.lastUpkeep ?? 0)}</td></tr>
          <tr class="ledTotal"><td>Net, before works</td><td colspan="2"></td>
            <td class="num ${ledgerNet >= 0 ? 'good' : 'bad'}">${ledgerNet >= 0 ? '+' : ''}${Math.round(ledgerNet)}</td></tr>
        </table>
      </div>

      <div class="ledSection">
        <h4>What moved yesterday</h4>
        ${flows || '<p class="ledNote">Nothing moved. Check that a service runs where the goods are.</p>'}
      </div>

      ${bots ? `<div class="ledSection"><h4>Bottlenecks</h4>${bots}
        <p class="ledNote">A line at capacity carries no more however much is waiting. Add engines, or split the service.</p></div>` : ''}

      ${wants ? `<div class="ledSection"><h4>Wanting for something</h4>${wants}</div>` : ''}

      <div class="ledSection">
        <h4>Raising money</h4>
        ${debts ? `<div class="debts">${debts}</div>` : ''}
        ${lenders}
        <p class="ledNote">Borrowed money spends exactly like earned money. The difference
        is who is owed, and what they want instead of interest.</p>
      </div>

      <div class="ledSection">
        <h4>The lands you have entered</h4>
        ${lands || '<p class="ledNote">Only the home country, so far.</p>'}
      </div>`;
  }


  // ── commissions ────────────────────────────────────────────────────────
  //
  // The answer to "I don't understand the trade or have control over it". Trade
  // as a flow solve is legible only in aggregate; a commission is a sentence:
  // this cargo, to this place, by this week, for this fee, or else.

  function refreshCommissions() {
    const el = $('commissions');
    el.hidden = !commOpen;
    const btn = $('commBtn');
    const pending = sim.commissions.filter((c) => c.state === 'offered').length;
    if (btn) {
      btn.classList.toggle('pulse', pending > 0);
      btn.textContent = pending ? `Commissions (${pending})` : 'Commissions';
    }
    if (!commOpen) return;

    const card = (c) => {
      const to = sim.byId.get(c.to);
      const from = c.from ? sim.byId.get(c.from) : null;
      const left = c.due - sim.week;
      const pc = Math.min(100, Math.round((c.done / Math.max(1, c.need)) * 100));
      const what = c.class === 'people'
        ? `${c.label || 'passage'}${from ? ` from ${esc(from.name)}` : ''}${to ? ` to ${esc(to.name)}` : ''}`
        : `${c.need} × ${esc(goodName(c.good))}${to ? ` to ${esc(to.name)}` : ''}`;
      const taken = c.state === 'taken';
      return `<div class="comm ${c.state}${c.urgent ? ' urgent' : ''}">
        <div class="commHead">
          <b>${esc(c.title)}</b>
          <span class="commFee">${Math.round(c.fee)} cr</span>
        </div>
        <p class="commClient">${esc(c.client)}${c.urgent ? ' · urgent' : ''}</p>
        <p class="commWhat">${what}</p>
        ${c.state === 'offered' ? `<p class="commBody">${esc(c.body || '')}</p>` : ''}
        ${taken ? `<div class="commBar"><i style="width:${pc}%"></i></div>
          <p class="commProg">${c.class === 'people' ? `${pc}% carried` : `${c.done.toFixed(1)} of ${c.need}`}
            · ${left <= 0 ? 'due now' : `${left} week${left === 1 ? '' : 's'} left`}${c.stalled ? ' · no route' : ''}</p>` : ''}
        ${c.state === 'offered' ? `<div class="commActs">
            <button data-comm-take="${c.id}">Accept</button>
            <button class="alt" data-comm-drop="${c.id}">Decline</button>
          </div>` : ''}
        ${c.state === 'done' ? '<p class="commProg good">discharged</p>' : ''}
        ${c.state === 'failed' ? '<p class="commProg bad">not discharged</p>' : ''}
      </div>`;
    };

    const offered = sim.commissions.filter((c) => c.state === 'offered');
    const taken = sim.commissions.filter((c) => c.state === 'taken');
    const closed = sim.commissions.filter((c) => c.state === 'done' || c.state === 'failed');

    el.innerHTML = `
      <h3>Commissions <button id="commClose" class="ghost sm">✕</button></h3>
      ${offered.length ? `<div class="ledSection"><h4>Asked of the Authority</h4>${offered.map(card).join('')}</div>` : ''}
      ${taken.length ? `<div class="ledSection"><h4>In hand</h4>${taken.map(card).join('')}</div>` : ''}
      ${closed.length ? `<div class="ledSection"><h4>Closed</h4>${closed.map(card).join('')}</div>` : ''}
      ${!offered.length && !taken.length && !closed.length
        ? '<p class="ledNote">Nothing is being asked of the Authority. This is not usual and will not last.</p>' : ''}
      <p class="ledNote">A commission is discharged by ordinary working: run a service that carries the
        cargo to the place named, and deliveries count automatically. Freight wants tonnage;
        passage wants a route with passenger services on it.</p>`;
  }

  // ── the register ───────────────────────────────────────────────────────
  function refreshLog() {
    const list = $('logList');
    // Track by each entry's monotonic seq, NOT by array position: the sim's log is
    // capped at 220 and shifts, so a position cursor pins at 220 and the Register
    // silently freezes for the rest of a long game. (The same bug bit the test
    // harnesses; the UI had it too.)
    for (const e of sim.log) {
      if ((e.seq ?? 0) <= logShown) continue;
      logShown = e.seq;
      const div = document.createElement('div');
      div.className = `logEntry ${e.tone || 'plain'}${e.big ? ' big' : ''}`;
      const body = e.big ? illuminate(e.text) : paras(e.text);
      div.innerHTML = `<span class="wk">week ${e.week}</span>${plateFor(e.plate)}${body}`;
      list.prepend(div);
      while (list.children.length > 60) list.lastChild.remove();
    }
  }

  // ── settlement dossier ─────────────────────────────────────────────────
  let openSiteId = null;   // which settlement dossier is on screen, for live refresh
  function showSite(site) {
    openSiteId = site ? site.id : null;
    const el = $('inspector');
    el.hidden = false;
    const pct = (v) => `${Math.round(v * 100)}%`;
    const k = KINDS[site.kind];

    const needs = sim.needsOf(site).map((n) => `
      <div class="need ${n.met < 0.6 ? 'short' : ''}">
        <s style="background:${GOODS[n.good].colour}"></s>
        <span class="ng">${esc(GOODS[n.good].name)}</span>
        <span class="nq">${n.got.toFixed(1)} of ${n.want.toFixed(1)}</span>
        ${n.why ? `<span class="nwhy">${esc(n.why)}</span>` : ''}
      </div>`).join('');

    // What is standing on the platform. This is the most legible economic fact a
    // railway has — a heap of ore at a delve with no wagon for it — and it was the
    // one number the interface never showed.
    const wait = sim.waitingAt ? sim.waitingAt(site) : null;
    const platform = (wait && (wait.goods.length || wait.people >= 0.5)) ? `
      <div class="platform">
        <h5>On the platform</h5>
        ${wait.goods.slice(0, 5).map((x) => `
          <div class="waitRow">
            <s style="background:${GOODS[x.good].colour}"></s>
            <span class="ng">${esc(GOODS[x.good].name)}</span>
            <span class="nq">${x.amount.toFixed(1)} waiting</span>
          </div>`).join('')}
        ${wait.people >= 0.5 ? `
          <div class="waitRow people">
            <s style="background:#cbbb96"></s>
            <span class="ng">Passengers</span>
            <span class="nq">${Math.round(wait.people)} wanting to travel</span>
          </div>` : ''}
        ${!site.connected ? '<p class="ledNote">No rail reaches it. Nothing here can go anywhere.</p>' : ''}
      </div>` : '';

    const makes = [
      ...Object.keys(k.produce || {}).map((g) => `<span class="chip"><s style="background:${GOODS[g].colour}"></s>${esc(GOODS[g].name)} ↑</span>`),
      ...(k.make ? [`<span class="chip"><s style="background:${GOODS[k.make.out].colour}"></s>${esc(GOODS[k.make.out].name)} ⚒</span>`] : []),
    ].join('');

    const reach = sim.linesReaching(site.id);
    const addTo = reach.length && !openLine ? `
      <div class="svcChoice">
        <span class="lpLabel">Add as a call on</span>
        <div class="seg">${reach.slice(0, 3).map((l) =>
          `<button data-addto="${l.id}"><s class="swatch" style="background:${l.colour}"></s>${esc(l.name)}</button>`).join('')}</div>
      </div>` : '';

    el.innerHTML = `
      <h4>${sigil(site.culture)}${esc(site.name)} <em>${k.label} · ${TIER_NAME[site.tier]}</em></h4>
      <p class="sub2">${esc(REGION_NAME[site.region] || 'the wilds')}${site.abandoned ? ' · abandoned' : ''}${site.quarantined ? ' · closed' : ''}</p>
      <div class="kv">
        <div><i>people</i><b>${crowns(site.pop)}</b></div>
        <div><i>prosperity</i><b>${Math.round(site.prosperity)}</b></div>
        <div><i>needs met</i><b>${pct(site.satisfaction)}</b></div>
        <div><i>rail</i><b>${site.connected ? 'served' : 'none'}</b></div>
        ${site.plague > 0.05 ? `<div><i class="warn">sickness</i><b class="warn">${pct(site.plague)}</b></div>` : ''}
        ${site.unrest > 0.2 ? `<div><i class="warn">unrest</i><b class="warn">${pct(site.unrest)}</b></div>` : ''}
      </div>
      ${(site.traits || []).length ? `<p class="traits">${site.traits.map((t) =>
        `<span class="trait">${esc(TRAITS[t]?.label ?? t)}</span>`).join('')}</p>` : ''}
      ${needs ? `<div class="needs">${needs}</div>` : ''}
      ${platform}
      <div class="makes">${makes}</div>
      ${addTo}
      ${site.connected && !site.abandoned ? (() => {
        const price = sim.worksPrice.station(site);
        const lvl = site.works || 0;
        return lvl >= 3
          ? '<p class="worksNote">Station works: as large as the place can bear.</p>'
          : `<div class="worksRow">
              <span class="lpLabel">Station</span>
              <button data-station="${site.id}" ${price > sim.treasury ? 'disabled' : ''}
                title="A second platform and a canopy: more passengers, and a taste for finer things"
              >${lvl ? 'Enlarge again' : 'Enlarge the station'} · ${price} cr</button>
              ${lvl ? `<i>works ${'I'.repeat(lvl)}</i>` : ''}
            </div>`;
      })() : ''}
      <div class="actions">
        <span class="note">${openLine ? 'Adding to the open service.' : 'Click another settlement to survey a line from here.'}</span>
        <button class="alt" data-act="clear">Done</button>
      </div>`;
  }


  // ── the engine card ────────────────────────────────────────────────────
  // An engine is the only thing in the game the player watches move, so it has a
  // name, a class, a shed, a record, and a button that makes it whistle.
  const CLASS_OF = {
    dwarf: 'Dwarf-built', men: 'March-built', elf: 'Elven', orc: 'Ashen',
  };

  function showEngine(eng, ctx = {}) {
    openSiteId = null;
    if (!eng) { $('inspector').hidden = true; return; }
    const cls = sim.engineClass(eng);
    const cond = clamp(eng.condition ?? 1, 0, 1);
    const overhaulPrice = sim.overhaulPrice(eng);
    const el = $('inspector');
    el.hidden = false;
    const line = sim.lines.find((l) => l.id === eng.lineId);
    const at = ctx.at ? sim.byId.get(ctx.at) : null;
    const heading = ctx.heading || null;
    el.innerHTML = `
      <h4><span class="rune">${esc((CULTURE_RUNE[eng.style === 'men' ? 'men' : eng.style] || 'ᛗ'))}</span>${esc(eng.name)}
        <em>${esc(CLASS_OF[eng.style] || eng.style)} · engine no. ${eng.id}</em></h4>
      <p class="sub2">${line ? `working ${esc(line.name)}` : 'in the shed'}${
        at ? ` · standing at ${esc(at.name)}` : heading ? ` · next stop ${esc(heading)}` : ''}</p>
      <div class="kv">
        <div><i>run</i><b>${Math.round(eng.dist).toLocaleString('en-GB')}</b></div>
        <div><i>carried</i><b>${Math.round(eng.loads).toLocaleString('en-GB')}</b></div>
        <div><i>in service</i><b>wk ${eng.since}</b></div>
        <div><i>incidents</i><b class="${eng.incidents ? 'warn' : ''}">${eng.incidents}</b></div>
      </div>
      <p class="engRec">${esc(engineRecord(eng, sim.week))}</p>
      <div class="engPortrait">${drawLoco(eng.cls, { w: 232, condition: cond })}</div>
      ${(() => {
        // The rolling stock, drawn: what this engine is actually pulling right now.
        const cars = hooks.consistOf ? hooks.consistOf(eng.id) : null;
        if (!cars || !cars.length) return '';
        const named = cars.map((c) => c === 'brake' ? 'brake van'
          : c === 'passenger' ? 'carriage' : c === 'barrel' ? 'casks' : c).join(' · ');
        return `<div class="stockStrip">${drawConsist(cars, { w: 240 })}
          <span class="stockList">${esc(named)}</span></div>`;
      })()}
      <div class="engClass">
        <span class="nm">${esc(cls.name)}</span>
        <span class="bl">${esc(cls.builder)}</span>
        <span class="condLabel">${cond > 0.85 ? 'in good order'
          : cond > 0.6 ? 'run in' : cond > 0.35 ? 'tired' : 'worn out'}</span>
        <span class="condBar"><i style="width:${Math.round(cond * 100)}%"></i></span>
        <span class="engStats">haul ${cls.power.toFixed(2)} · speed ${cls.speed.toFixed(2)}
          · appeal ${cls.grace.toFixed(2)} · endurance ${cls.stamina.toFixed(1)}
          · ${cls.upkeep} cr/wk${eng.overhauls ? ` · ${eng.overhauls} overhauled` : ''}</span>
        ${cls.refuses ? `<span class="refuses">Will not take ${cls.refuses.map((g) =>
          esc(GOODS[g]?.name?.toLowerCase() ?? g)).join(', ')}.</span>` : ''}
      </div>
      <div class="actions">
        <button data-eng="ride">${hooks.isFollowing() ? 'Stop riding' : 'Ride with it'}</button>
        <button class="alt" data-eng="whistle">Sound the whistle</button>
        ${cond <= 0.92 ? `<button class="alt" data-overhaul="${eng.id}"
          ${overhaulPrice > sim.treasury ? 'disabled' : ''}
          title="Put her right: back to as-new condition">Overhaul · ${overhaulPrice} cr</button>` : ''}
        ${line ? `<button class="alt" data-eng="line">Open ${esc(line.name)}</button>` : ''}
        <button class="alt" data-act="clear">Done</button>
      </div>`;
  }

  // ── survey card ────────────────────────────────────────────────────────
  let svcChoice = 'new';
  function showSurvey(a, b, survey) {
    openSiteId = null;
    const el = $('inspector');
    el.hidden = false;
    if (!survey.ok) {
      el.innerHTML = `
        <h4>${esc(a.name)} → ${esc(b.name)} <em>survey refused</em></h4>
        <p class="sub2 warn">${esc(survey.reason)}</p>
        <div class="actions"><button class="alt" data-act="clear">Very well</button></div>`;
      return;
    }
    const mix = {};
    for (const sp of survey.spans) mix[sp.kind] = (mix[sp.kind] || 0) + sp.length;
    const works = Object.entries(mix).sort((x, y) => y[1] - x[1])
      .map(([kk, v]) => `<span class="works ${kk}">${WORKS_NAME[kk]} ${Math.round(v)}</span>`).join('');
    const afford = survey.price <= sim.treasury;
    const perilWord = survey.peril < 0.12 ? 'quiet' : survey.peril < 0.3 ? 'watched'
      : survey.peril < 0.5 ? 'dangerous' : 'no sane route';

    // extending an existing service is a decision, not something done for you
    const cand = sim.lines.filter((l) => {
      const f = l.stops[0], t = l.stops[l.stops.length - 1];
      return l.stops.length < 9 && (t === a.id || t === b.id || f === a.id || f === b.id);
    }).slice(0, 2);
    if (!cand.some((l) => String(l.id) === svcChoice)) svcChoice = 'new';

    el.innerHTML = `
      <h4>${esc(a.name)} → ${esc(b.name)} <em>survey</em></h4>
      <p class="sub2">${Math.round(survey.length)} units of line${survey.tunnels ? `, ${survey.tunnels} tunnel${survey.tunnels > 1 ? 's' : ''}` : ''}${survey.piers ? `, ${survey.piers} piers` : ''}</p>
      <div class="kv">
        <div><i>to build</i><b class="${afford ? '' : 'warn'}">${crowns(survey.price)} cr</b></div>
        <div><i>upkeep</i><b>${survey.upkeep.toFixed(1)}/wk</b></div>
        <div><i>country</i><b>${perilWord}</b></div>
        <div><i>treasury</i><b>${crowns(sim.treasury)} cr</b></div>
      </div>
      <div class="worksrow">${works}</div>
      <div class="svcChoice">
        <span class="lpLabel">Run it as</span>
        <div class="seg">
          <button data-svc="new" class="${svcChoice === 'new' ? 'on' : ''}">A new service</button>
          ${cand.map((l) => `<button data-svc="${l.id}" class="${svcChoice === String(l.id) ? 'on' : ''}">
            <s class="swatch" style="background:${l.colour}"></s>Extend ${esc(l.name)}</button>`).join('')}
        </div>
      </div>
      <div class="actions">
        <button data-act="build" ${afford ? '' : 'disabled'}>${afford ? 'Authorise the works' : 'Cannot pay for it'}</button>
        <button class="alt" data-act="clear">Abandon the survey</button>
      </div>`;
  }

  function hideInspector() { openSiteId = null; $('inspector').hidden = true; }

  // ── modals ─────────────────────────────────────────────────────────────
  let modalKind = '';
  function openModal(html, cls = '', kind = '') {
    modalOpen = true;
    modalKind = kind;
    $('modalCard').className = `modal-card ${cls}`;
    $('modalCard').innerHTML = html;
    $('modal').hidden = false;
  }
  function closeModal() { modalOpen = false; modalKind = ''; $('modal').hidden = true; }

  /**
   * What Escape means depends on what the modal is.
   *
   * Escape used to call closeModal() unconditionally, and the main loop re-raises
   * an unanswered charter or petition every 0.28s — so the card blinked shut and
   * reopened, forever. Now: a charter dismissed this way is DEFERRED (the same as
   * clicking "leave it on the table"), a petition stays put because it is a
   * decision the realm is waiting on, and anything else simply closes.
   */
  function dismissModal() {
    if (!modalOpen) return false;
    if (modalKind === 'petition') return false;   // it must be answered
    if (modalKind === 'charter') { deferred = true; deferredAt = sim.charterSat ?? -1; }
    closeModal();
    refreshTop();
    return true;
  }

  function showCharters(offer) {
    const cards = offer.map((c) => `
      <button class="charter" data-charter="${c.id}">
        <span class="tag">${c.kind}</span>
        <b>${esc(c.name)}</b>
        <span class="bl">${esc(c.blurb)}</span>
        ${c.note ? `<span class="nt">${esc(c.note)}</span>` : ''}
      </button>`).join('');
    openModal(`
      <p class="eyebrow">Week ${sim.week} · in session</p>
      <h2>The Council Will Grant One Charter</h2>
      <p class="from">Minuted, and not open to further discussion this quarter.</p>
      <div class="charters">${cards}</div>
      <div class="deferrow"><button class="ghost" data-act="defer">Leave it on the table for now</button></div>`, '', 'charter');
  }

  function showPetition(p) {
    const opts = p.options.map((o, i) => `
      <button class="choice${/concession|proceed/i.test(o.label) ? ' ominous' : ''}" data-opt="${i}">
        <b>${esc(o.label)}</b><span>${esc(o.note)}</span>
      </button>`).join('');
    openModal(`
      <p class="eyebrow">Week ${sim.week} · correspondence</p>
      <h2>${esc(p.title)}</h2>
      <p class="from">from ${esc(p.from)}</p>
      <div class="body">${illuminate(p.body)}</div>
      <div class="choices">${opts}</div>`, '', 'petition');
  }

  function showEnding(id) {
    const e = ENDINGS[id] || ENDINGS.survived;
    const s = sim;
    openModal(`
      <p class="eyebrow">The final entry · week ${s.week}</p>
      <h2>${esc(e.title)}</h2>
      <p class="from">Realm Transit Authority, ${esc(s.seed)}</p>
      <div class="body">${illuminate(e.body(s))}</div>
      <div class="tally">
        <div><i>line built</i><b>${crowns(s.links.reduce((n, L) => n + L.length, 0))}</b></div>
        <div><i>loads carried</i><b>${crowns(s.stats.loadsMoved)}</b></div>
        <div><i>fares taken</i><b>${crowns(s.stats.fares)}</b></div>
        <div><i>places joined</i><b>${s.connectedCount()}</b></div>
        <div><i>incidents</i><b>${s.stats.incidents}</b></div>
        <div><i>great cities</i><b>${s.sites.filter((x) => x.tier >= 4 && !x.abandoned).length}</b></div>
      </div>
      <div class="choices"><button class="choice" data-act="restart"><b>Take up the post again</b><span>A new realm, a new timetable.</span></button></div>`, 'ending');
  }

  // ── standing orders ────────────────────────────────────────────────────
  // A game with this many levers has to say that the levers exist. Four steps,
  // each satisfied by doing the thing rather than by clicking "next", and
  // dismissable at any point.
  const ORDERS = [
    {
      id: 'connect',
      text: 'Connect two settlements. Click one, then another: the surveyors will find a route and price it. A Delve cannot grow food; a Shire has no iron. Join them.',
      done: (s) => s.links.length >= 1,
    },
    {
      id: 'service',
      // Measured, not promised: over an identical network, only the policy varying,
      // Freight earns 31% more than Passengers while Passengers carry seven times
      // the people. Tonnage barely moves either way, because what limits tonnage is
      // how many producers you have joined up — not how you run the trains. Saying
      // "Freight shifts half again as much tonnage" was a promise the sim cannot keep.
      text: 'Open the service in <b>The Fleet</b> below. Choose what it <b>carries</b> — Freight pays better by the ton, Passengers carry many times the people — and how much it <b>charges</b>. Neither moves more tonnage: for that, join up more of the places that make things.',
      done: (s) => s.lines.some((l) => l.policy !== 'mixed' || l.fare !== 1),
    },
    {
      id: 'extend',
      text: 'With a service open, clicking a settlement adds it as a further call. Reorder the calls, or split a long service into a trunk and a branch.',
      done: (s) => s.lines.some((l) => l.stops.length >= 3),
    },
    {
      id: 'ledger',
      text: 'Open the <b>Ledger</b> in the top bar. It shows what each service earns, what moved yesterday, where the line is at capacity, and which settlements are going without — and why.',
      done: () => ledgerSeen,
    },
  ];
  let ledgerSeen = false;
  let ordersDone = false;

  // Completed orders LATCH. The predicates read live state, so losing your only
  // link to an incident marched the guide back to step one — a tutorial that
  // un-completes itself reads as the game forgetting what you did.
  const ordersLatched = new Set();
  function refreshGuide() {
    const el = $('guide');
    if (ordersDone) { el.hidden = true; return; }
    for (const o of ORDERS) {
      if (!ordersLatched.has(o.id) && o.done(sim)) ordersLatched.add(o.id);
    }
    const step = ORDERS.find((o) => !ordersLatched.has(o.id));
    if (!step) {
      ordersDone = true;
      el.hidden = true;
      hint('Standing orders complete. The realm is yours to ruin.', 5000);
      return;
    }
    el.hidden = false;
    const n = ORDERS.indexOf(step) + 1;
    $('guideBody').innerHTML =
      `<p class="guideStep">${n} of ${ORDERS.length}</p><p class="guideText">${step.text}</p>`;
  }

  $('guideSkip').addEventListener('click', () => { ordersDone = true; $('guide').hidden = true; });

  // ── the cartouche ──────────────────────────────────────────────────────
  // Names the land under the camera, the way a map does. The lands existed in the
  // simulation from the start and the player had no way of knowing which was which.
  let cartRegion = -1, cartTimer = 0;
  function showRegion(regionId) {
    if (regionId === cartRegion) return;
    cartRegion = regionId;
    const lore = REGION_LORE[regionId];
    if (!lore) return;
    const el = $('cartouche');
    el.firstChild.textContent = lore.name;
    el.lastChild.textContent = lore.gist;
    el.classList.add('show');
    clearTimeout(cartTimer);
    cartTimer = setTimeout(() => el.classList.remove('show'), 4200);
  }

  // ── hint ───────────────────────────────────────────────────────────────
  let hintTimer = 0;
  function hint(text, ms = 3400) {
    const el = $('hint');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => el.classList.remove('show'), ms);
  }

  // ── wiring ─────────────────────────────────────────────────────────────
  $('modal').addEventListener('click', (ev) => {
    const ch = ev.target.closest('[data-charter]');
    if (ch) { deferred = false; hooks.takeCharter(ch.dataset.charter); closeModal(); return; }
    const op = ev.target.closest('[data-opt]');
    if (op) { hooks.answerPetition(+op.dataset.opt); closeModal(); return; }
    if (ev.target.closest('[data-act="restart"]')) { hooks.restart(); return; }
    if (ev.target.closest('[data-act="defer"]')) { deferred = true; deferredAt = sim.charterSat ?? -1; closeModal(); refreshTop(); return; }
  });

  $('inspector').addEventListener('click', (ev) => {
    const ovh = ev.target.closest('[data-overhaul]');
    if (ovh) { hooks.overhaul(+ovh.dataset.overhaul); return; }
    const svc = ev.target.closest('[data-svc]');
    if (svc) { svcChoice = svc.dataset.svc; hooks.reshowSurvey(); return; }
    const stw = ev.target.closest('[data-station]');
    if (stw) { hooks.stationWorks(+stw.dataset.station); return; }
    const add = ev.target.closest('[data-addto]');
    if (add) { hooks.addStopToLine(+add.dataset.addto); return; }
    const en = ev.target.closest('[data-eng]');
    if (en) {
      if (en.dataset.eng === 'ride') hooks.toggleRide();
      else if (en.dataset.eng === 'whistle') hooks.whistle();
      else if (en.dataset.eng === 'line') hooks.openEngineLine();
      return;
    }
    const b = ev.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'build') hooks.build(svcChoice);
    else if (b.dataset.act === 'clear') hooks.clearSelection();
  });

  $('lineList').addEventListener('click', (ev) => {
    const buy = ev.target.closest('[data-buy-eng]');
    if (buy) { fleetShopOpen = true; hooks.buyEngine(buy.dataset.buyEng); return; }
    const chip = ev.target.closest('[data-eng-id]');
    if (chip) { hooks.selectEngine(+chip.dataset.engId); return; }
    const row = ev.target.closest('[data-line]');
    if (row) hooks.selectLine(+row.dataset.line);
  });

  $('linePanel').addEventListener('click', (ev) => {
    const line = sim.lines.find((l) => l.id === openLine);
    if (!line) return;
    const t = ev.target;
    const rg = t.closest('[data-regrade]');
    if (rg) { hooks.regradeLine(+rg.dataset.regrade); return; }
    const ft = t.closest('[data-fortify]');
    if (ft) { hooks.fortifyLine(+ft.dataset.fortify); return; }
    const cars = t.closest('[data-cars]');
    if (cars) { hooks.setLineCars(openLine, +cars.dataset.cars); return; }
    const pol = t.closest('[data-policy]');
    if (pol) { sim.setPolicy(line.id, pol.dataset.policy); afterLineEdit(); return; }
    const fr = t.closest('[data-fare]');
    if (fr) { sim.setFare(line.id, +fr.dataset.fare); afterLineEdit(); return; }
    const tr = t.closest('[data-tr]');
    if (tr) { hooks.adjustTrains(line.id, +tr.dataset.tr); refreshLinePanel(); refreshFleet(); return; }
    const li = t.closest('[data-stop]');
    const act = t.closest('[data-act]');
    if (li && act) {
      const id = +li.dataset.stop;
      const a = act.dataset.act;
      let r = { ok: true };
      if (a === 'up') r = sim.moveStop(line.id, id, -1);
      else if (a === 'down') r = sim.moveStop(line.id, id, 1);
      else if (a === 'drop') r = sim.removeStop(line.id, id);
      else if (a === 'split') r = sim.splitLine(line.id, id);
      if (!r.ok && r.reason) hint(r.reason);
      afterLineEdit();
      return;
    }
    if (act) {
      if (act.dataset.act === 'closeLine') { hooks.selectLine(null); return; }
      if (act.dataset.act === 'deleteLine') { sim.deleteLine(line.id); hooks.selectLine(null); afterLineEdit(); return; }
    }
  });
  $('linePanel').addEventListener('change', (ev) => {
    const line = sim.lines.find((l) => l.id === openLine);
    if (!line) return;
    if (ev.target.matches('[data-act="warden"]')) { sim.setWarden(line.id, ev.target.checked); afterLineEdit(); }
  });
  $('linePanel').addEventListener('input', (ev) => {
    const line = sim.lines.find((l) => l.id === openLine);
    if (line && ev.target.classList.contains('lpName')) sim.renameLine(line.id, ev.target.value);
  });

  function afterLineEdit() {
    refreshLinePanel();
    refreshFleet();
    refreshLedger();
    hooks.networkChanged();
  }

  $('regToggle').addEventListener('click', () => {
    $('register').classList.toggle('collapsed');
    $('regToggle').textContent = $('register').classList.contains('collapsed') ? '▸' : '▾';
  });

  $('commBtn').addEventListener('click', () => {
    commOpen = !commOpen;
    // Opening a panel is "switching to another option": stop riding the train, or the
    // camera keeps chasing it behind the panel the player is now reading.
    if (commOpen) {
      ledgerOpen = false; $('ledgerBtn').classList.remove('on'); refreshLedger();
      hooks.stopRiding?.();
    }
    $('commBtn').classList.toggle('on', commOpen);
    refreshCommissions();
  });
  $('commissions').addEventListener('click', (ev) => {
    if (ev.target.closest('#commClose')) {
      commOpen = false; $('commBtn').classList.remove('on'); refreshCommissions(); return;
    }
    const take = ev.target.closest('[data-comm-take]');
    if (take) { hooks.takeCommission(+take.dataset.commTake); return; }
    const dbl = ev.target.closest('[data-double]');
    if (dbl) { hooks.doubleTrack(+dbl.dataset.double); return; }
    const drop = ev.target.closest('[data-comm-drop]');
    if (drop) { hooks.dropCommission(+drop.dataset.commDrop); return; }
  });

  $('ledgerBtn').addEventListener('click', () => {
    ledgerOpen = !ledgerOpen;
    if (ledgerOpen) {
      commOpen = false; $('commBtn').classList.remove('on'); refreshCommissions();
      hooks.stopRiding?.();
    }
    if (ledgerOpen) ledgerSeen = true;
    $('ledgerBtn').classList.toggle('on', ledgerOpen);
    refreshLedger();
    refreshGuide();
  });
  $('ledger').addEventListener('click', (ev) => {
    const bor = ev.target.closest('[data-borrow]');
    if (bor) { hooks.borrow(bor.dataset.borrow); return; }
    const rep = ev.target.closest('[data-repay]');
    if (rep) { hooks.repay(+rep.dataset.repay); return; }
    const dbl = ev.target.closest('[data-double]');
    if (dbl) { hooks.doubleTrack(+dbl.dataset.double); return; }
    if (ev.target.closest('#ledgerClose')) {
      ledgerOpen = false;
      $('ledgerBtn').classList.remove('on');
      refreshLedger();
    }
  });

  for (const b of document.querySelectorAll('.speeds button')) {
    b.addEventListener('click', () => hooks.setSpeed(+b.dataset.speed));
  }
  $('muteBtn').addEventListener('click', () => hooks.toggleMute());
  $('charterBtn').addEventListener('click', () => {
    deferred = false;
    if (sim.charterOffer) showCharters(sim.charterOffer);
  });

  return {
    refresh() {
      refreshTop(); refreshConcord(); refreshFleet(); refreshLog();
      // The settlement dossier re-renders live. It used to be a snapshot, so a
      // works button disabled for want of money stayed disabled after the money
      // arrived, and "On the platform" figures froze at whatever they were when
      // the card was opened.
      if (openSiteId !== null) {
        const st = sim.byId.get(openSiteId);
        if (st) showSite(st); else hideInspector();
      }
      refreshLinePanel(); refreshLedger(); refreshCommissions(); refreshGuide();
    },
    refreshTop, refreshFleet, refreshLog, refreshLinePanel, refreshLedger,
    refreshCommissions, refreshGuide,
    showSite, showSurvey, showEngine, hideInspector,
    showCharters, showPetition, showEnding, closeModal, dismissModal,
    get modalOpen() { return modalOpen; },
    // deferral binds to ONE council sitting; a new offer raises the card again
    get charterDeferred() { return deferred && deferredAt === (sim.charterSat ?? -1); },
    get openLine() { return openLine; },
    get surveyChoice() { return svcChoice; },
    hint, showRegion,
    setSpeedButtons(v) {
      for (const b of document.querySelectorAll('.speeds button')) {
        b.classList.toggle('on', +b.dataset.speed === v);
      }
    },
    setSelectedLine(id) { openLine = id; refreshFleet(); refreshLinePanel(); },
    setMuted(m) { $('muteBtn').textContent = m ? '♪̸' : '♪'; $('muteBtn').style.opacity = m ? 0.45 : 1; },
  };
}
