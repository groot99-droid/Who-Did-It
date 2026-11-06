# Story mode: the owner's questionnaire

Written 2026-11-06 after #463 merged (four chapters on HollowMere). Every question has a proposed default and says
where the answer lands. A default holds until you answer. Mark each **Yes**, **No** or write your own.

## A. What shipped, to confirm

**A1. Chapter 3 is the Bandit, the outlaw.** The Killer card with the `bandit` heist vendetta; the strongbox crack is
the chapter's turn (DECISIONS A430).

- Default: yes.

**A2. Chapter 4 is the Activist.** The Killer card with the `activist` sabotage vendetta, on day 3. Chosen because it
needs no second card and no train timing.

- Default: yes. Alternatives: the Zealot (needs a Vicar dealt) or the Hitman (arrives on days 3 to 5).

**A3. Four chapters, in this order.** Baker, Watchman, Bandit, Activist. Chapters play in order; a finished chapter can
be replayed from the menu.

- Default: yes.

**A4. The chapter looks.** The Bandit walks as the `drifter` look and the Activist as the `tinner` look, whatever the
Killer card's own look is.

- Default: yes. The alternative is the Killer's own look in both.

## B. Rules to settle

**B1. A dead player.** A death inside a chapter ends it as failed, shows the failed line, and the next chapter still
starts, so a story is always finishable.

- Default: keep. Alternative: a failed chapter replays once before the story moves on.

**B2. Pausing.** The world pauses only while a story card is up (there is no second human to wrong). Multiplayer never
pauses (rolecards Q-D2).

- Default: keep.

**B3. Saving.** None. A story is one sitting of about 25 minutes of play; leaving ends it.

- Default: keep. Alternative: save at each chapter break and resume from the menu.

**B4. The handover moves the card, not the seat** (DECISIONS A415). The player keeps their seat, purse, body and
position across a break; the card, kit, look and traits change hands.

- Default: keep. Alternative: the player walks to the new role's seat and position, which needs more engine work.

**B5. The story's end.** After chapter 4 the room ends as a Village win.

- Default: keep. Alternative: an end screen of its own, with the four chapters' summaries.

## C. Content and scope

**C1. A fifth Killer chapter.** The Zealot (the Skin-Walk, needs a Vicar) or the Hitman (the contract, arrives days 3 to
5).

- Default: no, until chapters 3 and 4 have been played through.

**C2. A heist-man chapter on the Thief card.** The Thief card is never dealt in a story room today, so the Thief-targeted
NPC beats in chapters 1 and 2 do nothing. A heist-man chapter needs the deal fixed first.

- Default: later, as its own task. Say if chapters 1 and 2 should also get their stranger back.

**C3. NPC dialogue.** Beats show narration only; the NPCs speak through the existing talk and lore files.

- Default: keep. Alternative: scripted NPC lines inside beats.

**C4. Other towns.** Port-au-Levain and BlackPine stories (Bible V.1) are out of scope.

- Default: out, until the maps themselves are built.

## D. Process

**D1. Playtest.** Chapters 3 and 4 ask the player to stand still beside a target unseen. No human has played them; the
bot only answers cards. Do you want a playtest before more is built on them?

- Default: yes. Notes go to the session that fixes them.

**D2. Achievements.** Each chapter end emits `story.chapterEnd` for round 10's E1 (achievements on the device), which
is not built.

- Default: leave the hook, build E1 with the rest of round 10 part 2.

**D3. The check I did not run.** `pnpm auto` at 50 ran on the head before the Killer chapters, and the full server and
client suites did not run locally (CI ran them green on the merge).

- Default: run `pnpm auto` at 50 once more on the base, after the next batch.

**D4. Production.** The base deploys to Railway on every push, so story mode is live.

- Default: leave it live. Alternative: hide the title screen's Story entry behind a flag until the playtest.
