# walk_areas: the tools that prove a set of area files obeys the contract

The contract is `docs/walk-areas.md` (version 1.1, 2026-11-19; version 1 was of 2026-11-16): one GLB per area, one
`walk-index.json` beside them, and since version 1.1 a cave network beside the village. The index still says
`"format": 1`. These tools need no Blender and no install. Python 3 (standard library only) runs `walk_index.py` and
`mutants.py`. Node 22.13 or newer runs `check_areas.mjs` and the fixture generator.

| File | What it is |
|---|---|
| `walk_index.py` | Builds `walk-index.json` from a folder of area files, or checks an index that is already there. Checks every rule that can be read from the files without decoding Draco data. |
| `check_areas.mjs` | The cross-check with the walk viewer's own code: it runs the viewer's `spawn.ts` and `portals.ts` on the same files and index. |
| `three_standin.mjs` | A stand-in for the two three.js classes those viewer files import, so nothing has to be installed. Not three.js. |
| `walk_scenes.json` | The walk-only scenes: scenes of the walk that the game does not have (version 1.1). One today, `undermere`, The Undermere, the caves: `{"name", "kind": "cave", "area_prefix": "under_", "portal_ns": "um"}`. Both checkers read it from beside themselves, or from the file given with `--walk-scenes`. |
| `schema/walk-index.schema.json` | The shape of the index, as a JSON Schema (draft 2020-12). `walk_index.py` checks every index against it. |
| `fixture/make-areas-fixture.mjs` | Writes the small test world: two village sections joined by one seam, one room, two caves joined by a cave seam, and one cave mouth from a section into a cave. With `MUTATE=<name>` it writes one variant of it. |
| `fixture/areas/` | That world, committed: five `.gltf` files and `walk-index.json`, 73,898 bytes in all (measured on 2026-11-19; 54,700 before the caves). |
| `mutants.py` | Runs every variant of the fixture through both checkers: 46 broken ones that must fail on the intended rule, 3 allowed ones that must draw a note, 8 unusual valid ones that must pass; and 37 odd inputs that must end in FAIL lines and no stack trace. |

## How to run

All commands are run from the repository root.

```
python tools/blender/walk_areas/walk_index.py <folder>
```
Builds `<folder>/walk-index.json` from the `walk-*.glb` (or `walk-*.gltf`) files in the folder. If any rule fails, it
prints the failures, writes nothing and ends with exit code 1. Options:

- `--scene-ids packages/content/data/scenes` gives it the game's scene ids, so that a portal into a scene that is not
  built yet is listed under `pending` and a misspelt scene id is a failure. A walk-only scene of `walk_scenes.json` is
  no misspelling: a portal into `undermere` before any cave is built is listed under `pending` too. Given the folder
  of scene files, it also reads the game's portal ids, to hold the walk-only namespaces against them. Without it, name
  the unbuilt scenes yourself: `--pending forest,cellar`. The fixture's scenes (`shop`, `mine`) are made up, so the
  fixture is built with `--world hollowmere-fixture --pending mine` and checked without `--scene-ids`. Built that way,
  the index is byte for byte the committed one (measured on 2026-11-19: 13,393 bytes).
- `--walk-scenes <file>` reads the walk-only scenes from that file instead of `walk_scenes.json` beside the script.
- `--start <spawn id>` sets the spawn the viewer starts at. The default is `square` when a file has it.
- `--out <path>` writes the index somewhere else. `--json <path>` also writes every result as JSON.
- `--strict-targets` turns a file over a planning target into a failure. By default that is a note.

```
python tools/blender/walk_areas/walk_index.py <folder> --check
```
Writes nothing. It rebuilds the index in memory, compares it field by field with the `walk-index.json` in the folder,
and runs every rule. Use it on an index somebody else wrote.

