# (5) Dim parlour from 40° above

**Slug** `parlour-interior` · **Source** `docs/ASSETS.md` 6.4 prompt (5) · **Use** Interiors (`ASSETS.md` 6.3): mood and layout reference for the widow's parlour tileset.

## Prompt

Subject, then the style suffix of `ASSETS.md` 6.4 byte for byte (the STYLE FORMULA; `style.json` freezes it):

```text
a dim Victorian parlour seen from 40 degrees above with the walls cut low like a dollhouse, a portrait turned to face the wall, a single candle, threadbare rug, armchair, letter box by the door, stylized toon-noir, chunky low-poly 3-heads-tall proportions, flat two-tone cel shading, thick dark ink outlines, moody night lighting with warm lantern orange and cool moonlight blue, palette #12141C #2C3240 #6F7A8C #D9D2C2 #F2B33D #2EC4B6 #E04E9A, clean solid background, no text.
```

## Attach

- The hero concept (`assets/source/concepts/villager-hero-front.*` once it exists).
- The calibration cube render (`apps/client/public/assets/calibration/calibration_sheet.png`).
- On drift, restate "3-heads-tall" and "flat cel" in the subject.

## Tool and settings (`ASSETS.md` 6.9)

`generate_image`, preset `game-concept`, attach the calibration cube and the hero concept. Aspect 16:9.

## Notes

Reference only; interiors ship as 64 px Tiled tilesets, not single floor sprites.

## After generating

1. Save the master in the ROSW checkout under `studio/assets/who-did-it/<kind>/parlour-interior/`, and add a
   row to `assets/source/MANIFEST.md` (path, SHA-256, date).
2. Sync the Higgsfield library (`higgsfield-library-sync`) so the generation lands in ROSW
   `studio/library/catalog.json`; cite that catalog id and the generation id in `CREDITS.md`.
3. Commit only exports; never a source GLB or a `.blend` with Mixamo actions.
4. Paid, watermark-free plan only (`DECISIONS.md` open question 5).
