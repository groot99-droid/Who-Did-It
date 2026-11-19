# tools/blender/models

The character, prop and item GLBs live in this repository's releases `char-models` and `prop-models`, which the
owner uploads by hand (round 11, H1; `docs/ASSETS.md` 6.12). This folder pins them.

## `models.lock.json`

- `schema` 1. `repo` names the repository whose releases hold the zips.
- `sources` gives `{licence, basis}` per source. `basis` names the DECISIONS row: A17 for Higgsfield, A616 Q1 for
  Meshy (CC0-1.0, the owner's answer of 2026-11-19).
- `releases` gives each zip's `{asset, sha256, size}`, keyed by tag.
- `models` has one row per GLB, with `id`, `kind`, `path`, `source`, `release`, `sha256` and `size`.
  - `id` is unique: the character id, or the file name of a prop or item. A second copy is `<id>_alt` with
    `alternateOf`.
  - `kind` is `character` (in `char-models`), `prop` or `item` (in `prop-models`).
  - `path` is the GLB's place in the zip: relative, with no `..`.

`tests/test_models.py` checks the schema, the counts and the fetcher. A changed model follows ASSETS 6.12.

## `fetch_models.py`

`python3 tools/blender/models/fetch_models.py [--release char-models]` downloads to the git-ignored
`tools/blender/build/models/<tag>/` and extracts the locked GLBs to `<tag>/glb/<path>`. It refuses:

- an HTML page or a file that is not a zip
- a size or sha256 other than the lock's
- a missing GLB, or a GLB with another sha256

It leaves nothing partial, and files that already match are kept. Scripts call `fetch_release(tag, load_lock())`,
which returns `{id: path}`.
