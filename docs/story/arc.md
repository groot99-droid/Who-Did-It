# Story mode, part 2: the HollowMere arc

Written 2026-11-06 by P0 (`docs/story/part2.md`). Design only: it decides the acts, the sections, the cards and what
each section needs, and builds nothing. Sources: Bible Part 0 and Book I (`docs/round6/owner-brief.md` 2), Book V.1,
`docs/round9/world-mode.md` 9, `docs/story/questions.md` (the owner's answers), part 1 (`README.md`, `script.md`),
`roles.json`, `vendettas.json`, `lore.json`, `quests.json`, `cutscenes.json`, `routines.json`, the HollowMere scenes,
and `apps/server/src/sim/story/`. Every number is in `balance.json` or `GDD.md`; this file names keys, never values.
Scene, spawn, clue, quest, cutscene and lore ids are quoted as they are and never renamed.

**The owner's review comes next.** P1 and P5 start only once the owner has read sections 1 to 3 and answered (or let
stand) the questions in section 6.

## 0. The shape in one page

The Bible's opening narration names HollowMere's crisis as four threads and a law that closes on them: a stranger and
a Bandit after the town's money, "a new Vicar just stepped off the morning platform" with someone "waiting to wear his
robes", dynamite and "talk of a strike", and "a sealed envelope in the mailbag offering one of you a fortune to turn
killer". The arc plays them in that order, one act each, and ends on the law. Five acts, so five chapters (Q-P1).

| Ch  | Title                | Lore beat                                                                | Sections (card, in play order)                     | Days                     |
| --- | -------------------- | ------------------------------------------------------------------------ | -------------------------------------------------- | ------------------------ |
| 1   | The End of the Line  | The train, the stranger's gold, the new Vicar's arrival, the first night | Baker, Lamplighter, Watchman                       | cycle 1                  |
| 2   | The Stranger's Score | The sea door at low tide, the strongbox, the boy in the crate            | Thief, Killer (`bandit`), Child                    | cycle 2 to the dawn of 3 |
| 3   | Light and Ash        | The holy war: confession, doubt, the martyr and the lavender field       | Vicar, Killer (`zealot`), Doctor                   | cycles 3 to 4            |
| 4   | The Works            | The mine shut, the strike, the works undone, the Knife ready             | Tinner, Killer (`activist`), Herbalist             | cycle 5                  |
| 5   | The Black-Wax Letter | The Baron's contract, the Knife passes, the case closes                  | Accomplice, Gamekeeper (`hitman`), Heir, Detective | cycles 6 to the end      |

Sixteen sections on fourteen cards: the Killer card is played three times, once per vendetta; the Hitman's contract
is played on the Gamekeeper card, which the mail turns (GDD 3.33). The six other cards (Butler, Townsfolk, Drifter,
Ranger, Medium, Fisher) are named scripted NPCs who speak in the sections (section 3).

Part 1's four chapters become four of these sections, with their copy kept: `ch1_baker` is 1.1, `ch2_watchman` is
1.3, `ch3_bandit` is 2.2, `ch4_activist` is 4.2 (Q-A7). Their look overrides go (A4 changed): a Killer section wears the
Killer card's own look.

**The through-lines.** Three threads cross the acts so the player sees one town and not five episodes:

- **The stranger** (the Thief card) tips the Baker in gold (1.1), crosses the Lamplighter's dusk without a lantern
  (1.2), leaves his boots on the manor step (1.3), then is played (2.1): his own score is the Three Heirlooms and the
  sea door, and the gold coin was the Bandit's courtesy he carried. The Child sees him mark the ferry post (2.3). The
  last card of the story sees him go out by the sea door (5.4).
- **The Knife.** One Killer card passes from cause to cause: the outlaw (2.2), the Zealot (3.2), the Activist (4.2).
  In act 5 the Baron's contract names the saboteur, the Gamekeeper fills it (5.2), the Knife falls to the Accomplice
  (5.3) and the Detective ends it (5.4).
- **The lead.** Each chapter hands one thing on (`handOn`): the scratch, the pocket watch, the Bandit's footprint, the
  martyr's last words, the Activist's face, and the Detective reads them all back at the end.

## 1. The acts

### Act I. Chapter 1, The End of the Line (cycle 1, day to night)

**Lore.** The opening cinematic (`openingHollowmere`). The morning train brings flour, the mail and fresh faces: the
stranger, and the new Vicar off the morning platform (Book I 1, 3). A town of locked doors at dusk and lanterns
against the wolves (Book I 4, `fieldGuide`, `lamplightersRound`). The Baker's coin starts the Fence road (Book I 7,
row 1). The first night: the Watchman stands over a neighbour and finds the stranger's boots (`ch2_watchman`).

