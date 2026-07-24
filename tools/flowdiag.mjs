import { generateWorld } from '../src/world/worldgen.js';
import { createSim } from '../src/sim/sim.js';
import { KINDS, GOOD_KEYS, TIER_MULT, WEEK } from '../src/sim/model.js';

const world = generateWorld('eardon');
const sim = createSim(world);
// Hand-build a small sensible network: feed a delve from two shires via a burg.
const find = (k, n) => sim.sites.filter(s=>s.kind===k).sort((a,b)=>Math.hypot(a.x-n.x,a.z-n.z)-Math.hypot(b.x-n.x,b.z-n.z));
const brack = sim.sites.find(s=>s.name==='Brackenford');
const shires = find('shire', brack).slice(0,3);
const delves = find('delve', brack).slice(0,2);
const chain = [shires[0], brack, shires[1], delves[0]];
for (let i=0;i<chain.length-1;i++){
  const sv = sim.survey(chain[i].id, chain[i+1].id);
  if (sv.ok) { sim.treasury += sv.price; const r = sim.build(sv); console.log(`built ${chain[i].name} -> ${chain[i+1].name}  ${sv.price}cr ${Math.round(sv.length)}u ok=${r.ok}`); }
  else console.log(`FAILED ${chain[i].name} -> ${chain[i+1].name}: ${sv.reason}`);
}
sim.createLine(chain.map(c=>c.id), 'mixed');
sim.setLineTrains(1, 3);
const line = sim.lines[0];
console.log(`line stops=${line.stops.length} trains=${line.trains} weeklyCapacityPerLink=${sim.lineCapacity(line).toFixed(1)}`);

const DAY = WEEK/7;
for (let d=0; d<7*6; d++) sim.step(DAY);
console.log('\nafter 6 weeks:');
for (const st of chain) {
  const k = KINDS[st.kind];
  const need = Object.entries(k.need||{}).map(([g,r])=>`${g}:${(r*TIER_MULT[st.tier]).toFixed(1)}`).join(' ');
  const got  = Object.entries(k.need||{}).map(([g])=>`${g}:${st.got[g].toFixed(1)}`).join(' ');
  const stock= GOOD_KEYS.filter(g=>st.stock[g]>0.1).map(g=>`${g}:${st.stock[g].toFixed(1)}`).join(' ');
  console.log(`${st.name.padEnd(18)} t${st.tier} sat=${st.satisfaction.toFixed(2)} pros=${st.prosperity.toFixed(0)} pop=${Math.round(st.pop)}`);
  console.log(`   weekly need: ${need}`);
  console.log(`   got so far : ${got}`);
  console.log(`   stock      : ${stock||'(none)'}`);
}
console.log(`\nloads moved ${sim.stats.loadsMoved.toFixed(1)} fares ${sim.stats.fares.toFixed(0)}`);
console.log('last day movements:');
for (const m of sim.flowLast) console.log(`   ${m.good} ${m.amount.toFixed(2)} ${sim.byId.get(m.from).name} -> ${sim.byId.get(m.to).name} (${m.hops} hops, fare ${m.fare.toFixed(2)})`);
console.log(`transferLoss=${sim.transferLoss}`);
