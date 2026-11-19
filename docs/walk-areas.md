# Walk areas: one GLB per area

The contract between the Blender exporter (`tools/blender/`) and the first-person walk viewer (`apps/walk`, branch
`claude/v2-walk`) for a world that is no longer one file. The owner's directive: every room is its own GLB, and the
village is cut into sections joined by portals, as the 2.5D game joins its scenes.

Version 1.1, 2026-11-19: version 1 of 2026-11-16 with a cave network added. The owner asked on 2026-11-19 for caves
cut like the village (each cave section its own GLB, joined by portals), reached from four surface gates (in The West
Woods, Up the Line and the North Woods, The East Hills and Mill Lane), large and geologically diverse. The caves are
for the 3D walk only: no game scene id is added for them and `packages/content/data/scenes` is not touched. The index
still says `"format": 1` (section 12 says why). The tools that prove a set of files obeys this contract are in
`tools/blender/walk_areas/`.

Words used here. An **area** is what one file holds: a village section, a room, a wild area or a cave. A **scene** is
a game scene id from `packages/content/data/scenes` (`overworld` is the village; `widow_bedroom` is a room), or a
**walk-only scene**: a scene of the walk that the game does not have, listed in
`tools/blender/walk_areas/walk_scenes.json`. There is one: `undermere`, The Undermere, the caves. A **cave** is an
area of a walk-only scene: a cave section, cut like a village section. A **sectioned scene** is a scene cut into areas
joined by seams: `overworld` (its village sections) and every walk-only scene (its caves). A **seam** is a crossing
between two areas of one sectioned scene: two village sections, or two caves. A **cave mouth** is one of the surface
gates: a pair of door-like portals between the village and the caves. Lengths are metres. "Measured" means read from
a file or run on 2026-11-16, or on 2026-11-19 for what version 1.1 added; "estimated" means worked out and not run.
Blender axes are x east, y north, z up; glTF writes Blender's (x, y, z) as (x, z, -y). Line numbers of the viewer are
in `apps/walk/src/` at commit `509df801` of `claude/v2-walk`; line numbers of the exporter are in
`tools/blender/meshy_walk_export.py` and were read at commits `f2f5dbff` and `957a02b3` of
`claude/hollowmere-walk-export` (the same lines in both).

## 1. The whole thing in ten lines

1. The world is one folder: a file `walk-<areaId>.glb` for every area, and one `walk-index.json`.
2. An area is a village section (`village_<key>`), a room (`room_<sceneId>`), a wild area (its scene id) or a cave
   (`under_<key>`). A file holds exactly one: one `Area_<areaId>` node and one `HM_Collision_<areaId>` node at its
   scene root.
3. A file's coordinates are its own. All village sections and all caves keep the village's coordinates, so a seam is
   at the same place in both files; the caves lie below the ground. A room and a wild area sit at their own origin.
4. The viewer has one area in its scene at a time.
5. The index lists every area's file, spawns and portals, so the viewer knows which file holds a spawn without
   opening it. `walk_index.py` writes the index from the files; nobody writes it by hand.
6. A portal names a scene and a spawn (`to`, `toSpawn`). The scene is a game scene id or a walk-only scene id. Its
   target is the spawn whose id is exactly `<to>_<toSpawn>`, looked up in the whole index. Spawn ids are unique in
   the whole index. The caves are reached from the village only through cave mouths: door-like portals named
   `Portal_um.<gate>_in` and `Portal_um.<gate>_out`.
7. A scene that has no file yet is listed under `pending`. A portal into it says "... is not built yet", as today.
8. A seam is a closed wall in each file with a row of portal points 0.45 m in front of it. The walker arrives 1.65 m
   inside the other file's wall, 2.1 m beyond the point they left by. No other portal stands near the row or the
   arrivals. Exposure, fog, whether the light is baked, and the height of the ground are equal on both sides. In the
   village the wall stands 3 m high; in a cave it closes the passage from the floor to the roof. The rest of a village
   section's edge is closed by a wall too, so that nobody walks off it.
9. The viewer can cross between files in two ways: load the page again with the arrival spawn in the address (about
   11 hours of work, estimated) or swap the area inside the page (about 22 hours, estimated). The files, the index,
   the seams and the checkers are the same for both.
10. A single GLB opened with `?glb=` works exactly as it does today. Nothing here changes that mode or its tests.

## 2. Files and names

| Thing | Name | Example |
|---|---|---|
| The index | `walk-index.json` | |
| An area file | `walk-<areaId>.glb`, in the same folder as the index | `walk-room_widow_bedroom.glb` |
| Area id of a village section | `village_<key>` | `village_west` |
| Area id of a room | `room_<sceneId>` | `room_widow_bedroom` |
| Area id of a wild area | its scene id | `forest` |
| A walk-only scene | an id of `tools/blender/walk_areas/walk_scenes.json` | `undermere` |
| Area id of a cave | the area prefix of its walk-only scene and a key: `under_<key>` | `under_a` |
| The area's root node | `Area_<areaId>` | `Area_room_widow_bedroom` |
| The area's collision node | `HM_Collision_<areaId>` | `HM_Collision_room_widow_bedroom` |
| A spawn in a room, a wild area or a cave | `Spawn_<sceneId>_<spawnId>` | `Spawn_widow_bedroom_door`, `Spawn_undermere_mouth_east` |
| A spawn in a village section | `Spawn_overworld_<spawnId>` for the scene's own spawns; `Spawn_<district>` for the district spawns | `Spawn_overworld_widow`, `Spawn_square` |
| A portal | `Portal_<portalId>`, the game's portal id with its dot | `Portal_wb.door` |
| A cave mouth's portals | `Portal_<ns>.<gate>_in` in the village and `Portal_<ns>.<gate>_out` in a cave; `<ns>` is the walk-only scene's portal namespace, `um` | `Portal_um.east_in`, `Portal_um.east_out` |
| A cave mouth's arrivals | `Spawn_overworld_mouth_<gate>` in the village, `Spawn_<scene>_mouth_<gate>` in a cave | `Spawn_overworld_mouth_east`, `Spawn_undermere_mouth_east` |
| A seam | `<seamId>`: lower-case words joined by `_`, unique in the whole index | `west_east`, `a_b` |
| A seam's portal points | `Portal_seam_<seamId>_<side>_<n>` | `Portal_seam_west_east_a_2` |
| A seam's arrival spawns | `Spawn_<scene>_seam_<seamId>_<side>_<n>`, the scene being `overworld` or the walk-only scene | `Spawn_overworld_seam_west_east_b_2`, `Spawn_undermere_seam_a_b_b_2` |

Rules for the names:

- Area ids, spawn ids and seam ids use lower-case letters, digits and `_` only. A portal id may hold dots between
  such words. The rule is about the name as it is written in the file: the checkers test the written names of the
  Area, the collision node, every spawn and every portal (`<area>.raw_names`). Measured: the game's 32 scene ids, 82
  portal ids and 112 spawn names all fit, and so do all the names in today's two files.
- A **spawn id** is the node's name without `Spawn_`. It is unique across every file of the index.
- A **portal id** is unique across every file of the index too, both as the viewer reads it (`wbdoor`) and as the
  game writes it (`wb.door`): `world.portal_unique`.
