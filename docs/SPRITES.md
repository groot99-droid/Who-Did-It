# Sprite Conventions

> The contract between the art pipeline (`tools/blender`, `tools/sprites`, Session D) and the client
> (`apps/client`, Session B). Code imports the keys below, never file paths. Numbers that affect play
> live in `GDD.md`; colours and the render rig live in `ASSETS.md` 6.1-6.2; this file names things.

## 1. Cells, scale and directions

- Character cells are **128 x 128 px**, rendered directly at that size (no downscale step). One tile is
  64 px = 1 m (`TILE_PX`, `WORLD.md` 4.2). A standing 1.7 m villager is about 90 px tall in the cell.
- Animations play at **12 fps**. The rig renders the source clip with `frame_step` so the output is
  12 fps whatever the clip's scene rate.
- Height traits are not separate art: the client scales the sprite by the GDD 3.1 factor, anchored at
  the feet pivot.
- Eight directions, clockwise from screen up. This order is the only direction table; the code copy
  is `dirFromVector` in `@wdi/shared` and the rig copy is `DIRECTIONS` in `tools/blender/rig_common.py`.

| Index | Dir | Facing (screen) | Turntable `TT.rotation_euler.z` |
|---|---|---|---|
| 0 | `n` | up (world +Y) | 0° |
| 1 | `ne` | up-right | -45° |
| 2 | `e` | right | -90° |
| 3 | `se` | down-right | -135° |
| 4 | `s` | down (towards the camera) | -180° |
| 5 | `sw` | down-left | -225° |
| 6 | `w` | left | -270° |
| 7 | `nw` | up-left | -315° |

## 2. Rendered frame files

`batch_render.py` writes one PNG per frame, per pass, named by the frame regex of `ASSETS.md` 6.2:

```
^char_(\w+)_(idle|walk|run|interact|swing|carry|die|hide)_(n|ne|e|se|s|sw|w|nw)_(\d{3})$
```

Example: `out/<body>/scarf/char_villager_walk_se_003.png`. Frame numbers start at `000` and are
contiguous per clip and direction.

**Body ids** match `^[a-z][a-z0-9]*$` (no underscore, so the regex stays unambiguous) and are never
role names: `villager` is the only V1 body; a later body might be `fisher` or `stout`, never `killer`
or `detective`. Nothing in a key, frame name or file name may correlate with a role.

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

Clips and frame counts for V1 (`ASSETS.md` 6.3). `run`, `interact`, `carry` and `hide` are reserved by
the regex and arrive after the M3 gate.

| Anim | Frames | Repeat | Notes |
|---|---|---|---|
| `idle` | 8 | loop | |
| `walk` | 8 | loop | |
| `swing` | 6 | once | Shared by Kill, Crowbar and Check (`ARCHITECTURE.md` 5.4); never role-specific |
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
`linear` or `nearest` and is set per texture after load; `origin` (optional, `[x, y]` normalised) is
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
thread and the felt are small objects rendered by the tilted `SpriteCam`. Frames stay centred (no
pivot). Footprints and the drag segment point screen-up (`n`): rotate the sprite by `Clue.dir`; the
drag segment fills the cell top to bottom so segments chain along a trail. A footprint frame is one
left-right pair; the client lays the 5-tile trail (GDD 3.4) from several of them.

**Building exteriors** (single images, rendered with the roof, tilted camera). One per Small-profile
building of `WORLD.md` 4.3; the id is the stem of its frozen overworld portal id (`ov.<id>`):

| Key | Building | Interior scene |
|---|---|---|
| `bld_tavern_ext` | The Drowned Lantern | `tavern_bar` |
| `bld_apoth_ext` | Mallory Apothecary | `apoth_shop` |
| `bld_widow_ext` | Widow Vane's cottage | `widow_parlour` |
| `bld_bakery_ext` | Crumb's Ovens | `bakery` |

Medium and Large buildings (`bld_manor_ext`, `bld_barn_ext`, `bld_chapel_ext`) follow the same
grammar in M6.

**Ground tilesets** (straight-down camera, 64 px cells, 4 variants in a row, 256 x 64 px each):
`tiles_grass`, `tiles_path`, `tiles_cobble`, `tiles_floorboards`, `tiles_caverock`, `tiles_forestfloor`.

**Props** (texture `props`, `props/props.json`, real art only; M3). One frame per key, rendered by the
tilted `SpriteCam` at 64 px per metre. The key is `prop_<kind>` with the `kind` of
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

**VFX** (texture `vfx`, `vfx/vfx.json`; anims `anims_vfx`, `vfx/vfx.anims.json`; real art only; M3).
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
