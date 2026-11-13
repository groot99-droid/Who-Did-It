"""HollowMere's outskirts: the rest of the town and the hills round the playable village, built from the 24 Meshy
models no village scene used (owner, 2026-11-12: "add the mill, hideout, and all other models"; none of them is for
BlackPine, every one goes to HollowMere, and the lettering stays as modelled: the bank's "BLACKPINE MINING CO. /
OFFICE & BANK", the mill's "VANE SAWMILL").

    blender -b --factory-startup -P tools/blender/meshy_village_build.py -- --save tools/blender/build/hollowmere_base.blend
        (the outskirts are on by default; `--no-outskirts` builds the village alone, exactly as before)

`meshy_village_build.py` uses this module at these hooks:
  1. `terrain_edits()`, before `build_terrain`: the earthworks (pads, mounds, tracks, the beck and its leat, the
     tailrace, the ravine head, the mill pond's basin, the crypt's knoll) go into `Map.sample`, which applies them
     outside the map rectangle only, and `shore_wander` moves the mere's shore beyond the map's east and west edges.
     The ground, the forest and every later `Map.height` see them; nothing inside the map changes.
  2. `FINE_ZONES`: 0.5 m and 1 m ground cells over the districts (the village grid is 4 m out there), and
     `ground_layer`, laid over HM_Ground's material: bare earth and rock on the steep ground outside the map only.
  3. `build_outskirts(mp, vb)`, after `build_forest`: clears the forest from 48 circles, places the models with the
     village's own `place`, settles the kegs, the ore cart and the ray gun on their hosts, lowers the ground under the
     broken trestle's own gully, re-snaps the trees standing on edited ground, builds the stone walls (the mill quay,
     the tailrace, the bank under the flume), lays the water (the mill pond, the beck and leat, the tailrace), adds the
     lights (the Dark Mass chapel's lights only the chapel), clears and sharpens the trees round the still cameras of
     `meshy_views/outskirts.json`, scatters rocks at the feet of the steep ground and in it, then prints a summary.
Review 2026-11-12 (the earthworks looked artificial; union_hall and trestle badly framed; the chapel's red read pink
on the snow; shards at the lens; faceted pines): see WALLS, BARE, ROCKS, SHORE, Knoll, _Natural, MASS_LIT,
VIEW_TREES and near_tree. Second review (2026-11-12; a second round of fixes, "round 2", 2026-11-13): the comments
marked so in BankRough, Pad, Knoll, Channel, the beck and its water, FINE_ZONES, UP_SOFT, ROCKS (skyline), ROCK_SET,
LANCET_GLOW, VIEW_TREES and VIEW_CLEAR.
`vb` is the running build module itself (passed in, not imported: run as a script it is `__main__`, and a second
import would make a second, empty set of collections).

The layout is the merged final spec of 2026-11-12. World metres, x east, y north, z up; the map rectangle is
x -48..48, y -36..36. Everything above the `Blender` section is plain Python and runs without Blender.
"""

from __future__ import annotations

import json
import math
import os

MAP_RECT = (-48.0, -36.0, 48.0, 36.0)  # x0, y0, x1, y1: the playable map, which the outskirts never touch
TREE_SINK = 0.2                         # build_forest's sink for its trees
TREE_MODELS = ("pine_tall", "pine_short", "dead_tree")

DISTRICTS = {  # key: (name, bounds x0, y0, x1, y1)
    "station_street": ("Station Street", (50.0, -18.9, 65.2, 38.6)),
    "railyard": ("Railyard", (47.8, 39.8, 69.9, 89.2)),
    "company_row": ("Company row", (64.7, 20.8, 89.0, 39.3)),
    "mill": ("Mill Lane and the Waterwheel Lumber Mill", (52.0, -34.5, 126.0, 2.5)),
    "east_hills": ("East hills: the Bandit's ridge and the old spur", (112.6, -18.6, 205.0, 48.4)),
    "up_the_line": ("Up the line", (30.9, 103.5, 42.9, 140.0)),
    "west_woods": ("West woods", (-109.4, -24.0, -50.2, 66.4)),
}

# Finer ground cells for `build_terrain`: (x0, x1, y0, y1, spacing in metres). A 4 m cell of the village grid that
# overlaps a zone is cut into cells of this size; its coarse neighbours are stitched to it without cracks.
FINE_ZONES = [
    (48.0, 130.0, -36.0, 8.0, 0.5),     # Station Street, Mill Lane, the mill, its quay and pond
    (46.0, 92.0, 18.0, 92.0, 0.5),      # the railyard and the Company row
    (140.0, 206.0, -22.0, 48.0, 0.5),   # the Bandit's ridge, the old spur, the ravine and its head
    (-66.0, -48.0, -24.0, -4.0, 0.5),   # the crypt knoll
    (126.0, 142.0, -16.0, 0.0, 0.5),    # added: the beck between the two eastern zones (x 130-138 was left at 4 m)
    (58.0, 92.0, 8.0, 18.0, 0.5),       # added: Station Street's row between the two 0.5 m zones (the bank's east half,
                                        # the courthouse's back and the row pad's east falloff were on 4 m cells)
    (30.0, 46.0, 100.0, 142.0, 1.0),    # up the line: the halt and the cutting face
    (-112.0, -48.0, -24.0, 70.0, 1.0),  # the west woods
    (-60.0, 4.0, 36.0, 62.0, 1.0),      # the gate road and the Mass path through the north belt
    (106.0, 142.0, 2.0, 28.0, 1.0),     # added: the outlaws' trail between the landing and the ridge (a 1.2 m path)
    # second review, round 2: the ravine's rock steps below the trestle, as the trestle still sees them. On 0.5 m cells
    # a riser (about 0.6 m across) took one row of cells, and where it ran aslant the grid its edge came out as a
    # saw-tooth
    (151.0, 183.0, -16.0, 16.0, 0.25),
    # and the bank under Mill Lane where it comes down to the quay (its brow ran aslant the grid as a comb of snow
    # teeth in mill_wide); it stops short of the quay's west wall (x 90, on a 4 m cell line)
    (80.0, 89.9, -30.0, -18.0, 0.25),
]


# ================================================================ the layout


def _p(key, model, district, x, y, rot, size, z, sink, lod, facing, foot, col="models", host=None):
    """One placement: place(mp, model, x, y, rot=rot, size=size, z=z, sink=sink, lod=lod, col=col); the base sits at
    z - sink (cliff_section and broken_trestle: z is the absolute base). `facing` (the stored front's compass
    direction after `rot`) and `foot` (world x by y extent, from the GLB vertices) are the spec's, for the summary.
    `host`: the model it rests on, found again by a ray cast after placing."""
    return dict(key=key, model=model, district=district, x=x, y=y, rot=rot, size=size, z=z, sink=sink, lod=lod,
                facing=facing, foot=foot, col=col, host=host)


PLACEMENTS = [
    # ---- Station Street: false fronts facing W over a 4 m street and the line (the rest of the Town Core)
    _p("post_office", "Frontier_Post_Office", "station_street", 59.25, -5.85, rot=270.0, size=9.5, z=0.12, sink=0.05, lod=0.7, facing="W", foot=(9.5, 7.4)),
    _p("lockup", "Frostbound_County_Jail", "station_street", 57.75, 4.08, rot=270.0, size=6.5, z=0.2, sink=0.05, lod=0.7, facing="W", foot=(6.5, 5.46)),
    _p("bank", "Blackpine_Mining_Office_Bank", "station_street", 58.675, 10.53, rot=270.0, size=8.35, z=0.2, sink=0.05, lod=0.7, facing="W", foot=(8.35, 6.64)),
    _p("courthouse", "Frontier_Detective_Bureau", "station_street", 59.75, 19.0, rot=270.0, size=10.5, z=0.2, sink=0.05, lod=0.7, facing="W", foot=(10.5, 9.5)),
    _p("lamp_station_st", "company_lamp_post", "station_street", 53.6, -0.4, rot=0.0, size=3.5, z=0.01, sink=0.0, lod=0.5, facing="none", foot=(0.71, 0.68)),
    _p("crates_express", "crates_barrels", "station_street", 55.4, -11.3, rot=90.0, size=1.8, z=0.02, sink=0.0, lod=0.5, facing="E", foot=(1.34, 1.8)),
    # ---- the railyard, east of the main line just north of the map
    _p("siding_south", "Frostbound_Rails", "railyard", 50.25, 48.5, rot=90.0, size=17.0, z=0.0, sink=0.65, lod=0.5, facing="none", foot=(4.74, 17.0)),
    _p("siding_mid", "Frostbound_Rails", "railyard", 50.25, 64.5, rot=90.0, size=17.0, z=0.0, sink=0.65, lod=0.5, facing="none", foot=(4.74, 17.0)),
    _p("siding_north", "Frostbound_Rails", "railyard", 50.25, 80.5, rot=90.0, size=17.0, z=0.0, sink=0.65, lod=0.5, facing="none", foot=(4.74, 17.0)),
    _p("freight_dock", "Frostbound_Freight_Dock", "railyard", 54.19, 61.0, rot=270.0, size=8.5, z=0.06, sink=0.4, lod=0.6, facing="W", foot=(5.38, 8.5)),
    _p("powder_kegs", "powder_kegs", "railyard", 53.69, 60.5, rot=90.0, size=1.4, z=1.26, sink=0.0, lod=0.5, facing="none", foot=(0.7, 1.4), host="freight_dock"),
    _p("ore_cart_dock", "ore_cart", "railyard", 51.99, 58.5, rot=90.0, size=1.7, z=0.21, sink=0.0, lod=0.5, facing="S", foot=(0.8, 1.7), host="freight_dock"),
    _p("crates_dock", "crates_barrels", "railyard", 57.9, 63.6, rot=0.0, size=1.8, z=0.06, sink=0.0, lod=0.5, facing="S", foot=(1.8, 1.34)),
    _p("smithy", "The_Winter_Forge", "railyard", 56.35, 45.2, rot=0.0, size=6.3, z=0.06, sink=0.05, lod=0.7, facing="S", foot=(6.3, 5.97)),
    _p("shift_bell", "shift_bell_post", "railyard", 66.0, 35.6, rot=0.0, size=3.5, z=0.76, sink=0.0, lod=0.6, facing="S", foot=(2.63, 1.9)),
    _p("bunkhouse", "Blackpine_Bunkhouse", "railyard", 61.0, 73.5, rot=0.0, size=14.25, z=0.6, sink=0.05, lod=0.6, facing="S", foot=(14.25, 6.32)),
    _p("wood_bunkhouse", "wood_stack", "railyard", 66.8, 69.3, rot=0.0, size=2.2, z=0.6, sink=0.0, lod=0.5, facing="S", foot=(2.2, 1.15)),
    # ---- the Company row: the Union Hall behind Station Street, turned to face N onto the hall lane
    _p("union_hall", "Frostbound_Union_Hall", "company_row", 80.0, 28.0, rot=180.0, size=17.5, z=3.0, sink=0.05, lod=0.6, facing="N", foot=(17.5, 13.93)),
    _p("strike_board", "notice_board_2", "company_row", 74.3, 33.2, rot=270.0, size=2.6, z=3.0, sink=0.0, lod=0.6, facing="W", foot=(1.18, 2.43)),
    # ---- Mill Lane and the Waterwheel Lumber Mill on the east shore
    _p("sawmill", "Frostwood_Sawmill", "mill", 97.65, -25.48, rot=0.0, size=10.75, z=-0.6, sink=0.0, lod=0.5, facing="S", foot=(10.75, 10.36)),
    _p("race_wall", "cliff_section", "mill", 95.7, -20.45, rot=0.0, size=10.2, z=-1.79, sink=0.0, lod=0.4, facing="S", foot=(10.2, 1.7)),
    _p("landing", "log_pond_landing", "mill", 103.0, -4.4, rot=0.0, size=12.25, z=3.1, sink=0.05, lod=0.4, facing="S", foot=(8.73, 12.25)),
    _p("log_chute", "log_chute", "mill", 119.75, -14.2, rot=0.0, size=11.5, z=4.5, sink=0.05, lod=0.4, facing="W", foot=(11.5, 3.67)),
    _p("wood_mill", "wood_stack", "mill", 91.2, -28.0, rot=90.0, size=2.2, z=-0.6, sink=0.0, lod=0.3, facing="E", foot=(1.15, 2.2)),
    _p("crates_mill", "crates_barrels", "mill", 93.5, -31.4, rot=0.0, size=1.8, z=-0.6, sink=0.0, lod=0.3, facing="S", foot=(1.8, 1.34)),
    # ---- the east hills: THE HIDEOUT on the spur, the old spur's broken trestle and the ravine head
    _p("hideout", "Frostbound_Outpost", "east_hills", 166.0, 32.0, rot=160.0, size=17.0, z=16.5, sink=0.15, lod=0.4, facing="NNE", foot=(17.0, 15.39)),
    _p("ray_gun", "Error_Deletion_Ray", "east_hills", 165.47, 33.47, rot=205.0, size=0.75, z=20.39, sink=0.0, lod=0.1, facing="ENE", foot=(0.72, 0.43), host="hideout"),
    _p("crag", "cliff_section", "east_hills", 155.3, 31.5, rot=270.0, size=9.0, z=12.27, sink=0.0, lod=0.3, facing="W", foot=(1.5, 9.0)),
    _p("pine_n", "pine_tall", "east_hills", 163.0, 44.0, rot=40.0, size=15.4, z=15.8, sink=0.2, lod=0.08, facing="none", foot=(7.51, 8.47), col="forest"),
    _p("pine_e", "pine_tall", "east_hills", 177.0, 38.5, rot=150.0, size=16.8, z=19.26, sink=0.2, lod=0.08, facing="none", foot=(9.42, 8.26), col="forest"),
    _p("pine_se", "pine_tall", "east_hills", 175.0, 23.0, rot=260.0, size=14.7, z=17.9, sink=0.2, lod=0.08, facing="none", foot=(7.53, 8.46), col="forest"),
    _p("pine_sw", "pine_tall", "east_hills", 160.5, 20.5, rot=310.0, size=16.1, z=15.05, sink=0.2, lod=0.08, facing="none", foot=(8.86, 7.85), col="forest"),
    _p("trestle", "broken_trestle", "east_hills", 188.0, 0.0, rot=274.0, size=32.0, z=9.7, sink=0.0, lod=0.4, facing="W", foot=(13.19, 32.1)),
    _p("headwall", "cliff_section", "east_hills", 196.3, 0.55, rot=274.0, size=14.0, z=10.8, sink=0.0, lod=0.4, facing="W", foot=(3.04, 14.0)),
    # added (review, 2026-11-12): the headwall's rock carried on either side, its face in line with the headwall's and
    # 0.4 m over its ends, rock top 17.2-17.7 (the headwall's 16.9-17.5): it faces the step left between the ravine's
    # walls and the plateau beyond the headwall's ends (5.5 m at the ends, nothing 5.5 m out; see Headcut), which in the
    # first build was snow standing at up to 5.8:1. Its outer half lies buried in the ravine's wall.
    _p("headwall_n", "cliff_section", "east_hills", 195.31, 13.61, rot=274.0, size=13.0, z=11.5, sink=0.0, lod=0.4, facing="W", foot=(2.82, 13.0)),
    _p("headwall_s", "cliff_section", "east_hills", 197.14, -12.52, rot=274.0, size=13.0, z=11.5, sink=0.0, lod=0.4, facing="W", foot=(2.82, 13.0)),
    # ---- up the line: the halt and water stop on the cutting floor, and the blasted face of the cutting
    _p("waystation", "Frostbound_Waystation", "up_the_line", 39.1, 110.0, rot=90.0, size=12.5, z=0.05, sink=0.05, lod=0.4, facing="E", foot=(7.21, 12.5)),
    _p("cutting_face", "cliff_section", "up_the_line", 31.43, 136.5, rot=90.0, size=6.5, z=0.3, sink=0.0, lod=0.3, facing="E", foot=(1.08, 6.5)),
    _p("fallen_rock", "boulder_set", "up_the_line", 33.9, 134.3, rot=35.0, size=2.2, z=0.45, sink=0.25, lod=0.3, facing="none", foot=(2.1, 2.36)),
    # ---- the west woods
    _p("crypt", "Frozen_Crypt_of_Bones", "west_woods", -56.6, -11.4, rot=180.0, size=7.75, z=-0.07, sink=0.8, lod=0.6, facing="N", foot=(7.75, 4.31)),
    _p("trapper", "Frosted_Hearth_Cabin", "west_woods", -85.5, -17.0, rot=90.0, size=9.25, z=0.45, sink=0.05, lod=0.5, facing="E", foot=(7.82, 9.25)),
    _p("wood_trapper", "wood_stack", "west_woods", -87.0, -11.0, rot=180.0, size=2.2, z=0.45, sink=0.0, lod=0.4, facing="N", foot=(2.2, 1.15)),
    _p("hermit", "Frostwood_Witch_Hut", "west_woods", -84.0, 60.0, rot=0.0, size=10.75, z=1.0, sink=1.6, lod=0.4, facing="S", foot=(10.73, 10.75)),
    _p("hollow_log", "hollow_log", "west_woods", -89.8, 54.0, rot=20.0, size=3.0, z=1.0, sink=0.15, lod=0.3, facing="ENE", foot=(2.93, 1.91)),
    _p("dark_mass_chapel", "Frostgrave_Chapel", "west_woods", -100.0, 32.0, rot=70.5, size=13.0, z=2.3, sink=0.8, lod=0.4, facing="ESE", foot=(12.94, 12.69)),
]

# Models only the outskirts use whose closest camera distance in the fly-through is 50 m or more: their maps are
# halved once more (1K as the village leaves them, to 512) to spare the laptop's shared graphics memory.
TEX_FAR = ("Frostbound_Rails", "Frostbound_Freight_Dock", "powder_kegs", "The_Winter_Forge", "shift_bell_post",
           "Frostbound_Union_Hall", "notice_board_2", "Blackpine_Bunkhouse", "log_pond_landing", "log_chute",
           "Error_Deletion_Ray", "broken_trestle", "Frostbound_Waystation")
# The owner asked to see the mill and the Bandit's hideout up close: they keep a 2K base colour, as the village's
# hero models do (its VANE SAWMILL board must read), and the hideout is not slimmed to 512.
HERO = ("Frostwood_Sawmill", "Frostbound_Outpost")


def _rect(x0, y0, x1, y1):
    return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]


POND = [[100.0, -19.2], [101.3, -19.2], [101.3, -21.7], [102.95, -21.7], [102.95, -19.2], [104.5, -19.2], [108.5, -18.5],
        [112.5, -16.5], [114.0, -13.0], [113.8, -10.9], [111.0, -11.0], [106.0, -11.2], [101.0, -11.0], [100.0, -13.0],
        [99.8, -16.0]]

