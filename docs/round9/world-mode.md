# Round 9 (9A): world mode

This is the core loop of world mode: who is dealt what, how each role wins, how the Killer is stopped, how the
Killer hides, what replaces voting, the train that brings the day's dead back, the pacing, effects that no longer
kill, and the art-style lock. The full-screen pauses that replace the meeting are in `phases.md`.

**Status.** Design only (owner, 2026-10-24). Nothing here is built, and until the round-9 GDD PR lands, `GDD.md`
and `balance.json` stand. Every number below is a proposal. Each claim about today's game cites a GDD section or a
file and line at `88453d9`.

**Owner answers folded in (9D, 2026-10-25).** The questionnaire answers (`owner-answers.md`) and the three owner-brief
follow-ups override this document wherever they disagree. Every paragraph they changed is marked "(owner answer
<ID>)". Where an answer collides with another rule, the reconciliation is written in place and listed in section 12,
"Reconciled". The GDD sections each change lands in are in `gdd-map.md`; the build order is in `round10-plan.md`.

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

**One dealt Killer, plus the Hitman who may arrive (owner answers WM9, WM3).** World mode deals exactly one Killer
card at Start, with one vendetta among the Zealot, the Activist and the Bandit, whatever the human count. The 10-seat
deck's second Killer existed because of parity at 10 seats (GDD 3.9), and world mode drops parity as a win (2). Two
exceptions:

- **The Hitman is never dealt.** He may arrive between days 3 and 5, as a human or an NPC by party size (1.5).
- **Two humans play two Killers** against the town, in "Paint The Town Red" (1.6).

### 1.3 Who must be human

The owner's rules, verbatim:

- "on multiplayer the role of killer must always be given to a player since they have vendettas and actions that
  must be achieved for victory";
- "you must also assign the player who is required for example: Zealot(human) must always have a Vicar(human), this
  makes the gameplay a minimum of 3 players for the zealot, activist, bandit, and even more for the Hitman".

A Zealot and a Vicar are only 2. The owner's minimum of 3 means one more human is needed.

**The third human is not the law (owner answer WM2).** 9A read the third human as the Detective; the owner answered
"no, I mentioned law enforcement NPCs". The law is a set of NPC figures, the **Constables** (3.1), who work the
Detective's way at a quicker rate. So the third human is any roster card, dealt like every other human seat (1.4 step
5). The Detective card stays in the roster and goes to a human or an NPC like any other card.

| Vendetta | Partner the lore pairs it with (must be human) | Why that partner | Extra | Minimum humans |
|---|---|---|---|---|
| Zealot (conversion) | Vicar | The Zealot hunts the Vicar and Skin-Walks in his robes (Bible I.5 I; Codex, Conversion) | any third human | **3** |
| Activist (sabotage) | Company Clerk | The Baron's man: protects the Baron when he comes by train and becomes the Baron's Heir (Bible I.5 II, I.7) | any third human | **3** |
| Bandit (heist) | Bartender | The Vigilante: "if they gun down the Bandit, they claim the bounty" (Bible I.7) | any third human (the Constables cuff him, Bible I.5 III) | **3** |
| Hitman (contract) | Postmaster | Carries the black-wax letter, and can steam it open (the Handler road, Bible I.5 IV, I.7) | Not dealt: he arrives (1.5) | none (1.5) |

**The Hitman's mark (owner answers WM9, WM10).** The Hitman is no longer dealt at Start, so he needs no minimum.
When he arrives (1.5) his contract names a human mark if one is free (not the dealt Killer, not the Postmaster, not
the Hitman himself), else an NPC.

**Interim partners, until the trades ship** (built cards only):

| Vendetta | Interim partner | Reason |
|---|---|---|
| Zealot | Vicar | Already built. `needsCard: "vicar"` is the seam (`vendettas.json`) |
| Activist | Watchman | Stands at one door each night (Keep Watch), so he is the one who can guard the Baron |
| Bandit | Gamekeeper | The only other gun (`fowlingPiece`): the Vigilante's stand-in |
| Hitman | none | The mail arrives without a Postmaster (GDD 3.20, `train.arrive`). The arrival of 1.5 needs no partner |

The interim partners stand (owner answer WM8: default).

### 1.4 The deal order

The deal runs at Start, before the role card, on the `deal` stream (`sim/seeds.ts`). The vendetta draw stays on the
`vendetta` stream keyed by seat (GDD 3.20).

