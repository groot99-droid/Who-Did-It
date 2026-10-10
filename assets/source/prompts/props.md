# (8) Single props: brass key, bloodied knife, oil lantern

**Slug** `props` · **Source** `docs/ASSETS.md` 6.4 prompt (8) · **Use** Props and inventory icons (`ASSETS.md` 6.3).

## Prompt

Subject, then the style suffix of `ASSETS.md` 6.4 byte for byte (the STYLE FORMULA; `style.json` freezes it):

```text
a single {prop} centred on a plain background, three-quarter view from above, whole object in frame, stylized toon-noir, chunky low-poly 3-heads-tall proportions, flat two-tone cel shading, thick dark ink outlines, moody night lighting with warm lantern orange and cool moonlight blue, palette #12141C #2C3240 #6F7A8C #D9D2C2 #F2B33D #2EC4B6 #E04E9A, clean solid background, no text.
```

## Attach

- The hero concept (`assets/source/concepts/villager-hero-front.*` once it exists).
- The calibration cube render (`apps/client/public/assets/calibration/calibration_sheet.png`).
- On drift, restate "3-heads-tall" and "flat cel" in the subject.

## Tool and settings (`ASSETS.md` 6.9)

`generate_image` once per prop (`{prop}` = `brass skeleton key`, `bloodied kitchen knife`, `oil lantern`), preset `3d-stylized`. For a transparent icon generate on key colour `#FF00FF` (use `#00FF00` if the subject has pink or purple, `#0000FF` if both are taken) and run `remove_background`, then defringe in Photoshop. Aspect 1:1.

## Image to 3D

`generate_3d` for the world prop: `meshy_v6_text_to_3d` with `model_type: lowpoly` (or `hunyuan3d_v3_1_text_to_3d`), or image-to-3D from the front view; `enable_pbr: false`, `enable_rigging: false`; prop budget 1-5k tris (filler 0.3-1.5k). Restyle a good mesh with `meshy_v5_retexture` and the STYLE FORMULA as `text_style_prompt` rather than regenerating it. Render at 64 px with the `prop64` outline preset (-0.035 m).

## Notes

Higgsfield 2D output is UI-only (inventory icons); world props are meshes rendered through the rig.

## After generating

1. Save the master in the ROSW checkout under `studio/assets/who-did-it/<kind>/props/`, and add a
   row to `assets/source/MANIFEST.md` (path, SHA-256, date).
2. Sync the Higgsfield library (`higgsfield-library-sync`) so the generation lands in ROSW
   `studio/library/catalog.json`; cite that catalog id and the generation id in `CREDITS.md`.
3. Commit only exports; never a source GLB or a `.blend` with Mixamo actions.
4. Paid, watermark-free plan only (`DECISIONS.md` open question 5).
