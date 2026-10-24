# Round 8 addendum C: the canon pass (8V)

What session 8V maps and renames for the owner's ruling that "narrative worldbuilding is done" (DECISIONS A201;
8V's row is A221; `teardown.md` 4). The lore is canon "as long as it doesn't break features without creating a good
working solution". This file says where each ruling and each lore fact lands in the game, which of today's lines
contradict it, and how each contradiction is fixed. The rules and every number stay in `docs/GDD.md` and
`packages/content/data`. Mechanics the lore implies are listed in 5 as the owner's proposals, and 8V builds none of
them.

**Sources.** ROSW (groot99-droid/Pipelines-Plugin) at 55e6c64 (#17), read-only from here. The paths below are relative to
`creative-writing/vault/`:

- `05_Worldbuilding/04_The_Canon_and_Trope_Ledger_of_Who_Did_It.md`: the **Ledger**. Entries I to XIX are cited
  as "Ledger IV". Its trope table marks every trope settled.
- `05_Worldbuilding/05_Codex_of_the_End_of_the_Line.md`: the **Codex**, cited by section ("Codex, Bestiary").
- The works with `project: who-did-it` in `03_Stories/`, `05_Worldbuilding/`, `06_Songs/`, `07_Poems_and_Prose/`,
  `08_Letters/` and `10_Characters/`. They are the source of the shelf pages in 7.
- `03_Stories/07_Project_-_Man_Eater.md` is the owner's original. It is quoted and never edited.

**The owner's answers** (6Z's questionnaire, 2026-10-24, as relayed to 8V):

- BlackPine keeps "BlackPine" on screen; Grounds 99 is lore only.
- These are scheduled as proposals: the Grounds 99 secret bosses and the lab, the Secret Agent (the Hitman) as a role,
  and the Port-au-Levain map.
- These are not scheduled: the Man Eater ending and the 2626 map.
- The Beast and the killers are never named.
- Questions for the owner go to 6Z, never to the owner directly.

**What stays fixed.** Every id stays as it is: scene, portal, spawn, prop, light, clue, map, quest, npc and atlas key ids,
and theme keys (GDD 3.13, WORLD 4.3). The pass touches display text and document wording only. `docs/MASTER_PLAN.md`
is frozen and keeps the 1931 harbour as history.

## 1. The rulings of A201

Status: **holds** means the game already agrees. **C2** and **C3** are this session's wording PRs (8). **P** is a proposal
(5), and **N** is not scheduled (6).

