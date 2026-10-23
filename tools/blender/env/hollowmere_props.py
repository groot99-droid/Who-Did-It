"""The map atlas `props_hollowmere` (art plan 3.5, 3.6): Hollowmere's own props and spots.

Single-tile frames only; the multi-tile props (the Wake Table, the hanging oak, the charcoal clamp, the beam
engine) are sliced like buildings and built by build_buildings.py (K4). Each entry is
`frame -> (art width, art height, builder)`, the builder standing its objects on the origin.
"""

from __future__ import annotations

import math
import random

from env.kitbash import B, C, F, S, T, back_panel, blob, frustum, kenney, part

TABLE_TOP = 0.78  # the Wake Table's top: a plate frame sits at that height (an overlay, depth bias 0.1)


def loaf(name, x, y, z, ribbon=False):
    objs = [part(f"{name}Crust", T("brass", 1), C(x, y, z, 0.11, 0.12, 10, rt=0.05), bevel=0.015),
            part(f"{name}Score", T("bone", 2), B(x, y - 0.03, z + 0.115, 0.1, 0.02, 0.01), outline=False)]
    objs[0].scale.x = 1.6
    if ribbon:
        objs.append(part(f"{name}Band", T("ink", 1), B(x, y, z + 0.06, 0.05, 0.24, 0.13), outline=False))
    return objs


# ---------------------------------------------------------------- the square, the bakery, the tavern


def bell():
    return [
        part("BellBase", T("stone", 3), B(0, 0, 0.06, 1.0, 0.46, 0.12), bevel=0.02),
        part("BellPosts", T("wood", 2), *[B(sx * 0.4, 0, 1.06, 0.14, 0.14, 1.9) for sx in (1, -1)],
             B(0, 0, 1.96, 1.0, 0.16, 0.14), bevel=0.02),
        part("BellRoof", T("slate", 1), (frustum, dict(z0=2.03, z1=2.2, bottom=(1.2, 0.42), top=(0.95, 0.06)))),
        part("Bell", T("brass", 1), C(0, 0, 1.38, 0.24, 0.12, 10), C(0, 0, 1.5, 0.21, 0.34, 10, rt=0.12),
             B(0, 0, 1.88, 0.08, 0.08, 0.06)),
        part("BellRope", T("bone", 1), B(0.04, -0.02, 1.06, 0.035, 0.035, 0.66)),
    ]


def oven():
    """Crumb's bread oven: stone base, brick dome, dark mouth, flue, a peel leaning on it."""
    return [part("OvenBase", T("stone", 3), B(0, 0, 0.35, 0.9, 0.86, 0.7), bevel=0.02),
            part("OvenDome", T("brick", 2), C(0, 0.04, 0.7, 0.42, 0.42, 12, rt=0.18), bevel=0.04),
            part("OvenMouth", F("lantern", 1), B(0, -0.38, 0.88, 0.32, 0.04, 0.2), outline=False),
            part("OvenFlue", T("brick", 1), B(0.12, 0.2, 1.3, 0.16, 0.16, 0.5)),
            part("Peel", T("wood", 4), B(0.45, -0.25, 0.65, 0.05, 0.05, 1.2), B(0.45, -0.25, 1.28, 0.22, 0.03, 0.18))]


def basin():
    return [part("BasinStand", T("stone", 3), B(0, 0, 0.3, 0.5, 0.42, 0.6), bevel=0.02),
            part("Basin", T("stone", 4), C(0, 0, 0.6, 0.32, 0.12, 12, rt=0.36)),
            part("BasinWater", F("moon", 2), C(0, 0, 0.7, 0.28, 0.02, 12), outline=False),
            part("Jug", T("bone", 1), C(0.28, 0.12, 0.6, 0.07, 0.2, 8, rt=0.05)),
            part("Rag", T("bone", 2), B(-0.2, -0.22, 0.45, 0.16, 0.02, 0.24), outline=False)]


