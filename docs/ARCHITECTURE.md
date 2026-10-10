# Technical Architecture

> Generated from `docs/MASTER_PLAN.md` (v0.1, 2026-10-10). Stack, monorepo, lobby flow, state and privacy model, protocol, netcode, deployment, testing and the V2 path. Rosters and balance come from `packages/content/data/*.json`, never from this file.

## 5. Technical architecture

### 5.1 Versions

| Component | Pin | Note |
|---|---|---|
| Node / pnpm | 22.12+ / 10 | `.nvmrc` 22; `engines.node >= 22.12` |
| Phaser | 3.90.0 (owner decision; see open question 1) | No Phaser-4-only features used; `pixelArt: false` globally |
| Colyseus | `colyseus ^0.18.9`, `@colyseus/core ^0.18.18`, `@colyseus/schema ^5.0.36`, `@colyseus/sdk ^0.18.5`, `@colyseus/testing ^0.18.6` | Never `colyseus.js` |
| Vite / Vitest / Playwright | ^8.3 / ^5.0 / ^1.64 | |
| TypeScript | ~5.9 | 7.x breaks typescript-eslint until 7.1 |
| Blender / Tiled / Audacity | 5.2 LTS / 1.11 / 4.0.1 | Tiled only from M6 |

### 5.2 Monorepo

```
Who-Did-It/
├─ package.json  pnpm-workspace.yaml  .nvmrc  .gitattributes  tsconfig.base.json  eslint.config.js
├─ .github/workflows/ci.yml  pages.yml          # only two workflows
├─ LICENSE (MIT, code)  LICENSE-ASSETS  CREDITS.md  LICENSES/
├─ apps/client/      # Phaser + Vite; base '/Who-Did-It/'; src/{main,net,scenes,view,ui,flags}
├─ apps/server/      # Colyseus; src/{index,rooms/PartyRoom,rooms/handlers,sim/{Step,Commands,Collision,Visibility,Portals},services}
├─ packages/shared/  # @wdi/shared: schema/, protocol/, rules/, constants.ts, metrics.ts, version.ts
├─ packages/content/ # @wdi/content: data/{roles,traits,items,abilities,clues,tasks,balance,metrics}.json, scenes/*.json, zod validators
├─ tools/            # grid/export.ts (ASCII grid -> tilemap + nav), tiled/export.ts (M6), sprites/{placeholder,pack,gen-anims}.ts, blender/{render_rig.blend,batch_render.py,palettize.py}, bots/swarm.ts
├─ assets/source/MANIFEST.md   # masters live outside the repo
└─ docs/
```

### 5.3 Lobby and join-code flow

Create: `client.create("party", { name, build, deviceId })`. `onCreate` draws a 5-char code from the unambiguous alphabet, checks uniqueness with `presence.sadd("wdi:codes")`, sets `this.roomId = code`, `setMatchmaking({ private: true })`, `maxClients = 10`. Join: `client.joinById(code.toUpperCase(), opts)`. Every joinById failure (missing, locked, full, version mismatch) returns one generic "party not found or unavailable"; specific codes exist only inside a room. Released codes keep a 30-minute presence TTL before reuse. The matchmake route sits behind `trust proxy` with a per-forwarded-IP token bucket (30/min, burst 10) and a global cap (300 joinById/min). Start: `players.size >= 4`, phase lobby, leader only; Ready is advisory. Kick, transfer and leader handoff ship in M7; a kicked device is banned by `deviceId` + name for that room.

### 5.4 State schema and role secrecy

Schema 5 builder style, no decorators, every Schema under 63 fields, four privacy classes:

