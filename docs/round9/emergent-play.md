# Round 9: emergent play (9C)

Session 9C, plan item 6. Design only: this document changes no code, data, test or `GDD.md`. It answers part 10 of the owner's brief (`owner-brief.md`):

> Players should be able to work with features to create their own way of playing like the rouge who refused to buy bread and gathers food instead and makes his own lock picks to avoid paying taxes, this is something only a person could easily come up with but the game logic needs to think about all of those possibilities.

The systems it walks through are in `living-world.md` (the loops, chores, chat, gear, bosses and achievements) and, for the rules of each tool and object, 9B's `logic-table.md`. 9B had not landed when this was written, so a rule or an id that depends on it is tagged **[T:]** and the two documents reconcile on 9B's names before either merges. A number marked **(P)** is a proposal; one with no mark is quoted from `GDD.md` or the data.

## 1. The rule behind the example

The rogue is not a role. He is a **pattern**: a player who looks at three things the game asks him to do and finds a way not to do them. A game "thinks about all of those possibilities" only if its rules were written that way. This document turns that into three rules that the logic table must satisfy, and one test that checks them.

| # | Rule | Meaning |
|---|---|---|
| E1 | **Every need has at least three sources.** | For each thing a player must have (food, a tool, a pass through a door, a debt cleared), at least three of *buy*, *make*, *find*, *earn* and *skip* work. |
| E2 | **No gate has a single key.** | A locked thing opens to a tool, a skill or a favour, never only to one purchase. |
| E3 | **Every shortcut has a price.** | A way round costs time, risk, a clue or standing. It is never free, so no path is strictly best. |

