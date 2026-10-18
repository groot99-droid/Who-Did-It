# Round-5 art plan: Sessions 5K, 5L and 5M

> The contract document the three art sessions read with their briefs.
> - The style, the palette and the ASSETS lines are the appendix of this document, "The round-5 style" (S1 to S5).
> - The projection, the tilemap, the manifest keys and the budgets are `docs/SPRITES.md` section 10.
> - The looks are `looks.json` (`deck-data.md` section 6).
> - The ONUB art keys are ONUB contract 5.4 (`onub-contract.md`).
> - The pre-seed of 1.2 and section 9 has landed. The study scripts and the trial images behind this plan stay
>   with the orchestrator.
>
> This plan names every asset, key, size, frame count, texture page, production route and licence row. It also gives
> the prompt templates and lists what needs the owner. Numbers that affect play stay in GDD.md and
> `packages/content/data`. The art numbers here (cells, art grids, page caps) are the art contract, and their data
> copies are `metrics.json` `iso` and `style.json` `pixel`.

Contents:

1. Ground rules for all three sessions
2. Higgsfield workflow and prompt templates
3. Session 5K: world environment
4. Session 5L: characters
5. Session 5M: ONUB art
6. Order of work, seams and integration
7. What needs the owner
8. Calls this plan made beyond the round-5 decisions
9. Pre-seed: the code that landed

Appendix: the round-5 style (S1 to S5)

---

## 1. Ground rules for all three sessions

### 1.1 Paths each session owns

**Session 5L** (characters, the IsoCam rig, the VFX and the ability icons):

- `tools/blender/rig_common.py`, `build_rig.py`, `batch_render.py`, `palettize.py`, `build_vfx.py` and `tests/**`.
- New `tools/blender/build_looks.py`, `looks_spec.py` and `look_parts.py`.
- `build_villager.py` is deleted: the villager becomes one entry of `looks_spec.py`.
- `tools/sprites/keys.ts`, `pack.ts`, `gen-anims.ts`, `contact.ts`, `body-contact.ts`, new `lineup.ts` and
  `placeholder-chars.ts` (created by the pre-seed, 1.2).
- Tests `tools/sprites/test/{pack,looks,budget,palette}.test.ts`.
- `apps/client/public/assets/{chars,portraits,vfx,calibration}/**` and their `placeholder/` twins.
- `apps/client/public/assets/ui/icons/icon_ability_*.svg` (6 new) and their rows in `icons.test.ts`.
- `tools/sprites/batches/5L.json` and `assets/source/review/{gate-b-*,looks-*,portraits-main}.png`.
- Docs: ASSETS 6.2 rig notes and 6.3 Characters, VFX ("What shipped, round 5"); SPRITES 1-4, 6 and 9.

**Session 5K** (world environment):

- `tools/blender/static_common.py`, `build_props.py`, `bakery_props.py`, `build_buildings.py`, `build_tiles.py`
  (renamed `build_ground.py`) and `save_masters.py`.
- New `tools/blender/kit_import.py`, `build_kit.py`, `build_thumbs.py` and `env/*.py`.
- `tools/sprites/pack-static.ts` and `images.ts`, new `tileset.ts`, `slice.ts` and `review-world.ts`, and
  `placeholder-world.ts` (created by the pre-seed, 1.2).
- Tests `tools/sprites/test/{tileset,slice,kit,props,images}.test.ts`.
- `apps/client/public/assets/{ground,kit,buildings,props,clues,thumbs}/**` and their `placeholder/` twins. 5K also
  deletes `tiles/**` and `buildings/bld_*_ext.png`.
- `apps/client/public/assets/audio/amb_*.ogg` and their rows in `audio/manifest.json`.
- `LICENSES/vendors/{kenney,kaykit,polyhaven}-*` and their rows in `LICENSES/vendors/README.md`.
- `tools/sprites/batches/5K.json` and `assets/source/review/{gate-a-*,kit-*,props-*,bld-*,boards-*}.png`.
- Docs: ASSETS 6.3 Buildings and environment, Props ("What shipped, round 5"); SPRITES 8.

**Session 5M** (ONUB art):

- New `tools/sprites/onub.ts`, `onub-cards.ts`, `onub-mini.ts` and `onub-fixes.json`.
- `tools/sprites/placeholder-onub.ts` (created by the pre-seed, 1.2) and new `tools/sprites/batches/5M.json`.
- Test `tools/sprites/test/onub.test.ts`.
- `apps/client/public/assets/onub/**` and its `placeholder/` twin.
- Deletes `apps/client/public/assets/loft/**`, `placeholder/loft/**` and `tools/blender/build_loft.py`.
- `assets/source/review/{gate-c-*,onub-*}.png`.
- Docs: ASSETS 6.3 UI and role cards ("What shipped, ONUB v2"); new SPRITES 11, "ONUB images" (the key table of
  section 5).

**Shared files.** Each session edits only its own entries, in its own block:

- **`manifest.json` and `placeholder/manifest.json`.** 5L's entries go in the villager block at the top. 5K's
  replace the `tiles_*` and `bld_*_ext` block. 5M's replace the loft block at the end. Separate blocks give separate
  hunks, so git merges them cleanly.
- **`CREDITS.md`, `assets/source/MANIFEST.md` and `LICENSES/vendors/README.md`.** Rows are appended to the matching
  table.
- **`tools/sprites/package.json`.** Its scripts are pre-seeded (1.2).
- **`tools/sprites/placeholder.ts` and `placeholder-kit.ts`** are the placeholder core and belong to no session
  (1.2 item 6).
- **`tools/sprites/test/legacy.ts`** (the `LEGACY` allowlist, 1.7). Each session deletes only its own keys' lines,
  which are grouped by the PR that removes them.

### 1.2 What the pre-seed gives the art sessions

These landed in the round-5 pre-seed, on top of 265bda9 (items 1 and 5 to 10 in its art step, items 2 to 4 in its
world and deck steps), before the sessions start:

1. **`style.json`, `palette.json`**, their schemas and content tests (S2 and S3). `style.json`
   carries `pixelFinish.enabled` `{ main: true, onub: true }`: `main` is the proposal until the owner answers Gate A
   (section 7), and the orchestrator then records the answer in DECISIONS and sets the value. As landed: both files
   word for word from S2 and S3.2, laid out by the repo's data formatter (`ui`, `colors`, `ambient`, `rules` and
   `source` unchanged); `schemas/style.ts` (the new `StyleFile`, exporting `Composition`) and `schemas/palette.ts`
   (`world { source, ramps, saturated }`, exporting `RampName`). In `content.test.ts` the style colour check is now
   case-insensitive and also covers every `compositions` string; a "world palette" block checks exactly 64 colours,
   every token but magenta, every `saturated` colour in a ramp and every two colours at least 0.02 apart in OKLab;
   a "style formula" block checks `{KEY}` only in `object` and `figure`, that every reference file exists and that
   `pixelFinish.enabled` equals `{ main: true, onub: true }`.
2. **`metrics.json`** of the world contract (`world.md` section 4), with `characterHeadsTall` 5, pinned in
   `content.test.ts` (ruling C5).
3. **`looks.json`** of the deck data (`deck-data.md` section 6), with `swing` in `clips` and in `LookClip` (S4,
   ruling C2).
4. **SPRITES 10 and `@wdi/shared/iso`**: `docs/SPRITES.md` section 10 and the iso module of the world step. Also
   the ASSETS 6.1, 6.2, 6.4, 6.9 and new 6.11 text of S5 (the round-5 docs pass), and the DECISIONS row this plan
   calls A-style (numbered by the orchestrator).
