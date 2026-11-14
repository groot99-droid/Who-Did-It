# @wdi/walk

The first step of V2 (DECISIONS A610): a single-player, first-person walk through the 3D HollowMere GLB in the
browser. No server, no multiplayer, no rules. Served at `/Who-Did-It/walk/`.

```sh
pnpm --filter @wdi/walk dev        # http://localhost:8090/Who-Did-It/walk/
pnpm --filter @wdi/walk test       # controller maths, spawns, the fixture world
pnpm --filter @wdi/walk test:e2e   # Playwright at 390x844 and 1280x720 against the fixture
pnpm --filter @wdi/walk fixture    # rebuild test/fixtures/walk-fixture.gltf
```

## Opening a world

In this order: `?glb=<url>`; a `.glb` (or `.gltf`) dropped on the page; then `DEFAULT_GLB_URL` in `src/config.ts`
(null until the hosting question is answered). `?spawn=<id>` starts at `Spawn_<id>`; `?debug` shows the FPS readout,
the position and the collision source, and exposes `window.__walk` for the e2e spec. Draco, meshopt and KTX2 files load.

## The GLB contract

What the Blender export (`hollowmere_walk.glb`) gives the viewer, and what the viewer does with it. Standard glTF,
Y up, metres; Blender's (x, y, z) arrive as (x, z, -y).

- **Extensions.** Required: `KHR_draco_mesh_compression`, `EXT_texture_webp` (no fallback), `KHR_texture_transform`,
  `KHR_lights_punctual`. Used: `EXT_mesh_gpu_instancing`, `KHR_materials_emissive_strength`. three r186's GLTFLoader
  reads all six; instanced groups arrive as `InstancedMesh`.
- **Areas.** The root holds `Area_<name>` groups: `Area_village` at the origin, the wild areas at offsets of 900 m
  and 1800 m (Gallows Wood (0, 0, -900), Fenwood (-900, 0, -900), Tin Gallery mouth (0, 0, -1800), Flooded Gallery
  (-900, 0, -1800), sea door (900, 0, -1800)). Only the area whose origin is nearest the player is drawn, its lights
  included, and `camera.far` is 500 m with distance fog, so one area never draws another.
- **`HM_Collision`.** One mesh at the root, in world coordinates (extras `wdi_collision`): ground, building prisms,
  walls, rocks, trunks, decks with railings, the shoreline barrier and the walk-region bounds. The viewer hides it
  and collides only with it; without it every mesh collides, instances included. About 148k triangles builds its BVH
  in about 0.2 s, behind a "Building collision" panel.
- **Spawns.** `Spawn_<id>` empties at ground level, looking along their -Z; the eye is 1.6 m above them. Extras
  `wdi_spawn` and `wdi_district` give the picker's plain-words label; `wdi_facing_deg` is informational (the -Z
  axis is what the viewer uses). The start is `?spawn=<id>`, else `square`, else the first.
- **Lights.** `KHR_lights_punctual`, exported in Blender's Unitless (COMPAT) mode: point and spot intensity is
  watts / 4π, which three reads as candela with inverse-square falloff, the same irradiance Blender gives (P / 4πd²).
  No factor is applied; the difference between the two renders is the exposure. Shadows are off (the lantern lights
  sit inside their lantern meshes).
- **Exposure.** AgX tone mapping. `toneMappingExposure` comes from `Area_village`'s extras (`wdi_exposure`,
  `tone_mapping_exposure`, `toneMappingExposure` or `exposure`, as a multiplier), else 2 to the power of the look's
  `color.exposure` stops (1.25 stops = 2.38). `?exposure=<n>` overrides both.
- **Sky, moon and fog.** When the scene's extras have no fog (`fog_color` with `fog_near` and `fog_far`, or
  `fog_density`), the viewer uses `tools/blender/meshy_looks/final.json`: exponential fog at `fog.density`,
  fading into `sky.horizon`; a sky dome with the horizon, zenith, glow and ground colours; the moon as a
  directional light (`moon.energy` W/m², `moon.color`, its azimuth and elevation) and the sky's share of the light
  (`sky.light`) as a hemisphere light. A GLB with its own directional light keeps it and gets no moon.

## Controls

Desktop: click for pointer lock and mouse look, WASD or the arrows, Shift runs. Touch: a stick under the left thumb
(pushed to the edge it runs), drag on the right half to look. Gamepad: left stick walks, right stick looks, a trigger
or the left-stick click runs. The numbers are in `src/config.ts`.

## Collision

A capsule floats one step height above the feet (`src/physics/controller.ts`): walls and anything taller than a step
stop it (three-mesh-bvh shapecast); five rays under its footprint find the ground, so anything lower is stepped onto
and slopes and stairs are followed down. Off the ground, gravity applies; below the world's lowest point the player
returns to the spawn.
