# Round 11: the build plan (the full Blender makeover)

Session 11A, at 6Z's request of 2026-10-30. Design only: this document plans code, it writes none. It orders the
round-11 pull requests that build `pipeline.md` (11A) and `look.md` (11B) as amended by the owner's answers
(`owner-answers.md`: 21 defaults, and CL3 changed to yes). Where those three disagree, `owner-answers.md` wins, then
this plan.

The build starts when round 10's final sweep (10Z) has merged. The per-asset work (what each art drop contains, and
how many frames) is `assets.md`'s, written at round 10's content freeze. This plan names the drops and their order,
not their counts. 6Z keeps three art items that round 10 deferred for `assets.md`: the armour drawn on the figure, the
`constable`, and the greybox beds and tools.

## 1. Rules for every pull request

- **Under 400 lines** of code and docs, one concern, the build green at every merge. Binary pages and generated
  manifests are not counted, but an art drop also keeps under ASSETS 6.6's 25 MB of binaries (T3 makes CI warn).
- **Tests for every change.**
  - A tool change gets a unit test: `@wdi/blender` unittest, no Blender needed, or `@wdi/sprites` vitest.
  - A rig change gets a check in the `bpy` job (T1).
  - A client change gets a vitest, and a spec when it is visible.
- **Docs in the same pull request.**
  - A change to what the game shows edits `GDD.md` 3.13 in the same pull request (CLAUDE.md).
  - A change to a contract edits its own section: SPRITES 5, 6, 10.6, 10.11 or 10.14; ASSETS 6.2, 6.6, 6.8 or 6.11;
    `tools/blender/README.md`; `tools/sprites/README.md`.
- **Nothing changes in the projection, the keys or the pivots** (CL1). Every art drop is new pixels under the keys,
  cells and pivots the client already loads. A pull request that needs a new key adds it to the manifest tests in the
  same pull request.
- **Role secrecy holds** (CLAUDE.md). The new layers (`emit`, the long shadows) draw statics only. No layer is drawn
  per seat, and none carries anything a client may not see.
- **Sources** are CC0 or made in the repo. Never Synty, never raw Mixamo or Quaternius sources (ASSETS 6.5). No Meshy
  model ships until the owner confirms the licence (SC2).
- **Model.**
  - **Opus** for a pull request that sets a contract others build on, or that needs judgement across the rig, the
    finish and the client.
  - **Sonnet** for one that follows a contract already merged: renders, art drops, mechanical builder changes.
  - **Fable** for the final sweep, as in round 10.
- **Renders land as art drops** (`pipeline.md` 5.5). Each drop carries:
  - one asset class and map, all three styles together;
  - its pages and manifests;
  - its render locks (T4);
  - its `MANIFEST.md` and `CREDITS.md` rows;
  - its review sheets under `assets/source/review/`;
  - its FPS reading on the test phone (BU4), once the owner has named it.

## 2. Sessions

