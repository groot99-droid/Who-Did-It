# Game Design Document

> Generated from `docs/MASTER_PLAN.md` (v0.1, 2026-10-10). Owns every rule and number together with `packages/content/data/` (`@wdi/content`): `balance.json` holds the global and per-player-count values, and each role, ability, item, clue and task record holds its own (a cast time, a charge count), so no number lives in two files. A behaviour change is not done until this file changes with it.

## 1. Vision & pillars

A storm has closed the coach road and fog lies on the drowned mere. HollowMere is cut off but for the train, Lord Vane is dead, and someone among you is still killing. Find them before the last lantern goes out.

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
3. **Lobby (0:40-2:00).** Roster of names with a Ready tick, player count "5/10", a line "Best with 6-8 players" and, at 4, the practice line (the Cabal wins with one villager left, 3.9; copy in `docs/UI.md` 14.13). Start is enabled with at least 1 human (NPCs fill the seats below 4, see 3.12); if someone is not Ready the leader sees a confirm dialog listing them. The settings panel holds the leader's Add NPC and Remove NPC and the NPC difficulty (3.12), `map` (HollowMere or BlackPine, 3.13) and `revealMode` (full, locked in V1).
4. **Start and role card (2:00-2:23).** The server deals roles and traits, locks the room and sends each client its private card. The card shows: faction stripe and icon, role name, your character with your traits and the line "You walk as the Baker: Tall / Green scarf / Bowler hat" (a cover role picks the look here instead, 3.17), the deck list, a one-line goal, up to 3 ability rows with key and cooldown, the inventory strip, 2-3 sentences of card text, a Beware line, and for Cabal the teammate names. It holds 20 s; Ready dismisses it; Tab reopens it; a HUD chip (icon + goal) stays top-left.
5. **Grace (2:23-2:53).** Everyone spawns spread around the map's hub (3.13). Kills are disabled for 30 s. One pre-placed static clue glows beside the well: holding E for 2 s collects it and the Notebook opens with "Footprints, long stride: Tall", teaching the collect verb and the trait icon. Toasts: "Shift to sneak", "Hold E on a glowing clue", "E at the bell calls a meeting" (copy ids in `docs/UI.md` 14).
6. **First house (3:00).** You walk to The Drowned Lantern. Others see the door swing for 3 s and your sprite step in; the scene fades 0.4 s to the bar interior with camera follow. A second door leads to the back room, another scene, with a wardrobe (hiding spot) and a trapdoor that is boarded at this party size. Outside the lane you can see the forest gate and, beyond the gate, the forest scene with the cave mouth.
7. **First body (5:30).** Night falls (10 s vignette, then a 100 s night with a 3.5-tile light radius). Somewhere a scream pulses at your screen edge with a direction arrow and a log line "A scream from the north". The Killer carries Blood for 60 s and walks to the well to wash. You find the body in the apothecary loft: E reports it; everyone teleports to the square; the body stays where it was.
8. **First vote (5:45-7:30).** The meeting shows portraits and trait icons, not world sprites (each seat's portrait is its public look, 3.17). The board already lists every Verified entry (none yet, unless the Detective was first on the scene) and a per-player row: "fits 1/1 known traits, Claimed 0, last house: Apothecary". You can Present one Claimed Notebook entry. Tapping a portrait offers "I saw [X] at [Apothecary] around [3:40]" posted as one chat line. Discussion is 60 s at 5 players; voting opens 15 s into it (3.8); the meeting ends early once everyone has voted. Votes are secret until the reveal. The tally shows names; an ejected player's role is revealed; 15 s of immunity follow, everyone spread around the square, and the phase resumes.
9. **The rest of the match (7:30-22:00).** Three to five more cycles of day, night, bodies and meetings; typical match 20-25 minutes. Ghosts see every role, read the Cabal and ghost channels, finish their own tasks and vote a non-binding "ghost suspect" shown on the end screen.

## 3. Game design

### 3.1 Factions, traits and the deck

Factions: **Village** (blue, shield), **Cabal** (red, dagger; Killer and Accomplice know each other), **Neutral** (amber, mask). In the main mode every seat walks the world as the character of its card, so a role is public by sight, except for the three **cover roles** (Killer, Accomplice, Drifter), which always wear the look of another card of the deck (3.17). A client never receives another seat's role card, inventory, Notebook or cooldowns, and nothing it receives tells a cover look from a real one. In the quick mode (3.11) every role stays hidden.

**Traits.** Each player is dealt a unique triple from 27 combinations, from a random stream of its own (never the deal's): **Height** S/M/T (sprite scale 0.9/1.0/1.1, feet-anchored, on top of the drawn figure scale of `metrics.json` `iso.figureScale`, round 8), **Scarf** red/green/blue (every character wears a storm scarf, a tinted overlay in the palette tokens blood/teal/moon; the nameplate repeats it as a shape: diamond/circle/square), **Hat** cap/bowler/bare. The boot trait from the earlier draft is dropped because a boot is 6 px at shipping scale. (M5a) Height and scarf are drawn on the character in the world; the hat is not, since every character keeps its own headgear, and it shows as a glyph on the nameplate, on the role card and in the meeting roster. Traits are dealt apart from the cards, so they still say nothing about a role, and a kill leaves the killer's own traits whatever look they wear (3.4, 3.17). Traits appear on the role card, the HUD chip tooltip and the meeting roster.

**The deck.** A match deals from a public deck of player count + 2 character cards (table in 3.9). Every card is a different character, so two seats share a look only when a cover role chooses to (3.17); the one repeated card is the second Killer of the 10-seat deck, which never walks as itself (Killers always wear a cover). Every Killer card is always dealt; the other cards are shuffled, and two of them stay **undealt**. Which two is secret; the deck list itself is public, in the lobby (for the current party size), on the role card and in the HUD. Townsfolk are dealt as **professions** (Lamplighter, Baker, Fisher, Tinner): each is one card, the Townsfolk card with a character of its own. The deck rows are `roles.json` `decks["4".."10"]`; the rules engine reads them, and no document restates them. The Butler and the Child stay out of the decks until their abilities ship (M4); the Ranger (V1.5), the Thief (V1.5) and the Medium (V2) join when they ship. Lobby toggles (Thief, Medium, faction-only reveal) are V1.5.

### 3.2 Role cards

"Cover" says whether the role wears another card's look (3.17). Every card's character, portrait and world look are `looks.json`. (Round 8, DECISIONS A171.) A number in a card's goal, card text, Beware or win line is never typed in `roles.json`: it is a token naming the data it states (for example `{clues.clues.blood.params.visibleTiles}`), filled when the content loads, so the card shows the same words and always agrees with the rules ("data wins, card generated", the owner, A168). A count spelled out ("one arrest", "once each") is a token too, written in words; the few count words that are not a number in the data ("one villager", a pronoun "one") are listed with their reasons beside the test that checks it. The Thief's Heirloom count waits for its data until the Thief ships.

| Role | Cover | Win | Start kit | Abilities (max 3) | Card text | Beware |
|---|---|---|---|---|---|---|
| **Killer** (Cabal) | Yes | Parity (6+), or living Village <= 1 (4-5), or the Final Night vote fails | Knife (bound), Skeleton Key, Bloody Rag x2, Bucket | **Kill** (CD by table; resolved on the validated tick; spawns clues; you gain Blood 60 s) (M3: reach 1.5 tiles plus what the target moved in the last 250 ms, with a clear straight line; a protected target voids the strike, spends the protection, and you still gain Blood and rest the Knife; the victim becomes a ghost at once, the body and both clues appear in the scene, a scream rings within 8 tiles.) (M5a: only at dusk, at night and in the Final Night hunt.) **Impersonate** (dusk, night and the Final Night hunt; 45 s CD from the drop): for 15 s your character shows one living seat's name, look, scarf and hat glyph, at your own height; the face changes and drops only out of sight, except that your next Knife strike drops it in place with a puff (3.17). **Drag body** (hold E, 50% speed; into a body spot = hidden; leaves a drag smear). | Walk in a borrowed character. Strike after dark when the room is empty, clean one clue, wash at the well, then be the loudest voice asking who did it. | Clues match your own traits whatever face you wear; your height never changes; Blood shows within 3 tiles; a guarded target voids your kill. |
| **Accomplice** (Cabal) | Yes | As Killer | Plant Kit x3, Crowbar | **Plant Clue** (60 s CD): a footprint or thread with chosen traits. **Crowbar**: break a locked door (5 s, noise 10). (M5a) **Inherit**: when the last Killer dies or is ejected the Knife passes to you (kill CD +10 s; your Hunger clock starts in the round you inherit). The seat then plays as the **heir** card (`roles.json` `heir`: the Accomplice's kit and Plant Clue and Crowbar, plus the Knife); its public look is unchanged and only a private message tells it. | You never hold the knife, only the alibi. Forge trails, break the right doors, vouch at the right moment. | Inspect marks plants Forged; a Forged entry tells the village an Accomplice exists; your cover is a claim someone may test. |
| **Detective** (Village) | No | All Cabal dead or ejected | Magnifier, Notebook, Lens x3, Fingerprint Kit | **Inspect** (3 s, 1 Lens; +1 Lens per meeting, max 3): reveals a clue's hidden attribute, exposes forgeries, marks it Verified. **Dust / Compare**: lift a print (2 charges) and compare any two: Match / No match. | Collect, inspect, cross-reference. Your Verified clues narrow the board; the village does the rest. | Prime target; the Rag erases clues; forgeries cost Lenses; Compare never gives a name. If you die the Magnifier drops and anyone can Inspect in 6 s. |
| **Doctor** (Village) | No | Village | Medkit x2, Bandage x2, Salts x1 | **Bandage** (60 s CD, not self): (M3: instant, 1.5 tiles, one Bandage from the kit; the blackout and the Claimed entries are built, `abilities.json` `bandage.params` holds their numbers; the knockback still waits.) the target survives the next kill attempt within 60 s; both are knocked back, the target's screen blacks out 1.5 s and gets the attacker's height as a Claimed entry; witnesses within 3 tiles get height + scarf as Claimed; the attacker still gains Blood. **Autopsy** (8 s): time of death +/-45 s and cause (knife / wolf / poison / shot), posts Verified. **Salts**: cure Slowed or Poisoned (3.22). | Keep people alive and read the dead. Your autopsy says when; that is what breaks alibis. | Two-Killer games outpace your bandages. |
| **Vicar** (Village) | No | Village | Candle x2, Pocket Watch | (M5a) **Hear Confession** (night power, once per night, not self): pick a seat from the list; your Notebook gets its faction (Village, Cabal or Neutral) as Verified. | Everyone in HollowMere confesses to you sooner or later. Each night, learn where one soul stands, then choose how much to say. | Everyone can see you are the Vicar, the Cabal first among them; if your card was not dealt, a Cabal player may wear your face and lie in your name. |
| **Watchman** (Village) | No | Village | Lantern, Pocket Watch | (M5a) **Keep Watch** (night power, once per night; not self, and never the seat you watched the night before): the seat survives the first Knife strike before the night ends; the strike fails as on a Bandaged target, and your Notebook gets "Your watch held" as Verified. | You walk the lanes after dark. Each night, choose one door to stand by; if a blade comes for that soul tonight, it fails. | You cannot watch yourself or the same soul two nights running; poison and the Gamekeeper's shot go past you. |
| **Herbalist** (Village) | No | Village | Remedy x1, Nightshade x1, Candle | (M5a) **Remedy** (night power, once per match, self allowed): the seat survives the first Knife strike before the next meeting opens; your Notebook records it when it holds. **Nightshade** (night power, once per match, not self): the seat dies when the night ends, wherever it stands, and leaves no trait clues. | One bottle saves, one bottle ends. Pour the first where the knife will fall and the second only where you are certain. | Nightshade kills a villager as readily as a killer, and a Remedy cannot stop it. |
| **Gamekeeper** (Village) | No | Village | Fowling Piece (bound), Lantern | (M5a) **Last Shot** (passive): when you are killed, poisoned or ejected you have 10 s, before you learn any role, to pick one living seat from the list; it dies too (a shot rings 10 tiles where it stands). You may hold your fire. (M5a) A Knife strike blacks out your screen at once, as a Bandaged target's does: you aim from the list on what you saw before the blow. | Vane paid you to keep the wood. If they come for you, you will not go alone; make sure the one you take is the one who came. | You never see the blow that fells you, and the face that walked up may have been borrowed; a wasted shot kills a friend. |
| **Butler** (Village; not dealt until M4) | No | Village | Master Keyring, Candle x2 | **Lock / Unlock** any house door instantly (10 s CD; locks keep people out, never in). **Ledger**: at each meeting, privately lists for each living player the last house they entered this cycle (house only, no time). | You know every door in HollowMere. Control the wings, read the ledger, say who went where. | Universal access makes you the obvious suspect; Skeleton Key use looks like yours. |
| **Child** (Village; not dealt until M4) | No | Village | Slingshot, Chalk, Candle | **Silent hide** (instant, no noise; adults cannot Check a crawlspace). **Witness** (passive): with line of sight within 6 tiles of a kill, "The Child saw it" posts height + scarf as Verified at the next meeting. **Slingshot**: a small hit from 5 tiles that Stuns (3.22; 30 s CD). | You are small and quiet. Hide, watch, remember. | Top kill target; vision -1 tile; cannot pick up items. |
| **Townsfolk** (Village), dealt as the professions below | No | Village | Lantern, Pocket Watch, Chalk, Rope | **Tasks**. **Chalk**: floor marks visible to all. **Rope**: free a snared player. Two Emergency Bell pulls per match (others have one). | Do your chores with others to build alibis, mark what you see, vote with evidence. | Weak alone; strong in pairs. |
| **Lamplighter**, **Baker**, **Fisher**, **Tinner** (Village, professions) | No | Village | As Townsfolk | As Townsfolk | Lamplighter: You light the lanterns that keep the wolves off the square. Work beside others, mark what you see, vote with evidence. Baker: Up before anyone, flour to the elbows. Do your chores in company, mark what you see, vote with evidence. Fisher: The fog keeps the boats in. Mend the nets beside a neighbour, mark what you see, vote with evidence. Tinner: The mine is shut; your hands are not. Work in pairs, mark what you see, vote with evidence. | As Townsfolk |
| **Drifter** (Neutral) | Yes | Get ejected (solo win; the match continues and the end screen lists you among the winners). | Replica Knife, Bloody Rag x1 | **Act Shifty**: fake noise rings (20 s CD). **Fake Blood**: 30 s (1 use, world only; meetings show portraits). | You want to hang. Be suspicious enough to be voted out, not so obvious they ignore you. | A calm village; dying to the Killer is a loss; counts as nobody for parity; you wear a cover like the Cabal, but alone. |
| **Ranger** (Village, V1.5) | No | Village | Crossbow + 2 Bolts, Snare x2, Torch | **Shoot** a wolf: it dies. **Arrest** (1 bolt on a player): the target is cuffed and dragged to the square; the next meeting opens with them as a Case Closed suspect. **Snare**: holds 4 s and logs the name. | You hunt wolves. One arrest per match: be right. | Bolts are loud (noise 10). |
| **Thief** (Neutral, V1.5) | Decided when it ships | Escape by the sea door at the back of the cave holding 3 Heirlooms | Lockpicks x5, Sack, Smoke Bomb | Pickpocket (40 s CD), Lockpick (2 s, noise 5), Smoke (4 s). | Nobody's hero. | Thefts look like Killer activity; counts as Village for parity. |
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
| Day | Free roam; light radius 7 tiles; the Knife is sheathed | 480 s (8 min; round 10, A5) |
| Dusk | Vignette, "Night falls in 30 s"; the Knife, Impersonate and the night powers wake; missing-person check | 30 s |
| Night | Light radius 3.5 tiles; wolves active; the hunt | 300 s (5 min; round 10, A5) |
| Meeting: discussion | Body report, Emergency Bell, or missing-person roll-call | 60 / 75 / 90 s (4-5 / 6-7 / 8-10) |
| Meeting: vote | Open from 15 s into the discussion (`meeting.minVoteS`, 3.8); ends early when all living players have voted | 25 s after discussion |
| Reveal | Tally with names; ejected role revealed | 8 s (held for an ejected Gamekeeper's Last Shot) |
| Immunity | No kills, no noise; everyone spread at the hub; then a new day (M3: the day restarts in full and the cycle count rises) | 15 s |
| Final Night | The day that would start cycle 6 begins with no winner yet | 135 s hunt, then the trial: a 120 s discussion and the vote |
| Game over | Winner, every role and look, the undealt cards, the summary; then the lobby again with the same code and seats | 20 s |

(M3) The match clock starts when grace begins; the Knife's first cooldown starts when grace ends, and a meeting that opens during a world phase restarts the cycle at a full day once immunity ends. A cycle (day, dusk and night) is 810 s; a match is 12 cycles and the Final Night, about 170 minutes of world time (round 10, A5: the owner's "days should now last 8 minutes and nights last 5, keep the game play as it was before but prolong everything"; the match length is followup-4 2.8, which supersedes round 8's 5 cycles of A171). Round 10 scales every clock by the factor of `world-mode.md` 7: D = 4 for what runs by day, N = 3 for what runs after dark, C = 3.5 for what runs through the cycle, and keeps a person's own actions (holds, reach, movement, mini-games), the pauses and every count per cycle. Doors, locks, bodies and clues persist across phases. All timers are tick-based (20 Hz) in state and rendered through a server-time offset.

(M5a) **The Knife works only after dark**: at dusk, at night and in the Final Night hunt, never in grace, day or immunity. Since tasks (M4d) and quests (M5b) give the day work, the day (480 s) is a little longer than the night (300 s; round 10, A5). Impersonate and the night powers follow the same clock (3.2, 3.17).

(M5a) The Emergency Bell rings only in grace and day; after dark only a body report or the missing-person roll-call opens a meeting.

**Missing-person roll-call.** At each Dusk the server checks for (a) a dead player whose body has been unreported for a full phase, or (b) a living player no other player has shared a scene with for a full cycle. If either holds, a meeting opens with "X has not been seen" on the board. A Killer who hides every body still faces a meeting.

**Hunger** (M5a). A day starts a new round (`round` + 1). When a day starts round r, a living Killer whose last Knife strike was in round r − 1 − `hunger.cyclesWithoutKill` or earlier (round 0 when they never struck) is **Hungry**: from then on, every `hunger.trailEveryS` (1 s) in which they move, a glowing footprint (`hungerPrints`, showing their own height, gone after 30 s) appears on their tile, in every phase and whatever look they wear. With the default of 2, a Killer who never strikes is Hungry from the day of round 3. Any accepted strike, a voided one included, ends Hunger; an Accomplice who inherits the Knife counts as having struck in that round (3.2). Glowing footprints cannot be collected; anyone in the scene sees them.

**Final Night** (M5a). When the server would start a day whose round is above `finalNight.afterCycle` (12; round 10, A5, followup-4 2.8), after a night or after the immunity of a meeting, and nobody has won, the Final Night begins instead of that day. Everyone stays where they stand under night lighting; every Knife's cooldown is cut to at most `finalNight.killCooldownS` (60 s) and the Knife rests that long after each strike; the night powers wake for one more use; clues keep spawning. The hunt is short: it lasts `finalNight.huntS` (135 s; round 10, A5); a body report ends it at once (`finalNight.reportEndsHunt`; the Bell is silent after dark). Then Nightshade resolves, everyone moves to the square and the trial opens, the forced meeting (reason `final`): a discussion of `finalNight.trialS` (120 s, whatever the party size, longer than any other meeting's; the content check refuses a shorter one), then the vote of `phases.voteS` with no Skip (`finalNight.skipAllowed`) and the Case Board open. The trial runs through the same phases and events as any meeting. The plurality is ejected and revealed; a tie ejects nobody (`finalNight.tieEjectsNobody`). The match always ends there (3.8). A death during the hunt runs the win check as usual, so parity can still end the match first.

**The Daily Train** (round 7, HollowMere only; DECISIONS A113). A map whose file names a `station` (a spawn on its hub: HollowMere's platform `overworld.platform` on the overworld's east edge) has a Train. On every day, `train.arriveAtS` (20 s) after the day begins, the Train arrives: the seats on the hub within `train.hearTiles` (20 tiles) of the platform hear `train_arrive`, and every seat's chat log gets the system line of UI.md 14.30. `train.deliveryAfterS` (32 s) later it delivers, with `train_brake` to the same seats when the world is in play. A meeting that opens before the arrival takes that day's Train with it; once arrived, the delivery follows whatever the phase. No Train in grace, at dusk, at night, in the Final Night or in the quick mode. The arrival and the delivery are the sim events `train.arrive` and `train.delivery`, which name no seat; the vendettas run on them (3.20). BlackPine has no Train.

**The day's dead and the Dusk Train** (round 10, C1; `docs/round9/world-mode.md` 6, followup-4 2.6). The morning Train brings back the day's dead: a seat killed in grace, the day or immunity by a creature's bite or a shot is **on the line** (3.22) until the next day's arrival, when it steps off at the platform and every seat's log reads the line of UI.md 14.47; the Final Night brings back every seat still on the line. A death after dark, the Knife, Nightshade, the vote and a vanished seat are for good, as is any death on a map without a Train. A second train, the **Dusk Train**, leaves `train.dusk.leaveAtS` (15 s) into every dusk: the sim event `train.dusk`, the whistle to the seats near the platform and a system line; it brings nobody back (the Hitman boards it, 3.33).

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
| Scratches (round 10, D5c; on the tile of a lock a pick opened) | That a lock was picked, never by whom: `value` and `dir` are 0 for every picker | 2 cycles | Anyone |

Wolf kills spawn Fur and Claw Marks (decay 1 cycle), no footprints. Collecting: stand on a clue, hold E 2 s; it enters the Notebook with trait, scene and time. (M3: Footprints and Thread only; the hold is cancelled by moving, releasing, dying or a meeting, and several players may collect the same clue.) The Rag erases 1 clue (3 s, noise 4). Washing needs the Bucket and water (the well or a basin). A Wounded player's drips fade after 20 s; a one-way drop leaves a 90 s footprint trail (height) at the landing. Each scene keeps at most 40 clues; past that the oldest Claimed clue is collected first. Plants are indistinguishable until Inspected. When two different players collect the same physical clue it becomes **Corroborated** and counts as Verified for the suspect set; Townsfolk therefore have a deduction verb. **Round 10, B2:** the Constables verify every collectible clue at `law.speedMult` times a Detective's rate and brief its kind, scene and trait to everyone `law.briefingAfterS` after it appears (3.31).

**Blood is held by the server** (round 8, 8L, A170): a client receives a figure's Blood only while it stands within the Blood clue's range of that figure (`clues.json` `blood.params.visibleTiles`), or when it is a ghost; nobody further away is sent it at all, and the client draws it only within the same range. The killer's own client always knows it is bloody.

**Case Board.** Verified and Corroborated entries are posted automatically; each living player may Present one Claimed entry. The board renders a per-player summary row (fits n/m known traits, Claimed count, last house) rather than raw entries. The server intersects the Verified traits of each body against living players' traits and shows **Suspects: A, B** when the set is 3 or fewer. A suspect's own vote is void and a tie ejects them only when the set is exactly one player and was built from two bodies, or from a Child silhouette plus one Verified trait. Forged entries discredit nobody; they display "Forged: an Accomplice is in play".

### 3.5 Items and tasks

Inventory: 24 slots (the round-10 screen splits them into a hotbar of 6 and a pack of 18, and adds belt and equipment slots), Q drops, everything drops on death; role-bound items (Knife, Replica Knife, Master Keyring, Magnifier, Notebook, Slingshot, Remedy, Nightshade, Fowling Piece; V1.5 Crossbow) never drop except the Magnifier (drops as a 6 s Inspect for anyone); an ejected Village role's kit goes to a chest at the square.

| Item | Effect | Ships |
|---|---|---|
| Knife, Skeleton Key (3 s, noise 5, leaves a print), Master Keyring | Kill; open any locked door; lock/unlock any door | V1 |
| Bloody Rag, Bucket | Erase one clue; wash Blood at water | V1 |
| Plant Kit, Crowbar | Fake trait clue; break a locked door (door stays broken) | V1 |
| Magnifier, Notebook, Lens, Fingerprint Kit | Inspect; auto-log; charges; Dust and Compare | V1 |
| Medkit, Bandage, Salts | Heal and stop Bleeding; kill immunity 60 s and stop Bleeding; cure Slowed or Poisoned (3.22) | V1 |
| Remedy, Nightshade, Fowling Piece | Herbalist's save and poison (one each), and the Remedy cures Poisoned by day (3.22); the Gamekeeper's Last Shot | V1 |
| Wake Loaf | Food: cures Famished and Weakened and restores stamina (3.22) | V1 |
| Lantern, Candle | Carried light radius 4 / 2; wolves flee light within 4 tiles; off = stealthier | V1 |
| Pocket Watch, Chalk, Rope | Time; floor marks; free a snared player | V1 |
| Oil, Wrench, Planks, Letter, Flour | Task deliverables fetched from other scenes | V1 |
| Forged Alibi, Handcuffs, Crossbow kit, Lockpicks, Smoke Bomb, Heirlooms | V1.5 kits | V1.5 |

**Tasks.** Village players get 3-5 tasks; the global bar at 100% wins. Each needs a tool from another scene and a 2 s hold at the node: Light the lanterns (Oil from the tavern back room to a square lantern post, night only), Fix the well pump (Wrench from the apothecary bench), Deliver a letter (from the widow's letter box to the tavern dartboard), Mend the fence (2 Planks from the edge of Gallows Wood by the gate to the NE fence; while mended, wolves cannot enter the village), Fetch the flour (from Crumb's Ovens to the tavern); and behind Crumb's Ovens (round 7, A118) Mix the dough (Flour from the bakery's sacks to the mixer), Stoke the oven (Timber from the woodpile at the edge of Gallows Wood to the brick oven), Stock the cold room (a Bucket of well water from the pump to the cold shelves) and Proof the loaves (a Candle from the widow's bedroom to the proofing cabinet), which join the pool the deal draws from, the number dealt and the bar's maths unchanged. Co-op task (Shutter the windows, in the tavern): both players within 2 tiles of the node holding E for 4 s; progress pauses when one releases. Two-player carrying is V1.5. Completing a task writes a Claimed alibi entry (time + scene). Cabal see a fake list that writes entries but never fills the bar. Ghost task completion counts 100% but ghost contribution is capped at 25% of the bar, except the martyred Vicar's (3.20). A full bar in play ends the match for the Village.

**The deal (round 7, A133).** At Start, after the cards, each human seat is dealt its list from the pool of fetch tasks whose source and at least one target stand on the chosen map at the party's profile (3.13); BlackPine, whose scenes hold no station yet, has an empty pool, so it deals nothing and its bar never moves. A Village seat draws `tasksEach` (3.9; round 10, A5: 29 to 48 for the 12-cycle match, capped by the pool until the chores and quests of D9 widen it) real tasks and a Cabal or neutral seat as many fake ones, both without replacement from the same pool, on a stream of their own that nothing public shares. An NPC seat is dealt no list: its brain plays no mini-game, and a list never worked would cap the bar below 100 for the match. The bar starts every match at 0. A ghost finishes its own tasks (3.8) through the same hold and the same mini-game, under the ghost cap above. **Shutter the windows (7M).** The co-op task is dealt like the others. Any seat within `coopRadiusTiles` of the shutters may hold E there, with or without the task on its list; the shared progress runs each tick that `coopPlayers` or more hold, pauses while fewer do, and starts again from nothing once everyone has let go. At `holdS` the task completes for every holder whose own list has it undone (a real one moves the bar, a fake one writes its alibi only) and the helpers earn nothing. Every holder sees the shared progress and the pause. **Fetching (7M).** At a task's source prop the same hold is the pick-up: it puts the task's deliverable (its tool, `toolQty` of it) in your pockets, once at a time (not while you carry that many, not without a free slot), and the puzzle at the target takes it back when the task is done. A fake list's holder goes through the same motion at the same shelf and takes nothing; inventories are private, so nothing public tells the two apart. The `taskBar` invariant (A133) holds the bar to what the lists say (so a fake task never moved it and the ghost cap held), lets no NPC seat hold a list, and matches every `taskDone` of the match log to a finished entry on its seat's list.

**Communication.** No voice in V1. Global text chat in meetings, lines of at most 200 characters. Outside meetings: an 8-phrase quick-chat wheel (Follow me / Where were you? / I saw something / Help! / Clear / Suspicious / Wait / Go) as speech bubbles within 5 tiles, plus world pings. Cabal channel and ghost channel are sent per-recipient by the server; the client never chooses a channel. (M3) A living player may speak only while a meeting runs (discussion, vote and reveal), to everyone; a ghost may speak in any phase, to the other ghosts only; empty lines are refused and long ones are cut to the limit. Proximity text chat is a V1.5 toggle.

### 3.6 PvE

Round 8 (3.22, DECISIONS A134, A136) replaced the two-hit-point model: a seat has `body.maxHp` (100) health, and the Knife still kills outright whatever the health (A89). Under `body.woundedBelow` (30) you are **Wounded**: 0.8x speed and a drip trail until healing takes you back over the threshold (`effects.json` `wounded`). **Wolves** (3, forest interior loops, dusk and night): a bite takes 25 health and starts Bleeding half the time (3.15), chase unlit players, flee any lantern or candle within 4 tiles, die to one bolt, blocked by a mended fence; a broken fence pulls one wolf into the village at night (the Cabal's reason not to mend it). The forest gate has a 6-tile safe clearing. V1 has no well fall and no bear traps; the well ladder into the cellar (`ov.well`) opens at the Large profile in V1 as a plain portal. V1.5: bear traps placed by the Ranger, a Shove verb at the well. V2: the Beast and Cave Gate, bats, bog lurker, crows.

### 3.7 Stealth, hiding and doors

Vision 7 tiles by day, 3.5 at night, Child -1; walking moves 3 tiles/s, running 4.5 tiles/s, and sneaking (Shift) is silent at 60% of walking speed. A door is usable from 1.5 tiles of its tile centre, the same reach as the other verbs; the body's collision box is a 0.5-tile square under the feet (WORLD 4.2). Noise radii in tiles: walk 2, run 6, door 4, kill scream 8, rag 4, skeleton key 5, crowbar 10, bolt 10, lockpick 5, hide 2, burst out 6, one-way drop 9, the barn goat 4, a Wisp rattle 2, an NPC's shout for a body 8 (round 8, 3.12), an axe's chop 8 and a pickaxe's smash 10 at the tool walls (round 10, x2, 3.14; proposals for the balance lab); noise renders as a screen-edge pulse with a direction arrow and a log line, crossing a portal at 50% radius and re-emitting at the paired portal. In V1 the server encodes a player's position only to clients in the same scene, as an avatar under a random handle (3.17); the darkness radius is a client-side mask, drawn as the lighting layer of 3.13; a dark scene uses the night radius in every phase. Since M5b a dark scene's radius and occluders hold on the server (3.15): a living seat there receives another avatar only within its night radius and line of sight, and a lit carried light (Lantern, Torch, Candle) adds 2 tiles (`vision.lanternTiles`) to both seeing and being seen; lights start out and are lit by their holder. Since round 8 (8L, A190) the same holds in every scene at night and in the Final Night: by day, at dusk and at dawn an ordinary scene is still sent whole.

**Hiding spots** (wardrobe, hay pile, under bed, barrel; crawlspaces for the Child) hold one player; **body spots** (cellar dump, crypt niche, hay pile) are separate objects. Entering takes 1 s, noise 2; the hidden player sees a slit view and keeps one action, **Burst Out** (E): instant, stuns the Checker 1 s, noise 6. **Check** (E, 2 s) opens a spot; a Check on an occupied spot writes a Verified Notebook entry for the hider ("X opened my wardrobe at 3:12"), so checking is evidence.

**Doors** have four server states: open, closed, locked, broken. Any door unlocks from the inside for anyone. Killer locks expire after 45 s. From outside you see the door swing for 3 s; the entering player is in a 0.6 s `transit` state, encoded to both scenes at the door with the nameplate hidden.

**Death and ghosts.** A kill is private until the next meeting: the roster still shows the victim alive, the victim's client learns at once, and the body in the scene is the only sign; a meeting reveals every death so far. Dead and ejected players become ghosts: walk through walls and portals (no lock, phase or alive checks, no noise), see all roles, read the Cabal and ghost channels, finish their own tasks, and once per cycle use a Wisp (flicker a lantern, rattle a door for noise 2, or nudge a clue 1 tile; V1.5). Ghosts are drawn only for other ghosts. Ghosts cast a non-binding ghost vote shown on the end screen. (M3) A living client never receives a ghost's position; a ghost sees every player in its own scene; nobody's position is sent during a meeting, the reveal or the end screen.

### 3.8 Meetings, voting and win conditions

- **Village** wins when all Cabal are dead or ejected, tasks reach 100%, or the Final Night vote ejects a Cabal member.
- **Cabal** wins at parity (living Cabal >= living Village; Thief counts as Village, Drifter as nobody) at 6+ players; at 4-5 when living Village <= 1; or when the Final Night vote ejects nobody or a non-Cabal player.
- **Drifter** wins alone when ejected, and the match goes on. (M5a) The end screen lists an ejected Drifter among the winners (`gameOver.alsoWon`) whichever faction then wins; a Drifter who is killed, poisoned or shot loses. A Drifter ejected by the Final Night vote wins beside the Cabal.
- **Final Night** (the day that would start cycle 6 begins without a winner, 3.3): night lighting, wolves roam the village, Cabal kill CD 20 s, a 45 s hunt with clues still spawning, then the trial, a 120 s discussion and a forced vote with no Skip and the Case Board open; a tie ejects nobody and the Cabal wins.
- Tie or Skip majority: nobody ejected. After two consecutive no-ejection meetings (Drifter ejections count as none) the next vote has Skip disabled and ejects only a player holding at least ceil(living/3) votes; otherwise nobody is ejected and the next cycle has no grace.
- **Hunger**: a Killer with no Knife strike in 2 full rounds leaves glowing footprints until they strike (3.3).
- **Last Shot** (M5a): an ejected Gamekeeper shoots during the reveal (3.2); the win check runs after the shot, with both seats out.
- **Paint The Town Red** (round 10, C5; `docs/round9/world-mode.md` 1.6, followup-4 2.2; owner answer WM3). A party of
  exactly two humans and at least one NPC seat deals both humans the Killer card, with no vendetta. The deck's second
  Killer card takes the place of the Accomplice, else the Drifter, else a profession drawn on the deal's stream (never
  the Vicar), so it still holds at most two covers; the 10-seat row already holds two. Every other card goes to an NPC
  seat. The Vicar card is always dealt (to an NPC seat), so the three pillars stand in every match. Each Killer's private view is marked (`Private.paintTown`) and picks its worn card as any Killer does.
  - Every NPC seat's death returns on the next morning train (3.22), after dark and to the Knife too, so the town never
    runs out. A Killer's own death follows the usual rule.
  - A Knife kill of an NPC seat by a Killer adds one to that Killer's total, and to its unique count the first time it
    kills that seat. The counts stay in room memory until game over: no field, line or refusal changes at a kill.
  - The two share the **Paint The Town Red** victory (`Winner.paintTown`) when their combined unique count (every NPC
    seat either has killed) reaches ceil(`paintTown.winUnique` (half) x the NPC seats at the deal), at least 1, or
    when the three pillars are dead at the same moment: the Vicar's seat, the Company Clerk and both Constables (the
    guard figures of 3.24; the Constables fall as one pillar only when both are dead). A guard's death counts toward
    the pillars only. The game-over frame carries the target and each Killer's unique and total
    (`gameOver.paintTown`); the end screen ranks them by total.
  - There is no parity check. A Killer dead for good (or ejected by the vote) is caught and its run ends; the other
    plays on. The Village wins when both are caught, or when the end trial closes with the town unpainted.
  - Not built yet: the Knife on the guards and their return on the morning train (C5's guard step), and, until the
    Constables' petitions land (10B), the Constables filing their own petitions with no human on the town side (12,
    R3). Until then a match ends by deaths, the unique count, the pillars or the end trial.
- Disconnect over 60 s = death with cause "vanished" and a body at the last position; reconnection within 60 s resumes the same role. (M3: a player who leaves during play becomes a ghost at once with no body; the window and the body arrive with reconnection in M7, A30.)
- No Clue Surge. A wrong ejection adds 15 s to the next discussion instead.
- (Round 8, 8L, A190) **The vote delay.** A vote cast in the first 15 s of a meeting (`meeting.minVoteS`, Final Night's included) is refused with the reason, so a vote agreed before the meeting cannot land before anyone has spoken; the portraits and Skip wait out the delay with a countdown, and a vote is changeable as before once it opens. `minVoteS` stays under the shortest discussion (the content check). It replaces `meeting.voteOpensImmediately`.
- (M3) The win check runs when a death is recorded and, for an ejection, when the reveal ends, so the tally, the stamp and the role line always show first; it never runs on a bare tick. A tied vote, or a Skip plurality, ejects nobody. (M5a) A Nightshade death and a Last Shot are deaths like a kill; the win check of a batch that holds a dying Gamekeeper waits until its aim closes, then runs once for every death of the batch. Meeting requests and phase changes never wait for an aim (3.2).
- (M5a) **What a meeting reveals.** An ejection reveals the ejected seat's role card and the look it wore ("Bo was the Killer, walking as the Baker"); a shot fired at the reveal reveals its target's role too. A death in the world (Knife, Nightshade, a shot) only flips `alive` when the next meeting opens; it reveals no role until game over, which shows every seat's role, the look it wore and the two undealt cards (3.17).

- (Round 8, A174) **The bell at night.** The bell may be rung at night, by a seat or an NPC, while an unreported body lies in the world; with no such body the night rule above stands. (8R) The body must be unhidden and unreported; then the bell works in every world phase where a verb works, except the Final Night, where a report already ends the hunt. The rope reach and the pulls per card are unchanged. NPCs ring it from the body bands (3.12). **Meeting notes** (8T): a second meeting channel whose lines carry no speaker, open to every living seat, rate-limited by `balance.json` `talk`; NPC seats write there too (3.25). 8R and 8T write the detail with their code.
- (Round 8, 8T) **Meeting notes.** A second meeting channel beside the named chat, whose lines carry no speaker: a
  note reaches every client with no name, and nothing on the wire says who wrote it. Every living seat may write one
  in the discussion, the vote and the reveal (`chat.note`); a ghost may not, and a ghost still reads them. The line is
  trimmed and cut to `chat.maxChars` like a chat line. A seat writes at most `talk.notesPerMeeting` (4) notes a
  meeting and at most one every `talk.noteGapS` (6 s); a note outside a meeting is refused with 425, one too soon or
  past the cap with 424. NPC seats write notes too, under the same limits, so their lines hide among the humans'
  (3.12, 3.25). Named chat is unchanged.

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
| 4 (practice) | Killer | 180 s | 60 s | 29 | Cabal needs living Village <= 1 |
| 5 | Killer | 180 s | 60 s | 29 | As above; Doctor added; the Drifter may be dealt |
| 6-7 | Killer (+ Accomplice at 7, if dealt) | 105 s | 75 s | 38 | Parity; Watchman added; the Drifter may be dealt at 6 |
| 8-9 | Killer (+ Accomplice, if dealt) | 90 s | 90 s | 38 | Herbalist at 8, Gamekeeper at 9 |
| 10 | 2 Killers | 120 s each, 45 s global lock | 90 s | 48 | Suspect sets decide |

The Knife works only after dark (3.3), about 330 s of each 810 s cycle (round 10, A5: the cooldowns are three times the old ones, so the strikes per night are unchanged), so a cooldown buys at most two strikes per Killer per night at 4-5, four at 6-9 and three at 10. (M5a) The soak checks these values: the median match length at 6-10 seats is 20-25 min (round 8, A171: the owner's length; `pnpm auto --matches 50` at 6, 8 and 10 seats, timed from grace) and, on the owner's human playtests rather than all-NPC runs (NPCs rarely eject the Killer; A171), at most one third of matches reach the Final Night (`phases.nightS` is the M5a value; `phases.dayS` and `finalNight.afterCycle` are round 8's). The practice table (4 seats) ends early, mostly by its Cabal win, and stays short of 20 min; the phases are not stretched for it. Snowball guard: when living Village <= Cabal + 2, kill CD +30 s and the next kill spawns all 3 trait clues; when only one Killer remains with >= 6 alive, kill CD -15 s. All of these are `balance.json` values; the first playable ships plain plurality with Skip and enables the anti-stall rules one per playtest.

### 3.10 V1 cut list

**First playable (M3, "Mafia with walking")**: lobby, 5-char codes, reconnection in lobby; roles Killer / Detective / Doctor / Townsfolk; traits height + scarf; overworld 40x30 greybox + tavern (2 rooms) + widow cottage (2 rooms) + forest + cave entry; kill, body, Blood tint, two clues, Notebook, Detective auto-Verified; report / bell; meeting with portraits, chat, secret vote, eject + reveal; checkWin; ghosts with ghost chat.

**V1 (beta)**: everything in 3.1-3.9 marked V1: Butler, Child, Accomplice, Drifter; Lens charges, Dust / Compare, Autopsy, Bandage, Ledger, Witness, Plant Clue, Rag, Bucket; Case Board with suspect sets and Corroborated; 6 task types incl. 1 co-op; wolves, fence; hiding spots, Burst Out, Check; door states, Skeleton Key, Crowbar; Hunger, Final Night vote, missing-person roll-call; quick-chat, Cabal and ghost channels; scene profiles Small / Medium / Large; 10-player rules; the n+2 deck, professions, public looks and covers, Impersonate, the Vicar, Watchman, Herbalist and Gamekeeper (M5a).

**V1.5**: Ranger (Arrest), Thief, Heirlooms, the cave's sea door, Handcuffs, Forged Alibi, the Killer's Lock door, Candles for all, Wisp, Butler Bell, lit-window silhouettes, proximity chat toggle, faction-only reveal, fisher cottage, lighthouse, lobby role toggles, radius + occluder visibility (dark scenes first, M5b; 3.13), Lottie reveal, Light2D experiment, spectator mode.

**V2**: Medium, the Beast and Cave Gate, bats, bog lurker, crows, poison, voice chat, cosmetics; first-person renderer.

### 3.11 The quick mode (removed)

Removed in round 7 (owner, 2026-10-23, DECISIONS A115): a short one-night mode played at card tables over the owner's kitchen art, in which nobody walked. `docs/round5/onub-contract.md` keeps its round-5 contract as history.
What stayed: Crumb's Ovens (`bakery`) as a HollowMere building with four rooms (A116, 3.13), the four mini-games at the main mode's task stations (3.16), and the owner's kitchen pictures as Port-au-Levain's reference set (round 8).
The section keeps its number so 3.12 to 3.21 keep theirs.

### 3.12 NPC fill (below the minimum)

**Decision (owner, 2026-10-10, A16 and A26):** a party may start with fewer than `players.min` humans; the server fills the empty seats with NPC villagers so the full deck is dealt (3.1).

- **Seats.** Start is enabled with at least 1 human. With fewer than `players.min` players the server adds NPCs up to `players.min` when Start is accepted, before it deals, so the full deck row is always dealt (M3c; the A28 cut row is gone); the leader may add NPCs by hand in the lobby with "Add NPC" up to `players.max` and remove them again, the newest seat first (M3c). A human joining a full lobby takes an NPC's seat, the newest first (M3c). (M5a) An NPC seat is never Ready the moment it appears: a seat added with Add NPC, and every NPC seat when a match returns to the lobby, turns Ready 2-9 s later (`npc.ready.delayS`), each on its own draw, the way a human clicks.
- **Same game.** NPCs are dealt from the same deck and can hold any card, the Killer included; their cards are as secret as a human's. Rules, the practice label at 4 (3.1, 3.9) and any ranking depend only on the total player count, never on how many seats are NPCs. (M5a) In the main mode an NPC walks as its card's character like every seat; an NPC cover role wears the look it was shown and never Impersonates (3.17); an NPC holding a night power uses it as 3.2 says, at the moment "Meetings, the role card and night powers" below gives.
- **Hidden seats.** Nothing a client receives marks a seat as an NPC: `isNpc` lives in room memory only, and NPCs take human-style names from a name pool, are never the party leader, and carry an id of the same shape as a session id; the party publishes only how many seats are NPCs, never which (M3c). (M5a) **Everything an NPC shows is something a human can do the same way in the same place.** It walks at walking speed and never runs or sneaks. It never turns on the spot: it faces where it last stepped, and it ends every approach to a station with a step toward the station. It starts a hold only with the verb a human uses (`act.hold`), so it plays the `interact` animation only while a hold the server accepted from it runs, and it works with that animation only at stations where a human could start the same hold (`routines.json` `holds`; round 10, D1: the gather classes and the counters, Chores below). Its ready and vote ticks are spread over the spans a human uses (below). (Round 8, 8T) An NPC never writes in the named chat; it writes meeting notes (3.8), which carry no speaker, so a
  table cannot tell its notes from a human's: each NPC seat, whatever its card, means to write 1 to 3 notes a meeting
  (`talk.npc.notesPerMeeting`), at ticks drawn over 0.05-0.8 (`talk.npc.windowFrac`) of the discussion plus the vote
  time from its own `talk:<seatId>` stream, and a note the limits refuse waits for the next tick. Its lines come from
  the templates of 3.25 and name seats only by name.
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
  - **Stations.** A station is a prop whose kind, or whose class in the logic table (3.14, round 10 D1), `routines.json` lists under an activity; a prop's class wins over its kind: **work** (the task benches and sources, the pump, the flour bin, the oven, the basins, the goat, the fence, the shutters) by day; **gather** (the lumber, stump, timber-set, boulder, rock-pile and ore-pile classes) by day; **trade** (the shop counters) by day; **social** (the notice board, the dartboard, the bell, the lamps, the furniture and decorations) by day and by night; **rest** (the lantern posts) by night. Grace, day and immunity are the **day** class of phases; dusk, night and the Final Night hunt the **night** class (`routines.json` `phaseClasses`). Props of any other kind or class (the kit chest, the teaching clue, keys, gas pockets, locked doors, the frozen round-4 bakery props) are never stations.
  - **Choosing.** Whenever an activity ends, the NPC draws the next one from its phase class's weights:

    | Class | work | stroll | idle |
    |---|---|---|---|
    | Day (`npc.routine.weights.day`) | 0.5 | 0.3 | 0.2 |
    | Night (`npc.routine.weights.night`) | 0.2 | 0.3 | 0.5 |

  - **Work.** The NPC walks to a station and, where `holds` names a hold for it, works it for up to 12-30 s (`npc.routine.stationDwellS`); a station with no hold is a **stop** of an idle's length (`npc.routine.idleS`), which counts as its stand between actions. A station qualifies when its activity is open in the phase class, its prop and scene are present and open at the party's size, its scene belongs to the map and is reachable, at night its scene is lit, it is not the station the NPC just left, no other NPC is at it or heading for it, no other seat is running a hold on its prop, and the NPC can work it now (Chores). Until the NPC's **scene dwell** has run (30-90 s, `npc.routine.sceneDwellS`, drawn at every scene entry and at every placement on the square) only stations of its own scene qualify; once it has run, only stations of scenes one open door away do, so the NPC moves on one scene at a time and never passes through a scene without its dwell (a Killer NPC's hunt, below, is the exception). It takes a favourite when one qualifies, else a qualifying station at random; when no station of another scene qualifies it falls back to its own scene's, and when none qualifies at all it strolls instead. It stands at the centre of a floor tile orthogonally next to the station, inside the verb reach (1.5 tiles, 3.7), and takes one last step toward the station, so it faces it. If another seat already stands on that tile when it arrives, it idles where it is and picks again. Where `routines.json` `holds` names a hold for that class or kind of prop, it works in cycles: it starts that hold with the human verb and, when the hold ends, pauses 1-3 s (`npc.routine.workPauseS`) before the next; a refused hold ends the visit on the next tick (round 10, D1; before it, the NPC stood out the dwell).
  - **Chores (round 10, D1; living-world.md 1.8).** An NPC seat is never idle: its routine is a chain of real actions a watcher reads as a player's, and it idles only between actions.
    - **Gather.** At a logic-table prop it holds `act.hold {action: 'interact'}` through the same resolver as a human (3.14). The station qualifies only while some mode runs with the tools the seat holds and the prop is not spent, so it meets the same walls as a human: no axe, no chopping, and bare hands break only rubble. The drops land in its own pack.
    - **Trade.** At a shop counter it opens the shop with `act.hold {action: 'shop'}` and sells, with `act.sell`, everything it holds that the shop buys, then pauses 1-3 s (`workPauseS`) and moves on. A counter qualifies only while the seat holds something its shop buys, so an NPC sells only what it gathered, crafted or bought, and an empty pack never walks to a counter.
    - **Nothing waits on it.** When another seat, human or NPC, runs a hold on the prop it is working, the seat finishes its own hold, starts no other, and steps off after a 1-3 s pause (`workPauseS`, never on the same tick); no NPC picks a prop another seat is holding.
    - **Between actions.** A stand (an idle, a stop, a leg pause) is never followed by another: the next choice after one is an action, the idle band of the draw read as work or stroll by their weights (no extra draw), and a walk that cannot start after a stand turns into a second of the M3c wander (Fallback) rather than an idle. An idle that runs out is followed on the same tick.
  - **Stroll.** The NPC walks to a random floor tile of its own scene 3-10 tiles away along a path (`npc.routine.strollTiles`).
  - **Idle.** The NPC stands still 2-6 s (`npc.routine.idleS`; 2-8 s before round 10, D1), facing where it last walked.
  - **Legs and pauses.** A walk inside one scene that ends at a portal, and a stroll, is a **leg**; after a leg the NPC idles 2-6 s with chance 0.6 (`npc.routine.idleChanceAfterLeg`); the last walk to a station ends in work, not in an idle. An NPC that has walked 12 s (`npc.routine.maxWalkS`) without standing still for 2 s (`idleS` minimum) stops and idles 2-6 s, then goes on with what it was doing. A goal it has no path to, whose crossing is refused, or on which it moves less than a quarter tile in 2 s (`npc.routine.stuckS`) is dropped: it idles (or, just after a stand, wanders a second) and picks again, never the same station.
  - **Clues.** The first time an NPC sees a clue it has not collected (inside its vision radius, 3.7), it decides with chance 0.5 (`npc.react.collectChance`) to collect it; at its next choice, if it is still in the clue's scene and the clue is still there, it walks to the clue and holds Collect exactly as a human does (2 s, 3.4), and the entry goes to a Notebook nothing reads. It never tries during immunity, when no verb works.
  - **Fallback.** In a scene with neither a qualifying station nor a stroll tile, the NPC walks as in M3c: a new heading every 1-3 s (`npc.wander.stepMinS` to `npc.wander.stepMaxS`), aimed at the nearest portal with chance 0.25 (`npc.wander.portalSteerChance`), a portal in reach taken with chance 0.4 (`npc.wander.portalChance`), until it reaches a scene with somewhere to go.
  - **Targets.** An NPC walks for about a third of a day. The server tests hold every NPC to walking at most 60% and at least 10% of a day, to a still stretch of at least 2 s in every 20 s of day, and to no portal crossing before its scene dwell has run (outside the exceptions below).
- **Night (M5a).** A scene is **lit at night** when it is not dark (no `dark: true`, its `biome` neither `forest` nor `cave`) and it is an interior, or it holds a light that shines at night: a scene `lights` entry with no `phases` or with `night` among them, or a prop of a `routines.json` `lightKinds` kind (the lantern posts of a square). Whenever an NPC stands in a scene that is not lit during the night class (so at once when dusk or the Final Night hunt begins), it waits 0-15 s (`npc.night.leaveDelayS`, a fresh draw each time), its routine going on inside that scene (it takes no station and crosses no portal meanwhile, so it strolls and idles), then walks to its home with its usual leg pauses (Legs and pauses) and whatever its scene dwell, or to the nearest lit scene when its home is out of reach. Through the night class it keeps to lit scenes: its stations are the ones open at night in lit scenes, it strolls only inside its scene, and it crosses a portal only toward a lit scene. A Killer NPC picks, whenever its routine chooses next and one qualifies, a station in a lit scene where exactly one living seat stands and that seat is a human who is not its Cabal mate, so it hunts the way the strike rule below kills; the hunt overrides the work, stroll and idle draw and ignores the scene dwell, may cross several scenes, and counts as a reaction.
- **Reactions (M5a).** A reaction interrupts the routine and ignores the scene dwell and the walking pause. **A body**: the first time an NPC sees a body it did not make (inside its vision radius), it freezes 0.5-1.5 s (`npc.react.startleS`), then walks to the body and reports it `reportDelayS` after it first stands in report reach (the difficulty row). A Killer NPC reacts to a body it did not make exactly as any NPC does: it freezes, walks to it and reports it `reportDelayS` after it stands in reach. It never startles at its own. **A placement**: put on the square at grace or at immunity, an NPC stands 3-8 s (`npc.react.afterPlacementIdleS`) before its routine resumes, with a fresh scene dwell. **The Knife and the flee** follow the brain's rules below.
- **Meetings, the role card and night powers (M5a).** An NPC casts its vote at a tick drawn uniformly over 0.3-0.9 (`npc.vote.windowFrac`) of the meeting's discussion time (as set when the meeting opens, a wrong-ejection bonus included) plus the vote time (`phases.voteS`, 25 s), counted from the start of the discussion: 26-77 s in with a 60 s discussion, 30-90 s with 75 s, 35-104 s with 90 s, 44-131 s with the trial's 120 s. On the role card an NPC readies 2-9 s (`npc.ready.delayS`) after the card opens; in the lobby it readies as the Seats bullet says. An NPC holding a night power (3.2) uses it at a tick drawn uniformly over 0.1-0.8 (`npc.nightPower.windowFrac`) of the time from the start of dusk to the end of the night (11-88 s with the 10 s dusk and 100 s night), or of the Final Night hunt (4.5-36 s of 45 s); an NPC Gamekeeper fires its Last Shot 2-8 s into its aim (`npc.nightPower.lastShotS`), or holds its fire when it has nobody to vote for. Each NPC seat draws only from its own streams, `npcPlay:<seatId>` and `npcTiming:<seatId>` (`sim/seeds.ts`), never from the deal's or another seat's: the ready, vote and night-power ticks and the Last Shot delay from `npcTiming`, every other choice (persona, activity, station, stroll tile, durations, the leave delay, clue, strike roll, night-power pick, vote target) from `npcPlay`. A draw that only some cards use is made by every NPC at the same moment and ignored when its card does not use it (the strike roll on every check, below; the vote's draws; the night-power tick and pick; the Last Shot delay), so no card changes how far a seat's streams move.
- **Rules of the scripted brain.** (M5a) A Killer NPC is any NPC that holds `kill`: a Killer, or an Accomplice after Inherit (3.2). Every NPC walk follows a tile path, so a wall between never pins the seat (M3c). An NPC reports the nearest body it is within reporting reach of, `reportDelayS` after it first stands there (M3c); (M5a) a Killer NPC never reports a body it made and reports any other as every NPC does (Reactions). A Killer NPC strikes only in a phase the Knife works in (`abilities.json` `kill.phases`: dusk, night and the Final Night hunt, 3.3) with the Knife ready, and only when exactly one other living seat shares its scene and that seat is a human, not its Cabal partner; the chance `killChancePer10s` is spread evenly over those ten seconds. **The kill-opportunity timer** (owner, 2026-10-23, A100): a Killer NPC that has been alone in a room with exactly one other living seat, human or NPC, for longer than 30 s (`npc.aloneKill.afterS`) strikes that seat as soon as the Knife works and is ready, whatever the roll said. A room is any scene but the map's hub; in a room wider than the view (the woods, the caves) the seat counts only within 20 tiles (`npc.aloneKill.sightTiles`) and in sight (3.7). The wait counts in every world phase, so a pair left alone by day is struck at dusk; a change of company, a crossing, a placement or a meeting restarts it, and a Cabal mate never counts. It draws nothing. (M5a) The strike roll is drawn by every NPC on each check, a tick of such a phase on which exactly one other living seat shares its scene and that seat is a human not crossing a door, and is ignored unless the NPC holds `kill`, its Knife is ready and that seat is not its Cabal partner. After a kill a Killer NPC leaves the room at once and walks to the nearest scene with a basin and then to the map's hub (the map manifest's `hub`, the overworld square in HollowMere), there being no wash verb yet (M3c). Until the Case Board ships (M4) "the player with the most Verified clues" is the seat the NPC had most often in sight when it came across a body; an NPC with no such memory votes Skip, and a Killer NPC first votes at its drawn tick with the plurality of the votes already cast and re-reads it every second (M3c). (M5a) When Skip is disabled (the forced vote of 3.8 and the Final Night vote), an NPC with no suspect, and a Killer NPC with no plurality to follow, votes for a random living seat other than itself. (M5a) An NPC whose Notebook holds a Cabal confession (Hear Confession, 3.2) votes for that seat and aims its Last Shot at it, ahead of every rule above (the confession heard first, while that seat lives).
- **Scope.** NPCs ship in M3c (ROADMAP 7.1) after the first playable, inside the room as entities rather than clients. (M5a) The routines replace the M3c wander, which stays only as the fallback above. NPC seats keep a Notebook only for the clues they collect and do no tasks until M4d; when a human station hold ships, its row in `routines.json` `holds` turns NPC work at those stations into the same hold, with no change to the brain.

- **The hive and the body bands (round 8, A173; 8R and 8S write the detail with their code).** Every NPC seat and figure reads one public blackboard of what anyone there could perceive (3.25). An NPC that sees a body walks to it within `npc.body.pullTiles` (10), and shouts within `npc.body.shoutTiles` (5). Inside `npc.body.bellTiles` (2), the first NPC stays and reports after `reportDelayS`; every other NPC runs for the bell (see **The body bands** below). NPC seats do their tasks, use their card's abilities, and share what they find on the Case Board and in meeting notes; on hard an NPC shares with a player only after that player gives it a briarberry. This replaces "NPCs never chat" above once 8T lands.
  - **The blackboard (8R, A176).** Each room keeps one board of the public world, rebuilt every tick. It holds bodies, creatures, clues and figures by the look they draw, the phase and the lobby difficulty, and the noises, shouts and bell heard in the last 10 s (`npc.hive.memoryS`). It never holds a card, a cover, a private view, a vendetta or which seats are NPCs; each NPC reads it only through its own senses, and the auto invariant `hiveNoSecrets` checks every entry.
  - **Triggers.** Potential, state and proximity triggers propose a reaction for each NPC seat; the highest that proposes anything wins. A reaction is due 0.3-2.5 s (`npc.hive.staggerS`) after it is first proposed, a fixed spread per seat and reaction rather than a draw, so a town that hears one scream never moves in step. A due reaction runs as a reaction (Reactions above).
  - **The body bands (8R, A174, A176).** After the strike and the creature flee, an NPC seat reacts to the nearest unreported, unhidden body of its scene that it did not make, if it sees the body now (3.7, through the lights) or saw it before, and the body lies within `npc.body.pullTiles`. It first stands still for its noticing stagger (`npc.hive.staggerS`), then walks to the body. The first NPC to come within `npc.body.shoutTiles` **shouts**, once per body. The shout is role-blind: a noise of `noise.shout` (8 tiles) and a heard fact of where it rang. The server then calls the nearest living Detective and the nearest living Doctor (same scene by distance first, then anywhere), each through its own private input: `shout {sceneId, x, y}` on a human's own client, shown as a HUD cue that names the place, or the private call of an NPC seat, which walks there. No public state says who was called. Inside `npc.body.bellTiles`, the first NPC stays and reports after `reportDelayS`. In immunity, when no verb works, it waits by the body and reports once a verb does. Every other NPC that comes inside the band of the same body runs for the hub's bell and rings it, at night too (3.8), while its card still has a pull. A kill scream or a shot an NPC hears (3.7) draws it to where it rang, so a body it could only hear is still found.

### 3.13 Maps and presentation

**Decision (owner, 2026-10-17, A49; round-5 contract A50):** the leader picks the map in the lobby; every map has at least one forest and one cave; the world is presented isometrically. The projection belongs to the client alone: the server, the rules and the data stay on the square grid.

**Choosing a map (M5a).** The lobby's settings panel has a map row: each map whose `modes` lists the main mode shows its name, a one-line blurb and a thumbnail. The leader picks; everyone else sees the pick. The default is HollowMere. The pick is `Settings.map`: the server takes a known map id from the leader in the lobby, refuses any other id like a bad setting, and keeps the pick through the return to the lobby, like the NPC difficulty (3.12). At Start the seats are placed on the chosen map's hub, and no door leads off the map, so a match only ever uses the chosen map's scenes. The party size still picks the profile (Small 4-6, Medium 7-8, Large 9-10; WORLD 4.3), and a door to a scene above the profile stays boarded and refuses with `CLOSED`.

**What a map is.** A map (`packages/content/data/maps/<id>.json`) is a closed graph of scenes. Every scene belongs to exactly one map, and every portal leads inside its own map. The map names:

- a **hub**: an exterior open at every party size, holding the Emergency Bell (`bell`) and the kit chest (`kitChest`);
- 10 **start spawns** on the hub, over which the first placement spreads the seats in seat order (M3);
- 10 **meeting spawns**, over which everyone is spread when a meeting ends;
- the grace-phase **teaching clue** (`teachingClue`, 2 step 5).

A rule that says "the square" or "the overworld" means the map's hub and these spawns.

**The maps (M5a).**

| Map | Setting | Small (4-6) | Medium adds | Large adds |
|---|---|---|---|---|
| **HollowMere** | Railroad town on a drowned mere, Coldwater Territory, December 1893 (WORLD 4.1) | the village; the tavern and its back room; the apothecary and its loft; the widow's parlour and bedroom; Crumb's Ovens and its four station rooms (cold, mixing, oven and proofing; round 7, A116); Gallows Wood (forest); the Tin Gallery mouth (cave) | **the Fenwood** (forest) and **the Flooded Gallery** (cave); Vane Manor (hall, upstairs); Hale Barn | St Brannock's; the Undercroft |
| **BlackPine** | The Harrow Syndicate's timber and coal camp over Vane's old tin workings, up the valley, the same night (WORLD 4.10) | the camp; the bunkhouse; the sawmill; BlackPine Woods (forest); the Workings (cave) | the Company Office; the Forge | the Deep Level (cave) |

HollowMere's new forest and cave close a loop from the Medium profile up: the village, Gallows Wood, the Fenwood, the Flooded Gallery, the Tin Gallery mouth and back to Gallows Wood. A one-way sinkhole also drops from the Fenwood into the Gallery. Below Medium their doors stay boarded, so a small party keeps the old, tighter HollowMere with one forest and one cave. BlackPine is the tighter and wilder map. Its loop runs from the camp through the woods, in at the Workings' vent drift and back out of the adit. A one-way log chute drops from the woods to the camp. The Large profile adds a second way under the hill: the woods' drowned adit to the Deep Level, and the Deep Level's ladder up to the Workings.

**Biomes.** Every scene has a biome: `village` (a settlement exterior), `house` (rooms), `forest` or `cave`. The biome picks the scene's default ground and walls, its ambient sound bed and its look. It changes no rule except the darkness of caves (below). **Every map has at least one forest and one cave open at the Small profile**, so every party size has both. In M5a they are where hiding is easiest and the night is darkest:

- Forests are trails 2-3 tiles wide through dense trees, opening into clearings, with loops and chokepoints.
- Caves are corridors 2-3 tiles wide between chambers and flooded galleries. Shallow water is walked through at the normal speed in M5a; deep water is solid.

Forest and cave scenes already carry the places where M5b puts resource nodes, creature spawners and quest givers (`nodes`, `spawners`, `givers` in the scene files). No code reads them in M5a, and none of them depends on a role.

**Isometric presentation (M5a).** Both modes show the world in a 2:1 dimetric isometric view, seen from the south-east (SPRITES 10, WORLD 4.2):

- A tile is a 128 x 64 px diamond. World north points to the upper right of the screen, and straight up is world north-west.
- Characters, props, buildings and ground are pre-rendered from that one camera. Each player picks an **art style** at the click of a button, in the lobby or the in-match menu, without leaving the match: **8-bit** (the default, a pixel-art finish), **Low poly** (the same renders without the finish, smooth-filtered) or **HD** (the same renders at twice the display scale with soft shadows: a smooth textured finish on figures and props, lit materials under a sky on buildings and the kit, A164). HD is offered only where the device can hold it: a screen at least 900 px tall, at least 4 GB of device memory where the browser reports it, and WebGL textures of 4096 px (`style.json` `artStyles` `requires`); elsewhere it shows disabled with the reason, and a stored HD pick falls back to 8-bit. HD's files are fetched only when a player picks it. The pick is the player's own, kept in the browser and never sent to the server, so two players at one table may see different styles (`style.json` `artStyles`, A79). Only the picture changes: an HD frame covers the same screen pixels as its 8-bit frame.
- Only the picture changes. The server, every rule, distance and radius in this document, the collision box and every id stay on the square 64 px grid.

**Interiors are cutaways.** The north and west walls stand at full height, the south and east walls are drawn as low sills, and inner walls are drawn at half height, so a room can always be read.

**Occlusion outside.** A tall thing (a building, a wall, a tree, a cliff) hides what stands north or west of it. It turns translucent (35%, `metrics.json` `lighting.occluderFadeAlpha`) while it is in front of your own character. It never turns translucent for anyone else. Standing behind the barn therefore hides you from other players' eyes, though not from the wire (3.7).

Doors into buildings sit on a south or east face, so they are always in sight. M5a moves `ov.tavern_front` and `ov.apoth` to the south faces of their houses; their ids do not change.

**Controls.**

- The keys W, A, S and D (or the arrows) walk straight up, left, down and right on the screen. Two keys together walk along the grid.
- A touch stick walks where the thumb points.
- The speed in tiles is unchanged (3.7).

**Lighting by phase and scene (M5a).** The world is drawn under a darkness layer that follows the phase (`metrics.json` `lighting.ambient`):

| Phase | Darkness |
|---|---|
| Grace, day, immunity | `slate` at 20% (softened by the owner, A121) |
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

**Transitions.** The client covers the screen while the router starts a scene: a fade into the world (`balance.ui.transitionS.fade`, 0.4 s), an iris into a meeting (`iris`, 0.6 s) and a wipe into the end screen (`wipe`, 0.7 s), each the whole cover-and-lift. Since round 8 (8H, A143) the cover into the world follows the portal the seat came through, at the same `fade` duration: a door wipes, a ladder, stair, hatch, shaft, drop or crawl irises (with rungs passing up or down when the portal changes height), an arrival at a map's Train station fades through the station, and the first spawn, a cave mouth, a forest gate or the return from a meeting fades. Under reduced motion every duration is 0 and the scene starts at once. A transition that begins while another runs replaces it. Nothing here touches the sim or the wire.

**Loading.** A load that runs longer than `balance.ui.loading.showAfterS` (0.3 s) shows a progress bar and a tip, which changes every `tipEveryS` (4 s); a shorter load shows nothing. Tips describe the controls and the world and never a role's powers. A match's load also starts the map's `loading` music (3.18).

### 3.14 Resources and crafting

Round 6 (ROADMAP M5b). The rows are `resources.json`, `recipes.json` and the `material` rows of `items.json`; the
numbers below are theirs and `balance.resources`'s. Sentences marked (6F) are the server's behaviour and may be
corrected by Session 6F when it lands.

**Resources.** Six resources grow at the **nodes** of the forests, caves and the BlackPine camp (`nodes` in the scene
files): Timber, Stone, Pine Resin, Herbs, Mushrooms and Tin Ore. Every map has all six at every party size: HollowMere's
Small profile finds them in Gallows Wood and the Tin Gallery mouth, BlackPine's in the woods, the camp and the
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
| Axe | 2 Timber, 1 Stone | a basin | 4 s |
| Pickaxe | 1 Timber, 2 Tin Ore | a basin | 4 s |
| Hammer | 1 Timber, 1 Tin Ore | a basin | 3 s |

Basins stand in the apothecary, Crumb's Ovens, the bunkhouse and the forge; ovens in Crumb's Ovens and the bunkhouse,
so both maps craft every tool at the Small profile. The Torch is a carried light like the Lantern (radius 4, 3.5) and
ships in V1. The Lockpicks and the Snare can be crafted, carried, traded and dropped; their verbs (Pick a lock, Set a
snare) are the V1.5 abilities of 3.5 and stay off until they ship.

**The logic table** (round 10, A9; `interactions.json`, `docs/round9/logic-table.md`). Every placed prop has one census
decision: `live` (the sim reads its kind today), `interact` (a tool, a station or a bare-hands verb works on it),
`container` (it holds loot) or `keep` (decoration on purpose); `dressing` and `decor` props are decided by stem, the rest
by kind, and the content check refuses a scene that places a prop with no decision. A **class** names what a prop is
(a kind, a stem, a resource node or a locked portal), and no prop belongs to two classes, so a hold on it has one answer.
An **interaction** is a verb on a class, with its modes best first: the tool a mode needs (a capability tag and tier,
or bare hands), a hold or a mini-game, its drops or loot, the wear and the noise, and a failure line per refusal
reason. A tool is an item with capability tags (`cut`, `break`, `dig`, `pick`, `pry`, `skin`), each with a tier, and
optionally a number of uses.

**Interacting** (round 10, A10) is a hold (E) on a prop, beside the older verbs. The server finds the prop's class and
its interaction (the one the held item named, else the first the seat can run), then the first mode whose tool the seat
holds; a seat with none is refused `NEED_TOOL`, naming the plainest tool that would do. A prop already changed is
refused `NOTHING_THERE` until it comes back; an interaction not built yet answers `NFY`. Moving, a phase change, a lost
tool or a full pack cancel the hold with nothing done. At its end the drops land (their amounts drawn from the `loot`
stream), the tool loses `wear` uses and breaks when its uses run out, the prop takes its new state (public to the
scene, never who changed it) until its respawn, and the mode's noise sounds. An NPC seat's hold runs through the same
rules.

**Tool walls** (round 10, A11). The piles of the world open only to their tool; bare hands get nothing, and the
refusal `NEED_TOOL` names the tool. Tools carry tags and uses: the Axe (`cut` 1, 20 uses), the Pickaxe (`break` 1 and
`dig` 1, 20), the Hammer (`pry` 1, 40), the Crowbar (`pry` 1, 20), the Spade (`dig` 1, 20) and the Lockpicks (`pick` 1);
none is role-bound, and the content check refuses a wall that no neutral tool can run, or whose tool no seat can come by
(a recipe's product or a loot-table item; logic-table 10.1).

| Prop (stems) | Tool | Hold | Drops | Wear | Comes back |
|---|---|---|---|---|---|
| Woodpile, firewood, log, fallen log, log basket | Axe | 4 s | 2 to 3 Logs | 1 | 300 s |
| Stump | Axe | 3 s | 1 Log, Resin half the time | 1 | 900 s |
| Mine timber set | Axe 5 s, 2 Logs; or Crowbar 6 s, 1 Log | | | 1 | 600 s |
| Boulder | Pickaxe | 6 s | 2 to 3 Stone, Tin Ore a quarter of the time | 2 | 1200 s |
| Rock pile | Pickaxe | 4 s | 2 Stone | 1 | 600 s |
| Rubble | Pickaxe as the rock pile, or bare hands | 12 s | 1 Stone | 0 | 600 s |
| Ore pile | Pickaxe | 4 s | 2 Tin Ore | 1 | 600 s |
| Nailed crate | Crowbar or Hammer | 3 s | 1 Timber, 60% | 1 | stays open |

**Logs** are the raw wood of a pile; they stack as a material and become Timber only at a saw (round 10, D3): the mill's
head saw (BlackPine, `bp_mill`) turns one Log into 2 Timber in 4 s, a saw horse (the mill and the lumber camp) one into 1
Timber in 8 s, bare-handed, by day, with no tool wear and no noise yet. A seat with no Log is refused `NEED_ITEM`. The Timber nodes
still give Timber directly (they are the camp's cut stacks). A worn tool breaks when its uses run out (one is taken); the wear is server memory per seat and tool.
**The bakery's parts and the Herb Bread** (round 10, D4a; owner answer LT1). Dishes are made in parts at the stations of Crumb's Ovens, on Hollowmere only (a recipe's optional `maps` lists where its stations stand). Flour (bought at the bakery's counter) is mixed into Dough at the dough mixer (2 Flour, 4 s), proofed at the proofing cabinet (8 s), and Herbs are chopped into Herb filling at the cold shelves (2 Herbs, 3 s). The brick oven then bakes a Wake Loaf from Proofed dough (5 s) or Herb Bread from Proofed dough and Herb filling (6 s). Anyone may make any step; no step marks the Baker. Eating the Herb Bread (the `eatHerbBread` ability, a `consumes` verb like `eat`) cures what any food cures and gives the private **Resistant** effect (`effects.json`, `dish`, no status bit): a Poisoned that starts while it lasts runs half as long (`poisonFactor`). It lasts 780 s, about to the next dawn; eating another dish replaces a running dish buff, so one runs at a time. Nightshade's poison (3.2) is a different mechanism and ignores it. The proofing time is a short hold, not a tenth of a day, and the water is not modelled: there is no filled bucket. The rest of the dishes wait for their fillings (D4b).

**Nodes keep bare hands** (owner answer LT1): a Timber node holds 3 s by hand and 1.5 s with an Axe in the inventory, a
Stone node the same with a Pickaxe; Tin Ore still needs the Spade. A tool speeds supply up, it does not gate it.
Chopping sounds (round 10, x2): an Axe on a woodpile, a stump or a mine timber set rings `chop` (8 tiles) when the hold ends,
a Pickaxe on a boulder, a rock pile or an ore pile `smash` (10); the Crowbar's pry sounds at 10 (`crowbar`) and bare hands on
rubble and the saws stay silent (3.7).
The general stores sell the Axe, the Pickaxe and the Hammer (3.23 Shops; prices in `economy.json`, proposals for the balance lab), and a seat can also craft one (the table above). **Depletion (round 10, D2; owner answer LT7).** Every pile above comes back after its own time, and an NPC seat's gather empties a pile like a human's, through the same resolver: it breaks rubble by hand, the cleared pile stays no station until its time has run, and a seat that finds one spent walks on. No seat is dealt a free tool, since a seat working a tool-walled pile before any human could own the tool would tell an NPC; an NPC comes by a tool as any seat does (a card's start kit, or buying it at the general store; a later step, D2b).

### 3.15 Mobs

Round 6 (ROADMAP M5b). The rows are `mobs.json` and the scenes' `spawners`; sentences marked (6G) are the server's
behaviour and may be corrected by Session 6G.

**Creatures.** Each spawner raises one creature of its kind, awake in the spawner's `phases` (default: always),
which never strays further from it than its `leashTiles` and walks its `pathId` loop when it has one. A scene has
at most 3 spawners (`mobs.maxPerScene`). Creatures are not seats: they carry no handle, no role and no look, and
they are drawn from the scene state for everyone in the scene.

| Creature | Where | Speed | Senses | Flees light within | Attack | Bite (3.22) | Health | Kills |
|---|---|---|---|---|---|---|---|---|
| Wolf | the forests' wolf loops, dusk and night | 3.6 tiles/s | 6 tiles | 4 tiles | after 1 s in reach | 12, Bleeding 35% | 36 | yes, cause `wolf` |
| Boar | the Fenwood, BlackPine Woods, day and dusk | 3.2 tiles/s | 4 tiles | 2 tiles | after 1.5 s in reach | 9, Bleeding 20% | 48 | yes, cause `creature` |
| Bat | the caves | 4 tiles/s | 5 tiles | 3 tiles | after 2 s in reach | 3 | 10 | yes, cause `creature` |
| Rat | the caves past the Tin Gallery mouth | 2.5 tiles/s | 3 tiles | 2 tiles | after 2 s in reach | 2, Poisoned 30% | 8 | yes, cause `creature` |

**Behaviour.** A creature idles or roams its loop; it chases a living seat it senses and can see (3.7) for at most
6 s (`mobs.chaseS`), then returns to its spawner and starts no new chase for as long; it flees any lit flame within
its flee radius, carried or standing (a lit carried light, or a burning lantern, torch, lamp or fire of the scene;
moss, moonlight, daylight shafts and windows are not flames), and walks home once out of its reach. (6G) It walks
tile paths whose every tile lies inside its leash, so it never strays further; a loop point beyond the leash is
pulled in to its edge, and at each point it pauses as a wandering NPC does (`npc.wander.stepMinS` to `stepMaxS`). A
seat in transit or a ghost is never sensed, and nothing it senses depends on a card. (6G; round 8, 8A) Its attack
lands its row's bite (`mobs.json` `dmg`, each effect by its chance) each time the seat has stayed in reach (1.5
tiles, 3.7) and in sight for its attack time (round 10, A6: bites are about half what they were, so a whole wolf chase of `mobs.chaseS` leaves about 28% health, and a second chase before healing still kills; the attack times are unchanged); a bite is a row of the damage table of 3.22, so the health it takes
regenerates and its Bleeding or Poisoned is cured like any other hit's. A bite that takes a seat to zero health is a
death, cause `wolf` for a wolf and `creature` for the boar, the bat and the rat (the owner's answer, DECISIONS A134:
creatures kill): the body is left where it fell and the kill scream rings (3.7), with no clue of a killer, so the
Killer's "blame the wolves" cover of WORLD 4.6 has a real alibi. A creature's own health (`mobs.json` `hp`, the
table's Health column) is what a seat's fists must take to kill it (3.22, A142). (6G) Wolves keep 3.6's flee radius (`balance.wolves.fleeLightTiles`, which their row
equals) and stay in the woods by their leash; the mended fence and the bolt do not touch them yet. An NPC seat a
creature chases runs for the nearest open door of its scene and takes it, or straight away from the creature when
there is none (3.12; live once the NPC brain's call lands, DECISIONS A89). Creatures use the `mobs` random stream,
keyed per spawner, and never a secret stream.

**How a creature is drawn (round 8, 8G).** Fists, bolts and lights take a creature's health off (3.22; the damage
is 8A's table) and a creature at zero health dies, where it lies for `body.creatureCorpseS` 10 s before its row goes;
its spawner stands empty until its next waking part of the day (3.22).
Everyone in the scene sees the same creature: its bite as a sequence (it crouches, lunges and bites, then
recoils), a flinch with a white flash when a hit lands, a `flee` gait while it runs from a light, and a fall onto
its side when it dies, where it lies until the server removes it and then fades. Under reduced motion the flash
and the fade are cut and the clips still play. None of this carries a card or a seat.

**Dark scenes on the server.** With creatures, a dark scene's visibility moves to the server (3.13): a living seat
in a dark scene receives another avatar only within the night radius and a clear line of sight over the scene's
grid (walls, and the `u` ground that is walkable but blocks sight), or when that avatar stands in the pool of a
scene light burning now; a lit carried light (Lantern, Torch, Candle) adds 2 tiles (`vision.lanternTiles`) to both
seeing and being seen, so two lit seats see each other 4 tiles further. Every light starts out: its holder lights
it or puts it out (`act.light`), and a lit light shows on its avatar as the lantern bit, never by card. At night and
in the Final Night every scene is dark on the server in the same way (round 8, 8L, A190), so a lantern post's pool
on the square shows who stands in it and nothing else; by day, at dusk and at dawn an ordinary scene is sent whole
and its darkness stays the client's picture (3.13). Ghosts see everything. (6G; 3.7's lantern line
is 6G's.)

**Habitats (round 8, A173; 8Q writes the detail with its code).** Each spawner becomes a habitat: an area (about 5 by 5 tiles) that spawns `count` creatures on free reachable floor and migrates inside its own cell of the scene, so no two habitats' paths meet. Creatures walk, run, lie, sit and graze inside it and move with it. A seat entering a hostile habitat (wolf, bat) is chased for `mobs.chaseS` (10 s); every habitat it trips inside that window joins the chase, the timer restarting at the last one. A passive creature (boar, rat) that is hit flees `mobs.fleeTiles` beyond its area, stops, and drifts back over `mobs.returnS` (10 s) with a pause to graze. A boss habitat's area is its whole room. The broken-fence intruder wolf (3.6) and the Final Night's village wolves (3.8) are built on habitats.

### 3.16 Quests and mini-games

Round 6 (ROADMAP M5b). The rows are `quests.json`, `minigames.json` and the scenes' `givers`; sentences marked (6H)
are the server's behaviour and may be corrected by Session 6H.

**Givers.** A quest giver is a figure standing at a scene spot, never a seat: it wears the `villager` body or one of
its family's variants (`looks.json` `villagers`; round 9, N1), never a card's look (so it can never be mistaken for
a seat's character), faces its spot's direction and carries a quest marker. Each map has
a giver on its hub and others in its wild places:

| Giver | Where | Quest | Wants | Reward |
|---|---|---|---|---|
| Harbourmaster Pell | HollowMere village, by the marsh dock | Caulk the skiff | 2 Pine Resin, 1 Timber | Lantern |
| Mother Moll | the Fenwood, her charcoal hut (Medium) | Moll's herbs | 4 Herbs | Bandage |
| | | Moll's mushrooms | 3 Mushrooms | Salts |
| Foreman Hask | the BlackPine yard | Stack the yard | 4 Timber | Crowbar |
| Ada Kerrow | the forge (Medium) | The smith's ore | 3 Tin Ore | Lantern |
| The Collier | BlackPine Woods, at the kilns | The collier's stone | 3 Stone | Torch |

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

**Chains** (round 10, D9; `living-world.md` 1.3). A quest row may name an `after`: another quest of the same giver
that the seat must have turned in before the giver offers it (the server refuses with `NOTHING_THERE`; the quest log
shows it only then). A chain has two steps. Mother Moll's second step, Brew with Moll (2 Herb and 2 Mushroom, two
Bandages and 6 Scrip), follows her mushrooms; Ada Kerrow's, Temper (2 Tin Ore and a Timber, a Hammer and 6 Scrip),
follows her ore. Recipe teaching, the one-per-match branch and tin mail wait for round 11: there is no
recipe-learning system yet, so each chain is a plain second errand. Nothing new on the wire.

**Mini-games.** Every fetch task of 3.5 plays a mini-game at its target in place of the plain 2 s hold: the hold
opens it, the server keeps the solution, and the task completes only when the client's answer checks. The five
kinds are crates, pour, slide and stoke, first made for the quick mode (3.11), and the tap (round 7, 7M, A151): a
marker sweeps a track back and forth once per `minigames.tap.periodS`, and the player taps while it crosses the band
(`bandFrac` of the track, at a place drawn for each hit), `steps` times in a row; a tap outside the band starts the
run again from the first band. (6H)

| Task | Mini-game | Difficulty (1-5) |
|---|---|---|
| Light the lanterns | pour | 2 |
| Fix the well pump | slide | 3 |
| Deliver a letter | tap | 1 |
| Mend the fence | crates | 2 |
| Fetch the flour | crates | 1 |
| Mix the dough | pour | 2 |
| Stoke the oven | stoke | 2 |
| Stock the cold room | crates | 1 |
| Proof the loaves | slide | 2 |

After 20 s (`minigames.json` `assistS`) the Done control appears. A wrong answer completes nothing and may be tried again.
A Cabal seat's fake task plays the same mini-game, writes the same alibi entry and never moves the task bar (3.5).
The co-op task keeps its two-player hold. (6H) The hold opens the mini-game at once, with no timer, at a target prop of
the task within reach, in the task's own time of day (Light the lanterns only at night), and only for a task on the
seat's own list that is not done; a real task also needs its deliverable in the inventory, which completion takes, and
a fake task needs none. The server draws the puzzle from a stream of its own keyed by seat, sends the client its
statement (the board it draws: the bands, the lit order) and keeps it; the answer is a record of what the player did
(crates placed and the needle's stop, how long each pour was held, the slots filled in order, the stoke's taps, the
tap's every tap, hit or miss), which
the server replays against the puzzle, so a bare "done" completes nothing. The Done control sends an assist answer the
server accepts only once the puzzle has been open for `assistS`. Each two difficulty levels above 1 add one step (one
second of hold for the stoke) to the base numbers of `balance.json` `minigames`. Completion marks the task done, writes the
alibi entry (the scene and the tick, into the seat's own ledger) and, for a real task, raises the bar to the finished
real tasks over all real tasks; a ghost's finished tasks count in full up to `tasks.ghostShareCap` of the bar. Leaving
the node, or a phase where verbs do not work, drops the open puzzle. Each two difficulty levels above 1 add one hit to
the tap as they add a step to the others.

### 3.17 Characters and disguise

**Decision (owner, 2026-10-17, A49):** every seat walks the main-mode world as its card's character, so roles are public by sight, except the cover roles, which always wear another card's look; the Killer can also borrow a living seat's face for a few seconds. In the quick mode (3.11) role art is private (your own card and night scene) and public only at game over.

**Looks.** Every card of a deck is a character, a row of `looks.json`: a portrait (the role card, the meeting roster, the reveals, the end screen) and, for a non-cover card, a world character drawn in the 8 directions under `char/<lookId>/<anim>/<dir>` at the seat's height scale with its scarf tinted. The three cover cards (Killer, Accomplice, Drifter) have portraits only and no world character: nobody ever walks as a Killer. Look ids are public and name the character (`vicar`, `baker`), and every client loads the characters and portraits of the match's whole deck before the role card closes, so what a client loads never depends on its own card.

**Figure looks (round 10, B1).** Besides the cards' looks and the villager family, `looks.json` `figures` holds
the looks of figures that are not seats and not townsfolk: the `constable` (3.31) alone. A figure look has no card
and no portrait, and a cover can never take one. Its atlas keys are `char/constable/<anim>/<dir>`; until its art
lands the client draws its fallback villager body in its place; the wire always says `constable`.

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

**Cutscene openings (6J).** `cutscenes.json` maps each map to an opening cutscene. At the start of grace the server broadcasts `cutscene { id }` to every seat and lengthens grace by that opening's own length (its `maxS`); it adds no phase and never waits for a client, so the NPCs walk and the clock runs while the camera pans. **Round 7 (7A, DECISIONS A101):** each opening runs exactly as long as its map's intro track (the `opening` music class), measured and rounded down to the second: HollowMere 117 s, BlackPine 80 s. `phases.openingS` (120 s) is the cap no opening may pass, and the content checks that an opening's steps fill its whole length; a client test checks that length against the track. Both openings are cinematic (round 7, 7A): shots cut between the hub and the map's rooms and caves, each a slow push, pull or track on the scene as its map draws it (with nobody in the staged rooms), with the narrator's captions spread over the whole length and the role chip slamming in on the last beat. HollowMere visits the station road, the square, the tavern, the manor and its hall, the chapel, the well, the cellar and the cave gallery; BlackPine the yard, the intake office, the mill, the smithy, the lodge, the mine and the deep workings. They stay in-engine (DECISIONS A81), never video. A seat can skip an opening with Esc or the Skip button and sees the world under the remaining grace.

**Video steps (round 7, 7A, DECISIONS A101).** A cutscene may play one of the game's videos (a row of `assets/video/manifest.json`): full frame, under the cutscene's captions and its Skip, with the video's own sound at the player's music volume (muted if the browser refuses sound without a tap). The cutscene ends when the video ends, or at its `maxS` if that comes first. A video that cannot play (no row, no file, a decode error) is dropped and the rest of the cutscene plays over the world. The memorials use it (DECISIONS A113); captions meant to sit over the picture start with it (`withPrevious`).

**Death cutscenes (6J).** A seat that dies by the knife, poison, the Gamekeeper's shot, a vote, a wolf or, since round 8 (8A, 3.22), another creature's bite (`creature`; Bleeding and Poisoned no longer kill, round 10, A6) is told so in its private `killed`, which names the cutscene of that cause (`cutsceneId`); a vanishing has none. The client plays it before the ghost handoff: a sound, one whispered line, and the last frame held for four seconds at most, skippable like the opening. The id is the victim's own news, so it reveals nothing the `cause` beside it does not. A seat voted out hears it while the meeting has the World asleep, so its cutscene plays when the World is rebuilt after the meeting.

**Music (6L).** Each map plays one playlist per class, chosen by the phase and mapped in `music.json`: `loading` from the map's load to the opening (no map lists one since round 7: the lobby piece plays on through the load, so a load that finishes after the opening has started can never cut its piece off), `opening` with the opening cutscene, `lobby` between matches, `day` (dawn included), `dusk`, `night`, `meeting` (the discussion, the vote, the reveal and the immunity beat), `finalNight` and `gameOver`. A phase that stays in its class changes nothing, so a track is never restarted. **The opening piece (round 7, 7A, DECISIONS A101)** is the map's intro track of speech and music: it starts when the opening's `cutscene` message arrives, plays once and whole, never loops, and is silent at its end; the class the phase wants by then (the `day`, even while grace still runs) cross-fades in only when the piece ends or the seat skips the opening. A seat that skips also skips the rest of the piece. Port-au-Levain's piece waits for its map (round 8). Playlists cross-fade; their tracks, gains and fade seconds are in `audio/music/manifest.json`. Music is fetched only after Start (the lobby warms the first track of the picked map's day theme, never more) and has its own budget (ASSETS 6.8), separate from effects. Every player has a music slider, an effects slider and a mute (UI 14.22), kept on their own device and never sent; a class with no playlist, or a playlist with no track, is silence. No role, cover or secret is a class: the server sends nothing, and the pick depends only on public phases.

### 3.19 Admin auto-mode

Round 6 (ROADMAP M5d). An owner-only room runs a match in which every seat is an NPC, watched from a god view on several scene viewports, with the invariants of `docs/round6/auto-admin.md` 5 checked as it runs. Nothing about it changes a normal match: a `party` room never leaves 1x, an NPC Killer takes an NPC as prey by the strike roll only in an auto match (the kill-opportunity timer of 3.12 takes any seat in every match), and the room exists only when the owner's GitHub login is configured on the server (ARCHITECTURE 5.11). The contract is `docs/round6/auto-admin.md`.

**Sim speed.** Every timer of the game counts ticks, so a speed is the number of ticks the server runs per tick of wall time: 1x, 2x, 5x or 10x, with pause and single steps while paused. Phase lengths are sim seconds: at 10x a 15-minute match plays in about 90 wall seconds, and cooldowns, phase timers, the NPC walk and every countdown keep their meaning. When the server cannot run the asked number of ticks inside its per-tick budget it runs fewer, at least one, and owes the rest to later ticks: the speed reached drops, and no tick is ever skipped. Only the auto room's controls change the speed; nothing a player can send does.

**The all-NPC match.** The owner chooses the map, the seat count (every seat an NPC, up to `players.max`), the NPC difficulty and optionally the seed words. Start needs no leader and no human; the match deals, plays and ends exactly as a normal one, and below `players.min` seats the usual NPC fill applies. Each NPC brain plays as in 3.12, with one difference: an NPC Killer may take another NPC as prey, so the brains play each other. Reset returns the room to the lobby with the same seats under the same ids, the same options and the speed paused.

**Replay.** An auto match fixes the seed words of every random stream and the seat ids before Start, so the same words and ids replay the same match tick for tick. The headless runner (`pnpm auto`) plays such matches with no network and no client and prints one line per match (winner, ticks, rounds, invariant failures); a failure is printed with the seed words of every stream and the seat ids, which the admin page can set to watch it again. The runner's `--seed` decides every match's words, so a run with the same flags plays the same matches.

**The Studio.** Round 9. Beside the auto room, behind the same sign-in, the owner has a Studio (`#/studio`): a creative mode that walks one scene at a time with one admin figure (noclip, teleport, time of day, pause, steps and the speeds above, stand-in mobs and townsfolk that run their own brains, any item in hand), a room editor that walks an unsaved edit in the Studio and saves a scene as a draft pull request, and reports (a screenshot and a note) filed as issues. It is tooling: it is never a `party` room, deals no cards, runs no match and changes no rule or number of this document. The contract is `docs/round9/admin-studio.md`.

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
apart and may draw the same row. The vendetta stays with its seat: it ends
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
- **Heist: the Bandit against the strongbox (7H).** The strongbox (the hall's safe, `mh.safe`) stands in the
  manor hall, empty, in every HollowMere match the hall is open at; the first Train delivery of the match loads it
  (`vendetta.heist.loaded`, in every such match, Bandit or not). The Bandit's goal is to crack it: **8 s**
  (`vendettas.heist.crackS`) still within verb reach of it, after dark (night or final night), with no other
  living seat in the hall. Cracking it
  (`vendetta.heist.cracked`, the consequence) puts the Strongbox item in the Bandit's inventory (it needs a free
  slot), leaves a footprint of the Bandit's own height at the box as a kill does (3.4), and readies the Knife at
  once. The strongbox is in one inventory at most.
- **Contract: the Hitman (7H).** At the first Train arrival of the match the mail brings the Hitman a sealed
  letter (`vendetta.contract.offered`): a target drawn from the mail stream (`contract`) among the living seats
  other than the Hitman and its Cabal mates, written to the Hitman's own Notebook. The Hitman accepts it as a
  quest of kind `contract` (3.16; the quest `contract` of its own quest list, with no giver and no `quests.json`
  row) from anywhere (`vendetta.contract.accepted`), with the Accept button on that Notebook entry while the
  offer is open; an NPC Hitman accepts at once. The button reads the public roster, so after a private death of
  the target it stays until the next meeting (A30) and the server refuses the press (`cannot`).
  While the contract is accepted and the target lives, a Knife kill of anyone else rests the Knife **30 s**
  longer (`vendettas.contract.offTargetRestS`). A strike that kills the target completes the quest
  (`vendetta.contract.done`, the consequence) and readies the Knife at once; a target who dies any other way
  ends the contract unpaid (`vendetta.contract.lapsed`).

**NPC Killers (7H).** An NPC Killer holds a vendetta like any Killer and walks toward its goal as one more place
under its routine (3.12): the Vicar's scene, a task target's scene, the loaded strongbox's hall or its target's
scene, through `vendettaGoalFor`. It does nothing a human could not do in the same place.

**Invariants (7H).** Four checks join the registry of 3.19 and run wherever it runs (`pnpm auto`, the soak, the
admin room): `vendettaOnce` (every step is for the seat holding that vendetta, and each holder's consequence fires
at most once), `contractQuest` (a `contract` quest sits only on the Hitman), `strongboxOnce` (one Strongbox in all
inventories at most) and `vendettaPublic` (no `vendetta.*` event carries a seat, nor a seat id in its data).

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
reveal and for **10 minutes** (`tasks.martyrS`, the owner's limit), each real task the martyr's ghost finishes
counts **10** times on the task bar (`tasks.martyrWeight`), outside the ghost cap (3.5); the tasks it finished
before that reveal or after the ten minutes count as any ghost's. The boost ends with the match and never carries
into the room's next one. A full bar in play wins
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


### 3.22 Bodies: health, stamina and effects

Round 8 (DECISIONS A134, A135, A136; the contract is `docs/round8/body.md`). Every seat has a body: health, stamina
and the effects on it, in room memory and sent only to the seat itself (`Private.body`, schema version 6). No other
client and no public field ever carries a number of it: the drawn figure shows only the physical signs of the
effects table (its `statusBits`) and the one-shot clips of a hit, a knockdown and a getting up. A ghost has no body.
NPC seats have bodies like anyone; ambient townsfolk (3.24) hold a reduced one, health and effects without stamina.
The numbers are `balance.json` `body` and `effects.json`.

**Health.** `body.maxHp` 100. Out of combat (no hit for `body.regenAfterS`, 8 s) it regenerates `body.regenHpPerS`
2 per second, never while Bleeding or Poisoned. Under `body.woundedBelow` 30 the seat is Wounded (3.6).

**Stamina.** `body.maxStamina` 100. Running costs `body.runCostPerS` 12 per second; walking and standing regain
`body.staminaRegenPerS` 6 per second (half that while Famished). At zero the seat is **Fatigued**: it walks when it
asks to run and strikes slower, until stamina is back over `body.fatigueRecover` 25. A strike costs
`body.strikeStamina` 15.

**The damage table.** Every attack but the Knife is a row with its damage, the chance of each effect and what zero
health from it means. The Knife, Nightshade's poison, the Last Shot and the vote kill as before (3.2, 3.8), whatever
the health (A89). A Weakened striker's fist lands half its damage.

| Source | Damage | Effects it may apply | At zero health |
|---|---|---|---|
| Fists (`strike`, every card) | 8 | Dazed 10%, Weakened 20% | knocked out |
| Mugging blow (3.24) | 8 | as fists | knocked out |
| Slingshot (`slingshot`, the Child) | 4 | Stunned | knocked out |
| Wolf bite | 12 | Bleeding 35% | death, cause `wolf` |
| Boar bite | 9 | Bleeding 20% | death, cause `creature` |
| Bat bite | 3 | none | death, cause `creature` |
| Rat bite | 2 | Poisoned 30% | death, cause `creature` |
| Bleeding | 1.5 per second | none | stops at 1 health (Wounded) |
| Poisoned | 0.5 per second | Weakened, 2% per second | stops at 1 health (Wounded) |

**Effects stop at 1 health** (round 10, A6). Bleeding and Poisoned drain health but never to zero: they leave the seat Wounded (under `body.woundedBelow`) until cured, and cure on the normal items. Only the Knife, Nightshade, the Last Shot, the vote and a creature's bite end a life, so the causes `bled` and `sickened` and their two death cutscenes retire. A death by
`creature` is like `wolf` (3.15), with its death cutscene (3.18), one whispered line as the others. The
dead seat's body row empties with the ghost handoff. Bodies tick only in the
world phases: a meeting, the role card and game over freeze health, stamina and every effect clock. Effect chances
roll on the body's own stream, never a secret one.

**On the line** (round 10, C1; `docs/round9/world-mode.md` 6, `phases.md` 6). A seat that dies by day to a bite or a shot, on a map with a Train (3.3), leaves the world until the next morning's arrival. Its purse drops where it fell as coins, a find for whoever reaches the body, and its hotbar, pack and belt are lost with the body (3.30's `strip`; until the town chest holds lost property, they lie nowhere); bound kit (`onDeath: kept`), the three equipment slots and the bank stay. Its role card, cover, vendetta, notebook and quests are kept. BlackPine has no Train (3.3), so its daylight deaths stay final; whether it gets a station is an open question for the owner. It gets no ghost view: its `killed` message names no role, its view holds no scene and no figure, the ghost channel neither reaches it nor takes its lines, and it moves and acts on nothing; only its own `Private.onLine` says it waits. A dying Gamekeeper on the line fires no Last Shot, a Killer on the line passes no Knife (3.2), and the win check counts a seat on the line as living, since it comes back. At the arrival the Undertaker's cart takes its body, and the seat stands on the platform with `respawn.hp` (50) health, full stamina and no effects; its cooldowns resume where they stood, and its public `alive` is true again. Once a meeting shows it dead, its look's town work stops until it returns (3.23, "What breaks when I'm gone").

**Fists** (`strike`): every card, in every world phase, a 2 s cooldown and 1.2 tiles of reach (`abilities.json`), at
the stamina cost above. It hurts seats, ambient townsfolk and creatures; a creature at zero health (`mobs.json` `hp`,
3.15) dies where it stands and lies there for `body.creatureCorpseS` 10 s (A142), then its row goes and its spawner
stands empty until the creature's next waking part of the day; a corpse is no target. The swing is public to everyone
who can see it (3.7) and leaves no clue unless blood is drawn. A strike names its target as the Kill does (an avatar
handle, 3.17) or by a creature's id; a knocked-out seat is refused, never struck again. On the client the key is X (a
Strike disc on touch): it swings at the nearest other figure in reach, else the nearest living creature (UI.md
14.32). A Fatigued striker's cooldown is 1.5x. The Child's **slingshot** (`slingshot`) is a small hit from 5 tiles with the Slingshot in the kit, every 30 s,
and Stuns.

**The knockout.** At zero health from fists, a mugging or the slingshot the seat is knocked out for `body.koS` 20 s:
it lies where it fell (`down`), cannot move, act or hold, takes no second knockout, and drops the hold it had; the
knockout drops `body.koPurseShare` (half) of its purse where it lies (3.23, with 8C). It wakes at `body.koWakeHp` 20
health, Dazed; a meeting's gather wakes it at once. A knockout is never a death: no body on the floor, no meeting, no
clue but the dropped coins. A killing bite still kills a downed seat. Keep Watch and the Remedy refuse a knocked-out
seat as a target (body.md 5); the Knife, Nightshade and the Last Shot do not.

**Effects.** Each is a row of `effects.json`. A timed effect's fresh application restarts its clock and adds a stack;
an effect without a duration lasts until cured or until its condition ends. The sign is what everyone sees on the
figure (its `StatusBit`, seams.md 2); an effect without one shows only to Inspect (8B).

| Effect | Does | Lasts | From | Cured by | Sign |
|---|---|---|---|---|---|
| Slowed | 0.7x speed | 12 s | a snare, deep mud (to come) | time, Salts | limp |
| Wounded | 0.8x speed, a drip trail | while health is under 30 | low health | healing over the threshold | limp |
| Bleeding | 1.5 health per second, no regeneration | until cured | wolf and boar bites | Bandage, Medkit | bleeding, a drip trail |
| Weakened | fists land half their damage | 60 s | heavy hits, Poisoned | food | none |
| Poisoned | 0.5 health per second, no regeneration, Weakened 2% per second | 90 s | rat bites, bad food (to come) | Remedy, Salts | poisoned, a green cast |
| Fatigued | no running, strike cooldown 1.5x | until stamina is over 25 | stamina at zero | rest, a Wake Loaf | fatigued, a stagger |
| Stunned | no move, no act | 1.5 s | the slingshot | time | stunned |
| Dazed | 0.85x speed | 8 s | waking from a knockout, a heavy fist | time | dazed, a stagger and stars |
| Famished | stamina regenerates at half rate | until fed | `body.famishedAfterS` 480 s without food | any food | none |
| Knocked out | see above | `body.koS` | fists, a mugging, the slingshot | time, a meeting | down |
| Indebted | an economy status (3.23, 8D) | until paid | unpaid rent | paying | none |
| Charmed | one silent charge: the first killing Knife strike spends it and leaves the seat Wounded at 1 health | until spent | the well (7M, stations.md 4) | being spent | none |

Rows that another system writes onto the body's effect list (Indebted, 3.23) are left as the body's clock finds
them: it never decays, clears or resets them, on a wake, a knockout or a death. The Charmed row is set by the
well (`grantCharm`, one at a time) and spent by the Knife after the Watch, the Remedy and the Bandage: a strike that
any of those voids leaves the charm held, and a strike that would kill instead leaves the seat Wounded at 1 health
and tells the striker "nothing happens", as a voided strike does. The striker still bloodies and the Knife still
rests; there is no hit, clip, scream, clue or death, and the figure shows only Wounded's limp, as any wound does.

The curing items: the Medkit's `heal` restores `body.healHp` 40 and stops Bleeding (self or a seat in reach); the
Doctor's Bandage also stops Bleeding; Salts cure Slowed and Poisoned; the Herbalist's Remedy cures Poisoned as
`antidote`, by day as by night, whoever holds it; the Wake Loaf (`wakeLoaf`, a food bought at the bakery and baked at
Crumb's Ovens) cures Famished and Weakened and restores stamina. The Medkit, Salts and the Remedy work on the actor
when no target is named; an item is never spent on a seat it would not change. The pockets offer a Use button for the
items any holder may use (the Medkit, the Remedy, a food), on yourself or on the seat beside you; a role's own item
verbs (the Bandage, the Salts, the slingshot) are keys of its card (UI.md 14.32).

- **Inspect.** Anyone can inspect a seat or a figure in reach and learns only its physical signs; 8B writes the
  paragraph (`docs/round8/body.md` 7).

**Inspect** (8B, A137). In any world phase, a living seat can study another living seat it can see within
`relations.json` `inspect.rangeTiles`, once per `inspect.cooldownS`. The inspector learns, privately:
- the look the figure is drawn as;
- its physical signs: those its status bits draw (knocked out, stunned, dazed, bloody, bleeding, limping, pale,
  weary) and, to a close look only, weak (Weakened), hungry (Famished) and hunted (Indebted);
- its health as a band (unhurt, bruised, badly hurt; the floors are `inspect.health`), never the number;
- its purse as a band (light, fair, heavy; `inspect.purse`), or unknown while the purse or its bands do not exist;
- whether it carries a burning light.

It never learns a card, a cover, a vendetta, an inventory, a notebook or a role's private state; a cover-wearer
and a true wearer of a look read alike. The inspected seat is told privately which look studied it.

**Relations.** `relations.json` `rows` say which looks are suspicious. A row names an inspector and an inspected
side (a card, a vendetta, a faction, a drawn look, a townsfolk figure, or `mark`, the target of the inspector's open
contract), may hold to one map, and carries a `suspicion` and an optional `note`. When rows hold for a look, every
living NPC seat that saw it (in the scene, within the vision radius and in sight), and the inspected seat if it is
an NPC, counts the inspector's drawn face the sum of their `suspicion` more; the first row with a note sends the
inspected seat a card-blind hunch. Nothing a third client receives depends on a match. An `inert` row names a role
or figure of a later round and never holds.

**Armour** (round 10, D6a; owner answer LW8). An item with an `armor` block (`items.json`; kind `armour`) worn in the body or head slot (3.30) is armour. Its `tier` picks a factor from `balance.json` `armor.tierMult` (body 0.80, 0.65, 0.50; head 0.90, 0.80); the factors of the worn items multiply, and for a creature's bite so does the Lodge's `creatureDmg` perk (3.23), and the damage never falls below `armor.cap` (0.5) of what the row would have dealt. It applies to every attack that goes through the damage table (the fists, a mugging, the slingshot, a guard's blow, a creature); only a creature's bite is also cut by the Lodge perk; the Knife never reads it (A89), nor do Nightshade and the Last Shot, so armour never makes a seat unkillable by the Killer. The Leather jerkin (tier 2) also halves how fast a Bleeding drains health (a Bleeding has no timer, so "stops sooner" is a slower drain) and costs stamina regeneration (x0.9); an item may also carry `speedMult`. Armour is private: nothing on the wire shows it, there is no inspect line and the figure is not drawn with it; it is not role-bound and drops on death. The Quilted coat is sold at the general stores; the jerkin waits for hide (skinning, D6b). Not built yet: Warmth at night, a Miner's cap with a lamp, louder footsteps, tin mail and tin helm.

**Skinning** (round 10, D6b; owner answer LW13). A Skinning knife (`skinningKnife`: tool tag `skin`, 20 uses, not role-bound, sold at the gamekeeper's stalls and the general stores) skins a fallen creature: `act.ability {abilityId: 'skin'}` takes the hide and game of the creature's `mobs.json` `skin` row (wolf hide 2, game 1; boar hide 2, game 2; bat and rat none) off the nearest corpse in reach (1.5 tiles) that has not been skinned, once, within the `body.creatureCorpseS` the corpse lies, and wears the knife one use. The Killer's Knife and the Replica Knife have no part in it, so every seat can hold hide. Three Hide stitch a Leather jerkin anywhere (no station; 6 s). Nothing is announced: no noise, no clue, nothing new on the wire. Game has no use yet (the stew and the pie, D4b). The `toolshed` and `forager` loot of the logic table has no loot tables to join, so the shops are the knife's only source.

### 3.23 The economy

Round 8 (A134, A135; `docs/round8/economy.md`): the Bible's Book IV on today's maps and roles.
- **Scrip**: a private purse and bank balance; stakes, wages, sales, shops, the bank, and coins on the ground.
- **Rent and quota**, and the Indebted status.
- **Faith**: Indulgences and Parish Seals.
- **Rumours**: ledger slips, Blackmail Notices, the black market and the Gazette.
- **HQ tiers** for the role stations, bought by look.

Sessions 8C (Scrip) and 8D (the rest) write this section. The numbers are `economy.json` and `balance.json`
`economy`.

**Scrip** (8C, A138). Every seat carries a purse and keeps a bank balance, and only the seat sees either number.
- **The stake.** At Start each seat draws its stake on a stream of its own. It is paid the moment the looks are
  public (before grace), from the range of the tier its **public look** names in `economy.json` `stakes`, never from
  its card, so a seat wearing a cover carries the purse of the look it wears. A seat with no look takes the default
  tier.
- **The band.** Others never see the number. Inspect shows "a light purse" below `economy.heavyPurse` and "a heavy
  purse" from it. Every stake tier lies wholly on one side of that line, so at Start the band says the look's tier
  and nothing more.
- **Wages.** The town pays `economy.taskWage` for each finished task, a fake task exactly as a real one, so a purse
  never tells a worker from a pretender. A quest turn-in pays the quest's `scrip` (`quests.json`) beside its items.
- **Shops.** A shop is a counter or stall in a scene (`economy.json` `shops`). Holding the action key at it opens
  its panel, privately: what it sells at its `ask` and what it buys at its `pay` (`economy.json` `prices`). A living
  seat in a world phase other than the immunity window buys and sells while the counter stays within
  `doors.reachTiles`. A purchase is refused, and nothing changes, when the purse or the inventory falls short. The
  bakery sells flour and the Wake Loaf, the apothecary bandages and salts, the general store (HollowMere's tavern bar, BlackPine's
  lodge) rope, lantern oil, candles, planks and the three tools (the Axe, the Pickaxe and the Hammer, round 10 D2), and the Gamekeeper's stall (HollowMere's forest edge, BlackPine's
  lodge) snares and torches. The market (HollowMere's square, BlackPine's camp) sells nothing and buys timber, stone,
  resin, herbs, mushrooms and tin ore. No shop trades a role's kit, and an item a shop both sells and buys pays
  less than it asks.
- **The bank.** HollowMere's manor hall and BlackPine's intake office each have a bank counter. Holding the action
  key at it opens the seat's account, and the seat then deposits from its purse or withdraws to it, the whole amount
  or nothing, while the counter stays within reach. Banked Scrip is safe from a mugging and a knockout. Only the
  heist reaches it: when the Bandit cracks the strongbox, the box carries off `economy.heistShare` of every seat's
  bank balance (rounded down per seat) as its loot, and the cracker pockets it. A suddenly heavy purse is the
  heist's tell, though wages and sales can make anyone rich.
- **Coins on the ground.** A knockout or a mugging drops part of the purse where the seat lies (a knockout
  `body.koPurseShare` of it, rounded down; nothing if that is under one Scrip), as a heap of coins
  anyone alive can pick up with the gather hold (`economy.coinPickupS`, within reach). The first to finish takes the
  whole heap, and it never comes back.
- **Conservation.** Scrip enters the town only as a stake, a wage, a sale or a fenced notice. It leaves only as a
  purchase, rent, a fine, a donation or an HQ tier. Theft, drops, pickups and the bank only move it.

- **Rent and quota** (8D). Each day is one shift. On a map of `rent.maps` (HollowMere), `rent.amount` falls due from
  every living seat `rent.dueAtDayFrac` into the day; `act.payRent` at a bank counter, within verb reach, pays a seat's
  whole debt or nothing. The Company Clerk's round (an ambient figure of 8E's) collects it too once that figure walks.
  On a map of `quota.maps` (BlackPine), every living seat owes `quota.qty` of `quota.items`, any mix, hauled to a
  tally rack (`act.hold`, `clues.collectHoldS` within verb reach). At dusk a seat short of its quota is fined
  `quota.fine` from its purse, and what the purse cannot cover joins its debt. Debt carries over from day to day.
- **Indebted.** A seat that still owes at dusk becomes Indebted (`EffectId.indebted`, its own view only). No bit is
  drawn; inspect reads "a hunted look". From dusk to dawn the doors from outdoors into its map's `curfew` scenes refuse
  it as a locked door does, so it sleeps rough; a seat already inside still moves between the rooms and can leave. Paying its debt clears it. Forced labour waits for R9's law pipeline.
- **Rent in kind and the boarded house** (round 10, D7; owner answer EP3). `act.payRent` takes the purse first and,
  for what is left, goods at the market's `pay` price (`economy.json` `prices`), cheapest first, whole goods only (the Clerk keeps the
  change); it refuses
  (`NEED_SCRIP`) when purse and goods together fall short, and takes nothing. At dusk a seat that still owes has goods
  taken to the debt's value from its pack, the same way, and what it still owes after that is its Indebted debt as
  before; a seat Indebted has its house boarded up, so it cannot lie down in the home bed (`BOARDED_HOME`, 3.32). The
  chapel cot and the tavern bed are free of it. Holding a Crowbar or a Hammer, lying down on the boarded bed pries the
  boards for the night with a crowbar's noise (`noise.crowbar`); they go back at dawn and the debt stands. Paying the
  debt takes the boards off. Not built: a Notice for trespass on the own house if a witness sees, and picking the
  curfew doors (they stay doors).

- **Owing the line** (round 10, C2; `docs/round9/world-mode.md` 6, followup-4 2.5). Each return on the morning train
  (3.22) adds `respawn.fareDebt` (6 Scrip) to the seat's fare, owed to the Company, and every further death adds
  another. While a fare is owed, the town's wages and sales into the seat's purse pay `respawn.wageMult` (half) of
  their amount; the half Scrip a payment leaves is carried to the next (two 3-Scrip tasks pay 1, then 2), and the
  cut part is never paid out, so no coin is made or lost. `act.payRent` at a bank
  counter pays the rent first, then the whole fare when the purse covers it; a seat that owes only the fare pays it
  there too. Owing the line is not Indebted and brings no curfew of its own. The fare is private (`Private.fare`);
  nothing public carries it. A fare is meant to clear within `respawn.clearTargetDays` (2 days).
- **The dear stall** (C2b). A shop with an `owner` look (`economy.json`: the bakery is the Baker's, the apothecary the
  Herbalist's, the Gamekeeper's stalls his) asks `respawn.priceMult` (1.5x, rounded up) while any seat whose public look
  is that look owes the line, and charges what it shows. It reads the roster look, never the drawn figure or the card,
  so an impersonation never moves it and no cover is named; a shop with no character (the stores, the markets) is never
  dear.
- **The Clerk's labour errand** (C2b). Holding the action key at the Company Clerk's books (a `ledger` prop:
  HollowMere's `bk.ledger`) for `respawn.errandS` (30 s), standing still within reach, clears one fare. It is always
  open, whether or not the Clerk stands there, so a fare never locks a seat out. An NPC seat that owes the line works
  it too, as a trip of its day routine, and only while it owes. Tasks alone never clear a fare (an owing seat earns
  about 1.5 Scrip a task against 6 Scrip of rent a day), so the errand is what keeps the two-day target; the
  balance lab checks both (`packages/content/test/fareCheck.test.ts`). BlackPine has no Train, so it has no fare and
  no errand.
- **What breaks when I'm gone** (round 10, C3; `docs/round9/round10-plan.md` 5). Each card's `roles.json` `townWork`
  names the work its look does in town. The work follows the seat's public look, never its card or the drawn figure, so
  a death never names a cover and an impersonation never moves it. A look is **gone** when a seat wore it at the deal
  and no wearer is shown alive on the roster: a kill is private until the next meeting (3.8), so the stall and the
  altar keep working until the meeting shows the death, and a seat on the line (3.22) stays gone from then until the
  train brings it back. A look no
  seat wears keeps its work running, so an undealt card's stall stays full. A look is **thin** while a seat wearing it
  owes the line.
  - A **stall** (`work: 'stall'`: the shop whose `owner` the look is) sells each item from a day's stock of
    `townWork.stallStockPerSeat` (1) per seat and at least `townWork.stallStockMin` (4), `respawn.stockMult` (half,
    rounded down) of that while thin and none while gone, less what it sold since the day began; a new day refills it.
    `shop.open` shows each item's `left`, the same for every opener, and a purchase past it is refused (`SPENT`
    stock). A shop with no character never runs out.
  - **Faith** (`work: 'faith'`: the Vicar's `ch.altar_main`): the chapel altar takes no donation while the Vicar's
    look is gone (`COUNTER_CLOSED`, the altar); the wayside altars keep working.
  - A cover or Cabal card (`work: 'worn'`) does the work of the look it wears. Every other card is `work: 'none'`
    for now, with its `nfy` note of what it will do (the lantern posts, the surgery, the fish, the tin, the doors and
    the rest), for round 11.

- **Faith** (8D). Donating Scrip at an altar (`act.donate`, within verb reach, up to `faith.donateMax` at a time)
  earns `faith.perScrip` Faith per Scrip, up to `faith.max`; Faith is private (`Private.faith`). There is an altar in
  the chapel and a wayside altar on each map's hub. Faith plus Scrip buys, at an altar (`act.faith {kind}`):
  - an **Indulgence** (`faith.indulgence`). Burning a held notice that names your own look spends one. Presented in a
    meeting it is always spent and silently voids the one oldest notice naming your look, wherever it is held;
    nothing reports whether one was voided;
  - a **Parish Seal** (`faith.seal`, at most `faith.holdMax` held). Presented in a meeting, it posts a public line
    under your public name ("the charge is a matter for the Church"), clears every vote cast so far, and for
    `faith.sealShieldS` refuses any vote naming you. The shield ends with the meeting. The full heresy trial waits for
    R9's Tribunal.

- **Rumours** (8D). The server keeps a rumour ledger: every `notices.sampleS` it writes down each drawn look that
  stands in a scene with at least one other figure, so a line is only ever what an observer could have seen, and it
  names a look, never a seat or a card. Each Train delivery fills the mailbag beside the platform (HollowMere) with
  `notices.slipsPerBag` ledger slips from the sightings since the last bag, night first, one per look; an uncollected
  bag is replaced. Collecting it (`act.hold`, `clues.collectHoldS` within verb reach) turns the slips into Blackmail
  Notices, private Notebook entries, up to `notices.maxHeld` held at once. A notice can be:
  - shown at a meeting, where it becomes a public line;
  - burnt, except one that names the holder's own look (only an Indulgence clears your own name);
  - fenced at the black market (the tavern back room; BlackPine's lodge), within verb reach, for
    `notices.fencePrice` Scrip from the town.

  A notice neither shown nor cleansed `notices.gazetteAfterRounds` day cycles after it was made is printed by the
  Gazette at the next meeting's start and leaves its holder's Notebook. BlackPine has no Train this round, so no
  mailbag.

- **HQ tiers** (8D). Each role station of `hq.stations` has three tiers. A seat standing within verb reach of the
  station's `hq_` prop on its map, and walking in the station's **public look**, buys the next tier with `act.hq`: the
  tier's Scrip and materials, all or nothing. The right follows the look, not the card (A131), so a cover-wearer
  invests like the card it wears. A tier is public (`GameState.hq`, station id to tier) and names no buyer. Every
  bought tier of a station gives its perks to every seat walking in that look. The owner approved the tiers and
  perks as proposed (2026-10-24), so buying is open (`hqGate.open` in `sim/economy/hq.ts`; DECISIONS A139).

### 3.24 Moods, mugging and townsfolk

Round 8 (A134, A135; `docs/round8/townsfolk.md`).
- **Needs and moods.** NPC seats and the new ambient townsfolk have needs (Hunger, Fear, Anger, Want) and moods.
  These are server-only and show only as gait and idle.
- **Townsfolk.** They are not seats, are never the Knife's prey and die only to creatures.
- **Mugging.** A hungry, angry or desperate figure or NPC seat alone with a seat may mug it. A heavier purse raises
  the chance; company, the Watchman's look and a lit light lower it. The target pays or, once the fists land, runs
  or fights.

The numbers are `balance.json` `moods` and `townsfolk`.

**Needs and moods (8E, A140).** Every NPC seat carries four needs in server memory, each a level from 0 to 1:
Hunger, Fear, Anger and Want. They never reach a client, a match log line or a random stream. They move on what
happens to the seat, never on its card, so a Killer cowers at a body like anyone else (its own kills included).
A need ticks only on the ticks the seat's brain runs (not while it is busy at a station, or dead), so every rate
below is awake time.

| Need | Rises with | Falls with |
|---|---|---|
| Hunger | time (`moods.hunger.riseS`), `famishedMul` times faster while Famished (3.22) | a meal (the `eat` event, `mealRelief`), standing at home (`homeFallS`) |
| Fear | each body seen (`fear.body`), a creature's chase (`chase`, once per chase), being struck (`struck`), an ejection (`ejection`, every living NPC), the dark: a night phase outdoors in an unlit scene (3.12), alone and without a burning light (`darkRiseS`) | a day phase, a lit scene, home, or company (another living seat within `vision.dayTiles`), over `fallS` |
| Anger | being struck (`anger.struck`), robbed (`robbed`), rent or quota taken (`taxed`) | time (`fallS`); a meal (`mealRelief`); the ejection of the seat it suspects most (`ejectionRelief`) |
| Want | a purse under `want.lightPurse` Scrip (`lightRiseS`), Indebted (`debtRiseS`) | a wage (`wage`), a sale (`sale`) |

The **mood** is the strongest need at or over `moods.threshold`: Hungry, Scared, Angry, or Desperate for Want;
with `desperateNeeds` or more needs over the threshold it is Desperate; with none, Calm. A mood holds at least
`moodHoldS` before it changes, so a seat does not flicker. A mood shows in two ways only:

- **The routine draw.** The class's work, stroll and idle weights (3.12) are scaled by `moods.weights[mood]` and
  renormalised: a Hungry seat works more, a Scared one idles more, an Angry or Desperate one strolls more. The
  richer habits of `townsfolk.md` 1 (home earlier, the bakery, the quiet places, lingering near the one it is angry
  at) wait on routine hooks that do not exist yet (A140, open).
- **The idle.** While it stands still a Scared seat cowers, a Hungry or Desperate one fidgets, an Angry one stomps
  (the `cower`, `fidget` and `stomp` clips of 3.22); a Calm seat shows the plain idle. A client receives the clip id
  and nothing else, so a mood is a thing to notice, never a word.

Anger remembers who struck, robbed or taxed the seat until it cools to zero; the mugging (below) and relations
(3.22) read it. A new card (3.12: the brain forgets) starts every need at zero.

**Ambient townsfolk (8E, A160).** Each map holds `townsfolk.count[profile]` figures that are not seats: no card, no
vote, no task list, no part in any win. The map's named figure comes first (HollowMere's Company Clerk, BlackPine's
Tallyman: the `named` rows of `routines.json` `townsfolk`), then one stallholder per shop prop (`fixed`), then
villagers to fill. They are spawned at the deal, each with a `townsfolk:<figure>` stream of its own (never a seat's),
a home (a lit interior, the persona rule of 3.12) and a route: a named figure walks its row's prop kinds in order
(the Clerk the ledger, the notice board, the tavern window and the pump; the Tallyman the tally rack, the notice
board, the pump and a basin), a stallholder keeps its one counter, a villager draws `npc.routine.favouriteStations`
favourites among the seats' stations. By day a figure walks to its next station at `walkTilesPerS`, works it for
`stationDwellS` (the interact clip), then idles for `idleS` with chance `idleChance`; a walk longer than
`npc.routine.maxWalkS` is given up. In the night class it goes home and stands there. It crosses portals like a seat
and stands still for the door's transit on the far side, under a new handle. Outside the world phases it holds
still where it is; the lobby clears every figure.

On the wire a figure is a scene `Avatar` under an opaque handle like a seat's (3.17) with a `villager` look (never
a card's: 8F's variants all begin `villager`), the `townsfolk.height` height, no status bit and never the ghost
tag, so nothing but the drawn figure tells it apart; its id never leaves the server. A seat's view holds the living
figures of its own scene as it holds the seats there (3.17), through the same sight rule in the dark and at night
(3.7, 3.15), with no near tag (its Blood range of 3.4 is a seat's), and a ghost sees them as the living do (round 10, x5, A353). Needs and moods tick for it as
for a seat (the mood idle shows while it stands), it hears the same bus events, and it counts the bodies it sees.
The Knife never finds it (its handle resolves to no seat), a vote for it is refused, and it dies only to a creature
that kills (the wolf's `mobs.json` `dmg` off its reduced body's `body.maxHp`, regained like a seat's, 3.22; any
other creature leaves it at one). Its body lies where it fell
as a public `Body` that opens no meeting (it counts as reported from the start) until the next meeting clears every
such body and the meeting text says how many the creatures took (`ui/copy/townsfolk.ts`, UI 14.36). A fist's
knockout (3.22, the reduced body) reaches a figure only once the strike hook of A160 lands. The invariant
`figureNotSeat` (auto 50) checks that no figure is in any seat list, vote, death or meeting, and that no figure
avatar carries a seat's handle, the ghost tag or a card's look.

**Talk to a figure** (round 10, D9c; `living-world.md` 1.5, seams.md 3 row 16). A seat in reach (`figureTalk.reachTiles`)
of a figure (a townsperson, a named figure or a Constable) asks it about the town or the time (`talk.ask {targetId,
ask}`, G and H on the client). A seat's handle, human or NPC, an unknown handle and a figure in another scene refuse as
no target; a ghost refuses as not in play; too far refuses as too far; each asker may ask the same figure again after
`figureTalk.cooldownS`. The answer is one system chat line to the asker alone, `figureTalk.delayS` after the ask.
`town` is a tip off the rumour ledger (3.23) naming a drawn look and a scene, never a seat, a handle or a card; `time`
is a template remark; a Constable reads the latest briefing line (3.31) instead; with nothing to tell, a figure says so.
The line is drawn from the figure and the tick it is due, with no random number, so two askers of one figure in one
tick hear the same words. Nothing public marks a talk: no bubble, no turn of the figure, no event to another client.
The lines are `talk.json` `figures`.

**Guard figures (round 10, B1, A229; F4 2.2).** The Company Clerk and the two Constables of every map (3.31) are
guards: figures that "don't move very far and fight when hit" (the owner). A guard row of `routines.json`
`townsfolk` (`guard`, with `count` figures, the Constables 2) spawns after the counted townsfolk, so it never takes
a place of `townsfolk.count`. Its **post** is the first prop on the map of its row's kinds (the second Constable
starts from the row's second kind, so the two keep different posts); it walks only its row's props in the post's
scene within `guard.leashTiles`, and by night it stands at its post. It has the reduced body of a figure. A seat's
fist or slingshot (3.22) lands on a guard's body like a seat's: at zero health it is knocked out for `body.koS` and
stands down. A guard still standing turns on the seat that struck it and swings the fist's row at it on the strike's
cooldown while that seat stays in its scene, within its leash and on its feet, for `guard.angerS`; then it walks back
to its post. Its blows knock out, never kill. A guard reads only who struck it, never a card, and never mugs. The
Knife does not reach a guard yet (C5). A Constable wears the `constable` look (3.17); the Clerk keeps the villager's.
`figureNotSeat` accepts the `figures` looks of `looks.json` beside the villager family.

**The mugging (8E, A180).** A Hungry, Angry or Desperate figure or NPC seat that is alone with one seat rolls each
second for a mugging, on its own stream (`townsfolk:<figure>`, or the NPC's choices stream) and only while in such a
mood, so a calm match draws nothing new. "Alone" is the A100 room rule (3.12): any scene but the map's hub, the only
other living seat there, no other figure present, not crossing a door, within `npc.aloneKill.sightTiles`. A seat
wearing the Watchman's look (the badge everyone sees, never the card) or one with nothing in its purse is never
mugged. The chance per second is `moods.mug.chancePerS` by the target's purse band (3.23), times `1 + moodMul` by
the need behind the mugger's mood, times `nightMul` in the night class, `weakMul` for a Weakened or Fatigued target
(3.22) and `longAloneMul` after `longAloneS` alone beside a heavy purse; the mugger's own Fear (`fearMul`) and a
light burning in the target's hand (`lightMul`) lower it. A figure walks up to within
`reachTiles` (giving up after `approachS`); an NPC seat mugs only a seat already within reach until its walk-up
lands (A180, open). The mugger stands and threatens for `threatS` (the `threaten` clip on a figure; an NPC seat
holds its mood idle until 8A's one-shot slot lands), then the target has `answerS` to answer by the private prompt
(UI 14.36.1):
- **Pay**: `share` of the purse (rounded, at least one Scrip) moves to the mugger through 3.23's one function; a
  figure's takings sit in its `@figure:<id>` account. Banked Scrip is safe.
- **Silence**: the share is taken when the answer runs out (the strike, once the fists land).
- **A door**: a target that leaves the scene while its answer is due escapes, with nothing taken.
- **Flee** (a chase of `chaseS`, the share taken if the mugger reaches the target) and **Fight** (strikes on both
  sides, 3.22) are part two of A180, after 8A's fists; until then both answers are refused.

A mugged NPC seat pays. Every mugging ends with `mug.end` on the bus, a `scuffle` clue (3.4) where the target
stood showing the mugger's height, and a robbed seat angry at its mugger
(`anger.robbed`); each side waits `cooldownS` before another roll touches it, and a meeting drops a mugging under
way. Only the target hears of a mugging: the prompt is private and everything else is the drawn figure.

### 3.25 The living world

Round 8 addendum B (A173, A174; `docs/round8/living.md`). Sessions 8Q, 8R, 8S, 8T and 8U write this section with their code.
- **The world index.** Every scene knows its reachable floor, its occupied tiles and a density cap, so nothing spawns in a tree, a wall or off the map (8Q).
- **The hive.** NPCs share one public blackboard with potential, state and proximity triggers; it never holds a card, a cover or a private view (8R; the detail is 3.12 "The hive and the body bands").
- **Talk** (8T). NPC lines in meeting notes (3.8) come from templates, or from Claude when the server holds a key, off the tick and logged for replay; one to three a meeting are red herrings, slightly off.
  - **Input.** A line is built only from facts every seat at the table has: the round, the meeting's reason, the caller's and the body's names, the roll-call's missing names and the other living seats' names (`services/talk/facts.ts`). Never a card, a cover, a private view or which seats are NPCs.
  - **Templates.** `services/talk/templates.ts`: questions and remarks that name seats by name and never name a card, a role or a faction. A template whose name has nothing to fill (no body at a bell meeting) is not drawn; the bell question is drawn only at a bell meeting. Each line draws two uniforms from the seat's `talk` stream, whatever is drawn.
  - **Model.** With `ANTHROPIC_API_KEY` on the server, and never in an auto run, a replay or a test, a note's text comes from the Messages API (the model id is the server's `WDI_TALK_MODEL`, else the fast small model). The prompt is the input above, the writer's own name, what it found itself, and the last `talk.model.transcriptLines` lines of the meeting (named chat with its speaker, notes with none); never its card. The call runs off the tick: at the note's tick the template line is drawn first, always, and the call starts; a later tick posts the answer, or the template line once `talk.model.timeoutS` passes or for any answer but a plain finished one. Per match at most `talk.model.callsPerMatch` calls and `talk.model.tokensPerMatch` tokens; past either, templates only.
  - **Filter.** A model line keeps its first line without quotes, at most `talk.model.maxChars`; it is thrown away for the template if it says the writer is not a person, holds a slur, or names a card or a faction beside a seat's name or the writer's own "I", unless that seat claimed that card in public.
  - **Replay.** Every NPC note goes to the match log's `talk` rows (tick, seat, text, template or model); a replay posts each seat's n-th logged note and calls nothing.
  - **Misdirection.** Each meeting `talk.npc.herringsPerMeeting` living NPC seats, drawn once from the `talk:~herrings` stream whatever their cards, write a red herring as their first note: a line that gets one public fact slightly wrong (a seat at the table named as the body, the missing or the caller, the wrong reason, the round one off), so a careful reader can tell. Any other NPC note is small talk with chance `talk.npc.smallTalkChance`, satire about nothing ("Can I get a cup of coffee?"). Herrings and small talk are always templates, never the model; every note draws every kind from the seat's stream, so the stream moves alike whatever is posted.
- **Briarberry.** The Doctor's healing ingredient, picked from briar bushes that make the picker bleed (on hard down to half health, never to death); easy villagers gift it, normal shops sell it, hard only grows it (8U).

### 3.26 The reader: shelves, letters, ledgers and boards

Round 8 addendum C (A200; `docs/round8/stations.md` 5), 7M. The owner: "walking up to a book shelf should allow you to read through the lore of the game, with books and letters spread throughout multiple shelf locations".
- **What can be read.** `lore.json` keys each readable prop by its id: shelves, a writing desk, the letter box, the bakery's daybook, the office's payroll desk and both notice boards, on Hollowmere and Blackpine. Each holds volumes: a **book** (leafed page by page), a **letter** (one sheet, unfolded), a **ledger** (columns) or a **clipping** (pinned). A shelf of books shows `reader.spinesMin` to `reader.spinesMax` spines (owner, round 2), and no page is longer than `reader.pageMaxChars`, so the reader shows it whole at 1280x720 and on a phone.
- **The text.** Every page is quoted verbatim from the owner's vault work its volume names (`source`), as whole source lines; `pageLines` holds one `first-last` line range per page. The owner chose "fill later" for round 1 and 8W (round 8) filled the pages. A page is markdown as the data holds it, and the markup counts toward `pageMaxChars`; the reader renders bold, italic and blockquote, and shows any other markup as plain text. No page names the Beast or a killer or shows a role (`docs/round8/canon.md` 7). Ids are frozen; titles and pages are text.
- **Secrecy.** A volume is the same bytes for every seat and shows no card, cover or private view. The server keeps nothing of what a seat read.

### 3.27 The county jail

Round 10, B5 (`docs/round9/gdd-map.md` 2.1; `world-mode.md` 5.1; owner answers LW9, LW10, WM11). B5a builds the cell;
B5b puts the cuffed seat in it and releases it.

**The cell (B5a).** One scene, `cj_cell` ("The county jail", 12x8, a house interior), serves every map. It is a `jail`
scene: in no map's graph, with no portal in or out (WORLD 4.3), its ids prefixed `cj.`, its ten spawns `cell_1` to
`cell_10`, so the cell can hold every seat at once. The server alone places a seat in it, and its art takes the default
map's theme. Its view holds only the seats inside it. D8 adds the props of the jail mini-games.

**Held (B5b).** A seat the manhunt cuffs (3.31) walks for `jail.walkS` (_proposed_ 5 s), held, and is placed in the
cell. It stays there until the next morning train, the first arrival of a later round, which sets it down at the
station with the manifest line "{name} steps off the train."; the Final Night's bells empty the cell as they bring back
the line. Its own view shows `Private.jailUntilTick`, the train's tick (0 when not jailed); nothing public says who is
jailed. While jailed a seat is not active for sleeping (3.32) and cannot open or sign a petition, cuff, or use the
Knife (`IN_JAIL {untilDawn}`). A meeting leaves it in the cell; it votes and talks as usual. A death in jail takes the
usual death path. The manhunt stays cuffed until the seat leaves jail or dies; then the next warrant may run. On a map
with no station (BlackPine) the first dawn of a later round sets the seat down at the map's meeting spawns instead, with
no line, and `jailUntilTick` is that dawn's tick; the Final Night does the same there (6Z's default).

**The face it was cuffed in** (the owner, 2026-10-30: "jail and try them"; 6Z's ruling). An impersonation applied when
the seat is cuffed is pinned from the cuff until the seat leaves jail or dies: nothing drops it, neither the cell door,
being alone in the cell, its run out, a meeting, nor the Tribunal (B6). The cell, the Tribunal's defendant and the
manifest draw and name that face, exactly as if the accused had been cuffed; the sentence lands on the seat held. A
disguise still pending at the cuff is cancelled. The seat is set down at the station still in the face, and the usual
rule applies after that (it drops when the seat is alone or passes a door). What a table can still deduce is only what
the drawn figures show: the true accused seen in town after a public "cuffed", two of one face in the cell, and a
hanging's roster flip (B6).

**The jail's games (D8).** The cell holds three props, and each opens a board for the seat standing at it, once a day
(a round) and per game; the board is spent when it opens. Working out at the weights is a tap board and adds
`jail.gym.damage` (_proposed_ 2) to the seat's fist and slingshot damage for the rest of the match (one Strength: a second
workout adds nothing). The yard fight, at the sparring
post, is a crates board of one round: a right answer inside `jail.yard.boardS` (_proposed_ 20 s) wins `jail.yard.purse`
(_proposed_ 2 Scrip) from the town; a wrong or a slow one loses (a board left unanswered past `boardS` is lost too), and a loss takes `jail.yard.maxHpLoss` (_proposed_ 10)
off the seat's maximum health for the rest of the match, never under `jail.yard.maxHpFloor` (_proposed_ 80). Scrubbing,
at the pail, is a pour board that pays `jail.scrub.wage` (_proposed_ 1 Scrip). The hour off the sentence the owner's
design names is not yet built: every sentence ends at the next morning train (3.27 above), so an early release waits on
the owner. Nothing here is public: the tally is the server's, and the only signs are a harder
fist, a smaller health bar and the purse.

### 3.28 Accounts and achievements

Round 10, E1 (`docs/round9/gdd-map.md` 2.2). Not built yet: the step that builds it writes this section.

### 3.29 The lock-pick mini-game

Round 10, D5 (`docs/round9/gdd-map.md` 2.3; `docs/round9/logic-table.md` 8.5; owner answer LT2). D5a is the rules and
the server; D5b the screen; D5c the scratch clue and the fine.

**What opens it.** A locked door (the `lockedDoor` class, 3.14) with a Lockpicks in the pack: `act.hold {action:
'interact'}` on it opens the mini-game in place of a hold, and the Lockpicks (`tool.pick`) is the tool of the wall. A seat
without one is refused `NEED_TOOL`. The manor study door (`mu.study_door`) is the one lock placed; the curfew doors wait
for rent in kind (D7).

**The lock.** It has pins by tier (`balance.minigames.lockpick.pinsByTier`: 3, 4, 5; every placed lock is tier 1), each with
a set point along its lift, dealt on the `locks` stream when the lock is first picked in a match and kept for the match.
The picker's client alone gets `minigameStart {kind: 'lockpick', public: {pins, setPoints, band, snapAt, minAttemptS,
maxAttempts}}`: the set points are a puzzle, as the tap bands are, so the click can be felt. A pick of a lower tier than the
lock has a narrower band (`lowerTierBandMult`). The attempt sounds as the interaction's noise from its start (3.7).

**The answer** is a trace of attempts `{t, pin, lift, tension}` that the server replays (`rules/minigames.ts
lockpickOutcome`): a lift within `band` of the pin's set point sets it, a tension of `snapAt` or more snaps the pick, and
all pins set opens the lock. Times ascend and keep `minAttemptS` apart and a trace holds at most `maxAttempts`, so no
trace is faster than a hand. A trace that leaves a pin unset or is malformed is `BAD_REQUEST` and the board stays open.

**Opening and snapping.** An opened lock becomes the public prop state `open` (3.14; it names no one). A snapped pick
spends one Lockpicks and refuses `PICK_SNAPPED`; a charge is lost only that way. Nothing else changes in public view: the
opened lock leaves a Scratches clue (3.4), the same whoever picked, and the interaction's `fineChance` (rolled on the
`locks` stream, a stream no client sees) may fine the picker `economy.json` `trespassFine` Scrip, taken as any fine is. NPC seats do not pick yet (their routine reaches
only props a mode of no mini-game works, 3.12 Chores).

**The screen** (round 10, D5b). The picker's dialog draws one column per pin and a tension gauge with the snap line, and never the set points: a pin that is lifted into its band under light tension clicks (a tone, a buzz, a jolt). Letting go of the pick records an attempt; the trace of attempts is the answer, and the board ends when every pin is set or the pick snaps.

### 3.30 The inventory and crafting

Round 10, A12 and A13 (`docs/round9/gdd-map.md` 2.4; `docs/round9/logic-table.md` 8.6; DECISIONS A245). A12 builds the
slots and their rules on the server; A13 writes the screen and the crafting grid into this section.

**The slots.** A seat's inventory is `items.inventorySlots` general slots plus a belt and three gear slots, all in its
private view only (nobody else's client receives them):

| Area | Slots | Holds |
| --- | --- | --- |
| Hotbar | the first `balance.inventory.hotbar` general slots | anything; the selected one is the held item |
| Pack | the rest of `items.inventorySlots` | anything |
| Belt | `balance.inventory.belt` | items of kind `tool` only |
| Head, body, weapon | one each | an item whose `equip` names that slot (none until D6) |

A stack names its own slot, and one slot holds one stack. An item stacks up to `balance.resources.stackMax` of its kind
(materials and food); any other kind stacks 1.

**Adding.** A gain (a gather, a craft, a quest reward, a pickup) tops up the seat's open stacks of that item first, then
opens new ones: a tool on the belt first, then the hotbar, then the pack; anything else in the hotbar, then the pack.
A gain that does not all fit changes nothing and refuses `PACK_FULL`. A take empties the newest stacks first.

**Moving and holding.** `inv.move` moves a stack into an empty slot, onto a stack of the same item as far as it fits,
or swaps it with the stack there when each slot takes the other's item; anything else refuses `BAD_REQUEST`, since the
screen offers only the moves that land. `inv.select` picks the held hotbar slot. Both are consumed in `step()`.

**The screen** (A13b, UI.md 14.44). The inventory screen (I) draws the hotbar, the pack, the belt and the head, body
and weapon slots as grids with the crafting square beside them. Pick a stack, then a slot: the slots that would refuse
the move are dimmed, so the screen offers only the moves that land. The hotbar strip is on screen during a match and its
slots, or the keys 1 to 6, select the held one. The square previews the product and Take sends `craft.grid`.

**A dropped body.** When a body is dropped (the train's return, a robbery), it loses the hotbar, the pack, the belt and
the purse. Bound kit (`onDeath: kept`), the gear slots and the bank stay with the seat. A match's end empties the
inventory and the held slot resets to the first.

**The crafting grid** (A13a). `craft.grid {size, cells}` sends the grid row by row: `size` 2 (the pocket square, always
there) or 3 (within reach of a workbench), each cell an item id or empty, one unit per cell. The server matches a hand
recipe (one with no station): a recipe is **shapeless** (the cells hold exactly its inputs, in any places) unless it
carries a `shape`, rows of item ids that the cells must show, anywhere in the grid and mirrored (the Torch is a Pine
Resin over a Timber; the Snare is shapeless). A pattern wider than the pocket square needs a workbench too. The check
runs in this order: a malformed grid refuses `BAD_REQUEST`; a role-bound item in any cell refuses `GRID_BOUND` whatever
the recipes say (and no recipe takes one); a 3 by 3 grid or a wide pattern away from a workbench refuses `NEED_STATION`
(workbench); nothing matching refuses `GRID_NO_RECIPE`; cells the seat does not hold refuse `NEED_MATERIALS`; a product
that does not fit refuses `PACK_FULL`. On a match the inputs go and the product arrives as one change inside `step()`,
with no hold. Station recipes (the basin's Axe, the oven's Lantern) stay at their stations and the older `craft` hold.

### 3.31 Law enforcement and petitions

Round 10, B1 to B4 (`docs/round9/gdd-map.md` 2.5; `docs/round9/world-mode.md` 3.1, `followup-4.md` 2.1 and 2.2).

**The Constables (B1, A229).** The county's law: two figures per map, never seats (3.24), with no card, no vote, no
task list and no part in any win, wearing the `constable` look (3.17). They are guards (3.24): each keeps a post at
the square (HollowMere's notice board and bell, BlackPine's camp board and bell) within `guard.leashTiles`, has
health, and fights back when struck. They read only what the world shows, never a card. The petition and the
manhunt are B3 and B4.

**The briefing (B2, A249; seams.md 3 row 8).** The Constables read every clue the world makes that a seat could
collect (`clues.json` `collectible`: footprints, thread, felt, drag smears, fur, claw marks, the Wet Bucket and the
rest; not a body, a time of death, drips or a Hungry Killer's glowing trail, and not the teaching clue). They read
it the way a collector does, `clues.collectHoldS / law.speedMult` after it appears (`law.speedMult` 2 times a
Detective's rate), from their posts, since they never leave their leash (F4 2.2). `law.briefingAfterS` (30 s) after
the clue appeared they post a **briefing**: one public line in every seat's log (the `system` chat channel, the
templates of `laws.json` `briefing`, UI 14.50) naming the clue's kind, its scene and, only for a clue whose Reader
is Anyone (3.4: footprints and thread), the trait the clue object holds ("Constables' briefing: footprints in
Crumb's Ovens, tall."). A role's reading (the felt's hat, the prints) is never briefed. A briefing never names a
seat, a handle, a card or a time, never says Forged or Verified, writes no Notebook entry and changes no clue: a
planted clue is briefed like any other, and Inspect keeps its edge. A clue collected, erased, decayed or evicted
before its time is not briefed, and the same words twice within `law.briefingAfterS` post once. While no Constable is
alive there is no briefing (proposed; a knocked-out Constable is alive, and until C5 nothing kills a guard). It opens
no screen, pauses nothing and waits on nobody. The server keeps the posted
briefings in order for the police board, which shows them with the petition form (B3).

**Walk with me (B8, A269; seams.md 3 row 10).** In the night phases (dusk, night, the Final Night) a living seat
may ask a figure in inspect reach (`relations.inspect.rangeTiles`; a seat or a townsperson, by its handle) to walk with
it until dawn. Every ask draws one delay from `pairing.answerS` (5 to 9 s, long enough to read and answer) and one
yes roll from the `pairing` stream, whoever is asked, and the answer reaches the asker at that delay, so its timing
never tells a person from an NPC (R6). A human target sees a private prompt until then: an early answer is held, and
no answer is a no. An NPC seat or a townsperson says yes on the roll, `pairing.yesChance`, times
`pairing.scaredMult` while its mood is Scared (the needs never read a card). A guard (3.24) keeps its post and always
says no, and since no seat wears a guard's look, its no says nothing about a person. A target that is already
asking, asked or paired says no at the delay like any other. A no is an answer, never a refusal (`failures.md` 10):
the asker sees the same line whoever said it. A pair lasts until dawn, a death, a cancel (`pair.answer` with
`yes: false`), or `pairing.apartS` with the two in different scenes. A townsperson or an NPC-seat partner follows
its asker within `pairing.followTiles`, through doors like any walk; a human partner is never moved. While the two
share a scene, a paired seat is not alone for the NPC Killer's strike roll and its kill-opportunity timer (3.12),
but only against a third party: a pair is no shield against a partner who is the Killer. The mugging's alone rule
already counts any figure in the room. Only the two seats learn of a pair, in `Private.pair` (a phase and the other
figure's handle in the viewer's scene, '' while it is elsewhere, never a seat id); nothing public shows one. The
inspect panel's section is B8b.

**The petition (B3a, A289; seams.md 3 row 13; F4 2.1).** A living, free human (placed, not on the line, 3.22, and
not jailed, 3.27) opens a **petition** at a notice board in reach, naming a seat of the public roster (by character:
a sighting of a figure wearing B's look accuses B, never through an impersonation), a charge from `laws.json`
`crimes` (the crimes of `world-mode.md` 5; their sentences are B6's), and up to `petition.maxEntries` (4) of its own
clue entries. A night-power entry, a Forged entry or the teaching entry never attaches. One petition is open in the
whole town at a time (`PETITION_OPEN`); after a lapse the accused and the opener wait `petition.cooldownS` (120 s)
before naming or opening again (`PETITION_GRACE`). The petition needs ceil(`petition.othersPct` (0.3) times the
living, free humans, the opener and the accused counted) other signatures within `petition.openS` (60 s): 1 at 3
humans, 2 at 4 to 6, 3 at 7 to 10. The bar is fixed when the petition opens and holds for its window, and so is whether the Constables may sign, so it never
moves at a death; a person and an NPC seat give the same bar as the accused. Any living, free human but the opener
and the accused may sign, once, and a signature stands once given: the count never drops when a signer dies, goes
on the line or is jailed. At `petition.constableAtHumans` (5) humans or fewer, the Constables sign once, as one
signature, when the petition's public entries hold `petition.constableMatches` (2) backed matches against the
accused's public traits; they never read whether a clue was planted, a role's reading or a card. With enough names
the petition passes and leaves a warrant for the manhunt (B4); at its clock's end it lapses. The public row
(`GameState.petition`) shows the accused, the charge, the counts and each entry as anyone may read it: the kind, the
scene, whether it is backed (Verified or Corroborated, one mark for both), and the trait only for a kind whose
Reader is Anyone (footprints, thread); never the opener or a signer. Only the signer learns it signed
(`Private.petitionSigned`). A petition is not a vote: nobody is removed by it, and the verdict comes from the
evidence at the Tribunal (B6). NPC seats do not sign yet, and a petition never waits on an NPC. The screen is B3b.

**The Constables' own petitions (B3c).** In Paint The Town Red, where no human is on the town side (both humans are
the Killers), the Constables file their own petition when their posted briefings fit exactly one figure. Within the
last `law.fileWindowS` (_proposed_ 300 s), the briefings that named a trait (footprints, thread) are read against the
traits every client sees on the roster's figures; a living seat matching at least `petition.constableMatches` (2) of
those traits is a candidate. Only a single candidate is named: none or a tie files nothing, and a seat in its grace
after a lapse is skipped. They read nothing else (no card, no cover, no private view). The petition is the ordinary
public row, charged with murder, its entries the briefed clues (each backed), with no opener and `needed` 0, so it
passes at once into a warrant for the manhunt. They file only with a living Constable, while no petition is open, no
manhunt runs or waits, and `petition.cooldownS` after their last filing. In the main world mode they never file: a
filing there would tell the table that no human is left on the town side.

**The manhunt (B4).** A passed petition's warrant waits its turn, and one manhunt runs at a time, for
`manhunt.durationS` (120 s), a world phase rather than a pause. It is public as `GameState.manhunt` (the accused, its
clock and its state: hunting, then cuffed). Any living, free seat may **cuff**: a hold of `law.cuffHoldS` (3 s) with a
figure in reach (`act.hold {action: 'cuff'}`), stopped if the cuffer moves, the figure leaves reach, the figure strikes
or the cuffer is struck. The cuff tests the face the figure is drawn with, never the seat behind it: a figure not
drawn as the accused is refused (`NOT_HUNTED`), the accused drawn as someone else included. It lands on the seat
behind the figure, so an impersonator drawn as the accused is cuffed as the accused would be, and nothing public says
which seat is held (the owner, 2026-10-30: that seat is jailed and tried, B5). The opener and the signers alone see,
on their maps (`Private.huntScene`), the scene where a figure drawn as the accused was last seen by the rumour ledger's
rule (3.23: a scene holding at least two figures, every `notices.sampleS`; the lower scene first). The **Constables**
join: a Constable cuffs a figure drawn as the accused within its leash, by the same test, in `law.cuffHoldS /
law.speedMult` (1.5 s), and a strike on it stops the cuff. At the clock's end, if no living human but the accused is
out of jail and off the line (asleep and knocked out still count as free), the Constables cuff the accused where it
stands; otherwise the case stays on the board and no petition opens for `petition.cooldownS` (120 s). A dead accused
ends the hunt. The cuffed seat is held where it stands until the next dawn; the county jail and the Tribunal are B5
and B6.

### 3.32 Sleeping

Round 10, A7 (`docs/round9/gdd-map.md` 2.6; `docs/round9/world-mode.md` 7.3; `docs/round9/followup-4.md` 2.4 and
2.11). A7a builds beds, homes and the night skip; A7b adds what each bed restores and Exhaustion.

**Homes.** At the start of a match each human seat draws a home from the `homes` stream, never from its card: an
interior an NPC could call home (3.12) that has a `bed`, distinct from the NPC homes and from each other while the map
has enough, then shared. Only the seat itself learns its home (`Private.home`).

**Beds.** A bed is a prop of kind `bed` (one in each home interior), `cot` (the chapel's) or `innBed` (the tavern's back
room). A seat lies down with the `sleep` hold at a bed within reach, at dusk or at night; any other phase refuses
`PHASE_CLOSED`, and there is no sleeping in the Final Night's hunt.

| Bed | Who may sleep there | Refusal |
| --- | --- | --- |
| Home `bed` | the seat whose home it is, while its house is not boarded | another seat's bed: `NO_BED`; a boarded house: `BOARDED_HOME` |
| Chapel `cot` | anyone, free | none |
| Tavern `innBed` | anyone, for `balance.sleep.innBedScrip` from the purse | a short purse: `NEED_SCRIP` |

Until D7 boards houses, a house counts as boarded while its seat is Indebted (3.23).

**Asleep.** A sleeper stays in its bed. Its first input wakes it and does nothing else: a move wakes it without a
step, and any other act wakes it and is refused `ASLEEP`, which is never shown; chat is not an act. A hit wakes it
after the damage lands. Dawn wakes every sleeper, and a sleeper who dies or leaves is gone from the count. While a seat
sleeps, its own view shows how many active players are in bed and of how many, never who.

**The skip.** Active players are the living, placed, connected humans. NPC seats never count, so nothing waits on
one. When every active player has been asleep for `balance.sleep.confirmS` of the night, the night ends as a normal
dawn does: the next day, or the Final Night when the round calls for it. A human who stays awake, a Killer or anyone,
holds the night open. Still waits: the county jail (B5) and the line (the respawn step) will leave their seats out of
the active players.

**What a night in bed restores (A7b).** A seat still asleep when the night turns to day is restored by its bed; one
who woke in the night gets nothing.

| Bed | Stamina | Also |
| --- | --- | --- |
| Home `bed` | to `balance.sleep.restore.bed` of the maximum (all of it) | nothing |
| Tavern `innBed` | to `restore.innBed` (all of it) | cures `sleep.innBedCures`: Slowed, Stunned, Poisoned and Famished, and counts as a meal |
| Chapel `cot` | up to `restore.cot` (half), never lowering it | `sleep.cotFaith` Faith (P: 5, up to the Faith maximum), withheld from a seat the chapel bars |

**Exhaustion (A7b).** In the night, when every active player but one is asleep, that one is the holdout. A holdout
alone for `balance.sleep.holdoutGraceS` (60 s) is **Exhausted** from the next dawn to the next dusk: maximum stamina
and its regeneration are both halved (`effects.json` `exhausted`). Going to bed after the grace does not undo it. A
card with a power that works in the night (`abilities.json` `phases`) and a seat on a running manhunt (its accused, its
opener or a signer, 3.31) are never Exhausted. The effect lives in the seat's own view only, with no sign on the
figure. Still waits: the chapel's bar (the Defrocked sentence).

**The screen** (A8, UI.md 14.46). At a bed in reach at dusk or at night the prompt offers to lie down. A sleeper's view
dims to its bedroom and shows how many active players are in bed and of how many, never who. A move, a key or a hit
wakes it. A sleeper who wakes because the night ended sees "You slept through", whether the night was skipped or ran
out.

### 3.33 The Hitman's arrival

Round 10, C4 (`docs/round9/gdd-map.md` 2.7). Not built yet: the step that builds it writes this section.