def plate():
    rnd = random.Random("plate")
    return [part("Plate", T("bone", 2), C(0, 0, TABLE_TOP, 0.17, 0.02, 12, rt=0.19)),
            part("Crumbs", T("brass", 1), *[B(rnd.uniform(-0.08, 0.08), rnd.uniform(-0.08, 0.08), TABLE_TOP + 0.025,
                                              0.025, 0.025, 0.01) for _ in range(5)], outline=False)]


def dead_loaf():
    return [part("Ledge", T("stone", 3), B(0, 0, 0.36, 0.96, 0.7, 0.72), bevel=0.02)] + loaf("Dead", 0, 0, 0.72, True)


def ledger():
    return [part("Desk", T("wood", 3), (frustum, dict(z0=0.0, z1=0.95, bottom=(0.7, 0.5), top=(0.7, 0.38),
                                                      offset=(0, 0.05), top_offset=(0, 0.1)))),
            part("Ledger", T("blood", 1), B(0, 0.05, 0.98, 0.36, 0.26, 0.05)),
            part("Inkwell", T("ink", 1), C(0.26, 0.2, 0.95, 0.04, 0.07, 6))]


def flour_sacks():
    rnd = random.Random("sacks")
    sacks = [S(blob(x, y, 0.17, 0.13, [(0.1, 3, rnd.random() * 6)], n=12), 0, h)
             for x, y, h in ((-0.2, 0.12, 0.5), (0.18, 0.15, 0.45), (0.0, -0.12, 0.48))]
    return [part("Sacks", T("bone", 2), *sacks, bevel=0.06),
            part("Spill", T("bone", 3), S(blob(0.25, -0.28, 0.16, 0.08, [(0.2, 3, 0.4)], n=10), 0, 0.01),
                 outline=False)]


def dartboard():
    return [back_panel("Plank", T("wood", 3), 0.7, 1.6, 0.1),
            part("Board", T("ink", 1), C(0, 0.37, 1.35, 0.2, 0.04, 14)),
            part("Rings", T("bone", 1), C(0, 0.35, 1.35, 0.13, 0.02, 14), outline=False),
            part("Bull", F("blood", 2), C(0, 0.34, 1.35, 0.04, 0.02, 8), outline=False)]


def flour_bin():
    return [part("Bin", T("wood", 3), B(0, 0, 0.35, 0.6, 0.5, 0.7), bevel=0.02),
            part("BinLid", T("wood", 4), B(0, -0.02, 0.73, 0.64, 0.54, 0.06), bevel=0.01),
            part("Dust", T("bone", 3), S(blob(0.1, -0.33, 0.18, 0.06, [], n=10), 0, 0.005), outline=False)]


def gas_pocket():
    return [part("Rock", T("stone", 1), S(blob(0, 0.15, 0.48, 0.3, [(0.1, 4, 0.2)], n=16), 0, 1.2), outline=False),
            part("Crack", F("ink", 0), B(0, -0.15, 0.55, 0.3, 0.02, 0.9), outline=False),
            part("Tinge", F("moss", 2), B(0, -0.17, 0.35, 0.18, 0.02, 0.3), outline=False)]


def goat():
    return [part("Body", T("bone", 1), B(0, 0, 0.55, 0.3, 0.7, 0.32), bevel=0.06),
            part("Legs", T("stone", 2), *[B(sx * 0.1, sy * 0.25, 0.2, 0.06, 0.06, 0.4) for sx in (1, -1)
                                          for sy in (1, -1)]),
            part("Head", T("bone", 1), B(0, -0.42, 0.78, 0.18, 0.24, 0.2), bevel=0.04),
            part("Horns", T("stone", 3), *[B(sx * 0.06, -0.38, 0.92, 0.04, 0.12, 0.04) for sx in (1, -1)]),
            part("Tether", T("litter", 2), B(0.3, -0.3, 0.3, 0.02, 0.6, 0.02), outline=False)]


def key_cache():
    return [back_panel("Niche", T("stone", 3), 0.7, 1.4, 0.0),
            part("NicheDark", F("ink", 0), B(0, 0.37, 1.0, 0.3, 0.02, 0.36), outline=False),
            part("Key", T("brass", 2), B(0, 0.35, 1.0, 0.04, 0.02, 0.2), B(0, 0.35, 1.12, 0.1, 0.02, 0.06))]


