# Round 11: the prop list (P1)

Every prop of the 31 scenes against the art that will draw it, for P3 (the prop drops). Docs only. Written by 11P
(`seams.md` 1). The look is `docs/round12/sprite-world.md`; the plan is `round11-plan-v2.md` 4.5. The owner's answer Q2
(A616) sets the split: **small objects come from the owner's pixel-art sheets, complex objects (64 to 128 px) are
rendered from the 3D prop models.** The sheets, the models index and the model overview are in the handoff
(`docs/round11/handoff/`: `sheet_village_props.png`, `sheet_tavern_interior.png`, `models-index.json`,
`prop-models.md`, `prop_models_overview.jpg`).

## 1. What is listed

A **prop** here is one entry of `props` in `packages/content/data/scenes/<scene>.json` (the 31 scenes, interiors and
exteriors; the `.nav.json` files are not scenes). 640 entries fall into **196 prop types**. The type is:

- the `kind`, for every kind except `dressing`, `decor`, `taskSource`, `rack` and `window`;
- for those five, the **id root**: the id without its scene prefix (`tb.`), without a trailing `_<n>`, and without a
  trailing `_b` or `_e` variant mark (`tb.bottle_shelf_b_1` is `bottle_shelf`; `mh.fireplace_e` is `fireplace`).

Section 5 lists the two other things the scenes draw that are not props: **spots** (hide and body spots) and
**buildings**. They are outside the 196 and need an answer (section 6, Q-P1).

## 2. The rules used

- **Small**: one tile or less, and rotation-safe (it looks the same from every heading): a single billboard. Round
  things (barrel, stool, pot, lamp post), sacks, piles, rocks. **Wall decals** (windows, portraits, lamps on a wall,
  plaques) are small too, as one frontal image on the wall plane that turns with the wall; that is _proposed_
  (`sprite-world.md` 2 draws walls as textured boxes), and they are counted in section 3 as "of which wall decal".
- **Complex**: larger than a tile, or it has a front (a table, a bed, a cart, a chest, a counter, a cabinet): four
  directions, one render per heading from a 3D model.
- A tile is taken as about a metre; the scene files give a footprint for only 24 props, so size is judged from the
  object. P3 corrects a class where the scene says otherwise.
- **Art source**, in order: a sheet frame for a small prop (`v###` is `sheet_village_props.png`, `t###` is
  `sheet_tavern_interior.png`; the frame numbers are the labels printed on the sheets); a model of `models-index.json`
  matched by `scene_prop_kinds` (`M`); a Poly Haven model or material of `tools/blender/materials/` (`PH`); else a
  named **GAP**. A sheet frame is one view, so it never serves a complex prop that has a front; it is named as a
  "one view" candidate in the gap's column. `(stand-in)` is the nearest model of another name, to be rendered until a
  real one exists. `alt` is a second candidate.
- The Poly Haven models of the lock (`polyhaven_models.lock.json`) are rocks, ferns, a stump, branches, a shrub, a root,
  a spade and one wooden lantern: they fill boulders, rock piles, rubble, ferns and the two lantern props, nothing
  indoors. Its materials (`polyhaven.lock.json`) are textures, not models.

## 3. Totals

| | Small | Complex | Total |
|---|---|---|---|
| **Prop types** | 90 | 106 | **196** |
| from the sheets | 28 | 1 | 29 |
| from the models | 45 | 77 | 122 |
| from Poly Haven | 7 | 0 | 7 |
| **named gaps** | 10 | 28 | **38** |

Of the 90 small types, 20 are wall decals. Of the 122 from models, 12 are stand-ins (a model of another name:
`bunks_n`, `bunks_s`, `footlocker`, `kitChest`, `ledger_desk`, `map_table`, `mess_table`, `refuge_table`, `side_table`,
`sacks`, `wall_lamp`, `wall_shelf`) and `coat_rack` uses `coat_hook_board`. By scene entries (640): 148 from sheets,
362 from models, 43 from Poly Haven, 87 in gaps. Of the 118 prop models, 112 are used; unused are `fishing_net` and
`scales` (no scene prop), `woven_rug` (bad), and `hay_bale`, `scarecrow`, `wooden_stool` (used as alternates only, the
sheets drawing those).

## 4. The handoff's known gaps, checked against the sheets

