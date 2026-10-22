# Round-6 contract: M5b, resources, crafting, mobs, quests, mini-games

ROADMAP M5b, scheduled for round 6 since round 5: resource nodes and gathering; recipes and tool crafting
(Lantern, Crowbar, Lockpicks, Snare, Torch, Spade); random mobs with spawners and server-side dark visibility;
quests from NPC givers; main-mode mini-games at task stations with the fake Cabal list. Sessions: 6E (content
and GDD 3.14 to 3.16), 6F (gathering and crafting), 6G (mobs and dark visibility), 6H (quests and mini-games),
6I (the client), 6M (the art). The scene files already carry `nodes`, `spawners` and `givers`
(`packages/content/src/schemas/scene.ts:235-275`, read by nothing in M5a); `balance.wolves` and `items.json`'s
tool rows exist from v0.1. Paths shorten `apps/server/src/` to `server/`, `apps/client/src/` to `client/` and
`packages/content/` to `content/`.

## 1. Content (6E)

Every file is pre-seeded empty with a `strictObject` zod schema and a validator hook; 6E fills the rows and
the cross-reference checks. Numbers go in these files and `balance.json`, the rules in GDD 3.14 to 3.16.

| File | Schema | Rows | Cross-refs the validator checks |
|---|---|---|---|
| `content/data/resources.json` | `schemas/resources.ts` `ResourcesFile { resources: Record<Id, Resource> }`; `Resource { id, name, gatherS, yield, respawnS, tool?: ItemId, sprite }` | wood, stone, herb, ore, flax, oil, bone (6E picks the final set) | every `scene.nodes[].resource` names a row; a `tool` names an `items.json` row |
| `content/data/recipes.json` | `schemas/recipes.ts` `Recipe { id, out: ItemId, qty, in: { item: ItemId, qty }[], station: PropKind \| null, craftS }` | lantern, crowbar, lockpicks, snare, torch, spade (GDD 3.5's tools) | `out` and `in[].item` are `items.json` rows; `station` is a `routines.json` prop kind |
| `content/data/mobs.json` | `schemas/mobs.ts` `Mob { id, name, speedTiles, senseTiles, fleeLightTiles, attackS, kills: boolean, sprite }` | wolf, boar, bat, rat | every `scene.spawners[].mob` names a row |
| `content/data/quests.json` | `schemas/quests.ts` `QuestsFile { npcs: Record<Id, { name, look }>, quests: Record<Id, Quest> }`; `Quest { id, giver: Id, kind: 'fetch' \| 'contract', wants: { item, qty }[], reward: { item, qty }[], copyId }` | one giver per hub plus the Blackpine foreman; `contract` rows stay empty (round 7) | every `scene.givers[].npc` names an npc; items exist; `look` is a `looks.json` id |
| `content/data/minigames.json` | `schemas/minigames.ts` `Minigame { id, kind: 'crates' \| 'pour' \| 'slide' \| 'stoke', task: TaskId, difficulty, assistS }` | one per `tasks.json` row that is a station task | `task` is a `tasks.json` row |
| `content/data/items.json` | existing | adds lantern, lockpicks, snare, torch, spade (crowbar exists); `inventorySlots` stays 5 | |
| `content/data/balance.json` | existing | `resources { poolActiveFrac, stackMax }` (6E: a resource's hold time is its own `gatherS`), `mobs { maxPerScene, chaseS }`, `quests { maxActive }`, `vision.lanternTiles` (pre-seeded `0`), `npc.stuckTicks` (pre-seeded, for the invariant) | |
| the scene files | existing | `nodes`, `spawners`, `givers` on every map's scenes; the pools | |

`parseContent` and `Content` (`content/src/index.ts`) gain the five files (pre-seeded); `validateContent` gains
`checkM5b(c, err)` (pre-seeded empty, 6E fills). GDD 3.14 to 3.16 are 6E's, written from this table and the
Bible's Book IV where it fits (the macro-economy itself is round 8, `bible-seams.md` 2.2).

## 2. Server

`Step.ts`'s `runAiAndHazards` slot (`server/sim/Step.ts:20`, `:48`) becomes four pre-seeded stages:
`runDecay; runResources; runMobs; runQuests`, each a no-op in its owner's file until it lands.

### 2.1 Gathering and inventory (6F)

- `server/sim/Resources.ts`: at Start a node pool per match from `seeds.get('nodes')` (a new `StreamName`,
  pre-seeded): of each `pool`, `balance.resources.poolActiveFrac` of its spots are active; respawn timers in
  ticks; `gather` is a **hold action** (`C2S.hold { action: 'gather', targetId }`, `HoldAction` gains
  `'gather' | 'craft'`, pre-seeded) re-validated every tick like `collect` (`server/sim/Actions.ts`'s hold
  cases, 6F adds `gather` and `craft`). The wire is `SceneState.nodes: t.map(Node)` (pre-seeded schema,
  `Node { id, x, y, resource, active, carriedTicks }`), public to the scene like props.
- `server/sim/Inventory.ts`: `addStack(player, item, qty): boolean`, `take(player, item, qty): boolean`, five
  slots (`items.inventorySlots`), stacks for resources, one slot per tool. Tools from recipes are role-neutral:
  anyone may craft a lantern.
- `server/sim/Craft.ts`: `craft` as a hold at a station prop (a prop of the recipe's `station` kind within
  `doors.reachTiles`); the recipe's inputs are taken at the hold's end. The `runResources` stage also ticks
  respawns.

### 2.2 Mobs and dark visibility (6G)

- `server/sim/Mobs.ts` and `server/sim/mobs/{spawn,ai}.ts`: room-memory `MobSim` (never on the wire beyond
  `SceneState.mobs: t.map(Mob)`, pre-seeded, `Mob { id, kind, x, y, facing, state }`, no seat, no handle); an FSM
  `idle | roam | chase | flee | dead`; randomness only from `seeds.get('mobs', spawnerId)` (keyed stream,
  pre-seeded); pathing through `server/sim/npc/walk.ts`; a wolf that reaches a living seat in the dark calls
  `markDead(room, seat, 'wolf')` (`DeathCause` gains `'wolf'`, pre-seeded; `Kill.ts` and `Death.ts` accept it).
  NPC seats reuse `brain.flee` to run from a mob. `balance.wolves` (count, `fleeLightTiles`, the fence) is read
  as is; the fence task is M5.
- `server/sim/Sight.ts` (6G): `canSee(viewer: PlayerSim, x, y, scene): boolean`, a radius (`vision.nightTiles`
  in a dark scene or at night, plus `vision.lanternTiles` for a lit carrier) and Bresenham line of sight over
  the scene's nav grid. `reconcileAvatars` (`server/sim/Visibility.ts:95`) filters a living viewer's wanted set
  through it in dark scenes (pre-seeded hook line; it only ever removes avatars, never adds). Ghosts and the
  admin view see everything.
- **Lantern and torch**: `StatusBit.lantern = 8` (`server/sim/constants.ts`, `client/view/animIds.ts`,
  pre-seeded) on `Presence.status`, copied to `Avatar` by `publishAvatars` (6G's line); set while a lit lantern
  or torch is held, which also makes the carrier visible from further away (the `lanternTiles` radius applies
  to being seen too, GDD 3.7). The client's `Lighting.ts` draws the glow (6I).
- Tests: the FSM on fixtures; 10 NPC seats plus 3 wolves at p95 tick < 15 ms (the M5 gate, ROADMAP);
  `visibility.test.ts` gains the dark-scene cases.

### 2.3 Quests and mini-games (6H)

- `server/sim/Quests.ts`: givers are scene statics (`scene.givers`), drawn by the client like props with a look;
  `C2S.quest.accept { questId }` and `C2S.quest.turnIn { questId }` (pre-seeded, through the command queue);
  `Private.quests: t.array(QuestState)` (pre-seeded, own view only, `QuestState { id, progress, done }`);
  rewards through `Inventory.addStack`. `kind: 'contract'` is the round-7 vendetta seam and refuses in round 6.
- `server/sim/Minigames.ts` and pure `packages/shared/src/rules/minigames.ts` (6H owns both; the rule file is
  pre-seeded with throwing bodies): `generate(kind, rng): { public, solution }` and `check(kind, solution,
  answer): boolean`. A station task's hold (`HoldAction 'task'`) sends `S2C.minigameStart { taskId, kind, public
  }` (pre-seeded); the client answers `C2S.minigameResult { taskId, answer }` (pre-seeded, rate-limited), the
  server checks it against the solution it kept in room memory and completes the task. **A Cabal seat's fake
  task** runs the same mini-game and never touches `GameState.taskBar` (`balance.tasks.cabalFakeList`, GDD 3.5).
  The mini-game kinds are the ONUB four (crates, pour, slide, stoke), whose client widgets 6I reuses.

## 3. Client (6I)

- Views: `client/view/{NodeView,MobView,GiverView}.ts` from the new `SceneState` maps through the world feed
  (`net/world.ts` gains `nodes()`, `mobs()` readers, pre-seeded types; `worldColyseus.ts` and the mock fill
  them, 6I); `Lighting.ts` draws the lantern glow around a `StatusBit.lantern` avatar.
- UI: `client/ui/{Inventory,Crafting,QuestLog}.ts` as DOM panels; the hold prompts for gather and craft beside
  the existing collect prompt; `client/view/minigames/**` wraps the ONUB widgets of `view/onub/minigames/` in a
  DOM modal for the main mode (the widgets stay 5C's files; 6I imports them).
- Copy in a new `ui/copy/m5b.ts`; UI.md 14.19; the "Round 6 (6I)" block of `components.css`.
- Tests: each panel on the mock; `e2e/m5b.spec.ts` (mock) gathers, crafts a lantern and turns in a quest.

## 4. Art (6M)

`tools/sprites/placeholder-m5b.ts` (pre-seeded module in `MODULES`, `order` 80) for the stand-ins, then the
real sprites in both styles: nodes (one per resource, two states), mobs (wolf, boar, bat, rat; 8 directions,
idle, walk, attack), givers (one look each, reusing `char_<lookId>` where the giver is a known look), the six
tools as icons and held overlays, the lantern and torch glow sprites. Keys and sizes in SPRITES.md (6M's
section); CREDITS rows per ASSETS 6.5. 6M needs 6E's ids first and nothing else.

## 5. Order

6E first (content and ids), then 6F, 6G and 6H in parallel on the server, 6M in parallel on the art, and 6I
on the mock from 6Z's types and on the live feed once 6F to 6H merge. `Resources.ts`, `Mobs.ts` and `Quests.ts`
never import one another: a mob kill goes through `markDead`, a quest reward through `Inventory`, and a node
is read by `Quests` only through `SceneState`.
