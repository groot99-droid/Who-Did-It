# Stations: the hands-on widgets (7M, round 8 addendum C)

> The owner's ask (2026-10-24, through 6Z) and the audit that answers it. Decision A200. Numbers live in `GDD.md` and
> `balance.json`; this file holds the plan, the owner's words and the open questions. 7M writes it; 6Z merges.

## 1. The ask, verbatim

> "i want a diverse collection of mini UI/UX widgets at every station in the game partially for the game, mostly for the
> wacky fun filler but still coded with the games. like walking up to a book shelf should allow you to read through the
> lore of the game, with books and letters spread throughout multiple shelf locations, you should be able to go to the
> well and play a mini game where winning gives you random objects like a lock pick or other, when you go to the mail
> box, the bank, etc. i dont want any task to be a one click job. even putting things in the oven. this is a hands on
> game where the actions should feel tactilely similar to what they portray. immerse the character in complex mini
> games. this is for 7M to deal with if we dont already have this planned, and id like for 7M to start sending me more
> questionairs directly so i can personal author"

### Round 1 (2026-10-24, four questions, answered in the session)

| Question | Owner's answer, verbatim |
|---|---|
| Which stations first (multi-select: shelves and lore, the well and pump, the oven and bakery line, the counters) | All four, in that order: "Shelves, letters, lore", "The well and pump", "Oven and the bakery line", "Counters: mail, bank, shops" |
| Who writes the books and letters, in which voice | "just put a placeholder know "fill later", the new codex isnt finished just yet" |
| What the well gives and how often | "you walk up to the well, a mini screen pops up you have luck meter on drop of a coin, 10 percent chance "luck" escape death once, 20 percent coin back, 20 percent rare item, 25 chance nothing, 25 percent chance loitering (increases suspicion). the well can only be used once a day and it increases 10x per day, this is on a per player basis." |
| How long and hard a station game is | "Varies by station" (per station in round 2, with the mock-up in front of the owner) |

### Round 2 (2026-10-24, the shelves and the well's unknowns, answered in the session)

| Question | Owner's answer, verbatim |
|---|---|
| How the reader behaves at a shelf | "Pull a spine, leaf pages": 3 to 5 spines, drag one out to open it, pages turn by drag or swipe with two large arrows on touch, letters unfold as one sheet, walking away closes it |
| The well's coin and what grows "10x per day" | "1 scrip, price x10 each day": day 1 costs 1 scrip, day 2 10, day 3 100, per player; one play per player per day cycle; "coin back" returns what was paid; the coin goes to the town till |
| The rare-item band and loitering | "role flavored finds with first loitering option": the rare band draws from a role-neutral list plus one item that helps the seat's own card (a bandage for a Doctor, a snare for a Gamekeeper); loitering is +2 suspicion with every NPC seat that saw the figure at the well, with a log line only the seat sees ("You dawdled at the well.") |
| How "luck" escapes death once | "Silent charm, Remedy-like": the seat holds an invisible charm; the first Knife strike that would kill leaves it Wounded at 1 HP instead and the charm is spent; nobody else sees it until the strike |

## 2. The rules every widget keeps (6Z, 2026-10-24)

1. Every widget action is a queued command the server consumes in `step()`; nothing mutates state in a message callback
   (CLAUDE.md). The pattern is GDD 3.16: the hold opens the widget, the server draws any puzzle on a stream and keeps the
   answer, the client sends its record, the server replays it.
2. Every outcome is rolled server-side on a stream of its own in `sim/seeds.ts` (`'well'`, `'stations'`), never
   `npcPlay`, `deal`, `traits` or anything that feeds a secret. Stream names are 6Z's one-liners, asked for in a PR
   description first.
3. No reward, record or page reveals a role, a cover or a private view. A book is the same bytes for every seat. What
   the well gives goes to the private view only; what others see is the figure at the well.
4. Reduced motion is respected (`prefers-reduced-motion`: no spin, a settle); every widget works on touch at 1280x720
   and on a phone (drag, scrub and tap, never hover or a right click); the night theme as the five mini-games.
5. New items (a lock pick for everyone, a luck charm) are 8A's (items and effects) or 8D's (economy); 7M names the
   need in a PR description and 6Z routes it. Numbers are `balance.json` and GDD rows; a behaviour change lands with
   its GDD change in the same PR.
