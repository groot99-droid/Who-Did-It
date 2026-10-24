"""The map atlas `props_hollowmere` (art plan 3.5, 3.6): Hollowmere's own props and spots.

Single-tile frames only; the multi-tile props (the Wake Table, the hanging oak, the charcoal clamp, the beam
engine) are sliced like buildings and built by build_buildings.py (K4). Each entry is
`frame -> (art width, art height, builder)`, the builder standing its objects on the origin.
"""

from __future__ import annotations

import math
import random

from env.kitbash import B, C, F, S, T, back_panel, blob, frustum, kenney, part
import static_common as sc  # noqa: E402  (on the path once env.kitbash is imported)

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
            part("Face", T("bone", 3), C(0, 0.07, 1.75, 0.17, 0.02, 12), outline=False),
            part("Trunk", F("ink", 0), B(0, 0.075, 1.05, 0.2, 0.01, 0.6), outline=False),
            part("Bob", T("brass", 2), B(0, 0.07, 0.86, 0.12, 0.01, 0.12), B(0, 0.07, 1.1, 0.02, 0.01, 0.4),
                 outline=False),
            part("Finials", T("brass", 2), *[C(sx * 0.22, 0.25, 2.26, 0.03, 0.08, 6) for sx in (1, -1, 0)]),
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


# ---------------------------------------------------------------- St Brannock's (round 8, 8J: art.md 4.2)


def on_wall(objs, dy=-0.89):
    """Hang art on the kit's own full wall (build_kit.py, harbour, variant 0) instead of a thin board at the
    tile's back edge, which the neighbouring wall blocks hide: the board is dropped and the rest moves `dy`
    onto the wall's room-facing (south) face."""
    import build_kit as bk

    keep = []
    for o in objs:
        if o.name.startswith("Wall"):
            sc.clear([o])
            continue
        o.location.y += dy
        keep.append(o)
    return bk.wall("harbour", "full", 0, None) + keep


def turned(objs):
    """The same art turned a quarter so its front faces east (+X): for things hung on a west wall."""
    for o in objs:
        x, y, z = o.location
        o.location = (-y, x, z)
        o.rotation_euler.z += math.pi / 2
    return objs


def lancet(name, cx, y, z0, w, h, mat):
    """A pointed window opening as stepped boxes (it reads as an arch at 64 px)."""
    steps = [B(cx, y, z0 + h / 2, w, 0.02, h)]
    for k, f in enumerate((0.78, 0.52, 0.26)):
        steps.append(B(cx, y, z0 + h + 0.05 + 0.1 * k, w * f, 0.02, 0.1))
    return part(name, mat, *steps, outline=False)


