"""The bakery props of the quick mode (GDD 3.11, docs/SPRITES.md 8), rendered by build_props.py.

Same rules as the square props: chamfered boxes and prisms in palette colours, the camera at -Y, the
origin on the ground under the prop's tile centre (`packages/content/data/scenes/bakery.json`), which
becomes the frame pivot. A prop that spans several tiles is modelled in tile units with its depth
stretched by 1 / cos 40 deg (`D`), so its rows land on the 64 px straight-down grid the plates and
loaves are placed on: the Wake Table's top lines up with the ten plates, and three dead-loaf ledge
segments stack into one oven ledge.
"""

from __future__ import annotations

import math

from static_common import blob, box, cylinder, flat, frustum, mesh, slab, toon

D = 1.0 / math.cos(math.radians(40))  # metres of model depth per tile of screen depth
TABLE_TOP = 0.78  # plate height: the plates are separate sprites drawn on the table's top
LEDGE_TOP = 0.72  # the oven ledge the dead's loaves sit on


def loaf(name, x, y, z, length=0.34, width=0.2, ribbon=False):
    """A scored round loaf (mustard crust, bone scores), long side across the screen."""
    objs = [
        mesh(f"{name}Crust", toon("mustard"), [
            (cylinder, dict(center=(x, y, z), radius=width / 2, radius_top=width * 0.36, depth=0.12,
                            segments=10)),
        ], bevel=0.015),
        mesh(f"{name}Scores", flat("bone"), [
            (box, dict(center=(x + dx, y - width * 0.18, z + 0.105), size=(0.03, 0.05, 0.012)))
            for dx in (-0.05, 0.0, 0.05)
        ], outline=False),
    ]
    objs[0].scale.x = length / width  # the prism is round: stretch it into an oval (x is 0 for every loaf)
    if ribbon:  # the dead's loaves carry a mourning band
        objs.append(mesh(f"{name}Ribbon", toon("ink"), [
            (box, dict(center=(x, y, z + 0.06), size=(0.05, width * 1.04, 0.13))),
        ], outline=False))
    return objs


def prop_wakeTable():  # noqa: N802 (key follows the scene kind)
    # bk.wake_table is the middle tile of the table's back row; the table covers x 6-10, y 4-5.
    back, front = 0.46 * D, -1.46 * D
    mid = (back + front) / 2
    depth = back - front
    objs = [
        mesh("TableTop", toon("slate"), [(box, dict(center=(0, mid, TABLE_TOP - 0.05), size=(4.84, depth, 0.1)))],
             bevel=0.02),
        mesh("TableApron", toon("ink"), [
            (box, dict(center=(0, front + 0.06, TABLE_TOP - 0.16), size=(4.6, 0.06, 0.14))),
            (box, dict(center=(0, back - 0.06, TABLE_TOP - 0.16), size=(4.6, 0.06, 0.14))),
        ]),
        mesh("TableLegs", toon("ink"), [
            (box, dict(center=(sx * 2.25, y, (TABLE_TOP - 0.1) / 2), size=(0.14, 0.14, TABLE_TOP - 0.1)))
            for sx in (1, 0, -1) for y in (front + 0.16, back - 0.16)
        ], bevel=0.01),
        mesh("TableSeams", flat("ink"), [
            (box, dict(center=(0, y, TABLE_TOP), size=(4.7, 0.015, 0.004))) for y in (front + 0.55, back - 0.55)
        ], outline=False),
        # The linen runner between the two rows of plates, and one stub candle at its middle.
        mesh("Runner", toon("bone"), [(box, dict(center=(0, -0.5 * D, TABLE_TOP + 0.005), size=(4.9, 0.3, 0.012)))],
             outline=False),
        mesh("Candle", toon("bone"), [(cylinder, dict(center=(0, -0.5 * D, TABLE_TOP), radius=0.045, depth=0.16,
                                                      segments=8))]),
        mesh("CandleFlame", flat("lantern"), [(box, dict(center=(0, -0.5 * D - 0.02, TABLE_TOP + 0.2),
                                                         size=(0.035, 0.02, 0.07)))], outline=False),
    ]
    return objs


def prop_plate():
    # A plate on the table's top with a mourner's loaf; the client draws the owner's name.
    return [
        mesh("Plate", toon("bone"), [
            (cylinder, dict(center=(0, 0, TABLE_TOP), radius=0.29, radius_top=0.3, depth=0.03, segments=14)),
        ]),
        mesh("PlateWell", flat("fog"), [
            (cylinder, dict(center=(0, 0, TABLE_TOP + 0.03), radius=0.2, depth=0.002, segments=14)),
        ], outline=False),
    ] + loaf("Loaf", 0, 0.01, TABLE_TOP + 0.032, length=0.38, width=0.23)


