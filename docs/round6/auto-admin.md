# Round-6 contract: the admin auto-mode

The owner's request: "a special admin section that only I can access where I can play the game on auto mode with
all the NPC roles playing out on multi screens at 10x speed for me to check the game for errors and bugs." This
document is the contract for sessions 6A (time scale, auto mode, headless harness, CLI), 6B (event bus and
invariants), 6C (GitHub login and `AdminRoom`) and 6D (the admin client). The rules it implies go in GDD 3.19
(6A writes it); the operating text (variables, the GitHub app) goes in ARCHITECTURE 5.11 (6C). Paths shorten
`apps/server/src/` to `server/` and `apps/client/src/` to `client/`.

## 1. What the code already gives us (verified at a60d855)

- **The sim is tick-deterministic.** `step(room, _ctx)` (`server/sim/Step.ts:35`) ignores its clock argument;
  every timer in `sim/` is a tick count (`phaseEndsTick`, `cooldownEndTick`, the NPC `brain` ticks); nothing
  under `sim/` reads `Date.now` or `Math.random`, and every draw goes through `room.seeds.get(name, key?)`
  (`server/sim/seeds.ts`, round 5). `apps/server/test/npcHelpers.ts advance(room, n)` already runs `step` n times
  in a plain loop. **So a time scale is a loop count**, not a faster clock.
- **A seatless client is invisible to the sim.** `reconcileViews` (`server/sim/Visibility.ts:58`) skips any
  client whose session id has no `Player`; nothing else iterates `room.clients` for game purposes. That is the
  observer's hook.
- **Express is already there.** `server/server.ts:18` passes an `express: (app) => ...` callback to
  `defineServer`, so the OAuth routes need no new dependency: Node 22 `fetch` and `node:crypto` do the rest.
- **Two spots assume a human.** `soleHuman` (`server/sim/npc/world.ts:82`) never returns an NPC as prey, and
  `startRefusal` (`server/rooms/handlers/lobby.ts:106`) refuses Start below `balance.lobby.startMinHumans` (1).
  Everything else was checked null-safe for a room with no client: `Death.ts markDead`'s send, `Flow.ts refuse`,
  the role-card gate (`allCardReady` through `readyOnRoleCard`), `runMeetingVotes`, the ONUB NPC acts and
  `Win.ts logMatch`. 6A verifies `autoDispose` on a room that never had a client.
- **Debug handlers** register only with `WDI_DEBUG=1` and `party.test.ts` asserts their absence; the admin room
  follows the same shape with its own variable.

## 2. The sim clock and 10x (6A)

**`server/sim/auto/clock.ts`** (pre-seeded, 6A fills):

```ts
export type ClockScale = 1 | 2 | 5 | 10;
export interface SimClock { scale: ClockScale; paused: boolean; pendingSteps: number; carry: number }
export const MAX_SIM_MS_PER_TICK = 40;
export function clockOf(room: PartyRoom): SimClock;        // WeakMap; a fresh room is { scale: 1, paused: false, pendingSteps: 0, carry: 0 }
export function stepsThisTick(clock: SimClock, lastTickMs: number): number;
```

- `stepsThisTick` returns `scale` steps plus whatever `carry` holds, capped so that `lastTickMs * steps` stays
  under `MAX_SIM_MS_PER_TICK`; the remainder goes back to `carry`. Paused returns 0, plus `pendingSteps` (the
  single-step control), which it clears. At 1x it returns 1 and never touches `carry`.
- **The tick loop** (`server/rooms/PartyRoom.ts:108`, pre-seeded, locked): the `setFixedTimestep` callback runs
  `step(this, ctx); runLobbyCommands(this); runLobbyPhase(this)` `n = stepsThisTick(clockOf(this), lastMs)`
  times, measures the whole loop and records `elapsed / n` as the tick sample, so `/health`'s `tickP95` stays
  comparable across scales. The room exposes `effectiveScale` (steps actually run over the last 20 ticks divided
  by 20) for `admin.snapshot`.
