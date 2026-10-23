# Game Design Document

> Generated from `docs/MASTER_PLAN.md` (v0.1, 2026-10-10). Owns every rule and number together with `packages/content/data/` (`@wdi/content`): `balance.json` holds the global and per-player-count values, and each role, ability, item, clue and task record holds its own (a cast time, a charge count), so no number lives in two files. A behaviour change is not done until this file changes with it.

## 1. Vision & pillars

A storm has closed the road and fog hides the sea. Hollowmere is cut off, Lord Vane is dead, and someone among you is still killing. Find them before the last lantern goes out.

Who Did It is a 5-10 player (4 = practice; NPCs fill the seats below 4, see 3.12) hidden-role game played from a link. It crosses Among Us (tasks, bodies, emergency meetings), Mafia (hidden factions, a vote as the climax), a whodunit (physical clues with hidden attributes, a Detective who verifies them) and Hello Neighbor (houses you enter, doors that lock, hiding spots). V1 is isometric 2.5D in Phaser with pre-rendered Blender sprites (3.13); V2 is first-person 3D on the same server, rules and world data.

| Pillar | Design rule |
|---|---|
| Every kill tells a story | A knife kill always spawns 2 of 3 trait clues plus a fingerprint and Blood on the killer. Killers manage evidence; they never erase all of it. |
| The vote is the climax | Phases funnel into short meetings. The Case Board turns Verified evidence into a suspect set, never into a name. Ejections reveal roles. |
| Space is information | Entering a house, forest or cave removes you from sight. Alibis are spatial. Nothing inside a scene is sent to anyone outside it. |
| Readable in 20 seconds | One role card, 3 abilities max, canned chat outside meetings, a meeting board that summarises instead of listing. |

## 2. Player experience: the first 10 minutes

