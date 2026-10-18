# Asset Pipeline and Style Guide

> Generated from `docs/MASTER_PLAN.md` (v0.1, 2026-10-10). Palette, Blender render rig, per-asset-class pipelines, Higgsfield and Adobe usage, licensing policy, backlog and budgets.

## 6. Asset pipeline & style guide

### 6.1 Palette and style

**Two palettes, one style (A-style, round 5).** `packages/content/data/palette.json` holds both.

- **The ten tokens** are the only colours of the DOM UI, the SVG icons, runtime tints and effects drawn in code: ink `#12141C`, slate `#2C3240`, fog `#6F7A8C`, bone `#D9D2C2`, mustard `#F2B33D`, teal `#2EC4B6`, magenta `#E04E9A`, blood `#B3121F`, lantern `#FFB457`, moon `#7FA8FF`. Runtime tints include the scarf tints, the teal interactable pulse, the magenta hazard mark and the faction colours.
- **The world palette** (`palette.json` `world`) is 64 colours in 16 named ramps, built from the owner's ONUB images. It holds every token but magenta. It is the only set of colours in rendered and generated art: world sprites, tiles, characters, portraits, cards and the ONUB rooms. Every shipped art pixel is one of its colours, fully opaque or fully transparent. The pixel finish (6.11) snaps to it, and `tools/sprites/test/palette.test.ts` checks every exported image. While the main mode's finish is off (`style.json` `pixelFinish.enabled.main`, 6.11), its rig renders are exempt.

**Light.**

- Lit faces take the warm, upper steps of their ramp.
- Shadow faces step down their ramp and lean cool, into slate, moon or ink.
- Ink is the deepest tone and the void behind every ONUB room. Black is never used.
- Saturated colours (`world.saturated`) cover at most 10% of a character frame and of any other image or page.
- Teal appears in art only as a light source (cave moss, the mere-rot), and magenta never.

**Characters.**

- The costume comes from the ink, slate, fog and bone ramps, skin from the skin ramp, and hair from ink, wood, fog or bone.
- A carried prop may add wood, brass, stone or lantern.
- The look's single accent covers at most a tenth of the frame.
- The scarf is the only strongly saturated colour on a walking figure.
- Five heads tall (1.7 m, head 0.34 m), with natural hands and boots and a simple face without drawn eyes.
- The standing silhouette is at most 1.75 tiles.

**Outlines and shading.**

- Outlines are one art pixel, near-black: the inverted hull on renders, the finish on generated cutouts.
- Three cel bands per surface, plus a few highlight pixels. CC0 textures are allowed and become dither when snapped.

Interactables pulse teal, hazards magenta. UI: Illustrator vector system, 2 px rounded ink strokes, paper-textured bone fills, mustard primary buttons, Art-Deco card frames; fonts Oswald + Inter (OFL, texts in `LICENSES/`) from day 1 in both Illustrator and the DOM. The DOM design system (tokens, components, the frames, the contrast table and the screen mockups) is `docs/UI.md`, implemented in `apps/client/src/ui/theme/` and `apps/client/public/assets/ui/`; its type and spacing scale is the `ui` block of `packages/content/data/style.json`.

### 6.2 Blender render rig

- Blender 5.2 LTS, EEVEE, colour management Standard, `render.dither_intensity = 0`, `film_transparent = True`, Filter Size 1.5, `eevee.use_raytracing = False`, materials `surface_render_method = 'DITHERED'`.
- **Camera (A49, round 5): orthographic `IsoCam`, rotation X = 60°, Y = 0°, Z = 45°.** This is the 2:1 dimetric view of GDD 3.13 seen from the south-east (screen up = world north-west; projection contract SPRITES 10).
  - **What it renders.** Every world asset class: ground, kit pieces, trees, buildings, props, characters and vertical effects.
  - **Scale.** Renders are made at the display scale, 90.51 px per ground metre (a 1 m tile is a 128 x 64 diamond). They are then finished at half size by `tools/sprites/pixel.ts` (6.11) and drawn at twice the size (`metrics.json` `iso.artScale`), with nearest filtering while the main mode's pixel finish is on and linear filtering when it is off (`style.json` `pixelFinish.enabled.main`, 6.11).
  - **Heights.** Heights render at 0.75 of true scale (`iso.zScale`): the environment through a root empty scaled (1, 1, 0.75), and characters through one scaled 0.75 on every axis. A vertical metre is therefore 59 display px (29.5 art px), and a standing 1.7 m figure about 100 display px.
  - **Walls.** 2.5 m full, 1.2 m half, 0.3 m stub (`iso.wallHeightM`).
  - **Ground decals** keep the straight-down `TileCam` and its 64 px cells: footprints, smear, print, fur, claw, drag and blood pool. The client projects them through the decal transform (SPRITES 10.5).
