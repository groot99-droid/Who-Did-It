"""The map atlas `props_blackpine` (art plan 3.5, 3.6): Blackpine's own props and spots.

Single-tile frames; the multi-tile ones (the trestle, the mess table, the bunks, the head saw, the kilns, the
map table, the forge) are sliced by build_buildings.py. Same contract as env/hollowmere_props.py.
"""

from __future__ import annotations

import math
import random

from env.kitbash import B, C, F, S, T, back_panel, blob, frustum, kenney, part

WOODR = ["#3A231F", "#744733", "#B57F54"]


def bell():
    """The shift bell: an iron bell under a pole gallows."""
    return [part("Poles", T("wood", 2), B(-0.38, 0, 1.05, 0.12, 0.12, 2.1), B(0.38, 0, 1.05, 0.12, 0.12, 2.1),
                 B(0, 0, 2.1, 0.95, 0.12, 0.12)),
            part("Bell", T("slate", 1), C(0, 0, 1.4, 0.2, 0.1, 10), C(0, 0, 1.5, 0.18, 0.32, 10, rt=0.1)),
            part("Chain", T("ink", 1), B(0, 0, 1.95, 0.03, 0.03, 0.25), outline=False),
            part("Rope", T("bone", 1), B(0.05, -0.02, 1.0, 0.03, 0.03, 0.8))]


def oven():
    """The bunkhouse's iron range."""
    return [part("Range", T("ink", 1), B(0, 0, 0.42, 0.9, 0.6, 0.84), bevel=0.02),
            part("Top", T("slate", 1), B(0, 0, 0.86, 0.94, 0.64, 0.04)),
            part("Firebox", F("lantern", 1), B(-0.2, -0.31, 0.4, 0.26, 0.02, 0.16), outline=False),
            part("Pipe", T("slate", 0), C(0.3, 0.2, 0.88, 0.07, 1.3, 8)),
            part("Kettle", T("slate", 2), C(-0.15, 0.05, 0.88, 0.12, 0.16, 8, rt=0.08))]


def trough():
    return [part("Trough", T("wood", 3), B(0, 0, 0.25, 0.95, 0.5, 0.5), bevel=0.02),
            part("Water", F("moon", 1), B(0, 0, 0.47, 0.82, 0.38, 0.04), outline=False)]


def flume():
    return [part("Legs", T("wood", 2), *[B(sx * 0.35, sy * 0.3, 0.75, 0.08, 0.08, 1.5) for sx in (1, -1)
                                          for sy in (1, -1)]),
            part("Chute", T("wood", 3), B(0, 0, 1.55, 0.6, 1.0, 0.1), B(0.28, 0, 1.7, 0.05, 1.0, 0.3),
                 B(-0.28, 0, 1.7, 0.05, 1.0, 0.3)),
            part("Water", F("moon", 2), B(0, 0, 1.62, 0.5, 1.0, 0.03), outline=False)]


def pegs():
    return [back_panel("Board", T("wood", 3), 0.9, 1.7, 0.1),
            part("Coats", T("litter", 1), *[B(x, 0.32, 1.25, 0.22, 0.08, 0.6) for x in (-0.25, 0.25)], bevel=0.03),
            part("Lamp", F("lantern", 3), B(0, 0.34, 1.6, 0.1, 0.06, 0.14), outline=False)]


def gearing():
    return [part("Frame", T("wood", 2), B(0, 0.1, 1.0, 0.8, 0.3, 2.0)),
            part("Gear", T("wood", 3), C(0, -0.1, 0.9, 0.38, 0.12, 12)),
            part("Gear2", T("wood", 4), C(0.15, -0.1, 1.55, 0.22, 0.12, 10)),
            part("Shaft", T("ink", 1), B(0, -0.1, 1.2, 0.06, 0.4, 0.06))]


def plank_stack():
    return [part("Planks", T("wood", 4), *[B(0, 0.03 * (k % 2), 0.06 + 0.1 * k, 0.95, 0.5, 0.08) for k in range(7)]),
            part("Sticks", T("wood", 2), *[B(0, y, 0.35, 0.95, 0.04, 0.6) for y in (-0.2, 0.2)], outline=False)]


def tally_board():
    return [back_panel("Board", T("slate", 0), 0.9, 1.2, 0.5),
            part("Chalk", T("bone", 2), *[B(-0.3 + 0.07 * k, 0.37, 1.1 + (0.2 if k % 5 == 4 else 0), 0.02, 0.01,
                                            0.25) for k in range(10)], outline=False),
            part("Lamp", F("lantern", 3), B(0.4, 0.34, 1.75, 0.1, 0.06, 0.14), outline=False)]