6. Books, letters and clippings are content: `packages/content/data/lore.json`, validated by zod, every page a
   placeholder reading "fill later" until the codex is done (owner, round 1). The canon pass (teardown.md 4) renames
   text once; ids are frozen.

## 3. The audit: what a station is today

A **station** is a prop a player can walk up to and act on. Today a player acts on a prop in one of four ways:

- **hold**: `act.hold` with an action (`'task' | 'gather' | 'craft' | 'collect' | 'inspect' | 'autopsy' | 'shop' |
  'bank'`), a plain 2-3 s bar; nothing to do with the hands but keep the key down;
- **mini-game**: the hold opens one of the five kinds (`crates`, `pour`, `slide`, `stoke`, `tap`; 6-12 s, assist after
  20 s): nine of the ten `tasks.json` rows have one (the tenth, Shutter the windows, is the co-op hold of PR 4b);
- **panel**: the hold opens a panel whose buttons are one click each (the shops, the bank, the mailbag);
- **nothing**: the prop is drawn, an NPC may stand at it (`routines.json` work and social stations), and a player
  cannot act on it at all.

The client offers a prompt only for the kinds in `INTERACTABLE_PROPS` (`view/mapDefs.ts`: bell, pump, noticeBoard,
kitChest, basin, taskSource, lanternPost, oven); a shelf is `decor` or `dressing` and gets none.

| Station (kind; ids) | Today | Widget | Tactile verb | Reward | GDD row | Owner |
|---|---|---|---|---|---|---|
| Shelves (`decor`/`dressing`: `as.shelf`, `bo.wall_shelf_0/1`, `bl.wall_shelf`) | nothing | the **reader**: pull a spine, pages turn by drag or swipe | pull, leaf, close | none; lore | new 3.26 | round 1: first; pages "fill later" |
| Letter box (`taskSource` `wp.letter_box`) | 2 s hold picks up the letter | the reader, then the pick-up as today | unfold, read, pocket | the letter (as today) | 3.5, 3.26 | round 1 |
| Ledger (`ledger` `bk.ledger`) and the office payroll ledger (`bo.*`, dressing) | nothing | the reader, columns | run a finger down, turn | lore | 3.26 | round 1 |
| Notice boards (`noticeBoard`, 2) | prompt, no action behind it | the reader: clippings, the Gazette, 8D's notices when they exist | unpin, read, pin back | lore | 3.26, 3.23 | round 1 |
| The well (`ov.well`, `cl.well`; a wash station today) | 3 s wash hold (Bloody) | the **luck meter**: drop a coin, the meter spins and settles | drop, watch, reach in | owner's table in 4 | new 3.27, 3.5 | round 1 answered; round 2 asks the rest |
| The pump (`pump` `ov.pump`) | fixPump slide game; stockColdRoom draws a bucket by hold | keep the slide; the bucket fill becomes a pump stroke | pump up and down | as today | 3.5, 3.16 | round 2 |
| Brick oven (`brickOven` `co.brick_oven`) | ovenStoke stoke game (d2) | **rake and set**: rake the coals flat, drag each timber onto the glow, then a peel slides the loaf | rake, set, slide | as today | 3.5, 3.16 | round 1: third; round 2 for the gesture |
| Bakery oven (`oven` `bk.oven`) | prompt, no action behind it | the peel: slide loaves in, pull before the band burns | slide, pull | none today; a Wake Loaf when 8D's bakery sells one | 3.16 | round 2 |
| Mixer (`doughMixer` `cm.mixer`) | doughPour pour game | **knead**: push and fold, the dough tears when rushed | push, fold | as today | 3.5, 3.16 | round 2 |
| Proofer (`proofingCabinet` `cp.proofer`) | proofSlide slide game | shelter the candle flame while the door closes | cup, shut | as today | 3.5, 3.16 | round 2 |
| Cold shelves (`coldShelves` `cf.cold_shelves`) | coldCrates crates game | pour the bucket along the trough without spilling | tilt, pour | as today | 3.5, 3.16 | round 2 |
| Flour sacks and bin (`taskSource` `bk.flour_sacks`, `flourBin` `tb.flour_bin`) | flourCrates crates game | heave the sack onto a shoulder, tip it into the bin | heave, tip | as today | 3.5, 3.16 | round 2 |
| Lantern posts (`lanternPost`, 8) | lanternPour pour game | keep pour; the wick-pole lights it after | pour, reach up | as today | 3.5, 3.16 | round 2 |
| Fence (`fence` `ov.fence`) | fenceCrates crates game | hold the plank level and drive the nails | hold, hammer | as today | 3.5, 3.16 | round 2 |
| Dartboard (`dartboard` `tb.dartboard`) | letterTap tap game | keep tap (the pin goes in on the beat) | pin | as today | 3.5, 3.16 | done (PR 3) |
| Shutters (`window` `tb.shutters`) | the co-op hold (PR 4b) | two hands on the bar, both must keep pushing | push together | as today | 3.5 | PR 4b, as planned |
| Mailbag (`ov.mailbag_platform`, 8D) | `act.hold` hands out the slips | untie the bag, sort the slips into hands | untie, sort | 8D's Blackmail Notices | 3.23 | round 1: fourth; spec with 8D |
| Bank (`bank` `bo.bank_counter`, 8C) | hold opens a panel; deposit and withdraw are one click | slide coins across the counter, stamp the slip | slide, stamp | 8C's balance | 3.23 | round 1: fourth; spec with 8C |
| Shop counters and stalls (`economy.json` `shops`, 8C) | hold opens a panel; buy and sell are one click | count the coins out, the keeper wraps the goods | count, take | 8C's purse and items | 3.23 | round 1: fourth; spec with 8C |
| Black market (`tk.shop_black_market`, `bl.shop_black_market`, 8D) | fence a notice, one click | slide the notice under the counter, palm the scrip | slide, palm | 8D's fence price | 3.23 | with 8D |
| Altar (`ov.altar_shrine`, `ch.altar_main`, `bc.altar_shrine`, 8D) | donate, one click | drop coins one at a time into the box, light a taper | drop, light | 8D's Faith | 3.23 | with 8D |
| Basins (`basin`, 4) | 3 s wash hold | scrub: rub until the water runs clear | scrub | Bloody ends (as today) | 3.3 | round 2 |
| Bell (`bell`, 2) | press rings it | pull the rope, the bell swings; a short pull is a weak clang | pull | a meeting (as today) | 3.1, 3.3 | round 2; the meeting rule does not change |
| Kit chest, key cache (`kitChest`, `keyCache`) | hold opens | lift the lid, rummage | lift, rummage | as today | 3.2, 3.20 | round 2 |
| Wake table (`wakeTable`), the dead loaves | the wake-loaf scene | set the loaves in their places | set | as today | 3.1 | round 2 |
| Goat (`goat`), the gas pockets, locked door | nothing or a hold | feed, hold a breath, pick the lock | feed, hold, pick | as today or none | 3.5, 3.20 | later |

