# Round 11, 11A: the render pipeline

Session 11A (`docs/round11/README.md`, "11A"), design only. This document owns the camera, the scale, the light
directions and the list of passes. 11B's `docs/round11/look.md` owns the materials, the palette, the styles and the
budgets; where a number here meets one of 11B's, this document names it and 11B states it. Every proposal that the
owner has not yet answered is marked _proposed_, and section 9 asks the questions.

**Read for this draft:** `tools/blender/README.md` and every script it lists; `tools/sprites/README.md`; ASSETS 6;
SPRITES 1 to 6 and 10; `docs/round8/art.md`, `docs/round8/hd-look/README.md`; `apps/client/src/view/Lighting.ts`,
`PlayerView.ts`; `metrics.json` (`camera`, `iso`, `lighting`); `.github/workflows/ci.yml`; and the owner's ROSW repo
(`groot99-droid/Pipelines-Plugin`) read-only: `main` and the unmerged branch `claude/focused-rubin-edsz6p`, where
another of the owner's sessions is building the 3D asset pipelines (section 7).

## 0. The proposal in brief

1. **Camera and scale: nothing moves** (section 2). IsoCam, the display scale, `iso.zScale`, the cells, the cap, the
   pivots and the turntable stay exactly as SPRITES 10.3 states them. Every key, pivot and page the client loads
   stays valid, so the makeover is art in the same frames and no client change.
2. **Light: one key for every style, AO baked everywhere, no cast shadows on the world** (section 3). The key keeps
   A9's camera-frame azimuth and elevation. Every style bakes ambient occlusion. Figures bake their own soft contact
   shadow. Under this key a building's cast shadow lands mostly under its own roof (the samples show it), so the
   world bakes none. The day parts, the lamps and the dark stay the client's.
3. **Passes: keep `body`, `scarf`, `blood` and the building tile map, and add one, `emit`** (section 4). `emit` is a
   mask of what glows (lit windows, lamps, the forge, cave moss) on the static atlases. The darkness layer cuts it
   out at night, so a lit window stays lit. Normals, depth, a separate AO and a separate shadow layer were rendered
   and are not proposed.
4. **Tooling: render records instead of hoping for identical bytes** (section 5). Every batch writes a
   `render.lock.json` (inputs, Blender build, host). A re-render skips what did not change. Kenney packs get a hash
   lock like Poly Haven's, because a pinned Kenney URL has already rotted. CI gains an optional `bpy` smoke job.
5. **Where Blender runs: cloud sessions for the display-scale set, HD at 8 TAA samples, the laptop optional**
   (section 6). On this container the HD characters at today's settings are about 156 hours of rendering. At 8
   samples they are about 40, with no visible difference.
6. **ROSW: masters and records stay where they are** (section 7). A small adapter turns ROSW's `assemble-3d` and
   `asset-3d` output into this repo's master contract. The `render-pipeline` skill stays the handoff.

The sample sheets are in `docs/round11/samples/pipeline/` (section 8).

## 1. What the makeover changes in the pipeline

The round-11 README reads the makeover as every world asset made in Blender and rendered through one pipeline. For
the pipeline, the asset classes stand as follows:

| Class | Made today by | Through the rig today | After the makeover |
|---|---|---|---|
| Ground cells | `build_ground.py`, Poly Haven textures | yes (IsoCam) | same chain, 11B's materials |
| Kit (walls, cliffs, trees, rocks, fences, stacks) | `build_kit.py`, code + Kenney meshes via `kit_import.py` | yes | same |
| Buildings, multi-tile props | `build_buildings.py` recipes, sliced by `slice.ts` | yes | same, plus `emit` |
| Props, spots, portal frames | `build_props.py`, `env/*_props.py` | yes | same, plus `emit` where a prop glows |
| Ground decals (clues, pool) | `build_props.py`, `build_vfx.py` | yes (TileCam) | same |
| Figures (10 deck looks, 5 villagers, `constable`) | `build_looks.py`, `look_parts.py` | yes | same chain; 11B's materials and base |
| Vertical VFX | `build_vfx.py` | yes | same |
| Mobs, nodes, givers, tools, the round-10 greybox frames | `tools/sprites/m5b*.ts`, `placeholder-*.ts`: drawn in code | **no** | **into the rig**: modelled in `tools/blender/`, rendered like props (figures for mobs) |
| UI icons, card portraits, cards, screens | SVG masters (SPRITES 9), Higgsfield (ASSETS 6.4), DOM | no | out of scope here (11B and the questionnaire) |
| Map thumbnails | composited from the packed atlases (`review-world.ts thumbs`) | indirectly | same, re-run after the world |

