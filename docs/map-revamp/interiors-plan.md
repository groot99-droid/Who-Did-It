# Map revamp: the interiors plan

Written 2026-11-12 by the orchestrator (session "Story mode", `session_01M5mAcY1JPqjhPmoZ8CZDFp`) for the owner and the
local "Blender tools setup" session, which build the interiors together. It restates no rule or number: rules live in
`docs/GDD.md`, frozen ids in `docs/WORLD.md` 4.3, and the pipeline in `tools/blender/README.md`.

**Canon is not decided here.** What a building is, who uses it, its name and its story are the owner's, worked out with
the local session. Where this plan lists a candidate use, it is a prompt for that conversation, not an answer.

## 1. What is built (base `753b563`)

- `meshy_import.py` and `meshy_catalog.json`: the owner's 75 Meshy models, sized and faced.
- `meshy_village_build.py`: HollowMere's exterior in 3D from `overworld.json`, at 1.5 m per tile.
  - It places nine buildings: `manor`, `barn`, `bakery`, `apoth`, `widow`, `tavern`, `chapel`, `netloft` and the fisher's cottage.
  - It also places the square, the quay, the dock, the station with the Daily Train, the walls and a forest belt.
- `meshy_village_look.py`: the approved night look (`meshy_looks/final.json`).
- `meshy_village_fly.py`: the fly-through.
- **Not built yet:**
  - No interior exists in 3D.
  - The woods and the mine (Gallows Wood, the Fenwood, the Tin Gallery mouth, the Flooded Gallery and the sea door, which
    opens on the frozen lake) are in progress on `claude/blender-hollowmere-3d`.
  - The village outskirts beyond the playable map are being built as a draft for the owner's review (section 3).

