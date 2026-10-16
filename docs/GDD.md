# Game Design Document

> Generated from `docs/MASTER_PLAN.md` (v0.1, 2026-10-10). Owns every rule and number together with `packages/content/data/` (`@wdi/content`): `balance.json` holds the global and per-player-count values, and each role, ability, item, clue and task record holds its own (a cast time, a charge count), so no number lives in two files. A behaviour change is not done until this file changes with it.

## 1. Vision & pillars

A storm has closed the road and fog hides the sea. Hollowmere is cut off, Lord Vane is dead, and someone among you is still killing. Find them before the last lantern goes out.

Who Did It is a 5-10 player (4 = practice; NPCs fill the seats below 4, see 3.12) hidden-role game played from a link. It crosses Among Us (tasks, bodies, emergency meetings), Mafia (hidden factions, a vote as the climax), a whodunit (physical clues with hidden attributes, a Detective who verifies them) and Hello Neighbor (houses you enter, doors that lock, hiding spots). V1 is top-down 2.5D in Phaser with pre-rendered Blender sprites; V2 is first-person 3D on the same server, rules and world data.

| Pillar | Design rule |
|---|---|
| Every kill tells a story | A knife kill always spawns 2 of 3 trait clues plus a fingerprint and Blood on the killer. Killers manage evidence; they never erase all of it. |
| The vote is the climax | Phases funnel into short meetings. The Case Board turns Verified evidence into a suspect set, never into a name. Ejections reveal roles. |
| Space is information | Entering a house, forest or cave removes you from sight. Alibis are spatial. Nothing inside a scene is sent to anyone outside it. |
| Readable in 20 seconds | One role card, 3 abilities max, canned chat outside meetings, a meeting board that summarises instead of listing. |

## 2. Player experience: the first 10 minutes

1. **Landing (0:00).** `https://groot99-droid.github.io/Who-Did-It/` shows the title over a looping fog plate and two buttons: **Create Party** and **Join Party**. While the server is polled on `/health` the buttons read "Waking the village..." (Render Free fallback) or are live at once (Railway). A name field (2-16 characters) sits above the buttons. Clicking either button unlocks the AudioContext.
2. **Create / Join (0:20).** The leader gets a 5-character code such as `K7PQX` (alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, no 0/O/1/I) plus a share button that copies `.../Who-Did-It/#/join/K7PQX`. Friends paste the code or open the link; the code field is prefilled from the hash.
3. **Lobby (0:40-2:00).** Roster of names with a Ready tick, player count "5/10", a line "Best with 6-8 players" and, at 4, "Practice party: roles on, Cabal needs 3 kills". Start is enabled with at least 1 human (NPCs fill the seats below 4, see 3.12); if someone is not Ready the leader sees a confirm dialog listing them. The settings panel has only `map` (Hollowmere) and `revealMode` (full, locked in V1).
4. **Start and role card (2:00-2:15).** The server deals roles and traits, locks the room and sends each client its private card. The card shows: faction stripe and icon, role name, your sprite with your traits and the line "You look like: Tall / Green scarf / Bowler hat", a one-line goal, up to 3 ability rows with key and cooldown, the inventory strip, 2-3 sentences of card text, a Beware line, and for Cabal the teammate names. It holds 12 s; Ready dismisses it; Tab reopens it; a HUD chip (icon + goal) stays top-left.
5. **Grace (2:15-2:45).** Everyone spawns spread around the square. Kills are disabled for 30 s. One pre-placed static clue glows beside the well: holding E for 2 s collects it and the Notebook opens with "Footprints, long stride: Tall", teaching the collect verb and the trait icon. Toasts: "Shift to sneak", "Hold E on a glowing clue", "E at the bell calls a meeting" (copy ids in `docs/UI.md` 14).
6. **First house (3:00).** You walk to The Drowned Lantern. Others see the door swing for 3 s and your sprite step in; the scene fades 0.4 s to the bar interior with camera follow. A second door leads to the back room, another scene, with a wardrobe (hiding spot) and a trapdoor that is boarded at this party size. Outside the lane you can see the forest gate and, beyond the gate, the forest scene with the cave mouth.
7. **First body (4:30).** Night falls (10 s vignette, then an 80 s night with a 3.5-tile light radius). Somewhere a scream pulses at your screen edge with a direction arrow and a log line "A scream from the north". The Killer carries Blood for 60 s and walks to the well to wash. You find the body in the apothecary loft: E reports it; everyone teleports to the square; the body stays where it was.
8. **First vote (4:45-6:30).** The meeting shows portraits and trait icons, not world sprites. The board already lists every Verified entry (none yet, unless the Detective was first on the scene) and a per-player row: "fits 1/1 known traits, Claimed 0, last house: Apothecary". You can Present one Claimed Notebook entry. Tapping a portrait offers "I saw [X] at [Apothecary] around [3:40]" posted as one chat line. Discussion is 60 s at 5 players; voting opens immediately; the meeting ends early once everyone has voted. Votes are secret until the reveal. The tally shows names; an ejected player's role is revealed; 15 s of immunity follow, everyone spread around the square, and the phase resumes.
9. **The rest of the match (6:30-16:00).** Two to four more cycles of day, night, bodies and meetings; typical match 12-18 minutes. Ghosts see every role, read the Cabal and ghost channels, finish their own tasks and vote a non-binding "ghost suspect" shown on the end screen.