# Earthworks, applied in this order by Map.sample (outside the map only). Kinds:
#   pad      set the ground to level_m inside the polygon, smoothstep back to the ground over falloff_m outside it
#            (edge_falloff_m: one falloff per edge, edge i from point i to i + 1; 0 = a vertical cut; wobble and
#            rough_m make the falloff's foot wander and its face lumpy, see _Natural)
#   mound    raise only: a polygon, or a ridge along a 2-point line of width_m; falloff as a pad
#   track    a polyline: points [x, y, z] shape the ground to z across width_m (blending back over 1 m); points
#            [x, y] follow the ground; `ground` paints a map letter (p trodden path, m rutted mud = the map's d)
#   channel  lower only: points [x, y, floor z(, floor width, side run per 1 m rise)], interpolated along the line;
#            without the last two, width_m and vertical sides
#   headcut  the ravine head behind the headwall cliff (see Headcut)
#   basin    lower only, inside the polygon: bed level_m, an inner ramp of falloff_m up to edge_level_m at the edge
#   knoll    raise only: a rounded, lumpy hill with a notch cut back for a model's door (see Knoll)
#   shore    lumps on the mere's bank outside the map (see ShoreRough)
#   clamp    after the trestle is placed: the ground inside the outline goes 0.3 m below the model's underside
# clip_m (any kind): [x0, y0, x1, y1], the edit applies only inside this box.
TERRAIN = [
    # ---- the mere's bank beyond the map's east and west edges: lumpy, before anything is built on it
    dict(key="shore_rough", kind="shore", rough_m=0.9, box_m=[-242.0, -40.0, 242.0, -14.0], east_freq=(0.13, 2)),
    # the bank east of the mill: broad lumps on its face and brow (the shore's headlands and bays: SHORE["east"])
    dict(key="bank_rough", kind="bank", rough_m=2.0, freq=0.075, x_m=[105.5, 109.0], y_m=[-18.5, -34.0], water_m=-1.9),
    # and west of the quay, between the map's edge and the mill (it read as an even pale bevel, like a kerb, from the air)
    dict(key="bank_rough_w", kind="bank", rough_m=1.4, freq=0.09, x_m=[52.0, 58.0], x_end_m=[85.0, 89.0], y_m=[-19.0, -34.0],
         water_m=-1.9),
    # ---- pads
    dict(key="pad_post_office", kind="pad", points_m=_rect(54.3, -9.75, 64.2, -1.95), level_m=0.12, falloff_m=1.5),
    dict(key="pad_street_row", kind="pad", points_m=_rect(54.3, 1.15, 65.2, 23.95), level_m=0.2, falloff_m=2.0),  # lock-up, bank, courthouse
    dict(key="pad_siding", kind="pad", points_m=_rect(47.8, 39.8, 52.7, 89.2), level_m=0.0, falloff_m=1.0),
    dict(key="pad_yard", kind="pad", points_m=_rect(52.8, 42.0, 60.0, 65.6), level_m=0.06, falloff_m=1.0),  # smithy, dock, crates
    dict(key="pad_bunkhouse", kind="pad", points_m=_rect(53.6, 68.0, 68.4, 76.9), level_m=0.6, falloff_m=2.5, wobble=0.4),
    dict(key="pad_union_hall", kind="pad", points_m=_rect(71.0, 20.8, 89.0, 35.2), level_m=3.0, falloff_m=3.0, wobble=0.5, rough_m=0.35,
         crest_m=1.6, drift_m=0.55, drift_box_m=[[64.0, 18.0, 72.5, 37.0], [81.5, 33.0, 92.0, 40.0]]),  # not on the hall lane
    # the mill quay (review 2026-11-12: it read as a cake slab): a stone quay, its water faces and the tailrace's sides
    # walled in stone (WALLS "quay", "flume_bank"), so those edges have no falloff and lie half a cell (0.25 m) inside
    # the wall faces, which stand on lines of the 0.5 m ground grid: the ground's drop between the last cell inside and
    # the first outside is then all behind the wall. No falloff under the race wall's face (y -21.3, x 90.3-100.75);
    # the west edge keeps its 1.5 m falloff north of y -27.25, where Mill Lane comes down onto the quay.
    dict(key="pad_mill_quay", kind="pad", points_m=[[90.25, -32.25], [104.75, -32.25], [104.75, -22.25], [100.75, -22.25], [100.75, -21.3],
                                                    [90.25, -21.3], [90.25, -27.25]],
         level_m=-0.6, falloff_m=1.5, edge_falloff_m=[0.0, 0.0, 0.0, 0.0, 0.0, 1.5, 0.0]),
    dict(key="pad_landing", kind="pad", points_m=_rect(98.1, -10.6, 107.9, 2.2), level_m=3.1, falloff_m=2.0, wobble=0.4, rough_m=0.25),
    dict(key="pad_chute", kind="pad", points_m=_rect(113.6, -16.5, 126.0, -11.9), level_m=4.5, falloff_m=2.0, wobble=0.4, rough_m=0.25),
    dict(key="pad_flume_sill", kind="pad", points_m=_rect(100.8, -21.8, 103.4, -20.3), level_m=2.4, falloff_m=0.0),
    # the hideout's terrace, r 9 m round (166, 32): falloff 0.5 on the two west edges, where the crag retains the fill
    dict(key="pad_hideout_terrace", kind="pad",
         points_m=[[175.0, 32.0], [173.79, 36.5], [170.5, 39.79], [166.0, 41.0], [161.5, 39.79], [158.21, 36.5], [157.0, 32.0],
                   [158.21, 27.5], [161.5, 24.21], [166.0, 23.0], [170.5, 24.21], [173.79, 27.5]],
         level_m=16.5, falloff_m=2.5, edge_falloff_m=[2.5, 2.5, 2.5, 2.5, 2.5, 0.5, 0.5, 2.5, 2.5, 2.5, 2.5, 2.5], wobble=0.4, rough_m=0.3),
    dict(key="pad_waystation", kind="pad", points_m=_rect(35.3, 103.55, 42.75, 116.45), level_m=0.05, falloff_m=1.5),
    dict(key="pad_cutting_foot", kind="pad", points_m=_rect(31.97, 133.0, 35.6, 140.0), level_m=0.45, falloff_m=1.5,
         edge_falloff_m=[1.5, 1.5, 1.5, 0.0]),  # no falloff on the west edge: the cliff face
    dict(key="pad_trapper", kind="pad", points_m=_rect(-89.6, -21.85, -81.4, -10.0), level_m=0.45, falloff_m=2.0, wobble=0.4, rough_m=0.15),
    dict(key="pad_hermit", kind="pad", points_m=_rect(-90.4, 53.6, -77.6, 66.4), level_m=1.0, falloff_m=2.0, wobble=0.4, rough_m=0.15),
    dict(key="pad_dark_mass_chapel", kind="pad", points_m=[[-95.2, 23.09], [-90.66, 35.91], [-104.8, 40.91], [-109.34, 28.09]],
         level_m=2.3, falloff_m=2.5, wobble=0.4, rough_m=0.25),
    # ---- mounds (raise only)
    dict(key="mill_dam", kind="mound", points_m=[[99.3, -19.6], [99.3, -10.4]], level_m=3.0, falloff_m=1.5, width_m=1.6, wobble=0.3, rough_m=0.2),
    # (clipped at the race wall's face, y -21.3, so its falloff does not lift the quay at the foot of the wall)
    dict(key="racewall_back", kind="mound", points_m=_rect(90.3, -19.6, 101.0, -18.8), level_m=3.0, falloff_m=2.0, wobble=0.3, rough_m=0.2,
         clip_m=[-1.0e9, -21.3, 1.0e9, 1.0e9]),
    # the crypt knoll (review 2026-11-12: it was an L of flat-topped slab, two smooth white domes beside the door; second
    # review: two piles beside the door, no hill behind the crypt from the still's eye): a rocky knoll over the crypt,
    # its crown a wandering ridge across the crypt's width 2.6 m behind its back wall and 5.5-6 m high (the crypt's
    # top is 3.9), standing over the crypt's roof as the still's eye sees it; its rounded flanks hold the crypt's sides
    # (0.9 m at the front corners to 3 m at the back), rising into the crown; its crag over the shore in rock steps
    # with snow on their ledges; cut back for the door (the approach widening
    # northwards) and inside the crypt's own walls (its footprint x -60.48..-52.72, y -13.56..-9.25, inset 0.35 m at
    # the sides and 1 m at the back), never past x -50.2 (the map's edge is x -48) nor onto the shore trail (y -19.8
    # and south at x -55: the knoll's south face is a crag over the shore)
    # (second review, round 2: one hill now, but a smooth dome of snow from the still's eye, its west shoulder coming
    # forward beside the door as a tent with a dark cut face, and black rocks perched on it. Now the hill reaches 7 m
    # north of its crown, not 11, so nothing of it stands in front of the facade but the crypt's own low flanks (0.6 m
    # at the front corners, 3 m at the back, within 3 m of its walls); the cut beside the door ramps over 3 m; humps and
    # a saddle along the upper hill, crown_rough_m; no outcrops on its front (ROCKS no_crop_m), a boulder at the west
    # flank's foot (ROCK_SET))
    dict(key="crypt_knoll", kind="knoll", crown_m=[[-60.5, -16.2], [-54.6, -16.2]], radii_m=[6.6, 4.4, 3.8, 7.0], rise_m=6.0,
         power=1.3, rough_m=0.4, rough2_m=1.0, crown_wander_m=0.8, crown_rough_m=1.6, crown_freq=0.3, terrace_m=1.5,
         ledge=0.5, terrace_south=True,
         cap_m=_rect(-61.1, -14.2, -52.1, -9.25), cap_rise_m=3.3, cap_slope=1.5,
         flank_m=3.0, flank_rise_m=[0.6, 3.0], inside_m=_rect(-60.13, -12.55, -53.07, -9.6),
         approach_m=[[-60.13, -9.6], [-53.07, -9.6], [-50.5, -5.0], [-62.8, -5.0]], wall_m=3.0, x_max_m=-50.2),
    # ---- tracks
    dict(key="gate_road", kind="track", points_m=[[0.75, 36.0], [0.75, 60.0]], width_m=3.5, ground="p"),
    dict(key="station_street", kind="track", width_m=4.0, ground="p",
         points_m=[[48.0, -18.75, 0.0], [50.5, -18.4, 0.0], [52.0, -16.0, 0.0], [52.0, 30.0, 0.0], [53.5, 34.5, 0.0], [57.0, 38.0, 0.06],
                   [62.5, 40.5, 0.35], [62.5, 50.0, 0.4], [62.5, 60.0, 0.6], [62.5, 69.5, 0.6]]),
    dict(key="hall_lane", kind="track", points_m=[[62.5, 38.5], [72.0, 37.8], [80.5, 37.6]], width_m=3.0, ground="p"),
    # (second review: as rutted mud, the map's d, its patchy snow read as high-contrast camouflage blotches in the
    # mill_wide still; the Mill Lane and the landing spur are trodden lanes now, as Station Street and the hall lane)
    # (second review, round 2: where it comes down to the quay its trodden edge, running aslant the grid along the
    # bank's brow, read with the brow as a comb of snow teeth in the mill_wide still: a 1.2 m wide feather, and finer
    # ground there, FINE_ZONES)
    dict(key="mill_lane", kind="track", width_m=4.0, ground="p", feather_m=0.6,
         points_m=[[52.0, -16.5, 0.0], [62.0, -16.0, 0.17], [72.0, -15.5, 0.55], [80.0, -16.5, 0.92], [85.5, -20.0, 0.9], [89.0, -23.0, -0.3],
                   [91.0, -24.5, -0.6]]),
    dict(key="landing_spur", kind="track", points_m=[[80.0, -16.5, 0.92], [90.0, -12.0, 1.6], [97.0, -6.0, 2.75], [98.5, -4.0, 3.1]],
         width_m=3.0, ground="p"),
    dict(key="outlaws_trail", kind="track", width_m=1.2, ground="p",
         points_m=[[103.0, 1.5], [112.0, 6.0], [121.0, 13.0], [128.5, 19.0], [139.0, 23.5], [148.0, 32.0], [156.0, 40.0], [163.0, 42.0],
                   [168.2, 38.5]]),
    dict(key="spur_bed_north", kind="track", width_m=3.0,
         points_m=[[186.88, 15.96, 20.9], [185.4, 22.0, 20.9], [184.7, 27.0, 20.9], [185.1, 32.0, 20.9], [184.6, 38.0, 20.9], [184.4, 44.0, 20.7]]),
    dict(key="spur_bed_south", kind="track", points_m=[[189.12, -15.96, 20.9], [189.6, -18.6, 20.9]], width_m=3.0),
    dict(key="mass_path", kind="track", width_m=2.0, ground="p",
         points_m=[[0.75, 52.0], [-6.0, 53.5], [-20.0, 56.0], [-38.0, 57.0], [-56.0, 53.0], [-70.0, 45.0], [-80.0, 37.5], [-88.0, 30.5],
                   [-93.16, 29.15]]),
    dict(key="hermit_spur", kind="track", points_m=[[-70.0, 45.0], [-80.0, 52.0], [-84.0, 54.4]], width_m=1.5, ground="p"),
    dict(key="crypt_step", kind="track", points_m=[[-50.9, -6.6], [-53.0, -8.0], [-54.7, -8.6]], width_m=1.6, ground="p"),
    dict(key="shore_trail", kind="track", points_m=[[-50.9, -17.8], [-55.0, -20.6], [-66.0, -21.0], [-76.0, -20.2], [-81.0, -18.0]],
         width_m=1.6, ground="p"),
    # ---- channels (lower only): the beck from the ravine head under the trestle down to a weir at (142, -11), then
    # the leat along the slope and a cascade into the pond's NE corner; then the tailrace from the wheel pit to the mere
    # (review 2026-11-12: below the trestle the ravine's walls are steeper, 0.7-0.9 m out per metre of rise where they
    # were 1-1.5, lumpy by up to 0.6 m west of the trestle's own chunk of gully, their top edge rounded over 1.6 m)
    # (second review: from the still's eye on the ravine floor they still read as smooth half-pipes of snow, so between
    # x 151 and 182 they rise in rock steps with snowy ledges, Channel.terrace_m, 0.55-0.6 m out per metre on average
    # below x 172, lumpy by 0.3 m only (more made blobs of the steps), and their rim is rounded over 0.4 m only)
    # (second review, round 2: the groove, seen end-on from the trestle still's eye with the stream in it, read as a
    # black post at the bottom of the frame: the beck now rises from under the snow at x 171, below that frame, and its
    # groove fades out between x 168 and 173, so the ravine's floor under the wreck is level snow)
    # (second review, round 2, with the ravine on 0.25 m cells: the steps took 0.75 of their height, the walls lumpier
    # by 0.5 m and their rim rounded over 0.9 m, else they read as a quarry's regular terraces)
    dict(key="beck", kind="channel", width_m=1.2, rough_m=0.6, crest_m=1.6, rough_box_m=[108.0, -30.0, 177.0, 30.0],
         groove_m=0.35, groove_half_m=0.75, groove_fade_x_m=[168.0, 173.0], terrace_m=2.4, ledge=0.55,
         terrace_box_m=[151.0, -30.0, 182.0, 30.0], terrace_crest_m=0.9, terrace_rough_m=0.5, terrace_strength=0.75,
         points_m=[
        [195.0, 0.5, 10.8, 12.0, 1.0], [181.5, -0.45, 10.5, 12.0, 1.0], [178.0, -0.3, 10.35, 10.0, 1.0], [174.0, -0.1, 10.15, 8.0, 0.75],
        [170.0, 0.0, 9.95, 6.0, 0.6], [166.0, -0.5, 9.75, 4.5, 0.55], [162.0, -1.5, 9.5, 3.5, 0.55], [158.0, -3.5, 9.25, 2.8, 0.6],
        [154.0, -6.5, 8.95, 2.2, 0.7], [150.0, -9.0, 8.6, 1.6, 0.9], [146.0, -10.5, 8.25, 1.2, 1.2], [142.0, -11.0, 7.9, 1.2, 1.5],
        [138.0, -9.6, 7.45, 1.2, 1.5], [134.0, -8.4, 7.2, 1.2, 1.5], [130.0, -7.4, 6.95, 1.2, 1.5], [126.0, -6.6, 6.6, 1.2, 1.5],
        [122.0, -6.1, 5.85, 1.2, 1.5], [118.0, -6.0, 4.95, 1.2, 1.5], [115.0, -6.6, 4.35, 1.2, 1.5], [113.4, -8.2, 4.0, 1.2, 1.5],
        [112.9, -10.0, 3.2, 1.2, 1.5], [112.6, -11.4, 1.9, 1.2, 1.5]]),
    # (its sides on grid lines, x 101.5 and 103.0, the faces of its stone walls; it starts under the wheel)
    dict(key="tailrace", kind="channel", width_m=1.5,
         points_m=[[102.25, -24.0, -1.35], [102.25, -28.0, -1.8], [102.25, -31.5, -2.2], [102.25, -34.0, -2.6]]),
    # ---- the ravine head behind the headwall (the spec's box x 195.6-205, y -7..8; see Headcut for the continuation).
    # face_half_m: the rock face's half-length, the headwall's 7 m and a wing slab's 13 m less their 0.4 m overlap
    dict(key="headcut", kind="headcut", points_m=_rect(195.6, -7.0, 205.0, 8.0), level_m=17.4, x_rise_m=196.6, slope=1.0,
         channel="beck", wall_y_m=0.55, wall_half_m=7.0, edge_m=1.5, blend_m=1.2, side_slope=0.0, reach_m=41.0,
         head_x_m=195.75, face_tilt=0.07, face_half_m=19.6),
    # ---- the mill pond's basin (inside the water polygon only)
    dict(key="pond_basin", kind="basin", points_m=POND, level_m=1.7, falloff_m=1.5, edge_level_m=2.7),
    # ---- the broken trestle's own gully: applied in Blender after the trestle is placed (the chunk + 1 m)
    dict(key="trestle_clamp", kind="clamp", points_m=[[179.31, 16.43], [181.68, -17.48], [196.69, -16.43], [194.32, 17.48]],
         model="trestle", below_m=0.3),
]

# Water. pond: open dark water (the mere's own material) in the polygon, with an ice rim along the north and west
# banks (open at the flume intake bay, under the chute's spill and at the beck's cascade) and a few logs by the
# landing. ribbon: a strip along points [x, y, surface z]; the beck's has icy, snowy edges sloping down to the channel
# floor and a dark open thread in the middle, frozen where it falls steeply (the cascade's spray).
WATER = [
    dict(key="pond", kind="pond", what="Vane mill pond", points_m=POND, level_m=2.6,
         ice_rim=[[110.5, -11.02], [106.0, -11.2], [101.0, -11.0], [100.0, -13.0], [99.8, -16.0], [99.92, -18.4]], rim_m=(1.0, 2.0),
         logs=[(102.6, -12.3, 12.0, 4.0, 0.21), (105.2, -12.9, -9.0, 3.6, 0.19), (103.9, -13.8, 25.0, 4.4, 0.23)]),  # x, y, yaw, length, r
    # (review 2026-11-12: the new trestle still looks up the ravine at its source, so the ribbon dips 0.3 m under the
    # bed there and its first 3 m are frozen)
    # its widths vary by up to 40 % and its open thread wanders 0.1 m across the bed, some stretches frozen over, and
    # it lies 0.32 m lower than the table, in the beck's 0.35 m groove under the snow banks of its bed (it read as a
    # raised plank of dark water between straight white edges)
    # (second review: seen end-on at the trestle still's lens its open thread read as a black post; it is frozen over
    # from 7 to 19 m below its source, the stretch nearest that eye, and runs open only further up toward the wreck)
    # (second review, round 2: frozen or open, the strip still read as a post seen end-on there: it now rises at x 171,
    # just below the trestle still's frame (whose foot meets the floor at x 172), frozen for its first 3 m and from 6
    # to 12 m)
    dict(key="beck_water", kind="ribbon", what="the beck and the mill leat", channel="beck", width_m=1.1, open_m=0.55,
         frozen_start_m=3.0, start_dip_m=0.3, frozen_slope=0.3, level_m=2.6, wander=(0.4, 0.10), level_drop_m=0.32,
         frozen_runs_m=[[6.0, 12.0]],
         points_m=[[171.0, -0.03, 10.2], [170.0, 0.0, 10.15], [166.0, -0.5, 9.95], [162.0, -1.5, 9.7], [158.0, -3.5, 9.45],
                   [154.0, -6.5, 9.15], [150.0, -9.0, 8.85], [146.0, -10.5, 8.5], [142.0, -11.0, 8.15], [138.0, -9.6, 7.7], [134.0, -8.4, 7.45],
                   [130.0, -7.4, 7.2], [126.0, -6.6, 6.85], [122.0, -6.1, 6.1], [118.0, -6.0, 5.2], [115.0, -6.6, 4.6], [113.4, -8.2, 4.25],
                   [112.9, -10.0, 3.45], [112.6, -11.4, 2.6]]),
    # the tailrace's last point dives 3 cm under the mere plane (-1.9) so the two never fight for the same depth
    dict(key="tail_water", kind="ribbon", what="tailrace into the mere", channel=None, width_m=2.2, open_m=2.2, end_dip_m=0.03,
         frozen_start_m=0.0, frozen_slope=99.0, level_m=-1.9,
         points_m=[[102.25, -24.3, -0.9], [102.25, -28.0, -1.4], [102.25, -31.5, -1.85], [102.25, -34.0, -1.9]]),
]