- The area id of a section (`village_<key>`), a room (`room_<sceneId>`) or a cave (`under_<key>`) is never itself a
  game scene id. A room's `<sceneId>` and a wild area's id are game scene ids, never walk-only ones; a cave's scene is
  a walk-only scene. `walk_index.py --scene-ids` checks both (`<area>.area_id`, in both checkers since version 1.1;
  `check_areas.mjs` has no list of the game's scene ids and checks the forms only).
- **The walk-only scenes** are listed in `tools/blender/walk_areas/walk_scenes.json`, which is committed:
  `{"undermere": {"name": "The Undermere", "kind": "cave", "area_prefix": "under_", "portal_ns": "um"}}`. Each entry
  says the scene's plain words, the kind of its areas (`cave`, the only kind so far), the prefix of its area ids and
  the namespace of its cave mouths' portals. **A walk-only scene id is never a game scene id**: both checkers fail one
  that is `overworld` or the scene of a room or a wild area of the folder, and `walk_index.py --scene-ids` also one
  that is any game scene id, a game scene id that starts with an area prefix, and a game portal id that uses a
  walk-only namespace (`world.walk_scenes`). Measured on 2026-11-19: none of the game's 32 scene ids starts with
  `under_`, and none of its 82 portal ids with `um.`. That is also why caves are not called `cave_<key>`: the game has
  the scene ids `cave_entry` and `cave_gallery`, so `cave_` would start game scene ids (the variant `cave_id_prefix`).
  An area prefix is not `village_` or `room_`, and two walk-only scenes share no prefix and no namespace.
- The stem `seam_` belongs to seams: no other portal or spawn uses it.
- A walk-only scene's namespace (`um.`) belongs to its cave mouths: no other portal uses it, and the game does not.
- No Area, collision, spawn or portal name is used twice in one file. three.js would rename the second one
  (`Spawn_x` becomes `Spawn_x_1`) and the viewer would see a spawn nobody asked for. three.js also removes
  `. [ ] : /` from names and turns spaces into `_`, so `Portal_wb.door` is read by the viewer as the id `wbdoor`
  (the viewer's README says so; the extras are not touched).
- three.js keeps **one table of names for the whole file**, and not only nodes are in it. The glTF scene's name is
  taken first; then the nodes in order, each node's own name before the name of the camera and of the light
  definition it holds; mesh names come after every node name (read in the source of three r160 and measured with
  r160 on seven cases; the viewer pins 0.186.1, not run). Two things follow, both measured:
  - A scene, a camera or a light definition named like a later node renames that node: a light definition
    `Spawn_x` on an earlier node turns the node `Spawn_x` into `Spawn_x_1`. Both checkers follow the same order and
    fail it (`<area>.names_unique_in_file`).
  - Such a name can put an object into the scene that the viewer takes for a spawn. A light definition or a camera
    named `Spawn_x` on a node that also holds a mesh becomes an object `Spawn_x`, and the viewer's `findSpawns`
    lists it; so do the parts of a mesh `Spawn_x` that has two primitives, and a scene named `Spawn_x` itself.

  Hence the rule: **only the Area, collision, spawn and portal nodes carry a name that begins `Area_`,
  `HM_Collision`, `Spawn_` or `Portal_`.** No scene, camera or light definition does. A mesh does only when
  three.js gives its object the node's name: it has one primitive, and every node that holds it has a name and no
  camera or light (`<area>.reserved_names`). Measured: in today's two files the only such name off a node is the
  collision mesh, which fits; every light definition is held by one node of its own name (24 and 2), so only the
  light is renamed and no node is.
- The test world in `tools/blender/walk_areas/fixture/` uses `.gltf` files, not `.glb`, because this repository keeps
  `*.glb` in Git LFS and CI checks out without LFS. Both checkers read both forms. Real area files are `.glb`.

How the viewer is told which world to open:

| Address | Mode |
|---|---|
| `?index=<address of a walk-index.json>` | the index and its area files |
| nothing | the index the build was given, if any; else the single GLB the build was given, as today; else the page asks for a file |
| `?glb=<address of a .glb or .gltf>`, or a file dropped on the page | **single-file mode, exactly as today.** No index is read. If both `?glb=` and `?index=` are given, `?glb=` wins. |
| `?spawn=<spawn id>` | with an index: any spawn id of the index; the viewer opens the file that holds it. In single-file mode: as today. |

## 3. The index

`walk-index.json` is written by `tools/blender/walk_areas/walk_index.py` from the area files themselves. Every value
in it can be read back from the files, and `walk_index.py <folder> --check` does exactly that. Three things are given
to the tool and not read from the files: `world` (a label), `start`, and which unbuilt scenes are real (the game's
scene ids, or a list). The walk-only scenes come from `walk_scenes.json` beside the tool.

**Axes.** Every 3-number vector is in glTF world axes: x east, y up, z = -north. Every field whose name ends in `_xy`
is a plan view in Blender axes: x east, y north. `yaw_deg` is the viewer's yaw: 0 looks along -z (north), positive
turns left, so west is 90. The index says this itself, in its `axes` field.

| Field | Meaning | Who reads it | Required |
|---|---|---|---|
| `format` | 1. A viewer that meets another number treats the index as absent. | viewer | yes |
| `axes` | the sentence above | people | yes |
| `world` | a label | nobody | no |
| `start` | the spawn id to start at when the address names none | viewer | yes |
| `areas` | area id to the entry below | viewer, tools | yes |
| `scenes` | scene id, a game scene id or a walk-only one, to the area ids that make it up (`overworld` is every village section, `undermere` every cave) | tools | yes |
| `seams` | every seam, between two village sections or two caves: `id`, `kind`, `width_m`, sides `a` and `b` (area ids), `portals` (points per side), `opening_xy` (the two ends of the opening), `normal_xy` (the unit direction from side a to side b) | tools: the checker walks the viewer's trigger across each opening | yes, may be empty |
| `pending` | scene ids, game or walk-only, that are not built yet | tools: it is what tells an unbuilt scene from a misspelt one. The viewer does not need it: a target that is not in the index is "not built yet". | yes, may be empty |
| `walk_scenes` | the walk-only scenes the files use (the scene of an area, or where a portal leads), each entry copied from `walk_scenes.json`: `name`, `kind`, `area_prefix`, `portal_ns`. Left out when the files use none, so the index of today's two files is the same as before (measured on 2026-11-19: the same 15,571 bytes) | tools; a viewer that wants better words for a door into the caves ("The Undermere" rather than "Undermere") | no; version 1.1 |
| `areas.<id>.file` | the file's name, no folder | viewer | yes |
| `areas.<id>.bytes` | the file's size in bytes | viewer: the loading bar, when the server sends no length | yes |
| `areas.<id>.sha256` | the hash of the file's bytes | viewer: its first 8 characters can go on the address so a new export is never mixed with a cached old file; tools | yes |
| `areas.<id>.kind` | `section`, `room`, `wild` or `cave` | tools | yes |
| `areas.<id>.scene` | the scene this area belongs to | tools | yes |
| `areas.<id>.name` | plain words (the Area's `wdi_name`) | viewer, if it wants better words in the door prompt | yes |
| `areas.<id>.indoor`, `baked` | as the viewer reads them from the Area | tools; the seam check holds `baked` equal on both sides | yes |
| `areas.<id>.walk_region_xy` | x0, y0, x1, y1: the rectangle around the ground the player can walk in this file | tools | yes |
| `areas.<id>.walk_polygon_xy` | the outline of that ground when it is not the whole rectangle, always as a list of `[x, y]` pairs, whatever form the Area wrote it in (section 4) | tools | no |
| `areas.<id>.look` | the Area's own `wdi_exposure`, `fog_color`, `fog_density` (or `fog_near`, `fog_far`), copied under the same names | viewer, if it wants the look set before the first frame; tools: the seam check | yes |
| `areas.<id>.spawns[]`: `id`, `label`, `name`, `group` | the spawn id and the picker's words, exactly as the viewer's `findSpawns` builds them | viewer: the picker, and which file holds a spawn | yes |
| `spawns[].position`, `yaw_deg` | where the spawn is and where it faces | tools | yes |
| `spawns[].picker` | `false` keeps an arrival-only spawn out of the picker; left out otherwise | viewer | only when false |
| `areas.<id>.portals[]`: `id`, `portal_id`, `position`, `to`, `toSpawn`, `kind`, `target_area`, `seam` | every portal: the id the viewer reads (`wbdoor`), the game's id (`wb.door`), where it leads, the area that holds its target (`null` when the scene is pending), and the seam id on seam portals | tools; a viewer that fetches ahead | yes |
| `areas.<id>.stats` | counts read from the file: triangles loaded, collision triangles, draw calls, instanced groups, images, GPU texture megabytes, lights | tools | no |

The viewer must ignore fields it does not know. The shape of the file is in
`tools/blender/walk_areas/schema/walk-index.schema.json`; the schema lists exactly the fields of version 1.1 (those of
version 1, and the optional `walk_scenes`), and a later optional field is added to it there.

**Order.** `walk_index.py` lists the areas by their ids and each area's spawns and portals as the file has them. The
order carries no meaning. In what order the picker shows the spawns is the viewer's choice.

**A true example.** This is the index `walk_index.py --legacy` builds from today's two real files as they are
(measured, 2026-11-16; the whole file is 15,571 bytes). It shows today's world: the unsplit village as the legacy area
`village`, and the one finished room. 35 of the village's 37 spawns and 10 of its 12 portals are left out here and
the lines are laid out more tightly; no value is changed.

```json
{
  "format": 1,
  "world": "hollowmere",
  "axes": "Metres. Every 3-number vector is in glTF world axes: x east, y up, z = -north. Every field whose name ends in _xy is a plan view in Blender axes: x east, y north. yaw_deg is the yaw of the viewer: 0 looks along -z (north), positive turns left, so west is 90.",
  "start": "square",
  "areas": {
    "room_widow_bedroom": {
      "file": "widow_bedroom.glb",
      "bytes": 3664892,
      "sha256": "34cff586857328fe4ff379b62f52b6ba159bd9cd3a7ceff7e0071ab4ef3f9c37",
      "kind": "room", "scene": "widow_bedroom", "name": "Widow's bedroom", "indoor": true, "baked": true,
      "walk_region_xy": [-5.3, -3.8, 5.3, 3.8],
      "look": { "wdi_exposure": 6.3 },
      "spawns": [
        { "id": "widow_bedroom_door", "label": "By the door (Widow's bedroom)", "name": "By the door", "group": "Widow's bedroom", "position": [-2.5, 0, 3], "yaw_deg": 0 }
      ],
      "portals": [
        { "id": "wbdoor", "portal_id": "wb.door", "position": [-2.5, 0, 3.5], "to": "widow_parlour", "toSpawn": "bedroom", "kind": "door", "target_area": null }
      ],
      "stats": { "triangles_loaded": 389157, "triangles_collision": 2952, "draw_calls": 69, "instanced_groups": 0, "images": 34, "texture_gpu_mb": 60.4, "lights": 2 }
    },
    "village": {
      "file": "hollowmere_walk.glb",
      "bytes": 38722620,
      "sha256": "5ce425a22457f02fd72f16b2900d07c283b21bd93470d2b42b5473bc8487f923",
      "kind": "section", "scene": "overworld", "name": "HollowMere village and outskirts", "indoor": false, "baked": false,
      "walk_region_xy": [-112, -40, 206, 142],
      "look": { "wdi_exposure": 2.378414230005442, "fog_color": [0.026, 0.034, 0.058], "fog_density": 0.006 },
      "spawns": [
        { "id": "overworld_widow", "label": "Outside the widow's cottage (Village doors)", "name": "Outside the widow's cottage", "group": "Village doors", "position": [-31.35, 0.035173, -5.25], "yaw_deg": -90.000008 },
        { "id": "square", "label": "Square (The square)", "name": "Square", "group": "The square", "position": [8.4, 0.050061, 3.6], "yaw_deg": 53.300011 }
      ],
      "portals": [
        { "id": "ovforest_gate", "portal_id": "ov.forest_gate", "position": [0.749995, 0.000313, -29.260107], "to": "forest", "toSpawn": "gate", "kind": "forest_gate", "target_area": null },
        { "id": "ovwidow", "portal_id": "ov.widow", "position": [-32.566868, -0.000712, -5.25], "to": "widow_parlour", "toSpawn": "door", "kind": "door", "target_area": null }
      ],
      "stats": { "triangles_loaded": 4053662, "triangles_collision": 148000, "draw_calls": 247, "instanced_groups": 87, "images": 202, "texture_gpu_mb": 254.7, "lights": 24 }
    }
  },
  "scenes": { "overworld": ["village"], "widow_bedroom": ["room_widow_bedroom"] },
  "seams": [],
  "pending": ["apoth_shop", "bakery", "barn", "cellar", "chapel", "cottage_fisher", "forest", "manor_hall", "tavern_bar", "widow_parlour"]
}
```

Today's two files have no seam and no door that leads from one into the other: the widow's cottage door leads to
`widow_parlour`, which is not built, and so does the bedroom's door. These lines are from the test world's index
(`tools/blender/walk_areas/fixture/areas/walk-index.json`) and show a seam, one of its portal points and the arrival
spawn that faces it:

```json
{ "id": "west_east", "kind": "gate", "width_m": 5, "a": "village_west", "b": "village_east", "portals": 3, "opening_xy": [[0, -2.5], [0, 2.5]], "normal_xy": [1, 0] }
{ "id": "seam_west_east_a_2", "portal_id": "seam_west_east_a_2", "position": [-0.45, 0, 0], "to": "overworld", "toSpawn": "seam_west_east_b_2", "kind": "gate", "target_area": "village_east", "seam": "west_east" }
{ "id": "overworld_seam_west_east_a_2", "label": "East gate, arrival 2 (Village west)", "name": "East gate, arrival 2", "group": "Village west", "position": [-1.65, 0, 0], "yaw_deg": 90, "picker": false }
```

And these show the caves of the test world (version 1.1): the cave seam, a point of its row, the cave mouth's portal
in `village_east`, the arrival it leads to in `under_a`, a cave's entry (its size, hash, spawns, portals and counts
left out), and the field `walk_scenes`, which comes last in the index:

```json
{ "id": "a_b", "kind": "passage", "width_m": 2.4, "a": "under_a", "b": "under_b", "portals": 2, "opening_xy": [[32, -11.2], [32, -8.8]], "normal_xy": [1, 0] }
{ "id": "seam_a_b_a_2", "portal_id": "seam_a_b_a_2", "position": [31.55, -10, 9.4], "to": "undermere", "toSpawn": "seam_a_b_b_2", "kind": "gate", "target_area": "under_b", "seam": "a_b" }
{ "id": "umeast_in", "portal_id": "um.east_in", "position": [20, 0, 12], "to": "undermere", "toSpawn": "mouth_east", "kind": "cave_mouth", "target_area": "under_a" }
{ "id": "undermere_mouth_east", "label": "East cave mouth (The Undermere)", "name": "East cave mouth", "group": "The Undermere", "position": [22, -10, 10], "yaw_deg": -90 }
"under_a": { "file": "walk-under_a.gltf", "kind": "cave", "scene": "undermere", "name": "The Undermere, mouth passage", "indoor": true, "baked": true, "walk_region_xy": [20, -11.2, 32, -8.8], "look": { "wdi_exposure": 4, "fog_color": "#12141C", "fog_density": 0.05 } }
"walk_scenes": { "undermere": { "name": "The Undermere", "kind": "cave", "area_prefix": "under_", "portal_ns": "um" } }
```

## 4. The area file

Standard glTF 2.0 in a `.glb`, Y up, metres, as the exporter writes today.

**Nodes.**

- The file holds one glTF scene. The scene has two root nodes and no others: `Area_<areaId>` and
  `HM_Collision_<areaId>`.
- The scene's own extras carry no fog and no exposure: none of `fog_color`, `fog_density`, `fog_near`, `fog_far`,
  `wdi_exposure` (nor `tone_mapping_exposure`, `toneMappingExposure`, `exposure`, which the viewer also reads). An
  area's look is on its Area node. Why, for fog: the viewer reads fog from the scene for the whole file, and with it
  paints a flat background and hides the sky dome (`world.ts` line 161, `main.ts` lines 121-123; read in the source,
  not run). An exposure on the scene is harmless while the Area has its own, which it must have: the viewer reads the
  Area's first and the scene's only when the Area has none (`main.ts` lines 125-126). Keeping both off the scene is a
  precaution. Today's village scene carries only `wdi_tile_m`, the bedroom's nothing (measured).
- `Area_<areaId>` carries no transform. Everything drawn, every light, every spawn and every portal is under it.
  No other node in the file is named `Area_...`.
- A village section holds no directional light. The viewer adds the look's moon and sky light only to a file that
  has no directional light of its own (`main.ts` line 154), so one section with a sun would be lit differently from
  its neighbours. Today's village holds 24 point lights and no directional one (measured). A cave holds none either:
  it is lit by its bake, and the caves carry one look (below).
- `HM_Collision_<areaId>` is one mesh with one primitive, in the file's own coordinates: no transform, no children, no
  material, extra `wdi_collision: true` (measured: both of today's collision meshes have one primitive; a second one
  fails `<area>.reserved_names`, section 2). The viewer hides it and collides only with it. No other node is named
  `HM_Collision...`.
- **The edge of a village section is closed.** The whole edge of its walk region (the rectangle `wdi_walk_region`, or
  the outline `wdi_walk_polygon` when the Area has one) is closed by collision at least 3 m above the ground, with the
  wall's face toward the player on the edge, within 0.3 m of it (the walker's radius). The seam walls of section 6 are
  part of this edge. Why: through a gap the player walks off the edge into the void, falls until 25 m below the lowest
  point of the collision mesh, and is then put back at the spawn (`killDepth`, `config.ts` line 38; `controller.ts`
  line 65; `main.ts` lines 220-221; read in the source, not run). Details follow the list.
- `Spawn_<id>` nodes are empties at ground level, or a few centimetres above it, that look along their own -Z; the
  eye is 1.6 m above them (the viewer's README).
- `Portal_<id>` nodes are empties on the ground.

**The closed edge, in detail.** Both checkers test it, on collision that is not Draco-compressed (the test world), as
`<area>.edge_closed`. Every 0.25 m along the edge a ray finds the ground 0.5 m inside it (the first surface a ray meets
going down from the top of the collision mesh), and four rays at 0.25, 1, 2 and 2.95 m above that ground go outward;
each must meet a wall 0.2 to 0.8 m from where it starts. Places within 0.3 m of a corner of the outline are left out:
there a ray's start can lie inside the thickness of the next wall, and a gap that close to a corner is narrower than
the walker. Real collision is Draco-compressed, so for real files the exporter's check in Blender has to do this; it
is not written yet (section 11).

- A section whose ground is not the whole rectangle (an oblique cut, a cut corner) has to write `wdi_walk_polygon`: the
  rule follows the outline, and without one it holds the walls to the rectangle. The test world has both: the variants
  `polygon_chamfer` (a cut corner with a diagonal wall on the outline passes) and `chamfer_open` (the same without the
  wall fails).
- Ground that falls toward a wall by more than 1 m in 10 makes a wall of exactly 3 m fail, because the rays are
  measured from the ground 0.5 m inside the edge. Measured on altered copies of the test world (not kept) with the
  ground falling 9 %, 11 % and 12 % toward the south wall: 9 % passes; 11 % and 12 % fail with 3 m walls and pass with
  4.5 m walls. Such a wall has to be higher.
- The ground for a sample is the first collision surface the ray meets going down, so anything the walker can stand
  on there (a kerb, a step, a flat stone, a rock or trunk shell) counts as the ground, and the wall must reach 3 m
  above it. Measured on altered copies of the test world with both checkers: a feature 0.10 m high on the strip 0.5 m
  inside the edge makes an edge wall of exactly 3.0 m fail at the 4 places it covers ("2.95 m above the ground: no
  wall within 3 m"); so do features of 0.20, 0.35 and 1.0 m and a 5 m box (a feature of 0.04 m passes a 3.0 m wall,
  0.06 m fails it). A wall of H metres passes a feature of up to H - 2.95 m (measured: 4.0 m walls pass 1.04 m and
  fail 1.06 m). Build edge walls well above 3 m (4 m passes anything up to about 1 m) or keep such things off the
  0.5 m strip. The same holds under a seam's portal row: a sill there counts as the ground for the seam-wall check.
- A room or a wild area is not held to this rule: its walls are its own, and its walk region can be looser than they
  are.
- A cave is not held to this rule by the checkers here. The rule takes the first surface a ray meets going down from
  the top of the collision mesh for the ground, and in a cave that is the roof. That a cave cannot be walked out of
  is a check of the cave builder in Blender (not written yet, section 11). What the checkers do hold a cave to: every
  spawn and portal stands on ground found by a ray from 1 m above it (`<area>.stand_on_ground`, as everywhere), and
  its seams (section 6).
- Run once, with a throwaway script that is not kept, on today's village collision (148,000 triangles, decoded from its
  Draco data) as if the unsplit village were one section: the village already closes its walk region with four quads on
  the region's edge (x = -112 and 206, y = -40 and 142), each rising from -30 m to 90 m. The rule found 3,991 of 3,992
  places closed; the other has an object across the edge, whose face is 0.31 m inside it. The whole run, parsing
  included, took about 2 s in Python and 0.7 s in JavaScript. The village is not a section, so this says how the rule
  behaves on a real mesh, not that the village passes.

**Extras of the Area node.** All are required unless marked.

| Extra | Value | Read by |
|---|---|---|
| `wdi_area` | the area id | tools |
| `wdi_kind` | `section`, `room`, `wild` or `cave` | tools, the index |
| `wdi_scene` | the scene id: `overworld` for a village section, the scene id for a room or a wild area, the walk-only scene for a cave (`undermere`) | tools, the index |
| `wdi_name` | plain words | the index |
| `wdi_walk_region` | `[x0, y0, x1, y1]` in Blender metres, in the file's own coordinates. It holds every spawn and every portal of the file, those on its edge too; in a room and a wild area it also holds the origin (0, 0) | tools, the index |
| `wdi_walk_polygon` | optional: the outline when the walkable ground is not the whole rectangle. Three or more points in Blender metres, written as a flat list `[x0, y0, x1, y1, ...]`, or as a JSON string of that list or of a list of pairs; a list of `[x, y]` pairs is read too (note below the table) | tools, the index |
| `wdi_exposure` | a number above 0 | the viewer |
| `fog_color` with `fog_density` (or with `fog_near` and `fog_far`) | outdoors, and in every cave | the viewer |
| `wdi_indoor: true` | rooms, every cave, and a wild area that is indoors; never on a village section | the viewer |
| `wdi_baked` | optional: `true` when the light is baked into vertex colours. The viewer switches off every light of such an Area (`world.ts`, `switchOffBakedLights`), so on a village section and a cave it is part of the look (section 6). Required, and `true`, on a cave | the viewer, the seam check |

**Why the outline has more than one form.** Today's exporter writes lists of numbers as lists (`wdi_walk_region` and
`wdi_offset` in the village's Area) and nested data as a JSON string (`wdi_look_json` in the same Area); both measured.
Whether a Blender custom property can hold a list of lists was not tried here. So the outline is written flat or as a
string, and a writer that is not Blender may write pairs. The index always lists it as `[[x, y], ...]` in
`walk_polygon_xy`, whatever form the file used.

`wdi_kind` has another meaning on other nodes. There it is the exporter's class of a model (`building`, `kit`,
`prop`, `vehicle`; measured: 131 nodes of today's village and 3 of the bedroom carry it, and the exporter reads it).
That is not this extra and stays as it is. Only the Area node's `wdi_kind` says `section`, `room`, `wild` or `cave`,
and the tools read it nowhere else.

Other extras the files carry today (`wdi_look`, `wdi_look_json`, `wdi_light_mode`, `wdi_k`, `wdi_color0`,
`wdi_offset`) may stay. Nothing in this contract reads them. There is no offset or origin field any more.

**A cave** (version 1.1) is an area of a walk-only scene: `wdi_kind: "cave"`, `wdi_scene` the walk-only scene, its id
the scene's area prefix and a key (`under_<key>`). What it carries, and why:

- `wdi_indoor: true` and `wdi_baked: true`, both required (`<area>.area_extras`). Indoors the viewer draws no moon,
  sky light or sky dome (`world.ts`, `areaLook`; `main.ts` lines 121-124); without `wdi_indoor` a cave would show the
  moon (the variant `cave_not_indoor`). Baked, the viewer switches off the cave's own lights and its light is in its
  vertex colours, as in a baked room.
- Fog in its Area's extras, like any area that is not a room: `fog_color` and `fog_density` (or `fog_near` and
  `fog_far`). The fog colour is meant to be the ink, `#12141C` (a colour string, which the viewer reads with three's
  `Color`, is one way to write it); the checkers test that the fog is there, not its colour.
