# Round-6 contract: the Bible's seams, rounds 6 to 9

The owner's Integrated Master World, System & Design Bible (`owner-brief.md` 2) describes more than one round can
build: four killer vendettas, conditional townsfolk evolutions, the three-stage law pipeline, a macro-economy
with HQ trees, the omniscient NPC propagation matrix, a story mode, and three towns (HollowMere, Port-au-Levain,
BlackPine). The owner chose **four rounds** (DECISIONS A81): round 6 is planned to the brief level and leaves
**empty, validated seams**; rounds 7 to 9 are outlined here and planned in their own contract documents when
their turn comes. `owner-brief.md` 3 lists what the Bible names that the code does not have, with the real names
beside each; this document says which round gives it the real thing.

## 1. What round 6 pre-seeds for the Bible (6Z lands, nobody fills in round 6)

| Seam | Where | Shape in round 6 | Filled by |
|---|---|---|---|
| `vendettas.json`, `evolutions.json`, `events.json`, `laws.json` | `packages/content/data/`, zod `strictObject` in `schemas/{vendettas,evolutions,events,laws}.ts`, parsed by `parseContent`, validated empty | `{ "gddRef": "3.20", "vendettas": {} }` and the like: an empty record each | rounds 7, 8, 9, 8 |
| `sim/events/bus.ts` | `server/sim/events/`; `emitSim`, `onSim`, the `runEvents` Step stage after `runPhases` | 6B fills the bus and round 6's emitters (`auto-admin.md` 5) | the vendettas and the matrix subscribe (rounds 7, 9) |
| `GameState.lawStage: u8()` | `packages/shared/src/schema/index.ts`, public | always 0 | round 8 |
| `Role.evolvedFrom: string` | the own `Private.role` view only | always `''` | round 8 |
| `Quest.kind 'contract'` | `quests.json`, `sim/Quests.ts` | the schema allows it; the server refuses to accept one | round 7 (the Hitman's mail) |
| `Cutscene.kind 'memorial'` and the `video` step | `schemas/cutscenes.ts`, `S2C.cutscene { scope: 'all' }` | allowed by the schema, sent by nothing | round 7 (the Vicar) |
| `registerInvariant` | `sim/auto/invariants.ts` | 6B's seven checks | vendetta and law checks (rounds 7, 8) |
| `tools/auto` in CI | `soak.yml` `auto` leg | runs the all-NPC matches weekly | the regression gate of every later round |
| `memorial_vicar.webm` | `assets/video/` | 6N ships the file and the manifest row | round 7 plays it |
| `StreamName` `'contract'`, `'events'` | `server/sim/seeds.ts` | listed, drawn by nothing | rounds 7, 9 |

Everything in this table is additive: nothing the code at a60d855 reads is removed or made required.

## 2. The staging

### 2.1 Round 7: vendettas and memorials (HollowMere)

- The four vendettas of Book I.3 as **behaviours of a Killer's card**, chosen at the deal from
  `vendettas.json`: **conversion** (the Zealot against the Vicar), **sabotage** (the Activist against the
  company), **heist** (the Bandit against the strongbox), **contract** (the Hitman, whose target arrives by
  the mail stream `seeds.get('contract')` and is accepted as a `contract` quest). Each vendetta is a trigger
  and a consequence written as `SimEvent`s on 6B's bus, so the base kill loop stays what it is and a vendetta
  adds pressure around it.
- **The Daily Train** (Book I.2) as the master clock: a scene event at a fixed tick of each day on
  `hm.station`, with `train_arrive` and `train_brake` (`media.md` 1), the mail, and the strongbox's delivery.
- **The Vicar's martyrdom** (Book I.6): the `memorial.vicar` cutscene with 6N's video, sent with `scope:
  'all'`, and **the Ascended Vicar** as `flow.ascendedVicarCandidate`, a round-7 `FlowState` field.
- Vendetta invariants under `registerInvariant`; `pnpm auto -- --matches 50` as the gate before the round
  closes. The Port-au-Levain opening cutscene is written here too, so the map of round 8 arrives with it.
- GDD 3.20 "Vendettas" is new; 3.3 gains the Train line.

### 2.2 Round 8: evolutions, the law, the economy, Port-au-Levain

- **Evolutions** (Book I.5, III.4): `evolutions.json` rows `{ from, to, when: SimEvent pattern, keepPublicLook }`;
  an evolution rewrites `Private.role.roleId`, sets `Role.evolvedFrom`, re-sends `roleReveal { evolved: true }`,
  and `publishLooks` honours `keepPublicLook` (a seat that evolves quietly keeps its public look; one that
  evolves openly changes it in one tick, the same rule as the cover pick).
- **The law pipeline** (Book I.4): `GameState.lawStage` moves 0 -> 1 -> 2 on `laws.json` triggers (a reported
  body, a second meeting, the Tribunal), and the Tribunal's three verdicts (release, exile, hang) replace the
  plain ejection at stage 2. GDD 3.8 gains the stages.
- **The macro-economy** (Book IV): the four macro resources (timber, coal, flour, coin) as `GameState`
  counters per map, the tax loops as `SimEvent`s on the Train, and the HQ tiers as `recipes.json` station sets
  per map (a tier unlocks a station). The deflection loop is a vendetta consequence (round 7's bus).
- **Port-au-Levain**: the campaign map (`maps/port_au_levain.json`, prefix `pl.`, `SCENE_IDS` append-only), its
  scenes, the platters as ONUB's main-mode cousin, the ferry (`ferry_horn`), the opening cutscene from round 7.
- GDD 3.21 "Evolutions and the law", 3.22 "The economy"; WORLD 4.11 Port-au-Levain.

### 2.3 Round 9: world events, propagation, BlackPine industry, story mode

- **The propagation matrix** (Book V and VI): `events.json` as the matrix the Bible prints in JSON, run by
  `sim/events/propagate.ts`: the gossip accumulator per NPC, letters on the mail stream, the NPC emotional
  states (Calm, Panicked, Entranced, Rioting) as a `Brain` field that routines read, biome predators as mob
  spawner modifiers, faction enforcers as NPC seats with a routine. Everything is a subscriber of 6B's bus.
- **BlackPine's industrial mechanics** (Book III): soot as a scene-wide clue decay modifier, the steam network
  as a station set, the tally rack and the roll call as the BlackPine meeting reason (`MeetingReason`
  append-only).
- **Story mode** (Book V): a single human seat with the omniscient NPC engine, on the admin auto-mode's
  harness (every other seat an NPC with `npcPrey` on), scripted openings per chapter from the cutscene data.
- **The admin matrix inspector**: the propagation state in `admin.snapshot` and a pane in the admin client.
- M4 deduction depth and M6 polish land on the loading, transition and music scaffolding of round 6.

## 3. What the Bible asks for that stays out

- The Bible's audio keys (`amb_rain`, `bell_ring` and the like) are mapped to the real keys
  (`amb_village`, `amb_forest`, `amb_cave`, `amb_house`, `bell`) in `owner-brief.md` 3; nothing renames an
  existing key.
- An `Entity` schema does not exist and will not: seats are `Player` with `Avatar` views, mobs are
  `SceneState.mobs`, givers are scene statics. `LOFT_SCENE_INDEX` and `VIEW_TAG` stay what round 5 made them.
- "One Night Ultimate Baguette" stays an in-joke (CLAUDE.md "Naming caution"); Book II's dual format is the
  existing quick mode plus round 8's platters, not a rename.
- Nothing here changes a frozen id (scenes, portals, spawns, clues) or reuses a prefix.
