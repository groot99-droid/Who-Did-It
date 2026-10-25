# Round 9 (9D): the round-10 build plan

Session 9D, deliverable 7 of `README.md`. Design only: this document plans code, it writes none. It orders the
round-10 pull requests that build the round-9 design (`gdd-map.md` says which GDD section each one changes). It
supersedes the build lists in `logic-table.md` 12 and `failures.md` 7, which it absorbs.

## 1. Rules for every pull request

- **Under 400 lines**, one concern, the build green at every merge.
- **Tests for every rules change**, in `apps/server/test`, `packages/shared/test` or `packages/content/test`. A data
  change that alters a rule gets a test that reads the data.
- **`GDD.md` changes in the same pull request** as the behaviour (CLAUDE.md), from the `gdd-map.md` row it names. So the
  owner approves the round-9 docs before the first round-10 pull request merges, and the final pull request (S6) only
  sweeps `DECISIONS.md` and the cross-references (section 7, question 1).
- **Every client action is queued and consumed inside `step()`**; nothing new mutates state in a message callback. Every
  new secret draw has its own stream in `sim/seeds.ts` (`hitman`, `locks`, `loot`).
- **Model.** "Opus" marks a pull request that sets a contract others build on, touches role secrecy, or needs
  judgement across systems. "Sonnet" marks one that follows a contract already merged.
- **Numbers** come from the design documents as proposals and land in `balance.json`; the balance lab tunes them after
  the playtest, never in the pull request that builds the rule.

## 2. Sessions

| Session | Scope | Model mix | Starts |
|---|---|---|---|
| **10A** | The next-playtest slice: failure messages, pacing, weaker mobs, sleeping, tools on piles and the inventory | Opus for the three contracts, Sonnet for the rest | first |
| **10B** | The law: Constables, petitions, the manhunt, the jail, the Tribunal, crimes; voting retires | Opus | after A3 and A6 |
| **10C** | Death's cost and arrivals: the train's returns, Owing the line, what breaks when I'm gone, the Hitman, Paint The Town Red | Opus | after A6 |
| **10D** | The living world: never-idle NPC seats, depletion, chains and dishes, the lock-pick mini-game, armour, skinning, the jail's mini-games | Sonnet, with Opus for D1 | after A11 |
| **10E** | Achievements on the device, story mode's three chapters | Sonnet | after 10B |
| **6Z** | The final sweep (S6) | Opus | last |

Each session owns the paths its pull requests name; `docs/SESSIONS.md` gets the round-10 rows when 6Z opens the round.

## 3. The next-playtest slice (session 10A)

Merged in this order. Together they give the owner's next playtest a game whose refusals say why, whose day is 480 s
and night 300 s, whose creatures do not end a match, where the night can be slept through, where piles open to tools,
and where the inventory holds what you gather.

### A1. Refusal reasons: the contract (Opus)

- **Files.** `packages/shared/src/protocol/refusals.ts` (new: `RefusalReason`, `REASON_CODE`, the reasons of
  `failures.md` 4.1 to 4.9), `packages/shared/src/protocol/` error frame (optional `reason`, `args`, `interaction`),
  `apps/client/src/ui/copy/refusals.ts` (new: the lines).
- **Tests.** Every reason has a line (a type-level `Record`); `REASON_CODE` covers the enum; no line names a role or an
  ability (`failures.md` rule 4); old clients that ignore `reason` still get `msg`.
- **Depends on.** nothing.

### A2. Refusal codemod: `rooms/` (Sonnet)

- **Files.** `apps/server/src/rooms/handlers/*.ts`; `reject` takes a reason.
- **Tests.** The handler tests assert the reason as well as the message; `reject` runs only inside `step()`.
- **Depends on.** A1.

### A3. Refusal codemod: `sim/` (Sonnet; may split in two by directory to stay under 400)

- **Files.** `apps/server/src/sim/**` refusal sites (`failures.md` 9), `sim/economy/*` first.
- **Tests.** As A2; a lint test forbids a literal message at a refusal site; every fallthrough returns `NFY` with a
  feature tag.
