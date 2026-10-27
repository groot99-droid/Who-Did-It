# Round 9 (9D): the GDD map

> **Follow-up 4 (owner, 2026-10-26).** `followup-4.md` adds to the GDD sections below: 3.3 (12 cycles, the Dusk Train), 3.8 (win routes and the two-match murder threshold), 3.20 (sabotage hazards, the Hitman's day weapon), 3.22 (beds restore stamina) and 3.24 (guard NPCs). It overrides this file where they disagree.

Session 9D, deliverable 7 of `README.md`. Design only: this document changes no code, data, test or `GDD.md`. It
says, for every section of `GDD.md` that the round-9 design changes, **what changes**, **which design document and
section holds the design**, and **which `balance.json` keys and content files change**. It is the checklist for the
final round-10 pull request that edits `GDD.md` and `DECISIONS.md`, which merges only after the owner approves the
docs (README, "Review loop").

All round-9 numbers are proposals until that pull request: a number here is quoted from its design document and is
not restated as a rule (CLAUDE.md: `GDD.md` and `balance.json` are the only sources). The design documents already
fold in `owner-answers.md` and both owner-brief follow-ups; each changed paragraph there is marked "(owner answer
<ID>)".

**How to read a row.** "Design" names the document and section, short names: WM `world-mode.md`, PH `phases.md`, LT
`logic-table.md`, FM `failures.md`, LW `living-world.md`, EP `emergent-play.md`. "Keys" are `balance.json` paths;
"Content" are files under `packages/content/data/`. "New" means the key or file does not exist today.

## 1. Existing sections that change

### 3.1 Factions, traits and the deck

- **Changes.** One dealt Killer (two in Paint The Town Red). The third human of a vendetta is any card, not the law. The
  Hitman leaves the deal: he arrives. The deal order loses the reserved law card and gains the Hitman draw on its own
  secret stream.
- **Design.** WM 1.2, 1.3, 1.4, 1.5, 1.6.
- **Keys.** New `hitman.byHumans.*`, `hitman.dormantOutput`, `paintTown.winUnique`. `byCount.*.cabalWin` is removed.
- **Content.** `roles.json` (the Hitman is marked arrival-only), `vendettas.json` (minimum humans: Zealot, Activist and
  Bandit 3; Hitman none). The server's seed table gains a `hitman` stream (`sim/seeds.ts`; nothing public shares it).

### 3.2 Role cards

- **Changes.** The Detective card is an ordinary card again, human or NPC. The Hitman's card is a private arrival card.
  A turned seat's role goes dormant while he works, with no public tell beyond the world's signs.
- **Design.** WM 1.3, 1.5, 2; PH 9.
- **Keys.** `hitman.dormantOutput`.
- **Content.** `roles.json`, `abilities.json` (the cooldowns scale by the night factor, WM 7.1).

### 3.3 Match loop

- **Changes.** A 480 s day, a 30 s dusk and a 300 s night. The meeting is gone. In its place: Dawn and the train, the
  Inquest (on a body report only), the Tribunal (when a cuffed suspect reaches the jail), the petition and the manhunt,
  the Constables' briefing, sleep, and the jail. All of them are full-screen phases or world states, and none waits on
  an NPC.
- **Design.** WM 3, 5, 7; PH 1 to 6, 13.
- **Keys.** `phases.dayS`, `.duskS`, `.nightS`, `.roleRevealS`, `.gameOverS`; `phases.voteS` removed; `train.arriveAtS`,
  `.deliveryAfterS`; `finalNight.huntS`, `.killCooldownS`; the timer table of WM 7.1 in full.
- **Content.** `events.json` (new events: `petition.*`, `manhunt.*`, `briefing`, `cuff`, `jail.in`, `jail.out`,
  `sleep.all`, `hitman.arrive`), `cutscenes/` (the Inquest and the Tribunal; the meeting cutscene retires).

### 3.4 Investigation and clues (also touched)

- **Changes.** A picked lock leaves a **scratch**, a role-neutral clue, in place of 9B's print. Constables verify clues
  at twice a Detective's rate and post a briefing.
- **Design.** LT 8.5; WM 3.1; EP 2.2.
- **Keys.** `law.speedMult`, `law.briefingAfterS`.
- **Content.** `clues.json` (new `scratch` kind).

### 3.5 Items and tasks (also touched)

