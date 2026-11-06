# Story mode: the build contract

Written 2026-11-06 for four parallel Sonnet sessions (S1 to S4) that run unattended for about eight hours. It builds
round 10's **E2, story mode** (`docs/round9/round10-plan.md` 4, "Session 10E"; `docs/round9/world-mode.md` 9;
`docs/round9/phases.md` 8; owner answer WM1B in `docs/round9/owner-answers.md`). 10E was never spawned (see
`docs/round10/part2.md`), so this folder is its contract. Read those sources first. `CLAUDE.md` and `docs/SESSIONS.md`
still rule; where this file narrows them, this file is for story mode only.

## What story mode is

**One human, every other seat an NPC, one fixed story on HollowMere in three chapters.** The player plays a different
role in each chapter (owner, WM1B: "completing multiple roles thematically through a single game including the
killer"). The story is one match on the auto-mode harness (`sim/auto/Auto.ts`, GDD 3.19), seeded with fixed seed words
so it replays the same way ("all fixed actions"). **Beats**, each a trigger on the sim event bus and an action, drive it.
At a chapter break the player's seat moves to a new role and the old seat goes back to the NPC brain.

Scope (the owner's answer, `world-mode.md` 9): the Baker's day, then the Watchman's night, then the Bandit's heist, with
the Fence road as the turn. The Killer appears as the NPC Killer whose crime the chapters cut across; if the Bandit
card is missing from `roles.json` today, S1 maps "Bandit" to the closest card (`thief`) and records it in
`DECISIONS.md`. Open question Q-S1 asks the owner whether a Killer chapter is added; the data format must allow a
fourth chapter without code changes.

Not in scope: Port-au-Levain and BlackPine stories, achievements (E1; a chapter end emits a `story.chapterEnd` sim
event that E1 can read later), voice acting, new art beyond what exists, any change to multiplayer rules.

## Decisions taken for the owner's absence

Each is a default; the owner can overrule it later and nothing below is built so it cannot be changed.

| # | Decision | Default |
|---|---|---|
| Q-S1 | A Killer chapter | Three chapters as scoped. The `story.json` schema supports N chapters |
| Q-S2 | Pausing at a card | The world does **not** pause (rolecards Q-D2: "no pause, in every mode"). A chapter card pauses the clock only in story mode, through the harness pause (`Auto.ts` `applyClock`), because there is no second human to wrong |
| Q-S3 | Save and resume | None. A story is one sitting (about 25 minutes); leaving ends it |
| Q-S4 | Menu | "Story" on the title screen opens the chapter list; chapters are played in order; replay of a finished chapter is allowed |
| Q-S5 | Secrecy | The role-secrecy rules of `CLAUDE.md` hold. Story mode has no second player, but the wire and the private view are built the same way, so nothing story-only leaks into a public field |

## Seams: the interfaces the four sessions share

S1 owns the data and schema, S2 the engine, S3 the wire and client, S4 the tests. These shapes are fixed now so
nobody blocks anybody. A change to one goes through the owner of that section, by `send_message`, and then into this
file in the same PR.

### 1. `packages/content/data/story.json` (S1 writes; S2 and S3 read through `@wdi/content`)

```ts
interface StoryFile { stories: Record<string, Story> }
interface Story {
  id: string;                 // "hollowmere_winter"
  title: string; blurb: string;
  mapId: string;              // "hollowmere"
  roster: { humanSeat: 0; npcCount: number };   // one human; the rest NPCs
  seedWords: Record<string, [number, number]>;  // every stream of AUTO_STREAMS, so the run replays
  chapters: Chapter[];        // in play order
}
interface Chapter {
  id: string;                 // "ch1_baker": frozen once shipped (ids are append-only)
  title: string; setup: string;                 // chapter title card copy
  roleId: string;             // a key of roles.json; the player's card for this chapter
  look?: string;              // optional look override; default is the card's look
  startPhase: { cycle: number; part: 'day' | 'night' };
  goals: ChapterGoal[];       // shown on the Beat card; each has a completion trigger
  beats: Beat[];
  end: { trigger: Trigger; summaryKeys: string[] };   // summaryKeys name counters the end card shows
  handOn?: HandOn[];          // the only things that cross a role switch: a letter, a lead, an item
}
interface Beat {
  id: string;                 // unique within the chapter
  trigger: Trigger;           // fires once, in order of the bus
  action: Action;
  oncePerChapter: true;
}
type Trigger =                // a SimEvent pattern on sim/events/bus.ts
  | { event: string; seat?: 'player' | string; data?: Record<string, unknown> }
  | { tick: number }          // chapter-relative, in sim ticks
  | { all: Trigger[] } | { any: Trigger[] };
type Action =
  | { card: 'beat'; line: string; speaker?: string; portrait?: string; goal?: string }
  | { cutscene: string }                       // an id of cutscenes.json
  | { questStep: { quest: string; step: string } }
  | { npcOrder: { npcId: string; order: string; args?: Record<string, unknown> } }
  | { spawn: { kind: string; at: string } }    // a clue id, an item or a prop at a frozen scene id
  | { seq: Action[] };
```

Ids of scenes, portals, spawns and clues are frozen (`CLAUDE.md`); `story.json` only references them. The zod schema is
`packages/content/src/schemas/story.ts` with `validateStory.ts` beside the other validators, wired into `validate.ts`.
It checks: every `roleId`, `cutscene`, quest, clue and scene id exists; chapters are in order; no beat id repeats; every
`all`/`any` is non-empty; the seed words cover every stream in `AUTO_STREAMS`.

### 2. The engine (S2 owns `apps/server/src/sim/story/*`)

- `enableStory(room, storyId)` beside `enableAuto`: one human seat (`Auto.ts:152` says an auto room has none today, so
  this is the new part), the rest NPCs, `npcPrey` on, 1x speed, fixed seed words from the story.
- **Seat handover.** A seat is a controller (`'human' | 'npc'`) plus a card. `switchRole(room, chapter)` hands the old
  seat to the NPC brain from where the player left it, deals the chapter's card to the seat that fits it (an NPC seat
  holding that card swaps controllers with the player's), clears the player's private view, then applies `handOn`. The
  player's avatar handle stays; seats are by seat id on the bus (DECISIONS A84).
- **The beat runner** is one Step stage after `runEvents`. It subscribes to the bus (`onSim`), evaluates each active
  chapter's triggers, runs each action once, and emits `story.beat`, `story.chapterStart`, `story.chapterEnd`,
  `story.goal`. Nothing mutates state in a message callback (`CLAUDE.md`): the player's "continue" on a card is a queued
  command consumed in `step()`.
- **A story ends** when the last chapter ends (game over for the room) or the player's seat dies for good with no
  chapter left to switch to. A player death inside a chapter: the chapter ends as failed, the end card says so, and the
  next chapter still starts (so a story is always finishable).
- Invariants (`sim/auto/invariants.ts`) run unchanged. S2 adds two: exactly one human seat at all times, and a
  chapter's beats fire in trigger order, once each.
- GDD: S2 adds section 3.34, "Story mode", in the same PR as the behaviour (`CLAUDE.md`), and no number in it; numbers
  go in `balance.json` under `story.*`.

### 3. The wire and the client (S3 owns the protocol additions, `apps/client/src/ui/story/*`, the title-screen entry)

Protocol messages (append-only in `packages/shared/src/protocol/index.ts`; each documented in `docs/PROTOCOL.md`):

| Message | Direction | Payload |
|---|---|---|
| `story.start` | client to server | `{ storyId }`, from the title screen |
| `story.continue` | client to server | `{}`, closes the card that is up |
| `story.card` | server to that client | `{ kind: 'title' \| 'beat' \| 'end'; chapterId; title?; lines: string[]; portrait?; goal?; summary?: Record<string, number>; next?: string }` |
| `story.goals` | server to that client | `{ chapterId; goals: { id; text; done }[] }` |

`story.card` and `story.goals` go to the player's own client only, never in public state, so the private-message leak
test (the per-message check of DECISIONS A168) covers them. The client draws a card as a full-screen phase screen in the
style of `docs/UI.md` and the existing phase screens; it adds copy only through the content file, never inline. A phone
at 390 px wide must work (the e2e viewport).

### 4. The tests (S4 owns `apps/server/test/story/*`, `apps/client/e2e/story*.spec.ts`, `tools/` bot additions)

See S4's brief. S4 writes the shared test fixture `apps/server/test/story/fixture.ts` first (a story room, a scripted
"player" that answers cards and plays a chapter), because S2 and S3 will use it.

## Sessions

All four are Sonnet, compact at 500k (the default in `.claude/settings.json`). Each reads this file, `CLAUDE.md`,
`docs/SESSIONS.md` (the Round 10 section and the paths it names), `docs/round10/seams.md`, the sources named at the top
of this file, and the code its section names, before the first edit.

| Session | Owns (and only these paths) | First PR | Depends on |
|---|---|---|---|
| **S1. Story content** | `packages/content/data/story.json`, `packages/content/src/schemas/story.ts`, `validateStory.ts`, its tests, `docs/story/script.md`, `balance.json` `story.*` keys (additions only) | The schema and a one-chapter `story.json` that validates (an hour in) | none |
| **S2. Story engine** | `apps/server/src/sim/story/*`, the `enableStory` hook in `sim/auto/Auto.ts`, the `Step.ts` stage, `PartyRoom` wiring, `GDD.md` 3.34, `docs/ARCHITECTURE.md` story paragraph | `enableStory` with one human seat and fixed seeds, no chapters yet | S1's schema for the runner |
| **S3. Wire and client** | `packages/shared/src/protocol/*` story additions, `docs/PROTOCOL.md`, `apps/client/src/ui/story/*`, the title-screen entry, `apps/client/src/scenes/` story wiring, `docs/UI.md` story section | The protocol messages with a mock server path, so the cards render before the engine lands | S1's `Chapter` copy shape |
| **S4. Tests and the bot** | `apps/server/test/story/*`, `apps/client/e2e/story*.spec.ts`, `tools/` story bot, `docs/story/test-plan.md` | The fixture and the replay test written against the section 1 and 2 shapes | S2 to run green |

Order: S1 and S3 start at once; S2 starts at once on the harness change and the seat handover (neither needs
`story.json`) and takes the beat runner as soon as S1's schema merges; S4 starts with the fixture and test plan, then
fills tests in as S2's and S3's PRs merge. Any session that is blocked works on the next unblocked item or on reading
and tightening its tests; it never edits another session's paths. A contract request to another owner goes in the PR
description and in a `send_message` to that session.

## How the work lands

- **Integration branch: `claude/elegant-archimedes-ybxzlj`.** It carries this file. Each session cuts its PR branches
  from it as `claude/story-<session>-<slug>` (for example `claude/story-s2-seat-handover`) and opens **draft PRs against
  it**, not against `claude/zen-turing-m1jnw0`. Nobody pushes to the base: Railway deploys every push to the base, and
  nobody is here to watch a deploy. The owner merges the integration branch into the base after review.
- Each PR is under 400 lines where it can be, has tests for every rules change, and runs `pnpm lint && pnpm typecheck
  && pnpm test` clean before every push. `pnpm auto` at 50 matches must stay green once S2's first PR is in.
- **Merging.** There is no orchestrator awake. A session merges its own PR into the integration branch when CI is green
  and its tests pass, after merging the integration branch into its own first. It never force-pushes, never skips or
  quarantines a test, and never merges a PR that touches another session's paths. If a PR depends on an unmerged PR of
  another session, it waits and works on something else.
- **Conflicts.** `docs/DECISIONS.md` rows are the usual conflict: S1 takes A401 to A409, S2 A410 to A419, S3 A420 to
  A429, S4 A430 to A439 (check the file's last row first and renumber if it has moved; keep both sides on a merge).
- **The status file.** Each session appends dated lines to `docs/story/status.md` (one section per session, only its
  own) at each PR open, merge and block. This is what the owner reads first when they return.
- **Stop rule.** When its section is done and merged, a session reads what the others merged, fixes what it finds in
  its own paths, and stops. It does not start new scope. At about seven hours of wall time all four finish what they
  have, push, and write a final handoff in `docs/story/status.md`.

## Definition of done

1. The title screen's "Story" starts `hollowmere_winter`; the three chapters play through with a title card, beats, and
   an end card each; the seat moves from Baker to Watchman to Bandit and the private view resets at each break.
2. The same seed words give the same story tick for tick (a replay test).
3. `pnpm lint && pnpm typecheck && pnpm test` clean, `pnpm auto` at 50 clean, the story e2e green at 1280x720 and
   390x844.
4. A scripted player finishes the story, and a scripted player who dies in chapter 1 still reaches chapter 2.
5. The leak test covers the two private story messages; no public field names a chapter, a role or a goal.
6. `GDD.md` 3.34, `PROTOCOL.md`, `UI.md` and `DECISIONS.md` carry the change; every number is in `balance.json`.
7. `docs/story/status.md` lists what is merged, what is open, and any Q-S question the owner must still answer.