def prop_deadLoaf():  # noqa: N802
    # One tile of the oven ledge (bk.deadloaf_0..2 stand in a column) with one of the dead's loaves.
    return [
        mesh("Ledge", toon("fog"), [(box, dict(center=(0, 0, (LEDGE_TOP - 0.06) / 2), size=(0.86, D, LEDGE_TOP - 0.06)))], bevel=0.02),
        mesh("LedgeLip", toon("slate"), [(box, dict(center=(0, 0, LEDGE_TOP - 0.03), size=(0.94, D, 0.06)))]),
        mesh("LedgeMortar", flat("slate"), [
            (box, dict(center=(0, -D / 2 - 0.001, z), size=(0.84, 0.004, 0.018))) for z in (0.24, 0.48)
        ], outline=False),
        mesh("Cloth", toon("bone"), [(box, dict(center=(0, 0, LEDGE_TOP + 0.006), size=(0.56, 0.5, 0.012)))],
             outline=False),
    ] + loaf("Loaf", 0, 0.0, LEDGE_TOP + 0.012, length=0.42, width=0.25, ribbon=True)


def prop_ledger():
    # The Baker's ledger, shut, on a sloped counter desk with an inkwell (bk.ledger).
    return [
        mesh("Desk", toon("slate"), [
            (frustum, dict(z0=0.0, z1=0.92, bottom=(0.82, 0.56), top=(0.82, 0.56))),
        ], bevel=0.02),
        mesh("DeskTop", toon("fog"), [
            (frustum, dict(z0=0.92, z1=1.02, bottom=(0.9, 0.62), top=(0.9, 0.62), offset=(0, 0),
                           top_offset=(0, 0.06))),
        ], bevel=0.01),
        mesh("LedgerCover", toon("ink"), [(box, dict(center=(-0.06, -0.02, 1.06), size=(0.5, 0.38, 0.07)))],
             bevel=0.01),
        mesh("LedgerPages", flat("bone"), [(box, dict(center=(-0.06, -0.215, 1.06), size=(0.46, 0.006, 0.04)))],
             outline=False),
        mesh("LedgerClasp", toon("mustard"), [(box, dict(center=(-0.06, -0.21, 1.06), size=(0.07, 0.02, 0.09)))]),
        mesh("Inkwell", toon("ink"), [(cylinder, dict(center=(0.3, 0.06, 1.02), radius=0.06, depth=0.08,
                                                      segments=8))]),
        mesh("Quill", toon("bone"), [
            (frustum, dict(z0=1.08, z1=1.36, bottom=(0.02, 0.02), top=(0.06, 0.015), offset=(0.3, 0.06),
                           top_offset=(0.36, 0.1))),
        ]),
    ]


def prop_oven():
    # The cold bread oven in the north-west corner (bk.oven): brick base, dome, dark mouth, flue.
    return [
        mesh("OvenBase", toon("fog"), [(box, dict(center=(0, 0.1, 0.45), size=(1.5, 1.3, 0.9)))], bevel=0.03),
        mesh("OvenDome", toon("fog"), [
            (cylinder, dict(center=(0, 0.16, 0.9), radius=0.68, radius_top=0.46, depth=0.42, segments=10)),
            (cylinder, dict(center=(0, 0.16, 1.32), radius=0.46, radius_top=0.12, depth=0.3, segments=10)),
        ], bevel=0.02),
        mesh("OvenBricks", flat("slate"), [
            (box, dict(center=(0, -0.551, z), size=(1.46, 0.004, 0.02))) for z in (0.22, 0.44, 0.66)
        ] + [
            (box, dict(center=(x, -0.551, z), size=(0.02, 0.004, 0.2)))
            for z, xs in ((0.11, (-0.45, 0.15)), (0.33, (-0.15, 0.45)), (0.55, (-0.45, 0.15)), (0.77, (-0.15, 0.45)))
            for x in xs
        ], outline=False),
        mesh("OvenMouth", flat("ink"), [(box, dict(center=(0, -0.556, 0.6), size=(0.62, 0.02, 0.4)))],
             outline=False),
        mesh("OvenArch", toon("slate"), [
            (box, dict(center=(0, -0.57, 0.83), size=(0.76, 0.05, 0.07))),
        ] + [(box, dict(center=(sx * 0.35, -0.57, 0.58), size=(0.07, 0.05, 0.46))) for sx in (1, -1)]),
        mesh("OvenAsh", flat("fog"), [(box, dict(center=(0, -0.567, 0.42), size=(0.5, 0.01, 0.04)))], outline=False),
        mesh("Flue", toon("slate"), [
            (box, dict(center=(0.18, 0.3, 2.0), size=(0.26, 0.26, 1.0))),
            (box, dict(center=(0.18, 0.3, 2.53), size=(0.34, 0.34, 0.06))),
        ], bevel=0.01),
        mesh("Peel", toon("slate"), [
            (frustum, dict(z0=0.0, z1=1.3, bottom=(0.05, 0.04), top=(0.05, 0.04), offset=(0.66, -0.5),
                           top_offset=(0.74, -0.38))),
            (frustum, dict(z0=0.0, z1=0.34, bottom=(0.26, 0.03), top=(0.22, 0.03), offset=(0.64, -0.52),
                           top_offset=(0.66, -0.49))),
        ]),
    ]