## 3. Game design

### 3.1 Factions, traits and roster

Factions: **Village** (blue, shield), **Cabal** (red, dagger; Killer and Accomplice know each other), **Neutral** (amber, mask). Clients never receive another player's role.

**Traits.** Each player is dealt a unique triple from 27 combinations: **Height** S/M/T (sprite scale 0.9/1.0/1.1, feet-anchored), **Scarf** red/green/blue (tinted overlay in the palette tokens blood/teal/moon; the nameplate repeats it as a shape: diamond/circle/square), **Hat** cap/bowler/bare (overlay sheet, silhouette-readable from above). The boot trait from the earlier draft is dropped because a boot is 6 px at shipping scale. Traits appear on the role card, the HUD chip tooltip and the meeting roster.

| Players | Cabal | Village specials | Neutral | Townsfolk | Note |
|---|---|---|---|---|---|
| 4 | Killer | Detective | – | 2 | Practice: lobby warning, no ranking |
| 5 | Killer | Detective, Doctor | – | 2 | Real minimum |
| 6 | Killer | Detective, Doctor, Butler | – | 2 | |
| 7 | Killer, Accomplice | Detective, Doctor, Butler | – | 2 | |
| 8 | Killer, Accomplice | Detective, Doctor, Butler, Child | – | 2 | |
| 9 | Killer, Accomplice | Detective, Doctor, Butler, Child, Ranger* | – | 2 | *Townsfolk until the Ranger ships (V1.5) |
| 10 | Killer x2, Accomplice | Detective, Doctor, Butler, Child, Ranger* | Drifter | 1 | |

Townsfolk never fall below 1. The table is `roles.json` (`rosters["4".."10"]`, with `deal` for what V1 deals and `planned` for the row above); the rules engine reads it, no document restates it. Lobby toggles (Thief, Medium, faction-only reveal) are V1.5.

### 3.2 Role cards