- **One look for every cave.** Every cave of an index carries the same `wdi_exposure`, the same fog and the same
  `wdi_baked`, the same JSON values exactly: the network is one place to the eye, and its seams need it. A cave whose
  look differs from another cave's fails `world.cave_look`, whether or not the two share a seam (the variant
  `cave_look_differs`). The look may differ across a cave mouth: the walk fades there (section 5).
- No directional light (`<area>.no_directional_light`), and the Area node carries no transform, as every Area.
- **The village frame.** A cave is built in the village's coordinates (x east, y north, z up), below the ground, so
  that a seam between two caves is at the same place in both files. Its walk region need not hold the origin (0, 0)
  (that rule is for rooms and wild areas), and caves may lie over one another in different files: the valid variant
  `cave_stacked_levels` puts a cave 6 m under another, its mouth's portal and arrival at the same places in plan.
- In a cave, as in a village section, every spawn stands more than 1 m from every portal of its file (section 5).

**Extras of spawns and portals.**

| Node | Extra | Value |
|---|---|---|
| spawn | `wdi_spawn`, `wdi_district` | required: the picker's words and the district it groups by |
| spawn | `wdi_picker: false` | on a spawn that is only an arrival (every seam arrival); left out otherwise |
| spawn | `wdi_facing_deg` and the rest | as today; informational |
| portal | `to`, `toSpawn` | required: a scene id (a game scene id or a walk-only one) and a spawn id within that scene. The viewer skips a portal without them. |
| portal | `kind` | required: the game's portal kind (`door`, `hatch`, `forest_gate` ...); `gate` on every seam portal, the village's and the caves'; `cave_mouth` on both portals of a cave mouth |
| portal | `wdi_portal_id` | required: the node's name without `Portal_`, with its dot |
| seam portal | `wdi_seam`, `wdi_seam_kind`, `wdi_width_m` | section 6 |

