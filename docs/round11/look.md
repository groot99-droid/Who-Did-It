# Round 11: materials, styles and budgets (11B)

The look half of the Blender makeover's pipeline plan (`docs/round11/README.md`, "11B"). It says what every world asset
is made of, how the three styles relate, what the characters carry, what each budget allows and what gives first, and
what a model must carry so V2 reuses it. Design only: nothing outside `docs/round11/` changes until the owner approves
`round11-plan.md`.

**Who owns what.** This document owns the materials, the palette, the styles and the budgets. 11A
(`docs/round11/pipeline.md`) owns the camera, the scale, the light directions and the list of passes; where a number
here depends on one of those, it says so and cites 11A's section. A number that lives in `GDD.md`, `ASSETS.md`,
`SPRITES.md` or `balance.json` is cited, not restated, except where this document measures it again.

**What was read.** `ASSETS.md` 6.1 to 6.11; `SPRITES.md` 1 to 6 and 10; DECISIONS A79, A80, A141, A144, A155, A161,
A162, A164; `docs/round8/art.md`, `docs/round8/motion.md`, `docs/round8/hd-look/`; `tools/blender/` (the rig, the
builders, `materials/`); `tools/sprites/` (`pixel.ts`, `pack.ts`, `hd.ts`, `test/budget.test.ts`,
`test/media.test.ts`, `test/budgets.ts`); `docs/round10/seams.md` (the `constable`); and the owner's ROSW repo
(`groot99-droid/Pipelines-Plugin`) read-only, including the `asset-3d` and `assemble-3d` pipelines added on
2026-10-29 (section 7).

**What was measured.** Blender 5.2.0 LTS (the `bpy` wheel) on Mesa llvmpipe in this container, with the repo's own
rig, `build_looks.py`, `batch_render.py`, `pixel.ts` and `pack.ts`, and the Poly Haven files of
`polyhaven.lock.json`. The sample sheets are in `docs/round11/samples/look/` (section 9). Every byte count below is
of files the repo's own tools wrote, unless it says "estimate".

## 1. Where the art stands today (2026-10-29)

### 1.1 What ships

| Set | Where | What is in it | Bytes |
|---|---|---|---|
| **8-bit** (the default) | `apps/client/public/assets/` | every world key, finished (pixel finish on, palette-snapped, indexed character pages) | the art in the first load: 10.99 MiB of 12 MiB |
| **Low poly** | `assets/lowpoly/` | every world key, unfinished, alpha-bled, RGBA pages | 37.68 MiB in all; its own first load would be 31.61 MiB (reported, not capped) |
| **HD** | `assets/hd/` | **no world art.** Only the 37 HD icon SVGs of `ui/icons/hd/` (8N). The HD pipeline exists (`--style hd`, `hd.ts`, `hd-manifest.ts`, the device gate, the 80 MB row), but its renders were only ever the look sheet and one crop (`docs/round8/hd-look/`) | 0 |
| The site | `public/assets/` | all of the above, audio, video, placeholders, UI | 75.01 MiB of 150 MiB |

Measured with `tools/sprites/test/media.ts` (`firstLoadBytes`, `styleBytes`, `siteBytes`) on
`origin/claude/zen-turing-m1jnw0` at 4a8e70f. The characters dominate both sets: 8-bit `chars/` is 10.1 MB of the
8-bit art (indexed pages of about 0.2 MB a look, plus 1.9 MB of anims json), low poly `chars/` 30.0 MB of 37.7.

The resident worst case is SPRITES 10.14's: 7.73 (8-bit) and 8.14 (low poly) page-equivalents on Hollowmere against
the cap of 9.

### 1.2 Where the art comes from

| Class | Made by | Material today |
|---|---|---|
| Ground | `build_ground.py`, `build_tiles.py` | Poly Haven textures by role (`GROUND_ROLES`), toon bands |
| Kit (walls, cliffs, fences, trees, boulders, stacks) | `build_kit.py`, `kit_import.py` (Kenney CC0 kits), `env/kits.py` | flat world ramps, some `KitTex_*` textured walls |
| Buildings, multi-tile props | `build_buildings.py` | flat ramps and `BldTex_*` walls |
| Props | `build_props.py`, `env/*_props.py` | flat ramps |
| Characters | `build_looks.py`, `look_parts.py`, `looks_spec.py` (15 looks) | flat ramps (`Look_<ramp>_<step>`), the three passes |
| Mobs, givers, nodes (M5b) | `m5b*.ts`, drawn in code; into the rig last (`pipeline.md` P9) | none (2D) |
| Effects | `build_vfx.py` for the boot `vfx` page; round 8's effects are runtime particles (A162) | flat |
| Portraits, cards, concepts | Higgsfield (ASSETS 6.4) through the pixel finish | generated |
| Round 10's greybox frames (beds, tools, the `constable` until its art) | greybox, or the `villager` on the client | none |

`--textured` (A164) swaps flat ramps for library roles before every render in any style, and HD adds its own finish
(`materials/hd.py`) and, for `bld_*` and `iso_kit_*`, the PBR finish (`materials/pbr.py`).

### 1.3 A defect found while measuring: figures never take `--textured` or the HD bands

`batch_render.import_character` appends the look's `Export` collection from its `.blend`. That file carries its own
copy of the toon node group, so after import every look material points at **`WDI_Toon.001`**, not the rig's
`WDI_Toon`. Two things key on the exact name:

- `retexture.mid_hex` finds no toon group, so `--textured` changes **no** slot of a figure. Measured: the baker's idle
  `s` frame 0, 8-bit, flat against `--textured`, is identical in every pixel of the raw render.
- `hd.smooth_toon_group` edits `WDI_Toon` only, so an HD figure keeps the 8-bit figure's stepped bands and no lantern
  rim. It does take the soft shadows, the ambient occlusion and the catcher, which act on the scene, not the group.

