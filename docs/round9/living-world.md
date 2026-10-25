# Round 9: the living world (9C)

Session 9C, plan items 5 and 6. This is a design document: it changes no code, data, test or `GDD.md`. Every number marked **(P)** is a proposal that would go to `balance.json` or a data file if the owner approves it, and no other document may restate it. Every number without a mark is quoted from `GDD.md` or the data, and the cell names where.

The owner's words are in `owner-brief.md`. This document answers parts 3, 4, 5, 6 and 7 of the brief: longer days and softer mobs, integrated systems, branching achievements, gear, and a world with more NPCs that walk, chat and give tasks. `emergent-play.md` answers part 10 using the systems below.

**Sources.** `GDD.md` 3.14 to 3.16, 3.21 to 3.26; `quests.json`, `tasks.json`, `minigames.json`, `economy.json`, `mobs.json`, `routines.json`, `lore.json`, `balance.json`; `docs/round8/canon.md`; and, from ROSW (read-only, through the `udgt-consult` skill), the teardown answers and the vault's `10_Characters/10_Subject_Files.md` and the Codex Bestiary.

**Sibling documents.** 9A owns `world-mode.md` and `phases.md`, and with them the full pacing table (every timer, 480 s day and 300 s night) and the train respawn. 9B owns `logic-table.md`: the tool × object table and the names of axes, pickaxes, armour and new items. 9B's table landed as draft #266 (head `6106134`); the item, tool, armour and weapon names below are reconciled against it, and where this document needs something 9B does not have, it is listed as a request in section 7.

## 0. Rules this design keeps

These come from `CLAUDE.md` and the GDD, and every section below is checked against them.

1. **Role secrecy.** Nothing a client receives may reveal a role, a cover or an impersonation. A new feature may use only what an observer standing in the scene could see: the drawn look, the scene, the time. It never reads a card (the same rule as `services/talk/facts.ts`, GDD 3.25).
2. **One path through `step()`.** Every action is queued and consumed in the server step. Chat, errands, chores, craft and gear are commands; nothing mutates state in a message callback.
3. **Frozen ids.** Scene, portal, spawn, prop, clue and quest ids do not change. New content adds new ids with new prefixes.
4. **Conservation.** Scrip enters the town only as a stake, a wage, a sale or a fenced notice, and leaves only as a purchase, rent, a fine, a donation or an HQ tier (GDD 3.23). Anything new that pays Scrip is a wage or a sale, and anything new that takes it is a purchase or a fine.
5. **Role-neutral tools.** A crafted tool says nothing about who made it (GDD 3.14). Gear, chores and errands are open to every card.
6. **The server keeps nothing between matches** (GDD 3.21). Section 4.4 prices what changing that would cost.
7. **Anti-cheat.** The owner chose "Full anti-cheat" (teardown stage 4). Nothing the client reports can grant power. This decides where achievements live (4.4).
8. **No model id, no generated text in data.** NPC chat stays template-first with the optional model path of GDD 3.25.

## 1. Citizens: NPCs that walk, chat and give tasks

### 1.1 Four kinds of walker

| Kind | What it is today | Role in this design |
|---|---|---|
| Fixed givers | 5 figures at fixed spots, `villager` look, a quest marker (GDD 3.16) | Keep. They become the heads of quest chains (1.3). |
| Ambient townsfolk | Walk station to station, have needs and moods, are not seats, die only to creatures (GDD 3.24) | The new errand givers. They already walk, so the walking is free. |
| NPC seats | Hold a card, wear a card's look, post meeting notes (GDD 3.25) | Never talk in words outside meetings. Their barks use the quick-chat pool only (1.4). |
| Human seats | Players | Use quick-chat, as today. |

