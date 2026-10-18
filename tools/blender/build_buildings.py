"""Render the map building atlases and the sliced props (docs/SPRITES.md 10.5, 10.13; art plan 3.4, 3.5).

    python tools/blender/build_buildings.py -- --out build/render [--maps hollowmere] [--only tavern]
    # -> build/render/bld_<mapId>/<art>.png, <art>.tiles.png + manifest.json (display px)
    #    build/render/props_<mapId>_sliced/... for the multi-tile props, the same way
    pnpm --filter @wdi/sprites slice ../../build/render/bld_hollowmere ../../build/finished/bld_hollowmere

Each building is built from a recipe at its footprint: the scene file's `buildings[]` entry when the scene
has one (5J's data), else the footprint of art plan 3.4 / world.md 7-8. Walls stand 3 m and the roof sits
on top, all under the 0.75 environment root; eaves stay within 0.25 tile of the south and east faces; doors
are modelled where the scene's portals are (south or east faces); windows are painted lit in the lantern
ramp. The building renders whole through IsoCam at the display scale with the footprint's centre on the
canvas pivot, then once more as a tile map: every surface coloured by the footprint tile it stands above
(R = dx + 1, G = dy + 1, written raw), which `tools/sprites/slice.ts` uses to cut the finished frame into
one slice per tile, `<art>#<dx>_<dy>`, each keeping the untrimmed canvas.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import random
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import static_common as sc  # noqa: E402
from batch_render import render_to  # noqa: E402
from env.kitbash import B, C, F, S, T, blob, frustum, part  # noqa: E402
from env.kits import SURFACE_TEXTURES, texture_path  # noqa: E402
from kit_import import KITS  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SCENES = os.path.join(ROOT, "packages", "content", "data", "scenes")
WALL = 3.0
EAVE = 0.2  # within the 0.25 tile SPRITES 10.5 allows on the south and east faces
TOP = 400  # canvas px above the footprint's diamond: walls, roof, chimneys


# Tints that pull a photo towards its art-plan colour (the slate roofs read grey-blue, not beige).
TINTS = {"slate_roof": "#6A8EAD"}


def tex(name: str, metres: float = 1.0):
    return sc.tex_toon(f"BldTex_{name}", texture_path(KITS, SURFACE_TEXTURES[name]), metres=metres,
                       gains=(1.1, 0.8, 0.55), tint=TINTS.get(name))


# ---------------------------------------------------------------- recipes (art plan 3.4)
# scene, building id, art, footprint (x, y, w, h) as world.md 7-8, doors [(x, y, face)], and the look.

RECIPES = {
    "hollowmere": {
        "manor": dict(scene="overworld", id="ov.bld_manor", fp=(3, 6, 13, 6), doors=[(13, 11, "s"), (6, 11, "s")],
                      wall="granite", roof="slate_roof", storeys=2, chimneys=[(0.2, 0.5), (0.8, 0.5)],
                      lit=[(0, 2)], dormers=3, details="manor"),
        "barn": dict(scene="overworld", id="ov.bld_barn", fp=(47, 6, 10, 5), doors=[(51, 10, "s")],
                     wall="boards", roof="slate_roof", storeys=1, chimneys=[], lit=[], details="barn",
                     plinth="granite"),
        "bakery": dict(scene="overworld", id="ov.bld_bakery", fp=(40, 16, 6, 4), doors=[(42, 19, "s")],
                       wall="plaster", roof="slate_roof", storeys=1, chimneys=[(0.75, 0.6)], lit="all",
                       details="bakery"),
        "apoth": dict(scene="overworld", id="ov.bld_apoth", fp=(47, 17, 10, 8), doors=[(50, 24, "s")],
                      wall="plaster", roof="slate_roof", storeys=2, chimneys=[(0.3, 0.4)], lit="half",
                      details="apoth"),
        "widow": dict(scene="overworld", id="ov.bld_widow", fp=(2, 17, 8, 7), doors=[(9, 20, "e")],
                      wall="granite", roof="slate_roof", storeys=1, chimneys=[(0.25, 0.5)], lit=[], details="widow"),
        "tavern": dict(scene="overworld", id="ov.bld_tavern", fp=(25, 28, 12, 7),
                       doors=[(28, 34, "s"), (36, 31, "e")], wall="plaster", roof="slate_roof", storeys=2,
                       chimneys=[(0.15, 0.5), (0.7, 0.4)], lit="all", details="tavern"),
        "chapel": dict(scene="overworld", id="ov.bld_chapel", fp=(2, 28, 9, 8), doors=[(10, 32, "e")],
                       wall="granite", roof="slate_roof", storeys=1, chimneys=[], lit="half", details="chapel"),
        "netloft": dict(scene="overworld", id="ov.bld_netloft", fp=(40, 28, 5, 9), doors=[],
                        wall="boards", roof="slate_roof", storeys=2, chimneys=[], lit=[], details="netloft",
                        tar=True),
        "mollHut": dict(scene="forest_deep", id="fd.bld_moll_hut", fp=(0, 0, 4, 3), doors=[], wall="logs",
                        roof="sod", storeys=1, chimneys=[], lit=[], details="mollhut"),
    },
}

# Multi-tile props sliced like buildings (art plan 3.5): atlas, frame stem, footprint w, h, builder name.
SLICED_PROPS = {
    "hollowmere": {
        "prop_wakeTable": (5, 2, "wake_table"),
        "prop_hanging_oak": (2, 2, "hanging_oak"),
        "prop_clamp": (2, 2, "clamp"),
        "prop_pump_beam": (2, 3, "pump_beam"),
    },
}


def footprint_of(recipe: dict) -> tuple[int, int, int, int]:
    """The scene file's footprint for this building when 5J's data has it, else the recipe's."""
    path = os.path.join(SCENES, f"{recipe['scene']}.json")
    if os.path.exists(path):
        with open(path) as fh:
            for b in json.load(fh).get("buildings", []):
                if b["id"] == recipe["id"]:
                    f = b["footprint"]
                    return f["x"], f["y"], f["w"], f["h"]
    return recipe["fp"]