So the look sheet's `figure-hdtex` column and A164's description of the HD figure finish describe what the tools mean
to do, not what `batch_render.py` does with a `build_looks.py` file today. The fix is one line after the import (remap
every `WDI_Toon.*` group onto `WDI_Toon`, `bpy.types.NodeTree.user_remap`), and a test that renders a textured
figure and checks a material slot changed. It is a tooling change, so it is 11A's to plan (`pipeline.md` 5.4, first
in its build plan, reproduced there) and the build round's to make. 6Z was told on 2026-10-29 and has logged the
one-line fix for round 10's 10Y, before the `constable` render; the existing figure pages are not re-rendered now,
because round 11 re-renders them. The samples of section 9 apply the remap in a scratch wrapper, never in `tools/`.

## 2. The makeover's look in one paragraph

**One master set, three finishes.** Every world asset is one Blender model built by a script in `tools/blender/` (or
imported from a CC0 source, or from the owner's ROSW 3D pipeline, section 7), dressed in **role materials** only, and
rendered through 11A's one rig. A style is a finish applied at render and pack time, never a second model: 8-bit
snaps to the world palette and halves, low poly tones and posterises, HD renders at twice the scale with soft bands,
shadows and, for buildings and the kit, PBR (the owner's pick of A164). The world palette stays the colour identity
of every style, enforced exactly in 8-bit and by a tone check in the other two (3.3). The budgets of section 5 decide
how much of each finish ships.

## 3. Materials

### 3.1 One material graph: role, tint, finish

Today a surface's material is chosen three ways: a flat `WDI_Toon` with three hex tones (`static_common.hex_toon`,
`look_parts`), a textured toon (`static_common.tex_toon`, `KitTex_*`, `BldTex_*`), or a role material
(`materials/nodes.role_material`) when `--textured` swaps one in. The makeover keeps one way:

- **Every mesh slot names a role and a tint, never a hex triple or a file.** The role is a key of
  `materials/roles.py` `ROLES` (or one of the flat roles below); the tint is a world-palette colour. A model built
  by a script asks `role_material(role, tint)`; a model imported from a GLB (Kenney, Poly Haven, Meshy) has its slots
  renamed to roles on import (`kit_import.py`'s job, section 7).
- **Flat roles** join the 47 textured ones for surfaces that carry no grain: `flat` (any ramp colour, no texture),
  `skin`, `glass`, `emissive` (lamp flames, windows at night, the moss glow), `ink` (the outline). A flat role is a
  `WDI_Toon` with the tint's ramp neighbours as today.
- **The finish decides the shader, not the model.** One function maps (role, tint, style, class) to a material:
  - 8-bit: the role's 1k diffuse toned 0.45 toward the tint, through the toon bands (today's `STYLE_TONE`);
  - low poly: the same, posterised to six levels (today's `POSTERISE_LEVELS`);
  - HD figures, props, clues, ground, effects: the toon bands with soft edges and the diffuse luma as a bump (today's
    `hdtex`), tone 0;
  - HD buildings and kit: the Principled BSDF on the same maps under the sky (today's `pbr.py`).
- **The role table is the swap point.** One row changes a surface everywhere, in every style and in V2 (section 8).
  The owner's own Poly Haven favourites join by slug (A144's open line); ambientCG joins under its own source in the
  same lock (art.md 5).

The table `FIGURE_ROLES` / `WORLD_ROLES` (ramp to role) stays as the fallback for models that still carry flat ramps,
so nothing has to be rebuilt at once; a model is "made over" when every slot names its role itself.

### 3.2 Textures: resolution and texel density

The roles carry a texel density (metres per repeat: walls 2, brick and flagstone 1.5, cobble and metal 1, cloth 0.5,
rock faces 3). What a render can resolve is set by 11A's scale (ASSETS 6.2: 90.51 display px per ground metre; HD
renders at twice that, 181.02). The sampling a texture needs is about two texels per rendered pixel:

| Render | Px per metre | Texels per metre a role needs | A 1k map over a 2 m role gives | Over the 3 m rock face |
|---|---|---|---|---|
| 8-bit, low poly (render; shipped at half) | 90.5 | 181 | 512 (2.8 x) | 341 (1.9 x) |
| HD | 181.0 | 362 | 512 (1.4 x) | 341 (0.94 x) |
| V2, a wall 1.5 m away at 1080 p and a 60° vertical field of view (estimate) | about 620 | 620 to 1240 | 512 (short) | 341 (short) |

- **The 1k maps are enough for every sprite render**, HD included, except the rock face, which reads soft at HD
  (_proposed_: render `rock_face` at 2k in HD only). The 2k maps that HD reads today are filtered away by the render.
- **The 2k maps are V2's.** A first-person wall wants 1k to 2k texels per metre; 2k over a 2 m role gives 1024. So the
  lock keeps 1k and 2k, the sprite renders read 1k, and V2 reads 2k at run time (as compressed textures, 8.1).
- **Cloth at 0.5 m** gives 2048 texels per metre from a 1k map, far past any figure render. Its grain survives only
  as tone, which is why the measurements in 4.2 matter more than the texture choice for figures.

### 3.3 The palette

`palette.json` `world` (64 colours, 16 ramps) stays the only colour set of rendered art, and its rules (ASSETS 6.1:
light faces warm up the ramp, shadow faces cool down it, ink the deepest tone, no black, saturated colours at most 10%
of a frame, teal only as a light source, magenta never) bind every style.

- **8-bit** keeps the exact rule: every shipped pixel a world colour, `palette.test.ts` on every image.
- **Low poly and HD** cannot snap (the grain, the soft bands and the PBR shading are the point), so today nothing
  checks them. The makeover adds a **tone check** for unfinished pages, for the build round to write (_proposed_):
  - each page's 16 dominant colours (k-means in OKLab over opaque pixels) lie within ΔE_ok 0.10 of a world colour;
  - the saturated share (OKLab chroma over 0.12) stays at most 10% of the opaque pixels of each frame;
  - no pixel is darker than ink (luma under ink's), so nothing ships black.
- **HD keeps tone 0** (A164: every texture's own colour, the slate roof blue-grey). The tone check is what keeps a
  photograph's colours inside the game's family; if a page fails it, its role's tint or a per-role tone (a new
  optional `Role.tone` for HD) fixes it, never a hand edit.
- **Runtime colour** (the lighting layer's ambient, the lamp glows, the scarf tints) uses the ten tokens, as today
  (SPRITES 7, 10.11). The makeover adds none.

### 3.4 What the makeover changes in the toon ramp

Nothing in the numbers. The ramp stops (0.25 / 0.65) are measured against 11A's key light and camera
(`tools/blender/README.md`, "IsoCam calibration"), and 11A moves neither: the camera, the 90.51 px a metre, the 0.75
`zScale`, the key at 225° / 55° in the camera frame and the stops all stay (`pipeline.md` 2, 3.2). So 3.2's density
table and this section stand as written. The HD finish keeps its `bandSoft` (0.08) and rim; with the defect
of 1.3 fixed, the rim reaches figures for the first time, so the build round re-checks the rim amount (0.3) on a
figure sheet before it renders in bulk.

## 4. The styles

### 4.1 What the owner has said

- **A79 (2026-10-18):** both 8-bit and low poly, "at the click of a button", "with high definition later".
- **A155 (2026-10-23):** Poly Haven textures for HD, "and maybe even rerender them as 8 bit and low poly for better
  texture in those games".
- **A164 (2026-10-24):** HD as toon with the library ("HDtex"), then "PBR one builds and large scale objects with depth
  and shadow"; WebP for large objects, PNG where detail is critical.
- **Round 9:** the style is chosen in the menu only.

Nothing the owner has said asks for fewer styles. The question is what each style is worth against what it costs.

### 4.2 What each style costs, measured on one look

The baker, `idle` (6 frames by A161's plan B), 8 directions, all three passes, rendered with the repo's tools and
packed by `pack.ts` (8-bit and low poly) or `hd.ts char` (HD). The idle is a sixth of a look's 504 resident body
frames, so the "look" column scales the measured frame cost to the whole resident set.

| Column | Finish | Packed cell | Trimmed px a frame | Body page bytes a frame (PNG) | A look's 504 body frames | Body area a look (page-equivalents) |
|---|---|---|---|---|---|---|
| `8bit` | today's 8-bit: finished, indexed PNG | 64 px | 1 729 | 355 B | 179 KB | 0.21 |
| `8bit-tex` | 8-bit with the ramp-table roles (the 1.3 remap applied) | 64 px | 1 729 | 346 B | 174 KB | 0.21 |
| `lowpoly` | today's low poly: unfinished, alpha-bled RGBA | 64 px | 1 823 | 2 489 B | 1.25 MB | 0.22 |
| `lowpoly-tex` | low poly with the ramp-table roles | 64 px | 1 823 | 2 428 B | 1.22 MB | 0.22 |
| `hd-tex` | HD at texels 4 as A164 writes it, the ramp-table roles, soft bands and rim (remap applied), `body` pass, `s`, `se`, `sw` | 256 px | 45 144 | 34 987 B | 17.6 MB | 5.4 |

- **The check against what ships.** The shipped 8-bit baker body page is 407 B a frame over its 504 frames, the
  low-poly one 2 690 B: the idle sample is within 15% of the whole look, so the extrapolation holds.
- **Textures cost no bytes in 8-bit or low poly.** The textured pages are 2 to 3% smaller, though textures change 80%
  (8-bit) and 89% (low poly) of a figure's finished pixels.
- **The overlays** (scarf and blood, 96 frames) are 26 B a frame in 8-bit and 246 B in low poly: a tenth of the body.
- **HD is 25 times the area and 14 times the bytes of low poly a frame**, more than the 16 times the cell alone gives,
  because the contact shadow of the catcher widens every trimmed frame.
- **WebP at q90** (`bleed.ts` `encodeWebp`, the encoder `hd.ts --webp` uses) on the same pages: the HD page goes from
  630 KB to 146 KB (0.23), the low-poly page from 119 KB to 50 KB (0.42), and the 8-bit page grows from 17 KB to
  36 KB (indexed PNG stays the right format for 8-bit).

### 4.3 The three options

| Option | What ships | For | Against |
|---|---|---|---|
| **A. Keep three, one master set** (_proposed_) | 8-bit, low poly, HD as three finishes of one model set (section 2) | What the owner has asked for each time; the pipeline already works this way; a style is a render flag, so the makeover is one re-render per style, not three art sets | Three renders of everything and three sets of pages to fit (section 5); HD figures do not fit any budget at the cell A164 names (5.4) |
| B. Merge 8-bit and low poly into one "classic" style, keep HD | one unfinished classic set plus HD | One less render and check per asset; the site budget gains about 38 MiB | Drops the 8-bit look the game is styled on (`style.json` `styleFormula` is a pixel-art brief) or the low poly the owner asked for; A79 is the owner's own call |
| C. One look only | one set at one finish | The cheapest; every budget has room | Drops two styles the owner asked for |

**Proposed: A.** With these rules per style:

- **8-bit**: environment textured (the grain survives as the dither `style.json` asks for, art.md 5); **figures
  flat**. Measured in 4.2: textures change about 80% of a finished figure's pixels and cost nothing in bytes, but at a
  64 px cell the grain reads as speckle on a coat, not as cloth, and darkens the skin and the hands.
- **Low poly**: environment textured at 1k, toned and posterised; **figures flat**. Measured: textures change 89% of
  the pixels at no byte cost, and the posterise of a tinted photograph moves the look's hues (the baker's fog-blue coat
  goes green-grey, her stockings purple, her boots near black), which is the colour drift 3.3's tone check exists to
  catch.
- **HD**: environment in HD (toon HD and PBR as A164 split it); figures by option 5.4. Garment roles are an HD
  finish: they read as cloth only at HD's density. But not through today's ramp table: with the 1.3 remap applied,
  `FIGURE_ROLES` (ramp to role) dresses the baker's skin and hair as leather, her coat as leather and her bone apron as
  blue-grey wool, so the HD figure reads as a carved wooden doll (the `hd-tex` column of the sheet, section 9). A
  figure's role must be named per garment in `looks_spec.py` (6.2), with skin, hair and eyes-free faces on flat or
  `face` roles; the ramp table is not fit for figures.
- **The sky under HD figures** (A164's open line: the PBR sky under the toon bands, `WDI_HD_SKY=1`): measured, it
  changes the figure very little (the `hd-tex + sky` column against `hd-tex`). _Proposed_: figures render without the
  sky, and the flatter-ambient question is closed as "not visible".

### 4.4 The finish settings this document owns per style

- **Baked AO and contact shadow** (11A proposes them in every style, `pipeline.md` 3): HD at today's strength
  (`aoDistance` 1.0, catcher 0.6). Low poly at half (`aoDistance` 0.5, catcher 0.3), so a posterised face does not
  gain a band from it. 8-bit only where it survives the finish without moving a face's band on the smoke block (the
  ramp measurement of `tools/blender/README.md`); _proposed_: the catcher at 0.3 and no AO in 8-bit, decided on the
  build round's first figure sheet.
- **HD samples.** 11A measured `taaSamples` 32 to 8 as 3.6 times faster (19.7 to 5.5 s a frame) for a mean difference
  of 0.44/255 on the figure. **Accepted** for every HD render, on the condition that the build round's first HD sheet
  shows no visible noise in the soft band edges and the catcher's shadow; if it does, 16.

## 5. Budgets

Each budget, what it is today, what the makeover's look costs against it, and what gives when it does not fit. The
caps are ASSETS 6.8 and SPRITES 10.14; the checks are `tools/sprites/test/budget.test.ts` and `media.test.ts`. A
raised cap is a DECISIONS row, so every "raise" below is a question for the owner (section 10).

### 5.1 The order in which things give

When a set is over a budget, the build round applies these in order and stops at the first that fits:

1. **A cheaper encoding of the same pixels.** Indexed PNG where the colours allow it (8-bit already); lossless WebP
   where it is smaller than PNG; lossy WebP at q90 for large static objects (A164's rule, buildings and map props).
2. **Fewer pixels on a page.** Tighter trimming, a smaller extrude ring, a page packed nearer its cap.
3. **Lazy pages.** Move a clip or an atlas out of the resident set (the lazy clip pairs of A161 are the model).
4. **Fewer frames**, at the same clip ids (A141's fallbacks: one-shots in four directions, lower counts).
5. **A style falls back per key** (A80): an HD key it cannot afford is left out of `assets/hd/` and the client draws
   the next style's entry. Today the fallback is always to 8-bit; for HD the makeover proposes low poly instead (5.4).
6. **Compressed GPU textures** (KTX2), which ASSETS 6.8 reserves for "if M6 profiling shows VRAM pressure"; HD is
   that case (5.4).
7. **A raised cap**, by a DECISIONS row the owner approves.

### 5.2 The first load: 12 MiB cap, 8 MiB target

- **Today:** 10.99 MiB of art in the default (8-bit) style; about 14.4 MB with the SFX and the engine (ASSETS 6.8's own
  note).
- **The makeover's cost:** for figures, none: a textured 8-bit figure page is 2.5% smaller than a flat one (4.2), and
  4.3 proposes flat figures anyway. For the environment it is not measured here: the props, kit and building builders
  import the Kenney kits, and kenney.nl served an HTML page instead of the zip to this container, so no textured
  environment page could be packed. The figure result suggests a toned texture's dither compresses about as well as
  flat bands in an indexed page; the build round measures it on its first art drop and applies 5.1 if it does not.
- **What gives:** steps 1 to 3 of 5.1, applied to the 8-bit set only; the boot atlases (effects, nodes, tools, mobs,
  givers) are the candidates for step 3. The 8 MiB target is not reachable with fifteen resident looks without
  dropping looks from the boot set; _proposed_: keep 12 MiB as the cap, and treat 8 MiB as the first load of a match
  with no townsfolk look beyond the seats' (a later optimisation, not this round's).

### 5.3 The resident page cap: 9 page-equivalents

- **Today:** 7.73 (8-bit) and 8.14 (low poly) on Hollowmere; the looks are 5.44 of the low-poly figure.
- **The makeover's cost in 8-bit and low poly: none in pages.** Textures change the bytes of a page, not its area. A
  new pass would (11A owns the list): the cost of each, by the page arithmetic of SPRITES 10.14:

| Pass | Per look | 15 looks | Environment per map | Notes |
|---|---|---|---|---|
| body | 0.25 (one 1024² page; 0.5 for a tall low-poly body) | 3.75 to 4.0 | 1.8 (all of it) | today |
| scarf + blood overlays | 0.125 (one 1024 x 512) | 1.9 | none | today |
| a normal pass (for run-time lighting) | 0.25 | 3.75 | up to 1.8 | would break the cap in every style |
| a baked contact shadow and AO | 0 (baked into the body pass, as HD's catcher already is) | 0 | 0 | fits |
| `emit` (11A, statics only: lamp flames, lit windows) | none | none | **cap: 512² a map (0.0625) plus 256² shared (0.016)** | fits; counted in the resident sum in every phase |
| a depth pass | as normal | as normal | as normal | would break the cap |
| the long-shadow layer (CL3, `pipeline.md` 4.3) | none | none | **cap: 1024² a map (0.25)**; expected 0.14 (Hollowmere), 0.09 (Blackpine) | fits as a shared mask at half density (5.3.1) |

  So any per-pixel run-time lighting pass (normal, depth) does not fit the cap of 9 for figures, and costs another
  1.8 per map for the environment. 11A's pass list (`pipeline.md` 4) keeps body, scarf and blood, adds `emit` for
  statics and proposes no normal, depth or separate AO pass; CL3 adds the shadow layer (5.3.1); this table is the budget
  for it. With
  `emit` at its cap and the `constable` resident (6.2), the low-poly worst case on Hollowmere is about 8.14 + 0.08 +
  0.5 = 8.72, under 9 (8.97 with the shadow layer at its cap, 5.3.1). The sprite materials need no roughness or normal maps at run time: those are V2's (3.2, 8.1).

#### 5.3.1 The long-shadow layer (CL3)

The owner answered CL3 "yes" (`docs/round11/owner-answers.md`, on 6Z's PR #366): the buildings' long shadows come in round 11, as the
shadow layer of `pipeline.md` 4.3, a ground sprite the client draws under every y-sorted sprite and fades at dusk.
Which light casts them is `round11-plan.md`'s (11A). This is its budget.

- **What it would cost as one more environment page per style.** 11A measured a shadow at about three quarters of its
  building's own area (on the tavern). Hollowmere's building pages are 2048 x 1024 plus 1024² (0.75), so its layer
  would be about 0.56 page-equivalents, Blackpine's about 0.38. On low-poly Hollowmere that is 8.72 + 0.56 = 9.28,
  **over the cap of 9**. On 8-bit Hollowmere it would be 7.73 + 0.08 + 0.375 + 0.56 = 8.75, which fits. On HD, at four
  times the area, it would be 2.25 against the HD cap of 18 (5.4): 10.8 + 5.9 + 0.32 + 2.25 = 19.3, also over.
- **What it is instead: one shared mask at half density.** The layer carries no texture and no colour of its own. It
  is ink at partial alpha, soft-edged, and the client tints it and fades it. So it ships as:
  - one alpha mask per map, `shadow_<map>` (white, alpha carries the shadow), tinted `ink` at run time;
  - rendered at half the 8-bit packed density (about 22.6 px a ground metre) and drawn at twice its texel size with
    `linear` filtering in every style, so its soft edge needs no extra texels;
  - in the 8-bit manifest only, so low poly and HD take it by A80's per-key fallback: the same page, at the same cost,
    in every style;
  - left unfinished in 8-bit too: no alpha cut, no palette snap. Like `gen_light` (SPRITES 10.11) it is a mask, not
    art, and `palette.test.ts` exempts the `shadow_` keys. The colour on screen is the ink token, blended by alpha, as
    the darkness layer already blends;
  - packed only where it shows: the pixels under the building's own silhouette are cut before packing, because the
    building is drawn over them.
- **The cost:** a quarter of the area above, at most. Hollowmere about 0.14, Blackpine about 0.09, in every style;
  cut to the visible part it is less, by how much depends on 11A's choice of light. The cap is 1024² a map (0.25).
  Worst case at the cap: low-poly Hollowmere 8.72 + 0.25 = 8.97, under 9; at the expected 0.14, 8.86. HD: 17.0 + 0.25
  = 17.3 of 18. Bytes: a soft single-colour mask compresses to tens of KB a map; it loads with its map and counts in
  the first load for Hollowmere, which keeps the 8-bit first load near 11 of 12 MiB.
- **What gives** if a map's layer outgrows its cap: by 5.1, first the cut to the visible part, then a lower density
  (a quarter of the 8-bit density still reads as a soft shadow), never a second page.

### 5.4 HD: the figures do not fit, and three ways out

A164 renders an HD figure at twice the display scale and ships it unhalved: a 128 px display cell becomes a 256 px
packed cell, where the 8-bit and low-poly sets pack 64. That is **16 times the area** of today's frames:

| HD figure at | Packed cell | Area per look (body + overlays) | 15 looks, resident | Bytes, 15 looks (PNG) |
|---|---|---|---|---|
| texels 4 (A164 as written) | 256 px | measured 5.4 (body) + about 1.0 (overlays) = 6.4 page-equivalents | 96 | measured: 264 MB of body pages as PNG, 61 MB as WebP q90 |
| texels 2 | 128 px | about a quarter: 1.6 | 24 | estimate: about 66 MB as PNG, 15 to 20 MB as WebP q90 |
| the low-poly figure (fallback) | 64 px | 0.375 (0.5 tall) | 5.4 to 5.9 | 0 (already shipped) |

A page-equivalent is 16 MiB of video memory uncompressed, so texels 4 is about 1.5 GiB of figures and texels 2 about
380 MiB, against a cap of 9 (144 MiB) for everything. (A cell at texels 4 is 16 times a 64 px cell; the measured area
is 25 times, for the contact shadow: section 4.2.) The HD environment alone at texels 2 is four times today's
2.70 (Hollowmere, low poly: environment and boot atlases), about 10.8.

The three ways out:

- **HD-1, the low-poly figure in the HD world (_proposed_).** `assets/hd/` carries no `char_*` or `ovl_*`; the client
  falls back per key to the low-poly entry (a change to A80's fallback order for HD: hd, then lowpoly, then 8-bit).
  HD resident: about 10.8 + 5.9 = 16.7. Bytes: no figure bytes in the HD set. The HD figure is the flat low-poly one of
  4.3, drawn with linear filtering, so it matches the world's finish, at half the HD world's density.
- **HD-2, HD figures at texels 2 as KTX2.** Basis UASTC or BC7 at 8 bits a pixel is a quarter of RGBA's memory, so
  24 page-equivalents of figures cost what 6 cost uncompressed. It needs Phaser 4's compressed-texture loader
  (`ARCHITECTURE.md` 5.1 pins Phaser 4.2.1; KTX support to be verified by the build round), a transcoder in the
  client, and pages written twice (KTX2 and a PNG or WebP fallback for a device without the format). Bytes on the
  site rise by the KTX2 pages.
- **HD-3, HD figures at texels 2 as RGBA**, with an HD resident cap of about 34 page-equivalents (544 MiB). Not
  proposed: the device gate (A164: 4 GB of memory) leaves no room for it next to the browser.

Whichever is picked, the HD set needs **its own resident cap**, because nothing at HD's density fits 9. _Proposed_:
an HD cap of 18 page-equivalents (288 MiB), checked by `budget.test.ts` for the `hd` style only once `assets/hd/` has a
manifest (today the test skips styles with no manifest, so HD has never been checked).

### 5.5 HD bytes: 80 MB, inside the site's 150 MB

- **Today:** 0. The 80 MB row was set "from four times the low-poly set" when that set was smaller; low poly is now
  37.68 MiB, and four times it is about 150 MiB.
- **The environment at HD** (an estimate from the low-poly pages, four times the area): kit, ground, clues, effects and
  M5b pages as PNG about 4 x 3.9 MB = 15.6 MB; buildings and map props as WebP q90 about 4 x 4.6 MB x 0.12 = 2.2 MB
  (the ratio of A164's crop: 6.7 MB PNG to 0.8 MB WebP). About **18 MB**.
- **The figures at HD**, measured on the baker (4.2) and scaled to fifteen looks: 264 MB of body pages as PNG at
  texels 4, 61 MB as WebP q90; at texels 2 about a quarter of each. No PNG option fits 80 MB, and WebP at texels 4
  leaves under 1 MB for the environment.
- **What gives:** HD-1 keeps HD within 80 MB with room; HD-2 adds the KTX2 pages; a figure page as lossy WebP needs
  the owner to reverse A164's "PNG where detail is critical" for figures.

### 5.6 The site: 150 MB, CI fails above 120 MB

- **Today:** 75.01 MiB. With HD-1 (about 18 MB) about 93 MiB. With HD-2 at texels 2 add the KTX2 figure pages.
- **What gives:** the placeholder set (7.1 MB) is a dev aid (`?art=placeholder`); _proposed_: keep it out of the
  production `dist` once every key has real art (a build round call, not a look call). Video (5.98 MB) and audio
  (10.7 MB) are outside this document.
- **A lever not yet pulled:** the low-poly character pages as WebP q90 measured 0.42 of their PNG (4.2), which would
  take low poly's `chars/` from about 30 MB to about 13 MB. It is a visible change to figures (lossy), so it is the
  owner's call, and it is not needed while the site is under its cap.

### 5.7 The frame rate on the test Android

- **Today:** no number is written down. ROADMAP's risk 7 asks for "a real Android test each milestone" and an FPS
  overlay; no device is named.
- **The makeover's cost:** in 8-bit and low poly, none at run time: the same sprite counts (ASSETS 6.8), the same pages,
  the same lighting layer; only the bytes of a page change. HD is gated off small screens and low-memory devices
  (A164), so the test Android never runs it.
- _Proposed_: a floor of 30 fps in the busiest scene with ten players on the owner's Android in the 8-bit and low-poly
  styles, measured with the FPS overlay at each art-drop pull request (ASSETS 6.6). A page that pushes it under gives
  by 5.1.

## 6. Characters

### 6.1 What stays

- **The four-heads base of A161**: 1.7 m, a 0.40 m head, the 22-bone armature, the `Feet` empty, the 112 px cap and
  `probe_cap.py` as the check (SPRITES 1). 11A owns the cell, the cap and `figureScale`; nothing here moves them.
- **The clips and frame counts of A161's option B** and `motion.md` 1, the lazy clip pairs, the four-direction
  one-shots, the townsfolk's shorter set. The makeover re-renders them; it adds no frame.
- **The three passes** (body, scarf, blood; SPRITES 6) and their look: the scarf in the `bone` ramp tinted at run time,
  the blood flat `blood`. In HD the scarf takes the same soft bands as the body (once 1.3 is fixed), so a tinted scarf
  never looks flatter than the coat under it.
- **The cover rule**: the three cover cards never get a body; a look is public by design (`CLAUDE.md`).

### 6.2 What the makeover changes

- **Garments by role.** Each `looks_spec.py` colour names a role (linen, wool, leather, fur, iron, plus `skin` and
  `flat`) as well as its ramp step, and the tint stays the look's palette identity (its ramps, its one accent; 3.1).
  The role is used where it reads: in HD (if HD ships figures, 5.4) and in V2. In 8-bit and low poly the figure
  renders flat (4.3).
- **Faces.** Still nose, brows, beard and hat, no drawn eyes (`style.json`). At HD the head is 0.40 m, about 72 render
  px at 181 px a metre: _proposed_ a small `face` role (a skin texture with a soft nose-and-brow shade) for HD only, so
  the head is not one flat band.
- **The villager family and the `constable`.** The five family looks are re-rendered like the deck's. The `constable`
  (round 10, B1) is the only new look: until its art lands it draws `villager` on the client (seams.md 2). _Proposed_:
  its spec goes into `looks_spec.py` with the round-10 fix that renders it (10Y; 10B owns only its `looks.json` row), on the same base and passes, carrying no
  card's signature prop; the makeover then re-renders it with the rest. It counts in the resident sum like the family
  (it is resident on every map with the Constables), so it adds about 0.375 (8-bit) to 0.5 (low poly) to 5.3's
  figures.
- **Triangles.** Measured from `build_looks.py --look all`: 1 588 (the plain villager) to 3 228 (the gamekeeper), 2 600
  on average. The sprite renders do not care; V2 does (8.2).

### 6.3 The overlays' look per style

| Pass | 8-bit | Low poly | HD |
|---|---|---|---|
| body | toon, flat, finished | toon, flat, unfinished | soft toon, roles per garment (6.2), AO, rim, contact shadow (if HD ships figures, 5.4) |
| scarf | bone ramp, finished | bone ramp, unfinished | bone ramp, soft bands (the body's finish) |
| blood | flat blood | flat blood | flat blood (no rim, no AO: it is a mask) |

## 7. The owner's ROSW 3D pipeline, and where it meets this plan

On 2026-10-29 the owner's ROSW repo gained two studio pipelines (branch `claude/focused-rubin-edsz6p`,
`studio/pipeline/spec.yaml`):

- **`asset-3d`**: a prompt or a reference image to a GLB through the Meshy API (text or image to 3D, then optional
  remesh, retexture, rig and animate), each file checked by `glb_inspect.py --budget tris=..,mb=..,tex=..,height=..`.
  Its own notes: the Meshy fields are tested against a fake server, not yet live; a rigged model comes back only for a
  textured humanoid facing +Z.
- **`assemble-3d`**: models brought into Blender (headless `bpy`, or the owner's live Blender through the
  `mcp-for-blender` server), scaled to a real height (`target_height_m`), set on the ground, given LODs by decimate
  ratios (`lods: [0.5, 0.25]`), lit, framed and saved as `.blend`, `.glb` and a preview. Units metres, Z up.

Where it meets this plan:

- **A Meshy model is a master, like a Higgsfield generation.** It lives on the owner's laptop under
  `studio/assets/who-did-it/3d/<slug>/` with a studio note written by the pipeline, a `MANIFEST.md` row (path, hash,
  date) here, and a `CREDITS.md` row citing the ROSW run id (ASSETS 6.10's pattern for generations).
- **It never ships with its own textures.** On import into the WDI rig (`kit_import.py`'s path), every slot is renamed
  to a role and tint (3.1), so a generated barrel and a scripted barrel wear the same `wood_plank`. A Meshy texture
  could carry text, photographic noise or colours off the palette; the role swap removes that risk and keeps one look.
- **Props, not characters** (_proposed_). Characters stay `build_looks.py` code: the 22-bone armature, the clips and
  the cap are contracts a generated rig would not meet (Meshy's rig is humanoid-only and its own skeleton). Props,
  furniture, machinery and set dressing are where a generator saves the most.
- **The licence is the owner's to confirm.** ASSETS 6.5 allows CC0, CC-BY with a credit row, and the owner's own
  generations. Whether a Meshy output on the owner's plan counts as the owner's own work is not something this session
  can read from here (question 10.8).
- **The budgets meet.** `glb_inspect.py`'s `--budget` grammar is the natural form for the per-class model budgets of
  8.2; the plan writes them in that grammar so the owner's pipeline and this repo check the same numbers. This repo
  does not import ROSW code (it is a separate repo); the build round writes its own check from the same table.
- **LODs meet.** `assemble-3d` makes LODs as decimate ratios; 8.1 proposes the same form, so a model assembled there
  arrives with V2's LODs already made.
- **Where Blender runs** is 11A's (README, 11A, "Where Blender runs"); this section only says what crosses the
  boundary: a GLB master in, role-renamed slots and renders out.

## 8. V2: what a model must carry

The first-person renderer loads the same sources as the sprite renders (ROADMAP, "After the V1 beta"). So every
master, from a script or imported, must export to a GLB that V2 can load without the sprite rig:

### 8.1 The contract

| Field | Rule | Why |
|---|---|---|
| Units and up axis | metres, Blender Z up (glTF Y up on export) | `assemble-3d` and glTF agree |
| Scale | true scale; the 0.75 `iso.zScale` and any `figureScale` are applied by the sprite rig's root empties only, never baked into a model | V2 has no isometric squash |
| Origin | at the base centre for props and kit, at `Feet` for figures, at the front wall's base centre for buildings | the same pivots the sprites use (SPRITES 10.5) |
| Material slots | named `role:<role>` with a glTF `extras` of `{"role", "tint"}`; no embedded textures in the master | V2 binds its own 2k compressed maps by role (3.2) |
| Parts | the `wdi_part` custom property kept as glTF `extras` (`body`, `scarf`, `blood`) | V2 tints the scarf and shows blood the same way |
| Rig (figures) | the 22-bone armature of `build_looks.py`, bone names fixed, one action per clip named by clip id, 24 fps | V2 plays the same clips; the names are a contract once V2 starts |
| Facing | figures face world +Y in Blender (`build_looks.py`'s rule), so glTF -Z after export | one facing rule for both renderers |
| LODs | LOD0 the model as rendered; LOD1 and LOD2 at decimate ratios 0.5 and 0.25 (`assemble-3d`'s form), named `<slug>_LOD1`, `<slug>_LOD2` | V2 needs them; the sprites use LOD0 only |
| Collision | none in the model: collision stays the server's (`sim/Collision.ts`, the scene JSON) | the server is authoritative in both modes |
| Lights | a light a prop carries (lamp, torch) is an empty named `light:<kind>` at the flame, matching the scene light kinds of SPRITES 10.12 | V2 lights the same places the lighting layer does |

### 8.2 Model budgets (_proposed_, in `glb_inspect.py`'s grammar)

| Class | LOD0 triangles | Height (m) | Notes |
|---|---|---|---|
| figure | tris=4000 | height=1.6-1.8 | today 1 588 to 3 228; room for HD faces and cloth |
| small prop | tris=1500 | height=0.05-1.5 | |
| large prop, machinery | tris=6000 | height=0.5-4 | |
| kit piece | tris=2000 | height=0.3-2.5 | walls 2.5, 1.2, 0.3 m (ASSETS 6.2) |
| tree | tris=4000 | height=2-12 | |
| building shell | tris=20000 | height=2.5-14 | rooms are separate models |

No `tex` limit on a master (it carries no textures, 8.1); V2's texture budget is per role, at 2k, compressed. No
`mb` limit beyond what the rig reads in reasonable time; the masters are never committed (ASSETS 6.6).

### 8.3 What it costs the sprite pipeline

One export per master, beside the `.blend` the save scripts already write (`save_masters.py`), into the owner's ROSW
checkout with the other masters. It changes no render, no page and no budget of section 5.

## 9. The sample sheets

In `docs/round11/samples/look/`, PNG, 189 KB in all (the cap is 5 MB):

| File | What it shows |
|---|---|
| `figure-styles.png` | The baker, `idle` frame 0, `s`, `se`, `sw` (rows), drawn as at zoom 2: 8-bit and low poly packed frames scaled 4 times (nearest for 8-bit, linear for low poly), HD frames 1:1. Columns: `8bit` (today), `8bit-tex` (garment roles, remap applied), `lowpoly` (today), `lowpoly-tex`, `hd as-is` (`--style hd --textured` exactly as `batch_render.py` runs today: the textures and the band edits do not reach the figure, 1.3), `hd flat` (HD with the remap, no textures: soft bands and rim reach the figure), `hd-tex` (HD with the remap and the ramp-table roles), `hd-tex + sky` (the same under `WDI_HD_SKY=1`) |

What to look at:

- `8bit` against `8bit-tex` and `lowpoly` against `lowpoly-tex`: the grain at 64 px, and low poly's hue drift (4.3).
- `hd as-is` against `hd flat`: what the 1.3 fix changes on an HD figure: the soft band edges and the rim; the shadow
  and AO are the same in both.
- `hd-tex`: why figure roles must be named per garment (4.3, 6.2).
- `hd-tex + sky` against `hd-tex`: the A164 ambient test.
- Every HD column against the 8-bit and low-poly ones: the size of the contact shadow, which is what makes an HD frame
  25 times the area of a low-poly one (4.2).

The cost table of 4.2 comes from the same renders. The rooms and buildings in each style are round 8's sheet
(`docs/round8/hd-look/`), unchanged by this round's proposals.

How they were made: `build_looks.py --look baker`; `batch_render.py --char baker.blend --anims idle` with the flags
of each column, the remap of 1.3 applied in a scratch wrapper for every column but `8bit`, `lowpoly` and `hd as-is`; `pixel.ts` and `pack.ts`
for 8-bit and low poly, `hd.ts char` for HD; composed and shrunk to PNG-8 with Pillow. Nothing was written under
`tools/`, `apps/` or `assets/`.

## 10. Questions for the owner

Each with the proposed default. A question still open when the build plan is written takes its default, marked
_proposed_.

1. **Keep all three styles?** Default: **yes, three finishes of one master set** (4.3, option A).
2. **HD figures: which way out of 5.4?** Default: **HD-1, the low-poly figure in the HD world**, with HD's fallback
   order changed to hd, low poly, 8-bit. HD-2 (HD figures as KTX2 at texels 2) stays open for a later round, after a
   profile on the owner's desktop.
3. **An HD resident cap of its own?** Default: **18 page-equivalents (288 MiB), HD only**, behind the device gate,
   checked once `assets/hd/` exists.
4. **The HD byte row.** Default: **keep 80 MB**; with HD-1 it fits (about 18 MB). If HD-2 is chosen later, the row is
   re-set from the measured KTX2 pages.
5. **8-bit figures: flat or textured?** Default: **flat** (4.3): the grain does not read at 64 px; the figure sheet shows it.
6. **Low-poly figures textured?** Default: **no, flat**: no byte cost either way, but the posterise moves a look's
   hues off its palette (4.3); textured garments are kept for HD figures.
7. **The first load: keep the 12 MiB cap and leave the 8 MiB target for later?** Default: **yes**; the makeover adds
   nothing to the 8-bit first load beyond the dither bytes of 5.2.
8. **Meshy models as a source.** Default: **yes for props, furniture and machinery, never characters**; each as a
   master in ROSW with its run id, re-dressed by role on import, with a `CREDITS.md` row; on the owner's confirmation
   that Meshy outputs on their plan are theirs to ship under ASSETS 6.5.
9. **Which Android is the test phone, and is 30 fps the floor?** Default: **the owner's own Android, 30 fps** in the
   busiest scene with ten players, 8-bit and low poly.
10. **Which classes stay outside Blender?** Default: **the UI icons (their SVG masters, SPRITES 9), the card
    portraits and concepts (Higgsfield), the DOM screens and the runtime particle effects of A162**; everything that
    stands in the world is made in Blender, including the code-drawn mobs, nodes, givers, tools and greybox frames,
    which move into the rig last (`pipeline.md` P9; 6Z's ruling of 2026-10-30).
11. **Textures: 1k for every sprite render, 2k kept for V2?** Default: **yes** (3.2), with `rock_face` at 2k in HD.
12. **A tone check for low poly and HD?** Default: **yes**, the three rules of 3.3.
13. **V2 export with every master (GLB, role slots, LODs 0.5 and 0.25)?** Default: **yes** (section 8).
14. **A new run-time lighting pass (normals or depth for sprites)?** Default: **no**; light stays baked into the colour
    pass and the lighting layer stays as SPRITES 10.11 has it (5.3). 11A owns the pass list and may answer this first.
15. **The PBR sky under HD figures (A164's open ambient test)?** Default: **no**: measured, it barely changes the
    figure (section 9), so figures render without it and the question closes.
16. **HD render samples at 8 (11A's measurement, 3.6 times faster)?** Default: **yes**, with 16 if the first HD sheet
    shows noise (4.4).