**What it hands on.** The scratch lead (from 1.1) and the pocket watch item (from 1.3), as part 1.

### Act II. Chapter 2, The Stranger's Score (cycle 2 to the dawn of cycle 3)

**Lore.** The stranger is no Bandit: he is a heist-man with a score of his own, the Three Heirlooms, and a way out
nobody else knows: the notch on the ferry post and the "door" nights of the big low (`threeHeirlooms`). The Bandit's
legendary score is the strongbox the train loads into Vane Manor (Book I 5.III; the `bandit` heist). Alfie, who
"climbed in a crate on the morning train" (`hopscotch`), sees what the grown-ups do not.

**What it hands on.** The Bandit's footprint at the safe (lead `footprints`), a footprint of the Bandit's own height
(GDD 3.20 heist).

### Act III. Chapter 3, Light and Ash (cycles 3 to 4)

**Lore.** The war for HollowMere's soul (Book I 5.I). The Vicar hears the town's confessions (`confessionBook`); the
Clerk keeps two columns, Light and Ash (`holyWar`); the Gamekeeper has written to "the new priest" (`oneShot`). The
Zealot keeps the Vicar company until his flock doubts him, and then takes the martyr's road for him. The memorial
(`memorialVicar`) plays at the reveal: the swaying lavender field the whole town dreams and will not report
(`lavenderField`). The holy war is the chapter: section 1 is the Light, section 2 the Ash (section 3.2 below).

**What it hands on.** The Vicar's last words (a `letter` handOn on `lavenderField`).

### Act IV. Chapter 4, The Works (cycle 5)

**Lore.** "Talk of a strike that'll bring the Baron himself down the tracks" (Book I 1, 5.II). The mine is shut and
the Tinner works the town's chores in pairs; the Activist undoes them: the pump, the fence, the lanterns (`fixPump`,
`mendFence`, `lightLanterns`; the `activist` sabotage). The wrecked works ready the Knife, and the Herbalist must guess
where it will fall (Remedy, Nightshade; GDD 3.2 night powers). The Bible's Baron, Pinkertons and bank are told in lines
only (Q-A11).

**What it hands on.** The Activist's face (a `lead` the Herbalist saw: the trait clue left by the night's kill).

### Act V. Chapter 5, The Black-Wax Letter (cycle 6 to the story's end)

**Lore.** The Baron's sealed envelope (Book I 3, 5.IV). In the Bible the contract names "a Saboteur costing the
Baron money": the Activist. It reaches the Gamekeeper, Vane's paid man, whose letter to the priest asked "is a right
still a right when it changes hands at a pump?" (`oneShot`). He fills it, the Knife falls to the Accomplice (GDD 3.2,
inherit), and the Detective closes the case on everything the story handed on, at the Tribunal (B6) or the meeting.
The stranger leaves by the sea door on the "door" night.

**What it ends on.** The end screen (part2.md, B5 changed): the five chapter summaries and the achievements earned.

## 2. The sections

Each section: the card, why it is that card, where it starts and ends (sim events on the bus,
`apps/server/src/sim/events/bus.ts`), what the player does, and who speaks. "Start: chained" means the section starts
when the previous one ends (the default). Every end has a tick fallback, as part 1 (README 1a), so a story always
moves on; P5 picks the ticks. `E<n>` names an engine need of section 4.

### Chapter 1, The End of the Line

**1.1 The Wake Loaf.** Card `baker`. Part 1's `ch1_baker`, kept.

- Why: the town's first loaf and the Fence road's first step (Book I 7, row 1).
- Start: the chapter's start (`start`). End: the part-1 end trigger, or `phase` to dusk, whichever first.
- Play: haul `fetchFlour`, `mixDough`, `proofLoaves`; find the scratch at `bakery:door`.
- NPCs: the stranger (the seat holding `thief`, now dealt: E2) watches, visits and picks; **the Vicar** (seat holding
  `vicar`) steps off the train and buys a Wake Loaf with one line; the Company Clerk (townsfolk figure `clerk`) calls
  the Midday Rent.

**1.2 The Lamps.** Card `lamplighter`. New.

- Why: dusk is the Lamplighter's (`willO`, `lamplightersRound`), and the lanterns are what the wolves fear
  (`fieldGuide`).
- Start: chained. End: `phase` to night, or `taskDone` (`lightLanterns`) by the player and a tick.
- Play: `lightLanterns` across the square to the chapel; stand in the light while the wolves pass at the fence.
- NPCs: **the Ranger** (a line, E2) at the `forest` gate counting the wolves; the stranger walks out to `forest`
  without a lantern (`npcOrder goTo`); the Vicar asks the way to St Brannock's.

**1.3 The Watchman's Night.** Card `watchman`. Part 1's `ch2_watchman`, kept.

