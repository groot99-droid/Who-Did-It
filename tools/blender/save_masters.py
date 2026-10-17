"""Save the round-4 art as Blender masters for the ROSW checkout (docs/ASSETS.md 6.6, 6.10).

    python tools/blender/save_masters.py -- --out assets/external
    # -> assets/external/bakery/bakery_props.blend, assets/external/loft/loft.blend (git-ignored)

The code in bakery_props.py and build_loft.py is the source of truth and rebuilds these files at any
time; the .blend files are the masters the owner copies to `studio/assets/who-did-it/world/<slug>/`
and lists in `assets/source/MANIFEST.md`. `bakery_props.blend` lays the seven bakery props out at their
`bakery.json` tiles (one tile = 1 m across, `bakery_props.D` m deep), `loft.blend` holds the backdrop
and both bedrolls. Like the villager, a re-save differs from an earlier one only by save-time data.
"""

from __future__ import annotations

import json
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import static_common as sc  # noqa: E402
from bakery_props import BAKERY_PROPS, D  # noqa: E402
import build_loft  # noqa: E402

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
BAKERY = os.path.join(ROOT, "packages", "content", "data", "scenes", "bakery.json")


def place(objs, dx, dy, collection):
    for ob in objs:
        ob.location.x += dx
        ob.location.y += dy
        for col in ob.users_collection:
            col.objects.unlink(ob)
        collection.objects.link(ob)


def save(path: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(path))
    print(f"saved {path}")


def main() -> None:
    out = sc.args_out(sys.argv, "save_masters.py")
    with open(BAKERY) as fh:
        props = json.load(fh)["props"]

    scene = sc.setup()
    col = bpy.data.collections.new("Bakery")
    scene.collection.children.link(col)
    for p in props:  # every tile of bakery.json: x to the right, y down the screen (world -Y)
        key = f"prop_{p['kind']}" if p["kind"] != "taskSource" else f"prop_{p['id'].split('.')[1]}"
        build = BAKERY_PROPS[key][0]
        place(build(), p["x"], -p["y"] * D, col)
    save(os.path.join(out, "bakery", "bakery_props.blend"))

    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc._MATS.clear()  # the reset removed the cached palette materials
    scene = sc.setup()
    loft = bpy.data.collections.new("Loft")
    scene.collection.children.link(loft)
    place(build_loft.loft_backdrop(), 0, 0, loft)
    for i, self_ in enumerate((False, True)):
        place(build_loft.bedroll(self_), -1 + 2 * i, -8, loft)
    save(os.path.join(out, "loft", "loft.blend"))


if __name__ == "__main__":
    main()
