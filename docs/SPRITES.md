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
| body | `char/<body>/<anim>/<dir>` | `char_<body>` | <= 2 |
| blood (torso and hands mask, shown while Bloody) | `blood/<body>/<anim>/<dir>` | `ovl_<body>` | 1 shared |
| scarf (grey, toon-ramped, tinted at runtime) | `scarf/<body>/<anim>/<dir>` | `ovl_<body>` | |
| hat (one of the two, none when bare) | `hat_cap/<body>/<anim>/<dir>`, `hat_bowler/<body>/<anim>/<dir>` | `ovl_<body>` | |

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

## 4. Feet pivot manifest

The rig projects the `Feet` empty into camera space on every rendered frame and writes one
`manifest.json` per body next to the pass folders:

```json
{
  "version": 1,
  "body": "villager",
  "cell": 128,
  "fps": 12,
  "passes": ["body", "scarf", "hat_cap", "hat_bowler", "blood"],
  "frames": {
    "char_villager_walk_se_003": { "feet": [64.0, 112.5] }
  }
}
```

`feet` is in cell pixels from the top-left corner of the untrimmed cell; a frame rendered in a
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
manifest re-skins keys of the 8-bit manifest only: same type, frame names, cells, pivots, `maps` and
`modes`, and the style's `filter` on every filtered texture (`tools/sprites/test/styles.test.ts`). The client
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
10.3), and `linear` for every main-mode world texture while it is off. Two optional fields say when an
entry loads (10.13): `maps` (`string[]`, map ids) loads it with the match's map, and `modes`
(`('main' | 'onub')[]`) at match start when the match's mode is listed, whatever the client's card; an
entry with neither loads at boot; `origin` (optional, `[x, y]` normalised) is
the display origin for single images: building exteriors use `[0.5, 1]`, the middle of the front wall's
base. Atlas pages are always named `<key>-<n>.png`. Clue frames are centred (no pivot). Anim files use Phaser's own
`{anims: [{key, frames: [{key, frame}], frameRate, repeat}]}` format for `load.animation`.

**Loading notes (M3).** The `World` scene never names a path: bodies use the last frame of `char/villager/die/s` (and its `scarf` and `hat_*` twins) from `char_villager` and `ovl_villager`; clues use frames of the `clues` atlas (`clue_footprint_<s|m|t>_mid`, `clue_thread_<red|green|blue>`); the overworld props use `prop_<kind>` frames of a `props` atlas (`prop_bell`, `prop_pump`, `prop_noticeBoard`, `prop_kitChest`, `prop_lanternPost`; the id suffix, e.g. `prop_board`, is tried second). Any key the manifest lacks draws a labelled greybox mark (`textures.exists`), so the game plays before the art lands. Sound is separate: `assets/audio/manifest.json` (`{key, url, gain}`) is fetched once by `AudioBus` and a missing file leaves the game silent.

**Loading notes (M3b, quick mode).** The bakery draws its props from the same `props` atlas by `prop_<kind>` then `prop_<id tail>` (`prop_plate`, `prop_deadLoaf`, `prop_ledger`, `prop_wakeTable`, `prop_oven`, `prop_basin`, `prop_flour_sacks`); a plate appears only for a seat the server lists and wears the owner's name over its frame, and a prop whose key is missing draws a labelled greybox (the wake table draws nothing without its art, since the plates stand on it). The loft is DOM, not a Phaser scene: `loft_backdrop`, `prop_bedroll` and `prop_bedroll_self` are `type: image` entries whose `url` the loft reads through `manifestImageUrls` (`view/assets.ts`) and sets as CSS backgrounds (the backdrop `cover`, a bedroll `contain` in a 56 x 92 px box); a missing entry keeps the theme's CSS bedroll. Loop beds such as the loft's `storm` come from `AudioBus.playLoop`.

## 6. Overlay passes

`batch_render.py` renders each pass through the same camera and turntable with a material override,
so every pass has the same frame list and pivots:

| Pass | What is visible | Material |
|---|---|---|
| `body` | full character, no scarf, no hat | toon palette materials |
| `scarf` | scarf only, held out by the body | `bone` toon ramp, tinted at runtime |
| `hat_cap` | cap only | toon `slate` |
| `hat_bowler` | bowler only | toon `ink` with a `fog` band |
| `blood` | torso and hands mask | flat `blood` |

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

Real clue art (M3, `tools/blender/build_props.py`) keeps these 21 keys in the same `clues` texture, one
64 px cell per key at the world scale of 64 px per metre. Ground marks (footprints, smear, print, fur,
claw, drag) are rendered by the straight-down `TileCam`, like the ground tiles; the wet bucket, the
thread and the felt are small objects rendered by `IsoCam` (10.3). Frames stay centred (no
pivot). Footprints and the drag segment point screen-up (`n`): rotate the sprite by `Clue.dir`; the
drag segment fills the cell top to bottom so segments chain along a trail. A footprint frame is one
left-right pair; the client lays the 5-tile trail (GDD 3.4) from several of them.

