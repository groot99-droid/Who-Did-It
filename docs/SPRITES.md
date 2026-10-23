# Sprite Conventions

> The contract between the art pipeline (`tools/blender`, `tools/sprites`, Session D) and the client
> (`apps/client`, Session B). Code imports the keys below, never file paths. Numbers that affect play
> live in `GDD.md`; colours and the render rig live in `ASSETS.md` 6.1-6.2; this file names things.

## 1. Cells, scale and directions

- Character cells are **128 px displayed cells, packed at 64 px** (10.3). One tile is 64 px = 1 m
  (`TILE_PX`, `WORLD.md` 4.2). A standing 1.7 m villager is about 100 px tall in the cell.
- Animations play at **12 fps**. The rig renders the source clip with `frame_step` so the output is
  12 fps whatever the clip's scene rate.
- Height traits are not separate art: the client scales the sprite by the GDD 3.1 factor, anchored at
  the feet pivot.
- Eight directions, clockwise from screen up; the atlas `<dir>` is screen frame, data and wire
  directions are world frame (10.4). This order is the only direction table; the code copy
  is `dirFromVector` in `@wdi/shared` and the rig copy is `DIRECTIONS` in `tools/blender/rig_common.py`.

| Index | Dir | Facing (screen) | Turntable `TT.rotation_euler.z` |
|---|---|---|---|
| 0 | `n` | up (world north-west) | 45° |
| 1 | `ne` | up-right | 0° |
| 2 | `e` | right | -45° |
| 3 | `se` | down-right | -90° |
| 4 | `s` | down (towards the camera) | -135° |
| 5 | `sw` | down-left | -180° |
| 6 | `w` | left | -225° |
| 7 | `nw` | up-left | -270° |

## 2. Rendered frame files

`batch_render.py` writes one PNG per frame, per pass, named by the frame regex of `ASSETS.md` 6.2:

```
^char_(\w+)_(idle|walk|run|interact|swing|carry|die|hide)_(n|ne|e|se|s|sw|w|nw)_(\d{3})$
```

Example: `out/<body>/scarf/char_villager_walk_se_003.png`. Frame numbers start at `000` and are
contiguous per clip and direction.

**Body ids** are the look ids of `looks.json` (`^[a-z][a-z0-9]*$`) plus `villager` for figures that
are not seats. A look names a character, and in the main mode a look is public by design; the three
cover cards (Killer, Accomplice, Drifter) never get a body, so no world key, frame or file ever names a
role that hides.

## 3. Atlas keys

Animation keys follow `char/<body>/<anim>/<dir>` for the body pass. Each overlay pass uses the same
grammar with the pass name in place of `char`, so one `PlayerView` plays the same `<body>/<anim>/<dir>`
tail on every layer:

| Layer (draw order, bottom to top) | Anim key | Texture key | Pages |
|---|---|---|---|
| body | `char/<body>/<anim>/<dir>` | `char_<body>` | 1 |
| blood (torso and hands mask, shown while Bloody) | `blood/<body>/<anim>/<dir>` | `ovl_<body>` | 1 shared |
| scarf (grey, toon-ramped, tinted at runtime) | `scarf/<body>/<anim>/<dir>` | `ovl_<body>` | |

Round 5: the hat passes are gone (hats are nameplate glyphs, GDD 3.1); a look's body is one 1024² page and its
overlays one 1024 x 512 page (art plan 1.4).

Frame names inside an atlas are the anim key plus `/` and the three-digit frame number:
`scarf/villager/walk/se/003`. The packer derives them from the rendered file name and its pass folder.

Clips and frame counts for V1 (`ASSETS.md` 6.3). `run`, `carry` and `hide` are reserved by the regex
and arrive after the M3 gate.

| Anim | Frames | Repeat | Notes |
|---|---|---|---|
| `idle` | 8 | loop | |
| `walk` | 8 | loop | |
| `swing` | 6 | once | Shared by Kill, Crowbar and Check (`ARCHITECTURE.md` 5.4); never role-specific |
| `interact` | 8 | loop | A V1 clip of every look, in 8 directions, `Presence.animId` 4: one id for every hold, as `swing` is for every strike, so it never tells one action or role from another |
| `die` | 8 | once, hold last frame | The last frame is the body on the floor. Rendered in 256 px cells with the feet at the centre (a fallen body reaches about 90 px below the feet); trim and the pivot hide the difference |

Prop frames (round 8, 8K) are looked up in `props_<mapId>`, then `props`, and within each atlas by stem in this
order: the exact state frame where the kind has one (`prop_lanternPost_lit`), then `prop_<kind>`, then
`prop_<id tail>`, then `prop_<id tail without a trailing _<n>>`, so `bm.ore_cart_0` and `bw.kiln_1` share
`prop_ore_cart` and `prop_kiln`. A multi-tile prop looks up `<stem>#0_0` in the same order and is cut with the
stem that matched (`propStems`, `apps/client/src/view/mapDefs.ts`). `decor` and `dressing` props have no frame of
their kind, so they always resolve by tail; with no frame they draw nothing (10.13). HD manifests and every map's
prop rows follow this order.

## 4. Feet pivot manifest

The rig projects the `Feet` empty into camera space on every rendered frame and writes one
`manifest.json` per body next to the pass folders:

```json
{
  "version": 1,
  "body": "villager",
  "cell": 128,
  "fps": 12,
  "passes": ["body", "scarf", "blood"],
  "frames": {
    "char_villager_walk_se_003": { "feet": [64.0, 112.5] }
  }
}
```

`feet` is in cell pixels from the top-left corner of the untrimmed cell, at the display scale as rendered;
the `pixel` CLI halves `cell` and `feet` with the frames (SPRITES 10.3), so a packed look's manifest says
`"cell": 64`; a frame rendered in a
larger cell (`die`, 256 px) also carries `"cell": 256`. Every pass of a frame
shares the body's pivot, so the overlays stay registered. The packer keeps `sourceSize` and
`spriteSourceSize` (trim is reversible) and `gen-anims.ts` writes the pivot into every atlas frame as
`pivot: {x: feet.x / cell, y: feet.y / cell}`; Phaser applies a frame's custom pivot as the sprite
origin when the frame is set, so the feet stay put while the trimmed size changes.

## 5. Asset manifest and loading

`apps/client/public/assets/manifest.json` (real art) and `apps/client/public/assets/placeholder/
manifest.json` (generated placeholders) have the same keys; `?art=placeholder` picks the second.

**Art styles (A79).** The real art ships in each style of `style.json` `artStyles`. The 8-bit style is
`assets/manifest.json` (`"art": "real"`). The low-poly style is `assets/lowpoly/manifest.json`
(`"art": "lowpoly"`), with its files under `assets/lowpoly/` and its URLs relative to that folder. A style
manifest re-skins keys of the 8-bit manifest only: same type, frame names, cells, pivots and `maps`,
and the style's `filter` on every filtered texture (`tools/sprites/test/styles.test.ts`). The client
loads the player's style and falls back key by key to the 8-bit entry for any key the style lacks. Switching
style mid-match swaps the textures in place, by key. `?art=placeholder` overrides every style.

```json
{
  "version": 1,
  "art": "placeholder",
  "entries": [
    { "key": "char_villager", "type": "multiatlas", "url": "chars/char_villager.json", "path": "chars/", "filter": "linear" },
    { "key": "anims_villager", "type": "animation", "url": "chars/villager.anims.json" },
    { "key": "tiles_cobble", "type": "image", "url": "tiles/tiles_cobble.png", "filter": "linear" }
  ]
}
```

`type` maps to the Phaser loader method (`multiatlas`, `atlas`, `image`, `animation`); `filter` is
`linear` or `nearest` and is set per texture after load: `nearest` for every world texture except
`clues` (linear) while the main mode's pixel finish is on (`style.json` `pixelFinish.enabled.main`;
10.3), and `linear` for every main-mode world texture while it is off. An optional field says when an
entry loads (10.13): `maps` (`string[]`, map ids) loads it with the match's map; an
entry without it loads at boot; `origin` (optional, `[x, y]` normalised) is
the display origin for single images: building exteriors use `[0.5, 1]`, the middle of the front wall's
base. Atlas pages are always named `<key>-<n>.png`. Clue frames are centred (no pivot). Anim files use Phaser's own
`{anims: [{key, frames: [{key, frame}], frameRate, repeat}]}` format for `load.animation`.

