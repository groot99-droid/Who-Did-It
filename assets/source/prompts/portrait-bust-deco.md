# (10) Portrait bust in an Art-Deco frame

**Slug** `portrait-bust-deco` · **Source** `docs/ASSETS.md` 6.4 prompt (10) · **Use** Role cards and meeting portraits (`ASSETS.md` 6.3): 384x576 WebP, lazy-loaded by `roleId` after `roleReveal`.

## Prompt

Subject, then the style suffix of `ASSETS.md` 6.4 byte for byte (the STYLE FORMULA; `style.json` freezes it):

```text
a head-and-shoulders portrait bust of a Hollowmere villager inside an Art-Deco card frame with stepped corners, facing three-quarter left, the frame drawn in ink lines on bone, stylized toon-noir, chunky low-poly 3-heads-tall proportions, flat two-tone cel shading, thick dark ink outlines, moody night lighting with warm lantern orange and cool moonlight blue, palette #12141C #2C3240 #6F7A8C #D9D2C2 #F2B33D #2EC4B6 #E04E9A, clean solid background, no text.
```

## Attach

- The hero concept (`assets/source/concepts/villager-hero-front.*` once it exists).
- The calibration cube render (`apps/client/public/assets/calibration/calibration_sheet.png`).
- On drift, restate "3-heads-tall" and "flat cel" in the subject.

## Tool and settings (`ASSETS.md` 6.9)

`generate_image` in character-consistency mode with the hero concept attached; preset `3d-stylized`; aspect 2:3. Upscale 512 -> 1024 with `upscale_image`, then downsample to 384x576 WebP.

## Notes

One portrait per role in tier B (`ASSETS.md` 6.7). A role portrait appears only on its holder's own role card; nothing another client receives may show it (role secrecy, `CLAUDE.md`).

## After generating

1. Save the master in the ROSW checkout under `studio/assets/who-did-it/<kind>/portrait-bust-deco/`, and add a
   row to `assets/source/MANIFEST.md` (path, SHA-256, date).
2. Sync the Higgsfield library (`higgsfield-library-sync`) so the generation lands in ROSW
   `studio/library/catalog.json`; cite that catalog id and the generation id in `CREDITS.md`.
3. Commit only exports; never a source GLB or a `.blend` with Mixamo actions.
4. Paid, watermark-free plan only (`DECISIONS.md` open question 5).
