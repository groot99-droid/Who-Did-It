# Story mode: test plan (S4)

Owner: S4. The contract is `docs/story/README.md`; this file says what is tested, where, and what each test needs from
the other sessions. It restates no number: every figure is read from `balance.json` or `story.json`.

## The fixture (`apps/server/test/story/fixture.ts`)

Written against README sections 1 to 3 before the engine exists. What it needs from the other sessions, and nothing
else:

| Need | From | How the fixture uses it |
|---|---|---|
| `enableStory(room, storyId)` exported from `sim/auto/Auto.ts` | S2 | Read off the module by name; null until it lands, so the suites skip (they do not fail) before S2 merges |
| `packages/content/data/story.json` in the README 1 shape | S1 | Read from disk, no content API needed; `hollowmere_winter` |
| Bus events `story.beat`, `story.chapterStart`, `story.chapterEnd`, `story.goal` with `data.chapterId` | S2 | `chaptersStarted`, `chaptersEnded` |
| Private messages `story.card`, `story.goals` and the command `story.continue` | S3 (wire), S2 (consumes) | Cards are captured server-side on the player's client; `story.continue` is pushed on the room's command queue and consumed in `step()` |
| One non-NPC seat at all times | S2 | `humanSeat`, `humanSeatCount` |

API: `startStoryRoom` (one human joined, clock off, story enabled, stepped to the first phase), `play` (the scripted
player: a policy per tick, a card answered the tick after it comes up), `playDigest`, `killHuman`, `continueCard`,
`pendingCard`, `humanRole`, `humanSeat`, `StoryDigest`. A room steps only through `advance`, so a run is a function of
the seed words and nothing else.

`WDI_STORY_REQUIRED=1` turns a missing engine or story into a failure; CI sets it once S1 and S2 have merged
(`fixture.test.ts`). Until then the suites print as skipped, never as passed.

## Server suites (`apps/server/test/story/`)

| Test | What it proves | Definition of done |
|---|---|---|
| `replay.test.ts` | Same seed words, same story, tick for tick: two rooms play the story and their digests match; different words differ | 2 |
| `fullStory.test.ts` | A scripted player finishes all chapters in order; each has a title card, an end card and its beats once; the room ends | 4, 1 |
| `death.test.ts` | A player who dies in chapter 1 still reaches chapter 2; the end card says the chapter failed | 4 |
| `handover.test.ts` | At each break: the card is the chapter's `roleId`, one human seat, the old seat is an NPC, the private view resets, only `handOn` crosses; the invariants hold at every break | 1 |
| `leak.test.ts` | Every `story.card` and `story.goals` goes to the player only, names no other seat and no secret key (the per-message check of A168); no public field names a chapter, role or goal | 5 |
| `fixture.test.ts` | The fixture itself, runnable before the engine | |

Time: a chapter plays tens of thousands of ticks; the suites run `advance` synchronously, the long ones under a raised
`testTimeout`. The chapter clocks use the real `balance.json` unless S2's pause makes a card free, and `shortClock`
(`apps/server/test/shortClock.ts`) is used only where a test does not read pacing.

## E2E (`apps/client/e2e/story*.spec.ts`)

Playwright, `--trace off`, at 1280x720 and 390x844: the title screen's "Story" opens the chapter list, starts the story,
shows the title card, advances a card with the continue control, and shows the goals. Needs S3's client and S2's engine
on a live server; written once both are in the integration branch.

## The bot (`tools/bots/`)

`story.ts`: a headless client that joins, sends `story.start`, answers every `story.card` with `story.continue`, and
plays a chapter by its goals. Exit status is the pass/fail of the three chapters; it is the e2e's smoke twin without a
browser. A `pnpm bots:story` script.

## Bugs found in other sessions' paths

Reported with `send_message` and a failing-test reference; recorded in `docs/story/status.md` when the owner's session
is gone. S4 does not fix them.
