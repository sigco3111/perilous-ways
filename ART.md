# Art direction — binding for all modules

**Target:** a lit tabletop diorama at late golden hour. Stylised and painterly.
Low-poly *silhouettes* but never faceted-cheap: no visible triangle banding on
smooth ground, no default-material plastic, no rainbow saturation. Think the
colour of a Roger Dean landscape restrained by an Ordnance Survey map.

**Camera** sits high and tilted (perspective, fov 34). At default zoom the player
sees roughly a third of the continent. Everything must read at that distance
first, and reward zooming second.

## Palette (use these, do not invent)

Sun / sky
- sun colour `#ffd7a3`, intensity ~2.6, elevation ~24°
- sky zenith `#3f74c4`, sky horizon `#f2c98a`
- fog `#e6c8a2`, exponential, density tuned so far peaks wash out ~70%
- ambient/hemisphere: sky `#9fbde0`, ground `#6b5a44`, intensity ~0.55

Terrain
- downs grass `#7d9a4e`, highlight `#a9ba69`, dry `#b2a35e`
- farmland `#c2a758`, ploughed `#8a6f47`
- forest floor `#4a5f3c`, forest canopy `#3f6340`, dark canopy `#223a2c`
- moor `#7b7a4e`, heather `#8a6f84`
- marsh `#6b7145`, marsh water `#4a5a52`
- bare rock `#7d7468`, cliff shadow `#544e46`, scree `#948a7c`
- snow `#eef2f5`, snow shadow `#c3d0dc`
- ash `#4a4348`, slag `#2a2428`, ember `#ff6a2a`
- beach `#d8c9a0`

Water
- deep `#2c5f70`, shallow `#5f9a9c`, foam `#e9f4ef`

Materials
- iron `#4a4a52`, brass `#b08d57`, weathered copper `#7fae9d`, coal `#1c1a1c`
- rail head (polished, catches sun) `#a89e90`
- timber `#7a5c3c`, dark timber `#4a3626`

Culture architecture
- **Halflings** (`shire`): whitewash `#efe7d3`, thatch `#c9a86a`, round doors
  `#4f7a4a` / `#a8543f`, garden green. Low, round, dug into hillsides.
- **Dwarves** (`delve`): granite `#6e6a66`, brass `#b08d57`, deep shadow. Squat,
  geometric, carved; gates far larger than the buildings.
- **Elves** (`haven`): pale birch `#ded6c4`, silver `#c8d4d8`, verdigris
  `#7fae9d`. Tall, thin, vertical, built among trees, never symmetric-boring.
- **Men** (`burg`): sandstone `#c9b393`, slate `#5a6068`, banners `#9e3b3b`.
  Walls, square towers, tile roofs, a keep.
- **Watches** (`watch`): grey stone `#77716a`, timber palisade, brazier
  `#ff8a3a`.
- **Orcs** (`hold`): black basalt `#25222a`, rust `#7a3a28`, ember glow
  `#ff5a1e`. Angular, spiked, wrong angles.

## Rules

1. **No emissive above 1.0 except lights, embers, lanterns, and lava.** Bloom
   picks these out; overuse turns the frame to soup.
2. **Everything static is instanced or merged.** Draw calls are the budget:
   target under 200 for the whole scene.
3. **No textures.** Vertex colours and shader gradients only, so there are no
   assets to load and nothing to look muddy. Exception: procedurally generated
   `DataTexture` (e.g. the cloud-shadow map) is encouraged.
4. **Wind exists.** Trees, banners, grass, and smoke all acknowledge it, using
   one shared `uTime` and `uWind` so they move together.
5. **Silhouette over detail.** A thing that reads as a dwarf gate from 400 units
   away beats a thing with 6 000 triangles of masonry.
6. Shadows: one directional light, `PCFSoftShadowMap`, 2048 map. The shadow
   camera is refit to the visible area each frame by the host — do not fight it.