# Forest trees whose trunks (object origins) lie in these circles (x, y, r) and outside the map are removed after
# build_forest: 164 of its 884 trees with RNG 1893, none inside the map.
CLEAR_TREES = [
    (57.64, 30.51, 18.41), (82.77, 30.25, 10.74), (58.23, 5.98, 9.91), (58.56, 70.73, 9.57), (89.52, -19.8, 14.85),
    (-86.05, 60.7, 10.31), (76.45, -11.34, 6.53), (56.82, 56.17, 11.33), (187.95, -1.23, 18.42), (-91.21, 35.96, 6.23),
    (-85.75, -14.78, 7.17), (-54.01, -5.26, 4.75), (83.35, 2.73, 6.34), (-59.99, 13.97, 3.09), (-62.34, 49.66, 3.13),
    (62.55, -17.15, 8.83), (68.51, 78.2, 3.35), (-89.65, 26.73, 4.04), (-76.44, 66.48, 1.21), (-76.44, 19.75, 2.02),
    (-76.05, 41.17, 1.96), (-55.74, 51.94, 2.19), (78.93, 18.95, 4.15), (-55.01, -13.44, 4.26), (103.32, 0.9, 9.1),
    (133.58, 12.89, 11.93), (34.29, 117.27, 9.71), (-34.36, 58.19, 0.8), (73.45, 1.24, 0.8), (-20.74, 55.68, 0.8),
    (-10.11, 53.78, 0.8), (-73.53, 49.0, 0.8), (-30.07, 56.13, 0.8), (-73.58, -15.81, 0.8), (-64.39, 19.57, 0.8),
    (-52.01, 17.85, 0.8), (90.32, 38.25, 0.8), (-51.32, -19.54, 0.8), (-36.12, 55.45, 0.8), (-66.14, 45.53, 0.8),
    (67.97, 66.41, 0.8), (115.26, -17.18, 0.8), (-101.21, 22.4, 0.8), (193.47, 18.46, 0.8), (183.04, 45.56, 0.8),
    (149.21, -9.06, 0.8), (120.45, -18.43, 0.8), (160.66, 37.93, 0.8),
]
CLEAR_EXPECTED = 164


def _l(key, kind, x, y, above, z, gain=1.0, auto=False):
    """A light at world (x, y), `above` metres over the finished ground, absolute height `z`. `gain` multiplies the
    look's energy for its kind (wdi_gain); `auto`: added by place() from its model's LAMPS entry, listed for the count."""
    return dict(key=key, kind=kind, x=x, y=y, above=above, z=z, gain=gain, auto=auto)


LIGHTS = [
    _l("post_office_telegraph", "window", 55.3, -4.45, 1.6, 1.72),      # the telegraph room, lit all night, across from the platform
    _l("lockup_door", "lamp", 54.7, 4.08, 1.74, 1.90),                  # the lock-up's door lamp under its porch
    _l("courthouse_bureau", "window", 56.3, 17.4, 1.7, 1.90),           # a lamp burning in the Detective's bureau
    # the forge glow over the hearth under the north chimney: 0.3 m above the fire bed's top (1.31-1.39), in front of
    # the chimney hood (its underside at 2.27). The spec's (56.35, 47.45, 1.21) lies inside the hearth block, between
    # its faces at 1.16 and 1.33, where the shadowed fire light could not get out of the forge.
    _l("smithy_hearth", "fire", 56.35, 47.2, 1.55, 1.61),
    _l("shift_bell_lantern", "lamp", 65.05, 35.1, 1.79, 2.56),          # the lantern on the bell post's south side
    _l("bunkhouse_window", "window", 63.0, 71.35, 1.35, 1.95),          # the bunkhouse is lived in
    _l("union_hall_notch", "window", 77.1, 32.6, 4.95, 7.95, gain=1.35),  # the strike meeting; it also lights the notices
    _l("union_hall_west", "window", 71.05, 25.5, 4.95, 7.95),           # the meeting, toward the line and the town
    # (second review: the union_hall still's left wing was all in shadow) a lamp in the north wing's ground floor
    _l("union_hall_wing", "window", 83.8, 35.8, 1.7, 4.70, gain=0.6),
    _l("landing_lantern", "lamp", 103.8, -5.0, 2.15, 5.25),             # the pond keeper's lantern: the mill's warm point
    _l("waystation_window", "window", 41.05, 112.5, 1.85, 1.90),        # a lone warm light up the line
    _l("hideout_tower", "lamp", 162.51, 32.95, 9.15, 25.65, gain=0.4),  # THE hideout's one dim lamp, under the tower roof
    # (second review: the trestle still was the darkest, its timbers lost) the warning lamps on the broken trestle's two
    # posts, burning over the gap: just under and in front of each lantern (the model's lanterns at (188.55, 8.25,
    # 23.6) and (184.57, -13.39, 24.77)), so the lantern's own frame does not shade them (second review, round 2:
    # at 1.2 they left the deck stubs dark; 3, a lantern's worth)
    _l("trestle_lamp_n", "lamp", 188.1, 8.25, 2.3, 23.20, gain=3.0),
    _l("trestle_lamp_s", "lamp", 184.15, -13.35, 3.5, 24.35, gain=3.0),
    _l("dark_mass_lancets", "mass", -94.26, 27.53, 1.8, 4.10),          # the Dark Mass chapel's red lancets at its door
    _l("trapper_windows", "window", -82.85, -18.0, 1.35, 1.80),         # the far warm light at the end of the shore
    # (second review: the crypt's north facade, away from the moon, read near-black) a candle-lamp burning in the arch,
    # in front of its two hanging lanterns (at y -11.3 and -12.5), lighting the stair, the bones and the doors' edges
    _l("crypt_arch", "lamp", -58.55, -10.45, 2.05, 2.00, gain=0.35),
    _l("hermit_door", "lamp", -84.0, 55.2, 1.9, 2.90, gain=0.5),        # hidden from every camera: drop it first if render time rises
    _l("station_st_lamp_post", "lantern", 53.6, -0.4, 2.95, 2.96, auto=True),  # the Company lamp post's own lantern
]
# 'mass' is a kind the look does not know, so apply_lights leaves it as built: a deep red-orange (never magenta), dim,
# no shadow. Review 2026-11-12: its red on the moonlit snow read pink, so it lights the chapel alone (light linking:
# MASS_LIT) and leaves the fog be; the lancets glow by themselves (LANCET_GLOW, on the chapel's red-glass texels).
# Its colour leans orange (green 0.33, was 0.12): on the chapel's own snow-capped plinth, where it meets the blue
# moonlight, a redder light mixed to rose (hue 337-353); this one stays red-orange (hue 356-4).
# Second review: the plinth's lit top edge still had a faint salmon-rose cast and the lancet's lit texels read crimson
# (hue 332-358): the light is dimmer and more orange (energy 16, was 30), and the glass glows a fixed deep red-orange
# (`color`, hue about 13), as bright as the texel's red, where it took the texel's own crimson times a tint.
# Second review, round 2 (its test renders): the lancet's lit texels still came out crimson (hue 327-357, median 344):
# only its reddest texels glowed, in specks, and the moonlit crimson glass round them carried the hue. The glow now
# takes in the dimmer red texels too (`red`, `bright` lowered), is stronger and leans a little further to orange (hue
# about 16, strength 4.0, was 2.6; at hue 20 and 4.5 its hottest texels went orange), and the light is dimmer again
# (energy 10), which leaves the plinth's snow its moonlight.
MASS_LIGHT = dict(color=(1.0, 0.36, 0.07), energy=10.0, radius=0.15, volume=0.0, shadow=False)
MASS_LIT = ("dark_mass_chapel",)  # the placements the mass light reaches
LANCET_GLOW = dict(model="Frostgrave_Chapel", color=(1.0, 0.30, 0.04), strength=4.0, red=(0.12, 0.30), bright=(0.16, 0.38))

# ---------------------------------------------------------------- stone, rock and bare ground (review 2026-11-12)
# "Real ground has snow on the gentle parts. Steep faces show earth and rock, with stones at their feet. A stone quay
# has a stone face at the water."
#
# Stone walls, each its own mesh: a battered face along `points_m` (the low side to the right of the line's direction),
# from 0.4 m under the ground in front of it (sampled 0.6 m out) up to 5 cm over the ground behind it (sampled `back_m`
# and 0.3 m behind the face), and a coping course reaching `back_m` back from the face, with a skirt down into the
# ground behind. The faces stand on lines of the 0.5 m ground grid (see pad_mill_quay). Rubble stone, rock_wall_08.
WALLS = [
    dict(key="quay", what="the mill quay's water faces and both sides of the tailrace", back_m=0.6, batter=0.05,
         points_m=[[90.0, -27.0], [90.0, -32.5], [101.5, -32.5], [101.5, -24.0], [103.0, -24.0], [103.0, -32.5], [105.0, -32.5],
                   [105.0, -22.5]]),
    dict(key="flume_bank", what="the bank under the flume and the pond, east of the wheel", back_m=0.6, batter=0.03,
         points_m=[[100.25, -22.5], [105.0, -22.5]]),
]
# Bare ground: a layer over HM_Ground outside the map only (its weight is 0 inside the rectangle and on its edge and
# rises to 1 two metres beyond), where the ground is steeper than `snow_nz` (normal z: snow thins from the first
# value, gone by the second, the threshold wandering by `wander`), earth with stones (rocks_ground_08) giving way to
# layered rock (quarry_wall_02) on the steepest faces (`rock_nz`).
# Second review (2026-11-12): on moderate slopes (25-36 degrees) the threshold's wander laid high-contrast dark
# blotches like camouflage (mill_wide), so snow now thins from 42 degrees (was 39) with half the wander, and the snow
# caught on ledge bands is broader (ledge_scale, squeezed `ledge_squeeze` times in height) and comes in patches
# (ledge_patch) instead of an even run of streaks.
BARE = dict(snow_nz=(0.74, 0.60), rock_nz=(0.62, 0.40), wander=0.13, earth="mine_floor", rock="mine_wall", earth_tone=0.48,
            rock_tone=0.56, desat=0.45, ledge=(0.58, 0.70), ledge_scale=0.45, ledge_squeeze=2.4, ledge_patch=(0.12, 0.42, 0.62))
# Stones at the feet of the steep faces, and outcrops of rock in them, scattered over the finished ground outside the
# map (seeded, so every build is the same): a stone where gentle ground (normal z over toe_nz) lies within reach_m of
# steep ground (under steep_nz) standing rise_m higher; outcrops on the steep ground itself. Never on trodden ground,
# rails, water, footprints, walls, or near the still cameras' eyes and sightlines.
ROCKS = dict(seed=1893, steep_nz=0.74, toe_nz=0.88, reach_m=1.8, rise_m=0.35, toe_spacing_m=1.1, toe_keep=0.85,
             # (review 2026-11-13: foot stones from 0.35 m, was 0.18; smaller ones read as shards on the snow)
             toe_size_m=(0.35, 0.90), max_toe=800, crop_nz=0.66, crop_spacing_m=2.6, crop_keep=0.6, crop_size_m=(0.5, 1.6),
             max_crops=480, patch_freq=0.06, margin_m=2.5, above_water_m=-1.7, eye_clear_m=4.5, variants=13,
             # (second review, 2026-11-12: no outcrops nor foot stones on the trestle still's ravine walls or the bank
             # east of the mill) these places are scattered first and more densely: the frames of these stills within
             # dist_m of their eyes, and the boxes [x0, y0, x1, y1]. (The crypt's frame was boosted too; its knoll then
             # wore a dozen dark rocks perched on its slopes.)
             # (review 2026-11-13: the boosted foot stones lined both feet of the trestle's ravine floor in two even
             # files, like a garden path's edging) foot stones in the boosted places are kept less often, further
             # apart, and with gaps where the patches thin (toe_patch_floor, under the outcrops' patch_floor)
             boost=dict(views=("trestle",), dist_m=45.0, boxes=([106.0, -34.0, 170.0, -17.0],), crop_keep=0.95,
                        crop_spacing_m=1.7, toe_keep=0.65, toe_spacing_m=1.5, patch_floor=0.6, toe_patch_floor=0.25),
             # (second review, round 2: rocks on the crypt knoll's crown and on the ravine's rim stood against the sky
             # as black boxes) no rock whose top an eye-level still sees against the sky, or against ground more than
             # skyline_m behind it, within skyline_reach_m of its eye; and no outcrops in the boxes no_crop_m (the crypt
             # knoll's front, where they stood in the shade as black boxes on the snow, seen against the hill), nor
             # foot stones in no_toe_m (review 2026-11-13: one stood fused to the crypt's root base, one read as a cut
             # block beside it)
             skyline_m=2.0, skyline_reach_m=60.0, no_crop_m=([-67.0, -17.0, -49.0, -5.0],),
             no_toe_m=([-67.0, -17.0, -49.0, -5.0],),
             # outcrops (and ROCK_SET) sink this share of their size into the face (review 2026-11-13: at 0.3 a
             # boulder seemed to hang on the mill bank, and the crest boulder in mill_front showed its underside)
             crop_sink=0.4)
# Boulders set by hand, after the scatter (second review, round 2): (x, y, size m (about the half-width), what). Each
# stands like an outcrop, tilted to the ground and ROCKS["crop_sink"] of its size sunk into it.
ROCK_SET = [
    (-63.6, -10.6, 0.6, "the foot of the crypt knoll's west flank"),
    (108.8, -22.6, 0.7, "the crest of the bank east of the waterwheel (mill_front: one even curve)"),
    (112.4, -22.9, 0.55, "the crest of the bank east of the waterwheel"),
]

# The shore of the mere beyond the map's east and west edges (review 2026-11-12: its long straight bank read as a cut
# slab): Map.sample's hook shifts the tile rows it samples by up to `amp` rows (a positive shift samples further
# south, so the water comes that much further in: bays, never headlands), the bulges coming and going over `freq`,
# fading in over the first 10 m beyond the map's edges.
# `east` (second review, 2026-11-12: the long bank east of the quay still read as a man-made levee, one even incline
# under a straight crest): from x[0] (full by x[1]) the bank wanders both ways, headlands (negative rows: the land
# reaching out into the mere) and bays, `bumps` (centre x, half-width m, rows) seen by mill_wide and mill_front (the
# spur at x 110 breaks the bank behind the waterwheel, a flat face under a ruler-straight crest from mill_front), with
# noise of `amp` rows at `freq` over them; the bays only east of safe_x (west of it the mill pond's south bank and the
# chute's pad keep their ground).
SHORE = dict(amp=1.8, freq=0.07, ramp=(48.0, 58.0), seed=77,
             east=dict(x=(104.5, 108.5), bumps=((110.0, 2.8, -1.6), (121.0, 5.0, -2.4), (133.0, 4.0, 1.1), (146.0, 6.0, -2.8),
                                                (158.0, 4.5, 1.2), (171.0, 8.0, -2.6), (186.0, 6.0, 0.9)),
                       amp=0.6, freq=0.12, safe_x=126.0, seed=91))


def shore_wander(x: float, y: float) -> float:
    """hook (outskirts), from meshy_village_build.Map.sample beyond the map's east and west edges only: how many tile
    rows to shift the shore by (positive: the water comes in)."""
    k = smoothstep((abs(x) - SHORE["ramp"][0]) / (SHORE["ramp"][1] - SHORE["ramp"][0]))
    if k <= 0.0:
        return 0.0
    n = fbm(x, 0.0, SHORE["freq"], 3, SHORE["seed"])
    s = SHORE["amp"] * k * 0.5 * (n + math.sqrt(n * n + 0.02))
    E = SHORE["east"]
    if x > E["x"][0]:
        ke = smoothstep((x - E["x"][0]) / (E["x"][1] - E["x"][0]))
        w = sum(a * math.exp(-((x - c) / hw) ** 2) for c, hw, a in E["bumps"]) + E["amp"] * fbm(x, 0.0, E["freq"], 2, E["seed"])
        if w > 0.0:  # a bay
            w *= smoothstep((x - E["safe_x"]) / 6.0)
        s += ke * (w - s)
    return s


# ---------------------------------------------------------------- the still cameras (meshy_views/outskirts.json)
VIEWS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "meshy_views", "outskirts.json")
TILE = 1.5
# Build-time tree work for the stills (review 2026-11-12: shards of decimated pines at the lens; the pines faceted up
# close): every view below `high_m` clears the forest trees within line_m of its sightline (to line_to of the way to
# its target, as the stills always did); an eye-level view (under `low_m`) also clears every tree within clear_m of
# the eye, and within cone_m of it where its crown (crown_m x its scale across) reaches into the frame. Trees nearer
# than near_m to an eye-level eye, in its frame, get the near master at full detail, and those nearer than mid_m one
# decimated to mid_ratio after welding (smooth-shaded, the baked snow skirt sunk under the ground: near_tree).
# Second review (2026-11-12): faceted pines at the union_hall still's lens and in hideout_close's right third, and flat
# discs of baked snow under the pines further off (the waystation's hill, the chapel's middle ground, the trestle's
# rim). So the full near master reaches out to near_m 22.5 (was 14), every pine in an eye-level still's frame within
# sink_m of its eye stands with its skirt sunk (its own LOD mesh, sunk: sunk_mesh, no more faces), and the trees in
# VIEW_CLEAR (world x, y, r: still name) go.
VIEW_TREES = dict(high_m=20.0, low_m=6.0, line_m=3.2, line_to=0.9, clear_m=4.0, cone_m=7.5,
                  crown_m={"pine_tall": 3.5, "pine_short": 3.0, "dead_tree": 3.0}, near_m=22.5, mid_m=28.0, mid_ratio=0.5,
                  sink_m=60.0)
VIEW_CLEAR = [
    (78.93, 40.71, 0.6, "union_hall"),  # the pine filling the top left at 16.5 m, its needle clumps big hard shards
    # (second review, round 2, on test renders) the two pines 8-9 m off whose lower boughs still hung into the top-left
    # corner as LOD shards: their trunks stand 71 degrees off the view's axis, outside the crown test's reach
    (71.0, 48.69, 0.6, "union_hall"),
    (70.39, 47.61, 0.6, "union_hall"),
    (73.74, 44.40, 0.6, "union_hall"),  # and the near pine whose boughs filled the top-left corner, its trunk just out
    # (review 2026-11-13) the pine whose sunk skirt left one bough tip standing out of the snow, a lone dark spike at the
    # left of union_hall; and the near pine at the right edge of dark_mass_chapel whose low bough hung there as a dark
    # slab with a straight lower edge, as if hovering
    (95.05, 37.88, 0.6, "union_hall"),
    (-97.98, 47.31, 0.6, "dark_mass_chapel"),
]
# the near masters' sunk base, catalog metres (as meshy_wild_build.TREE_BASE): everything below za sinks `drop`, the
# bare trunk between za and zb stretches down to meet the ground, the mound beyond r0..r1 of the axis sinks drop_r up to zr
TREE_BASE = {"pine_tall": dict(za=1.3, zb=2.4, drop=1.5, r0=0.8, r1=1.0, zr=1.9, drop_r=2.2),
             "pine_short": dict(za=0.75, zb=1.15, drop=0.9, r0=0.6, r1=0.85, zr=1.05, drop_r=1.6)}


def view_cams(path: str = VIEWS_FILE) -> list[dict]:
    """The outskirts' still cameras from the views file (the look's --views-file format: tile units, eye height above
    the ground when it stands on the ground) in world metres: name, x, y, h, ground, tx, ty, tz, lens, opts."""
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as fh:
        views = {k: v for k, v in json.load(fh).items() if not k.startswith("_")}
    out = []
    w2, h2 = MAP_RECT[2] / TILE, MAP_RECT[3] / TILE
    for name, v in views.items():
        (ex, ey, eh), (tx, ty, tz), lens = v[:3]
        opts = dict(v[3]) if len(v) > 3 and isinstance(v[3], dict) else {}
        out.append(dict(name=name, x=(ex - w2) * TILE, y=(h2 - ey) * TILE, h=float(eh), ground=bool(opts.get("ground", eh < 25 and ey < 37)),
                        tx=(tx - w2) * TILE, ty=(h2 - ty) * TILE, tz=float(tz), lens=float(lens), opts=opts))
    return out


# ================================================================ plain geometry


def smoothstep(t: float) -> float:
    t = 0.0 if t <= 0.0 else (1.0 if t >= 1.0 else t)
    return t * t * (3.0 - 2.0 * t)