Every row keeps the task's effect and wage: the hands change, the rules do not, except where this file says a new
GDD row comes with it (3.26 the reader, 3.27 the well). A fetch task still needs its tool and its node; the global
task bar still wins at 100%.

## 4. The well, as the owner set it (rounds 1 and 2)

- **Coin.** One play costs Scrip from the seat's purse (8C), paid to the town till: `well.priceDay1` 1 on the seat's
  first play of the match, then ten times the last price on each later day (1, 10, 100, `well.priceGrowth` 10). No
  coin, no spin. One play per seat per day cycle (`well.playsPerDay` 1). All of it per seat.
- **Luck meter.** The widget: the coin drops, a needle spins and settles on one of five bands. Reduced motion: no
  spin, the needle fades in on its band. The server rolls on the `'well'` stream before the needle moves; the client
  only shows the roll it is sent.
- **The table** (`balance.json` `well.bands`, rolled server-side, the owner's numbers): 10% **luck**, a silent
  charm: the first Knife strike that would kill the seat leaves it Wounded at 1 HP and spends the charm, as the
  Herbalist's Remedy (GDD 3.2), private until the strike, nothing on the figure; 20% **coin back**, what was paid
  returns to the purse; 20% **rare item**, one draw from a role-neutral list (`well.finds`: lock pick for any role,
  lens, chalk, rope, lantern oil) plus one entry that helps the seat's own card (`well.cardFinds`, keyed by role: a
  bandage for the Doctor, a snare for the Gamekeeper, and so on), so the draw never leaves the private view and a
  found item only hints at a role when its owner uses it in public, as any kit item does; 25% **nothing**, a bucket
  of cold water; 25% **loitering**, +2 suspicion (`well.loiterSuspicion`) with every NPC seat that saw the figure at
  the well, through 8B's relations machinery (`Brain.suspicion`, GDD 3.22), and a log line only the seat sees, "You
  dawdled at the well."