**Loading notes (M3).** The `World` scene never names a path: bodies use the last frame of `char/villager/die/s` (and its `scarf` and `hat_*` twins) from `char_villager` and `ovl_villager`; clues use frames of the `clues` atlas (`clue_footprint_<s|m|t>_mid`, `clue_thread_<red|green|blue>`); the overworld props use `prop_<kind>` frames of a `props` atlas (`prop_bell`, `prop_pump`, `prop_noticeBoard`, `prop_kitChest`, `prop_lanternPost`; the id suffix, e.g. `prop_board`, is tried second). Any key the manifest lacks draws a labelled greybox mark (`textures.exists`), so the game plays before the art lands. Sound is separate: `assets/audio/manifest.json` (`{key, url, gain}`) is fetched once by `AudioBus` and a missing file leaves the game silent.

**Loading notes (M5a).** `queueManifest` queues only the entries without `maps`; the World's `preload` calls `queueMatchEntries` with the match's `Settings.map` for the rest, reading the manifest that `resolveManifest` remembered (`peekManifest`), and skips what is already loaded. A texture a map adds gets its filter from `applyFilters` once it is loaded.

**Loading notes (M3b).** The bakery draws its props from the same `props` atlas by `prop_<kind>` then `prop_<id tail>` (`prop_plate`, `prop_deadLoaf`, `prop_ledger`, `prop_wakeTable`, `prop_oven`, `prop_basin`, `prop_flour_sacks`); a plate appears only for a seat the server lists and wears the owner's name over its frame, and a prop whose key is missing draws a labelled greybox (the wake table draws nothing without its art, since the plates stand on it).

## 6. Overlay passes

`batch_render.py` renders each pass through the same camera and turntable with a material override,
so every pass has the same frame list and pivots:

| Pass | What is visible | Material |
|---|---|---|
| `body` | full character, no scarf | toon world-palette materials (ramp neighbours as light and shadow) |
| `scarf` | scarf only, held out by the body | the world `bone` ramp (`#D9D2C2` mid), tinted at runtime |
| `blood` | torso and hands mask | flat `blood` (`#B3121F`) |

Held-out geometry renders as a holdout so overlays are occluded correctly by the body.

## 7. Palette tokens

The only colours allowed (`ASSETS.md` 6.1; machine copy `packages/content/data/palette.json`):

| Token | Hex | Use |
|---|---|---|
| `ink` | `#12141C` | outlines, darkest shadow, icon strokes |
| `slate` | `#2C3240` | shadow tint, day ambient |
| `fog` | `#6F7A8C` | body mid-tone |
| `bone` | `#D9D2C2` | body light, paper fills, scarf base before tint |
| `mustard` | `#F2B33D` | primary buttons, Neutral faction |
| `teal` | `#2EC4B6` | interactables |
| `magenta` | `#E04E9A` | hazards |
| `blood` | `#B3121F` | blood, Cabal faction |
| `lantern` | `#FFB457` | warm light, key light colour family |
| `moon` | `#7FA8FF` | cool light, fill colour family, Village faction |

**Scarf tints (source: `packages/content/data/traits.json`, `axes.scarf.values[].tint`).** Red = `blood`,
green = `teal`, blue = `moon`. The nameplate shape (diamond, circle, square; GDD 3.1) carries the
trait for colour-blind players, so the tint is never the only signal.

## 8. Placeholder keys through M3

`tools/sprites/placeholder.ts` generates every key below under `apps/client/public/assets/placeholder/`
as flat palette shapes with a direction arrow and a text label, so playtests run before real art.

**Characters** (`char_villager`, `ovl_villager`, `anims_villager`): body `villager`; anims `idle` (8),
`walk` (8), `swing` (6), `die` (8); all 8 directions; passes `char`, `scarf`, `hat_cap`, `hat_bowler`,
`blood`. That is 30 frames x 8 directions = 240 frames per pass, 1,200 frames and 160 anim keys.

**Clues** (texture `clues`, one frame per key, 64 px cells; `ASSETS.md` 6.3). Mud tints are `ink`,
`slate`, `fog` (`dark`, `mid`, `light`); heights follow the GDD trait codes `s`, `m`, `t`.

| Key | Count |
|---|---|
| `clue_footprint_<s\|m\|t>_<dark\|mid\|light>` | 9 |
| `clue_thread_<red\|green\|blue>` | 3 |
| `clue_felt_<cap\|bowler\|bare>` | 3 |
| `clue_smear` (blood smear by the body) | 1 |
| `clue_print` (fingerprint, Dust-able) | 1 |
| `clue_bucket_wet` | 1 |
| `clue_fur`, `clue_claw` (wolf kill) | 2 |
| `clue_drag` (drag smear segment) | 1 |
| `clue_footprint_<s\|m\|t>_glow` (Hunger's glowing prints, `ClueKind.hungerPrints`; round 5) | 3 |

Real clue art (M3, `tools/blender/build_props.py`) keeps these keys in the same `clues` texture, one
64 px cell per key at the world scale of 64 px per metre; round 5 re-finishes them with the pixel finish
(display size, `linear`, one 256 x 512 page) and adds the three glow frames: the footprint in the moon
ramp's light steps with a one-pixel `#7FA8FF` rim, drawn like any footprint. Ground marks (footprints, smear, print, fur,
claw, drag) are rendered by the straight-down `TileCam`, like the ground tiles; the wet bucket, the
thread and the felt are small objects rendered by `IsoCam` (10.3). Frames stay centred (no
pivot). Footprints and the drag segment point screen-up (`n`): rotate the sprite by `Clue.dir`; the
drag segment fills the cell top to bottom so segments chain along a trail. A footprint frame is one
left-right pair; the client lays the 5-tile trail (GDD 3.4) from several of them.

**Building exteriors.** From round 5 a building is drawn from its slices `<art>#<dx>_<dy>` in
`bld_<mapId>` (10.5, 10.13): `bld_hollowmere` holds `manor`, `barn`, `bakery`, `apoth`, `widow`,
`tavern`, `chapel`, `netloft`, `mollHut`; `bld_blackpine` holds `lodge`, `mill`, `office`, `smithy`,
`woodshed` (art plan 3.4). The `bld_<id>_ext` stand-ins below left both manifests with `bld_hollowmere`
(Session 5K); the table is kept as the record of the round-4 keys. One per
Small-profile building of `WORLD.md` 4.3; the id is the stem of its frozen overworld portal id
(`ov.<id>`):

| Key | Building | Interior scene |
|---|---|---|
| `bld_tavern_ext` | The Drowned Lantern | `tavern_bar` |
| `bld_apoth_ext` | Mallory Apothecary | `apoth_shop` |
| `bld_widow_ext` | Widow Vane's cottage | `widow_parlour` |
| `bld_bakery_ext` | Crumb's Ovens | `bakery` |

Medium and Large buildings (`bld_manor_ext`, `bld_barn_ext`, `bld_chapel_ext`) follow the same
grammar in M6. The real manifest's four exteriors are rendered stand-ins (`buildings/`,
`tools/blender/build_buildings.py`, M3b) at the placeholder's geometry, so both sets place the same.

**Ground tilesets.** From round 5 the ground is the isometric tileset `iso_ground_<theme>` (10.12);
the sets below are the M3b stand-ins (straight-down camera, 64 px cells, 4 variants in a row, 256 x 64
px each):
`tiles_grass`, `tiles_path`, `tiles_cobble`, `tiles_floorboards`, `tiles_caverock`, `tiles_forestfloor`.
The real sets are rendered stand-ins (`tiles/`, `tools/blender/build_tiles.py`, M3b); every variant tiles
with every other.

