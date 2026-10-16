"""Render the square props and the clue sprites through the rig (docs/SPRITES.md 8).

    python tools/blender/build_props.py -- --out build/render
    # -> build/render/props/*.png + manifest.json, build/render/clues/*.png + manifest.json

Every item is modelled here from chamfered boxes and prisms in palette colours (no imported mesh),
like build_villager.py. Props face the camera (-Y) and stand on the origin, which becomes the frame
pivot. Clues lie on the ground: marks are rendered straight down (TileCam, as the ground tiles),
the bucket by the tilted SpriteCam; both at 64 px per metre in 64 px cells.
"""

from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import static_common as sc  # noqa: E402
from static_common import blob, box, cylinder, flat, frustum, mesh, slab, stroke, toon  # noqa: E402

PROP_CELL = (192, 148)  # cell px, ground row px: 148 px of height above the base, 44 px in front


# ---------------------------------------------------------------- props


def prop_bell():
    objs = [
        mesh("BellBase", toon("fog"), [(box, dict(center=(0, 0, 0.06), size=(1.25, 0.46, 0.12)))], bevel=0.02),
        mesh("BellPosts", toon("slate"), [
            (box, dict(center=(sx * 0.48, 0, 1.06), size=(0.15, 0.15, 1.9))) for sx in (1, -1)
        ] + [(box, dict(center=(0, 0, 1.96), size=(1.2, 0.17, 0.14)))], bevel=0.02),
        mesh("BellBraces", toon("slate"), [
            (frustum, dict(z0=1.55, z1=1.9, bottom=(0.06, 0.08), top=(0.06, 0.08), offset=(sx * 0.42, 0),
                           top_offset=(sx * 0.24, 0))) for sx in (1, -1)
        ]),
        mesh("BellRoof", toon("ink"), [
            (frustum, dict(z0=2.03, z1=2.2, bottom=(1.4, 0.42), top=(1.1, 0.06))),
        ], bevel=0.01),
        mesh("Bell", toon("mustard"), [
            (cylinder, dict(center=(0, 0, 1.38), radius=0.25, depth=0.12, segments=10)),
            (cylinder, dict(center=(0, 0, 1.5), radius=0.22, radius_top=0.13, depth=0.34, segments=10)),
            (box, dict(center=(0, 0, 1.88), size=(0.08, 0.08, 0.06))),
        ]),
        mesh("BellRope", toon("bone"), [(box, dict(center=(0.04, -0.02, 1.06), size=(0.035, 0.035, 0.66)))]),
    ]
    return objs


def prop_pump():
    return [
        mesh("WellHead", toon("fog"), [
            (cylinder, dict(center=(0, 0.05, 0), radius=0.44, depth=0.48, segments=10)),
        ], bevel=0.02),
        mesh("WellRim", toon("bone"), [
            (cylinder, dict(center=(0, 0.05, 0.48), radius=0.47, depth=0.07, segments=10)),
        ]),
        mesh("WellWater", flat("ink"), [
            (cylinder, dict(center=(0, 0.05, 0.5), radius=0.36, depth=0.06, segments=10)),
        ], outline=False),
        mesh("PumpBody", toon("slate"), [
            (cylinder, dict(center=(0, 0.18, 0.5), radius=0.1, depth=0.8, segments=8)),
            (cylinder, dict(center=(0, 0.18, 1.3), radius=0.13, radius_top=0.05, depth=0.12, segments=8)),
        ]),
        mesh("PumpSpout", toon("slate"), [
            (frustum, dict(z0=0.98, z1=1.06, bottom=(0.07, 0.3), top=(0.07, 0.3), offset=(0, 0.02))),
            (box, dict(center=(0, -0.12, 0.96), size=(0.07, 0.07, 0.1))),
        ]),
        mesh("PumpHandle", toon("ink"), [
            (frustum, dict(z0=1.24, z1=1.3, bottom=(0.05, 0.05), top=(0.05, 0.05), offset=(0, 0.2),
                           top_offset=(0, 0.2))),
            (frustum, dict(z0=1.26, z1=1.52, bottom=(0.05, 0.05), top=(0.05, 0.05), offset=(0.06, 0.24),
                           top_offset=(0.36, 0.42))),
        ]),
    ]


