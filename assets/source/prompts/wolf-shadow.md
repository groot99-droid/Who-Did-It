# (3) Hunched wolf-shadow

**Slug** `wolf-shadow` · **Source** `docs/ASSETS.md` 6.4 prompt (3) · **Use** Creatures (`ASSETS.md` 6.7 tier B): the wolf (idle, walk, bite, die), readable from the 40° camera.

## Prompt

Subject, then the style suffix of `ASSETS.md` 6.4 byte for byte (the STYLE FORMULA; `style.json` freezes it):

```text
a hunched wolf made of shadow, lean and low, ragged fur silhouette, glowing teal eyes, readable from 40 degrees above, side view, full body, standing on the ground line, stylized toon-noir, chunky low-poly 3-heads-tall proportions, flat two-tone cel shading, thick dark ink outlines, moody night lighting with warm lantern orange and cool moonlight blue, palette #12141C #2C3240 #6F7A8C #D9D2C2 #F2B33D #2EC4B6 #E04E9A, clean solid background, no text.
```

## Attach

- The hero concept (`assets/source/concepts/villager-hero-front.*` once it exists).
- The calibration cube render (`apps/client/public/assets/calibration/calibration_sheet.png`).
- On drift, restate "3-heads-tall" and "flat cel" in the subject.

## Tool and settings (`ASSETS.md` 6.9)

`generate_image`, preset `3d-stylized`, single subject, side view; attach the hero concept for style and the calibration cube for scale. Aspect 4:3.

## Image to 3D

`generate_3d`, model `meshy_v7_image_to_3d`, on the side or front view: `pose_mode` left default (not a humanoid), `should_texture: true`, `enable_pbr: false`, `enable_rigging: false` (auto-rig is for humanoids only), `model_type: lowpoly` or `target_polycount` 3000-5000. Rig and animate in Blender; decimate, palettize, outline.

## Notes

Teal is the eyes only (saturated accents stay under 10% of the frame).

## After generating

1. Save the master in the ROSW checkout under `studio/assets/who-did-it/<kind>/wolf-shadow/`, and add a
   row to `assets/source/MANIFEST.md` (path, SHA-256, date).
2. Sync the Higgsfield library (`higgsfield-library-sync`) so the generation lands in ROSW
   `studio/library/catalog.json`; cite that catalog id and the generation id in `CREDITS.md`.
3. Commit only exports; never a source GLB or a `.blend` with Mixamo actions.
4. Paid, watermark-free plan only (`DECISIONS.md` open question 5).
