# (4) House exterior from 40° above

**Slug** `house-exterior` · **Source** `docs/ASSETS.md` 6.4 prompt (4) · **Use** Buildings (`ASSETS.md` 6.3): look reference for `bld_<id>_ext` and a Scene Builder block-out.

## Prompt

Subject, then the style suffix of `ASSETS.md` 6.4 byte for byte (the STYLE FORMULA; `style.json` freezes it):

```text
a two-storey stone and timber harbour house seen from 40 degrees above, steep slate roof, lit windows glowing warm, wet cobbles at the door, night fog, orthographic-feeling view, whole building in frame, stylized toon-noir, chunky low-poly 3-heads-tall proportions, flat two-tone cel shading, thick dark ink outlines, moody night lighting with warm lantern orange and cool moonlight blue, palette #12141C #2C3240 #6F7A8C #D9D2C2 #F2B33D #2EC4B6 #E04E9A, clean solid background, no text.
```

## Attach

- The hero concept (`assets/source/concepts/villager-hero-front.*` once it exists).
- The calibration cube render (`apps/client/public/assets/calibration/calibration_sheet.png`).
- On drift, restate "3-heads-tall" and "flat cel" in the subject.

## Tool and settings (`ASSETS.md` 6.9)

`generate_image`, preset `game-concept`, attach the calibration cube (scale and camera angle) and the hero concept (style). Aspect 4:3. Optionally block out with Scene Builder (`/3d-jutsu` preset instructions first) from prompts (4)-(7).

## Notes

Reference only: the shipped exterior is kit-bashed from Kenney Fantasy Town (CC0) in Blender and rendered through the rig. From a Scene Builder `.blend`, keep proportions and layout only; replace every mesh with CC0 kit pieces.

## After generating

1. Save the master in the ROSW checkout under `studio/assets/who-did-it/<kind>/house-exterior/`, and add a
   row to `assets/source/MANIFEST.md` (path, SHA-256, date).
2. Sync the Higgsfield library (`higgsfield-library-sync`) so the generation lands in ROSW
   `studio/library/catalog.json`; cite that catalog id and the generation id in `CREDITS.md`.
3. Commit only exports; never a source GLB or a `.blend` with Mixamo actions.
4. Paid, watermark-free plan only (`DECISIONS.md` open question 5).