- **Depends on.** A1.

### A4. Refusal display (Sonnet)

- **Files.** `apps/client/src/net/` refusal handler, `apps/client/src/ui/` toast, the use prompt; delete `lastVerb` and
  `refuse.generic`; the NFY style.
- **Tests.** A golden test of the seven owner-visible examples of `failures.md` 5; the client shows the server's line
  (the `World.ts:761` fix).
- **Depends on.** A1 (A2 and A3 may land in either order around it).

### A5. Pacing: the day and night clocks (Sonnet)

- **Files.** `packages/content/data/balance.json` (the timer table of `world-mode.md` 7.1, the N, D and C rows only;
  the removed meeting keys stay until B6), `packages/content/data/abilities.json` and `clues.json` clocks,
  `GDD.md` 3.3 and 3.9.
- **Tests.** A content test checks each scaled key against its factor; the strikes per night per row of GDD 3.9 are
  unchanged; a sim test runs one 810 s cycle.
- **Depends on.** nothing.

### A6. Weaker mobs; effects stop at 1 HP (Sonnet)

- **Files.** `mobs.json` (bites 12, 9, 3, 2 and the effect chances), `effects.json`,
  `apps/server/src/sim/body/effects.ts` and `damage.ts` (the 1 HP floor; `bled` and `sickened` retire),
  `apps/server/src/sim/Death.ts`, `GDD.md` 3.15 and 3.22.
- **Tests.** Bleeding and Poisoned never take health below 1; a full wolf chase leaves about 28%; only the Knife and a
  bite reach zero; the death cutscenes for `bled` and `sickened` are gone from the cause list.
- **Depends on.** nothing.

### A7. Sleeping: the server (Opus)

- **Files.** `apps/server/src/sim/Sleep.ts` (new), `sim/Phases.ts` (end the night when every active player is asleep for
  `sleep.confirmS`), `balance.json` `sleep.*`, a `bed` prop kind in `scenes/*.json` at each home's bed (no id
  renamed), the chapel cot, `GDD.md` new 3.32.
- **Tests.** Active means living, free, connected humans; an NPC never holds the night open; a Killer awake holds it
  open; a move or a hit wakes; a boarded home refuses `NO_BED`; the night skip runs the normal dawn.
- **Depends on.** A1 (its reasons), A5.

### A8. Sleeping: the screen (Sonnet)

- **Files.** `apps/client/src/ui/` asleep overlay (`phases.md` 13.4), the bed prompt, the "You slept through" line.
- **Tests.** The overlay shows no count of who is awake by name; it closes on the wake event.
- **Depends on.** A7.

### A9. The logic table: schema and validator (Opus)

- **Files.** `packages/content/src/schemas/interactions.ts` (new), `packages/content/src/validate.ts`,
  `packages/content/data/interactions.json` (the live classes, no behaviour yet), the census mapping with `tree` stems.
- **Tests.** Every prop matches at most one class; the audit totals add up to the census; `leaves` takes `print` or
  `scratch`; `minigame` and `fineChance` validate.
- **Depends on.** nothing.

### A10. The resolver (Opus)

- **Files.** `apps/server/src/sim/interact/resolve.ts` (new), `act.hold {action: 'interact'}` behind the legacy
  dispatch, `sim/Resources.ts`.
- **Tests.** A seat without the tool gets `NEED_TOOL`; with it, drops land and the tool wears; the result is public
  state; an NPC hold goes through the same resolver.
- **Depends on.** A1, A9.

### A11. Tools on piles (Sonnet)

- **Files.** `items.json` and `recipes.json` (Axe, Pickaxe, Crowbar, Hammer, the grindstone), `interactions.json` (the
  tool walls of `logic-table.md` 2 and 5.1: woodpiles, stumps, trees, boulders, rock and ore piles, nailed crates),
  `resources.json` (`respawnS`, the boulder 1200 s), `GDD.md` 3.14.