# ---------------------------------------------------------------- the shell


def gable(w, h, z0, along_x: bool, mat):
    """A gable roof over local X 0..w, Y -h..0, ridge along the longer side, eaves EAVE out."""
    if along_x:
        span, length = h, w
    else:
        span, length = w, h
    rise = min(1.6, 0.3 * span + 0.3)  # a low Cornish pitch keeps the slices inside the 2048 x 1024 page
    hw = span / 2 + EAVE
    prof = [(-hw, 0.0), (0.0, rise), (hw, 0.0), (hw, -0.16), (0.0, rise - 0.22), (-hw, -0.16)]
    shapes = [S(prof, -EAVE, length + EAVE)]
    roof = part("Roof", mat, *shapes, outline=True)
    # S extrudes the 2-D profile (u, v) along Z: map it onto the roof's axes.
    for v in roof.data.vertices:
        u, vv, t = v.co
        v.co = (t, -h / 2 + u, z0 + vv) if along_x else (w / 2 + u, -t, z0 + vv)
    roof.data.update()
    return roof, rise


def windows_on(w, h, doors, storeys, lit, rnd):
    """Window boxes on the south (y = -h) and east (x = w) faces, skipping door tiles."""
    shapes_lit, shapes_dark, frames = [], [], []
    rows = [1.25] if storeys == 1 else [0.95, 2.15]
    south = [i for i in range(w) if i % 2 == 1 and all(not (f == "s" and dx == i) for dx, _, f in doors)]
    east = [j for j in range(h) if j % 2 == 1 and all(not (f == "e" and dy == j) for _, dy, f in doors)]
    slots = [("s", i, z) for i in south for z in rows] + [("e", j, z) for j in east for z in rows]
    for k, (face, i, z) in enumerate(slots):
        on = lit == "all" or (lit == "half" and k % 2 == 0) or (isinstance(lit, list) and (i, rows.index(z)) in lit)
        if face == "s":
            glass = B(i + 0.5, -h - 0.02, z, 0.5, 0.04, 0.6)
            frame = B(i + 0.5, -h - 0.03, z - 0.33, 0.66, 0.08, 0.06)
        else:
            glass = B(w + 0.02, -(i + 0.5), z, 0.04, 0.5, 0.6)
            frame = B(w + 0.03, -(i + 0.5), z - 0.33, 0.08, 0.66, 0.06)
        (shapes_lit if on else shapes_dark).append(glass)
        frames.append(frame)
    out = [part("Sills", T("stone", 3), *frames, outline=False)] if frames else []
    if shapes_lit:
        out.append(part("WindowsLit", F("lantern", 3), *shapes_lit, outline=False))
    if shapes_dark:
        out.append(part("WindowsDark", F("slate", 1), *shapes_dark, outline=False))
    return out


