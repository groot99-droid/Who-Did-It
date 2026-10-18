# Round-5 seams

Every hook the round-5 pre-seed created, where it is called, and what each session hands another. The pre-seed is
additive (DECISIONS A50, ruling X1) and landed on top of 265bda9 in five steps: the random streams with the ONUB
amendment, the maps (`MapSites.ts`), the deck, looks, avatars and night roles, the NPC routines, and the art tools.
The ONUB hooks themselves landed earlier, in 265bda9 (`onub-contract.md` 4.3 and 5.3).

**How to read the tables.** A hook lives in its owner's file; the owner fills the body and keeps the signature. A
locked call site is in a file the owner does not own (ruling X5): the call stays as it is, and a change to it goes
through the orchestrator. The call sites in `rooms/handlers/lobby.ts`, the main-mode lines of `Meeting.ts`, the
main-mode lines of `Win.ts` `resetToLobby`, `Step.ts`, `Death.ts` and `Kill.ts` are locked for 5F, 5G, 5H and 5J;
5B keeps the quick-mode branches of `Meeting.ts` and `Win.ts`. Line numbers are the working tree's after all five
steps (2026-10-17); a commit can shift them by a few lines, and the function named beside each one is the anchor.
Paths are from the repo root, with `apps/server/src/` shortened to `server/` and `apps/client/src/` to `client/`.

## 1. Pre-seeded hooks

### 1.1 Random streams (`deck-wire.md` 2.2, ruling X2)

| Hook | File | Owner | Locked call site (file:line) | Stub body |
|---|---|---|---|---|
| `sfc32(a, b, c, d): Rng` | `packages/shared/src/rules/prng.ts` | shared (locked) | `server/sim/seeds.ts` (`MatchSeeds.get`, its only caller) | implemented; discards its first 12 outputs after seeding (`mulberry32` stays exported) |
| `type StreamName`, `SeedWords`, `FixedSeeds` | `server/sim/seeds.ts` | locked | every `seeds.get` | `StreamName` is exactly the X2 list; `handles` and `covers` are gone |
| `new MatchSeeds(fixed?)` | `server/sim/seeds.ts` | locked | `server/rooms/PartyRoom.ts:60` (field initialiser); `server/rooms/handlers/lobby.ts:279` (`startMatch`, `new MatchSeeds(room.fixedSeeds)`) | implemented |
| `MatchSeeds.get(name, key?): Rng` | `server/sim/seeds.ts` | locked | `lobby.ts:227` (`handleAddNpc`, `npcNames`); `lobby.ts:282` (`fillNpcSeats`, `npcNames`); `lobby.ts:286` (`deal`); `lobby.ts:287` (`traits`); `server/sim/onub/Prep.ts:31` (`piles`, `thaw`, `perk`) | implemented: a keyed stream (`name:key`) gets four crypto words of its own; with fixed words a listed name seeds from them, and its keyed streams from the same words with the fourth XORed with FNV-1a(key) |
| `PartyRoom.fixedSeeds: FixedSeeds \| undefined` | `server/rooms/PartyRoom.ts:65` | tests only | read only at `lobby.ts:279`; written only by `fixSeeds` (`seeds.test.ts` fails if anything in `apps/server/src` calls `fixSeeds(` or assigns `fixedSeeds`) | `undefined` |
| `fixSeeds(room, words)` | `apps/server/test/seedHelpers.ts` | tests only | any test; never a production path | implemented: stores the words in `room.fixedSeeds` (every later Start uses them) and replaces the current `room.seeds` |
| `prepStreams(room): OnubPrepStreams` | `server/sim/onub/Prep.ts:30` | 5A (caller) | none yet: 5A's `endPrep` passes it as the last argument of `resolvePrep` | implemented: `{ piles, thaw, perk }` from `room.seeds` |

`room.matchSeed` (`PartyRoom.ts:58`) is still drawn at Start (`lobby.ts:280`) and read by nothing.

### 1.2 ONUB server (265bda9, amended; `onub-contract.md` 4.3)

