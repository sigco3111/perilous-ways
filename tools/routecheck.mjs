import { generateWorld, REGION_NAME } from '../src/world/worldgen.js';
import { surveyLink, WORKS } from '../src/sim/route.js';

const w = generateWorld(process.argv[2] || 'eardon');
const byName = (n) => w.sites.find(s => s.name === n) || w.sites.find(s => s.name.includes(n));
const S = (a) => `${a.name}(${a.kind})`;

const ALL = { bridge:1, span:1, causeway:1, tunnel:1 };
const NONE = { bridge:0, span:0, causeway:0, tunnel:0 };
const EARLY = { bridge:1, span:0, causeway:0, tunnel:0 };

function show(a, b, can, label) {
  const t0 = performance.now();
  const r = surveyLink(w, a, b, can);
  const ms = (performance.now()-t0).toFixed(0);
  if (!r.ok) { console.log(`  ${label.padEnd(8)} ${S(a)} -> ${S(b)}: BLOCKED (${r.reason}) [${ms}ms]`); return null; }
  const mix = {};
  for (const s of r.spans) mix[s.kind] = (mix[s.kind]||0) + Math.round(s.length);
  const straight = Math.hypot(a.x-b.x, a.z-b.z);
  console.log(`  ${label.padEnd(8)} ${S(a)} -> ${S(b)}: ${r.length.toFixed(0)}u (straight ${straight.toFixed(0)}u, x${(r.length/straight).toFixed(2)}) cost ${r.cost} upkeep ${r.upkeep} peril ${r.peril.toFixed(2)} tun ${r.tunnels} piers ${r.piers} | ${Object.entries(mix).map(([k,v])=>k+':'+v).join(' ')} [${ms}ms]`);
  return r;
}

// find representative pairs
const shires = w.sites.filter(s=>s.kind==='shire');
const delves = w.sites.filter(s=>s.kind==='delve');
const holds  = w.sites.filter(s=>s.kind==='hold');
const brack = byName('Brackenford'), cap = byName('Amonhal'), quays = byName('Grey Quays'), dhur = byName('Dhurunzol'), wrack = byName('Mount Wrack');

console.log('== short easy links (should be cheap, mostly at grade) ==');
shires.slice(0,2).forEach(s => { const near = w.sites.filter(o=>o.id!==s.id).sort((p,q)=>Math.hypot(p.x-s.x,p.z-s.z)-Math.hypot(q.x-s.x,q.z-s.z))[0]; show(s, near, ALL, 'ALL'); });

console.log('== crossing the great river ==');
if (brack && quays) { show(brack, quays, EARLY, 'EARLY'); show(brack, quays, NONE, 'NONE'); }

console.log('== crossing the Sundering Peaks (the big moment) ==');
if (cap && dhur) { show(cap, dhur, EARLY, 'EARLY'); show(cap, dhur, ALL, 'ALL'); }
const east = holds[0];
if (cap && east) { show(cap, east, EARLY, 'EARLY'); show(cap, east, ALL, 'ALL'); }

console.log('== the full trunk: west coast to Mount Wrack ==');
if (quays && wrack) { const r = show(quays, wrack, ALL, 'ALL'); 
  if (r) { const regions = new Set(r.pts.filter((_,i)=>i%12===0).map(p=>REGION_NAME[w.regionAt(p.x,p.z)])); console.log('     through: ' + [...regions].join(', ')); } }

console.log('== deck sanity (max grade must hold) ==');
const r = surveyLink(w, cap, dhur, ALL);
if (r && r.ok) { let maxg=0; for(let i=1;i<r.deck.length;i++) maxg=Math.max(maxg, Math.abs(r.deck[i]-r.deck[i-1])/r.step);
  console.log(`  worst grade on Amonhal->Dhurunzol: ${(maxg*100).toFixed(1)}% (limit 8.5%)`);
  let below=0, above=0; for(let i=0;i<r.deck.length;i++){ const d=r.deck[i]-r.ground[i]; if(d<-2.6)below++; if(d>2.6)above++; }
  console.log(`  samples: ${r.deck.length}, underground ${below}, on structure ${above}`);
}
