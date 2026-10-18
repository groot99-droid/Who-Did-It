"""Render the isometric ground cells of both themes (docs/SPRITES.md 10.12, art plan 3.2).

    python tools/blender/build_ground.py -- --out build/render [--kits assets/external/kits] [--themes harbour]
    # -> build/render/ground/<theme>/<material>_<v>.png, 128 x 64 display px, v = 0..3
    pnpm --filter @wdi/sprites tileset ../../build/render/ground ../../apps/client/public/assets/ground

Each cell is one metre of ground under IsoCam at the display scale (90.51 px per metre, the tile's diamond
fills the 128 x 64 frame), from a Poly Haven texture (env/kits.py) and a seeded scatter of pebbles,
leaves, puddles or tufts kept inside the diamond. The four variants turn and shift the texture; within
0.03 m of the tile's edge every variant blends back to one shared mapping, and the scatter stays a margin
inside, so every variant tiles with every other. `tools/sprites/tileset.ts` masks the diamond, applies the
pixel finish, draws the edge overlays and joins the cells into the 1280 x 1792 tileset.
"""

from __future__ import annotations

import argparse
import math
import os
import random
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rig_common as rc  # noqa: E402
from build_rig import _socket  # noqa: E402
import static_common as sc  # noqa: E402
from batch_render import render_to  # noqa: E402
from env.kits import GROUND_TEXTURES, texture_path  # noqa: E402
from static_common import blob, box, hex_flat, hex_toon, mesh, slab, stroke  # noqa: E402

VARIANTS = 4
CELL_W, CELL_H = 128, 64
GROUND_ROWS = "glmpdcfwrs~u=O"  # packages/content/src/schemas/scene.ts
NAMES = {
    "g": "grass", "l": "litter", "m": "moss", "p": "path", "d": "earth", "c": "cobble", "f": "flags",
    "w": "planks", "r": "rock", "s": "shingle", "~": "shallows", "u": "brush", "=": "rails", "O": "water",
}

# Per material: texture metres per repeat and the gain on the result.
LOOK = {
    "g": (2.0, 1.0), "l": (1.5, 1.0), "m": (2.0, 1.0), "p": (2.0, 1.0), "d": (2.0, 1.0), "c": (1.5, 1.0),
    "f": (2.0, 1.0), "w": (2.0, 1.0), "r": (2.0, 1.0), "s": (1.5, 1.0), "~": (1.5, 1.0), "u": (2.0, 1.0),
    "=": (1.5, 1.0), "O": (1.0, 1.0),
}

# Per theme and material: how far the photo is pulled towards a world-palette colour (0 = the photo,
# 1 = flat colour), and that colour. Snapped to the palette at 64 x 32, a busy photo turns to salt and
# pepper, so most grounds keep only the photo's larger shapes over the colour the art plan names (3.2).
# Deep water `O` has no photo: it is its colour.
FLAT = {
    "harbour": {
        "g": (0.8, "#3A5A33"), "l": (0.5, "#5C4A2A"), "m": (0.45, "#3A5A33"), "p": (0.45, "#55332A"),
        "d": (0.45, "#3A2F1E"), "c": (0.2, "#5E6C84"), "f": (0.4, "#5E6C84"), "w": (0.3, "#744733"),
        "r": (0.45, "#3A4356"), "s": (0.6, "#4D5A70"), "~": (0.75, "#466784"), "u": (0.5, "#3A5A33"),
        "=": (0.5, "#453E3F"), "O": (1.0, "#1C504D"),
    },
    "timber": {
        "g": (0.7, "#4F8A4A"), "l": (0.5, "#744733"), "m": (0.45, "#4D5A70"), "p": (0.45, "#55332A"),
        "d": (0.5, "#24171A"), "c": (0.3, "#5E5553"), "f": (0.4, "#3A4356"), "w": (0.3, "#94603F"),
        "r": (0.45, "#453E3F"), "s": (0.5, "#5E5553"), "~": (0.55, "#55332A"), "u": (0.5, "#26361F"),
        "=": (0.5, "#55332A"), "O": (1.0, "#24374F"),
    },
}

