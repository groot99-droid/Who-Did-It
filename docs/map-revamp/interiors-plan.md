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
  - BlackPine has no 3D yet.

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
| `Frostbitten_Fisherman_s_Wharf` (`netloft`) | **none**: the net loft has no door portal and no scene | HollowMere | n/a |
| `Blackpine_Bunkhouse` | `bp_lodge` 24x12 | BlackPine | Small |
| `Frostwood_Sawmill` | `bp_mill` 24x14 | BlackPine | Small |
| `Blackpine_Mining_Office_Bank` | `bp_office` 18x11 | BlackPine | Medium |
| `The_Winter_Forge` | `bp_smithy` 16x11 | BlackPine | Medium |
| `Frostbound_County_Jail` | `cj_cell` 12x8 (in no map; no portals) | none | n/a |

That makes 21 interior scenes, or 22 counting the jail cell.

## 3. The buildings with no place on the map yet

These catalog buildings have no scene and no footprint on any map. The owner and the local session decide what each one
is, which map it stands on, and whether it gets an interior at all.

| Model | What the model shows (catalog note, shortened) | Questions to settle |
|---|---|---|
| `Frontier_Detective_Bureau` | two-storey timber courthouse, blue trim, false front | which role's building; interior rooms |
| `Frontier_Post_Office` | plank post office, red trim, porch of parcels | which role's building; sorting room, telegraph |
| `Frostbound_Union_Hall` | large two-storey L-shaped log hall, slate roofs | which map; what meets there |
| `Frosted_Hearth_Cabin` | plank cabin, big stone chimney, porch of tools | whose cabin |
| `Frostbound_Witch_Hut` | open-fronted hut or stall, horned finials | stall (no interior) or hut |
| `Frostwood_Witch_Hut` | crooked fairy-tale log cottage, dead tree | whose; woods or village |
| `mother_moll_hut` | one-room sod-roof log cabin | the Fenwood names Mother Moll's hut: does it get an interior? |
| `Frostgrave_Chapel` | gothic chapel, red lancet windows, bell-cote | a second chapel: whose, where |
| `Frozen_Crypt_of_Bones` | crypt door in a rocky hillside | crypt interior, or a way into the Undercroft |
| `Frostbound_Outpost` | palisaded lookout on a rock outcrop, watchtower | where; interior or landmark |
| `Frostbound_Waystation` | raised platform with a log cabin | a second stop on the line? |
| `Frostbound_Freight_Dock` | raised loading platform, crates | landmark only |
| `Abandoned_Tin_Mine` | rock outcrop with the TIN GALLERY adit | likely the Gallows Wood face of `cave_entry` |
| `mine_adit` | timber mine portal in rock | likely BlackPine's `bp_mine` adit |
| `charcoal_kiln`, `log_chute`, `log_pond_landing` | BlackPine and Fenwood workings | exterior landmarks; `log_pond_landing` has a cabin |

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
6. **BlackPine:** its exterior from `bp_camp.json`, then `bp_lodge`, `bp_mill`, `bp_office`, `bp_smithy`, and the caves and
   woods after HollowMere's.
7. **The jail cell** `cj_cell`, whenever it suits. It stands alone and has no exterior on any map.

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

1. The scale (section 4): (a), (b) or (c)?
2. For each building in section 3: what it is, which map it stands on, and whether it has an interior.
3. Does the net loft (`netloft`) get an interior?
4. Should the 3D interiors replace the game's 2.5D interior art (sprites rendered from them), or are they for film and
   look development only, as the village is today?
