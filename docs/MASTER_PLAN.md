# Who Did It — Master Plan (V1 top-down 2.5D, V2 first-person)

Status: v0.1 master plan, committed 2026-10-10 for owner review. The working documents under `docs/` (`GDD.md`, `WORLD.md`, `ARCHITECTURE.md`, `ASSETS.md`, `ROADMAP.md`, `DECISIONS.md`, `RESEARCH.md`) are generated from this file; once the owner answers the open questions in `DECISIONS.md` the working documents become the source of truth and this file stays as the frozen snapshot. `GDD.md` and `packages/content/data/balance.json` are the only sources of numbers; every other document references them.

## 1. Vision & pillars

A storm has closed the road and fog hides the sea. Hollowmere is cut off, Lord Vane is dead, and someone among you is still killing. Find them before the last lantern goes out.

Who Did It is a 5-10 player (4 = practice) hidden-role game played from a link. It crosses Among Us (tasks, bodies, emergency meetings), Mafia (hidden factions, a vote as the climax), a whodunit (physical clues with hidden attributes, a Detective who verifies them) and Hello Neighbor (houses you enter, doors that lock, hiding spots). V1 is top-down 2.5D in Phaser with pre-rendered Blender sprites; V2 is first-person 3D on the same server, rules and world data.

| Pillar | Design rule |
|---|---|
| Every kill tells a story | A knife kill always spawns 2 of 3 trait clues plus a fingerprint and Blood on the killer. Killers manage evidence; they never erase all of it. |
| The vote is the climax | Phases funnel into short meetings. The Case Board turns Verified evidence into a suspect set, never into a name. Ejections reveal roles. |
| Space is information | Entering a house, forest or cave removes you from sight. Alibis are spatial. Nothing inside a scene is sent to anyone outside it. |
| Readable in 20 seconds | One role card, 3 abilities max, canned chat outside meetings, a meeting board that summarises instead of listing. |

## 2. Player experience: the first 10 minutes

1. **Landing (0:00).** `https://groot99-droid.github.io/Who-Did-It/` shows the title over a looping fog plate and two buttons: **Create Party** and **Join Party**. While the server is polled on `/health` the buttons read "Waking the village..." (Render Free fallback) or are live at once (Railway). A name field (2-16 characters) sits above the buttons. Clicking either button unlocks the AudioContext.
2. **Create / Join (0:20).** The leader gets a 5-character code such as `K7PQX` (alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, no 0/O/1/I) plus a share button that copies `.../Who-Did-It/#/join/K7PQX`. Friends paste the code or open the link; the code field is prefilled from the hash.
3. **Lobby (0:40-2:00).** Roster of names with a Ready tick, player count "5/10", a line "Best with 6-8 players" and, at 4, "Practice party: roles on, Cabal needs 3 kills". Start is enabled at 4 or more players; if someone is not Ready the leader sees a confirm dialog listing them. The settings panel has only `map` (Hollowmere) and `revealMode` (full, locked in V1).
4. **Start and role card (2:00-2:15).** The server deals roles and traits, locks the room and sends each client its private card. The card shows: faction stripe and icon, role name, your sprite with your traits and the line "You look like: Tall / Green scarf / Bowler hat", a one-line goal, up to 3 ability rows with key and cooldown, the inventory strip, 2-3 sentences of card text, a Beware line, and for Cabal the teammate names. It holds 12 s; Ready dismisses it; Tab reopens it; a HUD chip (icon + goal) stays top-left.
5. **Grace (2:15-2:45).** Everyone spawns spread around the square. Kills are disabled for 30 s. One pre-placed static clue glows beside the well: holding E for 2 s collects it and the Notebook opens with "Footprints, long stride: Tall", teaching the collect verb and the trait icon. Toasts: "Shift to sneak", "Hold E on a glowing clue", "B at the bell calls a meeting".
6. **First house (3:00).** You walk to The Drowned Lantern. Others see the door swing for 3 s and your sprite step in; the scene fades 0.4 s to the bar interior with camera follow. A second door leads to the back room, another scene, with a wardrobe (hiding spot) and a trapdoor that is boarded at this party size. Outside the lane you can see the forest gate and, beyond the gate, the forest scene with the cave mouth.
7. **First body (4:30).** Night falls (10 s vignette, then an 80 s night with a 3.5-tile light radius). Somewhere a scream pulses at your screen edge with a direction arrow and a log line "A scream from the north". The Killer carries Blood for 60 s and walks to the well to wash. You find the body in the apothecary loft: E reports it; everyone teleports to the square; the body stays where it was.
8. **First vote (4:45-6:30).** The meeting shows portraits and trait icons, not world sprites. The board already lists every Verified entry (none yet, unless the Detective was first on the scene) and a per-player row: "fits 1/1 known traits, Claimed 0, last house: Apothecary". You can Present one Claimed Notebook entry. Tapping a portrait offers "I saw [X] at [Apothecary] around [3:40]" posted as one chat line. Discussion is 60 s at 5 players; voting opens immediately; the meeting ends early once everyone has voted. Votes are secret until the reveal. The tally shows names; an ejected player's role is revealed; 15 s of immunity follow, everyone spread around the square, and the phase resumes.
9. **The rest of the match (6:30-16:00).** Two to four more cycles of day, night, bodies and meetings; typical match 12-18 minutes. Ghosts see every role, read the Cabal and ghost channels, finish their own tasks and vote a non-binding "ghost suspect" shown on the end screen.

## 3. Game design

### 3.1 Factions, traits and roster

Factions: **Village** (blue, shield), **Cabal** (red, dagger; Killer and Accomplice know each other), **Neutral** (amber, mask). Clients never receive another player's role.

**Traits.** Each player is dealt a unique triple from 27 combinations: **Height** S/M/T (sprite scale 0.9/1.0/1.1, feet-anchored), **Scarf** red/green/blue (tinted overlay; the nameplate repeats it as a shape: diamond/circle/square), **Hat** cap/bowler/bare (overlay sheet, silhouette-readable from above). The boot trait from the earlier draft is dropped because a boot is 6 px at shipping scale. Traits appear on the role card, the HUD chip tooltip and the meeting roster.

| Players | Cabal | Village specials | Neutral | Townsfolk | Note |
|---|---|---|---|---|---|
| 4 | Killer | Detective | – | 2 | Practice: lobby warning, no ranking |
| 5 | Killer | Detective, Doctor | – | 2 | Real minimum |
| 6 | Killer | Detective, Doctor, Butler | – | 2 | |
| 7 | Killer, Accomplice | Detective, Doctor, Butler | – | 2 | |
| 8 | Killer, Accomplice | Detective, Doctor, Butler, Child | – | 2 | |
| 9 | Killer, Accomplice | Detective, Doctor, Butler, Child, Ranger* | – | 2 | *Townsfolk until the Ranger ships (V1.5) |
| 10 | Killer x2, Accomplice | Detective, Doctor, Butler, Child, Ranger* | Drifter | 1 | |

Townsfolk never fall below 1. The table is `roles.json`; the rules engine reads it, no document restates it. Lobby toggles (Thief, Medium, faction-only reveal) are V1.5.

### 3.2 Role cards

| Role | Win | Start kit | Abilities (max 3) | Card text | Beware |
|---|---|---|---|---|---|
| **Killer** (Cabal) | Parity (6+), or living Village <= 1 (4-5), or Final Night vote fails | Knife (bound), Skeleton Key, Bloody Rag x2, Bucket | **Kill** (CD by table; resolved on the validated tick; spawns clues; you gain Blood 60 s). **Lock door** (6+ players only; outside only; 3 s; expires after 45 s; 20 s CD). **Drag body** (hold E, 50% speed; into a body spot = hidden; leaves a drag smear). | Strike when the room is empty, clean one clue, wash at the well, then be the loudest voice asking who did it. | Clues match your traits; Blood is visible within 3 tiles; the Child's silhouette; a Bandaged target voids your kill. |
| **Accomplice** (Cabal) | As Killer | Plant Kit x3, Crowbar, Forged Alibi (V1.5) | **Plant Clue** (60 s CD): a footprint or thread with chosen traits. **Crowbar**: break a locked door (5 s, noise 10). **Inherit**: when the last Killer dies or is ejected the Knife passes to you (kill CD +10 s, Hunger starts at once). | You never hold the knife, only the alibi. Forge trails, break the right doors, vouch at the right moment. | Inspect marks plants Forged; a Forged entry tells the village an Accomplice exists. |
| **Detective** (Village) | All Cabal dead or ejected | Magnifier, Notebook, Lens x3, Fingerprint Kit | **Inspect** (3 s, 1 Lens; +1 Lens per meeting, max 3): reveals a clue's hidden attribute, exposes forgeries, marks it Verified. **Dust / Compare**: lift a print (2 charges) and compare any two: Match / No match. | Collect, inspect, cross-reference. Your Verified clues narrow the board; the village does the rest. | Prime target; the Rag erases clues; forgeries cost Lenses; Compare never gives a name. If you die the Magnifier drops and anyone can Inspect in 6 s. |
| **Doctor** (Village) | Village | Medkit x2, Bandage x2, Salts x1 | **Bandage** (60 s CD, not self): the target survives the next kill attempt within 60 s; both are knocked back, the target's screen blacks out 1.5 s and gets the attacker's height as a Claimed entry; witnesses within 3 tiles get height + scarf as Claimed; the attacker still gains Blood. **Autopsy** (8 s): time of death +/-45 s and cause (knife / wolf), posts Verified. **Salts**: cure Wounded or Snare. | Keep people alive and read the dead. Your autopsy says when; that is what breaks alibis. | Two-Killer games outpace your bandages. |
| **Butler** (Village) | Village | Master Keyring, Candle x2 | **Lock / Unlock** any house door instantly (10 s CD; locks keep people out, never in). **Ledger**: at each meeting, privately lists for each living player the last house they entered this cycle (house only, no time). | You know every door in Hollowmere. Control the wings, read the ledger, say who went where. | Universal access makes you the obvious suspect; Skeleton Key use looks like yours. |
| **Child** (Village) | Village | Slingshot, Chalk, Candle | **Silent hide** (instant, no noise; adults cannot Check a crawlspace). **Witness** (passive): with line of sight within 6 tiles of a kill, "The Child saw it" posts height + scarf as Verified at the next meeting. **Slingshot**: 1 s stun (30 s CD). | You are small and quiet. Hide, watch, remember. | Top kill target; vision -1 tile; cannot pick up items. |
| **Townsfolk** (Village) | Village | Lantern, Pocket Watch, Chalk, Rope | **Tasks**. **Chalk**: floor marks visible to all. **Rope**: free a snared player. Two Emergency Bell pulls per match (others have one). | Do your chores with others to build alibis, mark what you see, vote with evidence. | Weak alone; strong in pairs. |
| **Drifter** (Neutral) | Get ejected (solo win; match continues) | Replica Knife, Bloody Rag x1 | **Act Shifty**: fake noise rings (20 s CD). **Fake Blood**: 30 s (1 use, world only; meetings show portraits). | You want to hang. Be suspicious enough to be voted out, not so obvious they ignore you. | A calm village; dying to the Killer is a loss; counts as nobody for parity. |
| **Ranger** (Village, V1.5) | Village | Crossbow + 2 Bolts, Snare x2, Torch | **Shoot** a wolf: it dies. **Arrest** (1 bolt on a player): the target is cuffed and dragged to the square; the next meeting opens with them as a Case Closed suspect. **Snare**: holds 4 s and logs the name. | You hunt wolves. One arrest per match: be right. | Bolts are loud (noise 10). |
| **Thief** (Neutral, V1.5) | Escape by the cave sea exit holding 3 Heirlooms | Lockpicks x5, Sack, Smoke Bomb | Pickpocket (40 s CD), Lockpick (2 s, noise 5), Smoke (4 s). | Nobody's hero. | Thefts look like Killer activity; counts as Village for parity. |
| **Medium** (Village, V2) | Village | Seance Chalk, Candle x3 | Seance at a body (8 s): the ghost picks 1 of 8 phrases. | You hear the dead. | Cabal ghosts may lie. |