- **Turntable.** Atlas direction i (screen frame, 0 = `n`) sets `TT.rotation_euler.z = 45° - i·45°`, so index 0 = n faces screen up (world north-west). The frame regex is unchanged.
- **Lights** stay parented to the camera, unchanged: a key sun from screen-left at azimuth 225°, elevation 55°, colour `#FFF1DC`; the moon area fill opposite; world slate at 0.15; no cast shadows.
- **Toon material.** The `WDI_Toon` group keeps its three constant bands. A texture input may replace the flat colour, for CC0 textures only. Session 5L re-measures the ramp stops under IsoCam's 30° view and records them in `tools/blender/README.md`: camera-facing walls in the mid band, tops and ground in the light band, far faces in the shadow band. `palettize.py` snaps flat colours to the world palette. The light and shadow tones of a flat colour are its ramp neighbours; below a ramp's lowest step the shadow falls into slate, then ink.
- **Output.**
  - Characters render in 128 px display cells with the feet at row 112 (64 px packed, feet at 56), and `die` in 256 px cells with the feet at the centre.
  - Kit pieces, props and slices render per footprint (SPRITES 10.5).
  - EEVEE uses Filter Size 1.0, no dither and a transparent film.
  - `Feet` pivots are written at the display scale. The finish halves them with the frame.
- `render_rig.blend` is built from code by `tools/blender/build_rig.py` (never committed) and contains a 1 m checker cube with a facing marker and a grid plane with 1 m lines; `batch_render.py --smoke` renders the calibration sheet (`apps/client/public/assets/calibration/`) in M0 before any character work: the cube in 8 directions, the straight-down tile, and one `die` frame of a fallen 1.7 m proxy in its 256 px cell with the feet at the centre. A root `pnpm assets:render` alias is Session A's to add; until then `pnpm --filter @wdi/blender render:smoke`.
- `batch_render.py` renders material-override passes through the same rig: body, `scarf` (grey toon-ramped, tinted at runtime), `hat_cap`, `hat_bowler`, `blood` (torso + hands mask). `palettize.py` snaps every imported material to the nearest palette entry and fails on untextured PBR.

### 6.3 Pipelines per asset class

**Characters.** Concept: Higgsfield image generation in character-consistency mode with the hero reference image attached, then its multi-angle mode for a turnaround; save to `assets/source/concepts/`. Mesh: KayKit or Kenney CC0 rigs as block-out, or Higgsfield image-to-3D (low-poly, quad, A-pose, 5-8k tris) cleaned in Blender (decimate <= 6k, flat-shaded, palette material). Rig and clips: Mixamo (idle, walk, run, carry, die) imported with the Mixamo Rig extension; interact / swing / hide posed with Rigify. V1 art = one look per card of the deck (`looks.json`), 5 clips (idle 8f, walk 8f, swing 6f, interact 8f, die 8f), 8 directions = 304 frames per pass, 3 passes (body, scarf, blood), built from code on one five-head base body and one armature (`tools/blender/build_looks.py`). Frames are packed at 64 px (128 displayed), each look ≤ one 1024² page and its overlays ≤ one 1024 x 512 page. Pack with free-tex-packer-core: exporter `Phaser3` (the multiatlas JSON layout Phaser 4 still loads), `allowRotation: false`, `allowTrim: true`, `detectIdentical: true`, `pot: true`, padding 2, extrude 1, max 2048², deterministic (sorted inputs). Budget 2 pages for the body, 1 for overlays. Alpha-bleed edge colours (`tools/sprites/bleed.ts`, applied to every rendered frame before packing) to avoid ink halos. Body ids are never role names.

*What shipped for V1 (Session H, 2026-10-10).* Three Higgsfield concept passes (`assets/source/concepts/villager-chibi-attempt{1,2,3}.png`, 1.5 credits) closed in on the formula but never reached it: 4.5, 3.7 and 3.6 heads tall, and no true three-quarter view. Attempt 3 has the right flat two-tone cel and ink and is the concept of record. The body is therefore the block-out fallback, not image-to-3D: `tools/blender/build_villager.py` builds it from code, 1,388 triangles of chamfered boxes in 23 parts, exactly 3 heads tall at 1.7 m (head, coat and legs one third each), oversized hands, block boots, a `fog` vest, palette colours only, an 8-bone armature and the four V1 clips keyframed by hand (no Mixamo, so no `.blend` licence constraint). Two limits came from the rig rather than the model: the 128 px cell holds only 16 px of ground below the feet row, so the walk takes 12° steps on a narrow stance (a longer stride or a wider boot crosses the cell edge in the diagonal views); and a body lying along the view axis foreshortens into something like a standing figure, so `die` ends spread-eagled, which reads as fallen from all 8 directions. Packed result: `char_villager` is one 2048² page (240 frames, budget 2), `ovl_villager` one 2048² page (960 frames, budget 1), 160 anim keys identical to the placeholder's, packing byte-deterministic; two walk frames (`se` 000, `sw` 004) lose one or two anti-aliasing pixels of outline (alpha at most 0.15) on the cell's bottom row. Review sheet: `assets/source/review/villager-contact.png`. The `.blend` and the source GLB live in git-ignored `assets/external/villager/` and are listed in `assets/source/MANIFEST.md`. A later art pass can replace the block-out with a sculpted or image-to-3D mesh under the same part tags, bones and clip names; the atlas keys do not change.

