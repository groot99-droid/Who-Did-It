# Round 9: the follow-up calls (owner, 2026-10-26)

After the questionnaire and the third follow-up, the owner sent five fixes and six answers in chat, dropped one fix, and then
answered a 28-question form (https://claude.ai/artifact/SaDYF6BMx5inMa4n46b542, saved 2026-10-26T20:05:35Z). This file is
the record of those answers and the rules they decide. It overrides `world-mode.md`, `phases.md`, `living-world.md`,
`logic-table.md`, `round10-plan.md` and `gdd-map.md` wherever they disagree. A paragraph that these answers changed is
marked "(F4 <id>)" in `world-mode.md`; the others point here.

**Status.** Design only. Nothing is built, and `GDD.md` and `balance.json` stand until the round-10 GDD PR. Every number is
a proposal (P) unless the owner gave it.

**Dropped.** The owner's fix 5, the Hitman taking over a live NPC's identity, house and routine, is dropped: "I'm for the
vacant house". The vacant house stays (section 4).

## 1. The answers, as saved

The owner's words in the "Note" column are verbatim. "Different" means the owner chose that option and wrote the note.

| Id | Question | Choice | Note |
|---|---|---|---|
| a1 | Petition signatures | Yes, as read: other signers needed, not counting the opener or the accused | |
| a2 | Paint The Town Red pillars | The Vicar, the Company Clerk and the Constables (both count as one pillar) | |
| a3 | How the pillars count | All three dead at the same time, before the morning train | |
| a4 | Can the Knife hit the Clerk and the Constables | Different | They should stop being “Figures and start being, NPCs that don’t move very far and fight when hit” |
| a5 | Defrocking: when | Different | Defrocking is harder to achieve but possible for both religious figures |
| a6 | Faith after a defrocking | Those sources keep working at half rate | |
| a7 | The chapel cot when the chapel is barred | Different | The cot can undo defrocking for high priest or Vicar after 2 nights. |
| a8 | Your own bed | A home bed restores 100% but clears nothing | |
| a9 | Debuffs a bed clears | Slowed, Stunned, Poisoned, Famished | |
| a10 | While Owing the line, which income halves | Everything halves, plus a Clerk labour errand that clears the fare | |
| a11 | Target for clearing the fare | Within 2 days | |
| a12 | Hitman: chance he is human, if he comes | Yes, the owner's table (3: 0%, 4: 15%, 5: 25%, 6: 40%, 7: 55%, 8: 70%, 9: 85%, 10: 100%) | |
| a13 | Hitman: chance he comes at all | Different | Use that table, but also the Hitman can only come between days 3 and 5 |
| b1 | How his role looks while dormant | Split: vacant at night, thin and dear by day | |
| b2 | Random NPC hardships as decoys | Yes, in every match | |
| b3 | How many hardships at once | One to two, at different points | |
| b4 | What causes a hardship | Robbed or mugged; failed harvest or spoiled stock; fined by the Constables; rent default; illness; a lost shipment | |
| b5 | How the town tells a hardship from the Hitman | A ledger at the Company Clerk's counter lists rent boardings, and reading it takes a trip | |
| b6 | When the Hitman can win | Add a dusk train and a day weapon (a new weapon and a second train) | |
| c1 | The murder threshold | Lower murder to two matches | By confirming with the townsclerk that someone’s business went empty not because of Taxes it grants essentially 2 clues, suspect, and reason, the last part of the puzzle is proof |
| c2 | Match length | 12 cycles, about 170 minutes | We need more tasks and things to account for this |
| c3 | Searching a jailed seat's pack | The search finds vendetta tools as Verified traces | These tools could be collected by anyone but only certain roles have the reason to have all of them |
| c4 | Daytime sabotage: who gets it | Different | Everyone in their own ways. Sabotage doesn’t mean killing. The bandits main vendetta is sabotage, and the activist, the zealot and more. For a lot of these characters killing means winning but the sabotage means achieving it. |
| c5 | Hazards that can kill by day | A wolf let through a broken fence; a cave-in at the Tin Gallery | Bosses |
| c6 | Is a sabotage death murder | No, it is a sabotage charge: a fine and jail until dawn | |
| c7 | Exhaustion: what the 50% means | Maximum stamina is halved | Stamina both regenerates at half speed and only fills half way |
| c8 | Exhaustion: who gets it | The last human awake after 60 seconds, but not players on a night role or a manhunt | |
| c9 | A Constable as a second signature | At 5 humans or fewer | |

The owner's chat answers that the form built on, as sent:

- Petition: "30% of living humans (rounded up). At 3 humans, it requires 1 other signature. At 6 humans, it requires 2. At 10, it requires 3."
- Paint The Town Red: "50% of the NPCs, OR the 3 Infrastructure Pillars (Constable, Vicar, Mayor/Leader)."
- Defrocking: "Yes, defrocking is mandatory. If a Vicar or High Priest is jailed, they are stripped of their title."
- Beds: Chapel Cot (free): 50% stamina and a minor Faith buff. Tavern Bed (2 Scrip): 100% stamina and clears minor debuffs.
- Train fare: 6 Scrip, approved.
- The vacant house: "It acts as a starting gun" and "It creates an investigation trap", with NPCs that "randomly go broke or suffer from money problems at a random chance with fixed variable ... maybe 1 or 2 go broke at different points for different reasons that comes from triggers spread throughout the game".

## 2. The rules

### 2.1 Petitions (F4 a1, c9)

- Others needed = ceil(`petition.othersPct` 0.3 times the living, free humans, the accused left out and the opener counted).
  That is 1 at 3 humans, 2 at 4 to 6, and 3 at 7 to 10. A dead or jailed human leaves the count, so the bar falls as the match goes
  on. This replaces `petition.signaturesMin`.
- **A Constable as a second signature (c9).** At 5 humans or fewer, a Constable signs a petition once the case holds 2 Verified
  matches against the accused. It counts as one signature, never more, so 4 and 5 humans still need a human. A Forged or Doubted
  entry is not a match.

### 2.2 Paint The Town Red (F4 a2, a3, a4)

- **The win.** The two Killers win when their combined unique NPC kills reach `paintTown.winUnique` (half the NPC seats), or when
  all three **pillars** are dead at the same moment before the morning train. The pillars are the **Vicar**, the **Company
  Clerk** and the **Constables** (both Constables count as one pillar). There is no Mayor: Lord Vane is dead and no leader card
  exists (the owner's chat named a "Mayor/Leader"; the form's answer picked the Clerk).
- **Why together.** Every NPC death returns on the morning train and unique kills add up over the match, so three separate pillar
  kills would be 3 of about 10 needed. Requiring them dead together makes the strike a risk against guarded targets, as the
  owner described: "a highly dangerous, targeted strike against heavily guarded roles".
- **Guard NPCs (a4).** The Clerk and the Constables stop being figures. They become NPCs "that don't move very far and fight
  when hit": each keeps to a post (a leash of `guard.leashTiles`), has health, and fights back when struck. The Knife can hit
  them, in every mode (R2). They stay out of the deck: no card, no seat, no meeting notes. This amends GDD 3.24 ("a figure never
  fights") and the Constables of `world-mode.md` 3.1.

### 2.3 Defrocking (F4 a5, a6, a7)

- **Who.** Both religious figures, the Vicar and the High Priest (the Zealot's lieutenant, `docs/round6/owner-brief.md`).
- **When.** It is harder to achieve than a jail term (a5). Reading R3: only a Tribunal verdict **Proven at the murder threshold**
  (2 matches, 2.7) for conspiring with the Killer or for the Following strips the title. A lesser charge jails the figure and
  leaves the title.
- **What it costs.** The Vicar's services (confession, sermon, Faith from the chapel) stop and the chapel is barred. Faith from
  the other sources (vigils, the shrine, devotional reading, calming scared villagers) continues at half rate
  (`defrock.otherFaithMult` 0.5, a6).
- **Undoing it (a7).** The chapel cot stays open to the defrocked. After `defrock.cotNights` (2) nights slept on it, the title
  returns. A night skipped by sleeping counts. The nights need not follow one another (R3).

### 2.4 Beds (F4 a8, a9)

Sleeping now restores stamina on waking. A home bed: 100%, clears nothing. The tavern bed (P: 2 Scrip): 100% and clears Slowed,
Stunned, Poisoned and Famished. The chapel cot (free): 50% and a minor Faith buff, which a barred chapel withholds. A seat
without a home bed (a boarded house) sleeps on the cot or in the tavern.

### 2.5 The fare (F4 a10, a11)

- The fare stays 6 Scrip (`respawn.fareDebt`, approved). While Owing the line, every wage and sale halves (`respawn.wageMult`
  0.5, as designed).
- **The relief valve (a10).** A **Clerk labour errand** clears the fare: a chore at the Clerk's counter or on his round, worth
  one fare. It is always available, so the debt never locks a seat out.
- **The test (a11).** The balance lab checks that a normal routine of tasks, chores and sales clears the fare within
  `respawn.clearTargetDays` (2). The check matters because a task pays 3 Scrip and rent is 6: with wages halved, three tasks
  pay 4.5 against 6 rent.

### 2.6 The Hitman (F4 a12, a13, b1 to b6)

- **Odds.** `hitman.byHumans`, the human-if-he-comes column: 3: 0, 4: 0.15, 5: 0.25, 6: 0.40, 7: 0.55, 8: 0.70, 9: 0.85, 10: 1.
  The comes-at-all column stays as in `world-mode.md` 1.5 (0.5 at 3, rising to 1 at 10). He can only come between days 3 and 5.
- **Dormant look (b1).** At night his role's home shows a dark window and its station stays cold. By day its stall opens thin
  and dear, the same look as a seat Owing the line. This replaces the "stall does not restock, home dark" paragraph of
  `world-mode.md` 1.5 and `hitman.dormantOutput` becomes the day-stall stock multiplier.
- **Hardships (b2 to b5).** In every match, whether or not a Hitman comes, one to two NPC seats at a time go broke at different
  points, from triggers spread across the game: robbed or mugged, a failed harvest or spoiled stock, fined by the Constables,
  a rent default, illness, a lost shipment. A hardship shows exactly the sign of the Hitman's dormant role, so a thin stall or a
  dark window never names him by itself. Rent boardings (and only those) are listed in a **ledger at the Company Clerk's
  counter**; reading it takes a trip. A hardship that is not rent leaves no entry. Recovery: the seat's stall and station
  return to normal after `hardship.recoverS` (P: one day).
- **The Dusk Train (b6).** A second daily train leaves at dusk. The mail still arrives on the morning train.
  - **The day weapon.** The Hitman carries the lore's concealed weapon, a Poisoned Needle or a single-shot Derringer
    (`docs/round6/owner-brief.md`, the Hitman). It works by day, only against his contract mark (R4).
  - **The two chances.** The town can find him before the kill (the economy, a petition, a manhunt), or report a Verified sighting
    from the kill until the Dusk Train leaves, which convenes an immediate manhunt at the station.
  - **The win.** He boards the Dusk Train after the kill: the Contract victory, the same day. The mark's death from the day
    weapon is permanent and is not returned by the morning train (R4), or the contract could never be filled.
  - **If he has not killed by dusk,** the contract stays open for `hitman.contractDays` (P: 2) days, then lapses (R4).

### 2.7 The murder threshold and the ledger (F4 c1)

`trial.murderAt` becomes 2 matches. The Clerk's ledger gives the town a quick, real lead for a dormant-role case: confirming at
the counter that a business went empty and not because of taxes gives two leads, the **suspect** (the role whose look went
dormant) and the **reason** (it was not taxes). Leads are enough to open a petition and let a Constable sign it. A conviction
still needs proof, the Verified matches (R1).

### 2.8 Match length (F4 c2)

12 cycles and the Final Night, about 170 minutes: `finalNight.afterCycle` 12. The owner's note says the game needs more to fill
it: "We need more tasks and things to account for this". So the content to scale is `byCount.*.tasksEach` (P: 29 / 29 / 38 / 38 / 38 / 38 /
48, 12 over 5 cycles times 2.4), the chores, the quests, the resource chains and the creature spawns. Every key counted in cycles
(`hunger.cyclesWithoutKill`, the snowball counts) keeps its number, since a cycle has not changed. Rent is paid on every one of
the 12 days.

### 2.9 Searching a jailed seat's pack (F4 c3)

A search of a jailed seat's pack finds vendetta tools as Verified traces. The tools can be collected by anyone, so one tool
proves nothing: a trace counts as a match only when the seat holds a **full set** of a vendetta's tools (candlewax, powder, a
wax seal and the rest), which only the roles with reason to hold the whole set do. Bound kit (the Knife) stays hidden.

### 2.10 Sabotage (F4 c4, c5, c6)

Every vendetta role gets sabotage as its means, in its own way: "For a lot of these characters killing means winning but the
sabotage means achieving it." The owner reads the Bandit's heist, the Activist's disarray and the Zealot's sigils as sabotage.
Sabotage itself never kills. The hazards that can kill by day are a **wolf let through a broken fence** and a **cave-in at the
Tin Gallery**, and a death from one is a day death: it returns on the next morning's train, with the fare. A sabotage death is
charged as sabotage (a fine and jail until dawn), never as murder. This amends GDD 3.20 ("never a second way to kill"): a
vendetta is still never a direct kill, but its sabotage can set a hazard. The owner's one-word note on the hazards is
"Bosses" (R5).

### 2.11 Exhaustion (F4 c7, c8)

The last human awake after the rest are asleep, once `sleep.holdoutGraceS` (60 s) has passed, is **Exhausted** for the next day:
maximum stamina is halved and it regenerates at half speed. Players on a night role or a manhunt are not penalised.

## 3. Readings to confirm

Each is where an answer needed a reading. The reading is written into the rules above; a different one changes one line.

| # | Reading | Alternative |
|---|---|---|
| R1 | c1: the box said two matches, the note describes suspect, reason and proof. I wrote two Verified matches for murder, with the ledger giving two leads that open a petition. | Three pieces of evidence, with the ledger's two leads counting as two of them |
| R2 | a4: only the Clerk and the Constables become guard NPCs, in every mode. | Every figure; or only in Paint The Town Red |
| R3 | a5, a7: "harder" means a Proven murder-level verdict for conspiring or the Following; two nights on the cot need not be consecutive. | Any jail term; or two consecutive nights |
| R4 | b6: the day weapon hurts only the mark, kills permanently, and the contract stays open 2 days. | A different weapon scope, return by train, or a one-day window |
| R5 | c5: "Bosses" as a note on the hazards. I read it as: the day-lethal hazards become boss-class encounters when bosses arrive (round 11); until then they use creature-bite damage. | Bosses are a separate thing you want sooner |
| R6 | c2: the task counts scale by 12 over 5, and every cycle-counted key keeps its number. | A different content plan |
| R7 | c7: both effects apply (max stamina halved and regeneration halved), as the note says, and the form's single option names only the first. | Max stamina only |

## 4. Where this lands

| Doc | Sections |
|---|---|
| `world-mode.md` | 1.5 (the Hitman), 1.6 (Paint The Town Red), 3.1 (petition, Constables), 5 (crimes, defrocking), 6 (the fare), 7 (pacing: 12 cycles), 7.3 (beds, exhaustion) |
| `phases.md` | 2 (the Dusk Train), 13 (the jail), the Tribunal's verdict cards (defrocked) |
| `living-world.md` | 1 (guard NPCs, hardships), 6 (the creature bite for the hazards) |
| `logic-table.md` | the vendetta tool sets (2.9), sabotage hazards (2.10) |
| `round10-plan.md`, `gdd-map.md` | the new keys and the PRs that carry them |

**New `balance.json` keys.** `petition.othersPct`, `guard.leashTiles`, `defrock.otherFaithMult`, `defrock.cotNights`,
`respawn.clearTargetDays`, `hitman.contractDays`, `hardship.*` (the count at once, the causes, `recoverS`), `sleep.holdoutGraceS`,
`sleep.exhausted.*`, `train.dusk.*`, `bed.*`. Changed: `trial.murderAt` (2), `finalNight.afterCycle` (12), `byCount.*.tasksEach`,
`hitman.byHumans`.