### 3.3 Match loop

| Phase | Trigger | Duration |
|---|---|---|
| Lobby | Leader creates party; Start at >= 4 | – |
| Role reveal | Server deals roles and traits | 12 s, then 3-2-1 |
| Grace | Spawn spread around the square; kills disabled; guided clue | 30 s |
| Day | Free roam, tasks; light radius 7 tiles | 110 s |
| Dusk | Vignette, "Night falls in 10 s"; missing-person check | 10 s |
| Night | Light radius 3.5 tiles; wolves active | 80 s |
| Meeting: discussion | Body report, Emergency Bell, or missing-person roll-call | 60 / 75 / 90 s (4-5 / 6-7 / 8-10) |
| Meeting: vote | Open from the first second; ends early when all living players have voted | 25 s after discussion |
| Reveal | Tally with names; ejected role revealed | 8 s |
| Immunity | No kills, no noise; everyone spread at the square; phase resumes | 15 s |
| Final Night | End of cycle 5 without a winner | 90 s hunt + forced vote |

A cycle is 200 s; a 12-18 minute match is 3-5 cycles with meetings. Doors, locks, bodies and clues persist across phases. All timers are tick-based (20 Hz) in state and rendered through a server-time offset.

**Missing-person roll-call.** At each Dusk the server checks for (a) a dead player whose body has been unreported for a full phase, or (b) a living player no other player has shared a scene with for a full cycle. If either holds, a meeting opens with "X has not been seen" on the board. A Killer who hides every body still faces a meeting.

### 3.4 Investigation and clues

A knife kill spawns, server-side: the Body; **2 of the 3 trait clues** (seeded choice; the first body of the match always spawns 2 trait clues and a Dust-able print); a fingerprint on the body; Blood on the killer; and for a dragged body a **drag smear** from kill tile to spot.

| Clue | Reveals | Decays | Reader |
|---|---|---|---|
| Body | Cause headline; report starts a meeting; hidden bodies scream again when Checked | Never | Anyone |
| Footprints (5-tile trail toward the exit; stride spacing) | Height | 90 s (Ranger 180 s) | Anyone |
| Thread on a door or furniture | Scarf colour | Persists | Anyone |
| Snagged felt on the exit door frame | Hat | 1 cycle | Detective (Dust) |
| Blood on the killer's sprite | "Bloody" within 3 tiles | 60 s, or a 3 s wash at the well or a basin, leaving a Wet Bucket clue for 90 s | Anyone |
| Fingerprints (last 3 touchers of doors, items, bodies, kept server-side) | Match / No match | 1 cycle | Detective (Compare) |
| Drag smear | Trail to the body spot; Verified when Inspected | 1 cycle | Anyone |
| Time of death | +/-45 s | – | Doctor |
| Silhouette | Height + scarf | – | Child |
| Ledger | Last house entered per player | Per meeting | Butler |
| Dropped items | The dead player's inventory | Never | Anyone |

Wolf kills spawn Fur and Claw Marks, no footprints. Collecting: stand on a clue, hold E 2 s; it enters the Notebook with trait, scene and time. The Rag erases 1 clue (3 s, noise 4). Plants are indistinguishable until Inspected. When two different players collect the same physical clue it becomes **Corroborated** and counts as Verified for the suspect set; Townsfolk therefore have a deduction verb.

**Case Board.** Verified and Corroborated entries are posted automatically; each living player may Present one Claimed entry. The board renders a per-player summary row (fits n/m known traits, Claimed count, last house) rather than raw entries. The server intersects the Verified traits of each body against living players' traits and shows **Suspects: A, B** when the set is 3 or fewer. A suspect's own vote is void and a tie ejects them only when the set is exactly one player and was built from two bodies, or from a Child silhouette plus one Verified trait. Forged entries discredit nobody; they display "Forged: an Accomplice is in play".

### 3.5 Items and tasks

Inventory: 5 slots, Q drops, everything drops on death; role-bound items never drop except the Magnifier (drops as a 6 s Inspect for anyone); an ejected Village role's kit goes to a chest at the square.

| Item | Effect | Ships |
|---|---|---|
| Knife, Skeleton Key (3 s, noise 5, leaves a print), Master Keyring | Kill; open any locked door; lock/unlock any door | V1 |
| Bloody Rag, Bucket | Erase one clue; wash Blood at water | V1 |
| Plant Kit, Crowbar | Fake trait clue; break a locked door (door stays broken) | V1 |
| Magnifier, Notebook, Lens, Fingerprint Kit | Inspect; auto-log; charges; Dust and Compare | V1 |
| Medkit, Bandage, Salts | Heal 1 HP; kill immunity 60 s; cure status | V1 |
| Lantern, Candle | Carried light radius 4 / 2; wolves flee light within 4 tiles; off = stealthier | V1 |
| Pocket Watch, Chalk, Rope | Time; floor marks; free a snared player | V1 |
| Oil, Wrench, Planks, Letter, Log | Task deliverables fetched from other scenes | V1 |
| Forged Alibi, Handcuffs, Crossbow kit, Lockpicks, Smoke Bomb, Heirlooms | V1.5 kits | V1.5 |

**Tasks.** Village players get 3-5 tasks; the global bar at 100% wins. Each needs a tool from another scene: Light the lanterns (Oil from the tavern back room, night only), Fix the well pump (Wrench from the apothecary loft), Deliver a letter (house to house), Mend the fence (2 Planks from the forest edge on the overworld side of the fence; while mended, wolves cannot enter the village). Co-op task (Shutter the windows): both players within 2 tiles of the node holding E for 4 s; progress pauses when one releases. Two-player carrying is V1.5. Completing a task writes a Claimed alibi entry (time + scene). Cabal see a fake list that writes entries but never fills the bar. Ghost task completion counts 100% but ghost contribution is capped at 25% of the bar.

**Communication.** No voice in V1. Global text chat in meetings. Outside meetings: an 8-phrase quick-chat wheel (Follow me / Where were you? / I saw something / Help! / Clear / Suspicious / Wait / Go) as speech bubbles within 5 tiles, plus world pings. Cabal channel and ghost channel are sent per-recipient by the server; the client never chooses a channel. Proximity text chat is a V1.5 toggle.

### 3.6 PvE