def stained_glass():
    """A lancet of coloured glass in the north wall: moon blue, teal, blood and brass panes, leaded, one cracked."""
    panes = [("moon", 3), ("teal", 1), ("blood", 2), ("brass", 2), ("moon", 4), ("teal", 2), ("moon", 2), ("blood", 1)]
    glass = [part(f"Pane{k}", F(r, i), B(-0.11 + 0.22 * (k % 2), 0.37, 0.92 + 0.26 * (k // 2), 0.2, 0.02, 0.24),
                  outline=False) for k, (r, i) in enumerate(panes)]
    return [back_panel("Wall", T("plaster", 2), 0.9, 2.3, 0.0),
            part("Jambs", T("stone", 4), *[B(sx * 0.27, 0.35, 1.3, 0.08, 0.08, 1.12) for sx in (1, -1)],
                 B(0, 0.33, 0.76, 0.7, 0.14, 0.08)),
            *glass,
            lancet("Head", 0, 0.37, 1.95, 0.44, 0.0, F("moon", 5)),
            part("Arch", T("stone", 4), *[B(sx * 0.2, 0.35, 2.0, 0.08, 0.08, 0.18) for sx in (1, -1)],
                 B(0, 0.35, 2.28, 0.16, 0.08, 0.1)),
            part("Leads", T("ink", 1), B(0, 0.355, 1.4, 0.025, 0.02, 1.1),
                 *[B(0, 0.355, 0.8 + 0.26 * k, 0.44, 0.02, 0.02) for k in range(5)], outline=False),
            part("Crack", F("bone", 3), B(0.12, 0.352, 1.1, 0.015, 0.01, 0.22), outline=False)]


def candle_stand():
    """A wrought pricket stand: tripod feet, a shaft and a ring of five candles, wax run down the drip pan."""
    feet = [B(0.16 * math.cos(a), 0.16 * math.sin(a), 0.03, 0.2, 0.04, 0.04) for a in (0.3, 2.4, 4.5)]
    tips = [(0.13 * math.cos(a), 0.13 * math.sin(a)) for a in [k * 2 * math.pi / 5 + 0.4 for k in range(5)]]
    return [part("Iron", T("ink", 1), *feet, B(0, 0, 0.55, 0.04, 0.04, 1.0), C(0, 0, 1.05, 0.18, 0.03, 10)),
            part("Pan", T("brass", 1), C(0, 0, 1.08, 0.16, 0.02, 10)),
            part("Candles", T("bone", 3), *[C(x, y, 1.1, 0.025, 0.12 + 0.05 * (k % 3), 6)
                                           for k, (x, y) in enumerate(tips)]),
            part("Wax", T("bone", 2), B(0.12, -0.12, 0.95, 0.03, 0.02, 0.12), outline=False),
            part("Flames", F("lantern", 3), *[B(x, y, 1.27 + 0.05 * (k % 3), 0.025, 0.025, 0.05)
                                              for k, (x, y) in enumerate(tips)], outline=False)]


def hymn_board():
    """The hymn board by the chancel: four slots, three numbers in, one slot empty."""
    tabs = [B(0, 0.36, 1.55 - 0.18 * k, 0.4, 0.02, 0.12) for k in range(3)]
    return [back_panel("Wall", T("plaster", 2), 0.9, 2.1, 0.0),
            part("Board", T("wood", 2), B(0, 0.38, 1.35, 0.56, 0.04, 0.9), bevel=0.01),
            part("Cap", T("wood", 3), B(0, 0.36, 1.83, 0.62, 0.08, 0.06)),
            part("Tabs", T("bone", 3), *tabs, outline=False),
            part("Numbers", F("ink", 0), *[B(dx, 0.348, 1.55 - 0.18 * k, 0.05, 0.005, 0.07)
                                          for k in range(3) for dx in (-0.08, 0.0, 0.08)], outline=False),
            part("Gap", F("ink", 1), B(0, 0.36, 1.01, 0.4, 0.01, 0.12), outline=False)]


def memorial():
    """Plaques to the drowned: a marble tablet with an anchor, two small brasses, a dry wreath under them."""
    return [back_panel("Wall", T("plaster", 1), 0.9, 2.1, 0.0),
            part("Tablet", T("bone", 2), B(0, 0.37, 1.45, 0.5, 0.04, 0.6), bevel=0.01),
            part("Pediment", T("bone", 1), (frustum, dict(z0=1.75, z1=1.9, bottom=(0.56, 0.06), top=(0.1, 0.06),
                                                           offset=(0, 0.37)))),
            part("Lettering", F("stone", 1), *[B(0, 0.348, 1.62 - 0.08 * k, 0.34 - 0.04 * (k % 2), 0.005, 0.025)
                                               for k in range(4)], outline=False),
            part("Anchor", F("stone", 0), B(0, 0.348, 1.25, 0.025, 0.005, 0.16), B(0, 0.348, 1.18, 0.12, 0.005, 0.02),
                 outline=False),
            part("Brasses", T("brass", 1), B(-0.3, 0.37, 1.0, 0.18, 0.02, 0.12), B(0.3, 0.37, 1.05, 0.18, 0.02, 0.12)),
            part("Wreath", T("litter", 1), C(0, 0.3, 0.55, 0.14, 0.05, 10), bevel=0.02),
            part("Ribbon", T("blood", 0), B(0.06, 0.24, 0.5, 0.04, 0.01, 0.12), outline=False)]


def lectern():
    """The brass eagle lectern, the great Bible open on its wings, a ribbon hanging down."""
    return [part("Foot", T("stone", 3), C(0, 0, 0, 0.22, 0.08, 8)),
            part("Shaft", T("brass", 1), C(0, 0, 0.08, 0.05, 0.85, 8, rt=0.04), C(0, 0, 0.45, 0.08, 0.06, 8)),
            part("Wings", T("brass", 2), (frustum, dict(z0=0.93, z1=1.1, bottom=(0.1, 0.1), top=(0.5, 0.3),
                                                        top_offset=(0, -0.02)))),
            part("Book", T("blood", 0), B(0, -0.04, 1.13, 0.48, 0.3, 0.05)),
            part("Pages", T("bone", 3), B(-0.11, -0.04, 1.165, 0.21, 0.26, 0.02), B(0.11, -0.04, 1.165, 0.21, 0.26, 0.02),
                 outline=False),
            part("Ribbon", T("blood", 2), B(0.02, -0.2, 1.0, 0.025, 0.01, 0.22), outline=False)]


def pulpit():
    """A panelled oak pulpit on a stone base, its steps behind, a sounding board above."""
    return [part("Base", T("stone", 3), C(0, 0.05, 0, 0.24, 0.5, 8)),
            part("Tub", T("wood", 2), C(0, 0.05, 0.5, 0.42, 0.75, 8, rt=0.45), bevel=0.02),
            part("Panels", T("wood", 3), *[B(0.33 * math.cos(a), 0.05 + 0.33 * math.sin(a), 0.87, 0.18, 0.02, 0.45)
                                          for a in (-2.4, -1.57, -0.75)], outline=False),
            part("Rail", T("wood", 4), C(0, 0.05, 1.25, 0.46, 0.05, 8)),
            part("Cloth", T("blood", 1), B(0, -0.37, 1.05, 0.28, 0.02, 0.3), outline=False),
            part("Steps", T("wood", 1), *[B(0.32, 0.35 - 0.0 * k, 0.12 + 0.24 * k, 0.24, 0.2, 0.24) for k in range(3)]),
            part("Post", T("wood", 2), B(0, 0.42, 1.6, 0.07, 0.07, 1.2)),
            part("Sounding", T("wood", 3), C(0, 0.15, 2.1, 0.34, 0.06, 8), bevel=0.01)]


def font():
    """The octagonal font by the door, its oak cover lifted a crack, a dry ring of old water on the stone."""
    return [part("Step", T("stone", 2), C(0, 0, 0, 0.42, 0.08, 8)),
            part("Stem", T("stone", 3), C(0, 0, 0.08, 0.16, 0.5, 8)),
            part("Bowl", T("stone", 4), C(0, 0, 0.58, 0.22, 0.32, 8, rt=0.34), bevel=0.02),
            part("Carving", F("stone", 1), *[B(0.29 * math.cos(a), 0.29 * math.sin(a), 0.74, 0.08, 0.01, 0.12)
                                             for a in (-2.0, -1.2)], outline=False),
            part("Cover", T("wood", 2), C(0.04, 0.02, 0.92, 0.33, 0.05, 8), bevel=0.01),
            part("Knob", T("brass", 1), C(0.04, 0.02, 0.97, 0.04, 0.08, 6)),
            part("Ring", F("stone", 1), C(0, 0, 0.081, 0.36, 0.003, 12), outline=False)]


def votive_rack():
    """An iron rack of prayer lights in a sand tray, most burnt down, a few still going."""
    lit = {1, 4, 6, 9}
    lights = [(-0.3 + 0.15 * (k % 5), -0.1 + 0.2 * (k // 5)) for k in range(10)]
    return [part("Legs", T("ink", 1), *[B(sx * 0.36, sy * 0.15, 0.35, 0.04, 0.04, 0.7) for sx in (1, -1)
                                       for sy in (1, -1)]),
            part("Tray", T("ink", 0), (frustum, dict(z0=0.7, z1=0.78, bottom=(0.78, 0.36), top=(0.82, 0.42)))),
            part("Sand", T("litter", 2), B(0, 0, 0.775, 0.78, 0.38, 0.01), outline=False),
            part("Lights", T("bone", 2), *[C(x, y, 0.78, 0.035, 0.04 + 0.02 * (k % 3), 6)
                                          for k, (x, y) in enumerate(lights)], outline=False),
            part("Flames", F("lantern", 3), *[B(x, y, 0.86, 0.02, 0.02, 0.04)
                                             for k, (x, y) in enumerate(lights) if k in lit], outline=False),
            part("Box", T("wood", 2), B(0.3, 0.22, 0.85, 0.16, 0.08, 0.14))]


def alms_box():
    """The poor box on its post, iron-banded, the padlock new and the slot worn bright."""
    return [part("Post", T("wood", 1), B(0, 0, 0.4, 0.14, 0.14, 0.8)),
            part("Box", T("wood", 2), B(0, 0, 0.92, 0.32, 0.28, 0.26), bevel=0.01),
            part("Bands", T("ink", 1), B(0, 0, 0.86, 0.34, 0.3, 0.03), B(0, 0, 1.0, 0.34, 0.3, 0.03)),
            part("Slot", F("ink", 0), B(0, 0, 1.055, 0.14, 0.03, 0.005), outline=False),
            part("Padlock", T("brass", 2), B(0, -0.16, 0.9, 0.06, 0.03, 0.07), outline=False)]


def flower_stand():
    """A tall stand of white lilies gone over, petals on the flags under it."""
    rnd = random.Random("lilies")
    stems = [(rnd.uniform(-0.1, 0.1), rnd.uniform(-0.08, 0.08), rnd.uniform(0.3, 0.45)) for _ in range(7)]
    return [part("Stand", T("wood", 3), C(0, 0, 0, 0.16, 0.05, 8), C(0, 0, 0.05, 0.05, 0.75, 6),
                 C(0, 0, 0.8, 0.13, 0.04, 8)),
            part("Vase", T("brass", 1), C(0, 0, 0.84, 0.08, 0.24, 8, rt=0.12)),
            part("Stems", T("moss", 2), *[B(x, y, 1.08 + h / 2, 0.02, 0.02, h) for x, y, h in stems], outline=False),
            part("Lilies", T("bone", 3), *[C(x, y, 1.08 + h, 0.05, 0.05, 6, rt=0.08) for x, y, h in stems[:5]]),
            part("Brown", T("litter", 2), *[C(x, y, 1.08 + h, 0.05, 0.04, 6, rt=0.07) for x, y, h in stems[5:]]),
            part("Petals", T("bone", 2), *[B(rnd.uniform(-0.3, 0.3), rnd.uniform(-0.3, 0.1), 0.005, 0.05, 0.03, 0.01)
                                          for _ in range(5)], outline=False)]


def altar():
    """The high altar (8D's donations station): a stone table, white cloth and red frontal, a brass cross between
    two candlesticks, and the plate for the offerings."""
    return [part("Step", T("stone", 2), B(0, 0.05, 0.06, 1.0, 0.8, 0.12)),
            part("Table", T("stone", 4), B(0, 0.1, 0.55, 0.9, 0.55, 0.86), bevel=0.02),
            part("Cloth", T("bone", 3), B(0, 0.1, 1.0, 0.94, 0.6, 0.03), B(0, -0.18, 0.9, 0.94, 0.02, 0.2)),
            part("Frontal", T("blood", 1), B(0, -0.185, 0.55, 0.5, 0.02, 0.62), outline=False),
            part("Orphrey", T("brass", 2), B(0, -0.19, 0.55, 0.06, 0.01, 0.62), B(0, -0.19, 0.7, 0.3, 0.01, 0.05),
                 outline=False),
            part("Cross", T("brass", 2), B(0, 0.28, 1.25, 0.05, 0.05, 0.5), B(0, 0.28, 1.36, 0.22, 0.05, 0.05),
                 C(0, 0.28, 1.015, 0.08, 0.04, 8)),
            part("Sticks", T("brass", 1), *[C(sx * 0.32, 0.2, 1.015, 0.03, 0.22, 6) for sx in (1, -1)]),
            part("Candles", T("bone", 3), *[C(sx * 0.32, 0.2, 1.235, 0.025, 0.16, 6) for sx in (1, -1)]),
            part("Flames", F("lantern", 3), *[B(sx * 0.32, 0.2, 1.42, 0.025, 0.025, 0.05) for sx in (1, -1)],
                 outline=False),
            part("Plate", T("brass", 1), C(-0.15, -0.02, 1.015, 0.1, 0.02, 10, rt=0.12))]


def chapel_rope():
    """The bell rope through the ceiling, its red sally, and the torn glove caught in the strands (WORLD 4.3)."""
    return rope() + [part("Glove", T("plaster", 3), B(0.04, 0.05, 1.4, 0.12, 0.06, 0.18),
                          B(-0.04, 0.05, 1.28, 0.05, 0.05, 0.1),
                          bevel=0.01),
                     part("Tear", F("ink", 1), B(0.02, 0.039, 1.44, 0.04, 0.005, 0.03), outline=False)]


# ---------------------------------------------------------------- Vane Manor (round 8, 8J: art.md 4.2)


def spun(objs, a):
    """The art turned `a` radians about the tile centre (its front, -Y, turns with it)."""
    c, s = math.cos(a), math.sin(a)
    for o in objs:
        x, y, z = o.location
        o.location = (c * x - s * y, s * x + c * y, z)
        o.rotation_euler.z += a
    return objs


def moved(objs, dx, dy, dz):
    for o in objs:
        o.location = (o.location.x + dx, o.location.y + dy, o.location.z + dz)
    return objs


BOOK_COLOURS = [("blood", 0), ("blood", 1), ("teal", 0), ("moss", 1), ("ink", 1), ("brass", 1), ("wood", 3), ("bone", 2)]


def _books(rnd, y, z, x0=-0.42, x1=0.42, gap=True):
    """A shelf's run of spines, grouped by colour into one part each, with a gap and a book leaning into it."""
    runs, x = {}, x0
    hole = rnd.uniform(x0 + 0.2, x1 - 0.2) if gap else 99
    while x < x1 - 0.04:
        w = rnd.uniform(0.04, 0.08)
        if abs(x - hole) < 0.09:
            x += 0.16
            continue
        h = rnd.uniform(0.26, 0.38)
        runs.setdefault(rnd.choice(BOOK_COLOURS), []).append(B(x + w / 2, y, z + h / 2, w - 0.005, 0.22, h))
        x += w
    return [part(f"Books{r}{i}{z:.1f}", T(r, i), *shapes, outline=False) for (r, i), shapes in runs.items()]


def bookcase(seed="a"):
    """A full-height oak bookcase that stands in for a run of partition wall: five shelves of spines, the
    cornice carried across so a row of them reads as one library wall."""
    rnd = random.Random(f"bookcase{seed}")
    shelves = (0.12, 0.58, 1.04, 1.5, 1.96)
    objs = [part("Carcass", T("wood", 1), B(0, 0.15, 1.15, 1.0, 0.6, 2.3)),
            part("Sides", T("wood", 2), *[B(sx * 0.47, -0.3, 1.15, 0.06, 0.3, 2.3) for sx in (1, -1)]),
            part("Shelves", T("wood", 3), *[B(0, -0.3, z, 0.94, 0.3, 0.04) for z in shelves], outline=False),
            part("Cornice", T("wood", 3), B(0, -0.02, 2.34, 1.0, 0.94, 0.08)),
            part("Plinth", T("wood", 0), B(0, -0.3, 0.05, 1.0, 0.32, 0.1))]
    for z in shelves[1:]:
        objs += _books(rnd, -0.3, z + 0.02)
    if seed == "b":
        objs += [part("Globe", T("brass", 2), C(0.2, -0.3, 0.14, 0.05, 0.08, 8)),
                 part("World", T("teal", 1), C(0.2, -0.3, 0.22, 0.14, 0.24, 12, rt=0.05), bevel=0.04),
                 part("Ledger", T("blood", 0), B(-0.2, -0.3, 0.17, 0.36, 0.24, 0.07))]
    else:
        objs += _books(rnd, -0.3, 0.14, gap=False)
    return objs


def tin_cabinet(seed="a"):
    """A Vane Tin Co. display case: a panelled base with the company's brass plate, glazed shelves of ingots
    and ore above. The second case has one empty cradle, its dust outline still on the baize."""
    objs = [part("Base", T("wood", 1), B(0, 0.0, 0.45, 0.98, 0.8, 0.9), bevel=0.01),
            part("Panels", T("wood", 2), *[B(sx * 0.22, -0.405, 0.45, 0.36, 0.02, 0.6) for sx in (1, -1)],
                 outline=False),
            part("Plate", T("brass", 2), B(0, -0.41, 0.8, 0.4, 0.01, 0.08), outline=False),
            part("Back", T("wood", 0), B(0, 0.3, 1.5, 0.98, 0.2, 1.2)),
            part("Baize", F("moss", 0), *[B(0, -0.05, z, 0.88, 0.5, 0.02) for z in (0.92, 1.32, 1.72)], outline=False),
            part("Frame", T("wood", 3), *[B(x, -0.3, 1.5, 0.05, 0.06, 1.2) for x in (-0.47, 0, 0.47)],
                 B(0, -0.3, 2.12, 0.98, 0.06, 0.05), B(0, 0.0, 2.17, 1.0, 0.82, 0.06)),
            part("Glint", F("bone", 3), B(-0.25, -0.33, 1.6, 0.03, 0.005, 0.5), outline=False),
            part("Ingots", T("fog", 3), *[(frustum, dict(z0=0.93, z1=1.0, bottom=(0.16, 0.08), top=(0.12, 0.05),
                                                         offset=(x, -0.05))) for x in (-0.3, -0.1, 0.1)]),
            part("Ore", T("stone", 2), *[S(blob(x, -0.05, 0.08, 0.06, [(0.2, 3, 0.3)], n=8), 1.33, 1.42)
                                         for x in (-0.25, 0.0, 0.25)])]
    if seed == "b":
        objs += [part("Cradle", T("brass", 1), B(0.15, -0.05, 1.75, 0.24, 0.1, 0.04)),
                 part("Dust", F("moss", 1), B(-0.2, -0.05, 1.732, 0.22, 0.08, 0.003), outline=False),
                 part("Pick", T("ink", 1), B(-0.2, -0.08, 1.38, 0.34, 0.03, 0.03), outline=False)]
    else:
        objs += [part("Lamp", T("brass", 2), C(0.2, -0.05, 1.73, 0.05, 0.16, 8)),
                 part("Card", T("bone", 3), B(-0.2, -0.15, 1.78, 0.16, 0.01, 0.1), outline=False)]
    return objs


def fireplace():
    """The hall hearth: a marble surround set into the wall, a low fire, the overmantel mirror draped in black
    for the dead. Drawn shallow (on_wall at -0.75) so it stays inside its tile when turned onto a west wall."""
    flames = [B(x, 0.2, 0.22 + 0.03 * (k % 2), 0.1, 0.04, 0.2 + 0.08 * (k % 2)) for k, x in enumerate((-0.12, 0.0, 0.12))]
    return [back_panel("Wall", T("plaster", 2), 0.9, 2.1, 0.0),
            part("Firebox", F("ink", 0), B(0, 0.24, 0.36, 0.52, 0.01, 0.58), outline=False),
            part("Jambs", T("bone", 2), *[B(sx * 0.37, 0.2, 0.5, 0.16, 0.12, 1.0) for sx in (1, -1)]),
            part("Lintel", T("bone", 2), B(0, 0.2, 0.86, 0.6, 0.12, 0.2)),
            part("Mantel", T("wood", 2), B(0, 0.19, 1.03, 0.98, 0.12, 0.06)),
            part("Hearth", T("stone", 3), B(0, 0.17, 0.02, 0.98, 0.16, 0.04)),
            part("Grate", T("ink", 1), B(0, 0.2, 0.1, 0.4, 0.06, 0.12)),
            part("Logs", T("wood", 1), B(0, 0.2, 0.17, 0.36, 0.06, 0.07), B(0.04, 0.2, 0.23, 0.28, 0.05, 0.06)),
            part("Flames", F("lantern", 2), *flames, outline=False),
            part("Hot", F("lantern", 4), *[B(x, 0.18, 0.24, 0.05, 0.02, 0.1) for x in (-0.08, 0.06)], outline=False),
            part("Embers", F("blood", 2), B(0, 0.19, 0.16, 0.34, 0.03, 0.02), outline=False),
            part("Gilt", T("brass", 2), B(0, 0.24, 1.6, 0.66, 0.02, 0.72)),
            part("Crepe", T("ink", 1), B(0, 0.225, 1.62, 0.6, 0.02, 0.66), bevel=0.01),
            part("Sticks", T("brass", 1), *[C(sx * 0.36, 0.19, 1.06, 0.03, 0.2, 6) for sx in (1, -1)]),
            part("Card", T("bone", 3), B(0.1, 0.2, 1.12, 0.12, 0.01, 0.12), outline=False)]


def armchair(knitting=False):
    """A buttoned wing chair in faded red, a shawl over one arm (and, by the other, a basket of knitting)."""
    objs = [part("Legs", T("wood", 1), *[B(sx * 0.25, sy * 0.25, 0.1, 0.06, 0.06, 0.2) for sx in (1, -1)
                                         for sy in (1, -1)]),
            part("Seat", T("blood", 1), B(0, 0, 0.32, 0.62, 0.6, 0.24), bevel=0.03),
            part("Back", T("blood", 1), B(0, 0.25, 0.85, 0.62, 0.12, 0.85), bevel=0.03),
            part("Wings", T("blood", 0), *[B(sx * 0.28, 0.12, 0.9, 0.07, 0.3, 0.5) for sx in (1, -1)]),
            part("Arms", T("blood", 0), *[B(sx * 0.3, -0.04, 0.55, 0.1, 0.52, 0.14) for sx in (1, -1)], bevel=0.02),
            part("Cushion", T("blood", 2), B(0, -0.03, 0.46, 0.46, 0.46, 0.06), bevel=0.02),
            part("Shawl", T("moss", 1), B(0.3, -0.02, 0.6, 0.14, 0.4, 0.1), outline=False)]
    if knitting:
        objs += [part("Basket", T("litter", 2), C(-0.35, -0.35, 0, 0.12, 0.14, 8, rt=0.14)),
                 part("Wool", T("teal", 1), C(-0.35, -0.35, 0.14, 0.07, 0.06, 8, rt=0.04))]
    return objs


def lamp_table():
    """A round side table with an oil lamp under a glass chimney, a doily and a photograph in a black ribbon."""
    return [part("Leg", T("wood", 2), C(0, 0, 0, 0.18, 0.05, 8), C(0, 0, 0.05, 0.04, 0.62, 6)),
            part("Top", T("wood", 3), C(0, 0, 0.67, 0.26, 0.04, 12)),
            part("Doily", T("bone", 3), C(0, 0, 0.71, 0.18, 0.005, 12), outline=False),
            part("Font", T("brass", 2), C(0.04, 0.04, 0.715, 0.08, 0.12, 10, rt=0.06)),
            part("Chimney", F("lantern", 3), C(0.04, 0.04, 0.835, 0.04, 0.16, 8, rt=0.03), outline=False),
            part("Photo", T("ink", 1), B(-0.12, 0.06, 0.8, 0.12, 0.02, 0.16)),
            part("PhotoFace", T("fog", 3), B(-0.12, 0.048, 0.8, 0.08, 0.005, 0.11), outline=False)]


def boot_rack():
    """The boot rack by the front door: two pairs dry, one pair still caked in the lane's red mud."""
    return [part("Rack", T("wood", 2), B(0, 0.1, 0.12, 0.9, 0.3, 0.04), B(0, 0.1, 0.02, 0.9, 0.3, 0.04)),
            part("Boots", T("ink", 1), *[B(x, 0.1, 0.32, 0.12, 0.24, 0.36) for x in (-0.33, -0.18, 0.05, 0.2)]),
            part("Muddy", T("brick", 1), *[B(x, -0.12, 0.2, 0.12, 0.26, 0.4) for x in (0.32, 0.44)]),
            part("Mud", F("brick", 0), S(blob(0.38, -0.3, 0.2, 0.1, [(0.3, 4, 0.4)], n=10), 0, 0.005),
                 outline=False),
            part("Stick", T("wood", 3), B(-0.44, 0.3, 0.45, 0.03, 0.03, 0.9), outline=False)]


def coat_stand():
    """A bentwood coat stand: the master's greatcoat and top hat, never taken down."""
    return [kenney("furniture-kit", "coatRackStanding", height=1.8, ramp=["#24171A", "#55332A", "#94603F"]),
            part("Coat", T("ink", 1), S(blob(0.0, -0.08, 0.22, 0.12, [(0.1, 3, 0.2)], n=12), 0.6, 1.6), bevel=0.04),
            part("Hat", T("ink", 0), C(0.1, -0.05, 1.72, 0.12, 0.02, 10), C(0.1, -0.05, 1.74, 0.08, 0.14, 10))]


def vane_portrait():
    """Old Vane in oils: a gilt frame, a dark coat and a pale face, a black crepe sash across one corner."""
    return [back_panel("Wall", T("plaster", 2), 0.9, 2.1, 0.0),
            part("Gilt", T("brass", 2), B(0, 0.37, 1.4, 0.62, 0.05, 0.8), bevel=0.01),
            part("Canvas", F("ink", 1), B(0, 0.343, 1.4, 0.5, 0.005, 0.68), outline=False),
            part("Coat", F("slate", 1), B(0, 0.34, 1.22, 0.3, 0.005, 0.3), outline=False),
            part("Face", F("plaster", 3), B(0, 0.34, 1.5, 0.12, 0.005, 0.16), outline=False),
            part("Sash", T("ink", 0), B(0.2, 0.335, 1.66, 0.06, 0.01, 0.34), outline=False),
            part("Light", T("brass", 1), B(0, 0.3, 1.86, 0.3, 0.06, 0.04))]


def draped_window():
    """A tall sash window, its heavy curtains half drawn and tied back."""
    return [back_panel("Wall", T("plaster", 2), 0.9, 2.3, 0.0),
            part("Glass", F("moon", 3), B(0, 0.375, 1.3, 0.5, 0.01, 1.2), outline=False),
            part("Sashes", T("bone", 3), B(0, 0.36, 1.3, 0.58, 0.03, 0.05), *[B(x, 0.36, 1.3, 0.04, 0.03, 1.24)
                                                                              for x in (-0.27, 0, 0.27)],
                 B(0, 0.36, 1.92, 0.58, 0.03, 0.05), B(0, 0.36, 0.69, 0.58, 0.03, 0.05), outline=False),
            part("Sill", T("stone", 4), B(0, 0.3, 0.66, 0.7, 0.14, 0.05)),
            part("Drapes", T("blood", 1), *[B(sx * 0.33, 0.3, 1.2, 0.2, 0.08, 1.7) for sx in (1, -1)], bevel=0.02),
            part("Pelmet", T("blood", 0), B(0, 0.3, 2.08, 0.9, 0.1, 0.16)),
            part("Ties", T("brass", 2), *[B(sx * 0.33, 0.25, 1.0, 0.22, 0.02, 0.04) for sx in (1, -1)], outline=False)]


def sideboard():
    """The dining sideboard: decanters on a silver tray, the black-edged funeral cards stacked to go out."""
    return [part("Body", T("wood", 1), B(0, 0.2, 0.55, 0.96, 0.5, 0.5), bevel=0.01),
            part("Legs", T("wood", 1), *[B(sx * 0.44, y, 0.15, 0.06, 0.06, 0.3) for sx in (1, -1) for y in (0, 0.4)]),
            part("Drawers", T("wood", 2), *[B(x, -0.055, 0.66, 0.28, 0.01, 0.16) for x in (-0.31, 0, 0.31)],
                 outline=False),
            part("Pulls", T("brass", 2), *[B(x, -0.06, 0.66, 0.05, 0.01, 0.02) for x in (-0.31, 0, 0.31)],
                 outline=False),
            part("Tray", T("fog", 3), C(-0.18, 0.2, 0.8, 0.18, 0.02, 12)),
            part("Decanters", F("blood", 2), C(-0.25, 0.22, 0.82, 0.05, 0.2, 8, rt=0.03),
                 C(-0.1, 0.16, 0.82, 0.05, 0.16, 8, rt=0.03), outline=False),
            part("Cards", T("bone", 3), B(0.25, 0.15, 0.82, 0.16, 0.11, 0.04)),
            part("Edge", T("ink", 0), B(0.25, 0.15, 0.845, 0.17, 0.12, 0.01), outline=False)]


def nightstand():
    """A bedside cupboard: a candle burnt low, a glass of water, spectacles folded on a Bible."""
    return [part("Body", T("wood", 2), B(0, 0.15, 0.32, 0.46, 0.4, 0.64), bevel=0.01),
            part("Door", T("wood", 3), B(0, -0.055, 0.26, 0.34, 0.01, 0.34), outline=False),
            part("Bible", T("ink", 1), B(0.1, 0.15, 0.67, 0.18, 0.24, 0.05)),
            part("Specs", T("brass", 2), B(0.1, 0.1, 0.7, 0.12, 0.03, 0.01), outline=False),
            part("Glass", F("moon", 4), C(-0.12, 0.22, 0.64, 0.035, 0.1, 8), outline=False),
            *moved(candle(), -0.06, 0.06, 0.64)]


def dressing_table():
    """Her Ladyship's dressing table: a triple mirror with the middle glass hung over in black, brushes, scent
    bottles and a jewel box left open (one ring missing from its slot)."""
    return [part("Table", T("wood", 2), B(0, 0.15, 0.6, 0.9, 0.42, 0.08)),
            part("Legs", T("wood", 1), *[B(sx * 0.4, y, 0.3, 0.05, 0.05, 0.56) for sx in (1, -1) for y in (-0.03, 0.33)]),
            part("Skirt", T("bone", 2), B(0, -0.065, 0.45, 0.92, 0.02, 0.26), outline=False),
            part("Frames", T("wood", 3), B(0, 0.33, 1.1, 0.4, 0.04, 0.8), *[B(sx * 0.33, 0.3, 1.0, 0.24, 0.04, 0.6)
                                                                            for sx in (1, -1)]),
            part("Glass", F("moon", 4), *[B(sx * 0.33, 0.278, 1.0, 0.18, 0.005, 0.52) for sx in (1, -1)], outline=False),
            part("Crepe", T("ink", 1), B(0, 0.3, 1.12, 0.36, 0.02, 0.78), bevel=0.01),
            part("Bottles", F("teal", 1), *[C(x, 0.12, 0.64, 0.03, 0.1, 6, rt=0.015) for x in (-0.3, -0.22)],
                 outline=False),
            part("Brush", T("fog", 2), B(-0.05, 0.05, 0.655, 0.18, 0.06, 0.03)),
            part("Box", T("blood", 0), B(0.22, 0.1, 0.68, 0.2, 0.14, 0.08)),
            part("Rings", T("brass", 2), *[C(0.16 + 0.05 * k, 0.1, 0.72, 0.015, 0.01, 6) for k in (0, 2)],
                 outline=False),
            part("Stool", T("blood", 1), C(0, -0.3, 0.3, 0.16, 0.12, 10), bevel=0.02),
            part("StoolLegs", T("wood", 1), C(0, -0.3, 0.0, 0.1, 0.3, 4))]


def washstand():
    """A marble-topped washstand: the ewer in its basin, a folded towel on the rail, the water gone cold."""
    return [part("Stand", T("wood", 2), B(0, 0.15, 0.4, 0.8, 0.44, 0.8), bevel=0.01),
            part("Marble", T("bone", 2), B(0, 0.15, 0.82, 0.84, 0.48, 0.04)),
            part("Splash", T("bone", 2), B(0, 0.37, 1.0, 0.84, 0.04, 0.32)),
            part("Basin", T("bone", 3), C(-0.1, 0.12, 0.84, 0.18, 0.08, 12, rt=0.2)),
            part("Ewer", T("bone", 3), C(-0.1, 0.12, 0.86, 0.08, 0.26, 10, rt=0.05)),
            part("Rim", T("teal", 1), C(-0.1, 0.12, 1.1, 0.06, 0.02, 10), outline=False),
            part("Rail", T("wood", 3), B(0.42, 0.15, 0.6, 0.03, 0.4, 0.03)),
            part("Towel", T("bone", 3), B(0.43, 0.15, 0.5, 0.02, 0.3, 0.22), outline=False),
            part("Soap", T("moss", 2), B(0.22, 0.2, 0.86, 0.08, 0.05, 0.03))]


def blanket_chest():
    """An iron-strapped oak chest at the foot of the bed, a folded quilt on the lid."""
    return [part("Chest", T("wood", 2), B(0, 0, 0.24, 0.8, 0.44, 0.48), bevel=0.02),
            part("Straps", T("ink", 1), *[B(x, 0, 0.24, 0.05, 0.46, 0.5) for x in (-0.25, 0.25)], outline=False),
            part("Hasp", T("brass", 2), B(0, -0.225, 0.4, 0.06, 0.01, 0.1), outline=False),
            part("Quilt", T("blood", 1), B(0.05, 0.02, 0.52, 0.6, 0.36, 0.08), bevel=0.02),
            part("Patches", T("bone", 3), *[B(x, -0.165, 0.52, 0.1, 0.01, 0.06) for x in (-0.15, 0.1, 0.3)],
                 outline=False)]


def linen_press():
    """A tall linen press, one door ajar on stacked sheets, a moth bag hanging from the key."""
    return [part("Press", T("wood", 1), B(0, 0.15, 1.05, 0.9, 0.56, 2.1), bevel=0.01),
            part("Cornice", T("wood", 2), B(0, 0.12, 2.14, 0.98, 0.62, 0.08)),
            part("DoorL", T("wood", 2), B(-0.22, -0.14, 1.3, 0.42, 0.02, 1.4), outline=False),
            part("Inside", F("ink", 0), B(0.22, -0.13, 1.3, 0.42, 0.005, 1.4), outline=False),
            part("Sheets", T("bone", 3), *[B(0.22, -0.05, 0.75 + 0.2 * k, 0.38, 0.2, 0.14) for k in range(5)]),
            part("DoorR", T("wood", 2), B(0.48, -0.32, 1.3, 0.02, 0.38, 1.4)),
            part("Drawers", T("wood", 3), *[B(0, -0.135, z, 0.84, 0.01, 0.2) for z in (0.18, 0.42)], outline=False),
            part("Bag", T("moss", 2), B(-0.03, -0.17, 1.15, 0.06, 0.04, 0.1), outline=False)]


# ---------------------------------------------------------------- The Drowned Lantern (round 8, 8J: art.md 4.2)


def bar_counter(kind="plain"):
    """A run of the bar: a panelled oak front, a brass foot rail, a scrubbed top with rings from the glasses.
    `taps` carries the beer engine's three pulls, `lamp` a ship's lamp hung from a bracket over the end."""
    objs = [part("Body", T("wood", 1), B(0, 0.05, 0.5, 1.0, 0.8, 1.0)),
            part("Panels", T("wood", 2), *[B(sx * 0.24, -0.355, 0.5, 0.4, 0.01, 0.7) for sx in (1, -1)],
                 outline=False),
            part("Top", T("wood", 4), B(0, 0.0, 1.03, 1.0, 0.94, 0.06)),
            part("Rail", T("brass", 2), B(0, -0.46, 0.14, 1.0, 0.04, 0.04),
                 *[B(sx * 0.4, -0.42, 0.1, 0.03, 0.06, 0.08) for sx in (1, -1)], outline=False),
            part("Rings", F("wood", 3), *[C(x, y, 1.061, 0.05, 0.002, 10) for x, y in ((-0.2, -0.15), (0.25, 0.1))],
                 outline=False)]
    if kind == "taps":
        objs += [part("Engine", T("wood", 3), B(0, 0.15, 1.1, 0.7, 0.16, 0.1)),
                 part("Pulls", T("bone", 3), *[C(x, 0.12, 1.15, 0.03, 0.34, 6, rt=0.02) for x in (-0.22, 0, 0.22)]),
                 part("Clips", T("brass", 2), *[B(x, 0.09, 1.38, 0.06, 0.01, 0.07) for x in (-0.22, 0, 0.22)],
                      outline=False),
                 part("Drip", T("brass", 1), B(0, -0.12, 1.07, 0.6, 0.12, 0.02)),
                 part("Pint", F("lantern", 0), C(0.3, -0.25, 1.06, 0.045, 0.14, 8, rt=0.05), outline=False),
                 part("Head", T("bone", 3), C(0.3, -0.25, 1.2, 0.05, 0.02, 8), outline=False)]
    elif kind == "lamp":
        objs += [part("Bracket", T("ink", 1), B(0.3, 0.3, 1.6, 0.04, 0.04, 1.1), B(0.15, 0.1, 2.12, 0.34, 0.04, 0.03)),
                 part("Lamp", T("brass", 1), B(0.0, 0.1, 1.86, 0.2, 0.2, 0.04), B(0.0, 0.1, 2.06, 0.14, 0.14, 0.06)),
                 part("Glass", F("lantern", 3), B(0.0, 0.1, 1.96, 0.16, 0.16, 0.16), outline=False),
                 part("Till", T("ink", 1), B(-0.25, 0.15, 1.15, 0.3, 0.26, 0.18), bevel=0.01),
                 part("Keys", T("bone", 3), *[B(-0.25 + 0.07 * k, 0.0, 1.22, 0.04, 0.04, 0.02) for k in (-1, 0, 1)],
                      outline=False)]
    else:
        objs += [part("Glasses", F("moon", 4), *[C(x, 0.15, 1.06, 0.04, 0.1, 6) for x in (-0.3, -0.2, 0.3)],
                      outline=False),
                 part("Cloth", T("bone", 2), B(0.05, 0.1, 1.07, 0.24, 0.16, 0.02), outline=False)]
    return objs


def bottle_shelf(seed="a"):
    """The back bar: three shelves of bottles in green, amber and blood glass, a mirror strip behind them."""
    rnd = random.Random(f"bottles{seed}")
    tones = [("moss", 2), ("lantern", 0), ("blood", 1), ("teal", 0), ("moon", 3)]
    runs = {}
    for z in (0.95, 1.38, 1.81):
        x = -0.4
        while x < 0.38:
            r = rnd.choice(tones)
            h = rnd.uniform(0.18, 0.3)
            runs.setdefault(r, []).append(C(x, 0.3, z + 0.02, 0.035, h, 6, rt=0.02))
            x += rnd.uniform(0.1, 0.16)
    return ([back_panel("Wall", T("plaster", 2), 0.9, 2.3, 0.0),
             part("Mirror", F("moon", 2), B(0, 0.385, 1.4, 0.86, 0.01, 1.1), outline=False),
             part("Shelves", T("wood", 3), *[B(0, 0.3, z, 0.96, 0.16, 0.04) for z in (0.95, 1.38, 1.81)]),
             part("Uprights", T("wood", 2), *[B(sx * 0.47, 0.3, 1.4, 0.05, 0.16, 1.1) for sx in (1, -1)]),
             part("Cupboard", T("wood", 1), B(0, 0.28, 0.4, 0.96, 0.2, 0.8)),
             part("Doors", T("wood", 2), *[B(sx * 0.23, 0.175, 0.4, 0.4, 0.01, 0.6) for sx in (1, -1)], outline=False)]
            + [part(f"Bottles{r}{i}", F(r, i), *shapes, outline=False) for (r, i), shapes in runs.items()])


def tide_chart():
    """A yellowed tide table pinned beside a barometer, the needle stuck on Stormy since the night of the drowning."""
    return [back_panel("Wall", T("plaster", 2), 0.9, 2.1, 0.0),
            part("Chart", T("bone", 2), B(-0.15, 0.375, 1.4, 0.4, 0.01, 0.56), outline=False),
            part("Rows", F("stone", 2), *[B(-0.15, 0.368, 1.6 - 0.07 * k, 0.32, 0.005, 0.02) for k in range(7)],
                 outline=False),
            part("Pins", T("blood", 2), *[B(-0.15 + sx * 0.18, 0.365, 1.66, 0.025, 0.02, 0.025) for sx in (1, -1)],
                 outline=False),
            part("Barometer", T("wood", 2), C(0.27, 0.36, 1.3, 0.05, 0.6, 8), bevel=0.01),
            part("Dial", T("bone", 3), B(0.27, 0.33, 1.72, 0.2, 0.02, 0.2), outline=False),
            part("Needle", T("ink", 1), B(0.24, 0.318, 1.74, 0.08, 0.005, 0.015), outline=False)]


def chalkboard():
    """Tonight's slate over the bar: the ale and the pie, and under them, rubbed half out, a name."""
    return [back_panel("Wall", T("plaster", 2), 0.9, 2.1, 0.0),
            part("Frame", T("wood", 3), B(0, 0.375, 1.4, 0.7, 0.03, 0.56), bevel=0.01),
            part("Slate", F("ink", 1), B(0, 0.357, 1.4, 0.6, 0.01, 0.46), outline=False),
            part("Chalk", F("bone", 3), *[B(-0.08 + 0.04 * (k % 2), 0.35, 1.56 - 0.1 * k, 0.36 - 0.08 * (k % 3), 0.004,
                                            0.03) for k in range(3)], outline=False),
            part("Smudge", F("bone", 1), B(0.02, 0.35, 1.24, 0.3, 0.004, 0.05), outline=False),
            part("Ledge", T("wood", 2), B(0, 0.34, 1.11, 0.6, 0.06, 0.03))]


def keg_rack():
    """Two kegs on a stillage behind the bar, a spile in the top one and a tin cup hung on its tap."""
    objs = [part("Stillage", T("wood", 1), *[B(sx * 0.3, 0.05, 0.12, 0.08, 0.8, 0.24) for sx in (1, -1)],
                 B(0, 0.05, 0.67, 0.8, 0.8, 0.06))]
    for k, z in enumerate((0.42, 0.98)):
        keg = part(f"Keg{k}", T("wood", 3), C(0, 0, -0.32, 0.26, 0.64, 12), bevel=0.03)
        hoops = part(f"Hoops{k}", T("ink", 1), *[C(0, 0, d, 0.27, 0.04, 12) for d in (-0.24, 0.2)], outline=False)
        for o in (keg, hoops):
            o.rotation_euler.x = math.pi / 2
            o.location = (0, 0.05, z)
        objs += [keg, hoops]
    objs += [part("Tap", T("brass", 2), B(0, -0.36, 0.38, 0.05, 0.12, 0.05), B(0, -0.42, 0.33, 0.04, 0.04, 0.08)),
             part("Cup", T("fog", 2), C(0.06, -0.44, 0.24, 0.05, 0.08, 8), outline=False),
             part("Spile", T("wood", 4), C(0, -0.05, 1.24, 0.025, 0.06, 6), outline=False)]
    return objs


def ship_wheel():
    """The wheel of the Constance, lost with all hands: eight spokes on the wall, a black ribbon on one handle."""
    spokes = [B(0.3 * math.cos(a), 0.35, 1.4 + 0.3 * math.sin(a), 0.04, 0.03, 0.04) for a in
              [k * math.pi / 4 for k in range(8)]]
    rim = []
    for k in range(16):
        a = k * math.pi / 8
        b = B(0.22 * math.cos(a), 0.36, 1.4 + 0.22 * math.sin(a), 0.1, 0.03, 0.04)
        rim.append(b)
    objs = [back_panel("Wall", T("plaster", 2), 0.9, 2.1, 0.0),
            part("Rim", T("wood", 3), *rim),
            part("Hub", T("brass", 2), C(0, 0, -0.03, 0.07, 0.06, 10)),
            part("Handles", T("wood", 4), *spokes),
            part("Ribbon", T("ink", 0), B(0.3, 0.33, 1.32, 0.04, 0.01, 0.14), outline=False),
            part("Plaque", T("brass", 1), B(0, 0.37, 0.98, 0.3, 0.02, 0.07), outline=False)]
    objs[2].rotation_euler.x = math.pi / 2
    objs[2].location = (0, 0.36, 1.4)
    return objs


def inglenook():
    """The inglenook: a deep brick hearth under an oak bressummer, a peat fire, a kettle on the crane, horse
    brasses and a cutlass nailed up on the beam. Drawn shallow so it stays in its tile turned onto a west wall."""
    flames = [B(x, 0.15, 0.24 + 0.04 * (k % 2), 0.12, 0.05, 0.22 + 0.1 * (k % 2)) for k, x in enumerate((-0.14, 0.0, 0.14))]
    return [back_panel("Wall", T("plaster", 2), 0.9, 2.1, 0.0),
            part("Jambs", T("brick", 2), *[B(sx * 0.38, 0.15, 0.55, 0.16, 0.2, 1.1) for sx in (1, -1)]),
            part("Back", T("brick", 0), B(0, 0.245, 0.55, 0.62, 0.01, 1.1), outline=False),
            part("Soot", F("ink", 0), B(0, 0.238, 0.7, 0.5, 0.005, 0.7), outline=False),
            part("Beam", T("wood", 1), B(0, 0.13, 1.16, 0.98, 0.24, 0.16), bevel=0.01),
            part("Brasses", T("brass", 2), *[C(x, 0.0, 1.12, 0.05, 0.01, 8) for x in (-0.28, 0, 0.28)],
                 outline=False),
            part("Cutlass", T("fog", 3), B(0, 0.0, 1.25, 0.6, 0.01, 0.03), outline=False),
            part("Hilt", T("brass", 1), B(0.32, 0.0, 1.25, 0.06, 0.02, 0.07), outline=False),
            part("Hearth", T("stone", 3), B(0, 0.12, 0.03, 0.98, 0.26, 0.06)),
            part("Peat", T("brick", 0), B(0, 0.15, 0.1, 0.38, 0.14, 0.1)),
            part("Flames", F("lantern", 2), *flames, outline=False),
            part("Hot", F("lantern", 4), *[B(x, 0.12, 0.26, 0.05, 0.02, 0.12) for x in (-0.07, 0.07)], outline=False),
            part("Crane", T("ink", 1), B(-0.28, 0.2, 0.75, 0.03, 0.03, 0.9), B(-0.12, 0.2, 0.9, 0.32, 0.03, 0.03)),
            part("Kettle", T("ink", 1), C(0.0, 0.2, 0.62, 0.1, 0.16, 10, rt=0.07), bevel=0.02),
            part("Tongs", T("ink", 1), B(0.44, 0.02, 0.35, 0.02, 0.02, 0.6), outline=False)]


def settle():
    """A high-backed oak settle drawn up to the fire, a sheepskin over the seat and a clay pipe left on the arm."""
    return [part("Seat", T("wood", 2), B(0, 0.0, 0.42, 0.9, 0.42, 0.06)),
            part("Front", T("wood", 1), B(0, -0.2, 0.2, 0.9, 0.03, 0.4), outline=False),
            part("Back", T("wood", 2), B(0, 0.2, 0.85, 0.9, 0.06, 1.3), bevel=0.01),
            part("Hood", T("wood", 3), B(0, 0.08, 1.52, 0.94, 0.3, 0.05)),
            part("Ends", T("wood", 3), *[B(sx * 0.45, 0.0, 0.62, 0.05, 0.46, 1.24) for sx in (1, -1)]),
            part("Fleece", T("bone", 3), S(blob(-0.12, -0.02, 0.24, 0.17, [(0.1, 5, 0.3)], n=12), 0.45, 0.5),
                 outline=False),
            part("Pipe", T("bone", 2), B(0.42, -0.1, 1.255, 0.03, 0.14, 0.02), C(0.42, -0.17, 1.245, 0.025, 0.04, 6),
                 outline=False)]


def log_basket():
    """A wicker basket of split driftwood and peat turves by the hearth."""
    rnd = random.Random("logs")
    logs = [B(rnd.uniform(-0.12, 0.12), rnd.uniform(-0.1, 0.1), 0.45 + 0.05 * k, 0.1, 0.42, 0.1) for k in range(5)]
    return [part("Basket", T("litter", 2), C(0, 0, 0, 0.3, 0.42, 10, rt=0.34), bevel=0.02),
            part("Weave", T("litter", 1), *[C(0, 0, z, 0.31 + 0.01 * k, 0.03, 10) for k, z in enumerate((0.1, 0.25))],
                 outline=False),
            part("Logs", T("wood", 4), *logs, bevel=0.02),
            part("Turves", T("brick", 0), B(0.35, -0.2, 0.08, 0.2, 0.14, 0.16), B(0.32, -0.25, 0.22, 0.18, 0.12, 0.1))]


def rug():
    """A rag rug by the fire, its edge scorched where an ember jumped."""
    return [part("Rug", T("blood", 0), B(0, 0, 0.012, 0.8, 0.6, 0.02), outline=False),
            part("Bands", T("bone", 2), *[B(0, y, 0.024, 0.78, 0.06, 0.005) for y in (-0.18, 0, 0.18)], outline=False),
            part("Scorch", F("ink", 0), S(blob(0.32, 0.2, 0.08, 0.06, [], n=8), 0.025, 0.03), outline=False)]


def sawdust():
    """Sawdust on the boards, scuffed into a trail where a chair was dragged."""
    rnd = random.Random("sawdust")
    return [part("Dust", T("plaster", 2), S(blob(0, 0, 0.38, 0.3, [(0.15, 6, 0.4)], n=16), 0, 0.006), outline=False),
            part("Flecks", T("plaster", 3), *[B(rnd.uniform(-0.3, 0.3), rnd.uniform(-0.25, 0.25), 0.008, 0.04, 0.03,
                                                0.004) for _ in range(9)], outline=False),
            part("Drag", T("wood", 3), B(0.1, -0.05, 0.007, 0.06, 0.5, 0.002), outline=False)]


def stool(x, y, seed):
    return [part(f"Stool{seed}", T("wood", 3), C(x, y, 0.42, 0.14, 0.05, 10)),
            part(f"StoolLegs{seed}", T("wood", 1), *[B(x + sx * 0.07, y + sy * 0.07, 0.21, 0.03, 0.03, 0.42)
                                                    for sx in (1, -1) for sy in (1, -1)], outline=False)]


def tavern_table(seed="a"):
    """A scarred tavern table with a stool tucked under either end: a candle in a bottle, tankards, a domino
    game left mid-hand (and on the second, a sailor's knife stuck in the board)."""
    objs = [part("Top", T("wood", 3), B(0, 0, 0.74, 0.96, 0.66, 0.06), bevel=0.01),
            part("Legs", T("wood", 1), *[B(sx * 0.38, sy * 0.24, 0.36, 0.08, 0.08, 0.72) for sx in (1, -1)
                                         for sy in (1, -1)]),
            part("Stretcher", T("wood", 2), B(0, 0, 0.12, 0.76, 0.05, 0.05), outline=False),
            part("Scars", F("wood", 1), B(-0.2, 0.1, 0.771, 0.3, 0.01, 0.002), outline=False),
            *stool(-0.32, -0.38, "w"), *stool(0.32, 0.42, "e")]
    if seed == "b":
        objs += [part("Knife", T("fog", 3), B(0.2, -0.1, 0.84, 0.02, 0.01, 0.14), outline=False),
                 part("KnifeHilt", T("wood", 0), B(0.2, -0.1, 0.95, 0.03, 0.03, 0.08), outline=False),
                 part("Tankards", T("fog", 2), *[C(x, y, 0.77, 0.06, 0.13, 8) for x, y in ((-0.3, 0.1), (-0.12, -0.18))]),
                 part("Cards", T("bone", 3), *[B(-0.02 + 0.08 * k, 0.12, 0.775, 0.06, 0.09, 0.005) for k in range(3)],
                      outline=False)]
    else:
        objs += [part("Bottle", F("moss", 1), C(0.1, 0.05, 0.77, 0.05, 0.2, 8, rt=0.02), outline=False),
                 part("Wax", T("bone", 3), C(0.1, 0.05, 0.97, 0.025, 0.08, 6)),
                 part("Flame", F("lantern", 3), B(0.1, 0.05, 1.08, 0.025, 0.025, 0.05), outline=False),
                 part("Tankard", T("fog", 2), C(-0.28, -0.1, 0.77, 0.06, 0.13, 8)),
                 part("Dominoes", T("bone", 3), *[B(-0.1 + 0.07 * k, -0.15 + 0.02 * k, 0.78, 0.05, 0.1, 0.02)
                                                  for k in range(4)], outline=False)]
    return objs


def barrel(seed="a"):
    """A rum barrel on end, a lid of boards weighted with a stone, a dipper hung on the rim."""
    rnd = random.Random(f"barrel{seed}")
    return [part("Barrel", T("wood", 3), C(0, 0, 0, 0.3, 0.86, 12, rt=0.3), bevel=0.03),
            part("Hoops", T("ink", 1), *[C(0, 0, z, 0.31, 0.04, 12) for z in (0.12, 0.7)], outline=False),
            part("Lid", T("wood", 4), C(0, 0, 0.86, 0.28, 0.03, 12), outline=False),
            part("Stone", T("stone", 3), S(blob(rnd.uniform(-0.08, 0.08), 0.0, 0.09, 0.07, [], n=8), 0.89, 0.97)),
            part("Dipper", T("brass", 1), B(0.26, -0.12, 0.8, 0.03, 0.03, 0.2), C(0.26, -0.12, 0.66, 0.05, 0.05, 6),
                 outline=False)]


def bottle_crate():
    """A crate of empties waiting for the drayman, straw sticking out between the slats."""
    return [part("Crate", T("wood", 2), B(0, 0, 0.18, 0.7, 0.5, 0.36), bevel=0.01),
            part("Slats", T("wood", 3), *[B(0, -0.255, z, 0.72, 0.02, 0.06) for z in (0.08, 0.28)], outline=False),
            part("Necks", F("moss", 1), *[C(x, y, 0.36, 0.035, 0.12, 6, rt=0.02) for x in (-0.24, -0.08, 0.08, 0.24)
                                         for y in (-0.1, 0.1)], outline=False),
            part("Straw", T("litter", 2), B(0.2, -0.27, 0.2, 0.14, 0.02, 0.04), outline=False)]


def piano():
    """An upright piano, its walnut gone grey with salt air, a candle holder on each side, the lid up on a
    sheet of shanty music."""
    return [part("Case", T("wood", 1), B(0, 0.15, 0.7, 0.98, 0.5, 1.4), bevel=0.01),
            part("Lid", T("wood", 2), B(0, 0.15, 1.42, 1.0, 0.54, 0.04)),
            part("Keybed", T("wood", 2), B(0, -0.18, 0.72, 0.94, 0.2, 0.08)),
            part("Keys", T("bone", 3), B(0, -0.2, 0.77, 0.86, 0.14, 0.02), outline=False),
            part("Sharps", T("ink", 1), *[B(-0.38 + 0.065 * k, -0.17, 0.79, 0.025, 0.07, 0.015) for k in range(12)
                                          if k % 7 not in (2, 6)], outline=False),
            part("Music", T("bone", 2), B(0, -0.1, 1.0, 0.36, 0.02, 0.22), outline=False),
            part("Staves", F("ink", 1), *[B(0, -0.112, 0.94 + 0.04 * k, 0.3, 0.003, 0.006) for k in range(4)],
                 outline=False),
            part("Sconces", T("brass", 2), *[B(sx * 0.42, -0.13, 1.05, 0.06, 0.14, 0.03) for sx in (1, -1)]),
            part("Candles", T("bone", 3), *[C(sx * 0.42, -0.16, 1.065, 0.025, 0.12, 6) for sx in (1, -1)]),
            part("Feet", T("wood", 0), *[B(sx * 0.4, -0.2, 0.25, 0.06, 0.2, 0.5) for sx in (1, -1)], outline=False),
            part("Stool", T("wood", 2), B(0, -0.42, 0.42, 0.5, 0.16, 0.06), B(0, -0.42, 0.2, 0.44, 0.1, 0.4))]


def store_shelf(seed="a"):
    """Plank shelves of the tavern's stores: jars of pickled herring, rope, a candle box and spare lamp glass
    (and on the second, a rack of clay pipes and a crate of tallow)."""
    objs = [back_panel("Wall", T("plaster", 1), 0.9, 2.1, 0.0),
            part("Shelves", T("wood", 3), *[B(0, 0.3, z, 0.96, 0.2, 0.04) for z in (0.5, 1.05, 1.6)]),
            part("Brackets", T("ink", 1), *[B(sx * 0.4, 0.33, z - 0.08, 0.03, 0.14, 0.12) for sx in (1, -1)
                                           for z in (0.5, 1.05, 1.6)], outline=False)]
    if seed == "b":
        objs += [part("Pipes", T("bone", 3), *[B(-0.3 + 0.06 * k, 0.24, 1.15, 0.02, 0.16, 0.02) for k in range(6)],
                      outline=False),
                 part("Tallow", T("bone", 2), B(0.2, 0.28, 0.66, 0.4, 0.22, 0.28), bevel=0.01),
                 part("Tin", T("fog", 2), *[C(x, 0.28, 1.62, 0.07, 0.14, 8) for x in (-0.2, 0.0)]),
                 part("Ledger", T("blood", 0), B(0.28, 0.25, 1.64, 0.18, 0.2, 0.06))]
    else:
        objs += [part("Jars", F("moon", 3), *[C(x, 0.28, 1.07, 0.07, 0.2, 8) for x in (-0.3, -0.12, 0.06)],
                      outline=False),
                 part("Herring", T("fog", 3), *[B(x, 0.26, 1.15, 0.08, 0.02, 0.03) for x in (-0.3, -0.12, 0.06)],
                      outline=False),
                 part("Rope", T("bone", 1), C(0.28, 0.28, 0.52, 0.14, 0.12, 10), bevel=0.02),
                 part("CandleBox", T("wood", 2), B(-0.2, 0.28, 0.6, 0.36, 0.18, 0.16)),
                 part("Glass", F("moon", 4), *[C(x, 0.28, 1.62, 0.05, 0.18, 8, rt=0.04) for x in (0.1, 0.28)],
                      outline=False)]
    return objs


def card_table():
    """The back-room card table under its lamp: a baize top worn through, a pile of IOUs, a pistol-shaped
    patch of no dust where something lay until tonight."""
    return [part("Top", F("moss", 1), C(0, 0, 0.72, 0.44, 0.04, 14), outline=False),
            part("Rim", T("wood", 2), C(0, 0, 0.7, 0.46, 0.04, 14)),
            part("Leg", T("wood", 1), C(0, 0, 0.0, 0.24, 0.06, 8), C(0, 0, 0.06, 0.07, 0.64, 8)),
            part("Wear", F("moss", 0), C(-0.12, 0.08, 0.761, 0.12, 0.002, 10), outline=False),
            part("Cards", T("bone", 3), *[B(-0.1 + 0.06 * k, -0.15, 0.765, 0.06, 0.09, 0.005) for k in range(4)],
                 outline=False),
            part("Notes", T("bone", 2), B(0.18, 0.12, 0.77, 0.16, 0.1, 0.02), B(0.2, 0.1, 0.79, 0.16, 0.1, 0.02)),
            part("Lamp", T("brass", 1), C(0.0, 0.2, 0.76, 0.08, 0.1, 10, rt=0.06)),
            part("Chimney", F("lantern", 3), C(0.0, 0.2, 0.86, 0.04, 0.16, 8, rt=0.03), outline=False),
            part("Coins", T("brass", 2), *[C(x, y, 0.765, 0.03, 0.01, 8) for x, y in ((0.1, -0.25), (0.15, -0.2))],
                 outline=False),
            *stool(-0.38, -0.36, "s"), *stool(0.38, 0.36, "n")]


def black_market():
    """Mrs Grieves's other trade (8D's black market): a sea chest with false bottom half out, tea, tobacco and
    French brandy under a tarpaulin, a lantern shuttered down to a slit."""
    return [part("Chest", T("wood", 1), B(0, 0.1, 0.25, 0.86, 0.5, 0.5), bevel=0.02),
            part("Bands", T("brass", 1), *[B(x, 0.1, 0.25, 0.04, 0.52, 0.52) for x in (-0.3, 0.3)], outline=False),
            part("Drawer", T("wood", 2), B(0, -0.22, 0.08, 0.7, 0.26, 0.1)),
            part("Tea", T("litter", 2), *[B(x, -0.22, 0.17, 0.12, 0.12, 0.08) for x in (-0.2, 0.0, 0.2)], outline=False),
            part("Tarp", T("slate", 2), S(blob(0.0, 0.1, 0.46, 0.27, [(0.1, 4, 0.2)], n=14), 0.5, 0.62), bevel=0.03),
            part("Brandy", F("lantern", 0), *[C(x, 0.2, 0.62, 0.05, 0.22, 8, rt=0.02) for x in (-0.22, -0.1)],
                 outline=False),
            part("Lantern", T("ink", 1), B(0.25, 0.1, 0.72, 0.16, 0.16, 0.22)),
            part("Slit", F("lantern", 3), B(0.25, 0.019, 0.72, 0.1, 0.005, 0.02), outline=False)]


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
    "prop_window": (64, 112, window),
    "prop_fence": (64, 56, fence),
    "prop_bench": (64, 64, bench),
    "prop_planks": (64, 64, planks),
    "prop_oil_barrel": (64, 64, oil_barrel),
    "prop_letter_box": (64, 80, letter_box),
    "prop_shelf": (64, 112, shelf),
    "prop_crepe": (64, 112, crepe),
    "prop_scarecrow": (64, 112, scarecrow),
    "prop_photos": (64, 96, photos),
    "prop_portrait": (64, 112, portrait),
    "prop_drowned_lantern": (64, 80, drowned_lantern),
    "prop_den": (64, 96, den),
    "prop_ore_cart": (64, 64, ore_cart),
    "prop_tin_crate": (64, 64, tin_crate),
    # Round 8 (8J, art.md 4.2): St Brannock's.
    "prop_rope": (64, 128, lambda: on_wall(chapel_rope(), -0.7)),
    "prop_stained_glass": (64, 128, lambda: on_wall(stained_glass())),
    "prop_stained_glass_e": (64, 128, lambda: turned(on_wall(stained_glass()))),
    "prop_candle_stand": (64, 96, candle_stand),
    "prop_hymn_board": (64, 128, lambda: on_wall(hymn_board())),
    "prop_memorial": (64, 128, lambda: on_wall(memorial())),
    "prop_lectern": (64, 80, lectern),
    "prop_pulpit": (64, 128, pulpit),
    "prop_font": (64, 80, font),
    "prop_votive_rack": (64, 64, votive_rack),
    "prop_alms_box": (64, 80, alms_box),
    "prop_flower_stand": (64, 96, flower_stand),
    "prop_altar": (64, 96, altar),
    # Round 8 (8J): Vane Manor. Hung things carry their own wall block (on_wall).
    "prop_clock": (64, 128, lambda: on_wall(clock(), -0.72)),
    "prop_safe": (64, 128, lambda: on_wall(safe(), -0.24)),
    "prop_lockedDoor": (64, 128, lambda: on_wall(locked_door())),
    "prop_bookcase": (64, 128, bookcase),
    "prop_bookcase_b": (64, 128, lambda: bookcase("b")),
    "prop_tin_cabinet": (64, 128, tin_cabinet),
    "prop_tin_cabinet_b": (64, 128, lambda: tin_cabinet("b")),
    "prop_fireplace_e": (64, 128, lambda: turned(on_wall(fireplace(), -0.75))),
    "prop_armchair": (64, 96, lambda: spun(armchair(True), -0.98)),
    "prop_lamp_table": (64, 80, lamp_table),
    "prop_boot_rack": (64, 64, boot_rack),
    "prop_coat_stand": (64, 112, coat_stand),
    "prop_vane_portrait": (64, 128, lambda: on_wall(vane_portrait())),
    "prop_draped_window": (64, 128, lambda: on_wall(draped_window())),
    "prop_sideboard": (64, 96, sideboard),
    "prop_nightstand": (64, 80, nightstand),
    "prop_dressing_table": (64, 112, dressing_table),
    "prop_washstand": (64, 96, washstand),
    "prop_blanket_chest": (64, 64, blanket_chest),
    "prop_linen_press": (64, 128, linen_press),
    # Round 8 (8J): the Drowned Lantern and its back room.
    "prop_bar_counter": (64, 96, bar_counter),
    "prop_bar_counter_taps": (64, 96, lambda: bar_counter("taps")),
    "prop_bar_counter_lamp": (64, 128, lambda: bar_counter("lamp")),
    "prop_bottle_shelf": (64, 128, lambda: on_wall(bottle_shelf())),
    "prop_bottle_shelf_b": (64, 128, lambda: on_wall(bottle_shelf("b"))),
    "prop_tide_chart": (64, 128, lambda: on_wall(tide_chart())),
    "prop_chalkboard": (64, 128, lambda: on_wall(chalkboard())),
    "prop_ship_wheel": (64, 128, lambda: on_wall(ship_wheel())),
    "prop_inglenook_e": (64, 128, lambda: turned(on_wall(inglenook(), -0.75))),
    "prop_keg_rack": (64, 96, keg_rack),
    "prop_settle": (64, 112, settle),
    "prop_log_basket": (64, 64, log_basket),
    "prop_rug": (64, 48, rug),
    "prop_sawdust": (64, 48, sawdust),
    "prop_tavern_table": (64, 80, tavern_table),
    "prop_tavern_table_b": (64, 80, lambda: tavern_table("b")),
    "prop_barrel": (64, 80, barrel),
    "prop_bottle_crate": (64, 64, bottle_crate),
    "prop_piano": (64, 96, piano),
    "prop_store_shelf": (64, 128, lambda: on_wall(store_shelf())),
    "prop_store_shelf_b": (64, 128, lambda: on_wall(store_shelf("b"))),
    "prop_card_table": (64, 80, card_table),
    "prop_blackMarket": (64, 80, black_market),
    **SPOTS,
}
