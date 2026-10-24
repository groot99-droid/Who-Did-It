# Round 8 addendum B: the living world (8Q, 8R, 8S, 8T, 8U)

What the five sessions of the owner's living-world request build against, written by 6Z on 2026-10-24 (DECISIONS
A173, A174). Rules and numbers stay in `docs/GDD.md` and `packages/content/data`; this file names the keys, the
owners and the seams. [seams.md](seams.md) still holds for everything shared, and its locks stand unless a grant
below opens a line.

**Intent** (teardown.md 5). It should feel like a town that notices: wolves that live somewhere, townsfolk who see a
body and do something about it, NPC seats that work and talk like people. The owner likes the hidden-role core and
the 2.5D look and wants depth "built in". It must never leak a secret through an NPC, never let a model call stall
the tick, and never crowd a wood so full that it stops being a wood.

**The owner's request** (2026-10-24, verbatim in A173). In short: every NPC connected "like a hive mind" that
understands every mechanic, with potential, state and proximity triggers; wolves and every environment mob spawned
from moving **nodes** of about 5x5 tiles whose paths never overlap, acting inside them; hostile mobs that lock on
when you enter a node and chase for 10 s, all nodes you trip joining in ("packing"); passive mobs that flee when hit
and drift back over 10 s with a graze pause; boss NPCs on the same system with a room-sized area; townsfolk who
react to a body at 10 / 5 / 2 tiles (pulled in, shout for the Detective and the Doctor, run for the bell); NPC seats
that do their tasks and share what they learn (on hard, only for a briarberry); and the question whether AI could
run NPC behaviour.

**The owner's answers** (A173, verbatim there): briarberry is the Doctor's healing ingredient from the briar bush,
which bleeds whoever picks it (on hard down to half health, never to death); easy villagers gift it, normal sells
and grows it, hard only grows it. NPCs share findings both in the world and in meetings, anonymously in meeting
chat, with one to three red herrings a meeting that are "slightly off" and satirical lines ("Can I get a cup of
coffee"). NPCs see fairly, and the bell may ring at night (A174). Try AI meeting talk now.

**Assumptions** (6Z, stated to the owner; corrected at review if wrong): "difficulty" is the lobby NPC difficulty
(GDD 3.12); on hard an NPC shares a finding with a player only after that player gives it a briarberry; wolves and
bats are hostile, boars and rats passive.

**What already exists** (survey of 58a669f): no hive (each `sim/npc/memory.ts` Brain is alone; only station claims
are shared); mobs on a fixed spawner tile with a circular leash, one creature per spawner, three per scene, a 6 s
single-mob chase, flight only from flames; NPC body sight a bare distance check, no hearing, no bell, no chat, no
tasks; no server code for `dustCompare`, `autopsy` or `salts`; no briarberry; no model calls. The frozen bat is a
leash whose roam goals are floor but unreachable (`cave_gallery` `cg.sp_bats`: 25 of 73 tiles reachable; the same
in `bp_woods` `bw.sp_wolf_s` and `forest_deep` `fd.sp_boar`).

## 1. The world index (8Q)

`sim/world/index.ts` (new) answers "where may something stand" once per scene, for everyone.
- **Reachable floor.** Per scene, the walkable tiles split into connected components by a flood fill over the same
  step rule `tilePath` uses (`packages/shared/src/rules/npc.ts`). Prop and building footprints are occupied.
- **Live occupancy.** Seats, figures and creatures are counted per tile each tick, read-only to everyone else.
- **`freeTile(area, rng)`** returns a reachable, unoccupied floor tile inside an area, or none. Habitats, townsfolk
  and NPC placement use it; nothing spawns in a tree, a wall or off the map.
- **Density.** A cap per scene and per area (`world.densityPerTile`, balance) keeps a wood from filling up.

## 2. Habitats (8Q)

"Node" already means a resource node, so the owner's mob nodes are **habitats**.
- **Ids.** Every existing spawner id is frozen and becomes a habitat id (`fd.sp_boar` stays `fd.sp_boar`). A scene's
  `spawners` gain the habitat columns; a new habitat takes a new id with the scene prefix.
- **Columns** (`mobs.json` per creature, overridable per habitat in the scene): `area` (tiles, default 5x5), `count`,
  `temper` (`hostile` or `passive`), `acts` (weights of walk, run, lie, sit, graze), `migrate` (speed and pause).
  `mobs.maxPerScene` becomes a cap on creatures, not spawners.
- **Placement.** Creatures spawn on `freeTile` inside the area and act inside it, moving with it as it migrates.
- **Migration without overlap.** Each scene's reachable floor is cut into a seeded partition (Voronoi on the
  `mobs` stream, one cell per habitat). A habitat migrates only inside its own cell along a seeded loop, so no two
  habitats' areas or paths ever meet, by construction, and a test proves it on every scene of both maps.
