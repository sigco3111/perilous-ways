# Module interfaces — binding contracts

No build step. Plain ES modules loaded by an import map, so `import * as THREE
from 'three'` resolves. Vendored three is **r185**. No other dependencies, no
CDN, no textures on disk.

## Coordinate convention

Three.js world space. **+X is east, +Z is south, +Y is up.** Sea level is
`y = 0`. Peaks reach about `y = 95`. The continent spans roughly
`x ∈ [-560, 560]`, `z ∈ [-380, 380]`.

## `world` — the terrain grid (produced by `src/world/worldgen.js`)

```js
world = {
  seed:    String,
  W, H:    Number,        // grid dimensions in cells (about 280 × 190)
  CELL:    Number,        // world units per cell (4)
  worldW, worldH: Number, // W*CELL, H*CELL

  // Row-major arrays of length W*H, indexed by  cy * W + cx
  height:  Float32Array,  // world units; can be negative (sea floor)
  water:   Uint8Array,    // 0 land, 1 river, 2 lake, 3 sea
  biome:   Uint8Array,    // BIOME enum below
  region:  Uint8Array,    // REGION enum below
  peril:   Float32Array,  // 0..1 ambient danger
  moist:   Float32Array,  // 0..1, drives vegetation density
  slope:   Float32Array,  // 0..~2, precomputed magnitude of the gradient

  idx(cx, cy):     Number,
  inb(cx, cy):     Boolean,
  toWorld(cx, cy): {x, z},        // cell centre
  toCell(x, z):    {cx, cy},      // rounded
  heightAt(x, z):  Number,        // bilinear
  slopeAt(x, z):   Number,
  biomeAt(x, z):   Number,
  waterAt(x, z):   Number,
  regionAt(x, z):  Number,

  sites: [ Site ],  // candidate settlement locations, already named
}
```

`BIOME` (exported const object from `worldgen.js`):
`OCEAN 0, BEACH 1, DOWNS 2, FARM 3, FOREST 4, DARKWOOD 5, MARSH 6, MOOR 7,
ROCK 8, SNOW 9, ASH 10, SLAG 11`

`REGION`:
`GREENHOLLOW 0, FROSTMARCH 1, MIRKHOLT 2, PEAKS 3, WEEPING 4, ASHENREACH 5,
MARCHLANDS 6, ELDERWOOD 7, QUAYS 8, BARROWDOWNS 9, WODENHOLT 10`

`Site`:
```js
{ id, name, kind, culture, cx, cy, x, z, y, region, tier }
```
`kind` ∈ `'shire' | 'delve' | 'haven' | 'burg' | 'watch' | 'hold'`
`culture` ∈ `'halfling' | 'dwarf' | 'elf' | 'men' | 'orc'`
`tier` 0..4 (hamlet, village, town, city, great city)

## `src/gfx/terrain.js`

```js
export function createTerrain(world, THREE, opts) -> {
  group,                    // THREE.Group: add to scene
  shared: { uTime, uWind, uCloud, uSun },  // shared uniform objects (see below)
  update(dt, env),          // env = { time, windDir:[x,z], windStrength, sunDir:THREE.Vector3, ashLevel:0..1 }
  setForestDamage(cx, cy, radius),   // fell trees near a point; call when track is laid
  dispose(),
}
```
Shared uniforms are plain `{ value }` objects that the host also wires into
rail, prop, and train materials so wind and cloud shadow are globally coherent.
`uCloud` is a `DataTexture` of drifting cloud cover plus its offset/scale.

## `src/gfx/props.js`

```js
export function buildSettlement({ kind, tier, seed, radiusHint }, THREE) -> {
  group,          // origin at settlement centre, +Y up, sits on y=0 locally
  footprint,      // Number: world-unit radius actually occupied
  lanternPoints,  // [THREE.Vector3] where night lights go
  update?(dt, env),
}
```
Must be deterministic in `seed`. Tier 0 is a handful of buildings; tier 4 is a
dense town with walls. Growing a settlement rebuilds it at the new tier, so keep
construction under ~4 ms.

## `src/gfx/trains.js`

```js
export function buildEngine({ style, seed }, THREE) -> { group, length, stackTop }
export function buildWagon({ cargo, seed }, THREE) -> { group, length }
export function createSteam(THREE, capacity) -> {
  points, emit(pos, vel, strength), update(dt, env), dispose()
}
```
`style` ∈ `'delver'` (brass boiler, the standard), `'march'` (bigger, plainer),
`'aelin'` (sleek, silent, verdigris), `'wrack'` (armoured, ember-lit).
`cargo` ∈ `'passenger' | 'grain' | 'ore' | 'timber' | 'arms' | 'flat' | 'brake'`.

## `src/audio/audio.js`

```js
export const Audio = {
  init(),                   // must be called from a user gesture
  setScene({ age, region, unrest, night, speed }),
  play(name, opts),         // one-shots, see list in the module
  setMuted(bool), muted,
}
```
Entirely procedural WebAudio. No audio files.

## Host-provided globals

`window.PW` is the debug/test surface and must exist:
```js
PW = { world, sim, gfx, ui, step(seconds), fastForward(weeks), snapshot(), seedNew(seed) }
```
`step()` advances the simulation deterministically **without** requiring
`requestAnimationFrame`, so the game can be balance-tested in a hidden tab.
