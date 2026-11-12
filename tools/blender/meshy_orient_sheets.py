"""Orientation and scale sheets for the Meshy catalog: four side views and a top view per model.

    blender -b --factory-startup -P tools/blender/meshy_orient_sheets.py -- --out tools/blender/build/orient [--only a,b] [--res 384]
    python tools/blender/meshy_orient_compose.py tools/blender/build/orient        # joins the tiles into one sheet per model (PIL)

Each view is orthographic and named after the side the CAMERA stands on (S = camera south of the model, looking
north, so it shows the model's south face). A flat pink 1.75 m figure stands just right of the model in every
view, so a door's height and the catalog's `size_m` can be judged. `orient.json` records each model's bounding box.
Used to fill `front` in `meshy_catalog.json` (which face carries the door or sign).
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
import meshy_import as mi  # noqa: E402

SIDES = {"S": (0.0, -1.0), "E": (1.0, 0.0), "N": (0.0, 1.0), "W": (-1.0, 0.0)}
ELEV = math.radians(12.0)
FIG_H = 1.75


def _aim(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def _setup(res: int):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    r = sc.render
    r.engine = "BLENDER_EEVEE"
    r.resolution_x = r.resolution_y = res
    r.film_transparent = False
    r.image_settings.file_format = "PNG"
    r.image_settings.color_mode = "RGB"
    sc.view_settings.view_transform = "Standard"
    sc.eevee.taa_render_samples = 16
    w = bpy.data.worlds.new("w")
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.40, 0.43, 0.48, 1.0)
    bg.inputs[1].default_value = 1.3
    sc.world = w
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    sc.collection.objects.link(cam)
    cam.data.type = "ORTHO"
    cam.data.clip_end = 500.0
    sc.camera = cam
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3.2
    sc.collection.objects.link(sun)
    return sc, cam, sun


def _figure() -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(radius=0.21, depth=1.44, location=(0, 0, 0.72))
    body = bpy.context.active_object
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.155, location=(0, 0, FIG_H - 0.155))
    head = bpy.context.active_object
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    head.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    fig = bpy.context.active_object
    fig.name = "Figure"
    m = bpy.data.materials.new("FigurePink")
    m.use_nodes = True
    n, l = m.node_tree.nodes, m.node_tree.links
    for node in list(n):
        n.remove(node)
    em = n.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (1.0, 0.08, 0.55, 1.0)
    em.inputs["Strength"].default_value = 1.4
    out = n.new("ShaderNodeOutputMaterial")
    l.new(em.outputs["Emission"], out.inputs["Surface"])
    fig.data.materials.append(m)
    return fig


def sheet(name: str, out_dir: str, res: int) -> dict:
    sc, cam, sun = _setup(res)
    obj = mi.import_meshy(name)
    lo, hi = mi._bounds(obj)
    sx, sy, sz = (hi - lo)
    fig = _figure()
    span = max(sx, sy) + 2.3
    cam.data.ortho_scale = 1.08 * max(span, sz * 1.05 + 0.6)
    centre = Vector((0.0, 0.0, sz / 2))
    fig_at = {
        "S": (sx / 2 + 0.55, -sy / 2 + 0.2),
        "E": (sx / 2 - 0.2, sy / 2 + 0.55),
        "N": (-sx / 2 - 0.55, sy / 2 - 0.2),
        "W": (-sx / 2 + 0.2, -sy / 2 - 0.55),
    }
    for side, (dx, dy) in SIDES.items():
        cam.location = centre + Vector((dx, dy, math.tan(ELEV))) * 120.0
        _aim(cam, centre)
        a = math.radians(28.0)
        lx, ly = dx * math.cos(a) - dy * math.sin(a), dx * math.sin(a) + dy * math.cos(a)
        sun.location = Vector((lx, ly, 0.75)) * 50.0
        _aim(sun, (0, 0, 0))
        fig.location = (fig_at[side][0], fig_at[side][1], 0.0)
        sc.render.filepath = os.path.join(out_dir, f"{name}_{side}.png")
        bpy.ops.render.render(write_still=True)
    cam.location = (0.0, 0.0, 150.0)
    cam.rotation_euler = (0.0, 0.0, 0.0)  # straight down, +Y (north) up
    sun.location = (20.0, -30.0, 60.0)
    _aim(sun, (0, 0, 0))
    fig.location = (sx / 2 + 0.55, -sy / 2, 0.0)
    sc.render.filepath = os.path.join(out_dir, f"{name}_TOP.png")
    bpy.ops.render.render(write_still=True)
    return {"bbox_m": [round(sx, 2), round(sy, 2), round(sz, 2)], "tris": len(obj.data.polygons)}


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser(prog="meshy_orient_sheets.py")
    p.add_argument("--out", default="tools/blender/build/orient")
    p.add_argument("--only")
    p.add_argument("--res", type=int, default=384)
    a = p.parse_args(argv)
    out = os.path.abspath(a.out)
    os.makedirs(out, exist_ok=True)
    cat = mi.catalog()
    names = [n for n in cat if not a.only or n in a.only.split(",")]
    report_path = os.path.join(out, "orient.json")
    report = json.load(open(report_path)) if os.path.exists(report_path) else {}
    for i, n in enumerate(names):
        info = sheet(n, out, a.res)
        info.update(kind=cat[n]["kind"], size_m=cat[n]["size_m"])
        report[n] = info
        with open(report_path, "w") as fh:
            json.dump(report, fh, indent=1)
        print(f"SHEET {i + 1}/{len(names)} {n} {info}", flush=True)
    print("SHEETS_DONE", len(names), flush=True)


main()
