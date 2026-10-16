"""Render the VFX sheets through the rig (docs/SPRITES.md 8; ASSETS 6.3 names them).

    python tools/blender/build_vfx.py -- --out build/render   # -> build/render/vfx/*.png + manifest.json

The plan put VFX in After Effects; this repo has no After Effects, so each effect is animated here
in code, one frame at a time at the 12 fps output rate, with palette colours only. Frame names are
`<anim>/<nnn>` (`vfx_blood_pool/003`); every frame records its pivot (the effect's ground point, or
the centre for the stamp).
"""

from __future__ import annotations

import math
import os
import random
import sys

import bpy  # noqa: F401  (first: the bpy wheel registers bmesh and mathutils)
import bmesh
from mathutils import Matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import static_common as sc  # noqa: E402
from static_common import blob, box, cylinder, flat, mesh, slab, stroke, toon  # noqa: E402

DT = 1.0 / 12.0  # seconds per output frame
G = 9.8


def ease_out(t: float) -> float:
    return 1.0 - (1.0 - t) ** 3


def frame(sheet, scene, anim: str, i: int, objs) -> None:
    sheet.render(scene, f"{anim}/{i:03d}")
    sc.clear(objs)


# ---------------------------------------------------------------- blood pool (TileCam, 128 px)


def blood_pool(sheet, scene) -> None:
    sc.tile_cam(scene, 128)
    lobes = [(0.12, 3, 0.4), (0.07, 5, 1.7), (0.04, 9, 0.2)]
    for i in range(8):
        k = ease_out((i + 1) / 8)
        r = 0.1 + 0.48 * k
        objs = [mesh("Pool", flat("blood"), [(slab, dict(points=blob(0.03, -0.02, r * 1.15, r * 0.85, lobes, n=28,
                                                                     rotation=0.25)))])]
        if i >= 5:  # the lantern glint once it settles
            objs.append(mesh("PoolGlint", flat("bone"), [(slab, dict(points=stroke(-r * 0.5, r * 0.35, r * 0.35, 0.03,
                                                                                    0.5), z0=0.01, z1=0.02))],
                             outline=False))
        frame(sheet, scene, "vfx_blood_pool", i, objs)


# ---------------------------------------------------------------- blood splat (SpriteCam, 128 px)


def blood_splat(sheet, scene) -> None:
    sc.sprite_cam(scene, 128, 80)
    rng = random.Random(7)  # fixed: the sheet is deterministic
    drops = []
    for _ in range(14):
        a = rng.uniform(0, 2 * math.pi)
        speed = rng.uniform(0.5, 1.3)
        drops.append(dict(vx=speed * math.cos(a), vy=speed * math.sin(a) * 0.8, vz=rng.uniform(0.4, 1.4),
                          size=rng.uniform(0.035, 0.06)))
    z0 = 1.0  # chest height of a 1.7 m villager
    for i in range(12):
        t = (i + 1) * DT
        flying, landed = [], []
        for d in drops:
            land = (d["vz"] + math.sqrt(d["vz"] ** 2 + 2 * G * z0)) / G
            tt = min(t, land)
            x, y = d["vx"] * tt, d["vy"] * tt
            if t < land:
                z = z0 + d["vz"] * t - 0.5 * G * t * t
                s = d["size"]
                flying.append((box, dict(center=(x, y, z), size=(s, s, s * 1.6))))
            else:
                s = d["size"] * 1.6
                landed.append((slab, dict(points=blob(x, y, s, s * 0.7, [(0.2, 3, x * 9)], n=10))))
        objs = []
        if flying:
            objs.append(mesh("Drops", flat("blood"), flying, outline=False))
        if landed:
            objs.append(mesh("Specks", flat("blood"), landed))
        frame(sheet, scene, "vfx_blood_splat", i, objs)


# ---------------------------------------------------------------- vote stamp (straight down, 256 px)


def annulus(r0: float, r1: float, n: int, jitter: list[float], gaps=()):
    """Ring as quads (no polygon with a hole), with a ragged outer edge and optional gaps."""
    shapes = []
    for k in range(n):
        if k in gaps:
            continue
        a0, a1 = 2 * math.pi * k / n, 2 * math.pi * (k + 1) / n
        o0, o1 = r1 + jitter[k % len(jitter)], r1 + jitter[(k + 1) % len(jitter)]
        pts = [(r0 * math.cos(a0), r0 * math.sin(a0)), (o0 * math.cos(a0), o0 * math.sin(a0)),
               (o1 * math.cos(a1), o1 * math.sin(a1)), (r0 * math.cos(a1), r0 * math.sin(a1))]
        shapes.append((slab, dict(points=pts)))
    return shapes