**Props** (texture `props`, `props/props.json`; M3, the bakery keys M3b; the placeholder set draws each key
as an unlabelled greybox block on the same cell and pivot). From round 5 the boot atlas `props` holds the
shared props, spots and portal frames and each map has `props_<mapId>` (10.13, art plan 3.5-3.7): the bell
and the bakery keys below now live in `props_hollowmere`. One frame per key, rendered by
`IsoCam` at the display scale and finished to packed size (10.3). The key is `prop_<kind>` with the `kind` of
`packages/content/data/scenes/overworld.json` `props[]`; a stateful prop adds its state. Every frame
carries a `pivot` at the base (the ground point under the prop's tile centre), so the sprite is placed
at the tile centre and y-sorted by that point, like a character's feet.

| Key | `kind` | Prop |
|---|---|---|
| `prop_bell` | `bell` | Meeting bell on a timber frame (`ov.bell`) |
| `prop_pump` | `pump` | Well pump on a stone well head (`ov.pump`) |
| `prop_noticeBoard` | `noticeBoard` | Notice board with pinned papers (`ov.board`) |
| `prop_kitChest` | `kitChest` | Iron-banded chest for ejected kits (`ov.chest`) |
| `prop_lanternPost_lit`, `prop_lanternPost_unlit` | `lanternPost` | Lantern post, glass lit (`lantern`) or dark (`ov.lantern_0..3`) |

The bakery keys use the `kind` of `packages/content/data/scenes/bakery.json` `props[]`, or the id tail
when the kind is not a prop name (`bk.flour_sacks` is a `taskSource`). A prop spanning several tiles is
cut into one slice per footprint tile, `prop_<kind>#<dx>_<dy>` (10.5); the 40° rig's depth stretch
(1 / cos 40°) is retired.

| Key | `kind` (id) | Prop |
|---|---|---|
| `prop_wakeTable` | `wakeTable` (`bk.wake_table`) | The Wake Table, 5 x 2 tiles; the pivot is its back row's middle tile, so it covers the ten plate tiles |
| `prop_plate` | `plate` (`bk.plate_0..9`) | A plate with a loaf, drawn at the table's top (0.78 m, 33 px above its pivot); the client draws the owner's name |
| `prop_deadLoaf` | `deadLoaf` (`bk.deadloaf_0..2`) | One tile of the oven ledge with one of the dead's loaves (mourning band); three stack into the ledge |
| `prop_ledger` | `ledger` (`bk.ledger`) | The Baker's ledger, shut, on a sloped desk with an inkwell |
| `prop_oven` | `oven` (`bk.oven`) | The cold bread oven: stone base, dome, dark mouth, flue, a peel |
| `prop_basin` | `basin` (`bk.basin`) | Stone wash basin with water, a rag and a jug |
| `prop_flour_sacks` | `taskSource` (`bk.flour_sacks`) | Three flour sacks and a spill |

**Loft images** (`type: image`, `loft/`; M3b) left with the quick mode (round 7, A115), with `build_loft.py`.

**VFX** (texture `vfx`, `vfx/vfx.json`; anims `anims_vfx`, `vfx/vfx.anims.json`; M3; the placeholder set
has the same frames as flat marks that grow or fade).
Frame names are the anim key plus `/` and the three-digit frame number (`vfx_blood_pool/003`); every
anim plays at 12 fps once (`repeat: 0`) and Phaser holds its last frame. Every frame carries a
`pivot`: the ground point of the effect, or the centre for the stamp.

| Anim key | Frames | Camera, cell | Notes |
|---|---|---|---|
| `vfx_blood_pool` | 8 | `TileCam`, 128 px | Pool spreading under a body; the last frame is the resting pool |
| `vfx_blood_splat` | 12 | `IsoCam`, 128 px (round 5) | Spray from chest height to specks on the ground, at the kill |
| `vfx_vote_stamp` | 10 | straight down, 256 px | Stamp slams down and lifts, leaving the `blood` seal (UI, reveal) |
| `vfx_dust_step` | 6 | `IsoCam`, 64 px (round 5) | Puff at a boot; ends empty |
| `vfx_disguise` | 8 | `IsoCam`, 128 px, pivot at the feet (round 5) | Fog and slate smoke rising feet to head round one turning mustard spark, gone by frame 7; only where a Knife strike drops a disguise |

**Body.** The body on the floor is the last frame of `die` (`char/<body>/die/<dir>/007`, with the
`scarf` and `blood` overlays on the same tail), held by the one-shot anim; no separate key.
Review sheet: `assets/source/review/villager-body-contact.png`.

## 9. UI icons

Hand-written SVG in `apps/client/public/assets/ui/icons/`, loaded by the DOM overlay, not Phaser.
48 px grid (`viewBox="0 0 48 48"`), 2 px `ink` stroke with round caps and joins, palette fills only,
no text. File name = key. They are drawn for the `bone` paper fill of the UI; on `slate` or `ink` panels
put them on a `bone` chip, since the ink hats disappear otherwise. `tools/sprites/test/icons.test.ts`
checks this list, the grid, the stroke and the colours.

| Key | Meaning |
|---|---|
| `icon_faction_village` | Village: shield, `moon`, `bone` chevron |
| `icon_faction_cabal` | Cabal: dagger, `blood` |
| `icon_faction_neutral` | Neutral: masquerade mask, `mustard` |
| `icon_height_tall`, `icon_height_short` | Height trait (medium has no icon; the HUD shows the bare figure) |
| `icon_scarf_red`, `icon_scarf_green`, `icon_scarf_blue` | Scarf trait; the nameplate shape (diamond, circle, square) is drawn on the scarf |
| `icon_hat_cap`, `icon_hat_bowler`, `icon_hat_bare` | Hat trait |
| `icon_ability_impersonate` | Killer, Impersonate: two head-and-shoulder outlines, the front `fog`, the back `ink`, a `mustard` spark between them |
| `icon_ability_confession` | Vicar, Hear Confession: a confessional grille with a `bone` ear behind it |
| `icon_ability_keepwatch` | Watchman, Keep Watch: a pole lantern with `lantern` glass beside an open eye |
| `icon_ability_remedy` | Herbalist, Remedy: a stoppered bottle with a `moon` cross |
| `icon_ability_poison` | Herbalist, Nightshade (ability `poison`): a stoppered bottle beside a sprig of three `ink` berries |
| `icon_ability_lastshot` | Gamekeeper, Last Shot: a barrel's end under a `blood` ring of crosshairs |

The ability keys are `icon_ability_<abilityId>` with the ability id in lower case (round 5, art plan 4.6).

## 10. Isometric projection

The one contract the isometric client, the exporter and the maps, and the world and character art share
(DECISIONS A49 and A50: isometric everywhere, 2:1 dimetric, Blender X 60°, Z 45°; the projection belongs to the
client and the server stays cartesian on 64 px tiles). It also lands as the module `packages/shared/src/iso.ts`
(subpath `@wdi/shared/iso`) with its test (10.2). The numbers are in `metrics.json` (`camera`, `iso`, `lighting`)
and GDD 3.13; `ISO_TILE_W` and `ISO_TILE_H` are mirrored in `@wdi/shared` the way `TILE_PX` is, pinned by
`z.literal` in `MetricsFile`.

### 10.1 Two frames, and which one each thing is in

| Frame | Axes | Holds |
|---|---|---|
| **World** | x east (grid right), y south (grid down), px, 64 per tile; direction `n` = world -y | Every scene file (tiles, `facing`, footprints), the wire (`Presence.x/y`, `yaw`), the server, every rule, distance and radius, `MoveCmd.dx/dy`, clue `dir`, the nav bitmap |
| **Screen** (iso px) | x right, y down, after the projection; direction `n` = up on the screen | Where sprites are drawn, the atlas `<dir>` of every animation key (`char/<lookId>/<anim>/<dir>`), the camera, the darkness layer, HUD direction words and edge cues |

`dirFromVector` stays the only octant table, unchanged; it works in whichever frame its vector is in. The client
converts world to screen before it picks an atlas direction (10.4). Nothing on the wire or in the data is ever
in the screen frame.

### 10.2 The projection

**Formulas.** World px (wx, wy) to screen px (sx, sy), and back:

```
sx = wx - wy            wx = sy + sx / 2
sy = (wx + wy) / 2      wy = sy - sx / 2
```

**What follows from them:**

- **A tile is a 128 x 64 diamond.** Tile (tx, ty) has its top vertex at ((tx - ty)·64, (tx + ty)·32) and its centre
  at ((tx - ty)·64, (tx + ty + 1)·32).
- **Area is kept.** The determinant is 1: a world tile is 4096 px² and so is its diamond. A camera zoom therefore
  shows as many tiles as it did before.
- **World directions on screen.** A world unit vector goes to:
  - north -> (1, -½), the upper right;
  - east -> (1, ½), the lower right;
  - south -> (-1, ½), the lower left;
  - west -> (-1, -½), the upper left;
  - north-west -> straight up; north-east -> right; south-east -> down; south-west -> left.
- **The camera sits to the south-east.** It sees the south and east faces of everything. The north and west edges of
  a scene are the back of the picture, and the south and east edges are the front.
- **A circle of r tiles is an ellipse** with half-axes rx = √2·64·r and ry = 64·r/√2: twice as wide as it is tall.
- **The bounding box** of a w x h scene's diamond is x from -64·h to 64·w, and y from 0 to 32·(w + h).

**`packages/shared/src/iso.ts`** (pre-seeded; add `"./iso": "./src/iso.ts"` to the package's `exports`):

```ts
// SPRITES 10 and GDD 3.13: the isometric projection, the one copy every package uses. The server never imports it:
// the world, the wire and the rules stay on the square 64 px grid; this only turns world px into screen px and back.
import { TILE_PX } from './constants';
import { type Direction, dirFromVector } from './direction';

/** A tile is a 128 x 64 px diamond on screen (metrics.json `iso.tileW` and `iso.tileH`). */
export const ISO_TILE_W = 128;
export const ISO_TILE_H = 64;

export interface Vec {
  x: number;
  y: number;
}

/** World px (x east, y south) to screen px: sx = x - y, sy = (x + y) / 2. Linear, determinant 1 (area kept). */
export function toScreen(wx: number, wy: number): Vec {
  return { x: wx - wy, y: (wx + wy) / 2 };
}

/** Screen px back to world px: x = sy + sx / 2, y = sy - sx / 2. */
export function toWorld(sx: number, sy: number): Vec {
  return { x: sy + sx / 2, y: sy - sx / 2 };
}

/** Screen y of a world ground point: the depth key of every y-sorted sprite (SPRITES 10.6). */
export function isoDepth(wx: number, wy: number): number {
  return (wx + wy) / 2;
}

/** Screen position of the top vertex of tile (tx, ty). */
export function tileTop(tx: number, ty: number): Vec {
  return toScreen(tx * TILE_PX, ty * TILE_PX);
}

/** Screen position of the centre of tile (tx, ty): the anchor of a one-tile prop or solid piece. */
export function tileCentre(tx: number, ty: number): Vec {
  return toScreen((tx + 0.5) * TILE_PX, (ty + 0.5) * TILE_PX);
}

/** Screen-space bounding box of a w x h tile scene's diamond. */
export function sceneBounds(w: number, h: number): { x: number; y: number; width: number; height: number } {
  return { x: -h * TILE_PX, y: 0, width: (w + h) * TILE_PX, height: ((w + h) * TILE_PX) / 2 };
}

/** Atlas direction (screen frame) of a facing given in the world frame (data, wire, `facing`, clue `dir`). */
export function screenDir(fx: number, fy: number, fallback: Direction = 's'): Direction {
  const s = toScreen(fx, fy);
  return dirFromVector(s.x, s.y, fallback);
}

/** Atlas direction of `Presence.yaw` (radians clockwise from world north, which is -y). */
export function screenDirOfYaw(yaw: number): Direction {
  return screenDir(Math.sin(yaw), -Math.cos(yaw));
}

/** World unit vector of a direction index or name given in the world frame (spawn `facing`, clue `dir`). */
export function worldVectorOf(dir: number): Vec {
  const a = (dir * Math.PI) / 4;
  return { x: Math.sin(a), y: -Math.cos(a) };
}

/**
 * Keyboard (SPRITES 10.8): the key vector in screen axes (W up, D right) turned by -45 degrees into the world, so a
 * single key walks straight along a screen axis and two keys walk along the grid. The server normalises the length.
 */
export function keysToWorld(kx: number, ky: number): Vec {
  const r = Math.SQRT1_2;
  return { x: (kx + ky) * r, y: (ky - kx) * r };
}

/** Touch stick: the exact inverse projection of the thumb's screen offset, at the offset's own length. */
export function stickToWorld(sx: number, sy: number): Vec {
  const len = Math.hypot(sx, sy);
  if (len === 0) return { x: 0, y: 0 };
  const w = toWorld(sx, sy);
  const k = len / Math.hypot(w.x, w.y);
  return { x: w.x * k, y: w.y * k };
}

/** Screen half-axes of a world circle of `rTiles` tiles: an ellipse twice as wide as it is tall. */
export function radiusEllipse(rTiles: number): { rx: number; ry: number } {
  const r = rTiles * TILE_PX;
  return { rx: Math.SQRT2 * r, ry: r / Math.SQRT2 };
}
```

**Its test, `packages/shared/test/iso.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';
import {
  isoDepth,
  keysToWorld,
  radiusEllipse,
  sceneBounds,
  screenDir,
  screenDirOfYaw,
  stickToWorld,
  tileCentre,
  tileTop,
  toScreen,
  toWorld,
} from '../src/iso';

const close = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  expect(a.x).toBeCloseTo(b.x, 9);
  expect(a.y).toBeCloseTo(b.y, 9);
};
const unit = (v: { x: number; y: number }) => {
  const l = Math.hypot(v.x, v.y);
  return { x: v.x / l, y: v.y / l };
};

describe('projection (SPRITES 10.2)', () => {
  it('maps a tile to a 128 x 64 diamond', () => {
    expect(tileTop(0, 0)).toEqual({ x: 0, y: 0 });
    expect(toScreen(64, 0)).toEqual({ x: 64, y: 32 });
    expect(toScreen(64, 64)).toEqual({ x: 0, y: 64 });
    expect(toScreen(0, 64)).toEqual({ x: -64, y: 32 });
    expect(tileCentre(3, 2)).toEqual({ x: 64, y: 192 });
  });
  it('round-trips through the inverse', () => {
    for (const [x, y] of [
      [0, 0],
      [123.5, 77.25],
      [4095, 3071],
      [-10, 33],
    ]) {
      const s = toScreen(x!, y!);
      close(toWorld(s.x, s.y), { x: x!, y: y! });
    }
  });
  it('sorts by the screen y of the ground point', () => {
    expect(isoDepth(64, 128)).toBe(96);
    expect(isoDepth(10, 10)).toBe(toScreen(10, 10).y);
  });
  it('bounds a scene diamond', () => {
    expect(sceneBounds(64, 48)).toEqual({ x: -3072, y: 0, width: 7168, height: 3584 });
  });
  it('draws a radius as an ellipse twice as wide as tall', () => {
    const e = radiusEllipse(7);
    expect(e.rx / e.ry).toBeCloseTo(2, 9);
    expect(e.rx).toBeCloseTo(633.6, 1);
  });
});

describe('directions (SPRITES 10.4)', () => {
  it('turns the eight world facings into eight screen directions', () => {
    const world: Array<[number, number, string]> = [
      [0, -1, 'ne'],
      [1, -1, 'e'],
      [1, 0, 'se'],
      [1, 1, 's'],
      [0, 1, 'sw'],
      [-1, 1, 'w'],
      [-1, 0, 'nw'],
      [-1, -1, 'n'],
    ];
    for (const [x, y, dir] of world) expect(screenDir(x, y), `${x},${y}`).toBe(dir);
  });
  it('reads Presence.yaw in the world frame', () => {
    expect(screenDirOfYaw(0)).toBe('ne');
    expect(screenDirOfYaw(Math.PI / 2)).toBe('se');
    expect(screenDirOfYaw(-Math.PI / 4)).toBe('n');
  });
});

describe('input (SPRITES 10.8)', () => {
  it('walks single keys along the screen axes and two keys along the grid', () => {
    close(unit(keysToWorld(0, -1)), unit({ x: -1, y: -1 }));
    close(unit(keysToWorld(1, 0)), unit({ x: 1, y: -1 }));
    close(unit(keysToWorld(1, -1)), { x: 0, y: -1 });
    close(unit(keysToWorld(-1, 1)), { x: 0, y: 1 });
    close(unit(keysToWorld(1, 1)), { x: 1, y: 0 });
    for (const [kx, ky] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ]) {
      const w = keysToWorld(kx!, ky!);
      close(unit(toScreen(w.x, w.y)), { x: kx!, y: ky! });
    }
  });
  it('walks a stick exactly where the thumb points', () => {
    for (const [sx, sy] of [
      [0.3, -0.8],
      [-1, 0.2],
      [0.7, 0.7],
    ]) {
      const w = stickToWorld(sx!, sy!);
      close(unit(toScreen(w.x, w.y)), unit({ x: sx!, y: sy! }));
      expect(Math.hypot(w.x, w.y)).toBeCloseTo(Math.hypot(sx!, sy!), 9);
    }
    expect(stickToWorld(0, 0)).toEqual({ x: 0, y: 0 });
  });
});
```

### 10.3 The render camera (5K, 5L)

One camera, `IsoCam`, renders every world asset class: ground, walls, trees, buildings, props, characters,
creatures and vertical VFX.

**Camera:**

- Orthographic, rotation **X 60°, Y 0°, Z 45°**, so it looks north-west and down 30°. Screen right is world
  north-east, and screen up is world north-west.
- Built by `tools/blender/build_rig.py` beside the old cameras. `CAMERA_TILT_DEG` becomes 60, and a
  `CAMERA_YAW_DEG = 45` joins it in `rig_common.py`.
- The lights stay parented to the camera, unchanged: key from screen-left at azimuth 225°, the moon fill, no cast
  shadows.

**Scale.**

- Every frame is rendered at the **display scale**, 90.51 px per ground metre: `ortho_scale` = output width in
  px / 90.51, so a 1 m tile is a 128 x 64 diamond. It is finished to **packed size**, half that, by
  `tools/sprites/pixel.ts` (ASSETS 6.11), so packed density is 45.255 px per ground metre and a 64 px packed
  cell spans √2 m, one tile diagonal.
- Packed frames (kit, buildings, props, characters) are drawn at `iso.artScale` 2, and the display-size pages
  below at 1. With the main mode's pixel finish on (`style.json` `pixelFinish.enabled.main`), every world
  texture is drawn with `filter: 'nearest'`, the pixel look, except `clues`, which the decal transform rotates
  and which stays `linear`. With it off, every world texture is `linear`.
- **Heights are rendered at 0.75 of true scale** (`iso.zScale`). Environment assets sit under a root empty
  scaled (1, 1, 0.75). Characters and creatures sit under one scaled 0.75 on every axis, so they keep their
  proportions.
- Displayed results: 59 px per vertical metre; a 1.7 m villager is about 100 px; nothing standing is taller than
  112 px (`maxStandingSilhouettePx`).

**Character cells** render at 128 display px with the feet at row 112, and are finished to 64 px packed (feet at
56), drawn at 128. `die` renders in 256 px cells (128 packed) with the feet at the centre. The per-frame `Feet`
pivot of SPRITES 4 is unchanged: it is written at the display scale and halved with the frame.

**Turntable.** Atlas direction i (screen frame, 0 = `n`) sets `TT.rotation_euler.z = 45° - i·45°`. A character
facing Blender +Y (world north) therefore renders as `ne`, and one turned +45° renders as `n` (screen up). The
frame regex, clips and passes of SPRITES 2-3 are unchanged.

**Ground tiles** are a 1 x 1 m textured plane rendered by `IsoCam` at the display scale, finished to a 64 x 32
art diamond and doubled with nearest scaling into the 128 x 64 cells of the ground tileset (10.12; with the finish
off, the display-scale render is shipped). The tile layer stays at 128 x 64, which keeps Tiled object coordinates
equal to world px.

**Ground decals keep the straight-down `TileCam`:** footprints, smear, print, fur, claw, drag, blood pool. They
keep their 64 px cells and are drawn through the decal transform of 10.5, so the clue art does not change.
Small vertical objects rendered by the old `SpriteCam` (thread, felt, wet bucket, blood splat, dust step) are
re-rendered by `IsoCam` under the same keys.

**Pixel finish.** Every frame is rendered at the display scale and finished at packed size by
`tools/sprites/pixel.ts` (ASSETS 6.11). With the finish on, alpha is 0 or 255, every pixel is a world-palette
colour, and a 2 x 2 mode downscale keeps one-pixel lines; alpha bleed is harmless and no longer needed under
nearest filtering. With it off, a 2 x 2 box downscale keeps partial alpha and the frames are alpha-bled
(`bleed.ts`) for linear filtering. Either way, frames are packed with trim and padding 2, and cells, pivots and
packed sizes are the same. The ground tileset, `clues` and `vfx` are drawn at display size: finished, then
doubled with nearest scaling (or, with the finish off, shipped at the display scale).

### 10.4 Directions

- **Data and wire directions are world frame.** That covers spawn `facing`, `Presence.yaw` (radians clockwise from
  world north), clue `dir` and `MoveCmd`.
- **Atlas `<dir>` is screen frame.** To pick an animation, the client calls `screenDirOfYaw(yaw)`, or
  `screenDir(fx, fy)` for a facing vector. The eight world facings map to eight different screen directions:

| World facing | n | ne | e | se | s | sw | w | nw |
|---|---|---|---|---|---|---|---|---|
| Atlas `<dir>` | `ne` | `e` | `se` | `s` | `sw` | `w` | `nw` | `n` |

- **HUD words and arrows are screen frame.** "A scream from the north" means up on the screen:
  `dirFromVector(screen dx, dy)`.
- **Clue `dir`.** A footprint trail lies along world direction `dir`. It is drawn with the decal transform at
  rotation `dir·45°`; the art points world-north at 0.

### 10.5 Anchors and pivots

| Thing | Placed at (screen) | Frame pivot |
|---|---|---|
| Character, creature, body | `toScreen(feet)` | the per-frame `Feet` pivot (SPRITES 4) |
| One-tile prop, spot, portal frame, kit piece | `tileCentre(tx, ty)` | the ground point under the tile centre |
| Building | `toScreen` of the footprint's centre, ((x + w/2)·64, (y + h/2)·64) | that same ground point in the untrimmed building canvas; every slice keeps the canvas through `spriteSourceSize` |
| Multi-tile prop (`footprint`) | the same rule as a building, over its footprint | the same |
| Ground decal (clue, smear, blood pool) | `toScreen` of its world point | the centre. A container scaled (1, 0.5) holds the sprite, which is rotated π/4 + θ and scaled √2. θ is the decal's world rotation. This is the projection itself (rotate 45°, scale √2, squash y by half) |
| Nameplate | 8 px above the character frame's top, as a child of the character | – |
| Drop shadow | under every y-sorted sprite: a 2:1 ellipse, 40 x 20 px displayed, ink at 0.4 | – |

**Slices.** A building or multi-tile prop is one frame per footprint tile, named `<key>#<dx>_<dy>`, where (dx, dy)
is the tile's offset from the footprint's north-west tile. `tools/sprites` cuts the slices with a Shader AOV pass
that writes each surface point's world tile, so a slice holds exactly the pixels whose front-most surface stands
above its tile. Overhangs (eaves, canopies) belong to the tile they stand above. A building keeps eaves within
0.25 tile of its footprint on the south and east faces.

### 10.6 Depth

Every y-sorted object has **depth = `isoDepth(anchor)` + bias**: the screen y of its ground anchor, which is its
feet or its tile's centre. A slice uses the centre of its own tile.

| Bias | Objects |
|---|---|
| 0 | kit pieces, slices, props |
| +0.1 | overlay props on a covered tile (the plates on the Wake Table, the crepe on the manor door) |
| +0.25 | items and nodes lying on the floor, and bodies |
| +0.5 | characters and creatures |

This is correct for any object no bigger than one tile when the moving things keep the 0.25-tile clearance of
their collision box. That is why everything bigger than a tile is sliced.

**Depth bands** (client constants in `view/iso.ts`):

| Band | Depth |
|---|---|
| void (camera background) | – |
| ground layer | -30 |
| `blend_1` | -29 |
| `blend_2` | -28 |
| ground decals and door pulses | -20 |
| the y-sorted world | 0 to 10 000 |
| darkness layer | 900 000 (screen space) |
| light glows | 900 001 (additive) |
| world-space marks above the dark (collect ring, noise ring) | 950 000 |

Nameplates stay with their character, under the darkness.

### 10.7 Occlusion: shells, heights, deep cull, fade

**Shells.** The exporter tags every solid tile:

- **Front shell:** every tile between it and the scene's south edge (same x), or between it and the east edge (same
  y), is solid.
- **Back shell:** the same toward the north or west edge.
- The front shell wins when a tile is both.

**Heights.**

| Where | Full | Half | Stub |
|---|---|---|---|
| Exterior | everything else | – | front shell |
| Interior (houses and caves) | back shell | every other solid | front shell |

- `full`, `half` and `stub` are `iso.wallHeightM` 2.5, 1.2 and 0.3 m for walls. Cliffs have full, half and a 0.4 m
  ledge. Trees have full and a stump.
- Boulders, fences and stacks have one height and use it everywhere. They are occluders by the tall-prop rule below, not by their height name (DECISIONS A60).
- A covered tile (`P`) draws nothing of its own.
- This is the cutaway rule of GDD 3.13: back walls stand, front walls are sills, inner walls are half height.

**Deep cull.** A solid tile more than `iso.deepCullTiles` (2) tiles away from every walkable tile (Chebyshev)
draws nothing at all, ground included. The void shows there in the scene's void colour: `slate` for exteriors,
`ink` for interiors and caves (the camera background).

**Occluders** are walls, trees and cliffs at full or half height, building slices, and props (multi-tile prop slices included)
whose frame rises more than 96 px (displayed) above its pivot, which the client reads from the loaded frame. Boulders, fences and
stacks are props of that rule. A greybox block is an occluder when it is taller than 96 px.

**Fade.** When an occluder is drawn in front of **your own character** (its depth is greater) and its bounds
overlap your character's frame, it tweens to `lighting.occluderFadeAlpha` (0.35) over `occluderFadeS` (0.15 s).
It tweens back when it no longer overlaps. Only occluders anchored within 4 tiles south or east of you are
tested. Other characters never cause a fade (GDD 3.13).

### 10.8 Input

The key vector stays screen-axis (`keyVector`: W up, D right). It is turned into the world by **`keysToWorld`**,
a -45° rotation:

- each single key walks straight along a screen axis: W is world north-west, D is world north-east;
- two keys walk along the grid: W+D is world north.

A touch stick's offset goes through **`stickToWorld`**, the exact inverse projection: the character walks where the
thumb points on the screen.

Keys and stick are converted separately and then summed. The server normalises the vector (`Movement.ts`), so
speed in tiles per second is unchanged. Mock feeds and bots already send world vectors and need nothing.

### 10.9 Camera

**Zoom** = clamp(floor(height / (`iso.viewTilesHigh`·64) / `iso.zoomStep`)·`zoomStep`, 0.5, 2). The zoom
snaps down to a multiple of 0.5, so an art pixel is always a whole number of screen pixels:

| Window height | Zoom |
|---|---|
| 720 | 1 |
| 844 (portrait phone) | 1 |
| 1080 | 1.5 |
| 1440 | 2 |
| 390 (landscape phone) | 0.5 |

The view covers about the same number of tiles as before, because the projection keeps area.

**Rendering and follow.** `roundPixels` is on, and the camera follows your container at lerp 0.1, as today.

**Bounds** are `sceneBounds(w, h)` grown by `iso.topPadPx` (320) above and one tile on the other sides. A scene
smaller than the view is centred with equal padding, as today.

### 10.10 The vision ellipse

Your light is centred on your feet (screen), with radius `radiusEllipse(r)·zoom`:

- r = `balance.vision` lerped from `dayTiles` to `nightTiles` by `Lighting.darkness` (dusk and dawn ease);
- r = `nightTiles` in a dark scene, whatever the phase.

The vision ellipse is the only light the server could ever check (M5b). In M5a it is a picture.

### 10.11 The lighting layer

The darkness layer replaces the DOM `.wdi-night-mask` (GDD 3.13, WORLD 4.7).

1. **Light texture.** At boot the client generates `gen_light`: a 256 x 256 canvas with a radial alpha gradient,
   opaque white out to `lighting.lightCore` (0.55) of the radius, then linear to 0 at the edge. It is not art, and
   it is in no manifest.
2. **The darkness texture.** One `DynamicTexture` the size of the game canvas is drawn by an `Image` at
   `setScrollFactor(0)`, depth 900 000, centred on the canvas and scaled by 1 / zoom (the camera zooms a scroll-factor-0
   object too, so this draws it 1:1). It is redrawn on the camera's `FOLLOW_UPDATE`, or on `PRE_RENDER` while it
   is not following, so it never trails the camera by a frame. Each redraw:
   1. `clear()`, then `fill(ambient colour, ambient alpha)`. Outside dark scenes the ambient is
      `lighting.ambient.day` lerped to `night` by darkness. In a dark scene it is `lighting.ambient.dark` in every
      phase.
   2. `stamp('gen_light', ...)` with `blendMode: ERASE` for each pool. A pool of r tiles at world point p sits at
      `(toScreen(p) - camera.worldView)·zoom`, scaled to 2·rx by 2·ry of `radiusEllipse(r)·zoom`.
   3. `render()`.

   The pools are your vision, and every scene light whose `phases` holds the current part of the day. The default
   is always: `day` is grace, day and immunity; `dusk` is dusk and dawn; `night` is night and the Final Night.
   `torch` and `fire` radii wobble by `flicker.amp` at `flicker.hz`, with a phase offset from the light id's hash.
3. **Glow.** For each lit scene light, one world-space `Image` of `gen_light` with `blendMode: ADD`, tinted with the
   light's colour (default by kind, 10.12) at alpha `glowAlpha`·darkness, depth 900 001. There is no glow on your
   vision.
4. **Carried light.** In M5a it is your own vision only, drawn for you alone. No other character carries a visible
   light (GDD 3.13). The API keeps a slot, `Lighting.setCarried(avatarHandle, rTiles | null)`, which nothing calls
   in M5a.
5. **Hidden.** The layer hides outside world phases and while the World sleeps for a meeting, as today.
6. **Test hook.** A 1 x 1 px DOM element `data-testid="night-mask"` with `data-darkness="<0..1>"` (1.00 in a dark scene) stays visible
   while the layer draws. `world.spec`'s `toBeVisible()` keeps working, and specs can read the level.

### 10.12 The tilemap the exporter writes (5J writes it, 5I reads it)

`tools/grid/export.ts` writes, for every scene:

- `<id>.nav.json`, unchanged: version 1, `tile: 64`.
- `apps/client/public/assets/scenes/<id>/tilemap.json`, a Tiled 1.10 isometric map:

```
orientation: "isometric", renderorder: "right-down", width: w, height: h, tilewidth: 128, tileheight: 64
properties: sceneId, kind, biome, dark (bool), map, theme, void ("slate" | "ink")
tilesets:   [{ firstgid: 1, name: "iso_ground_<theme>", image: "iso_ground_<theme>.png",
               imagewidth: 1280, imageheight: 1792, tilewidth: 128, tileheight: 64, columns: 10, tilecount: 280 }]
layers:     ground, blend_1, blend_2                          (tile layers; gid 0 = nothing)
            solids, buildings, props, portals, spawns, interact, gates, lights   (object groups, visible: false)
```

**The ground tileset.** Ten columns of 128 x 64 cells. Ground material m, its index in `GROUND_ROWS`
(`glmpdcfwrs~u=O`), owns rows 2m and 2m + 1, which is 20 cells:

- cells 0-3: base variants;
- cell 3 + k, for k from 1 to 15: the edge overlay with side mask k (world frame: north 1, east 2, south 4, west
  8). The north side is the diamond's upper-right edge.

So **gid = 1 + 20·m + c**.

**Ground.** Each tile's base cell is its material's variant (x·7 + y·13) mod 4.

- **Rails.** A `=` tile takes its base variant from its rail neighbours' axis, so the track runs on: 0-1 when a
  west or east neighbour is `=` (rails along world x), else 2-3 when a north or south neighbour is (along world
  y), picking within the pair by (x·7 + y·13) mod 2. A `=` tile with no rail neighbour takes 0.
- A walkable tile takes its own material.
- A solid tile takes the material of its first walkable neighbour, in the order south, east, north, west, or else
  its biome's default floor. `O` is drawn here: it is flat.
- A deep-culled tile is 0.

**Blends.** For each tile, the exporter collects the materials of its four neighbours that rank above its own in
`BLEND_RANK` (`O~r=wfcdpslmgu`, lowest first). For the highest such material and the next one, it ORs the side
bits where each lies into a mask, and writes that material's mask cell to `blend_1` and `blend_2` in that order. A
third material on one tile is dropped.

**Objects.** All object coordinates are in world px, x = tx·64 and y = ty·64. In a Tiled isometric map with 64 px
tile height that is also Tiled's own object space.

| Group | One object per | Name and type | Properties |
|---|---|---|---|
| `solids` | drawn solid tile (not `P`, not deep-culled) | name `x,y`, type = its kit frame (`wall/half/2`, `tree/full/1`) | `occluder` (bool) |
| `buildings` | building | name = id, type `building`; x, y, width and height = the footprint | `art` |
| `props` | prop | name = id, type = kind | `footprint` (as `x,y,w,h` in tiles) when present |
| `portals` | portal | name = id, type = kind | `minProfile`, `face` (s, e or sill), `inBuilding` (bool) |
| `spawns` | spawn | as today | as today |
| `interact` | spot | type = kind | `variant` |
| `gates` | gate | as today | as today |
| `lights` | light | name = id, type = kind | `radiusTiles`, `color` (the token, default by kind), `phases` (comma list, empty = always) |

**Kit frame choice.**

- Material name (`W` wall, `T` tree, `R` boulder, `X` cliff, `F` fence, `K` stack), then the height of 10.7, then
  the variant (x·7 + y·13) mod 4.
- A height without a frame falls back to `full`.
- A tile under a closed profile gate draws `fence/full/<v>`, decided by the client from the party's profile.

**A portal's face** is the direction from the portal to its first walkable neighbour, in the order south, east,
north, west. `s` and `e` draw the full frame `portal_<kind>_<face>`. `n` and `w` mean the opening is in a front
wall or front shell, so the face is `sill` and the frame is `portal_<kind>_sill`. `hatch` and `drop` always use
`portal_hatch` and `portal_drop`. A portal inside a building footprint draws no frame (the building art has the
door) but still takes the boarded overlay `portal_boarded_<face>` when closed.

**The client.**

- It creates the three tile layers with `map.createLayer(name, tileset, -64, 0)`, an offset of
  -`ISO_TILE_W`/2: Phaser places an isometric tile's image at its left edge, and the projection puts the top vertex
  at x.
- It builds every object group from the tilemap alone, so `PropView` stops importing scene JSON. Every scene's isometric file carries its `props` group, so the old overworld stand-ins (`propObjects`) went at the round-5 integration; the closed-profile gate fence is not drawn yet (DECISIONS A60).
- Phaser 4's GPU tile layer is orthographic-only, so the standard tile layer stays (RESEARCH.md).

**Exporter checks.**

- `--check` stays.
- The tile-size check splits: nav tile 64, ground tileset cells 128 x 64.
- The exporter fails a scene with more than **1 200 static world sprites** (solids, slices, props and spots).
  The largest outline, the Fenwood, draws about 600 solids.

**Exporter notes (5J, round 5).**

- The exporter reads the validated scenes and maps from `@wdi/content` (scene order of `SCENE_IDS`), so a scene
  that fails the validator never exports. The map and its theme come from `mapOf(sceneId)`.
- **Shells, as built.** A tile is in the front shell when no walkable tile lies at or past both its x and its y (the
  quadrant south-east of it). It is in the back shell when none lies at or before both (north-west). Read
  literally, "every tile toward the east edge is solid" makes a whole north wall row a front shell, because the
  wall itself runs east to the edge. The quadrant reading gives the same heights for every straight wall and keeps
  the north-west corner full (DECISIONS A61).
- Trees draw `full` or `stub` (the stump); a tree that would be `half` draws `full`. Boulders, fences and stacks
  always draw `full`.
- `occluder` is true for walls, trees and cliffs at `full` or `half`. Boulders, fences and stacks never occlude.
- `void` is `slate` for an exterior that is not a cave, otherwise `ink`.
- A solid tile whose material is a floor letter (the ground under a door or a spot) or `O` draws that material
  on the ground layer. Other solid tiles take the material of their first walkable neighbour, as above.
- Lights carry `radiusTiles` as a float property, and `phases` as an empty string when the light always burns.

### 10.13 Manifest keys

| Key | Type | Content | Loaded |
|---|---|---|---|
| `iso_ground_<theme>` | `image`, `nearest` | the ground tileset of 10.12 (`harbour` for Hollowmere, `timber` for Blackpine) | with its map |
| `iso_kit_<theme>` | `multiatlas`, `nearest` | frames `<wall\|tree\|boulder\|cliff\|fence\|stack>/<full\|half\|stub>/<0-3>`, packed half size, pivot at the tile centre's ground point | with its map |
| `bld_<mapId>` | `multiatlas`, `nearest` | building slices `<art>#<dx>_<dy>` (10.5), half size | with its map |
| `props` | `multiatlas`, `nearest` | shared props `prop_<kind>[_<state>]` (`prop_lanternPost_lit`/`_unlit`, lit in the `dusk` and `night` parts of the day); multi-tile slices `prop_<kind>#<dx>_<dy>`; spots `spot_<variant>`; portal frames `portal_<kind>_<s\|e\|sill>`, `portal_hatch`, `portal_drop`, `portal_boarded_<s\|e\|sill>` | at boot |
| `props_<mapId>` | `multiatlas`, `nearest` | the map's own props, in the same grammar; looked up before `props` | with its map |
| `char_<lookId>`, `ovl_<lookId>`, `anims_<lookId>` | as the looks catalogue (5L) | characters in 64 px packed cells, atlas `<dir>` in the screen frame | at boot |
| `char_villager`, `ovl_villager`, `anims_villager` | as the looks | the plain base body | only with `?art=placeholder` in round 5: every seat has a look, and no figure that is not a seat exists until round 6's mobs |
| `clues` | `multiatlas`, `linear` | decals finished at display size and drawn through the decal transform (10.5), which rotates them | at boot |
| `vfx`, `anims_vfx` | `multiatlas`, `nearest`; animation | effects finished at display size; `SpriteCam` frames re-rendered by `IsoCam` | at boot |
| `thumb_<mapId>` | `image` | 480 x 270 lobby thumbnail of the hub | at boot |
| audio `amb_<biome>` | audio manifest | optional loop per biome (`village`, `house`, `forest`, `cave`); when missing, `ambient` plays | at boot |

**Rules for keys and loading:**

- **Map entries.** A manifest entry may carry **`maps: string[]`**. The World's `preload` queues every entry whose
  `maps` holds the match's `Settings.map` and that is not loaded yet.
- **Mode entries.** The `modes` field left with the quick mode (round 7, A115); no entry carries it.
- **Boot.** An entry without `maps` loads at boot.
- **Both manifests** (real and `?art=placeholder`) carry the same keys and the same `maps`, the
  villager aside (in the placeholder manifest only, once 5L's L4 lands); `manifest.test.ts` checks both.
- **Filters.** The `nearest` of this table holds while `style.json` `pixelFinish.enabled.main` is true; with it off,
  every main-mode world texture is `linear` (10.3). `clues` is always `linear`.
- **Prop lookup.** The order is `props_<mapId>`, then `props`; within each, `prop_<kind>[_<state>]`, then
  `prop_<id tail>`. A missing frame draws a labelled greybox for interactable kinds (bell, pump, notice board, kit
  chest, basin, task source, lantern post, oven) and nothing for `decor` and `teachingClue`.
- **Spots.** A missing `spot_<variant>` draws a greybox block. A missing kit frame draws the greybox slate block of
  today.
- **Building stand-ins.** The old `bld_<id>_ext` stand-ins leave both manifests when `bld_hollowmere` lands.

### 10.14 Budgets

Page-equivalents are of 2048². These are the art plan's numbers (`docs/round5/art-plan.md` 1.4).

| Item | Limit |
|---|---|
| Environment per map | ≤ 1.8: ground 1280 x 1792 (0.55), kit ≤ 1024² (0.25), buildings ≤ 2048 x 1024 (0.5), map props ≤ 1024² (0.25), shared props ≤ 1024² (0.25) |
| Boot effects | `clues` ≤ 512² (0.06), `vfx` ≤ 512 x 2048 (0.25) |
| Characters (the deck's 10 world looks, A50) | ≤ 3.75: each look's `char_<lookId>` ≤ 1024² and `ovl_<lookId>` ≤ 1024 x 512 (0.375). About 3 expected, since most looks pack onto a 1024 x 512 body page |
| Resident pages | ≤ 6 (ASSETS 6.8). The worst case, one map's environment, the boot effects and the 10 largest looks, is 5.86 |
| Static world sprites per scene | ≤ 1 200; the World hides those outside the view grown by 2 tiles, re-checked when the camera moves more than a tile |

`char_villager` and `ovl_villager` load only with `?art=placeholder` in round 5 (10.13), so they count in no
budget. `tools/sprites/test/budget.test.ts` asserts each cap and, for each map, the resident sum.

### 10.15 Tests each session adds

| Session | Tests |
|---|---|
| Pre-seed | `packages/shared/test/iso.test.ts` (above) |
| 5J, exporter | a fixture scene exports `orientation: isometric` with 128 x 64 tiles and an unchanged nav; front and back shells and the three heights on a small interior; deep cull leaves gid 0 and no solid object; blend masks and the two-layer cap; portal faces (`s`, `e`, `sill`); `P` tiles draw no solid; `--check` fails on a stale tilemap |
| 5I, client | `keysToWorld` and `stickToWorld` wiring (`vectors.test.ts`); depth ordering of a character against the slices of a building it walks round; the decal transform; zoom snapping; `screenDirOfYaw` in `PlayerView`; the darkness ambient for day, night and a dark scene; lights filtered by phase |
| 5I, `world.spec` | rewritten for the new keys (the tavern door is now on the south face); the night mask case reads `data-darkness` |

### 10.16 Lines elsewhere that change with this section

**ASSETS 6.2 and 6.3.** The camera bullet, the turntable, lights, toon and output bullets, and the Characters
sentence say the render facts of 10.3 in their own words; this section adds none of its own for them.

**ASSETS 6.3, Buildings and environment**: add "Buildings and multi-tile props are cut into one slice per footprint
tile (SPRITES 10.5); ground sets are isometric diamonds (SPRITES 10.12)".

**ASSETS 6.8**: "Per scene <= 2 environment pages of 2048²" becomes "Per map <= 1.8 environment page-equivalents of
2048², loaded with the map (SPRITES 10.13, 10.14)". "150 props" becomes "1 200 static world sprites".

**SPRITES 1:**

- "Character cells are 128 x 128 px, rendered directly" becomes "128 px displayed cells, packed at 64 px (SPRITES
  10.3)".
- "A standing 1.7 m villager is about 90 px tall" becomes "about 100 px".
- The direction table's caption becomes "clockwise from screen up; the atlas `<dir>` is screen frame, data and wire
  directions are world frame (10.4)". The turntable column becomes 45°, 0°, -45° ... -270°.

**SPRITES 5:** add the optional `maps` and `modes` fields to manifest entries (10.13), and "`nearest` for every
world texture except `clues` (linear)", while the main mode's pixel finish is on (10.3).

**SPRITES 8:**

- Props are "rendered by `IsoCam`" instead of "the tilted `SpriteCam`". The ground tilesets become
  `iso_ground_<theme>`.
- The building table's `bld_<id>_ext` keys become slices of `bld_<mapId>`. The 40° notes ("depth stretched by
  1 / cos 40°") are retired.

**WORLD 4.2** carries the metrics of this section. ARCHITECTURE gets no change from this section: the server stays
on the square grid.

## 11. ONUB images (removed)

The quick mode's images, cards, portraits and `onub_mini` atlas left the client with the mode in round 7 (DECISIONS A115), with `tools/sprites/onub*.ts`, `placeholder-onub.ts` and `batches/5M.json`. The owner's 13 pictures stay in `assets/source/concepts/onub/`. The section keeps its number.

## 12. M5b art (Session 6M, round 6)

The sprites M5b draws (`docs/round6/m5b-data.md` 4), with 6E's ids (`resources.json`, `recipes.json`; content
PR #49). Everything is drawn in code on the `palette.json` world ramps at display scale (route R5,
`tools/sprites/m5b-draw.ts`) and finished like a rig render for each style of `artStyles()`: snapped and
mode-halved for 8-bit, box-halved and alpha-bled for low poly. One command writes both styles' atlases under
`assets/<root>m5b/` and the M5b block of each manifest; `pnpm --filter @wdi/sprites placeholder` writes the
greybox twins (`placeholder-m5b.ts`, `order` 80):

```
pnpm --filter @wdi/sprites m5b
```

| Key | Type | Frames | Packed cell, pivot | Loaded |
|---|---|---|---|---|
| `nodes` | multiatlas, one page ≤ 512² | `node_<snake id>/ready`, `node_<snake id>/spent` for each resource (`timber`, `stone`, `tin_ore`, `resin`, `herb`, `mushroom`); the stem is the row's `sprite` | 64 x 64, (32, 48): the ground point under the tile centre | boot |
| `tools` | multiatlas, one page ≤ 512² | `held_<itemId>/<dir>` for `torch`, `snare`, `spade`, `lockpicks`, `lantern`, `crowbar` (8 screen-frame directions); `glow_lantern/<0-3>`, `glow_torch/<0-3>` | held: 64 x 64, (32, 56), the characters' feet; glow: 32 x 32, centred | boot |
| `anims_tools` | animation | `glow_lantern`, `glow_torch`: 4 frames at 8 fps, looping | | boot |
| `mobs` | multiatlas, one page ≤ 1024² | `mob_<id>/<anim>/<dir>/<nnn>` for `wolf`, `boar`, `bat`, `rat` (the stem is the row's `sprite`), `idle` 4 frames, `walk` 6, `attack` 4, 8 screen-frame directions | 64 x 64, (32, 56), the characters' feet; the bat hovers over a ground shadow at the feet | boot |
| `anims_mobs` | animation | `mob_<id>/<anim>/<dir>`: idle 6 fps and walk 10 fps looping, attack 10 fps once | | boot |
| `givers` | multiatlas, one page ≤ 512 x 1024 | `giver_<npcId>/idle/<dir>/<nnn>` for `harbourmaster`, `moll`, `foreman`, `smith`, `collier` (`quests.json` npcs), 4 frames, 8 screen-frame directions | 64 x 64, (32, 56), the characters' feet | boot |
| `anims_givers` | animation | `giver_<npcId>/idle/<dir>`: 6 fps, looping | | boot |

The filter is `nearest` in the 8-bit manifest and the placeholder, `linear` in the low-poly one. The nodes
and tools add under 0.07 page-equivalents to the boot set in either style; the mobs add 0.125 (8-bit, 512 x 1024)
or 0.25 (low poly, 1024²) and the givers 0.125 in either style, inside the 6-page limit (10.14).

**Held overlays.** A held frame shares the character cell and feet pivot, and draws the tool's grip where
the right hand sits in a look's idle frame 000 (`HAND` in `m5b.ts`), so the client places it at the feet with
the body's draw scale, as one more layer. It goes under the body for `n`, `ne` and `nw` (the hand is on the
far side) and over it otherwise. A glow on a held lantern or torch sits at the feet plus that hand offset.
Only the lantern has a public signal (`StatusBit.lantern`); what else a client draws in another seat's hand is
the wire's decision, never the art's (role secrecy, CLAUDE.md).

**Glows** are additive halos in the dim end of the lantern and brick ramps: banded in 8-bit, one radial
gradient in low poly. The client plays `glow_lantern` or `glow_torch` over the light, in the `ADD` blend mode.

**Icons.** The tools' inventory icons are hand-written SVG under `assets/ui/icons/` on the rules of section 9:
`icon_item_torch`, `icon_item_snare`, `icon_item_spade`, `icon_item_lockpicks`, `icon_item_lantern`,
`icon_item_crowbar`.

**Mobs** are small rigs of spheres, capsules and wing polygons in a mob-local frame (`tools/sprites/m5b-mobs.ts`),
posed per animation and projected onto the iso ground for each direction, back to front, under one ink
silhouette. The client turns a `MobSnap`'s world-frame yaw into the atlas direction with `dirFromVector`, as for an
avatar, and plays `mob_<kind>/<walk|idle|attack>/<dir>`.

**Givers** are standing figures on the same rigs (`tools/sprites/m5b-givers.ts`), on the villager's proportions,
each dressed for its trade: the harbourmaster's navy coat, peaked cap and beard; Moll's shawl, headscarf and herb
basket; the foreman's waistcoat, flat cap and ledger; the smith's apron and hammer; the collier's lamp helmet and
pick. Every npc wears the `villager` body in `quests.json`, which has no real art (`char_villager` is
placeholder-only, SPRITES 10.13), so a giver has its own key rather than reusing `char_<lookId>`; none borrows a
deck look, so a giver is never mistaken for a seat. A giver is a scene static, never a seat: the client turns
`scene.givers[].facing` (world frame) into the atlas direction with `dirFromVector` and loops
`giver_<npc>/idle/<dir>`.

**Tests.** `tools/sprites/test/m5b.test.ts`: every resource row has its node and every recipe its held tool;
each style's and the placeholder's atlases carry exactly these frames, on one page within 512², with the same
cells and pivots; every manifest lists the keys at boot; the glow loops; and the shipped files equal what the
build writes today. `manifest.test.ts`, `styles.test.ts`, `budget.test.ts`, `palette.test.ts` and
`icons.test.ts` cover the rest as they stand.