**Building exteriors.** From round 5 a building is drawn from its slices `<art>#<dx>_<dy>` in
`bld_<mapId>` (10.5, 10.13); the `bld_<id>_ext` keys below are the stand-ins (single images, rendered
with the roof, tilted camera) and leave both manifests when `bld_hollowmere` lands. One per
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
as an unlabelled greybox block on the same cell and pivot). One frame per key, rendered by
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

**Loft images** (`type: image`, `loft/`; M3b). The quick mode's dark loft is DOM, not a Phaser scene, so
its art is plain images the client sets as CSS backgrounds; rendered by `tools/blender/build_loft.py` and
finished by `tools/sprites/images.ts`.

| Key | Size | Use |
|---|---|---|
| `loft_backdrop` | 1280 x 720, opaque | Behind the whole loft view: the bakery loft at night, storm light at the gable window, lantern glow at the hatch; the middle is kept dark for the grid and the copy (`background-size: cover`) |
| `prop_bedroll` | 112 x 184 | One seat's bedroll in the `.wdi-bedrolls` grid, at twice the 56 x 92 px blanket of `mockups/loft.html`; always occupied |
| `prop_bedroll_self` | 112 x 184 | The viewer's own bedroll: the same with moon blanket stripes |

**VFX** (texture `vfx`, `vfx/vfx.json`; anims `anims_vfx`, `vfx/vfx.anims.json`; M3; the placeholder set
has the same frames as flat marks that grow or fade).
Frame names are the anim key plus `/` and the three-digit frame number (`vfx_blood_pool/003`); every
anim plays at 12 fps once (`repeat: 0`) and Phaser holds its last frame. Every frame carries a
`pivot`: the ground point of the effect, or the centre for the stamp.

| Anim key | Frames | Camera, cell | Notes |
|---|---|---|---|
| `vfx_blood_pool` | 8 | `TileCam`, 128 px | Pool spreading under a body; the last frame is the resting pool |
| `vfx_blood_splat` | 12 | `SpriteCam`, 128 px | Spray from chest height to specks on the ground, at the kill |
| `vfx_vote_stamp` | 10 | straight down, 256 px | Stamp slams down and lifts, leaving the `blood` seal (UI, reveal) |
| `vfx_dust_step` | 6 | `SpriteCam`, 64 px | Puff at a boot; ends empty |

**Body.** The body on the floor is the last frame of `die` (`char/<body>/die/<dir>/007`, with the
`scarf`, hat and `blood` overlays on the same tail), held by the one-shot anim; no separate key.
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
- Boulders, fences and stacks have one height and use it everywhere.
- A covered tile (`P`) draws nothing of its own.
- This is the cutaway rule of GDD 3.13: back walls stand, front walls are sills, inner walls are half height.

**Deep cull.** A solid tile more than `iso.deepCullTiles` (2) tiles away from every walkable tile (Chebyshev)
draws nothing at all, ground included. The void shows there in the scene's void colour: `slate` for exteriors,
`ink` for interiors and caves (the camera background).

**Occluders** are kit pieces at full or half height, trees, cliffs, building slices, and props whose frame rises
more than 96 px (displayed) above its pivot.

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
   `setScrollFactor(0)`, depth 900 000. It is redrawn on the camera's `FOLLOW_UPDATE`, or on `PRE_RENDER` while it
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
6. **Test hook.** A 1 x 1 px DOM element `data-testid="night-mask"` with `data-darkness="<0..1>"` stays visible
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
- It builds every object group from the tilemap alone, so `PropView` stops importing scene JSON.
- Phaser 4's GPU tile layer is orthographic-only, so the standard tile layer stays (RESEARCH.md).

**Exporter checks.**

- `--check` stays.
- The tile-size check splits: nav tile 64, ground tileset cells 128 x 64.
- The exporter fails a scene with more than **1 200 static world sprites** (solids, slices, props and spots).
  The largest outline, the Fenwood, draws about 600 solids.

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
- **Mode entries.** A manifest entry may carry **`modes: ('main' | 'onub')[]`**. An entry with `modes` loads at
  match start when the match's mode is listed, whatever the client's card (what a client loads never depends on
  its role). Every ONUB key carries `modes: ['onub']` (`docs/round5/onub-contract.md` 5.4).
- **Boot.** An entry with neither `maps` nor `modes` loads at boot.
- **Both manifests** (real and `?art=placeholder`) carry the same keys, the same `maps` and the same `modes`, the
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

## 11. ONUB images (Session 5M, round 5)

The art of the quick mode (GDD 3.11). The keys are `docs/round5/onub-contract.md` 5.4 plus `onub_mini` (art plan
5.7); every entry carries `modes: ['onub']` in both manifests, so it loads at ONUB match start whatever the client's
card and never in the main mode. All of it is pixel art on the world palette, finished whatever the main mode's
switch says (ASSETS 6.11), and built by one command:

```
pnpm --filter @wdi/sprites onub build     # images, cards, atlas, the real manifest's ONUB block
pnpm --filter @wdi/sprites onub review    # assets/source/review/{gate-c-*,onub-*}.png
pnpm --filter @wdi/sprites placeholder    # the greybox twins in assets/placeholder/onub/
```