def green_lamp():
    return [part("Table", T("wood", 3), B(0, 0, 0.35, 0.5, 0.5, 0.7)),
            part("Stem", T("brass", 1), C(0, 0, 0.7, 0.03, 0.3, 6)),
            part("Shade", T("moss", 2), C(0, 0, 0.98, 0.17, 0.14, 10, rt=0.08)),
            part("Glow", F("lantern", 3), C(0, 0, 0.94, 0.12, 0.04, 10), outline=False)]


def candle():
    return [part("Saucer", T("bone", 1), C(0, 0, 0.0, 0.14, 0.03, 10)),
            part("Candle", T("bone", 3), C(0, 0, 0.03, 0.04, 0.24, 8)),
            part("Flame", F("lantern", 3), B(0, 0, 0.32, 0.03, 0.03, 0.07), outline=False)]


def locked_door():
    return [back_panel("Door", T("wood", 2), 0.8, 2.0, 0.0),
            part("Panels", T("wood", 3), *[B(sx * 0.18, 0.38, z, 0.26, 0.02, 0.6) for sx in (1, -1)
                                           for z in (0.55, 1.35)], outline=False),
            part("LockPlate", T("brass", 2), B(0.28, 0.37, 1.0, 0.08, 0.02, 0.16), outline=False)]


def window():
    return [back_panel("Wall", T("plaster", 2), 0.9, 2.1, 0.0),
            part("Shutters", T("wood", 3), *[B(sx * 0.2, 0.37, 1.3, 0.36, 0.03, 0.8) for sx in (1, -1)]),
            part("Sill", T("stone", 4), B(0, 0.34, 0.86, 0.9, 0.12, 0.06))]


def fence():
    rails = [B(0, 0, z, 0.96, 0.07, 0.08) for z in (0.35, 0.7)]
    return [part("Posts", T("wood", 2), *[B(sx * 0.42, 0, 0.45, 0.1, 0.1, 0.9) for sx in (1, -1)]),
            part("Rails", T("wood", 3), rails[0]),
            part("Broken", T("wood", 3), B(-0.25, 0, 0.62, 0.5, 0.07, 0.08))]


def bench():
    return [kenney("furniture-kit", "desk", size=0.95, ramp=["#3A231F", "#744733", "#B57F54"]),
            part("Jars", T("teal", 0), *[C(x, 0.15, 0.78, 0.05, 0.14, 8) for x in (-0.25, -0.1, 0.2)])]


def planks():
    return [part("Planks", T("wood", 4), *[B(0, -0.1 + 0.05 * (k % 2), 0.05 + 0.1 * k, 0.95, 0.3, 0.08)
                                           for k in range(5)])]


def oil_barrel():
    return [kenney("survival-kit", "barrel", height=0.85, ramp=["#2C3240", "#3A4356", "#5E6C84"]),
            part("Spigot", T("brass", 1), B(0, -0.27, 0.22, 0.05, 0.1, 0.05))]


def letter_box():
    return [back_panel("Wall", T("stone", 3), 0.8, 1.6, 0.0),
            part("Box", F("blood", 1), B(0, 0.34, 1.0, 0.3, 0.1, 0.36)),
            part("Slot", F("ink", 0), B(0, 0.28, 1.08, 0.18, 0.01, 0.03), outline=False)]


def shelf():
    return [kenney("furniture-kit", "bookcaseOpen", height=1.9, ramp=["#24171A", "#55332A", "#94603F"]),
            part("Bottles", T("teal", 0), *[C(x, -0.05, z, 0.04, 0.16, 6) for x in (-0.25, -0.05, 0.2)
                                           for z in (0.95, 1.4)], outline=False)]


def rope():
    return [part("Rope", T("bone", 1), B(0, 0.1, 1.5, 0.04, 0.04, 2.6)),
            part("Sally", T("blood", 1), B(0, 0.1, 0.9, 0.08, 0.08, 0.3))]