A game portal that has no target is not written as a node. The game's scene `sea_exit` has one (`se.sea`, with `to` and
`toSpawn` null, measured in `packages/content/data/scenes`); the viewer would skip a node without them, and
`walk_index.py` fails it (`<area>.portal_extras`).

**Extensions.** A file may require only the extensions on an allow-list that this contract chooses. It is not the list
of what the viewer's loader reads: three.js's `GLTFLoader` reads more (r160, `GLTFLoader.js` lines 489 to 511: clearcoat,
ior, sheen, specular, transmission, iridescence, anisotropy, volume, `EXT_materials_bump` and `EXT_texture_avif`), and
for an extension that a file requires and it does not know it only prints a warning (line 419). The viewer pins three
0.186.1; r160 is the copy that was read. Both checkers hold the allow-list (`EXTENSIONS_ALLOWED`, in `walk_index.py`
and in `check_areas.mjs`), ten names:

- the six the viewer's README names: `KHR_draco_mesh_compression`, `EXT_texture_webp`, `KHR_texture_transform`,
  `KHR_lights_punctual`, `EXT_mesh_gpu_instancing`, `KHR_materials_emissive_strength`;
- `KHR_materials_unlit`, which a baked room is written with (the viewer's README says so);
- three that no file uses today: `EXT_meshopt_compression` and `KHR_texture_basisu`, whose decoders the viewer's
  `load.ts` sets up (lines 24-28), and `KHR_mesh_quantization`, which three.js reads with no decoder (read in
  r160's GLTFLoader).

Requiring any other extension is a failure (`<area>.extensions`); using one that is not on the list is a note. To allow
another one, add its name in one line of each checker and one line here, once the viewer's author has tried a file that
needs it. Measured: today's village requires the first four and also uses the fifth and sixth; today's room requires
three of the first four and uses unlit.

**Coordinates.** A file's coordinates are its own, and the Area node sits at the file's origin.

- Village sections all use the village's coordinates as they are today. Nothing is moved when the village is cut:
  a point on a seam has the same coordinates in both files. Caves use the village's coordinates too, below the
  ground, for the same reason (above).
- A room and a wild area are built around their own origin: the origin lies on the ground the player can walk. The
  far-grid slots of the single-file form (3,000 m and more out, 600 m apart) are not used for separate files. The
  checkers fail an Area node that carries a transform (`<area>.area_at_origin`), and a room or a wild area whose
  `wdi_walk_region` does not hold the point (0, 0) (`<area>.origin_in_walk_region`). The second rule is what
  catches a room whose contents were moved to a slot with no transform on any node. When the region lies around a
  slot they add a note that says so.
- Heights are part of the coordinates. Two sections put the ground at a seam at the same height (section 6).

**What a file draws beyond its own walkable ground** (lower-detail scenery of its neighbours, so that no void shows)
is the exporter's business. It is not a loader rule: the viewer draws what the file holds. It does count against the
planning targets of section 9. The cheaper versions come from the exporter's existing far tiers (the 256 px far
textures, `TEX_FAR`, line 386, and the decimated far meshes, whose names end `walk_far`, line 2376, both in
`tools/blender/meshy_walk_export.py` at the two commits named at the top), made from the same Meshy models and
textures. No Meshy model or texture is replaced by another, or dropped, to save size.

**The legacy single file.** The unsplit village stays valid as a single file opened with `?glb=`. In that mode
everything of today stays legal: several Areas in one file, rooms on far-grid slots, the viewer's nearest-origin
rule, the bare-id fallback, the unsuffixed `HM_Collision`. `walk_index.py --legacy` also accepts today's two files in
an index and prints each difference as a warning. The legacy village may hold cave mouths (`Portal_um.<gate>_in` and
`Spawn_overworld_mouth_<gate>`): in the interim world of section 11 cave files can stand in the index beside it. The
accepted differences, measured on the two files:

| | The contract | `hollowmere_walk.glb` today | `rooms/widow_bedroom.glb` today |
|---|---|---|---|
| File name | `walk-<areaId>.glb` | `hollowmere_walk.glb` | `widow_bedroom.glb` |
| Area id | `village_<key>` | `village` | `room_widow_bedroom` (fits) |
| Collision node | `HM_Collision_<areaId>` | `HM_Collision` | `HM_Collision_room_widow_bedroom` (fits) |
| Area extras that are missing | none | `wdi_kind`, `wdi_scene` | `wdi_area`, `wdi_kind`, `wdi_walk_region` |
| Folder | one folder for all | `tools/blender/build/` | `tools/blender/build/rooms/` |

Everything else the checkers test passes on both files as they are.

## 5. Portals, and how a target is found

A portal's extras are `{to, toSpawn, kind}`, as today. `to` is always a **scene id**, never an area id: a game scene
id (`overworld`, `widow_bedroom`, `forest`) or a walk-only scene id (`undermere`). A walk-only scene is looked up
exactly as a game scene is.

With an index, the target is found in one way only:

```
exact = to + "_" + toSpawn            for example  widow_bedroom + door  ->  widow_bedroom_door
look for the spawn id "exact" in the spawns of every area of the index

  it is in the area that is loaded   ->  move the player there, as today
  it is in another area              ->  cross to that area's file (section 7), arrive at that spawn
  it is in no area                   ->  say "<to, in plain words> is not built yet"; the player stays
```

The bare `toSpawn` is never tried with an index. Today's viewer tries it when the exact id is missing; that fallback
stays in single-file mode only. Why: across files it finds the wrong spawn. In the test world the shop's way out asks
for `overworld` + `shop_door`, and the shop's own spawn is `shop_door`; the viewer's `resolvePortal`, given only the
loaded file, sends the player back to the shop's own spawn (measured, a `CTRL` line of `check_areas.mjs`). In today's
two real files no portal's bare `toSpawn` equals any spawn id (measured: 0 of 13 portals), so the trap is not sprung
there yet.

What the checkers require of every portal: the exact id exists in exactly one area and that area's scene is `to`; or
`to` is listed under `pending`. `pending` may hold a game scene id or a walk-only one (the noted variant
`gate_pending`: a cave mouth leads into `undermere` before any cave file exists, and the viewer says "Undermere is not
built yet"). With `--scene-ids`, `walk_index.py` also requires `to` to be a game scene id or a walk-only scene id. When
`to` is a scene that is built, or a scene that is in no file and not listed under `pending`, a target that exists
only by its bare id is a failure. When `to` is pending it is no fault, even if a spawn
of another scene has the bare id: with an index the viewer says "... is not built yet" and never looks at the bare id.
Both checkers print the note `world.bare_id_hazard` for such a portal, and for any portal whose exact target exists
beside a spawn with the same bare id, because a loader that fell back to the bare id would go wrong there.

Example, real ids. `Portal_ov.widow` in the village has `to: widow_parlour`, `toSpawn: door`. The exact id
`widow_parlour_door` is in no file today, `widow_parlour` is pending, and the viewer says "Widow parlour is not built
yet". When the parlour is exported as `walk-room_widow_parlour.glb` holding `Spawn_widow_parlour_door`, the same portal
works with no change to the village file: only the index is rebuilt.

A second real case, for the rule about pending scenes. The game's scene `bp_mill` has the portal `bs.door` with
`to: bp_camp`, `toSpawn: mill` (measured in `packages/content/data/scenes`), and today's village has the spawn
`Spawn_mill`. The day `bp_mill` is exported as a room before `bp_camp` is built, `bs.door` leads into a pending scene:
the viewer says "Bp camp is not built yet", and the checkers pass it and print the note. They do not fail it because a
spawn of the village happens to be called `mill`. The test world has the same case as the variant `pending_bare_id`.

A third real case, of the other kind: the exact target exists, and a spawn with the same bare id stands in another
file. The game's scene `forest` has the portal `fo.gate` with `to: overworld`, `toSpawn: forest_gate`, and the
forest's own spawn `gate` has the id `forest_gate` (measured in `packages/content/data/scenes`); the village has the
spawn `overworld_forest_gate`. Today's two real files have no such pair; the forest will. With an index the exact id
`overworld_forest_gate` is found in the village and the bare id is never tried. A loader that fell back to the bare
id would leave the player in the forest, which is what single-file mode does when the forest's file is opened
alone (section 8). Both checkers print the note `world.bare_id_hazard` for it.

**Cave mouths** (version 1.1). The caves are reached from the village by their mouths, the surface gates: four are
planned, in The West Woods, Up the Line and the North Woods, The East Hills and Mill Lane. A mouth is an ordinary
door-like portal between two scenes, never a seam. For the gate `<gate>` (lower-case words, for example `east`):

| | In the village (a section, or the legacy village file) | In a cave |
|---|---|---|
| The portal | `Portal_um.<gate>_in` | `Portal_um.<gate>_out` |
| Its extras | `to: undermere`, `toSpawn: mouth_<gate>`, `kind: cave_mouth` | `to: overworld`, `toSpawn: mouth_<gate>`, `kind: cave_mouth` |
| Where the other one arrives | `Spawn_overworld_mouth_<gate>` | `Spawn_undermere_mouth_<gate>` |

- `um` is the `portal_ns` of `undermere` in `walk_scenes.json`. The namespace `um.` is the walk's own: the game does
  not use it, and in the walk it holds only mouths.
- **Every crossing between the village and the caves is a mouth**, both ways: a portal of a village area that leads
  into `undermere`, and a portal of a cave that leads into `overworld`, must be one (`world.cave_mouths`, in both
  checkers, printed when the folder has a mouth or a cave). A crossing between two caves is a seam (section 6). A door
  between a cave and a room or a wild area is not described here and not forbidden.
- The two sides of a mouth may differ in look: the walk fades between them, as at any door.
- Each arrival is an ordinary spawn of its file: more than 1 m from every portal of the file, in the village and in a
  cave (below). It faces away from its mouth, into the place the walker arrives in.
- A mouth's `_in` may stand in today's legacy village file as well as in a section file later.
- In the test world: `Portal_um.east_in` at (20, -12) in `village_east` leads to `Spawn_undermere_mouth_east`
  (22, -10) in `under_a`, which looks east into the cave, 1.5 m from `Portal_um.east_out` (20.5, -10); that one leads
  back to `Spawn_overworld_mouth_east` (20, -10.5), which looks north, 1.5 m from `Portal_um.east_in`.

**Where spawns stand near portals.** The viewer fires a portal when the player walks within 1 m of it on the ground
plan (and within 2 m of height), once the player has been outside every portal's radius since the last trip; or on
the use key within 2 m (`apps/walk/src/portals.ts`, `PortalTrigger`). A player who arrives inside a radius finds
the walk-in trigger off, for every portal of the file, until they have stepped out of all the radii; and the door
prompt names the nearest portal within 2 m. "Near" below is the viewer's own measure: the distance on the ground
plan, between things no more than 2 m apart in height. So:

- **In a village section and in a cave every spawn stands more than 1.0 m from every portal of its file.** 1.0 m or
  less is a failure (`<area>.spawn_clear_of_portals`; the variant `cave_spawn_near_portal` puts a cave mouth's arrival
  0.8 m from the mouth's other portal). It is the exporter's own rule (`PORTAL_SPAWN_M`,
  `tools/blender/meshy_walk_export.py` line 265; a spawn that stands closer is moved out to 1.2 m, `SPAWN_CLEAR_M`,
  line 266), with one difference at the edge: the exporter tests `< 1.0`, while the viewer's trigger counts a player
  at exactly 1.0 m as inside (`portals.ts`, `nearest`), and so do the checkers. Measured in today's village: the
  nearest pair is 1.19 m apart.
- **A seam arrival stands at least 1.2 m from every portal of its file**, its return row and any door alike
  (section 6), so the trigger is ready at once.
- In a room or a wild area an arrival may stand inside a radius. It then stays quiet until the player steps out and
  back. Measured: today's bedroom spawn is 0.50 m from its door portal. The checkers print a note
  (`<area>.spawn_inside_portal_radius`), not a failure.

**Two notes about ways in and out.** Neither is a failure; both checkers print them.

- `<area>.no_way_in`: no portal of another area leads into this area, so the player reaches it only through the
  picker or a link that names one of its spawns. The area the viewer starts in is left out. With today's two files
  the bedroom gets this note: the parlour that leads to it is not built.
- `<area>.way_back`: the way out of a room, a wild area or a cave arrives in another file than the door that leads in,
  or more than 10 m from that door. The player would come out somewhere else than they went in. A way out is a portal
  that leaves its scene: a room's door, or a cave mouth's `_out`; a seam stays in its scene and is none (version 1.1
  adds the caves). Measured on an altered copy of the test world (not kept): with `Spawn_overworld_mouth_east` moved
  30 m from its mouth, both checkers print `under_a.way_back`. 10 m is a choice made for this contract. Measured on
  today's village: each of its twelve doors `Portal_ov.<x>` stands 1.19 to 7.76 m from
  `Spawn_overworld_<x>`, the spawn the game's scene data makes the room's way out arrive at (the two front doors,
  of the manor and of the tavern, are the far ones: 7.76 and 7.63 m). Two other exits in the scene data arrive
  somewhere else on purpose: the barn's loft drop at `overworld_barn_loft_drop`, 12.5 m from the barn's door, and the
  forest's log at `overworld_forest_back`, 42.0 m from the forest gate (measured the same way). When those scenes are
  built the note will name them. It is a note, and these two are meant.

## 6. Seams, exactly

A seam joins two sections of one sectioned scene: two village sections, which belong to the scene `overworld`, or
(version 1.1) two caves of one walk-only scene, `undermere`. A seam portal's `to` is that scene: `overworld` at a
village seam, `undermere` at a cave seam. A crossing between two sections of one scene is always a seam; the checkers
fail any other portal that leads from one into another (`world.seams_only_between_sections`, in both checkers since
version 1.1; the variant `cave_door_between_caves`). A cave never seams to a village section: they belong to
different scenes, and the checkers fail such a seam (`seam.<id>.sides`). A portal between the village and a room or
a wild area is an ordinary portal (section 5), and so is a cave mouth. Seam ids are one namespace for the whole index,
caves and village alike.

Everything below holds for a cave seam as for a village seam, with the same numbers, except the height of the wall
(the first point under "In each file") and the list of devices (`wdi_seam_kind`).

**The seam line and the two sides.** A seam has one straight line in village coordinates, the same in both files, and
an **opening** on it, `wdi_width_m` wide. One section is side `a`, the other side `b`; the letter says which file a
node stands in. The opening is the gap the player can see and walk up to. `wdi_width_m` declares its width, and no
checker here can measure it: they see collision and empties, not what is drawn, and the wall is closed in any case.
The exporter measures the gap and writes the number.

**In each file:**

1. A **closed collision wall** stands across the whole opening, at least 3 m high: 3 m above whatever the walker can
   stand on there (section 4). Where the ground slopes along the opening that means 3 m above the ground at every
   place, not 3 m above its lowest place. The wall's face
   toward the player is on the seam line. (Its thickness lies beyond the line, on ground this file's player never
   reaches.) The wall is part of `HM_Collision_<areaId>`. What the player sees there, a closed gate or a cutting,
   is up to the design. The rest of the section's edge is closed as well (section 4).
   **In a cave** the wall closes the passage's whole cross-section, from the floor to the roof. The roof above the row
   must be found (a ray goes up from the floor under each sample of the row), and rays at 0.25, 1 and 2 m above the
   floor (those that are under the roof) and one 0.1 m under the roof must meet the wall 0.45 m in front of the row.
   The village's "3 m above anything the walker can stand on" does not apply in a roofed passage: the test world's
   passage is 2.6 m high. A wall that stops short of the roof fails (the variant `cave_seam_open_roof`: a wall 0.3 m
   short fails at the 10 rays 0.1 m under the roof). What closes a cave seam in the picture is up to the design too:
   a passage, an arch, a mine door, a bend, a squeeze, a choke, a curtain of flowstone or ice, a sump ledge.
2. A **row of portal points** stands 0.45 m in front of the wall, on a line parallel to it:
   `Portal_seam_<seamId>_<side>_<n>`, numbered from 1 along the row, in the same direction in both files, so that
   point `a_2` faces point `b_2`. An opening up to 2 m wide may have one point. A wider opening has a row: neighbours
   at most 1.8 m apart, the row centred on the opening, the first and last point at most 1.0 m from its ends.
3. An **arrival spawn** stands behind each portal point, 1.65 m inside the wall and so 1.2 m behind its own row:
   `Spawn_<scene>_seam_<seamId>_<side>_<n>` (`Spawn_overworld_seam_...` in the village, `Spawn_undermere_seam_...` in
   a cave), with `wdi_picker: false` and the usual picker words. It faces away from the wall: the direction of travel
   of the walker who arrives there.
4. **Nothing else stands near.** Every arrival is at least 1.2 m from every portal of its file, a door or another
   seam as much as its own row. And no portal that is not of this seam's row stands within 2.0 m of a point of the
   row, so that no other 1 m disc reaches into the row's discs. Why: a door 0.6 m from an arrival keeps the viewer's
   trigger off when the walker arrives, so that walking straight back to the gate fires nothing; and from the other
   side the door fires before the gate at 39 of 89 places across a 5 m opening (measured with the viewer's own
   `PortalTrigger` by `check_areas.mjs` on the variant `arrival_near_door`).

**Across the two files:**

- The two rows are 0.9 m apart and point `a_n` faces point `b_n`.
- **The ground is at the same height on both sides.** Each file's ground, carried to the seam line from its portal
  point and the arrival behind it, is at the same height within 0.15 m. Village sections and caves share the village's
  coordinates, heights too; a section exported 0.5 m higher than its neighbour keeps every position in plan right
  and still shows a 0.5 m step at the crossing (the variant `seam_step`). A ramp across the seam is no step: in the
  valid variant `cave_seam_ramp` the floor of both caves rises 6 % across the cave seam, so the two rows stand 0.05 m
  apart in height and the arrivals 0.20 m (measured), and both files put the floor at the line at the same height.
- The look is equal (below).

**What happens.** A walker in section a comes within 1 m of `Portal_seam_<id>_a_2`. Its target is the spawn
`overworld_seam_<id>_b_2` (at a cave seam `undermere_seam_<id>_b_2`), which stands in section b. The viewer fades,
opens b, and puts the walker there: 2.1 m beyond the point they left by, looking the way the arrival faces. Two
things the walker can notice. The point that fires is the nearest one, and the arrival stands behind that point, not
behind the walker: a walker who crosses between two points is moved sideways by up to 0.9 m (measured: at most
0.90 m over 89 places across the 5 m opening of the test world; at most 0.60 m over 37 places across the 2.4 m cave
seam). And the walker is turned to the arrival's facing, straight across the seam, whatever way they were looking
(`goTo` sets the yaw, `main.ts` line 96).

```
 plan view, the seam line running up the page; x marks a portal point, S an arrival spawn, < > the way it faces

        side a  (walk-village_west)              |              side b  (walk-village_east)
                                                 |
        S_a_3 <           x Portal_a_3     ######|######     x Portal_b_3           > S_b_3     ^
                                           ######|######                                        |  opening,
        S_a_2 <           x Portal_a_2     ######|######     x Portal_b_2           > S_b_2     |  wdi_width_m
                                           ######|######                                        |  (5 m here)
        S_a_1 <           x Portal_a_1     ######|######     x Portal_b_1           > S_b_1     v
                                                 |
          |<---- 1.20 m ---->|<--- 0.45 m ------>|<------ 0.45 m --->|<---- 1.20 m ---->|
          |<------------ 1.65 m ---------------->|<--------------- 1.65 m ------------->|
                             |<------------------------ 2.10 m ------------------------>|
                              from Portal_a_2 to S_b_2: where a walker from a to b lands

 ###### left of the line is the wall of file b; ###### right of the line is the wall of file a.
 Each file holds only its own wall, its own row and its own arrivals.
```

**The numbers.**

| Number | Rule | Where it comes from |
|---|---|---|
| 1 m | the viewer's walk-in radius around a portal point | `apps/walk/src/portals.ts`, `PortalTrigger` (read) |
| 0.45 m | a seam portal stands this far in front of its file's wall, within 0.05 m | the exporter's distance of a door portal from its building (`PORTAL_OUT_M`, `tools/blender/meshy_walk_export.py` line 248), taken over for seams |
| 3 m | in the village, the wall is at least this high above the ground, across the whole opening | decided |
| 0.1 m | in a cave, the wall closes the passage up to this far under the roof; rays at 0.25, 1 and 2 m above the floor (those under the roof) as well | decided on 2026-11-19 |
| 1.8 m | neighbours in a row are at most this far apart | decided; see the arithmetic below |
| 1.0 m | the first and last point are at most this far from the ends of the opening | follows from "wider than 2 m needs a row" |
| 1.65 m | an arrival stands this far inside its file's wall, within 0.05 m | decided |
| 2.1 m | so the arrival is this far beyond the departure portal, within 0.05 m | 0.45 + 1.65 |
| 0.1 m | the arrival is at the same sideways place as the departure portal, within this | decided |
| 15 degrees | the arrival faces the direction of travel, within this | decided |
| 1.2 m | the arrival is at least this far from every portal of its file: the return row, any door, any other seam | 1.65 - 0.45; more than the 1 m radius, so the trigger is ready at once; the exporter's own spawn clearance (`SPAWN_CLEAR_M`, `tools/blender/meshy_walk_export.py` line 266) |
| 2.0 m | no portal outside a seam's row stands closer than this to a point of the row | twice the 1 m radius: two discs that do not overlap |
| 0.15 m | the two files put the ground at the seam line at the same height, within this | decided on 2026-11-16; under half the viewer's step height of 0.35 m (`apps/walk/src/config.ts` line 20) |
| 0.9 m | the most a walker is moved sideways at a crossing | half of 1.8 m; measured: 0.90 m at the worst of 89 places |
| 3.1 m | the step the fade hides | measured in the checker's journey: the trigger fired 1.44 m before the line and the walker arrived 1.65 m beyond it |

Why 1.8 m. The walker is a capsule of radius 0.3 m (`apps/walk/src/config.ts`), so it stops 0.3 m before the wall,
which is 0.15 m from the row. Halfway between two points 1.8 m apart it is 0.912 m from the nearer one: inside the 1 m
radius. At 2.0 m apart it would be 1.011 m away: outside. The radius stops covering the wall at 1.977 m apart
(arithmetic). The checkers fail a gap over 1.8 m. Measured with the viewer's own `PortalTrigger` on the test world: a
walker crossing a 5 m opening is taken through at 89 of 89 places, 5 cm apart, with three points 1.8 m apart, and at
39 of 89 with one point in the middle.

**Extras of a seam portal.**

| Extra | Value |
|---|---|
| `to` | the seam's scene: `overworld`, or for a cave seam the walk-only scene (`undermere`) |
| `toSpawn` | `seam_<seamId>_<otherSide>_<n>` |
| `kind` | `gate`, at a cave seam too |
| `wdi_portal_id` | `seam_<seamId>_<side>_<n>` (the node's name without `Portal_`) |
| `wdi_seam` | `<seamId>` |
| `wdi_seam_kind` | what the device is. Between village sections: `gate`, `level_crossing`, `footbridge`, `lychgate`, `stile`, `cutting` or `belt_gate`. Between caves: `passage`, `arch`, `mine_door`, `bend`, `squeeze`, `choke`, `curtain` (a flowstone or ice curtain) or `sump_ledge`. A cave device between village sections fails, and the other way round |
| `wdi_width_m` | the width of the opening, the same number on every portal of the seam; in a cave, the width of the passage where the wall closes it |

**The look.** `wdi_exposure`, `fog_color` and `fog_density` (or `fog_near`, `fog_far`), and `wdi_baked`, are equal on
both sides: equal in the two files' Area extras and equal in the index. Otherwise the picture changes at the crossing.
`wdi_baked` belongs to the look because the viewer switches off every light of an Area that says `true` (`world.ts`,
`switchOffBakedLights`): one baked side and one lit side would change the picture, with the exposure and the fog still
equal. Equal means the same JSON value, exactly: write both sections' looks from one value, because a difference of
1e-10 between two exports fails the seam (checked: 2.3784 against 2.3784000001). The look is more than these
extras. Neither file carries fog or exposure on
its glTF scene, and neither holds a directional light (section 4): either would change the picture on one side only,
with the Area extras still equal. Every cave carries one look besides (section 4, `world.cave_look`), so at a cave
seam the look is equal by that rule as well.

**Where the rules are stricter than the picture.** Four cases look the same in the viewer and still fail a rule, and
are left as they are rather than loosened: `fog_near` and `fog_far` written beside `fog_density` on one side (the
viewer uses the density when it is above 0 and ignores them); a fog colour written with a fourth number, which is not
equal to the same colour with three though the viewer reads only three; the same directional light in both sections
(a village section holds none, section 4); and a spawn exactly 1.000 m from a portal (section 5: the exporter's own
test accepts it, the viewer's trigger counts it as inside, and the checkers follow the viewer). A world that needs one
of them has to change the rule here and in both checkers.

**What the checkers test.** Names, numbering and extras; that the two rows are straight, 0.9 m apart and face each
other; spacing and coverage; each arrival's distance, sideways place and facing, and its distance from every portal
of its file; that no other portal stands within 2 m of a row; that the two files agree on the height of the ground
at the line; the look on both sides, `wdi_baked` included; and, when the collision mesh can be read, that rays from
the row meet the wall at 0.45 m across the whole opening up to 2.95 m above the ground under each ray (in a cave: from
0.25 m above the floor to 0.1 m under the roof, which must be found), that each arrival has the wall 1.65 m behind it,
and that the rest of a village section's edge is closed (section 4).
`check_areas.mjs` also runs the viewer's own `PortalTrigger`, holding every portal of the file as the viewer does: a
walker crossing the opening every 5 cm must be taken by a point of the row first, and a walker who has just arrived
and walks straight back to the wall must be taken by the return row.

What they cannot test. The wall check and the closed-edge check need triangles, so they run on the test world only:
real collision meshes are Draco-compressed, and for them they have to be exporter checks in Blender (for caves, checks
of the cave builder). The height rule
needs no triangles and runs on real files. The width of the opening is taken as declared (above); the tools do not
sample an opening wider than 100 m, which is a limit of the tools and not a rule of this contract.

## 7. What the viewer has to change

Line numbers are `apps/walk/src/` at commit `509df801` of `claude/v2-walk`. Hours are estimates worked out from reading
the viewer's source; nobody has timed them, and the viewer's author knows the code better.

### In both options

1. **Read the index.** Fetch `walk-index.json` (from `?index=` or the build's default) and accept it only when
   `format` is 1. Build a table from spawn id to area id. An area's address is the index's folder plus `file`; adding
   the first 8 characters of `sha256` as a query keeps a new export from mixing with a cached old file.
2. **Start.** The spawn is `?spawn=` when the index has that id, else the index's `start`. Open the file of the
   area that holds it. Then place the player with `pickSpawn(world.spawns, <that spawn id>)`. Line 158 of `main.ts`
   passes `params.get('spawn')` today; that is empty when the start came from the index, or names a spawn the index
   does not have, and `pickSpawn` would then fall back to `square`, or to the file's first spawn (`spawn.ts` lines
   38-47). Measured with the viewer's own `pickSpawn` on the test world: for a start at `overworld_shop_door` it
   gives `square`, and for a start at `overworld_seam_west_east_b_2` it gives `mill`. Today's two indexes both
   start at `square`, which hides it.
3. **Find a portal's target** as section 5 says: the exact id across the index, never the bare id. This replaces
   `resolvePortal(portal, world.spawns)` in `travel` (`main.ts` lines 130-141) and in the door prompt (line 228) when
   an index is in use. `resolvePortal` itself stays, for single-file mode.
4. **The picker.** List every spawn of the index, grouped by `group`, without those with `picker: false`. Choosing a
   spawn of another area is a crossing like any other.
5. **Ink, not black.** The fade layer and the indoor background use ink `#12141C` (today `#000` at `style.css` line
   168 and `Color(0, 0, 0)` at `main.ts` line 62). A loading label or bar must be drawn above the fade: today the
   loading panel is added to the page before the fade layer and has no stacking order of its own (`hud.ts` lines
   56-66, `style.css` lines 36-46 and 165-175), so the fade would cover it.
6. **One area in the scene.** Never two. Every area file sits at its own origin, so the viewer's nearest-origin rule
   (`world.ts` lines 56-73) cannot tell two of them apart. Measured on the test world (a `CTRL` line of
   `check_areas.mjs`): with all three areas in one scene it would show the wrong area at 9,600 of 9,600 sample points
   of each of the two village sections, and at none of the room's 144.
7. **The deploy.** See section 11: the Pages workflow fetches one file today.

### Option 0: no swap inside the page

At a crossing: fade to ink, then load the same page again with the arrival spawn in the address
(`?spawn=<arrival spawn id>`, plus `index=` if one was given, plus `debug` and `exposure` if they were set). The index
says which file holds that spawn, so the new page opens that file and starts there. Steps: the seven above, and a
few lines in `travel` that wait for the fade, call `location.assign` and leave the ink up.

- **Hours: about 11** (estimated: index and lookup 2.0, loading 0.5, world 0.25, fade and styles 1.0, `main.ts` 2.0,
  deploy 1.0, tests 3.0, README 1.0; total 10.75).
- **Nothing to dispose.** The old page goes away with everything it held.
- **Hazard: a cold load at every crossing.** The 38.7 MB village took 3.0 to 4.8 s to load cold in the exporter
  session's test page on an idle laptop (measured there; no phone was measured). A 15 MB section should parse in 0.9
  to 1.7 s at the 0.06 to 0.11 s per MB measured there, plus building the collision and the shaders and starting the
  page (estimated).
- **Hazard: a new click for mouse look on a desktop.** A page that unloads gives up the mouse. This is how browsers
  behave; it was not tested here. A game pad may also need one button press before the new page sees it (not tested).
- **Hazard: the old page lifts the ink too early.** `hud.fade` takes the fade away right after its callback
  (`hud.ts` lines 157-159: the callback, then `classList.remove('on')`). If the callback only calls
  `location.assign`, the old view comes back for the moment before the page unloads. The old page has to hold the
  ink until it is gone.
- **Hazard: the first paint.** The new page must start ink-coloured, with its loading label, or the crossing flashes.
  The page's own background is `#11131a` today (`style.css` line 20): a third colour beside `#000` and the ink
  `#12141C`.
- **Hazard: the Back button.** `location.assign` adds an entry to the browser's history at every crossing, so Back
  walks the player back through the crossings one by one; `location.replace` adds none. This is how browsers
  behave; it was not tested here.
- **Hazard: the old page may stay in memory.** A browser may keep the page that `location.assign` leaves in its
  back/forward cache, with its textures, so that Back can show it again; `location.replace` leaves no entry to go
  back to. Not verified here and not run: the viewer's author is asked to test both on a phone.

### Option 1: swap the area inside the page

At a crossing: fade to ink; fetch and parse the next file (the loading label above the ink); dispose the area that
was left, textures included; build the new area's collider; add it to the scene; compile its shaders; place the
player at the arrival spawn; fade in. Steps, after the seven above:

1. `hud.fade` has to wait for a callback that takes time (`hud.ts` lines 152-160 call it and go on).
2. `openArea`: fetch with progress, `parseAsync`, `buildWorld`. `buildWorld` already merges the collision of the root
   it is given into one collider (`world.ts` lines 138-141), so one World per file gives one collider per file.
3. A deep dispose of the old root: geometry, materials and every texture the materials hold, the buffers of
   instanced meshes, the collider's geometry, and every reference to the old world (`world`, `controller`,
   `trigger`, the current area and spawn, the parsed glTF object). The lights and sky the page adds itself stay.
   Disposing a texture does not close the `ImageBitmap` that `GLTFLoader` gives it (read in r160: nothing in three.js
   closes one), so the bitmaps have to be closed, or all references to them dropped, as well.
4. The swap: remove the old root, add the new one, a new `Controller` and `PortalTrigger`, `goTo(spawn)` (it also
   applies the area's exposure, fog and indoor look, `main.ts` lines 91-127), `renderer.compileAsync`, then fade in.
   Upload the new area's textures before the fade lifts (`renderer.initTexture` for each), or the first frames
   after the fade stall while they upload. Nothing in this step was run, and what three.js does for it is from
   memory.
5. A failed fetch or parse of the next area shows an error and leaves the player where they were. The first load keeps
   the viewer's words, `Could not load <source>` (`load.ts` line 63): `e2e/walk.spec.ts` line 93 expects them.

- **Hours: about 22 with tests** (estimated: index and lookup 2.0, loading 1.5, world and dispose 2.5, fade and styles
  1.5, `main.ts` 6.0, config 0.25, deploy 1.0, tests and fixture 6.0, README 1.0; total 21.75).
- **Hazard: textures are not freed today.** `disposeWorld` (`main.ts` lines 75-89) disposes geometry and materials
  only. In three.js a material's `dispose` does not free its textures (read in the source of three r160; the viewer
  pins 0.186.1, not read). Without the deep dispose every crossing leaks the area's textures: up to 192 MB a section
  by the planning target.
- **Hazard: the order of dispose and parse is not known.** In the exporter session's test page the second GLB parsed
  in one page took 12 s and a later one 24 s, against 3 to 5 s cold (measured there, on a laptop). That the page
  disposed nothing in between is an inference: no dispose call was found in the pages that were searched.
  Parsing the new area first keeps the old one safe if the load fails, but holds both in memory; disposing
  first frees memory but leaves nothing to fall back to. Measure the second parse on a phone, with one section
  resident, before fixing the order.
- **Hazard: two areas at once.** While both are in memory the planning targets add up: two sections are up to 384 MB
  of GPU texture if both have been drawn (arithmetic from section 9).
- **Hazard: memory on a phone is more than GPU texture.** The decoded images and the arrays that stay on the
  JavaScript side count as well. The exporter session's memory model puts the unsplit village at about 670 MB with
  nothing freed, and at about 371 MB with the arrays dropped and the bitmaps closed (estimated there, not measured).

### Both options use the same files

The area files, the index, the seams and the checkers are the same for both. Option 0 can ship first and Option 1
later with no new export. Fetching the next file ahead of time, or keeping the area just left in memory, can be added
after either; neither is part of this contract.

## 8. What stays as it is

- **Single-file mode.** `?glb=<address of a .glb or .gltf>` or a dropped file: one file is the whole world, exactly as
  today. No index is read, even when one lies beside the file. The nearest-origin rule, the bare-id fallback, rooms on
  far-grid slots inside one file and "... is not built yet" all work as they do now. An area file opened this way is
  a way to look at one area alone. Its doors into other files say "... is not built yet", except a door whose bare
  `toSpawn` is the id of a spawn in the opened file: today's fallback takes that spawn and the player stays in the
  file. The test world's shop door is one (opened alone, `walk-room_shop.gltf` sends the way out to `Spawn_shop_door`,
  0.5 m away), and so will be the game's `fo.gate` when the forest is exported (scene `forest`: `to` `overworld`,
  `toSpawn` `forest_gate`; the forest's own spawn `gate` has the id `forest_gate`; measured in
  `packages/content/data/scenes`).
- **The existing tests.** They all use single-file mode or no file at all: `test/glb-contract.test.ts` (no file; it
  pins the nearest-origin rule at lines 52-59), `test/world.test.ts` (`walk-fixture.gltf`), `test/rooms.test.ts` and
  `e2e/rooms.spec.ts` (`walk-rooms.gltf`: the village and a room in one file, with the bare-id fallback tested on
  purpose at `rooms.test.ts` lines 110-113), `e2e/walk.spec.ts`, `test/controller.test.ts`,
  `test/frame-rate.test.ts`. None of them checks the fade's colour or where the loading panel sits (searched). They
  were read, not run: no packages were installed where this was written.
- **What has to stay exported for them.** The five test files import 23 names, and two types (`Portal` from
  `portals`, `Wish` from `physics/controller`), from `apps/walk/src` (searched; the 23 names are all listed): `WALK` (`config`); `BvhCollider`, `mergeWorldGeometry` (`physics/collider`); `Controller`,
  `wishFromInput` (`physics/controller`); `DEFAULT_EXPOSURE`, `defaultFog`, `defaultLights`, `exposureFromScene`,
  `lookDirection` (`look`); `findSpawns`, `spawnLabel`, `pickSpawn`, `yawFromDirection` (`spawn`); `findAreas`,
  `nearestArea`, `showNearestArea`, `areaLook`, `buildWorld`, `collisionRoots`, `fogFromExtras` (`world`);
  `PortalTrigger`, `resolvePortal` with its fallback (`portals`). The two end-to-end specs read `window.__walk`
  (only with `?debug`): `ready`, `error`, `spawns`, `spawn`, `collisionSource`, `position`, `onGround`, `area`,
  `indoor`, `exposure`, and `trip` with its `portal`, `spawn` and `fallback`. `check_areas.mjs` runs `spawn.ts` and
  `portals.ts` on their own and needs from them `findSpawns`, `pickSpawn`, `plainWords`, `findPortals`,
  `resolvePortal` and `PortalTrigger`, and no import in those two files other than `three`.
- **The file format.** Area files are what the exporter writes today, one area at a time: the same extensions, the
  same extras, the same lights and units, the same spawn and portal empties.

## 9. Planning targets per file

These are **planning targets**. They are not limits of the viewer and not rules of this repository; the viewer has
no limit of this kind. `walk_index.py` prints a note when a file is over one, and fails only when asked to
(`--strict-targets`). They were set on 2026-11-16. Where each figure comes from:

- **From one planning note of the exporter's session** (not in the repository; the figures stand there under the
  heading "Proposal", for the unsplit world): 2.0 million triangles loaded, and 1.0 million in view with a ceiling
  of 1.5 million. The same note proposes about 40 MB a file, about 250 draw calls and about 256 MB of texture.
- **The exporter's own constants:** 248 draw calls (`DRAW_BUDGET`), 255 MB of texture as the ceiling
  (`TEX_BUDGET_MB`) and 24 lights (`MAX_LIGHTS`), `tools/blender/meshy_walk_export.py` lines 377, 380 and 192.
- **Chosen for this contract:** 15 MB for a section, from the parse speed of 0.06 to 0.11 s per MB measured on a
  laptop; 192 MB of texture for a section, a choice made for phones with no measurement behind it;
  150,000 and 10,000 collision triangles, beside the 0.10 to 0.48 s that today's 148,000 took to build on a laptop;
  and the whole room column (6 MB, 0.6 million triangles, 64 MB), set beside today's bedroom with no derivation
  written down.
- **Set for caves on 2026-11-19** (version 1.1), a ruling of the lead for this work, with no cave file to measure:
  the whole cave column.

| Measure | Target, section file | Target, room file | Target, cave file | Today's village (measured) | Today's bedroom (measured) |
|---|---|---|---|---|---|
| File size | 15 MB | 6 MB | 10 MB | 38.72 MB | 3.66 MB |
| Triangles loaded | 2.0 million | 0.6 million | 1.5 million | 4,053,662 | 389,157 |
| Triangles in view | 1.0 million, ceiling 1.5 million | none given | 1.0 million, ceiling 1.2 million | 3,073,957 at the worst spawn (the exporter's own estimate with a 75 degree lens; the viewer's is 70, so this is the higher figure; not measured here) | not measured |
| GPU texture memory | 192 MB, never above 255 MB | 64 MB | 96 MB, never above 255 MB | 254.7 MB | 60.4 MB |
| Draw calls | 248 | none given | 160 | 247 | 69 |
| Lights | 24 | none given | 8 | 24 | 2 |
| Collision triangles | 150,000 | 10,000 | 60,000 | 148,000 | 2,952 |

- GPU texture memory is counted as RGBA8 with a full chain of smaller copies: width x height x 4 x 4/3 bytes, in MB
  of a million bytes (254.7 MB is 202 images; 60.4 MB is 34 images; both measured from the image headers).
- 248 draw calls and 255 MB are also the numbers the exporter fits the unsplit village to today (`DRAW_BUDGET` and
  `TEX_BUDGET_MB`, `tools/blender/meshy_walk_export.py` lines 377 and 380).
- No figures were set for wild areas. `walk_index.py` holds them to the section figures. A kind with no figures at all
  would be one `FAIL` line of `<area>.planning_targets`, not a stack trace (no such kind can reach the table today).
- Triangles in view are not measured by the tools here; the exporter's report does that.
- Whether a cut of the village can meet these is not shown. On one trial cut (illustrative rectangles, not a
  proposal) the middle section stays under the in-view ceiling only while it draws almost nothing beyond its own ground
  (estimated with the exporter's in-view estimator on that trial cut, not run again here). That is why what a file
  draws beyond its ground is left to the exporter.

## 10. How to test without the exporter

The test world is committed in `tools/blender/walk_areas/fixture/areas/`: two village sections joined by the seam
`west_east`, a room, two caves (`under_a`, `under_b`: one passage 2.4 m wide with a roof 2.6 m above its floor, 10 m
under `village_east`) joined by the cave seam `a_b`, the cave mouth `east` from `village_east` into `under_a`, and
the index. Its files total 73,898 bytes (measured on 2026-11-19; 54,700 before the caves). Its layout is at the top of
`fixture/make-areas-fixture.mjs`. It was built to hold the awkward cases: a row of three points in a 5 m opening, a
room whose way out shares a bare id with the room's own spawn, a door into a scene that is not built, a room arrival
inside its door's radius, one texture in each section, and a cave seam closed from the floor to a roof that is lower
than the village's 3 m.

```
python tools/blender/walk_areas/walk_index.py tools/blender/walk_areas/fixture/areas --check
node   tools/blender/walk_areas/check_areas.mjs tools/blender/walk_areas/fixture/areas --src <path to apps/walk/src>
python tools/blender/walk_areas/mutants.py --src <path to apps/walk/src>
```

Results on 2026-11-19, with the caves (Windows 11, Python 3.13.14, Node 26.13.0): 190 pass and 0 fail; 157 pass and
0 fail, with the scripted journey 32 of 32 steps; 46 of 46 broken variants caught on the intended rule by both
checkers, 3 of 3 allowed variants noted, 8 of 8 valid variants passed, and 37 of 37 odd inputs (not JSON, a loop of
nodes, an empty folder, a list of walk-only scenes that is not JSON ...) ended in FAIL lines and no stack trace. (On
2026-11-16, before the caves: 114, 89 with 21 steps, 36, 2, 6 and 29.) `tools/blender/walk_areas/README.md` says what
each tool proves and what it cannot see.

For the viewer's own tests, copy `fixture/areas/` into `apps/walk/test/fixtures/areas/`. The files are already in
the layout the repository's formatter gives JSON, so `pnpm format` leaves them alone (it must: the index records each
file's size and hash). These values come from the checker's journey through the viewer's own `PortalTrigger`
(measured):

1. With only `room_shop` loaded, `Portal_shop.door` resolves to `overworld_shop_door` in `village_west`, not to
   `shop_door`. `Portal_ov.mine` resolves to nothing and the words are "Mine is not built yet".
2. From `square`, walking east at 1.4 m/s fires `seam_west_east_a_2` at x = -1.44. The arrival is
   `overworld_seam_west_east_b_2` at glTF (1.65, 0, 0), yaw -90 degrees. Walking on east fires nothing. Walking back
   west fires `seam_west_east_b_2` at x = 1.45, and the arrival is `overworld_seam_west_east_a_2`, yaw 90.
3. The shop door fires as `ovshop` at y = 6.56 (Blender). The room arrival `shop_door` stands 0.5 m from the way out
   and nothing fires until the player has stepped 1 m away and come back.
4. The picker lists six spawns, `square`, `overworld_shop_door`, `mill`, `shop_door`, `overworld_mouth_east` and
   `undermere_mouth_east`, in whatever order the viewer chooses, and not the ten seam arrivals (six of the village
   seam, four of the cave seam).
5. For Option 1: each section holds one 4 x 4 texture, so a test can count textures before and after a swap and back.
   With today's `disposeWorld` that count grows. The caves hold no texture.
6. With the index's `start` changed to `overworld_shop_door` and no `?spawn=` in the address, the player starts at
   `overworld_shop_door` in `village_west`, not at `square`. The same with `?spawn=no_such_spawn`. (Passing
   `params.get('spawn')` to `pickSpawn`, as line 158 of `main.ts` does today, gives `square` in both cases.)
7. Opened alone with `?glb=` (single-file mode, section 8), `walk-room_shop.gltf` takes the bare-id fallback at its
   door: the way out goes to its own spawn `shop_door`, and the words are not "... is not built yet".
8. The caves. From `overworld_mouth_east`, walking to the mouth fires `umeast_in` (the viewer reads
   `Portal_um.east_in` so); its target `undermere_mouth_east` is in `under_a`, which opens. Walking east along the
   passage fires `seam_a_b_a_2` at x = 30.63; the arrival is `undermere_seam_a_b_b_2` in `under_b` at (33.65, -9.4),
   yaw -90 degrees, and walking on east fires nothing. Walking back west fires `seam_a_b_b_2` at x = 33.44, and the
   arrival is `undermere_seam_a_b_a_2` in `under_a`, yaw 90. Walking west to the mouth fires `umeast_out`, and the
   walker comes out at `overworld_mouth_east` in `village_east`, 1.50 m from `Portal_um.east_in`.

## 11. Open points, and what is not verified

**Not verified.**

- **The viewer's three.js, 0.186.1, was never run. No browser and no phone were used.** What three.js does was
  taken from three r160, a copy that was at hand. How GLTFLoader names things (section 2) was read in r160's source
  and measured with r160: the test world and its 44 variants were parsed by the real loader, which gave the
  viewer's code the same spawns and portals as the stand-in in all but the one variant built to differ
  (`light_ghost_spawn`), and seven more cases were tried by hand. What `dispose` frees was read in r160's source.
  `compileAsync`, `initTexture` and how fog fades were written from memory and not run.
- No area file was ever loaded in the viewer. No load time, memory use or frame time was measured for any area file.
  The times quoted in section 7 are from a laptop test page of the exporter's session, with the unsplit village.
- The viewer's own tests were read, not run. "They pass unchanged" is a reading of the code.
- The hours in section 7 are estimates.
- The seam rules and the closed-edge rule were tried only on the test world, on its variants (`mutants.py`) and on
  several dozen altered copies of it made by hand, which are not kept: box walls, uncompressed collision. No real
  section file exists yet, and a real gate model's collision is untried.
- **Sloping ground at a seam** was tried on variants and altered copies of the test world, not on real ground. The
  wall check measures the wall's height from the ground under each ray, not from the mean height of the row, so ground
  that rises along the opening is no fault: the variant `slope_along_seam` (3 % along the seam) passes, and so did
  altered copies with the ground rising 1.5, 2.5, 3 and 10 % along the seam and walls 3 m above it, 8 and 12 % with
  walls 4.5 m above it, and 10 % across the seam. (The scripted journey walks at one height and does not follow a
  slope across the seam; it is written for the unchanged test world.)
- On real files the checkers cannot see inside Draco data. That spawns and portals stand on the ground, that a
  seam's wall is closed and 3 m high, and that the rest of a village section's edge is closed, must be checked by the
  exporter in Blender. That check is not written yet; the wall check and the closed-edge check of `walk_index.py`
  (rays at heights counted from the ground under each ray) are the model for it.
- **The caves** (version 1.1) were tried only on the test world, its variants and a few altered copies made by hand
  (not kept): box passages, uncompressed collision. No cave file exists, no cave was loaded in the viewer, and no
  cave's size, load time or frame time was measured. The cave figures of section 9 have no measurement behind them.
- For real caves the cave builder has to check in Blender what the checkers here cannot see in Draco data: that each
  cave seam's wall closes the passage from the floor to the roof, and that a cave cannot be walked out of (the
  closed-edge rule of section 4 does not apply to caves). Neither check is written yet.
- That a cave's fog is the ink, `#12141C`, is not checked: only that the fog is there and that every cave carries the
  same look.
- How the Pages host caches files was not read. Hence the hash on the address in section 7.

**Open.**

- **Where the village is cut**, how many sections, their keys, and which device closes each seam. Another piece of
  work decides that. Nothing in this contract depends on it.
- **What a cut leaves over.** Three findings on one trial cut of the village (illustrative rectangles, not a
  proposal), measured on that cut by a read-only survey of the exporter that is not kept in the repository, and not
  measured again here. 388 objects, 492,606 triangles or 12.2 % of today's load, lay outside the walk region and so in
  no section: trees, rocks and outer terrain. Whole terrain pieces overshoot a cut line by up to 162 m. And the
  lower-detail scenery of the neighbours, which keeps the void from showing, has no price: no size and no count of
  triangles in view was measured for it. The cut and the exporter have to settle all three. The cheaper versions of
  that scenery come from the exporter's existing far tiers (the 256 px far textures, `TEX_FAR`, and the decimated far
  meshes, whose names end `walk_far`, in `tools/blender/meshy_walk_export.py`), made from the same Meshy models and
  textures. No Meshy model or texture is replaced by another, or dropped, to save size.
