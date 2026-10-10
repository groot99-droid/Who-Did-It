# World Bible and Level Design

> Generated from `docs/MASTER_PLAN.md` (v0.1, 2026-10-10). Geography, scene ids, portal ids, lore and lighting. Numbers that affect play live in `GDD.md`.

## 4. World bible

### 4.1 Setting

**Hollowmere**, a fog-bound harbour hamlet on a northern coast, autumn 1931. The storm closed the only road; the fog hides the sea. Lord Aldous Vane, owner of the shuttered tin mine, died three nights ago and his will names "whoever remains when the last lantern goes out". The flooded lowest gallery leaks "mere-rot" into the marsh, which makes the wolves bold and wakes something in the sea cave (the Beast, V2). Tone: toon-noir, chunky villagers in trench coats and wool caps, wet cobbles, amber lantern light against slate-blue dusk. Landmark NPCs (Mrs Grieves the tavern keeper, Old Fennick at the light, Father Bray, Doc Mallory, Tuck the ferry boy) are environmental storytelling and shop signage in V1; a Grieves tab book that mirrors the Ledger is V1.5. One bell stands on the square: it is the Emergency Bell, the Final Night object and the Butler's remote pull (V1.5). The chapel rope is decoration.

**The wake-loaf custom.** Tamsin Crumb runs Crumb's Ovens on the east lane between the square and the apothecary. The night before a will is read she bakes one loaf per mourner and three for the dead, each with a wax-sealed crumb token inside; the quick mode One Night Ultimate Baguette (GDD 3.11) is played entirely around her Wake Table. In the main match the bakery is an ordinary Small-profile house with a fetch task, and Tamsin joins the landmark NPCs as signage and ledger flavour.

### 4.2 Metrics

`TILE_PX = 64`; 1 tile = 1 m; character render cell 128 px; max standing silhouette 90 px; interiors are at least 12x9 tiles (the loft and bedroom rooms) with camera follow (no whole-room fit); every size is in 4.3 and `scenes/*.json`. The exporter fails on any tileset whose `tilewidth` is not 64. All radii in rules are in tiles and live in `@wdi/shared/constants.ts`.

### 4.3 Scene graph

Profiles are gated by player count: **Small** (4-6), **Medium** (7-8, adds manor and barn), **Large** (9-10, adds chapel and cellar). Doors of scenes outside the profile render boarded and the portal rejects with `CLOSED`. `zoneId` (visibility, Ledger, noise) is introduced now and equals `sceneId` in V1.

| id | Name | Profile | Size (tiles) | Exits (portal id -> target.spawn) | Player spots / body spots | Notes |
|---|---|---|---|---|---|---|
| `overworld` | Hollowmere | Small (64x48 authored; NW Manor Rise and NE paddock gated shut below Medium) | 64x48 | `ov.tavern_front` -> `tavern_bar.front`; `ov.tavern_alley` -> `tavern_bar.alley`; `ov.apoth` -> `apoth_shop.door`; `ov.bakery` -> `bakery.door`; `ov.widow` -> `widow_parlour.door`; `ov.forest_gate` -> `forest.gate`; `ov.manor_front` / `ov.manor_back` -> `manor_hall.*` [M]; `ov.barn` -> `barn.door` [M]; `ov.chapel` -> `chapel.door` [L]; `ov.well` -> `cellar.well` [L] | hedges, cart, dock crates / – | Square with bell and well; 4 lantern posts; fence line NE |
| `tavern_bar` | The Drowned Lantern | Small | 20x12 | `tb.front`, `tb.alley` -> overworld; `tb.back` -> `tavern_back.door` | behind bar, keg stack / – | Warmest light; task: dartboard letter drop |
| `tavern_back` | Tavern back room | Small | 12x10 | `tk.door` -> `tavern_bar.back`; `tk.trap` -> `cellar.trap` [L, boarded below] | wardrobe / crate pile | Oil barrel (task tool) |
| `apoth_shop` | Mallory Apothecary | Small | 18x11 | `as.door` -> overworld; `as.stairs` -> `apoth_loft.stairs` | behind counter / – | Basin (Blood wash); Wrench on the bench |
| `apoth_loft` | Apothecary loft | Small | 12x9 | `al.stairs` -> `apoth_shop.stairs` | herb loft, under bed / trunk | Near-dark, one green lamp |
| `widow_parlour` | Widow Vane's parlour | Small | 16x11 | `wp.door` -> overworld; `wp.bedroom` -> `widow_bedroom.door` | pantry / – | Portrait turned to the wall; letter box |
| `widow_bedroom` | Widow's bedroom | Small | 12x9 | `wb.door` -> `widow_parlour.bedroom` | wardrobe, under bed / wardrobe | Single candle |
| `forest` | Gallows Wood | Small | 40x30 | `fo.gate` -> overworld; `fo.log` -> `overworld.forest_back` (one-way crawl); `fo.cave` -> `cave_entry.mouth` | hollow trees, brush / – | 3 wolf loops away from the gate; 6-tile clearing; Planks at the edge |
| `bakery` | Crumb's Ovens | Small | 18x11 | `bk.door` -> `overworld.bakery` | behind the counter / – | Wake Table with up to 10 named plates, oven ledge with the dead's three loaves, the Baker's ledger, cold oven, flour floor. Hub of the quick mode (GDD 3.11); in the main match a task node (Fetch flour) and a Blood-wash basin alternative |
| `cave_entry` | Tin Gallery mouth | Small | 20x14 | `ce.mouth` -> `forest.cave_side`; `ce.sea` boarded (V1.5 Thief exit, low tide on Nights 2 and 4) | stalagmites / pool niche | Bioluminescent moss gives a 2-tile ambient radius |
| `manor_hall` | Vane Manor, hall | Medium | 28x16 | `mh.front`, `mh.back` -> overworld; `mh.stairs` -> `manor_upper.stairs` | wardrobes x2, curtain alcove (off the main sightline) / – | Stopped clock at 11:47; safe |
| `manor_upper` | Vane Manor, upstairs | Medium | 24x12 | `mu.stairs` -> `manor_hall.stairs`; `mu.balcony` -> `overworld.balcony_drop` (one-way, noise 9, 90 s footprints at landing) | under beds, attic hatch / – | Locked study (`key_study` in the cellar [L] or the loft [M]) |
| `barn` | Hale Barn | Medium | 20x12 | `ba.door` -> overworld; `ba.loft` -> `overworld.barn_loft_drop` (one-way) | hay piles x2 / hay pile | Goat bleats (noise 4) when anyone enters |
| `chapel` | St Brannock's | Large | 18x12 | `ch.door` -> overworld; `ch.crypt` -> `cellar.crypt` | confessional / crypt niche | Silent zone: no footstep noise |
| `cellar` | The Undercroft | Large | 28x16 | `cl.well` -> `overworld.well`; `cl.trap` -> `tavern_back.trap`; `cl.crypt` -> `chapel.crypt` | wine racks / dump spot | Pitch dark, 2-tile ambient; gas pockets in marked side alcoves (V1.5) |

