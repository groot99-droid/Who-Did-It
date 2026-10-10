# Asset Pipeline and Style Guide

> Generated from `docs/MASTER_PLAN.md` (v0.1, 2026-10-10). Palette, Blender render rig, per-asset-class pipelines, Higgsfield and Adobe usage, licensing policy, backlog and budgets.

## 6. Asset pipeline & style guide

### 6.1 Palette and style

Tokens in `packages/content/data/palette.json` are the only colours allowed in materials, UI and VFX: ink `#12141C`, slate `#2C3240`, fog `#6F7A8C`, bone `#D9D2C2`, mustard `#F2B33D`, teal `#2EC4B6`, magenta `#E04E9A`, blood `#B3121F`, lantern `#FFB457`, moon `#7FA8FF`. Shadows tint toward slate or moon, never black; saturated accents cover at most 10% of any frame; player bodies use desaturated slate / fog / bone variants so the scarf is the only saturated accent on a player. Proportions: 3 heads tall, oversized hands, block feet, max silhouette 1.4 tiles. Outlines: inverted hull, 1.5 px at shipping scale, `ink`. Interactables pulse teal, hazards magenta. UI: Illustrator vector system, 2 px rounded ink strokes, paper-textured bone fills, mustard primary buttons, Art-Deco card frames; fonts Oswald + Inter (OFL, texts in `LICENSES/`) from day 1 in both Illustrator and the DOM.

### 6.2 Blender render rig

