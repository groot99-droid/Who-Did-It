"""Render the dark-loft images of the quick mode (GDD 3.11, docs/SPRITES.md 8) through the rig.

    python tools/blender/build_loft.py -- --out build/render
    # -> build/render/loft/{loft_backdrop,prop_bedroll,prop_bedroll_self}.png

The client shows the loft as DOM, not as a Phaser scene, so these are plain images (manifest
`type: image`) that the loft sets as CSS backgrounds: `loft_backdrop` behind the whole view (the
bakery loft at night, storm light at the gable window, lantern glow from the ladder hatch), and one
bedroll per seat in the `.wdi-bedrolls` grid of `apps/client/public/mockups/loft.html` at twice the
56 x 92 px blanket. Every bedroll is drawn occupied (A21); `prop_bedroll_self` differs only by its
moon-trimmed blanket. Same `SpriteCam` tilt, toon materials and outline as the props; the backdrop
keeps its middle dark and empty, where the grid and the copy sit.
"""

from __future__ import annotations

import math
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import static_common as sc  # noqa: E402
from batch_render import render_to  # noqa: E402
from static_common import blob, box, cylinder, flat, frustum, mesh, slab, toon  # noqa: E402

UNSHIFTED_DROP_M = 0.75  # the unshifted SpriteCam puts the origin this far below the frame centre
BACKDROP_PX = (1280, 720)
BACKDROP_PX_PER_M = 64
BEDROLL_PX = (112, 184)
BEDROLL_PX_PER_M = 120


def frame(scene, size, px_per_m, centre=(0.0, 0.0)) -> None:
    """SpriteCam framing a `size` px image at `px_per_m`, the world origin `centre` m off the middle."""
    cam = bpy.data.objects["SpriteCam"]
    scene.camera = cam
    w, h = size
    cam.data.sensor_fit = "AUTO"
    cam.data.ortho_scale = max(w, h) / px_per_m
    cam.data.shift_x = -centre[0] / cam.data.ortho_scale
    cam.data.shift_y = (-UNSHIFTED_DROP_M - centre[1]) / cam.data.ortho_scale
    scene.render.resolution_x, scene.render.resolution_y = w, h


# ---------------------------------------------------------------- the loft


def floorboards():
    planks = [(box, dict(center=(0, y, -0.05), size=(26, 0.48, 0.1))) for y in [i * 0.5 - 12 for i in range(34)]]
    seams = [(box, dict(center=(0, y + 0.25, 0.001), size=(26, 0.02, 0.002))) for y in [i * 0.5 - 12 for i in range(34)]]
    joints = [(box, dict(center=(x + (1.3 if i % 2 else 0), i * 0.5 - 12, 0.001), size=(0.02, 0.48, 0.002)))
              for i in range(34) for x in (-8.6, -4.2, 0.4, 5.1, 9.0)]
    return [
        mesh("Floor", toon("ink"), planks, outline=False),
        mesh("FloorSeams", flat("ink"), seams + joints, outline=False),
    ]


def upright(name, mat, pts, plane_y, t0, t1, outline=False):
    """A wall-plane shape: 2D points (x, height) standing at `plane_y`, `t0`..`t1` m toward the camera."""
    ob = mesh(name, mat, [(slab, dict(points=pts, z0=t0, z1=t1))], outline=outline)
    for v in ob.data.vertices:  # slab builds in XY with its thickness on Z: map (x, y, z) -> (x, plane_y - z, y)
        x, y, z = v.co
        v.co = (x, plane_y - z, y)
    ob.data.update()
    return ob


WINDOW = (1.6, 2.35, 1.15)  # centre x, centre height, radius of the gable window


def window(back):
    """Round window in the gable: frame, moon glass, cross mullions, rain streaks and a lightning flash."""
    wx, wz, r = WINDOW

    def disc(radius, n=20):
        return [(wx + radius * math.cos(2 * math.pi * i / n), wz + radius * math.sin(2 * math.pi * i / n))
                for i in range(n)]

    def bar(x0, z0, x1, z1, w):
        return [(x0 - w, z0 - w), (x1 + w, z0 - w), (x1 + w, z1 + w), (x0 - w, z1 + w)]

    g = r * 0.82
    objs = [
        upright("WindowFrame", toon("fog"), disc(r), back, 0.0, 0.14, outline=True),
        upright("WindowGlass", flat("moon"), disc(g), back, 0.14, 0.15),
        upright("Mullions", toon("ink"), bar(wx, wz - g, wx, wz + g, 0.06), back, 0.15, 0.2),
        upright("MullionsH", toon("ink"), bar(wx - g, wz, wx + g, wz, 0.06), back, 0.15, 0.2),
    ]
    for i in range(13):  # slanted streaks across the panes
        x = wx - 0.8 + i * 0.13
        z = wz + 0.6 - (i % 4) * 0.3
        objs.append(upright(f"Rain{i}", flat("fog"), [(x, z), (x + 0.025, z), (x - 0.1, z - 0.4), (x - 0.125, z - 0.4)],
                            back, 0.15, 0.16))
    bolt = [(0.38, 0.86), (0.48, 0.86), (0.3, 0.4), (0.46, 0.4), (0.1, -0.3), (0.24, 0.26), (0.1, 0.26)]
    objs.append(upright("Lightning", flat("bone"), [(wx + x * r, wz + z * r) for x, z in bolt], back, 0.15, 0.17))
    return objs


