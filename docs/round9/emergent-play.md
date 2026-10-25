# Round 9: emergent play (9C)

Session 9C, plan item 6. Design only: this document changes no code, data, test or `GDD.md`. It answers part 10 of the owner's brief (`owner-brief.md`):

> Players should be able to work with features to create their own way of playing like the rouge who refused to buy bread and gathers food instead and makes his own lock picks to avoid paying taxes, this is something only a person could easily come up with but the game logic needs to think about all of those possibilities.

The systems it walks through are in `living-world.md` (the loops, chores, chat, gear, bosses and achievements) and, for the rules of each tool and object, 9B's `logic-table.md`. 9B landed as draft #266 (head `6106134`) and the ids below follow it; the few things its table does not yet have are tagged **[T:]** and listed as requests in section 5. A number marked **(P)** is a proposal; one with no mark is quoted from `GDD.md` or the data.

**Owner answers folded in (9D, 2026-10-25).** `owner-answers.md` overrides this document where they disagree. EP1 to EP5, EP7 and EP8 took the default; EP6 differs (the rogue is a way of using the game, 1). Three answers from `logic-table.md` change the rogue's paths: piles open only to their tool (LT1), the lock-pick mini-game and its scratch replace the hold and the print (LT2), and stock runs down and comes back (LT7). Sleeping and the boarded house come from the second follow-up. Changed paragraphs are marked "(owner answer <ID>)" or "(follow-up 2)", and section 6 lists the reconciliations.

## 1. The rule behind the example

The rogue is not a role. He is a **pattern**: a player who looks at three things the game asks him to do and finds a way not to do them. **The owner sharpened it (owner answer EP6):** "rouge stands more for players intentional using other elements of the game to work around challenges". So the rogue is any card's player who, on purpose, meets a challenge with a system that was not built for it: a snare for a meal, a lock pick for a curfew, timber for the rent, a chapel cot for a boarded house. Rule E4 states that. A game "thinks about all of those possibilities" only if its rules were written that way. This document turns that into three rules that the logic table must satisfy, and one test that checks them.

| # | Rule | Meaning |
|---|---|---|
| E1 | **Every need has at least three sources.** | For each thing a player must have (food, a tool, a pass through a door, a debt cleared), at least three of *buy*, *make*, *find*, *earn* and *skip* work. |
| E2 | **No gate has a single key.** | A locked thing opens to a tool, a skill or a favour, never only to one purchase. |
| E3 | **Every shortcut has a price.** | A way round costs time, risk, a clue or standing. It is never free, so no path is strictly best. |
| E4 (owner answer EP6) | **Every challenge has a sideways answer.** | For each challenge the game sets (a locked door, a debt, a curfew, a creature, hunger, a boarded house, a sentence), at least one working source comes from a *different* system than the one that set it: a craft answers a lock, labour answers a debt, light answers a creature. The coverage test lists each source's system and fails a challenge whose sources all share the challenge's own system. |

