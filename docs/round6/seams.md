# Round-6 seams

Every hook the round-6 pre-seed creates, where it is called, and what each session hands another. The pre-seed is
additive (DECISIONS A81) and lands on top of a60d855 in six steps (`docs/SESSIONS.md` Round 6, "Pre-seeded"):
the shared wire and schema, the content stubs, the server stubs and locked call sites, the client stubs, the
`tools/auto` skeleton with the test helpers, and the `soak.yml` leg. **This document is edited by 6Z as each
step lands**: a row marked "pending" names a step that has not landed yet, and the line numbers are those of
the working tree after the step (the function named beside each is the anchor).

**How to read the tables.** A hook lives in its owner's file; the owner fills the body and keeps the signature.
A locked call site is in a file the owner does not own: the call stays as it is, and a change to it goes
through the orchestrator. Paths are from the repo root, with `apps/server/src/` shortened to `server/`,
`apps/client/src/` to `client/` and `packages/content/` to `content/`.

## 1. Pre-seeded hooks

### 1.1 Shared wire, schema and constants (locked; step 1)

| Item | File | State |
|---|---|---|
| `C2S.questAccept = 'quest.accept'`, `C2S.questTurnIn = 'quest.turnIn'`, `C2S.minigameResult = 'minigame.result'`, their payloads and `RATE_LIMITS` rows | `packages/shared/src/protocol/index.ts` | pending |
| `HoldAction` gains `'gather' \| 'craft'` | `packages/shared/src/protocol/index.ts:55` | pending |
| `S2C.cutscene { id; scope?: 'all' }`, `S2C.minigameStart { taskId; kind; public }` | `packages/shared/src/protocol/index.ts` | pending |
| `killed.cutsceneId?: string` | `packages/shared/src/protocol/index.ts:326` | pending |
| `DeathCause` gains `'wolf'` | `packages/shared/src/protocol/index.ts:65` | pending |
| `packages/shared/src/protocol/admin.ts`: `ADMIN_C2S`, `ADMIN_S2C` and their payloads (`auto-admin.md` 6), re-exported, documented in its own `PROTOCOL.md` section | new | pending |
| `StatusBit.lantern = 8` | `server/sim/constants.ts:22`, `client/view/animIds.ts` | pending |
| schema `SceneState.nodes: t.map(Node)`, `SceneState.mobs: t.map(Mob)`, `Private.quests: t.array(QuestState)`, `GameState.lawStage: u8()`, `Role.evolvedFrom: t.string()`; `SCHEMA_VERSION = 3` | `packages/shared/src/schema/index.ts` | pending |
| `packages/shared/src/rules/{cutscenes,minigames}.ts` | new; `deathCutsceneFor(cause)` returns null, `openingFor(map)` returns null; `generate` and `check` throw | pending |
| `docs/PROTOCOL.md` regenerated (`pnpm docs:protocol`) | | pending |

### 1.2 Content (locked; step 2)

| Item | File | State |
|---|---|---|
| `cutscenes/cutscenes.json` (empty index) and `schemas/cutscenes.ts` | `content/data/cutscenes/`, `content/src/schemas/` | pending |
| `music.json` and `schemas/music.ts` | `content/data/`, `content/src/schemas/` | pending |
| `resources.json`, `recipes.json`, `mobs.json`, `quests.json`, `minigames.json` and their schemas, each an empty record | the same | pending |
| `vendettas.json`, `evolutions.json`, `events.json`, `laws.json` and their schemas, each an empty record | the same | pending |
| `parseContent`, `Content`, the `content` export and `validateContent` gain the twelve files; `checkM5b(c, err)` empty | `content/src/index.ts:130`, `validate.ts:50` | pending |
| `balance.phases.openingS = 0`, `balance.vision.lanternTiles = 0`, `balance.ui.transitionS = { fade: 0, iris: 0, wipe: 0 }`, `balance.npc.stuckTicks`, `balance.resources`, `balance.mobs`, `balance.quests` (placeholder rows 6E tunes) | `content/data/balance.json`, `schemas/balance.ts` | pending |