RIDGE = (1.2, 7.4)  # x and height of the roof ridge above the gable
EAVE = 2.4  # height of the roof slopes at the frame's sides


def back_wall(back):
    """Gable wall in slate planks up to the roof line; the world's dark slate shows above it."""
    rx, rz = RIDGE
    wall = upright("Gable", toon("slate"), [(-13, 0), (13, 0), (13, EAVE), (rx, rz), (-13, EAVE)], back, -0.3, 0.0)
    seams = [upright(f"GableSeam{i}", flat("ink"), [(x - 0.015, 0), (x + 0.015, 0), (x + 0.015, rz), (x - 0.015, rz)],
                     back, 0.0, 0.002) for i, x in enumerate([-10.8 + 1.1 * k for k in range(22)])]
    return [wall] + seams


def rafters(back):
    rx, rz = RIDGE
    objs = []
    for side in (1, -1):  # the two roof slopes meeting at the ridge, seen against the gable
        x0 = 13 * side
        w = 0.32
        pts = [(x0, EAVE - w), (rx, rz - w * 1.2), (rx, rz + w * 0.6), (x0, EAVE + w)]
        if side < 0:
            pts = list(reversed(pts))
        objs.append(upright(f"Rafter{side}", toon("ink"), pts, back, 0.0, 0.36, outline=True))
    objs.append(upright("KingPost", toon("ink"), [(rx - 0.16, 4.1), (rx + 0.16, 4.1), (rx + 0.16, rz), (rx - 0.16, rz)],
                        back, 0.0, 0.3, outline=True))
    objs.append(mesh("TieBeam", toon("slate"), [(box, dict(center=(0, back - 0.3, 4.1), size=(26, 0.3, 0.3)))]))
    objs.append(mesh("Posts", toon("slate"), [
        (box, dict(center=(x, back - 0.3, 2.05), size=(0.3, 0.3, 4.1))) for x in (-7.6, 9.4)
    ]))
    return objs


def hatch(x, y):
    """The ladder hatch in the floor, lantern light from the shop below."""
    return [
        mesh("HatchGlow", flat("lantern"), [(box, dict(center=(x, y, 0.005), size=(1.2, 1.0 * 1.3, 0.01)))],
             outline=False),
        mesh("HatchFrame", toon("slate"), [
            (box, dict(center=(x, y + sy * 0.69, 0.04), size=(1.44, 0.12, 0.08))) for sy in (1, -1)
        ] + [(box, dict(center=(x + sx * 0.66, y, 0.04), size=(0.12, 1.5, 0.08))) for sx in (1, -1)]),
        mesh("Ladder", toon("ink"), [
            (box, dict(center=(x + sx * 0.36, y + 0.5, 0.35), size=(0.08, 0.08, 0.9))) for sx in (1, -1)
        ] + [(box, dict(center=(x, y + 0.5, 0.14 + 0.24 * k), size=(0.72, 0.06, 0.05))) for k in range(3)]),
        mesh("HatchLid", toon("slate"), [
            (frustum, dict(z0=0.0, z1=1.3, bottom=(1.3, 0.08), top=(1.3, 0.08), offset=(x, y + 0.82),
                           top_offset=(x, y + 1.3))),
        ], bevel=0.01),
    ]


def moonlight(back):
    """The window's light on the floorboards: a pale patch thrown forward and to the left, and its cross."""
    wx = WINDOW[0]
    near, far = back - 0.4, back - 3.0
    pts = [(wx - 0.8, near), (wx + 0.8, near), (wx - 0.6, far), (wx - 2.6, far)]
    cross = [(wx - 0.05, near), (wx + 0.05, near), (wx - 1.55, far), (wx - 1.65, far)]
    return [
        mesh("Moonlight", flat("fog"), [(slab, dict(points=pts, z0=0.002, z1=0.004))], outline=False),
        mesh("MoonCross", flat("slate"), [(slab, dict(points=cross, z0=0.004, z1=0.006))], outline=False),
    ]


