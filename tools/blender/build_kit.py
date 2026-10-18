"""Render the isometric kits `iso_kit_harbour` and `iso_kit_timber` (docs/SPRITES.md 10.12-10.13, art plan 3.3).

    python tools/blender/build_kit.py -- --out build/render [--themes harbour] [--only wall,tree]
    # -> build/render/iso_kit_<theme>/<kind>_<height>_<v>.png + manifest.json (display px)
    pnpm --filter @wdi/sprites pixel ../../build/render/iso_kit_harbour ../../build/finished/iso_kit_harbour
    pnpm --filter @wdi/sprites pack:static ../../build/finished/iso_kit_harbour ../../apps/client/public/assets/kit

44 frames per theme, `<wall|cliff|tree|boulder|fence|stack>/<full|half|stub>/<0-3>`: one tile each, rendered by
IsoCam at the display scale into twice the art cell, the pivot at the ground point under the tile centre,
(cell width / 2, cell height - 16) art px. Environment heights sit under the 0.75 root (SPRITES 10.3). The
exporter picks the variant by (x * 7 + y * 13) mod 4, so the four variants of a frame share their silhouette
and texture mapping and differ only in details: neighbouring wall and cliff blocks meet without a seam.

Walls and cliffs are modelled from code with the Poly Haven textures of env/kits.py; trees, stumps, boulders,
the hedge, the split rails and the stacks are Kenney CC0 meshes (kit_import.py) with a few code-made parts
(lobster pots, peat, ore sacks, the mine prop).
"""

from __future__ import annotations

import argparse
import math
import os
import random
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit_import as ki  # noqa: E402
import static_common as sc  # noqa: E402
from env.kits import SURFACE_TEXTURES, texture_path  # noqa: E402
from static_common import blob, box, cylinder, hex_flat, hex_toon, mesh, slab, stroke  # noqa: E402

KITS = ki.KITS
VARIANTS = 4

# Art cell (packed px) of each frame family (art plan 3.3).
CELLS = {
    ("wall", "full"): (64, 112), ("wall", "half"): (64, 72), ("wall", "stub"): (64, 48),
    ("cliff", "full"): (64, 112), ("cliff", "half"): (64, 72), ("cliff", "stub"): (64, 48),
    ("tree", "full"): (96, 144), ("tree", "stub"): (64, 48),
    ("boulder", "full"): (64, 64), ("fence", "full"): (64, 56), ("stack", "full"): (64, 80),
}
HEIGHTS = {"wall": {"full": 2.5, "half": 1.2, "stub": 0.3}, "cliff": {"full": 2.5, "half": 1.2, "stub": 0.4}}
TREE_HEIGHT_M = 3.4  # before the 0.75 root: about 2.6 m drawn, crown inside the 96 x 144 cell

# World-palette ramps used here (palette.json `world`), dark to light.
WOOD = ["#24171A", "#3A231F", "#55332A", "#744733", "#94603F", "#B57F54"]
STONE = ["#2E2A2D", "#453E3F", "#5E5553", "#7A7067", "#9A9083", "#B2AA99"]
SLATE = ["#2C3240", "#3A4356", "#4D5A70", "#5E6C84"]
MOSS = ["#1B261B", "#26361F", "#3A5A33", "#4F8A4A"]
BRICK = ["#4E2620", "#6A3426", "#8A4630", "#AA5A39", "#C8744A"]
LITTER = ["#3A2F1E", "#5C4A2A", "#80683A"]


def bands(ramp: list[str], mid: int) -> tuple[str, str, str]:
    return ramp[min(mid + 1, len(ramp) - 1)], ramp[mid], ramp[max(mid - 1, 0)]


def toon(name, ramp, mid):
    return hex_toon(f"Kit_{name}", *bands(ramp, mid))


def tex(name: str, metres: float = 1.0, gains=(1.1, 0.8, 0.55)):
    return sc.tex_toon(f"KitTex_{name}", texture_path(KITS, SURFACE_TEXTURES[name]), metres=metres, gains=gains)


def kenney(pack, model, **kw):
    return ki.import_part(ki.kenney(pack, model), tag=f"kenney:{pack}/{model}", **kw)