def clock():
    return [part("Case", T("wood", 2), B(0, 0.25, 1.05, 0.5, 0.34, 2.1), bevel=0.02),
            part("Hood", T("wood", 3), B(0, 0.25, 2.18, 0.58, 0.4, 0.16)),
            part("Face", T("bone", 2), C(0, 0.07, 1.75, 0.17, 0.02, 12), outline=False),
            part("Hands", T("ink", 1), B(-0.04, 0.05, 1.79, 0.02, 0.01, 0.12), B(0.03, 0.05, 1.76, 0.09, 0.01, 0.02),
                 outline=False)]


def safe():
    return [part("Safe", T("slate", 1), B(0, 0, 0.4, 0.66, 0.6, 0.8), bevel=0.03),
            part("Dial", T("brass", 2), C(0.05, -0.31, 0.5, 0.06, 0.03, 10), outline=False),
            part("Handle", T("bone", 1), B(-0.18, -0.31, 0.45, 0.04, 0.02, 0.18), outline=False)]


def crepe():
    """Black mourning crepe swagged over the manor's front door (an overlay, depth bias 0.1)."""
    return [part("Crepe", T("ink", 1), B(0, -0.55, 2.2, 0.9, 0.05, 0.16),
                 *[B(sx * 0.4, -0.55, 1.75, 0.12, 0.04, 0.8) for sx in (1, -1)]),
            part("Bow", T("slate", 1), B(0, -0.58, 2.2, 0.2, 0.04, 0.14))]


def scarecrow():
    return [part("Pole", T("wood", 2), B(0, 0, 0.9, 0.08, 0.08, 1.8), B(0, 0, 1.45, 1.0, 0.07, 0.07)),
            part("Coat", T("litter", 1), (frustum, dict(z0=0.8, z1=1.5, bottom=(0.55, 0.3), top=(0.42, 0.24)))),
            part("Head", T("bone", 1), C(0, 0, 1.55, 0.13, 0.24, 8), bevel=0.04),
            part("Hat", T("ink", 1), C(0, 0, 1.78, 0.2, 0.04, 10), C(0, 0, 1.82, 0.11, 0.12, 10))]


def photos():
    return [back_panel("Wall", T("plaster", 2), 0.9, 1.9, 0.0),
            part("Frames", T("wood", 1), *[B(x, 0.37, z, w, 0.03, h) for x, z, w, h in
                                           ((-0.22, 1.3, 0.24, 0.3), (0.14, 1.36, 0.3, 0.24), (0.0, 0.98, 0.22, 0.26))]),
            part("Prints", T("fog", 1), *[B(x, 0.355, z, w - 0.06, 0.01, h - 0.06) for x, z, w, h in
                                          ((-0.22, 1.3, 0.24, 0.3), (0.14, 1.36, 0.3, 0.24), (0.0, 0.98, 0.22, 0.26))],
                 outline=False)]


def portrait():
    return [back_panel("Wall", T("plaster", 2), 0.9, 2.1, 0.0),
            part("Back", T("wood", 3), B(0, 0.34, 1.25, 0.6, 0.05, 0.8)),
            part("Stretcher", T("wood", 2), B(0, 0.31, 1.25, 0.6, 0.02, 0.06), B(0, 0.31, 1.25, 0.06, 0.02, 0.8),
                 outline=False)]


def drowned_lantern():
    return [part("Post", T("wood", 1), B(0, 0, 0.5, 0.1, 0.1, 1.0)),
            part("Lantern", T("ink", 1), B(0, -0.08, 1.0, 0.18, 0.18, 0.24)),
            part("Glass", F("lantern", 2), B(0, -0.12, 1.0, 0.12, 0.12, 0.16), outline=False),
            part("Water", F("moon", 1), S(blob(0, 0, 0.3, 0.2, [], n=12), 0, 0.01), outline=False)]


def den():
    return [part("Rock", T("stone", 2), S(blob(0, 0.1, 0.48, 0.38, [(0.12, 5, 0.6)], n=16), 0, 1.0), bevel=0.05),
            part("Mouth", F("ink", 0), S(blob(0, -0.25, 0.22, 0.04, [], n=10), 0.0, 0.55), outline=False),
            part("Bones", T("bone", 2), B(0.2, -0.38, 0.03, 0.18, 0.04, 0.03), outline=False)]