def doors_on(w, h, doors):
    out = []
    for dx, dy, face in doors:
        if face == "s":
            out += [part("Door", T("wood", 3), B(dx + 0.5, -h - 0.03, 1.0, 0.7, 0.06, 2.0)),
                    part("DoorFrame", T("wood", 1), B(dx + 0.5, -h - 0.05, 2.08, 0.9, 0.06, 0.16),
                         *[B(dx + 0.5 + sx * 0.42, -h - 0.05, 1.04, 0.08, 0.06, 2.08) for sx in (1, -1)]),
                    part("Step", T("stone", 3), B(dx + 0.5, -h - 0.16, 0.06, 0.9, 0.3, 0.12))]
        else:
            out += [part("Door", T("wood", 3), B(w + 0.03, -(dy + 0.5), 1.0, 0.06, 0.7, 2.0)),
                    part("DoorFrame", T("wood", 1), B(w + 0.05, -(dy + 0.5), 2.08, 0.06, 0.9, 0.16),
                         *[B(w + 0.05, -(dy + 0.5) + sy * 0.42, 1.04, 0.06, 0.08, 2.08) for sy in (1, -1)]),
                    part("Step", T("stone", 3), B(w + 0.16, -(dy + 0.5), 0.06, 0.3, 0.9, 0.12))]
    return out


def chimney(x, y, top, ramp="brick"):
    return part("Chimney", T(ramp, 2), B(x, y, top / 2, 0.55, 0.55, top), B(x, y, top + 0.06, 0.66, 0.66, 0.12))


def shell(rec: dict, w: int, h: int, doors_local) -> list:
    rnd = random.Random(f"bld:{rec['id']}")
    wall_mat = tex(rec["wall"], 1.0)
    objs = [part("Plinth", tex(rec.get("plinth", "granite"), 1.0), B(w / 2, -h / 2, 0.18, w + 0.06, h + 0.06, 0.36),
                 outline=False),
            part("Walls", wall_mat, B(w / 2, -h / 2, WALL / 2, w, h, WALL), outline=True)]
    if rec.get("tar"):
        objs[-1].data.materials[0] = sc.hex_toon("Bld_tar", "#2C3240", "#1A1D29", "#12141C")
    if rec["storeys"] == 2:
        objs.append(part("StringCourse", T("stone", 3), B(w / 2, -h / 2, 1.6, w + 0.06, h + 0.06, 0.1), outline=False))
    roof_mat = tex("slate_roof", 1.0) if rec["roof"] == "slate_roof" else T("moss", 1)
    roof, rise = gable(w, h, WALL, w >= h, roof_mat)
    objs.append(roof)
    for fx, fy in rec["chimneys"]:
        objs.append(chimney(fx * w, -fy * h, WALL + rise + 0.6))
    objs += windows_on(w, h, doors_local, rec["storeys"], rec["lit"], rnd)
    objs += doors_on(w, h, doors_local)
    return objs, rise


# ---------------------------------------------------------------- details per building