- **Hostile.** A seat that enters a hostile habitat's area is locked on by every creature of it; the chase lasts
  `mobs.chaseS` (10, was 6). **Packing:** one chase timer per seat, restarted by the last area the seat trips, so
  every habitat tripped inside the window keeps chasing until it runs out. Flight from flames (GDD 3.15) still wins.
- **Passive.** A hit sends the creature out of its area by `mobs.fleeTiles`; it stops, then walks back at idle speed
  over `mobs.returnS` (10), pausing once for a passive act (graze).
- **Bosses.** A habitat with `boss: true` takes the whole room as its area. This round ships the mechanism and a
  test only; no boss is placed.
- **Never stuck.** Roam goals are drawn only from tiles reachable inside the area (the fix for the frozen bat lands
  first, alone), and the auto invariant `mobStuck` fails a creature that has a goal and has not moved for
  `mobs.stuckS`.
- **Written, not built** (GDD 3.6, 3.8): the broken-fence village wolf (`wolves.intrudersWhenFenceBroken`) and the
  Final Night's village wolves. 8Q builds both on habitats.

## 3. The hive (8R)

`sim/npc/hive/**` (new): one blackboard per room that every NPC seat, townsfolk figure and creature brain reads.
- **Public only.** It holds perceptions anyone standing there could have: bodies, creatures, noises, sightings,
  clues seen, shouts, the bell, the phase, the difficulty, 8E's moods and needs. Never a card, a cover, a private
  view, a vendetta or who is an NPC. The auto invariant `hiveNoSecrets` checks every entry each tick.