| Role | Win | Start kit | Abilities (max 3) | Card text | Beware |
|---|---|---|---|---|---|
| **Killer** (Cabal) | Parity (6+), or living Village <= 1 (4-5), or Final Night vote fails | Knife (bound), Skeleton Key, Bloody Rag x2, Bucket | **Kill** (CD by table; resolved on the validated tick; spawns clues; you gain Blood 60 s). **Lock door** (6+ players only; outside only; 3 s; expires after 45 s; 20 s CD). **Drag body** (hold E, 50% speed; into a body spot = hidden; leaves a drag smear). | Strike when the room is empty, clean one clue, wash at the well, then be the loudest voice asking who did it. | Clues match your traits; Blood is visible within 3 tiles; the Child's silhouette; a Bandaged target voids your kill. |
| **Accomplice** (Cabal) | As Killer | Plant Kit x3, Crowbar | **Plant Clue** (60 s CD): a footprint or thread with chosen traits. **Crowbar**: break a locked door (5 s, noise 10). **Inherit**: when the last Killer dies or is ejected the Knife passes to you (kill CD +10 s, Hunger starts at once). | You never hold the knife, only the alibi. Forge trails, break the right doors, vouch at the right moment. | Inspect marks plants Forged; a Forged entry tells the village an Accomplice exists. |
| **Detective** (Village) | All Cabal dead or ejected | Magnifier, Notebook, Lens x3, Fingerprint Kit | **Inspect** (3 s, 1 Lens; +1 Lens per meeting, max 3): reveals a clue's hidden attribute, exposes forgeries, marks it Verified. **Dust / Compare**: lift a print (2 charges) and compare any two: Match / No match. | Collect, inspect, cross-reference. Your Verified clues narrow the board; the village does the rest. | Prime target; the Rag erases clues; forgeries cost Lenses; Compare never gives a name. If you die the Magnifier drops and anyone can Inspect in 6 s. |
| **Doctor** (Village) | Village | Medkit x2, Bandage x2, Salts x1 | **Bandage** (60 s CD, not self): the target survives the next kill attempt within 60 s; both are knocked back, the target's screen blacks out 1.5 s and gets the attacker's height as a Claimed entry; witnesses within 3 tiles get height + scarf as Claimed; the attacker still gains Blood. **Autopsy** (8 s): time of death +/-45 s and cause (knife / wolf), posts Verified. **Salts**: cure Wounded or Snare. | Keep people alive and read the dead. Your autopsy says when; that is what breaks alibis. | Two-Killer games outpace your bandages. |
| **Butler** (Village) | Village | Master Keyring, Candle x2 | **Lock / Unlock** any house door instantly (10 s CD; locks keep people out, never in). **Ledger**: at each meeting, privately lists for each living player the last house they entered this cycle (house only, no time). | You know every door in Hollowmere. Control the wings, read the ledger, say who went where. | Universal access makes you the obvious suspect; Skeleton Key use looks like yours. |
| **Child** (Village) | Village | Slingshot, Chalk, Candle | **Silent hide** (instant, no noise; adults cannot Check a crawlspace). **Witness** (passive): with line of sight within 6 tiles of a kill, "The Child saw it" posts height + scarf as Verified at the next meeting. **Slingshot**: 1 s stun (30 s CD). | You are small and quiet. Hide, watch, remember. | Top kill target; vision -1 tile; cannot pick up items. |
| **Townsfolk** (Village) | Village | Lantern, Pocket Watch, Chalk, Rope | **Tasks**. **Chalk**: floor marks visible to all. **Rope**: free a snared player. Two Emergency Bell pulls per match (others have one). | Do your chores with others to build alibis, mark what you see, vote with evidence. | Weak alone; strong in pairs. |
| **Drifter** (Neutral) | Get ejected (solo win; match continues) | Replica Knife, Bloody Rag x1 | **Act Shifty**: fake noise rings (20 s CD). **Fake Blood**: 30 s (1 use, world only; meetings show portraits). | You want to hang. Be suspicious enough to be voted out, not so obvious they ignore you. | A calm village; dying to the Killer is a loss; counts as nobody for parity. |
| **Ranger** (Village, V1.5) | Village | Crossbow + 2 Bolts, Snare x2, Torch | **Shoot** a wolf: it dies. **Arrest** (1 bolt on a player): the target is cuffed and dragged to the square; the next meeting opens with them as a Case Closed suspect. **Snare**: holds 4 s and logs the name. | You hunt wolves. One arrest per match: be right. | Bolts are loud (noise 10). |
| **Thief** (Neutral, V1.5) | Escape by the cave sea exit holding 3 Heirlooms | Lockpicks x5, Sack, Smoke Bomb | Pickpocket (40 s CD), Lockpick (2 s, noise 5), Smoke (4 s). | Nobody's hero. | Thefts look like Killer activity; counts as Village for parity. |
| **Medium** (Village, V2) | Village | Seance Chalk, Candle x3 | Seance at a body (8 s): the ghost picks 1 of 8 phrases. | You hear the dead. | Cabal ghosts may lie. |

The Accomplice's Forged Alibi is a V1.5 kit item (3.5) and is not in the V1 start kit. Values the table leaves open (decided 2026-10-10, Session C): Kill, Bandage, Salts, Medkit and Rope reach 1.5 tiles; Bandage is instant and knocks both players back 1 tile; Plant Clue takes 2 s; Dust takes 2 s; the Slingshot reaches 5 tiles; Act Shifty's fake rings use the run radius. Universal verbs: Report and the Bell reach 2 tiles; Collect is a 2 s hold. `abilities.json` holds every verb with a number; an item's `use` points at its verb.

### 3.3 Match loop

| Phase | Trigger | Duration |
|---|---|---|
| Lobby | Leader creates party; Start with >= 1 human (NPCs fill to 4, 3.12) | – |
| Role reveal | Server deals roles and traits | 12 s, then 3-2-1 |
| Grace | Spawn spread around the square; kills disabled; guided clue | 30 s |
| Day | Free roam, tasks; light radius 7 tiles | 110 s |
| Dusk | Vignette, "Night falls in 10 s"; missing-person check | 10 s |
| Night | Light radius 3.5 tiles; wolves active | 80 s |
| Meeting: discussion | Body report, Emergency Bell, or missing-person roll-call | 60 / 75 / 90 s (4-5 / 6-7 / 8-10) |
| Meeting: vote | Open from the first second; ends early when all living players have voted | 25 s after discussion |
| Reveal | Tally with names; ejected role revealed | 8 s |
| Immunity | No kills, no noise; everyone spread at the square; then a new day (M3: the day restarts in full and the cycle count rises) | 15 s |
| Final Night | End of cycle 5 without a winner | 90 s hunt + forced vote |
| Game over | Winner, every role, the summary; then the lobby again with the same code and seats | 20 s |

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

