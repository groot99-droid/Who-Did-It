# tools/blender

The V1 render rig (`docs/ASSETS.md` 6.2, `docs/SPRITES.md`). Python only; it runs inside Blender
5.2 LTS or under the `bpy` 5.2 wheel. Nothing here is committed as a `.blend`: `build_rig.py`
rebuilds `render_rig.blend` from code, and `batch_render.py` builds it in memory when no `--rig` is given.

| File | Does |
|---|---|
| `rig_common.py` | Directions, frame regex, cells, palette, light and outline constants; pure Python |
| `build_rig.py` | Builds the rig: `SpriteCam` (ortho, X 40°, Z 0°, 64 px/m), `TileCam` (straight down, one 64 px tile per metre), turntable `TT`, camera-parented key sun and area fill, slate world at 0.15, the `WDI_Toon` node group, `OutlineInk`, the `Outline` Solidify preset, a 1 m checker cube with a facing marker, a 4 m grid plane with 1 m lines, a hidden 1.7 m `FallenProxy` for the `die` cell check, a `Feet` empty, EEVEE settings |
| `batch_render.py` | `--smoke` calibration sheet (8 cube views, the ground tile, one 256 px `die` frame), or character passes with the per-frame `Feet` manifest |
| `build_villager.py` | Builds the V1 `villager` body from code: a 1,388-triangle block-out of chamfered boxes, 3 heads tall, with the overlay parts, an 8-bone armature and the four V1 actions; writes the `.blend` (and optionally the source GLB) to `assets/external/villager/`, never into git |
| `palettize.py` | Snaps materials to the palette; fails on untextured PBR |
| `tests/test_rig_common.py` | Unit tests (`pnpm --filter @wdi/blender test`, no Blender needed) |
| `tests/make_dummy_char.py` | Builds a capsule character that follows the contract below, for pipeline tests |

## Commands

```sh
# Calibration sheet (M0): writes apps/client/public/assets/calibration/{calibration_sheet.png,calibration.json}
blender -b --factory-startup -P tools/blender/batch_render.py -- --smoke --out apps/client/public/assets/calibration

# The rig file, for opening in the UI
blender -b --factory-startup -P tools/blender/build_rig.py -- --out tools/blender/build/render_rig.blend

# The V1 villager body (git-ignored master; copy to the ROSW checkout, assets/source/MANIFEST.md)
python tools/blender/build_villager.py -- --out assets/external/villager/villager.blend \
  --glb assets/external/villager/villager.glb

# Character passes: build/render/<body>/<pass>/char_<body>_<anim>_<dir>_<nnn>.png + manifest.json
blender -b --factory-startup -P tools/blender/batch_render.py -- \
  --char ~/ROSW/studio/assets/who-did-it/character/villager/villager.blend --body villager --out build/render
# options: --anims idle,walk --dirs n,se --passes body,scarf --rig tools/blender/build/render_rig.blend

# The full V1 set in four parallel runs (about an hour on Mesa llvmpipe, 4 cores; minutes on a GPU)
for d in n,ne e,se s,sw w,nw; do
  python tools/blender/batch_render.py -- --char assets/external/villager/villager.blend --out build/render --dirs $d &
done; wait

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

## Calibration results and rig decisions (2026-10-10)

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