**Owner decisions of 2026-11-12, relayed by the local session:**
- All 75 Meshy models are HollowMere's, and BlackPine has none, even where a model's name or lettering says BlackPine.
  Lettering stays as modelled (BLACKPINE MINING CO., VANE SAWMILL, TYCOON'S MANOR).
- Only the sea door's lake is frozen. The village mere stays open water.

## 2. The interiors that already exist as scenes

Each one is a tile grid in `packages/content/data/scenes/<id>.json`, with its portals, spawns, spots, props, lights and
material letters. A 3D interior is built from that file. Its ids are frozen; its geometry may change (WORLD 4.3, rule 4).

| Exterior model (catalog) | Interior scenes (tiles) | Map | Profile |
|---|---|---|---|
| `The_Drowned_Lantern` | `tavern_bar` 20x12, `tavern_back` 12x10 | HollowMere | Small |
| `Mallory_Apothecary` | `apoth_shop` 18x11, `apoth_loft` 12x9 (dark) | HollowMere | Small |
| `Frontier_Bakery` | `bakery` 18x11, plus `crumb_oven`, `crumb_mixing`, `crumb_proofing`, `crumb_cold` | HollowMere | Small |
| `widow_cottage` | `widow_parlour` 16x11, `widow_bedroom` 12x9 | HollowMere | Small |
| `fisher_cottage` | `cottage_fisher` 12x9 | HollowMere | Small |
| `Tycoon_s_Manor` | `manor_hall` 28x16, `manor_upper` 24x12 | HollowMere | Medium |
| `Hale_Barn` | `barn` 20x12 | HollowMere | Medium |
| `Vicars_Chapel` | `chapel` 18x12, `cellar` 28x16 (dark; also reached by the well and the tavern trap) | HollowMere | Large |
| `Frostbitten_Fisherman_s_Wharf` (`netloft`) | **none, by the owner's decision (2026-11-12)**: exterior only, with no door portal and no scene | HollowMere | n/a |
| `Frostbound_County_Jail` (the Constable's lock-up, draft) | `cj_cell` 12x8 (in no map; no portals) | none | n/a |

That makes 16 HollowMere interior scenes, plus the jail cell. BlackPine's interiors (`bp_lodge`, `bp_mill`, `bp_office`,
`bp_smithy`, and its woods and caves) have no Meshy model by the owner's decision. Their 3D look is not part of this plan.

## 3. The buildings with no place on the map yet

These catalog buildings have no scene and no footprint in the game data. All are HollowMere's. The placement below is the
local session's **working draft** (2026-11-12), being built for the owner to review in stills. Nothing is final until the
owner says so. The last column is what the data side still needs.

| Model | Draft place and use (local session) | Still to settle |
|---|---|---|
| `Frostwood_Sawmill` (VANE SAWMILL), `log_pond_landing`, `log_chute` | outskirts: on a beck into the mere | interior? |
| `Frostbound_Freight_Dock`, `powder_kegs` | outskirts railyard, on a `Frostbound_Rails` siding | landmark |
| `The_Winter_Forge` | outskirts railyard | interior? |
| `Blackpine_Mining_Office_Bank` | outskirts railyard: the Company Bank | interior? |
| `Frostbound_Union_Hall`, `notice_board_2` | outskirts railyard | interior? |
| `Blackpine_Bunkhouse`, `shift_bell_post` | outskirts railyard | interior? |
| `Frontier_Post_Office` | outskirts: Station Street | interior; which role's building |
| `Frostbound_County_Jail` | Station Street: the Constable's lock-up | is `cj_cell` its interior? |
| `Frontier_Detective_Bureau` | Station Street: a courthouse | interior; which role's building |
| `Frostbound_Outpost` | hills: the Bandit's hideout (the owner's word) | interior |
| `Frostbound_Waystation` | hills: up the line | interior? |
| `Frosted_Hearth_Cabin` | hills: a trapper's cabin | interior? |
| `Frostwood_Witch_Hut` | hills: a crooked cottage | whose; interior? |
| `Frostgrave_Chapel` | the western woods: the Dark Mass chapel | interior; the rite site? |
| `Frozen_Crypt_of_Bones` | beyond the chapel yard | interior? |
| `broken_trestle`, `cliff_section` | hills | landmarks |
| `Abandoned_Tin_Mine` | Gallows Wood (the Tin Gallery's face) | none: `cave_entry` exists |
| `Frostbound_Witch_Hut` | Gallows Wood: the gamekeeper's stall | open-fronted: no interior |
| `mother_moll_hut`, `charcoal_kiln`, `hanging_oak`, `mine_adit` | the Fenwood | interior for the hut? |

**Draft caveat: the outskirts.** The outskirts lie **outside the playable map**. A building there needs a door portal
and a scene before a player can enter it. Section 5 covers that: a new scene id, and either a bigger overworld or a new
exterior scene of its own.

**Interiors the GDD already plans but no scene has.** A new building here may be the place for one of these. That is the
owner's call:
- each role's own building (story handoff, open decision 4, about the anti-theme buildings);
- the Zealot's hideout with the Medium's rite site (open decision 2);
- the Detective's office and the post office (round 6 and round 8 HQ tiers);
- the gamekeeper's lodge.

## 4. How a 3D interior is built (pipeline)

One new script, `tools/blender/meshy_interior_build.py`, mirrors `meshy_village_build.py` for any interior scene:

1. **Read** `scenes/<id>.json`: the grid, the material letters, the props, the lights, the portals and the spawns.
2. **Shell:** floor and walls from the grid at the same 1.5 m per tile. Wall height and ceiling come from one table per
   biome (`house`, `cave`). Material letters map to Poly Haven roles, as `GROUND_ROLES` does outside.
3. **Doors:** every portal tile becomes a door, stair or hatch frame on its wall. Its id stays in the object name, so the
   game data and the 3D scene line up.
4. **Props:** each prop id maps to a model through one table in the script. The sources are Meshy small props, the 14
   Poly Haven models and the kit. An unmapped prop gets a labelled grey box, so nothing is silently dropped.
5. **Lights:** the scene's `lights[]` with the village's light kinds. A `dark` scene keeps only its own lamps.
6. **Look:** a `meshy_looks/interior_*.json`, one per mood (warm house, dark house, cave), with the same keys as the
   village look.
7. **Outputs:** `build/<sceneId>.blend` (git-ignored), plus `--preview` stills, the same as the village.
8. **Game renders (Q4: the 3D interiors replace the old interior art):** an orthographic camera at the game's isometric
   angle, framed on the scene's tile grid, so each tile lands where the client draws it. The output format and the
   client manifest are settled in the data/client PR (section 7).

**Decision to make first: the scale.** An interior grid is bigger than its shell. `tavern_bar` is 20x12 tiles, 30x18 m at
1.5 m per tile, while `The_Drowned_Lantern` is about 11 m long. Choose one:
- (a) interiors are their own spaces and need not fit the shell, as in the 2.5D game today;
- (b) interiors use a smaller tile size (about 0.75 m per tile);
- (c) the interior grids shrink, which is a geometry change (allowed, ids kept) but touches gameplay.

Option (a) changes no game data.

## 5. Adding a brand-new building to the game

The 3D side and the data side are separate pull requests. The data PR follows the frozen-id rules (WORLD 4.3) and ships
its GDD text in the same PR (CLAUDE.md):

- **A new scene id** appended to `SCENE_IDS` (never reused or renamed) and a new two-letter prefix. Prefixes in use:
  `al as bk ba bc bd bl bs bm bo bf bw ce cg cl ch cj fc cf cm co cp fo fd mh mu ov se tk tb wb wp`.
- **On the map:** a `buildings[]` entry (`<p>.bld_<name>`) with its footprint, and a door portal on its south or east face.
- **The scene file:** with its portal back, its spawns and its profile. Add the nav file with the grid exporter.
- **Docs:** the WORLD 4.3 table row and the GDD 3.13 text. Add a DECISIONS row if a rule changes.
- **Checks:** the validator and the scene tests stay green. A building outside the current profile renders boarded.
- **3D:** add an entry in `BUILDINGS` in `meshy_village_build.py` (exterior), and later the interior through section 4.

## 6. Order of work

1. **Woods and mine** (in progress, local session). Interiors start when that PR is open.
2. **Pipeline:** `meshy_interior_build.py` and the scale decision, proven on one small room (`cottage_fisher` or
   `widow_bedroom`).
3. **HollowMere, Small profile:** `tavern_bar` and `tavern_back`, `apoth_shop` and `apoth_loft`, `bakery` and its four
   rooms, and `widow_parlour` and `widow_bedroom`.
4. **HollowMere, Medium and Large:** `manor_hall` and `manor_upper`, `barn`, `chapel` and `cellar`.
5. **New buildings:** in the order the owner settles section 3. Each one is a data PR plus a 3D pass.
6. **The jail cell** `cj_cell`, whenever it suits. It stands alone and has no exterior on any map.

## 7. Who does what

- **Owner and the local session:**
  - canon, the look, which models go where;
  - all Blender work, on `claude/blender-hollowmere-3d` or a branch per stage, each with a draft PR into the base;
  - run `pnpm prettier --write` on changed files before each push.
- **Story mode (cloud), only when asked:**
  - the data PRs for new scenes (ids, portals, validator, GDD and WORLD rows);
  - CI, merge timing and story-mode hooks;
  - after the R8 work, the story sections that use the new places.
- **Nothing merges into the base** without the owner's word and green CI, because merging deploys.

## 8. Open questions for the owner

1. ANSWERED (owner, 2026-11-12): option (a). Rooms are their own spaces, as in the game today. A 3D interior is built from
   its scene grid at 1.5 m per tile and need not fit inside the exterior model, so no game data changes for scale.
2. For each building in section 3: what it is, which map it stands on, and whether it has an interior.
3. ANSWERED (owner, 2026-11-12): the net loft gets no interior. It stays exterior only.
4. ANSWERED (owner, 2026-11-12, relayed by the local session): "the 3d interiors replace the old interior art". Interior
   renders must therefore line up with the game's isometric camera and each scene's tile grid, and be loadable by the
   client; stills and film alone are not enough. How the client takes them in (asset format, manifest, and whether the
   exterior moves to 3D art too) is a later data/client PR by Story mode, opened once the pipeline (section 6, step 2)
   produces its first room.