# Scatter colours per theme (palette.json `world` ramps): (light, mid, shadow).
TONES = {
    "harbour": {
        "leaf": ("#B57F54", "#94603F", "#55332A"), "leaf2": ("#DE9767", "#AA5A39", "#6A3426"),
        "green": ("#4F8A4A", "#3A5A33", "#26361F"), "stone": ("#B2AA99", "#7A7067", "#453E3F"),
        "puddle": "#466784", "fleck": "#D9D2C2", "glint": "#93C2E0", "crack": "#2E2A2D",
        "ripple": "#2EC4B6", "ripple2": "#466784",
    },
    "timber": {
        "leaf": ("#B57F54", "#744733", "#3A231F"), "leaf2": ("#94603F", "#55332A", "#24171A"),
        "green": ("#3A5A33", "#26361F", "#1B261B"), "stone": ("#9A9083", "#5E5553", "#2E2A2D"),
        "puddle": "#3A4356", "fleck": "#C8744A", "glint": "#6A8EAD", "crack": "#24171A",
        "ripple": "#466784", "ripple2": "#3A4356",
    },
}


# ---------------------------------------------------------------- the ground material


def _node(nodes, kind, **inputs):
    n = nodes.new(kind)
    for k, v in inputs.items():
        setattr(n, k, v)
    return n


def ground_material(name: str, image: str | None, metres: float, gain: float, flatten: float, base_hex: str,
                    variant: int) -> bpy.types.Material:
    """Unlit ground: the texture under variant v's turn and shift, blended to variant 0 near the edges,
    pulled `flatten` of the way to `base_hex`."""
    mat = bpy.data.materials.new(name)
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    emit = nodes.new("ShaderNodeEmission")
    links.new(emit.outputs["Emission"], out.inputs["Surface"])
    if image is None:
        emit.inputs["Color"].default_value = rc.hex_to_linear(base_hex)
        return mat

    geo = nodes.new("ShaderNodeNewGeometry")
    sep = nodes.new("ShaderNodeSeparateXYZ")
    links.new(geo.outputs["Position"], sep.inputs["Vector"])
    img = bpy.data.images.load(os.path.abspath(image), check_existing=True)

    def sample(turns: int, shift: tuple[float, float]):
        rot = nodes.new("ShaderNodeVectorRotate")
        rot.rotation_type = "Z_AXIS"
        rot.inputs["Angle"].default_value = turns * math.pi / 2
        links.new(geo.outputs["Position"], rot.inputs["Vector"])
        m = nodes.new("ShaderNodeMapping")
        m.inputs["Location"].default_value = (shift[0], shift[1], 0.0)
        m.inputs["Scale"].default_value = (1 / metres, 1 / metres, 1.0)
        links.new(rot.outputs["Vector"], m.inputs["Vector"])
        tex = nodes.new("ShaderNodeTexImage")
        tex.image, tex.interpolation, tex.extension = img, "Cubic", "REPEAT"
        links.new(m.outputs["Vector"], tex.inputs["Vector"])
        return tex.outputs["Color"]

    rnd = random.Random(f"ground-shift:{name}")
    own = sample(variant, (rnd.random(), rnd.random()) if variant else (0.0, 0.0))
    shared = sample(0, (0.0, 0.0))
    # edge = 1 at the tile's edge, 0 inside |x|, |y| < 0.44: the shared mapping wins at every border.
    absx = _node(nodes, "ShaderNodeMath", operation="ABSOLUTE")
    absy = _node(nodes, "ShaderNodeMath", operation="ABSOLUTE")
    links.new(sep.outputs["X"], absx.inputs[0])
    links.new(sep.outputs["Y"], absy.inputs[0])
    edge = _node(nodes, "ShaderNodeMath", operation="MAXIMUM")
    links.new(absx.outputs[0], edge.inputs[0])
    links.new(absy.outputs[0], edge.inputs[1])
    ramp = _node(nodes, "ShaderNodeMapRange", interpolation_type="SMOOTHSTEP")
    ramp.inputs["From Min"].default_value, ramp.inputs["From Max"].default_value = 0.44, 0.47
    links.new(edge.outputs[0], ramp.inputs["Value"])
    mix = nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    links.new(ramp.outputs["Result"], _socket(mix.inputs, "Factor_Float"))
    links.new(own, _socket(mix.inputs, "A_Color"))
    links.new(shared, _socket(mix.inputs, "B_Color"))
    colour = _socket(mix.outputs, "Result_Color")
    if flatten:
        flat = nodes.new("ShaderNodeMix")
        flat.data_type = "RGBA"
        _socket(flat.inputs, "Factor_Float").default_value = flatten
        links.new(colour, _socket(flat.inputs, "A_Color"))
        _socket(flat.inputs, "B_Color").default_value = rc.hex_to_linear(base_hex)
        colour = _socket(flat.outputs, "Result_Color")
    links.new(colour, emit.inputs["Color"])
    emit.inputs["Strength"].default_value = gain
    return mat


