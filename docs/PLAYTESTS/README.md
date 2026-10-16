# Playtests

How a playtest session of Who Did It runs, and where its record goes. Written for the M3 exit
(`docs/ROADMAP.md` 7.1, the M3 row): three 5-player matches in a row end in a Village or Cabal win
in 10-18 minutes, vote accuracy and "would play again" are logged, and the **fun-or-stop decision**
is recorded. The tiers, the metrics and the feedback form are ROADMAP 7.5. Every rule and number a
player meets is in `docs/GDD.md` and `packages/content/data/balance.json`; this folder cites them.

| File | What it is |
|---|---|
| `README.md` | This run sheet: prerequisites, the session plan, the host's script, what to do when something breaks |
| `FORM.md` | The feedback form, question by question, ready to build in Google Forms |
| `SCORECARD.md` | The fun-or-stop sheet for the M3 exit, one per M3 session, with the decision line |
| `TEMPLATE.md` | One session's notes; copy it to `YYYY-MM-DD-<milestone>.md` |
| `2026-xx-xx-m2.md` | The M2 playtest entry (a stub until that session is written up) |

One file per session, named `YYYY-MM-DD-<milestone>.md` (`2026-11-02-m3.md`; a second session the
same day adds `-b`). The scorecard is filled in a copy too: `YYYY-MM-DD-m3-scorecard.md`.

## 1. Owner prerequisites (before inviting anyone)

These are the owner's, recorded in `docs/SESSIONS.md` Round 3 and ARCHITECTURE 5.10. None of them
is done by a build session.

1. **Round 3 merged.** Sessions K, L, M, N, O, P and Q merged into the default branch
   (`claude/zen-turing-m1jnw0` until it is renamed `main`), CI green, and `match.spec.ts` (Session
   O) passing against the real server.
2. **Railway Hobby service** (DECISIONS A6, ARCHITECTURE 5.10). New project from the GitHub repo,
   branch `claude/zen-turing-m1jnw0`, root directory left at the repo root; `railway.json` supplies
   the build and start commands and the `/health` check, so leave those fields empty in the UI. No
   variables are needed (`PORT` is Railway's), and **`WDI_DEBUG` must not be set** (the debug
   handlers must not exist on a server friends play on; CLAUDE.md). Generate a public domain under
   Networking, open `https://<service>.up.railway.app/health` and check it answers
   `{ok: true, build: ...}`.
3. **The server URL in the client.** `apps/client/.env.production` holds the Railway service's
   `https://` URL and every `pages` run builds with it; change the file and push if the service ever
   moves. (An Actions variable `VITE_SERVER_URL` overrides it, see the comment at the top of
   `.github/workflows/pages.yml`.)
4. **Pages source.** Settings > Pages > Build and deployment > Source = **GitHub Actions**.
5. **Same build on both sides.** The `build` on `/health` equals the first 8 characters of the commit
   the `pages` run deployed. Every push to the default branch redeploys both (Railway follows the
   branch, Pages runs on the push), so after a push wait for both to finish before testing. A
   mismatch makes every join fail with "refresh to update" (ARCHITECTURE 5.10); redeploy whichever
   side is behind.
6. **Smoke run, alone, the day before.** First from a terminal in the repo:
   `pnpm bots:live -- --url https://who-did-it-production.up.railway.app` creates a party on the live
   server with five bots, starts it and reports the role cards and the overworld entry (exit code 1
   on any failure). Then open `https://groot99-droid.github.io/Who-Did-It/` in two browsers (one a
   phone), create a party, join it, start, walk through a door. If the landing shows "Waking the
   village..." for more than a moment, the page is not reaching the server: check step 3 and the
   service's logs.
7. **Server logs.** Railway > the service > Logs open in a tab. Each finished match prints one JSON
   line (the match log, 4); the scorecard needs it.
8. **The form.** Build the Google Form from `FORM.md` and keep its link ready to paste.
9. **Discord.** One voice channel and one text channel for the session; the invite sent with the
   date and "bring a laptop or a phone, headphones on".

## 2. Who and what

- **Five players**, the host among them (the 5-player row of GDD 3.1: Killer, Detective, Doctor and
  two Townsfolk). A sixth person would change the roster and the win rule (GDD 3.8, 3.9); if a
  sixth friend comes, they watch the host's screen for the first match and swap in for the second,
  and the scorecard notes the swap.
- At least one player on a phone, so the form's device question has both answers.
- Two M3 sessions on different days (ROADMAP 7.1, the Playtest column). The decision line is
  signed after the second one.
- The host plays, reads the script, keeps the time and fills the scorecard between matches. Nobody
  else needs to read anything before the session.

## 3. Session plan

Clock times from the start of the call. The matches are the only part that can run long; protect
the form and the debrief at the end even if that means fewer matches.

| From | Step | Who |
|---|---|---|
| -0:30 | Prerequisites 2 to 7 checked again; `/health` answers; logs tab open | Host |
| 0:00 | Everyone in Discord voice; sound check; the Pages link pasted in the text channel | All |
| 0:05 | Host creates the party and pastes the invite link; everyone joins and types a name | All |
| 0:10 | The script, part A (rules and controls) | Host |
| 0:15 | Match 1 | All |
| after each match | The script, part B (between matches); the match-log line copied; scorecard row filled | Host |
| | Match 2, then match 3 | All |
| after match 3 | The form link pasted; everyone fills it before talking | All |
| then | Debrief, the script part C | Host |
| end | Scorecard totals; notes file committed within a day | Host |

The time a match takes in play is set by the phases in GDD 3.3 (`balance.json` `phases`) and the
5-player row of GDD 3.9; a cycle and the length of a typical match are given there. Plan for about
an hour of play for the three matches, plus the meeting screen and lobby between them.

