# Round 10, part 2: what is left

## Why this file

On 2026-10-30 the owner wrote to 6Z:

> Get to the next stopping point then we will pick up all that is left in round 10 pt2

and, as the stop began:

> When the sessions are done and the pause has commenced, archive the sessions, move the information to be done for
> pt2 to access later

6Z stopped once stack11 (C4b, B6a, R1, R2) and the pull request that adds this file had merged. Every session sent 6Z
a handoff and was archived with its work pushed, except 10F's S1b, which is kept as a diff in a comment on #429. This
file is the pickup list for part 2:
- the state at the stop and the open pull requests;
- the merge queue;
- each session's remaining steps and handoff;
- the owner's open questions;
- how to resume.

The contract is unchanged. `README.md`, `seams.md` (rows 1 to 37) and `scope.md` still rule, and the Round 10 log in
`docs/SESSIONS.md` records every merge and ruling. `wave2-briefs.md` keeps the briefs of 10N, 10K, 10T and 10M.

## The state at the stop

- **The base**, `claude/zen-turing-m1jnw0`. Its last code merge at the stop was x18 #446, at 8b03b36a. This file's
  pull request merged after it, with docs only. Railway production deploys every push to the base.
- **Merged on 2026-10-30 before the stop** (the Round 10 log has each one):
  - the slice, B1 to B5, B6a and B8a;
  - C1 to C3, C4a, C4b, C5a and C5b;
  - D1 to D9 (D9b parked for the balance lab);
  - R1 and R2;
  - 10S's scope census;
  - 10X's and 10Y's fixes up to x15 and y15, with y17 (CI's `server` job limit) and x18
    (`herbBreadDawn.test.ts`).
- **`herbBreadDawn.test.ts`** (x11). Its two tests ran close to vitest's 5-second default in the cloud containers,
  and failed there on the bare base too; CI's runner passed them. Timed alone, the two took about 7 to 9 seconds
  together, on the base and on stack11 alike. x18 gave the file the day timeout `npcRoutine.test.ts` uses, and it
  merged at the stop.
- **CI's queue.** Every session pushed at the stop, so many pull requests' CI runs were still queued. A pull request's
  state below is its session's word; part 2 reads its checks again before it merges anything.
- **Two more Opus sessions.** The owner's offer is still unanswered: one for world mode's W5 to W8, one for half of
  10N's cards. Without them the estimate at the stop was about 45 hours of building; with them, about 30 to 35.

## Open pull requests and branches at the stop

| PR | Step | Session | State at the stop | Next |
|---|---|---|---|---|
| #422 | S4, the mugging's Flee and Fight | 10D | Complete at c95f07d8 | stack12 |
| #425 | x9, the grindstone | 10X | Complete at 9a4ee852; full check clean, auto 50 unrecorded | stack12 |
| #431 | x13, NPC night baking | 10X | Complete at 2c105b85; shares `routines.json` with x9 on other hunks | stack12 |
| #430 | S2, Berries, Game and Stew | 10H | Complete at 7d7f4162; NPC foraging is 10F's D1c | stack12 |
| #428 | S5, the art style in the menu | 10Y | Complete at 71128ae9; conflicts in `DECISIONS.md` and `UI.md` only, and a base merge in `scenes/World.ts` after R1 | stack12 (keep both) |
| #421 | V1a, Inspect, the Lens and Plant Clue | 10V | Complete at 798d0038 | stack12 |
| #436 | y16, the stale e2e gates | 10Y | Complete at 703cbfeb; its first `e2e` run on CI's runner was in progress | stack12 |
| #444 | S3, the forge chain | 10H | Complete at dacc288d; CI running | after S2, with a base merge for the recipe lists |
| #432 | C4c, the dormant role and the hardships | 10C | Complete at a491730, the base at e9265a2a merged in | 10C's pair |
| #426 | C5c, the Knife on the guards | 10C | Complete at 851dd58, the base at e9265a2a merged in | 10C's pair |
| #443 | C4d, the Clerk's rent ledger | 10C | WIP at 3f34b5c, stacked on #432 | after the pair |
| #442 | x17, the NPC collect hole in `constableFile.test.ts` | 10X | Complete at b449951 | 10X's fixes |
| #437 | x12, the studio draft test's budget | 10X | WIP at c8521e2; full check unrecorded | 10X's fixes |
| #438 | x16, `act()` waits for the room's tick | 10X | WIP at d6a9ade; its checklist is in the body | 10X's fixes |
| #397 | x14, the decoded-view invariant | 10X | WIP at f2eeb1a; needs a base merge, the full check and `--views 50` | 10X's fixes |
| #441 | K6a, the snares' server half | 10N | WIP at 10f2680 | with or after K6b |
| #440 | K3, candles for all and Handcuffs | 10K | PR_440 | when Complete |
| #435 | M1a, the barks' server half | 10M | WIP at 91a54863; auto 50 clean, CI and the base merge left | when Complete |
| #434 | T6a, new places | 10T | Complete at 6d7feb41; CI green, auto 50 clean | after stack12 |
| #445 | T6b, the mood hooks | 10T | WIP at 4f7aafe6, stacked on #434 | after T6a |
| #447 | W1a1, fresh seat ids at Start | 10S | WIP at 4a72fcf7; its tests never ran to completion | with W1a2, after B6c |
| #429 | S1a, containers and loot tables | 10F | Complete at c237b41a, the base merged; auto 50 clean | after stack12 |
| #448 | B6d, the end trial (row 35) | 10B | B6D_STATE | with B6d2, before B6c |
| #245 | 8V R3 (round 8) | none | stale draft | 10X closes or revives it |

Branches with no pull request yet:
- `claude/r10-k6b-snares-npc` at 8fc6fd2 (10N's K6b, on K6a);
- S1b (10F) has no branch: its diff is a comment on #429 (10F's handoff).

## The merge queue for part 2

1. **stack12:** S4, x9, x13, S2, S5, V1a and y16 on one merged tree, with the full check, auto 50 and every e2e
   spec. Merge them in that order, each verified against the simulated tree.
2. **After stack12:**
   - S3, once it has merged the base for the recipe lists;
   - T6a, then T6b;
   - S1a, then S1b, restored from the comment on #429;
   - M1a and K3, once each is Complete.
3. **10X's test fixes:** x17, x12, x16 and x14, each once the check its description lists as queued has run.
4. **10C's pair:** C4c and C5c, FULL+AUTO, then C4d.
5. **B6d with B6d2**, back to back if both are ready, so production never runs B6d's human-only filing for long
   (`seams.md` 3 row 35). B6c deletes the old vote code after them.
6. Then each pull request as it completes, in `seams.md` 7's order. A Complete on a base a few merges old follows
   `seams.md` 1's rule.

## Each session's remaining steps

Gates are the steps that must merge first (`scope.md` 4; the briefs in `docs/SESSIONS.md`). The handoffs below
give each step's detail.

| Session | Model, window | At the stop | Still to build (gate) |
|---|---|---|---|
| 10A | Opus, 500k | planning, no code; plans in `handoffs/10A-plans.md` | K1 weapons (C6); T4a windows, stations and the Hitman's props, T4b work rules, T4c silhouettes (C4c, C4d) |
| 10B | Opus, 800k | B6a merged; B6d WIP (#448) | B6d, B6d2 (before B6c), B6b, B6c, B7 the Inquest, B8b; then T5 (B6b, B6c) |
| 10C | Opus, 800k | C4c and C5c Complete; C4d WIP | the pair's merge, C4d, C6 (B6, D8), C7 (B6); then V1 to V4, the vendettas (W1b, B7, C5c, C4b; V4 after V1 to V3) |
| 10D | Sonnet, 500k | S4 Complete | D4b (after S2) |
| 10E | Sonnet, 500k | not spawned | E1, E2 (spawn when B6c merges) |
| 10F | Opus, 500k | S1a Complete (#429); S1b a local commit (its handoff) | S1b, D1b (I41, NPC seats at night), D1c (NPC foraging and cooking) |
| 10G | Sonnet, 300k | done (A2 to A4 merged) | nothing |
| 10H | Sonnet, 500k | S2 and S3 Complete | no step assigned |
| 10K | Sonnet, 500k | ROW_10K | K7; K2 and K4 (S3); K5 (K4); K8 (C4c) |
| 10M | Sonnet, 500k | M1a WIP | M1b (R1, S5), M4, M3 (C6) |
| 10N | Opus, 800k | K6a WIP, K6b on a branch | K6b, K6c; N2 (V3), T1 (W1b), N1 (W1b, B7), N3 (B4, K6), N4 (S1, T5), N5 (B7), N6 (W1b, B6a, V1a), M2 (B7) |
| 10R | Opus, 800k | R1 and R2 merged | R1b (before 10V's first hold step), then R3 (after B6c) to R6 (`rolecards.md` 9 and 12) |
| 10S | Opus, 800k | W1a1 WIP (#447) | W1a1's checks, W1a2 (with or before W1a1, both after B6c), W1b, W2 to W8, M5 (W3) |
| 10T | Sonnet, 500k | T6a Complete (#434); T6b WIP (#445) | T6b's checks (T6a), T2 chores, T3 standing (T2) |
| 10V | Opus, 500k | V1a Complete | V1b (V1a), V2 the cover-up verbs, V3 the hiding spots |
| 10X | Fable, 300k | x9, x13 and x17 Complete; x12, x14 and x16 WIP | their checks, then every open server-side issue (its handoff lists those not started) |
| 10Y | Fable, 300k | y16 and S5 Complete; y17 merged | C4b's client half, 10V's client halves, then every open client-side issue |
| 10Z | Fable, 800k | not spawned | the final sweep, when every other round-10 pull request has merged |
| 11A, 11B | Opus | idle since their plan merged (#374) | round 11's build, after round 10's freeze and 10Z |

## Handoffs

Each session's handoff at the stop, as it sent it to 6Z. A later merge or ruling in the Round 10 log wins.

### 10A

- No open pull requests. A1, A12a, A12b, the bed frames, A7a and A7b (#349) have merged.
- K1 (after C6) and T4a, T4b and T4c (after C4c and C4d) are planned in `handoffs/10A-plans.md`, with 6Z's three
  answers.
- No open questions. Nothing unpushed.

### 10B

- #427 B6a merged at the stop.
- #448 B6d, the end trial (row 35), at 633fa960 on `claude/r10-b6d-end-trial`: WIP at the stop.
  - Its code and tests are done. The base is merged: the conflicts were the schema comment, `Win.ts` and `gameOver`,
    and C4b's `hitman` and B6d's `unseen` are both kept.
  - Lint and typecheck pass, and the full check passed before the base merge.
  - B6D_RESULT
- 6Z's ruling at the stop: B6d stays one pull request. Its source is about 405 changed lines (273 of them the new
  `EndTrial.ts`); the rest is 365 lines of tests and 30 of docs. Splitting the trial from its Tribunal hook would put
  half a rule on production.
- Grants used on #448: the `flow`, `trial` and `invariants` tests, and the `autoHelpers.ts` and `AdminView.ts` kinds.
- Next, in order:
  - B6d2, the NPC present-and-file rule, with its own streams for the tick and the chance. It closes row 35's
    human-only filing and merges back to back with B6d, before B6c.
  - B6b: 10B brings 6Z the goods-priced theft design first.
  - B6c: voting retires, with per-file grants.
  - B7, the Inquest: characters rather than names, and NPC named lines.
  - B3b and B8b, then T5 in wave 2.
- No open contract requests. Nothing unpushed.

### 10C

- #426 C5c at 851dd58 and #432 C4c at a491730 are Complete. Each has the base at e9265a2a merged in, and `Train.ts`
  keeps both imports. Part 2 runs the full check and auto 50 on the pair.
- #443 C4d at 3f34b5c is WIP, stacked on #432. Its code, tests and docs are done, and the ledger, hardship and leak
  tests pass. Left: merge the base after #432 merges, then the full check and auto 50. 10Y draws the `ledger` reply
  in the reader.
- C4d departs from its grant twice. Review both:
  - `routine.ts` takes three lines (10F knows) plus `holdAt` in `chores.ts`;
  - there is no `interactions.json` row: the reader opens through `lore.json`, since a row would need a schema
    change.
- C4d's DECISIONS row is A392, which is 10E's ninth slot (`seams.md` 5). 10C's next is A390, and part 2 renumbers it.
- Row 21 already reads `Avatar.lookOf` as the seat whose face is drawn, as the schema's comment does. Nothing waits
  there.
- Next:
  - C6, after B6 and D8, on D8's Strength hook in `fists.ts`;
  - C7, after B6;
  - V1 to V4, after W1b.
- W1b's gate on `sim/Deck.ts` is open: C4b was 10C's last step there.
- Nothing unpushed.

### 10D

- #422 S4 at c95f07d8 is Complete with CI green. Its auto 50 runs in stack12.
- Merged before the stop: D2, D3, D4a, D5a to D5c, D6a, D6b, D7, D8, D9a and D9c. D9b is parked by ruling.
- Next: D4b, the dishes, after S2 merges. The Berry Tart needs S2's berries and the Miner's Pasty its game. 10D's next
  DECISIONS row is A491.
- S4's proposed `moods.mug` values wait for the owner's sign-off.
- I48, the scrub, is the owner's (Q-S5), not 10D's.
- Nothing unpushed.

### 10F

- #429 S1a, containers and loot tables, at c237b41a: Complete, with the base merged. The full check passed except
  `herbBreadDawn.test.ts`'s timeouts, which x18 has since fixed. Auto 50 was clean.
- S1b is the local commit ba2167b7: 391 lines, green. The permission check refused its push to any branch but 10F's
  designated one, and 10F did not work around it. Its code diff is kept in a comment on #429
  (https://github.com/groot99-droid/Who-Did-It/pull/429#issuecomment-6528113034). To restore it, save the fenced
  text to a file and `git apply` it on a branch cut from the base after #429 merges. Then write the GDD 3.14
  paragraph and the A286 lines the comment lists.
- Next, each in part 2:
  - S1b, after #429 merges: `sim/interact/loot.ts` deals a container's contents on first use (`containersOf`,
    `isFurniture`, `takeContents`). Add a two-line hook in `resolve.ts`, one line in `Minigames.ts`, and
    `test/containers.test.ts`, and flip the three interactions to live (A286, GDD 3.14, #429's "Left for part 2").
  - D1b, NPC seats at night and NPC container searches. It waits for the owner's answer to Q-S4, whose other choice
    is to keep the tells.
  - D1c, NPC foraging and cooking, folded into D1b if both fit under 400 lines.
  - D1b and D1c merge the base around T6b and C4d in `routine.ts` (`pickStation`, `runWork`), and around K6b in
    `chores.ts`. T6b's line in `pickStation` sits right after `let pool = ...` (10T).
- No open questions. `claude/r10-s1-containers` is all on origin.

### 10G

Done: A2 to A4 have merged. Nothing unpushed.

### 10H

- #430 S2 at 7d7f4162: Complete, CI green, in stack12.
- #444 S3, the forge chain, at dacc288d: Complete, with the full tests and auto 50 clean locally. CI was running at
  the stop.
- Both extend the recipe lists in `content/test/m5b.test.ts` and the client's `m5bPanels.test.ts`. Merge the base into
  #444 after #430 merges.
- #444's grants, to confirm at review:
  - `sim/body/effects.ts` for the dazed duration, which is 10H's own file;
  - `routines.json`;
  - `interactions.json`, 10F's file (keep both sides);
  - the `bp_smithy` and `bp_woods` prop kinds;
  - the recipe `profile` in the content schema (`m5b.ts`, `validate.ts`).
- Defaults to flag for the owner:
  - the forge's ingot costs (in #444);
  - the thick log is the forests' `fallen_log`, since there is no granite boulder prop.
- 10H has no next step assigned. The owner's playtest notes on sleeping, the inventory and crafting come through 6Z.
  DECISIONS rows used: A267 (S2) and A287 (S3).
- Nothing unpushed.

### 10K

HANDOFF_10K

### 10M

- #435 M1a, the barks' server half, at 91a54863: WIP. Its description carries the brief and a checklist.
- Auto 50 on 91a54863 finished clean (50 of 50) after the handoff.
- Left of M1a:
  - confirm CI green on 91a54863 (the earlier `server` failures were on the old head, fixed by the R17 grant);
  - merge the base, run the full check, mark it Complete.
- Next:
  - M1b, the client's wheel, bubble, key bind and mount, after R1 and S5, on the log's grants (`input/` and the
    `view/Hud.ts` mount lines);
  - M4, the minimap and fog, on the same mount grant (not started);
  - M3, after C6.
- The quick-chat wheel was declared but never built, so M1b builds the whole client side. The pool is in
  `balance.json`.
- Nothing unpushed.

### 10N

- #441 K6a, the snares' server half, at 10f2680: WIP. CI was queued at the stop. The full server suite stalled locally,
  and its rerun hadn't finished. Left:
  1. merge the base, appending `NoteKind.snared` after B6a's and keeping every DECISIONS row;
  2. auto 50;
  3. Complete.
- K6b, Rope and NPC seats with snares: branch `claude/r10-k6b-snares-npc` at 8fc6fd2. It is WIP, has no pull request
  and its tests haven't run. DECISIONS A260.
- K6c: the client drawing, the Use buttons for the snare and the rope, the Notebook line (`UI.md` 14.57), the disarm
  (row 31, `snare.disarmS`), and snares on creatures.
- K6a merges with or after K6b, so a set snare never marks a human.
- Then N2 (after V3), T1 (W1b), N1 (W1b, B7), N3 (B4, K6), N4 (S1, T5), N5 (B7), N6 (W1b, B6a, V1a) and M2 (B7).
- Row 31's disarm text is in. The Q-S1 to Q-S3 defaults stand.
- Nothing unpushed.

### 10R

- R1 #419 and R2 #423 merged at the stop.
- Next:
  - R1b, on `claude/r10-r1b-holds`: it binds the hold slot keys and the phone's press-and-hold discs, for live rows
    only. It goes after R1 and before 10V's first hold step. It needs grants for `actions.ts`, `abilityDiscs` in
    `TouchControls.ts` and the `World.ts` `bindKeys` block.
  - R3, the card copy, after R1, R2 and B6c: `roles.json` lore, wins, loses, tips and beware; the `abilities.json`
    line; the schema; the drift test.
  - R4, the trifold (`ui/card/**`).
  - R5, the Satchel (`ui/satchel/**`).
  - R6: `RoleRevealAbility.key` leaves the wire. Its `seams.md` 3 row goes to 6Z first.
- Watch for 10V binding a hold slot before R1b lands.
- The mock is `docs/round10/samples/rolecards` (rebuild it with `build-mock.mjs`). The owner's link is the artifact
  UAZMrGX14mD1szMSWDx5Sj.
- Nothing unpushed.

### 10S

- #420, the scope census (`scope.md`), merged.
- #447 W1a1, fresh seat ids at Start, at 4a72fcf7 on `claude/r10-w1a1-seat-ids`: WIP. It adds the `seatOf` and
  `clientOf` boundary and `Private.seatId`. Its tests never ran to completion: CI's `server` job hit its old limit,
  which y17 has since raised.
- Left of W1a1:
  - run the full suite and the new `seatIds.test.ts` (six cases), and fix what fails;
  - list the existing tests that press a real Start with three or more humans and read seats by session id (likely
    `lobby`, `flow`, `coverPick` and the `npcHelpers` users; the `debug.play` tests are unaffected), and ask 6Z's
    permission to change them.
- Gates:
  - W1a1 rebases on B6c once it merges.
  - W1a2 merges with or before W1a1, since W1a1 alone still shows `leaderId` and names during play. It covers the
    name, profile, `connected` and `leaderId` scrub, `GameState.party`, the game-over names, the disconnect autopilot,
    and GDD 3.12 and 3.21.
  - Then W1b, whose `sim/Deck.ts` gate is open (C4b was 10C's last step there), W2 to W8, and M5 after W3.
- Open: the test-permission list, once the run is in; Q-S1 to Q-S6 with the owner, the defaults standing.
- Nothing unpushed.

### 10T

- #434 T6a, new places, at 6d7feb41: Complete. CI (`check`, `server`, `e2e`) green, auto 50 clean, and the base had
  nothing newer. Its description lists 6Z's two grants (`mapSites`, R17 `loot`) and the trace.
- #445 T6b, the mood hooks, at 4f7aafe6 on `claude/r10-t6b-moods`: WIP, stacked on #434's commits. Its code, tests
  (`test/moodHooks.test.ts`), A262 and GDD 3.24 are done and pass locally; the full check and auto 50 haven't run.
- Left of T6b: after #434 merges, merge the base, run lint, typecheck, the full tests and auto 50, and mark it
  Complete. The Angry hook skips a hiding spot (V3, not built) and a departed Hitman. C4b's departed state merged at
  the stop, so part 2 checks whether that half can go in now.
- Next:
  - T2, chores and errands (`chores.json`), DECISIONS A282. Chores stay out of the bar and the task deal, and NPC
    seats hold the same stations, lengths and signs.
  - T3, standing, examine lines, leads and Faith's sources, after T2. DECISIONS A302.
  - Copy under `UI.md` 14.59.
- T6b's villager line is in `sim/townsfolk/run.ts`, not `walk.ts`. 10F's D1b also touches `routine.ts` `pickStation`
  (above).
- No open questions. Nothing unpushed.

### 10V

- #421 V1a at 798d0038, on `claude/r10-v1-evidence`: Complete, CI green. Its description holds the brief.
- Next, V1b (Dust, Compare, Autopsy), once #421 merges:
  - restart `claude/r10-v1-evidence` from the base and build to row 24, with DECISIONS A259;
  - add a test that a reading entry is refused at `petition.open`;
  - GDD 3.2 says Dust lifts the most recent door crosser other than the duster.
- V2, the cover-up verbs, on `claude/r10-v2-coverup`: Drag, Rag, Bucket, Skeleton Key, Crowbar. It goes after V1b
  and a new `seams.md` 3 row.
- V3, the hiding spots, on `claude/r10-v3-hiding`: Hide, Check, Burst Out, Chalk, Act Shifty, Fake Blood. It goes after
  V2 and its own row.
- Hold verbs keep their `abilities.json` status off `live` until R1b merges.
- Nothing unpushed.

### 10X

- Complete:
  - #425 x9, the grindstone, at 9a4ee85: the full check was clean at the stop. Auto 50 on this head is unrecorded,
    and part 2 reruns it.
  - #431 x13, NPC night baking, at 2c105b8.
  - #442 x17, the NPC collect hole in `constableFile.test.ts`, at b449951.
  - x18 #446 merged at the stop.
- WIP, each with a checklist in its body:
  - #397 x14, the decoded-view invariant, at f2eeb1a: the full check and `--views 50` on the true head are
    unrecorded. The base merge can wait.
  - #437 x12, the studio draft test's budget, at c8521e2: the full check is unrecorded.
  - #438 x16, `act()` waits for the room's tick, at d6a9ade. CI's typecheck failure is fixed (`stateOf()`), and
    `actWait` has a 20-second budget, since the match fixture alone takes about 5.4 seconds under load. The suite
    passed three times. Unrecorded: the fail-before, and the three whole-suite runs with the base comparison.
- Every lane result queued at the stop was lost with the container; each body lists its own.
- Part 2's order: x9 and x13 (stack12), then x14's base merge, full check and views, then x16's list, then x12's full
  check.
- Open:
  - x14's note on `SchemaSerializer.getFullState`'s 16 KiB stale buffer (in #397's body), the owner's call;
  - HollowMere has no grindstone (A313), the owner's call;
  - 6Z's answers at the stop: x9's refusal reason `ALREADY_DONE` stands, and x13's "Open tells" bullet stays in GDD
    3.12, NPC fill, where the NPC seats' rules live.
- Not started, with no go given: tin mail, the tin helm, the forge, armour Warmth, the Miner's cap lamp, footsteps,
  armour on the figure, the petition bar's residual, NPC rent, NPC petition signatures, the station mini-game's time
  bound, `npcTells`' T-rule and E-check, the hand-craft retirement's server half, the `npcBrain` flake, the NFY tags,
  the playtest notes and #245. Some overlap S3 and K2, so part 2 checks each against the merged steps first.
- Nothing unpushed. A new container re-subscribes to these pull requests.

### 10Y

- #439 y17, on `claude/r10-y17-ci-timeout` at e7cf026e: Complete. It raises CI's `server` job limit, one line in
  `ci.yml`, and leaves `check` unchanged.
  It merged at the stop, at 04d76d35.
- #436 y16 at 703cbfeb: Complete. Its first `e2e` run on CI's runner was in progress at the stop. If a spec times out
  there, tune it; never skip it (A514).
- #428 S5 at 71128ae9: Complete, CI green. It expects a base merge in `scenes/World.ts`, now that R1 has merged.
- Next:
  - C4b's client half. The rulings are in the log, and the row is DECISIONS A574. It covers the Derringer (ability and
    item `derringer`), `Private.departed`, `DeathCause` `derringer` and `gameOver.hitman`.
  - 10V's client halves, as their server steps merge: the pickers for `inspect` and `plantClue`, then V1b's `dust`,
    `dustCompare` and `autopsy` (rows 23 and 24; `UI.md` 14.54).
- Open:
  - the figure looks' server half, proposed to 10B and 10X (A454's note);
  - a figure's post on the wire (6Z's call);
  - the `meeting.title` word, for the owner (A414).
- 10M builds its M1 and M4 mount lines in `Hud.ts` on 10Y's.
- 10Y disabled its safety-net check-in. Whoever resumes re-subscribes to #428 and #436 and re-arms one.
- Nothing unpushed.

### 11A and 11B

Idle since round 11's plan merged (#374, with #346, #347 and #371). Nothing unpushed. Round 11 unarchives them after
round 10's freeze and 10Z.

## The owner's open questions

Each has a default the build takes until the owner answers.

- `scope.md` 5:
  - Q-S1, the Ranger's Arrest;
  - Q-S2, the Company Clerk;
  - Q-S3, the roads;
  - Q-S4, NPC seats at night, now 10F's D1b;
  - Q-S5, the scrub;
  - Q-S6, no free text outside meetings.
- Round 11 (`docs/round11/questions.md`):
  - SC2, Meshy models;
  - BU4, the test phone;
  - RN3, Blender in the cloud environment.
- Production, from the lag report: the Railway region (where the players are) and client-side prediction.
- The HollowMere grindstone, which x9 found missing.
- Defaults the handoffs flag, each standing until the owner answers:
  - S4's proposed `moods.mug` values (10D);
  - the forge's ingot costs, and the forests' `fallen_log` as the thick log (10H, #444);
  - x14's note on `getFullState`'s 16 KiB stale buffer (10X, #397);
  - the `meeting.title` word (10Y, A414).
- A duplicate artifact of 10R's mock, which stays until the owner says.
- Two more Opus sessions for part 2 (above).

## How part 2 resumes

1. The orchestrator re-reads `CLAUDE.md`, `docs/round10/README.md`, `seams.md`, this file and the Round 10 log.
2. It fetches the base and lists the open pull requests. A pull request may have moved since its handoff.
3. It brings each session back in one of two ways:
   - **Unarchive.** `unarchive_session` with the id below, then `send_message`: "Round 10 part 2: resume with
     <step>", naming the gate if one is still closed. The session keeps its conversation but gets a new container.
     It re-clones, fetches its branches and re-subscribes to its pull requests. A tiered session (800k or 300k)
     writes `.claude/settings.local.json` again (`README.md`, "Compaction").
   - **A fresh session**, from its brief (`docs/SESSIONS.md`, "Round 10 briefs", or `wave2-briefs.md`, also in its
     first pull request's description), its handoff above and this file. It is spawned from its tier branch.
4. It works the merge queue above, checks each merge on the true merged tree, and logs merges and rulings in the
   Round 10 log as before.
5. It spawns 10E when B6c merges, and 10Z last.

The archived sessions, all spawned by 6Z (`session_01M5mAcWJXBeyh4yPTi8ZPYa`):

| Session | Id |
|---|---|
| 10A | `session_01M5mAcX8f88SVexKNqrN8j6` |
| 10B | `session_01M5mAcZ1oST8MJWB4Hq1Uae` |
| 10C | `session_01M5mAcVzBNTaHxVatNhaVLo` |
| 10D | `session_01M5mAcXTCbXtKaAJRgkS8ow` |
| 10F | `session_01M5mAcUJforvFMyeRQoDBwy` |
| 10G | `session_01M5mAcY6QyaiwSwPNLNW4EC` |
| 10H | `session_01M5mAcVEtsFr2jS1mBpRknV` |
| 10K | `session_01M5mAcUjv6wPtHu4mziWaC7` |
| 10M | `session_01M5mAcVMUkZxJPszqSoYSUx` |
| 10N | `session_01M5mAcY63e47wf7xUZtSknf` |
| 10R | `session_01M5mAcYRBLEgzjECAKKzVuL` |
| 10S | `session_01M5mAcWM6iFP4icHHeKca4Z` |
| 10T | `session_01M5mAcUmmE2mPSi934vv6Gw` |
| 10V | `session_01M5mAcWnPj9kEasQJz2QNAq` |
| 10X | `session_01M5mAcXMS5b7bZYzzwMzzpW` |
| 10Y | `session_01M5mAcWwzvbuS9YxojFNVor` |
| 11A | `session_01M5mAcXKhtkUy8EvVuqkw6V` |
| 11B | `session_01M5mAcYZKxx8zg2AAcwSByb` |

## The merged-tree check

CI runs `check` and `server` on every push. It adds `e2e` when a pull request touches the client, the shared or
content packages, the lockfile or the workflow (and the server, once y16 merges). Before a merge, 6Z ran the same
checks on the true merge, from a clean checkout of the repository root:

```bash
# mcheck.sh <base> <head> <label>
#   FULL=1  adds the server suite
#   AUTO=1  adds the 50-match bot swarm (for a rules pull request)
#   E2E=" " runs every e2e spec
# Logs go to $S. Run one check at a time: server tests share one port.
S=${S:-/tmp/mcheck}; mkdir -p $S; B=$1; P=$2; L=$3
T=$(git merge-tree --write-tree $B $P) || { echo "MERGE CONFLICT"; exit 1; }
C=$(git commit-tree $T -p $B -p $P -m check)
echo "$L: base $B head $P tree $T commit $C"
git checkout -q --detach $C
pnpm install --frozen-lockfile --prefer-offline >/dev/null 2>&1; echo "install $?"
pnpm lint >/dev/null 2>&1; echo "lint $?"
pnpm typecheck >/dev/null 2>&1; echo "typecheck $?"
pnpm --filter '!@wdi/server' -r --if-present test > $S/tests-$L.log 2>&1; echo "non-server tests $?"
pnpm build > $S/build-$L.log 2>&1; echo "build $?"
if [ -n "$E2E" ]; then (cd apps/client && pnpm exec playwright test $E2E > $S/e2e-$L.log 2>&1; echo "e2e $?"); fi
if [ "$FULL" = 1 ]; then pnpm --filter @wdi/server test > $S/server-$L.log 2>&1; echo "server suite $?"; fi
if [ "$AUTO" = 1 ]; then pnpm auto -- --matches 50 > $S/auto-$L.log 2>&1; echo "auto $?"; fi
git checkout -q --detach $B
```

A stack of several pull requests is checked the same way on a simulated tree:
1. Merge each head in order with `git merge-tree --write-tree` and `git commit-tree`.
2. Resolve a `DECISIONS.md` or `UI.md` conflict by keeping both rows, in number order.
3. After each real merge, compare the base's tree with the simulated one.
