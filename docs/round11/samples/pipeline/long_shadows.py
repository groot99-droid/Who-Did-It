"""Round 11, 11A: the long-shadow measurement behind round11-plan.md 3 (the owner's CL3).

Not a build tool: a design sample, like make_samples.py beside it. It renders the shadow layer of pipeline.md 4.3
for HollowMere's tavern and the Baker under a shadow-only sun at several elevations and azimuths. The key that shades
the art stays A9's (CL2). For each variant it reports:

- the share of the layer left visible beside the statics;
- the layer's trimmed area against the statics' own;
- the render time.

It writes `long-shadows.png`. Run from the repository root, as make_samples.py:

    EGL_PLATFORM=surfaceless python docs/round11/samples/pipeline/long_shadows.py -- --look build/looks/baker.blend \
        --work build/r11-shadows --out docs/round11/samples/pipeline
"""

from __future__ import annotations

import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make_samples as ms  # noqa: E402  (sets up sys.path and argv for the rig)

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

# (label, elevation of the shadow sun in degrees, azimuth turn from the key's in degrees; + is clockwise from above)
VARIANTS = [
    ("key: 55 deg (today)", 55.0, 0.0),
    ("35 deg", 35.0, 0.0),
    ("25 deg", 25.0, 0.0),
    ("25 deg, turned 45 deg", 25.0, 45.0),
]


def key_world_bearing(key) -> tuple[float, float]:
    """(azimuth clockwise from world +Y, elevation) of the direction towards the key, in degrees."""
    d = key.matrix_world.to_3x3() @ Vector((0.0, 0.0, 1.0))
    return math.degrees(math.atan2(d.x, d.y)), math.degrees(math.asin(max(-1.0, min(1.0, d.z))))


def aim(obj, azimuth: float, elevation: float) -> None:
    az, el = math.radians(azimuth), math.radians(elevation)
    d = Vector((math.sin(az) * math.cos(el), math.cos(az) * math.cos(el), math.sin(el)))
    mw = obj.matrix_world.copy()
    obj.parent = None
    obj.matrix_world = mw
    obj.rotation_euler = d.to_track_quat("Z", "Y").to_euler()


def measure(layer: str, statics: str) -> tuple[float, float]:
    import numpy as np
    from PIL import Image

    s = np.asarray(Image.open(layer).convert("RGBA"))[..., 3] > 20
    b = np.asarray(Image.open(statics).convert("RGBA"))[..., 3] > 127
    own = b.sum()
    return float((s & ~b).sum() / own), float(s.sum() / own)


def main() -> None:
    from PIL import Image

    from materials import hd

    a = ms.args()
    os.makedirs(a.work, exist_ok=True)
    scene = ms.build_scene(a.look)
    W = lambda n: os.path.join(a.work, n)  # noqa: E731
    ground = bpy.data.objects["SampleGround"]
    meshes = [o for o in scene.objects if o.type == "MESH" and not o.hide_render and o is not ground]
    ms.lights_today(scene)
    for o in meshes:
        o.hide_render = True
    g = ms.render(scene, W("ground.png"), "ground")
    for o in meshes:
        o.hide_render = False
    ground.hide_render = True
    b = ms.render(scene, W("statics.png"), "statics")
    key = bpy.data.objects["Key"]
    az0, el0 = key_world_bearing(key)
    strength0 = key.data.energy
    print(f"key: world azimuth {az0:.1f}, elevation {el0:.1f}")
    ms.lights_shadow(scene)
    catcher = hd.add_catcher(scene)
    for o in meshes:
        o.visible_camera = False
    cells, rows = [], []
    for label, el, turn in VARIANTS:
        aim(key, az0 + turn, el)
        # The catcher reads the lit ground's luma (rig_common.HD catcherLit); a lower sun lights the ground less, so
        # its strength rises by sin(today) / sin(el) to keep unshadowed ground clear.
        key.data.energy = strength0 * math.sin(math.radians(el0)) / math.sin(math.radians(el))
        t = time.time()
        path = W(f"layer_{int(el)}_{int(turn)}.png")
        ms.render(scene, path, label)
        dt = time.time() - t
        vis, area = measure(path, b)
        rows.append((label, vis, area, dt))
        comp = Image.alpha_composite(Image.open(g).convert("RGBA"), Image.open(path).convert("RGBA"))
        comp = Image.alpha_composite(comp, Image.open(b).convert("RGBA"))
        cp = W(f"comp_{int(el)}_{int(turn)}.png")
        comp.save(cp)
        cells.append((f"{label}: visible {vis:.0%} of the building's area, layer {area:.0%}, {dt:.0f} s", cp))
    for o in meshes:
        o.visible_camera = True
    catcher.hide_render = True
    ms.sheet(cells, os.path.join(a.out, "long-shadows.png"),
             "11A long shadows (CL3): a shadow-only sun under the A9 key's shading, ground + layer + statics", 2)
    for r in rows:
        print("row: %s\tvisible %.3f\tarea %.3f\t%.1f s" % r)


if __name__ == "__main__":
    main()