## 4. The match log

At game over the server prints one JSON line to stdout (Session K, `services/MatchLog.ts`; ROADMAP
7.5): the players, the match duration, the winner, the kills, the meetings, whether each ejection
was correct, the vote accuracy of each meeting, and the clues collected by each player. In the
Railway logs it is the only line of a match that holds all of these; search the logs for the
`winner` key. Paste the whole line into the session notes under the match it belongs to, and copy
the duration, winner and per-meeting vote accuracy into the scorecard. The field names are the
ones `MatchLog.ts` writes; if they differ from the words here, the line wins and the notes say so.

## 5. The host's script

Read it aloud. Words in brackets are for the host only.

### Part A, before match 1

> Thanks for coming. This is Who Did It, a hidden-role game in a village called Hollowmere. It is
> an early build: the art is half done, things will break, and that is what we are here to find.
>
> Everyone gets a secret role card. One of you is the **Killer**. The rest are the village: a
> **Detective**, a **Doctor**, and **Townsfolk**. Keep your card to yourself: no streaming, no
> screen sharing, no showing the person next to you.
>
> **Controls.** WASD or the arrows to walk, Space to run, Shift to sneak. E uses whatever is in
> front of you: a door, a clue, a body, the bell. Q is your first ability on the card, R and F the
> next ones. N opens your Notebook, Tab your role card. On a phone: the stick on the left, and the
> buttons on the right are Use, Act, Run and Sneak. Some rows on your card are not built yet; if a
> key does nothing, that is why.
>
> **The Killer** kills with Q when nobody is looking, and the knife has a cooldown. A kill leaves a
> body where it happened, footprints that show the killer's height, and a thread that shows their
> scarf colour. The Killer also looks bloody for a while, but only up close.
>
> **Everyone else** hunts clues: hold E on a clue to put it in your Notebook. The Detective's clues
> are marked Verified; anyone else's are Claimed, so you have to trust them. The Doctor can bandage
> someone with Q, and that person survives the next attack on them.
>
> **Meetings.** Find a body and press E to report it, or ring the bell on the square with E. Everyone
> is pulled to the square. The bell has a limited number of pulls per person, and Townsfolk get an
> extra one. You talk, then vote for someone or Skip. Votes are secret until the
> reveal. Most votes is out, and their role is shown. A tie or a Skip means nobody goes.
>
> **Dying.** If you are killed, you are a ghost. Nobody knows until the next meeting, so don't say
> it. You can walk around and see everyone's role, and chat with the other ghosts, but you cannot
> vote or talk to the living.
>
> **Winning.** The village wins when the Killer is voted out. The Killer wins when only one
> villager is left alive.
>
> **Discord.** Mics off while you are walking around. Mics on during a meeting, as soon as the
> meeting screen opens, and off again when you are back in the village. Ghosts stay muted until the
> game-over screen. Don't react out loud to anything you see on screen outside a meeting.
>
> We play three matches. After the last one there is a short form; please fill it in before we
> talk, so we don't steer each other. Any questions? Press Ready.

[The host presses Start when all five are Ready. If someone is not Ready the confirm dialog lists
them; wait for them.]

### Part B, between matches

[As the game-over screen counts down to the lobby: note the end time. In the Railway logs copy the
match-log line. Fill the scorecard row: length, winner, why, vote accuracy. Then say:]

> That was match {n}. Quick round, ten seconds each, no spoilers about strategy: what was the moment
> you remember? [Write one line per person in the notes.] Press Ready when you are back.

[The lobby keeps the same code and seats (A30); roles are dealt again at Start.]

### Part C, the debrief (after the form)

> Thanks. Five questions, then we're done.
>
> 1. When did you first know what you were supposed to do?
> 2. Was there a meeting where you felt you had nothing to go on?
> 3. Did the clues ever point at the right person? Did you read them in the world or in the
>    Notebook?
> 4. Killers: did you ever feel you had no chance to strike, or that it was too easy?
> 5. If we played again tomorrow, would you come? What would make you bring a friend?

[Write the answers as quotes where you can. Don't defend the game; ask "what made you feel that?"]

## 6. When something goes wrong

- **A player drops during a match.** In M3 they become a ghost at once, with no body and no way
  back (GDD 3.8, A30). Let the match finish. On the scorecard mark it **void (drop)**; they rejoin
  the lobby with the same link before the next match.
- **The server stops or restarts.** Everyone is sent back to the landing. Note the time and the
  last thing that happened, copy the log lines around it, mark the match **void (crash)**, create a
  new party and continue. Two crashes in a session: stop playing, run the form and the debrief.
- **A bug that doesn't stop play** (a wrong prompt, a sprite in a wall, a line that makes no sense).
  Say "bug" in voice; the host writes the time and one line; play on. A screenshot after the match
  is welcome.
- **A match runs past the time target.** M3 has no Final Night (it is M4, A30), so nothing forces an
  end. Let it play to a win unless the group agrees to stop; a stopped match has no winner and fails
  the timing line. Either way write down when it stopped feeling like a game.
- **Someone breaks the Discord rule.** No penalty; mark the match "voice leak" in the notes, since
  it bends vote accuracy.

A void match doesn't count for or against the exit test; the next three valid matches in a row do.
If the session runs out of time first, the scorecard says so and the second session repeats the
test.

## 7. After the session

Within a day: copy `TEMPLATE.md` to the dated notes file and fill it, copy `SCORECARD.md` to its
dated copy and fill it, export the form responses into the notes (a summary, not names), and commit
both on a branch with a pull request. After the second M3 session the owner signs the decision line
and records the decision as a row in `docs/DECISIONS.md`; ROADMAP 7.6 tags the milestone exit.