| Ruling (A201) | Lore source | Where the game shows it | Status |
|---|---|---|---|
| HollowMere is 1893, the year of the Panic, in Coldwater Territory, on the Thorne & Expanse Line | Ledger I; Codex, Central Premise | GDD 1, GDD 3.13 Maps table, WORLD 4.1, `maps/hollowmere.json` `blurb`. The opening's captions are already the 1893 frame (`cs.hollowmere.*`, UI.md 14.20) | C2 |
| There is no lake, and no sea. The mere drained into the tin gallery and left a fen | Ledger II, XI; Codex, the Mere | GDD 1 ("fog hides the sea"), WORLD 4.1, the 4.4 sketch ("sea / fog", "DOCK ─ boats"), 4.6 ("sea cave") | C2 |
| HollowMere has no lighthouse. The V1.5 lighthouse is a second marsh light | Ledger XII, XIX | WORLD 4.3 (V1.5 `lighthouse`, 3 stacked rooms), 4.4, 4.6, 4.9 | C2 wording; K5 |
| BlackPine is re-founded as Grounds 99 (1952, the program Anomaly Unknown) | Ledger VIII margin, XVII; Codex, BlackPine margin | Nowhere on screen: the owner's answer keeps "BlackPine" and makes Grounds 99 lore only | holds (lore only) |
| Grounds 99 has four secret bosses (the Timber-Wolf, the Crawler Mother, the Sleepless, the Choir) and a hidden lab that is never found | Ledger XVII; `10_Characters/10_Subject_Files.md`; `03_Stories/29_What_the_Lab_Made.md` | Not built | P1 |
| The Hitman is the Secret Agent at Grounds 99 | Codex, Contract ("by 1952 the slip is an enlistment"); Ledger XIV margin | Not built. Today the Hitman is a Killer vendetta (GDD 3.20) | P2 |
| The Project Man Eater ending (the Windigo born in the lab), only on a scientist's victory or the Agent's enlistment | `03_Stories/07_Project_-_Man_Eater.md` (the owner's original) | Not built | N |
| Grounds 99 in 2626 is a future map | Ledger XIX last slip; `05_Worldbuilding/27_Grounds_99_Survey_of_2626.md` | Not built | N |
| Port-au-Levain is a French colony, 1787-93: the Gallery, the Guild, the Commons and the Abbey; the Hearth first, then the blade | Ledger III margin, XVIII; Codex, Port-au-Levain | Not built (ROADMAP R9, A135) | P3 |
| The storm closes the coach road on 19 Dec; the last train leaves on 23 Dec; no train runs 24-28 Dec; the Ascended Vicar arrives on 29 Dec | `03_Stories/25_The_Road_Is_Closed.md`; `05_Worldbuilding/24_Arrivals.md` (Week XII onward) | GDD 1 ("A storm has closed the road"), GDD 3.3 (the Daily Train), WORLD 4.1, 4.10 ("the coast road"). No screen shows a date | C2, C3; K3 |
| The Beast is never named or explained | Codex, Bestiary ("Nothing more is written here") | WORLD 4.1, 4.6 call it "the Beast" and give no more. No copy line names it | holds |
| The Killer, the Accomplice and the vendetta Killers are never named in lore | Ledger IX; Codex, Town superstitions | `roles.json` card text names roles only. An NPC seat's name (`names.json`) names a seat and is never tied to a card | holds |

## 2. The lore facts the game shows

These lines agree with the lore today, and the pass leaves them alone. Where text lives in data, the cell names the
file and the id.

**HollowMere** (`maps/hollowmere.json`, WORLD 4.3)

| Fact | Lore | File and id | Copy | Row |
|---|---|---|---|---|
| The station sign "HOLLOWMERE — EST. BY THE RAILROAD EXPANSE" | Ledger I | `cutscenes.json` `openingHollowmere` | `cs.hollowmere.title` | UI.md 14.20 |
| The Railroad Barons own the mill, the bank and the dirt | Ledger I | the same | `cs.hollowmere.laid`, `.own` | UI.md 14.20 |
| The Daily Train, the platform and the mailbag | Codex, HollowMere ("Clock") | `overworld.platform`, `ov.lt_platform`, `ov.mailbag_platform` | `log.train`; the server's `TRAIN_ARRIVE_LINE` | GDD 3.3, UI.md 14.30 |
| The Drowned Lantern, kept by Mrs Grieves; photographs of drowned sailors; the oil barrel | Ledger IV | `tavern_bar` "The Drowned Lantern", `tb.photos`; `tavern_back` | scene name | WORLD 4.3, 4.8 |
| The tide chart with the next low tide circled | Ledger XI | `tb.tide_chart` | none | WORLD 4.8 |
| Black Pine is one forest: Gallows Wood at the near edge, the Fenwood at its drowned heart | Ledger V | `forest` "Gallows Wood", `forest_deep` "The Fenwood", `fd.drowned_lantern`, `fd.lt_drowned` | scene names | WORLD 4.3 |
| Mother Moll: "Four sprigs of herb, dear." | Ledger V | `quests.json` npc `moll`, quest "Moll's herbs" (4 Herbs) | quest rows | GDD 3.16 |
| Harbourmaster Pell keeps his title: "harbour" means the marsh dock. "Bring me resin and a plank of timber and I will lend you a lantern." | Ledger XIII | `quests.json` npc `harbourmaster` "Harbourmaster Pell", quest "Caulk the skiff" (2 Pine Resin, 1 Timber, Lantern); `ov.gv_harbourmaster` | quest rows | GDD 3.16 (C2 changes "by the dock" to "by the marsh dock") |
| Aldous Vane: the will names "whoever remains when the last lantern goes out"; he is "three nights" dead; Widow Vane's portrait hangs turned to the wall | Ledger III | `mh.clock`, `mh.vane_portrait`, `wp.portrait` | GDD 1 | WORLD 4.1, 4.8 |
| The stopped clock at 11:47 | Ledger III, XVI | `mh.clock` | none | WORLD 4.3 |
| St Brannock's, its rope with a torn glove; the new Vicar came on the train | Ledger VI | `chapel` "St Brannock's", `ch.rope` | `cs.hollowmere.vicar`; the Vicar's card text | WORLD 4.3, 4.8 |
| The Vicar's memorial | Ledger VI | `cutscenes.json` `memorialVicar` | `cs.memorial.vicar` | GDD 3.20, UI.md 14.30 |
| Tamsin Crumb of the island; the wake loaf: one for each mourner and three for the dead | Ledger VII | `bakery` "Crumb's Ovens", `crumb_*` | scene names | WORLD 4.1 |
| VANE TIN CO crates | Ledger III | `cg.tin_crate`, `bd.tin_crate` and the other `*.tin_crate` | none | WORLD 4.3, 4.8 |
| The roles' card lines. The Codex quotes them word for word ("You know every door in Hollowmere", "The fog keeps the boats in", "The mine is shut; your hands are not") | Ledger IX; Codex, The Rest of the Town | `roles.json` `cardText` | from the data | GDD 3.2 |
| The four vendettas (conversion, sabotage, heist, contract) and the Hitman's black-wax contract on the train | Codex, The Four Vendettas | `vendettas.json` | `vendetta.goal.*` | GDD 3.20, UI.md 14.29 |
| Faith's coin: the Indulgence and the Parish Seal | Codex, The Four Currencies | `items.json` | from the data | GDD 3.23 |
| Mere-wolves flee the light; bog-wisps lure (V1.5); bats, rats and boar | Codex, Bestiary; Law 5 | `mobs.json` | from the data | GDD 3.15, WORLD 4.6 |
| The death whispers ("Something in the cup was not sugar", "The town has spoken", "The pines were not empty") | Ledger trope table; Codex, Pines | `cutscenes.json` `deaths` | `cs.death*.line` | UI.md 14.20 |

**BlackPine** (`maps/blackpine.json`, WORLD 4.10)

| Fact | Lore | File and id | Copy | Row |
|---|---|---|---|---|
| The Harrow Timber & Coal Syndicate; "feeding the furnace or fuel"; "The log on your rack at dawn is who you are" | Ledger VIII; Codex, BlackPine | `cutscenes.json` `openingBlackpine` | `cs.blackpine.title`, `.intake`, `.dawn` | UI.md 14.20 |
| Vane Sawmill: the deed is Harrow's, and the name on the mill stays Vane's | Ledger VIII | `bp_mill` "Vane Sawmill" | scene name | WORLD 4.3 |
| The tally board with one name chalked out (the name is never carried) | Ledger VIII, XVII | `bm.tally_board`, `bm.lt_lamp_tally` | none | WORLD 4.10 |
| The dead telephone (Harrow's new line, which rarely works) | Ledger X | `bo.telephone` | none | WORLD 4.3 |
| The Deep Level's refuge lamp | Ledger XVII; Codex, BlackPine | `bd.refuge_table`, `bd.lt_refuge_lamp` | none | WORLD 4.10 |
| The broken trestle | Codex, BlackPine ("Places") | `bc.trestle` | none | WORLD 4.10 |
| Foreman Hask on the yard, Ada Kerrow at the forge, the Collier at the kilns | Codex, Named townsfolk | `quests.json` npcs `foreman`, `smith`, `collier` | quest rows | GDD 3.16 |
| The Rack: ten billets, ten Identity Logs | Ledger VIII | `bs.rack_tally` | none | WORLD 4.10 |

## 3. Conflicts and their fixes

Each conflict is a line of today's text that the lore contradicts. The fix keeps every feature working, and none of
them changes a rule.

- **K1. The 1931 harbour.** GDD 1, GDD 3.13's Maps table, WORLD 4.1 and the `hollowmere` blurb all say "fog-bound harbour
  hamlet, autumn 1931" and "fog hides the sea". **Fix (C2):** the text becomes the railroad town on the drowned mere in
  Coldwater Territory, December 1893, where the fog lies on the mere. `theme: "harbour"` is a key (`iso_ground_harbour`,
  SPRITES.md) and stays. Its art (fen, reed, black water, the marsh dock) already fits the mere, and only the word
  is out of date.
- **K2. The sea in the sketch and the bestiary.** WORLD 4.4 draws "sea / fog" along the south edge, "DOCK ─ boats" and a
  cliff path. WORLD 4.6 puts the Beast in "the sea cave", and gulls on the lighthouse. **Fix (C2):** the water south of
  the village is the mere. The dock is the marsh dock (Ledger XIII), where Pell's leaking skiff and Tuck's channel ferry
  tie up; `ov.dock_crates`, `ov.lt_quay_lantern` and `ov.lt_moon_dock` keep their ids. The Beast sleeps in the Tin
  Gallery (Codex, Bestiary). The gulls move to the marsh dock. No geometry changes.
- **K3. The road and the train.** WORLD 4.1 says "the storm closed the only road", and WORLD 4.10 says "the coast road".
  The lore closes the coach road on 19 Dec and keeps the train until the 23rd. **Fix (C2, C3):** "the coach road", and
  the train becomes the only way out ("don't miss the train", `cs.hollowmere.miss`). The Daily Train of GDD 3.3 runs
  in every match, so a match is one day between 19 and 23 Dec. No screen shows a date, and none needs to.
- **K4. The Thief's sea exit.** GDD 3.2, GDD 3.10 and `roles.json` `thief` `goal` and `win` say "Escape by the cave sea exit".
  **Fix:** Ledger XIX makes the sea door the town's word for the boards at the back of the cave, which the low water
  clears on the second and fourth nights of the big lows. That is exactly the boarded `ce.sea` portal with
  `window: "lowTide"` on Nights 2 and 4 (WORLD 4.3), so the feature stands. Only the words change, to "the sea door at
  the back of the cave". C2 changes GDD 3.2, 3.10 and WORLD 4.3. `roles.json` is outside 8V's grant (request R2).
- **K5. The V1.5 lighthouse.** WORLD 4.3 plans `lighthouse` as 3 stacked rooms, and WORLD 4.9 makes it a real volume. Ledger
  XII and XIX allow only a marsh light: the Company's lamp on an iron post at the south-east edge of the mere ("Fennick's
  other one"), first lit on Monday 18 December. **Fix (C2):** the V1.5 row becomes the south-east light, a light on the
  overworld. The id `lighthouse` never shipped and is not in `SCENE_IDS`, so whoever builds it picks a fitting id then
  (WORLD 4.3 rule 2). WORLD 4.9 drops the lighthouse volume. No code reads the planned row.
- **K6. Father Bray.** WORLD 4.1 lists Father Bray among the landmark NPCs. In the lore he is gone, dead or fled, and the new
  Vicar came on the train (Ledger VI). **Fix (C2):** Bray leaves the landmark list. He stays as the chapel's absence:
  the rope, the torn glove and his Company bell. No NPC, giver or atlas key names him.
- **K7. Vane's death and the will.** WORLD 4.1 says Vane "died three nights ago". The lore has him die on the island and
  be "three nights" dead in HollowMere (Ledger III). **Fix (C2):** one clause, "on the island, Port-au-Levain, three
  nights dead by the telegraph".
- **K8. BlackPine's company.** GDD 3.13 says "the Vane company's logging camp and tin mine". WORLD 4.10 says "the Vane Timber
  and Tin Company's camp ... the same autumn of 1931", and that the will leaves "the camp, the mill and the mine". The
  `blackpine` blurb says "the company's tin workings". The lore: the tin ran out, Harrow bought the camp and found coal
  under the old workings, the deed is Harrow's and the mill keeps Vane's name (Ledger VIII). The opening already says so
  (`cs.blackpine.title`). **Fix (C3; C2 for GDD 3.13):** Harrow's camp, December 1893, the Syndicate's coal under
  Vane's old tin workings. The telegram brings Vane's death, and the will names "whoever remains", but the deed is not
  his to leave. The caves still yield Tin Ore (GDD 3.14, `resources.json`): the old stopes hold it, and Ada Kerrow's
  quest stands. No item, recipe or quest changes.
- **K9. Foreman Hask's spot.** WORLD 4.10 puts him "at the office". GDD 3.16, WORLD 4.6 and the Codex put him on the
  yard. **Fix (C3):** the yard.
- **K10. The BlackPine clock.** The Codex runs BlackPine on the Payroll Train, and the game's BlackPine has no station
  (WORLD 4.3, A113). **Fix (holds):** the storm took the trestle over the Blackwater (`bc.trestle`, WORLD 4.10), so no
  Payroll Train reaches the camp this week. The shift bell stands for the Shift-Whistle. C3 adds the clause, and no
  feature changes.
- **K11. The 1931 kit in Crumb's station rooms.** `crumb_cold` has a "frosted compressor" (`cf.compressor`) and the four
  rooms hang electric bulbs (`cf.wall_bulb`, `co.wall_bulb`, `cp.wall_bulb_0..2`). `crumb_mixing` has a mechanical
  "dough mixer" (`cm.mixer`, `doughMixer`), and `crumb_proofing` has a "glass-fronted proofing cabinet" warmed by a
  bulb. None of this is 1893. **Fix (proposed, art owner):** the stations keep their keys and footprints. The bulbs are
  drawn as oil lamps on their iron arms: a wall light stays a wall light, so the ids keep their meaning (rule 4). The
  mixer is drawn as a hand-cranked kneading trough (le pétrin is a kneading trough), and the cabinet as a wooden
  proving cupboard warmed from the oven flue. `cf.compressor` cannot become an ice chest under rule 4, so it is
  retired and a new `cf.ice_chest` stands in its place. The scene notes are not shown on screen, so this is art and
  notes work for the art session that owns `crumb_*` (request R3).
- **K12. "Hollowmere" or "HollowMere".** The lore and the cutscene copy spell it HollowMere and BlackPine. The map names
  (`maps/*.json` `name`) and the card text say Hollowmere and Blackpine, and the Codex quotes the cards as they stand.
  **Fix (request R1):** on screen, the map row's name becomes "HollowMere" and "BlackPine", matching the owner's answer
  that BlackPine keeps "BlackPine" on screen. Map `name` is outside 8V's grant. Card text keeps its spelling, because
  the Codex quotes it.

## 4. The places the game leaves out

WORLD 4.8 lists props that no scene file places today: the chalk hopscotch under a lantern, the wolf pelt on the barn door,
the gravestone with tomorrow's date, the muddy bootprints on the manor carpet and the apothecary's "NOT FOR SALE"
shelf (named only in `apoth_shop` notes). The Ledger settles all of them (the trope table, Ledger XV). They stay
as WORLD 4.8 has them, and placing them is room-dressing work for 8J, not part of this pass.

## 5. Proposals (the owner's; built by nobody)

These follow from the lore and wait for the owner and a later brief. 8V builds none of them, and nothing in C2 to C4 reads
them.

- **P1. Grounds 99's secret bosses and the lab.** Four bosses: the Timber-Wolf, the Crawler Mother, the Sleepless and the
  Choir (`10_Characters/10_Subject_Files.md`). A facility under one of the houses is never found (Ledger XVII). They
  would ride the boss NPCs of the living world (living.md 3: a node with a room-sized area). They would be secret
  because nothing names them on screen, and the owner's answer keeps the name Grounds 99 off screen too. Owner's
  answer (Q1): they sit in their own variant scenes, a scene set with new ids under a new prefix (GDD 3.13, WORLD 4.3
  rule 5), not on BlackPine at night; no existing id is reused. Still open: whether the lab is a scene at all, given
  that it "is never found".
- **P2. The Secret Agent (the Hitman) as a role.** In 1952 the Pit-Poisoner's slip "is an enlistment", and the hand
  that takes it up is the Secret Agent's (Codex, Contract). Today the Hitman is a vendetta of the Killer card (GDD 3.20).
  A role is a new card in `roles.json` with its own deck rows (GDD 3.1, 3.9), not a renamed vendetta. Owner's answer
  (Q2): the Secret Agent is a special form of the Hitman, so it takes the Hitman's faction and deal rule, and it is
  dealt only on maps where the P1 bosses are built.
- **P3. The Port-au-Levain map.** The island under the Patent, 1787-93: the Hall of Platters and the Great Hearth, Gallows
  Square, the Windmill Cliffs, the Yeast Vault, the Salt-Flats and Smuggler's Wharf, the lighthouse (the island's, Ledger
  XII), with the Gallery, the Guild, the Commons and the Abbey of the Crust (Ledger XVIII). The Hearth comes first, and
  the blade comes off the ferry in 1793. Its clock is the Morning Ferry, and its law runs Inquisitor, Guild Bailiff,
  High Chancellor (Codex, The Three Ladders). It is ROADMAP R9 (A135), which also holds the round-7 kitchen seed
  (A116). The Ledger's trope table folds the old kitchen roles into guild lore ("The kitchen brigade"). Its scenes
  would take a new stem and new prefixes (GDD 3.13).

## 6. Not scheduled

- **The Project Man Eater ending** (the Windigo born in the lab, on a scientist's victory or the Agent's enlistment). It
  comes from the owner's original, `03_Stories/07_Project_-_Man_Eater.md`, which stays quoted and unedited.
- **The 2626 map** (Grounds 99 in 2626, `05_Worldbuilding/27_Grounds_99_Survey_of_2626.md`).

## 7. Shelves, letters and boards (C4+, with 7M)

7M's reader (`stations.md` 5) reads `lore.json`, keyed by prop id. 8V fills the pages from the works, and each page
cites its vault path. A page that quotes a work verbatim gets a `CREDITS.md` row naming the vault path and the owner.
The list goes to the owner through 6Z before it merges. These are the candidates by prop:

| Prop (`stations.md` 3) | Candidate works |
|---|---|
| `as.shelf` (Mallory Apothecary) | `05_Worldbuilding/22_A_Field_Guide_to_the_Things_That_Walk_at_Night.md`; `05_Worldbuilding/09_A_Lamplighter_s_Round_of_HollowMere.md`; `06_Songs/06_Ballad_of_the_Iron_Beast.md` |
| `wp.letter_box` (Widow Vane's parlour) | `08_Letters/04_Black_Wax.md`; `08_Letters/02_Five_Letters_at_the_Fork.md` |
| `bk.ledger` (Crumb's Ovens) | `07_Poems_and_Prose/22_The_Daybook_of_Crumb_s_Ovens.md`; `05_Worldbuilding/13_The_Undertaker_s_Register.md` |
| `ov.board`, `bc.board` (the notice boards on the square and the yard) | `05_Worldbuilding/10_The_HollowMere_Gazette_Morning_Edition.md`; `10_Characters/07_Four_Notices.md`; `05_Worldbuilding/07_The_Daily_Train_Timetable_Manifest_and_Rules_of_Carriage.md`; `05_Worldbuilding/26_Standing_Orders.md` |
| `bl.wall_shelf` (the Bunkhouse) | `10_Characters/09_The_Tally_Rack.md`; `05_Worldbuilding/16_The_Last_Shift_s_Tally_Board.md`; `06_Songs/09_The_Blade_Sings_at_Dawn.md` |
| `bo.wall_shelf_0`, `bo.wall_shelf_1` and the payroll ledger (Company Office) | `05_Worldbuilding/15_Intake.md`; `05_Worldbuilding/17_Cables.md`; `08_Letters/03_Censored.md` |

Three limits hold for every page:

- No page names the Beast or a killer.
- Grounds 99, 1952 and 2626 appear only as the typed slips appear in the Ledger and the Codex. These are found papers,
  with no map or mechanic behind them.
- Nothing from the Man Eater original goes on a shelf until the owner says so.

## 8. The pull requests

| PR | What | Files |
|---|---|---|
| C1 | This file and DECISIONS A221 | `docs/round8/canon.md`, `docs/DECISIONS.md` |
| C2 | HollowMere wording: K1-K7, the Maps row of K8, the Pell spot | GDD 1, 3.2 (Thief row), 3.10, 3.13, 3.16; WORLD 4.1, 4.3, 4.4, 4.6, 4.8, 4.9; `maps/hollowmere.json` `blurb` |
| C3 | BlackPine wording: K8-K10 | WORLD 4.10; `maps/blackpine.json` `blurb`; UI.md 14.17 and 14.20 copy rows |
| C4+ | Shelf, letter and board pages (7) | `lore.json` pages (7M's schema), `CREDITS.md` rows |

**Requests to 6Z** (grants 8V does not hold):

- **R1.** The map `name` in `maps/hollowmere.json` and `maps/blackpine.json`, to read "HollowMere" and "BlackPine" (K12).
  Granted for the display `name` fields of maps and scenes: #243.
- **R2.** `roles.json` `thief` `goal` and `win`: "Escape by the sea door at the back of the cave holding 3 Heirlooms." (K4)
  Granted: #244.
- **R3.** K11 for the art session that owns `crumb_*`, which includes retiring `cf.compressor` for a new `cf.ice_chest`.
  Granted to 8V for the data and docs (#245); the art goes to 8I as a spec.

**Questions for the owner** (through 6Z):

- **Q1.** P1: should the secret bosses and the lab sit on BlackPine at night, or on a Grounds 99 variant of its scenes?
  Answered: "they are in there own variant scenes" (owner, through 6Z, 2026-10-24).
- **Q2.** P2: is the Secret Agent Village, Neutral or a third side, and does it deal only where P1 is built? Answered:
  "secret Agent is just the special hitman" and "yes, only on maps with bosses" (owner, through 6Z, 2026-10-24).
