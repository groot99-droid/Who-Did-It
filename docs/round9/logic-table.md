# Round 9 (9B): the logic table

Status: design only, for owner review. Nothing here is built, no game file changes, and `GDD.md` is untouched. The brief (`owner-brief.md`, item 9 and the follow-up on the rogue, item 10) asks for "a logic table to capture all of this and make the game make sense at a logic based level": every placed thing has a purpose and a tool or action that works on it, an axe cuts the lumber piles, a pickaxe breaks the boulders, chests are placed by rules, and a rogue can gather food, make his own lock picks and skip the tax. This document is that table: what it is (sections 2 to 4), what it does to the 605 props (5), the chests (6), the resource nodes (7), the new gear (8), how it plugs into the tables that exist (9), and the table itself (10). Numbers marked _proposed_ move into `packages/content/data` when the owner approves; this document does not own any number. Refusal wording and the reason list are in `failures.md`.

## 1. What is wrong today

All counts come from `docs/round9/tools/prop-census.mjs`, which only reads `packages/content/data/scenes/*.json`.

- **605 props, 516 of them (85%) `dressing` or `decor`.** The sim or the economy reads 26 prop kinds (68 props); the other 537 do nothing but draw. Of those, 14 more are placed for the wake scene and no server code reads them (`plate` 10, `deadLoaf` 3, `wakeTable` 1).
- **Chests are decoration.** The one working chest kind (`kitChest`, 2 props) is never read: `apps/server/src/sim/MapSites.ts:95` says "No server code reads it yet". The 196 other things a player would call a container (barrels, crates, cabinets, sacks) are `dressing` or `decor`, so they cannot be opened.
- **Nodes and props are separate.** The 65 resource `nodes` (timber 16, stone 13, tin ore 15, mushroom 8, resin 6, herb 7) are not props. Only 8 of the 65 have a matching prop within 2.5 tiles (a stump, log, firewood or woodpile by a timber node; a boulder, rock pile, ore pile or rubble by a stone node; an ore or rock pile by a tin node; a mushroom patch by a mushroom node; a fern by a herb node; a stump or log by a resin node), so a node is usually a sprite in an empty clearing while the lumber, rocks and ore piles that look like the source stand a few tiles away and cannot be used.
- **One tool check exists.** Tin Ore needs a Spade (`packages/content/data/resources.json` `tool`, enforced at `apps/server/src/sim/Resources.ts:158`). There is no axe, no pickaxe and no armour. Damage comes only from `balance.body.damage` (fists 8, mugging 8, slingshot 4) and the mobs' own `dmg` (wolf 25, boar 18, bat 6, rat 5).
- **Locks do nothing.** No portal in `data/scenes/*.json` carries a `lock`, and `apps/server/src/sim/Portals.ts:180-183` refuses every keyed door with "locked" ("Keys are inventory items and arrive with M5"). The Skeleton Key, Master Keyring, Lockpicks and Crowbar are in `items.json` and the GDD (3.5, 3.7 gives their noise radii), but the server has no handler for them: a search of `apps/server/src` finds no code for 14 of the 26 `use` ids in `items.json` (`chalk`, `crowbar`, `dustCompare`, `lockUnlock`, `lockpick`, `plantClue`, `rag`, `rope`, `seance`, `shoot`, `skeletonKey`, `smoke`, `snare`, `wash`). The one locked thing placed in a scene, `mu.study_door`, has no way to open.
- **The dispatch is hard-coded.** `apps/server/src/sim/Hold.ts:57-90` is a chain of `if (action === 'gather') ... else if (action === 'task') ...` that ends in `reject('cannot do that')`; `Actions.ts:60-78` does the same for abilities. Each new verb is a new branch in two files.
- **`routines.json` `holds` is empty.** The schema field exists (`packages/content/src/schemas/routines.ts:53`) and the NPC brain reads it (`apps/server/src/sim/npc/routine.ts:754`), but the data is `{}`, so no NPC ever starts a hold. (The round-9 plan calls it "unused"; the code path is live, the data is empty.)

The owner's complaint that "so many easy to find items are trapped behind tool walls" is the opposite of the first list: the walls are in the wrong places. Tin Ore is walled (one spade, found nowhere) while a pile of timber is simply art.

## 2. The idea in one paragraph

An **interaction** is a verb that a **tool** (or bare hands) performs on a **target class**, with a **result** (items dropped, a state change, a sound, a noise) and a **failure line** per reason. The table is one data file, `packages/content/data/interactions.json`. The server resolves a hold on any target through the table instead of an `if` chain; the client reads the same file to show the verb and grey it when the tool is missing; NPC routines read it to know what each townsperson can do; and the content validator checks that every prop kind, tool and resource appears where it should. A tool is an item with **capability tags** (`cut`, `break`, `dig`, `pick`, `pry`) and a tier. A target is a **class** (lumber, rock, lock, nailed crate), matched by prop kind and id-stem, not by one id, so new scenes get behaviour for free.

Three rules keep it sane:

1. **A tool makes it faster, bigger or possible. Bare hands always get a little where a thing is loose.** A woodpile gives a few split logs by hand; an axe gives more, faster. A boulder cannot be broken by hand. A lock cannot be picked by hand. That is the line between a speed-up and a wall, and the table states which each interaction is.
2. **Every interaction has a failure line per reason in the world's voice** (`failures.md` section 5), so "you need a pickaxe" is part of the data, not a code path.
3. **Nothing in the table is secret.** A prop's state (chopped, broken, looted) is public to the scene. What a container holds is private to whoever opens it, rolled on a stream of its own (section 6.4).

## 3. The schema: `packages/content/data/interactions.json`

Proposed; the file is not created in this round. Style follows the other content files (`gddRef`, id-keyed records, zod `strictObject`).

### 3.1 The file

