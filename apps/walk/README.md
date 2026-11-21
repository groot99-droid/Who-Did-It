# @wdi/walk

The first step of V2 (DECISIONS A610): a single-player, first-person walk through the 3D HollowMere GLB in the
browser. No server, no multiplayer, no rules. Served at `/Who-Did-It/walk/`.

```sh
pnpm --filter @wdi/walk dev        # http://localhost:8090/Who-Did-It/walk/
pnpm --filter @wdi/walk test       # controller maths, spawns, the fixture world
pnpm --filter @wdi/walk test:e2e   # Playwright at 390x844 and 1280x720 against the fixtures (index worlds too)
pnpm --filter @wdi/walk fixture    # rebuild test/fixtures/walk-fixture.gltf, walk-rooms.gltf and walk-traverse.gltf
```

## Opening a world

In this order: `?glb=<url>`; a `.glb` (or `.gltf`) dropped on the page; `?index=<url>` (a world in many files,
below); then `DEFAULT_INDEX_URL` (`VITE_WALK_INDEX`; no deploy sets it yet), then `DEFAULT_GLB_URL` in `src/config.ts`,
which the Pages deploy points at `/Who-Did-It/walk/hollowmere_walk.glb` (below), and which is null in any other build.
`?glb=` wins over `?index=`, and opens one file exactly as before. `?spawn=<id>` starts at `Spawn_<id>`; `?debug`
shows the FPS readout, the position and the collision source, and exposes `window.__walk` for the e2e spec. Draco,
meshopt and KTX2 files load.

## A world in many files: the index

`docs/walk-areas.md` is the contract: one `walk-<areaId>.glb` per area (a village section, a room, a wild area, a
cave) and a `walk-index.json` beside them, written by `tools/blender/walk_areas/walk_index.py`. The caves of The
Undermere are built that way into `tools/blender/build/caves/` (git-ignored); the village will be cut the same way.

- **Opening.** `?index=<address of walk-index.json>` reads the index (format 1; any other number is refused with a
  message) and opens the file of the area that holds `?spawn=`; else `?area=<areaId>` at the index's start if it is
  there, else that area's first picker spawn; else the index's `start`. The walker is placed at that exact spawn id.
  An area file is fetched from the index's folder with the first 8 characters of its hash as `?v=`.
- **Portals.** A portal's target is the spawn `<to>_<toSpawn>`, looked up in every area of the index (the bare
  `toSpawn` fallback is single-file mode's only). In the open file it is a short fade, as before. In another file it
  is a **crossing**. In no file (its scene is pending, or a cave mouth leads to a village that is not in the index)
  the screen says "… is not built yet" (`The village`, `The Undermere` and the like) and the walker stays.
- **Crossings.** The page fades to ink (`#12141C`, never black) over 0.2 s; if the crossing takes longer than 0.4 s
  a loading line ("Opening The Undermere, The Ice Rift · Downloading 60%") shows above the ink. By default the area
  is swapped inside the page (`src/session.ts`, `AreaSwap`): the next file's bytes are fetched, then the area that was
  left is freed completely (geometry, materials, textures and their ImageBitmaps, the collider and its BVH;
  `src/dispose.ts`), then the next one is parsed and built, its shaders compiled and its textures uploaded, and the
  ink lifts. Two areas' textures are never held at once. With `?cross=reload` the page instead loads itself again
  with `?area=` and `?spawn=` of the arrival (`location.replace`: no history entry per crossing), keeping `index`,
  `debug`, `exposure` and `cross`. Either way the arrival's `wdi_mode` starts the walker in its mode (a seam into
  a fissure arrives sidling). The picker lists every spawn of the index but the arrival-only ones; choosing one in
  another file is a crossing too.
- **Failures.** A file that cannot be fetched leaves the walker where they were, with the area still open, and says
  why. A file that cannot be parsed is found only after the old area is freed: the old area is opened again and the
  walker put back where they stood.