def fit(obj, height: float | None = None, width: float | None = None):
    """Scale an imported part uniformly to a height (or a footprint width), centred on the origin, on z = 0."""
    d = obj.dimensions
    k = height / d.z if height else width / max(d.x, d.y)
    obj.scale = (k, k, k)
    bpy.context.view_layer.update()
    from mathutils import Vector

    bb = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    cx = (min(p.x for p in bb) + max(p.x for p in bb)) / 2
    cy = (min(p.y for p in bb) + max(p.y for p in bb)) / 2
    obj.location = (obj.location.x - cx, obj.location.y - cy, obj.location.z - min(p.z for p in bb))
    return obj


def fit_box(obj, size, z: float = 0.0):
    """Scale an imported part to exactly `size` (x, y, z metres), centred on the origin, its base at `z`."""
    from mathutils import Vector

    d = obj.dimensions
    obj.scale = (size[0] / d.x, size[1] / d.y, size[2] / d.z)
    bpy.context.view_layer.update()
    bb = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    obj.location.x -= (min(p.x for p in bb) + max(p.x for p in bb)) / 2
    obj.location.y -= (min(p.y for p in bb) + max(p.y for p in bb)) / 2
    obj.location.z += z - min(p.z for p in bb)
    return obj


def under(root, *objs):
    for o in objs:
        o.parent = root
    return list(objs)


# ---------------------------------------------------------------- walls


def wall(theme: str, height: str, v: int, root) -> list:
    h = HEIGHTS["wall"][height]
    rnd = random.Random(f"wall:{theme}:{height}:{v}")
    objs = []
    if theme == "harbour":
        body = mesh("Wall", tex("plaster", 1.0, (1.05, 0.8, 0.55)), [(box, dict(center=(0, 0, h / 2), size=(1, 1, h)))],
                    outline=False)
        top = mesh("WallTop", tex("brick", 0.5), [(box, dict(center=(0, 0, h - 0.02), size=(1.002, 1.002, 0.04)))],
                   outline=False)
        skirt = mesh("Skirt", toon("skirt", WOOD, 1), [(box, dict(center=(0, 0, 0.12), size=(1.02, 1.02, 0.24)))],
                     outline=False)
        objs += [body, top, skirt]
        if v == 1 and h > 0.5:  # a chipped patch of plaster showing brick, on the south face
            objs.append(mesh("Chip", tex("brick", 0.5), [(box, dict(center=(rnd.uniform(-0.15, 0.15), -0.505,
                                                                            min(h - 0.35, 0.9)), size=(0.38, 0.02, 0.3)))],
                             outline=False))
        if v == 2 and h > 0.5:  # a pipe run with a bracket, on the east face
            objs.append(mesh("Pipe", toon("pipe", STONE, 1), [
                (cylinder, dict(center=(0.53, 0.18, 0.0), radius=0.035, depth=h, segments=6)),
                (box, dict(center=(0.52, 0.18, h * 0.6), size=(0.06, 0.1, 0.05))),
            ], outline=False))
        if v == 3 and h > 0.5:  # a damp stain and a crack
            objs.append(mesh("Damp", toon("damp", STONE, 3), [
                (box, dict(center=(0.15, -0.503, 0.5), size=(0.34, 0.01, 0.55))),
                (box, dict(center=(0.15, -0.503, 0.85), size=(0.2, 0.01, 0.2)))], outline=False))
            objs.append(mesh("Crack", hex_flat("Kit_crack", "#12141C"), [
                (box, dict(center=(0.503, -0.1 + 0.08 * k, 0.6 + 0.12 * k), size=(0.01, 0.07, 0.02)))
                for k in range(5)], outline=False))
    else:
        logs = []
        n = max(1, round(h / 0.3))
        for k in range(n):
            z = (k + 0.5) * h / n
            logs.append((cylinder, dict(center=(-0.5, 0, z - h / n / 2), radius=h / n / 2, depth=1.0, segments=8)))
        body = mesh("Logs", tex("logs", 1.0, (1.1, 0.85, 0.55)), [(box, dict(center=(0, 0, h / 2), size=(0.96, 0.96, h)))],
                    outline=False)
        objs.append(body)
        chink = toon("chink", ["#5E5553", "#8E8676", "#B2AA99"], 1)
        for k in range(1, n):
            z = k * h / n
            objs.append(mesh(f"Chink{k}", chink, [(box, dict(center=(0, 0, z), size=(0.98, 0.98, 0.025)))], outline=False))
        objs.append(mesh("LogTop", toon("logtop", WOOD, 3), [(box, dict(center=(0, 0, h - 0.01), size=(1.0, 1.0, 0.03)))],
                         outline=False))
        if v == 1 and h > 0.5:  # axe marks and a knot
            objs.append(mesh("Knot", toon("knot", WOOD, 1), [(cylinder, dict(center=(0.1, -0.5, 0.0), radius=0.06,
                                                                            depth=0.02, segments=8))], outline=False))
            objs[-1].rotation_euler.x = math.pi / 2
            objs[-1].location.z = 0.7
        if v == 2 and h > 0.5:  # wooden pegs
            objs.append(mesh("Pegs", toon("peg", WOOD, 2), [
                (box, dict(center=(0.52, -0.25 + 0.25 * k, 0.9 + 0.1 * (k % 2)), size=(0.06, 0.04, 0.04)))
                for k in range(3)], outline=False))
        if v == 3 and h > 0.5:  # a tar-paper patch
            objs.append(mesh("Tar", hex_flat("Kit_tar", "#1A1D29"), [
                (box, dict(center=(-0.05, -0.495, 0.75), size=(0.42, 0.02, 0.4)))], outline=False))
    return under(root, *objs)