- Why: the first night, and the stranger's boots from the other end of town.
- Start: chained. End: the part-1 end trigger.
- Play: walk the square, follow `footprints` at `manor_hall:front`, Keep Watch on a door.
- NPCs: the Lamplighter (now NPC, the player's last card) finishing the round; the stranger at `manor_hall`;
  **the Fisher** whistles two notes off the mere (`confessionBook`).

### Chapter 2, The Stranger's Score

**2.1 The Notch.** Card `thief`. New; the stranger, played (the owner's C2 answer).

- Why: the stranger returns in chapters 1 and 2. He was the mystery of chapter 1; here he is the hand.
- Start: the chapter's start (cycle 2, day). End: `story.enter` (`cave_entry`) by the player after dusk, or a tick.
- Play: check the notch at the ferry post (the `caulkTheSkiff` quest from Harbourmaster Pell on `overworld`, its
  reward is the boat's lantern); pick a lock at Vane Manor (the lock-pick mini-game, GDD 3.29; its win reaches no bus
  event today, E9); see
  the train load the strongbox (`vendetta.heist.loaded`); stand at the sea door at `cave_entry` and learn it opens only
  on a "door" night. The Thief's own goal (three Heirlooms) is not the section's; he leaves in 5.4 (Q-A2).
- NPCs: **the Butler** of Vane Manor (a seat, E2) locks the hall; **the Fisher** at the ferry post; the Bandit (the
  NPC Killer, holding `bandit` already: E4) passes him in the lane: "Give the baker my regards."

**2.2 The Bandit's Heist.** Card `killer`, vendetta `bandit`. Part 1's `ch3_bandit`, kept; no look override.

- Why: the outlaw's score (Book I 5.III), one night after the stranger cased it.
- Start: chained (night of cycle 2). End: the part-1 end trigger (`story.enter` `cave_entry`, or a tick).
- Play: case `manor_hall`, crack `mh.safe` alone and still (`vendetta.heist.cracked`), out by the sea door.
- NPCs: the Watchman's round; the Butler at the hall door; the Baker who left the latch. Part 1's lines that make the
  Bandit the man who tipped in gold are rewritten: the coin was his courtesy, the stranger carried it (Q-A2).

**2.3 Hopscotch.** Card `child`. New.

- Why: the boy who came in a crate (`hopscotch`) is the one witness nobody counts (`roles.json` child: "Hide, watch,
  remember").
- Start: chained (the dawn of cycle 3). End: a tick after the Detective's line at the safe (the Detective reads a
  clue, not a seat, so `inspect` does not fit), or `story.enter` (`overworld`) after it.
- Play: hide in `manor_hall` (the `hide` ability; `silentHide` and `witness` are unbuilt, E11) while the Detective
  reads the footprint at the safe; run to `overworld` and see the stranger's thumb on the notch.
- NPCs: **the Detective** (seat) reads the footprint; Widow Vane (a figure line) finds the strongbox gone; the stranger.

### Chapter 3, Light and Ash

**3.1 The Light.** Card `vicar`.

- Why: the Vicar's side of the holy war (Book I 5.I; the owner's C1 answer).
- Start: the chapter's start (cycle 3, day). End: the player's Hear Confession resolves at dusk or night (E8), or the
  NPC Zealot's company has gone on long enough that the doubt is near (a tick before `vendettas.conversion.shareS`).
- Play: tend the altar (`ch.altar_main`, the Vicar's faith work); read the Clerk's columns (`holyWar`, `mh.bookcase_0`;
  E9); at dusk Hear Confession on one soul and learn where it stands.
- NPCs: **the Fisher** will not come to the box ("in case I make one"); **the Gamekeeper** (seat) gives the priest his
  letter (`oneShot`); **the Killer** (seat, holding `zealot`: E4) keeps the Vicar company in `chapel`, and speaks kindly.

**3.2 The Ash.** Card `killer`, vendetta `zealot`.

- Why: the other side of the same war, from the same chapel. At the break the cards swap between the two bodies
  that share the chapel (A415): the player stands where the Vicar stood, now in the Killer's look, and the Vicar is
  the seat beside them.
- Start: chained. End: `kill` with `seat: 'vicar'` (the Vicar's seat is the victim), or a tick.
- Play: keep the Vicar company until `vendetta.conversion.sown`; at the next meeting his voice does not carry
  (`vendetta.conversion.doubt`); after dark, take the martyr's road for him with the Knife (Q-A3).
- NPCs: the Vicar (now NPC) preaches; **the Medium** (a line, E2) says she hears a field of lavender; the Fisher.

**3.3 The Strength of Ten.** Card `doctor`.

- Why: someone must read the dead and keep the living; the Doctor is who comes to a body (`roles.json` doctor).
- Start: chained. End: `story.cutscene` (`memorialVicar`) has played and the meeting's reveal ends, or a tick.
- Play: reach the Vicar's body, bandage the living (`bandage`, `salts`), report it; the meeting and the memorial film.
- NPCs: the Medium; the Undertaker's Register is read aloud (`undertakersRegister`, a lore line); the town's dream
  (`lavenderField`) as the chapter's end card. The martyr's due (GDD 3.20) runs here: E3.

### Chapter 4, The Works

**4.1 The Shut Mine.** Card `tinner`.

- Why: the mine is shut and the Tinner's hands are not (`roles.json` tinner). The player builds the works the next
  section undoes.
- Start: the chapter's start (cycle 5, day). End: two of `taskDone` (`fixPump`, `mendFence`) by the player, or a tick.
- Play: `fixPump` and `mendFence` in pairs (the pairing, `balance.json` `pairing`; E10); hear the strike talk; pay the Midday Rent (`rent.paid`).
- NPCs: **the Townsfolk** card (seat) works beside the player and talks strike; the Clerk takes the rent; the
  Killer (holding `activist`, E4) is at the pump.

**4.2 The Works.** Card `killer`, vendetta `activist`. Part 1's `ch4_activist`, kept; no look override.

- Why: the Activist undoes the company's town (Book I 5.II). The tasks she wrecks may be the ones the player did.
- Start: chained. End: the part-1 end trigger (`vendetta.sabotage.wrecked`, or a tick).
- Play: tamper still and unseen (`vendetta.sabotage.tampered`) at two works, then wreck them.
- NPCs: the Tinner (now NPC) asks who loosened the bolts; the Townsfolk; a Constable (figure) at the board.

**4.3 Remedy and Nightshade.** Card `herbalist`.

- Why: the wreck readies the Knife (GDD 3.20), and the Herbalist is the card that guesses where it will fall.
- Start: chained (dusk). End: `phase` to day (the night is over), or a tick.
- Play: Mother Moll's herbs in the Fenwood (`mollsHerbs`, giver `moll` on `forest_deep`); at night pour Remedy on one
  soul, and Nightshade only where certain (night powers, GDD 3.2).
- NPCs: Mother Moll (quest NPC); the Doctor; the Lamplighter finds the lanterns out.

### Chapter 5, The Black-Wax Letter

**5.1 The Alibi.** Card `accomplice`.

- Why: the Cabal know each other (`roles.json` factions); this is the one section in which the player knows who
  holds the Knife.
- Start: the chapter's start (cycle 6, day). End: `vendetta.contract.offered` (the letter reaches the Gamekeeper), or a
  tick.
- Play: stand beside the Killer when the town gathers (a shared scene for a while: E10);
  watch the mail come off the train.
- NPCs: the Killer (NPC); **the Drifter** (seat) wants to hang and says so at the bell; the Detective.

**5.2 One Shot.** Card `gamekeeper`, vendetta `hitman`.

- Why: the Hitman's contract is played on the card the mail turns, which keeps its look (GDD 3.33; Q-A4). The
  Gamekeeper is Vane's paid man and the letter's writer.
- Start: chained. End: `vendetta.contract.done`, or `vendetta.contract.lapsed`, or a tick.
- Play: open the black wax, Accept on the Notebook (`vendetta.contract.accepted`), find the mark (the Killer's seat:
  E5) and fill it, by day with the derringer or after dark.
- NPCs: the Accomplice (now NPC) watches; the Clerk; a Constable.

**5.3 The Knife-bearer.** Card `heir`.

- Why: the Knife falls to the Accomplice once no Killer lives (GDD 3.2 inherit); the heir is played here so the card
  appears as the player's (E6).
- Start: when a seat holds `heir` after 5.2 (E6). End: one `kill` by the player, or `phase` to day, or a tick.
- Play: keep the cover; one strike after dark, or none; be the loudest voice at the bell.
- NPCs: the Detective; the Gamekeeper (NPC) waits for the train; the Drifter.

**5.4 The Case.** Card `detective`.

- Why: the law closes the story (Book I 6); the Detective reads back every lead the chapters handed on.
- Start: chained. End: `tribunal.verdict` or `eject` of the seat holding `heir`, or the Final Night, or a tick. The
  story's end screen follows.
- Play: collect and inspect (`inspect`, `clue`); the footprint of 2.2, the scratch of 1.1 and the night's clue of 4.3
  are on the Case Board; charge and convict at the Tribunal (B6) or the meeting.
- NPCs: the Drifter confesses to everything; the Child (seat) tells what he saw; the stranger's last line: he goes out
  by the sea door on the "door" night (`npcOrder goTo cave_entry`; a narration line if his seat has left: Q-A2).

## 3. Coverage

### 3.1 Every card of `roles.json`

`roles.json` has 20 rows: 19 dealt cards and `heir`, which nobody is dealt (the Accomplice becomes it). All 20 appear.

| Card          | Played in                                        | Also speaks as an NPC in | Notes                                             |
| ------------- | ------------------------------------------------ | ------------------------ | ------------------------------------------------- |
| `baker`       | 1.1                                              | 2.2                      | Part 1 ch1                                        |
| `lamplighter` | 1.2                                              | 1.3, 4.3                 | New                                               |
| `watchman`    | 1.3                                              | 2.2                      | Part 1 ch2                                        |
| `thief`       | 2.1                                              | 1.1, 1.2, 1.3, 2.3, 5.4  | The stranger; dealt as an NPC from chapter 1 (E2) |
| `killer`      | 2.2 (`bandit`), 3.2 (`zealot`), 4.2 (`activist`) | 2.1, 3.1, 4.1, 5.1, 5.2  | Own look in all three (A4 changed)                |
| `child`       | 2.3                                              | 5.4                      | `silentHide`, `witness` unbuilt (E11)             |
| `vicar`       | 3.1                                              | 1.1, 1.2, 3.2            | The Light                                         |
| `doctor`      | 3.3                                              | 4.3                      |                                                   |
| `tinner`      | 4.1                                              | 4.2                      |                                                   |
| `herbalist`   | 4.3                                              |                          |                                                   |
| `accomplice`  | 5.1                                              | 5.2                      | Becomes `heir`                                    |
| `gamekeeper`  | 5.2 (`hitman`)                                   | 3.1, 5.3                 | Not a Killer section (Q-A4)                       |
| `heir`        | 5.3                                              |                          | Entered by inheritance (E6)                       |
| `detective`   | 5.4                                              | 2.3, 5.1, 5.3            |                                                   |
| `butler`      |                                                  | 2.1, 2.2                 | NPC only: `lockUnlock`, `ledger` unbuilt          |
| `fisher`      |                                                  | 1.3, 2.1, 3.1, 3.2       | NPC only: the man who will not confess            |
| `ranger`      |                                                  | 1.2                      | NPC only: V1.5, `shoot`/`arrest`/`snare` unbuilt  |
| `medium`      |                                                  | 3.2, 3.3                 | NPC only: V2, `seance` unbuilt                    |
| `townsfolk`   |                                                  | 4.1, 4.2                 | NPC only: the plain neighbour                     |
| `drifter`     |                                                  | 5.1, 5.3, 5.4            | NPC only: `actShifty`, `fakeBlood` unbuilt        |

### 3.2 The holy war

|                      | 3.1 The Light                                                                       | 3.2 The Ash                                                      |
| -------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Card                 | `vicar`                                                                             | `killer`, vendetta `zealot` (`needsCard: vicar`)                 |
| The other side       | The NPC Killer holding `zealot`, in the chapel                                      | The NPC holding `vicar`: the body the player just left           |
| What the player does | The altar, the Clerk's columns, Hear Confession                                     | Keep him company (`sown`), silence his vote (`doubt`), the Knife |
| What it sets up      | The doubt is near, not sown (the NPC's progress starts over at the break, GDD 3.34) | The martyr; the memorial in 3.3                                  |
| Lore                 | `confessionBook`, `holyWar`, `oneShot`                                              | `holyWar` (the Ash column), `lavenderField`                      |

Both sections are one chapter and the same two bodies: the break swaps the cards and nothing else.

### 3.3 The stranger

| Where | Card he holds            | What he does                                                                                                        |
| ----- | ------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| 1.1   | `thief` (NPC)            | Watches, visits the bakery, picks the back door, leaves the coin (part 1's beats, live once the Thief is dealt: E2) |
| 1.2   | `thief` (NPC)            | Walks out to `forest` at dusk with no lantern                                                                       |
| 1.3   | `thief` (NPC)            | Footprints on `manor_hall:front` (part 1)                                                                           |
| 2.1   | `thief` (**the player**) | The notch, the lock, the strongbox loading, the sea door                                                            |
| 2.3   | `thief` (NPC)            | Seen at the ferry post                                                                                              |
| 5.4   | `thief` (NPC, or a line) | Goes out by the sea door                                                                                            |

## 4. What each section uses, and what the engine needs

### 4.1 Content each section uses

| Sec | Scenes (frozen ids)                     | Quests          | Cutscenes           | Vendetta         | Lore volumes                               | Tasks and events                                                |
| --- | --------------------------------------- | --------------- | ------------------- | ---------------- | ------------------------------------------ | --------------------------------------------------------------- |
| 1.1 | `bakery`, `overworld`                   |                 | `openingHollowmere` |                  | `crumbsDaybook`                            | `fetchFlour`, `mixDough`, `proofLoaves`, `train.arrive`, `clue` |
| 1.2 | `overworld`, `forest`, `chapel`         |                 |                     |                  | `fieldGuide`, `willO`, `lamplightersRound` | `lightLanterns`, `phase`                                        |
| 1.3 | `overworld`, `manor_hall`               |                 |                     |                  |                                            | `train.dusk`, `clue`, `bell`, `kill`                            |
| 2.1 | `overworld`, `manor_hall`, `cave_entry` | `caulkTheSkiff` |                     | (NPC `bandit`)   | `threeHeirlooms`                           | E9 (lock-pick), `vendetta.heist.loaded`, `story.enter`          |
| 2.2 | `manor_hall`, `cave_entry`              |                 |                     | `bandit`         |                                            | `vendetta.heist.cracked`, `story.enter`                         |
| 2.3 | `manor_hall`, `overworld`               |                 |                     |                  | `hopscotch`                                | `story.enter`, `npcOrder`                                       |
| 3.1 | `chapel`, `manor_hall`                  |                 |                     | (NPC `zealot`)   | `confessionBook`, `holyWar`, `oneShot`     | E8, E9                                                          |
| 3.2 | `chapel`, `overworld`                   |                 |                     | `zealot`         | `holyWar`                                  | `vendetta.conversion.sown`, `.doubt`, `meeting`, `kill`         |
| 3.3 | `chapel`, `cellar`                      |                 | `memorialVicar`     |                  | `lavenderField`, `undertakersRegister`     | `bell`, `meeting`, `story.cutscene`                             |
| 4.1 | `overworld`                             |                 |                     | (NPC `activist`) | `gazetteMorning`                           | `fixPump`, `mendFence`, `rent.paid`, E10                        |
| 4.2 | `overworld`                             |                 |                     | `activist`       |                                            | `vendetta.sabotage.tampered`, `.wrecked`                        |
| 4.3 | `apoth_shop`, `forest_deep`             | `mollsHerbs`    |                     |                  | `fieldGuide`                               | night powers (E8), `phase`                                      |
| 5.1 | `overworld`                             |                 |                     |                  | `personsOfNote`                            | `train.arrive`, `vendetta.contract.offered`, E10                |
| 5.2 | `overworld`, `forest`                   |                 |                     | `hitman`         | `oneShot`                                  | `vendetta.contract.accepted`, `.done`, `.lapsed`                |
| 5.3 | anywhere                                |                 |                     |                  |                                            | E6, `kill`                                                      |
| 5.4 | `overworld`, `cave_entry`               |                 |                     |                  | `exhibits`                                 | `inspect`, `tribunal.open`, `tribunal.verdict`, `eject`         |

Cutscenes: today `cutscene` and `questStep` actions only emit bus events (status.md, S2). 1.1's opening and 3.3's
memorial must really play (E12).

### 4.2 Engine needs part 1 does not have (for P2)

| #   | Need                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Sections                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| E1  | Sections: a chapter holds sections in order; each section has its own card, vendetta, goals, beats and end; a section break is a handover (`switchRole`) without a chapter end card; a section card (title and setup) replaces the chapter title card for every section after the first                                                                                                                                                                                                                                                           | all                               |
| E2  | **The story's cast.** The story names the cards at the table per chapter (a fixed deal of every seat, not `roles.json` `decks`), up to the room's seat cap (`balance.json` `players`). At a chapter break, a card the new chapter casts and nobody holds is dealt to an NPC seat whose card the chapter does not cast, dead seats first, made whole as a newcomer off the morning train. Needed for the Thief from 1.1, and for the Butler, Child, Gamekeeper, Tinner, Townsfolk, Drifter, Ranger and Medium, none of which the 8-seat deck holds | 1.1, 1.2, 2.1, 2.3, 3.1, 4.1, 5.1 |
| E3  | **No early win.** Before the last section, no match win ends the room: the Village task bar (the martyr's due in 3.3 makes it fast), parity, a Thief escape, a Hitman boarding. Proposed: a win before the last section ends the running section as done, and the story moves on; only the last section's win ends the match                                                                                                                                                                                                                      | 3.3, 4.2, 5.2, 5.4                |
| E4  | **The NPC Killer's vendetta** per section (`npcVendetta`): so the Killer the player meets in 2.1, 3.1, 4.1 is already the Bandit, the Zealot, the Activist. Its progress starts over at the break when the player takes the card (GDD 3.34)                                                                                                                                                                                                                                                                                                       | 2.1, 3.1, 4.1                     |
| E5  | **A fixed Hitman.** The arrival never comes below its human floor (`hitman.byHumans`); a story names the section, the seat to turn (the player's) and the contract's mark (a role id: the seat holding `killer`)                                                                                                                                                                                                                                                                                                                                  | 5.2                               |
| E6  | **The heir section.** A section may start on a card a seat evolved into (`heir`), waiting until a seat holds it; and `runInherit` emits a bus event (none today) for the trigger                                                                                                                                                                                                                                                                                                                                                                  | 5.3                               |
| E7  | **NPC lines.** A beat line spoken by the seat holding a card (`by: <roleId>`: its name and look at that moment, so a cover shows as the cover) or by a figure with a fixed name and portrait (the Clerk, Widow Vane, Mother Moll, a Constable)                                                                                                                                                                                                                                                                                                    | all                               |
| E8  | **Night-power events.** Hear Confession, Keep Watch, Remedy and Nightshade emit nothing on the bus today; a `nightPower` event `{ ability }` with the user's seat lets a section end on it                                                                                                                                                                                                                                                                                                                                                        | 1.3, 3.1, 4.3                     |
| E9  | **Read and pick events.** Opening a lore volume (GDD 3.26) and winning the lock-pick mini-game (3.29) emit nothing on the bus; `story.read { volume }` and `story.picked { lock }` for the player let a goal be "read the Clerk's columns" or "open the hall door"                                                                                                                                                                                                                                                                                | 2.1, 3.1                          |
| E10 | **Company.** A trigger "the player and the seat holding `<roleId>` in one scene for a while" (the shape of the conversion's shared time). `pair.start` names its seats only in `data`, which a trigger's `seat` cannot resolve, so it does not serve                                                                                                                                                                                                                                                                                              | 4.1, 5.1                          |
| E11 | **Unbuilt verbs** on played cards: the Child's `silentHide` and `witness`, the Thief's `pickpocket` and `smoke`, the Accomplice's `plantClue` and `crowbar`. The sections are written around what exists (`hide`, `lockpick`, presence); a verb that lands later becomes an optional goal                                                                                                                                                                                                                                                         | 2.1, 2.3, 5.1                     |
| E12 | **Cutscenes that play** from a beat (today an event only), and the memorial in a story room (it is played by a meeting's reveal, so it needs a meeting: 3.3 rings one if no NPC does)                                                                                                                                                                                                                                                                                                                                                             | 1.1, 3.3                          |
| E13 | **Holy-war rules vs. B6.** The Zealot's consequence is a silenced vote at a meeting (GDD 3.20). If B6 retires voting before P5 builds 3.2, the goal follows whatever B6 makes of `vendetta.conversion.doubt`. Also: GDD 3.20's prose and `balance.json` `vendettas.conversion.shareS` disagree; the data wins and the GDD owner should fix the prose                                                                                                                                                                                              | 3.2                               |
| E14 | **Staging at a break.** A break swaps cards between two bodies where they stand (A415), so the stranger "moves" to where the Watchman ended. P5 stages each section's opening with `npcOrder goTo` before the break, or writes setup copy that names no place                                                                                                                                                                                                                                                                                     | 2.1, 3.2, 5.2, 5.3                |

Replay-once and the save at each chapter break are part2.md's (P2, P3) and need nothing more from the arc than this:
a chapter is the unit of both; a death in any section fails the chapter (Q-A9).

## 5. The schema change, for P1

Kept to what the arc needs; the part-1 shapes (`Trigger`, `StoryAction`, `ChapterGoal`, `Beat`, `HandOn`) stay.

```ts
interface Story {
  id: string;
  title: string;
  blurb: string;
  mapId: string;
  roster: { humanSeat: 0; npcCount: number }; // npcCount up to the seat cap less one (E2)
  seedWords: Record<string, [number, number, number, number]>;
  chapters: Chapter[];
}
interface Chapter {
  id: string; // new ids: act1_line, act2_score, act3_holyWar, act4_works, act5_letter (Q-A7)
  title: string;
  setup: string; // the chapter's title card
  summary: string; // one line for the story's end screen
  startPhase: { cycle: number; part: 'day' | 'night' };
  cast: string[]; // role ids at the table this chapter (E2); must include every section's roleId
  sections: Section[]; // in play order, at least one
  end: { lines: string[]; failedLine: string; summaryKeys: string[] }; // the chapter's end card
  handOn?: HandOn[]; // crosses the chapter break only
}
interface Section {
  id: string; // the shipped chapter ids (ch1_baker, ...) are kept as section ids
  title: string;
  setup: string; // the section card (E1); the first section's may repeat the chapter's
  roleId: string;
  vendetta?: string; // the player's vendetta (Killer sections; `hitman` on a turned card)
  npcVendetta?: string; // the NPC Killer's vendetta while this section runs (E4)
  startWhen?: Trigger; // default: at once when the previous section ends; 5.3 waits for `heir` (E6)
  hitman?: { mark: string }; // E5: the player is turned in this section; the mark is the seat holding this role
  goals: ChapterGoal[];
  beats: Beat[];
  end: Trigger; // with a tick fallback inside an `any`
}
// StoryAction gains a spoken line (E7); `card` stays for narration.
type Line = { line: { text: string; by?: string; speaker?: string; portrait?: string; goal?: string } };
//          by: a role id (the seat holding it speaks); speaker and portrait: a figure with no seat
```

Validator checks (P1): every `roleId`, `vendetta`, `npcVendetta`, `cast` entry and `by` exists; a section's
`vendetta` is that card's (`vendettas.json` `role`), except `hitman` on a card the mail may turn (GDD 3.33); `zealot`
needs `vicar` in the chapter's `cast` (`needsCard`); `bandit` needs the map and `manor_hall` (`needsScene`); `cast` fits
`roster`; section ids are unique across the story; and, for the owner's Q-P2, every card of `roles.json` is a section's
`roleId` or a `by` of some line.

## 6. Questions for the owner

Each has a default that holds until you answer.

- **Q-A1. Five acts.** The train and the stranger, the score, the holy war, the works, the letter; five chapters.
  Default: yes. Alternative: four, folding act 4 into act 5.
- **Q-A2. Who the stranger is.** The Thief, a heist-man with his own score (the Three Heirlooms and the sea door); the
  gold coin was the Bandit's courtesy he carried, so part 1's Bandit lines that claim the tip are rewritten in P5. He
  leaves the cast after chapter 2 and goes out by the sea door in a closing line in 5.4. Default: yes. Alternative: he
  stays at the table to the end and walks out in person (one seat fewer for the act-5 cast).
- **Q-A3. The Zealot takes the Vicar's life.** 3.2 ends on the Knife and the martyr; the memorial and the lavender
  field are 3.3. Default: yes, as a goal with a tick fallback (the section moves on if the player will not). The
  Bible's Skin-Walk, Dark Positions and Dark Mass are not built and appear only in lines.
- **Q-A4. The Hitman on the Gamekeeper.** The contract is played on the card the mail turns, which keeps the
  Gamekeeper's look (GDD 3.33); A4's "the Killer's own look" applies to the three Killer-card sections. Default: yes.
- **Q-A5. Six cards as NPCs only.** Butler, Townsfolk, Drifter, Ranger, Medium, Fisher speak and act in sections but
  are not played (their verbs are unbuilt, or the Medium is V2). Default: yes. Alternative: a played section for any
  of them once its verbs ship.
- **Q-A6. Arrivals at the breaks.** The table's cards change between chapters by newcomers off the morning train,
  dead seats first (E2). Default: yes.
- **Q-A7. Ids.** The story keeps `hollowmere_winter`; the shipped chapter ids become section ids of the same play;
  the chapters get new ids. Nothing is saved yet, so nothing breaks. Default: yes.
- **Q-A8. A win before the end.** A Village, Cabal or solo win before the last section ends that section, not the
  story (E3). Default: yes.
- **Q-A9. Failure.** A death in any section fails the whole chapter, which replays once from its start (B1 changed).
  Default: yes. Alternative: replay the section only.
- **Q-A10. The martyr's ghost.** The player does not play the Vicar's ghost after 3.2; his ghost's tasks run as an
  NPC's. Default: yes.
- **Q-A11. The Bible's town is bigger than the map.** No bank, mill, post office, station or Baron exists on
  HollowMere (`maps/hollowmere.json`). The Bible's evolutions (Fence, Ration Tyrant, Grave Robber, Union Boss,
  Embezzler) and the Baron's arrival appear in lines only. Default: yes; a map request is P6's or a later round's.
- **Q-A12. Length.** Sixteen sections, each about a part-1 chapter's length or shorter, is roughly four times part 1.
  Default: accept; P5 keeps each section short and every end has a tick fallback.

## 7. Answers (owner, 2026-11-07)

Recorded as DECISIONS A515. Every section, cast card and through-line: no issues. Changes:

| Question | Answer |
| -------- | ------ |
| Q-A5 | A played section for any NPC-only card once its verbs ship |
| Q-A9 | A failure replays the section only |
| Q-A10 | The player plays the Vicar's ghost for a short section; in the solo game the Medium must be found to resurrect them (new rule) |
| Q-A11 | Request map additions now, inside a full map revamp (new camera angles, Blender the primary asset source) |
| F1 | Tone: darker, closer to folk horror |
| F2 | Rich NPC lines, several per section |
| F3 | The martyr's death is shown fully, with weight |
| F4 | 5.4 waits for B6; merge the other PRs the story needs now |
| F5 | Build the unbuilt verbs before their sections |
| F10 | Saves linked to the account (sign-in) |
| F14 | Merge #468 once its e2e re-run is green |

All other questions stand on their defaults.
