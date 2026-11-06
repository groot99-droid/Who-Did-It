# Story mode: status

Each session appends to its own section only. Newest line last.

## S1. Story content

## S2. Story engine

## S3. Wire and client

- 2026-11-06: read the contract; branch `claude/story-s3-protocol-cards`. Protocol messages `story.start`, `story.continue`, `story.card`, `story.goals` added with `PROTOCOL.md` regenerated; story layer, chapter list, goals strip, mock server path (`?mock=1`), UI.md 14.54, DECISIONS A420, unit tests and `e2e/screens-story.spec.ts` at 390x844 and 1280x720 (screens written to the spec output). Contract additions: optional `chapterId` on `story.start` (replay); the end card's summary rows are the counter keys spelled out. Needs from others: S2 handles `story.start`/`story.continue` in `PartyRoom` and sends `story.card`/`story.goals` to the player's own client only; S1's `story.json` is read by `ui/story/catalog.ts` once it merges (the real title screen has no Story entry until then).

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