### 1.3 Server (step 3)

| Hook | File | Owner | Locked call site | Stub body |
|---|---|---|---|---|
| `clockOf(room)`, `stepsThisTick(clock, lastMs)`, `MAX_SIM_MS_PER_TICK` | `server/sim/auto/clock.ts` | 6A | `server/rooms/PartyRoom.ts:108` (the `setFixedTimestep` loop, which runs the three calls `n` times and records `elapsed / n`) | `stepsThisTick` returns 1 |
| `enableAuto`, `queueAutoStart`, `autoOf`, `runAuto` | `server/sim/auto/Auto.ts` | 6A | `server/sim/Step.ts` (`runAuto`, before `runNpcs`) | `runAuto` no-op; `autoOf` returns `simOf(room).auto` |
| `RoomSim.auto: AutoState \| null` | `server/sim/RoomSim.ts` | 6A (writes), all (read) | `preyFor`, `startRefusal` | `null` |
| `preyFor(room, player, p, isNpc)` (renamed from `soleHuman`) | `server/sim/npc/world.ts:82` | 6A | `server/sim/npc/world.ts:198` (`runWorldBrain`) | today's body with the `npcPrey` clause |
| `startRefusal` auto branch | `server/rooms/handlers/lobby.ts:106` | 6A | `lobby.ts:125` (`runLobbyCommands`) | `if (simOf(room).auto) { /* 6A */ }` before the human minimum |
| `registerInvariant`, `runInvariants` | `server/sim/auto/invariants.ts` | 6B | `apps/server/test/autoHelpers.ts`, `tools/auto` | an empty registry |
| `SimEvent`, `emitSim`, `onSim`, `runEvents` | `server/sim/events/bus.ts` | 6B | `server/sim/Step.ts` (`runEvents`, after `runPhases`) | `runEvents` no-op; `emitSim` appends to a per-room array |
| `MatchLog` `event: 'auto'` | `server/sim/Win.ts logMatch` | 6B | | not pre-seeded; 6B adds the line |
| `appendLog(room, ev)`, `logHash(room)` | `server/sim/auto/log.ts` | 6B | the harness | throws |
| `adminConfig`, `signAdminToken`, `verifyAdminToken`, `installAdminAuth`, `TOKEN_TTL_S` | `server/services/adminAuth.ts` | 6C | `server/server.ts` (the admin block: `if (cfg) { installAdminAuth(app, cfg); rooms.admin = defineRoom(AdminRoom) }`) | `adminConfig` returns null; the rest throw |
| `class AdminRoom extends PartyRoom` | `server/rooms/AdminRoom.ts` | 6C | `server.ts` (registered only under `cfg`) | `onAuth` throws the generic join error |
| `registerAdminHandlers(room)` | `server/rooms/handlers/admin.ts` | 6C | `AdminRoom.onCreate` | no-op |
| `createAdminView`, `reconcileAdminView`, `isAdminClient` | `server/sim/auto/AdminView.ts` | 6C | `server/sim/Visibility.ts:61` (`reconcileViews`: `if (isAdminClient(room, client.sessionId)) { reconcileAdminView(room, client); continue; }` before the `viewer` lookup) | `isAdminClient` returns false |
| `runResources`, `runMobs`, `runQuests` | `server/sim/Resources.ts`, `Mobs.ts`, `Quests.ts` | 6F, 6G, 6H | `server/sim/Step.ts:48` (in place of `runAiAndHazards`, after `runDecay`) | no-ops |
| `handleGather`, `handleCraft` hold cases | `server/sim/Actions.ts` | 6F | the hold switch | refuse 422 "cannot do that" |
| `handleQuestAccept`, `handleQuestTurnIn`, `handleMinigameResult` | `server/sim/Quests.ts`, `Minigames.ts` | 6H | `server/sim/Commands.ts` (the C2S switch) | refuse 422 |
| `canSee(viewer, x, y, scene)` | `server/sim/Sight.ts` | 6G | `server/sim/Visibility.ts:103` (`reconcileAvatars`: the wanted set is filtered through `canSee` for a living viewer in a dark scene) | returns true |
| `openingFor` broadcast and `openingS` | `server/rooms/handlers/lobby.ts:319` (`beginPlay`, after `publishLooks`) | 6J | locked | `const opening = openingFor(mapIdOfRoom(room)); if (opening) room.broadcast(S2C.cutscene, { id: opening });` and `graceS + openingS` |
| `cutsceneId` on `killed` | `server/sim/Death.ts` (`markDead`) | 6J (the rule), locked line | | `cutsceneId: deathCutsceneFor(cause) ?? undefined` |
| `StreamName` gains `'nodes'`, `'mobs'`, `'contract'`, `'events'` | `server/sim/seeds.ts:23` | locked | | listed |
| `seeds.test.ts` allowlist: `sim/auto/Auto.ts` may assign `fixedSeeds` | `apps/server/test/seeds.test.ts` | locked | | the test's allowlist |
| `runAutoMatch` | `apps/server/test/autoHelpers.ts` | 6A | `auto.test.ts`, `tools/auto` | throws |