def powder_kegs():
    return [kenney("survival-kit", "barrel", height=0.45, ramp=WOODR, at=(x, y, z))
            for x, y, z in ((-0.2, 0.1, 0.0), (0.2, -0.1, 0.0), (0.0, 0.05, 0.43))] + [
        part("Labels", F("blood", 1), B(-0.2, -0.13, 0.25, 0.12, 0.01, 0.08), outline=False)]


def ore_cart():
    return [part("Rails", T("brick", 1), *[B(0, y, 0.02, 1.0, 0.05, 0.04) for y in (-0.2, 0.2)], outline=False),
            part("Tub", T("slate", 1), (frustum, dict(z0=0.18, z1=0.6, bottom=(0.5, 0.42), top=(0.66, 0.5)))),
            part("Wheels", T("ink", 1), *[B(sx * 0.2, sy * 0.24, 0.12, 0.14, 0.04, 0.14) for sx in (1, -1)
                                          for sy in (1, -1)]),
            part("Ore", T("brick", 2), S(blob(0, 0, 0.25, 0.2, [(0.2, 4, 0.2)], n=10), 0.55, 0.66))]


def shelves():
    return [kenney("furniture-kit", "bookcaseOpenLow", height=1.6, ramp=["#24171A", "#55332A", "#94603F"]),
            part("Tins", T("slate", 2), C(-0.2, -0.05, 0.85, 0.06, 0.12, 8), outline=False)]


def ledger_desk():
    return [kenney("furniture-kit", "desk", size=0.9, ramp=WOODR),
            part("Ledger", T("bone", 2), B(0, 0, 0.8, 0.4, 0.3, 0.03)),
            part("Torn", T("bone", 3), B(0.22, -0.12, 0.82, 0.1, 0.08, 0.01), outline=False)]


def safe():
    return [part("Safe", T("slate", 1), B(0, 0, 0.4, 0.66, 0.6, 0.8), bevel=0.03),
            part("Dial", T("brass", 2), C(0.05, -0.31, 0.5, 0.06, 0.03, 10), outline=False)]


def telephone():
    return [back_panel("Wall", T("wood", 3), 0.8, 1.9, 0.0),
            part("Box", T("wood", 2), B(0, 0.34, 1.3, 0.3, 0.1, 0.45)),
            part("Bells", T("brass", 2), *[C(sx * 0.08, 0.28, 1.5, 0.05, 0.03, 8) for sx in (1, -1)], outline=False),
            part("Cord", T("ink", 1), B(0.12, 0.28, 1.05, 0.02, 0.02, 0.3), outline=False)]


def anvil():
    return [part("Stump", T("wood", 3), C(0, 0, 0, 0.26, 0.5, 10)),
            part("Anvil", T("ink", 1), B(0, 0, 0.6, 0.45, 0.2, 0.18), B(0.28, 0, 0.64, 0.14, 0.12, 0.08))]


def tool_rack():
    return [back_panel("Rack", T("wood", 2), 0.9, 1.8, 0.0),
            part("Tools", T("slate", 2), *[B(-0.3 + 0.15 * k, 0.33, 1.2, 0.04, 0.03, 0.7) for k in range(5)],
                 outline=False)]


def refuge_table():
    return [part("Table", T("wood", 2), B(0, 0, 0.7, 0.8, 0.6, 0.06), *[B(sx * 0.33, sy * 0.24, 0.35, 0.06, 0.06,
                                                                        0.7) for sx in (1, -1) for sy in (1, -1)]),
            part("Lamp", T("brass", 1), C(0.1, 0, 0.73, 0.08, 0.18, 8)),
            part("Flame", F("lantern", 3), B(0.1, 0, 0.95, 0.04, 0.04, 0.08), outline=False)]


def tin_crate():
    return [part("Crate", T("wood", 3), B(0, 0, 0.3, 0.6, 0.55, 0.6), bevel=0.02),
            part("Stencil", F("slate", 1), B(0.05, -0.29, 0.3, 0.2, 0.01, 0.12), outline=False)]


def floor_spot(ramp, i, wet=None):
    rnd = random.Random(f"bpfloor{ramp}{i}")
    objs = [part("Patch", T(ramp, i), S(blob(0, 0, 0.42, 0.36, [(0.12, 5, rnd.random() * 6)], n=16), 0, 0.03))]
    if wet:
        objs.append(part("Wet", F(*wet), S(blob(0.04, 0, 0.28, 0.2, [], n=12), 0.03, 0.035), outline=False))
    return objs


