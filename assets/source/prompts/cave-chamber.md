# (6) Cave chamber with teal moss

**Slug** `cave-chamber` · **Source** `docs/ASSETS.md` 6.4 prompt (6) · **Use** Interiors: reference for `cave_entry` (Tin Gallery mouth) and the `caverock` tileset.

## Prompt

Subject, then the style suffix of `ASSETS.md` 6.4 byte for byte (the STYLE FORMULA; `style.json` freezes it):

```text
an old tin-mine gallery mouth opening into a cave chamber, bioluminescent teal moss on the rock, a still pool in a niche, stalagmites, pitch dark beyond the moss glow, seen from 40 degrees above, stylized toon-noir, chunky low-poly 3-heads-tall proportions, flat two-tone cel shading, thick dark ink outlines, moody night lighting with warm lantern orange and cool moonlight blue, palette #12141C #2C3240 #6F7A8C #D9D2C2 #F2B33D #2EC4B6 #E04E9A, clean solid background, no text.
```

## Attach

- The hero concept (`assets/source/concepts/villager-hero-front.*` once it exists).
- The calibration cube render (`apps/client/public/assets/calibration/calibration_sheet.png`).
- On drift, restate "3-heads-tall" and "flat cel" in the subject.

## Tool and settings (`ASSETS.md` 6.9)

`generate_image`, preset `game-concept`, attach the calibration cube and the hero concept. Aspect 16:9.

## Notes

Reference only. The moss glow is the scene's ambient light (`WORLD.md` 4.3); keep teal to the moss.

## After generating

1. Save the master in the ROSW checkout under `studio/assets/who-did-it/<kind>/cave-chamber/`, and add a
   row to `assets/source/MANIFEST.md` (path, SHA-256, date).
2. Sync the Higgsfield library (`higgsfield-library-sync`) so the generation lands in ROSW
   `studio/library/catalog.json`; cite that catalog id and the generation id in `CREDITS.md`.
3. Commit only exports; never a source GLB or a `.blend` with Mixamo actions.
4. Paid, watermark-free plan only (`DECISIONS.md` open question 5).