```jsonc
{
  "gddRef": "3.14",

  // Capability vocabulary. An item gets tags in items.json `tool`; an interaction asks for a tag and a tier.
  "tags": {
    "cut":   { "name": "Cutting",      "tiers": 2 },
    "break": { "name": "Breaking",     "tiers": 2 },
    "dig":   { "name": "Digging",      "tiers": 1 },
    "pick":  { "name": "Lock picking", "tiers": 3 },
    "pry":   { "name": "Prying",       "tiers": 2 },
    "skin":  { "name": "Skinning",     "tiers": 1 }
  },

  // Target classes: what a placed thing IS. Matched by prop kind + id stem, resource id, portal lock, or a tag on a scene.
  "classes": {
    "lumber":     { "name": "Lumber",        "match": { "stems": ["woodpile", "firewood", "log", "fallen_log", "stump", "timber_set", "log_basket"] } },
    "boulder":    { "name": "Boulder",       "match": { "stems": ["boulder"] } },
    "rockPile":   { "name": "Rock pile",     "match": { "stems": ["rock_pile", "ore_pile", "rubble"] } },
    "crateNailed":{ "name": "Nailed crate",  "match": { "stems": ["crates", "crate", "tin_crate", "bottle_crate"] } },
    "caskSack":   { "name": "Cask or sack",  "match": { "stems": ["barrel", "wine_cask", "sacks", "flour_sacks", "hay_bale", "milk_churn"] } },
    "chestLocked":{ "name": "Locked chest",  "match": { "stems": ["footlocker", "blanket_chest", "safe", "tin_cabinet", "tin_cabinet_b"], "kinds": ["kitChest", "keyCache"] } },
    "lockedDoor": { "name": "Locked door",   "match": { "portalLock": true, "kinds": ["lockedDoor"] } },
    "node:timber":{ "name": "Timber",        "match": { "resource": "timber" } }
  },

  // One entry per verb on a class. `modes` is ordered best first: the first mode whose tool the seat holds runs.
  "interactions": {
    "chop_lumber": {
      "verb": "chop", "label": "Chop", "target": "lumber", "handler": "stock", "status": "live",
      "phases": ["day", "night"], "ownership": "wild", "ships": "V1",
      "modes": [
        { "tool": { "tag": "cut", "tier": 1 }, "holdS": 4, "drops": [{ "item": "timber", "qty": [2, 3] }], "wear": 1, "noise": "chop" },
        { "tool": null,                        "holdS": 8, "drops": [{ "item": "timber", "qty": [1, 1] }], "wear": 0, "noise": null, "only": ["firewood", "log_basket", "woodpile"] }
      ],
      "after": { "state": "cut", "respawnS": 300 },
      "fail": {
        "NEED_TOOL": "You tug at the timber. It will not come apart by hand. An axe would.",
        "NOTHING_THERE": "Somebody has already taken what there was."
      },
      "hint": "Axes hang in the lumber camp and sell at the general store."
    },

    "break_boulder": {
      "verb": "break", "label": "Break", "target": "boulder", "handler": "stock", "status": "live",
      "phases": ["day", "night"], "ownership": "wild", "ships": "V1",
      "modes": [
        { "tool": { "tag": "break", "tier": 1 }, "holdS": 6, "drops": [{ "item": "stone", "qty": [2, 3] }, { "item": "tinOre", "qty": [1, 1], "chance": 0.25 }], "wear": 2, "noise": "smash" }
      ],
      "after": { "state": "rubble", "respawnS": null },
      "fail": { "NEED_TOOL": "The boulder does not care. You would want a pickaxe." }
    },

    "pick_lock": {
      "verb": "pick", "label": "Pick the lock", "target": "lockedDoor", "handler": "lock", "status": "nfy",
      "feature": "lock picking", "phases": ["day", "night"], "ownership": "owned", "ships": "V1.5",
      "modes": [
        { "tool": { "tag": "pick", "tier": 1 }, "holdS": 5, "consumes": [{ "item": "lockpicks", "qty": 1 }], "noise": "lockpick", "leaves": "print", "unlocks": true },
        { "tool": { "tag": "pry", "tier": 1 },  "holdS": 3, "wear": 1, "noise": "crowbar", "unlocks": "broken" }
      ],
      "fail": {
        "NEED_TOOL": "Failed to pick the lock. Looks like you might need a lock pick.",
        "TIER": "The pick bends. This lock wants a finer one."
      },
      "crime": "trespass"
    },

    "search_cask": {
      "verb": "search", "label": "Look inside", "target": "caskSack", "handler": "search", "status": "live",
      "phases": ["day", "night"], "ownership": "public", "ships": "V1",
      "modes": [{ "tool": null, "holdS": 2, "loot": "stores" }],
      "after": { "state": "searched", "respawnS": null },
      "fail": { "NOTHING_THERE": "Only dregs and cobwebs." }
    }
  },

  // What a container holds. Weights are relative; `empty` is a weight too. Rolled once per container at Start.
  "lootTables": {
    "stores":   { "name": "Dry stores",   "rolls": [1, 2], "entries": [{ "item": null, "w": 6 }, { "item": "candle", "w": 2 }, { "item": "rope", "w": 1 }, { "item": "flour", "w": 2, "qty": [1, 2] }] },
    "toolshed": { "name": "Tool shed",    "rolls": [1, 2], "entries": [{ "item": "spade", "w": 2 }, { "item": "planks", "w": 3, "qty": [1, 2] }, { "item": "axe", "w": 1 }, { "item": "rope", "w": 2 }, { "item": null, "w": 2 }] }
  },

  // Where containers go and how many (section 6). Per-scene entries override the class defaults.
  "placement": {
    "defaults": { "activeFrac": 0.3, "minPerScene": 1, "minSpacingTiles": 6, "keepClearTiles": 3 },
    "scenes": { "manor_hall": { "theme": ["manor", "valuables"], "lockedMax": 2 } }
  }
}
```

### 3.2 The zod schema (`packages/content/src/schemas/interactions.ts`, proposed)

```ts
import { z } from 'zod';
import { GddRef, Id, PropKind } from './common.js';
import { NoiseKey } from './balance.js';

const Tag = z.enum(['cut', 'break', 'dig', 'pick', 'pry', 'skin']); // grows by append only, like SCENE_IDS
const Qty = z.tuple([z.number().int().positive(), z.number().int().positive()]);

export const Drop = z.strictObject({ item: Id, qty: Qty, chance: z.number().gt(0).max(1).optional() });

export const Mode = z.strictObject({
  /** Capability a held item must carry; null = bare hands. */
  tool: z.strictObject({ tag: Tag, tier: z.number().int().min(1).max(3) }).nullable(),
  /** Stems this mode applies to when the class has several (the bare-hands woodpile). Default: all. */
  only: z.array(z.string()).optional(),
  holdS: z.number().positive(),
  drops: z.array(Drop).optional(),
  loot: Id.optional(), // key of lootTables
  consumes: z.array(z.strictObject({ item: Id, qty: z.number().int().positive() })).optional(),
  /** Uses taken from the tool's durability; 0 = none. */
  wear: z.number().int().min(0).default(0),
  noise: NoiseKey.nullable().default(null),
  leaves: z.enum(['print']).optional(),
  unlocks: z.union([z.literal(true), z.literal('broken')]).optional(),
});

export const Interaction = z.strictObject({
  verb: z.string().regex(/^[a-z]+$/),
  label: z.string().min(1), // the prompt, "Chop"
  target: Id, // key of classes
  /** Which server routine runs the hold: the new generic ones, or a legacy action kept as an alias. */
  handler: z.enum(['stock', 'search', 'lock', 'craft', 'gather', 'task', 'shop', 'bank', 'civic', 'collect']),
  status: z.enum(['live', 'nfy']), // nfy => the server answers NFY with `feature`
  feature: z.string().optional(),
  phases: z.array(z.enum(['day', 'night'])).min(1),
  modes: z.array(Mode).min(1),
  after: z.strictObject({ state: Id, respawnS: z.number().positive().nullable() }).optional(),
  ownership: z.enum(['wild', 'public', 'owned']),
  /** Crime a witness can report when `ownership` is 'owned' (3.23 notices); null = none. */
  crime: z.enum(['theft', 'trespass', 'vandalism']).nullable().optional(),
  /** Per reason (failures.md 4) lines in the world's voice; missing reasons use the generic line. */
  fail: z.record(z.string(), z.string()),
  hint: z.string().optional(),
  ships: z.enum(['V1', 'V1.5', 'V2']),
});
```