- **Secrecy.** The roll goes to the private view. Others see a figure at the well for the widget's length, the same
  whatever was rolled, so the band cannot be read from outside; a seat with a spent or unspent charm looks the same.

The charm is an effect from 8A (`body.md` 3), the coin an 8C purse call, the suspicion an 8B call, the role-neutral
lock pick an 8A item; 7M writes the rule (`@wdi/shared` `rules/well.ts`, pure, numbers from `balance.json` `well`),
the server station and the widget, and the GDD 3.27 section with the 3.5 row.

## 5. The reader and the lore data

- `packages/content/data/lore.json`: `{ gddRef, shelves: { [propId]: { title, volumes: [{ id, title, kind: 'book' |
  'letter' | 'ledger' | 'clipping', pages: string[] }] } } }`, validated by zod in `@wdi/content`, tested (every
  shelf id is a prop in a scene file, every page non-empty, no page longer than the reader fits). Every page ships as
  the placeholder "fill later" until the codex is done; the owner authors pages in place later and the test keeps
  them printable.
- The reader: a `read` hold on a shelf, box, ledger or board (a `'read'` `HoldAction`, 6Z's one-liner, routed in
  `Hold.ts` beside `inspect`) opens the reader when the server acknowledges it; walking out of `doors.reachTiles`
  closes it as every hold. Pages turn by drag, swipe, arrow keys and two large buttons; the first page is readable at
  1280x720 and on a phone. The server keeps nothing of what was read. The letter box keeps its pick-up after the
  reader.
- Notice boards show lore clippings now and 8D's notices and the Gazette when 8D lands them (the data stays 8D's).

## 6. PR split (one concern each, under 400 lines, drafts, 6Z merges)

The 7M stack 4a -> 4b -> 4c -> 5 runs on `claude/r7-minigames` as planned; this audit does not change its order. The
station work runs on a second branch, `claude/r8-stations`, one open PR at a time, so a station PR can be up while a
stack PR waits on review (6Z to confirm the second branch).

| PR | Concern | Touches | Needs from 6Z |
|---|---|---|---|
| S0 | This file and the A200 row | `docs/round8/stations.md`, `docs/DECISIONS.md` | the README row in `docs/round8/README.md` (6Z's) |
| S1 | Lore data and its schema: `lore.json` with every page "fill later", zod, content tests | `packages/content` | none |
| S2 | The reader widget and the `read` hold | `apps/client/src/ui/reader/**`, `Hold.ts` routing line, GDD 3.26 | `'read'` in `HoldAction`; `docs/PROTOCOL.md` regenerated |
| S3 | The well rule and station: pure rule, balance numbers, server station, tests; GDD 3.27 and the 3.5 row | `packages/shared/src/rules/well.ts`, `apps/server/src/sim/stations/Well.ts`, `balance.json` | `'well'` stream in `seeds.ts`; a host line in `Step.ts`; 8A death-save effect, 8C purse call, 8B suspicion call (routed) |
| S4 | The well widget (luck meter), touch, reduced motion | `apps/client/src/view/stations/well.ts` | the `S2C` message for the roll (payload agreed first) |
| S5 | The bakery line gestures: `knead`, `rake`, `peel` mini-game kinds, rules, tests, widgets, `minigames.json` rows; GDD 3.16 | `rules/minigames.ts`, `view/minigames/*`, content | `MinigameKind` one-liners |
| S6 | The pump stroke, the heave, the hammer, the taper: the remaining task gestures | as S5 | as S5 |
| S7 | Counters with 8C and 8D: the coin slide and stamp, the mailbag, the keeper's wrap | the economy panels (8C's and 8D's files, by agreement) | 8C and 8D |
| S8 | Bell, basins, chests, wake table | client widgets over today's holds | none |

Each PR with a rules change carries its test and its GDD change; S1 and S2 change no rule. Round 2 of the
questionnaire (one station at a time, with the mock-up) runs ahead of each build PR, and its answers land verbatim in
the A200 row's follow-ups.
