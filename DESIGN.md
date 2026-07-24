# PERILOUS WAYS
### A railway across a doomed continent.

You are Director of the Realm Transit Authority. You do not fight, rule, or
quest. You lay track, buy engines, and answer correspondence. Everything that
happens to the realm afterwards is, technically, your fault.

---

## 1. What kind of game this is

A **lightweight world simulator**, not a queue-management puzzle. Nobody loses
because a platform got crowded. The pleasure is watching a continent *respond*
to infrastructure — and discovering, gradually, what a network is actually for.

The three-sentence pitch of the arc:

1. You connect a grain village to a mountain that cannot grow grain. Both boom.
2. Doing this forty times reorganises the economy, the politics, and the
   demographics of the realm, mostly in ways nobody voted for.
3. Then the Enemy in the east notices that you have built him a road.

## 2. The simulation

Five interacting systems. Each is simple; the interest is in the couplings.

### Trade
Settlements **produce** and **need** goods (Grain, Ale, Timber, Stone, Iron,
Coal, Steel, Wool, Wine, Lore, Arms, Ashglass). A Delve produces Iron and
cannot feed itself. A Grange has grain and no tools. Connect them and both
prosper; connect a third party and you get a manufacturing chain. Flow is
solved over the rail graph each tick, limited by **capacity** (trains × line
frequency) and **travel time**.

### Growth
Prosperity follows met needs and export income. Population follows prosperity,
with lag. Settlements climb tiers: hamlet → village → town → city → great city,
visibly building outward in 3D as they go. Unserved settlements decline and can
be abandoned outright, which the Authority records without comment.

### Concord
Five peoples, each with **regard** for the Authority and for each other. See
`WORLD.md` for the full gazetteer.
- **Halflings** — the tax base and the moral centre. Ale, grain, letters.
- **Dwarves** — grant you tunnelling and metallurgy as regard rises.
- **Elves** — regard falls with felled forest and industrial smoke. At zero they
  *sail*, permanently: their havens go dark, their Lore leaves the economy, and
  a good deal of the map's beauty goes with them.
- **Men** — the Council. They set your grant and your mandate.
- **Orcs** — hostile, and the single most profitable market on the continent. A
  concession pays for everything and accelerates the end.

### Peril
Terrain carries risk. Tunnels, deep forest, and the Ashenreach generate
**incidents**: rockfall, predation, the wrath of older powers, an unlicensed
goblin market in a tunnel. Mitigation costs money. Ignoring it costs more.

### The Shadow
A single rising number in the east, fed by time, by Ashen trade, and by how far
east your rails reach. It does not attack early. It *uses* things.

## 3. What the player actually does

- **Survey and build.** Routes are A*-pathed across a real heightmap. Mountains
  need tunnels, rivers need bridges, fens need causeways — and each is a charter
  you may not have yet. The Sundering Peaks split the map; the first bore
  through them is the best moment in the game.
- **Run lines.** Define a line's stops, its rolling stock, and its policy
  (Passenger / Freight / Mixed / Troop). Trains then operate themselves. Two
  knobs per line, not twenty.
- **Answer petitions.** Real choices with real system effects. Refusing the
  Aelin's demand to reroute around a wood is a decision about which of your
  systems you are willing to damage.
- **Decide what you are willing to move.**

## 4. Three ages

**Age I — The Survey** (weeks 1–8). Small money, hard geography, the west only.
Learn the tools. First bore through the Peaks.

**Age II — The Boom** (weeks 9–24). The economy compounds. Cities appear.
Factions make demands and start caring about each other. Cosmopolitan hubs,
gold rushes, busts, plague travelling at rail speed along your own timetable.
The east is enormously lucrative.

**Age III — The Shadow** (week 25+). Raids on remote segments. Refugee waves.
Then an army moving at the speed of your best trunk line, on your track. You
choose: fortify it, requisition it for evacuation, or tear up the greatest thing
you ever built.

## 5. Endings

No pip-counter. The run ends in one of several graded states, each with its own
letter and a full **Chronicle** — the realm's history as written by its transit
authority. That document is the score, and it is meant to be read aloud.

## 6. Voice

Institutional deadpan. The Authority files reports; it does not editorialise.
Catastrophe is registered as an operational irregularity and given a reference
number. No winking, no exclamation marks, no whimsy for its own sake. The
comedy is a functioning bureaucracy in a world that has a Dark Lord in it.

Middle-earth-adjacent, with its own names: the Greenmarch, the Sundering Peaks,
Mirkholt, the Weeping Marsh, the Ashenreach, Mount Wrack.

## 7. Look

A lit diorama at golden hour. Vertex-painted terrain, thousands of instanced
wind-swayed trees, drifting cloud shadows, a shader sea with shore foam, brass
dwarven engines trailing steam, lantern-lit stations at dusk. Rails are extruded
tube on sleepers that visibly leap gorges on piers and dive into tunnel portals.
Settlements build outward as they grow, in their own culture's architecture.