Validation rules to add to `validate.ts`:

- every `classes[].match.stems` stem exists in some scene; every `kinds` kind exists in `routines.json` or is listed in `ignore`;
- every prop is matched by at most one class (so a hold on it has one answer), and every `container` or `interact` stem of section 5 is matched by one;
- every tool tag named in `modes` is carried by at least one item in `items.json`, and that item is obtainable (a shop sells it, a recipe makes it or a loot table drops it) or the interaction is `nfy`;
- every `drops` item and `loot` table exists; every `fail` key is a `RefusalReason`;
- a `NEED_TOOL` reachable from the interaction has a `fail` line.

### 3.3 Additions to `items.json`

```jsonc
"axe": {
  "id": "axe", "name": "Axe", "kind": "tool", "roleBound": false, "onDeath": "drops",
  "tool": { "cut": 1 },                 // capability tags and tiers (new)
  "uses": 20,                           // durability; null = lasts (new)
  "weapon": { "dmg": 14, "effects": { "bleeding": 0.2 }, "kills": false, "attackS": 1.4, "rangeTiles": 1, "noise": "chop", "creatureMult": 1.0 },
  "tooltip": "Cuts lumber. Heavy in a fight.", "ships": "V1", "gddRef": "3.14"
}
```

`tool`, `uses`, `weapon` and `armor` (section 8) are optional blocks on an item; an item with none of them behaves as today. Item `use` stays the ability id for consumables (Bandage, Medkit, Salts, Wake Loaf, Lantern).

### 3.4 State on the wire

A prop's state (`whole`, `cut`, `rubble`, `searched`, `open`, `broken`) is one byte per changed prop in the scene's synced state (a `PropState` map: prop id, state, `untilTick` for a respawn). It is public: everybody in the scene sees the stump, the rubble and the open lid, which is the point (a chopped pile tells the town someone was here). It costs nothing for a prop that never changes. The sprite packer gets one frame suffix per state (`_cut`, `_rubble`, `_open`, `_broken`) for the stems that change; a stem with no art for a state falls back to its whole frame and the server still tracks it.

## 4. Replacing the hard-coded dispatch

`Hold.ts:57-90` today routes `act.hold {action, targetId, on}` by string:

| `action` today | Where it goes | Becomes `handler` |
| --- | --- | --- |
| `gather`, `craft` | `handleGather`, `handleCraft` (`Resources.ts`, `Craft.ts`) | `gather` (nodes), `craft` (stations) |
| `task` | `handleTaskHold` (mini-games, 3.16) | `task` |
| `shop`, `bank` | `economy/shops.ts`, `economy/bank.ts` | `shop`, `bank` |
| civic holds (donate, faith, rent, HQ, notice) | `handleCivicHold` | `civic` |
| `collect` | clue collection, `holdProblem` | `collect` |
| anything else | `reject('cannot do that')` | `NFY` (failures.md) |

The proposal adds one generic action, `act.hold {action: 'interact', targetId, on}`, and a resolver `sim/interact/resolve.ts`:

1. Find the target (prop, node or portal) by id in the seat's scene; read its class from `interactions.json` (cached per scene at load).
2. List the interactions on that class. If there is one, use it; if several (a chest that can be picked or pried), the client sends `via` (an item id) to choose, else the server takes the first whose first mode the seat can run.
3. Walk the interaction's `modes` best first; the first whose tool the seat holds (tag and tier) runs. If none runs, refuse `NEED_TOOL` with the lowest-tier tool of the cheapest mode (`failures.md` rule 2).
4. Re-validate every tick as the current holds do (`runHolds`): moving, a phase change, a state another seat changed, a full pack cancel it. At the end, apply `drops`, wear the tool, set the prop state and `respawnS`, emit `noise`, and write the usual alibi or clue effects.
5. Legacy actions (`gather`, `task`, `shop`, `collect`...) stay for as long as the client uses them; the client moves verb by verb to `interact`, and the legacy branch of a verb is deleted when its last caller moves. The `handler` field names the routine, so `shop` or `task` interactions in the table are only a registry entry that routes to the existing code; nothing about shops or mini-games changes.

NPCs reach the same resolver. The brain calls `handleHold(room, id, {action, targetId, on: true})` (`npc/routine.ts:758`), so any prop an NPC can use is one the table already answers for. Section 9.1 says how `routines.json` lists them.

## 5. Audit of all 605 props

Produced by `node docs/round9/tools/prop-census.mjs --audit`, which maps every kind or id-stem to one of four decisions and fails if a stem is unmapped or the total is not 605. The mapping lives in the script, so the audit is repeatable and a new prop in a scene file is caught.

| Decision | Props | What it means |
| --- | ---: | --- |
| `live` | 68 | The sim or the economy already reads the kind (stations, shops, altars, the bell, lanterns, HQ stations, task sources). The table only formalises them. |
| `interact` | 137 | A tool, a station or a bare-hands verb does something to it. |
| `container` | 196 | It can be searched, pried or picked; contents come from a loot table. A container is _eligible_; section 6 says how many are _active_. |
| `keep` | 204 | Decoration on purpose. |
| total | 605 | The four rows add to 605. |

Reconciling with the 516: 89 props are neither `dressing` nor `decor`. 68 of them are `live`, and 21 are special kinds that the audit moves into `interact` (17: `plate` 10, `deadLoaf` 3, `gasPocket` 2, `wakeTable` 1, `lockedDoor` 1) or `container` (4: `kitChest` 2, `keyCache` 2). So the 516 split as `interact` 120, `container` 192 and `keep` 204.

### 5.1 Interact: 137