- **Tests.** Bare hands get nothing from a pile and `NEED_TOOL` names the tool; nodes keep bare hands; yields, wear,
  break and respawn; the three-sources test (`emergent-play.md` E1) still passes for wood and stone.
- **Depends on.** A10.

### A12. The inventory: slots on the server (Opus)

- **Files.** `packages/shared/src/schema/` private view (hotbar 6, pack 18, belt 2, head, body, weapon),
  `apps/server/src/sim/Inventory.ts`, `balance.json` `inventory.*` and per-kind `resources.stackMax` (materials 16,
  food 4), `GDD.md` new 3.30.
- **Tests.** The inventory lives only in its seat's private view; stacks cap by kind; a tool goes to the belt first; a
  dropped body drops pack, belt and purse but keeps bound kit; a full pack refuses with its reason.
- **Depends on.** A1.

### A13. The inventory: the screen and the 2×2 grid (Sonnet)

- **Files.** `apps/client/src/ui/Inventory.ts`, `Crafting.ts` (the grid; 3×3 at a workbench),
  `apps/server/src/sim/Craft.ts` (shapeless match, optional `shape`), `recipes.json` (`shape` where it matters).
- **Tests.** A shapeless recipe matches in any cells; a shaped one only in its shape; a bound item refuses
  `GRID_BOUND`; no recipe refuses `GRID_NO_RECIPE`; the touch strip selects a hotbar slot.
- **Depends on.** A12.

**Playtest gate.** After A13 the owner's playtest runs on the round-10 build. Feedback goes to the balance lab before
10B to 10D tune anything.

## 4. The rest of round 10

### Session 10B: the law (all Opus)

| PR | Files | Tests | Depends on |
|---|---|---|---|
| **B1. Constables** | `looks.json` `constable`, `routines.json` (their routine), `sim/law/Constables.ts`, `balance.json` `law.*`, `GDD.md` 3.17 | Two per map; they verify clues at `law.speedMult`; they read only world facts, never a card; their look is never a card's or `villager` | A10 |
| **B2. The briefing** | `sim/law/Briefing.ts`, `lore.json` lines, the board post | Posted `law.briefingAfterS` after a clue; names a look and a place, never a seat | B1 |
| **B3. Petitions** | `sim/law/Petition.ts`, `balance.json` `petition.*`, `phases.md` 13.1 screen | Threshold; one open at a time; the cooldown; refusals `PETITION_GRACE`, `PETITION_OPEN`; never waits on an NPC | B2, A1 |
| **B4. The manhunt and the cuff** | `sim/law/Manhunt.ts`, `balance.json` `manhunt.durationS`, `law.cuffHoldS`, `phases.md` 13.2 | Any human or Constable cuffs; `NOT_HUNTED`; the cuffed seat is led to the jail | B3 |
| **B5. The county jail** | `scenes/cj_*.json` and `SCENE_IDS` appended, `sim/Jail.ts`, `balance.json` `jail.*`, `GDD.md` 3.27 | Held until the next dawn; no portal out; not active for sleep; `IN_JAIL`; ids appended only | B4 |
| **B6. The Tribunal and crimes; voting retires** | `laws.json`, `sim/law/Tribunal.ts`, `sim/Meeting.ts` removed paths, `balance.json` `trial.*` and the removed meeting keys, `GDD.md` 3.8 | Proven at `trial.convictAt`, murder at `trial.murderAt`; each crime's sentence; no vote remains | B5 |
| **B7. The Inquest and the bell** | `sim/law/Inquest.ts`, the bell's purposes, `phases.md` 3 | Opens on a body report only; the bell gathers for the ringer's purpose or dings | B6 |
| **B8. Walk with me** | `sim/law/Pairing.ts`, the inspect panel | One delay distribution for humans, NPC seats and townsfolk; an NPC seat's yes does not depend on its card | B1 |

### Session 10C: death's cost and arrivals (all Opus)