- **Fair senses.** Sight goes through `canSee` (`sim/Sight.ts`) and the lights, so an NPC sees exactly what a human
  in its place would (8L's night sight). Hearing: `emitNoise` (`sim/Noise.ts`) gains NPC listeners, so the kill
  scream and the bell reach NPCs.
- **Triggers.** A registry of three kinds: **potential** (an opportunity: an unlit lamp, an open shop), **state**
  (phase, mood, need, difficulty) and **proximity** (a body, a creature, a noise, the bell). A trigger writes a
  reaction into the brain, which runs as `mode = 'react'`; reactions are staggered per NPC so the town never moves
  in lockstep (npcTells T10, T11 and T12 stay green).
- **Body bands** (`npc.body.pullTiles`, `shoutTiles`, `bellTiles` in balance; GDD 3.12): inside the pull band an NPC
  walks toward a body it can see; inside the shout band it **shouts**, a new public event that calls the nearest
  Detective and Doctor (NPC seats through the hive, humans through a HUD cue that names the place, never the
  shouter's card); inside the bell band it runs for the bell and rings it. The report keeps `reportDelayS`.
- **The night bell** (A174): the bell may be rung at night while an unreported body lies in the world; otherwise
  the night rule of GDD 3.8 stands.

## 4. Roles (8S)

- **NPC seats work.** They are dealt tasks like humans and do them at their stations (`sim/Tasks.ts`, granted),
  which also gives 8C's wages to NPCs.
- **Abilities with no server code today:** `dustCompare`, `autopsy` and `salts`, built for every seat, human or NPC.
  NPC Detectives and Doctors use them and `bandage`; a finding goes to the Case Board as a human's would.
- **Sharing.** On easy and normal an NPC shares a finding with everyone (on the Case Board and in meeting notes,
  section 5). On hard it shares with a player only after that player gives it a briarberry.
- `plantsPerNight` (GDD 3.12) is read at last. npcTells T5 is widened by grant for role holds.

## 5. Talk (8T)

`services/talk/**` (new) and the meeting-notes channel.
- **Meeting notes.** A new meeting channel open to every living seat whose lines carry **no speaker**. NPC lines hide
  among human ones; both are rate-limited by `talk.*` keys. Named chat stays as it is.
- **Lines** come from templates and, when `ANTHROPIC_API_KEY` is set on the server, from Claude through the Messages
  API (the model id is a config value, default the fast small model). Input is the speaking NPC's own public view
  and public facts only, never another seat's secret.
- **Off the tick.** A call is async; `step()` only takes finished lines from a queue; a call that times out gives
  its template line instead. Per-match caps on calls and tokens.
- **Red herrings and jokes.** One to three lines a meeting contradict one public fact "slightly off" (`talk.*`
  bounds); a few are satirical small talk.
- **Filter.** Length, no card or role named for a seat unless that seat claimed it publicly, no slur list hits.
- **Replay.** Every line is written to `MatchLog`, so a replay reads the log and never calls the model. Auto runs
  and tests use templates only. The key is never written to a file, a log or a message.

## 6. Briarberry (8U)

- `briar` resource node (`resources.json`) and `briarberry` material (`items.json`). Harvesting inflicts Bleeding
  (8A's effect); on hard the bleed is floored at half health, never a death.
- Doctor recipes (`recipes.json`) turn it into healing items.
- **By difficulty:** easy, townsfolk gift it (8E); normal, shops sell it (8C) and briars grow; hard, briars only.
- Art: the briar bush node (8G), the berry icon (8N), the map rows (8J HollowMere, 8K BlackPine).

## 7. Sessions, ownership and grants

| Session | Model | Branch | Owns | Rows | Starts |
|---|---|---|---|---|---|
| 8Q Habitats | Opus 5.5 | `claude/r8-habitats` | `sim/mobs/**` and `sim/world/**` (grant), `mobs.json` habitat columns, the scenes' `spawners` columns, `mobStuck`, GDD 3.15 | A175, A195 | after 8A and 8E land |
| 8R Hive | Opus 5.5 | `claude/r8-hive` | `sim/npc/hive/**`, the brain hook lines (grant), the NPC listener line in `Noise.ts`, `shout`, `hiveNoSecrets`, GDD 3.12 body bands | A176, A196 | now |
| 8S Roles | Opus 5.5 | `claude/r8-roles` | `sim/abilities/{dust,autopsy,salts}.ts` (new), NPC task and ability use, the hard-mode gate | A177, A197 | after 8A and 8E land |
| 8T Talk | Opus 5.5 | `claude/r8-talk` | `services/talk/**`, the meeting-notes channel in `Chat.ts` and protocol, `talk` in balance, GDD 3.8 meeting notes | A178, A198 | now |
| 8U Briarberry | Fable 5.1 | `claude/r8-briarberry` | the `briar` and `briarberry` rows, the Doctor recipes, the gift and stock rows by grant to 8E's and 8C's files | A179, A199 | after 8A, 8C and 8E land |

- **Grants by 6Z** (each named in the PR that uses it): 8Q owns `sim/mobs/**`, and `mobs.test` lines about the leash,
  "3 at night" and exact tiles are rewritten as habitat assertions; 8R and 8S get one-line hooks in
  `sim/npc/{memory,routine,meeting}.ts` and `Npc.ts`, listed in the PR first; 8S edits `Tasks.ts` where NPCs are
  skipped in the deal; npcTells T5 is widened by 8S.
- **Ids and wire.** `shout` (S2C, public, 8R), the meeting-notes channel (`ChatChannel` `notes`, 8T), `briar` and
  `briarberry` (8U). No schema field: hive, habitats and talk queues stay in room memory.
- **Bus rows** (seams.md 4): `hive.trigger {kind, sceneId}` (server only), `shout {sceneId, x, y}`, `bell {sceneId}`,
  `talk.line {channel}` (server only), `habitat.trip {habitatId, seat}` (server only).
- **Seams.** 8A's body hp and Bleeding (8U, 8Q's bites), 8E's needs and townsfolk (8R reads, 8U's gift), 8C's shops
  (8U's stock), 8L's sight (8R uses `canSee`), 8M's Final Night (8Q's wolves).
- **Merge order.** 6Z's contract first; 8R's hive, then 8S (which uses it); 8T alone; 8Q's reachability fix first,
  then the world index, then habitats; 8U last.

**Verification for the whole addendum.** Habitat non-overlap and reachability on every scene; the packing timer;
passive flee and return; the boss area; the body bands and the night bell; `hiveNoSecrets`; the NPC abilities; the
talk queue off the tick, its log replay and its filter; the briar damage floor; `pnpm auto -- --matches 50` on both
maps at 8 seats clean (`mobStuck`, `hiveNoSecrets`, `scripConserved`, `bodyBounds`); npcTells green; the e2e
smoke, match and world suites.
