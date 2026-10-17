"""Render the six ground tilesets (docs/SPRITES.md 8) straight down through the rig.

    python tools/blender/build_tiles.py -- --out build/render
    # -> build/render/tiles/tiles_<biome>_<v>.png, v = 0..3, joined by tools/sprites/images.ts

Stand-ins for the M6 Blender + Photoshop sets (ASSETS.md 6.3): each 64 px variant is one metre of
ground under `TileCam`, built from flat palette shapes on a fixed seed. Every shape is also placed
one metre over in each direction for the lattice sets (cobble, floorboards), whose rows are the same in
every variant; scattered marks stay a margin inside the tile. So every variant tiles with itself and
with the other three.
"""

from __future__ import annotations

import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import static_common as sc  # noqa: E402
from batch_render import render_to  # noqa: E402
from static_common import blob, box, flat, mesh, slab, stroke, toon  # noqa: E402

VARIANTS = 4


def inside(rnd, margin):
    """A point at least `margin` m inside the tile, so a scattered mark never crosses an edge."""
    return rnd.uniform(-0.5 + margin, 0.5 - margin), rnd.uniform(-0.5 + margin, 0.5 - margin)


def wrap(shapes):
    """Each (fn, kwargs) slab shape copied at the eight neighbouring tile offsets."""
    out = []
    for fn, kw in shapes:
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                pts = [(x + dx, y + dy) for x, y in kw["points"]]
                out.append((fn, dict(kw, points=pts)))
    return out


def base(token):
    return [mesh("Base", flat(token), [(box, dict(center=(0, 0, -0.02), size=(3.2, 3.2, 0.04)))], outline=False)]


def grass(rnd):
    blades, specks = [], []
    for _ in range(9):
        cx, cy = inside(rnd, 0.08)
        for k in range(3):
            a = math.pi / 2 + (k - 1) * 0.5 + rnd.uniform(-0.15, 0.15)
            blades.append((slab, dict(points=stroke(cx + 0.03 * math.cos(a), cy + 0.03 * math.sin(a), 0.09, 0.018, a),
                                      z1=0.006)))
    for _ in range(14):
        cx, cy = inside(rnd, 0.08)
        specks.append((slab, dict(points=blob(cx, cy, 0.012, 0.012, [], n=6), z1=0.004)))
    return base("slate") + [mesh("Blades", flat("fog"), blades[:21], outline=False),
                            mesh("BladesTeal", flat("teal"), blades[21:], outline=False),
                            mesh("Specks", flat("ink"), specks, outline=False)]


def path(rnd):
    pebbles, ruts = [], []
    for _ in range(12):
        cx, cy = inside(rnd, 0.06)
        r = rnd.uniform(0.02, 0.045)
        pebbles.append((slab, dict(points=blob(cx, cy, r, r * 0.8, [(0.15, 3, rnd.random())], n=8), z1=0.01)))
    for _ in range(3):
        cx, cy = inside(rnd, 0.1)
        ruts.append((slab, dict(points=stroke(cx, cy, rnd.uniform(0.1, 0.17), 0.02, rnd.uniform(-0.3, 0.3)), z1=0.003)))
    return base("fog") + [mesh("Ruts", flat("slate"), ruts, outline=False),
                          mesh("Pebbles", flat("slate"), pebbles)]


def cobble(rnd):
    stones = []
    n = 3
    for i in range(n):
        for j in range(n):
            off = 0.5 / n if j % 2 else 0.0  # running bond: odd rows shift half a stone
            cx = -0.5 + (i + 0.5) / n + off  # on the lattice: edge stones meet any neighbour variant
            cy = -0.5 + (j + 0.5) / n
            stones.append((slab, dict(points=blob(cx, cy, 0.13, 0.12, [(0.06, 4, rnd.random() * 6)], n=10), z1=0.03)))
    return base("ink") + [mesh("Stones", flat("slate"), wrap(stones))]


def floorboards(rnd):
    planks, grain = [], []
    for j in range(4):  # four 16 px planks; each has one butt joint at a seeded x
        y0, y1 = -0.5 + j * 0.25 + 0.012, -0.5 + (j + 1) * 0.25 - 0.012
        cut = rnd.uniform(-0.5, 0.5)
        planks.append((slab, dict(points=[(cut + 0.012, y0), (cut + 1 - 0.012, y0), (cut + 1 - 0.012, y1),
                                          (cut + 0.012, y1)], z1=0.01)))
        gx = rnd.uniform(-0.45, 0.1)
        grain.append((slab, dict(points=[(gx, (y0 + y1) / 2 - 0.004), (gx + 0.35, (y0 + y1) / 2 - 0.004),
                                         (gx + 0.35, (y0 + y1) / 2 + 0.004), (gx, (y0 + y1) / 2 + 0.004)],
                                 z0=0.01, z1=0.012)))
    return base("ink") + [mesh("Planks", flat("slate"), wrap(planks), outline=False),
                          mesh("Grain", flat("ink"), grain, outline=False)]


def caverock(rnd):
    rocks, moss = [], []
    for _ in range(9):
        cx, cy = inside(rnd, 0.11)
        r = rnd.uniform(0.04, 0.09)
        rocks.append((slab, dict(points=blob(cx, cy, r, r * 0.8, [(0.12, 3, rnd.random() * 6)], n=10), z1=0.03)))
    for _ in range(4):
        cx, cy = inside(rnd, 0.04)
        moss.append((slab, dict(points=blob(cx, cy, 0.018, 0.014, [], n=6), z0=0.03, z1=0.034)))
    return base("ink") + [mesh("Rocks", flat("slate"), rocks),
                          mesh("Moss", flat("teal"), moss, outline=False)]


def forestfloor(rnd):
    leaves, twigs = [], []
    for _ in range(11):
        cx, cy = inside(rnd, 0.13)
        a = rnd.uniform(0, math.pi)
        leaves.append((slab, dict(points=stroke(cx, cy, 0.07, 0.04, a, taper=0.6), z1=0.006)))
    for _ in range(3):
        cx, cy = inside(rnd, 0.13)
        twigs.append((slab, dict(points=stroke(cx, cy, rnd.uniform(0.15, 0.25), 0.014, rnd.uniform(0, math.pi)),
                                 z1=0.008)))
    return base("slate") + [mesh("Leaves", flat("fog"), leaves[:8], outline=False),
                            mesh("LeavesMoon", flat("moon"), leaves[8:], outline=False),
                            mesh("Twigs", flat("ink"), twigs, outline=False)]


BIOMES = {"grass": grass, "path": path, "cobble": cobble, "floorboards": floorboards, "caverock": caverock,
          "forestfloor": forestfloor}


def main() -> None:
    out = os.path.join(sc.args_out(sys.argv, "build_tiles.py"), "tiles")
    os.makedirs(out, exist_ok=True)
    scene = sc.setup()
    sc.tile_cam(scene, 64)
    scene.render.film_transparent = False
    for biome, build in BIOMES.items():
        for v in range(VARIANTS):
            objs = build(random.Random(f"{biome}:{v}"))
            render_to(scene, os.path.join(out, f"tiles_{biome}_{v}.png"))
            sc.clear(objs)
    print(f"tiles: {len(BIOMES)} sets x {VARIANTS} -> {out}")


if __name__ == "__main__":
    main()