# ---------------------------------------------------------------- noise (plain Python: the same in and out of Blender)


def _hash(ix: int, iy: int, seed: int) -> float:
    n = (ix * 374761393 + iy * 668265263 + seed * 982451653) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFFFF) / 16777215.0


def vnoise(x: float, y: float, seed: int = 0) -> float:
    """Smooth value noise in -1..1 on a lattice of one unit."""
    ix, iy = math.floor(x), math.floor(y)
    fx, fy = x - ix, y - iy
    ux, uy = fx * fx * (3.0 - 2.0 * fx), fy * fy * (3.0 - 2.0 * fy)
    a, b = _hash(ix, iy, seed), _hash(ix + 1, iy, seed)
    c, d = _hash(ix, iy + 1, seed), _hash(ix + 1, iy + 1, seed)
    return 2.0 * (a + (b - a) * ux + (c - a + (d - c - b + a) * ux) * uy) - 1.0


def fbm(x: float, y: float, freq: float, octaves: int = 3, seed: int = 0) -> float:
    """Fractal value noise, mostly within -0.6..0.6 and never past -1..1; `freq` is cycles per metre of the first
    octave."""
    v, amp, tot = 0.0, 1.0, 0.0
    for o in range(octaves):
        v += amp * vnoise(x * freq + 17.13 * o, y * freq - 9.71 * o, seed + 101 * o)
        tot += amp
        amp *= 0.5
        freq *= 2.07
    return v / tot


def smin(a: float, b: float, k: float) -> float:
    """A smooth minimum: min(a, b) with the crease where they meet rounded over k metres (never above min(a, b))."""
    if k <= 0.0:
        return min(a, b)
    h = max(k - abs(a - b), 0.0) / k
    return min(a, b) - h * h * k * 0.25


def _seed(key: str) -> int:
    return sum((i + 1) * ord(c) for i, c in enumerate(key)) % 9973


def in_map(x: float, y: float) -> bool:
    return MAP_RECT[0] <= x <= MAP_RECT[2] and MAP_RECT[1] <= y <= MAP_RECT[3]


def seg_dist(px: float, py: float, ax: float, ay: float, bx: float, by: float) -> tuple[float, float]:
    """Distance from P to segment AB, and the parameter (0..1) of the nearest point."""
    dx, dy = bx - ax, by - ay
    l2 = dx * dx + dy * dy
    t = 0.0 if l2 <= 1e-12 else ((px - ax) * dx + (py - ay) * dy) / l2
    t = 0.0 if t < 0.0 else (1.0 if t > 1.0 else t)
    return math.hypot(ax + t * dx - px, ay + t * dy - py), t


class Line:
    """A polyline in the plane (extra values per point are the caller's)."""

    def __init__(self, pts):
        self.p = [(float(q[0]), float(q[1])) for q in pts]
        xs, ys = [q[0] for q in self.p], [q[1] for q in self.p]
        self.box = (min(xs), min(ys), max(xs), max(ys))

    def nearest(self, x: float, y: float) -> tuple[float, int, float]:
        """(distance, segment index, parameter on that segment) of the nearest point of the line."""
        best = (math.inf, 0, 0.0)
        p = self.p
        for i in range(len(p) - 1):
            d, t = seg_dist(x, y, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1])
            if d < best[0]:
                best = (d, i, t)
        return best


class Poly:
    """A closed polygon in the plane: inside test (even-odd) and distance to its edges (edge i: point i to i + 1)."""

    def __init__(self, pts):
        self.p = [(float(q[0]), float(q[1])) for q in pts]
        xs, ys = [q[0] for q in self.p], [q[1] for q in self.p]
        self.box = (min(xs), min(ys), max(xs), max(ys))

    def inside(self, x: float, y: float) -> bool:
        b = self.box
        if x < b[0] or x > b[2] or y < b[1] or y > b[3]:
            return False
        c, p, j = False, self.p, len(self.p) - 1
        for i in range(len(p)):
            (xi, yi), (xj, yj) = p[i], p[j]
            if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
                c = not c
            j = i
        return c

    def edge_dist(self, i: int, x: float, y: float) -> float:
        a, b = self.p[i], self.p[(i + 1) % len(self.p)]
        return seg_dist(x, y, a[0], a[1], b[0], b[1])[0]

    def dist(self, x: float, y: float) -> float:
        return min(self.edge_dist(i, x, y) for i in range(len(self.p)))

    def falloff_t(self, x: float, y: float, falloffs) -> float:
        """The least of distance / falloff over the edges that have a falloff (inf if none reaches)."""
        t = math.inf
        for i, f in enumerate(falloffs):
            if f > 0.0:
                t = min(t, self.edge_dist(i, x, y) / f)
        return t


def _grow(box, r):
    return (box[0] - r, box[1] - r, box[2] + r, box[3] + r)


# ================================================================ the earthworks

GROUND_LETTER = {"m": "d"}  # the spec's m (rutted mud) is the map's d (mud); its own m is moss rock
TRACK_FALLOFF = 1.0          # a shaped track blends back to the ground over this many metres beyond its width
VERTICAL = 1e-4              # side run of a vertical-sided channel
DEPTH_MAX = 45.0             # no channel cuts deeper than this (bounds the box it can touch)


def _paint(wts: dict, letter: str, a: float) -> dict:
    out = {k: v * (1.0 - a) for k, v in wts.items()}
    out[letter] = out.get(letter, 0.0) + a
    return out


class Edit:
    """One earthwork. `edit(x, y, h, wts, h0)` returns the new height and ground-letter weights; h0 is the natural height
    there before any edit. Outside `box` (and `clip_m`, if given) it changes nothing."""

    box = (math.inf, math.inf, -math.inf, -math.inf)

    def __init__(self, d: dict):
        self.d, self.key, self.kind = d, d.get("key", d["kind"]), d["kind"]
        c = d.get("clip_m")
        self.clip = tuple(float(v) for v in c) if c else None

    def __call__(self, x, y, h, wts, h0):
        b = self.box
        if x < b[0] or x > b[2] or y < b[1] or y > b[3]:
            return h, wts
        c = self.clip
        if c and not (c[0] <= x <= c[2] and c[1] <= y <= c[3]):
            return h, wts
        return self.apply(x, y, h, wts, h0)

    def apply(self, x, y, h, wts, h0):
        return h, wts


class _Natural:
    """Shared by the pads and mounds (review 2026-11-12, "the earthworks look artificial"): `wobble` varies the
    falloff's width along the edges by up to that share (the foot of the slope wanders; the top edge, where the flat
    of the pad ends, stays put, so nothing standing on it moves), and `rough_m` lays lumps of up to that many metres
    on the falloff, none at its top or its foot."""

    def _natural(self, d: dict) -> None:
        self.wob = float(d.get("wobble", 0.0))
        self.rough = float(d.get("rough_m", 0.0))
        self.seed = _seed(self.key)

    def _t(self, x, y, t):
        return t / (1.0 + self.wob * fbm(x, y, 0.16, 2, self.seed)) if self.wob else t

    def _lumps(self, x, y, t):
        return self.rough * fbm(x, y, 0.5, 3, self.seed + 7) * 4.0 * t * (1.0 - t) if self.rough else 0.0


class Pad(Edit, _Natural):
    """`crest_m` (second review, 2026-11-12: the Union Hall's pad showed a ruler-straight crest across its still): the
    flat top reaches out past the polygon by up to that many metres, wandering along its edges, so its brow is not a
    straight line; never inwards, so nothing standing on the pad moves (pads with one falloff for every edge only).
    `drift_m` (second review, round 2: from the still's eye, level with the pad, the crest still read as one straight
    line): drifts of snow up to that high along the brow, from nothing at the polygon's edge to their tops about where
    the flat ends, dying away down the slope; only inside the boxes `drift_box_m` if given."""

    def __init__(self, d):
        super().__init__(d)
        self.poly = Poly(d["points_m"])
        f = float(d.get("falloff_m", 0.0))
        self.fe = [float(v) for v in d.get("edge_falloff_m", [f] * len(self.poly.p))]
        if len(self.fe) != len(self.poly.p):
            raise ValueError(f"{self.key}: edge_falloff_m needs one value per edge")
        self.level = float(d["level_m"])
        self.crest = float(d.get("crest_m", 0.0))
        if self.crest and len(set(self.fe)) != 1:
            raise ValueError(f"{self.key}: crest_m needs one falloff for every edge")
        self.drift = float(d.get("drift_m", 0.0))
        self.drift_boxes = [tuple(float(v) for v in b) for b in d.get("drift_box_m", ())]
        self._natural(d)
        self.box = _grow(self.poly.box, max(self.fe + [0.0]) * (1.0 + self.wob) + self.crest)

    def _drift(self, x, y, dist, reach) -> float:
        if not self.drift:
            return 0.0
        w = smoothstep(dist / max(0.4, reach)) * (1.0 - smoothstep((dist - reach) / 1.5))
        if self.drift_boxes:
            w *= max(_in_box(b, x, y, 1.0) for b in self.drift_boxes)
        return self.drift * w * smoothstep(0.35 + 1.6 * fbm(x, y, 0.3, 2, self.seed + 23))

    def apply(self, x, y, h, wts, h0):
        if self.poly.inside(x, y):
            return self.level, wts
        if self.crest:
            dist = self.poly.dist(x, y)
            reach = self.crest * smoothstep(0.5 + 1.2 * fbm(x, y, 0.11, 2, self.seed + 5))
            if dist <= reach:
                return self.level + self._drift(x, y, dist, reach), wts
            t = self._t(x, y, (dist - reach) / self.fe[0])
            if t >= 1.0:
                return h, wts
            return self.level + (h - self.level) * smoothstep(t) + self._lumps(x, y, t) + self._drift(x, y, dist, reach), wts
        t = self._t(x, y, self.poly.falloff_t(x, y, self.fe))
        if t >= 1.0:
            return h, wts
        return self.level + (h - self.level) * smoothstep(t) + self._lumps(x, y, t), wts


class Mound(Edit, _Natural):
    def __init__(self, d):
        super().__init__(d)
        self.level, self.f = float(d["level_m"]), float(d.get("falloff_m", 0.0))
        self._natural(d)
        pts = d["points_m"]
        if "width_m" in d and len(pts) == 2:  # a ridge along a line
            self.line, self.poly, self.half = Line(pts), None, float(d["width_m"]) / 2.0
            self.box = _grow(self.line.box, self.half + self.f * (1.0 + self.wob))
        else:
            self.line, self.poly = None, Poly(pts)
            self.fe = [float(v) for v in d.get("edge_falloff_m", [self.f] * len(self.poly.p))]
            self.box = _grow(self.poly.box, max(self.fe + [0.0]) * (1.0 + self.wob))

    def apply(self, x, y, h, wts, h0):
        if self.poly is None:
            d = self.line.nearest(x, y)[0] - self.half
            if d <= 0.0:
                target = self.level
            else:
                t = self._t(x, y, d / self.f) if self.f > 0.0 else 1.0
                if t >= 1.0:
                    return h, wts
                target = self.level + (h - self.level) * smoothstep(t) + self._lumps(x, y, t)
        elif self.poly.inside(x, y):
            target = self.level
        else:
            t = self._t(x, y, self.poly.falloff_t(x, y, self.fe))
            if t >= 1.0:
                return h, wts
            target = self.level + (h - self.level) * smoothstep(t) + self._lumps(x, y, t)
        return max(h, target), wts


def smax(a: float, b: float, k: float) -> float:
    """A smooth maximum: max(a, b) with the crease where they meet rounded over k metres (never below max(a, b))."""
    if k <= 0.0:
        return max(a, b)
    h = max(k - abs(a - b), 0.0) / k
    return max(a, b) + h * h * k * 0.25


class Knoll(Edit):
    """A rounded hill raised over the ground (raise only). It rises `rise_m` along its crown, the line `crown_m`
    ([[x0, y], [x1, y]], west to east; a point if absent: `centre_m`), and falls as (1 - r^2)^power to nothing at an
    outline `radii_m` (west, east, south, north) beyond the crown's ends and either side of it (r = 1 there), the
    outline wandering by about a tenth and the surface lumpy by up to `rough_m` (0.4 cycles per metre) and `rough2_m`
    (0.13). `cap_rise_m` + `cap_slope` per metre of distance from the `cap_m` polygon (the model it holds) is as high as
    it may stand there (the model's own top shows), and its flanks hold the model's sides: within `flank_m` metres of
    the polygon the hill stands at least `flank_m` front to back from `flank_rise_m` [front (north), back] high,
    rounded over (no flat top), joined to the hill smoothly. Nothing rises inside `inside_m` (the model's footprint,
    inset, so the ground meets its walls inside their thickness) nor inside `approach_m` (before its door), and the
    ground comes up out of the approach within `wall_m` metres: the hill cut back for the door. (The first knoll
    ramped the ground up within wall_m of the footprint too, which left a trench along the crypt's side walls and a
    cut face beside the door.) East of `x_max_m` nothing rises (it fades over 1.5 m).

    Review 2026-11-12: the crypt's knoll was a flat-topped slab in an L, two smooth white domes beside the door; then
    (second review) it still read as two piles beside the door, a flat-topped wedge on the left (the old fill plateau)
    and a smooth tent on the right, with no hill behind the crypt from the still's eye. Now its crown is a ridge across
    the crypt's width behind it, standing over the crypt's roof as the still's eye sees it, and the flanks beside the
    door are rounded and rise into it. `crown_wander_m`: the crown line wanders north and south by up to that much;
    `crown_rough_m` (second review, round 2: a smooth dome of snow) lays humps and saddles of up to about half that on
    the upper hill (from half its rise up), `crown_freq` cycles per metre, under the cap, so the crypt's own top still
    shows.
    `terrace_m`, `ledge` (strata) step it like the ravine's walls, with `terrace_south` only south of the crown: on the
    crypt's knoll that is its crag over the shore, which aerial_west saw as one uniform dark slab of bare earth under a
    straight snow crest; all over, it read as a stepped cake from the crypt still."""

    def __init__(self, d):
        super().__init__(d)
        crown = d.get("crown_m")
        if crown:
            (x0, y0), (x1, _y1) = crown
            self.sx0, self.sx1, self.cy = float(x0), float(x1), float(y0)
        else:
            cx, self.cy = (float(v) for v in d["centre_m"])
            self.sx0 = self.sx1 = cx
        self.rw, self.re, self.rs, self.rn = (float(v) for v in d["radii_m"])
        self.rise, self.p = float(d["rise_m"]), float(d.get("power", 1.0))
        self.rough, self.rough2 = float(d.get("rough_m", 0.0)), float(d.get("rough2_m", 0.0))
        self.inside = Poly(d["inside_m"]) if d.get("inside_m") else None
        self.approach = Poly(d["approach_m"]) if d.get("approach_m") else None
        self.wall = float(d.get("wall_m", 1.0))
        self.cap = Poly(d["cap_m"]) if d.get("cap_m") else None
        self.cap_rise, self.cap_slope = float(d.get("cap_rise_m", 0.0)), float(d.get("cap_slope", 1.0))
        self.flank = float(d.get("flank_m", 0.0))
        self.flank_rise = tuple(float(v) for v in d.get("flank_rise_m", (0.0, 0.0)))
        self.x_max = float(d.get("x_max_m", math.inf))
        self.terr, self.ledge = float(d.get("terrace_m", 0.0)), float(d.get("ledge", 0.5))
        self.terr_south = bool(d.get("terrace_south", False))
        self.crown_wander = float(d.get("crown_wander_m", 0.0))
        self.crown_rough, self.crown_freq = float(d.get("crown_rough_m", 0.0)), float(d.get("crown_freq", 0.2))
        self.seed = _seed(self.key)
        g = 1.0 / 0.88  # the outline's wander reaches at most this far past the radii
        self.box = (self.sx0 - self.rw * g, self.cy - self.rs * g, min(self.sx1 + self.re * g, self.x_max),
                    self.cy + self.rn * g)

    def lift(self, x: float, y: float) -> float:
        """How far the knoll raises the ground at (x, y)."""
        if x >= self.x_max:
            return 0.0
        dx = x - min(max(x, self.sx0), self.sx1)
        u = dx / (self.re if dx > 0.0 else self.rw)
        cy = self.cy + self.crown_wander * fbm(x, 0.0, 0.17, 2, self.seed + 9) if self.crown_wander else self.cy
        v = (y - cy) / (self.rn if y > cy else self.rs)
        r2 = (u * u + v * v) * (1.0 + 0.12 * fbm(x, y, 0.15, 2, self.seed)) ** 2
        rise = self.rise * (1.0 - r2) ** self.p if r2 < 1.0 else 0.0
        if self.cap is not None:
            dc = 0.0 if self.cap.inside(x, y) else self.cap.dist(x, y)
            if self.flank > 0.0 and dc < self.flank:
                b = self.cap.box  # front (north, y1) to back (south, y0)
                t = min(1.0, max(0.0, (b[3] - y) / max(1e-6, b[3] - b[1])))
                hf = self.flank_rise[0] + (self.flank_rise[1] - self.flank_rise[0]) * t
                rise = smax(rise, hf * (1.0 - (dc / self.flank) ** 2) ** 1.5, 1.0)
            if rise <= 0.0:
                return 0.0
            if self.crown_rough:  # humps and a saddle along the upper hill, so its skyline is no smooth dome
                rise += self.crown_rough * smoothstep((rise - 0.5 * self.rise) / (0.35 * self.rise)) * \
                    fbm(x, y, self.crown_freq, 2, self.seed + 17)
            if self.terr:
                ks = smoothstep((cy - y) / 1.5) if self.terr_south else 1.0
                if ks > 0.0:
                    rise += ks * (strata(x, y, rise, self.terr, self.ledge, self.seed) - rise)
            rise = smin(rise, self.cap_rise + self.cap_slope * dc, 0.8)
        elif rise <= 0.0:
            return 0.0
        body = min(1.0, rise / 1.5)  # the lumps fade out at the hill's foot
        rise += body * (self.rough * fbm(x, y, 0.4, 3, self.seed + 3) + self.rough2 * fbm(x, y, 0.13, 2, self.seed + 5))
        if self.inside is not None and self.inside.inside(x, y):
            return 0.0
        if self.approach is not None:
            if self.approach.inside(x, y):
                return 0.0
            rise *= smoothstep(self.approach.dist(x, y) / self.wall)
        if self.x_max < math.inf:
            rise *= smoothstep((self.x_max - x) / 1.5)
        return max(0.0, rise)

    def apply(self, x, y, h, wts, h0):
        return h + self.lift(x, y), wts


class ShoreRough(Edit):
    """Lumps on the mere's bank beyond the map's east and west edges (review 2026-11-12: a long straight crest): where
    the ground's letters go from the bank to the mere's bed (O) it rises and falls by up to `rough_m` (most where the
    bed's weight is a half), fading in over `ramp_m` beyond the map's edges. First in the table, so every later
    earthwork (the quay, the lane, the pond) stands on it unchanged."""

    def __init__(self, d):
        super().__init__(d)
        self.amp, self.seed = float(d["rough_m"]), _seed(self.key)
        self.r0, self.r1 = (float(v) for v in d.get("ramp_m", (48.0, 56.0)))
        self.box = tuple(float(v) for v in d["box_m"])
        # (second review, 2026-11-12) east of the map the lumps are broader: their finest octave, 0.8 m across, stood
        # on the bank's steep step as a regular comb of snow teeth in the mill_wide still. The west keeps its own.
        self.east = tuple(float(v) for v in d.get("east_freq", (0.3, 3)))

    def apply(self, x, y, h, wts, h0):
        o = wts.get("O", 0.0)
        if o <= 0.0 or o >= 1.0:
            return h, wts
        k = smoothstep((abs(x) - self.r0) / (self.r1 - self.r0))
        freq, octaves = (self.east if x > 0.0 else (0.3, 3))
        return h + self.amp * k * 4.0 * o * (1.0 - o) * fbm(x, y, freq, int(octaves), self.seed), wts


