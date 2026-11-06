# Story mode: status

Each session appends to its own section only. Newest line last.

## S1. Story content

- 2026-11-06 S1: schema `story.ts`, `validateStory.ts`, wired into `validate.ts`, tests and a one-chapter `story.json` (Baker) ready; seams addendum 1a in README. Chapters 2 and 3 and `script.md` next.
- 2026-11-06 S1: PR #450 now holds the schema, all three chapters and docs/story/script.md (the S4 fixture test needs three chapters); local checks green; merging on green CI.
- 2026-11-06 S1: PR #450 MERGED into the integration branch (schema, validator, all three chapters, script.md). Merged on the green run of the previous head plus a clean merge of S4's suites; local content and story tests green on the final head. Open for the owner: Q-S1 (Killer chapter, default no) and the Thief-as-Bandit mapping (DECISIONS A401). S2 owes `story.enter` / `story.pickup` events (README 1a).

## S2. Story engine

- 2026-11-06 S2 started. `enableStory`, fixed seeds and NPC ids, chapter-one fixed deal, title-card pause, `story.continue` as a queued command and the `storyOneHuman` invariant are written on `claude/story-s2-enable-story` (draft PR to follow once the suite is green). Seat handover and the beat runner come next; the runner waits for S1's schema, so it is coded against the README section 1 shapes (`sim/story/types.ts`).
- 2026-11-06 S2 PR #452 merged: `enableStory` (one human seat, fixed seeds and NPC ids, chapter-one fixed deal, title-card pause, `story.continue` queued and consumed in `step()`), invariant `storyOneHuman`, GDD 3.34.
- 2026-11-06 S2 PR #456 open (draft): beat runner, seat handover, chapter flow, `storyBeatsOnce`; S4's handover, death, full-story, replay and leak suites pass against it. Open gaps: `story.enter` / `story.pickup` events, item `spawn`, NPC `goTo` across scenes unverified, `cutscene`/`questStep` only emit bus events, end-card counters approximated.


## S3. Wire and client

## S4. Tests and the bot

## Session ids (2026-11-06, from 6Z's spawn)

| Session | Id |
|---|---|
| S1 content | `session_01M5mAcYksWgzPsPm5YnLFiq` |
| S2 engine | `session_01M5mAcXF8pDpNfm2RgZDdpP` |
| S3 wire and client | `session_01M5mAcVBQXcEMEdJztvpJ1j` |
| S4 tests | `session_01M5mAcVY2kkDKs5HnxDqZRT` |
| Orchestrator (this contract's author, not watching) | `session_01M5mAcY1JPqjhPmoZ8CZDFp` |
- 2026-11-06 S4 started. Fixture (`apps/server/test/story/fixture.ts`) and `docs/story/test-plan.md` written against README 1 to 3; PR open as claude/story-s4-fixture. The fixture reads `enableStory` off `sim/auto/Auto.ts` by name and `story.json` off disk, so it compiles and the story suites skip until S1 and S2 merge. `WDI_STORY_REQUIRED=1` makes a missing engine a failure.
- 2026-11-06 S4: PR #449 (fixture, test plan) merged. PR for the replay/full-story/death/handover/leak suites and the story bot opened as draft (claude/story-s4-suites); the suites skip until S1 and S2 merge. E2E specs wait on S3's UI.