The build reads the picked generations from git-ignored `assets/external/generated/5M/<id>.png` (a T5 cutout from
`<id>.cut.png`, the `remove_background` result); a key whose pick is missing there gets its labelled greybox, so a
fresh checkout rebuilds only what it has. The output is byte-identical across runs.

| Key | File (under `assets/onub/`) | Art size | File size | Drawn |
|---|---|---|---|---|
| `onub_station_<stationId>` (4), `onub_scene_<sceneId>` (10), `onub_kitchen` | `rooms/<key>.webp` | 640 x 360 | 1920 x 1080 | DOM, `image-rendering: pixelated` |
| `onub_card_<cardId>` (18), `onub_loc_<stationId>` (4), `onub_card_back_role`, `onub_card_back_loc` | `cards/<key>.webp` | 80 x 112 | 240 x 336 | DOM |
| `onub_cloche` | `misc/onub_cloche.webp` | 64 x 64 | 192 x 192 | DOM |
| `onub_portrait_<roleId>` (15), `onub_baker` | `portraits/<key>.webp` | 128 x 192 | 384 x 576 | DOM |
| `onub_mini` | `onub_mini.json`, `onub_mini-0.png` (multiatlas, one 512² page) | art size | – | Phaser, x3, `nearest` |

**The kitchen.** `onub_kitchen` is four 320 x 180 quadrants, fridge and mixer on top, proofing and oven below, with
the pass (96 x 64) centred at (320, 180). Each quadrant is that station's tap target; the DOM writes the names.

**The cards.** A 1 px ink border, a 3 px frame in the station's ramp (fridge `moon`, mixer `plaster`, proofing
`brass`, oven `brick`; Sabotage cards `moss` with a crack and a rot blot at the top-right corner), the window
(4, 4) to (76, 68) and the blank text band (4, 72) to (76, 108) in art pixels: bone paper `#D9D2C2` under a 1 px
`#B2AA99` rule, where the client writes the card's name and text. An Ingredient card's window is its object
(56 x 48) over a darkened crop of its station's floor; a Location card's is the station room (`onub-fixes.json`
`locBoxes`).

**`onub_mini` frames.** `mini_crate_butter`, `mini_crate_milk`, `mini_crate_eggs` (24 x 18), `mini_cart` (48 x 32),
`mini_dial`, `mini_gauge` (48 x 48), `mini_needle` (4 x 20, pivot (0.5, 0.9), pointing up), `mini_sack` (28 x 32),
`mini_bucket` (24 x 24), `mini_bowl` (64 x 48, its inner window (8, 8) to (56, 44) transparent for the fill),
`mini_fill_flour`, `mini_fill_water` (8 x 8, tiling), `mini_stream_flour`, `mini_stream_water` (4 x 8, tiling),
`mini_banneton` (28 x 16), `mini_cabinet` (72 x 88), `mini_slot_glow` (28 x 12), `mini_log` (24 x 10) and
`mini_oven/0` to `/3` (72 x 48). The fire loop has no animation key, since a manifest key starting `onub_` must be an
ONUB entry and an `anims_*` one may not list `onub`: the client builds `mini_fire` from `mini_oven/0..3` at 8 fps,
looping. No frame carries a target band (GDD 3.11).

**The low-poly style** (art plan 1.9, DECISIONS A79). The same build writes every key a second time, for
`artStyle('lowpoly')`, to `assets/lowpoly/onub/` with the same paths, file sizes, frame names and `modes`, and its
ONUB block to `assets/lowpoly/manifest.json` (`"art": "lowpoly"`, the atlas `linear`). Nothing is snapped or
outlined. The owner's rooms are cropped and box-downscaled straight to 1920 x 1080. The generated portraits are
treated the same way at 384 x 576, and cutouts are fitted at three times their art box, keeping their soft edges.
The kitchen, the cards and the backs are composed at the shipped size: their code-drawn frames, bands and fields
are enlarged with nearest, and the room window, floor and object are pasted in smooth. The owner's 13 rooms are lossy WebP
at `offWebpQuality` (90). The generated rooms, the kitchen, cards, the cloche and portraits are at
`LOWPOLY_ART_QUALITY` (82), which keeps the set within 4 MiB (3.85 MiB). `onub_mini` keeps its 512 page and art-size frames, packed from smooth objects. Its fire loop finds
the lantern pixels on a snapped copy and scales each pixel's own colour.

**Tests.** `tools/sprites/test/onub.test.ts`: every key in both manifests with its type and `modes`, no loft key,
every image at its file size and on the world palette with alpha 0 or 255, the ONUB set within 2.5 MB, every atlas
frame at its art box on one page, the blank band and the Sabotage mark, and the batch file's jobs, picks, prompts
and references. For the low-poly style: the same keys, URLs and `modes`, every image at the 8-bit size and off the
snap, the same atlas frames, and the set within 4 MiB (`styles.test.ts` checks the manifest is a re-skin).