# ---------------------------------------------------------------- cliffs


def cliff(theme: str, height: str, v: int, root) -> list:
    h = HEIGHTS["cliff"][height]
    rnd = random.Random(f"cliff:{theme}:{height}:{v}")
    surf = "granite"
    objs = [mesh("Cliff", tex(surf, 1.0, (1.1, 0.8, 0.5)), [(box, dict(center=(0, 0, h / 2), size=(1, 1, h)))],
                 outline=False)]
    if theme == "harbour":
        moss = toon("moss", MOSS, 1)
        seams = [(box, dict(center=(rnd.uniform(-0.35, 0.35), -0.505, rnd.uniform(0.1, h - 0.1)),
                            size=(rnd.uniform(0.15, 0.35), 0.02, 0.05))) for _ in range(2 + v)]
        seams += [(box, dict(center=(0.505, rnd.uniform(-0.35, 0.35), rnd.uniform(0.1, h - 0.1)),
                             size=(0.02, rnd.uniform(0.15, 0.35), 0.05))) for _ in range(1 + v % 2)]
        seams.append((box, dict(center=(rnd.uniform(-0.2, 0.2), rnd.uniform(-0.2, 0.2), h + 0.005),
                                size=(rnd.uniform(0.15, 0.3), rnd.uniform(0.15, 0.3), 0.02))))
        objs.append(mesh("Moss", moss, seams, outline=False))
        objs.append(mesh("Quartz", hex_flat("Kit_quartz", "#D9D2C2"), [
            (box, dict(center=(rnd.uniform(-0.4, 0.4), -0.506, rnd.uniform(0.1, h - 0.1)), size=(0.03, 0.01, 0.03)))
            for _ in range(3 + v)], outline=False))
    else:
        objs.append(mesh("Rust", hex_flat("Kit_rust", "#6A3426"), [
            (box, dict(center=(rnd.uniform(-0.4, 0.4), -0.506, h / 2), size=(0.03, 0.01, h * rnd.uniform(0.3, 0.6))))
            for _ in range(2 + v % 2)], outline=False))
        if v == 3 and h > 0.5:  # a timber prop for the mine: two posts and a cap
            post = toon("post", WOOD, 3)
            objs.append(mesh("Prop", post, [
                (box, dict(center=(-0.3, -0.56, h * 0.45), size=(0.12, 0.12, h * 0.9))),
                (box, dict(center=(0.3, -0.56, h * 0.45), size=(0.12, 0.12, h * 0.9))),
                (box, dict(center=(0.0, -0.56, h * 0.9 + 0.06), size=(0.8, 0.14, 0.12))),
            ], outline=True))
    return under(root, *objs)