SPOTS = {
    "spot_oreBin": (64, 80, lambda: [part("Bin", T("wood", 2), B(0, 0, 0.4, 0.9, 0.8, 0.8)),
                                     part("Ore", T("brick", 1), S(blob(0, 0, 0.35, 0.3, [(0.2, 4, 0.1)], n=12), 0.8, 0.9))]),
    "spot_logPile": (64, 80, lambda: [kenney("nature-kit", "log_stack", size=0.95,
                                             colours={"woodBark": "#55332A", "woodInner": "#B57F54"})]),
    "spot_barrel": (64, 80, lambda: [kenney("survival-kit", "barrel", height=0.85, ramp=WOODR)]),
    "spot_woodBox": (64, 64, lambda: [part("Box", T("wood", 3), B(0, 0, 0.3, 0.8, 0.6, 0.6), bevel=0.02),
                                      part("Split", T("wood", 4), *[B(-0.25 + 0.17 * k, 0, 0.62, 0.12, 0.5, 0.1)
                                                                    for k in range(4)])]),
    "spot_rootCellar": (64, 48, lambda: [part("Doors", T("wood", 3), B(0, 0, 0.08, 0.8, 0.7, 0.16)),
                                         part("Seam", F("ink", 0), B(0, 0, 0.17, 0.02, 0.7, 0.01), outline=False)]),
    "spot_sawdustPile": (64, 64, lambda: [part("Dust", T("plaster", 2), S(blob(0, 0, 0.44, 0.38, [(0.1, 5, 0.3)],
                                                                               n=16), 0, 0.4), bevel=0.15)]),
    "spot_logChute": (64, 96, lambda: [part("Chute", T("wood", 3), (frustum, dict(z0=0.0, z1=1.1, bottom=(0.7, 0.9),
                                                                                top=(0.7, 0.2), offset=(0, 0.0),
                                                                                top_offset=(0, 0.35))))]),
    "spot_pool": (64, 48, lambda: floor_spot("stone", 1, wet=("moon", 0))),
    "spot_oreCart": (64, 64, ore_cart),
    "spot_oldStope": (64, 80, lambda: [part("Rock", T("stone", 1), B(0, 0.2, 0.6, 0.95, 0.5, 1.2)),
                                       part("Dark", F("ink", 0), B(0, -0.06, 0.45, 0.55, 0.02, 0.8), outline=False),
                                       part("Props", T("wood", 3), *[B(sx * 0.32, -0.08, 0.45, 0.1, 0.1, 0.9)
                                                                     for sx in (1, -1)])]),
    "spot_strongroom": (64, 112, lambda: [part("Door", T("slate", 1), B(0, 0.3, 1.0, 0.85, 0.2, 2.0), bevel=0.02),
                                          part("Wheel", T("brass", 1), C(0, 0.19, 1.0, 0.18, 0.04, 12))]),
    "spot_coalBin": (64, 64, lambda: [part("Bin", T("slate", 1), B(0, 0, 0.3, 0.8, 0.6, 0.6)),
                                      part("Coal", T("ink", 1), S(blob(0, 0, 0.32, 0.24, [(0.2, 4, 0.3)], n=12), 0.6, 0.7))]),
    "spot_bunk": (64, 112, lambda: [kenney("furniture-kit", "bedBunk", size=0.95, ramp=WOODR + ["#B2AA99"])]),
    "spot_orePillar": (64, 112, lambda: [part("Pillar", T("stone", 2), C(0, 0, 0, 0.36, 2.2, 8, rt=0.3), bevel=0.05),
                                         part("Streaks", F("brick", 1), *[B(0.3 * math.cos(a), 0.3 * math.sin(a), 1.1,
                                                                            0.05, 0.05, 1.2) for a in (0.5, 2.5)],
                                              outline=False)]),
}

PROPS = {
    "prop_bell": (64, 128, bell),
    "prop_oven": (64, 96, oven),
    "prop_basin": (64, 64, trough),
    "prop_flume": (64, 96, flume),
    "prop_pegs": (64, 96, pegs),
    "prop_gearing": (64, 112, gearing),
    "prop_plank_stack": (64, 80, plank_stack),
    "prop_tally_board": (64, 96, tally_board),
    "prop_powder_kegs": (64, 64, powder_kegs),
    "prop_ore_cart_0": (64, 64, ore_cart),
    "prop_shelves": (64, 112, shelves),
    "prop_ledger_desk": (64, 80, ledger_desk),
    "prop_safe": (64, 80, safe),
    "prop_telephone": (64, 96, telephone),
    "prop_anvil": (64, 64, anvil),
    "prop_tool_rack": (64, 112, tool_rack),
    "prop_refuge_table": (64, 80, refuge_table),
    "prop_tin_crate": (64, 64, tin_crate),
    **SPOTS,
}