| Group | Stems (count) | n | Hand | Tool → result |
| --- | --- | ---: | --- | --- |
| Lumber | stump 15, timber_set 8, log 6, firewood 5, log_basket 5, fallen_log 3, woodpile 3, planks 3 | 48 | firewood, log_basket, woodpile, planks: take 1 (slow) | **Axe** cuts: woodpile 3 timber, log and fallen_log 3, stump 1 timber and a little resin, timber_set 2 with a rockfall risk in a cave. `planks`: take 1 Planks by hand (owned: theft in a shop or yard) |
| Stone | boulder 10, rock_pile 4, ore_pile 4, rubble 2 | 20 | rock_pile, ore_pile: take 1 (slow) | **Pickaxe** breaks a boulder into 2 to 3 stone and sometimes tin ore; rock_pile 2 stone; ore_pile 2 tin ore; rubble clears to uncover a small cache |
| Forage and water | mushrooms 10, water_bucket 6, bucket 4, snare 3 | 23 | mushrooms: forage 1; water_bucket: fill a Bucket (needs one); snare: disarm | **Skinning knife** skins a creature corpse for hide and game (8.4). Disarmed snare gives a Snare |
| Stations | saw_horse 2, workbench 2, grindstone 2, anvil 1, forge 1, kiln 2, mortar_table 1, still 1, shaping_table 3, dough_trough 1, peel_rack 2, couche_rack 2, drying_frame 3 | 23 | Craft a recipe (9.4) | Saw horse: Timber to Planks. Grindstone restores a tool's durability. Kiln: Tin Ore to Tin Ingot. Forge and anvil: tier-2 tools and armour. Mortar table and still: Salts, Bandage. Bakery stations: dough then loaf. Drying frame: herbs keep longer |
| Haul | wheelbarrow 6 | 6 | Load and push: carry capacity for materials (P2) | none |
| Wake scene and hazards | plate 10, deadLoaf 3, wakeTable 1, gasPocket 2, lockedDoor 1 | 17 | plate and loaf: serve or eat (events, 9C); gasPocket: the lantern flame test; lockedDoor | lockedDoor: pick (Lockpicks) or pry (Crowbar) or the Study Key |

### 5.2 Container: 196 eligible

| Group | Stems (count) | n | Locked? |
| --- | --- | ---: | --- |
| Dry stores | barrel 25, flour_sacks 15, crates 9, bottle_crate 9, tin_crate 9, hay_bale 7, milk_churn 6, wine_cask 5, sacks 3, rope_coil 3, crate 2, powder_kegs 1, keg_rack 1 | 95 | no; crates and tin crates are nailed (pry) |
| Chests and cabinets | tin_cabinet 9, footlocker 4, blanket_chest 3, kitChest 2, keyCache 2, safe 2, tin_cabinet_b 1, alms_box 1 | 24 | yes: pick, pry or key |
| Furniture | bookcase 9, bookcase_b 3, cupboard 1, sideboard 2, nightstand 2, linen_press 2, dressing_table 2, apoth_drawers 2 | 23 | no; bookcases hold lore |
| Shop displays | cooling_rack 5, bread_basket 4, herb_rack 4, bread_case 3, bread_shelf 3, bread_shelf_b 3, cold_shelf 3, jar_shelf 3, jar_shelf_b 3, bottle_shelf 2, bottle_shelf_b 2, counter_case 2, counter_case_b 2, store_shelf 2, store_shelf_b 2, leech_jar 2 | 45 | owned: taking is theft |
| Tool caches | axe_block 4, tool_rack 2 | 6 | no; one tool each, restocked at the start of a match only |
| Remains | bones 1, ossuary 2 | 3 | no; lore |

### 5.3 Keep: 204

Kept on purpose, each for a reason the table can state: **light** (lamp_table 6, lamp_post 4, wall_bulb 5, lantern_hook 3, lantern_pole 3, candle_stand 2, fireplace_e 2, miners_lamp, wall_lamp, votive_rack, inglenook_e), **cover and sight-lines** (pew 6, settle 7, rug 5, bar_counter 4, tavern tables, armchair 4, pit_prop 4), **landscape** (fern 16, leaf_litter 9, cobweb 4, sawdust 2, scarecrow 2, signpost 6), **a room's identity** (windows, stained glass, portraits, piano, pulpit, font) and **machinery** of the BlackPine works (gearing, flume, head_saw, pump_beam, compressor, clamp, ore_cart). Of these, 23 are lore hooks and get a one-line `examine` in `living-world.md` (9C): vane_portrait 2, portrait, memorial, hymn_board, tide_chart, ship_wheel, show_globe, photos 2, tally_board, map_table, chalkboard 4, telephone, ledger_desk, writing_desk, hanging_oak, drowned_lantern, birdcage, piano. `pit_prop` could become a cave-in hazard later.

The rule for new art: **dressing is allowed where it does one of those jobs, and a scene's dressing is capped at the number of its interact and container props**. Today the cap would not bind (204 against 333); a future map is held to it.

### 5.4 Live: 68

`hq` 12, `counter` 8, `lanternPost` 8, `taskSource` 6, `basin` 4, `altar` 3, and the singles (bell, lamp, noticeBoard, oven, pump, brickOven, coldShelves, dartboard, doughMixer, fence, flourBin, goat, ledger, mailbag, proofingCabinet, rack, window, bank, blackMarket, teachingClue). The table adds nothing to their behaviour; it registers each as a class so the validator can say that every prop kind is accounted for.

## 6. Chests: placed by rules

### 6.1 What a chest is

Four kinds of container, by how they open:

| Kind | Opens with | Noise | Examples |
| --- | --- | --- | --- |
| Open | bare hands (search) | none | barrel, sack, shelf, drawer |
| Nailed | pry (Crowbar, or an axe at tier 1 for a crate) | `crowbar` (10) | crates, tin crates |
| Locked | pick (Lockpicks), key, or pry | `lockpick` (5) or `skeletonKey` (5) | footlocker, blanket chest, safe, tin cabinet, `kitChest` |
| Strongbox | the right key only | none | the manor strongbox (`items.json` `strongbox`, GDD 3.20) |

### 6.2 Where they may appear, and how many

Not every eligible container holds anything. At Start, from the `loot` stream (6.4), the server **activates** a fraction of each scene's eligible containers; an inactive one shows no prompt and is furniture for that match, exactly as the unlucky half of a resource pool is not sent (GDD 3.14). The rules:

- **Count.** Active containers per scene = one third of the eligible ones, at least one, none in a scene with none (`activeFrac` 0.3, _proposed_). The script's `--areas` report gives 62 active across 29 scenes from 196 eligible: apoth_loft 2, apoth_shop 5, bakery 5, barn 3, bp_camp 2, bp_deep 1, bp_lodge 2, bp_mill 1, bp_mine 1, bp_office 2, bp_smithy 1, bp_woods 1, cave_gallery 1, cellar 4, chapel 1, crumb_cold 3, crumb_mixing 1, crumb_oven 2, crumb_proofing 1, forest_deep 1, manor_hall 7, manor_upper 2, overworld 5, tavern_back 3, tavern_bar 3, widow_bedroom 1, widow_parlour 1, and none in cave_entry or forest.
- **New slots where nothing is placed.** `forest` and `cave_entry` have no container at all, and `forest_deep` and `cave_gallery` one each. Round 10 adds 6 `containerSlots` (new ids under each scene's prefix; no id is renamed): forest 2 (a hollow log, a poacher's cache), forest_deep 2 (an old camp, a trapper's box), cave_entry 1 (a miner's tin box), cave_gallery 1 (an abandoned cart). The forests and caves are where the best unguarded loot sits, with the wolves and the dark as the toll.
- **Chest-grade (locked) per scene.** At most 1 in an interior, at most 2 in an exterior of 600 or more floor tiles; the hub (`overworld`) has the town chest, the camp (`bp_camp`) its own. The manor has 2 (the safe and the tin cabinets), the lodge 1 (footlockers), the office 1 (safe).
- **Spacing and clearance.** No active container within 3 tiles of a portal, a spawn or a hiding spot (`keepClearTiles`), at least 6 tiles between two active chest-grade ones (`minSpacingTiles`), and always on a tile the nav grid reaches (`*.nav.json`), so no chest is unreachable.
- **Theme.** A scene has a theme (6.3), and a container draws only from tables of its theme, so a bakery's sacks hold flour and a mine's crate holds tin ore, never the other way round.
- **Danger buys reward.** The loot tier of a container rises with the number of portal hops from the hub (0 to 1: tier 1, 2 to 3: tier 2, 4 or more or a dark cave: tier 3). A locked chest is always at least tier 2.

### 6.3 Loot tables

Tables are keyed by theme, each a list of weighted items (`lootTables` in the file). Proposed set; weights and quantities are _proposed_ and live in data:

| Table | Theme | Typical contents | Tier |
| --- | --- | --- | --- |
| `stores` | any interior | candle, rope, flour, nothing (most) | 1 |
| `pantry` | bakery, tavern, Crumb's Ovens | flour, Wake Loaf, nothing | 1 |
| `apothecary` | apoth_shop, apoth_loft | herbs, Bandage, Salts, rarely a Medkit | 1 to 2 |
| `toolshed` | barn, camp, mill | spade, planks, rope, rarely an axe | 1 to 2 |
| `mineStash` | mine, deep, cave | tin ore, stone, rarely lockpicks or a pickaxe | 2 to 3 |
| `domestic` | widow rooms, manor_upper | candle, letter, chalk, small Scrip | 1 to 2 |
| `valuables` | manor_hall, offices | larger Scrip, Heirloom, pocket watch, Indulgence | 2 to 3 |
| `armoury` | bp_lodge, bp_smithy | club, hatchet, quilted coat, rarely tin mail | 2 to 3 |
| `lore` | bookcases, ossuary, bones | a lore fragment (9C) or nothing | 1 to 3 |
| `forager` | forest, forest_deep | herbs, mushrooms, resin, a snare | 1 to 2 |

An `empty` entry is a normal weight, so the player learns a barrel is usually barrels; the failure line for an empty search is flavour ("Only dregs and cobwebs."), not a refusal.

### 6.4 Randomness and secrecy

- Contents are rolled **once per container at Start** on a new stream `loot` (`sim/seeds.ts`), independent of every secret stream (CLAUDE.md: nothing secret shares a stream with anything public) and of the order players act. Two players opening the same chest an hour apart find the same thing; the first takes it.
- Which containers are active and what they hold is **server-only** until opened. The wire carries only each prop's public state (searched, open, broken); an opened container tells the scene it was opened and by nobody in particular, unless a witness saw (the Notice system of 3.23).
- A looted container does not refill. Stock containers (a tool cache) restock only at Start.
- The hub `kitChest` stops being a special prop. GDD 3.5 says an ejected Village role's kit goes to a chest at the square; with voting gone (`phases.md`) that sentence has no trigger, so the hub chest becomes the town's **lost-and-found**: kit confiscated by an arrest goes into it and anyone can take it (the evidence route, `world-mode.md`). Open question 3.

## 7. Nodes and props

The 65 nodes keep their pools and respawns (`NodeSpot.pool`, `poolActiveFrac`). What changes is that a node **is** a prop in the player's eyes.

- **Anchor.** `NodeSpot` gets an optional `prop` (a prop id). A node with an anchor draws the prop's `whole` or `cut` frame in place of the floating `node_*` sprite and is gathered by the interaction of the prop's class. `prop-census.mjs --nodes` puts only 8 of the 65 within 2.5 tiles of a matching prop, so round 10 either moves a node to its nearest stump, ore pile or mushroom patch or adds an anchor prop beside it (a stump for a timber node). The `--nodes` report lists each node and its nearest prop.
- **One engine.** A resource gather is an interaction on class `node:<resource>`: `handler: "gather"` (the current `handleGather`) with `modes` that carry the tool. Tin Ore keeps a hard tool (a `dig` mode, the Spade); a pickaxe also qualifies at tier 1 (_proposed_). Timber and stone get a bare mode, slow and small, and a tool mode that is faster and bigger, so the axe and the pickaxe speed supply up rather than gate it.
- **Stock props are finite, nodes are renewable.** A woodpile gives its timber once and returns after `respawnS`; a node follows `resources.json` `respawnS`. Both are the same code, and `after.respawnS: null` means never within a match.
- **Supply check.** Today 16 timber nodes, half active (8), each 1 timber per 3 s hold and 90 s respawn. A tool must raise the ceiling without breaking the quota and rent loops (`economy.json` `rent`, `quota`), so the proposed numbers keep a piled yield (2 to 3) below the 90 s respawn of three nodes, and the build session checks the totals against the day length of `world-mode.md` before any value is final. Open question 5.

## 8. New items

All values _proposed_; they move to `items.json` and `balance.json`.

### 8.1 Tools

| Item | Tags | Durability | Source |
| --- | --- | ---: | --- |
| Axe | cut 1 | 20 | General store, lumber camp `axe_block`, `toolshed` loot, recipe (timber 2, stone 1 at a basin or workbench) |
| Iron axe | cut 2 | 40 | Forge (tin ingot 3, timber 1) |
| Pickaxe | break 1, dig 1 | 20 | General store, mine `tool_rack`, `mineStash`, recipe (timber 1, tin ore 2 at a workbench) |
| Iron pickaxe | break 2, dig 1 | 40 | Forge |
| Spade (exists) | dig 1 | 20 | as today |
| Lockpicks (exists) | pick 1 | charges | recipe: 1 tin ore at a basin (`recipes.json`), found, or bought at the black market |
| Fine pick | pick 2 | charges | Forge, or loot in a tier-3 chest |
| Crowbar (exists) | pry 1 | 20 | recipe as today |
| Hammer | pry 1 (crates only) | 40 | tool_rack |
| Skinning knife | skin 1 | 20 | Gamekeeper's stall, general store, `toolshed` and `forager` loot (8.4) |