def prop_noticeBoard():  # noqa: N802 (key follows the scene kind)
    papers = [((-0.36, 1.46), (0.26, 0.32), "bone"), ((-0.02, 1.52), (0.24, 0.2), "bone"),
              ((0.3, 1.38), (0.28, 0.36), "bone"), ((0.02, 1.18), (0.22, 0.2), "mustard"),
              ((-0.34, 1.12), (0.22, 0.18), "bone")]
    objs = [
        mesh("BoardPosts", toon("slate"), [
            (box, dict(center=(sx * 0.62, 0, 0.95), size=(0.12, 0.12, 1.9))) for sx in (1, -1)
        ], bevel=0.02),
        mesh("Board", toon("fog"), [(box, dict(center=(0, 0, 1.35), size=(1.24, 0.07, 0.72)))], bevel=0.015),
        mesh("BoardFrame", toon("slate"), [
            (box, dict(center=(0, -0.01, 1.73), size=(1.36, 0.1, 0.07))),
            (box, dict(center=(0, -0.01, 0.97), size=(1.36, 0.1, 0.07))),
        ]),
        mesh("BoardRoof", toon("ink"), [
            (frustum, dict(z0=1.77, z1=1.96, bottom=(1.5, 0.36), top=(1.3, 0.06))),
        ], bevel=0.01),
    ]
    for i, ((x, z), (w, h), token) in enumerate(papers):
        objs.append(mesh(f"Paper{i}", toon(token), [(box, dict(center=(x, -0.045, z), size=(w, 0.012, h)))],
                         outline=False))
        objs.append(mesh(f"Pin{i}", flat("blood"), [(box, dict(center=(x, -0.055, z + h / 2 - 0.04),
                                                               size=(0.035, 0.02, 0.035)))], outline=False))
    return objs


def prop_kitChest():  # noqa: N802
    return [
        mesh("ChestBody", toon("slate"), [(box, dict(center=(0, 0, 0.23), size=(0.92, 0.56, 0.46)))], bevel=0.02),
        mesh("ChestLid", toon("fog"), [
            (frustum, dict(z0=0.46, z1=0.62, bottom=(0.94, 0.58), top=(0.86, 0.36))),
        ], bevel=0.02),
        mesh("ChestBands", toon("ink"), [
            (box, dict(center=(sx * 0.3, 0, 0.32), size=(0.07, 0.6, 0.62))) for sx in (1, -1)
        ]),
        mesh("ChestLock", toon("mustard"), [(box, dict(center=(0, -0.29, 0.42), size=(0.14, 0.04, 0.16)))]),
    ]


def prop_lanternPost(lit: bool):  # noqa: N802
    glass = flat("lantern") if lit else toon("slate")
    objs = [
        mesh("PostBase", toon("fog"), [(box, dict(center=(0, 0, 0.1), size=(0.34, 0.34, 0.2)))], bevel=0.02),
        mesh("Post", toon("slate"), [
            (box, dict(center=(0, 0, 1.15), size=(0.11, 0.11, 1.95))),
            (box, dict(center=(0.17, 0, 2.06), size=(0.36, 0.07, 0.07))),
            (box, dict(center=(0.3, 0, 2.0), size=(0.03, 0.03, 0.12))),
        ]),
        mesh("LanternFrame", toon("ink"), [
            (frustum, dict(z0=1.9, z1=1.94, bottom=(0.32, 0.32), top=(0.32, 0.32), offset=(0.3, 0))),
            (frustum, dict(z0=1.56, z1=1.6, bottom=(0.26, 0.26), top=(0.3, 0.3), offset=(0.3, 0))),
            (frustum, dict(z0=1.94, z1=1.99, bottom=(0.26, 0.26), top=(0.1, 0.1), offset=(0.3, 0))),
        ]),
        mesh("LanternGlass", glass, [
            (frustum, dict(z0=1.6, z1=1.9, bottom=(0.24, 0.24), top=(0.28, 0.28), offset=(0.3, 0))),
        ]),
    ]
    if lit:
        objs.append(mesh("Flame", flat("bone"), [(box, dict(center=(0.3, -0.13, 1.72), size=(0.06, 0.02, 0.1)))],
                         outline=False))
    return objs


PROPS = {
    "prop_bell": prop_bell,
    "prop_pump": prop_pump,
    "prop_noticeBoard": prop_noticeBoard,
    "prop_kitChest": prop_kitChest,
    "prop_lanternPost_lit": lambda: prop_lanternPost(True),
    "prop_lanternPost_unlit": lambda: prop_lanternPost(False),
}


# ---------------------------------------------------------------- clues (1 m = one 64 px cell)

HEIGHTS = {"s": 0.8, "m": 1.0, "t": 1.2}  # print size and stride, by the GDD 3.1 height code
MUD = {"dark": "ink", "mid": "slate", "light": "fog"}
SCARF = {"red": "blood", "green": "teal", "blue": "moon"}  # SPRITES 7 scarf tints
FELT = {"cap": "slate", "bowler": "ink", "bare": "bone"}


LIP = {"dark": "fog", "mid": "fog", "light": "bone"}  # the pressed-up mud rim, so dark mud reads on dark ground