def prop_basin():
    # The stone wash basin on the east wall (bk.basin), with water and a rag over the rim.
    return [
        mesh("BasinFoot", toon("slate"), [(box, dict(center=(0, 0.04, 0.3), size=(0.32, 0.32, 0.6)))], bevel=0.02),
        mesh("Basin", toon("fog"), [
            (cylinder, dict(center=(0, 0.04, 0.6), radius=0.3, radius_top=0.4, depth=0.2, segments=10)),
        ], bevel=0.015),
        mesh("BasinWater", flat("moon"), [
            (cylinder, dict(center=(0, 0.04, 0.79), radius=0.33, depth=0.012, segments=10)),
        ], outline=False),
        mesh("BasinGlint", flat("bone"), [
            (box, dict(center=(-0.1, -0.06, 0.805), size=(0.14, 0.03, 0.004))),
        ], outline=False),
        mesh("Rag", toon("bone"), [
            (frustum, dict(z0=0.56, z1=0.81, bottom=(0.16, 0.02), top=(0.16, 0.02), offset=(0.26, -0.24),
                           top_offset=(0.24, -0.2))),
        ]),
        mesh("Jug", toon("slate"), [
            (cylinder, dict(center=(0.42, 0.24, 0.0), radius=0.11, radius_top=0.08, depth=0.3, segments=8)),
        ]),
    ]


def prop_flour_sacks():
    # The flour store on the west wall (bk.flour_sacks, kind taskSource): three sacks and a spill.
    def sack(name, x, y, z, w, h, lean=0.0):
        return [
            mesh(f"{name}", toon("bone"), [
                (frustum, dict(z0=z, z1=z + h * 0.8, bottom=(w, w * 0.8), top=(w * 0.92, w * 0.74),
                               offset=(x, y), top_offset=(x + lean, y))),
                (frustum, dict(z0=z + h * 0.8, z1=z + h, bottom=(w * 0.92, w * 0.74), top=(w * 0.3, w * 0.24),
                               offset=(x + lean, y), top_offset=(x + lean * 1.2, y))),
            ], bevel=0.03),
            mesh(f"{name}Tie", toon("slate"), [
                (box, dict(center=(x + lean * 1.1, y, z + h * 0.86), size=(w * 0.4, w * 0.34, 0.05))),
            ], outline=False),
            mesh(f"{name}Mark", flat("fog"), [
                (box, dict(center=(x + lean * 0.4, y - w * 0.4 - 0.002, z + h * 0.42), size=(w * 0.36, 0.004, 0.1))),
            ], outline=False),
        ]

    spill = blob(0.28, -0.42, 0.26, 0.12, [(0.18, 3, 0.4), (0.08, 7, 1.0)], n=20)
    return (
        [mesh("Spill", flat("bone"), [(slab, dict(points=spill, z0=0.0, z1=0.008))], outline=False)]
        + sack("SackBack", 0.02, 0.24, 0.0, 0.5, 0.78)
        + sack("SackLeft", -0.2, -0.12, 0.0, 0.46, 0.66, lean=-0.04)
        + sack("SackRight", 0.26, -0.18, 0.0, 0.42, 0.52, lean=0.06)
    )


# key -> (builder, cell px, ground row px); the cell is square and trimmed by the packer.
BAKERY_PROPS = {
    "prop_wakeTable": (prop_wakeTable, 384, 176),
    "prop_plate": (prop_plate, 96, 72),
    "prop_deadLoaf": (prop_deadLoaf, 128, 84),
    "prop_ledger": (prop_ledger, 128, 100),
    "prop_oven": (prop_oven, 256, 196),
    "prop_basin": (prop_basin, 128, 92),
    "prop_flour_sacks": (prop_flour_sacks, 160, 120),
}