| Session | Scope | Model | Compaction | Starts |
|---|---|---|---|---|
| **11T. Tooling** | T1 to T5: the `bpy` job, the Kenney lock, the 25 MB warning, render locks | Sonnet | 300k | first, when 10Z merges |
| **11L. Light and passes** | L1 to L4: the `emit` pass and the long shadows, render side and client | Opus | 500k | first |
| **11M. Materials and styles** (11B's half, section 5) | M1 to M6: one material graph, roles in the builders, the tone check, the finish constants, HD-1, the V2 export | Opus for M1, M2c, M5; Sonnet for the rest | 500k | first |
| **The look gate** | G: one room and one figure in every style, to the owner | 11L | — | when the gate's PRs merge (section 6) |
| **11W. World renders** | W: the art drops of each map's world, one session per map | Sonnet | 300k | after G and T5 |
| **11F. Figure renders** | F: the figure art drops, four sessions in parallel | Sonnet | 300k | after the world drops of HollowMere |
| **11K. The code-drawn classes** | K1 to K3: mobs, nodes and givers, tools and greybox frames into the rig (SC1) | Opus for the models, Sonnet for the drops | 500k | after the figure drops |
| **11X. Meshy adapter** (optional) | X1: `rosw_import.py`, props only | Sonnet | 300k | only once the owner confirms SC2 |
| **11Z. The final sweep** | Z1: `DECISIONS.md`, the cross-references, the docs `assets.md` names | Fable | 800k | last |
| **6Z** | spawning, merges, the owner's questions | Opus | 300k | throughout |

- **Spawning.** 6Z spawns each session from a tier branch at its compaction size (`docs/round10/README.md`,
  "Compaction"; `claude/r11-tier-<size>`, cut from the base after 10Z merges). Its first action is the
  `.claude/settings.local.json` step.
- **Ownership.** Each session owns the paths its pull requests name. `docs/SESSIONS.md` gets the round-11 rows when 6Z
  opens the round, and a `docs/round11/seams.md` lists the shared files.
- **The render sessions.** Until the owner changes the environment's setup script (RN3), a render session installs
  Blender itself with `tools/blender/setup.sh` (T1), about a minute.

## 3. The long shadows (CL3)

The owner's answer: "yes". CL2 keeps A9's key for the shading, and under that key the shadow is hidden: 2 % of a
building's area is visible on the tavern (`pipeline.md` 3.2). So the long shadows come from **a second sun that casts
shadows only**:

- It is used in the shadow pass alone and lights no colour pass, so the art's bands, the ramp stops and 11B's texel
  table are untouched (look.md 3.4).
- **Its elevation is 25°** and **its azimuth is the key's turned 45° clockwise**, from world south-west. The shadows
  fall to world north-east: on screen, along the ground to the right of a building, where players walk. The key's sunlit
  faces (south) and shadowed faces (east) stay the same, so the two suns agree on every face the camera sees.
- **The numbers** live in `rig_common.SHADOW_SUN` (L3). They are this plan's _proposed_ default, and section 9 asks the
  owner to pick from the sheet.

**Measured** on HollowMere's tavern at the display scale (`samples/pipeline/long-shadows.png`, made by
`samples/pipeline/long_shadows.py`). "Area" is the layer's trimmed area against the building's own pixels:

| Shadow sun | Visible beside the building | Layer area | Render, one frame |
|---|---|---|---|
| the key, 55° (today) | 2 % | 75 % | 46 s |
| the key's azimuth, 35° | 7 % | 87 % | 48 s |
| the key's azimuth, 25° | 18 % (behind the roof, up-right) | 98 % | 43 s |
| **25°, turned 45° (proposed)** | **18 % (beside the east gable, front-right)** | **94 %** | **45 s** |

**What the layer is.** `pipeline.md` 4.3's form:

- one ink mask per building and multi-tile prop, rendered on the shadow catcher with the casters hidden from the
  camera;
- packed into `shd_<mapId>`, one frame per building with the building's own key and pivot;
- drawn by the client in the ground band at `DEPTH.shadow` (-19, over the decals at -20, so a footprint in shadow is
  darkened) under every y-sorted sprite;
- its alpha set by the day part: full by day, faded at dusk, none at night, where the darkness layer covers it.