| PR | Files | Tests | Depends on |
|---|---|---|---|
| **C1. The train returns the day's dead** | `sim/Train.ts`, `sim/Death.ts`, `balance.json` `respawn.hp`, the On-the-line screen | Only daylight deaths return; the seat keeps its card and notebook and loses its pack and purse; no ghost view while on the line | A6 |
| **C2. Owing the line** | `sim/economy/fare.ts` (new), `balance.json` `respawn.*`, `GDD.md` 3.23 | The fare per death; price, stock and wage multipliers until paid; paid like rent; no curfew of its own (R7) | C1 |
| **C3. What breaks when I'm gone** | `roles.json` (a `townWork` field per card, section 5), `sim/economy/townWork.ts` | Each row of section 5 stops while its look is gone and resumes on return; it follows the look, never the card (section 5 rule) | C1 |
| **C4. The Hitman's arrival** | `sim/vendettas/arrival.ts`, `sim/seeds.ts` `hitman` stream, `balance.json` `hitman.*`, `roles.json`, `GDD.md` 3.33 | The table by human count; days 3 to 5; the dormant role; nothing names the turned seat; the stream is secret | C3 |
| **C5. Paint The Town Red** | `sim/Deck.ts`, `sim/Win.ts`, `balance.json` `paintTown.winUnique` | Two humans deal two Killers; every NPC death returns; the unique and total counts; the shared win | C1 |
| **C6. Robbery and the town chest** | `sim/body/fists.ts`, `sim/economy/chest.ts`, `items.json` `roleBound` | A knockout robs everything but bound kit, armour and the bank (R14); the chest's claim | B6 |

### Session 10D: the living world (Sonnet, D1 Opus)

| PR | Files | Tests | Depends on | Model |
|---|---|---|---|---|
| **D1. Never-idle NPC seats** | `sim/npc/*`, `routines.json` action chains | An NPC seat idles only between actions; it trades only what it holds; nothing waits on it | A10, A12 | Opus |
| **D2. Depletion** | `resources.json`, `sim/Resources.ts`, NPC holds | NPC holds take real stock; every pile returns | D1 | Sonnet |
| **D3. The mill and timber** | `interactions.json` head saw and saw horse, `scenes/bp_mill.json` props | Logs become Timber only at a saw | A11 | Sonnet |
| **D4. The bakery's sections and dishes** | `recipes.json` `parts` and `buff`, `effects.json` buffs, `scenes/crumb_*.json` | A dish needs its parts; one buff at a time until dawn; max health bounded (R12) | A13 | Sonnet |
| **D5. The lock-pick mini-game** | `minigames.json` `lockpick`, `apps/client/src/ui/` the mini-game, `sim/Minigames.ts`, `sim/seeds.ts` `locks`, `clues.json` `scratch`, `GDD.md` 3.29 | Pins by tier; `snapAt`; `PICK_SNAPPED`; the scratch is role-neutral; the fine chance | A10 | Sonnet |
| **D6. Armour with properties; the skinning knife** | `items.json`, `balance.json` `armor.*`, `sim/body/damage.ts` | Tier multipliers; resistances; the Knife ignores armour; skinning needs no role kit | A12 | Sonnet |
| **D7. Rent in kind and the boarded house** | `sim/economy/rent.ts`, `economy.json`, door locks | Goods, then boards; the boards pry for a night; `BOARDED_HOME` | A7, D5 | Sonnet |
| **D8. The jail's mini-games** | `minigames.json`, `sim/Jail.ts` | Once a day each; Strength +2; −10 max health on a lost fight; time off a sentence | B5 | Sonnet |
| **D9. Talking townsfolk and quest chains** | `lore.json`, `quests.json`, `sim/townsfolk/*` | One tip per Talk with a cool-down; two chains (Moll, Ada Kerrow); no tip names a seat | D1 | Sonnet |

### Session 10E (Sonnet)