- **Only `sim/auto/Auto.ts` writes `scale` or `paused`**; a test (`auto.test.ts`) greps `apps/server/src` for
  `clockOf(` and fails on any writer outside `sim/auto/`. A `party` room never leaves 1x: there is no message
  that changes the clock in the `C2S` union.
- **At 10x** the 50 ms patch carries 10 ticks of deltas, which is fine for an observer. The admin client divides
  `REMOTE_DELAY_MS` (`client/view/interpolation.ts:6`) by the scale (6D's parameter); tick-based timers, HUD
  countdowns, the NPC walk cap and cooldowns are unaffected (they count ticks); walk-animation speed is cosmetic.
  Phase lengths in seconds (`balance.phases`) mean sim seconds, so a 15-minute match runs in 90 wall seconds.

## 3. The all-NPC match (6A)

- **`RoomSim.auto: AutoState | null`** (`server/sim/RoomSim.ts`, pre-seeded, `null`). `AutoState { npcPrey:
  boolean; commands: AutoCommand[]; started: boolean; options: AutoOptions }`.
- **Prey.** `soleHuman` is renamed `preyFor(room, player, p, isNpc)` (`server/sim/npc/world.ts`, 6A owns the
  body, the caller at `:198` stays). Its last line becomes
  `return prey === null || (isNpc(prey) && !simOf(room).auto?.npcPrey) ? null : prey;` so an NPC Killer takes an
  NPC as prey only in an auto match. Nothing else about the brains changes: an all-NPC match is the brains
  playing each other.
- **Start.** `startRefusal` (`lobby.ts:106`) returns null for the human minimum when `simOf(room).auto` is set
  (pre-seeded line, 6A fills the rest). Auto never sends `lobby.start` and needs no leader: **`runAuto(room)`**,
  a new Step stage before `runNpcs` (`Step.ts`, pre-seeded no-op), drains `autoOf(room).commands` and calls the
  exported `startMatch(room)` (`lobby.ts:247`) inside the step. Every admin command of section 6 goes through
  that queue, so nothing mutates state in a message callback (CLAUDE.md).
- **`server/sim/auto/Auto.ts`** (pre-seeded, 6A fills):

```ts
export interface AutoOptions {
  map: MapId; mode: 'main' | 'onub'; seats: number; difficulty: NpcDifficulty;
  deck?: string[]; seeds?: FixedSeeds; npcIds?: string[];   // npcIds: fixed seat ids, for replay and the log
}
export function enableAuto(room: PartyRoom, opts: AutoOptions): void;   // sets room.fixedSeeds, the map, mode, deck and difficulty settings, adds the NPC seats, sets sim.auto
export function queueAutoStart(room: PartyRoom): void;                 // pushes { kind: 'start' }
export function autoOf(room: PartyRoom): AutoState | null;
export function runAuto(room: PartyRoom): void;                        // the Step stage
```

  `enableAuto` is the one place outside the tests that assigns `room.fixedSeeds`; `seeds.test.ts`'s "nothing in
  `apps/server/src` assigns `fixedSeeds`" check gains `sim/auto/Auto.ts` as its single allowed path (pre-seeded).
  NPC seats are added through `addNpcSeat(room, rng, id)` (`server/sim/npc/seats.ts`) with the ids of `npcIds`
  when given, so a replay has the same seat ids.
- **Reset.** `{ kind: 'reset' }` runs `resetToLobby(room)` (`Win.ts`), re-applies the options and leaves the
  room in the lobby with the clock paused.

## 4. The headless harness and the CLI (6A)

- **`apps/server/test/autoHelpers.ts`** (pre-seeded throwing stubs, 6A fills):

```ts
export interface AutoResult { winner: Winner; ticks: number; rounds: number; events: SimEvent[]; failures: InvariantFailure[]; seeds: FixedSeeds }
export async function runAutoMatch(colyseus: ColyseusTestServer, opts: AutoOptions & { maxTicks?: number; invariantsEvery?: number }): Promise<AutoResult>;
```

  It creates a `party` room (`createRoom('party')`), calls `enableAuto` and `queueAutoStart`, then `advance`s in
  a loop until `Phase.gameOver` or `maxTicks` (default `balance.finalNight.afterCycle + 1` cycles' worth of
  ticks), running `runInvariants(room)` every `invariantsEvery` ticks (default 20). A 15-minute match is 18 000
  steps and takes 20 to 40 s on CI; `auto.test.ts` runs one short match per mode on Hollowmere at `seats: 6`
  and `maxTicks` for one day, and the full-length matches run in the weekly `soak.yml` `auto` leg (6B).
- **Determinism test.** Two runs with the same `seeds` and `npcIds` produce the same event-log hash. The log
  (`server/sim/auto/log.ts`, 6B) records seat ids and tick numbers, never avatar handles (they come from
  `randomBytes` and are meant to differ).
- **`tools/auto/`** (`@wdi/auto`, pre-seeded skeleton mirroring `tools/bots/package.json`; 6A owns `run.ts`,
  6B owns `report/` and `checks/`): `pnpm auto -- --matches 20 --seed 7 --map blackpine --mode main --difficulty
  hard --seats 10 --json`. It runs matches in-process on `ColyseusTestServer` (no network), prints one line per
  match (`winner`, `ticks`, `rounds`, failures), prints every invariant failure with the four seed words of
  each stream so the admin page can replay it, and exits 1 on any failure. The root `package.json` gains
  `"auto": "pnpm --filter @wdi/auto start"` (pre-seeded).

## 5. The event bus and the invariants (6B)

- **`server/sim/events/bus.ts`** (pre-seeded, 6B fills): `SimEvent { tick, kind, seat?, scene?, data }`,
  `emitSim(room, ev)`, `onSim(room, kind, fn)`, and the Step stage **`runEvents(room)`** after `runPhases`
  (pre-seeded no-op) that delivers the tick's events to the subscribers and to the match log. Round 6 emits
  `kill`, `death`, `clue`, `meeting`, `vote`, `eject`, `phase`, `start`, `end` from the existing modules'
  locked one-liners (`seams.md` 1.3); the vendettas and the propagation matrix of rounds 7 to 9 are subscribers
  (`bible-seams.md`).
- **`server/sim/auto/invariants.ts`** (pre-seeded, 6B fills): `registerInvariant(name, fn: (room) =>
  InvariantFailure | null)`, `runInvariants(room): InvariantFailure[]`. Round 6 registers:
  1. no `priv` of seat A in the `StateView` of seat B (walk every client's view like `visibility.test.ts`);
  2. no `Avatar.seat` visible to a living viewer;
  3. no NPC stuck: same `brain.goal` and the same tile for more than `balance.npc.stuckTicks`;
  4. no phase past `phaseEndsTick + 1`;
  5. no exception thrown by `step` (the harness wraps it);
  6. the match ends by `finalNight.afterCycle + 1` cycles;
  7. every kill emits its clues (`clue` events after each `kill` within `clues.dropTicks`).
  Later rounds add vendetta and law checks under the same registry.
- `MatchLog` (`server/sim/Win.ts logMatch`) gains `event: 'auto'` lines (6B) so the soak report can tell auto
  matches from bot matches.

## 6. The admin wire (locked; `packages/shared/src/protocol/admin.ts`)

Its own section of `docs/PROTOCOL.md`, "Admin (WDI_ADMIN only)", generated by `pnpm docs:protocol`.
`PartyRoom`'s `onMessage('*')` accepts only the `C2S` union, so a `party` room never accepts an `admin.*`
message; the `AdminRoom` registers them on top.

| Direction | Type | Payload |
|---|---|---|
| C2S | `admin.setup` | `{ map: MapId; mode: 'main' \| 'onub'; seats: number; difficulty: NpcDifficulty; deck?: string[]; seeds?: FixedSeeds }` |
| C2S | `admin.start` | `{}` |
| C2S | `admin.reset` | `{}` |
| C2S | `admin.clock` | `{ scale?: 1 \| 2 \| 5 \| 10; paused?: boolean; step?: number }` |
| S2C | `admin.snapshot` | `{ tick; phase; effectiveScale; seats: AdminSeat[]; mobs?: AdminMob[]; invariants: InvariantFailure[] }` every tick, to the admin client only |
| S2C | `admin.event` | `{ events: SimEvent[] }` the tick's events |
| S2C | `admin.invariant` | `{ name; tick; detail }` once per new failure |

`AdminSeat { id, name, roleId, look, coverOf?, sceneId, x, y, dead, brain?: { mode, goal, striking, flee } }`:
everything a seat holds, roles and covers included, because the admin page is the owner's god view. Every
admin handler pushes an `AutoCommand` into `autoOf(room).commands` and `runAuto` applies it inside the step.

## 7. The GitHub login (6C)

**Flow.** `GET /auth/github/login` -> 302 to GitHub's authorize URL (`scope=read:user`, a signed stateless
`state` = `base64url(nonce.issuedAt) + '.' + HMAC`) -> `GET /auth/github/callback?code&state` -> verify the
state (HMAC with `timingSafeEqual`, issued under 10 minutes ago) -> `fetch` the access token -> `fetch
https://api.github.com/user` -> `login.toLowerCase()` in the allowlist -> `signAdminToken({ sub: login, id,
exp })` -> 302 to `${WDI_ADMIN_CLIENT_URL}#/admin?token=...`. The client moves the token into
`sessionStorage['wdi:adminToken']` and scrubs the hash with `setRoute`. No cookie: github.io and Railway are
cross-site, and a bearer token in the join options is the right shape for Colyseus `onAuth`.

**`server/services/adminAuth.ts`** (pre-seeded: `adminConfig` returns null; 6C fills), pure with injectable
`fetch` and `now`:

```ts
export interface AdminConfig { clientId; clientSecret; logins: Set<string>; secret: string; clientUrl: string }
export function adminConfig(env = process.env): AdminConfig | null;   // null unless WDI_ADMIN=1 and every variable is set
export function signAdminToken(cfg, claims: { sub: string; id: number; exp: number }): string;
export function verifyAdminToken(cfg, token: string, now = Date.now): { sub: string; id: number } | null;
export function installAdminAuth(app: Express, cfg: AdminConfig, deps?: { fetch; now }): void;
export const TOKEN_TTL_S = 3600;
```

| Variable | Meaning |
|---|---|
| `WDI_ADMIN` | `1` enables the admin room and the two routes; anything else disables all of it |
| `WDI_ADMIN_GITHUB_CLIENT_ID`, `WDI_ADMIN_GITHUB_CLIENT_SECRET` | the owner's GitHub OAuth app (callback `https://<railway host>/auth/github/callback`) |
| `WDI_ADMIN_GITHUB_LOGINS` | comma-separated GitHub logins allowed in, compared lower-case |
| `WDI_ADMIN_SECRET` | the HMAC key for the state and the token, 32 random bytes in base64 |
| `WDI_ADMIN_CLIENT_URL` | where the callback sends the browser (`https://groot99-droid.github.io/Who-Did-It/`) |

`TOKEN_TTL_S` is an ops constant, not a game number (ARCHITECTURE 5.11). **Registration gate** (`server.ts`,
pre-seeded block): the `admin` room and the routes exist only when `adminConfig()` is non-null;
`AdminRoom.onAuth` throws the generic join error otherwise, and the error text never says why.

**`server/rooms/AdminRoom.ts extends PartyRoom`** (pre-seeded unregistered class; 6C fills): `onAuth` verifies
the token; `onCreate` calls `super.onCreate`, `enableAuto(this, defaults)` and `registerAdminHandlers(this)`
(`rooms/handlers/admin.ts`, 6C); `onJoin` gives the client **no seat** and `client.view = createAdminView(this)`;
`onLeave` disposes the room. **`server/sim/auto/AdminView.ts`** (pre-seeded, 6C fills): `createAdminView`
(every `SceneState`, every `Player` with its `presence` and `priv` tags), `reconcileAdminView` (every avatar
of every scene with `VIEW_TAG.ghost`, so the true seat shows), `isAdminClient(room, sessionId)`. **One locked
line in `reconcileViews`** (`Visibility.ts:61`, pre-seeded): the admin branch runs before the `viewer` lookup
and `continue`s. No new view tag.

**Tests.** `adminAuth.test.ts`: token round trip, a tampered token, an expired token, a stale state, the
allowlist is case-insensitive, the callback with a fake `fetch`. `adminRoom.test.ts`: without the variables
`create('admin')` fails the way `party.test.ts` asserts no debug handlers; a bad token is refused; a good token
joins without a seat and receives `admin.snapshot`; a `party` client in the same server never receives
`Avatar.seat` alive nor any `admin.*` message.

## 8. The multi-screen observer (6D)

**One authenticated connection, one god view, a grid of per-scene viewports and a seat inspector.** Rejected:
N iframes (N sockets, N audio contexts, per-seat auth) and N `World` instances (`World` is built around the own
player and a single camera).

- **Route** `#/admin` (pre-seeded in `client/main.ts` and `net/worldRouter.ts`): starts `scenes/Admin.ts`, the
  controller scene (pre-seeded empty). Without a token in `sessionStorage` it shows a "Sign in with GitHub"
  button that opens `${serverUrl}/auth/github/login`; with one it calls
  `client.create('admin', { build, token })` through `client/admin/AdminNet.ts`.
- **Viewports.** One Phaser game. For every occupied scene the controller does
  `this.scene.add('AdminView:' + key, AdminSceneView, true, { key, cell })` and sets
  `cameras.main.setViewport(x, y, w, h).setZoom(0.5)`. `AdminSceneView` (`client/admin/AdminSceneView.ts`)
  reuses `GroundView`, `StaticView`, `EntityView` (6D adds an optional label: name, role, cover), `BodyView`,
  `ClueView`, and later 6I's `NodeView` and `MobView`. The grid holds up to 6 cells (3x2 at 426x360 on a 1280x720
  canvas); further occupied scenes queue in the inspector and swap in on click; "follow seat" collapses the grid
  to one viewport on that seat's scene.
- **DOM** (through `ui/dom.ts`, no literal values outside the theme): `admin/Controls.ts` (1x/2x/5x/10x, pause,
  step, the seed words, map, mode, deck, difficulty, seats, Start, Reset), `admin/SeatInspector.ts` (role, cover,
  inventory, notebook, the brain fields of `AdminSeat.brain`), `admin/LogPane.ts` (the event stream, invariant
  failures as red rows that stay until Reset), `admin/mockAdmin.ts` (a scripted snapshot feed under
  `?mock=1#/admin` for Playwright). `REMOTE_DELAY_MS / scale` is passed into the sample buffers of the admin
  views (6D's parameter on `interpolation.ts`).
- **Tests.** `e2e/admin.spec.ts` on the mock: six viewports appear for six occupied scenes, the scale buttons
  send `admin.clock`, an invariant row renders red, the inspector shows a cover's true role. The live path is
  checked at integration (6P) against Railway with the owner's login.

## 9. What is not in round 6

A replay viewer (the seed words are printed; replay is "run the same seeds again"), an admin page without a
GitHub account, more than one admin at a time, and any change to how a `party` room is created or joined.
