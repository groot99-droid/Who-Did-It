# World Bible and Level Design

> Generated from `docs/MASTER_PLAN.md` (v0.1, 2026-10-10). Geography, scene ids, portal ids, lore and lighting. Numbers that affect play live in `GDD.md`.

## 4. World bible

### 4.1 Setting

**Hollowmere**, a fog-bound harbour hamlet on a northern coast, autumn 1931. The storm closed the only road; the fog hides the sea. Lord Aldous Vane, owner of the shuttered tin mine, died three nights ago and his will names "whoever remains when the last lantern goes out". The flooded lowest gallery leaks "mere-rot" into the marsh, which makes the wolves bold and wakes something in the sea cave (the Beast, V2). Tone: toon-noir, chunky villagers in trench coats and wool caps, wet cobbles, amber lantern light against slate-blue dusk. Landmark NPCs (Mrs Grieves the tavern keeper, Old Fennick at the light, Father Bray, Doc Mallory, Tuck the ferry boy) are environmental storytelling and shop signage in V1; a Grieves tab book that mirrors the Ledger is V1.5. One bell stands on the square: it is the Emergency Bell, the Final Night object and the Butler's remote pull (V1.5). The chapel rope is decoration.

**The wake-loaf custom.** Tamsin Crumb runs Crumb's Ovens on the east lane between the square and the apothecary. The night before a will is read she bakes one loaf per mourner and three for the dead, each with a wax-sealed crumb token inside, and lays them on her Wake Table. In the main match the bakery is an ordinary Small-profile house with a fetch task and, since round 7, four station rooms behind its back wall (A116), and Tamsin joins the landmark NPCs as signage and ledger flavour. The quick mode that was played around the Wake Table and in the loft above the ovens was removed in round 7 (GDD 3.11, A115).

### 4.2 Metrics

`TILE_PX = 64` and 1 tile = 1 m. Every rule, radius, collision box and id lives on this square grid, on the server and in the data. A player's collision box is a 0.5-tile square under the feet (`metrics.json`). All radii in rules are in tiles and live in `@wdi/shared/constants.ts`. Interiors are at least 12x9 tiles (the loft and bedroom rooms), with camera follow and no whole-room fit. Every size is in 4.3, 4.10 and `scenes/*.json`.

(M5a) **The client draws this grid in 2:1 dimetric isometric projection**, seen from the south-east (GDD 3.13, SPRITES 10):

- A tile is a 128 x 64 px diamond. The world point (x, y) in px is drawn at (x - y, (x + y) / 2).
- World north points to the screen's upper right; straight up on the screen is world north-west.
- A radius of r tiles is drawn as an ellipse with half-axes √2·64·r px and 64·r/√2 px.