**Buildings and environment.** Kit-bash in Blender from Kenney Fantasy Town / Mini Forest / Modular Cave (CC0) and Poly Haven textures, one `.blend` per building with `Exterior`, `Roof`, `Interior` collections; exterior rendered with roof (`bld_<id>_ext.png`), interiors built as Tiled layers from 64 px tilesets (not single floor sprites) so they share pages and y-sort; hero rugs under 1024² as sprites. Ground tile sets (grass, path, cobble, floorboards, cave rock, forest floor; 4 variants each) rendered straight-down to 64 px cells, seam pass in Photoshop, packed to `tiles_<biome>.png`. Until M6 every scene is an ASCII grid in JSON (`#` wall, `D` door, `S` spawn, `H` hiding spot, `B` body spot) that `tools/grid/export.ts` turns into both the Phaser tilemap and the nav bitmap; Tiled replaces the grid in M6 with the same `.nav.json` contract and layers `ground`, `decor`, `objects`, `collision`, `occluder`, `portals`, `interact`, `spawns`, `lights`. Since round 5, buildings and multi-tile props are cut into one slice per footprint tile (SPRITES 10.5), and ground sets are isometric diamonds (SPRITES 10.12).

*Stand-ins shipped for M3b (Session X, 2026-10-17).* Until the M6 kit-bash, the four Small-profile exteriors and the six ground sets are rendered from code through the rig instead of the flat placeholder drawings. `tools/blender/build_buildings.py` builds each house at the placeholder's geometry (`w` tiles wide, a 3 m wall, a roof `d` tiles deep, the image's bottom middle at the middle of the front wall's base, `origin: [0.5, 1]`): plastered walls on a stone plinth, a dark slate gable with shingle rows, a short front eave, the door, lit windows and one naming detail (the tavern's lantern sign, the apothecary's teal panes and mortar, the widow's dark windows and wreath, the bakery's loaf sign and flue). `tools/blender/build_tiles.py` renders four 64 px straight-down variants per set on a fixed seed; scattered marks stay inside the tile and the lattice sets (cobble, floorboards) repeat the same rows in every variant, so any variant tiles with any other; `images.ts` joins them into the 256 x 64 row. The real manifest no longer points into `placeholder/`.

**Props, items, clues.** World sprites through the rig at 64-128 px, multi-state props as `_open/_closed/_locked/_broken` and spots as `_shut/_open`. Clue variants: footprints x3 heights x3 mud tints, thread x3, felt x3, smear, print, wet bucket, fur, claw, drag smear. Higgsfield 2D output is used for the illustrations the DOM shows (portraits, the ONUB rooms, cards, tokens) and for concept turnarounds and style boards. Every sprite drawn in the Phaser world is a rig render, so its projection, pivot and frame-to-frame registration are exact. The reference images and composition clauses are in `style.json` (6.4). Icons: Illustrator 48 px grid, Export for Screens PNG @1x/@2x + SVG.

*What shipped for M3 (Session P, 2026-10-16).* No Higgsfield or kit asset: like the villager, every prop and clue is modelled from code in palette colours (`tools/blender/build_props.py`) and rendered through the rig with the character outline (-0.02 m), since they sit at the characters' 64 px per metre. The five square props (`prop_bell`, `prop_pump`, `prop_noticeBoard`, `prop_kitChest`, `prop_lanternPost_lit` / `_unlit`) render by `SpriteCam` in 192 px cells with the ground point 148 px down, which becomes each frame's pivot; one 128 x 1024 page. The 21 clues render one per 64 px cell: ground marks straight down by `TileCam` (they lie on straight-down tiles), the wet bucket by `SpriteCam`; thread and felt sit on a pale splinter and footprints carry a lighter mud lip, because `ink` and `slate` marks vanished on the dark ground without one; footprints and the drag segment point screen-up for the client to rotate, and the drag segment has no outline so segments chain; one 256 x 512 page. Review the sheets by rendering and packing them (`tools/blender/README.md`).