def ore_cart():
    return [part("Rails", T("stone", 2), *[B(0, y, 0.02, 1.0, 0.05, 0.04) for y in (-0.2, 0.2)], outline=False),
            part("Tub", T("brick", 1), (frustum, dict(z0=0.18, z1=0.6, bottom=(0.5, 0.42), top=(0.66, 0.5)))),
            part("Wheels", T("ink", 1), *[B(sx * 0.2, sy * 0.24, 0.12, 0.14, 0.04, 0.14) for sx in (1, -1)
                                          for sy in (1, -1)]),
            part("Ore", T("stone", 1), S(blob(0, 0, 0.25, 0.2, [(0.2, 4, 0.2)], n=10), 0.55, 0.66))]


def tin_crate():
    return [part("Crate", T("wood", 3), B(0, 0, 0.3, 0.6, 0.55, 0.6), bevel=0.02),
            part("Slats", T("wood", 2), *[B(0, -0.28, z, 0.62, 0.02, 0.06) for z in (0.12, 0.48)], outline=False),
            part("Stencil", F("slate", 1), B(0.05, -0.29, 0.3, 0.2, 0.01, 0.12), outline=False)]


# ---------------------------------------------------------------- spots (3.6)


def _crates(n=3):
    rnd = random.Random(f"crates{n}")
    return [kenney("survival-kit", "box-large", height=0.5, ramp=["#3A231F", "#744733", "#B57F54"],
                   at=(x, y, z), rot=rnd.uniform(-0.3, 0.3))
            for x, y, z in ((-0.2, 0.12, 0), (0.22, -0.1, 0), (0.0, 0.05, 0.5))[:n]]


def floor_spot(colour_ramp, i, wet=None):
    rnd = random.Random(f"floor{colour_ramp}{i}")
    objs = [part("Patch", T(colour_ramp, i), S(blob(0, 0, 0.42, 0.36, [(0.12, 5, rnd.random() * 6)], n=16), 0, 0.03))]
    if wet:
        objs.append(part("Wet", F(*wet), S(blob(0.05, -0.02, 0.28, 0.2, [(0.15, 4, 0.3)], n=12), 0.03, 0.035),
                         outline=False))
    return objs


def _flour_heap():
    """A heap of farine sacks, one on top (the mixing and proofing rooms)."""
    rnd = random.Random("heap")
    sacks = [S(blob(x, y, 0.2, 0.15, [(0.1, 3, rnd.random() * 6)], n=12), z, z + 0.45)
             for x, y, z in ((-0.2, 0.15, 0), (0.2, 0.12, 0), (0.0, -0.15, 0), (0.0, 0.05, 0.45))]
    return [part("Sacks", T("bone", 2), *sacks, bevel=0.07),
            part("Scoop", T("wood", 4), B(0.05, 0.05, 0.98, 0.05, 0.05, 0.25))]


def _bread_rack():
    """The oven room's wooden rack of loaves."""
    posts = [B(x, y, 0.75, 0.06, 0.06, 1.5) for x in (-0.4, 0.4) for y in (-0.2, 0.2)]
    out = [part("Rack", T("wood", 2), *posts, *[B(0, 0, z, 0.86, 0.46, 0.04) for z in (0.3, 0.75, 1.2)])]
    for j, z in enumerate((0.32, 0.77, 1.22)):
        for i in range(3):
            out += loaf(f"Rack{j}{i}", -0.25 + 0.25 * i, 0.0, z)
    return out


def _wood_box():
    """Split logs for the oven in an open box."""
    return [part("Box", T("wood", 2), B(0, 0, 0.25, 0.8, 0.6, 0.5), bevel=0.02),
            part("Logs", T("wood", 4), *[C(-0.25 + 0.17 * i, 0.0, 0.42, 0.07, 0.04, 6) for i in range(4)]),
            part("Hollow", F("ink", 0), B(0, 0, 0.5, 0.7, 0.5, 0.01), outline=False)]


