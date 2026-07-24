// Chooses what the Register says, and guarantees it does not repeat.
//
// The corpus in ../text/reports.js is written to rotate documentary forms —
// minute, letter, wire, invoice, notice, single line, and so on. Two rules make
// that rotation actually felt in play:
//
//   1. Nothing is ever said twice in one run. Entries are drawn without
//      replacement and the pool only resets when it is exhausted.
//   2. No two consecutive entries share a form. The old corpus had one shape and
//      the reader heard the machinery within a dozen reports.

import * as CORPUS from '../text/reports.js';

const asArray = (v) => (Array.isArray(v) ? v : []);

export function createRegistry(rng) {
  const used = new Set();          // entry ids already spent this run
  const recentForms = [];          // last two forms, to avoid consecutive repeats

  function eligible(entry, ctx) {
    if (!entry) return false;
    if (entry.id && used.has(entry.id)) return false;
    if (entry.age && (ctx.age ?? 1) < entry.age) return false;
    if (entry.regions && entry.regions.length) {
      const have = ctx.regionsReached;
      if (!have || !entry.regions.some((r) => have.has(r))) return false;
    }
    if (entry.kinds && entry.kinds.length) {
      if (!ctx.kindsReached || !entry.kinds.some((k) => ctx.kindsReached.has(k))) return false;
    }
    if (entry.cultures && entry.cultures.length) {
      if (!ctx.culture || !entry.cultures.includes(ctx.culture)) return false;
    }
    if (typeof entry.when === 'function') {
      try { if (!entry.when(ctx)) return false; } catch { return false; }
    }
    return true;
  }

  /** Weighted draw, biased away from whatever form was used last. */
  function draw(pool, ctx) {
    let cand = asArray(pool).filter((e) => eligible(e, ctx));
    if (!cand.length) {
      // pool exhausted: forget what has been said and start again rather than
      // going silent, which reads worse than an occasional repeat
      for (const e of asArray(pool)) if (e.id) used.delete(e.id);
      cand = asArray(pool).filter((e) => eligible(e, ctx));
      if (!cand.length) return null;
    }
    const fresh = cand.filter((e) => !recentForms.includes(e.form));
    const from = fresh.length ? fresh : cand;
    let total = 0;
    for (const e of from) total += (e.weight ?? 5);
    let r = rng() * total;
    let chosen = from[0];
    for (const e of from) { r -= (e.weight ?? 5); if (r <= 0) { chosen = e; break; } }
    if (chosen.id) used.add(chosen.id);
    if (chosen.form) {
      recentForms.push(chosen.form);
      if (recentForms.length > 2) recentForms.shift();
    }
    return chosen;
  }

  function render(entry, ctx) {
    if (!entry) return null;
    try {
      const t = typeof entry.text === 'function' ? entry.text(ctx) : entry.text;
      const s = String(t ?? '').trim();
      return s || null;
    } catch {
      return null;
    }
  }

  /** Draw and render in one go. Returns { text, tone, form } or null. */
  function take(poolName, ctx) {
    const pool = CORPUS[poolName];
    const entry = draw(pool, ctx);
    const text = render(entry, ctx);
    if (!text) return null;
    return { text, tone: entry.tone || 'wry', form: entry.form || null, id: entry.id };
  }

  /** For keyed pools such as CROSSING and INCIDENTS. */
  function takeKeyed(poolName, key, ctx) {
    const group = CORPUS[poolName];
    if (!group) return null;
    const pool = Array.isArray(group) ? group : group[key];
    const entry = draw(pool, ctx);
    const text = render(entry, ctx);
    if (!text) return null;
    return { text, tone: entry.tone || 'wry', form: entry.form || null, id: entry.id };
  }

  return {
    take, takeKeyed,
    has: (poolName) => asArray(CORPUS[poolName]).length > 0
      || (CORPUS[poolName] && typeof CORPUS[poolName] === 'object'),
    spent: () => used.size,
  };
}
