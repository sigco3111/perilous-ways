import { generateWorld, REGION_NAME } from '../src/world/worldgen.js';
const w = generateWorld(process.argv[2] || 'eardon');
// walk west->east across the middle of the map
const cy = Math.round(0.50*(w.H-1));
let s='';
for(let cx=0;cx<w.W;cx+=4){ const i=cy*w.W+cx; s += `${(cx/(w.W-1)).toFixed(2)}:${w.height[i].toFixed(0)}/${w.slope[i].toFixed(2)} `; }
console.log('E-W transect at v=0.50 (u:height/slope):\n'+s);
// and at the pass rows
for (const p of w.passes){ let t=''; for(let cx=Math.round(0.55*w.W);cx<Math.round(0.85*w.W);cx+=3){ const i=p.cy*w.W+cx; t+=`${w.height[i].toFixed(0)} `; } console.log(`pass row cy=${p.cy} (v=${(p.cy/(w.H-1)).toFixed(2)}) u0.55->0.85: ${t}`); }
// ridge crest heights down the peaks
let crest=[]; for(let cy2=6;cy2<w.H-6;cy2+=8){ let best=-1e9,bx=0; for(let cx=Math.round(0.55*w.W);cx<Math.round(0.74*w.W);cx++){const i=cy2*w.W+cx; if(w.height[i]>best){best=w.height[i];bx=cx;}} crest.push(`${(cy2/(w.H-1)).toFixed(2)}:${best.toFixed(0)}@u${(bx/(w.W-1)).toFixed(2)}`); }
console.log('peaks crest by v: '+crest.join(' '));
// slope histogram on land
const bins=new Array(10).fill(0); let n=0;
for(let i=0;i<w.height.length;i++){ if(w.water[i]===3)continue; n++; bins[Math.min(9,Math.floor(w.slope[i]/0.2))]++; }
console.log('land slope hist (0.2 buckets): '+bins.map((b,j)=>`${(j*0.2).toFixed(1)}+:${(100*b/n).toFixed(1)}%`).join(' '));
console.log('passes:', w.passes.map(p=>`cy${p.cy}(v${(p.cy/(w.H-1)).toFixed(2)}) barrier=${p.barrier.toFixed(0)}`).join('  '));
console.log('gates :', w.gates.map(p=>`cy${p.cy}(v${(p.cy/(w.H-1)).toFixed(2)}) barrier=${p.barrier.toFixed(0)}`).join('  '));