Tier 2 opens what tier 1 cannot (a strongbox lock, a granite boulder, a thick log). Tools wear: each use takes `wear`, and a worn tool breaks with a line ("The axe handle splits."). The grindstone restores it, which gives the camp's grindstones and the smithy a use. A tool's `kind` is `tool`, so it takes an inventory slot (open question 4).

### 8.2 Armour

Armour is a separate equipment slot, not an inventory item. Two slots, `body` and `head`; tiers 1 to 3.

| Item | Slot | Tier | Damage taken (_proposed_) | Source |
| --- | --- | ---: | --- | --- |
| Quilted coat | body | 1 | ×0.85 | General store, `armoury` loot, recipe (cloth) |
| Leather jerkin | body | 2 | ×0.70 | Recipe: hide from a wolf or boar skinned with a skinning knife, at a workbench |
| Tin mail | body | 3 | ×0.55; walking speed ×0.95; footsteps +1 tile | Forge (tin ingot), `armoury` loot |
| Miner's cap | head | 1 | ×0.90 | BlackPine office, mine `tool_rack` |
| Tin helm | head | 2 | ×0.80 | Forge |

Rules:

- Armour reduces **creature damage and fist, mugging and weapon strikes**. It does not touch the Knife (it kills outright whatever the health, A89), Nightshade or the Last Shot, so armour never makes a seat unkillable by the Killer.
- Reductions multiply, and the total is capped (_proposed_ at 0.5), including the Lodge's `creatureDmg` perk (`economy.json`). A heavy set trades speed and noise for protection, which is a choice a Killer feels too.
- Armour is public. It does not reveal a role, and it is not a role item (`roleBound: false`); it drops on death like the rest.
- Whether armour shows on the figure is an art question (open question 6).

### 8.3 Weapons with their own damage

Today damage comes only from `balance.body.damage` and the mobs' `dmg`. A `weapon` block on an item (3.3) gives each weapon its own numbers; `balance.body.damage` keeps `strike` (fists) as the default for no weapon, and `strike` stays the unarmed baseline of 8.

| Item | `dmg` | Effects | Attack | Range | Noise | Notes |
| --- | ---: | --- | --- | --- | --- | --- |
| Fists | 8 | Dazed 0.1, Weakened 0.2 | as today | 1 | none | `balance.body.damage.strike` |
| Club | 12 | Dazed 0.25 | 1.1 s | 1 | none | `armoury` loot, recipe (timber 2) |
| Hatchet / Axe | 14 | Bleeding 0.2 | 1.4 s | 1 | `chop` | the tool as a weapon; suspicious to carry |
| Pickaxe | 16 | none | 1.6 s | 1 | `smash` | slow |
| Slingshot (exists) | 4 | Stunned | as today | ranged | none | |
| Crossbow (V1.5) | 30 | none | reload | ranged | `bolt` (10) | needs Bolts; sturdy against wolves |

Every weapon has `kills: false` against a seat: a player is never killed by anything except the Knife and a creature's bite (the pacing rule in the round-9 plan). Against creatures a weapon deals `dmg` × `creatureMult`; wolf (36 HP) takes three hatchet blows, which is the point of carrying one. Bleeding stops at 1 HP (`world-mode.md`). A tool used as a weapon wears faster (`wear` 2 per blow), so the axe in the Killer's hand costs it an axe.

### 8.4 Skinning

A creature corpse (`creatureCorpseS` 10 in `balance.body`) can be skinned with a **Skinning knife** (item `skinningKnife`, tag `skin` 1, `roleBound: false`, durability 20, sold at the gamekeeper's stall and the general store, found in `toolshed` and `forager` loot) for hide (wolf 2, boar 2, bat and rat none) and game (wolf 1, boar 2; bat and rat none; _proposed_). Hide is the leather jerkin's material; game is the stew's (9.6). The Knife and the Replica Knife are role kit and have no part in it: if the Killer's Knife could skin, only the Killer could ever hold hide or wear a jerkin, and the leather would mark them. This ties the mobs (9C bosses and drops) to gear without another item class.

## 9. How the table extends what exists

### 9.1 `routines.json` `holds` (NPCs)

`holds` is a map from prop kind to the hold an NPC starts there; the brain refuses its own cycles after one refusal (`routine.ts:758-763`). It is `{}`, so NPCs only stand and walk. Proposed:

- `holds` and `activities[].kinds` accept **class ids** as well as prop kinds, so `"holds": { "lumber": "interact" }` sends a lumberjack figure to chop and an NPC with a Lockpicks pick locks. A `townsfolk` row gains `carries: ["axe"]` so an NPC's hold is not refused for a missing tool; an NPC without it gets `NEED_TOOL` and ends the cycle, like a human.
- An NPC's work is **cosmetic by default** (the animation and the noise run, the prop's state does not change), so NPCs never empty the stock a player came for. Open question 7 lets the gatherer figures actually deplete a pile, which turns the rogue's competition into a world rule.
- The `ignore` list shrinks to the kinds that really are never stations. Today 17 kinds are in it; after the table every kind is a class or is `keep`.
- This is the hook for `living-world.md`: a living world's chores are interactions with an NPC doer.

### 9.2 `resources.json` `tool` (nodes)

Today `"tool": "spade"` on Tin Ore is an item id checked by `count(player, resource.tool) === 0` (`Resources.ts:158`). It becomes `"tool": { "tag": "dig", "tier": 1 }` and the check goes through the same resolver as every other interaction. A string value stays valid as an alias (`"spade"` means "any item that is the Spade") until the data is migrated. `validate.ts` asserts every resource has a gather interaction.

### 9.3 `items.json` `use` (abilities)