**The coverage test.** The logic table carries a `needs` list: food, light, a door, a debt, a tool, a cure. A script (the same kind as the prop audit in the README's checks) reads it and fails if a need has fewer than three working sources, or if a gate has one key. It runs in CI beside the content tests (owner answer EP7: default), so a future change cannot quietly remove a path; E4 adds a `system` field to each source. 9B owns the table, and this document supplies the cases below as its first test data.

## 2. The rogue, step by step

The rogue is a seat of any card (rule 5 of `living-world.md` 0: gear, chores and errands are role-neutral). I use the Thief for colour only. Each step is labelled:

- **Today**: it works in the round-8 build.
- **New**: it needs a rule this round designs.
- **[T:]**: it needs something 9B's table does not have yet (a request, section 5).

When a step is blocked, the player sees a reason in the world's voice (owner brief, part 8), never "can't do that yet". The lines below are examples for 9B's `failures.md`.

### 2.1 Refuses to buy bread: gathers food instead

**The need.** The bakery sells flour and the Wake Loaf, and `famished` cures with `food`. The rogue will not pay the 3 Scrip. He needs about one meal a day (hunger rate: 9A).

| Path | Steps | Today / New | If blocked, the line |
|---|---|---|---|
| **F1 Forage and cook** | 0. Depletion is on (owner answer LT7): a node somebody, or an NPC, just stripped comes back after its respawn, so the rogue may find it bare and walk on. 1. Gather Mushrooms and Herbs at the Gallows Wood or Fenwood nodes (hold, 2 s; nodes keep bare hands, owner answer LT1). 2. Gather Berries from a wild bush [T: berries node]. 3. Cook a Stew at an oven (Crumb's Ovens or the bunkhouse) from Mushrooms, Herbs and water [T: stew recipe]. Or bake a Wake Loaf from Flour at an oven, which 9B already adds (9B 9.4). 4. Eat. The `eat` event clears Famished and Hunger. | Gather today; berries, stew and `eat` of a crafted meal **New** | "You are hungry, and there is nothing here to cook with." / "The mushrooms are raw. You'll need a fire." |
| **F2 Raw and risky** | Eat Mushrooms or Berries uncooked. A cooked meal heals more. Raw food has a chance (P: one in three) of Poisoned, which cannot take health below 1 (effects stop at 1 HP, `living-world.md` 6.1; owner answer EP1: default). | **New** | "That did not agree with you." |
| **F3 Trap and hunt** | 1. Craft a Snare (2 Herbs, 1 Timber, anywhere; today). 2. Set it on a game trail (9B has the snare verb: set and disarm). 3. Return later and take Game [T: game item]. 4. Cook at an oven. Or hunt with a Club or a Hatchet, and skin the corpse for hide with a role-neutral tool [T: `living-world.md` 5.4], at the cost of a bite or two (12 from a wolf, 9 from a boar, P). | Snare craft today; the verb is 9B's; Game **New** | "The snare is empty. Nothing came by." / "The wolf has torn it." |
| **F4 Work for it** | Stoke the oven at Crumb's (a chore, `living-world.md` 2.2). Mrs Crumb pays one loaf for the shift (P). Or do the *Fetch the flour* task and keep the sack. Or work a section of the bakery (owner answer LT1: the flour bin, mixing, proofing, the cold room, shaping, the oven, `logic-table.md` 7.1) and keep a part; a whole dish sells high or pays rent in kind. | Chore **New**; the task and the sack exist | "Crumb waves you off. Come back when the ovens need stoking." |
| **F5 Errand** | Moll's mushrooms (3 Mushrooms) pay Salts; her chain (`living-world.md` 1.3) teaches a Stew. A Hungry villager pays Scrip for a meal; the rogue sells one, not buys one. | Quest today; Stew teach and the Feed errand **New** | "Moll is busy at the kettle." |
| **F6 Lift it** | Take a loaf from the cooling rack or lift it from the stall (9B: Take from an owned shelf is theft; owner answer EP5: default). The stallholder gets Angry (GDD 3.24), a witness writes a Notice, the rogue loses standing, and an Angry figure may mug him later. | 9B's `theft`; standing is `living-world.md` 1.5 | "The baker is watching. Not now." |
| **F7 Go without** | Do nothing. Famished halves stamina regeneration; the hunger rate is `moods.hunger.riseS` (9A scales it to the day). Home eases it (`homeFallS`). | Today | none |

**What the logic must guarantee.** One of F1 to F7 is open to every seat at the start of every day. The world does not gate all of them behind money: F1, F3, F4, F5 and F7 cost no Scrip. That is rule E1.

### 2.2 Makes his own lock picks

**The need.** A locked thing between the rogue and where he wants to go. Today the Lockpicks recipe exists (`recipes.json`) and the verb is off (GDD 3.14).

| Step | Action | Station / tool | Today / New |
|---|---|---|---|
| 1 | Gather Timber: by hand at a timber node, or chop a woodpile or fell a tree with an Axe and saw the logs at a saw horse or the BlackPine mill (owner answer LT1: a pile gives nothing by hand) | hands at a node; Axe and saw at a pile | Gather today; the tool walls, trees and the mill are **New** (`logic-table.md` 2, 7.1) |
| 2 | Gather Stone: by hand at a stone node, or break a boulder with a Pickaxe | hands at a node; Pickaxe at a pile | Gather today; the wall is **New** |
| 3 | Craft a Spade: 2 Timber, 1 Stone | a basin: the apothecary, Crumb's Ovens, the bunkhouse or the forge; 3 s | Today |
| 4 | Dig Tin Ore (needs the Spade) | the Tin Gallery mouth; bats and rats are there (their bites are softened, `living-world.md` 6.1) | Today |
| 5 | Craft Lockpicks: 1 Tin Ore | a basin; 3 s | Today |
| 6 | Pick the lock: the lock-pick mini-game (owner answer LT2; rotate, click, push and pull against tension; pins by the lock's tier, `logic-table.md` 8.5). Too much tension snaps the pick | on the locked door or chest | **New** (`minigame: lockpick`) |

If a step fails, the player is told why in the world's voice. The owner's own example is the model: "Failed to pick the lock. Looks like you might need a lock pick." The rest follow it: no Spade ("The ore won't give. You need something to dig with."), no basin ("There is nothing here to work metal on."), no pins ("The lock won't give. You'll need a pick.").

**The result.** The pick opens the door and is spent (it is a `charge`). The pick leaves a **scratch** on the lock and a little noise (owner answer LT2, follow-up 2; it replaces 9B's print). The scratch is role-neutral: it says the lock was picked, not by whom, and it carries a small fine chance (`fineChance` 0.1). A snapped pick is lost and says so ("The pick snaps in the lock.", `failures.md` 4.9). A picked door stays unlocked for the day unless a seat with a key locks it again.

**Why it is not strictly best.** It costs a whole chain (E3): a Spade, a trip into the caves, a slot in the pack (the inventory is bigger now, owner answer LT4: a hotbar of 6 and a pack of 18, `logic-table.md` 8.6, so the cost is the trip, not the slot), a scratch and noise at the door, the risk of a snapped pick, and wear on the tools (9B 8.1).

### 2.3 Dodges the tax

**The need.** Two taxes exist today (GDD 3.23):

- **Rent** (HollowMere): 6 Scrip due at half the day, paid at a bank counter. A seat still owing at dusk becomes **Indebted** ("a hunted look"). From dusk to dawn the doors from outdoors into the map's **curfew** scenes refuse it as a locked door does. **Then goods, then the house (owner answer EP3: default).** A seat that cannot pay has goods taken to the debt's value; a seat with no goods has its house boarded up. A boarded house has no bed, so the seat cannot sleep the night away (`world-mode.md` 7.3) until it pays the debt and the boards come off.
- **Quota** (BlackPine): 2 Timber or Stone to a tally rack by dusk, or a fine of 8.

The rogue pays neither in Scrip. Every route below leaves the town a legal answer, so none is forbidden; each has a cost.

| Path | Steps | Today / New | The price (E3) |
|---|---|---|---|
| **T1 Pay in kind** | Hand the Clerk goods at the market's `pay` price toward the rent: three Timber or two Herbs pay the 6 Scrip. | **New** | The goods, and a trip to the Clerk |
| **T2 Work it off** | Do the Clerk's chores (carry a slip, count the rent) for rent credit (`living-world.md` 1.2). | **New** | A chunk of the day |
| **T3 Bank first** | Deposit the purse before the Clerk's round. The Clerk collects from a purse only (owner answer EP4: default); banked Scrip is safe (GDD 3.23). The debt stays, so Indebted still applies at dusk. | Bank safe today; Clerk's walk and its purse-only rule **New** | Does not remove the debt |
| **T4 Go rough** | Stay Indebted and sleep outside: carry a Torch or stay by a lantern post (wolves flee light within 4 tiles), wear armour (tier 1 or 2, `living-world.md` 5.1) and keep a snare line. | Indebted and curfew today; gear **New** | Wolves at night, through a 300 s night with no roof |
| **T5 The chapel** | The chapel is not a curfew scene. An Indebted seat, or one whose house is boarded, may sleep on the chapel cot (free, `world-mode.md` 7.3; follow-up 2) or keep a vigil (`living-world.md` 2.5) that earns Faith for the night. A tavern bed costs 2 Scrip (P). | Today (the chapel is not in `curfew`); vigil **New** | The company of whoever else keeps vigil |
| **T6 Pick the curfew door** | Use the Lockpicks of 2.2 on the bakery, the tavern or the manor hall's curfew door. The door is a lock like any other (owner answer EP2: default). | **New** | A scratch, noise, the fine chance, and a Notice if a witness is in sight (9B 11); whoever stands inside |
| **T7 Avoid the collector** | The Clerk's round follows public stations (the ledger, the notice board, the tavern window and the pump). The rogue is elsewhere when it passes. | Routes exist; collection **New** | Predictable route, so the Clerk is late, not absent |
| **T8 Free quota** | At BlackPine the quota is already paid in kind. Cut a lumber pile with an axe, or break a boulder, and haul the yield to a tally rack. | **New** (axe, pickaxe, piles) | The haul, and a pile someone else may have stripped first (owner answer LT7) |
| **T10 Pick the boards** (follow-up 2) | A boarded house is a nailed lock: a Crowbar or a Hammer pries the boards for the night. The boards go back at dawn and the debt stands. | **New** | A Notice for trespass on your own house if a witness sees; noise |
| **T9 Do not hold Scrip** | A seat with an empty purse is never mugged (GDD 3.24), cannot be fined more than it holds, and has nothing to lose to a knockout (3.22). | Today | Cannot buy anything |

**The result the owner asked for.** The rogue never buys bread, never pays rent in coin and never uses a bank, and still plays a full day: he eats from the wood, picks the curfew door he is locked behind, pays the town in kind or in labour, and keeps going. A clerk who stands angry at a missed payment is a **mood** (Anger, `taxed`, GDD 3.24), a thing to notice, not a rule that locks him out.

## 3. One day of the rogue

The rogue's day, as the logic would run it. Times are shown as fractions of the day because 9A owns the length (480 s).

| Time | What he does | Systems it touches |
|---|---|---|
| Dawn | Wakes on the chapel cot or in the woods; eats a Stew from yesterday | Hunger, Faith (vigil), Cooking, sleeping |
| Morning | Fells a tree with an axe and saws the logs into Timber at a saw horse (owner answer LT1) | Axe, trees, the saw, Timber |
| Mid-morning | Digs Tin Ore at the cave mouth; bats bite for 3 | Pickaxe/Spade, mobs, armour |
| Noon | Pays the Clerk in Timber; gets a rent receipt | Rent, barter, standing |
| Afternoon | Crafts Lockpicks at the forge; sets a snare | Basin, Tin Ore, snare |
| Dusk | Is not Indebted. Reads a book at the manor to follow a lead | Lore, leads, curfew |
| Night | Picks the curfew lock on the bakery for the oven's warmth by the mini-game; leaves a scratch (owner answer LT2) | Lockpicks, the mini-game, scratch, Notice |
| Late night | Cooks at the bakery oven with what he gathered | Stew |

A Killer living as a villager (owner brief, "Disguises") can run exactly this day: all of it is role-neutral, and the chores give a real alibi entry. A Detective, or a Constable (owner answer WM2), who finds a scratch learns that a door was picked, not by whom.

## 4. Three more player-invented strategies

The logic must support these as well, each with what it uses and what it must stop. All three stay (owner answer EP8: default).

### 4.1 The Quartermaster (a broker)

A seat that never fights and rarely gathers. It buys at the stalls, sells at the market, and keeps the table supplied with bandages, oil and candles.

| Uses | Must hold | Must stop |
|---|---|---|
| Shop spread (an item a shop both sells and buys pays less than it asks), stall restock errands (a discount), standing, the haggle tap, the bank | The spread is positive but small, so the broker earns Scrip for effort; a heavy purse raises the mugging chance, and the bank, armour and company lower it | An infinite loop: buy and sell the same item to a stall for profit. The spread, a daily cap on haggle bonuses and standing prevent it. |

### 4.2 The Lantern Warden (a pacifist protector)

A seat that carries no weapon and keeps the village safe with light, a fence and a ward.

| Uses | Must hold | Must stop |
|---|---|---|
| Lanterns and torches (creatures flee a flame within their radius, GDD 3.15), mending the fence (wolves cannot enter while it is mended), the ward from Faith, Scared villagers who pay in Faith to be walked to a door, vigils | The light radius, the fence and the ward are enough to keep a village quiet for a night; a Warden's score is Faith and standing, which cannot be spent on killing power | A Warden who makes a Killer's work impossible. A lit lantern is a fact in the scene, as today; no new rule turns light into a lock. |

### 4.3 The Scribe (a paper-trail investigator)

A seat that never carries a weapon or a magnifier and solves it by reading and asking.

| Uses | Must hold | Must stop |
|---|---|---|
| Talk with a figure for a tip (a look and a scene, `living-world.md` 1.4), a Constable's briefing (owner answer WM2), shelves and leads, ledger slips, the notice boards, alibi entries, scratches | Tips are public facts only (no card), the same to every asker, and capped per figure | A tip that reveals a role or a kill. Tips are drawn from the same rumour ledger as Blackmail Notices, which already names looks and never seats or cards. |

## 5. What it asks of the logic table

| Need | From | Where |
|---|---|---|
| The `needs` list and the three-sources test of 1, with each source's `system` for E4 (owner answer EP6) | 9B | `logic-table.md` |
| The boarded house as a pryable lock, and the chapel cot (follow-up 2) | `world-mode.md` 7.3, `logic-table.md` | `gdd-map.md` sleeping |
| A `berries` node, a `game` item, a `stew` recipe, role-neutral skinning | 9B (the rest, axe, pickaxe, grindstone, Wake Loaf bake, is already in the table) | `logic-table.md`, `items.json` |
| Theft from an owned shelf | already 9B's (`ownership: owned`, crime `theft`) | `logic-table.md` 10 |
| The curfew lock as a `lockedDoor` target (9B 9.5 locks no door in data yet; the round-10 scene edit must lock the curfew doors) | 9B, round-10 scene edit | `logic-table.md` 9.5 |
| Rent in kind, rent by labour, purse-only collection | `living-world.md` 1.2 and GDD 3.23 | `gdd-map.md` |
| Day length, hunger rate | 9A | `world-mode.md` |

## Open questions for the owner

Answered (`owner-answers.md`, 2026-10-24): EP1 to EP5, EP7 and EP8 took the default; EP6 differs (1, E4). Question 3's answer adds goods and the boarded house (2.3). The list is kept as asked.

1. **Is raw foraged food edible, with a risk?** (2.1, F2) Proposed: yes, one chance in three of Poisoned, never lethal. Default: yes.
2. **Does a curfew door yield to Lockpicks?** (2.3, T6) Proposed: yes, as any lock does, with a print and, if a witness is in sight, a Notice (9B 11). Default: yes.
3. **Can rent be paid in goods or in labour?** (2.3, T1 and T2) Proposed: both. Default: both, labour at a lower rate.
4. **Does the Clerk collect from the purse only?** (2.3, T3) Proposed: yes, so the bank hides money but not the debt. Default: yes.
5. **May a seat steal from a stall?** (2.1, F6) Proposed: yes, with Anger, lost standing and a later mugging risk. Default: yes.
6. **Is the rogue a role or a pattern?** (1) Proposed: a pattern, open to every card. Default: open to every card.
7. **Should the coverage test (E1 to E3) be mandatory in CI?** (1) Proposed: yes, as a content test. Default: yes.
8. **Do the three extra strategies (4) belong in the design, or are they too many?** Proposed: all three, since each uses systems that exist. Default: all three.

## 6. Reconciled

The full list, R1 to R18, is in `gdd-map.md` 4.

- **R8. Tool walls against E1.** Piles open only to their tool (LT1), but nodes keep bare hands, the general store sells Timber and Stone, and chores pay: wood and stone still have three sources, and the axe route is the big yield (2.2).
- **R9. Depletion against the rogue's forage.** A stripped node returns after its respawn (LT7), so F1 is slower on a busy day, never closed; F3 to F7 do not depend on nodes.
- **R18. The scratch against 9B's print.** Every print a lock pick left in this document is now a scratch: role-neutral, saying a lock was picked and not by whom (2.2, 2.3, 3).
- **EP6 against "a pattern".** The default and the owner's words agree that the rogue is no card; the owner's words add what the pattern is, which E4 turns into a test.
- **A boarded house against sleeping (EP3 against follow-up 2).** No bed means no sleep at home; the chapel cot is free, so a debt never locks a seat out of skipping the night with the others (T5, T10).