- `?debug` adds the open file, the crossings and the renderer's geometry and texture counts; `window.__walk` adds
  `areaId`, `crossings`, `lastCrossing` (the renderer's memory before and after, what was freed, the time), `notice`
  and `memory`.

**Walking the caves locally.** Build the caves (the cave builder writes `tools/blender/build/caves/`), then start
the dev server and open the index through it; Vite serves files of the workspace under `@fs`, so nothing else is
needed and there is no CORS question:

```sh
pnpm --filter @wdi/walk dev
# then open (with the checkout's absolute path, forward slashes):
# http://localhost:8090/Who-Did-It/walk/?index=/Who-Did-It/walk/@fs/<checkout>/tools/blender/build/caves/walk-index.json
# add &spawn=undermere_seam_ice_north_a_1 (any spawn id of the index) to start elsewhere, &debug for the readout,
# &cross=reload to cross by page load
```

Any static server works as well when it sends `Access-Control-Allow-Origin` (the page fetches the index and the
files from another origin then).

**Limits.** A crossing is a cold load of the next file: about 0.7 to 1.7 s for the caves' 1.6 to 4.1 MB files in
headless Chrome with software WebGL on a laptop (measured on 2026-11-21; no phone was measured). Nothing is fetched
ahead, and the area just left is not kept. With `?cross=reload` a desktop loses the pointer lock at each crossing (a
click takes it back) and a game pad may need a press before the new page sees it. Lights do not cross a seam: each
file holds its own. The deploy fetches one file today; hosting an index is not set up.

## Hosting the GLB

The GLB is too big for the repository (`*.glb` is in LFS, and Pages serves LFS pointers), so it lives as the asset
`hollowmere_walk.glb` of a GitHub release tagged `walk-glb`. `.github/workflows/pages.yml` downloads it at deploy time
into the walk's folder, so the page loads it from its own origin with no CORS question. To ship a new export, replace
that asset (`gh release upload walk-glb hollowmere_walk.glb --clobber`, or the release page) and re-run the `pages`
workflow. While the release or the asset is missing, the deploy still succeeds and the page asks for a file.

## The GLB contract

What the Blender export (`hollowmere_walk.glb`) gives the viewer, and what the viewer does with it. Standard glTF,
Y up, metres; Blender's (x, y, z) arrive as (x, z, -y).

- **Extensions.** Required: `KHR_draco_mesh_compression`, `EXT_texture_webp` (no fallback), `KHR_texture_transform`,
  `KHR_lights_punctual`. Used: `EXT_mesh_gpu_instancing`, `KHR_materials_emissive_strength`. three r186's GLTFLoader
  reads all six; instanced groups arrive as `InstancedMesh`.
- **Areas.** The root holds `Area_<name>` groups: `Area_village` at the origin, the wild areas at offsets of 900 m
  and 1800 m (Gallows Wood (0, 0, -900), Fenwood (-900, 0, -900), Tin Gallery mouth (0, 0, -1800), Flooded Gallery
  (-900, 0, -1800), sea door (900, 0, -1800)). Only the area whose origin is nearest the player is drawn, its lights
  included, and `camera.far` is 500 m with distance fog, so one area never draws another. An area's extras set its
  look while the player is in it: `wdi_exposure` (a multiplier), fog (`fog_color` with `fog_near` and `fog_far`, or
  `fog_density`), and `wdi_indoor: true`, which turns off the moon, the sky light and the sky dome.
- **Rooms.** Each interior is an area of its own, `Area_room_<sceneId>` (indoors, also without `wdi_indoor`), on a
  far grid from about 3,000 m out, more than 500 m apart, at height 0, with its origin inside the room. Its walls,
  floor and furniture shells are `HM_Collision_room_<sceneId>`; its spawns are `Spawn_<sceneId>_<spawnId>`, facing
  into the room, with `wdi_spawn` and `wdi_district` (the room's name). Its lights are `KHR_lights_punctual` in the
  village's units. Scene ids come from `packages/content/data/scenes`; the village is `overworld`, and its scene
  spawns are `Spawn_overworld_<spawnId>`, facing away from their doors. Slot `i` sits at
  (3000 + 600·(i mod 6), 0, −(3000 + 600·(i div 6))) in three's frame; `widow_bedroom` is slot 10, (5400, 0, −3600).
- **Baked rooms.** A room with `wdi_baked: true` carries its Cycles bake as `KHR_materials_unlit` with `COLOR_0`,
  which three reads as `MeshBasicMaterial` with vertex colours. The bake is scene-linear radiance, so AgX at the
  area's `wdi_exposure` gives Blender's view: tone mapping applies once, nothing darkens it twice. Unlit surfaces
  take no live light, and the area's live lights are switched off, so lit props in the room are not lit on top of
  the bake.
- **Portals.** A `Portal_<portalId>` empty at each door, in the rooms and at the village's building doors, with the
  extras `{to, toSpawn, kind}`. Walking within 1 m of one (once the player has been outside every portal since the
  last trip), or using it within 2 m (E or Enter, the pad's A, the door button on touch), fades to
  `Spawn_<to>_<toSpawn>`; when that is missing, to `Spawn_<toSpawn>`, which the debug readout flags. A door
  whose target is not in the GLB yet (`Portal_wb.door` to `widow_parlour`, `ov.forest_gate`) shows "… is not built
  yet" and does not move the player. three strips `.`, `[`, `]`, `:` and `/` from node names (and turns spaces into
  `_`), so `Portal_wb.door` reads as the portal id `wbdoor`; the target comes from the extras and is unaffected.
- **`HM_Collision`.** One mesh (and one `HM_Collision_room_<sceneId>` per room) at the root, in world coordinates (extras `wdi_collision`): ground, building prisms,
  walls, rocks, trunks, decks with railings, the shoreline barrier and the walk-region bounds. The viewer hides it
  and collides only with it; without it every mesh collides, instances included. About 148k triangles builds its BVH
  in about 0.2 s, behind a "Building collision" panel.
- **Spawns.** `Spawn_<id>` empties at ground level, looking along their -Z; the eye is 1.6 m above them. Extras
  `wdi_spawn` and `wdi_district` give the picker's plain-words label, grouped by district; `wdi_facing_deg` is informational (the -Z
  axis is what the viewer uses). The start is `?spawn=<id>`, else `square`, else the first.
- **Lights.** `KHR_lights_punctual`, exported in Blender's Unitless (COMPAT) mode: point and spot intensity is
  watts / 4π, which three reads as candela with inverse-square falloff, the same irradiance Blender gives (P / 4πd²).
  No factor is applied; the difference between the two renders is the exposure. Shadows are off (the lantern lights
  sit inside their lantern meshes); a node with `wdi_cast_shadow: false` (the lamp meshes and their `I_*` instance
  holders) and everything under it, instanced meshes included, never casts when they are on.
- **Exposure.** AgX tone mapping. `toneMappingExposure` comes from the current area's extras (`wdi_exposure`, or the
  aliases `tone_mapping_exposure`, `toneMappingExposure` and `exposure`, as a multiplier), then `Area_village`'s, else 2 to the power of the look's
  `color.exposure` stops (1.25 stops = 2.38). `?exposure=<n>` overrides both.