The one new chain is the code-drawn row. Those keys keep their names, cells and pivots: the new frames come out of
`build_props.py` or `build_looks.py` and are packed by the same `pack-static.ts` and `pack.ts`, so nothing changes in
the client but the pixels.

## 2. Camera and scale

### 2.1 What the makeover keeps

Everything, by reference. The numbers live in SPRITES 10.3 (the camera, the display scale, `zScale`, the cells and
the cap), SPRITES 1 (the turntable and `figureScale`), SPRITES 4 and 10.5 (pivots), ASSETS 6.11 (the finish), and
`metrics.json` (`camera`, `iso`). The machine copies are `rig_common.py` and `@wdi/shared/iso`. This document adds
no new copy.

The rule stays the projection contract of `CLAUDE.md`: data, wire and facing are world frame. Only the client
presents isometrically. The atlas `<dir>` is screen frame, and `dirFromVector` is the one direction table.

### 2.2 What a change would cost

So that the owner can see why nothing moves:

| Change | What it costs |
|---|---|
| The camera angles (tilt 60°, yaw 45°) | Every atlas re-rendered. `@wdi/shared/iso` and its test, the tilemap exporter (5J), every scene's tilemap, the occlusion shells and the decal transform changed. The 2:1 diamond is what keeps tiles on whole pixels. A different tilt breaks that. |
| The display scale (90.51 px per m) | The same as the angles, because the 128 x 64 diamond is that scale. |
| `iso.zScale` (0.75) | Every world frame re-rendered. Walls' `wallHeightM` reads, the 96 px occluder rule (SPRITES 10.7), `topPadPx` and the 112 px cap all re-measured. |
| The packed character cell (64 px, 128 in HD) | It is a budget line, 11B's. A141 and SPRITES 10.14 already show that 128 px packed cells quadruple every frame and break the resident cap. |
| `figureScale` | A client number: no re-render. It stays 1 unless the owner's playtest asks for larger figures (art.md 2). |
| The 112 px cap | The four-heads base is designed to it (`probe_cap.py`). Raising it means a taller cell and every look re-probed. |

**_Proposed_: no change.** The makeover renders new art through the same frames, so every one of today's keys,
pivots and anims stays valid, and an art drop is a pixel swap the client never notices. Section 9 asks the owner to
confirm (P1).

### 2.3 What the makeover tightens

- **The cap is checked, not eyeballed.** `probe_cap.py` already projects every vertex of every clip. The makeover
  runs it on every look in CI (5.3) instead of by hand.
- **Calibration by numbers.** `batch_render.py --smoke` prints the feet row, the marker, the cube height and the
  diamond. This container reproduced every one of them (feet (64, 88), `n` marker (0, -15.28), the cube 96 px, the
  diamond 126 x 64, `die` feet (128, 128)). A CI check of those numbers, not of pixels, catches a rig drift (5.3).

## 3. Lighting

### 3.1 Today

- **In the renders.** One key sun and one moon area fill, both parented to the camera (ASSETS 6.2,
  `rig_common.KEY_LIGHT`, `FILL_LIGHT`). The key's camera-frame azimuth puts it in world south under IsoCam
  (`world_azimuth`). The world is slate at `WORLD_STRENGTH`.
  - 8-bit and low poly cast no shadows and have no AO.
  - HD (`materials/hd.py`) adds soft key shadows onto a shadow catcher, EEVEE fast-GI AO, soft band edges and a
    lantern rim on figures.
