"""HollowMere for a first-person walk: one glTF binary (`build/hollowmere_walk.glb`) for a Three.js viewer with capsule
collision, from the built 3D scenes (`meshy_village_build.py`, `meshy_wild_build.py`) and the first-person rooms
(`meshy_room_build.py`). v1.2.

    bash bl.sh -b --factory-startup -P tools/blender/meshy_walk_export.py -- --areas village [--keep-blend]
        [--out tools/blender/build/hollowmere_walk.glb] [--report <json>] [--no-bake] [--tree-near-m 60]
        [--rooms <sceneId,...> [--rooms-dir tools/blender/build/rooms]] [--max-lights 24] [--tex-budget-mb 255]
    bash bl.sh -b --factory-startup -P tools/blender/meshy_walk_export.py -- --base-blend
        tools/blender/build/hollowmere_walk_export.blend --rooms widow_bedroom [--out ...]
    bash bl.sh -b --factory-startup -P tools/blender/meshy_walk_export.py -- --verify tools/blender/build/hollowmere_walk.glb

(`bl.sh` is the one-Blender-at-a-time lock wrapper; any `blender -b --factory-startup -P` works the same.)
`--base-blend` is the short run that adds rooms to a finished village: it opens the export-ready blend a `--keep-blend`
run saved (with its report state), appends the rooms and writes the GLB and report again, without the village's bakes.

The contract with the viewer:
  * glTF 2.0, Y up, metres (the exporter's own Z-up conversion). Each area hangs under its own root empty
    `Area_<key>` at a fixed offset (AREAS below; the village at the origin), so render meshes keep their own coordinates.
  * `HM_Collision`: ONE mesh at the scene root, in world coordinates (every area's offset baked in), with no material
    and extras {"wdi_collision": true}; the viewer hides it. It holds the ground resampled at 1 m in the walk
    region and 4 m outside, convex prisms of the buildings, boxes of the walls, gates, fences, rocks, the train and
    the props, 8-sided trunks, deck floors with railings over water, a barrier along the mere's shore and the walk
    region's bounds. Doors stay closed.
  * `Spawn_<id>` empties 5 cm above the ground (ray cast at export), looking along their glTF -Z (= the empty's Blender
    local +Y); extras carry the spawn's name, district and facing. v1.2 (W3D, via Story mode): the overworld scene's
    own spawns too, `Spawn_overworld_<spawnId>` at their tiles (1.5 m a tile, facing away from their doors, nudged
    along their facing off collision), and `Portal_<portalId>` empties at the 3D buildings' doors on the ground with
    the extras {to, toSpawn, kind} of `packages/content/data/scenes/overworld.json`.
  * Every `Area_*` root carries `wdi_exposure` (toneMappingExposure, a multiplier) and the look's fog (`fog_color`,
    `fog_density`); a room's root is `Area_room_<sceneId>` with `wdi_indoor` (see ROOM_SLOTS: each room at a fixed
    far-grid slot, its `HM_Collision_room_<sceneId>` at the scene root in world coordinates, its unlit COLOR_0
    materials kept).
  * Everything else renders. Lights: the area's keep list (at most 24), punctual, intensities in the exporter's COMPAT
    mode (W / 4 pi, so the viewer matches Blender with toneMappingExposure = 2 ^ look exposure); fog, sky and moon are
    the look JSON's (copied into the area root's extras as `wdi_look_json`).
  * Textures 1024 px at most, WebP quality 80, fitted under the texture budget (`fit_textures`); Draco level 6 with
    18-bit positions (HM_Collision spans kilometres once the wild areas join), 16-bit texture coordinates (metre UVs on
    the dock, sleepers and walls) and 16-bit colours (the rooms' baked light).

What the export does to the built scene (in memory; the built .blend is never saved):
  1. geometry: every Meshy model is welded (merge by distance, 1e-4 m) and decimated ONCE from its full-detail master
     into a shared `<model>@walk` mesh (trees into `@walk_near` / `@walk_far` by distance from the walk region; the
     still-only near masters and sunk copies take the same meshes; props by a spawn into `@walk_near`). Every LOD must
     pass the see-through probe (v1.1, build_lod): the UV-keeping LOD (no collapse across a UV seam, borders locked)
     where it does, else one simplified by shape after a gap-closing weld, with fresh UVs and its maps baked across from
     the master, else either at more detail, else (v1.2) the original instance's own Decimate mesh where that is smaller
     and passes, else the whole master (see the simplification section); the probe is the contract check's own (its
     world rays at the instances nearest its spawn points, against their original meshes). The near copies of the
     shattered and fringed props (FULL_MODELS) are their original instance's own mesh on the Meshy UVs. The Poly Haven
     rock scans are simplified by shape; repeated meshes are parented under `I_*` empties so the exporter writes
     EXT_mesh_gpu_instancing; the terrain is cut into chunks, its trodden faces and steep faces into pieces of their own.
  2. materials: every exported material is rebuilt as a glTF-shaped tree and checked by the guard (`guard()`).
     Meshy maps are kept (base colour 1024 / 512 / 256 by the island-aware `downscale_masked`, roof snow baked in, the
     dropped lights' light on their own prop baked as emission, normal maps on the hero buildings on the UV path,
     metallic-roughness to constants); the ground, the rocks: Cycles EMIT bakes (the trodden ground: its scans on world
     UVs in their own colour, the paths' and rail bed's own snow speckle baked into theirs, 1.5 cm under an
     alpha-BLENDED snow overlay carrying the original's snow cover; the dropped lights' pools as emission, spot cones
     honoured); water with an isotropic ripple normal, ice flat;
     walls and decks tiled; the steep ground on UV islands of its own.
  3. collision, spawns and lights (the 24 with the most effect on screen from the spawns) as above; a report JSON
     beside the GLB (with the triangles a camera at each spawn would draw, every LOD's probe and the light ranking).

v1.2b (2026-11-15, after the contract and look checks of v1.2; each change is marked `v1.2b` where it is made):
  * collision: the Meshy deck models (station platform, freight dock, skiff dock, pond landing) are walked on their
    TOP surfaces, on 0.25 m cells with their stairs as steps, their huts, posts and railings as blocks (deck_floors);
    the report says whether the capsule reaches each raised floor (deck_access). The door spawns also keep clear of
    models (spawn_clear: the contract check's 8-ray rule, no surface against the body).
  * detail by the doors: the props and kits within NEAR_DOOR_M of a door spawn or a portal take a `@walk_mid` copy;
    re-baked LODs pack their UV islands a texel apart (Bakery.unwrap: 2.4-2.7 x finer texels for the same map); an
    edge-collapsed LOD is preferred to a clustered one; a model by a spawn takes 512 at least; the texture fit
    halves by what a spawn's eye would see (fit_textures).
  * lights: ranked from the door spawns and the portals too, the drowned lantern kept; every dropped light's own
    light is baked onto its prop and the building it hangs on (light_targets), never magenta (v1.2c: grey_glow).
  * the short run (--base-blend) no longer writes its saved state into the GLB.

v1.2c (2026-11-16, the pick-up of v1.2b after its first full export was rendered; marked `v1.2c` where made):
  * lights: beside the doors' lights the 24 keep every light with a strong showing from a district spawn (the forge's
    fire) and the Station Street lamp post; a lamp fixed on a gate or a wall is baked on it (STORY_PLANNED,
    RANK_DISTRICT_KEEP, BAKE_HOST_KINDS).
  * never magenta in the file: every glow map and pool map is stored GREY and its hue is the material's emissive
    factor (grey_glow, gltf_material's emission tint): the lossy WebP turned thousands of dark warm texels plum, and
    a neutral image comes back neutral; the emission strength is 4 at most; no red or teal light is baked.
  * the doors' facades: a re-baked mesh with one user scales its UV islands by its portals and spawns 2 x before the
    packing, on a third of its surface at most (uv_boost).

v1.2d (2026-11-16, the pick-up of v1.2c after its checks were read; marked `v1.2d` where made):
  * the ground pools of the dropped lights are shadowed only where the look gives the light a shadow (the lanterns,
    the fire, the drowned lantern, the headlamp: `wdi_shadow` true), not for the lamps, windows and the teal light
    (false, as on every kept one): the pools of the tier A and B ground had the lamps' own shadows in them.
  * the steep ground (the one `HM_GroundSteep` piece, on UV islands of its own) carries the dropped lights' light too
    (steep_pool: a Cycles diffuse bake of the lights in reach over its islands, an emission map of 192 px): Spawn_company_row's
    arrival frame showed the snow bank under the shift bell post as a hard-edged cold patch (the steep faces), beside the
    pool-lit snow, in the viewer and in Blender; the report counts that map among the pool maps (`pool_tiles`).
  * the forest gate's copy at its portal takes 12,000 triangles; a prop within 6 m of a door point the `@walk_mid`
    copy; the steep ground's atlas is 768, the shore's pebble scan 512; the texture fit never takes a building's base
    colour under 512.

Adding the wild areas (v2): give each AREAS entry a `process` function like `process_village` (load its blend by
append, apply its look, the same geometry/material/collision steps with the area's own rules) and its objects land
under `Area_<key>` at the listed offset; `finalize()` is already area-agnostic.
"""

from __future__ import annotations

import argparse
import contextlib
import ctypes
import gc
import json
import math
import os
import re
import struct
import sys
import time
import warnings
from collections import defaultdict

import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import meshy_village_build as vb  # noqa: E402  (tile maths, fine_grid, ph_metres, the ground roles)
import meshy_village_look as lk  # noqa: E402  (DEFAULT look and merge)
import meshy_village_outskirts as osk  # noqa: E402  (DISTRICTS, HERO, TEX_FAR, POND, WATER, LANCET_GLOW)

BUILD = os.path.join(HERE, "build")
LOOKS = os.path.join(HERE, "meshy_looks")
OUT_GLB = os.path.join(BUILD, "hollowmere_walk.glb")
OUT_BLEND = os.path.join(BUILD, "hollowmere_walk_export.blend")
T0 = time.time()
DOWN = Vector((0.0, 0.0, -1.0))


def log(*a) -> None:
    print(f"[walk {time.time() - T0:7.1f}s]", *a, flush=True)


# ================================================================ areas


class Area:
    """One walkable area: its built blend, its fixed offset in the walk file (Blender x, y; z stays 0), its walk region
    (area-local x0, y0, x1, y1), its look, spawns (area-local) and light keep list. `process` builds it (None: not yet)."""

    def __init__(self, key, name, blend, offset, walk, look, spawns, lights, process=None):
        self.key, self.name, self.blend, self.offset, self.walk = key, name, blend, offset, walk
        self.look, self.spawns, self.lights, self.process = look, spawns, lights, process


def _sp(name, x, y, theta, core, district, sees):
    """A spawn: area-local (x, y), facing theta degrees (0 east, 90 north), its district and what it looks at."""
    return dict(name=name, xy=(x, y), theta=theta, core=core, district=district, sees=sees)


VILLAGE_SPAWNS = [
    _sp("Spawn_square", 8.40, -3.60, 143.3, True, "The square",
        "north-west across the cobbles: the bell, the well and pump, the chest, a lantern post, the manor on its rise"),
    _sp("Spawn_station_street", 49.00, -17.00, 69.2, True, "Station Street", "the false fronts on the right, the Company lamp post"),
    _sp("Spawn_railyard", 48.50, 38.00, 74.8, True, "Railyard", "the sidings left, the forge and its fire right, the freight dock and bunkhouse ahead"),
    _sp("Spawn_mill", 82.75, -18.25, -25.9, True, "Mill Lane and the Waterwheel Lumber Mill", "down the lane to the Vane Sawmill on its quay, the pond left"),
    _sp("Spawn_east_hills", 140.0, 25.0, 15.1, True, "East hills", "THE HIDEOUT up the spur, its tower lamp"),
    _sp("Spawn_west_woods", -57.2, 4.5, -95.5, True, "West woods", "the Frozen Crypt in its knoll, the candle-lamp in its arch"),
    _sp("Spawn_platform", 37.2, -12.0, 51.9, False, "The station", "the platform and the Daily Train's coach"),
    _sp("Spawn_company_row", 63.0, 45.0, -45.9, False, "Company row", "the Union Hall"),
    _sp("Spawn_trestle", 163.4, 0.9, -3.3, False, "East hills (the old spur)", "the broken trestle and its two lamps"),
    _sp("Spawn_up_the_line", 52.0, 104.0, 155.2, False, "Up the line", "the waystation"),
    _sp("Spawn_mass_chapel", -83.4, 25.1, 157.4, False, "West woods (the Dark Mass chapel)", "the Dark Mass chapel"),
]

# The village keep list (spawns-lights-collision.md 3.3): (kind, area-local x, y, what) matched to the nearest light of
# that kind within 1.5 m, or ("key", wdi_outskirts key, what).
VILLAGE_LIGHTS = [
    ("lantern", -13.65, 12.75, "square post NW"), ("lantern", 9.15, 12.75, "square post NE"),
    ("lantern", -13.65, -5.25, "square post SW"), ("lantern", 9.15, -5.25, "square post SE"),
    ("window", 0.90, -17.55, "tavern front"), ("window", 17.70, 5.10, "bakery"), ("teal", 28.40, -1.10, "apothecary"),
    ("window", -31.15, -10.20, "chapel"), ("drowned", 1.12, -28.58, "the drowned lantern"),
    ("lantern", 43.65, -8.85, "station platform"), ("lantern", 18.75, -24.75, "quay post west"),
    ("lantern", 38.25, -26.25, "quay post east"), ("shrine", -29.68, -17.25, "wayside shrine"),
    ("headlamp", 45.75, -17.27, "the locomotive's headlamp"), ("lantern", 53.60, -0.40, "Station Street lamp post"),
    ("key", "post_office_telegraph", "telegraph room"), ("key", "smithy_hearth", "forge fire"),
    ("key", "union_hall_notch", "Union Hall meeting"), ("key", "landing_lantern", "pond keeper's lantern"),
    ("key", "waystation_window", "waystation"), ("key", "hideout_tower", "the hideout's tower lamp"),
    ("key", "trestle_lamp_n", "trestle warning lamp north"), ("key", "trestle_lamp_s", "trestle warning lamp south"),
    ("key", "crypt_arch", "crypt candle-lamp"),
]
LIGHT_RANGE = {"lantern": 16.0, "lamp": 8.0, "window": 10.0, "teal": 8.0, "shrine": 6.0, "drowned": 12.0,
               "headlamp": 40.0, "fire": 12.0, "moss": 8.0, "shaft": 20.0, "moon_pool": 40.0, "sinkhole": 30.0, "rot": 8.0}
MAX_LIGHTS = 24
# fix 4 (v1.1): the 24 real lights are the approved lights with the most effect on screen from the spawns (rank_lights:
# RANK_GRID rays per spawn frame, three.js's camera); the rest are baked into the ground (pool_map) and, v1.2, onto
# their own props (light_bake). --max-lights changes the 24
VIEW_VFOV, VIEW_ASPECT, EYE_H = 75.0, 16.0 / 9.0, 1.6
RANK_GRID = (64, 36)
RANK_FAR = 150.0
RANK_HEADINGS = ((0.0, 2.0), (90.0, 1.0), (180.0, 1.0), (270.0, 1.0))  # (turn from the facing, weight)
RANK_CORE_WEIGHT = 2.0   # v1.2b: a core spawn's views against a door spawn's or a lesser district spawn's
RANK_DISTRICT_KEEP = 0.02  # v1.2c: a light with this much effect in a district spawn's frames stays (see lights)
LAMP_GLASS_KINDS = ("lamp", "shrine", "lantern")
STORY_LIGHTS = ("crypt_arch", "hideout_tower", "trestle_lamp_n", "trestle_lamp_s")  # kept whatever their score
# v1.2b (look check 2026-11-15: the drowned lantern, in the arrival frame of Spawn_overworld_tavern_front, without its
# teal light: the palette's one teal light source beside the apothecary's): kept by its kind too
STORY_KINDS = ("drowned", "teal")   # (the apothecary's teal too: teal is a light source only, never a baked surface)
# v1.2c (the look views of the first v1.2b export: with the 24 ranked from the doors too, the outskirts' lights went to
# bakes and the Station Street views lost 0.007-0.015): the Company lamp post Spawn_station_street is there to show
# stays, as the planned list's label names it; and a lamp fixed on a kit (the forest gate's, a wall's) is baked on
# its kit rather than kept (v1.2 showed the gate so, and judged it lit): its place goes to a door's light
STORY_PLANNED = ("Station Street lamp post",)
BAKE_HOST_KINDS = ("kit",)
OWNER_NO = re.compile(r"crepe|torch|rope|gallows(?![_ ]?wood)", re.I)  # objects the owner's look never shows

# v1.2, the W3D additions (scratchpad w3d_additions.md, agreed with the viewer's author through Story mode): the
# overworld scene's own spawns (Spawn_overworld_<spawnId>, at their tiles, 1.5 m a tile, facing away from their doors)
# and its portals (Portal_<portalId> at the 3D buildings' doors). spawnId -> (plain words, district)
SCENE_FACING = {"e": 0.0, "n": 90.0, "w": 180.0, "s": -90.0}  # degrees counter-clockwise from east (Blender +X)
DOOR_SPAWNS = {
    "tavern_front": ("Outside the tavern's front door", "Village doors"),
    "tavern_alley": ("The tavern's alley door", "Village doors"),
    "apoth": ("Outside the apothecary", "Village doors"),
    "bakery": ("Outside the bakery", "Village doors"),
    "widow": ("Outside the widow's cottage", "Village doors"),
    "manor_front": ("Outside the manor's front door", "Village doors"),
    "manor_back": ("Behind the manor", "Village doors"),
    "barn": ("Outside the barn", "Village doors"),
    "chapel": ("Outside the chapel", "Village doors"),
    "cottage": ("Outside the fisher's cottage", "Village doors"),
    "well": ("Beside the well", "The square"),
    "square_0": ("The square, north-west corner", "The square"),
    "square_1": ("The square, north side", "The square"),
    "square_2": ("The square, north-east side", "The square"),
    "square_3": ("The square, east corner", "The square"),
    "square_4": ("The square, east side", "The square"),
    "square_5": ("The square, south-east side", "The square"),
    "square_6": ("The square, south side", "The square"),
    "square_7": ("The square, south-west corner", "The square"),
    "square_8": ("The square, west side", "The square"),
    "square_9": ("The square, by the pump", "The square"),
    "platform": ("By the station platform", "The station"),
    "forest_gate": ("At the forest gate", "Village edge"),
    "forest_back": ("The back way to the forest", "Village edge"),
    "balcony_drop": ("Below the manor's balcony", "Village edge"),
    "barn_loft_drop": ("Below the barn loft", "Village edge"),
}
CAPSULE_R, STEP_H, BODY_H = 0.3, 0.35, 1.75   # the viewer's capsule (apps/walk src/config.ts WALK)
PORTAL_OUT_M = 0.45      # a door portal stands this far out from its building's collision shell, on the ground
# v1.2: the 3D doors along their facades where the map's door tile is off the model's door (world x on a south or
# north face, y on an east or west one), read off orthographic elevations of the built village in the viewer
# (2026-11-15); the rest stand at their map tile (the widow's, the well's hatch, the forest gate), and the tavern's
# alley door, which the model's east wall does not have, at its map tile on that wall
DOOR_ALONG = {
    "ov.tavern_front": 2.3,    # the tavern's door, right of its facade's middle (the map's x -5.25 is off the model)
    "ov.manor_front": -35.2,   # the manor porch's front steps (the map's -27.75 is the east bay windows)
    "ov.manor_back": -39.8,    # the porch's west steps (the map's -38.25 is a window)
    "ov.apoth": 29.9,          # the apothecary's door (the map's 27.75 is its shop window)
    "ov.cottage": 25.9,        # the fisher's cottage door (the map's 24.75 is its window)
    "ov.bakery": 16.15,        # the bakery's door (the map's 15.75 is its left edge)
    "ov.barn": 30.0,           # the middle of the barn's double doors
    "ov.chapel": -12.0,        # the middle of the chapel's double door (the map's -12.75 is its south leaf)
}
PORTAL_OUT_STEP_M, PORTAL_OUT_MAX_M = 0.05, 1.0  # ... farther out, step by step, where the capsule cannot stand there
PORTAL_REACH_M = 1.0     # the capsule must get this close to a portal (the viewer fires within 1 m)
PORTAL_SPAWN_M = 1.0     # and no spawn may stand this close to one (arriving never stands inside a portal)
SPAWN_CLEAR_M = 1.2      # ... a spawn nudged off a portal keeps this much (0.2 m over the rule, for the capsule's snap)
SPAWN_VIS_M = 0.45       # v1.2b: no model's surface this close to a door spawn's body (spawn_clear)
NUDGE_STEP_M, NUDGE_MAX_M = 0.1, 8.0   # a spawn off its standing ground moves along its facing in these steps
# (the 3D buildings grow out of their footprints by front_grow: the barn's 4.5 m covers its door spawn's tile)
REACH_CELL_M, REACH_WIN_M = 0.2, 14.0  # the reachability flood: grid and half window round each portal

# The first-person rooms (meshy_room_build.py's blends) at fixed far-grid slots: slot i at Blender X = 3000 + 600 (i mod
# 6), Y = 3000 + 600 (i div 6), Z = 0, in this order, so a room never moves when others are added.
ROOM_SLOTS = ("tavern_bar", "tavern_back", "apoth_shop", "apoth_loft", "bakery", "crumb_oven", "crumb_mixing",
              "crumb_proofing", "crumb_cold", "widow_parlour", "widow_bedroom", "cottage_fisher", "manor_hall",
              "manor_upper", "barn", "chapel", "cellar", "cj_cell")
ROOMS_DIR = os.path.join(BUILD, "rooms")


def room_slot(scene_id: str) -> tuple[float, float, float]:
    i = ROOM_SLOTS.index(scene_id)
    return (3000.0 + 600.0 * (i % 6), 3000.0 + 600.0 * (i // 6), 0.0)


def process_village(X, A):  # defined below; forward reference for AREAS
    return Village(X, A).run()


AREAS = {
    "village": Area("village", "HollowMere village and outskirts", "hollowmere_base.blend", (0.0, 0.0), (-112.0, -40.0, 206.0, 142.0),
                    "final.json", VILLAGE_SPAWNS, VILLAGE_LIGHTS, process=process_village),
    # v2: the wild areas plug in here (offsets, walk regions, spawns and keep lists from spawns-lights-collision.md)
    "forest": Area("forest", "Gallows Wood", "forest_base.blend", (0.0, 900.0), (-30.0, -22.5, 30.0, 22.5), "wild_forest.json",
                   [_sp("Spawn_gallows_wood", 0.75, -20.25, 90.0, True, "Gallows Wood", "up the gate trail"),
                    _sp("Spawn_gallows_mine", -19.5, 13.95, 91.1, False, "Gallows Wood", "the Tin Gallery's mouth from the wood")],
                   [("key", "lt_gate_lantern", ""), ("key", "lt_moon_clearing", "")]),
    "forest_deep": Area("forest_deep", "The Fenwood", "forest_deep_base.blend", (-900.0, 900.0), (-36.0, -27.0, 36.0, 27.0), "wild_fen.json",
                        [_sp("Spawn_fenwood", 33.75, -0.75, 180.0, True, "The Fenwood", "the east trail to the Hanging Oak")],
                        [("key", "lt_clamp", ""), ("key", "drowned", ""), ("key", "lt_moon_oak", ""), ("key", "lt_moss_den", "")]),
    "cave_entry": Area("cave_entry", "Tin Gallery mouth", "cave_entry_base.blend", (0.0, 1800.0), (-15.0, -10.5, 15.0, 10.5), "wild_cave.json",
                       [_sp("Spawn_mine_mouth", 0.75, -8.25, 90.0, True, "Tin Gallery mouth", "the dome and the timbered drift")],
                       [("key", "lt_moss_0", ""), ("key", "lt_moss_1", ""), ("key", "lt_mouth", ""), ("key", "lt_moon_strip", "")]),
    "cave_gallery": Area("cave_gallery", "The Flooded Gallery", "cave_gallery_base.blend", (-900.0, 1800.0), (-30.0, -21.0, 30.0, 21.0), "wild_cave.json",
                         [_sp("Spawn_flooded_gallery", 0.75, -18.75, 90.0, True, "The Flooded Gallery", "up the entry passage")],
                         [("key", "lt_shaft", ""), ("key", "lt_lamp_ore", ""), ("key", "lt_rot_0", ""), ("key", "lt_rot_1", ""), ("key", "lt_moss_crib", "")]),
    "sea_exit": Area("sea_exit", "The sea door", "sea_exit_base.blend", (900.0, 1800.0), (-13.5, -7.5, 13.5, 7.5), "wild_sea.json",
                     [_sp("Spawn_sea_door", -11.25, -0.75, 0.0, True, "The sea door", "down the chamber to the arch and the frozen lake")],
                     [("key", "lt_moss", ""), ("key", "lt_moon", "")]),
}

# ================================================================ geometry and texture rules (decisions 3 and 4)

TREE_MODELS = ("pine_tall", "pine_short", "dead_tree")
TREE_TRIS = {"pine_tall": (3000, 800), "pine_short": (2200, 800), "dead_tree": (2300, 800)}  # near, far
TREE_NEAR_M = 60.0       # trees this close to the walk region get the near mesh
TRUNK_REACH_M = 30.0     # and this close a trunk in the collision
TRUNK_BAND = {"pine_tall": (1.3, 2.4), "pine_short": (0.75, 1.15), "dead_tree": (0.5, 1.4)}  # master z band of bare trunk
PINE_CROWN = (0.13, 3.0)  # fix 9: the top 13 % of a pine simplified at 3 x the overall ratio (one pass left it 1/12)
HERO_BUILDINGS = ("Tycoon_s_Manor", "Hale_Barn", "Frontier_Bakery", "Mallory_Apothecary", "widow_cottage",
                  "The_Drowned_Lantern", "Vicars_Chapel", "Frostbitten_Fisherman_s_Wharf", "fisher_cottage",
                  "Frostwood_Sawmill", "Frostbound_Outpost")
# triangles after welding: heroes 20k, other buildings 12k, vehicles, platform and skiff 12-16k, props 1.5-4k
TRI_MODEL = {
    "steam_locomotive": 16000, "rail_car": 14000, "station_platform": 14000, "marsh_dock_skiff": 14000,
    "broken_trestle": 12000, "cliff_section": 4000, "Frostbound_Rails": 6000, "Frostbound_Gate": 4000,
    "Frostbound_Warden_Gate": 4000, "split_rail_fence": 1500, "boulder_set": 1500, "hollow_log": 2000,
    "graveyard_set": 4000, "Frostbound_Wishing_Well": 4000, "emergency_bell": 4000, "Frozen_Lantern_Post": 4000,
    "village_pump": 3000, "Frostbound_Notice_Board": 3000, "Frostbound_Waymarker": 3000, "company_lamp_post": 3000,
    "drowned_lantern": 3000, "The_Witching_Lantern": 3000, "hay_cart": 3000, "kit_chest": 1500,
    "tombstone_tomorrow": 1500, "wolf_pelt_door": 1500, "Error_Deletion_Ray": 1500, "powder_kegs": 1500,
}
TRI_KIND = {"building": 12000, "vehicle": 14000, "prop": 2500, "kit": 3000}
# fix 2 (look check 2026-11-14: the notice board's bills and the well's lantern and pulley shattered at the main spawn):
# the instances of a prop within NEAR_PROP_M of a spawn (to its bounding box) take NEAR_PROP_TRIS, or the whole welded
# master where that is under FULL_MAX; OFF_UV never take the UV path, and take the near detail wherever they stand
NEAR_PROP_M = 12.0
NEAR_PROP_TRIS = 10000
OFF_UV = ("Frostbound_Notice_Board", "Frostbound_Wishing_Well", "Frostbound_Waymarker")
# v1.2 (look check 2026-11-14, items 2 and C: the props by the main spawns low-res and fringed at 2.5 m, the notice
# board's bills illegible, the well's brickwork lost, the locomotive 3 m from Spawn_station_street a grey pile of
# shards): the near copies of the shattered and fringed (FULL_MODELS: the OFF_UV three, the square's lantern post, the
# locomotive) take their base colour at NEAR_PX (the contract's 1024 ceiling) on the Meshy UVs, by the island-aware
# downscale, and are their original instance's own mesh (lod_orig) or their whole welded master up to FULL_MAX_NAMED
# triangles; the other near copies keep their tier's size (512, as v1.1: the 1024 of all twelve cost 29 MB of the
# texture budget and the fit then halved the Post Office, the tavern, the wharf and the sawmill beside the spawns)
# and are their whole master up to FULL_MAX; the locomotive is near wherever it stands (NEAR_MODELS)
FULL_MAX = 25000
FULL_MAX_NAMED = 82000
FULL_MODELS = OFF_UV + ("Frozen_Lantern_Post", "steam_locomotive")
NEAR_PX = 1024
# v1.2b: ... the notice board (its bills), the well (its brickwork) and the locomotive (its islands a few texels wide)
# at NEAR_PX; the waymarker and the square's lantern post, 0.55 and 0.42 cm a texel at 1024, at 512 (1.1 and 0.84 cm,
# as fine as any prop beside them): 8.4 MB of the texture budget for the buildings' maps
NEAR_PX_MODEL = {"Frostbound_Notice_Board": 1024, "Frostbound_Wishing_Well": 1024, "steam_locomotive": 1024}
NEAR_MODELS = ("steam_locomotive",)
# v1.2b (look check 2026-11-15, 3-4: the forest gate a pile of flakes 1.7 m from Spawn_overworld_forest_gate, crates,
# drystone walls and boulders on far LODs within 4 m of the door spawns): the near rule counts the overworld scene's
# door spawns and portals too, and the kits. The instances of a prop or kit within NEAR_DOOR_M of a door point (a door
# spawn's tile centre, a portal's door), and the kits that close to a district spawn, take a `@walk_mid` copy of
# MID_TRIS triangles (the whole welded master where that is smaller), never by the sloppy clustering, its base colour
# at MID_PX at least; the 12 m rule of the district spawns' props stays as it was (their whole masters)
NEAR_DOOR_M = 5.0
MID_TRIS = 6000
MID_PX = 512
# v1.2c: a prop that close to a door point within NEAR_DOOR_PROP_M (the wood stack 5.9 m from the bakery's door, tan
# shards on its 2,400-triangle LOD); the forest gate, the whole of the frame at its own portal, at MID_TRIS_MODEL
NEAR_DOOR_PROP_M = 6.0
MID_TRIS_MODEL = {"Frostbound_Gate": 12000}
# v1.2 contract item: the see-through gate measures what the checker measures (hole_probe.py): world rays at up to
# PROBE_PER_MODEL instances of the LOD nearest these spawn points (the checker's list), against each instance's own
# original mesh
PROBE_SPAWNS = ((8.4, -3.6), (49.0, -17.0), (48.5, 38.0), (82.75, -18.25), (140.0, 25.0), (-57.2, 4.5), (37.06, -11.94),
                (63.0, 45.0), (163.4, 0.45), (52.0, 104.0), (-83.4, 25.1))
PROBE_PER_MODEL = 2
# v1.2 performance: the instancing groups are split into spatial clusters (frustum culling per cluster) until the
# draw calls reach DRAW_BUDGET (the contract's 250, less a margin); the texture memory is fitted under TEX_BUDGET_MB
DRAW_BUDGET = 248
CLUSTER_HEAVY = 1.0      # v1.2c: a view's weight in the cluster cuts: what it draws already, to this power (hierarchy)
# (v1.2b: 255 MB of RGBA8 + mips in units of 1e6 bytes is 243.2 MiB; the contract's 256 is checked in MiB)
TEX_BUDGET_MB = 255.0
DRYSTONE_RATIO = 0.17    # drystone_wall: welded, then this share of the master
ROCK_TRIS = 400
SHARP_DEG = 50.0         # decimated hard-surface meshes: smooth, with sharp edges from this angle

TEX_HERO = set(HERO_BUILDINGS) | set(TREE_MODELS)   # base colour 1024 (the texture budget does not fit HERO_2K's props too)
TEX_FAR = set(osk.TEX_FAR)                          # 256
BASE_PX = {"hero": 1024, "far": 256, "other": 512}
NORMAL_PX = 512          # hero buildings only
# ... a Meshy normal map all but flat at NORMAL_PX (99 % of its texels within NORMAL_FLAT of 0.5 in x and y, about 6
# degrees; their mean under 0.5 degree) at NORMAL_PX_FLAT (v1.1 pass 3: the Wharf, Sawmill, Apothecary and Outpost
# measure 0.038-0.045, the Manor 0.091; 1 MiB each of the texture memory for nothing to see)
NORMAL_FLAT, NORMAL_PX_FLAT = 0.05, 256
MR_KEEP = {"Frozen_Lantern_Post": 256}               # the one model with real metal keeps its map
TEX_PX_MODEL = {"broken_trestle": 1024,  # fix 7: Spawn_trestle faces it (TEX_FAR's 256 over 32 m read as grey slabs)
                # v1.1: rebaked (fix 1 / fix 2) and the nearest views at two core spawns (15 m and 8 m): 512 read soft
                # v1.2b: re-baked maps pack 2.4-2.7 x finer (Bakery.unwrap), so the Post Office at 768 is 3.6 cm a texel
                # (v1.1's 1024: 4.4), and the platform, where Spawn_overworld_platform arrives (its 512 map was
                # 10.7 cm a texel underfoot), 3.2 cm at 768
                "Frontier_Post_Office": 768, "Frostbound_Notice_Board": 1024, "station_platform": 768}
# ... and the near trees' re-baked maps at 768: 2.8 cm a texel (v1.2's 1024: 3.1-4.7 cm), 7.3 MB less
TREE_NEAR_PX = 768
# v1.2b (look check 2026-11-15: the forge 3.5 m from Spawn_company_row and the waystation 9 m from Spawn_up_the_line
# on TEX_FAR's 256): a model with an instance within NEAR_PROP_M of any spawn (the door spawns too) takes NEAR_BASE_PX
# at least, where its Meshy map is that large
NEAR_BASE_PX = 512
EMISSIVE_PX = (512, 256)  # lamp props with more than 0.02 % glass texels, the rest (and the dropped lights' light bakes)
# v1.2b (look check 3-3: the door lights dropped at four portals, their facades cold): every dropped light lays its
# light on its own prop AND on the building it hangs on or stands by (the nearest within LIGHT_BUILDING_M of its
# box), baked as emission (light_bake) at LIGHT_BAKE_PX at most (the light's gradients are smooth; a 2048 bake took
# half a minute a model), a building's at LIGHT_BAKE_PX_BUILDING (its glow map is 512 at most); a bake whose
# strength comes out under LIGHT_BAKE_MIN (the wayside shrine's 25 W on the chapel 2.6 m away: 0.012) is left out
LIGHT_BUILDING_M = 1.5
LIGHT_BAKE_PX = 1024
LIGHT_BAKE_PX_BUILDING = 512
LIGHT_BAKE_MIN = 0.02
LIGHT_REACH_W, LIGHT_REACH_M = 150.0, 8.0   # a dropped light this strong also on the buildings this near
# (v1.2c: not the Dark Mass lancets' red light: a dim red glow on moonlit stone reads plum on screen; teal is a light
# source only)
LIGHT_BAKE_KINDS = ("lamp", "shrine", "lantern", "window", "fire", "headlamp")
# ... and never magenta (the owner's palette; look check 2026-11-15: dark plum texels in the glow maps, a warm lamp
# on Meshy's blue-violet shadow texels, and WebP's chroma at low light): where a warm light's reflection would lean to
# magenta (blue over green), its blue is held at WARM_BLUE_MAX x its green
WARM_BLUE_MAX = 0.5
# v1.2c (the first v1.2b export: 5,309 plum texels in the glow maps, 6,031 in the second, coloured specks on the shift
# bell's post): the file's lossy WebP cannot hold a hue at 5-25 of 255 (its chroma is half-size and coarse; a warm
# test image came back with blue over green by up to 71 levels), and the emission strength multiplies the error: the
# shift bell's 21.5 made specks of it. So (1) every glow map and pool map is GREY (grey_glow: its radiance's
# luminance), and its colour is the material's emissive factor, one tint a map (the light's own hue on that model;
# the lancets' red): a neutral image's chroma planes are flat, the codec returns them exactly, and no texel can
# turn plum; (2) the strength is GLOW_S_MAX at most (the texels brighter than that clip to white under the look's
# exposure anyway)
GLOW_S_MAX = 4.0
LANCET_PX = 512
# v1.2c (look check 3-2, after the islands were packed: the barn's boards still 4.7 cm a texel at its own door, a 1024
# map being all the contract allows): a re-baked mesh with one user gives the surfaces a walker stands at more of
# its map: its UV islands within UV_BOOST_R (on the ground plane) of a portal or a spawn, no higher than UV_BOOST_H
# over it, are scaled UV_BOOST x (an island partly inside: by its share) before the packing; the rest of the
# model pays with texels 10-20 % larger
UV_BOOST, UV_BOOST_R, UV_BOOST_H = 2.0, 6.0, 4.5
# ... on UV_BOOST_SHARE of the surface at most: the zones shrink (to UV_BOOST_R_MIN) until they hold no more (first
# smoke: the bakery, over half of it within 6 m of its door points, gained 1.26 x there for 1.59 x coarser elsewhere);
# a model wholly inside its zones (UV_BOOST_ALL: the forest gate at its portal) is left as it is
UV_BOOST_SHARE, UV_BOOST_R_MIN, UV_BOOST_ALL = 0.30, 2.5, 0.85
UV_PACK_MARGIN_PX = 1.0   # the packed islands stand this many texels of the map apart
ROCK_PX = 256
TILED_PX = 512           # the dock's wood and the quay's stone
DETAIL_PX = 512          # the ground's tiled snow detail normal
DECK_MODELS = ("station_platform", "marsh_dock_skiff", "Frostbound_Freight_Dock", "log_pond_landing")
NO_SHELL_MODELS = ("broken_trestle", "Frostbound_Rails", "Error_Deletion_Ray", "powder_kegs")

# The ground (materials.md 3a): tier A at 4 cm a texel over the map and 8 m round it, tier B at 8 cm over the
# districts, tier C one map over the rest. Each tier region is cut into tiles of at most 1024 texels a side.
GROUND_A = [(-56.0, -27.0, 56.0, 44.0)]
GROUND_B_EXTRA = [(-60.0, 36.0, 4.0, 62.0)]          # the gate road and the Mass path through the north belt
GROUND_SAMPLES = {"A": (16, 8), "B": (12, 6), "C": (4, 2)}   # colour, roughness
CHUNK_M = 64.0
CHUNK_C_M = 160.0        # tier C's chunks (v1.1: fewer draw calls for the trodden pieces, the overlays and the steep faces)
TIER_C_PX = 512          # tier C's one map (v1.0: 1024; the texture memory for fix 5)
ROUGH_DIV = {"A": 4, "B": 4, "C": 2}  # the roughness maps at this fraction of their tile (v1.0: 2 everywhere)
# fix 5: the trodden classes and their scans (meshy_village_build.terrain_material): class -> (map letter, colour scale,
# desaturation, roughness (None: the cobbles' own, wetted), its own normal map (the rail bed has the snow's))
GROUND_SCANS = {"cobble": ("c", 0.8, 0.0, None, True), "path": ("p", 0.8, 0.4, 0.65, True),
                "earth": ("d", 0.75, 0.35, 0.80, True), "rock": ("s", 1.0, 0.65, 0.50, True),
                "rail": ("=", 0.7, 0.3, 0.70, False)}
SCAN_PX = {"cobble": 512, "path": 512, "rail": 512, "rock": 512}  # the scans' size (default 256: 4 mm a texel over the 1 m scans, 8 mm
# over the 2 m ones; v1.2: the path and the rail bed at 512, for their speckle; v1.2c: the shore's pebbles (`rock`) too,
# soft underfoot at Spawn_overworld_tavern_front)
SCAN_PX_DEFAULT = 256
# terrain_material's classes along its bare_all MAXIMUM chain, the root first (it maxes forest, earth, path, rock, rail,
# cobble in turn); the forest floor has no scan: its litter stays in the tile bake
GROUND_CLASS_CHAIN = ("cobble", "rail", "rock", "path", "earth", "forest")
# v1.2 (look check item B: v1.1's uniform 18 % frost of the snow's colour in linear light turned the red-brown
# muddy_tracks (80, 48, 28) grey (99, 94, 95)): the scans keep their own colour treatment only, and the snow that lies
# on them (each class's `lying`: the path's 14 cm speckle, the cobbles' joint snow, the earth's patches) is the
# overlay's: alpha-BLENDED at the cover 1 - bare, its colour the ground material with the five scan classes weighed 0
# (the snow, and the forest litter and outskirts' ground where they lie), so scan x bare + snow x (1 - bare) is the
# original's own mix. (v1.1's MASK at 0.5 kept the speckle, lying at most 0.6, out of sight, and cut hard white blobs
# and saw-tooth edges where the cover crossed one half: item G.)
# v1.2 (the close views: the BLENDed overlay's edge stepped where the trodden faces end, the scans showing through
# by up to 10 % there): a face is trodden where this much bare ground shows on it (near a corner or its centre)
TRODDEN_BARE = 0.03
TRODDEN_MIN = 0.02       # ... and its class carries at least this weight
OVERLAY_LIFT = 0.015     # the snow overlay's lift over the trodden scans (the brief: 1-2 cm), skirted down to the chunks
# v1.2 (look check item B, the close views: the paths' and the rail bed's snow speckle, terrain_material's lying =
# amount x smoothstep(n_fine, lo, hi) with n_fine a 14 cm noise, rode in the overlay's alpha at the tile's 4-8 cm texels
# and read as a blur of dark blobs): those two classes carry their speckle in the scan itself, a tileable bake of the
# same noise (in 4D, on a flat torus, so it repeats with the scan) at the scan's resolution, the ground's own snow mixed
# in by it; the overlay's cover over them is their mask alone (scan x m (1 - l) + snow x (1 - m (1 - l)) = the
# speckled scan x m + snow x (1 - m), the original's own mix)
GROUND_SPECKLE = {"path": (0.6, 0.40, 0.70), "rail": (0.7, 0.40, 0.60)}  # (lying amount, smoothstep lo, hi)
N_FINE = (7.0, 5.0, 0.6)  # terrain_material's n_fine: scale (a metre), detail, roughness
ALPHA_FLOOR = 2.0 / 255.0  # the tile's alpha (the overlay's cover) is never 0 (see terrain)
# fix 8: the tier A and B faces steeper than 45 degrees get their own UV islands (Smart UV Project) and their own bake
# of the ground material at STEEP_TEXEL_M (the atlas at most STEEP_PX): no top-down stretching, the original's look
# v1.2c: the atlas at 768 at most (7.9 cm a texel over its 2,190 m2, near tier B's 6.8; 512 gave 13.6 cm, and the bank
# beside Spawn_trestle still read streaked; 1024 would cost 2.4 MB more of the texture memory)
STEEP_NZ, STEEP_TEXEL_M, STEEP_PX = 0.7071, 0.05, 768
# v1.2d: the dropped lights' light on the steep ground (steep_pool): its emission map at 192 px (a texel 0.3 m at the
# 768 atlas's 5 cm over four: a pool is soft; 0.2 MB of texture memory)
STEEP_POOL_PX = 192
# fix 4: the dropped lights' pools, baked as emission on the tier A and B ground
POOL_TEXEL_M = 0.25
POOL_EMIN = 0.003        # ... irradiance below which a texel is not worth a shadow ray (its light under 1 % of the night's)
# fix 10: the water's tiling ripple normal. v1.2 (item H: v1.1's 64 sines biased across one wind read as a regular
# diagonal tile): the original's bump (noise scale 1.6, detail 3, strength 0.12) as an isotropic random field, its
# four octaves 1.6-12.8 cycles a metre, each RIPPLE_WAVES waves of random direction, over a RIPPLE_M tile
RIPPLE_PX, RIPPLE_M, RIPPLE_SCALE, RIPPLE_WAVES = 512, 6.0, 0.3, 96

# Collision (decision 5)
COLL_TARGET = 150000
MERE_LEVEL = -1.95       # the shore barrier follows this contour of the ground (water surface -1.9)
# v1.2b (contract and look checks 2026-11-15: the station platform's and the freight dock's walker's floor lay on the
# beams and the base slab under their decks, a metre below the boards, and Spawn_overworld_platform stood inside the
# platform's steps): the Meshy deck models' floors are their TOP surfaces, on cells fine enough for their stairs
# (the platform's treads rise 0.3 m and run 0.25 m): per cell DECK_SUB x DECK_SUB rays down from base + 2.5 m, the
# highest up-facing hit (the deck, a tread, a ramp; a bench, a crate or a railing's top rail stands as a block the
# capsule cannot step onto); a cell crossed by wall-like surface (steeper than about 70 degrees: a hut's wall, a
# post) rising through DECK_WALL_BAND over the highest floor round it is a block DECK_BLOCK_H high. The built plank
# dock (HM_Dock) keeps its own rule (its lowest up-facing face under 0.62 m) on its 0.5 m samples
DECK_CELL = 0.25
DECK_SUB = 3
DECK_WALL_BAND = (0.5, 1.7)
DECK_WALL_AREA = 0.12    # m2 of wall-like surface in a cell's band
DECK_WALL_NZ = 0.35
DECK_BLOCK_H = 2.0
DECK_FLAT_M = 0.15       # floors within this of their neighbours are levelled to their median (the boards' snow), then
DECK_STEP_M = 0.05       # ... rounded to this, so the flat decks merge into a few quads
DECK_DROP_RAIL_M = 0.6   # a railing too where the next cell lies this much lower over water (the moored skiff)
DECK_RISE = (0.33, 0.45)  # a rise in this range is a step for the eye: the capsule's floor is eased to its low end
DRACO = dict(export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
             export_draco_position_quantization=18, export_draco_texcoord_quantization=16,
             export_draco_color_quantization=16)  # v1.2: the rooms' baked COLOR_0 (10 bits bands the dark corners)


# ================================================================ numpy helpers


def srgb_to_lin(c):
    c = np.asarray(c, np.float32)
    return np.where(c <= 0.04045, c / 12.92, np.power((np.maximum(c, 0.0) + 0.055) / 1.055, 2.4)).astype(np.float32)


def lin_to_srgb(c):
    c = np.clip(np.asarray(c, np.float32), 0.0, 1.0)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1.0 / 2.4) - 0.055).astype(np.float32)


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def luminance(c):
    return c[..., 0] * 0.2126 + c[..., 1] * 0.7152 + c[..., 2] * 0.0722


def img_pixels(img) -> np.ndarray:
    """(h, w, 4) float32 as stored (byte sRGB images: sRGB values; float images: linear)."""
    w, h = img.size
    a = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(h, w, 4)


def downscale(a: np.ndarray, w: int, h: int) -> np.ndarray:
    """Box filter to (h, w); exact for integer factors, area-weighted otherwise."""
    H, W = a.shape[:2]
    if (W, H) == (w, h):
        return a
    if W % w == 0 and H % h == 0 and W >= w and H >= h:
        return a.reshape(h, H // h, w, W // w, a.shape[2]).mean(axis=(1, 3))

    def axis(n_in, n_out):
        edges = np.linspace(0, n_in, n_out + 1)
        m = np.zeros((n_out, n_in), np.float32)
        for i in range(n_out):
            lo, hi = edges[i], edges[i + 1]
            for k in range(int(lo), int(math.ceil(hi))):
                m[i, k] = max(0.0, min(hi, k + 1) - max(lo, k))
            m[i] /= m[i].sum()
        return m
    my, mx = axis(H, h), axis(W, w)
    # two matrix products (rows, then columns); a three-way einsum here ran unoptimised, ~5e10 steps for a ground tile
    t = (my @ a.reshape(H, -1)).reshape(h, W, a.shape[2])
    return np.tensordot(t, mx, axes=([1], [1])).transpose(0, 2, 1)


def downscale_masked(a: np.ndarray, cov: np.ndarray | None, w: int, h: int, rounds: int = 12) -> np.ndarray:
    """downscale() weighted by a UV coverage mask (the source's texels a triangle covers): each texel the mean of the
    covered texels under it, so Meshy's grey fill between the islands stays out of them (v1.2, item C: the
    locomotive's islands a few texels wide read washed out at 512); texels with nothing covered take their neighbours'
    (fill_misses, `rounds` texels out, then the mean), so bilinear filtering and the mip levels at an island's edge
    blend into its own colour."""
    if cov is None or cov.shape != a.shape[:2] or not cov.any() or cov.all():
        return downscale(a, w, h)
    m = cov.astype(np.float32)[..., None]
    num = downscale(a * m, w, h)
    den = downscale(m, w, h)
    out = np.where(den > 1e-4, num / np.maximum(den, 1e-4), -1.0).astype(np.float32)
    return fill_misses(out, rounds=rounds)


def make_image(name: str, rgb: np.ndarray, colorspace: str, alpha: np.ndarray | None = None):
    """A packed 8-bit image from (h, w, 3|4) values already in the image's own encoding (and an (h, w) alpha)."""
    h, w = rgb.shape[:2]
    old = bpy.data.images.get(name)
    if old is not None:
        bpy.data.images.remove(old)
    img = bpy.data.images.new(name, w, h, alpha=alpha is not None, float_buffer=False)
    img.colorspace_settings.name = colorspace
    a = np.ones((h, w, 4), np.float32)
    a[..., :3] = np.clip(rgb[..., :3], 0.0, 1.0)
    if alpha is not None:
        a[..., 3] = np.clip(alpha, 0.0, 1.0)
        img.alpha_mode = "STRAIGHT"
    img.pixels.foreach_set(a.ravel())
    img.pack()
    return img


def float_image(name: str, rgb: np.ndarray):
    """A float (linear, Non-Color: read as stored) image from (h, w, 3) values, as a bake source."""
    h, w = rgb.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=False, float_buffer=True)
    img.colorspace_settings.name = "Non-Color"
    a = np.ones((h, w, 4), np.float32)
    a[..., :3] = rgb[..., :3]
    img.pixels.foreach_set(a.ravel())
    return img


def mesh_tris(me) -> int:
    n = len(me.polygons)
    if not n:
        return 0
    lt = np.empty(n, np.int32)
    me.polygons.foreach_get("loop_total", lt)
    return int(lt.sum() - 2 * n)


def mesh_co(me) -> np.ndarray:
    co = np.empty(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get("co", co)
    return co.reshape(-1, 3).astype(np.float64)


def world_co(o) -> np.ndarray:
    co = mesh_co(o.data)
    M = np.array(o.matrix_world)
    return co @ M[:3, :3].T + M[:3, 3]


def mesh_faces(me):
    """(loop vertex indices, loop starts, loop totals) as int arrays."""
    nl, nf = len(me.loops), len(me.polygons)
    lv = np.empty(nl, np.int32)
    me.loops.foreach_get("vertex_index", lv)
    ls = np.empty(nf, np.int32)
    lt = np.empty(nf, np.int32)
    me.polygons.foreach_get("loop_start", ls)
    me.polygons.foreach_get("loop_total", lt)
    return lv, ls, lt


def face_lists(lv, ls, lt) -> list[tuple]:
    lvl = lv.tolist()
    return [tuple(lvl[s:s + t]) for s, t in zip(ls.tolist(), lt.tolist())]


def face_loops(ls, lt, faces) -> np.ndarray:
    """Loop indices of the given faces, in face order."""
    n = lt[faces]
    starts = np.repeat(ls[faces], n)
    offs = np.arange(int(n.sum())) - np.repeat(np.cumsum(n) - n, n)
    return starts + offs


def bvh_of(co: np.ndarray, lv, ls, lt) -> BVHTree:
    return BVHTree.FromPolygons(co.tolist(), face_lists(lv, ls, lt))


def _json_default(v):
    if isinstance(v, np.integer):
        return int(v)
    if isinstance(v, np.floating):
        return float(v)
    if isinstance(v, np.ndarray):
        return v.tolist()
    return str(v)


def mesh_from_arrays(name: str, co: np.ndarray, lv: np.ndarray, sizes: np.ndarray):
    me = bpy.data.meshes.new(name)
    me.vertices.add(len(co))
    me.loops.add(len(lv))
    me.polygons.add(len(sizes))
    me.vertices.foreach_set("co", np.ascontiguousarray(co, np.float32).ravel())
    me.loops.foreach_set("vertex_index", np.ascontiguousarray(lv, np.int32))
    starts = np.zeros(len(sizes), np.int32)
    if len(sizes) > 1:
        starts[1:] = np.cumsum(sizes)[:-1]
    me.polygons.foreach_set("loop_start", starts)
    me.update(calc_edges=True)
    return me


def hull2d(pts: np.ndarray) -> np.ndarray:
    """Convex hull (Andrew's monotone chain), counter-clockwise, of (n, 2) points."""
    p = np.unique(np.round(pts, 3), axis=0)
    if len(p) < 3:
        return p
    p = p[np.lexsort((p[:, 1], p[:, 0]))]

    def half(points):
        out = []
        for q in points:
            while len(out) >= 2 and ((out[-1][0] - out[-2][0]) * (q[1] - out[-2][1]) - (out[-1][1] - out[-2][1]) * (q[0] - out[-2][0])) <= 0:
                out.pop()
            out.append(tuple(q))
        return out
    lower, upper = half(p), half(p[::-1])
    return np.array(lower[:-1] + upper[:-1])


def simplify_hull(h: np.ndarray, n_max: int) -> np.ndarray:
    """Drop the hull vertex that loses the least area until n_max are left (the hull shrinks by a sliver)."""
    h = [tuple(v) for v in h]
    while len(h) > n_max:
        best, bi = None, 0
        for i in range(len(h)):
            a, b, c = h[i - 1], h[i], h[(i + 1) % len(h)]
            area = abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2.0
            if best is None or area < best:
                best, bi = area, i
        h.pop(bi)
    return np.array(h)


def point_in_poly(x: float, y: float, poly) -> bool:
    inside = False
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside



def ring_cross(ring, axis: int, a: float) -> list[float]:
    """Where the line {x = a} (axis 0: the y values) or {y = a} (axis 1: the x values) crosses a closed ring's edges."""
    out = []
    n = len(ring)
    for i in range(n):
        p, q = ring[i], ring[(i + 1) % n]
        u0, u1 = p[axis], q[axis]
        if (u0 - a) * (u1 - a) <= 0.0 and u0 != u1:
            t = (a - u0) / (u1 - u0)
            out.append(p[1 - axis] + t * (q[1 - axis] - p[1 - axis]))
    return out or [sum(q[1 - axis] for q in ring) / n]


def ring_exit(ring, c, v) -> float:
    """How far from c (inside a convex ring) along the unit direction v its boundary is (the farthest crossing)."""
    best = 0.0
    n = len(ring)
    for i in range(n):
        p, q = ring[i], ring[(i + 1) % n]
        ex, ey = q[0] - p[0], q[1] - p[1]
        den = v[0] * ey - v[1] * ex
        if abs(den) < 1e-12:
            continue
        wx_, wy_ = p[0] - c[0], p[1] - c[1]
        t = (wx_ * ey - wy_ * ex) / den
        u = (wx_ * v[1] - wy_ * v[0]) / den
        if t > 0.0 and -1e-9 <= u <= 1.0 + 1e-9:
            best = max(best, t)
    return best

# ================================================================ simplification (meshoptimizer, Blender's own DLL)
# Every LOD starts from the full-detail master WELDED by distance (WELD_M, bmesh remove_doubles, decision 3; the
# build's own LODs were decimated unwelded and show holes and shards). Blender's Decimate stalls on the welded Meshy
# meshes (pine_tall at 9.9k of 18.8k, its output failing mesh.validate()), so Blender's bundled meshoptimizer does it:
#   * "uv" path: corners welded by (vertex, UV) and simplified WITHOUT collapsing across a UV seam, so every triangle
#     keeps texels of its own Meshy chart and the Meshy maps are kept as they are (downscaled). The buildings reach
#     their targets this way (Mallory_Apothecary 80k -> 20k, error 1 % of its size).
#   * "rebake" path, where the strict path stalls above LOD_SLACK x target (the trees at about half their triangles;
#     crates, kegs, the locomotive, the drystone wall): positions only, meshopt's edge collapse, or its sloppy clustering
#     where that stalls too (the pines' open needle sheets), then fresh UVs (Smart UV Project) and the master's maps
#     baked across (Cycles, selected to active). Collapsing across UV seams instead (meshopt's Permissive mode, an earlier
#     version) reaches any target but gives 40-90 % of these meshes' triangles texels of other charts: streaked pines,
#     roof snow on walls.
# v1.1 (look check 2026-11-14, defect 1: holes in the UV-path LODs, the Post Office's wall a mosaic at 15 m): the UV path
# ran with no error bound (target_error 1.0) and its borders free, so the welded Meshy shells' cracks opened. It now locks
# the borders (meshopt_SimplifyLockBorder) and stops at ERR_REL of the model's extent, and EVERY LOD is measured by the
# see-through probe (`see_through`: hole_probe.py's 96 x 81 rays in the model's own frame, master against LOD); a UV-path
# LOD whose rays pass through it (hit it more than a quarter of the probe radius beyond the master) on more than SEE_MAX
# of the master's hits is rejected, and the model takes the rebake path (or the UV path at more detail where that passes).

_MESHOPT: dict = {}
WELD_M = 1e-4            # decision 3: merge by distance before decimating
LOD_SLACK = 1.15         # a result within this of its target is "at target"
UV_HIGHER = 1.6          # the UV path stopped by its error bound up to this x target is used as a higher-detail LOD
ERR_REL = 0.012          # the UV path's error bound: meshopt's relative error (share of the model's extent)
UV_WEIGHT = 0.5
LOCK_BORDER = 1          # meshopt_SimplifyLockBorder
SEE_MAX = 0.5            # % of the master's probe hits that may pass through a UV-path LOD (defect 1: "about 0.5 %")
PROBE_DEEP = 0.25        # "through": the LOD is hit more than this x the probe radius beyond the master (or missed)
GAP_M = 0.03             # surface_gap: a master vertex farther than this from the LOD is on a lost part
LAMP_PART_R = 0.25       # ... and the lantern of a prop: the master's vertices within this of its lamp


def meshopt():
    if not _MESHOPT:
        d = os.path.join(os.path.dirname(bpy.app.binary_path), "blender.shared")
        if hasattr(os, "add_dll_directory"):
            os.add_dll_directory(d)
        lib = ctypes.CDLL(os.path.join(d, "meshoptimizer.dll" if sys.platform == "win32" else "libmeshoptimizer.so"))
        P, S, F = ctypes.c_void_p, ctypes.c_size_t, ctypes.c_float
        f = lib.meshopt_simplifyWithAttributes
        f.restype = S
        f.argtypes = [P, P, S, P, S, S, P, S, P, S, P, S, F, ctypes.c_uint, ctypes.POINTER(F)]
        g = lib.meshopt_simplify
        g.restype = S
        g.argtypes = [P, P, S, P, S, S, S, F, ctypes.c_uint, ctypes.POINTER(F)]
        sl = lib.meshopt_simplifySloppy  # meshoptimizer 0.25 (the DLL exports simplifyWithUpdate): with vertex_lock
        sl.restype = S
        sl.argtypes = [P, P, S, P, S, S, P, S, F, ctypes.POINTER(F)]
        s = lib.meshopt_simplifyScale
        s.restype = F
        s.argtypes = [P, S, S]
        _MESHOPT.update(attr=f, plain=g, sloppy=sl, scale=s)
    return _MESHOPT


def weld_master(src) -> dict:
    """The master welded by distance (WELD_M) and triangulated: positions, triangles (welded vertex ids) and corner UVs."""
    import bmesh
    me = src.copy()
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=WELD_M)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    co = mesh_co(me)
    lv = np.empty(len(me.loops), np.int32)
    me.loops.foreach_get("vertex_index", lv)
    uv = np.zeros(len(me.loops) * 2, np.float32)
    if me.uv_layers:
        me.uv_layers[0].data.foreach_get("uv", uv)
    bpy.data.meshes.remove(me)
    tri, tuv = lv.reshape(-1, 3), uv.reshape(-1, 3, 2)
    ok = (tri[:, 0] != tri[:, 1]) & (tri[:, 1] != tri[:, 2]) & (tri[:, 0] != tri[:, 2])
    return dict(co=co, tri=tri[ok], uv=tuv[ok], source_tris=mesh_tris(src), materials=list(src.materials), name=src.name,
                src=src)


def _finish(me, src_materials, sharp) -> None:
    for m in src_materials:
        me.materials.append(m)
    me.validate(clean_customdata=False)
    me.shade_smooth()
    if sharp:
        me.set_sharp_from_angle(angle=math.radians(sharp))


def _probe_dirs(n: int = 192) -> list:
    """hole_probe.py's 96 view directions: a Fibonacci sphere, the rays travelling no more than 0.15 upwards (seen from
    above the horizon or level, as a walker sees a model)."""
    g = math.pi * (3.0 - math.sqrt(5.0))
    out = []
    for i in range(n):
        z = 1.0 - 2.0 * (i + 0.5) / n
        r = math.sqrt(max(0.0, 1.0 - z * z))
        if z < 0.15:
            out.append(Vector((math.cos(g * i) * r, math.sin(g * i) * r, z)))
    return out[:96]


def probe_rays(co: np.ndarray):
    """hole_probe.py's bundle in a model's own frame: from each of the 96 directions 9 x 9 parallel rays over the
    bounding sphere (centre and radius of the bounding box), starting 2.2 radii out. ([(origin, direction)], radius)"""
    lo, hi = co.min(axis=0), co.max(axis=0)
    c = Vector(((lo + hi) / 2.0).tolist())
    R = float(np.linalg.norm(hi - lo) / 2.0)
    rays = []
    for d in _probe_dirs():
        u = d.cross(Vector((0.0, 0.0, 1.0)))
        if u.length < 1e-6:
            u = d.cross(Vector((1.0, 0.0, 0.0)))
        u.normalize()
        v = d.cross(u).normalized()
        for ia in range(9):
            for ib in range(9):
                rays.append((c - d * (2.2 * R) + (u * ((ia - 4) / 4.0) + v * ((ib - 4) / 4.0)) * R, d))
    return rays, R


def see_through(W: dict, me) -> dict:
    """The see-through probe of a LOD against its welded master (the same rays at both, in the model's frame): of the
    rays that hit the master, `through` hit the LOD more than PROBE_DEEP x the radius further on (through a hole into
    the model or out to its far side: the look check's see-through share), `miss` miss the LOD (a lost part, or a hole
    with nothing of the model behind it).
    v1.2 (contract item 9: 12 of 63 models passed this probe but failed the checker's at up to 1.16 %): when W carries
    probe instances (W["insts"], set by walk_mesh: the instances that will use this LOD nearest the checker's spawn
    points), the gate's number is the checker's own (hole_probe.py): its world rays at each instance, against the
    instance's ORIGINAL mesh and against this LOD in the instance's frame, scale and rotation included; through_pct and
    miss_pct are then the worst instance's, and the model-frame numbers stay as model_through_pct / model_miss_pct."""
    if "probe" not in W:
        rays, R = probe_rays(W["co"])
        bvh = BVHTree.FromPolygons(W["co"].tolist(), W["tri"].tolist())
        W["probe"] = (rays, R, [bvh.ray_cast(o, d, 4.5 * R)[3] for o, d in rays])
    rays, R, t0s = W["probe"]
    co = mesh_co(me)
    lv, ls, lt = mesh_faces(me)
    bvh = bvh_of(co, lv, ls, lt)
    n = through = miss = 0
    for (o, d), t0 in zip(rays, t0s):
        if t0 is None:
            continue
        n += 1
        t1 = bvh.ray_cast(o, d, 4.5 * R)[3]
        if t1 is None:
            miss += 1
        elif t1 > t0 + PROBE_DEEP * R:
            through += 1
    out = dict(rays=n, through_pct=round(100.0 * through / max(n, 1), 2), miss_pct=round(100.0 * miss / max(n, 1), 2))
    insts = W.get("insts")
    if insts:
        per = [inst_see(i, bvh) for i in insts]
        worst = max(per, key=lambda r: (r["through_pct"], r["miss_pct"]))
        out = dict(rays=worst["rays"], through_pct=worst["through_pct"], miss_pct=worst["miss_pct"],
                   worst_instance=worst["name"], instances=per, model_through_pct=out["through_pct"],
                   model_miss_pct=out["miss_pct"], model_rays=n)
    return out


_ORIG_BVH: dict = {}


def probe_instance(o) -> dict:
    """A probe instance for the checker-equivalent gate, taken before the export swaps the object's mesh: its world
    matrix, its original mesh, and hole_probe.py's world rays (96 directions x 9 x 9 over the bounding sphere of its
    world bounding box: centre the corners' mean, radius the farthest corner) with their first hits on the original."""
    M = o.matrix_world.copy()
    me0 = o.data
    corners = [M @ Vector(c) for c in o.bound_box]
    c = sum(corners, Vector()) / 8.0
    R = max((v - c).length for v in corners)
    if me0.name not in _ORIG_BVH:
        _ORIG_BVH[me0.name] = bvh_of(mesh_co(me0), *mesh_faces(me0))
    bvh0 = _ORIG_BVH[me0.name]
    Mi = M.inverted()
    M3 = Mi.to_3x3()
    rays = []
    for d in _probe_dirs():
        u = d.cross(Vector((0.0, 0.0, 1.0)))
        if u.length < 1e-6:
            u = d.cross(Vector((1.0, 0.0, 0.0)))
        u.normalize()
        v = d.cross(u).normalized()
        for ia in range(9):
            for ib in range(9):
                ow = c - d * (2.2 * R) + (u * ((ia - 4) / 4.0) + v * ((ib - 4) / 4.0)) * R
                dl = M3 @ d
                k = dl.length
                rays.append((ow, Mi @ ow, dl / k, k))
    t0 = []
    for ow, ol, dl, k in rays:
        hit = bvh0.ray_cast(ol, dl, 4.5 * R * k)
        t0.append(None if hit[0] is None else ((M @ hit[0]) - ow).length)
    return dict(name=o.name, M=M, R=R, rays=rays, t0=t0, mesh=me0)


def inst_see(inst: dict, bvh) -> dict:
    """The checker's see-through of a LOD (its BVH in the model's own frame) at one probe instance."""
    M, R = inst["M"], inst["R"]
    n = through = miss = 0
    for (ow, ol, dl, k), t0 in zip(inst["rays"], inst["t0"]):
        if t0 is None:
            continue
        n += 1
        hit = bvh.ray_cast(ol, dl, 4.5 * R * k)
        if hit[0] is None:
            miss += 1
        elif ((M @ hit[0]) - ow).length > t0 + PROBE_DEEP * R:
            through += 1
    return dict(name=inst["name"], rays=n, through_pct=round(100.0 * through / max(n, 1), 2),
                miss_pct=round(100.0 * miss / max(n, 1), 2))


def _nearest_d(bvh, p) -> float:
    d = bvh.find_nearest(Vector(p))[3]
    return 9.0 if d is None else float(d)  # (0.0 is a hit right on the surface, not a miss)


def surface_gap(W: dict, me, points=None, n: int = 20000) -> dict:
    """How far the master's surface lies from the LOD's (lost parts): up to n master vertices (or every master vertex
    within LAMP_PART_R of `points`, the lamps' places), each one's distance to the nearest point of the LOD; the share
    farther than GAP_M, the 99th percentile and the largest, in the model's units (catalog metres)."""
    co = W["co"]
    if points:
        sel = np.zeros(len(co), bool)
        for p in points:
            sel |= np.linalg.norm(co - np.asarray(p), axis=1) < LAMP_PART_R
        idx = np.nonzero(sel)[0]
    else:
        idx = np.arange(len(co)) if len(co) <= n else np.random.default_rng(7).choice(len(co), n, replace=False)
    if not len(idx):
        return dict(verts=0)
    lco = mesh_co(me)
    lv, ls, lt = mesh_faces(me)
    bvh = bvh_of(lco, lv, ls, lt)
    d = np.array([_nearest_d(bvh, co[i]) for i in idx.tolist()])
    return dict(verts=int(len(idx)), far_pct=round(100.0 * float((d > GAP_M).mean()), 2),
                p99_cm=round(100.0 * float(np.percentile(d, 99)), 1), max_cm=round(100.0 * float(d.max()), 1))


def lod_uv(W: dict, name: str, target: int, sharp=SHARP_DEG, max_err: float = ERR_REL, options: int = LOCK_BORDER):
    """The strict path: corners welded by (vertex, UV), meshopt with the UVs as attributes and no collapse across a UV
    seam; the borders locked and the error bounded (max_err of the extent: it stops early rather than open cracks).
    (mesh, info), mesh None when the result stalls above UV_HIGHER x target."""
    mo = meshopt()
    cv, cu = W["tri"].ravel(), W["uv"].reshape(-1, 2)
    key = np.column_stack([cv.astype(np.int64), np.round(cu / 1e-6).astype(np.int64)])
    _, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    vid = cv[first]
    P = np.ascontiguousarray(W["co"][vid], np.float32)
    U = np.ascontiguousarray(cu[first], np.float32)
    I = np.ascontiguousarray(inv.ravel().astype(np.uint32))
    scale = float(mo["scale"](P.ctypes.data, len(P), 12))
    wts = np.array([UV_WEIGHT, UV_WEIGHT], np.float32)
    dst = np.empty_like(I)
    err = ctypes.c_float(0.0)
    n = int(mo["attr"](dst.ctypes.data, I.ctypes.data, len(I), P.ctypes.data, len(P), 12, U.ctypes.data, 8,
                       wts.ctypes.data, 2, None, int(target) * 3, ctypes.c_float(max_err), int(options), ctypes.byref(err)))
    info = dict(source_tris=W["source_tris"], welded_verts=int(len(W["co"])), uv_verts=int(len(P)), target=int(target),
                strict_tris=n // 3, error_m=round(err.value * scale, 4), max_err=max_err, options=int(options))
    if n // 3 > target * UV_HIGHER or n < 3:
        return None, info
    tris = dst[:n].reshape(-1, 3)
    pg = vid[tris]
    ok = (pg[:, 0] != pg[:, 1]) & (pg[:, 1] != pg[:, 2]) & (pg[:, 0] != pg[:, 2])
    tris, pg = tris[ok], pg[ok]
    used, vmap = np.unique(pg, return_inverse=True)
    me = mesh_from_arrays(name, W["co"][used], vmap.ravel().astype(np.int32), np.full(len(tris), 3, np.int32))
    layer = me.uv_layers.new(name="UVMap")
    layer.data.foreach_set("uv", U[tris].reshape(-1).astype(np.float32))
    _finish(me, W["materials"], sharp)
    info.update(path="uv", method="strict", tris=mesh_tris(me))
    return me, info


def lod_shape(W: dict, name: str, target: int, sharp=SHARP_DEG, options: int = LOCK_BORDER, crown=None,
              sloppy: bool = True):
    """The rebake path: positions only (no UVs; the caller unwraps and bakes the maps across). meshopt's edge collapse
    (borders locked unless `options` says otherwise: the trees' needle cards are all border), or its sloppy clustering
    when that stalls above LOD_SLACK x target, its target searched to land near ours (`sloppy` False: never; v1.2 for
    the buildings, item F: a clustered triangle soup unwraps into islands of a few texels each, flat-coloured walls).
    crown (fix 9, the pines' pinwheel tips): (share of the height, ratio factor): the top of the mesh is simplified at
    that factor x the overall ratio (at most 1: kept), the rest takes what is left of the target; two passes, each with
    the other part's vertices locked."""
    mo = meshopt()
    P = np.ascontiguousarray(W["co"], np.float32)
    I0 = np.ascontiguousarray(W["tri"].ravel().astype(np.uint32))
    scale = float(mo["scale"](P.ctypes.data, len(P), 12))
    tried = []

    def run(kind, t, src, lock):
        """(distinct triangles, error, them): degenerate triangles and repeats of one vertex triple (the two sides of a
        welded double-sided sheet; mesh.validate() would drop them anyway) removed, winding kept."""
        dst = np.empty_like(src)
        err = ctypes.c_float(0.0)
        lk_ = None if lock is None else lock.ctypes.data
        if kind == "plain" and lock is None:
            n = int(mo["plain"](dst.ctypes.data, src.ctypes.data, len(src), P.ctypes.data, len(P), 12, int(t) * 3,
                                ctypes.c_float(1.0), int(options), ctypes.byref(err)))
        elif kind == "plain":
            n = int(mo["attr"](dst.ctypes.data, src.ctypes.data, len(src), P.ctypes.data, len(P), 12, None, 0, None, 0,
                               lk_, int(t) * 3, ctypes.c_float(1.0), int(options), ctypes.byref(err)))
        else:
            n = int(mo["sloppy"](dst.ctypes.data, src.ctypes.data, len(src), P.ctypes.data, len(P), 12, lk_, int(t) * 3,
                                 ctypes.c_float(1.0), ctypes.byref(err)))
        t3 = dst[:n].reshape(-1, 3)
        ok = (t3[:, 0] != t3[:, 1]) & (t3[:, 1] != t3[:, 2]) & (t3[:, 0] != t3[:, 2])
        t3 = t3[ok]
        if len(t3):
            _, first = np.unique(np.sort(t3, axis=1), axis=0, return_index=True)
            t3 = t3[np.sort(first)]
        tried.append((kind, int(t), n // 3, len(t3), round(err.value * scale, 3)) + (("locked",) if lock is not None else ()))
        return len(t3), err.value * scale, t3

    def fit(kind, src, lock, want):
        """`kind` on the index buffer `src` with its target set so the distinct count lands near `want`."""
        if kind == "plain":
            n, e, t3 = run("plain", want, src, lock)
            if 0 < n < 0.9 * want:  # repeats removed: ask for more, once
                n2, e2, t2 = run("plain", want * want / n, src, lock)
                if abs(n2 - want) < abs(n - want):
                    n, e, t3 = n2, e2, t2
            return n, e, t3
        lo_t, hi_t, t = want * 0.5, want * 4.0, float(want)
        best = None
        for _ in range(10):  # sloppy clustering undershoots: search its target so the result lands within 8 %
            n2, e2, t2 = run("sloppy", t, src, lock)
            if best is None or abs(n2 - want) < abs(best[0] - want):
                best = (n2, e2, t2)
            if abs(n2 - want) <= 0.08 * want:
                break
            if n2 < want:
                lo_t = t
            else:
                hi_t = t
            t = (lo_t + hi_t) / 2.0
        return best

    n, e, tris = fit("plain", I0, None, target)
    method = "plain"
    size = float(np.ptp(W["co"], axis=0).max())
    # the edge collapse stalls on open sheets (the pines' needles) above the target, or reaches it only with big
    # spikes (pine_short: 0.85 m): then the sloppy clustering, kept when it is nearer the target or more exact
    if sloppy and (n > target * LOD_SLACK or e > ERR_REL * size):
        best = fit("sloppy", I0, None, target)
        if n > target * LOD_SLACK or best[1] < e:
            n, e, tris = best
            method = "sloppy"
    crown_rep = None
    if crown is not None:
        share, factor = crown
        z = W["co"][:, 2]
        z_cut = float(z.max() - share * (z.max() - z.min()))
        top = z > z_cut
        cz = W["co"][W["tri"], 2].mean(axis=1)
        n_top0 = int((cz > z_cut).sum())
        ratio = target / max(1, len(W["tri"]))
        want_top = int(round(min(1.0, factor * ratio) * n_top0))
        one_top = int((W["co"][tris, 2].mean(axis=1) > z_cut).sum())
        want_low = max(1, n - one_top)  # the rest of the tree keeps what the one-pass LOD gave it; the tip gains
        lock_top, lock_low = top.astype(np.uint8), (~top).astype(np.uint8)
        # pass 1: everything but the top (locked) down to its share; pass 2: the top (the rest locked) down to its own
        n1, e1, t1 = fit(method, I0, lock_top, want_low + n_top0)
        c1 = W["co"][t1, 2].mean(axis=1) > z_cut
        keep_low = int((~c1).sum())
        src2 = np.ascontiguousarray(t1.ravel().astype(np.uint32))
        n2, e2, t2 = fit(method, src2, lock_low, keep_low + want_top)
        c2 = W["co"][t2, 2].mean(axis=1) > z_cut
        crown_rep = dict(share=share, factor=factor, z_cut=round(z_cut, 3), master_top_tris=n_top0, top_tris=int(c2.sum()),
                         one_pass_top_tris=one_top, one_pass_tris=int(n), rest_tris=int((~c2).sum()))
        n, e, tris = n2, max(e1, e2), t2
    used, vmap = np.unique(tris, return_inverse=True)
    me = mesh_from_arrays(name, W["co"][used], vmap.ravel().astype(np.int32), np.full(len(tris), 3, np.int32))
    _finish(me, W["materials"], sharp)
    info = dict(source_tris=W["source_tris"], welded_verts=int(len(W["co"])), target=int(target), path="rebake",
                method=method, tris=mesh_tris(me), error_m=round(e, 4), options=int(options), attempts=tried)
    if crown_rep:
        info["crown"] = crown_rep
    return me, info


REBAKE_WELDS = (0.0, 0.01, 0.02, 0.03, 0.05, 0.08)  # gap-closing welds tried on the rebake path (metres, model frame)
WELD_CAP = 0.01          # ... at most this share of the model's extent (a 0.4 m prop is welded at 4 mm at most)
DETAIL_STEPS = (("uv", 1.5), ("rebake", 1.5), ("uv", 2.0), ("rebake", 2.0), ("uv", 3.0), ("rebake", 3.0), ("uv", 4.0))
UV_MORE_CAP = 0.8        # the UV path at more detail: at most this share of the master's triangles


def weld_copy(W: dict, dist: float) -> dict:
    """The master's positions welded at `dist` (the rebake path's gap-closing weld; its UVs are made afresh anyway),
    cached on W. Most Meshy masters are a soup of open patches whose borders do not meet (after the 0.1 mm weld 40-60 %
    of their edges are borders, e.g. Frontier_Post_Office 66k of 153k; the patches overlap by mm to cm), and a
    simplifier moving those borders apart opens the holes; welding them shut first keeps the LOD closed."""
    cache = W.setdefault("welds", {})
    if dist not in cache:
        import bmesh
        me = W["src"].copy()
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=dist)
        bmesh.ops.triangulate(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()
        co = mesh_co(me)
        lv = np.empty(len(me.loops), np.int32)
        me.loops.foreach_get("vertex_index", lv)
        bpy.data.meshes.remove(me)
        tri = lv.reshape(-1, 3)
        ok = (tri[:, 0] != tri[:, 1]) & (tri[:, 1] != tri[:, 2]) & (tri[:, 0] != tri[:, 2])
        cache[dist] = dict(co=co, tri=tri[ok], source_tris=W["source_tris"], materials=W["materials"], name=W["name"])
    return cache[dist]


def lod_full(W: dict, name: str, sharp=SHARP_DEG):
    """The welded master itself on its own UVs (the props by the spawns under FULL_MAX triangles)."""
    me, info = lod_uv(W, name, len(W["tri"]), sharp, max_err=0.0)
    info.update(path="uv", method="full", see_through=see_through(W, me), gate="pass (whole master)")
    return me, info


def orig_mesh(W: dict):
    """The original mesh of the first probe instance (the one nearest the checker's spawns) when it is a LOD of its own
    (the build's Decimate copy, `<model>@<ratio>`) smaller than the welded master, else None."""
    for inst in (W.get("insts") or [])[:1]:
        me0 = inst.get("mesh")
        if me0 is not None and me0.name in bpy.data.meshes and me0 is not W["src"] and me0.uv_layers \
                and mesh_tris(me0) < len(W["tri"]):
            return me0
    return None


def lod_orig(W: dict, name: str, sharp=SHARP_DEG):
    """v1.2 (contract item 9, look items 2 and C): the original instance's own mesh, the Decimate LOD the approved village
    renders (`<model>@<ratio>`, its UVs the master's), welded at WELD_M, on its own UVs: the checker's probe compares the
    walk copy with exactly that mesh, so it passes there by construction, and the look is the original's. Used where no
    LOD of the master passes the probe below the whole master (the Frostgrave chapel's whole master lets 0.58 % through
    against its 0.4 decimation), and for the near copies of FULL_MODELS. (mesh, info), or (None, None) without one."""
    me0 = orig_mesh(W)
    if me0 is None:
        return None, None
    Wo = weld_master(me0)
    me, info = lod_uv(Wo, name, len(Wo["tri"]), sharp, max_err=0.0)
    if me is None:
        return None, None
    info.update(path="uv", method="orig", orig_mesh=me0.name, orig_tris=mesh_tris(me0), see_through=see_through(W, me))
    return me, info


def build_lod(W: dict, name: str, target: int, sharp=SHARP_DEG, uv_first: bool = True, shape_options: int = LOCK_BORDER,
              crown=None, search: bool = True, prefer_uv: bool = False, sloppy: bool = True):
    """A LOD of about `target` triangles that passes the see-through probe (SEE_MAX % of the master's hits passing
    through), the first of: the strict UV-keeping LOD (borders locked, error bounded; the Meshy maps kept as they
    are); the best rebake LOD over REBAKE_WELDS x (borders locked, free); then more detail by DETAIL_STEPS: the UV LOD
    and the rebake LOD (its three best welds) at 1.5, 2 and 3 x, the UV LOD at 4 x (`prefer_uv`, the heroes: no rebake
    past 1.5 x; the props kept off the UV path: the rebake steps only). When none passes, the candidate with the least
    see-through (plus a fifth of its misses) is kept and its info says so. `search` False (the trees): one rebake LOD
    with `shape_options` and `crown`, probed. Every candidate's probe goes into the info."""
    size = float(np.ptp(W["co"], axis=0).max())
    if not search:
        me, info = lod_shape(W, name, target, sharp, options=shape_options, crown=crown)
        info.update(see_through=see_through(W, me), size_m=round(size, 2))
        return me, info
    cands = []  # [me, info] of every candidate kept for the fallback

    def score(info):
        st = info["see_through"]
        return st["through_pct"] + 0.2 * st["miss_pct"]

    def finish(me, info, gate):
        for m2, _i in cands:
            if m2 is not me and m2.name in bpy.data.meshes:
                bpy.data.meshes.remove(m2)
        me.name = name
        info["surface_gap"] = surface_gap(W, me)
        info.update(gate=gate, size_m=round(size, 2), uv_locked_stalled_at=stall, candidates=[
            dict(path=i["path"], method=i.get("method"), weld_m=i.get("weld_m"), options=i.get("options"), tris=i["tris"],
                 target=i.get("target"), error_m=i.get("error_m"), **i["see_through"]) for _m, i in cands])
        return me, info

    k = 0
    stall = None
    if uv_first:
        me, info = lod_uv(W, f"{name}~{k}", target, sharp)
        k += 1
        if me is None:
            stall = info["strict_tris"]
        else:
            info["see_through"] = see_through(W, me)
            cands.append([me, info])
            if info["see_through"]["through_pct"] <= SEE_MAX:
                return finish(me, info, "pass")

    def rebake_round(t, settings):
        nonlocal k
        out = []
        for dist, op in settings:
            Wd = W if dist == 0.0 else weld_copy(W, dist)
            me, info = lod_shape(Wd, f"{name}~{k}", t, sharp, options=op, sloppy=sloppy)
            k += 1
            if any(i["tris"] == info["tris"] and i["method"] == info["method"] and i.get("weld_m") == dist for _m, i in out):
                bpy.data.meshes.remove(me)  # the same result with and without the lock (sloppy both times)
                continue
            info.update(see_through=see_through(W, me), weld_m=dist)
            if t != target:
                info["higher_detail"] = round(t / target, 2)
            cands.append([me, info])
            out.append([me, info])
        # v1.2: a candidate stalled above LOD_SLACK x its round's target is no LOD (without the sloppy clustering the edge
        # collapse of a patch-soup building stalls at 70-90 % of its master: the master again, its Meshy maps lost to
        # a bake); the UV path at more detail, or the master itself on its own UVs, is then the better candidate
        ok = [c for c in out if c[1]["see_through"]["through_pct"] <= SEE_MAX and c[1]["tris"] <= LOD_SLACK * t]
        # v1.2b (contract check 2026-11-15: Frostbound_Rails took a sloppy LOD of error 0.126 m, scattered shards, where
        # a plain one of 0.054 m had the same probe numbers; six more LODs' errors grew): among the candidates that
        # pass the gate, an edge-collapsed one before a clustered one, then the least see-through plus its geometric
        # error (as a percentage of the model's size: a centimetre on a 1 m prop weighs as 1 % of rays)
        return (min(ok, key=lambda c: (c[1]["method"] == "sloppy",
                                       score(c[1]) + 100.0 * float(c[1].get("error_m") or 0.0) / max(size, 1e-6)))
                if ok else None), out

    def uv_more(mults):
        nonlocal k
        for mult in mults:
            t = int(target * mult)
            if t > UV_MORE_CAP * len(W["tri"]):
                break
            me, info = lod_uv(W, f"{name}~{k}", t, sharp, options=0)
            k += 1
            if me is None:
                continue  # stalled above UV_HIGHER x this target: the next, larger one may take it
            info.update(see_through=see_through(W, me), higher_detail=mult)
            cands.append([me, info])
            if info["see_through"]["through_pct"] <= SEE_MAX:
                return me, info
        return None

    welds = [(d, op) for d in REBAKE_WELDS if d <= WELD_CAP * size for op in (LOCK_BORDER, 0)]
    best, first = rebake_round(target, welds)
    if best:
        return finish(*best, "pass")
    # more detail, the cheaper first at each step: the UV path with its borders free (locked, a patch-soup master
    # stalls at 70-90 % of itself; the error bound kept and the probe the gate), then the rebake path with its three
    # best welds (not past 1.5 x for the hero buildings, which keep their Meshy maps and normal maps where they can)
    top3 = [(i["weld_m"], i["options"]) for _m, i in sorted(first, key=lambda c: score(c[1]))[:3]]
    for kind, mult in DETAIL_STEPS:
        if kind == "uv":
            got = uv_more([mult]) if uv_first else None
            if got:
                return finish(*got, f"pass at {mult} x the target (UV path)")
        elif not (prefer_uv and uv_first and mult > 1.5):
            best, _r = rebake_round(int(target * mult), top3)
            if best:
                return finish(*best, f"pass at {mult} x the target (rebake)")
    if uv_first:
        # v1.2: before the whole master, the original instance's own mesh (lod_orig), when it is smaller and passes
        me, info = lod_orig(W, f"{name}~{k}", sharp)
        k += 1
        if me is not None:
            cands.append([me, info])
            if info["see_through"]["through_pct"] <= SEE_MAX:
                return finish(me, info, "pass (the original instance's own mesh: no LOD of the master passed the probe)")
        # the last of the higher detail: the master itself on its own UVs (v1.1 pass 3: Frontier_Detective_Bureau let
        # 0.71 % through at 4 x)
        me, info = lod_full(W, f"{name}~{k}", sharp)
        cands.append([me, info])
        if info["see_through"]["through_pct"] <= SEE_MAX:
            return finish(me, info, "pass (the whole master: no LOD passed the probe)")
        me, info = min(cands, key=lambda c: score(c[1]))
        return finish(me, info, "FAILED: least see-through of the candidates, the whole master included")
    me, info = min(cands, key=lambda c: score(c[1]))
    return finish(me, info, "FAILED: least see-through of the candidates")


# ================================================================ collision shapes


class Shapes:
    """Collision geometry of one area, area-local metres: vertex arrays and faces, tris counted per category."""

    def __init__(self):
        self.verts: list[np.ndarray] = []
        self.faces: list[tuple] = []
        self.n = 0
        self.tris: dict[str, int] = defaultdict(int)

    def add(self, cat: str, verts, faces) -> None:
        verts = np.asarray(verts, np.float64).reshape(-1, 3)
        if not len(verts) or not len(faces):
            return
        b = self.n
        self.verts.append(verts)
        self.faces.extend(tuple(b + int(i) for i in f) for f in faces)
        self.n += len(verts)
        self.tris[cat] += sum(len(f) - 2 for f in faces)

    def merge(self, other: "Shapes") -> None:
        b = self.n
        for v in other.verts:
            self.verts.append(v)
            self.n += len(v)
        self.faces.extend(tuple(b + i for i in f) for f in other.faces)
        for k, v in other.tris.items():
            self.tris[k] += v

    def quad(self, cat, a, b, c, d) -> None:
        self.add(cat, [a, b, c, d], [(0, 1, 2, 3)])

    def wall(self, cat, p0, p1, z0, z1) -> None:
        if z1 - z0 < 0.01:
            return
        self.quad(cat, (p0[0], p0[1], z0), (p1[0], p1[1], z0), (p1[0], p1[1], z1), (p0[0], p0[1], z1))

    def box(self, cat, corners) -> None:
        """corners: 8 points ordered x-fastest over the local box ((0,0,0), (1,0,0), (0,1,0), (1,1,0), then z = 1)."""
        f = [(0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4), (1, 3, 7, 5), (3, 2, 6, 7), (2, 0, 4, 6)]
        self.add(cat, corners, f)

    def prism(self, cat, ring, z0, z1, top=True) -> None:
        n = len(ring)
        v = [(x, y, z0) for x, y in ring] + [(x, y, z1) for x, y in ring]
        f = [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
        if top:
            f.append(tuple(range(n, 2 * n)))
        self.add(cat, v, f)

    def arrays(self):
        co = np.concatenate(self.verts) if self.verts else np.zeros((0, 3))
        return co, self.faces

    def total(self) -> int:
        return int(sum(self.tris.values()))


# ================================================================ baking (Cycles, isolated in its own collection)

_CYCLES_DEVICE: dict = {}


def cycles_device(sc) -> str:
    """The Cycles device for a bake: the CPU unless WDI_CYCLES_DEVICE names OPTIX or CUDA (an opt-in GPU bake, for a
    rented box; unset, nothing changes). The GPU's devices of that kind are enabled and logged once per run."""
    want = (os.environ.get("WDI_CYCLES_DEVICE") or "CPU").strip().upper()
    if want not in ("CPU", "OPTIX", "CUDA"):
        raise SystemExit(f"WDI_CYCLES_DEVICE={want!r}: use CPU, OPTIX or CUDA")
    if want == "CPU":
        sc.cycles.device = "CPU"
        if not _CYCLES_DEVICE:
            _CYCLES_DEVICE["used"] = "CPU"
            print("cycles device: CPU", flush=True)
        return "CPU"
    if not _CYCLES_DEVICE:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.compute_device_type = want
        prefs.get_devices()
        used = []
        for d in prefs.devices:
            d.use = d.type == want
            if d.use:
                used.append(d.name)
        if not used:
            raise SystemExit(f"WDI_CYCLES_DEVICE={want}: Blender finds no {want} device")
        _CYCLES_DEVICE["used"] = f"{want}: " + ", ".join(used)
        print(f"cycles device: {_CYCLES_DEVICE['used']}", flush=True)
    sc.cycles.device = "GPU"
    return _CYCLES_DEVICE["used"]


class Bakery:
    """Temporary objects live in the `WalkBake` collection; while `isolated`, every other collection is excluded from
    the view layer, so Cycles syncs only what is being baked and the depsgraph evaluates only the temp objects."""

    def __init__(self, scene):
        self.scene = scene
        self.coll = bpy.data.collections.new("WalkBake")
        scene.collection.children.link(self.coll)
        self.saved: dict[str, bool] = {}
        self.log: list[dict] = []
        sc = scene
        sc.render.engine = "CYCLES"
        cycles_device(sc)
        sc.cycles.use_adaptive_sampling = False
        sc.cycles.use_denoising = False
        sc.render.bake.margin_type = "EXTEND"

    @contextlib.contextmanager
    def isolated(self):
        vl = bpy.context.view_layer
        self.saved = {lc.name: lc.exclude for lc in vl.layer_collection.children}
        for lc in vl.layer_collection.children:
            lc.exclude = lc.collection is not self.coll
        try:
            yield
        finally:
            for lc in vl.layer_collection.children:
                if lc.name in self.saved:
                    lc.exclude = self.saved[lc.name]

    def temp(self, name: str, me):
        o = bpy.data.objects.new(name, me)
        self.coll.objects.link(o)
        return o

    def drop(self, o) -> None:
        bpy.data.objects.remove(o, do_unlink=True)

    def bake(self, objs, kind: str, samples: int, what: str, uv: str | None = None, margin: int = 16,
             source=None, extrusion: float = 0.0, max_ray: float = 0.0, clear: bool = True, pass_filter=None) -> float:
        """Bake into the active image node of objs[0]'s material; with `source` (an object), selected to active: rays from
        objs[0]'s surface, pushed out by `extrusion` along its normals, cast back to `source` (within max_ray).
        `pass_filter` for the light bakes (DIFFUSE: {'DIRECT', 'COLOR'})."""
        t = time.time()
        self.scene.cycles.samples = int(samples)
        for o in self.coll.objects:
            o.select_set(False)
        for o in objs:
            o.select_set(True)
        if source is not None:
            source.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        kw = dict(type=kind, margin=margin, margin_type="EXTEND", use_clear=clear, target="IMAGE_TEXTURES")
        if uv:
            kw["uv_layer"] = uv
        if kind == "NORMAL":
            kw.update(normal_space="TANGENT", normal_r="POS_X", normal_g="POS_Y", normal_b="POS_Z")
        if pass_filter:
            kw["pass_filter"] = set(pass_filter)
        if source is not None:
            kw.update(use_selected_to_active=True, cage_extrusion=float(extrusion), max_ray_distance=float(max_ray))
        bpy.ops.object.bake(**kw)
        dt = time.time() - t
        self.log.append(dict(what=what, kind=kind, samples=samples, seconds=round(dt, 2)))
        return dt

    def unwrap(self, me, px: int = 1024, boost=None):
        """Fresh UVs (Smart UV Project, uniform texel density) as the mesh's only UV map, `UVMap`, for a map of `px`.
        v1.2b (look check 2026-11-15, 3-2: the re-baked heroes a blur at their own doors, their 1024 maps 5.5-10 %
        used): the simplified meshes unwrap into a few large islands and thousands of one-triangle ones, and Smart UV
        Project's own margin (0.004 of the square round each) left the atlas mostly margin. The islands are now packed
        again (uv.pack_islands, by their boxes) one texel of the map apart: 33-42 % used, the texels 2.4-2.7 x finer."""
        for uvl in list(me.uv_layers):
            me.uv_layers.remove(uvl)
        me.uv_layers.new(name="UVMap")
        o = self.temp("WALK_unwrap", me)
        vl = bpy.context.view_layer
        for x in self.coll.objects:
            x.select_set(False)
        o.select_set(True)
        vl.objects.active = o
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=0.0, area_weight=0.0,
                                 correct_aspect=True, scale_to_bounds=False)
        rec = None
        if boost:  # v1.2c: the islands by the doors and spawns larger (uv_boost), then packed with the rest
            bpy.ops.object.mode_set(mode="OBJECT")
            rec = uv_boost(me, boost)
            bpy.ops.object.mode_set(mode="EDIT")
            bpy.ops.mesh.select_all(action="SELECT")
        margin = UV_PACK_MARGIN_PX / max(64, int(px))
        try:
            bpy.ops.uv.select_all(action="SELECT")
            bpy.ops.uv.pack_islands(udim_source="CLOSEST_UDIM", rotate=True, scale=True, merge_overlap=False,
                                    margin_method="FRACTION", margin=margin, shape_method="AABB")
        except (RuntimeError, TypeError) as e:  # an operator poll or signature this Blender lacks: Smart UV's own packing
            log(f"unwrap {me.name}: pack_islands failed ({e}); Smart UV Project's own margin instead")
            bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=margin, area_weight=0.0,
                                     correct_aspect=True, scale_to_bounds=False)
            rec = None
        bpy.ops.object.mode_set(mode="OBJECT")
        self.drop(o)
        if rec is not None:
            wa, ua = mesh_uv_stats(me)
            rec["uv_used_pct"] = round(100.0 * ua, 1)
        return rec

    def transfer(self, master_me, low_me, jobs: list, err: float, what: str) -> list:
        """Bake images laid out on the master's UVs onto low_me's UVs (selected to active, EMIT, 4 samples).
        jobs: (Image, px). Returns linear float arrays (px, px, 3): the source's values as the node reads them (sRGB
        images linearised, Non-Color raw). Texels whose ray found nothing (a triangle across a gap of the master) take
        their neighbours' values (dilation), then the mean."""
        hi_me = master_me.copy()
        hi_me.materials.clear()
        em = bpy.data.materials.new("WALK_transfer")
        em.use_nodes = True
        nt = em.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        emi = nt.nodes.new("ShaderNodeEmission")
        tex = nt.nodes.new("ShaderNodeTexImage")
        nt.links.new(tex.outputs["Color"], emi.inputs["Color"])
        nt.links.new(emi.outputs[0], out.inputs["Surface"])
        hi_me.materials.append(em)
        hi = self.temp("WALK_hi", hi_me)
        smooth = np.empty(len(low_me.polygons), bool)
        low_me.polygons.foreach_get("use_smooth", smooth)
        low_me.shade_flat()  # rays along the face normals: smooth normals of welded thin parts can cancel out
        tmat = bpy.data.materials.new("WALK_target_mat")
        tmat.use_nodes = True
        saved = list(low_me.materials)
        low_me.materials.clear()
        low_me.materials.append(tmat)
        lo = self.temp("WALK_lo", low_me)
        ext = min(0.6, max(0.03, 1.5 * err))
        res = []
        for img, px in jobs:
            tex.image = img
            tgt = bpy.data.images.new("WALK_xfer", px, px, alpha=False, float_buffer=True)
            tgt.colorspace_settings.name = "Non-Color"
            tgt.pixels.foreach_set(np.full(px * px * 4, -1.0, np.float32))
            target_node(tmat, tgt)
            self.bake([lo], "EMIT", 4, f"{what} {img.name} -> {px}", margin=max(4, px // 128), source=hi,
                      extrusion=ext, max_ray=4.0 * ext, clear=False)
            a = img_pixels(tgt)[..., :3].copy()
            bpy.data.images.remove(tgt)
            res.append(fill_misses(a))
        self.drop(lo)
        self.drop(hi)
        bpy.data.meshes.remove(hi_me)
        bpy.data.materials.remove(em)
        low_me.materials.clear()
        for m in saved:
            low_me.materials.append(m)
        bpy.data.materials.remove(tmat)
        low_me.polygons.foreach_set("use_smooth", smooth)
        low_me.update()
        return res


def grey_glow(rgb: np.ndarray, tint=None) -> tuple:
    """v1.2c: an emission image (h, w, 3, linear) as a grey one and a tint: (grey (h, w, 3) with r = g = b, tint [r, g,
    b] with its largest 1, scale), so that tint x grey x scale has the image's luminance at every texel and the tint's
    hue: the mean colour of the image (or `tint`), its blue never over its green (never towards magenta). The grey
    is 1 at most; `scale` (1 or more) goes to the emission strength. See GLOW_S_MAX."""
    Y = luminance(rgb).astype(np.float32)
    if tint is None:
        s = rgb.reshape(-1, 3).astype(np.float64).sum(axis=0)
        t = s / float(s.max()) if float(s.max()) > 0.0 else np.array([1.0, 0.56, 0.24])
    else:
        t = np.asarray(tint[:3], np.float64)
        t = t / max(float(t.max()), 1e-9)
    t[2] = min(float(t[2]), float(t[1]))
    g = Y / max(float(luminance(t)), 1e-6)
    scale = max(1.0, float(g.max()) if g.size else 1.0)
    g = np.clip(g / scale, 0.0, 1.0)
    return np.repeat(g[..., None], 3, axis=2), [round(float(v), 4) for v in t], scale


def fill_misses(a: np.ndarray, rounds: int = 24) -> np.ndarray:
    """Texels still at the bake's -1 sentinel take the mean of their valid 4-neighbours, round after round; the rest the mean."""
    bad = a[..., 0] < -0.5
    if not bad.any():
        return a
    valid = ~bad
    if not valid.any():
        return np.full_like(a, 0.2)
    a = np.where(bad[..., None], 0.0, a)
    for _ in range(rounds):
        if valid.all():
            break
        acc = np.zeros_like(a)
        cnt = np.zeros(a.shape[:2], np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            sv = np.roll(valid, (dy, dx), axis=(0, 1))
            sa = np.roll(a, (dy, dx), axis=(0, 1))
            acc += sa * sv[..., None]
            cnt += sv
        grow = (~valid) & (cnt > 0)
        a[grow] = acc[grow] / cnt[grow][:, None]
        valid = valid | grow
    if not valid.all():
        a[~valid] = a[valid].mean(axis=0)
    return a


def target_node(mat, img):
    """An unlinked image node in `mat`, active: the bake target."""
    n = mat.node_tree.nodes.get("WALK_target") or mat.node_tree.nodes.new("ShaderNodeTexImage")
    n.name = "WALK_target"
    n.image = img
    mat.node_tree.nodes.active = n
    return n


def emit_copy(mat, socket_name: str, name: str):
    """A copy of `mat` whose output is an Emission of whatever fed its Principled `socket_name` (the EMIT bake recipe)."""
    m = mat.copy()
    m.name = name
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    sock = bsdf.inputs[socket_name]
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Strength"].default_value = 1.0
    if sock.is_linked:
        nt.links.new(sock.links[0].from_socket, em.inputs["Color"])
    else:
        v = sock.default_value
        em.inputs["Color"].default_value = (v[0], v[1], v[2], 1.0) if hasattr(v, "__len__") else (v, v, v, 1.0)
    for out in (n for n in nt.nodes if n.type == "OUTPUT_MATERIAL"):
        nt.links.new(em.outputs[0], out.inputs["Surface"])
    for n in nt.nodes:  # name the UV map the bake target is not: shader lookups stay on the render UV map
        if n.type == "UVMAP" and not n.uv_map:
            n.uv_map = "UVMap"
    return m


# ================================================================ glTF-shaped materials and the guard


def gltf_material(mat, base=(0.8, 0.8, 0.8), rough=0.5, metal=0.0, normal=None, emission=None, cull=False,
                  base_extend=False, mr_image=None, alpha_mask=False, emission_uv=None, alpha_blend=False):
    """Rebuild `mat` as Principled -> Output with only exporter-readable nodes.
    base: RGB or Image; rough: float or Image (roughness in G); normal: (Image, strength, mapping or None) where
    mapping = (loc_x, loc_y, scale_x, scale_y) on UVMap (exported as KHR_texture_transform); emission: (Image or RGB,
    strength) or (Image, strength, tint): the image times the tint (v1.2c: a MULTIPLY mix with an RGB node, which the
    exporter writes as the emissive factor); mr_image: an Image whose G is roughness and B metallic. alpha_mask: the base image's alpha cuts the
    surface at 0.5 (glTF alphaMode MASK); alpha_blend: the base image's alpha straight into Alpha (alphaMode BLEND:
    three.js draws it after the opaque pass, without depth writes); emission_uv: the UV map the emission image reads
    (another TEXCOORD; the ground's trodden pieces carry their tile's UVs there), its texels clamped at the edges like
    the base's."""
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    N, L = nt.nodes, nt.links
    out = N.new("ShaderNodeOutputMaterial")
    bsdf = N.new("ShaderNodeBsdfPrincipled")
    L.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    def tex(img, extend=False, mapping=None, uv=None):
        n = N.new("ShaderNodeTexImage")
        n.image = img
        if extend:
            n.extension = "EXTEND"
        if mapping is not None:
            uvn = N.new("ShaderNodeUVMap")
            uvn.uv_map = "UVMap"
            mp = N.new("ShaderNodeMapping")
            mp.vector_type = "POINT"
            mp.inputs["Location"].default_value = (mapping[0], mapping[1], 0.0)
            mp.inputs["Scale"].default_value = (mapping[2], mapping[3], 1.0)
            L.new(uvn.outputs["UV"], mp.inputs["Vector"])
            L.new(mp.outputs["Vector"], n.inputs["Vector"])
        elif uv is not None:
            uvn = N.new("ShaderNodeUVMap")
            uvn.uv_map = uv
            L.new(uvn.outputs["UV"], n.inputs["Vector"])
        return n

    if isinstance(base, bpy.types.Image):
        bn = tex(base, base_extend)
        L.new(bn.outputs["Color"], bsdf.inputs["Base Color"])
        if alpha_mask:
            gt = N.new("ShaderNodeMath")
            gt.operation = "GREATER_THAN"
            gt.inputs[1].default_value = 0.5
            L.new(bn.outputs["Alpha"], gt.inputs[0])
            L.new(gt.outputs[0], bsdf.inputs["Alpha"])
        elif alpha_blend:
            L.new(bn.outputs["Alpha"], bsdf.inputs["Alpha"])
            with contextlib.suppress(AttributeError, TypeError):
                mat.surface_render_method = "BLENDED"
    else:
        bsdf.inputs["Base Color"].default_value = (base[0], base[1], base[2], 1.0)
    if mr_image is not None:
        sep = N.new("ShaderNodeSeparateColor")
        L.new(tex(mr_image).outputs["Color"], sep.inputs["Color"])
        L.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
        L.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    else:
        if isinstance(rough, bpy.types.Image):
            sep = N.new("ShaderNodeSeparateColor")
            L.new(tex(rough, base_extend).outputs["Color"], sep.inputs["Color"])
            L.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
        else:
            bsdf.inputs["Roughness"].default_value = float(rough)
        bsdf.inputs["Metallic"].default_value = float(metal)
    if normal is not None:
        img, strength, mapping = normal
        nm = N.new("ShaderNodeNormalMap")
        nm.inputs["Strength"].default_value = float(strength)
        L.new(tex(img, mapping=mapping).outputs["Color"], nm.inputs["Color"])
        L.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    if emission is not None:
        src, strength = emission[0], emission[1]
        tint = emission[2] if len(emission) > 2 else None
        if isinstance(src, bpy.types.Image):
            en = tex(src, extend=base_extend or emission_uv is not None, uv=emission_uv)
            if tint is not None:
                mx = N.new("ShaderNodeMix")
                mx.data_type = "RGBA"
                mx.blend_type = "MULTIPLY"
                mx.inputs[0].default_value = 1.0
                rgbn = N.new("ShaderNodeRGB")
                rgbn.outputs[0].default_value = (float(tint[0]), float(tint[1]), float(tint[2]), 1.0)
                L.new(en.outputs["Color"], mx.inputs[6])
                L.new(rgbn.outputs[0], mx.inputs[7])
                L.new(mx.outputs[2], bsdf.inputs["Emission Color"])
            else:
                L.new(en.outputs["Color"], bsdf.inputs["Emission Color"])
        else:
            bsdf.inputs["Emission Color"].default_value = (src[0], src[1], src[2], 1.0)
        bsdf.inputs["Emission Strength"].default_value = float(strength)
    mat.use_backface_culling = bool(cull)
    return mat


GUARD_NODES = {"OUTPUT_MATERIAL", "BSDF_PRINCIPLED", "TEX_IMAGE", "SEPARATE_COLOR", "NORMAL_MAP", "UVMAP", "MAPPING",
               "MIX", "RGB", "VERTEX_COLOR", "MATH", "GROUP"}


def guard(mat) -> list[str]:
    """The guard rule (materials.md 3): only nodes the exporter reads exactly, wired the way it reads them."""
    bad = []
    if not mat.use_nodes or mat.node_tree is None:
        return [f"{mat.name}: no node tree"]
    nodes = mat.node_tree.nodes
    outs = [n for n in nodes if n.type == "OUTPUT_MATERIAL" and n.is_active_output]
    if len(outs) != 1 or not outs[0].inputs["Surface"].is_linked or outs[0].inputs["Surface"].links[0].from_node.type != "BSDF_PRINCIPLED":
        bad.append(f"{mat.name}: Surface is not a Principled BSDF")
    for n in nodes:
        if n.type not in GUARD_NODES:
            bad.append(f"{mat.name}: node {n.name} ({n.type})")
        elif n.type == "MAPPING" and n.vector_type != "POINT":
            bad.append(f"{mat.name}: mapping {n.name} is {n.vector_type}")
        elif n.type == "MIX":
            ok = n.data_type == "RGBA" and n.blend_type == "MULTIPLY" and not n.inputs[0].is_linked and abs(n.inputs[0].default_value - 1.0) < 1e-6
            ok = ok and any(s.is_linked and s.links[0].from_node.type in ("RGB", "VERTEX_COLOR") for s in (n.inputs[6], n.inputs[7]))
            if not ok:
                bad.append(f"{mat.name}: mix {n.name} is not MULTIPLY x1 with an RGB or colour attribute")
        elif n.type == "MATH":
            ok = n.operation == "GREATER_THAN" and not n.inputs[1].is_linked and all(
                l.to_socket.name == "Alpha" for l in n.outputs[0].links)
            if not ok:
                bad.append(f"{mat.name}: math {n.name} is not GREATER_THAN before Alpha")
        elif n.type == "GROUP" and (n.node_tree is None or n.node_tree.name not in ("glTF Material Output", "glTF Settings")):
            bad.append(f"{mat.name}: group {n.name}")
        elif n.type == "TEX_IMAGE":
            if n.image is None:
                bad.append(f"{mat.name}: empty image node {n.name}")
            elif max(n.image.size) > 1024:
                bad.append(f"{mat.name}: image {n.image.name} is {tuple(n.image.size)}")
            elif not n.outputs["Color"].is_linked:
                bad.append(f"{mat.name}: loose image node {n.name}")
    return bad


# ================================================================ the export run (area-agnostic parts)


class Export:
    def __init__(self, args):
        self.args = args
        self.bake = not args.no_bake
        self.steps: dict[str, float] = {}
        self.shapes: list[tuple[Area, Shapes]] = []
        self.roots: dict[str, object] = {}
        self.cat: dict[str, str] = {}       # exported object name -> report category
        self.areas: list[dict] = []
        self.spawns: list[dict] = []
        self.portals: list[dict] = []
        self.rooms: list[dict] = []
        self.lights: list[dict] = []
        self.bakes: list[dict] = []
        self.textures: list[dict] = []
        self.notes: list[str] = []
        self.walk_coll = None
        self.bakery = None
        self.base_mode = False          # --base-blend: the village comes ready in the blend
        self.room_collisions: list = []
        self.near_meshes: set = set()
        self.tex_fit = None
        self.collision = None

    @contextlib.contextmanager
    def step(self, name: str):
        t = time.time()
        log("STEP", name)
        try:
            yield
        finally:
            self.steps[name] = round(time.time() - t, 1)
            log("DONE", name, f"{self.steps[name]} s")

    def collection(self):
        if self.walk_coll is None or self.walk_coll.name not in bpy.data.collections:
            self.walk_coll = bpy.data.collections.new("HM_Walk")
            bpy.context.scene.collection.children.link(self.walk_coll)
        return self.walk_coll

    def empty(self, name: str, parent=None, loc=(0.0, 0.0, 0.0)):
        e = bpy.data.objects.new(name, None)
        self.collection().objects.link(e)
        e.empty_display_size = 0.5
        e.location = loc
        if parent is not None:
            e.parent = parent
        return e


def load_area(A: Area, first: bool) -> None:
    path = os.path.join(BUILD, A.blend)
    if first:
        bpy.ops.wm.open_mainfile(filepath=path, load_ui=False)
        log("opened", path)
        return
    raise SystemExit(f"area {A.key}: appending a second area is the v2 step (process function still to write)")


def look_of(A: Area) -> dict:
    with open(os.path.join(LOOKS, A.look), encoding="utf-8") as fh:
        return lk.merge(lk.DEFAULT, json.load(fh))


# ================================================================ the village


class Village:
    """The village + outskirts (hollowmere_base.blend): everything in area-local coordinates (the village's offset is
    0, but nothing here assumes it; the root and the collision carry the offset)."""

    def __init__(self, X: Export, A: Area):
        self.X, self.A = X, A
        self.sc = bpy.context.scene
        self.look = look_of(A)
        self.bk = X.bakery or Bakery(self.sc)
        X.bakery = self.bk
        self.cat = X.cat
        self.exported: list = []           # mesh objects that render
        self.tree_objs: list = []
        self.meshy_objs: list = []
        self.models: dict[str, list] = defaultdict(list)
        self.ground_obj = bpy.data.objects.get("HM_Ground")
        self.decks: list = []
        self.ground_bvh = None
        self.simplify_log: dict[str, dict] = {}
        self.welded: dict[str, dict] = {}                  # model -> its welded master (weld_master)
        self.lods: dict[str, list] = defaultdict(list)     # model -> [(walk mesh, info)], near first
        self.dropped: list[dict] = []                      # the lights not kept (fix 4: baked into the ground)
        self.lamp_points: dict[str, list] = {}             # model -> [(local point, scale, colour)] of its dropped lamps
        self.occ_bvh = None                                # world BVH of what shadows a light (lights, pools)
        self.info: dict = {"area": A.key}

    # ------------------------------------------------------------ run

    def run(self):
        X, A = self.X, self.A
        with X.step(f"{A.key}: classify"):
            self.classify()
        with X.step(f"{A.key}: ground sampler"):
            self.ground_sampler()
            self.door_points = self.scene_door_points() if A.key == "village" else []
        with self.bk.isolated():
            with X.step(f"{A.key}: trees"):
                self.trees()
            with X.step(f"{A.key}: meshy geometry"):
                self.meshy_geometry()
                X.near_meshes |= self.near_meshes
            with X.step(f"{A.key}: rocks"):
                self.rocks()
        # v1.2b: the collision and the spawns before the lights (they need the geometry only): the light ranking then
        # looks from the door spawns too, where they really stand
        with X.step(f"{A.key}: collision"):
            shapes = self.collision()
        with X.step(f"{A.key}: spawns"):
            self.spawns(shapes)
        with self.bk.isolated():
            with X.step(f"{A.key}: lights"):  # v1.1: after the geometry, which the ranking's rays see
                self.lights()
            with X.step(f"{A.key}: meshy materials"):
                self.meshy_materials()
            with X.step(f"{A.key}: terrain"):
                self.terrain()
        with X.step(f"{A.key}: other materials"):
            self.other_materials()
        with X.step(f"{A.key}: hierarchy"):
            self.hierarchy()
        X.shapes.append((A, shapes))
        X.areas.append(self.info)

    # ------------------------------------------------------------ classify and exclude

    def classify(self):
        sc = self.sc
        hidden = {c.name for c in bpy.data.collections if c.hide_render}
        drop = []
        for o in list(sc.objects):
            cols = {c.name for c in o.users_collection}
            if o.hide_render or (cols and cols <= hidden) or "HM_Cutaway" in cols:
                continue  # the HM_Sources masters stay until their meshes are used, then go in cleanup
            if o.type == "MESH" and (o.get("wdi_volume") or o.name.startswith(("HM_CaveHull", "HM_FogBank", "HM_ShallowsMist"))
                                     or not o.visible_camera):
                drop.append(o)
                continue
            if OWNER_NO.search(o.name):
                drop.append(o)  # the owner's look: no crepe, torch, rope or gallows anywhere (Gallows Wood itself stays)
                continue
            if o.type == "MESH":
                self.exported.append(o)
                m = o.get("wdi_model")
                if m in TREE_MODELS:
                    self.tree_objs.append(o)
                elif m:
                    self.meshy_objs.append(o)
                    self.models[m].append(o)
        only = {m.strip() for m in (getattr(self.X.args, "only_models", "") or "").split(",") if m.strip()}
        if only:  # --only-models (a smoke test): the other Meshy models leave the scene
            for model in [m for m in self.models if m not in only]:
                for o in self.models.pop(model):
                    self.meshy_objs.remove(o)
                    self.exported.remove(o)
                    drop.append(o)
            self.X.notes.append(f"SMOKE TEST: only the models {sorted(only)}")
        self.info["excluded"] = sorted(o.name for o in drop)
        for o in drop:
            log("exclude", o.name)
            bpy.data.objects.remove(o, do_unlink=True)
        self.info["not_rendered_kept_as_sources"] = sum(1 for o in sc.objects if o.hide_render or
                                                        ({c.name for c in o.users_collection} <= hidden and o.users_collection))
        log(f"classify: {len(self.exported)} render meshes, {len(self.tree_objs)} trees, {len(self.meshy_objs)} Meshy objects "
            f"of {len(self.models)} models, {len(drop)} dropped")

    # ------------------------------------------------------------ lights

    def light_host(self, o):
        """The Meshy instance a light sits on (inside its box, 0.4 m slack): (object, model, local point, scale) or None."""
        p = o.matrix_world.translation
        best = None
        for m in self.meshy_objs:
            q = m.matrix_world.translation
            if math.hypot(p.x - q.x, p.y - q.y) > 8.0:
                continue
            loc = m.matrix_world.inverted() @ p
            s = max(m.scale)
            bb = m.bound_box
            lo = [min(c[i] for c in bb) for i in range(3)]
            hi = [max(c[i] for c in bb) for i in range(3)]
            if all(lo[i] - 0.4 / s <= loc[i] <= hi[i] + 0.4 / s for i in range(3)):
                d = (p - q).length
                if best is None or d < best[0]:
                    best = (d, m, m.get("wdi_model"), tuple(loc), s)
        return best[1:] if best else None

    def light_building(self, o):
        """The building a light hangs on or stands by: the nearest Meshy building whose box lies within
        LIGHT_BUILDING_M of it on the ground plane (the light between its foot and half a metre over its top), as
        light_host gives it: (object, model, local point, scale), or None."""
        p = o.matrix_world.translation
        best = None
        for m in self.meshy_objs:
            model = m.get("wdi_model")
            if (self.master(model).get("wdi_kind") or m.get("wdi_kind", "prop")) != "building":
                continue
            if math.hypot(p.x - m.matrix_world.translation.x, p.y - m.matrix_world.translation.y) > 40.0:
                continue
            bb = [m.matrix_world @ Vector(c) for c in m.bound_box]
            x0, x1 = min(v.x for v in bb), max(v.x for v in bb)
            y0, y1 = min(v.y for v in bb), max(v.y for v in bb)
            z0, z1 = min(v.z for v in bb), max(v.z for v in bb)
            d = math.hypot(max(x0 - p.x, 0.0, p.x - x1), max(y0 - p.y, 0.0, p.y - y1))
            if d > LIGHT_BUILDING_M or not (z0 - 0.5 <= p.z <= z1 + 0.5):
                continue
            if best is None or d < best[0]:
                best = (d, m, model, tuple(m.matrix_world.inverted() @ p), max(m.scale))
        return best[1:] if best else None

    def light_buildings(self, o, reach: float) -> list:
        """Every Meshy building whose box lies within `reach` of a light on the ground plane (light_host's tuples)."""
        p = o.matrix_world.translation
        out = []
        for m in self.meshy_objs:
            model = m.get("wdi_model")
            if (self.master(model).get("wdi_kind") or m.get("wdi_kind", "prop")) != "building":
                continue
            if math.hypot(p.x - m.matrix_world.translation.x, p.y - m.matrix_world.translation.y) > 60.0:
                continue
            bb = [m.matrix_world @ Vector(c) for c in m.bound_box]
            x0, x1 = min(v.x for v in bb), max(v.x for v in bb)
            y0, y1 = min(v.y for v in bb), max(v.y for v in bb)
            if math.hypot(max(x0 - p.x, 0.0, p.x - x1), max(y0 - p.y, 0.0, p.y - y1)) <= reach:
                out.append((m, model, tuple(m.matrix_world.inverted() @ p), max(m.scale)))
        return out

    def light_targets(self, l: dict) -> list:
        """The instances a dropped light's own light is baked onto (light_bake): the model it sits on (not a tree, not
        a self-lit post: those have their bulbs and painted glass) and the building it hangs on or stands by."""
        out = []
        host = l.get("host")
        if host and host[1] and host[1] not in TREE_MODELS and host[1] not in vb.SELF_LIT \
                and (self.master(host[1]).get("wdi_kind") or host[0].get("wdi_kind", "prop")) != "vehicle":
            out.append(host)  # (not the vehicles: the locomotive's islands a few texels wide wash out a 512 glow)
        b = self.light_building(l["o"])
        if b is not None and all(b[0] != t[0] for t in out):
            out.append(b)
        # v1.2b: a strong light (a lantern on its post, the forge's fire, the headlamp) also on the buildings it
        # stands among (within LIGHT_REACH_M of their boxes): the light ranking by the door spawns and portals took
        # the outskirts' post lanterns out of the 24, and their light on the false fronts with them
        if l.get("W", 0.0) >= LIGHT_REACH_W:
            for t in self.light_buildings(l["o"], LIGHT_REACH_M):
                if all(t[0] != u[0] for u in out):
                    out.append(t)
        return out

    def occluders(self) -> BVHTree:
        """World BVH of what hides a light's pool from an eye, and a pool from its light: the render ground, the walk
        LODs of the Meshy models that cast shadows (the self-lit lamp housings do not) and the stone walls."""
        vs, ts, n = [], [], 0
        objs = [self.ground_obj] + [o for o in self.meshy_objs if o.visible_shadow] + \
            [o for o in self.exported if o.name.startswith("HM_Wall_")]
        for o in objs:
            co = world_co(o)
            ts.append(fan_tris(*mesh_faces(o.data)) + n)
            vs.append(co)
            n += len(co)
        V, T = np.concatenate(vs), np.concatenate(ts)
        log(f"occluders: {len(objs)} objects, {len(T)} triangles")
        return BVHTree.FromPolygons(V.tolist(), T.tolist())

    def rank_lights(self, L: list) -> list:
        """fix 4: each light's effect on screen from the spawns. From every spawn's eye (1.6 m, three.js's 75 degree
        vertical field at 16:9) looking along its facing and the three quarter turns (RANK_HEADINGS: the facing counts
        double), RANK_GRID rays per frame find the surface each pixel sees (occluders()); every light within its range
        adds I cos / d^2 x its range window (three.js's) x its colour's luminance there, unless the surface is shadowed
        from it (its own housing, the first 0.35 m, ignored); a light's score at a spawn is the frames' weighted mean,
        its total the sum over the spawns."""
        bvh = self.occ_bvh
        tv = math.tan(math.radians(VIEW_VFOV / 2.0))
        th = tv * VIEW_ASPECT
        nx, ny = RANK_GRID
        P = [l["p"] for l in L]
        I = [l["W"] / (4.0 * math.pi) * (0.2126 * l["color"][0] + 0.7152 * l["color"][1] + 0.0722 * l["color"][2]) for l in L]
        R = [l["range"] for l in L]
        spot = [(l["axis"], math.cos(l["spot"] / 2.0)) if l.get("spot") else None for l in L]
        scores = [dict(total=0.0, spawns={}) for _ in L]
        u = Vector((0.0, 0.0, 1.0))
        wsum = sum(w for _a, w in RANK_HEADINGS)
        # v1.2b (look check 2026-11-15, 3-3: the door lights dropped at four portals, ranked from the 11 district spawns
        # only): from every spawn of the area as placed (the overworld scene's door spawns too, where they stand after
        # their nudges); a core spawn counts RANK_CORE_WEIGHT
        views = [(s["name"], Vector((s["local"][0], s["local"][1], s["local"][2] + EYE_H)), float(s["facing_deg"]),
                  RANK_CORE_WEIGHT if s.get("core") else 1.0) for s in self.X.spawns if s.get("area") == self.A.key]
        if not views:  # (the spawns not placed yet: the table's)
            views = [(s["name"], Vector((s["xy"][0], s["xy"][1], self.gz(*s["xy"]) + 0.05 + EYE_H)), float(s["theta"]),
                      RANK_CORE_WEIGHT if s.get("core") else 1.0) for s in self.A.spawns]
        # ... and from every portal, facing its door (a door spawn stands at its map tile, up to 8 m from the 3D door
        # the player then walks to: the tavern's front door lights scored nothing from its spawn)
        for p in (getattr(self.X, "portals", None) or []):
            if p.get("shell_face_xy") and p.get("local"):
                dx, dy = p["shell_face_xy"][0] - p["local"][0], p["shell_face_xy"][1] - p["local"][1]
                if math.hypot(dx, dy) > 1e-6:
                    views.append((p["name"], Vector((p["local"][0], p["local"][1], p["local"][2] + EYE_H)),
                                  math.degrees(math.atan2(dy, dx)), 1.0))
        for name, eye, theta, sw in views:
            near = [k for k in range(len(L)) if (P[k] - eye).length < RANK_FAR + R[k]]
            acc = defaultdict(float)
            # the spawn's own view and the three a walker sees by turning round (the walk is free to look about)
            for turn, wgt in RANK_HEADINGS:
                h = math.radians(theta + turn)
                f = Vector((math.cos(h), math.sin(h), 0.0))
                r = Vector((math.sin(h), -math.cos(h), 0.0))
                self._rank_view(bvh, eye, f, r, u, tv, th, nx, ny, near, P, I, R, spot, acc, wgt / wsum)
            for k in range(len(L)):
                v = acc.get(k, 0.0) / (nx * ny)
                scores[k]["spawns"][name] = round(v, 5)
                scores[k]["total"] += sw * v
        return scores

    @staticmethod
    def _rank_view(bvh, eye, f, r, u, tv, th, nx, ny, near, P, I, R, spot, acc, wgt):
        """One frame of rank_lights: adds wgt x each light's light on the surfaces the frame's rays see into acc."""
        for j in range(ny):
            vv = (1.0 - 2.0 * (j + 0.5) / ny) * tv
            for i in range(nx):
                d = (f + r * ((2.0 * (i + 0.5) / nx - 1.0) * th) + u * vv).normalized()
                hit = bvh.ray_cast(eye, d, RANK_FAR)
                if hit[0] is None:
                    continue
                pt, nrm = hit[0], hit[1]
                if nrm.dot(d) > 0.0:
                    nrm = -nrm
                for k in near:
                    dv = P[k] - pt
                    dd = dv.length
                    if dd >= R[k] or dd < 1e-3:
                        continue
                    c = nrm.dot(dv) / dd
                    if c <= 0.0:
                        continue
                    if spot[k] is not None and (-dv / dd).dot(spot[k][0]) < spot[k][1]:
                        continue
                    win = max(0.0, 1.0 - (dd / R[k]) ** 4) ** 2
                    if bvh.ray_cast(pt + nrm * 0.02, dv / dd, max(0.0, dd - 0.35))[0] is not None:
                        continue
                    acc[k] += wgt * I[k] * c / max(dd * dd, 0.01) * win

    def lights(self):
        q = self.look["lights"]
        lamps = [o for o in self.sc.objects if o.type == "LIGHT" and not o.hide_render]
        planned = {}  # the planned keep list (spawns-lights-collision.md 3.3): its labels, and the ties
        for item in self.A.lights:
            if item[0] == "key":
                cand = [o for o in lamps if o.get("wdi_outskirts") == item[1] or o.get("wdi_light_id") == item[1]]
                what = item[2]
            else:
                kind, x, y, what = item
                cand = sorted((o for o in lamps if o.get("wdi_light") == kind and math.hypot(o.location.x - x, o.location.y - y) < 1.5),
                              key=lambda o: math.hypot(o.location.x - x, o.location.y - y))
            if cand:
                planned[cand[0].name] = what
        # every approved light as the GLB would carry it, then ranked by its effect on screen from the spawns
        L = []
        for o in lamps:
            kind = o.get("wdi_light")
            ld = o.data
            W = float(q[kind]["energy"]) * float(o.get("wdi_gain", 1.0)) if kind in q else float(ld.energy)
            col = list(q[kind]["color"][:3]) if kind in q and "color" in q[kind] else list(ld.color)
            if ld.type == "AREA":
                W *= 4.0
            rec = dict(o=o, name=o.name, kind=kind, W=W, color=col, range=LIGHT_RANGE.get(kind, 10.0),
                       p=o.matrix_world.translation.copy(), radius=float(q.get(kind, {}).get("radius", ld.shadow_soft_size)),
                       host=self.light_host(o))
            # v1.2d: the look's shadow switch (the approved village's lamps, windows and teal light cast none: the
            # kept lights' wdi_shadow below says the same); a dropped light's pool must not throw one either
            sw_ = q.get(kind, {}).get("shadow", "keep")
            rec["shadow"] = bool(ld.use_shadow) if sw_ == "keep" else bool(sw_)
            if ld.type == "SPOT":
                rec.update(spot=float(ld.spot_size), blend=float(ld.spot_blend),
                           axis=(o.matrix_world.to_3x3() @ Vector((0.0, 0.0, -1.0))).normalized())
            L.append(rec)
        self.occ_bvh = self.occluders()
        sc_ = self.rank_lights(L)
        order = sorted(range(len(L)), key=lambda k: (-sc_[k]["total"], L[k]["name"] not in planned, L[k]["name"]))
        # the lights a spawn is there to show (its `sees`: the crypt's candle-lamp, the hideout's tower lamp, the
        # trestle's two lamps) stay whatever their score; the rest of the 24 by score
        story = [k for k in order if (L[k]["o"].get("wdi_outskirts") or L[k]["o"].get("wdi_light_id")) in STORY_LIGHTS
                 or L[k]["kind"] in STORY_KINDS or planned.get(L[k]["name"]) in STORY_PLANNED]
        # v1.2c: ... and the lights with a strong showing in a district spawn's own frames (RANK_DISTRICT_KEEP): the
        # door spawns' and portals' views, a metre or two from a lit door, score ten to a hundred times a district
        # view, and the sum alone took the forge's fire (Spawn_railyard is there to show it) out of the 24
        district = {s["name"] for s in self.A.spawns}
        best_d = {k: max((v for n_, v in sc_[k]["spawns"].items() if n_ in district), default=0.0) for k in order}
        strong = [k for k in order if best_d[k] >= RANK_DISTRICT_KEEP and k not in story]
        n_keep = int(getattr(self.X.args, "max_lights", MAX_LIGHTS))
        first = story + strong

        def host_kind(l):
            h = l["host"]
            return (self.master(h[1]).get("wdi_kind") or h[0].get("wdi_kind", "prop")) if h and h[1] else None
        on_kit = [k for k in order if k not in first and L[k]["kind"] in LAMP_GLASS_KINDS
                  and host_kind(L[k]) in BAKE_HOST_KINDS and L[k]["host"][1] not in vb.SELF_LIT]
        keep_idx = set(first) | set([k for k in order if k not in first and k not in on_kit][:max(0, n_keep - len(first))])

        def label(l):
            if l["name"] in planned:
                return planned[l["name"]]
            key = l["o"].get("wdi_outskirts") or l["o"].get("wdi_light_id")
            on = f" on {l['host'][1]}" if l["host"] else ""
            return f"{l['kind']}{on}" + (f" ({key})" if key else "")

        self.info["light_ranking"] = [dict(rank=n + 1, name=L[k]["name"], kind=L[k]["kind"], what=label(L[k]), watts=round(L[k]["W"], 1),
                                           score=round(sc_[k]["total"], 5), kept=k in keep_idx, story=k in story,
                                           district_keep=k in strong, best_district_view=round(best_d[k], 5),
                                           baked_on_its_kit=k in on_kit,
                                           planned=L[k]["name"] in planned,
                                           best_spawn=max(sc_[k]["spawns"], key=sc_[k]["spawns"].get) if sc_[k]["spawns"] else None,
                                           by_spawn={a: b for a, b in sc_[k]["spawns"].items() if b > 0})
                                      for n, k in enumerate(order)]
        for k in order:
            log(f"light rank {L[k]['name']:14s} {L[k]['kind']:8s} {L[k]['W']:6.1f} W score {sc_[k]['total']:.5f} "
                f"{'KEEP' if k in keep_idx else 'drop'} {'(planned)' if L[k]['name'] in planned else ''} "
                f"{'(story)' if k in story else '(district view)' if k in strong else ''} {label(L[k])}")
        keep = {}
        for k, l in enumerate(L):
            if k in keep_idx:
                keep[l["name"]] = label(l)
                continue
            # v1.2 (item D): a dropped light on a prop lays its light on the prop itself as emission (meshy_materials:
            # light_bake), as the original lit it; the self-lit posts have their bulbs and painted glass already.
            # v1.2b (3-3): and on the building it hangs on or stands by (light_targets), whatever its kind
            for host in (self.light_targets(l) if l["kind"] in LIGHT_BAKE_KINDS else []):
                pts = self.lamp_points.setdefault(host[1], [])
                same = [lp for lp in pts if (Vector(lp["p"]) - Vector(host[2])).length <= 0.01]
                if same:
                    if host[0].name not in same[0]["hosts"]:
                        same[0]["hosts"].append(host[0].name)
                else:
                    sh = q.get(l["kind"], {}).get("shadow", "keep")
                    lp = dict(name=l["name"], p=host[2], scale=host[3], color=list(l["color"]), W=l["W"],
                              radius=l["radius"], shadow=bool(l["o"].data.use_shadow) if sh == "keep" else bool(sh),
                              hosts=[host[0].name], kind=l["kind"])
                    if l.get("spot"):  # a spot keeps its cone, its axis in the host's own frame
                        ax = host[0].matrix_world.inverted().to_3x3() @ Vector(l["axis"])
                        lp.update(spot=float(l["spot"]), blend=float(l.get("blend") or 0.0), axis=tuple(ax.normalized()))
                    pts.append(lp)
            # dropped: its pool is baked into the ground (terrain); v1.2 (item A): a spot keeps its cone there
            self.dropped.append(dict(name=l["name"], kind=l["kind"], W=l["W"], color=l["color"], p=l["p"], range=l["range"],
                                     host=l["host"][1] if l["host"] else None, what=label(l), spot=l.get("spot"),
                                     blend=l.get("blend"), axis=l.get("axis"), shadow=l["shadow"], radius=l["radius"]))
            bpy.data.objects.remove(l["o"], do_unlink=True)
        self.info["lights_dropped"] = [dict(name=d["name"], kind=d["kind"], watts=round(d["W"], 1), on=d["host"], what=d["what"],
                                            spot_deg=round(math.degrees(d["spot"]), 1) if d.get("spot") else None,
                                            shadow=d["shadow"])
                                       for d in self.dropped]
        self.info["light_on_props"] = {m: [dict(name=lp["name"], local=[round(v, 3) for v in lp["p"]], scale=round(lp["scale"], 3),
                                                hosts=lp["hosts"]) for lp in pts] for m, pts in self.lamp_points.items()}
        # fix 2's "the lanterns must survive": every LOD of a prop with a lamp, measured round its lamps
        self.info["lantern_survival"] = {m: {me.name: surface_gap(self.welded[m], me, points=[lp["p"] for lp in pts])
                                             for me, _i in self.lods.get(m, [])}
                                         for m, pts in self.lamp_points.items() if m in self.welded}
        for m, v in self.info["lantern_survival"].items():
            log(f"lantern survival {m}: {v}")
        for name, what in keep.items():
            o = bpy.data.objects[name]
            kind = o.get("wdi_light")
            ld = o.data
            converted = None
            if kind in q:
                W = float(q[kind]["energy"]) * float(o.get("wdi_gain", 1.0))
                ld.color = q[kind]["color"][:3]
            else:
                W = float(ld.energy)
            if ld.type == "AREA":  # glTF has no area lights: a wide soft spot on the same axis (on-axis W / pi)
                spot = bpy.data.lights.new(ld.name + "_spot", "SPOT")
                spot.color = ld.color
                spot.spot_size = math.radians(150.0)
                spot.spot_blend = 1.0
                o.data = spot
                ld, W, converted = spot, 4.0 * W, "AREA->SPOT (energy x4, 150 deg, blend 1)"
            ld.energy = W
            ld.use_custom_distance = True
            ld.cutoff_distance = LIGHT_RANGE.get(kind, 10.0)
            # what glTF cannot carry, for the viewer (node extras): the look's shadow switch and soft radius
            sh = q.get(kind, {}).get("shadow", "keep")
            o["wdi_shadow"] = bool(ld.use_shadow) if sh == "keep" else bool(sh)
            o["wdi_radius_m"] = float(q.get(kind, {}).get("radius", ld.shadow_soft_size))
            self.X.lights.append(dict(name=o.name, kind=kind, what=what, type=ld.type, watts=round(W, 2),
                                      color=[round(c, 3) for c in ld.color], range=ld.cutoff_distance,
                                      intensity_compat=round(W / (4.0 * math.pi), 3), converted=converted,
                                      area=self.A.key, blender_local=[round(v, 3) for v in o.location]))
            self.cat[o.name] = "light"
        # the visible bulbs: one shared mesh per kind, emissive constants from the look
        for kind in ("lantern", "drowned"):
            mat = bpy.data.materials.get(f"HM_Bulb_{kind}")
            bulbs = [o for o in self.exported if o.get("wdi_bulb") == kind]
            if mat is None or not bulbs:
                continue
            c = q.get(kind, {}).get("color", (1.0, 0.6, 0.3))
            gltf_material(mat, base=(0.0, 0.0, 0.0), rough=0.5, emission=(c, float(q.get(kind, {}).get("bulb", 20.0))))
            shared = bulbs[0].data
            for b in bulbs[1:]:
                b.data = shared
            for b in bulbs:
                self.cat[b.name] = "misc"
        log(f"lights: kept {len(keep)} of {len(lamps)}")

    # ------------------------------------------------------------ the render ground as a height sampler

    def ground_sampler(self):
        me = self.ground_obj.data
        co = mesh_co(me)
        lv, ls, lt = mesh_faces(me)
        self.g_co, self.g_lv, self.g_ls, self.g_lt = co, lv, ls, lt
        self.ground_bvh = bvh_of(co, lv, ls, lt)
        log(f"ground sampler: {len(co)} verts, {len(ls)} faces")

    def gz(self, x: float, y: float) -> float:
        hit = self.ground_bvh.ray_cast(Vector((x, y, 500.0)), DOWN, 2000.0)
        if hit[0] is not None:
            return hit[0].z
        near = self.ground_bvh.find_nearest(Vector((x, y, 0.0)))
        return near[0].z if near[0] is not None else 0.0

    def walk_dist(self, x: float, y: float) -> float:
        x0, y0, x1, y1 = self.A.walk
        return math.hypot(max(x0 - x, 0.0, x - x1), max(y0 - y, 0.0, y - y1))

    # ------------------------------------------------------------ geometry

    def walk_mesh(self, model: str, name: str, target: int, sharp=SHARP_DEG, uv_first: bool = True, tex_px=None,
                  suffix: str = "", full: bool = False, insts=None, **kw):
        """Weld the model's master, then simplify it into a new shared mesh of about `target` triangles (build_lod;
        `kw` goes to it), or keep it whole (`full`: lod_full); the mesh is recorded under its model for the material
        step (its path says how its maps are made; `suffix` names its material and images, `tex_px` overrides its base
        colour size). `insts`: the probe instances (probe_instance) the see-through gate measures this LOD at."""
        if model not in self.welded:
            self.welded[model] = weld_master(self.master(model).data)
        W = self.welded[model]
        W["insts"] = insts or None
        if full == "orig":
            # v1.2 (items 2 and C): a near copy of FULL_MODELS is the original instance's own mesh (lod_orig: the approved
            # look's own geometry on the Meshy UVs) where that passes the probe, else the whole master
            me, info = lod_orig(W, name, sharp)
            if me is not None and info["see_through"]["through_pct"] <= SEE_MAX:
                info["gate"] = "pass (the original instance's own mesh)"
            else:
                if me is not None:
                    bpy.data.meshes.remove(me)
                full = True
        if full is True:
            me, info = lod_full(W, name, sharp)
            if info["see_through"]["through_pct"] > SEE_MAX:
                info["gate"] = f"FAILED: the whole master lets {info['see_through']['through_pct']} % through"
        elif not full:
            me, info = build_lod(W, name, target, sharp=sharp, uv_first=uv_first, **kw)
        W["insts"] = None
        info["suffix"], info["tex_px"] = suffix, tex_px
        self.simplify_log[name] = self.simplify_log[me.name] = info
        self.lods[model].append((me, info))
        return me

    def master(self, model: str):
        o = bpy.data.objects.get(model)
        if o is None or o.type != "MESH" or o.get("wdi_part") != f"meshy:{model}":
            raise RuntimeError(f"no full-detail master for {model}")
        return o

    def trees(self):
        rep = {}
        self.trunk = {}
        near_m = float(self.X.args.tree_near_m)
        for sp in TREE_MODELS:
            objs = [o for o in self.tree_objs if o["wdi_model"] == sp]
            if not objs:
                continue
            m = self.master(sp)
            near, far = TREE_TRIS[sp]
            # needle cards are all open border: no border lock; the pines' crown tips simplified gentler (fix 9)
            crown = PINE_CROWN if sp in osk.TREE_BASE else None
            me_n = self.walk_mesh(sp, f"{sp}@walk_near", near, sharp=None, uv_first=False, shape_options=0, crown=crown,
                                  search=False, tex_px=TREE_NEAR_PX)
            me_f = self.walk_mesh(sp, f"{sp}@walk_far", far, sharp=None, uv_first=False, shape_options=0, crown=crown,
                                  search=False, suffix="_far", tex_px=BASE_PX["other"])
            # the bare trunk on the master: axis and radius (10th percentile of the band's radial distances)
            co = mesh_co(m.data)
            z0, z1 = TRUNK_BAND[sp]
            band = co[(co[:, 2] > z0) & (co[:, 2] < z1)]
            cx, cy = (float(np.median(band[:, 0])), float(np.median(band[:, 1]))) if len(band) else (0.0, 0.0)
            r = float(np.percentile(np.hypot(band[:, 0] - cx, band[:, 1] - cy), 10)) if len(band) else 0.3
            self.trunk[sp] = (cx, cy, min(0.6, max(0.15, r)))
            counts = {"near_trees": 0, "far_trees": 0, "was_near_master": 0, "was_sunk": 0}
            for o in objs:
                if "@near" in o.data.name:
                    counts["was_near_master"] += 1
                if "@sunk" in o.data.name:
                    counts["was_sunk"] += 1
                # v1.2 (item E): the outskirts sank the skirts of their near masters and sunk copies only
                # (meshy_village_outskirts.near_tree / sunk_mesh); every other tree keeps its snow mound
                o["wdi_sunk_src"] = "@near" in o.data.name or "@sunk" in o.data.name
                tier = "near" if self.walk_dist(o.location.x, o.location.y) <= near_m else "far"
                o.data = me_n if tier == "near" else me_f
                o["wdi_tier"] = tier
                counts[f"{tier}_trees"] += 1
                self.cat[o.name] = f"trees_{tier}"
            rep[sp] = dict(counts, near=self.simplify_log[me_n.name], far=self.simplify_log[me_f.name],
                           trunk=[round(v, 3) for v in self.trunk[sp]], near_m=near_m)
            log(f"trees {sp}: {rep[sp]}")
        self.info["trees"] = rep

    def target_tris(self, model: str, kind: str, src_tris: int) -> int:
        if model == "drystone_wall":
            return int(src_tris * DRYSTONE_RATIO)
        if model in HERO_BUILDINGS:
            return 20000
        if model in TRI_MODEL:
            return TRI_MODEL[model]
        return TRI_KIND.get(kind, 2500)

    def spawn_dist(self, o) -> float:
        """2D distance from the nearest spawn to the object's world bounding box."""
        bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
        x0, x1 = min(v.x for v in bb), max(v.x for v in bb)
        y0, y1 = min(v.y for v in bb), max(v.y for v in bb)
        return min(math.hypot(max(x0 - x, 0.0, x - x1), max(y0 - y, 0.0, y - y1)) for x, y in (s["xy"] for s in self.A.spawns))

    def probe_picks(self, objs: list) -> list:
        """hole_probe.py's choice: the instances nearest the checker's spawn points (their origins), up to
        PROBE_PER_MODEL, as probe instances (before their meshes are swapped)."""
        def d(o):
            p = o.matrix_world.translation
            return min(math.hypot(p.x - x, p.y - y) for x, y in PROBE_SPAWNS)
        return [probe_instance(o) for o in sorted(objs, key=d)[:PROBE_PER_MODEL]]

    def meshy_geometry(self):
        rep = {}
        self.walk_meshes: dict[str, object] = {}
        self.near_meshes: set = set()   # the near copies: their maps at NEAR_PX on the Meshy UVs (meshy_materials)
        self.mid_meshes: set = set()    # v1.2b: the copies by the door spawns and portals
        self.model_near: dict = {}      # model -> metres from its nearest instance to a spawn or door point
        for model, objs in sorted(self.models.items()):
            m = self.master(model)
            kind = m.get("wdi_kind") or objs[0].get("wdi_kind", "prop")
            src = mesh_tris(m.data)
            target = self.target_tris(model, kind, src)
            uv_ok = model not in OFF_UV
            # fix 2: the props by a spawn get more detail, the shattered three wherever they stand; the rest of a model's
            # instances keep its own LOD. v1.2 (items 2 and C): the near copies are the whole welded master on the
            # Meshy UVs (the OFF_UV three too: no LOD of them is left to shatter), the locomotive always
            near_objs = [o for o in objs if model in OFF_UV or model in NEAR_MODELS
                         or (kind == "prop" and self.spawn_dist(o) <= NEAR_PROP_M)]
            # v1.2b (3-4): the props and kits by a door spawn or a portal, and the kits by a district spawn, take the
            # `@walk_mid` copy; not where the model's own LOD is as detailed (its target within 0.7 of MID_TRIS)
            mid_objs = []
            mid_tris = MID_TRIS_MODEL.get(model, MID_TRIS)
            if kind in ("prop", "kit") and target < 0.7 * mid_tris:
                door_m = NEAR_DOOR_PROP_M if kind == "prop" else NEAR_DOOR_M
                mid_objs = [o for o in objs if o not in near_objs and (
                    self.door_dist(o) <= door_m or (kind == "kit" and self.spawn_dist(o) <= NEAR_DOOR_M))]
            far_objs = [o for o in objs if o not in near_objs and o not in mid_objs]
            self.model_near[model] = round(min(min(self.spawn_dist(o), self.door_dist(o)) for o in objs), 2)
            by_obj = {}
            if near_objs:
                if model not in self.welded:
                    self.welded[model] = weld_master(m.data)
                full = len(self.welded[model]["tri"]) <= (FULL_MAX_NAMED if model in FULL_MODELS else FULL_MAX)
                if full and model in FULL_MODELS:
                    full = "orig"  # the original instance's own mesh first (walk_mesh)
                others = bool(far_objs or mid_objs)
                me_near = self.walk_mesh(model, f"{model}@walk_near" if others else f"{model}@walk", NEAR_PROP_TRIS,
                                         uv_first=uv_ok or bool(full), full=full, suffix="_near" if others else "",
                                         tex_px=NEAR_PX_MODEL.get(model, MID_PX) if model in FULL_MODELS else None,
                                         insts=self.probe_picks(near_objs))
                self.near_meshes.add(me_near.name)
                by_obj.update({o.name: me_near for o in near_objs})
            if mid_objs:
                if model not in self.welded:
                    self.welded[model] = weld_master(m.data)
                others = bool(far_objs or near_objs)
                tier_px = BASE_PX["hero" if model in TEX_HERO else ("far" if model in TEX_FAR else "other")]
                me_mid = self.walk_mesh(model, f"{model}@walk_mid" if others else f"{model}@walk", mid_tris,
                                        uv_first=uv_ok, full=len(self.welded[model]["tri"]) <= 1.25 * mid_tris,
                                        suffix="_mid" if others else "", prefer_uv=True, sloppy=False,
                                        tex_px=max(MID_PX, tier_px, TEX_PX_MODEL.get(model, 0)),
                                        insts=self.probe_picks(mid_objs))
                self.mid_meshes.add(me_mid.name)
                by_obj.update({o.name: me_mid for o in mid_objs})
            if far_objs:
                # v1.2 (item F: the forge, jail and Frostgrave chapel regressed on sloppy rebakes): the buildings never
                # take the sloppy clustering; the UV path at more detail, or the whole master, comes first
                me = self.walk_mesh(model, f"{model}@walk", target, uv_first=uv_ok, prefer_uv=model in HERO_BUILDINGS,
                                    sloppy=kind != "building", insts=self.probe_picks(far_objs))
                by_obj.update({o.name: me for o in far_objs})
            me = by_obj[objs[0].name] if not far_objs else by_obj[far_objs[0].name]
            self.walk_meshes[model] = me
            for o in objs:
                o.data = by_obj[o.name]
                if model in DECK_MODELS and kind == "building":
                    cat = "vehicles" if model in ("station_platform", "marsh_dock_skiff") else "buildings"
                elif kind == "building":
                    cat = "buildings"
                elif kind == "vehicle":
                    cat = "vehicles"
                elif model in ("boulder_set", "cliff_section"):
                    cat = "rocks"
                elif model in ("drystone_wall", "Frostbound_Gate", "Frostbound_Warden_Gate", "split_rail_fence"):
                    cat = "walls_fences_gates"
                else:
                    cat = "props"
                self.cat[o.name] = cat
            inf = self.simplify_log[me.name]
            rep[model] = dict(kind=kind, objects=len(objs), master_tris=src, target=target, walk_tris=mesh_tris(me),
                              path=inf.get("path"), method=inf.get("method"), weld_m=inf.get("weld_m"),
                              error_m=inf.get("error_m"), size_m=inf.get("size_m"), gate=inf.get("gate"),
                              higher_detail=inf.get("higher_detail"), see_through=inf.get("see_through"),
                              candidates=inf.get("candidates"))
            if near_objs:
                mn = by_obj[near_objs[0].name]
                ni = self.simplify_log[mn.name]
                rep[model]["near"] = dict(objects=sorted(o.name for o in near_objs), mesh=mn.name, tris=mesh_tris(mn),
                                          path=ni.get("path"), method=ni.get("method"), weld_m=ni.get("weld_m"),
                                          gate=ni.get("gate"), see_through=ni.get("see_through"),
                                          spawn_dist_m=round(min(self.spawn_dist(o) for o in near_objs), 1))
                if not far_objs and not mid_objs:
                    rep[model]["walk_tris"] = mesh_tris(mn)
            if mid_objs:
                mm = by_obj[mid_objs[0].name]
                mi_ = self.simplify_log[mm.name]
                rep[model]["mid"] = dict(objects=sorted(o.name for o in mid_objs), mesh=mm.name, tris=mesh_tris(mm),
                                         path=mi_.get("path"), method=mi_.get("method"), weld_m=mi_.get("weld_m"),
                                         error_m=mi_.get("error_m"), gate=mi_.get("gate"), see_through=mi_.get("see_through"),
                                         door_dist_m=round(min(self.door_dist(o) for o in mid_objs), 1),
                                         spawn_dist_m=round(min(self.spawn_dist(o) for o in mid_objs), 1))
            rep[model]["nearest_spawn_or_door_m"] = self.model_near[model]
            log(f"meshy {model}: {rep[model]['walk_tris']} tris {inf.get('path')}/{inf.get('method')} weld {inf.get('weld_m')} "
                f"{inf.get('gate')} {inf.get('see_through')}" + (f"; near {rep[model]['near']['tris']} "
                                                                 f"{rep[model]['near']['path']} {rep[model]['near']['see_through']}"
                                                                 if near_objs else "")
                + (f"; mid x{len(mid_objs)} {rep[model]['mid']['tris']} {rep[model]['mid']['path']}/{rep[model]['mid']['method']} "
                   f"{rep[model]['mid']['gate']}" if mid_objs else ""))
        self.info["meshy"] = rep
        log(f"meshy geometry: {len(rep)} models, {sum(v['walk_tris'] for v in rep.values())} unique tris; rebaked: "
            f"{sorted(k for k, v in rep.items() if v['path'] == 'rebake')}")
        # v1.2b: the probe's caches go (each master's weld copies, ray bundles and first hits, every original mesh's
        # BVH: over a gigabyte that the bakes after this do not use)
        for W in self.welded.values():
            for key in ("welds", "probe"):
                W.pop(key, None)
            W["insts"] = None
        _ORIG_BVH.clear()
        gc.collect()

    def rocks(self):
        """The outskirts' Poly Haven rock scans (13 meshes, 392 objects): welded, simplified by shape and unwrapped
        afresh (their material is baked onto these UVs in rock_materials)."""
        objs = [o for o in self.exported if o.get("wdi_outskirts") == "rock"]
        by_mesh = defaultdict(list)
        for o in objs:
            by_mesh[o.data].append(o)
        self.rock_meshes = []
        rep = {}
        for me0, users in sorted(by_mesh.items(), key=lambda kv: kv[0].name):
            W = weld_master(me0)
            me, info = lod_shape(W, f"{me0.name}@walk", ROCK_TRIS, sharp=None, options=0)
            self.bk.unwrap(me, ROCK_PX)
            for o in users:
                o.data = me
                self.cat[o.name] = "rocks"
            self.rock_meshes.append(me)
            rep[me.name] = dict(objects=len(users), source_tris=info["source_tris"], tris=info["tris"],
                                method=info["method"], error_m=info["error_m"])
        self.info["rock_meshes"] = rep
        log(f"rocks: {len(objs)} objects on {len(self.rock_meshes)} meshes of about {ROCK_TRIS} tris")

    # ------------------------------------------------------------ Meshy materials

    @staticmethod
    def _image_into(sock):
        """The image node that feeds a socket (directly, or through a Separate Color / Normal Map)."""
        if not sock.is_linked:
            return None
        n = sock.links[0].from_node
        if n.type == "TEX_IMAGE":
            return n.image
        for inp in n.inputs:
            if inp.is_linked and inp.links[0].from_node.type == "TEX_IMAGE":
                return inp.links[0].from_node.image
        return None

    def _master_emit_bake(self, model: str, size, what: str, build) -> tuple[np.ndarray, np.ndarray]:
        """An EMIT bake over the master's UVs of what `build(N, L) -> socket` makes, with no margin into a float image
        cleared to -1: (value (h, w), coverage (h, w) bool: the texels a triangle of the master covers)."""
        m = self.master(model)
        mat = bpy.data.materials.new("WALK_mbake")
        mat.use_nodes = True
        nt = mat.node_tree
        nt.nodes.clear()
        N, L = nt.nodes, nt.links
        out = N.new("ShaderNodeOutputMaterial")
        em = N.new("ShaderNodeEmission")
        L.new(em.outputs[0], out.inputs["Surface"])
        v = build(N, L)
        if isinstance(v, (int, float)):
            em.inputs["Color"].default_value = (float(v), float(v), float(v), 1.0)
        else:
            L.new(v, em.inputs["Color"])
        img = bpy.data.images.new("WALK_mask", size[0], size[1], alpha=False, float_buffer=True)
        img.colorspace_settings.name = "Non-Color"
        img.pixels.foreach_set(np.full(size[0] * size[1] * 4, -1.0, np.float32))
        target_node(mat, img)
        me = m.data.copy()
        me.materials.clear()
        me.materials.append(mat)
        o = self.bk.temp("WALK_mb_" + model, me)
        self.bk.bake([o], "EMIT", 1, f"{what} {model} {size[0]}x{size[1]}", margin=0, clear=False)
        raw = img_pixels(img)[..., 0].copy()
        self.bk.drop(o)
        bpy.data.meshes.remove(me)
        bpy.data.materials.remove(mat)
        bpy.data.images.remove(img)
        cov = raw > -0.5
        return np.where(cov, raw, 0.0).astype(np.float32), cov

    def snow_mask(self, model: str, size) -> tuple[np.ndarray, np.ndarray]:
        """Bake the look's roof snow amount (up-facing x noise patches x roof) over the master's UVs: (mask, coverage).
        v1.2: no bake margin, so the snow stays on its islands (v1.1's 16-texel margin spread it over Meshy's fill
        between them, and the downscale blended it into the next islands: the locomotive's black read frosted grey)."""
        snow = self.look["snow"]

        def build(N, L):
            geo = N.new("ShaderNodeNewGeometry")
            sep = N.new("ShaderNodeSeparateXYZ")
            L.new(geo.outputs["Normal"], sep.inputs[0])
            up = lk._smooth(N, L, sep.outputs[2], 0.50, 0.82)
            nz = N.new("ShaderNodeTexNoise")
            L.new(geo.outputs["Position"], nz.inputs["Vector"])
            nz.inputs["Scale"].default_value = 0.9
            nz.inputs["Detail"].default_value = 4.0
            patch = lk._smooth(N, L, nz.outputs[0], 0.34, 0.58)
            return lk._math(N, L, "MULTIPLY", lk._math(N, L, "MULTIPLY", up, patch), float(snow.get("roof", 0.0)))
        return self._master_emit_bake(model, size, "roof snow", build)

    def uv_coverage(self, model: str, size) -> np.ndarray:
        """The texels of the master's UV islands (an EMIT bake of 1, no margin), for the island-aware downscale."""
        return self._master_emit_bake(model, size, "uv coverage", lambda N, L: 1.0)[1]

    def light_bake(self, model: str, base_img, size, lamps: list) -> np.ndarray:
        """v1.2 (item D: v1.1 lit a 8-20 cm ball round each dropped lamp's point as 'glass', so the waymarker's sign arm
        glowed while its lantern stayed cold, and the Witching Lantern's housing glowed a flat pale): the light the
        prop's dropped lights laid on the prop itself in the original, baked. Cycles DIFFUSE (direct, with colour) over
        the master's UVs, its own base colour lit by those lights alone (no world): each a point light at its place in
        the master's frame, its power / scale^2 and soft radius / scale (the master is at catalog size, the instance at
        `scale`), shadowed by the prop as in the original. Returns the radiance (h, w, 3), linear: what the light
        reflected there, which the viewer then shows as the prop's emission."""
        m = self.master(model)
        sc = self.sc
        mat = bpy.data.materials.new("WALK_lightbake")
        mat.use_nodes = True
        nt = mat.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        dif = nt.nodes.new("ShaderNodeBsdfDiffuse")
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = base_img
        nt.links.new(tex.outputs["Color"], dif.inputs["Color"])
        nt.links.new(dif.outputs[0], out.inputs["Surface"])
        img = bpy.data.images.new("WALK_lb", size[0], size[1], alpha=False, float_buffer=True)
        img.colorspace_settings.name = "Non-Color"
        target_node(mat, img)
        me = m.data.copy()
        me.materials.clear()
        me.materials.append(mat)
        o = self.bk.temp("WALK_lb_" + model, me)
        temps = []
        for lp in lamps:
            ld = bpy.data.lights.new("WALK_lb", "SPOT" if lp.get("spot") else "POINT")
            s = float(lp["scale"])
            ld.energy = float(lp["W"]) / (s * s)
            ld.color = lp["color"][:3]
            ld.shadow_soft_size = float(lp["radius"]) / s
            ld.use_shadow = bool(lp["shadow"])
            lo = bpy.data.objects.new("WALK_lb_light", ld)
            self.bk.coll.objects.link(lo)
            lo.location = lp["p"]
            if lp.get("spot"):  # v1.2b: a spot (the locomotive's headlamp) keeps its cone
                ld.spot_size = float(lp["spot"])
                ld.spot_blend = float(lp.get("blend") or 0.0)
                lo.rotation_mode = "QUATERNION"
                lo.rotation_quaternion = Vector(lp["axis"]).to_track_quat("-Z", "Y")
            temps.append((lo, ld))
        world0 = sc.world
        black = bpy.data.worlds.new("WALK_black")
        black.use_nodes = True
        bg = next((n for n in black.node_tree.nodes if n.type == "BACKGROUND"), None)
        if bg is not None:
            bg.inputs["Strength"].default_value = 0.0
        sc.world = black
        try:
            self.bk.bake([o], "DIFFUSE", 32, f"dropped light on {model} {size[0]}x{size[1]}", margin=4,
                         pass_filter={"DIRECT", "COLOR"})
        finally:
            sc.world = world0
            bpy.data.worlds.remove(black)
        lit = img_pixels(img)[..., :3].copy()
        for lo, ld in temps:
            bpy.data.objects.remove(lo, do_unlink=True)
            bpy.data.lights.remove(ld)
        self.bk.drop(o)
        bpy.data.meshes.remove(me)
        bpy.data.materials.remove(mat)
        bpy.data.images.remove(img)
        return np.maximum(lit, 0.0)

    def meshy_materials(self):
        snow = self.look["snow"]
        tint = np.array(snow["tint"][:3], np.float32)
        em_cfg = self.look["emissive"]
        em_models = set(em_cfg.get("models") or [])
        thr, glow = float(em_cfg["threshold"]), float(em_cfg["strength"])
        forest = bpy.data.collections.get("HM_Forest")
        forest_objs = set(forest.objects) if forest else set()
        rep = {}
        for model in sorted(self.lods):
            m = self.master(model)
            mat0 = m.data.materials[0] if m.data.materials else None
            if mat0 is None:
                self.X.notes.append(f"{model}: master without a material")
                continue
            users = self.models.get(model, []) + [o for o in self.tree_objs if o["wdi_model"] == model]
            bsdf = next((n for n in mat0.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
            base_img = self._image_into(bsdf.inputs["Base Color"])
            mr_img = self._image_into(bsdf.inputs["Roughness"])
            nrm_img = self._image_into(bsdf.inputs["Normal"])
            rough = float(bsdf.inputs["Roughness"].default_value)
            metal = float(bsdf.inputs["Metallic"].default_value)
            tier = "hero" if model in TEX_HERO else ("far" if model in TEX_FAR else "other")
            lin = srgb_to_lin(img_pixels(base_img)[..., :3])
            r = dict(tier=tier, base_src=list(base_img.size), lods={})
            # every map first on the master's own UVs at full resolution, linear
            snowy = any(o not in forest_objs for o in users) and model not in TREE_MODELS and float(snow.get("roof", 0.0)) > 0.0
            on_uv = any(info["path"] == "uv" for _me, info in self.lods[model])
            cov = None  # the master's UV islands (v1.2: the island-aware downscale of the UV-path maps)
            if snowy and self.X.bake:
                mask, cov = self.snow_mask(model, base_img.size)
                mask = mask[..., None]
                lin_b = lin * (1.0 - mask) + tint * mask
                r["snow_cover"] = round(float(mask[cov].mean()) if cov.any() else 0.0, 4)
                del mask
            else:
                lin_b = None  # the master's own base colour
            if cov is None and on_uv and self.X.bake and model not in TREE_MODELS:
                cov = self.uv_coverage(model, base_img.size)
            if cov is not None:
                r["uv_cover_pct"] = round(100.0 * float(cov.mean()), 1)
            glow_lin, glow_s, epx = None, 0.0, 0
            glass_tint = None  # (the lancets': their own colour; else the glow's mean hue: grey_glow)
            if model in em_models:  # lamp glass (the look's emissive), from the original base colour
                warm = smoothstep(0.30, 0.55, lin[..., 0] - lin[..., 2])
                bright = smoothstep(thr, min(1.0, thr + 0.25), 0.5 * lin[..., 0] + 0.5 * lin[..., 1])
                k = warm * bright
                cover = float((k > 0.25).mean())
                r["glass_cover_pct"] = round(cover * 100.0, 4)
                if cover > 5e-6:
                    epx = EMISSIVE_PX[0] if cover > 2e-4 else EMISSIVE_PX[1]
                    glow_lin, glow_s = lin * k[..., None], glow
            if model == osk.LANCET_GLOW["model"]:  # the chapel's red lancets: grey mask x the lancet colour
                G = osk.LANCET_GLOW
                red = lin[..., 0] - np.maximum(lin[..., 1], lin[..., 2])
                k = smoothstep(*G["red"], red) * smoothstep(*G["bright"], lin[..., 0]) * lin[..., 0]
                # (look check 2026-11-15: the lancet a grey slit: the glass is a few texels of the map, and WebP's
                # half-resolution chroma turned its lone red texels grey. v1.2c: the map is the grey mask, as the
                # village build has it, and the lancet colour the material's emissive factor: grey_glow)
                glow_lin, glow_s, epx = k[..., None] * np.array(G["color"], np.float32), float(G["strength"]), LANCET_PX
                glass_tint = list(G["color"])
                r["lancets"] = dict(glass_texels_pct=round(100.0 * float((k > 0.05).mean()), 4))
            # v1.2 (item D): the dropped lights' own light on their prop, baked as emission. v1.2b: per LOD mesh, the
            # lamps EVERY user of that mesh carries (the emission goes into the mesh its users share: the drystone
            # wall's one lamp would light all 35 walls; but the two gates now stand on two meshes, the one by the
            # forest gate's spawn with its lamp kept as a real light, the other with its lamp baked)
            lamps_all = self.lamp_points.get(model) or []
            kind_model = m.get("wdi_kind") or (self.models.get(model) or [m])[0].get("wdi_kind", "prop")
            inst_mesh = {o.name: o.data.name for o in self.models.get(model, [])}
            glass = (glow_lin, glow_s, epx)
            glow_sets: dict[tuple, tuple] = {}
            bakes_rec = []

            def glow_for(names: tuple):
                """(glow image values, strength, size) for a mesh whose users all carry the lamps `names`: the
                glass's own glow with those lamps' light on the model baked in (one bake per set of lamps)."""
                if names in glow_sets:
                    return glow_sets[names]
                g_lin, g_s, g_px = glass
                lamps = [lp for lp in lamps_all if lp["name"] in names]
                if lamps and self.X.bake:
                    # baked at LIGHT_BAKE_PX at most (the light's own gradients are smooth), then repeated to the
                    # base map's size; and never magenta: a warm lamp's light is held on the warm side (WARM_BLUE_MAX)
                    bw, bh = base_img.size
                    kind_m = m.get("wdi_kind") or (self.models.get(model) or [m])[0].get("wdi_kind", "prop")
                    lb_px = LIGHT_BAKE_PX_BUILDING if kind_m == "building" else LIGHT_BAKE_PX
                    fx_ = max(1, int(math.ceil(bw / lb_px)))
                    fy_ = max(1, int(math.ceil(bh / lb_px)))
                    if bw % fx_ or bh % fy_:
                        fx_ = fy_ = 1
                    lit = self.light_bake(model, base_img, (bw // fx_, bh // fy_), lamps)
                    if fx_ > 1 or fy_ > 1:
                        lit = np.repeat(np.repeat(lit, fy_, axis=0), fx_, axis=1)
                    pos = lit.max(axis=-1)
                    hot = pos[pos > 1e-5]
                    rec = dict(lamps=[dict(name=lp["name"], watts=round(lp["W"], 1), scale=round(lp["scale"], 3)) for lp in lamps],
                               baked_px=[bw // fx_, bh // fy_])
                    if hot.size and math.sqrt(max(float(np.percentile(hot, 99.8)), 1e-6) * float(hot.max())) < LIGHT_BAKE_MIN:
                        rec.update(max_radiance=round(float(hot.max()), 4), note=f"its light on the model under {LIGHT_BAKE_MIN}: left out")
                        hot = hot[:0]
                    if hot.size:
                        # the strength: between the 99.8th percentile and the brightest texel (their geometric mean),
                        # so the glass by the bulb keeps most of its glow (v1.2 close look: at the 99.8th percentile
                        # the waymarker's lantern read lit but not glowing) while the dim falloff keeps 8-bit steps of
                        # its own; the texels brighter still clip, as they do under AgX. The image is the radiance
                        # over it
                        p998, top = float(np.percentile(hot, 99.8)), float(hot.max())
                        S = min(max(math.sqrt(max(p998, 1e-6) * max(top, p998)), 1e-3), GLOW_S_MAX)
                        lamp = np.clip(lit / S, 0.0, 1.0)
                        # (never magenta in the file: the map is stored grey, grey_glow below; v1.2b's fade of the
                        # light's dim skirt, there against the codec's hue errors, is gone with them)
                        if g_lin is None:
                            g_lin, g_s = lamp, S
                        else:  # one emissive image and strength for both: each part scaled to its own strength
                            S2 = max(g_s, S)
                            g_lin = np.maximum(g_lin * (g_s / S2), lamp * (S / S2))
                            g_s = S2
                        # the light's gradients over Meshy's small islands: 512; a building's at half its base
                        # colour's size (the LOD loop below: 256, or 512 under a 1024 map)
                        g_px = max(g_px, EMISSIVE_PX[1] if kind_m == "building" else EMISSIVE_PX[0])
                        rec.update(strength=round(S, 4), p99_8=round(p998, 4),
                                   lit_pct=round(100.0 * float((pos > 0.02 * p998).mean()), 2),
                                   clipped_pct=round(100.0 * float((pos > S).mean()), 3), max_radiance=round(float(pos.max()), 3))
                    elif "note" not in rec:
                        rec["note"] = "no surface of the model lit"
                    bakes_rec.append(rec)
                    del lit, pos
                # v1.2c: the map grey, its hue the material's emissive factor (grey_glow)
                g_tint = None
                if g_lin is not None:
                    g_lin, g_tint, sc_ = grey_glow(g_lin, glass_tint)
                    g_s = float(g_s) * sc_
                glow_sets[names] = (g_lin, g_s, g_px, g_tint)
                return glow_sets[names]
            mr = None
            if mr_img is not None:  # metallic-roughness: constants, except the lantern post's real metal
                mr = img_pixels(mr_img)
                rough, metal = float(mr[..., 1].mean()), float(mr[..., 2].mean())
                r["rough_metal"] = [round(rough, 3), round(metal, 3)]
            nrm, n_strength = None, 1.0
            if nrm_img is not None and model in HERO_BUILDINGS:
                nrm = img_pixels(nrm_img)
                nm_node = bsdf.inputs["Normal"].links[0].from_node
                if nm_node.type == "NORMAL_MAP" and not nm_node.inputs["Strength"].is_linked:
                    n_strength = float(nm_node.inputs["Strength"].default_value)
            uv_mats = {}  # (px, lamps) -> material: LODs on the UV path share the Meshy maps (and so the images)
            # v1.2b: a model with an instance within NEAR_PROP_M of a spawn or a door takes NEAR_BASE_PX at least
            near_m = getattr(self, "model_near", {}).get(model, 1e9)
            tier_px = max(BASE_PX[tier], NEAR_BASE_PX if (near_m <= NEAR_PROP_M and model not in TREE_MODELS) else 0)
            r["nearest_spawn_or_door_m"] = None if near_m >= 1e9 else near_m
            for li, (me, info) in enumerate(self.lods[model]):
                suffix = info.get("suffix", "")
                px = info.get("tex_px") or TEX_PX_MODEL.get(model) or tier_px
                # a re-baked map no larger than the master's own (a 512 source gains nothing at 1024)
                if info["path"] != "uv":
                    px = min(px, max(base_img.size))
                users_me = [n_ for n_, mn_ in inst_mesh.items() if mn_ == me.name]
                lamp_names = tuple(sorted(lp["name"] for lp in lamps_all
                                          if users_me and all(u in lp["hosts"] for u in users_me)))
                glow_lin, glow_s, epx, glow_tint = glow_for(lamp_names)
                epx_l = min(epx, max(px, EMISSIVE_PX[1])) if epx else 0   # the glow no larger than its base colour
                if epx_l and model == osk.LANCET_GLOW["model"]:
                    epx_l = epx  # (but the lancets': v1.2c, LANCET_PX)
                if epx_l and lamp_names and px >= 1024 and kind_model == "building":
                    epx_l = max(epx_l, EMISSIVE_PX[0])
                lr = dict(path=info["path"], tris=info["tris"], px=px)
                if lamp_names:
                    lr["lamps_baked"] = list(lamp_names)
                if info["path"] == "uv" and (px, lamp_names) in uv_mats:
                    me.materials.clear()
                    me.materials.append(uv_mats[(px, lamp_names)])
                    lr["shares"] = uv_mats[(px, lamp_names)].name
                    r["lods"][me.name] = lr
                    continue
                mat = bpy.data.materials.new(f"{model}{suffix}")
                emission = normal = mr_keep = None
                if info["path"] == "uv":  # the Meshy maps on their own UVs, downscaled (v1.2: island-aware)
                    uv_mats[(px, lamp_names)] = mat
                    src = lin_b if lin_b is not None else lin
                    w, h = min(px, base_img.size[0]), min(px, base_img.size[1])
                    base = make_image(f"{model}{suffix}_base", lin_to_srgb(downscale_masked(src, cov, w, h)), "sRGB")
                    lr["base"] = [w, h]
                    lr["island_aware"] = cov is not None
                    if glow_lin is not None:
                        e = downscale_masked(glow_lin, cov, min(epx_l, glow_lin.shape[1]), min(epx_l, glow_lin.shape[0]))
                        emission = (make_image(f"{model}{suffix}_glow", lin_to_srgb(e), "sRGB"), glow_s, glow_tint)
                        lr["emissive"] = [int(e.shape[1]), int(e.shape[0]), round(float(glow_s), 4)]
                        lr["emissive_tint"] = glow_tint
                    if mr is not None and model in MR_KEEP:
                        s = MR_KEEP[model]
                        mr_keep = make_image(f"{model}{suffix}_mr", downscale(mr, s, s), "Non-Color")
                        lr["mr_map"] = [s, s]
                    if nrm is not None:
                        s = min(NORMAL_PX, nrm.shape[1])
                        nd = downscale(nrm, s, s)
                        flat = float(np.percentile(np.abs(nd[..., :2] - 0.5), 99))
                        if flat < NORMAL_FLAT and s > NORMAL_PX_FLAT:
                            s = NORMAL_PX_FLAT
                            nd = downscale(nrm, s, s)
                        normal = (make_image(f"{model}{suffix}_normal", nd, "Non-Color"), n_strength, None)
                        lr["normal"] = [s, s]
                        lr["normal_p99_dev"] = round(flat, 4)
                else:  # fresh UVs; the maps baked across from the master
                    ub = self.bk.unwrap(me, px, boost=self.boost_zones(me, [o for o in self.models.get(model, []) if o.data == me]))
                    if ub:
                        lr["uv_boost"] = ub
                    temps, jobs, kinds = [], [], []
                    src_img = base_img
                    if lin_b is not None:
                        src_img = float_image("WALK_src_base", lin_b)
                        temps.append(src_img)
                    jobs.append((src_img, px))
                    kinds.append("base")
                    if glow_lin is not None:
                        gi = float_image("WALK_src_glow", glow_lin)
                        temps.append(gi)
                        jobs.append((gi, epx_l))
                        kinds.append("glow")
                    if mr_img is not None and model in MR_KEEP:
                        jobs.append((mr_img, MR_KEEP[model]))
                        kinds.append("mr")
                    # (also with --no-bake: these bakes take about a second each, and the UVs need their maps)
                    arrs = self.bk.transfer(m.data, me, jobs, float(info.get("error_m") or 0.05), model + suffix)
                    for img_t in temps:
                        bpy.data.images.remove(img_t)
                    got = dict(zip(kinds, arrs))
                    base = make_image(f"{model}{suffix}_base", lin_to_srgb(got["base"]), "sRGB")
                    lr["base"] = [px, px]
                    if "glow" in got:
                        gg = got["glow"]
                        gg = np.repeat(luminance(gg)[..., None], 3, axis=2)  # (grey in, grey out: the bake's rounding off)
                        emission = (make_image(f"{model}{suffix}_glow", lin_to_srgb(gg), "sRGB"), glow_s, glow_tint)
                        lr["emissive"] = [epx_l, epx_l, round(float(glow_s), 4)]
                        lr["emissive_tint"] = glow_tint
                    if "mr" in got:
                        mr_keep = make_image(f"{model}{suffix}_mr", got["mr"], "Non-Color")
                        lr["mr_map"] = [MR_KEEP[model]] * 2
                    if nrm is not None:
                        lr["normal"] = "dropped (re-baked LOD: the Meshy normal map is on the master's UVs)"
                        self.X.notes.append(f"{model}{suffix}: re-baked LOD, its Meshy normal map dropped")
                gltf_material(mat, base=base, rough=rough, metal=metal, normal=normal, emission=emission, mr_image=mr_keep, cull=False)
                me.materials.clear()
                me.materials.append(mat)
                r["lods"][me.name] = lr
                if model in osk.TREE_BASE and info["path"] != "uv":
                    # fix 6, v1.2 (item E: v1.1 sank every pine, and the near masters' root mounds went): the baked snow
                    # skirt sinks under the ground only where the original sank it (its @near and @sunk meshes); the
                    # rest keep their mound, on this mesh, and the sunk take a copy (same UVs and material)
                    sunk = [o for o in self.tree_objs if o.data == me and o.get("wdi_sunk_src")]
                    if sunk:
                        me_s = me.copy()
                        me_s.name = me.name + "_sunk"
                        osk._sink_base(me_s, osk.TREE_BASE[model])
                        for o in sunk:
                            o.data = me_s
                        r["lods"][me_s.name] = dict(lr, base_sunk=True, objects=len(sunk))
                    lr["base_sunk"] = False
                    lr["objects"] = sum(1 for o in self.tree_objs if o.data == me)
            if lamps_all:
                done_names = {n_ for k_ in glow_sets for n_ in k_}
                left = [lp["name"] for lp in lamps_all if lp["name"] not in done_names]
                r["light_bake"] = dict(bakes=bakes_rec)
                if len(bakes_rec) == 1:
                    r["light_bake"].update(bakes_rec[0])
                if left:
                    r["light_bake"]["not_baked"] = dict(lamps=left, note="on some of the instances sharing a mesh only "
                                                        "(their pools still are)")
            glow_sets.clear()
            del lin, lin_b, glow_lin, mr, nrm, cov
            rep[model] = r
        self.info["meshy_textures"] = rep
        log(f"meshy materials: {len(rep)} models")

    # ------------------------------------------------------------ rocks: bakes on the scan meshes

    def rock_materials(self):
        rock = bpy.data.materials.get("HM_Rock")
        snow_rough = 0.70
        out = {}
        col_mat = emit_copy(rock, "Base Color", "WALK_rock_col") if (rock and self.X.bake) else None
        for i, me in enumerate(self.rock_meshes):
            name = f"HM_Rock_{i}"
            mat = bpy.data.materials.new(name)
            if col_mat is None:
                gltf_material(mat, base=(0.30, 0.31, 0.33), rough=snow_rough)
            else:
                cimg = bpy.data.images.new("WALK_rc", ROCK_PX, ROCK_PX, alpha=False, float_buffer=True)
                nimg = bpy.data.images.new("WALK_rn", ROCK_PX, ROCK_PX, alpha=False, float_buffer=True)
                nimg.colorspace_settings.name = "Non-Color"
                tmp_me = me.copy()
                o = self.bk.temp("WALK_rock", tmp_me)
                tmp_me.materials.clear()
                tmp_me.materials.append(col_mat)
                target_node(col_mat, cimg)
                self.bk.bake([o], "EMIT", 16, f"rock {i} colour {ROCK_PX}")
                tmp_me.materials[0] = rock
                target_node(rock, nimg)
                self.bk.bake([o], "NORMAL", 4, f"rock {i} normal {ROCK_PX}")
                self.bk.drop(o)
                bpy.data.meshes.remove(tmp_me)
                c = make_image(f"HM_Rock_{i}_base", lin_to_srgb(img_pixels(cimg)[..., :3]), "sRGB")
                n = make_image(f"HM_Rock_{i}_normal", img_pixels(nimg)[..., :3], "Non-Color")
                bpy.data.images.remove(cimg)
                bpy.data.images.remove(nimg)
                gltf_material(mat, base=c, rough=snow_rough, normal=(n, 1.0, None), cull=False)
            me.materials.clear()
            me.materials.append(mat)
            out[name] = mesh_tris(me)
        if col_mat is not None:
            bpy.data.materials.remove(col_mat)
        self.info["rock_materials"] = out

    # ------------------------------------------------------------ the terrain: tiers, tiles, bakes, chunks

    @staticmethod
    def _ground_sockets(nt):
        """In the ground material (meshy_village_build.terrain_material, the outskirts' ground_layer over it): the
        village's snow cover (1 - bare_all, the socket under its snow-step Bump), the outskirts' bare-steep weight
        (fac), and the scan classes' own sockets {class: (bare, 1 - lying)} from bare_all's MAXIMUM chain (its root
        first: GROUND_CLASS_CHAIN); None (or {}) where the tree differs."""
        snow = fac = None
        classes = {}
        bumps = [n for n in nt.nodes if n.type == "BUMP"]
        vb_bump = next((b for b in bumps if abs(b.inputs["Distance"].default_value - 1.0) < 1e-6 and b.inputs["Height"].is_linked), None)
        try:
            add = vb_bump.inputs["Height"].links[0].from_node
            mul = add.inputs[0].links[0].from_node
            sub = mul.inputs[0].links[0].from_node
            if sub.type == "MATH" and sub.operation == "SUBTRACT":
                snow = sub.outputs[0]
                chain, mx = [], sub.inputs[1].links[0].from_node
                while mx is not None and mx.type == "MATH" and mx.operation == "MAXIMUM":
                    chain.append(mx.inputs[1].links[0].from_node)
                    mx = mx.inputs[0].links[0].from_node if mx.inputs[0].is_linked else None
                if len(chain) == len(GROUND_CLASS_CHAIN):
                    for cls, bn in zip(GROUND_CLASS_CHAIN, chain):
                        if bn.type == "MATH" and bn.operation == "MULTIPLY" and bn.inputs[1].is_linked:
                            classes[cls] = (bn.outputs[0], bn.inputs[1].links[0].from_socket)
        except (AttributeError, IndexError):
            snow = None
        lay_bump = next((b for b in bumps if b != vb_bump), None)
        for n in nt.nodes:  # (==: bpy wraps a node anew at every access, so `is` never matched and fac stayed None)
            if n.type == "MIX" and n.data_type == "VECTOR" and n.inputs[5].is_linked and lay_bump is not None \
                    and n.inputs[5].links[0].from_node == lay_bump and n.inputs[0].is_linked:
                fac = n.inputs[0].links[0].from_socket
        return snow, fac, classes

    def ground_snow_material(self, gmat):
        """An EMIT copy of the ground material giving how little of the trodden scans shows: the alpha of the snow
        overlay on the trodden ground (fix 5). The scans show with weight bare_scan x (1 - fac), bare_scan the largest
        bare weight of the five scan classes (cobble, path, earth, rock, rail) under the outskirts' bare steep ground fac,
        so the overlay's cover is 1 - bare_scan x (1 - fac). (v1.1 pass 3: not bare_all, whose forest floor counts as
        bare: its litter is the tile bake's, and the overlay went clear over it, the scans' brown in zigzags along the
        verges and across the east hills' snowfield.)"""
        m = gmat.copy()
        m.name = "WALK_ground_snow"
        nt = m.node_tree
        snow, fac, classes = self._ground_sockets(nt)
        if snow is None or not all(c in classes for c in GROUND_SCANS):
            bpy.data.materials.remove(m)
            return None
        # v1.2: the speckled classes' cover is their mask alone (their speckle rides in their scans: speckle_map)
        self.speckle_cut = []
        for cls in GROUND_SPECKLE:
            bn = classes[cls][0].node
            for lnk in list(bn.inputs[1].links):
                nt.links.remove(lnk)
            bn.inputs[1].default_value = 1.0
            self.speckle_cut.append(cls)
        em = nt.nodes.new("ShaderNodeEmission")
        em.inputs["Strength"].default_value = 1.0
        bare = None
        for cls in GROUND_SCANS:
            b = classes[cls][0]
            bare = b if bare is None else lk._math(nt.nodes, nt.links, "MAXIMUM", bare, b)
        if fac is not None:
            bare = lk._math(nt.nodes, nt.links, "MULTIPLY", bare, lk._math(nt.nodes, nt.links, "SUBTRACT", 1.0, fac))
        v = lk._math(nt.nodes, nt.links, "SUBTRACT", 1.0, bare)
        self.ground_fac_found = fac is not None
        nt.links.new(v, em.inputs["Color"])
        for out in (n for n in nt.nodes if n.type == "OUTPUT_MATERIAL"):
            nt.links.new(em.outputs[0], out.inputs["Surface"])
        for n in nt.nodes:
            if n.type == "UVMAP" and not n.uv_map:
                n.uv_map = "UVMap"
        return m

    def ground_snowcol_material(self, gmat):
        """v1.2 (items B and G): the colour the alpha-BLENDED overlay carries over the trodden scans: an EMIT copy of the
        ground material's base colour with the five scan classes (cobble, path, earth, rock, rail) weighed 0, their
        colour mixes' factors cut; the snow, and what else lies over it (the forest litter, the outskirts' bare ground
        layer), as they are. Over a class at bare b the overlay's alpha is 1 - b, so scan x b + this x (1 - b) is the
        original's own mix(b, snow, scan), at the scan's own resolution. None where the tree differs."""
        m = emit_copy(gmat, "Base Color", "WALK_ground_snowcol")
        nt = m.node_tree
        _snow, _fac, classes = self._ground_sockets(nt)
        names = {classes[c][0].node.name for c in GROUND_SCANS if c in classes}
        if len(names) != len(GROUND_SCANS):
            bpy.data.materials.remove(m)
            return None
        cut = 0
        for n in list(nt.nodes):
            if n.type == "MIX" and n.inputs[0].is_linked and n.inputs[0].links[0].from_node.name in names:
                nt.links.remove(n.inputs[0].links[0])
                n.inputs[0].default_value = 0.0
                cut += 1
        self.snowcol_cut = cut
        return m

    def snow_colour(self, faces, tco_uv, pw: int, ph: int, samples: int, name: str, mat) -> np.ndarray:
        """The overlay's snow colour (ground_snowcol_material) over a tile's trodden faces only, linear (ph, pw, 3);
        texels no trodden face (or its 2-texel margin) covers stay at -1."""
        co, lv, ls, lt = self.g_co, self.g_lv, self.g_ls, self.g_lt
        loops = face_loops(ls, lt, faces)
        used, inv = np.unique(lv[loops], return_inverse=True)
        inv = inv.ravel()
        tme = mesh_from_arrays(f"WALK_tro_{name}", co[used], inv.astype(np.int32), lt[faces])
        for an, (kind, arr) in self.g_attrs.items():
            at = tme.attributes.new(an, kind, "POINT")
            at.data.foreach_set("color" if kind == "FLOAT_COLOR" else "value", arr[used].ravel())
        uvw = tme.uv_layers.new(name="UVMap")
        uvw.data.foreach_set("uv", co[used][inv][:, :2].astype(np.float32).ravel())
        uvb = tme.uv_layers.new(name="BakeUV")
        uvb.data.foreach_set("uv", tco_uv(faces).astype(np.float32).ravel())
        tme.uv_layers.active = uvb
        uvw.active_render = True
        tme.materials.append(mat)
        o = self.bk.temp(f"WALK_tro_{name}", tme)
        img = bpy.data.images.new("WALK_gsc", pw, ph, alpha=False, float_buffer=True)
        img.pixels.foreach_set(np.full(pw * ph * 4, -1.0, np.float32))
        target_node(mat, img)
        self.bk.bake([o], "EMIT", samples, f"ground {name} overlay snow colour {pw}x{ph}", uv="BakeUV", margin=2, clear=False)
        a = img_pixels(img)[..., :3].copy()
        self.bk.drop(o)
        bpy.data.meshes.remove(tme)
        bpy.data.images.remove(img)
        return a

    def scan_materials(self, snow_lin=None) -> dict:
        """fix 5: the trodden classes' own Poly Haven scans (the village material's roles, colour treatments and
        roughness), TILED_PX, for the trodden faces on world-metre UVs. v1.2 (item B): in their own colour, as the
        village material treats them (scale, desaturation), no frost; the speckled classes (GROUND_SPECKLE) with their
        speckle of the ground's snow (`snow_lin`, linear) in them (speckle_map); the rest of the snow lying on them is
        the overlay's. class -> dict(role, metres, base, normal, rough, mean_srgb, speckle_mean)."""
        q = self.look["snow"]
        out = {}
        for cls, (letter, scale, desat, rough, own_normal) in GROUND_SCANS.items():
            role = vb.GROUND[letter]
            diff = srgb_to_lin(img_pixels(bpy.data.images.load(vb.mr.texture_path(role, "diff", res="1k"), check_existing=True))[..., :3])
            lin = diff * scale
            lin = lin * (1.0 - desat) + luminance(lin)[..., None] * desat
            px = SCAN_PX.get(cls, SCAN_PX_DEFAULT)
            lin_px = downscale(lin, px, px)
            sp_mean = None
            if cls in GROUND_SPECKLE and snow_lin is not None:
                sp = self.speckle_map(cls, vb.ph_metres(role), px)[..., None]
                lin_px = lin_px * (1.0 - sp) + np.asarray(snow_lin, np.float32) * sp
                sp_mean = round(float(sp.mean()), 4)
            base = make_image(f"ground_{cls}_walk", lin_to_srgb(lin_px), "sRGB")
            nrole = role if own_normal else "snow"
            nor = img_pixels(bpy.data.images.load(vb.mr.texture_path(nrole, "nor_gl", res="1k"), check_existing=True))
            nimg = make_image(f"ground_{cls}_walk_normal", downscale(nor, px, px), "Non-Color")
            if rough is None:  # the cobbles: their scan's roughness, wetted (terrain_material's cob_rough)
                r = float(img_pixels(bpy.data.images.load(vb.mr.texture_path(role, "rough", res="1k"), check_existing=True))[..., 0].mean())
                rough = r * 0.6 + float(q.get("cobble_roughness", 0.34)) * 0.4
            out[cls] = dict(role=role, metres=vb.ph_metres(role), base=base, normal=nimg, rough=float(rough),
                            mean_srgb=[int(round(255 * float(v))) for v in lin_to_srgb(lin.reshape(-1, 3).mean(axis=0))],
                            speckle_mean=sp_mean)
        return out

    def speckle_map(self, cls: str, metres: float, px: int) -> np.ndarray:
        """v1.2 (item B): a speckled class's lying snow, terrain_material's amount x smoothstep(n_fine, lo, hi), as a
        tileable (px, px) map over one repeat of its scan (`metres`): the same noise node (scale, detail, roughness of
        N_FINE) in 4D on a flat torus, (u, v) going round two circles of circumference `metres`, so the map repeats with
        the scan and keeps the original's grain and density. An EMIT bake of a unit square."""
        amt, lo, hi = GROUND_SPECKLE[cls]
        scale, detail, rough = N_FINE
        mat = bpy.data.materials.new("WALK_speckle")
        mat.use_nodes = True
        nt = mat.node_tree
        nt.nodes.clear()
        N, L = nt.nodes, nt.links
        out = N.new("ShaderNodeOutputMaterial")
        em = N.new("ShaderNodeEmission")
        L.new(em.outputs[0], out.inputs["Surface"])
        uvn = N.new("ShaderNodeUVMap")
        uvn.uv_map = "UVMap"
        sep = N.new("ShaderNodeSeparateXYZ")
        L.new(uvn.outputs["UV"], sep.inputs[0])
        R = metres / (2.0 * math.pi)
        ang_u = lk._math(N, L, "MULTIPLY", sep.outputs[0], 2.0 * math.pi)
        ang_v = lk._math(N, L, "MULTIPLY", sep.outputs[1], 2.0 * math.pi)
        comb = N.new("ShaderNodeCombineXYZ")
        L.new(lk._math(N, L, "MULTIPLY", lk._math(N, L, "COSINE", ang_u), R), comb.inputs[0])
        L.new(lk._math(N, L, "MULTIPLY", lk._math(N, L, "SINE", ang_u), R), comb.inputs[1])
        L.new(lk._math(N, L, "MULTIPLY", lk._math(N, L, "COSINE", ang_v), R), comb.inputs[2])
        nz = N.new("ShaderNodeTexNoise")
        nz.noise_dimensions = "4D"
        L.new(comb.outputs[0], nz.inputs["Vector"])
        L.new(lk._math(N, L, "MULTIPLY", lk._math(N, L, "SINE", ang_v), R), nz.inputs["W"])
        nz.inputs["Scale"].default_value = scale
        nz.inputs["Detail"].default_value = detail
        nz.inputs["Roughness"].default_value = rough
        v = lk._math(N, L, "MULTIPLY", lk._smooth(N, L, nz.outputs[0], lo, hi), amt)
        L.new(v, em.inputs["Color"])
        img = bpy.data.images.new("WALK_speckle", px, px, alpha=False, float_buffer=True)
        img.colorspace_settings.name = "Non-Color"
        target_node(mat, img)
        me = mesh_from_arrays("WALK_speckle", np.array([[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [1.0, 1.0, 0.0], [0.0, 1.0, 0.0]]),
                              np.arange(4, dtype=np.int32), np.array([4]))
        uvl = me.uv_layers.new(name="UVMap")
        uvl.data.foreach_set("uv", np.array([[0, 0], [1, 0], [1, 1], [0, 1]], np.float32).ravel())
        me.materials.append(mat)
        o = self.bk.temp("WALK_speckle", me)
        self.bk.bake([o], "EMIT", 4, f"ground {cls} speckle {px}x{px} over {metres:.2f} m", uv="UVMap", margin=0)
        a = np.clip(img_pixels(img)[..., 0], 0.0, amt).copy()
        self.bk.drop(o)
        bpy.data.meshes.remove(me)
        bpy.data.materials.remove(mat)
        bpy.data.images.remove(img)
        return a

    def ground_snow_lin(self, snowcol_mat) -> list:
        """v1.2: the ground's own snow colour (linear RGB), for the speckle in the scans: the overlay's colour material
        (ground_snowcol_material: the scan classes weighed 0) baked over a bare 24 m square at the map's centre (no class
        weights: the snow alone, its tint, grain and drifts), its mean."""
        h = 12.0
        me = mesh_from_arrays("WALK_snowsq", np.array([[-h, -h, 0.0], [h, -h, 0.0], [h, h, 0.0], [-h, h, 0.0]]),
                              np.arange(4, dtype=np.int32), np.array([4]))
        uvw = me.uv_layers.new(name="UVMap")
        uvw.data.foreach_set("uv", np.array([[-h, -h], [h, -h], [h, h], [-h, h]], np.float32).ravel())
        uvb = me.uv_layers.new(name="BakeUV")
        uvb.data.foreach_set("uv", np.array([[0, 0], [1, 0], [1, 1], [0, 1]], np.float32).ravel())
        me.uv_layers.active = uvb
        uvw.active_render = True
        me.materials.append(snowcol_mat)
        o = self.bk.temp("WALK_snowsq", me)
        img = bpy.data.images.new("WALK_snowsq", 256, 256, alpha=False, float_buffer=True)
        target_node(snowcol_mat, img)
        self.bk.bake([o], "EMIT", 8, "ground snow colour (24 m square)", uv="BakeUV", margin=2)
        px = img_pixels(img)[..., :3]
        self.bk.drop(o)
        bpy.data.meshes.remove(me)
        bpy.data.images.remove(img)
        return [round(float(v), 4) for v in px.reshape(-1, 3).mean(axis=0)]

    def steep_islands(self, sf, attrs: dict, col_mat, rough_mat) -> dict:
        """fix 8: the steep tier A and B faces (sf) as one piece on UV islands of their own (Smart UV Project, about
        STEEP_TEXEL_M a texel, the atlas at most STEEP_PX), its colour and roughness EMIT-baked from the ground material
        as the tiles are (the original's snow, ledges, earth and rock, unstretched)."""
        co, lv, ls, lt = self.g_co, self.g_lv, self.g_ls, self.g_lt
        loops = face_loops(ls, lt, sf)
        used, inv = np.unique(lv[loops], return_inverse=True)
        inv = inv.ravel()
        sco = co[used]
        sme = mesh_from_arrays("WALK_steep", sco, inv.astype(np.int32), lt[sf])
        for an, (kind, arr) in attrs.items():
            at = sme.attributes.new(an, kind, "POINT")
            at.data.foreach_set("color" if kind == "FLOAT_COLOR" else "value", arr[used].ravel())
        uvw = sme.uv_layers.new(name="UVMap")
        uvw.data.foreach_set("uv", sco[inv][:, :2].astype(np.float32).ravel())
        uvb = sme.uv_layers.new(name="BakeUV")
        sme.uv_layers.active = uvb
        uvw.active_render = True
        area = float(sum(p.area for p in sme.polygons))
        px = int(min(STEEP_PX, max(128, math.ceil(math.sqrt(area / 0.6) / STEEP_TEXEL_M / 8.0) * 8)))
        o = self.bk.temp("WALK_steep", sme)
        vl = bpy.context.view_layer
        for x in self.bk.coll.objects:
            x.select_set(False)
        o.select_set(True)
        vl.objects.active = o
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=2.0 / px, area_weight=0.0,
                                 correct_aspect=True, scale_to_bounds=False)
        bpy.ops.object.mode_set(mode="OBJECT")
        buv = np.empty(len(sme.loops) * 2, np.float32)
        sme.uv_layers["BakeUV"].data.foreach_get("uv", buv)
        sme.materials.append(col_mat)
        cimg = bpy.data.images.new("WALK_sc", px, px, alpha=False, float_buffer=True)
        target_node(col_mat, cimg)
        cs, rs = GROUND_SAMPLES["A"]
        self.bk.bake([o], "EMIT", cs, f"ground steep colour {px}x{px}", uv="BakeUV", margin=max(4, px // 64))
        rimg = bpy.data.images.new("WALK_sr", px, px, alpha=False, float_buffer=True)
        rimg.colorspace_settings.name = "Non-Color"
        sme.materials[0] = rough_mat
        target_node(rough_mat, rimg)
        self.bk.bake([o], "EMIT", rs, f"ground steep roughness {px}x{px}", uv="BakeUV", margin=max(4, px // 64))
        sp = self.steep_pool(o, sme, cimg, px, sco) if (self.dropped and self.X.bake) else None
        self.bk.drop(o)
        bpy.data.meshes.remove(sme)
        c = make_image(f"{self.A.key}_ground_steep_base", lin_to_srgb(img_pixels(cimg)[..., :3]), "sRGB")
        rr = downscale(img_pixels(rimg)[..., :1], max(8, px // 4), max(8, px // 4))[..., 0]
        rgb = np.zeros(rr.shape + (3,), np.float32)
        rgb[..., 1] = rr
        r = make_image(f"{self.A.key}_ground_steep_rough", rgb, "Non-Color")
        bpy.data.images.remove(cimg)
        bpy.data.images.remove(rimg)
        emis = (sp[0], sp[1], sp[2]) if sp else None  # v1.2d: the dropped lights' light on it (steep_pool)
        mat = gltf_material(bpy.data.materials.new(f"{self.A.key}_ground_steep"), base=c, rough=r, cull=True, emission=emis)
        ob = self.ground_piece("HM_GroundSteep", sf, {"UVMap": buv.reshape(-1, 2)}, [mat])
        ob["wdi_ground"] = "the tier A and B ground steeper than 45 degrees, on UV islands of its own (its own bake)"
        return dict(faces=int(len(sf)), tris=mesh_tris(ob.data), area_m2=round(area, 1), px=[px, px],
                    texel_cm=round(100.0 * math.sqrt(area / 0.6) / px, 1), pool=sp[3] if sp else None)

    def steep_pool(self, o, sme, cimg, px: int, sco: np.ndarray):
        """v1.2d (Spawn_company_row's arrival frame: the snow bank under the shift bell post a hard-edged cold patch beside
        the pool-lit snow): the light the dropped lights lay on the steep ground. The tiles' pool maps (pool_map) read
        the tiles' own UVs and the steep faces are one piece on UV islands of their own, so a bank inside a pool's reach
        stayed unlit beside its lit neighbours. Cycles DIFFUSE (direct, with colour) from the dropped lights whose range
        touches the piece, over the piece's own islands on its baked colour, as light_bake does for a prop (each light as
        the look has it: its power, colour, soft radius, a spot its cone, a shadow only where the look gives it one,
        by the piece alone); stored as a tile's pool is, grey with the hue as the emissive factor, at STEEP_POOL_PX.
        (image, strength, tint, info) or None where no dropped light reaches the piece."""
        lamps = [l for l in self.dropped if float(np.min(np.linalg.norm(sco - np.array(l["p"], np.float64), axis=1))) <= l["range"]]
        if not lamps:
            return None
        t0 = time.time()
        cb = bpy.data.images.new("WALK_sc_lb", px, px, alpha=False, float_buffer=True)
        cb.colorspace_settings.name = "Non-Color"
        cb.pixels.foreach_set(np.ascontiguousarray(img_pixels(cimg), np.float32).ravel())
        mat = bpy.data.materials.new("WALK_steep_lightbake")
        mat.use_nodes = True
        nt = mat.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        dif = nt.nodes.new("ShaderNodeBsdfDiffuse")
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = cb
        nt.links.new(tex.outputs["Color"], dif.inputs["Color"])
        nt.links.new(dif.outputs[0], out.inputs["Surface"])
        img = bpy.data.images.new("WALK_sp", px, px, alpha=False, float_buffer=True)
        img.colorspace_settings.name = "Non-Color"
        target_node(mat, img)
        sme.materials[0] = mat
        temps = []
        for l in lamps:
            ld = bpy.data.lights.new("WALK_sp", "SPOT" if l.get("spot") else "POINT")
            ld.energy = float(l["W"])
            ld.color = l["color"][:3]
            ld.shadow_soft_size = float(l["radius"])
            ld.use_shadow = bool(l["shadow"])
            lo = bpy.data.objects.new("WALK_sp_light", ld)
            self.bk.coll.objects.link(lo)
            lo.location = l["p"]
            if l.get("spot"):
                ld.spot_size = float(l["spot"])
                ld.spot_blend = float(l.get("blend") or 0.0)
                lo.rotation_mode = "QUATERNION"
                lo.rotation_quaternion = Vector(l["axis"]).to_track_quat("-Z", "Y")
            temps.append((lo, ld))
        sc = self.sc
        world0 = sc.world
        black = bpy.data.worlds.new("WALK_black")
        black.use_nodes = True
        bg = next((n for n in black.node_tree.nodes if n.type == "BACKGROUND"), None)
        if bg is not None:
            bg.inputs["Strength"].default_value = 0.0
        sc.world = black
        try:
            self.bk.bake([o], "DIFFUSE", 32, f"dropped lights on the steep ground {px}x{px}", uv="BakeUV",
                         margin=max(4, px // 64), pass_filter={"DIRECT", "COLOR"})
        finally:
            sc.world = world0
            bpy.data.worlds.remove(black)
        lit = np.maximum(img_pixels(img)[..., :3], 0.0)
        for lo, ld in temps:
            bpy.data.objects.remove(lo, do_unlink=True)
            bpy.data.lights.remove(ld)
        bpy.data.materials.remove(mat)
        bpy.data.images.remove(img)
        bpy.data.images.remove(cb)
        # what a tile's pool would not carry either: under POOL_EMIN's irradiance (on a 0.6 albedo) a texel is dark; a warm
        # light's reflection held on the warm side (WARM_BLUE_MAX), as in pool_map
        lit = np.where(lit.max(axis=2, keepdims=True) > POOL_EMIN * 0.6 / math.pi, lit, 0.0)
        lit[..., 2] = np.minimum(lit[..., 2], WARM_BLUE_MAX * lit[..., 1])
        pe = STEEP_POOL_PX
        L = downscale(lit, pe, pe)
        top = float(L.max())
        if top < 1e-3:
            return None
        grey, tint, sc_ = grey_glow(L / top)
        pool = make_image(f"{self.A.key}_ground_steep_pool", lin_to_srgb(grey), "sRGB")
        info = dict(strength=round(top * sc_, 4), tint=tint, px=[pe, pe], lights=[l["name"] for l in lamps],
                    lit_texels_pct=round(100.0 * float((lit.max(axis=2) > 0.0).mean()), 2), seconds=round(time.time() - t0, 1))
        log(f"steep ground pool: {info}")
        return pool, info["strength"], tint, info

    def pool_map(self, name: str, x0: float, y0: float, W: float, H: float, base_lin: np.ndarray):
        """fix 4: the light the dropped lights laid on this tile of ground, as emitted light: each texel (POOL_TEXEL_M)
        of the ground lit by I cos / d^2 (fading out over the last quarter of the light's range), shadowed by the walk
        LODs (the lamp's own housing, the first 0.35 m, ignored), times its albedo / pi: exactly what the light would
        have reflected there. (image, strength) or None where no dropped light reaches the tile."""
        near = []
        for l in self.dropped:
            r = l["range"]
            p = l["p"]
            if x0 - r < p.x < x0 + W + r and y0 - r < p.y < y0 + H + r:
                near.append((l, r))
        if not near:
            return None, None
        t0 = time.time()
        qw, qh = max(8, int(math.ceil(W / POOL_TEXEL_M))), max(8, int(math.ceil(H / POOL_TEXEL_M)))
        xs = x0 + (np.arange(qw) + 0.5) * W / qw
        ys = y0 + (np.arange(qh) + 0.5) * H / qh
        alb = downscale(base_lin, qw, qh)
        acc = np.zeros((qh, qw, 3), np.float64)
        gp = np.zeros((qh, qw, 3))
        gn = np.zeros((qh, qw, 3))
        ok = np.zeros((qh, qw), bool)
        bvh = self.ground_bvh
        for j in range(qh):  # the ground under every texel, once
            for i in range(qw):
                hit = bvh.ray_cast(Vector((xs[i], ys[j], 500.0)), DOWN, 2000.0)
                if hit[0] is not None:
                    gp[j, i], gn[j, i], ok[j, i] = hit[0], hit[1], True
        n_rays = 0
        occ = self.occ_bvh
        for l, r in near:
            p = np.array(l["p"])
            col = np.array(l["color"][:3], np.float64)
            I = l["W"] / (4.0 * math.pi)
            i0, i1 = max(0, int((p[0] - r - x0) / W * qw)), min(qw, int(math.ceil((p[0] + r - x0) / W * qw)))
            j0, j1 = max(0, int((p[1] - r - y0) / H * qh)), min(qh, int(math.ceil((p[1] + r - y0) / H * qh)))
            if i1 <= i0 or j1 <= j0:
                continue
            P_, N_ = gp[j0:j1, i0:i1], gn[j0:j1, i0:i1]
            dv = p - P_
            d = np.maximum(np.linalg.norm(dv, axis=-1), 0.05)
            c = (N_ * dv).sum(axis=-1) / d
            win = smoothstep(r, 0.75 * r, d)  # 1 inside three quarters of the range, gone at the range
            E = I * np.maximum(c, 0.0) / (d * d) * win
            if l.get("spot"):
                # v1.2 (item A: L_headlamp, a 450 W spot with a 38 degree cone 3.3 m from Spawn_station_street, was
                # baked as a pool in every direction): the cone as the viewer would draw the light, three.js's
                # smoothstep(cos outer, cos inner) with glTF's outer = size / 2, inner = outer (1 - blend)
                outer = 0.5 * float(l["spot"])
                inner = outer * (1.0 - float(l.get("blend") or 0.0))
                cos_a = (-dv / d[..., None]) @ np.asarray(l["axis"], np.float64)
                E = E * smoothstep(math.cos(outer), math.cos(inner), cos_a)
            lit = ok[j0:j1, i0:i1] & (E > POOL_EMIN)
            shad = np.zeros(lit.shape, np.float32)
            # v1.2d (the shift bell's close view and Spawn_company_row's arrival frame, after v1.2c's softening: its
            # post's shadow still a hard parallelogram on the snow, and the lamp's warm light gone from it): the look
            # gives the lamps, windows and the teal light NO shadow (wdi_shadow false on every kept one), so their
            # pools are lit with none; only a shadow-casting light (the lanterns, the fire, the drowned lantern, the
            # headlamp) is shadowed by the walk LODs, as before
            for jj, ii in (zip(*np.nonzero(lit)) if l.get("shadow", True) else ()):  # the lamp's own housing ignored
                n_rays += 1
                o_ = Vector(P_[jj, ii] + N_[jj, ii] * 0.03)
                dd = float(d[jj, ii])
                if occ.ray_cast(o_, Vector(dv[jj, ii] / dd), max(0.0, dd - 0.35))[0] is not None:
                    shad[jj, ii] = 1.0
            # v1.2c (the shift bell's close view: its post's shadow a hard parallelogram on the snow, in 0.25 m steps):
            # the shadow's edge softened over two texels each way (two 3 x 3 means), as a lamp's own size softens it
            for _ in range(2 if l.get("shadow", True) else 0):
                sp = np.pad(shad, 1, mode="edge")
                shad = sum(sp[1 + dj:1 + dj + shad.shape[0], 1 + di:1 + di + shad.shape[1]]
                           for dj in (-1, 0, 1) for di in (-1, 0, 1)) / 9.0
            lit = lit * (1.0 - shad)
            # what this light reflects there (its albedo / pi); v1.2b: never magenta, a warm light's reflection held
            # on the warm side (WARM_BLUE_MAX: a few dark plum texels where a warm pool lay on the blue-violet ground)
            part = alb[j0:j1, i0:i1] * ((E * lit)[..., None] * col) / math.pi
            if col[0] >= col[1] >= col[2]:
                part[..., 2] = np.minimum(part[..., 2], WARM_BLUE_MAX * part[..., 1])
            acc[j0:j1, i0:i1] += part
        L = acc
        top = float(L.max())
        if top < 1e-3:
            return None, None
        # v1.2c: stored grey, its hue the materials' emissive factor (grey_glow: no plum texel can come of the codec)
        grey, tint, sc_ = grey_glow(L / top)
        img = make_image(f"{self.A.key}_ground_{name}_pool", lin_to_srgb(grey), "sRGB")
        return img, dict(strength=round(top * sc_, 4), tint=tint, px=[qw, qh], lights=[l["name"] for l, _r in near],
                         shadow_rays=n_rays, seconds=round(time.time() - t0, 1))

    def ground_piece(self, name: str, faces, uv_layers: dict, materials: list, mat_index=None, lift: float = 0.0,
                     skirt: bool = False):
        """A ground object of the given HM_Ground faces: uv_layers {name: per-loop (n, 2) array in the faces' loop
        order}, the first the render UV; materials by slot, mat_index per face; smooth with the ground's own normals,
        lifted `lift` metres. With `skirt`, a wall from every edge of its outline down to the ground, facing out, with
        the outline's UVs and the ground's normals (it shades as the surface it closes): the lifted overlay then meets
        the chunks round it with no gap to see under (v1.1 pass 3: each edge of its outline facing the eye showed
        the scans' dark under it, a dash along every path)."""
        co, lv, ls, lt = self.g_co, self.g_lv, self.g_ls, self.g_lt
        sl = face_loops(ls, lt, faces)
        su, sinv = np.unique(lv[sl], return_inverse=True)
        sinv = sinv.ravel()
        sco = co[su].copy()
        sco[:, 2] += lift
        sizes = lt[faces].astype(np.int32)
        loop_v = sinv.astype(np.int32)
        uvs = {k: np.asarray(v, np.float32).reshape(-1, 2) for k, v in uv_layers.items()}
        vn = self.g_vn[su]
        mi = None if mat_index is None else np.asarray(mat_index, np.int32)
        if skirt and lift > 0.0 and len(faces):
            f0 = np.r_[0, np.cumsum(sizes)[:-1]]                 # each face's first loop, in the piece's loop order
            fpos = np.repeat(np.arange(len(faces)), sizes)      # each loop's face
            k = np.arange(len(sl)) - f0[fpos]
            nxt = f0[fpos] + (k + 1) % sizes[fpos]
            va, vb = lv[sl], lv[sl][nxt]
            nv = np.int64(len(co))
            edge = ~np.isin(vb.astype(np.int64) * nv + va, va.astype(np.int64) * nv + vb)  # no face of it runs b -> a
            ia, ib = np.nonzero(edge)[0], nxt[edge]
            if len(ia):
                cen = np.add.reduceat(co[lv[sl]], f0, axis=0) / sizes[:, None]
                ea, eb = va[ia], vb[ia]
                d = co[eb, :2] - co[ea, :2]
                to_face = cen[fpos[ia], :2] - 0.5 * (co[ea, :2] + co[eb, :2])
                right = (d[:, 1] * to_face[:, 0] - d[:, 0] * to_face[:, 1]) > 0.0  # the face lies right of a -> b
                ea, eb = np.where(right, eb, ea), np.where(right, ea, eb)
                ua = {n_: np.where(right[:, None], arr[ib], arr[ia]) for n_, arr in uvs.items()}
                ub = {n_: np.where(right[:, None], arr[ia], arr[ib]) for n_, arr in uvs.items()}
                up = np.array([0.0, 0.0, lift])
                # (a, b, b lifted, a lifted) faces right of a -> b, away from the piece's face
                wall = np.stack([co[ea], co[eb], co[eb] + up, co[ea] + up], axis=1).reshape(-1, 3)
                m = len(ea)
                loop_v = np.concatenate([loop_v, len(sco) + np.arange(4 * m, dtype=np.int32)])
                sco = np.concatenate([sco, wall])
                sizes = np.concatenate([sizes, np.full(m, 4, np.int32)])
                vn = np.concatenate([vn, np.stack([self.g_vn[ea], self.g_vn[eb], self.g_vn[eb], self.g_vn[ea]], axis=1).reshape(-1, 3)])
                for n_ in uvs:  # the lifted edge a hair across in UV (a wall with no UV height has no tangent frame)
                    duv = ub[n_] - ua[n_]
                    perp = np.stack([-duv[:, 1], duv[:, 0]], axis=1)
                    perp = perp / np.maximum(np.linalg.norm(perp, axis=1, keepdims=True), 1e-9) * 4e-4
                    uvs[n_] = np.concatenate([uvs[n_], np.stack([ua[n_], ub[n_], ub[n_] + perp, ua[n_] + perp], axis=1).reshape(-1, 2)])
                if mi is not None:
                    mi = np.concatenate([mi, mi[fpos[ia]]])
                self.skirt_edges = getattr(self, "skirt_edges", 0) + m
        me = mesh_from_arrays(name, sco, loop_v, sizes)
        for uvn, arr in uvs.items():
            layer = me.uv_layers.new(name=uvn)
            layer.data.foreach_set("uv", np.ascontiguousarray(arr, np.float32).ravel())
        me.shade_smooth()
        me.normals_split_custom_set_from_vertices(vn.tolist())
        for m in materials:
            me.materials.append(m)
        if mi is not None:
            me.polygons.foreach_set("material_index", np.ascontiguousarray(mi, np.int32))
        ob = bpy.data.objects.new(name, me)
        for c_ in self.ground_obj.users_collection:
            c_.objects.link(ob)
        self.chunks.append(ob)
        self.cat[ob.name] = "terrain"
        return ob

    def terrain(self):
        self.rock_materials()  # inside the isolated bake phase too
        me = self.ground_obj.data
        co, lv, ls, lt = self.g_co, self.g_lv, self.g_ls, self.g_lt
        nf = len(ls)
        face_of_loop = np.repeat(np.arange(nf), lt)
        cx = np.bincount(face_of_loop, weights=co[lv, 0], minlength=nf) / lt
        cy = np.bincount(face_of_loop, weights=co[lv, 1], minlength=nf) / lt
        fnrm = np.empty(nf * 3, np.float32)
        me.polygons.foreach_get("normal", fnrm)
        fnrm = fnrm.reshape(-1, 3)
        # tiers
        b_rects = [tuple(np.add(r, (-4.0, -4.0, 4.0, 4.0))) for _k, (_n, r) in osk.DISTRICTS.items()] + GROUND_B_EXTRA
        region = np.full(nf, -1, np.int32)  # 0 = A, 1.. = B rects, 999 = C
        regions = [("A", 0.04, GROUND_A[0])] + [("B", 0.08, r) for r in b_rects]
        for ri, (_t, _d, (x0, y0, x1, y1)) in enumerate(regions):
            sel = (region < 0) & (cx >= x0) & (cx < x1) & (cy >= y0) & (cy < y1)
            region[sel] = ri
        region[region < 0] = 999
        # fix 8: the tier A and B faces steeper than 45 degrees leave their tiles for a bake of their own on UV islands
        # (the top-down tile bake stretched them: the mill's rock face a streaked smear)
        steep = (region < 999) & (fnrm[:, 2] < STEEP_NZ) if self.X.bake else np.zeros(nf, bool)
        tiles = []  # (name, tier, face index array)
        for ri, (tier, d, (x0, y0, x1, y1)) in enumerate(regions):
            fsel = np.nonzero((region == ri) & ~steep)[0]
            if not len(fsel):
                continue
            span = 1024 * d
            nx = max(1, math.ceil((x1 - x0) / span - 0.03))
            ny = max(1, math.ceil((y1 - y0) / span - 0.03))
            ix = np.clip(((cx[fsel] - x0) / ((x1 - x0) / nx)).astype(int), 0, nx - 1)
            iy = np.clip(((cy[fsel] - y0) / ((y1 - y0) / ny)).astype(int), 0, ny - 1)
            for a in range(nx):
                for b in range(ny):
                    f = fsel[(ix == a) & (iy == b)]
                    if len(f):
                        tiles.append((f"{tier}{ri}_{a}{b}", tier, d, f))
        fc = np.nonzero((region == 999) & ~steep)[0]
        tiles.append(("C", "C", None, fc))
        vn = np.empty(len(me.vertices) * 3, np.float32)
        me.vertex_normals.foreach_get("vector", vn)
        vn = vn.reshape(-1, 3)
        self.g_vn = vn
        attrs = {}
        for name in ("wdi_a", "wdi_b", "wdi_up"):
            a = me.attributes.get(name)
            if a is None:
                continue
            if a.data_type == "FLOAT_COLOR":
                arr = np.empty(len(me.vertices) * 4, np.float32)
                a.data.foreach_get("color", arr)
                attrs[name] = ("FLOAT_COLOR", arr.reshape(-1, 4))
            else:
                arr = np.empty(len(me.vertices), np.float32)
                a.data.foreach_get("value", arr)
                attrs[name] = ("FLOAT", arr)
        # the look's snow values in the ground material, then the two bake copies
        lk.apply_ground(self.sc, self.look["snow"])
        gmat = me.materials[0]
        bake = self.X.bake
        col_mat = emit_copy(gmat, "Base Color", "WALK_ground_col") if bake else None
        rough_mat = emit_copy(gmat, "Roughness", "WALK_ground_rough") if bake else None
        detail = None
        if bake:
            nimg = bpy.data.images.load(vb.mr.texture_path("snow", "nor_gl", res="1k"), check_existing=True)
            n = img_pixels(nimg)
            detail = make_image("snow_02_detail_normal", downscale(n, DETAIL_PX, DETAIL_PX), "Non-Color")
        # fix 5: the trodden ground (the paths, roads and cobbles) in first-person range takes its own scans on world
        # UVs, with the snow over it as an overlay of the tile's own bake (its alpha the snow cover), lifted
        # OVERLAY_LIFT and skirted down to the chunks round it. v1.2 (items B and G): the overlay is alpha-BLENDED and
        # carries the snow's own colour over the trodden faces (ground_snowcol_material), the scans their own colour
        self.g_attrs = attrs
        snow_mat = self.ground_snow_material(gmat) if bake else None
        if bake and snow_mat is None:
            self.X.notes.append("ground: the snow-cover socket was not found in HM_Ground; no trodden overlay")
        snowcol_mat = self.ground_snowcol_material(gmat) if snow_mat is not None else None
        if snow_mat is not None and snowcol_mat is None:
            self.X.notes.append("ground: the scan classes' colour mixes were not found; the overlay keeps the tile's colour")
        if snow_mat is not None and not getattr(self, "ground_fac_found", False):
            self.X.notes.append("ground: the outskirts' bare-ground weight was not found; the overlay's cover ignores it")
        snow_lin = self.ground_snow_lin(snowcol_mat) if snowcol_mat is not None else None
        scans = self.scan_materials(snow_lin) if snow_mat is not None else {}
        pool_tiles = []
        scan_shared = {cls: gltf_material(bpy.data.materials.new(f"{self.A.key}_ground_{cls}"), base=s["base"], rough=s["rough"],
                                          normal=(s["normal"], 1.0, None), cull=True) for cls, s in scans.items()}
        # the trodden class of every face: the largest mean weight of its corners among the five scan classes (wdi_a:
        # cobble, path, earth; wdi_b: rock, rail); the forest's dark litter has no scan of its own and stays in the
        # overlay's colour. v1.2 (the close views: a path through the forest's litter left its edge faces, where the
        # forest outweighs the path, as chunks showing the blurred bake beside the trodden faces' crisp scan, a
        # staircase along the path): a face is trodden by its scan classes alone, whatever its forest weight
        wa = attrs["wdi_a"][1] if "wdi_a" in attrs else np.zeros((len(co), 4), np.float32)
        wb = attrs["wdi_b"][1] if "wdi_b" in attrs else np.zeros((len(co), 4), np.float32)
        vw = np.stack([wa[:, 0], wa[:, 1], wa[:, 2], wb[:, 0], wb[:, 2]], axis=1)
        fw = np.add.reduceat(vw[lv], ls, axis=0) / lt[:, None]
        fcls, fmax = np.argmax(fw, axis=1), fw.max(axis=1)
        cls_of = ("cobble", "path", "earth", "rock", "rail")
        snow_m = vb.ph_metres("snow")
        self.chunks = []
        rep = []
        only_tiles = {t.strip() for t in (getattr(self.X.args, "only_tiles", "") or "").split(",") if t.strip()}
        bake_all = bake
        for name, tier, d, faces in tiles:
            bake = bake_all and (not only_tiles or name in only_tiles)  # --only-tiles (a smoke test): the rest flat
            t_tile = time.time()
            loops = face_loops(ls, lt, faces)
            sizes = lt[faces]
            used, inv = np.unique(lv[loops], return_inverse=True)
            inv = inv.ravel()
            tco = co[used]
            x0, y0 = float(tco[:, 0].min()), float(tco[:, 1].min())
            x1, y1 = float(tco[:, 0].max()), float(tco[:, 1].max())
            if d is None:  # tier C: one map over the rest
                d = max(x1 - x0, y1 - y0) / float(TIER_C_PX)
            x0, y0 = math.floor(x0 / d) * d, math.floor(y0 / d) * d
            pw = min(1024, max(16, int(math.ceil((x1 - x0) / d / 8.0) * 8)))
            ph = min(1024, max(16, int(math.ceil((y1 - y0) / d / 8.0) * 8)))
            W = max(pw * d, x1 - x0)  # wider than 1024 texels at d: the tile's texels grow a little
            H = max(ph * d, y1 - y0)
            bu = ((tco[:, 0] - x0) / W, (tco[:, 1] - y0) / H)
            info = dict(tile=name, tier=tier, faces=int(len(faces)), rect=[round(x0, 2), round(y0, 2), round(x0 + W, 2), round(y0 + H, 2)],
                        px=[pw, ph], texel_cm=[round(W / pw * 100, 2), round(H / ph * 100, 2)])
            mat = bpy.data.materials.new(f"{self.A.key}_ground_{name}")
            tro = np.zeros(0, np.int64)  # this tile's trodden faces (fix 5)
            tro_cls = None
            if bake:
                tme = mesh_from_arrays(f"WALK_tile_{name}", tco, inv.astype(np.int32), sizes)
                for an, (kind, arr) in attrs.items():
                    at = tme.attributes.new(an, kind, "POINT")
                    at.data.foreach_set("color" if kind == "FLOAT_COLOR" else "value", arr[used].ravel())
                uvw = tme.uv_layers.new(name="UVMap")
                uvw.data.foreach_set("uv", tco[inv][:, :2].astype(np.float32).ravel())
                uvb = tme.uv_layers.new(name="BakeUV")
                uvb.data.foreach_set("uv", np.stack([bu[0][inv], bu[1][inv]], axis=1).astype(np.float32).ravel())
                tme.uv_layers.active = uvb
                uvw.active_render = True
                tme.materials.append(col_mat)
                o = self.bk.temp(f"WALK_tile_{name}", tme)
                cs, rs = GROUND_SAMPLES[tier]
                cimg = bpy.data.images.new("WALK_gc", pw, ph, alpha=False, float_buffer=True)
                target_node(col_mat, cimg)
                self.bk.bake([o], "EMIT", cs, f"ground {name} colour {pw}x{ph}", uv="BakeUV", margin=8)
                rimg = bpy.data.images.new("WALK_gr", pw, ph, alpha=False, float_buffer=True)
                rimg.colorspace_settings.name = "Non-Color"
                tme.materials[0] = rough_mat
                target_node(rough_mat, rimg)
                self.bk.bake([o], "EMIT", rs, f"ground {name} roughness {pw}x{ph}", uv="BakeUV", margin=8)
                cover = None
                if tier != "C" and snow_mat is not None:
                    # the snow cover, then the trodden faces: bare ground (within a 5-texel neighbourhood) at a corner or
                    # the centre, a trodden class with a scan, and some weight of it
                    simg = bpy.data.images.new("WALK_gs", pw, ph, alpha=False, float_buffer=True)
                    simg.colorspace_settings.name = "Non-Color"
                    tme.materials[0] = snow_mat
                    target_node(snow_mat, simg)
                    self.bk.bake([o], "EMIT", cs, f"ground {name} snow cover {pw}x{ph}", uv="BakeUV", margin=8)
                    cover = np.clip(img_pixels(simg)[..., 0], 0.0, 1.0)
                    bpy.data.images.remove(simg)
                    bare = 1.0 - cover
                    for _ in range(2):
                        b2 = bare.copy()
                        for ax in (0, 1):
                            b2 = np.maximum(b2, np.maximum(np.roll(bare, 1, axis=ax), np.roll(bare, -1, axis=ax)))
                        bare = b2
                    fl = face_loops(ls, lt, faces)
                    ui = np.clip(((co[lv[fl], 0] - x0) / W * pw).astype(int), 0, pw - 1)
                    vi = np.clip(((co[lv[fl], 1] - y0) / H * ph).astype(int), 0, ph - 1)
                    starts = np.concatenate([[0], np.cumsum(sizes)[:-1]])
                    fb = np.maximum.reduceat(bare[vi, ui], starts)
                    ci = np.clip(((cx[faces] - x0) / W * pw).astype(int), 0, pw - 1)
                    cj = np.clip(((cy[faces] - y0) / H * ph).astype(int), 0, ph - 1)
                    fb = np.maximum(fb, bare[cj, ci])
                    tsel = (fb > TRODDEN_BARE) & (fmax[faces] > TRODDEN_MIN)
                    tro, tro_cls = faces[tsel], fcls[faces][tsel]
                self.bk.drop(o)
                bpy.data.meshes.remove(tme)
                base_lin = img_pixels(cimg)[..., :3].copy()
                img_lin = base_lin
                if len(tro) and snowcol_mat is not None:
                    # v1.2: under the trodden faces (and 2 texels round them) the tile's colour is the overlay's snow
                    # colour; the chunks beside them show the bake as before (their bare is at most TRODDEN_BARE there)
                    tuv = lambda fs: np.stack([(co[lv[face_loops(ls, lt, fs)], 0] - x0) / W,  # noqa: E731
                                               (co[lv[face_loops(ls, lt, fs)], 1] - y0) / H], axis=1)
                    sc_lin = self.snow_colour(tro, tuv, pw, ph, cs, name, snowcol_mat)
                    under = sc_lin[..., 0] > -0.5
                    img_lin = np.where(under[..., None], np.maximum(sc_lin, 0.0), base_lin)
                    info["overlay_snow_texels"] = int(under.sum())
                # (the alpha never quite 0: WebP drops the colour under fully transparent texels, which the tile's
                # opaque chunks still show)
                c = make_image(f"{self.A.key}_ground_{name}_base", lin_to_srgb(img_lin), "sRGB",
                               alpha=np.maximum(cover, ALPHA_FLOOR) if len(tro) else None)
                del img_lin
                rr = img_pixels(rimg)[..., 0]
                rq = ROUGH_DIV.get(tier, 2)
                rr = downscale(rr[..., None], max(8, pw // rq), max(8, ph // rq))[..., 0]
                rgb = np.zeros(rr.shape + (3,), np.float32)
                rgb[..., 1] = rr
                rimg2 = make_image(f"{self.A.key}_ground_{name}_rough", rgb, "Non-Color")
                bpy.data.images.remove(cimg)
                bpy.data.images.remove(rimg)
                nrm = None
                if tier != "C" and detail is not None:
                    nrm = (detail, 0.6, ((x0 / snow_m) % 1.0, (y0 / snow_m) % 1.0, W / snow_m, H / snow_m))
                pool, pinfo = (None, None)
                if tier != "C" and self.dropped:
                    pool, pinfo = self.pool_map(name, x0, y0, W, H, base_lin)
                    if pool is not None:
                        info["pool"] = pinfo
                        pool_tiles.append(name)
                emis = (pool, pinfo["strength"], pinfo["tint"]) if pool is not None else None
                gltf_material(mat, base=c, rough=rimg2, normal=nrm, cull=True, base_extend=True, emission=emis)
                info["rough_px"] = list(rr.shape[::-1])
                info["mean_srgb"] = [round(float(v), 3) for v in lin_to_srgb(base_lin).reshape(-1, 3).mean(axis=0)]
                del base_lin
            else:
                s = self.look["snow"]["tint"]
                gltf_material(mat, base=(s[0] * 0.85, s[1] * 0.85, s[2] * 0.85), rough=0.55, cull=True)
            if len(tro):
                # the trodden faces leave the chunks: their scans on world UVs (the tile's UVs beside them, for the
                # pools), and over them the snow overlay
                tile_uv = lambda fs: np.stack([(co[lv[face_loops(ls, lt, fs)], 0] - x0) / W,  # noqa: E731
                                               (co[lv[face_loops(ls, lt, fs)], 1] - y0) / H], axis=1)
                present = sorted(set(int(k) for k in tro_cls))
                mats, slot = [], {}
                for k in present:
                    cls = cls_of[k]
                    if emis is None:
                        mats.append(scan_shared[cls])
                    else:
                        s_ = scans[cls]
                        mats.append(gltf_material(bpy.data.materials.new(f"{self.A.key}_ground_{name}_{cls}"), base=s_["base"],
                                                  rough=s_["rough"], normal=(s_["normal"], 1.0, None), cull=True,
                                                  emission=emis, emission_uv="TileUV"))
                    slot[k] = len(mats) - 1
                metres = np.array([scans[cls_of[int(k)]]["metres"] for k in tro_cls])
                wuv = world_uv(co, lv, ls, lt, tro, metres)
                # the overlay OVERLAY_LIFT over the scans, a skirt down to the chunks round its outline (v1.1 pass 3:
                # without it each edge of the outline facing the eye showed the scans' dark under it; sinking the
                # scans instead opened the same gap to the sky wherever a path left the trodden faces); its normal
                # the chunks' own (pass 2's baked bump at 16-32 cm a texel read as smooth snow beside their grain, a
                # staircase along every path)
                ob = self.ground_piece(f"HM_GroundPath_{name}", tro, {"UVMap": wuv, "TileUV": tile_uv(tro)}, mats,
                                       mat_index=[slot[int(k)] for k in tro_cls])
                ob["wdi_ground"] = "trodden: the scans of the paths, roads and cobbles on world UVs"
                omat = gltf_material(bpy.data.materials.new(f"{self.A.key}_ground_{name}_snow"), base=c, rough=rimg2,
                                     normal=nrm, cull=True, base_extend=True, emission=emis, alpha_blend=True)
                ov = self.ground_piece(f"HM_GroundSnow_{name}", tro, {"UVMap": tile_uv(tro)}, [omat], lift=OVERLAY_LIFT,
                                       skirt=True)
                ov["wdi_ground"] = ("snow overlay: alpha-BLENDED at the snow cover, the snow's own colour, 1.5 cm over "
                                    "HM_GroundPath, skirted to the chunks")
                ov["wdi_cast_shadow"] = False
                info["trodden"] = dict(faces=int(len(tro)), tris=mesh_tris(ob.data), overlay_tris=mesh_tris(ov.data),
                                       by_class={cls_of[k]: int((tro_cls == k).sum()) for k in present})
                faces = np.setdiff1d(faces, tro)
            # chunks of at most CHUNK_M a side (tier C: CHUNK_C_M), each its own object (frustum culling), the tile's
            # material shared
            cm = CHUNK_C_M if tier == "C" else CHUNK_M
            ncx = max(1, math.ceil(W / cm - 0.02))
            ncy = max(1, math.ceil(H / cm - 0.02))
            kx = np.clip(((cx[faces] - x0) / (W / ncx)).astype(int), 0, ncx - 1)
            ky = np.clip(((cy[faces] - y0) / (H / ncy)).astype(int), 0, ncy - 1)
            n_chunks = 0
            for a in range(ncx):
                for b in range(ncy):
                    sub = faces[(kx == a) & (ky == b)]
                    if not len(sub):
                        continue
                    sl = face_loops(ls, lt, sub)
                    tuv = np.stack([(co[lv[sl], 0] - x0) / W, (co[lv[sl], 1] - y0) / H], axis=1)
                    self.ground_piece(f"HM_Ground_{name}_{a}{b}", sub, {"UVMap": tuv}, [mat])
                    n_chunks += 1
            info["chunks"] = n_chunks
            info["seconds"] = round(time.time() - t_tile, 1)
            rep.append(info)
            log(f"ground tile {name}: {info}")
        # fix 8: the steep tier A and B faces on their own UV islands, baked from the ground material like the tiles
        sf = np.nonzero(steep)[0]
        steep_rep = {}
        if len(sf):
            steep_rep = self.steep_islands(sf, attrs, col_mat, rough_mat)
            if steep_rep.get("pool"):
                pool_tiles.append("steep")  # v1.2d: the steep ground's own pool map (the report counts every pool map in the GLB)
        for m in (col_mat, rough_mat, snow_mat, snowcol_mat):
            if m is not None:
                bpy.data.materials.remove(m)
        self.info["terrain"] = dict(tiles=rep, chunks=len(self.chunks), tris=int(sum(mesh_tris(o.data) for o in self.chunks)),
                                    steep=steep_rep, trodden_classes={k: v["role"] for k, v in scans.items()},
                                    scan_mean_srgb={k: v["mean_srgb"] for k, v in scans.items()},
                                    scan_speckle_mean={k: v["speckle_mean"] for k, v in scans.items()
                                                       if v.get("speckle_mean") is not None},
                                    snow_lin=snow_lin, speckle_out_of_cover=getattr(self, "speckle_cut", []),
                                    overlay="alpha BLEND at cover = 1 - max(bare of the five scan classes) x (1 - the "
                                            "outskirts' bare-ground weight" + (")" if getattr(self, "ground_fac_found", False)
                                                                              else ", not found)")
                                            + "; colour: the ground material with the scan classes weighed 0 "
                                            f"({getattr(self, 'snowcol_cut', 0)} mixes cut)",
                                    overlay_skirt_edges=getattr(self, "skirt_edges", 0),
                                    pool_tiles=pool_tiles, pool_maps=len(pool_tiles))

    # ------------------------------------------------------------ water, ice, walls, decks, rails

    def other_materials(self):
        q = self.look
        done = []

        def flat(name, base, rough, metal=0.0, cull=True):
            m = bpy.data.materials.get(name)
            if m is not None:
                gltf_material(m, base=base, rough=rough, metal=metal, cull=cull)
                done.append(name)
            return m

        # fix 10: the water (the mere, the pond, the beck and the tailrace share HM_Mere) gets a tiling ripple normal on
        # world UVs, so the moon's glint breaks into streaks as the original's bump does
        wm = bpy.data.materials.get("HM_Mere")
        if wm is not None:
            rip = make_image("water_ripple_normal", ripple_normal(RIPPLE_PX), "Non-Color")
            gltf_material(wm, base=(0.006, 0.010, 0.014), rough=float(q["water"]["roughness"]), normal=(rip, RIPPLE_SCALE, None),
                          cull=True)
            done.append("HM_Mere")
            for o in self.exported:
                if o.name.startswith(("HM_Mere", "HM_Pond", "HM_Beck", "HM_Tailrace")) and "Logs" not in o.name \
                        and any(m == wm for m in o.data.materials):
                    world_metre_uv(o, RIPPLE_M)
        flat("HM_Ice", (0.30, 0.34, 0.42), 0.5)
        flat("HM_Rail", (0.05, 0.045, 0.045), 0.32, metal=0.9)
        for o in self.exported:
            if o.name in self.cat:
                continue
            nm = o.name
            if nm.startswith(("HM_Mere", "HM_Pond", "HM_Beck", "HM_Tailrace")) and "Logs" not in nm:
                self.cat[nm] = "water_ice"
            elif nm.startswith(("HM_Dock", "HM_Rails", "HM_Sleepers", "HM_PondLogs")):
                self.cat[nm] = "misc"
            elif nm.startswith("HM_Wall"):
                self.cat[nm] = "walls_fences_gates"
            elif nm.startswith("HM_Ground"):
                pass
            else:
                self.cat[nm] = "misc"
        # tiled wood (the map's plank role) on the dock and the sleepers: graded diffuse, normal, constant roughness
        role_w = vb.GROUND["w"]
        for mname in ("HM_Planks", "HM_Sleeper"):
            m = bpy.data.materials.get(mname)
            if m is None:
                continue
            metres = vb.ph_metres(role_w)
            base = bpy.data.images.get("wood_floor_walk")
            nimg = bpy.data.images.get("wood_floor_walk_normal")
            if base is None:
                diff = img_pixels(bpy.data.images.load(vb.mr.texture_path(role_w, "diff", res="1k"), check_existing=True))
                lin = srgb_to_lin(diff[..., :3]) * 1.05
                lin = lin * 0.8 + luminance(lin)[..., None] * 0.2
                base = make_image("wood_floor_walk", lin_to_srgb(downscale(lin, TILED_PX, TILED_PX)), "sRGB")
                nor = img_pixels(bpy.data.images.load(vb.mr.texture_path(role_w, "nor_gl", res="1k"), check_existing=True))
                nimg = make_image("wood_floor_walk_normal", downscale(nor, TILED_PX, TILED_PX), "Non-Color")
            rough = float(img_pixels(bpy.data.images.load(vb.mr.texture_path(role_w, "rough", res="1k"), check_existing=True))[..., 0].mean())
            gltf_material(m, base=base, rough=rough, normal=(nimg, 1.0, None), cull=False)
            done.append(mname)
            for o in self.exported:
                if o.data.materials and o.data.materials[0] == m:
                    rebase_uv(o.data, metres)
        # stone walls: tiled rubble stone, snow on the up faces (a second material), the wet band dropped
        sw = bpy.data.materials.get("HM_StoneWall")
        if sw is not None:
            metres = vb.ph_metres("stone_wall")
            diff = img_pixels(bpy.data.images.load(vb.mr.texture_path("stone_wall", "diff", res="1k"), check_existing=True))
            lin = srgb_to_lin(diff[..., :3])
            lin = (lin * 0.8 + luminance(lin)[..., None] * 0.2) * 0.85
            base = make_image("stone_wall_walk", lin_to_srgb(downscale(lin, TILED_PX, TILED_PX)), "sRGB")
            nor = img_pixels(bpy.data.images.load(vb.mr.texture_path("stone_wall", "nor_gl", res="1k"), check_existing=True))
            nimg = make_image("stone_wall_walk_normal", downscale(nor, TILED_PX, TILED_PX), "Non-Color")
            rough = float(img_pixels(bpy.data.images.load(vb.mr.texture_path("stone_wall", "rough", res="1k"), check_existing=True))[..., 0].mean()) * 0.5 + 0.40
            gltf_material(sw, base=base, rough=rough, normal=(nimg, 1.0, None), cull=False)
            snow = gltf_material(bpy.data.materials.new("HM_StoneWall_snow"), base=(0.84, 0.88, 0.95), rough=0.55)
            for o in self.exported:
                if o.data.materials and o.data.materials[0] == sw:
                    rebase_uv(o.data, metres)
                    split_up_faces(o.data, snow, 0.6)
            done += ["HM_StoneWall"]
        # the pond's logs: bark, snow on the tops
        pl = bpy.data.materials.get("HM_PondLog")
        if pl is not None:
            gltf_material(pl, base=(0.085, 0.06, 0.04), rough=0.85)
            snow = gltf_material(bpy.data.materials.new("HM_PondLog_snow"), base=(0.55, 0.60, 0.72), rough=0.85)
            for o in self.exported:
                if o.data.materials and o.data.materials[0] == pl:
                    split_up_faces(o.data, snow, 0.7)
            done.append("HM_PondLog")
        # untextured meshes carry no UVs (the water keeps its ripples' world UVs)
        for o in self.exported:
            if o.name.startswith(("HM_PondIce", "HM_PondLogs", "HM_Rails", "B_")) and o.data.uv_layers:
                for uvl in list(o.data.uv_layers):
                    o.data.uv_layers.remove(uvl)
        self.info["flat_and_tiled"] = done

    # ------------------------------------------------------------ collision

    def collision(self) -> Shapes:
        S = Shapes()
        A = self.A
        wx0, wy0, wx1, wy1 = A.walk
        # 1. the ground, resampled: 1 m over the walk region (snapped out to the 4 m lattice), 4 m elsewhere
        gx0, gy0 = self.g_co[:, 0].min(), self.g_co[:, 1].min()
        gx1, gy1 = self.g_co[:, 0].max(), self.g_co[:, 1].max()
        xs = list(np.arange(gx0, gx1 + 1e-6, 4.0))
        ys = list(np.arange(gy0, gy1 + 1e-6, 4.0))
        if gx1 - xs[-1] > 0.01:
            xs.append(gx1)
        if gy1 - ys[-1] > 0.01:
            ys.append(gy1)
        fx0 = gx0 + 4.0 * math.floor((wx0 - gx0) / 4.0)
        fx1 = gx0 + 4.0 * math.ceil((wx1 - gx0) / 4.0)
        fy0 = gy0 + 4.0 * math.floor((wy0 - gy0) / 4.0)
        fy1 = gy0 + 4.0 * math.ceil((wy1 - gy0) / 4.0)
        pts, faces = vb.fine_grid([float(v) for v in xs], [float(v) for v in ys], [(fx0, fx1, fy0, fy1, 1.0)])
        z = np.array([self.gz(x, y) for x, y in pts])
        gverts = np.column_stack([np.array(pts), z])
        self.coll_grid = dict(x0=fx0, y0=fy0, nx=int(round(fx1 - fx0)) + 1, ny=int(round(fy1 - fy0)) + 1)
        zg = np.full((self.coll_grid["ny"], self.coll_grid["nx"]), np.nan)
        for (x, y), zz in zip(pts, z):
            i, j = (x - fx0), (y - fy0)
            if -1e-6 < i < self.coll_grid["nx"] - 1 + 1e-6 and -1e-6 < j < self.coll_grid["ny"] - 1 + 1e-6 and abs(i - round(i)) < 1e-6 and abs(j - round(j)) < 1e-6:
                zg[int(round(j)), int(round(i))] = zz
        self.zg = zg
        ground_tris = sum(len(f) - 2 for f in faces)
        # 2. deck floors (union over the deck models and the plank dock), with skirts and railings over water
        deck = self.deck_floors()
        self.deck_cells = deck
        # 3-7. shells
        other = Shapes()
        self.shells(other, deck)
        # 8. water: the mere's shore barrier and the pond's wall; the deck skirts
        self.water_barriers(other, deck)
        self.deck_shapes(other, deck)
        # 9. the walk region's bounds
        zb0, zb1 = -30.0, 90.0
        corners = [(wx0, wy0), (wx1, wy0), (wx1, wy1), (wx0, wy1)]
        for k in range(4):
            other.wall("bounds", corners[k], corners[(k + 1) % 4], zb0, zb1)
        # the ground's share of the budget: collapse it (flat ground first) if the total would pass COLL_TARGET
        budget = COLL_TARGET - other.total() - 2000
        if ground_tris > budget > 0:
            gverts, faces = decimate_arrays(self.bk, gverts, faces, budget / ground_tris)
            log(f"collision ground decimated {ground_tris} -> {sum(len(f) - 2 for f in faces)}")
        S.add("ground", gverts, faces)
        S.merge(other)
        self.info["collision_tris"] = dict(S.tris)
        log(f"collision {A.key}: {S.total()} tris {dict(S.tris)}")
        return S

    def deck_floors(self) -> dict:
        """Floor height per DECK_CELL cell of every deck (see DECK_CELL). The Meshy deck models: the HIGHEST up-facing
        surface above the ground met by DECK_SUB x DECK_SUB rays down from base + 2.5 m (roofs and canopies start
        above the rays), levelled where it is flat; self.deck_blocked: the cells a wall or a post of the model crosses
        (deck_shapes raises them DECK_BLOCK_H). The plank dock: the lowest up-facing surface, as before."""
        objs = [o for o in self.meshy_objs if o["wdi_model"] in DECK_MODELS]
        dock = bpy.data.objects.get("HM_Dock")
        if dock is not None:
            objs.append(dock)
        c = DECK_CELL
        cells: dict[tuple[int, int], float] = {}
        self.deck_blocked: set = set()
        self.deck_models: dict[str, dict] = {}
        per = {}
        for o in objs:
            co = world_co(o)
            lv, ls, lt = mesh_faces(o.data)
            bvh = bvh_of(co, lv, ls, lt)
            x0, y0 = co[:, 0].min(), co[:, 1].min()
            x1, y1 = co[:, 0].max(), co[:, 1].max()
            if not o.get("wdi_model"):
                # the built plank dock: its lowest up-facing face from 0.62 m, on 0.5 m samples (as v1.1), each
                # written to the 2 x 2 cells it covers
                n, big = 0, 0.5
                k = int(round(big / c))
                for i in range(int(math.floor(x0 / big)), int(math.ceil(x1 / big))):
                    for j in range(int(math.floor(y0 / big)), int(math.ceil(y1 / big))):
                        x, y = (i + 0.5) * big, (j + 0.5) * big
                        g = self.gz(x, y)
                        origin, zf, gone = Vector((x, y, 0.62)), None, 0.0
                        for _ in range(24):
                            hit = bvh.ray_cast(origin, DOWN, 8.0 - gone)
                            if hit[0] is None or hit[0].z < g + 0.05:
                                break
                            if hit[1].z >= 0.5:
                                zf = hit[0].z
                            gone += hit[3] + 1e-3
                            origin = hit[0] + Vector((0.0, 0.0, -1e-3))
                        if zf is None:
                            continue
                        for a in range(k):
                            for b in range(k):
                                key = (i * k + a, j * k + b)
                                if key not in cells or zf > cells[key]:
                                    cells[key] = zf
                        n += k * k
                per[o.name] = n
                continue
            top = o.location.z + 2.5
            i0, i1 = int(math.floor(x0 / c)), int(math.ceil(x1 / c))
            j0, j1 = int(math.floor(y0 / c)), int(math.ceil(y1 / c))
            H = np.full((j1 - j0, i1 - i0), np.nan)
            for i in range(i0, i1):
                for j in range(j0, j1):
                    best = None
                    for a in range(DECK_SUB):
                        for b in range(DECK_SUB):
                            x, y = (i + (a + 0.5) / DECK_SUB) * c, (j + (b + 0.5) / DECK_SUB) * c
                            g = self.gz(x, y)
                            origin, gone = Vector((x, y, top)), 0.0
                            for _ in range(24):  # the first up-facing surface from above (walls and undersides passed)
                                hit = bvh.ray_cast(origin, DOWN, 8.0 - gone)
                                if hit[0] is None or hit[0].z < g + 0.05:
                                    break
                                if hit[1].z >= 0.5:
                                    if best is None or hit[0].z > best:
                                        best = hit[0].z
                                    break
                                gone += hit[3] + 1e-3
                                origin = hit[0] + Vector((0.0, 0.0, -1e-3))
                    if best is not None:
                        H[j - j0, i - i0] = best
            # level the flat parts (the boards' snow, a plank's edge): each floor to the median of its 3 x 3 neighbours
            # within DECK_FLAT_M of it, then to DECK_STEP_M
            Hp = np.pad(H, 1, constant_values=np.nan)
            stack = np.stack([Hp[1 + dj:1 + dj + H.shape[0], 1 + di:1 + di + H.shape[1]] for dj in (-1, 0, 1) for di in (-1, 0, 1)])
            with np.errstate(invalid="ignore"), warnings.catch_warnings():
                warnings.simplefilter("ignore", RuntimeWarning)
                near = np.where(np.abs(stack - H[None]) <= DECK_FLAT_M, stack, np.nan)
                Hl = np.nanmedian(near, axis=0)
            Hl = np.where(np.isnan(H), np.nan, np.round(Hl / DECK_STEP_M) * DECK_STEP_M)
            # a rise the eye reads as a step (a tread, the stair's head) must be one for the capsule too: where a
            # cell stands DECK_RISE[0]-DECK_RISE[1] over a 4-neighbour (or over the ground beside it), it is lowered to
            # DECK_RISE[0] over it (the rounding above, or a 36 cm tread, would stop the 35 cm step)
            relaxed = 0
            for _ in range(4):
                changed = False
                for j in range(H.shape[0]):
                    for i in range(H.shape[1]):
                        z = Hl[j, i]
                        if np.isnan(z):
                            continue
                        for dj, di in ((0, 1), (0, -1), (1, 0), (-1, 0)):
                            jj, ii = j + dj, i + di
                            nb = Hl[jj, ii] if (0 <= jj < H.shape[0] and 0 <= ii < H.shape[1]) else np.nan
                            if np.isnan(nb):
                                nb = self.gz((ii + i0 + 0.5) * c, (jj + j0 + 0.5) * c)
                            r = z - nb
                            if DECK_RISE[0] < r <= DECK_RISE[1]:
                                z = nb + DECK_RISE[0]
                                changed = True
                                relaxed += 1
                        Hl[j, i] = z
                if not changed:
                    break
            # the blocks: wall-like surface through the band over the highest floor round each cell
            tri = fan_tris(lv, ls, lt)
            P = co[tri]
            nrm = np.cross(P[:, 1] - P[:, 0], P[:, 2] - P[:, 0])
            area = 0.5 * np.linalg.norm(nrm, axis=1)
            nz = np.abs(nrm[:, 2]) / np.maximum(2.0 * area, 1e-12)
            wsel = (nz < DECK_WALL_NZ) & (area > 1e-8)
            blocked = np.zeros(H.shape, bool)
            if wsel.any():
                Pw, aw = P[wsel], area[wsel]
                k = np.clip(np.ceil(aw / 0.002).astype(int), 1, 256)   # one sample per 20 cm2
                rep = np.repeat(np.arange(len(Pw)), k)
                rng = np.random.default_rng(11)
                u, v = rng.random(len(rep)), rng.random(len(rep))
                flip = u + v > 1.0
                u, v = np.where(flip, 1.0 - u, u), np.where(flip, 1.0 - v, v)
                S = Pw[rep, 0] + u[:, None] * (Pw[rep, 1] - Pw[rep, 0]) + v[:, None] * (Pw[rep, 2] - Pw[rep, 0])
                wgt = (aw / k)[rep]
                si = np.floor(S[:, 0] / c).astype(int) - i0
                sj = np.floor(S[:, 1] / c).astype(int) - j0
                ok = (si >= 0) & (si < H.shape[1]) & (sj >= 0) & (sj < H.shape[0])
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore", RuntimeWarning)
                    Hmax = np.nanmax(np.stack([np.pad(Hl, 1, constant_values=np.nan)[1 + dj:1 + dj + H.shape[0], 1 + di:1 + di + H.shape[1]]
                                               for dj in (-1, 0, 1) for di in (-1, 0, 1)]), axis=0)
                f = np.full(len(S), np.nan)
                f[ok] = Hmax[sj[ok], si[ok]]
                band = ok & ~np.isnan(f) & (S[:, 2] >= f + DECK_WALL_BAND[0]) & (S[:, 2] <= f + DECK_WALL_BAND[1])
                acc = np.zeros(H.shape)
                np.add.at(acc, (sj[band], si[band]), wgt[band])
                blocked = (acc >= DECK_WALL_AREA) & ~np.isnan(Hl)
            n = 0
            for j in range(H.shape[0]):
                for i in range(H.shape[1]):
                    z = Hl[j, i]
                    if np.isnan(z):
                        continue
                    key = (i + i0, j + j0)
                    if key not in cells or z > cells[key]:
                        cells[key] = float(z)
                    if blocked[j, i]:
                        self.deck_blocked.add(key)
                    n += 1
            per[o.name] = n
            vals = Hl[~np.isnan(Hl) & ~blocked]
            levels, counts = np.unique(np.round(vals, 2), return_counts=True) if len(vals) else (np.array([]), np.array([]))
            order = np.argsort(-counts)
            self.deck_models[o.name] = dict(model=o["wdi_model"], cells=n, blocked=int(blocked.sum()), eased_steps=relaxed,
                                            levels=[[round(float(levels[k]), 2), int(counts[k])] for k in order[:6]],
                                            origin=[i0, j0], shape=list(H.shape))
        self.info["deck_cells"] = per
        self.info["deck_models"] = self.deck_models
        log(f"decks: {len(cells)} floor cells of {c} m {per}; {len(self.deck_blocked)} blocked; {self.deck_models}")
        return cells

    def is_water(self, x: float, y: float, margin: float = 0.0) -> bool:
        if y < vb.wy(36.6) + 1.0 and self.gz(x, y) < MERE_LEVEL + margin:
            return True
        return point_in_poly(x, y, osk.POND)

    def deck_shapes(self, S: Shapes, cells: dict) -> None:
        if not cells:
            return
        c = DECK_CELL
        # the blocked cells (a wall or a post of a deck model crosses them) stand DECK_BLOCK_H over their floor
        blocked = getattr(self, "deck_blocked", set())
        if blocked:
            cells = {k: (z + DECK_BLOCK_H if k in blocked else z) for k, z in cells.items()}
        # floors: runs of equal height along x, merged over equal runs in the next row
        rows = defaultdict(list)
        for (i, j), z in cells.items():
            rows[j].append((i, z))
        rects = []
        for j in sorted(rows):
            row = sorted(rows[j])
            k = 0
            while k < len(row):
                i0, z0 = row[k]
                i1 = i0
                while k + 1 < len(row) and row[k + 1][0] == i1 + 1 and abs(row[k + 1][1] - z0) < 0.02:
                    k += 1
                    i1 = row[k][0]
                rects.append([i0, i1, j, j, z0])
                k += 1
        merged = []
        open_ = {}
        for r in sorted(rects, key=lambda r: (r[2], r[0])):
            key = (r[0], r[1], round(r[4], 2))
            prev = open_.get(key)
            if prev is not None and prev[3] == r[2] - 1:
                prev[3] = r[2]
            else:
                open_[key] = r
                merged.append(r)
        for i0, i1, j0, j1, z in merged:
            S.quad("decks", (i0 * c, j0 * c, z), ((i1 + 1) * c, j0 * c, z), ((i1 + 1) * c, (j1 + 1) * c, z), (i0 * c, (j1 + 1) * c, z))
        # skirts down to the ground, railings 1.2 m high where the outside is water
        rails = 0
        for (i, j), z in cells.items():
            for di, dj, p0, p1 in ((1, 0, (i + 1, j), (i + 1, j + 1)), (-1, 0, (i, j + 1), (i, j)),
                                   (0, 1, (i + 1, j + 1), (i, j + 1)), (0, -1, (i, j), (i + 1, j))):
                nb = cells.get((i + di, j + dj))
                if nb is not None and nb > z - 0.3:
                    continue
                a, b = (p0[0] * c, p0[1] * c), (p1[0] * c, p1[1] * c)
                ox, oy = (i + 0.5 + di) * c, (j + 0.5 + dj) * c
                g = min(self.gz((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), self.gz(ox, oy))
                bottom = min(g - 0.3, z - 0.3)
                top = z
                # a railing where stepping off would land in the water, or on the shingle at its very edge (the shore
                # barrier stops where the decks begin); v1.2b: or down onto a deck over water more than
                # DECK_DROP_RAIL_M lower (the moored skiff beside its dock: no way back up from it)
                mx, my = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
                if (nb is None or nb < z - DECK_DROP_RAIL_M) and (i, j) not in blocked \
                        and any(self.is_water(mx + di * d, my + dj * d, margin=0.3) for d in (0.25, 0.75, 1.25)):
                    top = z + 1.2
                    rails += 1
                S.wall("decks", a, b, bottom, top)
        self.info["deck_railing_edges"] = rails

    def shells(self, S: Shapes, deck: dict) -> None:
        rep = defaultdict(int)
        self.shell_rings = {}  # object name -> its collision ring (xy, the prism's or the box's footprint)
        bbox: dict[str, tuple] = {}

        def local_box(me):
            if me.name not in bbox:
                c = mesh_co(me)
                bbox[me.name] = (c.min(axis=0), c.max(axis=0))
            return bbox[me.name]

        for o in self.meshy_objs:
            model = o["wdi_model"]
            if model in DECK_MODELS or model in NO_SHELL_MODELS:
                continue
            kind = o.get("wdi_kind", "prop")
            co = world_co(o)
            base = o.location.z
            if kind == "building":
                low = co[co[:, 2] < base + 2.5]
                if len(low) < 3:
                    continue
                h = simplify_hull(hull2d(low[:, :2]), 12)
                g = min(self.gz(x, y) for x, y in h)
                S.prism("buildings", [tuple(p) for p in h], min(base, g) - 0.5, base + 4.0)
                self.shell_rings[o.name] = [tuple(map(float, p)) for p in h]  # v1.2: the portals' doors
                rep["buildings"] += 1
                continue
            # props, kits, vehicles, walls, gates, fences, cliffs, boulders
            x, y = o.location.x, o.location.y
            host = max(self.gz(x, y), deck.get((int(math.floor(x / DECK_CELL)), int(math.floor(y / DECK_CELL))), -1e9))
            if base - host > 0.5:
                rep["skipped_on_host"] += 1
                continue  # it rests on something else (the kegs and the ore cart on the freight dock, the ray gun)
            lo, hi = local_box(o.data)
            if max(hi - lo) * max(o.scale) < 0.3:
                continue
            if kind == "prop":
                # a prop's body at walking height (0.5-1.8 m over its base): a cart's tongue, a lantern's foot plate or
                # a well's kerb stone at the ground are stepped over, and the shell stays inside what is seen
                band = co[(co[:, 2] > base + 0.5) & (co[:, 2] < base + 1.8)]
                if len(band) >= 3:
                    h = simplify_hull(hull2d(band[:, :2]), 10)
                    g = min(self.gz(px, py) for px, py in h)
                    S.prism("boxes", [tuple(p) for p in h], min(base, g) - 0.3, base + max(1.2, min(2.5, float(co[:, 2].max() - base))))
                    self.shell_rings[o.name] = [tuple(map(float, p)) for p in h]
                    rep["prop_prisms"] += 1
                    continue
            # the oriented box of the mesh
            self._obb(S, o, lo, hi, "boxes")
            M = o.matrix_world
            self.shell_rings[o.name] = [tuple((M @ Vector((cx_, cy_, lo[2])))[:2]) for cx_, cy_ in
                                        ((lo[0], lo[1]), (hi[0], lo[1]), (hi[0], hi[1]), (lo[0], hi[1]))]
            rep["boxes"] += 1
        # rocks: the scans' boxes
        for o in self.exported:
            if o.get("wdi_outskirts") == "rock":
                lo, hi = local_box(o.data)
                self._obb(S, o, lo, hi, "rocks")
                rep["rocks"] += 1
        # trees: 8-sided trunks, open-topped, within TRUNK_REACH_M of the walk region
        for o in self.tree_objs:
            if self.walk_dist(o.location.x, o.location.y) > TRUNK_REACH_M:
                continue
            tx, ty, r = self.trunk[o["wdi_model"]]
            M = o.matrix_world
            c = M @ Vector((tx, ty, 0.0))
            rr = r * max(o.scale[0], o.scale[1])
            ring = [(c.x + rr * math.cos(k * math.pi / 4), c.y + rr * math.sin(k * math.pi / 4)) for k in range(8)]
            S.prism("trunks", ring, c.z - 0.2, c.z + 3.5, top=False)
            rep["trunks"] += 1
        # the stone walls as built
        for o in self.exported:
            if o.name.startswith("HM_Wall_"):
                co = world_co(o)
                S.add("walls", co, face_lists(*mesh_faces(o.data)))
                rep["stone_walls"] += 1
        self.info["shells"] = dict(rep)

    @staticmethod
    def _obb(S: Shapes, o, lo, hi, cat: str) -> None:
        M = o.matrix_world
        corners = [M @ Vector((x, y, z)) for z in (lo[2], hi[2]) for y in (lo[1], hi[1]) for x in (lo[0], hi[0])]
        S.box(cat, [tuple(v) for v in corners])

    def water_barriers(self, S: Shapes, deck: dict) -> None:
        """A wall along the MERE_LEVEL contour of the resampled ground on the mere's side (south of its edge), cut
        where a deck covers it (the decks carry their own railings), and the mill pond's wall."""
        zg, G = self.zg, self.coll_grid
        x0, y0 = G["x0"], G["y0"]
        y_edge = vb.wy(36.6) + 1.0
        segs = 0
        ny, nx = zg.shape
        L = MERE_LEVEL
        for j in range(ny - 1):
            yj = y0 + j
            if yj > y_edge:
                break
            row0, row1 = zg[j], zg[j + 1]
            for i in range(nx - 1):
                q = (row0[i], row0[i + 1], row1[i + 1], row1[i])  # bl, br, tr, tl
                if any(np.isnan(q)):
                    continue
                above = [v > L for v in q]
                if all(above) or not any(above):
                    continue
                xi = x0 + i
                cpts = []  # crossings on edges bottom, right, top, left
                for (a, b), (pa, pb) in (((0, 1), ((xi, yj), (xi + 1, yj))), ((1, 2), ((xi + 1, yj), (xi + 1, yj + 1))),
                                         ((3, 2), ((xi, yj + 1), (xi + 1, yj + 1))), ((0, 3), ((xi, yj), (xi, yj + 1)))):
                    if above[a] != above[b]:
                        t = (L - q[a]) / (q[b] - q[a])
                        cpts.append((pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t))
                    else:
                        cpts.append(None)
                pairs = []
                found = [p for p in cpts if p is not None]
                if len(found) == 2:
                    pairs.append((found[0], found[1]))
                elif len(found) == 4:
                    centre_above = sum(q) / 4.0 > L
                    if above[0] == centre_above:  # bl's region joins tr's through the centre
                        pairs += [(cpts[0], cpts[1]), (cpts[2], cpts[3])]
                    else:
                        pairs += [(cpts[3], cpts[0]), (cpts[1], cpts[2])]
                jlo, jhi, ilo, ihi = max(0, j - 2), min(ny, j + 4), max(0, i - 2), min(nx, i + 4)
                top = max(float(np.nanmax(zg[jlo:jhi, ilo:ihi])), L) + 2.0
                for p0, p1 in pairs:
                    # the parts of the segment outside deck cells (a deck's skirts and railings take over under it)
                    n = max(1, int(math.ceil(math.hypot(p1[0] - p0[0], p1[1] - p0[1]) / 0.05)))
                    run = None
                    for k in range(n + 1):
                        t = k / n
                        px, py = p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t
                        under = (int(math.floor(px / DECK_CELL)), int(math.floor(py / DECK_CELL))) in deck
                        if not under and run is None:
                            run = (px, py)
                        if (under or k == n) and run is not None:
                            end = (px, py)
                            if math.hypot(end[0] - run[0], end[1] - run[1]) > 1e-3:
                                S.wall("shore", run, end, L - 1.5, top)
                                segs += 1
                            run = None
        pond = osk.POND
        lvl = float(osk.WATER[0]["level_m"])
        for k in range(len(pond)):
            S.wall("shore", tuple(pond[k]), tuple(pond[(k + 1) % len(pond)]), lvl - 1.6, lvl + 2.0)
        self.info["shore_segments"] = segs

    # ------------------------------------------------------------ spawns

    def spawn_ground(self, bvh, x: float, y: float) -> tuple[float, float]:
        """(render ground z, standing z under a capsule): the collision's first floor within a step (0.6 m) above it."""
        zr = self.gz(x, y)
        hit = bvh.ray_cast(Vector((x, y, zr + 0.6)), DOWN, 10.0)
        zc = hit[0].z if hit[0] is not None else zr
        return zr, zc

    @staticmethod
    def spawn_blocked(bvh, x: float, y: float, z: float) -> int:
        """How many of 8 level rays at 1 m over the floor meet collision within 1 m (the contract check's own test)."""
        n = 0
        for k in range(8):
            a = k * math.pi / 4
            hit = bvh.ray_cast(Vector((x, y, z + 1.0)), Vector((math.cos(a), math.sin(a), 0.0)), 1.0)
            n += hit[0] is not None
        return n

    def spawn_clear(self, bvh, x: float, y: float, z: float) -> str:
        """v1.2b (contract check 2026-11-15: Spawn_overworld_manor_back jammed in the porch corner, 3 of 8 directions
        blocked, the eye 0.29 m from the porch): is a door spawn clear to stand and look? '' when at most 2 of 8 level
        rays at 1 m meet collision within 1 m (the contract check's own clearance rule) and no surface of a model or a
        stone wall lies within SPAWN_VIS_M of the body's axis at three heights; else why not."""
        b = self.spawn_blocked(bvh, x, y, z)
        if b > 2:
            return f"{b} of 8 directions blocked within 1 m"
        vis = getattr(self, "vis_bvh", None)
        if vis is not None:
            for hz in (0.6, 1.0, EYE_H):
                near = vis.find_nearest(Vector((x, y, z + hz)), SPAWN_VIS_M)
                if near[0] is not None:
                    return f"a model's surface {near[3]:.2f} m from the body at {hz:.1f} m"
        return ""

    def visible_bvh(self) -> BVHTree | None:
        """World BVH of the Meshy models' walk meshes and the stone walls within NUDGE_MAX_M + 4 m of a door point
        (what a door spawn must not stand against, wherever its nudge takes it); None without any."""
        vs, ts, n = [], [], 0
        for o in list(self.meshy_objs) + [o for o in self.exported if o.name.startswith("HM_Wall_")]:
            if self.door_dist(o) > NUDGE_MAX_M + 4.0:
                continue
            co = world_co(o)
            ts.append(fan_tris(*mesh_faces(o.data)) + n)
            vs.append(co)
            n += len(co)
        if not vs:
            return None
        return BVHTree.FromPolygons(np.concatenate(vs).tolist(), np.concatenate(ts).tolist())

    def deck_access(self, bvh) -> dict:
        """v1.2b: can the capsule walk up onto each Meshy deck model? For each of its commonest floor levels of a
        square metre or more that lie over a step above the ground under them: a flood (reach) from the standing
        place nearest outside the model to a standing cell of that level near its middle; into the report."""
        out = {}
        c = DECK_CELL
        need_cells = int(round(1.0 / (c * c)))
        for name, d in getattr(self, "deck_models", {}).items():
            i0, j0 = d["origin"]
            ny, nx = d["shape"]
            cx, cy = (i0 + nx / 2.0) * c, (j0 + ny / 2.0) * c
            r_out = 0.5 * math.hypot(nx * c, ny * c) + 0.6
            starts = []
            for ring in (0.0, 1.5, 3.0, 5.0):  # standing places round the model
                for k in range(32):
                    a = k * math.pi / 16
                    x, y = cx + (r_out + ring) * math.cos(a), cy + (r_out + ring) * math.sin(a)
                    st = self.stand(bvh, x, y)
                    if st["ok"]:
                        starts.append((x, y, st["z"]))
                if starts:
                    break
            recs = []
            for lvl, cnt in d.get("levels", []):
                if cnt < need_cells:
                    continue
                goal = None
                for (i, j), z in self.deck_cells.items():  # the standing cell of this level nearest the middle
                    if i0 <= i < i0 + nx and j0 <= j < j0 + ny and abs(z - lvl) <= 0.03 and (i, j) not in self.deck_blocked:
                        x, y = (i + 0.5) * c, (j + 0.5) * c
                        dd = math.hypot(x - cx, y - cy)
                        if (goal is None or dd < goal[0]) and self.stand(bvh, x, y)["ok"]:
                            goal = (dd, x, y, z)
                if goal is None:
                    continue
                over = goal[3] - self.gz(goal[1], goal[2])
                if over <= STEP_H:
                    continue  # the model's foot on the ground: a step up from it
                rec = dict(level=lvl, cells=cnt, over_ground_m=round(over, 2), goal=[round(goal[1], 2), round(goal[2], 2)])
                if not starts:
                    rec.update(ok=False, why="no standing place found round the model")
                else:
                    sx, sy, sz = min(starts, key=lambda q: math.hypot(q[0] - goal[1], q[1] - goal[2]))
                    res = self.reach(bvh, (sx, sy), (goal[1], goal[2], goal[3]), within=0.3)
                    rec.update(ok=bool(res.get("ok")), nearest_m=res.get("nearest_m"), cells_flooded=res.get("cells"),
                               start=[round(sx, 2), round(sy, 2), round(sz, 2)])
                recs.append(rec)
            # the model's deck is its largest raised floor (a hut's inside, the crates' and railings' tops are the rest)
            main = max(recs, key=lambda r: r["cells"]) if recs else None
            out[name] = dict(model=d["model"], raised_levels=recs, deck_level=main["level"] if main else None,
                             ok=bool(main["ok"]) if main else True)
            log(f"deck access {name}: {out[name]}")
            if main and not main["ok"]:
                self.X.notes.append(f"deck {name}: the capsule does not reach its deck at {main['level']} m "
                                    f"({main['cells']} cells, {main['over_ground_m']} m over the ground; closest approach "
                                    f"{main.get('nearest_m')} m): it stands off the shore, or has no stairs or ramp the "
                                    "capsule can take (as built: nothing walks through its boards any more)")
        return out

    def spawns(self, S: Shapes):
        co, faces = S.arrays()
        bvh = BVHTree.FromPolygons(co.tolist(), faces)
        self.coll_bvh = bvh
        self.vis_bvh = self.visible_bvh()
        self.info["deck_access"] = self.deck_access(bvh)
        for s in self.A.spawns:
            x0, y0 = s["xy"]
            zr, zc = self.spawn_ground(bvh, x0, y0)
            blocked = self.spawn_blocked(bvh, x0, y0, max(zr, zc))
            x, y, moved = x0, y0, 0.0
            if blocked > 2:  # hemmed in (a wall, a ravine side, a cart): the clearest spot within 0.45 m, facing kept
                best = (blocked, 0.0, x0, y0, zr, zc)
                for r in (0.15, 0.3, 0.45):
                    for k in range(16):
                        a = k * math.pi / 8
                        xx, yy = x0 + r * math.cos(a), y0 + r * math.sin(a)
                        zr2, zc2 = self.spawn_ground(bvh, xx, yy)
                        b = self.spawn_blocked(bvh, xx, yy, max(zr2, zc2))
                        if (b, r) < best[:2]:
                            best = (b, r, xx, yy, zr2, zc2)
                blocked, moved, x, y, zr, zc = best
                note = f"{s['name']}: moved {moved:.2f} m to ({x:.2f}, {y:.2f}) for clearance ({blocked} of 8 directions blocked within 1 m)"
                self.X.notes.append(note)
                log(note)
            z = max(zr, zc) + 0.05
            e = self.X.empty(s["name"], loc=(x, y, z))
            e.empty_display_type = "SINGLE_ARROW"
            e.rotation_mode = "XYZ"
            e.rotation_euler = (0.0, 0.0, math.radians(s["theta"] - 90.0))  # local +Y (glTF -Z) along the facing
            e["wdi_spawn"] = s["name"][len("Spawn_"):]
            e["wdi_district"] = s["district"]
            e["wdi_facing_deg"] = float(s["theta"])
            e["wdi_facing_note"] = "degrees counter-clockwise from east (Blender +X) in the ground plane; glTF -Z of the node"
            e["wdi_sees"] = s["sees"]
            e["wdi_core"] = bool(s["core"])
            e["wdi_area"] = self.A.key
            self.X.spawns.append(dict(name=s["name"], area=self.A.key, district=s["district"], core=s["core"], facing_deg=s["theta"],
                                      table_xy=[x0, y0], local=[round(x, 3), round(y, 3), round(z, 3)], moved_m=round(moved, 3),
                                      blocked_dirs=blocked, ground_render_z=round(zr, 3), ground_collision_z=round(zc, 3)))
            self.cat[e.name] = "spawn"
        if self.A.key == "village":
            self.scene_nodes(bvh)
        self.vis_bvh = None  # (the door spawns are placed: its triangles go)
        gc.collect()

    # ------------------------------------------------------------ v1.2: the overworld scene's spawns and portals (W3D)

    def stand(self, bvh, x: float, y: float) -> dict:
        """Can the viewer's capsule (CAPSULE_R, BODY_H) stand at (x, y)? Its floor: the first collision surface under
        a ray down from 0.6 m over the deck where a deck is, else over the render ground (never a box's top: a floor
        more than a step over the ground fails); then: not in the water, not inside a collision shell (6 or more of 8
        level rays at 1 m meet a shell from inside), a floor no steeper than 45 degrees, room for the body (a ray up to
        BODY_H) and no collision within CAPSULE_R at three heights (16 directions)."""
        zr = self.gz(x, y)
        cell = (int(math.floor(x / DECK_CELL)), int(math.floor(y / DECK_CELL)))
        dz = getattr(self, "deck_cells", {}).get(cell)
        if cell in getattr(self, "deck_blocked", ()):
            return dict(ok=False, why="a wall or post of a deck model", zr=zr, z=dz if dz is not None else zr)
        top = (dz if dz is not None else zr) + 0.6
        hit = bvh.ray_cast(Vector((x, y, top)), DOWN, 12.0)
        if hit[0] is None:
            return dict(ok=False, why="no floor", zr=zr, z=zr)
        z, n = hit[0].z, hit[1]
        rec = dict(zr=zr, z=z)
        if abs(n.z) < 0.7:
            return dict(rec, ok=False, why="steep floor")
        if dz is None and z > zr + STEP_H + 0.05:
            return dict(rec, ok=False, why=f"on an obstacle {z - zr:.2f} m over the ground")
        if (z < MERE_LEVEL + 0.15 and y < vb.wy(36.6) + 1.0) or (point_in_poly(x, y, osk.POND) and z < float(osk.WATER[0]["level_m"]) + 0.3):
            return dict(rec, ok=False, why="in the water")
        inside = 0
        for k in range(8):
            a = k * math.pi / 4
            d = Vector((math.cos(a), math.sin(a), 0.0))
            h = bvh.ray_cast(Vector((x, y, z + 1.0)), d, 40.0)
            if h[0] is not None and h[1].dot(d) > 0.0:
                inside += 1
        if inside >= 6:
            return dict(rec, ok=False, why="inside a collision shell")
        if bvh.ray_cast(Vector((x, y, z + 0.05)), Vector((0.0, 0.0, 1.0)), BODY_H)[0] is not None:
            return dict(rec, ok=False, why="no headroom")
        for hz in (STEP_H + 0.05, 0.9, 1.5):
            for k in range(16):
                a = k * math.pi / 8
                if bvh.ray_cast(Vector((x, y, z + hz)), Vector((math.cos(a), math.sin(a), 0.0)), CAPSULE_R)[0] is not None:
                    return dict(rec, ok=False, why=f"collision within {CAPSULE_R} m at {hz:.2f} m")
        return dict(rec, ok=True, why="")

    def reach(self, bvh, start, goal, within: float = PORTAL_REACH_M) -> dict:
        """A flood of the capsule's standing cells (REACH_CELL_M, within REACH_WIN_M of the goal) from `start`: steps of
        at most STEP_H between neighbours; does it come within `within` (and 2 m of height) of `goal` (x, y, z)?
        v1.2: `nearest_m` is the capsule's closest approach (once the flood is within within + 0.5 m it explores every
        standing cell that near the goal, not only the first inside `within`), so the report shows the real margin."""
        c = REACH_CELL_M
        gx, gy, gz_ = goal
        near_r = within + 0.5
        cache = {}

        def cell(i, j):
            if (i, j) not in cache:
                cache[(i, j)] = self.stand(bvh, i * c, j * c)
            return cache[(i, j)]
        i0, j0 = int(round(start[0] / c)), int(round(start[1] / c))
        if not cell(i0, j0)["ok"]:
            # the start itself (a spawn 5 cm over its floor) may sit on a cell edge: the nearest standing cell round it
            near = [(i0 + di, j0 + dj) for di in (-1, 0, 1) for dj in (-1, 0, 1) if cell(i0 + di, j0 + dj)["ok"]]
            if not near:
                return dict(ok=False, why="the start cell does not stand", cells=len(cache))
            i0, j0 = near[0]
        seen = {(i0, j0)}
        queue = [(i0, j0)]
        best = 1e9
        k = 0
        while k < len(queue):
            i, j = queue[k]
            k += 1
            z = cache[(i, j)]["z"]
            dist = math.hypot(i * c - gx, j * c - gy)
            if abs(z - gz_) < 2.0:
                best = min(best, dist)
            for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nb = (i + di, j + dj)
                if nb in seen or abs(nb[0] * c - gx) > REACH_WIN_M or abs(nb[1] * c - gy) > REACH_WIN_M:
                    continue
                if best <= near_r and math.hypot(nb[0] * c - gx, nb[1] * c - gy) > near_r:
                    continue  # arrived: only the cells round the goal, for the closest approach
                r = cell(*nb)
                if r["ok"] and abs(r["z"] - z) <= STEP_H:
                    seen.add(nb)
                    queue.append(nb)
        return dict(ok=best <= within, nearest_m=round(best, 2) if best < 1e9 else None, cells=len(seen))

    def scene_json(self):
        """(the overworld scene's JSON, {art: its built 3D instance}, the building footprints with their art)."""
        with open(vb.SCENE_JSON, encoding="utf-8") as fh:
            d = json.load(fh)
        built = {}
        for o in bpy.context.scene.objects:
            if o.type == "MESH" and o.get("wdi_role"):
                built[o["wdi_role"]] = o
        fps = [dict(b["footprint"], art=b["art"]) for b in d.get("buildings", [])]
        fps.append(dict(x=46, y=32, w=6, h=5, art="fisher"))  # the fisher's cottage (meshy_village_build.build_village)
        return d, built, fps

    def portal_host(self, p: dict, built: dict, fps: list):
        """(the 3D instance a portal belongs to, its door face S/E/N/W): a door's building by the footprint its tile
        lies in and the footprint's face the map puts the door on; the well's hatch and the forest gate: the placed
        model nearest the portal's tile (no face)."""
        tx, ty = vb.tc(p["x"], p["y"])
        fp = next((f for f in fps if f["x"] <= p["x"] < f["x"] + f["w"] and f["y"] <= p["y"] < f["y"] + f["h"]), None)
        if p.get("kind") == "door" and fp is not None and fp["art"] in built:
            face = ("S" if p["y"] == fp["y"] + fp["h"] - 1 else "E" if p["x"] == fp["x"] + fp["w"] - 1
                    else "N" if p["y"] == fp["y"] else "W")
            return built[fp["art"]], face
        cand = [o for o in self.meshy_objs if o.name in bpy.context.scene.objects]
        return (min(cand, key=lambda o: math.hypot(o.location.x - tx, o.location.y - ty)) if cand else None), None

    def scene_door_points(self) -> list:
        """v1.2b, for the near rule and the textures (before there is a collision to place them exactly): where the
        overworld scene's door spawns and portals will stand, near enough: every spawn's tile centre, and every
        portal's door (its building's bounding box face at the model's own door, DOOR_ALONG, PORTAL_OUT_M out; the
        well's hatch and the forest gate at their tiles). [(x, y, what)]"""
        try:
            d, built, fps = self.scene_json()
        except (OSError, ValueError) as e:
            self.X.notes.append(f"door points: the overworld scene could not be read ({e})")
            return []
        pts = [(*vb.tc(s["x"], s["y"]), f"spawn {s['id']}") for s in d.get("spawns", [])]
        for p in d.get("portals", []):
            tx, ty = vb.tc(p["x"], p["y"])
            host, face = self.portal_host(p, built, fps)
            x, y = tx, ty
            if host is not None and face is not None:
                bb = [host.matrix_world @ Vector(cc) for cc in host.bound_box]
                xs, ys = [v.x for v in bb], [v.y for v in bb]
                want = DOOR_ALONG.get(p["id"], tx if face in ("S", "N") else ty)
                if face in ("S", "N"):
                    x = min(max(want, min(xs)), max(xs))
                    y = (min(ys) - PORTAL_OUT_M) if face == "S" else (max(ys) + PORTAL_OUT_M)
                else:
                    y = min(max(want, min(ys)), max(ys))
                    x = (max(xs) + PORTAL_OUT_M) if face == "E" else (min(xs) - PORTAL_OUT_M)
            pts.append((x, y, f"portal {p['id']}"))
        log(f"door points: {len(pts)} (the overworld scene's spawns and portals)")
        return pts

    def boost_zones(self, me, users: list) -> list:
        """v1.2c: where a re-baked mesh with one user is seen from a step away (uv_boost's zones, in the mesh's own
        frame): round every portal and spawn of the area within UV_BOOST_R of its user's box."""
        if len(users) != 1 or self.A.key != "village":
            return []
        o = users[0]
        bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
        x0, x1 = min(v.x for v in bb), max(v.x for v in bb)
        y0, y1 = min(v.y for v in bb), max(v.y for v in bb)
        pts = [tuple(p["local"]) for p in (getattr(self.X, "portals", None) or []) if p.get("local")]
        pts += [tuple(s["local"]) for s in self.X.spawns if s.get("area") == self.A.key and s.get("local")]
        Mi = o.matrix_world.inverted()
        sc_ = max(abs(v) for v in o.scale) or 1.0
        zones = []
        for x, y, z in pts:
            if math.hypot(max(x0 - x, 0.0, x - x1), max(y0 - y, 0.0, y - y1)) > UV_BOOST_R:
                continue
            pl = Mi @ Vector((x, y, z))
            zones.append((pl.x, pl.y, pl.z - 1.0 / sc_, pl.z + UV_BOOST_H / sc_, UV_BOOST_R / sc_))
        return zones

    def door_dist(self, o) -> float:
        """2D distance from the nearest door point (scene_door_points) to the object's world bounding box."""
        pts = getattr(self, "door_points", None)
        if not pts:
            return 1e9
        bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
        x0, x1 = min(v.x for v in bb), max(v.x for v in bb)
        y0, y1 = min(v.y for v in bb), max(v.y for v in bb)
        return min(math.hypot(max(x0 - x, 0.0, x - x1), max(y0 - y, 0.0, y - y1)) for x, y, _w in pts)

    def scene_nodes(self, bvh):
        """v1.2, the W3D additions: `Spawn_overworld_<spawnId>` for every spawn of the overworld scene at its tile
        centre (1.5 m a tile in the village frame, meshy_village_build.tc), on its floor, facing its `facing` (away from
        its door), moved along that facing in NUDGE_STEP_M steps while the capsule cannot stand there (inside a shell,
        a wall within its radius, no headroom) or a portal is within PORTAL_SPAWN_M; `Portal_<portalId>` for every
        overworld portal with its {to, toSpawn, kind}: a door on its building's door face (the footprint's face the
        map puts the door on, meshy_village_build.door_side / building(): the 3D facade there), at the model's own door
        along it where that is measured (DOOR_ALONG), else at the map door's place (clamped into the facade, 1 m from
        its corners), PORTAL_OUT_M out from the collision shell on the ground (farther out, up to PORTAL_OUT_MAX_M,
        where the capsule cannot stand there); the well's hatch and the forest gate out from their own shells, toward
        their tiles. Every portal is checked reachable (the capsule's closest approach within PORTAL_REACH_M, reach)
        from its own spawn."""
        d, built, fps = self.scene_json()
        spawn_tiles = {s["id"]: vb.tc(s["x"], s["y"]) for s in d.get("spawns", [])}
        portals_out, spawns_out = [], []
        notes = []
        # ---- portals first (the spawns keep PORTAL_SPAWN_M from them)
        for p in d.get("portals", []):
            pid = p["id"]
            tx, ty = vb.tc(p["x"], p["y"])
            host, face = self.portal_host(p, built, fps)
            rec = dict(name=f"Portal_{pid}", id=pid, to=p.get("to"), toSpawn=p.get("toSpawn"), kind=p.get("kind", "door"),
                       tile=[p["x"], p["y"]], tile_xy=[round(tx, 3), round(ty, 3)], host=host.name if host else None, face=face)
            if host is None:
                notes.append(f"Portal_{pid}: no 3D host found; at its tile")
                px_, py_ = tx, ty
            else:
                # the host's own collision ring (shells(): a building's prism, a prop's prism, a kit's box), else its
                # bounding box: the portal stands PORTAL_OUT_M out from it, on the ground (v1.2 smoke: marching in from
                # outside met the neighbours' shells first, the netloft's for the tavern's alley door, the shore's
                # barrier for the cottage's)
                bb = [host.matrix_world @ Vector(cc) for cc in host.bound_box]
                ring = self.shell_rings.get(host.name) or [(min(v.x for v in bb), min(v.y for v in bb)),
                                                           (max(v.x for v in bb), min(v.y for v in bb)),
                                                           (max(v.x for v in bb), max(v.y for v in bb)),
                                                           (min(v.x for v in bb), max(v.y for v in bb))]
                rec["ring"] = "collision shell" if host.name in self.shell_rings else "bounding box"
                xs, ys = [q[0] for q in ring], [q[1] for q in ring]
                if face is not None:
                    out_d = {"S": (0.0, -1.0), "N": (0.0, 1.0), "E": (1.0, 0.0), "W": (-1.0, 0.0)}[face]
                    # where along the face: the model's own door where it is measured (DOOR_ALONG, kept 0.3 m inside
                    # the shell's ends), else the map's door tile kept 1 m from the corners
                    want = DOOR_ALONG.get(pid, tx if face in ("S", "N") else ty)
                    m_ = 0.3 if pid in DOOR_ALONG else 1.0
                    rec["door_along"] = dict(at=round(want, 3), source="the 3D door (DOOR_ALONG)" if pid in DOOR_ALONG
                                             else "the map's door tile",
                                             map_tile_m=round(want - (tx if face in ("S", "N") else ty), 2))
                    if face in ("S", "N"):
                        lo_, hi_ = min(xs), max(xs)
                        along = min(max(want, lo_ + m_), hi_ - m_) if hi_ - lo_ > 2.0 * m_ else (lo_ + hi_) / 2.0
                        cr = ring_cross(ring, 0, along)
                        sx, sy = along, (min(cr) if face == "S" else max(cr))
                    else:
                        lo_, hi_ = min(ys), max(ys)
                        along = min(max(want, lo_ + m_), hi_ - m_) if hi_ - lo_ > 2.0 * m_ else (lo_ + hi_) / 2.0
                        cr = ring_cross(ring, 1, along)
                        sx, sy = (max(cr) if face == "E" else min(cr)), along
                    rec["along_clamped_m"] = round(abs(want - along), 2)
                else:
                    # out from the host toward the portal's own spawn (its id's tail: the side the player comes from;
                    # the forest gate's tile lies on the forest side of the closed gate)
                    cx_, cy_ = sum(xs) / len(xs), sum(ys) / len(ys)
                    tgt = spawn_tiles.get(pid.split(".", 1)[-1], (tx, ty))
                    v = Vector((tgt[0] - cx_, tgt[1] - cy_, 0.0))
                    if v.length < 1e-3:
                        v = Vector((0.0, -1.0, 0.0))
                    v.normalize()
                    out_d = (v.x, v.y)
                    t = ring_exit(ring, (cx_, cy_), (v.x, v.y))
                    sx, sy = cx_ + v.x * t, cy_ + v.y * t
                    rec["toward"] = [round(tgt[0], 3), round(tgt[1], 3)]
                px_, py_ = sx + out_d[0] * PORTAL_OUT_M, sy + out_d[1] * PORTAL_OUT_M
                rec["shell_face_xy"] = [round(sx, 3), round(sy, 3)]
            st = self.stand(bvh, px_, py_)
            if not st["ok"] and host is not None:
                # v1.2: a door's foot the capsule cannot stand on (a step, a post, a barrel beside the door): out along
                # the door's normal, PORTAL_OUT_STEP_M at a time up to PORTAL_OUT_MAX_M, to the first spot it stands on
                out = PORTAL_OUT_M
                while not st["ok"] and out < PORTAL_OUT_MAX_M - 1e-6:
                    out = round(out + PORTAL_OUT_STEP_M, 3)
                    qx, qy = sx + out_d[0] * out, sy + out_d[1] * out
                    st2 = self.stand(bvh, qx, qy)
                    if st2["ok"]:
                        rec["moved_out"] = dict(from_m=PORTAL_OUT_M, to_m=out, why=st["why"])
                        px_, py_, st = qx, qy, st2
                if "moved_out" in rec:
                    notes.append(f"Portal_{pid}: {rec['moved_out']['from_m']} m out from its door the capsule cannot stand "
                                 f"({rec['moved_out']['why']}); placed {rec['moved_out']['to_m']} m out")
            pz = st["z"]
            rec.update(local=[round(px_, 3), round(py_, 3), round(pz, 3)], stands=st["ok"], stand_why=st["why"])
            e = self.X.empty(f"Portal_{pid}", loc=(px_, py_, pz))
            e.empty_display_type = "CIRCLE"
            e.empty_display_size = 1.0
            e["to"], e["toSpawn"], e["kind"] = p.get("to"), p.get("toSpawn"), p.get("kind", "door")
            e["wdi_portal_id"] = pid
            e["wdi_scene"] = "overworld"
            e["wdi_area"] = self.A.key
            self.cat[e.name] = "portal"
            portals_out.append(rec)
        # ---- spawns
        P = [(r["local"][0], r["local"][1]) for r in portals_out]
        for s in d.get("spawns", []):
            sid = s["id"]
            x0, y0 = vb.tc(s["x"], s["y"])
            letter = s.get("facing", "s")
            theta = SCENE_FACING.get(letter, -90.0)
            fx, fy = math.cos(math.radians(theta)), math.sin(math.radians(theta))
            moved, why0 = 0.0, None
            need = PORTAL_SPAWN_M
            while True:
                x, y = x0 + fx * moved, y0 + fy * moved
                st = self.stand(bvh, x, y)
                dmin = min((math.hypot(x - a, y - b) for a, b in P), default=1e9)
                # v1.2b: and clear to stand and look (spawn_clear: the contract check's 8-ray rule, no model's surface
                # against the body)
                jam = self.spawn_clear(bvh, x, y, st["z"]) if st["ok"] else ""
                ok = st["ok"] and dmin >= need and not jam
                if ok or moved >= NUDGE_MAX_M:
                    break
                if why0 is None:
                    why0 = st["why"] if not st["ok"] else (f"a portal {dmin:.2f} m away" if dmin < need else jam)
                if dmin < need:
                    need = SPAWN_CLEAR_M  # moved off a portal: with the margin
                moved = round(moved + NUDGE_STEP_M, 3)
            z = st["z"] + 0.05
            label, district = DOOR_SPAWNS.get(sid, (sid.replace("_", " "), "The village"))
            name = f"Spawn_overworld_{sid}"
            e = self.X.empty(name, loc=(x, y, z))
            e.empty_display_type = "SINGLE_ARROW"
            e.rotation_mode = "XYZ"
            e.rotation_euler = (0.0, 0.0, math.radians(theta - 90.0))
            e["wdi_spawn"] = label
            e["wdi_district"] = district
            e["wdi_facing"] = letter
            e["wdi_facing_deg"] = float(theta)
            e["wdi_facing_note"] = "degrees counter-clockwise from east (Blender +X) in the ground plane; glTF -Z of the node"
            e["wdi_scene"] = "overworld"
            e["wdi_tile"] = [int(s["x"]), int(s["y"])]
            e["wdi_core"] = False
            e["wdi_area"] = self.A.key
            self.cat[e.name] = "spawn"
            rec = dict(name=name, id=sid, area=self.A.key, district=district, label=label, facing=letter, facing_deg=theta,
                       tile=[s["x"], s["y"]], tile_xy=[round(x0, 3), round(y0, 3)], local=[round(x, 3), round(y, 3), round(z, 3)],
                       nudged_m=round(moved, 2), nudge_why=why0 if moved > 0 else None, stands=st["ok"],
                       stand_why=st["why"], nearest_portal_m=round(dmin, 2) if dmin < 1e9 else None, scene=True)
            if moved > 0:
                n = f"{name}: nudged {moved:.2f} m along its facing ({letter}) from its tile centre ({x0:.2f}, {y0:.2f}): {why0}"
                notes.append(n)
                log(n)
            if not st["ok"] or dmin < PORTAL_SPAWN_M or jam:
                notes.append(f"{name}: NOT clear after {moved:.2f} m: {st['why'] or jam or f'a portal {dmin:.2f} m away'}")
            rec["blocked_dirs"] = self.spawn_blocked(bvh, x, y, st["z"])
            spawns_out.append(rec)
            self.X.spawns.append(dict(name=name, area=self.A.key, district=district, core=False, facing_deg=theta,
                                      table_xy=[round(x0, 3), round(y0, 3)], local=[round(x, 3), round(y, 3), round(z, 3)],
                                      moved_m=round(moved, 3), scene="overworld", label=label))
        # ---- reach: each portal from its own spawn (its id's tail), else the nearest scene spawn
        by_id = {r["id"]: r for r in spawns_out}
        for r in portals_out:
            tail = r["id"].split(".", 1)[-1]
            sp = by_id.get(tail) or min(spawns_out, key=lambda q: math.hypot(q["local"][0] - r["local"][0],
                                                                           q["local"][1] - r["local"][1]))
            res = self.reach(bvh, sp["local"][:2], r["local"])
            r["reach"] = dict(res, from_spawn=sp["name"])
            if not res["ok"]:
                notes.append(f"{r['name']}: NOT reachable from {sp['name']} (nearest {res.get('nearest_m')} m)")
            log(f"portal {r['name']} at {r['local']} host {r['host']} face {r['face']} reach {r['reach']}")
        # every spawn against every portal
        for r in spawns_out:
            r["nearest_portal_m"] = round(min(math.hypot(r["local"][0] - p["local"][0], r["local"][1] - p["local"][1])
                                              for p in portals_out), 2) if portals_out else None
        self.X.notes.extend(notes)
        self.info["scene_spawns"] = spawns_out
        self.info["portals"] = portals_out
        self.X.portals = portals_out
        log(f"scene nodes: {len(spawns_out)} overworld spawns ({sum(1 for r in spawns_out if r['nudged_m'] > 0)} nudged), "
            f"{len(portals_out)} portals ({sum(1 for r in portals_out if r['reach']['ok'])} reachable)")

    # ------------------------------------------------------------ hierarchy: the area root, instancing groups

    def hierarchy(self):
        A, X = self.A, self.X
        root = X.empty(f"Area_{A.key}", loc=(A.offset[0], A.offset[1], 0.0))
        root["wdi_area"] = A.key
        root["wdi_name"] = A.name
        root["wdi_offset"] = [float(A.offset[0]), float(A.offset[1])]
        root["wdi_walk_region"] = [float(v) for v in A.walk]
        root["wdi_look"] = f"tools/blender/meshy_looks/{A.look}"
        lookv = {k: self.look[k] for k in ("sky", "moon", "fog", "color", "post", "snowfall") if k in self.look}
        root["wdi_look_json"] = json.dumps(lookv)
        root["wdi_light_mode"] = "COMPAT"
        root["wdi_exposure"] = 2.0 ** float(self.look["color"]["exposure"])
        # v1.2 (W3D): the area's fog in the viewer's own keys (apps/walk world.ts fogFromExtras): the look's density
        # fading into the sky's horizon, as the viewer's default (look.ts defaultFog)
        root["fog_color"] = [round(float(v), 4) for v in self.look["sky"]["horizon"][:3]]
        root["fog_density"] = float(self.look["fog"]["density"])
        X.roots[A.key] = root
        meshes = [o for o in bpy.data.objects if o.type == "MESH" and self.cat.get(o.name) not in (None, "light", "spawn", "portal")
                  and o.name in bpy.context.scene.objects]
        # fix 3: what the original keeps out of the shadow maps (the self-lit lamp housings, the bulbs, the water, most
        # trees: meshy_village_build.py:804/901/1130, meshy_village_look.py:420) says so to the viewer; glTF has no
        # such flag, so it is the node extra wdi_cast_shadow: false (and on the I_* node that carries the instances)
        no_shadow = 0
        for o in meshes:
            if not o.visible_shadow or o.get("wdi_cast_shadow") is False:
                o["wdi_cast_shadow"] = False
                no_shadow += 1
        by_mesh = defaultdict(list)
        for o in meshes:
            by_mesh[o.data.name].append(o)
        # v1.2 performance: the instancing groups as spatial clusters. Every mesh with several users starts as one group
        # per shadow flag (one flag per instancing node); then, while the area's draw calls stay within DRAW_BUDGET, the
        # group with the most triangles x spread is cut in two along its longest axis at its median (each half at
        # least 2), so three.js culls (and sorts) by cluster: an InstancedMesh is drawn whole when any of it is in view
        draws = 0
        clusters = []
        lone = []  # v1.2c: the meshes drawn on their own (their triangles weigh the views below)
        for mname, users in sorted(by_mesh.items()):
            nprim = max(1, len(users[0].data.materials))
            if len(users) == 1:
                users[0].parent = root
                lone.append(users[0])
                draws += nprim
                continue
            for casts in (True, False):
                mem = [o for o in users if (o.get("wdi_cast_shadow") is not False) == casts]
                if len(mem) == 1:  # a lone instance of its flag: a direct child of the root (the only one of its mesh)
                    mem[0].parent = root
                    lone.append(mem[0])
                    draws += nprim
                elif mem:
                    clusters.append(dict(mesh=mname, casts=casts, members=mem, nprim=nprim, tris=mesh_tris(mem[0].data)))
                    draws += nprim

        def spread(c):
            p = np.array([tuple(o.matrix_world.translation)[:2] for o in c["members"]])
            return float(np.linalg.norm(p - p.mean(axis=0), axis=1).max()) if len(p) > 1 else 0.0

        budget = int(getattr(X.args, "draw_budget", DRAW_BUDGET))
        splits = 0
        # v1.2c (v1.2 cut the group with the most triangles x spread at its median, v1.2b capped the spread: either
        # way the camera at a spawn still drew 1.7 x what stood in its frustum): the cut that takes the most triangles
        # out of the spawns' views. Every spawn of the area looks along its own facing (twice) and the three other
        # ways (RANK_HEADINGS); a group counts whole in a view its bounding sphere meets (view_estimate's own test:
        # an InstancedMesh is culled whole); a view weighs by what it draws already, to the power CLUSTER_HEAVY (the
        # heaviest views, Station Street and the square, come first: unweighted, the mean fell 12 % and theirs rose
        # 7 %); each step takes, of every group's two-way cuts (at a third, a half or two thirds along x, y or its
        # long axis, each side 2 at least), the one that saves the most per draw call. On the v1.2c village: 11 %
        # fewer triangles a view on average than v1.2 and 3 % fewer in the worst, within the same draw budget
        tv_ = math.tan(math.radians(VIEW_VFOV) / 2.0)
        th_ = tv_ * VIEW_ASPECT
        kh_, kv_ = math.sqrt(1.0 + th_ * th_), math.sqrt(1.0 + tv_ * tv_)
        vE, vF, vR, vW = [], [], [], []
        for s in X.spawns:
            if s.get("area") != A.key or not s.get("local"):
                continue
            for turn, wgt in RANK_HEADINGS:
                h = math.radians(float(s["facing_deg"]) + turn)
                vE.append((s["local"][0], s["local"][1], s["local"][2] + EYE_H))
                vF.append((math.cos(h), math.sin(h), 0.0))
                vR.append((math.sin(h), -math.cos(h), 0.0))
                vW.append(wgt)
        vE, vF, vR, vW = np.array(vE), np.array(vF), np.array(vR), np.array(vW, np.float64)
        n_views = len(vW)

        def box_of(o):
            pts = np.array([tuple(o.matrix_world @ Vector(q)) for q in o.bound_box])
            return pts.min(axis=0), pts.max(axis=0), np.array(o.matrix_world.translation)[:2]
        boxes = {o.name: box_of(o) for c in clusters for o in c["members"]}

        def seen(lo, hi) -> np.ndarray:
            """(views,) 0/1: the views that draw a group with this box (its bounding sphere against each frustum)"""
            if not n_views:
                return np.zeros(0)
            cen, rad = (lo + hi) / 2.0, float(np.linalg.norm(hi - lo) / 2.0)
            d = cen[None, :] - vE
            z, x, y = (d * vF).sum(axis=1), (d * vR).sum(axis=1), d[:, 2]
            return ((z >= -rad) & (z <= 500.0 + rad) & (np.abs(x) <= z * th_ + rad * kh_)
                    & (np.abs(y) <= z * tv_ + rad * kv_)).astype(np.float64)

        def seen_of(members) -> np.ndarray:
            return seen(np.min([boxes[o.name][0] for o in members], axis=0), np.max([boxes[o.name][1] for o in members], axis=0))

        lone_tris = np.zeros(n_views)
        for o in lone:
            lo_, hi_, _c = box_of(o)
            lone_tris += seen(lo_, hi_) * mesh_tris(o.data)
        for c in clusters:
            c["seen"] = seen_of(c["members"])

        def cuts_of(c) -> list:
            """the group's two-way cuts: [(side a, side b, a's views, b's views)]"""
            mem = c["members"]
            n = len(mem)
            xy = np.array([boxes[o.name][2] for o in mem])
            q = xy - xy.mean(axis=0)
            keys = [xy[:, 0], xy[:, 1]]
            with contextlib.suppress(np.linalg.LinAlgError):
                keys.append(q @ np.linalg.svd(q, full_matrices=False)[2][0])
            out = []
            for key in keys:
                order = np.argsort(key, kind="stable")
                for frac in (0.5, 1.0 / 3.0, 2.0 / 3.0):
                    k = int(round(n * frac))
                    if k < 2 or n - k < 2:
                        continue
                    a_ = [mem[i] for i in order[:k]]
                    b_ = [mem[i] for i in order[k:]]
                    out.append((a_, b_, seen_of(a_), seen_of(b_)))
            return out

        while n_views:
            drawn = lone_tris.copy()
            for c in clusters:
                drawn += c["seen"] * (c["tris"] * len(c["members"]))
            wv = vW * (drawn / max(float(drawn.mean()), 1.0)) ** CLUSTER_HEAVY
            best = None
            for c in clusters:
                n = len(c["members"])
                if n < 4 or draws + c["nprim"] > budget:
                    continue
                if "cuts" not in c:
                    c["cuts"] = cuts_of(c)
                whole = float((c["seen"] * wv).sum()) * n
                for a_, b_, sa, sb in c["cuts"]:
                    saved = (whole - float((sa * wv).sum()) * len(a_) - float((sb * wv).sum()) * len(b_)) * c["tris"] / c["nprim"]
                    if saved > 0.0 and (best is None or saved > best[0]):
                        best = (saved, c, a_, b_, sa, sb)
            if best is None:
                break
            _saved, c, a_, b_, sa, sb = best
            clusters.remove(c)
            base_c = {k: v for k, v in c.items() if k not in ("cuts", "seen")}
            clusters.append(dict(base_c, members=a_, seen=sa))
            clusters.append(dict(base_c, members=b_, seen=sb))
            draws += c["nprim"]
            splits += 1
        groups = []
        seq = defaultdict(int)
        for c in sorted(clusters, key=lambda c: (c["mesh"], not c["casts"], -len(c["members"]))):
            label = c["mesh"].replace("@", "_").replace(".", "_")
            k = seq[(label, c["casts"])]
            seq[(label, c["casts"])] += 1
            g = X.empty(f"I_{label}_{k}" + ("" if c["casts"] else "_ns"), parent=root)
            members = c["members"]
            for o in members:
                o.parent = g
            m0 = members[0]
            for key in ("wdi_model", "wdi_tier", "wdi_bulb", "wdi_kind"):
                if m0.get(key) is not None:
                    g[key] = m0[key]
            if not c["casts"]:
                g["wdi_cast_shadow"] = False
            g["wdi_instances"] = len(members)
            groups.append(dict(group=g.name, mesh=c["mesh"], count=len(members), tris_each=c["tris"], casts_shadow=c["casts"],
                               spread_m=round(spread(c), 1)))
        self.info["no_shadow_objects"] = no_shadow
        for o in bpy.data.objects:
            if self.cat.get(o.name) in ("light", "spawn", "portal") and o.parent is None:
                o.parent = root
        self.info["instanced_groups_blender"] = len(groups)
        self.info["draw_calls_blender"] = dict(total=draws, budget=budget, cluster_splits=splits, groups=len(groups))
        log(f"hierarchy: {len(groups)} instancing groups under {root.name} ({splits} spatial splits), {draws} draw calls")


def _rebased(u: np.ndarray, v: np.ndarray, sizes: np.ndarray) -> np.ndarray:
    """Per-loop (u, v), each face moved by whole repeats near the origin (identical with REPEAT, small for Draco)."""
    starts = np.concatenate([[0], np.cumsum(sizes)[:-1]]).astype(np.int64)
    u = u - np.repeat(np.floor(np.minimum.reduceat(u, starts)), sizes)
    v = v - np.repeat(np.floor(np.minimum.reduceat(v, starts)), sizes)
    return np.stack([u, v], axis=1)


def world_uv(co, lv, ls, lt, faces, metres) -> np.ndarray:
    """Per-loop UVs of world x, y over each face's repeat (`metres`, one per face), in face_loops order."""
    sl = face_loops(ls, lt, faces)
    m = np.repeat(np.asarray(metres, np.float64), lt[faces])
    return _rebased(co[lv[sl], 0] / m, co[lv[sl], 1] / m, lt[faces])


def ripple_normal(px: int, seed: int = 1893, waves: int = RIPPLE_WAVES, slope: float = 0.30, metres: float = RIPPLE_M,
                  f0: float = 1.6, octaves: int = 4) -> np.ndarray:
    """A tiling ripple normal map (px x px, OpenGL/glTF convention, 0..1) after the original's water bump (an fBm noise
    at scale f0, roughness 0.5): `octaves` octaves at f0 x 2^o cycles a metre, each `waves` sines of uniformly random
    direction and phase, their wave numbers whole across the `metres` tile (so it tiles) and jittered +-30 % round the
    octave's own, the amplitude halving each octave (its slope staying the same); scaled to an RMS slope of `slope`.
    Isotropic: no wind direction, no lattice of a few waves to read as a tile (item H)."""
    rng = np.random.default_rng(seed)
    t = np.arange(px) / px
    x, y = np.meshgrid(t, t)
    gx = np.zeros((px, px))
    gy = np.zeros((px, px))
    used = set()
    for o in range(octaves):
        k0 = f0 * (2.0 ** o) * metres  # cycles across the tile
        amp0 = 0.5 ** o
        for _ in range(waves):
            k = k0 * rng.uniform(0.7, 1.3)
            a = rng.uniform(0.0, 2.0 * math.pi)
            m, n = int(round(k * math.cos(a))), int(round(k * math.sin(a)))
            if (m == 0 and n == 0) or (m, n) in used or (-m, -n) in used or max(abs(m), abs(n)) > px // 4:
                continue
            used.add((m, n))
            amp = amp0 * rng.rayleigh(1.0)  # height: halving each octave as its frequency doubles
            c = np.cos(2.0 * math.pi * (m * x + n * y) + rng.uniform(0.0, 2.0 * math.pi))
            gx += amp * 2.0 * math.pi * m * c
            gy += amp * 2.0 * math.pi * n * c
    s = slope / max(1e-9, float(np.sqrt((gx * gx + gy * gy).mean())))
    nv = np.stack([-gx * s, -gy * s, np.ones_like(gx)], axis=-1)
    nv /= np.linalg.norm(nv, axis=-1, keepdims=True)
    return (nv * 0.5 + 0.5).astype(np.float32)


def world_metre_uv(o, metres: float) -> None:
    """The object's only UV map, `UVMap`: its world x, y over `metres`, each face moved by whole repeats near 0."""
    me = o.data
    for uvl in list(me.uv_layers):
        me.uv_layers.remove(uvl)
    me.uv_layers.new(name="UVMap")
    co = world_co(o)
    lv, ls, lt = mesh_faces(me)
    uv = world_uv(co, lv, ls, lt, np.arange(len(ls)), np.full(len(ls), metres))
    me.uv_layers[0].data.foreach_set("uv", uv.astype(np.float32).ravel())


def fan_tris(lv, ls, lt) -> np.ndarray:
    """(n, 3) vertex triples of every polygon fanned from its first corner."""
    nt = lt - 2
    f = np.repeat(np.arange(len(ls)), nt)
    k = np.arange(int(nt.sum())) - np.repeat(np.cumsum(nt) - nt, nt) + 1
    s = ls[f]
    return np.stack([lv[s], lv[s + k], lv[s + k + 1]], axis=1)


def rebase_uv(me, metres: float) -> None:
    """World-metre UVs to texture repeats, each face moved by whole repeats near the origin (identical rendering with
    REPEAT, and small values that survive quantisation)."""
    if not me.uv_layers:
        return
    uv = np.empty(len(me.loops) * 2, np.float32)
    me.uv_layers[0].data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 2).astype(np.float64) / metres
    ls = np.empty(len(me.polygons), np.int32)
    me.polygons.foreach_get("loop_start", ls)
    if not len(ls):
        return
    fmin_u = np.floor(np.minimum.reduceat(uv[:, 0], ls))
    fmin_v = np.floor(np.minimum.reduceat(uv[:, 1], ls))
    lt = np.empty(len(me.polygons), np.int32)
    me.polygons.foreach_get("loop_total", lt)
    uv[:, 0] -= np.repeat(fmin_u, lt)
    uv[:, 1] -= np.repeat(fmin_v, lt)
    me.uv_layers[0].data.foreach_set("uv", uv.astype(np.float32).ravel())


def split_up_faces(me, mat, nz: float) -> None:
    """Faces whose normal points up more than `nz` take material slot 1 (`mat`)."""
    if len(me.materials) < 2:
        me.materials.append(mat)
    n = np.empty(len(me.polygons) * 3, np.float32)
    me.polygons.foreach_get("normal", n)
    idx = (n.reshape(-1, 3)[:, 2] > nz).astype(np.int32)
    me.polygons.foreach_set("material_index", idx)


def decimate_arrays(bk: Bakery, verts: np.ndarray, faces: list, ratio: float):
    me = bpy.data.meshes.new("WALK_coll_ground")
    me.from_pydata(verts.tolist(), [], faces)
    with bk.isolated():
        o = bk.temp("WALK_coll_ground", me)
        d = o.modifiers.new("dec", "DECIMATE")
        d.ratio = ratio
        d.use_collapse_triangulate = True
        dg = bpy.context.evaluated_depsgraph_get()
        low = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
        bk.drop(o)
    bpy.data.meshes.remove(me)
    co = mesh_co(low)
    f = face_lists(*mesh_faces(low))
    bpy.data.meshes.remove(low)
    return co, f


# ================================================================ the texture budget (v1.2)


def tex_mb(w: int, h: int) -> float:
    """GPU memory of one image as three.js uploads it: RGBA8 with a full mip chain, in MB (1e6 bytes)."""
    return w * h * 4.0 * 4.0 / 3.0 / 1e6


def fan_loops(ls, lt) -> np.ndarray:
    """(n, 3) loop index triples of every polygon fanned from its first corner (fan_tris by loops)."""
    nt = lt - 2
    f = np.repeat(np.arange(len(ls)), nt)
    k = np.arange(int(nt.sum())) - np.repeat(np.cumsum(nt) - nt, nt) + 1
    s = ls[f]
    return np.stack([s, s + k, s + k + 1], axis=1)


def uv_boost(me, zones: list) -> dict:
    """Scale the UV islands of `me` (its first UV map) that lie in `zones` UV_BOOST x about their own centres, an
    island partly inside by its area share (1 + (UV_BOOST - 1) x share); the caller packs them again. zones: [(x, y, z0,
    z1, r)] in the mesh's own frame: within r of (x, y) on the ground plane, between the heights z0 and z1. Islands:
    faces joined through loops that share a vertex and its UV. Returns what it did."""
    lv, ls, lt = mesh_faces(me)
    nf = len(ls)
    if not nf or not me.uv_layers or not zones:
        return dict(islands=0, boosted=0)
    co = mesh_co(me)
    uv = np.empty(len(me.loops) * 2, np.float32)
    me.uv_layers[0].data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 2).astype(np.float64)
    face = np.repeat(np.arange(nf), lt)
    q = np.round(uv * 65535.0).astype(np.int64)
    _, node = np.unique(lv.astype(np.int64) * (1 << 40) + q[:, 0] * (1 << 20) + q[:, 1], return_inverse=True)
    node = node.ravel()
    lab = np.arange(nf, dtype=np.int64)
    for _ in range(20000):  # label propagation: every face takes the smallest label it meets through a shared UV vertex
        nl = np.full(int(node.max()) + 1, nf, np.int64)
        np.minimum.at(nl, node, lab[face])
        new = lab.copy()
        np.minimum.at(new, face, nl[node])
        new = new[new]  # (pointer jumping: the labels are face indices)
        if np.array_equal(new, lab):
            break
        lab = new
    _, isl = np.unique(lab, return_inverse=True)
    isl = isl.ravel()
    ni = int(isl.max()) + 1
    # face centres and areas (fanned polygons)
    cen = np.add.reduceat(co[lv], ls, axis=0) / lt[:, None]
    tri = fan_tris(lv, ls, lt)
    tf = np.repeat(np.arange(nf), lt - 2)
    pp = co[tri]
    ta = 0.5 * np.linalg.norm(np.cross(pp[:, 1] - pp[:, 0], pp[:, 2] - pp[:, 0]), axis=1)
    fa = np.bincount(tf, weights=ta, minlength=nf)
    def zone_faces(f):
        m = np.zeros(nf, bool)
        for x, y, z0, z1, r in zones:
            m |= (np.hypot(cen[:, 0] - x, cen[:, 1] - y) <= r * f) & (cen[:, 2] >= z0) & (cen[:, 2] <= z1)
        return m
    inside = zone_faces(1.0)
    total = max(float(fa.sum()), 1e-12)
    if float((fa * inside).sum()) / total >= UV_BOOST_ALL:
        return dict(islands=ni, boosted=0, area_share=round(float((fa * inside).sum()) / total, 3),
                    note="all of it by its doors: left as it is")
    shrink = 1.0
    r_max = max(z[4] for z in zones)
    while float((fa * inside).sum()) / total > UV_BOOST_SHARE and shrink * r_max > UV_BOOST_R_MIN * (r_max / UV_BOOST_R):
        shrink *= 0.9
        inside = zone_faces(shrink)
    ia = np.bincount(isl, weights=fa, minlength=ni)
    ib = np.bincount(isl, weights=fa * inside, minlength=ni)
    share = ib / np.maximum(ia, 1e-12)
    k = 1.0 + (UV_BOOST - 1.0) * share
    li = isl[face]  # each loop's island
    cnt = np.bincount(li, minlength=ni).astype(np.float64)
    cu = np.stack([np.bincount(li, weights=uv[:, 0], minlength=ni) / np.maximum(cnt, 1.0),
                   np.bincount(li, weights=uv[:, 1], minlength=ni) / np.maximum(cnt, 1.0)], axis=1)
    uv2 = cu[li] + (uv - cu[li]) * k[li][:, None]
    me.uv_layers[0].data.foreach_set("uv", uv2.astype(np.float32).ravel())
    me.update()
    s = float(ib.sum() / max(float(ia.sum()), 1e-12))
    # the gain where boosted, after the packing rescales everything: UV_BOOST / sqrt(mean of k^2 by area)
    norm = math.sqrt(float((ia * k * k).sum() / max(float(ia.sum()), 1e-12)))
    return dict(islands=ni, boosted=int((share > 0.0).sum()), area_share=round(s, 3), zone_radius_m=round(UV_BOOST_R * shrink, 2),
                finer_by_doors=round(UV_BOOST / norm, 2), coarser_elsewhere=round(norm, 2))


def mesh_uv_stats(me) -> tuple[float, float]:
    """(surface area in the mesh's own units, area of its first UV map's triangles in UV units) of a mesh."""
    if not len(me.polygons) or not me.uv_layers:
        return 0.0, 0.0
    co = mesh_co(me)
    lv, ls, lt = mesh_faces(me)
    fl = fan_loops(ls, lt)
    uv = np.empty(len(me.loops) * 2, np.float32)
    me.uv_layers[0].data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 2).astype(np.float64)
    p = co[lv[fl]]
    t = uv[fl]
    wa = 0.5 * np.linalg.norm(np.cross(p[:, 1] - p[:, 0], p[:, 2] - p[:, 0]), axis=1).sum()
    ua = 0.5 * np.abs((t[:, 1, 0] - t[:, 0, 0]) * (t[:, 2, 1] - t[:, 0, 1]) - (t[:, 2, 0] - t[:, 0, 0]) * (t[:, 1, 1] - t[:, 0, 1])).sum()
    return float(wa), float(ua)


FIT_NEAR_M = 1.5         # the nearest a spawn's eye is taken to stand to a surface
FIT_PX_PER_RAD = 514.0   # the viewer's 70 degree field over 720 px
FIT_SOFT = 4.0           # the first pass halves only what stays under this many screen pixels a texel at its spawn
FIT_AT_SPAWN = 1.5       # ... and, of what stands within NEAR_DOOR_M of a spawn, only what stays under this


def fit_textures(X, budget_mb: float, keep_meshes: set) -> dict:
    """The images of every exported village material under `budget_mb` (RGBA8 + mips), each halved in turn
    (Image.scale, repacked). v1.2b (look check 2026-11-15: v1.2's classes by distance alone took the trestle's map from
    1024 to 256, 64 cm a texel at Spawn_trestle, and five buildings just over 12 m out to 256, while maps of half a
    centimetre a texel kept their size): the next image to halve is the one whose texels would still look the smallest,
    its `need`: the screen pixels one texel covers from the nearest spawn to any of its users (the viewer's 70 degree
    field over 720 px; texel = sqrt(surface area / UV area) / size, on the mesh as placed; the eye no nearer than
    FIT_NEAR_M) after the halving. First only halvings that stay under FIT_SOFT pixels a texel (FIT_AT_SPAWN for a
    map with a user within NEAR_DOOR_M of a spawn: the Witching Lantern's glass 3.9 m from the chapel's door spawn);
    then, if the budget is not met, the rest in the same order. Floors: base colours 256 (the heroes' 512), the rest 128. Never: the
    ground tiles A and B and their maps, the scans, the tiled maps, the near copies (keep_meshes), the near trees and
    the base colours TEX_PX_MODEL sets by name (the trestle, the Post Office, the notice board, the platform).
    The distances are to every spawn (the districts' and the overworld scene's), from the spawn records (area-local
    position plus the area's offset): the empties made this run have no world matrix until the view layer updates."""
    sc = bpy.context.scene
    bpy.context.view_layer.update()
    spawns = []
    for s in X.spawns:
        off = AREAS[s["area"]].offset if s.get("area") in AREAS else (0.0, 0.0)
        spawns.append(Vector((float(s["local"][0]) + off[0], float(s["local"][1]) + off[1], float(s["local"][2]))))

    def dist(o):
        if not spawns:
            return 0.0
        bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
        x0, x1 = min(v.x for v in bb), max(v.x for v in bb)
        y0, y1 = min(v.y for v in bb), max(v.y for v in bb)
        return min(math.hypot(max(x0 - p.x, 0.0, p.x - x1), max(y0 - p.y, 0.0, p.y - y1)) for p in spawns)
    stats: dict[str, tuple] = {}
    users = defaultdict(list)    # image name -> [(object distance, mesh name, metres of surface a UV unit spans)]
    on_building = set()          # v1.2c: the images a building wears (their base colours keep 512)
    images = {}
    for o in sc.objects:
        if o.type != "MESH" or o.name.startswith("HM_Collision") or o.get("wdi_room"):
            continue
        d = None
        for s in o.material_slots:
            m = s.material
            if m is None or not m.use_nodes:
                continue
            for n in m.node_tree.nodes:
                if n.type == "TEX_IMAGE" and n.image is not None:
                    if d is None:
                        d = dist(o)
                        if o.data.name not in stats:
                            stats[o.data.name] = mesh_uv_stats(o.data)
                    wa, ua = stats[o.data.name]
                    sc_ = abs(o.matrix_world.to_3x3().determinant()) ** (1.0 / 3.0)
                    span = sc_ * math.sqrt(wa / ua) if ua > 1e-9 else None
                    images[n.image.name] = n.image
                    users[n.image.name].append((d, o.data.name, span))
                    if o.get("wdi_kind") == "building":
                        on_building.add(n.image.name)
    before = sum(tex_mb(*im.size) for im in images.values())

    def need(name, w, h):
        """screen pixels a texel of the image at (w, h) covers from the nearest spawn, the largest among its users"""
        best = None
        for d, _m, span in users[name]:
            if span is None:
                continue
            v = span / math.sqrt(max(w * h, 1)) / max(d, FIT_NEAR_M) * FIT_PX_PER_RAD
            best = v if best is None else max(best, v)
        return best if best is not None else 1e9

    rule = {}
    named = tuple(TEX_PX_MODEL)
    for name, im in images.items():
        dmin = min(d for d, _m, _s in users[name])
        meshes = {m for _d, m, _s in users[name]}
        nm = name
        base = nm.endswith("_base")
        if (re.match(r"^\w+_ground_(A|B)\d", nm) or nm.startswith(("ground_", "snow_02", "water_ripple", "wood_floor", "stone_wall"))
                or (meshes & keep_meshes) or re.match(r"^(pine_tall|pine_short|dead_tree)_base$", nm)
                or (base and nm[:-len("_base")] in named)):
            continue
        if base:
            # v1.2c: every building's base colour keeps 512 (look check 2026-11-15: five buildings just over 12 m from a
            # spawn read soft at 256; a walker goes up to them)
            floor = 512 if (any(nm.startswith(h) for h in HERO_BUILDINGS) or nm in on_building) \
                else (128 if nm.startswith("HM_Rock_") else 256)
        else:
            floor = 128
        rule[name] = (floor, dmin)
    total = before
    done = []
    for soft in (True, False):
        while total > budget_mb:
            cand = []
            for n, (floor, _d) in rule.items():
                w, h = images[n].size
                if min(w, h) <= floor:
                    continue
                v = need(n, max(1, w // 2), max(1, h // 2))
                if soft and v > FIT_SOFT:
                    continue
                if soft and _d <= NEAR_DOOR_M and v > FIT_AT_SPAWN:
                    continue  # what stands at a spawn keeps its maps, unless its texels stay under FIT_AT_SPAWN px
                cand.append((v, n))
            if not cand:
                break
            v, n = min(cand)
            im = images[n]
            w, h = im.size
            old = tex_mb(w, h)
            im.scale(max(1, w // 2), max(1, h // 2))
            im.pack()
            total += tex_mb(*im.size) - old
            done.append(dict(image=n, before=[w, h], after=list(im.size), px_per_texel_after=round(v, 2),
                             nearest_spawn_m=round(rule[n][1], 1), over_soft=not soft))
    needs = {n: round(need(n, *images[n].size), 2) for n in images if need(n, *images[n].size) < 1e8}
    log(f"textures: {before:.1f} MB -> {total:.1f} MB (budget {budget_mb} MB), {len(done)} halvings "
        f"({sum(1 for x in done if x['over_soft'])} over {FIT_SOFT} px a texel)")
    return dict(before_MB=round(before, 1), after_MB=round(total, 1), budget_MB=budget_mb, images=len(images),
                halved=done, fits=total <= budget_mb, px_per_texel_at_nearest_spawn=needs,
                rule="halve the image whose texels stay smallest on screen from its nearest spawn; see fit_textures")


# ================================================================ finish: HM_Collision, guard, cleanup, export, report


ROOM_GUARD_NODES = {"OUTPUT_MATERIAL", "EMISSION", "LIGHT_PATH", "MIX_SHADER", "BSDF_TRANSPARENT", "TEX_IMAGE",
                    "VERTEX_COLOR", "MIX", "GROUP"}


def room_guard(mat) -> list[str]:
    """A room's material (meshy_room_build.RMat.unlit_tree) as the exporter writes KHR_materials_unlit from it: the
    Surface from a Mix Shader of Transparent and Emission behind Light Path's camera ray (optionally under an alpha mix),
    only the room build's nodes; the walk export leaves these trees as they are."""
    bad = []
    if not mat.use_nodes or mat.node_tree is None:
        return [f"{mat.name}: no node tree"]
    nodes = mat.node_tree.nodes
    for n in nodes:
        if n.type not in ROOM_GUARD_NODES:
            bad.append(f"{mat.name}: node {n.name} ({n.type}) in a room material")
    outs = [n for n in nodes if n.type == "OUTPUT_MATERIAL" and n.is_active_output]
    if len(outs) != 1 or not outs[0].inputs["Surface"].is_linked or outs[0].inputs["Surface"].links[0].from_node.type != "MIX_SHADER":
        bad.append(f"{mat.name}: its Surface is not the unlit Mix Shader")
    if not any(n.type == "LIGHT_PATH" for n in nodes) or not any(n.type == "EMISSION" for n in nodes):
        bad.append(f"{mat.name}: no Light Path / Emission (not the unlit tree)")
    return bad


def append_rooms(X) -> list[dict]:
    """--rooms: each `<rooms-dir>/<sceneId>.blend` (meshy_room_build.py's: collection Room_<sceneId> holding
    Area_room_<sceneId>, its meshes, lights, spawns and portals under it, HM_Collision_room_<sceneId> beside it in room
    coordinates, unlit COLOR_0 materials, every name prefixed with the room) appended as it is, then moved to its fixed
    slot (ROOM_SLOTS): the area root to the slot, the collision with it, its transform applied to its vertices so it
    stands in world coordinates at the scene root. A missing room is skipped with a warning in the notes."""
    sc = bpy.context.scene
    out = []
    ids = [s.strip() for s in (X.args.rooms or "").split(",") if s.strip()]
    for sid in ids:
        path = os.path.join(os.path.abspath(X.args.rooms_dir), f"{sid}.blend")
        if sid not in ROOM_SLOTS:
            X.notes.append(f"WARNING room {sid}: not in ROOM_SLOTS; skipped")
            log(X.notes[-1])
            continue
        if not os.path.exists(path):
            X.notes.append(f"WARNING room {sid}: {path} missing; skipped")
            log(X.notes[-1])
            continue
        if bpy.data.objects.get(f"Area_room_{sid}") is not None:
            X.notes.append(f"room {sid}: already in the scene; not appended again")
            continue
        with bpy.data.libraries.load(path, link=False) as (src, dst):
            if f"Room_{sid}" not in src.collections:
                dst.collections = []
            else:
                dst.collections = [f"Room_{sid}"]
        coll = dst.collections[0] if dst.collections else None
        if coll is None:
            X.notes.append(f"WARNING room {sid}: {path} has no collection Room_{sid}; skipped")
            log(X.notes[-1])
            continue
        sc.collection.children.link(coll)
        bpy.context.view_layer.update()
        area = bpy.data.objects.get(f"Area_room_{sid}")
        colm = bpy.data.objects.get(f"HM_Collision_room_{sid}")
        if area is None or colm is None:
            X.notes.append(f"WARNING room {sid}: Area_room_{sid} or HM_Collision_room_{sid} missing in {path}; skipped")
            log(X.notes[-1])
            for o in list(coll.all_objects):
                bpy.data.objects.remove(o, do_unlink=True)
            bpy.data.collections.remove(coll)
            continue
        slot = Vector(room_slot(sid))
        old = area.matrix_world.translation.copy()
        delta = slot - old
        area.parent = None
        area.matrix_world = Matrix.Translation(delta) @ area.matrix_world
        bpy.context.view_layer.update()
        M = colm.matrix_world.copy()
        colm.parent = None
        if colm.data.users > 1:
            colm.data = colm.data.copy()
        colm.data.transform(Matrix.Translation(delta) @ M)
        colm.matrix_world = Matrix.Identity(4)
        colm.data.update()
        objs = [area] + list(area.children_recursive)
        for o in objs + [colm]:
            o["wdi_room"] = sid
        area["wdi_slot"] = [float(v) for v in slot]
        area["wdi_room_moved_by"] = [round(float(v), 4) for v in delta]
        area["wdi_area"] = f"room_{sid}"
        X.roots[f"room_{sid}"] = area
        X.room_collisions.append(colm)
        meshes = [o for o in objs if o.type == "MESH"]
        mats = {s.material for o in meshes for s in o.material_slots if s.material is not None}
        cbox = np.array([tuple(v.co) for v in colm.data.vertices]) if len(colm.data.vertices) else np.zeros((0, 3))
        info = dict(scene=sid, blend=path, slot=list(slot), area_was=[round(v, 3) for v in old], moved_by=[round(v, 3) for v in delta],
                    meshes=len(meshes), lights=sum(1 for o in objs if o.type == "LIGHT"),
                    spawns=sorted(o.name for o in objs if o.name.startswith("Spawn_")),
                    portals=sorted(o.name for o in objs if o.name.startswith("Portal_")),
                    with_color_attr=sum(1 for o in meshes if o.data.color_attributes),
                    materials=len(mats), unlit_guard=[b for m in sorted(mats, key=lambda m: m.name) for b in room_guard(m)],
                    indoor=bool(area.get("wdi_indoor")), exposure=area.get("wdi_exposure"),
                    collision=dict(tris=mesh_tris(colm.data), world_min=[round(float(v), 3) for v in cbox.min(axis=0)] if len(cbox) else None,
                                   world_max=[round(float(v), 3) for v in cbox.max(axis=0)] if len(cbox) else None))
        # v1.2b (contract check 2026-11-15, on the dummy room: a spawn 0.70 m from its own portal never arms the
        # walk-in trigger): the room's spawns against its portals, as the village's are kept apart
        close = []
        for sp in (o for o in objs if o.name.startswith("Spawn_")):
            for po in (o for o in objs if o.name.startswith("Portal_")):
                a_, b_ = sp.matrix_world.translation, po.matrix_world.translation
                dd = math.hypot(a_.x - b_.x, a_.y - b_.y)
                if dd < PORTAL_SPAWN_M:
                    close.append(dict(spawn=sp.name, portal=po.name, m=round(dd, 2)))
        info["spawns_within_portal_radius"] = close
        for c_ in close:
            X.notes.append(f"WARNING room {sid}: {c_['spawn']} stands {c_['m']} m from {c_['portal']} "
                           f"(under {PORTAL_SPAWN_M} m: arriving there never arms the walk-in trigger)")
            log(X.notes[-1])
        log(f"room {sid}: {info}")
        out.append(info)
    return out


def walk_state(X) -> str:
    """What a later --base-blend run needs to write the report again (saved in the export blend's scene)."""
    return json.dumps(dict(areas=X.areas, spawns=X.spawns, portals=X.portals, lights=X.lights, notes=X.notes,
                           collision=X.collision, cat=X.cat, bakes=(X.bakery.log if X.bakery else []), steps=X.steps,
                           tex_fit=getattr(X, "tex_fit", None), near_meshes=sorted(getattr(X, "near_meshes", set()))),
                      default=_json_default)


def finalize(X: Export) -> dict:
    args = X.args
    sc = bpy.context.scene
    if X.base_mode:
        coll = bpy.data.objects.get("HM_Collision")
    else:
        with X.step("collision mesh"):
            verts, faces, cats = [], [], defaultdict(int)
            n = 0
            for A, S in X.shapes:
                co, f = S.arrays()
                co = co + np.array([A.offset[0], A.offset[1], 0.0])
                verts.append(co)
                faces.extend(tuple(n + i for i in face) for face in f)
                n += len(co)
                for k, v in S.tris.items():
                    cats[k] += v
            me = bpy.data.meshes.new("HM_Collision")
            me.from_pydata(np.concatenate(verts).tolist(), [], faces)
            me.update()
            # fix 11 (contract, spawns-lights-collision.md 4): no material at all; the viewer hides it by its extras
            coll = bpy.data.objects.new("HM_Collision", me)
            X.collection().objects.link(coll)
            coll["wdi_collision"] = True
            coll["wdi_note"] = "hide this mesh: world coordinates, every area's offset applied"
            X.collision = dict(tris=mesh_tris(me), verts=len(me.vertices), by_part=dict(cats))
            log("HM_Collision", X.collision)
        with X.step("cleanup"):
            keep = set()
            for root in X.roots.values():
                keep.add(root)
                keep.update(root.children_recursive)
            keep.add(coll)
            gone = 0
            for o in list(bpy.data.objects):
                if o not in keep:
                    bpy.data.objects.remove(o, do_unlink=True)
                    gone += 1
            for c in list(bpy.data.collections):
                if c.name in ("HM_Sources", "WalkBake") or (not c.objects and not c.children and c.name != "HM_Walk"):
                    bpy.data.collections.remove(c)
            bpy.data.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)
            log(f"cleanup: {gone} objects removed, {len(bpy.data.objects)} left, {len(bpy.data.images)} images, {len(bpy.data.materials)} materials")
        with X.step("textures"):
            X.tex_fit = fit_textures(X, float(args.tex_budget_mb), getattr(X, "near_meshes", set()))
    if getattr(args, "gates", None):
        # the Undermere's gates (meshy_gates.py): their mouth pieces, collision, portals, arrivals and terrain edits;
        # without --gates this step does not run and the file is as before
        import meshy_gates  # noqa: E402
        with X.step("gates"):
            X.gates = meshy_gates.add_gates(X, args.gates, dict(
                log=log, fit=lambda: fit_textures(X, float(args.tex_budget_mb), getattr(X, "near_meshes", set()))))
    if args.rooms:
        with X.step("rooms"):
            X.rooms = append_rooms(X)
    with X.step("guard"):
        bad, mats, room_mats = [], set(), set()
        for o in sc.objects:
            if o.type == "MESH":
                for s in o.material_slots:
                    if s.material is None:
                        bad.append(f"{o.name}: empty material slot")
                    elif o.get("wdi_room") or o.get("wdi_gate"):
                        room_mats.add(s.material)   # unlit trees (a gate's mouth piece is one too)
                    else:
                        mats.add(s.material)
        for m in sorted(mats, key=lambda m: m.name):
            bad += guard(m)
        for m in sorted(room_mats - mats, key=lambda m: m.name):
            bad += room_guard(m)
        if bad:
            for b in bad[:60]:
                log("GUARD", b)
            raise RuntimeError(f"guard: {len(bad)} problems (first: {bad[0]})")
        log(f"guard: {len(mats)} materials pass, {len(room_mats)} room materials (unlit)")
    with X.step("export"):
        os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
        bpy.ops.export_scene.gltf(
            filepath=os.path.abspath(args.out), export_format="GLB", use_active_scene=True, use_renderable=True,
            export_apply=False, export_gpu_instances=True, export_extras=True, export_yup=True,
            export_image_format="WEBP", export_image_quality=80, export_lights=True,
            export_import_convert_lighting_mode="COMPAT", export_animations=False, export_cameras=False,
            export_vertex_color="MATERIAL", export_all_vertex_colors=False,
            export_active_vertex_color_when_no_material=False, export_tangents=False, **DRACO)
        log("exported", args.out, os.path.getsize(args.out))
    if getattr(args, "gates", None) and getattr(args, "gates_journey", None):
        with X.step("gates journey file"):
            import meshy_gates  # noqa: E402
            meshy_gates.write_journey(args.gates_journey, log)
    with X.step("report"):
        rep = report(X)
        if getattr(X, "gates", None):
            rep["gates"] = X.gates
    if args.keep_blend:
        with X.step("save blend"):
            sc["wdi_walk_state"] = walk_state(X)  # for a later --base-blend run (the rooms' short run)
            bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(args.blend_out), copy=True, compress=False)
            del sc["wdi_walk_state"]
            rep["blend"] = dict(path=args.blend_out, bytes=os.path.getsize(args.blend_out))
    rep["timings_s"] = dict(X.steps, total=round(time.time() - T0, 1))
    with open(args.report, "w", encoding="utf-8") as fh:
        json.dump(rep, fh, indent=1, default=_json_default)
    log("report", args.report)
    return rep


# ================================================================ GLB reading (report and verify)


def read_glb(path: str):
    data = open(path, "rb").read()
    magic, version, length = struct.unpack_from("<4sII", data, 0)
    off, G, bin_off = 12, None, None
    while off + 8 <= len(data):
        clen, ctype = struct.unpack_from("<I4s", data, off)
        if ctype == b"JSON":
            G = json.loads(data[off + 8:off + 8 + clen])
        elif ctype == b"BIN\x00":
            bin_off = off + 8
        off += 8 + clen
    return data, G, bin_off


def image_size(b: bytes):
    if b[:4] == b"RIFF" and b[8:12] == b"WEBP":
        kind = b[12:16]
        if kind == b"VP8 ":
            w, h = struct.unpack_from("<HH", b, 26)
            return w & 0x3FFF, h & 0x3FFF
        if kind == b"VP8L":
            v = struct.unpack_from("<I", b, 21)[0]
            return (v & 0x3FFF) + 1, ((v >> 14) & 0x3FFF) + 1
        if kind == b"VP8X":
            return int.from_bytes(b[24:27], "little") + 1, int.from_bytes(b[27:30], "little") + 1
    if b[:8] == b"\x89PNG\r\n\x1a\n":
        return struct.unpack_from(">II", b, 16)
    return None


def view_estimate(X: Export, vfov_deg: float = 75.0, aspect: float = 16 / 9, far: float = 500.0) -> dict:
    """Triangles and draw calls a three.js camera at each spawn would draw (eye 1.6 m, level, three.js's default 75 degree
    vertical field, 16:9, far plane `far`): every mesh node whose bounding sphere meets the frustum counts whole, and an
    instanced group (one InstancedMesh) counts all its instances when any part of it is in view."""
    bpy.context.view_layer.update()
    draws = []  # (centre, radius, tris, primitives)
    groups = defaultdict(list)
    for o in bpy.context.scene.objects:
        if o.type != "MESH" or o.name.startswith("HM_Collision") or o.get("wdi_room"):
            continue
        M = o.matrix_world
        corners = np.array([tuple(M @ Vector(c)) for c in o.bound_box])
        key = o.parent.name if (o.parent is not None and o.parent.name.startswith("I_")) else o.name
        groups[key].append((corners, mesh_tris(o.data), len(o.data.materials) or 1))
    for key, items in groups.items():
        pts = np.concatenate([c for c, _t, _p in items])
        lo, hi = pts.min(axis=0), pts.max(axis=0)
        draws.append(((lo + hi) / 2.0, float(np.linalg.norm(hi - lo) / 2.0), sum(t for _c, t, _p in items), items[0][2]))
    tv = math.tan(math.radians(vfov_deg) / 2.0)
    th = tv * aspect
    out = {}
    for s in X.spawns:
        ob = bpy.data.objects.get(s["name"])
        if ob is None:
            continue
        eye = np.array(ob.matrix_world.translation) + np.array([0.0, 0.0, 1.6])
        f = np.array(ob.matrix_world.to_3x3() @ Vector((0.0, 1.0, 0.0)))
        f[2] = 0.0
        f /= np.linalg.norm(f)
        r = np.array([f[1], -f[0], 0.0])
        u = np.array([0.0, 0.0, 1.0])
        tris = calls = 0
        for c, rad, t, p in draws:
            d = c - eye
            z, x, y = float(d @ f), float(d @ r), float(d @ u)
            if z < -rad or z > far + rad:
                continue
            if abs(x) > z * th + rad * math.sqrt(1 + th * th) or abs(y) > z * tv + rad * math.sqrt(1 + tv * tv):
                continue
            tris += t
            calls += p
        out[s["name"]] = dict(tris=int(tris), draw_calls=int(calls))
    district = {k: v for k, v in out.items() if not k.startswith("Spawn_overworld_")}
    return dict(camera=f"eye 1.6 m, vertical fov {vfov_deg}, aspect {aspect:.2f}, far {far} m; InstancedMesh culled whole",
                per_spawn=out, max_tris=max((v["tris"] for v in out.values()), default=0),
                max_tris_district_spawns=max((v["tris"] for v in district.values()), default=0))


def report(X: Export) -> dict:
    data, G, bin_off = read_glb(X.args.out)
    acc = G.get("accessors", [])
    nodes, meshes = G.get("nodes", []), G.get("meshes", [])

    def prim_tris(p):
        n = acc[p["indices"]]["count"] if "indices" in p else acc[p["attributes"]["POSITION"]]["count"]
        return n // 3

    mesh_tris_g = [sum(prim_tris(p) for p in m["primitives"]) for m in meshes]
    groups, draw_nodes, draw_calls = [], 0, 0
    room_nodes = set()
    for i, n in enumerate(nodes):  # every node under an Area_room_ root
        if n.get("name", "").startswith("Area_room_"):
            stack = [i]
            while stack:
                j = stack.pop()
                room_nodes.add(j)
                stack.extend(nodes[j].get("children", []))
    room_draws = 0
    for i, n in enumerate(nodes):
        if "mesh" not in n:
            continue
        ext = n.get("extensions", {}).get("EXT_mesh_gpu_instancing")
        if not n.get("name", "").startswith("HM_Collision"):
            draw_nodes += 1
            draw_calls += len(meshes[n["mesh"]]["primitives"])
            if i in room_nodes:
                room_draws += len(meshes[n["mesh"]]["primitives"])
        if ext:
            cnt = acc[ext["attributes"]["TRANSLATION"]]["count"]
            groups.append(dict(node=n.get("name"), mesh=meshes[n["mesh"]].get("name"), instances=cnt,
                               tris_each=mesh_tris_g[n["mesh"]], tris_total=cnt * mesh_tris_g[n["mesh"]]))
    images = []
    for im in G.get("images", []):
        bv = G["bufferViews"][im["bufferView"]]
        b = data[bin_off + bv.get("byteOffset", 0): bin_off + bv.get("byteOffset", 0) + bv["byteLength"]]
        s = image_size(b)
        images.append(dict(name=im.get("name"), mime=im.get("mimeType"), w=s[0] if s else None, h=s[1] if s else None, bytes=len(b)))
    sizes = defaultdict(int)
    for im in images:
        sizes[f"{im['w']}x{im['h']}"] += 1
    gpu = sum((im["w"] or 0) * (im["h"] or 0) * 4 * 4 / 3 for im in images) / 2 ** 20
    # loaded triangles per category, from the scene as exported (every instance counted); the rooms apart
    loaded = defaultdict(int)
    room_tris = defaultdict(int)
    for o in bpy.context.scene.objects:
        if o.type == "MESH" and not o.name.startswith("HM_Collision"):
            if o.get("wdi_room"):
                room_tris[o["wdi_room"]] += mesh_tris(o.data)
            else:
                loaded[X.cat.get(o.name, "misc")] += mesh_tris(o.data)
    unique = sum(t for m, t in zip(meshes, mesh_tris_g) if not m.get("name", "").startswith("HM_Collision"))
    view = view_estimate(X)
    rooms_glb = rooms_in_glb(G, X)
    # spawns and lights as written
    by_name = {n.get("name"): n for n in nodes}
    for s in X.spawns:
        n = by_name.get(s["name"], {})
        s["gltf_translation_local"] = [round(v, 4) for v in n.get("translation", [0, 0, 0])]
        s["gltf_rotation_xyzw"] = [round(v, 5) for v in n.get("rotation", [0, 0, 0, 1])]
        ob = bpy.data.objects.get(s["name"])
        if ob is not None:
            w = ob.matrix_world
            s["blender_world"] = [round(v, 3) for v in w.translation]
            s["gltf_world"] = [round(w.translation.x, 3), round(w.translation.z, 3), round(-w.translation.y, 3)]
            f = (w.to_3x3() @ Vector((0.0, 1.0, 0.0))).normalized()
            s["view_dir_blender"] = [round(v, 4) for v in f]
            s["view_dir_gltf"] = [round(f.x, 4), round(f.z, 4), round(-f.y, 4)]
            s["heading_deg"] = round(math.degrees(math.atan2(f.y, f.x)), 2)
    L = G.get("extensions", {}).get("KHR_lights_punctual", {}).get("lights", [])
    for li in X.lights:
        n = by_name.get(li["name"], {})
        k = n.get("extensions", {}).get("KHR_lights_punctual", {}).get("light")
        if k is not None:
            li["gltf"] = L[k]
        ob = bpy.data.objects.get(li["name"])
        if ob is not None:
            t = ob.matrix_world.translation
            li["blender_world"] = [round(v, 3) for v in t]
            li["gltf_world"] = [round(t.x, 3), round(t.z, 3), round(-t.y, 3)]
    size = os.path.getsize(X.args.out)
    bin_img = sum(im["bytes"] for im in images)
    return dict(
        file=os.path.abspath(X.args.out), bytes=size, MB=round(size / 2 ** 20, 2),
        breakdown_MB=dict(images=round(bin_img / 2 ** 20, 2), geometry_and_json=round((size - bin_img) / 2 ** 20, 2)),
        extensions_used=G.get("extensionsUsed"), extensions_required=G.get("extensionsRequired"),
        areas=X.areas, bake=X.bake,
        bakes=(X.bakery.log if X.bakery else (getattr(X, "base_state", {}) or {}).get("bakes", [])),
        triangles=dict(loaded_by_category=dict(loaded), loaded_total=int(sum(loaded.values())), unique=int(unique),
                       collision=X.collision, in_view_at_spawns=view, rooms=dict(room_tris)),
        draw_nodes=draw_nodes, draw_calls_approx=draw_calls, draw_calls_village=draw_calls - room_draws, draw_calls_rooms=room_draws,
        nodes=len(nodes), meshes=len(meshes), materials=len(G.get("materials", [])),
        instanced_groups=groups,
        textures=dict(count=len(images), by_size=dict(sizes), gpu_MB=round(gpu, 1),
                      gpu_MB_1e6=round(sum((im["w"] or 0) * (im["h"] or 0) * 4 * 4 / 3 for im in images) / 1e6, 1),
                      fit=X.tex_fit, images=images),
        spawns=X.spawns, portals=X.portals, rooms=dict(appended=X.rooms, in_glb=rooms_glb), lights=X.lights,
        light_units="KHR_lights_punctual intensity = Blender watts / (4 pi) (exporter COMPAT mode); view with toneMapping AgX and "
                    "toneMappingExposure = 2 ^ look exposure (village 2^1.25 = 2.38); AREA lights become SPOTs: energy x4, 150 deg, blend 1",
        notes=X.notes,
    )


def rooms_in_glb(G: dict, X) -> list[dict]:
    """The rooms as the GLB holds them: each Area_room_ node's translation against its slot (glTF (x, z, -y)), its
    extras, the COLOR_0 and unlit materials of the meshes under it, and its HM_Collision_room_ at the scene root
    (no transform; its POSITION bounds round the slot)."""
    nodes, meshes, acc = G.get("nodes", []), G.get("meshes", []), G.get("accessors", [])
    mats = G.get("materials", [])
    roots = set()
    for sc in G.get("scenes", []):
        roots.update(sc.get("nodes", []))
    out = []
    for i, n in enumerate(nodes):
        name = n.get("name", "")
        if not name.startswith("Area_room_"):
            continue
        sid = name[len("Area_room_"):]
        slot = room_slot(sid) if sid in ROOM_SLOTS else None
        t = n.get("translation", [0.0, 0.0, 0.0])
        want = [slot[0], slot[2], -slot[1]] if slot else None
        sub, stack = [], list(n.get("children", []))
        while stack:
            j = stack.pop()
            sub.append(j)
            stack.extend(nodes[j].get("children", []))
        prims = [p for j in sub if "mesh" in nodes[j] for p in meshes[nodes[j]["mesh"]]["primitives"]]
        unlit = sum(1 for p in prims if "material" in p and "KHR_materials_unlit" in mats[p["material"]].get("extensions", {}))
        c0 = sum(1 for p in prims if "COLOR_0" in p["attributes"])
        cn = next((j for j, m in enumerate(nodes) if m.get("name") == f"HM_Collision_room_{sid}"), None)
        cinfo = None
        if cn is not None:
            m = meshes[nodes[cn]["mesh"]] if "mesh" in nodes[cn] else None
            pa = acc[m["primitives"][0]["attributes"]["POSITION"]] if m else None
            cinfo = dict(at_root=cn in roots, transform=any(k in nodes[cn] for k in ("translation", "rotation", "scale", "matrix")),
                         min=pa.get("min") if pa else None, max=pa.get("max") if pa else None,
                         extras=nodes[cn].get("extras"))
            if pa and want and pa.get("min") and pa.get("max"):
                c = [(a + b) / 2.0 for a, b in zip(pa["min"], pa["max"])]
                cinfo["centre_to_slot_m"] = round(math.hypot(c[0] - want[0], c[2] - want[2]), 2)
        out.append(dict(scene=sid, node=name, translation=[round(v, 3) for v in t], slot_gltf=want,
                        at_slot=bool(want) and all(abs(a - b) < 1e-3 for a, b in zip(t, want)), extras=n.get("extras"),
                        primitives=len(prims), with_COLOR_0=c0, unlit=unlit,
                        spawns=sorted(nodes[j].get("name") for j in sub if nodes[j].get("name", "").startswith("Spawn_")),
                        portals=sorted(nodes[j].get("name") for j in sub if nodes[j].get("name", "").startswith("Portal_")),
                        lights=sum(1 for j in sub if "KHR_lights_punctual" in nodes[j].get("extensions", {})),
                        collision=cinfo))
    return out


# ================================================================ verify: re-import the GLB into an empty scene


def _prop(v):
    """A custom property as plain JSON (the importer's extras arrive as IDPropertyArray / IDPropertyGroup)."""
    if hasattr(v, "to_dict"):
        return v.to_dict()
    if hasattr(v, "to_list"):
        return v.to_list()
    return v


def verify(glb: str, out: str | None) -> dict:
    t = time.time()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    res = bpy.ops.import_scene.gltf(filepath=os.path.abspath(glb), import_webp_texture=True,
                                    export_import_convert_lighting_mode="COMPAT")
    bpy.context.view_layer.update()
    objs = list(bpy.data.objects)
    coll = [o for o in objs if o.name == "HM_Collision"]
    spawns = {}
    for o in sorted((o for o in objs if o.name.startswith("Spawn_")), key=lambda o: o.name):
        f = o.matrix_world.to_3x3() @ Vector((0.0, 1.0, 0.0))
        spawns[o.name] = dict(blender=[round(v, 3) for v in o.matrix_world.translation],
                              heading_deg=round(math.degrees(math.atan2(f.y, f.x)), 2), pitch_deg=round(math.degrees(math.asin(max(-1.0, min(1.0, f.z / max(f.length, 1e-9))))), 2),
                              extras={k: _prop(o[k]) for k in o.keys() if k.startswith("wdi_")})
    lights = defaultdict(int)
    light_list = []
    for o in objs:
        if o.type == "LIGHT":
            lights[o.data.type] += 1
            light_list.append((o.name, o.data.type, round(o.data.energy, 2), [round(v, 2) for v in o.matrix_world.translation]))
    by_mesh = defaultdict(int)
    for o in objs:
        if o.type == "MESH":
            by_mesh[o.data.name] += 1
    imgs = defaultdict(int)
    for im in bpy.data.images:
        imgs[f"{im.file_format} {im.size[0]}x{im.size[1]}"] += 1
    portals = {o.name: dict(blender=[round(v, 3) for v in o.matrix_world.translation],
                            extras={k: _prop(o[k]) for k in o.keys() if k in ("to", "toSpawn", "kind") or k.startswith("wdi_")})
               for o in sorted((o for o in objs if o.name.startswith("Portal_")), key=lambda o: o.name)}
    areas = {o.name: {k: (o[k] if isinstance(o[k], (int, float, str, bool)) else str(o[k])) for k in o.keys()
                      if k in ("wdi_exposure", "fog_color", "fog_density", "wdi_indoor")}
             for o in objs if o.name.startswith("Area_")}
    rcoll = [o for o in objs if o.name.startswith("HM_Collision_room_")]
    R = dict(glb=os.path.abspath(glb), import_result=sorted(res), seconds=round(time.time() - t, 1), objects=len(objs),
             mesh_objects=sum(by_mesh.values()), meshes=len(by_mesh),
             collision=dict(found=len(coll), tris=mesh_tris(coll[0].data) if coll else 0,
                            props={k: str(coll[0][k]) for k in coll[0].keys()} if coll else {}),
             room_collisions={o.name: dict(tris=mesh_tris(o.data), parent=o.parent.name if o.parent else None)
                              for o in rcoll},
             areas=areas, portals=portals,
             spawns=spawns, lights=dict(lights), light_list=light_list,
             meshes_shared_by_several_objects=sum(1 for v in by_mesh.values() if v > 1),
             objects_on_shared_meshes=sum(v for v in by_mesh.values() if v > 1),
             shared_meshes={k: v for k, v in sorted(by_mesh.items(), key=lambda kv: -kv[1])[:20] if v > 1},
             images=dict(imgs), bytes=os.path.getsize(glb))
    print("VERIFY " + json.dumps(R, indent=1, default=_json_default), flush=True)
    if out:
        with open(out, "w", encoding="utf-8") as fh:
            json.dump(R, fh, indent=1, default=_json_default)
    return R


# ================================================================ main


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser(prog="meshy_walk_export.py")
    p.add_argument("--areas", default="village", help="comma-separated: " + ",".join(AREAS))
    p.add_argument("--out", default=OUT_GLB)
    p.add_argument("--report", default=None, help="default: <out> with _report.json")
    p.add_argument("--no-bake", action="store_true", help="no Cycles bakes: flat ground and rocks, Meshy maps without roof snow")
    p.add_argument("--keep-blend", action="store_true", help="also save the export-ready scene as a .blend")
    p.add_argument("--tree-near-m", type=float, default=TREE_NEAR_M,
                   help="trees this close to the walk region get the near mesh (decision 3: 60); the rest the far one")
    p.add_argument("--blend-out", default=OUT_BLEND)
    p.add_argument("--verify", default=None, help="re-import this GLB into an empty scene and print what it holds")
    p.add_argument("--rooms", default="", help="comma-separated scene ids: append these first-person rooms "
                                                "(<rooms-dir>/<sceneId>.blend) at their ROOM_SLOTS slots")
    p.add_argument("--rooms-dir", default=ROOMS_DIR)
    p.add_argument("--base-blend", default=None, help="the short run: open this export-ready blend (a --keep-blend run's), "
                                                       "append --rooms, write the GLB and report; no village processing")
    p.add_argument("--max-lights", type=int, default=MAX_LIGHTS, help="real lights per area (the rest baked as pools)")
    p.add_argument("--tex-budget-mb", type=float, default=TEX_BUDGET_MB, help="texture memory (RGBA8 + mips) to fit under")
    p.add_argument("--draw-budget", type=int, default=DRAW_BUDGET, help="draw calls per area the instancing clusters may use")
    p.add_argument("--only-models", default="", help="smoke test: export only these Meshy models (trees, ground kept)")
    p.add_argument("--only-tiles", default="", help="smoke test: bake only these ground tiles (the rest flat)")
    p.add_argument("--gates", default=None, help="a gates data file (meshy_gates/undermere_gates.json): add the cave "
                                                 "gates' surface side (meshy_gates.py); without it nothing changes")
    p.add_argument("--gates-journey", default=None, help="with --gates: also write the walker's file (collision, "
                                                         "spawns and portals, no Draco) for a controller journey")
    a = p.parse_args(argv)
    if a.verify:
        verify(a.verify, a.report)
        return
    if a.report is None:
        a.report = os.path.splitext(a.out)[0] + "_report.json"
    X = Export(a)
    if a.base_blend:
        with X.step("base blend: load"):
            bpy.ops.wm.open_mainfile(filepath=os.path.abspath(a.base_blend), load_ui=False)
            st = bpy.context.scene.get("wdi_walk_state")
            if not st:
                raise SystemExit(f"{a.base_blend}: no wdi_walk_state (save it with a v1.2 --keep-blend run)")
            st = json.loads(st)
            # v1.2b (contract check 2026-11-15: the short run wrote this state, 470,059 characters, into the GLB's
            # scene extras): it is the blend's own, and leaves the scene before the export
            del bpy.context.scene["wdi_walk_state"]
            X.base_mode = True
            for k in ("areas", "spawns", "portals", "lights", "notes", "collision", "cat"):
                setattr(X, k, st.get(k) if st.get(k) is not None else getattr(X, k))
            X.tex_fit = st.get("tex_fit")
            X.near_meshes = set(st.get("near_meshes") or [])
            X.base_state = dict(bakes=st.get("bakes"), steps=st.get("steps"))
            for o in bpy.context.scene.objects:
                if o.name.startswith("Area_") and not o.name.startswith("Area_room_") and o.parent is None:
                    X.roots[o.name[len("Area_"):]] = o
            X.notes.append(f"short run on {a.base_blend} (its village as exported then)")
        rep = finalize(X)
        log("WALK_EXPORT_DONE", rep["file"], rep["MB"], "MB")
        return
    keys = [k.strip() for k in a.areas.split(",") if k.strip()]
    for k in keys:
        if k not in AREAS:
            raise SystemExit(f"unknown area {k}; known: {', '.join(AREAS)}")
        if AREAS[k].process is None:
            raise SystemExit(f"area {k} is listed (offset {AREAS[k].offset}) but its export is the v2 step")
    for i, k in enumerate(keys):
        A = AREAS[k]
        with X.step(f"{k}: load"):
            load_area(A, first=(i == 0))
        A.process(X, A)
    rep = finalize(X)
    log("WALK_EXPORT_DONE", rep["file"], rep["MB"], "MB")


if __name__ == "__main__":
    main()
