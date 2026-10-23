# tools/sprites (`@wdi/sprites`)

Turns rendered frames into the atlases the client loads (`docs/SPRITES.md`). TypeScript run through `tsx`
(Node >= 22.12, no reliance on Node's own type stripping); no build step.

| File | Does |
|---|---|
| `keys.ts` | Directions, passes, V1 clips, the frame regex, and the key builders (`char/<body>/<anim>/<dir>`, `<pass>/...`) |
| `pack.ts` | `packFrames` on free-tex-packer-core with the `ASSETS.md` 6.3 settings (`Phaser3` exporter, no rotation, trim, detect identical, power of two, padding 2, extrude 1, 2048 max, sorted inputs); pages are always named `<key>-<n>.png` and merged into one multiatlas JSON. `packCharacter` packs `char_<body>` and `ovl_<body>`; the CLI packs a `batch_render.py` output folder |
| `gen-anims.ts` | Writes each frame's Feet pivot (feet / untrimmed cell) into the atlas and builds Phaser `load.animation` JSON: 12 fps, loops repeat, one-shot clips hold the last frame |
| `bleed.ts` | Alpha bleed: transparent pixels next to the sprite take their neighbours' colour (alpha stays 0) so linear filtering never pulls in black and draws an ink halo; reads and writes 8-bit RGBA PNG through `node:zlib` because canvas libraries premultiply and would zero that colour. `readRender` bleeds every rendered frame before packing; the placeholder art is not bled and stays byte-identical |
| `pack-static.ts` | Packs a static sheet render (`clues`, `props`, `vfx`, and since round 5 the `iso_kit_<theme>` atlases after the pixel finish, capped to their budget page with `packCapped`; both take the finish switch `on`, extrude 0 when on and padding 1 + extrude 1 when off) with the same settings: frame names must equal the `docs/SPRITES.md` 8 keys in `keys.ts`, pivots from the render manifest (props and vfx), and `vfx.anims.json` (12 fps, played once) for the vfx |
| `images.ts` | Finishes the single-image keys rendered by `tools/blender` (`build_tiles.py`): checks each key's size, alpha-bleeds and re-encodes it (dropping the render's date stamp, so files are byte-identical across renders) and joins each tileset's four 64 px variants into its 256 x 64 row |
| `body-contact.ts` | Review sheet of the body on the floor: the last `die` frame in 8 directions, one row per trait look plus a Bloody row |
| `contact.ts` | Contact sheet for review: every clip x direction with the scarf (tinted teal) and cap composited, plus one strip of each pass alone |
| `placeholder.ts` | The core: generates every placeholder key of `SPRITES.md` 8 into `apps/client/public/assets/placeholder/` with its `manifest.json`, collecting the stand-ins of the three modules below (sorted by each stand-in's `order`) |
| `placeholder-kit.ts` | Core too: the palette, font, PRNG and drawing helpers, and the `PlaceholderEntry` contract (`order`, manifest `entries`, `files()`) |
| `placeholder-world.ts`, `placeholder-chars.ts` | One module per art session (5K, 5L), each exporting `placeholderEntries()`: today the clues, props, building exteriors and tilesets; the villager and vfx. A session edits only its own module |
| `oklab.ts` | sRGB to OKLab, the `#RRGGBB` helpers, and the HSV hue and saturation of the cutout spill test |
| `palette.ts` | Reads `packages/content/data/palette.json` and `style.json` directly (no `@wdi/content` dependency): `WORLD` (the 64 world-palette colours, file order), `worldPalette`, `nearestIndex` (cached, ties to the darker), `DARK_RANK`, `SATURATED`, `finishEnabled` (`style.json` `pixelFinish.enabled`), `outlineRgb` |
| `pixel.ts` | The pixel finish of `ASSETS.md` 6.11: alpha cut, snap to the world palette in OKLab, 2 x 2 mode halve (ties to the darkest), box resize, `finishRender` / `finishDisplay` (both follow the main-mode switch), `cleanCutout`, `outline`, `finishIllustration` (always finished), lossless WebP, `audit`; the CLI finishes a render folder and halves its manifest's `cell`, `feet` and `pivot` |
| `tileset.ts` | The isometric ground tilesets `iso_ground_<theme>` (`SPRITES.md` 10.12): masks each `build_ground.py` render to its diamond, pixel-finishes it (or, with the switch off, bleeds the display render), draws the 15 edge overlays (a periodic noise fringe reaching about 30% in, rimmed one ramp step darker) and joins the 1280 x 1792 sheet; CLI `tileset <render dir> <out dir> [--finish on\|off]` |
| `review-world.ts` | Review sheets composited from the packed atlases by the `SPRITES.md` 10.2 projection: `gate` (Gate A's Hollowmere square by day and night, zoom 1 and 2, with `--finish on\|off` filtering), `ground` (a test patch with blends), `kit` (every kit frame on a ground cell), `atlas` and `buildings` (every frame of a packed sheet), and `thumbs`, which writes the shipped `thumb_<mapId>.webp` (480 x 270, a 160 x 90 art grid tripled) |
| `slice.ts` | Cuts `build_buildings.py` renders into one slice per footprint tile (`SPRITES.md` 10.5): pixel-finishes the frame, assigns each packed pixel to the tile most of its 2 x 2 source block stands over in the raw tile map (the nearest coded pixel at uncoded edges, overhangs clamped to the footprint), and writes full-canvas slices `<art>#<dx>_<dy>` with a static-sheet manifest; CLI `slice <render dir> <out dir> [--finish on\|off]` |
| `world.ts` | Every 5K key in every `style.json` `artStyles` style (DECISIONS A79): tilesets, kits, props, clues, sliced props and buildings and thumbnails from the raw renders, finished per `pixelFinish` and packed into `<assets>/<style.root>`; a style other than the root one gets those keys in its own `manifest.json` with its `filter`. CLI `world <render dir> <assets dir> [--work <dir>] [--style <id>]` |
| `refs.ts` | Writes every `style.json` `references` entry, cropped, to `build/refs/<composition>-<index>-<stem>.png` (the Higgsfield `image_references` inputs) |
| `test/pack.test.ts` | Synthetic frame set: trim and source sizes, determinism, detectIdentical, pivots, anim keys |
| `test/pack-static.test.ts` | Static keys against the placeholder clues, props pivots, centred clues, determinism, vfx anims, refusal of a wrong key set |
| `test/images.test.ts` | Image sizes, determinism and the tileset join |
| `test/manifest.test.ts` | The real and placeholder manifests carry the same keys, types, `maps` and `modes` (the villager placeholder-only once it leaves `LEGACY`); no key carries a mode other than `main`; round-5 world textures filter by the pixel-finish switch, `clues` linear |
| `test/legacy.ts`, `test/legacy.test.ts` | The `LEGACY` allowlist (art plan 1.7): real-manifest keys whose art predates the round-5 style, skipped by the palette and budget tests; each key listed once and still in the real manifest |
| `lineup.ts` | Session 5L's review sheets and portraits: `sheets` (`looks-lineup.png`, `looks-silhouettes.png`), `portrait` (a T4 generation finished to `portraits/portrait_<lookId>.webp`), `portraits` (`portraits-main.png`), `gate-b` (`gate-b-character.png`) |
| `batches/5L.json` | Every 5L Higgsfield generation: template, subject, references, job ids and the pick (art plan 2.2) |
| `test/looks.test.ts` | `looks_spec.py`'s looks equal `looks.json`'s world looks plus `villager`; every look in both manifests holds 304 frames of five clips in 8 directions in `char_`, `scarf/` and `blood/` in `ovl_`, one pivot per frame across the passes |
| `test/realAssets.ts` | The real manifest's non-`LEGACY` images and atlas pages with their sizes and bytes (PNG and WebP headers), for the two tests below |
| `test/palette.test.ts` | Every page of the real manifest is world-palette colours with alpha 0 or 255 and at most 10% saturated (art plan 1.7), skipping `LEGACY` keys and, while the main finish is off, the main-mode rig renders; the IsoCam calibration sheet is finished |
| `test/budget.test.ts` | The page caps of art plan 1.4, one body and one overlay page per look, each map's environment plus the boot atlases plus the 10 largest looks within 6 pages, and the DOM byte caps (portraits 0.8 MB, thumbnails 0.2 MB) |
| `test/pixel.test.ts` | Snap, mode halve with the darkest tie, box resize, alpha cut, both settings of the switch, cutout key, spill and outline, lossless WebP, manifest halving, determinism |
| `test/tileset.test.ts` | The diamond mapping, the sheet layout and gids, base cells filling their diamond, cell 19 empty, each overlay on its sides only, palette and alpha with the finish on, determinism, and the shipped sheets' size and audit |
| `test/props.test.ts` | Every prop kind (but `decor` and `teachingClue`), every decor id tail, spot variant and portal face of both maps' scenes resolves to a frame by the `SPRITES.md` 10.13 lookup; the `props`, `props_<mapId>` and `clues` atlases ship exactly their frame lists in both manifests, within their page caps and, under the finish, in world colours with hard alpha and under the saturated share |
| `test/kit.test.ts` | Both manifests' `iso_kit_<theme>` atlases hold the 44 frames with their art cells and tile-centre pivots on pages within 1024²; the shipped pages are world colours with hard alpha under the finish |
| `test/slice.test.ts` | Tile assignment by majority, edge fallback and footprint clamp on a fixture; the shipped `bld_<mapId>` atlases hold only slices that share their building's pivot, on pages within 2048 x 1024, under the finish in world colours |
| `test/refs.test.ts` | Every reference file exists, every crop lies inside its image, output names are unique |
| `test/world.test.ts` | Each shipped style manifest holds every 5K key with the 8-bit URL, frame names, source sizes and pivots, pages within their caps, full ground sheets and thumbnails under 100 kB |
| `test/bleed.test.ts` | PNG round trip, one and two bleed rings, determinism |

```sh
pnpm --filter @wdi/sprites test
pnpm --filter @wdi/sprites placeholder            # regenerate the placeholder art (byte-identical when unchanged)
pnpm --filter @wdi/sprites images ../../build/render ../../apps/client/public/assets   # buildings, tiles
pnpm --filter @wdi/sprites pack ../../build/render/villager ../../apps/client/public/assets/chars
pnpm --filter @wdi/sprites contact ../../build/render/villager ../../assets/source/review/villager-contact.png
pnpm --filter @wdi/sprites pack:static ../../build/render/props ../../apps/client/public/assets/props
pnpm --filter @wdi/sprites contact:body ../../build/render/villager ../../assets/source/review/villager-body-contact.png
pnpm --filter @wdi/sprites refs ../../build/refs  # style.json reference crops (default out dir: build/refs)
pnpm --filter @wdi/sprites world ../../build/render ../../apps/client/public/assets   # every 5K key, each art style
pnpm --filter @wdi/sprites pixel <raw> <out> [--display] [--finish on|off]   # finish a render folder to packed size
```

Placeholder labels use Inter (OFL) from `@fontsource/inter`; no other font is used. New dependencies
(caret-pinned to the current release on 2026-10-10): `free-tex-packer-core` ^0.3.9, `@napi-rs/canvas`
^1.0.11, `@fontsource/inter` ^5.3.0; `tsx` ^4.23.0 (dev, the pin of `docs/ARCHITECTURE.md` 5.1) since 2026-10-10 round 2.
