"""Shared helpers for the static sheets (props, clues, VFX) rendered through the rig.

Not a character pass: each item is built from code, rendered one frame at a time and deleted. The
output is `<out>/<atlas>/<file>.png` plus `<out>/<atlas>/manifest.json`, which `tools/sprites/
pack-static.ts` packs (docs/SPRITES.md 8):

    {"version": 1, "atlas": "props",
     "frames": {"prop_bell": {"file": "prop_bell.png", "cell": 192, "pivot": [96.0, 148.0]}}}

`pivot` is in cell pixels from the top-left corner of the untrimmed cell (absent = centred).
"""

from __future__ import annotations

import json
import math
import os
import sys

import bpy
import bmesh  # after bpy: the bpy wheel registers bmesh on import

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_rig  # noqa: E402
import rig_common as rc  # noqa: E402
from batch_render import feet_px, render_to, touches_border  # noqa: E402
from build_villager import box, frustum, ring  # noqa: E402,F401  (re-exported shape helpers)


def args_out(argv: list[str], prog: str) -> str:
    import argparse

    argv = argv[argv.index("--") + 1 :] if "--" in argv else []
    p = argparse.ArgumentParser(prog=prog)
    p.add_argument("--out", required=True, help="render root, e.g. build/render")
    return p.parse_args(argv).out


def setup() -> bpy.types.Scene:
    """The rig with the calibration objects hidden."""
    scene = build_rig.build()
    for obj in bpy.data.collections["Calibration"].objects:
        obj.hide_render = True
    bpy.data.objects["TT"].rotation_euler.z = 0.0
    return scene


def sprite_cam(scene, cell: int, feet_row: float) -> None:
    """Tilted camera at 64 px per metre, the world origin on `feet_row` in a `cell` px square."""
    cam = bpy.data.objects["SpriteCam"]
    scene.camera = cam
    cam.data.ortho_scale = cell / rc.TILE_PX
    cam.data.shift_x = 0.0
    cam.data.shift_y = rc.camera_shift_y(feet_row, cell)
    scene.render.resolution_x = scene.render.resolution_y = cell


def tile_cam(scene, cell: int, metres: float | None = None) -> None:
    """Straight-down camera centred on the origin; 64 px per metre unless `metres` spans the cell."""
    cam = bpy.data.objects["TileCam"]
    scene.camera = cam
    cam.location = (0.0, 0.0, 30.0)
    cam.data.ortho_scale = metres if metres is not None else cell / rc.TILE_PX
    scene.render.resolution_x = scene.render.resolution_y = cell


# ---------------------------------------------------------------- materials

_MATS: dict[str, bpy.types.Material] = {}


def toon(token: str) -> bpy.types.Material:
    """Toon material whose mid band is `token`, light and shadow from rig_common.SHADES."""
    name = f"Static_toon_{token}"
    if name not in _MATS:
        light, shadow = rc.SHADES[token]
        _MATS[name] = build_rig.toon_material(name, light, token, shadow)
    return _MATS[name]


def flat(token: str) -> bpy.types.Material:
    """Unlit palette colour (decals, glass, blood)."""
    name = f"Static_flat_{token}"
    if name not in _MATS:
        _MATS[name] = build_rig.flat_material(name, token)
    return _MATS[name]


# ---------------------------------------------------------------- shapes


def cylinder(bm, center, radius, depth, segments=8, radius_top=None, rotation=0.0):
    """Low-poly prism (or frustum) along Z, base at center z."""
    cx, cy, cz = center
    rt = radius if radius_top is None else radius_top
    lo, hi = [], []
    for i in range(segments):
        a = rotation + 2 * math.pi * (i + 0.5) / segments
        c, s = math.cos(a), math.sin(a)
        lo.append(bm.verts.new((cx + radius * c, cy + radius * s, cz)))
        hi.append(bm.verts.new((cx + rt * c, cy + rt * s, cz + depth)))
    bm.faces.new(list(reversed(lo)))
    bm.faces.new(hi)
    for i in range(segments):
        j = (i + 1) % segments
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))


def slab(bm, points, z0=0.0, z1=0.01):
    """Extrude a 2D polygon (counter-clockwise points) between z0 and z1."""
    lo = [bm.verts.new((x, y, z0)) for x, y in points]
    hi = [bm.verts.new((x, y, z1)) for x, y in points]
    bm.faces.new(list(reversed(lo)))
    bm.faces.new(hi)
    n = len(points)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))


def blob(cx, cy, rx, ry, lobes, n=20, rotation=0.0):
    """Points of an irregular closed outline: an ellipse modulated by (amplitude, frequency, phase)."""
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n
        r = 1.0 + sum(amp * math.sin(freq * a + ph) for amp, freq, ph in lobes)
        x, y = rx * r * math.cos(a), ry * r * math.sin(a)
        c, s = math.cos(rotation), math.sin(rotation)
        pts.append((cx + x * c - y * s, cy + x * s + y * c))
    return pts


def stroke(cx, cy, length, width, angle, taper=0.3):
    """A tapered blade shape (claw gouge, fibre), centred, pointing along `angle` radians."""
    hl, hw = length / 2, width / 2
    local = [(-hl, 0.0), (-hl * 0.6, -hw), (hl * 0.6, -hw * taper), (hl, 0.0),
             (hl * 0.6, hw * taper), (-hl * 0.6, hw)]
    c, s = math.cos(angle), math.sin(angle)
    return [(cx + x * c - y * s, cy + x * s + y * c) for x, y in local]


def mesh(name: str, mat: bpy.types.Material, shapes, outline: bool = True, bevel: float = 0.0):
    """One object from shape callbacks [(fn, kwargs)] with one material, in the scene collection."""
    bm = bmesh.new()
    for fn, kw in shapes:
        fn(bm, **kw)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    data = bpy.data.meshes.new(name)
    bm.to_mesh(data)
    bm.free()
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new("Chamfer", "BEVEL")
        mod.width, mod.segments, mod.limit_method = bevel, 1, "ANGLE"
    if outline:
        build_rig.add_outline(obj, "character")
    return obj


def clear(objs) -> None:
    for obj in objs:
        data = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        if data is not None and data.users == 0:
            bpy.data.meshes.remove(data)


# ---------------------------------------------------------------- output


class Sheet:
    """Collects rendered frames of one atlas and writes its manifest."""

    def __init__(self, out_root: str, atlas: str):
        self.dir = os.path.join(out_root, atlas)
        os.makedirs(self.dir, exist_ok=True)
        self.atlas = atlas
        self.frames: dict[str, dict] = {}

    def render(self, scene, name: str, pivot: bool = True) -> None:
        """Render the current scene as frame `name`; `pivot` records the projected origin."""
        file = name.replace("/", "_") + ".png"
        path = os.path.join(self.dir, file)
        bpy.context.view_layer.update()
        render_to(scene, path)
        cell = scene.render.resolution_x
        entry: dict = {"file": file, "cell": cell}
        if pivot:
            origin = bpy.data.objects["Feet"]  # the rig's Feet empty sits at the world origin
            entry["pivot"] = feet_px(scene, origin, cell)
        if touches_border(path):
            entry["clipped"] = True
            print(f"warning: {self.atlas}/{name} touches the cell edge")
        self.frames[name] = entry

    def write(self) -> None:
        with open(os.path.join(self.dir, "manifest.json"), "w") as fh:
            json.dump({"version": 1, "atlas": self.atlas, "frames": self.frames}, fh, indent=2, sort_keys=True)
            fh.write("\n")
        print(f"{self.atlas}: {len(self.frames)} frames -> {self.dir}")