def clutter(back):
    objs = []
    for i, (x, y, w, h) in enumerate(((-9.4, back - 0.7, 0.8, 0.9), (-8.6, back - 1.2, 0.7, 0.7),
                                      (9.6, back - 0.9, 0.8, 0.8))):
        objs.append(mesh(f"Sack{i}", toon("fog"), [
            (frustum, dict(z0=0, z1=h * 0.8, bottom=(w, w * 0.8), top=(w * 0.9, w * 0.72), offset=(x, y))),
            (frustum, dict(z0=h * 0.8, z1=h, bottom=(w * 0.9, w * 0.72), top=(w * 0.3, w * 0.24), offset=(x, y))),
        ], bevel=0.03))
    objs.append(mesh("Crate", toon("slate"), [(box, dict(center=(8.4, back - 1.0, 0.4), size=(1.0, 0.9, 0.8)))],
                     bevel=0.02))
    objs.append(mesh("CrateBands", toon("ink"), [
        (box, dict(center=(8.4 + sx * 0.32, back - 1.0, 0.4), size=(0.08, 0.94, 0.84))) for sx in (1, -1)
    ]))
    herbs = []
    for k, x in enumerate((-5.6, -4.9, -4.1, 5.2, 6.0)):  # bunches hung from the tie beam
        herbs.append((box, dict(center=(x, back - 0.3, 3.75), size=(0.02, 0.02, 0.7))))
        herbs.append((frustum, dict(z0=2.9 + 0.08 * (k % 2), z1=3.42, bottom=(0.06, 0.06), top=(0.22, 0.14),
                                    offset=(x, back - 0.3))))
    objs.append(mesh("Herbs", toon("fog"), herbs))
    objs.append(mesh("Cobweb", flat("fog"), [
        (slab, dict(points=[(-12, back - 0.5), (-10.4, back - 0.5), (-12, back - 1.8)], z0=0.003, z1=0.005)),
    ], outline=False))
    return objs


def loft_backdrop():
    back = 4.6
    objs = floorboards() + back_wall(back) + window(back) + rafters(back) + moonlight(back)
    objs += hatch(-6.4, -2.8) + clutter(back)
    return objs


# ---------------------------------------------------------------- bedrolls


def bedroll(self_: bool):
    """A sleeper under a blanket on a mattress, head on the pillow, long axis screen-up."""
    trim = flat("moon") if self_ else flat("fog")
    shoulders = blob(0.0, 0.12, 0.27, 0.2, [(0.05, 2, 1.6)], n=18)
    legs = blob(0.02, -0.36, 0.2, 0.36, [(0.06, 3, 0.3)], n=18)
    return [
        mesh("Mattress", toon("ink"), [(box, dict(center=(0, 0, 0.05), size=(0.74, 1.62, 0.1)))], bevel=0.03),
        mesh("Pillow", toon("bone"), [(box, dict(center=(0, 0.6, 0.13), size=(0.52, 0.3, 0.08)))], bevel=0.03),
        mesh("Head", toon("bone"), [(cylinder, dict(center=(0.0, 0.56, 0.16), radius=0.15, radius_top=0.11,
                                                    depth=0.18, segments=10))]),
        mesh("Hair", toon("ink"), [(cylinder, dict(center=(0.0, 0.63, 0.2), radius=0.14, radius_top=0.07,
                                                   depth=0.16, segments=10))], outline=False),
        mesh("Blanket", toon("slate"), [
            (frustum, dict(z0=0.1, z1=0.15, bottom=(0.78, 1.12), top=(0.74, 1.08), offset=(0, -0.24))),
        ], bevel=0.03),
        mesh("Sleeper", toon("slate"), [(slab, dict(points=shoulders, z0=0.15, z1=0.3)),
                                        (slab, dict(points=legs, z0=0.15, z1=0.24))], bevel=0.04),
        mesh("BlanketStripes", trim, [
            (box, dict(center=(0, y, z), size=(0.8, 0.05, 0.006))) for y, z in ((-0.04, 0.245), (-0.7, 0.155))
        ], outline=False),
        mesh("Fold", toon("bone"), [(box, dict(center=(0, 0.33, 0.2), size=(0.8, 0.09, 0.05)))], bevel=0.02),
    ]


def main() -> None:
    out = os.path.join(sc.args_out(sys.argv, "build_loft.py"), "loft")
    os.makedirs(out, exist_ok=True)
    scene = sc.setup()

    frame(scene, BACKDROP_PX, BACKDROP_PX_PER_M, centre=(0.0, -1.6))
    scene.render.film_transparent = False  # opaque: the world's dark slate fills the roof space
    objs = loft_backdrop()
    render_to(scene, os.path.join(out, "loft_backdrop.png"))
    sc.clear(objs)
    scene.render.film_transparent = True

    frame(scene, BEDROLL_PX, BEDROLL_PX_PER_M, centre=(0.0, -0.06))
    for name, self_ in (("prop_bedroll", False), ("prop_bedroll_self", True)):
        objs = bedroll(self_)
        render_to(scene, os.path.join(out, f"{name}.png"))
        sc.clear(objs)
    print(f"loft: 3 images -> {out}")


if __name__ == "__main__":
    main()