*What shipped for M3b (Session X, 2026-10-17).* The bakery of the quick mode (GDD 3.11) and its dark loft, again modelled from code in palette colours and rendered through the rig. Seven keys join the `props` atlas (`tools/blender/bakery_props.py`, rendered by `build_props.py`): `prop_wakeTable`, `prop_plate`, `prop_deadLoaf`, `prop_ledger`, `prop_oven`, `prop_basin` and `prop_flour_sacks` (the id-tail key of `bk.flour_sacks`, kind `taskSource`), each with its pivot on the ground under its `bakery.json` tile. A prop that spans tiles is modelled in tile units with its depth stretched by 1 / cos 40° (1.305 m per tile), so its rows land on the 64 px grid: the Wake Table (anchor `bk.wake_table`, its back row's middle tile) covers the ten plate tiles, each plate is rendered at the table's 0.78 m top so it sits on it when placed on its own tile, and three `prop_deadLoaf` ledge segments stack into one oven ledge; the client draws a plate's owner name, so there is no named-plate variant. One 1024 x 512 page. The loft is DOM, not a Phaser scene, so its art is three `type: image` keys rendered by `tools/blender/build_loft.py` and finished by `tools/sprites/images.ts`: `loft_backdrop` (1280 x 720, opaque: floorboards, the gable with the round storm window in moon glass with rain and a flash, rafters, the moonlight on the floor, the ladder hatch glowing lantern from the shop below; the middle stays dark and empty for the bedroll grid and the copy) and `prop_bedroll` / `prop_bedroll_self` (112 x 184, twice the 56 x 92 px `.wdi-bedroll__blanket` of `mockups/loft.html`; a sleeper under a blanket, always occupied as A21 asks; the self roll differs only by its moon blanket stripes). The masters `bakery_props.blend` and `loft.blend` are saved by `tools/blender/save_masters.py` and listed in `assets/source/MANIFEST.md`. The `?art=placeholder` set now has `props`, `vfx` and the loft keys too, as unlabelled greybox marks on the real pivots and sizes (`tools/sprites/placeholder.ts`), so a playtest on it shows no labelled fallback.

**UI and role cards.** `WhoDidIt_UI.ai` with artboards per component; nine-slice panels with 24 px margins; one card frame per faction; a static card artboard for the Tab reopen; card portraits 384 x 576 lossless WebP, one per look (`portrait_<lookId>`) and one per ONUB role (`onub_portrait_<roleId>`). Each is generated at 2:3 and finished to a 128 x 192 art grid (6.11). The whole deck's portraits load before the role card closes. Reveal animation: CSS flip in V1; After Effects comp (shapes and solid fills only, no mattes or gradients) exported to dotLottie and played by `@lottiefiles/dotlottie-web` at DPR 1, 450x675, with `game.loop.sleep()` while the card is up, in V1.5.

*What shipped, ONUB v2 (Session 5M, 2026-10-18).* Every ONUB key of `docs/round5/onub-contract.md` 5.4 plus the mini-game atlas `onub_mini`, built by `tools/sprites/onub.ts build` (SPRITES 11): the owner's 13 rooms cropped to 16:9 and pixel-finished at 640 x 360 (no label fills were needed at that grid); the proofing room with its baked baker removed by a masked Higgsfield edit; the kitchen overview composited from the four station rooms around a generated pass; the 24 card faces and backs drawn in code at 80 x 112 around 18 generated objects and the four station rooms; the cloche; 15 role portraits and the neutral `onub_baker` at 128 x 192; every DOM image x3 lossless WebP, 1.4 MB in all. 78 Higgsfield generations (`flux_3_image` at 2k with the `style.json` references, and one `nano_banana_2_1` masked edit), traced in `tools/sprites/batches/5M.json`, with a CREDITS "Generated" row and a MANIFEST row each. The Brick Oven waits on the owner's pick of four candidates (`assets/source/review/gate-c-oven.png`), so `onub_station_oven`, its kitchen quadrant and `onub_loc_oven` ship the labelled greybox until then. The loft images left both manifests. The same build also writes the low-poly style (art plan 1.9) to `assets/lowpoly/onub/` and `assets/lowpoly/manifest.json`. It uses the same keys and sizes, smooth and unsnapped, 3.9 MiB in all (SPRITES 11).

**VFX and audio.** After Effects shape layers to PNG sequences (blood splat 12f, blood pool 8f, smoke 16f, lantern glow 8f, hit flash 4f, dust step 6f, vote stamp 10f) in one 2048² page; rain, fog and embers as 8 px particle emitters. Audio: OGG q5 + M4A 128 kbps, SFX -16 LUFS, music -18 LUFS, Audacity chain Normalize -> Loudness Normalization -> Export. V1: 8 SFX (footstep, door open/close/locked, pickup, scream, bell, vote) from Kenney and Freesound CC0, one ambient loop from a CC0 source; the 30-SFX list, 5 music stems and voice lines are post-beta. Premiere cuts playtest recordings into `PLAYTESTS/` notes and the beta trailer; Higgsfield video makes a 6 s landing loop (WebM <= 2 MB).

*What shipped for M3 (Session P, 2026-10-16).* After Effects is not available to the cloud sessions, so the four VFX the M3 loop needs are animated in code through the rig (`tools/blender/build_vfx.py`), frame by frame at 12 fps, palette colours only: `vfx_blood_pool` 8 f (straight down, 128 px), `vfx_blood_splat` 12 f (drops on a fixed seed falling from chest height to specks, 128 px), `vfx_vote_stamp` 10 f (a straight-down stamp that slams and lifts off a `blood` seal with a cross, 256 px; frames 0 and 5 clip on purpose as the handle enters and leaves) and `vfx_dust_step` 6 f (64 px, ends nearly empty). One 512 x 2048 page plus `vfx.anims.json`. Smoke, lantern glow and hit flash remain for the M6 pass, in After Effects or the same script.

### 6.4 Higgsfield prompt guide

**How a prompt is built.** Every prompt is assembled from `packages/content/data/style.json`, in this order:

1. the composition clause for its kind of image (`compositions`: `diorama`, `level`, `object`, `figure`, `portrait`), with `{KEY}` filled in;
2. "Subject: " and the subject line from the session's batch file;
3. `styleFormula`, byte for byte;
4. `styleAvoid`.

The composition's reference images (`references`, cropped as listed) go in as `image_references`, plus any subject-specific reference the template names: the role's own night scene for an ONUB portrait, the look's turnaround for a main-mode portrait, the three station images for the Brick Oven.

**Settings.** One model and one set of settings (2k resolution, high quality) for every image of a batch. The CREDITS row records the model the connector reports. Re-state "five heads tall" and "no drawn eyes" in the subject when a figure drifts.

**The templates** (subjects, aspect ratios and references for each round-5 asset) are in `docs/round5/art-plan.md` section 2:

| Template | Composition | Used for |
|---|---|---|
| T1 | room diorama | the Brick Oven |
| T2 | level board | world style boards |
| T3 | figure turnaround | look concepts |
| T4 | portrait | card portraits |
| T5 | object cutout | cards, tokens, mini-game sprites, the kitchen pass |

**Batch files.** Each generation is listed in `tools/sprites/batches/<session>.json`: key, template, subject, references, key colour, crop and, once made, the generation id. A shipped image can therefore be traced and re-made.

**Image to 3D.** Not used in round 5. Whether CC0 (A17) covers generated meshes is still open, and the Meshy terms row is not saved. Scene Builder and the paid-plan rule are unchanged.

### 6.5 Adobe usage and licensing

- Shipped assets may use only non-beta Adobe generative features and only Adobe's own generative model inside them; each use is logged in `CREDITS.md` (file, feature, date). No Substance 3D Assets or Adobe Stock files are committed, free or not. Adobe Fonts are never embedded; UI uses OFL fonts only.
- Library policy: CC0 by default (Kenney, KayKit, Poly Haven, Freesound CC0 filter, OpenGameArt CC0). CC-BY only with a `CREDITS.md` row (title, author, URL, licence, files). Banned: CC-BY-NC, CC-BY-ND, Synty in any form, Quaternius source packs (rendered sprites derived from them are allowed with a credit; the QAL forbids redistributing the packs), Pixabay audio (no standalone redistribution), raw Mixamo files. Any `.blend` containing Mixamo actions stays in `assets/external/` (gitignored); only rendered sheets are committed, credited as "animations: Mixamo, used under Adobe terms, not redistributed". itch.io packs count as CC0 only when sidebar tag, description and bundled LICENSE agree.
- AI outputs: tool, feature and date per asset in `CREDITS.md`; paid, watermark-free plans only; the vendor's terms recorded as a dated link (a saved copy when practical) in `LICENSES/vendors/README.md` before the first asset from that vendor lands. **AI-generated images are open source: CC0 1.0** (owner decision A17), since the vendor claims no ownership of outputs and purely generated images carry little or no copyright of their own.
- Root `LICENSE` (MIT, code) and `LICENSE-ASSETS`: hand-made original art (renders, vectors, audio) is **CC BY 4.0** (owner decision A19; legal code in `LICENSES/CC-BY-4.0.txt`). AI-generated images stay CC0 1.0 and third-party assets keep the licence in their `CREDITS.md` row.

### 6.6 Folder and LFS plan

Day 1 commits `.gitattributes` before any binary: LFS rules for `*.blend *.psd *.ai *.aep *.fbx *.glb *.wav` exist but nothing uses them yet, because the render rig is built from code (`tools/blender/build_rig.py`, 6.2) and no `.blend` is committed; every master (`.ai`, `.aep`, `.psd`, character `.blend`, source `.glb`) lives on the owner's laptop in the ROSW checkout under `studio/assets/who-did-it/<kind>/<slug>/` (git-ignored there, recorded by a studio note; see 6.10) and is listed in `assets/source/MANIFEST.md` with hash and date. Exports (`apps/client/public/assets/**`) are committed in plain git in batched "art drop" PRs; the deterministic packer keeps unchanged pages byte-identical; CI warns when a PR adds more than 25 MB of binaries. `ci.yml` checks out with `lfs: false`.

### 6.7 V1 asset backlog

| Tier | Asset class | Count | Chain | Hours |
|---|---|---|---|---|
| A (before the M3 gate, cap 60 h) | Palette, metrics, calibration render, rig `.blend` | 1 | Blender | 6 |
| A | Illustrator UI kit: Landing, Lobby, RoleCard frame x3, HUD chip, Notebook, Meeting board, Vote, Touch controls | 8 screens | Illustrator | 14 |
| A | Faction icons, trait icons (3x3), 12 item / clue icons | 24 | Illustrator | 6 |
| A | Base body, 4 clips, 8 directions + scarf / hat / blood passes | 1 body, 5 passes | Higgsfield concept -> Blender block-out (code) -> keyframed clips -> rig | 24 (shipped 2026-10-10 in about 3 h: 0.5 h concepts, 1 h body and clips, 1 h unattended render on llvmpipe, 0.5 h packing and tools) |
| A | Overworld greybox tiles (cobble, grass, path) | 3 sets | Blender straight-down | 6 |
| A | 8 SFX, 1 ambient loop | 9 | Freesound / Kenney, Audacity | 4 |
| B (M6 art pass) | Run / carry / hide clips for all passes | 3 clips | Blender | 10 |
| B | Building exteriors: tavern, apothecary, widow cottage, manor, barn, chapel | 6 | Kenney kit-bash -> rig | 18 (code-built stand-ins for the four Small-profile exteriors through the rig, 2026-10-17) |
| B | Interior tilesets and decor for 13 interior rooms | 13 | Blender + Tiled | 24 |
| B | Forest, cave, remaining ground tile sets | 3 | Blender + Photoshop | 12 (stand-ins for all six sets rendered straight down from code, 2026-10-17) |
| B | Props incl. 4-state doors, 2-state spots, task props (6) | 30 | Blender | 15 (the 5 square props, 6 frames, shipped for M3 in code, 2026-10-16) |
| B | Clue variants (footprints 9, thread 3, felt 3, smear, print, bucket, fur, claw, drag) | 21 | Blender / Illustrator | 8 (shipped for M3 in code through the rig, 2026-10-16) |
| B | Wolf (idle, walk, bite, die) | 1 | Higgsfield 3D -> Blender | 8 |
| B | Role portraits x9 + static card states | 9 | Higgsfield + Illustrator | 8 |
| B | VFX sheets | 7 | After Effects | 8 (4 shipped for M3 in Blender code: blood pool, blood splat, vote stamp, dust step; 2026-10-16) |
| B | Packing, anims JSON, contact sheet QA | – | Node tools | 8 |
| B | Bakery interior tileset; Wake Table; 10 plates (shut / cracked / turned); 3 dead loaves (shut / open); ledger (shut / open); cold oven; flour-floor decal | 1 scene + 6 props | Blender + Tiled | 10 (the V1 single-state props shipped in code, 2026-10-17: table, plate, dead-loaf ledge, ledger, oven, basin, flour sacks; the cracked / turned / open states and the flour decal wait for V1.1 traces) |
| B | Loaf and crumb-token icons; mode chip; dark-loft backdrop with bedrolls; swap-log timeline | 4 | Illustrator | 4 (the backdrop and both bedrolls rendered through the rig instead, 2026-10-17; the icons, chip and timeline remain UI art) |
| B | SFX crust crack, bread thud, oven creak; storm-loft ambience loop | 4 | Freesound CC0, Audacity | 2 |
| | **Total** | | | **60 + 135 = 195** |

### 6.8 Budgets

First load (engine ~1.2 MB gz + lobby UI + own card + overworld + body pages + overlays + UI audio) <= 12 MB, target 8 MB; everything else lazy per scene. Per map <= 1.8 environment page-equivalents of 2048², loaded with the map (SPRITES 10.13, 10.14), plus resident character pages; <= 6 pages resident (~100 MB VRAM uncompressed). PNG only in V1; compressed-texture variants only if M6 profiling shows VRAM pressure. Max texture 2048² (query `getMaxTextureSize()`). Sprites per scene <= 10 players + 30 overlays + 6 creatures + 1 200 static world sprites + 200 particles. Audio <= 6 MB in V1. Site <= 150 MB; CI reports dist size per scene manifest and fails above 120 MB.

### 6.9 Higgsfield tool map (verified against the live connector on 2026-10-09)

The pipelines in 6.3 and 6.4 use these concrete tools. Credits quoted are Higgsfield's own notes, not measured here.

| Need | Tool / workflow | How to call it |
|---|---|---|
| Consistent hero concept and turnaround | `character-sheet` workflow, then `generate_image` | Preset `3d-stylized` or `game-concept`, composition `turnaround / model sheet` (front, 3/4, side, back). Crop the sheet to one figure per file before any 3D step; Meshy fuses every figure in a frame into one object. |
| Concept image to rigged, animated GLB | `generate_3d`, model `meshy_v7_image_to_3d` (or `image_to_3d`) | `pose_mode: a-pose`, `should_texture: true`, `enable_pbr: false`, `enable_rigging: true` (humanoids only), `enable_animation: true` with `animation_action_id` (idle 0, walk 30, run 16; search the 678-clip library with `animation_actions`). Pick ONE of `model_type: lowpoly` (faceted look, no budget control) or `target_polycount` 5000-8000 (budgeted). Extra clips: `3d_rigging` on the result GLB, one clip per job. Merge single-clip GLBs with Higgsfield's bundled `glb_merge_anims.py` (fixes the root-bone scale bug) or in Blender through NLA tracks. |
| Better geometry from a sheet | `multi_image_to_3d` | 2-4 views of the same subject in the SAME pose; otherwise fall back to single view. |
| Restyle a good mesh | `meshy_v5_retexture` | Pass the STYLE FORMULA (or its token) as `text_style_prompt`; never regenerate a mesh for colour reasons. |
| Props from text | `meshy_v6_text_to_3d` (`model_type: lowpoly`) or `hunyuan3d_v3_1_text_to_3d` | Prop budget 1-5k tris; filler 0.3-1.5k. |
| Lift one object from a concept | `sam_3_3d` | Static mesh only. |
| Transparent 2D (icons, portraits, decals) | `generate_image` on a key colour, then `remove_background`; `upscale_image` for portraits | Key colour `#FF00FF` by default, `#00FF00` when the subject has pink or purple, `#0000FF` when both are taken. |
| Drive Blender or After Effects from a session | `/use-blender`, `/use-after-effects` local bridges | Only from a LOCAL Claude Code session on the machine that has Blender / After Effects; cloud sessions cannot install them. |

**Style contract (A-style, round 5).** The STYLE FORMULA, its STYLE TOKEN (at most 120 characters, for length-limited fields), the avoid clause, the composition clauses and the reference images are frozen in `packages/content/data/style.json`. Every image prompt inserts them byte for byte (6.4), and the pixel finish (6.11) snaps every result to the world palette (6.1). Changing any of them reopens the art approval gate and invalidates generated assets. The owner approves one test render per output class (world, character, ONUB illustration) before a batch merges. The world's test render comes twice, from the same rig and scene: with the pixel finish on and off. The owner's answer sets `style.json` `pixelFinish.enabled.main` (6.11); the ONUB art always keeps the finish.

**Why this matters for V2.** The GLB that Higgsfield or Blender produces for a character is rendered to sprites for V1 and loaded directly by the first-person renderer in V2. Keep every source GLB (outside the repo, listed in `assets/source/MANIFEST.md`).

### 6.10 Connection to the owner's ROSW repo (groot99-droid/Pipelines-Plugin)

The owner's plugins repo ("ROSW") is the studio behind this game. What lives where:

| Thing | Lives in | Versioned |
|---|---|---|
| Masters: `.ai`, `.aep`, `.psd`, character and building `.blend`, source `.glb` | ROSW checkout on the owner's laptop, `studio/assets/who-did-it/<kind>/<slug>/` (kinds: character, design, audio, video, 3d, ui, world) | No (git-ignored there); mirrored by path, hash and date in this repo's `assets/source/MANIFEST.md` |
| The record of how each master was made (brief, context, recipe, execute log, review) | ROSW `studio/vault/who-did-it/<kind>/<slug>.md`, written only by the studio pipeline (`studio-pipeline` skill, six checkpointed stages) | Yes |
| Every Higgsfield generation (prompt, model, settings, inputs, link) | ROSW `studio/library/catalog.json` + `thumbs/`, kept current with the `higgsfield-library-sync` skill | Yes (public: prompts and links become public when pushed) |
| Exports the game loads (atlases, tiles, icons, audio) | This repo, `apps/client/public/assets/**`, in batched art-drop PRs | Yes |
| The render rig | Built from code by `tools/blender/build_rig.py` in this repo; the `.blend` is never committed | Yes (the script) |

Studio pipelines already implemented in ROSW that this project uses: `still-image` (Higgsfield concepts, portraits, decals), `video-shot` (landing loop, trailer plates), `music-cue` (stems), `edit-2d` (Adobe connector: cleanup, defringe, atlas passes), `scene-blender` (Higgsfield scene builder in Blender 5.2 for block-outs), `scene-3d` (walkable Three.js rooms). The brand gates in ROSW scope the studio's own surfaces, not product work: this game's palette (6.1), fonts and style formula are its own Decisions in Force and are stated at a run's context stage, never filled from the gates.

The `ui-design` plugin from the same marketplace is registered for this repo by `.claude/settings.json` (approved by the owner on 2026-10-10):

```json
{
  "extraKnownMarketplaces": {
    "rosw": { "source": { "source": "github", "repo": "groot99-droid/Pipelines-Plugin" } }
  },
  "enabledPlugins": { "ui-design@rosw": true }
}
```

Contributors accept the folder trust dialog once and the plugin installs at the next session start. Alternatively run `claude plugin marketplace add groot99-droid/Pipelines-Plugin` and `claude plugin install ui-design@rosw --scope project`. Use its catalog search and contrast-checked design-system generator to turn `palette.json` into the DOM theme tokens and to review the Landing, Lobby and Meeting screens. The `rosw` plugin (creative-writing and studio) runs only from the ROSW checkout and is not enabled here.

**Studio project brief (open question 11, A23).** A later session with `groot99-droid/Pipelines-Plugin` attached for push opens one pull request there; this repo does not change. It adds: the `studio/assets/who-did-it/<kind>/` folders (kinds as in the table above) to that repo's `.gitignore`; an index note `studio/vault/who-did-it/README.md` that links this repo, `assets/source/MANIFEST.md` and this section; studio-note stubs for the two Higgsfield concepts in `assets/source/concepts/`, citing their catalog ids; and a `render-pipeline` skill whose scope is to run `tools/blender/build_rig.py`, `batch_render.py` and `palettize.py` from the who-did-it checkout and write a studio note per render batch. Studio notes stay pipeline-written, never by hand, so the stubs are created by running the pipeline's intake stage.

**Status (2026-10-10, Session J).** Done in ROSW draft PR #10 (`wdi/studio-project`): the generations library holds the two concepts (catalog id = Higgsfield generation id, `ab6c960d-28d9-4f48-b6bf-23def6ae3fb0` and `88a9ae17-2b15-4588-b1b5-9aba9459a90d`) and a `render-pipeline` skill documents master to `batch_render.py` to `pack.ts` to `apps/client/public/assets/`. Differences from the brief: `studio/assets/` is already git-ignored as a whole, so no `.gitignore` edit; ROSW has no project registry. Not done: the studio notes and the vault index `studio/vault/who-did-it/README.md`, because notes are written only by a studio pipeline run with the owner's go-ahead at each checkpoint (`still-image` for the concepts); the owner runs those from the ROSW checkout.

### 6.11 Pixel finish

Every rendered or generated image passes through `tools/sprites/pixel.ts` before it is packed or shipped. Its settings are `style.json` `pixel` and the palette is `palette.json` `world`.

**Renders** (Blender, display scale) become frames at half size:

1. Alpha is cut at `alphaCut` (0.5): 0 or 255.
2. Each opaque pixel snaps to the nearest world-palette colour in OKLab.
3. A 2 x 2 mode downscale. A packed pixel is opaque when at least 2 of its 4 source pixels are. Its colour is the most frequent of them, and a tie goes to the darkest, so one-pixel outlines and creases survive.
4. The frame's `Feet` pivot and cell size halve with it.

**Generated images** (Higgsfield, 2k) become art grids:

1. **Cutouts only:** background removal, then a chroma key clears every pixel within `keyTolerance` (OKLab) of the key colour (alone, it does the whole job when background removal failed). Spill cleanup follows: an edge pixel whose hue is within 30° of the key's, with a saturation over 0.3, takes the colour of its nearest interior pixel.
2. Crop to the target aspect (centre, or the batch file's crop box).
3. Box downscale to the target art grid, alpha-weighted.
4. Cut alpha and snap to the palette as for renders.
5. **Cutouts only:** a one-pixel `ink` outline on the transparent pixels that touch the subject.

**Shipping.** DOM illustrations are scaled up by `illustrationScale` (3) with nearest scaling and written as lossless WebP (`webpQuality` 100). World frames are packed into PNG atlases as before and drawn at `iso.artScale` (2) with `filter: 'nearest'` (`linear` with the main mode's finish off, below).

**Pages drawn at display size.** The ground tileset (doubled into its 128 x 64 cells, SPRITES 10.12), `clues` and `vfx` are finished and then doubled with nearest scaling, so they are drawn at scale 1.

**The switch** (`style.json` `pixelFinish.enabled`, one value per mode). It is the finish of the **8-bit** art style. The owner answered Gates A and C with both styles (A79): every asset ships finished in `8bit` and unfinished in `lowpoly` (`style.json` `artStyles`, SPRITES 5). The bullets below describe the unfinished output, which is the `lowpoly` style. In `lowpoly`, generated pixel art and the ONUB owner images ship unfinished too: key-removed and smooth-scaled, the owner images from their originals.

- **What it covers.** Off, it changes only the main mode's rig renders: the world atlases, the ground tileset, `clues`, `vfx` and the lobby thumbnails. Generated pixel art (portraits, cards, the ONUB images) always takes the finish, because the snap is what puts a generation on one grid and one palette.
- **Renders with the finish off.** The same raw renders are box-downscaled 2 x 2 instead of snapped and mode-halved. Partial alpha is kept and alpha-bled (`bleed.ts`), and the client draws those textures with `linear` filtering. Pages drawn at display size ship the display-scale render, alpha-bled.
- **What does not change.** Cells, pivots, packed sizes, draw scales and every texture budget are the same either way. Off thumbnails are box-resized to 480 x 270 and written at `offWebpQuality` (90).
- **One switch.** Nothing in the main mode is hand-fixed after the finish. Every asset is re-made by its script from its raw render, so flipping the switch is a re-run of the batch scripts and the pixel CLI, plus the manifest filters that `manifest.test.ts` checks against the switch.

**Determinism.** The finish is deterministic, so unchanged inputs give byte-identical outputs. `tools/sprites/test/pixel.test.ts` covers alpha, snapping, the darkest tie, the outline, both settings of the switch and lossless WebP.