1. **Landing (0:00).** `https://groot99-droid.github.io/Who-Did-It/` shows the title over a looping fog plate and two buttons: **Create Party** and **Join Party**. While the server is polled on `/health` the buttons read "Waking the village..." (Render Free fallback) or are live at once (Railway). A name field (2-16 characters) sits above the buttons. Clicking either button unlocks the AudioContext.
2. **Create / Join (0:20).** The leader gets a 5-character code such as `K7PQX` (alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, no 0/O/1/I) plus a share button that copies `.../Who-Did-It/#/join/K7PQX`. Friends paste the code or open the link; the code field is prefilled from the hash.
3. **Lobby (0:40-2:00).** Roster of names with a Ready tick, player count "5/10", a line "Best with 6-8 players" and, at 4, the practice line (the Cabal wins with one villager left, 3.9; copy in `docs/UI.md` 14.13). Start is enabled with at least 1 human (NPCs fill the seats below 4, see 3.12); if someone is not Ready the leader sees a confirm dialog listing them. The settings panel holds the mode chip (Who Did It, or One Night Ultimate Baguette, 3.11), the leader's Add NPC and Remove NPC and the NPC difficulty (3.12), `map` (Hollowmere or Blackpine, 3.13; hidden in the quick mode) and `revealMode` (full, locked in V1).
4. **Start and role card (2:00-2:23).** The server deals roles and traits, locks the room and sends each client its private card. The card shows: faction stripe and icon, role name, your character with your traits and the line "You walk as the Baker: Tall / Green scarf / Bowler hat" (a cover role picks the look here instead, 3.17), the deck list, a one-line goal, up to 3 ability rows with key and cooldown, the inventory strip, 2-3 sentences of card text, a Beware line, and for Cabal the teammate names. It holds 20 s; Ready dismisses it; Tab reopens it; a HUD chip (icon + goal) stays top-left.
5. **Grace (2:23-2:53).** Everyone spawns spread around the map's hub (3.13). Kills are disabled for 30 s. One pre-placed static clue glows beside the well: holding E for 2 s collects it and the Notebook opens with "Footprints, long stride: Tall", teaching the collect verb and the trait icon. Toasts: "Shift to sneak", "Hold E on a glowing clue", "E at the bell calls a meeting" (copy ids in `docs/UI.md` 14).
6. **First house (3:00).** You walk to The Drowned Lantern. Others see the door swing for 3 s and your sprite step in; the scene fades 0.4 s to the bar interior with camera follow. A second door leads to the back room, another scene, with a wardrobe (hiding spot) and a trapdoor that is boarded at this party size. Outside the lane you can see the forest gate and, beyond the gate, the forest scene with the cave mouth.
7. **First body (4:30).** Night falls (10 s vignette, then a 100 s night with a 3.5-tile light radius). Somewhere a scream pulses at your screen edge with a direction arrow and a log line "A scream from the north". The Killer carries Blood for 60 s and walks to the well to wash. You find the body in the apothecary loft: E reports it; everyone teleports to the square; the body stays where it was.
8. **First vote (4:45-6:30).** The meeting shows portraits and trait icons, not world sprites (each seat's portrait is its public look, 3.17). The board already lists every Verified entry (none yet, unless the Detective was first on the scene) and a per-player row: "fits 1/1 known traits, Claimed 0, last house: Apothecary". You can Present one Claimed Notebook entry. Tapping a portrait offers "I saw [X] at [Apothecary] around [3:40]" posted as one chat line. Discussion is 60 s at 5 players; voting opens immediately; the meeting ends early once everyone has voted. Votes are secret until the reveal. The tally shows names; an ejected player's role is revealed; 15 s of immunity follow, everyone spread around the square, and the phase resumes.
9. **The rest of the match (6:30-16:00).** Two to four more cycles of day, night, bodies and meetings; typical match 12-18 minutes. Ghosts see every role, read the Cabal and ghost channels, finish their own tasks and vote a non-binding "ghost suspect" shown on the end screen.

## 3. Game design

### 3.1 Factions, traits and the deck

Factions: **Village** (blue, shield), **Cabal** (red, dagger; Killer and Accomplice know each other), **Neutral** (amber, mask). In the main mode every seat walks the world as the character of its card, so a role is public by sight, except for the three **cover roles** (Killer, Accomplice, Drifter), which always wear the look of another card of the deck (3.17). A client never receives another seat's role card, inventory, Notebook or cooldowns, and nothing it receives tells a cover look from a real one. In the quick mode (3.11) every role stays hidden.

**Traits.** Each player is dealt a unique triple from 27 combinations, from a random stream of its own (never the deal's): **Height** S/M/T (sprite scale 0.9/1.0/1.1, feet-anchored), **Scarf** red/green/blue (every character wears a storm scarf, a tinted overlay in the palette tokens blood/teal/moon; the nameplate repeats it as a shape: diamond/circle/square), **Hat** cap/bowler/bare. The boot trait from the earlier draft is dropped because a boot is 6 px at shipping scale. (M5a) Height and scarf are drawn on the character in the world; the hat is not, since every character keeps its own headgear, and it shows as a glyph on the nameplate, on the role card and in the meeting roster. Traits are dealt apart from the cards, so they still say nothing about a role, and a kill leaves the killer's own traits whatever look they wear (3.4, 3.17). Traits appear on the role card, the HUD chip tooltip and the meeting roster.

**The deck.** A match deals from a public deck of player count + 2 character cards (table in 3.9). Every card is a different character, so two seats share a look only when a cover role chooses to (3.17); the one repeated card is the second Killer of the 10-seat deck, which never walks as itself (Killers always wear a cover). Every Killer card is always dealt; the other cards are shuffled, and two of them stay **undealt**. Which two is secret; the deck list itself is public, in the lobby (for the current party size), on the role card and in the HUD. Townsfolk are dealt as **professions** (Lamplighter, Baker, Fisher, Tinner): each is one card, the Townsfolk card with a character of its own. The deck rows are `roles.json` `decks["4".."10"]`; the rules engine reads them, and no document restates them. The Butler and the Child stay out of the decks until their abilities ship (M4); the Ranger (V1.5), the Thief (V1.5) and the Medium (V2) join when they ship. Lobby toggles (Thief, Medium, faction-only reveal) are V1.5.

### 3.2 Role cards

"Cover" says whether the role wears another card's look (3.17). Every card's character, portrait and world look are `looks.json`.

| Role | Cover | Win | Start kit | Abilities (max 3) | Card text | Beware |
|---|---|---|---|---|---|---|
| **Killer** (Cabal) | Yes | Parity (6+), or living Village <= 1 (4-5), or the Final Night vote fails | Knife (bound), Skeleton Key, Bloody Rag x2, Bucket | **Kill** (CD by table; resolved on the validated tick; spawns clues; you gain Blood 60 s) (M3: reach 1.5 tiles plus what the target moved in the last 250 ms, with a clear straight line; a protected target voids the strike, spends the protection, and you still gain Blood and rest the Knife; the victim becomes a ghost at once, the body and both clues appear in the scene, a scream rings within 8 tiles.) (M5a: only at dusk, at night and in the Final Night hunt.) **Impersonate** (dusk, night and the Final Night hunt; 45 s CD from the drop): for 15 s your character shows one living seat's name, look, scarf and hat glyph, at your own height; the face changes and drops only out of sight, except that your next Knife strike drops it in place with a puff (3.17). **Drag body** (hold E, 50% speed; into a body spot = hidden; leaves a drag smear). | Walk in a borrowed character. Strike after dark when the room is empty, clean one clue, wash at the well, then be the loudest voice asking who did it. | Clues match your own traits whatever face you wear; your height never changes; Blood shows within 3 tiles; a guarded target voids your kill. |
| **Accomplice** (Cabal) | Yes | As Killer | Plant Kit x3, Crowbar | **Plant Clue** (60 s CD): a footprint or thread with chosen traits. **Crowbar**: break a locked door (5 s, noise 10). (M5a) **Inherit**: when the last Killer dies or is ejected the Knife passes to you (kill CD +10 s; your Hunger clock starts in the round you inherit). The seat then plays as the **heir** card (`roles.json` `heir`: the Accomplice's kit and Plant Clue and Crowbar, plus the Knife); its public look is unchanged and only a private message tells it. | You never hold the knife, only the alibi. Forge trails, break the right doors, vouch at the right moment. | Inspect marks plants Forged; a Forged entry tells the village an Accomplice exists; your cover is a claim someone may test. |
| **Detective** (Village) | No | All Cabal dead or ejected | Magnifier, Notebook, Lens x3, Fingerprint Kit | **Inspect** (3 s, 1 Lens; +1 Lens per meeting, max 3): reveals a clue's hidden attribute, exposes forgeries, marks it Verified. **Dust / Compare**: lift a print (2 charges) and compare any two: Match / No match. | Collect, inspect, cross-reference. Your Verified clues narrow the board; the village does the rest. | Prime target; the Rag erases clues; forgeries cost Lenses; Compare never gives a name. If you die the Magnifier drops and anyone can Inspect in 6 s. |
| **Doctor** (Village) | No | Village | Medkit x2, Bandage x2, Salts x1 | **Bandage** (60 s CD, not self): (M3: instant, 1.5 tiles, one Bandage from the kit; the knockback, blackout and witness entries come with M4.) the target survives the next kill attempt within 60 s; both are knocked back, the target's screen blacks out 1.5 s and gets the attacker's height as a Claimed entry; witnesses within 3 tiles get height + scarf as Claimed; the attacker still gains Blood. **Autopsy** (8 s): time of death +/-45 s and cause (knife / wolf / poison / shot), posts Verified. **Salts**: cure Wounded or Snare. | Keep people alive and read the dead. Your autopsy says when; that is what breaks alibis. | Two-Killer games outpace your bandages. |
| **Vicar** (Village) | No | Village | Candle x2, Pocket Watch | (M5a) **Hear Confession** (night power, once per night, not self): pick a seat from the list; your Notebook gets its faction (Village, Cabal or Neutral) as Verified. | Everyone in Hollowmere confesses to you sooner or later. Each night, learn where one soul stands, then choose how much to say. | Everyone can see you are the Vicar, the Cabal first among them; if your card was not dealt, a Cabal player may wear your face and lie in your name. |
| **Watchman** (Village) | No | Village | Lantern, Pocket Watch | (M5a) **Keep Watch** (night power, once per night; not self, and never the seat you watched the night before): the seat survives the first Knife strike before the night ends; the strike fails as on a Bandaged target, and your Notebook gets "Your watch held" as Verified. | You walk the lanes after dark. Each night, choose one door to stand by; if a blade comes for that soul tonight, it fails. | You cannot watch yourself or the same soul two nights running; poison and the Gamekeeper's shot go past you. |
| **Herbalist** (Village) | No | Village | Remedy x1, Nightshade x1, Candle | (M5a) **Remedy** (night power, once per match, self allowed): the seat survives the first Knife strike before the next meeting opens; your Notebook records it when it holds. **Nightshade** (night power, once per match, not self): the seat dies when the night ends, wherever it stands, and leaves no trait clues. | One bottle saves, one bottle ends. Pour the first where the knife will fall and the second only where you are certain. | Nightshade kills a villager as readily as a killer, and a Remedy cannot stop it. |
| **Gamekeeper** (Village) | No | Village | Fowling Piece (bound), Lantern | (M5a) **Last Shot** (passive): when you are killed, poisoned or ejected you have 10 s, before you learn any role, to pick one living seat from the list; it dies too (a shot rings 10 tiles where it stands). You may hold your fire. (M5a) A Knife strike blacks out your screen at once, as a Bandaged target's does: you aim from the list on what you saw before the blow. | Vane paid you to keep the wood. If they come for you, you will not go alone; make sure the one you take is the one who came. | You never see the blow that fells you, and the face that walked up may have been borrowed; a wasted shot kills a friend. |
| **Butler** (Village; not dealt until M4) | No | Village | Master Keyring, Candle x2 | **Lock / Unlock** any house door instantly (10 s CD; locks keep people out, never in). **Ledger**: at each meeting, privately lists for each living player the last house they entered this cycle (house only, no time). | You know every door in Hollowmere. Control the wings, read the ledger, say who went where. | Universal access makes you the obvious suspect; Skeleton Key use looks like yours. |
| **Child** (Village; not dealt until M4) | No | Village | Slingshot, Chalk, Candle | **Silent hide** (instant, no noise; adults cannot Check a crawlspace). **Witness** (passive): with line of sight within 6 tiles of a kill, "The Child saw it" posts height + scarf as Verified at the next meeting. **Slingshot**: 1 s stun (30 s CD). | You are small and quiet. Hide, watch, remember. | Top kill target; vision -1 tile; cannot pick up items. |
| **Townsfolk** (Village), dealt as the professions below | No | Village | Lantern, Pocket Watch, Chalk, Rope | **Tasks**. **Chalk**: floor marks visible to all. **Rope**: free a snared player. Two Emergency Bell pulls per match (others have one). | Do your chores with others to build alibis, mark what you see, vote with evidence. | Weak alone; strong in pairs. |
| **Lamplighter**, **Baker**, **Fisher**, **Tinner** (Village, professions) | No | Village | As Townsfolk | As Townsfolk | Lamplighter: You light the lanterns that keep the wolves off the square. Work beside others, mark what you see, vote with evidence. Baker: Up before anyone, flour to the elbows. Do your chores in company, mark what you see, vote with evidence. Fisher: The fog keeps the boats in. Mend the nets beside a neighbour, mark what you see, vote with evidence. Tinner: The mine is shut; your hands are not. Work in pairs, mark what you see, vote with evidence. | As Townsfolk |
| **Drifter** (Neutral) | Yes | Get ejected (solo win; the match continues and the end screen lists you among the winners). | Replica Knife, Bloody Rag x1 | **Act Shifty**: fake noise rings (20 s CD). **Fake Blood**: 30 s (1 use, world only; meetings show portraits). | You want to hang. Be suspicious enough to be voted out, not so obvious they ignore you. | A calm village; dying to the Killer is a loss; counts as nobody for parity; you wear a cover like the Cabal, but alone. |
| **Ranger** (Village, V1.5) | No | Village | Crossbow + 2 Bolts, Snare x2, Torch | **Shoot** a wolf: it dies. **Arrest** (1 bolt on a player): the target is cuffed and dragged to the square; the next meeting opens with them as a Case Closed suspect. **Snare**: holds 4 s and logs the name. | You hunt wolves. One arrest per match: be right. | Bolts are loud (noise 10). |
| **Thief** (Neutral, V1.5) | Decided when it ships | Escape by the cave sea exit holding 3 Heirlooms | Lockpicks x5, Sack, Smoke Bomb | Pickpocket (40 s CD), Lockpick (2 s, noise 5), Smoke (4 s). | Nobody's hero. | Thefts look like Killer activity; counts as Village for parity. |
| **Medium** (Village, V2) | No | Village | Seance Chalk, Candle x3 | Seance at a body (8 s): the ghost picks 1 of 8 phrases. | You hear the dead. | Cabal ghosts may lie. |

The Accomplice's Forged Alibi is a V1.5 kit item (3.5) and is not in the V1 start kit. Values the table leaves open (decided 2026-10-10, Session C): Kill, Bandage, Salts, Medkit and Rope reach 1.5 tiles; Bandage is instant and knocks both players back 1 tile; Plant Clue takes 2 s; Dust takes 2 s; the Slingshot reaches 5 tiles; Act Shifty's fake rings use the run radius. Universal verbs: Report and the Bell reach 2 tiles; Collect is a 2 s hold. `abilities.json` holds every verb with a number; an item's `use` points at its verb.

**Lock door** leaves the Killer's card to make room for Impersonate (a card shows at most 3 abilities); it returns with the Butler's doors in V1.5 (`abilities.json` keeps the row, `ships: V1.5`).

**Night powers** (M5a). Hear Confession, Keep Watch, Remedy, Nightshade and Last Shot pick a seat from a list of the seats the roster shows alive, never a figure in the world, so they need no walking and leave nothing in the world. All but Last Shot work from the start of dusk to the end of the night, and in the Final Night hunt, at most `balance.json` `nightPowers.perNight` (1) use of each per night; Remedy and Nightshade are also spent from the kit, one bottle each per match. Results go only to the actor's Notebook, as Verified entries. A power used on a seat that is dead but not yet public works, as far as its user can tell, as on a living seat (a refusal or a missing entry would tell the actor about the death): Hear Confession still writes the seat's faction; Keep Watch and Remedy write their pick entry and never hold; Nightshade is spent and skipped when it resolves. A Knife strike on a protected seat fails and spends one protection, Bandage first, then the Watch, then the Remedy, and the holder of the spent protection gets a Notebook entry; protections stop only the Knife. Nightshade resolves for every poisoned seat at once when the night ends, when a meeting opens, or when the Final Night hunt ends: the seat becomes a ghost (cause poison) and its body lies where it stood, with no clue beside it. **Last Shot**: until the Gamekeeper shoots or the 10 s run out, the dying Gamekeeper sees no figure, no role and no ghost view (a Knife strike blacks its screen out at once), and aims from the list. Meeting requests and phase changes never wait for an aim. If a meeting opens while a Gamekeeper aims, the aim runs on until `aimUntilTick`. A shot then kills its target at once (`alive` false, cause shot, no role shown). Only that batch's win check and `endReveal` wait. An ejected Gamekeeper aims during the reveal, which holds until the shot; that shot is announced with its target's role. A shot in the world is as private as a kill: the target becomes a ghost (cause shot), the body lies where it stood, and the shot rings like a scream (`noise.shot`, 10 tiles) in that scene.

**NPC night powers** (M5a). An NPC (3.12) holding a night power uses it at a seeded moment between dusk and the end of the night: the Vicar on a seat it has not heard yet, the Watchman on a random other living seat it did not watch the night before, the Herbalist its Remedy on itself on its first night and Nightshade never, the Gamekeeper on the seat it would vote for (3.12), or on nobody when it has none. An NPC Killer does not Impersonate in M5a. An NPC cover role never picks, so it wears its first hint (3.17).

### 3.3 Match loop

| Phase | Trigger | Duration |
|---|---|---|
| Lobby | Leader creates party; Start with >= 1 human (NPCs fill to 4, 3.12) | – |
| Role reveal | Server deals the deck and the traits; cover roles pick a look (3.17) | 20 s, then 3-2-1 |
| Grace | Spawn spread around the hub (3.13); kills disabled; guided clue; the map's opening cutscene plays inside it (3.18) | 30 s, plus the length of the map's opening (its intro track: HollowMere 117 s, BlackPine 80 s; at most `phases.openingS`, 120 s) |
| Day | Free roam; light radius 7 tiles; the Knife is sheathed | 60 s |
| Dusk | Vignette, "Night falls in 10 s"; the Knife, Impersonate and the night powers wake; missing-person check | 10 s |
| Night | Light radius 3.5 tiles; wolves active; the hunt | 100 s |
| Meeting: discussion | Body report, Emergency Bell, or missing-person roll-call | 60 / 75 / 90 s (4-5 / 6-7 / 8-10) |
| Meeting: vote | Open from the first second; ends early when all living players have voted | 25 s after discussion |
| Reveal | Tally with names; ejected role revealed | 8 s (held for an ejected Gamekeeper's Last Shot) |
| Immunity | No kills, no noise; everyone spread at the hub; then a new day (M3: the day restarts in full and the cycle count rises) | 15 s |
| Final Night | The day that would start cycle 5 begins with no winner yet | 90 s hunt + forced meeting |
| Game over | Winner, every role and look, the undealt cards, the summary; then the lobby again with the same code and seats | 20 s |

(M3) The match clock starts when grace begins; the Knife's first cooldown starts when grace ends, and a meeting that opens during a world phase restarts the cycle at a full day once immunity ends. A cycle (day, dusk and night) is 170 s; a 12-18 minute match is 3-4 cycles with meetings. Doors, locks, bodies and clues persist across phases. All timers are tick-based (20 Hz) in state and rendered through a server-time offset.

(M5a) **The Knife works only after dark**: at dusk, at night and in the Final Night hunt, never in grace, day or immunity. Until tasks (M4d) and quests (M5b) give the day work, the day is short and the night long. Impersonate and the night powers follow the same clock (3.2, 3.17).

(M5a) The Emergency Bell rings only in grace and day; after dark only a body report or the missing-person roll-call opens a meeting.

**Missing-person roll-call.** At each Dusk the server checks for (a) a dead player whose body has been unreported for a full phase, or (b) a living player no other player has shared a scene with for a full cycle. If either holds, a meeting opens with "X has not been seen" on the board. A Killer who hides every body still faces a meeting.

**Hunger** (M5a). A day starts a new round (`round` + 1). When a day starts round r, a living Killer whose last Knife strike was in round r − 1 − `hunger.cyclesWithoutKill` or earlier (round 0 when they never struck) is **Hungry**: from then on, every `hunger.trailEveryS` (1 s) in which they move, a glowing footprint (`hungerPrints`, showing their own height, gone after 30 s) appears on their tile, in every phase and whatever look they wear. With the default of 2, a Killer who never strikes is Hungry from the day of round 3. Any accepted strike, a voided one included, ends Hunger; an Accomplice who inherits the Knife counts as having struck in that round (3.2). Glowing footprints cannot be collected; anyone in the scene sees them.

**Final Night** (M5a). When the server would start a day whose round is above `finalNight.afterCycle` (4), after a night or after the immunity of a meeting, and nobody has won, the Final Night begins instead of that day. Everyone stays where they stand under night lighting; every Knife's cooldown is cut to at most `finalNight.killCooldownS` (20 s) and the Knife rests that long after each strike; the night powers wake for one more use; clues keep spawning. The hunt lasts `finalNight.huntS` (90 s); a body report ends it at once (`finalNight.reportEndsHunt`; the Bell is silent after dark). Then Nightshade resolves, everyone moves to the square and the forced meeting opens (reason `final`): the discussion of the party size, then a vote with no Skip (`finalNight.skipAllowed`) and the Case Board open. The plurality is ejected and revealed; a tie ejects nobody (`finalNight.tieEjectsNobody`). The match always ends there (3.8). A death during the hunt runs the win check as usual, so parity can still end the match first.

**The Daily Train** (round 7, HollowMere only; DECISIONS A113). A map whose file names a `station` (a spawn on its hub: HollowMere's platform `overworld.platform` on the overworld's east edge) has a Train. On every day, `train.arriveAtS` (5 s) after the day begins, the Train arrives: the seats on the hub within `train.hearTiles` (20 tiles) of the platform hear `train_arrive`, and every seat's chat log gets the system line of UI.md 14.30. `train.deliveryAfterS` (8 s) later it delivers, with `train_brake` to the same seats when the world is in play. A meeting that opens before the arrival takes that day's Train with it; once arrived, the delivery follows whatever the phase. No Train in grace, at dusk, at night, in the Final Night or in the quick mode. The arrival and the delivery are the sim events `train.arrive` and `train.delivery`, which name no seat; the vendettas run on them (3.20). BlackPine has no Train.

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

Wolf kills spawn Fur and Claw Marks (decay 1 cycle), no footprints. Collecting: stand on a clue, hold E 2 s; it enters the Notebook with trait, scene and time. (M3: Footprints and Thread only; the hold is cancelled by moving, releasing, dying or a meeting, and several players may collect the same clue.) The Rag erases 1 clue (3 s, noise 4). Washing needs the Bucket and water (the well or a basin). A Wounded player's drips fade after 20 s; a one-way drop leaves a 90 s footprint trail (height) at the landing. Each scene keeps at most 40 clues; past that the oldest Claimed clue is collected first. Plants are indistinguishable until Inspected. When two different players collect the same physical clue it becomes **Corroborated** and counts as Verified for the suspect set; Townsfolk therefore have a deduction verb.

**Case Board.** Verified and Corroborated entries are posted automatically; each living player may Present one Claimed entry. The board renders a per-player summary row (fits n/m known traits, Claimed count, last house) rather than raw entries. The server intersects the Verified traits of each body against living players' traits and shows **Suspects: A, B** when the set is 3 or fewer. A suspect's own vote is void and a tie ejects them only when the set is exactly one player and was built from two bodies, or from a Child silhouette plus one Verified trait. Forged entries discredit nobody; they display "Forged: an Accomplice is in play".

### 3.5 Items and tasks

Inventory: 5 slots, Q drops, everything drops on death; role-bound items (Knife, Replica Knife, Master Keyring, Magnifier, Notebook, Slingshot, Remedy, Nightshade, Fowling Piece; V1.5 Crossbow) never drop except the Magnifier (drops as a 6 s Inspect for anyone); an ejected Village role's kit goes to a chest at the square.

| Item | Effect | Ships |
|---|---|---|
| Knife, Skeleton Key (3 s, noise 5, leaves a print), Master Keyring | Kill; open any locked door; lock/unlock any door | V1 |
| Bloody Rag, Bucket | Erase one clue; wash Blood at water | V1 |
| Plant Kit, Crowbar | Fake trait clue; break a locked door (door stays broken) | V1 |
| Magnifier, Notebook, Lens, Fingerprint Kit | Inspect; auto-log; charges; Dust and Compare | V1 |
| Medkit, Bandage, Salts | Heal 1 HP; kill immunity 60 s; cure status | V1 |
| Remedy, Nightshade, Fowling Piece | Herbalist's save and poison (one each); the Gamekeeper's Last Shot | V1 |
| Lantern, Candle | Carried light radius 4 / 2; wolves flee light within 4 tiles; off = stealthier | V1 |
| Pocket Watch, Chalk, Rope | Time; floor marks; free a snared player | V1 |
| Oil, Wrench, Planks, Letter, Flour | Task deliverables fetched from other scenes | V1 |
| Forged Alibi, Handcuffs, Crossbow kit, Lockpicks, Smoke Bomb, Heirlooms | V1.5 kits | V1.5 |

**Tasks.** Village players get 3-5 tasks; the global bar at 100% wins. Each needs a tool from another scene and a 2 s hold at the node: Light the lanterns (Oil from the tavern back room to a square lantern post, night only), Fix the well pump (Wrench from the apothecary bench), Deliver a letter (from the widow's letter box to the tavern dartboard), Mend the fence (2 Planks from the edge of Gallows Wood by the gate to the NE fence; while mended, wolves cannot enter the village), Fetch the flour (from Crumb's Ovens to the tavern). Co-op task (Shutter the windows, in the tavern): both players within 2 tiles of the node holding E for 4 s; progress pauses when one releases. Two-player carrying is V1.5. Completing a task writes a Claimed alibi entry (time + scene). Cabal see a fake list that writes entries but never fills the bar. Ghost task completion counts 100% but ghost contribution is capped at 25% of the bar, except the martyred Vicar's (3.20). A full bar in play ends the match for the Village.

**Communication.** No voice in V1. Global text chat in meetings, lines of at most 200 characters. Outside meetings: an 8-phrase quick-chat wheel (Follow me / Where were you? / I saw something / Help! / Clear / Suspicious / Wait / Go) as speech bubbles within 5 tiles, plus world pings. Cabal channel and ghost channel are sent per-recipient by the server; the client never chooses a channel. (M3) A living player may speak only while a meeting runs (discussion, vote and reveal), to everyone; a ghost may speak in any phase, to the other ghosts only; empty lines are refused and long ones are cut to the limit. Proximity text chat is a V1.5 toggle.

### 3.6 PvE

Players have 2 HP, regenerating 1 per 90 s; the Knife does 2. At 1 HP you are **Wounded**: 0.8x speed and a drip trail for 20 s. **Wolves** (3, forest interior loops, night): 1 damage, chase unlit players, flee any lantern or candle within 4 tiles, die to one bolt, blocked by a mended fence; a broken fence pulls one wolf into the village at night (the Cabal's reason not to mend it). The forest gate has a 6-tile safe clearing. V1 has no well fall and no bear traps; the well ladder into the cellar (`ov.well`) opens at the Large profile in V1 as a plain portal. V1.5: bear traps placed by the Ranger, a Shove verb at the well. V2: the Beast and Cave Gate, bats, bog lurker, crows.

### 3.7 Stealth, hiding and doors

Vision 7 tiles by day, 3.5 at night, Child -1; walking moves 3 tiles/s, running 4.5 tiles/s, and sneaking (Shift) is silent at 60% of walking speed. A door is usable from 1.5 tiles of its tile centre, the same reach as the other verbs; the body's collision box is a 0.5-tile square under the feet (WORLD 4.2). Noise radii in tiles: walk 2, run 6, door 4, kill scream 8, rag 4, skeleton key 5, crowbar 10, bolt 10, lockpick 5, hide 2, burst out 6, one-way drop 9, the barn goat 4, a Wisp rattle 2; noise renders as a screen-edge pulse with a direction arrow and a log line, crossing a portal at 50% radius and re-emitting at the paired portal. In V1 the server encodes a player's position only to clients in the same scene, as an avatar under a random handle (3.17); the darkness radius is a client-side mask, drawn as the lighting layer of 3.13; a dark scene uses the night radius in every phase. Since M5b a dark scene's radius and occluders hold on the server (3.15): a living seat there receives another avatar only within its night radius and line of sight, and a lit carried light (Lantern, Torch, Candle) adds 2 tiles (`vision.lanternTiles`) to both seeing and being seen; lights start out and are lit by their holder.

**Hiding spots** (wardrobe, hay pile, under bed, barrel; crawlspaces for the Child) hold one player; **body spots** (cellar dump, crypt niche, hay pile) are separate objects. Entering takes 1 s, noise 2; the hidden player sees a slit view and keeps one action, **Burst Out** (E): instant, stuns the Checker 1 s, noise 6. **Check** (E, 2 s) opens a spot; a Check on an occupied spot writes a Verified Notebook entry for the hider ("X opened my wardrobe at 3:12"), so checking is evidence.

**Doors** have four server states: open, closed, locked, broken. Any door unlocks from the inside for anyone. Killer locks expire after 45 s. From outside you see the door swing for 3 s; the entering player is in a 0.6 s `transit` state, encoded to both scenes at the door with the nameplate hidden.

**Death and ghosts.** A kill is private until the next meeting: the roster still shows the victim alive, the victim's client learns at once, and the body in the scene is the only sign; a meeting reveals every death so far. Dead and ejected players become ghosts: walk through walls and portals (no lock, phase or alive checks, no noise), see all roles, read the Cabal and ghost channels, finish their own tasks, and once per cycle use a Wisp (flicker a lantern, rattle a door for noise 2, or nudge a clue 1 tile; V1.5). Ghosts are drawn only for other ghosts. Ghosts cast a non-binding ghost vote shown on the end screen. (M3) A living client never receives a ghost's position; a ghost sees every player in its own scene; nobody's position is sent during a meeting, the reveal or the end screen.

### 3.8 Meetings, voting and win conditions

- **Village** wins when all Cabal are dead or ejected, tasks reach 100%, or the Final Night vote ejects a Cabal member.
- **Cabal** wins at parity (living Cabal >= living Village; Thief counts as Village, Drifter as nobody) at 6+ players; at 4-5 when living Village <= 1; or when the Final Night vote ejects nobody or a non-Cabal player.
- **Drifter** wins alone when ejected, and the match goes on. (M5a) The end screen lists an ejected Drifter among the winners (`gameOver.alsoWon`) whichever faction then wins; a Drifter who is killed, poisoned or shot loses. A Drifter ejected by the Final Night vote wins beside the Cabal.
- **Final Night** (the day that would start cycle 5 begins without a winner, 3.3): night lighting, wolves roam the village, Cabal kill CD 20 s, a 90 s hunt with clues still spawning, then a forced vote with no Skip and the Case Board open; a tie ejects nobody and the Cabal wins.
- Tie or Skip majority: nobody ejected. After two consecutive no-ejection meetings (Drifter ejections count as none) the next vote has Skip disabled and ejects only a player holding at least ceil(living/3) votes; otherwise nobody is ejected and the next cycle has no grace.
- **Hunger**: a Killer with no Knife strike in 2 full rounds leaves glowing footprints until they strike (3.3).
- **Last Shot** (M5a): an ejected Gamekeeper shoots during the reveal (3.2); the win check runs after the shot, with both seats out.
- Disconnect over 60 s = death with cause "vanished" and a body at the last position; reconnection within 60 s resumes the same role. (M3: a player who leaves during play becomes a ghost at once with no body; the window and the body arrive with reconnection in M7, A30.)
- No Clue Surge. A wrong ejection adds 15 s to the next discussion instead.
- (M3) The win check runs when a death is recorded and, for an ejection, when the reveal ends, so the tally, the stamp and the role line always show first; it never runs on a bare tick. A tied vote, or a Skip plurality, ejects nobody. (M5a) A Nightshade death and a Last Shot are deaths like a kill; the win check of a batch that holds a dying Gamekeeper waits until its aim closes, then runs once for every death of the batch. Meeting requests and phase changes never wait for an aim (3.2).
- (M5a) **What a meeting reveals.** An ejection reveals the ejected seat's role card and the look it wore ("Bo was the Killer, walking as the Baker"); a shot fired at the reveal reveals its target's role too. A death in the world (Knife, Nightshade, a shot) only flips `alive` when the next meeting opens; it reveals no role until game over, which shows every seat's role, the look it wore and the two undealt cards (3.17).

### 3.9 Balance by player count

**The deck by player count** (`roles.json` `decks`; player count + 2 cards; every Killer card is always dealt, two of the other cards stay undealt):

| Players | Cards | Cover cards | Village specials | Professions |
|---|---|---|---|---|
| 4 (practice) | 6 | Killer | Detective, Vicar | Lamplighter, Baker, Fisher |
| 5 | 7 | Killer, Drifter | Detective, Vicar, Doctor | Lamplighter, Baker |
| 6 | 8 | Killer, Drifter | Detective, Vicar, Doctor, Watchman | Lamplighter, Baker |
| 7 | 9 | Killer, Accomplice | Detective, Vicar, Doctor, Watchman | Lamplighter, Baker, Fisher |
| 8 | 10 | Killer, Accomplice | Detective, Vicar, Doctor, Watchman, Herbalist | Lamplighter, Baker, Fisher |
| 9 | 11 | Killer, Accomplice | Detective, Vicar, Doctor, Watchman, Herbalist, Gamekeeper | Lamplighter, Baker, Fisher |
| 10 | 12 | Killer x2 | Detective, Vicar, Doctor, Watchman, Herbalist, Gamekeeper | Lamplighter, Baker, Fisher, Tinner |

The Drifter and the Accomplice may be among the two undealt cards; a Killer never is. **Why no deck holds more than two cover cards:** with every Killer dealt, the dealt cover roles minus the undealt non-cover cards always equals the cover cards in the deck minus 2. With at most two, every cover role is always shown an undealt card it can wear (3.17), and from 5 players up the roster shows each non-cover character of the deck exactly once, so the roster alone never tells who wears a cover. At 4 one character of the deck is unworn, and everybody knows its card is undealt. A third cover card would force a visible duplicate every match. (The 10-seat deck's Cabal is two Killers, not two Killers and an Accomplice, for that reason.)

| Players | Cabal in play | Kill CD | Discussion | Tasks each | Extra rules |
|---|---|---|---|---|---|
| 4 (practice) | Killer | 60 s | 60 s | 3 | Cabal needs living Village <= 1 |
| 5 | Killer | 60 s | 60 s | 3 | As above; Doctor added; the Drifter may be dealt |
| 6-7 | Killer (+ Accomplice at 7, if dealt) | 35 s | 75 s | 4 | Parity; Watchman added; the Drifter may be dealt at 6 |
| 8-9 | Killer (+ Accomplice, if dealt) | 30 s | 90 s | 4 | Herbalist at 8, Gamekeeper at 9 |
| 10 | 2 Killers | 40 s each, 15 s global lock | 90 s | 5 | Suspect sets decide |

The Knife works only after dark (3.3), about 110 s of each 170 s cycle, so a cooldown buys at most two strikes per Killer per night at 4-5, four at 6-9 and three at 10. (M5a) The soak checks these values: the median match length is 12-18 min and at most one third of matches reach the Final Night (`phases.dayS`, `phases.nightS` and `finalNight.afterCycle` are the M5a values, revisited in M5b). Snowball guard: when living Village <= Cabal + 2, kill CD +10 s and the next kill spawns all 3 trait clues; when only one Killer remains with >= 6 alive, kill CD -5 s. All of these are `balance.json` values; the first playable ships plain plurality with Skip and enables the anti-stall rules one per playtest.

### 3.10 V1 cut list

**First playable (M3, "Mafia with walking")**: lobby, 5-char codes, reconnection in lobby; roles Killer / Detective / Doctor / Townsfolk; traits height + scarf; overworld 40x30 greybox + tavern (2 rooms) + widow cottage (2 rooms) + forest + cave entry; kill, body, Blood tint, two clues, Notebook, Detective auto-Verified; report / bell; meeting with portraits, chat, secret vote, eject + reveal; checkWin; ghosts with ghost chat.

**V1 (beta)**: everything in 3.1-3.9 marked V1: Butler, Child, Accomplice, Drifter; Lens charges, Dust / Compare, Autopsy, Bandage, Ledger, Witness, Plant Clue, Rag, Bucket; Case Board with suspect sets and Corroborated; 6 task types incl. 1 co-op; wolves, fence; hiding spots, Burst Out, Check; door states, Skeleton Key, Crowbar; Hunger, Final Night vote, missing-person roll-call; quick-chat, Cabal and ghost channels; scene profiles Small / Medium / Large; 10-player rules; the n+2 deck, professions, public looks and covers, Impersonate, the Vicar, Watchman, Herbalist and Gamekeeper (M5a).

**V1.5**: Ranger (Arrest), Thief, Heirlooms, cave sea exit, Handcuffs, Forged Alibi, the Killer's Lock door, Candles for all, Wisp, Butler Bell, lit-window silhouettes, proximity chat toggle, faction-only reveal, fisher cottage, lighthouse, lobby role toggles, radius + occluder visibility (dark scenes first, M5b; 3.13), Lottie reveal, Light2D experiment, spectator mode.

**V2**: Medium, the Beast and Cave Gate, bats, bog lurker, crows, poison, voice chat, cosmetics; first-person renderer.

### 3.11 One Night Ultimate Baguette (quick mode)

**Being removed (round 7, DECISIONS A115).** On 2026-10-23 the owner chose to remove the quick mode from the game. Session 7J deletes it (`docs/round7/quick-mode-removal.md`); until its PRs land the rules below still describe what the code does, and when they land this section becomes a short record so 3.12 to 3.21 keep their numbers. Crumb's Ovens stays as a HollowMere building and gains four rooms (A116, 3.13).

Origin: the owner's friend first framed the whole game as "One Night Ultimate Baguette", a wrapper around the one-night hidden-role card game; on 2026-10-17 the owner supplied the full mode (two cards per player, four prep stations, night roles, a 5-minute Morning Rush, one vote) and its art. This section is **ONUB v2**, an original ruleset with original wording that replaces the round-4 wake-loaf mode; the round-4 bakery scene stays frozen and unused. Lobby setting `mode = onub`. Target length 8-10 minutes (`targetLengthMin` in `balance.onub.json`, which the lobby chip reads; "Balance and length" below gives 8.7 to 9.7 minutes plus jitter, less when prep ends early). The roles, teams, scenes and card texts are `roles.onub.json`; the decks, stations, ingredient cards, mini-games, acts, night windows, timers, vote rule, winners table and NPC numbers are `balance.onub.json`.

**Fiction.** Paris, the graveyard shift before the Bake-Off. You are French bakers keeping the Mother Dough alive through the night; hidden among you are Mold Spores who want it ruined. Nobody leaves the kitchen and nobody is eliminated during the night: the whole match comes down to one argument at dawn and one vote on who goes into the brick oven. **Nobody walks in this mode**: every screen is a card table or a kitchen room over the owner's art, and the server never places a seat in a scene.

**Two cards each.** Every player holds a **Role card** (who you are) and a **Location card** (the station you worked at during prep). The **Pantry** in the middle of the table holds `pantry.roles` (3) Role cards and `pantry.locations` (3) Location cards. Role cards are dealt with the role card; a player's Location card is the station they pick at prep; each Pantry Location card is drawn uniformly over the four stations, repeats allowed. Cards move at night. **You play for the team of the Role card in front of you at dawn**, never the one you were dealt, and after the night nobody may look at their own cards: the client only ever shows what you were dealt, where you chose to work and what your own act showed, as memory.

**Teams** (`roles.onub.json` `teams`).

| Team | Cards | Wins (the winners table below) |
|---|---|---|
| Loyal Bakers | every baker role, the Critique included | at least one Mold Spore goes in the oven; with every Spore in the Pantry, the oven stays empty or takes a Team Mold card |
| Team Mold | Le Champignon (the only **Mold Spore**), Le Levain, L'Apprenti, Le Rat de Cave | the Mother Dough is ruined at prep, or no Spore goes in the oven |
| On your own | Le Croissant Rassis | goes in the oven |

**The match.**

| Phase (value) | Time | What happens |
|---|---|---|
| Role card (`roleReveal`, 1) | `timers.roleCardS` 12 s, ends early when all are ready | your dealt Role card; nobody learns a teammate here, and nobody sees who is ready |
| Evening Prep (`dusk`, 4) | `timers.prepS` 60 s, ends early when every seat has committed (`prep.endsWhenAllCommitted`) | pick a station, play its mini-game, play one Ingredient card into its pile |
| The crime scenes (`prepReveal`, 13) | `timers.prepRevealS` 15 s | every pile is shuffled and flipped; flags, net weight and ruin are announced |
| The Baking Cycle (`night`, 5) | the windows of the deck plus `timers.fadeS` 2 s each | the roles wake one by one and tamper with the cards |
| Dawn (`dawn`, 6) | `timers.dawnS` 5 s | the Iron Cloche is shown |
| Morning Rush (`meetingDiscussion`, 7) | `timers.rushS` 300 s, never shortened | everyone argues; structured claims; votes may be cast and changed |
| "Un, deux, trois, CRUST!" (`meetingVote`, 8) | `timers.voteS` 20 s, opening with the `timers.crustCountdownS` 3 s countdown; ends early when every seat in play has voted, never before the countdown has played | the last chance to point |
| The Final Bake (`reveal`, 9) | `timers.revealS` 30 s | who goes in the oven, and what they hold |
| Game over (12) | `balance.phases.gameOverS` | every card, pile and act of the night; back to the lobby with the same code |

**Roles** (15 role ids; the wake order is the night table below).

| Wake | Role | Team | Night act |
|---|---|---|---|
| 1 | **Le Boulanger** (Head Baker) | Bakers | Puts the Iron Cloche on any player's Role or Location card, their own included. |
| 2 | **Le Champignon** (The Mold Spore) x1-2 | Mold, a Spore | The Spores see each other. A Spore who is alone at the table may peek at one Pantry Role card. |
| 3 | **Le Levain** (The Sourdough Starter) | Mold | Sees which players were dealt Le Champignon. The Spores never learn who the Levain is. |
| 4 | **L'Apprenti** (The Unpaid Intern) | Mold | Peeks at one other player's Location card. Sees no teammate. |
| 5 | **Le Rat de Cave** (The Cellar Rat) | Mold | Swaps their own Location card with a Pantry Location card or another player's, and sees the one they now hold. Sees no teammate. |
| 6 | **Le Commis** (The Line Cook) x0 or x2 | Bakers | The two Commis see each other; a lone Commis knows the other is in the Pantry. |
| 7 | **Le Chef de Cuisine** (Executive Chef) | Bakers | Peeks at one other player's Role card, or at two Pantry Role cards. |
| 8 | **L'Aboyeur** (The Expediter) | Bakers | Looks at two other players' Location cards. |
| 9 | **Le Sous-Chef** (Second-in-Command) | Bakers | Swaps their Role card with another player's and looks at their new card. |
| 10 | **Le Tourrier** (Dough Sheeter) | Bakers | Must look at one Pantry Role card, then swap it with any player's Role card, their own included. |
| 11 | **Le Plongeur** (The Dishwasher) | Bakers | Swaps two other players' Role cards, or two other players' Location cards, without looking. |
| 12 | **Le Garde Manger** (The Larder Cook) | Bakers | Must swap their Role card with a Pantry Role card without looking. |
| 13 | **L'Inspecteur Sanitaire** (The Health Inspector) | Bakers | Looks at their own Role and Location cards. |
| – | **Le Croissant Rassis** (The Stale Croissant) | On your own | No night act. Wins alone if put in the oven. |
| – | **Le Critique Gastronomique** (The Food Critic) | Bakers | No night act (Restaurant Shutdown): if put in the oven, the player they voted for goes in too. |

Every Team Mold card may sabotage at prep (`sabotages`); only Le Champignon is a Mold Spore for the winners table (`spore`). The Critique's copy variant (wake first and copy another player's role) is V1.1 behind `rules.critiqueCopies`, false in V1; when it ships it wakes between the Boulanger and the Spores.

**Decks** (always player count + 3 cards; `byCount[n].deck`).

| Players | Default deck |
|---|---|
| 4 | Champignon x2, Chef de Cuisine, Aboyeur, Sous-Chef, Plongeur, Inspecteur Sanitaire |
| 5 | + Croissant Rassis |
| 6 | + Levain |
| 7 | + Rat de Cave |
| 8 | + Garde Manger |
| 9 | + Boulanger |
| 10 | + Tourrier |

L'Apprenti, the two Commis and the Critique enter only through the leader's **deck editor** in the lobby (`Settings.onubDeck`, public; empty means the default deck for the party size). The server accepts a custom deck in `lobby.settings` only if every card is a V1 role of `roles.onub.json`, each role appears a number of times listed in its `copies` (Champignon 1 or 2, Commis exactly 2, every other role once) and every `required` role (Champignon) is present; at Start the deck must hold the party size (after the NPC fill) plus `pantry.roles` cards, or Start is refused 422 and the editor shows why. The deck in play is public all match (`OnubBoard.deck`), as is every window it runs, so the night's length leaks nothing.

**Evening Prep** (the Among Us phase, owner decision for round 5). The screen is the kitchen overview: four station rooms around the pass, drawn over the owner's station art (`onub_station_<id>`). You tap a room; your baker goes in (a client-side transition of `timers.stationTransitionS`), and you play that station's **mini-game**. The mini-game is the gate: the hand opens only when it is done. Then you pick one **Ingredient card** from your hand and commit: one `act.ability {abilityId: 'onub.prep', targets: [stationId, cardId]}`, accepted once (a repeat is 422). Your hand at a station is that station's good cards, plus its sabotage cards if the role you were dealt is Team Mold; Team Mold may play good to blend in. Before you commit you may back out to the overview and choose another room (the mini-game restarts); the commit is final. Mini-games are client-side skill only: their result never reaches the wire and nothing on the server depends on it; after `timers.minigameAssistS` 20 s in a mini-game a Done control appears, so no one is ever stuck. No other player is ever shown during prep, and nothing public changes when a seat commits (no ready tick, no count). When the prep timer ends, the server commits a seeded station and a seeded good card of that station for every seat that has not committed (`prepTimeout` stream). The same happens for a seat that has left the room, so every seat's Location card exists at night; prep ends early only when every seat still in the room has committed. A commit is refused 425 outside Evening Prep and 422 when it is a second commit, names an unknown station, plays a card the seat may not (a sabotage card for a role that does not sabotage, or another station's card) or has malformed `targets`. (5A) Your own committed station and card are private to you (`Private.onubLoc`, `Private.onubCard`); your station becomes your Location card.

| Station | Mini-game (`stations[].minigame`) | Good cards | Sabotage cards | Weight | Special |
|---|---|---|---|---|---|
| **La Chambre Froide** (The Walk-In Fridge) | Cold check: drag 3 crates from the frosted shelves to the cart, then release the thermostat needle inside the cold band (20% of the dial) | Pure Dairy, Active Yeast | Spoiled Milk, Unpasteurized Mold, Thermostat Flip | 1 | Thermostat Flip discards one other card of this pile, unseen |
| **Le Pétrin** (The Industrial Mixer) | Pour to the line: hold to pour flour, release with the level inside the line band (12% of the bowl), then the same for water; the bowl fills at 35% a second and an over-pour empties it | T55 Flour, Sea Salt | Sawdust, Plaster, Floor Sweepings | 1 | exactly 1 card: under-mixed, a caution flag worth 1 ruin |
| **La Chambre de Pousse** (The Proofing Drawer) | Into the warm: slide 4 bannetons into the cabinet's glowing slots | Warm Steam, Time | Cold Draft, Over-Proofing | 1 | no sabotage card here: its visitors peek at one Pantry Location card |
| **Le Four à Pain** (The Brick Oven) | Stoke: tap to feed oak (15% heat a tap) against an 8%-a-second cool-down and hold the needle in the band (18%) for 3 s | Oak Firewood, Steam Injection | Charcoal Ash, Wet Wood | 2 | a sabotage card here counts double |

The client draws the bands at a random height each time with a local RNG; the band widths, rates and counts are `stations[].minigame`. The frosty footprints of the owner's spec are flavour only.

**The crime scenes** (`prepReveal`). Each station's pile, its cards sorted by id, is shuffled (`piles` stream) and flipped face up on the public board (`OnubBoard.piles`), showing where sabotage happened but never who played it. The pile resolution (`resolvePrep`):

- **Thermostat Flip.** For each Thermostat Flip in the shuffled Fridge pile, while it is still in the pile and the pile holds another card, one other card of the pile is discarded by seed (`thaw` stream), unseen. The board reads "1 card lost to the thaw" per card lost, so cards shown plus cards lost always equals the station's visitors. A discarded card counts for nothing.
- **Net weight.** Per station, net = max(0, sabotage cards x the station's `weight` - good cards x `ruin.goodCancels`), over the cards still in the pile. The Oven's weight is 2, every other station's 1.
- **Under-mixed.** A Mixer pile of exactly one card (`underMixBelow` 2) raises the public caution flag and adds `underMixWeight` 1 to the ruin weight. An empty Mixer is idle: no flag.
- **Ruin.** The ruin weight is the sum of the nets plus the flags. At the party size's ruin weight (`ruin.weightByCount`: 3 at 4-5, 4 at 6, 5 at 7-10) or more the Mother Dough is **ruined**: the board says so at once and the match goes on, since the Stale Croissant can still steal the win (winners table).
- **The proofing perk.** If the Proofing Drawer had at least one visitor and no sabotage card was played there, each of its visitors privately sees the same Pantry Location card, picked by seed (`perk` stream; a `nightReveal` entry). Visitors are not told who else proofed. The board shows only that the perk happened.

**The Baking Cycle** (the One Night Werewolf phase). The night is played over the owner's role-scene art: when your window opens, your role's room fills the screen (`onub_scene_<scene>`) with a card table on it: one Role and one Location card face down per seat in deal order, the Pantry's six cards, and the Iron Cloche if it is out. Everyone else sees the same lights-out screen all night, with the narrator: as each window opens and closes, every seat sees and hears its call ('Le Sous-Chef, réveillez-vous…', copy `onub.narrator.<roleId>.wake` and `.sleep`). The open window is public (`OnubBoard.window`, a role id, '' during fades), because every window of the deck runs whatever was dealt. Under the narrator plays the sleepers' sound bed, muffled kitchen noises at random every `timers.sleeperPulseMinS` to `sleeperPulseMaxS` s, generated client-side with no link to the windows. A waker's client plays exactly the sleepers' sound bed plus the narrator: no wake cue, no role-scene audio. A waker goes back to the lights-out screen when the window ends. The server runs a Conductor over a fixed list of windows built from the deck: every window whose role is in the deck runs, dealt or in the Pantry, in `order`, each with a seeded 0-`timers.windowJitterMaxS` 3 s jitter (`script` stream) and a `fadeS` 2 s fade after it, so the night's length says nothing about the deal. A window runs its whole length whether or not anyone woke or acted in it; an early finish would tell the table who was awake. Only players whose **dealt** role matches the open window are woken; they act as what they were dealt.

| # | Window | Seconds | You see | You may do |
|---|---|---|---|---|
| 1 | Le Boulanger | 10 | the table | put the Iron Cloche on any player's Role or Location card, your own included |
| 2 | Le Champignon | 12 | the other Spore (the cards of the seats dealt it glow) | alone at the table: peek at one Pantry Role card |
| 3 | Le Levain | 8 | the seats dealt Le Champignon | nothing |
| 4 | L'Apprenti | 10 | the table | peek at one other player's Location card |
| 5 | Le Rat de Cave | 10 | the table | swap your Location card with a Pantry Location card or another player's; you see your new one |
| 6 | Le Commis | 8 | the other Commis, or that you are alone | nothing |
| 7 | Le Chef de Cuisine | 12 | the table | peek at one other player's Role card, or at two Pantry Role cards |
| 8 | L'Aboyeur | 12 | the table | look at two other players' Location cards |
| 9 | Le Sous-Chef | 10 | the table | swap your Role card with another player's; you see your new one |
| 10 | Le Tourrier | 14 | the table | must look at one Pantry Role card, then swap it with any player's Role card, your own included |
| 11 | Le Plongeur | 12 | the table | swap two other players' Role cards, or two other players' Location cards; nothing is shown |
| 12 | Le Garde Manger | 8 | the table | must swap your Role card with a Pantry Role card; nothing is shown |
| 13 | L'Inspecteur Sanitaire | 8 | the table | look at your own Role and Location cards |

**The Iron Cloche.** It may cover the Boulanger's own card. For the rest of the night nobody can peek at or swap the covered card, except that the Inspecteur still reads their own cards; an act that would move a player's own covered card (the Sous-Chef's, the Rat's or the Garde Manger's own) cannot be made at all, and the Garde Manger's must-act is then skipped. Every later waker sees where it lies, and it becomes public at dawn (`OnubBoard.cloche`). It never covers a Pantry card.

**Must and may.** The Tourrier and the Garde Manger must act: if their window ends first, the server completes the act by seed (`nightTimeout` stream), and the actor's reveal is still written. Every other act may be skipped. Every act arrives as one `act.ability {abilityId, targets}` through the command queue (the Tourrier's two steps as two messages, the second naming the seat whose Role card takes the peeked Pantry card) and is accepted only if the phase is night, the open window's role is the actor's dealt role, the act belongs to that window (a lone-Spore act only when no other seat was dealt Le Champignon), the actor has not acted this window, and every target is legal: the right kind and owner of card, distinct, never under the Cloche. Refusals: 425 outside the actor's window, 422 for anything else. Every accepted act answers its actor with `nightReveal` (empty for an act that shows nothing), so the client always knows it went through.

**Dawn and the Morning Rush.** A 5 s dawn shows where the Iron Cloche lay, then the Morning Rush opens: one 300 s argument with global text chat, the portraits, and the public board (the piles, their flags, the ruin line, the Cloche and the deck in play). **Claims** are structured and public, one per seat, replaced by the next (`meeting.claim`): the role you say you were dealt, optionally the station you say you worked at and the card you say you played, and up to `claims.maxSaw` (2) things you say you saw, each a player or the Pantry with a role or a station ("I was L'Aboyeur, I worked the Oven and played Oak Firewood: Hana's Location card was the Fridge, Bo's was the Mixer"). Claims are claims: the server checks only that the ids exist and that the claimed role is in the deck. Votes may be cast and changed during the Rush and during CRUST; who has voted is public, for whom is secret.

**The vote.** When the Rush ends, CRUST gives everyone `voteS` 20 s to point: at another player, or at the Pantry (`"pantry"`). It always opens with the countdown, "Un, deux, trois, CRUST!" (`timers.crustCountdownS` 3 s), and its early end, once every seat in play has voted, applies only after the countdown has played. There is no Skip and no self-vote (422); a missing vote is an abstention and the reveal names the abstainers. Resolution (`resolveDawn`): everyone holding the most votes goes in the oven, ties included, if that count is at least `vote.minVotesToTurnOut` 2; if the Pantry is among them it "goes in" too, which removes nobody. **Restaurant Shutdown:** if a player whose final card is Le Critique Gastronomique goes in, the player that seat voted for goes in with them (`vote.critiqueHops` 1 hop; nothing for a vote at the Pantry or an abstention). A seat that leaves during the match abstains and is no target, but keeps its cards: they still move at night and still win or lose. Winners are judged on the **final** cards after the hop; the first row that holds applies.

| Row (`winners[].id`) | When | Who wins |
|---|---|---|
| `croissantAndBakers` | the Croissant and a Spore both go in, the dough not ruined | the Croissant and every Loyal Baker card |
| `croissant` | the Croissant goes in | the Croissant alone; the Croissant beats ruin |
| `ruined` | the dough was ruined at prep | every Team Mold card |
| `sporeOut` | a Spore goes in | every Loyal Baker card |
| `sporesHide` | a Spore is at the table and none goes in | every Team Mold card, those in the oven included |
| `cleanTable` | no Spore at the table and nobody goes in (pointing at the Pantry, or votes too spread) | every Loyal Baker card |
| `moldOut` | no Spore at the table and a Team Mold card goes in | every Loyal Baker card |
| `wrongOven` | no Spore at the table and someone else goes in | every Team Mold card at the table; nobody if no player holds one |

`GameState.winner` is `croissant` when the Croissant wins (with or without the Bakers), `village` for the Bakers, `cabal` for Team Mold, `nobody` when no seat wins; the end screen's headline is the row's own line, never the enum.

**Reveal and game over.** The reveal names everyone who went in (with the Critique's drag shown apart), the final Role card each held, whether the Pantry was pointed at, and the abstainers; those in the oven are marked out. The end screen shows, per seat, the Role card dealt and held at dawn, the station chosen and the Location card held at dawn, and the card played at prep; the Pantry's cards dealt and at dawn; every pile with its lost cards named; the Cloche; the night as a timeline of every accepted act in window order ("Le Sous-Chef took Hana's card", "Le Plongeur swapped Bo's and Kit's Location cards", "Le Garde Manger swapped with a Pantry card, without looking"), marking acts the server completed by seed; and the vote arrows. Then the room returns to the lobby with the same code and the same mode and deck.

**Role cards.** Every card carries the line (`cardLine`): "You play for the card in front of you at dawn, not the card you were dealt. Argue for who you think you are." The card shows the French name, the English gloss under it, the team's name (`teams[team].name`, sent as `RoleRevealPayload.teamName`), the night act and the text below.

| Role | Card text |
|---|---|
| Le Boulanger | Your dough, your bench, your cloche. Slam the Iron Cloche over the one card you trust; nothing touches it until dawn. |
| Le Champignon | You crawled out from behind the damp bricks to ruin the Mother Dough. Ruin it at prep, or keep every Spore out of the oven. |
| Le Levain | Your jar bubbles over to feed the spores. You know who they are and they do not know you: lie for them, even into the oven. |
| L'Apprenti | Sixteen hours on a stool and nobody pays you. You read one line of the shift log; use it to cover for Team Mold, whoever they are. |
| Le Rat de Cave | You pry up the floor grate and leave flour prints in someone else's room. Trade your alibi for a better one. |
| Le Commis | You chopped side by side all shift. Vouch for each other, unless the night moved one of you. |
| Le Chef de Cuisine | Under the green banker's lamp you audit the personnel files. Find the rot before the bake. |
| L'Aboyeur | The grainy green monitor shows every room. You know where two people really worked; catch the one lying about it. |
| Le Sous-Chef | You ring the brass bell and reassign the staff. Whatever card you take is who you are now, even if it is mold. |
| Le Tourrier | You fold an unused recipe back into the line. Someone wakes up as somebody else, and only you know what went in. |
| Le Plongeur | Soapsuds, steam and wet-floor cones: you put the pans back in the wrong places, and nobody, you included, knows which. |
| Le Garde Manger | One glass of cooking wine too many. You wandered off and came back wearing someone else's apron. |
| L'Inspecteur Sanitaire | Clipboard, thermometer, UV torch: you make the last sweep before opening. You alone know what you hold at dawn. |
| Le Croissant Rassis | Hard as a rock under the display-case spotlight, you pray for the oven. Act just guilty enough; if they bake you, you win alone. |
| Le Critique Gastronomique | Behind the velvet rope with an empty plate and a fountain pen, you judge the kitchen. If they bake you by mistake, your pen drags your vote in with you. |

**Privacy.** Nothing a client receives before game over tells it another seat's station, card played, night act, current card or whether it woke; every seat sits in the `loft` pseudo-scene (`LOFT_SCENE_INDEX`) from prep to the lobby, so the server encodes no presence for anyone; prep commits change nothing public; the Pantry's contents reach only a peeker; the open window is public, since every window of the deck runs whatever was dealt; the deal, the pile order, the thaw, the perk, the night script and the timeouts each draw from their own crypto-seeded stream, and every NPC seat from its own `npcPlay:<seatId>` and `npcTiming:<seatId>` streams (`sim/seeds.ts`), so nothing public correlates with the deal.

**NPC seats** (3.12 seats them; their numbers are `balance.onub.json` `npc`, the row chosen by `Settings.npcDifficulty`). An NPC readies on the role card like everyone (3.12). At prep it commits after a delay drawn from `npc.commitS` (12-40 s), at a station drawn uniformly whatever its role, with a seeded good card, or, if its dealt role is Team Mold, a sabotage card with chance `sabotageChance` (0.4 / 0.6 / 0.8). Each NPC seat draws only from its own streams, `npcPlay:<seatId>` and `npcTiming:<seatId>`; the prep sabotage roll is drawn by every NPC and ignored unless its card sabotages. Woken, it acts at a tick drawn from `actFrac` (0.25-0.75) of its window, a flat seeded draw over the legal acts of its wake view plus "nothing" for an act that may be skipped, then that act's slots drawn uniformly from the pool the view lists; the Tourrier's second step follows its first after a delay drawn from `npc.stepS` (0.5-1.5 s). In the Rush it posts one claim at `claimFrac` (0.05-0.4) of the Rush: the truth for a Baker card (`claimTruthChance.baker` 1: its dealt role, station, card and what it saw); for Team Mold a seeded Baker role of the deck, the lone Spore preferring the Pantry role it peeked, with a station whose pile is clean when it sabotaged; the Croissant claims a seeded Baker role with a station whose pile holds sabotage, to look guilty. It votes at a tick drawn from `voteFrac` (0.3-0.9) of the Rush plus CRUST: with chance `smartVoteChance` (0.3 / 0.6 / 0.9) the seat it has the best evidence against (a seat its own peek showed holding a Team Mold card, else a seat whose claimed station has net sabotage and is not a known teammate), otherwise a seeded other seat; never the Pantry, never itself. NPCs never chat (3.12).

**Balance and length.** Night length is the windows of the deck plus 2 s per window, before jitter: 78 s at 4-5 players, 88 s at 6, 100 s at 7, 110 s at 8, 122 s at 9, 138 s at 10 with the default decks (jitter adds up to 3 s per window). The whole match is card 12 + prep up to 60 + crime scenes 15 + night + dawn 5 + Rush 300 + CRUST up to 20 + reveal 30: about 8.7 minutes at 4 players to 9.7 at 10, plus jitter, and less when prep or CRUST ends early, so the lobby chip reads 8-10 (`targetLengthMin`) and the Rush is the knob if playtests want longer. At 4-5 the deck is two Spores against an investigator, a camera and two swappers, with the Croissant as the first bluff; at 6-8 the Levain, the Rat and the Garde Manger make every alibi and every identity doubtful; at 9-10 the Cloche and the Tourrier give the Bakers a protected fact and a new piece of chaos. The soak reports the ruin rate per party size; the target is 20-30% of matches with a Team Mold card at the table, tuned with `ruin.weightByCount`, the Oven's `weight` and `underMixWeight`. Replayability comes from the deal, the free choice of stations and the night reshuffling both identities and alibis; the end screen's timeline teaches the table. The mode has no ranking.

**V1 cut.** Ships: the mode toggle and the deck editor; the 15 roles of `roles.onub.json` with the Critique as Restaurant Shutdown; the kitchen overview, the four station rooms and their mini-games over the owner's art (the Brick Oven generated to match, A17); the crime-scene board; the night as role scenes with the card table and the lights-out screen; the Morning Rush with structured claims, the Pantry vote and CRUST; the winners table; the reveal and the end screen with the act timeline. V1.1: the Critique's copy variant (`rules.critiqueCopies`), lobby role picks beyond the deck editor, animated card moves at the end screen.

**Naming caution.** The mechanics of the one-night card game are not protected, but its name and its card art and text belong to its publisher; nothing here reuses them. The parody title is an in-joke for a free game among friends and appears only in the lobby chip's `lobby.mode.onub` line. If Who Did It is ever sold, the mode ships under the neutral label **"The Night Shift"** (the working label of A22, in place of "The Wake Loaves"), and no other line changes.

### 3.12 NPC fill (below the minimum)

**Decision (owner, 2026-10-10, A16 and A26):** a party may start with fewer than `players.min` humans; the server fills the empty seats with NPC villagers so the full deck is dealt (3.1).

- **Seats.** Start is enabled with at least 1 human. With fewer than `players.min` players the server adds NPCs up to `players.min` when Start is accepted, before it deals, so the full deck row is always dealt (M3c; the A28 cut row is gone); the leader may add NPCs by hand in the lobby with "Add NPC" up to `players.max` and remove them again, the newest seat first (M3c). A human joining a full lobby takes an NPC's seat, the newest first (M3c). (M5a) An NPC seat is never Ready the moment it appears: a seat added with Add NPC, and every NPC seat when a match returns to the lobby, turns Ready 2-9 s later (`npc.ready.delayS`), each on its own draw, the way a human clicks.
- **Same game.** NPCs are dealt from the same deck and can hold any card, the Killer included; their cards are as secret as a human's. Rules, the practice label at 4 (3.1, 3.9) and any ranking depend only on the total player count, never on how many seats are NPCs. (M5a) In the main mode an NPC walks as its card's character like every seat; an NPC cover role wears the look it was shown and never Impersonates (3.17); an NPC holding a night power uses it as 3.2 says, at the moment "Meetings, the role card and night powers" below gives.
- **Hidden seats.** Nothing a client receives marks a seat as an NPC: `isNpc` lives in room memory only, and NPCs take human-style names from a name pool, are never the party leader, and carry an id of the same shape as a session id; the party publishes only how many seats are NPCs, never which (M3c). (M5a) **Everything an NPC shows is something a human can do the same way in the same place.** It walks at walking speed and never runs or sneaks. It never turns on the spot: it faces where it last stepped, and it ends every approach to a station with a step toward the station. It starts a hold only with the verb a human uses (`act.hold`), so it plays the `interact` animation only while a hold the server accepted from it runs, and it works with that animation only at stations where a human could start the same hold (`routines.json` `holds`; there are none in M5a, so at every station it simply stands, idle). Its ready and vote ticks are spread over the spans a human uses (below). NPCs never chat, which a table that knows each other will notice; nothing on the wire confirms it.
- **Animation (M5a, every seat).** A seat shows `interact` (`Presence.animId` 4) on every tick an `act.hold` of its own runs, whatever the hold, human or NPC; it shows `walk` only on a tick its body actually moved, so a seat pushing against a wall stands idle instead of walking in place; `idle` otherwise. One `interact` id serves every hold, as one `swing` serves every strike, so the animation never tells one action or role from another.
- **Difficulty.** A lobby setting, Easy / Normal / Hard, default `npc.defaultDifficulty`. It is enabled only when the party holds at least `npc.difficultyMinNpcs` NPC seats; with fewer, NPCs play the default. The setting and the mode survive the return to the lobby after a match (M3c). Each level is a row of `balance.json` `npc.difficulty`:

| Value | Meaning |
|---|---|
| `killChancePer10s` | A Killer NPC strikes a human alone in its scene after dark with this chance per 10 s of opportunity; the kill-opportunity timer (`npc.aloneKill`, the rules below) strikes regardless of it |
| `reportDelayS` | Delay before an NPC reports a body it sees |
| `plantsPerNight` | False clues an Accomplice NPC plants per night |
| `suspectVoteChance` | Chance an NPC votes for the player with the most Verified clues on the Case Board instead of Skip |

- **Routines (M5a, main mode).** In a world phase an NPC runs a routine instead of the M3c wander.
  - **Persona.** When the match is dealt, each NPC draws a **home**, one interior scene of the map that is open at the party's size and lit at night (see Night; no two NPCs share a home while the map has enough), and **3 favourite stations** (`npc.routine.favouriteStations`), in 3 different scenes where the map allows.
  - **Stations.** A station is a prop whose kind `routines.json` lists under an activity: **work** (the task benches and sources, the pump, the flour bin, the oven, the basins, the goat, the fence, the shutters) by day; **social** (the notice board, the dartboard, the bell, the lamps, the furniture and decorations) by day and by night; **rest** (the lantern posts) by night. Grace, day and immunity are the **day** class of phases; dusk, night and the Final Night hunt the **night** class (`routines.json` `phaseClasses`). Props of any other kind (the kit chest, the teaching clue, keys, gas pockets, locked doors, the frozen round-4 bakery props) are never stations.
  - **Choosing.** Whenever an activity ends, the NPC draws the next one from its phase class's weights:

    | Class | work | stroll | idle |
    |---|---|---|---|
    | Day (`npc.routine.weights.day`) | 0.5 | 0.3 | 0.2 |
    | Night (`npc.routine.weights.night`) | 0.2 | 0.3 | 0.5 |

  - **Work.** The NPC walks to a station and stays 12-30 s (`npc.routine.stationDwellS`): about 2 stations in a 60 s day. A station qualifies when its activity is open in the phase class, its prop and scene are present and open at the party's size, its scene belongs to the map and is reachable, at night its scene is lit, it is not the station the NPC just left, and no other NPC is at it or heading for it. Until the NPC's **scene dwell** has run (30-90 s, `npc.routine.sceneDwellS`, drawn at every scene entry and at every placement on the square) only stations of its own scene qualify; once it has run, only stations of scenes one open door away do, so the NPC moves on one scene at a time and never passes through a scene without its dwell (a Killer NPC's hunt, below, is the exception). It takes a favourite when one qualifies, else a qualifying station at random; when no station of another scene qualifies it falls back to its own scene's, and when none qualifies at all it strolls instead. It stands at the centre of a floor tile orthogonally next to the station, inside the verb reach (1.5 tiles, 3.7), and takes one last step toward the station, so it faces it. If another seat already stands on that tile when it arrives, it idles where it is and picks again. Where `routines.json` `holds` names a hold for that kind of prop, it works in cycles: it starts that hold with the human verb and, when the hold ends, pauses 1-3 s (`npc.routine.workPauseS`) before the next; a refused hold ends the cycles for that visit and it just stands. Where `holds` names none (every station in M5a), it stands there, idle, for the whole dwell.
  - **Stroll.** The NPC walks to a random floor tile of its own scene 3-10 tiles away along a path (`npc.routine.strollTiles`).
  - **Idle.** The NPC stands still 2-8 s (`npc.routine.idleS`), facing where it last walked.
  - **Legs and pauses.** A walk inside one scene that ends at a portal, and a stroll, is a **leg**; after a leg the NPC idles 2-8 s with chance 0.6 (`npc.routine.idleChanceAfterLeg`); the last walk to a station ends in work, not in an idle. An NPC that has walked 12 s (`npc.routine.maxWalkS`) without standing still for 2 s (`idleS` minimum) stops and idles 2-8 s, then goes on with what it was doing. A goal it has no path to, whose crossing is refused, or on which it moves less than a quarter tile in 2 s (`npc.routine.stuckS`) is dropped: it idles and picks again, never the same station.
  - **Clues.** The first time an NPC sees a clue it has not collected (inside its vision radius, 3.7), it decides with chance 0.5 (`npc.react.collectChance`) to collect it; at its next choice, if it is still in the clue's scene and the clue is still there, it walks to the clue and holds Collect exactly as a human does (2 s, 3.4), and the entry goes to a Notebook nothing reads. It never tries during immunity, when no verb works.
  - **Fallback.** In a scene with neither a qualifying station nor a stroll tile, the NPC walks as in M3c: a new heading every 1-3 s (`npc.wander.stepMinS` to `npc.wander.stepMaxS`), aimed at the nearest portal with chance 0.25 (`npc.wander.portalSteerChance`), a portal in reach taken with chance 0.4 (`npc.wander.portalChance`), until it reaches a scene with somewhere to go.
  - **Targets.** An NPC walks for about a third of a day. The server tests hold every NPC to walking at most 60% and at least 10% of a day, to a still stretch of at least 2 s in every 20 s of day, and to no portal crossing before its scene dwell has run (outside the exceptions below).
- **Night (M5a).** A scene is **lit at night** when it is not dark (no `dark: true`, its `biome` neither `forest` nor `cave`) and it is an interior, or it holds a light that shines at night: a scene `lights` entry with no `phases` or with `night` among them, or a prop of a `routines.json` `lightKinds` kind (the lantern posts of a square). Whenever an NPC stands in a scene that is not lit during the night class (so at once when dusk or the Final Night hunt begins), it waits 0-15 s (`npc.night.leaveDelayS`, a fresh draw each time), its routine going on inside that scene (it takes no station and crosses no portal meanwhile, so it strolls and idles), then walks to its home with its usual leg pauses (Legs and pauses) and whatever its scene dwell, or to the nearest lit scene when its home is out of reach. Through the night class it keeps to lit scenes: its stations are the ones open at night in lit scenes, it strolls only inside its scene, and it crosses a portal only toward a lit scene. A Killer NPC picks, whenever its routine chooses next and one qualifies, a station in a lit scene where exactly one living seat stands and that seat is a human who is not its Cabal mate, so it hunts the way the strike rule below kills; the hunt overrides the work, stroll and idle draw and ignores the scene dwell, may cross several scenes, and counts as a reaction.
- **Reactions (M5a).** A reaction interrupts the routine and ignores the scene dwell and the walking pause. **A body**: the first time an NPC sees a body it did not make (inside its vision radius), it freezes 0.5-1.5 s (`npc.react.startleS`), then walks to the body and reports it `reportDelayS` after it first stands in report reach (the difficulty row). A Killer NPC reacts to a body it did not make exactly as any NPC does: it freezes, walks to it and reports it `reportDelayS` after it stands in reach. It never startles at its own. **A placement**: put on the square at grace or at immunity, an NPC stands 3-8 s (`npc.react.afterPlacementIdleS`) before its routine resumes, with a fresh scene dwell. **The Knife and the flee** follow the brain's rules below.
- **Meetings, the role card and night powers (M5a).** An NPC casts its vote at a tick drawn uniformly over 0.3-0.9 (`npc.vote.windowFrac`) of the meeting's discussion time (as set when the meeting opens, a wrong-ejection bonus included) plus the vote time (`phases.voteS`, 25 s), counted from the start of the discussion: 26-77 s in with a 60 s discussion, 30-90 s with 75 s, 35-104 s with 90 s. On the role card an NPC readies 2-9 s (`npc.ready.delayS`) after the card opens; in the lobby it readies as the Seats bullet says. An NPC holding a night power (3.2) uses it at a tick drawn uniformly over 0.1-0.8 (`npc.nightPower.windowFrac`) of the time from the start of dusk to the end of the night (11-88 s with the 10 s dusk and 100 s night), or of the Final Night hunt (9-72 s of 90 s); an NPC Gamekeeper fires its Last Shot 2-8 s into its aim (`npc.nightPower.lastShotS`), or holds its fire when it has nobody to vote for. Each NPC seat draws only from its own streams, `npcPlay:<seatId>` and `npcTiming:<seatId>` (`sim/seeds.ts`), never from the deal's or another seat's: the ready, vote and night-power ticks and the Last Shot delay from `npcTiming`, every other choice (persona, activity, station, stroll tile, durations, the leave delay, clue, strike roll, night-power pick, vote target) from `npcPlay`. A draw that only some cards use is made by every NPC at the same moment and ignored when its card does not use it (the strike roll on every check, below; the vote's draws; the night-power tick and pick; the Last Shot delay), so no card changes how far a seat's streams move.
- **Rules of the scripted brain.** (M5a) A Killer NPC is any NPC that holds `kill`: a Killer, or an Accomplice after Inherit (3.2). Every NPC walk follows a tile path, so a wall between never pins the seat (M3c). An NPC reports the nearest body it is within reporting reach of, `reportDelayS` after it first stands there (M3c); (M5a) a Killer NPC never reports a body it made and reports any other as every NPC does (Reactions). A Killer NPC strikes only in a phase the Knife works in (`abilities.json` `kill.phases`: dusk, night and the Final Night hunt, 3.3) with the Knife ready, and only when exactly one other living seat shares its scene and that seat is a human, not its Cabal partner; the chance `killChancePer10s` is spread evenly over those ten seconds. **The kill-opportunity timer** (owner, 2026-10-23, A100): a Killer NPC that has been alone in a room with exactly one other living seat, human or NPC, for longer than 30 s (`npc.aloneKill.afterS`) strikes that seat as soon as the Knife works and is ready, whatever the roll said. A room is any scene but the map's hub; in a room wider than the view (the woods, the caves) the seat counts only within 20 tiles (`npc.aloneKill.sightTiles`) and in sight (3.7). The wait counts in every world phase, so a pair left alone by day is struck at dusk; a change of company, a crossing, a placement or a meeting restarts it, and a Cabal mate never counts. It draws nothing. (M5a) The strike roll is drawn by every NPC on each check, a tick of such a phase on which exactly one other living seat shares its scene and that seat is a human not crossing a door, and is ignored unless the NPC holds `kill`, its Knife is ready and that seat is not its Cabal partner. After a kill a Killer NPC leaves the room at once and walks to the nearest scene with a basin and then to the map's hub (the map manifest's `hub`, the overworld square in Hollowmere), there being no wash verb yet (M3c). Until the Case Board ships (M4) "the player with the most Verified clues" is the seat the NPC had most often in sight when it came across a body; an NPC with no such memory votes Skip, and a Killer NPC first votes at its drawn tick with the plurality of the votes already cast and re-reads it every second (M3c). (M5a) When Skip is disabled (the forced vote of 3.8 and the Final Night vote), an NPC with no suspect, and a Killer NPC with no plurality to follow, votes for a random living seat other than itself. (M5a) An NPC whose Notebook holds a Cabal confession (Hear Confession, 3.2) votes for that seat and aims its Last Shot at it, ahead of every rule above (the confession heard first, while that seat lives).
- **Scope.** NPCs ship in M3c (ROADMAP 7.1) after the first playable, inside the room as entities rather than clients. (M5a) The routines replace the M3c wander, which stays only as the fallback above. In quick mode NPC seats follow 3.11 "NPC seats". NPC seats keep a Notebook only for the clues they collect and do no tasks until M4d; when a human station hold ships, its row in `routines.json` `holds` turns NPC work at those stations into the same hold, with no change to the brain.

### 3.13 Maps and presentation

**Decision (owner, 2026-10-17, A49; round-5 contract A50):** the leader picks the map in the lobby; every map has at least one forest and one cave; both modes present the world isometrically. The projection belongs to the client alone: the server, the rules and the data stay on the square grid.

**Choosing a map (M5a).** The lobby's settings panel has a map row: each map whose `modes` lists the chosen mode shows its name, a one-line blurb and a thumbnail. The leader picks; everyone else sees the pick. The default is Hollowmere. The pick is `Settings.map`: the server takes a known map id from the leader in the lobby, refuses any other id like a bad setting, and keeps the pick through mode changes and the return to the lobby, like the mode and the NPC difficulty (3.12). The quick mode does not walk (3.11), so it ignores the map and the map row is hidden while it is chosen. At Start the seats are placed on the chosen map's hub, and no door leads off the map, so a match only ever uses the chosen map's scenes. The party size still picks the profile (Small 4-6, Medium 7-8, Large 9-10; WORLD 4.3), and a door to a scene above the profile stays boarded and refuses with `CLOSED`.

**What a map is.** A map (`packages/content/data/maps/<id>.json`) is a closed graph of scenes. Every scene belongs to exactly one map, and every portal leads inside its own map. The map names:

- a **hub**: an exterior open at every party size, holding the Emergency Bell (`bell`) and the kit chest (`kitChest`);
- 10 **start spawns** on the hub, over which the first placement spreads the seats in seat order (M3);
- 10 **meeting spawns**, over which everyone is spread when a meeting ends;
- the grace-phase **teaching clue** (`teachingClue`, 2 step 5).

A rule that says "the square" or "the overworld" means the map's hub and these spawns.

**The maps (M5a).**

| Map | Setting | Small (4-6) | Medium adds | Large adds |
|---|---|---|---|---|
| **Hollowmere** | Fog-bound harbour hamlet, autumn 1931 (WORLD 4.1) | the village; the tavern and its back room; the apothecary and its loft; the widow's parlour and bedroom; Crumb's Ovens and its four station rooms (cold, mixing, oven and proofing; round 7, A116); Gallows Wood (forest); the Tin Gallery mouth (cave) | **the Fenwood** (forest) and **the Flooded Gallery** (cave); Vane Manor (hall, upstairs); Hale Barn | St Brannock's; the Undercroft |
| **Blackpine** | The Vane company's logging camp and tin mine up the valley, the same night (WORLD 4.10) | the camp; the bunkhouse; the sawmill; Blackpine Woods (forest); the Workings (cave) | the Company Office; the Forge | the Deep Level (cave) |

Hollowmere's new forest and cave close a loop from the Medium profile up: the village, Gallows Wood, the Fenwood, the Flooded Gallery, the Tin Gallery mouth and back to Gallows Wood. A one-way sinkhole also drops from the Fenwood into the Gallery. Below Medium their doors stay boarded, so a small party keeps the old, tighter Hollowmere with one forest and one cave. Blackpine is the tighter and wilder map. Its loop runs from the camp through the woods, in at the Workings' vent drift and back out of the adit. A one-way log chute drops from the woods to the camp. The Large profile adds a second way under the hill: the woods' drowned adit to the Deep Level, and the Deep Level's ladder up to the Workings.

**Biomes.** Every scene has a biome: `village` (a settlement exterior), `house` (rooms), `forest` or `cave`. The biome picks the scene's default ground and walls, its ambient sound bed and its look. It changes no rule except the darkness of caves (below). **Every map has at least one forest and one cave open at the Small profile**, so every party size has both. In M5a they are where hiding is easiest and the night is darkest:

- Forests are trails 2-3 tiles wide through dense trees, opening into clearings, with loops and chokepoints.
- Caves are corridors 2-3 tiles wide between chambers and flooded galleries. Shallow water is walked through at the normal speed in M5a; deep water is solid.

Forest and cave scenes already carry the places where M5b puts resource nodes, creature spawners and quest givers (`nodes`, `spawners`, `givers` in the scene files). No code reads them in M5a, and none of them depends on a role.

**Isometric presentation (M5a).** Both modes show the world in a 2:1 dimetric isometric view, seen from the south-east (SPRITES 10, WORLD 4.2):

- A tile is a 128 x 64 px diamond. World north points to the upper right of the screen, and straight up is world north-west.
- Characters, props, buildings and ground are pre-rendered from that one camera. Each player picks an **art style** at the click of a button, in the lobby or the in-match menu, without leaving the match: **8-bit** (the default, a pixel-art finish) or **Low poly** (the same renders without the finish, smooth-filtered). HD comes later. The pick is the player's own, kept in the browser and never sent to the server, so two players at one table may see different styles (`style.json` `artStyles`, A79).
- Only the picture changes. The server, every rule, distance and radius in this document, the collision box and every id stay on the square 64 px grid.

**Interiors are cutaways.** The north and west walls stand at full height, the south and east walls are drawn as low sills, and inner walls are drawn at half height, so a room can always be read.

**Occlusion outside.** A tall thing (a building, a wall, a tree, a cliff) hides what stands north or west of it. It turns translucent (35%, `metrics.json` `lighting.occluderFadeAlpha`) while it is in front of your own character. It never turns translucent for anyone else. Standing behind the barn therefore hides you from other players' eyes, though not from the wire (3.7).

Doors into buildings sit on a south or east face, so they are always in sight. M5a moves `ov.tavern_front` and `ov.apoth` to the south faces of their houses; their ids do not change.

**Controls.**

- The keys W, A, S and D (or the arrows) walk straight up, left, down and right on the screen. Two keys together walk along the grid.
- A touch stick walks where the thumb points.
- The speed in tiles is unchanged (3.7).

The quick mode does not walk (3.11). Its kitchen and night rooms are isometric illustrations drawn in the same projection.

**Lighting by phase and scene (M5a).** The world is drawn under a darkness layer that follows the phase (`metrics.json` `lighting.ambient`):

| Phase | Darkness |
|---|---|
| Grace, day, immunity | `slate` at 40% |
| Night, Final Night | `ink` at 90% |
| Dusk, dawn | Eased between the two |

Light cuts pools out of the darkness, at full strength out to 55% of the light's radius and fading to nothing at its edge:

- **Your vision**: the radius of 3.7 (7 tiles by day, 3.5 at night, eased through dusk). On screen a circle of r tiles is an ellipse twice as wide as it is tall.
- **The scene's lights** (`lights` in the scene file). Each light has its own radius in tiles and burns in its own parts of the day:
  - lantern posts and lit windows from dusk to dawn;
  - lamps, hearths, stoves, forges and charcoal kilns always;
  - torches in the mines, the cellar and at the adit;
  - cave moss and the mere-rot glow, in `teal`;
  - moonlight in clearings at night;
  - shafts of daylight at cave mouths by day.

  Torches and fires flicker.

**Dark scenes** (`dark: true`: every cave, the Undercroft and the apothecary loft) are night in every phase. Their darkness is `ink` at 94%, and your vision there is the night radius. A cave at noon is as dark as the village at midnight, except where its lights burn.

Darkness stays a client-side picture in M5a, as 3.7 says. The server still sends every position in your scene, so a light shows nothing the wire does not already carry. Lights make the dark readable and the lit places worth standing in.

In M5a nobody carries a light that anyone else can see. Your vision is drawn for you alone, so no glow on another character can say what card they hold. If M5b adds a light that others can see (a crafted lantern), it goes to whoever holds the item, never by role. M5b also moves dark scenes to the radius-plus-line-of-sight visibility of 3.7 on the server, together with the creatures.

**Explored fog and the minimap** are M5b. M5a draws no memory of where you have been and no map overlay.

**Transitions.** The client covers the screen while the router starts a scene: a fade into the world (`balance.ui.transitionS.fade`, 0.4 s), an iris into a meeting (`iris`, 0.6 s) and a wipe into the end screen (`wipe`, 0.7 s), each the whole cover-and-lift. Under reduced motion every duration is 0 and the scene starts at once. A transition that begins while another runs replaces it. Nothing here touches the sim or the wire.

**Loading.** A load that runs longer than `balance.ui.loading.showAfterS` (0.3 s) shows a progress bar and a tip, which changes every `tipEveryS` (4 s); a shorter load shows nothing. Tips describe the controls and the world and never a role's powers. A match's load also starts the map's `loading` music (3.18).

### 3.14 Resources and crafting

Round 6 (ROADMAP M5b). The rows are `resources.json`, `recipes.json` and the `material` rows of `items.json`; the
numbers below are theirs and `balance.resources`'s. Sentences marked (6F) are the server's behaviour and may be
corrected by Session 6F when it lands.

**Resources.** Six resources grow at the **nodes** of the forests, caves and the Blackpine camp (`nodes` in the scene
files): Timber, Stone, Pine Resin, Herbs, Mushrooms and Tin Ore. Every map has all six at every party size: Hollowmere's
Small profile finds them in Gallows Wood and the Tin Gallery mouth, Blackpine's in the woods, the camp and the
Workings. Nodes that share a `pool` are one pool: at Start the server activates half of each pool's spots, rounded
up (`poolActiveFrac` 0.5, so a pool of two keeps one), drawn from the `nodes` stream, so a forest is never stripped the same
way twice; a spot not drawn has no node that match and is not sent to anyone, and a node outside any pool is always
active. (6F)

| Resource | Gather hold | Yield | Respawn | Needs |
|---|---|---|---|---|
| Timber | 3 s | 1 | 90 s | |
| Stone | 3 s | 1 | 120 s | |
| Pine Resin | 2 s | 1 | 90 s | |
| Herbs | 2 s | 2 | 60 s | |
| Mushrooms | 2 s | 1 | 75 s | |
| Tin Ore | 4 s | 1 | 150 s | a Spade in the inventory |

**Gathering** is a hold (E) at an active node within the verb reach of 3.7, like Collect: moving or being interrupted
cancels it and yields nothing; at its end the yield goes into the inventory and the node goes inactive until its
respawn time has passed (counted in ticks). A gather with no room for the yield is refused, and so is one at a node
that is empty, out of reach or needs a tool the seat does not hold (the Spade stays in the inventory); two seats at one
node share one yield: the first to finish takes it and the other's hold ends. (6F) Gathering makes no
noise and leaves no clue, and nobody's role changes what a node gives.

**Materials stack.** A material is an item of kind `material`: up to 5 units of one material share one of the 5
slots (`stackMax`); a tool takes a slot of its own (3.5). Materials drop on death like every non-bound item.

**Crafting** is a hold at a **station**, a prop of the recipe's kind within the verb reach; a recipe with no station
crafts anywhere. The inputs are taken when the hold ends, and the tool goes into the inventory; an interrupted craft
takes nothing, and a craft whose inputs are gone by the end of the hold gives nothing. The tool takes the slot the
inputs free, so a full inventory can still craft. (6F) Every tool is role-neutral: anyone may craft one, and a crafted tool says nothing about who made
it.

| Tool | Inputs | Station | Hold |
|---|---|---|---|
| Torch | 1 Timber, 1 Pine Resin | anywhere | 2 s |
| Snare | 2 Herbs, 1 Timber | anywhere | 3 s |
| Spade | 2 Timber, 1 Stone | a basin | 3 s |
| Lockpicks | 1 Tin Ore | a basin | 3 s |
| Lantern | 1 Tin Ore, 1 Pine Resin | an oven | 4 s |
| Crowbar | 2 Tin Ore, 1 Timber | an oven | 4 s |

Basins stand in the apothecary, Crumb's Ovens, the bunkhouse and the forge; ovens in Crumb's Ovens and the bunkhouse,
so both maps craft every tool at the Small profile. The Torch is a carried light like the Lantern (radius 4, 3.5) and
ships in V1. The Lockpicks and the Snare can be crafted, carried, traded and dropped; their verbs (Pick a lock, Set a
snare) are the V1.5 abilities of 3.5 and stay off until they ship.

### 3.15 Mobs

Round 6 (ROADMAP M5b). The rows are `mobs.json` and the scenes' `spawners`; sentences marked (6G) are the server's
behaviour and may be corrected by Session 6G.

**Creatures.** Each spawner raises one creature of its kind, awake in the spawner's `phases` (default: always),
which never strays further from it than its `leashTiles` and walks its `pathId` loop when it has one. A scene has
at most 3 spawners (`mobs.maxPerScene`). Creatures are not seats: they carry no handle, no role and no look, and
they are drawn from the scene state for everyone in the scene.

| Creature | Where | Speed | Senses | Flees light within | Attack | Kills |
|---|---|---|---|---|---|---|
| Wolf | the forests' wolf loops, dusk and night | 3.6 tiles/s | 6 tiles | 4 tiles | after 1 s in reach | yes |
| Boar | the Fenwood, Blackpine Woods, day and dusk | 3.2 tiles/s | 4 tiles | 2 tiles | after 1.5 s in reach | no |
| Bat | the caves | 4 tiles/s | 5 tiles | 3 tiles | after 2 s in reach | no |
| Rat | the caves past the Tin Gallery mouth | 2.5 tiles/s | 3 tiles | 2 tiles | after 2 s in reach | no |

**Behaviour.** A creature idles or roams its loop; it chases a living seat it senses and can see (3.7) for at most
6 s (`mobs.chaseS`), then returns to its spawner and starts no new chase for as long; it flees any lit flame within
its flee radius, carried or standing (a lit carried light, or a burning lantern, torch, lamp or fire of the scene;
moss, moonlight, daylight shafts and windows are not flames), and walks home once out of its reach. (6G) It walks
tile paths whose every tile lies inside its leash, so it never strays further; a loop point beyond the leash is
pulled in to its edge, and at each point it pauses as a wandering NPC does (`npc.wander.stepMinS` to `stepMaxS`). A
seat in transit or a ghost is never sensed, and nothing it senses depends on a card. (6G) Its attack lands 1 damage
(`health.wolfDamage`) each time the seat has stayed in reach (1.5 tiles, 3.7) and in sight for its attack time.
Creature bites are the only damage the server counts in hit points: a seat regains 1 HP every 90 s after its last
bite, up to 2 (3.6), and Wounded's slower walk and drip trail are not applied yet. A wolf's bite that takes a seat to
0 HP is a death with the cause `wolf`: the body is left where it fell and the kill scream rings (3.7), with no clue
of a killer, so the Killer's "blame the wolves" cover of WORLD 4.6 has a real alibi; the other creatures wound but
never take a seat below 1 HP. (6G) Wolves keep 3.6's flee radius (`balance.wolves.fleeLightTiles`, which their row
equals) and stay in the woods by their leash; the mended fence and the bolt do not touch them yet. An NPC seat a
creature chases runs for the nearest open door of its scene and takes it, or straight away from the creature when
there is none (3.12; live once the NPC brain's call lands, DECISIONS A89). Creatures use the `mobs` random stream,
keyed per spawner, and never a secret stream.

**Dark scenes on the server.** With creatures, a dark scene's visibility moves to the server (3.13): a living seat
in a dark scene receives another avatar only within the night radius and a clear line of sight over the scene's
grid (walls, and the `u` ground that is walkable but blocks sight), or when that avatar stands in the pool of a
scene light burning now; a lit carried light (Lantern, Torch, Candle) adds 2 tiles (`vision.lanternTiles`) to both
seeing and being seen, so two lit seats see each other 4 tiles further. Every light starts out: its holder lights
it or puts it out (`act.light`), and a lit light shows on its avatar as the lantern bit, never by card. Outside the
dark scenes the server still sends every position in the scene and the night radius stays the client's picture
(3.13), so a lantern post's pool on the square shows what it lights. Ghosts see everything. (6G; 3.7's lantern line
is 6G's.)

### 3.16 Quests and mini-games

Round 6 (ROADMAP M5b). The rows are `quests.json`, `minigames.json` and the scenes' `givers`; sentences marked (6H)
are the server's behaviour and may be corrected by Session 6H.

**Givers.** A quest giver is a figure standing at a scene spot, never a seat: it wears the `villager` body (so it
can never be mistaken for a seat's character), faces its spot's direction and carries a quest marker. Each map has
a giver on its hub and others in its wild places:

| Giver | Where | Quest | Wants | Reward |
|---|---|---|---|---|
| Harbourmaster Pell | Hollowmere village, by the dock | Caulk the skiff | 2 Pine Resin, 1 Timber | Lantern |
| Mother Moll | the Fenwood, her charcoal hut (Medium) | Moll's herbs | 4 Herbs | Bandage |
| | | Moll's mushrooms | 3 Mushrooms | Salts |
| Foreman Hask | the Blackpine yard | Stack the yard | 4 Timber | Crowbar |
| Ada Kerrow | the forge (Medium) | The smith's ore | 3 Tin Ore | Lantern |
| The Collier | Blackpine Woods, at the kilns | The collier's stone | 3 Stone | Torch |

**Quests.** Speaking to a giver (E within reach) offers its quests; a seat holds at most 2 accepted quests
(`quests.maxActive`), each private to that seat's view. Turning a quest in at its giver takes the wanted items
from the inventory and gives the reward through the inventory; with no room for the reward the turn-in is refused
and nothing is taken. A quest can be done once per seat per match. Every quest is open to every role, and what a
giver offers never depends on who asks. (6H) Accepting and turning in are commands at a giver of that quest within
reach of the verb (`doors.reachTiles`), in a verb phase; an accepted quest's progress is the count of wanted units
the seat carries (each want capped at its quantity) and follows the inventory every step, so it falls when an item is
dropped. A quest that is done stays on the list and counts as done for the match, and a done quest no longer counts
against `quests.maxActive`. The lobby and the role card clear every seat's quests. Quests of kind `contract` are the
round-7 vendetta seam and are refused in round 6.

**Mini-games.** Every fetch task of 3.5 plays a mini-game at its target in place of the plain 2 s hold: the hold
opens it, the server keeps the solution, and the task completes only when the client's answer checks. The four
kinds are the quick mode's (3.11): crates, pour, slide and stoke. (6H)

| Task | Mini-game | Difficulty (1-5) |
|---|---|---|
| Light the lanterns | pour | 2 |
| Fix the well pump | slide | 3 |
| Deliver a letter | slide | 1 |
| Mend the fence | crates | 2 |
| Fetch the flour | crates | 1 |

After 20 s the Done control appears, as in the quick mode. A wrong answer completes nothing and may be tried again.
A Cabal seat's fake task plays the same mini-game, writes the same alibi entry and never moves the task bar (3.5).
The co-op task keeps its two-player hold. (6H) The hold opens the mini-game at once, with no timer, at a target prop of
the task within reach, in the task's own time of day (Light the lanterns only at night), and only for a task on the
seat's own list that is not done; a real task also needs its deliverable in the inventory, which completion takes, and
a fake task needs none. The server draws the puzzle from a stream of its own keyed by seat, sends the client its
statement (the board it draws: the bands, the lit order) and keeps it; the answer is a record of what the player did
(crates placed and the needle's stop, how long each pour was held, the slots filled in order, the stoke's taps), which
the server replays against the puzzle, so a bare "done" completes nothing. The Done control sends an assist answer the
server accepts only once the puzzle has been open for `assistS`. Each two difficulty levels above 1 add one step (one
second of hold for the stoke) to the ONUB numbers of `balance.onub.json`. Completion marks the task done, writes the
alibi entry (the scene and the tick, into the seat's own ledger) and, for a real task, raises the bar to the finished
real tasks over all real tasks; a ghost's finished tasks count in full up to `tasks.ghostShareCap` of the bar. Leaving
the node, or a phase where verbs do not work, drops the open puzzle.

### 3.17 Characters and disguise

**Decision (owner, 2026-10-17, A49):** every seat walks the main-mode world as its card's character, so roles are public by sight, except the cover roles, which always wear another card's look; the Killer can also borrow a living seat's face for a few seconds. In the quick mode (3.11) role art is private (your own card and night scene) and public only at game over.

**Looks.** Every card of a deck is a character, a row of `looks.json`: a portrait (the role card, the meeting roster, the reveals, the end screen) and, for a non-cover card, a world character drawn in the 8 directions under `char/<lookId>/<anim>/<dir>` at the seat's height scale with its scarf tinted. The three cover cards (Killer, Accomplice, Drifter) have portraits only and no world character: nobody ever walks as a Killer. Look ids are public and name the character (`vicar`, `baker`), and every client loads the characters and portraits of the match's whole deck before the role card closes, so what a client loads never depends on its own card.

**The public look.** `Player.look` holds each seat's look id. It is empty for every seat during the role card and is written for every seat in the same tick when the card closes: a non-cover seat's look is its card's, a cover seat's is the look it picked. From then on the roster, the nameplate, the meeting portraits and a seat's body all show that look, for the whole match.

**The cover pick.** On the role card every seat sees the deck list and the look it will walk as. A cover role sees, instead of its own look, a picker whose **hints** are undealt cards, the first one selected from the start. Each cover role is shown every undealt non-cover card that no other cover role needs. A lone cover role sees them all (both, at 4 players); Cabal mates share theirs and pick in turn (the server refuses a look a mate wears); the Drifter sees only its own. A cover role that never picks wears its first hint. Every cover role always has at least one (3.9), and wearing a hint doubles nobody. The picker also offers the deck's other non-cover characters: wearing a dealt character's look is allowed and puts two seats in the same look, which the table will read as a counter-claim: one of the two is a cover. A cover role may change its pick as often as it likes until the card closes; Cabal members see each other's picks live. The cover is fixed for the match. While the card is up, Ready is held privately (the roster's Ready ticks stay clear), so a long pick tells nobody anything; the card ends when every seat is Ready or after 20 s (`phases.roleRevealS`).

**Playing a cover.** The look is a claim, not a power: a cover role keeps its own card's abilities, kit and Bell pulls. A Killer who walks as the Vicar has no confessions to report and must invent them. (M5a) Nothing on the wire proves a claim. Notebooks are private and the Case Board is M4, so a fake Vicar's word stands against the real one's, as in Werewolf. The village tests a cover's story against the kill clues, the sightings and what each ejection reveals.

**Impersonate** (Killer; dusk, night and the Final Night hunt; `balance.json` `impersonate`). Pick any seat the roster shows alive, other than yourself. For 15 s your character shows that seat's name, look, scarf and hat glyph; your height stays your own, the one on-screen tell. Your face changes only unseen: at once if no other living seat is in your scene, otherwise as you next pass a door, so the figure that arrives wears the borrowed face. If it has not changed within 10 s it is cancelled and costs no cooldown. Using Impersonate again, or daybreak, before it has changed cancels it the same way. It drops in place, with a puff, on your next Knife strike (a witness sees your cover). It also ends when a meeting opens or you die. Using Impersonate again while disguised, the 15 s running out, or daybreak each ask it to drop: it drops the next time you are alone in your scene or pass a door (the cooldown runs from the drop). The 10 s, the 15 s and the 45 s cooldown are `balance.json` `impersonate.applyWindowS`, `impersonate.durationS` and `impersonate.cooldownS`. The strike drops it whether the strike is voided or not, and a disguise carries through doors. You see yourself in the borrowed look. Everything else stays yours: kill clues show your own height and scarf, Blood shows on the borrowed figure, and Hunger's glowing footprints follow it. Night powers name seats, so they see through it. Ghosts see the true name over every borrowed face.

**What each client sees** (M5a):

| Who | In the world | In the roster and the meetings |
|---|---|---|
| Your own client | Yourself from your own position, in your look (or the borrowed one); others in your scene as avatars | Your card, your kit, your Notebook; every seat's name, traits and public look |
| A living player, about others in the same scene | Each living seat as an avatar: the name, look, scarf and hat glyph of the seat it shows, its own height, its position, under an opaque handle that changes on every scene entry and death, and when an impersonation applies or drops (only when no other living seat is in the scene, at a door, or at a strike) | Names, traits, public looks; never a role, a scene or a position |
| A living player, about seats elsewhere | Nothing: no position, no scene | As above |
| A ghost | Every avatar of its scene, the living and the other ghosts, each with its true seat | Every role (3.7) |
| A Gamekeeper aiming its Last Shot | No avatar at all (its screen is black until the aim closes) | As a living player |
| Anyone, during a meeting, the reveal or game over | No avatar at all | As above, plus what the reveal shows (3.8) |

**Reveals.** An ejection shows the ejected seat's role portrait beside the look it wore. A death in the world shows nothing until the next meeting flips `alive`, and no role until game over. The end screen shows, for every seat, the role card, the look it wore, and the two undealt cards.

**(M5a) On the wire.** The look is the public `Player.look`; others are drawn from scene-scoped avatars keyed by random handles, and the Kill and the Bandage name a handle, which the server resolves to a seat; list acts (Impersonate, the night powers) name a seat. There is no cover flag and no disguise flag anywhere: a cover look is sent exactly like a real one, and an impersonation is an avatar like any other. Schema, messages and the privacy tests are ARCHITECTURE 5.4 and 5.5.

### 3.18 Cinematics and music

Round 6 (ROADMAP M5c). Cutscenes are data (`packages/content/data/cutscenes/`) played in-engine: the opening of a map runs inside grace, which `phases.openingS` lengthens for it, and adds no phase; a death plays the cutscene of its cause before the ghost handoff; every cutscene can be skipped, and reduce-motion turns its camera moves into cuts. Music follows the phase class of the map (`music.json`), is loaded after Start under its own budget (ASSETS 6.8) and is never sent by the server. The contract is `docs/round6/cutscene-music.md`; 6J writes the cutscene paragraphs and 6L the music paragraphs here, and the seconds live in `balance.json` (`phases.openingS`, `ui.transitionS`).

**Cutscene openings (6J).** `cutscenes.json` maps each map to an opening cutscene. At the start of grace the server broadcasts `cutscene { id }` to every seat and lengthens grace by that opening's own length (its `maxS`); it adds no phase and never waits for a client, so the NPCs walk and the clock runs while the camera pans. **Round 7 (7A, DECISIONS A101):** each opening runs exactly as long as its map's intro track (the `opening` music class), measured and rounded down to the second: HollowMere 117 s, BlackPine 80 s. `phases.openingS` (120 s) is the cap no opening may pass, and the content checks that an opening's steps fill its whole length; a client test checks that length against the track. HollowMere's opening is a pan over the square with a narrator caption track ending on the role chip slamming in; Blackpine's is a two-step pan with no narrator. A seat can skip an opening with Esc or the Skip button and sees the world under the remaining grace.

**Video steps (round 7, 7A, DECISIONS A101).** A cutscene may play one of the game's videos (a row of `assets/video/manifest.json`): full frame, under the cutscene's captions and its Skip, with the video's own sound at the player's music volume (muted if the browser refuses sound without a tap). The cutscene ends when the video ends, or at its `maxS` if that comes first. A video that cannot play (no row, no file, a decode error) is dropped and the rest of the cutscene plays over the world. The memorials use it (DECISIONS A113); captions meant to sit over the picture start with it (`withPrevious`).

**Death cutscenes (6J).** A seat that dies by the knife, poison, the Gamekeeper's shot, a vote or a wolf is told so in its private `killed`, which names the cutscene of that cause (`cutsceneId`); a vanishing has none. The client plays it before the ghost handoff: a sound, one whispered line, and the last frame held for four seconds at most, skippable like the opening. The id is the victim's own news, so it reveals nothing the `cause` beside it does not. A seat voted out hears it while the meeting has the World asleep, so its cutscene plays when the World is rebuilt after the meeting.

**Music (6L).** Each map plays one playlist per class, chosen by the phase and mapped in `music.json`: `loading` from the map's load to the opening (no map lists one since round 7: the lobby piece plays on through the load, so a load that finishes after the opening has started can never cut its piece off), `opening` with the opening cutscene, `lobby` between matches, `day` (dawn included), `dusk`, `night`, `meeting` (the discussion, the vote, the reveal and the immunity beat), `finalNight` and `gameOver`; the quick mode plays `kitchen` (Evening Prep and the crime scenes), `night`, `rush` (dawn to the Final Bake) and `over`. A phase that stays in its class changes nothing, so a track is never restarted. **The opening piece (round 7, 7A, DECISIONS A101)** is the map's intro track of speech and music: it starts when the opening's `cutscene` message arrives, plays once and whole, never loops, and is silent at its end; the class the phase wants by then (the `day`, even while grace still runs) cross-fades in only when the piece ends or the seat skips the opening. A seat that skips also skips the rest of the piece. Port-au-Levain's piece waits for its map (round 8). Playlists cross-fade; their tracks, gains and fade seconds are in `audio/music/manifest.json`. Music is fetched only after Start (the lobby warms the first track of the picked map's day theme, never more) and has its own budget (ASSETS 6.8), separate from effects. Every player has a music slider, an effects slider and a mute (UI 14.22), kept on their own device and never sent; a class with no playlist, or a playlist with no track, is silence. No role, cover or secret is a class: the server sends nothing, and the pick depends only on public phases.

### 3.19 Admin auto-mode

Round 6 (ROADMAP M5d). An owner-only room runs a match in which every seat is an NPC, watched from a god view on several scene viewports, with the invariants of `docs/round6/auto-admin.md` 5 checked as it runs. Nothing about it changes a normal match: a `party` room never leaves 1x, an NPC Killer takes an NPC as prey by the strike roll only in an auto match (the kill-opportunity timer of 3.12 takes any seat in every match), and the room exists only when the owner's GitHub login is configured on the server (ARCHITECTURE 5.11). The contract is `docs/round6/auto-admin.md`.

**Sim speed.** Every timer of the game counts ticks, so a speed is the number of ticks the server runs per tick of wall time: 1x, 2x, 5x or 10x, with pause and single steps while paused. Phase lengths are sim seconds: at 10x a 15-minute match plays in about 90 wall seconds, and cooldowns, phase timers, the NPC walk and every countdown keep their meaning. When the server cannot run the asked number of ticks inside its per-tick budget it runs fewer, at least one, and owes the rest to later ticks: the speed reached drops, and no tick is ever skipped. Only the auto room's controls change the speed; nothing a player can send does.

**The all-NPC match.** The owner chooses the map, the mode (main or quick), the seat count (every seat an NPC, up to `players.max`), the NPC difficulty, the quick mode's deck if not the default, and optionally the seed words. Start needs no leader and no human; the match deals, plays and ends exactly as a normal one, and below `players.min` seats the usual NPC fill applies. Each NPC brain plays as in 3.12, with one difference: an NPC Killer may take another NPC as prey, so the brains play each other. Reset returns the room to the lobby with the same seats under the same ids, the same options and the speed paused.

**Replay.** An auto match fixes the seed words of every random stream and the seat ids before Start, so the same words and ids replay the same match tick for tick. The headless runner (`pnpm auto`) plays such matches with no network and no client and prints one line per match (winner, ticks, rounds, invariant failures); a failure is printed with the seed words of every stream and the seat ids, which the admin page can set to watch it again. The runner's `--seed` decides every match's words, so a run with the same flags plays the same matches.

### 3.20 Vendettas

Round 7 (ROADMAP R7). A Killer's card carries one of four vendettas drawn at the deal (conversion, sabotage,
heist, contract), each a trigger and a consequence around the kill, never a second way to kill; HollowMere's
Daily Train is the clock they run on, and the Vicar's death by the Knife is marked by a memorial every seat sees.
The contract is `docs/round7/vendettas.md`; 7H writes the vendetta paragraphs here and 7I the Train and memorial
paragraphs, and the numbers live in `balance.json` (`vendettas`, `train`).

**The Daily Train** is the vendettas' clock: its rule is in 3.3. `train.arrive` brings the mail (the Hitman's
contract) and `train.delivery` the strongbox (the Bandit's heist).

**The draw (7H).** At the deal, every seat dealt a card that carries vendettas (the Killer; `vendettas.json`
`role`) draws one, uniformly among the rows the match allows: the Zealot only when a seat is dealt the Vicar, the
Bandit only when the manor hall is open at the party's size (Medium and Large, 3.13), the Bandit and the Hitman
only on HollowMere, where the Train runs. A seat with no row allowed draws none. Each seat draws from a stream of
its own (`vendetta`, keyed by seat), so the draw moves no other draw. The two Killers of a 10-seat deck draw
apart and may draw the same row. The quick mode deals no vendetta. The vendetta stays with its seat: it ends
when the seat dies or is ejected, and an Accomplice who inherits the Knife (3.2) inherits none.

**On the card.** A Killer's role card shows its vendetta as a goal line; the Accomplice's card shows the goal of
each Killer it knows and nothing else of them; no other seat's card changes. The vendetta lives only in the seat's
private view (`Private.vendetta`); no look, no public field, no message to another seat and no bus event names
it with its holder (3.17). What a vendetta does in the world is the only tell, as a body is the only tell of a
kill.

**Pressure, not a second kill.** A vendetta never kills, never changes whom the Knife may take, and never
touches the strike roll or the kill-opportunity timer of an NPC Killer (3.12). Each has a goal, watched by the
server, and one consequence that fires at most once per match; the bus carries its steps as `vendetta.<kind>.<step>`
events that name no seat (`vendettas.json` `emits`, `fires`).

- **Conversion: the Zealot against the Vicar (7H).** The Zealot's goal is the Vicar's flock: world-phase time in
  the same scene as the seat dealt the Vicar, both alive and placed, counted across scenes and phases. At **45 s**
  (`vendettas.conversion.shareS`) the doubt is sown (`vendetta.conversion.sown`). At the next meeting the
  Vicar's vote counts for nothing (`vendetta.conversion.doubt`, the consequence). To every other seat it is an
  ordinary abstention: the Vicar's voted mark stays down and the tally leaves it out, while the meeting still ends
  early once every living seat has cast. The Vicar still votes and sees its own vote, and at the reveal it alone
  learns, in its Notebook, that its voice did not carry. If the Vicar dies or is ejected first, the
  vendetta lapses (`vendetta.conversion.lapsed`).
- **Sabotage: the Activist against the company (7H).** The Activist's goal is the company's stations: standing
  still within verb reach of a target prop of a task (3.5) for **6 s** (`vendettas.sabotage.tamperS`) in a verb
  phase tampers with it (`vendetta.sabotage.tampered`, once per target); at **2** targets
  (`vendettas.sabotage.stations`) the works are wrecked (`vendetta.sabotage.wrecked`, the consequence): **1**
  finished real task of the match (`vendettas.sabotage.undoTasks`), drawn from the Activist's stream, is undone,
  the task bar falls with it, and the Activist's Knife is ready at once. With no finished real task the bar has
  nothing to lose and only the Knife is readied.
- **Heist: the Bandit against the strongbox (7H).** The strongbox stands in the manor hall, empty, in every
  HollowMere match the hall is open at; the first Train delivery of the match loads it (`vendetta.heist.loaded`,
  in every such match, Bandit or not). The Bandit's goal is to crack it: **8 s** (`vendettas.heist.crackS`)
  still within verb reach of it, after dark, with no other living seat in the hall. Cracking it
  (`vendetta.heist.cracked`, the consequence) puts the Strongbox item in the Bandit's inventory (it needs a free
  slot), leaves a footprint of the Bandit's own height at the box as a kill does (3.4), and readies the Knife at
  once. The strongbox is in one inventory at most.
- **Contract: the Hitman (7H).** At the first Train arrival of the match the mail brings the Hitman a sealed
  letter (`vendetta.contract.offered`): a target drawn from the mail stream (`contract`) among the living seats
  other than the Hitman and its Cabal mates, written to the Hitman's own Notebook. The Hitman accepts it as a
  quest of kind `contract` (3.16) from anywhere (`vendetta.contract.accepted`); an NPC Hitman accepts at once.
  While the contract is accepted and the target lives, a Knife strike on anyone else rests the Knife **30 s**
  longer (`vendettas.contract.offTargetRestS`). A strike that kills the target completes the quest
  (`vendetta.contract.done`, the consequence) and readies the Knife at once; a target who dies any other way
  ends the contract unpaid (`vendetta.contract.lapsed`).

**NPC Killers (7H).** An NPC Killer holds a vendetta like any Killer and walks toward its goal as one more place
under its routine (3.12): the Vicar's scene, a task target's scene, the loaded strongbox's hall or its target's
scene, through `vendettaGoalFor`. It does nothing a human could not do in the same place.

**The Vicar's memorial (7I).** Everything public follows the look (3.17). When a seat whose public look is the
Vicar's dies by the Knife, whether it was dealt the Vicar or wears that look as a cover, the next meeting's reveal
plays a memorial to every seat: the Vicar's film (`memorial_vicar`) under one title caption, skippable like every
cutscene (3.18). It plays once per match, so a later reveal stays plain, and the meeting, not the night, carries
it. No other death plays it: a seat in the Vicar's look poisoned, shot, ejected or taken by a wolf, or a seat in
another look struck by the Knife, even one dealt the Vicar. It names no seat on screen and changes nothing public
beyond the film. The Ascended Vicar candidacy follows the dealt card instead and stays private: the seat dealt the
Vicar that dies by the Knife becomes `flow.ascendedVicarCandidate` at that reveal (room memory only, kept into the
room's next match until another replaces it), which round 8's evolutions read.

**The martyr's due (owner's rule, 7I).** The Vicar must die a martyr: struck by a Killer's Knife, the only source of
a Knife death. A Vicar taken by a wolf, poisoned, shot or ejected is no martyr. The martyr is the seat the memorial
mourns, so it follows the public look like the film: a cover in the Vicar's look is the martyr, and a seat dealt the
Vicar under another look is not, since the bar is public and Killers pick victims by the look they see. From that
reveal, each real task the martyr's ghost finishes counts **10** times on the task bar (`tasks.martyrWeight`),
outside the ghost cap (3.5); the tasks it finished before that reveal count as any ghost's. A full bar in play wins
for the Village, so a Killer that strikes the Vicar hands the village a fast clock: the Zealot, whose goal is the
Vicar's flock, is the one Killer with a reason to take that risk. The private candidacy above stays on the card.

### 3.21 Parties, profiles and friends

Round 7 (ROADMAP R7b; `docs/round7/parties.md`; DECISIONS A103, A104). The menu asks the name on Start Game and
lists parties under Join Game instead of asking a code; a code box stays one tap away for links and codes.

**Parties.** A party is **open** or **private**, chosen by its leader at Create (open by default). The party
list shows open parties in the lobby phase, newest first, at most **50**, refreshed every **3 s** while the list
is open; a row shows the leader's name, the seats taken and the maximum, the mode and the map, nothing else. A
private party is unlisted, except to a device whose profile code the leader **invited** (up to **50** codes,
picked from the leader's friends list at Create), and is joinable by its code or link as every party is. The
list ends at the lobby: a party that has started is never listed, and a listing never carries a seat id, a
device id or a role. The server keeps none of this past the room's life.

**Profile.** One profile per device: the name (**2 to 16** characters, as before) and a **profile code** of **8**
characters from the join-code alphabet, made on the device. The code is shown under Create Profile and may be
shared; it is not a secret and proves nothing, so a device that knows a friend's code sees the private parties
that friend was invited to (the open column of A104). A seat's profile code travels on the public roster, like
its name, so a friend can be added from a lobby row or a game-over row.

**Friends.** Up to **50** entries, each a profile code and the name last seen under it, kept on the device and
never sent except as the leader's invited list at Create. **Quit** leaves any party as Leave does, silences the
music and shows a goodbye panel; it sends nothing more.

The numbers are `balance.json` `party` (`profileCodeLength`, `friendsMax`, `invitedMax`, `listMax`,
`listRefreshS`); nothing else restates them.