```ts
// packages/shared/src/schema/index.ts (excerpt)
export const Presence = schema({ x: t.int16(), y: t.int16(), z: t.int8(), yaw: t.float32(),
  animId: t.uint8(), statusBits: t.uint16(), transitUntilTick: t.uint32() }, "Presence");
export const Private = schema({ role: Role, inventory: Inventory, notebook: t.array(NotebookEntry),
  tasks: t.array(TaskEntry), cabalMates: t.array(t.string()), cooldownEndTick: t.map(t.uint32()),
  ledger: t.array(LedgerLine), lensCharges: t.uint8(), myVote: t.string() }, "Private");
export const Player = schema({
  id: t.string(), name: t.string(), traits: Traits, alive: t.boolean(), connected: t.boolean(),
  ready: t.boolean(), hasVoted: t.boolean(), sceneId: t.uint8(),          // Public roster
  presence: Presence.view(),                                             // SceneScoped (V1) / Proximity (V1.5)
  priv: Private.view(),                                                  // Own client only
}, "Player");
export const Door = schema({ id: t.string(), state: t.uint8() /*0 open 1 closed 2 locked 3 broken*/, swingUntilTick: t.uint32() }, "Door");
export const SceneState = schema({ doors: t.map(Door), spots: t.map(Spot), bodies: t.map(Body), clues: t.map(Clue), props: t.map(Prop) }, "SceneState");
export const GameState = schema({ schemaVersion: t.uint8(), phase: t.uint8(), phaseEndsTick: t.uint32(), tick: t.uint32(),
  round: t.uint8(), leaderId: t.string(), settings: Settings, taskBar: t.uint8(),
  players: t.map(Player), scenes: t.map(SceneState).view(), meeting: MeetingState, winner: t.uint8() }, "GameState");
```

`onJoin` sets `client.view = new StateView()` and adds the player's own `Player` (so `priv` arrives) and the `SceneState` of its scene. `Visibility.ts` moves `scenes` entries and other players' `presence` in and out of views on scene change (V1) and, in V1.5, by radius + occluder raycast at 5-10 Hz with a +1 tile hysteresis so a sprite has history before it is visible. Role, inventory, notebook and cooldowns are therefore never on the wire for other clients; `animId` uses one shared `swing` id for Kill, Crowbar and Check so the animation never discriminates. Fingerprint toucher logs, Blood timers and Case Board intersections stay in room memory. Votes are stored in `priv.myVote`; only `hasVoted` is public; the tally is published in `voteResult`. The meeting phase, board rows and missing list are in `MeetingState` so a reconnecting client rebuilds the UI from state. A fuzz test diffs the state a non-Cabal bot receives over a scripted kill and asserts no field change correlates uniquely with the killer.

### 5.5 Message protocol

| Dir | Type | Payload | Limit |
|---|---|---|---|
| C->S | `input.move` | `{seq, dx, dy, sprint, sneak}` 20 Hz, one applied per tick (newest wins), vector normalised server-side | 25/s |
| C->S | `act.interact` | `{targetId}` doors, containers, bodies, tasks | 5/s |
| C->S | `act.ability` | `{abilityId, targetId?}` | 5/s |
| C->S | `act.hold` | `{action: drag|collect|task|inspect|autopsy, targetId, on: boolean}` re-validated every tick | 5/s |
| C->S | `act.hide` / `act.check` / `act.burst` | `{spotId}` | 5/s |
| C->S | `act.enterPortal` | `{portalId}` (request/response) | 2/s |
| C->S | `act.reportBody` / `act.bell` | `{bodyId}` / `{}` | 2/s |
| C->S | `act.present` | `{entryId}` | 2/s |
| C->S | `meeting.vote` | `{targetId \| "skip"}` | 2/s |
| C->S | `chat.say` / `chat.quick` / `world.ping` | `{text}` / `{phraseId}` / `{x, y}` (channel derived server-side) | 2/s |
| C->S | `role.ready`, `net.ping` | `{}` / `{t}` | – |
| S->C private | `roleReveal` | `{roleId, team, goal, abilities[{id,name,key,cooldown,uses}], inventory[{defId,qty,tooltip}], cardText, beware, teammates[], traits}` | |
| S->C private | `sceneEnter`, `clueFound`, `killed`, `chat.msg` | `{sceneId, spawn, facing}` / entry / `{sceneId}` / `{from, text, channel}` | |
| S->C | `phaseChange`, `meetingStart`, `voteResult`, `gameOver`, `noise`, `error` | `{phase, endsTick}` / `{reason, callerId, bodyOf?, missing[]}` / `{tally, ejectedId?, role?}` / `{winner, roles, summary}` / `{sceneId, x, y, kind}` / `{code, msg}` | |