def _tray_stack():
    """Couche trays stacked by the proofing room's wall."""
    return [part("Trays", T("wood", 3), *[B(0, 0, 0.08 + 0.17 * k, 0.8, 0.6, 0.14) for k in range(8)], bevel=0.01),
            part("Linen", T("plaster", 3), B(0, 0, 1.43, 0.7, 0.5, 0.02), outline=False)]


SPOTS = {
    "spot_breadRack": (64, 112, _bread_rack),
    "spot_flourSacks": (64, 80, _flour_heap),
    "spot_trayStack": (64, 96, _tray_stack),
    "spot_woodBox": (64, 64, _wood_box),
    "spot_cratePile": (64, 96, lambda: _crates(3)),
    "spot_crates": (64, 80, lambda: _crates(2)),
    "spot_cryptNiche": (64, 112, lambda: [kenney("graveyard-kit", "crypt-small", size=0.95,
                                                 ramp=["#2E2A2D", "#5E5553", "#9A9083"])]),
    "spot_dumpSpot": (64, 48, lambda: floor_spot("litter", 0)),
    "spot_hayPile": (64, 80, lambda: [kenney("graveyard-kit", "hay-bale", size=0.9,
                                             ramp=["#5C4A2A", "#80683A", "#DCC4A1"])]),
    "spot_poolNiche": (64, 48, lambda: floor_spot("stone", 1, wet=("moon", 1))),
    "spot_trunk": (64, 64, lambda: [kenney("graveyard-kit", "trunk", size=0.8, ramp=["#24171A", "#55332A", "#94603F"])]),
    "spot_atticHatch": (64, 48, lambda: [part("Hatch", T("wood", 3), B(0, 0, 0.02, 0.7, 0.7, 0.04)),
                                         part("Gap", F("ink", 0), B(0, -0.2, 0.045, 0.6, 0.12, 0.01), outline=False)]),
    "spot_cart": (64, 96, lambda: [kenney("fantasy-town-kit", "cart", size=0.95, ramp=["#3A231F", "#744733", "#B57F54"])]),
    "spot_confessional": (64, 128, lambda: [part("Booth", T("wood", 2), B(0, 0.1, 1.0, 0.9, 0.7, 2.0), bevel=0.02),
                                             part("Curtain", T("blood", 1), B(0.15, -0.26, 0.9, 0.4, 0.03, 1.5)),
                                             part("Grille", T("ink", 1), B(-0.25, -0.26, 1.3, 0.2, 0.02, 0.2))]),
    "spot_curtain": (64, 112, lambda: [part("Rod", T("brass", 0), B(0, 0.3, 2.0, 0.95, 0.04, 0.04)),
                                       part("Drape", T("blood", 1), *[B(-0.35 + 0.14 * k, 0.3 - 0.03 * (k % 2), 1.0,
                                                                        0.14, 0.05, 1.95) for k in range(6)])]),
    "spot_hedge": (64, 80, lambda: [part("Hedge", T("moss", 2), B(0, 0, 0.45, 0.9, 0.8, 0.9), bevel=0.12)]),
    "spot_herbLoft": (64, 112, lambda: [part("Rack", T("wood", 2), B(0, 0.3, 1.8, 0.95, 0.05, 0.05)),
                                         part("Herbs", T("moss", 2), *[B(-0.36 + 0.18 * k, 0.3, 1.55, 0.1, 0.08, 0.45)
                                                                        for k in range(5)], bevel=0.03)]),
    "spot_kegStack": (64, 96, lambda: [kenney("survival-kit", "barrel", height=0.5, ramp=["#24171A", "#55332A", "#94603F"],
                                              at=(x, y, z), rot=math.pi / 2)
                                       for x, y, z in ((-0.2, 0.0, 0.0), (0.2, 0.0, 0.0), (0.0, 0.0, 0.45))]),
    "spot_pantry": (64, 112, lambda: [kenney("furniture-kit", "bookcaseClosedWide", size=0.95,
                                             ramp=["#3A231F", "#744733", "#B57F54"])]),
    "spot_stalagmite": (64, 96, lambda: [part("Stalagmite", T("stone", 3), C(0, 0, 0, 0.3, 1.3, 8, rt=0.03), bevel=0.03),
                                          part("Small", T("stone", 2), C(0.25, -0.15, 0, 0.12, 0.5, 6, rt=0.02))]),
    "spot_wineRack": (64, 112, lambda: [part("Rack", T("wood", 2), B(0, 0.2, 0.9, 0.9, 0.4, 1.8), bevel=0.02),
                                         part("Necks", T("moss", 0), *[B(-0.3 + 0.2 * i, -0.02, 0.3 + 0.35 * j, 0.06, 0.04,
                                                                         0.06) for i in range(4) for j in range(4)],
                                              outline=False)]),
    "spot_hollowLog": (64, 64, lambda: [part("Log", T("wood", 2), B(0, 0, 0.25, 0.9, 0.5, 0.5), bevel=0.12),
                                        part("Hole", F("ink", 0), B(-0.46, 0, 0.25, 0.02, 0.32, 0.32), outline=False)]),
    "spot_reeds": (64, 96, lambda: [part("Reeds", T("litter", 2), *[B(math.cos(a) * r, math.sin(a) * r, 0.5, 0.04, 0.04,
                                                                    rnd_h) for a, r, rnd_h in
                                                                  [(k * 2.4, 0.08 + 0.03 * (k % 7), 0.8 + 0.05 * (k % 5))
                                                                   for k in range(16)]], outline=False),
                                    part("Water", F("moon", 1), S(blob(0, 0, 0.42, 0.34, [], n=14), 0, 0.01),
                                         outline=False)]),
    "spot_bog": (64, 48, lambda: floor_spot("moss", 0, wet=("moss", 1))),
    "spot_charcoalPit": (64, 48, lambda: floor_spot("ink", 1) + [part("Embers", F("lantern", 1),
                                                                      S(blob(0, 0, 0.12, 0.08, [], n=8), 0.03, 0.04),
                                                                      outline=False)]),
    "spot_oreChute": (64, 96, lambda: [part("Chute", T("wood", 3), (frustum, dict(z0=0.0, z1=1.2, bottom=(0.6, 0.6),
                                                                                top=(0.5, 0.3), offset=(0, -0.1),
                                                                                top_offset=(0, 0.25)))),
                                        part("Mouth", F("ink", 0), B(0, -0.41, 0.25, 0.4, 0.02, 0.3), outline=False)]),
}