### 1.4 Client (step 4)

| Hook | File | Owner | Locked call site | Stub body |
|---|---|---|---|---|
| route `#/admin` and scene `Admin` | `client/main.ts:27` (scene list, after `GameOver`), `client/net/worldRouter.ts` (the route switch) | 6D | locked | an empty scene |
| `client/admin/{AdminNet,AdminSceneView,Controls,SeatInspector,LogPane,mockAdmin}.ts` | new | 6D | `scenes/Admin.ts` | empty exports |
| `REMOTE_DELAY_MS` becomes `remoteDelayMs(scale = 1)` with the constant kept | `client/view/interpolation.ts:6` | 6D | `PlayerView` (unchanged call) | `150 / scale` |
| `planTimeline`, `advance` | `client/view/cutscene/sequencer.ts` | 6J | `CutscenePlayer` | throw |
| `CutscenePlayer.play(cutscene, ctx)` | `client/view/cutscene/CutscenePlayer.ts` | 6J | `client/scenes/World.ts` (after `fadeIn`, `:263`, when `REG_CUTSCENE` is set; and in the `onKilled` handler, `:236`) | resolves `'done'` at once |
| `REG_CUTSCENE` | `client/scenes/registry.ts` | locked | `worldRouter.ts` sets it from the `cutscene` feed event; `World.ts` reads and clears it | |
| `WorldFeedEvents.cutscene` | `client/net/world.ts:114` | locked | `worldColyseus.ts` routes `S2C.cutscene`; `mock/worldMock.ts` emits nothing until 6J | |
| `mountLoadingScreen(scene)` | `client/view/LoadingScreen.ts` | 6K | `client/scenes/Preload.ts` (before `load.start()`) | no-op |
| `transition(kind, ms)` | `client/view/Transition.ts` | 6K | `client/net/worldRouter.ts:75`, `:86`, `:96` (each `scene.start` awaits it with `balance.ui.transitionS` times 1000) | resolves at once |
| `MusicBus`, `MusicDirector`, `audioSettings` | `client/view/{MusicBus,MusicDirector,audioSettings}.ts` | 6L | `client/net/worldRouter.ts` (the director is installed beside the feed), `scenes/Landing.ts` (the bus in the registry) | no-ops; `readAudioSettings` returns `{ music: 1, sfx: 1, muted: false }` |
| `mountSettingsPanel(root)` | `client/ui/SettingsPanel.ts` | 6L | `ui/Landing.ts`, `ui/Lobby.ts`, `view/Hud.ts` (a gear slot each) | renders nothing |
| `WorldFeed.nodes()`, `mobs()`, `quests()`, `minigame` event | `client/net/world.ts` | locked (types); 6I fills `worldColyseus.ts` and the mock | | empty maps, no events |
| `NodeView`, `MobView`, `GiverView` | `client/view/` | 6I | `scenes/World.ts` (constructed beside `ClueView`) | draw nothing |
| `placeholderEntries()` (m5b: `order` 80) | `tools/sprites/placeholder-m5b.ts` | 6M | `tools/sprites/placeholder.ts:18` (`MODULES`) | an empty list |