Error codes: 422 cannot, 423 locked, 424 cooldown, 425 wrong phase, 426 busy, 427 out of range, 428 closed (profile). `docs/PROTOCOL.md` is generated from `@wdi/shared/protocol`.

### 5.6 Movement, actions and netcode

```ts
// apps/server/src/sim/Step.ts — fixed order inside setFixedTimestep(step, 20, { subSteps: 2 })
export function step(room: PartyRoom, ctx: StepContext) {
  room.state.tick++;
  applyInputs(room);          // exactly one input per client, newest wins, server-normalised, speed table by sprint/sneak/wounded
  moveAndCollide(room);       // swept AABB vs nav bitmap; 250 ms position ring per player
  runCommands(room);          // queued act.* in arrival order: kill, interact, hold, hide/check, present
  runPortals(room);           // synchronous; sets busy/transit, clears inputs, bumps lastInputSeq
  runAiAndHazards(room);      // wolves, decay, clue GC (cap 40 clues per scene, oldest Claimed first)
  if (room.state.tick % 4 === 0) reconcileViews(room);   // Visibility.ts at 5 Hz
  checkPhaseAndWin(room);
}
```

Every C->S action is queued and consumed inside `step()`; nothing mutates state in a message callback. Players have a `busy` state (dying, transit, hidden, channelling) during which actions on or by them are rejected with 426. Kills resolve on the validated tick (the 1 s animation is cosmetic) with range slack of `range + maxSpeed * 0.25 s` against the position ring, same scene, alive, not hidden, not bandaged, and a nav raycast. Held actions are start/stop commands re-validated every tick. `patchRate` 50 ms; the client lerps remote players with a 150 ms delay and teleports a sprite on view add. No client prediction in V1 (lerp only; the local player moves on server echo with input-rate smoothing). Positions are `int16` pixels, enums `uint8`, time is the tick counter. The swarm bot publishes tick-time and patch-size histograms through `/health`; M4 is gated on p95 tick < 15 ms with 10 bots and 3 wolves.

### 5.7 Scene sync

`act.enterPortal` validates distance, lock state, profile and phase, sets `sceneId`, position and the 0.6 s transit, swaps `scenes` view entries and other players' `presence`, and broadcasts a door `swing` plus a noise event. The client `World` scene restarts with the new `sceneId` and loads only that scene's manifest. Meetings run the same transition path for every player (busy, input clear, `sceneEnter` to a spread spawn). After a meeting everyone stays at the square; hiding spots are emptied; bodies stay. Ghosts bypass portal checks and get an all-scenes view flag.

### 5.8 Rules engine

`packages/shared/src/rules`: pure functions with a seeded PRNG (`mulberry32`) and tick-based time: `assignRoles(ids, settings, rng)` reads `roles.json` by count; `dealTraits`; `validateKill(actor, target, scene, tick)`; `generateClues(kill, sceneGraph, rng)` (2 of 3 traits, print, Blood, smear); `resolveVotes(votes, alive, suspectSet, consecutiveNoEject)`; `intersectSuspects(verified, living)`; `checkWin(state)` (parity with Thief/Drifter exceptions, practice rule, tasks, Final Night); `rollCall(state)`. Property tests cover every roster row ("Detective present at 4", counts per size, seed reproducibility). The room only orchestrates: read state, call rule, write state.

### 5.9 Client