# ---------------------------------------------------------------- scatter (inside the diamond)


def inside(rnd, margin):
    return rnd.uniform(-0.5 + margin, 0.5 - margin), rnd.uniform(-0.5 + margin, 0.5 - margin)


def pebbles(rnd, n, r0, r1, z=0.02):
    out = []
    for _ in range(n):
        cx, cy = inside(rnd, 0.12)
        r = rnd.uniform(r0, r1)
        out.append((slab, dict(points=blob(cx, cy, r, r * 0.8, [(0.15, 3, rnd.random() * 6)], n=8), z1=z)))
    return out


def strokes(rnd, n, length, width, z=0.006, taper=0.5):
    out = []
    for _ in range(n):
        cx, cy = inside(rnd, 0.12)
        out.append((slab, dict(points=stroke(cx, cy, length * rnd.uniform(0.7, 1.3), width, rnd.uniform(0, math.pi),
                                             taper=taper), z1=z)))
    return out


def dots(rnd, n, r=0.018):
    out = []
    for _ in range(n):
        cx, cy = inside(rnd, 0.1)
        out.append((slab, dict(points=blob(cx, cy, r, r, [], n=6), z1=0.002)))
    return out


def scatter(char: str, theme: str, v: int):
    """The variant's seeded scatter objects for one material."""
    rnd = random.Random(f"{theme}:{char}:{v}")
    t = TONES[theme]
    objs = []

    def toon(key, shapes, outline=False):
        light, mid, shadow = t[key]
        objs.append(mesh(f"S_{key}", hex_toon(f"Ground_{theme}_{key}", light, mid, shadow), shapes, outline=outline))

    def flat(key, shapes):
        objs.append(mesh(f"F_{key}", hex_flat(f"GroundFlat_{theme}_{key}", t[key]), shapes, outline=False))

    if char == "g":
        toon("green", strokes(rnd, 6 + v, 0.09, 0.03, taper=0.3))
    elif char == "l":
        toon("leaf", strokes(rnd, 5, 0.08, 0.05, taper=0.6))
        toon("leaf2", strokes(rnd, 4, 0.07, 0.045, taper=0.6))
    elif char == "p":
        if v % 2 == 0:
            flat("puddle", [(slab, dict(points=blob(*inside(rnd, 0.22), 0.12, 0.07, [(0.2, 3, rnd.random() * 6)], n=14),
                                        z1=0.002))])
        toon("stone", pebbles(rnd, 3, 0.025, 0.04))
    elif char == "d":
        toon("stone", pebbles(rnd, 2, 0.02, 0.03))
    elif char == "f":
        flat("crack", strokes(rnd, 1 + v % 2, 0.2, 0.012, z=0.002, taper=0.2))
    elif char == "r":
        if v in (1, 3):
            flat("puddle", [(slab, dict(points=blob(*inside(rnd, 0.22), 0.11, 0.08, [(0.2, 3, rnd.random() * 6)], n=14),
                                        z1=0.002))])
        flat("fleck", dots(rnd, 3 + v, 0.016))
    elif char == "s":
        toon("green", strokes(rnd, 2, 0.1, 0.025, taper=0.3))
    elif char == "~":
        flat("glint", dots(rnd, 4, 0.02))
    elif char == "u":
        toon("green", strokes(rnd, 10, 0.12, 0.05, z=0.03, taper=0.2))
        toon("leaf", strokes(rnd, 4, 0.1, 0.04, z=0.02, taper=0.2))
    elif char == "O":
        flat("ripple", strokes(rnd, 2, 0.14, 0.012, z=0.002, taper=0.2))
        flat("ripple2", strokes(rnd, 2, 0.12, 0.012, z=0.002, taper=0.2))
    elif char == "=":
        objs.extend(rails(theme, along_y=v >= 2, rnd=rnd))
    return objs


