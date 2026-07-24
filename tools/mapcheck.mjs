import { generateWorld, asciiMap, REGION_NAME } from '../src/world/worldgen.js';
const seed = process.argv[2] || 'eardon';
const t0 = Date.now();
const w = generateWorld(seed);
console.log(`seed=${seed} gen ${Date.now()-t0}ms sites=${w.sites.length} passRows=${w.passes.map(p=>p.cy+'@h'+p.h.toFixed(0)).join(' ')}`);
console.log(asciiMap(w));
// height bands: 0-9 where 9 = highest, '~' = sea
const cols=112, rows=46;
let out=[];
for(let r=0;r<rows;r++){let line='';for(let c=0;c<cols;c++){
  const cx=Math.round(c/(cols-1)*(w.W-1)), cy=Math.round(r/(rows-1)*(w.H-1)); const i=cy*w.W+cx;
  const h=w.height[i];
  line += h<0 ? '~' : String(Math.min(9,Math.floor(h/10)));
} out.push(line);}
console.log('\n--- height bands (each digit = 10 units) ---');
console.log(out.join('\n'));
const byKind={}; for(const s of w.sites) byKind[s.kind]=(byKind[s.kind]||0)+1;
let land=0,sea=0,riv=0,hmin=1e9,hmax=-1e9,steep=0;
for(let i=0;i<w.height.length;i++){ if(w.water[i]===3)sea++; else if(w.water[i]===1)riv++; else land++; hmin=Math.min(hmin,w.height[i]); hmax=Math.max(hmax,w.height[i]); if(w.slope[i]>0.6)steep++; }
console.log(`\nkinds: ${JSON.stringify(byKind)}`);
console.log(`land ${(100*land/w.height.length).toFixed(1)}% sea ${(100*sea/w.height.length).toFixed(1)}% river ${(100*riv/w.height.length).toFixed(1)}% steep ${(100*steep/w.height.length).toFixed(1)}% h ${hmin.toFixed(1)}..${hmax.toFixed(1)}`);