| PR | Files | Tests | Depends on |
|---|---|---|---|
| **E1. Achievements on the device** | `achievements.json` (new), `sim/events` step evaluation, the client's `localStorage` record, `GDD.md` 3.28 | Steps evaluate in `step()`; the `achv` message is private; no reward changes power | B6 |
| **E2. Story mode, three chapters** | `story.json` (new), the chapter cards | A role switch at each chapter break | E1 |

### S6. The final sweep (6Z, Opus)

`DECISIONS.md` rows for every owner answer and R1 to R18; a check that every `gdd-map.md` row's GDD edit landed; the
cross-references of the round-9 docs.

## 5. What breaks when I'm gone (owner answer WM1)

While a role's figure is dead (on the line, or for good after dark), its town work stops for everyone. When it returns,
the work restarts but the seat is Owing the line (`world-mode.md` 6), so its goods are dear and thin until the fare is
paid.

**The rule that keeps it secret.** The work follows the seat's **public look**, never its card. A cover-wearer or a
Killer wearing a card's character keeps that character's work running while alive (as an NPC would, `living-world.md`
1.8) and stops it when dead, so a death never reveals a cover or a true role. The Hitman's turned seat stops its work
while dormant (`hitman.dormantOutput`), which is the public sign the design wants. All effects below are proposals for
the balance lab.

| Card (look) | Town work | What breaks while gone |
|---|---|---|
| Baker | Bread and the Wake Loaf at Crumb's | The bakery stall empties; the town's food prices rise; Famished spreads faster |
| Lamplighter | Lights the lantern posts at dusk | Posts stay dark: creatures come nearer the square, and Fear rises in townsfolk |
| Doctor | Bandages, Salts, autopsies | No healing at the surgery; Wounded seats heal only by regeneration |
| Vicar | Services, confession, Faith | Faith stops rising at the chapel; the ward weakens |
| Herbalist | Remedies at the apothecary | No cures for Poisoned; the remedy stock runs down |
| Fisher | Fish to the market | The market's fish stock and the Game Pie's parts run short |
| Tinner | Tin ore to the forge | The forge's tin and the tier-2 tools and armour stop |
| Gamekeeper | Keeps the woods; game to the market | Wolves press closer at the wood's edge; game runs short |
| Ranger | Patrols, snares, arrests | The trails go unwatched; snares are not reset |
| Watchman | Keeps a door each night | That door goes unwatched; the curfew is looser |
| Butler | Keys and the manor ledger | Manor locks stay as they are; no ledger slips |
| Detective | Inspects and compares clues | Clues verify only at the Constables' pace |
| Medium | Séances | No word from the dead |
| Child | Witnesses, errands | Fewer witness lines; errands go undone |
| Townsfolk | Tasks and chores | The chores it carried go undone |
| Thief (cover) | none of its own | The worn look's work stops |
| Drifter (cover) | none of its own | The worn look's work stops |
| Killer, Heir | the worn look's work | The worn look's work stops |
| Accomplice | the worn look's work | The worn look's work stops |

Cards the roster adds later (the Postmaster, the Bartender, the Company Clerk, the Police Officer, the Judge) get their
row when they ship; C3's test fails a card with no `townWork` entry.

## 6. Dependencies at a glance

```
A1 ─┬─ A2, A3, A4
    ├─ A7 ── A8
    └─ A12 ── A13
A5 ── A7
A9 ── A10 ── A11
A6 ── C1 ── C2, C3 ── C4; C5
A10 ── B1 ── B2 ── B3 ── B4 ── B5 ── B6 ── B7; C6; E1 ── E2
A10, A12 ── D1 ── D2, D9;  A11 ── D3;  A13 ── D4;  A10 ── D5;  A12 ── D6;  B5 ── D8
```

## 7. Questions for 6Z

1. **`GDD.md` per pull request or once at the end?** README plans one final `GDD.md` pull request; CLAUDE.md requires
   the GDD change in the same pull request as the behaviour. Proposed default: each pull request edits its own GDD
   section after the owner approves the round-9 docs, and S6 only sweeps `DECISIONS.md`.