def details(name: str, w: int, h: int, rise: float) -> list:
    if name == "manor":
        # The stopped clock in the east gable, the iron railings close to the front door.
        return [part("Clock", T("bone", 2), B(w + 0.02, -h / 2, WALL + rise * 0.4, 0.04, 0.5, 0.5), outline=True),
                part("Hands", T("ink", 1), B(w + 0.05, -h / 2 + 0.05, WALL + rise * 0.4 + 0.06, 0.02, 0.04, 0.2),
                     B(w + 0.05, -h / 2 - 0.05, WALL + rise * 0.4, 0.02, 0.16, 0.04), outline=False),
                part("Railings", T("ink", 1), *[B(10.5 + 0.2 * k, -h - 0.18, 0.4, 0.04, 0.04, 0.8) for k in range(11)],
                     outline=False)]
    if name == "barn":
        return [part("BarnDoors", T("wood", 2), B(4.5, -h - 0.04, 1.3, 2.0, 0.06, 2.6)),
                part("BarnCross", T("wood", 4), *[B(4.5, -h - 0.07, 1.3, 2.4, 0.03, 0.1) for _ in range(1)]),
                part("HayDoor", T("wood", 1), B(w + 0.03, -h / 2, WALL - 0.3, 0.06, 0.8, 0.8))]
    if name == "bakery":
        return [part("BowWindow", F("lantern", 2), B(1.5, -h - 0.1, 1.3, 1.6, 0.2, 1.0)),
                part("BowFrame", T("wood", 2), B(1.5, -h - 0.1, 0.75, 1.7, 0.24, 0.12),
                     B(1.5, -h - 0.1, 1.85, 1.7, 0.24, 0.12)),
                part("Loaves", T("brass", 1), *[C(0.9 + 0.4 * k, -h - 0.16, 0.85, 0.1, 0.1, 8) for k in range(4)],
                     outline=False),
                part("SignArm", T("ink", 1), B(4.6, -h - 0.4, 2.6, 0.06, 0.8, 0.06)),
                part("LoafSign", T("brass", 1), C(4.6, -h - 0.75, 2.2, 0.25, 0.3, 8), outline=True)]
    if name == "apoth":
        return [part("BowWindow", F("teal", 0), B(w - 2.2, -h - 0.1, 1.2, 1.8, 0.2, 0.9)),
                part("Bottles", F("teal", 1), *[B(w - 3 + 0.35 * k, -h - 0.21, 1.1, 0.08, 0.02, 0.22) for k in range(5)],
                     outline=False),
                part("MortarArm", T("ink", 1), B(1.6, -h - 0.3, 2.7, 0.06, 0.6, 0.06)),
                part("Mortar", T("brass", 1), C(1.6, -h - 0.6, 2.25, 0.18, 0.26, 8, rt=0.24))]
    if name == "widow":
        return [part("Shutters", T("ink", 1), *[B(w + 0.05, -(j + 0.5) + sy * 0.38, 1.25, 0.04, 0.2, 0.7)
                                                for j in range(1, h, 2) for sy in (1, -1)], outline=False),
                part("Wreath", T("ink", 0), C(w + 0.08, -3.5, 1.55, 0.2, 0.06, 10), outline=True),
                part("Ivy", T("moss", 1), *[B(0.6 + 1.3 * k, -h - 0.03, 0.9, 0.7, 0.04, 1.5) for k in range(3)],
                     outline=False)]
    if name == "tavern":
        return [part("SignArm", T("ink", 1), B(1.5, -h - 0.4, 2.7, 0.06, 0.8, 0.06)),
                part("SignBoard", T("wood", 2), B(1.5, -h - 0.8, 2.25, 0.9, 0.06, 0.7)),
                part("SignLamp", F("lantern", 3), B(1.5, -h - 0.84, 2.25, 0.25, 0.02, 0.3), outline=False),
                part("Barrels", T("wood", 3), *[C(w + 0.35, -1.5 - 0.6 * k, 0, 0.26, 0.7, 10) for k in range(3)])]
    if name == "chapel":
        return [part("Tower", tex("granite", 1.0), B(1.2, -h / 2, (WALL + 3.4) / 2, 2.0, 2.4, WALL + 3.4)),
                part("TowerCap", T("slate", 1), (frustum, dict(z0=WALL + 3.4, z1=WALL + 4.4, bottom=(2.2, 2.6),
                                                                top=(0.1, 0.1), offset=(1.2, -h / 2)))),
                part("Belfry", F("ink", 0), B(1.2, -h / 2 - 1.22, WALL + 2.7, 0.6, 0.04, 0.8), outline=False),
                part("Lancets", F("lantern", 1), *[B(w + 0.02, -(j + 0.5), 1.5, 0.04, 0.3, 1.1)
                                                   for j in (1, 6)], outline=False)]
    if name == "netloft":
        return [part("Nets", T("fog", 0), *[B(i + 0.5, -h - 0.06, 1.6, 0.8, 0.04, 2.2) for i in range(1, w - 1)],
                     outline=False),
                part("Floats", T("brass", 1), *[C(i + 0.5, -h - 0.1, 1.0, 0.07, 0.07, 6) for i in range(1, w - 1)],
                     outline=False)]
    if name == "mollhut":
        return [part("Smoke", F("fog", 1), C(w / 2, -h / 2, WALL + 1.0, 0.18, 0.4, 8, rt=0.3), outline=False)]
    return []