`use` stays the ability id of a consumable or a role ability; `Actions.ts` keeps its `switch`. Two changes: an item with a `use` and no handler is marked `status: nfy` in the data so the server answers `NFY` (failures.md) rather than falling through, and tool items stop needing a `use` (the Crowbar's `crowbar`, the Skeleton Key's `skeletonKey`, the Lockpicks' `lockpick` become interactions on `lockedDoor` and `chestLocked`). The Master Keyring (`lockUnlock`) is a Cabal item and stays an ability that locks or unlocks a door; it adds a `lock` interaction for the lock side.

### 9.4 `recipes.json` (crafting)

Recipes already name a `station` prop kind (`basin`, `oven`). Proposed new stations, all existing props: `sawHorse` (Timber 2 to Planks 2; the General store's Planks stay a shortcut), `workbench` (Axe, Pickaxe, Hammer, Club), `kiln` (Tin Ore to Tin Ingot), `forge` and `anvil` (iron tools, tin mail, fine pick), `mortarTable` (Salts, Bandage from herbs), `grindstone` (restore durability, no recipe), and the bakery tables for a **Wake Loaf** recipe (Flour at an `oven`), so a player can bake bread rather than buy it. The rooms that hold these props gain a purpose without a single new prop.

### 9.5 Doors (`scene.ts` `Portal.lock`)

`lock: { keyId }` gains an optional `tier` (additive): `{ keyId, tier }`. A portal with a lock is a `lockedDoor` target; `pick_lock` (3.1) opens it at tier ≤ the pick's tier, a key item whose id equals `keyId` opens it silently, and a crowbar breaks it for good (the door "stays broken", GDD 3.5). `Portals.ts:180-183` calls the resolver instead of refusing every keyed door. No existing door is locked in the data, so the round-10 scene edit chooses which doors lock (the manor study first, since `mu.study_door` and the Study Key caches in the barn and the cellar are already placed).

**Curfew doors.** From dusk an Indebted seat's curfew doors are refused by `curfewBars` (`Portals.ts:187`), and the curfew list in `economy.json` names the scenes: tavern_bar, widow_parlour, bakery, apoth_shop, manor_hall and barn on HollowMere; bp_lodge, bp_office and bp_smithy on BlackPine. For the lock-picking path (the rogue who dodges the curfew and the tax) to exist, **the round-10 scene edit must give the portals into those scenes a `lock` (`keyId` and `tier`)**, and `curfewBars` must call the resolver instead of refusing outright: a curfew door is then a locked door at night, which a pick, a key or a crowbar opens, with a print and noise, and `CURFEW` is the refusal only for a seat with none of them. Without the `lock` on those portals `pick_lock` has nothing to open there.

### 9.6 Rows for the living world (9C): berries, game, stew

Three additions so foraging and hunting feed a meal, none of which exists in the data today. Values are _proposed_.

```jsonc
// resources.json
"berries": { "id": "berries", "name": "Berries", "gatherS": 2, "yield": 2, "respawnS": 75, "sprite": "node_berries" }

// items.json
"berries": { "id": "berries", "name": "Berries", "kind": "material", "roleBound": false, "onDeath": "drops", "tooltip": "Crafting: stew. Wanted by quest givers.", "ships": "V1", "gddRef": "3.14" },
"game":    { "id": "game",    "name": "Game",    "kind": "material", "roleBound": false, "onDeath": "drops", "tooltip": "Meat from a skinned creature. Crafting: stew.", "ships": "V1", "gddRef": "3.14" },
"stew":    { "id": "stew",    "name": "Stew",    "kind": "food",     "roleBound": false, "onDeath": "drops", "use": "eat", "tooltip": "Hot food: cures Famished and restores stamina.", "ships": "V1", "gddRef": "3.22" }

// recipes.json
"stew": { "id": "stew", "out": "stew", "qty": 1, "in": [{ "item": "game", "qty": 1 }, { "item": "herb", "qty": 1 }, { "item": "mushroom", "qty": 1 }], "station": "oven", "craftS": 4 }
```

- **`berries` node.** A seventh resource. Round 10 adds `NodeSpot`s in `forest`, `forest_deep` and `bp_woods` (new ids under each prefix, one shared pool per scene so half are active, like the other six), each anchored to a bush prop (a new `berry_bush` stem, art task) per section 7. Class `node:berries`, interaction `forage_berries`, a bare-hands mode only (no tool wall for food). The market buys it (`economy.json` `shops.market.buys` and a `prices` entry).
- **`game` item.** Dropped by skinning a wolf or a boar with the Skinning knife (8.4). It is also sold at no shop, so meat is a hunter's resource.
- **`stew` recipe.** At an `oven` (the bakery oven or the tavern stove), so the table already has the station. `stew` uses the same `eat` ability as the Wake Loaf; `body/verbs.ts` `handleEat` is generalised from one food id to every `kind: "food"` item in the build step. A Wake Loaf recipe (Flour at an `oven`) sits beside it (9.4), so bread and stew are the two meals a player can make instead of buy.
- **The rogue's meal** (section 11) is then: forage berries, herbs and mushrooms, hunt for game, cook stew.

## 10. The table

Rows are what a seat holds, columns what it works on. A cell is the verb and the result; `–` means the failure line of the column's interaction runs (`NEED_TOOL` naming the right tool). Proposed numbers are the _first_ guess; the table is the structure.

| Object | Bare hands | Axe | Pickaxe | Spade | Lockpicks | Crowbar | Key | Skinning knife |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Woodpile / firewood / log basket | Take 1 | **Chop** 2 to 3 timber | – | – | – | – | – | – |
| Log / fallen log | – | **Chop** 3 timber | – | – | – | – | – | – |
| Stump | – | **Grub** 1 timber, resin | – | – | – | – | – | – |
| Mine timber set | – | **Cut** 2 timber (rockfall risk) | – | – | – | **Pry** 1 timber (rockfall) | – | – |
| Boulder | – | – | **Break** 2 to 3 stone, tin ore sometimes | – | – | – | – | – |
| Rock pile / ore pile | Take 1 | – | **Break** 2 stone or tin ore | – | – | – | – | – |
| Rubble | Clear slowly | – | **Clear** and uncover a cache | Dig | – | – | – | – |
| Tin seam (node) | – | – | **Mine** tin ore | **Dig** tin ore | – | – | – | – |
| Barrel / sack / hay / churn | **Search** | – | – | – | – | – | – | – |
| Nailed crate | – | Smash (noise 10) | – | – | – | **Pry** (noise 10) | – | – |
| Locked chest / footlocker | – | – | – | – | **Pick** (print, noise 5) | **Pry** (broken, noise 10) | **Open** (silent) | – |
| Strongbox | – | – | – | – | – | – | **Open** (its key only) | – |
| Locked door | – | – | – | – | **Pick** | **Break** (stays broken) | **Open** | – |
| Shop shelf (owned) | **Take** (theft) | – | – | – | – | – | – | – |
| Wolf / boar corpse | – | – | – | – | – | – | – | **Skin** for hide and game |
| Berry bush (node) | **Forage** berries | – | – | – | – | – | – | – |
| Snare in the wild | **Disarm** | – | – | – | – | – | – | – |

Failure lines used by the table (full set in the `fail` blocks of `interactions.json`; wording rules in `failures.md`): the owner's lock line, "Failed to pick the lock. Looks like you might need a lock pick."; lumber, "You tug at the timber. It will not come apart by hand. An axe would."; boulder, "The boulder does not care. You would want a pickaxe."; seam, "The seam will not give. A spade would."; nailed crate, "The lid is nailed down. Something to lever it with would help."; locked chest with no key or pick, "The lock holds. It wants a key, or a pick."

### 10.1 Secrecy check: no verb depends on a role's item

The rule (CLAUDE.md, role secrecy): holding or using an item must not mark a seat's role. A verb in the table that only a role-bound item could perform would make that role's holder the only one who could ever do it, and a sighting of the result would mark them. The check, over every verb and tool in sections 3 to 10:

- The `roleBound: true` items in `items.json` are Knife, Master Keyring, Magnifier, Notebook, Slingshot, Replica Knife, Crossbow, Seance Chalk, Remedy, Nightshade and Fowling Piece. The table uses **none** of them as a tool. A validator rule enforces it: no `modes[].tool` may resolve to an item with `roleBound: true`.
- Found and fixed: skinning was written for the Knife and Replica Knife (the Killer's and the Drifter's). It now needs the neutral Skinning knife (8.4), so hide, game and the jerkin are reachable by every seat.
- The Master Keyring (a Cabal item, `use: lockUnlock`) keeps its own ability, which locks and unlocks any door. It is not a table verb; the table's `pick_lock` and the Skeleton Key and Crowbar stay open to every seat, so a lock that opens is not proof of a Cabal card.
- The Slingshot and Crossbow in 8.3 are role kit, listed for their damage numbers only. The new weapons (club, hatchet, axe, pickaxe) are neutral, so armed gear does not mark a role either.
- Nothing in the table reads or writes a seat's role card, inventory or notebook beyond the acting seat, and containers roll on a stream no secret shares (6.4).
- Left open (not a role leak): a Killer who picks a lock leaves a print and noise like anyone, so the lock tells nobody anything about roles; the tool and the print are the evidence, not the card.

## 11. Checking the rogue

The owner's example: "the rogue who refused to buy bread and gathers food instead and makes his own lock picks to avoid paying taxes." The table must make each step possible, at a cost, without a special case:

| Step | Row the table needs |
| --- | --- |
| Skip the bread | Forage (mushrooms, herbs, berries: bare hands, section 5.1 and 9.6), hunt (game from a skinned boar), **cook stew**, or **bake** (Flour from the bakery sacks, or searched stores, at an `oven`: the Wake Loaf recipe, 9.4) |
| Make lock picks | Tin Ore (a Spade or a Pickaxe on a seam, or a boulder), then the existing `lockpicks` recipe at a basin; the rogue needs no shop |
| Open what the tax guards | `pick_lock` on the curfew-locked door or the owned shelf (`ownership: "owned"`, `crime: "theft" / "trespass"`) |
| Skip the tax | Rent and quota are paid in Scrip or items (`economy.json`); an owned container or a seam gives a way to earn without the shop; the quota rack takes timber and stone, both now easy to obtain with the right tool |
| Be caught | A witness or a print (`leaves: "print"`) writes a Notice; the Watchman's arrest route (`world-mode.md`) reads it |

`emergent-play.md` (9C) traces this in full; the table's job is that no step needs code outside it. The one thing it cannot supply alone is the tax's own consequences, which `economy.json` already owns.

## 12. Build plan for round 10 (not this PR)

Pull requests under 400 lines, one concern each, in this order. Each keeps the build green and changes no game balance until the last.

1. **Schema and validator.** `interactions.ts`, `validate.ts` rules, an empty-but-valid `interactions.json` registering the 68 `live` kinds as classes. Test: every prop is matched by at most one class; the audit script's totals.
2. **Resolver.** `sim/interact/resolve.ts` and `act.hold {action: 'interact'}` behind the legacy dispatch. Test: a seat without the tool is refused `NEED_TOOL`; with it, drops land and the tool wears; state is public.
3. **Tools and the first four interactions.** Axe, Pickaxe, items and recipes; `chop_lumber`, `break_boulder`, `gather` migrated for tin ore; the grindstone. Test: yields, wear, break, respawn.
4. **State on the wire and art frames.** `PropState`; the sprite packer's `_cut`, `_rubble`, `_open`, `_broken` frames.
5. **Containers.** The `loot` stream, activation, tables, `search` and `lock`, `containerSlots` for the six empty places, `Portal.lock.tier`. Test: determinism for a seed, no secret leaked to a seat that did not open it, reachability on the nav grid, per-scene counts match 6.2.
6. **Gear.** Armour slots, `weapon` blocks, the forge and kiln recipes, skinning. Test: the Knife ignores armour; the cap holds; bleeding never kills; no table verb requires a `roleBound` item (10.1).
7. **NPC holds.** `holds`, `carries`, cosmetic work, the lumberjack figure.
8. **Client.** The use prompt reads the table and greys a verb with the missing tool; failures per `failures.md`.

The validator in step 1 is the safety net for the rest: it fails when a scene file adds a prop with no decision.

## 13. Open questions for the owner

Each has a default the build uses unless the owner answers otherwise.

1. **A tool is a speed-up or a wall?** Rule 1 makes lumber and loose stone available by hand, slowly, and walls only boulders, locks and nailed crates. _Default:_ as written. Alternative: wall everything behind a tool, as the owner's phrasing ("an axe should be able to cut up the lumber piles") may mean.
2. **Is a crate or a lock a puzzle, or a toll?** A lock picks in 5 s with a consumed pick. _Default:_ a toll (a hold, a noise, a print), no mini-game. Alternative: a lock-picking mini-game in the style of 3.16.
3. **What does the hub chest become?** _Default:_ the town's lost-and-found, filled by arrests. Alternative: remove it; or make it the Daily Train's drop box.
4. **Where do tools live?** The pack holds 5 items and tools compete with the Medkit and the Lantern. _Default:_ 2 extra belt slots for items of kind `tool`, and equipment slots for armour and one weapon. Alternative: keep 5 and let tools stack in the slot.
5. **How much easier may supply get?** An axe or a pickaxe raises timber and stone supply; the quota and the rent are tuned to a scarcer world. _Default:_ the build tunes yields so the tool is about twice as fast as a node, never ten times, and `world-mode.md`'s pacing table (a day of 480 s) sets the final numbers.
6. **Does armour or a held tool show on the figure?** _Default:_ not in round 10 (icon and HUD only); a held tool or weapon is the first overlay if the art budget allows.
7. **Do NPCs deplete stock?** _Default:_ no, their work is cosmetic. Alternative: gatherer figures take from piles and the world runs short, which makes the rogue's competition real.
8. **How strict is ownership?** Taking from a shop shelf is theft only when a witness or a camera of the town sees it. _Default:_ a witness (an NPC or a seat in sight) writes a Notice, as 3.23 does for other crimes. Alternative: every taking from an owned thing is logged and billed.
9. **Do iron tools and tin mail exist before BlackPine's forge?** The only forge and anvil are in `bp_smithy`. _Default:_ tier 2 is BlackPine-first; HollowMere reaches it by carrying ingots across (they are items). Alternative: a HollowMere smithy (a new scene id appended to `SCENE_IDS`).