Scenes: `Boot` (flags, `/health` poll) -> `Preload` -> `Landing` (DOM) -> `Lobby` (DOM) -> `RoleReveal` (DOM, CSS flip) -> `World` (restart per `sceneId`, camera follow with bounds and 0.1 lerp) -> `Meeting` (launched over a sleeping `World`) -> `GameOver`. HUD, inventory, notebook, chat, board and touch controls are a DOM overlay with `pointer-events: none` except on controls; Phaser draws world prompts and nameplates. `NetworkService` wraps `@colyseus/sdk` with `Callbacks.get(room)`, typed `send` / `request`, a `mitt` bus, and the reconnection token in `localStorage` keyed by room code (cleared on consented leave or game over). `EntityView` maps players and scene entities to sprites; `PlayerView` composes body + scarf + hat + blood overlays and picks `char/<body>/<anim>/<dir>` keys; a shared `dirFromVector(dx, dy)` in `@wdi/shared` with a unit test is the only direction table. Input is timer-driven at 20 Hz, decoupled from rAF, coalesced after `visibilitychange`.

### 5.10 Deployment

- `ci.yml` (push / PR): checkout@v7, setup-node@v7 (22), pnpm via corepack, `pnpm lint && pnpm typecheck && pnpm test`, a dist size report.
- `pages.yml` (main): build the client with `VITE_SERVER_URL` and `VITE_BUILD_VERSION=${GITHUB_SHA::8}` from Actions variables, configure-pages@v6, upload-pages-artifact@v5 (`apps/client/dist`), deploy-pages@v5; Pages source = GitHub Actions; `base: '/Who-Did-It/'`; hash routing.
- **Server host: Railway Hobby ($5/month, always-on, managed wss)** deployed through Railway's GitHub integration with Nixpacks (build `pnpm --filter @wdi/server build`, start `node apps/server/build/index.js`, `NODE_ENV=production`, `WDI_DEBUG` unset). No Dockerfile, no deploy workflow, no staging server, no PR previews. Fallback for early playtests: Render Free with the "waking" landing state. Single process; no Redis.
- `GET /health` -> `{ok, build, rooms, tickP95, patchBytes}`. CORS restricted to `https://groot99-droid.github.io` and localhost. The client pings every 20 s. `BUILD_VERSION` from `@wdi/shared/version.ts` is injected on both sides; mismatches are refused with the generic join error and the client shows "refresh to update".

### 5.11 Security

Every action validated server-side (range, phase, cooldown, ownership, alive, busy). `maxMessagesPerSecond = 100` as a hard cap; per-type token buckets drop rather than disconnect; disconnect only after 3 overflows in 10 s. Names 2-16 characters, server-side profanity list (M7). Chat channels derived from alive status and role; the client's channel field is ignored. Debug handlers register only with `WDI_DEBUG=1` and never in production; a CI test asserts `debug.roles` is absent from a production build. Seeds sent to clients drive cosmetics only. `onLeave` during play spawns a "vanished" body; in lobby it frees the seat.

### 5.12 Testing

Vitest (shared): property tests for roles, traits, votes, suspects, win checks, `dirFromVector`. `@colyseus/testing`: 10 bots join; each sees its own `priv` and nobody else's; a bot in the tavern receives no `presence` for a player in the overworld; start -> `phaseChange`; portal updates `sceneId` and view contents; vote -> `voteResult` with no tally before reveal; drop / reconnect keeps seat and notebook; 11th join and version mismatch refused; 1,000 joinById calls from one IP are throttled; Blood state absent from the meeting roster. Playwright: two contexts create / join / start and both see a role card. `tools/bots/swarm.ts`: random-walk load clients only (no task or report behaviour).

### 5.13 V2 migration path

Stays: server, `@wdi/shared`, `@wdi/content`, lobby, CI, hosting. Changes: renderer (Three.js or Babylon.js), input gains `yaw` (field already reserved), `ISceneCollider` gets a capsule-vs-navmesh implementation, `Visibility.ts` gets a cone + occlusion predicate (the policy hook already exists), `zoneId` diverges from `sceneId` for merged volumes. Gate: V2 starts only when V1 rules tests are green and content JSON is frozen behind `schemaVersion`.
