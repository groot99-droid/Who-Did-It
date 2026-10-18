# NPC routines and the NPC tells (round 5, Session 5H)

Part 1 is the data and the contract: what the orchestrator pre-seeded before 5H starts (content is locked:
`packages/content/src/**`, `balance.json`) and what 5H then builds on. Sections 1 to 6 and the pre-seed parts of 7 and
8 have landed; where the landed code differs from the draft, the text below says what landed. Part 2 is the tests 5H
writes. GDD text is `docs/GDD.md` 3.12. In part 2, "part 1, section N" points back at part 1.

## Part 1. Data and contract

Contents:

1. `routines.json` (new data file)
2. Its zod schema, the content wiring and the validator rules
3. `balance.json` `npc`: the section after the change, and its zod
4. `AnimId.interact` and the presence rule
5. Pre-seed edits that keep the tree green after the schema change
6. Random streams
7. Code shape for 5H
8. Seams
9. Text for the docs (ARCHITECTURE, SPRITES, DECISIONS, SESSIONS)

Part 2, the tests: 1 how the tests run, 2 the privacy rule, 3 presence and animation, 4 routines, 5 brain and
meetings, 6 ready delays, 7 no NPC tell in a recorded match, 8 content, 9 kept gates.

---

### 1. `packages/content/data/routines.json` (new)

Keyed by **prop kind** only: no scene, portal, spawn, spot, clue or prop id appears in the file, so no frozen id
changes and a new map's props become stations by their kind. A kind sits in exactly one activity or in `ignore`.

```json
{
  "gddRef": "3.12",
  "phaseClasses": {
    "day": ["grace", "day", "immunity"],
    "night": ["dusk", "night", "finalNight"]
  },
  "activities": {
    "work": {
      "phases": ["day"],
      "kinds": ["taskSource", "pump", "flourBin", "oven", "basin", "goat", "fence", "window"]
    },
    "social": {
      "phases": ["day", "night"],
      "kinds": ["noticeBoard", "dartboard", "bell", "lamp", "decor"]
    },
    "rest": {
      "phases": ["night"],
      "kinds": ["lanternPost"]
    }
  },
  "holds": {},
  "ignore": [
    "kitChest",
    "teachingClue",
    "keyCache",
    "gasPocket",
    "lockedDoor",
    "wakeTable",
    "plate",
    "deadLoaf",
    "ledger"
  ],
  "lightKinds": ["lanternPost"]
}
```

- `phaseClasses`: which world phases of the main mode use the day or the night weights and stations (`dawn` is
  quick mode only and belongs to neither).
- `activities[a].phases`: the classes in which a station of that activity qualifies. `kinds`: prop kinds.
- `holds`: prop kind -> the `act.hold` action a **human** can start at such a prop. Empty in M5a, because no human
  station hold exists before the tasks of M4d (`Hold.ts` accepts only Collect on a clue). The row that ships a
  human station hold adds the kind here in the same pull request (for example `"pump": "task"`); the brain needs
  no change.
- `ignore`: kinds that are never stations. The kit chest (standing at the ejected kit reads as looting), the
  teaching clue (a clue, handled by the clue rule), V1.5 objects (`keyCache`, `gasPocket`, `lockedDoor`) and the
  frozen, unused round-4 bakery props.
- `lightKinds`: kinds whose presence lights an exterior at night (GDD 3.12 "Night").

The kinds as they stand on 2026-10-17, plus the props of the round-5 world contract (`world.md`) as of the same day (they reuse
existing kinds only; if 5J's final scenes add a kind, rule 2.3.3 makes it add a row):

| Kind | Activity | Classes | Props today (profile) | Round-5 world contract (5J) |
|---|---|---|---|---|
| `taskSource` | work | day | `as.bench`, `fo.planks`, `wp.letter_box`, `tk.oil_barrel`, `bk.flour_sacks` | `bs.plank_stack` |
| `pump` | work | day | `ov.pump` | `bc.pump` |
| `flourBin` | work | day | `tb.flour_bin` | |
| `oven` | work | day | `bk.oven` | `bl.stove` |
| `basin` | work | day | `as.basin`, `bk.basin` | `bl.basin`, `bf.trough` |
| `goat` | work | day | `ba.goat` (medium) | |
| `fence` | work | day | `ov.fence` | |
| `window` | work | day | `tb.shutters` | |
| `noticeBoard` | social | day, night | `ov.board` | `bc.board` |
| `dartboard` | social | day, night | `tb.dartboard` | |
| `bell` | social | day, night | `ov.bell` | `bc.bell` |
| `decor` | social | day, night | `ov.crepe`, `ov.scarecrow`, `as.shelf`, `tb.photos`, `wp.portrait`, `mh.clock`, `mh.safe` (medium), `ch.rope` (large) | 30 props across the Fenwood, the Gallery and Blackpine |
| `lamp` | social | day, night | `al.green_lamp`, `wb.candle` | |
| `lanternPost` | rest | night | `ov.lantern_0..3` | `bc.lantern_0..3` |
| ignored | – | – | `ov.chest`, `ov.teaching_clue`, `ba.study_key`, `cl.study_key`, `cl.gas_alcove_n/s`, `mu.study_door`, the 15 bakery quick-mode props | `bc.chest`, `bc.teaching_clue` |

Every station prop of today's scenes has a floor tile orthogonally next to its tile (checked on the round-4
tree: 1 to 4 such tiles each), so the validator rule 2.3.5 passes on the pre-seed.

---

### 2. Schema, wiring and validator

#### 2.1 `packages/content/src/schemas/routines.ts` (new)

```ts
import { z } from 'zod';
import { GddRef, Id } from './common.js';

/** A prop kind, the same pattern as `Prop.kind` (schemas/scene.ts). */
const PropKind = z.string().regex(/^[a-z][A-Za-z]*$/);

/** The two phase classes of an NPC routine (GDD 3.12): the day weights and stations, or the night ones. */
export const RoutinePhaseClass = z.enum(['day', 'night']);
export type RoutinePhaseClass = z.infer<typeof RoutinePhaseClass>;

/** The main-mode world phases, by their `Phase` key (packages/shared/src/schema/index.ts). */
export const RoutineWorldPhase = z.enum(['grace', 'day', 'dusk', 'night', 'immunity', 'finalNight']);
export type RoutineWorldPhase = z.infer<typeof RoutineWorldPhase>;

/** Mirrors the protocol's `HoldAction` (packages/shared/src/protocol/index.ts); 5H's server code assigns it to one. */
export const RoutineHold = z.enum(['drag', 'collect', 'task', 'inspect', 'autopsy']);
export type RoutineHold = z.infer<typeof RoutineHold>;

export const RoutineActivity = z.strictObject({
  /** The phase classes in which a station of this activity qualifies. */
  phases: z.array(RoutinePhaseClass).min(1),
  kinds: z.array(PropKind).min(1),
});
export type RoutineActivity = z.infer<typeof RoutineActivity>;

export const RoutinesFile = z.strictObject({
  gddRef: GddRef,
  phaseClasses: z.strictObject({
    day: z.array(RoutineWorldPhase).min(1),
    night: z.array(RoutineWorldPhase).min(1),
  }),
  /** Activity id -> its classes and prop kinds (work, social, rest in M5a; round 6 may add more). */
  activities: z.record(Id, RoutineActivity),
  /** Prop kind -> the hold a human can start at such a prop; an NPC works with that hold only there. */
  holds: z.record(PropKind, RoutineHold),
  /** Prop kinds that are never stations. */
  ignore: z.array(PropKind),
  /** Prop kinds that light an exterior scene at night. */
  lightKinds: z.array(PropKind),
});
export type RoutinesFile = z.infer<typeof RoutinesFile>;
```

#### 2.2 Wiring (`packages/content/src/index.ts`, `validate.ts`)

- `import routinesJson from '../data/routines.json' with { type: 'json' };`
- `import { RoutinesFile } from './schemas/routines.js';` and `export * from './schemas/routines.js';`
- `parseContent` takes `routines: unknown` and returns `routines: RoutinesFile.parse(raw.routines)`; `content`
  passes `routines: routinesJson`; the destructured exports gain `routines`.
- `Content` (validate.ts) gains `routines: RoutinesFile`.
- The client may import `routines` (nothing secret in it); only the server reads it in M5a.

#### 2.3 Validator rules (`validateContent`, exact messages)

1. `phaseClasses.day` and `phaseClasses.night` are disjoint and together hold each of the six
   `RoutineWorldPhase` values exactly once: `routines.json phaseClasses: <phase> is in no class` /
   `... is in both classes` / `... repeats` (the last, added as landed, for a phase listed twice in one class).
2. A kind appears in at most one activity and never in an activity and `ignore` both:
   `routines.json: kind "<k>" is listed twice`.
