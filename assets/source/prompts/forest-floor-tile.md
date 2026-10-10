# (7) Tiling forest floor with fog

**Slug** `forest-floor-tile` · **Source** `docs/ASSETS.md` 6.4 prompt (7) · **Use** Ground tiles (`ASSETS.md` 6.3): reference for `tiles_forestfloor`.

## Prompt

Subject, then the style suffix of `ASSETS.md` 6.4 byte for byte (the STYLE FORMULA; `style.json` freezes it):

```text
seamless tiling forest floor texture seen straight down, damp leaf litter, roots, moss patches, thin ground fog, even lighting with no cast shadows, square tile, stylized toon-noir, chunky low-poly 3-heads-tall proportions, flat two-tone cel shading, thick dark ink outlines, moody night lighting with warm lantern orange and cool moonlight blue, palette #12141C #2C3240 #6F7A8C #D9D2C2 #F2B33D #2EC4B6 #E04E9A, clean solid background, no text.
```

## Attach

- The hero concept (`assets/source/concepts/villager-hero-front.*` once it exists).
- The calibration cube render (`apps/client/public/assets/calibration/calibration_sheet.png`).
- On drift, restate "3-heads-tall" and "flat cel" in the subject.

## Tool and settings (`ASSETS.md` 6.9)

`generate_image`, preset `game-concept`, composition straight down, aspect 1:1, attach the calibration sheet's tile cell.

## Notes

Reference only: shipped tiles are rendered straight down by `TileCam` at 64 px and seam-passed. Never commit a generated texture as a tile.

## After generating

1. Save the master in the ROSW checkout under `studio/assets/who-did-it/<kind>/forest-floor-tile/`, and add a
   row to `assets/source/MANIFEST.md` (path, SHA-256, date).
2. Sync the Higgsfield library (`higgsfield-library-sync`) so the generation lands in ROSW
   `studio/library/catalog.json`; cite that catalog id and the generation id in `CREDITS.md`.
3. Commit only exports; never a source GLB or a `.blend` with Mixamo actions.
4. Paid, watermark-free plan only (`DECISIONS.md` open question 5).
