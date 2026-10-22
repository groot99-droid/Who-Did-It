# Round 6: the owner's brief

The owner's request of 2026-10-21, word for word, then the Bible it carried, word for word. Nothing here is a
rule: the rules it implies are written in `docs/GDD.md` and `packages/content/data` by the sessions that build
them, and the staging of its systems across rounds 6 to 9 is `bible-seams.md`. The decisions the owner took while
this round was planned are DECISIONS A81.

## 1. The request

> Let's make a plan using the info we've had scheduled (crafting, etc) and wrap this into it. Remember to spilt
> the work between individual sessions to reduce context bloating, set auto compact for all sessions once they
> reach 400k tokens, use sonnet for almost everything use opus only for planning and highly complex game logic
> development, use fable only for system redesign, we are going to implement dying cutscenes, opening cutscenes,
> gameplay music playlists, starting screen trailers and animations for loading, transitioning and more. I'd also
> like the game to have a special admin section that only I can access where I can play the game on auto mode
> with all the NPC roles playing out on multi screens at 10x speed for me to check the game for errors and bugs.

The owner also uploaded eleven audio files (three map songs, three GarageBand beds, a trailer track, four
one-shot SFX); they are catalogued in `media.md`.

## 2. The Bible

> WHO DID IT (@wdi): THE INTEGRATED MASTER WORLD, SYSTEM & DESIGN BIBLE
>
> Architectural & Narrative Scope: A comprehensive synthesis of the Round 1–5 Engine Chassis (2:1 dimetric
> isometric Phaser 4.2.1 client, dual 8bit / lowpoly runtime art toggle, authoritative 20 Hz Colyseus server,
> 3-Trait forensics, Public Role Looks with Cover disguises, and human-like NPC routines) and the Round 6+
> Strategic Ecosystem (Asymmetric Killer Vendettas, Conditional Townsfolk Evolutions, the 3-Stage Law Enforcement
> Pipeline, Civilization VI-style macro-resource loops, the Deflection Economy, Tactile PiP Vulnerability
> Mini-Games, the Omniscient NPC Propagation Matrix, and the three flagship settings: HollowMere, Port-au-Levain,
> and BlackPine).

### PART 0: THE EVOLUTIONARY BRIDGE ("BEFORE" → "AFTERWARDS")

To understand how Who Did It functions as both an isometric social-deduction survival game and a paranoid strategy simulator, every system in this Bible is built on the marriage of two layers: The Foundational Technical Chassis (Rounds 1–5) and The Living Deflection Ecosystem (Round 6+). Nothing built in the early rounds is discarded; rather, the early mechanics serve as the physical laws that make the advanced asymmetric roles and macro-economies possible.

| Design Dimension | The Foundational Technical Chassis (Rounds 1–5) | The Living Deflection Ecosystem (Round 6+) | How the Two Layers Lock Together |
|---|---|---|---|
| Core Loop & Pacing | "Mafia with Walking": Generic Day/Dusk/Night cycles; a single Cabal Killer vs. static Village task-doers; match ends at Cabal parity or Final Night after Cycle 4. | Macro-Resource & Motive Ecosystem: 4 distinct Killer Vendettas per map; 4 competing resource vectors (Faith, Scrip/Money, Rumors, HQ Status); a master physical clock (The Daily Train, The Ferry, The Shift-Whistle) that injects supplies, mail, and VIP catalysts. | The 20 Hz phase clock (grace → day → dusk → night) remains the server heartbeat, but Dawn/Train Arrivals and Midnight Roll Calls become active world events that mutate roles, enforce tax/quota survival pressure, and restock the economy. |
| Role Secrecy & Identity | Public Looks + Cover Roles (A49): Village roles walk visibly in their job's look (Baker, Detective, Clerk). Cover roles (Killer, Accomplice, Drifter) wear undealt Village looks and use Impersonate unseen. | Conditional Evolution & "Secret Lives": Townsfolk evolve mid-match into shady or heroic archetypes (Fence, Embezzler, Extortionist, Vigilante) based on what crimes occur and how resources are invested. | Because Townsfolk keep their public look when they evolve into selfish roles (keepPublicLook: true), an innocent Clerk sneaking into the Bank to embezzle creates an organic behavioral red herring—looking guilty without scripted fakery. |
| Forensics & Clues | 3-Trait Triplication (A1, A8): Every character has Height (Footprints), Scarf (Thread), and Hat (Felt). Kills drop 2-of-3 clues, narrowing suspects to sets of 3. | GUMSHOE + Archetype Forensics: Crime scenes yield both Core Clues (guaranteed trait drops) and Secondary Vendetta Traces (Black Powder, Candlewax, Flour Dust, Soot Smudges, .45 Slugs). | The Three-Clue Rule prevents stalled investigations: trait clues narrow who was physically present, while Vendetta traces reveal which killer plot is active and feed the Detective's progressive Case File. |
| Justice & Voting | Flat Plurality Meeting (A30): Anyone rings the Town Bell or reports a body; the town debates and casts a simple plurality vote (Skip or eject). | The 3-Stage Law Pipeline & Deflection Economy: Law escalates from Detective (Clues) → Police Officer (Tackle & Cuffs) → Judge (Public Tribunal with 3 Verdicts), navigated through weaponized Blackmail Notices. | Standard bell meetings still exist for town panic, but catching a high-tier threat (like the anonymous Bandit) requires the Multi-Variable Deductive Lock: Verified Case File + Physical Apprehension + Weighted Tribunal Verdict across a web of legal red herrings. |
| Tasks & Interaction | 2-Second Hold Bars (A34): Walking up to a prop and holding E for 2 seconds to collect a clue or trigger an ability. | Tactile PiP Vulnerability Mini-Games: Physical, diegetic mini-games (picking tumblers, steaming wax, wiring dynamite, stuffing loaves) rendered inside a translucent frosted-glass modal over the live world. | Mini-games mount as Picture-in-Picture (PiP) overlays in the center of the screen while the isometric World canvas stays live underneath—forcing you to watch frosted glass and lantern shadows for approaching killers. |
| NPCs & Population | Hidden Seat Fill (5H, A59): 4–10 seats filled with human-named NPCs following dwell-timed room trips so they cannot be told apart from humans. | Scheduled Crowds, Emotional States & Witness Grid: Town NPCs follow the Town Clock (Station Rush, Shift, Saloon Curfew), shift between Calm, Panicked, Entranced, and Rioting, and log observed crimes into the mail stream. | Seat-filling NPCs use 5H routines during Calm states, act as line-of-sight witnesses that generate morning Blackmail Slips, and switch into react sub-modes when Panicked (running to the Bell), Entranced (marching to the Cult Altar), or Rioting (blocking Police with torches). |

### BOOK I: HOLLOWMERE — THE FRONTIER COMPANY TOWN

(Primary Map ID: map: "hollowmere" | Aesthetic: Stylized Toon-Noir Frontier | Render Modes: 8bit & lowpoly)

#### 1. The Opening Cinematic

[VISUAL & AUDIO CUE] The screen is pitch black. We hear the rhythmic, metallic clatter of iron wheels on tracks, growing louder, accompanied by a low, mournful harmonica and the howling wind of the frontier (amb_hollowmere.ogg, storm.ogg). A single gas lantern flickers to life—casting a warm pool of light across the 2:1 dimetric cobblestones—illuminating a weathered wooden sign that reads: HOLLOWMERE — EST. BY THE RAILROAD EXPANSE.

As the isometric camera slowly pans across the stylized toon-noir silhouettes of Crumb's Bakery, the Chapel, the Company Bank, the Lumber Mill, and the dark, jagged treeline of the Black Pine forest (forest_deep), a gravelly, world-weary voice begins to speak:

[NARRATOR]

