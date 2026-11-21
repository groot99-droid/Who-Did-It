# Cave sections: input format and the geometry core

`tools/blender/meshy_cave_core.py` turns one cave section into geometry and checks, with Python 3 and numpy only (no
Blender, no downloads). It reads a section file like `example_section.json` and writes `<key>.core.npz`,
`<key>_plan.png` and `<key>_report.json`. The Blender stage (materials, bake, GLB export) is a separate step that
reads the npz.

## Commands

From `tools/blender`:

```sh
python meshy_cave_core.py validate meshy_caves/example_section.json
python meshy_cave_core.py build meshy_caves/example_section.json --out build/caves
python -m unittest tests.test_cave_core -v
```

- `validate` checks the file against `schema/cave.schema.json` and the design rules: profile limits, ramps, stairs,
  climbs, the lattice, spawn spacing, finite numbers, and the rock between passages (below). It exits 1 on any
  error, with a one-line message (no traceback) for a file that is missing, not JSON or not an object.
- `build` exits 0 when every check passes, 2 when the report has a failure and 1 when the input is refused.
- A region whose plan box is over 4 M lattice columns (about 250 x 250 m) is refused: the flood keeps every column.
  - `--network NET.json` reads the network from a file instead of the section's `network`.
  - `--no-flood` skips the walk flood. `--no-zone-checks` skips the per-zone bypass test, which is the slow part.

## Frame and lattice

- Coordinates are the village frame in metres: x east, y north, z up, with the caves below the ground.
- One lattice serves the whole network (`network.lattice`): an `origin`, a `cell` of 0.125 m and blocks of 32
  cells.
- Every region box face and every seam plane lies on the lattice.
- The field is a function of position alone (integer-hash noise, no trig, exp or log), and positions are rounded to
  1e-5 m. Two runs therefore give the same `geometry_md5`, and two neighbouring sections mesh their overlap with the
  same vertices.

## The network

The network is either inline in the section or in its own file, which `network` names by a path relative to the
section. It holds:

- `format`: `cave-network/1`.
- `lattice` and `seed`.
- `geology`: per rock, `tint`, `repeat_m` (metres per repeat of the detail scan, used for the UVs), `noise`
  (amplitude in metres) and `bedding` (`[bed thickness, ledge depth]`).
- `sections`: the section keys. The core loads each neighbour's file (`<key>.json` beside the network, or
  `files.<key>`) and adds the neighbour's primitives near the region, so a seam's overlap comes out identical in
  both files.

## A section

| Key             | What                                                                                                                                                                                                                                                                        |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `format`, `key` | `cave-section/1`; the key is the area's suffix (`under_<key>`)                                                                                                                                                                                                              |
| `region.boxes`  | `[x0, y0, z0, x1, y1, z1]` boxes on the lattice. The section meshes their union. Each seam adds its overlap cell and any stub on its own.                                                                                                                                   |
| `nodes`         | Named floor points `[x, y, z]`                                                                                                                                                                                                                                              |
| `passages`      | A centre line of floor points `from`, then `via`, then `to`, with a `profile`, a `width` and a `clear` height. Width and clear are a number or `[start, end]`. The `floor` is `flat`, `ramp` or `stairs` (`riser`, `tread`).                                                |
| `chambers`      | `hall`, `dome`, `breakdown`, `lake` (a basin with a rail made for it), `pocket` or `stope`. Each has a `center` at floor level, a `size` of `[length, width, height]` and an `axis` (a plan direction, no angles). `walk: false` marks a place the walker must never reach. |
| `features`      | `stalactites`, `stalagmite`, `column`, `breakdown` (blocks; over 0.5 m they collide) and `flowstone` (a swelling in the field with a banded tint)                                                                                                                           |
| `guards`        | Collision rails along plan lines, from `base_z` up `height` (at least 1 m)                                                                                                                                                                                                  |
| `bridges`       | Collision slabs over cracks                                                                                                                                                                                                                                                 |
| `drops`         | Deliberate falls, allowed where they start                                                                                                                                                                                                                                  |
| `spawns`        | Each with a `mode` (`walk`, `crawl`, `sidle`)                                                                                                                                                                                                                               |
| `portals`       | Each with `to`, `to_spawn` and `kind`. The flood requires them reachable.                                                                                                                                                                                                   |
| `seams`         | See below                                                                                                                                                                                                                                                                   |
| `openings`      | Boxes where the mesh may stay open, such as a mouth                                                                                                                                                                                                                         |
| `joins`         | Pairs of passage or chamber ids meant to meet where nothing else joins them (see below)                                                                                                                                                                                     |