# ---------------------------------------------------------------- trees, stumps, boulders


TREES = {
    "harbour": [("nature-kit", "tree_oak", {"leafsGreen": "#3A5A33", "woodBark": "#55332A"}),
                ("nature-kit", "tree_oak", {"leafsGreen": "#4F8A4A", "woodBark": "#3A231F"}),
                ("nature-kit", "tree_detailed", {"leafsGreen": "#26361F", "woodBark": "#55332A", "_defaultMat": "#55332A"}),
                ("nature-kit", "tree_thin", {"leafsGreen": "#80683A", "woodBark": "#B2AA99"})],
    "timber": [("nature-kit", "tree_pineTallA", {"leafsDark": "#26361F", "woodBarkDark": "#3A231F"}),
               ("nature-kit", "tree_pineTallB", {"leafsDark": "#1B261B", "woodBarkDark": "#3A231F"}),
               ("nature-kit", "tree_pineTallC", {"leafsDark": "#26361F", "woodBarkDark": "#55332A"}),
               ("nature-kit", "tree_pineRoundA", {"leafsDark": "#5C4A2A", "woodBarkDark": "#55332A"})],
}
STUMPS = {
    "harbour": ["stump_old", "stump_roundDetailed", "stump_round", "stump_oldTall"],
    "timber": ["stump_squareDetailed", "stump_round", "stump_squareDetailedWide", "stump_old"],
}
BOULDERS = {
    "harbour": [("nature-kit", "rock_tallA", 0.9), ("nature-kit", "rock_tallC", 0.85),
                ("graveyard-kit", "gravestone-bevel", 0.75), ("graveyard-kit", "gravestone-broken", 0.65)],
    "timber": [("nature-kit", "rock_tallB", 0.85), ("nature-kit", "rock_tallD", 0.85),
               ("nature-kit", "rock_tallE", 0.8), ("nature-kit", "rock_tallF", 0.75)],
}
ROCK = {"harbour": {"dirt": "#5E5553", "grass": "#3A5A33", "_defaultMat": "#453E3F"},
        "timber": {"dirt": "#7A7067", "grass": "#5E5553", "_defaultMat": "#5E5553"}}


def tree(theme: str, height: str, v: int, root) -> list:
    if height == "stub":
        o = fit(kenney("nature-kit", STUMPS[theme][v], colours={"woodBark": WOOD[2], "woodInner": WOOD[4],
                                                                "woodBarkDark": WOOD[1]}), width=0.6)
        return under(root, o)
    pack, model, colours = TREES[theme][v]
    o = fit(kenney(pack, model, colours=colours), height=TREE_HEIGHT_M)
    o.rotation_euler.z = math.radians(25 * v)
    return under(root, o)


def boulder(theme: str, height: str, v: int, root) -> list:
    pack, model, size = BOULDERS[theme][v]
    stone = ["#5E5553", "#7A7067", "#9A9083"] if theme == "harbour" else STONE[1:5]
    o = kenney(pack, model, colours=ROCK[theme], ramp=stone if pack == "graveyard-kit" else None)
    if pack == "graveyard-kit":
        fit(o, height=size * 1.4)
    else:
        fit(o, width=size)
    o.rotation_euler.z = math.radians(-30 + 20 * v)
    if theme == "timber" and v == 3:  # one split boulder: two halves apart
        twin = o.copy()
        twin.data = o.data.copy()
        bpy.context.scene.collection.objects.link(twin)
        o.location.x -= 0.13
        twin.location.x += 0.13
        twin.rotation_euler.z += 0.3
        return under(root, o, twin)
    return under(root, o)


# ---------------------------------------------------------------- fences and stacks