5. **The pixel finish, `tools/sprites/{oklab,palette,pixel}.ts`, with `test/pixel.test.ts`.** All three sessions
   need it from their first image, so no session owns it. The code is section 9. Its interface, in short (`Rgba`
   is `bleed.ts`'s straight 8-bit RGBA, reused):

   ```ts
   /** palette.ts: the 64 world-palette colours of palette.json `world.ramps`, deduplicated, in file order. */
   export function worldPalette(): readonly string[];
   /** palette.ts: style.json `pixelFinish.enabled[mode]` (`onub` is always true). */
   export function finishEnabled(mode: 'main' | 'onub'): boolean;
   /** Alpha cut at style.pixel.alphaCut, then each opaque pixel to the nearest world colour in OKLab. */
   export function snap(img: Rgba): Rgba;
   /** 2 x 2 mode downscale of a snapped image: opaque when >= 2 of 4 are; most frequent colour, ties to the darkest. */
   export function modeHalve(img: Rgba): Rgba;
   /** 2 x 2 alpha-weighted box downscale, partial alpha kept (the render path with the finish off). */
   export function boxHalve(img: Rgba): Rgba;
   /** Alpha-weighted box downscale to w x h (any ratio, never enlarges). */
   export function boxResize(img: Rgba, w: number, h: number): Rgba;
   /** Renders: on = snap then modeHalve; off = boxHalve then bleed. Defaults to finishEnabled('main'). */
   export function finishRender(img: Rgba, on?: boolean): Rgba;
   /** Display-size pages (ground cells, clues, vfx): on = finishRender then x2 nearest; off = bleed only. */
   export function finishDisplay(img: Rgba, on?: boolean): Rgba;
   /** Cutouts: chroma key at style.pixel.keyTolerance, then spill fix on edge pixels near the key hue. */
   export function cleanCutout(img: Rgba, keyHex: string): Rgba;
   /** Generated images (always finished): crop (box or centre to w:h), boxResize, snap, optional ink outline. */
   export function finishIllustration(
     img: Rgba,
     w: number,
     h: number,
     o?: { crop?: readonly [number, number, number, number]; outline?: boolean },
   ): Rgba;
   export function upscaleNearest(img: Rgba, k: number): Rgba;
   /** WebP at style.pixel.webpQuality (100, lossless) unless a quality is passed (offWebpQuality 90). */
   export function writeWebp(img: Rgba, file: string, quality?: number): Promise<void>;
   /** For tests: pixels off the palette, pixels with partial alpha, and the opaque share of `world.saturated`. */
   export function audit(img: Rgba): { offPalette: number; partialAlpha: number; saturatedShare: number };
   /** The CLI's work: every PNG of a render folder finished; `cell`, `feet`, `pivot` halved unless `display`. */
   export function finishFolder(raw: string, out: string, o?: { display?: boolean; on?: boolean }): string[];
   ```

   The CLI `pnpm --filter @wdi/sprites pixel <raw> <out> [--display] [--finish on|off]` finishes a `batch_render.py`
   or static-sheet output folder into packed-size frames, halving every `feet`, `pivot` and `cell` value in its
   `manifest.json`. `--display` keeps the size (ground cells, `clues`, `vfx`). `--finish` overrides the switch, for
   the two Gate A renders (3.10).

   As landed, `pixel.ts` also exports `cutAlpha`, `outline`, `crop`, `encodeWebp`, `halveManifest` and
   `offWebpQuality`, and re-exports `finishEnabled` and `worldPalette`; `finishEnabled('main')` is the default of
   `finishRender`, `finishDisplay`, `finishFolder` and the `pixel` CLI, and drives the filter check of
   `manifest.test.ts`. A smoke run of the CLI on a scratch folder halved the manifest values, with the finish on and
   off.
6. **`tools/sprites/placeholder.ts`, split** into a core that imports three modules. Each module exports
   `placeholderEntries(): PlaceholderEntry[]`: `placeholder-world.ts` (5K), `placeholder-chars.ts` (5L) and
   `placeholder-onub.ts` (5M). The pre-seed moved today's stand-ins into the module of the session that replaces or
   removes their key (the `LEGACY` table of 1.7): `tiles_*`, `bld_*_ext`, `props` and `clues` to the world module;
   the villager and `vfx` to the chars module; the loft images to the ONUB module. The placeholder output stays
   byte-identical. A session adds its keys' greybox stand-ins (same cell, pivot and size) to its own module, removes
   its retired keys there, and never edits the core.

   As landed, the core is two files. `placeholder-kit.ts` holds the palette, font, random-number and drawing helpers
   and the `PlaceholderEntry` type, so the modules and `placeholder.ts` never import each other (a module-level
   `const` using `PALETTE` would otherwise crash the CLI); it belongs to no session. A `PlaceholderEntry` is
   `{ order, entries, files() }`: today's manifest interleaves the modules, so `generate()` sorts the stand-ins by
   `order` (10 villager, 20 clues, 30 props, 40 vfx, 50 loft, 60 buildings, 70 tiles) to stay byte-identical, and a
   new block takes a number of its own (5M puts its ONUB block last with a high number). `placeholder.ts` still
   exports `PALETTE` and `ManifestEntry`, so `contact.ts`, `body-contact.ts` and `icons.test.ts` did not change.
   `pnpm --filter @wdi/sprites placeholder` leaves `git status` clean, and a scratch run matched the pre-split output
   (`diff -r`).
7. **The reference crops, `tools/sprites/refs.ts`, with `test/refs.test.ts`.** `pnpm --filter @wdi/sprites refs`
   writes every `style.json` `references` entry, cropped, to `build/refs/` as PNG. The test checks every crop lies
   inside its image. All three sessions need it for their first generation. The code is section 9. The README's
   command passes `../../build/refs`, since under `pnpm --filter` the CLI's default `build/refs` lands in
   `tools/sprites/build/refs` (both are git-ignored).
8. **`tools/sprites/package.json` scripts:** `pixel`, `refs`, `tileset`, `slice`, `review:world`, `lineup`, `onub`,
   `onub:cards` and `onub:mini`, each pointing at the file its owner writes.
9. **The `LEGACY` allowlist, `tools/sprites/test/legacy.ts`, with `test/legacy.test.ts`** (ruling C8; the key list
   is 1.7). `palette.test.ts` and `budget.test.ts` (5L, L1) read it, so L1 passes CI against today's art. As
   landed it lists exactly the 18 keys of 1.7: `audit()` over today's real manifest fails all 18 image and
   multiatlas keys (off-palette pixels and partial alpha; the villager pages are also 2048² against a 1024² cap),
   and the two animation keys have no pixels.
10. **`tools/sprites/test/manifest.test.ts`, replaced** (rulings C7 and C11, SPRITES 5 and 10.13): the same keys,
    types, `maps` and `modes` in both manifests; `modes: ['onub']` on every `onub_*` key and on no other; the
    villager keys in the placeholder manifest only once L4 lands; main-mode world filters following the switch.
    The code is section 9.

### 1.3 Keys, packed scale and draw scale

These are the keys of SPRITES 10.13 and ONUB contract 5.4, and how each is drawn, for Session 5I.

**Half size** means packed at art resolution and drawn at `iso.artScale` (2). **Display** means finished, then
doubled with nearest scaling, and drawn at 1. **nearest\*** means `nearest` while `style.json`
`pixelFinish.enabled.main` is true and `linear` when it is false (S5.7, "The switch"); `manifest.test.ts`
checks it. **ONUB match start** means the entry carries `modes: ['onub']` in both manifests (ruling C7: the optional
manifest field `modes: ('main'|'onub')[]` of SPRITES 5; an entry with `modes` loads when the match's mode is listed),
so it loads at ONUB match start and never in the main mode.

| Key | Type | Packed | Filter | Loaded | Owner |
|---|---|---|---|---|---|
| `iso_ground_harbour`, `iso_ground_timber` | image, 1280 x 1792 | display (SPRITES 10.12) | nearest\* | with the map | 5K |
| `iso_kit_harbour`, `iso_kit_timber` | multiatlas | half | nearest\* | with the map | 5K |
| `bld_hollowmere`, `bld_blackpine` | multiatlas | half | nearest\* | with the map | 5K |
| `props` | multiatlas | half | nearest\* | boot | 5K |
| `props_hollowmere`, `props_blackpine` | multiatlas | half | nearest\* | with the map | 5K |
| `clues` | multiatlas | display | linear (decals are rotated by the decal transform) | boot | 5K |
| `thumb_hollowmere`, `thumb_blackpine` | image, lossless WebP 480 x 270 (finish off: 480 x 270 at `offWebpQuality`) | 160 x 90 art, x3 | – (DOM) | boot | 5K |
| audio `amb_village`, `amb_house`, `amb_forest`, `amb_cave` | audio manifest | – | – | boot | 5K |
| `char_<lookId>`, `ovl_<lookId>`, `anims_<lookId>` (10 world looks) | multiatlas, animation | half | nearest\* | boot | 5L |
| `char_villager`, `ovl_villager`, `anims_villager` | greybox, placeholder manifest only from L4 (ruling C11) | – | nearest | only with `?art=placeholder` | 5L |
| `vfx`, `anims_vfx` | multiatlas, animation | display | nearest\* | boot | 5L |
| `portrait_<lookId>` (13) | image, lossless WebP 384 x 576 | 128 x 192 art, x3 | – (DOM) | boot | 5L |
| `onub_station_<stationId>` (4), `onub_scene_<sceneId>` (10), `onub_kitchen` | image, lossless WebP 1920 x 1080 | 640 x 360 art, x3 | – (DOM) | ONUB match start | 5M |
| `onub_card_<cardId>` (18), `onub_loc_<stationId>` (4), `onub_card_back_role`, `onub_card_back_loc` | image, lossless WebP 240 x 336 | 80 x 112 art, x3 | – (DOM) | ONUB match start | 5M |
| `onub_cloche` | image, lossless WebP 192 x 192 | 64 x 64 art, x3 | – (DOM) | ONUB match start | 5M |
| `onub_portrait_<roleId>` (15), `onub_baker` | image, lossless WebP 384 x 576 | 128 x 192 art, x3 | – (DOM) | ONUB match start | 5M |
| `onub_mini` (addition to contract 5.4) | multiatlas | art, drawn at `illustrationScale` 3 | nearest | ONUB match start | 5M |

**Loading.** Every ONUB key, `onub_mini` included, carries `modes: ['onub']` and loads at ONUB match start,
whatever the client's card (privacy: what a client loads never depends on its role). Every look's character and
portrait loads at boot (GDD 3.17). The real villager leaves the real manifest with L4; in round 5 every seat has a
look, so `char_villager` and `ovl_villager` load only with `?art=placeholder` (ruling C11). The DOM shows a
scaled-down illustration with `image-rendering: pixelated` (5C, 5D and the role card).

### 1.4 Texture budget

The limit is 6 resident pages of 2048² (ASSETS 6.8). These are the budget numbers of round 5: SPRITES 10.14 adopts
them (ruling C11). The characters of the largest deck are 10 world looks at up to 0.375 each (one 1024² body page,
one 1024 x 512 overlay page). Each map's environment is therefore capped at **1.8**, so the worst case fits. The
real villager is not counted: from L4 it is in the placeholder manifest only (1.3). The pixel-finish switch changes
no packed size, so the same numbers hold with the finish off:

| Texture | Cap (px) | Page-equivalents |
|---|---|---|
| `iso_ground_<theme>` | 1280 x 1792 (fixed) | 0.55 |
| `iso_kit_<theme>` | 1024 x 1024 | 0.25 |
| `bld_<mapId>` | **2048 x 1024** | 0.50 |
| `props_<mapId>` | 1024 x 1024 | 0.25 |
| `props` | 1024 x 1024 | 0.25 |
| `clues` | 512 x 512 | 0.06 |
| `vfx` | 512 x 2048 | 0.25 |
| 10 world looks: `char_<lookId>` ≤ 1024 x 1024 and `ovl_<lookId>` ≤ 1024 x 512 | | ≤ 3.75 |
| **Worst case resident** | | **5.86 ≤ 6** |

Packing picks the smallest power-of-two page that fits, so most looks will land on a 1024 x 512 body page. The
expected character total is about 3.

`tools/sprites/test/budget.test.ts` (5L, extended by each session for its keys) reads every atlas JSON and image
size of the real manifest, skipping the `LEGACY` keys (1.7), and asserts:

- each cap above;
- for each map: its environment, the boot atlases and the 10 largest looks add up to ≤ 6.0.

The DOM images (rooms, cards, portraits, thumbnails) are not GPU pages. Their cap is bytes:

- ONUB set ≤ 2.5 MB;
- main-mode portraits ≤ 0.8 MB;
- thumbnails ≤ 0.2 MB.

### 1.5 Production routes and licence rows

| Route | Used for | Licence of the export | Rows the session adds |
|---|---|---|---|
| **R1** Blender from code, no third-party input | characters, VFX, kit shapes and props modelled in code | CC BY 4.0 (A19) | CREDITS "Hand-made" row; a MANIFEST row per saved `.blend` (`save_masters.py`, "the script is the true source") |
| **R2** Blender with CC0 kit meshes or textures | ground, kit, buildings, kit-bashed props, trees | CC BY 4.0 for the render, crediting the CC0 parts | "Hand-made" row, plus one "Third-party" row per pack (files = every export containing it, licence CC0-1.0, fetch date). The pack's licence file goes in `LICENSES/vendors/<vendor>-<pack>-license-<date>.txt`, and the vendor README row reads "Saved: yes" |
| **R3** Higgsfield generation on the owner's paid account | portraits, card objects, the cloche, the Brick Oven, the kitchen pass, mini-game objects, look concepts, style boards | CC0 1.0 (A17) | CREDITS "Generated" row: generation ids, the model and feature the connector reports, date, catalog id `pending higgsfield-library-sync`, and the template and batch item. Plus a MANIFEST row per master (ROSW path, SHA-256 of the downloaded file, generation id) |
| **R4** Owner-supplied AI images | the 13 ONUB rooms and their derivatives (the pixel-finished rooms, the kitchen overview, the location-card crops) | per the owner's tool's terms: CC0 1.0 when that vendor claims no ownership of outputs, as Higgsfield does | the existing CREDITS row, completed with the tool and plan the owner names, and a vendor terms row **before 5M's `onub/*` exports merge** (section 7) |
| **R5** Code-drawn pixel art and SVG | ONUB card frames, backs, dials and fills; ability icons | CC BY 4.0 | "Hand-made" row |

An export that mixes routes lists every row it draws on. A card, for example, is an R5 frame around an R3 object.

**Masters.**

- Raw generations are never committed (about 140 images at 2-4 MB each). The master of a generation is its
  Higgsfield library entry, found by generation id. The owner's `higgsfield-library-sync` pulls it into ROSW
  `studio/library/catalog.json` and copies it to `studio/assets/who-did-it/<kind>/<slug>/`.
- `.blend` masters are saved by `save_masters.py` into git-ignored `assets/external/`, as in round 4.
- Downloaded packs stay in git-ignored `assets/external/kits/<pack>/`. Only renders are committed.

**Not used in round 5:**

- Higgsfield `generate_3d`: A17 covers images, not meshes, and the Meshy terms row is unsaved.
- Quaternius and Mixamo.

### 1.6 Review sheets and the gates

- Every batch PR carries a review PNG in `assets/source/review/` at 1x and 2x, named in the session sections.
- The gate renders are listed in section 7: Gate A (world, twice: the pixel finish on and off), Gate B (character)
  and Gate C (ONUB illustration).
- A batch whose output class (world, character or ONUB illustration) has no owner approval yet stays a draft PR. It
  merges after the approval is recorded in DECISIONS. Work continues in the meantime.

### 1.7 Tests every session keeps green

| Test | Asserts |
|---|---|
| `manifest.test.ts` (replaced by the pre-seed, section 9) | both manifests carry the same keys, types, `maps` and `modes`, the villager aside (placeholder only from L4); `modes: ['onub']` on every `onub_*` key and on no other (ruling C7); the filter of every round-5 main-mode world texture follows `pixelFinish.enabled.main`, and `clues` is `linear` |
| `palette.test.ts` (5L, L1) | every pixel of the real manifest's images and atlas pages is a world colour, with alpha 0 or 255 and the saturated share under its cap; skips the `LEGACY` keys, and the main-mode rig renders while the main finish is off |
| `budget.test.ts` (5L, L1) | the caps of 1.4, skipping the `LEGACY` keys |
| `legacy.test.ts` (pre-seed) | each `LEGACY` key is listed once and is still a key of the real manifest. K6 adds the assertion that the list is empty |
| `pixel.test.ts` (pre-seed) | snap, mode-halve with the darkest tie, box downscale, alpha cut, both settings of the switch, cutout key, spill and outline, lossless WebP, manifest halving, determinism |
| `refs.test.ts` (pre-seed) | every reference file exists, every crop lies inside its image, output names are unique |
| Each session's own key tests | named in its section |

**The `LEGACY` allowlist** (ruling C8). `tools/sprites/test/legacy.ts` lists the real-manifest keys whose art
predates the round-5 style, so L1's `palette.test.ts` and `budget.test.ts` pass against today's art. The PR that
replaces or removes a key's art deletes its line in the same commit. K6 asserts the list is empty, so K6 integrates
after L4, L5 and M1 (section 6). The initial list, one key per line, grouped by the PR that clears it:

| PR | Keys | What the PR does |
|---|---|---|
| K3 | `props`, `clues` | re-renders them under the same keys |
| K4 | `bld_tavern_ext`, `bld_apoth_ext`, `bld_widow_ext`, `bld_bakery_ext` | removes them when `bld_hollowmere` lands |
| K6 | `tiles_grass`, `tiles_path`, `tiles_cobble`, `tiles_floorboards`, `tiles_caverock`, `tiles_forestfloor` | removes them once 5J's isometric tilemaps have landed |
| L4 | `char_villager`, `ovl_villager` | removes the real villager (and `anims_villager`) from the real manifest (ruling C11) |
| L5 | `vfx` | re-renders it under the same key |
| M1 | `loft_backdrop`, `prop_bedroll`, `prop_bedroll_self` | removes them with the loft (ruling C12) |

PRs stay under 400 lines of code where the work allows; binaries are not counted. An art drop stays under the
25 MB CI warning.

### 1.8 Building for the pixel-finish switch (ruling F15)

The main world's finish is the owner's Gate A answer, so 5K and 5L build every main-mode asset so that the answer
is one switch, `style.json` `pixelFinish.enabled.main` (S5.7, "The switch"):

- Every main-mode rig render goes from its raw render to its shipped frame through the pixel CLI, which reads the
  switch. No session hand-paints a fix into a finished frame: a fix goes into the Blender script, the recipe or the
  texture, and the frame is re-made.
- Raw renders are reproducible from the committed scripts (they live in git-ignored `build/`), so flipping the
  switch is a re-run of the batch scripts, the pixel CLI and the packers.
- The manifest `filter` of each main-mode world texture follows the switch (1.3), and `manifest.test.ts` checks it.
- Generated pixel art (portraits, cards, the ONUB images) always takes the finish. The ONUB art keeps it whatever
  the main answer is.

---

## 2. Higgsfield workflow and prompt templates

### 2.1 Setup, once per session

1. **Account.** Call `balance` and write the plan and credits into the first PR description.
2. **Model.** Call `models_explore` (`action: recommend`, query "style-consistent images from several reference
   images, 2k") and pick one image model that takes `image_references`. Use it for every image of the session at
   resolution 2k and the highest quality that model offers. The CREDITS row records the model as the connector
   reports it.
3. **References.**
   - `pnpm --filter @wdi/sprites refs` writes the `style.json` `references` crops to `build/refs/` (PNG).
   - Upload them with `media_upload`, PUT each file with curl, then `media_confirm`.
   - Keep the media ids in `build/refs/media.json`. They are session-local and not committed; a new session uploads
     again.
4. **Cost.** Preflight one image of each template the session uses with `get_cost: true`, and multiply by the
   batch counts of 2.7. Write the total in the first PR description, and stop before passing the owner's ceiling
   (section 7).

### 2.2 Batch files

`tools/sprites/batches/<session>.json` lists every generation the session makes. It is committed, so every shipped
image can be traced and re-made.

```json
{
  "session": "5M",
  "model": "<as the connector reports it>",
  "settings": { "resolution": "2k", "quality": "<highest offered>" },
  "items": [
    {
      "key": "onub_station_oven",
      "template": "T1",
      "aspect": "16:9",
      "count": 4,
      "subject": "Le Four à Pain, ...",
      "extraRefs": ["assets/source/concepts/onub/station_fridge.jpg"],
      "keyColor": null,
      "crop": null,
      "replace": null,
      "jobs": ["<generation id>", "..."],
      "pick": "<generation id>"
    }
  ]
}
```

`replace` carries word swaps in the composition clause for a documented exception, such as `{"one person": "one
pastry"}` for the Stale Croissant.

### 2.3 How a prompt is assembled

The parts are joined with a blank line between them:

```
<style.compositions[c] with {KEY} replaced by the item's key colour and `replace` applied>

Subject: <item.subject>.

<style.styleFormula>

<style.styleAvoid>
```

The `image_references` are `style.references[c]` followed by `item.extraRefs`, at most 4 in all, in that order.

| Template | Composition `c` | Aspect | Key colour | Extra references | Count | Finish |
|---|---|---|---|---|---|---|
| **T1** Room diorama | `diorama` | 16:9 | none | the item's | 4 when the owner picks, else 2 | `finishIllustration` to 640 x 360, x3, lossless WebP |
| **T2** Level board | `level` | 16:9 | none | none | 2 | none: a concept that guides modelling |
| **T3** Figure turnaround | `figure` | 16:9 | magenta unless the costume has pink or purple | none | 2 | none: a concept. It is keyed so it reads cleanly and can be cut into views for T4 |
| **T4** Portrait | `portrait` | 2:3 | none | 5L: the look's picked T3 turnaround and one room. 5M: the role's own night scene | 2 | `finishIllustration` to 128 x 192, x3 |
| **T5** Object cutout | `object` | 1:1 | per 2.4 | none | 1, or 2 for the cloche and the pass | `cleanCutout`, then `finishIllustration` to the item's art box with the ink outline |

Re-state "about five heads tall, simple face, no drawn eyes" in a figure's subject when a result drifts. Never ask
for lettering. The DOM writes every name in Oswald.

### 2.4 Key colour and background removal (T3, T5)

1. **Pick the key colour.** `style.keyColors[0]` (`#FF00FF`) by default. Use `[1]` (`#00FF00`) when the subject has
   pink, purple or magenta: wine, cured ham, the Garde Manger's cheeks. Use `[2]` (`#0000FF`) when it has both
   magenta and green. Mould subjects (green glow) take magenta.
2. **Generate** with the template. The composition already asks for "a perfectly flat pure {KEY} background, no
   floor, no cast shadow".
3. **Remove the background** with `remove_background` (`media_id` = the job id, `media_type: image`), and download
   both the keyed original and the cutout to `assets/external/generated/<session>/`.
4. **Clean the cutout** with `cleanCutout(cutout, key)`:
   - A chroma key clears anything within `keyTolerance` (0.15 in OKLab) of the key.
   - Then edge pixels whose hue is within 30° of the key's and whose saturation is over 0.3 take the colour of their
     nearest interior pixel (up to 3 pixels away).
   - If `remove_background` failed outright, run `cleanCutout` on the keyed original: the chroma key does the whole
     job.
5. **Finish** with `finishIllustration(..., { outline: true })`: box resize to the art box, snap, one-pixel `ink`
   outline.

### 2.5 Records for every shipped generation

- **CREDITS "Generated" row**, per shipped file group:

  | Files | Tool | Model / feature | Date | Generation id | Catalog id | Notes |
  |---|---|---|---|---|---|---|
  | the shipped files | Higgsfield (plan as `balance` reports it) | the model, `generate_image`, aspect, references | the date | the picked id | `pending higgsfield-library-sync` | template, batch item, the pixel finish |

- **MANIFEST row**, per master: ROSW path `studio/assets/who-did-it/<kind>/<slug>/<file>`, SHA-256, date, studio note
  "to be written by the studio pipeline", the exports, and "Higgsfield `<id>`".

### 2.6 Prompt subjects

Subjects are final text, ready for the batch files.

- 5K's T2 boards are in 3.9.
- 5L's T3 and T4 subjects are in 4.3 and 4.5.
- 5M's T1, T4 and T5 subjects are in 5.3 to 5.7.

### 2.7 Generation budget

| Session | Items | Images |
|---|---|---|
| 5K | 6 style boards x 2 | 12 |
| 5L | 10 turnarounds x 2; 13 portraits x 2 | 46 |
| 5M | Brick Oven 4; proofing clean-up 2; kitchen pass 2; cloche 2; card-back emblem 2; 11 mini-game objects; 18 card objects; 16 portraits x 2; about 7 retries | 80 |
| **Total** | | **about 138; cap 160** |

A session that would pass its line by more than 25%, or the total cap, stops and asks through its PR.

---

## 3. Session 5K: world environment

### 3.1 Sources

All downloads go to git-ignored `assets/external/kits/<pack>/`. The licence file is saved on the day of the fetch
(`LICENSES/vendors/README.md` rows for Kenney, KayKit and Poly Haven), and CREDITS rows name the exact pack and file
names.

| Source (CC0) | What 5K takes |
|---|---|
| Kenney Fantasy Town Kit | doors, windows, chimneys, roof pieces, carts, barrels, crates, market and well pieces |
| Kenney Nature Kit | tree, rock, stump, log and plant meshes |
| Kenney Survival Kit | campfire, tools, logs, chests |
| Kenney Furniture Kit | beds, tables, chairs, shelves, cabinets, stoves |
| Kenney Graveyard Kit | headstones, iron fencing, crypt pieces |
| KayKit Dungeon Remastered | torches, barrels, chests, rubble, cave and mine dressing |
| KayKit Forest Nature Pack | pines, bushes, rocks |
| Poly Haven, public API, 1k | ground and wall textures (cobblestone, flagstone, planks, brick, plaster, rock, gravel, mud, forest litter, moss); a few models (barrels, crates, lanterns, chairs, rocks) |

How the parts are prepared:

- `kit_import.py` imports a GLB, FBX or OBJ, merges it into the scene, tags its parts and re-materials it through
  `WDI_Toon`:
  - flat colours are snapped by `palettize.py`;
  - textures go in through the toon colour input.
- The pixel finish snaps every rendered pixel, so low-poly Kenney pieces and textured Poly Haven pieces end in one
  look.
- Unique items stay modelled in code, as in rounds 3 and 4 (the bell, the notice board, the pump, the Wake Table).

### 3.2 Ground: `iso_ground_harbour` (Hollowmere) and `iso_ground_timber` (Blackpine)

**Layout** (SPRITES 10.12, exact):

- 10 columns x 28 rows of 128 x 64 display cells, 1280 x 1792 in all.
- Material m (its index in `GROUND_ROWS`, `glmpdcfwrs~u=O`) owns rows 2m and 2m + 1:
  - cells 0-3 are base variants;
  - cell 3 + k is the edge overlay with side mask k (north 1, east 2, south 4, west 8; north is the diamond's
    upper-right edge), for k from 1 to 15;
  - cell 19 is empty.

**Making a base cell** (`build_ground.py`):

- A 1 x 1 m plane with the material's texture is rendered by IsoCam at display scale, finished to a 64 x 32 art
  diamond, and doubled with nearest scaling.
- The four variants shift and rotate the texture's UVs and add a seeded scatter (pebbles, leaves, cracks) inside the
  diamond, so every variant tiles with every other.

**Making an edge overlay.** The same texture under a seeded noise mask that covers the sides in k and reaches 30% into
the diamond, with a one-art-pixel rim one ramp step darker. It is deterministic on a fixed seed. `tileset.ts` joins
the cells into the 1280 x 1792 image and checks the grid.

| Char | Material | Harbour (Hollowmere) | Timber (Blackpine) |
|---|---|---|---|
| `g` | grass | wet olive-green sea grass with clover | drier yellow-green upland grass |
| `l` | litter | autumn oak leaves over dark earth | rust pine needles and cones |
| `m` | moss | deep green cushion moss on stone | grey-green moss on roots |
| `p` | path | packed earth with cart ruts and puddles | churned skid-road mud with log ruts |
| `d` | earth | dark loam | black forest loam with chips |
| `c` | cobble | grey granite setts, moss in the joints | rough fieldstone paving |
| `f` | flags | worn grey stone flags (chapel, cellar, manor hall) | slate flags (office, forge) |
| `w` | planks | scuffed floorboards; also the dock deck | rough-sawn boards with nail heads |
| `r` | rock | wet cave floor with puddles and quartz flecks | mine floor of crushed rock and ore dust |
| `s` | shingle | grey beach pebbles with weed | river gravel |
| `~` | shallows | clear water over stones, highlight pixels | brown river shallows |
| `u` | brush | bracken and bramble tufts kept flat to the diamond | ferns and huckleberry |
| `=` | rails | iron tram rails on sleepers over ballast. Cells 0-1 run along world x, 2-3 along world y | the same, with the mine's rust |
| `O` | water | deep sea and flooded gallery: dark blue-teal with a few ripple pixels | the Blackwater: dark brown-blue |

**The rail rule** is SPRITES 10.12's (the world pre-seed, ruling C16): a `=` tile takes its base variant from its
rail neighbours' axis, 0-1 along x and 2-3 along y, so the rails follow the track. A `=` tile with no rail neighbour
takes 0. The cells above are drawn to match it.

### 3.3 Kit: `iso_kit_harbour` and `iso_kit_timber`

**Frames** (SPRITES 10.12, 10.13): `<wall|cliff|tree|boulder|fence|stack>/<full|half|stub>/<0-3>`.

- Packed at half size. Every pivot is the ground point under the tile centre: (cell width / 2, cell height - 16) in
  art pixels.
- The exporter picks the variant by (x·7 + y·13) mod 4, so all four variants of a frame must sit well beside each
  other.

| Frames | Art cell | Harbour | Timber |
|---|---|---|---|
| `wall/full/0-3` (2.5 m) | 64 x 112 | Plaster over brick with a dark wood skirting; the cut top shows the brick core. v0 plain, v1 a chipped patch showing brick, v2 a pipe run with a bracket, v3 a damp stain and crack | Squared logs with pale chinking. v0 plain, v1 axe marks and a knot, v2 wooden pegs, v3 a tar-paper patch |
| `wall/half/0-3` (1.2 m) | 64 x 72 | the same at half height | the same |
| `wall/stub/0-3` (0.3 m sill) | 64 x 48 | the sill with its skirting | a bottom log |
| `cliff/full/0-3` (2.5 m) | 64 x 112 | Dark wet granite with moss seams and quartz flecks; it serves the coast, the Tin Gallery and the Flooded Gallery | Grey-brown hill rock with rust ore streaks; v3 has a timber prop for the mine |
| `cliff/half/0-3` (1.2 m) | 64 x 72 | the same | the same |
| `cliff/stub/0-3` (0.4 m ledge) | 64 x 48 | a rock lip | the same |
| `tree/full/0-3` (5 m, drawn at 0.75) | 96 x 144 | v0, v1 oak; v2 ash; v3 a dead silver birch (it suits the Fenwood and thins Gallows Wood) | v0-v2 black pine; v3 larch |
| `tree/stub/0-3` | 64 x 48 | oak stumps, one with an axe cut | pine stumps, one with the felling notch |
| `boulder/full/0-3` | 64 x 64 | Upright weathered stones: a field stone, a mossy boulder and two leaning slabs. They read as headstones in the graveyard and as stones elsewhere | granite boulders, one split |
| `fence/full/0-3` | 64 x 56 | A low drystone wall topped with hawthorn hedge. It reads as a hedge and a field wall, and the client draws it under closed profile gates | split-rail fence |
| `stack/full/0-3` | 64 x 80 | crates, barrels, lobster pots, a peat stack | a log stack, a plank stack, crates, ore sacks |

That is 44 frames per kit, about 0.3 Mpx before padding: one 1024 x 512 page (the cap is 1024²).

**Hedges and headstones** follow the world contract (`world.md`, ruling C16): Hollowmere's hedge rows are authored as `F` (the
hedge-topped wall above) and the graveyard's headstones as `R` (the upright stones of `boulder`).

### 3.4 Buildings: `bld_hollowmere` and `bld_blackpine`

**How a building is made.**

- `build_buildings.py` builds each building from a recipe at its footprint, read from the scene files'
  `buildings[]`. A recipe names its wall and roof materials, Kenney parts and details. Walls stand 3 m, and the roof
  sits on top; both render at 0.75 height.
- Eaves stay within 0.25 tile of the south and east faces (SPRITES 10.5). Doors are modelled where the scene's
  portals are. Windows are painted lit, in the lantern ramp.
- The building renders whole through IsoCam at display scale. A Shader AOV pass writes each surface point's world
  tile.
- `slice.ts` cuts the finished frame into one slice per footprint tile, `<art>#<dx>_<dy>`, keeping the untrimmed
  canvas through `spriteSourceSize` (SPRITES 10.5).

| Art | Map | Footprint | Doors | Recipe |
|---|---|---|---|---|
| `manor` | Hollowmere | 13 x 6 | `ov.manor_front` 13,11, `ov.manor_back` 6,11 (south) | Two-storey dark granite manor, slate roof with two chimneys and dormers, a stopped clock face in the gable, iron railings at the front door, one lit upstairs window |
| `barn` | Hollowmere | 10 x 5 | `ov.barn` 51,10 (south) | Tarred board barn on a stone plinth, mossy slate roof, a hay door in the gable, a big double door |
| `bakery` | Hollowmere | 6 x 4 | `ov.bakery` 42,19 (south) | Whitewashed plaster shop, a bow window of loaves glowing warm, a hanging loaf sign, a stout flue |
| `apoth` | Hollowmere | 10 x 8 | `ov.apoth` 50,24 (south) | Narrow two-storey plaster shop, a bow window of teal glass bottles (lit by the teal window light), a mortar sign |
| `widow` | Hollowmere | 8 x 7 | `ov.widow` 9,20 (east) | Stone cottage with dark shutters, a black wreath on the door, an overgrown garden wall |
| `tavern` | Hollowmere | 12 x 7 | `ov.tavern_front` 28,34 (south), `ov.tavern_alley` 36,31 (east) | The Drowned Lantern: a long two-storey inn, warm windows, a lantern sign over the south door, barrels by the wall |
| `chapel` | Hollowmere | 9 x 8 | `ov.chapel` 10,32 (east) | Granite chapel with a squat bell tower at its west end and lancet windows |
| `netloft` | Hollowmere | 5 x 9 | none | A tall, narrow tarred net loft on the dock edge, with nets hung on its south face |
| `mollHut` | Hollowmere | 4 x 3 | none | A charcoal-burner's hut of logs and sod with a smoking roof hole |
| `lodge` | Blackpine | 14 x 7 | `bc.lodge` 12,19 (south), `bc.lodge_side` 21,16 (east) | A long log bunkhouse with a covered porch along the south front (the Child's crawlspace under it), stovepipes, lit windows |
| `mill` | Blackpine | 12 x 7 | `bc.mill` 45,27 (east), `bc.mill_yard` 38,30 (south) | A tall plank sawmill with the waterwheel on its east face, a log carriage ramp and drifts of sawdust |
| `office` | Blackpine | 8 x 6 | `bc.office` 47,11 (south) | A painted clapboard company office with a blank false front, a porch and a telephone pole with a cut wire |
| `smithy` | Blackpine | 7 x 5 | `bc.smithy` 32,11 (south) | A stone-and-timber forge, its wide front glowing, a brick chimney |
| `woodshed` | Blackpine | 5 x 3 | none | An open-fronted lean-to stacked with split wood |

Footprints and doors are 5J's (`world.md` 7-8). If 5J moves a building, the recipe reads the new
footprint from the scene file, and no art id changes.

Page estimate: about 1.2 Mpx of trimmed slices for Hollowmere and 0.9 Mpx for Blackpine, under the 2048 x 1024 cap.
**Removed:** `bld_tavern_ext`, `bld_apoth_ext`, `bld_widow_ext` and `bld_bakery_ext` leave both manifests in the PR
that lands `bld_hollowmere` (SPRITES 10.13).

### 3.5 Props: `props`, `props_hollowmere` and `props_blackpine`

**Lookup and rendering.**

- The lookup is `props_<mapId>`, then `props`; inside each, `prop_<kind>[_<state>]`, then `prop_<id tail>`
  (SPRITES 10.13). 5K never ships `prop_decor` or `prop_taskSource`, so those kinds fall through to their id tails.
- One-tile frames render by IsoCam with the pivot at the tile centre's ground point.
- A prop with a `footprint` is sliced like a building (`prop_<key>#<dx>_<dy>`).

**`props`** (boot, both maps):

| Frame | Used by | Art cell | Look |
|---|---|---|---|
| `prop_noticeBoard` | `ov.board`, `bc.board` | 64 x 96 | Board with pinned papers under a little roof (blank papers, no text) |
| `prop_kitChest` | `ov.chest`, `bc.chest` | 64 x 64 | Iron-banded chest |
| `prop_pump` | `ov.pump`, `bc.pump` | 64 x 96 | Cast-iron pump on a stone well head |
| `prop_lanternPost_lit`, `prop_lanternPost_unlit` | `ov.lantern_*`, `bc.lantern_*` | 64 x 128 | Iron post, its glass in the lantern ramp (lit) or fog (unlit) |
| `spot_wardrobe`, `spot_behindCounter`, `spot_underBed`, `spot_crawlspace`, `spot_brush`, `spot_hollowTree`, `spot_timberCrib`, `spot_sump` | spots in both maps | 64 x 64 to 64 x 128 | See 3.6 |
| `portal_*` (20 frames) | every portal | 64 x 112 | See 3.7 |

**`props_hollowmere`:**

| Frame | Used by | Art cell | Look |
|---|---|---|---|
| `prop_bell` | `ov.bell` | 64 x 128 | The meeting bell on a timber frame |
| `prop_oven` | `bk.oven` | 64 x 96 | Crumb's bread oven: stone base, dome, mouth, flue, a peel |
| `prop_basin` | `as.basin`, `bk.basin` | 64 x 64 | Stone wash basin with a jug and rag |
| `prop_wakeTable#0_0`..`#4_1` | `bk.wake_table` (footprint 5 x 2) | sliced | The bakery's long work table. The main-mode bakery draws every prop of `bakery.json`, so the Wake Table, plates, dead loaves and ledger stay |
| `prop_plate` | `bk.plate_*` | 64 x 64 | An empty plate with crumbs at the table's top height (overlay, depth bias 0.1) |
| `prop_deadLoaf` | `bk.deadloaf_*` | 64 x 80 | One ledge tile with a mourning-banded loaf |
| `prop_ledger` | `bk.ledger` | 64 x 80 | Sloped desk with a shut ledger and inkwell |
| `prop_flour_sacks` | `bk.flour_sacks` | 64 x 64 | Three plain flour sacks and a spill |
| `prop_dartboard` | `tb.dartboard` | 64 x 96 | Dartboard on a wall plank |
| `prop_flourBin` | `tb.flour_bin` | 64 x 64 | Lidded flour bin |
| `prop_gasPocket` | `cl.gas_alcove_*` | 64 x 64 | A dark, damp alcove crack with a faint green tinge |
| `prop_goat` | `ba.goat` | 64 x 64 | A tethered goat, standing |
| `prop_keyCache` | `ba.study_key`, `cl.study_key` | 64 x 64 | A key on a nail in a niche |
| `prop_green_lamp`, `prop_candle` | `al.green_lamp`, `wb.candle` | 64 x 64 | The loft's green-shaded lamp; a candle on a saucer. Id tails, since `prop_lamp` would serve both |
| `prop_lockedDoor` | `mu.study_door` | 64 x 112 | Panelled study door with a brass lock plate |
| `prop_window` | `tb.shutters` | 64 x 112 | Shuttered window in the wall |
| `prop_fence` | `ov.fence` | 64 x 56 | A broken stretch of the paddock fence |
| `prop_bench` | `as.bench` | 64 x 64 | Apothecary workbench with jars |
| `prop_planks` | `fo.planks` | 64 x 64 | Stacked planks at the wood edge |
| `prop_oil_barrel` | `tk.oil_barrel` | 64 x 64 | Oil barrel with a spigot |
| `prop_letter_box` | `wp.letter_box` | 64 x 80 | Wall letter box |
| `prop_shelf` | `as.shelf` | 64 x 112 | Shelf of bottles and jars |
| `prop_rope` | `ch.rope` | 64 x 112 | The bell rope hanging in the chapel |
| `prop_clock` | `mh.clock` | 64 x 128 | Long-case clock stopped at 11:47 (hands only, no numerals) |
| `prop_safe` | `mh.safe` | 64 x 80 | Iron safe |
| `prop_crepe` | `ov.crepe` | 64 x 112 | Black mourning crepe over the manor's front door (overlay, bias 0.1) |
| `prop_scarecrow` | `ov.scarecrow` | 64 x 112 | Scarecrow in an old coat |
| `prop_photos` | `tb.photos` | 64 x 96 | Framed photographs on the wall |
| `prop_portrait` | `wp.portrait` | 64 x 112 | A large portrait turned to face the wall |
| `prop_hanging_oak#0_0`..`#1_1` | `fd.hanging_oak` (2 x 2) | sliced | The old oak with a frayed rope |
| `prop_clamp#0_0`..`#1_1` | `fd.clamp` (2 x 2) | sliced | A smouldering charcoal clamp, earth-banked with smoke holes glowing |
| `prop_drowned_lantern` | `fd.drowned_lantern` | 64 x 80 | A lantern on a sunk post in the fen |
| `prop_den` | `fd.den` | 64 x 96 | Rock face with a wolf-den mouth |
| `prop_pump_beam#0_0`..`#1_2` | `cg.pump_beam` (2 x 3) | sliced | The broken beam pumping engine |
| `prop_ore_cart` | `cg.ore_cart` | 64 x 64 | Ore cart on rails |
| `prop_tin_crate` | `cg.tin_crate` | 64 x 64 | A crate stencilled with marks, no lettering |
| Hollowmere-only spots | see 3.6 | | |

**`props_blackpine`:**

| Frame | Used by | Art cell | Look |
|---|---|---|---|
| `prop_bell` | `bc.bell` | 64 x 128 | The shift bell: an iron bell under a pole gallows |
| `prop_oven` | `bl.stove` | 64 x 96 | The bunkhouse's iron range |
| `prop_basin` | `bl.basin`, `bf.trough` | 64 x 64 | A wooden water trough |
| `prop_trestle#0_0`..`#2_1` | `bc.trestle` (3 x 2) | sliced | The broken trestle, a lantern hanging from a snapped beam |
| `prop_flume` | `bc.flume` | 64 x 96 | Plank flume on trestle legs |
| `prop_mess_table#0_0`..`#5_1` | `bl.mess_table` (6 x 2) | sliced | Long mess table with benches |
| `prop_bunks_n#..`, `prop_bunks_s#..` | `bl.bunks_n`, `bl.bunks_s` (7 x 2 each) | sliced | A row of two-tier bunks (identical art, both names) |
| `prop_pegs` | `bl.pegs` | 64 x 96 | Coat pegs with coats and a lamp |
| `prop_head_saw#0_0`..`#2_1` | `bs.head_saw` (3 x 2) | sliced | The head saw on its carriage rails |
| `prop_gearing` | `bs.gearing` | 64 x 112 | Wooden gear train from the waterwheel |
| `prop_plank_stack` | `bs.plank_stack` | 64 x 80 | Stacked sawn planks |
| `prop_kiln_0#..`, `prop_kiln_1#..` | `bw.kiln_*` (2 x 2 each) | sliced | Brick charcoal kiln, its vents glowing |
| `prop_tally_board` | `bm.tally_board` | 64 x 96 | Shift tally board with chalk marks (strokes, no names) |
| `prop_powder_kegs` | `bm.powder_kegs` | 64 x 64 | Powder kegs |
| `prop_ore_cart_0` | `bm.ore_cart_0` | 64 x 64 | Ore cart on rails |
| `prop_shelves` | `bo.shelves` | 64 x 112 | The company store's near-empty shelf |
| `prop_ledger_desk` | `bo.ledger_desk` | 64 x 80 | Desk with the payroll ledger open at a torn page |
| `prop_safe` | `bo.safe` | 64 x 80 | Iron safe |
| `prop_map_table#0_0`..`#1_1` | `bo.map_table` (2 x 2) | sliced | Table with a survey map |
| `prop_telephone` | `bo.telephone` | 64 x 96 | Wall telephone, its cord cut |
| `prop_forge#0_0`..`#2_0` | `bf.forge` (3 x 1) | sliced | Forge hearth glowing, bellows, hood |
| `prop_anvil` | `bf.anvil` | 64 x 64 | Anvil on a stump |
| `prop_tool_rack` | `bf.tool_rack` | 64 x 112 | Tongs and hammers on a rack |
| `prop_refuge_table` | `bd.refuge_table` | 64 x 80 | A rough table with a dead man's lamp still burning |
| `prop_tin_crate` | `bd.tin_crate` | 64 x 64 | As Hollowmere's |
| Blackpine-only spots | see 3.6 | | |

Neither map needs `prop_teachingClue` (SPRITES 10.13: nothing is drawn for it; the clue art shows it).

### 3.6 Spots: `spot_<variant>`

One frame per variant, in `props` when both maps use it and otherwise in its map's atlas. Furniture spots draw the
furniture (`spot_underBed` is a bed). Floor spots (`bog`, `sump`, `pool`, `dumpSpot`) are ground features in a
64 x 48 cell.

| Atlas | Variants |
|---|---|
| `props` | `wardrobe`, `behindCounter`, `underBed`, `crawlspace`, `brush`, `hollowTree`, `timberCrib`, `sump` |
| `props_hollowmere` | `cratePile`, `cryptNiche`, `dumpSpot`, `hayPile`, `poolNiche`, `trunk`, `atticHatch`, `cart`, `confessional`, `crates`, `curtain`, `hedge`, `herbLoft`, `kegStack`, `pantry`, `stalagmite`, `wineRack`, `hollowLog`, `reeds`, `bog`, `charcoalPit`, `oreChute` |
| `props_blackpine` | `oreBin`, `logPile`, `barrel`, `woodBox`, `rootCellar`, `sawdustPile`, `logChute`, `pool`, `oreCart`, `oldStope`, `strongroom`, `coalBin`, `bunk`, `orePillar` |

`tools/sprites/test/props.test.ts` reads every scene of both maps. With the lookup above, it asserts that every
prop kind other than `decor` and `teachingClue`, every decor id tail, every spot variant and every portal face
resolves to a frame.

### 3.7 Portals (in `props`)

**Frames** (SPRITES 10.12):

- `portal_<kind>_<s|e|sill>` for `door`, `stairs`, `crawl`, `cave_mouth` and `forest_gate`;
- `portal_hatch` and `portal_drop`;
- `portal_boarded_<s|e|sill>`;
- 20 frames in all.

**Why the frames are theme-neutral.** A full frame fills its tile with the door and its posts, so no wall material
shows, and one set serves plaster and log walls alike.

| Kind | `_s` / `_e` | `_sill` |
|---|---|---|
| `door` | stained oak door with iron straps in a dark timber frame, full height | a threshold plank and a mat |
| `stairs` | a stair flight climbing into the back wall, with a rail | the top step showing |
| `crawl` | a low hatch at the wall's foot | a gap in the sill |
| `cave_mouth` | a dark rock arch with a timber lintel | a rock lip |
| `forest_gate` | a wooden stile between two posts with a gap in the trees | a stile |

- `portal_hatch` is a trapdoor in the floor. `portal_drop` is a broken edge with a dark drop below.
- `portal_boarded_*` is two nailed planks across the opening, drawn over the frame, or over building art for a closed
  building door.

### 3.8 Clues (`clues`, display scale)

The 21 keys stay, and one triple is added. Total 24 frames, one 512 x 512 page.

- **The 15 ground decals** (footprints 9, smear, print, fur, claw, drag; SPRITES 8) keep `TileCam` and their 64 px
  cells, re-finished: snapped to the world palette, with alpha 0 or 255. The client projects them (SPRITES 10.5).
- **The three vertical objects** (thread x3, felt x3, the wet bucket) re-render by IsoCam at display scale. They are
  finished at half size, doubled with nearest scaling, and stay centred in 64 px cells.
- **New `clue_footprint_<s|m|t>_glow`** (3): Hunger's glowing footprints (`ClueKind.hungerPrints`, `deck-data.md`
  section 5), one per height. The footprint is drawn in the moon ramp's light steps with a one-pixel `#7FA8FF` rim:
  a cold glow that no lantern pool or blood mark can be mistaken for. 5I or 5G draws them like footprints; the key
  goes in SPRITES 8's clue table.

### 3.9 Thumbnails, ambient loops and style boards

**Thumbnails `thumb_hollowmere`, `thumb_blackpine`.**

- `build_thumbs.py` assembles the hub scene in Blender from its scene file: ground, kit, buildings, props and lights
  as emissive spheres.
- It renders that through IsoCam framed on the hub at night, then finishes it to a 160 x 90 art grid, scaled x3 to
  480 x 270, as lossless WebP. With the main finish off, the render is box-resized to 480 x 270 and written at
  `pixelFinish.offWebpQuality` (90).

**Ambient loops `amb_village`, `amb_house`, `amb_forest`, `amb_cave`.**

- CC0 loops from Kenney or Freesound (CC0 filter), 30-45 s, mono, -18 LUFS, Vorbis q5, the first 2 s crossfaded onto
  the tail, as Session Y did.
- One CREDITS row each. They go in `audio/manifest.json` with gain 0.6. `ambient` stays the fallback (SPRITES
  10.13).

**Style boards** (T2, concepts only, never shipped). Two of each guide the modelling and lighting of each set.

| Board | Subject |
|---|---|
| `harbour-square` | The square of Hollowmere, a fog-bound Cornish harbour hamlet in autumn 1931, at night: granite cobbles around a timber-framed meeting bell and a stone well pump, four iron lantern posts throwing warm pools, plaster-and-slate cottages with lit windows, a tarred net loft and the dock beyond, sea fog rolling in cold blue |
| `harbour-tavern` | The Drowned Lantern's bar room as a cutaway room: a long oak bar with kegs, a stone hearth blazing, two oil lamps, low beams hung with nets and floats, scuffed floorboards, plaster over brick, empty tables with tankards |
| `gallows-wood` | Gallows Wood at night: a trail two tiles wide through dense oaks and silver birches, bracken and fallen leaves, a small clearing in moonlight, a lantern on a gate post at the wood's edge |
| `flooded-gallery` | Vane's flooded tin gallery: timber cribs and wet granite, a broken beam pumping engine under a shaft of grey daylight, black water glowing faint teal with mould, an ore cart on rails, one oil lamp |
| `blackpine-camp` | A 1931 logging camp in a black-pine valley at night: a long log bunkhouse with a porch, a plank sawmill with a waterwheel, a yard with a shift bell under a pole gallows and a pump, lantern posts, mud and sawdust, a cliff with a timbered mine adit behind |
| `blackpine-workings` | The Blackpine tin workings: a timbered adit with tram rails, an ore chamber lit by candles stuck to the rock and one lamp by a chalked tally board, powder kegs, rust ore streaks in grey rock |

Boards are R3 concepts with CREDITS and MANIFEST rows like any generation, saved to
`assets/source/review/boards-<name>.png` at 960 px wide for the PR. The raw generations stay in the library.

### 3.10 Gate A: the world test renders, pixel finish on and off (ruling F15)

`review-world.ts` composites a Hollowmere square vignette at game scale (zoom 1 and 2) by the SPRITES 10 projection:

- the ground (cobble, grass, path, with blends), kit walls, a tree line, boulders and a fence;
- the tavern's slices, the bell, the pump and two lantern posts;
- 5L's `baker` look idling in 8 directions, or the plain base body (`villager`, rendered for review only) if `baker`
  is not packed yet;
- a day frame and a night frame with a simulated darkness layer and the lantern pools.

It composites the vignette twice from the same raw renders: once finished with the switch on (`pixel --finish on`,
nearest filtering) and once with it off (`pixel --finish off`, the rig's own shading and colours, partial alpha,
linear filtering). Nothing else differs: same rig, camera, lights, scene, sizes and texture budget.

Output: `assets/source/review/gate-a-world-on.png` and `assets/source/review/gate-a-world-off.png`. They go to the
owner with PR K2 (section 7), and the answer sets `style.json` `pixelFinish.enabled.main`.

### 3.11 PR plan

| PR | Content | Code (estimate) |
|---|---|---|
| K1 | Packs fetched and licence files saved; `kit_import.py`; `build_ground.py`; `tileset.ts`; `iso_ground_harbour` and `iso_ground_timber`; `placeholder-world.ts` (ground); tests | ~350 lines |
| K2 | `build_kit.py`; both kits; `review-world.ts`; the two Gate A renders (finish on and off); tests | ~300 |
| K3 | `props`, `props_hollowmere` (with the bakery frames, 3.5); spots, portals; clues (re-finish, three re-renders, the glow triple); `props.test.ts`; `props` and `clues` leave `LEGACY` | ~380 |
| K4 | `build_buildings.py` recipes; the AOV slice pass; `slice.ts`; `bld_hollowmere`; `bld_*_ext` removed from both manifests and from `LEGACY` | ~380 |
| K5 | `props_blackpine`; `bld_blackpine` | ~250 |
| K6 | Thumbnails; ambient loops; style-board review sheets; the six `tiles_*` keys removed from both manifests and from `LEGACY` once 5J's isometric tilemaps have landed; `legacy.test.ts` asserts `LEGACY` is empty (K6 integrates after L4, L5 and M1); ASSETS 6.3 and SPRITES 8 text; `save_masters.py` for the environment `.blend`s | ~200 |

K1-K3 can start before Gate A is answered. Their art merges after it.

---

## 4. Session 5L: characters

### 4.1 PR L1, first: the IsoCam rig

- **`rig_common.py`:** `CAMERA_TILT_DEG = 60`, `CAMERA_YAW_DEG = 45`, the display-scale constants (90.51 px/m,
  `CELL_PX = 128`, `FEET_ROW_PX = 112`, `CLIP_CELL = {"die": (256, 128)}`), `Z_SCALE = 0.75`, the turntable rule
  `turntable_z(i) = radians(45 - 45 * i)`, `V1_CLIPS = {"idle": 8, "walk": 8, "swing": 6, "interact": 8, "die": 8}`
  and `PASSES = ("body", "scarf", "blood")`.
- **`build_rig.py`:**
  - builds `IsoCam` beside `TileCam`; `SpriteCam` is removed;
  - adds the two root empties, environment (1, 1, 0.75) and character (0.75, 0.75, 0.75);
  - keeps the lights;
  - re-measures the toon ramp stops (S5.3).
- **`palettize.py`:** snaps to the world palette, and takes light and shadow tones from ramp neighbours.
- **The calibration sheet** is re-rendered under IsoCam and finished: the cube in 8 directions with its facing
  marker, one 1 m tile diamond, one `die` frame. The test asserts that the `n` frame's marker points screen-up.
- **Tests:** `test_rig_common.py` covers the new constants and turntable. `palette.test.ts` and `budget.test.ts` are
  new. Both read the pre-seeded `LEGACY` allowlist (1.7), and `palette.test.ts` reads the switch, so L1 passes
  against today's art.

L1 is small (~250 lines) and opens first, because every render of 5K and 5L needs IsoCam. 5K models and fetches
until it lands.

### 4.2 The base body and the clips (PR L2)

`build_looks.py` builds every look from one base, so all looks share proportions, the armature, the clips and the
`Feet` pivot.

**Base body.**

- 1.7 m and five heads tall: a 0.34 m head, shoulders 0.42 m, hips 0.32 m, the crotch at 0.85 m, hands 0.17 m,
  boots 0.26 m.
- Chamfered boxes and tapered cylinders, 2,000-3,000 triangles, flat-shaded.
- Parts carry `wdi_part`: `body`; `scarf` (every character wears the storm scarf, GDD 3.1, as a neck wrap with a
  short tail); `blood` (a 3 mm inflated torso and hands shell).

**Armature.** 22 bones: root, hips, spine, chest, neck, head, clavicle, upper arm, forearm and hand on each side,
thigh, shin and foot on each side, and two prop bones (hand.R and hand.L children).

**Clips**, keyed in code at 24 fps and sampled to 12 fps:

| Clip | Frames | Loop | Motion |
|---|---|---|---|
| `idle` | 8 | yes | breathing, a slow weight shift |
| `walk` | 8 | yes | two steps of 0.5 m stride; arms swing; the foot stays within 8 art px below the feet row |
| `swing` | 6 | once | wind-up, a forward-down strike of the right hand, recovery; generic, never role-specific |
| `interact` | 8 | yes | one of three bases, chosen per look: `kneel` (kneels on one knee, hands working at the ground), `waist` (hands working at waist height, head bowed), `raise` (one arm raised high, peering) |
| `die` | 8 | once, hold the last frame | knees buckle, a fall to the back-left, spread-eagled last frame (it reads from all 8 directions) |

**Rendering.** `batch_render.py --char <look>` renders body, scarf and blood under the character root at display
scale, 128 px cells (`die` 256 px). The pixel CLI finishes them to 64 px (`die` 128 px) and halves the pivots, with
the finish on or off as the switch says (1.8).
`pack.ts` packs `char_<lookId>` and `ovl_<lookId>`, and `gen-anims.ts` writes `anims_<lookId>`.

**The villager** is the plain base (4.3), without hat passes. The `hat_cap` and `hat_bowler` passes are gone: hats
show as nameplate glyphs (GDD 3.1, `deck-data.md`). Session 5F's `EntityView` stops drawing them.

In round 5 every seat has a look and no figure exists that is not a seat (round 6 brings mobs), so the villager
loads only with `?art=placeholder` (ruling C11):

- PR L2 renders the plain base under IsoCam as `villager` for `looks.test.ts`, the review sheets and the Gate A
  fallback, and ships it in no real manifest. `placeholder-chars.ts` keeps the placeholder manifest's greybox
  `char_villager`, `ovl_villager` and `anims_villager` (moved there by the pre-seed, 1.2).
- The 40° real villager stays in the real manifest, on the `LEGACY` list, until every world look is packed. PR L4
  then removes `char_villager`, `ovl_villager` and `anims_villager` from the real manifest, deletes their files
  under `chars/` and deletes their `LEGACY` lines.
- The budget of 1.4 does not count the villager.

### 4.3 One character per look (`looks.json`, 13 looks, plus the villager)

**How to read the table.**

- `base`, `second` and `accent` are `looks.json`'s palette tokens. They name ramps (S3.2): `mustard` names
  the brass ramp.
- Skin is the mid step of three neighbouring skin steps, numbered 1-4 from dark to light.
- Silhouettes and notes are the deck catalogue's. The columns add what the build needs.
- Five women and five men among the world looks.
- The cover cards are portrait-only (no world body, no turnaround).

| Look | Body | Base / second / accent | Skin, hair | Costume parts (`look_parts.py`) | Carried prop | `interact` |
|---|---|---|---|---|---|---|
| `detective` | world | fog / ink / lantern | 3; short ink bob | belted knee-length trench coat with the collar up; snap-brim fedora; gloves; trousers; boots | brass magnifier raised in the right hand, its lens a lantern glint | kneel |
| `doctor` | world | ink / bone / mustard | 4; fog whiskers | frock coat; bone waistcoat and shirt; round spectacles; short top hat; watch chain | black medical bag low in the left hand, brass clasp | kneel |
| `vicar` | world | ink / bone / mustard | 2; fog fringe | ankle-length cassock as one dark mass; bone collar band and cuffs; wide shovel hat | prayer book at the chest, bone pages, brass clasp | waist |
| `watchman` | world | slate / fog / lantern | 4; wood moustache | knee-length greatcoat; short fog shoulder cape; high collar; domed helmet; rattle on the belt | pole lantern held up in the left hand, its glass glowing in every frame | raise |
| `herbalist` | world | fog / bone / mustard | 3; bone wisps under the hood | hooded shawl, hood up; wide pocketed apron; herb bundles; satchel at the hip | two vial stoppers in brass at the belt | waist |
| `gamekeeper` | world | slate / fog / mustard | 3; wood beard | tweed shooting coat with a fog check; breeches; gaiters; deerstalker with the flaps tied up; game bag across the body | fowling piece slung barrel-up over the right shoulder (ink barrel, brass fittings, wood stock) | kneel |
| `lamplighter` | world | slate / bone / lantern | 1; cropped wood hair | short oilskin cape, hood down; bone shirt, sleeves rolled; trousers | long brass-hooked lighting pole at a forward slant, a small flame at its tip | raise |
| `baker` | world | bone / fog / mustard | 2; wood hair under the toque | tall pleated toque; long apron over a fog shirt and trousers; sleeves rolled; flour on the forearms | basket of loaves on the left hip, the crusts the brass accent (the peel would echo the lamplighter's pole) | waist |
| `fisher` | world | fog / ink / mustard | 4; bone beard | knee-length oilskin smock; ink sea boots; small mustard sou'wester | coil of net and a cork float over the left shoulder | waist |
| `tinner` | world | slate / fog / lantern | 1; ink plait | hard round felt hat with a candle in a clay lump (its flame the accent); leather jerkin; fog shirt; rolled trousers dusted with ore | short pick over the right shoulder | kneel |
| `killer` | portrait only | ink / slate / blood | unreadable | – | – | – |
| `accomplice` | portrait only | slate / fog / blood | half lit | – | – | – |
| `drifter` | portrait only | fog / slate / mustard | 3 | – | – | – |
| `villager` (not a card) | the plain base: review renders in round 5, placeholder only in the manifests (4.2) | fog / bone / – | 3; wood | plain jacket; bone shirt; slate trousers; bare head | none | waist |

**Hard rules for every world look.**

- The standing silhouette is at most 112 display px above the feet (56 art px), headgear and prop included.
- No look wears a flat cap or a bowler (the hat-trait names).
- Nothing on a look is blood, teal, moon or magenta, so the scarf tint stays the one saturated colour.
- `tools/sprites/test/looks.test.ts` asserts:
  - `looks_spec.py`'s world look ids equal the `looks.json` looks with a non-null `bodyAtlas`, plus `villager`;
  - every `char_<lookId>` atlas of the real manifest holds 304 frames with the five clips in 8 directions;
  - every `ovl_<lookId>` holds `scarf/` and `blood/` for the same frames;
  - the pivots of the three passes match.

**Concept turnarounds (T3)**, one per world look, made before the look is modelled. The picked turnaround is the
modelling reference and the T4 reference for its portrait.

| Look | T3 subject |
|---|---|
| `detective` | the Detective, a sharp woman in her forties from the mainland: a fog-grey trench coat belted tight with the collar turned up, a dark snap-brim fedora over a short dark bob, dark gloves and trousers, black boots, a thin storm scarf at the neck, a brass magnifying glass in her right hand; 1931 |
| `doctor` | the Doctor, a stout man in his fifties with grey whiskers and round spectacles: a black frock coat over a cream waistcoat and shirt, a short black top hat, a gold watch chain, a thin storm scarf, a black medical bag with a brass clasp held low in his left hand; 1931 |
| `vicar` | the Vicar, an old man with a grey fringe round a bald crown: an ankle-length black cassock, a white collar band and cuffs, a wide shovel-brimmed black hat, a thin storm scarf, a small prayer book with a brass clasp held at his chest; 1931 |
| `watchman` | the Watchman, a moustached man in his forties: a knee-length slate-grey greatcoat with a short grey shoulder cape and a high stiff collar, a domed watchman's helmet, a wooden rattle on his belt, a thin storm scarf, a lit lantern on a tall pole held up in his left hand beside his head; 1931 |
| `herbalist` | the Herbalist, an old woman with wisps of white hair: a hooded grey shawl with the hood up, a wide cream apron with many pockets hung with dried herb bundles, a satchel at her hip, two small vials with brass stoppers at her belt, a thin storm scarf; 1931 |
| `gamekeeper` | the Gamekeeper, a bearded man in his fifties: a slate tweed shooting coat with a grey check, breeches and leather gaiters, a deerstalker with the ear flaps tied up, a game bag across his body, a thin storm scarf, a long fowling piece slung barrel-up over his right shoulder; 1931 |
| `lamplighter` | the Lamplighter, a young woman in her twenties with cropped brown hair: a short slate oilskin cape with the hood down, a cream shirt with rolled sleeves, slate trousers, a thin storm scarf, a long brass-hooked lighting pole carried at a forward slant over her right shoulder with a small flame at its tip; 1931 |
| `baker` | the Baker, a woman in her thirties: a tall pleated white toque over tied-back brown hair, a long cream apron over a grey shirt and trousers, sleeves rolled, flour on her forearms, a thin storm scarf, a wicker basket of golden loaves on her left hip; 1931 |
| `fisher` | the Fisher, an old man with a white beard: a knee-length grey oilskin smock, tall black sea boots, a small mustard sou'wester, a thin storm scarf, a coil of net with a cork float over his left shoulder; 1931 |
| `tinner` | the Tinner, a woman in her thirties with a dark plait: a hard round felt hat with a lit candle stuck to its front in a lump of clay, a slate leather jerkin over a grey shirt, rolled trousers dusted with ore, a thin storm scarf, a short miner's pick over her right shoulder; 1931 |

### 4.4 Building and checking a look (PRs L3, L4)

For each look, in order:

1. T3 concept: pick one of the two.
2. `look_parts.py` parts in `looks_spec.py`.
3. `build_looks.py --look <id>`, then save the master with `save_masters.py`.
4. Render the three passes, finish, pack.
5. Review sheets.

**Review sheets.**

- `looks-contact-<id>.png`: every clip in 8 directions at 2x, the scarf tinted moon.
- `looks-lineup.png`: all world looks side by side in `s` and `ne` idle at 1x and 2x, with each scarf tint.
- `looks-silhouettes.png`: the lineup filled solid ink. Every look must be told apart by shape alone.

**Order.**

- L3: `baker` first (it is Gate B's), then `detective`, `doctor`, `vicar`.
- L4: `watchman`, `herbalist`, `gamekeeper`, `lamplighter`, `fisher`, `tinner`.

### 4.5 Portraits (PR L5): `portrait_<lookId>`, 13

Each is a T4 portrait: 2:3, finished to 128 x 192 art, x3 to 384 x 576, lossless WebP in
`apps/client/public/assets/portraits/`.

**References.**

- World looks: the look's picked turnaround, both `style.json` portrait figures and one room image (the cellar for
  a dark backdrop, the mixer for a warm one).
- Cover cards: the two portrait figures and the cellar.

**Rules for the cover portraits** (deck catalogue): blood may be the accent. Nothing echoes a world look's headgear
or prop, so no portrait hints at a cover.

| Look | Subject | Backdrop |
|---|---|---|
| `detective` | the Detective of 4.3, raising the magnifying glass to one eye, a sceptical half-smile | a fog-bound harbour quay at night with a gas lamp and a coil of rope |
| `doctor` | the Doctor of 4.3, opening his bag, spectacles catching the light | a surgery shelf of bottles under an examination lamp |
| `vicar` | the Vicar of 4.3, reading from the prayer book, head bowed | a chapel corner with a rack of candles and a moonlit lancet window |
| `watchman` | the Watchman of 4.3, lifting the pole lantern to peer into the dark | a lane corner at night with a lantern post and wet cobbles |
| `herbalist` | the Herbalist of 4.3, grinding in a mortar at her waist | drying herbs hung from loft beams under a green-shaded lamp |
| `gamekeeper` | the Gamekeeper of 4.3, gun on his shoulder, looking off to one side | the edge of a wood at night with a lantern on a gate post |
| `lamplighter` | the Lamplighter of 4.3, reaching the pole up to a lamp | an iron lantern post at dusk, its lamp just catching |
| `baker` | the Baker of 4.3, basket on her hip, flour on her cheek | the glowing mouth of a bread oven |
| `fisher` | the Fisher of 4.3, mending the net in his hands | a dock at night with nets and a lantern on a bollard |
| `tinner` | the Tinner of 4.3, the candle on her hat lit, pick on her shoulder | the timbered mouth of a tin mine lit by candlelight |
| `killer` | a figure in a long dark coat and a wide flat-brimmed slouch hat that keeps the face in shadow with no eyes visible, a lantern rim light along the jaw, a knife held low behind the back with only its edge catching red light | a narrow wet alley at night, one hanging lantern far behind |
| `accomplice` | a figure half turned away in a slate coat, face half lit, a crowbar tucked under one arm and a spool of red thread in one hand, ink-stained cuffs, a paper stencil of a footprint poking from a pocket | a half-open back door with lamplight beyond |
| `drifter` | a grinning wanderer in a patched travelling coat with mustard patches, a bindle on a stick over one shoulder, a plainly wooden knife in the belt | a roadside milestone at dusk under a darkening sky |

Review sheet: `portraits-main.png` (all 13 at 1x). Gate B pairs `portrait_baker` with the `baker` contact sheet
(section 7).

### 4.6 VFX and icons (PR L5)

**`vfx`** (display scale, one 512 x 2048 page, `anims_vfx`). The keys and frame counts are SPRITES 8's.

- `vfx_blood_pool` (8 f, `TileCam` decal) and `vfx_vote_stamp` (10 f, UI) are re-finished.
- `vfx_blood_splat` (12 f) and `vfx_dust_step` (6 f) re-render by IsoCam.
- **New `vfx_disguise`**, 8 f, 128 px display cell, pivot at the feet. A puff of fog and ink smoke rises from the
  feet to head height, a single mustard spark turns in it, and it thins to nothing by frame 7. It plays only where a
  Knife strike drops a disguise: the server sends `vfx` only from `handleKill`, and a face changes unseen otherwise
  (ruling X3, `deck-data.md` section 9). It is drawn in code by `build_vfx.py`.

**Icons**, 48 px SVG under the SPRITES 9 rules: tokens only, a 2 px ink stroke, no text. Each key is
`icon_ability_<abilityId>` with the ability id in lower case (ruling C15). `icons.test.ts` gains the six keys.

| Key | Meaning | Drawing |
|---|---|---|
| `icon_ability_impersonate` | Killer: Impersonate | two overlapping head-and-shoulder outlines, the front one fog and the back one ink, a mustard spark between them |
| `icon_ability_confession` | Vicar: Hear Confession | a confessional grille with a bone ear-shaped curve behind it |
| `icon_ability_keepwatch` | Watchman: Keep Watch | a pole lantern, lantern glass, beside an open eye |
| `icon_ability_remedy` | Herbalist: Remedy | a stoppered bottle with a moon cross |
| `icon_ability_poison` | Herbalist: Nightshade (ability `poison`) | a stoppered bottle with three ink berries on a sprig |
| `icon_ability_lastshot` | Gamekeeper: Last Shot | a fowling piece's barrel end under a blood ring of crosshairs |

### 4.7 PR plan

| PR | Content | Code (estimate) |
|---|---|---|
| L1 | IsoCam rig, the calibration sheet, `palettize.py` on the world palette, `palette.test.ts`, `budget.test.ts` | ~250 lines |
| L2 | The base body, armature and five clips in `build_looks.py`; `looks_spec.py`; the plain base rendered as `villager` for review (not shipped, 4.2); `keys.ts` and `pack.ts` for three passes and `swing` + `interact`; `placeholder-chars.ts` for every look key (the placeholder villager stays) | ~380 |
| L3 | Concepts (10 turnarounds); `look_parts.py`; baker, detective, doctor, vicar; `looks.test.ts`; `lineup.ts`; `portrait_baker`, made early for the Gate B sheet | ~380 |
| L4 | watchman, herbalist, gamekeeper, lamplighter, fisher, tinner; the real `char_villager`, `ovl_villager` and `anims_villager` leave the real manifest and `LEGACY` (4.2) | ~250 |
| L5 | The other 12 portraits; `vfx` re-render and `vfx_disguise`, and `vfx` leaves `LEGACY`; 6 icons; ASSETS 6.2 and 6.3, SPRITES 1-4, 6 and 9 | ~300 |

---

## 5. Session 5M: ONUB art

### 5.1 The 13 owner images

**What is already done.** The masters are committed in `assets/source/concepts/onub/`, with MANIFEST rows and a
CREDITS row waiting for the tool's name (A49).

**What `tools/sprites/onub.ts` does to each image:**

1. Crop to 16:9: x 10 to 2566, the full height (2556 x 1438).
2. Apply `onub-fixes.json`:
   - polygon fills for any garbled label still legible at the art grid;
   - the proofing figure clean-up (5.2).

   At 640 x 360 the small labels ("YERST", "BEHSY") fall below legibility, so the file is expected to hold only the
   proofing entry. 5M checks every finished room at 1x and lists any exception.
3. `finishIllustration` to 640 x 360 art: box resize, snapped to the world palette, no outline (the rooms are not
   cutouts).
4. Scale x3 to 1920 x 1080 and write lossless WebP to `apps/client/public/assets/onub/rooms/`.

A trial of this pipeline on four of the images was made in the orchestrator's study folder (the evidence stays with
the orchestrator). The 13 come to about 0.67 MB in all,
against 1.5 MB for photo-quality WebP at 1600 x 900.

| Source | Key |
|---|---|
| `station_fridge.jpg` | `onub_station_fridge` |
| `station_mixer.jpg` | `onub_station_mixer` |
| `station_proofing.jpg` (cleaned, 5.2) | `onub_station_proofing` |
| generated (5.3) | `onub_station_oven` |
| `scene_cellar.jpg` | `onub_scene_cellar` |
| `scene_sub_basement.jpg` | `onub_scene_subBasement` |
| `scene_shaping_bench.jpg` | `onub_scene_shapingBench` |
| `scene_command_desk.jpg` | `onub_scene_commandDesk` |
| `scene_expediter.jpg` | `onub_scene_expediter` |
| `scene_lamination.jpg` | `onub_scene_lamination` |
| `scene_cold_pantry.jpg` | `onub_scene_coldPantry` |
| `scene_dish_pit.jpg` | `onub_scene_dishPit` |
| `scene_hygiene.jpg` | `onub_scene_hygiene` |
| `scene_front_of_house.jpg` | `onub_scene_frontOfHouse` |

**What stays as drawn.**

- The legible baked signs: "La Chambre Froide", the role chalkboards, "Lavez vos mains". The DOM still writes every
  name. If Session 5A or 5B renames a role, 5M blanks its chalkboard with a polygon fill sampled from the board.
- The figures in the expediter and hygiene scenes. Those are night scenes that only the role's holder sees.

### 5.2 The proofing figure

The baker at the cabinet (source box x 1680, y 570, 190 x 350) comes out. During prep no other player is ever shown,
and a baked figure reads as someone else in the room.

1. `onub.ts` writes a mask: a white polygon over the figure, traced inside that box, on black, 2576 x 1438.
2. The edit uses the connector's mask-capable image model (`models_explore`, "inpaint with a mask"), with the image
   and the mask as references. The prompt is:

   > Remove the baker standing at the right of the proofing cabinet. Continue the cabinet's side and its pulled-out
   > drawer, the stacked wooden trays, the plaster wall and the terracotta floor where he stood, matching the
   > surrounding pixel art exactly. Change nothing outside the masked area.

   It is followed by the formula and the avoid clause.
3. The picked result is a new master: a Generated row that cites the owner image it derives from. It then goes
   through 5.1 from step 3.
4. If two attempts fail, the original ships with the figure, and the owner decides at Gate C.

### 5.3 The Brick Oven: `onub_station_oven`

**Settings.** T1, 16:9, count 4. Extra references: `station_fridge.jpg`, `station_mixer.jpg` and
`station_proofing.jpg`, with `scene_cellar.jpg` dropped so there are at most four.

**Subject:**

> Le Four à Pain, the brick bread-oven room of a Paris bakery's night shift: a large domed brick oven built into the
> back-right wall, its arched iron-framed mouth glowing orange from a wood fire inside, a long wooden baker's peel
> leaning beside it, split oak firewood stacked in a wall niche and in a wicker basket, a brass steam-injection valve
> with copper pipes and a round pressure gauge on the wall, loaves cooling on a wooden rack, flour sacks, a worn
> terracotta tile floor dusted with flour and ash, chipped plaster over brick on the back-left wall with a bare bulb
> hanging from a cord, a blank dark chalkboard on an easel; the oven's firelight is the main warm light and cold blue
> night falls in the far corners; no people.

**The owner's pick.** The four candidates go to the owner as `assets/source/review/gate-c-oven.png`: 2 x 2,
pixel-finished, beside the three finished stations. The pick goes through 5.1 from step 3. Until then the key draws
the labelled greybox (contract 5.4).

### 5.4 The kitchen overview: `onub_kitchen`

The overview is a composite, not a generation, so its four rooms are exactly the rooms the player then enters.

- **Canvas.** 640 x 360 art in four quadrants of 320 x 180:
  - top-left `fridge`, top-right `mixer`;
  - bottom-left `proofing`, bottom-right `oven`;
  - the order of the rooms around the pass.
- **Rooms.** Each is its source (the oven: the picked generation) cropped to 16:9 and box-resized straight to
  320 x 180, then snapped.
- **The pass.** A T5 cutout, finished to a 96 x 64 art box and centred at (320, 180).

  > the pass of a bakery kitchen: a short stainless-steel counter with a brass ticket rail of blank order tickets, a
  > hanging red heat lamp, and a brass service bell

- **Output.** x3 to 1920 x 1080, lossless WebP.
- **Contract for 5C.** Each quadrant of `onub_kitchen` is that station's tap target. The station names come from
  the DOM.

### 5.5 Cards and the cloche

**The card template** (`onub-cards.ts`, R5, code-drawn): an 80 x 112 art grid, x3 to 240 x 336, lossless WebP in
`onub/cards/`.

- **Border and frame.** A 1 px ink border, then a 3 px frame in the station's ramp: fridge `moon`, mixer
  `plaster`, proofing `brass`, oven `brick`.
- **Sabotage cards** take a `moss`-ramp frame with a 6-pixel crack and a rot blot at the top-right corner. After
  prep the piles are face up, so the difference is public by design.
- **The window**, (4, 4) to (76, 68), 72 x 64:
  - an Ingredient card shows its object cutout centred on a darkened crop of its station's floor;
  - a Location card shows the station room.
- **The text band**, (4, 72) to (76, 108), 72 x 36: bone-ramp paper (`#D9D2C2`) with a 1 px `#B2AA99` rule at the
  top. It is left blank: 5C draws the card's name in Oswald and its text in Inter from `balance.onub.json` `cards`.

**Ingredient cards `onub_card_<cardId>`, 18.** T5 objects, each finished to a 56 x 48 art box.

| Card | Station | Kind | T5 subject |
|---|---|---|---|
| `pureDairy` | fridge | good | a wooden crate holding a dented milk churn and a block of cold butter in paper |
| `activeYeast` | fridge | good | a glass jar of pale wild yeast bubbling with a cloth tied over its neck |
| `spoiledMilk` | fridge | sabotage | a milk bottle of lumpy, curdled milk with a greenish tinge and a cracked cap |
| `unpasteurizedMold` | fridge | sabotage | an earthenware cream pot with a fuzzy green bloom spilling over the rim |
| `thermostat` | fridge | sabotage | a frosted wall thermostat with its lever flipped to warm and frost cracking off it |
| `t55Flour` | mixer | good | a fat flour sack, its top rolled down, a wooden scoop in fine white flour |
| `seaSalt` | mixer | good | a small wooden salt box heaped with coarse grey sea salt |
| `sawdust` | mixer | sabotage | a pile of pale sawdust with a rusty hand saw lying in it |
| `plaster` | mixer | sabotage | a tin scoop of crumbly white plaster with cracked chunks |
| `floorSweepings` | mixer | sabotage | a dustpan heaped with grime, hair, a button and a bent nail |
| `warmSteam` | proofing | good | a copper kettle with warm steam curling from its spout |
| `time` | proofing | good | a brass hourglass beside a round of dough rising in a banneton |
| `coldDraft` | proofing | sabotage | a proofing cabinet's glass door propped open a crack with icy breath curling in |
| `overProofing` | proofing | sabotage | a banneton of over-risen dough collapsing and spilling over its edges |
| `oakFirewood` | oven | good | a bundle of split oak logs tied with twine |
| `steamInjection` | oven | good | a brass steam valve with a copper pipe, a burst of white steam from its nozzle |
| `charcoalAsh` | oven | sabotage | a coal scuttle of grey charcoal ash with a little shovel |
| `wetWood` | oven | sabotage | a dripping wet log hissing grey smoke |

**Location cards `onub_loc_<stationId>`, 4.** Same frame, station ramp. The window is the station room: its source
(the oven: the pick) cropped to a 9:8 box around the room (`onub-fixes.json` lists each box), box-resized to
72 x 64, snapped.

**Card backs.**

- `onub_card_back_role`:
  - a wood-ramp parquet field (code), a 1 px brass inner border;
  - a centred emblem: a T5 cutout finished to 48 x 48 art. Subject: "a baker's emblem: a long wooden peel and a
    whisk crossed over a sheaf of wheat".
- `onub_card_back_loc`: a stone-flag field (code), with a brass glyph of four rooms round a square, all code-drawn.

**`onub_cloche`.** A T5 cutout finished to 64 x 64 art, x3 to 192 x 192. Subject: "a heavy cast-iron baker's cloche,
a squat dark dome with a ring handle on top and a dusting of flour on its rim".

### 5.6 ONUB portraits: `onub_portrait_<roleId>` (15) and `onub_baker`

Each is a T4 portrait: 128 x 192 art, x3 to 384 x 576, lossless WebP in `onub/portraits/`.

- **Extra reference:** the role's own night scene (`roles.onub.json` `scene`), so the backdrop matches the room the
  role wakes in.
- **Private use:** the own card and the own night scene.
- **Public use:** the game-over screen.

| Key | Night scene | Subject |
|---|---|---|
| `onub_portrait_boulanger` | shapingBench | Le Boulanger, the head baker, a broad man in his fifties in a tall white toque and a flour-dusted white jacket, lowering a heavy cast-iron cloche onto a floured bench with both hands |
| `onub_portrait_champignon` | cellar | Le Champignon, the Mold Spore, a hunched saboteur in a stained sackcloth apron and hood, face lost in shadow, pale green glowing mushroom caps sprouting from the hood and shoulders, crawling out from damp bricks |
| `onub_portrait_levain` | cellar | Le Levain, the Sourdough Starter, a pale devoted baker in a grey apron cradling a huge glass jar of sourdough that bubbles and foams over its rim in candlelight |
| `onub_portrait_apprenti` | subBasement | L'Apprenti, an exhausted young intern slumped on a wooden stool, sleeves rolled and flour on his cheeks, reading a clipboard of shift logs under a single hanging bulb |
| `onub_portrait_ratDeCave` | subBasement | Le Rat de Cave, a wiry figure in a patched jacket and a knitted cap prying up an iron floor grate with a bar, flour footprints trailing behind |
| `onub_portrait_commis` | hygiene | Le Commis, a line cook in a white double-breasted jacket and a long apron chopping onions, carrots and celery on a board at a steel prep table |
| `onub_portrait_chef` | commandDesk | Le Chef de Cuisine, a stern executive chef in a dark double-breasted jacket peering through a brass magnifying glass at personnel files under a green banker's lamp |
| `onub_portrait_aboyeur` | expediter | L'Aboyeur, the expediter in a black waistcoat over a white shirt holding up an order ticket under red heat lamps, a grainy green monitor glowing beside him |
| `onub_portrait_sousChef` | commandDesk | Le Sous-Chef, the second-in-command in a white chef's jacket slapping a brass desk bell with one hand and pointing across the kitchen with the other |
| `onub_portrait_tourrier` | lamination | Le Tourrier, the dough sheeter, flour to the elbows, feeding a block of buttered dough through heavy steel rollers |
| `onub_portrait_plongeur` | dishPit | Le Plongeur, the dishwasher in a rubber apron and long rubber gloves, surrounded by soapsuds and steam, balancing a teetering stack of sheet pans |
| `onub_portrait_gardeManger` | coldPantry | Le Garde Manger, the larder cook, rosy-cheeked and a little tipsy, a glass of red wine in hand among hanging cured hams and wheels of cheese |
| `onub_portrait_inspecteur` | hygiene | L'Inspecteur Sanitaire, a health inspector in a long dark coat and tie, a clipboard in one hand, a probe thermometer and a small torch in the other |
| `onub_portrait_croissant` | frontOfHouse | Le Croissant Rassis, a single stale croissant, rock-hard and cracked, alone on a doily inside an ornate wood-and-glass pastry case under one dramatic spotlight (`replace`: "one person" -> "one pastry", "behind them" -> "behind it", "their place" -> "its place") |
| `onub_portrait_critique` | frontOfHouse | Le Critique Gastronomique, a gaunt food critic in an evening suit at a candlelit table behind a velvet rope, fountain pen poised over a notebook beside an empty plate |
| `onub_baker` | station_mixer | an ordinary night-shift baker in a white toque and apron, face in soft shadow and unreadable, standing in a doorway of warm light, nothing that marks a role |

Review sheet: `onub-portraits.png`. Gate C includes `onub_portrait_boulanger` (section 7).

### 5.7 The mini-game atlas: `onub_mini` (an addition to contract 5.4)

The four mini-games (5C, `view/onub/minigames/*`) are drawn over the station room at the room's own pixel size, so
their sprites are an atlas packed at art size and drawn at `style.pixel.illustrationScale` (3) with `nearest`. It is
one 512 x 512 page in `onub/onub_mini.json`, loaded at ONUB match start.

**How the frames are made.**

- Generated objects are T5 cutouts finished to the art box.
- Dials, needles, fills, streams and glows are code-drawn (R5), so they are exact.
- The fire loop is the oven mouth with its flame pixels cycled through the lantern ramp (R5 over R3).

The client draws every band at a random height (GDD 3.11), so no art carries one.

| Mini-game | Frame | Art box | Made by |
|---|---|---|---|
| crates (fridge) | `mini_crate_butter`, `mini_crate_milk`, `mini_crate_eggs` | 24 x 18 | T5: a wooden crate of butter blocks; of milk bottles; of eggs in straw |
| | `mini_cart` | 48 x 32 | T5: a low steel kitchen cart with two shelves |
| | `mini_dial` | 48 x 48 | code: a frosted round thermostat face with blank tick marks |
| | `mini_needle` | 4 x 20, pivot at the base | code: an ink needle with a brass hub (shared by `stoke`) |
| pour (mixer) | `mini_sack` | 28 x 32 | T5: a flour sack tipped to pour, its mouth at the top right |
| | `mini_bucket` | 24 x 24 | T5: a wooden water bucket tipped to pour |
| | `mini_bowl` | 64 x 48 | T5: the cutaway steel bowl of a spiral mixer. Its inner window, (8, 8) to (56, 44), is cleared by code for the fill |
| | `mini_fill_flour`, `mini_fill_water` | 8 x 8, tiling | code |
| | `mini_stream_flour`, `mini_stream_water` | 4 x 8, tiling | code |
| slide (proofing) | `mini_banneton` | 28 x 16 | T5: a round wicker banneton holding a ball of dough |
| | `mini_cabinet` | 72 x 88 | T5: the front of a warm-lit wooden proofing cabinet with four empty slots |
| | `mini_slot_glow` | 28 x 12 | code: a warm lantern-ramp glow for a slot |
| stoke (oven) | `mini_log` | 24 x 10 | T5: a split oak log |
| | `mini_oven/0`..`/3` (anim `mini_fire`, 8 fps, loop) | 72 x 48 | T5 `mini_oven` (an arched brick oven mouth with a wood fire inside), then the code fire loop |
| | `mini_gauge` | 48 x 48 | code: a round brass heat gauge with blank tick marks |

Until it lands, 5C draws labelled greybox rectangles of these sizes from `placeholder-onub.ts`.

### 5.8 Removals

- **Removed by 5M (M1):** `loft_backdrop`, `prop_bedroll` and `prop_bedroll_self` leave both manifests and the
  `LEGACY` list, with `assets/loft/**`, `placeholder/loft/**`, their stand-ins in `placeholder-onub.ts` and
  `tools/blender/build_loft.py` (ruling C12).
- **Moved to `props_hollowmere` by 5K (K3):** the bakery frames `prop_plate`, `prop_deadLoaf`, `prop_ledger` and
  `prop_wakeTable`. They are frames of the `props` atlas, not manifest keys, and the main-mode bakery draws them
  (3.5). ONUB contract 5.4 says the same (ruling C12).
- **Kept:** the audio `storm`, `creak`, `stamp` and `loaf_crack`.

### 5.9 PR plan

| PR | Content | Code (estimate) |
|---|---|---|
| M1 | `onub.ts`: the 13 images finished (`onub_station_fridge`, `_mixer`, every `onub_scene_*`); `onub-cards.ts` template, the location cards (the oven's waits) and both card backs (the emblem greybox until M3); `onub_kitchen` with a greybox pass and oven quadrant; the loft removal (manifests, files, `LEGACY` lines); manifests with `modes: ['onub']` on every key; `placeholder-onub.ts` for every key; `onub.test.ts`. The Gate C test render comes first: the finished fridge, the `t55Flour` and `sawdust` cards, `onub_cloche` and `onub_portrait_boulanger` | ~380 lines |
| M2 | The Brick Oven (4 candidates, owner pick, finish); the proofing clean-up; `onub_station_oven`, `onub_station_proofing`; the oven quadrant and location card; the pass | ~150 |
| M3 | The other 16 ingredient cards; the emblem; `onub-mini.ts` and `onub_mini` | ~350 |
| M4 | The other 14 role portraits and `onub_baker`; SPRITES 11; ASSETS 6.3 text | ~120 |

`onub.test.ts` asserts:

- every key of contract 5.4 plus `onub_mini` is in both manifests, with `modes: ['onub']` (ruling C7;
  `manifest.test.ts` checks the same for every `onub_*` key);
- every image has its size (1920 x 1080, 240 x 336, 192 x 192, 384 x 576);
- the ONUB set is ≤ 2.5 MB.

---

## 6. Order of work, seams and integration

**Order.**

- **Day one, in parallel:**
  - 5L opens L1 (IsoCam).
  - 5K fetches packs, saves licences and models the kit and ground.
  - 5M runs M1, which needs no rig, and the Higgsfield preflight.
- **When L1 lands:** 5K renders K1-K2, and 5L builds L2.
- **Gate renders** go to the owner as soon as each exists: A with K2, B with L3, C with M1, and the oven pick with
  M2.

**Integration order.** L1 first, then by PR number within each session, interleaved by readiness. An art PR whose
gate is unanswered waits. K6 integrates after L4, L5 and M1, because it asserts that the `LEGACY` list is empty
(1.7).

| Producer -> consumer | Contract | Until it lands |
|---|---|---|
| 5K -> 5I | the keys, draw scales and filters of 1.3; `maps` fields; slices and pivots (SPRITES 10.5) | greybox kit blocks, props and spots (SPRITES 10.13) |
| 5K -> 5J | `thumb_<mapId>`; themes `harbour` and `timber`; building art ids of 3.4. The `=` rail-variant rule of SPRITES 10.12 and Hollowmere's hedges as `F`, headstones as `R` are the world pre-seed's (ruling C16); the art matches them (3.2, 3.3) | 5J's `MapPicker` shows the name without a thumbnail |
| 5K -> 5G, 5I | `clue_footprint_<s|m|t>_glow` for `hungerPrints` | the footprint frame in its `light` tint |
| 5L -> 5F | `char_<lookId>`, `ovl_<lookId>` (scarf and blood, no hat passes), `anims_<lookId>` with `swing` and `interact`; `vfx_disguise` (played only where a Knife strike drops a disguise); `icon_ability_impersonate`; no real `char_villager` from L4 (placeholder only) | the placeholder looks of `placeholder-chars.ts` |
| 5L -> 5G, the role card | `portrait_<lookId>`; the five night-role icons (`icon_ability_confession`, `_keepwatch`, `_remedy`, `_poison`, `_lastshot`) | the empty portrait slot |
| 5M -> 5C, 5D | contract 5.4 keys plus `onub_mini`, each with `modes: ['onub']`; the card band area (4, 72) to (76, 108) in art px; the kitchen quadrants as tap targets; every ONUB image loaded at match start; `image-rendering: pixelated` | labelled greybox |
| pre-seed -> all | `style.json` (with `pixelFinish`), `palette.json`, `metrics.json`, `looks.json` with `swing`; the code of section 9 (`oklab.ts`, `palette.ts`, `pixel.ts`, `refs.ts`, `legacy.ts`, the replaced `manifest.test.ts`); the placeholder split; the package scripts | landed |

---

## 7. What needs the owner

| # | What | Who asks, and when | Blocks |
|---|---|---|---|
| 1 | **Provenance of the 13 images.** Name the AI tool, the plan (paid and watermark-free) and the date they were made, and give the link to that tool's terms. The session then completes the CREDITS row and saves the terms under `LICENSES/vendors/` with a README row. Also confirm that the images may ship pixel-finished (snapped to the world palette at a 640 x 360 grid, as in the orchestrator's trial images) | the orchestrator, before round 5 starts | the merge of M1-M4's room exports and their derivatives (kitchen overview, location cards). Not the work |
| 2 | **Approve the style: one test render per output class.** The formula, the world palette and the five-head figures reopen the gate (ASSETS 6.9). **Gate A, world** (`gate-a-world-on.png` and `gate-a-world-off.png`, K2, ruling F15): the Hollowmere square by day and night with the tavern, kit, props, lantern light and the Baker look, twice from the same rig: with the pixel finish on and with it off. The question: "The main world can use the ONUB pixel-art style (finish on). You asked for 'realistic and high depth': confirm the pixel finish, or choose the same rig with the pixel finish off." The answer sets `style.json` `pixelFinish.enabled.main`; the ONUB art keeps the finish either way. **Gate B, character** (`gate-b-character.png`, L3): the Baker's eight-direction contact sheet and lineup beside `portrait_baker`. **Gate C, ONUB** (`gate-c-onub.png`, M1): the finished fridge station, the `t55Flour` and `sawdust` cards, `onub_cloche` and `onub_portrait_boulanger`, made ahead of their batches | each session, posting to its PR and asking through the orchestrator | the merge of that class's art. A requested change is a re-run: the scripts are deterministic, the formula is data, and the finish is one switch (1.8) |
| 3 | **Pick the Brick Oven:** one of the four candidates in `gate-c-oven.png` (M2) | 5M | `onub_station_oven`, the oven's quadrant of `onub_kitchen`, `onub_loc_oven` |
| 4 | **A Higgsfield credit ceiling** for about 140 generations (cap 160). The figure is the preflight total each session reports (2.1). | the orchestrator, from 5M's first PR | generation beyond the first preflighted batch |
| 5 | **Laptop work**, any time after merge: run `higgsfield-library-sync` so the "pending" catalog ids resolve; copy the `.blend` masters (rebuilt by `save_masters.py` from the committed scripts) and the picked generations into `studio/assets/who-did-it/<kind>/<slug>/`; run the studio pipeline for the notes | the owner | nothing in round 5 |

What the sessions finish without the owner: all of R1, R2 and R5, the pixel finish, packing, every greybox, the
Higgsfield preflight and generations within the ceiling, and every review sheet.

---

## 8. Calls this plan made beyond the round-5 decisions

1. **One style for both modes**, with the main world's pixel finish left to the owner at Gate A as one switch
   (`style.json` `pixelFinish.enabled`, ruling F15; the ONUB art always keeps it).
   - Split into a formula, an avoid clause and five composition clauses in `style.json`, with the owner images
     (and fixed crops of their figures and props) as `image_references`.
   - A 64-colour **world palette** that every art pixel snaps to. The ten tokens stay the UI's.
   - Magenta is kept out of art.
   - The 10% saturated cap now applies to every image (the owner's rooms use at most 4%).
2. **Five-head characters** (`metrics.json` `characterHeadsTall` 3 -> 5) with simple faces, from the owner's figures
   and the "realistic" brief.
3. **`swing` joins the looks' clips** (304 frames per pass), since `AnimId.swing` still plays every Kill in whatever
   look the Killer wears. The hat passes are dropped.
4. **The pixel finish** (render at display scale, snap in OKLab, 2 x 2 mode-halve, alpha 0 or 255; with the main
   switch off, a 2 x 2 box downscale with partial alpha) is pre-seeded in `tools/sprites/pixel.ts`, because all three
   sessions need it. Its render text in S5.7 is the one SPRITES 10.3 quotes (ruling C6).
5. **The owner's 13 images ship pixel-finished**: a 640 x 360 grid, x3 lossless WebP at 1920 x 1080, 0.67 MB for
   all 13. They are not resized photo-JPEGs.
6. **The proofing station's baked baker is removed** by a masked Higgsfield edit, because no other player is shown
   during prep. The night scenes keep their figures.
7. **The kitchen overview is a composite** of the four station rooms in quadrants around a generated pass, and each
   quadrant is the tap target.
8. **An `onub_mini` atlas** of mini-game sprites, added to ONUB contract 5.4 for 5C.
9. **The main-mode bakery keeps its Wake Table, plates, dead loaves and ledger** as `props_hollowmere` frames. 5M
   removes only the loft images.
10. **Each map's environment is capped at 1.8 page-equivalents** (buildings at most 2048 x 1024), so the worst-case
    deck characters fit the 6-page limit. SPRITES 10.14 adopts these numbers (ruling C11).
11. **Draw scales:** ground, clues and vfx are finished and doubled to display size. Kit, buildings, props and
    characters are drawn x2 from half size.
12. **Two world rules the art relies on**, now in the world pre-seed (ruling C16): `=` rails pick their variant by
    neighbour axis (SPRITES 10.12); Hollowmere hedges are authored as `F`, headstones as `R`.
13. **Portal frames are theme-neutral:** a full-tile door and posts, so one set serves both kits.
14. **Hunger's prints** get `clue_footprint_<s|m|t>_glow` in the moon ramp.
15. **No `generate_3d`, no Quaternius, no Mixamo** in round 5. Raw generations are never committed; their masters are
    library entries found by generation id.
16. **Five women and five men** among the world looks, with assigned skin and hair. The Baker carries a basket, not
    a peel, so it does not echo the Lamplighter's pole.
17. **`placeholder.ts` is split** into three session modules in the pre-seed, so no two art sessions edit one file.
18. **5K ships the four `amb_<biome>` loops** that SPRITES 10.13 makes optional, and renders the lobby thumbnails
    from a Blender assembly of each hub.
19. **A generation cap of 160 images** for the round, about 138 planned.

---

## 9. Pre-seed: the code that landed

The pre-seed code of 1.2 items 5, 7, 9 and 10 was written and checked in the orchestrator's draft folder (it and the
Python study scripts behind this plan stay with the orchestrator; none of the scripts is copied). It was checked in a
scratch copy of `tools/sprites` at 265bda9, with the `style.json` and `palette.json` of S2 and S3:

- `tsc -p .`, eslint and prettier (the repo's config) are clean;
- `vitest run` passes the whole suite, 64 tests in 9 files;
- `refs` writes all 15 crops;
- a smoke run finished `station_fridge.jpg` to 640 x 360 (no off-palette pixels, no partial alpha, saturated share
  2.2%, 59 KB as x3 lossless WebP).

**Landed (2026-10-17).** Every file of 9.1 was copied unchanged (checked with `cmp`), with the hand edits below. On the
tree after the step: the sprites suite 64 of 64 in 9 files (`refs` wrote all 15 crops in about 17 s), `@wdi/content`
134 of 134 in 9 files, the server suite 153 passed and 2 skipped (it imports `@wdi/content`), the root typecheck,
eslint, prettier and `@wdi/content lint` clean. No protocol change, so `docs:protocol` was not needed. One stale
comment remains outside the step: `tools/blender/build_buildings.py:38` still names `placeholder.ts` for the buildings
list, which is now in `placeholder-world.ts` (5K's file).

### 9.1 What was copied where

| From the draft folder | To (repo) | Content |
|---|---|---|
| `tools/sprites/oklab.ts` | `tools/sprites/oklab.ts` | sRGB to OKLab, `#RRGGBB` helpers, the HSV hue and saturation of the spill test |
| `tools/sprites/palette.ts` | `tools/sprites/palette.ts` | Reads `packages/content/data/palette.json` and `style.json` directly (no `@wdi/content` dependency). Exports `WORLD` (64 colours, file order), `worldPalette`, `nearestIndex` (cached, ties to the darker), `DARK_RANK`, `SATURATED`, `finishEnabled`, `outlineRgb` |
| `tools/sprites/pixel.ts` | `tools/sprites/pixel.ts` | The finish of S5.7 and the `pixel` CLI |
| `tools/sprites/refs.ts` | `tools/sprites/refs.ts` | The reference crops and the `refs` CLI |
| `tools/sprites/test/pixel.test.ts` | `tools/sprites/test/pixel.test.ts` | New |
| `tools/sprites/test/refs.test.ts` | `tools/sprites/test/refs.test.ts` | New |
| `tools/sprites/test/legacy.ts`, `test/legacy.test.ts` | the same paths | New: the `LEGACY` list of 1.7 and its test |
| `tools/sprites/test/manifest.test.ts` | `tools/sprites/test/manifest.test.ts` | Replaces today's file |

**By hand, landed with it:**

1. **Content first.** Land `style.json` (with `pixelFinish`) and `palette.json` (with `world`) in the same commit.
   `palette.ts` reads both at import, and today's files lack `world`, `pixel` and `pixelFinish`.
2. **`tools/sprites/package.json` scripts** (landed as listed): `"pixel": "tsx pixel.ts"`, `"refs": "tsx refs.ts"`, and the owners'
   entry points `"tileset": "tsx tileset.ts"`, `"slice": "tsx slice.ts"`, `"review:world": "tsx review-world.ts"`,
   `"lineup": "tsx lineup.ts"`, `"onub": "tsx onub.ts"`, `"onub:cards": "tsx onub-cards.ts"` and
   `"onub:mini": "tsx onub-mini.ts"`. No dependency changes: the code uses `@napi-rs/canvas` ^1.0.11 and
   `node:zlib` through `bleed.ts`, both already there.
3. **`tools/sprites/README.md`:** one row each for `oklab.ts`, `palette.ts`, `pixel.ts`, `refs.ts` and the four test
   files, plus the two commands `pnpm --filter @wdi/sprites refs` and
   `pnpm --filter @wdi/sprites pixel <raw> <out> [--display] [--finish on|off]`. As landed it also has rows for the
   placeholder split, and its `refs` command passes `../../build/refs` (1.2 item 7).
4. **The placeholder split** (1.2 item 6) was a spec, not code here. Its check is that
   `pnpm --filter @wdi/sprites placeholder` leaves `git status` clean, which it does; `test/pack-static.test.ts`
   now imports `clueFrames` from `placeholder-world.ts`.

### 9.2 What the code decides

These are fixed so that no session has to guess:

- **Images.** `Rgba` is `bleed.ts`'s straight 8-bit RGBA (`Uint8Array`). PNG input and output go through `bleed.ts`'s
  `decodePng` and `encodePng`, which are deterministic and never premultiply. WebP goes through `@napi-rs/canvas`
  `encode('webp', quality)`. At 100 it is lossless, and the test decodes the file and compares every pixel.
- **Alpha cut.** Alpha at or above `pixel.alphaCut` × 255 (128 and up) becomes 255. Transparent pixels become
  0, 0, 0, 0.
- **Snap.** Squared Euclidean distance in OKLab to the 64 colours. An exact tie goes to the darker colour. Results
  are cached per RGB value.
- **`modeHalve`.**
  - A packed pixel is opaque when at least 2 of its 4 source pixels are.
  - It takes the most frequent palette colour. A tie goes to the lowest OKLab L, then to file order.
  - It throws on odd sizes and on input that is not snapped.
- **`boxResize` and `boxHalve`.** A premultiplied area average at any ratio. They never enlarge.
- **The switch.**
  - `finishRender(img, on)`: on, `modeHalve(snap(img))`; off, `bleed(boxHalve(img))` with 2 rings.
  - `finishDisplay(img, on)`: on, `upscaleNearest(finishRender(img, true), 2)`; off, `bleed(img)`.
  - `on` defaults to `pixelFinish.enabled.main`.
  - `finishIllustration` never reads the switch: generated art is always finished.
- **`cleanCutout(img, key)`.**
  - First the chroma key: every pixel within `keyTolerance` of the key in OKLab is cleared.
  - Then the spill fix. An edge pixel is an opaque pixel with a transparent 8-neighbour (or the image border).
    An edge pixel with HSV hue within 30° of the key's and saturation over 0.3 takes the colour of the nearest
    interior pixel that is not spill, searched in rings up to 3 pixels.
- **`outline`.** Every transparent pixel 4-adjacent to the subject becomes `ink`. Diagonal neighbours stay clear.
- **`finishIllustration(img, w, h, { crop?, outline? })`.** Crops to the box, or centre-crops to w:h. Then
  `boxResize`, then `snap`, then the outline when asked.
- **The `pixel` CLI.** `finishFolder` finishes every PNG of a raw folder, keeping relative paths. It halves every
  number under a `cell`, `feet` or `pivot` key of `manifest.json`, except with `--display`, and copies every other
  file. `--finish on|off` overrides the switch. The two Gate A renders (3.10) are its two runs over the same raw
  folder.
- **The `refs` CLI.** Writes `build/refs/<composition>-<index>-<file stem>.png` through `encodePng`. Uncropped
  entries are written whole. A crop outside its image fails the run. Today's `references` give 15 files in about
  17 s.

### 9.3 The tests

- **`pixel.test.ts`.**
  - The palette has 64 distinct colours, holds ink and leaves out magenta. `finishEnabled('onub')` is true.
  - The alpha cut at 127 and 128. Snapping to the nearest colour. The mode halve: 1 of 4 opaque, 2 of 4, the darkest
    tie, a kept one-pixel outline, and refusal of odd or unsnapped input.
  - The box halve keeps partial alpha. `boxResize` works at a non-integer ratio and refuses to enlarge.
    `upscaleNearest` works.
  - `finishRender` on and off: size, palette, alpha, bleed. `finishDisplay` keeps the size both ways.
    Determinism.
  - Cutouts: key, spill, outline, and `finishIllustration` with a centre crop and with a box.
  - Lossless WebP.
  - Manifest halving, and `finishFolder` in render and display mode.
- **`refs.test.ts`.** Output names are unique. At most four references per composition. Every file exists, and
  every crop lies inside its image (each image is decoded once). A crop has its box size. `boxInside` refuses a box
  outside the image.
- **`legacy.test.ts`.** Each `LEGACY` key is listed once and is still a key of the real manifest. K6 adds
  `it('is empty', () => expect(LEGACY).toEqual([]))`.
- **`manifest.test.ts`.**
  - Both manifests have the same keys and types, the villager keys aside.
  - The villager keys are always in the placeholder manifest, and in the real one only while `char_villager` is in
    `LEGACY`.
  - Each key has the same `maps` and `modes` in both manifests. `modes` is non-empty with no duplicates.
    `modes: ['onub']` is on every `onub_*` key, and no other key lists `onub`.
  - In the real manifest, every non-`LEGACY` image or atlas with a world prefix (`iso_ground_`, `iso_kit_`, `bld_`,
    `props`, `char_`, `ovl_`, `vfx`) has `filter` `nearest` while `pixelFinish.enabled.main` is true and `linear`
    when it is false. `clues` is `linear`.
  - `props`, `vfx` and `anims_vfx` are listed.
  - Today's loft assertion is dropped: M1 removes the loft keys, and `legacy.test.ts` covers them until then.
  - The file passes on today's art, where every image key is `LEGACY` and no entry carries `maps` or `modes` yet.

---

## Appendix. The round-5 style: formula, palette and the ASSETS lines that change

> For Sessions 5K (world environment), 5L (characters) and 5M (ONUB art); its data, schemas and tests landed in the
> round-5 pre-seed (art plan 1.2). Inside this appendix "section N" means its own section SN; numbers inside quoted
> ASSETS text (6.1, 6.4, 6.11) are ASSETS sections, and "art plan N" is the main part of this document.
> It replaces the toon-noir formula of 2026-10-10 with one isometric pixel-art style that both modes share (the main
> world's pixel finish is the owner's Gate A choice, below), built from the owner's 13 ONUB images
> (`assets/source/concepts/onub/`, A49). It landed as the new `packages/content/data/style.json` and `palette.json`
> with their schemas and tests (the pre-seed), the ASSETS.md text of section 5 (the round-5 docs pass) and one
> DECISIONS row the orchestrator numbers (this file calls it **A-style**). Changing the formula reopens the
> art approval gate (ASSETS 6.9): nothing generated or rendered under the old formula ships in round 5, and the owner
> approves one test render per output class before the batches merge (art plan section 7).
>
> **The main world's finish is the owner's call (ruling F15).** The owner asked for a "realistic and high depth"
> main world and attached pixel art for ONUB. Gate A therefore shows two test renders of the same main-world scene
> from the same rig: the pixel finish on, and the pixel finish off. `style.json` `pixelFinish.enabled` holds one
> switch per mode; the main mode's switch is set from the owner's answer, and everything 5K and 5L build for the
> world turns on that one switch (section 5.7, "The switch"). The ONUB art keeps the pixel finish, because the
> owner's images are pixel art (`pixelFinish.enabled.onub` is always true).
>
> It builds on A49 (isometric everywhere, public role looks, Higgsfield allowed) and the projection contract of
> SPRITES 10 (`docs/SPRITES.md` section 10). Where this file and SPRITES 10 both speak (the camera, the pixel finish), they
> say the same thing, and this file adds the art-side detail. Numbers live in `style.json`, `palette.json` and
> `metrics.json`; the prose below repeats them only where ASSETS.md already did.

### S1. What the owner's images do

Read from all 13 images at full size (2576 x 1438 JPEG) and as a palette cluster study. The look in ten points:

1. **One room per picture, as a cutaway diorama.** A true 2:1 dimetric view from the south-east. Two back walls stand
   at full height, the front walls are cut away, and the floor is a thick slab whose cut edge shows. The room floats
   centred on a flat dark navy void.
2. **Real pixel art.** The pictures are drawn on a grid of about 4 source pixels per art pixel, so a 16:9 picture is
   about 640 x 360 art pixels. Edges are hard, and every object has a one-pixel near-black outline.
3. **Three-tone cel shading.** Each surface has a shadow, a mid and a light tone, plus a few highlight pixels placed
   by hand. There are no airbrushed gradients. Plaster, stone and wood grain carry small dither patterns.
4. **Warm lamplight against cold blue.** Bare bulbs, a lantern, a candle or an oven make warm amber pools. The far
   corners fall into a cold blue-grey. Shadows lean blue and are never black. Each room adds one accent light: the
   cellar's green mould glow, the expediter's red heat lamps, the chef's green banker's lamp.
5. **Dense, lived-in props.** Shelves of jars, sacks stencilled FARINE, crates, hanging pans, pipes along the walls,
   chalkboards, flour dust and spills. Almost no floor is empty.
6. **Worn materials.** Terracotta tile, scuffed planks, stone flags, chipped plaster that shows the brick beneath,
   stainless steel, copper pipe and dark wood.
7. **Small figures, about five heads tall.** They have natural proportions, simple faces with no drawn eyes, dark
   outlines and flat two- or three-tone clothes.
8. **A narrow, warm palette.** Most pixels are browns, terracottas, creams and navy. Saturated colour (the green glow,
   the red lamps, a brass highlight) covers no more than 4% of any room.
9. **Text is baked into some signs.** The role chalkboards are legible. Small labels are garbled ("YERST", "BEHSY").
   At the 640 x 360 art grid the small labels drop below legibility, and the chalkboards stay readable.
10. **Two pictures hold people.** These are the expediter's pass and the hygiene station, which are night scenes. The
    proofing station has a baker at the cabinet.

The palette in section 3 reproduces all 13 images faithfully when they are box-downscaled to the 640 x 360 grid and
snapped to it. The test images (fridge, mixer, cellar, expediter) were made in the orchestrator's study folder (the evidence stays
with the orchestrator). That test is
why the owner's images ship pixel-finished like all ONUB art (art plan 5.1).

### S2. `packages/content/data/style.json` (replaces the file)

The formula describes the **style** only. Every prompt adds a **composition** clause for its kind of image, then a
subject, then the formula and the avoid clause, in that order (art plan 2.3). Splitting them is what lets one
formula serve rooms, objects, turnarounds and portraits without contradictions. Every hex in these strings is a
palette token.

```json
{
  "source": "docs/ASSETS.md 6.4, 6.9, 6.11",
  "styleFormula": "Art style: the isometric pixel-art cutaway dioramas of the reference images. Chunky visible pixels on a strict grid, crisp one-pixel near-black outlines, flat three-tone cel shading with a few hand-placed highlight pixels, small dither patterns on plaster, stone and wood grain; no smooth gradients, blur or airbrush. Warm amber lamplight #FFB457 pooling against cold blue night shadow #7FA8FF; shadows lean blue and are never black; the deepest tone is navy #12141C. Dense, lived-in detail: shelves of jars, sacks, crates, hanging tools, pipes along the walls, and worn surfaces of terracotta tile, scuffed planks, chipped plaster over brick and damp stone. Figures are small, about five heads tall, with simple faces and no drawn eyes. No text, letters, numbers, logos or watermark.",
  "styleToken": "isometric pixel-art cutaway diorama, 1px dark outlines, 3-tone cel, warm lamplight vs cold blue, dense props, no text",
  "styleAvoid": "Avoid: photorealism, a 3D-render look, smooth gradients, soft airbrush, lens blur, depth of field, bloom haze, painterly brush strokes, flat vector art, anime or chibi proportions, a perspective camera, legible signage or lettering.",
  "compositions": {
    "diorama": "Composition: one room as an isometric cutaway diorama at a true 2:1 dimetric angle seen from the south-east, exactly like the reference images: the two back walls stand at full height, the front walls are removed, the floor is a thick slab with its cut edge showing, and the room floats centred on a flat dark navy void (#12141C) with an even margin and nothing else in frame.",
    "level": "Composition: a slice of an isometric game level at the same true 2:1 dimetric angle seen from the south-east: ground laid as 2:1 diamond tiles, buildings and trees standing, the slice cut clean at its edges like a diorama base and floating on a flat dark navy void (#12141C).",
    "object": "Composition: one single object, whole and centred, seen from the same 2:1 isometric angle as the reference images, filling about 70% of a square frame, on a perfectly flat pure {KEY} background, with no floor, no cast shadow and nothing else in frame.",
    "figure": "Composition: a character turnaround sheet of one person in a relaxed A-pose, four full-body views left to right (front, front three-quarter, side, back), feet on one baseline, evenly spaced, on a perfectly flat pure {KEY} background, with no floor and no cast shadow.",
    "portrait": "Composition: a half-length portrait of one person in a three-quarter view from slightly above eye level, filling the lower two thirds of a 2:3 frame; behind them a small cutaway corner of their place, lit by one warm lamp, its edges falling off into the flat dark navy void (#12141C)."
  },
  "keyColors": ["#FF00FF", "#00FF00", "#0000FF"],
  "references": {
    "diorama": [
      { "file": "assets/source/concepts/onub/station_mixer.jpg" },
      { "file": "assets/source/concepts/onub/scene_cellar.jpg" },
      { "file": "assets/source/concepts/onub/station_fridge.jpg" },
      { "file": "assets/source/concepts/onub/scene_front_of_house.jpg" }
    ],
    "level": [
      { "file": "assets/source/concepts/onub/station_mixer.jpg" },
      { "file": "assets/source/concepts/onub/scene_cellar.jpg" },
      { "file": "assets/source/concepts/onub/scene_front_of_house.jpg" }
    ],
    "object": [
      { "file": "assets/source/concepts/onub/station_mixer.jpg", "crop": [700, 560, 540, 620] },
      { "file": "assets/source/concepts/onub/scene_cold_pantry.jpg", "crop": [1100, 380, 800, 620] },
      { "file": "assets/source/concepts/onub/station_fridge.jpg", "crop": [300, 380, 560, 680] }
    ],
    "figure": [
      { "file": "assets/source/concepts/onub/scene_expediter.jpg", "crop": [1820, 500, 220, 590] },
      { "file": "assets/source/concepts/onub/scene_hygiene.jpg", "crop": [1060, 500, 220, 490] },
      { "file": "assets/source/concepts/onub/scene_hygiene.jpg", "crop": [1400, 610, 240, 500] }
    ],
    "portrait": [
      { "file": "assets/source/concepts/onub/scene_expediter.jpg", "crop": [1820, 500, 220, 590] },
      { "file": "assets/source/concepts/onub/scene_hygiene.jpg", "crop": [1400, 610, 240, 500] }
    ]
  },
  "pixel": {
    "illustrationScale": 3,
    "alphaCut": 0.5,
    "match": "oklab",
    "tieBreak": "darkest",
    "keyTolerance": 0.15,
    "cutoutOutline": "ink",
    "webpQuality": 100
  },
  "pixelFinish": {
    "enabled": { "main": true, "onub": true },
    "offWebpQuality": 90
  },
  "ui": {
    "source": "docs/UI.md",
    "fonts": { "display": "Oswald", "text": "Inter" },
    "typeScalePx": {
      "displayXl": 44,
      "displayLg": 32,
      "displayMd": 24,
      "displaySm": 18,
      "textLg": 18,
      "textMd": 16,
      "textSm": 14,
      "textXs": 12
    },
    "lineHeight": { "display": 1.1, "text": 1.45 },
    "trackingEm": { "display": 0.04, "caps": 0.12, "code": 0.18 },
    "spacePx": [4, 8, 12, 16, 24, 32, 48],
    "radiusPx": { "xs": 2, "sm": 6, "md": 10, "lg": 16, "card": 20 },
    "frameMarginPx": 24,
    "gridPx": 48,
    "touchTargetPx": 44,
    "minViewportPx": 390,
    "contrast": { "textMin": 4.5, "largeTextAndUiMin": 3 }
  }
}
```

What each new field means:

| Field | Meaning |
|---|---|
| `styleAvoid` | Appended to every prompt after the formula |
| `compositions` | One clause per kind of image. `{KEY}` is replaced by the key colour of that generation (`keyColors`, chosen as in ASSETS 6.9: magenta by default, green when the subject has pink or purple, blue when it has both) |
| `references` | The owner images uploaded as `image_references` for each composition. `crop` is `[x, y, w, h]` in source pixels, cut before upload: three figures (the Aboyeur at the pass, the Commis and the Inspecteur at the hygiene station) and three prop clusters (the mixer's sacks, the cold pantry's table, the fridge shelves) |
| `pixel.illustrationScale` | Display pixels per art pixel for DOM illustrations: rooms 640 x 360 art -> 1920 x 1080, portraits 128 x 192 -> 384 x 576, cards 80 x 112 -> 240 x 336. World sprites use `metrics.json` `iso.artScale` (2) |
| `pixel.alphaCut` | Alpha at or above it becomes 255, below it 0. Finished art has no partial alpha |
| `pixel.match`, `tieBreak` | Colours snap to the nearest world-palette colour in OKLab. A 2 x 2 mode downscale breaks a tie towards the darkest colour, so one-pixel lines survive |
| `pixel.keyTolerance` | OKLab distance from the key colour that the fallback chroma key clears when background removal leaves key pixels |
| `pixel.cutoutOutline` | Token of the one-pixel outline the finish adds around a generated cutout |
| `pixel.webpQuality` | 100: `@napi-rs/canvas` writes lossless WebP at 100, exact to the pixel (checked on 1.0.11) |
| `pixelFinish.enabled` | One switch per mode (ruling F15). `main` is set from the owner's Gate A answer (pre-seeded `true`, the proposal; the orchestrator records the answer in DECISIONS and sets the value). `onub` is always `true`. What the switch turns on and off is section 5.7, "The switch" |
| `pixelFinish.offWebpQuality` | 90: the lossy WebP quality of a main-mode DOM image rendered with the finish off (the lobby thumbnails), so the byte caps of art plan 1.4 hold |

**Schema** (`packages/content/src/schemas/style.ts`), replacing `StyleFile`:

```ts
const Hex = z.string().regex(/^#[0-9A-F]{6}$/, 'colours are #RRGGBB upper case');
const Coord = z.number().int().min(0);
const Reference = z.strictObject({
  file: z.string().regex(/^assets\/source\/concepts\/.+\.(jpg|png)$/),
  /** [x, y, w, h] in source pixels, cut before upload (`Px` is the file's existing positive integer). */
  crop: z.tuple([Coord, Coord, Px, Px]).optional(),
});
export const Composition = z.enum(['diorama', 'level', 'object', 'figure', 'portrait']);
export type Composition = z.infer<typeof Composition>;

export const StyleFile = z.strictObject({
  source: z.literal('docs/ASSETS.md 6.4, 6.9, 6.11'),
  styleFormula: z.string().min(1),
  styleToken: z.string().min(1).max(120),
  styleAvoid: z.string().min(1),
  compositions: z.record(Composition, z.string().min(1)),
  keyColors: z.tuple([Hex, Hex, Hex]),
  references: z.record(Composition, z.array(Reference).min(1).max(4)),
  pixel: z.strictObject({
    illustrationScale: z.number().int().min(1),
    alphaCut: z.number().gt(0).lt(1),
    match: z.literal('oklab'),
    tieBreak: z.literal('darkest'),
    keyTolerance: z.number().positive(),
    cutoutOutline: z.literal('ink'),
    webpQuality: z.literal(100),
  }),
  /** Ruling F15: the main mode's finish is the owner's Gate A answer; ONUB always keeps it. */
  pixelFinish: z.strictObject({
    enabled: z.strictObject({ main: z.boolean(), onub: z.literal(true) }),
    offWebpQuality: z.number().int().min(1).max(99),
  }),
  ui: UiStyle,
});
```

**Tests** (`packages/content/test/content.test.ts`):

- The token check stays: `styleToken` is at most 120 characters.
- Every hex in `styleFormula` and in every `compositions` string is a palette token.
- `object` and `figure` contain `{KEY}`; no other composition does.
- Every `references[].file` exists on disk.

`tools/sprites/test/refs.test.ts` (pre-seeded with `tools/sprites/refs.ts`, since `@napi-rs/canvas` lives there;
the code is art plan section 9) checks every reference file exists and every crop lies inside its image
(2576 x 1438).

### S3. The palette rule change

#### S3.1 The rule

The ten tokens stay the UI's palette. A second palette, the **world palette**, joins them: 64 colours in 16 named
ramps, taken from the owner's images. **Every pixel of rendered or generated art is a world-palette colour, fully
opaque or fully transparent.** Rendered or generated art means world sprites, tiles, characters, portraits, cards and
the ONUB rooms. The pixel finish enforces this, and a test checks every exported image. While the main mode's
finish is off (`pixelFinish.enabled.main`, 5.7), its rig renders are exempt: they keep the rig's own colours and
partial alpha.

Why:

- The old rule ("tokens are the only colours allowed in materials") cannot reach the owner's look. Brick,
  terracotta, plaster, wood and skin have no tokens, and three tones per surface need ramps.
- One fixed, indexed palette is also what makes generated and rendered art look like one game. Snapping to it is
  the core of the pixel look.

The world palette holds nine of the ten tokens. Magenta stays out: it is the hazard mark, and no art pixel may
compete with it.

#### S3.2 `packages/content/data/palette.json` (replaces the file)

`colors`, `ambient` and `rules` are unchanged. `world` is new.

```json
{
  "source": "docs/ASSETS.md 6.1",
  "colors": {
    "ink": "#12141C",
    "slate": "#2C3240",
    "fog": "#6F7A8C",
    "bone": "#D9D2C2",
    "mustard": "#F2B33D",
    "teal": "#2EC4B6",
    "magenta": "#E04E9A",
    "blood": "#B3121F",
    "lantern": "#FFB457",
    "moon": "#7FA8FF"
  },
  "ambient": {
    "day": { "color": "#2C3240", "intensity": 0.6 },
    "night": { "color": "#12141C", "intensity": 0.25 },
    "fogOfWarLuminanceFloor": 0.25
  },
  "rules": {
    "maxSaturatedAccentShare": 0.1,
    "outlineToken": "ink",
    "outlinePx": 1.5,
    "interactableToken": "teal",
    "hazardToken": "magenta",
    "primaryButtonToken": "mustard",
    "uiStrokePx": 2
  },
  "world": {
    "source": "docs/ASSETS.md 6.1; built from assets/source/concepts/onub/*.jpg (A-style)",
    "ramps": {
      "ink": ["#12141C", "#1A1D29"],
      "slate": ["#2C3240", "#3A4356", "#4D5A70", "#5E6C84"],
      "fog": ["#6F7A8C", "#8892A2", "#A6AEBA"],
      "moon": ["#24374F", "#466784", "#6A8EAD", "#7FA8FF", "#93C2E0", "#C3EAF2"],
      "bone": ["#8E8676", "#B2AA99", "#D9D2C2", "#FFF1DC"],
      "plaster": ["#9A9083", "#BFA27E", "#DCC4A1", "#F0DEB3"],
      "stone": ["#2E2A2D", "#453E3F", "#5E5553", "#7A7067", "#9A9083", "#B2AA99"],
      "wood": ["#24171A", "#3A231F", "#55332A", "#744733", "#94603F", "#B57F54"],
      "brick": ["#4E2620", "#6A3426", "#8A4630", "#AA5A39", "#C8744A", "#DE9767"],
      "lantern": ["#B06A35", "#DA9348", "#FFB457", "#FFD48A", "#FFF1DC"],
      "brass": ["#6E5428", "#A07C36", "#F2B33D"],
      "moss": ["#1B261B", "#26361F", "#3A5A33", "#4F8A4A", "#5FC266", "#A8F09A"],
      "litter": ["#3A2F1E", "#5C4A2A", "#80683A"],
      "teal": ["#1C504D", "#2EC4B6", "#9DF2E6"],
      "blood": ["#4A0D12", "#7E1119", "#B3121F"],
      "skin": ["#55332A", "#744733", "#94603F", "#C08A66", "#DDB08E", "#F2D3B8"]
    },
    "saturated": ["#7FA8FF", "#DA9348", "#FFB457", "#F2B33D", "#5FC266", "#A8F09A", "#2EC4B6", "#9DF2E6", "#7E1119", "#B3121F"]
  }
}
```

How the ramps work:

- **Order.** Each ramp runs dark to light. A look's skin is three neighbouring skin steps (shadow, mid, light),
  named by the mid step's index, 1 to 4 (art plan 4.3).
- **Shared colours.** A colour may sit in more than one ramp, and the palette is their union: 64 distinct colours.
  `#9A9083` and `#B2AA99` join stone to plaster and bone; `#94603F`, `#744733` and `#55332A` join skin to wood;
  `#FFF1DC` (the rig's key-light colour) tops both bone and lantern.
- **Spacing.** No two colours are closer than 0.028 in OKLab, and every ramp steps by at least 0.05 in lightness.
- **Use.** The cluster study used all 64 colours on the owner's images.
- **Saturated colours.** `saturated` lists the colours with an OKLab chroma of 0.12 or more, except the brick and
  lantern steps that serve as materials. The owner's images use them on at most 4.1% of a room (the fridge).
- **Ramp name to token.** Each ramp is named for the token it carries, where one exists, so `looks.json`'s palette
  tokens (`base`, `second`, `accent`) name ramps: `mustard` names the `brass` ramp, and the others name the ramp of
  the same name.

**Schema** (`packages/content/src/schemas/palette.ts`), add to `PaletteFile`:

```ts
const RampName = z.enum(['ink', 'slate', 'fog', 'moon', 'bone', 'plaster', 'stone', 'wood', 'brick', 'lantern',
  'brass', 'moss', 'litter', 'teal', 'blood', 'skin']);
world: z.strictObject({
  source: z.string().min(1),
  ramps: z.record(RampName, z.array(Hex).min(2).max(6)),
  saturated: z.array(Hex).min(1),
}),
```

**Tests** (`packages/content/test/content.test.ts`):

- The union of `world.ramps` has exactly 64 distinct colours.
- It contains every token except `magenta`, and `magenta` is in no ramp.
- Every `saturated` colour is in a ramp.
- No two colours are within 0.02 of each other in OKLab (the test carries a 20-line sRGB-to-OKLab helper).

`tools/sprites/test/palette.test.ts` (5L, PR L1) decodes every image of the real `manifest.json`: each `image`
entry's file and each `multiatlas` entry's pages. It skips the keys of the `LEGACY` allowlist
(`tools/sprites/test/legacy.ts`, pre-seeded; ruling C8, art plan 1.7), and, while `pixelFinish.enabled.main` is
false, the main-mode rig renders (every entry without `modes` except `portrait_*`). It asserts:

- every pixel's alpha is 0 or 255;
- every opaque pixel is a world-palette colour;
- the opaque pixels in `saturated` are at most `rules.maxSaturatedAccentShare` (0.1) of each character frame, and
  of each other image or atlas page.

#### S3.3 Rules for the art (the text of ASSETS 6.1, section 5.1)

- **Light.**
  - Lit faces take the warm, upper steps of their ramp.
  - Shadow faces go down their ramp and lean cool: slate, moon or ink take over below a ramp's lowest step.
  - Ink `#12141C` is the deepest tone and the void behind every ONUB room. Black is never used.
- **Saturated colour.** At most 10% of a character frame, and of any other image or atlas page. That share is the
  owner images' own (4% at most) with headroom for the glowing props.
  - Teal in art belongs only to light sources: cave moss and the mere-rot. The runtime interactable pulse stays the
    one teal thing a player is asked to touch.
  - Magenta never appears in art.
- **Characters.**
  - The costume is drawn from the ink, slate, fog and bone ramps. A look's `base` and `second` tokens name two of
    them.
  - Skin comes from the skin ramp. Hair comes from the ink, wood, fog or bone ramp.
  - A carried prop may add the wood, brass, stone or lantern ramp.
  - The look's one `accent` (brass, lantern or bone) covers at most a tenth of a frame.
  - The scarf is drawn on the bone ramp and tinted at runtime. It stays the only strongly saturated colour on a
    walking figure.
- **Proportions.**
  - Five heads tall: 1.7 m, with a 0.34 m head.
  - Natural hands and boots.
  - A simple face: no drawn eyes at sprite size, and a one-pixel brow shadow.
  - The standing silhouette is at most 1.75 tiles (`metrics.json`; at most 112 display pixels, SPRITES 10.3).
- **Outlines.**
  - One art pixel, near-black.
  - Renders get it from the inverted hull (Solidify -0.022 m at the display scale, which lands on one art pixel
    after the finish).
  - Generated cutouts get it from the finish (`pixel.cutoutOutline`).
- **Shading.**
  - Three cel bands (shadow, mid, light) from the toon ramp, plus at most a few highlight pixels.
  - CC0 textures (Poly Haven) are allowed through the toon shader's colour input. The finish snaps them to the
    palette, which turns their grain into dither.

### S4. Other data that changes with the style

- **`metrics.json` `characterHeadsTall`: 3 -> 5.** The owner's figures are five to six heads tall and the owner
  asked for "realistic". At 50 art pixels a five-head figure has a 10-pixel head, which reads, and its headgear and
  carried prop carry the look's silhouette (deck catalogue).
  - The world contract's `maxStandingSilhouettePx` 112 and `maxSilhouetteTiles` 1.75 stand: every look stays inside
    the 1.75-tile silhouette.
  - `content.test.ts` pins `characterHeadsTall` at 5 (ruling C5).
  - The villager stays the plain base body, without hat passes: hats are nameplate glyphs (art plan 4.2).
- **`looks.json` `clips`: add `swing`** (`["idle", "walk", "swing", "interact", "die"]`, and `LookClip` in the deck
  data's `looks.ts` lists the same five; ruling C2). `AnimId.swing` (2) still serves Kill, Crowbar and Check (`npc.md`
  part 1, section 4). A Killer swings in whatever look it wears, so every world look needs the clip.
  - Frames per look: idle 8, walk 8, swing 6, interact 8, die 8. In 8 directions that is 304 frames per pass.
  - `gen-anims.ts` writes the `swing` clip into each look's `anims_<lookId>` (one-shot, holding its last frame).
  - The deck data's section 9 table (`deck-data.md`) carries the row (`swing` 6 f) and the key `anims_<lookId>`.
- **`looks.json` palette tokens now name ramps.** The validator rule (`base` and `second` in ink, slate, fog or bone;
  `accent` in mustard, lantern or bone) is unchanged.

### S5. ASSETS.md replacement text

#### S5.1 ASSETS 6.1, the whole first paragraph

> ### 6.1 Palette and style
>
> **Two palettes, one style (A-style, round 5).** `packages/content/data/palette.json` holds both.
>
> - **The ten tokens** are the only colours of the DOM UI, the SVG icons, runtime tints and effects drawn in code:
>   ink `#12141C`, slate `#2C3240`, fog `#6F7A8C`, bone `#D9D2C2`, mustard `#F2B33D`, teal `#2EC4B6`, magenta
>   `#E04E9A`, blood `#B3121F`, lantern `#FFB457`, moon `#7FA8FF`. Runtime tints include the scarf tints, the teal
>   interactable pulse, the magenta hazard mark and the faction colours.
> - **The world palette** (`palette.json` `world`) is 64 colours in 16 named ramps, built from the owner's ONUB
>   images. It holds every token but magenta. It is the only set of colours in rendered and generated art: world
>   sprites, tiles, characters, portraits, cards and the ONUB rooms. Every shipped art pixel is one of its colours,
>   fully opaque or fully transparent. The pixel finish (6.11) snaps to it, and `tools/sprites/test/palette.test.ts`
>   checks every exported image. While the main mode's finish is off (`style.json` `pixelFinish.enabled.main`,
>   6.11), its rig renders are exempt.
>
> **Light.**
>
> - Lit faces take the warm, upper steps of their ramp.
> - Shadow faces step down their ramp and lean cool, into slate, moon or ink.
> - Ink is the deepest tone and the void behind every ONUB room. Black is never used.
> - Saturated colours (`world.saturated`) cover at most 10% of a character frame and of any other image or page.
> - Teal appears in art only as a light source (cave moss, the mere-rot), and magenta never.
>
> **Characters.**
>
> - The costume comes from the ink, slate, fog and bone ramps, skin from the skin ramp, and hair from ink, wood, fog
>   or bone.
> - A carried prop may add wood, brass, stone or lantern.
> - The look's single accent covers at most a tenth of the frame.
> - The scarf is the only strongly saturated colour on a walking figure.
> - Five heads tall (1.7 m, head 0.34 m), with natural hands and boots and a simple face without drawn eyes.
> - The standing silhouette is at most 1.75 tiles.
>
> **Outlines and shading.**
>
> - Outlines are one art pixel, near-black: the inverted hull on renders, the finish on generated cutouts.
> - Three cel bands per surface, plus a few highlight pixels. CC0 textures are allowed and become dither when snapped.
>
> Interactables pulse teal, hazards magenta. UI: Illustrator vector system, 2 px rounded ink strokes, paper-textured
> bone fills, mustard primary buttons, Art-Deco card frames; fonts Oswald + Inter (OFL, texts in `LICENSES/`) from
> day 1 in both Illustrator and the DOM. The DOM design system (tokens, components, the frames, the contrast table
> and the screen mockups) is `docs/UI.md`, implemented in `apps/client/src/ui/theme/` and
> `apps/client/public/assets/ui/`; its type and spacing scale is the `ui` block of
> `packages/content/data/style.json`.

#### S5.2 ASSETS 6.2, the camera bullet

This is the only replacement text for this bullet and for the 6.3 Characters sentence of 5.4: SPRITES 10.16 no
longer carries ASSETS lines for them (ruling C6). The facts match SPRITES 10.3, which quotes the render text of 5.7
word for word.

> - **Camera (A49, round 5): orthographic `IsoCam`, rotation X = 60°, Y = 0°, Z = 45°.** This is the 2:1 dimetric
>   view of GDD 3.13 seen from the south-east (screen up = world north-west; projection contract SPRITES 10).
>   - **What it renders.** Every world asset class: ground, kit pieces, trees, buildings, props, characters and
>     vertical effects.
>   - **Scale.** Renders are made at the display scale, 90.51 px per ground metre (a 1 m tile is a 128 x 64
>     diamond). They are then finished at half size by `tools/sprites/pixel.ts` (6.11) and drawn at twice the size
>     (`metrics.json` `iso.artScale`), with nearest filtering while the main mode's pixel finish is on and linear
>     filtering when it is off (`style.json` `pixelFinish.enabled.main`, 6.11).
>   - **Heights.** Heights render at 0.75 of true scale (`iso.zScale`): the environment through a root empty scaled
>     (1, 1, 0.75), and characters through one scaled 0.75 on every axis. A vertical metre is therefore 59 display px
>     (29.5 art px), and a standing 1.7 m figure about 100 display px.
>   - **Walls.** 2.5 m full, 1.2 m half, 0.3 m stub (`iso.wallHeightM`).
>   - **Ground decals** keep the straight-down `TileCam` and its 64 px cells: footprints, smear, print, fur, claw,
>     drag and blood pool. The client projects them through the decal transform (SPRITES 10.5).

#### S5.3 ASSETS 6.2, the turntable, lights, toon and output bullets

> - **Turntable.** Atlas direction i (screen frame, 0 = `n`) sets `TT.rotation_euler.z = 45° - i·45°`, so index 0 =
>   n faces screen up (world north-west). The frame regex is unchanged.
> - **Lights** stay parented to the camera, unchanged: a key sun from screen-left at azimuth 225°, elevation 55°,
>   colour `#FFF1DC`; the moon area fill opposite; world slate at 0.15; no cast shadows.
> - **Toon material.** The `WDI_Toon` group keeps its three constant bands. A texture input may replace the flat
>   colour, for CC0 textures only. Session 5L re-measures the ramp stops under IsoCam's 30° view and records them in
>   `tools/blender/README.md`: camera-facing walls in the mid band, tops and ground in the light band, far faces in
>   the shadow band. `palettize.py` snaps flat colours to the world palette. The light and shadow tones of a flat
>   colour are its ramp neighbours; below a ramp's lowest step the shadow falls into slate, then ink.
> - **Output.**
>   - Characters render in 128 px display cells with the feet at row 112 (64 px packed, feet at 56), and `die` in
>     256 px cells with the feet at the centre.
>   - Kit pieces, props and slices render per footprint (SPRITES 10.5).
>   - EEVEE uses Filter Size 1.0, no dither and a transparent film.
>   - `Feet` pivots are written at the display scale. The finish halves them with the frame.

#### S5.4 ASSETS 6.3, three sentences

- **Characters**, the third sentence becomes: "V1 art = one look per card of the deck (`looks.json`), 5 clips (idle
  8f, walk 8f, swing 6f, interact 8f, die 8f), 8 directions = 304 frames per pass, 3 passes (body, scarf, blood),
  built from code on one five-head base body and one armature (`tools/blender/build_looks.py`). Frames are packed at
  64 px (128 displayed), each look ≤ one 1024² page and its overlays ≤ one 1024 x 512 page."
- **Props, items, clues**, the sentence "Higgsfield 2D output is restricted to UI-only images..." becomes:
  "Higgsfield 2D output is used for the illustrations the DOM shows (portraits, the ONUB rooms, cards, tokens) and
  for concept turnarounds and style boards. Every sprite drawn in the Phaser world is a rig render, so its
  projection, pivot and frame-to-frame registration are exact. The reference images and composition clauses are in
  `style.json` (6.4)."
- **UI and role cards**, the clause "role portraits 384x576 WebP lazy-loaded by `roleId` after `roleReveal`,
  upscaled from 512 to 1024 with Higgsfield before downsampling" becomes: "card portraits 384 x 576 lossless WebP,
  one per look (`portrait_<lookId>`) and one per ONUB role (`onub_portrait_<roleId>`). Each is generated at 2:3 and
  finished to a 128 x 192 art grid (6.11). The whole deck's portraits load before the role card closes."

#### S5.5 ASSETS 6.4, the whole section

> ### 6.4 Higgsfield prompt guide
>
> **How a prompt is built.** Every prompt is assembled from `packages/content/data/style.json`, in this order:
>
> 1. the composition clause for its kind of image (`compositions`: `diorama`, `level`, `object`, `figure`,
>    `portrait`), with `{KEY}` filled in;
> 2. "Subject: " and the subject line from the session's batch file;
> 3. `styleFormula`, byte for byte;
> 4. `styleAvoid`.
>
> The composition's reference images (`references`, cropped as listed) go in as `image_references`, plus any
> subject-specific reference the template names: the role's own night scene for an ONUB portrait, the look's
> turnaround for a main-mode portrait, the three station images for the Brick Oven.
>
> **Settings.** One model and one set of settings (2k resolution, high quality) for every image of a batch. The
> CREDITS row records the model the connector reports. Re-state "five heads tall" and "no drawn eyes" in the subject
> when a figure drifts.
>
> **The templates** (subjects, aspect ratios and references for each round-5 asset) are in
> `docs/round5/art-plan.md` section 2:
>
> | Template | Composition | Used for |
> |---|---|---|
> | T1 | room diorama | the Brick Oven |
> | T2 | level board | world style boards |
> | T3 | figure turnaround | look concepts |
> | T4 | portrait | card portraits |
> | T5 | object cutout | cards, tokens, mini-game sprites, the kitchen pass |
>
> **Batch files.** Each generation is listed in `tools/sprites/batches/<session>.json`: key, template, subject,
> references, key colour, crop and, once made, the generation id. A shipped image can therefore be traced and
> re-made.
>
> **Image to 3D.** Not used in round 5. Whether CC0 (A17) covers generated meshes is still open, and the Meshy
> terms row is not saved. Scene Builder and the paid-plan rule are unchanged.

#### S5.6 ASSETS 6.9, the "Style contract" paragraph

> **Style contract (A-style, round 5).** The STYLE FORMULA, its STYLE TOKEN (at most 120 characters, for
> length-limited fields), the avoid clause, the composition clauses and the reference images are frozen in
> `packages/content/data/style.json`. Every image prompt inserts them byte for byte (6.4), and the pixel finish (6.11)
> snaps every result to the world palette (6.1). Changing any of them reopens the art approval gate and invalidates
> generated assets. The owner approves one test render per output class (world, character, ONUB illustration) before
> a batch merges. The world's test render comes twice, from the same rig and scene: with the pixel finish on and off.
> The owner's answer sets `style.json` `pixelFinish.enabled.main` (6.11); the ONUB art always keeps the finish.

#### S5.7 New ASSETS 6.11, Pixel finish

> ### 6.11 Pixel finish
>
> Every rendered or generated image passes through `tools/sprites/pixel.ts` before it is packed or shipped. Its
> settings are `style.json` `pixel` and the palette is `palette.json` `world`.
>
> **Renders** (Blender, display scale) become frames at half size:
>
> 1. Alpha is cut at `alphaCut` (0.5): 0 or 255.
> 2. Each opaque pixel snaps to the nearest world-palette colour in OKLab.
> 3. A 2 x 2 mode downscale. A packed pixel is opaque when at least 2 of its 4 source pixels are. Its colour is the
>    most frequent of them, and a tie goes to the darkest, so one-pixel outlines and creases survive.
> 4. The frame's `Feet` pivot and cell size halve with it.
>
> **Generated images** (Higgsfield, 2k) become art grids:
>
> 1. **Cutouts only:** background removal, then a chroma key clears every pixel within `keyTolerance` (OKLab) of
>    the key colour (alone, it does the whole job when background removal failed). Spill cleanup follows: an edge
>    pixel whose hue is within 30° of the key's, with a saturation over 0.3, takes the colour of its nearest
>    interior pixel.
> 2. Crop to the target aspect (centre, or the batch file's crop box).
> 3. Box downscale to the target art grid, alpha-weighted.
> 4. Cut alpha and snap to the palette as for renders.
> 5. **Cutouts only:** a one-pixel `ink` outline on the transparent pixels that touch the subject.
>
> **Shipping.** DOM illustrations are scaled up by `illustrationScale` (3) with nearest scaling and written as
> lossless WebP (`webpQuality` 100). World frames are packed into PNG atlases as before and drawn at `iso.artScale`
> (2) with `filter: 'nearest'` (`linear` with the main mode's finish off, below).
>
> **Pages drawn at display size.** The ground tileset (doubled into its 128 x 64 cells, SPRITES 10.12), `clues` and
> `vfx` are finished and then doubled with nearest scaling, so they are drawn at scale 1.
>
> **The switch** (`style.json` `pixelFinish.enabled`, one value per mode). The owner's Gate A answer sets `main`;
> `onub` is always on.
>
> - **What it covers.** Off, it changes only the main mode's rig renders: the world atlases, the ground tileset,
>   `clues`, `vfx` and the lobby thumbnails. Generated pixel art (portraits, cards, the ONUB images) always takes
>   the finish, because the snap is what puts a generation on one grid and one palette.
> - **Renders with the finish off.** The same raw renders are box-downscaled 2 x 2 instead of snapped and
>   mode-halved. Partial alpha is kept and alpha-bled (`bleed.ts`), and the client draws those textures with
>   `linear` filtering. Pages drawn at display size ship the display-scale render, alpha-bled.
> - **What does not change.** Cells, pivots, packed sizes, draw scales and every texture budget are the same
>   either way. Off thumbnails are box-resized to 480 x 270 and written at `offWebpQuality` (90).
> - **One switch.** Nothing in the main mode is hand-fixed after the finish. Every asset is re-made by its script
>   from its raw render, so flipping the switch is a re-run of the batch scripts and the pixel CLI, plus the
>   manifest filters that `manifest.test.ts` checks against the switch.
>
> **Determinism.** The finish is deterministic, so unchanged inputs give byte-identical outputs.
> `tools/sprites/test/pixel.test.ts` covers alpha, snapping, the darkest tie, the outline, both settings of the
> switch and lossless WebP.

**SPRITES 10.3, the render text: the single source (ruling C6).** SPRITES 10.3 (`docs/SPRITES.md`) quotes these two paragraphs
word for word in place of its "Scale" bullets and its "Pixel finish" paragraph. ASSETS 6.2 (5.2 above) says the
same in its own words.

> **Scale.**
>
> - Every frame is rendered at the **display scale**, 90.51 px per ground metre: `ortho_scale` = output width in
>   px / 90.51, so a 1 m tile is a 128 x 64 diamond. It is finished to **packed size**, half that, by
>   `tools/sprites/pixel.ts` (ASSETS 6.11), so packed density is 45.255 px per ground metre and a 64 px packed
>   cell spans √2 m, one tile diagonal.
> - Packed frames (kit, buildings, props, characters) are drawn at `iso.artScale` 2, and the display-size pages
>   below at 1. With the main mode's pixel finish on (`style.json`
>   `pixelFinish.enabled.main`), every world texture is drawn with `filter: 'nearest'`, the pixel look, except
>   `clues`, which the decal transform rotates and which stays `linear`. With it off, every world texture is
>   `linear`.
> - **Heights are rendered at 0.75 of true scale** (`iso.zScale`). Environment assets sit under a root empty
>   scaled (1, 1, 0.75). Characters and creatures sit under one scaled 0.75 on every axis, so they keep their
>   proportions.
> - Displayed results: 59 px per vertical metre; a 1.7 m villager is about 100 px; nothing standing is taller than
>   112 px (`maxStandingSilhouettePx`).
>
> **Pixel finish.** Every frame is rendered at the display scale and finished at packed size by
> `tools/sprites/pixel.ts` (ASSETS 6.11). With the finish on, alpha is 0 or 255, every pixel is a world-palette
> colour, and a 2 x 2 mode downscale keeps one-pixel lines; alpha bleed is harmless and no longer needed under
> nearest filtering. With it off, a 2 x 2 box downscale keeps partial alpha and the frames are alpha-bled
> (`bleed.ts`) for linear filtering. Either way, frames are packed with trim and padding 2, and cells, pivots and
> packed sizes are the same. The ground tileset, `clues` and `vfx` are drawn at display size: finished, then
> doubled with nearest scaling (or, with the finish off, shipped at the display scale).

#### S5.8 What the gate reopens

These no longer match the formula and leave the shipped set in round 5:

- the 2026-10-10 toon-noir concepts, which stay in `assets/source/concepts/` as history;
- the 40° rig renders: `char_villager`, `ovl_villager`, `props`, `clues`, `vfx`, the four `bld_*_ext` stand-ins and
  the six `tiles_*` sets;
- the loft images.

Each is replaced under the same key, or removed, by the session named in the art plan; until then its key is on the
`LEGACY` allowlist (art plan 1.7). The real `char_villager` and `ovl_villager` are removed, not replaced: in round
5 they load only with `?art=placeholder` (ruling C11, art plan 4.2). The calibration sheet is re-rendered under
IsoCam (5L, PR L1).