**The coverage test.** The logic table carries a `needs` list: food, light, a door, a debt, a tool, a cure. A script (the same kind as the prop audit in the README's checks) reads it and fails if a need has fewer than three working sources, or if a gate has one key. It runs in CI beside the content tests, so a future change cannot quietly remove a path. 9B owns the table, and this document supplies the cases below as its first test data.

## 2. The rogue, step by step

The rogue is a seat of any card (rule 5 of `living-world.md` 0: gear, chores and errands are role-neutral). I use the Thief for colour only. Each step is labelled:

- **Today**: it works in the round-8 build.
- **New**: it needs a rule this round designs.
- **[T:]**: it depends on a name or a rule in 9B's table.

When a step is blocked, the player sees a reason in the world's voice (owner brief, part 8), never "can't do that yet". The lines below are examples for 9B's `failures.md`.

### 2.1 Refuses to buy bread: gathers food instead

**The need.** The bakery sells flour and the Wake Loaf, and `famished` cures with `food`. The rogue will not pay the 3 Scrip. He needs about one meal a day (hunger rate: 9A).

| Path | Steps | Today / New | If blocked, the line |
|---|---|---|---|
| **F1 Forage and cook** | 1. Gather Mushrooms and Herbs at the Gallows Wood or Fenwood nodes (hold, 2 s). 2. Gather Berries from a wild bush [T: berries node]. 3. Cook a Stew at an oven (Crumb's Ovens or the bunkhouse) from Mushrooms, Herbs and water [T: stew recipe]. 4. Eat. The `eat` event clears Famished and Hunger. | Gather today; berries, stew and `eat` of a crafted meal **New** | "You are hungry, and there is nothing here to cook with." / "The mushrooms are raw. You'll need a fire." |
| **F2 Raw and risky** | Eat Mushrooms or Berries uncooked. A cooked meal heals more. Raw food has a chance (P: one in three) of Poisoned, which cannot take health below 1 (effects stop at 1 HP, `living-world.md` 6.1). | **New** | "That did not agree with you." |
| **F3 Trap and hunt** | 1. Craft a Snare (2 Herbs, 1 Timber, anywhere; today). 2. Set it on a game trail [T: snare verb; today the verb is off, GDD 3.14]. 3. Return later and take Game. 4. Skin it with a Hide knife, cook at an oven. Or hunt with a Cudgel or Spear, at the cost of a bite or two (12 from a wolf, 9 from a boar, P). | Snare craft today; the verb and Game **New** | "The snare is empty. Nothing came by." / "The wolf has torn it." |
| **F4 Work for it** | Stoke the oven at Crumb's (a chore, `living-world.md` 2.2). Mrs Crumb pays one loaf for the shift (P). Or do the *Fetch the flour* task and keep the sack. | Chore **New**; the task and the sack exist | "Crumb waves you off. Come back when the ovens need stoking." |
| **F5 Errand** | Moll's mushrooms (3 Mushrooms) pay Salts; her chain (`living-world.md` 1.3) teaches a Stew. A Hungry villager pays Scrip for a meal; the rogue sells one, not buys one. | Quest today; Stew teach and the Feed errand **New** | "Moll is busy at the kettle." |
| **F6 Lift it** | Take a loaf from the cooling rack or lift it from the stall [T: steal verb]. The stallholder gets Angry (GDD 3.24), the rogue loses standing with the town, and an Angry figure may mug him later. | **New** | "The baker is watching. Not now." |
| **F7 Go without** | Do nothing. Famished halves stamina regeneration; the hunger rate is `moods.hunger.riseS` (9A scales it to the day). Home eases it (`homeFallS`). | Today | none |

**What the logic must guarantee.** One of F1 to F7 is open to every seat at the start of every day. The world does not gate all of them behind money: F1, F3, F4, F5 and F7 cost no Scrip. That is rule E1.

### 2.2 Makes his own lock picks

**The need.** A locked thing between the rogue and where he wants to go. Today the Lockpicks recipe exists (`recipes.json`) and the verb is off (GDD 3.14).

| Step | Action | Station / tool | Today / New |
|---|---|---|---|
| 1 | Gather Timber (hold; an axe [T:] cuts the lumber pile on the square, and wood piles are free materials) | axe [T:] or hands | Gather today; axe and lumber pile **[T:]** |
| 2 | Gather Stone (a pickaxe [T:] breaks a boulder) | pickaxe [T:] or hands | Gather today; pickaxe and boulder **[T:]** |
| 3 | Craft a Spade: 2 Timber, 1 Stone | a basin: the apothecary, Crumb's Ovens, the bunkhouse or the forge; 3 s | Today |
| 4 | Dig Tin Ore (needs the Spade) | the Tin Gallery mouth; bats and rats are there (their bites are softened, `living-world.md` 6.1) | Today |
| 5 | Craft Lockpicks: 1 Tin Ore | a basin; 3 s | Today |
| 6 | Pick the lock: a slide mini-game for the pins | on the locked door or chest [T: pick verb] | **New** |

If a step fails, the player is told why in the world's voice. The owner's own example is the model: "Failed to pick the lock. Looks like you might need a lock pick." The rest follow it: no Spade ("The ore won't give. You need something to dig with."), no basin ("There is nothing here to work metal on."), no pins ("The lock won't give. You'll need a pick.").

**The result.** The pick opens the door and is spent (it is a `charge`). A **clean** slide leaves no mark; a rushed one leaves a **scratch** clue (a new, role-neutral clue that says "this was picked" and nothing about who). A snapped pick is lost with no entry. A picked door stays unlocked for the day unless a seat with a key locks it again.

**Why it is not strictly best.** It costs a whole chain (E3): a Spade, a trip into the caves, a slot in a five-slot inventory (the picks take one), a risk of a scratch clue, and wear on the tools if the logic table adds durability (`living-world.md` 5.3).

### 2.3 Dodges the tax

**The need.** Two taxes exist today (GDD 3.23):

- **Rent** (HollowMere): 6 Scrip due at half the day, paid at a bank counter. A seat still owing at dusk becomes **Indebted** ("a hunted look"). From dusk to dawn the doors from outdoors into the map's **curfew** scenes refuse it as a locked door does.
- **Quota** (BlackPine): 2 Timber or Stone to a tally rack by dusk, or a fine of 8.

The rogue pays neither in Scrip. Every route below leaves the town a legal answer, so none is forbidden; each has a cost.

| Path | Steps | Today / New | The price (E3) |
|---|---|---|---|
| **T1 Pay in kind** | Hand the Clerk goods at the market's `pay` price toward the rent: three Timber or two Herbs pay the 6 Scrip. | **New** | The goods, and a trip to the Clerk |
| **T2 Work it off** | Do the Clerk's chores (carry a slip, count the rent) for rent credit (`living-world.md` 1.2). | **New** | A chunk of the day |
| **T3 Bank first** | Deposit the purse before the Clerk's round. The Clerk collects from a purse only; banked Scrip is safe (GDD 3.23). The debt stays, so Indebted still applies at dusk. | Bank safe today; Clerk's walk and its purse-only rule **New** | Does not remove the debt |
| **T4 Go rough** | Stay Indebted and sleep outside: carry a Torch or stay by a lantern post (wolves flee light within 4 tiles), wear armour (tier 1 or 2, `living-world.md` 5.1) and keep a snare line. | Indebted and curfew today; gear **New** | Wolves at night, through a 300 s night with no roof |
| **T5 The chapel** | The chapel is not a curfew scene. An Indebted seat may sleep there. A vigil (`living-world.md` 2.5) earns Faith for the night. | Today (the chapel is not in `curfew`); vigil **New** | The company of whoever else keeps vigil |
| **T6 Pick the curfew door** | Use the Lockpicks of 2.2 on the bakery, the tavern or the manor hall's curfew door. The door is a lock like any other. | **New** | A scratch clue, a chance of a fine in the world's voice (P), and whoever stands inside |
| **T7 Avoid the collector** | The Clerk's round follows public stations (the ledger, the notice board, the tavern window and the pump). The rogue is elsewhere when it passes. | Routes exist; collection **New** | Predictable route, so the Clerk is late, not absent |
| **T8 Free quota** | At BlackPine the quota is already paid in kind. Cut a lumber pile with an axe, or break a boulder, and haul the yield to a tally rack. | **New** (axe, pickaxe, piles) | The haul |
| **T9 Do not hold Scrip** | A seat with an empty purse is never mugged (GDD 3.24), cannot be fined more than it holds, and has nothing to lose to a knockout (3.22). | Today | Cannot buy anything |

**The result the owner asked for.** The rogue never buys bread, never pays rent in coin and never uses a bank, and still plays a full day: he eats from the wood, picks the curfew door he is locked behind, pays the town in kind or in labour, and keeps going. A clerk who stands angry at a missed payment is a **mood** (Anger, `taxed`, GDD 3.24), a thing to notice, not a rule that locks him out.

## 3. One day of the rogue

The rogue's day, as the logic would run it. Times are shown as fractions of the day because 9A owns the length (480 s).

| Time | What he does | Systems it touches |
|---|---|---|
| Dawn | Wakes at the chapel or in the woods; eats a Stew from yesterday | Hunger, Faith (vigil), Cooking |
| Morning | Fells a lumber pile with an axe on the square | Axe, piles, Timber |
| Mid-morning | Digs Tin Ore at the cave mouth; bats bite for 3 | Pickaxe/Spade, mobs, armour |
| Noon | Pays the Clerk in Timber; gets a rent receipt | Rent, barter, standing |
| Afternoon | Crafts Lockpicks at the forge; sets a snare | Basin, Tin Ore, snare |
| Dusk | Is not Indebted. Reads a book at the manor to follow a lead | Lore, leads, curfew |
| Night | Picks the curfew lock on the bakery for the oven's warmth; leaves a scratch | Lockpicks, clue, fine |
| Late night | Cooks at the bakery oven with what he gathered | Stew |

A Killer living as a villager (owner brief, "Disguises") can run exactly this day: all of it is role-neutral, and the chores give a real alibi entry. A Detective who finds a scratch clue learns that a door was picked, not who picked it.

## 4. Three more player-invented strategies

The logic must support these as well, each with what it uses and what it must stop.

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
| Talk with a figure for a tip (a look and a scene, `living-world.md` 1.4), shelves and leads, ledger slips, the notice boards, alibi entries, scratch clues | Tips are public facts only (no card), the same to every asker, and capped per figure | A tip that reveals a role or a kill. Tips are drawn from the same rumour ledger as Blackmail Notices, which already names looks and never seats or cards. |

## 5. What it asks of the logic table

| Need | From | Where |
|---|---|---|
| The `needs` list and the three-sources test of 1 | 9B | `logic-table.md` |
| Stew, Berries, Game, Hide, axe, pickaxe, whetstone, hide knife ids | 9B | `logic-table.md`, `items.json` |
| A steal verb and a scratch clue | 9B, GDD 3.4, 3.7 | `logic-table.md`, `failures.md` |
| The pick verb, and the curfew lock as an ordinary lock | 9B | `logic-table.md` |
| Rent in kind, rent by labour, purse-only collection | `living-world.md` 1.2 and GDD 3.23 | `gdd-map.md` |
| Day length, hunger rate | 9A | `world-mode.md` |

## Open questions for the owner

Each has a proposed default. 6Z collects these in the questionnaire.

1. **Is raw foraged food edible, with a risk?** (2.1, F2) Proposed: yes, one chance in three of Poisoned, never lethal. Default: yes.
2. **Does a curfew door yield to Lockpicks?** (2.3, T6) Proposed: yes, as any lock does, with a scratch clue and a small fine risk. Default: yes.
3. **Can rent be paid in goods or in labour?** (2.3, T1 and T2) Proposed: both. Default: both, labour at a lower rate.
4. **Does the Clerk collect from the purse only?** (2.3, T3) Proposed: yes, so the bank hides money but not the debt. Default: yes.
5. **May a seat steal from a stall?** (2.1, F6) Proposed: yes, with Anger, lost standing and a later mugging risk. Default: yes.
6. **Is the rogue a role or a pattern?** (1) Proposed: a pattern, open to every card. Default: open to every card.
7. **Should the coverage test (E1 to E3) be mandatory in CI?** (1) Proposed: yes, as a content test. Default: yes.
8. **Do the three extra strategies (4) belong in the design, or are they too many?** Proposed: all three, since each uses systems that exist. Default: all three.
