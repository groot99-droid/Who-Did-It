"""Render the world props, spots, portals and clues (docs/SPRITES.md 8, 10.13; art plan 3.5-3.8).

    python tools/blender/build_props.py -- --out build/render [--atlases props,props_hollowmere,clues]
    # -> build/render/<atlas>/*.png + manifest.json (display px)
    pnpm --filter @wdi/sprites pixel ../../build/render/props ../../build/finished/props
    pnpm --filter @wdi/sprites pixel ../../build/render/clues ../../build/finished/clues --display
    pnpm --filter @wdi/sprites pack:static ../../build/finished/props ../../apps/client/public/assets/props

Props, spots and portals (env/shared_props.py for `props`, env/hollowmere_props.py for `props_hollowmere`)
render through IsoCam at the display scale into twice their art cell, pivoted on the ground point under the
tile centre, (w / 2, h - 16) art px, under the 0.75 environment root. Clues stay in 64 px display cells:
the ground decals straight down through TileCam (the client projects them, SPRITES 10.5), the thread, felt
and wet bucket through IsoCam; `pixel --display` finishes them at half size and doubles them back.
"""

from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import static_common as sc  # noqa: E402
from env import blackpine_props, hollowmere_props, shared_props  # noqa: E402
from static_common import blob, box, cylinder, flat, mesh, slab, stroke, toon  # noqa: E402

ATLASES = {"props": shared_props.PROPS, "props_hollowmere": hollowmere_props.PROPS,
           "props_blackpine": blackpine_props.PROPS}

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


def clue_footprint_glow(height):
    """Hunger's prints (`ClueKind.hungerPrints`): the moon ramp's light steps with a one-pixel #7FA8FF rim."""
    k = HEIGHTS[height]
    pair = ((-0.09 * k, -0.15 * k, False), (0.09 * k, 0.15 * k, True))
    rim = [s for x, y, m in pair for s in boot_print(x, y, k, m, grow=0.03)]
    core = [s for x, y, m in pair for s in boot_print(x, y, k, m, grow=0.005, z0=0.01, z1=0.02)]
    heart = [s for x, y, m in pair for s in boot_print(x, y, k * 0.7, m, z0=0.02, z1=0.03)]
    return [mesh("GlowRim", sc.hex_flat("Clue_glow_rim", "#7FA8FF"), rim, outline=False),
            mesh("GlowCore", sc.hex_flat("Clue_glow_core", "#93C2E0"), core, outline=False),
            mesh("GlowHeart", sc.hex_flat("Clue_glow_heart", "#C3EAF2"), heart, outline=False)]


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
    # The body in the dark blood step and only the streaks bright: the world palette's saturated share cap
    # (10%, palette.json) holds for the clue page too.
    return [mesh("Smear", sc.hex_flat("Clue_blood_dark", "#4A0D12"),
                 [(slab, dict(points=body))] + [(slab, dict(points=d)) for d in drops]),
            mesh("SmearStreaks", flat("blood"), [
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
        mesh("Puddle", sc.hex_flat("Clue_puddle", "#6A8EAD"),
             [(slab, dict(points=blob(0.04, -0.04, 0.3, 0.18, [(0.12, 3, 0.4)], n=22)))]),
        mesh("PuddleGlint", flat("bone"), [(slab, dict(points=stroke(-0.12, -0.13, 0.12, 0.03, 0.2), z0=0.01,
                                                       z1=0.015))], outline=False),
        mesh("Bucket", toon("slate"), [(cylinder, dict(center=(0.0, 0.05, 0.0), radius=0.13, radius_top=0.16,
                                                       depth=0.3, segments=10))]),
        mesh("BucketBands", toon("ink"), [
            (cylinder, dict(center=(0.0, 0.05, z), radius=0.136 + z * 0.1, depth=0.035, segments=10))
            for z in (0.05, 0.22)]),
        mesh("BucketWater", sc.hex_flat("Clue_puddle", "#6A8EAD"), [(cylinder, dict(center=(0.0, 0.05, 0.27), radius=0.14, depth=0.02,
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
    return [mesh("Claw", flat("ink"), gouges), mesh("ClawCore", flat("blood"), cores, outline=False)]


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
    return [mesh("Drag", sc.hex_flat("Clue_blood_dark", "#4A0D12"), [(slab, dict(points=band))], outline=False),
            mesh("DragStreaks", flat("blood"), streaks, outline=False)]


def clues():
    out = {}
    for h in HEIGHTS:
        for tint in MUD:
            out[f"clue_footprint_{h}_{tint}"] = (lambda h=h, tint=tint: clue_footprint(h, tint))
    for h in HEIGHTS:
        out[f"clue_footprint_{h}_glow"] = (lambda h=h: clue_footprint_glow(h))
    for colour in SCARF:
        out[f"clue_thread_{colour}"] = lambda colour=colour: clue_thread(colour)
    for kind in FELT:
        out[f"clue_felt_{kind}"] = lambda kind=kind: clue_felt(kind)
    out.update({"clue_smear": clue_smear, "clue_print": clue_print, "clue_bucket_wet": clue_bucket_wet,
                "clue_fur": clue_fur, "clue_claw": clue_claw, "clue_drag": clue_drag})
    return out


ISO_CLUES = {"clue_bucket_wet", "clue_thread_red", "clue_thread_green", "clue_thread_blue", "clue_felt_cap",
             "clue_felt_bowler", "clue_felt_bare"}


def render_props(scene, out: str, atlas: str) -> None:
    sheet = sc.Sheet(out, atlas)
    for name, (aw, ah, build) in sorted(ATLASES[atlas].items()):
        w, h, pivot = 2 * aw, 2 * ah, (aw, 2 * (ah - 16))
        sc.iso_frame(scene, w, h, pivot)
        root = sc.env_root(f"Root_{name}")
        objs = build()
        for o in objs:
            if o.parent is None:
                o.parent = root
        sheet.render(scene, name, pivot=False)
        sheet.frames[name].update(cell=[w, h], pivot=list(pivot))
        sc.clear(objs + [root])
    sheet.write()


def render_clues(scene, out: str) -> None:
    sheet = sc.Sheet(out, "clues")
    for name, build in clues().items():
        if name in ISO_CLUES:
            sc.iso_frame(scene, 64, 64, (32, 36))
        else:
            sc.tile_cam(scene, 64)
        objs = build()
        sheet.render(scene, name, pivot=False)
        sc.clear(objs)
    sheet.write()


def main() -> None:
    import argparse

    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser(prog="build_props.py")
    p.add_argument("--out", required=True)
    p.add_argument("--atlases", default=",".join([*ATLASES, "clues"]))
    a = p.parse_args(argv)
    scene = sc.setup()
    for atlas in a.atlases.split(","):
        if atlas == "clues":
            render_clues(scene, a.out)
        else:
            render_props(scene, a.out, atlas)


if __name__ == "__main__":
    main()