```
python tools/blender/walk_areas/walk_index.py --legacy --out <index.json> --scene-ids packages/content/data/scenes \
    tools/blender/build/hollowmere_walk.glb tools/blender/build/rooms/widow_bedroom.glb
```
Today's two files as they are. Each difference from the contract is printed as a `WARN` instead of a `FAIL`, and the
index is written. Section 4 of the contract lists the differences that are accepted this way. The two files are not
in the repository: `tools/blender/build/` is ignored by git (`tools/blender/.gitignore`). The village file is the
asset of the release `walk-glb`; the bedroom file exists only where the room build has been run. Cave files can be
given beside them (the interim world of the contract's section 11), and the legacy village may hold cave mouths.

```
node tools/blender/walk_areas/check_areas.mjs <folder> --src <path to apps/walk/src>
```
`--src` is a checkout of the viewer's source folder. The viewer lives on branch `claude/v2-walk`; until that branch is
merged, make a second working folder for it: `git worktree add ../walk-viewer origin/claude/v2-walk`, then
`--src ../walk-viewer/apps/walk/src`. Without the viewer's source the script stops and says what it needs. It installs
nothing and changes nothing there. Add `--three <path to node_modules/three>` to parse the files with the real
three.js GLTFLoader as well (only files that are not Draco-compressed, so in practice the fixture). `--walk-scenes
<file>` is as for `walk_index.py`.

```
node tools/blender/walk_areas/fixture/make-areas-fixture.mjs
python tools/blender/walk_areas/mutants.py --src <path to apps/walk/src>
```
The first rewrites `fixture/areas/` (measured: the same bytes each time). The second runs the 57 variants and the
37 odd inputs; `--python-only` runs them through `walk_index.py` alone; `--keep <folder>` keeps the variants and each checker's
output (the odd inputs under `odd/`); `--only name,name` runs only those; `--three <path>` is passed on to
`check_areas.mjs`. A variant that writes its own `walk_scenes.json` beside its files (`walk_scene_is_game_scene`, and
the odd inputs about that file) has it handed to both checkers with `--walk-scenes`. A checker that is still running
after 300 seconds on a variant is counted as failed.

**The fixture and the repository's formatter.** CI runs `prettier --check .`, and Prettier reads `.json` and `.gltf`
files as JSON. The index records the size and the hash of every area file, so a re-format of a `.gltf` would make the
index wrong. The generator and `walk_index.py` therefore write JSON in exactly the layout Prettier gives it, and
`pnpm format` leaves the fixture untouched. If you edit a fixture file by hand, run the generator again rather than
the formatter.

**When something is unreadable.** A file that is not glTF where the tools read it, or an index that is not JSON, is
one `FAIL` line (`<file>.readable`, `index.readable`) and exit code 1; the other files are still checked. If a tool
itself stops on input nobody foresaw, it prints `FAIL checker.internal` and exits 1; set `WALK_INDEX_TRACE=1` or
`CHECK_AREAS_TRACE=1` to see the trace. Neither tool ever passes what it could not read.

## What each tool proves, and what it cannot see

**`walk_index.py`** proves, from the files alone: file names; no required glTF extension that is not on the
contract's allow-list (which is not the list of what the viewer's loader reads); one scene, one Area and one collision
node per file, at the scene root; the Area's extras, with every missing one named; no fog or exposure on the glTF scene
and no directional light in a village section; names written with the allowed characters, used once, and no reserved
prefix on a scene, camera, light definition or mesh; spawn ids used once in the whole world; every portal leading, by
the exact id `<to>_<toSpawn>`, to a spawn in a file of the right scene, or into a scene listed as pending (a game scene
or a walk-only one); in a village section and in a cave, every spawn more than 1 m from every portal; a room and a wild
area around their own origin; the walk-only scenes of `walk_scenes.json` well formed and none of them a game scene id;
a cave indoors, baked and with fog, every cave with one look; every crossing between the village and the caves a cave
mouth of the right form; every seam rule that is about where nodes stand (rows, spacing, arrivals and their distance
from every portal, nothing else within 2 m of a row, facing, the height of the ground on both sides, the look on both
sides, `wdi_baked` included), at village seams and cave seams alike; on collision that is not compressed, that spawns
and portals stand on the ground, that each seam has its wall (3 m high in the village, from the floor to the roof in a
cave) and that the whole edge of a village section's walk region is closed; the index fitting the schema; and, with
`--check`, the index saying what the files say. It prints each file's size, triangle counts, draw calls, texture
memory and lights against the planning targets of its kind.

It cannot see: anything inside Draco-compressed geometry. On real files it therefore does not check that spawns and
portals stand on the ground, that a seam's wall is closed (3 m high, or up to a cave's roof), or that the rest of a
village section's edge is closed. It checks all three on the fixture, whose collision is not compressed. It does not
check that a cave is closed at all: the closed-edge rule would take a cave's roof for its ground, so that is the cave
builder's check in Blender. It does not measure triangles in view. A collision shell that stands on the 0.5 m strip
inside an edge is taken for the ground there (`docs/walk-areas.md`, section 4).
It knows the picker's words and three.js's naming only as copies of the viewer's rules; `check_areas.mjs` is what
tests those copies.

**`check_areas.mjs`** proves that the viewer's own functions agree with the index: `findSpawns` finds the same ids,
places, facings and picker words; `findPortals` the same portals; `pickSpawn`, given a spawn id and the spawns of the
file that holds it, finds every spawn of the index, the start among them; `resolvePortal` finds every target by its
exact id and never needs its bare-id fallback. It runs `PortalTrigger` three ways, always holding every portal of
the file as the viewer does: walked across each seam opening every 5 cm, a point of the row must fire first
everywhere; from every seam arrival straight back to the wall, the return row must fire; and a spawn of a village
section or a cave must not stand inside any portal's radius. On the fixture it also walks a scripted journey of 32
steps: through the seam and back, into the room and out, to a door whose scene is not built, in through the cave
mouth, across the cave seam and back and out again, a link straight into the room, and a start that is not `square`.
It repeats the structural, cave and seam rules of `walk_index.py` (since version 1.1 also `area_id` and
`seams_only_between_sections`), so that two programs written separately have to agree. It has no list of the game's
scene ids: it holds a walk-only scene against `overworld` and the scenes of the index's rooms and wild areas only.