V1.5: `cottage_fisher`, `lighthouse` (3 stacked rooms), cave `sea_exit`. All ids, spawn ids and portal ids are frozen in `packages/content/data/scenes/*.json`; V2 reads the same graph.

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

Crumb's Ovens (`bakery`) stands on the east lane between the square and the apothecary, one door, lit window. Chokepoints: manor lane, tavern alley, cliff path, forest gate. Loops: square -> alley -> dock -> cliff -> chapel -> square (outer); manor <-> cellar <-> tavern (Large). LOS breakers (hedges, headstones, cart, crates) are occluder tiles in the nav bitmap from V1.5. Layout rule: no walkable tile within 2 tiles north of a building footprint except the door approach; any building sprite overlapping a visible player auto-fades.

### 4.5 Portal rules

One `portals.schema.json` in `@wdi/content` (zod): `id` (`scene.portal`, globally unique), `from`, `to`, `toSpawn`, `kind` (`door|stairs|hatch|drop|crawl|gate|forest_gate|cave_mouth`), `oneWay`, `lock {keyId}`, `window` (`night|lowTide|null`), `noise` (tiles), `elevationDelta` (m), `minProfile`. Spawns carry `x, y, z, facing`. The exporter validates uniqueness and that every `toSpawn` exists; CI fails otherwise. The server owns the graph; the client never decides a transition. Keys are inventory items. One-way drops emit noise 9 and a 90 s footprint trail (height trait) at the landing. Noise crossing a portal is halved and re-emitted at the paired portal as "muffled".

### 4.6 Bestiary

| Creature | Ships | Spawn | Behaviour | Threat | Killer cover |
|---|---|---|---|---|---|
| Mere-wolf | V1 | forest loops (3); 1 enters the village at night when the fence is broken | Patrols; chases unlit players; flees lantern or candle within 4 tiles; dies to a bolt | 1 damage, 2 HP players | Kill in the forest to blame wolves; the knife still leaves a Thread and Autopsy says "knife" |
| Bog-wisp | V1.5 | marsh, cave pools | Lures; blinds light radius 5 s | Nuisance | Blinds witnesses |
| The Beast | V2 | cave, released by the Accomplice or at cycle 4 | 2 hits kill; drawn to light | Lethal to lone players | Cave bodies get Ichor + Drag Marks |
| Crows, rats, gulls | V2 | rooftops, attic, lighthouse | Noise amplifiers | Social | Running = being seen |

### 4.7 Clue placement and lighting

Kill clues are generated by the rules engine, never placed by hand. Static "document" nodes (letters, tab book, confession ledger) produce trait-less Claimed flavour and are V1.5. The grace-phase teaching clue is the only static clue in V1.

Lighting is **baked** in V1 (Path A): a fixed key light parented to the camera for every asset class, no cast shadows, a shared drop-shadow ellipse under every y-sorted object, night as a tinted overlay plus a radial fog-of-war mask with a 25% luminance floor, additive glow sprites for lanterns. Day ambient `#2C3240` at 60%, night `#12141C` at 25%; one warm (`lantern`) and one cool (`moon`) light family per scene. Phaser 4 `setLighting(true)` with a normal-map pass is a V1.5 experiment behind a flag.

### 4.8 Environmental storytelling (V1 set)

Black crepe on the manor door; stopped clock at 11:47; tide chart with the next low tide circled; chalk hopscotch under a lantern; drowned-sailor photos in the tavern; the apothecary's "NOT FOR SALE" shelf with one empty slot; wolf pelt on the barn door; the chapel rope with a torn glove in it; the Widow's portrait turned to the wall; a VANE TIN CO crate half-pried open; a scarecrow in a trench coat; a gravestone with tomorrow's date; muddy bootprints on the manor carpet (static red herring); a drowned lantern still glowing in the marsh fog.

### 4.9 V2 notes

Keep every scene, portal, spawn and clue id; 1 tile = 1 m. Manor floors, the cellar and the lighthouse become real volumes while `zoneId` keeps their visibility and Ledger scope; cottages, tavern, chapel and barn stay portal-loaded. One-way drops become ledges, the hollow log a crouch tunnel, the tide a water volume. Baked sprites are discarded for the original Blender meshes.