3. Every prop kind of every scene (every file of `SCENE_IDS`, so every map, `bakery` included) is a kind of some
   activity or of `ignore`: `routines.json: prop kind "<k>" (<propId>) is neither a station nor ignored`.
4. Every key of `holds` is a kind of some activity, and every `lightKinds` entry a kind of some activity or of
   `ignore`: `routines.json holds: "<k>" is not a station kind` / `routines.json lightKinds: "<k>" is unknown`.
5. Every prop whose kind belongs to an activity stands on a floor tile (`.` or `S`) or has one orthogonally next
   to its tile: `scene <sceneId>: station <propId> has no floor tile next to it` (as landed: the `scene <id>:` prefix
   every scene message of the validator uses). (Orthogonal, because the NPC arrives
   within 0.8 of the 1.5-tile verb reach, which a diagonal tile misses.)
6. `balance.json npc`: every range `min <= max` (`balance.json npc.<path>: min > max`); each row of
   `routine.weights` sums to 1 within 1e-9 (`balance.json npc.routine.weights.<class>: weights sum to <s>`, `<s>`
   rounded to 6 decimals);
   `routine.weights` has exactly the classes of `routines.json phaseClasses` (schema-enforced: `day`, `night`).

Rule 3 is the seam with 5J: a map session that adds a prop of a new kind adds the kind to `routines.json` (an
activity or `ignore`) in the same pull request, or `import '@wdi/content'` throws.

#### 2.4 Content tests (`packages/content/test/routines.test.ts`, landed in the pre-seed; 5H owns it)

`parseContent` and `validateContent` on broken copies of the real files, one case per rule above, each asserting
the exact message; plus "the shipped files validate" and "every kind of today's scenes is classified as in the
table of section 1". As landed it holds C1, C2 (one case per rule, with the exact messages), C3, a check of the
`routine.weights` rows against the phase classes and a schema-rejects case; it asserts no balance value, so a retune
never edits it (part 2, section 1). `checkRoutines(c, err)` runs from `validateContent` after `checkOnub`.

---

### 3. `balance.json` `npc`

#### 3.1 The section after the change (whole)

```json
"npc": {
  "difficultyMinNpcs": 4,
  "defaultDifficulty": "normal",
  "difficulty": {
    "easy": { "killChancePer10s": 0.25, "reportDelayS": 5, "plantsPerNight": 0, "suspectVoteChance": 0.5 },
    "normal": { "killChancePer10s": 0.4, "reportDelayS": 3, "plantsPerNight": 1, "suspectVoteChance": 0.75 },
    "hard": { "killChancePer10s": 0.6, "reportDelayS": 1.5, "plantsPerNight": 2, "suspectVoteChance": 1 }
  },
  "wander": {
    "stepMinS": 1,
    "stepMaxS": 3,
    "portalSteerChance": 0.25,
    "portalChance": 0.4
  },
  "routine": {
    "weights": {
      "day": { "work": 0.5, "stroll": 0.3, "idle": 0.2 },
      "night": { "work": 0.2, "stroll": 0.3, "idle": 0.5 }
    },
    "stationDwellS": { "min": 12, "max": 30 },
    "workPauseS": { "min": 1, "max": 3 },
    "idleS": { "min": 2, "max": 8 },
    "idleChanceAfterLeg": 0.6,
    "strollTiles": { "min": 3, "max": 10 },
    "sceneDwellS": { "min": 30, "max": 90 },
    "favouriteStations": 3,
    "maxWalkS": 12,
    "stuckS": 2
  },
  "react": {
    "startleS": { "min": 0.5, "max": 1.5 },
    "afterPlacementIdleS": { "min": 3, "max": 8 },
    "collectChance": 0.5
  },
  "night": {
    "leaveDelayS": { "min": 0, "max": 15 }
  },
  "vote": {
    "windowFrac": { "min": 0.3, "max": 0.9 }
  },
  "ready": {
    "delayS": { "min": 2, "max": 9 }
  },
  "nightPower": {
    "windowFrac": { "min": 0.1, "max": 0.8 },
    "lastShotS": { "min": 2, "max": 8 }
  },
  "gddRef": "3.12"
}
```

#### 3.2 Against today