### Profiles and the clear core

The field takes the larger of the rock and a clear box swept along each route. That makes the clearance a
guarantee of construction.

| Profile                                      | Use                                                 | Clear core   | Limits enforced                                                                                          |
| -------------------------------------------- | --------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------- |
| `tube`, `canyon`, `keyhole`, `rift`, `drift` | Walking                                             | 0.8 x 2.1 m  | width at least 0.8, clear at least 2.1                                                                   |
| `crawl`                                      | Crawling (the zone is made from it)                 | 0.8 x 1.0 m  | clear 1.0 to 1.3 m, width at least 0.8                                                                   |
| `fissure`                                    | Walking sideways (sidle)                            | 0.42 x 1.9 m | 0.42 to 0.55 m wide at body height, at least 1.9 m tall, turns at most 60 degrees at each via point      |
| `shaft`                                      | Vertical, seen only                                 | none         | from and to share x and y                                                                                |
| `climb_face`                                 | `from` is the foot, `to` is on the ledge at the top | none         | 1 to 15 m high, `ledge_depth` at least 1.0, `batter` up to 0.14 (above 82 degrees) unless it has a `lip` |

- A crawl or a fissure may bend at `via` points. Each straight segment gets its own zone (`<id>_0`, `<id>_1`, ...),
  and the flood checks the passage end to end through all of them. A fissure turns at most 60 degrees at one bend:
  the viewer moves a sidler only along its zone's axis, and round a gentler bend it slides along the next segment's
  wall. A sharper turn needs two bends or a pocket.
