# Who Did It: 3D asset index

For the local Blender session. Machine-readable version: `index.json`.

## Contents

| Folder | Count | What |
|---|---|---|
| `characters/higgsfield_24bone/` | 13 | Rigged characters (24 bones, one walk clip `Armature|Casual_Walk|baselayer`), filenames are character ids |
| `characters/meshy_rigged/` | 27 | Rigged characters from Meshy (36 to 85 bones, 2 clips), filenames are character ids |
| `items/` | 32 | Held and worn items, one GLB each, split from the 7 Meshy item sheets |
| `props/` | 118 | Interior props, one GLB each, split from the Meshy prop sheets |
| `props/_duplicates_of_set_14/` | 6 | Second copy of six props the Meshy run made twice (lantern hook, hay bale, plank stack, single bed, rope coil, child cot). Use the copy in `props/`, keep these as alternates |
| `props/_extras_not_in_interior_list/` | 8 | Still-life props nobody asked for (pomegranate, berry bowl, lavender, tincture bottle, loaf, cheese, grain sack, apple) |

All 40 characters have a model: 11 Higgsfield and 27 Meshy before, plus mallory and villagerlass (Higgsfield, 2026-11-17).

## Conventions

- Static models: origin at the centre of the base, base at y = 0, +Y up, one mesh, one embedded texture.
- Item and prop sizes are model units and only relative within their own sheet. Scale each to real size (a barrel is not the size of a milk pail) before use. Sizes in `index.json` are the bounding box in model units.
- Characters keep their own scale (about 1.7 m).
- Skeletons differ between the Higgsfield (24 bones) and Meshy (36 to 85 bones) characters, so animation clips are not shared without retargeting.

## Props: what each is for

Every prop in `props/` lists `scene_prop_kinds`, the `kind` or dressing id root it serves in `packages/content/data/scenes/*.json` (for example `jar_shelf`, `pew`, `oven`). Look a prop up by that field to place it in a room.

## Known gaps and flags

- `woven_rug` came out as a flat green leaf patch, not a rug. Regenerate or use a Poly Haven rug.
- Interior prop kinds with no model: bar_counter, bar_counter_taps, barrel, bottle_crate, keg_rack, tavern_table, tin_crate. These were in sheets that were not sent to Meshy (or are covered by Poly Haven). Use the existing models or Poly Haven.
- `wooden_stool`, `scales`, `fishing_net` and `coat_hook_board` have no matching scene prop kind (they are extra detail props).
- Splitting fixes made: the `Vintage_Family_Heirlooms` model had the clock, the small portrait and the curtain window fused by thin strands; they were cut apart. A speck fragment in the tavern wall decor set was dropped.
- Licence and provenance: characters and props are generated (Higgsfield and Meshy); each needs its `CREDITS.md` row before it ships. Nothing here is in the repo yet.