- Blender 5.2 LTS, EEVEE, colour management Standard, `render.dither_intensity = 0`, `film_transparent = True`, Filter Size 1.5, `eevee.use_raytracing = False`, materials `surface_render_method = 'DITHERED'`.
- **Camera: orthographic, rotation X = 40°, Z = 0°** (yaw along +Y; screen up = world +Y). Vertical squash cos 40° = 0.77; a 1 m wall is 41 px tall on screen; a standing 1.7 m villager reads about 90 px. Ground tiles are rendered with a second straight-down camera (X = 0°) so they tile on the 64 px grid; buildings and props are rendered with the tilted camera and their footprints drawn to the straight-down grid.
- Turntable: Empty `TT` at the origin, character parented; direction i sets `TT.rotation_euler.z = -i * 45°`; index 0 = n (facing world +Y, screen up), then ne, e, se, s, sw, w, nw clockwise. Frame regex `^char_(\w+)_(idle|walk|run|interact|swing|carry|die|hide)_(n|ne|e|se|s|sw|w|nw)_(\d{3})$`.
- Lights parented to the camera: sun key az 225° (clockwise from world +Y, so from the camera side, screen left) el 55° strength 3 colour `#FFF1DC`, hard (angle 0); area fill opposite (az 45°) at the irradiance of a 0.6 sun, colour moon, 30 m out and 12 m wide so it is even across a sprite; world slate at 0.15; cast shadows off for every asset class. The first draft said az 315°, which lit the subject from behind and put every camera-facing surface in the shadow band; changed after the M0 calibration render (`tools/blender/README.md`). The owner confirmed 225° and the 256 px `die` cell (A25). Their follow-up (camera-facing faces and the ground rendered flat slate) is fixed by the 0.30 / 0.70 ramp stops below, and the sheet now carries a `die` frame; the re-rendered sheet awaits the owner's sign-off.
- Toon material: Diffuse BSDF -> Shader to RGB -> ColorRamp (Constant, stops 0.30 / 0.70) -> Emission (the ramp sees about 0.87 x N·L of the key: 0.35 on a camera-facing face, 0.77 on a top face or the ground; the first draft's 0.42 / 0.78 put both just under a stop, so front faces fell into the shadow band and tops and ground into the mid band); rim via Layer Weight facing 0.35. Outline: Solidify -0.02 m, flipped normals, backface-culled `OutlineInk` emission (-0.035 m for 64 px props).
- Output: 128 px cells rendered directly (no 256 -> 128 step) at 64 px per metre, `frame_step` for 12 fps, EEVEE overscan 3%; `die` alone renders 256 px cells with the feet at the centre because a fallen body reaches about 90 px below the feet (trim and the per-frame pivot make the cell size invisible to the client). A `Feet` empty is projected per frame into `manifest.json` as the pivot; the packer keeps `spriteSourceSize` so trim is reversible and `gen-anims.ts` writes per-frame origins.
- `render_rig.blend` is built from code by `tools/blender/build_rig.py` (never committed) and contains a 1 m checker cube with a facing marker and a grid plane with 1 m lines; `batch_render.py --smoke` renders the calibration sheet (`apps/client/public/assets/calibration/`) in M0 before any character work: the cube in 8 directions, the straight-down tile, and one `die` frame of a fallen 1.7 m proxy in its 256 px cell with the feet at the centre. A root `pnpm assets:render` alias is Session A's to add; until then `pnpm --filter @wdi/blender render:smoke`.
- `batch_render.py` renders material-override passes through the same rig: body, `scarf` (grey toon-ramped, tinted at runtime), `hat_cap`, `hat_bowler`, `blood` (torso + hands mask). `palettize.py` snaps every imported material to the nearest palette entry and fails on untextured PBR.

### 6.3 Pipelines per asset class

**Characters.** Concept: Higgsfield image generation in character-consistency mode with the hero reference image attached, then its multi-angle mode for a turnaround; save to `assets/source/concepts/`. Mesh: KayKit or Kenney CC0 rigs as block-out, or Higgsfield image-to-3D (low-poly, quad, A-pose, 5-8k tris) cleaned in Blender (decimate <= 6k, flat-shaded, palette material). Rig and clips: Mixamo (idle, walk, run, carry, die) imported with the Mixamo Rig extension; interact / swing / hide posed with Rigify. V1 art = one body, 4 clips (idle 8f, walk 8f, swing 6f, die 8f), 8 directions = 240 frames per pass, 5 passes (body, scarf, 2 hats, blood); run / carry / hide after the M3 gate. Pack with free-tex-packer-core: exporter `Phaser3` (the multiatlas JSON layout Phaser 4 still loads), `allowRotation: false`, `allowTrim: true`, `detectIdentical: true`, `pot: true`, padding 2, extrude 1, max 2048², deterministic (sorted inputs). Budget 2 pages for the body, 1 for overlays. Alpha-bleed edge colours (`tools/sprites/bleed.ts`, applied to every rendered frame before packing) to avoid ink halos. Body ids are never role names.

*What shipped for V1 (Session H, 2026-10-10).* Three Higgsfield concept passes (`assets/source/concepts/villager-chibi-attempt{1,2,3}.png`, 1.5 credits) closed in on the formula but never reached it: 4.5, 3.7 and 3.6 heads tall, and no true three-quarter view. Attempt 3 has the right flat two-tone cel and ink and is the concept of record. The body is therefore the block-out fallback, not image-to-3D: `tools/blender/build_villager.py` builds it from code, 1,388 triangles of chamfered boxes in 23 parts, exactly 3 heads tall at 1.7 m (head, coat and legs one third each), oversized hands, block boots, a `fog` vest, palette colours only, an 8-bone armature and the four V1 clips keyframed by hand (no Mixamo, so no `.blend` licence constraint). Two limits came from the rig rather than the model: the 128 px cell holds only 16 px of ground below the feet row, so the walk takes 12° steps on a narrow stance (a longer stride or a wider boot crosses the cell edge in the diagonal views); and a body lying along the view axis foreshortens into something like a standing figure, so `die` ends spread-eagled, which reads as fallen from all 8 directions. The `.blend` and the source GLB live in git-ignored `assets/external/villager/` and are listed in `assets/source/MANIFEST.md`. A later art pass can replace the block-out with a sculpted or image-to-3D mesh under the same part tags, bones and clip names; the atlas keys do not change.

**Buildings and environment.** Kit-bash in Blender from Kenney Fantasy Town / Mini Forest / Modular Cave (CC0) and Poly Haven textures, one `.blend` per building with `Exterior`, `Roof`, `Interior` collections; exterior rendered with roof (`bld_<id>_ext.png`), interiors built as Tiled layers from 64 px tilesets (not single floor sprites) so they share pages and y-sort; hero rugs under 1024² as sprites. Ground tile sets (grass, path, cobble, floorboards, cave rock, forest floor; 4 variants each) rendered straight-down to 64 px cells, seam pass in Photoshop, packed to `tiles_<biome>.png`. Until M6 every scene is an ASCII grid in JSON (`#` wall, `D` door, `S` spawn, `H` hiding spot, `B` body spot) that `tools/grid/export.ts` turns into both the Phaser tilemap and the nav bitmap; Tiled replaces the grid in M6 with the same `.nav.json` contract and layers `ground`, `decor`, `objects`, `collision`, `occluder`, `portals`, `interact`, `spawns`, `lights`.

**Props, items, clues.** World sprites through the rig at 64-128 px, multi-state props as `_open/_closed/_locked/_broken` and spots as `_shut/_open`. Clue variants: footprints x3 heights x3 mud tints, thread x3, felt x3, smear, print, wet bucket, fur, claw, drag smear. Higgsfield 2D output is restricted to UI-only images (notebook pages, portraits, inventory icons) with background removal and a Photoshop defringe; the calibration cube render is attached to every prompt as a reference. Icons: Illustrator 48 px grid, Export for Screens PNG @1x/@2x + SVG.

**UI and role cards.** `WhoDidIt_UI.ai` with artboards per component; nine-slice panels with 24 px margins; one card frame per faction; a static card artboard for the Tab reopen; role portraits 384x576 WebP lazy-loaded by `roleId` after `roleReveal`, upscaled from 512 to 1024 with Higgsfield before downsampling. Reveal animation: CSS flip in V1; After Effects comp (shapes and solid fills only, no mattes or gradients) exported to dotLottie and played by `@lottiefiles/dotlottie-web` at DPR 1, 450x675, with `game.loop.sleep()` while the card is up, in V1.5.

**VFX and audio.** After Effects shape layers to PNG sequences (blood splat 12f, blood pool 8f, smoke 16f, lantern glow 8f, hit flash 4f, dust step 6f, vote stamp 10f) in one 2048² page; rain, fog and embers as 8 px particle emitters. Audio: OGG q5 + M4A 128 kbps, SFX -16 LUFS, music -18 LUFS, Audacity chain Normalize -> Loudness Normalization -> Export. V1: 8 SFX (footstep, door open/close/locked, pickup, scream, bell, vote) from Kenney and Freesound CC0, one ambient loop from a CC0 source; the 30-SFX list, 5 music stems and voice lines are post-beta. Premiere cuts playtest recordings into `PLAYTESTS/` notes and the beta trailer; Higgsfield video makes a 6 s landing loop (WebM <= 2 MB).

### 6.4 Higgsfield prompt guide

Style suffix on every prompt: "stylized toon-noir, chunky low-poly 3-heads-tall proportions, flat two-tone cel shading, thick dark ink outlines, moody night lighting with warm lantern orange and cool moonlight blue, palette #12141C #2C3240 #6F7A8C #D9D2C2 #F2B33D #2EC4B6 #E04E9A, clean solid background, no text." Always attach the hero concept and the calibration cube; re-state "3-heads-tall" and "flat cel" on drift. Prompts: (1) turnaround sheet front/side/back/three-quarter of a villager in a grey vest, A-pose; (2) generic villager body in flat grey for palette swap, no accessories; (3) hunched wolf-shadow with teal eyes, readable from above; (4) house exterior from 40° above with lit windows, night; (5) dim parlour from 40° above, walls cut low; (6) cave chamber with teal moss; (7) tiling forest floor with fog; (8) single prop on plain background (brass key, bloodied knife, oil lantern); (9) hand-written note with a smeared thumbprint; (10) portrait bust in an Art-Deco frame. Image-to-3D: front view from (3) or (8), low-poly quad A-pose, auto-rig for humanoids only, then decimate, re-palette, outline. Scene Builder: block out a scene from prompts (4)-(7), pull the `.blend`, keep proportions and layout only, replace meshes with CC0 kit pieces. Paid plan only; never upload restricted third-party models.

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
| B | Building exteriors: tavern, apothecary, widow cottage, manor, barn, chapel | 6 | Kenney kit-bash -> rig | 18 |
| B | Interior tilesets and decor for 13 interior rooms | 13 | Blender + Tiled | 24 |
| B | Forest, cave, remaining ground tile sets | 3 | Blender + Photoshop | 12 |
| B | Props incl. 4-state doors, 2-state spots, task props (6) | 30 | Blender | 15 |
| B | Clue variants (footprints 9, thread 3, felt 3, smear, print, bucket, fur, claw, drag) | 21 | Blender / Illustrator | 8 |
| B | Wolf (idle, walk, bite, die) | 1 | Higgsfield 3D -> Blender | 8 |
| B | Role portraits x9 + static card states | 9 | Higgsfield + Illustrator | 8 |
| B | VFX sheets | 7 | After Effects | 8 |
| B | Packing, anims JSON, contact sheet QA | – | Node tools | 8 |
| B | Bakery interior tileset; Wake Table; 10 plates (shut / cracked / turned); 3 dead loaves (shut / open); ledger (shut / open); cold oven; flour-floor decal | 1 scene + 6 props | Blender + Tiled | 10 |
| B | Loaf and crumb-token icons; mode chip; dark-loft backdrop with bedrolls; swap-log timeline | 4 | Illustrator | 4 |
| B | SFX crust crack, bread thud, oven creak; storm-loft ambience loop | 4 | Freesound CC0, Audacity | 2 |
| | **Total** | | | **60 + 135 = 195** |

### 6.8 Budgets

First load (engine ~1.2 MB gz + lobby UI + own card + overworld + body pages + overlays + UI audio) <= 12 MB, target 8 MB; everything else lazy per scene. Per scene <= 2 environment pages of 2048² plus resident character pages; <= 6 pages resident (~100 MB VRAM uncompressed). PNG only in V1; compressed-texture variants only if M6 profiling shows VRAM pressure. Max texture 2048² (query `getMaxTextureSize()`). Sprites per scene <= 10 players + 30 overlays + 6 creatures + 150 props + 200 particles. Audio <= 6 MB in V1. Site <= 150 MB; CI reports dist size per scene manifest and fails above 120 MB.

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

**Style contract.** The style suffix in 6.4 is the project's STYLE FORMULA. It is frozen in `packages/content/data/style.json` with a STYLE TOKEN (at most 120 characters) for length-limited fields such as `texture_prompt`, and inserted byte-identical into every image, texture and 3D prompt. Changing it reopens the art approval gate and invalidates generated assets.

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