| Gap named in the handoff | Result |
|---|---|
| `barrel` (28 entries, 18 scenes) | **Closed by the tavern sheet**: t001, t002, t007, t008 (upright barrels) and v043. A barrel is round, so it is small |
| `bottle_crate` (10) | **Closed**: t025 (slatted crate), alt t017 |
| `tavern_table` (5) | **Closed if the tavern tables are round**: t058 is a round table, rotation-safe, so one view serves. t031 is a straight table top. Needs the owner (Q-P2) |
| `bar_counter` (4) | **Gap for the four views.** The tavern sheet has a straight piece (t030), a long one (t039) and an L corner (t050), one view each |
| `bar_counter_taps` (1) | **Gap.** No art in the sheets, the models or Poly Haven |
| `keg_rack` (1) | **Gap.** t003 is one keg on a stand, not a rack of kegs |
| `tin_crate` (10) | **Gap.** The sheets have plain crates (v041, v058, t017), none with the tin mark. They stand in until the mark is drawn |
| `woven_rug` (5 `rug`) | **Gap.** Poly Haven has no rug model; its materials `poly_wool_herringbone` and `hessian_380` can texture a flat plane (a ground decal) |

The other 33 gaps are new findings, mostly rules and BlackPine props that neither the sheets nor the models cover.
In order of entries: `tin_crate` 10, `mushrooms` 10, `timber_set` 8, `wheelbarrow` 6, `fallen_log` 5, `rug` 5, `bar_counter` 4,
`snare` 3, and 30 types of one or two entries: bank, bar_counter_taps, barbell, bell, bones, cart, chair, clamp, crepe,
cupboard, den, fence, flume, forge, gearing, hanging_oak, head_saw, keg_rack, kiln, noticeBoard, ore_cart, pegs,
pump_beam, rack_tally, saw_horse, shelves, tally_board, teachingClue, telephone, trestle.

## 5. The table

Columns: the prop type; entries in all scenes; the scenes (`×n` where a scene has more than one); the class; the art;
a note. Generated from the scene files by the method of section 7.

