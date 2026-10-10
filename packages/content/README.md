# @wdi/content

Every roster, number and scene id that `docs/GDD.md` and `docs/WORLD.md` describe, as JSON in
`data/`, validated by zod (`src/schemas/`, one schema per file) and by cross-file checks
(`src/validate.ts`). Importing the package parses every file and throws on any problem, so a bad
edit fails the first test, the server boot and the client build alike.

```ts
import { rosterFor, balanceFor, scenes, onubFor, abilities } from "@wdi/content";

rosterFor(7).deal;            // ["killer", "accomplice", "detective", ...] one role per player
balanceFor(7).killCooldownS;  // 35
scenes.tavern_bar.portals;    // [{ id: "tb.front", to: "overworld", toSpawn: "tavern_front", ... }]
onubFor(6).deck;              // 9 loaves for 6 players
```

## Files

| File | Holds | Source |
|---|---|---|
| `palette.json`, `metrics.json`, `style.json` | colour tokens, tile and render metrics, the STYLE FORMULA | ASSETS 6.1-6.4, 6.9; WORLD 4.2 |
| `traits.json` | height / scarf / hat values, overlay passes, body ids | GDD 3.1 |
| `roles.json` | factions, role cards, `rosters["4".."10"]` (`deal` = what V1 deals, `planned` = the GDD row) | GDD 3.1, 3.2 |
| `abilities.json` | every verb with a number: role abilities, item uses, universal verbs | GDD 3.2-3.7 |
| `items.json`, `clues.json`, `tasks.json` | items, clue types (frozen ids, sprite key `clue_<id>`), task templates | GDD 3.4, 3.5 |
| `balance.json` | phases, the per-count table `byCount["4".."10"]`, noise, health, vision, meeting rules | GDD 3.3-3.9 |
| `roles.onub.json`, `balance.onub.json` | quick-mode roles; decks, night windows, acts, timers, vote, winner table | GDD 3.11 |
| `scenes/<id>.json` | the 15 scenes of WORLD 4.3 | WORLD 4.3-4.5 |

Rules of the data:

- Every rules record carries `gddRef`, the GDD section its values come from. A number lives in
  exactly one place: global and per-count values in `balance.json`, a verb's cast time or cooldown
  on its `abilities.json` record, and so on. Noise is always a key into `balance.json` `noise`.
- Ids are camelCase for records (`sinEater`), snake_case for scenes and spawns (`tavern_bar`,
  `cave_side`) and `<scene prefix>.<name>` for portals, spots, props and gates (`tb.front`).
- Scene, portal, spawn and clue ids are frozen: V2 reads the same graph. Add, never rename.
- Nothing public (body ids, overlay passes, trait values, scene object ids) names a role; a test
  checks it.

## Scenes

Each scene has `size`, `profile` (`small` 4-6, `medium` 7-8, `large` 9-10 players), `portals`
(WORLD 4.5: `from`, `to`, `toSpawn`, `kind`, `oneWay`, `lock`, `window`, `noise`, `elevationDelta`,
`minProfile`), `spawns` (`x, y, z, facing`), `spots` (hiding and body spots), `props` (the
interact layer), `gates` (overworld districts shut below a profile), `paths` (wolf loops) and an
ASCII `grid`, one string per row, origin top-left, in tiles:

| `#` wall | `D` portal tile | `S` spawn | `H` hiding spot | `B` body spot | `.` floor |
|---|---|---|---|---|---|

`D`, `H` and `B` are solid and used from an orthogonally adjacent floor tile; `S` is floor; gate
tiles are floor that is solid below the gate's profile. Every `D`/`S`/`H`/`B` has exactly one
record at that tile and back. When Tiled replaces the grids (M6), the export keeps these objects
and ids; only `grid` becomes the `collision` layer of the `.nav.json` contract (ASSETS 6.3).

## Adding a record

1. Add the rule or number to `docs/GDD.md` first (or the id to `docs/WORLD.md`).
2. Add the record to the JSON file with its `gddRef`; for a new scene, add the file to `data/scenes/`,
   its id to `SCENE_IDS` in `src/schemas/scene.ts` and its import to `src/index.ts`.
3. `pnpm --filter @wdi/content format` lays the JSON out canonically (`lint` checks it).
4. `pnpm --filter @wdi/content test` must pass; add a test when the record carries a new rule.

Consumers resolve the package source under the `development` condition (Vite and Vitest do so by
default); plain Node loads the build in `dist/` (`pnpm --filter @wdi/content build`).