Wolf kills spawn Fur and Claw Marks (decay 1 cycle), no footprints. Collecting: stand on a clue, hold E 2 s; it enters the Notebook with trait, scene and time. The Rag erases 1 clue (3 s, noise 4). Washing needs the Bucket and water (the well or a basin). A Wounded player's drips fade after 20 s; a one-way drop leaves a 90 s footprint trail (height) at the landing. Each scene keeps at most 40 clues; past that the oldest Claimed clue is collected first. Plants are indistinguishable until Inspected. When two different players collect the same physical clue it becomes **Corroborated** and counts as Verified for the suspect set; Townsfolk therefore have a deduction verb.

**Case Board.** Verified and Corroborated entries are posted automatically; each living player may Present one Claimed entry. The board renders a per-player summary row (fits n/m known traits, Claimed count, last house) rather than raw entries. The server intersects the Verified traits of each body against living players' traits and shows **Suspects: A, B** when the set is 3 or fewer. A suspect's own vote is void and a tie ejects them only when the set is exactly one player and was built from two bodies, or from a Child silhouette plus one Verified trait. Forged entries discredit nobody; they display "Forged: an Accomplice is in play".

### 3.5 Items and tasks

Inventory: 5 slots, Q drops, everything drops on death; role-bound items (Knife, Replica Knife, Master Keyring, Magnifier, Notebook, Slingshot; V1.5 Crossbow) never drop except the Magnifier (drops as a 6 s Inspect for anyone); an ejected Village role's kit goes to a chest at the square.

| Item | Effect | Ships |
|---|---|---|
| Knife, Skeleton Key (3 s, noise 5, leaves a print), Master Keyring | Kill; open any locked door; lock/unlock any door | V1 |
| Bloody Rag, Bucket | Erase one clue; wash Blood at water | V1 |
| Plant Kit, Crowbar | Fake trait clue; break a locked door (door stays broken) | V1 |
| Magnifier, Notebook, Lens, Fingerprint Kit | Inspect; auto-log; charges; Dust and Compare | V1 |
| Medkit, Bandage, Salts | Heal 1 HP; kill immunity 60 s; cure status | V1 |
| Lantern, Candle | Carried light radius 4 / 2; wolves flee light within 4 tiles; off = stealthier | V1 |
| Pocket Watch, Chalk, Rope | Time; floor marks; free a snared player | V1 |
| Oil, Wrench, Planks, Letter, Flour | Task deliverables fetched from other scenes | V1 |
| Forged Alibi, Handcuffs, Crossbow kit, Lockpicks, Smoke Bomb, Heirlooms | V1.5 kits | V1.5 |

**Tasks.** Village players get 3-5 tasks; the global bar at 100% wins. Each needs a tool from another scene and a 2 s hold at the node: Light the lanterns (Oil from the tavern back room to a square lantern post, night only), Fix the well pump (Wrench from the apothecary bench), Deliver a letter (from the widow's letter box to the tavern dartboard), Mend the fence (2 Planks from the edge of Gallows Wood by the gate to the NE fence; while mended, wolves cannot enter the village), Fetch the flour (from Crumb's Ovens to the tavern). Co-op task (Shutter the windows, in the tavern): both players within 2 tiles of the node holding E for 4 s; progress pauses when one releases. Two-player carrying is V1.5. Completing a task writes a Claimed alibi entry (time + scene). Cabal see a fake list that writes entries but never fills the bar. Ghost task completion counts 100% but ghost contribution is capped at 25% of the bar.

**Communication.** No voice in V1. Global text chat in meetings, lines of at most 200 characters. Outside meetings: an 8-phrase quick-chat wheel (Follow me / Where were you? / I saw something / Help! / Clear / Suspicious / Wait / Go) as speech bubbles within 5 tiles, plus world pings. Cabal channel and ghost channel are sent per-recipient by the server; the client never chooses a channel. Proximity text chat is a V1.5 toggle.

### 3.6 PvE

