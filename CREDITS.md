# Credits

Every third-party or generated asset that ships in this repository has a row here before it lands
(`docs/ASSETS.md` 6.5). Code is MIT (`LICENSE`). **AI-generated images in this repo are dedicated to the public domain
under CC0 1.0** (`LICENSES/CC0-1.0.txt`, `docs/DECISIONS.md` A17). Hand-made original art
(renders, vectors, audio) is CC BY 4.0 (`LICENSE-ASSETS`, `LICENSES/CC-BY-4.0.txt`, `docs/DECISIONS.md` A19).

## Policy

- **CC0 by default**: Kenney, KayKit, Poly Haven, Freesound (CC0 filter), OpenGameArt (CC0 only).
  An itch.io pack counts as CC0 only when its sidebar tag, description and bundled LICENSE agree.
- **CC-BY** only with a row in the third-party table below (title, author, URL, licence, files).
- **Banned**: CC-BY-NC, CC-BY-ND, Synty in any form, Quaternius source packs (rendered sprites made
  from them are allowed with a credit; the pack itself is never redistributed), Pixabay audio, raw
  Mixamo files. A `.blend` holding Mixamo actions stays in `assets/external/` (git-ignored); rendered
  sheets are credited "animations: Mixamo, used under Adobe terms, not redistributed".
- **Adobe**: only non-beta generative features using Adobe's own model; each use logged below (file,
  feature, date). No Substance 3D Assets or Adobe Stock files are committed, free or not. Adobe Fonts
  are never embedded.
- **AI generations** (Higgsfield and others): paid, watermark-free plan only; tool, model, feature,
  date and the generation id plus the ROSW `studio/library/catalog.json` id per asset. The vendor's
  terms are recorded as a dated link in `LICENSES/vendors/README.md` (a saved copy is welcome, not
  required). Generated images are released under CC0 1.0; the vendor claims no ownership of outputs.
- **Fonts**: Oswald and Inter (OFL) only; licence texts in `LICENSES/fonts/`.

## Third-party assets

| Files                                                                                         | Title | Author           | URL                           | Licence | Notes                                                          |
| --------------------------------------------------------------------------------------------- | ----- | ---------------- | ----------------------------- | ------- | -------------------------------------------------------------- |
| `tools/sprites` placeholder labels (rendered into `apps/client/public/assets/placeholder/**`) | Inter | Rasmus Andersson | https://github.com/rsms/inter | OFL-1.1 | via `@fontsource/inter`; text in `LICENSES/fonts/` (Session B) |

## Generated assets

| Files                                                      | Tool                         | Model / feature                                                     | Date       | Generation id                          | Catalog id                        | Notes                                                                                                            |
| ---------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------- | ---------- | -------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `assets/source/concepts/villager-hero-front.png` (CC0 1.0) | Higgsfield (Plus plan, paid) | `generate_image`, `gpt_image_2_5`, 3:4                              | 2026-10-10 | `ab6c960d-28d9-4f48-b6bf-23def6ae3fb0` | pending `higgsfield-library-sync` | Prompt (1) subject as a single front view, style suffix verbatim. Drifted to about 7 heads tall and soft shading |
| `assets/source/concepts/villager-turnaround.png` (CC0 1.0) | Higgsfield (Plus plan, paid) | `generate_image`, `gpt_image_2_5`, 16:9, hero as `image_references` | 2026-10-10 | `88a9ae17-2b15-4588-b1b5-9aba9459a90d` | pending `higgsfield-library-sync` | Prompt (1) turnaround with "3-heads-tall" and "flat cel" restated; consistent four views, about 4.5 heads tall   |

## Adobe generative use

| Files | Feature | Date | Notes |
| ----- | ------- | ---- | ----- |