- **In the client** (`Lighting.ts`, SPRITES 10.11). The ambient fill (day, night, dark) as a canvas-sized darkness
  texture, a pool erased for your vision and each burning scene light, an additive glow per lit light, flicker on
  torches and fires, and the carried lantern. Every y-sorted sprite also gets a 2:1 ink ellipse under its feet
  (`PlayerView.ts`).

The split is sound. Renders say what a thing looks like under one fixed sun. The client says what time it is and
where the light is. The makeover keeps it.

### 3.2 What the renders bake

The sample sheet `lighting.png` renders HollowMere's tavern with the Baker at its door. All four cells are at the
display scale, raw, with the textures of today's 8-bit set. The set-ups are:

- **A. Today:** key and fill, no shadows.
- **B. A plus AO:** EEVEE fast GI, AO only, at `HD.aoDistance`.
- **C. B plus the key's cast shadow:** HD's shadow settings.
- **D. A at night:** the night ambient laid over A by hand, with the `emit` mask (4.2) cut back out.

What it shows:

- **AO** costs nothing measurable at the display scale (9.2 s against 9.6 s for A). It darkens the inner corners,
  the eaves and the ground at the wall's foot. In the stepped 8-bit ramp it only shows where it pushes a face across
  a band stop. In HD's soft bands it shows everywhere.
- **The key's cast shadow** costs five to six times A's render time (54 to 60 s for the tavern frame). Under A9's
  key, high and from world south, a building's shadow lands behind and under the building: on screen, under its own
  roof. Measured on the tavern frame, the shadow covers ground three quarters the size of the building's own pixels,
  and 2 % of that size is left visible, a thin wedge past the east gable (`shadow-layer.png`).
  On a figure it is a short dark spot behind the feet, where the client's ellipse already sits.

**_Proposed_ (P2):**

- **One key for every style.** It keeps A9's camera-frame azimuth and elevation (225° and 55° in camera frame;
  `rig_common.KEY_LIGHT` is the copy). This is art.md 5's rule already, and the toon ramp stops stay as measured.
- **AO baked in every style.** It is HD's fast-GI AO at its distance, now also in 8-bit and low poly. Because the
  ramp is stepped, an 8-bit face changes only where AO crosses a stop. The look of each style's AO is 11B's
  (look.md) to tune.
- **Figures bake their soft self-shadow and contact shadow in every style.** The arm on the coat, the hat on the
  face, a dark patch at the feet. The client's ellipse stays: it is what a figure stands on in every light.
- **No cast shadow on the world.** Under this key it is mostly hidden, it is the expensive part of a render, and it
  is baked into a frame that the darkness layer then darkens again at night.
- **No rim on world statics** (`HD.rimAmountWorld` is 0 today; it stays 0). The lantern rim on figures is a look
  choice, 11B's.

**Rejected:**

- **A lower key for long shadows.** It would make the cast shadows visible, but it moves every face's luma and so the
  ramp stops, the three-tone read of A9, and the client's sense of where noon is. If the owner wants long shadows, the
  shadow-layer pass of 4.3 is the way, and it is asked as P3.
- **Renders per day part (a dusk set, a night set).** That is three times every page for what the darkness layer
  already does.

### 3.3 What the client keeps

The ambient by day part, the pools, the glows, the flicker, the carried lantern and the occluder fade, unchanged.
`lighting` in `metrics.json` is unchanged. The one client addition the makeover asks for is the `emit` cut of 4.2,
which belongs to the round-11 build plan, not to this document.

## 4. Render passes

### 4.1 The list

A pass is a second render of the same frame through the same camera. Each one is a **material override**, the way
`batch_render.py` renders `scarf` and `blood` today. Every pass therefore shares the beauty frame's cells, trim and
pivots, and adds no new framing code.