| Path | Today | After |
|---|---|---|
| `npc.difficulty`, `npc.difficultyMinNpcs`, `npc.defaultDifficulty` | as is | unchanged |
| `npc.wander` | the walk | unchanged values; the fallback only (GDD 3.12 "Fallback") |
| `npc.vote` | `{ delayMinS: 3, delayMaxS: 12 }` (vote and role-card ready) | `{ windowFrac: { min: 0.3, max: 0.9 } }` (vote only) |
| `npc.ready` | – | new: `delayS` 2-9 s, the role card and the lobby |
| `npc.routine` | – | new: the routine numbers (the process report's table, plus `maxWalkS` 12 and `stuckS` 2) |
| `npc.react` | – | new: `startleS` 0.5-1.5, `afterPlacementIdleS` 3-8 (the report's `afterMeetingIdleS`, renamed because it also covers grace), `collectChance` 0.5 |
| `npc.night` | – | new: `leaveDelayS` 0-15 s, the wait before an NPC in an unlit scene walks home in the night class (GDD 3.12 "Night") |
| `npc.nightPower` | – | new: `windowFrac` 0.1-0.8, `lastShotS` 2-8 (read by 5G's NPC night powers) |

#### 3.3 zod (`packages/content/src/schemas/balance.ts`)

Add beside `Chance` (which already exists above `NpcDifficultyRow`):

```ts
/** A `{min, max}` span drawn uniformly (GDD 3.12); `validate.ts` checks min <= max. */
const Span = z.strictObject({ min: z.number().nonnegative(), max: z.number().nonnegative() });
/** A `{min, max}` span of whole tiles. */
const TileSpan = z.strictObject({ min: z.number().int().positive(), max: z.number().int().positive() });
/** A `{min, max}` span of fractions of a phase. */
const FracSpan = z.strictObject({ min: Chance, max: Chance });
/** The next activity's weights in one phase class; each row sums to 1 (validate.ts). */
const RoutineWeights = z.strictObject({ work: Chance, stroll: Chance, idle: Chance });
```

Replace the `npc` section's `wander` comment and `vote` line, and add the new keys:

```ts
  npc: Section({
    /** Below this many NPC seats the difficulty setting is off and NPCs play `defaultDifficulty`. */
    difficultyMinNpcs: z.number().int().positive(),
    defaultDifficulty: NpcDifficulty,
    difficulty: z.strictObject({
      easy: NpcDifficultyRow,
      normal: NpcDifficultyRow,
      hard: NpcDifficultyRow,
    }),
    /**
     * The M3c walk, now only the fallback in a scene with no station and no stroll tile: a new heading every
     * `stepMinS..stepMaxS`, aimed at the nearest portal with `portalSteerChance`, a portal in reach taken with
     * `portalChance` (GDD 3.12).
     */
    wander: z.strictObject({
      stepMinS: Seconds,
      stepMaxS: Seconds,
      portalSteerChance: Chance,
      portalChance: Chance,
    }),
    /** The routine (GDD 3.12 "Routines"). */
    routine: z.strictObject({
      weights: z.strictObject({ day: RoutineWeights, night: RoutineWeights }),
      stationDwellS: Span,
      workPauseS: Span,
      idleS: Span,
      idleChanceAfterLeg: Chance,
      strollTiles: TileSpan,
      sceneDwellS: Span,
      favouriteStations: z.number().int().positive(),
      /** Walking this long without a still stretch of `idleS.min` forces an idle. */
      maxWalkS: z.number().positive(),
      /** A goal with no quarter-tile of progress in this time is dropped. */
      stuckS: z.number().positive(),
    }),
    /** Reactions (GDD 3.12): the startle at a body, the idle after a placement, the clue roll. */
    react: z.strictObject({ startleS: Span, afterPlacementIdleS: Span, collectChance: Chance }),
    /** The night rule (GDD 3.12 "Night"): the wait in an unlit scene before the walk home. */
    night: z.strictObject({ leaveDelayS: Span }),
    /** The vote tick: this fraction of the discussion plus the vote time, from the discussion's start. */
    vote: z.strictObject({ windowFrac: FracSpan }),
    /** The ready delay on the role card and in the lobby. */
    ready: z.strictObject({ delayS: Span }),
    /** NPC night powers (GDD 3.2, 3.12): the use tick over dusk plus night, and the Last Shot delay. */
    nightPower: z.strictObject({ windowFrac: FracSpan, lastShotS: Span }),
  }),
```

`validate.ts` adds the spans of `npc.routine` (`stationDwellS`, `workPauseS`, `idleS`, `strollTiles`,
`sceneDwellS`), `npc.react` (`startleS`, `afterPlacementIdleS`), `npc.night.leaveDelayS`, `npc.vote.windowFrac`,
`npc.ready.delayS` and `npc.nightPower` (`windowFrac`, `lastShotS`) to a `min > max` loop, plus the weights sums (rule 2.3.6).

---

### 4. `AnimId.interact` and the presence rule (pre-seed, landed)

**Server** `apps/server/src/sim/constants.ts`:

```ts
/**
 * `Presence.animId` values. One shared `swing` id covers every strike and one shared `interact` id every hold,
 * so neither tells a role or an action apart (GDD 3.12 "Animation").
 */
export const AnimId = { idle: 0, walk: 1, swing: 2, die: 3, interact: 4 } as const;
```

**Client mirror** `apps/client/src/view/animIds.ts`:

```ts
/** `Presence.animId` values; mirrors apps/server/src/sim/constants.ts. One `swing` id serves every strike, one `interact` id every hold. */
export const AnimId = { idle: 0, walk: 1, swing: 2, die: 3, interact: 4 } as const;
```

**Server** `apps/server/src/sim/Movement.ts`, two edits (the walk-in-place fix and the hold animation):

```ts
// moveAndCollide: remember where the body stood, so `walk` follows the real displacement, not the command.
    const x0 = p.x;
    const y0 = p.y;
    if (p.vx !== 0 || p.vy !== 0) {
      // ...the existing ghost / moveAabb branch, unchanged...
    }
    p.pushRing();
    publishPresence(player.presence, p, p.x !== x0 || p.y !== y0, tick);

// publishPresence: a running hold shows `interact`, whoever holds and whatever the hold.
  presence.animId = p.hold !== null ? AnimId.interact : moving ? AnimId.walk : AnimId.idle;
```

`runHolds` still cancels a hold on a non-zero velocity (`Hold.ts:85`), so `interact` and `walk` never compete. A
human's hold starts in `runCommands`, after `moveAndCollide`, so its `interact` appears on the next tick's
publish; an NPC's starts in `runNpcs`, before it, so on the same tick. When 5F moves presence onto
`SceneState.avatars`, the avatar copies `animId` as it copies the rest of the presence; the rule stays here.

**Client** (5I, `view/PlayerView.ts` `pose`): `AnimId.interact` plays the `interact` clip of the look
(`char/<lookId>/interact/<dir>`, 5L renders it for every look); a look without the clip plays `idle`. The greybox
placeholder draws `interact` as `idle` with a small teal tick above the head.

As landed: `AnimId.interact = 4` in `apps/server/src/sim/constants.ts` and the client mirror, checked by the new
`apps/client/src/view/animIds.test.ts` (part 2, A5); `moveAndCollide` passes the real displacement
(`p.x !== x0 || p.y !== y0`, `Movement.ts:100`), so a seat pushing into a wall no longer walks in place, and
`publishPresence` shows `interact` whenever `p.hold !== null` (`Movement.ts:124`). The client shows it as idle until
5I's `PlayerView.pose`.

---

### 5. Pre-seed edits that keep the tree green (landed)

The `npc.vote` shape changed, so its readers changed in the same pre-seed (5H then rewrites them). As landed:

- `apps/server/src/sim/npc/meeting.ts`, `readyOnRoleCard`:
  `const d = balance.npc.ready.delayS;` and
  `brain.readyAtTick = tick + npcDelayTicks(mem.rng, d.min, d.max, TICK_RATE);`
- same file, `runMeetingVotes`, the draw on the discussion's first tick:
  ```ts
  if (brain.voteAtTick < 0) {
    const f = balance.npc.vote.windowFrac;
    const span = Math.max(0, room.state.phaseEndsTick - tick) + balance.phases.voteS * TICK_RATE;
    brain.voteAtTick = tick + Math.round(span * (f.min + mem.rng() * (f.max - f.min)));
  }
  ```
- `apps/server/test/npcBrain.test.ts` "votes inside npc.vote.delayMinS..delayMaxS" becomes "votes inside
  npc.vote.windowFrac of discussion plus vote": `W = (phaseEndsTick at open - opened) + voteS * 20`, bounds
  `[floor(0.3 W) - 3, ceil(0.9 W) + 1]` (the lower bound is `- 3`, not the draft's `- 1`: the test learns the
  opening tick by polling every 25 ms, so it can trail the NPC's draw by a tick or two), `until` timeout 120 s and a
  150 s test timeout (the test is replaced by 5H's fast-forward version, part 2, M1).
- same file, the suspect-vote test ("votes for the seat it saw at a body"), whose 20 s wait would miss a vote at
  25-77 s under the new window: it narrows `npc.vote.windowFrac` to 0-0.05 for its run and restores it afterwards.
- `apps/server/test/npc.test.ts` "readies NPCs on the role card at a human pace": bounds from
  `balance.npc.ready.delayS` (`min * 20 - 3`, `max * 20 + 3`); "survives resetToLobby" keeps asserting
  `ready: true` for NPC seats until 5H changes the reset (5H rewrites both, part 2, D1 and D4).
- `apps/client/e2e/npc.spec.ts:29`:
  `const voteWindowMs = (balance.npc.vote.windowFrac.max * (Math.max(...Object.values(balance.byCount).map((r) => r.discussionS)) + balance.phases.voteS) + 10) * 1000;`
- `docs/ARCHITECTURE.md` 5.3 "Start flow": "readies each NPC seat on the role card after an `npc.vote` delay"
  becomes "after an `npc.ready` delay" (section 9 has the full replacement; the round-5 docs pass carries it).

Shared server files (ruling X5): `lobby.ts` is locked for 5H, so the pre-seed also (in its deck and world steps,
checked unchanged by the NPC step)

- moved the bodies of `fillNpcSeats` and `addNpcSeat` from `rooms/handlers/lobby.ts`, unchanged, into a new 5H
  file `apps/server/src/sim/npc/seats.ts`, and exports `newSeat` from `lobby.ts` for them (`addNpcSeat` gained the
  optional `id = generateId()` of section 7). The calls stay in
  `lobby.ts` and are locked: `startMatch` keeps `fillNpcSeats(room, room.seeds.get('npcNames'))`, and
  `handleAddNpc` calls `addNpcSeat(room, room.seeds.get('npcNames'))` instead of a fresh
  `mulberry32(randomInt(2 ** 32))`, so the NPC names of both paths come from `npcNames`;
- routed the brain's map reads through the new `apps/server/src/sim/MapSites.ts` (5J owns its bodies): the
  basin scenes of `npc/world.ts` and the scene list of `npc/walk.ts` from `mapScenesOf(room)` (today
  `SCENE_IDS`), and the flee's end from `hubOf(room)` (today `'overworld'`). `npc/world.ts` and `npc/walk.ts`
  are 5H's alone; 5J never edits them.

---

### 6. Random streams

The one spec is `deck-wire.md` section 2.2 (`apps/server/src/sim/seeds.ts`, landed): every stream is `sfc32`
on four crypto words, `MatchSeeds.get(name, key?)` gives a keyed stream that is independent per key, and
`fixSeeds(room, words)` lives in the test helper `apps/server/test/seedHelpers.ts`, never in a production path.
This section only says what the NPCs draw from it. No NPC draw comes from the deal, from another seat's streams
or from `NpcMemory.rng`, which 5H removes.

| Stream | Draws | Note |
|---|---|---|
| `npcTiming:<seatId>` | that seat's role-card ready tick, lobby ready tick, vote tick, night-power tick and Last Shot delay | the ticks a client can see as one-off events |
| `npcPlay:<seatId>` | that seat's persona (home, favourites), each activity, station, stroll tile, every duration (`stationDwellS`, `idleS`, `sceneDwellS`, `workPauseS`, `startleS`, `afterPlacementIdleS`, `night.leaveDelayS`), the clue roll, the strike roll, the night-power pick, the wander headings, suspect ties, vote targets | the same keyed name 5E uses for ONUB NPC choices; a match is one mode, so they never meet |
| `npcNames` | `pickNpcNames` at the fill and at Add NPC (`sim/npc/seats.ts`) | one stream for the party, not keyed |

**Card-blind draws.** A draw that only some cards use is made by every NPC at the same moment and ignored when
its card does not use it, so no card changes how far a seat's streams move:

| Draw | Stream | When every NPC draws it | Used only by |
|---|---|---|---|
| strike roll (one uniform) | `npcPlay` | first, on each check: a tick of a phase in `abilities.kill.phases` on which the NPC is living, placed and not in transit, and exactly one other living seat shares its scene and is a human not in transit | an NPC that holds `kill`, with the Knife ready and that seat not a Cabal mate |
| vote: suspect roll, suspect tie, fallback seat (three uniforms) | `npcPlay` | at its vote tick | the roll and the tie by a non-Killer NPC with no confession; the fallback seat when Skip is disabled and it has no suspect or plurality |
| vote: tie roll (one uniform) | `npcPlay` | at its vote tick, then once a second until the vote ends | a Killer NPC re-reading the plurality |
| night-power tick | `npcTiming` | on the first tick of each dusk and each Final Night hunt | an NPC holding a night power (5G reads it, section 8) |
| night-power pick (one uniform) | `npcPlay` | right after the night-power tick | the same NPC, to choose among its legal targets (5G) |
| Last Shot delay | `npcTiming` | on the tick the NPC dies | an NPC Gamekeeper that aims |

As landed, the keyed streams `npcPlay:<seat>` and `npcTiming:<seat>` exist in `seeds.ts`, but the NPC brain still
draws from `NpcMemory.rng` (the role-card ready, the vote tick); only `npcNames` is read from `room.seeds` so far.
5H moves every NPC draw to the keyed streams and removes `NpcMemory.rng`.

As at 265bda9, `PartyRoom.seeds` exists from room creation (`PartyRoom.ts:60`) and is replaced at every Start
(`lobby.ts:279`), so an Add NPC before the
first Start already has its streams.

---

### 7. Code shape for 5H

Paths: `apps/server/src/sim/npc/{routine,world,walk,meeting,memory,seats}.ts`, `apps/server/src/sim/Npc.ts`,
`apps/server/test/{npcHelpers,npcTells}.ts`, the test files of part 2, `packages/content/test/routines.test.ts`.
`rooms/handlers/lobby.ts` is not 5H's: its `fillNpcSeats` and `addNpcSeat` calls are locked, and their bodies
live in `sim/npc/seats.ts` from the pre-seed (section 5, ruling X5). `memory.ts`, `seats.ts` and `npcHelpers.ts`
are not in the 5H line of the session table today; see section 9.

**`sim/npc/routine.ts` (new)**

```ts
export type PhaseClass = RoutinePhaseClass; // 'day' | 'night'
/** The class of a main-mode world phase (routines.json phaseClasses), null for every other phase. */
export function phaseClassOf(phase: number): PhaseClass | null;
/** GDD 3.12 "Night": not dark, not forest or cave, and an interior or a scene with a night light. */
export function isLitAtNight(scene: Scene): boolean;
/** Every station prop of the map's scenes present at `profile`, with its floor stand tiles; cached per map and profile. */
export function stationsOf(map: readonly SceneId[], profile: Profile): readonly Station[];
export interface Station { propId: string; scene: SceneId; kind: string; activity: string; x: number; y: number;
  stands: readonly { x: number; y: number }[] }
/** The persona (GDD 3.12): a home and `favouriteStations` favourites in distinct scenes, from `npcPlay`. */
export function drawPersona(room: PartyRoom, homesTaken: ReadonlySet<SceneId>): Persona;
export interface Persona { home: SceneId | null; favourites: readonly string[] }
/** One routine tick: continue the current activity or choose the next (called last by `runWorldNpc`). */
export function runRoutine(room: PartyRoom, mem: NpcMemory, brain: Brain, player: PlayerState, p: PlayerSim): void;
```

**`runWorldNpc` order** (`sim/npc/world.ts`), each step returning when it drove the seat:
1. dead, unplaced or in the loft: stand; busy (`busyUntilTick`): return.
2. `observe` (bodies, suspicion, as today) and the clue sighting (sets `brain.pendingClue` on a won roll; the
   pending clue is dropped when the NPC leaves that scene or the clue is gone). A Killer NPC adds the body of
   its own strike to `seenBodies` at the strike, so it never startles at its own kill.
3. `debug.npc {walk: false}`: stand.
4. The strike roll, drawn by every NPC on each check (section 6), before any other draw of the tick. Then, for
   an NPC that holds `kill` (a Killer, or an Accomplice after Inherit): flee, then strike (phases from
   `abilities.kill.phases`; the target is the prey's current avatar handle once 5F lands, section 8).
5. A body it did not make: startle, approach, report, for every NPC, a Killer NPC included; the bodies of its
   own strikes are skipped (never startled at, never reported).
6. A placement (grace or immunity started): idle `afterPlacementIdleS`, fresh scene dwell.
7. Night class in a scene `isLitAtNight` rejects: on the first such tick draw `leaveAtTick = tick +
   leaveDelayS` (`npcPlay`) and run the routine (step 9) inside the scene until it, with no station and no portal
   (strolls and idles only); from `leaveAtTick` walk home, or to the nearest lit scene, with `mode` `home`, as
   legs with the usual pauses (`idleChanceAfterLeg`, `maxWalkS`). Reaching a lit scene clears `leaveAtTick`.
8. `debug.npc {routine: false}`: `wander` (the detector self-check of E2 and the fallback case R16, part 2).
9. `runRoutine`.

**`Brain` additions** (`sim/npc/memory.ts`; the ONUB pre-seed already dropped the plate fields, and the main-mode
pre-seed added `nightPowerAtTick`, `nightPowerPick` and `lastShotAtTick` at `memory.ts:42-44`):

```ts
/** What drives the seat now; tests read it to exempt reactions and the fallback (the walk home is not exempt). */
mode: 'routine' | 'react' | 'home' | 'fallback' = 'routine';
/** Night class in an unlit scene: the tick the walk home starts (`npc.night.leaveDelayS`); -1 when none. */
leaveAtTick = -1;
/** Card-blind draws (section 6), made for every NPC: the night-power tick and pick (5G reads them) and the Last
 * Shot tick, drawn on the tick the NPC dies; -1 when none. */
nightPowerAtTick = -1; nightPowerPick = 0; lastShotAtTick = -1;
persona: Persona | null = null;
/** The current activity; null when the next must be chosen. */
act: { kind: 'work' | 'stroll' | 'idle' | 'collect' | 'travel'; untilTick: number; stationId: string;
  goal: { scene: number; x: number; y: number } | null } | null = null;
/** Scene bookkeeping: the scene seen last tick, when it was entered, when its dwell runs out. */
sceneIdx = -1; sceneEnteredTick = 0; sceneDwellUntilTick = 0;
lastStationId = '';
/** Ticks walked since the last still stretch of `idleS.min`, and the current still run. */
walkTicks = 0; stillTicks = 0;
/** Progress watch for `stuckS`: the best distance to the goal and the tick it was set. */
bestGoalPx = Infinity; bestGoalTick = 0;
readonly seenClues = new Set<string>(); pendingClue = '';
startleUntilTick = -1; placementIdleUntilTick = -1;
/** Hold attempts at the current station visit (a refusal ends the cycles; tests count them). */
holdTries = 0;
lobbyReadyAtTick = -1;
```

`NpcMemory` gains `readonly claims = new Map<string, string>()` (station prop id -> NPC id, released when the
visit ends, at a meeting, at death and at the lobby) and loses `rng`; `debug` accepts `routine?: boolean`
(`pushNpcDebug` reads it like `walk`). `Npc.ts` `runNpcs` gains a `Phase.lobby` branch (the lobby ready),
`readyOnRoleCard` calls `markCardReady(room, id)` (5F; landed at `sim/npc/meeting.ts:19`), and `resetNpcsForLobby` sets every NPC seat
`ready = false` with `lobbyReadyAtTick = tick + delay`. `addNpcSeat` (`sim/npc/seats.ts`) seats the NPC with
`ready = false` and the same delay, and takes the optional third parameter `id = generateId()` (landed) so the
tests can seat NPCs under fixed ids (part 2, section 1); the locked calls in `lobby.ts` never pass it.

**Holds.** The NPC starts every hold through `handleHold(room, id, { action, targetId, on: true })` (`sim/Hold.ts`,
unchanged) and never writes `PlayerSim.hold` or `Presence.animId` itself. Collect: `targetId` is the clue id;
the NPC stands until `p.hold` is null again (completed or cancelled), at most `abilities.collect.castS` (2 s) plus 1 s. Station work with a
`holds` row: `targetId` is the prop id; `p.hold === null` right after the call means refused, which ends the
cycles for the visit (`holdTries` stays 1).

**Arrival and facing.** The walk to a station ends at the centre of its free stand tile nearest the NPC (within a
quarter tile, not the 0.8-of-reach arrival `walkTo` uses for portals, so the NPC never ends up on a diagonal
tile), then one tick of input toward the prop's centre (the body moves at most 9.6 px, staying on its tile, or
stops against the prop's tile), then input null. Nothing writes `presence.yaw` directly.

**Vote target.** `sim/npc/meeting.ts` exports `npcVoteTarget(room, id): string | null` (pre-seeded as a stub returning
null), used by `runMeetingVotes`
and by 5G's NPC Last Shot. In order: (1) a Cabal confession: the living seat of the first `priv.notebook` entry
with `note === NoteKind.confession` and `value` the Cabal team's index (GDD 3.12, F14); (2) a Killer NPC: the
plurality of the votes already cast, re-read every second; (3) with `suspectVoteChance` the suspect of its
suspicion memory; (4) when Skip is disabled (the forced-vote state of 3.8 and the Final Night's
`finalNight.skipAllowed`, through the same helper `handleVote` uses), a random living other seat; (5) else null,
which votes Skip or holds the shot. Every NPC draws the vote's uniforms at its vote tick and the tie roll each
second whatever its card (section 6). The `quick` parameter and branch go (`onub-contract.md`, 5E owns quick mode).

---

### 8. Seams

| Producer -> consumer | Contract | Until it lands |
|---|---|---|
| orchestrator -> 5H | `routines.json`, its schema and validator, the `npc` rows, `AnimId.interact`, the `Movement.ts` lines, the section 5 edits | landed |
| 5F -> 5H | `markCardReady(room, id)` on the role card | landed; the stub writes `player.ready` until 5F lands |
| 5F -> 5H | Kill takes an avatar handle: the NPC Killer sends `room.state.players.get(prey).priv.avatar`, never the seat id | the NPC sends the seat id while the pre-seeded `resolveHandle` accepts one |
| 5G -> 5H | `abilities.json` `kill.phases` (dusk, night, finalNight) | the NPC strikes at night only, as today |
| 5G -> 5H | Inherit gives a living Accomplice `kill` (`deck-wire.md` section 5); the brain treats any NPC that holds `kill` as a Killer NPC | the brain reads the role's abilities, as today |
| 5H -> 5G | `balance.npc.nightPower` (`windowFrac`, `lastShotS`); the card-blind draws on the `Brain` of every NPC (`nightPowerAtTick`, `nightPowerPick`, `lastShotAtTick`, section 6), from which 5G's NPC night powers take their tick, pick and Last Shot delay instead of drawing; `npcVoteTarget(room, id)`, at which an NPC Last Shot aims (a Cabal confession first) | the rows are pre-seeded; 5G reads them |
| 5J -> 5H | the map's scene list and hub, read through the pre-seeded `apps/server/src/sim/MapSites.ts` (`mapScenesOf(room)`, `hubOf(room)`; 5J owns the bodies) | they return today's Hollowmere values (`SCENE_IDS`, `'overworld'`) |
| 5J -> 5H | scene fields `biome`, `dark`, `lights[].phases` (read by `isLitAtNight` through `biomeOf` and `isDarkScene`) | the world pre-seed set `biome` and `dark` on the 15 current scenes and removed `ambientLightTiles` (landed), so R8's answer holds now; absent `lights` read as none |
| 5J -> content | a new prop kind gets a `routines.json` row in the same pull request (rule 2.3.3) | the import throws |
| 5E <-> 5H | `npc/meeting.ts` loses its quick branch (5H); ONUB NPC votes use `onubBalance.npc.voteFrac` (5E); `readyOnRoleCard` serves both modes | pre-seed routing of the ONUB contract |
| 5I -> players | `PlayerView.pose` maps `AnimId.interact` to the `interact` clip | idle frames |

---

### 9. Text for the docs (ARCHITECTURE, SPRITES, DECISIONS, SESSIONS)

After the round-5 docs pass, ARCHITECTURE 5.3 and 5.6 and SPRITES 3 carry the texts below; the DECISIONS row and the
SESSIONS line are the orchestrator's to place with the round-5 contract.

**ARCHITECTURE 5.3, "Start flow", the last sentence** becomes: "Below `players.min` seats `startMatch` first adds
NPC seats up to it (names from the `npcNames` stream of `sim/seeds.ts`), so every deck row is dealt in full; the
NPC brain (`runNpcs`, after `syncRoster` and before `applyInputs`, `sim/npc/*`) readies each NPC seat on the role
card after an `npc.ready` delay, then runs its routine (stations, strolls, idling, reactions), reports and votes,
each NPC seat drawing only from its own keyed streams `npcPlay:<seatId>` and `npcTiming:<seatId>` (GDD 3.12, A41
and the round-5 row)."

**ARCHITECTURE 5.6 (the presence write)**, one sentence: "`Presence.animId` is `interact` while the seat's own
`act.hold` runs, `walk` only on a tick its position actually changed, else `idle` (`publishPresence`)."

**SPRITES 3**: `interact` leaves the reserved list; it is a V1 clip of every look, 8 frames, 8 directions,
`Presence.animId` 4.

**DECISIONS row (round 5, NPC routines)**: "NPCs run routines instead of the M3c wander (GDD 3.12): a persona per
match (a home lit at night and 3 favourite stations in distinct scenes), stations by prop kind from the new
`routines.json` (work by day, social by day and night, rest by night), a scene dwell before any portal, a 12 s
walking cap, strolls and idles, the night kept to lit scenes (an NPC in the dark leaves after a seeded delay,
with its usual pauses), the same startle, approach and report at a body by every NPC (a Killer NPC too, for a
body it did not make), an idle after every placement, and Collect on clues they see (chance 0.5) through the
human verb. An NPC with a Cabal confession in its Notebook votes for that seat and aims its Last Shot at it. An NPC shows `interact` only
during a hold the server accepted from it, and works with it only at stations listed in `routines.json` `holds`
(none in M5a), so no NPC animation is one a human cannot make in the same spot. The vote tick spreads over 0.3-0.9
of discussion plus vote; NPC seats ready 2-9 s after the card opens, after Add NPC and after the lobby return. Each
NPC seat draws from its own `npcTiming:<seatId>` (ticks) and `npcPlay:<seatId>` (choices), and a draw only some
cards use (the strike roll, the vote's draws, the night-power tick and pick, the Last Shot delay) is made by every
NPC and ignored by the cards that do not use it. `npc.wander` stays as the fallback and behind
`debug.npc {routine: false}`."

**SESSIONS, 5H's Owns** adds `apps/server/src/sim/npc/memory.ts`, `apps/server/src/sim/npc/seats.ts` (the
`fillNpcSeats` and `addNpcSeat` bodies, moved there by the pre-seed; their calls in `lobby.ts` are locked and
`lobby.ts` leaves 5H's list), `apps/server/test/npcHelpers.ts` (its `advance` helper), the new
`apps/server/test/{npcRoutine,npcTells,presence}.test.ts` and `npcTells.ts`, and
`packages/content/test/routines.test.ts`; `Movement.ts`, `constants.ts`, `animIds.ts`, the content files and the
section 5 edits are pre-seeded and locked.

---

## Part 2. Tests

The tests 5H writes, as exact statements with their thresholds. Rules and numbers are `docs/GDD.md` 3.12 and the
`balance.json` / `routines.json` rows of part 1; a test reads every balance-derived bound from `balance` (so a
retune never edits a test) and names the GDD 3.12 "Targets" (60%, 10%, 20 s windows) as constants. Ticks are
20 Hz; "[a, b] ticks" includes both ends.

---

### 1. How the tests run

- **Fast-forward, not sleep.** Every test reaches its first world phase with the existing helpers (`lobbyOf`,
  `start`, `toWorld`), then drives time with `advance`, which calls the room's `step()` directly. No new test
  sleeps more than the 150 ms a sent message needs to be consumed. Budget: everything below in the default suite
  adds at most 30 s of wall time on the CI runner (the server suite is already past its 4-minute split trigger).
- **Fixed seeds.** Statistical tests fix the streams `deal`, `npcTiming` and `npcPlay` before Start, each to the
  set's four words, with `fixSeeds(room, { deal: w, npcTiming: w, npcPlay: w })` from
  `apps/server/test/seedHelpers.ts` (the stream spec is `deck-wire.md` section 2.2), so a failure reproduces. A
  keyed stream `npcPlay:<seatId>` or `npcTiming:<seatId>` takes the listed words with its fourth word XORed with
  the 32-bit FNV-1a hash of its key, so the seat ids must repeat too: `standardParty` seats its nine NPCs
  white-box with `addNpcSeat(room, room.seeds.get('npcNames'), id)` (`sim/npc/seats.ts`, part 1, section 7)
  under the fixed ids `<set>npc0001` to `<set>npc0009` in lower case (`s1npc0001`, nine characters like a
  session id). The default suite runs set S1; `WDI_SLOW=1` adds S2, S3 and S4. A failure message prints the
  set's name.

  | Set | Words |
  |---|---|
  | S1 | `0x2f6b1a3d, 0x91c4e7f2, 0x5ad38e01, 0xc7709b44` |
  | S2 | `0x13579bdf, 0x2468ace0, 0xfdb97531, 0x0eca8642` |
  | S3 | `0xdeadbeef, 0x0badf00d, 0xfeedface, 0xcafebabe` |
  | S4 | `0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a` |

- **The standard party** ("1 + 9"): one human test client that never sends input, never readies and never votes
  (AFK at its spawn), plus nine NPC seats under the fixed ids of the seed set (Fixed seeds, above), so the party
  is 10 (the large profile, every Hollowmere scene open). "All Townsfolk" means `allTownsfolk(room)` after
  `toWorld` (no Knife, no bodies).
- **Held phases.** `holdPhase(party, phase, seconds)` sets `state.phase` and `phaseEndsTick = tick + seconds * 20`
  white-box, as `npcSlow.test.ts` already does; the NPC stage sees the change on the next tick.
- **Moving and still.** A seat *moves* on a tick when its `PlayerSim` position differs from the previous tick's in
  the same scene; a scene change is neither a move nor still and breaks every run. A *still run* is a stretch of
  consecutive ticks with the same scene and position.
- **Exempt ticks.** Ticks on which `brain.mode` is `react` or `fallback` (part 1, section 7) are left out of the
  stillness, moving-share and dwell checks; ticks in transit (`tick < busyUntilTick`) too. The walk home (`home`)
  is not exempt: it has the usual leg pauses (GDD 3.12 "Night").

#### Helpers 5H adds

`apps/server/test/npcHelpers.ts`:

```ts
/** Runs `ticks` server steps synchronously (no sleeps), calling `onTick` after each. */
export function advance(party: Party, ticks: number, onTick?: (tick: number) => void): void;
/** White-box: puts the room in `phase` until `seconds` from now. */
export function holdPhase(party: Party, phase: number, seconds: number): void;
/** The four fixed seed sets of section 1. */
export type SeedSet = 'S1' | 'S2' | 'S3' | 'S4';
/** A 1 human + 9 NPC party at the large profile, seeds and NPC seat ids fixed to `set`; stops on the role card when `onCard`, else in its first world phase. */
export async function standardParty(colyseus: ColyseusTestServer, set: SeedSet, onCard?: boolean): Promise<Party>;
```

`apps/server/test/npcTells.ts` (pure apart from `recordMatch`):

```ts
export interface SeatSample { scene: number; x: number; y: number; yaw: number; animId: number;
  hold: { action: string; targetId: string } | null; dead: boolean; busy: boolean; mode: string; ready: boolean;
  voted: boolean }
/** A body on one tick: `by` is the seat whose strike made it ('' for none, white-box from the kill record);
 * `open` when it is neither reported nor hidden. */
export interface BodySample { id: string; scene: number; x: number; y: number; by: string; open: boolean }
export interface Recording { ticks: { tick: number; phase: number; phaseEndsTick: number;
  seats: Map<string, SeatSample>; bodies: BodySample[] }[]; npcIds: ReadonlySet<string>;
  cardReadyTicks: Map<string, number> }
/** Records every tick from Start to `lobbyExtraS` after the return to the lobby; throws past `maxTicks`. */
export function recordMatch(party: Party, opts: { maxTicks: number; lobbyExtraS: number }): Recording;
export interface Tell { code: 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6' | 'T7' | 'T8' | 'T9' | 'T10' | 'T11' | 'T12';
  seat: string; tick: number; detail: string }
/** Every NPC tell of section 7 found in `rec`; empty means none. */
export function findTells(rec: Recording): Tell[];
```

---

### 2. The privacy rule (work only at stations a human can use too)

**Rule.** An NPC starts a hold only through `handleHold` (the verb a human's `act.hold` reaches), with an action
the server would accept from a human standing at the same spot; it never writes `PlayerSim.hold`,
`Presence.animId` or `Presence.yaw`. At a station that means only a prop kind that `routines.json` `holds` lists,
with that hold. `holds` is empty in M5a (humans have no station hold before the tasks of M4d), so in M5a an NPC's
only hold is Collect on a clue, a human verb in a public place, and at every station it just stands. Therefore no
NPC ever shows an animation, in a place, that a human could not show there.

| Id | File | Statement |
|---|---|---|
| P1 | `npcRoutine.test.ts` | `Object.keys(routines.holds)` is empty, and every value of `routines.holds` would be a `RoutineHold` keyed by a station kind (the validator's rule 2.3.4 holds on the shipped file). |
| P1b | `npcRoutine.test.ts` | The parity test, `it.skipIf(Object.keys(routines.holds).length === 0)`, so it runs the day a row lands: for every `holds[kind]`, a human standing on a stand tile of the first prop of that kind sends `act.hold {action: holds[kind], targetId: prop.id, on: true}`; it receives no `error` message and its `p.hold` is non-null on the next tick. |
| P2 | `npcRoutine.test.ts` | Static: no `.ts` file under `apps/server/src/sim/npc/` matches `/\.hold\s*=(?!=)/`, `/animId/` or `/\.yaw\s*=(?!=)/` (read with `fs`, comments included). |
| P3 | `npcRoutine.test.ts` | Behaviour: over 600 s of held day with the standard party (all Townsfolk, S1), no NPC's `p.hold` is ever non-null except `{action: 'collect'}` on the id of a clue of its own scene; `brain.holdTries` is 0 at every station visit; no NPC presence shows `animId` 4 on a tick whose `p.hold` was null at the end of both that tick and the one before (the publish runs before `runHolds`, part 1, section 4). |
| P4 | `npcRoutine.test.ts` | Plumbing with a patched row (restored in `finally`): `routines.holds.pump = 'task'`; one NPC, white-box persona `{home: 'tavern_bar', favourites: ['ov.pump']}`, held day: on the visit to `ov.pump`, `holdTries` becomes exactly 1, `p.hold` stays null for the whole visit (`handleHold` refuses `task` in M5a) and its `animId` stays 0 on every tick of the visit. |

---

### 3. Presence and animation (`apps/server/test/presence.test.ts`, new)

| Id | Statement |
|---|---|
| A1 | **Interact while holding (human).** A human stands on a footprint clue (white-box spawn) and sends `act.hold {action: 'collect', targetId, on: true}`; from the tick after the hold is accepted until the tick it completes (`castS * 20` ticks later), its presence `animId` is 4 (`AnimId.interact`) on every tick; on the tick after completion it is 0. |
| A2 | **A hold ends on a step.** With A1's hold running, one `input.move` east: the next published `animId` is 1 and `p.hold` is null. |
| A3 | **No walking in place.** A seat on a floor tile whose east neighbour is a wall, driven east for 40 ticks: `animId` is 1 on at most the first 3 ticks (while it closes the gap to the wall) and 0 on every later tick, during which its position never changes; the same seat driven along 40 ticks of open floor shows 1 on every tick. |
| A4 | **Interact while holding (NPC).** White-box `p.hold = {action: 'collect', targetId, startTick: tick}` on a standing NPC with that clue in reach: its `animId` is 4 from the next step's publish and stays 4 on every tick until the hold completes. |
| A5 | `AnimId.interact === 4` on the server; `apps/client/src/view/animIds.test.ts` (pre-seed, landed) asserts the client mirror equals `{ idle: 0, walk: 1, swing: 2, die: 3, interact: 4 }`. |

---

### 4. Routines (`apps/server/test/npcRoutine.test.ts`, new; standard party, S1, all Townsfolk unless noted)

| Id | Case | Statement and threshold |
|---|---|---|
| R1 | **Stillness** | Day held 300 s (6,000 ticks): for every NPC, every window of 400 consecutive ticks with no exempt tick contains a still run of at least `idleS.min * 20` (40) ticks. |
| R2 | **Moving share of a day** | Same run: for every NPC, moving ticks / non-exempt ticks is at least 0.10 and at most 0.60. |
| R3 | **Walking cap** | Same run: no NPC moves on more than `maxWalkS * 20 + 10` (250) non-exempt ticks since the end of its last still run of 40 ticks. |
| R4 | **Scene dwell** | Day held 600 s (12,000 ticks): every NPC scene change happens at least `sceneDwellS.min * 20` (600) ticks after its previous scene entry (the grace placement counts as an entry), and at least 6 of the 9 NPCs change scene at least once. |
| R5 | **Station visits** | Same run: a work visit runs from the first tick `brain.act.kind === 'work'` with the NPC on its stand tile to the tick the act changes. Every visit lasts [`stationDwellS.min * 20 - 1`, `stationDwellS.max * 20 + 1`] = [239, 601] ticks; the NPC stands on a floor tile orthogonally next to the station prop's tile; the prop's kind is in an activity whose `phases` include `day`; no two NPCs are in a visit at the same station on the same tick; every NPC completes at least 2 visits. |
| R6 | **Facing** | Same run: at the first tick of every visit the NPC's `yaw` points at the station: the angle between `(sin yaw, -cos yaw)` and the vector from the NPC to the prop tile's centre is at most 45 degrees plus 1e-6; the `yaw` never changes during the visit. |
| R7 | **Persona** | At the role card (tick after Start): every NPC has a persona; its `home` is an interior for which `isLitAtNight` is true, open at the large profile, and the 9 homes are pairwise distinct (Hollowmere has 10 such interiors at large, `apoth_loft` being dark); `favourites` holds exactly `favouriteStations` (3) prop ids, each a station present at large, in 3 distinct scenes. |
| R8 | **Lit at night** | Pure, on fixture scenes: an interior with no dark marker is lit; an interior with `dark: true` and one with `biome: 'cave'` are not; an exterior with a `lanternPost` prop is lit; an exterior with a `lights` entry without `phases` or with `night` in them is lit; one whose only light has `phases: ['day']` is not; an exterior with `biome: 'forest'` and a night light is not. On the pre-seeded content (`biome` and `dark` on every scene, `world.md` section 7): lit = overworld, tavern_bar, tavern_back, apoth_shop, widow_parlour, widow_bedroom, bakery, manor_hall, manor_upper, barn, chapel; unlit = apoth_loft, forest, cave_entry, cellar. |
| R9 | **Night** | Three NPCs white-box placed on forest floor tiles at least 20 tiles from `fo.gate`, then dusk held 10 s and night held 100 s: each NPC's `leaveAtTick` lies in dusk start + [`night.leaveDelayS.min * 20`, `night.leaveDelayS.max * 20`] = [0, 300], it crosses no portal and its `mode` is never `home` before that tick, and the three `leaveAtTick` values are not all equal; each is in a lit scene within `(night.leaveDelayS.max + 45) * 20` (1,200) ticks of dusk start; on its walk out of the forest (`mode === 'home'`) it never moves on more than `maxWalkS * 20 + 10` (250) ticks since the end of its last still run of `idleS.min * 20` (40) ticks (the usual pauses); from the tick each reaches a lit scene to the night's end, no NPC is ever in a scene `isLitAtNight` rejects; every station visit in the night class is at a kind whose activity `phases` include `night`. |
| R10 | **Night is calmer** | After R1's day, dusk held 10 s then night held 100 s, twice: over non-exempt night-class ticks, the mean moving share of the 9 NPCs is at most 0.45. |
| R11 | **Startle and report** | An unreported body (white-box `spawnBody`) 3 tiles from an NPC in its scene by day: from the first tick the NPC has it in sight, its position is unchanged for at least `startleS.min * 20` (10) ticks and it starts moving toward the body within `startleS.max * 20 + 2` (32) ticks; it reports `reportDelayS` after it first stands in report reach (the existing tolerance). The same with `setRole(killer)` and a body it did not make: every statement above holds unchanged (it freezes, walks to the body and reports it). With `setRole(killer)` and the body of its own strike (white-box: the body's killer set to the NPC and the body in its `seenBodies`, as at a strike): its `startleUntilTick` stays -1, its `mode` stays `routine` and it never reports that body. |
| R12 | **Placement idle** | A meeting opened by the bell (white-box `meetingRequests`) and run with `advance` to immunity: no NPC moves before `afterPlacementIdleS.min * 20 - 1` (59) ticks after the immunity placement; every NPC's `mode` is `routine` and its `act` is set by `afterPlacementIdleS.max * 20 + 2` (162) ticks after it; `sceneEnteredTick` equals the placement tick plus at most 1. The same holds at the grace placement, reached with `advance` from the role card (`standardParty(..., true)`, then the card's end), not with `toWorld`. |
| R13 | **Clues** | `npc.react.collectChance` patched to 1: a footprint clue spawned 3 tiles from an NPC in its scene by day, the NPC white-box set to an idle that ends on the next tick (so its next choice comes at once): within 100 ticks the NPC's `p.hold` is `{action: 'collect', targetId: <the clue>}`, its `animId` is 4 on every tick its hold is set, and once the hold ends the clue's `collectors` contains the NPC and its `priv.notebook` has one entry with that clue's kind. Patched to 0: over 60 s, no NPC ever holds anything. During immunity (patched to 1, a clue in sight) no NPC sends a hold. An NPC whose pending clue is in a scene it has left drops it (white-box: move it through a portal before its choice; no hold follows). |
| R14 | **Stuck goals** | `movement.walkTilesPerS` patched to 0 (restored in `finally`): an NPC whose `act` is a travel toward a station drops it within `stuckS * 20 + 2` (42) ticks: its `act` changes, `lastStationId` is that station, and its next work pick is a different station. A goal tile with no path (white-box: a solid tile inside a building block) is dropped on the tick it is set. |
| R15 | **Killer hunt** | Night held, a Killer NPC in tavern_bar with its scene dwell run (white-box `sceneDwellUntilTick = tick`), the human alone in apoth_shop and every other seat in the overworld: its next work pick is a station in apoth_shop. |
| R16 | **Fallback** | `debug.npc {routine: false}` then 30 s of held day: every NPC's `mode` is `fallback` and at least 2 NPCs have a moving share above 0.60 (the M3c wander); `debug.npc {routine: true}` returns every `mode` to `routine` within 2 ticks. |
| R17 | **Streams** | `MatchSeeds.get` and the `deal` stream wrapped with draw counters before `toWorld`: after R4's 600 s of routines the `deal` counter is unchanged (no NPC draw touches the deal), and every stream NPC code asks for is `npcNames`, or `npcPlay` or `npcTiming` keyed with the asking NPC's own seat id (never unkeyed, never another seat's). |
| R18 | **Card-blind draws** | Two runs with S1 and the fixed seat ids, the human in tavern_bar with NPC `s1npc0001` and every other seat in the overworld, night held 60 s, that NPC's scene dwell held (white-box `sceneDwellUntilTick = tick + 12_000`): in one run it is white-box Killer with `cooldownEndTick.kill = tick + 12_000` (it never strikes), in the other Townsfolk. Its draws from `npcPlay:s1npc0001` and from `npcTiming:s1npc0001` are equal in number in both runs, at least one per tick (the strike roll), and its position is the same on every tick. |

---

### 5. Brain and meetings (`apps/server/test/npcBrain.test.ts`, updated)

The pre-seed's interim vote-window test is in place (part 1, section 5); M1 replaces it.

| Id | Case | Statement and threshold |
|---|---|---|
| M1 | **Vote window** (replaces "votes inside npc.vote.delayMinS..delayMaxS") | Standard party, all Townsfolk, `meeting.noEjectionStreak` patched to 1000 (so Skip stays allowed and nobody is ejected), 10 meetings opened by the bell and run to immunity with `advance`. Let `open` be the tick the discussion began and `W = (phaseEndsTick - open) + phases.voteS * 20` read at `open`. Every NPC's `hasVoted` turns true at a tick `t` with `floor(0.3 W) - 1 <= t - open <= ceil(0.9 W) + 1`; over the 90 votes the smallest `(t - open) / W` is at most 0.40 and the largest at least 0.80; no NPC votes within 240 ticks (12 s) of `open`. |
| M2 | **Skip disabled** | A meeting with Skip disabled (white-box: the forced-vote state of 3.8 reached): every NPC with an empty suspicion memory votes a living seat other than itself, never Skip; a Killer NPC with no other vote cast does the same; every NPC's `hasVoted` turns true (no vote of theirs is refused). |
| M3 | **Knife phases** | The existing lone-human scenario with `killChancePer10s` patched to 1: during 60 s of held day the Killer NPC never strikes; at held dusk it strikes within 40 ticks of the phase start; at held Final Night the same. Once 5F lands, the strike payload's `targetId` is the prey's `priv.avatar`, not its seat id. |
| M4 | **Flee to the hub** | After its kill the Killer NPC reaches a scene with a basin and then the map's hub (`overworld` for Hollowmere), its `mode` is `react` throughout, and it returns to `routine` on arrival. |
| M5 | **Report** | The existing "reports a body in reach after reportDelayS", unchanged; "never reports when it holds the Knife" becomes "never reports a body it made": a Killer NPC beside the body of its own strike never reports it, and beside a body it did not make reports it after `reportDelayS` (R11). |
| M6 | **Confession vote** | A meeting with an NPC Vicar whose Notebook holds a white-box `confession` entry on a living seat with `value` the Cabal team's index, Skip allowed, its `suspicion` pointing at another seat and `suspectVoteChance` patched to 1: it votes for the confessed seat. With the confessed seat dead, it votes as without the entry. `npcVoteTarget(room, vicar)` returns the confessed seat (5G's NPC Last Shot aims there). |
| M7 | **Card-blind meeting draws** | One bell meeting run twice with S1 and the fixed seat ids, NPC `s1npc0001` white-box Killer in one run and Townsfolk in the other: its draws from `npcPlay:s1npc0001` and `npcTiming:s1npc0001` between the discussion's first tick and the vote's end are equal in number, and its vote tick is the same. |

---

### 6. Ready delays (`apps/server/test/npc.test.ts`, updated)

The pre-seed already reads the role-card bounds from `npc.ready.delayS` (part 1, section 5); D1 to D4 replace them.

| Id | Case | Statement and threshold |
|---|---|---|
| D1 | **Role card** | Standard party (S1), Start: each NPC's card-ready tick (the tick `markCardReady` is called for it, spied; before 5F lands, the tick its `ready` turns true) minus the card's opening tick lies in [`ready.delayS.min * 20 - 1`, `ready.delayS.max * 20 + 1`] = [39, 181]; the 9 ticks span at least 20 ticks (max minus min); the card still ends at its timer with the AFK human. Once 5F lands, no seat's public `ready` turns true during the card (5F's P7). |
| D2 | **Lobby return** | After a match reaches the lobby (white-box `resetToLobby`): on the reset tick every NPC seat's `ready` is false, and a client's first patch after the reset shows them all not ready; each turns true at [39, 181] ticks after the reset tick; the 9 ticks span at least 20 ticks; the human's `ready` stays false. |
| D3 | **Add NPC** | `lobby.addNpc` in the lobby: the new seat arrives in the client's state with `ready` false; it turns true [39, 181] ticks after the tick it was seated; an NPC removed with `lobby.removeNpc` before its delay leaves no pending ready (no error, no throw, the count is right). |
| D4 | **Reset keeps the seats** (updates "survives resetToLobby") | Seats, ids, `npcSeats`, the difficulty and the mark survive the reset as today; `ready` is false on the reset tick (D2) instead of true. |

---

### 7. No NPC tell in a recorded match (`apps/server/test/npcTells.test.ts`, new)

**E1.** Standard party (not all Townsfolk: the real deal of 10, so a Killer, the night powers and bodies happen),
main mode, Normal, Hollowmere, seeds S1 (S2-S4 under `WDI_SLOW=1`): `recordMatch(party, {maxTicks: 45_000,
lobbyExtraS: 12})` from Start through game over to 12 s after the return to the lobby; the test fails if
`maxTicks` is reached (the Final Night always ends a match well before). `findTells(rec)` must be empty, where
`findTells` checks, on NPC seats that are living, placed and not in transit:

| Code | Tell | Flagged when |
|---|---|---|
| T1 | Walking in place | a seat shows `animId` 1 on 3 consecutive ticks with an unchanged position |
| T2 | Never still | in a day-class phase, a window of 400 consecutive non-exempt ticks holds no still run of 40 ticks |
| T3 | Always moving, or frozen | over a day-class stretch with at least 1,000 non-exempt ticks, the moving share is above 0.60 or below 0.10 |
| T4 | Animation without a hold | any seat, human included, shows `animId` 4 on a tick whose `hold` was null at the end of both that tick and the one before, or 0 or 1 on a tick whose `hold` was set at the end of both (the publish runs before `runCommands`, so a start or an end shows one tick late; part 1, section 4) |
| T5 | A hold a human could not make there | an NPC's `hold` is anything but a Collect on a clue of its own scene |
| T6 | Leaving too soon | an NPC changes scene, with `mode` `routine` on the tick before, fewer than 600 ticks after its previous scene entry or placement |
| T7 | Out in the dark | in the night class, a living NPC whose `mode` is not `react` stays in one scene `isLitAtNight` rejects for more than `(night.leaveDelayS.max + 45) * 20` (1,200) ticks, counted from the later of the night class's start and its entry into that scene |
| T8 | Voting on a clock | an NPC vote tick outside [`floor(0.3 W) - 1`, `ceil(0.9 W) + 1`] of its discussion's start (W as in M1) |
| T9 | Ready on a clock | an NPC card-ready tick outside card open + [39, 181]; at the lobby return, an NPC ready on the reset tick or outside reset + [39, 181] |
| T10 | Moving in step | after the grace placement or an immunity placement, an NPC moves within 59 ticks of it, or (with 3 or more NPCs placed) the NPCs' first-move ticks span fewer than 20 ticks |
| T11 | Ignoring a body | in a world phase, an NPC whose `mode` is `routine` or `home` has an open body it did not make (`by` is not its seat) inside its vision radius on 40 consecutive ticks and at the end of them is neither nearer to it than at the start nor within report reach |
| T12 | Leaving the dark together | of the NPCs that stand still on the first tick of a dusk or a Final Night hunt in a scene `isLitAtNight` rejects, 3 or more start to move within 40 ticks of each other (each one's first moving tick after that tick) |

**E2. The detector catches the old brain.** The same match recorded with `debug.npc {routine: false}` sent
before Start (the M3c wander everywhere): `findTells` reports T2 or T3 for at least 3 of the 9 NPCs (with the walk-in-place fix a wall push already reads as still, so not every wandering seat trips).

**E3. The detector, pure.** On synthetic recordings (no room): an NPC whose vote comes 100 ticks after its
discussion opened yields T8; every NPC ready on the reset tick yields T9; a seat that walks in place for 3 ticks
yields T1; a seat with `animId` 4 and no hold yields T4; an NPC that crosses a portal 300 ticks after entering
yields T6; an NPC that stands 40 ticks with an open body it did not make 3 tiles away yields T11, and the same
with a body it made yields nothing; three NPCs still in the forest at dusk that first move 10 ticks apart yield
T12; a clean synthetic day yields nothing.

The wire-level checks stay as they are and must still pass: `npc.test.ts` "the wire never marks an NPC seat" (same
key sets and field types for a 1 + 3 room and a 4-human room, no `isNpc`, `npc_` or pool marker in the encoded
state), and 5F's avatar fuzz.

---

### 8. Content (`packages/content/test/routines.test.ts`, landed in the pre-seed)

The pre-seed landed C1 to C3 below, plus a weights-against-phase-classes check and a schema-rejects case
(part 1, 2.4); 5H keeps them green and adds to the file.

| Id | Statement |
|---|---|
| C1 | The shipped `routines.json` parses and `validateContent` returns no error mentioning `routines.json` or `npc.`. |
| C2 | One broken copy per validator rule of part 1, 2.3 fails with that rule's exact message: a world phase in no class and one in both (rule 1); a kind in two activities and one in an activity and `ignore` (rule 2); a scene prop of an unclassified kind (rule 3); a `holds` key that is not a station kind and an unknown `lightKinds` entry (rule 4); a station prop with no floor tile next to it (rule 5); a span with `min > max` and a weights row summing to 0.9 (rule 6). |
| C3 | Every prop kind of today's 15 scenes is classified exactly as part 1, section 1's table says. |

---

### 9. Kept gates and what is not 5H's

- **`npcSlow.test.ts` (`WDI_SLOW=1`), unchanged statements that must still pass with routines:** with 1 client and
  9 NPCs the tick p95 stays under 15 ms over 30 s of day; an NPC Killer on Normal wins at least 1 of 5 matches.
- **5G's NPC night-power tests** hold these thresholds (listed here so the NPC timings live in one place): every
  NPC night-power use tick lies in dusk start + [`floor(0.1 * (duskS + nightS) * 20) - 1`,
  `ceil(0.8 * (duskS + nightS) * 20) + 1`] = [219, 1761] of the 2,200 ticks of dusk and night (the Final Night:
  hunt start + [`floor(0.1 * huntS * 20) - 1`, `ceil(0.8 * huntS * 20) + 1`] = [179, 1441] of its 1,800 ticks),
  and equals the NPC's `brain.nightPowerAtTick` drawn at that dusk or hunt start; an NPC Last Shot comes
  [`lastShotS.min * 20 - 1`, `lastShotS.max * 20 + 1`] = [39, 161] ticks after its aim starts, at the tick
  `brain.lastShotAtTick` holds, and aims at `npcVoteTarget` (a Cabal confession first, GDD 3.12).
- **Not 5H's** (bugs.md items the ONUB rebuild owns): the two-pick act walking to the midpoint (retired with the
  plates), the real NPC seat through quick mode (5E's `onubNpc.test.ts`), the quick-mode NPC vote spread
  (`onubBalance.npc.voteFrac`, 5E), the bot's own-presence leak (5E).
- **Gates for the PR:** `pnpm lint && pnpm typecheck && pnpm test`; a 2-minute main-mode soak
  (`pnpm bots:soak -- --minutes 2`) with no presence leak and at least one meeting; `WDI_E2E_NPC=1` main-mode case
  against the merged 5F branch.
