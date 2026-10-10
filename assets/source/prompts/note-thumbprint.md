# (9) Hand-written note with a smeared thumbprint

**Slug** `note-thumbprint` · **Source** `docs/ASSETS.md` 6.4 prompt (9) · **Use** UI (`ASSETS.md` 6.3): notebook page and the clue card for `clue_print`.

## Prompt

Subject, then the style suffix of `ASSETS.md` 6.4 byte for byte (the STYLE FORMULA; `style.json` freezes it):

```text
a torn hand-written note on old paper, illegible ink scrawl, a smeared dark-red thumbprint in one corner, flat top-down view, paper fills the frame, stylized toon-noir, chunky low-poly 3-heads-tall proportions, flat two-tone cel shading, thick dark ink outlines, moody night lighting with warm lantern orange and cool moonlight blue, palette #12141C #2C3240 #6F7A8C #D9D2C2 #F2B33D #2EC4B6 #E04E9A, clean solid background, no text.
```

## Attach

- The hero concept (`assets/source/concepts/villager-hero-front.*` once it exists).
- The calibration cube render (`apps/client/public/assets/calibration/calibration_sheet.png`).
- On drift, restate "3-heads-tall" and "flat cel" in the subject.

## Tool and settings (`ASSETS.md` 6.9)

`generate_image`, preset `game-concept`, aspect 4:3; generate on key colour `#00FF00` (the subject has red) and run `remove_background`.

## Notes

"no text" in the suffix keeps the scrawl illegible: notes never carry readable words from a model.

## After generating

1. Save the master in the ROSW checkout under `studio/assets/who-did-it/<kind>/note-thumbprint/`, and add a
   row to `assets/source/MANIFEST.md` (path, SHA-256, date).
2. Sync the Higgsfield library (`higgsfield-library-sync`) so the generation lands in ROSW
   `studio/library/catalog.json`; cite that catalog id and the generation id in `CREDITS.md`.
3. Commit only exports; never a source GLB or a `.blend` with Mixamo actions.
4. Paid, watermark-free plan only (`DECISIONS.md` open question 5).