In 8-bit the mask is hard (alpha 0 or 255, the finish's rule) and the client draws it at a constant alpha. In low poly
and HD it keeps its soft edge. Figures cast no long shadow: they keep the client's ellipse.

**What it costs.**

- **Render.** About 45 s a building frame at the display scale, once for 8-bit and low poly together (both finish the
  same raw render), and about four times that for HD. HollowMere's 9 buildings and its few multi-tile props come to about
  a quarter of an hour for 8-bit and low poly, and under an hour for HD.
- **Pages.** At full packed density the layer is about 0.94 of a map's building page: about 0.47 page-equivalents on
  HollowMere. That puts low poly at about 9.19, over the cap of 9 (look.md 5.3). The plan's default packs the layer at
  **half resolution per axis** (the client draws it at twice the size), about 0.12 a map: low poly about 8.84, under 9.
  The page cap is 11B's (look.md 5.3), and its answer is folded in at section 5.
- **HD.** The layer is inside HD's own cap of 18 (BU1).

## 4. Tooling and passes

### Session 11T: tooling (Sonnet)

| PR | Files | Tests | Depends on |
|---|---|---|---|
| **T1. The `bpy` job** | `.github/workflows/ci.yml` (a `blender` job: on changes under `tools/blender/**` and nightly; not required at first), `tools/blender/setup.sh` (the `bpy` 5.2.0 wheel and the EGL packages, used by CI and by render sessions until RN3), `tools/blender/tests/bpy/` (new) | The smoke sheet's printed numbers (`pipeline.md` 2.3) to ±1 px; `probe_cap.py` on every look; one frame of every pass lies inside the beauty's alpha; an imported figure uses only the rig's `WDI_Toon` and `OutlineInk` (the 5.4 defect: 10Y's remap is checked, and added here if round 10 left it out) | nothing |
| **T2. The Kenney lock (RN4)** | `tools/blender/env/kits.lock.json` (new: pack, sha256, URL, release mirror), `env/kits.py` (refuses HTML and a hash mismatch, names the pack, falls back to the mirror), `tools/blender/README.md`, ASSETS 6.5 | `kits.py` against a fake server: the zip passes, HTML and a wrong hash are refused, the mirror is used when the URL rots | nothing |
| **T3. The 25 MB art-drop warning** | `.github/workflows/ci.yml` (a step that sums the binary bytes a pull request adds against its base and warns above 25 MB; ASSETS 6.6's rule, missing until now) | A script test on a fixture diff: under, at and over the line | nothing |
| **T4. Render locks: the writer** | `tools/blender/render_lock.py` (new, stdlib: the inputs' sha256, the Blender build, the host), every render script writes `<out>/<atlas>/render.lock.json`, `--changed` skips unchanged frames, `tools/blender/README.md` | The hash covers the builder sources, the master, the material lock entries, `rig_common` and the flags; a changed input re-renders only its frames | T1 |
| **T5. Render locks: the check** | `assets/source/renders/` (the committed locks), `tools/sprites/test/renders.test.ts` (new), ASSETS 6.6 | Every atlas an art drop ships has a lock whose frames equal the atlas's; atlases not yet re-rendered are listed in a `LEGACY`-style allowlist that only shrinks | T4 |

T2's release mirror is a GitHub release of this repo carrying the CC0 Kenney zips. Creating it is an outward action
that 6Z takes, or asks the owner to take; the pull request ships the lock and the fetch.

### Session 11L: light and passes (Opus)

| PR | Files | Tests | Depends on |
|---|---|---|---|
| **L1. `emit`: the render** | builders tag glowing parts `wdi_emit` (the `emissive` role of M1 tags itself), `static_common.py` and `build_buildings.py` render the mask, `tools/sprites/pack-static.ts` packs `emit_<atlas>` (only frames with a lit pixel, trimmed, the beauty's key and pivot), manifests, SPRITES 6 and 10.13 | A frame's mask lies inside its beauty alpha; an atlas with no emitter writes no page; packed within look.md 5.3's cap (512² a map, 256² shared); determinism | M1 |
| **L2. `emit`: the client** | `apps/client/src/view/Lighting.ts` (each lit statics' mask erased from the darkness texture at night, at its sprite's place), `assets.ts` (load `emit_*` with the map), SPRITES 10.11, `GDD.md` 3.13 | A lit window's pixels stay clear at night and dark by day; a missing `emit_*` page draws nothing; `budget.test.ts` counts the page in the resident sum | L1 |
| **L3. The long shadows: the render** | `rig_common.SHADOW_SUN` (25°, turned 45°; section 3), `build_buildings.py` (a shadow pass for buildings and multi-tile props: the catcher on, the casters hidden from the camera), `tools/sprites` (`shd_<mapId>` packed at half resolution, hard alpha in 8-bit, soft in low poly and HD), SPRITES 10.5 and 10.14 | The shadow sun lights no colour pass (a beauty frame is identical with and without it); the layer's frames carry the building's keys and pivots; half resolution; determinism | T1 |
| **L4. The long shadows: the client** | `apps/client/src/view/StaticView.ts` (or a new `ShadowView.ts`), `view/iso.ts` `DEPTH.shadow` (-19), `metrics.json` `lighting.shadow` (alpha by day part), SPRITES 10.6 and 10.11, `GDD.md` 3.13 | Drawn under every y-sorted sprite and over the decals; full by day, faded at dusk, none at night; scaled by 2 from its half-resolution frame; the occluder fade leaves it alone; `budget.test.ts` counts it | L3 |

## 5. Session 11M: materials and styles (11B's half)

These are 11B's designs (look.md 3, 4, 5, 8). This section is _proposed_ until 11B confirms the split, models and order
(asked 2026-10-30); 11B's answer replaces it.

| PR | Files | Tests | Depends on | Model |
|---|---|---|---|---|
| **M1. One material graph** | `tools/blender/materials/finish.py` (new: role, tint, style and class to a material; the flat roles `flat`, `skin`, `glass`, `emissive`, `ink`), `roles.py` | Every role and flat role builds in every style; the finish picks the shader, never the model (look.md 3.1) | nothing | Opus |
| **M2a. Roles in the env and props builders** | `env/kitbash.py` (`T`, `F` become role calls), `env/*_props.py`, `build_props.py` | Every slot of every prop names a role and a tint; the flat fallback table still dresses an unmigrated model | M1 | Sonnet |
| **M2b. Roles in buildings, kit and ground** | `build_buildings.py`, `build_kit.py`, `kit_import.py` (imported slots renamed to roles), `build_ground.py` | As M2a; Kenney meshes come in dressed by role | M1, T2 | Sonnet |
| **M2c. Garment roles for figures** | `looks_spec.py` (a role per garment, `face` for HD), `look_parts.py` | Every look's slots name a role; 8-bit and low poly figures still render flat (ST2, ST3) | M1 | Opus |
| **M3. The tone check (ST7)** | `tools/sprites/tone.ts`, `test/tone.test.ts` | look.md 3.3's three rules on low poly and HD pages: dominant colours near the palette, saturated share at most 10 %, nothing darker than ink | nothing | Sonnet |
| **M4. The finish constants** | `rig_common.HD` and the per-style AO and catcher (look.md 4.4), `taaSamples` 8 (RN2), `rock_face` at 2k in HD only (ST6), no sky under HD figures (ST5), ASSETS 6.2 | The constants per style; unit tests of the style switch | nothing | Sonnet |
| **M5. HD-1 and the HD caps** | `apps/client/src/view/assets.ts` and `artStyle.ts` (HD falls back hd, low poly, 8-bit, ST4), `tools/sprites/test/budget.test.ts` (the HD cap of 18, BU1) and `media.test.ts` (80 MB kept, BU2), SPRITES 5, ASSETS 6.8 | A missing HD key draws its low-poly entry; the HD sum is checked once `assets/hd/` has a manifest | nothing | Opus |
| **M6. The V2 export (SC3)** | `save_masters.py` (a GLB per master: role slots with `extras`, `wdi_part`, LODs 0.5 and 0.25), a model budget check in `glb_inspect.py`'s grammar (look.md 8.2) | A built look and a building export with their slots, parts, LODs and rig; an over-budget model fails | M2a, M2c | Sonnet |

## 6. The look gate

**G. One room and one figure in every style, to the owner.** This is round 8's form (`docs/round8/hd-look/`). 11L
renders HollowMere's tavern square and the Baker through the made-over pipeline, with `emit` and the long shadows, in
8-bit, low poly and HD (HD-1: the low-poly Baker in the HD world). The sheet goes to the owner as a docs pull request
under `docs/round11/samples/gate/`. It settles three of the open defaults:

- whether 8-bit takes AO (look.md 4.4);
- whether HD's 8 samples show noise, or need 16 (RN2);
- the shadow sun's direction (section 9).

No bulk render starts until the owner signs it off.

- **Depends on:** T1, M1, M2a, M2b, M2c, M4, L1, L3.

## 7. The art drops

The contents and counts come from `assets.md`. These are the order and the rules.

| Drop | Session | What | Depends on |
|---|---|---|---|
| **W1 to Wn. Each map's world** | 11W, one session per map (HollowMere first; the shared `props`, `clues` and `vfx` ride with it) | Ground, kit, buildings and multi-tile props with their `emit` and `shd` layers, props, in three styles; one drop per class and map | G, T5, L2, L4 |
| **F1 to Fn. The figures** | 11F, four sessions in parallel, each on its own looks | The deck's looks, the villager family and the `constable`, with the overlays; 8-bit and low poly only (HD-1); groups of three to five looks a drop | G, T5, the HollowMere world drops (figures are judged on the new ground) |
| **K1. Mobs** | 11K | The creatures into the rig as figures (SC1) | the F drops |
| **K2. Nodes and givers** | 11K | The resource nodes and the quest givers as props and figures | K1 |
| **K3. Tools and greybox frames** | 11K | The tools and round 10's greybox frames (beds, logs); the round-10 art items `assets.md` lists | K2 |
| **X1. The Meshy adapter** (optional) | 11X | `tools/blender/rosw_import.py`: a kept ROSW GLB to the master contract, LOD0 only, slots renamed to roles; props, furniture and machinery only; with its `CREDITS.md` rows | the owner's SC2 confirmation; M2b |

**Render time** is measured on a cloud session (`pipeline.md` 6.1), and every session starts its renders with T4's
`--changed`:

- **The figures** are about 9 hours of 8-bit and low-poly frames (HD-1 renders no HD figure), about 2.5 hours a
  session over four.
- **The world** is an hour or two a map a style, plus the shadow layer of section 3. HD renders at 8 samples (RN2).
- **The owner's laptop** is used only if one test frame there shows it is much faster (RN1).

## 8. Merge order

```
T1 ── T4 ── T5;  T2;  T3
M1 ── M2a, M2b (and T2), M2c ── M6;  M3;  M4;  M5
M1 ── L1 ── L2;  T1 ── L3 ── L4
T1, M1, M2a-c, M4, L1, L3 ── G
G, T5, L2, L4 ── W (HollowMere first) ── F ── K1 ── K2 ── K3
SC2 confirmed, M2b ── X1 (optional)
everything ── Z1
```

- **Z1. The final sweep** (11Z, Fable). The `DECISIONS.md` rows for the owner's 22 answers. The cross-references of
  `pipeline.md`, `look.md` and `assets.md`. The SPRITES 10.14 line on the HD cell, if 10Z has not already fixed it.
  The "round 11" status lines.

## 9. Question for the owner

**CL3a. Which way should the long shadows fall?** The sheet `samples/pipeline/long-shadows.png` shows four shadow
suns on HollowMere's tavern.

- **Proposed default:** a sun at 25°, turned 45° from today's key. The shadows lie on the ground to the right of each
  building, where players walk, and about 18 % of a building's area shows as shadow.
- The alternative of the same strength keeps today's direction: the shadows fall behind the roofs, up and to the right.
- The default is used until the owner says otherwise, and the look gate (G) shows it again in every style.
