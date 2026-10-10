# Game Design Document

> Generated from `docs/MASTER_PLAN.md` (v0.1, 2026-10-10). Owns every rule and number together with `packages/content/data/balance.json`. A behaviour change is not done until this file changes with it.

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
