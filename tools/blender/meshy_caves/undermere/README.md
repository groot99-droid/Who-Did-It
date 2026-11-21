# The Undermere: the cave network's inputs

The walk-only scene `undermere`: 16 cave sections under the village, joined by 19 seams, with four gates (the Swallow
Gate in the West Woods, the Cutting Gate in Up the Line and the North Woods, the Adit Gate in Mill Lane and the Old
Rising Gate in the East Hills) and 30 forced moves (8 crawls, 7 sidles, 15 climbs).

- `undermere.network.json` and the 16 `<key>.json` files are the cave builder's inputs (`../../meshy_cave_core.py`).
  All 16 pass `python tools/blender/meshy_cave_core.py validate tools/blender/meshy_caves/undermere/<key>.json`.
- `design.json` is the full network design they were written from: geology, seams, routes, gates, guards, costs.

The owner accepted the design's five calls on 2026-11-20. `swallow` and `gallery` build clean (closed shells, no traps,
every forced move mandatory) and are built in Blender by `../../meshy_cave_build.py`; the other sections still need
the same fixes (the Spar Maze's wall-walking falls among them).
