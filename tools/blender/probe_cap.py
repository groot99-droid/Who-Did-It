"""Measure how close each clip of a character comes to the top of its cell, without rendering (round 8, 8F).

    python tools/blender/probe_cap.py -- --char build/looks/detective.blend --body detective [--anims idle,walk,swing,interact]
        [--dirs n,ne,e,se,s,sw,w,nw] [--limit 3.0]

The 112 px silhouette cap (SPRITES 1, 10.3) leaves four or five rows above a bare head, and a lean away from the
camera, a hat brim's far end or a prop behind the figure lifts on screen by half its depth. For every clip, direction
and frame this projects every vertex of the `body` meshes through `IsoCam` and prints the highest row reached (0 is
the cell's top row) with the part and frame that reach it; a clip under `--limit` rows fails the run. The rendered
outline adds about a pixel, so 3 rows of mesh headroom is the least that renders clean; `build_looks.py` keeps every
look at 3.5 or more.
"""

from __future__ import annotations

import argparse
import os
import sys

import bpy
from bpy_extras.object_utils import world_to_camera_view

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import batch_render as br  # noqa: E402
import rig_common as rc  # noqa: E402


def _args(argv: list[str]) -> argparse.Namespace:
    argv = argv[argv.index("--") + 1 :] if "--" in argv else []
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--char", required=True, help="character .blend with an Export collection")
    p.add_argument("--body", required=True, help="body id, for the report")
    p.add_argument("--anims", default="idle,walk,swing,interact", help="clips to probe (die uses its own cell)")
    p.add_argument("--dirs", default=",".join(rc.DIRECTIONS))
    p.add_argument("--limit", type=float, default=3.0, help="least rows of headroom a clip may have")
    return p.parse_args(argv)


def highest_row(scene, col, arm, anim: str, dirs: list[str]) -> tuple[float, str]:
    """The highest cell row any body vertex reaches over every frame and direction of `anim`."""
    tt = bpy.data.objects["TT"]
    arm.animation_data_create().action = bpy.data.actions[anim]
    cell, feet_row = rc.clip_cell(anim)
    br._place(scene, scene.camera, cell, feet_row)
    meshes = [o for o in col.all_objects if o.type == "MESH" and o.get("wdi_part") == "body"]
    start, end = (int(round(f)) for f in bpy.data.actions[anim].frame_range)
    best: tuple[float, str] = (float("inf"), "")
    for d in dirs:
        tt.rotation_euler.z = rc.turntable_z(rc.DIRECTIONS.index(d))
        for f in range(start, end + 1):
            scene.frame_set(f)
            dg = bpy.context.evaluated_depsgraph_get()
            for o in meshes:
                eo = o.evaluated_get(dg)
                mesh = eo.to_mesh()
                for v in mesh.vertices:
                    co = world_to_camera_view(scene, scene.camera, eo.matrix_world @ v.co)
                    row = (1 - co.y) * cell
                    if row < best[0]:
                        best = (row, f"{o.name} {d} f{f}")
                eo.to_mesh_clear()
    return best


def main() -> None:
    args = _args(sys.argv)
    scene = br.load_rig(None)
    col = br.import_character(args.char, bpy.data.objects["TT"])
    arm = next((o for o in col.all_objects if o.type == "ARMATURE"), None)
    if arm is None:
        raise SystemExit("no armature in Export")
    low = 0
    for anim in args.anims.split(","):
        if anim not in bpy.data.actions:
            raise SystemExit(f"missing action {anim!r}")
        row, where = highest_row(scene, col, arm, anim, args.dirs.split(","))
        flag = "  <-- under the limit" if row < args.limit else ""
        low += row < args.limit
        print(f"{args.body} {anim}: top row {row:.1f} ({where}){flag}")
    if low:
        raise SystemExit(f"{low} clip(s) under {args.limit} rows of headroom")


if __name__ == "__main__":
    main()
