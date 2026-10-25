# Round 9 (9A): world mode

This is the core loop of world mode: who is dealt what, how each role wins, how the Killer is stopped, how the
Killer hides, what replaces voting, the train that brings the day's dead back, the pacing, effects that no longer
kill, and the art-style lock. The full-screen pauses that replace the meeting are in `phases.md`.

**Status.** Design only (owner, 2026-10-24). Nothing here is built, and until the round-9 GDD PR lands, `GDD.md`
and `balance.json` stand. Every number below is a proposal. Each claim about today's game cites a GDD section or a
file and line at `88453d9`.

**Sources.**

- The owner's words: `owner-brief.md`, quoted verbatim where a rule rests on them.
- The plan: `README.md` (round 9).
- The lore:
  - The Bible: `docs/round6/owner-brief.md` 2, cited as "Bible I.5" and so on.
  - The Codex: ROSW `creative-writing/vault/05_Worldbuilding/05_Codex_of_the_End_of_the_Line.md` at `55e6c64`.
  - The canon pass: `docs/round8/canon.md`.
- The teardown: ROSW `teardowns/who-did-it`, through `udgt-consult`. `udgt check` reports it stale: it was scanned
  at `dfc94f9`, and the game is now at `88453d9`. So every reference below was re-read in this repo.

**Terms.**

| Term | Meaning |
|---|---|
| Roster | Every lore role of the map. All of them are dealt in every world-mode match. |
| Human seat | A seat held by a person. |
| NPC seat | A seat the server plays (GDD 3.12). |
| Worn card | The NPC card the Killer chooses to live as. Nobody else holds it. |
| On the line | A seat that died by day and waits for the next morning's train. |
| Stopped | The Killer can no longer win: convicted, killed for good, or its vendetta foiled. |

## 1. The deal

### 1.1 What the code does today

| Today | Where |
|---|---|
| The deck holds the player count plus 2 cards, and 2 non-Killer cards stay undealt | `packages/shared/src/rules/deck.ts:19-39`; GDD 3.1 |
| Cover roles wear an undealt card, and the hints are matched without a draw | `deck.ts:50-75`; GDD 3.17 |
| The deal is random over every seat, so an NPC can hold the Killer | `apps/server/src/sim/Deck.ts:40-65`; GDD 3.12 "Same game" |
| The party size is clamped to 4-10 before the deck row is read | `Deck.ts:12-15`, `vendettas/state.ts:27` |
| Each Killer draws 1 vendetta among the eligible rows. The only pairing is the Zealot's `needsCard: "vicar"` | `vendettas/state.ts:25-54`; `vendettas.json` |
| Traits are a unique triple from 27 combinations | GDD 3.1 |
| The 10-seat deck deals 2 Killers | `roles.json` `decks["10"]`; GDD 3.9 |

### 1.2 The roster

"All the roles have to be dealt", and "I'm trying to build a world with all the roles in the lore" (owner). So in
world mode the deck is the map's roster, not a row of `roles.json` `decks` keyed by party size. The table lists
HollowMere's roster, taken from the Codex ("The Rest of the Town", "The Trades", "Town superstitions") and from Bible
I.5 to I.7.

| Role | Faction | Lore | Card today | World mode |
|---|---|---|---|---|
| Killer (one vendetta) | Cabal | Codex, The Four Vendettas | `killer` (cover, no world character) | Always a human (1.3) |
| Accomplice | Cabal | Codex, superstitions ("never holds the knife, only the alibi") | `accomplice` (cover) | NPC, or a human from 6 humans up |
| Drifter | Neutral | Codex ("wants to be chosen for it") | `drifter` (cover) | NPC, or any human |
| Detective (then Police Officer, then Judge) | Village | Bible I.6; Codex, The Three Ladders | `detective` | Human while one is free (1.3) |
| Doctor | Village | Codex | `doctor` | Any |
| Vicar | Village | Bible I.5; Codex | `vicar` | Human when the Zealot is drawn |
| Watchman | Village | Codex | `watchman` | Any |
| Herbalist | Village | Codex | `herbalist` | Any |
| Gamekeeper | Village | Codex | `gamekeeper` | Any |
| Lamplighter, Baker, Fisher, Tinner | Village | Codex; Bible I.7 (Baker) | professions, `plays: townsfolk` | Any |
| Butler, Child | Village | Codex | cards with no look, held back until M4 (GDD 3.1) | Any, once they ship |
| Postmaster | Village (two roads) | Bible I.7; Codex, The Trades | none | Human when the Hitman is drawn; needs a card |
| Undertaker | Village (two roads) | Bible I.7; Codex | none | Any; needs a card |
| Bartender | Village (two roads) | Bible I.7; Codex | none | Human when the Bandit is drawn; needs a card |
| Company Clerk | Village (two roads) | Bible I.7; Codex | none | Human when the Activist is drawn; needs a card |
| Ranger, Thief, Medium | Village, Neutral, Village | Codex ("the town is waiting for others") | V1.5, V1.5 and V2 cards (GDD 3.1) | Any, once they ship |

The roster has 22 roles, and 13 of them have a card and a look today (`looks.json`). Three limits shape it:

- **Traits.** There are 27 trait triples (GDD 3.1), so a roster never exceeds 27 seats.
- **The trades.** The four trades need `roles.json` and `looks.json` rows, art and abilities before they can be dealt.
  They are also the partners of three vendettas (1.3). Until they ship, 1.3 gives an interim partner from today's
  cards.
- **Load.** An NPC seat is a full sim seat (GDD 3.12). A 15 to 22 seat room is a soak-test item for the build plan
  (`gdd-map.md`).

**One Killer.** World mode deals exactly one Killer card, with one vendetta, whatever the human count. The 10-seat
deck's second Killer existed because of parity at 10 seats (GDD 3.9), and world mode drops parity as a win (2).

### 1.3 Who must be human

The owner's rules, verbatim:

- "on multiplayer the role of killer must always be given to a player since they have vendettas and actions that
  must be achieved for victory";
- "you must also assign the player who is required for example: Zealot(human) must always have a Vicar(human), this
  makes the gameplay a minimum of 3 players for the zealot, activist, bandit, and even more for the Hitman".

A Zealot and a Vicar are only 2. The owner's minimum of 3 means one more human is needed. **9A reads the third human
as the law: the Detective.** The evidence-and-arrest route (3) runs through the Detective's ladder (Bible I.6). With
an NPC Detective, a 2-human match would be a duel that NPCs judge. This reading is open question 2.

| Vendetta | Partner the lore pairs it with (must be human) | Why that partner | The law (human) | Extra | Minimum humans |
|---|---|---|---|---|---|
| Zealot (conversion) | Vicar | The Zealot hunts the Vicar and Skin-Walks in his robes (Bible I.5 I; Codex, Conversion) | Detective | none | **3** |
| Activist (sabotage) | Company Clerk | The Baron's man: protects the Baron when he comes by train and becomes the Baron's Heir (Bible I.5 II, I.7) | Detective | none | **3** |
| Bandit (heist) | Bartender | The Vigilante: "if they gun down the Bandit, they claim the bounty" (Bible I.7) | Detective (the Police must cuff him, Bible I.5 III) | none | **3** |
| Hitman (contract) | Postmaster | Carries the black-wax letter, and can steam it open (the Handler road, Bible I.5 IV, I.7) | Detective | The mark: a human who is not the Postmaster or the Detective | **4** |

**The Hitman's 4th human.** A contract on an NPC is no contest, so the mark must be a human. The mark is never the
Postmaster, who would read his own death warrant, and never the Detective, so the case and the mark stay in
different hands. That makes "even more for the Hitman" exactly 4.

**Interim partners, until the trades ship** (built cards only):

| Vendetta | Interim partner | Reason |
|---|---|---|
| Zealot | Vicar | Already built. `needsCard: "vicar"` is the seam (`vendettas.json`) |
| Activist | Watchman | Stands at one door each night (Keep Watch), so he is the one who can guard the Baron |
| Bandit | Gamekeeper | The only other gun (`fowlingPiece`): the Vigilante's stand-in |
| Hitman | none | The mail arrives without a Postmaster (GDD 3.20, `train.arrive`). The minimum is then 3: Hitman, Detective and the mark |

### 1.4 The deal order

The deal runs at Start, before the role card, on the `deal` stream (`sim/seeds.ts`). The vendetta draw stays on the
`vendetta` stream keyed by seat (GDD 3.20).

| Step | What happens | Draws |
|---|---|---|
| 1 | Count the humans, H. With H = 1 it is story mode (9), not this deal | none |
| 2 | One human is dealt the Killer card | `deal` |
| 3 | The Killer draws one vendetta among the rows whose minimum is at most H and whose map rule holds (`maps`, `needsScene`, as today) | `vendetta:<seat>` |
| 4 | That vendetta's partners go to humans (1.3) | `deal` |
| 5 | The Detective goes to a human, if one is left | `deal` |
| 6 | Each remaining human gets a random roster card, except the Accomplice below 6 humans | `deal` |
| 7 | The Killer picks, on the role card, which NPC-held card to wear (4) | none (a choice) |
| 8 | An NPC seat is created for every card still unheld except the worn one. NPC names come from `npcNames`, as today | `npcNames` |

| Humans | What the deal allows |
|---|---|
| 1 | Story mode (9) |
| 2 | No vendetta has its partners. The Killer is dealt with no vendetta and plays the plain Killer (open question 3) |
| 3 | Zealot, Activist, Bandit (and, before the Postmaster ships, Hitman) |
| 4-10 | All four vendettas |
| 6-10 | A human may also be dealt the Accomplice |

**Why the Accomplice waits for 6 humans.** A human Accomplice takes one human away from the village side. Below 6
humans, a human Accomplice beside the Killer would leave at most 3 humans on the village side.

`players.max` stays 10 humans. The room's seat count becomes the roster size minus the worn card (8). That count is
the same in every match of a map: the Bandit (4) is the one exception, and its look is public anyway (4.2).

## 2. How each role wins

There is no parity win and no faction tally. Each seat wins on its own conditions, and the end screen lists every
seat that won, each with the kind of victory (`phases.md` 7). The old wins were "Village: all Cabal dead or ejected,
tasks at 100%, or a Final Night ejection" and "Cabal: parity, or a failed Final Night vote" (GDD 3.8, `Win.ts:16-23`).
In world mode they become the routes of 3 and the Killer's own vendetta win.

A **lore** cell quotes or cites the Bible or the Codex. A **9A** cell is proposed here, where the lore gives no
condition.