| Prop | n | Scenes | Class | Art | Note |
|---|---|---|---|---|---|
| `alms_box` | 1 | chapel | small | M `alms_box` |  |
| `altar` | 3 | bp_camp, chapel, overworld | complex | M `altar` |  |
| `anvil` | 1 | bp_smithy | small | sheet v042, v055 | v055 on a stump |
| `apoth_drawers` | 2 | apoth_shop ×2 | complex | M `apothecary_drawer_cabinet` |  |
| `armchair` | 4 | manor_hall, manor_upper, widow_parlour ×2 | complex | M `armchair` | faces a heading |
| `axe_block` | 4 | bp_camp, bp_mill, bp_woods ×2 | small | sheet v119 | log with an axe |
| `bank` | 1 | bp_office | complex | **GAP** | bank counter (GDD 3.29); `shop_counter_till` is the nearest stand-in |
| `bar_counter` | 4 | tavern_bar ×4 | complex | **GAP**: one view only: t030, t039, t050 (corner) | not rotation-safe, so it needs 4 views; the tavern sheet has straight, long and L pieces |
| `bar_counter_lamp` | 1 | tavern_bar | small | M `hanging_bar_lamp` | hanging lamp, rotation-safe |
| `bar_counter_taps` | 1 | tavern_bar | complex | **GAP** | no tap art in the sheets or the models |
| `barbell` | 1 | cj_cell | small | **GAP** |  |
| `barrel` | 28 | apoth_loft, apoth_shop, bakery ×2, barn, bp_camp ×2, bp_deep, bp_lodge, bp_mill, bp_office, bp_smithy, cave_gallery, cellar ×2, crumb_mixing, forest, forest_deep, overworld ×5, tavern_back ×2, tavern_bar ×3 | small | sheet t001, t002, t007, t008; also v043 | round, rotation-safe. Listed as a gap in the handoff; the tavern sheet has it |
| `basin` | 4 | apoth_shop, bakery, bp_lodge, bp_smithy | small | sheet v051 | water basin; alt M `wash_basin` |
| `bed` | 12 | apoth_shop, bakery, barn, bp_lodge, bp_mill, bp_office, bp_smithy, manor_hall, manor_upper, tavern_bar, widow_bedroom, widow_parlour | complex | M `single_bed` | not rotation-safe; `single_bed` has an alternate copy |
| `bell` | 2 | bp_camp, overworld | small | **GAP** | a bell on a post (village and camp) |
| `bench` | 4 | apoth_shop, bp_camp, bp_office, cj_cell | complex | M `workbench` | 2 tiles wide; the `workbench` model; v033 is a one-view alternate |
| `birdcage` | 1 | widow_parlour | small | M `birdcage` |  |
| `blackMarket` | 2 | bp_lodge, tavern_back | small | M `black_market_stash_crate` | one crate, 1 tile |
| `blanket_chest` | 4 | forest_deep, manor_upper ×2, widow_bedroom | complex | M `blanket_chest` | has a front |
| `bones` | 1 | forest_deep | small | **GAP** |  |
| `bookcase` | 12 | manor_hall ×10, manor_upper ×2 | complex | M `bookcase` | t005 is a one-view alternate |
| `boot_rack` | 2 | manor_hall, widow_parlour | complex | M `boot_rack` |  |
| `bottle_crate` | 10 | apoth_loft, apoth_shop, cellar ×2, crumb_cold ×2, forest, overworld, tavern_back, tavern_bar | small | sheet t025; alt t017 | slatted crate. Listed as a gap in the handoff; the tavern sheet has it |
| `bottle_shelf` | 4 | tavern_bar ×4 | complex | M `bottle_shelf` | t004_c is a one-view alternate |
| `boulder` | 10 | forest ×5, forest_deep ×3, overworld ×2 | small | PH Poly Haven model `rock_07`; alt `rock_moss_set_01` | rotation-safe rock |
| `bread_basket` | 4 | bakery ×3, overworld | small | M `bread_basket` |  |
| `bread_case` | 3 | bakery ×3 | complex | M `bread_display_case` |  |
| `bread_shelf` | 6 | bakery ×4, crumb_oven ×2 | complex | M `bread_shelf` |  |
| `brickOven` | 1 | crumb_oven | complex | M `big_brick_oven` |  |
| `bucket` | 4 | bp_camp, bp_deep, bp_lodge, bp_smithy | small | sheet v028, v029; t015 with a ladle |  |
| `bunks_n` | 1 | bp_lodge | complex | M `single_bed` tiled along the footprint (stand-in) | bunk rows, footprint 7x2; no bunk model |
| `bunks_s` | 1 | bp_lodge | complex | M `single_bed` tiled along the footprint (stand-in) | bunk rows, footprint 7x2; no bunk model |
| `candle_stand` | 2 | chapel ×2 | small | M `candle_stand` |  |
| `card_table` | 1 | tavern_back | complex | M `card_table` |  |
| `cart` | 1 | bp_camp | complex | **GAP** | v102 is a wheelbarrow, one view |
| `chair` | 1 | bp_office | complex | **GAP** | has a front; the sheets have only the round stool |
| `chalkboard` | 4 | bakery, crumb_mixing, crumb_proofing, tavern_bar | complex | M `chalkboard_easel` | an easel: free-standing |
| `clamp` | 1 | forest_deep | complex | **GAP** | Mother Moll's charcoal clamp, a 2x2 mound (WORLD) |
| `clock` | 3 | bakery, manor_hall, widow_parlour | complex | M `grandfather_clock` | a standing grandfather clock; has a front |
| `coat_rack` | 2 | bp_lodge, bp_office | complex | M `coat_hook_board` (alias; the model has no scene kind) | a wall board with hooks |
| `coat_stand` | 3 | apoth_shop, manor_hall, widow_parlour | small | M `coat_stand` | free-standing, rotation-safe |
| `cobweb` | 4 | cellar ×4 | complex | M `cobweb_corner` | a corner decal: fixed to its corner |
| `coldShelves` | 1 | crumb_cold | complex | M `cold_storage_shelf` |  |
| `cold_shelf` | 3 | crumb_cold ×3 | complex | M `cold_storage_shelf` |  |
| `compressor` | 1 | crumb_cold | complex | M `refrigeration_compressor` |  |
| `cooling_rack` | 5 | bakery ×3, crumb_oven ×2 | complex | M `cooling_rack` |  |
| `cot` | 2 | chapel, cottage_fisher | complex | M `child_cot`, M `vestry_cot` |  |
| `couche_rack` | 2 | crumb_proofing ×2 | complex | M `couche_proofing_rack` |  |
| `counter` | 8 | apoth_shop, bakery, bp_camp, bp_lodge ×2, forest, overworld, tavern_bar | complex | M `shop_counter_till` |  |
| `counter_case` | 4 | apoth_shop ×4 | complex | M `glass_display_counter_case` |  |
| `crate` | 2 | bp_mine, bp_smithy | small | sheet v041, v058 | plain crate |
| `crates` | 9 | bp_camp ×3, bp_deep, bp_lodge, bp_mill, bp_mine, bp_office, bp_smithy | small | sheet v064_a, v064_b, v077, v090 | crate stacks |
| `crepe` | 1 | overworld | small | **GAP** | the black crepe on the manor door (WORLD 5): a hanging cloth |
| `cupboard` | 1 | bp_office | complex | **GAP** |  |
| `dartboard` | 1 | tavern_bar | small (wall decal) | M `dartboard` | wall-mounted |
| `deadLoaf` | 3 | bakery ×3 | small | M `dead_loaf` |  |
| `den` | 1 | forest_deep | complex | **GAP** | the wolf den: a dugout |
| `dining_table` | 2 | cottage_fisher, manor_hall | complex | M `dining_table`, M `fisherman_dining_table` | two models: `dining_table`, `fisherman_dining_table` |
| `doughMixer` | 1 | crumb_mixing | complex | M `dough_mixer` |  |
| `dough_trough` | 1 | crumb_mixing | complex | M `dough_trough` |  |
| `draped_window` | 7 | manor_hall ×2, manor_upper ×2, widow_bedroom, widow_parlour ×2 | small (wall decal) | M `draped_curtain_window` | wall-mounted |
| `dressing_table` | 2 | manor_upper, widow_bedroom | complex | M `dressing_table` |  |
| `drowned_lantern` | 1 | forest_deep | small | PH Poly Haven model `wooden_lantern_01` (stand-in) | the drowned lantern in the fog |
| `drying_frame` | 3 | apoth_loft ×2, overworld | complex | M `drying_frame` |  |
| `fallen_log` | 5 | forest ×2, forest_deep, sea_exit ×2 | complex | **GAP**: v114, v119 are single logs | 2 to 3 tiles long; lies along one axis |
| `feed_trough` | 3 | barn ×2, overworld | complex | M `feed_trough` |  |
| `fence` | 1 | overworld | complex | **GAP**: v087, v100 are one-view pieces | a run of fence; not rotation-safe |
| `fern` | 16 | forest ×7, forest_deep ×5, overworld ×4 | small | PH Poly Haven model `fern_02` |  |
| `fireplace` | 3 | cottage_fisher, manor_hall, widow_parlour | complex | M `inglenook_fireplace`, M `brick_fireplace`, M `cottage_fireplace` |  |
| `firewood` | 5 | bp_camp ×2, bp_lodge, bp_woods ×2 | small | sheet v115, v118 |  |
| `flourBin` | 1 | tavern_bar | complex | M `flour_bin` |  |
| `flour_sacks` | 16 | apoth_loft, apoth_shop, bakery ×3, barn, cellar, crumb_mixing ×3, crumb_oven, crumb_proofing ×2, overworld ×2, tavern_back | small | M `flour_sacks` | a sack pile, rotation-safe; v035_a, v036 are one-view alternates |
| `flower_stand` | 3 | chapel ×2, overworld | small | M `flower_stand` |  |
| `flume` | 1 | bp_camp | complex | **GAP** | the mill flume, a long wooden channel |
| `font` | 1 | chapel | small | M `baptismal_font` | baptismal font, round |
| `footlocker` | 4 | bp_lodge ×4 | complex | M `blanket_chest` (stand-in) | no footlocker model |
| `forge` | 1 | bp_smithy | complex | **GAP**: v116 is a kiln, one view | smithy forge |
| `gasPocket` | 2 | cellar ×2 | small | M `gas_pocket_vent` |  |
| `gearing` | 1 | bp_mill | complex | **GAP** | mill gearing |
| `goat` | 1 | barn | complex | M `goat_pen` | `goat_pen`, 2 tiles |
| `grindstone` | 2 | bp_camp, bp_smithy | small | sheet v059 |  |
| `hanging_oak` | 1 | forest_deep | complex | **GAP** | a tree, 2x2 |
| `harness_rack` | 2 | barn ×2 | complex | M `harness_rack` |  |
| `hay_bale` | 7 | barn ×5, overworld ×2 | small | sheet v079, v035_a; M alt `hay_bale` | hay is rotation-safe |
| `head_saw` | 1 | bp_mill | complex | **GAP** | the mill's head saw, 3x2 |
| `herb_rack` | 4 | apoth_loft ×2, apoth_shop ×2 | complex | M `hanging_herb_rack` | hangs from a beam |
| `hq` | 12 | apoth_shop, bakery, bp_camp ×2, bp_lodge ×2, bp_office, bp_woods, forest, overworld ×3 | complex | M `company_desk` | `company_desk` |
| `hymn_board` | 1 | chapel | small (wall decal) | M `hymn_board` | wall-mounted |
| `inglenook` | 1 | tavern_bar | complex | M `inglenook_fireplace` |  |
| `innBed` | 1 | tavern_back | complex | M `inn_bed` |  |
| `jar_shelf` | 6 | apoth_loft, apoth_shop ×5 | complex | M `jar_shelf` |  |
| `keg_rack` | 1 | tavern_bar | complex | **GAP** | a rack of kegs; t003 is one keg on a stand |
| `keyCache` | 2 | barn, cellar | small | M `hidden_key_cache` |  |
| `kiln` | 2 | bp_woods ×2 | complex | **GAP**: v116 is a kiln, one view | 2 in BlackPine woods |
| `kitChest` | 2 | bp_camp, overworld | complex | M `blanket_chest` (stand-in) | the town kit chest |
| `lamp` | 3 | apoth_loft, cj_cell, widow_bedroom | small (wall decal) | M `wall_oil_lamp` | wall oil lamp |
| `lamp_post` | 4 | bp_mill ×2, bp_mine, bp_woods | small | sheet v001, v002 | a post with a lantern |
| `lamp_table` | 6 | bakery, manor_hall ×2, manor_upper ×2, widow_parlour | complex | M `lamp_table` |  |
| `lanternPost` | 8 | bp_camp ×4, overworld ×4 | small | sheet v001, v004, v005, v008, v040 | single and double lanterns |
| `lantern_hook` | 3 | barn ×3 | small (wall decal) | M `lantern_hook` | hangs on a wall |
| `lantern_pole` | 4 | forest, overworld ×3 | small | sheet v004, v005, v008 | double lanterns |
| `leaf_litter` | 9 | forest ×5, forest_deep ×3, overworld | small | PH Poly Haven material `forest_leaves_02` as a ground decal | a ground decal, not a billboard |
| `lectern` | 1 | chapel | complex | M `lectern` |  |
| `ledger` | 1 | bakery | complex | M `ledger_stand` | `ledger_stand` |
| `ledger_desk` | 1 | bp_office | complex | M `writing_desk` (stand-in) | a desk with a ledger |
| `leech_jar` | 2 | apoth_shop, overworld | small | M `leech_jar` |  |
| `letter_box` | 1 | widow_parlour | small (wall decal) | M `letter_box` | wall-mounted |
| `linen_press` | 2 | manor_upper, widow_bedroom | complex | M `linen_press` |  |
| `lockedDoor` | 1 | manor_upper | complex | M `locked_door` | a door; walls decide its heading |
| `log` | 6 | bp_camp ×2, bp_mill ×2, bp_woods ×2 | small | sheet v114 |  |
| `log_basket` | 5 | bakery, barn, crumb_oven ×2, tavern_bar | small | M `log_basket` |  |
| `mailbag` | 1 | overworld | small | sheet v036 | sack |
| `map_table` | 1 | bp_office | complex | M `dining_table` (stand-in) | a table with a map |
| `memorial` | 1 | chapel | small (wall decal) | M `memorial_plaque` | plaque, wall-mounted |
| `mess_table` | 1 | bp_lodge | complex | M `dining_table` (stand-in) | 6x2 mess table; the model tiled |
| `milk_churn` | 6 | barn, crumb_cold ×3, overworld ×2 | small | M `milk_churn` |  |
| `miners_lamp` | 1 | cave_gallery | small | PH Poly Haven model `wooden_lantern_01` (stand-in) |  |
| `mortar_table` | 1 | apoth_shop | complex | M `mortar_pestle_table` |  |
| `mushrooms` | 10 | forest ×5, forest_deep ×3, overworld ×2 | small | **GAP** | a cluster on the ground |
| `nightstand` | 2 | manor_upper ×2 | complex | M `nightstand` |  |
| `noticeBoard` | 2 | bp_camp, overworld | complex | **GAP**: v076_a is one view | a board has a front |
| `oil_barrel` | 1 | tavern_back | small | M `oil_barrel` |  |
| `ore_cart` | 2 | bp_mine, cave_gallery | complex | **GAP**: v102 is a wheelbarrow, one view |  |
| `ore_pile` | 4 | bp_camp, bp_deep, bp_mine, cave_gallery | small | sheet v105, v108 |  |
| `ossuary` | 2 | cellar ×2 | complex | M `ossuary` |  |
| `oven` | 2 | bakery, bp_lodge | complex | M `bread_oven` | `bread_oven` |
| `peel_rack` | 2 | bakery, crumb_oven | complex | M `baker_peel_rack` |  |
| `pegs` | 1 | bp_lodge | small (wall decal) | **GAP** | a row of pegs on a wall |
| `pew` | 6 | chapel ×6 | complex | M `church_pew` |  |
| `photos` | 2 | tavern_bar, widow_bedroom | small (wall decal) | M `photo_wall` | wall-mounted |
| `piano` | 1 | tavern_bar | complex | M `upright_piano` |  |
| `pit_prop` | 4 | cave_gallery ×4 | small | sheet v002 | a vertical timber post, rotation-safe |
| `plank_stack` | 1 | bp_mill | small | sheet v057; M alt `plank_stack` |  |
| `planks` | 4 | barn, cellar, forest, overworld | small | M `plank_stack` |  |
| `plate` | 10 | bakery ×10 | small | M `bread_plate` | `bread_plate` |
| `portrait` | 1 | widow_parlour | small (wall decal) | M `framed_family_portrait` | wall-mounted |
| `powder_kegs` | 1 | bp_mine | small | sheet t003, t007, t008 | kegs |
| `proofingCabinet` | 1 | crumb_proofing | complex | M `proofing_cabinet` |  |
| `pulpit` | 1 | chapel | complex | M `pulpit` |  |
| `pump` | 2 | bp_camp, overworld | small | sheet v074_a | covered well; the pump itself has no art |
| `pump_beam` | 1 | cave_gallery | complex | **GAP** | a pump beam, 2x3 |
| `rack_tally` | 1 | bp_mill | complex | **GAP** | the mill tally rack |
| `refuge_table` | 1 | bp_deep | complex | M `dining_table` (stand-in) |  |
| `rock_pile` | 4 | bp_camp, bp_deep, bp_mine ×2 | small | PH Poly Haven model `rock_moss_set_01` |  |
| `rope` | 2 | chapel, cottage_fisher | small | M `rope_coil`, M `bell_rope` | chapel bell rope (`bell_rope`) and a coil |
| `rope_coil` | 3 | bp_deep, bp_mill, bp_mine | small | M `rope_coil` |  |
| `rubble` | 2 | cave_gallery ×2 | small | PH Poly Haven model `rock_moss_set_02` |  |
| `rug` | 5 | apoth_shop, bakery, tavern_bar, widow_bedroom, widow_parlour | complex | **GAP** | `woven_rug` is a flat green leaf patch. Poly Haven has no rug model; its materials `poly_wool_herringbone` or `hessian_380` can texture a flat plane (a ground decal, not a billboard) |
| `sacks` | 3 | bp_lodge, bp_office, bp_woods | small | `grain_sack` (extra model) |  |
| `safe` | 2 | bp_office, manor_hall | complex | M `iron_safe` |  |
| `saw_horse` | 2 | bp_camp, bp_mill | complex | **GAP** |  |
| `sawdust` | 2 | tavern_bar ×2 | small | M `sawdust_pile` |  |
| `scarecrow` | 2 | barn, overworld | small | sheet v085, v009 | scarecrow; M alt `scarecrow` |
| `scrub_pail` | 1 | cj_cell | small | sheet v028 |  |
| `settle` | 7 | apoth_shop, bakery, overworld ×4, tavern_bar | complex | M `settle_bench` |  |
| `shaping_table` | 3 | bakery, crumb_mixing ×2 | complex | M `shaping_table` |  |
| `shelf` | 2 | apoth_shop, crumb_mixing | small (wall decal) | M `wall_shelf_bottles` | wall shelf (`wall_shelf_bottles`) |
| `shelves` | 1 | bp_office | complex | **GAP** | bp_office shelves; nearest `store_shelf` |
| `ship_wheel` | 1 | tavern_bar | small (wall decal) | M `ship_wheel` | wall-mounted |
| `show_globe` | 1 | apoth_shop | small | M `show_globe` |  |
| `shutters` | 1 | tavern_bar | small (wall decal) | M `shuttered_window` | a window |
| `side_table` | 2 | bp_lodge, bp_office | complex | M `tea_table` (stand-in) |  |
| `sideboard` | 2 | manor_hall, widow_parlour | complex | M `sideboard` |  |
| `signpost` | 6 | bp_camp, bp_woods, forest ×2, forest_deep, overworld | small | sheet v075, v002 | arrow board on a post |
| `snare` | 3 | forest ×3 | small | **GAP** |  |
| `sparring_post` | 1 | cj_cell | small | sheet v003 | training dummy |
| `stained_glass` | 5 | chapel ×5 | small (wall decal) | M `stained_glass_panel`, M `stained_glass_saint` | wall-mounted |
| `still` | 1 | apoth_shop | complex | M `copper_still` | `copper_still` |
| `stool` | 4 | bp_deep, bp_lodge, bp_smithy, cj_cell | small | sheet t057; M alt `wooden_stool` | round, rotation-safe |
| `store_shelf` | 4 | tavern_back ×4 | complex | M `store_shelf` |  |
| `stump` | 15 | bp_woods ×7, forest ×4, forest_deep ×2, overworld ×2 | small | sheet v031, v032; PH alt `tree_stump_01` |  |
| `tally_board` | 1 | bp_mine | complex | **GAP** | a tally board |
| `tavern_table` | 5 | tavern_bar ×5 | complex | sheet t058 (round); t031 is a one-view table top | a round table is rotation-safe, so one view serves. Listed as a gap in the handoff. Needs the owner to confirm the tavern tables are round |
| `tea_table` | 1 | widow_parlour | complex | M `tea_table` |  |
| `teachingClue` | 2 | bp_camp, overworld | small | **GAP** | the teaching clue (a paper); a rules prop |
| `telephone` | 1 | bp_office | small | **GAP** |  |
| `tide_chart` | 1 | tavern_bar | small (wall decal) | M `tide_chart` | wall-mounted |
| `timber_set` | 8 | bp_camp, bp_deep ×2, bp_mine ×5 | complex | **GAP** | a mine timber frame |
| `tin_cabinet` | 10 | manor_hall ×10 | complex | M `tin_cabinet` |  |
| `tin_crate` | 10 | apoth_loft, apoth_shop, bp_deep, cave_entry, cave_gallery, cellar, crumb_cold, overworld ×2, tavern_back | small | **GAP**: stand-ins: v041, v058, t017 | a crate with the tin mark; no sheet or model has the mark |
| `tool_rack` | 3 | barn, bp_smithy, cottage_fisher | complex | M `tool_rack` |  |
| `trestle` | 1 | bp_camp | complex | **GAP** | a 3x2 trestle |
| `vane_portrait` | 2 | manor_hall, manor_upper | small (wall decal) | M `tall_vane_family_portrait` | wall-mounted |
| `votive_rack` | 1 | chapel | complex | M `votive_rack` |  |
| `wakeTable` | 1 | bakery | complex | M `wake_table` |  |
| `wall_bulb` | 5 | crumb_cold, crumb_oven, crumb_proofing ×3 | small (wall decal) | M `wall_light_bracket` |  |
| `wall_lamp` | 1 | bp_smithy | small (wall decal) | M `wall_oil_lamp` (stand-in) |  |
| `wall_shelf` | 3 | bp_lodge, bp_office ×2 | small (wall decal) | M `wall_shelf_bottles` (stand-in) |  |
| `washstand` | 2 | manor_upper, widow_bedroom | complex | M `washstand` |  |
| `water_bucket` | 6 | barn ×2, cellar, crumb_mixing, crumb_oven, overworld | small | M `water_bucket` |  |
| `wheelbarrow` | 6 | bp_camp ×2, bp_deep, bp_mill, bp_mine, bp_woods | complex | **GAP**: v102, one view | has a front |
| `window` | 7 | apoth_shop, bp_lodge, bp_mill ×2, bp_office, bp_smithy, cj_cell | small (wall decal) | M `shuttered_window` | wall-mounted |
| `wine_cask` | 5 | cellar ×4, overworld | small | M `wine_cask` | an upright cask |
| `woodpile` | 3 | forest, forest_deep ×2 | small | sheet v104, v115, v118 | v104 is a large stack |
| `workbench` | 2 | bp_mill, bp_smithy | complex | M `workbench` |  |
| `writing_desk` | 1 | widow_parlour | complex | M `writing_desk` |  |