def rails(theme: str, along_y: bool, rnd) -> list:
    """Two iron rails on sleepers, periodic over one metre so a track runs on across tiles.

    Cells 0-1 run along world x (Blender x), 2-3 along world y (Blender y); SPRITES 10.12's rail rule.
    """
    wood = ("#744733", "#55332A", "#3A231F") if theme == "harbour" else ("#94603F", "#744733", "#55332A")
    iron = ("#7A7067", "#453E3F", "#2E2A2D") if theme == "harbour" else ("#AA5A39", "#6A3426", "#4E2620")
    sleepers, bars = [], []
    for k in range(3):
        u = -0.5 + (k + 0.5) / 3 + rnd.uniform(-0.02, 0.02)
        size = (0.12, 0.62, 0.03)
        sleepers.append((box, dict(center=(u, 0.0, 0.015), size=size)))
    for g in (-0.2, 0.2):
        bars.append((box, dict(center=(0.0, g, 0.045), size=(1.0, 0.035, 0.03))))
    objs = [mesh("Sleepers", hex_toon(f"Rail_{theme}_wood", *wood), sleepers, outline=False),
            mesh("Bars", hex_toon(f"Rail_{theme}_iron", *iron), bars, outline=False)]
    if along_y:
        for o in objs:
            o.rotation_euler.z = math.pi / 2
    return objs


# ---------------------------------------------------------------- main


def render_theme(scene, theme: str, kits: str, out: str, only: str = GROUND_ROWS) -> None:
    os.makedirs(out, exist_ok=True)
    for char in only:
        metres, gain = LOOK[char]
        flatten, base_hex = FLAT[theme][char]
        tid = GROUND_TEXTURES[theme][char]
        image = texture_path(kits, tid) if tid else None
        for v in range(VARIANTS):
            mat = ground_material(f"Ground_{theme}_{NAMES[char]}_{v}", image, metres, gain, flatten, base_hex, v)
            plane = mesh("Ground", mat, [(box, dict(center=(0, 0, -0.01), size=(4.0, 4.0, 0.02)))], outline=False)
            objs = [plane] + scatter(char, theme, v)
            render_to(scene, os.path.join(out, f"{NAMES[char]}_{v}.png"))
            sc.clear(objs)
            bpy.data.materials.remove(mat)
    print(f"ground: {theme}, {len(only)} materials x {VARIANTS} -> {out}")


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser(prog="build_ground.py")
    p.add_argument("--out", required=True)
    p.add_argument("--kits", default="assets/external/kits")
    p.add_argument("--themes", default="harbour,timber")
    p.add_argument("--only", default=GROUND_ROWS, help="material chars to render (default all)")
    a = p.parse_args(argv)
    scene = sc.setup()
    sc.iso_frame(scene, CELL_W, CELL_H, (CELL_W / 2, CELL_H / 2))
    scene.render.film_transparent = False
    for theme in a.themes.split(","):
        render_theme(scene, theme, a.kits, os.path.join(a.out, "ground", theme), a.only)


if __name__ == "__main__":
    main()