| Role | Wins when | Victory kind | Source |
|---|---|---|---|
| Zealot | Founding a Following: sigils on 5 key buildings, 6 followers at the Deep Cave Altar or the desecrated chapel, then a 15 s Dark Mass at the altar | Vendetta: Following | lore (Bible I.5 I; Codex, Conversion) |
| Activist | Workplace Disarray (1 to 3 acts), Public Unrest, the Baron killed when he comes by train, and then she survives the Redemption trial. She then becomes plain Townsfolk | Vendetta: Redemption | lore (Bible I.5 II). The "Emergency Town Vote" becomes the evidence trial (5) |
| Bandit | Robs the bakery (leaving a coin tip), the chapel plate and the bank vault, then robs the train's express safe and rides out | Vendetta: Getaway | lore (Bible I.5 III; Codex, Heist) |
| Hitman | Kills the mark, then boards the next train out | Vendetta: Contract | lore (Bible I.5 IV). Dealt at the start, not mailed to a townsman (4.4) |
| Any Killer, not stopped | Reaches the end trial (6) unconvicted, with the vendetta unfinished | Unseen (a lesser victory) | 9A, from today's "the Final Night vote fails" (GDD 3.8) |
| Accomplice | The Killer wins in any way | Shares the Killer's kind | GDD 3.2 ("As Killer") |
| Drifter | Is convicted to death at a trial | Gallows | lore (Codex, "wants to be chosen for it"); was "get ejected" (GDD 3.2) |
| Detective, Police Officer, Judge | Stops the Killer by arrest and conviction (route 1) | Law | lore (Bible I.6) |
| Vicar | Converts every living seat to the faith | Peaceful | lore (Bible I.5 I) |
| Vicar (martyr) | Dies by the Knife. The match's win is unchanged, and the room's next match offers the Ascended Vicar | none (memorial) | GDD 3.20; Bible I.5 I |
| Doctor | Every body of the match autopsied, and no seat lost for good to a bleed or poison that she was in reach to treat | Healer | 9A ("Keep people alive and read the dead") |
| Watchman | His watch holds against the Knife at least once (GDD 3.2 "Your watch held") | Watch | 9A |
| Herbalist | Nightshade takes the Killer or the Accomplice ("be right") | Role (route 2) | 9A, from the card goal |
| Gamekeeper | The Last Shot takes the Killer ("take the right one with you") | Role (route 2) | 9A, from the card goal |
| Lamplighter | Every square lantern lit at every dusk of the match | Trade | 9A, from the card text |
| Baker | Default: the Wake Loaves baked every morning. The Fence road shares the Bandit's win. The Ration Tyrant road holds the town's flour | Trade, or the Bandit's | lore (Bible I.7) for the roads; 9A for the default |
| Postmaster | Steams open the contract and burns it, which foils the Hitman. The Handler road shares the Hitman's win. The Extortionist road wins its blackmail | Role (route 2), or the Hitman's | lore (Bible I.7) |
| Undertaker | The Chief Coroner delivers 2 unlooted bodies to the law. The Grave Robber road shares the Zealot's win | Trade, or the Zealot's | lore (Bible I.7) |
| Bartender | The Vigilante guns down the Bandit | Bounty (route 2) | lore (Bible I.7) |
| Company Clerk | The Baron's Heir: the Baron is protected until nightfall, which foils the Activist. The Embezzler road leaves on the train with the briefcase | Role (route 2), or Getaway | lore (Bible I.7) |
| Fisher, Tinner, Butler, Child | The town's work is done (the task bar is full) before the end trial | Town | 9A, from today's task-bar win (GDD 3.5) |
| Thief | Escapes by the sea door at the back of the cave holding 3 Heirlooms | Solo | GDD 3.2 (as worded in canon.md K4) |
| Ranger | His one arrest is convicted | Law | GDD 3.2 ("make your arrest count") |
| Medium | Every ghost's phrase heard at a seance | Trade | 9A |

**A lore road needs evolutions.** The Fence, the Handler, the Grave Robber, the Vigilante and the other roads are
evolutions (Bible I.7). `evolutions.json` is the seam, and it is still empty (`{ "evolutions": {} }`). Those rows
belong to the trades' build PRs, so world mode's first build deals the default win of each trade.

**The task bar** still fills from every seat's chores (GDD 3.5). A full bar is no longer a match win. It is the
**Town** victory of route 2, and it stops the Killer only if it fills before the Killer's vendetta completes
(3, route 2).

## 3. Stopping the Killer

The owner, verbatim: "All 3 can stop the killer and give the person who stopped them one of their types of
victories".

| Route | How | Who earns it | Victory |
|---|---|---|---|
| **1. Evidence and arrest** | The Detective verifies enough clues against one suspect to stamp the case file and becomes the Police Officer (`GameState.lawStage` 0 to 1, a seam since round 6). The Officer cuffs the suspect and brings him to the bell, which opens a **Tribunal** (`phases.md` 4). The verdict is computed from the evidence (5). A death sentence on the Killer stops it | The seat that made the arrest. Every seat whose Verified entry the verdict counted shares it | Law |
| **2. Role goals** | A role goal that foils the vendetta: the Vicar converts everyone before the Zealot's Mass; the Clerk keeps the Baron alive until nightfall; the Bartender guns down the Bandit; the Postmaster burns the contract; Nightshade or the Last Shot takes the Killer; the task bar fills first | The seat whose goal did it (for the task bar: every seat that finished a chore) | That role's kind (Peaceful, Heir, Bounty, Dead Letter, Role, Town) |
| **3. The end trial** | After the Final Night hunt, the **end trial** (`phases.md` 5) tries every filed case, strongest first. A conviction of the Killer stops it. With no case strong enough, the Killer is Unseen (2) | The seat that filed the convicting case | Verdict |

Rules that hold for all three routes:

- **No votes.** Nobody casts a vote anywhere in world mode. A verdict comes from the Case Board, which the server
  already scores (GDD 3.4 "Case Board": the suspect set is built from Verified traits).
- **The first stop counts.** Once one route stops the Killer, the Killer cannot win, and the other routes still
  award their victories to the seats that also met them.
- **The match ends** when the Killer is stopped and every open personal goal is settled, or at the end of the end
  trial, whichever comes first.
- **Stopped is not always dead.** A Killer convicted to a Heavy Fine is not stopped: Bible I.6 says the fine "resets
  their active heist/sabotage checklist without killing them". Only a death sentence, a death after dark or a foiled
  vendetta stops the Killer.

## 4. Disguises

The owner, verbatim: "The killers get to chose which NPC role to fill, they get disguised as that character, they
have to perform life as a villager, unless your the bandit they wear their own skin because they are fundamentally
different. Killers should also have their own looks when they look at their screen vs when everyone else sees
them."

### 4.1 The Killer's pick