### 1.5 Tools and CI (steps 5 and 6)

| Item | File | Owner | State |
|---|---|---|---|
| `@wdi/auto` package (`run.ts`, `package.json`, `tsconfig.json`, `vitest.config.ts`), root script `auto` | `tools/auto/` | 6A (`run.ts`), 6B (`report/`, `checks/`) | pending; `run.ts` prints usage and exits 2 |
| `tools/sprites/test/media.test.ts` | `tools/sprites/test/` | 6K | pending; skips when a manifest is missing |
| `assets/video/manifest.json`, `audio/music/manifest.json` | `apps/client/public/assets/` | 6N (rows), 6K and 6L (shape) | pending; empty lists |
| `soak.yml` `auto` leg | `.github/workflows/soak.yml` | 6B | pending; `pnpm auto -- --matches 20` with `continue-on-error` until 6A lands |

## 2. Producer -> consumer

| Producer -> consumer | Contract | Until it lands |
|---|---|---|
| pre-seed -> all | the hooks of section 1; the content stubs; the wire | the stubs |
| 6A -> 6B | `runAutoMatch`, `AutoResult.events` and `failures`; `enableAuto`'s `npcIds` for replay | 6B tests its invariants on `npcHelpers` rooms (`advance`) |
| 6A -> 6C | the clock commands (`admin.clock` maps to `AutoCommand`), `autoOf(room).commands` | 6C queues the commands; `runAuto` is 6A's |
| 6A -> 6D | `effectiveScale` in `admin.snapshot` | the mock snapshot |
| 6B -> 6C, 6D | `admin.invariant` rows from `runInvariants`; `admin.event` from the bus | the mock emits scripted rows |
| 6C -> 6D | the `admin` room, the token flow, `admin.snapshot` every tick | `mockAdmin.ts` |
| 6E -> 6F, 6G, 6H, 6I, 6M | the ids and numbers of `m5b-data.md` 1 | the empty records; 6F to 6H write their tests on fixtures |
| 6F -> 6H | `Inventory.addStack` and `take` for quest rewards and wants | 6H's tests stub the inventory |
| 6G -> 6F | nothing (a node is not a mob) | |
| 6G -> 5F's `publishAvatars` | the `lantern` bit copied to `Avatar.status` | the bit is never set |
| 6F, 6G, 6H -> 6I | `SceneState.nodes`, `mobs`, `Private.quests`, `minigameStart` | the mock feed |
| 6J -> 6K | nothing shared: the cutscene camera and the transition layer never run at the same time (the opening starts after the `sceneEnter` fade) | |
| 6J -> 6L | `audio` steps name `narr_*` and `sting_*` keys 6L adds to `AUDIO_KEYS` | a missing key logs and plays nothing |
| 6L -> 6N | the music manifest shape and the per-map budget | 6N masters to it |
| 6K -> 6N | the video manifest shape and the 2 MB cap | 6N cuts to it |
| 6N -> 6K, 6L | the files and rows | the empty manifests; the poster frame; silence |
| 6A, 6B -> 6P | `pnpm auto -- --matches 50` on both maps, both modes, every difficulty | |
| 6Z -> all | `docs/round6/**`, this file kept current per step | |

## 3. Loose ends

- `docs/ARCHITECTURE.md` 5.3 "Start flow" still describes Start seeding `mulberry32` (round 5's loose end);
  6A's `enableAuto` is the moment to rewrite that paragraph.
- `apps/server/test/npcHelpers.ts advance()` and `autoHelpers.ts runAutoMatch()` both loop `step`; 6A keeps
  one implementation (`advance`) and has the other call it.
- `tools/sprites/test/budget.test.ts` counts textures only; `media.test.ts` (6K) is a second file, not an
  edit of it.
