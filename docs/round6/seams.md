# Round-6 seams

Every hook the round-6 pre-seed creates, where it is called, and what each session hands another. The pre-seed is
additive (DECISIONS A81) and lands on top of a60d855 in six steps (`docs/SESSIONS.md` Round 6, "Pre-seeded"):
the shared wire and schema, the content stubs, the server stubs and locked call sites, the client stubs, the
`tools/auto` skeleton with the test helpers, and the `soak.yml` leg. **Every step has landed** (the commits are listed
under "Round 6 log: 6Z" in `docs/SESSIONS.md`); a row says what each stub does today.

**How to read the tables.** A hook lives in its owner's file; the owner fills the body and keeps the signature.
A locked call site is in a file the owner does not own: the call stays as it is, and a change to it goes
through the orchestrator. Paths are from the repo root, with `apps/server/src/` shortened to `server/`,
`apps/client/src/` to `client/` and `packages/content/` to `content/`.

## 1. Pre-seeded hooks

Line numbers are the working tree's after step 6 (2026-10-22); a commit can shift them by a few lines, and the
function named beside each one is the anchor.

### 1.1 Shared wire, schema and constants (locked; step 1)

| Item | File | State |
|---|---|---|
| `C2S.questAccept = 'quest.accept'`, `C2S.questTurnIn = 'quest.turnIn'`, `C2S.minigameResult = 'minigame.result'`, their payloads and `RATE_LIMITS` rows (2/s) | `packages/shared/src/protocol/index.ts:30-35`, the `C2SPayloads` tail, the `RATE_LIMITS` tail | landed |
| `HoldAction` gains `'gather' \| 'craft'`; `MinigameKind` | `packages/shared/src/protocol/index.ts:66`, `:68` | landed |
| `S2C.cutscene { id; scope?: 'all' }`, `S2C.minigameStart { taskId; kind; public }` | `packages/shared/src/protocol/index.ts:57-59`, the `S2CPayloads` tail | landed |
| `killed.cutsceneId?: string` | `packages/shared/src/protocol/index.ts:348` | landed |
| `DeathCause` gains `'wolf'` | `packages/shared/src/protocol/index.ts:78` | landed |
| `packages/shared/src/protocol/admin.ts`: `ADMIN_C2S`, `ADMIN_S2C`, `AdminC2SPayloads`, `AdminS2CPayloads`, `AdminSeat`, `AdminMob`, `InvariantFailure`, `SimEventWire`, `AdminJoinOptions`, `ClockScale`; `protocol/seeds.ts` (`SeedWords`, `FixedSeeds` for the wire); re-exported from `protocol/index.ts`; rendered as `PROTOCOL.md` "Admin (WDI_ADMIN only)" by `scripts/protocol-doc.ts` | new | landed |
| `StatusBit.lantern = 8` | `server/sim/constants.ts`, `client/view/animIds.ts` | landed |
| schema `Node`, `Mob`, `SceneState.nodes: t.map(Node)` (`:146`), `SceneState.mobs`, `QuestState`, `Private.quests: t.array(QuestState)` (`:219`), `GameState.lawStage: u8()` (`:346`), `Role.evolvedFrom: str()` (`:159`); `SCHEMA_VERSION = 3`; `schema.test.ts` pins them empty | `packages/shared/src/schema/index.ts` | landed |
| `rules/cutscenes.ts`: `CutsceneIndex`, `deathCutsceneFor(index, cause)` and `openingFor(index, mapId)` return null; `rules/minigames.ts`: `MinigamePuzzle`, `generateMinigame` and `checkMinigame` throw; both exported from `rules/index.ts` | `packages/shared/src/rules/` | landed |
| `docs/PROTOCOL.md` regenerated (`pnpm docs:protocol`) | | landed |

### 1.2 Content (locked; step 2)