# ---------------------------------------------------------------- sliced props (art plan 3.5)


def wake_table(w, h):
    legs = [B(x, y, 0.38, 0.1, 0.1, 0.76) for x in (0.3, w - 0.3) for y in (-0.3, -h + 0.3)]
    return [part("Top", T("wood", 3), B(w / 2, -h / 2, 0.76, w - 0.2, h - 0.5, 0.08)),
            part("Legs", T("wood", 2), *legs),
            part("Cloth", T("bone", 2), B(w / 2, -h / 2, 0.805, w - 1.0, 0.6, 0.01), outline=False)]


def hanging_oak(w, h):
    import kit_import as ki

    oak = ki.import_part(ki.kenney("nature-kit", "tree_oak_dark"), tag="kenney:nature-kit/tree_oak_dark",
                         colours={"leafsDark": "#26361F", "woodBarkDark": "#3A231F"})
    d = oak.dimensions
    k = 4.0 / d.z
    oak.scale = (k, k, k)
    oak.location = (w / 2, -h / 2, 0)
    return [oak, part("Rope", T("bone", 1), B(w / 2 + 0.6, -h / 2 - 0.4, 1.9, 0.03, 0.03, 1.2)),
            part("Noose", T("bone", 1), C(w / 2 + 0.6, -h / 2 - 0.4, 1.2, 0.08, 0.1, 8))]


def clamp(w, h):
    return [part("Mound", T("litter", 0), S(blob(w / 2, -h / 2, 0.9, 0.85, [(0.08, 5, 0.3)], n=18), 0, 0.9),
                 bevel=0.25),
            part("Holes", F("lantern", 1), *[B(w / 2 + 0.6 * math.cos(a), -h / 2 + 0.55 * math.sin(a), 0.55, 0.12,
                                               0.12, 0.08) for a in (0.5, 2.0, 3.6, 5.0)], outline=False),
            part("SmokeHole", F("ink", 0), C(w / 2, -h / 2, 0.86, 0.12, 0.06, 8), outline=False)]


def pump_beam(w, h):
    return [part("EngineHouse", tex("granite", 1.0), B(w / 2, -h / 2 - 0.3, 1.4, w - 0.3, 1.6, 2.8)),
            part("Beam", T("wood", 2), B(w / 2, -h / 2 + 0.2, 3.0, 0.3, h + 0.4, 0.3)),
            part("Rod", T("ink", 1), B(w / 2, -0.15, 1.6, 0.08, 0.08, 2.8)),
            part("Shaft", F("ink", 0), S(blob(w / 2, -0.4, 0.4, 0.3, [], n=12), 0, 0.02), outline=False),
            part("Broken", T("wood", 3), B(w / 2 + 0.4, -h + 0.4, 0.15, 0.9, 0.2, 0.2))]


SLICED_BUILDERS = {"wake_table": wake_table, "hanging_oak": hanging_oak, "clamp": clamp, "pump_beam": pump_beam}


# ---------------------------------------------------------------- render: beauty and tile map


def code_material(w: int, h: int) -> bpy.types.Material:
    """Emission (dx + 1, dy + 1, 0) / 255 of the footprint tile under each surface point, clamped."""
    mat = bpy.data.materials.new("TileCode")
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()
    geo = nodes.new("ShaderNodeNewGeometry")
    sep = nodes.new("ShaderNodeSeparateXYZ")
    links.new(geo.outputs["Position"], sep.inputs["Vector"])

    def channel(socket, sign, n):
        m = nodes.new("ShaderNodeMath")
        m.operation = "MULTIPLY"
        m.inputs[1].default_value = sign
        links.new(socket, m.inputs[0])
        fl = nodes.new("ShaderNodeMath")
        fl.operation = "FLOOR"
        links.new(m.outputs[0], fl.inputs[0])
        cl = nodes.new("ShaderNodeClamp")
        cl.inputs["Min"].default_value, cl.inputs["Max"].default_value = 0.0, n - 1
        links.new(fl.outputs[0], cl.inputs["Value"])
        add = nodes.new("ShaderNodeMath")
        add.operation = "MULTIPLY_ADD"
        add.inputs[1].default_value, add.inputs[2].default_value = 1 / 255, 1 / 255
        links.new(cl.outputs[0], add.inputs[0])
        return add.outputs[0]

    comb = nodes.new("ShaderNodeCombineXYZ")
    links.new(channel(sep.outputs["X"], 1.0, w), comb.inputs["X"])
    links.new(channel(sep.outputs["Y"], -1.0, h), comb.inputs["Y"])
    emit = nodes.new("ShaderNodeEmission")
    links.new(comb.outputs["Vector"], emit.inputs["Color"])
    out = nodes.new("ShaderNodeOutputMaterial")
    links.new(emit.outputs["Emission"], out.inputs["Surface"])
    return mat