| Hook | File | Owner | Locked call site (file:line) | Stub body |
|---|---|---|---|---|
| `startOnubMatch(room, ids): boolean` | `server/sim/Onub.ts` | 5A | `lobby.ts:284` (`startMatch`, before the main deal) | quick mode: refuses Start 422 to every seat and returns true; main mode: false |
| `beginOnubPlay(room): boolean` | `server/sim/Onub.ts` | 5A | `lobby.ts:345` (`beginPlay`, first) | false |
| `handleOnubAbility(room, sessionId, payload)` | `server/sim/Onub.ts` | 5A (kept as is) | `server/sim/Actions.ts:67` (`handleAbility`, every `onub.*` id) | implemented: `onub.prep` to `handlePrep`, every other `onub.*` id to `handleOnubAct` |
| `onubDeckSetting(deck): string[] \| null` | `server/sim/Onub.ts` | 5A | `lobby.ts:210` (`handleSettings`) | null for any non-empty deck, `[]` for `[]` |
| `resetOnubForLobby(room)` | `server/sim/Onub.ts` | 5A | `server/sim/Win.ts:149` (`resetToLobby`) | clears `OnubState` and every field of `GameState.onub`, `window` included |
| `handlePrep(room, sessionId, payload)` | `server/sim/onub/Prep.ts` | 5A | `server/sim/Onub.ts:44` | refuses 422 "cannot do that" |
| `runPrep(room)` | `server/sim/onub/Prep.ts` | 5A | `server/sim/Conductor.ts:38` (`runOnubPhases`, dusk) | no-op |
| `endPrep(room)` | `server/sim/onub/Prep.ts` | 5A | none yet (5A's `runPrep`, 5B's `onubClock`) | no-op; its doc comment holds the exact `resolvePrep(..., prepStreams(room))` call |
| `resolvePrep(commits, seats, stations, cards, rule, pantryLocs, rngs)` | `packages/shared/src/rules/onub.ts` | 5A | none yet (`endPrep`) | throws |
| `handleOnubAct(room, sessionId, payload)` | `server/sim/onub/Acts.ts` | 5B | `server/sim/Onub.ts:45` | refuses 425 "not now" |
| `onubWakeView(room, seatId)` | `server/sim/onub/Acts.ts` | 5B | none yet (the Conductor, 5E's NPC brain) | null |
| `runConductor(room)` | `server/sim/Conductor.ts` | 5B | `server/sim/Step.ts:47` | no-op |
| `runOnubPhases(room)` | `server/sim/Conductor.ts` | 5B | `server/sim/Phases.ts:29` (`runPhases`, quick mode) | the skeleton of `onub-contract.md` 4.3 |
| `onubClock(room, sessionId, payload): boolean` | `server/sim/Conductor.ts` | 5B | `server/sim/Phases.ts:124` (`debug.clock`) | quick mode: refuses 425 and returns true; main mode: false |
| `handleClaim(room, sessionId, payload)` | `server/sim/Meeting.ts` (quick branch) | 5B | `lobby.ts:154` (`meeting.claim`) | refuses 422 "cannot claim" |
| `endOnubMatch(room)` | `server/sim/Win.ts` | 5B | `server/sim/Meeting.ts:164` (`startOnubReveal`), `:170` (`endReveal`, quick mode) | `Phase.gameOver`, `Winner.nobody`, no `onub` |
| `runOnubNpc(room, mem, brain, player, p)` | `server/sim/npc/onub.ts` | 5E | `server/sim/Npc.ts:46` (quick mode, every phase but the role card) | `stand(p)` |
| `readyOnRoleCard(room, mem, brain, player)` | `server/sim/npc/meeting.ts` | 5H | `server/sim/Npc.ts:45` (role card, both modes) | today's body; reads `npc.ready.delayS` (`:14`) and marks the seat through `markCardReady` (`:19`) |

### 1.3 ONUB client (265bda9, amended; `onub-contract.md` 5.1 to 5.3)

| Hook | File | Owner | Locked call site (file:line) | Stub body |
|---|---|---|---|---|
| scene `Kitchen` | `client/scenes/Kitchen.ts` | 5C | `client/main.ts:27` (scene list, after `World`) | an empty scene |
| scene `Night` | `client/scenes/Night.ts` | 5D | `client/main.ts:27` (after `Kitchen`; `Loft` unregistered) | an empty scene |
| `installOnubRouter(game, feed, opts)` | `client/net/onubRouter.ts` | locked | `client/net/worldRouter.ts:126` | implemented |
| `mountDeckEditor(root, net)` | `client/ui/lobby/DeckEditor.ts` | 5C | `client/ui/Lobby.ts:142` (under the settings block) | renders nothing |
| `renderPiles(root, board, opts)` | `client/view/onub/PilesView.ts` | 5C (5D calls it on the Rush board) | none yet | a plain list of station names and card ids |
| `mountRush(root, meeting, onub)` | `client/ui/onub/rush.ts` | 5D | `client/ui/Meeting.ts:374` (quick mode; Skip hidden) | renders nothing |
| `renderOnubOver(root, over, names)` | `client/ui/onub/over.ts` | 5D | `client/ui/GameOver.ts:81` (when `over.onub` is set) | renders nothing |
| `MockOnubFeed` (composer) | `client/net/mock/onubMock.ts` | locked | `client/net/worldRouter.ts:180` | delegates to the two halves below; `board()` adds the night half's `cloche` and `window` |
| prep half | `client/net/mock/onubPrepMock.ts` | 5C | the composer | a fixed 5-seat deal; the stub board has `window: ''` |
| night half | `client/net/mock/onubNightMock.ts` | 5D | the composer | a fixed 5-seat deal; `window: () => ''` |
| `onubMockRoleCard(self): RoleRevealPayload` | `client/net/mock/onubMock.ts` | locked | `client/net/mock.ts:105` (quick-mode Start) | implemented |
| `teamName` on the role card | `client/ui/RoleCard.ts:110` | not an ONUB session's | the card | `role.teamName \|\| TEAM_LABEL[role.team]` |

### 1.4 Maps (`world.md` 9.1; 5J owns the bodies)

Every `MapSites.ts` function returns Hollowmere's values today.

| Hook | File | Owner | Locked call site (file:line) | Stub body |
|---|---|---|---|---|
| `mapIdOfRoom(room): MapId` | `server/sim/MapSites.ts` | 5J | `server/sim/MapSites.ts:49` (`sitesOf`, inside the file only) | `'hollowmere'` |
| `hubOf(room): SceneId` | `server/sim/MapSites.ts` | 5J | `server/sim/Actions.ts:148` (`handleBell`, hub check); `server/sim/Meeting.ts:155` (`startReveal`, `killed.sceneId`); `server/sim/Clues.ts:155` (`spawnTeachingClue`); `server/sim/npc/world.ts:154` (`runFlee`) | `overworld` |
| `startSpawnsOf(room): readonly SpawnSite[]` | `server/sim/MapSites.ts` | 5J | `server/sim/Portals.ts:128` (`placeNewPlayers`) | `overworld.square_0` to `square_9` |
| `meetingSpawnsOf(room): readonly SpawnSite[]` | `server/sim/MapSites.ts` | 5J | `server/sim/Meeting.ts:19` (`placeAtSquare`: meeting open, `:46`, and immunity, `:183`) | `overworld.square_0` to `square_9` |
| `bellOf(room): Prop \| undefined` | `server/sim/MapSites.ts` | 5J | `server/sim/Actions.ts:146` (`handleBell`) | `ov.bell` |
| `teachingClueOf(room): Prop \| undefined` | `server/sim/MapSites.ts` | 5J | `server/sim/Clues.ts:153` (`spawnTeachingClue`) | `ov.teaching_clue` |
| `kitChestOf(room): Prop \| undefined` | `server/sim/MapSites.ts` | 5J | none yet | `ov.chest` |
| `mapScenesOf(room): readonly SceneId[]` | `server/sim/MapSites.ts` | 5J | `server/sim/npc/world.ts:18` (`basinScenesOf`, cached per scene list); `server/sim/npc/world.ts:160` (`runFlee`, into `firstPortalToward`) | the 15 scenes in `SCENE_IDS` order |
| `firstPortalToward(..., inMap)` | `server/sim/npc/walk.ts:162` | 5H | `server/sim/npc/world.ts:160` (`runFlee`, its only caller) | implemented: a new last parameter `inMap`, `!inMap.includes(to)` |
| `type SpawnSite` | `server/sim/MapSites.ts` | 5J | the spawn callers above | `{ sceneId, spawn }` |
| `checkSceneWorld(scene): string[]` | `packages/content/src/validateWorld.ts:28` | locked content | `packages/content/src/validate.ts:153` (once per scene) | implemented |
| `checkMaps(c): string[]` | `packages/content/src/validateWorld.ts:142` | locked content | `packages/content/src/validate.ts:215` | implemented |
| `lobby.settings {map?: string}` | `packages/shared/src/protocol/index.ts:304` | locked | 5J's `handleSettings` map branch | the server ignores it until 5J reads it |
| `mountMapPicker(root, net): { update, destroy }` | `client/ui/lobby/MapPicker.ts:15` | 5J | `client/ui/Lobby.ts:136` (own slot `data-testid="lobby-map"` at the end of the settings block, before the deck editor); `update` at `:296` | renders nothing |
| `showsMapRow(mode): boolean` | `client/ui/Lobby.ts:33` | locked | `client/ui/Lobby.ts:298` (the slot is also hidden while empty) | `mode !== 'onub'` |
| `NetworkService.setMap(mapId)` | `client/net/NetworkService.ts:227` | locked | 5J's picker | sends `lobby.settings {map}` |
| mock `setMap(map)` | `client/net/mock.ts:152` | locked | 5J's picker under `?mock=1` | accepted from the leader only, in the lobby; no check against `MAP_IDS` (the server's job) |
| `LobbySettings.map` | `client/net/NetworkService.ts:306` | locked | the lobby | `state.settings.map`, or `DEFAULT_MAP_ID` when empty |
| `DEFAULT_MAP_ID = 'hollowmere'` | `client/net/protocol.ts:65` | locked | `NetworkService.ts:44`, `:306` | pinned by a test to content's `DEFAULT_MAP` |

