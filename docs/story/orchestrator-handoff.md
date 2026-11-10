# Story mode part 2: orchestrator handoff

Written 2026-11-10 by the orchestrator (session `session_01M5mAcY1JPqjhPmoZ8CZDFp`, "Story mode") so any later
session can resume without the chat. It restates no rule or number: those stay in `docs/GDD.md` and
`packages/content/data/balance.json`. Decisions the owner makes belong in `docs/DECISIONS.md`.

## Standing rules from the owner

- Design is approved through questionnaires published as artifacts.
- Merging into the production base `claude/zen-turing-m1jnw0` needs green CI and the owner's explicit say-so.
  Only the round-10 PRs the owner named count as authorised. Merging deploys the base.
- The story branch is `claude/story-part2`. It merges into the base only when the owner asks and CI is green.
- The map and gameplay rebuild comes before more content building (P5 content, P6 other towns).
- Finished sessions are archived automatically (see "Archival routine").

## Open decisions (owner only)

| # | Decision | Where it waits |
|---|---|---|
| 1 | Vicar / Medium rule: reply `go` so P0 pushes `claude/story-p0-w1-medium` and opens a draft PR into `claude/story-part2`; confirm the buff list (conversion aura, Righteous Stride, Divine Judgement) | P0 session `session_01M5mAcXYe29zVwSB7eQSKQ5` |
| 2 | Medium hideout location: Fenwood (`forest_deep`) or a new location (own building, deep woods) | design |
| 3 | Seance power: keep or retire | design |
| 4 | Anti-theme wording (Bandit = detective/police, Activist = post office; each role gets its own building) | design |
| 5 | `story.read` (GDD 3.26): build or drop | design |
| 6 | Witness, pickpocket and smoke: build or not | design |
| 7 | Player accounts plan Q1 to Q14 (Q4 Node >= 22.13, Q12 Google OAuth client) | draft PR #472, session `session_01M5mAcXu65m2U47WM1R6aso` |
| 8 | Asset list questions: camera, roof and interior cutaway, other role buildings, palette, trees, train, characters | asset list artifact |
| 9 | Mark which of the 223 asset items could use Poly Haven models instead of Meshy (offered, no answer) | asset list |
| 10 | Investigate the base's unexplained e2e flakes (world-entry, hud-clock)? | CI |

## The Vicar design that was agreed

The martyr dies. An unkillable NPC Medium gate in the Zealot's hideout (deep woods, its own building,
anti-theme of the Vicar's chapel) resurrects him for free and uninterruptibly. He returns the next day of the
same match, strong enough that he could win that day, with area-spread conversion plus speed and health buffs.
The martyr weight in GDD 3.20 is gated by the same condition. The NPC replaces the dealt Medium card.
Against the Zealot first. The GDD change ships in the same PR as the behaviour.

## Merges that wait for the owner

- PR #471 (UI renumber 14.54 to 14.61): open, unmerged, deploys the base.
- `claude/story-part2` into the base.
- P2's E14 PR: merge when CI is green; then send one summary of what the engine can do for P5 and what is blocked.

## Sessions

| Session | Id | State | Rule |
|---|---|---|---|
| Orchestrator | `session_01M5mAcY1JPqjhPmoZ8CZDFp` | running | never archive |
| P0 design | `session_01M5mAcXYe29zVwSB7eQSKQ5` | blocked on owner | never archive |
| P2 sections engine | `session_01M5mAcVG1b3xhGH76C6nUHz` | review-ready (E14) | keep until merged and summarised |
| Skipped-PR finisher (#437, #438, #435, #440, #441, K6b) | `session_01M5mAcY9qbhZ1CAniTBr7xH` | has not reported; #440 needs a grant request about the Handcuffs store and prices | never archive |
| Accounts plan | `session_01M5mAcXu65m2U47WM1R6aso` | draft docs PR #472 | keep while #472 is open; account PR sessions A2+ spawn after Q1 to Q14 |
| S3 protocol and client cards | `session_01M5mAcVBQXcEMEdJztvpJ1j` | review-ready, status unchecked | check before archiving |

Archived and done: S1, S2, S4, P3, P4, V1b, V2, V3, B6d2, the merge queue. The Farway sessions (tag `farway-now`,
parent `session_01M5mAcXthXUMxUcnHeznJEZ`) are another project: leave them.

## Archival routine

STOPPED on 2026-11-10 at the owner's request (disabled, not deleted; re-enable with `update_trigger enabled=true`).
Scheduled task `trig_01GJNA6wgCRBQ5otxwnCgZaB`, hourly, fires into the orchestrator session. First routine
`trig_01RZfT2Cp4tdespASrPWEx5o` is disabled: it had no connectors, so its sessions lacked the session tools.
Rule: archive a session only if idle, untouched for over an hour, status bucket completed, work merged or
nothing open, and not waiting on anything. Report in one line what was archived; stay silent if none.

## On hold

P5 content and P6 other towns until the map revamp; section 5.4 until B6b to B6d; the final `pnpm auto` at 50.

## Art

- 223-item asset list for Meshy (published artifact): https://claude.ai/artifact/YNbWzdECDePjFZua2BeEKd
  (the artifact is the durable copy).
- Poly Haven: `tools/blender/materials/polyhaven.lock.json` pins 49 textures and 1 HDRI, no 3D models. It covers
  surfaces, not objects. Poly Haven models may stand in for props (`docs/round8/art.md` 5), each credited in
  `CREDITS.md`.

## Resuming

Read this file, `docs/story/status.md`, `docs/story/part2.md` and `docs/SESSIONS.md`, then list sessions
(`list_sessions`, mine) before acting.