class BankRough(Edit):
    """Broad lumps over the mere's bank east of the mill (second review, 2026-11-12: the long bank east of the quay read
    as a man-made levee, one even incline under a straight crest): up to `rough_m` metres at `freq` cycles per metre,
    over the band between `y_m` [north, south] (fading over 2 m inside it), from `x_m` [start, full] eastwards (to
    `x_end_m` [full, end] if given), and nowhere under the water's level (they fade out over the last metre above it).
    First after the shore's own lumps, so the pads, the pond and the tracks stand on it unchanged."""

    def __init__(self, d):
        super().__init__(d)
        self.amp, self.freq, self.seed = float(d["rough_m"]), float(d["freq"]), _seed(self.key)
        self.x0, self.x1 = (float(v) for v in d["x_m"])
        self.x2, self.x3 = (float(v) for v in d.get("x_end_m", (244.0, 245.0)))
        self.yn, self.ys = (float(v) for v in d["y_m"])
        self.water = float(d["water_m"])
        self.box = (self.x0, self.ys, self.x3, self.yn)

    def apply(self, x, y, h, wts, h0):
        k = smoothstep((x - self.x0) / (self.x1 - self.x0)) * smoothstep((self.x3 - x) / (self.x3 - self.x2))
        k *= smoothstep((self.yn - y) / 2.0) * smoothstep((y - self.ys) / 2.0)
        k *= smoothstep((h - self.water) / 1.0)
        if k <= 0.0:
            return h, wts
        return h + self.amp * k * fbm(x, y, self.freq, 2, self.seed), wts


class Track(Edit):
    def __init__(self, d):
        super().__init__(d)
        pts = d["points_m"]
        self.line = Line(pts)
        self.half = float(d["width_m"]) / 2.0
        self.z = [float(p[2]) for p in pts] if all(len(p) >= 3 for p in pts) else None
        self.fb = float(d.get("falloff_m", TRACK_FALLOFF))
        g = d.get("ground")
        self.letter = GROUND_LETTER.get(g, g) if g else None
        # the painted edge's half-width (feather_m: wider, so an edge running aslant the grid is no saw-tooth)
        self.feather = float(d["feather_m"]) if "feather_m" in d else min(0.25, self.half / 2.0)
        self.box = _grow(self.line.box, self.half + (self.fb if self.z else 0.0) + self.feather)

    def apply(self, x, y, h, wts, h0):
        d, i, t = self.line.nearest(x, y)
        if self.z:
            z = self.z[i] + (self.z[i + 1] - self.z[i]) * t
            if d <= self.half:
                h = z
            elif d < self.half + self.fb:
                h = z + (h - z) * smoothstep((d - self.half) / self.fb)
        if self.letter:
            a = 1.0 - smoothstep((d - self.half + self.feather) / (2.0 * self.feather))
            if a > 0.0:
                wts = _paint(wts, self.letter, a)
        return h, wts


def strata(x: float, y: float, u: float, step: float, ledge: float, seed: int) -> float:
    """A rise `u` terraced like the beds of a rock: flat ledges `ledge` of each step's run wide and steep risers
    between them, the step height (about `step` metres) and where the steps fall wandering with position. T(0) = 0 and
    it never decreases."""
    p = step * (1.0 + 0.3 * fbm(x, y, 0.07, 2, seed + 11))
    ph = 0.5 + 0.5 * fbm(x, y, 0.05, 2, seed + 13)

    def stair(v):
        k = math.floor(v)
        f = v - k
        return k + (0.0 if f < ledge else smoothstep((f - ledge) / (1.0 - ledge)))
    return p * (stair(u / p + ph) - stair(ph))


def _in_box(box, x: float, y: float, edge: float) -> float:
    """1 inside the box [x0, y0, x1, y1] more than `edge` metres from its sides, 0 outside it, smooth between."""
    x0, y0, x1, y1 = box
    return smoothstep(min(x - x0, x1 - x, y - y0, y1 - y) / edge)


class Channel(Edit):
    """`rough_m`: lumps of up to that many metres on the side walls (none on the floor), only inside `rough_box_m`
    [x0, y0, x1, y1] (fading over 2 m inside its edges); `crest_m`: the walls' top edge, where they meet the ground,
    rounded over that many metres (smin). Review 2026-11-12: the ravine was a smooth V of snow with hard straight
    edges. `cut()` and `floor_at()` stay the plain channel (the ravine head and the water ribbons build on them).

    `terrace_m` (second review, 2026-11-12: from the trestle still's new eye on the ravine floor its walls still read
    as smooth convex half-pipes of snow): inside `terrace_box_m` the walls rise in steps of about that many metres,
    each a riser of rock (about four times the wall's mean steepness, past the bare-rock layer's threshold) and a
    ledge `ledge` of the step's run wide that holds snow. The step height and where the steps fall wander along the
    ravine, so the ledges come and go like the beds of a rock; the crest there is rounded over `terrace_crest_m`
    only (a broken rim, not a rolled one). `terrace_strength` (second review, round 2: on finer ground cells the steps
    came out as flat, regular terraces, like a quarry's): the share of the step taken, the rest of the wall's own slope
    kept, so the ledges tilt out a little and the risers are a little less sheer."""

    def __init__(self, d):
        super().__init__(d)
        pts = d["points_m"]
        w0 = float(d.get("width_m", 1.0))
        self.line = Line(pts)
        self.floor = [float(p[2]) for p in pts]
        self.width = [float(p[3]) if len(p) > 3 else w0 for p in pts]
        self.run = [float(p[4]) if len(p) > 4 else VERTICAL for p in pts]
        self.box = _grow(self.line.box, max(w / 2.0 + r * DEPTH_MAX for w, r in zip(self.width, self.run)))
        self.rough, self.crest = float(d.get("rough_m", 0.0)), float(d.get("crest_m", 0.0))
        self.groove, self.groove_half = float(d.get("groove_m", 0.0)), float(d.get("groove_half_m", 0.75))
        gf = d.get("groove_fade_x_m")  # [x full, x none]: the groove fades out between these x (the beck's head)
        self.groove_fade = (float(gf[0]), float(gf[1])) if gf else None
        rb = d.get("rough_box_m")
        self.rough_box = tuple(float(v) for v in rb) if rb else None
        self.terr, self.ledge = float(d.get("terrace_m", 0.0)), float(d.get("ledge", 0.5))
        tb = d.get("terrace_box_m")
        self.terr_box = tuple(float(v) for v in tb) if tb else None
        self.terr_crest = float(d.get("terrace_crest_m", self.crest))
        self.terr_rough = float(d.get("terrace_rough_m", self.rough))
        self.terr_strength = float(d.get("terrace_strength", 1.0))
        self.seed = _seed(self.key)

    def _steps(self, x: float, y: float, u: float) -> float:
        """The wall's rise `u` above the floor, terraced (strata)."""
        return strata(x, y, u, self.terr, self.ledge, self.seed)

    def _at(self, x, y):
        d, i, t = self.line.nearest(x, y)
        j = min(i + 1, len(self.floor) - 1)
        lerp = lambda v: v[i] + (v[j] - v[i]) * t  # noqa: E731
        return d, lerp(self.floor), lerp(self.width) / 2.0, lerp(self.run)

    def cut(self, x, y) -> float:
        """The channel's surface at (x, y): its floor, then its side walls at `run` per metre of rise."""
        d, floor, half, run = self._at(x, y)
        return floor + max(0.0, d - half) / run - self._groove(d, x)

    def _groove(self, d: float, x: float) -> float:
        """How far the stream's own groove sinks the floor at d metres from the line (groove_m at the line), faded out
        toward the head (groove_fade)."""
        if not self.groove:
            return 0.0
        g = self.groove * (1.0 - smoothstep(d / self.groove_half))
        if self.groove_fade:
            x0, x1 = self.groove_fade
            g *= 1.0 - smoothstep((x - x0) / (x1 - x0))
        return g

    def floor_at(self, x, y) -> float:
        return self._at(x, y)[1]

    def bed_at(self, x, y) -> float:
        """The floor with the stream's groove in it (what the water ribbon's icy margins meet)."""
        d, floor, _half, _run = self._at(x, y)
        return floor - self._groove(d, x)

    def apply(self, x, y, h, wts, h0):
        if not (self.rough or self.crest or self.terr):
            return min(h, self.cut(x, y)), wts
        d, floor, half, run = self._at(x, y)
        u = max(0.0, d - half) / run
        crest, rough = self.crest, self.rough
        if self.terr and self.terr_box:
            kt = _in_box(self.terr_box, x, y, 3.0)
            if kt > 0.0:
                if u > 0.0:
                    u += kt * self.terr_strength * (self._steps(x, y, u) - u)
                crest += kt * (self.terr_crest - crest)
                rough += kt * (self.terr_rough - rough)
        c = floor + u - self._groove(d, x)
        if rough and d > half:
            k = smoothstep((d - half) / 0.8)
            if self.rough_box:
                k *= _in_box(self.rough_box, x, y, 2.0)
            if k > 0.0:
                c += rough * k * fbm(x, y, 0.45, 3, self.seed)
        return smin(h, c, crest), wts


class Headcut(Edit):
    """The ravine head behind the headwall cliff (spec: inside the box x 195.6-205, y -7..8 the ground is
    min(natural, 17.4 + 1.0 x (x - 196.6) for x > 196.6, 17.4 below), replacing the beck's rounded end there).

    Taken literally the box's sides would leave steps of up to 10 m against the beck's rounded end (which reaches
    about 20 m past the head), so here the same plateau runs on east until it meets the hillside. The head line
    follows the rock face, which the model's 274 degree turn tilts by face_tilt metres of x per metre of y, half a
    metre behind it (head_x_m at wall_y_m; the headwall's face is at x 195.72 at its south end, 194.86 at its north
    end), across the headwall and the two wing slabs that carry its rock on either side (face_half_m: the whole
    face's half-length): the spec's straight x = 195.6 would put the 6.6 m step in front of the rock at the south end.

    Beyond the headwall's ends (|y - wall_y_m| > wall_half_m) the plateau stays level across the head (side_slope 0)
    and the beck's own rounded end comes back wherever it stands higher, so the ravine's walls wrap round the head as
    they did before the cut. The step left at the head line between the ravine's wall and the plateau shrinks from
    5.5 m at the headwall's ends to nothing about 5.5 m out; it rises within blend_m metres of the head line, inside
    the wing slabs' rock (`headwall_n`, `headwall_s`). edge_m turns the plateau into that ramp inside the headwall's
    span. Nothing is cut deeper than the spec's surface or the beck's own cut, and the only steps left stand behind
    rock: the headwall's own (10.8 to 17.4 behind its face) and the wings' ramps.

    (The first build raised the plateau's sides 1:1 beyond the headwall's ends (side_slope 1) and ramped up to them
    from the ravine's wall within 1.5-4 m: snow wings 8-9 m tall at up to 5.8:1 beside the rock, on screen for
    4.5-6.7 s of the closing hold.)"""

    def __init__(self, d, channel: Channel):
        super().__init__(d)
        self.level, self.x_rise, self.slope = float(d["level_m"]), float(d["x_rise_m"]), float(d["slope"])
        self.yc, self.half = float(d["wall_y_m"]), float(d["wall_half_m"]) - float(d["edge_m"])
        self.edge, self.side, self.blend = float(d["edge_m"]), float(d["side_slope"]), float(d["blend_m"])
        self.hx, self.tilt = float(d["head_x_m"]), float(d["face_tilt"])
        self.span = float(d.get("face_half_m", d["wall_half_m"]))
        self.channel = channel
        r = float(d["reach_m"])
        x_lo = self.hx - self.tilt * self.span
        self.box = (x_lo, self.yc - r, x_lo + r, self.yc + r)

    def head_x(self, y: float) -> float:
        """x of the head line at y: behind the rock face, held at its end values beyond the face."""
        return self.hx + self.tilt * max(-self.span, min(self.span, self.yc - y))

    def apply(self, x, y, h, wts, h0):
        x0 = self.head_x(y)
        if x < x0:
            return h, wts
        top = self.level + self.slope * max(0.0, x - self.x_rise)
        u = abs(y - self.yc) - self.half
        if u > 0.0:
            wall, own = self.channel.cut(x0, y), self.channel.cut(x, y)  # own: the beck's rounded end here
            ramp = max(own, wall + (max(top + self.side * u, own) - wall) * smoothstep((x - x0) / self.blend))
            top += (ramp - top) * smoothstep(u / self.edge)
        return min(h0, top), wts


class Basin(Edit):
    def __init__(self, d):
        super().__init__(d)
        self.poly = Poly(d["points_m"])
        self.level, self.f = float(d["level_m"]), float(d["falloff_m"])
        self.edge = float(d.get("edge_level_m", 2.7))
        self.box = self.poly.box

    def apply(self, x, y, h, wts, h0):
        if not self.poly.inside(x, y):
            return h, wts
        zb = self.level + (self.edge - self.level) * (1.0 - smoothstep(self.poly.dist(x, y) / self.f))
        return min(h, zb), wts


class Clamp(Edit):
    """Applied in Blender, to the ground mesh, once its model is placed (`clamp_ground`); nothing in Map.sample."""

    def __init__(self, d):
        super().__init__(d)
        self.poly = Poly(d["points_m"])
        self.model_key, self.below = d.get("model", "trestle"), float(d.get("below_m", 0.3))


def compile_terrain(table=None) -> list:
    """The TERRAIN rows as edit objects, in order."""
    edits, by_key = [], {}
    for d in (TERRAIN if table is None else table):
        k = d["kind"]
        if k == "pad":
            e = Pad(d)
        elif k == "mound":
            e = Mound(d)
        elif k == "track":
            e = Track(d)
        elif k == "channel":
            e = Channel(d)
        elif k == "headcut":
            e = Headcut(d, by_key[d["channel"]])
        elif k == "basin":
            e = Basin(d)
        elif k == "knoll":
            e = Knoll(d)
        elif k == "shore":
            e = ShoreRough(d)
        elif k == "bank":
            e = BankRough(d)
        elif k == "clamp":
            e = Clamp(d)
        else:
            raise ValueError(f"unknown terrain kind {k!r}")
        edits.append(e)
        by_key[e.key] = e
    return edits


class EditSet:
    """The earthworks in list order as one `Map.edits` entry: `f(x, y, h, wts) -> (h, wts)`. A grid of 8 m cells lists
    the edits that can touch each cell, so a sample far from every edit costs one dictionary lookup."""

    CELL = 8.0

    def __init__(self, edits):
        self.edits = list(edits)
        self.by_key = {e.key: e for e in self.edits}
        self.grid: dict[tuple[int, int], list] = {}
        for e in self.edits:
            x0, y0, x1, y1 = e.box
            if x0 > x1:
                continue
            for gx in range(math.floor(x0 / self.CELL), math.floor(x1 / self.CELL) + 1):
                for gy in range(math.floor(y0 / self.CELL), math.floor(y1 / self.CELL) + 1):
                    self.grid.setdefault((gx, gy), []).append(e)  # appended in list order

    def __call__(self, x, y, h, wts):
        es = self.grid.get((math.floor(x / self.CELL), math.floor(y / self.CELL)))
        if not es:
            return h, wts
        h0 = h
        for e in es:
            h, wts = e(x, y, h, wts, h0)
        return h, wts


def terrain_edits() -> list:
    """Hook 1: the entries for `Map.edits` (meshy_village_build.Map.sample applies them outside the map only)."""
    es = EditSet(compile_terrain())
    kinds: dict[str, int] = {}
    for e in es.edits:
        kinds[e.kind] = kinds.get(e.kind, 0) + 1
    print("OUTSKIRTS terrain edits " + ", ".join(f"{n} {k}" for k, n in kinds.items()), flush=True)
    return [es]


def clear_indices(points, circles=CLEAR_TREES) -> list[int]:
    """Indices of the (x, y) points outside the map that lie in any clearing circle (distance <= r)."""
    out = []
    for i, (x, y) in enumerate(points):
        if not in_map(x, y) and any(math.hypot(x - cx, y - cy) <= r for cx, cy, r in circles):
            out.append(i)
    return out


def resample(pts, step: float):
    """Points every `step` metres or less along a polyline of [x, y, z]: (x, y, z, segment index, unit tangent)."""
    out = []
    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]
        n = max(1, math.ceil(math.hypot(b[0] - a[0], b[1] - a[1]) / step))
        for k in range(n):
            t = k / n
            out.append([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, i])
    out.append([pts[-1][0], pts[-1][1], pts[-1][2], len(pts) - 2])
    res = []
    for j, (x, y, z, i) in enumerate(out):
        p0, p1 = out[max(0, j - 1)], out[min(len(out) - 1, j + 1)]
        tx, ty = p1[0] - p0[0], p1[1] - p0[1]
        n = math.hypot(tx, ty) or 1.0
        res.append((x, y, z, i, (tx / n, ty / n)))
    return res


def ribbon_geometry(w: dict, floor_at=None):
    """Vertices, quads and material slots (0 open water, 1 ice) of a water ribbon. With open_m < width_m there are
    four points across: the outer strips are ice whose outer edge dips 4 cm under the channel floor (`floor_at`), so
    the stream never hangs above its bed, and the middle strip is open water unless the stream falls more steeply
    than frozen_slope there (the cascade's frozen spray) or is within frozen_start_m of its source. Otherwise two
    points across, all open water."""
    pts = [list(p) for p in w["points_m"]]
    for p in pts:  # the water lies this much lower than its table, down in the bed's groove
        p[2] -= float(w.get("level_drop_m", 0.0))
    if w.get("end_dip_m"):
        pts[-1][2] -= float(w["end_dip_m"])
    if w.get("start_dip_m"):  # the stream comes out from under the snow at its source, not off the end of a plank
        pts[0][2] -= float(w["start_dip_m"])
    half, mid = float(w["width_m"]) / 2.0, float(w["open_m"]) / 2.0
    slope = [abs(b[2] - a[2]) / max(1e-6, math.hypot(b[0] - a[0], b[1] - a[1])) for a, b in zip(pts, pts[1:])]
    edged = half > mid + 1e-6
    wander = w.get("wander")  # (share the widths vary by, metres the thread meanders across the bed), see WATER
    verts, faces, mats = [], [], []
    run, prev = 0.0, None
    for j, (x, y, z, i, (tx, ty)) in enumerate(resample(pts, 0.8)):
        lx, ly = -ty, tx  # to the stream's left
        if prev is not None:
            run += math.hypot(x - prev[0], y - prev[1])
        prev = (x, y)
        if edged:
            zf = floor_at(x, y) - 0.04 if floor_at else z
            h_, m_, o_ = half, mid, 0.0
            if wander:  # a frozen stream's open thread and its icy margins come and go; the thread wanders
                h_ = half * (1.0 + wander[0] * fbm(run, 0.0, 0.45, 2, 41))
                m_ = mid * (1.0 + 1.6 * wander[0] * fbm(run, 7.3, 0.6, 2, 43))
                o_ = wander[1] * fbm(run, 3.1, 0.22, 2, 47)
                m_ = min(m_, h_ - abs(o_) - 0.08)
            across = ((-h_, zf), (o_ - m_, z), (o_ + m_, z), (h_, zf))  # right bank to left bank
        else:
            across = ((-half, z), (half, z))
        n = len(across)
        for off, zz in across:
            verts.append((x + lx * off, y + ly * off, zz))
        if j:
            frozen = slope[i] > float(w.get("frozen_slope", 99.0)) or run <= float(w.get("frozen_start_m", 0.0)) \
                or (wander is not None and fbm(run, 11.0, 0.08, 2, 53) > 0.22) \
                or any(a <= run <= b for a, b in w.get("frozen_runs_m", ()))  # stretches frozen over
            b0, b1 = n * (j - 1), n * j
            for k in range(n - 1):
                faces.append((b0 + k, b1 + k, b1 + k + 1, b0 + k + 1))  # forward, then left: counter-clockwise from above
                middle = k == 1 if edged else True
                mats.append(0 if middle and not frozen else 1)
    return verts, faces, mats


def rim_geometry(path, width, outer: float = 0.3, step: float = 0.8):
    """An ice rim along a pond bank: `path` runs along the bank with the water on its left; the strip reaches `outer`
    metres under the bank and between width[0] and width[1] metres out over the water (a slow wander)."""
    samples = resample([[p[0], p[1], 0.0] for p in path], step)
    verts, faces = [], []
    s = 0.0
    for j, (x, y, _z, _i, (tx, ty)) in enumerate(samples):
        if j:
            s += math.hypot(x - samples[j - 1][0], y - samples[j - 1][1])
        lx, ly = -ty, tx  # left normal: toward the water
        wave = 0.5 + 0.5 * math.sin(0.7 * s + 1.3 * math.sin(0.31 * s))
        w = width[0] + (width[1] - width[0]) * wave
        verts.append((x - lx * outer, y - ly * outer))
        verts.append((x + lx * w, y + ly * w))
        if j:
            b0, b1 = 2 * (j - 1), 2 * j
            faces.append((b0, b1, b1 + 1, b0 + 1))
    return verts, faces