- **Changes.** Tasks per human scale with the day. Chores join tasks. Dishes give buffs.
- **Design.** WM 7.1; LW 2.2, 2.7; LT 7.1.
- **Keys.** `byCount.*.tasksEach`, `tasks.martyrS`.
- **Content.** `tasks.json`, `items.json` (dishes, armour, tools, the skinning knife), `effects.json` (buffs).

### 3.7 Stealth, hiding and doors (also touched)

- **Changes.** The curfew doors are locks a pick can open. A boarded house is a nailed lock.
- **Design.** EP 2.3 (T6, T10); LT 9.5.
- **Keys.** `doors.*` unchanged.
- **Content.** `scenes/*.json` (curfew doors and house doors get a lock, no id renamed).

### 3.8 Meetings, voting and win conditions

- **Changes.** No voting and no ejection. A charge is proven by evidence at the Tribunal. The crime sets the sentence:
  murder is death; robbery, assault and conspiracy are jail until the next dawn; theft, trespass and sabotage are
  fines. The Final Night ends in an end trial sentenced by charge. Win conditions: WM 2's table, the Hitman's ("one day
  after the kill") and Paint The Town Red's (a shared win on unique NPC kills).
- **Design.** WM 2, 5; PH 3, 4, 5, 7.
- **Keys.** New `trial.convictAt`, `trial.murderAt`, `trial.theftFineMult`, `trial.trespassFine`,
  `trial.acquittalGraceS`; removed `meeting.minVoteS`, `.wrongEjectionDiscussionBonusS`, `.noEjectionStreak`,
  `.forcedVoteDivisor`, `.skipAllowed`, `.secretVotes`, `.endsWhenAllVoted`, `finalNight.skipAllowed`,
  `.tieEjectsNobody`; `meeting.presentPerPlayer` 1 to 3. The round-9 `trial.fineAt` and `trial.deathAt` are
  replaced by `convictAt` and `murderAt` (R10).
- **Content.** `laws.json` (empty today: the crime table and its sentences), `vendettas.json` (a robbery resets a
  Killer's vendetta checklist).

### 3.9 Balance by player count

- **Changes.** Kill cooldowns triple with the night, keeping the strikes per night. Tasks per seat are keyed by humans
  in world mode. The Hitman's chance and humanity are keyed by human count.
- **Design.** WM 1.5, 7.1, 7.2.
- **Keys.** `byCount.*.killCooldownS`, `byCount.10.globalKillLockS`, `byCount.*.tasksEach`, `hitman.byHumans.*`.
- **Content.** none.

### 3.12 NPC fill (below the minimum)

- **Changes.** An NPC seat is never idle: a chain of real actions a watcher reads as a player's. It does every action
  a player can (gather, craft, pick, sleep, sign, hunt, pair up, bank, pay rent, trade) and sells only what it
  gathered, crafted or bought. Nothing waits on it. NPCs present evidence in place of voting.
- **Design.** LW 1.8; WM 7.1 (`npc.present.windowFrac`).
- **Keys.** `npc.wander.*` (the pause between actions), `npc.vote.windowFrac` removed for `npc.present.windowFrac`,
  `npc.difficulty.*.suspectVoteChance` renamed `presentChance`, `npc.aloneKill.afterS`, `npc.night.leaveDelayS`.
- **Content.** `routines.json` (action chains in place of idle stops).

### 3.13 Maps and presentation (also touched)

- **Changes.** New scene prefix `cj.` for the county jail, appended to `SCENE_IDS`. New `bed`, `berry_bush` and `tree`
  stems. No id renamed.
- **Design.** WM 5.1, 7.3; LT 5.1, 7.
- **Keys.** none.
- **Content.** `scenes/cj_*.json` (new), `scenes/*.json` (beds, bushes, saw horses, bakery sections), `maps/`.

### 3.14 Resources and crafting

- **Changes.** Piles open only to their tool; nodes keep bare hands. Everything depletes and comes back. Logs become
  Timber at the mill or a saw horse. The bakery's sections make the parts of a dish, and the oven joins them. Crafting
  moves to a 2×2 grid, 3×3 at a workbench. Stacks: materials 16, food 4.
- **Design.** LT 2, 5.1, 7, 7.1, 8.6, 9.1; EP 2.1, 2.2.
- **Keys.** `resources.*` (respawns, the boulder 1200 s), `resources.stackMax`.
- **Content.** New `interactions.json` (the logic table), `resources.json` (piles, trees, berries, `respawnS`),
  `recipes.json` (`parts`, `buff`, an optional `shape`), `items.json`.

### 3.15 Mobs

- **Changes.** Bites drop to 12, 9, 3 and 2. Bleeding and Poisoned stop at 1 HP. Armour cuts damage by tier and adds
  resistances.
- **Design.** LW 6.1, 5.1; WM 8; LT 8.2.
- **Keys.** `mobs.*` bite values, new `armor.tierMult`, `armor.resist`.
- **Content.** `mobs.json`, `effects.json`.

### 3.16 Quests and mini-games

- **Changes.** A new `lockpick` mini-game kind. The jail's three mini-games reuse tap, crates and pour. The bakery's
  sections reuse pour and stoke. Quest-givers become two chains first (Moll, Ada Kerrow).
- **Design.** LT 8.5; WM 5.1; LW 1.3, 2.6.
- **Keys.** New `minigames.lockpick.*` (`snapAt`), `jail.*`.
- **Content.** `minigames.json`, `quests.json`.

### 3.17 Characters and disguise

- **Changes.** A new `constable` look for the law figures; they never wear a card's look or `villager`. A Leather
  jerkin or hide is not a tell (role-neutral skinning).
- **Design.** WM 3.1, 4; LW 1.1, 5.4.
- **Keys.** none.
- **Content.** `looks.json` (`constable`); atlas keys `char/constable/<anim>/<dir>` (art task).

### 3.20 Vendettas

- **Changes.** Minimum humans 3 for the Zealot, the Activist and the Bandit, with any third human. The Hitman's contract
  starts on arrival, mailed by black-wax letter at `train.delivery` on day 3, 4 or 5, and names a human mark when one
  is free. A robbery resets the Killer's checklist.
- **Design.** WM 1.3, 1.5; PH 9.
- **Keys.** `vendettas.conversion.shareS`, `vendettas.contract.offTargetRestS`.
- **Content.** `vendettas.json`.

### 3.21 Parties, profiles and friends

- **Changes.** Achievements stay on the device in round 10 (option A). The promise "the server keeps nothing between
  matches" holds until accounts ship (section 2.2).
- **Design.** LW 4.4.
- **Keys.** none.
- **Content.** none (the client's `localStorage` record).

### 3.22 Bodies: health, stamina and effects

- **Changes.** No seat kills a seat except the Killer's strike. A beating knocks out and may rob (not bound kit, armour
  or the bank). Effects stop at 1 HP, so the `bled` and `sickened` causes retire. Max health moves with dishes and the
  jail (bounded, P: 80 to 120). The day's dead return on the train with 50 health.
- **Design.** WM 6, 8; LW 5.2, 6.1; LT 7.1 (R12).
- **Keys.** `body.famishedAfterS`, `body.woundedBelow`, `body.koS`, `respawn.hp`.
- **Content.** `effects.json`, `items.json` (`roleBound` decides what a robbery may take).

### 3.23 The economy

- **Changes.** Rent paid in Scrip, in kind or by labour; goods taken, then the house boarded. The Clerk collects from the
  purse only. Owing the line: a returner's fare debt with higher prices, lower stock and lower wages. The town chest
  holds stolen goods and lost property. Fines by charge.
- **Design.** EP 2.3; WM 6; LT 6.4; LW 2.3.
- **Keys.** New `respawn.fareDebt`, `respawn.priceMult`, `respawn.stockMult`, `respawn.wageMult`; `economy.taskWage`.
- **Content.** `economy.json` (rent modes, the town chest, `shops.market.buys` for dishes and berries).

### 3.24 Moods, mugging and townsfolk

- **Changes.** A townsperson says its need in words and gives one tip per Talk. Mood clocks scale with the day. A Scared
  villager is likelier to pair up.
- **Design.** LW 1.2, 1.4; WM 7.1.
- **Keys.** `moods.hunger.riseS`, `moods.fear.*`, `moods.anger.fallS`, `moods.want.*`, `moods.mug.cooldownS`,
  `townsfolk.idleChance` (figures only).
- **Content.** `routines.json`, `lore.json` (tip lines).

### 3.25 The living world

- **Changes.** Five kinds of walker, the Constables included. Chores, errands and two quest chains. Depletion makes NPC
  gathering real. Faith from four sources. Achievements as a skill tree with trophies.
- **Design.** LW 1, 2, 4.
- **Keys.** `npc.*` routine keys; new chore and errand keys in LW 6.2 (fractions of the day).
- **Content.** `routines.json`, `quests.json`, `lore.json`, new `achievements.json`.

### 3.26 The reader: shelves, letters, ledgers and boards

- **Changes.** The black-wax letter is a reader item. The briefing and the petition post to the notice boards.
- **Design.** WM 1.5, 3.1; PH 13.1, 13.3.
- **Keys.** `reader.*` unchanged.
- **Content.** `lore.json` (the letter), `items.json`.

### Not changed

3.6 PvE, 3.10 V1 cut list, 3.11 (removed), 3.18 Cinematics and music (beyond the retired meeting cutscene), 3.19 Admin
auto-mode. 1 and 2 change only in their examples of a match, which the final pull request rewrites from 3.3.

## 2. New sections

The final pull request appends these after 3.26 (proposed numbers 3.27 to 3.33).

### 2.1 The county jail (3.27)

- **What.** A cell scene on the `cj.` prefix. A sentence runs until the next dawn's train. Jailed seats cannot leave,
  sign, hunt or count for sleep. Three mini-games, each once a day: the gym (Strength +2), the yard fight (lose: −10 max
  health), scrubbing (a Scrip and time off).
- **Design.** WM 5.1; PH 13.5; LW 2.6.
- **Keys.** New `jail.*`.
- **Content.** `scenes/cj_*.json`, `minigames.json`, `laws.json`.

### 2.2 Accounts and achievements (3.28)

- **What.** Achievements are a skill tree of steps evaluated on the server's event bus, with trophies for finished
  branches. Rewards are cosmetic or a start option of equal power. Round 10 stores them on the device. Accounts are a
  later system with their own design pass; when they ship, the device record migrates once.
- **Design.** LW 4.
- **Keys.** none.
- **Content.** New `achievements.json`.

### 2.3 The lock-pick mini-game (3.29)

- **What.** Rotate, click, push and pull against tension. The lock's tier sets the pins. Too much tension snaps the
  pick. It leaves a scratch and noise, with a fine chance. Its draws come from its own `locks` stream.
- **Design.** LT 8.5; EP 2.2; FM 4.9 (`PICK_SNAPPED`).
- **Keys.** New `minigames.lockpick.snapAt`.
- **Content.** `minigames.json`, `interactions.json` (`"minigame": "lockpick"`, `"leaves": "scratch"`,
  `"fineChance": 0.1`), `clues.json`.

### 2.4 The inventory and crafting (3.30)

- **What.** A hotbar of 6, a pack of 18, a belt of 2, and head, body and weapon slots. A 2×2 crafting grid anywhere, 3×3
  at a workbench. Recipes are shapeless unless they set a `shape`. Stacks: materials 16, food 4.
- **Design.** LT 8.6; FM 4.9 (`GRID_NO_RECIPE`, `GRID_BOUND`, `NEEDS_PART`).
- **Keys.** `resources.stackMax` becomes per kind; the slot counts are proposed as new `inventory.*` keys (LT 8.6).
- **Content.** `recipes.json`, `items.json` (slot kinds).

### 2.5 Law enforcement and petitions (3.31)

- **What.** Two Constables per map, figures in the `constable` look. They verify clues, post a briefing 30 s after a
  clue appears, join manhunts and cuff. A petition opened at the notice board needs signatures to start a manhunt; a
  cuffed suspect taken to the jail opens the Tribunal. The bell gathers NPCs for the ringer's purpose (Activist, Vicar,
  Zealot, Clerk), else it dings. "Walk with me" pairs any two figures.
- **Design.** WM 3.1; PH 13.1 to 13.3; LW 1.1, 1.4; FM 4.9.
- **Keys.** New `law.speedMult`, `law.briefingAfterS`, `law.cuffHoldS`, `petition.signaturesMin`, `petition.openS`,
  `petition.cooldownS`, `manhunt.durationS`.
- **Content.** `looks.json`, `laws.json`, `routines.json` (the Constables' routine).

### 2.6 Sleeping (3.32)

- **What.** A bed hold after dusk. When every active player is asleep for `sleep.confirmS`, the night ends. Active means
  living, free, connected humans; NPCs never count. A boarded house has no bed: a chapel cot is free and a tavern bed
  costs 2 Scrip (P).
- **Design.** WM 7.3; PH 13.4; EP 2.3; FM 4.9 (`ASLEEP`, `NO_BED`, `BOARDED_HOME`).
- **Keys.** New `sleep.*`.
- **Content.** `scenes/*.json` (`bed` props), `economy.json` (the tavern bed).

### 2.7 The Hitman's arrival (3.33)

- **What.** From day 3 to 5 a black-wax letter turns a townsman. The chance he comes and the chance he is human follow
  the human count. Public signs show the arrival, never the seat. He can be stopped by a manhunt or a report before the
  train; he wins one day after his kill.
- **Design.** WM 1.5; PH 7, 9.
- **Keys.** New `hitman.byHumans.*`, `hitman.dormantOutput`.
- **Content.** `roles.json`, `vendettas.json`, `lore.json` (the letter).

Paint The Town Red (two humans, two Killers) is a mode of 3.1 and 3.8, not a section of its own (WM 1.6).

## 3. Content files at a glance

| File | Change | Sections |
|---|---|---|
| `balance.json` | The timers of WM 7.1; new `hitman`, `paintTown`, `law`, `petition`, `manhunt`, `trial`, `jail`, `respawn`, `sleep`, `armor`, `inventory`, `minigames.lockpick` | all |
| `interactions.json` | **New**: the logic table | 3.14, 3.29 |
| `achievements.json` | **New**: the step tree | 3.28 |
| `laws.json` | Filled: crimes and sentences | 3.8, 3.27 |
| `roles.json`, `vendettas.json` | Hitman arrival-only; minimum humans | 3.1, 3.20 |
| `looks.json` | `constable` | 3.17, 3.31 |
| `resources.json`, `recipes.json`, `items.json` | Piles, trees, berries, chains, dishes, armour, tools | 3.14, 3.15, 3.30 |
| `minigames.json` | `lockpick`, the jail's three | 3.16, 3.27 |
| `clues.json`, `effects.json`, `mobs.json` | Scratch; buffs and resistances; bites | 3.4, 3.15, 3.22 |
| `economy.json`, `routines.json`, `quests.json`, `events.json`, `lore.json` | Rent modes and the town chest; never-idle routines; chains; new events; the letter and tips | 3.3, 3.23 to 3.26 |
| `scenes/*.json` | `cj.` scenes; beds, bushes, saws, locks. Ids appended only | 3.13 |

## 4. Reconciled

Every place an owner answer met another rule, with where it is settled. Each is marked in its document.

| # | Conflict | Settled in |
|---|---|---|
| R1 | Player kills and the jail (LW9 against follow-up 2): no seat kills a seat except the Killer; a beating knocks out | WM 12 |
| R2 | The bell against the Inquest and the Tribunal | WM 12, PH 14 |
| R3 | The petition against "voting has got to go" | WM 12, PH 14 |
| R4 | Paint The Town Red against one Killer and WM5 | WM 12 |
| R5 | The Hitman's arrival against "a human always holds the Killer" | WM 12 |
| R6 | Pairing up with NPCs against "NPC seats never talk" | WM 12, LW 8 |
| R7 | Owing the line against the rent's Indebted | WM 12 |
| R8 | Tool walls against "every need has three sources" | LT 14, EP 6 |
| R9 | Depletion against cosmetic NPC work and chore pay | LT 14, LW 8, EP 6 |
| R10 | The verdict against 9A's thresholds | WM 12, PH 14 |
| R11 | Sleeping against the Killer, the jail and rent | WM 12 |
| R12 | Max-health dishes against "health is 100%" | LT 14 |
| R13 | The lock-pick mini-game against the K factor and the clue | LT 14 |
| R14 | Robbery against role secrecy; a bigger pack against robbery | WM 12, LT 14 |
| R15 | Never-idle NPC seats against the quiet NPC seat | LW 8 |
| R16 | The Hitman's dormant role against role secrecy | WM 12 |
| R17 | Constables as figures against GDD 3.24 | LW 8 |
| R18 | The scratch against 9B's print | LT 14, EP 6 |

`failures.md` 10 settles the refusal side of these (the bell's ding, a refused pairing, the NFY tags for systems not yet
built).

## 5. New questions the reconciliation raised

Each has a proposed default; 6Z carries them to the owner.

1. **Petition threshold.** Default: the opener plus one other living, free human. In Paint The Town Red the Constables
   petition for themselves (R3).
2. **Paint The Town Red's win.** Default: a shared win when the unique count reaches half the NPC seats (WM 1.6).
3. **A religious conspirator's sentence.** Default: "Defrocked": Faith set to 0 and the chapel's services barred for the
   match, in place of a fine and jail (WM 5).
4. **A seat with no bed.** Default: a chapel cot (free) or a tavern bed (2 Scrip) (WM 7.3, R11).
5. **Owing the line.** Default: 6 Scrip of fare debt and no curfew of its own (WM 6, R7).
6. **The Hitman's table.** Default: as WM 1.5 has it, from 0.5 and 0 at 3 humans to 1 and 1 at 10.
