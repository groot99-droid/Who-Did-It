# tools/blender

The V1 render rig (`docs/ASSETS.md` 6.2, `docs/SPRITES.md`). Python only; it runs inside Blender
5.2 LTS or under the `bpy` 5.2 wheel. Nothing here is committed as a `.blend`: `build_rig.py`
rebuilds `render_rig.blend` from code, and `batch_render.py` builds it in memory when no `--rig` is given.

| File | Does |
|---|---|
| `static_common.py` | Shared helpers for the static sheets: the rig with calibration hidden, `SpriteCam` / `TileCam` framing, palette materials, shape helpers, the per-atlas `manifest.json` (`file`, `cell`, `pivot`); since round 5 also `IsoCam` (`iso_frame`, `iso_px`; built here until 5L's rig carries it), the 0.75 environment root and world-palette toon, flat and textured materials |
| `build_props.py` | Renders the round-5 prop atlases (`props`, `props_<mapId>`) through IsoCam and the 24 clue keys (the 15 ground decals through TileCam, the thread, felt and bucket through IsoCam, Hunger's glowing footprints new) |
| `rig_common.py` | Directions, frame regex, cells, the IsoCam and display-scale constants, the turntable, the world palette (OKLab snap, ramp neighbours), light and outline constants; pure Python |
| `build_rig.py` | Builds the rig: `IsoCam` (ortho, X 60°, Y 0°, Z 45°, 90.51 px per ground metre; SPRITES 10.3), `TileCam` (straight down, one 64 px tile per metre, for decals), the root empties `EnvRoot` (1, 1, 0.75) and `CharRoot` (0.75 on every axis) with the turntable `TT` under `CharRoot`, camera-parented key sun and area fill, slate world at 0.15, the `WDI_Toon` node group, `OutlineInk`, the `Outline` Solidify preset, a 1 m checker cube with a facing marker, a 1 m tile plane, a 4 m grid plane with 1 m lines, a hidden 1.7 m `FallenProxy` for the `die` cell check, a `Feet` empty, EEVEE settings |
| `batch_render.py` | `--smoke` IsoCam calibration sheet at the display scale (8 cube views with their facing markers, one 1 m tile diamond, the `TileCam` grid, one 256 px `die` frame), or character passes with the per-frame `Feet` manifest; `tools/sprites` `pixel` finishes either |
| `build_looks.py` | Builds every world look of `looks.json` and its `villagers` family (the plain `villager` and four townsfolk variants) from one four-heads-tall base (round 8, A161: a 0.40 m head, 0.52 m shoulders, wide hands and boots, layered costume with notched hems, one signature prop a look, the back designed like the front): rigid chamfered parts on a 22-bone armature, the five clips (`idle`, `walk`, `swing`, `interact` on its `kneel` / `waist` / `raise` base, `die`) keyed in code at 24 fps; writes `<out>/<lookId>.blend` (git-ignored masters) |
| `probe_cap.py` | Projects every body vertex of a look through `IsoCam` for every frame and direction of its clips and prints the highest row each clip reaches, failing under `--limit` rows of headroom (3 renders clean; the looks keep 3.5). Faster than a render, and it names the part: `python tools/blender/probe_cap.py -- --char build/looks/detective.blend --body detective` |
| `look_parts.py` | The shape helpers (`frustum`, `box`, `ring`, `cylinder`, `rod`), the world-ramp toon materials, the part builder and every costume piece (`@piece`) |
| `looks_spec.py` | Each look's colours (world ramp steps), skin tone, `interact` base and costume pieces; pure Python |
| `build_villager.py` | Retired: a re-export shim of `look_parts.py`'s shapes for `static_common.py` until it imports them from there |
| `build_buildings.py` | Renders each map's buildings (`bld_<mapId>`) from recipes at their footprints (the scene's `buildings[]`, else art plan 3.4) and the multi-tile props, each twice through IsoCam: the beauty and a raw tile map that `tools/sprites/slice.ts` cuts slices with |
| `build_ground.py` | Renders the isometric ground cells (art plan 3.2): each of the 14 materials of both themes in four variants, one metre under IsoCam at 128 x 64 display px, from a Poly Haven texture pulled towards its world-palette colour and a seeded scatter; the variants blend to one shared mapping at the tile edge, so all four tile with each other. `tools/sprites/tileset.ts` joins them |
| `env/kitbash.py`, `env/shared_props.py`, `env/hollowmere_props.py`, `env/blackpine_props.py` | The modelling vocabulary (world-palette toon `T`, unlit `F`, box, prism and outline shapes, fitted Kenney meshes) and the frames of `props` (shared props, 8 spots, 20 portal frames), `props_hollowmere` (33 props, 22 spots) and `props_blackpine` (18 props, 14 spots); the multi-tile props are in `build_buildings.py` |
| `build_kit.py` | Renders the 44 kit frames of each theme (`<wall\|cliff\|tree\|boulder\|fence\|stack>/<full\|half\|stub>/<0-3>`, art plan 3.3) under IsoCam at twice their art cell, pivoted on the tile centre's ground point; walls and cliffs from code with Poly Haven textures, trees, rocks and stacks from Kenney |
| `kit_import.py` | Imports a CC0 kit mesh (GLB, glTF, FBX, OBJ), joins it, tags it (`wdi_part`) and re-materials it through `WDI_Toon` in the world palette |
| `env/kits.py` | The CC0 packs and textures of the world art (Kenney URLs, the Poly Haven ids per theme and material) and their fetch into git-ignored `assets/external/kits/`, saving the licence files; pure Python |
| `build_tiles.py` | Renders four seamless 64 px straight-down variants of each of the six ground sets (`tiles_<biome>_<v>`) |
| `save_masters.py` | Saves the world masters `buildings_<mapId>.blend` and `props_<mapId>.blend` (round 5) into git-ignored `assets/external/` for the ROSW checkout; the round-4 `bakery_props.py` and its master are retired (DECISIONS A62) |
| `env/ambience.py` | Fetches the four CC0 OpenGameArt ambient sources and masters `amb_village`, `amb_house`, `amb_forest`, `amb_cave` with ffmpeg (loop, mono, -18 LUFS, 2 s crossfade seam, Vorbis q5); pure Python, no `bpy` |
| `build_vfx.py` | Animates the four M3 VFX frame by frame at 12 fps (`vfx_blood_pool`, `vfx_blood_splat`, `vfx_vote_stamp`, `vfx_dust_step`) |
| `palettize.py` | Snaps materials to the 64-colour world palette (OKLab), light and shadow from the ramp neighbours; fails on untextured PBR |
| `tests/test_rig_common.py` | Unit tests (`pnpm --filter @wdi/blender test`, no Blender needed) |
| `tests/make_dummy_char.py` | Builds a capsule character that follows the contract below, for pipeline tests |

## Commands

```sh
# IsoCam calibration sheet (round 5): render at the display scale, then finish it to packed size into
# apps/client/public/assets/calibration/{calibration_sheet.png,calibration.json} (the JSON stays in display px)
blender -b --factory-startup -P tools/blender/batch_render.py -- --smoke --out build/calib-raw
pnpm --filter @wdi/sprites pixel ../../build/calib-raw ../../apps/client/public/assets/calibration

# The rig file, for opening in the UI
blender -b --factory-startup -P tools/blender/build_rig.py -- --out tools/blender/build/render_rig.blend

# The round-5 looks (git-ignored masters; copy to the ROSW checkout, assets/source/MANIFEST.md)
python tools/blender/build_looks.py -- --look all --out assets/external/looks
# one look end to end: render (4 parallel direction groups), finish, pack, review
for d in n,ne e,se s,sw w,nw; do
  python tools/blender/batch_render.py -- --char assets/external/looks/baker.blend --body baker --out build/render --dirs $d &
done; wait
pnpm --filter @wdi/sprites pixel ../../build/render/baker ../../build/finished/baker
pnpm --filter @wdi/sprites pack ../../build/finished/baker ../../apps/client/public/assets/chars
pnpm --filter @wdi/sprites contact ../../build/finished/baker ../../assets/source/review/looks-contact-baker.png

# Character passes: build/render/<body>/<pass>/char_<body>_<anim>_<dir>_<nnn>.png + manifest.json
blender -b --factory-startup -P tools/blender/batch_render.py -- \
  --char ~/ROSW/studio/assets/who-did-it/character/villager/villager.blend --body villager --out build/render
# options: --anims idle,walk --dirs n,se --passes body,scarf --rig tools/blender/build/render_rig.blend

# The full V1 set in four parallel runs (about an hour on Mesa llvmpipe, 4 cores; minutes on a GPU)
for d in n,ne e,se s,sw w,nw; do
  python tools/blender/batch_render.py -- --char assets/external/villager/villager.blend --out build/render --dirs $d &
done; wait

# Props, clues and VFX (minutes on llvmpipe), then pack them (tools/sprites)
python tools/blender/build_props.py -- --out build/render   # build/render/{props,clues}/
python tools/blender/build_vfx.py -- --out build/render     # build/render/vfx/ (round 5: then `pixel --display`)
for a in clues props vfx; do
  pnpm --filter @wdi/sprites pack:static ../../build/render/$a ../../apps/client/public/assets/$a
done

# Building exteriors and tilesets (minutes on llvmpipe), then finish them (tools/sprites)
python tools/blender/build_tiles.py -- --out build/render       # build/render/tiles/ (until K6)
pnpm --filter @wdi/sprites images ../../build/render ../../apps/client/public/assets

# World art (round 5): fetch the CC0 packs once, then the isometric ground tilesets
python3 tools/blender/env/kits.py --out assets/external/kits --licences LICENSES/vendors
python tools/blender/build_ground.py -- --out build/render   # build/render/ground/<theme>/
pnpm --filter @wdi/sprites tileset ../../build/render/ground ../../apps/client/public/assets/ground

# The kits: render, pixel-finish, pack; then the review sheets
python tools/blender/build_kit.py -- --out build/render     # build/render/iso_kit_<theme>/
for t in harbour timber; do
  pnpm --filter @wdi/sprites pixel ../../build/render/iso_kit_$t ../../build/finished/iso_kit_$t
  pnpm --filter @wdi/sprites pack:static ../../build/finished/iso_kit_$t ../../apps/client/public/assets/kit
  pnpm --filter @wdi/sprites review:world kit ../../apps/client/public/assets $t ../../assets/source/review/kit-$t.png
done

# Buildings and the multi-tile props: render, then finish and slice, then pack
python tools/blender/build_buildings.py -- --out build/render   # build/render/bld_<map>/, props_<map>_sliced/
pnpm --filter @wdi/sprites slice ../../build/render/bld_hollowmere ../../build/finished/bld_hollowmere
pnpm --filter @wdi/sprites slice ../../build/render/props_hollowmere_sliced ../../build/finished/props_hollowmere
pnpm --filter @wdi/sprites pack:static ../../build/finished/bld_hollowmere ../../apps/client/public/assets/buildings

# Gate A (art plan 3.10): the same raw renders finished on (the shipped assets) and off (build/gate-off)
pnpm --filter @wdi/sprites tileset ../../build/render/ground ../../build/gate-off/ground --finish off
for a in iso_kit_harbour props props_hollowmere; do
  pnpm --filter @wdi/sprites pixel ../../build/render/$a ../../build/finished-off/$a --finish off; done
pnpm --filter @wdi/sprites slice ../../build/render/props_hollowmere_sliced ../../build/finished-off/props_hollowmere --finish off
pnpm --filter @wdi/sprites slice ../../build/render/bld_hollowmere ../../build/finished-off/bld_hollowmere --finish off
# pack each finished-off folder into build/gate-off/{kit,props,buildings} with pack:static, copy chars/, then
pnpm --filter @wdi/sprites review:world gate ../../apps/client/public/assets ../../assets/source/review/gate-a-world-on.png
pnpm --filter @wdi/sprites review:world gate ../../build/gate-off ../../assets/source/review/gate-a-world-off.png --finish off

# Both art styles (DECISIONS A79) in one go from the raw renders above: 8-bit at the root, low poly in lowpoly/
pnpm --filter @wdi/sprites world ../../build/render ../../apps/client/public/assets

# Map thumbnails (480 x 270 WebP, composited from the shipped atlases) and the ambient loops
pnpm --filter @wdi/sprites review:world thumbs ../../apps/client/public/assets ../../apps/client/public/assets/thumbs
python3 tools/blender/env/ambience.py --out apps/client/public/assets/audio --licences LICENSES/vendors

# The world masters (git-ignored; copy to the ROSW checkout, assets/source/MANIFEST.md)
python tools/blender/save_masters.py -- --out assets/external

# The body review sheet from a die render (all passes)
python tools/blender/batch_render.py -- --char assets/external/villager/villager.blend --out build/render --anims die
pnpm --filter @wdi/sprites contact:body ../../build/render/villager ../../assets/source/review/villager-body-contact.png

# Palettize a character file in place
blender -b villager.blend -P tools/blender/palettize.py -- --save
```

Without a Blender install, `pip install bpy==5.2.0` (Python 3.13) and run the same scripts with
`python tools/blender/batch_render.py -- --smoke ...`. On a headless Linux box EEVEE needs EGL:
`apt install libegl1 libegl-mesa0 libgl1-mesa-dri libgbm1` and `EGL_PLATFORM=surfaceless`. The
committed calibration sheet was rendered that way (Mesa llvmpipe, bpy 5.2.0); a GPU render on the
owner's laptop should match it pixel for pixel or within anti-aliasing noise.

## Character file contract

- A collection named `Export` holding everything to render.
- Mesh parts carry the custom property `wdi_part`: `body`, `scarf`, `hat_cap`, `hat_bowler` or
  `blood` (a slightly inflated torso and hands shell). Overlay passes show one part and turn the body
  into a holdout, so overlays are occluded exactly as on the body.
- An empty named `Feet` on the ground between the feet; it may follow the root bone.
- One action per clip, named `idle`, `walk`, `swing`, `die`, at a scene rate that is a whole multiple
  of 12 fps (24 by default). Looping clips (`idle`, `walk`) end on a copy of their first pose, which
  is not rendered; one-shot clips render their last frame.
- `manifest.json` gets the `Feet` pivot from every pass, so a run of overlay passes alone still writes
  complete entries. Runs merge into an existing `manifest.json` under a file lock, so a set split by
  `--anims`, `--dirs` or `--passes`, sequential or in parallel into one `--out`, adds up to one
  manifest; a body-pass run replaces a frame's entry (and its `clipped` flag), an overlay-only run only
  updates the pivot.
- The renderer palettizes materials, adds the `Outline` hull to every part except `blood`, and warns
  when a clip does not sample to the V1 frame count or a body frame touches the cell edge.

## IsoCam calibration (round 5, 2026-10-18)

Measured with the `bpy` 5.2.0 wheel on Mesa llvmpipe (`calibration.json`, display px):

- `Feet` at the origin projects to (64, 112) in a 128 px cell (the smoke sheet lifts it 24 px to (64, 88)
  so the turned cube fits) and to (128, 128) in the 256 px `die` cell. The facing marker of the `n` frame
  points straight up the screen (`marker` (0, -15)), and every direction's marker falls in its 45° sector
  (`tests/test_rig_common.py`).
- A 1 m tile renders as a 128 x 64 diamond (126 px of opaque width after anti-aliasing). The 1 m cube
  under the character root (0.75 m tall) is 96 px tall turned square to the camera, outline included.
- The lights keep their camera-frame azimuths (key 225°, fill 45°) and stay parented to the camera, so
  under IsoCam the key comes from world south (`rig_common.world_azimuth`).
- **Toon ramp stops 0.25 / 0.65** (were 0.30 / 0.70). The ramp luma under IsoCam: tops and ground 0.77;
  the wall the key reaches, square to the camera (world south face, screen lower left), 0.49; both walls
  of a cube turned 45° (square to the camera) 0.35; the wall turned from the key (world east face, screen
  lower right) 0.02. So tops and ground fall in the light band, lit walls in the mid band and faces
  turned from the key in the shadow band, each at least 0.10 from a stop. The screen-right wall of an
  axis-aligned building is in the shadow band: the classic three-tone iso read, with the lights unchanged.
- EEVEE filter size 1.0 (was 1.5); the character outline is -0.022 m, one art pixel after the finish.
- The finished sheet is world-palette only, alpha 0 or 255 (`tools/sprites/test/palette.test.ts`).

## Calibration results and rig decisions (2026-10-10, SpriteCam, retired in round 5)

- `Feet` at the origin projects to (64, 112) in a 128 px cell; the 1 m cube is 93 px tall
  (90 px plus the outline). The smoke sheet lifts the frame 24 px so a cube turned 45° fits.
- Key light azimuth is **225°** (camera side, screen left), not 315°: at 315° the key sat behind the
  subject and every camera-facing surface fell into the shadow band. Recorded in `ASSETS.md` 6.2.
- The fill's "strength 0.6" is read as the irradiance of a 0.6 sun: 220 W at 10 m measured, so the
  fill uses `3.67 W x d²` at 30 m and 12 m wide, with a custom cutoff distance (EEVEE's light
  threshold culled it otherwise). Far and wide keeps it even across a sprite; a near area light put
  ramp-stop splits across flat faces.
- The key sun has `angle = 0`; the checker texture is offset 1 mm because the cube's faces sat on its
  square boundaries and TAA flipped between colours.
- Toon ramp stops are **0.30 / 0.70**, not 0.42 / 0.78. The ramp sees the luma of the lit diffuse:
  about 0.87 x N·L of the key (3/π for a strength-3 sun times the key colour's luma) plus a little
  fill. Measured on the rig: camera-facing faces 0.35, the lit diagonal side 0.49, the far side 0.02,
  top faces and the ground 0.77. At 0.42 / 0.78 the front faces sat in the shadow band and the tops
  and ground in the mid band (the ground read flat slate); the new stops leave at least 0.05 margin.
- `die` renders 256 px cells with the feet at the centre (`rig_common.CLIP_CELL`): a 1.7 m body
  falling towards the camera spans about 90 px below the feet, which no 128 px cell can hold. The smoke sheet renders a fallen 1.7 m proxy in that cell: feet at
  (128, 128), the body reaching 85 px below them.