## 5.1 Not props: hide spots, body spots and buildings

`spots` has 85 entries of 51 variants (kind/variant, below). Only 26 of the 85 have a prop within a tile, so most of
them are an object that no prop draws (`hollowTree`, `wardrobe`, `stalagmite`, `bog`, `cratePile`). `buildings`
has 14 entries (the exterior art of the overworld, BlackPine and the Fenwood), drawn by the map revamp (M1, M2), not by
the prop drops.

| Spot `kind/variant` | n | Scenes |
|---|---|---|
| `body/bog` | 1 | forest_deep |
| `body/charcoalPit` | 1 | forest_deep |
| `body/cratePile` | 4 | cottage_fisher, crumb_cold, sea_exit, tavern_back |
| `body/cryptNiche` | 1 | chapel |
| `body/dumpSpot` | 1 | cellar |
| `body/flourSacks` | 1 | crumb_proofing |
| `body/hayPile` | 1 | barn |
| `body/logChute` | 1 | bp_mill |
| `body/oldStope` | 1 | bp_mine |
| `body/pool` | 1 | bp_woods |
| `body/poolNiche` | 1 | cave_entry |
| `body/rootCellar` | 1 | bp_lodge |
| `body/strongroom` | 1 | bp_office |
| `body/sump` | 2 | bp_deep, cave_gallery |
| `body/trunk` | 2 | apoth_loft, crumb_mixing |
| `body/wardrobe` | 1 | widow_bedroom |
| `body/woodBox` | 1 | crumb_oven |
| `hide/atticHatch` | 1 | manor_upper |
| `hide/barrel` | 1 | bp_camp |
| `hide/behindCounter` | 4 | apoth_shop, bakery, bp_office, tavern_bar |
| `hide/breadRack` | 1 | crumb_oven |
| `hide/brush` | 4 | bp_woods, forest, forest_deep |
| `hide/bunk` | 1 | bp_deep |
| `hide/cart` | 1 | overworld |
| `hide/coalBin` | 1 | bp_smithy |
| `hide/confessional` | 1 | chapel |
| `hide/crates` | 2 | crumb_cold, overworld |
| `hide/crawlspace` | 3 | bp_camp, overworld, widow_parlour |
| `hide/curtain` | 1 | manor_hall |
| `hide/flourSacks` | 1 | crumb_mixing |
| `hide/hayPile` | 2 | barn |
| `hide/hedge` | 2 | overworld |
| `hide/herbLoft` | 1 | apoth_loft |
| `hide/hollowLog` | 1 | forest_deep |
| `hide/hollowTree` | 4 | bp_woods, forest |
| `hide/kegStack` | 1 | tavern_bar |
| `hide/logPile` | 2 | bp_camp, bp_woods |
| `hide/oreBin` | 1 | bp_camp |
| `hide/oreCart` | 1 | bp_mine |
| `hide/oreChute` | 1 | cave_gallery |
| `hide/orePillar` | 1 | bp_deep |
| `hide/pantry` | 1 | widow_parlour |
| `hide/reeds` | 1 | forest_deep |
| `hide/sawdustPile` | 1 | bp_mill |
| `hide/stalagmite` | 3 | cave_entry, sea_exit |
| `hide/timberCrib` | 2 | bp_mine, cave_gallery |
| `hide/trayStack` | 1 | crumb_proofing |
| `hide/underBed` | 6 | apoth_loft, bp_lodge, manor_upper, widow_bedroom |
| `hide/wardrobe` | 6 | bp_office, cottage_fisher, manor_hall, tavern_back, widow_bedroom |
| `hide/wineRack` | 2 | cellar |
| `hide/woodBox` | 1 | bp_lodge |