PROPS = {
    "prop_bell": (64, 128, bell),
    "prop_oven": (64, 96, oven),
    "prop_basin": (64, 64, basin),
    "prop_plate": (64, 64, plate),
    "prop_deadLoaf": (64, 80, dead_loaf),
    "prop_ledger": (64, 80, ledger),
    "prop_flour_sacks": (64, 64, flour_sacks),
    "prop_dartboard": (64, 96, dartboard),
    "prop_flourBin": (64, 64, flour_bin),
    "prop_gasPocket": (64, 64, gas_pocket),
    "prop_goat": (64, 64, goat),
    "prop_keyCache": (64, 64, key_cache),
    "prop_green_lamp": (64, 64, green_lamp),
    "prop_candle": (64, 64, candle),
    "prop_lockedDoor": (64, 112, locked_door),
    "prop_window": (64, 112, window),
    "prop_fence": (64, 56, fence),
    "prop_bench": (64, 64, bench),
    "prop_planks": (64, 64, planks),
    "prop_oil_barrel": (64, 64, oil_barrel),
    "prop_letter_box": (64, 80, letter_box),
    "prop_shelf": (64, 112, shelf),
    "prop_rope": (64, 112, rope),
    "prop_clock": (64, 128, clock),
    "prop_safe": (64, 80, safe),
    "prop_crepe": (64, 112, crepe),
    "prop_scarecrow": (64, 112, scarecrow),
    "prop_photos": (64, 96, photos),
    "prop_portrait": (64, 112, portrait),
    "prop_drowned_lantern": (64, 80, drowned_lantern),
    "prop_den": (64, 96, den),
    "prop_ore_cart": (64, 64, ore_cart),
    "prop_tin_crate": (64, 64, tin_crate),
    **SPOTS,
}
