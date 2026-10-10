# Source masters

Every master (`.ai`, `.aep`, `.psd`, character and building `.blend`, source `.glb`) lives on the
owner's laptop in the ROSW checkout (`groot99-droid/Pipelines-Plugin`) under
`studio/assets/who-did-it/<kind>/<slug>/`, git-ignored there (`docs/ASSETS.md` 6.6, 6.10). This file
mirrors each one so an export in this repo can always be traced to its master. Kinds: `character`,
`design`, `audio`, `video`, `3d`, `ui`, `world`.

- **Path** is relative to the ROSW checkout root.
- **SHA-256** of the file as saved: `shasum -a 256 <file>` (macOS) or `sha256sum <file>`.
- **Date** the master was last saved (YYYY-MM-DD). Update hash and date on every save that feeds an export.
- **Studio note** is the ROSW `studio/vault/who-did-it/<kind>/<slug>.md` written by the studio pipeline.
- **Exports** are the paths in this repo built from the master.
- **Source** is how it was made: a tool and catalog id (Higgsfield `studio/library/catalog.json`), a CC0 kit, or hand-made.

| Path | SHA-256 | Date | Studio note | Exports | Source |
|---|---|---|---|---|---|
| `studio/assets/who-did-it/character/villager/villager.blend` *(example row, not yet made)* | – | – | `studio/vault/who-did-it/character/villager.md` | `apps/client/public/assets/chars/char_villager*` | Higgsfield image-to-3D from `villager-base-grey`, Mixamo clips |
| `assets/source/concepts/villager-hero-front.png` *(in this repo; copy to `studio/assets/who-did-it/character/villager/`)* | `70977092a20ee36780961203662025409371356bb0c0be3ebb2f1c9bd7976e33` | 2026-10-10 | to be written by the studio pipeline (`studio/vault/who-did-it/character/villager.md`) | – (concept) | Higgsfield `ab6c960d-28d9-4f48-b6bf-23def6ae3fb0`; catalog id the same, in ROSW `studio/library/catalog.json` |
| `assets/source/concepts/villager-turnaround.png` *(in this repo; copy as above)* | `83d710c8868d624aabc9e307bb325bdcb6513b555f1293acc7b45adf95e59c1d` | 2026-10-10 | to be written by the studio pipeline (`studio/vault/who-did-it/character/villager-turnaround.md`) | – (concept) | Higgsfield `88a9ae17-2b15-4588-b1b5-9aba9459a90d`; catalog id the same, in ROSW `studio/library/catalog.json` |
