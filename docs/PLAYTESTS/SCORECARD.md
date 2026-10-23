# M3 scorecard: fun or stop

The sheet that closes M3 (ROADMAP 7.1, the M3 row): **three 5-player matches in a row end in a
Village or Cabal win in 10-18 minutes; vote accuracy and "would play again" are logged; the
fun-or-stop decision is recorded.** Copy this file to `YYYY-MM-DD-m3-scorecard.md` for each of the
two M3 sessions; the second copy carries the signed decision line. The run sheet is `README.md`,
the form `FORM.md`.

## 0. The bar, set before session 1

Write these before anyone plays, so the result is not read to fit the hope. The ROADMAP sets the
timing line; the other two bars are the owner's call and stay the same for both sessions.

| Line | Bar | Set by, date |
|---|---|---|
| Match length | a win in 10-18 min, three matches in a row | ROADMAP 7.1 |
| Vote accuracy, session mean | `____` (share of votes on a Cabal member) | |
| Would play again (form item 7) | `____` players of five at or above `____` | |

## 1. Session

| | |
|---|---|
| Date | |
| Session | 1 of 2 / 2 of 2 |
| Build (`/health` `build`) | |
| Server | Railway Hobby, `https://` |
| Players (seat names, device) | |
| Host | |
| Discord rule kept (mics only in meetings) | yes / no, where |

## 2. Matches

One row per match, valid or void. Length is the duration in the match-log line (README 4), read
as m:ss. Vote accuracy is the mean of the match's meetings as the log reports them; a match
with no vote cast has none (write "–").

| # | Length (m:ss) | Winner | Why (the game-over line, UI 14.10) | 10-18 min win? | Kills | Meetings | Ejections (right / wrong / nobody) | Vote accuracy | Void? | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | | | | |
| 2 | | | | | | | | | | |
| 3 | | | | | | | | | | |
| 4 | | | | | | | | | | |
| 5 | | | | | | | | | | |

"Right" is an ejected Cabal member, "wrong" an ejected villager, "nobody" a tie or Skip. A void
match (a drop or a crash, README 6) neither counts nor breaks the row.

**Exit test:** three valid matches in a row each pass the 10-18 min win column: **pass / fail /
not reached** (which matches: `__`, `__`, `__`).

## 3. From the form

| Item | Result |
|---|---|
| 2. Understood my role in 20 s (mean of 1-5) | |
| 3. I knew where to go (mean) | |
| 4. The vote felt fair (mean) | |
| 7. Would play again, every answer (1-10) | |
| 7. Players at or above the bar | `__` of 5 |
| 5. Most confusing moments, as themes | |
| 8a. Add (repeats first) | |
| 8b. Remove (repeats first) | |
| 6. Phone / desktop split | |

## 4. Session read

| Line | Met the bar? | Evidence |
|---|---|---|
| Match length (exit test) | | |
| Vote accuracy, session mean | | |
| Would play again | | |
| The debrief: did the vote feel like the climax? | | quote |
| Top three problems, worst first | | |

## 5. Decision line (second session only)

Tick one. The decision is about the game, not this build: a crash or a bug is a **fix**, never a
**stop**.

- [ ] **Fun: go on.** The exit test passed and would-play-again met its bar in both sessions.
      ROADMAP 7.6 tags the M3 exit; M3b (quick mode) starts.
- [ ] **Fix, then test again.** The loop works and players want more, but a line failed for a
      reason with a named fix (match length, clue readability, a confusing screen). List the fixes
      below; each becomes a task with a GDD or `balance.json` change; a third M3 session repeats this
      sheet.
- [ ] **Stop and rethink.** The matches ran, yet players don't want to play again, or the vote
      felt like a guess even when the clues were there. No M3b or M4 work until the owner has
      written what changes in the design, as a row in `docs/DECISIONS.md`.

Fixes or the rethink, in one paragraph:

>

Signed: `owner`, date `____`. Recorded in `docs/DECISIONS.md` row `A__`.

## 6. M3b, quick mode

Removed in round 7 with the quick mode (DECISIONS A115); kept as the record of the plan.

Copy this section with 0 to 4 to `YYYY-MM-DD-m3b-scorecard.md` for each of the two M3b sessions (run
sheet `README.md` 8). The lines are ROADMAP 7.1, the M3b row.

| Line | Bar | Set by, date |
|---|---|---|
| Match length | a finished match in the `targetLengthMin` range of `balance.onub.json` (GDD 3.11), three 6-player matches in a row | ROADMAP 7.1 |
| Final role named at the reveal | at least half the players right in a match, in at least half the valid matches | ROADMAP 7.1, read per match |
| Would play again (form item 7) | the session mean against both M3 sessions' means; no lower | ROADMAP 7.1 |

| # | Players | Length (m:ss) | Winners row (`rowId`) | Turned out | In range? | Right guesses (of players) | Half or more? | Void? | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | | | |
| 2 | | | | | | | | | |
| 3 | | | | | | | | | |
| 4 | | | | | | | | | |
| 5 | | | | | | | | | |

A guess is the role a player DM'd the host when the vote closed (README 8), right when it equals
their final role on the end screen. Form item 9 is the players' own view of the same thing.

**Exit test:** three valid 6-player matches in a row in range: **pass / fail / not reached**;
half or more of the valid matches with half or more right guesses: **pass / fail**; would play again,
this session `__` against M3 `__` and `__`: **at or above / below**.

## 7. M3c, NPC fill

Copy this section with 1 and 4 to `YYYY-MM-DD-m3c-scorecard.md` for each M3c session (run sheet
`README.md` 9). The lines are ROADMAP 7.1, the M3c row; the field and tick lines of that row are
server tests and the soak, not the session.

| Line | Result | Evidence |
|---|---|---|
| One human and three NPCs finish a main match | yes / no | the match-log line |
| The NPC Killer wins at least one of five scripted matches at Normal | `__` of 5 | the five match-log lines |
| Humans who named every NPC seat (form item 10, session 2 only) | `__` of `__` | |

Each match row: mode, humans, NPC seats, difficulty, length, winner, and whether an NPC held the
Killer. A main match that stalls is not a pass: write when it stopped and why.

| # | Mode | Humans | NPC seats | Difficulty | Length (m:ss) | Winner | NPC Killer? | Void? | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | | | |
| 2 | | | | | | | | | |
| 3 | | | | | | | | | |