Today a cover role picks among the undealt cards and may wear a dealt one, which doubles a look (GDD 3.17, "The cover
pick"; `deck.ts:50`). World mode keeps the mechanism and changes what is offered:

- **What is offered.** On the role card, the Killer's picker lists every card the deal gave an NPC (1.4 step 6),
  apart from two kinds: its vendetta's partners and the Detective, which are human, and the Accomplice and the Drifter.
  The first hint is the deal's next undealt-order card, as `coverHints` picks it today.
- **Withdrawing the NPC.** The picked card is withdrawn: no NPC seat is created for it (1.4 step 8). So no two
  figures ever share a look, and the "counter-claim" duplicate of GDD 3.17 cannot happen.
- **Living the life.** The Killer takes the worn card's life:
  - its home and favourite stations (GDD 3.12 Persona);
  - its daily chores and wage (GDD 3.5, 3.23);
  - its quests (GDD 3.16).
  It does not get the worn card's powers. A Killer living as the Vicar hears no confessions, as today ("The look is a
  claim, not a power", GDD 3.17).
- **Timing.** The pick closes with the card, and a Killer that never picks wears its first hint, as today.
  `phases.roleRevealS` grows to 30 s (7), because the list is longer.
- **The Accomplice and the Drifter.** Both stay cover roles and pick the same way, from what the Killer left. The
  Accomplice sees the Killer's pick live, as Cabal mates do today. If either is an NPC, it wears its first hint
  (GDD 3.2 "NPC night powers").

### 4.2 The Bandit wears his own skin

The Bandit does not live as a villager. He is dealt the Killer card like any vendetta, but his public look is a new
`bandit` character: the bandana, the long coat, the six-shooter (Codex, Heist). It is drawn in the 8 directions like
any look, at the seat's height and scarf.

- **No worn card.** No card is withdrawn for the Bandit, so a Bandit match has one more seat than any other match on
  the map. That tells the table "a Bandit rides this week", which the figure on the street tells anyway. It tells
  nothing about the Zealot, the Activist or the Hitman, whose matches all have the same count.
- **Outlaw Anonymity** (Bible I.5 III): "no one knows the face behind the bandana until he is in irons". This needs
  the nameplate rule of 4.3.

### 4.3 Nameplates in world mode (needed by 4.2)

Today a figure's nameplate shows its seat's name (GDD 3.17). A human's name is known from the lobby, so a Bandit
whose figure carries his name is not anonymous. A name that appears nowhere on a figure would give him away by
elimination too.

**Proposed.** In world mode a figure's nameplate shows its character, never its seat's name:

- the lore name where there is one ("Tamsin Crumb, the Baker"; Codex, Named townsfolk), else the card's name ("the
  Watchman");
- "the Bandit" for the Bandit.

The party list keeps player names. The roster in the pauses shows characters (portrait and character name), and only
the end screen pairs each character with its seat's name. This is open question 4: it changes how friends find each
other.

### 4.4 Your own look on your own screen

The Killer's client draws the Killer's own figure in a **true look**: the vendetta's own character (`zealot`,
`activist`, `hitman`; the Bandit's true look is his public one). Every other client draws the worn card's look. A
small badge on the Killer's own HUD shows the look everyone else sees.

GDD 3.17 says "You see yourself in the borrowed look"; this replaces it. Impersonate (GDD 3.17) keeps working on top
of the worn look, and the Killer's own screen still shows the true look, with the badge showing the borrowed face.

**The lore's Hitman.** The Hitman is dealt at the start, which departs from the lore: "nobody starts as the Hitman"
(Codex, Contract), where the mail turns a townsman into one. The owner's rule that a human always holds the Killer
wins over that. The lore's version survives as the Postmaster's Handler road (2).

### 4.5 How this fits the secrecy rules

| Rule (CLAUDE.md, "Conventions that must not drift") | How world mode keeps it |
|---|---|
| A seat's public look is its card's character, except the cover roles, which wear another card's look | The Killer, the Accomplice and the Drifter are cover roles and wear an NPC-held card. The Bandit's look is his own card's character, so it is not a cover |
| Nothing a client receives may reveal that a seat wears a cover | The worn card's NPC is never created, so no duplicate look and no change in the seat count (4.1). `Player.look` carries the worn look, exactly as a real look is sent |
| ...or a cover-wearer's true role | The true look lives only in the seat's own private view (a new `Private.trueLook`; schema bump). No public field and no avatar carries it |
| What a client loads never depends on its own card (GDD 3.17 "Looks") | Every client loads every true-look atlas of the map's vendettas (`char/zealot/...`, `char/activist/...`, `char/hitman/...`, `char/bandit/...`) with the deck, whatever its card. These are new atlas keys (CLAUDE.md: `char/<lookId>/<anim>/<dir>`), and the cover cards still have no world character |
| ...or who walks under an impersonation beyond what the drawn figure shows | Unchanged: Impersonate draws an avatar like any other (GDD 3.17 "On the wire") |
| Nothing secret shares a random stream with anything public | The pick draws nothing. The deal's human-first steps use `deal`, and NPC names keep `npcNames` (1.4) |
| Debug handlers only with `WDI_DEBUG=1` | Unchanged. `debug.deal` (`Deck.ts:23`) must learn the human-first rule |

## 5. What replaces voting

Every vote today, where it lives, and what takes its place:

| Today | Where | World mode |
|---|---|---|
| Meetings end in a vote, a tally and an ejection | `Meeting.ts:92-119` (`handleVote`), `:141-182` (`startReveal`, `resolveVotes`); GDD 3.8 | The meeting becomes the **Inquest** (`phases.md` 3): a discussion and evidence presented to the Case Board. Nobody is ejected. Its finding is the Case Board's suspect set, shown to all |
| The Final Night trial: a forced vote, no Skip, a tie ejects nobody, and the Cabal wins unless a Cabal seat goes | `FinalNight.ts:36-57`; GDD 3.3, 3.8 | The **end trial** (`phases.md` 5) tries every filed case by evidence (below). A conviction of the Killer is route 3; with none, the Killer is Unseen |
| The Zealot's consequence: the Vicar's vote counts for nothing at the next meeting, unseen by others | `vendettas/conversion.ts:139-167`; hooks at `Meeting.ts:117,135,149`; GDD 3.20 | **The Vicar's testimony is doubted.** At the next Inquest or trial, the Vicar's Verified entries (his confessions included) carry no weight in any verdict, and the board shows them like any entry. The Vicar alone learns it in his Notebook, as today. In world mode this is the Zealot's early pressure; his win is the Following (2) |
| The Drifter wins when ejected, and the match goes on | `Deck.ts:67-80` (`EJECTION_WINNER`, `alsoWon`); GDD 3.8 | The Drifter wins when a **trial convicts him to death** (Gallows). He has to get himself arrested or have a case filed against him |
| The Gamekeeper's Last Shot fires on death and on ejection; the NPC aims at its vote target | `LastShot.ts:25-50`, `:79` (the ejected Gamekeeper shoots at the reveal), `:106` (NPC aim at `npcVoteTarget`); GDD 3.2 | It fires on a **permanent** death (after dark) and on a **death sentence** at a trial. A day death goes on the line (6), so it does not fire. The NPC aims at the suspect its own evidence ranks first (below), or holds its fire |
| NPCs vote at a drawn tick, the Killer NPC follows the plurality, and a Cabal confession decides | `npc/meeting.ts:59-99` (`npcVoteTarget`), `:101` (`runMeetingVotes`); GDD 3.12 | **NPCs present evidence instead.** At its drawn tick an NPC posts its best Claimed entry (`meeting.presentPerPlayer`) and its sightings, and an NPC holding a Cabal confession posts it. An NPC Detective files a case. `suspectVoteChance` becomes `presentChance` |
| The anti-stall rules: two no-ejection meetings disable Skip and set a ceil(living/3) threshold; a wrong ejection adds 15 s | `balance.json` `meeting`; GDD 3.8 | Removed. Without ejections there is nothing to stall |

**The verdict, by evidence.** The server scores a case: an accused seat plus the entries presented for it. The
score uses only what the Case Board already knows (GDD 3.4):

- **A match** is a Verified entry whose trait (height, scarf, hat) fits the accused, or a Verified plot trace that
  fits the Killer's vendetta: candlewax for the Zealot, black powder for the Activist, a .45 casing or flour dust for
  the Bandit, a wax seal for the Hitman (Codex, The Four Vendettas; new clue kinds).
- **An exclusion** is a Verified entry that rules the accused out. Forged entries count for nothing.
- **Doubted entries** (the Zealot's consequence above) count for nothing.

| Score | Verdict (Bible I.6) | Effect |
|---|---|---|
| Any exclusion, or fewer than 2 matches | Acquittal | The accused walks, with 30 s of protection from arrest |
| 2 matches | Heavy Fine | Strips the purse and confiscates weapons. A Killer's vendetta checklist resets |
| 3 matches or more, or the suspect set is exactly the accused (GDD 3.4) | Death | The accused is hanged and dies for good |

The thresholds would be new `balance.json` keys: `trial.fineAt` 2 and `trial.deathAt` 3. A Doubted or Forged entry
never counts, so the Accomplice's plants (GDD 3.2) work only until the Detective inspects them, as today.

## 6. The train brings back the day's dead

The owner, verbatim: "The train brings in people who died in the day back the next morning by train".

**The reading.** 9A reads "in the day" as the daylight phases: grace, day and immunity. A death after dark (dusk,
night, the Final Night) is for good. Why:

- the Knife works only after dark (GDD 3.3), so its kills keep their weight;
- the vendettas that need a death (the Vicar, the Baron, the mark) still mean something;
- the Vicar's martyrdom stays possible.

The other reading, "any death of that game day", would undo every kill each morning. That is open question 5.

**What kills by day**, once effects no longer kill (7):

- a creature's bite in a dark scene, the forest or the caves (GDD 3.15);
- a Last Shot fired at a day death of a Gamekeeper (no longer fires, 5);
- the Bandit's six-shooter, once built (Bible I.5 III);
- a disconnect over 60 s ("vanished", GDD 3.8).

Nightshade resolves when the night ends (GDD 3.2), so its death counts as after dark.

**What the returning seat keeps and loses.**

| Thing | On the line | On the train |
|---|---|---|
| Role card, vendetta, cover, worn look, traits | Kept, private | Kept |
| Notebook, quests, achievements | Kept | Kept ("The log on your rack at dawn is who you are", Codex, BlackPine) |
| Inventory | Dropped with the body, as today ("Dropped items", GDD 3.4) | Comes back empty, apart from bound start items (the Knife, the Fowling Piece) |
| Purse | Dropped with the body | Comes back empty, so the coins are a find for whoever reaches the body |
| Health, stamina, effects | none | Arrives at a proposed `respawn.hp` of 50, with no effects and full stamina |
| Cooldowns | Frozen | Resume where they stood |
| View | The **On the line** screen (`phases.md` 6): a dark carriage and the time to the train. No ghost view, no roles, no ghost chat | The world, at the platform |

**Why there is no ghost view while on the line.** Today a ghost sees every role and reads the ghost and Cabal
channels (GDD 3.7, GDD 2 step 9). A seat that comes back must not have seen any of that. So a seat on the line gets
nothing from the world; only a death after dark makes a ghost.

**How it touches everything else.**

| System | Today | With the train |
|---|---|---|
| Bodies | Lie until reported. A report opens a meeting (GDD 3.4) | Unchanged until dawn: a day body can be reported and opens an Inquest. At the train's arrival every day body is gone ("the Undertaker's cart"), and the seat steps off the train |
| Clues | Spawn and decay by kind (GDD 3.4) | Unchanged. A clue outlives its seat's return |
| Public death | `alive` flips at the next meeting (GDD 3.8) | As today, and the dawn screen's manifest (`phases.md` 2) names who came back, which sets `alive` true again |
| Ghosts | Every dead seat is a ghost (GDD 3.7) | Only a death after dark makes a ghost. The ghost task share (`tasks.ghostShareCap`) applies only to ghosts |
| The Vicar's martyr rule | Only a Knife death is a martyr's; a wolf, poison, a shot or an ejection is not (GDD 3.20) | Unchanged. The Knife works only after dark, so a martyr never returns. A Vicar killed by day returns and was never a martyr |
| The Ascended Vicar | The next match's candidate (GDD 3.20) | Unchanged. The lore's Ascended Vicar "steps off the morning train" (Bible I.5 I), which this rule now matches |
| Win counts | Parity counts the living (`Win.ts:16-23`) | There is no parity (2). The Vicar's "every living seat" and any count of the living leave out seats on the line until they arrive |
| Vendettas | A vendetta ends when its seat dies (GDD 3.20) | It ends only on a death after dark. A Hitman's mark killed by a creature by day returns, and the contract stays open. Today it "lapses unpaid" (`contract.ts:113`) |
| Inherit | The Accomplice takes the Knife when the last Killer dies (GDD 3.2) | Only on a death after dark, and only a human Accomplice inherits. Otherwise the human-Killer rule would break (open question 1) |

## 7. Pacing

The owner, verbatim: "days should now last 8 minutes and nights last 5 keep the game play as it was before but
prolong everything".

**The factors:**

| Factor | Value | Applies to |
|---|---|---|
| D | 4 (480/120) | Clocks that run by day |
| N | 3 (300/100) | Clocks that run after dark, and the Knife and night powers |
| C | 3.5 | Clocks that run through the whole cycle. It is the cycle's growth, from 230 s to 810 s (480 + 30 + 300) |
| K | 1 | Kept: a person's own actions (holds, reach, movement, a mini-game step), the pauses ("the same pauses", owner) and the screen |

### 7.1 Every `balance.json` timer and count

Each value is listed old against proposed. Keys that do not change are grouped at the end, with the reason.

| Key | Old | Proposed | Factor | Note |
|---|---|---|---|---|
| `phases.dayS` | 120 | 480 | D | The owner's number |
| `phases.duskS` | 10 | 30 | N | |
| `phases.nightS` | 100 | 300 | N | The owner's number |
| `phases.roleRevealS` | 20 | 30 | none | A longer pick list (4.1) |
| `phases.voteS` | 25 | removed | none | No vote (5) |
| `phases.revealS` | 8 | 8 | K | Now the verdict reveal |
| `phases.gameOverS` | 20 | 30 | none | More winners to list |
| `byCount.*.killCooldownS` | 60 / 60 / 35 / 35 / 30 / 30 / 40 | 180 / 180 / 105 / 105 / 90 / 90 / 120 | N | Keeps the strikes per night of GDD 3.9 |
| `byCount.10.globalKillLockS` | 15 | 45 | N | |
| `byCount.*.tasksEach` | 3 / 3 / 4 / 4 / 4 / 4 / 5 | 12 / 12 / 16 / 16 / 16 / 16 / 20 | D | Keyed by humans in world mode |
| `byCount.*.cabalWin` | the parity rule | removed | none | No parity (2) |
| `finalNight.afterCycle` | 5 | 5 | K | About 70 min of world time. See open question 6 |
| `finalNight.huntS` | 45 | 135 | N | |
| `finalNight.killCooldownS` | 20 | 60 | N | |
| `finalNight.trialS` | 120 | 120 | K | Now the end trial's discussion |
| `finalNight.skipAllowed`, `.tieEjectsNobody` | flags | removed | none | No vote |
| `impersonate.durationS` | 15 | 45 | N | |
| `impersonate.cooldownS` | 45 | 135 | N | |
| `snowball.killCooldownPenaltyS` | 10 | 30 | N | |
| `snowball.lastKillerCooldownDeltaS` | -5 | -15 | N | |
| `body.famishedAfterS` | 480 | 1680 | C | About 2 cycles, as today |
| `tasks.martyrS` | 600 | 2100 | C | The owner's "10 minutes". See open question 7 |
| `train.arriveAtS` | 5 | 20 | D | |
| `train.deliveryAfterS` | 8 | 32 | D | |
| `vendettas.conversion.shareS` | 45 | 160 | C | Shared time counts in every world phase |
| `vendettas.contract.offTargetRestS` | 30 | 90 | N | A Knife rest |
| `npc.aloneKill.afterS` | 30 | 90 | N | |
| `npc.night.leaveDelayS` | 0-15 | 0-45 | N | |
| `npc.vote.windowFrac` | 0.3-0.9 | removed | none | NPCs present evidence. The drawn tick moves to `npc.present.windowFrac` |
| `npc.difficulty.*.suspectVoteChance` | 0.5 / 0.75 / 1 | renamed `presentChance` | K | 5 |
| `moods.hunger.riseS` | 480 | 1680 | C | |
| `moods.fear.darkRiseS` | 90 | 270 | N | |
| `moods.fear.fallS` | 120 | 420 | C | |
| `moods.anger.fallS` | 180 | 630 | C | |
| `moods.want.lightRiseS` | 240 | 840 | C | |
| `moods.want.debtRiseS` | 120 | 420 | C | |
| `moods.mug.cooldownS` | 120 | 420 | C | |
| `meeting.minVoteS`, `.wrongEjectionDiscussionBonusS`, `.noEjectionStreak`, `.forcedVoteDivisor`, `.skipAllowed`, `.secretVotes`, `.endsWhenAllVoted` | 15, 15, 2, 3, flags | removed | none | No vote |
| `meeting.presentPerPlayer` | 1 | 3 | none | Evidence decides a verdict (5) |
| New: `trial.fineAt`, `trial.deathAt`, `respawn.hp`, `trial.acquittalGraceS` | none | 2, 3, 50, 30 | none | 5, 6 |

**Kept (K), by group, with the reason:**

| Group | Keys | Why kept |
|---|---|---|
| The pauses | `phases.graceS`, `.countdownS`, `.immunityS`, `.openingS`; `byCount.*.discussionS`; `talk.*` | "The same pauses" (owner). `phases.md` gives their screens |
| A person's actions | `clues.collectHoldS`; `vendettas.sabotage.tamperS`, `.heist.crackS`; `doors.*`; `movement.*`; `minigames.*`; `economy.coinPickupS`; `impersonate.applyWindowS` | A hold or a step takes the same time on a longer day |
| Combat feel | every `body.*` except `famishedAfterS`; `mobs.chaseS` | A fight is the same fight. Mob damage is 8 |
| Counts per cycle or per match | `nightPowers.perNight`, `hunger.cyclesWithoutKill`, `ghosts.wispsPerCycle`, `snowball.*` counts, `vendettas.sabotage.stations`, `.undoTasks`, `clues.*` counts, `quests.maxActive`, `wolves.*`, `resources.*`, `mobs.maxPerScene`, `townsfolk.count.*` | They are counted in cycles, which keep their number |
| NPC micro-timing | `npc.wander.*`, `npc.routine.*`, `npc.react.*`, `npc.ready.*`, `npc.hive.*`, `npc.body.*`, `npc.nightPower.*`, `townsfolk.*` timings, `moods.mug.*` except `cooldownS` | A longer day holds more activities. 9C tunes the living world (`living-world.md`) |
| Fixed facts | `tickHz`, `players.*`, `lobby.*`, `party.*`, `noise.*`, `vision.*`, `chat.*`, `ui.*`, `reader.*`, `economy.*` except `coinPickupS`, `disconnect.deathAfterS`, `tasks.ghostShareCap`, `.martyrWeight`, `moods.*` weights and reliefs | Not clocks |

**Outside `balance.json`**, the same factors apply to the clocks the round-10 census will list (`gdd-map.md`):

- the cooldowns of `abilities.json` (Bandage, Plant Clue, Act Shifty: N);
- clue decay in `clues.json` (footprints 90 s: C; "1 cycle" stays as written);
- creature spawns in `mobs.json` and resource respawns in `resources.json` (owned by 9C).

### 7.2 What the numbers do

| Measure | Today | Proposed |
|---|---|---|
| A cycle | 230 s | 810 s |
| Dark time per cycle (dusk and night) | 110 s | 330 s |
| Strikes per Killer per night at the 6-7 row | 3 (110 / 35) | 3 (330 / 105) |
| Match, 5 cycles plus the Final Night, without pauses | about 20 min | about 70 min |
| Day vs night | 120 / 100 | 480 / 300 |

## 8. Effects that do not kill

The owner, verbatim: "I don't want people to die from bleeding and things like that quite". Mobs also "need to do less
damage".

**The rule.** An effect that drains health (Bleeding, Poisoned, and any later one) stops at **1 health**. The seat is
Wounded (health under `body.woundedBelow`, GDD 3.22), cannot regenerate while the effect lasts, and stays standing.
Only two things take health from 1 to 0:

- a Killer's strike (the Knife, and later the six-shooter, needle or derringer of the vendettas);
- a creature's bite (GDD 3.15).

Nightshade, the Last Shot and a death sentence still kill outright, as they do today (GDD 3.22: "kill as before,
whatever the health").

| Source | Today (GDD 3.22) | Proposed |
|---|---|---|
| Bleeding | 1.5 per second; death at zero, cause `bled` | 1.5 per second; stops at 1 health; never a death |
| Poisoned | 0.5 per second; death at zero, cause `sickened` | 0.5 per second; stops at 1 health; never a death |
| Wolf bite | 25 | Kills only on the bite that takes the last health. Damage per 9C (`living-world.md`); 9A suggests 15 |
| Boar bite | 18 | As above; 9A suggests 10 |
| Bat bite | 6 | As above; 9A suggests 4 |
| Rat bite | 5 | As above; 9A suggests 3 |
| Fists, mugging, slingshot | knockout at zero | Unchanged |

Where it changes in the code:

- `apps/server/src/sim/body/effects.ts:146-147`: the drain clamps at 0 and records the effect. It would clamp at 1.
- `effects.ts:154-155`: returns `bled` or `sickened`. It would return no cause.
- `body/damage.ts:76-84`: `die` for `bled` and `sickened`, through `Kill.ts:146` `quietDeath`. That path is retired.
- `DeathCause` (`packages/shared/src/protocol/index.ts:127-128`): keeps `bled` and `sickened`, since protocol types
  are append-only, but nothing emits them.
- The `bled` and `sickened` death cutscenes go unused (GDD 3.18).
- The mob damage table (`mobs.json` `dmg`) is 9C's (`README.md` deliverable 5).

## 9. Story mode (1 player)

The owner, verbatim: "when 1 player is playing that's story mode all fixed actions just playing through and
triggering the action".

**What it is.** One human, every other roster seat an NPC, and a fixed chapter. The chapter's events happen by script
at fixed beats, and the player plays through them and triggers them. These are the ensemble arcs of Bible V.1: the
Baker's Fence or Ration Tyrant path, the Postmaster's, the Undertaker's and so on.

**What it builds on** (`apps/server/src/sim/auto/Auto.ts`, GDD 3.19):

| The harness gives | Where | Story mode needs |
|---|---|---|
| A room of NPC seats, started inside the step with no leader | `Auto.ts:59-75` `enableAuto`, `queueAutoStart`; `:145-173` `runAuto` | The same, with **one human seat**. Today an auto room has "No leader and no human" (`Auto.ts:152`), so a human seat is new work. (The round-9 plan says the harness already takes a human; it does not) |
| Fixed seed words for every stream, so a run replays tick for tick | `Auto.ts:44-60` `STREAMS`; GDD 3.19 "Replay" | The chapter's seed words, fixed in content, so the same chapter plays the same way every time: "all fixed actions" |
| `npcPrey`: an NPC Killer may take NPC prey | `Auto.ts:35-36` | On, so the chapter's crimes happen among NPCs |
| A clock: pause, steps, speeds | `Auto.ts:76-86` `applyClock` | 1x only. Pause while a story card is up |
| The invariant registry | `sim/auto/invariants.ts` | Runs as in every match |

**New pieces**, each a build PR in round 10:

| Piece | What |
|---|---|
| `story.json` (new content) | The chapters. For each: map, the player's card, the Killer's vendetta (held by an NPC: open question 1), the seed words, and the **beats**, each a trigger (a `SimEvent` pattern on the bus, `sim/events/bus.ts`) and an action (a cutscene, a line, a quest step, an NPC order) |
| A beat runner | A Step stage that watches the bus for each beat's trigger and runs its action once. It writes nothing secret to a public field |
| The menu entry | "Story" on the title screen. It opens the chapter list and starts a story room |
| Chapter cards | `phases.md` 8 |

**Scope for round 10.** One chapter on HollowMere, built from today's cards: the Baker's day, with the Bandit as the
NPC Killer and the Fence road as the turn. The trades' chapters follow their cards.

## 10. The art style is chosen in the menu only

The owner, verbatim: "in the new mode I want the 8bit/lowpoly/HD gone inside the game, it breaks it when used, menu
only".

**Today:** "Each player picks an art style at the click of a button, in the lobby or the in-match menu, without leaving
the match" (GDD 3.13; DECISIONS A79, and A164 for HD).

The client code involved:

| File | What it does today | Change |
|---|---|---|
| `apps/client/src/view/Hud.ts:4,84,146` | Mounts the in-match switch in the HUD's top-right corner | Remove the mount and the field. The settings gear (`:150`) stays |
| `apps/client/src/scenes/Meeting.ts:12,66` | Mounts `mountMatchArtSwitch` over the meeting | Remove. The meeting becomes the phase screens (`phases.md`) |
| `apps/client/src/ui/artStyle/ArtStyleSwitch.ts:196-208` | `mountMatchArtSwitch`, the in-match placement | Delete. `mountArtStyleSwitch` (`:73`) stays for the menu |
| `apps/client/src/scenes/World.ts:325-332` | Restarts the world scene on `ART_STYLE_CHANGED` | Remove: a style never changes in a match |
| `apps/client/src/scenes/Meeting.ts:63-64` | Repaints the portraits on a switch | Remove |
| `apps/client/src/view/artSwap.ts:112-113`, `scenes/Preload.ts:25` | `installArtSwitch`: swaps textures in a running game | Keep for the menu's preview. `requestArtStyle` (`view/artStyle.ts`) refuses a change while a match runs |
| `apps/client/src/ui/Lobby.ts:153`, `ui/lobby/MapPicker.ts:65` | The lobby switch and the map thumbnails | Kept: the lobby is the menu |
| `apps/client/src/view/artStyle.ts:69-76` | `queryStyle` (`?art=`) and `resolveStyleId`, read at load | Kept: a page load is outside a match |

The style is fixed from Start to game over. The pick stays per player and never reaches the server (A79).

## 11. Open questions for the owner

Each has 9A's proposed default, which the docs assume until the owner answers.

1. **"The game should also technically be able to function with the killer (even though it never will)."** Does this
   mean (a) a match must work with no Killer at all, or (b) the engine must allow an NPC Killer?
   - Default for (a): yes, as a supported configuration, not a lobby option. A no-Killer world runs to the Final
     Night and ends with every personal goal settled; this is the "quiet week" of the admin auto mode and of story
     chapters with no crime. Multiplayer always deals a Killer to a human.
   - Default for (b): yes. The engine keeps the NPC Killer (GDD 3.12): story mode (9) and the all-NPC auto mode need
     it. The multiplayer deal never gives it to an NPC, and an NPC Accomplice never inherits the Knife (6).
2. **The third human.** Is the third human of "a minimum of 3 players for the zealot" the Detective (the law), as 1.3
   reads it? Default: yes.
3. **Two humans.** No vendetta's partners fit. Default: the Killer is dealt with no vendetta, and the other human is
   the Detective. The plain Killer's only win is Unseen (2).
4. **Nameplates.** In world mode, should figures show their character ("Tamsin Crumb, the Baker") instead of the
   player's name, so the Bandit stays anonymous (4.3)? Default: yes. Player names stay in the party list and come
   back on the end screen.
5. **The train's "in the day".** Does it mean the daylight phases (a death after dark is for good), or the whole game
   day (every death returns)? Default: daylight only (6).
6. **Match length.** At 480 s days and 300 s nights, 5 cycles and the Final Night take about 70 minutes of play, up
   from 20-25. Keep 5 cycles, or bring the Final Night after cycle 3 (about 45 min)? Default: keep 5.
7. **The martyr's ten minutes.** The owner set `tasks.martyrS` to 10 minutes (GDD 3.20). Does it stretch with the
   cycle to 35 minutes? Default: stretch it, since it is a clock.
8. **The trades.** The Postmaster, Undertaker, Bartender and Company Clerk need cards and art before the Activist,
   Bandit and Hitman have their lore partners. Use the interim partners of 1.3 until then? Default: yes.
9. **One Killer.** Is one Killer per match right for world mode, whatever the human count? Default: yes (1.2).
10. **The Hitman dealt at the start.** The lore says "nobody starts as the Hitman" (Codex). The human-Killer rule
    deals him at the start. Default: dealt at the start, with the mailed version kept as the Postmaster's Handler
    road.
11. **Verdict thresholds.** Is a death sentence at 3 matching Verified entries, a fine at 2, and acquittal below that
    right (5)? Default: yes, tuned on playtests.