| Step | What happens | Draws |
|---|---|---|
| 1 | Count the humans, H. With H = 1 it is story mode (9), and with H = 2 it is Paint The Town Red (1.6), not this deal | none |
| 2 | One human is dealt the Killer card | `deal` |
| 3 | The Killer draws one vendetta among the Zealot, Activist and Bandit rows whose minimum is at most H and whose map rule holds (`maps`, `needsScene`, as today). The Hitman row is never drawn here (owner answer WM10) | `vendetta:<seat>` |
| 4 | That vendetta's partners go to humans (1.3) | `deal` |
| 5 | Each remaining human gets a random roster card, except the Accomplice below 6 humans. No card is reserved for the law (owner answer WM2) | `deal` |
| 6 | The Hitman's arrival is drawn: whether he comes, on which day, and whether a human or an NPC is turned (1.5) | `hitman` (new, secret) |
| 7 | The Killer picks, on the role card, which NPC-held card to wear (4) | none (a choice) |
| 8 | An NPC seat is created for every card still unheld except the worn one. NPC names come from `npcNames`, as today | `npcNames` |

| Humans | What the deal allows |
|---|---|
| 1 | Story mode (9) |
| 2 | Paint The Town Red: both humans are Killers, with no vendetta (1.6, owner answer WM3) |
| 3-10 | Zealot, Activist, Bandit; the Hitman may arrive (1.5) |
| 6-10 | A human may also be dealt the Accomplice |

**Why the Accomplice waits for 6 humans.** A human Accomplice takes one human away from the village side. Below 6
humans, a human Accomplice beside the Killer would leave at most 3 humans on the village side.

`players.max` stays 10 humans. The room's seat count becomes the roster size minus the worn card (8). That count is
the same in every match of a map: the Bandit (4) is the one exception, and its look is public anyway (4.2).

### 1.5 The Hitman's arrival (owner answers WM9, WM10)

The owner, verbatim: "the hit man can (lower to higher chance depending on player pool) appear anywhere between days
3 and 5. when the hitman arrives everyone will see signs. as soon as the hitman is active, that roles place in the
town goes dormant, this causes a noticeable shift in the economy that by going to the individual roles houses you can
find out who the hitman is and try to stop them, if you fail report what you saw as fast as possible before they reach
the train, if you fail again they win in one day." And: "in player parties of 3 the hitman is never human, at 4 very
low chance, at 5 low chance, 6 40% hitman will be player, and so on, max player pool hitman 100% percent appears and
is human".

**How it is drawn.** At Start, on a new secret stream `hitman` (`sim/seeds.ts`), the server draws three things and
tells nobody: whether the Hitman comes, on which day (3, 4 or 5, uniform), and whether a human or an NPC is turned.

| Humans | Comes (P) | Human, if he comes (P) |
|---|---|---|
| 3 | 0.5 | 0 (owner) |
| 4 | 0.6 | 0.1 ("very low") |
| 5 | 0.7 | 0.2 ("low") |
| 6 | 0.8 | 0.4 (owner) |
| 7 | 0.85 | 0.55 |
| 8 | 0.9 | 0.7 |
| 9 | 0.95 | 0.85 |
| 10 | 1 (owner) | 1 (owner) |

The numbers would be new `balance.json` keys under `hitman.byHumans`. The owner fixed 3, 6 and 10; the rest are
proposals that rise evenly.

**Who is turned.** The lore's Hitman returns: "nobody starts as the Hitman" (Codex, Contract), the mail turns a
townsman into one. On the arrival day's `train.delivery`, the black-wax letter reaches one seat:

- a human, if the draw says human: any human who is not the dealt Killer, the Accomplice or a vendetta partner, drawn on
  `hitman`;
- else an NPC seat, drawn the same way. The engine keeps an NPC Killer (open question 1, answered by the third
  follow-up), and the human-Killer rule binds the dealt Killer only (12, R5).

The turned seat keeps its card in public and its life in private: it is now a cover role whose worn card is its own,
and its Private view gains the Hitman's contract and true look (4.4).

**The signs.** At the arrival, everyone sees a public sign that names nobody: the black-wax mailbag on the platform, a
crow on the station roof, and a line in the dawn manifest, "A stranger's coat was seen on the 6:10" (`phases.md` 2).

**The dormant role.** From the arrival, the turned seat's role stops doing its town work: its stall does not restock,
its station stays cold, its home shows a dark window, and the "what breaks when I'm gone" row of its role
(`round10-plan.md` 5) takes effect as if it had died. A turned NPC simply stops its routine there; a turned human can
still work, but each day's output of its role drops to `hitman.dormantOutput` (P: 0) of normal. The shift is a fact of
the world, seen by walking to the houses; no field ever names the turned seat (12, R16).

**Stopping him, in two chances.**

| Stage | What the town does | If it fails |
|---|---|---|
| 1. Find him | Read the economy: the dormant house names the role, and the role names a look. Petition and run a manhunt (3.1) | The Hitman makes the kill after dark |
| 2. Report before the train | From the kill to the next morning's train, any seat may report what it saw to a Constable (a look and a scene, 3.1). A report with a matching Verified entry convenes an immediate manhunt at the station | He boards the train: the Contract victory, one day after the kill ("they win in one day") |

A Hitman cuffed at either stage goes to a Tribunal (`phases.md` 4), and a murder conviction stops him (5).