Players have 2 HP, regenerating 1 per 90 s; the Knife does 2. At 1 HP you are **Wounded**: 0.8x speed and a drip trail for 20 s. **Wolves** (3, forest interior loops, night): 1 damage, chase unlit players, flee any lantern or candle within 4 tiles, die to one bolt, blocked by a mended fence; a broken fence pulls one wolf into the village at night (the Cabal's reason not to mend it). The forest gate has a 6-tile safe clearing. V1 has no well fall and no bear traps; the well ladder into the cellar (`ov.well`) opens at the Large profile in V1 as a plain portal. V1.5: bear traps placed by the Ranger, a Shove verb at the well. V2: the Beast and Cave Gate, bats, bog lurker, crows.

### 3.7 Stealth, hiding and doors

Vision 7 tiles by day, 3.5 at night, Child -1; walking moves 3 tiles/s, running 4.5 tiles/s, and sneaking (Shift) is silent at 60% of walking speed. A door is usable from 1.5 tiles of its tile centre, the same reach as the other verbs; the body's collision box is a 0.5-tile square under the feet (WORLD 4.2). Noise radii in tiles: walk 2, run 6, door 4, kill scream 8, rag 4, skeleton key 5, crowbar 10, bolt 10, lockpick 5, hide 2, burst out 6, one-way drop 9, the barn goat 4, a Wisp rattle 2; noise renders as a screen-edge pulse with a direction arrow and a log line, crossing a portal at 50% radius and re-emitting at the paired portal. In V1 the server encodes a player's position only to clients in the same scene; the darkness radius is a client-side mask. Radius + occluder visibility is V1.5 (same `Visibility.ts` policy, different predicate).

**Hiding spots** (wardrobe, hay pile, under bed, barrel; crawlspaces for the Child) hold one player; **body spots** (cellar dump, crypt niche, hay pile) are separate objects. Entering takes 1 s, noise 2; the hidden player sees a slit view and keeps one action, **Burst Out** (E): instant, stuns the Checker 1 s, noise 6. **Check** (E, 2 s) opens a spot; a Check on an occupied spot writes a Verified Notebook entry for the hider ("X opened my wardrobe at 3:12"), so checking is evidence.

**Doors** have four server states: open, closed, locked, broken. Any door unlocks from the inside for anyone. Killer locks expire after 45 s. From outside you see the door swing for 3 s; the entering player is in a 0.6 s `transit` state, encoded to both scenes at the door with the nameplate hidden.

**Death and ghosts.** A kill is private until the next meeting: the roster still shows the victim alive, the victim's client learns at once, and the body in the scene is the only sign; a meeting reveals every death so far. Dead and ejected players become ghosts: walk through walls and portals (no lock, phase or alive checks, no noise), see all roles, read the Cabal and ghost channels, finish their own tasks, and once per cycle use a Wisp (flicker a lantern, rattle a door for noise 2, or nudge a clue 1 tile; V1.5). Ghosts are drawn only for other ghosts. Ghosts cast a non-binding ghost vote shown on the end screen.

### 3.8 Meetings, voting and win conditions

- **Village** wins when all Cabal are dead or ejected, tasks reach 100%, or the Final Night vote ejects a Cabal member.
- **Cabal** wins at parity (living Cabal >= living Village; Thief counts as Village, Drifter as nobody) at 6+ players; at 4-5 when living Village <= 1; or when the Final Night vote ejects nobody or a non-Cabal player.
- **Final Night** (cycle 5 without a winner): night lighting, wolves roam the village, Cabal kill CD 20 s, 90 s hunt with clues still spawning, then a forced vote with no Skip and the Case Board open; a tie ejects nobody and Cabal wins.
- Tie or Skip majority: nobody ejected. After two consecutive no-ejection meetings (Drifter ejections count as none) the next vote has Skip disabled and ejects only a player holding at least ceil(living/3) votes; otherwise nobody is ejected and the next cycle has no grace.
- **Hunger**: a Killer with no kill in 2 full cycles leaves glowing footprints until they kill.
- Disconnect over 60 s = death with cause "vanished" and a body at the last position; reconnection within 60 s resumes the same role. (M3: a player who leaves during play becomes a ghost at once with no body; the window and the body arrive with reconnection in M7, A30.)
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

**V1 (beta)**: everything in 3.1-3.9 marked V1: Butler, Child, Accomplice, Drifter; Lens charges, Dust / Compare, Autopsy, Bandage, Ledger, Witness, Plant Clue, Rag, Bucket; Case Board with suspect sets and Corroborated; 6 task types incl. 1 co-op; wolves, fence; hiding spots, Burst Out, Check; door states, Skeleton Key, Crowbar; Hunger, Final Night vote, missing-person roll-call; quick-chat, Cabal and ghost channels; scene profiles Small / Medium / Large; 10-player rules.

**V1.5**: Ranger (Arrest), Thief, Heirlooms, cave sea exit, Handcuffs, Forged Alibi, Candles for all, Wisp, Butler Bell, lit-window silhouettes, proximity chat toggle, faction-only reveal, fisher cottage, lighthouse, lobby role toggles, radius + occluder visibility, Lottie reveal, Light2D experiment, spectator mode.

**V2**: Medium, the Beast and Cave Gate, bats, bog lurker, crows, poison, voice chat, cosmetics; first-person renderer.

### 3.11 One Night Ultimate Baguette (quick mode)

Origin: the owner's friend first framed the whole game as "One Night Ultimate Baguette", a wrapper around the one-night hidden-role card game. This section is an original ruleset with original wording, built from the lobby, role card, world, meeting and vote systems above. Lobby setting `mode = onub`. Target length 5-7 minutes; the numbers below give about 5-7 (see the match table). The role table is `roles.onub.json`; the decks, night windows, timers, vote and winner table are `balance.onub.json`.

**Fiction.** The night before Lord Vane's will is read, Hollowmere keeps the wake-loaf custom: Tamsin Crumb, the baker, bakes one loaf per mourner plus three for the dead, and bakes a wax-sealed crumb token into each. Your token is your secret. At dusk every mourner sets their loaf on a named plate on the Wake Table in Crumb's Ovens; the dead's three loaves sit on the oven ledge. Vane's poisoners are among the mourners, and the will names "whoever remains when the last lantern goes out", so by dawn the village must turn one person out into the storm. During the night people creep down from the bakery loft and tamper with the loaves. What you hold at dawn is what you are.

**Roles** (always player count + 3 loaves; three stay on the oven ledge):

| Role (faction) | Night act |
|---|---|
| **Poisoner** x2 (Cabal) | Wake together and see each other. A lone Poisoner may peek one of the dead's loaves. |
| **Hireling** (Cabal) | Reads the Baker's ledger: it names the Poisoners. They do not know the Hireling. |
| **Sin-Eater** (Village) | Tastes one mourner's loaf, or two of the dead's. |
| **Cutpurse** (Village) | Takes another mourner's loaf, leaves their own, reads the one taken. |
| **Busybody** (Village) | Swaps two other mourners' loaves without looking. |
| **Sot** (Village) | Must swap their own loaf with one of the dead's, unseen. |
| **Lamplighter** (Village) | Last to wake; cracks their own loaf and reads it. |
| **Pallbearer** x2 (Village, V1.1) | Wake together and see each other. Neither is a Poisoner. |
| **Debtor** (Neutral) | Wins only if turned out. |
| **Gamekeeper** (Village, V1.1) | If turned out, the player they voted for is turned out too. |
| **Mourner** (Village) | No night act. |

| Players | Loaves | Deck |
|---|---|---|
| 4 | 7 | Poisoner x2, Sin-Eater, Cutpurse, Busybody, Mourner x2 |
| 5 | 8 | + Debtor |
| 6 | 9 | + Hireling |
| 7 | 10 | + Lamplighter |
| 8 | 11 | + Sot |
| 9 | 12 | + Pallbearer x2 (V1: Mourner x2), Mourner x2 becomes x1 |
| 10 | 13 | + Gamekeeper (V1: Mourner) |

Both Poisoners sit among the dead's loaves in 3 / C(N+3, 2) of deals: 14% at 4 players, 8% at 6, 4% at 10. Those games are won by the village only if nobody is turned out.

**Night.** After the 12 s role card (your dealt token) and a 10 s Dusk in which everyone walks into the bakery and sets their loaf (hold E on your own plate, 1 s), every client goes to the dark loft (owner decision A21): you lie still in your bedroll, with no movement and no clock, under storm ambience. The client draws one bedroll per seat, every one of them occupied all night, including those whose players are awake, so nobody can see who gets up. Muffled noise pulses (a creak, footsteps below) come from a random direction at random intervals between `timers.sleeperPulseMinS` and `timers.sleeperPulseMaxS`; the client generates them on its own, with no link to the windows, so they leak nothing. Sleepers are moved to a `loft` pseudo-scene so the server encodes no presence to them. The server runs a Conductor: a fixed list of windows built from the deck. Every window runs even when its role sits among the dead's loaves, so night length never leaks the deal. Only players whose **dealt** role matches the open window are spawned at the bakery door for that window; they act as what they were dealt, not as what they may now hold, then fade back to the loft. Windows carry a seeded 0-4 s jitter.

| # | Window | Who wakes | Physical act (object, hold time) | Trace at dawn |
|---|---|---|---|---|
| 1 | 12 s | Poisoners | Each other's nameplates glow red at the Wake Table. If alone: E on one of the dead's loaves (2 s) shows its token | Oven-ledge flour scuff |
| 2 | 8 s | Hireling | E on the Baker's ledger (2 s, act `onub.readLedger`): the Poisoners' names | Ledger left open |
| 3 | 8 s | Pallbearers (V1.1) | See each other at the table | none |
| 4 | 14 s | Sin-Eater | E on one mourner's plate (2 s) shows its token, or E on two of the dead's loaves in turn | Plate turned |
| 5 | 12 s | Cutpurse | E on another's plate (2 s): the loaves swap; your new token is shown | Two plates turned |
| 6 | 14 s | Busybody | E on two other plates in turn (1 s each): they swap; nothing is shown | Two plates turned |
| 7 | 10 s | Sot | E on one of the dead's loaves (2 s): swaps with your own, unseen; if the window expires the server picks by seed | Ledge scuff |
| 8 | 8 s | Lamplighter | E on your own plate (2 s) shows your current token | Plate turned |

Night length is the sum of the windows present plus a 2 s fade per window, before jitter: 60 s at 4-5 players, 70 s at 6, 80 s at 7, 92 s at 8-10 in V1 (102 s at 9-10 once the Pallbearers ship); jitter adds up to 4 s per window. Traces are cosmetic in V1 ("something moved here"); trait-bearing flour footprints (height, as in the main mode) are a V1.1 lobby toggle `floury`. Every act arrives as `act.ability` through the command queue and is accepted only if the phase is night, the open window matches the actor's dealt role, the actor has not acted this window, the actor is within 2 tiles of the target prop, and the target is legal for the role (never your own plate for Sin-Eater, Cutpurse or Busybody; only the dead's loaves for the Sot). "May" roles that time out do nothing.