def log_geometry(logs, level: float, sides: int = 10):
    """Closed cylinders lying in the water: (x, y, yaw degrees, length, radius), axis at the water line."""
    verts, faces = [], []
    for cx, cy, yaw, length, r in logs:
        ax, ay = math.cos(math.radians(yaw)), math.sin(math.radians(yaw))
        base = len(verts)
        for end in (-0.5, 0.5):
            ex, ey = cx + ax * length * end, cy + ay * length * end
            for k in range(sides):
                a = 2.0 * math.pi * k / sides
                c, s = r * math.cos(a), r * math.sin(a)
                verts.append((ex - ay * c, ey + ax * c, level + s))
        for k in range(sides):
            k1 = (k + 1) % sides
            faces.append((base + k, base + k1, base + sides + k1, base + sides + k))
        faces.append(tuple(base + k for k in reversed(range(sides))))
        faces.append(tuple(base + sides + k for k in range(sides)))
    return verts, faces


# ================================================================ Blender


def _editset(mp) -> EditSet:
    for e in getattr(mp, "edits", []):
        if isinstance(e, EditSet):
            return e
    return EditSet(compile_terrain())


def clear_forest(vb) -> list[tuple[str, float, float]]:
    """Remove the forest trees standing in the clearing circles (outside the map only)."""
    import bpy
    objs = [o for o in vb.COL["forest"].objects if o.get("wdi_model") in TREE_MODELS]
    hit = clear_indices([(o.location.x, o.location.y) for o in objs])
    removed = [(objs[i].get("wdi_model"), objs[i].location.x, objs[i].location.y) for i in hit]
    for i in hit:
        bpy.data.objects.remove(objs[i], do_unlink=True)
    print(f"OUTSKIRTS cleared {len(removed)} of {len(objs)} forest trees in {len(CLEAR_TREES)} circles "
          f"(the spec counts {CLEAR_EXPECTED} of 884)", flush=True)
    if len(removed) != CLEAR_EXPECTED:
        print("OUTSKIRTS WARNING the forest is not the one the circles were fitted to (RNG 1893, 884 trees): check the "
              "clearings round the buildings, pads, tracks, channels and sight lines", flush=True)
    return removed


def place_models(mp, vb) -> dict:
    out = {}
    vb.HERO_2K.update(HERO)   # before the first import of each: slim_textures reads it then
    for p in PLACEMENTS:
        o = vb.place(mp, p["model"], p["x"], p["y"], rot=p["rot"], size=p["size"], z=p["z"], sink=p["sink"], lod=p["lod"],
                     col=p["col"])
        o["wdi_role"] = "outskirts:" + p["key"]
        if p["col"] == "forest":
            o.visible_shadow = False  # far pines, like the forest's own hills
        out[p["key"]] = o
    for name in TEX_FAR:
        vb.slim_textures(vb.source(name), name, side=512)
    return out


def _ray_down(o, x: float, y: float, z: float, depth: float):
    """World z of the first surface of `o` below (x, y, z) within `depth` metres, or None."""
    import bpy
    from mathutils import Vector
    mw = o.matrix_world
    inv = mw.inverted()
    org = inv @ Vector((x, y, z))
    end = inv @ Vector((x, y, z - depth))
    d = end - org
    ok, loc, _n, _i = o.ray_cast(org, d.normalized(), distance=d.length, depsgraph=bpy.context.evaluated_depsgraph_get())
    return (mw @ loc).z if ok else None


def settle_props(placed: dict) -> list[str]:
    """Rest each prop with a `host` on the host's highest surface under its footprint, near the spec's z."""
    import bpy
    bpy.context.view_layer.update()
    notes = []
    for p in PLACEMENTS:
        if not p["host"] or p["key"] not in placed or p["host"] not in placed:
            continue
        o, host = placed[p["key"]], placed[p["host"]]
        z0, (fx, fy) = p["z"], p["foot"]
        hits = []
        for dx, dy in ((0.0, 0.0), (fx / 3, fy / 3), (-fx / 3, fy / 3), (fx / 3, -fy / 3), (-fx / 3, -fy / 3)):
            hz = _ray_down(host, p["x"] + dx, p["y"] + dy, z0 + 0.6, 0.95)
            if hz is not None and hz >= z0 - 0.35:
                hits.append(hz)
        if hits:
            z = max(hits)
            o.location.z = z - p["sink"]
            notes.append(f"{p['key']} on {p['host']}: z {z0:.2f} -> {z:.2f} ({len(hits)} of 5 rays)")
        else:
            o.location.z = z0 - p["sink"]
            notes.append(f"{p['key']} on {p['host']}: no surface found near z {z0:.2f}, left at the spec's z")
    for n in notes:
        print("OUTSKIRTS SETTLE " + n, flush=True)
    return notes


def clamp_ground(model, clamp: Clamp, probe: float = 0.3) -> tuple[int, float]:
    """Lower every ground vertex inside the clamp outline that has the model above it to `below` metres under the
    model's lowest surface there, so only the model's own banks, bents and creek bed show. Whether the model is above
    a vertex is decided by the ray up from the vertex itself; the four rays `probe` metres round it only deepen the
    cut. (A vertex just outside the chunk's irregular outline, where only a probe found the model, was once lowered
    too: pits up to 5 m deep along the chunk's south and east edges, laying bare its untextured skirt.)"""
    import bpy
    from mathutils import Vector
    ground = bpy.data.objects.get("HM_Ground")
    if ground is None:
        return 0, 0.0
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    mw = model.matrix_world
    inv = mw.inverted()
    up = (inv.to_3x3() @ Vector((0.0, 0.0, 1.0))).normalized()
    low = min((mw @ Vector(c)).z for c in model.bound_box) - 2.0
    me = ground.data
    co = [0.0] * (3 * len(me.vertices))
    me.vertices.foreach_get("co", co)
    poly, b = clamp.poly, clamp.poly.box
    changed, deepest = 0, 0.0
    for i in range(0, len(co), 3):
        x, y, z = co[i], co[i + 1], co[i + 2]
        if x < b[0] or x > b[2] or y < b[1] or y > b[3] or not poly.inside(x, y):
            continue
        under = centre = None
        for dx, dy in ((0.0, 0.0), (probe, 0.0), (-probe, 0.0), (0.0, probe), (0.0, -probe)):
            ok, loc, _n, _f = model.ray_cast(inv @ Vector((x + dx, y + dy, low)), up, depsgraph=dg)
            if ok:
                zz = (mw @ loc).z
                if dx == 0.0 and dy == 0.0:
                    centre = zz
                under = zz if under is None else min(under, zz)
        if centre is None:
            continue  # no part of the model above this vertex: the ground stays as it is
        if z > under - clamp.below:
            co[i + 2] = under - clamp.below
            changed += 1
            deepest = max(deepest, z - co[i + 2])
    me.vertices.foreach_set("co", co)
    me.update()
    print(f"OUTSKIRTS CLAMP {clamp.model_key}: {changed} ground vertices lowered (at most {deepest:.2f} m)", flush=True)
    return changed, deepest


def _natural(mp, x: float, y: float) -> float:
    saved, mp.edits = mp.edits, []
    try:
        return mp.height(x, y)
    finally:
        mp.edits = saved


def resnap_trees(mp, vb, clamp: Clamp | None) -> tuple[int, int]:
    """Stand every forest tree outside the map that is on edited ground at the edited height (as place() does: ground
    minus the sink); inside the clamp outline, on the ground mesh itself. Returns (on edited ground, moved)."""
    import bpy
    from mathutils import Vector
    ground = bpy.data.objects.get("HM_Ground")
    on_edit = moved = 0
    for o in list(vb.COL["forest"].objects):
        x, y = o.location.x, o.location.y
        if o.get("wdi_model") not in TREE_MODELS or in_map(x, y) or str(o.get("wdi_role", "")).startswith("outskirts:"):
            continue
        h = mp.height(x, y)
        in_clamp = clamp is not None and clamp.poly.inside(x, y)
        if abs(h - _natural(mp, x, y)) < 1e-4 and not in_clamp:
            continue
        on_edit += 1
        if in_clamp and ground is not None:
            ok, loc, _n, _i = ground.ray_cast(Vector((x, y, 300.0)), Vector((0.0, 0.0, -1.0)))
            if ok:
                h = min(h, loc.z)
        z = h - TREE_SINK
        if abs(o.location.z - z) > 1e-3:
            o.location.z = z
            moved += 1
    print(f"OUTSKIRTS RESNAP {on_edit} forest trees stand on edited ground, {moved} moved to it", flush=True)
    return on_edit, moved


