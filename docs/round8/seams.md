# Round 8 seams: what the sessions share

Every session of round 8 reads this before its first edit, and again after a compaction. An id, a name or a hook
here is fixed: a session that needs another one asks 6Z in its PR description first. Numbers stay in `GDD.md` and
`packages/content/data`.

## 1. The wire: schema version 6

`SCHEMA_VERSION` goes from 5 to 6 once, in 8A's first PR. The later round-8 rows join version 6 without another
bump, as 7D's and 7H's rows both joined version 4. Each row lands in the order below, and a session merges the base
before it adds its own.

| Order | Row | Class | Session |
|---|---|---|---|
| 1 | `Private.body`: `hp` u16, `maxHp` u16, `stamina` u16, `maxStamina` u16, `effects` (array of `EffectState { id u8, untilTick u32, stacks u8 }`) | own client only | 8A |
| 2 | `Private.purse` u32, `Private.bank` u32 | own client only | 8C |
| 3 | `Private.faith` u16 | own client only | 8D |
| 4 | `GameState.hq`: map of station id to tier u8 | public (a building is public) | 8D |

- Nothing else of round 8 goes on the schema:
  - moods, needs and every NPC or townsfolk brain field stay in room memory;
  - the town till, the rumour ledger and the relations matches stay in room memory;
  - a townsfolk figure is an `Avatar` under a handle (A50), with no new field.
- `statusBits` is already u16. Round 8 appends the bits of 3, with no width change.

## 2. Ids

All of these live in `@wdi/shared` (`packages/shared/src/rules/` or `constants`) with the server and client copies
in step, as today. They are **append-only**, and 8A adds every id below in its first PR, so that nobody waits on
another session for a number.

**DeathCause** (protocol): append `creature`, `bled`, `sickened`.

**StatusBit**:

| Bit | Value | Set while | Drawn as |
|---|---|---|---|
| `limp` | 16 | Slowed or Wounded | the `limp` gait |
| `bleeding` | 32 | Bleeding | a drip trail and a red tick on the blood pass |
| `poisoned` | 64 | Poisoned | a green cast |
| `fatigued` | 128 | Fatigued | the `stagger` gait |
| `stunned` | 256 | Stunned | the `stunned` loop, with sparks |
| `dazed` | 512 | Dazed | the `stagger` gait, with wobbling stars |
| `down` | 1024 | knocked out | the `down` loop |

A bit carries only what the drawn figure shows (body.md 6). Weakened, Famished, Indebted and every mood have no bit.