**Dawn, discussion and vote.** A 10 s dawn fade leads straight into the Meeting scene with the trace lines on the board. One discussion with global text chat, portraits and trait icons. Claims are structured: tap a role chip to post "I was the Sin-Eater: Y's loaf was Mourner", and the board lists them per player as Claimed.

| Players | Discussion | Vote | Whole match |
|---|---|---|---|
| 4-5 | 150 s | 25 s, ends early when everyone has voted | about 5 min |
| 6-7 | 180 s | 25 s | 5.5-6 min |
| 8-10 | 210 s | 25 s | 6.5-7 min |

Vote: no Skip, no self-vote; a missing vote is an abstention and is flagged in the reveal. Resolution (`resolveDawn`): everyone holding the most votes is **turned out**, ties included; if nobody holds two or more votes, nobody is turned out. A turned-out Gamekeeper takes their own target with them (one hop). Winners are judged by **final** loaves.

| Outcome | Who wins |
|---|---|
| The Debtor is turned out | The Debtor. The Cabal loses. The Village wins only if a Poisoner is also out. |
| A Poisoner is turned out (no Debtor) | Village: every final non-Cabal, non-Debtor loaf. |
| No Poisoner out, a Poisoner among the mourners | Cabal: Poisoners and Hireling, even a Hireling who was turned out. |
| No Poisoner among the mourners, nobody turned out | Village. |
| No Poisoner among the mourners, someone turned out | The Hireling if they hold a mourner's plate; otherwise nobody ("the storm wins"). |