Five lines it prints are marked `CTRL` (`seam.<id>.one_point_only`, once for each seam, `journey.bare_id_fallback`,
`viewer.nearest_area_rule` and `viewer.start_without_the_id`, in the order below). Each is a wrong way of doing
things, shown to go wrong: one portal point in a
5 m opening leaves a walker standing at 50 of 89 places (and one of the two points of the 2.4 m cave seam at 11 of
37); the viewer's bare-id fallback sends the shop's way out to the
shop's own spawn; two areas in one scene make the viewer's nearest-origin rule show the wrong one; and
`pickSpawn(world.spawns, null)`, which is what `main.ts` does today when the address names no spawn, starts the
player at `square` whatever the index's `start` says.

It cannot see: the viewer's rendering, loading, memory or timing. It runs two source files of the viewer, not the
viewer. The viewer's TypeScript is run after Node removes the types; one form Node cannot remove
(`constructor(private readonly x ...)`, three parameters in `portals.ts`) is written out as plain assignments first,
and the script prints how many it rewrote. Without `--three` the node names come from the stand-in's copy of
GLTFLoader's naming rule, and the stand-in makes no light, camera or mesh objects; that is why names with a reserved
prefix on those are a rule of their own (`reserved_names`). A node written with a `matrix` is decomposed the way
three.js does it (the variant `spawn_matrix`, which `--three` checks against the real loader).

**Neither tool can see** how wide an opening really is. A seam's `wdi_width_m` is taken as declared: the checkers
read collision and empties, not what is drawn, and the collision wall is closed along the whole opening anyway. One
portal point in a 5 m opening passes every rule once both files say the opening is 2 m wide. The exporter has to
measure the gap it writes. Neither tool samples an opening declared wider than 100 m: that is a limit of the tools,
not a rule of the contract, and `seam.<id>.extras` fails it with a line that says so (a typo such as 5000 for 5 would
otherwise keep them busy for minutes).

**`mutants.py`** proves that the checkers can fail: a checker that passes everything proves nothing. It also proves
that three notes are printed when they should be, that unusual valid worlds are not failed (sloping ground, a node
written with a matrix, a cut corner, the outline in each form it may take, a door into a pending scene with the bare id
of a spawn that exists, caves over one another, a cave seam on a ramp), and that input which is no area file at all
ends in FAIL lines and not in a stack trace.

## The rules by name

Both tools print the same rule names. "py" is `walk_index.py`, "js" is `check_areas.mjs`.