def ice_material(vb):
    """Matte ice with snow drifted on it, in the style of the mere's ice patches."""
    import bpy
    m = bpy.data.materials.get("HM_Ice")
    if m is not None:
        return m
    m = bpy.data.materials.new("HM_Ice")
    bsdf = vb._principled(m)
    g = vb.G(m.node_tree)
    pos = g.position()
    grain = g.noise(pos, 6.0, 3.0)
    drift = g.smooth(g.noise(pos, 0.8, 4.0), 0.42, 0.60)  # snow blown onto the ice
    ice = g.mix(g.smooth(grain, 0.3, 0.7), (0.07, 0.09, 0.12), (0.13, 0.16, 0.21))
    g.link(g.mix(drift, ice, g.rgb((0.56, 0.62, 0.74), "P_ice_snow")), bsdf.inputs["Base Color"])
    g.link(g.mixf(drift, g.value(0.30, "P_ice_rough"), 0.75), bsdf.inputs["Roughness"])
    bump = vb._new(g.n, "ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.25
    bump.inputs["Distance"].default_value = 1.0
    g.link(g.math("ADD", g.math("MULTIPLY", drift, 0.02), g.math("MULTIPLY", grain, 0.004)), bump.inputs["Height"])
    g.link(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return m


def log_material(vb):
    """Dark wet bark with snow on the logs' tops."""
    import bpy
    m = bpy.data.materials.get("HM_PondLog")
    if m is not None:
        return m
    m = bpy.data.materials.new("HM_PondLog")
    bsdf = vb._principled(m)
    g = vb.G(m.node_tree)
    pos = g.position()
    bark = g.mix(g.smooth(g.noise(pos, 9.0, 4.0), 0.35, 0.65), (0.05, 0.035, 0.025), (0.12, 0.085, 0.055))
    sep = vb._new(g.n, "ShaderNodeSeparateXYZ")
    g.link(vb._new(g.n, "ShaderNodeNewGeometry").outputs["Normal"], sep.inputs[0])
    up = g.smooth(sep.outputs[2], 0.55, 0.85)
    g.link(g.mix(up, bark, (0.55, 0.60, 0.72)), bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.85
    return m


def _mesh_object(vb, name: str, verts, faces, mats, mat_index=None, smooth: bool = True):
    import bpy
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    me.update()
    for m in mats:
        me.materials.append(m)
    if mat_index:
        me.polygons.foreach_set("material_index", list(mat_index))
    me.polygons.foreach_set("use_smooth", [smooth] * len(me.polygons))
    vb.uv_world(me)
    ob = bpy.data.objects.new(name, me)
    vb.COL["world"].objects.link(ob)
    ob.visible_shadow = False  # thin sheets on water: their shadows would only darken the bed below them
    ob["wdi_outskirts"] = name
    return ob


def build_water_surfaces(vb, es: EditSet) -> list:
    """The pond (open water, ice rim, logs), the beck and leat, and the tailrace."""
    import bpy
    mere = bpy.data.materials.get("HM_Mere")  # the approved mere's own water: the look's water settings reach it too
    ice = ice_material(vb)
    out = []
    for w in WATER:
        if w["kind"] == "pond":
            z = float(w["level_m"])
            out.append(_mesh_object(vb, "HM_Pond", [(x, y, z) for x, y in w["points_m"]], [tuple(range(len(w["points_m"])))],
                                    [mere], smooth=False))
            rv, rf = rim_geometry(w["ice_rim"], w["rim_m"])  # 4 cm proud of the water: no depth fight at 160 m
            out.append(_mesh_object(vb, "HM_PondIce", [(x, y, z + 0.04) for x, y in rv], rf, [ice], smooth=False))
            lv, lf = log_geometry(w["logs"], z)
            out.append(_mesh_object(vb, "HM_PondLogs", lv, lf, [log_material(vb)]))
        else:
            ch = es.by_key.get(w["channel"]) if w.get("channel") else None
            verts, faces, mats = ribbon_geometry(w, ch.bed_at if ch else None)
            name = "HM_Beck" if w["key"] == "beck_water" else "HM_Tailrace"
            out.append(_mesh_object(vb, name, verts, faces, [mere, ice], mat_index=mats))
    for o in out:
        print(f"OUTSKIRTS WATER {o.name}: {len(o.data.polygons)} faces", flush=True)
    return out


def add_lights(vb, placed: dict | None = None) -> list:
    out = []
    for L in LIGHTS:
        if L["auto"]:
            continue  # place() added it with its model
        ob = vb.add_light(L["kind"], L["x"], L["y"], L["z"])
        ob["wdi_outskirts"] = L["key"]
        if L["gain"] != 1.0:
            ob["wdi_gain"] = L["gain"]  # the look multiplies its energy for this kind by this
        if L["kind"] == "mass":
            ld = ob.data
            ld.color = MASS_LIGHT["color"]
            ld.energy = MASS_LIGHT["energy"]
            ld.shadow_soft_size = MASS_LIGHT["radius"]
            ld.volume_factor = MASS_LIGHT["volume"]
            ld.use_shadow = MASS_LIGHT["shadow"]
            mass_linking(ob, placed or {})
        elif L["kind"] == "fire":
            ob.data.use_shadow = True
        out.append(ob)
    if placed and "dark_mass_chapel" in placed:
        n = lancet_glow(placed["dark_mass_chapel"])
        print(f"OUTSKIRTS MASS the chapel's red glass glows in {n} materials", flush=True)
    return out


def mass_linking(light, placed: dict) -> None:
    """The mass light reaches only the placements in MASS_LIT (light linking: not the snow, not the fog)."""
    import bpy
    coll = bpy.data.collections.get("HM_MassLit") or bpy.data.collections.new("HM_MassLit")
    coll.use_fake_user = True  # held by the light's link only, never in the scene
    for key in MASS_LIT:
        o = placed.get(key)
        if o is not None and o.name not in coll.objects:
            coll.objects.link(o)
    light.light_linking.receiver_collection = coll
    print(f"OUTSKIRTS MASS light {light.name} lights {[o.name for o in coll.objects]} only", flush=True)


def lancet_glow(o) -> int:
    """The red glass of the chapel's lancets glows deep red-orange of itself (an emission added beside the material's
    BSDF, so the look's own emissive and roof-snow passes, which rewire the BSDF, leave it be)."""
    G = LANCET_GLOW
    done = 0
    for slot in o.material_slots:
        mat = slot.material
        if mat is None or mat.node_tree is None or "WDI_lancet" in mat.node_tree.nodes:
            continue
        nodes, links = mat.node_tree.nodes, mat.node_tree.links
        bsdf = next((n for n in nodes if n.type == "BSDF_PRINCIPLED"), None)
        out = next((n for n in nodes if n.type == "OUTPUT_MATERIAL"), None)
        if bsdf is None or out is None or not bsdf.inputs["Base Color"].is_linked:
            continue
        src = bsdf.inputs["Base Color"].links[0].from_socket
        sep = nodes.new("ShaderNodeSeparateColor")
        links.new(src, sep.inputs[0])
        gb = nodes.new("ShaderNodeMath")
        gb.operation = "MAXIMUM"
        links.new(sep.outputs[1], gb.inputs[0])
        links.new(sep.outputs[2], gb.inputs[1])
        red = nodes.new("ShaderNodeMath")
        red.operation = "SUBTRACT"
        links.new(sep.outputs[0], red.inputs[0])
        links.new(gb.outputs[0], red.inputs[1])
        masks = []
        for v, (lo, hi) in ((red.outputs[0], G["red"]), (sep.outputs[0], G["bright"])):
            rng_ = nodes.new("ShaderNodeMapRange")
            rng_.interpolation_type = "SMOOTHSTEP"
            rng_.clamp = True
            links.new(v, rng_.inputs[0])
            rng_.inputs[1].default_value, rng_.inputs[2].default_value = lo, hi
            masks.append(rng_.outputs[0])
        mask = nodes.new("ShaderNodeMath")
        mask.operation = "MULTIPLY"
        links.new(masks[0], mask.inputs[0])
        links.new(masks[1], mask.inputs[1])
        lit = nodes.new("ShaderNodeMath")  # as bright as the texel's red
        lit.operation = "MULTIPLY"
        links.new(mask.outputs[0], lit.inputs[0])
        links.new(sep.outputs[0], lit.inputs[1])
        strength = nodes.new("ShaderNodeMath")
        strength.operation = "MULTIPLY"
        links.new(lit.outputs[0], strength.inputs[0])
        strength.inputs[1].default_value = G["strength"]
        em = nodes.new("ShaderNodeEmission")
        em.name = "WDI_lancet"
        em.inputs["Color"].default_value = (*G["color"], 1.0)  # a fixed deep red-orange, never the texel's crimson
        links.new(strength.outputs[0], em.inputs["Strength"])
        add = nodes.new("ShaderNodeAddShader")
        links.new(bsdf.outputs[0], add.inputs[0])
        links.new(em.outputs[0], add.inputs[1])
        links.new(add.outputs[0], out.inputs["Surface"])
        done += 1
    return done


# ---------------------------------------------------------------- bare ground, stone walls, rocks (review 2026-11-12)


def _box_tex(vb, g, coord, role: str, map_name: str, zoom: float = 1.0, turn: float = 0.0, blend: float = 0.3):
    """A Poly Haven map of a material role in box projection over `coord`, one repeat at the scan's own size."""
    import bpy
    path = vb.mr.texture_path(role, map_name, res="1k")
    if not os.path.exists(path):
        raise FileNotFoundError(f"{path}: run `python tools/blender/materials/fetch.py --roles {role} --res 1k`")
    img = bpy.data.images.load(path, check_existing=True)
    if map_name != "diff":
        img.colorspace_settings.name = "Non-Color"
    metres = vb.ph_metres(role) * zoom
    mapping = vb._new(g.n, "ShaderNodeMapping", vector_type="POINT")
    mapping.inputs["Scale"].default_value = (1.0 / metres, 1.0 / metres, 1.0 / metres)
    mapping.inputs["Rotation"].default_value = (0.0, 0.0, turn)
    g.link(coord, mapping.inputs["Vector"])
    node = vb._new(g.n, "ShaderNodeTexImage", projection="BOX", projection_blend=blend)
    node.image = img
    g.link(mapping.outputs["Vector"], node.inputs["Vector"])
    return node.outputs["Color"]


def ground_layer(vb, g, col, rough, nrm):
    """hook (outskirts), from meshy_village_build.terrain_material: bare earth and rock where the ground outside the
    map is too steep to hold snow (BARE), snow on the gentle parts. Its weight is exactly 0 inside the map rectangle and
    on its edge (rising to 1 two metres beyond it), so there the colour, roughness and normal are the village's own."""
    n = g.n
    pos = g.position()
    sep = vb._new(n, "ShaderNodeSeparateXYZ")
    g.link(pos, sep.inputs[0])
    ax = g.math("SUBTRACT", g.math("ABSOLUTE", sep.outputs[0]), MAP_RECT[2])
    ay = g.math("SUBTRACT", g.math("ABSOLUTE", sep.outputs[1]), MAP_RECT[3])
    outside = g.smooth(g.math("MAXIMUM", ax, ay), 0.0, 2.0)
    # the up component of the ground's normal, smoothed over its neighbours at build time (smooth_up): the shading
    # normal's own, vertex by vertex, alternated across the snow threshold along every sharp crease that runs aslant
    # the 0.5 m grid (second review, 2026-11-12: a regular comb of snow teeth on the bank west of the quay)
    up = vb._new(n, "ShaderNodeAttribute", attribute_name=UP_ATTR).outputs["Fac"]
    wander = g.noise(pos, 0.22, 3.0)
    fine = g.noise(pos, 1.6, 4.0)
    s = g.math("ADD", up, g.math("ADD", g.math("MULTIPLY", g.math("SUBTRACT", wander, 0.5), BARE["wander"]),
                                 g.math("MULTIPLY", g.math("SUBTRACT", fine, 0.5), 0.06)))
    bare = g.math("SUBTRACT", 1.0, g.smooth(s, BARE["snow_nz"][1], BARE["snow_nz"][0]))
    cliff = g.math("SUBTRACT", 1.0, g.smooth(s, BARE["rock_nz"][1], BARE["rock_nz"][0]))
    obj = vb._new(n, "ShaderNodeTexCoord").outputs["Object"]
    earth_raw = _box_tex(vb, g, obj, BARE["earth"], "diff")
    rock_raw = g.mix(g.smooth(wander, 0.42, 0.58), _box_tex(vb, g, obj, BARE["rock"], "diff"),
                     _box_tex(vb, g, obj, BARE["rock"], "diff", zoom=2.6, turn=0.9))
    earth = g.scale(g.desat(earth_raw, BARE["desat"]), BARE["earth_tone"])
    rock = g.scale(g.desat(rock_raw, BARE["desat"]), BARE["rock_tone"])
    stone = g.mix(cliff, earth, rock)
    # snow left in the earth's hollows, and caught on ledges across the faces (noise squeezed upright into bands)
    dust = g.math("MULTIPLY", g.smooth(g.noise(pos, 3.1, 3.0), 0.56, 0.70), g.math("SUBTRACT", 1.0, cliff))
    squeeze = vb._new(n, "ShaderNodeMapping", vector_type="POINT")
    squeeze.inputs["Scale"].default_value = (1.0, 1.0, BARE["ledge_squeeze"])
    g.link(pos, squeeze.inputs["Vector"])
    ledge = g.smooth(g.noise(squeeze.outputs["Vector"], BARE["ledge_scale"], 2.0), BARE["ledge"][0], BARE["ledge"][1])
    ps, plo, phi = BARE["ledge_patch"]
    ledge = g.math("MULTIPLY", ledge, g.smooth(g.noise(pos, ps, 2.0), plo, phi))
    ledge = g.math("MULTIPLY", ledge, g.math("SUBTRACT", 1.0, g.math("MULTIPLY", cliff, 0.4)))
    stone = g.mix(g.math("MULTIPLY", g.math("MAXIMUM", dust, ledge), 0.85), stone, col)
    fac = g.math("MULTIPLY", outside, bare)
    col_out = g.mix(fac, col, stone)
    rough_out = g.mixf(fac, rough, g.mixf(cliff, 0.92, 0.80))
    bump = vb._new(n, "ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.6
    bump.inputs["Distance"].default_value = 0.08
    g.link(g.gray(g.mix(cliff, earth_raw, rock_raw)), bump.inputs["Height"])
    mixn = vb._new(n, "ShaderNodeMix", data_type="VECTOR")
    g.link(fac, mixn.inputs[0])
    g.link(nrm, mixn.inputs[4])
    g.link(bump.outputs["Normal"], mixn.inputs[5])
    return col_out, rough_out, mixn.outputs[1]


UP_ATTR = "wdi_up"  # HM_Ground's float point attribute: the up component of its normal, smoothed (smooth_up)
UP_PASSES = 2
# where the ground's own sharp steps are meant to show (the ravine's rock steps and their snowy ledges below the
# trestle) the attribute keeps each vertex's own normal: [x0, y0, x1, y1], blending over 3 m inside the box
UP_CRISP = ([151.0, -30.0, 182.0, 30.0],)
# second review, round 2: on the bank west of the quay, where Mill Lane comes down to it, the bank's crease runs aslant
# the grid and two passes still left a comb of snow teeth along it in the mill_wide still: there the steepness is
# smoothed `passes` times in all, [x0, y0, x1, y1, passes], blending over 2 m inside the box (it stops short of the
# quay's wall)
UP_SOFT = ([50.0, -37.0, 89.9, -15.0, 10],)


def smooth_up(passes: int = UP_PASSES) -> int:
    """Store the up component of HM_Ground's vertex normals, each averaged with its neighbours along the mesh's edges
    `passes` times and renormalised (more times inside UP_SOFT, each vertex's own inside UP_CRISP), as UP_ATTR, which
    the bare-ground layer reads for the ground's steepness (only outside the map does the layer weigh anything).
    Returns the vertex count."""
    import bpy
    import numpy as np
    ground = bpy.data.objects.get("HM_Ground")
    if ground is None:
        return 0
    me = ground.data
    nv = len(me.vertices)
    v = np.empty(nv * 3)
    me.vertex_normals.foreach_get("vector", v)
    v = v.reshape(-1, 3)
    ed = np.empty(len(me.edges) * 2, dtype=np.int64)
    me.edges.foreach_get("vertices", ed)
    a, b = ed[0::2], ed[1::2]
    deg = 1.0 + np.bincount(a, minlength=nv) + np.bincount(b, minlength=nv)

    def smooth(v):
        acc = v.copy()
        for c in range(3):
            acc[:, c] += np.bincount(a, weights=v[b, c], minlength=nv) + np.bincount(b, weights=v[a, c], minlength=nv)
        acc /= deg[:, None]
        return acc / np.maximum(np.linalg.norm(acc, axis=1), 1e-9)[:, None]
    for _ in range(passes):
        v = smooth(v)
    co = np.empty(nv * 3)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)

    def inside(box, edge):
        x0, y0, x1, y1 = box
        t = np.clip(np.minimum.reduce([co[:, 0] - x0, x1 - co[:, 0], co[:, 1] - y0, y1 - co[:, 1]]) / edge, 0.0, 1.0)
        return t * t * (3.0 - 2.0 * t)
    up = v[:, 2]
    for *box, n in UP_SOFT:  # more passes over these boxes
        w = inside(box, 2.0)
        if not w.any():
            continue
        vs = v
        for _ in range(max(0, int(n) - passes)):
            vs = smooth(vs)
        up = up + w * (vs[:, 2] - up)
    keep = np.zeros(nv)
    for box in UP_CRISP:
        keep = np.maximum(keep, inside(box, 3.0))
    own = np.empty(nv * 3)
    me.vertex_normals.foreach_get("vector", own)
    up = up + keep * (own.reshape(-1, 3)[:, 2] - up)
    attr = me.attributes.get(UP_ATTR) or me.attributes.new(UP_ATTR, "FLOAT", "POINT")
    attr.data.foreach_set("value", up.astype(np.float32))
    print(f"OUTSKIRTS UP {nv} ground vertices: the steepness the bare ground reads, smoothed over {passes} passes", flush=True)
    return nv


def rock_material(vb):
    """Layered rock (quarry_wall_02, box-projected in the rock's own frame) with snow on its up-facing parts."""
    import bpy
    m = bpy.data.materials.get("HM_Rock")
    if m is not None:
        return m
    m = bpy.data.materials.new("HM_Rock")
    bsdf = vb._principled(m)
    g = vb.G(m.node_tree)
    obj = vb._new(g.n, "ShaderNodeTexCoord").outputs["Object"]
    base = _box_tex(vb, g, obj, BARE["rock"], "diff", zoom=0.6)
    col = g.scale(g.desat(base, 0.45), 0.78)  # review 2026-11-13: at 0.6 the rocks read black against the snow
    pos = g.position()
    gn = vb._new(g.n, "ShaderNodeSeparateXYZ")
    g.link(vb._new(g.n, "ShaderNodeNewGeometry").outputs["Normal"], gn.inputs[0])
    # snow caps every up-facing part, thinning at its edges (review 2026-11-13: snow on the flattest tops only, from
    # normal z 0.60, left the rocks bare and dark), so a rock reads as a snowy boulder with dark flanks
    snowy = g.smooth(g.math("ADD", gn.outputs[2], g.math("MULTIPLY", g.math("SUBTRACT", g.noise(pos, 3.0, 3.0), 0.5), 0.35)), 0.40, 0.66)
    g.link(g.mix(snowy, col, g.rgb((0.84, 0.88, 0.95), "P_rock_snow")), bsdf.inputs["Base Color"])
    g.link(g.mixf(snowy, 0.82, 0.55), bsdf.inputs["Roughness"])
    bump = vb._new(g.n, "ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.5
    bump.inputs["Distance"].default_value = 0.05
    g.link(g.gray(base), bump.inputs["Height"])
    g.link(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return m


def wall_material(vb):
    """Rubble stone (rock_wall_08) on the walls' own UVs (metres along the wall and up), darker and glossier in a wet
    band at the waterline, snow on the coping."""
    import bpy
    m = bpy.data.materials.get("HM_StoneWall")
    if m is not None:
        return m
    m = bpy.data.materials.new("HM_StoneWall")
    bsdf = vb._principled(m)
    g = vb.G(m.node_tree)
    uv = vb._new(g.n, "ShaderNodeUVMap", uv_map="UVMap").outputs["UV"]
    diff = g.tex(uv, "stone_wall", "diff", "1k")
    col = g.scale(g.desat(diff, 0.2), 0.85)
    pos = g.position()
    sep = vb._new(g.n, "ShaderNodeSeparateXYZ")
    g.link(pos, sep.inputs[0])
    wet = g.math("SUBTRACT", 1.0, g.smooth(sep.outputs[2], -1.75, -1.40))
    col = g.mix(g.math("MULTIPLY", wet, 0.6), col, g.scale(col, 0.4))
    gn = vb._new(g.n, "ShaderNodeSeparateXYZ")
    g.link(vb._new(g.n, "ShaderNodeNewGeometry").outputs["Normal"], gn.inputs[0])
    snowy = g.smooth(g.math("ADD", gn.outputs[2], g.math("MULTIPLY", g.math("SUBTRACT", g.noise(pos, 2.0, 3.0), 0.5), 0.3)), 0.62, 0.85)
    g.link(g.mix(snowy, col, g.rgb((0.84, 0.88, 0.95), "P_wall_snow")), bsdf.inputs["Base Color"])
    stone_rough = g.math("ADD", g.math("MULTIPLY", g.gray(g.tex(uv, "stone_wall", "rough", "1k")), 0.5), 0.40)
    g.link(g.mixf(snowy, g.mixf(wet, stone_rough, 0.22), 0.55), bsdf.inputs["Roughness"])
    nmap = vb._new(g.n, "ShaderNodeNormalMap", space="TANGENT", uv_map="UVMap")
    nmap.inputs["Strength"].default_value = 1.0
    g.link(g.tex(uv, "stone_wall", "nor_gl", "1k"), nmap.inputs["Color"])
    g.link(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    return m


def wall_geometry(w: dict, height) -> tuple[list, list, list]:
    """Vertices, quads and per-loop UVs (metres) of one stone wall (WALLS); `height(x, y)` is the finished ground.
    Each segment of the line is its own block (face, coping, back skirt and end caps); a block's top is lifted 4 mm
    on every other segment, so two meeting at a corner never share a plane."""
    verts, faces, uvs = [], [], []
    pts, back, batter = w["points_m"], float(w["back_m"]), float(w["batter"])
    s0 = 0.0

    def quad(a, b, c, d, ua, ub, uc, ud):
        k = len(verts)
        verts.extend((a, b, c, d))
        uvs.extend((ua, ub, uc, ud))
        faces.append((k, k + 1, k + 2, k + 3))

    for i in range(len(pts) - 1):
        (ax, ay), (bx, by) = pts[i], pts[i + 1]
        seg = math.hypot(bx - ax, by - ay)
        dx, dy = (bx - ax) / seg, (by - ay) / seg
        nx, ny = dy, -dx  # the face's outward normal: the low side, right of the line
        n = max(1, math.ceil(seg / 0.75))
        cols = []
        for j in range(n + 1):
            t = j / n
            px, py = ax + (bx - ax) * t, ay + (by - ay) * t
            top = max(height(px - nx * back, py - ny * back), height(px - nx * 0.3, py - ny * 0.3)) + 0.05 + 0.004 * (i % 2)
            foot = min(height(px + nx * 0.6, py + ny * 0.6) - 0.4, top - 0.5)
            bat = batter * (top - foot)
            cols.append(((px + nx * bat, py + ny * bat, foot), (px, py, top), (px - nx * back, py - ny * back, top),
                         (px - nx * back, py - ny * back, top - 0.45), s0 + seg * t, bat))
        for c0, c1 in zip(cols, cols[1:]):
            (B0, T0, C0, K0, u0), (B1, T1, C1, K1, u1) = c0[:5], c1[:5]
            quad(B0, B1, T1, T0, (u0, B0[2]), (u1, B1[2]), (u1, T1[2]), (u0, T0[2]))       # the face
            quad(T0, T1, C1, C0, (u0, 0.0), (u1, 0.0), (u1, back), (u0, back))            # the coping
            quad(C0, C1, K1, K0, (u0, C0[2]), (u1, C1[2]), (u1, K1[2]), (u0, K0[2]))       # the skirt behind
        for (B, T, C, K, _u, bat), flip in ((cols[0], False), (cols[-1], True)):         # the end caps
            ring = [(B, (-bat, B[2])), (T, (0.0, T[2])), (C, (back, C[2])), (K, (back, K[2]))]
            if flip:
                ring.reverse()
            quad(*(r[0] for r in ring), *(r[1] for r in ring))
        s0 += seg
    return verts, faces, uvs


def build_walls(mp, vb) -> list:
    import bpy
    mat = wall_material(vb)
    out = []
    for w in WALLS:
        verts, faces, uvs = wall_geometry(w, mp.height)
        me = bpy.data.meshes.new(f"HM_Wall_{w['key']}")
        me.from_pydata(verts, [], faces)
        me.update()
        layer = me.uv_layers.new(name="UVMap")
        layer.data.foreach_set("uv", [c for uv in uvs for c in uv])
        me.materials.append(mat)
        ob = bpy.data.objects.new(f"HM_Wall_{w['key']}", me)
        vb.COL["world"].objects.link(ob)
        ob["wdi_outskirts"] = w["key"]
        out.append(ob)
        length = sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(w["points_m"], w["points_m"][1:]))
        print(f"OUTSKIRTS WALL {w['key']}: {len(faces)} faces, {length:.1f} m ({w['what']})", flush=True)
    return out


# The scattered rocks' shapes are Poly Haven boulder scans (owner: use Poly Haven). Review 2026-11-13: the convex-hull
# boulders built here before, dark and crisply faceted, read as black glass shards on the trestle's ravine floor and as
# black boxes on the snow in mill_wide. Each scan piece is decimated to about ROCK_FACES faces and wears HM_Rock.
ROCK_SCANS = ("rock_moss_set_01", "rock_moss_set_02")
ROCK_FACES = 700


def rock_meshes(vb, count: int, seed: int) -> list:
    """Up to `count` boulder meshes from the Poly Haven scans (ROCK_SCANS), one per piece: decimated to about
    ROCK_FACES faces, smooth-shaded, each with its footprint centred on the origin and scaled to a half-width of 1 (as
    `size` in scatter_rocks means), its origin 0.15 of its height above its base, no taller than 1.1, wearing HM_Rock
    (the scan's own mossy maps are dropped)."""
    import bpy
    import numpy as np
    from mathutils import Matrix
    from materials import fetch_models as fm
    mat = rock_material(vb)
    out = []
    for slug in ROCK_SCANS:
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=fm.model_path(slug, must_exist=True))
        new = [o for o in bpy.data.objects if o not in before]
        bpy.context.view_layer.update()
        for o in sorted((o for o in new if o.type == "MESH"), key=lambda o: o.name):
            me = o.data.copy()
            me.transform(o.matrix_world)
            co = np.empty(len(me.vertices) * 3)
            me.vertices.foreach_get("co", co)
            co = co.reshape(-1, 3)
            lo, hi = co.min(axis=0), co.max(axis=0)
            half = max(hi[0] - lo[0], hi[1] - lo[1]) / 2.0
            h = (hi[2] - lo[2]) / half
            sz = min(1.0, 1.1 / h) / half
            me.transform(Matrix.Diagonal((1.0 / half, 1.0 / half, sz, 1.0)) @ Matrix.Translation(
                (-(lo[0] + hi[0]) / 2.0, -(lo[1] + hi[1]) / 2.0, -(lo[2] + 0.15 * (hi[2] - lo[2])))))
            tmp = bpy.data.objects.new("HM_RockTmp", me)
            bpy.context.scene.collection.objects.link(tmp)
            dec = tmp.modifiers.new("dec", "DECIMATE")
            dec.ratio = min(1.0, ROCK_FACES / max(1, len(me.polygons)))
            bpy.context.view_layer.update()
            rock_me = bpy.data.meshes.new_from_object(tmp.evaluated_get(bpy.context.evaluated_depsgraph_get()))
            bpy.data.objects.remove(tmp, do_unlink=True)
            bpy.data.meshes.remove(me)
            rock_me.name = f"HM_Rock_{len(out)}"
            rock_me.materials.clear()
            rock_me.materials.append(mat)
            rock_me.polygons.foreach_set("use_smooth", [True] * len(rock_me.polygons))
            out.append(rock_me)
        for o in new:
            bpy.data.objects.remove(o, do_unlink=True)
    print(f"OUTSKIRTS ROCK SHAPES {len(out)} Poly Haven scan pieces ({', '.join(ROCK_SCANS)}), "
          f"{sum(len(m.polygons) for m in out)} faces in all", flush=True)
    return out[:max(1, count)]


def _rect_of(o, pad: float):
    import numpy as np
    from mathutils import Vector
    c = np.array([tuple(o.matrix_world @ Vector(b)) for b in o.bound_box])
    return (c[:, 0].min() - pad, c[:, 1].min() - pad, c[:, 0].max() + pad, c[:, 1].max() + pad)


def scatter_rocks(mp, vb, placed: dict, eyes: list) -> list:
    """Stones at the feet of the steep ground outside the map and outcrops of rock in it (ROCKS), as linked duplicates
    of a few boulder meshes, over the finished ground mesh."""
    import random

    import bpy
    import numpy as np
    from mathutils import Euler, Matrix, Vector, kdtree
    R = ROCKS
    rng = random.Random(R["seed"])
    ground = bpy.data.objects.get("HM_Ground")
    if ground is None:
        return []
    me = ground.data
    nv = len(me.vertices)
    co = np.empty(nv * 3)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    nrm = np.empty(nv * 3)
    me.vertex_normals.foreach_get("vector", nrm)
    nrm = nrm.reshape(-1, 3)
    ca = np.empty(nv * 4)
    me.color_attributes["wdi_a"].data.foreach_get("color", ca)
    cb = np.empty(nv * 4)
    me.color_attributes["wdi_b"].data.foreach_get("color", cb)
    ca, cb = ca.reshape(-1, 4), cb.reshape(-1, 4)
    x, y, z, nz = co[:, 0], co[:, 1], co[:, 2], nrm[:, 2]
    m = R["margin_m"]
    ok = (np.abs(x) > MAP_RECT[2] + m) | (np.abs(y) > MAP_RECT[3] + m)
    ok &= (ca[:, 0] + ca[:, 1] + ca[:, 2] + cb[:, 2]) < 0.25           # no stones on trodden ground or the rail bed
    ok &= ~((np.abs(x - mp.rail_x) < 3.5) & (y > MAP_RECT[3]))           # nor on the line north of the map
    for x0, y0, x1, y1 in (_rect_of(o, 0.3) for o in placed.values()):
        ok &= ~((x > x0) & (x < x1) & (y > y0) & (y < y1))
    pond = Poly(POND)
    lines = [(Line(w["points_m"]), 1.0) for w in WALLS]
    for wtr in WATER:
        if wtr["kind"] == "ribbon":
            lines.append((Line([p[:2] for p in wtr["points_m"]]), float(wtr["width_m"]) / 2.0 + 0.15))
    forest = list(vb.COL["forest"].objects)
    trees = kdtree.KDTree(max(1, len(forest)))
    for k, o in enumerate(forest):
        trees.insert((o.location.x, o.location.y, 0.0), k)
    trees.balance()
    low_eyes = [(e["x"], e["y"]) for e in eyes if e["low"]]

    def free(px, py, r):
        if pond.inside(px, py) or pond.dist(px, py) < 0.3:
            return False
        if any(math.hypot(px - ex, py - ey) < R["eye_clear_m"] + r for ex, ey in low_eyes):
            return False
        if forest and trees.find((px, py, 0.0))[2] < 0.9 + r:
            return False
        return not any(ln.nearest(px, py)[0] < pad + r for ln, pad in lines)

    steep = np.where(ok & (nz < R["steep_nz"]))[0]
    kd = kdtree.KDTree(max(1, len(steep)))
    for k in steep:
        kd.insert((float(x[k]), float(y[k]), 0.0), int(k))
    kd.balance()
    meshes = rock_meshes(vb, R["variants"], R["seed"])
    taken: dict = {"crop": {}, "toe": {}}

    def spaced(kind, px, py, sp):
        grid = taken[kind]
        gx, gy = math.floor(px / 4.0), math.floor(py / 4.0)
        for ix in (gx - 1, gx, gx + 1):
            for iy in (gy - 1, gy, gy + 1):
                for qx, qy in grid.get((ix, iy), ()):
                    if math.hypot(px - qx, py - qy) < sp:
                        return False
        return True

    def keep(kind, px, py):
        taken[kind].setdefault((math.floor(px / 4.0), math.floor(py / 4.0)), []).append((px, py))

    def patchy(px, py, seed):
        """Rocks come in patches with bare stretches between them, not in an even row."""
        return 0.15 + 0.85 * smoothstep((fbm(px, py, R["patch_freq"], 2, seed) + 0.3) / 0.5)

    B = R["boost"]
    boost_eyes = [e for e in eyes if e["name"] in B["views"]]

    def boosted(px, py) -> bool:
        if any(x0 <= px <= x1 and y0 <= py <= y1 for x0, y0, x1, y1 in B["boxes"]):
            return True
        for e in boost_eyes:
            if math.hypot(px - e["x"], py - e["y"]) < B["dist_m"]:
                off = abs((math.atan2(py - e["y"], px - e["x"]) - e["head"] + math.pi) % (2.0 * math.pi) - math.pi)
                if off < e["half"] + 0.05:
                    return True
        return False

    sky_eyes = []
    for e in eyes:
        if e["low"]:
            pitch = math.atan2(e["tz"] - e["ez"], math.hypot(e["tx"] - e["x"], e["ty"] - e["y"]))
            sky_eyes.append((Vector((e["x"], e["y"], e["ez"])), e["head"], e["half"], pitch, math.atan(10.125 / e["lens"])))
    n_sky = 0

    def skyline(px, py, top) -> bool:
        """Whether an eye-level still sees (px, py, top) against the sky, or against ground more than skyline_m behind
        it (ROCKS)."""
        nonlocal n_sky
        p = Vector((px, py, top))
        for eye, head, half, pitch, vhalf in sky_eyes:
            d = p - eye
            dist = d.length
            if dist > R["skyline_reach_m"] or dist < 0.5:
                continue
            off = abs((math.atan2(d.y, d.x) - head + math.pi) % (2.0 * math.pi) - math.pi)
            if off > half + 0.05 or abs(math.atan2(d.z, math.hypot(d.x, d.y)) - pitch) > vhalf + 0.05:
                continue
            hit, loc, _n, _i = ground.ray_cast(eye, d / dist, distance=dist + R["skyline_m"])
            if not hit:
                n_sky += 1
                return True
        return False

    out = []

    def rock(px, py, pz, size, up=None, tilt=0.12, flat=1.0):
        me_ = meshes[rng.randrange(len(meshes))]
        ob = bpy.data.objects.new("HM_Rock", me_)
        rot = Euler((rng.uniform(-tilt, tilt), rng.uniform(-tilt, tilt), rng.uniform(0.0, 2.0 * math.pi))).to_matrix()
        if up is not None:
            rot = Vector((0.0, 0.0, 1.0)).rotation_difference(up).to_matrix() @ rot
        ob.matrix_world = Matrix.Translation((px, py, pz)) @ rot.to_4x4() @ Matrix.Diagonal(
            (size * rng.uniform(0.85, 1.2), size * rng.uniform(0.8, 1.1), size * flat * rng.uniform(0.8, 1.15), 1.0))
        vb.COL["world"].objects.link(ob)
        ob["wdi_outskirts"] = "rock"
        out.append(ob)

    # outcrops first: ledges of rock pushing out of the steep faces, half sunk in them
    crops = [int(k) for k in steep if nz[k] < R["crop_nz"] and z[k] > R["above_water_m"] - 0.3
             and not any(b0 <= x[k] <= b2 and b1 <= y[k] <= b3 for b0, b1, b2, b3 in R["no_crop_m"])]
    rng.shuffle(crops)
    crop_boost = {k: boosted(float(x[k]), float(y[k])) for k in crops}
    crops.sort(key=lambda k: not crop_boost[k])  # the boosted places first (a stable sort keeps the shuffle within each)
    n_crop = n_boost = 0
    lo, hi = R["crop_size_m"]
    for k in crops:
        if n_crop >= R["max_crops"]:
            break
        px, py, pz = float(x[k]), float(y[k]), float(z[k])
        b = crop_boost[k]
        p_keep = B["crop_keep"] * max(patchy(px, py, 31), B["patch_floor"]) if b else R["crop_keep"] * patchy(px, py, 31)
        if rng.random() > p_keep or not spaced("crop", px, py, B["crop_spacing_m"] if b else R["crop_spacing_m"]):
            continue
        size = lo + (hi - lo) * rng.random() ** 1.5
        if not free(px, py, size * 0.6) or skyline(px, py, pz + 0.4 * size):
            continue
        nn = Vector(tuple(nrm[k])).normalized()
        up = (nn * 0.7 + Vector((0.0, 0.0, 0.3))).normalized()
        c = Vector((px, py, pz)) - nn * (R["crop_sink"] * size)  # under half of it stands out of the face (second
        # review: half out, they perched on the crypt knoll's corners like black boxes)
        rock(c.x, c.y, c.z, size, up=up, tilt=0.3, flat=0.8)
        keep("crop", px, py)
        n_crop += 1
        n_boost += b
    # stones at the feet of the steep faces, in patches, some in twos and threes
    gentle = [int(k) for k in np.where(ok & (nz > R["toe_nz"]) & (z > R["above_water_m"]))[0]
              if not any(b0 <= x[k] <= b2 and b1 <= y[k] <= b3 for b0, b1, b2, b3 in R["no_toe_m"])]
    rng.shuffle(gentle)
    toe_boost = {k: boosted(float(x[k]), float(y[k])) for k in gentle}
    gentle.sort(key=lambda k: not toe_boost[k])
    n_toe = n_toe_boost = 0
    lo, hi = R["toe_size_m"]
    for k in gentle:
        if n_toe >= R["max_toe"]:
            break
        px, py, pz = float(x[k]), float(y[k]), float(z[k])
        hits = kd.find_range((px, py, 0.0), R["reach_m"])
        if not any(z[i] > pz + R["rise_m"] for _c, i, _d in hits):
            continue
        b = toe_boost[k]
        p_keep = B["toe_keep"] * max(patchy(px, py, 57), B["toe_patch_floor"]) if b else R["toe_keep"] * patchy(px, py, 57)
        if rng.random() > p_keep or not spaced("toe", px, py, B["toe_spacing_m"] if b else R["toe_spacing_m"]):
            continue
        size = lo * (hi / lo) ** (rng.random() ** 1.6)
        if not free(px, py, size * 0.5) or skyline(px, py, pz + 0.6 * size):
            continue
        # half buried in the snow (review 2026-11-13: the small stones beside each, 5-50 cm, read as scattered shards;
        # deep snow would bury them, so they are gone)
        rock(px, py, pz - 0.35 * size, size)
        keep("toe", px, py)
        n_toe += 1
        n_toe_boost += b
    n_set = 0
    for px, py, size, what in ROCK_SET:  # the boulders set by hand, as outcrops
        hit, loc, nn, _i = ground.ray_cast(Vector((px, py, 300.0)), Vector((0.0, 0.0, -1.0)))
        if not hit:
            continue
        if skyline(px, py, loc.z + 0.4 * size):
            print(f"OUTSKIRTS ROCK SET left out ({px}, {py}): {what} stands on a still's skyline", flush=True)
            continue
        up = (nn.normalized() * 0.7 + Vector((0.0, 0.0, 0.3))).normalized()
        c = loc - nn.normalized() * (R["crop_sink"] * size)
        rock(c.x, c.y, c.z, size, up=up, tilt=0.3, flat=0.8)
        n_set += 1
    tris = sum(len(o.data.polygons) for o in out)
    print(f"OUTSKIRTS ROCKS {n_crop} outcrops ({n_boost} in the boosted places), {n_toe} stones at the feet of the steep "
          f"ground ({n_toe_boost} boosted), {n_set} set by hand ({len(out)} rocks, {tris} faces, {len(steep)} steep ground "
          f"vertices; {n_sky} left off the stills' skylines)", flush=True)
    return out


# ---------------------------------------------------------------- the stills' trees (review 2026-11-12)

_NEAR: dict = {}


def near_tree(vb, name: str, ratio: float | None = None):
    """The master of a tree near a still camera (after meshy_wild_build.near_tree): welded and smooth-shaded (the
    GLB's triangles come unwelded with flat normals and read as facets up close), its baked base of snow and spiky
    tufts sunk under the ground (TREE_BASE). `ratio`: decimated after welding (the forest's own LODs are decimated
    unwelded, which leaves holes and shards), for the trees further off."""
    key = (name, ratio)
    if key in _NEAR:
        return _NEAR[key]
    import bmesh
    import bpy
    me = vb.source(name).data.copy()
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bm.to_mesh(me)
    bm.free()
    if "custom_normal" in me.attributes:
        me.attributes.remove(me.attributes["custom_normal"])
    if ratio:
        tmp = bpy.data.objects.new("HM_NearTmp", me)
        bpy.context.scene.collection.objects.link(tmp)
        mod = tmp.modifiers.new("lod", "DECIMATE")
        mod.ratio = ratio
        dg = bpy.context.evaluated_depsgraph_get()
        low = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
        bpy.data.objects.remove(tmp, do_unlink=True)
        bpy.data.meshes.remove(me)
        me = low
    p = TREE_BASE.get(name)
    if p:
        _sink_base(me, p)
    me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
    me.update()
    o = bpy.data.objects.new(f"{name}@near{'' if ratio is None else ratio}", me)
    me.name = o.name
    vb.COL["src"].objects.link(o)
    _NEAR[key] = o
    return o


def _sink_base(me, p: dict) -> None:
    """Sink a tree mesh's baked base (TREE_BASE `p`, catalog metres): everything below za drops, the bare trunk between
    za and zb stretches down to meet the ground, the snow mound beyond r0..r1 of the axis sinks drop_r up to zr."""
    import numpy as np
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    r, zz0 = np.hypot(co[:, 0], co[:, 1]), co[:, 2].copy()
    za, zb, d = p["za"], p["zb"], p["drop"]
    zz = np.where(zz0 < za, zz0 - d, np.where(zz0 < zb, zb - (zb - zz0) * (zb - za + d) / (zb - za), zz0))

    def sst(e0, e1, v):
        t = np.clip((v - e0) / (e1 - e0), 0.0, 1.0)
        return t * t * (3.0 - 2.0 * t)
    wr = sst(p["r0"], p["r1"], r) * (1.0 - sst(p["zr"] - 0.2, p["zr"], zz0))
    co[:, 2] = np.minimum(zz, zz0 - p["drop_r"] * wr)
    me.vertices.foreach_set("co", co.ravel())
    me.update()


_SUNK: dict = {}


def sunk_mesh(me0, name: str):
    """A copy of a pine's own (LOD) mesh with its baked snow skirt sunk under the ground: the same faces, for the pines in
    the stills' frames beyond the near masters' reach (second review: they stood on flat discs of snow). None for a
    model without a TREE_BASE (the dead tree has no skirt)."""
    p = TREE_BASE.get(name)
    if p is None:
        return None
    if me0.name in _SUNK:
        return _SUNK[me0.name]
    me = me0.copy()
    _sink_base(me, p)
    me.name = f"{me0.name}@sunk"
    _SUNK[me0.name] = me
    return me


def view_eyes(cams: list) -> list:
    """The still cameras with their eye height over the finished ground: low (eye level) and high flags, heading."""
    import bpy
    from mathutils import Vector
    ground = bpy.data.objects.get("HM_Ground")

    def gz(x, y):
        if ground is None:
            return 0.0
        hit, loc, _n, _i = ground.ray_cast(Vector((x, y, 300.0)), Vector((0.0, 0.0, -1.0)))
        return loc.z if hit else 0.0
    out = []
    for c in cams:
        g = gz(c["x"], c["y"])
        ez = (g if c["ground"] else 0.0) + c["h"]
        above = ez - g
        out.append(dict(c, ez=ez, above=above, low=above < VIEW_TREES["low_m"], high=above >= VIEW_TREES["high_m"],
                        head=math.atan2(c["ty"] - c["y"], c["tx"] - c["x"]), half=math.atan(18.0 / c["lens"])))
    return out


def view_trees(vb, eyes: list) -> dict:
    """Clear the forest trees on and round the still cameras' sightlines (and VIEW_CLEAR's), give the near ones near
    masters and sink the skirts of the pines further off in the eye-level frames (VIEW_TREES). Trees inside the map,
    and those whose crowns reach over its edge, are never touched."""
    import bpy
    V = VIEW_TREES
    gone = full = half = sunk = 0
    tris = 0
    names = {e["name"] for e in eyes}
    clear = [(cx, cy, r) for cx, cy, r, view in VIEW_CLEAR if view in names]
    for o in list(vb.COL["forest"].objects):
        name = o.get("wdi_model")
        if name not in TREE_MODELS:
            continue
        x, y = o.location.x, o.location.y
        crown = V["crown_m"].get(name, 3.0) * o.scale[0]
        if math.hypot(max(abs(x) - MAP_RECT[2], 0.0), max(abs(y) - MAP_RECT[3], 0.0)) < crown + 0.5:
            continue  # inside the map, or its crown reaches over the map's edge: the village's trees stay as they are
        drop = any(math.hypot(x - cx, y - cy) < r for cx, cy, r in clear)
        near = low_near = math.inf
        for e in eyes:
            if drop:
                break
            if e["high"]:
                continue
            ax, ay = e["x"], e["y"]
            bx, by = ax + (e["tx"] - ax) * V["line_to"], ay + (e["ty"] - ay) * V["line_to"]
            dl, t = seg_dist(x, y, ax, ay, bx, by)
            if dl < V["line_m"] and t < 1.0:
                drop = True
                break
            de = math.hypot(x - ax, y - ay)
            off = abs((math.atan2(y - ay, x - ax) - e["head"] + math.pi) % (2.0 * math.pi) - math.pi)
            in_frame = off < e["half"] + math.atan2(crown, max(de, 0.1)) + 0.05
            if e["low"] and (de < V["clear_m"] or (de < V["cone_m"] and in_frame)):
                drop = True
                break
            if in_frame:
                near = min(near, de)
                if e["low"]:
                    low_near = min(low_near, de)
        if drop:
            bpy.data.objects.remove(o, do_unlink=True)
            gone += 1
            continue
        before = len(o.data.polygons)
        if near < V["near_m"]:
            o.data = near_tree(vb, name).data
            full += 1
        elif near < V["mid_m"]:
            o.data = near_tree(vb, name, V["mid_ratio"]).data
            half += 1
        elif low_near < V["sink_m"] and "@" not in o.data.name:
            me = sunk_mesh(o.data, name)
            if me is None:
                continue
            o.data = me
            sunk += 1
        else:
            continue
        tris += len(o.data.polygons) - before
    print(f"OUTSKIRTS VIEWS {len(eyes)} still cameras: {gone} forest trees cleared from their sightlines and lenses, "
          f"{full} near trees at full detail, {half} at {V['mid_ratio']}, {sunk} with their skirts sunk (near masters: "
          f"+{tris} faces)", flush=True)
    return dict(gone=gone, full=full, half=half, sunk=sunk, tris=tris)


def _extent(o):
    """World x and y extent, lowest and highest z of a placed object's own vertices."""
    import numpy as np
    me = o.data
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    m = np.array(o.matrix_world)
    w = co @ m[:3, :3].T + m[:3, 3]
    return (float(w[:, 0].max() - w[:, 0].min()), float(w[:, 1].max() - w[:, 1].min()), float(w[:, 2].min()),
            float(w[:, 2].max()))


def report(mp, placed: dict, removed, lights, water, notes, extra=None) -> None:
    tris = 0
    for p in PLACEMENTS:
        o = placed.get(p["key"])
        if o is None:
            continue
        fx, fy, z0, z1 = _extent(o)
        n = len(o.data.polygons)
        tris += n
        print(f"OUTSKIRTS MODEL {p['key']:18s} {p['model']:30s} at ({p['x']:7.2f}, {p['y']:7.2f}) base {o.location.z:6.2f} "
              f"(ground {mp.height(p['x'], p['y']):6.2f}) rot {p['rot']:5.1f} size {p['size']:5.2f} lod {p['lod']:.2f} "
              f"footprint {fx:5.2f} x {fy:5.2f} m (spec {p['foot'][0]:.2f} x {p['foot'][1]:.2f}) top {z1:6.2f} tris {n}",
              flush=True)
    for name, x, y in removed:
        print(f"OUTSKIRTS TREE removed {name} at ({x:.2f}, {y:.2f})", flush=True)
    for L in LIGHTS:
        g = mp.height(L["x"], L["y"])
        note = " (added by place() with the lamp post)" if L["auto"] else ""
        gain = f" gain {L['gain']}" if L["gain"] != 1.0 else ""
        print(f"OUTSKIRTS LIGHT {L['key']:22s} {L['kind']:7s} at ({L['x']:7.2f}, {L['y']:7.2f}, {L['z']:6.2f}) = ground {g:6.2f} "
              f"+ {L['z'] - g:5.2f} (spec + {L['above']:.2f}){gain}{note}", flush=True)
    wt = sum(len(o.data.polygons) for o in water)
    ex = extra or {}
    wall_f = sum(len(o.data.polygons) for o in ex.get("walls", []))
    rock_f = sum(len(o.data.polygons) for o in ex.get("rocks", []))
    print(f"OUTSKIRTS TOTAL {len(placed)} models ({tris} faces), {len(removed)} trees removed, "
          f"{len(lights)} lights added + {sum(1 for L in LIGHTS if L['auto'])} by place(), water {wt} faces, "
          f"{len(notes)} props settled, walls {wall_f} faces, {len(ex.get('rocks', []))} rocks ({rock_f} faces), "
          f"view trees {ex.get('trees', {})}", flush=True)


def build_outskirts(mp, vb, models: bool = True, forest: bool = True) -> dict:
    """Hook 3, after build_forest: clearings, models, props on their hosts, the trestle's gully, tree re-snap, stone
    walls, water, lights, the stills' trees, rocks and the summary. `vb` is the running meshy_village_build module."""
    es = _editset(mp)
    clamp = next((e for e in es.edits if isinstance(e, Clamp)), None)
    removed = clear_forest(vb) if forest else []
    placed, notes, lights, rocks, trees = {}, [], [], [], {}
    if models:
        placed = place_models(mp, vb)
        notes = settle_props(placed)
        if clamp is not None and clamp.model_key in placed:
            clamp_ground(placed[clamp.model_key], clamp)
    if forest:
        resnap_trees(mp, vb, clamp if clamp is not None and clamp.model_key in placed else None)
    smooth_up()  # the ground is final: its smoothed steepness for the bare-ground layer
    walls = build_walls(mp, vb)
    water = build_water_surfaces(vb, es)
    if models:
        lights = add_lights(vb, placed)
    eyes = view_eyes(view_cams())
    if forest:
        trees = view_trees(vb, eyes)
    if models:
        rocks = scatter_rocks(mp, vb, placed, eyes)
    report(mp, placed, removed, lights, water, notes, dict(walls=walls, rocks=rocks, trees=trees))
    return dict(placed=placed, removed=removed, lights=lights, water=water, walls=walls, rocks=rocks, trees=trees)
