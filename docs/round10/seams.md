# Round 10 seams: what the sessions share

Every session of round 10 reads this before its first edit, and again after a compaction. A name, a number or a
rule here is fixed: a session that needs another one asks 6Z in its pull request description first, and 6Z adds
it here. Numbers stay in `GDD.md` and `packages/content/data`.

## 1. Shared files

| File | Rule |
|---|---|
| `packages/content/data/balance.json` | Change a key in place; add a new key under its own top-level block (`sleep`, `law`, `petition`, `trial`, `jail`, `respawn`, `hitman`, `hardship`, `inventory`, `armor`, `guard`, `defrock`, `bed`, `train.dusk`, `paintTown`). Never reorder or reformat other blocks. A removed key goes in the pull request the plan names (the meeting keys in B6). |
| `docs/GDD.md` | Edit only the sections your pull request names (plan, `gdd-map.md`). The new sections 3.27 to 3.33 are stubs from the contract: fill yours, leave the others. |
| `packages/shared/src/protocol/refusals.ts` | A1 creates it. After A1 the `RefusalReason` list is **append-only**: add at the end, never rename, renumber or reuse a reason or its code. A new reason gets its line in `apps/client/src/ui/copy/refusals.ts` in the same pull request (the type-level `Record` test fails otherwise). |
| `apps/server/src/sim/seeds.ts` | `StreamName` is append-only. One new stream per secret draw, added in the pull request that draws it: `loot` (whichever of A10 and A11 first rolls a chest's or a pile's loot), `locks` (D5), `hitman` (C4), `hardship` (C4), `homes` (A7a, the human seats' homes). Nothing public shares a secret stream. |
| `packages/shared/src/schema/index.ts` | `SCHEMA_VERSION` goes from 6 to 7 once, in whichever of A12 and A10 merges first; the other joins 7. Later round-10 rows join version 7 in merge order (section 3). |
| `SCENE_IDS` and `scenes/*.json` | Append-only ids (GDD 3.13, WORLD 4.3). B5 adds the `cj.` prefix. A new prop (a `bed`, a lock, a saw horse) gets a new id; no id is renamed. |
| `packages/content/data/events.json` | Append events; never rename one. |
| `docs/DECISIONS.md` | Each session writes under its reserved row (section 5); nobody edits an older row. |
| `docs/UI.md` 14 | Each session's copy goes in its subsection (section 5). |
| `apps/server/test/*.test.ts` | No session edits an existing test file without 6Z's grant. List the files and why in the pull request description; 6Z grants on review. A new test file needs no grant. 10G has a standing grant for the handler and sim tests its codemod changes, as long as the assertion only gains the reason. |

**Merging.** Before a session marks a pull request complete it merges `origin/claude/zen-turing-m1jnw0` in and runs
the full check. A JSON conflict keeps both sides' keys. A conflict in another session's logic goes to 6Z.

## 2. Ids the plan already fixes

- **Refusal reasons.** The reasons of `failures.md` 4.1 to 4.9 and the `NFY` tag all land in A1, so no later session
  waits on another for a reason it needs. A reason the census missed is appended by the session that needs it.
- **`balance.json` keys.** `round10-plan.md` and `followup-4.md` 4 name them. A session adds only the keys of its own
  pull requests.
- **GDD numbers.** 3.27 the county jail (B5), 3.28 accounts and achievements (E1), 3.29 the lock-pick mini-game
  (D5), 3.30 the inventory and crafting (A12, A13), 3.31 law enforcement and petitions (B1 to B4), 3.32 sleeping
  (A7), 3.33 the Hitman's arrival (C4). Paint The Town Red stays in 3.1 and 3.8 (C5).
- **Looks.** `constable` (B1) is the only new look. Atlas keys `char/constable/<anim>/<dir>`; until the art lands it
  draws `villager` on the client only, never on the wire.

## 3. The wire

| Order | Row | Class | Pull request |
|---|---|---|---|
| 1 | The private inventory: hotbar 6, pack 18, belt 2, `head`, `body`, `weapon` (`round10-plan.md` A12); each `ItemStack` carries its `slot`, and `Inventory.selected` is the held hotbar slot | own client only | A12 (bumps to 7 if first) |
| 2 | The error frame's optional `reason`, `args` and `interaction` (A1) | the refused client only | A1 (protocol, not schema) |
| 3 | `SceneState.propStates`: per scene, `PropState {id, state, untilTick}`, the prop states of `logic-table.md` 3.4 (whole, cut, rubble, searched, open, broken); never who changed one | public to the scene | A10 (bumps to 7 if first) |
| 4 | Two client messages, queued and consumed in `step()` and refused with A1's reasons: `inv.move {from, to}` moves, swaps or merges whole stacks between slots, checking what each slot takes; `inv.select {slot}` picks the held hotbar slot. Nothing public shows the held item | from the own client; the result only in its private view | A12 |
| 5 | Sleeping: `Private.home`, the seat's home scene id, drawn at the deal from the bed interiors of the NPC persona pool and never from the card, so it says nothing about a cover; `Private.asleep`; and, written only while the seat is asleep, `Private.inBed` and `Private.inBedOf`, the counts for `phases.md` 13.4's "2 of 3 in bed" (active seats in bed, active seats in all), zero while awake. No count is public, and no name goes out | own client only | A7a (joins 7) |
| 6 | On the line: `Private.onLine`, true from a daylight death until the morning train returns the seat. `S2C.killed` keeps its shape and carries `roles: {}` while the seat is on the line, so a seat that returns never had the ghost view; an on-line seat gets no scene, no avatars and no ghost channel | own client only | C1 (joins 7) |
| 7 | The crafting grid: `craft.grid {size, cells}`, a client message queued and consumed in `step()` and refused with A1's reasons. The inputs and the product move only in the seat's private inventory (row 1), and the craft has no hold, so nothing public shows that a seat crafted or what | from the own client; the result only in its private view | A13a |
| 8 | The Constables' briefing: one system line per clue (`S2C.chatMsg` on the `system` channel, as the Gazette), `law.briefingAfterS` after the clue is created, the same text to every client. It names the clue's kind, its scene's name and, for a clue anyone may read (GDD 3.4: footprints, thread), the trait the clue shows; never a seat, a handle, a card, a time, a role's reading (the felt's hat, prints) or whether a clue is Forged or Verified. It writes no Notebook entry and changes no clue | public to the match | B2 |

Every other round-10 row is added here by 6Z when a session asks, before it lands. What must never go on the wire:
who is awake by name (A8), who signed a petition beyond the count the screen shows, the Hitman's seat, a hardship's
cause, the `hitman` and `hardship` draws, and anything that tells a cover-wearer from a true wearer of a look
(`CLAUDE.md`). The leak test of round 8 (A170) runs on every new message.

## 4. Paths each session owns

A session edits outside its paths only through a shared file of section 1, or with 6Z's grant in its pull request.

| Session | Owns |
|---|---|
| 10A | `packages/shared/src/protocol/refusals.ts` and the error frame, `apps/client/src/ui/copy/refusals.ts`, `sim/Inventory.ts`, the private view's inventory rows and the `inv.*` messages, `balance.json` `inventory.*` and the per-kind `resources.stackMax` (with its `balance.ts` schema), the optional `equip` field of `packages/content/src/schemas/items.ts` (A12; D6 fills the data), `sim/Sleep.ts`, `sim/Phases.ts` night end, `bed` props, and for A7b one `exhausted` row of `effects.json` with the stamina cap and regeneration in `sim/body` (after A6, built on it) |
| 10F | `packages/content/src/schemas/interactions.ts`, `validate.ts` (interactions), `interactions.json`, `sim/interact/`, `act.hold {action: 'interact'}`, the optional `tool` and `uses` fields of `packages/content/src/schemas/items.ts` (A10; A11 fills the data), then `sim/npc/*` and `routines.json` action chains (D1) |
| 10H | `abilities.json` and `clues.json` clocks, `mobs.json`, `effects.json`, `sim/body/effects.ts` and `damage.ts`, `sim/Death.ts` causes (A6), `items.json` and `recipes.json` tools, `resources.json`, `sim/Resources.ts` (A11), `ui/Inventory.ts`, `ui/Crafting.ts`, `sim/Craft.ts` (A13), the asleep overlay (A8) |
| 10G | refusal sites in `apps/server/src/rooms/**` and `apps/server/src/sim/**` (the reason argument only), `apps/client/src/net/` refusal handler, the toast, the use prompt |
| 10B | `sim/law/`, `sim/Jail.ts`, `sim/Meeting.ts` removal, `laws.json`, `scenes/cj_*.json`, `looks.json` `constable`, the Constables' routine |
| 10C | `sim/Train.ts`, `sim/economy/fare.ts`, `sim/economy/townWork.ts`, `sim/economy/chest.ts`, `sim/vendettas/arrival.ts`, `sim/Deck.ts`, `sim/Win.ts`, `sim/body/fists.ts` (C6), `roles.json` `townWork` |
| 10D | `minigames.json`, `sim/Minigames.ts` (lock-pick, jail), `sim/economy/rent.ts`, `economy.json`, `quests.json`, `lore.json` tips, `sim/townsfolk/*`, the bakery and mill scenes' props |
| 10E | `achievements.json`, `story.json`, the achievement step evaluation, the client's device record, the chapter cards |
| 10X, 10Y | anything, one fix per pull request, after checking no live session owns the path (10X server, rules and content; 10Y client, copy and art) |
| 10Z | `docs/**`, except `docs/round11/**` (round 11's planning, `docs/round11/README.md`) |
| 6Z | `docs/round10/**`, the Round 10 section of `docs/SESSIONS.md`, A223 and A224; `docs/round11/README.md` and the Round 11 section |

Where two sessions' files meet (A6 and C1 in `sim/Death.ts`, A12 and C6 in a robbery, D1 and B1 in the NPC routines),
the later session builds on the merged earlier one and does not reshape it.

## 5. Reserved rows

- **Decisions.** 10A A225, 10F A226, 10H A227, 10G A228, 10B A229, 10C A230, 10D A231, 10E A232, 10X A233, 10Y A234,
  10Z A235. A session's nth row takes its first number plus 20 × (n − 1): 10A's are A225, A245, A265 and A285, 10F's
  A226, A246, A266 and so on. Rows stay in number order in the table.
- **Copy** (`UI.md` 14). 10A 14.43, 10H 14.44, 10G 14.45, 10B 14.46, 10C 14.47, 10D 14.48, 10E 14.49.

## 6. Invariants and checks

- Every refusal carries a reason; the lint test of A3 forbids a literal message at a refusal site.
- Every client action is queued and consumed inside `step()`.
- `pnpm auto` runs clean at 50 matches before a session marks a rules pull request complete (round 8, 8P), and the
  invariants of round 6 and 8 still hold. A new invariant is registered in the pull request that adds the rule.
- Nothing waits on an NPC: a phase, a petition or a sleep check never holds open for an NPC seat (A7, B3).

## 7. Merge order

6Z merges a complete pull request as soon as its dependencies have merged, in the plan's graph (`round10-plan.md`
6), with these firsts:

1. A1, A5, A6, A9 (no dependencies).
2. A2, A3 (one or two parts), A4, A12, A10; then A7 (after A1 and A5).
3. A11, A13, A8; D1 (after A10 and A12). **The playtest gate** follows A13.
4. 10B in order B1 to B8; 10C C1, then C2, C3, C5, then C4; C6 and C7 after B6.
5. 10D after A11 and D1; D7 after A7 and D5; D8 after B5. 10E after B6.
6. 10X and 10Y throughout the end; 10Z last.

When two complete pull requests touch the same lines, the one earlier in this list merges first and the other merges
the base again.