def render_pair(scene, objs, w: int, h: int, out_dir: str, name: str) -> dict:
    cw, ch = (w + h) * 64 + 64, (w + h) * 32 + TOP + 32
    pivot = (cw / 2, TOP + (w + h) * 16)
    sc.iso_frame(scene, cw, ch, pivot, target=(w / 2, -h / 2, 0.0))
    render_to(scene, os.path.join(out_dir, f"{name}.png"))
    # The tile map: every slot coded, raw output, no anti-aliasing so no code is blended.
    saved = {}
    code = code_material(w, h)
    for o in scene.objects:
        if o.type == "MESH":
            saved[o.name] = [s.material for s in o.material_slots]
            for s in o.material_slots:
                s.material = code
    vt, fs, taa = scene.view_settings.view_transform, scene.render.filter_size, scene.eevee.taa_render_samples
    scene.view_settings.view_transform, scene.render.filter_size, scene.eevee.taa_render_samples = "Raw", 0.0, 1
    render_to(scene, os.path.join(out_dir, f"{name}.tiles.png"))
    scene.view_settings.view_transform, scene.render.filter_size, scene.eevee.taa_render_samples = vt, fs, taa
    for o in scene.objects:
        if o.name in saved:
            for s, m in zip(o.material_slots, saved[o.name]):
                s.material = m
    bpy.data.materials.remove(code)
    return {"file": f"{name}.png", "tiles": f"{name}.tiles.png", "cell": [cw, ch], "pivot": list(pivot),
            "footprint": [w, h]}


def build_one(scene, objs, w, h, out_dir, name, frames):
    root = sc.env_root(f"Root_{name}")
    for o in objs:
        if o.parent is None:
            o.parent = root
    frames[name] = render_pair(scene, objs, w, h, out_dir, name)
    sc.clear(objs + [root])


def write_manifest(out_dir: str, atlas: str, frames: dict) -> None:
    path = os.path.join(out_dir, "manifest.json")
    if os.path.exists(path):  # a partial run keeps the other entries
        with open(path) as fh:
            frames = {**json.load(fh)["frames"], **frames}
    with open(path, "w") as fh:
        json.dump({"version": 1, "atlas": atlas, "frames": frames}, fh, indent=2, sort_keys=True)
        fh.write("\n")
    print(f"{atlas}: {len(frames)} -> {out_dir}")


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser(prog="build_buildings.py")
    p.add_argument("--out", required=True)
    p.add_argument("--maps", default=",".join(RECIPES))
    p.add_argument("--only", default="", help="comma list of art ids or sliced prop frames")
    a = p.parse_args(argv)
    only = set(a.only.split(",")) - {""}
    scene = sc.setup()
    for map_id in a.maps.split(","):
        out_dir = os.path.join(a.out, f"bld_{map_id}")
        os.makedirs(out_dir, exist_ok=True)
        frames = {}
        for art, rec in RECIPES[map_id].items():
            if only and art not in only:
                continue
            x0, y0, w, h = footprint_of(rec)
            doors = [(dx - x0, dy - y0, f) for dx, dy, f in rec["doors"]]
            objs, rise = shell(rec, w, h, doors)
            objs += details(rec["details"], w, h, rise)
            build_one(scene, objs, w, h, out_dir, art, frames)
        write_manifest(out_dir, f"bld_{map_id}", frames)
        out_dir = os.path.join(a.out, f"props_{map_id}_sliced")
        os.makedirs(out_dir, exist_ok=True)
        frames = {}
        for frame, (w, h, builder) in SLICED_PROPS.get(map_id, {}).items():
            if only and frame not in only:
                continue
            build_one(scene, SLICED_BUILDERS[builder](w, h), w, h, out_dir, frame, frames)
        write_manifest(out_dir, f"props_{map_id}", frames)


if __name__ == "__main__":
    main()