def bar(length: float, width: float, angle: float):
    """A centred rectangle with slightly flared ends, like a stamped stroke."""
    hl, hw = length / 2, width / 2
    local = [(-hl, -hw * 1.15), (0, -hw), (hl, -hw * 1.15), (hl, hw * 1.15), (0, hw), (-hl, hw * 1.15)]
    c, s = math.cos(angle), math.sin(angle)
    return [(x * c - y * s, x * s + y * c) for x, y in local]


def seal(scale: float, rot: float):
    jit = [0.0, 0.012, -0.008, 0.02, 0.004, -0.012, 0.01, 0.0, -0.006, 0.016]
    shapes = annulus(0.62, 0.74, 40, jit, gaps=(7, 23)) + annulus(0.48, 0.53, 32, [0.0, 0.006, -0.004])
    shapes += [(slab, dict(points=bar(0.84, 0.15, a))) for a in (math.pi / 4, -math.pi / 4)]
    shapes += [(slab, dict(points=blob(x, y, 0.025, 0.02, [], n=8))) for x, y in ((0.82, 0.1), (-0.3, -0.8),
                                                                                   (0.55, -0.66))]
    obj = mesh("Seal", flat("blood"), shapes, outline=False)
    obj.scale = (scale, scale, 1.0)
    obj.rotation_euler.z = rot
    return obj


def handle(scale: float, offset=(0.0, 0.0)):
    plate = mesh("StampPlate", toon("slate"), [(cylinder, dict(center=(0, 0, 0.1), radius=0.86, depth=0.12,
                                                               segments=16))])
    knob = mesh("StampKnob", toon("fog"), [(cylinder, dict(center=(0, 0, 0.22), radius=0.3, depth=0.3,
                                                           segments=12))])
    for o in (plate, knob):
        o.scale = (scale, scale, 1.0)
        o.location = (offset[0], offset[1], 0.0)
    return [plate, knob]


def vote_stamp(sheet, scene) -> None:
    sc.tile_cam(scene, 256, metres=2.4)
    rot = math.radians(-12)
    # (handle scale, handle offset or None, seal scale or None)
    beats = [(1.45, (0.0, 0.0), None), (1.25, (0.0, 0.0), None), (1.06, (0.0, 0.0), None),
             (1.0, (0.0, 0.0), None), (1.08, (0.25, 0.2), 1.0), (1.3, (0.85, 0.75), 1.0),
             (None, None, 1.06), (None, None, 1.0), (None, None, 1.0), (None, None, 1.0)]
    for i, (hs, off, ss) in enumerate(beats):
        objs = []
        if ss is not None:
            objs.append(seal(ss, rot))
        if hs is not None:
            objs += handle(hs, off)
        frame(sheet, scene, "vfx_vote_stamp", i, objs)


# ---------------------------------------------------------------- dust step (SpriteCam, 64 px)


def puff(bm, center, radius):
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=radius,
                               matrix=Matrix.Translation(center))


def dust_step(sheet, scene) -> None:
    sc.sprite_cam(scene, 64, 44)
    puffs = [((-0.12, -0.02), 1.0), ((0.11, 0.0), 0.9), ((0.0, -0.1), 1.1), ((0.02, 0.1), 0.8)]
    radii = [0.07, 0.11, 0.13, 0.11, 0.07, 0.025]
    for i, r0 in enumerate(radii):
        spread = 1.0 + 0.5 * i / 5
        shapes = [(puff, dict(center=(x * spread, y * spread, 0.04 + 0.03 * i), radius=r0 * k)) for (x, y), k in puffs]
        objs = [mesh("Dust", toon("fog"), shapes, outline=i < 4)]
        frame(sheet, scene, "vfx_dust_step", i, objs)


def main() -> None:
    out = sc.args_out(sys.argv, "build_vfx.py")
    scene = sc.setup()
    sheet = sc.Sheet(out, "vfx")
    for fn in (blood_pool, blood_splat, vote_stamp, dust_step):
        fn(sheet, scene)
    sheet.write()


if __name__ == "__main__":
    main()