The key fact is in GDD 3.24: a townsfolk figure wears the `villager` look, and no seat ever does (a cover role wears another *card's* look). So a figure can already be told from a seat by sight, and giving figures a talk verb reveals nothing a player cannot see. NPC seats get no talk verb, so that nobody can learn "this figure answers me, so it is not a player" about a card-look. That one rule keeps the whole feature secrecy-safe.

### 1.2 Who gives what

A figure's offer comes from its class and its own needs. It never depends on who asks, in line with GDD 3.16 ("what a giver offers never depends on who asks").

| Figure | Walks to | Offers (errand kind) | Typical want | Typical pay |
|---|---|---|---|---|
| Company Clerk (HollowMere, named) | ledger, notice board, tavern window, pump | **Paperwork**: carry a slip to another figure; **Collect**: count the day's rent with the clerk (a chore that also earns standing, 1.5) | a letter, a rent slip | Scrip, rent credit |
| Tallyman (BlackPine, named) | tally rack, notice board, pump, basin | **Haul**: top up the rack; **Count**: check a rack with the Tallyman | Timber, Stone | Scrip, quota credit |
| Stallholder (one per shop) | its counter | **Restock**: bring the shop's own goods | Flour, Oil, Planks, Herbs | goods at a discount, Scrip |
| Villager, Hungry | station of the day | **Feed**: bring food | any `food` item | Scrip, a tip (1.4) |
| Villager, Scared | home or a lit place | **Light**: light the nearest lantern; **Walk**: be near it to a door | a lit light | Scrip, Faith |
| Villager, Want (Desperate) | market, bank | **Odd job**: any chore of 2.2 | labour | Scrip |
| Villager, Angry | where it was robbed | **Find**: return a stolen item that lies in the town (a coin heap, a dropped item) | an item | the item's price |

**Rules.**
- A figure offers at most one errand at a time. After a turn-in or a refusal it cools for a part of a day (P: one tenth of the day, the day being 9A's value).
- A seat holds at most `quests.maxActive` accepted quests and errands together. An errand is a quest of a new kind row (`kind: errand`), so one counter covers both.
- A figure's mood is already server-only. This design lets a *figure* say its need in words, as the errand text ("Hungry. Bring me something to eat."). That amends GDD 3.24, which says a mood is "never a word", for figures only. NPC seats stay silent in words, so a card-holder's mood never reaches a screen as text.
- A figure that is knocked out, killed or has left its route withdraws its errand and the seat keeps the items.

### 1.3 Fixed givers become chains

The five givers keep their rows. Each gains a short chain, so the player has a reason to come back and a branch to pick. Rows below are examples for the owner to approve, not a count.

| Giver | Step 1 (today) | Step 2 (new) | Branch |
|---|---|---|---|
| Harbourmaster Pell | Caulk the skiff (2 Pine Resin, 1 Timber → Lantern) | Ferry run: carry a slip across the mere to Tuck | **Trade**: Tuck sells charts (Discovery 2.4) |
| Mother Moll | Moll's herbs, Moll's mushrooms | Brew with Moll: she teaches a Stew or a Remedy recipe | **Food** or **Cure**, one only per match |
| Ada Kerrow | The smith's ore (3 Tin Ore → Lantern) | Temper: teaches the Tin mail recipe (5.1) | **Gear** |
| Foreman Hask | Stack the yard (4 Timber → Crowbar) | Count the rack with the Tallyman | **Labour** |
| The Collier | The collier's stone (3 Stone → Torch) | Fire a kiln: a Stoke mini-game with a prize | **Fire** |

A branch is private to the seat that took it and is never shown to anyone else. Two seats can take different branches from the same giver in one match.

### 1.4 How chat works outside meetings

Meetings change under 9A (no voting, full-screen phases), so this section covers only the world.

**Three channels, all template-first, none built from a card.**

1. **Quick-chat** (exists: `chat.quickChat`, 8 lines, heard within `quickChatRadiusTiles`). Unchanged for human seats. This round adds more lines to the pool (P: world lines such as "Anyone seen the baker?", "Got any food to spare?", "Mind the wolves", "I owe the clerk").
2. **Barks.** Figures and NPC seats emit a quick-chat line from the same pool at moments both can see: a bell rings, a wolf is near, a lantern is lit. A bark is drawn from the actor's own `talk` stream and is the same kind of event for a figure, an NPC seat and a human, so the stream of barks reveals nothing.
3. **Talk** (new verb, figures and fixed givers only). Holding the action key at a figure opens a small panel with at most three choices:
   - **Ask for work.** Offers the figure's errand, or "Nothing today."
   - **Ask about the town.** The figure tells one **tip**: a public fact the figure itself saw, in the form of a ledger line (GDD 3.23 rumours): "I saw the Baker at the bakery around noon." Names a **look**, never a seat or a card, from what an observer could have seen. A disguised Killer is a look like any other.
   - **Pass the time.** A one-line remark (template). Costs nothing, changes nothing.

**What the figure knows.** Exactly what the rumour ledger knows: sightings every `notices.sampleS`. It sees a Killer's disguise as a look, because that is what the drawn figure shows. It never knows a card, a cover or a kill.

**Secrecy checks (these become invariants for 9B/auto):**

| Check | Why |
|---|---|
| A tip names a look and a scene, never a seat handle or a card | `figureNotSeat` and 3.17 |
| The same question returns the same tip to every seat in the same tick | role-neutral |
| A figure never speaks a line that depends on whether the asker is a Killer, a vendetta holder or a ghost | no card input |
| Ghosts cannot talk to figures | a ghost sees everything (3.15) and would learn nothing a living seat could not, but the verb stays off so a ghost cannot farm errands |
| A response takes the same time whatever it says | no timing tell |
| No NPC seat answers Talk | keeps 1.1 |

**Model path.** The optional model line of GDD 3.25 applies to "Pass the time" only, filtered as before, off the tick, logged for replay. Tips and errands are always templates.

### 1.5 Standing

Each map keeps a private per-seat **standing** with its town, from chores and errands (P: three steps, Stranger → Known → Trusted). It changes prices and offers slightly, never the rules: a Known seat sees one more errand slot; a Trusted seat sees the stallholders' discount (the 0.8 of `hq.stations.*.shopDiscount` stacks no further; the larger discount wins). Standing is not shown to anyone else and does not persist past the match (4.4).

### 1.6 NPC chore hooks (9B 9.1)

9B lets `routines.json` `holds` and the activity `kinds` name **class ids** as well as prop kinds, adds `carries` to a `townsfolk` row, and makes an NPC's work cosmetic by default (the animation and noise run; the prop's state does not change). This design uses those hooks and adds no engine:

| Figure | `holds` class (9B names) | `carries` | Chore it shows |
|---|---|---|---|
| Lumberjack villager | `lumber` | axe | chops the lumber pile on the square |
| Stallholder | its counter | none | restocks (the Restock errand reads the same stock) |
| Clerk | `ledger`, `noticeBoard` | none | the rent round |
| Tallyman | `rack` | none | counts the rack |
| Villager | `workstation` kinds already in `routines.json` | none | pump, oven, goat, fence |

An NPC without its tool gets `NEED_TOOL` and ends the cycle, like a human, which is what the figure's cosmetic work shows. **Depletion** (9B open question 7): while NPC work is cosmetic, a player chore and a figure's chore are the same action with different effects, so a chore never competes with an NPC for stock. If the owner turns depletion on, gatherer figures take from piles and the world runs short; the rogue's competition in `emergent-play.md` then becomes real, and chore pay must be re-tuned. Default: off.

### 1.7 The 23 lore-hook props (9B 5.3)

9B keeps 204 props as decoration but singles out 23 that carry the lore. Each gets a one-line `examine`, shown when a seat holds the action key at it. The text is the same bytes for every seat, names no role, killer or Beast, and keeps to the canon of `docs/round8/canon.md` (found papers only; Grounds 99 never appears). A line may carry a `lead` (2.4) in the data.

| Prop id | Examine line |
|---|---|
| `mh.vane_portrait` | Lord Vane in oils, stiff-necked. The frame is dusty everywhere but the corners. |
| `mu.vane_portrait` | A smaller Vane, younger, painted before the money. |
| `wp.portrait` | Widow Vane's portrait hangs turned to the wall. |
| `ch.memorial` | Names cut into brass. The last line has room for more. |
| `ch.hymn_board` | The numbers on the board are for a hymn nobody has sung this week. |
| `tb.tide_chart` | The next low tide is circled twice in pencil. |
| `tb.ship_wheel` | A ship's wheel in a town with no sea. Someone spun it last. |
| `as.show_globe` | A glass globe of coloured water. Mallory keeps it for the light. |
| `tb.photos` | Drowned sailors in frames, and a gap on the wall where a frame hung. |
| `wb.photos` | Portraits in a widow's bedroom, one with its face scratched away. |
| `bm.tally_board` | A chalked tally, one name rubbed out and the rack beneath it still full. |
| `bo.map_table` | The Syndicate's survey, with the old tin workings crossed in red. |
| `bk.chalkboard` | Crumb's loaves for the day. The last line is a wake order. |
| `cm.chalkboard` | The mixing sums, in a baker's hand. |
| `cp.chalkboard` | The proof times, and a note not to open the cabinet early. |
| `tb.chalkboard` | The tavern's slate, and a debt or two. |
| `bo.telephone` | Harrow's new line. It rarely works. |
| `bo.ledger_desk` | The payroll desk. The pen is dry and the blotter is not. |
| `wp.writing_desk` | A widow's desk with the drawers shut and the key gone. |
| `fd.hanging_oak` | An old oak with a rope worn smooth into a branch. |
| `fd.drowned_lantern` | A lantern in the black water, still lit. |
| `wp.birdcage` | An empty cage with the door left open. |
| `tb.piano` | A piano with one key held down by a coin. |

The lines are drafts for the lore session (8V's successor) to approve: they are found-object description, not story, so none can contradict a ruling. The scene (`as.`, `bk.` and so on) is shown by the prop id, so the reader code needs no new map.

## 2. How the systems feed each other

### 2.1 The loop

Read a row as "this system gives these things to that system". An item reaches a loop twice if two rows name it.

| System | Takes in | Gives out | Feeds | Sink / limit |
|---|---|---|---|---|
| **Gathering** (GDD 3.14) | tools, time, risk (mobs) | Timber, Stone, Resin, Herbs, Mushrooms, Tin Ore, **Game, Berries** (requests to 9B, section 7) | Crafting, Shops (market buys), Quests, Quota | node respawn |
| **Crafting** | materials, a station, a recipe | tools, food, gear | Gathering (better tools), Tasks (deliverables), Gear | materials |
| **Tasks** (GDD 3.5) | a deliverable, a mini-game | the task bar, a wage of 3 Scrip, an alibi entry | the win (town), Scrip | task list |
| **Chores** (new, 2.2) | time at a station | a smaller wage, materials, standing, an alibi entry | Scrip, Crafting, Standing | per-day cap |
| **Errands and quests** | items | Scrip, items, standing, a recipe or a lead | Gathering, Shops, Lore | one at a time per figure |
| **Mini-games** (GDD 3.16) | a station and a pause | a clean result: yield, time, a quality tier | Tasks, Crafting, Lockpicks, Altar | difficulty |
| **Scrip** | wages, sales, errands | purchases, rent, fines, offerings, HQ tiers | Shops, Rent, Altar, Gear repair | conservation |
| **Faith** | Scrip at an altar, vigils, devotional reading | Indulgence, Parish Seal, wards, a blessing | Meetings (9A), Mobs (ward), Lore (restricted shelves) | Faith cap |
| **Lore and discovery** (GDD 3.26) | time in a room, a reader | leads, recipes, achievement steps, Faith | Quests, Crafting, Bosses, Achievements | one page at a time |
| **Mobs** | time in the wild, light | hide, game, bones, a drop, a scare | Crafting (hide → armour), Gathering, Bosses | damage, leash |
| **Bosses** (3) | gear, nerve, a team | a unique drop, a lore page, a step | Gear, Achievements, Lore | a variant scene |
| **Gear** (5) | materials + Scrip | less damage taken, more reach, a better tool | Mobs, Bosses, Gathering | durability, repair |
| **Achievements** (4) | any of the above | a title, a trim, a start option | the player | none |

### 2.2 Tasks and chores

| | Task (today) | Chore (new) |
|---|---|---|
| Who gives it | the seat's private list, set at the deal | the world: any station a townsfolk figure uses |
| Counts for the win | yes, a real task raises the bar | no |
| Cabal fake tasks | yes, a fake list | none needed; a chore is the same for every card |
| Alibi entry | yes | yes (the same ledger, so a Killer living as a villager gets a real alibi) |
| Pay | `economy.taskWage` 3 Scrip | smaller (P: one Scrip, or an item), capped per day (P: three paid chores a day per seat) |
| Mini-game | for fetch tasks | a short one on the best chores |

A chore is the work activity of GDD 3.12 opened to players. The station kinds already exist (pump, flour bin, oven, basin, goat, fence, window, cold shelves). Examples: draw a bucket at the pump, sweep the square (a boulder-free path), feed the goat, turn the loaves, chop the lumber pile on the square with an axe (9B: `chop_lumber`). The same chore at the same station is what a townsfolk figure is doing, so doing it beside one is both safe and sensible.

### 2.3 Scrip

Faucets and sinks are already conserved (GDD 3.23). The new faucets are chores (small, capped), errands (paid by the giver's own purse, which the server tops from the same rule as a wage) and a food sale to Hungry figures. The new sinks are tool and gear repair, bought tiers, recipes taught for a fee and the town's reply to a picked lock (6.2). The design target is a ratio, not a figure: over a normal day a player who only chores should afford a bandage and a meal and not much more, so nobody can buy their way past the economy (P, tuned in the balance lab the owner asked for in teardown stage 4).

### 2.4 Lore and discovery

`lore.json` holds 14 readable props and about 45 volumes, each with a vault `source`. Today reading yields only text. The design makes reading a **discovery**:

| Layer | Meaning | Where it lives |
|---|---|---|
| Read | The page was turned. | per seat, per match, private |
| **Lead** | A volume points at one thing in the world: a place, a recipe, a hazard or a time. | the same, private |
| **Recipe** | A tier-2 recipe is learned from a volume, a giver or a chore. | per seat, per match |
| **Lore step** | Counts toward the Wits branch (4.2). | match, then (if signed) device (4.4) |

Examples that fit what the volumes already say: the *Field Guide* leads to "mere-wolves flee the light" (a tooltip on the Torch); the *Tin Gallery* leads to a Tin Ore pocket in the old stopes; the *Daybook of Crumb's Ovens* leads to the Stew recipe; the *Confession Book* and the *Testament* feed Faith (devotional reading, 2.5). A lead is a hint to look, never a map marker, and **no volume leads to a role, a killer or the Beast**, the three limits of canon.md 7.

The vault's own works are quoted whole and cost no new writing. A lead is a one-line tag the data adds to a volume (`lead: { kind, ref }`), not new prose.

### 2.5 Faith

Faith today has one source, the altar (Scrip donated, `faith.perScrip`). Proposed sources, all role-neutral:

| Source | How | Why it fits |
|---|---|---|
| Vigil | Stand in the chapel at dusk with at least one other seat; Faith ticks for each completed minute | gives the chapel a purpose and puts people in one room |
| Tend the shrine | A chore at the wayside altar (light a candle) | uses `candle` |
| Devotional reading | The faith shelf at the manor hall (`mh.bookcase_0`) | uses 2.4 |
| Errand | Scared villagers pay in Faith for a lit lantern or an escort to the door | the Scared mood already exists |

New sinks: a **ward** (creatures keep a longer distance for a part of the night, using `sealShieldS` as the model) and a **blessing** at the chapel HQ tier. Indulgence and Parish Seal stay as they are. Faith stays private (`Private.faith`).

### 2.6 Mini-games as skill checks

The five kinds plus the tap already exist and the server replays the answer. New uses, with no new engine:

| Where | Kind reused | Result |
|---|---|---|
| Picking a lock (optional, 9B open question 2) | slide (pins) | success, a faster hold, or a snapped pick. 9B's default is a plain hold with a print; this stays off unless the owner picks the mini-game |
| Tempering at the forge | stoke | gear quality tier |
| Haggling at a stall | tap | a small price change either way |
| Altar offering | pour | Faith bonus |
| Butchering game | crates | yield |

A tier is "ok / clean / flawless". Only the third is rare. The result changes quality, never the possibility, so a player who dislikes mini-games can use the Done control after `assistS` and get the base result.

## 3. Mob bosses

### 3.1 What the lore says

- **HollowMere and BlackPine** have the Bestiary of the Codex: mere-wolves, bog-wisps, boar, bats, rats, crows, gulls. The **Beast** sleeps in the Tin Gallery and "nothing more is written here". It is never named or explained (canon.md 1, "holds"). So no boss encounter, no health bar, no name and no copy line on either town map. Nothing on a town map can contradict it.
- **Grounds 99** (BlackPine re-founded in 1952) has four subjects in `10_Characters/10_Subject_Files.md`: the Timber-Wolf, the Crawler Mother, the Sleepless and the Choir. The owner's answers (canon.md 5, DECISIONS A221 Q1): Grounds 99 is **lore only**, never on screen; the bosses are **secret** and live in **their own variant scenes** with new ids under a new prefix, never on BlackPine at night; the lab is never found. The Secret Agent role is dealt only on maps where the bosses are built.

### 3.2 Design

| Question | Design |
|---|---|
| Where | Four variant scenes, built by nobody yet (P1). Their ids take a new prefix (for example `g99_*`, to be set when built) and are appended to `SCENE_IDS`; no existing id is reused. |
| How you get there | A hidden portal from a BlackPine scene, found by a Discovery lead (2.4). The portal sits in the same graph, so V2 reads it as well. |
| Mechanism | The `boss: true` habitat of GDD 3.15 (the whole room is the area). The mechanism and a test shipped in round 8; no boss is placed. |
| Name on screen | none. A boss is "the thing in the hollow pine". Its volume title and Subject File text are lore-page text only, and no volume leads to one. |
| Health and damage | Larger health than a wolf, attack times and bites inside the softened damage table of 6.1, so a team in tier-1 gear survives a few bites. (P: three health bars' worth of a wolf and a bite of about a wolf's.) |
| Tells | A boss telegraphs: a growl clip, a crouch, a lunge. Everyone in the scene sees the same clip (GDD 3.15). |
| Reward | A unique drop (a token, a tin-bound trophy for the home, never a tier above gear tier 3), a lore page and a step in the Nerve branch. |
| Secrecy | A boss scene is a normal scene to the server. Who goes there is visible to those in the scene, as anywhere. The portal is not shown on the map screen. |
| Roles | The Secret Agent (a special Hitman, P2) is dealt only where bosses exist; the Agent's vendetta may use a boss scene as its stage. That belongs to 9A. |

### 3.3 What this round does

Design only. This round writes nothing that places a boss. It commits two things: that every boss lives on a variant scene, and that the town maps stay boss-free. The questionnaire asks whether bosses are scheduled for round 10 (open question 6).

## 4. Achievements

### 4.1 What a step is

An achievement is a **step** in a tree. A step has an id, a short in-world title, a condition written on the server's event bus, the steps it needs, and a reward. The bus already carries `eat`, `mug.end`, `kill`, `train.arrive`, `train.delivery`, `meeting` and more, and 9B's table will add `cut`, `mine`, `pick`, `craft` and `read`. The server evaluates conditions inside `step()` and sends the seat a private `achv` message when a step completes, so the client cannot invent a step (rule 7).

Rewards are cosmetic or sideways: a title, a scarf trim, a journal flourish, a start option chosen from two (for example "begin with a Candle or a Bandage"). They never raise damage, speed, health or income. A step that grants power would make the owner's "full anti-cheat" decision matter, and 4.4 shows why that is costly.

### 4.2 The tree

Six branches grow from one root, **Newcomer** (finish a night). A branch is a chain with forks; each fork is a different way to continue, so two players on one branch rarely share a path.

```
Newcomer ─┬─ Hands ──── Cutter ─┬─ Smith ──── Tin mail ── Flawless
          │             Miner   └─ Carpenter ─ Fenceman
          ├─ Hearth ─── Forager ─┬─ Cook ───── Host
          │                      └─ Trapper ─── Furrier
          ├─ Heart ──── Candle ──┬─ Vigil ──── Warden of the Shrine
          │                      └─ Tither ─── Indulged
          ├─ Wits ───── Reader ──┬─ Scholar ── Archivist
          │                      └─ Pathfinder ─ (leads)
          ├─ Nerve ──── Survivor ┬─ Hunter ─── Boss-bearer
          │                      └─ Evader ─── Unseen
          └─ Name ───── (role branches, 4.3)
```

| Branch | Theme | Step examples (condition) |
|---|---|---|
| Hands | Gather, craft | Cutter: chop 5 lumber piles; Smith: craft a tool at a forge; Flawless: a flawless temper; Fenceman: mend the fence twice |
| Hearth | Food, trade | Forager: gather food 5 times; Cook: cook a meal; Host: feed 3 Hungry figures; Furrier: craft a Leather jerkin |
| Heart | Faith | Candle: tend the shrine; Vigil: three vigils; Tither: donate 20; Indulged: burn an Indulgence |
| Wits | Lore, discovery | Reader: turn 20 pages; Scholar: finish 3 volumes; Pathfinder: follow 3 leads; Archivist: read every volume of a shelf |
| Nerve | Mobs, bosses | Survivor: survive a night; Hunter: kill 5 creatures; Boss-bearer: bring down a boss; Evader: lose a wolf without a bite; Unseen: pass a night with no one seeing you inside a locked room |
| Name | Role victories | see 4.3 |

### 4.3 Example branches by role

A role branch is shown only to its owner, in the private view. It never appears on the roster, in a lobby, on a nameplate or in a title anyone else sees. A cover role's branch uses its true card, so only that seat's own client can show it, and an unlock toast reaches only that seat.

| Role | Branch | Steps (each needs the one before it on its line) |
|---|---|---|
| Detective | Verifier | Verify a clue → Verify three kinds of clue → Name the cause of a death on the evidence → Make an arrest that holds |
| Doctor | Healer | Bandage a bleeding seat → Cure a poison → Perform an autopsy → Keep every seat alive for a day |
| Baker | Hearth | Bake the wake loaf → Feed a Hungry figure → Run the ovens through a night → Stock the cold room |
| Vicar | Shepherd | Hear a confession → Keep a Vigil → Seal a charge → Hold the chapel through the Final Night |
| Gamekeeper | Warden | Set a snare → Mend the fence → Hunt a wolf → Take the right one with you |
| Thief | Cutpurse | Pick a lock → Lift a purse → Open a vault door → Leave by the sea door with 3 Heirlooms |
| Drifter | Hanged man | Act shifty → Fake blood → Be suspected → Win by the town's own hands |
| Killer: Zealot, Activist, Bandit, Hitman | Vendetta | Complete a vendetta stage; each vendetta's own ordered steps (sown / doubt / lapsed; tampered / wrecked; loaded / cracked; offered / accepted / done) |
| Accomplice, Heir | Cover | Plant a clue → Hide a body → Take the knife |
| Townsfolk (baker, fisher, tinner, lamplighter) | Neighbour | Finish a task → Finish a pair task → Finish a chore chain → Win by the bar |

**Two forks per branch** is the minimum, so the shape is a tree and not a list. Each fork is an alternative way to reach the same grade: for the Detective, "Verify by magnifier" or "Verify by fingerprint kit".

### 4.4 Where achievements are stored

The server keeps nothing between matches (GDD 3.21). Three options:

| Option | What it is | Holds | Cost | Risks |
|---|---|---|---|---|
| **A. Device only** | `localStorage` on the player's device, beside the profile and friends list (GDD 3.21) | titles, trims, step counts | none for the server; a few hundred bytes on the client | forgeable (edit your own storage); lost when the browser is cleared; per device, not per person |
| **B. Signed receipt** | At game over the server signs a small blob (`{profile, steps earned this match, counters}`) with a server secret (HMAC) and sends it; the device stores it and sends it back at join | A, plus cross-match counters that cannot be forged | one secret in the server's environment; no database; about a day of work; the receipt can be copied to another device | a copied receipt shares a title; fine for cosmetics, wrong for power |
| **C. Server store** | A database keyed by an account | everything, across devices | new infrastructure (a database on Railway), accounts and sign-in (the profile code "proves nothing" per GDD 3.21, so identity must be real), privacy duties, backup, and a change to GDD 3.21's promise | the largest build; a data-protection question for a game for friends |

**Recommendation.** Ship **A** first for the display (titles, trims), because the owner's players are friends on their own devices. Add **B** only if the owner wants counters that cross matches ("open 50 locks") or wants unlocks to unlock *options* at the start of a match. Keep power out of every unlock so that a forged or copied record cannot hurt anyone. Decline **C** until the game has players the owner does not know. A step earned **inside** a match (most of them) needs no storage at all: it lives in the match log and the end screen.

Whichever is chosen, an achievement record never carries a role of a match in progress, and a record shown on a device is the player's own, never sent to anyone else's screen.

## 5. Gear

Names, slots, tiers and numbers are 9B's (`logic-table.md` 8, all values proposed there and moved to `items.json` and `balance.json` on approval). This section says how gear joins the loops and what it must not do. Everything is role-neutral (`roleBound: false`) except the kit that `items.json` already binds to a card.

### 5.1 Armour

Armour is an equipment slot, not an inventory item (9B 8.2): `body` and `head`, three body tiers and two head tiers.

| Item (9B) | Slot | Tier | Source |
|---|---|---|---|
| Quilted coat | body | 1 | General store, `armoury` loot |
| Leather jerkin | body | 2 | hide from a skinned wolf or boar, at a workbench |
| Tin mail | body | 3 | the forge; taught in Ada Kerrow's chain (1.3) |
| Miner's cap | head | 1 | BlackPine office, mine rack |
| Tin helm | head | 2 | the forge |

**What armour changes.** Creature bites, fists, mugging blows and weapon strikes (9B's rule). It never changes the Knife, Nightshade or the Last Shot, because those kill "as before whatever the health" (A89) and a role's power must not depend on a purchasable item. Reductions multiply under 9B's cap, with the Lodge's `creatureDmg` perk. Heavy armour is slower and louder (9B), which a Killer feels as much as a Hunter.

**What armour shows.** It is public and role-neutral. Whether it is drawn on the figure is 9B's open question 6; 9B's default is HUD and icon only in round 10.

### 5.2 Weapons

9B 8.3 gives each weapon its own numbers: Club, Hatchet/Axe, Pickaxe, Slingshot, Crossbow, with Fists as the unarmed baseline. Every weapon has `kills: false` against a seat, so a player dies only to the Knife or a creature's bite (the pacing rule of the round-9 plan). Against creatures a weapon deals its damage times `creatureMult`.

An axe and a pickaxe are **tools first**. A seat carrying one is not marked as armed in any way a client sees, so carrying a work tool is never a tell. Using a tool as a weapon wears it faster (9B), so the axe in a fight costs the axe.

### 5.3 Tools and durability

Tools and their tiers are 9B 8.1 (Axe, Iron axe, Pickaxe, Iron pickaxe, Spade, Lockpicks, Fine pick, Crowbar, Hammer). They wear; a worn tool breaks with a line ("The axe handle splits."); a grindstone restores it. That gives the camp's grindstones and the smithy a use and gives Scrip a sink, and it makes the lock-pick maker of `emergent-play.md` a real trade. Durability numbers are 9B's.

### 5.4 Hide and skinning (a secrecy finding for 9B)

9B 8.4 lets a creature corpse be skinned "with any Knife (or Replica Knife)". The Knife is the Killer's kit and the Replica Knife the Drifter's (`items.json` `roleBound`). So only a Killer or a Drifter could ever hold hide, and a seat seen with hide, or wearing a Leather jerkin, would be marked as one of them. That breaks role secrecy and the gear tier above. **Request:** skinning must use a role-neutral tool (for example the Hatchet or a new plain Skinning knife that is not the Knife), and 9B 10's Knife column should lose the Skin cell.

## 6. Pacing

The full pacing table (every timer and count against the 480 s day and 300 s night) is 9A's `world-mode.md`. This section gives only the numbers that belong to the living world, and expresses time as a fraction of the day so that it follows 9A's values.

### 6.1 Hostile mobs do less damage

The owner: kills from hostile mobs need to do less damage, and bleeding and poison should not kill. Today a wolf bite is 25 of 100 and four bites kill; over a 480 s day instead of 120 s there is four times as long to meet one.

| Creature | Bite today (GDD 3.22) | Proposed (P) | Effect today | Proposed effect (P) | Bites to kill from full |
|---|---|---|---|---|---|
| Wolf | 25, Bleeding 50% | 12 | Bleeding 50% | Bleeding 35% | 4 → 9 |
| Boar | 18, Bleeding 30% | 9 | Bleeding 30% | Bleeding 20% | 6 → 12 |
| Bat | 6 | 3 | none | none | 17 → 34 |
| Rat | 5, Poisoned 50% | 2 | Poisoned 50% | Poisoned 30% | 20 → 50 |

Armour (5.1) then scales these again. Bite *intervals* (`attackS`) stay, so a creature is no faster, only gentler; flight and light still work.

**Effects stop at 1 HP.** Bleeding and Poisoned drain health but never to zero: they leave the seat Wounded (under `woundedBelow`) and cure on the normal items. Only a Knife strike or a creature's bite takes health to zero. That removes the `bled` and `sickened` causes of GDD 3.22 and their two death cutscenes from play; 9A's world-mode table carries the exact wording. The teardown's "mobs are second layer" answer ("A second layer") is why mobs soften and do not vanish.

**Unchanged.** Regeneration after 8 s out of combat at 2 per second, the Knife, and every kill ring.

### 6.2 Other living-world numbers that scale with the day

| Number | Rule |
|---|---|
| Errand cool-down | a fraction of the day (P: one tenth), not seconds |
| Chore pay and cap | wage sized to the same ratio as the 3-Scrip task wage; cap per day, not per second |
| Node respawn, mob spawn | 9A scales them; this document asks only that gathering feel like a task (a node should return within one day) |
| Hunger | `famishedAfterS` and `moods.hunger.riseS` scale with the day so a player eats about once a day (9A) |
| Lock picked, fine | a lock picked leaves a print and noise (9B table), and a witness writes a Notice for trespass (9B 11). Any fine is the town's reply to that Notice, in `economy.json`'s terms, not a new rule here |

## 7. What this asks of other documents

| Needs | From | Why |
|---|---|---|
| Role-neutral skinning (5.4) | 9B `logic-table.md` 8.4, 10 | secrecy |
| `berries` node, `game` item and a `stew` recipe at an oven (the table has the Wake Loaf bake, 9.4, but no cooked meal from gathered food) | 9B | emergent-play F1, F3 |
| Rent in kind, rent by labour, a purse-only Clerk round | `gdd-map.md` and GDD 3.23 | emergent-play T1 to T3 |
| Refusal reasons for "no axe", "no lockpick" | 9B `failures.md` (9B 10 already has the lines) | 5.3 |
| Day/night scale, train respawn, the `bled`/`sickened` removal | 9A `world-mode.md` | 6 |
| What replaces meetings and the Final Night | 9A `phases.md` | 1.4, 2.5 |
| GDD sections: 3.5, 3.14, 3.15, 3.16, 3.22 (damage table), 3.23, 3.24 (moods as words for figures), 3.25, 3.26 | `gdd-map.md` | after owner approval |

## Open questions for the owner

Each has a proposed default. 6Z collects these in the questionnaire.

1. **Can a townsfolk figure say its need in words?** (1.2) Proposed: yes for figures, no for NPC seats, which amends GDD 3.24. Default: yes.
2. **Should a figure's tip name a look and a place?** (1.4) Proposed: yes, as a rumour-ledger line. Default: yes, one tip per Talk, with a short cool-down per figure.
3. **Do chores exist, and do they count for anything but Scrip?** (2.2) Proposed: yes, small pay, standing and an alibi entry, no part in any win. Default: yes.
4. **How many chains for the five givers?** (1.3) Proposed: the five examples above. Default: build two chains first (Moll, Ada Kerrow) and judge in play.
5. **Where do achievements live?** (4.4) Proposed: option A now, option B only for cross-match counters, option C not at all. Default: A.
6. **Do unlocks ever change play?** (4.1) Proposed: no, they are cosmetic or a start option of equal power. Default: no.
7. **Are bosses scheduled?** (3.3) Proposed: not before round 11; the town maps never get one. Default: lore only for now.
8. **Armour strength?** (5.1) Use 9B's tiers and cap. Default: 9B's values, tuned in the balance lab.
9. **Do melee weapons ever kill a seat?** (5.2) Proposed: no; only the Killer's strike and a creature's bite kill. Default: no.
10. **Mob bite sizes?** (6.1) Proposed: 12, 9, 3 and 2. Default: those.
11. **Does a picked lock leave a print and let a witness write a Notice?** (6.2) This is 9B's rule. Default: yes.
12. **Is Faith fed by presence?** (2.5) Proposed: a chapel vigil, the shrine chore, devotional reading and scared villagers. Default: yes, all four.
13. **Who may skin a creature?** (5.4) 9B's "any Knife" would make hide a Killer or Drifter tell. Proposed: a role-neutral skinning tool. Default: yes.