def boot_print(x, y, k, mirror, grow=0.0, z0=0.0, z1=0.01):
    """Sole and heel of one boot print pointing +Y (screen up), length 0.24 m x k, outset by `grow`."""
    sx = -1 if mirror else 1
    sole = blob(x + sx * 0.005 * k, y + 0.04 * k, 0.055 * k + grow, 0.085 * k + grow, [(0.08, 2, 0.3)], n=14)
    heel = blob(x, y - 0.085 * k, 0.045 * k + grow, 0.04 * k + grow, [(0.05, 3, 1.0)], n=10)
    return [(slab, dict(points=sole, z0=z0, z1=z1)), (slab, dict(points=heel, z0=z0, z1=z1))]


def clue_footprint(height, tint):
    k = HEIGHTS[height]
    pair = ((-0.09 * k, -0.15 * k, False), (0.09 * k, 0.15 * k, True))
    lip = [s for x, y, m in pair for s in boot_print(x, y, k, m, grow=0.014)]
    fill = [s for x, y, m in pair for s in boot_print(x, y, k, m, z0=0.01, z1=0.02)]
    return [mesh("FootprintLip", flat(LIP[tint]), lip), mesh("Footprints", flat(MUD[tint]), fill, outline=False)]


def clue_thread(colour):
    pts_l, pts_r = [], []
    for i in range(13):  # a loose wavy strand across the cell, 0.018 m thick
        t = i / 12
        x = -0.34 + 0.68 * t
        y = 0.1 * math.sin(t * 2.6 * math.pi) - 0.05 + 0.08 * t
        pts_l.append((x, y + 0.012))
        pts_r.append((x, y - 0.012))
    strand = pts_r + list(reversed(pts_l))
    knot = blob(0.3, 0.02, 0.045, 0.035, [(0.15, 3, 0.4)], n=12)
    return [
        mesh("Splinter", toon("fog"), [(slab, dict(points=stroke(-0.05, -0.2, 0.5, 0.07, 0.25), z1=0.03))]),
        mesh("Thread", flat(SCARF[colour]), [(slab, dict(points=strand, z0=0.03, z1=0.04)),
                                             (slab, dict(points=knot, z0=0.03, z1=0.045))]),
    ]


def clue_felt(kind):
    patch = blob(0, 0, 0.17, 0.12, [(0.14, 3, 0.2), (0.09, 7, 1.1)], n=24, rotation=0.3)
    fibres = [(slab, dict(points=stroke(0.17 * math.cos(a), 0.12 * math.sin(a), 0.11, 0.02, a), z0=0.0, z1=0.012))
              for a in (0.2, 1.1, 2.3, 3.4, 4.4, 5.5)]
    return [
        mesh("Splinter", toon("fog"), [(slab, dict(points=stroke(0.02, -0.2, 0.56, 0.07, -0.2), z1=0.03))]),
        mesh("Felt", toon(FELT[kind]), [(slab, dict(points=patch, z0=0.03, z1=0.05))] +
             [(f, dict(kw, z0=0.03, z1=0.042)) for f, kw in fibres]),
    ]


def clue_smear():
    body = blob(0.0, 0.0, 0.3, 0.13, [(0.18, 2, 0.5), (0.1, 5, 2.0)], n=26, rotation=0.35)
    drops = [blob(x, y, r, r, [], n=8) for x, y, r in ((0.33, 0.2, 0.035), (-0.32, -0.16, 0.03), (0.2, -0.18, 0.025))]
    return [mesh("Smear", flat("blood"), [(slab, dict(points=body))] + [(slab, dict(points=d)) for d in drops]),
            mesh("SmearStreaks", flat("ink"), [
                (slab, dict(points=stroke(dx, dy, 0.32, 0.025, 0.35), z0=0.01, z1=0.015))
                for dx, dy in ((-0.02, 0.03), (0.04, -0.03))], outline=False)]


def clue_print():
    rings = []
    for i, r in enumerate((0.05, 0.09, 0.13, 0.17, 0.21)):
        outer = blob(0, 0, r * 0.8, r, [], n=24)
        inner = blob(0, 0, r * 0.8 - 0.018, r - 0.018, [], n=24)
        gap = 3 + i * 2  # a break in every ridge, so it reads as a print, not a target
        seg = list(range(gap + 2, 24)) + list(range(0, gap))
        pts = [outer[j] for j in seg] + [inner[j] for j in reversed(seg)]
        rings.append((slab, dict(points=pts, z0=0.01, z1=0.02)))
    return [mesh("PrintSmudge", flat("fog"), [(slab, dict(points=blob(0, 0, 0.22, 0.27, [(0.06, 3, 0.7)], n=20)))],
                 outline=True),
            mesh("PrintRidges", flat("bone"), rings, outline=False)]