| Building | Scene | `art` | Footprint |
|---|---|---|---|
| `bc.bld_lodge` | bp_camp | `lodge` | 14x7 |
| `bc.bld_mill` | bp_camp | `mill` | 12x7 |
| `bc.bld_office` | bp_camp | `office` | 8x6 |
| `bc.bld_smithy` | bp_camp | `smithy` | 7x5 |
| `bc.bld_woodshed` | bp_camp | `woodshed` | 5x3 |
| `fd.bld_moll_hut` | forest_deep | `mollHut` | 4x3 |
| `ov.bld_manor` | overworld | `manor` | 13x6 |
| `ov.bld_barn` | overworld | `barn` | 10x5 |
| `ov.bld_bakery` | overworld | `bakery` | 6x4 |
| `ov.bld_apoth` | overworld | `apoth` | 10x8 |
| `ov.bld_widow` | overworld | `widow` | 8x7 |
| `ov.bld_tavern` | overworld | `tavern` | 12x7 |
| `ov.bld_chapel` | overworld | `chapel` | 9x8 |
| `ov.bld_netloft` | overworld | `netloft` | 5x9 |

## 6. Questions for the orchestrator (proposed defaults taken)

- **Q-P1. Who draws the 51 spot variants?** _Proposed_: P3 draws a spot with the art of the prop at its tile where one
  exists (26 of 85), and lists the rest as gaps in a follow-up of this list before P3 starts; the 14 buildings stay with
  M1 and M2.