> "Seven days' walk from the nearest soul. Hemmed in by black pines, hollow caves, and freezing mud.
> HollowMere wasn't built by pioneers, and it wasn't blessed by saints. It was laid down—tie by wooden tie, spike by iron spike—by the Railroad Barons. They own the mill. They own the bank. They own the dirt under your boots. And if you want to eat, if you want news from the outside world, or if you ever hope to leave... you wait for the train.
> Every morning, that iron beast rolls into the station. It brings flour for the Baker's ovens, whiskey for the Saloon, fresh faces to replace the dead... and the daily mail.
> (The train whistle shrieks in the distance; a plume of white steam cuts across the dark screen.)
> On paper, we're a quiet company town. Folks do their jobs, lock their doors at dusk, and tip their hats to the Detective. You know your neighbors by the cut of their coat and the tools in their hands.
> But nobody comes to the end of the line unless they're running from something—or hunting for it.
> A new Vicar just stepped off the morning platform, looking to save our souls... though there's a whisper in the woods that someone's already measuring him for a coffin—and waiting to wear his robes. There's dynamite missing from the railyard, and talk of a strike that'll bring the Baron himself down the tracks. There's a Bandit eyeing the vault with a loaded six-shooter and a pocket full of tip money. And somewhere in today's mailbag sits a sealed envelope... offering one of you a fortune to turn killer before sundown.
> (The camera stops at the Station Platform as the train's headlamp blinds the screen in stark white light, followed by the heavy hiss of brakes.)
> In HollowMere, nobody kills for nothing. Everyone has a price, a prayer, or a vendetta.
> Check your pockets. Read your mail. Watch the shadows... and whatever you do, don't miss the train."

[TRANSITION TO GAMEPLAY] The heavy brass station bell rings CLANG—CLANG! (bell_ring.ogg). The blinding headlamp fades, each player's secret Role Card (and Cover Look Selector for disguised roles) slams onto the screen with a heavy ink-stamp sound (stamp.ogg), and the village gates open for the 30-second Grace period.

#### 2. Core Setting, Geography & Design Philosophy

The Frontier Company Town

HollowMere is a claustrophobic, superstitious railroad town controlled by ruthless Railroad Barons. Because the nearest settlement is over a week's walk through lethal wilderness, the town is an island. Every citizen is trapped in an economic and ideological pressure cooker.

The Scene Graph & Player-Count Profiles

HollowMere scales dynamically across Small (4–6 players), Medium (7–8 players), and Large (9–10 players) profiles using district gates (gates in overworld.json), ensuring the social density remains tight while every entered building features at least two connected interior rooms (preventing corner-trapping):
 * The Town Core (All Profiles): The Overworld Square & Train Platform (overworld), Crumb's Bakery & Upper Loft (bakery, bakery_loft), The Rusty Lantern Saloon & Cellar (tavern_bar, tavern_cellar), The Parish Chapel & Undercroft (chapel, undercroft), The Post Office & Telegraph Room (post_office), and The Constable's Office & Morgue (constable).
 * The Industrial & Financial Wing (Medium+ Profiles): The Company Bank & Vault (bank, bank_vault), The Waterwheel Lumber Mill (mill, mill_loft), and the Deep Black Pine Forest & Hollow Cave (forest_deep, cave_gallery).
 * The Manor Rise & Well Network (Large Profile): The Baron's Manor Hall (manor_hall, manor_study) and the Village Well Ladder (ov.well → cellar.well), providing a subterranean shortcut between the square and the undercroft.

The Four Core Design Pillars
 * An Ecosystem, Not a Board: Players do not walk around clicking abstract progress bars. Every task is a physical trade, a heist, a cover-up, or a power play tied to the town's survival.
 * Public Faces, Hidden Covers (A49 + Evolution): In HollowMere, citizens recognize each other by sight—the Baker wears his flour-dusted apron, the Postmaster carries his mail satchel, and the Detective wears his trench coat. However, Cover Roles (Killers, Accomplices, Drifters) disguise themselves at the start of the match by selecting an undealt Village look. Furthermore, when an innocent citizen undergoes a Conditional Evolution, their outward sprite stays unchanged while their secret alignment mutates—meaning a trusted face can turn traitor mid-match without warning.
 * Dual-Layer Forensics (Traits + Vendetta Traces): Every murder or major sabotage leaves 2-of-3 Character Trait Clues (Footprints = Height, Thread = Scarf, Felt = Hat) alongside 1 Archetype Trace (Candlewax, Black Powder, Brass Casing, or Wax Seal). Traits narrow which physical body committed the act; Traces reveal which Killer Vendetta is unfolding.
 * Conditional Evolution ("The Secret Life Engine"): Nobody stays static. Depending on what crimes occur, whether the train is sabotaged, or whose body is found first, regular townsfolk and lawmen evolve mid-match into new roles with completely new abilities and win conditions—generating natural, non-random red herrings as citizens pursue selfish side-hustles.

#### 3. The Heartbeat of HollowMere: The Daily Train

The locomotive is the master clock of HollowMere. At the start of each Day phase, it pulls into the central station platform, stays docked for a timed window, and departs at Dusk.
 * Supplies & Commerce: Delivers sacks of flour for the Bakery, crates of whiskey for the Saloon, medical tonics for the Morgue, and raw lead/gunpowder for the Railyard. Players haul physical crates from the platform to restock their stations or trade scrip for tools.
 * Information & The Press: Delivers the daily mailbags to the Postmaster, sealed packages, and the HollowMere Gazette—a town-wide morning bulletin that prints yesterday's exposed secrets, active bounties, and major sabotage headlines without naming unverified players.
 * Fresh Blood (Catalysts & VIPs): Delivers major catalyst figures—such as The Vicar (or The Ascended Vicar on a martyrdom return) and, when provoked by Phase 2 Public Unrest, The Railroad Baron flanked by Pinkerton guards.
 * The Hitman's Contract: Secretly delivers a black-sealed letter into the Postmaster's mailbag (StreamName: "contract"), offering a random passive player a lucrative contract to become The Hitman.
 * Quick Travel & Extraction: Allows ticket-holders (or hidden Stowaways) to fast-travel along the northern-to-southern rail spur or extract from HollowMere entirely once their personal win condition (Bandit, Hitman, Embezzler) is fulfilled.

#### 4. Environmental Activity, Hazards & NPC Structure

Dynamic Environmental Hazards
 * Frontier Weather, Lighting & Mud: When Dusk falls (vision.duskTiles) or Night rolls in (vision.nightTiles), visibility drops to a tight radial pool (DynamicTexture lighting layer). Streetlamps and carried lanterns carve out small islands of safety. Stepping off the boardwalks into rain-soaked mud coats boots, leaving temporary directional Footprints (Clue.dir) for 30 seconds even without a kill.
 * The Black Pine Wolves: Packs of starving wolves prowl the forest loops (paths in forest_deep.json) and cave mouths at Dusk and Night. Wolves flee any active light source (lanterns, torches) and respect the perimeter fence, but if an unlit player wanders into the woods alone to dump a corpse, the wolves will stalk and maul them.
 * Pinkerton Guard Dogs: Stationed near the Company Bank and Railyard (or deployed by the Company Clerk). They do not maul unless provoked, but they bark loudly (noise pulse on the HUD perimeter) whenever a player sprints, lockpicks, or carries an unholstered weapon within their radius, alerting Law Enforcement.
 * Cave-Ins & Miasma: The deep caves (cave_gallery) offer secret underground portals connecting the Chapel Undercroft, the Forest, and the Mill cellar. However, lingering in unventilated miasma pockets causes players to cough (noise emission) and hallucinates false directional footstep cues on their screen edge.

Structured NPC Schedules & States (5H Routine Engine + Reactive States)

Seat-filling NPCs and town ambient actors never wander aimlessly (A59). They follow the Town Clock and transition smoothly between routine trips and reactive emotional states:
 * Dawn (The Station Rush): NPCs gather at the train platform to pick up supplies and gossip, creating a dense crowd of avatars where pickpocketing, channeling a prayer, or slipping a mail envelope is naturally camouflaged.
 * Midday (The Shift): NPCs travel one portal at a time with realistic dwell timers (12s walk cap with 2–8s pauses)—working the Mill saws, depositing scrip at the Bank, buying Wake Loaves at the Bakery, or praying at the Chapel.
 * Evening (The Saloon & Curfew): At Dusk (leaveAtTick), NPCs leave unlit outer scenes, crowd the Saloon for a drink, and lock themselves inside their home scenes for the night.
 * NPC Emotional States (react Sub-Modes):
   * Calm: Follows standard daily persona waypoints and station visits.
   * Panicked (Witnessed a crime or unbagged corpse): Breaks routine, sprints toward the Town Bell (ov.bell) or the nearest Law Enforcement officer, and slams/locks doors behind them.
   * Entranced (Touched by Cult tracts or the Cultist's call): Walks silently into forest_deep or cave_gallery at night to attend the Dark Mass.
   * Rioting (Recruited by the Activist): Marches through the overworld streets carrying torches, smashing windows, body-blocking Police movement, and igniting exterior props.

#### 5. The 4 Asymmetric Killers & Their Ecosystems

At the start of a match, the active killer vendetta(s) dealt from roles.json and vendettas.json determine the shape of HollowMere's crisis.

I. THE ZEALOT vs. THE VICAR (The War for HollowMere's Soul)
 * The Catalyst — The Vicar: A new wave of religious believers has arrived by railroad, led by The Vicar (public look: vicar).
   * The Vicar's Goal: Convert every living player in HollowMere to his peaceful faith.
   * Gameplay Mechanic: By standing within range of players and holding a quiet prayer channel, the Vicar fills their faith meter, converting them into The Religious. Religious players keep their town jobs but gain peaceful parish tasks and a communal night-vision buff when standing near fellow believers. If every living player becomes Religious, the Vicar wins an immediate peaceful victory.
 * The Vicar's Martyrdom & The 10x Ascended Return: When the Vicar is murdered, the game triggers a special memorial sequence for the fallen Vicar:
   * The Cutscene: An 8-bit video of a swaying lavender field over wind-swept hills, with a lone orange tree in the distant foreground looming over and contrasting against a bright blue sky filled with thick, white puffy clouds. Swelling symphony music plays as the Vicar delivers his final words: "In the end I sought nothing else but to serve God. And serve him I did. With this death's last breath I pray this prayer: may the Almighty grant me the strength of ten in the next life. And in return, tenfold my own."
   * The 10x Buff Next Round (The Ascended Vicar): In the following match within that room (flow.ascendedVicarCandidate), that player is given the option to return as The Ascended Vicar. They step off the morning train glowing with divine wrath:
     * 10x Conversion Aura: Converts nearby players and NPCs in a massive radius simultaneously in a fraction of the normal channel time.
     * Righteous Stride: Moves significantly faster and can bash through locked doors (lock override) with a single strike of his heavy iron crosier.
     * Divine Judgement: Once per match, can call down a blinding pillar of light that forcefully drops Impersonate / Skin-Walk disguises and stuns nearby enemies.
 * The Killer — The Zealot: Begins in a Cover Look (cover: true), despising the Vicar's teachings and seeking to hijack his flock to birth a dark following.
   * Phase 1 (The Hunt): The Zealot must track down and murder the Vicar before the Vicar converts the town.
   * Phase 2 (The Skin-Walk): Upon killing the Vicar, the Zealot steals the Vicar's robes and identity. Unlike the standard 15-second Impersonate ability, the Skin-Walk permanently sets the Zealot's public Avatar.look to vicar. To every player in town, the Zealot now looks, sounds, and animates exactly like the Vicar.
   * The Corpse Condition: The Zealot's disguise and dark conversion powers remain active only while the real Vicar's body has not been reported (tetheredBodyId). If anyone finds and reports the Vicar's corpse (unless it has been sealed in a lead coffin by the Grave Robber Undertaker), the illusion shatters immediately and the Zealot snaps back to their cover look.
   * Reconversion & Dark Transformation: While disguised as the Vicar, the Zealot is the only killer who can strip "Religious" players back to baseline—and twist converted players into one of 4 Dark Positions:

| Dark Position | Primary Duty | Signature Abilities & Tasks |
|---|---|---|
| 1. The Minion (Corpse-Keeper & Lookout) | Protect the secret of the real Vicar's body at all costs. | • Dead Weight: Carry and relocate corpses (Entity.carriedBy) without leaving drag smears—moving the Vicar's body from the Chapel loft to a Saloon barrel, pine thicket, or Cave. • Lookout's Whistle: Place bone chimes near the hidden body that ping the Minion and Zealot if the Detective or Undertaker walks within range. • Scapegoat Block: Physically body-block doorways and absorb a Police tackle in place of the Zealot. |
| 2. The Mob Boss (Enforcer & Financier) | Control the streets through fear, silence witnesses, and fund rituals. | • The Shakedown: Corner shopkeepers (Baker, Bartender, Clerk) or players to extort scrip and ritual supplies, locking the victim's inventory for 45 seconds. • Omertà (Silence Witness): Grab a witness by the collar and "Threaten" them; for 90 seconds they cannot ring the Town Bell, speak in court, or report a body without taking lethal damage. • Brass Knuckles: Heavy melee stun that knocks active items (like the Detective's Magnifier or Clerk's Keys) to the floor. |
| 3. The Cultist (Herald of Ash) | Spread the dark word across HollowMere and prepare the awakening. | • Mark the Thresholds: Paint 5 hidden ash-and-blood sigils on the exterior walls of key buildings (Chapel, Bank, Bakery, Mill, Station) while unseen. • Whispering Campaign: Slip dark tracts into the Postmaster's mailbags or the Baker's crates, passively shifting town NPCs into the Entranced state. • Pied Piper: At Dusk, beckon Entranced NPCs to follow silently into forest_deep or cave_gallery. |
| 4. The High Priest (Dark Shepherd) | The Zealot's ultimate lieutenant and insurance policy. | • Unbroken Covenant: Even if the real Vicar's body is discovered and the Zealot loses their disguise (or is executed by the Judge), the High Priest retains the power to convert players and NPCs. • Consecrate the Abyss: Prepares the Deep Cave Altar (cave_gallery) or desecrates the Chapel pulpit by lighting black candles and arranging stolen relics. |

 * How "Founding a Following" Works (The Zealot Win Condition): The Zealot faction wins immediately when they complete a 3-part ritual culmination:
   * The Marks: Cultists have painted sigils on at least 5 key buildings in town.
   * The Congregation: At least 6 followers (any mix of converted players and Entranced NPCs) are gathered simultaneously inside the Deep Cave Altar or the desecrated Chapel.
   * The Dark Mass: The High Priest or Zealot stands at the altar and channels a 15-second chant while Minions and Mob Bosses hold the portals against Law Enforcement. When the chant completes, the sky turns crimson, the town bell tolls backward, and the Zealot faction wins.

II. THE ACTIVIST (The Revolutionary)
 * The Vendetta: Smash the iron grip of the Railroad Barons and return HollowMere to the workers—no matter the collateral damage.
 * Phase 1 — Workplace Disarray: The Activist (dealt a Cover Look) must sabotage the Baron's infrastructure by completing at least 1 (or up to all 3) of the following multi-step operations:
   * Fire in the Mill (mill): Sneak kerosene into the lumber mill, jam the waterwheel, and ignite the sawdust piles.
   * Dynamite on the Tracks (overworld): Steal blasting caps from the railyard, wire the trestle tracks via the Wiring the Plunger mini-game, and depress the plunger.
   * The Bank Heist (bank_vault): Blow or crack the Baron's payroll vault and scatter/steal the company funds.
 * The 3-for-3 Mastery Reward: If the Activist takes the massive risk of completing all 3 acts of Workplace Disarray before triggering Phase 2, she unlocks three game-changing abilities:
   * Recruitment: Rally mistreated town NPCs into Destructive Rioters (Rioting state) who march through town with torches, blocking Police and starting fires.
   * Influence: Grants total immunity from being voted out for 1 round after a kill, AND grants an additional kill target for the next round.
   * Espionage: Grants an informant network—giving the Activist an edge-of-screen warning whenever the Detective, Police Officer, or Judge inspects one of her clues or enters her scene.
 * Phase 2 — Public Unrest: Can be triggered after 1 objective checkpoint (risky) or all 3 (empowered):
   * With "Influence": The town is already boiling over. She simply has to survive the night.
   * Without "Influence": She must walk into the center of the Town Square (overworld), ring the Town Bell (ov.bell) repeatedly until 10 NPCs gather, and stand on the soapbox for a 10-second revolutionary speech completely exposed.
 * Phase 3 — The Baron's Arrival & The Redemption Trial Twist:
   * Following Public Unrest, The Railroad Baron arrives in person on the next day's train, flanked by Pinkerton guards, to crush the rebellion.
   * Once the Activist assassinates the Railroad Baron and the kill is confirmed, an Emergency Town Vote triggers immediately.
   * The Redemption Twist: All other players are heavily incentivized to vote out the Activist (receiving massive bounty/victory bonuses if they convict her). However, if the Activist uses Influence, blackmail, or silver-tongued deception to survive that single vote, her revolutionary debt is paid—she immediately converts into an innocent Townsfolk Villager, having achieved her vendetta.

III. THE BANDIT (The Outlaw)
 * The Vendetta: Four legendary scores, a loaded revolver, and a clean getaway.
 * The 4-Stage Heist Checklist:
   * Rob the Bakery (bakery): Pick the back-door lock (bk.back), sneak to the cooling rack, steal a fresh Wake Loaf, and leave a gold coin tip on the counter (an outlaw courtesy that unlocks the Baker's evolution into The Fence).
   * Rob the Chapel (chapel): Slip into the sanctuary and swipe the offerings straight out of the brass plate.
   * Rob the Bank (bank_vault): Crack the payroll vault (racing or overlapping with the Activist).
   * Rob the Train (overworld — Victory): Board the docked locomotive, blow the express safe in the armored car, and ride out of HollowMere for an instant solo/outlaw win.
 * The Gunfighter Mechanic:
   * Target: Anyone who gets in his way.
   * Six-Shooter: The Bandit is the only killer who can shoot and kill any player or NPC at range (act.ability "shoot" with line-of-sight tile raycast).
   * Ammo Scarcity & Crafting: Begins the match with exact rounds equal to livingPlayers + lawEnforcementNpcs. Every missed shot or dead guard costs leverage, forcing the Bandit to scavenge lead and gunpowder at the railyard workbench to press additional .45 cartridges.
 * Outlaw Anonymity: Because no one knows the face behind the bandana until he is in irons, the Bandit cannot be voted out in standard Town Bell meetings—he can only be unmasked and convicted if caught red-handed or physically handcuffed by the Police Officer and brought before the Judge's Tribunal.

IV. THE HITMAN (The Mail-Order Killer)
 * The Vendetta: A quiet professional contract.
 * The Selection Twist: No player is dealt the Hitman at the start of the match.
 * The Mail Trigger: When the morning train arrives and the Postmaster distributes the mail (or via automatic delivery if the Postmaster is dead), the server (StreamName: "contract") secretly selects a player currently holding an un-evolved passive Town role and slips a black-wax envelope into their inventory.
 * The Offer: Opening the letter presents a UI modal choice: Burn the Letter & Keep Your Mundane Life, OR Accept the Baron's Contract.
 * Gameplay Mechanics:
   * If accepted, the player's secret role mutates to The Hitman while their public Avatar.look remains 100% unchanged (e.g., everyone still sees them as the Baker or Clerk).
   * They are assigned a specific high-profile target (a vocal Detective, an Embezzling Clerk, or a Saboteur costing the Baron money) and receive a concealed weapon (Poisoned Needle or single-shot Derringer that emits zero killScream noise).
   * Eliminate the assigned target and board the next train to extract for an instant solo victory.

#### 6. Law Enforcement: The 3-Stage Pipeline

When a player is dealt Law Enforcement, they do not start with a gun and a gavel. They must earn their authority through deductive competence, escalating through three distinct phases (lawStage: 1 → 2 → 3) that visibly upgrade their public Avatar.look:

[STAGE 1: THE DETECTIVE] ──(Verify 3 Clues Linking Suspect + Plot)──► [STAGE 2: THE POLICE OFFICER] ──(Tackle, Cuff & Drag Suspect to Bell)──► [STAGE 3: THE JUDGE]

 * Stage 1 — The Detective (Uncovering the Chaos):
   * Role: The cerebral investigator (look: "detective").
   * Tools & Mechanics: Equipped with a Magnifying Glass (limited Lens charges; drops on death per A8), Evidence Bag, and Case Notebook. Collecting a clue (2s hold) records it as Verified in the Case Board, reading both Character Traits (Footprints, Thread, Felt) and Archetype Traces (Black Powder, Candlewax, Flour Dust, Caliber .45).
   * Progression Condition: Once the Detective verifies enough matching clues to narrow a suspect set (at most 3 names) and link them to an active crime plot, they stamp their Case File (stamp.ogg)—instantly evolving into The Police Officer.
 * Stage 2 — The Police Officer (The Long Arm of the Law):
   * Role: Tactical front-line pursuit and apprehension (look: "police_officer").
   * Offensive Perks & Tools:
     * Heavy Patrol Baton & Tackle: Sprint-tackle a fleeing suspect within range, knocking them prone.
     * Iron Handcuffs: Applied to a tackled or cornered suspect (mandatory to strip the Bandit's Outlaw Anonymity).
     * Tin Star & Armored Coat: Passively absorbs a single gunshot or knife ambush (functioning like a built-in Bandage save where the attacker still gains Blood and triggers cooldown).
     * Riot Whistle: Disperses crowds of Rioting NPCs and temporarily locks down station district gates.
   * Progression Condition: Once the Police Officer physically cuffs their prime fugitive and drags them to the Town Bell / Courthouse (ov.bell), they evolve into The Judge.
 * Stage 3 — The Judge (The Final Verdict & Multi-Variable Lock):
   * Role: Prosecutor and executioner (look: "judge").
   * Gameplay Mechanics: Convening a Tribunal pulls all living players to the square, locks the cuffed suspect in the dock, and projects the Judge's verified Case File (Trait matches + Plot traces) onto every player's screen.
   * The 3 Possible Verdicts (Voted on by the Town, with the Judge's vote weighted by the number of Verified Clues presented):
     * No Conviction (Acquittal): The evidence was weak or the jury was bribed/extorted. The suspect walks free with a 30-second immunity grace.
     * A Heavy Fine: Strips the suspect of all scrip, confiscates weapons/bullets, and resets their active heist/sabotage checklist without killing them.
     * A Death Sentence: The gallows trapdoor drops (loaf_crack.ogg / trapdoor SFX). The suspect is publicly executed, and win conditions are evaluated.

#### 7. The Townsfolk & Conditional Evolutions ("The Secret Life Engine")

Every regular player in HollowMere holds a vital town job with a recognizable public look. Each job has an active daily loop and two branching evolutions triggered by what the Killers do. Because evolved Townsfolk retain their original public look, their shady or heroic pivots create organic suspicion across the village:

| Townsfolk Role & Public Look | Daily Job Loop | Evolution A (Outlaw / Cult / Shadow Pivot) | Evolution B (Crisis / Authority Pivot) |
|---|---|---|---|
| 1. The Baker (look: "baker") | Hauls flour from the morning train, kneads dough at bakery, and bakes morning Wake Loaves (granting stamina/warmth). Can bake "Rumor Loaves"—slipping written notes or clues inside bread to pass secretly to the Detective. | The Fence (Trigger: Bandit robs the Bakery and leaves a coin tip) Pockets the Bandit's gold and joins the outlaw underground. Can bake spare .45 bullets, lockpicks, and stolen Chapel gold inside loaves to smuggle past Police, sharing the Bandit's win. | The Ration Tyrant (Trigger: Mill is burned OR Train tracks are dynamited) Flour shipments halt and famine hits. Controls the only food left in town; starving players and NPCs must pay heavy bribes or perform favors just to get a crust of bread. |
| 2. The Postmaster (look: "postmaster") | Hauls mail sacks from the train to post_office and delivers letters. At their desk, plays the Steaming the Envelope mini-game over a kettle to read town secrets without breaking the wax seal. | The Handler / Postmaster Assassin (Trigger: Steams open the Hitman Contract before delivering it) Either delivers the letter to become The Handler (spying on the target to share the Hitman's win), OR burns the envelope, takes the weapon, and becomes The Postmaster Assassin solo. | The Extortionist (Trigger: Steams open 3 pieces of incriminating gossip/clues) Armed with everyone's dirty laundry, sends blackmail notes forcing targets to vote their way during a Tribunal—or have their secrets printed in the morning HollowMere Gazette. |
| 3. The Undertaker (look: "undertaker") | Pushes the wooden hearse cart through town, bagging corpses and bringing them to the Morgue before NPCs panic. Can rifle through corpses' pockets for loose scrip. | The Grave Robber (Trigger: Finds the murdered Vicar's body before anyone reports it) Seals the Vicar's corpse inside a lead-lined coffin and buries it. This locks in the Zealot's Skin-Walk permanently until the grave is dug up, allying the Undertaker with the Zealot's cult. | The Chief Coroner (Trigger: Delivers 2 un-looted bodies directly to Law Enforcement) Deputized by Law Enforcement. Unlocks the Forensic Autopsy scalpel kit (revealing exact killer archetype + time of death within +/- 15s) and carries smelling salts to revive a mortally wounded player once. |
| 4. The Saloon Bartender (look: "bartender") | Runs tavern_bar, pouring drinks that apply real status buffs/debuffs: • Rotgut Whiskey: Blurs vision, masks footsteps. • Liquid Courage: Immune to Vicar/Zealot prayers for 120s. • Loose Lips Lager: Forces drinker to mumble a clue or drop a pocketed item. | The Union Boss (Trigger: Activist completes a Workplace Disarray objective) Unlocks the Saloon's secret cellar portals (tavern_cellar) to shelter the Activist and commands rowdy, drunken NPCs to start bar-brawls that body-block Police Officers. | The Vigilante (Trigger: Bandit robs the Chapel or Bank) Unlocks the sawed-off shotgun mounted behind the bar (2 shells). If they gun down the Bandit, they claim the bounty and win; if they shoot an innocent citizen, the Police arrest them on sight. |
| 5. The Company Clerk (look: "clerk") | The Baron's despised bureaucrat. Walks the town collecting rent from the Bakery and Saloon, locking scrip in bank_vault, and operating the station telegraph. | The Embezzler (Trigger: Bank Vault is robbed while rent reserves are high) Uses the chaos of the Bandit's or Activist's heist to cook the books. Stashes a briefcase of Baron cash under their coat and tries to board the next train before the Detective audits the ledgers. | The Baron's Heir (Trigger: Baron arrives on the train and Clerk protects him until nightfall) Field-promoted by the grateful Baron. Gains command of armed Pinkerton guard NPCs and the power to declare Martial Law (curfew lock on all house doors). |

#### 8. Conditional World-State Transformations

Any player—or the town itself—can undergo sudden systemic transformations when environmental or ideological conditions collide:
 * The Apostate (Condition: A player is converted to "Religious" by the Vicar, and then reconverted to baseline by the disguised Zealot): Having their soul tugged between heaven and hell snaps their mind. They become The Apostate—immune to all prayers, able to see a faint dark aura (Visibility.ts private view tag) around Minions and Cultists, and armed with a rusted pitchfork to hunt down both religious factions.
 * The Stowaway (Condition: Sneaking into a freight crate while the Train is docked): Hides aboard the locomotive, reading the Baron's private cargo manifest (which reveals which Killer Vendettas are active in the match) and pilfering experimental railroad gear (flare guns or smoke bombs).
 * The Starving (Condition: Both the Bakery and the Train supplies are robbed/destroyed in the same day): Un-evolved passive roles are driven mad by hunger, gaining feral movement speed (+15%) and the ability to mug other players in dark alleys for food and items.

#### 9. Tactile Mini-Games & Vulnerability Design

In HollowMere, every high-stakes action is a tactile mini-game built around two strict rules: Physicality (it feels like the actual frontier craft) and Vulnerability (it renders as a center-screen Picture-in-Picture overlay while the live isometric world continues running behind a translucent frosted-glass/steam border—making you watch for approaching silhouettes and listen for footsteps):
 * Picking the Lock (Bandit / Stowaway): Rotating a tension wrench and lifting brass tumblers (CratesModel / tumbler extension) by listening to subtle metallic clicks—while watching the door's frosted glass backdrop for approaching shadows. Failing snaps the pick with a loud PING! (noise emission).
 * Steaming the Envelope (Postmaster): Holding a sealed letter over a boiling kettle (PourModel / thermal band gauge) just long enough to melt the wax without scorching the paper—or getting caught by a customer walking through the front bell-door.
 * Kneading & Stuffing the Wake Loaf (Baker / Fence): A rhythmic push-and-fold motion to rise the dough, with a quick sleight-of-hand window to slip a rumor note, a gold coin, or a .45 cartridge inside before sliding it into the cast-iron oven (SlideModel).
 * Wiring the Plunger (Activist): Twisting red and black blasting wires onto dynamite sticks while sparks travel down the fuse—requiring steady cursor/stick control so your hands don't shake and detonate it early.
 * Forensic Autopsy (Detective / Chief Coroner): Pulling back a canvas morgue sheet and using tweezers to extract a deformed lead slug or poison trace from a wound, matching its rifling grooves or chemical burn against a reference chart.

### BOOK II: ONE NIGHT ULTIMATE BAGUETTE (ONUB) — THE DUAL-FORMAT BIBLE

How the Two ONUB Formats Coexist: In the @wdi architecture, One Night Ultimate Baguette operates in two distinct, complementary modes that share the same sourdough lore, character cast, and Nano Banana Pro / Higgsfield art library (A64, A79):
 * Format A — Crumb's Ovens Quick Mode (mode: "onub"): The fast-paced 8–10 minute one-night wrapper played inside the Bakery (Prep & Station Mini-Games → Dark Loft Night Windows → 300s Morning Rush & Cracking of the Crust).
 * Format B — Port-au-Levain Full Campaign (mode: "main", map: "port_au_levain"): The full multi-phase spatial island campaign where players walk the coastal commune, execute the Four Sour-Practices, and face the 3-Stage Guild Inquisition.

#### FORMAT A: Crumb's Ovens Quick Mode (mode: "onub")

(Shipped Round 5 Architecture — 8 to 10 Minutes, One Night, One Vote)
 * The Evening Prep & The 4 Bakery Stations: Players enter Crumb's Ovens holding their secret dealt Role Card (Team Baker, Team Mold—Spore, Levain, Apprenti, Rat—or solo cards like The Debtor / Croissant). Each player visits one of four stations (Flour Silo, Mixing Vat, Proofing Cabinet, Brick Oven), completes its tactile mini-game (CratesModel, PourModel, SlideModel, StokeModel), and commits an Ingredient Card to the station pile (clean or sabotaged; reaching ruin.weightByCount ruins the dough). Visiting the Proofing Cabinet grants a private peek at a Pantry Location card.
 * The Dark Loft & The Conductor's Night Windows: At Night, all players lie on bedrolls in the Dark Loft (LOFT_SCENE_ID = 'loft'). Ambient storm rain (storm.ogg) and randomized local floorboard creaks (creak.ogg) mask timing leaks while the public Narrator calls each role window in the deck (Tourrier, Sin-Eater, Cutpurse, Sot, Poisoner, etc.). Wakers act on the Wake Table plates and the three Dead Loaves in the Pantry without knowing what swaps occur after their window closes.
 * The 300-Second Morning Rush & CRUST: At Dawn, players post station/role Claims, deduce how the loaves shifted across the night, and call CRUST (timers.crustCountdownS = 3s). With no Skip and no self-votes, whoever receives the plurality of votes (minimum minVotesToTurnOut) has their loaf cracked open (loaf_crack.ogg). The loaf sitting on your plate at dawn is who you are.

#### FORMAT B: Port-au-Levain — The Full Island Campaign (map: "port_au_levain")

##### 1. The Opening Cinematic

[VISUAL & AUDIO CUE] The screen is cloaked in thick, swirling sea fog. We hear the mournful groan of a brass foghorn across open water, the hiss of subterranean geothermal steam vents, and the gentle clink of silver cloches (amb_levain.ogg, storm.ogg). A towering lighthouse beam sweeps across the 2:1 dimetric wet cobblestones, illuminating a carved stone arch that reads: PORT-AU-LEVAIN — BY DECREE OF THE SOVEREIGN SOURDOUGH COUNCIL.

[NARRATOR]

> "Out here beyond the reef, bread isn't just food. It's law, it's lineage, and it's life.
> Four hundred years ago, the Master Bakers brought the Mother of Mothers to this rock—a living sourdough starter fed by volcanic steam and guarded like crown gold. Every soul on Port-au-Levain has a silver platter in the Great Hearth, and every platter holds a personal Wake Loaf stamped with your guild seal.
> (The camera glides past the rotating Windmill Cliffs, the glowing glass vats of the Subterranean Yeast Vault, and the shadowy crates of Smuggler's Wharf.)
> By day, we mill the grain, pay our yeast-tax, and bow to the Inquisitors. But when the Morning Ferry casts off and the sea fog swallows the lamps... the fermentation turns sour.
> There's wild green mold creeping up from the salt-flats, waiting to rot the Abbot's starter from the inside out. There's a disgraced builder rigging the steam-boilers to blow the Guild Hall sky-high. There's a smuggler in the Hall of Platters swapping loaves under the cloches to frame an innocent baker for the gallows. And a postal pigeon just landed in the loft with a vial of nightshade glaze.
> (A heavy brass proofing bell tolls once, followed by the crisp crack of baked crust (loaf_crack.ogg).)
> Guard your starter. Weigh your platter. Because when the six o'clock bell rings and the cloches are lifted... the loaf sitting on your silver plate at dawn is who you are."

##### 2. The Setting & Atmosphere: Port-au-Levain
 * The Concept: Port-au-Levain is a fog-choked, coastal island commune isolated from the mainland, entirely governed by The Sovereign Sourdough Council. Life here is dictated by the science of wild yeast, the heat of subterranean steam vents, and the strict hierarchy of the Master Bakers' Guild.
 * The Anchor Points (The Island Geography):
   * The Great Hearth & Hall of Platters (The Center): Where every citizen's personal Wake Loaf rests under a cloche on a rotating silver platter (pl.platter_0..9).
   * The Windmill Cliffs (North): Where raw grain is milled and the island's weather vane dictates maritime shipping.
   * The Subterranean Yeast Vault (Deep Basement): A humid, echoing cavern where the Mother of Mothers (a 400-year-old sourdough starter) is kept alive in a pressurized glass vat.
   * The Salt-Flats & Smuggler's Wharf (East Dock): Where the daily tide and Morning Ferry bring contraband, foreign spices, and dangerous outsiders.
   * The Alchemist-Herbalist's Apothecary (West): Where botanical flavorings, toxic alkaloids, and fermentation accelerators are brewed.
   * The Gallows Square: Where the High Chancellor presides over the Morning Judgment around the Great Hearth.

##### 3. The Killer Archetypes (The Four Sour-Practices)

Instead of generic killers, Port-au-Levain features four deeply thematic factions of disruption that map directly onto the @wdi Vendetta Engine:
 * THE LEAVEN-ROT (The Contamination Threat — Conversion Vendetta):
   * The Lore: A fanatic sect of agrarian purists who believe the Grand Guild's industrial yeast has cursed the island. They want to bring the old, wild mold back.
   * The Target: The Abbot of the Crust (a holy figure who walks the island blessing loaves with Apostolic Starter to purify the commune).
   * The Killer Mechanic: The Leaven-Rot killer must assassinate the Abbot before the Abbot cleanses the island's flour supply.
   * The Disguise & The Feral Converted: Once the Abbot is murdered and hidden in the Salt-Flats, the Leaven-Rot killer dons the Abbot's burlap cowl (Skin-Walk tethered to the Abbot's unreported corpse). While disguised, they can "bless" players who have been touched by the Abbot, transforming them into specialized Guild-Heretics:
     * The Spore-Caller (Herald): Plants subterranean fungal landmines on building thresholds that disrupt movement and reveal footsteps in glowing green mold (clue_footprint_glow).
     * The Groat-Master (Enforcer): Infiltrates the Windmill to halt grain production, choking town stamina and shaking down guild clerks.
     * The Cellar-Ghoul (Corpse-Keeper): Patrols the sub-basement and Salt-Flats to relocate and guard the hidden body of the Abbot without leaving drag trails.
     * The Arch-Fermenter (High Priest): Retains conversion power even if the Abbot's corpse is found, and leads the Wild Sourdough Rite (15-second chant with 6 gathered heretics/entranced citizens and 5 spore-marked buildings) at the Deep Yeast Vault Altar to trigger a faction win.
 * THE PYRE-MASTER (The Industrial Saboteur — Sabotage Vendetta):
   * The Lore: A disgraced master builder who wants to burn the Guild's monolithic monopoly to ash so he can rebuild the island's ovens under his own architectural code.
   * Phase 1 (3 Sabotage Operations): Must complete up to three major sabotages across the island—Blowing the Steam-Boilers, Rupturing the Gas-Lines, and Sealing the Windmill Blades (completing all 3 unlocks Recruitment of rioting apprentices, Influence vote immunity, and Espionage proximity alerts).
   * Phase 2 & 3 (The Ferry Climax & Platter Trial Twist): Once infrastructure is crippled, the Grand Inspector-General arrives on the Morning Ferry. The Pyre-Master must assassinate him during a coastal fog blackout, triggering an immediate emergency tribunal where they must use their built-up Influence or a clever platter-swap to survive the dawn execution and redeem themselves into a Guild Citizen.
 * THE SMUGGLER-BLACKGUARD (The Syndicate Outlaw — Heist Vendetta):
   * The Lore: A ruthless sea-dog operating out of the Salt-Flats who doesn't care about ideology—he wants the Island Treasury, the Guild's rare spice reserves, and an open ticket off Port-au-Levain.
   * The 4-Stage Heist Checklist:
     * Rob the Wharf: Crack the customs crate at the East Dock (leaving a silver piece for the Master Proof-Reader).
     * Rob the Apothecary: Steal the rare saffron and alkaloid vials.
     * Rob the Counting-House Vault: Crack the Guild's gold reserve.
     * Hijack the Dawn Ferry (Victory): Blow the ferry captain's strongbox and sail off the island.
   * The Pocket-Mortar & The Baker's Swap: Armed with a concealable Flintlock Pocket-Mortar with scarce, craftable black-powder ammunition (and Outlaw Anonymity until shackled). Crucially, the Smuggler can sneak into the Hall of Platters at night and physically lift and swap Wake Loaves between silver platters—hiding stolen guild seals inside innocent citizens' bread to frame them at Dawn.
 * THE BLACK-CRUST CONTRACT (The Mail-Order Assassin — Contract Vendetta):
   * The Lore: A shadowy assassin whose commission arrives anonymously via the morning postal pigeon in a black-waxed cylinder slipped into a random citizen's station slot (StreamName: "contract").
   * The Mechanic: No one starts as Port-au-Levain's contract killer. A passive citizen who accepts the commission receives a vial of Nightshade Glaze and a high-profile target. They must either poison the target directly or paint the target's personal Wake Loaf in the Hall of Platters before Dawn, then extract on the Morning Ferry.

##### 4. The Townsfolk (Proprietary Guild Roles & Evolutions)

| Guild Role & Station | Daily Job & Signature Ability | Branching Evolutions (Triggered by Sour-Practices) |
|---|---|---|
| 1. The Master Proof-Reader (Hall of Platters & Archive) | Manages island records and oversees Wake Loaf integrity. Density Audit: Weighs any loaf at night, revealing whether its mass was altered by tampering, foreign objects, or platter swaps. | • Evolution A — The Black-Market Baker: Triggered when the Smuggler tips the Hall; bakes contraband and flintlock balls into loaves. • Evolution B — The Archivist: Triggered after auditing 3 tampered loaves; blackmails suspects during the Dawn Tribunal. |
| 2. The Spice-Master (The Apothecary) | Brews botanical extracts, sleep-drafts, and culinary varnishes. Bitter-Citron Oil: Coats a platter cloche so the next person who lifts or swaps it gets their hands stained bright yellow (StatusBit marker) for the rest of the night. | • Evolution A — The Toxicologist: Collaborates with or usurps the Black-Crust Contract using refined Nightshade. • Evolution B — The Alchemical Purifier: Brews anti-spore draughts that immunize citizens against the Leaven-Rot's blessings. |
| 3. The Tide-Watcher (The Wharf & Lighthouse) | Monitors incoming cargo ships, weather fronts, and perimeter movement. Lighthouse Sweep: Sweeps the island in a high-intensity arc of light from the tower, blinding outdoor players and exposing anyone dragging a corpse across the cobblestones. | • Evolution A — The Wreck-Looter: Uses coastal fog blackouts to falsify shipping manifests and loot the Wharf. • Evolution B — The Harbor Master: Locks down the Ferry gangplank and deputizes dockhands when the Grand Inspector arrives. |
| 4. The Hearth-Warden (The Port Tavern) | Keeps the peace among rowdy guild apprentices and sailors with an iron fire-poker. Mancuff Chains: Can lock tavern doors, break up brawls, and shackle a suspect to a stone pillar until the morning bell. | • Evolution A — The Mutiny Boss: Shelters the Pyre-Master in the tavern rum-cellar and rallies apprentices to riot. • Evolution B — The Ironside: Unlocks the harpoon gun behind the bar when the Smuggler robs the Apothecary or Vault. |
| 5. The Ledger-Clerk (Counting-House & Bank) | Manages island taxes, payroll, and vault security. Deadbolt Control: Controls the physical iron deadbolts on industrial buildings, reinforcing doors against sabotage. | • Evolution A — The Customs Embezzler: Cooks the Guild ledgers during a Vault robbery and flees on the Dawn Ferry. • Evolution B — The Council Regent: Promoted if the Grand Inspector-General survives the night, gaining island-wide lockdown authority. |

##### 5. The 3-Stage Guild Inquisition (Law Enforcement)
 * Stage 1 — The Inquisitor-In-Training (The Investigator): Explores crime scenes with a Magnesium Powder Kit and Ledger Lens to lift flour-dust bootprints (Footprints), apron threads (Thread), cap felt (Felt), and scorch/spore traces. Compiling a verified Indictment Dossier evolves them into Stage 2.
 * Stage 2 — The Guild Bailiff (The Apprehender): Patrols the island with a heavy iron staff and brass shackles, capable of tackling suspects, surviving one ambush, and locking down districts during the night cycle. Cuffing the prime suspect and bringing them to Gallows Square evolves them into Stage 3.
 * Stage 3 — The High Chancellor (The Judge): Presides over the Dawn Tribunal. Lays out the physical evidence on the communal trial table, orders all platter cloches lifted, and casts the weighted binding sentence (Acquittal, Guild Fine, or Trial by Fire in the Great Hearth).

##### 6. The Flow: A Full Campaign Night in Port-au-Levain
 * Dusk (The Seating): The Ferry departs. Players take their stations, verify their initial identity seals in the Hall of Platters, and lay their strategies.
 * Midnight (The Proofing Bell Rings): The island plunges into darkness. Killers stalk their targets across the docks, cliffs, and yeast vault. Townsfolk run their night abilities, and the high-stakes game of platter swapping, bitter-citron staining, and bread-tampering unfolds in the Hall of Platters.
 * The Witching Hour (The Sea Fog Blackout): A dense coastal fog rolls in (vision reduced to arm's length). Alarms ring out from the Windmill or the Vault as a sabotage plot goes live.
 * Dawn (The Cracking of the Crust): The Great Proofing Bell strikes six. All surviving souls gather at the Grand Hearth. Every player cracks open the loaf sitting on their platter—revealing whether their identity was swapped or framed in the dark—before the High Chancellor's gavel drops.

### BOOK III: BLACKPINE — THE TIMBER & COAL SYNDICATE

(Primary Map ID: map: "blackpine" | Aesthetic: Soot-Stained Industrial Extraction | Render Modes: 8bit & lowpoly)

#### 1. The Setting & Atmosphere: BlackPine
 * The Concept: BlackPine is a brutal, soot-choked industrial extraction camp carved deep into an ancient, towering pine forest. The economy and survival of everyone here are governed entirely by The Timber & Coal Syndicate. Life is measured in cord-feet of lumber hauled, tons of anthracite extracted from the mountain shafts, and the rhythmic, ear-splitting shriek of the massive steam-powered circular saws.
 * The Atmosphere: The air tastes of coal dust and pine resin. The sky is perpetually stained gray by industrial smokestacks and forest burn-offs. In BlackPine, wood and fire are everything—they fuel the engines, heat the bunkhouses, and build the coffins.
 * The Anchor Points (The 8-Scene Industrial Graph from 5J & 5K):
   * The Great Sawmill & Log Sorting Yard (The Center): Where the colossal vertical and circular head-saws (bp.head_saw) operate, and where every citizen's personal Tally Log (Identity Log) rests on a heavy timber sorting rack (bp.tally_0..9).
   * The Deep Coal Mines & Pit-Head (North): A labyrinth of dark, gas-leaking shafts stretching deep beneath the mountain where miners work in pitch blackness.
   * The Company Store & Ledger Office (East): Where rations, dynamite, pickaxes, and black-market contraband are bought and sold using company scrip.
   * The Iron Foundry & Boiler House (West): The roaring industrial furnace room (bp.forge, bp.kilns) that provides steam power to the entire camp via massive piston engines and high-pressure steam valves.
   * The Bunkhouse & Mess Hall (South): Where exhausted workers sleep shoulder-to-shoulder (bp.bunks), eat at the long trestles (bp.mess_table), trade gossip, and muster for roll call.
   * The Widow-Maker Ridge (The Outskirts): A steep logging slope filled with unstable timber stacks, deep ravines, and the dense, shadowed pine forest where loggers go missing.

#### 2. The Opening Cinematic

[VISUAL & AUDIO CUE] The screen is pitch black. We hear the heavy, metallic chug of a steam piston, followed by the terrifying, high-pitched whine of a massive circular saw biting into green timber (amb_blackpine.ogg, creak.ogg, storm.ogg). A furnace door flies open, casting a harsh, flickering orange glow across a soot-covered wall sign that reads: BLACKPINE — TIMBER & COAL SYNDICATE. 'PRODUCTION IS OBLIGATION.'

[NARRATOR]

> "They tell you when you sign your contract at the intake office: in BlackPine, you're either feeding the furnace or you're fuel.
> Up here on the ridge, the Syndicate owns the axes, the tracks, the coal seams, and the dirt your bones will eventually rot in. The only thing standing between a logger and a shallow grave is his tally log.
> (The isometric camera pans across the roaring Sawmill, the smoke-belching Boiler House, the dark maw of the Coal Mine, and the rows of identical bunkhouses.)
> In the heart of the sorting yard sits the Tally Rack. Ten numbered pine billets. Ten Identity Logs, branded with your job, your debts, and your sins.
> By day, we swing axes, grease the steam lines, and watch our fingers around the blade. But when the night shift bell rings and the coal smoke settles heavy over the valley... the woods get quiet.
> Because something out there in the black pines isn't cutting trees. There's a timber-beast hunting men in the dark. There's an explosives expert rigging the mine shafts to bring the mountain down. There's a union-breaker with a loaded rifle and a ledger full of blood money. And down in the deep adits, a black-powder contract just arrived for the man who thinks he's safe in his bunk.
> (A heavy iron furnace door slams shut (door_close.ogg), followed by the crisp, ominous sound of an axe splitting dry pine (stamp.ogg).)
> Watch your blind spots. Keep your lantern lit. Because when the morning whistle blows and the tally logs are checked... the log on your rack at dawn is who you are."

[TRANSITION TO GAMEPLAY] The deep, multi-tone steam whistle blows WHOOO-OOO-OO! The heavy industrial arc-lights flicker on, and each player's secret Identity Log (and Cover Look selector) drops onto the screen with the sharp, sizzling thud of a branding iron.

#### 3. BlackPine's 5 Exclusive Industrial Mechanics

To make BlackPine feel tactically distinct from both HollowMere and Port-au-Levain, five proprietary environmental systems are wired directly into the BlackPine map:
 * The Carbon-Soot Tracking & Lung-Rot System (Environmental Stealth & Health):
   In a coal mine and sawmill, you cannot hide your physical footprint. Every action generates Soot Exposure (PlayerSim.sootTicks):
   * Carbon-Soot Smudges: Moving through the deep coal shafts, stoking the foundry boilers, or running through pine smoke coats your character in physical carbon soot. If you sneak into someone else's bunkhouse or tamper with the Tally Rack while sooty, you leave black smudge prints (clue_soot_smudge) on wooden logs and doorframes that decay slowly over time.
   * Lung-Rot & Coughing Fits: Staying too long in unventilated mine shafts fills your Lung-Rot Meter (PlayerSim.lungRotTicks). If it maxes out, your character suffers periodic coughing fits that emit an audible noise ring and shake your camera, giving away your hiding spot (H). To clear Lung-Rot, you must visit the Company Doctor at the Infirmary for an oxygen tonic—forcing killers and investigators to time their stealth around their physical lungs.
 * The Steam-Line Pressure Network (Interactive Map Wiring):
   Unlike static doors, BlackPine runs on a camp-wide physical Steam Piston & Valve Network managed from the Iron Foundry:
   * The Mechanic: High-pressure steam pipes run underground from the Foundry to every building in camp (Sawmill, Company Store, Bunkhouse, Mine Lift). Outside and inside each building sits an interactive Steam Valve (bp.valve_[scene]).
   * For Saboteurs & Killers: You can over-pressurize a building's exterior valve, causing the pipes inside to screech and burst scalding steam—dealing continuous burn damage and flushing every occupant (including players hidden inside H spots) out through the doors.
   * For Defenders: You can vent controlled steam into a room to instantly clear out miasma or smoke clouds, or cut steam pressure to the Mine Lift to temporarily trap a killer underground.
 * The Dynamic Tally-Rack Weight & Wood-Carving System (Tactile Identity Framing):
   Instead of abstractly swapping cards, altering your identity in BlackPine is a physical woodworking trade-off on the Tally Rack (bp.tally_0..9):
   * Carving & Counterfeiting: Every player's Tally Log is a physical billet branded with their ID and job. If you carry a pocketknife or work at the Sawmill bench, you can spend a 30-second mini-game carving a false brand into a blank billet to counterfeit someone else's serial number.
   * The Wood-Density Consequence: Different camp jobs use different wood densities (Heavy Oak for a Miner, Medium Fir for a Boilerman, Light Pine for a Tallyman). If the Company Enforcer or a saboteur swaps a heavy oak log into a light pine slot on the rack, the physical balance of the rack shifts. An observant Head Tallyman or Camp Investigator can check the rack's balance scale (Grain-Density Check) and immediately deduce which slots were swapped in the dark.
 * Explosive Cargo & Dynamite Rail Physics (Environmental Weaponry):
   BlackPine runs on black powder and nitroglycerin, turning the camp's narrow-gauge rail lines into a kinetic weapon:
   * Rolling Coal-Cart Bombs: Dynamite sticks, blasting caps, and mine carts are physical entities. Players can load dynamite into an empty coal cart, light the fuse, and send it rolling down the tracks straight into the Sawmill or Company Store.
   * Kinetic Chain-Reaction: If a player is carrying unstable dynamite or nitroglycerin in their inventory when they take a rifle round from the Company Enforcer or Mine Warden, the bullet impact triggers an instant 2.5-tile (15-foot) explosion—killing the carrier and anyone standing nearby.
 * The Shift-Whistle & Bunkhouse Roll Call (Time-Pressure Alibi Check):
   Instead of relying solely on emergency bell pulls, BlackPine's pacing is enforced by the brutal discipline of an industrial shift schedule:
   * The Midnight Roll Call: When the Foundry's massive steam whistle blows for the Midnight Roll Call, a 15-second countdown begins. Every living worker must sprint back to the Bunkhouse (bunkhouse) and stand beside their assigned bunk (bp.bunk_[slot]) before the whistle stops.
   * The Killer's Dilemma: If a killer is deep in the Coal Mine dragging a corpse or out on Widow-Maker Ridge planting dynamite when the whistle blows, they cannot make it back in 15 seconds. Missing Roll Call triggers a camp-wide searchlight alert, publicly flagging the missing bunk slots and unleashing the Mine Warden, Order Enforcement Agents (OEAs), and guard dogs to hunt anyone caught out of bounds.

#### 4. The Killer Archetypes (The Four Industrial Vendettas)
 * THE TIMBER-WOLF (The Feral Forest Predator — Conversion Vendetta):
   * The Lore: A legendary apex predator—part man, part forest beast—that stalks the logging camps, driven by a primal hatred of the steel axes cutting down the ancient pines.
   * The Target: The Forest Chaplain (a backcountry preacher who walks the logging trails blessing workers with Resin-Seal to protect their minds from the wild).
   * The Skin-Walk & Pack Evolution: Once the Chaplain is slaughtered and his corpse dragged deep into the Widow-Maker pine thicket, the Timber-Wolf dons the Chaplain's blood-stained clerical collar (Skin-Walk active while the Chaplain's body remains unreported/unburied). While disguised, the Wolf "blesses" workers, corrupting them into feral Pack Members:
     * The Timber-Stalker (Scout): Moves silently through high log stacks and forest brush without leaving muddy bootprints or triggering twigs.
     * The Pit-Fiend (Enforcer): Patrols the coal mine shafts, laying tripwires that collapse wooden support beams and shaking down isolated miners.
     * The Den-Keeper (Corpse-Keeper): Relocates and guards the Chaplain's body in the deep woods, placing bone-chime perimeter alerts.
     * The Alpha-Born (High Priest): Retains pack-conversion power even if the Chaplain's body is discovered, and leads the final Blood-Moon Howl ritual (5 claw-marked buildings + 6 pack members chanting for 15s on Widow-Maker Ridge) for a pack victory.
 * THE SLATE-BREAKER (The Industrial Saboteur — Sabotage Vendetta):
   * The Lore: A radical union organizer turned violent extremist who wants to detonate BlackPine's infrastructure and force the Syndicate off the mountain.
   * Phase 1 (3 Catastrophic Sabotages): Must complete up to three industrial operations—Rupturing the Steam-Boiler Main, Firing the Coal-Seam Dust, and Dynamiting the Trestle Bridge (all 3 unlock Recruitment of rioting loggers, Influence vote protection, and Espionage).
   * Phase 2 & 3 (The Inspector's Arrival & Trial Twist): Once the sabotage chain triggers unrest, the Syndicate Inspector-General arrives on the payroll line. The Slate-Breaker must assassinate him during an industrial steam blackout, then survive the immediate Dawn Tribunal through Influence or a carved Tally Log alibi to win redemption as a free worker.
 * THE COMPANY ENFORCER (The Syndicate Gunman — Heist/Acquisition Vendetta):
   * The Lore: A cold-blooded corporate hitman sent by the absentee owners to clean house, silence union talk, and seize the camp's gold and scrip reserves for himself.
   * The 4-Stage Acquisition Checklist:
     * Seize the Company Store Ledger (leaving a scrip kickback on the counter).
     * Raid the Mine Office Safe.
     * Crack the Foundry Vault.
     * Hijack the Payroll Train (Victory).
   * Winchester Rifle & Tally Log Swapper: Armed with a lever-action Winchester Rifle firing .45-70 cartridges with limited, craftable ammo (and immune to normal voting until cuffed by the Mine Warden). At night, the Enforcer sneaks into the Great Sawmill and physically swaps branded Identity Logs on the Tally Rack, framing innocent loggers for his shootings so they face the Sawmill blade at Dawn.
 * THE PIT-POISONER (The Black-Powder Contract — Contract Vendetta):
   * The Lore: A silent saboteur working for rival coal barons across the valley, commissioned anonymously via a ciphered slip dropped into a passive worker's lunchbox (StreamName: "contract").
   * The Mechanic: Accepts the contract mid-match without changing their public Avatar.look, receiving a vial of Cyanide Sludge to poison their assigned target's water canteen or contaminate their Tally Log before extracting on the morning train.

#### 5. The Townsfolk (BlackPine's Industrial Roles & Evolutions)

| Industrial Role & Station | Daily Job & Signature Ability | Branching Evolutions (Triggered by Camp Crisis) |
|---|---|---|
| 1. The Head Tallyman (Great Sawmill & Tally Rack) | Oversees production quotas and maintains the 10 Identity Logs. Grain-Density Check: Weighs any tally log at night to detect if it was carved, counterfeited, or swapped into the wrong wood-density slot. | • Evolution A — The Counterfeiter: Pockets the Enforcer's kickback and carves flawless fake serial brands for the outlaw. • Evolution B — The Quota Boss: Uses audit records to blackmail workers during the Dawn Tribunal. |
| 2. The Powder-Monkey (Dynamite Shed & Quarry) | Manages blasting caps, black powder, and nitroglycerin. Blasting Cap Trap: Rigs a door handle or tally rack latch with a dye-cap that stains the hands of the next tamperer with indelible red grease paint. | • Evolution A — The Demolitionist: Supplies the Slate-Breaker or Enforcer with primed coal-cart bombs. • Evolution B — The Ordnance Master: Disarms wired charges and crafts non-lethal flash-caps for Law Enforcement. |
| 3. The Scaler (Widow-Maker Ridge & Trails) | Measures timber volume and tracks movement in the pines. Surveyor's Scope: Scans the camp from the high ridge at night, spotting anyone carrying a long-gun or dragging a corpse across open ground. | • Evolution A — The Poacher: Uses the ridge blind spots to smuggle contraband off-camp. • Evolution B — The Ridge Tracker: Marks feral Timber-Wolf trails so the Mine Warden can hunt them in the dark. |
| 4. The Boilerman (Iron Foundry & Boiler House) | Maintains the steam engines powering the saws and lifts. Steam Venting: Remotely vents or equalizes high-pressure steam in any building's pipe network, clearing miasma or scorching hidden intruders. | • Evolution A — The Saboteur's Stoker: Secretly routes over-pressure steam to cover the Slate-Breaker's escapes. • Evolution B — The Iron Master: Locks down the Mine Lift and Foundry doors during a camp alert. |
| 5. The Company Doctor (Camp Infirmary & Morgue) | Treats crush injuries, burns, and Lung-Rot (Oxygen Tonic). Ballistic & Industrial Autopsy: Inspects corpses brought to the infirmary to determine exact cause of death (wolf bite, .45-70 rifle slug, steam burn, cyanide) and time of death. | • Evolution A — The Back-Alley Sawbones: Hides the Forest Chaplain's body in the lime pit to protect the Timber-Wolf's disguise. • Evolution B — The Chief Surgeon: Deputized by the Camp Investigator after 2 clean autopsies; carries adrenaline to revive a dying worker. |

#### 6. Law Enforcement: The 3-Stage Syndicate Inquisition
 * Stage 1 — The Camp Investigator (The Detective): Uses a Soot-Dust Kit and Ledger Magnifier to lift coal-dust thumbprints, wood-chip residue, and 3-trait clues from crime scenes. Verifying a suspect's Case File evolves them into Stage 2.
 * Stage 2 — The Mine Warden (The Police Officer): Armed with heavy iron restraints, a non-lethal coal-slug riot gun, and a brass horn to tackle fugitives and lock down the Sawmill and Mine adits. Cuffing the suspect and hauling them to the Sawmill platform evolves them into Stage 3.
 * Stage 3 — The Circuit Judge (The Judge): Presides over the Dawn Tribunal at the Great Sawmill platform, laying out the verified Case File, ordering all 10 Tally Logs weighed and inspected, and delivering the final verdict (Acquittal, Scrip Forfeiture, or The Great Sawmill Blade).

### BOOK IV: THE MACRO-ECONOMY, DEFLECTION LOOP & HQ TREES

To eliminate "dead air before the first murder" and turn Who Did It into a relentless psychological survival game, every match layers Civilization VI-style macro-resource loops and a Fungible Deflection Economy directly onto the 20 Hz isometric simulation.

#### 1. The 4 Pillars of the Macro-Economy
 * Faith (Spiritual / Ideological Capital): Generated through church attendance, confessions, and Vicar/Abbot/Chaplain channels. Used to buy passive group protections, ward off cult conversions, or fund zealot/clerical super-abilities.
 * Scrip / Money (Economic Capital): Earned via daily train trade, baker sales, bank deposits, and heists. Used to buy tools, pay mandatory taxes/quotas, hire guards, and pay off tribunal fines—acting as a survival clock against starvation and execution.
 * Rumor & Public Opinion (Diplomatic Capital): Generated via intercepted post-office mail, pigeon cylinders, shift slips, and morning newspapers. Unchecked rumors harden into official Indictments, forcing public trials.
 * Status & HQ Expansion (Production / Territory Capital): Players invest Scrip and raw materials (flour, timber, coal) into expanding their role-specific station through 3 tiers, unlocking powerful passive skill trees.

#### 2. The Fungible Currency Web & The Deflection Loop

In a company town, a secret, a coin, a prayer, and a blackmail notice are completely interchangeable liquid assets driven by a single directive: Deflect harm onto someone else before the tax collector knocks, the mail is leaked, or the tribunal convenes.

```
[ SECRET LETTER ] ──(Steam Open)──► [ BLACKMAIL NOTICE ]
                                          │
        ┌─────────────────────────────────┼─────────────────────────────────┐
        ▼                                 ▼                                 ▼
 (Sell at Black Market)          (Bribe Court Jury)          (Convert to Faith/Absolution)
        │                                 │                                 │
        ▼                                 ▼                                 ▼
  [ SCRIP / MONEY ]               [ VOTING SHIELD ]              [ CHURCH SANCTUARY ]
```

 * Scrip ↔ Faith: Donating Scrip to the Chapel/Altar buys Indulgences (Absolution tokens), clearing your name of minor rumors and granting temporary immunity from religious conversion or cult curses.
 * Mail Interception ↔ Scrip: Steaming open letters gives you Blackmail Notices. If you don't want to use them for political leverage, you can fence them anonymously at the back-alley black market for cold Scrip to pay your municipal taxes.
 * Rumors ↔ Voting Leverage: Holding a legal notice or forged indictment against another player gives you control over their vote during emergency meetings or Tribunal trials ("Vote to acquit me, or this notice about your midnight bank visit goes public in tomorrow's Gazette").

Core Deflection Weapons
 * The Blackmail & Legal Notice Loop (Postmaster / Archivist / Quota Boss): When a player intercepts a "Dirty Deed Ledger Slip" (e.g., Player X was seen carrying kerosene near the Mill at dusk), they have three options:
   * Direct Extortion (The Bribe): Demand Scrip in an alley in exchange for destroying the slip.
   * Black Market Fencing: Sell the notice to the Saloon Bartender or Bandit for immediate cash, releasing the rumor anonymously into the economy.
   * The Emergency Shield (Legal Red Herring): Hold the notice in inventory until an emergency meeting points at you, then slam the notice onto the trial table to deflect the town's suspicion onto the named player.
 * The Baker's Rumor Loaves & Scapegoat Economy: By sliding a forged note or someone else's dropped item inside a Wake Loaf and selling it at the market, the Baker forces the buyer to carry the incriminating evidence—leading the Detective's crumb trail straight to an innocent customer.
 * The Ideological Shield (Parish Seals): Players can purchase Parish Seals using Faith and Scrip. When accused in court, presenting a Parish Seal or claiming sanctuary at the Church altar pivots a criminal trial into a heresy debate, forcing the accuser to prove their own piety.

#### 3. Map-Specific Economies, Taxes & 3-Tier HQ Expansion Trees

MAP 1: HOLLOWMERE
 * Currency & Unique Items: Company Scrip; Railyard Dynamite & Blasting Caps; Parish Candles & Incense; Mill Lumber & Kerosene.
 * Paranoia Tax Mechanism (The Company Clerk's Rent): Every midday shift, the Company Clerk collects a mandatory Scrip Tax. Failing to pay applies the Indebted status bit; if unpaid by evening curfew, the Clerk locks your house doors and triggers debtor's prison / forced labor at the Mill.
 * Rumor Pipeline: Morning train mailbags contain Secret Life Ledger Slips. If an intercepted rumor circulates for a full day cycle without being paid off or cleansed at the Confessional, it hardens into an official Tribunal Indictment.
 * Role HQ Expansion Trees:
   * Crumb's Bakery (Baker / Fence): Tier 1 (The Oven): Standard daily Wake Loaf baking. → Tier 2 (The Cooling Racks): Smuggle bullets, lockpicks, and notes inside loaves. → Tier 3 (The Underground Silo): +20% passive stamina regen and immunity to famine/ration tyranny.
   * The Parish Chapel (Vicar / Zealot / Apostates): Tier 1 (The Altar): Baseline Faith generation. → Tier 2 (The Confessional Booth): Anonymously cleanse 1 Rumor per day using Scrip + Faith. → Tier 3 (The Reliquary): Unlocks Divine Shield passive against conversion or assassination.
   * The Post Office (Postmaster / Extortionist): Tier 1 (The Sorting Desk): Standard mail delivery. → Tier 2 (The Steam Kettle Room): Letter interception and blackmail generation. → Tier 3 (The Telegraph Wire): Remote transmission of forged rumors to the morning HollowMere Gazette.
   * The Undertaker's Morgue (Undertaker / Coroner): Tier 1 (The Hearse Cart): Corpse bagging and pocket looting. → Tier 2 (The Embalming Table): Preserves evidence traces and hides lead coffins. → Tier 3 (The Coroner's Lab): Pinpoints exact cause/time of death and synthesizes smelling salts.
   * The Rusty Lantern Saloon (Bartender / Union Boss): Tier 1 (The Taproom): Brews status drinks. → Tier 2 (The Smuggler's Cellar): Opens underground escape portals and back-market fencing. → Tier 3 (The Armory Bar): Mounts the sawed-off shotgun and reinforces bar shutters against riots.
   * The Company Bank (Company Clerk / Embezzler): Tier 1 (The Teller Window): Rent collection and ledger tracking. → Tier 2 (The Time-Lock Vault): Reinforces payroll against heists and enables book-cooking. → Tier 3 (The Pinkerton Telegraph): Summons guard dogs and declares town-wide curfew.
   * The Constable's Office (Law Enforcement): Tier 1 (The Cell Block): Basic handcuffs and holding cells. → Tier 2 (The Armory): Unlocks riot whistles and patrol batons. → Tier 3 (The Magistrate's Bench): Enhances Tribunal evidence weighting and fine collection efficiency.

MAP 2: PORT-AU-LEVAIN
 * Currency & Unique Items: Guild Copper & Yeast Tokens; Apostolic Starter & Wild Spores; Bitter-Citron Oil & Nightshade Glaze; Rare Foreign Spices.
 * Paranoia Tax Mechanism (The Ledger-Clerk's Tariff): Every night at the proofing bell, players must pay a yeast-tax or Copper tribute to keep their platter cloche registered. Failing to pay marks your Wake Loaf as Unregistered, stripping your night-actions and making you a prime target for Dawn execution.
 * Rumor Pipeline: Message pigeons arrive at the Archive carrying ciphered notes on nighttime platter swaps. Leaking them posts them on the Gallows Square bulletin board.
 * Role HQ Expansion Trees:
   * The Hall of Platters & Archive (Master Proof-Reader): Tier 1 (The Rotating Racks): Houses personal Wake Loaves. → Tier 2 (The Density Scales): Automated weight audits on neighbor loaves. → Tier 3 (The Master Codex): Permanent immunity to platter-swap framing.
   * The Alchemist's Apothecary (Spice-Master): Tier 1 (The Boiling Kettle): Basic wake-buff tonics. → Tier 2 (The Varnish Vats): Unlocks Bitter-Citron Oil to brand platter thieves. → Tier 3 (The Master Distillation Lab): Crafts elite nightshade poisons and anti-spore antidotes.
   * The Wharf & Lighthouse (Tide-Watcher): Tier 1 (The Beacon): Basic coastal scanning. → Tier 2 (The Customs Ledger): Tracks imported cargo and smuggler movements. → Tier 3 (The Fresnel Lens Array): Blinds outdoor killers across the entire map during night fog.
   * The Port Tavern (Hearth-Warden): Tier 1 (The Hearth Fire): Warmth buffs and brawl suppression. → Tier 2 (The Pillar Shackles): Detains rowdy suspects overnight. → Tier 3 (The Harpoon Rack): Unlocks heavy coastal defense weapons and cellar tunnels.
   * The Counting-House (Ledger-Clerk): Tier 1 (The Tariff Desk): Collects nightly yeast-taxes. → Tier 2 (The Iron Deadbolts): Remotely reinforces industrial doors. → Tier 3 (The Sovereign Treasury): Grants island-wide lockdown and audit powers.

MAP 3: BLACKPINE
 * Currency & Unique Items: Syndicate Token Scrip; Anthracite Coal & Pine Billets; Blasting Caps & Nitroglycerin; Oxygen Tonics.
 * Paranoia Tax Mechanism (The Head Tallyman's Quota): Every shift change, workers must meet a minimum quota of hauled timber or mined coal. Spending the night sneaking or sabotaging causes you to miss quota, triggering a harsh Scrip Fine and ration deduction that drives starvation.
 * Rumor Pipeline: Grease-stained shift slips dropped in the Bunkhouse or miner lunchboxes are audited by the Head Tallyman and Scaler and pinned to the sorting yard notice board.
 * Role HQ Expansion Trees:
   * The Great Sawmill & Tally Rack (Head Tallyman): Tier 1 (The Sorting Rack): Houses the 10 Identity Logs. → Tier 2 (The Balance Scale): Instantly detects wood-density counterfeiting and log swaps. → Tier 3 (The Master Log-Press): Unlocks mass-rebranding and audit immunity.
   * The Dynamite Shed & Quarry (Powder-Monkey): Tier 1 (The Blasting Locker): Basic black powder storage. → Tier 2 (Tripwire Rigs): Door and tally-rack dye-trap setting. → Tier 3 (The Nitro Depository): High-yield coal-cart bomb crafting and ordnance disarmament.
   * The Widow-Maker Lookout (The Scaler): Tier 1 (The Timber Post): Basic volume scaling. → Tier 2 (The Surveyor's Tower): High-ground night scope across open camp trails. → Tier 3 (The Flare Battery): Launches magnesium flares that illuminate the ridge and repel feral wolves.
   * The Iron Foundry & Boiler House (The Boilerman): Tier 1 (The Coal Kilns): Baseline steam generation. → Tier 2 (The Pressure Manifold): Remote steam venting into any camp building. → Tier 3 (The Master Turbine): Over-pressurizes pipes to flush hiding spots and lock the Mine Lift.
   * The Camp Infirmary (The Company Doctor): Tier 1 (The Cot & Bandages): Basic crush/burn healing. → Tier 2 (The Oxygen Still): Mass-produces tonics to clear Lung-Rot. → Tier 3 (The Forensic Suite): Advanced .45-70 ballistics, cyanide, and industrial wound autopsies.

### BOOK V: SINGLE-PLAYER STORY MODE & THE OMNISCIENT NPC ENGINE

In a single-player or story-driven run of Who Did It (@wdi), NPCs cease to be mere seat-fillers. They operate as a fully realized ensemble cast executing autonomous daily routines, secret side-hustles, branching narrative arcs, and algorithmic observation loops.

#### 1. Ensemble Cast Story Mode Arcs (Across All 3 Maps)

Map 1: HollowMere Story Mode Cast
 * The Baker (baker): Default: An honest working man hauling flour and baking Wake Loaves to keep the town warm. • The Fence Path: Triggered by a gold coin tip during a robbery; bakes contraband, lockpicks, and stolen Chapel gold inside bread to smuggle past the Constable. • The Ration Tyrant Path: Triggered if the Mill is burned or tracks are dynamited; hoards remaining flour and extorts starving citizens for crusts.
 * The Postmaster (postmaster): Default: A neutral civil servant bound by postal oaths. • The Extortionist Path: Steams open letters over his kettle, compiling a secret ledger to blackmail citizens before Tribunal votes. • The Handler Path: Intercepts the black-wax Hitman contract and assists the assassin from the shadows (or claims the weapon himself).
 * The Undertaker (undertaker): Default: A grim pragmatist who bags corpses and inventories pockets for loose scrip. • The Grave Robber Path: Secretly buries the murdered Vicar in a lead coffin to preserve the Zealot's Skin-Walk in exchange for dark favors. • The Chief Coroner Path: Allies with Law Enforcement, performing forensic autopsies to pinpoint exact times of death.
 * The Saloon Bartender (bartender): Default: A sympathetic ear pouring status-altering stout and enforcing curfew. • The Union Boss Path: Opens secret cellar tunnels to shelter the Activist and stages drunken brawls to block Police. • The Vigilante Path: Unlocks the sawed-off shotgun behind the bar when heists turn bloody, taking justice into his own hands.
 * The Company Clerk (clerk): Default: A rigidly disliked bureaucrat loyal only to the rent ledger. • The Embezzler Path: Uses the chaos of a vault heist to cook the books, stuff a briefcase with Baron payroll, and flee on the morning train. • The Baron's Heir Path: Protects the Railroad Baron when he arrives on the train, earning field promotion, command of Pinkerton guards, and Martial Law lockdown authority.

Map 2: Port-au-Levain Story Mode Cast
 * The Master Proof-Reader: Default: The island's truth-seeker who weighs Wake Loaves each night. • The Black-Market Baker Path: Bribed by the Smuggler to hide flintlock balls and stolen seals inside bread. • The Archivist Path: Uses density audit records to blackmail platter-swappers before the Dawn Tribunal.
 * The Spice-Master: Default: Brews botanical extracts and coats cloches with Bitter-Citron Oil to stain thieves' hands yellow. • The Toxicologist Path: Refines lethal Nightshade Glaze for the Black-Crust assassin. • The Alchemical Purifier Path: Brews anti-spore draughts to immunize the commune against the Leaven-Rot.
 * The Tide-Watcher: Default: Sweeps the cobblestones with the lighthouse beam and monitors shipping. • The Wreck-Looter Path: Exploits sea-fog blackouts to falsify manifests and loot the East Dock. • The Harbor Master Path: Locks down the Ferry gangplank and deputizes dockhands when the Grand Inspector arrives.
 * The Hearth-Warden: Default: Maintains tavern order with an iron fire-poker and stone pillar shackles. • The Mutiny Boss Path: Shelters the Pyre-Master in the rum cellar and incites apprentice riots. • The Ironside Path: Unlocks the mounted harpoon gun to hunt down syndicate smugglers.
 * The Ledger-Clerk: Default: Enforces nightly yeast-tax tariffs and controls industrial iron deadbolts. • The Customs Embezzler Path: Siphons Guild gold during a Counting-House heist and escapes on the Dawn Ferry. • The Council Regent Path: Assumes island-wide lockdown command if the Grand Inspector-General survives the night.

Map 3: BlackPine Story Mode Cast
 * The Head Tallyman: Default: Maintains the 10 Identity Logs and runs Grain-Density Checks to catch wood-weight swaps. • The Counterfeiter Path: Pockets the Enforcer's kickback and carves fake serial brands into blank pine billets. • The Quota Boss Path: Weaponizes missed production quotas to extort workers at the Sawmill Tribunal.
 * The Powder-Monkey: Default: Issues blasting caps and rigs red-dye traps on latches. • The Demolitionist Path: Supplies primed coal-cart bombs to the Slate-Breaker. • The Ordnance Master Path: Disarms wired charges and crafts non-lethal flash-caps for the Mine Warden.
 * The Scaler: Default: Scans Widow-Maker Ridge with a surveyor's scope to spot long-guns or dragged bodies. • The Poacher Path: Uses ridge blind spots to smuggle Syndicate goods off-camp. • The Ridge Tracker Path: Marks feral Timber-Wolf trails in the pines so Law Enforcement can hunt the pack.
 * The Boilerman: Default: Regulates the Foundry's high-pressure underground steam network. • The Saboteur's Stoker Path: Vents scalding steam to flush out witnesses and cover the Slate-Breaker's escapes. • The Iron Master Path: Cuts steam to the Mine Lift and seals Foundry doors during camp alerts.
 * The Company Doctor: Default: Treats burns and Lung-Rot with Oxygen Tonics in the Infirmary. • The Back-Alley Sawbones Path: Disposes of the Forest Chaplain's corpse in the lime pit to protect the Timber-Wolf's disguise. • The Chief Surgeon Path: Performs ballistic/cyanide autopsies for the Camp Investigator and revives dying workers with adrenaline.

#### 2. Ambient Townsfolk, Biome Mobs & Faction Enforcers
 * The Passive Background Townsfolk (Ambient NPCs): Apprentices, maids, off-duty miners, and patrons who follow strict 5H schedule loops (surging out at dawn, working stations at midday, retreating indoors at curfew) and shift collectively between Calm, Panicked, Entranced, and Rioting.
 * Aggressive Biome Mobs (Night Spawns & Wilderness Threats):
   * HollowMere — Black Pine Wolves & Forest Stalkers: Spawn along forest_deep paths and cave_gallery mouths at night. Repelled by lanterns and fences, they track unlit players in the mud and maul them, leaving shredded clothing clues.
   * Port-au-Levain — Tide-Ghouls & Salt-Flat Drowners: Crawl from the sub-basement Yeast Vaults and East Dock tide pools during fog blackouts, dragging kelp trails and applying the movement-slowing Drenched status bit.
   * BlackPine — Feral Timber-Wolves & Tunnel Crawlers: Prowl Widow-Maker Ridge and unvented coal adits, drawn by machinery vibrations and carbon soot to attack anyone outside during the Midnight Roll Call.
 * Faction Enforcement Agents (Elite Security Forces):
   * The Railroad Baron's Pinkertons (HollowMere): Deployed during Activist sabotage or threats to Clerk assets; patrol with guard dogs and answer unholstered weapons with baton charges or rifle fire.
   * The Guild Iron-Wardens (Port-au-Levain): Deployed when yeast-taxes go unpaid en masse or the Grand Inspector is threatened; armored in brass-plated leather with shock-staves to haul suspects to Gallows Square.
   * Order Enforcement Agents / OEAs (BlackPine): Deployed immediately when Midnight Roll Call bunk slots are empty or steam-mains rupture; equipped with gas masks, arc-light searchlights, tear gas, and riot slug-guns.

#### 3. The Omniscient NPC Interaction & Propagation Matrix

Every ambient NPC executes a continuous line-of-sight raycast (Visibility.ts) across a 90-degree front cone up to 8 tiles, turning the background population into a distributed surveillance grid.

I. The Observation-to-Letter Pipeline ("The More Eyes" Algorithm)
 * The Gossip Accumulator (NPC.gossipValue += weight):
   * Witnessing minor loitering or soot smudges: +5
   * Witnessing lockpicking or vandalism: +25
   * Witnessing a murder or blood trail: +100
 * The Mail Generation Trigger: If an ambient NPC safely completes their routine trip to the Post Office, Archive, or Foreman's Desk at the next shift change with a gossipValue greater than 50, their observation is automatically converted into a physical "Dirty Deed Ledger Slip" dropped into the morning sorting desk.
 * Ambient Red Herrings & Rescue Missions:
   * Lung-Rot False Positives: An ambient miner in BlackPine whose lungRotTicks maxes out suffers coughing fits that emit noise rings and camera-shake pulses identical to a killer suppressing a stealth cough—drawing investigators into false stakeouts.
   * Predator Rescue Missions: If a panicked civilian NPC strays off-trail at twilight (into forest_deep in HollowMere or Widow-Maker Ridge in BlackPine) and is cornered by wolves, Law Enforcement receives a HUD compass dispatch: "Civilian distress signal—intercept before predator mauling completes." Saving the NPC grants a loyal witness who can clear the investigator's name or drop an unencrypted clue.

II. The Cascading Reaction Matrix (Killer Actions → Core Roles → Ambient NPCs)

| Killer Action / Task Completion | Immediate Impact on Core Roles | Systemic Ripple Effect on Ambient Townsfolk & Faction Agents |
|---|---|---|
| The Zealot slaughters the Vicar & initiates Skin-Walk (HollowMere) | The Undertaker: Triggers immediate Grave Robber / Coroner check if they find the hidden body. The Postmaster: Receives whispered heresy slips in the mail stream. | Ambient NPCs: Touched believers subtly shift to Entranced, walking silently toward forest cave altars at night. (If the Vicar's corpse is discovered unburied, the town shifts to Panicked and Law Enforcement alert jumps to Elevated.) |
| The Activist burns the Lumber Mill (HollowMere) | The Baker: Flour supply lines sever; forces pivot to Ration Tyrant evolution. The Saloon Bartender: Unlocks cellar doors for revolutionaries. | Ambient NPCs: Mill shift workers transition to Rioting state, grabbing torches and forming blockades that restrict Police and Pinkerton movement across the Town Core. |
| The Pyre-Master ruptures Steam-Boilers (Port-au-Levain) | The Spice-Master: Apothecary vats lock down due to pressure failure. The Tide-Watcher: Lighthouse arc-beams sweep outdoor corridors. | Ambient NPCs: Flee industrial zones in a panic; Guild Iron-Wardens deploy automatically to seal building gates and enforce immediate curfew. |
| The Company Enforcer performs Tally-Log Swaps (BlackPine) | The Head Tallyman: Detects weight-balance shifts on the sorting rack, triggering an internal density audit. | Ambient NPCs: Camp-wide confusion over mismatched payroll assignments; miners refuse to enter the shafts until shift logs are verified, raising tension before Midnight Roll Call. |

III. The Unified 20 Hz Algorithmic Interaction Sheet

```json
{
  "simulation_event_matrix": {
    "trigger_sources": [
      "KILLER_TASK_COMPLETE",
      "ENVIRONMENTAL_DEGRADATION",
      "AMBIENT_OBSERVATION",
      "FACTION_THRESHOLD_BREACH"
    ],
    "propagation_rules": [
      {
        "event": "KILLER_SKIN_WALK_ACTIVATED",
        "condition": "killer_id == 'zealot' && target_corpse == 'vicar' && corpse_reported == false",
        "effects": {
          "core_roles": {
            "undertaker": "enable_interaction(seal_lead_coffin_or_report)",
            "postmaster": "gossip_accumulator_boost(+25)"
          },
          "ambient_npcs": {
            "touched_believers_state_shift": "CALM_TO_ENTRANCED",
            "night_waypoint_override": "cave_gallery_altar"
          },
          "law_enforcement": {
            "alert_level": "COVERT_UNTIL_CORPSE_FOUND",
            "detective_clue_spawn": "tethered_body_candlewax_trace"
          }
        }
      },
      {
        "event": "VICAR_CORPSE_DISCOVERED",
        "condition": "target_corpse == 'vicar' && corpse_reported == true && sealed_in_lead_coffin == false",
        "effects": {
          "killer_state": "shatter_skin_walk_disguise()",
          "core_roles": {
            "baker": "suspend_delivery_and_lock_doors()",
            "postmaster": "flag_heresy_slips(+50)"
          },
          "ambient_npcs": {
            "behavior_state_shift": "CALM_TO_PANICKED",
            "waypoint_override": "chapel_or_town_bell"
          },
          "law_enforcement": {
            "alert_level": "ELEVATED"
          }
        }
      },
      {
        "event": "AMBIENT_LUNG_ROT_MAXED",
        "condition": "npc.lungRotTicks >= MAX_LIMIT",
        "effects": {
          "audio_propagation": "cough_noise_emit(radius: 4.5 tiles)",
          "visual_propagation": "carbon_soot_smudge_drop",
          "investigator_trigger": {
            "target": "detective_or_camp_investigator",
            "action": "spawn_false_positive_hud_marker",
            "duration_s": 30
          }
        }
      },
      {
        "event": "BIOME_PREDATOR_MAULS_NPC",
        "condition": "npc.position in biome_danger_zone && time == DUSK_NIGHT",
        "effects": {
          "ambient_population": "local_panic_ripple(radius: 6 tiles)",
          "investigator_trigger": {
            "target": "law_enforcement_roles",
            "action": "dispatch_rescue_waypoint_notification",
            "reward": "loyal_witness_testimony"
          },
          "forensics": {
            "drop_item": "shredded_clothing_clue",
            "trait_triplication": "height_and_thread_traces"
          }
        }
      },
      {
        "event": "MIDNIGHT_ROLL_CALL_MISSED",
        "condition": "player_or_npc.bunk_slot_empty == true && time == MIDNIGHT",
        "effects": {
          "faction_response": "OEAS_DEPLOYED",
          "ambient_npcs": "lock_bunkhouse_doors",
          "searchlight_system": "sweep_perimeter_tracks"
        }
      }
    ]
  }
}
```

### BOOK VI: THE UNIFIED SYSTEMIC MATRIX & ENGINE SEAMS (DEVELOPER REFERENCE)

#### 1. Cross-Map Systemic Equivalence Table

Because all three Bibles share an isomorphic design spine, @wdi/content and apps/server/src/sim/ execute every world through a single unified set of schemas:

| Engine System | HollowMere (map: "hollowmere") | Port-au-Levain (map: "port_au_levain" / mode: "onub") | BlackPine (map: "blackpine") |
|---|---|---|---|
| Master Arrival / Extraction Clock | The Daily Train (overworld tracks) | The Morning Ferry (wharf dock) | The Payroll Train & Shift-Whistle (sawmill spur) |
| Primary Currency & Tax Loop | Company Scrip (Clerk's Midday Rent) | Guild Copper & Yeast Tokens (Nightly Platter Tariff) | Syndicate Token Scrip (Tallyman's Shift Quota) |
| Tactile Identity Prop | Role Card & Case Dossier | Wake Loaf Platter (pl.platter_0..9) | Branded Tally Log (bp.tally_0..9 + Wood Weight) |
| Vendetta 1 (conversion) | The Zealot vs. The Vicar (10x Ascended return) | The Leaven-Rot vs. Abbot of the Crust | The Timber-Wolf vs. Forest Chaplain |
| Vendetta 2 (sabotage) | The Activist vs. Railroad Baron | The Pyre-Master vs. Grand Inspector-General | The Slate-Breaker vs. Syndicate Inspector |
| Vendetta 3 (heist) | The Bandit (Six-Shooter + Tip Coin) | The Smuggler-Blackguard (Pocket-Mortar + Loaf Swap) | The Company Enforcer (Winchester + Log Swap) |
| Vendetta 4 (contract) | The Hitman (Black-Wax Mail Letter) | The Black-Crust Contract (Postal Pigeon Cylinder) | The Pit-Poisoner (Miner's Lunchbox Slip) |
| Townsfolk 1 (Food / Identity) | The Baker (Fence / Ration Tyrant) | Master Proof-Reader (Black-Market / Archivist) | Head Tallyman (Counterfeiter / Quota Boss) |
| Townsfolk 2 (Mail / Chemistry) | The Postmaster (Handler / Extortionist) | The Spice-Master (Toxicologist / Purifier) | The Powder-Monkey (Demolitionist / Ordnance) |
| Townsfolk 3 (Corpse / Medical) | The Undertaker (Grave Robber / Chief Coroner) | The Tide-Watcher (Wreck-Looter / Harbor Master) | The Company Doctor (Sawbones / Chief Surgeon) |
| Townsfolk 4 (Tavern / Power) | The Saloon Bartender (Union Boss / Vigilante) | The Hearth-Warden (Mutiny Boss / Ironside) | The Boilerman (Saboteur's Stoker / Iron Master) |
| Townsfolk 5 (Finance / Recon) | The Company Clerk (Embezzler / Baron's Heir) | The Ledger-Clerk (Customs Embezzler / Regent) | The Scaler (Poacher / Ridge Tracker) |
| Law Pipeline (lawStage 1→2→3) | Detective → Police Officer → Judge | Inquisitor → Guild Bailiff → High Chancellor | Camp Investigator → Mine Warden → Circuit Judge |
| Biome Night Predators | Black Pine Wolves & Forest Stalkers | Tide-Ghouls & Salt-Flat Drowners | Feral Timber-Wolves & Tunnel Crawlers |
| Elite Faction Enforcers | Railroad Baron's Pinkertons (+ Guard Dogs) | Guild Iron-Wardens (Shock-Staves) | Order Enforcement Agents / OEAs (Gas & Searchlights) |

#### 2. Core Server & Client Architectural Seams
 * Deterministic RNG Streams (sim/seeds.ts, A50): All random draws—including mailbag contracts (StreamName: "contract"), perk distributions, and NPC behavioral checks—use dedicated sfc32 streams so player actions remain strictly reproducible and tamper-proof.
 * View-Scoped Privacy (A30, A50): Secret roles, cult auras, and intercepted blackmail contents never broadcast to public state. They are computed server-side in Visibility.ts and delivered exclusively inside the target player's private Player.priv view.
 * PiP Vulnerability Overlay: Tactile mini-games mount as center-screen Picture-in-Picture modals while the isometric Phaser World canvas stays live underneath with a frosted glass filter—ensuring players remain vulnerable to ambient threats while cracking locks, steaming envelopes, or wiring dynamite.

## 3. What the Bible names that the code does not have

Read before quoting a Bible identifier in code or data. The Bible was written against the design, not the tree:

| The Bible says | The tree has | Rule |
|---|---|---|
| `amb_hollowmere.ogg`, `amb_blackpine.ogg`, `amb_levain.ogg`, `bell_ring.ogg` | `amb_village`, `amb_forest`, `amb_cave`, `amb_house`, `bell` (`apps/client/public/assets/audio/`) | keys stay as they are; a cutscene's `audio` step names a real key |
| `Entity.carriedBy`, `Clue.dir`, `Avatar.look` | no `Entity` schema; `Avatar.lookOf` is a seat id and the look id is `Player.look`; clues are `SceneState` entries | the schema in `packages/shared/src/schema/index.ts` wins |
| `LOFT_SCENE_ID = 'loft'` | `LOFT_SCENE_INDEX`; the loft is a pseudo-scene (`onub-contract.md`) | as the tree |
| `Visibility.ts private view tag` | `VIEW_TAG {presence, priv, ghost}` | a new tag is a contract request, never a session's own addition |
| `map: "port_au_levain"` | `hollowmere`, `blackpine` only; `SCENE_IDS` is append-only | a round-8 map; its ids are appended then, never reused |
| 8-bit "video" for the Vicar | the `video` cutscene step (round 7) and the 6N file | the only in-game video beside the landing loop |
| `PiP` mini-games "over the live world" | the ONUB mini-games are full-screen views (`view/onub/minigames/`) | round 6 reuses their widgets inside a DOM modal over World; the frosted-glass look is 6I's |