- **Sky, moon and fog.** When the scene's extras have no fog (`fog_color` with `fog_near` and `fog_far`, or
  `fog_density`), the viewer uses `tools/blender/meshy_looks/final.json`: exponential fog at `fog.density`,
  fading into `sky.horizon`; a sky dome with the horizon, zenith, glow and ground colours; the moon as a
  directional light (`moon.energy` W/m², `moon.color`, its azimuth and elevation) and the sky's share of the light
  (`sky.light`) as a hemisphere light. A GLB with its own directional light keeps it and gets no moon.

## Controls

Desktop: click for pointer lock and mouse look, WASD or the arrows, Shift runs. Touch: a stick under the left thumb
(pushed to the edge it runs), drag on the right half to look. Gamepad: left stick walks, right stick looks, a trigger
or the left-stick click runs. Near a door, E or Enter (the pad's A, or the door button on touch) goes through. The numbers are in `src/config.ts`.
In a cave's traversal zones the same controls crawl, sidle and climb (below); no mode has a button of its own.

## Collision

A capsule floats one step height above the feet (`src/physics/controller.ts`): walls and anything taller than a step
stop it (three-mesh-bvh shapecast); five rays under its footprint find the ground, so anything lower is stepped onto
and slopes and stairs are followed down. Off the ground, gravity applies; below the world's lowest point the player
returns to the spawn. Traversal zones change the body (below).

## Traversal zones

A cave makes crawling, walking sideways and climbing part of the way through (`src/traverse.ts`). A zone is an empty
`Trav_<id>` under an `Area_` node with the extras `wdi_traverse` (`crawl`, `sidle` or `climb`) and `size`
(`[sx, sy, sz]`, metres): the zone's whole box in the node's own frame as three.js reads it, +X along the passage, +Y
up and, on a climb, +Z out of the wall towards the walker. The node's world position and rotation place the box; its
scale is ignored. A `Trav_` node without both extras is skipped, and a file without zones walks exactly as before. Each
mode starts by itself and shows its word ("Crawling", "Sideways", "Climbing") above the door prompt; every input
device works in every mode, and portals and the fade work inside zones. The numbers are `TRAVERSE`, `CRAWL`, `SIDLE`
and `CLIMB` in `src/config.ts`.

- **Crawl.** With the feet in a crawl box, counted 0.3 m longer at both ends of its X axis (the walking body stops
  that far from a low mouth), the body is 0.9 m tall (solid from 0.35 to 0.9 m above the feet, a sphere of radius
  0.275 m), the eye is 0.55 m up and the speed 0.6 m/s with no running. The eye moves between heights over 0.3 s. The
  walker stands up again only out of every crawl box (with its 0.3 m) and with nothing within 1.8 m above the feet,
  so never into rock. While the feet are also in a sidle box the crawling body is as thin as the sidling one (radius
  0.18 m), so a crawl that opens straight into a fissure is crawled into until there is room to stand up sideways,
  and sidled on from there; the other way round, the crawl starts at the low mouth.
- **Sidle.** With the feet in a sidle box, also counted 0.3 m longer at both ends, the body's radius is 0.18 m at the
  walking height, the speed 0.5 m/s with no running, and it moves along the box's X axis: the input's share along
  it, signed as the camera sees it, so pushing towards an end goes there. Input across the passage does nothing,
  so a ledge sidled along with a drop on one side is never stepped off. Only a walker who walked into the box
  through its side (between its X ends) is let move across, and then only outwards, away from the box's middle plane
  (in a fissure the rock stops that at once), so that it backs out the way it came. Feet pushed out of the box's
  side by the rock keep sidling, by up to 0.3 m, while the walking body does not fit there. The view turns to face
  the box's -Z or +Z wall, whichever is nearer the heading, and is held within 60 degrees of it until the feet are
  0.3 m past either end of the box. Make the box as wide (Z) as the fissure; the walker lines up with it as with a
  door. A walker who sidled out through an end walks on anywhere in that box (its end margins included) until
  it heads back in through that end within 30 degrees of the box's axis, or has stepped 0.15 m clear of the box: where
  a fissure opens at an angle into walking space and the way on runs beside the box, it no longer sidles and walks by
  turns (route 1's Ice Curtain switched 26 times there; `test/sidle-flicker.test.ts`).
- **Climb.** The face is the box's z = 0 plane (the node stands on the rock), the box runs from the floor at its foot
  (y = -sy/2) to the ledge (y = +sy/2), and sx is the climbable width. A walker on the floor at the foot (walking,
  crawling or sidling), within 0.6 m in front of the face and pushing within 60 degrees of it (with forward or
  sideways input, not back input), hangs on it 0.35 m out, without gravity. Forward input (W, the stick up) climbs and
  back input goes down, both at 0.6 m/s, wherever the camera looks; sideways input moves along the face within the
  box, to the right as the camera sees it. At the top the walker mantles over 0.5 s onto the ledge, 0.8 m beyond the
  face, on the ground found there, crawling if the ledge lies in a crawl box or has no room to stand. Rock on the
  ledge, or a drop behind a narrow ridge, shortens the mantle: the body is tested every 0.05 m out from the edge and
  the feet land as far out as it fits (walking, else crawling) with ground under the feet and under the body's far
  side, but at least 0.2 m beyond the face; with less room than that the walker hangs at the top, and can climb down
  or along the face. Going down, the
  walker lets go standing on the floor when the feet reach it within 0.5 m of the foot of the box (rock under the feet
  higher up the face is climbed past), or falls, with no floor within 0.5 m below the foot. Stepping off the ledge in
  front of the face, within its width, the face catches the walker within 0.5 m of the top; holding W there does not
  climb straight back up until W has been let go once. While hanging there is no collision: keep the rock within about
  0.25 m of the plane.
- **Arriving in a mode.** A spawn's `wdi_mode` (`crawl`, `sidle`, `climb`) starts the walker in that mode when the
  spawn stands in a zone of that kind, which is how a seam inside a crawl delivers the walker crawling into the next
  file; otherwise the console warns and the walker walks. Any spawn in a crawl box (with or without `wdi_mode`, and a
  respawn or a portal arrival there) starts crawling with the eye already low, since the crawl wins there. A crawl
  spawn finds its floor from just above it, and a climb spawn hangs where it stands, undropped (put it 0.35 m in front
  of the face, between its foot and its top).

Drawing the boxes:

- A crawl box covers the low passage from a little under its floor to its roof and reaches the outermost rock of each
  mouth (or past it). The walking body stops 0.3 m short of a 1.0 m lip, and the 0.3 m the box counts longer leaves
  almost no slack, so a box that stops inside the mouth is never reached.
- The mode lasts 0.3 m past the drawn end of a crawl or sidle box (longer for a crawl, until there is room to stand).
- Crawl and sidle boxes may touch or overlap where a low passage opens straight into a fissure; where they overlap,
  the crawl wins.
- A crawl or sidle box may reach the foot of a climb face (a crawl or a fissure that ends at a chimney): the walker
  attaches from crawling or sidling as from walking, and the eye rises while it climbs.
- A sidle box is best entered through its X ends: cut it short of a side opening, and do not end it in a dead end
  unless there is another way out. A walker who does come in through the side still backs out the way it came.
- Two sidle boxes may meet end to end at a bend of up to 60 degrees. A sharper bend needs a small room at the corner
  where the walking body fits (about 1.2 m), with each box ending at it; without one the walker stops at the corner
  (measured: 75 and 90 degree bends are not passed).
- Keep the ledge above a climb face clear for 0.8 m beyond the face plus the body's 0.3 m, at least 1.75 m high to
  land walking or 0.9 m to land crawling. A shallower ledge, a ridge with a drop behind it, or a lower roof shortens
  the mantle down to 0.2 m beyond the face (a ridge needs to be at least 0.5 m deep); less room than that leaves the
  walker hanging at the top.
- Draw a climb box's bottom at the floor or a little below it (no more than 0.5 m). A bottom up to 0.5 m above the
  floor still works (the walker attaches from the floor and climbs to it at climbing speed), but above that the foot
  cannot be reached.

The index tests use `test/fixtures/areas/`, a copy of the contract's test world
(`tools/blender/walk_areas/fixture/areas/`, `.gltf` so that it stays out of LFS), and two tiny `.glb` caves that
`test/helpers/tiny-areas.ts` builds in memory with their index (a seam into a sidle arrival, a cave mouth to a village
that is not in the index, one 4 x 4 texture each); `e2e/areas.spec.ts` serves both to the page.

`test/fixtures/walk-traverse.gltf` has one zone of each kind between three rooms (`scripts/make-fixture.mjs`);
`?debug` shows the mode, its zone and the eye height, and `window.__walk` carries them for `e2e/traverse.spec.ts`.
