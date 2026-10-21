"""Save the world art as Blender masters for the ROSW checkout (docs/ASSETS.md 6.6, 6.10; art plan 1.5).

    python tools/blender/save_masters.py -- --out assets/external
    # -> assets/external/world/<mapId>/buildings_<mapId>.blend, props_<mapId>.blend,
    #    assets/external/loft/loft.blend (git-ignored)

The code in build_buildings.py and env/*_props.py is the source of truth and rebuilds these files at any
time; the .blend files are the masters the owner copies to `studio/assets/who-did-it/world/<mapId>/` and
lists in `assets/source/MANIFEST.md`. `buildings_<mapId>.blend` stands every building of the map at its
footprint (one tile = 1 m, world y south = Blender -Y) with the multi-tile props beside them;
`props_<mapId>.blend` lays the shared and the map's props, spots and portal frames out in rows, one per
tile. The ground and kit sheets are textured planes and blocks rebuilt per frame by their scripts and have
no master. `loft.blend` (round 4, `build_loft.py`) holds the loft backdrop and both bedrolls. Like the
villager, a re-save differs from an earlier one only by save-time data.
"""

from __future__ import annotations

import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_buildings as bb  # noqa: E402
import build_loft  # noqa: E402
import static_common as sc  # noqa: E402
from env import blackpine_props, hollowmere_props, shared_props  # noqa: E402

MAP_PROPS = {"hollowmere": hollowmere_props.PROPS, "blackpine": blackpine_props.PROPS}


def into(objs, collection, dx=0.0, dy=0.0):
    for ob in objs:
        if ob.parent is None:
            ob.location.x += dx
            ob.location.y += dy
        for col in ob.users_collection:
            col.objects.unlink(ob)
        collection.objects.link(ob)


def save(path: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(path))
    print(f"saved {path}")


def fresh(name: str):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc._MATS.clear()  # the reset removed the cached materials
    scene = sc.setup()
    col = bpy.data.collections.new(name)
    scene.collection.children.link(col)
    return col


def main() -> None:
    out = sc.args_out(sys.argv, "save_masters.py")
    for map_id, recipes in bb.RECIPES.items():
        col = fresh(f"Buildings_{map_id}")
        for art, rec in recipes.items():
            x0, y0, w, h = bb.footprint_of(rec)
            doors = [(dx - x0, dy - y0, f) for dx, dy, f in rec["doors"]]
            objs, rise = bb.shell(rec, w, h, doors)
            objs += bb.details(rec["details"], w, h, rise)
            into(objs, col, x0, -y0)
        for k, (frame, (w, h, builder)) in enumerate(bb.SLICED_PROPS.get(map_id, {}).items()):
            into(bb.SLICED_BUILDERS[builder](w, h), col, -12.0, -4.0 * k)
        save(os.path.join(out, "world", map_id, f"buildings_{map_id}.blend"))

        col = fresh(f"Props_{map_id}")
        items = sorted({**shared_props.PROPS, **MAP_PROPS[map_id]}.items())
        for i, (_name, (_w, _h, build)) in enumerate(items):
            into(build(), col, 2.0 * (i % 12), -2.0 * (i // 12))
        save(os.path.join(out, "world", map_id, f"props_{map_id}.blend"))

    loft = fresh("Loft")
    into(build_loft.loft_backdrop(), loft)
    for i, self_ in enumerate((False, True)):
        into(build_loft.bedroll(self_), loft, -1 + 2 * i, -8)
    save(os.path.join(out, "loft", "loft.blend"))


if __name__ == "__main__":
    main()