| Pass | On | Ships | What the client does with it | Status |
|---|---|---|---|---|
| `body` (beauty) | everything | yes | draws it | kept |
| `scarf` | figures | yes (`ovl_<look>`) | tints it per seat | kept |
| `blood` | figures | yes (`ovl_<look>`) | shows it on a bloodied figure | kept |
| tile map (`*.tiles.png`) | buildings, multi-tile props | no (build time) | none: `slice.ts` cuts slices with it | kept |
| **`emit`** | statics that glow: lit windows, lamps, lantern posts, the forge, fire, cave moss | yes, `emit_<atlas>` | erases it from the darkness texture at night (4.2) | **new, _proposed_** |
| shadow layer | buildings, large props | yes, as a ground-layer sprite | draws it on the ground band, fades it by day part | rendered, **not proposed** (P3) |
| normal | everything | would | Phaser 4 normal-mapped lights for moving lamps | rendered, **not proposed** (P4) |
| depth | everything | would | depth-tested occlusion | rendered, **not proposed** |
| separate AO | everything | would | client AO strength | rendered, **not proposed**: baked (3.2) |

`passes.png` shows the beauty, `emit`, normal, depth, AO and the key's light and shadow for the tavern frame.

### 4.2 `emit`

- **Why.** At night the darkness layer covers the whole canvas at `ambient.night` and erases only the light pools.
  A window painted lantern-bright in the beauty pass is darkened with its wall. Today the glow sprite partly makes
  up for it, as a soft additive blob. The mask keeps the window's own pixels lit, which is the reading of
  reference 13 in art.md 1 ("lighting as the design").
- **What it is.** Each glowing part of a static is white, and everything else is a holdout. It is one alpha mask per
  frame, rendered in the same cell. It is packed into its own atlas, `emit_<atlas>`, holding only the frames that
  have a glowing pixel, trimmed, with the beauty frame's key and pivot. Rendered at the display scale it takes
  about 5 s for the tavern frame. It goes through the same finish (alpha cut, 2 x 2 mode, so its pixels land
  exactly on the beauty's).
- **How it is tagged.** A custom property on the part, `wdi_emit = 1`. Today's builders already name these parts
  (`WindowsLit`, `SignLamp`, the lamp heads). The `wdi_glow` that `batch_render.py` already reads on figures is the
  precedent.
- **Figures.** A figure's carried lamp is the client's `setCarried`, so figures get no `emit`.
- **Memory.** A mask page is RGBA in VRAM like any page. The masks are small and trimmed. In the tavern frame the
  emitting pixels are 3 % of the building's own pixels. The cap is **11B's** number, for one `emit` page per map plus one for
  the shared props. My estimate for 11B is at most 512² per map (0.0625 page-equivalents of 2048²) and 256² for the
  shared props. Asked of 11B on 2026-10-29.

### 4.3 The passes not proposed, and why

- **Shadow layer.** It renders the key's shadow on a catcher with the casters invisible: ink at alpha, the client
  drawing it in the ground band under every y-sorted sprite (`shadow-layer.png`, left and middle). It is the right
  form if long shadows are ever wanted. Baked into a sliced building frame, a shadow on the tiles beyond the
  footprint would be clamped into the edge slices and drawn over props on those tiles. As its own ground sprite it
  sorts correctly and the client can fade it at dusk. Under today's key it is mostly hidden (3.2), so it is not
  worth its render time or its page. It is P3.
- **Normals.** Phaser 4 can light sprites with normal maps. That gives every lit atlas a twin page, which doubles
  the world's VRAM against the resident cap of 9, and normal-mapped light fights the pixel finish's fixed palette.
  The client's lights are pools and glows, not lit surfaces. It is P4, for HD only if ever.
- **Depth.** The client's occlusion is slices, depth bands and the fade (SPRITES 10.6, 10.7). A depth texture would
  replace a system that works with one more page per atlas.
- **Separate AO.** Baked (3.2). A separate pass would only let the client scale it, which nobody needs.

### 4.4 Each pass's cost, for 11B

These are per page of the atlas the pass belongs to, in 11B's page-equivalents (VRAM uncompressed, 2048² RGBA =
16 MiB). 11B's budgets decide which ones fit.