def fence(theme: str, height: str, v: int, root) -> list:
    rnd = random.Random(f"fence:{theme}:{v}")
    if theme == "harbour":
        # A low drystone wall over the whole tile, topped with hawthorn: a hedge and a field wall in any direction.
        wall_h = 0.55
        stones = mesh("Dry", tex("granite", 0.5, (1.05, 0.8, 0.55)),
                      [(box, dict(center=(0, 0, wall_h / 2), size=(0.92, 0.92, wall_h)))], outline=False)
        cap = mesh("Cap", toon("drycap", STONE, 2), [
            (box, dict(center=(rnd.uniform(-0.3, 0.3), rnd.uniform(-0.3, 0.3), wall_h), size=(0.25, 0.18, 0.08)))
            for _ in range(4)], outline=False)
        lumps = [(slab, dict(points=blob(rnd.uniform(-0.2, 0.2), rnd.uniform(-0.2, 0.2), 0.32, 0.32,
                                          [(0.12, 5, rnd.random() * 6)], n=14),
                             z0=wall_h, z1=wall_h + rnd.uniform(0.3, 0.42))) for _ in range(2)]
        lumps.append((box, dict(center=(0, 0, wall_h + 0.17), size=(0.86, 0.86, 0.34))))
        hedge = mesh("Hedge", toon("hedge", MOSS, 2), lumps, outline=True, bevel=0.08)
        berries = mesh("Haws", hex_flat("Kit_haws", "#7E1119"), [
            (box, dict(center=(rnd.uniform(-0.35, 0.35), rnd.uniform(-0.35, 0.35), wall_h + rnd.uniform(0.3, 0.45)),
                       size=(0.04, 0.04, 0.04))) for _ in range(3 + v)], outline=False)
        return under(root, stones, cap, hedge, berries)
    # A zig-zag split-rail ("worm") fence: two stacks of rails along the tile's diagonals, so a run of
    # tiles in any direction reads as one zig-zag.
    rail = toon("rail", WOOD, 3 if v % 2 else 2)
    shapes = []
    for k in range(3):
        z = 0.12 + 0.22 * k + 0.02 * rnd.random()
        for sign, a in ((1, math.pi / 4), (-1, -math.pi / 4)):
            shapes.append((slab, dict(points=stroke(0.0, 0.0, 1.38, 0.07, a, taper=0.9), z0=z + 0.05 * (sign > 0),
                                      z1=z + 0.07 + 0.05 * (sign > 0))))
    rails = mesh("Rails", rail, shapes, outline=True)
    post = mesh("Post", toon("railpost", WOOD, 1), [(box, dict(center=(0, 0, 0.42), size=(0.08, 0.08, 0.84)))],
                outline=True)
    return under(root, rails, post)


def lobster_pot(rnd):
    frame = toon("pot", WOOD, 2)
    net = toon("net", ["#5E5553", "#7A7067", "#9A9083"], 1)
    base = mesh("PotBase", frame, [(box, dict(center=(0, 0, 0.04), size=(0.62, 0.46, 0.08)))], outline=True)
    dome = mesh("PotDome", net, [(cylinder, dict(center=(0, 0, 0.08), radius=0.26, depth=0.36, segments=10,
                                                 radius_top=0.15))], outline=True)
    return [base, dome]