- The viewer keeps a sidler in the zone it is in until its feet leave it (the zone's 0.3 m end margins counted). So
  bends close together add up: wherever the feet can still be in one segment's zone while already in another
  segment's arm, those two segments may differ by at most 60 degrees. Two bends of 45 degrees need about 0.55 m
  between them; at 0.2 m they are a right angle and are refused.
- Two different fissures may not cross, meet in a T, or otherwise overlap: the sidler keeps its own fissure's zone and
  can never turn into the other. Make them one passage with `via` points, or let them meet in a chamber.
- Ramps warn above 20 degrees and fail above 30.
- Stairs need risers of at most 0.25 m (they fail from 0.35), treads of at least 0.28 m and a width of at least
  1.0 m.
- The collision under stairs is the ramp through the treads' mid points.
- The collision field also differs from the shell on walls: a tube gets an upright cylinder wall through the edge of
  its floor, and lower walls leave out the noise push and the bedding steps, so a walker cannot climb a curved wall or
  a bump. The hidden wall lies at most 0.25 m inside the rock you see.

### Rock between passages

Any two passages or chambers that are not joined must keep at least 0.6 m of rock between them (their 0.3 m
dilations may not overlap), or the build fails. The core measures the rock in the field, noise included, by stepping
from the closest points onto each primitive's surface. Two are joined by construction when:

- an end or via point of a passage lies in a chamber's footprint, on another passage's centre line, at a climb face's
  foot or top, or in a shaft;
- a passage's centre line runs through a chamber's air;
- two centre lines cross in plan with their floors within 1 m there (an X junction).

A pair joined by construction still needs the 0.6 m everywhere except at its mouths: within the passage's half size
plus 1.2 m of the part of its centre line inside the other's air, or of the joining end. So a tube that opens into a
hall and then runs on beside the hall's wall must keep 0.6 m of rock from it there. A climb face or a shaft joined to
the other is a mouth over its whole height and is not measured.

Two passages that both open into the same chamber (or passage) are not measured inside it, nor within 0.25 m of its
air.

Two chambers whose air overlaps are one space. A pair listed in `joins` is never measured: use it for spaces meant to
run as one.

### Traversal zones

The core makes the zones from the passages, so every crawl, fissure and climb face has its zone. Each zone becomes
a `Trav_<id>` node with these fields:

- `wdi_traverse`: `crawl`, `sidle` or `climb`.
- `centre`: the zone's centre, in the village frame.
- `size`: `[sx, sy, sz]`, metres along X, up, and across.
- Its axes, as the viewer reads them (`apps/walk/src/traverse.ts`):
  - `axis_x` runs along the passage, or along the face.
  - `axis_y` is up.
  - `axis_z` is `axis_x` x up. On a climb it points out of the face, towards the walker.

| Zone  | `sx`           | `sy`                                            | `sz`        | Placement                         |
| ----- | -------------- | ----------------------------------------------- | ----------- | --------------------------------- |
| Crawl | segment length | from 0.25 m under the floor to its clear height | width + 0.4 | one zone per segment              |
| Sidle | segment length | from 0.25 m under the floor to 1 m above it     | width + 0.3 | one zone per segment              |
| Climb | face width     | foot to top                                     | 1.2         | the face is the box's z = 0 plane |

### Seams

```json
{
  "id": "north",
  "neighbour": "example_b",
  "plane": { "axis": "y", "at": 30.0, "toward": "+" },
  "window": [22.5, -14.5, 26.5, -11.0],
  "stub_m": 0,
  "portal": [24.5, 29.55, -14.0],
  "arrival": { "at": [24.5, 27.9, -14.0], "mode": "walk" }
}
```

- `toward` says on which side of the plane the neighbour lies.
- `window` is `[u0, z0, u1, z1]`. u runs along the plane: y for an x plane, x for a y plane. It must hold the
  cross-section of every passage that crosses the plane through it (its width, from its floor to its clear height,
  plus its noise and bedding), at the plane and at the stub's end; validation refuses a window that does not. On a
  ramp, take the floor's height where the passage crosses the plane.
- The section on the plane's - side meshes one cell past the plane, and the section on its + side starts at the
  plane. Their overlap is that one cell, plus `stub_m` on each side. A stub is clipped to its window's prism plus
  0.25 m, so its end closes on the window and leaves no open edges.
- The core adds a collision wall just beyond the plane, over the window; the contract's wall rays meet it at 0.45 m.
- An arrival records its `mode`: `walk`, `crawl`, `sidle`, or `climb` for the top or the foot of a face. The core
  checks that a crawl or sidle arrival stands in a zone of its kind, that a climb arrival hangs on a face, and that a
  walking arrival stands in no crawl or sidle zone.
- A seam may cut a crawl or a fissure, or sit at the top or foot of a climb. A zone end that lies at or past the
  plane (within the window) is the seam: the zone is crossed when the walker gets from its other end to the seam's
  portal, and from the arrival back. A mantle whose landing lies past the plane reaches the portal. Leave room at
  the portal for the body that arrives there.

## What the build checks

| Check        | Rule                                                                                                                                                                                                                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Closed shell | Boundary edges appear only at declared openings: seam stub ends and `openings`                                                                                                                                                                                                             |
| Clear core   | Where the core, not the rock, set the surface (`core_clip_fraction`; the design expects under 1%)                                                                                                                                                                                          |
| Clearance    | Per passage away from its junctions: narrowest width at body height, lowest and highest roof                                                                                                                                                                                               |
| Collision    | The same field at 0.25 m. It keeps what lies within 3 m above reached floors and 1 m beyond them, decimated on planes (5 degrees) and joined by proxies: rails, bridges, seam walls, stalagmites, columns and blocks. Reports the triangle counts against 60k (target) and 150k (ceiling). |
| Chunks       | About 12 m, each overlapping the next by one cell                                                                                                                                                                                                                                          |
| UVs and tint | Cube projection per face, plus per-vertex tint, wet and flowstone band                                                                                                                                                                                                                     |

### The flood

The flood uses the walk viewer's bodies, as `apps/walk/src/physics/controller.ts` sizes them:

| Mode                              | Body                                                                                                 | Where                                                                                                                                                                                                                           |
| --------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Walk                              | radius 0.3, solid 0.35 to 1.75 m, step 0.35, the five ground rays, settle and fall                   | everywhere else                                                                                                                                                                                                                 |
| Crawl                             | radius 0.275 (the viewer's `CRAWL`; the brief said 0.3, and the viewer's value wins), solid to 0.9 m | in crawl zones; it keeps crawling while there is no room to stand                                                                                                                                                               |
| Sidle                             | radius 0.18                                                                                          | in sidle zones, along the zone's axis (where a bent fissure's zones overlap, along either; validation keeps those within 60 degrees of each other)                                                                              |
| Thin crawl (`thin` in the report) | radius 0.18, solid to 0.9 m (the viewer's narrow crawl)                                              | where the feet are in a crawl zone and a sidle zone at once (a crawl that opens straight into a fissure, or crosses one); out of the crawl zone it stands up into the sidle when the sidling body has room, else crawls on thin |
| Climb                             | foot to the mantle's landing, and the fall off the ledge the face catches                            | climb faces                                                                                                                                                                                                                     |

A body fits where its solid band is clear at its true radius. The flood reads the wall between the lattice columns
from the collision field's node values, bilinear at 24 points on the rim, at every node height of the band. A state
stands for the body anywhere in its column's cell, as the viewer's capsule is not held to the lattice: it fits if
some position in the cell (a 7 x 7 grid) keeps every rim point in the air. Testing only the column centres within
the radius would make the 0.6 m walker 0.5 m wide on the 0.125 m lattice, and it would walk through a 0.52 to
0.55 m fissure that the viewer's capsule cannot enter; holding the body to the column centre would stop a sidler in
a 0.46 m fissure that runs off the lattice's axes.

The flood reports:

- every spawn, portal and seam reachable from the first spawn;
- traps, where some reached state can reach no spawn, portal or arrival (a wedged body counts as one);
- cracks: the lattice rounds the viewer's probe rays (0.21 m out for walking, 0.19 m crawling) to whole cells, so
  where the lattice's rays still stand on both rims of a narrow gap, the core casts the viewer's five rays at their
  exact offsets in the field (and on the proxies). Where all five miss, the walker falls; a body that fits nowhere
  below wedges (`crack_falls` counts the places). The viewer's rays lie along the world's x and y axes, so the widest
  crack that is walked over depends on its angle to them: about 0.42 m along an axis, but only about 0.30 m at 45
  degrees. Bridge or fence any crack that a walker should not fall into;
- a body that lands where it does not fit is pushed out, as the viewer's capsule is, into a column within two cells
  where it fits, on that floor or one within a step below it; only with none does it wedge;
- undesigned reach: a reached place outside every walkable passage and chamber;
- unguarded drops: a fall over 0.35 m that is not declared, not caught by a climb, and not walked straight back from;
- per passage, whether it can be crossed from one end to the other with its zones, and bypassed without them. A
  passage that cannot be bypassed is mandatory. The result is reported on each of its zones, with `passage` and
  `segments` naming the chain;
- per segment of a crawl or fissure, bent or straight, whether a walking route gets round part of it: without the
  passage's zones, the walker goes from each end as deep into the passage as it can stand inside its zones, round
  some other way (`walked_in`, metres along the centre line from each end). The floor a walker reaches from the end
  without leaving the zones does not count, so a chamber whose floor runs a metre or two into the mouth is not a walk
  round. Past 1 m in, every segment whose far end that passes is listed in `segments_walked_round`; when it passes
  none (a side passage joining part way along a straight crawl, or inside the end segment of a bent one), the end
  segment is listed. A listed zone is bypassable. `bypassed_end_to_end` says whether the whole passage is bypassed;
- an end of a passage with no walking state near it (a crawl that opens straight into a fissure: the body there
  sidles or crawls thin) is started, for the end to end check, from the states the flood reached there;
- a trap's problem line gives the first trapped place and its mode. A crawl that ends in a small domed pocket can
  trap: the crawler stands up in the pocket, and the walking body then meets the dome's roof before its feet are back
  in the crawl zone (the zone reaches only 0.3 m past the passage's end). End a crawl in a room whose roof stays
  above 1.75 m to the mouth, or run the crawl on into the pocket;
- cracks are flagged only where a body can fall into them: a crack wider than 0.42 m that the walking body cannot
  enter (it is pushed out to a rim) is not reported.

The report's `problems` lists, one line each, why a build is not ok (an open shell, a clearance miss, the collision
ceiling, an unreached spawn or portal, traps, undesigned reach, unguarded drops, a zone that cannot be crossed or can
be bypassed); the CLI prints them.

## Outputs

`<key>.core.npz` holds:

- The shell: vertices (in 1e-5 m and in metres), faces, each face's lattice cell, face-corner UVs and their axis,
  each face's geology, and per-vertex tint, wet, band and geology.
- Chunks: their keys, offsets and face lists.
- Collision: the decimated shell and the proxies.
- Formations: vertices, faces, kinds and UVs.
- The zones and the report, as JSON.

`<key>_plan.png` is a top view of the section:

| Colour      | What it shows        |
| ----------- | -------------------- |
| Grey        | Rock floors          |
| Green       | Walk                 |
| Orange      | Crawl                |
| Cyan        | Sidle                |
| Yellow      | Undesigned reach     |
| Red         | Traps                |
| White boxes | Zones                |
| Blue        | Passage centre lines |
| Magenta     | Rails                |
| Yellow line | Seams                |
| White dots  | Spawns               |
| Violet      | Portals              |

`<key>_report.json` holds all of the above with `geometry_md5`, `shell_md5`, timings and `ok`.