| Rule | What it says | Tool |
|---|---|---|
| `<file>.readable`, `index.readable` | the file is glTF where the tools read it; the index is JSON shaped like an index | py, js |
| `<area>.file_name` | the file is `walk-<areaId>.glb` | py, js |
| `<area>.bytes`, `<area>.sha256` | the index gives the file's size and hash | py (`--check`), js |
| `<area>.extensions` | every required glTF extension is on the contract's allow-list (ten names; it is not the list of what the viewer's loader reads, which is longer). Using another one is the note `extensions_used` | py, js |
| `<area>.one_area` | exactly one `Area_*` node, at the scene root | py, js |
| `<area>.one_collision` | exactly one collision node, `HM_Collision_<areaId>`, at the scene root | py, js |
| `<area>.scene_roots` | one glTF scene, and nothing else at its root | py, js |
| `<area>.scene_extras` | the glTF scene carries no fog and no exposure: the look is on the Area node | py, js |
| `<area>.collision_form` | the collision node has a mesh, no transform, no material, no children, `wdi_collision: true` | py, js |
| `<area>.area_at_origin` | the Area node carries no transform | py, js |
| `<area>.origin_in_walk_region` | a room or a wild area: the file's origin (0, 0) lies inside its walk region (a note names the old far-grid slot when the region lies around one). A cave is built in the village frame and is not held to it | py, js |
| `<area>.area_id` | the id fits its kind and its scene: `village_<key>`, `room_<sceneId>`, a wild area's scene id, a cave's `<area prefix><key>` with a walk-only scene; a room or a wild area never in a walk-only scene (py with `--scene-ids` also: no section, room or cave id is a game scene id) | py, js (js since 1.1) |
| `<area>.area_extras` | the Area's extras; every missing or wrong one is named, `wdi_walk_polygon` included (a flat list, a list of pairs, or either as a JSON string); a cave needs `wdi_indoor: true`, `wdi_baked: true` and fog | py, js |
| `<area>.look_matches_index` | the index's `look` is the Area's own exposure and fog | py (`--check`), js |
| `<area>.names_unique_in_file` | no Area, collision, spawn or portal node would be renamed by the loader: no name used twice, none taken first by the scene, a camera or a light definition | py, js |
| `<area>.reserved_names` | no scene, camera or light definition has a name that begins `Area_`, `HM_Collision`, `Spawn_` or `Portal_`; a mesh has one only when it has one primitive and its nodes have names and no camera or light | py, js |
| `<area>.raw_names` | the Area, collision, spawn and portal names as written in the file: lower-case letters, digits and `_` after the prefix, dots allowed inside a portal's id | py, js |
| `<area>.no_directional_light` | a village section or a cave holds no directional light | py, js |
| `<area>.nodes_under_area` | spawns and portals are under the Area | py |
| `<area>.spawn_extras`, `<area>.portal_extras` | ids and extras of spawns and portals | py |
| `<area>.inside_walk_region`, `<area>.spawn_inside_collision` | where they stand, in plan | py |
| `<area>.spawn_clear_of_portals` | a village section or a cave: every spawn more than 1 m from every portal of the file (js: by the viewer's own `PortalTrigger`). In a room or a wild area a spawn inside a radius is the note `spawn_inside_portal_radius` | py, js |
| `<area>.stand_on_ground` | spawns and portals stand on the collision floor, found by a ray from 1 m above (uncompressed collision only; caves too) | py, js |
| `<area>.edge_closed` | a village section: the whole edge of its walk region is closed by collision 3 m above the ground, the wall's face within 0.3 m of the edge (uncompressed collision only). Not for caves: the cave builder checks that a cave is closed | py, js |
| `<area>.portal_target` | every portal leads somewhere by the exact id, or into a pending scene, game or walk-only (a pending scene is no fault even when another scene has a spawn with the bare id; a built scene or a scene in no file is) | py, js |
| `<area>.viewer_spawns`, `<area>.viewer_portals` | the viewer's own readers give what the index lists | js |
| `<area>.spawns_match_index`, `portals_match_index`, `stats_match_index`, `index_fields` | the index says what the files say (js: `portals_match_index` only, for `target_area`, `portal_id` and `seam`) | py (`--check`), js |
| `<area>.planning_targets` | the file against the planning targets of its kind, caves included (a note, not a failure; a kind with no targets would be a failure, never a trace) | py |
| `world.bare_id_hazard` | a note: a portal whose bare `toSpawn` is also a spawn id: harmless with an index, where the exact id is the only lookup, and a trap for a loader that falls back to the bare id (also printed when the portal leads into a pending scene) | py, js |
| `<area>.no_way_in` | a note: no portal of another area leads into this area (the start area is left out) | py, js |
| `<area>.way_back` | a note: the way out of a room, a wild area or a cave (a portal that leaves its scene: a door, a cave mouth's `_out`; never a seam) arrives in another file than the door that leads in, or more than 10 m from it | py, js |
| `world.spawn_unique`, `world.portal_unique` | ids used once in the whole index | py (js: spawns) |
| `world.seams_only_between_sections` | a crossing between two sections of one scene (two village sections, or two caves) is always a seam; only seams use the stem `seam_` | py, js (js since 1.1) |
| `world.walk_scenes` | `walk_scenes.json` is well formed and none of its ids is a game scene id: `overworld` or the scene of a room or a wild area of the folder (py with `--scene-ids` also: any game scene id, a game scene id that starts with an area prefix, a game portal id in a walk-only namespace). A missing `walk_scenes.json` is a note | py, js (1.1) |
| `walk_scenes.readable` | `walk_scenes.json` (or the file of `--walk-scenes`) is a JSON object; when it is not, it is one FAIL line and no walk-only scene is known | py, js (1.1) |
| `world.cave_mouths` | every portal in a walk-only namespace is `Portal_um.<gate>_in` in the village or `Portal_um.<gate>_out` in a cave, with `toSpawn: mouth_<gate>`, `kind: cave_mouth` and the right `to`; every crossing between the village and the caves is one. Printed when the folder has a mouth or a cave | py, js (1.1) |
| `world.cave_look` | every cave carries the same exposure, fog and `wdi_baked`. Printed when the folder has a cave | py, js (1.1) |
| `seam.<id>.sides`, `.numbering`, `.extras` | two sections of one scene (two village sections, or two caves), rows numbered 1 to n, the extras of section 6 (`to` is the seam's scene; the device is one of its kind's list) | py, js |
| `seam.<id>.row`, `.spacing`, `.coverage` | straight rows 0.9 m apart, neighbours at most 1.8 m apart, the opening covered (js also walks the viewer's trigger across it, holding every portal of the file) | py, js |
| `seam.<id>.arrival` | every arrival 2.1 m beyond its departure portal, in line, facing the way of travel, at least 1.2 m from every portal of its file, named for the seam's scene (js also walks the viewer's trigger straight back to the wall) | py, js |
| `seam.<id>.clear` | no portal outside the seam's own row within 2 m of a point of it | py, js |
| `seam.<id>.height` | the two files put the ground at the seam line at the same height, within 0.15 m | py, js |
| `seam.<id>.look_equal` | exposure, fog and `wdi_baked` equal on both sides | py (files), js (files and index) |
| `seam.<id>.barrier.a`, `.barrier.b` | the wall across the opening, 3 m above the ground under each ray; at a cave seam from 0.25 m above the floor to 0.1 m under the roof, which must be found (uncompressed collision only) | py, js |
| `index.schema` | the index fits the schema | py |
| `index.walk_scenes` | the index's `walk_scenes` are the entries of `walk_scenes.json` for the walk-only scenes the files use, and there is no such field when they use none | py (`--check`), js (1.1) |
| `index.start`, `index.spawn_by_id` | the start spawn, and every spawn of the index, is found by its id in the file that holds it | py (start), js |
| `index.areas`, `index.scenes`, `index.seams`, `index.pending` | the index's own lists | py, js (areas, seams) |
| `index.area_ids_unique`, `index.one_folder` | no area id is used by two files; every area file is in one folder, where the index goes too (with `--legacy`, today's two folders are accepted with a warning) | py |
| `index.format` | the index says `format` 1 and carries its `axes` note | js |
| `index.pending_unused` | a note: a scene listed under `pending` that no portal leads into | py |
| `world.pending.<scene>` | a note: a scene that is not built yet, game or walk-only, and the portals that need it | py, js (js since 1.1) |
| `journey` | the scripted trip through the fixture | js |
| `<area>.file` | the file the index names is in the folder | js |
| `<area>.standin_matches_three` | with `--three`: the real GLTFLoader gives the viewer the same spawns and portals as the stand-in | js |
| `<area>.slot`, `<area>.geometry_not_checked`, `seam.<id>.barrier_not_checked.<side>`, `<area>.images_unread` | notes: a room or wild area stands on a slot of the old far grid; the collision mesh is Draco-compressed (or missing), so the ground, the closed edge and the seam wall are not checked; an image header could not be read, so the texture figure leaves it out (`images_unread`: py only) | py, js |

"Near" in these rules is the viewer's own measure (`PortalTrigger.nearest`): the distance on the ground plan, between
things no more than 2 m apart in height.

## The variants

Each row is one run of the generator with `MUTATE=<name>`. Run on 2026-11-19: 46 of 46 broken
variants caught by both checkers, 3 of 3 allowed variants noted, 8 of 8 valid variants passed, 37 of 37 odd inputs
ended in FAIL lines and no trace, and the unbroken fixture passes both.

**Broken.** Both checkers must exit 1 with the rule in the last column among their failures.

| Name | What is broken | The rule that must fail |
|---|---|---|
| `arrival_close` | seam arrivals stand 0.55 m from the return row | `seam.west_east.arrival` |
| `arrival_turned` | seam arrivals look north, not along the way of travel | `seam.west_east.arrival` |
| `lateral_shift` | seam arrivals land 0.5 m along the gate | `seam.west_east.arrival` |
| `wide_spacing` | the rows are spread to 2.61 m between neighbours | `seam.west_east.spacing` |
| `single_portal` | one portal point in the 5 m opening | `seam.west_east.coverage` |
| `room_at_slot` | the room's Area stands on the far-grid slot (3000, 3000) | `room_shop.area_at_origin` |
| `section_offset` | a section's Area is moved 10 m out of the village frame | `village_east.area_at_origin` |
| `dup_spawn` | `Spawn_mill` is renamed `Spawn_square`: one id in two files | `world.spawn_unique` |
| `typo_target` | a door leads to the scene `shp` | `village_west.portal_target` |
| `no_exposure` | an Area has no `wdi_exposure` | `village_west.area_extras` |
| `look_pop` | the two sides of the seam have different exposure | `seam.west_east.look_equal` |
| `no_barrier` | the wall across the seam opening is gone in one file | `seam.west_east.barrier.a` |
| `look_drift` | the files say exposure 3.1 and fog 0.02, the index still says 2.3784 and 0.006 | `village_west.look_matches_index` |
| `dup_target_spawn` | a portal's target id is in two files | `world.spawn_unique` |
| `bare_target` | a portal's target exists only by its bare id | `room_shop.portal_target` |
| `seam_gap` | the middle point of the row is gone: 3.6 m between neighbours | `seam.west_east.spacing` |
| `no_collision` | a file has no `HM_Collision_<areaId>` | `village_east.one_collision` |
| `two_areas` | a file has two Area nodes | `village_east.one_area` |
| `dup_in_file` | two nodes named `Spawn_square` in one file | `village_west.names_unique_in_file` |
| `arrival_near_door` | a door portal 0.6 m from a seam arrival: the viewer's trigger is not ready there, and the door fires before the gate at 39 of 89 places | `seam.west_east.arrival` |
| `spawn_near_portal` | `Spawn_mill` 0.92 m from a seam point | `village_east.spawn_clear_of_portals` |
| `door_near_seam` | a door portal 1.2 m from a seam point | `seam.west_east.clear` |
| `seam_step` | one section holds everything 0.5 m higher than the other | `seam.west_east.height` |
| `scene_fog` | fog on the glTF scene of one section | `village_east.scene_extras` |
| `sun_one_side` | a directional light in one section | `village_east.no_directional_light` |
| `room_far_from_origin` | the room's contents stand around (3000, 3000) with no transform on any node | `room_shop.origin_in_walk_region` |
| `raw_name_dot` | a spawn node written `Spawn_shop_.door`: three.js strips the dot and reads the same id | `room_shop.raw_names` |
| `light_named_like_spawn` | a light definition named `Spawn_shop_door`: the loader renames the spawn node | `room_shop.names_unique_in_file` |
| `light_ghost_spawn` | a light definition named `Spawn_ghost` on the node that holds the ground mesh: the real loader gives the viewer a spawn nobody wrote | `village_east.reserved_names` |
| `index_target_area` | the files are right; the index names the wrong area for a door's target | `village_west.portals_match_index` |
| `extension_not_listed` | a section file requires `KHR_materials_clearcoat`, which is not on the contract's allow-list | `village_east.extensions` |
| `south_wall_gone` | the collision wall along the south edge of `village_east` is missing: 60 m of open edge, far from the seam | `village_east.edge_closed` |
| `edge_gap` | a 0.6 m gap in the east wall of `village_east` at y 6.0 to 6.6, outside any seam opening: a walker's capsule fits through | `village_east.edge_closed` |
| `baked_one_side` | `village_east` says `wdi_baked: true` (file and index), `village_west` does not: the viewer switches off the lights of one side only | `seam.west_east.look_equal` |
| `polygon_odd` | the outline `wdi_walk_polygon` of `village_west` is five numbers, which is no list of points | `village_west.area_extras` |
| `chamfer_open` | `village_west` cuts off its north-west corner along a diagonal in its outline, and no wall stands on the diagonal: 14.1 m of open edge that is not parallel to an axis | `village_west.edge_closed` |
| `cave_not_indoor` | `under_a` has no `wdi_indoor`: the viewer would draw the moon, the sky light and the sky dome in a cave | `under_a.area_extras` |
| `cave_not_baked` | `under_a` has no `wdi_baked`, in its file and in the index | `under_a.area_extras` |
| `cave_seam_open_roof` | the seam wall of `under_a` stops 0.3 m under the roof: the 10 rays 0.1 m under the roof find no wall | `seam.a_b.barrier.a` |
| `cave_seam_to_overworld` | the cave seam's points in `under_a` say `to: overworld`, not `to: undermere` | `seam.a_b.extras` |
| `cave_look_differs` | `under_b` carries fog density 0.08 and `under_a` 0.05 | `world.cave_look` |
| `walk_scene_is_game_scene` | the variant's own `walk_scenes.json` also lists `shop`, the game scene of the room `room_shop`, as a walk-only scene | `world.walk_scenes` |
| `cave_id_prefix` | the west cave is called `cave_a`, not `under_<key>` (the game has the scenes `cave_entry` and `cave_gallery`) | `cave_a.area_id` |
| `cave_door_between_caves` | the cave seam is replaced by two plain doors between `under_a` and `under_b` | `world.seams_only_between_sections` |
| `cave_spawn_near_portal` | `Spawn_undermere_mouth_east` stands 0.8 m from `Portal_um.east_out` | `under_a.spawn_clear_of_portals` |
| `cave_gate_to_missing_spawn` | `Portal_um.east_in` leads to `undermere` + `mouth_east`, and no cave holds `Spawn_undermere_mouth_east` | `village_east.portal_target` |

The variants are listed in the order they were added: the first nineteen test the rules the checkers were first
written with, from `arrival_near_door` to `chamfer_open` each one is a file set that a simpler checker passes and that
goes wrong in the viewer, and the last ten are the caves of version 1.1. In
`room_at_slot` the mistake is a room standing on the old far-grid slot, because a room now sits at its own origin.
`no_barrier` also fails `<area>.edge_closed` as a consequence: the seam wall is part of the edge.

**Allowed, with a note.** `walk_index.py` must fail nothing and print the note; `check_areas.mjs` must print it and
fail nothing but its scripted journey, which is written for the unchanged fixture.

| Name | What is unusual | The note |
|---|---|---|
| `way_back_far` | the shop's way out arrives in the other section, 60 m from the door that leads in | `room_shop.way_back` |
| `no_way_in` | the shop's door is gone: no portal leads into the room | `room_shop.no_way_in` |
| `gate_pending` | no cave file yet: the cave mouth `Portal_um.east_in` leads into `undermere`, which the index lists under `pending` (the scripted journey is not run: the world is not the fixture's) | `world.pending.undermere` |

**Valid.** Both checkers must pass it.

| Name | What is unusual |
|---|---|
| `slope_along_seam` | the ground of both sections rises 3 % along the seam; the walls stand 3 m above it everywhere |
| `pending_bare_id` | `Portal_ov.mine` asks for the scene `mine`, which is not built, with the `toSpawn` `mill`, and `Spawn_mill` exists: the viewer says "Mine is not built yet" and never takes the bare id; both checkers pass it and print `world.bare_id_hazard` |
| `spawn_matrix` | `Spawn_mill` is written with a `matrix` and no translation or rotation: legal glTF, which three.js decomposes (Blender writes translation, rotation and scale) |
| `polygon_flat` | `village_west` writes its outline as a flat list of numbers, the form a Blender custom property can hold; the index lists it as pairs |
| `polygon_string` | `village_west` writes its outline as a JSON string, as today's exporter writes nested data; the index lists it as pairs |
| `polygon_chamfer` | `village_west` cuts off its north-west corner along a diagonal, writes the outline and stands a wall on the diagonal: the closed-edge rule follows an outline that is not a rectangle |
| `cave_stacked_levels` | a third cave, `under_c`, lies directly under `under_a`, 6 m lower, reached by its own mouth `west` from `village_west`; its mouth's portal and arrival stand at the same places in plan as those of `under_a` (the scripted journey is not run: the world is not the fixture's) |
| `cave_seam_ramp` | the floor and roof of both caves rise 6 % toward the east, across the cave seam: the rows stand 0.05 m apart in height and the arrivals 0.20 m, and both files put the floor at the seam line at the same height; the scripted journey passes |

**Odd inputs.** Not a world at all, but input a checker may meet: a file that is not JSON, a spawn whose extras are a
word, a translation with a word in it, nodes that are each other's children, an index that is a list, an accessor that
is not there, a four-byte `.glb`, an empty folder, a matrix of zeros, two files that declare a seam opening 1e9 m wide
(a checker that sampled it would never finish), a `walk_scenes.json` that is not JSON, is a list, or holds a word or a
list where an entry or a kind belongs, a cave whose kind is a number and whose scene is a list, and 22 more (the list
`ODD` in `mutants.py` has all 37). Each
checker must end with FAIL lines and exit code 1 (exit code 2 for the empty folder, which has nothing to check) and
print no stack trace. It matters because a checker that stops with a trace, or with an exit code of 0 after an
internal error, says nothing about the files.

## What was run, and on what

**2026-11-19, version 1.1 (the caves).** Windows 11, Python 3.13.14, Node 26.13.0; the viewer's `spawn.ts` and
`portals.ts` as at commit `509df801` (unchanged in the checkout that was used):

- `walk_index.py fixture/areas --check`: 190 pass, 0 fail, 3 notes.
- `check_areas.mjs fixture/areas`: 157 pass, 0 fail, 3 notes, 5 controls; the journey 32 of 32 steps.
- `walk_index.py fixture/areas` (build, with `--world hollowmere-fixture --pending mine`) writes the committed index
  byte for byte (13,393 bytes); the generator writes the five `.gltf` files and the index again with the same bytes
  (73,898 in all).
- `mutants.py`: 46 of 46, 3 of 3, 8 of 8, and 37 of 37 odd inputs, in about 60 s. `--three` was not run: no copy of
  three.js was at hand.
- `walk_index.py --legacy` on today's two files writes the same index as version 1, byte for byte (15,571 bytes):
  43 pass (one more than before: `world.walk_scenes`), 0 fail, 7 warnings, 15 notes.
- Five altered copies of the fixture made by hand, not kept, each through both checkers: a cave mouth's arrival 30 m
  from its mouth (the note `under_a.way_back` in both); a plain door from the village into a cave
  (`world.cave_mouths` fails in both); a seam whose side b is a cave and whose side a a village section
  (`seam.<id>.sides` fails in both); a mouth's `_in` in a room (`world.cave_mouths` fails in both); a village device
  (`lychgate`) at the cave seam (`seam.a_b.extras` fails in both).
- `prettier --check` (3.9.10) on every changed file Prettier covers, ESLint 10.12.0 with the repository's
  `eslint.config.js` on the three `.mjs` files (outside the repository), and `pyflakes` on the two Python files: no
  finding.

**2026-11-16, version 1.** Windows 11, Python 3.13.14, Node 26.13.0, the viewer's source at commit `509df801` of `claude/v2-walk`
(a copy, compared with the branch: 12 of 12 files equal):

- `walk_index.py fixture/areas --check`: 114 pass, 0 fail, 3 notes.
- `check_areas.mjs fixture/areas`: 89 pass, 0 fail, 2 notes, 4 controls; the journey 21 of 21 steps. With `--three`
  pointing at a copy of three r160: 92 pass, and the real GLTFLoader gives the viewer the same spawns and portals as
  the stand-in. The viewer pins three 0.186.1; that version was not run.
- `walk_index.py fixture/areas` (build, with `--world hollowmere-fixture --pending mine`) writes the committed index
  byte for byte (8,116 bytes), and the fixture generator writes the three `.gltf` files and the index again with the
  same bytes (54,700 in all).
- `mutants.py`: 36 of 36, 2 of 2, 6 of 6, and 29 of 29 odd inputs. The same with `--three`: every variant through the
  real GLTFLoader of r160 (and the odd input `extras_words` too). There the real loader and the stand-in give the
  viewer the same spawns and portals for 134 of the 135 files (45 folders of 3); the one that differs is
  `village_east` of `light_ghost_spawn`, which is what that variant is for. The same with `--python-only`.
- The naming rules against the real GLTFLoader of r160, seven cases made by hand (a light definition, a camera, the
  scene and a mesh named like a spawn): the loader renames and lists exactly what the two checkers expect, 7 of 7.
- The 29 odd inputs are the list `ODD` in `mutants.py` (a file that is not JSON, extras that are a word, a node tree
  that loops, an index that is a list, a four-byte `.glb`, a seam opening 1e9 m wide and so on): both tools end every
  one with FAIL lines and exit code 1, or exit code 2 for an empty folder; none ends in a trace.
- Altered copies of the fixture made by hand, to break each rule from outside the generator. They are not kept in the
  repository, and every fault they showed that a checker let through is now one of the variants above. Run again on
  these tools: 38 hand-made copies (10 pass both checkers, 4 pass all but the fixture's scripted
  journey, 24 fail a rule; the only one that changed is a world turned 30 degrees, which now fails
  `edge_closed` because its walk regions are the rectangles around the turned ground, and passes when each section
  writes its outline); 17 more (10 are refused by the builder, 5 pass, 2 pass but the journey); 11 closed-edge
  attempts (walls 2.9 and 3.05 m high, the wall face 0.25 and 0.35 m inside or outside the edge, a wall 1 m beyond the
  edge, a void between the ground and the wall, an outline written clockwise or with a repeated corner): every one
  as expected in both checkers; and valid seams from 2 to 10 m wide with one to six points, moved along the wall,
  which pass. One case still passes every rule that should fail it: a single portal point in a 5 m opening, once both
  files declare the opening as 2 m wide (see "Neither tool can see").
- 300 random edits (one to three each) of the fixture, the two checkers compared on every rule they share. With the
  index the builder wrote (78 of the 300) they never disagree outside the rules that compare the index with the files.
  With an index the builder refused to write, which is then stale (the other 222), they differ where `check_areas.mjs`
  reads the index (`portal_target`, `sides`, `area_extras`) or walks the viewer's trigger (`arrival`, `coverage`), and
  in a few files that already fail another rule (a doubled node name: `clear`, `barrier`). No stack trace and no
  `checker.internal` in any of the 300.
- `walk_index.py --legacy` on today's `hollowmere_walk.glb` and `rooms/widow_bedroom.glb`: 42 pass, 0 fail, 7
  warnings, 15 notes. Without `--legacy`: the same 7 as failures, which are the changes the exporter has to make. The
  index it writes is 15,571 bytes, the bytes of the index in section 3 of the contract. `check_areas.mjs` on the
  same two files: the viewer's `findSpawns` and `findPortals` agree with the index on all 38 spawns and 13 portals.
- The closed-edge rule on a mesh of real size: today's village collision (148,000 triangles, decoded earlier from its
  Draco data), written once into a throwaway `.gltf` under an Area with today's walk region. Both checkers find the
  same 1 of 3,992 places open and finish in about 2 s (Python) and 0.7 s (JavaScript), parsing included. The village
  is not a section; this is a size and plausibility test, and the file is not kept.
- The schema file is a valid draft 2020-12 schema, and the small checker inside `walk_index.py` agreed with the
  `jsonschema` library (4.26.0) on the fixture index, on the index of the two real files, and on 37 broken copies of
  them (both reject every one). `jsonschema` is not needed to run anything here.
- `prettier --check` with the repository's settings (`.prettierrc.json`, `.prettierignore`) passes over this whole
  folder (Prettier 3.9.10); the variants' `.gltf` and `.json` files pass too. Prettier has no parser for `.py`, so the
  two Python files are outside what it checks. The two JSON writers were also tried on 400 random documents: the
  Python one and the JavaScript one gave the same bytes, and Prettier would change none of them.
- ESLint 10.12.0 and typescript-eslint 8.71.1 (the versions `pnpm-lock.yaml` pins, installed outside the repository)
  with the repository's own `eslint.config.js`, on the three `.mjs` files: no error and no warning. **`pnpm lint`
  itself was not run**: the repository's packages are not installed where this was written. Run it once before
  merging.
- Not run on Linux or macOS. Nothing here is written for one system, but only Windows was tried.