| Item | File | State |
|---|---|---|
| `cutscenes/cutscenes.json` (`deaths`, `openings`, `cutscenes`, all empty) and `schemas/cutscenes.ts` (`CutsceneStep` union, `Cutscene`, `CutscenesFile`) | `content/data/cutscenes/`, `content/src/schemas/` | landed |
| `music.json` (`byMap`, `onub`, empty) and `schemas/music.ts` (`MUSIC_CLASSES`, `ONUB_MUSIC_CLASSES`, `MusicFile`) | the same | landed |
| `resources.json`, `recipes.json`, `mobs.json`, `quests.json`, `minigames.json`, each an empty record, and `schemas/m5b.ts` (`Resource`, `Recipe`, `MobDef`, `QuestNpc`, `Quest`, `MinigameDef` and their files) | the same | landed |
| `vendettas.json`, `evolutions.json`, `laws.json`, `events.json`, each an empty record with `gddRef` `"3"`, and `schemas/bible.ts` (`Vendetta`, `Evolution`, `LawStage`, `WorldEvent` and their files) | the same | landed |
| `parseContent`, `Content`, the `content` export and `validateContent` carry the twelve files; `checkM5b(c, err)` (`validate.ts:258`, called at `:244`) checks only the record keys until 6E, 6J and 6L fill it | `content/src/index.ts`, `validate.ts` | landed |
| `balance.phases.openingS = 0`, `balance.vision.lanternTiles = 0`, `balance.npc.stuckInvariantS = 20`, `balance.resources { poolActiveFrac: 0.5, stackMax: 5 }` (6E replaced the pre-seeded `gatherHoldS`: each resource carries its own `gatherS`), `balance.mobs { maxPerScene: 3, chaseS: 6 }`, `balance.quests { maxActive: 2 }`, `balance.ui.transitionS { fade: 0, iris: 0, wipe: 0 }` (placeholders 6E, 6J, 6K and 6A tune, with their GDD lines) | `content/data/balance.json`, `schemas/balance.ts` | landed |

### 1.3 Server (step 3)

