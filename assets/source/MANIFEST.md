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
| `assets/source/concepts/villager-hero-front.png` *(in this repo; copy to `studio/assets/who-did-it/character/villager/`)* | `70977092a20ee36780961203662025409371356bb0c0be3ebb2f1c9bd7976e33` | 2026-10-10 | to be written by the studio pipeline | – (concept) | Higgsfield `ab6c960d-28d9-4f48-b6bf-23def6ae3fb0` |
| `assets/source/concepts/villager-turnaround.png` *(in this repo; copy as above)* | `83d710c8868d624aabc9e307bb325bdcb6513b555f1293acc7b45adf95e59c1d` | 2026-10-10 | to be written by the studio pipeline | – (concept) | Higgsfield `88a9ae17-2b15-4588-b1b5-9aba9459a90d` |
| `studio/assets/who-did-it/character/villager/villager.blend` *(built here into git-ignored `assets/external/villager/`; copy to the ROSW path)* | `fd8b820ff0df691f8b888ea86ab833a462f601922a69ed6919f41e040eeb6520` | 2026-10-10 | to be written by the studio pipeline (`render-pipeline`) | `apps/client/public/assets/chars/char_villager*`, `ovl_villager*`, `villager.anims.json` | Hand-made: `python tools/blender/build_villager.py -- --out ... --glb ...` (the script is the true source; a rebuild may differ in hash, not in content) |
| `studio/assets/who-did-it/character/villager/villager.glb` *(as above)* | `f9e8ea10f78fa516784ff6a20f5602303600ec05679b0cae1747e86616b151ed` | 2026-10-10 | as above | – (V2 source GLB, `ASSETS.md` 6.9) | Exported by `build_villager.py --glb`, four actions |
| `assets/source/concepts/villager-chibi-attempt1.png` *(in this repo; copy as above)* | `65cdd173c1d85b73e1d68ae318fd6ed9e76dcbdf7012449ae3ee72ed67a7e7c1` | 2026-10-10 | to be written by the studio pipeline | – (concept) | Higgsfield `ba65ff49-a8ae-4a21-aa7b-7bffde9673aa` |
| `assets/source/concepts/villager-chibi-attempt2.png` *(in this repo; copy as above)* | `58623f618c84210d6c3eb93152066b2cb4cd68cc456d1eb28cb1cf64f253cd18` | 2026-10-10 | to be written by the studio pipeline | – (concept) | Higgsfield `6d171f1b-ff2c-452d-a49e-f49a42084038` |
| `assets/source/concepts/villager-chibi-attempt3.png` *(in this repo; copy as above)* | `260acc720f9e8c49a9c665d905556deff4817f4ebbc2877708b3d187ec03814e` | 2026-10-10 | to be written by the studio pipeline | – (concept of record) | Higgsfield `da634e29-4401-41c0-ac7b-5cf054511ef9` |