**AnimId** (`constants.ts` and the client's `animIds.ts`): append

| Clip | Value | Clip | Value | Clip | Value | Clip | Value |
|---|---|---|---|---|---|---|---|
| `strike` | 5 | `down` | 8 | `limp` | 11 | `inspect` | 14 |
| `hurt` | 6 | `getup` | 9 | `stagger` | 12 | `threaten` | 15 |
| `knockdown` | 7 | `run` | 10 | `stunned` | 13 | `cower` | 16 |
| `fidget` | 17 | `stomp` | 18 | `eat` | 19 | `rob` | 20 |

- **The server sends** the one-shots (`strike`, `hurt`, `knockdown`, `getup`, `inspect`, `threaten`, `eat`, `rob`)
  and the mood idles (`cower`, `fidget`, `stomp`).
- **The client picks the gait** from speed and `statusBits`:
  - `run` above walking speed;
  - `limp` under `limp`;
  - `stagger` under `fatigued` or `dazed`;
  - the `stunned` and `down` loops under their bits.

  The server never sends a gait id.

**Effect ids** (`EffectId`, u8 on the wire; `effects.json` rows keyed by the string):

| Effect | Id | Effect | Id | Effect | Id |
|---|---|---|---|---|---|
| `slowed` | 1 | `poisoned` | 5 | `famished` | 9 |
| `wounded` | 2 | `fatigued` | 6 | `knockedOut` | 10 |
| `bleeding` | 3 | `stunned` | 7 | `indebted` | 11 (8D sets it; 8A defines it) |
| `weakened` | 4 | `dazed` | 8 | | |

**Look ids**: the ambient townsfolk wear `villager` and the variants 8F adds, each an id beginning `villager`, in
`looks.json` and never in a card's look. A cover can never take a `villager` look.

**Prop ids** (economy statics): the existing scene prefix, then `shop_`, `bank_`, `altar_`, `rack_`, `mailbag_` or
`hq_` (for example `bk.shop_counter`).
- The frame and the scene row land together, in the art owner's PR, so `props.test` never sees a row without a
  frame (6Z, 2026-10-23). 8C and 8D ship the logic and add no scene row.
- Frames: 8J draws `prop_altar`, `prop_mailbag` and `prop_blackMarket`, and 8K draws `prop_counter` and `prop_bank`,
  all in `shared_props`; 8K draws `prop_rack` in `blackpine_props`; 8G draws `prop_hq_<tier>`.
- Rows: 8J adds HollowMere's rows, 8K BlackPine's (in a PR after 8D's), and 8G the `hq_` rows.
- 8J and 8K may move these rows, but never rename or delete them.

**Room dressing** is one prop kind, `dressing`, with the piece named by its id tail (`bl.footlocker_3`; a numbered
tail falls back to its stem, SPRITES 3). Only `dressing` goes in `routines.json` `ignore` (A146). A map's prop
pages are `propAtlases = [props_<map>, bld_<map>, props]` in `mapDefs.ts`: props pack into the buildings page's
spare room, with no new page, and a test pins it (8J, granted for both maps).

**Coins** are not a resource: `validate.ts` takes only material items in `resources.json`, and Scrip is not an
item. There is no `coins` row. 8G draws `node_coins/{ready,spent,break}` from `NODE_IDS = [...RESOURCE_IDS,
'coins']`, and the client finds them through its `node_<resource>` fallback. 8C's `ui/shop/coins.ts` gives a coins
node its hold prompt and its cast time (`economy.coinPickupS`). The break plays when a coins node leaves the feed
only while the viewer stays in the scene, the feed was not reset and the node was in view.

## 3. Protocol

`protocol/index.ts` is locked: each session adds only the rows named here, at the end of their blocks.

| Message | Shape | Session |
|---|---|---|
| `act.ability` | existing; `abilityId: 'strike'` (every card) and `'slingshot'` (Child) | 8A |
| `act.inspect` (new, client to server) | `{ targetId }`, an avatar handle | 8B |
| `inspect.result` (private) | `{ targetId, lookId, signs: copy ids[], health: band, purse: band, light: boolean, tool?: itemId }` | 8B |
| `inspect.noticed` (private, to the inspected) | `{ lookId }`; `inspect.hunch { copyId }` when a relations row has a note | 8B |
| `HoldAction` | append `'shop'` and `'bank'` (8C); `'altar'`, `'mailbag'` and `'rack'` (8D); `'rob'` (8E) | 8C, 8D, 8E |
| `act.buy`, `act.sell` | `{ shopId, itemId, qty }` | 8C |
| `act.bank` | `{ op: 'deposit' \| 'withdraw', amount }` | 8C |
| `shop.open` (private) | `{ shopId, stock: [{ itemId, price }], buys: [{ itemId, price }] }` | 8C |
| `act.donate` | `{ amount }`; `act.faith { kind: 'indulgence' \| 'seal' }`; `act.notice { itemId, op: 'show' \| 'burn' \| 'fence' }`; `act.hq { stationId }`; `act.payRent` | 8D |
| `mug.prompt` (private) | `{ muggerId, endsTick }`; reply `act.mug { choice: 'pay' \| 'fight' \| 'flee' }` | 8E |

The rate limits follow the `act.*` rows of today (5 per second). `PROTOCOL.md` is regenerated by the integration.

## 4. The bus (`sim/events/bus.ts`)

New kinds, emitted by their owner and heard by anyone. Data carries seat ids or figure ids, never a card:

| Kind | Data | Emitted by |
|---|---|---|
| `body.hit` | `{ target, by?, source, dmg, effects }` | 8A |
| `body.ko`, `body.wake` | `{ target, by? }` | 8A |
| `body.effect` | `{ target, effect, on: boolean }` | 8A |
| `inspect` | `{ by, target }` | 8B |
| `purse` | `{ seat, delta, reason: 'stake' \| 'wage' \| 'sale' \| 'buy' \| 'rent' \| 'fine' \| 'theft' \| 'drop' \| 'pickup' \| 'bank' \| 'faith' \| 'hq' \| 'fence' }` | 8C (and 8D, 8E through 8C's `movePurse`) |
| `econ.heistTake` | `{ amount }` | 8C, on the existing `vendetta.heist.*` |
| `econ.coinsTaken` | `{ sceneId, nodeId }`, no seat and no amount; server only, never on the wire (a broadcast would tell clients out of sight that someone picked up coins) | 8C, in `tickCoins` before the node is deleted |
| `eat` | `{ seat }` | 8A (8E's needs hear it) |
| `rent.due`, `rent.paid`, `quota.due`, `quota.met` | `{ seat }` | 8D |
| `notice.made`, `notice.shown`, `notice.burnt`, `notice.fenced`, `notice.gazette` | `{ seat?, noticeId }` | 8D |
| `hq.tier` | `{ stationId, tier, by }` | 8D |
| `mug.start`, `mug.end` | `{ mugger, target, outcome? }` | 8E |
| `rob` | `{ by, target, amount }` | 8E |
| `mood` | `{ figure, mood }` (server only; the admin log may show it, a client never does) | 8E |

**Scrip only moves through one function**, `movePurse(room, from, to, amount, reason)` in `sim/economy/purse.ts`
(8C). It keeps `scripConserved` (economy.md 5) true. 8D and 8E call it and never write a purse.

**Wages hear 7M's task completion event.** 7M names it (A133). 8C listens to it and does not emit it. Until 7M's
event lands, 8C pays on the existing `work` kind.

## 5. The locked one-line hooks

Each line is agreed here. Its owner writes it, and nobody else touches the line.

`sim/Step.ts`:
```
  runNpcs(room);
  runTownsfolk(room);   // round 8, 8E: ambient figures' brains write their inputs (locked call site)
  ...
  runMobs(room);
  runBody(room);        // round 8, 8A: effects, regen, stamina, knockout and wake (locked call site)
  runQuests(room);
  ...
  runMemorial(room);
  runEconomy(room);     // round 8, 8C: purses, shops, bank; 8D's loops inside sim/economy (locked call site)
```

The other hooks:

| Where | The line | Owner |
|---|---|---|
| Match start (`Flow`/lobby start, beside the vendetta draw) | `initBodies(room)` | 8A |
| Match start | `dealPurses(room)` | 8C |
| Match start | `spawnTownsfolk(room)` | 8E |
| `sim/npc/` brain tick | `updateNeeds(room, brain, seat)` (one line) | 8E |
| `sim/npc/` routine weights | `moodWeights(brain)` (one line) | 8E |
| `Kill.ts` | the cause lines for `creature`, `bled` and `sickened` | 8A |
| `sim/mobs/hurt.ts` | moves into `sim/body/` (8A keeps a re-export so 6G's callers compile) | 8A |
| Meeting start | `wakeAll(room)` | 8A |
| Meeting start | `sealShield(room)` and `gazette(room)` | 8D |
| Meeting start | `clearFigureBodies(room)` | 8E |
| The heist's existing bus listener (7H) | `bankTake(room)` | 8C |

Granted by 6Z for 8C (A138, #141):
- `sim/seeds.ts`: the `purse` stream, one line in `StreamName` and its doc bullet;
- `dealPurses(room)` in `rooms/handlers/lobby.ts` `startMatch`, after `dealTasks` and `assignCovers`, rather than
  beside the vendetta draw, because the stake follows the public look;
- `purse: 1` in `sim/auto/Auto.ts` `STREAMS`.

## 6. Who owns which path

Every session also owns its GDD section stub, its DECISIONS row, its UI.md 14 subsection (8A 14.32, 8B 14.33, 8C
14.34, 8D 14.35, 8E 14.36, 8H 14.37; 14.31 is 7G's) and a copy module `ui/copy/<slug>.ts`.

| Session | Owns |
|---|---|
| **8A** | `sim/body/**` (new), `effects.json` and its schema, `balance.json` `body` (replacing `health`), the `items.json` rows for the medkit, bandage, salts, remedy and Wake Loaf, the `abilities.json` rows `strike` and `slingshot`, every id of 2, `Private.body`, the 8A hooks of 5, `view/body/**` (the body HUD's function, which 8H animates), the GDD 3.22 body paragraphs with the 3.6, 3.15 and 3.18 corrections, and `auto` invariant `bodyBounds` |
| **8B** | `sim/inspect/**`, `relations.json` and its schema, the `act.inspect` and `inspect.*` rows, `ui/inspect/**`, the 3.22 inspect paragraph |
| **8C** | `sim/economy/{purse,shops,bank,coins,wages}.ts`, the `runEconomy` line, `economy.json` and its schema (`shops`, `stakes`, `prices`), `balance.json` `economy` (8C's keys), `Private.purse` and `Private.bank`, the `scrip` column of `quests.json`, the coins nodes (no `resources.json` row, see 2), `ui/shop/**`, `view/purse/**`, GDD 3.23 Scrip, the invariant `scripConserved` |
| **8D** | `sim/economy/{rent,quota,faith,rumours,hq}.ts`, `economy.json` `rent`, `quota`, `faith`, `notices` and `hq`, `Private.faith`, `GameState.hq`, the meeting hooks of 5, `ui/econ/**` (the altar, mailbag, notice and HQ panels), GDD 3.23's other paragraphs |
| **8E** | `sim/townsfolk/**`, `sim/npc/needs.ts` and the two hooks, `routines.json` townsfolk rows, `balance.json` `moods` and `townsfolk`, the `scuffle` row of `clues.json`, the `townsfolk` stream in `seeds.ts` (one line), `ui/mug/**`, GDD 3.24, the invariant `figureNotSeat` |
| **8F** | `looks.json` (clips, villager variants, proportions), `tools/blender/{build_looks,look_parts,looks_spec,build_villager,build_rig,rig_common}.py`, the character renders of both styles under `assets/`, `view/PlayerView.ts` and `view/animIds.ts`, `metrics.json` `iso.viewTilesHigh` and `iso.figureScale` (new), the `style.json` figure wording, SPRITES 1, 3 and 10.9 (art.md 2) |
| **8G** | `tools/sprites/m5b-mobs.ts`, `mobs.json` (`hp` and clips), node break art and `view/NodeView.ts`, `tools/blender/build_vfx.py` and `view/vfx/**`, the door, ladder, hatch and Train animations (`view/transport/**`), the HQ tier props, and the sound picks with their CREDITS and MANIFEST rows |
| **8H** | `ui/theme/tokens.css`, the "Round 8 (8H)" block of `ui/theme/components.css`, `view/Transition.ts`, the motion of every panel the other sessions build (by class, never by editing their logic), UI.md 9 and 12 |
| **8I** | the material library `tools/blender/materials/**` and its cache line in `.gitignore` (art.md 5), the shared tiles of `build_tiles.py`, the `hd` art style (art.md 3): `style.json` `artStyles` (`hd` leaves `reserved`), `assets/hd/**`, the HD settings in `tools/blender/{rig_common,batch_render,static_common}.py` (an `--style hd` switch beside today's two), `tools/sprites/test/budgets.ts` HD rows, the device gate in `ui/artStyle/**`, ASSETS 6.4, 6.9 and 6.11 HD rows, the GDD 3.13 art-style line |
| **8J** | HollowMere's scenes (every `scenes/*.json` not prefixed `bp_`: `props`, `lights`, `material`, the decor of `grid`, `notes`), their `.nav.json` regenerated with the tool, `tools/blender/env/hollowmere_props.py`, HollowMere's buildings and ground in `build_buildings.py` and `build_ground.py` (its own functions), `maps/hollowmere.json` static rows (art.md 4) |
| **8K** | the same for BlackPine: `scenes/bp_*.json`, `env/blackpine_props.py`, its building and ground functions, `maps/blackpine.json` static rows |

8L (anti-cheat), 8M (rules) and 8N (icons) joined with the teardown addendum: their paths, rows and seams are in
`teardown.md` 6.

- **`env/shared_props.py`** is append-only for 8J and 8K. Whoever merges second merges the base.
- **Scene files.** No session renames or deletes a portal, spawn, clue, task node or economy prop id. A portal or
  spawn moves only if its scene's walk test passes, so that every portal, spawn, task node and station stays
  reachable (art.md 4).

**Locked for every session but 6Z**:
- `packages/shared/src/schema/index.ts` and `protocol/index.ts` (only the rows of 1 and 3, in order);
- `sim/{Step,Deck,Flow,Quests,Npc,seeds,Kill}.ts`, `sim/npc/**` and `sim/mobs/**` (only the lines of 5);
- `ui/theme/**` (8H);
- `.claude/settings.json` and `eslint.config.js`.

**Tests.** A round-8 session never edits an `apps/server/test/*.test.ts` file that exists today without 6Z's grant
in its PR. New test files are free. The one known case is the old two-hit-point tests in `mobs*.test.ts`: 8A lists
the lines it must change in its PR and waits for the grant.

Granted by 6Z for 8C (A138, #141): `sim/economy/run.ts` is 8C's, the home of `runEconomy`, and 8D adds one line
there, `runCivic(room)`, at the end; in `apps/server/test/invariants.test.ts`, the one line `'scripConserved',` after `'killClues',`.

## 7. Merge order

1. **6Z first** (this contract).
2. **8A's first PR**: the ids, schema version 6, and the `Private.body` row. Everyone else may build on the base
   until then, but merges after it.
3. **In parallel, as each turns green:**
   - 8B, 8C, 8E, 8F, 8G, 8I, 8J, 8K;
   - 8D after 8C's purse PR;
   - 8E's mugging PR after 8C's purse PR;
   - 8H's HUD PR after 8A's body HUD and 8C's purse HUD;
   - 8G's tier props after 8D's HQ PR.
4. **8I's last pass** re-renders HD after 8F, 8J and 8K's art has merged.
5. **7M's PRs** merge whenever they are green; 8C merges the base after 7M's task deal.
6. **The integration (8P) last**: auto 50 clean with every invariant, the opt-in e2e suites, both screenshot sets,
   `PROTOCOL.md`, and DECISIONS A147.
