# Round 8 addendum: the teardown answers (8L, 8M, 8N, 6Z)

The UDGT teardown of Who Did It (ROSW `teardowns/who-did-it/`, merged with #118 at 072b414; the `udgt-consult` skill
answers "why is it like this" from it) proposed changes in four areas. The owner chose among them on 2026-10-23
(DECISIONS A168). This file is the contract for that work. Rules and numbers stay in `docs/GDD.md` and
`packages/content/data`; this file points at them.

**The owner's answers** (A168): every anti-cheat fix proposed; the canon pass waits until the lore merges; matches
of 20 to 25 minutes, a Final Night that is a short hunt then a trial, card text generated from the data; an intent
brief per round, playtest write-ups, V2 relabelled as the sequel "Who Did It Too?", and the build order below. The
owner added one request, verbatim: "I also want art made for all icons, statues, etc, so when a player is three
tiles of someone bleeding it doesn't say bleeding there is a dagger partially stabbed in a white background with
red and around it and seemingly dripping. These little details make the design."

**Left alone** (owner): paper or glass for the role card, HUD and notebook (A110).

## 1. Anti-cheat (8L)

"Full anti-cheat" (teardown chapter 4). What a client receives is what it may know; the client never hides a secret
the server sent.

1. **Blood by range.** The `bloody` status bit (`sim/Movement.ts` publishPresence) reaches only viewers within
   `clues.blood.params.visibleTiles` of the bloodied seat, and the dead. The client's own 3-tile check
   (`view/EntityView.ts`, `BLOOD_SIGHT_PX`) stays as a second guard and reads the same number.
2. **Night sight on the server.** At night, in every scene (not only the `"dark": true` ones), a living viewer
   receives only the avatars inside its night radius and its light (`sim/Sight.ts` `canSee`, the numbers GDD 3.7
   and 3.15 already hold). Day stays as now. Ghosts see everything, as now.
3. **The leak test.** `invariants.test.ts` gains a per-message check: across a seeded match, no message to a seat
   carries another seat's card, cover, private view, cooldowns, or a status bit or avatar that seat could not see
   under 1 and 2. 6Z grants the edit in the PR.
4. **Replay.** `MatchLog` records the match seed and the build id, so a logged match can be replayed.
5. **Vote delay.** A vote cast before `meeting.minVoteS` (new, in `balance.json`; GDD 3.8) is refused with a
   reason, so a pre-agreed instant vote cannot land before anyone has spoken. `meeting.voteOpensImmediately`
   gives way to it.

## 2. Rules (8M)

1. **Match length.** GDD 2, 3.3 and the soak target in 3.9 say 20 to 25 minutes (the owner is happy with that
   length). The `phases` numbers move only if the soak shows they must; the soak target changes with the text.
2. **The Final Night: a short hunt, then the trial.** `finalNight.huntS` (90 s today) drops to about 45 s; then a final
   discussion and vote under its own key `finalNight.trialS`, longer than an ordinary meeting. GDD 3.3 and 3.12
   change in the same PR, with the auto soak.
3. **Card text from the data.** A role's `cardText`, `beware` and `win` read their numbers from the data (for
   example "Blood shows within 3 tiles" from `clues.blood.params.visibleTiles`). First a drift test that fails on
   every hand-typed number that disagrees with the data, then the generation: a template token per number, filled
   at load, so the shipped text stays word for word.

## 3. Icons (8N)

Every status the game shows gets drawn art instead of a word: the eleven effects (`EffectId`: slowed, wounded,
bleeding, weakened, poisoned, fatigued, stunned, dazed, famished, knocked out, indebted), the public status marks
(bloodied, down, the moods inspect can show), and then every other icon the HUD and panels still show as text or a
placeholder. The owner's example sets the style: bleeding is a dagger half driven into a white ground, red around it,
dripping. One small square, readable at HUD size, in the palette, in all three art styles (8-bit, low poly, HD).

- 8N surveys the icons first and sends 6Z a list and a sheet of five or six of them for the owner's look before
  drawing the rest.
- The HUD and panel icons are DOM images: one file per icon and art style, beside the SPRITES 9 SVGs, found through
  8N's `effectIconUrl` helper. There is no new UI atlas. The mark over a figure is a frame in the existing `vfx`
  atlas. The "white" of the owner's example is the palette's bone, `#FFF1DC`. All of it is drawn by the studio
  pipeline or Blender like the rest of round 8's art (ASSETS 6.5). The textual name stays as the accessible label.
- 8A's body HUD draws the effect row and calls the helper; 8N ships the icons and the helper.
- The bloodied mark over a figure (`PlayerView.setBlood`) shows the bleeding icon above the figure as well as the
  blood overlay.

## 4. The canon pass (later)

The game text still names the 1931 harbour (the `hollowmere` blurb "harbour hamlet" and `theme: "harbour"`,
"Harbourmaster Pell" in `quests.json`, the Thief's "cave sea exit", the 1931 kit in the `crumb_*` rooms). The lore
of the Narrative WorldBuilding session (ROSW `claude/sharp-mccarthy-pqi3ws`, `creative-writing/vault/`,
`project: who-did-it`) is canon, the owner says, "as long as it doesn't break features without creating a good
working solution", and it sets the year (1893 today). When that branch merges, one session renames names and text in
one pass. Ids stay frozen (GDD 3.13). A rename that would break a feature lands with its working fix.

## 5. Process (6Z)

- **Intent brief.** Every round's contract opens with three lines: what the round should feel like, what the owner
  likes, and what it must never do. The quick mode was lost for want of one. Port-au-Levain's round starts with its
  brief: a map like HollowMere and BlackPine.
- **Playtests.** The owner's five past playtests are written up in `docs/PLAYTESTS/`, one file each from
  `TEMPLATE.md` (the folder's README is the run sheet), from the owner's own account. Later playtests follow the same
  template.
- **V2 is the sequel "Who Did It Too?".** First person will never be this game (owner). The docs say so; the frozen
  ids and the shared server stay.
- **Build order for R8 and R9.** Town moods, then the law, then evolutions and vendetta dilemmas, then the economy,
  then Port-au-Levain, then story mode. The owner rates them "all equally", so the order is sequencing, not
  priority. Round 8 already carries the moods and the economy.

## 6. Sessions, ids and grants

| Session | Model | Branch | Owns | Decision row |
|---|---|---|---|---|
| 8L. Anti-cheat | Opus 5.5 | `claude/r8-anticheat` | 1 | A170 |
| 8M. Rules | Opus 5.5 | `claude/r8-rules` | 2 | A171 |
| 8N. Icons | Fable 5.1 | `claude/r8-icons` | 3 | A172 |

A second row takes the number plus 20. The rules of SESSIONS Round 8 hold: draft PRs under 400 lines, GDD in the
same PR as a behaviour change, no edit to an existing server test without 6Z's grant, and 6Z merges.

**Seams.**
- 8L's sight change and 8E's townsfolk, 8A's status bits and 8B's inspect all go through `publishPresence` and
  `canSee`. 8L takes the filter, and the others keep calling those functions as they do now.
- 8M's Final Night touches the phase machine that 8D's curfew reads. 8M emits the existing phase events unchanged.
- 8N's icons are DOM files and one `vfx` frame. 8H's helpers animate the elements that show them; 8N adds no
  motion of its own.