def clue_bucket_wet():
    return [
        mesh("Puddle", flat("moon"), [(slab, dict(points=blob(0.04, -0.04, 0.3, 0.18, [(0.12, 3, 0.4)], n=22)))]),
        mesh("PuddleGlint", flat("bone"), [(slab, dict(points=stroke(-0.12, -0.13, 0.12, 0.03, 0.2), z0=0.01,
                                                       z1=0.015))], outline=False),
        mesh("Bucket", toon("slate"), [(cylinder, dict(center=(0.0, 0.05, 0.0), radius=0.13, radius_top=0.16,
                                                       depth=0.3, segments=10))]),
        mesh("BucketBands", toon("ink"), [
            (cylinder, dict(center=(0.0, 0.05, z), radius=0.136 + z * 0.1, depth=0.035, segments=10))
            for z in (0.05, 0.22)]),
        mesh("BucketWater", flat("moon"), [(cylinder, dict(center=(0.0, 0.05, 0.27), radius=0.14, depth=0.02,
                                                           segments=10))], outline=False),
    ]


def clue_fur():
    tufts = []
    for cx, cy, a0 in ((-0.12, 0.08, 0.4), (0.13, -0.04, 2.0), (0.0, -0.18, 1.2)):
        for k in range(5):
            a = a0 + (k - 2) * 0.32
            tufts.append((slab, dict(points=stroke(cx + 0.05 * math.cos(a), cy + 0.05 * math.sin(a), 0.16, 0.035, a),
                                     z0=0.0, z1=0.012 + 0.002 * k)))
    return [mesh("Fur", toon("fog"), tufts)]


def clue_claw():
    gouges = [(slab, dict(points=stroke(-0.12 + 0.12 * i, 0.02 * i, 0.62, 0.06, 1.1, taper=0.2)))
              for i in range(3)]
    cores = [(slab, dict(points=stroke(-0.12 + 0.12 * i, 0.02 * i, 0.44, 0.018, 1.1, taper=0.2), z0=0.01, z1=0.015))
             for i in range(3)]
    return [mesh("Claw", flat("ink"), gouges), mesh("ClawCore", flat("magenta"), cores, outline=False)]


def clue_drag():
    # Fills the cell from bottom to top with straight cut ends, so segments chain along a trail; no
    # outline, which would draw ink across the cut ends.
    n, left, right = 16, [], []
    for i in range(n + 1):
        y = -0.5 + i / n
        w = 0.17 + 0.025 * math.sin(i / n * 2 * math.pi) + 0.012 * math.sin(i / n * 6 * math.pi + 1)
        left.append((-w, y))
        right.append((w + 0.01 * math.sin(i / n * 4 * math.pi), y))
    band = right + list(reversed(left))
    streaks = [(slab, dict(points=[(x - 0.012, -0.5), (x + 0.012, -0.5), (x + 0.008, 0.5), (x - 0.008, 0.5)],
                           z0=0.01, z1=0.015)) for x in (-0.09, 0.02, 0.1)]
    return [mesh("Drag", flat("blood"), [(slab, dict(points=band))], outline=False),
            mesh("DragStreaks", flat("ink"), streaks, outline=False)]


def clues():
    out = {}
    for h in HEIGHTS:
        for tint in MUD:
            out[f"clue_footprint_{h}_{tint}"] = (lambda h=h, tint=tint: clue_footprint(h, tint))
    for colour in SCARF:
        out[f"clue_thread_{colour}"] = lambda colour=colour: clue_thread(colour)
    for kind in FELT:
        out[f"clue_felt_{kind}"] = lambda kind=kind: clue_felt(kind)
    out.update({"clue_smear": clue_smear, "clue_print": clue_print, "clue_bucket_wet": clue_bucket_wet,
                "clue_fur": clue_fur, "clue_claw": clue_claw, "clue_drag": clue_drag})
    return out


TILTED_CLUES = {"clue_bucket_wet"}


def main() -> None:
    out = sc.args_out(sys.argv, "build_props.py")
    scene = sc.setup()

    props = sc.Sheet(out, "props")
    sc.sprite_cam(scene, *PROP_CELL)
    for name, build in PROPS.items():
        objs = build()
        props.render(scene, name)
        sc.clear(objs)
    props.write()

    sheet = sc.Sheet(out, "clues")
    for name, build in clues().items():
        if name in TILTED_CLUES:
            sc.sprite_cam(scene, 64, 40)
        else:
            sc.tile_cam(scene, 64)
        objs = build()
        sheet.render(scene, name, pivot=False)
        sc.clear(objs)
    sheet.write()


if __name__ == "__main__":
    main()