- **The closed edge of a room, a wild area or a cave.** The rule of section 4 holds for village sections only: a
  room's walls are its own and its walk region can be looser than they are. Nothing checks that a room or a wild area
  cannot be walked out of; with a polygon outline of the ground, the same rays could. In a cave the rays would find
  the roof for the ground, which is why that check is the cave builder's, in Blender (above).
- **The width of an opening** is what the files declare (`wdi_width_m`). No checker measures the real gap
  (section 6).
- **Where the files are hosted, and publishing them.** Not part of this contract. Today the Pages workflow downloads
  one release asset, `hollowmere_walk.glb` (`.github/workflows/pages.yml` on `claude/v2-walk`, the step "Fetch the
  walk-through's world"); it would have to fetch `walk-index.json` and every area file. Uploading files is a public
  act that needs the owner's yes.
- **The order of dispose and parse** in Option 1 (section 7).
- **Lights at a seam.** A file holds only its own point lights (at most 24), so a lamp just across a seam is missing
  in the file on this side, and the lighting near a seam differs between the two files. The look rule (section 6)
  covers exposure, fog and `wdi_baked`, not lights.
- **The door prompt at a seam.** The viewer words the prompt from `to`, which at a seam is always `overworld`, and at
  a room's way out too. The index gives `target_area` and that area's `name` for better words. The viewer's call. At a
  cave seam `to` is `undermere`, which the viewer words "Undermere"; at a cave mouth into a cave that is not built
  yet the words are "Undermere is not built yet". `walk_scenes.undermere.name` in the index gives "The Undermere".
- **Where the four cave mouths stand**, their gate keys, how the caves are cut, and which device closes each cave
  seam: the cave builder's work. Nothing in this contract depends on it.
- **A door between a cave and a room or a wild area** is neither described nor forbidden. A crossing between the
  village and the caves must be a cave mouth (section 5), and one between two caves a seam (section 6).
- **Lights at a cave seam**: as at a village seam (above). A cave is baked, so the viewer switches its lights off, and
  the light near a cave seam is what each file's bake holds.
- **Scene ids where one starts another** (`forest`, `forest_deep`). `forest` + `deep_x` and `forest_deep` + `x` make
  the same node name. The checkers catch it as a doubled id or a target in the wrong scene. The game's data has no
  such pair today (searched in `packages/content/data/scenes`: 32 scenes and 112 scene-and-spawn names, none doubled).
- **The room texture target.** Today's bedroom uses 60.4 MB of the 64 MB target; a richer room will not fit.
- **An interim world.** Until the village is cut, an index built with `--legacy` can list the unsplit village beside
  room files, so that rooms can be walked into as they are finished. It works only in a viewer that takes file names
  from the index. Cave files can stand beside it in the same way, with the cave mouths' `Portal_um.<gate>_in` and
  `Spawn_overworld_mouth_<gate>` in the legacy village file.

## 12. Version

Version 1.1, 2026-11-19. The index says `"format": 1`. A change that a version 1 viewer would misread takes a new
`format` number; a new optional field does not.

**Does version 1.1 change the format? No.** The test is whether a viewer written for version 1 would misread anything
in an index or a file of version 1.1, and it would not:

- The one new field of the index, `walk_scenes`, is optional, and a viewer ignores fields it does not know
  (section 3). Nothing in it is needed to open a file, place the player or find a portal's target; it only offers
  better words.
- A walk-only scene id in `to`, in `scenes` or in `pending` is looked up exactly as a game scene id is: the exact id
  `<to>_<toSpawn>` among the spawns of the index, or "... is not built yet" (section 5). A version 1 viewer that
  never heard of walk-only scenes finds every cave spawn by it.
- The new value `cave` of `kind`, and the new seam devices, are read by tools only.
- A cave's Area carries only extras a version 1 viewer already reads, with the meaning it already gives them:
  `wdi_indoor`, `wdi_baked`, `wdi_exposure` and the fog. A cave seam and a cave mouth are portals and spawns of the
  forms version 1 has.

So a version 1 viewer walks a version 1.1 world as it is meant to be walked, and the format stays 1.

The tools in `tools/blender/walk_areas/` check every rule of this document that can be checked without Blender, and
their `README.md` lists the rules by name. `walk_index.py --legacy` writes 15,571 bytes for today's two files
(measured, section 3); the tools of version 1.1 write the same bytes (measured on 2026-11-19).

**Changes.**

- Version 1, 2026-11-16: the first version.
- Version 1.1, 2026-11-19: the caves. Walk-only scenes, listed in `tools/blender/walk_areas/walk_scenes.json`
  (`undermere`), never a game scene id; the area kind `cave` (`under_<key>`, indoors and baked, with fog, one look for
  every cave, built in the village frame); seams between two caves of one scene, whose wall closes the passage from
  the floor to the roof, with eight cave devices; cave mouths (`Portal_um.<gate>_in` in the village,
  `Portal_um.<gate>_out` in a cave, kind `cave_mouth`), and every crossing between the village and the caves one of
  them; `pending` and `to` may name a walk-only scene; the optional index field `walk_scenes`; planning targets for
  caves; the way-back note for caves. Rules new in both checkers: `world.walk_scenes`, `index.walk_scenes`,
  `world.cave_mouths`, `world.cave_look`; rules now in `check_areas.mjs` too: `<area>.area_id`,
  `world.seams_only_between_sections`, the note `world.pending.<scene>`. The index format stays 1.