**The art** is rendered by one orthographic camera (Blender rotation X 60°, Z 45°). Every height is at 0.75 of true scale, and characters are scaled uniformly. Art is rendered at the display scale, finished at half size by the pixel finish (ASSETS 6.11) and drawn at twice the size with nearest filtering (linear while the main mode's finish is off, SPRITES 10.3). That gives:

- 90.5 px per metre along the ground and 59 px per vertical metre;
- a 128 px displayed character cell (64 px packed), in which a standing 1.7 m villager is about 100 px tall and nothing standing is taller than 112 px;
- walls at 147 px full height (2.5 m), 71 px at half height and 18 px as a sill.

**Exporter checks.** The exporter fails on a nav bitmap whose tile is not 64, and on an isometric ground tileset whose cells are not 128 x 64.

### 4.3 Scene graph

**Maps (M5a).** A match is played on one map, picked by the leader in the lobby (GDD 3.13). A map is a closed graph of scenes in `packages/content/data/maps/<id>.json`:

- It names its hub (the exterior with the Emergency Bell), 10 start spawns and 10 meeting spawns on the hub, the bell, the teaching clue and the kit chest.
- (Round 7) It may name a `station`: the spawn on the hub where the Daily Train stops (GDD 3.3). HollowMere's is `overworld.platform`, on the plank platform beside a rail spur (`=`) along the overworld's east edge, with the lantern `ov.lt_platform`; Blackpine has none. The station is a spot on the hub, not a scene (DECISIONS A113).
- Every scene belongs to exactly one map, and every portal leads inside its own map.
- Each map has at least one `forest` and one `cave` scene open at the Small profile.
- Round 5 ships Hollowmere (below) and Blackpine (4.10).

**Profiles** are gated by player count: **Small** (4-6), **Medium** (7-8) and **Large** (9-10).

| Map | Medium adds | Large adds |
|---|---|---|
| Hollowmere | the Fenwood, the Flooded Gallery, manor and barn | chapel and cellar |
| Blackpine | office and forge | the Deep Level |

Doors of scenes outside the profile render boarded, and the portal rejects with `CLOSED`. `zoneId` (visibility, Ledger, noise) equals `sceneId` in V1.

**Biome and darkness (M5a).** Every scene names its `biome`: `village`, `house`, `forest` or `cave`. It picks the default ground and walls, the sound bed and the look. A `dark` scene is night in every phase (GDD 3.13): every cave, the Undercroft and the apothecary loft.

**Frozen ids (M5a; the validator and a test enforce them).**

1. **`SCENE_IDS` is append-only.** A scene's index in it is its wire id (`u8`). A test asserts that the first 15 entries are the list of 2026-10-10. The round-5 entries follow them in this order: `forest_deep`, `cave_gallery`, `bp_camp`, `bp_lodge`, `bp_mill`, `bp_woods`, `bp_mine`, `bp_office`, `bp_smithy`, `bp_deep`.
2. **A new scene gets a new id.** It takes a new snake_case scene id (a new map's scenes share a stem such as `bp_`) and a new two-letter object prefix. Prefixes are unique across all scenes.
3. **Ids are never renamed or reused.** The id of a removed scene, portal, spawn, spot, prop, light or clue is retired.
4. **Geometry may change; ids keep their meaning.** A door may move to another wall and a scene may grow, but every portal, spawn, spot and prop id still names the same thing.
5. **A variant is a new scene.** A variant of a place (winter, flooded) gets a new scene id; the old scene is never edited into it.
6. **Map ids are append-only too** (`MAP_IDS`, in lobby order).

New objects use typed prefixes:

| Object | Id form |
|---|---|
| Buildings | `<p>.bld_<name>` |
| Lights | `<p>.lt_<name>` |
| Resource nodes | `<p>.nd_<name>` |
| Spawners | `<p>.sp_<name>` |
| Quest givers | `<p>.gv_<name>` |

**Hollowmere**

| id | Name | Profile | Size (tiles) | Biome | Exits (portal id -> target.spawn) | Player spots / body spots | Notes |
|---|---|---|---|---|---|---|---|
| `overworld` | Hollowmere | Small (64x48 authored; NW Manor Rise and NE paddock gated shut below Medium) | 64x48 | village | `ov.tavern_front` -> `tavern_bar.front`; `ov.tavern_alley` -> `tavern_bar.alley`; `ov.apoth` -> `apoth_shop.door`; `ov.bakery` -> `bakery.door`; `ov.widow` -> `widow_parlour.door`; `ov.forest_gate` -> `forest.gate`; `ov.manor_front` / `ov.manor_back` -> `manor_hall.*` [M]; `ov.barn` -> `barn.door` [M]; `ov.chapel` -> `chapel.door` [L]; `ov.well` -> `cellar.well` [L] | hedges, cart, dock crates / – | Hub: square with bell and well; 4 lantern posts; fence line NE. The Daily Train's platform (spawn `platform`) and rail spur on the east edge (round 7). Every building door faces south or east (the tavern front door and the apothecary door moved to their south faces in M5a, 4.4) |
| `tavern_bar` | The Drowned Lantern | Small | 20x12 | house | `tb.front`, `tb.alley` -> overworld; `tb.back` -> `tavern_back.door` | behind bar, keg stack / – | Warmest light (hearth and two lamps); task: dartboard letter drop; `tb.front` is on the south wall |
| `tavern_back` | Tavern back room | Small | 12x10 | house | `tk.door` -> `tavern_bar.back`; `tk.trap` -> `cellar.trap` [L, boarded below] | wardrobe / crate pile | Oil barrel (task tool) |
| `apoth_shop` | Mallory Apothecary | Small | 18x11 | house | `as.door` -> overworld; `as.stairs` -> `apoth_loft.stairs` | behind counter / – | Basin (Blood wash); Wrench on the bench; `as.door` is on the south wall |
| `apoth_loft` | Apothecary loft | Small | 12x9 | house (dark) | `al.stairs` -> `apoth_shop.stairs` | herb loft, under bed / trunk | Dark scene, one green lamp |
| `widow_parlour` | Widow Vane's parlour | Small | 16x11 | house | `wp.door` -> overworld; `wp.bedroom` -> `widow_bedroom.door` | pantry / – | Portrait turned to the wall; letter box |
| `widow_bedroom` | Widow's bedroom | Small | 12x9 | house | `wb.door` -> `widow_parlour.bedroom` | wardrobe, under bed / wardrobe | Single candle |
| `forest` | Gallows Wood | Small | 40x30 | forest | `fo.gate` -> overworld; `fo.log` -> `overworld.forest_back` (one-way crawl); `fo.cave` -> `cave_entry.mouth`; `fo.deep` -> `forest_deep.wood_side` [M, boarded below] | hollow trees, brush / – | 3 wolf loops away from the gate; 6-tile clearing with moonlight; Planks at the edge; the west trail into the Fenwood |
| `forest_deep` | The Fenwood | Medium | 48x36 | forest | `fd.wood` -> `forest.deep_side`; `fd.adit` -> `cave_gallery.fen`; `fd.sinkhole` -> `cave_gallery.sink_landing` (one-way drop, noise 9, 90 s footprints at landing) | hollow log, reeds, bramble / the bog, charcoal pit | The Hanging Oak clearing; the fen where the mere-rot leaks out, with a boardwalk and the drowned lantern; the wolf den; Mother Moll's charcoal clamp and hut; 2 wolf loops |
| `bakery` | Crumb's Ovens | Small | 18x11 | house | `bk.door` -> `overworld.bakery`; `bk.oven_room` -> `crumb_oven.door`; `bk.mixing_room` -> `crumb_mixing.door`; `bk.proofing_room` -> `crumb_proofing.door`; `bk.cold_room` -> `crumb_cold.door` (round 7, the back wall) | behind the counter / – | In the main match a task node (Fetch flour) and a Blood-wash basin alternative. The Wake Table, plates, dead loaves and ledger of the removed quick mode (GDD 3.11, A115) stay in the file unused and frozen; the Wake Table's footprint is 6,4 5x2. Round 7 (A116, A118): four doors in the north (back) wall lead to the station rooms below; nothing else of the layout changed |
| `crumb_cold` | Crumb's cold room | Small | 12x9 | house | `cf.door` -> `bakery.cold_room` | milk crates / crate pile | La Chambre Froide (the owner's `station_fridge` picture): the walk-in's shelves, milk and a zinc-lined ice chest (`cf.ice_chest`; `cf.compressor` is retired, `docs/round8/canon.md` K11); one cold lamp. The shelves (`coldShelves`) stand at 2,1 3x1. Its steel door is on the east wall, as the picture shows it |
| `crumb_mixing` | Crumb's mixing room | Small | 12x9 | house | `cm.door` -> `bakery.mixing_room` | flour sacks / trunk | Le Pétrin (`station_mixer`): the dough mixer in the back corner, sacks of farine along the west wall; one lamp. The mixer (`doughMixer`) stands at 6,1 2x2 |
| `crumb_oven` | Crumb's oven room | Small | 12x10 | house | `co.door` -> `bakery.oven_room` | bread rack / wood box | Le Four à Pain (`onub_station_oven`): the brick dome oven, its fire always lit, and a hanging bulb. The oven (`brickOven`) stands at 6,1 2x2 |
| `crumb_proofing` | Crumb's proofing room | Small | 12x10 | house | `cp.door` -> `bakery.proofing_room` | tray stack / flour sacks | La Chambre de Pousse (`station_proofing`): the glass-fronted proofing cabinet mid-room, three warm lamps. The cabinet (`proofingCabinet`) stands at 4,2 3x2 |
| `cave_entry` | Tin Gallery mouth | Small | 20x14 | cave (dark) | `ce.mouth` -> `forest.cave_side`; `ce.gallery` -> `cave_gallery.upper` [M, boarded below]; `ce.sea` boarded (V1.5 Thief exit, low tide on Nights 2 and 4) | stalagmites / pool niche | Three patches of bioluminescent moss and daylight at the mouth |
| `cave_gallery` | The Flooded Gallery | Medium | 40x28 | cave (dark) | `cg.upper` -> `cave_entry.gallery`; `cg.fen` -> `forest_deep.adit_side` | ore chute, timber crib / sump | Vane's lowest gallery, flooded, the mere-rot glowing teal on the water; the broken pumping engine under the sinkhole shaft (lands `sink_landing`); the ore chamber with a VANE TIN CO crate |
| `manor_hall` | Vane Manor, hall | Medium | 28x16 | house | `mh.front`, `mh.back` -> overworld; `mh.stairs` -> `manor_upper.stairs` | wardrobes x2, curtain alcove (off the main sightline) / – | Stopped clock at 11:47; safe |
| `manor_upper` | Vane Manor, upstairs | Medium | 24x12 | house | `mu.stairs` -> `manor_hall.stairs`; `mu.balcony` -> `overworld.balcony_drop` (one-way, noise 9, 90 s footprints at landing) | under beds, attic hatch / – | Locked study (`key_study` in the cellar [L] or the loft [M]) |
| `barn` | Hale Barn | Medium | 20x12 | house | `ba.door` -> overworld; `ba.loft` -> `overworld.barn_loft_drop` (one-way) | hay piles x2 / hay pile | Goat bleats (noise 4) when anyone enters |
| `chapel` | St Brannock's | Large | 18x12 | house | `ch.door` -> overworld; `ch.crypt` -> `cellar.crypt` | confessional / crypt niche | Silent zone: no footstep noise; candles, moonlight through the window |
| `cellar` | The Undercroft | Large | 28x16 | house (dark) | `cl.well` -> `overworld.well`; `cl.trap` -> `tavern_back.trap`; `cl.crypt` -> `chapel.crypt` | wine racks / dump spot | Dark scene, a torch at each way in; gas pockets in marked side alcoves (V1.5) |

V1.5: `cottage_fisher`, `lighthouse` (3 stacked rooms), cave `sea_exit`. These are new ids appended to `SCENE_IDS` when they ship. All ids, spawn ids and portal ids are frozen in `packages/content/data/scenes/*.json`; V2 reads the same graph.

**Blackpine** (4.10)

| id | Name | Profile | Size (tiles) | Biome | Exits (portal id -> target.spawn) | Player spots / body spots | Notes |
|---|---|---|---|---|---|---|---|
| `bp_camp` | Blackpine Camp | Small | 56x40 | village | `bc.lodge` -> `bp_lodge.front`; `bc.lodge_side` -> `bp_lodge.side`; `bc.mill` -> `bp_mill.door`; `bc.mill_yard` -> `bp_mill.yard`; `bc.woods` -> `bp_woods.camp`; `bc.adit` -> `bp_mine.adit`; `bc.office` -> `bp_office.door` [M]; `bc.smithy` -> `bp_smithy.door` [M] | ore bin, log deck, water barrel, porch crawlspace (Child) / – | Hub: the yard with the shift bell, pump, notice board and kit chest; 4 lantern posts; the adit in the cliff to the north, the Blackwater and its broken trestle to the south, the log pond to the east; lands the one-way log chute (`chute_foot`) |
| `bp_lodge` | The Bunkhouse | Small | 24x12 | house | `bl.front` -> `bp_camp.lodge`; `bl.side` -> `bp_camp.lodge_side` | wood box, under the bunks x2 / root cellar | Mess hall with the iron range and a wash basin (Blood wash); the bunk room behind a half wall |
| `bp_mill` | Vane Sawmill | Small | 24x14 | house | `bs.door` -> `bp_camp.mill`; `bs.yard` -> `bp_camp.mill_yard` | sawdust pile / log chute | Head saw and carriage rails, the waterwheel gearing; plank stack (task source) |
| `bp_woods` | Blackpine Woods | Small | 52x40 | forest | `bw.camp` -> `bp_camp.woods`; `bw.vent` -> `bp_mine.vent`; `bw.chute` -> `bp_camp.chute_foot` (one-way drop, noise 9, 90 s footprints at landing); `bw.old_adit` -> `bp_deep.old_adit` [L, boarded below] | hollow pine, brush, log jam / ford pool | Skid road, the felling slope with the chute head, two charcoal kilns, the ford; 2 wolf loops |
| `bp_mine` | Blackpine Workings | Small | 44x30 | cave (dark) | `bm.adit` -> `bp_camp.adit`; `bm.vent` -> `bp_woods.vent`; `bm.winze` -> `bp_deep.winze` [L, boarded below] | ore cart, timber crib / old stope | Timbered adit with tram rails; the ore chamber with the last shift's tally board; the vent drift (2 tiles wide); powder kegs; lit by torches and lamps only |
| `bp_office` | Company Office | Medium | 18x11 | house | `bo.door` -> `bp_camp.office` | behind the counter, wardrobe / strongroom | The company store and the manager's office: the payroll ledger, the safe, the dead telephone |
| `bp_smithy` | The Forge | Medium | 16x11 | house | `bf.door` -> `bp_camp.smithy` | coal bin / – | Forge hearth (Blackpine's warmest light), anvil, quench trough (Blood wash) |
| `bp_deep` | The Deep Level | Large | 40x28 | cave (dark) | `bd.winze` -> `bp_mine.winze`; `bd.old_adit` -> `bp_woods.old_adit` | refuge bunk, ore pillar / sump | Flooded stope crossed by plank walkways; the old workings; the miners' refuge with a lamp still burning |

### 4.4 Overworld sketch (64x48)

```
 N ┌──────────────────────────────────────────────────────────────┐
   │ ~~ forest edge ~~~~~~ [FOREST GATE + clearing] ~~ (hollow log)│
   │ ╔══ MANOR ══╗ [gate M]   lane      [gate M] BARN ─ fence ─ paddock │
   │ ║ back  front║           lanterns x3           goat   (Planks)   │
   │ ╚═════╤═════╝                                                   │
   │ WIDOW ┤        ┌── TOWN SQUARE ──┐                              │
   │ cottage        │ BELL  well  board│──── APOTHECARY (basin)       │
   │                └──────────────────┘                              │
   │ CHAPEL [L] ── graveyard ── TAVERN ─ alley ─ (fisher cottage V1.5)│
   │ (crypt)                    (trapdoor L)                          │
   │          cliff path                 ──── DOCK ─── boats          │
 S └──────────────── sea / fog ───────────────────── (lighthouse V1.5)┘
```

Crumb's Ovens (`bakery`) stands on the east lane between the square and the apothecary: one door, a lit window.

- **Chokepoints:** the manor lane, the tavern alley, the cliff path and the forest gate; in the woods, the Fenwood trail and the sinkhole glade.
- **Loops:** square -> alley -> dock -> cliff -> chapel -> square (outer); manor <-> cellar <-> tavern (Large); Gallows Wood -> the Fenwood -> the Flooded Gallery -> the Tin Gallery mouth -> Gallows Wood (Medium and Large, M5a).
- **LOS breakers** (hedges, headstones, cart, crates) become opaque tiles of the nav bitmap with the server-side dark visibility of M5b.

(M5a) **Reading the sketch isometrically.** The sketch and every grid are drawn north-up; the client turns them so that north-west is up (SPRITES 10).

- The north and west boundaries are the back of the picture and carry the tall edges: cliffs, tree lines, the manor rise.
- The south and east boundaries are the front and are drawn low: sea, sills, fences.
- A tall solid (building, wall, tree, cliff) hides the tiles north and west of it. It turns translucent while it is in front of your own character (GDD 3.13).

**Layout rules for every scene:**

1. Every door into a building is on its south or east face.
2. Keep walkable tiles out of the 2-tile band north and west of a building footprint, except lanes and door approaches.
3. Do not put a tall run of wall or trees directly south or east of a lane unless the lane is meant as a hiding place.
4. Interiors are cutaways (north and west walls full height, south and east walls as sills, inner walls at half height), so an interior needs no such rule.

**Doors moved in M5a** (every id is kept):

| Id | Kind | From | To |
|---|---|---|---|
| `ov.tavern_front` | portal | tavern's west face (25,31) | south face (28,34) |
| `tavern_front` | spawn | (24,31) | (28,35) |
| `ov.apoth` | portal | apothecary's west face (47,21) | south face (50,24) |
| `apoth` | spawn | (46,21) | (50,25) |
| `tb.front` | portal (inside) | bar's west wall | south wall (4,11) |
| `front` (`tavern_bar`) | spawn | beside the west wall | (4,10) |
| `as.door` | portal (inside) | shop's west wall | south wall (4,10) |
| `door` (`apoth_shop`) | spawn | beside the west wall | (4,9) |

### 4.5 Portal rules

One `portals.schema.json` in `@wdi/content` (zod): `id` (`scene.portal`, globally unique), `from`, `to`, `toSpawn`, `kind` (`door|stairs|hatch|drop|crawl|gate|forest_gate|cave_mouth`), `oneWay`, `lock {keyId}`, `window` (`night|lowTide|null`), `noise` (tiles), `elevationDelta` (m), `minProfile`. Spawns carry `x, y, z, facing`. The exporter validates uniqueness and that every `toSpawn` exists; CI fails otherwise. The server owns the graph; the client never decides a transition. Keys are inventory items. One-way drops emit noise 9 and a 90 s footprint trail (height trait) at the landing. Noise crossing a portal is halved and re-emitted at the paired portal as "muffled".

### 4.6 Bestiary

| Creature | Ships | Spawn | Behaviour | Threat | Killer cover |
|---|---|---|---|---|---|
| Mere-wolf | V1 | forest loops (3); 1 enters the village at night when the fence is broken | Patrols; chases unlit players; flees lantern or candle within 4 tiles; dies to a bolt | 1 damage, 2 HP players | Kill in the forest to blame wolves; the knife still leaves a Thread and Autopsy says "knife" |
| Bog-wisp | V1.5 | marsh, cave pools | Lures; blinds light radius 5 s | Nuisance | Blinds witnesses |
| The Beast | V2 | cave, released by the Accomplice or at cycle 4 | 2 hits kill; drawn to light | Lethal to lone players | Cave bodies get Ichor + Drag Marks |
| Crows, rats, gulls | V2 | rooftops, attic, lighthouse | Noise amplifiers | Social | Running = being seen |

**M5b creatures and the material economy (round 6).** Round 6 adds the boar of the Fenwood and Blackpine Woods and
the bats and rats of the caves (the cave rats arrive before the V2 rooftop ones), alongside the wolves; their rules
are GDD 3.15. The wild scenes also yield the six materials of GDD 3.14, and the economy is local: forests give
timber, resin and herbs, caves tin ore, stone and mushrooms, the Blackpine yard timber and
stone. Stations are the props already standing in houses (the basins of the apothecary, the bakery,
the bunkhouse and the forge; the ovens of the bakery and the bunkhouse), so crafting pulls players back from the
wild into lit, watched rooms. Quest givers stand where the world puts them: Harbourmaster Pell by Hollowmere's
dock, Mother Moll at her charcoal hut in the Fenwood, Foreman Hask on the Blackpine yard, Ada Kerrow at the forge
and the collier at the kilns. The macro-economy of the owner's Bible (scrip, faith, rumour, HQ tiers) is round 8
(`docs/round6/bible-seams.md` 2.2): its raw materials will be these same resources.

### 4.7 Clue placement and lighting

Kill clues are generated by the rules engine, never placed by hand. Static "document" nodes (letters, tab book, confession ledger) produce trait-less Claimed flavour and are V1.5. The grace-phase teaching clue is the only static clue in V1.

Lighting (M5a) is a **darkness layer** that the client draws over the pre-rendered world (GDD 3.13, SPRITES 10). Its colour and strength follow the phase (`metrics.json` `lighting.ambient`):

| When | Darkness |
|---|---|
| Day | `slate` at 40% |
| Night | `ink` at 90% |
| Dark scenes, every phase | `ink` at 94% |

Pools of light are erased from it: the viewer's vision radius, and every record in the scene's `lights` list. A light record names its kind, its tile, its radius in tiles, an optional palette colour and the parts of the day it burns in. The kinds:

| Kind | What it is | Default colour |
|---|---|---|
| `lantern` | posts and hanging lanterns | `lantern` |
| `torch` | mines, the cellar, the adit | `lantern` |
| `lamp` | oil lamps and candles indoors | `lantern` |
| `fire` | hearths, stoves, forges, kilns, the charcoal clamp | `lantern` |
| `window` | a lit window spilling onto the ground outside | `lantern` |
| `moss` | cave moss and the mere-rot glow | `teal` |
| `moon` | moonlight in clearings and through windows | `moon` |
| `shaft` | daylight down a shaft or in at a cave mouth | `moon` |

Each scene keeps to one warm and one cool family. Torch and fire pools flicker, and every pool also lays an additive glow of its colour on the world.

The art stays baked:

- one key light parented to the camera for every asset class, and no cast shadows;
- a shared 2:1 drop-shadow ellipse under every y-sorted object;
- lamps, windows and fires painted lit in their art (`_lit` and `_unlit` states where a light goes out by day).

Phaser 4 `setLighting(true)` with a normal-map pass remains a later experiment behind a flag.

### 4.8 Environmental storytelling (V1 set)

Black crepe on the manor door; stopped clock at 11:47; tide chart with the next low tide circled; chalk hopscotch under a lantern; drowned-sailor photos in the tavern; the apothecary's "NOT FOR SALE" shelf with one empty slot; wolf pelt on the barn door; the chapel rope with a torn glove in it; the Widow's portrait turned to the wall; a VANE TIN CO crate half-pried open; a scarecrow in a trench coat; a gravestone with tomorrow's date; muddy bootprints on the manor carpet (static red herring); a drowned lantern still glowing in the marsh fog.

### 4.9 V2 notes

Keep every scene, portal, spawn and clue id; 1 tile = 1 m. Manor floors, the cellar and the lighthouse become real volumes while `zoneId` keeps their visibility and Ledger scope; cottages, tavern, chapel and barn stay portal-loaded. One-way drops become ledges, the hollow log a crouch tunnel, the tide a water volume. Baked sprites are discarded for the original Blender meshes.

### 4.10 Blackpine

**Blackpine** is the Vane Timber and Tin Company's camp in the pine valley above Hollowmere, the same autumn of 1931. Log bunkhouses and a water-driven sawmill stand at the foot of the hill the company's tin workings run into.

The storm that shut the coast road also took the trestle over the Blackwater, the river along the camp's south edge. The telephone in the company office went dead the night the foreman read the telegram from Hollowmere: Lord Vane is dead, and the camp, the mill and the mine go to "whoever remains when the last lantern goes out".

The tone is Hollowmere's, cooler and wetter: pine-black woods, sawdust and woodsmoke, lantern light on wet logs, and the adit breathing cold air.

The landmark NPCs are signage and ledger flavour in V1, and quest givers in M5b: Foreman Hask at the office, Ada Kerrow at the forge, and the collier at the kilns. One bell stands on the yard: the shift bell, which is the Emergency Bell and the Final Night object.

```
 N ┌──────────────── cliff: the hill ─────────────────[ADIT]─────────────┐
   │ TT  chute                      ┌SMITHY┐ [M]      ║     ┌OFFICE┐ [M] F │
   │ TT  landing                    └──D───┘          ║     └──D───┘     F │
   │ TT      ┌───── BUNKHOUSE ─────┐  lantern   lantern ║ ore bin         F │
   │ TT      │  (mess · bunks)     D side  ┌── YARD ──┐                  F │
 WOODS ══════│                     │       │ board BELL pump              │
 GATE│ TT    └───D─────────────────┘ crawl │  chest   │ barrel    flume   │
   │ TT     front                 lantern └──────────┘ lantern     ≈≈≈≈≈ │
   │ TT ┌WOODSHED┐                                 ┌─── SAWMILL ───┐≈ log ≈ │
   │ TT └────────┘   log deck                      │   (wheel)     D≈ pond≈ │
   │ TT                                            └──────D────────┘≈≈≈≈≈ │
   │ TT                                        log landing (planks)       │
   │ ════════════════════════ shingle bank ═════════════════════════════  │
 S └──────── the Blackwater ═══[broken trestle]═══ river ════════════════┘
```

- **Chokepoints:** the adit tunnel, the woods trail gate, the Workings' vent drift (2 tiles wide), the ford.
- **Loops:** camp -> woods -> vent drift -> Workings -> adit -> camp (every profile); yard -> sawmill door -> sawmill -> yard door -> log landing -> yard (short); woods -> drowned adit -> Deep Level -> winze -> Workings (Large).
- **One-way:** the log chute from the felling slope to the camp's chute landing (noise 9, footprints at the landing).

**Environmental storytelling (V1 set):**

- the telegram pinned to the notice board, its last line torn off;
- the tally board in the Workings with one name chalked out;
- the broken trestle with a lantern still hanging from it;
- an axe left in a stump on the felling slope;
- the company store's empty shelf;
- a bunk with its blanket folded and a black band;
- the payroll ledger open at a torn page;
- the forge cold on one side;
- wolf tracks along the flume;
- a dead man's lamp still burning in the Deep Level.
