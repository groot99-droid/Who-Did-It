# Story mode part 2: orchestrator handoff

Written 2026-11-10 (updated 2026-11-12 after #521 and the finisher's third grant) by the orchestrator (session `session_01M5mAcY1JPqjhPmoZ8CZDFp`, "Story mode") so any later
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
| 1 | ANSWERED. Vicar / Medium rule: #499 merged; the buff list is speed, health and the conversion aura. Rite brief `docs/story/rite.md` (#501); the owner took the defaults on R-Q1 to R-Q8 | done |
| 2 | Medium hideout location: Fenwood (`forest_deep`) or a new location (own building, deep woods). The rite site is data, so it can move without code | design |
| 3 | ANSWERED. Seance is retired with the Medium card | done |
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
- P2's E14 PR (#497) is merged into `claude/story-part2` (seen 2026-11-10; the orchestrator did not merge it).
  Still owed: P2 sends one summary of what the engine can do for P5 and what is blocked.
- PR #499 (P0's Medium / 10x Vicar docs) is merged into `claude/story-part2` on the owner's word. Still open from it:
  whether "deep woods" is the existing `forest_deep` (the Fenwood), and the Bandit's and Activist's anti-theme buildings.
- Session R's PRs are all merged into `claude/story-part2` on the owner's word (confirmed to the orchestrator 2026-11-10):
  #502 (R1), #505 (R2), #507 (R3), #508 (R4), #509 (R5), #510 (R7) and #511 (status log). R6 (conversion aura) was waiting on I9, which has since merged (#515);
  R8 (story section) waits on the map revamp. R fixed three e2e/server races on the way (`skipOpening` helper, `npc.spec`
  NPC-vote assumption, `figuresInView.test.ts`), which bears on open decision 10.
- #513, #516 and #519 (the previous handoffs) and S3's #512 are merged into `claude/story-part2`. R's I9 (#515, `9990a4b`), I9b
  (#518, `8b62147`) and R6 (#521, `535b56f`) are merged there too, per R's reports (R1 to R7, I9 and I9b are all in the story branch;
  R6 started on the owner's word, 2026-11-12). The owner chose option (a), keep the listener's once-a-day Faith (A606). The aura is
  the dealt Vicar's (`rite.aura.tiles` 4, `faithPerS` 3, A607). The owner's default (2026-11-12) keeps the aura at these values. The rate is about ten times a sermon
  listener's, so one return day could convert many seats, and it merged at those values (a change is a follow-up PR); a seat next
  to a returned cover gains no Faith (accepted in R-Q3). R's status-log line for #521 is a one-line docs PR, merged by R when green.
- The owner granted, after the fact (2026-11-12), R's one existing-test edit in #515: `apps/client/e2e/screens.spec.ts` lock-pick
  snap wait 5 s to 20 s (assertion unchanged). Any other existing-test edit still needs a grant asked of the orchestrator first.
- #245 (old round-8 canon PR, no shared history with the base) was closed by the owner's word; its branch still exists.
- I9 (conversion: Faith, `conversion.faithAt`, sermon hold at the bell) was built by R on `claude/story-i9-conversion`
  (DECISIONS A606), now merged. The owner wants the Vicar to ring the bell every 60 s; the number belongs in `balance.json` and GDD 3.23 only.
- The finisher holds three owner grants, all for #441 only: the `invariants.test.ts` seed offset, the `npcChores.test.ts`
  `heldBySnare` edit and the `npcChores.test.ts` line 75 `+ 2` to `+ 3` (the `walkCap` source change was refused). It reported
  `npcChores` 12/12 runs passing; its full server suite was still running, and #441 is not merged. S3's work is done; S3 was told to target `claude/story-part2`, not this branch. Nothing is archived unasked.
- Nothing from `claude/story-part2` has gone to the production base. Merging it there deploys and needs the owner's say-so.
- 25 PRs were open on 2026-11-12 (22 drafts into the production base). Triage (git only, nothing changed): the finisher's #435, #437,
  #440, #441 are current; seven are clean but old (#444, #430, #431, #425, #422, #397, #442); seven conflict (#447, #445, #443, #432,
  #429, #428, #426); #245 has no shared history with the base; #464 duplicates the story branch. On 2026-11-12 the owner answered "default on all questions", read as: change nothing. #245 was closed earlier; the other 21
  stay as they are, and the finisher keeps its four.
- R's status-log PR #523 for #521 is merged; R has no open PRs and waits only on R8 (the map revamp). "Default on all questions" does
  not authorise merging `claude/story-part2` into the production base: that still needs the owner's explicit word and green CI.
- The finisher reports it squash-merged #438 (x16, `act()` tick wait) into the production base as `0c3550b` on
  what it describes as the owner's direct "merge" instruction; the orchestrator did not do or see that
  instruction. Confirm it was intended.

## Round-10 lanes the orchestrator owns (2026-11-12)

The owner asked the orchestrator to find archived sessions with unmerged PRs, bring them back until the map revamp, and
"become the owner" of them, answering their questions with its own decisions. Unarchived and briefed (bring the PR up to
the base, CI green, list owner sign-offs in the PR description, merge nothing into the base, no existing-test edits without a
grant asked of the orchestrator, report by message): 10S `session_01M5mAcWM6iFP4icHHeKca4Z` (#447), 10T
`session_01M5mAcUmmE2mPSi934vv6Gw` (#445), 10F `session_01M5mAcUJforvFMyeRQoDBwy` (#429, plus GDD 3.14 and A286), 10H
`session_01M5mAcVEtsFr2jS1mBpRknV` (#444, #430), 10D `session_01M5mAcXTCbXtKaAJRgkS8ow` (#422), 10C
`session_01M5mAcVzBNTaHxVatNhaVLo` (#426, #432), 10X `session_01M5mAcXMS5b7bZYzzwMzzpW` (#425, #431, #442, #397, and the
ownerless #443), 10Y `session_01M5mAcWwzvbuS9YxojFNVor` (#428). Left archived: 10K, 10N and 10M (the finisher holds #440,
#441, #435, #437). The orchestrator owns #471 itself. The delegation covers the lanes' questions; merging into the production
base still deploys and still needs the owner's explicit word.

The map revamp (owner, 2026-11-12) is the Blender work from the owner's local "Blender tools setup" session: the 3D
HollowMere built from the owner's Meshy models on `overworld.json` (`tools/blender/`, first commit `753b563d`), and next the
forest, Fenwood, Tin Gallery and Flooded Gallery from the scene JSONs. Anything that "waits on the map revamp" (R8, P5, P6)
waits on that work.

Grants and calls the orchestrator made under that delegation:
- 2026-11-12, 10S #447: a test-helper grant. `npcHelpers.ts` `Human.id` resolves through `seatOf` (seat ids are fresh at Start), and
  `flow.test.ts` lines 121 and 140 map session ids to seat ids. No assertion, value or timeout changes.
- 2026-11-12, 10C #432: append `hardship` to `STORY_STREAMS` and fixed seed words to `hollowmere_winter.seedWords`. This is data,
  and the orchestrator owns story mode. Carry the same two lines into `claude/story-part2` when it next takes the base.
- 2026-11-12, Blender tools session (`session_01M5mAcVgjse9A6XHwQQXcDr`, runs on the owner's laptop): the orchestrator sent it
  canon answers, and the owner OVERRULED all of them and withdrew them. The owner works with that session directly. The orchestrator
  makes no canon calls for the map revamp. The "sea" is a frozen lake. That session builds the woods and the rest of the map, and
  uses the Meshy models by what they are (several are mislabelled, such as the "Tycoon's Manor").
  Its commit `753b563d` (tools/blender only) was pushed straight to the production base; the owner was told and has not asked for a
  revert. Its later builders go on their own branch with a PR.

## Sessions

| Session | Id | State | Rule |
|---|---|---|---|
| Orchestrator | `session_01M5mAcY1JPqjhPmoZ8CZDFp` | running | never archive |
| P0 design | `session_01M5mAcXYe29zVwSB7eQSKQ5` | #499 and #501 merged; waiting on owner for the open items above | keep until the open items are answered; check live status before archiving (an archive on 2026-11-10 was reversed) |
| Story R: the Medium's rite and the 10X Vicar | `session_01M5mAcVS17U3fpdfpYurWpn` | spawned by P0; R1 to R5 and R7 built and merged (#502 to #511), R1 to R7, I9 and I9b are merged (#502 to #521); only R8 (story section) is left and waits on the map revamp | keep until R8 unblocks; never archive unasked |
| P2 sections engine | `session_01M5mAcVG1b3xhGH76C6nUHz` | review-ready (E14) | keep until merged and summarised |
| Skipped-PR finisher (#437, #438, #435, #440, #441, K6b) | `session_01M5mAcY9qbhZ1CAniTBr7xH` | everything pushed (2026-11-10). #438 merged into the base (see above). #437 not merged: `e2e` failed twice on `match.spec.ts:169` (hud-clock hidden at startMatch), re-run spent, needs the base's e2e history or the trace (artifact 13597323394, run 42422463137). #435, #440, #441 not merged: each needs a base re-merge, the full server suite, `pnpm auto` at 50 and CI. #440 also has the Handcuffs prices/grant (owner) and an npcStuck failure in match 30 (forest near wall (9,14)) needing a nav fix or routing to 10F/10X. #441 is about 680 lines, over the 400-line rule: owner decides split or accept | keep until these are resolved; never archive unasked |
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