Reveal (20 s): every plate cracks open. The end screen shows dealt and final roles, the dead's three loaves, the swap log as a timeline ("The Cutpurse took the Poisoner's loaf; the Busybody swapped A and B") and the vote arrows, then returns to the lobby with the same code.

**Role cards.** Every card carries the line: "The loaf you were handed at dusk may not be the loaf on your plate at dawn. Argue for who you think you are."

| Role | Card text |
|---|---|
| Poisoner | You and your partner finished Lord Vane; the other plates must never learn it. Survive the dawn vote and the manor is yours. |
| Hireling | You carried the poison and know who used it. They do not know you; take the blame if it saves them. |
| Sin-Eater | By custom you taste the bread of the guilty. Tonight you may taste one mourner's loaf, or two of the dead's. |
| Cutpurse | Old habits: you take someone's loaf and leave your own. You learn what you stole, not what you left. |
| Busybody | You cannot leave other people's plates alone. Swap two mourners' loaves and tell no one, not even yourself. |
| Sot | You drank the wake dry and knocked your loaf onto the oven ledge. Take one of the dead's instead; you will not remember which. |
| Lamplighter | You rise before dawn to light the square. Crack your own loaf and know what you truly hold. |
| Pallbearer | You and your fellow carried the coffin and can vouch for each other. Neither of you is a Poisoner. |
| Debtor | Vane held your note; if the village turns you out it dies with you. Be suspicious enough to hang, not so loud they ignore you. |
| Gamekeeper | If the village turns you out, you take your vote with you. Point carefully. |
| Mourner | You came for the bread and the will. Listen, count the claims, and vote. |