New content exports with the maps: `MAP_IDS = ['hollowmere']`, `MapId`, `DEFAULT_MAP`, `SpawnRef`, `MapFile`, `maps`,
`mapOf(sceneId)`, `mapIdOf(value)`, `biomeOf`, `isDarkScene`; new optional `Scene` fields `biome`, `dark`,
`buildings`, `lights`, `nodes`, `spawners`, `givers`, `material`. In `@wdi/shared`: the `./iso` module (`docs/SPRITES.md`
section 10.2) and `MAX_SILHOUETTE_PX = 112`.

### 1.5 Deck, looks, avatars and the night roles: server (`deck-wire.md` 8.1)

| Hook | File | Owner | Locked call site (file:line) | Stub body |
|---|---|---|---|---|
| `publishAvatars(room)` | `server/sim/Avatars.ts` | 5F | `server/sim/Step.ts:42` (after `moveAndCollide`) | no-op |
| `rehandle(room, seat, transit)` | `server/sim/Avatars.ts` | 5F | `server/sim/Portals.ts:108` (`enterScene`, after the presence write, before `sceneEnter`); `server/sim/Death.ts:27` (`markDead`, `transit` false) | no-op |
| `resolveHandle(room, actorSeat, handle): string \| null` | `server/sim/Avatars.ts` | 5F | `server/sim/Kill.ts:61` (`handleKill`); `server/sim/Actions.ts:90` (`handleBandage`) | `handle` when it is a string and a key of `state.players`, else null |
| `runImpersonation(room)` | `server/sim/Impersonate.ts` | 5F | `server/sim/Step.ts:44` (right after `runCommands`) | no-op |
| `endImpersonation(room, seat): boolean` | `server/sim/Impersonate.ts` | 5F | `server/sim/Kill.ts:93` (once `validateKill` accepts, before Blood and the cooldown; `sendDisguisePuff`, `Kill.ts:31`, sends `vfx` when it returns true) | false |
| `onMeetingOpenDisguise(room)` | `server/sim/Impersonate.ts` | 5F | `server/sim/Meeting.ts:45` (`openMeeting`, main mode only, before `placeAtSquare`) | no-op |
| `handleImpersonate(room, seat, payload)` | `server/sim/Impersonate.ts` | 5F | `server/sim/Actions.ts:58` (`handleAbility`, case `impersonate`) | 422 "cannot do that" |
| `handleCoverPick(room, seat, payload)` | `server/sim/Covers.ts` | 5F | `lobby.ts:145` (`runLobbyCommands`, type `role.cover`; `LOBBY_TYPES` gains `C2S.coverPick` at `lobby.ts:57`) | 425 "not now" |
| `markCardReady(room, seat)` | `server/sim/Covers.ts` | 5F | `lobby.ts:135` (`lobby.ready {ready: true}` during `roleReveal`); `lobby.ts:141` (`role.ready` during `roleReveal`); `server/sim/npc/meeting.ts:19` (`readyOnRoleCard`, both modes) | `player.ready = true` |
| `allCardReady(room): boolean` | `server/sim/Covers.ts` | 5F | `lobby.ts:242` (`runLobbyPhase`, in place of the `p.ready` loop) | true when every living, connected seat's `player.ready` is true |
| `assignCovers(room, dealt)` | `server/sim/Covers.ts` | 5F | `lobby.ts:320` (`startMatch`, main mode, after the private-state loop) | no-op |
| `mainRevealFields(room, seat): MainRevealFields` | `server/sim/Covers.ts` | 5F | `lobby.ts:334` (`startMatch`, spread beside `buildRoleReveal` in the `roleReveal` send) | `{}` |
| `publishLooks(room)` | `server/sim/Covers.ts` | 5F | `lobby.ts:348` (`beginPlay`, main mode, before `setPhase(grace)`) | no-op |
| `resetCoversForLobby(room)` | `server/sim/Covers.ts` | 5F | `server/sim/Win.ts:150` (`resetToLobby`) | no-op |
| `dealMainDeck(room, ids): Map<string, string> \| null` | `server/sim/Deck.ts` | 5G | `lobby.ts:286` (`startMatch`: `dealMainDeck(room, ids) ?? dealRoles(...)`) | null (the roster deal runs) |
| `runNightPowers(room)` | `server/sim/NightPowers.ts` | 5G | `server/sim/Step.ts:45` (after `runImpersonation`) | no-op |
| `handleNightPower(room, seat, payload)` | `server/sim/NightPowers.ts` | 5G | `server/sim/Actions.ts:64` (`handleAbility`, cases `confession`, `keepWatch`, `remedy`, `poison`, `lastShot`) | 422 "cannot do that" |
| `onMeetingOpenNight(room)` | `server/sim/NightPowers.ts` | 5G | `server/sim/Meeting.ts:39` (`openMeeting`, main mode only, before `alive` flips) | no-op |
| `holdReveal(room): boolean` | `server/sim/NightPowers.ts` | 5G | `server/sim/Meeting.ts:169` (`endReveal`, first line) | false |
| `beginAim(room, seat, cause): boolean` | `server/sim/NightPowers.ts` | 5G | `server/sim/Death.ts:28` (`markDead`, returns before `killed` when true) | false |
| `spendProtection(room, target, actor): boolean` | `server/sim/NightPowers.ts` | 5G | `server/sim/Kill.ts:101` (after Blood and the Knife cooldown, before the Bandage check; true refuses "nothing happens") | false |
| `isAiming(room, seat): boolean` | `server/sim/NightPowers.ts` | 5G | `server/sim/Visibility.ts:69` (`reconcileViews`: an aiming viewer's wanted set is empty); `server/sim/Phases.ts:62` (`drainDeaths`, the win check only) | false |
| `resetNightForLobby(room)` | `server/sim/NightPowers.ts` | 5G | `server/sim/Win.ts:151` (`resetToLobby`) | no-op |
| `runHunger(room)` | `server/sim/Hunger.ts` | 5G | `server/sim/Step.ts:49` (after `runAiAndHazards`) | no-op |
| `fillNpcSeats(room, rng)` | `server/sim/npc/seats.ts` | 5H | `lobby.ts:282` (`startMatch`, `room.seeds.get('npcNames')`) | today's body, moved |
| `addNpcSeat(room, rng, id = generateId()): string \| null` | `server/sim/npc/seats.ts` | 5H | `lobby.ts:227` (`handleAddNpc`, `room.seeds.get('npcNames')` in place of a fresh `mulberry32(randomInt(2 ** 32))`) | today's body, moved; the optional `id` is for tests |
| `npcVoteTarget(room, id): string \| null` | `server/sim/npc/meeting.ts` | 5H | none yet (5H's `runMeetingVotes`, 5G's NPC Last Shot) | null |
| `dealDeck(ids, cards, alwaysDealt, rng): DeckDeal` | `packages/shared/src/rules/deck.ts:20` | 5G | none yet (5G's `dealMainDeck`) | an untested version: always-dealt cards plus a shuffle |
| `coverHints(dealt, undealt, cards, isCover, isCabal)` | `packages/shared/src/rules/deck.ts:51` | 5F | none yet (5F's `assignCovers`) | an empty map |

### 1.6 Server fields

| Field | File | Writer | Read by |
|---|---|---|---|
| `FlowState.deck: string[] = []` | `server/sim/Flow.ts:48` | 5G | 5F `assignCovers`, `mainRevealFields` |
| `FlowState.undealt: string[] = []` | `server/sim/Flow.ts:50` | 5G | 5F `assignCovers`; 5G `gameOver.undealt` |
| `FlowState.cardReady: Set<string>` (readonly) | `server/sim/Flow.ts:52` | 5F | 5F `allCardReady` |
| `FlowState.poisoned: Set<string>` (readonly) | `server/sim/Flow.ts:54` | 5G | 5G |
| `Brain.nightPowerAtTick = -1`, `nightPowerPick = 0`, `lastShotAtTick = -1` | `server/sim/npc/memory.ts:42-44` | 5H (draws) | 5G (NPC night powers, Last Shot) |
| `Private.sceneId` written | `server/sim/Portals.ts:90` (`enterScene`, every seat, living or dead) | the pre-seed, then 5F | 5F (`createPlayerView` after its contract phase); stale in the lobby until `resetCoversForLobby` clears it |
| `DeathEvent.cause: DeathCause` | `server/sim/RoomSim.ts:135` | widened for `poison`, `shot` | `drainDeaths`, the match log |
| `StatusBit.ghost = 4` | `server/sim/constants.ts:22`, `client/view/animIds.ts:7` | 5F | the avatars |
| `AnimId.interact = 4` | `server/sim/constants.ts:20`, `client/view/animIds.ts:5` | `publishPresence` (`server/sim/Movement.ts:124`), whenever `p.hold !== null`, from `moveAndCollide` (`:100`) every world tick | 5I's `PlayerView.pose` (idle until then) |

### 1.7 Deck, looks and the night roles: client (`deck-wire.md` 8.2, ruling X6)

| Hook | File | Owner | Locked call site (file:line) | Stub body |
|---|---|---|---|---|
| `mountDeckList(root, net): { update(s: LobbySnapshot): void; destroy(): void }` | `client/ui/main/deckList.ts` | 5G | `client/ui/Lobby.ts:140` (own slot `lobby-deck-list` under the settings; `update` at `:299`; the slot is hidden in the quick mode or while empty) | renders nothing |
| `mountDeckChip(root, deck): { destroy(): void }` | `client/ui/main/deckChip.ts` | 5G | `client/view/Hud.ts:148` (`setChip`, once `HudChip.deck` is set; `client/net/worldRouter.ts:159` copies `roleReveal.deck` into the chip) | renders nothing |
| `renderLookPortrait(root, seat: MeetingPlayer)` | `client/ui/main/lookPortraits.ts` | 5G | `client/ui/Meeting.ts:199` (main-mode roster, after today's portrait is drawn) | no-op (today's portrait stays) |
| `revealLookLine(look): string` | `client/ui/main/lookPortraits.ts` | 5G | `client/ui/Meeting.ts:360` (main-mode reveal, appended to the ejection line when not empty) | `''` |
| `renderMainOver(root, over, players)` | `client/ui/main/overMain.ts` | 5G | `client/ui/GameOver.ts:84` (main mode; the panel joins the stack only when it has children) | renders nothing |
| `showShotToast(root, shot, names)` | `client/ui/main/shotToast.ts` | 5G | `client/ui/Meeting.ts:385` (main mode; `feed.bus.on('shot')` at `:387`, unsubscribed in `destroy`) | renders nothing |

Client feed fields (5G and 5D never edit these three files): `MeetingPlayer.look: string` (`client/net/meeting.ts`),
filled from `Player.look` by `client/net/meetingColyseus.ts:100` and defaulted to `''` by
`client/net/mock/meetingMock.ts:133`; `MeetingFeedEvents.shot: S2CPayloads['shot']`, routed by
`client/net/meetingColyseus.ts:72` (the mock's bus carries the type).

### 1.8 Shared schema, constants and protocol (locked; `deck-wire.md` sections 1 to 3)

- **Schema** (`packages/shared/src/schema/index.ts`): `SCHEMA_VERSION = 2` (`:12`); `VIEW_TAG {presence: 1, priv: 2,
  ghost: 3}` (`:18`); `Avatar` (10 fields, `seat` tagged `ghost`); `SceneState.avatars: t.map(Avatar).view()` (`:126`,
  empty until 5F); `NotebookEntry.note`, `.of`; `Private.sceneId`, `.avatar`, `.coverLook`, `.mateLooks`;
  `Player.look`. `Player.sceneId` and the tags of `presence` stay until 5F's contract phase.
- **Constants** (`packages/shared/src/constants.ts`): `ClueKind.hungerPrints = 9` (`:38`), `NoteKind` (`:52`),
  `SPENT_TONIGHT` (`:65`), `AVATAR_HANDLE_BYTES = 6` (`:68`).
- **Protocol** (`packages/shared/src/protocol/index.ts`): `C2S.coverPick = 'role.cover'` (`:28`, the lobby queue,
  `RATE_LIMITS` 4/s at `:411`); `S2C.vfx`, `aim`, `shot`, `inherit`; `MeetingReason` gains `final`; `DeathCause`
  gains `poison`, `shot`; `RoleRevealPayload.deck?`, `look?`, `portrait?`, `coverHints?` (main mode only);
  `gameOver.alsoWon?`, `undealt?`; `'role.cover': { lookId }` (`:315`); `lobby.settings.map?` (1.4).
  `docs/PROTOCOL.md` is regenerated.

### 1.9 NPC routines (`npc.md` part 1, sections 1 to 5)

| Hook or field | File | Owner | Read or called from (file:line) | State |
|---|---|---|---|---|
| `routines.json` (`phaseClasses`, `activities` work/social/rest, `holds` {}, `ignore`, `lightKinds`) | `packages/content/data/routines.json` | locked content (5J adds a row for any new prop kind, rule 3) | the `@wdi/content` import; no server reader until 5H's `sim/npc/routine.ts` | landed |
| `RoutinesFile`, `RoutinePhaseClass`, `RoutineWorldPhase`, `RoutineHold`, `RoutineActivity` | `packages/content/src/schemas/routines.ts` | locked | re-exported by `packages/content/src/index.ts:69` | landed |
| `routines` export, `Content.routines`, `parseContent({ ..., routines })` | `packages/content/src/index.ts`, `validate.ts` | locked | every `@wdi/content` consumer; the tests' `parseContent` | landed |
| `checkRoutines(c, err)` (rules 2.3.1 to 2.3.6) | `packages/content/src/validate.ts:374` | locked | `packages/content/src/validate.ts:246` (`validateContent`, after `checkOnub`) | landed |
| `balance.npc.ready.delayS` | `packages/content/data/balance.json` | locked | `server/sim/npc/meeting.ts:14` (`readyOnRoleCard`) | landed |
| `balance.npc.vote.windowFrac` | `packages/content/data/balance.json` | locked | `server/sim/npc/meeting.ts:59` (`runMeetingVotes`, the discussion's first tick) | landed |
| `balance.npc.routine`, `.react`, `.night` | `packages/content/data/balance.json` | locked | none until 5H | landed |
| `balance.npc.nightPower` | `packages/content/data/balance.json` | locked | none until 5G | landed |
| `publishPresence` hold rule; `moveAndCollide` passes the real displacement as `moving` | `server/sim/Movement.ts:124`, `:100` | locked | `moveAndCollide`, every world tick | landed |
| keyed streams `npcPlay:<seat>`, `npcTiming:<seat>` | `server/sim/seeds.ts` | locked | none yet: the NPC brain still draws from `NpcMemory.rng`, which 5H removes | landed |

### 1.10 Art tools (`art-plan.md` 1.2 and 9)

| Hook | File | Owner | Called or read from (file:line) | State |
|---|---|---|---|---|
| `placeholderEntries(): PlaceholderEntry[]` (world: `order` 20 clues, 30 props, 60 buildings, 70 tiles) | `tools/sprites/placeholder-world.ts:309` | 5K | `tools/sprites/placeholder.ts:18` (`MODULES`), sorted by `order` at `:23` (`generate()`) | today's stand-ins, moved |
| `placeholderEntries()` (chars: 10 villager, 40 vfx) | `tools/sprites/placeholder-chars.ts:213` | 5L | the same | today's stand-ins, moved |
| `placeholderEntries()` (onub: 50 loft) | `tools/sprites/placeholder-onub.ts:42` | 5M | the same | today's stand-ins, moved; 5M's ONUB block takes a high `order` |
| `PlaceholderEntry { order, entries, files() }`, `PALETTE`, the drawing helpers | `tools/sprites/placeholder-kit.ts:89` | core, no session | the three modules and the core; `PALETTE` and `ManifestEntry` re-exported by `placeholder.ts:15` | implemented |
| `LEGACY` (18 keys) | `tools/sprites/test/legacy.ts` | each art session deletes its own lines | `tools/sprites/test/manifest.test.ts:5`, `legacy.test.ts`; later 5L's `palette.test.ts` and `budget.test.ts` | implemented |
| `style.json` `pixel`, `pixelFinish`, `references`, `keyColors`; `palette.json` `world` | `packages/content/data/` | locked content | read at import by `tools/sprites/palette.ts:37-38` (`WORLD`, `nearestIndex`, `DARK_RANK`, `SATURATED` feed `snap`, `modeHalve`, `audit`) | implemented |
| `finishEnabled(mode)` | `tools/sprites/palette.ts:42` | core | the default of `finishRender` (`pixel.ts:176`), `finishDisplay` (`:184`), `finishFolder` and the `pixel` CLI; the filter check at `manifest.test.ts:72` | implemented |
| `referenceList()`, `buildRefs()` | `tools/sprites/refs.ts:27`, `:58` | core | the `refs` CLI | implemented |
| package scripts `pixel`, `refs`, `tileset`, `slice`, `review:world`, `lineup`, `onub`, `onub:cards`, `onub:mini` | `tools/sprites/package.json` | core | each points at the file its owner writes | `pixel` and `refs` work; the rest wait for their owners' files |

### 1.11 Not landed

- `nearestAvatar` (`client/view/targets.ts`) and its call site in `client/scenes/World.ts` (`deck-wire.md` 4.7, 8.3):
  they need 5F's `WorldFeed.avatars()`, which the pre-seed does not add. Until 5F and 5I land them, the Kill and
  Bandage prompts send the seat id, which the `resolveHandle` stub accepts.
- A `resolvePrep` call: no call site existed at 265bda9 and the `endPrep` stub is a no-op (`onub-contract.md` 13.1).
- `handleSettings`'s map branch and the scene creation in `PartyRoom` (5J, `world.md` 9.2).
- The NPC draws from the keyed streams (5H, `npc.md` part 1, section 6).

## 2. Producer -> consumer

The seams tables of `onub-contract.md` 10, `deck-wire.md` 8.3, `npc.md` part 1 section 8 and `art-plan.md` 6, merged
into one table; rows that said the same thing are joined, and "until it lands" reads as of the landed pre-seed.

| Producer -> consumer | Contract | Until it lands |
|---|---|---|
| pre-seed -> all | the hooks, fields and stubs of section 1; content (`roles`, `abilities`, `items`, `balance`, `clues`, `looks`, `routines`, `metrics`, `style`, `palette`, `maps`, the scenes' `biome` and `dark`) | landed |
| pre-seed -> 5H | `routines.json`, its schema and validator, the `npc` rows, `AnimId.interact`, the `Movement.ts` lines, the edits of `npc.md` part 1 section 5 | landed |
| pre-seed -> 5K, 5L, 5M | `style.json` (with `pixelFinish`), `palette.json`, `metrics.json`, `looks.json` with `swing`; `oklab.ts`, `palette.ts`, `pixel.ts`, `refs.ts`, `legacy.ts`, the replaced `manifest.test.ts`; the placeholder split; the package scripts | landed |
| 5A -> 5B | `OnubState.dealt`, `.commits`, `.prep`, `.cards` filled; `Phase.prepReveal` set by `endPrep` with `prepRevealS` | 5B builds its states with `createOnubState` and `tableAtNight` in its own helpers |
| 5A -> 5C | `onubDeckProblem` (pure, `@wdi/shared`) for the editor's `deck-problem` line and its five ids | a local stand-in with the same signature, deleted when 5A lands |
| 5A, 5B -> 5E | `handleOnubAbility` for `onub.prep` and night acts, `onubWakeView`, `OnubState`, `Private.onubLoc`, `Private.nightReveal`, `meeting.claim`, `meeting.vote` with `"pantry"` | 5E's planners are pure and tested on fixtures; the wiring is exercised at integration |
| 5A, 5B -> 5C, 5D | the wire of `onub-contract.md` sections 2 and 6 | each client session builds on its half of `MockOnubFeed` |
| 5B -> 5A | `handleOnubAct` behind the pre-seeded dispatcher | the stub refuses 425 |
| 5B -> 5D | `OnubBoard.window` (the narrator, public) through `OnubFeed.board().window` | the mock night half's `window()` returns `''` |
| 5C -> 5D | `renderPiles` (Rush board), `onub.board.*` copy | the pre-seeded plain list |
| 5C, 5D -> 5E | the `data-testid` hooks of `onub-contract.md` section 7 | `onub.spec.ts` is opt-in (`WDI_E2E_ONUB=1`) and runs at integration |
| 5D -> 5C | `ColyseusOnubFeed` covers prep too (`prep`, `myPrep`, `board`) | 5C runs on the mock; the real feed is checked at integration |
| 5E <-> 5H | `npc/meeting.ts` loses its quick branch (5H); ONUB NPC votes use `onubBalance.npc.voteFrac` (5E); `readyOnRoleCard` serves both modes | the routing of `onub-contract.md` 4.3 |
| 5F -> 5G | the hooks of `deck-wire.md` 8.1 in `Kill.ts`, `Death.ts`, `Meeting.ts`, `Step.ts` | the landed stubs |
| 5F -> 5G (client) | `ui/SeatPicker.ts` for the night powers and the aim prompt; `ui/portrait.ts` for `lookPortraits.ts` | 5G uses a plain list until it lands |
| 5F -> 5H | `markCardReady(room, id)` on the role card in `readyOnRoleCard` (`server/sim/npc/meeting.ts:19`, both modes) | landed; the stub writes `player.ready` until 5F lands |
| 5F -> 5H | Kill takes an avatar handle: the NPC Killer sends `room.state.players.get(prey).priv.avatar`, never the seat id | the NPC sends the seat id while the landed `resolveHandle` stub accepts one |
| 5F -> 5B, 5C, 5D, 5E | Ready on the role card is private in both modes (`flow.cardReady` through `markCardReady`, `sim/Covers.ts`), with no public `ready` tick; `RoleCard` shows `teamName`; `Player.look` empty in quick mode | the card and `readyOnRoleCard` write the public `player.ready` until 5F lands; the one-line `teamName` fallback (`RoleCard.ts:110`) |
| 5F -> 5A | `beginOnubPlay` writes `priv.sceneId = LOFT_SCENE_INDEX` (and the public field until 5F's contract phase) | the landed `Private.sceneId` field |
| 5F -> 5E | `tools/bots/walk.ts` main mode: prey from `state.scenes.get(scene).avatars` by handle, Kill by handle; the leak monitor counts any other seat's `presence` and any avatar outside the own scene | 5E keeps the old reads (`Player.sceneId`, presence) until 5F merges, then switches (integration list) |
| 5F -> 5I | `World.ts` Kill and Bandage prompts call `nearestAvatar`; `EntityView` stays 5F's | not pre-seeded (it needs `WorldFeed.avatars()`); the prompts send the seat id, which the `resolveHandle` stub accepts |
| 5G -> 5F | `dealMainDeck` writes `flow.deck` and `flow.undealt` before `assignCovers` reads them | the stub returns null, so the roster deal runs and the landed fields stay empty; `assignCovers` sees no deck and does nothing |
| 5G -> 5H | `abilities.json` `kill.phases` (dusk, night, finalNight) | the NPC strikes at night only, as today |
| 5G -> 5H | Inherit gives a living Accomplice `kill` (`deck-wire.md` section 5); the brain treats any NPC that holds `kill` as a Killer NPC | the brain reads the role's abilities, as today |
| 5H -> 5G | `balance.npc.nightPower` (`windowFrac`, `lastShotS`); the card-blind draws on every NPC's `Brain` (`nightPowerAtTick`, `nightPowerPick`, `lastShotAtTick`), from which 5G's NPC night powers take their tick, pick and Last Shot delay instead of drawing; `npcVoteTarget(room, id)`, at which an NPC Last Shot aims (a Cabal confession first) | the rows, the `Brain` fields and the `npcVoteTarget` stub (null) landed; 5G reads them |
| 5J -> 5H | the map's scene list and hub through `server/sim/MapSites.ts` (`mapScenesOf(room)`, `hubOf(room)`; 5J owns the bodies) | they return Hollowmere's values (`SCENE_IDS`, `'overworld'`) |
| 5J -> 5H | scene fields `biome`, `dark`, `lights[].phases` (read by `isLitAtNight` through `biomeOf` and `isDarkScene`) | `biome` and `dark` landed on the 15 current scenes and `ambientLightTiles` is gone, so R8's answer holds; absent `lights` read as none |
| 5J -> content | a new prop kind gets a `routines.json` row in the same pull request (rule 2.3.3) | the import throws |
| 5K -> 5I | the keys, draw scales and filters of `art-plan.md` 1.3; `maps` fields; slices and pivots (SPRITES 10.5) | greybox kit blocks, props and spots (SPRITES 10.13) |
| 5K -> 5J | `thumb_<mapId>`; themes `harbour` and `timber`; the building art ids of `art-plan.md` 3.4. The `=` rail-variant rule of SPRITES 10.12 and Hollowmere's hedges as `F`, headstones as `R` are the world contract's (ruling C16); the art matches them | 5J's `MapPicker` shows the name without a thumbnail |
| 5K -> 5G, 5I | `clue_footprint_<s\|m\|t>_glow` for `hungerPrints` | the footprint frame in its `light` tint |
| 5L -> 5F | `char_<lookId>`, `ovl_<lookId>` (scarf and blood, no hat passes), `anims_<lookId>` with `swing` and `interact`, `portrait_<lookId>`, `vfx_disguise` (played only where a Knife strike drops a disguise), `icon_ability_impersonate`; greybox placeholders under the same keys; no real `char_villager` from L4 (placeholder only) | `?art=placeholder`: the placeholder looks of `placeholder-chars.ts` |
| 5L -> 5G, the role card | `portrait_<lookId>`; the five night-role icons (`icon_ability_confession`, `_keepwatch`, `_remedy`, `_poison`, `_lastshot`) | the empty portrait slot |
| 5M -> 5C, 5D | the keys of `onub-contract.md` 5.4 plus `onub_mini`, each with `modes: ['onub']`; the card band area (4, 72) to (76, 108) in art px; the kitchen quadrants as tap targets; every ONUB image loaded at match start; `image-rendering: pixelated` | labelled greybox |
| 5I -> players | `PlayerView.pose` maps `AnimId.interact` to the `interact` clip | idle frames |

## 3. Loose ends the pre-seed left outside its paths

- `docs/ARCHITECTURE.md` 5.3 "Start flow" (line 95) still says Start seeds `mulberry32` from `crypto.randomInt`, and
  its rules paragraph (line 132) still names `mulberry32` and `assignRoles`; DECISIONS A41 still cites
  `mulberry32(matchSeed ^ 0x6e70633a)` for the NPC names. The streams are `sfc32` per 1.1, and `room.matchSeed` is
  drawn but unread.
- `tools/blender/build_buildings.py:38` (5K's file) still names `placeholder.ts` for the buildings list, which is in
  `placeholder-world.ts` now.
- Code comments of the pre-seed cite the design drafts by their working names (`deck/wire.md`, `npc/data.md`,
  `npc/tests.md`, "contract 4.3"); `README.md` in this folder maps each name to its document here.