### 1.6 Two humans: Paint The Town Red (owner answer WM3)

The owner, verbatim: "in two players as killers vs the NPCs and environment. goal 'Paint The Town Red', kill as many
NPCs roles as possible before you get caught. each kill counts towards the win even if they come back but duplicate
kills don't count towards wins just total kills."

| Rule | Design |
|---|---|
| The deal | Both humans get the Killer card, with no vendetta. Each picks a worn card (4.1). No Hitman arrival |
| The town | Every other roster card is an NPC seat. The Constables (3.1) hunt the Killers; with no human on the town side, the Constables file their own petitions (12, R3) |
| The score | A kill of a roster NPC seat counts once toward the win (its unique count) and every time toward the total. A seat killed, returned by train and killed again adds to the total only |
| The train | Every NPC death returns on the next morning's train, after dark too, so the town never runs out (12, R4) |
| Caught | A Killer convicted of murder is hanged (5) and its run ends. The other Killer plays on |
| The win | The two share the **Paint The Town Red** victory when their combined unique count reaches `paintTown.winUnique` (P: half the NPC seats) before both are caught or the end trial closes. The ledger ranks them by total kills (`phases.md` 7) |

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
| Hitman | Kills the mark, then boards the next train out | Vendetta: Contract | lore (Bible I.5 IV). Mailed to a townsman between days 3 and 5 (1.5, owner answers WM9, WM10) |
| Paint The Town Red (2 humans) | The pair's unique NPC kills reach the target before both are caught | Paint The Town Red | owner answer WM3 (1.6) |
| Any Killer, not stopped | Reaches the end trial (6) unconvicted, with the vendetta unfinished | Unseen (a lesser victory) | 9A, from today's "the Final Night vote fails" (GDD 3.8) |
| Accomplice | The Killer wins in any way | Shares the Killer's kind | GDD 3.2 ("As Killer") |
| Drifter | Is convicted to death at a trial | Gallows | lore (Codex, "wants to be chosen for it"); was "get ejected" (GDD 3.2) |
| Detective, Police Officer, Judge | Stops the Killer by a petition, a manhunt and a conviction it filed the evidence for (route 1) | Law | lore (Bible I.6); the arrest is now the manhunt's (3.1, owner answer WM2) |
| Any human who signed and cuffed | The cuffed suspect is convicted of murder (route 1) | Law | owner answer WM2 |
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
| **1. Evidence and arrest** (owner answer WM2) | Evidence builds against one suspect (from any seat, and from the Constables' briefings). A human launches a **petition** to pursue the suspect; once signed, a **manhunt** opens (3.1). Whoever cuffs the suspect brings him to the county jail, which opens a **Tribunal** (`phases.md` 4). The verdict is computed from the evidence and the sentence from the crime (5). A murder conviction stops the Killer | The seat that cuffed, the petition's signers, and every seat whose Verified entry the verdict counted | Law |
| **2. Role goals** | A role goal that foils the vendetta: the Vicar converts everyone before the Zealot's Mass; the Clerk keeps the Baron alive until nightfall; the Bartender guns down the Bandit; the Postmaster burns the contract; Nightshade or the Last Shot takes the Killer; the task bar fills first | The seat whose goal did it (for the task bar: every seat that finished a chore) | That role's kind (Peaceful, Heir, Bounty, Dead Letter, Role, Town) |
| **3. The end trial** | After the Final Night hunt, the **end trial** (`phases.md` 5) tries every filed case, strongest first. A conviction of the Killer stops it. With no case strong enough, the Killer is Unseen (2) | The seat that filed the convicting case | Verdict |

Rules that hold for all three routes:

- **No votes.** Nobody casts a vote anywhere in world mode. A verdict comes from the Case Board, which the server
  already scores (GDD 3.4 "Case Board": the suspect set is built from Verified traits).
- **The first stop counts.** Once one route stops the Killer, the Killer cannot win, and the other routes still
  award their victories to the seats that also met them.
- **The match ends** when the Killer is stopped and every open personal goal is settled, or at the end of the end
  trial, whichever comes first.
- **Stopped is not always dead.** A Killer convicted only of a lesser crime (5) is not stopped: Bible I.6 says the fine
  "resets their active heist/sabotage checklist without killing them". Only a murder conviction, a death after dark or
  a foiled vendetta stops the Killer.

### 3.1 The law: Constables, petitions and the manhunt (owner answer WM2)

The owner, verbatim: "law enforcement NPCs. they work the same, but at a quicker rate and leave briefing 30s after any
clue is created, there is a petition request form the players can launch whether to pursue and bring to trial the
perpetrator, this is how random npcs or non-killer roles end up in jail, face a fine, meet the gallows, or dismiss
cases. this replaces the bell which can now only be used to gather NPCs for tasks like the activist, vicar, or other.
this results in different things for differnt roles, the default for no purpose is just a ding. also when a petition
is signed by the players, a man hunt period is convened where you hunt the suspect and cuff them but be careful you
could always lose the fight so travel in pairs or groups. there should also be a feature to pair up with NPCs at night
to stay safe, it should be an added section in inspect."

**The Constables.** A new class of figure, not seats (like the townsfolk of GDD 3.24), so they may talk (`living-world.md`
1.1). Two per map (P), wearing a new figure look `constable` (beside `villager`; `gdd-map.md` 3.17). They work the
Detective's way: they walk to clues, inspect them and verify their traits, at `law.speedMult` (P: 2) times a
Detective's rate. They read only what the world shows (a clue, a sighting, a Notice), never a card.

**The briefing.** `law.briefingAfterS` (owner: 30 s) after any clue is created, the Constables post a **briefing**: a
public line on the police board and in every HUD log, "Constables' briefing: a footprint by the bakery door, a tall
figure", naming the clue's kind, its scene and any trait they have verified by then. It names a look's traits, never a
seat or a card, and a Forged clue is briefed like any other until someone verifies it as Forged.

**The petition.** Any living, free human may open a petition at the police board or from the Case Board: pick one
accused figure (by character, 4.3) and a charge (the crimes of 5). It lists the entries that support
it. It opens a manhunt once signed by the opener and `petition.signaturesMin` (P: 1) other living, free humans within
`petition.openS` (P: 60 s), else it lapses. It is not a vote (12, R3): nobody votes against anyone, the accused is
never removed by it, and the verdict still comes from the evidence at the Tribunal. NPCs may sign, but a petition never
waits for one.

**The manhunt.** A world phase, not a pause, of `manhunt.durationS` (P: 120 s, a quarter of the day): the accused's
figure is marked on every signer's map, and any seat may cuff it.

- **Cuffing** is a hold of `law.cuffHoldS` (P: 3 s) next to the accused, stopped if the accused moves away or strikes.
- **The accused can fight back.** Fists and weapons knock out (GDD 3.22); a knocked-out hunter is robbed by the rules of
  lw9 (8). So "travel in pairs or groups": two hunters can cuff while one is struck. A Killer may use the Knife only
  after dark, as always.
- **The Constables join** every manhunt and cuff at their own rate. With no human left free to hunt, they finish it.
- **When it ends.** On a cuff the accused is walked to the county jail and the Tribunal opens. If time runs out, the
  case stays on the board and a new petition may open after `petition.cooldownS` (P: 120 s).

**The bell now only gathers NPCs.** The bell no longer opens a meeting. Ringing it calls the NPC figures and seats in
the scene to the square for a role's own purpose, and what it does depends on the ringer's card:

| Ringer | What the gathering is for |
|---|---|
| Activist | The Public Unrest act: a crowd to rouse (Bible I.5 II) |
| Vicar | A sermon: the gathered NPCs gain Faith toward conversion (2, the Vicar's Peaceful win) |
| Zealot | Followers counted for the Following (2) |
| Company Clerk | The rent round: debtors gather to pay (`emergent-play.md` T7) |
| Anyone else | A ding, and nothing more |

The effect is the ringer's own, so watching who answers the bell tells nothing of the ringer's card that the effect does
not show; a cover role who rings gets the ding (the worn card's purpose is a power, and a look is not a power, 4.1).

**Pairing up at night (inspect).** The inspect panel (GDD 3.4 "Inspect") gains a section, **Walk with me**, on every
figure, human or NPC, seat or townsperson. A request pairs the two until dawn: the partner follows within 2 tiles, and
a pair counts as "not alone" for the Killer's and the NPC's alone-kill rules. A human answers it; an NPC answers after a
delay drawn like a human's, and may refuse (12, R6). A pair is no shield against a partner who is the Killer.

## 4. Disguises

The owner, verbatim: "The killers get to chose which NPC role to fill, they get disguised as that character, they
have to perform life as a villager, unless your the bandit they wear their own skin because they are fundamentally
different. Killers should also have their own looks when they look at their screen vs when everyone else sees
them."

### 4.1 The Killer's pick

Today a cover role picks among the undealt cards and may wear a dealt one, which doubles a look (GDD 3.17, "The cover
pick"; `deck.ts:50`). World mode keeps the mechanism and changes what is offered:

- **What is offered.** On the role card, the Killer's picker lists every card the deal gave an NPC (1.4 step 6),
  apart from two kinds: its vendetta's partners, which are human, and the Accomplice and the Drifter (owner answer WM2: the
  Detective is no longer reserved for a human).
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

**The lore's Hitman (owner answers WM9, WM10).** The Hitman is no longer dealt at the start. He is mailed to a townsman
between days 3 and 5 (1.5), which is the lore's own version: "nobody starts as the Hitman" (Codex, Contract). The
turned seat's true look becomes `hitman` on its own screen from the delivery, and its public look stays its card's.
The Postmaster's Handler road (2) still shares the Hitman's win.

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

**The sentence depends on the crime (owner answer WM11).** The owner, verbatim: "death is crime dependent, kill=death,
conspiring with killer = fine + demotion from gained role + jail (only applies for minion types, brute types, and
extortionist types not religious types like cultist or priest). continue this logic for the rest of the crimes, rumors
turned to a case = fine, etc". So the score decides only whether the charge is **proven**; the charge decides the
sentence.

| Score | Finding |
|---|---|
| Any exclusion, or fewer than `trial.convictAt` (P: 2) matches | **Dismissed.** The accused walks, with `trial.acquittalGraceS` (30 s) of protection from a new petition |
| `trial.convictAt` matches or more | **Proven**, for every charge but murder |
| `trial.murderAt` (P: 3) matches or more, or the suspect set is exactly the accused (GDD 3.4) | **Proven**, murder too |

A murder charge with 2 matches is proven as the lesser charge the petition named beside it, else dismissed.

| Crime | Who can be charged | Sentence |
|---|---|---|
| Murder (a kill) | Anyone | **Death**: hanged, dies for good, the role shown (`phases.md` 4) |
| Conspiring with the Killer | Minion, brute and extortionist types: the Accomplice, the Fence, the Handler, the Grave Robber, the Ration Tyrant, the Extortionist (a new `crimeType` tag on cards and evolutions) | **Fine** (the purse) + **demotion** (an evolved road returns to its base card; the Accomplice loses the Inherit right) + **jail** until the next dawn (5.1) |
| Conspiring, religious types | The Zealot's followers (cultists) and a priest's road | Not the sentence above (owner). Proposed: **Defrocked**: Faith set to 0 and the chapel's services barred for the match. New question to the owner (12) |
| Robbery and heist (the Bandit's acts, a mugging, a knockout robbery) | Anyone | **Jail** until the next dawn, and the goods go to the town chest (8; owner answer LW9). A Killer's vendetta checklist resets (Bible I.6) |
| Assault (a knockout, no robbery) | Anyone | **Jail** until the next dawn |
| Sabotage (the Activist's acts) | Anyone | **Fine** + **jail** until the next dawn; the checklist resets |
| Theft (an owned shelf, `logic-table.md` 10) | Anyone | **Fine** of `trial.theftFineMult` (P: 2) times the goods' price, the goods returned |
| Trespass (a picked lock, a broken door) | Anyone | **Fine** (`trial.trespassFine`, P: 4 Scrip) |
| Rumour turned to a case (a Blackmail Notice that reached a petition) | Anyone | **Fine** (owner) |

A fine takes what the purse holds and never the bank; a seat that cannot pay serves the shortfall in jail (P: until
the next dawn). The keys would be new in `balance.json` `trial`. A Doubted or Forged entry never counts, so the
Accomplice's plants (GDD 3.2) work only until someone verifies them, as today.

**This is how NPCs and non-Killer roles reach jail, a fine or the gallows** (owner answer WM2): a petition may name
any figure that is a seat, and the evidence and the crime decide the rest. A townsperson figure (GDD 3.24) is never a
seat, so it is never charged.

### 5.1 The county jail (owner-brief follow-up 2, owner answers LW9, LW10)

A single-room cell scene that holds several seats at once, on a new prefix (`cj.`, ids appended to `SCENE_IDS`; GDD
3.13), one per map region (P: one shared by HollowMere and BlackPine). A jailed seat:

- is placed in the cell and cannot leave by any portal until its sentence ends at the next dawn's train (the release
  is announced in the manifest, `phases.md` 2);
- is not "active" for sleeping (7.3, owner answer NW1), and cannot sign petitions or hunt;
- can talk to its cellmates, and can play the **jail mini-games**, each once a day:

| Mini-game | Kind reused (GDD 3.16) | Result |
|---|---|---|
| Hit the gym (the yard) | tap | Win: Strength up for the match (P: fists and weapons +2 damage). Lose: nothing |
| Yard fight (owner answer LW10) | crates | Win: a small purse from the loser's stake (P: 2 Scrip from the jail pot). Lose: max health −10 for the rest of the match (the replacement for the scene the owner's brief named) |
| Scrub the cells | pour | A Scrip of wage, and one hour (P: a tenth of a day) off the sentence |

A Killer in jail is out of play for the night, which the Killer feels: it cannot strike from a cell.

## 6. The train brings back the day's dead

The owner, verbatim: "The train brings in people who died in the day back the next morning by train".

**The reading.** 9A reads "in the day" as the daylight phases: grace, day and immunity. A death after dark (dusk,
night, the Final Night) is for good. Why:

- the Knife works only after dark (GDD 3.3), so its kills keep their weight;
- the vendettas that need a death (the Vicar, the Baron, the mark) still mean something;
- the Vicar's martyrdom stays possible.

The other reading, "any death of that game day", would undo every kill each morning. The owner kept daylight only
(owner answer WM5: default). The one exception is Paint The Town Red, where every NPC death returns (1.6; 12, R4).

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
| Debt (owner answer WM1) | none | Arrives **Owing the line** (below): the fare is a debt, and the seat's trade suffers until it is paid |
| View | The **On the line** screen (`phases.md` 6): a dark carriage and the time to the train. No ghost view, no roles, no ghost chat | The world, at the platform |

**A death hurts the town, and the returner comes back in debt (owner answer WM1, third follow-up).** The owner, in
chat: "the gameplay isn't dependent on the killer the kill is the variable that starts the games downward spiral",
and in the questionnaire: "it doesn't have enough of a repercussion, players when they die and come back are indebted,
this causes there prices to rise, stock to be lower than normal and more." So a death costs the town twice:

1. **While the seat is gone**, its role's town work stops: the "what breaks when I'm gone" row of every role
   (`round10-plan.md` 5). The Baker gone means no bread; the Lamplighter gone means the streets go dark sooner and
   creatures come closer; the Doctor gone means wounds stop healing; the Vicar gone means Faith dries up.
2. **After the train**, the seat is **Owing the line**: it owes the fare, `respawn.fareDebt` (P: 6 Scrip, one rent),
   to the Company Clerk, and every death adds another fare. Until the debt is paid:
   - its role's goods and services cost `respawn.priceMult` (P: 1.5) times as much, from its stall or its hands;
   - its stock restocks at `respawn.stockMult` (P: 0.5) of normal, and its daily output (bread, lamp oil, cures) is cut
     by the same factor;
   - its own wages and sales pay `respawn.wageMult` (P: 0.5), the "and more" (the Company takes its cut);
   - the debt is paid like rent (Scrip or labour, `emergent-play.md` T1, T2) and the Clerk collects it from the purse.

   An NPC seat owes the line like a human, so a dead NPC Baker's dear, thin bread is the town's lasting cost. Owing the
   line is not the rent's **Indebted** status and brings no curfew by itself (12, R7).

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
| Inherit | The Accomplice takes the Knife when the last Killer dies (GDD 3.2) | Only on a death after dark, and only a human Accomplice inherits. Otherwise the human-Killer rule would break (open question 1). A Hitman's death never passes the Knife: he is an arrival, not the dealt Killer |
| Prices and stock | Fixed per shop (`economy.json`) | Owing the line moves the returner's own prices and stock (above, owner answer WM1) |

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
| `finalNight.afterCycle` | 5 | 5 | K | About 70 min of world time (owner answer WM6: keep 5 cycles) |
| `finalNight.huntS` | 45 | 135 | N | |
| `finalNight.killCooldownS` | 20 | 60 | N | |
| `finalNight.trialS` | 120 | 120 | K | Now the end trial's discussion |
| `finalNight.skipAllowed`, `.tieEjectsNobody` | flags | removed | none | No vote |
| `impersonate.durationS` | 15 | 45 | N | |
| `impersonate.cooldownS` | 45 | 135 | N | |
| `snowball.killCooldownPenaltyS` | 10 | 30 | N | |
| `snowball.lastKillerCooldownDeltaS` | -5 | -15 | N | |
| `body.famishedAfterS` | 480 | 1680 | C | About 2 cycles, as today |
| `tasks.martyrS` | 600 | 2100 | C | The owner's "10 minutes", stretched (owner answer WM7: default) |
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

**New keys the owner answers add** (all proposals, each owned by the section named): `hitman.byHumans.*` (1.5),
`paintTown.winUnique` (1.6), `law.speedMult`, `law.briefingAfterS` 30 (owner), `law.cuffHoldS`, `petition.*`,
`manhunt.durationS` (3.1), `trial.convictAt`, `trial.murderAt`, `trial.theftFineMult`, `trial.trespassFine` (5),
`jail.*` (5.1), `respawn.fareDebt`, `respawn.priceMult`, `respawn.stockMult`, `respawn.wageMult` (6) and `sleep.*`
(7.3). They replace the round-9 `trial.fineAt` and `trial.deathAt`.

### 7.2 What the numbers do

| Measure | Today | Proposed |
|---|---|---|
| A cycle | 230 s | 810 s |
| Dark time per cycle (dusk and night) | 110 s | 330 s |
| Strikes per Killer per night at the 6-7 row | 3 (110 / 35) | 3 (330 / 105) |
| Match, 5 cycles plus the Final Night, without pauses | about 20 min | about 70 min |
| Day vs night | 120 / 100 | 480 / 300 |

### 7.3 Sleeping skips the night (owner-brief follow-up 2, owner answers NW1, NW2, EP3)

The owner, verbatim: "I'd also like to add sleeping in your bed, when all active players do this the game skips
night."

- **A bed is a hold.** Every role's home has a bed (a new `bed` prop kind at each home's existing bed dressing, no id
  renamed). Holding the action key at your own bed after dusk starts **asleep**: the screen dims, the world's sound
  drops, and any move or a hit wakes you.
- **Who counts.** Only active players: living, free and connected humans (owner answer NW1). Ghosts, seats on the line
  (6), seats in jail (5.1) and disconnected seats are left out. NPCs never count and never hold the night open
  (second follow-up: "the game should never have to wait on NPCs").
- **The skip.** When every active player is asleep for `sleep.confirmS` (P: 3 s), the night ends as a normal dawn
  does (owner answer NW2): the Knife's window, night creature spawns and night tasks end early, and the morning train
  comes. A human Killer who stays awake is not in bed, so the night cannot skip while he is up (NW2).
- **Asleep is vulnerable.** A sleeper is alone for the alone-kill rules unless paired (3.1), and a strike or a bite
  wakes it after the damage lands.
- **No bed, no skip.** A boarded-up house (rent, owner answer EP3) has no bed. A seat without one may sleep on a
  chapel cot (free) or rent a tavern bed (P: 2 Scrip); a seat with neither cannot sleep and so holds the night open,
  which is the price of the debt. The cot and the tavern bed are a proposal and a new question (12).

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
| Wolf bite | 25 | 12. Kills only on the bite that takes the last health (owner answer LW11: default; `living-world.md` 6.1) |
| Boar bite | 18 | 9, as above |
| Bat bite | 6 | 3, as above |
| Rat bite | 5 | 2, as above |
| Fists, mugging, slingshot, weapons | knockout at zero | Knockout at zero, and never a death. A knockout by a seat can be reported as assault; the attacker may rob the victim of everything it carries except role-bound kit (owner answer LW9; 12, R1, R14) |

**No seat kills a seat, except the Killer (owner-brief follow-up 2, owner answer LW9).** The owner, verbatim: "beating
someone till knock can get you reported, other player doesnt die just loses all there stuff, if the abuser gets caught
the victim can get their stuff back from the town chest, but hurry up other players can get to it first if they know
about it". So:

- **The knockout.** Fists or a weapon take a seat to 0 and it is knocked out (`body.koS`, GDD 3.22), as today. It never
  dies of it.
- **The robbery.** The attacker may then hold over the victim (P: 3 s) to take everything in its pack, belt and purse.
  The victim's armour, its bound kit (the Knife, the Fowling Piece, the Magnifier and every `roleBound` item) and its
  bank are never taken (12, R14).
- **The report.** The victim, or any witness, can petition against the attacker on a charge of assault, or robbery when
  goods were taken (3.1, 5). The victim's own sighting is a Verified entry.
- **The town chest.** If the attacker is convicted, the stolen goods it still carries go into the town chest, the hub's
  lost-and-found (`logic-table.md` 6.4, owner answer LT3). The verdict card says so in public; the victim is told
  privately. Anyone may take from the chest, first come, so the victim must hurry.
- **Who dies at all.** Only the Killer's strike and a creature's bite take health to 0 as a death; Nightshade, the Last
  Shot and a death sentence kill outright as before.

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

**One player, several roles (third follow-up, owner answer WM1B).** The owner: "a story mode would have you completing
multiple roles thematically through a single game including the killer". So a story is one match in several
**chapters**, and the player's seat moves to a new role at each chapter break, at set story points, the Killer among
them. Each role's part is a short thematic chapter. At a break:

- the chapter card (`phases.md` 8) closes the old role and opens the new one;
- the old role's seat is handed to the NPC brain, which carries on its routine from where the player left it;
- the new role's seat is handed to the player, with its own Private view; nothing of the old role's private view
  carries over except what the story's beats hand on (a letter, a lead);
- the Killer's chapter shows the true look on the player's screen (4.4), as in multiplayer.

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
| `story.json` (new content) | The chapters. For each: map, the player's card for that chapter (several per story, WM1B), the Killer's vendetta (held by an NPC outside the Killer's own chapter), the seed words, and the **beats**, each a trigger (a `SimEvent` pattern on the bus, `sim/events/bus.ts`) and an action (a cutscene, a line, a quest step, an NPC order) |
| A beat runner | A Step stage that watches the bus for each beat's trigger and runs its action once. It writes nothing secret to a public field |
| The menu entry | "Story" on the title screen. It opens the chapter list and starts a story room |
| Chapter cards | `phases.md` 8 |

**Scope for round 10 (owner answer WM1B).** One story on HollowMere in three chapters, built from today's cards: the
Baker's day, then the Watchman's night, then the Bandit's heist, with the Fence road as the turn. A seat handover at a
chapter break is new harness work (a seat that changes controller mid-match). The trades' chapters follow their cards.

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

**All answered (owner, 2026-10-25; `owner-answers.md`).** The list below is kept as it was asked; the answers rule.

| # | Question | Answer | Where it landed |
|---|---|---|---|
| 1 | Function with the Killer | The third follow-up and WM1: the world works without depending on the Killer, every death hurts the town, and a returner comes back indebted. The engine keeps the NPC Killer | 6, 1.5, `round10-plan.md` 5 |
| 2 | The third human | WM2, different: the law is NPC Constables, with petitions and manhunts; the bell only gathers NPCs | 1.3, 3, 3.1 |
| 3 | Two humans | WM3, different: Paint The Town Red | 1.6 |
| 4 | Nameplates | WM4, default | 4.3 |
| 5 | The train's "in the day" | WM5, default | 6 |
| 6 | Match length | WM6, default: 5 cycles | 7.1 |
| 7 | The martyr's ten minutes | WM7, default: stretched | 7.1 |
| 8 | The trades | WM8, default: interim partners | 1.3 |
| 9 | One Killer | WM9, different: the Hitman may arrive on days 3 to 5 | 1.2, 1.5 |
| 10 | The Hitman at the start | WM10, different: never dealt; human by party size | 1.5, 4.4 |
| 11 | Verdict thresholds | WM11, different: the sentence depends on the crime | 5, 5.1 |

Each had 9A's proposed default:

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

## 12. Reconciled

Where an owner answer met another rule, this is how the design settles it. Each item is marked where it applies.

- **R1. Player kills and the jail (LW9 against follow-up 2).** Follow-up 2 said a player-on-player killing ends in a
  day in the county jail; LW9 then said nobody dies of a beating. Settled: no seat kills another, except the Killer's
  strike. A beating knocks out and may rob; assault and robbery are crimes whose sentence is jail until the next dawn
  (5, 5.1, 8). The 9A rule "only the Killer's strike and a creature's bite kill" stands, and LW9's options (a) and (b)
  both retire.
- **R2. The bell (WM2 against the Inquest and the Tribunal).** The bell opened meetings and, in 9A, the Tribunal. Now an
  Inquest opens only on a reported body, and a Tribunal opens when a cuffed suspect reaches the county jail. The bell
  gathers NPCs for the ringer's own purpose, else it dings (3.1; `phases.md` 3, 4).
- **R3. The petition against "voting has got to go".** A petition is a signature threshold to start a manhunt. Nobody
  votes on guilt, nobody is removed by it, and the evidence alone decides the verdict at the Tribunal. A petition never
  waits on an NPC. In Paint The Town Red, with no human on the town side, the Constables open their own petitions on a
  briefing that fits one figure (3.1, 1.6).
- **R4. Paint The Town Red against one Killer, the human-Killer rule and WM5.** Two humans are both Killers (an
  exception to 1.2). Both are human, so the human-Killer rule holds. "Each kill counts towards the win even if they come
  back" needs NPCs to return after a night death, so in this mode every NPC death returns on the morning train, while
  the Killers' own deaths after dark are for good.
- **R5. The Hitman's arrival against "a human always holds the Killer".** The rule binds the dealt Killer. The Hitman
  is an arrival, mailed to a townsman, and may be an NPC by the owner's own table (WM10). He never inherits or passes
  the Knife.
- **R6. Pairing up with NPCs (WM2) against "NPC seats never talk" (`living-world.md` 1.1).** Walk with me is in the
  inspect panel of every figure, human, NPC seat or townsperson, and every answer, yes or no, comes after a delay drawn
  from the same distribution. So a pairing answer tells nothing about who is a person.
- **R7. Owing the line (WM1) against the rent's Indebted.** Indebted is the rent's status and carries the curfew. Owing
  the line is a second debt in the same ledger with its own effects on prices, stock and wages, and no curfew of its
  own. A seat that owes both has both.
- **R10. The verdict (WM11) against 9A's thresholds.** The score says whether a charge is proven; the crime sets the
  sentence. Murder keeps the higher bar of 3 matches, so the old `trial.deathAt` 3 lives on as `trial.murderAt`.
- **R11. Sleeping against the Killer, the jail and rent.** A human Killer awake holds the night open (NW2); jailed seats
  and seats on the line do not count (NW1); a boarded-up house has no bed (EP3), so a homeless seat sleeps on a chapel
  cot or a tavern bed, or holds the night open (7.3).
- **R14. Robbery against role secrecy.** "Loses all there stuff" cannot include role kit: a robbed Knife would name the
  Killer. Bound kit, armour and the bank stay with the victim; everything else in its pack, belt and purse can be taken
  (8).
- **R16. The Hitman's dormant role against role secrecy.** The economy shift is world state that anyone sees by
  walking to the houses (a cold oven, an empty stall). No field, toast or list ever names the turned seat or says that a
  Hitman is active beyond the public signs (1.5).

R8, R9, R12, R13 and R15 are in `logic-table.md`, `living-world.md` and `emergent-play.md`. The full list is in
`gdd-map.md` 4.
