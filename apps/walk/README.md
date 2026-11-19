# @wdi/walk

The first step of V2 (DECISIONS A610): a single-player, first-person walk through the 3D HollowMere GLB in the
browser. No server, no multiplayer, no rules. Served at `/Who-Did-It/walk/`.

```sh
pnpm --filter @wdi/walk dev        # http://localhost:8090/Who-Did-It/walk/
pnpm --filter @wdi/walk test       # controller maths, spawns, the fixture world
pnpm --filter @wdi/walk test:e2e   # Playwright at 390x844 and 1280x720 against the fixture
pnpm --filter @wdi/walk fixture    # rebuild test/fixtures/walk-fixture.gltf and walk-rooms.gltf
```

## Opening a world

In this order: `?glb=<url>`; a `.glb` (or `.gltf`) dropped on the page; then `DEFAULT_GLB_URL` in `src/config.ts`,
which the Pages deploy points at `/Who-Did-It/walk/hollowmere_walk.glb` (below), and which is null in any other build. `?spawn=<id>` starts at `Spawn_<id>`; `?debug` shows the FPS readout,
the position and the collision source, and exposes `window.__walk` for the e2e spec. Draco, meshopt and KTX2 files load.

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

## Collision

A capsule floats one step height above the feet (`src/physics/controller.ts`): walls and anything taller than a step
stop it (three-mesh-bvh shapecast); five rays under its footprint find the ground, so anything lower is stepped onto
and slopes and stairs are followed down. Off the ground, gravity applies; below the world's lowest point the player
returns to the spawn.