| Pass | Page cost | Render cost on this container (section 6) |
|---|---|---|
| `body`, `scarf`, `blood` | as today (SPRITES 10.14): overlays are the `ovl_<look>` page | measured: about 1.25 s a 128 px frame each, in 8-bit |
| `emit` | ≤ 0.0625 a map + 0.016 shared, estimated | about 5 s a building frame |
| shadow layer (P3) | the layer covers about three quarters of its building's own area (measured on the tavern), so about 0.37 a map for HollowMere's 0.5 building page | about 40 s a building frame |
| normal (P4) | +100 % of every page it covers | about 27 to 33 s a building frame |

## 5. The tooling

### 5.1 Determinism: what holds and what does not

- **The finish and the packers are byte-deterministic** (`pixel.test.ts`, `pack.test.ts`, `images.test.ts`):
  unchanged inputs give unchanged pages.
- **A raw render is pixel-identical on the same host and build, but not byte-identical.** I rendered the Baker's
  `idle` in two directions twice: all 36 PNGs had identical pixels (largest difference 0) and different bytes
  (Blender's PNG metadata). The finish rewrites every image, so this never reaches a page. The manifest JSON was
  byte-identical.
- **Across hosts it is not promised.** EEVEE on a GPU and on Mesa llvmpipe differ within anti-aliasing noise (the
  README says as much of the calibration sheet). After the 2 x 2 mode and the palette snap, a one-level edge
  difference can still flip a packed pixel. A whole re-render on another machine therefore changes pages it should
  not.

**_Proposed_: render records.** Each render script writes `<out>/<atlas>/render.lock.json`. It holds:

- for each frame or asset, the sha256 of its inputs: the builder's source files, the master `.blend` if any, the
  material lock entries it reads, the rig constants (`rig_common` hashed), and the style and flags;
- the Blender build (`bpy.app.version_string` and `build_hash`) and the host (GPU vendor or `llvmpipe`, CPU count).

The lock is committed beside the art-drop's pages, under `assets/source/renders/<atlas>.lock.json`. It is small JSON;
the raw renders are never committed.

- A re-render with `--changed` compares hashes and renders only the frames whose inputs moved. Their atlas is then
  re-packed from the cached raw frames of the rest. Unchanged pages stay byte-identical because their frames were
  never re-rendered.
- A batch is rendered on one host. The lock says which one, so the next drop knows whether a full re-render is
  needed to keep the set consistent.
- A test in `tools/sprites` checks that every shipped atlas has a lock and that the lock's frame list equals the
  atlas's.

### 5.2 Sources that must be pinned

- **Poly Haven** is pinned by md5 in `materials/polyhaven.lock.json`, and `fetch.py` refuses a mismatch. Good.
- **Kenney packs are not pinned.** `env/kits.py` downloads them from dated URLs. On 2026-10-29 the Fantasy Town URL
  returned an HTML page, and `kits.py` failed with "File is not a zip file". The kit renders that use Kenney meshes
  (trees, rocks, stacks, the fitted furniture) cannot be re-made from a fresh checkout today.
  - **_Proposed_:** a `kits.lock.json` beside the Poly Haven lock, with each pack's sha256 and current URL.
    `kits.py` refuses HTML and hash mismatches and says which pack.
  - When a URL rots, the lock records the new URL against the same hash.
  - Since the packs are CC0, the owner may also allow a mirror as a GitHub Release asset of this repo, in the way
    ROSW's `sound-library/` keeps its originals (P8).

### 5.3 Tests and CI

**Today:**

- CI's `check` job runs `@wdi/blender`'s `python3 -m unittest` with no Blender: `rig_common`, the materials and
  `fetch.py` against a fake server.
- It runs `@wdi/sprites`'s vitest on the committed pages: palette, alpha, budgets, manifests, keys, determinism.
- Nothing in CI runs `bpy`.
- ASSETS 6.6 says "CI warns when a PR adds more than 25 MB of binaries". No such step is in `ci.yml`. The build plan
  should add it, or ASSETS should stop saying it.

**_Proposed_ additions:**

| Test | Where | What it checks | Cost |
|---|---|---|---|
| `bpy` smoke | a new CI job, `blender`, on changes under `tools/blender/**` and nightly; not required for merge at first | `pip install bpy==5.2.0` and the EGL packages; `batch_render.py --smoke`; asserts the printed calibration numbers (2.3) to ±1 px | about 45 s of render plus the wheel install, measured here |
| cap probe | the same job | `build_looks.py --look all` then `probe_cap.py` on every look (no render) | seconds a look (a look builds in about 1 s) |
| pass registration | the same job | one frame of one look and one building with every pass. The `emit`, `scarf` and `blood` pixels lie inside the beauty's alpha | about a minute |
| render locks | `@wdi/sprites` vitest | every shipped atlas has its `render.lock.json`, and the frames match | none |
| source locks | `@wdi/blender` unittest | `kits.lock.json` and `polyhaven.lock.json` are well-formed, every role and kit id resolves | none |

### 5.4 How a re-render lands

These are art-drop pull requests as in ASSETS 6.6, cut so that each stays reviewable and under GitHub's limits:

1. One pull request per **asset class and map**, all styles together: ground and kit of a theme; a map's buildings;
   a map's props; shared props, clues and VFX; then the figures in groups of three to five looks.
2. Each carries its pages, the manifests, the render locks, the `MANIFEST.md` and `CREDITS.md` rows, and its review
   sheets under `assets/source/review/`. The review sheets are the owner's sign-off by eye, as in round 8.
3. The order is the world before the figures, because figures are judged against the new ground. The code-drawn
   classes (1) come last, because they need new models.
4. The binary warning (5.3) is per pull request, so the size of a figure group follows 11B's page sizes per style.

## 6. Where Blender runs

### 6.1 Measured on this container

- **Build:** the `bpy` 5.2.0 LTS wheel (build hash `fbe6228777e7`) on Python 3.13.17, with Mesa 25.2.8 llvmpipe
  through EGL (`EGL_PLATFORM=surfaceless`, the `libegl1 libegl-mesa0 libgbm1` packages).
- **Container:** 4 vCPU, 15 GB of RAM, no GPU.
- **Run:** one process at a time, so each figure has the four cores to itself.

| Render | Time |
|---|---|
| `batch_render.py --smoke` (the calibration sheet) | 44 s |
| `build_looks.py --look baker` (the master) | 1.1 s |
| The Baker's `walk`, 8 directions x 8 frames x 3 passes, 8-bit (128 px cells) | 241 s for 192 frames: **1.25 s a frame** |
| The same in HD (256 px cells, `taaSamples` 32, shadows, AO) | 21.5 s a frame for every pass (stopped after 22 frames) |
| HD `idle`, one direction, `taaSamples` 32 against 8 | 118 s against 36 s for 6 frames: **about 19.7 against 5.5 s a frame**. The difference is a mean of 0.44 of 255 on the figure, and 0.3 % of its pixels differ by more than 16 levels |
| The tavern frame at the display scale (1408 x 1104): A / B / C of 3.2 | 9.6 / 9.2 / 54 s |
| Its passes: `emit` / shadow layer / normal / depth / AO | 5 / 40 / 27 / 27 / 29 s |

### 6.2 What the makeover renders

The figures dominate. A deck look renders 504 resident and 88 lazy frames a pass, and a villager-family look 408 and
56 (SPRITES 3, `rig_common.frame_counts`). There are three passes. The `constable` is counted like the family, which
is an estimate until round 10 settles its clips. The total is about **26 100 figure frames a style set**: 10 deck
looks x 1 776, 5 family looks x 1 392, and the constable's 1 392.

8-bit and low poly come from the same raw renders (A79). The second render set is HD. On one container like this
one:

| Set | Per frame | Figures |
|---|---|---|
| Display scale (8-bit and low poly) | 1.25 s | about **9 h** |
| HD at today's 32 samples | 21.5 s | about **156 h** |
| HD at 8 samples | 5.5 s | about **40 h** |

The world is small beside this. A map's buildings, props, kit and ground come to a few hundred frames of a few
seconds to a minute each. That is an hour or two a map a style, plus the shadow-free AO cost, which is none.

### 6.3 The three places

| Where | For | Against |
|---|---|---|
| **A cloud session** like this one | Measured. It runs today's scripts unchanged and can be fanned out: N sessions, each on its own looks. The environment's setup script can install the wheel and the EGL packages for every new session. No masters leave the repo's own code. | No GPU. HD figures are the long pole. A session can stop mid-batch, and the render lock (5.1) lets the next one carry on. |
| **The owner's laptop**, through Remote Control or a local session | It is where the masters, studio notes and the ROSW pipelines live. ROSW's `machine.yaml` describes it as 16 GB, an integrated GPU, no CUDA. EEVEE does run on an integrated GPU. | Unmeasured. ROSW's own headless branch has run only on Blender 5.0.1 and "not yet on the author's Windows machine". It ties renders to the owner's time and power (ROSW's compute gate asks for AC power and 8 GB free). |
| **Higgsfield's remote Blender** (ROSW `scene-blender`) | Blender 5.2, already wired in ROSW. | It is a scene builder for block-outs and spends credits. It is not a batch renderer for thousands of frames, and the repo's scripts cannot run there. |

**_Proposed_ (P5):**

- The display-scale set and the whole world render in **cloud sessions**.
  - Run 4 sessions for the figures (about 2 to 3 h each) and one per map for the world.
  - The setup script installs `bpy==5.2.0` and the EGL packages. That is the environment's setting, which the
    owner changes in its settings page; this document cannot.
- HD figures render at **`taaSamples` 8** (`rig_common.HD`; the look is 11B's to confirm from the sample above), in
  the same fan-out: about 10 h each over 4 sessions.
- The laptop is optional. It is worth one measured frame (the calibration sheet and one HD look) before anything is
  planned on it. If it is much faster, HD moves there.
- Every batch keeps to one host (5.1).

## 7. Where the plan meets ROSW

**Stays as it is:**

- Masters stay on the laptop under `studio/assets/who-did-it/<kind>/<slug>/`, recorded by a studio note and mirrored
  in `assets/source/MANIFEST.md` (ASSETS 6.10).
- ROSW's `render-pipeline` skill stays the handoff: master contract, `batch_render.py`, `pack.ts`, `MANIFEST.md`, an
  art-drop PR.
  - The makeover adds two lines to it, which ROSW's owner session writes, not this one: run `--changed` with the
    render lock (5.1), and copy the `render.lock.json` into the drop.

**The 3D pipelines on the branch `claude/focused-rubin-edsz6p`** (unmerged, 2026-10-29):

- `asset-3d` makes one GLB a model through the Meshy API, dry run first, each task recorded.
- `assemble-3d` imports, normalises (metres, Z up, scaled to `target_height_m`, grounded), adds LODs
  (`rosw_<name>_LOD<n>`), stages, saves `scene.blend`, exports `scene.glb` and renders a perspective preview. It
  runs headless (`assemble.py`) or live through the Blender MCP server.
- Both run the studio's six checkpointed stages (intake, context, recipe, execute, review, record) and keep
  `final`, `variant` and `export` files with their sha256.

| Meets this plan at | ROSW has | This repo needs | _Proposed_ |
|---|---|---|---|
| Units and axes | metres, Z up, grounded | the same: the rig scales by `CharRoot` and `EnvRoot` | nothing to change |
| Naming | `rosw_<name>` collection and root, `rosw_asset`, LOD objects | an `Export` collection, `wdi_part` tags, a `Feet` empty, actions named by clip (`tools/blender/README.md`); statics as builder objects | an adapter, `tools/blender/rosw_import.py`, beside `kit_import.py`. It takes a kept GLB or `scene.blend`, keeps LOD0 only, tags parts, re-materials through 11B's roles and writes the contract. It is the place a Meshy humanoid's rig is mapped onto the 22-bone armature, or replaced. |
| Camera | a perspective 50 mm preview | IsoCam only | the preview is the studio's review image, never a sprite |
| Blender | 5.0.1 verified headless | 5.2 LTS (the rig's version) | the adapter refuses a master saved by another major.minor, and the studio note records the version |
| Budgets | per recipe (`glb_inspect.py --budget`) | 11B's | 11B gives a recipe line per class (tris, texture, height). The recipe cites look.md |
| Licence | Meshy output | ASSETS 6.4: "Whether CC0 (A17) covers generated meshes is still open" | P7 |

The ROSW teardown (`teardowns/who-did-it/chapters/06-art-audio.md`) says "keep the camera locked" and "keep
characters on the Blender rig". This plan does both.

## 8. Sample sheets

These are in `docs/round11/samples/pipeline/`. All of them are raw renders at the display scale (the scale 8-bit
and low poly render at, before the finish), through the repo's own rig and builders with the textures of today's
8-bit set. Nothing in them ships.

| File | Shows |
|---|---|
| `lighting.png` | 3.2's four set-ups on HollowMere's tavern and the Baker: A today, B with AO, C with AO and the key's cast shadow, D A at night with the `emit` mask cut out |
| `passes.png` | the beauty and the candidate passes of 4.1: `emit`, normal, depth, AO, the key's light and shadow |
| `shadow-layer.png` | the key's shadow as a separate ground-layer sprite (4.3): the ground with the layer, then the unshadowed statics over it, beside C, where it is baked into the frame |
| `make_samples.py` | the script that made them: it drives `build_buildings.py`, `build_looks.py`'s Baker, `batch_render.py` and `materials/hd.py`; how to run it is in its docstring |

The tavern's Kenney-free shell was used because the Kenney packs could not be fetched (5.2). The Poly Haven textures
came through `env/kits.py`.

## 9. Questions for the owner

Each question has a proposed default. A session in doubt takes the default.

1. **P1. Camera and scale stay exactly as today?** (2.2) Proposed: yes; the makeover is new art in today's frames,
   with no client change. Default: yes.
2. **P2. One light for every style: A9's key, AO baked in every style, contact shadows on figures, no cast shadows
   on the world?** (3.2) Proposed: yes. Default: yes.
3. **P3. Long shadows on buildings, as a separate ground layer the client fades at dusk?** (4.3) Proposed: no, not in
   round 11; under today's key they are mostly hidden under the roofs. Default: no.
4. **P4. Normal-mapped lighting (lamps that light walls as you carry them)?** (4.3) Proposed: no; it doubles every
   page. Default: no.
5. **P5. Where renders run: cloud sessions fanned out (four for the figures), HD at 8 anti-aliasing samples, your
   laptop only if one test frame shows it is much faster?** (6.3) Proposed: yes. Default: cloud.
6. **P6. May the cloud environment's setup script install Blender (the `bpy` 5.2.0 wheel and three graphics
   packages) for every session?** (6.3) Proposed: yes; it adds about a minute to a session's start. Default: yes.
7. **P7. Meshy (ROSW `asset-3d`) models in shipped art: allowed, and under which licence?** (7) ASSETS 6.4 leaves
   it open. Proposed: allowed for props and creatures once the vendor's terms row is saved, CC0 like generated
   images (A17); figures stay on the code-built base. Default: not used in round 11.
8. **P8. May the CC0 Kenney packs be mirrored as a release asset of this repo, so a rotted link never blocks a
   re-render?** (5.2) Proposed: yes, with the hash lock. Default: the hash lock only.
9. **P9. The code-drawn mobs, nodes, givers, tools and greybox frames move into the rig?** (1) Proposed: yes, last,
   after the world and the figures. Default: yes.
