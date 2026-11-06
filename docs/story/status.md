# Story mode: status

Each session appends to its own section only. Newest line last.

## S1. Story content

## S2. Story engine

## S3. Wire and client

- 2026-11-06: read the contract; branch `claude/story-s3-protocol-cards`. Protocol messages `story.start`, `story.continue`, `story.card`, `story.goals` added with `PROTOCOL.md` regenerated; story layer, chapter list, goals strip, mock server path (`?mock=1`), UI.md 14.54, DECISIONS A420, unit tests and `e2e/screens-story.spec.ts` at 390x844 and 1280x720 (screens written to the spec output). Contract additions: optional `chapterId` on `story.start` (replay); the end card's summary rows are the counter keys spelled out. Needs from others: S2 handles `story.start`/`story.continue` in `PartyRoom` and sends `story.card`/`story.goals` to the player's own client only; S1's `story.json` is read by `ui/story/catalog.ts` once it merges (the real title screen has no Story entry until then).

## S4. Tests and the bot
