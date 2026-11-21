# The Undermere: the cave network's inputs

The walk-only scene `undermere`: 16 cave sections under the village, joined by 19 seams, with four gates (the Swallow
Gate in the West Woods, the Cutting Gate in Up the Line and the North Woods, the Adit Gate in Mill Lane and the Old
Rising Gate in the East Hills) and 30 forced moves (8 crawls, 7 sidles, 15 climbs).

- `undermere.network.json` and the 16 `<key>.json` files are the cave builder's inputs (`../../meshy_cave_core.py`).
  All 16 pass `python tools/blender/meshy_cave_core.py validate tools/blender/meshy_caves/undermere/<key>.json`.
- `design.json` is the full network design they were written from: geology, seams, routes, gates, guards, costs.

The owner accepted the design's five calls on 2026-11-20. Route 1, from the Swallow Gate to the Cutting Gate, builds
clean (closed shells, no traps, no undesigned reach, no unguarded drops, every forced move mandatory): `swallow`,
`gallery`, `well`, `north` and `ice`, built in Blender by `../../meshy_cave_build.py`. Route 2, the east, builds clean
too: `highlevel`, `domes`, `rising`, `adit` and `levels`, with the Adit Gate and the Old Rising Gate, so the Cutting Gate,
the Adit Gate and the Old Rising Gate join one another without the deep river. The other six sections still need the
same fixes (the Spar Maze's wall-walking falls among them).

Route 2 added two fill rules to `../../meshy_looks/cave_fp.json` for every section: a ring of low lights in a chamber of
200 m2 or more, and a low light beside the foot of a climb face 2.5 m high or more. The Well Dome and the North Road were
baked again under them. The Swallow, the Great Gallery and the Ice Rift keep their route 1 bakes, which predate the
rules. Rebuilt with today's builder they would gain lights: a ring in the Swallow's Clay Hall and the Gallery's Starch
chamber, and foot lights at the Swallow's lip and stair faces and the Ice Rift's steps and frost faces. Their lighting
would then no longer match the files that were shipped.
