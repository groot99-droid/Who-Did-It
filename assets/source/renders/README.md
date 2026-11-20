# Render locks

One `<unit>.lock.json` per render unit an art drop ships (ASSETS 6.6): the `render.lock.json` that
`tools/blender/render_lock.py` wrote beside the manifest of that render, copied here under the unit's name. A unit is a
figure's look id (`baker`: its `char_baker`, `char_baker_2` and `ovl_baker` pages) or any other atlas's file name
(`props_hollowmere`, `vfx`, `iso_kit_harbour`).

```sh
cp build/render/baker/render.lock.json assets/source/renders/baker.lock.json
```

`tools/sprites/test/renders.test.ts` requires a lock for every shipped unit whose frames equal the lock's. A unit rendered
before the writer existed is listed in `tools/sprites/test/renderLegacy.ts`; the pull request that adds its lock deletes
its line.