| Hook | File | Owner | Locked call site | Stub body |
|---|---|---|---|---|
| `clockOf(room)`, `stepsThisTick(clock, lastMs)`, `MAX_SIM_MS_PER_TICK` | `server/sim/auto/clock.ts` | 6A | `server/rooms/PartyRoom.ts:114` (the `setFixedTimestep` loop runs the three calls `n` times and records `elapsed / n`; `lastStepMs` is the room's field) | `stepsThisTick` returns 1 |
| `enableAuto`, `queueAutoStart`, `autoOf`, `runAuto`; `AutoOptions`, `AutoCommand`, `AutoState` | `server/sim/auto/Auto.ts` | 6A | `server/sim/Step.ts:45` (`runAuto`, before `runNpcs`) | `runAuto` returns on an empty queue; `enableAuto` and `queueAutoStart` throw |
| `RoomSim.auto: AutoState \| null` | `server/sim/RoomSim.ts:171` | 6A (writes), all (read) | `preyFor`, `startRefusal` | `null`; survives `resetForLobby` |
| `preyFor(room, player, p, isNpc)` (renamed from `soleHuman`, exported) | `server/sim/npc/world.ts:83` | 6A | `server/sim/npc/world.ts:199` (the strike roll) | today's body; the last line adds `&& !simOf(room).auto?.npcPrey` |
| `startRefusal` auto branch | `server/rooms/handlers/lobby.ts:117` | 6A | `lobby.ts` `runLobbyCommands` | the human minimum is skipped when `simOf(room).auto` is set (complete) |
| `registerInvariant`, `registeredInvariants`, `runInvariants` | `server/sim/auto/invariants.ts` | 6B | `test/autoHelpers.ts`, `tools/auto` | an empty registry that runs whatever is registered |
| `SimEvent`, `emitSim`, `onSim`, `pendingSim`, `runEvents` | `server/sim/events/bus.ts` | 6B | `server/sim/Step.ts:66` (`runEvents`, after `runPhases`) | `emitSim` appends to the room's pending list; `runEvents` clears it and delivers nothing |
| `MatchLog` `event: 'auto'` | `server/sim/Win.ts logMatch` | 6B | | not pre-seeded; 6B adds the line |
| `appendLog`, `logHash` | `server/sim/auto/log.ts` | 6B | the harness | throw |
| `adminConfig`, `signAdminToken`, `verifyAdminToken`, `installAdminAuth`, `TOKEN_TTL_S`, `AdminConfig`, `AdminClaims` | `server/services/adminAuth.ts` | 6C | `server/server.ts:19` (`const admin = adminConfig()`; the `rooms` map and the Express callback register the room and the routes only under it) | `adminConfig` returns null; the rest throw |
| `class AdminRoom extends PartyRoom` | `server/rooms/AdminRoom.ts` | 6C | `server.ts` (registered as `admin` only under the config) | `onAuth` throws the generic join error |
| `registerAdminHandlers(room)` | `server/rooms/handlers/admin.ts` | 6C | `AdminRoom.onCreate` (6C writes the override) | no-op |
| `createAdminView`, `reconcileAdminView`, `isAdminClient` | `server/sim/auto/AdminView.ts` | 6C | `server/sim/Visibility.ts:65` (`reconcileViews`: the admin branch before the `viewer` lookup, then `continue`) | `isAdminClient` returns false; the other two throw |
| `runResources`, `handleGather` | `server/sim/Resources.ts` | 6F | `server/sim/Step.ts:56`; `server/sim/Hold.ts:60` (`handleHold`, the `gather`/`craft` branch before the collect check) | no-op; refuses 422 "cannot do that" |
| `handleCraft` | `server/sim/Craft.ts` | 6F | `server/sim/Hold.ts:61` | refuses 422 |
| `runMobs` | `server/sim/Mobs.ts` | 6G | `server/sim/Step.ts:57` | no-op |
| `canSee(room, viewer, target)` | `server/sim/Sight.ts` | 6G | `server/sim/Visibility.ts:118` (`reconcileAvatars`: a living viewer's wanted set is filtered through it; removes only) | returns true |
| `runQuests`, `handleQuestAccept`, `handleQuestTurnIn` | `server/sim/Quests.ts` | 6H | `server/sim/Step.ts:58`; `server/sim/Commands.ts:64-69` (`runCommands`) | no-op; refuse 422 |
| `handleMinigameResult` | `server/sim/Minigames.ts` | 6H | `server/sim/Commands.ts:70` | refuses 422 |
| the opening broadcast and `openingS` | `server/rooms/handlers/lobby.ts:326-328` (`beginPlay`, after `publishLooks`) | 6J (through `rules/cutscenes.ts` and the content) | locked | `openingFor(cutscenes, mapIdOfRoom(room))`; a non-null id is broadcast as `S2C.cutscene` and `openingS` is added to grace (complete; the rule returns null until 6J) |
| `cutsceneId` on `killed` | `server/sim/Death.ts:33` (`markDead`) | 6J (through the rule) | locked | `deathCutsceneFor(cutscenes, cause)`, spread into the payload when non-null (complete) |
| `StreamName` gains `'contract'`, `'events'` (`'mobs'`, `'nodes'` were round 5's) | `server/sim/seeds.ts:38-39` | locked | | listed |
| `seeds.test.ts` allowlist: `src/sim/auto/Auto.ts` may assign `fixedSeeds` | `apps/server/test/seeds.test.ts:99` | locked | | the filter on the walk |
| `runAutoMatch`, `AutoResult`, `AutoRunOptions` | `apps/server/test/autoHelpers.ts` | 6A | `auto.test.ts`, `tools/auto` | throws |

### 1.4 Client (step 4)

| Hook | File | Owner | Locked call site | Stub body |
|---|---|---|---|---|
| `Flags.admin` (`#/admin`), `setRoute('admin')` | `client/flags/index.ts` | locked | `client/scenes/Preload.ts:31` (`first = flags.admin ? 'Admin' : 'Landing'`, both `scene.start`s) | implemented |
| scene `Admin` | `client/scenes/Admin.ts` | 6D | `client/main.ts:28` (scene list, after `GameOver`) | an empty scene |
| `client/admin/{AdminNet,AdminSceneView,Controls,SeatInspector,LogPane,mockAdmin}.ts` | new | 6D | `scenes/Admin.ts` | empty exports; `ADMIN_TOKEN_KEY = 'wdi:adminToken'` |
| `remoteDelayMs(scale = 1)` beside `REMOTE_DELAY_MS` | `client/view/interpolation.ts:8` | 6D | the admin views | `150 / scale` |
| `planTimeline`, `advance` | `client/view/cutscene/sequencer.ts` | 6J | `CutscenePlayer` | throw |
| `CutscenePlayer.playPending(registry, key)`, `.playDeath(cutsceneId)`, `.destroy()` | `client/view/cutscene/CutscenePlayer.ts` | 6J | `client/scenes/World.ts:279` (after `fadeIn`, `REG_CUTSCENE`), `:251` (the `onKilled` handler plays the death cutscene, then `refreshGhost`), the constructor beside the `AudioBus`, the destroy in `SHUTDOWN` | both resolve `'none'` at once; `playPending` clears the registry key |
| `REG_CUTSCENE`, `REG_MUSIC` | `client/scenes/registry.ts` | locked | `worldRouter.ts:126` sets `REG_CUTSCENE` from a `cutscene` feed event without `scope: 'all'`; `Preload.ts:28` sets `REG_MUSIC` | |
| `WorldFeedEvents.cutscene`, `.minigameStart`; `killed.cutsceneId?`; `NodeSnap`, `MobSnap`, `QuestSnap`; `WorldFeed.nodes()`, `mobs()`, `quests()`, `minigameResult()` | `client/net/world.ts` | locked (types); 6I fills the readers | `worldColyseus.ts:86-87` routes `cutscene` and `minigameStart`; `worldColyseus.ts` and `mock/worldMock.ts` return empty lists; `minigameResult` sends `minigame.result` | |
| `mountLoadingScreen(scene, root)` | `client/view/LoadingScreen.ts` | 6K | `client/scenes/Preload.ts:30` (before `load.start()`; destroyed before the first scene starts) | returns a no-op handle |
| `transition(kind, ms, then)` | `client/view/Transition.ts` | 6K | `client/net/worldRouter.ts:81`, `:92`, `:102` (each `scene.start` runs inside `then`, with `balance.ui.transitionS` times 1000) | runs `then` at once; at `ms` 0 it must stay synchronous (the router tests depend on it) |
| `MusicBus` (`crossfadeTo`, `prefetch`, `setVolume`, `setMuted`) | `client/view/MusicBus.ts` | 6L | `client/scenes/Preload.ts:28` (one bus under `REG_MUSIC`) | no-ops |
| `installMusicDirector(game, net)` | `client/view/MusicDirector.ts` | 6L | `client/scenes/Preload.ts:29` | returns a no-op stop |
| `readAudioSettings`, `writeAudioSettings`, `AUDIO_SETTINGS_KEY` | `client/view/audioSettings.ts` | 6L | the settings panel | the defaults; the write is a no-op |
| `mountSettingsPanel(root)` | `client/ui/SettingsPanel.ts` | 6L | `client/ui/Landing.ts:131` (`settings-slot`), `client/ui/Lobby.ts:146` (the settings block), `client/view/Hud.ts:150` (`.wdi-hud__tr`); each destroyed with its screen | renders nothing |
| the trailer slot `landing-trailer` | `client/ui/Landing.ts` | 6K | locked | a hidden div |
| `NodeView`, `MobView`, `GiverView` (`update(items, now)`, `destroy()`) | `client/view/` | 6I | `client/scenes/World.ts:208-210` (constructed beside `ClueView`), `:349-350` (`update` with `feed.nodes()`, `feed.mobs()`), the `SHUTDOWN` destroys | draw nothing |
| `placeholderEntries()` (m5b, `order` 80) | `tools/sprites/placeholder-m5b.ts` | 6M | `tools/sprites/placeholder.ts` (`MODULES`, last) | an empty list |

### 1.5 Tools and CI (steps 5 and 6)

| Item | File | Owner | State |
|---|---|---|---|
| `@wdi/auto` (`run.ts`, `args.ts` with `test/args.test.ts`, `package.json`, `tsconfig.json`, `vitest.config.ts`, `report/`, `checks/`), root script `auto` | `tools/auto/` | 6A (`run.ts`, `args.ts`), 6B (`report/`, `checks/`) | landed; `run.ts` parses its flags, prints usage on a bad one and exits 2 until 6A |
| `tools/sprites/test/media.test.ts` | `tools/sprites/test/` | 6K | not pre-seeded: 6K writes it with the manifest shapes |
| `assets/video/manifest.json`, `audio/music/manifest.json` | `apps/client/public/assets/` | 6N (rows), 6K and 6L (shape) | not pre-seeded: 6K and 6L write the empty shapes |
| `soak.yml` `auto` job (map x mode matrix) | `.github/workflows/soak.yml` | 6B | landed; `continue-on-error: true` until 6A lands and 6B takes it off |

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
