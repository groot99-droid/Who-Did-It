"""Import the owner's Meshy models into the render rig with their ORIGINAL Meshy textures.

    from meshy_import import import_meshy
    cottage = import_meshy("widow_cottage")          # scaled to the catalog's size_m, footprint centre on the origin, base on z = 0

Unlike `kit_import.import_part` this does NOT re-material through `WDI_Toon` and does not snap to the world
palette: the Meshy base-colour textures stay as generated (owner decision, 2026-11-11: the old kit art is
second rate, the Meshy look is the new art style). Everything else follows `kit_import`: one joined mesh,
transforms applied, tagged `obj["wdi_part"] = "meshy:<name>"`, no outline modifier.

The files live in git-ignored `assets/external/meshy/` (75 GLBs, about 730 MB, all 80k triangles or less).
`meshy_catalog.json` lists each model's kind (`building`, `prop`, `kit`, `vehicle`), its longest-side size in
metres and its source batch. Meshy gives every model an arbitrary scale, so `size_m` is the only size truth.

CLI, for a headless check or a review render under the real IsoCam rotation and rig lights:

    blender -b -P tools/blender/meshy_import.py -- --name widow_cottage --render out.png [--res 800]
    blender -b -P tools/blender/meshy_import.py -- --all --report build/meshy_report.json
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_rig  # noqa: E402
import rig_common as rc  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MESHY_DIR = os.path.join(ROOT, "assets", "external", "meshy")
CATALOG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "meshy_catalog.json")


def catalog() -> dict[str, dict]:
    with open(CATALOG) as fh:
        return json.load(fh)["models"]


def meshy_path(name: str) -> str:
    entry = catalog()[name]
    path = os.path.join(MESHY_DIR, entry["file"])
    if not os.path.exists(path):
        raise FileNotFoundError(f"meshy_import: {path} missing (assets/external is git-ignored; see assets/source/MANIFEST.md)")
    return path


def _bounds(obj: bpy.types.Object) -> tuple[Vector, Vector]:
    pts = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    return (Vector(min(p[i] for p in pts) for i in range(3)), Vector(max(p[i] for p in pts) for i in range(3)))


def import_meshy(name: str, scale_to_m: float | None = None) -> bpy.types.Object:
    """One joined object with its Meshy materials, sized to the catalog and standing on z = 0."""
    entry = catalog()[name]
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=meshy_path(name))
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == "MESH"]
    if not meshes:
        raise ValueError(f"meshy_import: {name} has no mesh")
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        world = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = world
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in new:
        if o is not obj and o.name in bpy.data.objects:
            bpy.data.objects.remove(o, do_unlink=True)

    lo, hi = _bounds(obj)
    longest = max(hi - lo)
    k = (scale_to_m or entry["size_m"]) / longest
    obj.scale = (k, k, k)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    lo, hi = _bounds(obj)
    obj.location = (-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z)  # footprint centre on the origin, base on the ground
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)

    obj.rotation_mode = "XYZ"  # the glTF importer leaves QUATERNION, which silently ignores rotation_euler
    obj.name = name
    obj["wdi_part"] = f"meshy:{name}"
    obj["wdi_kind"] = entry["kind"]
    if obj.users_collection and bpy.context.scene.collection not in obj.users_collection:
        for c in list(obj.users_collection):
            c.objects.unlink(obj)
        bpy.context.scene.collection.objects.link(obj)
    return obj


def describe(obj: bpy.types.Object) -> dict:
    lo, hi = _bounds(obj)
    imgs = {s.material.name: [n.image.size[:] for n in s.material.node_tree.nodes
                              if n.type == "TEX_IMAGE" and n.image] for s in obj.material_slots
            if s.material and s.material.use_nodes}
    return {"tris": len(obj.data.polygons), "size_m": [round(v, 2) for v in (hi - lo)],
            "materials": len(obj.material_slots), "textures": sum(len(v) for v in imgs.values())}


def _frame_iso(scene: bpy.types.Scene, obj: bpy.types.Object, res: int) -> None:
    """Review framing only: the IsoCam rotation and rig lights, but an ortho scale that fits this model."""
    cam = scene.camera
    lo, hi = _bounds(obj)
    diag = (hi - lo).length
    cam.data.ortho_scale = max(diag * 0.95, 1.0)
    cam.data.clip_end = 400.0
    forward = Vector((0.0, 0.0, -1.0))
    forward.rotate(cam.rotation_euler)
    centre = (lo + hi) / 2
    cam.location = centre - forward * 150.0
    scene.render.resolution_x = scene.render.resolution_y = res
    scene.render.film_transparent = False


def render_one(name: str, out: str, res: int) -> dict:
    scene = build_rig.build()
    obj = import_meshy(name)
    # EnvRoot squashes heights to 0.75 (SPRITES 10.3); parent under it like every world asset.
    env = bpy.data.objects["EnvRoot"]
    obj.parent = env
    bpy.context.view_layer.update()
    # hide the calibration objects; the rig's own collections stay for lighting
    for col in bpy.data.collections:
        if col.name == "Calibration":
            col.hide_render = True
    _frame_iso(scene, obj, res)
    scene.render.filepath = os.path.abspath(out)
    bpy.ops.render.render(write_still=True)
    return describe(obj)


def _args(argv: list[str]) -> argparse.Namespace:
    argv = argv[argv.index("--") + 1:] if "--" in argv else []
    p = argparse.ArgumentParser(prog="meshy_import.py")
    p.add_argument("--name")
    p.add_argument("--all", action="store_true", help="import every catalog model one at a time and report")
    p.add_argument("--render")
    p.add_argument("--res", type=int, default=800)
    p.add_argument("--report")
    return p.parse_args(argv)


if __name__ == "__main__":
    a = _args(sys.argv)
    if a.name and a.render:
        print("RESULT " + json.dumps({a.name: render_one(a.name, a.render, a.res)}))
    elif a.all:
        report = {}
        for n in catalog():
            bpy.ops.wm.read_factory_settings(use_empty=True)
            report[n] = describe(import_meshy(n))
            print("RESULT " + json.dumps({n: report[n]}), flush=True)
        if a.report:
            os.makedirs(os.path.dirname(os.path.abspath(a.report)), exist_ok=True)
            with open(a.report, "w") as fh:
                json.dump(report, fh, indent=1)
    elif a.name:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        print("RESULT " + json.dumps({a.name: describe(import_meshy(a.name))}))