Players have 2 HP, regenerating 1 per 90 s; the Knife does 2. At 1 HP you are **Wounded**: 0.8x speed and a drip trail for 20 s. **Wolves** (3, forest interior loops, night): 1 damage, chase unlit players, flee any lantern or candle within 4 tiles, die to one bolt, blocked by a mended fence; a broken fence pulls one wolf into the village at night (the Cabal's reason not to mend it). The forest gate has a 6-tile safe clearing. V1 has no well fall and no bear traps. V1.5: bear traps placed by the Ranger, well ladder to the cellar with a Shove verb. V2: the Beast and Cave Gate, bats, bog lurker, crows.

### 3.7 Stealth, hiding and doors

Vision 7 tiles by day, 3.5 at night, Child -1; sneaking (Shift) is silent at 60% speed. Noise radii in tiles: walk 2, run 6, door 4, kill scream 8, rag 4, skeleton key 5, crowbar 10, bolt 10; noise renders as a screen-edge pulse with a direction arrow and a log line, crossing a portal at 50% radius and re-emitting at the paired portal. In V1 the server encodes a player's position only to clients in the same scene; the darkness radius is a client-side mask. Radius + occluder visibility is V1.5 (same `Visibility.ts` policy, different predicate).

**Hiding spots** (wardrobe, hay pile, under bed, barrel; crawlspaces for the Child) hold one player; **body spots** (cellar dump, crypt niche, hay pile) are separate objects. Entering takes 1 s, noise 2; the hidden player sees a slit view and keeps one action, **Burst Out** (E): instant, stuns the Checker 1 s, noise 6. **Check** (E, 2 s) opens a spot; a Check on an occupied spot writes a Verified Notebook entry for the hider ("X opened my wardrobe at 3:12"), so checking is evidence.

**Doors** have four server states: open, closed, locked, broken. Any door unlocks from the inside for anyone. Killer locks expire after 45 s. From outside you see the door swing for 3 s; the entering player is in a 0.6 s `transit` state, encoded to both scenes at the door with the nameplate hidden.

**Death and ghosts.** Dead and ejected players become ghosts: walk through walls and portals (no lock, phase or alive checks, no noise), see all roles, read the Cabal and ghost channels, finish their own tasks, and once per cycle use a Wisp (flicker a lantern, rattle a door for noise 2, or nudge a clue 1 tile; V1.5). Ghosts cast a non-binding ghost vote shown on the end screen.

### 3.8 Meetings, voting and win conditions

- **Village** wins when all Cabal are dead or ejected, tasks reach 100%, or the Final Night vote ejects a Cabal member.
- **Cabal** wins at parity (living Cabal >= living Village; Thief counts as Village, Drifter as nobody) at 6+ players; at 4-5 when living Village <= 1; or when the Final Night vote ejects nobody or a non-Cabal player.
- **Final Night** (cycle 5 without a winner): night lighting, wolves roam the village, Cabal kill CD 20 s, 90 s hunt with clues still spawning, then a forced vote with no Skip and the Case Board open; a tie ejects nobody and Cabal wins.
- Tie or Skip majority: nobody ejected. After two consecutive no-ejection meetings (Drifter ejections count as none) the next vote has Skip disabled and ejects only a player holding at least ceil(living/3) votes; otherwise nobody is ejected and the next cycle has no grace.
- **Hunger**: a Killer with no kill in 2 full cycles leaves glowing footprints until they kill.
- Disconnect over 60 s = death with cause "vanished" and a body at the last position; reconnection within 60 s resumes the same role.
- No Clue Surge. A wrong ejection adds 15 s to the next discussion instead.

### 3.9 Balance by player count

| Players | Cabal | Kill CD | Discussion | Tasks each | Extra rules |
|---|---|---|---|---|---|
| 4 (practice) | 1 | 60 s | 60 s | 3 | No Killer Lock; Cabal needs living Village <= 1 |
| 5 | 1 | 60 s | 60 s | 3 | As above; Doctor added |
| 6-7 | 1 (+Accomplice at 7) | 35 s | 75 s | 4 | Butler on; Lock on |
| 8-9 | 2 | 30 s | 90 s | 4 | Child silhouettes |
| 10 | 3 (2 Killers + Accomplice) | 40 s each, 15 s global lock | 90 s | 5 | Suspect sets decide |

Snowball guard: when living Village <= Cabal + 2, kill CD +10 s and the next kill spawns all 3 trait clues; when only one Killer remains with >= 6 alive, kill CD -5 s. All of these are `balance.json` values; the first playable ships plain plurality with Skip and enables the anti-stall rules one per playtest.

### 3.10 V1 cut list

**First playable (M3, "Mafia with walking")**: lobby, 5-char codes, reconnection in lobby; roles Killer / Detective / Doctor / Townsfolk; traits height + scarf; overworld 40x30 greybox + tavern (2 rooms) + widow cottage (2 rooms) + forest + cave entry; kill, body, Blood tint, two clues, Notebook, Detective auto-Verified; report / bell; meeting with portraits, chat, secret vote, eject + reveal; checkWin; ghosts with ghost chat.

**V1 (beta)**: everything in 3.1-3.9 marked V1: Butler, Child, Accomplice, Drifter; Lens charges, Dust / Compare, Autopsy, Bandage, Ledger, Witness, Plant Clue, Rag, Bucket; Case Board with suspect sets and Corroborated; 4 task types incl. 1 co-op; wolves, fence; hiding spots, Burst Out, Check; door states, Skeleton Key, Crowbar; Hunger, Final Night vote, missing-person roll-call; quick-chat, Cabal and ghost channels; scene profiles Small / Medium / Large; 10-player rules.

**V1.5**: Ranger (Arrest), Thief, Heirlooms, cave sea exit, Handcuffs, Forged Alibi, Candles for all, Wisp, Butler Bell, lit-window silhouettes, proximity chat toggle, faction-only reveal, fisher cottage, lighthouse, lobby role toggles, radius + occluder visibility, Lottie reveal, Light2D experiment, spectator mode.

**V2**: Medium, the Beast and Cave Gate, bats, bog lurker, crows, poison, voice chat, cosmetics; first-person renderer.

## 4. World bible

### 4.1 Setting

**Hollowmere**, a fog-bound harbour hamlet on a northern coast, autumn 1931. The storm closed the only road; the fog hides the sea. Lord Aldous Vane, owner of the shuttered tin mine, died three nights ago and his will names "whoever remains when the last lantern goes out". The flooded lowest gallery leaks "mere-rot" into the marsh, which makes the wolves bold and wakes something in the sea cave (the Beast, V2). Tone: toon-noir, chunky villagers in trench coats and wool caps, wet cobbles, amber lantern light against slate-blue dusk. Landmark NPCs (Mrs Grieves the tavern keeper, Old Fennick at the light, Father Bray, Doc Mallory, Tuck the ferry boy) are environmental storytelling and shop signage in V1; a Grieves tab book that mirrors the Ledger is V1.5. One bell stands on the square: it is the Emergency Bell, the Final Night object and the Butler's remote pull (V1.5). The chapel rope is decoration.

### 4.2 Metrics

`TILE_PX = 64`; 1 tile = 1 m; character render cell 128 px; max standing silhouette 90 px; interiors are authored at 20x11 tiles or larger with camera follow (no whole-room fit). The exporter fails on any tileset whose `tilewidth` is not 64. All radii in rules are in tiles and live in `@wdi/shared/constants.ts`.

### 4.3 Scene graph

Profiles are gated by player count: **Small** (4-6), **Medium** (7-8, adds manor and barn), **Large** (9-10, adds chapel and cellar). Doors of scenes outside the profile render boarded and the portal rejects with `CLOSED`. `zoneId` (visibility, Ledger, noise) is introduced now and equals `sceneId` in V1.

| id | Name | Profile | Size (tiles) | Exits (portal id -> target.spawn) | Player spots / body spots | Notes |
|---|---|---|---|---|---|---|
| `overworld` | Hollowmere | Small (64x48 authored; NW Manor Rise and NE paddock gated shut below Medium) | 64x48 | `ov.tavern_front` -> `tavern_bar.front`; `ov.tavern_alley` -> `tavern_bar.alley`; `ov.apoth` -> `apoth_shop.door`; `ov.widow` -> `widow_parlour.door`; `ov.forest_gate` -> `forest.gate`; `ov.manor_front` / `ov.manor_back` -> `manor_hall.*` [M]; `ov.barn` -> `barn.door` [M]; `ov.chapel` -> `chapel.door` [L]; `ov.well` -> `cellar.well` [L] | hedges, cart, dock crates / – | Square with bell and well; 4 lantern posts; fence line NE |
| `tavern_bar` | The Drowned Lantern | Small | 20x12 | `tb.front`, `tb.alley` -> overworld; `tb.back` -> `tavern_back.door` | behind bar, keg stack / – | Warmest light; task: dartboard letter drop |
| `tavern_back` | Tavern back room | Small | 12x10 | `tk.door` -> `tavern_bar.back`; `tk.trap` -> `cellar.trap` [L, boarded below] | wardrobe / crate pile | Oil barrel (task tool) |
| `apoth_shop` | Mallory Apothecary | Small | 18x11 | `as.door` -> overworld; `as.stairs` -> `apoth_loft.stairs` | behind counter / – | Basin (Blood wash); Wrench on the bench |
| `apoth_loft` | Apothecary loft | Small | 12x9 | `al.stairs` -> `apoth_shop.stairs` | herb loft, under bed / trunk | Near-dark, one green lamp |
| `widow_parlour` | Widow Vane's parlour | Small | 16x11 | `wp.door` -> overworld; `wp.bedroom` -> `widow_bedroom.door` | pantry / – | Portrait turned to the wall; letter box |
| `widow_bedroom` | Widow's bedroom | Small | 12x9 | `wb.door` -> `widow_parlour.bedroom` | wardrobe, under bed / wardrobe | Single candle |
| `forest` | Gallows Wood | Small | 40x30 | `fo.gate` -> overworld; `fo.log` -> `overworld.forest_back` (one-way crawl); `fo.cave` -> `cave_entry.mouth` | hollow trees, brush / – | 3 wolf loops away from the gate; 6-tile clearing; Planks at the edge |
| `cave_entry` | Tin Gallery mouth | Small | 20x14 | `ce.mouth` -> `forest.cave_side`; `ce.sea` boarded (V1.5 Thief exit, low tide on Nights 2 and 4) | stalagmites / pool niche | Bioluminescent moss gives a 2-tile ambient radius |
| `manor_hall` | Vane Manor, hall | Medium | 28x16 | `mh.front`, `mh.back` -> overworld; `mh.stairs` -> `manor_upper.stairs` | wardrobes x2, curtain alcove (off the main sightline) / – | Stopped clock at 11:47; safe |
| `manor_upper` | Vane Manor, upstairs | Medium | 24x12 | `mu.stairs` -> `manor_hall.stairs`; `mu.balcony` -> `overworld.balcony_drop` (one-way, noise 9, 90 s footprints at landing) | under beds, attic hatch / – | Locked study (`key_study` in the cellar [L] or the loft [M]) |
| `barn` | Hale Barn | Medium | 20x12 | `ba.door` -> overworld; `ba.loft` -> `overworld.barn_loft_drop` (one-way) | hay piles x2 / hay pile | Goat bleats (noise 4) when anyone enters |
| `chapel` | St Brannock's | Large | 18x12 | `ch.door` -> overworld; `ch.crypt` -> `cellar.crypt` | confessional / crypt niche | Silent zone: no footstep noise |
| `cellar` | The Undercroft | Large | 28x16 | `cl.well` -> `overworld.well`; `cl.trap` -> `tavern_back.trap`; `cl.crypt` -> `chapel.crypt` | wine racks / dump spot | Pitch dark, 2-tile ambient; gas pockets in marked side alcoves (V1.5) |

V1.5: `cottage_fisher`, `lighthouse` (3 stacked rooms), cave `sea_exit`. All ids, spawn ids and portal ids are frozen in `packages/content/data/scenes/*.json`; V2 reads the same graph.

### 4.4 Overworld sketch (64x48)

```
 N ┌──────────────────────────────────────────────────────────────┐
   │ ~~ forest edge ~~~~~~ [FOREST GATE + clearing] ~~ (hollow log)│
   │ ╔══ MANOR ══╗ [gate M]   lane      [gate M] BARN ─ fence ─ paddock │
   │ ║ back  front║           lanterns x3           goat   (Planks)   │
   │ ╚═════╤═════╝                                                   │
   │ WIDOW ┤        ┌── TOWN SQUARE ──┐                              │
   │ cottage        │ BELL  well  board│──── APOTHECARY (basin)       │
   │                └──────────────────┘                              │
   │ CHAPEL [L] ── graveyard ── TAVERN ─ alley ─ (fisher cottage V1.5)│
   │ (crypt)                    (trapdoor L)                          │
   │          cliff path                 ──── DOCK ─── boats          │
 S └──────────────── sea / fog ───────────────────── (lighthouse V1.5)┘
```

Chokepoints: manor lane, tavern alley, cliff path, forest gate. Loops: square -> alley -> dock -> cliff -> chapel -> square (outer); manor <-> cellar <-> tavern (Large). LOS breakers (hedges, headstones, cart, crates) are occluder tiles in the nav bitmap from V1.5. Layout rule: no walkable tile within 2 tiles north of a building footprint except the door approach; any building sprite overlapping a visible player auto-fades.

### 4.5 Portal rules

One `portals.schema.json` in `@wdi/content` (zod): `id` (`scene.portal`, globally unique), `from`, `to`, `toSpawn`, `kind` (`door|stairs|hatch|drop|crawl|gate|forest_gate|cave_mouth`), `oneWay`, `lock {keyId}`, `window` (`night|lowTide|null`), `noise` (tiles), `elevationDelta` (m), `minProfile`. Spawns carry `x, y, z, facing`. The exporter validates uniqueness and that every `toSpawn` exists; CI fails otherwise. The server owns the graph; the client never decides a transition. Keys are inventory items. One-way drops emit noise 9 and a 90 s footprint trail (height trait) at the landing. Noise crossing a portal is halved and re-emitted at the paired portal as "muffled".

### 4.6 Bestiary

| Creature | Ships | Spawn | Behaviour | Threat | Killer cover |
|---|---|---|---|---|---|
| Mere-wolf | V1 | forest loops (3); 1 enters the village at night when the fence is broken | Patrols; chases unlit players; flees lantern or candle within 4 tiles; dies to a bolt | 1 damage, 2 HP players | Kill in the forest to blame wolves; the knife still leaves a Thread and Autopsy says "knife" |
| Bog-wisp | V1.5 | marsh, cave pools | Lures; blinds light radius 5 s | Nuisance | Blinds witnesses |
| The Beast | V2 | cave, released by the Accomplice or at cycle 4 | 2 hits kill; drawn to light | Lethal to lone players | Cave bodies get Ichor + Drag Marks |
| Crows, rats, gulls | V2 | rooftops, attic, lighthouse | Noise amplifiers | Social | Running = being seen |

### 4.7 Clue placement and lighting

Kill clues are generated by the rules engine, never placed by hand. Static "document" nodes (letters, tab book, confession ledger) produce trait-less Claimed flavour and are V1.5. The grace-phase teaching clue is the only static clue in V1.

Lighting is **baked** in V1 (Path A): a fixed key light parented to the camera for every asset class, no cast shadows, a shared drop-shadow ellipse under every y-sorted object, night as a tinted overlay plus a radial fog-of-war mask with a 25% luminance floor, additive glow sprites for lanterns. Day ambient `#2C3240` at 60%, night `#12141C` at 25%; one warm (`lantern`) and one cool (`moon`) light family per scene. Light2D with normal maps is a V1.5 experiment behind a flag.

### 4.8 Environmental storytelling (V1 set)

Black crepe on the manor door; stopped clock at 11:47; tide chart with the next low tide circled; chalk hopscotch under a lantern; drowned-sailor photos in the tavern; the apothecary's "NOT FOR SALE" shelf with one empty slot; wolf pelt on the barn door; the chapel rope with a torn glove in it; the Widow's portrait turned to the wall; a VANE TIN CO crate half-pried open; a scarecrow in a trench coat; a gravestone with tomorrow's date; muddy bootprints on the manor carpet (static red herring); a drowned lantern still glowing in the marsh fog.

### 4.9 V2 notes

Keep every scene, portal, spawn and clue id; 1 tile = 1 m. Manor floors, the cellar and the lighthouse become real volumes while `zoneId` keeps their visibility and Ledger scope; cottages, tavern, chapel and barn stay portal-loaded. One-way drops become ledges, the hollow log a crouch tunnel, the tide a water volume. Baked sprites are discarded for the original Blender meshes.

## 5. Technical architecture

### 5.1 Versions

| Component | Pin | Note |
|---|---|---|
| Node / pnpm | 22.12+ / 10 | `.nvmrc` 22; `engines.node >= 22.12` |
| Phaser | 3.90.0 (owner decision; see open question 1) | No Phaser-4-only features used; `pixelArt: false` globally |
| Colyseus | `colyseus ^0.18.9`, `@colyseus/core ^0.18.18`, `@colyseus/schema ^5.0.36`, `@colyseus/sdk ^0.18.5`, `@colyseus/testing ^0.18.6` | Never `colyseus.js` |
| Vite / Vitest / Playwright | ^8.3 / ^5.0 / ^1.64 | |
| TypeScript | ~5.9 | 7.x breaks typescript-eslint until 7.1 |
| Blender / Tiled / Audacity | 5.2 LTS / 1.11 / 4.0.1 | Tiled only from M6 |

### 5.2 Monorepo

```
Who-Did-It/
├─ package.json  pnpm-workspace.yaml  .nvmrc  .gitattributes  tsconfig.base.json  eslint.config.js
├─ .github/workflows/ci.yml  pages.yml          # only two workflows
├─ LICENSE (MIT, code)  LICENSE-ASSETS  CREDITS.md  LICENSES/
├─ apps/client/      # Phaser + Vite; base '/Who-Did-It/'; src/{main,net,scenes,view,ui,flags}
├─ apps/server/      # Colyseus; src/{index,rooms/PartyRoom,rooms/handlers,sim/{Step,Commands,Collision,Visibility,Portals},services}
├─ packages/shared/  # @wdi/shared: schema/, protocol/, rules/, constants.ts, metrics.ts, version.ts
├─ packages/content/ # @wdi/content: data/{roles,traits,items,abilities,clues,tasks,balance,metrics}.json, scenes/*.json, zod validators
├─ tools/            # grid/export.ts (ASCII grid -> tilemap + nav), tiled/export.ts (M6), sprites/{placeholder,pack,gen-anims}.ts, blender/{render_rig.blend,batch_render.py,palettize.py}, bots/swarm.ts
├─ assets/source/MANIFEST.md   # masters live outside the repo
└─ docs/
```

### 5.3 Lobby and join-code flow

Create: `client.create("party", { name, build, deviceId })`. `onCreate` draws a 5-char code from the unambiguous alphabet, checks uniqueness with `presence.sadd("wdi:codes")`, sets `this.roomId = code`, `setMatchmaking({ private: true })`, `maxClients = 10`. Join: `client.joinById(code.toUpperCase(), opts)`. Every joinById failure (missing, locked, full, version mismatch) returns one generic "party not found or unavailable"; specific codes exist only inside a room. Released codes keep a 30-minute presence TTL before reuse. The matchmake route sits behind `trust proxy` with a per-forwarded-IP token bucket (30/min, burst 10) and a global cap (300 joinById/min). Start: `players.size >= 4`, phase lobby, leader only; Ready is advisory. Kick, transfer and leader handoff ship in M7; a kicked device is banned by `deviceId` + name for that room.

### 5.4 State schema and role secrecy

Schema 5 builder style, no decorators, every Schema under 63 fields, four privacy classes:

```ts
// packages/shared/src/schema/index.ts (excerpt)
export const Presence = schema({ x: t.int16(), y: t.int16(), z: t.int8(), yaw: t.float32(),
  animId: t.uint8(), statusBits: t.uint16(), transitUntilTick: t.uint32() }, "Presence");
export const Private = schema({ role: Role, inventory: Inventory, notebook: t.array(NotebookEntry),
  tasks: t.array(TaskEntry), cabalMates: t.array(t.string()), cooldownEndTick: t.map(t.uint32()),
  ledger: t.array(LedgerLine), lensCharges: t.uint8(), myVote: t.string() }, "Private");
export const Player = schema({
  id: t.string(), name: t.string(), traits: Traits, alive: t.boolean(), connected: t.boolean(),
  ready: t.boolean(), hasVoted: t.boolean(), sceneId: t.uint8(),          // Public roster
  presence: Presence.view(),                                             // SceneScoped (V1) / Proximity (V1.5)
  priv: Private.view(),                                                  // Own client only
}, "Player");
export const Door = schema({ id: t.string(), state: t.uint8() /*0 open 1 closed 2 locked 3 broken*/, swingUntilTick: t.uint32() }, "Door");
export const SceneState = schema({ doors: t.map(Door), spots: t.map(Spot), bodies: t.map(Body), clues: t.map(Clue), props: t.map(Prop) }, "SceneState");
export const GameState = schema({ schemaVersion: t.uint8(), phase: t.uint8(), phaseEndsTick: t.uint32(), tick: t.uint32(),
  round: t.uint8(), leaderId: t.string(), settings: Settings, taskBar: t.uint8(),
  players: t.map(Player), scenes: t.map(SceneState).view(), meeting: MeetingState, winner: t.uint8() }, "GameState");
```

`onJoin` sets `client.view = new StateView()` and adds the player's own `Player` (so `priv` arrives) and the `SceneState` of its scene. `Visibility.ts` moves `scenes` entries and other players' `presence` in and out of views on scene change (V1) and, in V1.5, by radius + occluder raycast at 5-10 Hz with a +1 tile hysteresis so a sprite has history before it is visible. Role, inventory, notebook and cooldowns are therefore never on the wire for other clients; `animId` uses one shared `swing` id for Kill, Crowbar and Check so the animation never discriminates. Fingerprint toucher logs, Blood timers and Case Board intersections stay in room memory. Votes are stored in `priv.myVote`; only `hasVoted` is public; the tally is published in `voteResult`. The meeting phase, board rows and missing list are in `MeetingState` so a reconnecting client rebuilds the UI from state. A fuzz test diffs the state a non-Cabal bot receives over a scripted kill and asserts no field change correlates uniquely with the killer.

### 5.5 Message protocol

| Dir | Type | Payload | Limit |
|---|---|---|---|
| C->S | `input.move` | `{seq, dx, dy, sprint, sneak}` 20 Hz, one applied per tick (newest wins), vector normalised server-side | 25/s |
| C->S | `act.interact` | `{targetId}` doors, containers, bodies, tasks | 5/s |
| C->S | `act.ability` | `{abilityId, targetId?}` | 5/s |
| C->S | `act.hold` | `{action: drag|collect|task|inspect|autopsy, targetId, on: boolean}` re-validated every tick | 5/s |
| C->S | `act.hide` / `act.check` / `act.burst` | `{spotId}` | 5/s |
| C->S | `act.enterPortal` | `{portalId}` (request/response) | 2/s |
| C->S | `act.reportBody` / `act.bell` | `{bodyId}` / `{}` | 2/s |
| C->S | `act.present` | `{entryId}` | 2/s |
| C->S | `meeting.vote` | `{targetId \| "skip"}` | 2/s |
| C->S | `chat.say` / `chat.quick` / `world.ping` | `{text}` / `{phraseId}` / `{x, y}` (channel derived server-side) | 2/s |
| C->S | `role.ready`, `net.ping` | `{}` / `{t}` | – |
| S->C private | `roleReveal` | `{roleId, team, goal, abilities[{id,name,key,cooldown,uses}], inventory[{defId,qty,tooltip}], cardText, beware, teammates[], traits}` | |
| S->C private | `sceneEnter`, `clueFound`, `killed`, `chat.msg` | `{sceneId, spawn, facing}` / entry / `{sceneId}` / `{from, text, channel}` | |
| S->C | `phaseChange`, `meetingStart`, `voteResult`, `gameOver`, `noise`, `error` | `{phase, endsTick}` / `{reason, callerId, bodyOf?, missing[]}` / `{tally, ejectedId?, role?}` / `{winner, roles, summary}` / `{sceneId, x, y, kind}` / `{code, msg}` | |

Error codes: 422 cannot, 423 locked, 424 cooldown, 425 wrong phase, 426 busy, 427 out of range, 428 closed (profile). `docs/PROTOCOL.md` is generated from `@wdi/shared/protocol`.

### 5.6 Movement, actions and netcode

```ts
// apps/server/src/sim/Step.ts — fixed order inside setFixedTimestep(step, 20, { subSteps: 2 })
export function step(room: PartyRoom, ctx: StepContext) {
  room.state.tick++;
  applyInputs(room);          // exactly one input per client, newest wins, server-normalised, speed table by sprint/sneak/wounded
  moveAndCollide(room);       // swept AABB vs nav bitmap; 250 ms position ring per player
  runCommands(room);          // queued act.* in arrival order: kill, interact, hold, hide/check, present
  runPortals(room);           // synchronous; sets busy/transit, clears inputs, bumps lastInputSeq
  runAiAndHazards(room);      // wolves, decay, clue GC (cap 40 clues per scene, oldest Claimed first)
  if (room.state.tick % 4 === 0) reconcileViews(room);   // Visibility.ts at 5 Hz
  checkPhaseAndWin(room);
}
```

Every C->S action is queued and consumed inside `step()`; nothing mutates state in a message callback. Players have a `busy` state (dying, transit, hidden, channelling) during which actions on or by them are rejected with 426. Kills resolve on the validated tick (the 1 s animation is cosmetic) with range slack of `range + maxSpeed * 0.25 s` against the position ring, same scene, alive, not hidden, not bandaged, and a nav raycast. Held actions are start/stop commands re-validated every tick. `patchRate` 50 ms; the client lerps remote players with a 150 ms delay and teleports a sprite on view add. No client prediction in V1 (lerp only; the local player moves on server echo with input-rate smoothing). Positions are `int16` pixels, enums `uint8`, time is the tick counter. The swarm bot publishes tick-time and patch-size histograms through `/health`; M4 is gated on p95 tick < 15 ms with 10 bots and 3 wolves.

### 5.7 Scene sync

`act.enterPortal` validates distance, lock state, profile and phase, sets `sceneId`, position and the 0.6 s transit, swaps `scenes` view entries and other players' `presence`, and broadcasts a door `swing` plus a noise event. The client `World` scene restarts with the new `sceneId` and loads only that scene's manifest. Meetings run the same transition path for every player (busy, input clear, `sceneEnter` to a spread spawn). After a meeting everyone stays at the square; hiding spots are emptied; bodies stay. Ghosts bypass portal checks and get an all-scenes view flag.

### 5.8 Rules engine

`packages/shared/src/rules`: pure functions with a seeded PRNG (`mulberry32`) and tick-based time: `assignRoles(ids, settings, rng)` reads `roles.json` by count; `dealTraits`; `validateKill(actor, target, scene, tick)`; `generateClues(kill, sceneGraph, rng)` (2 of 3 traits, print, Blood, smear); `resolveVotes(votes, alive, suspectSet, consecutiveNoEject)`; `intersectSuspects(verified, living)`; `checkWin(state)` (parity with Thief/Drifter exceptions, practice rule, tasks, Final Night); `rollCall(state)`. Property tests cover every roster row ("Detective present at 4", counts per size, seed reproducibility). The room only orchestrates: read state, call rule, write state.

### 5.9 Client

Scenes: `Boot` (flags, `/health` poll) -> `Preload` -> `Landing` (DOM) -> `Lobby` (DOM) -> `RoleReveal` (DOM, CSS flip) -> `World` (restart per `sceneId`, camera follow with bounds and 0.1 lerp) -> `Meeting` (launched over a sleeping `World`) -> `GameOver`. HUD, inventory, notebook, chat, board and touch controls are a DOM overlay with `pointer-events: none` except on controls; Phaser draws world prompts and nameplates. `NetworkService` wraps `@colyseus/sdk` with `Callbacks.get(room)`, typed `send` / `request`, a `mitt` bus, and the reconnection token in `localStorage` keyed by room code (cleared on consented leave or game over). `EntityView` maps players and scene entities to sprites; `PlayerView` composes body + scarf + hat + blood overlays and picks `char/<body>/<anim>/<dir>` keys; a shared `dirFromVector(dx, dy)` in `@wdi/shared` with a unit test is the only direction table. Input is timer-driven at 20 Hz, decoupled from rAF, coalesced after `visibilitychange`.

### 5.10 Deployment

- `ci.yml` (push / PR): checkout@v7, setup-node@v7 (22), pnpm via corepack, `pnpm lint && pnpm typecheck && pnpm test`, a dist size report.
- `pages.yml` (main): build the client with `VITE_SERVER_URL` and `VITE_BUILD_VERSION=${GITHUB_SHA::8}` from Actions variables, configure-pages@v6, upload-pages-artifact@v5 (`apps/client/dist`), deploy-pages@v5; Pages source = GitHub Actions; `base: '/Who-Did-It/'`; hash routing.
- **Server host: Railway Hobby ($5/month, always-on, managed wss)** deployed through Railway's GitHub integration with Nixpacks (build `pnpm --filter @wdi/server build`, start `node apps/server/build/index.js`, `NODE_ENV=production`, `WDI_DEBUG` unset). No Dockerfile, no deploy workflow, no staging server, no PR previews. Fallback for early playtests: Render Free with the "waking" landing state. Single process; no Redis.
- `GET /health` -> `{ok, build, rooms, tickP95, patchBytes}`. CORS restricted to `https://groot99-droid.github.io` and localhost. The client pings every 20 s. `BUILD_VERSION` from `@wdi/shared/version.ts` is injected on both sides; mismatches are refused with the generic join error and the client shows "refresh to update".

### 5.11 Security

Every action validated server-side (range, phase, cooldown, ownership, alive, busy). `maxMessagesPerSecond = 100` as a hard cap; per-type token buckets drop rather than disconnect; disconnect only after 3 overflows in 10 s. Names 2-16 characters, server-side profanity list (M7). Chat channels derived from alive status and role; the client's channel field is ignored. Debug handlers register only with `WDI_DEBUG=1` and never in production; a CI test asserts `debug.roles` is absent from a production build. Seeds sent to clients drive cosmetics only. `onLeave` during play spawns a "vanished" body; in lobby it frees the seat.

### 5.12 Testing

Vitest (shared): property tests for roles, traits, votes, suspects, win checks, `dirFromVector`. `@colyseus/testing`: 10 bots join; each sees its own `priv` and nobody else's; a bot in the tavern receives no `presence` for a player in the overworld; start -> `phaseChange`; portal updates `sceneId` and view contents; vote -> `voteResult` with no tally before reveal; drop / reconnect keeps seat and notebook; 11th join and version mismatch refused; 1,000 joinById calls from one IP are throttled; Blood state absent from the meeting roster. Playwright: two contexts create / join / start and both see a role card. `tools/bots/swarm.ts`: random-walk load clients only (no task or report behaviour).

### 5.13 V2 migration path

Stays: server, `@wdi/shared`, `@wdi/content`, lobby, CI, hosting. Changes: renderer (Three.js or Babylon.js), input gains `yaw` (field already reserved), `ISceneCollider` gets a capsule-vs-navmesh implementation, `Visibility.ts` gets a cone + occlusion predicate (the policy hook already exists), `zoneId` diverges from `sceneId` for merged volumes. Gate: V2 starts only when V1 rules tests are green and content JSON is frozen behind `schemaVersion`.

## 6. Asset pipeline & style guide

### 6.1 Palette and style

Tokens in `packages/content/data/palette.json` are the only colours allowed in materials, UI and VFX: ink `#12141C`, slate `#2C3240`, fog `#6F7A8C`, bone `#D9D2C2`, mustard `#F2B33D`, teal `#2EC4B6`, magenta `#E04E9A`, blood `#B3121F`, lantern `#FFB457`, moon `#7FA8FF`. Shadows tint toward slate or moon, never black; saturated accents cover at most 10% of any frame; player bodies use desaturated slate / fog / bone variants so the scarf is the only saturated accent on a player. Proportions: 3 heads tall, oversized hands, block feet, max silhouette 1.4 tiles. Outlines: inverted hull, 1.5 px at shipping scale, `ink`. Interactables pulse teal, hazards magenta. UI: Illustrator vector system, 2 px rounded ink strokes, paper-textured bone fills, mustard primary buttons, Art-Deco card frames; fonts Oswald + Inter (OFL, texts in `LICENSES/`) from day 1 in both Illustrator and the DOM.

### 6.2 Blender render rig

- Blender 5.2 LTS, EEVEE, colour management Standard, `render.dither_intensity = 0`, `film_transparent = True`, Filter Size 1.5, `eevee.use_raytracing = False`, materials `surface_render_method = 'DITHERED'`.
- **Camera: orthographic, rotation X = 40°, Z = 0°** (yaw along +Y; screen up = world +Y). Vertical squash cos 40° = 0.77; a 1 m wall is 41 px tall on screen; a standing 1.7 m villager reads about 90 px. Ground tiles are rendered with a second straight-down camera (X = 0°) so they tile on the 64 px grid; buildings and props are rendered with the tilted camera and their footprints drawn to the straight-down grid.
- Turntable: Empty `TT` at the origin, character parented; direction i sets `TT.rotation_euler.z = -i * 45°`; index 0 = n (facing world +Y, screen up), then ne, e, se, s, sw, w, nw clockwise. Frame regex `^char_(\w+)_(idle|walk|run|interact|swing|carry|die|hide)_(n|ne|e|se|s|sw|w|nw)_(\d{3})$`.
- Lights parented to the camera: sun key az 315° el 55° strength 3 colour `#FFF1DC`; area fill opposite strength 0.6 colour moon; world slate at 0.15; cast shadows off for every asset class.
- Toon material: Diffuse BSDF -> Shader to RGB -> ColorRamp (Constant, stops 0.42 / 0.78) -> Emission; rim via Layer Weight facing 0.35. Outline: Solidify -0.02 m, flipped normals, backface-culled `OutlineInk` emission (-0.035 m for 64 px props).
- Output: 128 px cells rendered directly (no 256 -> 128 step), `frame_step` for 12 fps, overscan 3%. A `Feet` empty is projected per frame into `manifest.json` as the pivot; the packer keeps `spriteSourceSize` so trim is reversible and `gen-anims.ts` writes per-frame origins.
- `render_rig.blend` contains a 1 m checker cube and a 1 m grid plane; `pnpm assets:render -- --smoke` renders the calibration sheet in M0 before any character work.
- `batch_render.py` renders material-override passes through the same rig: body, `scarf` (grey toon-ramped, tinted at runtime), `hat_cap`, `hat_bowler`, `blood` (torso + hands mask). `palettize.py` snaps every imported material to the nearest palette entry and fails on untextured PBR.

### 6.3 Pipelines per asset class

**Characters.** Concept: Higgsfield image generation in character-consistency mode with the hero reference image attached, then its multi-angle mode for a turnaround; save to `assets/source/concepts/`. Mesh: KayKit or Kenney CC0 rigs as block-out, or Higgsfield image-to-3D (low-poly, quad, A-pose, 5-8k tris) cleaned in Blender (decimate <= 6k, flat-shaded, palette material). Rig and clips: Mixamo (idle, walk, run, carry, die) imported with the Mixamo Rig extension; interact / swing / hide posed with Rigify. V1 art = one body, 4 clips (idle 8f, walk 8f, swing 6f, die 8f), 8 directions = 240 frames per pass, 5 passes (body, scarf, 2 hats, blood); run / carry / hide after the M3 gate. Pack with free-tex-packer-core: exporter `Phaser3`, `allowRotation: false`, `allowTrim: true`, `detectIdentical: true`, `pot: true`, padding 2, extrude 1, max 2048², deterministic (sorted inputs). Budget 2 pages for the body, 1 for overlays. Alpha-bleed edge colours in `downscale.ts` to avoid ink halos. Body ids are never role names.

**Buildings and environment.** Kit-bash in Blender from Kenney Fantasy Town / Mini Forest / Modular Cave (CC0) and Poly Haven textures, one `.blend` per building with `Exterior`, `Roof`, `Interior` collections; exterior rendered with roof (`bld_<id>_ext.png`), interiors built as Tiled layers from 64 px tilesets (not single floor sprites) so they share pages and y-sort; hero rugs under 1024² as sprites. Ground tile sets (grass, path, cobble, floorboards, cave rock, forest floor; 4 variants each) rendered straight-down to 64 px cells, seam pass in Photoshop, packed to `tiles_<biome>.png`. Until M6 every scene is an ASCII grid in JSON (`#` wall, `D` door, `S` spawn, `H` hiding spot, `B` body spot) that `tools/grid/export.ts` turns into both the Phaser tilemap and the nav bitmap; Tiled replaces the grid in M6 with the same `.nav.json` contract and layers `ground`, `decor`, `objects`, `collision`, `occluder`, `portals`, `interact`, `spawns`, `lights`.

**Props, items, clues.** World sprites through the rig at 64-128 px, multi-state props as `_open/_closed/_locked/_broken` and spots as `_shut/_open`. Clue variants: footprints x3 heights x3 mud tints, thread x3, felt x3, smear, print, wet bucket, fur, claw, drag smear. Higgsfield 2D output is restricted to UI-only images (notebook pages, portraits, inventory icons) with background removal and a Photoshop defringe; the calibration cube render is attached to every prompt as a reference. Icons: Illustrator 48 px grid, Export for Screens PNG @1x/@2x + SVG.

**UI and role cards.** `WhoDidIt_UI.ai` with artboards per component; nine-slice panels with 24 px margins; one card frame per faction; a static card artboard for the Tab reopen; role portraits 384x576 WebP lazy-loaded by `roleId` after `roleReveal`, upscaled from 512 to 1024 with Higgsfield before downsampling. Reveal animation: CSS flip in V1; After Effects comp (shapes and solid fills only, no mattes or gradients) exported to dotLottie and played by `@lottiefiles/dotlottie-web` at DPR 1, 450x675, with `game.loop.sleep()` while the card is up, in V1.5.

**VFX and audio.** After Effects shape layers to PNG sequences (blood splat 12f, blood pool 8f, smoke 16f, lantern glow 8f, hit flash 4f, dust step 6f, vote stamp 10f) in one 2048² page; rain, fog and embers as 8 px particle emitters. Audio: OGG q5 + M4A 128 kbps, SFX -16 LUFS, music -18 LUFS, Audacity chain Normalize -> Loudness Normalization -> Export. V1: 8 SFX (footstep, door open/close/locked, pickup, scream, bell, vote) from Kenney and Freesound CC0, one ambient loop from a CC0 source; the 30-SFX list, 5 music stems and voice lines are post-beta. Premiere cuts playtest recordings into `PLAYTESTS/` notes and the beta trailer; Higgsfield video makes a 6 s landing loop (WebM <= 2 MB).

### 6.4 Higgsfield prompt guide

Style suffix on every prompt: "stylized toon-noir, chunky low-poly 3-heads-tall proportions, flat two-tone cel shading, thick dark ink outlines, moody night lighting with warm lantern orange and cool moonlight blue, palette #12141C #2C3240 #6F7A8C #D9D2C2 #F2B33D #2EC4B6 #E04E9A, clean solid background, no text." Always attach the hero concept and the calibration cube; re-state "3-heads-tall" and "flat cel" on drift. Prompts: (1) turnaround sheet front/side/back/three-quarter of a villager in a grey vest, A-pose; (2) generic villager body in flat grey for palette swap, no accessories; (3) hunched wolf-shadow with teal eyes, readable from above; (4) house exterior from 40° above with lit windows, night; (5) dim parlour from 40° above, walls cut low; (6) cave chamber with teal moss; (7) tiling forest floor with fog; (8) single prop on plain background (brass key, bloodied knife, oil lantern); (9) hand-written note with a smeared thumbprint; (10) portrait bust in an Art-Deco frame. Image-to-3D: front view from (3) or (8), low-poly quad A-pose, auto-rig for humanoids only, then decimate, re-palette, outline. Scene Builder: block out a scene from prompts (4)-(7), pull the `.blend`, keep proportions and layout only, replace meshes with CC0 kit pieces. Paid plan only; never upload restricted third-party models.

### 6.5 Adobe usage and licensing

- Shipped assets may use only non-beta Adobe generative features and only Adobe's own generative model inside them; each use is logged in `CREDITS.md` (file, feature, date). No Substance 3D Assets or Adobe Stock files are committed, free or not. Adobe Fonts are never embedded; UI uses OFL fonts only.
- Library policy: CC0 by default (Kenney, KayKit, Poly Haven, Freesound CC0 filter, OpenGameArt CC0). CC-BY only with a `CREDITS.md` row (title, author, URL, licence, files). Banned: CC-BY-NC, CC-BY-ND, Synty in any form, Quaternius source packs (rendered sprites derived from them are allowed with a credit; the QAL forbids redistributing the packs), Pixabay audio (no standalone redistribution), raw Mixamo files. Any `.blend` containing Mixamo actions stays in `assets/external/` (gitignored); only rendered sheets are committed, credited as "animations: Mixamo, used under Adobe terms, not redistributed". itch.io packs count as CC0 only when sidebar tag, description and bundled LICENSE agree.
- AI outputs: tool, feature and date per asset in `CREDITS.md`; paid, watermark-free plans only; dated copies of each vendor's terms in `LICENSES/` before the first asset from that vendor lands.
- Root `LICENSE` (MIT, code) and `LICENSE-ASSETS` (original art; see open question 6).

### 6.6 Folder and LFS plan

Day 1 commits `.gitattributes` before any binary: LFS for `*.blend *.psd *.ai *.aep *.fbx *.glb *.wav`, limited to `render_rig.blend` and small rig sources; every master (`.ai`, `.aep`, `.psd`, character `.blend`) lives in Creative Cloud or Drive and is listed in `assets/source/MANIFEST.md` with hash and date. Exports (`apps/client/public/assets/**`) are committed in plain git in batched "art drop" PRs; the deterministic packer keeps unchanged pages byte-identical; CI warns when a PR adds more than 25 MB of binaries. `ci.yml` checks out with `lfs: false`.

### 6.7 V1 asset backlog

| Tier | Asset class | Count | Chain | Hours |
|---|---|---|---|---|
| A (before the M3 gate, cap 60 h) | Palette, metrics, calibration render, rig `.blend` | 1 | Blender | 6 |
| A | Illustrator UI kit: Landing, Lobby, RoleCard frame x3, HUD chip, Notebook, Meeting board, Vote, Touch controls | 8 screens | Illustrator | 14 |
| A | Faction icons, trait icons (3x3), 12 item / clue icons | 24 | Illustrator | 6 |
| A | Base body, 4 clips, 8 directions + scarf / hat / blood passes | 1 body, 5 passes | Higgsfield -> Blender -> Mixamo -> rig | 24 |
| A | Overworld greybox tiles (cobble, grass, path) | 3 sets | Blender straight-down | 6 |
| A | 8 SFX, 1 ambient loop | 9 | Freesound / Kenney, Audacity | 4 |
| B (M6 art pass) | Run / carry / hide clips for all passes | 3 clips | Blender | 10 |
| B | Building exteriors: tavern, apothecary, widow cottage, manor, barn, chapel | 6 | Kenney kit-bash -> rig | 18 |
| B | Interior tilesets and decor for 13 interior rooms | 13 | Blender + Tiled | 24 |
| B | Forest, cave, remaining ground tile sets | 3 | Blender + Photoshop | 12 |
| B | Props incl. 4-state doors, 2-state spots, task props (6) | 30 | Blender | 15 |
| B | Clue variants (footprints 9, thread 3, felt 3, smear, print, bucket, fur, claw, drag) | 21 | Blender / Illustrator | 8 |
| B | Wolf (idle, walk, bite, die) | 1 | Higgsfield 3D -> Blender | 8 |
| B | Role portraits x9 + static card states | 9 | Higgsfield + Illustrator | 8 |
| B | VFX sheets | 7 | After Effects | 8 |
| B | Packing, anims JSON, contact sheet QA | – | Node tools | 8 |
| | **Total** | | | **60 + 119 = 179** |

### 6.8 Budgets

First load (engine ~1.2 MB gz + lobby UI + own card + overworld + body pages + overlays + UI audio) <= 12 MB, target 8 MB; everything else lazy per scene. Per scene <= 2 environment pages of 2048² plus resident character pages; <= 6 pages resident (~100 MB VRAM uncompressed). PNG only in V1; compressed-texture variants only if M6 profiling shows VRAM pressure. Max texture 2048² (query `getMaxTextureSize()`). Sprites per scene <= 10 players + 30 overlays + 6 creatures + 150 props + 200 particles. Audio <= 6 MB in V1. Site <= 150 MB; CI reports dist size per scene manifest and fails above 120 MB.

### 6.9 Higgsfield tool map (verified against the live connector on 2026-10-09)

The pipelines in 6.3 and 6.4 use these concrete tools. Credits quoted are Higgsfield's own notes, not measured here.

| Need | Tool / workflow | How to call it |
|---|---|---|
| Consistent hero concept and turnaround | `character-sheet` workflow, then `generate_image` | Preset `3d-stylized` or `game-concept`, composition `turnaround / model sheet` (front, 3/4, side, back). Crop the sheet to one figure per file before any 3D step; Meshy fuses every figure in a frame into one object. |
| Concept image to rigged, animated GLB | `generate_3d`, model `meshy_v7_image_to_3d` (or `image_to_3d`) | `pose_mode: a-pose`, `should_texture: true`, `enable_pbr: false`, `enable_rigging: true` (humanoids only), `enable_animation: true` with `animation_action_id` (idle 0, walk 30, run 16; search the 678-clip library with `animation_actions`). Pick ONE of `model_type: lowpoly` (faceted look, no budget control) or `target_polycount` 5000-8000 (budgeted). Extra clips: `3d_rigging` on the result GLB, one clip per job. Merge single-clip GLBs with Higgsfield's bundled `glb_merge_anims.py` (fixes the root-bone scale bug) or in Blender through NLA tracks. |
| Better geometry from a sheet | `multi_image_to_3d` | 2-4 views of the same subject in the SAME pose; otherwise fall back to single view. |
| Restyle a good mesh | `meshy_v5_retexture` | Pass the STYLE FORMULA (or its token) as `text_style_prompt`; never regenerate a mesh for colour reasons. |
| Props from text | `meshy_v6_text_to_3d` (`model_type: lowpoly`) or `hunyuan3d_v3_1_text_to_3d` | Prop budget 1-5k tris; filler 0.3-1.5k. |
| Lift one object from a concept | `sam_3_3d` | Static mesh only. |
| Transparent 2D (icons, portraits, decals) | `generate_image` on a key colour, then `remove_background`; `upscale_image` for portraits | Key colour `#FF00FF` by default, `#00FF00` when the subject has pink or purple, `#0000FF` when both are taken. |
| Drive Blender or After Effects from a session | `/use-blender`, `/use-after-effects` local bridges | Only from a LOCAL Claude Code session on the machine that has Blender / After Effects; cloud sessions cannot install them. |

**Style contract.** The style suffix in 6.4 is the project's STYLE FORMULA. It is frozen in `packages/content/data/style.json` with a STYLE TOKEN (at most 120 characters) for length-limited fields such as `texture_prompt`, and inserted byte-identical into every image, texture and 3D prompt. Changing it reopens the art approval gate and invalidates generated assets.

**Why this matters for V2.** The GLB that Higgsfield or Blender produces for a character is rendered to sprites for V1 and loaded directly by the first-person renderer in V2. Keep every source GLB (outside the repo, listed in `assets/source/MANIFEST.md`).

## 7. Production plan

Effort is in focused solo-dev days with AI coding sessions; code uses placeholders until M6. The order is M0 -> M1 -> M2 -> M3 (first playable, "fun or stop") -> M4 -> M5 -> M6 -> M7.

### 7.1 Milestones

| M | Goal | Deliverables | Definition of done | Days | Playtest |
|---|---|---|---|---|---|
| **M0 Scaffold** | Monorepo, two workflows, hello-world on Pages and Railway | pnpm workspaces, tsconfig / eslint / prettier / vitest; `ci.yml`, `pages.yml`; Railway service via GitHub integration; `/health`; `BUILD_VERSION` handshake; `metrics.json`, `palette.json`, `constants.ts`; `.gitattributes`; `docs/` seeded from this plan plus `SPRITES.md` conventions; Day-2 spike proving custom 5-char `roomId` + `joinById`, one `.view()` field hidden from other clients, and `setFixedTimestep`; calibration render of the checker cube | Pages URL shows a Phaser canvas connected to the hosted server printing `{ok, build}`; CI green; spike results recorded in `DECISIONS.md` | 3 | Smoke |
| **M1 Lobby + role cards** | Create / Join by code, Start, private role card | `PartyRoom` create / join / start; `CodeRegistry`; generic join error; phase machine lobby -> roleReveal; `assignRoles` + `dealTraits` with property tests; `Private` view privacy; DOM Landing, Lobby, RoleCard (CSS flip, 12 s, Ready, Tab); deep link `#/join/CODE`; `swarm.ts` join-only bots. Content: `roles.json`, `traits.json`, `items.json` card text | Two browsers create / join; 11th refused; server test proves other players' `priv` is absent on the wire; card read in 20 s by a first-time tester | 4 | 2 people, one on a phone |
| **M2 Movement + one house** | Authoritative movement, scene-scoped sync, portal into a 2-room interior | 20 Hz fixed step with the `step()` order above; one input per tick; command queue; swept AABB; 150 ms lerp; `Visibility.ts` scene-scoped `presence` and `scenes` views; synchronous `Portals.ts` with transit; `World` restart; ASCII grid exporter; 40x30 overworld greybox + tavern bar + back room; keyboard + one touch stick + 3 buttons; HUD chip + timer | 2 humans + 6 bots walk, enter and leave both rooms; test proves outsiders receive no interior data and no cross-scene positions; 60 fps desktop, >= 45 fps on a 2022 mid-range Android; 30 min bot soak clean | 6 | 2-4 people: movement feel, phone controls |
| **M3 First playable: kill -> body -> vote** | The deduction loop, minimal | Kill (CD, range slack, grace, busy), body entity, Blood tint 60 s, Thread + Footprints with hold-E collect, Notebook, Detective auto-Verified; report body / square bell; Meeting scene with portraits, chat, secret vote, early end, eject + reveal; `resolveVotes` plurality + Skip; `checkWin` (all Killers out, parity, practice rule); ghosts + ghost chat; phases grace / day / dusk / night; widow cottage (2 rooms), forest, cave entry greybox; roles Killer / Detective / Doctor (Bandage only) / Townsfolk | Three 5-player matches in a row end in a Village or Cabal win in 10-18 min; vote accuracy and "would play again" logged; **fun-or-stop decision recorded** | 6 | 4-5 humans, two sessions |
| **M4 Deduction depth** | Everything that makes the vote smarter, one feature per playtest | Four PR-sized sub-goals: (a) clues 2-of-3 + prints, Lens charges, Dust / Compare, Autopsy, Rag, Bucket + Wet Bucket, drag smear, Corroborated; (b) Case Board with auto-Verified, Present 1, summary rows, suspect sets, structured accusations; (c) Butler Lock / Ledger, Child Witness, Accomplice Plant + inheritance, Drifter, Bandage knockback rules; (d) tasks (4 incl. 1 co-op, fetched tools, fake Cabal list, bar), Hunger, Final Night vote, missing-person roll-call, no-eject plurality rule. Content: `clues.json`, `abilities.json`, `tasks.json`, `balance.json` | Every V1 mechanic in 3.10 toggled on and tested in at least one session; suspect sets correct in server tests; vote accuracy tracked per feature | 12 | 5-6 humans after each sub-goal |
| **M5 World, stealth, items, PvE** | All V1 scenes and the stealth layer | 14 V1 scenes as grids with profiles and boarded doors; door state machine, keys, Skeleton Key, Crowbar; hiding + body spots, Burst Out, Check evidence; 5-slot inventory; noise with portal halving; sneak / run; lanterns and candles; quick-chat + pings; wolves, fence task, Wounded; 10-player rules and snowball guard; clue GC and tick budget gate | Full loop square -> house -> forest -> cave -> square with locks and hiding; 10 bots + 3 wolves at p95 tick < 15 ms; 8-player match with wolves reports "wolf" kills correctly | 11 | 6-8 humans: stealth and night |
| **M6 Art pass** | Replace placeholders with Blender renders | `batch_render.py`, `pack.ts`, `gen-anims.ts`, per-frame pivots; overlays and tint; Tiled maps replacing grids with decor and occluder layers; building and interior renders; UI from Illustrator; VFX; CREDITS complete | Every placeholder key resolved by a shipped atlas; first load <= 12 MB; <= 6 pages resident; 45 fps on the test Android; contact sheet reviewed | 10 code + Tier B art hours | 4-6 humans: trait and Blood readability at night |
| **M7 Polish + beta** | Reconnection everywhere, mobile, balance, public link | 60 s mid-match reconnection with notebook resync; "vanished" bodies; leader handoff, kick, transfer; profanity; rate limits; UI scale 200%, colour-blind check, reduce-motion; tutorial toasts; telemetry JSON lines; balance pass from data; Playwright e2e; README | Three consecutive 8-10 player public sessions without a room crash; reconnect success >= 95%; "would play again" >= 7/10 | 8 | 10-person stress, two public betas |

Total about 60 focused code days (15 weeks at 4 days per week) with the first roles-on playtest at day 19 and Tier A art (60 h) in parallel from day 1; Tier B art (119 h) starts only after the M3 verdict.

### 7.2 Parallel tracks

| Track | Starts | Blocks on | Day-1 items |
|---|---|---|---|
| Code | Day 1 | nothing | scaffold, spike, lobby |
| Content (JSON) | Day 1 | GDD only | `roles.json`, `traits.json`, `items.json`, `scenes/*.json` ids, `tasks.json`, `clues.json`, `balance.json`; rules tests consume these before any map exists |
| Art | Day 1 | `metrics.json`, `SPRITES.md`, palette | calibration render, Illustrator kit, faction / trait icons, hero concept, base body |

Rule: art lands in `apps/client/public/assets` under keys the placeholder manifest already uses; code imports manifest keys, never paths; `?art=placeholder` keeps playtests running if a render breaks.

### 7.3 Placeholder strategy

Characters: a generated placeholder atlas (`tools/sprites/placeholder.ts`) with all 8 directions and the final animation keys, drawn as a capsule scaled by height, a scarf rectangle tinted R/G/B, a hat shape, a nameplate with the scarf shape icon; `PlayerView` logic is final from M2. World: Kenney Roguelike / Tiny Town 16 px tiles scaled x4 with nearest filtering set per key from the manifest `filter` field; doors as four-state coloured rectangles. Clues and bodies: coloured circles with a letter plus the final `clue_<id>` key. UI: DOM + CSS with palette tokens and Oswald / Inter. Audio: Kenney UI packs under the final SFX keys.

### 7.4 Risk register

| # | Risk | L | I | Mitigation |
|---|---|---|---|---|
| 1 | Hosting cold start ruins the first impression | H | M | Railway Hobby always-on; `/health` "waking" UI if Render is used |
| 2 | WebSocket blocked on school / corporate networks | M | H | wss on 443 only; hotspot advice in the error; documented limit |
| 3 | Role or position leak via synced state | M | H | Four privacy classes, view-scoped presence, fuzz test, no roles in logs or metadata |
| 4 | Scope creep (12 roles, 14 scenes) | H | H | M3 gate; V1.5 list frozen; one new mechanic requires one removal or a GDD change entry |
| 5 | Art style drift across Higgsfield / Blender / Kenney | H | M | Hero reference + calibration cube in every prompt; `palettize.py`; auto contact sheet from `pack.ts` |
| 6 | Cannot gather testers | H | M | Game designed to be fun at 4-5 humans; bots are load clients only; Discord playtest channel |
| 7 | Mobile performance | M | H | Baked lighting, 2048² pages, FPS overlay, real Android test each milestone |
| 8 | Licensing (Synty, Mixamo raw, NC, Pixabay) | M | H | Policy in `ASSETS.md`; CREDITS row in the PR template; masters outside the repo |
| 9 | Framework APIs behave differently from the write-up | M | M | Day-2 spike; in-memory role Map fallback; lerp-only netcode |
| 10 | Browser audio autoplay | H | L | Unlock on the Create / Join click; visual twin for every sound |
| 11 | Rubber-banding | M | M | 150 ms lerp, no prediction, swarm bot tick metrics |
| 12 | Deduction too certain or too weak | M | H | 2-of-3 clues, Lens charges, suspect sets; metrics from M3; all knobs in `balance.json` |
| 13 | Reconnection edge cases | M | M | State-driven UI; server tests per phase; 60 s window |
| 14 | Pages bandwidth / size | L | M | Budgets in 6.8; CI size report |
| 15 | Burnout in M4 | M | H | Four demoable sub-goals; each shipped behind a toggle |
| 16 | Tick budget on a shared vCPU | M | M | int16 positions, uint8 enums, 5 Hz view reconcile, clue GC, p95 gate before M4 |

### 7.5 Playtest plan

| Tier | When | Setup | Goal |
|---|---|---|---|
| Bot-only | every PR from M2 | `pnpm bots --n 9` | crashes, tick p95, patch size, memory over 1 h |
| 2-person | M1, M2 | owner + 1 friend, one on a phone | onboarding, controls, portal feel |
| 4-5 humans | M3, each M4 sub-goal | friends via Discord | is the vote fun; clue readability; meeting length |
| 6-8 humans | M5, M6 | friends + bots as load only | stealth, night, PvE |
| 10-person | M7 | 6 humans + 4 bots, then 10 humans | suspect sets in 2-Killer games, chat spam, load |

Metrics per match (server JSON lines): phase durations; kill -> report time; unreported bodies; clues collected per player; Inspect / Compare uses; vote accuracy; suspect-set correctness; chat lines per player; disconnects and reconnect success; FPS percentiles by device class; match length and winner by player count. Feedback form after each session: role played; "understood my role in 20 s" 1-5; "I knew where to go"; "the vote felt fair"; most confusing moment; phone or desktop; would play again 1-10; one thing to add, one to remove.

### 7.6 Workflow

`main` is always deployable and protected by CI. One branch per milestone task (`m4a/clues-and-lenses`), one AI session per branch scoped to a single task prompt from `ROADMAP.md`, PRs under 400 lines with tests for rules changes and a GDD note when behaviour changes. Squash-merge; tag `v0.<milestone>.<n>` at milestone exit. `pnpm docs:balance` regenerates `BALANCE.md` from `balance.json` and the PR template has a "docs updated" checkbox; there is no CI grep gate, no changelog automation and no preview deployments until a second contributor exists. Sessions never upgrade dependencies.

### 7.7 Day 1 to Day 14

| Day | Work |
|---|---|
| 1 | Repo init, `.gitattributes`, pnpm workspaces, tsconfig / eslint / prettier / vitest, `@wdi/shared` with `version.ts`, `constants.ts`, `metrics.ts`; `@wdi/content` with `palette.json`, `metrics.json`, zod; `docs/` seeded; LICENSE files. Art: pin palette, write the hero prompt, start the rig `.blend` |
| 2 | Spike package: custom `roomId` + `joinById`, hidden `.view()` field, `setFixedTimestep`; record results. `apps/server` with `defineServer`, `/health`; `apps/client` Vite + Phaser Boot; `ci.yml` |
| 3 | `pages.yml`; Railway service via GitHub integration; CORS; version handshake; calibration render. **M0 exit** |
| 4 | Schemas (`Player`, `Private`, `Presence`, `GameState`, `Settings`); `PartyRoom` create / join; `CodeRegistry`; generic join error; tests for 11th join and version mismatch |
| 5 | Landing + Lobby DOM; join by code and deep link; Start gating with the confirm dialog |
| 6 | `roles.json`, `traits.json`; `assignRoles` + `dealTraits` with property tests; privacy test |
| 7 | Role card: `roleReveal` payload, DOM card with CSS flip, trait line, 12 s, Ready, Tab; join-only bots. 2-person test. **M1 exit**, tag `v0.1.0` |
| 8 | ASCII grid exporter -> tilemap + nav bitmap; 40x30 overworld greybox; collision loader shared by both sides |
| 9 | Fixed step with the `step()` order; one input per tick; command queue; swept AABB; client input at 20 Hz; placeholder atlas generator |
| 10 | `EntityView` / `PlayerView`, 150 ms lerp, teleport on view add; nameplates; HUD chip + timer |
| 11 | `Portals.ts` synchronous with transit; `Visibility.ts` scene-scoped views; `sceneEnter`; `World` restart; tavern bar + back room |
| 12 | Touch stick + 3 buttons, resize; FPS overlay; test "outsider never sees interior or cross-scene positions" |
| 13 | 30 min bot soak; Android check; fixes |
| 14 | 2-4 person test; **M2 exit**, tag `v0.2.0`; `PLAYTESTS/` entry; M3 task prompts |

### 7.8 V2 outline

After the V1 beta: (1) 3D `ISceneCollider` from Blender navmesh exports; (2) `input.move` uses `yaw`; (3) cone + occlusion visibility predicate; (4) Three.js or Babylon.js renderer loading the same GLB sources used for the sprite renders; (5) Medium, the Beast, bats, spatial audio, voice chat. Gate: V1 rules tests green and content JSON frozen behind `schemaVersion`.

## 8. Decisions & changes from review

1. **One source of numbers.** `GDD.md` and `balance.json` own every value; `WORLD.md` keeps geography, ids and lore only; `ARCHITECTURE.md` points at `roles.json` instead of restating a roster. The World Bible's 9-minute cycle, automatic dawn meeting, chapel voting room, gate closing, 3-hit wolves, name-revealing fingerprints, bloodhound, wolf-tooth charm, 20% item drop, NPC witnesses, sabotage and beacon rules are removed or deferred to V1.5 / V2.
2. **Metrics locked:** 64 px tiles, 1 m = 1 tile, 128 px character cells, 90 px silhouette; interiors use camera follow; overworld 64x48 with gated districts.
3. **Render rig corrected:** camera X = 40°, Z = 0° (no 45° yaw diamond), straight-down ground tiles, calibration render in M0. Lighting is baked (no Light2D, no normal maps) in V1.
4. **Traits:** boot trait replaced by hat; clue mapping Footprints = height, Thread = scarf, Felt = hat. Overlay passes (scarf, hats, blood) render through the rig for every clip; 10-hue LUT variants dropped.
5. **Scene scope:** 14 V1 scenes with player-count profiles; every V1 house has an internal door to a second scene; cave entry in V1; fisher cottage, lighthouse, sea exit and the Lurker deferred.
6. **Milestone reorder:** first roles-on playtest moved from day 39 to day 19 as "Mafia with walking"; M4 split into four toggled sub-goals; anti-stall rules and Case Board are enabled one per playtest; Tier B art waits for the M3 verdict.
7. **Netcode:** positions and status are view-scoped per scene (V1) with radius + occluder as a V1.5 predicate; four privacy classes in the schema; command queue inside `step()`; synchronous portals; busy / transit states; one input per tick; range slack with a position ring; tick-based time; int16 positions; secret votes; state-driven meeting UI; `localStorage` reconnection token; deviceId bans; generic join errors with proxy-aware rate limits; message cap 100 with dropping buckets; no prediction, 150 ms lerp.
8. **Balance:** 5 is the real minimum, 4 is practice with "Village <= 1" and 60 s kill CD; 2-of-3 trait clues per kill, Lens charges, suspect sets of up to 3 instead of a single name, Magnifier drops on death, Corroborated entries; locks never trap, Killer Lock expires and is off below 6; drag smears, screaming hidden bodies, one bell with per-player pulls, missing-person roll-call; Ledger lists houses without times and Autopsy is +/-45 s; Bandage never reveals a name; meetings show portraits; Final Night is a hunt plus a forced vote; the plurality rule needs ceil(living/3); Accomplice inherits the knife; Clue Surge dropped; ghosts see roles and get a Wisp; 30 s grace with a teaching clue; Ranger bolt becomes Arrest; hiding gets Burst Out and Check evidence; wolves flee any light and only the fence controls them; no well fall in V1.
9. **Process:** two workflows, Railway via GitHub integration with Nixpacks, no Dockerfile, no staging, no previews, no docs grep; kick / transfer / profanity / accessibility moved to M7; bots are load clients only.
10. **Assets and licensing:** masters outside the repo, `.gitattributes` on day 1, LFS only for rig sources, Mixamo and Quaternius sources never committed, Pixabay replaced by CC0, Synty banned, Adobe generative use logged and non-beta only, OFL fonts only, separate code and asset licences; packer `Phaser3` exporter with rotation off; dotLottie only and V1.5; portraits lazy WebP; V1 audio cut to 8 SFX + 1 loop; compressed textures deferred.
11. **Conventions fixed in M0:** `SPRITES.md` frame regex and direction table, one `dirFromVector`, tool paths (`tools/blender/batch_render.py`, `tools/sprites/pack.ts`), atlas keys `char/<body>/<anim>/<dir>` with non-role body ids, portal schema with `zoneId`, co-op task definition and `Entity.carriedBy`.

## 9. Open questions for the owner

1. **Engine line.** The plan pins Phaser 3.90.0 as decided and uses no 4-only features. Phaser 4.2.1 is now the maintained line and the official guidance is to start new projects on it; the switch costs about one M0 day (lighting and tint API names differ) and nothing else in this plan changes. Keep 3.90.0 or move to 4.2.1?
2. **Hosting from day 3.** Railway Hobby needs a card and $5 per month from M0; Render Free is enough for M1-M3 tests if you accept a one-minute wake. Which do you want first?
3. **Hat replaces boots as the third trait** (cap / bowler / bare), with Felt on the door frame as its clue. Approve?
4. **Practice at 4.** 4 players is labelled practice (Cabal needs 3 kills, no ranking) and 5 is the real minimum. Approve, or do you want 4 treated as a full match with the weaker balance?
5. **Higgsfield plan tier.** All generated assets must come from a paid, watermark-free plan; confirm the account tier before the first asset is committed.
6. **Original art licence.** `LICENSE-ASSETS`: All Rights Reserved (safest for a public repo) or CC BY-NC-SA 4.0?
7. **Where masters live.** Creative Cloud or Drive for `.ai`, `.aep`, `.psd` and character `.blend` files (the repo holds only exports and the rig)?
8. **Final Night.** The bell channel is replaced by a 90 s hunt and a forced vote that Cabal wins on a tie. Approve this ending?