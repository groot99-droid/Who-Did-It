# The Undermere: the cave network's inputs

The walk-only scene `undermere`: 16 cave sections under the village, joined by 19 seams, with four gates (the Swallow
Gate in the West Woods, the Cutting Gate in Up the Line and the North Woods, the Adit Gate in Mill Lane and the Old
Rising Gate in the East Hills) and 30 forced moves (8 crawls, 7 sidles, 15 climbs).

- `undermere.network.json` and the 16 `<key>.json` files are the cave builder's inputs (`../../meshy_cave_core.py`).
  All 16 pass `python tools/blender/meshy_cave_core.py validate tools/blender/meshy_caves/undermere/<key>.json`.
- `design.json` is the full network design they were written from: geology, seams, routes, gates, guards, costs.

The owner accepted the design's five calls on 2026-11-20. All sixteen sections build clean in the core (closed
shells, no traps, no undesigned reach, no unguarded drops, every forced move mandatory; the Jump in the Great Gallery
is the one declared drop, and its way back is in the flood), and all sixteen are built in Blender by
`../../meshy_cave_build.py`, with every one of the 19 seams open both ways:

- route 1, from the Swallow Gate to the Cutting Gate: `swallow`, `gallery`, `well`, `north` and `ice`;
- route 2, the east: `highlevel`, `domes`, `rising`, `adit` and `levels`, with the Adit Gate and the Old Rising Gate;
- route 3, the deep river and the rest: `river` (the Lake River), `reach` (the Drowned Reach), `spar` (the Spar Maze),
  `bottom` (the Bottom), `white` (the White Gallery) and `killas` (the Killas Rift).

The White Gallery's Giant's Coffin climb and its Wringer squeeze are declared alternatives (`alternatives` on both):
the walker makes one or the other. The Lake River, the Drowned Reach, the Wet Level, the Bottom's lake and the Old
Rising's pool have `water` the builder draws (no collision; lit from the bake beside it).

Route 3 also moved the Domes' three Cataract guards (`kerb_cataract_gallery`, `kerb_cataract_lip`, `rim_cataract_n`)
onto the ledge's lip: they ran 0.14 to 1.3 m out over the Great Dome, and their rail posts stood in the air 2.9 m over
its floor (see the rails in `../README.md`).

Route 2 added two fill rules to `../../meshy_looks/cave_fp.json` for every section: a ring of low lights in a chamber of
200 m2 or more, and a low light beside the foot of a climb face 2.5 m high or more. Route 3 baked the Swallow, the
Great Gallery and the Ice Rift again under them (their route 1 bakes predated the rules), so every section is now lit
by the same rules.
