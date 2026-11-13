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

Standard glTF, Y up, metres. `HM_Collision` is one mesh (the ground and simplified building and wall shells); the
viewer hides it and collides only with it, or with every mesh when it is missing. `Spawn_<id>` empties stand at
about ground level and face along their -Z. Everything else renders. Fog comes from the scene's extras (`fog_color`
with `fog_near` and `fog_far`, or `fog_density`); lights from `KHR_lights_punctual`, with a fallback hemisphere and
sun when there are none.

## Controls

Desktop: click for pointer lock and mouse look, WASD or the arrows, Shift runs. Touch: a stick under the left thumb
(pushed to the edge it runs), drag on the right half to look. Gamepad: left stick walks, right stick looks, a trigger
or the left-stick click runs. The numbers are in `src/config.ts`.

## Collision

A capsule floats one step height above the feet (`src/physics/controller.ts`): walls and anything taller than a step
stop it (three-mesh-bvh shapecast); five rays under its footprint find the ground, so anything lower is stepped onto
and slopes and stairs are followed down. Off the ground, gravity applies; below the world's lowest point the player
returns to the spawn.