def stack(theme: str, height: str, v: int, root) -> list:
    rnd = random.Random(f"stack:{theme}:{v}")
    crate_ramp, objs = WOOD[1:5], []
    if theme == "harbour":
        if v == 0:  # crates
            for k, (x, y, z, s) in enumerate([(-0.18, 0.1, 0, 0.5), (0.22, -0.12, 0, 0.45), (-0.05, 0.0, 0.5, 0.42)]):
                o = fit(kenney("survival-kit", "box-large", ramp=crate_ramp), height=s)
                o.location.x += x
                o.location.y += y
                o.location.z += z
                o.rotation_euler.z = rnd.uniform(-0.3, 0.3)
                objs.append(o)
        elif v == 1:  # barrels
            for x, y in ((-0.2, 0.15), (0.2, 0.1), (0.0, -0.22)):
                o = fit(kenney("survival-kit", "barrel", ramp=crate_ramp), height=0.8)
                o.location.x += x
                o.location.y += y
                objs.append(o)
        elif v == 2:  # lobster pots
            for x, y, z in ((-0.17, 0.12, 0.0), (0.2, -0.17, 0.0), (0.0, 0.0, 0.42)):
                for o in lobster_pot(rnd):
                    o.location = (o.location.x + x, o.location.y + y, o.location.z + z)
                    objs.append(o)
        else:  # a peat stack: dark turves laid in a rough cone
            turf = toon("peat", ["#24171A", "#3A231F", "#3A2F1E"], 1)
            shapes = []
            for layer in range(5):
                r = 0.38 - 0.06 * layer
                for k in range(6 - layer):
                    a = 2 * math.pi * k / max(1, 6 - layer) + layer * 0.5
                    shapes.append((box, dict(center=(r * math.cos(a) * 0.8, r * math.sin(a) * 0.8, 0.07 + 0.13 * layer),
                                             size=(0.22, 0.11, 0.12))))
            objs.append(mesh("Peat", turf, shapes, outline=True))
    else:
        if v == 0:  # a log stack
            o = fit(kenney("nature-kit", "log_stackLarge", colours={"woodBark": WOOD[2], "woodInner": WOOD[4]}), width=0.9)
            objs.append(o)
        elif v == 1:  # a plank stack
            o = fit(kenney("survival-kit", "resource-planks", ramp=WOOD[2:6]), width=0.85)
            o.scale = (o.scale.x, o.scale.y, o.scale.z * 3)
            objs.append(o)
        elif v == 2:  # crates
            for x, y, z, s in ((-0.18, 0.1, 0, 0.5), (0.2, -0.15, 0, 0.45)):
                o = fit(kenney("survival-kit", "box-large", ramp=crate_ramp), height=s)
                o.location.x += x
                o.location.y += y
                objs.append(o)
        else:  # ore sacks
            sack = toon("sack", ["#5C4A2A", "#80683A", "#9A9083"], 1)
            shapes = [(slab, dict(points=blob(x, y, 0.17, 0.13, [(0.1, 3, rnd.random() * 6)], n=12), z0=z, z1=z + 0.3))
                      for x, y, z in ((-0.15, 0.1, 0), (0.17, -0.05, 0), (0.0, -0.22, 0), (0.0, 0.05, 0.28))]
            objs.append(mesh("Sacks", sack, shapes, outline=True, bevel=0.06))
            objs.append(mesh("Ore", hex_flat("Kit_ore", "#8A4630"), [
                (slab, dict(points=blob(0.0, 0.05, 0.08, 0.06, [], n=8), z0=0.58, z1=0.62))], outline=False))
    return under(root, *objs)


BUILD = {"wall": wall, "cliff": cliff, "tree": tree, "boulder": boulder, "fence": fence, "stack": stack}


def frames():
    """(kind, height) pairs in the frame grammar of SPRITES 10.13, 11 per theme, four variants each."""
    return list(CELLS)


def render_theme(scene, theme: str, out_root: str, only: set[str] | None) -> None:
    sheet = sc.Sheet(out_root, f"iso_kit_{theme}")
    old = os.path.join(sheet.dir, "manifest.json")
    if only and os.path.exists(old):  # a partial run keeps the other frames' entries
        import json

        with open(old) as fh:
            sheet.frames.update(json.load(fh)["frames"])
    for kind, height in frames():
        if only and kind not in only:
            continue
        aw, ah = CELLS[(kind, height)]
        w, h = 2 * aw, 2 * ah
        pivot = (aw, 2 * (ah - 16))
        sc.iso_frame(scene, w, h, pivot)
        for v in range(VARIANTS):
            root = sc.env_root(f"Root_{kind}_{height}_{v}")
            objs = BUILD[kind](theme, height, v, root)
            name = f"{kind}/{height}/{v}"
            sheet.render(scene, name, pivot=False)
            sheet.frames[name].update(cell=[w, h], pivot=list(pivot))
            sc.clear(objs + [root])
    sheet.write()


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser(prog="build_kit.py")
    p.add_argument("--out", required=True)
    p.add_argument("--themes", default="harbour,timber")
    p.add_argument("--only", default="", help="comma list of kinds (wall, cliff, tree, boulder, fence, stack)")
    a = p.parse_args(argv)
    scene = sc.setup()
    only = set(a.only.split(",")) - {""} or None
    for theme in a.themes.split(","):
        render_theme(scene, theme, a.out, only)


if __name__ == "__main__":
    main()
