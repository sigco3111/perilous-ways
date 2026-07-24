// Commissions: somebody wants a specific thing moved to a specific place by a
// specific week, and there are consequences either way.
//
// This exists because trade was invisible and uncontrollable. The flow solver is
// good at answering "what does the network do", and hopeless at answering "what
// am I trying to achieve". A commission is the second question made explicit: a
// named client, a named cargo, a named destination, a deadline, a fee, and a
// penalty. It is also where the fantasy gets in — a siege wants arms, a plague
// wants athelas, a wedding wants wine, and pilgrims want somewhere to be.

import { GOODS, VALUE } from './model.js';

export const CLASSES = {
  freight: { label: 'Freight' },
  people: { label: 'Passage' },
};

/**
 * A commission in flight.
 * { id, kind, class, client, title, body, good, need, done, to, from,
 *   fee, weeks, due, week, state, onDone, onFail, urgent }
 */

export function createCommissions() {
  let nextId = 1;

  /** Offer a commission. It sits in the tray until accepted or it lapses. */
  function offer(s, spec) {
    const c = {
      id: nextId++,
      state: 'offered',
      class: spec.class || 'freight',
      done: 0,
      week: s.week,
      due: s.week + (spec.weeks ?? 6),
      ...spec,
    };
    s.commissions.push(c);
    s.emit('commission_offered', { commission: c });
    return c;
  }

  /**
   * The client collects. Each day, a live freight commission takes what it can
   * from the stock standing at its destination.
   *
   * Crediting only *new* deliveries was subtly broken: a commission to a place
   * that was already well supplied could never progress, because the flow solver
   * saw no shortfall and moved nothing. What the client actually wants is N of X
   * to be AT Y, so that is what is measured.
   */
  function collect(s, dtDays) {
    for (const c of s.commissions) {
      if (c.state !== 'taken' || c.class !== 'freight' || !c.good) continue;
      const dest = s.byId.get(c.to);
      if (!dest || dest.abandoned) { c.stalled = true; continue; }
      c.stalled = false;
      const left = c.need - c.done;
      if (left <= 0) { complete(s, c); continue; }
      // a client can take delivery of a fair share per day, not the whole lot at once
      const rate = Math.max(0.35, c.need / Math.max(1, (c.weeks ?? 6) * 3.5));
      const take = Math.min(left, dest.stock[c.good] || 0, rate * dtDays);
      if (take <= 0.001) continue;
      dest.stock[c.good] -= take;
      c.done += take;
      if (c.done >= c.need) complete(s, c);
    }
  }

  /** Credit a delivery against every live commission it could satisfy. */
  function credit(s, good, toSiteId, amount) {
    for (const c of s.commissions) {
      if (c.state !== 'taken') continue;
      if (c.class !== 'freight') continue;
      if (c.good !== good) continue;
      if (c.to !== toSiteId) continue;
      c.done += amount;
      if (c.done >= c.need) complete(s, c);
    }
  }

  /**
   * Passage commissions are satisfied by the network simply *being* adequate:
   * a route from origin to destination, with enough passenger capacity along it.
   */
  function tickPassage(s, dtWeeks) {
    for (const c of s.commissions) {
      if (c.state !== 'taken' || c.class !== 'people') continue;
      const h = s.hopsTo(c.from, c.to);
      if (!h) { c.stalled = true; continue; }
      c.stalled = false;
      // how much passenger service the route actually carries
      let pull = 0;
      for (const line of s.lines) {
        if (!s.enginesOf(line.id).length) continue;
        const ids = s.lineLinks(line);
        if (!ids) continue;
        if (h.hops.some((id) => ids.includes(id))) pull += s.linePax(line) * line.trains;
      }
      if (pull <= 0) continue;
      c.done += Math.min(pull * 1.7, c.need * 0.55) * dtWeeks;
      if (c.done >= c.need) complete(s, c);
    }
  }

  function complete(s, c) {
    if (c.state !== 'taken') return;
    c.state = 'done';
    c.done = c.need;
    s.treasury += c.fee;
    s.stats.commissionsDone = (s.stats.commissionsDone || 0) + 1;
    s.stats.commissionFees = (s.stats.commissionFees || 0) + c.fee;
    try { c.onDone?.(s, c); } catch { /* a reward must never break the week */ }
    s.emit('commission_done', { commission: c });
  }

  function fail(s, c) {
    if (c.state !== 'taken' && c.state !== 'offered') return;
    const wasTaken = c.state === 'taken';
    c.state = wasTaken ? 'failed' : 'lapsed';
    if (wasTaken) {
      s.stats.commissionsFailed = (s.stats.commissionsFailed || 0) + 1;
      try { c.onFail?.(s, c); } catch { /* ditto */ }
    }
    s.emit(wasTaken ? 'commission_failed' : 'commission_lapsed', { commission: c });
  }

  return {
    offer, credit, collect, tickPassage, complete, fail,

    accept(s, id) {
      const c = s.commissions.find((x) => x.id === id);
      if (!c || c.state !== 'offered') return { ok: false };
      c.state = 'taken';
      c.due = s.week + (c.weeks ?? 6);
      s.emit('commission_taken', { commission: c });
      return { ok: true, commission: c };
    },

    decline(s, id) {
      const c = s.commissions.find((x) => x.id === id);
      if (!c || c.state !== 'offered') return { ok: false };
      c.state = 'declined';
      try { c.onDecline?.(s, c); } catch { /* ditto */ }
      s.emit('commission_declined', { commission: c });
      return { ok: true };
    },

    /** Weekly housekeeping: expire what is out of time, tidy what is finished. */
    week(s) {
      for (const c of s.commissions) {
        if ((c.state === 'taken' || c.state === 'offered') && s.week > c.due) fail(s, c);
      }
      // keep the tray short; finished business moves to the tally
      s.commissions = s.commissions.filter(
        (c) => c.state === 'offered' || c.state === 'taken' || s.week - c.due < 3,
      );
    },

    live: (s) => s.commissions.filter((c) => c.state === 'taken'),
    offered: (s) => s.commissions.filter((c) => c.state === 'offered'),
  };
}

/** A fair fee for hauling `n` of `good`, given how far and how urgent. */
export function priceOf(good, n, weeks, urgency = 1) {
  const base = (VALUE[good] ?? 3) * n * 2.4;
  const haste = weeks <= 3 ? 1.7 : weeks <= 5 ? 1.3 : 1.0;
  return Math.round(base * haste * urgency);
}

export const goodName = (g) => GOODS[g]?.name ?? g;
