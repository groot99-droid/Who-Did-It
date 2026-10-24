# Art: characters, scale, HD and the rooms (8F, 8I, 8J, 8K)

The owner, 2026-10-23 (A134): "I want the maps to have perfect object placement, go ham on the art and design details
in every room, also increase the relative size of the characters for the players so they have a closer look at
them, design the characters beautifully and robustly with animations movements and more. Ive added some photos for
more references. Also create the HD mode."

The art rules stay `docs/SPRITES.md`, `docs/ASSETS.md` and `style.json`. Assets are CC0 or the project's own
renders, never Synty, and never raw Mixamo or Quaternius sources (CLAUDE.md). Both art styles ship everything, and
round 8 adds the third style, HD.

## 1. The owner's sixteen references

The owner sent sixteen pictures in the round-8 conversation. They are **not committed**: several are other artists'
work, and this repo is public. They are described here so that every session works from the same reading. They
show **density, silhouette and finish**, never content to copy. Nothing is traced, and no figure, building or
layout is reproduced.

| # | Picture | What it teaches | For |
|---|---|---|---|
| 1 | A wizard with two owls: a low-poly figure with hand-painted pixel textures on a dark ground; teal robes with tattered hems, a spiral staff, a gem on the hat, a white beard falling in blocks, a monocle | A silhouette you read at a glance: layered cloth, one prop in each hand, a companion; strong faces through nose, brows and beard rather than eyes; deep, saturated three-tone shading | 8F |
| 2 | An isometric pixel courtyard of a ruined brick and concrete block: broken panes, cracks, ivy, rusted boxes, drains, debris, dry grass on the tiles | Surfaces that tell a story: every wall carries age (cracks, stains, plants), and the ground carries scatter (shards, grates, tufts) | 8J, 8K |
| 3, 4 | A stocky axe-bearer, as a three-view and a six-view turnaround: a pack, a bedroll, belts, pouches, big hands, a beard in blocks | Chunky proportions of about four heads; readable from all eight directions; the back view as designed as the front; kit that tells the trade | 8F |
| 5 | An overgrown isometric block of flats with rust streaks, roof greenery and a rubble apron | Vertical weathering, and a building that meets the ground with debris rather than a clean line | 8J, 8K |
| 6 | A rusted watchtower with a chain fence, razor wire, a ladder and pipes on cracked ground | Industrial props and fence lines, ladders that read as climbable; BlackPine's palette of rust and concrete | 8K |
| 7 | A ruined fuel stop as one object on a plain ground: cracked slab, weeds in the cracks, rust drips, broken glass | An object diorama: one prop finished on every face, the slab under it as part of the object | 8J, 8K, 8I |
| 8 | A low-poly goblin in a modelling program, its wireframe over a pixel texture | The technique: few polygons, detail painted into a pixel texture at a fixed texel density | 8F, 8I |
| 9 | A cutaway bakery seen from above at three-quarters: shelves of bread, jars, an oven, stairs, counters, rugs, plants, lamps, keepers at their stations | Every surface used and every station staffed; a room you could read the trade of with the lights off | 8J (Crumb's Ovens, the shops) |
| 10 | A low-poly knight in grey, before colour | Armour as big readable shapes: pauldrons, a tabard, a helm; and the value pass before any hue | 8F |
| 11 | A forest village from above in pixel art: paths, dry-stone walls, trees with root flare and layered canopy, flowers, a cart, a signpost, a cottage | The overworld's grammar: walls and paths that lead, trees in clusters with undergrowth, small props at the edges of every path | 8J |
| 12 | An isometric castle cutaway in pixel art: a library, an alchemist's room, an armoury, a dining hall and a chapel joined by stairs, with banners, candles and barrels | Rooms with one purpose each and the props that say it; stairs and doors placed where people would walk | 8J (manor, chapel, apothecary), 8K (office, lodge) |
| 13 | A dungeon from above in blue, lit by blue torches, with cobwebs, chains, chests and a magic circle | Lighting as the design: cold light sources placed in rhythm, dark between; caves and cellars | 8J (cellar, caves), 8K (mine, deep) |
| 14 | An isometric stone keep on a crag: a waterwheel, a spiral stair, a bell tower, a crypt with coins | Layered elevation, and working machinery that moves (the waterwheel); BlackPine's mill | 8K, 8G |
| 15 | A small animated low-poly warrior with shield and helm, looping its idle | Life at small size: an idle that breathes and shifts its weight, readable at 64 px | 8F |
| 16 | A desert oasis seen from high above, crowded with small figures, tents and stalls | A town that feels lived in: many small ambient figures at stalls and along paths | 8E (townsfolk count), 8J and 8K (stalls, market) |

## 2. Characters and their size (8F)

**Size on screen.** The owner wants a closer look at the characters.
- 8F makes characters about **1.5 times their present height on screen**, through two numbers in `metrics.json`:
  - `iso.viewTilesHigh` (a closer camera: fewer tiles in view);
  - `iso.figureScale` (new: figures drawn larger than true scale against props and tiles, anchored at the feet
    pivot, on top of the GDD 3.1 height factor).
- 8F proposes the pair with screenshots at 720, 1080 and 1440 in its first PR, and the owner signs off by eye.
- The vision rule (GDD 3.13, the 7-tile pool) does not change. If the closer camera crops the pool, the camera's
  framing is 8F's to solve (the follow offset and the zoom table of SPRITES 10.9), never the rule.
- Clicks, the `E` prompt and the occlusion fade (SPRITES 10.7, 10.8) are checked at the new scale.

**Resolution.** A larger figure must not be a blurrier one.
- The packed character cell goes from 64 px to 128 px (`iso.packedCharacterCellPx`), so a figure is never magnified
  past one texel per screen pixel at zoom 1.
- The atlas budgets of `tools/sprites/test/budgets.ts` are re-planned for that, with fewer frames before more
  bytes. A raised budget needs a DECISIONS row.

**The redesign** of the 13 looks and the `villager` family, in both styles, from the references (1, 3, 4, 8, 10,
15):
- chunky proportions of about four heads, wider hands and feet, a silhouette per trade that reads in black;
- one signature prop per look: the Baker's peel, the Vicar's book, the Doctor's bag, the Gamekeeper's gun, the
  Lamplighter's pole, and so on;
- layered cloth with tattered or stitched hems, belts and pouches, and the back designed as fully as the front;
- faces by nose, brows, beard and hat, still with no drawn eyes (`style.json`), and three-tone shading with
  saturated darks.

  `style.json`'s figure wording changes with it ("about five heads" becomes the new proportion), and the
  `figure` composition stays.
- **What the redesign keeps.** It keeps the 13 look ids, the cover rule (a cover wears another card's look
  exactly), the scarf, hat and blood passes, and the eight directions. It also keeps the GDD 3.1 height factors.

**Animation.**
- The clips of motion.md 1.
- A breathing idle with weight shifts and a blink of the hat brim or scarf.
- Walk and run with secondary motion: cloth, the pack, the beard.
- Turn-in-place frames where a direction changes by more than 90°.
- Frame counts within the re-planned budget.

**Proof.** The Blender rig as today (`build_looks.py`, `look_parts.py`, `rig_common.py`), with `palettize.py` and
`save_masters.py`; a turnaround contact sheet per look in the PR for the owner. 8F may fan out per look with
subagents (Sonnet for the repetitive passes), but holds the design itself.

## 3. HD (8I)

`hd` leaves `artStyles.reserved` and becomes the third style. A79 reserved it as "display-scale art, desktop
first"; this round defines it:

- **Same everything.** HD uses the same rig, scenes, keys, frame names, cells, pivots and draw scale as 8-bit and
  low poly. A key HD lacks falls back to its 8-bit entry (A80's loader, unchanged).
- **Display scale.** Every key is packed at the size it is drawn at zoom 2, the largest of SPRITES 10.9, so that no
  texel is magnified on a 1440 p display. For characters that is 256 px packed cells.
- **A finish of its own.** HD has no pixel finish; it uses linear filtering and the full render: ambient occlusion,
  soft contact shadows, a rim light keyed to the scene's lamp colour, and textures at their source resolution.
  8I proposes the look in a first PR, with the same room and figure in all three styles side by side, and the
  owner signs off by eye.
- **Desktop first.** The HD option is enabled where the device can hold it (8I's test, for example
  `navigator.deviceMemory`, the screen height and a WebGL texture size check). Elsewhere it stays disabled with a
  note ("Needs a larger screen"). As before, the pick is the player's own and never reaches the server.
- **Budgets.** HD has its own rows in `budgets.ts` and its own manifest root `assets/hd/`. HD loads lazily: its
  files are fetched only when a player picks HD.
- **Order.** 8I builds the pipeline and renders today's art first. After 8F, 8J and 8K merge, it runs a last
  pass (seams.md 7).

## 4. The rooms: placement and detail (8J HollowMere, 8K BlackPine)

"Perfect object placement" means, for every scene of the map:

1. **Placement rules**, checked by a new content test per map (`packages/content/test/placement.<map>.test.ts`):
   - no prop overlaps another prop's footprint or a wall;
   - every prop that sits against a wall faces out of it;
   - no prop blocks a door, a portal's approach tile, a spawn, a hide spot, a task node, a resource node, a shop
     or any other economy prop;
   - every walkable tile stays reachable from the scene's entry spawn;
   - lights sit on a prop or a wall that could hold them (`lamp` on a table or hook, `torch` on a wall or bracket);
   - small props sit on a surface or the floor, never in the air.

   The walk check uses the existing `.nav.json` tool, regenerated for every scene touched.
2. **Purpose.** Each room says its trade with nobody in it (reference 9, 12), and the dressing follows what the
   room is for in WORLD.md and the Bible:
   - the bakery's racks, sacks, peels and cooling bread;
   - the chapel's pews, candles and the altar (an economy prop of 8D);
   - the apothecary's jars, drawers and still;
   - the tavern's barrels, tankards and the back-room table (8D's black market);
   - the manor's portraits, library and strongbox room (7H);
   - the lodge's traps, furs and the snare rack;
   - the mill's gears and sacks;
   - the smithy's anvil and quench;
   - the office's ledgers and tally rack (8D);
   - the mine's props and lamps.
3. **Density and wear** (references 2, 5, 7, 11, 13):
   - floors carry scatter: rugs, straw, shavings, puddles, shards;
   - walls carry hangings, shelves, pipes, stains and cracks;
   - exteriors carry ivy, moss, debris aprons where a building meets the ground, and grass in the cracks;
   - every path is edged with small props.

   All of this stays within the scene's prop budget (ASSETS 6.8), with new budget rows by DECISIONS where a room
   needs more.
4. **Light as design** (reference 13): lights placed in rhythm along paths and in each room's working corners,
   colour by source (lamp amber, torch orange, cave blue, forge red), and darkness kept where the game wants it
   (`dark` scenes, the vision pool).
5. **New props** go in `env/hollowmere_props.py` or `env/blackpine_props.py`, drawn with the kit as today and in
   every style (8I's last pass for HD). A prop both maps need goes in `env/shared_props.py`, append-only.
6. **Fixed.** Scene, portal, spawn, clue and task-node ids, the gameplay of every prop (collision kinds, hide
   spots, statics with actions), the scenes' sizes and `SCENE_IDS` stay as they are. A scene grows only by a
   DECISIONS row.

Each scene ships with a before-and-after screenshot in the PR, at the new character scale, so the owner can judge
both together. 8J and 8K may fan out per room with subagents (Sonnet for the per-room passes). The lead holds the
placement rules and reviews every room.

## 5. Materials from Poly Haven, for all three styles (8I, with 8F, 8G, 8J, 8K)

The owner, 2026-10-23 (A155): "Can you use my Polyhaven textures and more for the HD version and maybe even
rerender them as 8 bit and low poly for better texture in those games?"

**Licence.**
- Poly Haven's textures, models and HDRIs are CC0 (https://polyhaven.com/license), the default ASSETS 6.5 allows.
  The same goes for ambientCG (https://docs.ambientcg.com/license/), the "and more".
- The owner's own Poly Haven library is the Blender add-on's local mirror on their laptop, which a session cannot
  reach. The sessions fetch the same assets by slug from `api.polyhaven.com`.
- Under the API's terms (https://github.com/Poly-Haven/Public-API/blob/master/ToS.md, read 2026-10-23), use is free
  for any purpose. Calls carry the user agent `who-did-it-build`. The in-game credit of 2.5 applies only to an app
  that surfaces the live API, and the game never calls it: assets are fetched once, at build time.
- Each asset used still gets a `CREDITS.md` row (source, slug, CC0) for provenance.

**The material library** is `tools/blender/materials/`, owned by 8I:
- `polyhaven.lock.json`: every slug used, with its type, resolution, file names and the md5 the API reports.
  ambientCG ids sit in the same lock under their own source.
- `fetch.py`: downloads the locked files into `tools/blender/.cache/materials/` (git-ignored), checks their hashes
  and refuses a mismatch. It is stdlib only, with no live calls at render time beyond a missing file.
- `roles.py`: material **roles** mapped to slugs, for example `wood_plank`, `wood_rough`, `plaster`, `brick`,
  `stone_wall`, `cobble`, `flagstone`, `thatch`, `slate_roof`, `iron`, `rust`, `copper`, `wool`, `linen`,
  `leather`, `fur`, `bread_crust`, `flour_sack`, `moss`, `mud` and `soil`. The kit, the props, the buildings, the
  ground and the characters ask for a role, never a slug, so one swap changes every use.
- Box projection at a fixed **texel density** per role, because the kit's meshes have no authored UVs. Each role
  also has a palette-toned variant (below).

**How each style uses them.**

| Style | Textures | Finish |
|---|---|---|
| **8-bit** | 1k, toned toward the role's palette ramp before render | The existing pixel finish (`palettize.py`, oklab match). The grain survives as the dither patterns `style.json` already asks for on plaster, stone and wood |
| **Low poly** | 1k, toned toward the palette and slightly posterised, so the look stays stylised and never photographic (`styleAvoid`) | As today: box-downscaled, linear filtering |
| **HD** | 2k (4k where a surface fills the frame), untoned colour, normal and roughness | Two finishes on one key light (A164, the owner's look-sheet pick): figures, props, clues, ground and effects in the HD finish of 3 with the maps as bump; buildings and the kit in PBR on the same maps with one Poly Haven HDRI (CC0, in the lock) as soft fill only |

- **The key light stays A9's at 225° in every style.** The sprites keep matching the game's lighting layer, and the
  HDRI never decides a shadow's direction.
- **Poly Haven models** (barrels, crates, furniture, rocks, plants) may stand in for or join kit props. Each is
  decimated for low poly, re-textured by role, and judged against the style formula. A photographic model dropped
  in unstyled is refused.
- **Sources are never committed.** Textures, `.blend` and `.gltf` sources stay in the cache, as raw Mixamo and
  Quaternius sources do (CLAUDE.md). Only renders ship, and the lock file makes every render reproducible.

**Who re-renders what.**
- 8I builds the library first, as its own small PR, and the others build on it.
- Each session re-renders its own keys in **all three styles**:
  - 8F: the characters (cloth, leather, metal, fur roles);
  - 8J and 8K: their props, buildings and ground;
  - 8I: the shared tiles of `build_tiles.py` and anything no other session owns;
  - 8G: any creature, node or VFX it moves from code-drawn art to the rig.
- The keys, cells, pivots and draw scale do not change (A79). Textured renders compress less well, so a session
  fits the budgets with fewer frames first. A raised budget needs a DECISIONS row.
- **The owner signs off.** 8I's look PR shows one room and one figure in each style, flat against textured, and
  the owner judges it by eye before any session re-renders in bulk.

## 6. Tests the sessions owe

- **8F**:
  - the manifest keys for every look × clip × direction × style;
  - the budgets;
  - the camera's zoom table at the new `viewTilesHigh`;
  - the e2e screenshots of a match at the new scale.
- **8I**:
  - `fetch.py` against a fake server (hashes checked, mismatch refused, the user agent sent);
  - every role in `roles.py` resolves to a locked slug;
  - the `hd` manifest's keys against the 8-bit set (missing keys listed, and falling back);
  - the device gate;
  - lazy loading;
  - `artStyle.test.ts` with three styles;
  - an e2e switch to HD and back mid-match.
- **8J and 8K**:
  - the placement tests of 4.1 per map;
  - nav regenerated;
  - every scene walked by `pnpm auto -- --matches 20` with no `npcStuck`.
