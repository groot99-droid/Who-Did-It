"""Render the VFX sheets through the rig (docs/SPRITES.md 8; ASSETS 6.3 names them).

    python tools/blender/build_vfx.py -- --out build/render   # -> build/render/vfx/*.png + manifest.json
    pnpm --filter @wdi/sprites pixel ../../build/render/vfx ../../build/finished/vfx --display
    pnpm --filter @wdi/sprites pack:static ../../build/finished/vfx ../../apps/client/public/assets/vfx

Round 5 (art plan 4.6): the vertical effects (blood splat, dust step and the new `vfx_disguise`) render
through IsoCam at the display scale under the character root (0.75 on every axis, like a figure); the
blood pool keeps the straight-down TileCam (a ground decal) and the vote stamp is UI. The `pixel` CLI
finishes the sheet at display size (`--display`: snapped, mode-halved, doubled with nearest scaling).

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
# The world palette's darkest blood step (not a saturated colour): the bulk of a pool and of the stamp's
# rings, so the sheet keeps the 10% saturated cap of ASSETS 6.1; the bright blood stays on the drops,
# the specks and the stamp's cross.
OLD_BLOOD = sc.rc.ramp_step("blood", 0)
G = 9.8


def ease_out(t: float) -> float:
    return 1.0 - (1.0 - t) ** 3


def iso_cam(scene, cell: int, feet_row: float) -> None:
    """IsoCam at the display scale, the world origin on `feet_row` of a `cell` px square (SPRITES 10.3)."""
    cam = bpy.data.objects["IsoCam"]
    scene.camera = cam
    cam.data.ortho_scale = sc.rc.ortho_scale(cell)
    cam.data.shift_x = 0.0
    cam.data.shift_y = sc.rc.camera_shift_y(feet_row, cell)
    scene.render.resolution_x = scene.render.resolution_y = cell


def frame(sheet, scene, anim: str, i: int, objs, figure_scale: bool = False) -> None:
    """Render one frame; `figure_scale` puts the objects under the character root (heights at 0.75)."""
    if figure_scale:
        root = bpy.data.objects["CharRoot"]
        for o in objs:
            o.parent = root
    sheet.render(scene, f"{anim}/{i:03d}")
    sc.clear(objs)


# ---------------------------------------------------------------- blood pool (TileCam, 128 px)


def blood_pool(sheet, scene) -> None:
    sc.tile_cam(scene, 128)
    lobes = [(0.12, 3, 0.4), (0.07, 5, 1.7), (0.04, 9, 0.2)]
    for i in range(8):
        k = ease_out((i + 1) / 8)
        r = 0.1 + 0.48 * k
        objs = [mesh("Pool", flat(OLD_BLOOD), [(slab, dict(points=blob(0.03, -0.02, r * 1.15, r * 0.85, lobes, n=28,
                                                                     rotation=0.25)))])]
        if i >= 5:  # the lantern glint once it settles
            objs.append(mesh("PoolGlint", flat("bone"), [(slab, dict(points=stroke(-r * 0.5, r * 0.35, r * 0.35, 0.03,
                                                                                    0.5), z0=0.01, z1=0.02))],
                             outline=False))
        frame(sheet, scene, "vfx_blood_pool", i, objs)


# ---------------------------------------------------------------- blood splat (IsoCam, 128 px)


def blood_splat(sheet, scene) -> None:
    iso_cam(scene, 128, 88)
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
        frame(sheet, scene, "vfx_blood_splat", i, objs, figure_scale=True)


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
    rings = annulus(0.62, 0.74, 40, jit, gaps=(7, 23)) + annulus(0.48, 0.53, 32, [0.0, 0.006, -0.004])
    rings += [(slab, dict(points=blob(x, y, 0.025, 0.02, [], n=8))) for x, y in ((0.82, 0.1), (-0.3, -0.8),
                                                                                  (0.55, -0.66))]
    cross = [(slab, dict(points=bar(0.84, 0.15, a), z0=0.002, z1=0.012)) for a in (math.pi / 4, -math.pi / 4)]
    objs = [mesh("SealRings", flat(OLD_BLOOD), rings, outline=False), mesh("SealCross", flat("blood"), cross,
                                                                            outline=False)]
    for obj in objs:
        obj.scale = (scale, scale, 1.0)
        obj.rotation_euler.z = rot
    return objs


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
            objs += seal(ss, rot)
        if hs is not None:
            objs += handle(hs, off)
        frame(sheet, scene, "vfx_vote_stamp", i, objs)


# ---------------------------------------------------------------- dust step (IsoCam, 64 px)


def puff(bm, center, radius):
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=radius,
                               matrix=Matrix.Translation(center))


def dust_step(sheet, scene) -> None:
    iso_cam(scene, 64, 44)
    puffs = [((-0.12, -0.02), 1.0), ((0.11, 0.0), 0.9), ((0.0, -0.1), 1.1), ((0.02, 0.1), 0.8)]
    radii = [0.07, 0.11, 0.13, 0.11, 0.07, 0.025]
    for i, r0 in enumerate(radii):
        spread = 1.0 + 0.5 * i / 5
        shapes = [(puff, dict(center=(x * spread, y * spread, 0.04 + 0.03 * i), radius=r0 * k)) for (x, y), k in puffs]
        objs = [mesh("Dust", toon("fog"), shapes, outline=i < 4)]
        frame(sheet, scene, "vfx_dust_step", i, objs, figure_scale=True)


# ---------------------------------------------------------------- disguise (IsoCam, 128 px, round 5)


def disguise(sheet, scene) -> None:
    """The Impersonate puff where a Knife strike drops a disguise (art plan 4.6, deck-data 9).

    A puff of fog and ink smoke rises from the feet to head height around a figure-sized column, one
    mustard spark turns inside it, and it thins to nothing by frame 7. Pivot at the feet.
    """
    iso_cam(scene, 128, 112)
    rng = random.Random(11)  # fixed: the sheet is deterministic
    seeds = [(rng.uniform(0, 2 * math.pi), rng.uniform(0.10, 0.24), rng.uniform(0.0, 1.0), rng.random() < 0.4)
             for _ in range(18)]
    for i in range(8):
        t = i / 7
        fog, ink = [], []
        for a, r, h, dark in seeds:
            rise = h * 0.9 + t * 1.1  # each puff climbs from the feet towards the head (1.7 m)
            if rise > 1.75:
                continue
            size = (0.10 + 0.07 * math.sin(math.pi * min(1.0, rise / 1.6))) * (1.0 - 0.85 * t)
            if size < 0.02:
                continue
            ang = a + t * 1.2
            spot = dict(center=(r * (1 + t * 0.6) * math.cos(ang), r * (1 + t * 0.6) * math.sin(ang), rise),
                        radius=size)
            (ink if dark else fog).append((puff, spot))
        objs = []
        if fog:
            objs.append(mesh("SmokeFog", toon("fog"), fog, outline=i < 5))
        if ink:
            objs.append(mesh("SmokeInk", toon("slate"), ink, outline=i < 5))
        if i < 7:  # the spark turns as it rises, gone on the last frame
            spark = mesh("Spark", flat("mustard"), [(box, dict(center=(0, 0, 0), size=(0.06, 0.06, 0.06)))],
                         outline=False)
            spark.location = (0.05 * math.cos(i), 0.05 * math.sin(i), 0.5 + 0.17 * i)
            spark.rotation_euler = (0.6 * i, 0.4 * i, 0.9 * i)
            objs.append(spark)
        frame(sheet, scene, "vfx_disguise", i, objs, figure_scale=True)


def main() -> None:
    out = sc.args_out(sys.argv, "build_vfx.py")
    scene = sc.setup()
    sheet = sc.Sheet(out, "vfx")
    for fn in (blood_pool, blood_splat, vote_stamp, dust_step, disguise):
        fn(sheet, scene)
    sheet.write()


if __name__ == "__main__":
    main()
