// One correct implementation of "build a starting network", shared by every
// browser-driving harness.
//
// I got this wrong twice in separate harnesses and both times it invented a bug in
// the game that did not exist:
//   - `survey()` returns `price`, not `cost`. Comparing `r.cost > treasury` is
//     `undefined > n` === false, so the affordability guard never fired.
//   - `.link` is on the result of `build()`, NOT on the survey. Reading
//     `survey.link.a` is undefined, so createLine([undefined, undefined]) failed
//     silently and the harness reported "lines: 0, engines 0 of 3" — which looked
//     exactly like a game that builds track carrying nothing.
//   - No settlement starts `connected`, so the first line must join two unconnected
//     places; only after that does extending the network make sense.
// Track alone carries nothing: main.js's build hook also opens a line and puts an
// engine on it, so any harness that skips that renders a map reading UNSERVED.

/**
 * Grow a network of up to `n` links in the live page and put engines to work.
 * @returns {Promise<string[]>} human-readable log lines
 */
export function growNetwork(page, n = 4) {
  return page.evaluate((count) => {
    const { sim } = window.PW;
    const out = [];
    // `site.connected` is only recomputed on a tick, so within one burst of builds
    // it stays false and a naive picker chooses the same pair every iteration and
    // dies on "already built". Track what we have just joined ourselves.
    const joined = new Set();
    const isOn = (x) => x.connected || joined.has(x.id);
    for (let k = 0; k < count; k++) {
      const conn = sim.sites.filter((x) => isOn(x) && !x.abandoned);
      const from = conn.length ? conn : sim.sites.filter((x) => !x.abandoned);
      let best = null;
      for (const a of from) {
        for (const b of sim.sites) {
          if (b === a || b.abandoned || (conn.length && isOn(b))) continue;
          const d = Math.hypot(a.x - b.x, a.z - b.z);
          if (d < 20) continue;
          const sc = ((a.pop || 20) + (b.pop || 20)) / (d + 60);
          if (!best || sc > best.sc) best = { a, b, sc };
        }
      }
      if (!best) { out.push('no candidate pair'); break; }
      const sv = sim.survey(best.a.id, best.b.id);
      if (!sv || !sv.ok) { out.push(`survey ${best.a.name}->${best.b.name} failed: ${sv && sv.reason}`); break; }
      if (sv.price > sim.treasury) {
        out.push(`cannot afford ${best.b.name} (${Math.round(sv.price)}cr vs ${Math.round(sim.treasury)})`);
        break;
      }
      const res = sim.build(sv);
      if (!res || !res.ok) { out.push(`build failed: ${res && res.reason}`); break; }
      const A = res.link.a, B = res.link.b;
      joined.add(A); joined.add(B);
      const on = sim.lines.find((l) => l.stops.includes(A) || l.stops.includes(B));
      if (on) {
        sim.addStop(on.id, on.stops.includes(A) ? B : A);
      } else {
        const cr = sim.createLine([A, B], 'mixed');
        if (cr.ok && sim.enginesFree() > 0) sim.setLineTrains(cr.line.id, 1);
      }
      out.push(`${best.a.name} -> ${best.b.name} (${Math.round(sv.price)}cr)`);
    }
    // spread any remaining engines over the lines that exist
    for (const line of sim.lines) {
      if (sim.enginesFree() > 0) sim.setLineTrains(line.id, sim.enginesOf(line.id).length + 1);
    }
    out.push(`lines: ${sim.lines.length}, engines working: ${sim.enginesInUse()}/${sim.engines.length}`
      + `, connected: ${sim.connectedCount()}`);
    return out;
  }, n);
}