**Balance.** At 4-5 the deal is swap chaos with the Debtor as the first bluff; 150 s of text discussion is enough. At 6-7 the Hireling punishes "no Poisoner here, vote in a circle" play and the Lamplighter gives the first verifiable late claim. At 8-10 three verified-claim sources (Sin-Eater, Lamplighter, Pallbearers) face two liars and a Hireling, and the Gamekeeper makes mass-voting costly. Every count lands inside the 5-7 minute target (card 12 + dusk 10 + night 60-102 plus jitter + dawn 10 + discussion 150-210 + vote up to 25 + reveal 20); discussion is the knob if playtests want a longer match. Replayability comes from the deal and the swaps reshuffling identity every match and the swap log teaching the table at the end. The mode has no ranking.

**V1 cut.** Ships: mode toggle; decks for 4-10 with the Pallbearers and Gamekeeper replaced by Mourners (nine roles); bakery greybox with plates, ledge and ledger; dark loft view and Conductor; dusk plate-setting; Meeting reuse with no Skip and claim chips; `resolveDawn` and the winner table; the reveal with the swap log. V1.1: Pallbearers, Gamekeeper, a dawn walk in the bakery before the meeting, flour footprints, eleven role portraits, lobby role picks.

**Trademark note.** The mechanics of the one-night card game are not protected, but its name and its card art and text belong to its publisher. The parody title is fine for a free game among friends; if Who Did It is ever sold, ship the mode under a neutral label and never reuse the card game's text or art. The label is chosen only if a sale happens (A22); "The Wake Loaves" is the working suggestion.

### 3.12 NPC fill (below the minimum)

**Decision (owner, 2026-10-10, A16 and A26):** a party may start with fewer than `players.min` humans; the server fills the empty seats with NPC villagers so the full roster is dealt.

- **Seats.** Start is enabled with at least 1 human. With fewer than `players.min` players the server adds NPCs up to `players.min` before dealing (until M3c lands, such a party deals the 4-player row cut to the real count, Killer first, then Detective, and no NPC seats; A28); the leader may add NPCs by hand up to `players.max`. A human joining the lobby takes an NPC's seat.
- **Same game.** NPCs are dealt from the same roster row and can hold any role, the Killer included; their roles are as secret as a human's. Rules, the practice label at 4 (3.1, 3.9) and any ranking depend only on the total player count, never on how many seats are NPCs.
- **Hidden seats.** Nothing a client receives marks a seat as an NPC: `isNpc` lives in room memory only, and NPCs take human-style names from a name pool. NPCs never chat, which a table that knows each other will notice; nothing on the wire confirms it.
- **Difficulty.** A lobby setting, Easy / Normal / Hard, default `npc.defaultDifficulty`. It is enabled only when the party holds at least `npc.difficultyMinNpcs` NPC seats; with fewer, NPCs play the default. Each level is a row of `balance.json` `npc.difficulty`:

| Value | Meaning |
|---|---|
| `killChancePer10s` | A Killer NPC strikes a human alone in its scene at night with this chance per 10 s of opportunity |
| `reportDelayS` | Delay before an NPC reports a body it sees |
| `plantsPerNight` | False clues an Accomplice NPC plants per night |
| `suspectVoteChance` | Chance an NPC votes for the player with the most Verified clues on the Case Board instead of Skip |

- **Behaviour (V1, scripted, server-side, no client).** Wander between scenes through the portal graph; perform tasks at nodes at a slow pace; at night prefer lit scenes and hiding spots; report a body on sight; vote as the difficulty row says. A Killer NPC washes at the nearest basin after a kill, returns to the square and votes with the majority.
- **Scope.** NPCs ship in M3c (ROADMAP 7.1) after the first playable, reusing the bot movement of `tools/bots/swarm.ts` inside the room as entities rather than clients. In quick mode (3.11) NPCs are sleepers with a bedroll like everyone else, and the Conductor resolves their acts at random within their window.