- **Q-P2. Are the tavern tables round?** The scenes do not say. _Proposed_: yes, one round table from t058 serves the
  five, `_b` variants included; if a table is rectangular it is a complex prop and `tavern_table` joins the gaps.
- **Q-P3. Wall decals as one image on the wall plane.** _Proposed_: yes (section 2). If a decal must be a billboard,
  the 20 wall types turn complex.
- **Q-P4. The four sheet-closed gaps.** The handoff lists barrel, bottle_crate and tavern_table as gaps; the tavern
  sheet has art for all three. _Proposed_: use the sheet; the handoff note is out of date.

## 7. Method

The table is generated; nothing in `tools/` was added, because the list is a one-off and the scene ids are frozen
(CLAUDE.md). To regenerate: read every `packages/content/data/scenes/*.json` that is not `.nav.json`, take `props`,
and key each entry as in section 1:

```python
import re
def prop_type(p):
    if p['kind'] in {'dressing', 'decor', 'taskSource', 'rack', 'window'}:
        r = p['id'].split('.', 1)[1]
        r = re.sub(r'_\d+$', '', r); r = re.sub(r'_[be]$', '', r)
        return re.sub(r'_\d+$', '', r)
    return p['kind']
```

Models are matched by `scene_prop_kinds` of `models-index.json` (the six duplicate copies are left out); a few
aliases are by hand (`rope_coil`, `workbench`, `shutters`, `coat_rack`). Sheet frames were matched by eye from the two
contact sheets; the class and the stand-ins are judgments, listed here so that P3 can change them.
